'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { Button } from '@/components/ui/button'
import { Alert, Field } from '@/components/ui/primitives'
import { useSingleFlight } from '@/components/shared/useSingleFlight'
import { authEmailCallbackUrl } from '@/lib/auth-email-flow'

export default function ForgotPasswordPage() {
  const runOnce = useSingleFlight()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSent(false)
    try {
      const normalizedEmail = email.trim().toLowerCase()
      const eligibilityResponse = await fetch('/api/auth/password-reset-eligibility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail }),
      })
      const eligibility = await eligibilityResponse.json()
      if (!eligibilityResponse.ok) {
        setError(eligibility.error || 'Unable to check invitation status right now. Try again.')
        return
      }
      if (!eligibility.eligible) {
        setError(eligibility.message)
        return
      }

      // Use an implicit recovery link: a PKCE verifier started on localhost
      // cannot be read by the callback on the live website.
      const recoveryClient = createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { flowType: 'implicit', autoRefreshToken: false, persistSession: false } },
      )
      const { error } = await recoveryClient.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: authEmailCallbackUrl('recovery'),
      })
      if (error) setError(error.message)
      else setSent(true)
    } catch {
      setError('Unable to send a reset link right now. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <h2 className="text-2xl font-bold">Reset your password</h2>
      <p className="mt-1 text-sm text-slate-500">We&apos;ll email you a link to set a new password.</p>
      <form onSubmit={event => void runOnce('password-reset-email', () => handleSubmit(event))} className="mt-8 space-y-4">
        {error && <Alert>{error}</Alert>}
        {sent && (
          <Alert tone="success">
            If an account exists for {email.trim()}, a reset link is on its way. Use the newest email only; requesting another link invalidates older ones.
          </Alert>
        )}
        <Field label="Email">
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={e => {
              setEmail(e.target.value)
              setSent(false)
              setError('')
            }}
            className="form-field"
          />
        </Field>
        <Button type="submit" size="lg" loading={loading} className="w-full">
          {sent ? 'Send another reset link' : 'Send reset link'}
        </Button>
      </form>
      <p className="mt-8 text-center text-sm">
        <Link href="/login" className="font-semibold text-[#045E80]">Back to sign in</Link>
      </p>
    </>
  )
}
