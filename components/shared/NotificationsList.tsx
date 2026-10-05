'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, CheckCheck, Flame, Inbox, MessageSquare, RefreshCw, UserCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/primitives'
import { cn, formatRelative } from '@/lib/utils'
import type { Notification } from '@/types/database'

const ICONS: Record<string, React.ElementType> = {
  assigned: UserCheck,
  status_changed: RefreshCw,
  client_task: Inbox,
  client_ticket: Inbox,
  urgent: Flame,
  comment: MessageSquare,
}

export function NotificationsList({ items, taskHref, ticketHref }: { items: Notification[]; taskHref: string; ticketHref: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const unread = items.filter(n => !n.is_read)

  async function open(n: Notification) {
    if (!n.is_read) await createClient().from('notifications').update({ is_read: true }).eq('id', n.id)
    if (n.ticket_id) router.push(`${ticketHref}/${n.ticket_id}`)
    else if (n.task_id) router.push(`${taskHref}/${n.task_id}`)
    router.refresh()
  }

  async function markAll() {
    setBusy(true)
    await createClient().from('notifications').update({ is_read: true }).in('id', unread.map(n => n.id))
    setBusy(false)
    router.refresh()
  }

  if (items.length === 0) return <EmptyState icon={Bell} title="No notifications" description="You're all caught up." />

  return (
    <div>
      {unread.length > 0 && (
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <span className="text-sm text-slate-500">{unread.length} unread</span>
          <Button size="sm" variant="ghost" loading={busy} onClick={markAll}><CheckCheck className="h-4 w-4" /> Mark all read</Button>
        </div>
      )}
      <ul className="divide-y divide-slate-100">
        {items.map(n => {
          const Icon = ICONS[n.type] ?? Bell
          return (
            <li key={n.id}>
              <button onClick={() => open(n)} className={cn('flex w-full items-start gap-3 px-5 py-4 text-left hover:bg-slate-50', !n.is_read && 'bg-brand-50/40')}>
                <span className={cn('mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full',
                  n.is_read ? 'bg-slate-100 text-slate-400' : 'bg-brand-100 text-brand-700')}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn('block text-sm', n.is_read ? 'text-slate-600' : 'font-semibold text-slate-900')}>{n.title}</span>
                  {n.body && <span className="block truncate text-sm text-slate-500">{n.body}</span>}
                  <span className="text-xs text-slate-400" suppressHydrationWarning>{formatRelative(n.created_at)}</span>
                </span>
                {!n.is_read && <span className="mt-2 h-2 w-2 rounded-full bg-lime-500" />}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
