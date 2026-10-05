import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Client accepts the current agreement. Runs server-side so we can record IP + user agent.
export async function POST(req: NextRequest) {
  const { agreement_id } = await req.json()
  if (!agreement_id) return NextResponse.json({ error: 'agreement_id is required' }, { status: 400 })

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.ip ?? null
  const { data, error } = await supabase.rpc('accept_agreement', {
    p_agreement_id: agreement_id,
    p_ip: ip,
    p_user_agent: req.headers.get('user-agent'),
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ status: data })
}
