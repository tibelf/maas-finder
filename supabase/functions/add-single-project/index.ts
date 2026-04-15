import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
}

const GITHUB_API = 'https://api.github.com'

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: '未授权' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: '请先登录' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const body = await req.json()
    const { repo_path } = body as { repo_path: string }

    if (!repo_path || !/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repo_path)) {
      return new Response(JSON.stringify({ error: '请提供有效的仓库路径，格式为 owner/repo' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const githubToken = Deno.env.get('GITHUB_TOKEN')
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'MaaS-Integration-Scanner',
    }
    if (githubToken) {
      headers['Authorization'] = `token ${githubToken}`
    }

    const res = await fetch(`${GITHUB_API}/repos/${repo_path}`, { headers })

    if (res.status === 404) {
      return new Response(JSON.stringify({ error: '找不到该 GitHub 仓库，请确认路径是否正确' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    if (!res.ok) {
      return new Response(JSON.stringify({ error: `GitHub API 请求失败 (${res.status})` }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const repo: GitHubRepo = await res.json()

    const row = {
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
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey)

    const { data: existing } = await adminClient
      .from('github_projects')
      .select('id, full_name')
      .eq('github_id', repo.id)
      .maybeSingle()

    const { error: upsertError } = await adminClient
      .from('github_projects')
      .upsert(row, { onConflict: 'github_id' })

    if (upsertError) {
      return new Response(JSON.stringify({ error: upsertError.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({
      success: true,
      already_existed: !!existing,
      project: {
        full_name: repo.full_name,
        stars: repo.stargazers_count,
        category: row.category,
      },
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
