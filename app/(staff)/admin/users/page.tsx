import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import { getStaffLookups } from '@/lib/queries'
import { Card, CardHeader, PageHeader } from '@/components/ui/primitives'
import { InviteUserButton, PendingInvites, StaffRowEditor, type StaffRow } from '@/components/admin/UserAdmin'
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
    .sort((a, b) => Number(b.status === 'active') - Number(a.status === 'active') || a.full_name.localeCompare(b.full_name))

  return (
    <>
      <PageHeader
        title="Users & invites"
        description="Roles, departments and capacity for your team. Admins see every department; Team Leads see and assign within their own."
        actions={<InviteUserButton departments={lookups.departments} actorRole={me.role} />}
      />
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
