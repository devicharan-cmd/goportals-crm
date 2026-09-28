import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getProfile } from '@/lib/auth'
import type { AppRole } from '@/types/database'

/**
 * POST /api/admin/invite — super admin (anyone), or manager (employees only).
 *   Staff:  { kind: 'staff',  email, full_name, role, job_title?, department_ids? }
 *   Client: { kind: 'client', email, full_name?, client_id? }
 *           client_id set  → login for an existing (admin-created) client
 *           no client_id   → invite link; the client fills in the onboarding wizard
 *
 * An `invites` row is written first — the handle_new_user DB trigger reads it to give the
 * new login its role. Then Supabase sends the invite email.
 */
export async function POST(req: NextRequest) {
  const me = await getProfile()
  if (!me || me.status !== 'active' || !['super_admin', 'manager'].includes(me.role)) {
    return NextResponse.json({ error: 'Only super admins and managers can send invites' }, { status: 403 })
  }

  const body = await req.json()
  if (me.role === 'manager' && !(body.kind === 'staff' && body.role === 'employee')) {
    return NextResponse.json({ error: 'Managers can only add employees' }, { status: 403 })
  }
  const email = String(body.email ?? '').trim().toLowerCase()
  if (!/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ error: 'Enter a valid email' }, { status: 400 })

  let role: AppRole
  if (body.kind === 'staff') {
    role = body.role
    if (!['super_admin', 'manager', 'employee'].includes(role)) {
      return NextResponse.json({ error: 'Choose a staff role' }, { status: 400 })
    }
  } else if (body.kind === 'client') {
    role = 'client'
  } else {
    return NextResponse.json({ error: 'kind must be staff or client' }, { status: 400 })
  }

  const admin = createAdminClient()

  if (body.client_id) {
    const { data: client } = await admin.from('clients').select('id, owner_id').eq('id', body.client_id).single()
    if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    if (client.owner_id) return NextResponse.json({ error: 'This client already has a login' }, { status: 409 })
  }

  const { data: invite, error: inviteErr } = await admin.from('invites').insert({
    email,
    role,
    full_name:      body.full_name?.trim() || null,
    job_title:      body.kind === 'staff' ? body.job_title?.trim() || null : null,
    department_ids: body.kind === 'staff' ? body.department_ids ?? [] : [],
    client_id:      body.kind === 'client' ? body.client_id ?? null : null,
    invited_by:     me.id,
  }).select('id').single()
  if (inviteErr) return NextResponse.json({ error: inviteErr.message }, { status: 400 })

  const origin = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin
  const { error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: body.full_name?.trim() || '' },
    redirectTo: `${origin}/auth/callback`,
  })

  if (error) {
    await admin.from('invites').delete().eq('id', invite.id)
    const msg = error.message.toLowerCase().includes('already')
      ? 'Someone with this email already has an account.'
      : error.message
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}

/** DELETE /api/admin/invite { id } — cancel an unused invite. */
export async function DELETE(req: NextRequest) {
  const me = await getProfile()
  if (!me || me.role !== 'super_admin' || me.status !== 'active') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { id } = await req.json()
  const { error } = await createAdminClient().from('invites').delete().eq('id', id).is('used_at', null)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
