import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: NextRequest) {
  let email = ''
  try {
    const body = await request.json()
    email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  } catch {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
  }

  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
  }

  const emailPattern = email.replace(/[\\%_]/g, '\\$&')
  const { data, error } = await createAdminClient()
    .from('profiles')
    .select('id')
    .ilike('email', emailPattern)
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[account-exists] Profile lookup failed:', error.message)
    return NextResponse.json({ error: 'Unable to verify the account right now.' }, { status: 500 })
  }

  return NextResponse.json({ exists: Boolean(data) })
}
