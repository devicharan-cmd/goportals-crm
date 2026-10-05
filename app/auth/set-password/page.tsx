'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { Button } from '@/components/ui/button'
import { Alert, Field } from '@/components/ui/primitives'
import { PasswordInput } from '@/components/auth/PasswordInput'

export default function SetPasswordPage() {
  const router = useRouter()
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
    const { error } = await createClient().auth.updateUser({ password })
    if (error) {
      setError(error.message.includes('session') ? 'Your link has expired. Please request a new one.' : error.message)
      setLoading(false)
      return
    }
    router.replace('/')
    router.refresh()
  }

  return (
    <AuthLayout>
      <h2 className="text-2xl font-bold">Choose your password</h2>
      <p className="mt-1 text-sm text-slate-500">You&apos;ll use this with your email to sign in.</p>
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
    </AuthLayout>
  )
}
