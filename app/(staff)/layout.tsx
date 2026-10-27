import { Suspense } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { createClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/auth'
import StaffLoading from './loading'

async function StaffShell({ me, children }: {
  me: Awaited<ReturnType<typeof requireStaff>>
  children: React.ReactNode
}) {
  const supabase = createClient()

  const [notifications, urgentTasks, urgentTickets, approvals] = await Promise.all([
    supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('recipient_id', me.id).eq('is_read', false),
    supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('is_urgent', true).is('assignee_id', null).not('status', 'in', '(completed,cancelled)'),
    supabase.from('tickets').select('id', { count: 'exact', head: true }).eq('is_urgent', true).is('assignee_id', null).neq('status', 'closed'),
    ['super_admin', 'admin'].includes(me.role)
      ? supabase.from('clients').select('id', { count: 'exact', head: true }).eq('status', 'pending').eq('signup_source', 'self_signup')
      : Promise.resolve({ count: 0 }),
  ])

  return (
    <AppShell
      user={{ name: me.full_name, email: me.email, role: me.role, jobTitle: me.job_title }}
      counts={{ notifications: notifications.count ?? 0, urgent: (urgentTasks.count ?? 0) + (urgentTickets.count ?? 0), approvals: approvals.count ?? 0 }}
    >
      {children}
    </AppShell>
  )
}

async function AuthorizedStaffLayout({ children }: { children: React.ReactNode }) {
  const me = await requireStaff()
  const user = { name: me.full_name, email: me.email, role: me.role, jobTitle: me.job_title }

  return (
    <Suspense fallback={
      <AppShell user={user} counts={{ notifications: 0, urgent: 0, approvals: 0 }}>
        {children}
      </AppShell>
    }>
      <StaffShell me={me}>{children}</StaffShell>
    </Suspense>
  )
}

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  // Keep the navigation and page skeleton visible while the first protected
  // request verifies the session and loads the staff profile.
  return (
    <Suspense fallback={
      <AppShell user={{ name: '', email: '', role: 'employee', jobTitle: null }}
        counts={{ notifications: 0, urgent: 0, approvals: 0 }}>
        <StaffLoading />
      </AppShell>
    }>
      <AuthorizedStaffLayout>{children}</AuthorizedStaffLayout>
    </Suspense>
  )
}
