import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getProfile } from '@/lib/auth'
import type { AppRole } from '@/types/database'

/**
 * POST /api/admin/invite — super admin (any role), or admin (team_lead/employee only).
 *   Staff:  { kind: 'staff',  email, full_name, role, job_title?, department_ids? }
 *   Client: { kind: 'client', email, full_name?, client_id? }
 *           client_id set  → login for an existing (admin-created) client
 *           no client_id   → invite link; the client fills in the onboarding wizard
 *
 * An `invites` row is written first — the handle_new_user DB trigger reads it to give the
 * new login its role. Then Supabase sends the invite email — its content/branding is set
 * in the Supabase Dashboard (Authentication → Emails → Invite user), and to lift the
 * "team members only" + rate-limit restriction on Supabase's default sender, configure
 * Custom SMTP there (Authentication → Settings → SMTP Settings) using Resend.
 */
const ROLES_INVITABLE_BY: Partial<Record<AppRole, AppRole[]>> = {
  super_admin: ['super_admin', 'admin', 'team_lead', 'employee'],
  admin:       ['team_lead', 'employee'],
}

export async function POST(req: NextRequest) {
  const me = await getProfile()
  if (!me || me.status !== 'active' || !ROLES_INVITABLE_BY[me.role]) {
    return NextResponse.json({ error: 'Only super admins and admins can send invites' }, { status: 403 })
  }

  const body = await req.json()
  const email = String(body.email ?? '').trim().toLowerCase()
  if (!/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ error: 'Enter a valid email' }, { status: 400 })

  let role: AppRole
  if (body.kind === 'staff') {
    role = body.role
    if (!ROLES_INVITABLE_BY[me.role]!.includes(role)) {
      return NextResponse.json({ error: 'You are not allowed to invite someone with that role' }, { status: 403 })
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
    console.error('[invite] Supabase refused the invite:', error.status, error.message)
    const raw = (error.message || '').toLowerCase()
    const msg = raw.includes('already')
      ? 'Someone with this email address already has an account.'
      : raw.includes('not authorized')
        ? 'Supabase\'s built-in email only sends to your Supabase team members. Set up Custom SMTP (e.g. Resend) in Supabase → Authentication → Settings → SMTP Settings to invite anyone.'
        : raw.includes('rate limit')
          ? 'Too many emails sent recently (Supabase limit). Wait an hour, or set up Custom SMTP in Supabase.'
          : error.status && error.status >= 500
            ? 'Supabase could not send the email (a blank server error) — this almost always means your Custom SMTP send itself failed. Check Authentication → Settings → SMTP Settings, and make sure the sender domain is verified in Resend (Resend → Domains).'
            : error.message || 'Something went wrong sending the invite.'
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
