import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Routes anyone can open.
const PUBLIC_PREFIXES = ['/login', '/signup', '/forgot-password', '/auth']
// Routes for clients who have not finished signup / are waiting for approval.
const CLIENT_GATE_PREFIXES = ['/onboarding', '/pending']
const STAFF_PREFIXES = ['/dashboard', '/tickets', '/tasks', '/urgent', '/clients', '/team', '/reports', '/notifications', '/admin']

const startsWithAny = (path: string, prefixes: string[]) =>
  prefixes.some(p => path === p || path.startsWith(p + '/'))

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // Hand the verified user id to Server Components via a request header so
  // getProfile() doesn't need a second round-trip to Supabase Auth to
  // re-verify the same token on every navigation (this was doubling the
  // auth latency on every section switch). Always set/clear it here —
  // never trust a client-supplied value.
  if (user) {
    request.headers.set('x-user-id', user.id)
    const pendingCookies = response.cookies.getAll()
    response = NextResponse.next({ request })
    pendingCookies.forEach(c => response.cookies.set(c))
  } else {
    request.headers.delete('x-user-id')
  }

  const path = request.nextUrl.pathname
  const go = (to: string) => {
    if (path === to) return response
    const res = NextResponse.redirect(new URL(to, request.url))
    response.cookies.getAll().forEach(c => res.cookies.set(c))   // keep refreshed session
    return res
  }

  if (path.startsWith('/api')) return response   // API routes check auth themselves
  if (path.startsWith('/auth')) return response  // callback / set-password handle their own session

  if (!user) {
    return startsWithAny(path, PUBLIC_PREFIXES) ? response : go('/login')
  }

  const { data: profile } = await supabase
    .from('profiles').select('role, status').eq('id', user.id).single()

  if (!profile) return startsWithAny(path, PUBLIC_PREFIXES) ? response : go('/login?error=no_profile')

  // Suspended / rejected accounts
  if (profile.status === 'suspended' || profile.status === 'rejected') {
    return path === '/blocked' ? response : go('/blocked')
  }

  // ── Client ──
  if (profile.role === 'client') {
    let gate: string | null = null
    if (profile.status === 'pending') {
      const [{ data: client }, { data: needsAgreement }] = await Promise.all([
        supabase.from('clients').select('id').eq('owner_id', user.id).maybeSingle(),
        supabase.rpc('needs_agreement'),
      ])
      gate = !client || needsAgreement ? '/onboarding' : '/pending'
    } else {
      const { data: needsAgreement } = await supabase.rpc('needs_agreement')
      if (needsAgreement) gate = '/onboarding'
    }

    if (gate) return startsWithAny(path, [gate]) ? response : go(gate)
    return path.startsWith('/portal') ? response : go('/portal')
  }

  // ── Staff ──
  if (profile.status !== 'active') return path === '/blocked' ? response : go('/blocked')
  if (path.startsWith('/admin') && !['super_admin', 'admin'].includes(profile.role)) return go('/dashboard')
  if (startsWithAny(path, ['/clients', '/reports']) && !['super_admin', 'admin'].includes(profile.role)) return go('/dashboard')
  if (path.startsWith('/team') && profile.role === 'employee') return go('/dashboard')
  if (startsWithAny(path, STAFF_PREFIXES)) return response
  return go('/dashboard')
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|logo.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
