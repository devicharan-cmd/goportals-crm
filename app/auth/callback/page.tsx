'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createBrowserClient } from '@supabase/ssr'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { Alert } from '@/components/ui/primitives'

function getLinkErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : ''
  if (/code verifier|pkce/i.test(message)) {
    return 'This link was requested from a different site or browser. Request a fresh link from this site and open it in the same browser.'
  }
  if (/expired|invalid|already been used|otp_expired/i.test(message)) {
    return 'This email link has expired or was already used. Request a fresh link and use only the newest email.'
  }
  return message || 'This link is invalid or has expired.'
}

// Landing page for every Supabase email link: signup confirmation, invites, password reset.
// Handles all three link styles Supabase can send: #access_token (invite), ?code (PKCE), ?token_hash.
function Callback() {
  const router = useRouter()
  const params = useSearchParams()
  const [error, setError] = useState('')
  const started = useRef(false)
  const errorCode = params.get('error_code')
  const errorDescription = params.get('error_description')?.replace(/\+/g, ' ')
  const expiredLink = errorCode === 'otp_expired'
  const visibleError = expiredLink
    ? 'This password reset link has expired, was already used, or was replaced by a newer request. Request a fresh link and use only the newest email.'
    : error || errorDescription

  useEffect(() => {
    if (started.current) return   // links are single-use; don't run twice in dev strict mode
    started.current = true
    const hash = new URLSearchParams(window.location.hash.slice(1))
    const next = params.get('next') === '/auth/set-password' ? '/auth/set-password' : '/'

    // Supabase redirects expired or invalid links with an error in the URL.
    // Don't start session processing for those links; show recovery immediately.
    const linkError = hash.get('error_description') ?? params.get('error_description')
    if (linkError) {
      setError(linkError.replace(/\+/g, ' '))
      return
    }

    // Own client with URL auto-detection off, so the code/token is exchanged exactly once (below).
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { isSingleton: false, auth: { detectSessionInUrl: false } },
    )
    async function run() {
      const type = hash.get('type') ?? params.get('type')
      const accessToken = hash.get('access_token')
      const refreshToken = hash.get('refresh_token')
      const code = params.get('code')
      const tokenHash = params.get('token_hash')

      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
        if (error) throw error
      } else if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (error) throw error
      } else if (tokenHash && type) {
        const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as EmailOtpType })
        if (error) throw error
      } else {
        const { data } = await supabase.auth.getSession()
        if (!data.session) throw new Error('This link is invalid or has expired.')
      }

      // Invited users and password resets must choose a password.
      const dest = type === 'invite' || type === 'recovery' ? '/auth/set-password' : next ?? '/'
      router.replace(dest)
      router.refresh()
    }

    run().catch(e => setError(getLinkErrorMessage(e)))
  }, [params, router])

  if (visibleError) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold">
          {expiredLink ? 'Reset link expired' : 'Email link problem'}
        </h2>
        <Alert>{visibleError}</Alert>
        <div className="flex flex-wrap items-center gap-4 text-sm font-semibold">
          <Link href="/forgot-password" className="text-brand-600">
            Request a new reset link
          </Link>
          <Link href="/login" className="text-slate-600">
            Back to sign in
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 text-slate-600">
      <Loader2 className="h-5 w-5 animate-spin text-brand-600" /> Signing you in…
    </div>
  )
}

export default function CallbackPage() {
  return <AuthLayout><Suspense><Callback /></Suspense></AuthLayout>
}
