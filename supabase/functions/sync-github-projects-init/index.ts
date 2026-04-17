import { createClient } from 'npm:@supabase/supabase-js@2'

/**
 * sync-github-projects-init
 *
 * Full initialization sync — called by pg_cron every 5 minutes.
 * Each invocation processes ONE page (100 repos) of ONE search query,
 * then saves progress. This avoids the 150s Edge Function timeout.
 *
 * Star range segmentation:
 *   - First run: searches stars:>500 (no upper bound)
 *   - Subsequent runs: searches stars:>500 stars:<{prev_min_stars_seen}
 *   - This ensures each init covers a new star range, avoiding duplicates
 *
 * Flow:
 *   1. Find the active 'init' sync_job (status = 'running').
 *   2. If none exists, return immediately (cron will keep calling but noop).
 *   3. Fetch one page of one query (with dynamic star range), run competitor scan.
 *   4. Insert only NEW repos (skip existing github_ids).
 *   5. Write per-repo logs to sync_repo_logs.
 *   6. Update min_stars_seen if we saw lower stars this batch.
 *   7. Advance progress. If all queries + pages are exhausted, mark completed.
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
const MIN_STARS = 500

const BASE_SEARCH_QUERIES = [
  'llm agent',
  'llm framework',
  'llm chatbot',
  'rag retrieval',
  'llm application',
  'llm proxy',
  'llm gateway',
  'openai compatible',
  'llm orchestration',
  'llm inference',
  'llm wrapper',
  'llm router',
  'large language model',
  'model serving',
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

const QINIU_TERMS = ['qiniu', '七牛']

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

function buildSearchQueries(maxStars: number | null): string[] {
  return BASE_SEARCH_QUERIES.map(base => {
    if (maxStars !== null) {
      return `${base} stars:>${MIN_STARS} stars:<${maxStars}`
    }
    return `${base} stars:>${MIN_STARS}`
  })
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

function hasQiniuAlready(haystack: string): boolean {
  const lower = haystack.toLowerCase()
  return QINIU_TERMS.some(t => lower.includes(t.toLowerCase()))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // ?action=start — create a new init job record
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

      // Determine max_stars for this run: lowest min_stars_seen from all completed init jobs
      const { data: prevJobs } = await supabase
        .from('sync_jobs')
        .select('min_stars_seen')
        .eq('job_type', 'init')
        .eq('status', 'completed')
        .not('min_stars_seen', 'is', null)
        .order('min_stars_seen', { ascending: true })
        .limit(1)

      const maxStars: number | null = prevJobs && prevJobs.length > 0 ? prevJobs[0].min_stars_seen : null
      const searchQueries = buildSearchQueries(maxStars)

      const { data: newJob, error: createErr } = await supabase
        .from('sync_jobs')
        .insert({
          job_type: 'init',
          status: 'running',
          max_stars: maxStars,
          search_queries: searchQueries,
          competitor_list: ALL_COMPETITORS,
          min_competitor_hits: MIN_COMPETITOR_HITS,
        })
        .select()
        .single()

      if (createErr) throw createErr

      return new Response(JSON.stringify({ started: true, job_id: newJob.id, max_stars: maxStars }), {
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

    // Resolve max_stars and build search queries for this job
    const jobMaxStars: number | null = job.max_stars ?? null
    const searchQueries = (job.search_queries && job.search_queries.length > 0)
      ? job.search_queries
      : buildSearchQueries(jobMaxStars)

    // Back-fill search_queries if this job was created before logging was added
    if (!job.search_queries || job.search_queries.length === 0) {
      await supabase.from('sync_jobs').update({
        search_queries: searchQueries,
        competitor_list: ALL_COMPETITORS,
        min_competitor_hits: MIN_COMPETITOR_HITS,
      }).eq('id', job.id)
    }

    const queryIndex: number = job.current_query_index
    const page: number = job.current_page

    // All done?
    if (queryIndex >= searchQueries.length) {
      await supabase.from('sync_jobs').update({
        status: 'completed',
        finished_at: new Date().toISOString(),
      }).eq('id', job.id)

      return new Response(JSON.stringify({ completed: true, job_id: job.id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const query = searchQueries[queryIndex]

    // Fetch one page of candidates
    const data = await fetchGitHub(
      `/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=${PER_PAGE}&page=${page}`,
      githubToken
    )

    const items: GitHubRepo[] = data?.items ?? []
    const totalCount: number = data?.total_count ?? 0

    let batchScanned = 0
    let batchInserted = 0
    let batchAccepted = 0
    let batchRejected = 0
    let batchSkippedExisting = 0
    let batchSkippedQiniu = 0
    let batchErrors = 0
    let batchMinStars: number | null = null

    const repoLogs: Array<{
      sync_job_id: string
      repo_full_name: string
      github_id: number
      stars: number
      language: string | null
      search_query: string
      result: string
      reject_reason: string | null
      matched_terms: string[]
      distinct_brands: string[]
      hit_count: number
    }> = []

    for (const repo of items) {
      // Track minimum stars seen in this batch
      if (batchMinStars === null || repo.stargazers_count < batchMinStars) {
        batchMinStars = repo.stargazers_count
      }

      if (repo.archived) {
        repoLogs.push({
          sync_job_id: job.id,
          repo_full_name: repo.full_name,
          github_id: repo.id,
          stars: repo.stargazers_count,
          language: repo.language,
          search_query: query,
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
        batchErrors++
        repoLogs.push({
          sync_job_id: job.id,
          repo_full_name: repo.full_name,
          github_id: repo.id,
          stars: repo.stargazers_count,
          language: repo.language,
          search_query: query,
          result: 'error',
          reject_reason: (err as Error).message,
          matched_terms: [],
          distinct_brands: [],
          hit_count: 0,
        })
        continue
      }

      batchScanned++

      const haystack = [repo.description || '', (repo.topics || []).join(' '), content].join('\n')
      const match = scanCompetitors(haystack)

      if (match.hit_count < MIN_COMPETITOR_HITS) {
        batchRejected++
        repoLogs.push({
          sync_job_id: job.id,
          repo_full_name: repo.full_name,
          github_id: repo.id,
          stars: repo.stargazers_count,
          language: repo.language,
          search_query: query,
          result: 'rejected',
          reject_reason: 'low_hits',
          matched_terms: match.matched_terms,
          distinct_brands: match.distinct_brands,
          hit_count: match.hit_count,
        })
        continue
      }

      if (hasQiniuAlready(haystack)) {
        batchSkippedQiniu++
        repoLogs.push({
          sync_job_id: job.id,
          repo_full_name: repo.full_name,
          github_id: repo.id,
          stars: repo.stargazers_count,
          language: repo.language,
          search_query: query,
          result: 'skipped_qiniu',
          reject_reason: null,
          matched_terms: match.matched_terms,
          distinct_brands: match.distinct_brands,
          hit_count: match.hit_count,
        })
        continue
      }

      batchAccepted++

      // Check if already exists
      const { data: existing } = await supabase
        .from('github_projects')
        .select('id')
        .eq('github_id', repo.id)
        .maybeSingle()

      if (existing) {
        batchSkippedExisting++
        repoLogs.push({
          sync_job_id: job.id,
          repo_full_name: repo.full_name,
          github_id: repo.id,
          stars: repo.stargazers_count,
          language: repo.language,
          search_query: query,
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
        batchInserted++
        repoLogs.push({
          sync_job_id: job.id,
          repo_full_name: repo.full_name,
          github_id: repo.id,
          stars: repo.stargazers_count,
          language: repo.language,
          search_query: query,
          result: 'accepted',
          reject_reason: null,
          matched_terms: match.matched_terms,
          distinct_brands: match.distinct_brands,
          hit_count: match.hit_count,
        })
      }

      await new Promise(r => setTimeout(r, 100))
    }

    // Flush repo logs in one batch
    if (repoLogs.length > 0) {
      await supabase.from('sync_repo_logs').insert(repoLogs)
    }

    // Update min_stars_seen: keep the lowest value seen across all batches
    const currentMinStars: number | null = job.min_stars_seen ?? null
    let updatedMinStars: number | null = currentMinStars
    if (batchMinStars !== null) {
      updatedMinStars = currentMinStars === null ? batchMinStars : Math.min(currentMinStars, batchMinStars)
    }

    // Advance progress
    const hasMorePages = items.length === PER_PAGE && page < MAX_PAGES && totalCount > page * PER_PAGE
    const nextQueryIndex = hasMorePages ? queryIndex : queryIndex + 1
    const nextPage = hasMorePages ? page + 1 : 1
    const isFinished = nextQueryIndex >= searchQueries.length

    await supabase.from('sync_jobs').update({
      current_query_index: nextQueryIndex,
      current_page: nextPage,
      total_scanned: job.total_scanned + batchScanned,
      total_inserted: job.total_inserted + batchInserted,
      total_accepted: (job.total_accepted ?? 0) + batchAccepted,
      total_rejected: (job.total_rejected ?? 0) + batchRejected,
      total_skipped_existing: (job.total_skipped_existing ?? 0) + batchSkippedExisting,
      total_skipped_qiniu: (job.total_skipped_qiniu ?? 0) + batchSkippedQiniu,
      total_errors: (job.total_errors ?? 0) + batchErrors,
      min_stars_seen: updatedMinStars,
      ...(isFinished ? { status: 'completed', finished_at: new Date().toISOString() } : {}),
    }).eq('id', job.id)

    return new Response(JSON.stringify({
      job_id: job.id,
      query,
      page,
      max_stars: jobMaxStars,
      batch_scanned: batchScanned,
      batch_inserted: batchInserted,
      batch_accepted: batchAccepted,
      batch_rejected: batchRejected,
      batch_skipped_existing: batchSkippedExisting,
      batch_skipped_qiniu: batchSkippedQiniu,
      batch_errors: batchErrors,
      batch_min_stars: batchMinStars,
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
