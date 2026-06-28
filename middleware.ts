import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const { pathname } = request.nextUrl

  const isPortalRoute    = pathname.startsWith('/portal')
  const isDashboardRoute = pathname.startsWith('/dashboard') || pathname.startsWith('/clients') ||
                           pathname.startsWith('/tickets') || pathname.startsWith('/team') ||
                           pathname.startsWith('/reports') || pathname.startsWith('/notifications')
  const isLoginRoute     = pathname.startsWith('/login') || pathname.startsWith('/auth')

  if (!user) {
    if (isLoginRoute) return supabaseResponse
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const role = (user.user_metadata && user.user_metadata.role) ? String(user.user_metadata.role) : ''
  const isClient = role === 'client'

  if (isLoginRoute) {
    if (isClient) return NextResponse.redirect(new URL('/portal/dashboard', request.url))
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  if (isClient && isDashboardRoute) {
    return NextResponse.redirect(new URL('/portal/dashboard', request.url))
  }

  if (!isClient && isPortalRoute) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
