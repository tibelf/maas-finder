import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
}

const GITHUB_API = 'https://api.github.com'

interface PrRecord {
  id: string
  pr_url: string
  pr_number: number | null
}

function parsePrUrl(prUrl: string): { owner: string; repo: string; number: number } | null {
  try {
    const u = new URL(prUrl)
    const match = u.pathname.match(/^\/([^/]+)\/([^/]+)\/pull\/(\d+)/)
    if (!match) return null
    return { owner: match[1], repo: match[2], number: parseInt(match[3], 10) }
  } catch {
    return null
  }
}

async function fetchPrStatus(
  owner: string,
  repo: string,
  prNumber: number,
  token: string
): Promise<{ merged: boolean; closed: boolean } | null> {
  try {
    const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/pulls/${prNumber}`, {
      headers: {
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'MaaS-Finder-PRCheck',
      },
    })
    if (res.status === 404) {
      return null
    }
    if (!res.ok) {
      console.error(`GitHub API error ${res.status} for ${owner}/${repo}/pull/${prNumber}`)
      return null
    }
    const data = await res.json()
    return {
      merged: !!data.merged_at,
      closed: data.state === 'closed',
    }
  } catch (e) {
    console.error(`Fetch error for ${owner}/${repo}/pull/${prNumber}:`, e)
    return null
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders })
  }

  try {
    const githubToken = Deno.env.get('GITHUB_TOKEN')
    if (!githubToken) {
      return new Response(JSON.stringify({ error: 'GITHUB_TOKEN not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const { data: pendingClaims, error: fetchErr } = await supabase
      .from('project_claims')
      .select('id, pr_url, pr_number')
      .eq('status', 'pr_submitted')
      .not('pr_url', 'is', null)

    if (fetchErr) {
      return new Response(JSON.stringify({ error: fetchErr.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const records = (pendingClaims || []) as PrRecord[]
    let checked = 0
    let merged = 0
    let failed = 0

    for (const record of records) {
      if (!record.pr_url) continue

      const parsed = parsePrUrl(record.pr_url)
      if (!parsed) {
        console.warn(`Cannot parse PR URL: ${record.pr_url}`)
        failed++
        continue
      }

      const status = await fetchPrStatus(parsed.owner, parsed.repo, parsed.number, githubToken)
      checked++

      if (status?.merged) {
        const { error: updateErr } = await supabase
          .from('project_claims')
          .update({
            status: 'merged',
            updated_at: new Date().toISOString(),
          })
          .eq('id', record.id)

        if (updateErr) {
          console.error(`Failed to update claim ${record.id}:`, updateErr)
          failed++
        } else {
          merged++
        }
      }

      await new Promise((r) => setTimeout(r, 200))
    }

    return new Response(
      JSON.stringify({
        success: true,
        total_pending: records.length,
        checked,
        merged,
        failed,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('check-pr-status error:', error)
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
