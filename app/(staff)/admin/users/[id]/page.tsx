import { notFound, redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { getUserAdminLookups, profileIdsReportingTo } from '@/lib/queries'
import { createClient } from '@/lib/supabase/server'
import { StaffProfileSettings } from '@/components/settings/StaffProfileSettings'
import { ButtonLink } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import type { Profile } from '@/types/database'

export const metadata = { title: 'Staff Profile' }

export default async function StaffProfilePage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  const me = await requireRole(['super_admin', 'manager', 'team_lead'])
  const supabase = await createClient()
  const [profileRes, addressRes, lookups] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', params.id).maybeSingle(),
    me.role === 'super_admin'
      ? supabase.from('staff_profile_details').select('current_address, permanent_address').eq('profile_id', params.id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    getUserAdminLookups(),
  ])

  if (profileRes.error) throw new Error(`Could not load the staff profile: ${profileRes.error.message}`)
  if (!profileRes.data || profileRes.data.role === 'client') notFound()
  if (addressRes.error) throw new Error(`Could not load staff profile addresses: ${addressRes.error.message}`)
  const profile = profileRes.data as Profile
  if (me.role === 'team_lead'
      && profile.id !== me.id
      && !profileIdsReportingTo(me.id, lookups).has(profile.id)) {
    redirect('/admin/users')
  }
  const departments = lookups.departments

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
        initialDepartmentIds={lookups.departmentMembers
          .filter(row => row.profile_id === profile.id)
          .map(row => row.department_id)}
        actorRole={me.role}
        actorId={me.id}
        isOwnProfile={me.id === profile.id}
        reportingPeople={lookups.people.map(({ id, full_name, email, role, status, avatar_url }) => ({ id, full_name, email, role, status, avatar_url }))}
        directReports={lookups.people.filter(person => person.reporting_to === profile.id).map(({ id, role }) => ({ id, role }))}
      />
    </div>
  )
}
