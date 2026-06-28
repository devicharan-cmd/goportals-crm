import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

async function verifyAdmin() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: member } = await supabase
    .from('team_members').select('id, is_admin').eq('user_id', user.id).single()
  return member?.is_admin ? member : null
}

// POST — create a portal user for a client
export async function POST(req: NextRequest) {
  const admin = await verifyAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const { client_id, email, name } = await req.json()
  if (!client_id || !email) {
    return NextResponse.json({ error: 'client_id and email are required' }, { status: 400 })
  }

  const adminClient = createAdminClient()

  // Invite user with client role metadata
  const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email, {
    data: {
      name,
      role: 'client',
      client_id,
    },
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://agency-crm-gilt-sigma.vercel.app'}/portal/dashboard`,
  })

  if (error && !error.message.includes('already been registered')) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true, userId: data?.user?.id })
}
