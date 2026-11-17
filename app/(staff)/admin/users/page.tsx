import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { getStaffLookups, profileIdsReportingTo } from '@/lib/queries'
import { Card, CardHeader } from '@/components/ui/primitives'
import { InviteUserButton, PendingInvites, StaffDirectory, UnlinkedClientAccounts, type StaffRow, type UnlinkedClientAccount } from '@/components/admin/UserAdmin'
import type { Invite, StaffRole } from '@/types/database'

export const metadata = { title: 'Users & invites' }

export default async function UsersPage() {
  const me = await requireRole(['super_admin', 'manager', 'team_lead'])
  const supabase = await createClient()
  const [lookups, invitesResult, profileResult, addressResult] = await Promise.all([
    getStaffLookups(),
    me.role === 'team_lead'
      ? Promise.resolve({ data: [], error: null })
      : supabase.from('invites').select('*').is('used_at', null).order('created_at', { ascending: false }),
    supabase.from('profiles').select('id, phone'),
    me.role === 'super_admin'
      ? supabase.from('staff_profile_details').select('profile_id, current_address, permanent_address')
      : Promise.resolve({ data: [], error: null }),
  ])
  if (invitesResult.error) throw new Error(`Could not load pending invites: ${invitesResult.error.message}`)
  if (profileResult.error) throw new Error(`Could not load team contact details: ${profileResult.error.message}`)
  if (addressResult.error) throw new Error(`Could not load staff profile addresses: ${addressResult.error.message}`)
  const profileDetails = new Map((profileResult.data ?? []).map(profile => [profile.id, profile]))
  const addressDetails = new Map((addressResult.data ?? []).map(profile => [profile.profile_id, profile]))
  const peopleById = new Map(lookups.people.map(person => [person.id, person]))

  const reportingIds = me.role === 'team_lead' ? profileIdsReportingTo(me.id, lookups) : null
  const visiblePeople = lookups.people.filter(p =>
    p.role !== 'client' && (!reportingIds || reportingIds.has(p.id)))
  const rows: StaffRow[] = visiblePeople
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
  const reportingPeople = visiblePeople
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
      <div className={me.role === 'team_lead' ? '' : 'grid gap-6 xl:grid-cols-[1fr_340px]'}>
        <Card className="overflow-hidden">
          <StaffDirectory rows={rows} departments={lookups.departments}
            canEdit={me.role === 'super_admin'}
            actorId={me.id}
            actorRole={me.role}
            inviteButton={<InviteUserButton departments={lookups.departments} actorRole={me.role} reportingPeople={reportingPeople} />} />
        </Card>
        {me.role !== 'team_lead' && (
          <div className="space-y-6">
            <Card className="h-fit overflow-hidden">
              <CardHeader title="Pending invites" />
              <PendingInvites invites={(invitesResult.data ?? []) as Invite[]} />
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
        )}
      </div>
  )
}
