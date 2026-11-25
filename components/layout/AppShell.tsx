'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import {
  ChevronLeft, ChevronRight, Loader2, Menu, User, WifiOff, X,
} from 'lucide-react'
import {
  LuBriefcase as Briefcase,
  LuBuilding2 as Building2,
  LuChartPie as PieChart,
  LuCircleUserRound as UserCircle,
  LuClipboardList as ClipboardList,
  LuFilePenLine as FileSignature,
  LuFlame as Flame,
  LuLayers as Layers,
  LuLayoutDashboard,
  LuListTodo as ListTodo,
  LuSettings2 as Settings2,
  LuShieldCheck as ShieldCheck,
  LuUserPlus as UserPlus,
  LuUsers as Users,
} from 'react-icons/lu'
import { IoLogOutOutline as SignOutIcon, IoSettingsOutline as Settings } from 'react-icons/io5'
import { createClient } from '@/lib/supabase/client'
import { Logo } from '@/components/layout/Logo'
import { Avatar, CompanyAvatar } from '@/components/ui/primitives'
import { NotificationIcon as SprigNotificationIcon } from '@/components/shared/NotificationIcon'
import { ROLE_LABELS } from '@/lib/constants'
import { cn, errorMessage } from '@/lib/utils'
import { showErrorToast, showSuccessToast } from '@/lib/ui-toast'
import type { AppRole } from '@/types/database'

// These features are not needed to paint the shell or page content. Keep them
// out of the critical shell bundle; the drawer is loaded on demand and the
// assignment alert hydrates immediately after the first paint.
const NotificationDrawer = dynamic(() => import('@/components/shared/NotificationDrawer').then(module => module.NotificationDrawer), { ssr: false })
const TaskAssignmentAlert = dynamic(() => import('@/components/shared/TaskAssignmentAlert').then(module => module.TaskAssignmentAlert), { ssr: false })

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
  kind: 'tasks' | 'task_activity' | 'task_schedules' | 'ticket_activity' | 'tickets' | 'notifications' | 'clients'
  changedClientId?: string
  workChange?: RealtimeWorkChange
}

const STAFF_NAV: NavGroup[] = [
  {
    items: [
      { href: '/dashboard',     label: 'Dashboard',   icon: LuLayoutDashboard },
      { href: '/tickets',       label: 'Tickets',     icon: ClipboardList, roles: ['super_admin', 'manager', 'team_lead'] },
      { href: '/tasks',         label: 'Tasks',       icon: ListTodo },
      { href: '/urgent',        label: 'Urgent pool', icon: Flame, badge: 'urgent' },
      { href: '/clients',       label: 'Clients',     icon: Building2, roles: ['super_admin', 'manager', 'team_lead'] },
      { href: '/team',          label: 'Team',        icon: Users, roles: ['super_admin', 'manager', 'team_lead'] },
      { href: '/reports',       label: 'Reports',     icon: PieChart, roles: ['super_admin', 'manager'] },
      { href: '/settings',      label: 'Settings',    icon: Settings },
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
      { href: '/portal',             label: 'Overview',    icon: LuLayoutDashboard },
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
  const [notificationDrawerOpen, setNotificationDrawerOpen] = useState(false)
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
    const syncActivePill = () => {
      document.querySelectorAll<HTMLElement>('.sidebar-nav-scroll').forEach(nav => {
        const active = nav.querySelector<HTMLElement>('.sidebar-nav-item-active')
        const pill = nav.querySelector<HTMLElement>('.sidebar-nav-active-pill')
        if (!active || !pill) return
        const navBox = nav.getBoundingClientRect()
        const activeBox = active.getBoundingClientRect()
        const firstPosition = pill.dataset.positioned !== 'true'
        const y = activeBox.top - navBox.top + nav.scrollTop
        pill.style.height = `${activeBox.height}px`
        if (firstPosition) {
          pill.classList.remove('is-ready')
          pill.style.transform = `translateY(${y}px) scale(0.86)`
          pill.style.opacity = '0'
        } else {
          pill.style.transform = `translateY(${y}px) scale(1)`
          pill.style.opacity = '1'
        }
        if (firstPosition) {
          pill.dataset.positioned = 'true'
          requestAnimationFrame(() => {
            pill.classList.add('is-ready')
            pill.style.transform = `translateY(${y}px) scale(1)`
            pill.style.opacity = '1'
          })
        } else {
          pill.classList.add('is-ready')
        }
      })
    }
    const frame = requestAnimationFrame(syncActivePill)
    window.addEventListener('resize', syncActivePill)
    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', syncActivePill) }
  }, [pathname, collapsed, isClient, open])

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
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
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
      const cooldown = lastPageRefreshAt ? Math.max(0, 150 - (Date.now() - lastPageRefreshAt)) : 50
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
    const refreshForTaskActivityChange = () => {
      // Activity rows are created by status/assignment triggers. Refresh the
      // open task/detail/list immediately so the timeline and current status
      // never wait for a manual browser reload.
      if (routeMatches(['/dashboard', '/urgent', '/portal/tasks']) || pathnameRef.current === '/tasks'
        || routeMatches(['/tasks/', '/tickets/', '/portal/tickets/'])) {
        schedulePageRefresh()
      }
    }
    const refreshForTaskScheduleChange = (taskId?: string) => {
      if (routeMatches(['/dashboard', '/urgent', '/portal/tasks']) || pathnameRef.current === '/tasks'
        || (taskId && isMatchingDetailRoute('/tasks/', taskId))
        || routeMatches(['/tasks/'])) {
        schedulePageRefresh()
      }
    }
    const refreshForTicketActivityChange = () => {
      if (routeMatches(['/dashboard', '/urgent', '/tickets', '/portal/tickets'])
        || routeMatches(['/tickets/', '/portal/tickets/'])) {
        schedulePageRefresh()
      }
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
      // Notifications are user-facing and should update as soon as Realtime
      // delivers the row; do not wait for the general 350ms batching window.
      void refreshCounts(new Set(['notifications']))
      if (routeMatches(['/notifications', '/portal/notifications'])) router.refresh()
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
      else if (kind === 'task_activity') refreshForTaskActivityChange()
      else if (kind === 'task_schedules') refreshForTaskScheduleChange(workChange?.id)
      else if (kind === 'ticket_activity') refreshForTicketActivityChange()
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
          .on('postgres_changes', { event: '*', schema: 'public', table: 'task_activity' }, () => {
            handleRealtimeChange('task_activity')
          })
          .on('postgres_changes', { event: '*', schema: 'public', table: 'task_schedules' }, payload => {
            const next = payload.new as { task_id?: unknown; current_task_id?: unknown }
            const previous = payload.old as { task_id?: unknown; current_task_id?: unknown }
            const taskId = typeof next.current_task_id === 'string' ? next.current_task_id
              : typeof next.task_id === 'string' ? next.task_id
              : typeof previous.current_task_id === 'string' ? previous.current_task_id
              : typeof previous.task_id === 'string' ? previous.task_id : undefined
            handleRealtimeChange('task_schedules', undefined, taskId ? { id: taskId } : undefined)
          })
          .on('postgres_changes', { event: '*', schema: 'public', table: 'ticket_activity' }, () => {
            handleRealtimeChange('ticket_activity')
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
            if (reconnectTimer) clearTimeout(reconnectTimer)
            reconnectTimer = setTimeout(() => {
              reconnectTimer = null
              if (active && navigator.onLine) setNetworkRevision(revision => revision + 1)
            }, 1000)
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
      if (reconnectTimer) clearTimeout(reconnectTimer)
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
    setNotificationDrawerOpen(false)
  }, [pathname])

  // Close profile dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e: PointerEvent) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
        setProfileMenuOpen(false)
      }
    }
    document.addEventListener('pointerdown', handleClickOutside)
    return () => document.removeEventListener('pointerdown', handleClickOutside)
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
      className="app-sidebar-toggle absolute -right-3 top-5 z-40 flex h-6 w-6 items-center justify-center rounded-full [box-shadow:0_1px_2px_0_rgb(2_43_59_/_0.04),0_1px_3px_0_rgb(2_43_59_/_0.06)]"
    >
      {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
    </button>
  )

  const renderSidebar = (compact: boolean, desktop: boolean) => (
    <div className="sidebar-content-clip flex h-full flex-col">
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

      <nav className={cn('sidebar-nav-scroll flex-1 overflow-y-auto py-3', compact ? 'sidebar-nav-compact space-y-3 px-2' : 'space-y-6 px-3')}>
        <span className="sidebar-nav-active-pill" aria-hidden="true" />
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
                        'sidebar-nav-link',
                        compact ? 'sidebar-nav-link-compact' : 'sidebar-nav-link-expanded',
                        active ? 'sidebar-nav-active sidebar-nav-item-active' : 'sidebar-nav-item-inactive',
                      )}
                    >
                      <item.icon
                        className={cn('sidebar-nav-icon', active ? 'sidebar-nav-icon-active' : 'sidebar-nav-icon-inactive')}
                      />
                      {!compact && <span className="sidebar-nav-label">{item.label}</span>}
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
      <div className="sidebar-profile-footer relative border-t border-slate-200 p-2" ref={profileMenuRef}>
        {signOutError && !compact && <p role="alert" className="mb-2 px-2 text-xs text-red-600">Could not sign out. Please try again.</p>}
        <div className={cn('sidebar-profile-row', compact && 'sidebar-profile-row-compact')}>
          <button
            type="button"
            onClick={() => setProfileMenuOpen(v => !v)}
            className={cn('sidebar-profile-trigger', compact && 'sidebar-profile-trigger-compact')}
            aria-expanded={profileMenuOpen}
            aria-haspopup="menu"
          >
            <span className="sidebar-profile-avatar" title={compact ? `${user.name || user.email} · ${ROLE_LABELS[user.role]}` : undefined}>
              {isClient
                ? <CompanyAvatar name={user.name || user.email} src={companyProfileImageUrl} size="md" rounded />
                : <Avatar name={user.name || user.email} src={liveAvatarUrl} role={user.role} size="md" />}
            </span>
            {!compact && (
              <span className="sidebar-profile-content">
                <span className="sidebar-profile-name truncate text-sm">{user.name || user.email}</span>
                <span className="sidebar-profile-meta truncate text-xs">{ROLE_LABELS[user.role]}</span>
              </span>
            )}
          </button>
          <button
            onClick={signOut}
            disabled={signingOut}
            title={signingOut ? 'Signing out…' : 'Sign out'}
            aria-label={signingOut ? 'Signing out' : 'Sign out'}
            className="sidebar-profile-signout"
          >
            {signingOut ? <Loader2 className="animate-spin" /> : <SignOutIcon />}
          </button>
        </div>

        <div className={cn('sidebar-profile-menu', compact && 'sidebar-profile-menu-compact')} data-open={profileMenuOpen} role="menu" aria-hidden={!profileMenuOpen}>
          <Link
            href={isClient ? '/portal/profile' : '/settings'}
            prefetch={false}
            onClick={() => setProfileMenuOpen(false)}
            className="sidebar-profile-menu-item"
            role="menuitem"
            tabIndex={profileMenuOpen ? 0 : -1}
          >
            <User className="sidebar-profile-menu-icon" />
            {isClient ? 'Company profile' : 'Profile'}
          </Link>
          <button
            onClick={() => {
              setProfileMenuOpen(false)
              signOut()
            }}
            disabled={signingOut}
            className="sidebar-profile-menu-item sidebar-profile-menu-item-danger"
            role="menuitem"
            tabIndex={profileMenuOpen ? 0 : -1}
          >
            {signingOut ? <Loader2 className="sidebar-profile-menu-icon animate-spin" /> : <SignOutIcon className="sidebar-profile-menu-icon" />}
            Sign out
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="app-shell fixed inset-0 overflow-hidden">
      {/* Desktop sidebar */}
      <aside className={cn('app-sidebar app-sidebar-width-transition fixed inset-y-0 left-0 z-50 hidden lg:block',
        collapsed ? 'w-16' : 'w-64')}>
        {renderSidebar(collapsed, true)}
        {toggleButton}
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-[100] lg:hidden">
          <div className="fixed inset-0 bg-[#011B26]/40 backdrop-blur-sm transition-opacity duration-200" onClick={() => setOpen(false)} />
          <aside className="app-sidebar fixed inset-y-0 left-0 w-64 [box-shadow:0_10px_30px_-10px_rgb(2_43_59_/_0.25)]">{renderSidebar(false, false)}</aside>
        </div>
      )}

      {/* Only the area under the top bar scrolls, so the scrollbar never runs beside the top bar. */}
      <div className={cn('app-content-sidebar-transition flex h-full min-h-0 flex-col', collapsed ? 'lg:pl-16' : 'lg:pl-64')}>
        <header className="app-navbar relative z-40 flex h-16 flex-shrink-0 items-center gap-2.5 px-3 backdrop-blur sm:gap-3 sm:px-6">
          <button className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu className="h-[22px] w-[22px]" />
          </button>
          <div className="relative top-1 inline-flex shrink-0 items-center lg:hidden sm:top-0"><Logo className="h-6 sm:h-6" priority /></div>
          {pageTitle && (
            <div className="hidden min-w-0 items-center gap-2.5 sm:flex">
              <span className="hidden h-6 w-px bg-slate-200 sm:block lg:hidden" />
              <p className="app-navbar-title truncate font-sans text-xl">{pageTitle}</p>
            </div>
          )}
          <div className="min-h-0 flex-1" />

          {/* Right Header Navigation */}
          <div className="flex items-center gap-2.5">
            {/* Notification Bell */}
            <button
              type="button"
              onClick={() => setNotificationDrawerOpen(true)}
              className="app-navbar-notification relative inline-flex h-9 w-9 items-center justify-center rounded-xl shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#045E80] focus-visible:ring-offset-2"
              aria-label="Notifications"
              aria-expanded={notificationDrawerOpen}
            >
        <SprigNotificationIcon className="h-5 w-5" />
              {liveCounts.notifications > 0 && (
                <span className="absolute -right-0.5 -top-0.5 inline-grid h-4 min-w-4 translate-x-1/4 -translate-y-1/4 place-items-center rounded-full bg-[#95C12C] px-1 text-center text-[9px] font-semibold leading-none tabular-nums text-white ring-2 ring-white">
                  {liveCounts.notifications > 9 ? '9+' : liveCounts.notifications}
                </span>
              )}
            </button>

          </div>
        </header>
        <NotificationDrawer
          open={notificationDrawerOpen}
          userId={user.id}
          isClient={isClient}
          onClose={() => setNotificationDrawerOpen(false)}
          onUnreadCountChange={count => setLiveCounts(current => ({ ...current, notifications: count }))}
        />
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
        <div className="app-main min-h-0 flex-1 overflow-x-hidden overflow-y-auto [scrollbar-color:#9aa8b8_transparent] [scrollbar-width:thin]">
          <main className="app-page-main mx-auto w-full">
            {children}
          </main>
        </div>
      </div>
    </div>
  )
}
