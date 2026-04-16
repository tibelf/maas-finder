import { createClient } from 'npm:@supabase/supabase-js@2'

/**
 * sync-github-projects — competitor-sourcing rule
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
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
}

const GITHUB_API = 'https://api.github.com'
const PER_PAGE = 30
const MIN_COMPETITOR_HITS = 2        // ≥2 distinct brands required
const FETCH_TIMEOUT_MS   = 10_000    // 10 s per outbound request
const MAX_DIR_ENTRIES    = 200       // cap filename listing to avoid memory bloat

// ── Search queries ───────────────────────────────────────────────────────────
const SEARCH_QUERIES = [
  'ai agent framework llm stars:>500',
  'rag chatbot openai stars:>500',
  'llm application framework stars:>500',
]

// ── Competitor list ──────────────────────────────────────────────────────────
// Domestic MaaS
const DOMESTIC_COMPETITORS = [
  'siliconflow',          // 硅基流动
  'dashscope',            // 阿里云百炼
  'qianfan',              // 百度千帆
  'zhipuai', 'zhipu',     // 智谱 AI
  'minimax',              // MiniMax
  'moonshot',             // 月之暗面 / Kimi
  'volcengine',           // 字节跳动火山引擎
  'lingyiwanwu',          // 零一万物
  'baichuan',             // 百川智能
  'stepfun',              // 阶跃星辰
]

// International tier-2
const INTL_COMPETITORS = [
  'togetherai', 'together.ai',
  'fireworks ai', 'fireworks.ai',
  'openrouter',
  'deepinfra',
  'novita',
  'nousresearch',         // Nous Research portal
  'xiaomi',               // Xiaomi MiMo API platform
]

// Short dot-separated terms that need word-boundary matching to avoid
// false hits in hostnames like amz.ai or myz.ai-client.
const DOTAI_COMPETITORS = ['z.ai']

const ALL_COMPETITORS = [...new Set([
  ...DOMESTIC_COMPETITORS,
  ...INTL_COMPETITORS,
  ...DOTAI_COMPETITORS,
])]

// ── Qiniu exclusion ──────────────────────────────────────────────────────────
const QINIU_TERMS = [
  'qiniu',
  '七牛',
]

// ── Brand canonicalization ───────────────────────────────────────────────────
// Aliases of the same brand count as one hit toward the ≥2 threshold.
function canonicalBrand(term: string): string {
  if (term === 'zhipuai' || term === 'zhipu' || term === 'z.ai') return 'zhipu'
  if (term === 'togetherai' || term === 'together.ai') return 'together'
  if (term === 'fireworks ai' || term === 'fireworks.ai') return 'fireworks'
  return term
}

// ── Word-boundary-aware matching ─────────────────────────────────────────────
// `z.ai` must not match inside hostnames like `amz.ai`. Require a non-alnum
// boundary on both sides.
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

/**
 * Fetch a GitHub API endpoint.
 * - Returns null for expected non-2xx responses (404, etc.).
 * - Throws on 403/429 so rate-limit errors propagate to the caller and abort
 *   the run with a clear error message instead of silently shrinking results.
 * - Returns null (logs warning) on network/timeout errors.
 */
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

/** Fetch raw text from any URL; returns '' on error or timeout. */
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
// Projects like openclaw store their provider list under docs/providers/*.md.
// We list each candidate directory (filenames alone carry the provider name)
// and try to fetch a summary index file (index.md / README.md).

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

    // Cap entries to avoid memory bloat from unusually large directories.
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

    // ── 1. Candidate discovery ───────────────────────────────────────────────
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const allRepos = new Map<number, GitHubRepo>()

    for (const query of SEARCH_QUERIES) {
      const q = `${query} created:>${since}`
      // Rate-limit errors from fetchGitHub propagate here → top-level catch → 500.
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

    for (const repo of allRepos.values()) {
      if (repo.archived) continue

      // Isolate per-repo fetch errors so one bad repo doesn't abort the run.
      let content = ''
      try {
        content = await fetchRepoContent(repo, githubToken)
      } catch (err) {
        console.error(`Error fetching ${repo.full_name}:`, (err as Error).message)
        repoErrors++
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
        continue
      }

      if (hasQiniuAlready(haystack)) {
        qiniuAlreadySkipped++
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

      if (!insertErr) inserted++

      await new Promise(r => setTimeout(r, 100))
    }

    return new Response(JSON.stringify({
      success: true,
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
    // Top-level: catches rate-limit throws from fetchGitHub.
    console.error('Sync error:', error)
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
