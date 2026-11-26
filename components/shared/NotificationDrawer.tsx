'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FiAlertTriangle as Flame, FiCheckCircle as CheckCheck, FiInbox as Inbox, FiLoader as Loader2, FiMessageSquare as MessageSquare, FiRefreshCw as RefreshCw, FiUserCheck as UserCheck, FiX as X } from 'react-icons/fi'
import { NotificationIcon } from '@/components/shared/NotificationIcon'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn, formatRelative } from '@/lib/utils'
import type { Notification } from '@/types/database'

type Filter = 'all' | 'unread' | 'read'
type Props = {
  open: boolean
  userId?: string
  isClient: boolean
  onClose: () => void
  onUnreadCountChange: (count: number) => void
}

const ICONS: Record<string, React.ElementType> = {
  assigned: UserCheck,
  status_changed: RefreshCw,
  client_task: Inbox,
  client_ticket: Inbox,
  urgent: Flame,
  comment: MessageSquare,
  reporting_poc_changed: UserCheck,
  reporting_poc_assigned: UserCheck,
}

export function NotificationDrawer({ open, userId, isClient, onClose, onUnreadCountChange }: Props) {
  const router = useRouter()
  const [items, setItems] = useState<Notification[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [loading, setLoading] = useState(false)
  const [markingAll, setMarkingAll] = useState(false)
  const onUnreadCountChangeRef = useRef(onUnreadCountChange)
  onUnreadCountChangeRef.current = onUnreadCountChange

  const loadNotifications = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    const { data } = await createClient().from('notifications')
      .select('id, recipient_id, type, title, body, task_id, ticket_id, client_id, is_read, created_at')
      .eq('recipient_id', userId)
      .order('created_at', { ascending: false })
      .limit(100)
    const next = (data ?? []) as Notification[]
    setItems(next)
    onUnreadCountChangeRef.current(next.filter(n => !n.is_read).length)
    setLoading(false)
  }, [userId])

  useEffect(() => {
    if (!open) return
    void loadNotifications()
    if (!userId) return
    const supabase = createClient()
    const channel = supabase.channel(`notification-drawer-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${userId}` }, () => {
        void loadNotifications()
      })
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [loadNotifications, open, userId])

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previousOverflow }
  }, [open])

  const unread = items.filter(n => !n.is_read)
  const visible = useMemo(() => items.filter(n => filter === 'all' || (filter === 'unread' ? !n.is_read : n.is_read)), [items, filter])

  function closeDrawer() {
    setFilter('all')
    onClose()
  }

  async function openNotification(notification: Notification) {
    if (!notification.is_read) {
      setItems(current => current.map(n => n.id === notification.id ? { ...n, is_read: true } : n))
      onUnreadCountChange(Math.max(0, unread.length - 1))
      await createClient().from('notifications').update({ is_read: true }).eq('id', notification.id)
    }
    closeDrawer()
    if (notification.ticket_id) router.push(`${isClient ? '/portal/tickets' : '/tickets'}/${notification.ticket_id}`)
    else if (notification.task_id) router.push(`${isClient ? '/portal/tasks' : '/tasks'}/${notification.task_id}`)
  }

  async function markAllRead() {
    if (unread.length === 0 || markingAll) return
    setMarkingAll(true)
    const ids = unread.map(n => n.id)
    setItems(current => current.map(n => ({ ...n, is_read: true })))
    onUnreadCountChange(0)
    await createClient().from('notifications').update({ is_read: true }).in('id', ids)
    setMarkingAll(false)
  }

  return (
    <>
      <div className={cn('notification-drawer-backdrop', open && 'notification-drawer-backdrop-open')} onClick={closeDrawer} aria-hidden="true" />
        <aside className={cn('notification-drawer max-[520px]:w-[100vw] max-[520px]:rounded-[18px_0_0_18px]', open && 'notification-drawer-open')} aria-label="Notifications" aria-hidden={!open}>
          <header className="notification-drawer-header flex items-center justify-between max-[520px]:px-4">
          <h2>Notifications</h2>
          <button type="button" className="notification-drawer-close" onClick={closeDrawer} aria-label="Close notifications"><X /></button>
        </header>
        <div className="notification-drawer-filters flex flex-wrap items-center gap-2 max-[520px]:px-4" role="tablist" aria-label="Notification filters">
          {(['all', 'unread', 'read'] as Filter[]).map(value => (
            <button key={value} type="button" role="tab" aria-selected={filter === value} className={cn('notification-filter', filter === value && 'notification-filter-active')} onClick={() => setFilter(value)}>
              {value[0].toUpperCase() + value.slice(1)}{value === 'unread' && unread.length > 0 ? ` ${unread.length}` : ''}
            </button>
          ))}
          {filter === 'unread' && (
            <button type="button" className="notification-mark-all max-[520px]:ml-0 max-[520px]:w-full" onClick={() => void markAllRead()} disabled={markingAll}>
              {markingAll && <Loader2 className="animate-spin" />}<CheckCheck /> Mark all read
            </button>
          )}
        </div>
        <div className="notification-drawer-list max-[520px]:p-2">
          {loading && items.length === 0 ? <div className="notification-drawer-state"><Loader2 className="animate-spin" /> Loading notifications…</div> : visible.length === 0 ? <div className="notification-drawer-state"><NotificationIcon aria-hidden="true" /><span>{filter === 'all' ? "You're all caught up." : `No ${filter} notifications.`}</span></div> : visible.map(notification => {
            const Icon = ICONS[notification.type] ?? NotificationIcon
            return (
              <button key={notification.id} type="button" className={cn('notification-drawer-item flex w-full items-start gap-3', !notification.is_read && 'notification-drawer-item-unread')} onClick={() => void openNotification(notification)}>
                <span className="notification-drawer-item-icon"><Icon /></span>
                <span className="notification-drawer-item-copy">
                  <strong>{notification.title}</strong>
                  {notification.body && <span>{notification.body}</span>}
                  <time>{formatRelative(notification.created_at)}</time>
                </span>
                {!notification.is_read && <span className="notification-drawer-unread-dot" aria-label="Unread" />}
              </button>
            )
          })}
        </div>
      </aside>
    </>
  )
}
