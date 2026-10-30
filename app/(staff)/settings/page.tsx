import { requireStaff } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { StaffProfileSettings } from '@/components/settings/StaffProfileSettings'
import type { Department, Profile } from '@/types/database'

export const metadata = { title: 'Settings · Profile' }

export default async function SettingsPage() {
  const me = await requireStaff()
  const supabase = createClient()

  const [profileRes, deptsRes, deptMembersRes] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', me.id).single(),
    supabase.from('departments').select('*').order('sort_order'),
    supabase.from('department_members').select('department_id').eq('profile_id', me.id),
  ])

  const profile = (profileRes.data as Profile) ?? me
  const departments = (deptsRes.data as Department[]) ?? []
  const initialDepartmentIds = (deptMembersRes.data ?? []).map(m => m.department_id)

  return (
    <div className="mx-auto max-w-6xl pb-12">
      <StaffProfileSettings
        profile={profile}
        departments={departments}
        initialDepartmentIds={initialDepartmentIds}
        actorRole={me.role}
      />
    </div>
  )
}
