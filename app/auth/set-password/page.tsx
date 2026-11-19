'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { Button } from '@/components/ui/button'
import { Alert, Field } from '@/components/ui/primitives'
import { PasswordInput } from '@/components/auth/PasswordInput'
import { useSingleFlight } from '@/components/shared/useSingleFlight'

function SetPasswordForm() {
  const router = useRouter()
  const runOnce = useSingleFlight()
  // 'invite' = first-time setup from an invitation, 'recovery' = password reset.
  const flow = useSearchParams().get('flow')
  const isInvite = flow === 'invite'
  const isRecovery = flow === 'recovery'
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isInvite && !isRecovery) {
      setError('Open the secure link from your GoPortals email to continue.')
      return
    }
    if (password.length < 8) return setError('Password must be at least 8 characters.')
    if (password !== confirm) return setError('Passwords do not match.')
    setLoading(true)
    setError('')
    try {
      const supabase = createClient()
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) throw sessionError
      if (!session) {
        setError(isInvite
          ? 'This invitation link has expired or is missing. Ask the person who invited you to send a new invitation.'
          : 'This password reset link has expired or is missing. Request a new reset email and try again.')
        setLoading(false)
        return
      }

      const { error } = await supabase.auth.updateUser({ password })
      if (error) {
        const message = error.message.toLowerCase()
        setError(/session|expired|invalid|token/.test(message)
          ? (isInvite
            ? 'This invitation link has expired or was already used. Ask the person who invited you to send a new invitation.'
            : 'This password reset link has expired or was already used. Request a new reset email and try again.')
          : error.message)
        setLoading(false)
        return
      }

      // Only invitation acceptance completes an invite. Password recovery must
      // never activate an account or consume a pending invitation.
      if (isInvite) {
        const { error: inviteSetupError } = await supabase.rpc('complete_invite_setup')
        if (inviteSetupError) {
          setError('Your password was saved, but your invitation could not be completed. Contact the person who invited you.')
          setLoading(false)
          return
        }
      }

      // End the one-time email session and make the next action clear: sign in
      // with the password just created or updated.
      await supabase.auth.signOut()
      window.location.replace(isInvite ? '/login?password-set=1' : '/login?password-updated=1')
    } catch {
      setError('Unable to set your password right now. Check your connection and try again.')
      setLoading(false)
    }
  }

  return (
    <AuthLayout>
      <h2 className="text-2xl font-bold">
        {isInvite ? 'Create your password' : isRecovery ? 'Reset your password' : 'Password link problem'}
      </h2>
      {(isInvite || isRecovery) && <p className="mt-1 text-sm text-slate-500">
        {isInvite
          ? 'Create a password for your invited account. You’ll sign in after setup.'
          : 'Choose a new password for your GoPortals account.'}
      </p>}

      {!isInvite && !isRecovery ? (
        <div className="mt-6 space-y-4">
          <Alert>This page only works from a valid invitation or password reset email.</Alert>
          <Link href="/login" className="inline-block text-sm font-semibold text-[#045E80]">Back to sign in</Link>
        </div>
      ) : (
        <>
      <form onSubmit={event => void runOnce('set-password', () => handleSubmit(event))} className="mt-8 space-y-4">
        {error && <Alert>{error}</Alert>}
        {error && !isInvite && /password reset link/i.test(error) && (
          <Link href="/forgot-password" className="inline-block text-sm font-semibold text-[#045E80]">
            Request a new password reset email
          </Link>
        )}
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
            : (isInvite ? 'Create password' : 'Save new password')}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm"><Link href="/login" className="font-semibold text-[#045E80]">Back to sign in</Link></p>
        </>
      )}
    </AuthLayout>
  )
}

export default function SetPasswordPage() {
  return <Suspense><SetPasswordForm /></Suspense>
}
