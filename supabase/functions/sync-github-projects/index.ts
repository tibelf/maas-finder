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
 *   - NEW patch (from Leader discussion): require ≥2 distinct competitor
 *     hits for inclusion. A single hit is too noisy (router/gateway comparison
 *     tables, first-party SDKs, doc-only mentions all trigger single hits).
 *     Requiring two independent competitor names filters most of these out.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
}

const GITHUB_API = 'https://api.github.com'
const PER_PAGE = 30
const MIN_COMPETITOR_HITS = 2   // ≥2 rule

// ── Search queries ───────────────────────────────────────────────────────────
// Kept broad: competitor rule does the actual filtering downstream.
const SEARCH_QUERIES = [
  'ai agent framework llm stars:>500',
  'rag chatbot openai stars:>500',
  'llm application framework stars:>500',
]

// ── Competitor list (17 terms, 14 canonical brands) ──────────────────────────
// Domestic MaaS — strongest signal: these brands simply don't appear unless
// the project has explicit multi-provider support.
const DOMESTIC_COMPETITORS = [
  'siliconflow',    // 硅基流动
  'dashscope',      // 阿里云百炼
  'qianfan',        // 百度千帆
  'zhipuai', 'zhipu', // 智谱 AI
  'minimax',        // MiniMax
  'moonshot',       // 月之暗面 / Kimi
  'volcengine',     // 字节跳动火山引擎
  'lingyiwanwu',    // 零一万物
  'baichuan',       // 百川智能
]

// International tier-2 — presence implies the project accepts non-OpenAI/
// non-Anthropic providers.
const INTL_COMPETITORS = [
  'togetherai', 'together.ai',   // Together AI (no spaced form)
  'fireworks ai', 'fireworks.ai',
  'openrouter',
  'deepinfra',
  'novita',
  'nousresearch',                // Nous Research portal
  'xiaomi',                      // Xiaomi MiMo API platform
  'z.ai',                        // Z.AI / GLM (智谱国际品牌)
  'stepfun',                     // 阶跃星辰
]

const ALL_COMPETITORS = [...new Set([
  ...DOMESTIC_COMPETITORS,
  ...INTL_COMPETITORS,
])]

// ── Qiniu exclusion list ─────────────────────────────────────────────────────
// If the project already mentions Qiniu MaaS by name, it is already integrated
// and is not a new outreach target. Both the ASCII brand name and the Chinese
// characters are checked since community projects may use either form.
const QINIU_TERMS = [
  'qiniu',   // official romanization used in SDK names, docs, URLs
  '七牛',    // Chinese brand name (appears in README of Chinese-first projects)
]

// Brand canonicalization — `zhipuai` + `zhipu` both map to "zhipu", so they
// only count once toward the ≥2 threshold.
function canonicalBrand(term: string): string {
  if (term === 'zhipuai' || term === 'zhipu' || term === 'z.ai') return 'zhipu'
  if (term === 'togetherai' || term === 'together.ai') return 'together'
  if (term === 'fireworks ai' || term === 'fireworks.ai') return 'fireworks'
  return term
}

// ── Category mapping (unchanged) ────────────────────────────────────────────
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

async function fetchGitHub(path: string, token: string): Promise<any> {
  const res = await fetch(`${GITHUB_API}${path}`, {
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'MaaS-Finder-CompetitorScan',
    },
  })
  if (!res.ok) {
    console.error(`GitHub API error ${res.status} for ${path}`)
    return null
  }
  return res.json()
}

async function fetchText(url: string): Promise<string> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'MaaS-Finder-CompetitorScan' } })
    if (!res.ok) return ''
    return await res.text()
  } catch {
    return ''
  }
}

/**
 * Common provider directory paths to probe. For each path we:
 *   1. List the directory via GitHub Contents API → extract filenames
 *      (e.g. "minimax.md" → contributes "minimax" to the haystack)
 *   2. Try to fetch a well-known index file inside the same directory
 *      (index.md / README.md) which often lists all providers in one place.
 *
 * Only paths that return HTTP 200 contribute anything; 404s are silently
 * skipped. At most 1 API call per candidate path (listing), plus 1 raw
 * fetch for the index file — cheap relative to the README fetch.
 */
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
    // 1. List directory — filenames alone are enough for competitor matching.
    const listing = await fetchGitHub(
      `/repos/${repo.full_name}/contents/${dir}?ref=${branch}`,
      token
    )
    if (!Array.isArray(listing)) continue   // 404 or not a directory

    const filenames = listing.map((f: { name: string }) => f.name).join(' ')
    parts.push(filenames)

    // 2. Try to fetch a known index file inside the directory.
    for (const indexName of PROVIDER_INDEX_NAMES) {
      const indexText = await fetchText(`${raw}/${dir}/${indexName}`)
      if (indexText) {
        parts.push(indexText.slice(0, 15_000))
        break   // one index file per directory is enough
      }
    }
  }

  return parts.join('\n')
}

/**
 * Fetch README + dependency manifests + provider directory hints.
 * Sizes are capped per-file to keep latency and memory in check.
 */
async function fetchRepoContent(repo: GitHubRepo, token: string): Promise<string> {
  const branch = repo.default_branch || 'main'
  const raw = `https://raw.githubusercontent.com/${repo.full_name}/${branch}`

  // README via GitHub API (handles README.md, README.rst, etc.)
  const readmeMeta = await fetchGitHub(`/repos/${repo.full_name}/readme`, token)
  let readme = ''
  if (readmeMeta?.download_url) {
    readme = await fetchText(readmeMeta.download_url)
  }

  // Dependency manifests — try common filenames, ignore 404s silently.
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

  // Provider directory filenames + index files.
  const providerDirs = await fetchProviderDirs(repo, token)

  return [
    readme.slice(0, 20_000),
    ...manifests.map(m => m.slice(0, 10_000)),
    providerDirs,
  ].join('\n')
}

interface CompetitorMatch {
  matched_terms: string[]   // raw terms matched (e.g. ['zhipuai', 'zhipu'])
  distinct_brands: string[] // canonicalized unique brands (e.g. ['zhipu'])
  hit_count: number         // = distinct_brands.length
}

function scanCompetitors(haystack: string): CompetitorMatch {
  const text = haystack.toLowerCase()
  const matched_terms = ALL_COMPETITORS.filter(c => text.includes(c.toLowerCase()))
  const distinct_brands = [...new Set(matched_terms.map(canonicalBrand))]
  return {
    matched_terms,
    distinct_brands,
    hit_count: distinct_brands.length,
  }
}

/**
 * Returns true if the project already mentions Qiniu by name, meaning it has
 * been integrated and should NOT be surfaced as a new outreach candidate.
 */
function hasQiniuAlready(haystack: string): boolean {
  const lower = haystack.toLowerCase()
  return QINIU_TERMS.some(t => lower.includes(t.toLowerCase()))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders })
  }

  try {
    const githubToken = Deno.env.get('GITHUB_TOKEN')
    if (!githubToken) {
      return new Response(JSON.stringify({ error: 'GITHUB_TOKEN not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

        // ── 1. Candidate discovery — only repos created in last 7 days ──────────
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
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

    // ── 2. For each candidate, fetch README + manifests and run competitor scan ─
    let scanned = 0
    let accepted = 0
    let skippedExisting = 0
    let singleHitRejected = 0
    let qiniuAlreadySkipped = 0
    let inserted = 0

    for (const repo of allRepos.values()) {
      if (repo.archived) continue

      const content = await fetchRepoContent(repo, githubToken)
      scanned++

      const haystack = [
        repo.description || '',
        (repo.topics || []).join(' '),
        content,
      ].join('\n')

      const match = scanCompetitors(haystack)

      // ≥2 distinct competitor brands required (Leader-proposed patch).
      if (match.hit_count < MIN_COMPETITOR_HITS) {
        if (match.hit_count === 1) singleHitRejected++
        continue
      }

      // Exclude projects that already mention Qiniu — already integrated,
      // not a new outreach target.
      if (hasQiniuAlready(haystack)) {
        qiniuAlreadySkipped++
        continue
      }

      accepted++

      // Only insert new projects — skip any already in the database.
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
      inserted,
      rule: 'competitor-sourcing',
      min_competitor_hits: MIN_COMPETITOR_HITS,
      competitor_list: ALL_COMPETITORS,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('Sync error:', error)
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
