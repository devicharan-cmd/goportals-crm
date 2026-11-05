import { AppShell } from '@/components/layout/AppShell'
import { requireStaff } from '@/lib/auth'

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const me = await requireStaff()

  return (
    <AppShell
      user={{ id: me.id, name: me.full_name, email: me.email, role: me.role, jobTitle: me.job_title, avatarUrl: me.avatar_url }}
      counts={{ notifications: 0, urgent: 0, approvals: 0 }}
    >
      {children}
    </AppShell>
  )
}
