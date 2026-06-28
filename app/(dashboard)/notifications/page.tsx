import { createClient } from '@/lib/supabase/server'
import { formatRelative } from '@/lib/utils'

export default async function NotificationsPage() {
  const supabase = createClient()

  // Get current member
  const { data: { user } } = await supabase.auth.getUser()
  const { data: member } = await supabase
    .from('team_members')
    .select('id')
    .eq('user_id', user?.id)
    .single()

  const { data: notifications } = await supabase
    .from('notifications')
    .select('*, ticket:tickets(id, title), client:clients(id, name)')
    .eq('recipient_id', member?.id ?? '')
    .order('created_at', { ascending: false })
    .limit(50)

  const unreadCount = notifications?.filter(n => !n.is_read).length ?? 0

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
        <p className="text-sm text-gray-500 mt-0.5">{unreadCount} unread</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-50">
        {notifications?.map((n: any) => (
          <div key={n.id} className={`flex items-start gap-3 px-5 py-4 ${!n.is_read ? 'bg-blue-50/40' : ''}`}>
            <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${!n.is_read ? 'bg-blue-500' : 'bg-transparent'}`} />
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900">{n.title}</p>
              {n.body && <p className="text-sm text-gray-500 mt-0.5">{n.body}</p>}
              {n.ticket && (
                <p className="text-xs text-blue-600 mt-1">Ticket: {n.ticket.title}</p>
              )}
              {n.client && (
                <p className="text-xs text-gray-400 mt-0.5">Client: {n.client.name}</p>
              )}
            </div>
            <span className="text-xs text-gray-400 flex-shrink-0">{formatRelative(n.created_at)}</span>
          </div>
        ))}
        {(!notifications || notifications.length === 0) && (
          <div className="px-5 py-10 text-center text-sm text-gray-400">
            No notifications yet
          </div>
        )}
      </div>
    </div>
  )
}
