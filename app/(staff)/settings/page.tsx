import { requireStaff } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { StaffProfileSettings } from '@/components/settings/StaffProfileSettings'
import type { Department, Profile } from '@/types/database'

export const metadata = { title: 'Settings' }

export default async function SettingsPage() {
  const me = await requireStaff()
  const supabase = await createClient()

  const [addressRes, deptsRes, deptMembersRes, reportingPeopleRes] = await Promise.all([
    supabase.from('staff_profile_details').select('current_address, permanent_address').eq('profile_id', me.id).maybeSingle(),
    supabase.from('departments').select('*').order('sort_order'),
    supabase.from('department_members').select('department_id').eq('profile_id', me.id),
    (() => {
      let query = supabase.from('profiles').select('id, full_name, email, role, status, avatar_url')
        .neq('role', 'client')
        .or(me.reporting_to
          ? `status.eq.active,id.eq.${me.reporting_to}`
          : 'status.eq.active')
      return query
    })(),
  ])

  if (addressRes.error) throw new Error(`Could not load your profile addresses: ${addressRes.error.message}`)
  if (deptsRes.error) throw new Error(`Could not load departments: ${deptsRes.error.message}`)
  if (deptMembersRes.error) throw new Error(`Could not load your department memberships: ${deptMembersRes.error.message}`)
  if (reportingPeopleRes.error) throw new Error(`Could not load reporting staff: ${reportingPeopleRes.error.message}`)
  // requireStaff() already loaded the full profile for this request.
  const profile = me as Profile
  const initialAddress = {
    current_address: addressRes.data?.current_address ?? null,
    permanent_address: addressRes.data?.permanent_address ?? null,
  }
  const departments = (deptsRes.data as Department[]) ?? []
  const initialDepartmentIds = (deptMembersRes.data ?? []).map(m => m.department_id)

  return (
    <div className="mx-auto w-full max-w-7xl pb-12 2xl:max-w-[1600px]">
      <StaffProfileSettings
        profile={profile}
        initialAddress={initialAddress}
        departments={departments}
        initialDepartmentIds={initialDepartmentIds}
        actorRole={me.role}
        actorId={me.id}
        reportingPeople={reportingPeopleRes.data ?? []}
      />
    </div>
  )
}
