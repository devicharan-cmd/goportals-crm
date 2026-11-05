import { requireStaff } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getStaffLookups } from '@/lib/queries'
import { StaffProfileSettings } from '@/components/settings/StaffProfileSettings'
import type { Department, Profile } from '@/types/database'

export const metadata = { title: 'Setting' }

export default async function SettingsPage() {
  const me = await requireStaff()
  const supabase = createClient()

  const [profileRes, addressRes, deptsRes, deptMembersRes, lookups] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', me.id).single(),
    supabase.from('staff_profile_details').select('current_address, permanent_address').eq('profile_id', me.id).maybeSingle(),
    supabase.from('departments').select('*').order('sort_order'),
    supabase.from('department_members').select('department_id').eq('profile_id', me.id),
    getStaffLookups(),
  ])

  if (addressRes.error) throw new Error(`Could not load your profile addresses: ${addressRes.error.message}`)
  const profile = (profileRes.data as Profile) ?? me
  const initialAddress = {
    current_address: addressRes.data?.current_address ?? null,
    permanent_address: addressRes.data?.permanent_address ?? null,
  }
  const departments = (deptsRes.data as Department[]) ?? []
  const initialDepartmentIds = (deptMembersRes.data ?? []).map(m => m.department_id)

  return (
    <div className="mx-auto w-full max-w-7xl pb-12">
      <StaffProfileSettings
        profile={profile}
        initialAddress={initialAddress}
        departments={departments}
        initialDepartmentIds={initialDepartmentIds}
        actorRole={me.role}
        actorId={me.id}
        reportingPeople={lookups.people.map(({ id, full_name, email, role, status, avatar_url }) => ({ id, full_name, email, role, status, avatar_url }))}
      />
    </div>
  )
}
