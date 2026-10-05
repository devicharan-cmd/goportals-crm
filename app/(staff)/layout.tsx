import { AppShell } from '@/components/layout/AppShell'
import { createClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/auth'

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const me = await requireStaff()
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
