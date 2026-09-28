import { AppShell } from '@/components/layout/AppShell'
import { createClient } from '@/lib/supabase/server'
import { requireClient } from '@/lib/auth'

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const me = await requireClient()
  const supabase = createClient()
  const [{ data: client }, { count }] = await Promise.all([
    supabase.from('clients').select('company_name').eq('owner_id', me.id).maybeSingle(),
    supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('recipient_id', me.id).eq('is_read', false),
  ])

  return (
    <AppShell
      user={{ name: me.full_name, email: me.email, role: me.role, jobTitle: null }}
      counts={{ notifications: count ?? 0 }}
      companyName={client?.company_name}
    >
      {children}
    </AppShell>
  )
}
