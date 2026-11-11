import { createClient } from '@/lib/supabase/server'
import { requireManager } from '@/lib/auth'
import { getStaffLookups } from '@/lib/queries'
import { Card, CardHeader } from '@/components/ui/primitives'
import { InviteUserButton, PendingInvites, StaffDirectory, UnlinkedClientAccounts, type StaffRow, type UnlinkedClientAccount } from '@/components/admin/UserAdmin'
import type { Invite, StaffRole } from '@/types/database'

export const metadata = { title: 'Users & invites' }

export default async function UsersPage() {
  const me = await requireManager()
  const [lookups, { data: invites }, { data: profileData, error: profileError }, { data: addressData, error: addressError }] = await Promise.all([
    getStaffLookups(),
    (await createClient()).from('invites').select('*').is('used_at', null).order('created_at', { ascending: false }),
    (await createClient()).from('profiles').select('id, phone'),
    (await createClient()).from('staff_profile_details').select('profile_id, current_address, permanent_address'),
  ])
  if (profileError) throw new Error(`Could not load team contact details: ${profileError.message}`)
  if (addressError) throw new Error(`Could not load staff profile addresses: ${addressError.message}`)
  const profileDetails = new Map((profileData ?? []).map(profile => [profile.id, profile]))
  const addressDetails = new Map((addressData ?? []).map(profile => [profile.profile_id, profile]))
  const peopleById = new Map(lookups.people.map(person => [person.id, person]))

  const rows: StaffRow[] = lookups.people
    .filter(p => p.role !== 'client')
    .map(p => {
      const reportingPerson = p.reporting_to ? peopleById.get(p.reporting_to) : null
      return {
        id: p.id, full_name: p.full_name, email: p.email, role: p.role as StaffRole, status: p.status,
        job_title: p.job_title, weekly_capacity_hours: p.weekly_capacity_hours, created_at: p.created_at,
        reporting_to: p.reporting_to, reporting_to_name: reportingPerson ? reportingPerson.full_name || reportingPerson.email : null,
        avatar_url: p.avatar_url, phone: profileDetails.get(p.id)?.phone ?? null,
        current_address: me.role === 'super_admin' ? addressDetails.get(p.id)?.current_address ?? null : null,
        permanent_address: me.role === 'super_admin' ? addressDetails.get(p.id)?.permanent_address ?? null : null,
        departmentIds: lookups.departmentMembers.filter(m => m.profile_id === p.id).map(m => m.department_id),
      }
    })
  const reportingPeople = lookups.people
    .filter(p => p.role !== 'client')
    .map(({ id, full_name, email, avatar_url, role, status }) => ({ id, full_name, email, avatar_url, role: role as StaffRole, status }))

  let unlinkedClientAccounts: UnlinkedClientAccount[] = []
  if (me.role === 'super_admin') {
    const [{ data: clientProfiles, error: profilesError }, { data: clients, error: clientsError }] = await Promise.all([
      (await createClient()).from('profiles').select('id, email, full_name').eq('role', 'client').order('created_at', { ascending: false }),
      (await createClient()).from('clients').select('owner_id').not('owner_id', 'is', null),
    ])
    if (profilesError) throw new Error(`Could not load client accounts: ${profilesError.message}`)
    if (clientsError) throw new Error(`Could not load client account links: ${clientsError.message}`)
    const linkedOwnerIds = new Set((clients ?? []).map(client => client.owner_id).filter((id): id is string => !!id))
    unlinkedClientAccounts = (clientProfiles ?? []).filter(profile => !linkedOwnerIds.has(profile.id))
  }

  return (
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <Card className="overflow-hidden">
          <StaffDirectory rows={rows} departments={lookups.departments}
            canEdit={me.role === 'super_admin'}
            inviteButton={<InviteUserButton departments={lookups.departments} actorRole={me.role} reportingPeople={reportingPeople} />} />
        </Card>
        <div className="space-y-6">
          <Card className="h-fit overflow-hidden">
            <CardHeader title="Pending invites" />
            <PendingInvites invites={(invites ?? []) as Invite[]} />
          </Card>
          {me.role === 'super_admin' && unlinkedClientAccounts.length > 0 && (
            <Card className="h-fit overflow-hidden">
              <CardHeader
                title={`Unlinked client accounts (${unlinkedClientAccounts.length})`}
                description="These logins have no client company. Super admins can permanently remove an account and its personal data here."
              />
              <UnlinkedClientAccounts accounts={unlinkedClientAccounts} />
            </Card>
          )}
        </div>
      </div>
  )
}
