import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getProfile } from '@/lib/auth'
import { authEmailCallbackUrl } from '@/lib/auth-email-flow'
import type { AppRole } from '@/types/database'

/**
 * POST /api/admin/invite — super admin (any role), or admin (team_lead/employee only).
 *   Staff:  { kind: 'staff',  email, full_name, role, reporting_to, job_title?, department_ids? }
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
  super_admin: ['super_admin', 'manager', 'team_lead', 'employee'],
  manager:       ['team_lead', 'employee'],
}

function inviteApiError(message: string) {
  if (message.toLowerCase().includes('invalid api key')) {
    return 'The server Supabase admin key is invalid or belongs to a different project. In Vercel, set SUPABASE_SERVICE_ROLE_KEY to this project’s service_role key, matching NEXT_PUBLIC_SUPABASE_URL, then redeploy.'
  }
  return message
}

export async function POST(req: NextRequest) {
  const me = await getProfile()
  if (!me || me.status !== 'active' || !ROLES_INVITABLE_BY[me.role]) {
    return NextResponse.json({ error: 'Only super admins and managers can send invites' }, { status: 403 })
  }

  const body = await req.json()
  const email = String(body.email ?? '').trim().toLowerCase()
  if (!/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ error: 'Enter a valid email' }, { status: 400 })

  const fullName = typeof body.full_name === 'string' ? body.full_name.trim() : ''
  const jobTitle = typeof body.job_title === 'string' ? body.job_title.trim() : ''
  let role: AppRole
  if (body.kind === 'staff') {
    if (!fullName) return NextResponse.json({ error: 'Enter the team member’s full name' }, { status: 400 })
    if (!jobTitle) return NextResponse.json({ error: 'Enter a job title' }, { status: 400 })
    if (!['super_admin', 'manager', 'team_lead', 'employee'].includes(body.role)) {
      return NextResponse.json({ error: 'Select a valid role' }, { status: 400 })
    }
    role = body.role
    if (!ROLES_INVITABLE_BY[me.role]!.includes(role)) {
      return NextResponse.json({ error: 'You are not allowed to invite someone with that role' }, { status: 403 })
    }
  } else if (body.kind === 'client') {
    role = 'client'
  } else {
    return NextResponse.json({ error: 'kind must be staff or client' }, { status: 400 })
  }

  const adminUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!adminUrl || !serviceRoleKey) {
    console.error('[invite] Missing Supabase server configuration:', {
      urlConfigured: Boolean(adminUrl),
      serviceRoleKeyConfigured: Boolean(serviceRoleKey),
    })
    return NextResponse.json({ error: 'Invite service is not configured. Check the Supabase server environment variables in Vercel.' }, { status: 500 })
  }

  const admin = createAdminClient()

  let reportingTo: string | null = null
  if (body.kind === 'staff' && role !== 'super_admin') {
    if (typeof body.reporting_to !== 'string' || !body.reporting_to) {
      return NextResponse.json({ error: 'Select a Reporting To person' }, { status: 400 })
    }

    const { data: reportingPerson, error: reportingPersonError } = await admin
      .from('profiles')
      .select('id, email, role, status')
      .eq('id', body.reporting_to)
      .maybeSingle()
    if (reportingPersonError) {
      console.error('[invite] Could not validate the Reporting To person:', reportingPersonError.message)
      return NextResponse.json({ error: 'Could not validate the Reporting To person.' }, { status: 500 })
    }
    if (!reportingPerson || reportingPerson.role === 'client' || reportingPerson.status !== 'active') {
      return NextResponse.json({ error: 'Select an active staff member as the Reporting To person.' }, { status: 400 })
    }
    if (reportingPerson.email.toLowerCase() === email) {
      return NextResponse.json({ error: 'A person cannot report to themselves.' }, { status: 400 })
    }
    reportingTo = reportingPerson.id
  } else if (body.kind === 'staff' && body.reporting_to) {
    return NextResponse.json({ error: 'Super Admin invitations cannot have a Reporting To person.' }, { status: 400 })
  }

  if (body.client_id) {
    const { data: client } = await admin.from('clients').select('id, owner_id').eq('id', body.client_id).single()
    if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    if (client.owner_id) return NextResponse.json({ error: 'This client already has a login' }, { status: 409 })
  }

  // Check profiles before creating an invite row or calling Auth. Supabase Auth's
  // duplicate-email response varies by configuration; profiles are created for every
  // registered account by handle_new_user(). Escape ILIKE wildcards in valid emails.
  const emailPattern = email.replace(/[\\%_]/g, '\\$&')
  const { data: existingProfile, error: profileLookupError } = await admin
    .from('profiles').select('id').ilike('email', emailPattern).limit(1).maybeSingle()
  if (profileLookupError) {
    console.error('[invite] Could not check for an existing profile:', profileLookupError.message)
    return NextResponse.json({ error: 'Could not check whether this email already has an account.' }, { status: 500 })
  }
  if (existingProfile) return NextResponse.json({ error: 'Someone with this email address already has an account.' }, { status: 409 })

  const { data: invite, error: inviteErr } = await admin.from('invites').insert({
    email,
    role,
    reporting_to: body.kind === 'staff' ? reportingTo : null,
    full_name:      fullName || null,
    job_title:      body.kind === 'staff' ? jobTitle : null,
    department_ids: body.kind === 'staff' ? body.department_ids ?? [] : [],
    client_id:      body.kind === 'client' ? body.client_id ?? null : null,
    invited_by:     me.id,
  }).select('id').single()
  if (inviteErr) return NextResponse.json({ error: inviteApiError(inviteErr.message) }, { status: 400 })

  const { error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName },
    redirectTo: authEmailCallbackUrl('invite'),
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
        : inviteApiError(error.message || 'Something went wrong sending the invite.')
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}

/** DELETE /api/admin/invite { id } — reject an unaccepted invite and remove its pending login. */
export async function DELETE(req: NextRequest) {
  const me = await getProfile()
  if (!me || me.role !== 'super_admin' || me.status !== 'active') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { id } = await req.json()
  if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: 'Invalid invitation.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: invite, error: inviteError } = await admin.from('invites')
    .select('id, email, role, used_at, cancelled_at, created_at').eq('id', id).maybeSingle()
  if (inviteError) return NextResponse.json({ error: 'Could not load the invitation.' }, { status: 500 })
  if (!invite) return NextResponse.json({ error: 'Invitation not found.' }, { status: 404 })
  if (invite.used_at) return NextResponse.json({ error: 'Accepted invitations cannot be removed here.' }, { status: 409 })

  const emailPattern = invite.email.replace(/[\\%_]/g, '\\$&')
  const { data: profiles, error: profileError } = await admin.from('profiles')
    .select('id, email, role, status, created_at').ilike('email', emailPattern).limit(2)
  if (profileError) return NextResponse.json({ error: 'Could not verify the pending account.' }, { status: 500 })
  if ((profiles ?? []).length > 1) return NextResponse.json({ error: 'More than one account matches this email. No account was removed.' }, { status: 409 })
  const profile = profiles?.[0]
  if (profile && (profile.status !== 'pending' || profile.role !== invite.role || profile.created_at < invite.created_at)) {
    return NextResponse.json({ error: 'This invitation is linked to another account state. No account was removed.' }, { status: 409 })
  }

  // Exclude the invite from complete_invite_setup() before deleting Auth.
  // A cancelled row remains visible for retry if a later cleanup step fails.
  if (!invite.cancelled_at) {
    const { data: cancelled, error: cancelError } = await admin.from('invites')
      .update({ cancelled_at: new Date().toISOString() })
      .eq('id', id).is('used_at', null).is('cancelled_at', null).select('id').maybeSingle()
    if (cancelError) return NextResponse.json({ error: 'Could not cancel the invitation.' }, { status: 500 })
    if (!cancelled) return NextResponse.json({ error: 'The invitation was accepted or changed. Refresh and try again.' }, { status: 409 })
  }

  if (profile) {
    const { data: authAccount, error: authLookupError } = await admin.auth.admin.getUserById(profile.id)
    if (authLookupError || authAccount.user?.email?.toLowerCase() !== invite.email.toLowerCase()) {
      return NextResponse.json({ error: 'Could not verify the pending login. The invitation is cancelled; retry cleanup later.' }, { status: 500 })
    }
    const { error: authDeleteError } = await admin.auth.admin.deleteUser(profile.id)
    if (authDeleteError) {
      console.error('[invite] Could not delete pending Auth user:', authDeleteError.message)
      return NextResponse.json({ error: 'The invitation is cancelled, but the pending account could not be removed. Try Reject again.' }, { status: 500 })
    }
    const { data: remainingProfile, error: verifyError } = await admin.from('profiles')
      .select('id').eq('id', profile.id).maybeSingle()
    if (verifyError || remainingProfile) {
      return NextResponse.json({ error: 'The pending account could not be fully removed. Try Reject again.' }, { status: 500 })
    }
  }

  const { data: deleted, error: deleteError } = await admin.from('invites')
    .delete().eq('id', id).is('used_at', null).select('id').maybeSingle()
  if (deleteError || !deleted) return NextResponse.json({ error: 'The pending account was removed, but its invitation remains. Try Reject again.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
