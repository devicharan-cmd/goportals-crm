import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

async function verifyAdmin() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: member } = await supabase
    .from('team_members')
    .select('id, is_admin')
    .eq('user_id', user.id)
    .single()
  return member?.is_admin ? member : null
}

// GET /api/admin/assignments?client_id=xxx — get assigned member ids for a client
export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get('client_id')
  if (!clientId) return NextResponse.json({ error: 'client_id required' }, { status: 400 })

  const supabase = createClient()
  const { data } = await supabase
    .from('client_assignments')
    .select('member_id')
    .eq('client_id', clientId)

  return NextResponse.json({ memberIds: data?.map(d => d.member_id) ?? [] })
}

// POST /api/admin/assignments — assign a member to a client
export async function POST(req: NextRequest) {
  const admin = await verifyAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const { client_id, member_id } = await req.json()
  const adminClient = createAdminClient()

  const { error } = await adminClient
    .from('client_assignments')
    .upsert({ client_id, member_id }, { onConflict: 'client_id,member_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}

// DELETE /api/admin/assignments — unassign a member from a client
export async function DELETE(req: NextRequest) {
  const admin = await verifyAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const { client_id, member_id } = await req.json()
  const adminClient = createAdminClient()

  const { error } = await adminClient
    .from('client_assignments')
    .delete()
    .eq('client_id', client_id)
    .eq('member_id', member_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
