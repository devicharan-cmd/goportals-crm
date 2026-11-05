import { notFound } from 'next/navigation'
import { requireAdmin } from '@/lib/auth'
import { getStaffLookups } from '@/lib/queries'
import { createClient } from '@/lib/supabase/server'
import { StaffProfileSettings } from '@/components/settings/StaffProfileSettings'
import { ButtonLink } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import type { Department, Profile } from '@/types/database'

export const metadata = { title: 'Staff Profile' }

export default async function StaffProfilePage({ params }: { params: { id: string } }) {
  const me = await requireAdmin()
  const supabase = createClient()
  const [profileRes, addressRes, departmentsRes, membershipsRes, lookups] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', params.id).maybeSingle(),
    supabase.from('staff_profile_details').select('current_address, permanent_address').eq('profile_id', params.id).maybeSingle(),
    supabase.from('departments').select('*').order('sort_order'),
    supabase.from('department_members').select('department_id').eq('profile_id', params.id),
    getStaffLookups(),
  ])

  if (profileRes.error) throw new Error(`Could not load the staff profile: ${profileRes.error.message}`)
  if (!profileRes.data || profileRes.data.role === 'client') notFound()
  if (addressRes.error) throw new Error(`Could not load staff profile addresses: ${addressRes.error.message}`)
  if (departmentsRes.error) throw new Error(`Could not load departments: ${departmentsRes.error.message}`)
  if (membershipsRes.error) throw new Error(`Could not load staff department assignments: ${membershipsRes.error.message}`)

  const profile = profileRes.data as Profile
  const departments = (departmentsRes.data ?? []) as Department[]

  return (
    <div className="mx-auto w-full max-w-7xl pb-12">
      <div className="mb-4">
        <ButtonLink href="/admin/users" variant="ghost" size="sm">
          <ArrowLeft className="h-4 w-4" /> Users & invites
        </ButtonLink>
      </div>
      <StaffProfileSettings
        profile={profile}
        initialAddress={{
          current_address: addressRes.data?.current_address ?? null,
          permanent_address: addressRes.data?.permanent_address ?? null,
        }}
        departments={departments}
        initialDepartmentIds={(membershipsRes.data ?? []).map(row => row.department_id)}
        actorRole={me.role}
        actorId={me.id}
        isOwnProfile={me.id === profile.id}
        reportingPeople={lookups.people.map(({ id, full_name, email, role, status, avatar_url }) => ({ id, full_name, email, role, status, avatar_url }))}
      />
    </div>
  )
}
