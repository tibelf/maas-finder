import { createClient } from 'npm:@supabase/supabase-js@2'

/**
 * sync-github-projects-init
 *
 * Full initialization sync — called by pg_cron every 5 minutes.
 * Each invocation processes ONE page (100 repos) of ONE search query,
 * then saves progress. This avoids the 150s Edge Function timeout.
 *
 * Flow:
 *   1. Find the active 'init' sync_job (status = 'running').
 *   2. If none exists, return immediately (cron will keep calling but noop).
 *   3. Fetch one page of one query, run competitor scan.
 *   4. Insert only NEW repos (skip existing github_ids).
 *   5. Advance progress. If all queries + pages are exhausted, mark completed.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
}

const GITHUB_API = 'https://api.github.com'
const PER_PAGE = 100
const MAX_PAGES = 10
const MIN_COMPETITOR_HITS = 2

const SEARCH_QUERIES = [
  'llm agent stars:>500',
  'llm framework stars:>500',
  'llm chatbot stars:>500',
  'rag retrieval stars:>500',
  'llm application stars:>500',
  'llm proxy stars:>500',
  'llm gateway stars:>500',
  'openai compatible stars:>500',
  'llm orchestration stars:>500',
  'llm inference stars:>500',
  'llm wrapper stars:>500',
  'llm router stars:>500',
  'large language model stars:>500',
  'model serving stars:>500',
]

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
]

const INTL_COMPETITORS = [
  'togetherai', 'together.ai',
  'fireworks ai', 'fireworks.ai',
  'openrouter',
  'deepinfra',
  'novita',
]

const ALL_COMPETITORS = [...new Set([...DOMESTIC_COMPETITORS, ...INTL_COMPETITORS])]

function canonicalBrand(term: string): string {
  if (term === 'zhipuai' || term === 'zhipu') return 'zhipu'
  if (term === 'togetherai' || term === 'together.ai') return 'together'
  if (term === 'fireworks ai' || term === 'fireworks.ai') return 'fireworks'
  return term
}

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
      'User-Agent': 'MaaS-Finder-Init',
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
    const res = await fetch(url, { headers: { 'User-Agent': 'MaaS-Finder-Init' } })
    if (!res.ok) return ''
    return await res.text()
  } catch {
    return ''
  }
}

async function fetchRepoContent(repo: GitHubRepo, token: string): Promise<string> {
  const branch = repo.default_branch || 'main'
  const raw = `https://raw.githubusercontent.com/${repo.full_name}/${branch}`

  const readmeMeta = await fetchGitHub(`/repos/${repo.full_name}/readme`, token)
  let readme = ''
  if (readmeMeta?.download_url) {
    readme = await fetchText(readmeMeta.download_url)
  }

  const manifestPaths = ['requirements.txt', 'pyproject.toml', 'package.json', 'go.mod', 'Cargo.toml']
  const manifests = await Promise.all(manifestPaths.map(p => fetchText(`${raw}/${p}`)))

  return [readme.slice(0, 20_000), ...manifests.map(m => m.slice(0, 10_000))].join('\n')
}

function scanCompetitors(haystack: string): { matched_terms: string[]; distinct_brands: string[]; hit_count: number } {
  const text = haystack.toLowerCase()
  const matched_terms = ALL_COMPETITORS.filter(c => text.includes(c.toLowerCase()))
  const distinct_brands = [...new Set(matched_terms.map(canonicalBrand))]
  return { matched_terms, distinct_brands, hit_count: distinct_brands.length }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // ?action=start or x-action: start header — create a new init job record (bypasses client-side RLS)
    const url = new URL(req.url)
    const isStart = url.searchParams.get('action') === 'start' || req.headers.get('x-action') === 'start'
    if (isStart) {
      const { data: existing } = await supabase
        .from('sync_jobs')
        .select('id, status')
        .eq('job_type', 'init')
        .eq('status', 'running')
        .maybeSingle()

      if (existing) {
        return new Response(JSON.stringify({ already_running: true, job_id: existing.id }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const { data: newJob, error: createErr } = await supabase
        .from('sync_jobs')
        .insert({ job_type: 'init', status: 'running' })
        .select()
        .single()

      if (createErr) throw createErr

      return new Response(JSON.stringify({ started: true, job_id: newJob.id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const githubToken = Deno.env.get('GITHUB_TOKEN')
    if (!githubToken) {
      return new Response(JSON.stringify({ error: 'GITHUB_TOKEN not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Find active init job
    const { data: job, error: jobErr } = await supabase
      .from('sync_jobs')
      .select('*')
      .eq('job_type', 'init')
      .eq('status', 'running')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (jobErr) throw jobErr

    if (!job) {
      return new Response(JSON.stringify({ noop: true, reason: 'no active init job' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const queryIndex: number = job.current_query_index
    const page: number = job.current_page

    // All done?
    if (queryIndex >= SEARCH_QUERIES.length) {
      await supabase.from('sync_jobs').update({
        status: 'completed',
        finished_at: new Date().toISOString(),
      }).eq('id', job.id)

      return new Response(JSON.stringify({ completed: true, job_id: job.id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const query = SEARCH_QUERIES[queryIndex]

    // Fetch one page of candidates
    const data = await fetchGitHub(
      `/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=${PER_PAGE}&page=${page}`,
      githubToken
    )

    const items: GitHubRepo[] = data?.items ?? []
    const totalCount: number = data?.total_count ?? 0

    let batchScanned = 0
    let batchInserted = 0

    for (const repo of items) {
      if (repo.archived) continue

      const content = await fetchRepoContent(repo, githubToken)
      batchScanned++

      const haystack = [repo.description || '', (repo.topics || []).join(' '), content].join('\n')
      const match = scanCompetitors(haystack)

      if (match.hit_count < MIN_COMPETITOR_HITS) continue

      // Check if already exists
      const { data: existing } = await supabase
        .from('github_projects')
        .select('id')
        .eq('github_id', repo.id)
        .maybeSingle()

      if (existing) continue

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

      if (!insertErr) batchInserted++

      await new Promise(r => setTimeout(r, 100))
    }

    // Advance progress
    const hasMorePages = items.length === PER_PAGE && page < MAX_PAGES && totalCount > page * PER_PAGE
    const nextQueryIndex = hasMorePages ? queryIndex : queryIndex + 1
    const nextPage = hasMorePages ? page + 1 : 1
    const isFinished = nextQueryIndex >= SEARCH_QUERIES.length

    await supabase.from('sync_jobs').update({
      current_query_index: nextQueryIndex,
      current_page: nextPage,
      total_scanned: job.total_scanned + batchScanned,
      total_inserted: job.total_inserted + batchInserted,
      ...(isFinished ? { status: 'completed', finished_at: new Date().toISOString() } : {}),
    }).eq('id', job.id)

    return new Response(JSON.stringify({
      job_id: job.id,
      query,
      page,
      batch_scanned: batchScanned,
      batch_inserted: batchInserted,
      total_scanned: job.total_scanned + batchScanned,
      total_inserted: job.total_inserted + batchInserted,
      next_query_index: nextQueryIndex,
      next_page: nextPage,
      completed: isFinished,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('Init sync error:', error)
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
