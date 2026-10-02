import { createClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/auth'
import { Card, PageHeader } from '@/components/ui/primitives'
import { NotificationsList } from '@/components/shared/NotificationsList'
import type { Notification } from '@/types/database'

export const metadata = { title: 'Notifications' }

export default async function NotificationsPage() {
  const me = await requireStaff()
  const { data } = await createClient().from('notifications').select('*')
    .eq('recipient_id', me.id).order('created_at', { ascending: false }).limit(100)
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Notifications" />
      <Card className="overflow-hidden"><NotificationsList items={(data ?? []) as Notification[]} taskHref="/tasks" ticketHref="/tickets" /></Card>
    </div>
  )
}
