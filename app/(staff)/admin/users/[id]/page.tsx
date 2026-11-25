import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { requireRole } from '@/lib/auth'
import { getUserAdminLookups, profileIdsReportingTo } from '@/lib/queries'
import { createClient } from '@/lib/supabase/server'
import { StaffProfileSettings } from '@/components/settings/StaffProfileSettings'
import { ArrowLeft, ChevronRight } from 'lucide-react'
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
    getUserAdminLookups({
      includeClients: false,
      includeDepartmentMembers: false,
      departmentMemberProfileId: params.id,
    }),
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
    <div className="mx-auto w-full max-w-7xl pb-12 2xl:max-w-[1600px]">
      <div className="mb-4">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm">
          <Link
            href="/admin/users"
            prefetch
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Users & invites
          </Link>
          <ChevronRight aria-hidden="true" className="h-4 w-4 text-slate-400" />
          <span aria-current="page" className="font-medium text-slate-700">Staff Profile</span>
        </nav>
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
