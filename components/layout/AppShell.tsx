'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Bell, Briefcase, Building2, ChevronDown, ChevronLeft, ChevronRight,
  ClipboardList, FileSignature, Flame, LayoutDashboard, Layers, ListTodo, Loader2, LogOut,
  Menu, PieChart, Settings, Settings2, ShieldCheck, User, UserCircle, UserPlus, Users, WifiOff, X,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Logo } from '@/components/layout/Logo'
import { Avatar, CompanyAvatar } from '@/components/ui/primitives'
import { TaskAssignmentAlert } from '@/components/shared/TaskAssignmentAlert'
import { ROLE_LABELS } from '@/lib/constants'
import { cn, errorMessage } from '@/lib/utils'
import { showErrorToast, showSuccessToast } from '@/lib/ui-toast'
import type { AppRole } from '@/types/database'

type NavItem = { href: string; label: string; icon: React.ElementType; roles?: AppRole[]; badge?: 'urgent' | 'approvals' }
type NavGroup = { label?: string; items: NavItem[] }
type RealtimeWorkChange = {
  eventType?: 'INSERT' | 'UPDATE' | 'DELETE'
  eventKey?: string
  id?: string
  ticketId?: string | null
  previousStatus?: string | null
  nextStatus?: string | null
  previousUrgent?: boolean
  nextUrgent?: boolean
  previousUnassigned?: boolean
  nextUnassigned?: boolean
}
type RealtimeEvent = {
  kind: 'tasks' | 'tickets' | 'notifications' | 'clients'
  changedClientId?: string
  workChange?: RealtimeWorkChange
}

const STAFF_NAV: NavGroup[] = [
  {
    items: [
      { href: '/dashboard',     label: 'Dashboard',   icon: LayoutDashboard },
      { href: '/tickets',       label: 'Tickets',     icon: ClipboardList, roles: ['super_admin', 'manager', 'team_lead'] },
      { href: '/tasks',         label: 'Tasks',       icon: ListTodo },
      { href: '/urgent',        label: 'Urgent pool', icon: Flame, badge: 'urgent' },
      { href: '/clients',       label: 'Clients',     icon: Building2, roles: ['super_admin', 'manager', 'team_lead'] },
      { href: '/team',          label: 'Team',        icon: Users, roles: ['super_admin', 'manager', 'team_lead'] },
      { href: '/reports',       label: 'Reports',     icon: PieChart, roles: ['super_admin', 'manager'] },
      { href: '/settings',      label: 'Setting',     icon: Settings },
    ],
  },
  {
    label: 'Manager',
    items: [
      { href: '/admin/approvals', label: 'Approvals',  icon: ShieldCheck, roles: ['super_admin'], badge: 'approvals' },
      { href: '/admin/users',     label: 'Users & invites', icon: UserPlus, roles: ['super_admin', 'manager', 'team_lead'] },
      { href: '/admin/settings',  label: 'Platforms & services', icon: Settings2, roles: ['super_admin'] },
      { href: '/admin/agreement', label: 'Agreement',  icon: FileSignature, roles: ['super_admin'] },
    ],
  },
]

const CLIENT_NAV: NavGroup[] = [
  {
    items: [
      { href: '/portal',             label: 'Overview',    icon: LayoutDashboard },
      { href: '/portal/tasks',       label: 'Tasks',       icon: ListTodo },
      { href: '/portal/tickets',     label: 'My tickets', icon: ClipboardList },
      { href: '/portal/tickets/new', label: 'New ticket', icon: Briefcase },
      { href: '/portal/services',    label: 'My services', icon: Layers },
      { href: '/portal/profile',     label: 'Company profile', icon: UserCircle },
    ],
  },
]

const COLLAPSE_KEY = 'gp.sidebar.collapsed'

export type ShellUser = { id?: string; name: string; email: string; role: AppRole; jobTitle: string | null; avatarUrl?: string | null }
export type ShellCounts = { notifications: number; urgent?: number; approvals?: number }

export function AppShell({
  user, counts, companyName, companyProfileImageUrl, children,
}: { user: ShellUser; counts: ShellCounts; companyName?: string; companyProfileImageUrl?: string | null; children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)          // mobile drawer
  const [collapsed, setCollapsed] = useState(false) // desktop: icons-only sidebar
  const [signingOut, setSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState(false)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [liveCounts, setLiveCounts] = useState(counts)
  const [isOffline, setIsOffline] = useState(false)
  const [networkRevision, setNetworkRevision] = useState(0)
  const realtimeUnavailableRef = useRef(false)
  const realtimeConnectedRef = useRef(false)
  const realtimeRecoveryPendingRef = useRef(false)
  const isClient = user.role === 'client'
  const [liveAvatarUrl, setLiveAvatarUrl] = useState<string | null>(isClient ? null : user.avatarUrl ?? null)
  const profileMenuRef = useRef<HTMLDivElement>(null)
  const pathnameRef = useRef(pathname)
  pathnameRef.current = pathname

  useEffect(() => {
    if (!isClient) setLiveAvatarUrl(user.avatarUrl ?? null)
  }, [isClient, user.avatarUrl])

  useEffect(() => {
    const handleOffline = () => {
      const wasConnected = realtimeConnectedRef.current
      setIsOffline(true)
      realtimeUnavailableRef.current = true
      if (wasConnected) {
        realtimeRecoveryPendingRef.current = true
        showErrorToast('Connection lost. Live updates are paused.')
      }
    }
    const handleOnline = () => {
      setIsOffline(false)
      setNetworkRevision(revision => revision + 1)
    }

    const offline = !navigator.onLine
    setIsOffline(offline)
    if (offline) {
      realtimeUnavailableRef.current = true
    }
    window.addEventListener('offline', handleOffline)
    window.addEventListener('online', handleOnline)
    return () => {
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('online', handleOnline)
    }
  }, [])

  useEffect(() => {
    if (!user.id || isClient) return
    function handleProfileAvatarChange(event: Event) {
      const avatarUrl = (event as CustomEvent<string | null>).detail
      setLiveAvatarUrl(avatarUrl)
    }
    window.addEventListener('gp:profile-avatar-change', handleProfileAvatarChange)

    return () => {
      window.removeEventListener('gp:profile-avatar-change', handleProfileAvatarChange)
    }
  }, [isClient, user.id])

  useEffect(() => {
    if (!user.id) return
    const userId = user.id
    let active = true
    let refreshTimer: ReturnType<typeof setTimeout> | null = null
    let countsTimer: ReturnType<typeof setTimeout> | null = null
    let lastPageRefreshAt = 0
    let pageRefreshQueued = false
    const pendingCountRefreshes = new Set<'notifications' | 'urgent' | 'approvals'>()
    const changesWhileHidden: RealtimeEvent[] = []
    const supabase = createClient()
    let channel: ReturnType<typeof supabase.channel> | null = null

    const refreshCounts = async (kinds: Set<'notifications' | 'urgent' | 'approvals'>) => {
      if (!kinds.size) return
      try {
        const { data, error } = await supabase.rpc('staff_shell_counts', {
          p_include_notifications: kinds.has('notifications'),
          p_include_urgent: kinds.has('urgent') && !isClient,
          p_include_approvals: kinds.has('approvals') && !isClient && user.role === 'super_admin',
        })
        if (error) throw error
        const result = Array.isArray(data) ? data[0] : data
        if (!result) throw new Error('The live badge counts were empty.')
        const updates: Partial<ShellCounts> = {}
        if (kinds.has('notifications')) updates.notifications = Number(result.unread_notifications_count) || 0
        if (kinds.has('urgent') && !isClient) updates.urgent = Number(result.urgent_count) || 0
        if (kinds.has('approvals') && !isClient && user.role === 'super_admin') {
          updates.approvals = Number(result.pending_clients_count) || 0
        }
        if (!active) return
        setLiveCounts(previous => ({ ...previous, ...updates }))
      } catch {
        if (active) showErrorToast('Live counts could not be refreshed. Notification, urgent-task, and approval badges may be out of date; refresh the page to try again.')
      }
    }

    const schedulePageRefresh = () => {
      pageRefreshQueued = true
      if (refreshTimer) return
      const cooldown = lastPageRefreshAt ? Math.max(0, 500 - (Date.now() - lastPageRefreshAt)) : 250
      refreshTimer = setTimeout(() => {
        refreshTimer = null
        if (!active || !pageRefreshQueued) return
        pageRefreshQueued = false
        lastPageRefreshAt = Date.now()
        router.refresh()
      }, cooldown)
    }
    const scheduleCountRefresh = (kind: 'notifications' | 'urgent' | 'approvals') => {
      pendingCountRefreshes.add(kind)
      if (countsTimer) clearTimeout(countsTimer)
      countsTimer = setTimeout(() => {
        const kinds = new Set(pendingCountRefreshes)
        pendingCountRefreshes.clear()
        void refreshCounts(kinds)
      }, 350)
    }
    const routeMatches = (paths: string[]) => paths.some(path => {
      const currentPath = pathnameRef.current
      return currentPath === path || currentPath.startsWith(`${path}/`)
    })
    const isMatchingDetailRoute = (prefix: '/tasks/' | '/tickets/' | '/portal/tickets/', recordId?: string) => {
      const currentPath = pathnameRef.current
      const match = currentPath.match(new RegExp(`^${prefix.replaceAll('/', '\\/')}([^/]+)$`))
      if (!match || match[1] === 'new' || match[1].endsWith('/edit')) return false
      return !recordId || match[1] === recordId
    }
    const refreshForTaskChange = (change?: RealtimeWorkChange) => {
      const changesUrgentCount = change
        ? ([change.previousUrgent, change.nextUrgent].includes(true)
          && (change.previousUnassigned === true || change.nextUnassigned === true))
        : true
      if (changesUrgentCount) scheduleCountRefresh('urgent')
      if (routeMatches(['/dashboard', '/urgent', '/portal/tasks']) || pathnameRef.current === '/tasks') {
        schedulePageRefresh()
        return
      }
      if (isMatchingDetailRoute('/tasks/', change?.id)) {
        schedulePageRefresh()
        return
      }
      if (change?.ticketId && isMatchingDetailRoute('/tickets/', change.ticketId)) schedulePageRefresh()
    }
    const refreshForTicketChange = (change?: RealtimeWorkChange) => {
      if (change) {
        window.dispatchEvent(new CustomEvent('gp:ticket-count-change', { detail: change }))
      }
      const affectsUrgentCount = change
        ? ([change.previousStatus, change.nextStatus].includes('unassigned')
          && (change.previousUrgent === true || change.nextUrgent === true))
        : true
      if (affectsUrgentCount && !isClient && ['super_admin', 'manager', 'team_lead'].includes(user.role)) scheduleCountRefresh('urgent')
      const currentPath = pathnameRef.current
      if (currentPath === '/dashboard' || currentPath === '/urgent') {
        schedulePageRefresh()
        return
      }
      if (currentPath === '/tickets') {
        const selectedStatus = new URLSearchParams(window.location.search).get('status') ?? 'unassigned'
        const unknownUpdateStatus = change?.eventType === 'UPDATE'
          && (change.previousStatus == null || change.nextStatus == null)
        const affectsSelectedTab = !!change && [change.previousStatus, change.nextStatus].includes(selectedStatus)
        if (!change || unknownUpdateStatus || affectsSelectedTab) schedulePageRefresh()
        return
      }
      if (isMatchingDetailRoute('/tickets/', change?.id)) {
        schedulePageRefresh()
        return
      }
      if (currentPath === '/portal/tickets' || routeMatches(['/portal/tickets/'])) schedulePageRefresh()
    }
    const refreshForNotificationChange = () => {
      scheduleCountRefresh('notifications')
      if (routeMatches(['/notifications', '/portal/notifications'])) schedulePageRefresh()
    }
    const refreshForClientChange = (changedClientId?: string) => {
      if (!isClient && user.role === 'super_admin') scheduleCountRefresh('approvals')
      const currentPath = pathnameRef.current
      const clientDetail = currentPath.match(/^\/clients\/([^/]+)$/)
      const isRelevantClientPage = currentPath === '/clients'
        || routeMatches(['/dashboard', '/admin/approvals'])
        || (!!clientDetail && (!changedClientId || clientDetail[1] === changedClientId))
      if (isRelevantClientPage) schedulePageRefresh()
    }
    const handleRealtimeChange = (kind: RealtimeEvent['kind'], changedClientId?: string, workChange?: RealtimeWorkChange) => {
      if (document.visibilityState === 'hidden') {
        // Keep enough payload to decide whether this event affects the page
        // currently open when the user returns to the browser tab.
        if (changesWhileHidden.length < 500) changesWhileHidden.push({ kind, changedClientId, workChange })
        return
      }
      if (kind === 'tasks') refreshForTaskChange(workChange)
      else if (kind === 'tickets') refreshForTicketChange(workChange)
      else if (kind === 'notifications') refreshForNotificationChange()
      else refreshForClientChange(changedClientId)
    }
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible' || changesWhileHidden.length === 0) return
      const missedChanges = changesWhileHidden.splice(0)
      missedChanges.forEach(({ kind, changedClientId, workChange }) =>
        handleRealtimeChange(kind, changedClientId, workChange),
      )
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    void (async () => {
      try {
        const { data, error } = await supabase.auth.getSession()
        if (error) throw error
        if (!active) return
        if (data.session?.access_token) await supabase.realtime.setAuth(data.session.access_token)
        if (!active) return

        const nextChannel = supabase
          .channel(`app-live-${userId}-${crypto.randomUUID()}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, payload => {
            const newTask = payload.new as { id?: unknown; ticket_id?: unknown; is_urgent?: unknown; assignee_id?: unknown; status?: unknown }
            const oldTask = payload.old as { id?: unknown; ticket_id?: unknown; is_urgent?: unknown; assignee_id?: unknown; status?: unknown }
            handleRealtimeChange('tasks', undefined, {
              id: typeof newTask.id === 'string' ? newTask.id : typeof oldTask.id === 'string' ? oldTask.id : undefined,
              ticketId: typeof newTask.ticket_id === 'string' ? newTask.ticket_id
                : typeof oldTask.ticket_id === 'string' ? oldTask.ticket_id : null,
              previousStatus: typeof oldTask.status === 'string' ? oldTask.status : null,
              nextStatus: typeof newTask.status === 'string' ? newTask.status : null,
              previousUrgent: oldTask.is_urgent === true,
              nextUrgent: newTask.is_urgent === true,
              previousUnassigned: oldTask.assignee_id === null,
              nextUnassigned: newTask.assignee_id === null,
            })
          })
          .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, payload => {
            const newTicket = payload.new as { id?: unknown; status?: unknown; is_urgent?: unknown }
            const oldTicket = payload.old as { id?: unknown; status?: unknown; is_urgent?: unknown }
            handleRealtimeChange('tickets', undefined, {
              eventType: payload.eventType,
              eventKey: typeof payload.commit_timestamp === 'string'
                ? `${payload.commit_timestamp}:${typeof newTicket.id === 'string' ? newTicket.id : oldTicket.id}:${payload.eventType}`
                : undefined,
              id: typeof newTicket.id === 'string' ? newTicket.id : typeof oldTicket.id === 'string' ? oldTicket.id : undefined,
              previousStatus: typeof oldTicket.status === 'string' ? oldTicket.status : null,
              nextStatus: typeof newTicket.status === 'string' ? newTicket.status : null,
              previousUrgent: oldTicket.is_urgent === true,
              nextUrgent: newTicket.is_urgent === true,
            })
          })
          .on('postgres_changes', {
            event: '*', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${userId}`,
          }, () => handleRealtimeChange('notifications'))

        if (!isClient && user.role === 'super_admin') {
          nextChannel.on('postgres_changes', { event: '*', schema: 'public', table: 'clients' }, payload => {
            const newClient = payload.new as { id?: unknown }
            const oldClient = payload.old as { id?: unknown }
            const changedClientId = typeof newClient.id === 'string' ? newClient.id
              : typeof oldClient.id === 'string' ? oldClient.id : undefined
            handleRealtimeChange('clients', changedClientId)
          })
        }

        channel = nextChannel
        nextChannel.subscribe(status => {
          if (!active) return
          if (status === 'SUBSCRIBED') {
            const wasConnected = realtimeConnectedRef.current
            const shouldAnnounceRecovery = realtimeRecoveryPendingRef.current && wasConnected && navigator.onLine
            realtimeUnavailableRef.current = false
            realtimeConnectedRef.current = true
            realtimeRecoveryPendingRef.current = false
            if (shouldAnnounceRecovery) {
              router.refresh()
              showSuccessToast('Live connection restored.')
            }
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            const shouldNotify = !realtimeUnavailableRef.current && realtimeConnectedRef.current && navigator.onLine
            realtimeUnavailableRef.current = true
            if (realtimeConnectedRef.current && navigator.onLine) realtimeRecoveryPendingRef.current = true
            if (shouldNotify) showErrorToast('Live updates paused. Retrying…')
          }
        })
        const initialCounts = new Set<'notifications' | 'urgent' | 'approvals'>(['notifications'])
        if (!isClient) initialCounts.add('urgent')
        if (!isClient && user.role === 'super_admin') initialCounts.add('approvals')
        await refreshCounts(initialCounts)
      } catch (subscriptionError) {
        if (active) {
          const shouldNotify = !realtimeUnavailableRef.current && realtimeConnectedRef.current && navigator.onLine
          realtimeUnavailableRef.current = true
          if (realtimeConnectedRef.current && navigator.onLine) realtimeRecoveryPendingRef.current = true
          if (shouldNotify) showErrorToast(`Live updates paused. ${errorMessage(subscriptionError)}`)
        }
      }
    })()

    return () => {
      active = false
      if (refreshTimer) clearTimeout(refreshTimer)
      if (countsTimer) clearTimeout(countsTimer)
      if (channel) void supabase.removeChannel(channel)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [isClient, user.id, user.role, router, networkRevision])

  const groups = (isClient ? CLIENT_NAV : STAFF_NAV)
    .map(g => ({ ...g, items: g.items.filter(i => !i.roles || i.roles.includes(user.role)) }))
    .filter(g => g.items.length > 0)
  const notificationsHref = isClient ? '/portal/notifications' : '/notifications'

  useEffect(() => {
    const previousHtmlOverflow = document.documentElement.style.overflow
    const previousBodyOverflow = document.body.style.overflow
    document.documentElement.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'
    return () => {
      document.documentElement.style.overflow = previousHtmlOverflow
      document.body.style.overflow = previousBodyOverflow
    }
  }, [])

  useEffect(() => {
    setOpen(false)
    setProfileMenuOpen(false)
  }, [pathname])

  // Close profile dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
        setProfileMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Remember the desktop sidebar choice per browser.
  useEffect(() => {
    try { setCollapsed(localStorage.getItem(COLLAPSE_KEY) === '1') } catch { /* storage blocked */ }
  }, [])
  function toggleCollapsed() {
    setCollapsed(c => {
      try { localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1') } catch { /* storage blocked */ }
      return !c
    })
  }
  // Ctrl/Cmd + B toggles the sidebar (not while typing).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null
      if (el?.closest?.('input, textarea, select, [contenteditable="true"]')) return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') { e.preventDefault(); toggleCollapsed() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const isActive = (href: string) =>
    href === '/portal' || href === '/dashboard'
      ? pathname === href
      : href === '/portal/tickets'
        ? pathname.startsWith(href) && pathname !== '/portal/tickets/new'
        : pathname === href || pathname.startsWith(href + '/')

  // Current page name for the top bar: the active nav item, longest match first.
  const activeItem = groups.flatMap(g => g.items)
    .filter(i => isActive(i.href))
    .sort((a, b) => b.href.length - a.href.length)[0]
  const pageTitle = activeItem?.label ?? (pathname.startsWith(notificationsHref) ? 'Notifications' : '')

  async function signOut() {
    if (signingOut) return
    setSigningOut(true)
    setSignOutError(false)
    try {
      const { error } = await createClient().auth.signOut()
      if (error) throw error
      router.push('/login')
      router.refresh()
    } catch {
      setSigningOut(false)
      setSignOutError(true)
    }
  }

  const toggleButton = (
    <button
      onClick={toggleCollapsed}
      title={collapsed ? 'Show sidebar (Ctrl+B)' : 'Hide sidebar (Ctrl+B)'}
      aria-label={collapsed ? 'Show sidebar' : 'Hide sidebar'}
      aria-expanded={!collapsed}
      className="absolute -right-3 top-5 z-40 flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 [box-shadow:0_1px_2px_0_rgb(2_43_59_/_0.04),0_1px_3px_0_rgb(2_43_59_/_0.06)] transition hover:border-[#63A9C4] hover:bg-[#EAF4F8] hover:text-[#034C68]"
    >
      {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
    </button>
  )

  const renderSidebar = (compact: boolean, desktop: boolean) => (
    <div className="flex h-full flex-col">
      {compact ? (
        <div className="flex h-16 items-center justify-center px-2">
          <Link href={isClient ? '/portal' : '/dashboard'} prefetch={false} title="GoPortals">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#045E80] font-sans text-sm font-extrabold text-white">G<span className="text-[#A5CD3F]">P</span></span>
          </Link>
        </div>
      ) : (
        <div className="flex h-16 items-center justify-between gap-2 pl-5 pr-3">
          <Link href={isClient ? '/portal' : '/dashboard'} prefetch={false} title="GoPortals"><Logo priority /></Link>
          {!desktop && <button className="rounded-lg p-1 text-slate-400 hover:bg-slate-100" onClick={() => setOpen(false)} aria-label="Close menu"><X className="h-5 w-5" /></button>}
        </div>
      )}

      {companyName && !compact && (
        <div className="mx-4 mb-2 rounded-lg bg-[#EAF4F8] px-3 py-2">
          <p className="text-xs font-medium uppercase tracking-wide text-[#0A6F94]">Client portal</p>
          <p className="truncate text-sm font-semibold text-[#022B3B]">{companyName}</p>
        </div>
      )}

      <nav className={cn('flex-1 overflow-y-auto py-3', compact ? 'space-y-3 px-2' : 'space-y-6 px-3')}>
        {groups.map((group, gi) => (
          <div key={gi}>
            {group.label && (compact
              ? <div className="mx-2 mb-3 border-t border-slate-100" />
              : <p className="mb-1.5 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">{group.label}</p>)}
            <ul className="space-y-0.5">
              {group.items.map(item => {
                const active = isActive(item.href)
                const count = item.badge === 'urgent' ? liveCounts.urgent : item.badge === 'approvals' ? liveCounts.approvals : 0
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      prefetch={false}
                      title={compact ? item.label + (count ? ` (${count})` : '') : undefined}
                      aria-label={compact ? item.label : undefined}
                      className={cn(
                        'group relative flex items-center rounded-lg py-2 text-sm font-medium transition-colors',
                        compact ? 'justify-center px-2' : 'gap-3 px-3',
                        active ? 'bg-[#EAF4F8] text-[#034C68]' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                      )}
                    >
                      {active && <span className="absolute inset-y-1.5 left-0 w-1 rounded-r-full bg-[#95C12C]" />}
                      <item.icon className={cn('h-[18px] w-[18px] flex-shrink-0', active ? 'text-[#045E80]' : 'text-slate-400 group-hover:text-slate-500')} />
                      {!compact && <span className="flex-1">{item.label}</span>}
                      {!!count && (compact
                        ? <span className={cn('absolute right-1 top-1 h-2 w-2 rounded-full', item.badge === 'urgent' ? 'bg-gradient-to-r from-red-600 to-rose-500' : 'bg-[#95C12C]')} />
                        : <span className={cn('flex items-center justify-center rounded-full text-xs font-bold leading-none',
                            item.badge === 'urgent'
                              ? 'h-5 w-5 shrink-0 bg-gradient-to-r from-red-600 to-rose-500 text-white'
                              : 'px-2 py-0.5 bg-[#95C12C] text-[#011B26]')}>{count}</span>)}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Sidebar Footer: User details (not clickable as link) */}
      <div className={cn('border-t border-slate-200', compact ? 'p-2' : 'p-3')}>
        {signOutError && !compact && <p role="alert" className="mb-2 px-2 text-xs text-red-600">Could not sign out. Please try again.</p>}
        <div className={cn('flex items-center rounded-lg', compact ? 'flex-col gap-2 py-1' : 'gap-3 px-2 py-2')}>
          <span title={compact ? `${user.name || user.email} · ${ROLE_LABELS[user.role]}` : undefined}>
            {isClient
              ? <CompanyAvatar name={user.name || user.email} src={companyProfileImageUrl} size="md" rounded />
              : <Avatar name={user.name || user.email} src={liveAvatarUrl} role={user.role} size="md" />}
          </span>
          {!compact && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-900">{user.name || user.email}</p>
              <p className="truncate text-xs text-slate-500">{ROLE_LABELS[user.role]}</p>
            </div>
          )}
          <button
            onClick={signOut}
            disabled={signingOut}
            title={signingOut ? 'Signing out…' : 'Sign out'}
            aria-label={signingOut ? 'Signing out' : 'Sign out'}
            className={cn(
              'group inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition-all duration-150',
              'text-slate-400 hover:bg-red-50 hover:text-red-700 active:scale-90',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 focus-visible:ring-offset-2',
              'disabled:cursor-wait disabled:opacity-60',
            )}
          >
            {signingOut
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <LogOut className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />}
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#f7f7fa]">
      {/* Desktop sidebar */}
      <aside className={cn('fixed inset-y-0 left-0 z-50 hidden border-r border-slate-200 bg-white transition-[width] duration-200 lg:block',
        collapsed ? 'w-16' : 'w-64')}>
        {renderSidebar(collapsed, true)}
        {toggleButton}
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-[#011B26]/40 backdrop-blur-sm transition-opacity duration-200" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-white [box-shadow:0_10px_30px_-10px_rgb(2_43_59_/_0.25)]">{renderSidebar(false, false)}</aside>
        </div>
      )}

      {/* Only the area under the top bar scrolls, so the scrollbar never runs beside the top bar. */}
      <div className={cn('flex h-full min-h-0 flex-col transition-[padding] duration-200', collapsed ? 'lg:pl-16' : 'lg:pl-64')}>
        <header className="relative z-40 flex h-16 flex-shrink-0 items-center gap-2.5 border-b border-slate-200 bg-white/85 px-3 backdrop-blur sm:gap-3 sm:px-6">
          <button className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu className="h-[22px] w-[22px]" />
          </button>
          <div className="relative top-1 inline-flex shrink-0 items-center lg:hidden sm:top-0"><Logo className="h-6 sm:h-6" priority /></div>
          {pageTitle && (
            <div className="hidden min-w-0 items-center gap-2.5 sm:flex">
              <span className="hidden h-6 w-px bg-slate-200 sm:block lg:hidden" />
              <p className="truncate font-sans text-xl font-semibold text-slate-900">{pageTitle}</p>
            </div>
          )}
          <div className="min-h-0 flex-1" />

          {/* Right Header Navigation */}
          <div className="flex items-center gap-2.5">
            {/* Notification Bell */}
            <Link
              href={notificationsHref}
              prefetch={false}
              className="relative inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#045E80] focus-visible:ring-offset-2"
              aria-label="Notifications"
            >
              <Bell className="h-5 w-5" />
              {liveCounts.notifications > 0 && (
                <span className="absolute -right-0.5 -top-0.5 inline-grid h-4 min-w-4 translate-x-1/4 -translate-y-1/4 place-items-center rounded-full bg-[#95C12C] px-1 text-center text-[9px] font-semibold leading-none tabular-nums text-white ring-2 ring-white">
                  {liveCounts.notifications > 9 ? '9+' : liveCounts.notifications}
                </span>
              )}
            </Link>

            {/* Profile Dropdown Trigger & Floating Menu */}
            <div className="relative" ref={profileMenuRef}>
                <button
                  type="button"
                  onClick={() => setProfileMenuOpen(v => !v)}
                  className={cn(
                    'flex items-center gap-2 rounded-full border border-slate-200 bg-white px-1.5 py-1 transition-[border-color] text-left focus:outline-none select-none shadow-xs',
                    profileMenuOpen
                      ? 'border-slate-400'
                      : 'hover:border-slate-400'
                  )}
                  aria-expanded={profileMenuOpen}
                  aria-haspopup="true"
                >
                  {isClient
                    ? <CompanyAvatar name={user.name || user.email} src={companyProfileImageUrl} size="sm" rounded />
                    : <Avatar name={user.name || user.email} src={liveAvatarUrl} role={user.role} size="sm" />}
                  <div className="hidden min-w-0 sm:flex sm:flex-col sm:justify-center text-left">
                    <p className="max-w-[130px] truncate text-xs font-semibold text-slate-900 leading-[1.2]">
                      {user.name || user.email}
                    </p>
                    <p className="text-[10px] font-medium leading-[1.2] text-slate-500">
                      {ROLE_LABELS[user.role]}
                    </p>
                  </div>
                  <ChevronDown
                    className={cn(
                      'h-3 w-3 flex-shrink-0 text-slate-400 transition-transform duration-200',
                      profileMenuOpen && 'rotate-180 text-slate-700'
                    )}
                  />
                </button>

                {/* Dropdown Menu: Clean & Minimalist */}
                {profileMenuOpen && (
                  <div className="absolute right-0 top-full z-50 mt-1.5 w-48 max-w-[calc(100vw-1rem)] rounded-xl border border-slate-200/80 bg-white p-0.5 [box-shadow:0_10px_30px_-10px_rgb(2_43_59_/_0.25)] animate-in fade-in zoom-in-95 duration-100">
                    <div className="flex min-w-0 items-start gap-2 px-1.5 py-1.5">
                      {isClient
                        ? <CompanyAvatar name={user.name || user.email} src={companyProfileImageUrl} size="sm" className="mt-0.5" rounded />
                        : <Avatar name={user.name || user.email} src={liveAvatarUrl} role={user.role} size="sm" className="mt-0.5" />}
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold leading-4 text-slate-900">{user.name || user.email}</p>
                        <p className="truncate text-[11px] leading-4 text-slate-500">{user.email}</p>
                        <p className="truncate text-[11px] font-medium leading-4 text-[#045E80]">{ROLE_LABELS[user.role]}</p>
                      </div>
                    </div>

                    <div className="border-t border-slate-100 my-1" />
                    <Link
                      href={isClient ? '/portal/profile' : '/settings'}
                      prefetch={false}
                      onClick={() => setProfileMenuOpen(false)}
                      className="flex items-center gap-2 whitespace-nowrap rounded-lg px-1.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition"
                    >
                      <User className="h-4 w-4 text-slate-500" />
                      {isClient ? 'Company profile' : 'Profile'}
                    </Link>

                    <div className="border-t border-slate-100 my-1" />

                    <button
                      onClick={() => {
                        setProfileMenuOpen(false)
                        signOut()
                      }}
                      disabled={signingOut}
                      className="flex w-full items-center gap-2 whitespace-nowrap rounded-lg px-1.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 hover:text-red-700 transition"
                    >
                      {signingOut ? <Loader2 className="h-4 w-4 animate-spin text-red-600" /> : <LogOut className="h-4 w-4" />}
                      Log out
                    </button>
                  </div>
                )}
            </div>
          </div>
        </header>
        {user.id && <TaskAssignmentAlert userId={user.id} taskHref={isClient ? '/portal/tasks' : '/tasks'} />}
        {isOffline && (
          <div role="status" aria-live="polite" className="flex flex-shrink-0 items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-950 sm:px-6">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-800">
              <WifiOff className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block font-semibold">You’re offline</span>
              <span className="block text-xs text-amber-900/80">Reconnect before submitting changes. Information on this page may be out of date.</span>
            </span>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto bg-[#f7f7fa] [scrollbar-color:#9aa8b8_transparent] [scrollbar-width:thin]">
          <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 2xl:max-w-[1600px]">
            {children}
          </main>
        </div>
      </div>
    </div>
  )
}
