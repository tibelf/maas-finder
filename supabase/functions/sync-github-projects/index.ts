import { createClient } from 'npm:@supabase/supabase-js@2'

/**
 * sync-github-projects — competitor-sourcing rule (incremental / weekly)
 *
 * Methodology: instead of accumulating weak LLM-provider signals, we search
 * the repo's README + dependency manifests + description for names of known
 * MaaS competitors (SiliconFlow, DashScope, Moonshot, OpenRouter, …).
 *
 * The presence of these names implies:
 *   1. The project maintains a named provider registry (otherwise it couldn't
 *      integrate a specific competitor).
 *   2. The project accepts non-tier-1 providers (so Qiniu MaaS can be added
 *      alongside them).
 *
 * Patches learned from small-scale validation on a 276-sample ground truth:
 *   - Noise terms removed: `ark` (markdown/benchmark overlap), `spark`
 *     (Apache Spark / `:sparkling_heart:`), `perplexity` (NLP metric +
 *     algorithm metaphor), `together ai` (spaced — hits liteLLM doc links),
 *     `anyscale` (only in code comments), `bigmodel` (Claude Code tutorial
 *     noise).
 *   - Require ≥2 distinct competitor brands for inclusion (Leader-proposed).
 *   - Exclude repos already mentioning Qiniu (already integrated, not a target).
 *
 * Each run creates a sync_jobs record (job_type='incremental') and writes
 * per-repo processing results to sync_repo_logs for full traceability.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
}

const GITHUB_API = 'https://api.github.com'
const PER_PAGE = 30
const MIN_COMPETITOR_HITS = 2
const FETCH_TIMEOUT_MS   = 30_000
const MAX_DIR_ENTRIES    = 200

// ── Search queries ───────────────────────────────────────────────────────────
const SEARCH_QUERIES = [
  'ai agent framework llm stars:>500',
  'rag chatbot openai stars:>500',
  'llm application framework stars:>500',
]

// ── Competitor list ──────────────────────────────────────────────────────────
const DOMESTIC_COMPETITORS = [
  'siliconflow',
  'dashscope',
  'qianfan',
  'zhipuai', 'zhipu',
  'minimax',
  'moonshot',
  'volcengine',
  'lingyiwanwu',
  'baichuan',
  'stepfun',
]

const INTL_COMPETITORS = [
  'togetherai', 'together.ai',
  'fireworks ai', 'fireworks.ai',
  'openrouter',
  'deepinfra',
  'novita',
  'nousresearch',
  'xiaomi',
]

const DOTAI_COMPETITORS = ['z.ai']

const ALL_COMPETITORS = [...new Set([
  ...DOMESTIC_COMPETITORS,
  ...INTL_COMPETITORS,
  ...DOTAI_COMPETITORS,
])]

// ── Qiniu exclusion ──────────────────────────────────────────────────────────
const QINIU_TERMS = ['qiniu', '七牛']

// ── Brand canonicalization ───────────────────────────────────────────────────
function canonicalBrand(term: string): string {
  if (term === 'zhipuai' || term === 'zhipu' || term === 'z.ai') return 'zhipu'
  if (term === 'togetherai' || term === 'together.ai') return 'together'
  if (term === 'fireworks ai' || term === 'fireworks.ai') return 'fireworks'
  return term
}

// ── Word-boundary-aware matching ─────────────────────────────────────────────
const BOUNDARY_TERMS = new Set(DOTAI_COMPETITORS.map(t => t.toLowerCase()))

function matchesTerm(haystack: string, term: string): boolean {
  const t = term.toLowerCase()
  if (!BOUNDARY_TERMS.has(t)) {
    return haystack.includes(t)
  }
  const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, 'i').test(haystack)
}

// ── Category mapping ─────────────────────────────────────────────────────────
const CATEGORY_MAP: Record<string, string[]> = {
  agent: ['agent', 'autonomous', 'auto-gpt', 'crew', 'swarm', 'autogen'],
  framework: ['framework', 'sdk', 'library', 'toolkit'],
  chatbot: ['chatbot', 'chat', 'conversational', 'assistant', 'copilot'],
  rag: ['rag', 'retrieval', 'vector', 'embedding', 'knowledge-base'],
  tool: ['tool', 'gateway', 'proxy', 'workflow', 'pipeline', 'router'],
}

interface GitHubRepo {
  id: number
  full_name: string
  description: string | null
  stargazers_count: number
  forks_count: number
  language: string | null
  topics: string[]
  html_url: string
  updated_at: string
  default_branch?: string
  archived?: boolean
}

function categorize(repo: GitHubRepo): string {
  const text = `${repo.full_name} ${repo.description || ''} ${(repo.topics || []).join(' ')}`.toLowerCase()
  for (const [cat, keywords] of Object.entries(CATEGORY_MAP)) {
    if (keywords.some(k => text.includes(k))) return cat
  }
  return 'tool'
}

// ── HTTP helpers ─────────────────────────────────────────────────────────────

function makeAbortSignal(): AbortSignal {
  return AbortSignal.timeout(FETCH_TIMEOUT_MS)
}

async function fetchGitHub(path: string, token: string): Promise<any> {
  let res: Response
  try {
    res = await fetch(`${GITHUB_API}${path}`, {
      signal: makeAbortSignal(),
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'MaaS-Finder-CompetitorScan',
      },
    })
  } catch (err) {
    console.warn(`fetchGitHub network error for ${path}:`, (err as Error).message)
    return null
  }

  if (res.status === 403 || res.status === 429) {
    const reset = res.headers.get('x-ratelimit-reset')
    throw new Error(
      `GitHub rate limit hit (${res.status}) for ${path}. Reset at: ${reset ?? 'unknown'}`
    )
  }

  if (!res.ok) return null
  return res.json()
}

async function fetchText(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      signal: makeAbortSignal(),
      headers: { 'User-Agent': 'MaaS-Finder-CompetitorScan' },
    })
    if (!res.ok) return ''
    return await res.text()
  } catch {
    return ''
  }
}

// ── Provider-directory scanning ──────────────────────────────────────────────

const PROVIDER_DIR_CANDIDATES = [
  'docs/providers',
  'docs/llm-providers',
  'providers',
  'src/providers',
  'packages/providers',
]

const PROVIDER_INDEX_NAMES = ['index.md', 'README.md']

async function fetchProviderDirs(repo: GitHubRepo, token: string): Promise<string> {
  const branch = repo.default_branch || 'main'
  const raw = `https://raw.githubusercontent.com/${repo.full_name}/${branch}`
  const parts: string[] = []

  for (const dir of PROVIDER_DIR_CANDIDATES) {
    const listing = await fetchGitHub(
      `/repos/${repo.full_name}/contents/${dir}?ref=${branch}`,
      token
    )
    if (!Array.isArray(listing)) continue

    const filenames = listing
      .slice(0, MAX_DIR_ENTRIES)
      .map((f: { name: string }) => f.name)
      .join(' ')
    parts.push(filenames)

    for (const indexName of PROVIDER_INDEX_NAMES) {
      const indexText = await fetchText(`${raw}/${dir}/${indexName}`)
      if (indexText) {
        parts.push(indexText.slice(0, 15_000))
        break
      }
    }
  }

  return parts.join('\n')
}

// ── Content fetcher ──────────────────────────────────────────────────────────

async function fetchRepoContent(repo: GitHubRepo, token: string): Promise<string> {
  const branch = repo.default_branch || 'main'
  const raw = `https://raw.githubusercontent.com/${repo.full_name}/${branch}`

  const readmeMeta = await fetchGitHub(`/repos/${repo.full_name}/readme`, token)
  let readme = ''
  if (readmeMeta?.download_url) {
    readme = await fetchText(readmeMeta.download_url)
  }

  const manifestPaths = [
    'requirements.txt',
    'pyproject.toml',
    'package.json',
    'go.mod',
    'Cargo.toml',
  ]
  const manifests = await Promise.all(
    manifestPaths.map(p => fetchText(`${raw}/${p}`))
  )

  const providerDirs = await fetchProviderDirs(repo, token)

  return [
    readme.slice(0, 20_000),
    ...manifests.map(m => m.slice(0, 10_000)),
    providerDirs,
  ].join('\n')
}

// ── Competitor scanner ───────────────────────────────────────────────────────

interface CompetitorMatch {
  matched_terms: string[]
  distinct_brands: string[]
  hit_count: number
}

function scanCompetitors(haystack: string): CompetitorMatch {
  const lower = haystack.toLowerCase()
  const matched_terms = ALL_COMPETITORS.filter(c => matchesTerm(lower, c))
  const distinct_brands = [...new Set(matched_terms.map(canonicalBrand))]
  return { matched_terms, distinct_brands, hit_count: distinct_brands.length }
}

function hasQiniuAlready(haystack: string): boolean {
  const lower = haystack.toLowerCase()
  return QINIU_TERMS.some(t => lower.includes(t.toLowerCase()))
}

// ── Edge Function ────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders })
  }

  try {
    // ── Env validation ───────────────────────────────────────────────────────
    const githubToken = Deno.env.get('GITHUB_TOKEN')
    if (!githubToken) {
      return new Response(JSON.stringify({ error: 'GITHUB_TOKEN not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !supabaseKey) {
      return new Response(
        JSON.stringify({ error: 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    // ── Create job record ────────────────────────────────────────────────────
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

    const { data: jobRecord, error: jobCreateErr } = await supabase
      .from('sync_jobs')
      .insert({
        job_type: 'incremental',
        status: 'running',
        search_queries: SEARCH_QUERIES.map(q => `${q} created:>${since}`),
        time_window_since: since,
        competitor_list: ALL_COMPETITORS,
        min_competitor_hits: MIN_COMPETITOR_HITS,
      })
      .select('id')
      .single()

    if (jobCreateErr) throw jobCreateErr
    const jobId: string = jobRecord.id

    // ── 1. Candidate discovery ───────────────────────────────────────────────
    const allRepos = new Map<number, GitHubRepo>()

    for (const query of SEARCH_QUERIES) {
      const q = `${query} created:>${since}`
      const data = await fetchGitHub(
        `/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=${PER_PAGE}&page=1`,
        githubToken
      )
      if (data?.items) {
        for (const item of data.items) {
          if (!allRepos.has(item.id)) allRepos.set(item.id, item)
        }
      }
      await new Promise(r => setTimeout(r, 300))
    }

    // ── 2. Per-repo scanning ─────────────────────────────────────────────────
    let scanned = 0
    let accepted = 0
    let skippedExisting = 0
    let singleHitRejected = 0
    let qiniuAlreadySkipped = 0
    let repoErrors = 0
    let inserted = 0

    const repoLogs: Array<{
      sync_job_id: string
      repo_full_name: string
      github_id: number
      stars: number
      language: string | null
      search_query: null
      result: string
      reject_reason: string | null
      matched_terms: string[]
      distinct_brands: string[]
      hit_count: number
    }> = []

    for (const repo of allRepos.values()) {
      if (repo.archived) {
        repoLogs.push({
          sync_job_id: jobId,
          repo_full_name: repo.full_name,
          github_id: repo.id,
          stars: repo.stargazers_count,
          language: repo.language,
          search_query: null,
          result: 'skipped_archived',
          reject_reason: null,
          matched_terms: [],
          distinct_brands: [],
          hit_count: 0,
        })
        continue
      }

      let content = ''
      try {
        content = await fetchRepoContent(repo, githubToken)
      } catch (err) {
        console.error(`Error fetching ${repo.full_name}:`, (err as Error).message)
        repoErrors++
        repoLogs.push({
          sync_job_id: jobId,
          repo_full_name: repo.full_name,
          github_id: repo.id,
          stars: repo.stargazers_count,
          language: repo.language,
          search_query: null,
          result: 'error',
          reject_reason: (err as Error).message,
          matched_terms: [],
          distinct_brands: [],
          hit_count: 0,
        })
        continue
      }

      scanned++

      const haystack = [
        repo.description || '',
        (repo.topics || []).join(' '),
        content,
      ].join('\n')

      const match = scanCompetitors(haystack)

      if (match.hit_count < MIN_COMPETITOR_HITS) {
        if (match.hit_count === 1) singleHitRejected++
        repoLogs.push({
          sync_job_id: jobId,
          repo_full_name: repo.full_name,
          github_id: repo.id,
          stars: repo.stargazers_count,
          language: repo.language,
          search_query: null,
          result: 'rejected',
          reject_reason: 'low_hits',
          matched_terms: match.matched_terms,
          distinct_brands: match.distinct_brands,
          hit_count: match.hit_count,
        })
        continue
      }

      if (hasQiniuAlready(haystack)) {
        qiniuAlreadySkipped++
        repoLogs.push({
          sync_job_id: jobId,
          repo_full_name: repo.full_name,
          github_id: repo.id,
          stars: repo.stargazers_count,
          language: repo.language,
          search_query: null,
          result: 'skipped_qiniu',
          reject_reason: null,
          matched_terms: match.matched_terms,
          distinct_brands: match.distinct_brands,
          hit_count: match.hit_count,
        })
        continue
      }

      accepted++

      const { data: existing } = await supabase
        .from('github_projects')
        .select('id')
        .eq('github_id', repo.id)
        .maybeSingle()

      if (existing) {
        skippedExisting++
        repoLogs.push({
          sync_job_id: jobId,
          repo_full_name: repo.full_name,
          github_id: repo.id,
          stars: repo.stargazers_count,
          language: repo.language,
          search_query: null,
          result: 'skipped_existing',
          reject_reason: null,
          matched_terms: match.matched_terms,
          distinct_brands: match.distinct_brands,
          hit_count: match.hit_count,
        })
        continue
      }

      const { error: insertErr } = await supabase.from('github_projects').insert({
        github_id: repo.id,
        full_name: repo.full_name,
        description: repo.description,
        stars: repo.stargazers_count,
        forks: repo.forks_count,
        language: repo.language,
        topics: repo.topics || [],
        html_url: repo.html_url,
        updated_at: repo.updated_at,
        maas_score: match.hit_count,
        maas_signals: {
          rule: 'competitor-sourcing',
          min_hits: MIN_COMPETITOR_HITS,
          matched_terms: match.matched_terms,
          distinct_brands: match.distinct_brands,
        },
        category: categorize(repo),
        last_synced_at: new Date().toISOString(),
      })

      if (!insertErr) {
        inserted++
        repoLogs.push({
          sync_job_id: jobId,
          repo_full_name: repo.full_name,
          github_id: repo.id,
          stars: repo.stargazers_count,
          language: repo.language,
          search_query: null,
          result: 'accepted',
          reject_reason: null,
          matched_terms: match.matched_terms,
          distinct_brands: match.distinct_brands,
          hit_count: match.hit_count,
        })
      }

      await new Promise(r => setTimeout(r, 100))
    }

    // ── Flush repo logs ──────────────────────────────────────────────────────
    if (repoLogs.length > 0) {
      await supabase.from('sync_repo_logs').insert(repoLogs)
    }

    // ── Complete job record ──────────────────────────────────────────────────
    await supabase.from('sync_jobs').update({
      status: 'completed',
      finished_at: new Date().toISOString(),
      total_scanned: scanned,
      total_inserted: inserted,
      total_accepted: accepted,
      total_rejected: singleHitRejected,
      total_skipped_existing: skippedExisting,
      total_skipped_qiniu: qiniuAlreadySkipped,
      total_errors: repoErrors,
    }).eq('id', jobId)

    return new Response(JSON.stringify({
      success: true,
      job_id: jobId,
      since,
      total_found: allRepos.size,
      scanned,
      accepted,
      single_hit_rejected: singleHitRejected,
      qiniu_already_skipped: qiniuAlreadySkipped,
      skipped_existing: skippedExisting,
      repo_errors: repoErrors,
      inserted,
      rule: 'competitor-sourcing',
      min_competitor_hits: MIN_COMPETITOR_HITS,
      competitor_list: ALL_COMPETITORS,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Sync error:', error)
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
