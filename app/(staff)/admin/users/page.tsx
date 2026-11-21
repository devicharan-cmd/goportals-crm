import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { getUserAdminLookups, profileIdsReportingTo } from '@/lib/queries'
import { InviteUserButton, type StaffRow, type UnlinkedClientAccount } from '@/components/admin/UserAdmin'
import { UsersAdminTabs } from '@/components/admin/UsersAdminTabs'
import type { Department, Invite, InviteListItem, StaffRole } from '@/types/database'

export const metadata = { title: 'Users & invites' }

export default async function UsersPage(props: { searchParams: Promise<{ tab?: string; select?: string }> }) {
  const searchParams = await props.searchParams
  const me = await requireRole(['super_admin', 'manager', 'team_lead'])
  const initialTab = searchParams.tab === 'invites' || (searchParams.tab === 'change-poc' && me.role === 'super_admin') ? searchParams.tab : 'users'
  const supabase = await createClient()

  // The invites tab does not render the staff directory. Loading every profile
  // (including cards, capacities, phones and department memberships) made this
  // otherwise small view wait on unrelated data. Keep the invite modal's POC
  // list, departments and each invitation's inviter in its purpose-built query.
  if (initialTab === 'invites' && me.role !== 'team_lead') {
    const [invitesResult, departmentsResult, reportingPeopleResult] = await Promise.all([
      supabase
        .from('invites')
        .select('id, email, role, invited_by, used_by, reporting_to, full_name, job_title, department_ids, client_id, expires_at, used_at, cancelled_at, created_at, inviter:profiles!invites_invited_by_fkey(id, full_name, email, avatar_url, role)')
        .order('created_at', { ascending: false }),
      supabase.from('departments').select('id, name, slug, sort_order').order('sort_order'),
      supabase
        .from('profiles')
        .select('id, full_name, email, avatar_url, role, status')
        .neq('role', 'client')
        .eq('status', 'active'),
    ])
    for (const result of [invitesResult, departmentsResult, reportingPeopleResult]) {
      if (result.error) throw new Error(`Could not load invitations: ${result.error.message}`)
    }
    type InviteWithInviter = Invite & {
      inviter: { id: string; full_name: string | null; email: string; avatar_url: string | null; role: StaffRole } | null
    }
    const inviteRows: InviteListItem[] = ((invitesResult.data ?? []) as unknown as InviteWithInviter[]).map(({ inviter, ...invite }) => ({
      ...invite,
      inviter: inviter ? { ...inviter, full_name: inviter.full_name ?? '', role: inviter.role as StaffRole } : null,
    }))
    const reportingPeople = (reportingPeopleResult.data ?? []).map(({ id, full_name, email, avatar_url, role, status }) => ({
      id,
      full_name,
      email,
      avatar_url,
      role: role as StaffRole,
      status,
    }))

    return (
      <UsersAdminTabs
        rows={[]}
        departments={(departmentsResult.data ?? []) as Department[]}
        invites={inviteRows}
        inviteButton={<InviteUserButton departments={(departmentsResult.data ?? []) as Department[]} actorRole={me.role} reportingPeople={reportingPeople} />}
        actorId={me.id}
        actorRole={me.role}
        initialTab={initialTab}
      />
    )
  }

  const [lookups, clientLinksResult] = await Promise.all([
    getUserAdminLookups({
      includeClients: me.role === 'super_admin' && initialTab === 'users',
      includeDepartmentMembers: initialTab !== 'invites',
    }),
    me.role === 'super_admin' && initialTab === 'users'
      ? supabase.from('clients').select('owner_id').not('owner_id', 'is', null)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (clientLinksResult.error) throw new Error(`Could not load client account links: ${clientLinksResult.error.message}`)
  const peopleById = new Map(lookups.people.map(person => [person.id, person]))
  const inviteRows: InviteListItem[] = []
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
