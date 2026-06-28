import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

// Verify the caller is an admin
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

// POST /api/admin/team — add a new member (invite via Supabase Auth)
export async function POST(req: NextRequest) {
  const admin = await verifyAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const { name, email, role, department, weekly_capacity_hours } = await req.json()
  if (!name || !email || !role) {
    return NextResponse.json({ error: 'name, email, and role are required' }, { status: 400 })
  }

  const adminClient = createAdminClient()

  // Invite the user — they'll get an email to set their password
  const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
    data: { name },
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://agency-crm-gilt-sigma.vercel.app'}/dashboard`,
  })

  if (inviteError) {
    // If user already exists, that's OK — just create the team_members row
    if (!inviteError.message.includes('already been registered')) {
      return NextResponse.json({ error: inviteError.message }, { status: 400 })
    }
  }

  // Create the team_members row
  const { data: member, error: memberError } = await adminClient
    .from('team_members')
    .insert({
      name,
      email,
      role,
      department: department || null,
      weekly_capacity_hours: weekly_capacity_hours ?? 40,
      user_id: inviteData?.user?.id ?? null,
      is_active: true,
      is_admin: false,
    })
    .select()
    .single()

  if (memberError) {
    return NextResponse.json({ error: memberError.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true, member })
}

// PATCH /api/admin/team — update a member (deactivate, toggle admin, etc.)
export async function PATCH(req: NextRequest) {
  const admin = await verifyAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const { id, ...updates } = await req.json()
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  // Only allow safe fields
  const allowed = ['is_active', 'is_admin', 'role', 'weekly_capacity_hours', 'department']
  const safe = Object.fromEntries(
    Object.entries(updates).filter(([k]) => allowed.includes(k))
  )

  const adminClient = createAdminClient()
  const { data, error } = await adminClient
    .from('team_members')
    .update(safe)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true, member: data })
}
