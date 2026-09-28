'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { MailCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Alert, Field } from '@/components/ui/primitives'
import { PasswordInput } from '@/components/auth/PasswordInput'

export default function SignupPage() {
  const router = useRouter()
  const [form, setForm] = useState({ full_name: '', email: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (form.password.length < 8) return setError('Password must be at least 8 characters.')
    setLoading(true)
    setError('')
    const { data, error } = await createClient().auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        data: { full_name: form.full_name },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    setLoading(false)
    if (error) return setError(error.message)
    // Email confirmation on → no session yet; off → go straight to onboarding.
    if (data.session) {
      router.push('/onboarding')
      router.refresh()
    } else {
      setSent(true)
    }
  }

  if (sent) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-lime-50 text-lime-600">
          <MailCheck className="h-7 w-7" />
        </div>
        <h2 className="text-2xl font-bold">Check your email</h2>
        <p className="mt-2 text-sm text-slate-500">
          We sent a confirmation link to <span className="font-medium text-slate-800">{form.email}</span>.
          Click it to continue setting up your account.
        </p>
        <Link href="/login" className="mt-6 inline-block text-sm font-semibold text-brand-600">Back to sign in</Link>
      </div>
    )
  }

  return (
    <>
      <h2 className="text-2xl font-bold">Create your client account</h2>
      <p className="mt-1 text-sm text-slate-500">
        Tell us about your brand, pick your platforms and services, and our team will get started.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        {error && <Alert>{error}</Alert>}
        <Field label="Your name" required>
          <input required value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })}
                 className="input" placeholder="Priya Sharma" autoComplete="name" />
        </Field>
        <Field label="Work email" required>
          <input type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                 className="input" placeholder="you@brand.com" autoComplete="email" />
        </Field>
        <Field label="Password" hint="At least 8 characters" required>
          <PasswordInput required minLength={8} value={form.password} autoComplete="new-password"
                         onChange={e => setForm({ ...form, password: e.target.value })} />
        </Field>
        <Button type="submit" size="lg" loading={loading} className="w-full">Create account</Button>
      </form>

      <p className="mt-8 text-center text-sm text-slate-500">
        Already have an account?{' '}
        <Link href="/login" className="font-semibold text-brand-600 hover:text-brand-700">Sign in</Link>
      </p>
    </>
  )
}
