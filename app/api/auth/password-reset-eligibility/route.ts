import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const INVITE_PENDING_MESSAGE =
  'This invitation has not been accepted yet. Open the invitation email and set your password using that link. If the link has expired or you cannot find it, contact the person who invited you to send a new invitation.'

export async function POST(req: NextRequest) {
  let email = ''
  try {
    const body = await req.json()
    email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  } catch {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
  }

  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const emailPattern = email.replace(/[\\%_]/g, '\\$&')

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, role, status')
    .ilike('email', emailPattern)
    .maybeSingle()

  if (profileError) {
    console.error('[password-reset-eligibility] Profile lookup failed:', profileError.message)
    return NextResponse.json({ error: 'Unable to check invitation status right now. Try again.' }, { status: 500 })
  }

  const { data: invite, error: inviteError } = await admin
    .from('invites')
    .select('used_at')
    .ilike('email', emailPattern)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (inviteError) {
    console.error('[password-reset-eligibility] Invitation lookup failed:', inviteError.message)
    return NextResponse.json({ error: 'Unable to check invitation status right now. Try again.' }, { status: 500 })
  }

  // Migration 184 keeps new staff profiles pending until the invite link is
  // verified and a password is set. The invite record also catches pending
  // invitations whose profile creation did not finish.
  const staffSetupPending = profile && profile.role !== 'client' && profile.status === 'pending'
  const inviteNotAccepted = Boolean(invite && !invite.used_at)
  if (staffSetupPending || inviteNotAccepted) {
    return NextResponse.json({ eligible: false, message: INVITE_PENDING_MESSAGE })
  }

  return NextResponse.json({ eligible: true })
}
