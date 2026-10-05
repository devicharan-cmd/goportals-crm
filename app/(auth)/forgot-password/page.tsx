'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Alert, Field } from '@/components/ui/primitives'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await createClient().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/auth/set-password`,
    })
    setLoading(false)
    if (error) setError(error.message)
    else setSent(true)
  }

  return (
    <>
      <h2 className="text-2xl font-bold">Reset your password</h2>
      <p className="mt-1 text-sm text-slate-500">We&apos;ll email you a link to set a new password.</p>
      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        {error && <Alert>{error}</Alert>}
        {sent && <Alert tone="success">If an account exists for {email}, a reset link is on its way.</Alert>}
        <Field label="Email">
          <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="input" />
        </Field>
        <Button type="submit" size="lg" loading={loading} className="w-full">Send reset link</Button>
      </form>
      <p className="mt-8 text-center text-sm">
        <Link href="/login" className="font-semibold text-brand-600">Back to sign in</Link>
      </p>
    </>
  )
}
