import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import { getStaffLookups } from '@/lib/queries'
import { Card, CardHeader, PageHeader } from '@/components/ui/primitives'
import { InviteUserButton, PendingInvites, StaffRowEditor, UnlinkedClientAccounts, type StaffRow, type UnlinkedClientAccount } from '@/components/admin/UserAdmin'
import type { Invite, StaffRole } from '@/types/database'

export const metadata = { title: 'Users & invites' }

export default async function UsersPage() {
  const me = await requireAdmin()
  const [lookups, { data: invites }] = await Promise.all([
    getStaffLookups(),
    createClient().from('invites').select('*').is('used_at', null).order('created_at', { ascending: false }),
  ])

  const rows: StaffRow[] = lookups.people
    .filter(p => p.role !== 'client')
    .map(p => ({
      id: p.id, full_name: p.full_name, email: p.email, role: p.role as StaffRole, status: p.status,
      job_title: p.job_title, weekly_capacity_hours: p.weekly_capacity_hours,
      departmentIds: lookups.departmentMembers.filter(m => m.profile_id === p.id).map(m => m.department_id),
    }))

  let unlinkedClientAccounts: UnlinkedClientAccount[] = []
  if (me.role === 'super_admin') {
    const [{ data: clientProfiles, error: profilesError }, { data: clients, error: clientsError }] = await Promise.all([
      createClient().from('profiles').select('id, email, full_name').eq('role', 'client').order('created_at', { ascending: false }),
      createClient().from('clients').select('owner_id').not('owner_id', 'is', null),
    ])
    if (profilesError) throw new Error(`Could not load client accounts: ${profilesError.message}`)
    if (clientsError) throw new Error(`Could not load client account links: ${clientsError.message}`)
    const linkedOwnerIds = new Set((clients ?? []).map(client => client.owner_id).filter((id): id is string => !!id))
    unlinkedClientAccounts = (clientProfiles ?? []).filter(profile => !linkedOwnerIds.has(profile.id))
  }

  return (
    <>
      <PageHeader
        description="Roles, departments and capacity for your team. Managers see every department; Team Leads see and assign within their own."
        actions={<InviteUserButton departments={lookups.departments} actorRole={me.role} />}
      />
      {me.role === 'super_admin' && unlinkedClientAccounts.length > 0 && (
        <Card className="mb-6 overflow-hidden">
          <CardHeader
            title={`Unlinked client accounts (${unlinkedClientAccounts.length})`}
            description="These logins have no client company. Super admins can permanently remove an account and its personal data here."
          />
          <UnlinkedClientAccounts accounts={unlinkedClientAccounts} />
        </Card>
      )}
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <Card className="overflow-hidden">
          <CardHeader title={`Team (${rows.length})`} description="Click a department chip to add or remove someone." />
          <ul className="divide-y divide-slate-100">
            {rows.map(r => <StaffRowEditor key={r.id} row={r} departments={lookups.departments} isMe={r.id === me.id} actorRole={me.role} />)}
          </ul>
        </Card>
        <Card className="h-fit overflow-hidden">
          <CardHeader title="Pending invites" />
          <PendingInvites invites={(invites ?? []) as Invite[]} />
        </Card>
      </div>
    </>
  )
}
