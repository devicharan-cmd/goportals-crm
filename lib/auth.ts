// Server-only helpers (uses cookies via lib/supabase/server).
import { cache } from 'react'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { AppRole, Profile } from '@/types/database'

export const STAFF_ROLES: AppRole[] = ['super_admin', 'admin', 'team_lead', 'employee']

export const isStaffRole = (role: AppRole | null | undefined) =>
  !!role && STAFF_ROLES.includes(role)

/** Logged-in user's profile (one DB call per request). Null when signed out. */
export const getProfile = cache(async (): Promise<Profile | null> => {
  const supabase = createClient()
  // middleware already verified the JWT with Supabase Auth for this request —
  // trust its header instead of paying for a second getUser() round-trip here.
  const userId = headers().get('x-user-id') ?? (await supabase.auth.getUser()).data.user?.id
  if (!userId) return null
  const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
  return (data as Profile) ?? null
})

/** Where a user should land after login. */
export function homePathFor(profile: Pick<Profile, 'role'>): string {
  return profile.role === 'client' ? '/portal' : '/dashboard'
}

/** Server pages: require an active user with one of the given roles, else redirect. */
export async function requireRole(roles: AppRole[]): Promise<Profile> {
  const profile = await getProfile()
  if (!profile) redirect('/login')
  if (profile.status !== 'active') redirect('/')
  if (!roles.includes(profile.role)) redirect(homePathFor(profile))
  return profile
}

export const requireStaff      = () => requireRole(STAFF_ROLES)
export const requireSuperAdmin = () => requireRole(['super_admin'])
export const requireAdmin      = () => requireRole(['super_admin', 'admin'])
export const requireClient     = () => requireRole(['client'])
