export type AuthEmailFlow = 'invite' | 'recovery'

// Email links always finish on the live site, including when requested from localhost.
const AUTH_EMAIL_ORIGIN = 'https://goportals-crm.vercel.app'

export function authEmailCallbackUrl(flow: AuthEmailFlow): string {
  const url = new URL('/auth/callback', AUTH_EMAIL_ORIGIN)
  url.searchParams.set('flow', flow)
  return url.toString()
}

export function resolveAuthEmailFlow(
  linkType: string | null | undefined,
  next: string | null | undefined,
  flowHint?: string | null,
): AuthEmailFlow | null {
  if (linkType === 'invite' || linkType === 'recovery') return linkType
  // Keep the intended action visible even when Supabase redirects a failed or
  // expired link without preserving its token type.
  if (flowHint === 'invite' || flowHint === 'recovery') return flowHint
  // The forgot-password form sets this destination when it asks Supabase for a
  // recovery email. This also labels expired recovery links correctly.
  if (next === '/auth/set-password') return 'recovery'
  return null
}
