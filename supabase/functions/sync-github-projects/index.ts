import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
}

const GITHUB_API = 'https://api.github.com'
const PER_PAGE = 30

const SEARCH_QUERIES = [
  'ai agent framework llm stars:>500',
  'rag chatbot openai stars:>500',
  'llm application framework stars:>500',
]

const EXCLUDED_ORGS = new Set([
  'openai', 'huggingface', 'meta-llama', 'mistralai', 'google-deepmind',
  'google-research', 'facebookresearch', 'nvidia', 'databricks',
  'anthropics', 'cohere-ai', 'allenai', 'EleutherAI', 'stability-ai',
])

const INFRA_KEYWORDS = [
  'model training', 'pre-training', 'fine-tuning', 'model weights',
  'inference engine', 'model serving', 'deep learning framework',
  'diffusion model', 'text-to-image',
]

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
}

function categorize(repo: GitHubRepo): string {
  const text = `${repo.full_name} ${repo.description || ''} ${(repo.topics || []).join(' ')}`.toLowerCase()
  for (const [cat, keywords] of Object.entries(CATEGORY_MAP)) {
    if (keywords.some(k => text.includes(k))) return cat
  }
  return 'tool'
}

function getOwner(fullName: string): string {
  return fullName.split('/')[0].toLowerCase()
}

function isExcluded(repo: GitHubRepo): boolean {
  if (EXCLUDED_ORGS.has(getOwner(repo.full_name))) return true
  const text = `${repo.description || ''}`.toLowerCase()
  return INFRA_KEYWORDS.some(k => text.includes(k))
}

async function fetchGitHub(path: string, token: string): Promise<any> {
  const res = await fetch(`${GITHUB_API}${path}`, {
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'MaaS-Integration-Scanner',
    },
  })
  if (!res.ok) {
    console.error(`GitHub API error ${res.status} for ${path}`)
    return null
  }
  return res.json()
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

    const allRepos = new Map<number, GitHubRepo>()

    for (const query of SEARCH_QUERIES) {
      const data = await fetchGitHub(
        `/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=${PER_PAGE}&page=1`,
        githubToken
      )
      if (data?.items) {
        for (const item of data.items) {
          if (!allRepos.has(item.id)) allRepos.set(item.id, item)
        }
      }
      await new Promise(r => setTimeout(r, 300))
    }

    const rows: any[] = []
    for (const repo of allRepos.values()) {
      if (isExcluded(repo)) continue
      rows.push({
        github_id: repo.id,
        full_name: repo.full_name,
        description: repo.description,
        stars: repo.stargazers_count,
        forks: repo.forks_count,
        language: repo.language,
        topics: repo.topics || [],
        html_url: repo.html_url,
        updated_at: repo.updated_at,
        maas_score: 100,
        maas_signals: {},
        category: categorize(repo),
        last_synced_at: new Date().toISOString(),
      })
    }

    if (rows.length > 0) {
      const { error } = await supabase
        .from('github_projects')
        .upsert(rows, { onConflict: 'github_id' })
      if (error) {
        console.error('Upsert error:', error)
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
    }

    return new Response(JSON.stringify({
      success: true,
      total_found: allRepos.size,
      inserted: rows.length,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('Sync error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
