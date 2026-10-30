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
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) return setError('Password must be at least 8 characters.')
    if (password !== confirm) return setError('Passwords do not match.')
    setLoading(true)
    setError('')
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

      // Password set successfully and user's session is active.
      // Redirect directly into their workspace without kicking them out to the login screen.
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .maybeSingle()

      const targetUrl = profile?.role === 'client' ? '/portal' : '/dashboard'
      window.location.href = targetUrl
    } catch {
      setError('Unable to set your password right now. Check your connection and try again.')
      setLoading(false)
    }
  }

  return (
    <AuthLayout>
      <h2 className="text-2xl font-bold">
        {isInvite ? 'Set your password' : 'Reset your password'}
      </h2>
      <p className="mt-1 text-sm text-slate-500">
        {isInvite
          ? 'Welcome to GoPortals! Create a password to activate your account.'
          : 'Enter a new password for your GoPortals account.'}
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        {error && <Alert>{error}</Alert>}
        <Field label={isInvite ? 'Password' : 'New password'} hint="At least 8 characters">
          <PasswordInput
            required
            minLength={8}
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="new-password"
            placeholder={isInvite ? 'Create a password' : 'Enter new password'}
          />
        </Field>
        <Field label={isInvite ? 'Confirm password' : 'Confirm new password'}>
          <PasswordInput
            required
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            autoComplete="new-password"
            placeholder={isInvite ? 'Confirm your password' : 'Confirm new password'}
          />
        </Field>
        <Button type="submit" size="lg" loading={loading} className="w-full">
          {loading
            ? (isInvite ? 'Activating account…' : 'Updating password…')
            : (isInvite ? 'Set password and continue' : 'Update password')}
        </Button>
      </form>
    </AuthLayout>
  )
}

export default function SetPasswordPage() {
  return <Suspense><SetPasswordForm /></Suspense>
}
