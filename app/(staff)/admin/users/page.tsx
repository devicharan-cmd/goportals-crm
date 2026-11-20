import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { getUserAdminLookups, profileIdsReportingTo } from '@/lib/queries'
import { InviteUserButton, type StaffRow, type UnlinkedClientAccount } from '@/components/admin/UserAdmin'
import { UsersAdminTabs } from '@/components/admin/UsersAdminTabs'
import type { Invite, InviteListItem, StaffRole } from '@/types/database'

export const metadata = { title: 'Users & invites' }

export default async function UsersPage(props: { searchParams: Promise<{ tab?: string; select?: string }> }) {
  const searchParams = await props.searchParams
  const me = await requireRole(['super_admin', 'manager', 'team_lead'])
  const initialTab = searchParams.tab === 'invites' || (searchParams.tab === 'change-poc' && me.role === 'super_admin') ? searchParams.tab : 'users'
  const supabase = await createClient()
  const [lookups, invitesResult, clientLinksResult] = await Promise.all([
    getUserAdminLookups({ includeClients: me.role === 'super_admin' && initialTab === 'users' }),
    initialTab === 'invites' && me.role !== 'team_lead'
      ? supabase.from('invites').select('id, email, role, invited_by, used_by, reporting_to, full_name, job_title, department_ids, client_id, expires_at, used_at, cancelled_at, created_at').order('created_at', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    me.role === 'super_admin' && initialTab === 'users'
      ? supabase.from('clients').select('owner_id').not('owner_id', 'is', null)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (invitesResult.error) throw new Error(`Could not load pending invites: ${invitesResult.error.message}`)
  if (clientLinksResult.error) throw new Error(`Could not load client account links: ${clientLinksResult.error.message}`)
  const peopleById = new Map(lookups.people.map(person => [person.id, person]))
  const inviteRows: InviteListItem[] = ((invitesResult.data ?? []) as Invite[]).map(invite => {
    const inviter = invite.invited_by ? peopleById.get(invite.invited_by) : null
    return {
      ...invite,
      inviter: inviter ? {
        id: inviter.id,
        full_name: inviter.full_name,
        email: inviter.email,
        avatar_url: inviter.avatar_url,
        role: inviter.role,
      } : null,
    }
  })
  const departmentIdsByPerson = new Map<string, string[]>()
  for (const membership of lookups.departmentMembers) {
    const ids = departmentIdsByPerson.get(membership.profile_id) ?? []
    ids.push(membership.department_id)
    departmentIdsByPerson.set(membership.profile_id, ids)
  }

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
        avatar_url: p.avatar_url, phone: p.phone,
        departmentIds: departmentIdsByPerson.get(p.id) ?? [],
      }
    })
  const reportingPeople = visiblePeople
    .map(({ id, full_name, email, avatar_url, role, status }) => ({ id, full_name, email, avatar_url, role: role as StaffRole, status }))

  let unlinkedClientAccounts: UnlinkedClientAccount[] = []
  if (me.role === 'super_admin') {
    const linkedOwnerIds = new Set((clientLinksResult.data ?? [])
      .map(client => client.owner_id)
      .filter((id): id is string => !!id))
    unlinkedClientAccounts = lookups.people
      .filter(profile => profile.role === 'client' && !linkedOwnerIds.has(profile.id))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map(({ id, email, full_name }) => ({ id, email, full_name }))
  }

  return (
    <UsersAdminTabs
      rows={rows}
      departments={lookups.departments}
      invites={inviteRows}
      inviteButton={<InviteUserButton departments={lookups.departments} actorRole={me.role} reportingPeople={reportingPeople} />}
      unlinkedClientAccounts={unlinkedClientAccounts}
      actorId={me.id}
      actorRole={me.role}
      initialTab={initialTab}
      initialSelectedIds={(searchParams.select ?? '').split(',').filter(Boolean)}
    />
  )
}
