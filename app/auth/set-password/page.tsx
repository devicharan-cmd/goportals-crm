'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { Button } from '@/components/ui/button'
import { Alert, Field } from '@/components/ui/primitives'
import { PasswordInput } from '@/components/auth/PasswordInput'

function SetPasswordForm() {
  const router = useRouter()
  // 'invite' = first-time setup from an invitation, 'recovery' = password reset.
  const isInvite = useSearchParams().get('flow') === 'invite'
  const doneHref = isInvite ? '/login?password-set=1' : '/login?password-updated=1'
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  async function continueToLogin() {
    setLoading(true)
    setError('')
    try {
      const { error } = await createClient().auth.signOut({ scope: 'local' })
      if (error) throw error
      router.replace(doneHref)
      router.refresh()
    } catch {
      setError('Your password was updated, but this recovery session could not be cleared. Retry before continuing.')
      setLoading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) return setError('Password must be at least 8 characters.')
    if (password !== confirm) return setError('Passwords do not match.')
    setLoading(true)
    setError('')
    setSuccess(false)
    let passwordUpdated = false
    try {
      const supabase = createClient()
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) throw sessionError
      if (!session) {
        setError('Your email-link session has expired or is missing. Request a new link and try again.')
        setLoading(false)
        return
      }

      const { error } = await supabase.auth.updateUser({ password })
      if (error) {
        const message = error.message.toLowerCase()
        setError(/session|expired|invalid|token/.test(message)
          ? 'Your email link has expired or was already used. Request a new link and try again.'
          : error.message)
        setLoading(false)
        return
      }

      passwordUpdated = true
      setSuccess(true)
      const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' })
      if (signOutError) {
        setError('Your password was updated, but this recovery session could not be cleared. Retry before continuing.')
        setLoading(false)
        return
      }

      router.replace(doneHref)
      router.refresh()
    } catch {
      setError(passwordUpdated
        ? 'Your password was updated, but this recovery session could not be cleared. Retry before continuing.'
        : 'Unable to update your password right now. Check your connection and try again.')
      setLoading(false)
    }
  }

  return (
    <AuthLayout>
      <h2 className="text-2xl font-bold">Choose your password</h2>
      <p className="mt-1 text-sm text-slate-500">You&apos;ll use this with your email to sign in.</p>
      {success ? (
        <div className="mt-8 space-y-4">
          <Alert tone="success">{isInvite
            ? 'Password set successfully. Please log in with your new password.'
            : 'Password updated successfully. Please log in with your new password.'}</Alert>
          {error && <Alert>{error}</Alert>}
          <Button type="button" size="lg" loading={loading} onClick={continueToLogin} className="w-full">
            Continue to sign in
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          {error && <Alert>{error}</Alert>}
          <Field label="New password" hint="At least 8 characters">
            <PasswordInput required minLength={8} value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" />
          </Field>
          <Field label="Confirm password">
            <PasswordInput required value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password" />
          </Field>
          <Button type="submit" size="lg" loading={loading} className="w-full">Save and continue</Button>
        </form>
      )}
    </AuthLayout>
  )
}

export default function SetPasswordPage() {
  return <Suspense><SetPasswordForm /></Suspense>
}
