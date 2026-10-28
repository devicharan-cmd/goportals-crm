'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Alert, Field } from '@/components/ui/primitives'
import { PasswordInput } from '@/components/auth/PasswordInput'

function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const passwordUpdated = params.get('password-updated') === '1'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(
    params.get('error') === 'no_profile' ? 'Your account is not set up yet. Please contact GoPortals.' : '',
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const supabase = createClient()
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setError(error.message === 'Invalid login credentials' ? 'Wrong email or password.' : error.message)
        setLoading(false)
        return
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .maybeSingle()

      if (profileError || !profile) {
        setError(profileError ? 'Unable to load your account. Please try again.' : 'Your account is not set up yet. Please contact GoPortals.')
        setLoading(false)
        return
      }

      router.replace(profile.role === 'client' ? '/portal' : '/dashboard')
    } catch {
      setError('Unable to sign in right now. Check your connection and try again.')
      setLoading(false)
    }
  }

  return (
    <>
      <h2 className="text-2xl font-bold">Welcome back</h2>
      <p className="mt-1 text-sm text-slate-500">Sign in to your GoPortals workspace.</p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        {passwordUpdated && <Alert tone="success">Password updated successfully. Please log in with your new password.</Alert>}
        {error && <Alert>{error}</Alert>}
        <Field label="Email">
          <input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)}
                 className="input" placeholder="you@company.com" />
        </Field>
        <Field label="Password">
          <PasswordInput required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} />
        </Field>
        <div className="flex justify-end">
          <Link href="/forgot-password" className="text-sm font-medium text-brand-600 hover:text-brand-700">Forgot password?</Link>
        </div>
        <Button type="submit" size="lg" loading={loading} className="w-full">
          {loading ? 'Signing in' : 'Sign in'}
        </Button>
      </form>

      <p className="mt-8 text-center text-sm text-slate-500">
        New brand? Contact GoPortals and we&apos;ll send you an invite.
      </p>
    </>
  )
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>
}
