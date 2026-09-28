'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Bell, Briefcase, Building2, CheckSquare, ClipboardList, FileSignature, Flame, LayoutDashboard,
  ChevronLeft, ChevronRight, LogOut, Menu, PieChart, Settings2, ShieldCheck, UserPlus, Users, X,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Logo } from '@/components/layout/Logo'
import { Avatar } from '@/components/ui/primitives'
import { ROLE_LABELS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import type { AppRole } from '@/types/database'

type NavItem = { href: string; label: string; icon: React.ElementType; roles?: AppRole[]; badge?: 'urgent' | 'approvals' }
type NavGroup = { label?: string; items: NavItem[] }

const STAFF_NAV: NavGroup[] = [
  {
    items: [
      { href: '/dashboard',     label: 'Dashboard',   icon: LayoutDashboard },
      { href: '/tasks',         label: 'Tasks',       icon: CheckSquare },
      { href: '/urgent',        label: 'Urgent pool', icon: Flame, badge: 'urgent' },
      { href: '/clients',       label: 'Clients',     icon: Building2, roles: ['super_admin', 'manager'] },
      { href: '/team',          label: 'Team',        icon: Users, roles: ['super_admin', 'manager'] },
      { href: '/reports',       label: 'Reports',     icon: PieChart, roles: ['super_admin', 'manager'] },
    ],
  },
  {
    label: 'Admin',
    items: [
      { href: '/admin/approvals', label: 'Approvals',  icon: ShieldCheck, roles: ['super_admin'], badge: 'approvals' },
      { href: '/admin/users',     label: 'Users & invites', icon: UserPlus, roles: ['super_admin'] },
      { href: '/admin/settings',  label: 'Platforms & services', icon: Settings2, roles: ['super_admin'] },
      { href: '/admin/agreement', label: 'Agreement',  icon: FileSignature, roles: ['super_admin'] },
    ],
  },
]

const CLIENT_NAV: NavGroup[] = [
  {
    items: [
      { href: '/portal',           label: 'Overview',  icon: LayoutDashboard },
      { href: '/portal/tasks',     label: 'My tasks',  icon: ClipboardList },
      { href: '/portal/tasks/new', label: 'New request', icon: Briefcase },
    ],
  },
]

const COLLAPSE_KEY = 'gp.sidebar.collapsed'

export type ShellUser = { name: string; email: string; role: AppRole; jobTitle: string | null }
export type ShellCounts = { notifications: number; urgent?: number; approvals?: number }

export function AppShell({
  user, counts, companyName, children,
}: { user: ShellUser; counts: ShellCounts; companyName?: string; children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)          // mobile drawer
  const [collapsed, setCollapsed] = useState(false) // desktop: icons-only sidebar
  const isClient = user.role === 'client'
  const groups = (isClient ? CLIENT_NAV : STAFF_NAV)
    .map(g => ({ ...g, items: g.items.filter(i => !i.roles || i.roles.includes(user.role)) }))
    .filter(g => g.items.length > 0)
  const notificationsHref = isClient ? '/portal/notifications' : '/notifications'

  useEffect(() => setOpen(false), [pathname])

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
      : href === '/portal/tasks'
        ? pathname.startsWith(href) && pathname !== '/portal/tasks/new'
        : pathname === href || pathname.startsWith(href + '/')

  async function signOut() {
    await createClient().auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const toggleButton = (
    <button
      onClick={toggleCollapsed}
      title={collapsed ? 'Show sidebar (Ctrl+B)' : 'Hide sidebar (Ctrl+B)'}
      aria-label={collapsed ? 'Show sidebar' : 'Hide sidebar'}
      aria-expanded={!collapsed}
      className="absolute -right-3 top-5 z-40 flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-card transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
    >
      {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
    </button>
  )

  const renderSidebar = (compact: boolean, desktop: boolean) => (
    <div className="flex h-full flex-col">
      {compact ? (
        <div className="flex h-16 items-center justify-center px-2">
          <Link href={isClient ? '/portal' : '/dashboard'} title="GoPortals">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 font-display text-sm font-extrabold text-white">G<span className="text-lime-400">P</span></span>
          </Link>
        </div>
      ) : (
        <div className="flex h-16 items-center justify-between gap-2 pl-5 pr-3">
          <Link href={isClient ? '/portal' : '/dashboard'} title="GoPortals"><Logo priority /></Link>
          {!desktop && <button className="rounded-lg p-1 text-slate-400 hover:bg-slate-100" onClick={() => setOpen(false)} aria-label="Close menu"><X className="h-5 w-5" /></button>}
        </div>
      )}

      {companyName && !compact && (
        <div className="mx-4 mb-2 rounded-lg bg-brand-50 px-3 py-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-brand-500">Client portal</p>
          <p className="truncate text-sm font-semibold text-brand-900">{companyName}</p>
        </div>
      )}

      <nav className={cn('flex-1 overflow-y-auto py-3', compact ? 'space-y-3 px-2' : 'space-y-6 px-3')}>
        {groups.map((group, gi) => (
          <div key={gi}>
            {group.label && (compact
              ? <div className="mx-2 mb-3 border-t border-slate-100" />
              : <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{group.label}</p>)}
            <ul className="space-y-0.5">
              {group.items.map(item => {
                const active = isActive(item.href)
                const count = item.badge === 'urgent' ? counts.urgent : item.badge === 'approvals' ? counts.approvals : 0
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      title={compact ? item.label + (count ? ` (${count})` : '') : undefined}
                      aria-label={compact ? item.label : undefined}
                      className={cn(
                        'group relative flex items-center rounded-lg py-2 text-sm font-medium transition-colors',
                        compact ? 'justify-center px-2' : 'gap-3 px-3',
                        active ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                      )}
                    >
                      {active && <span className="absolute inset-y-1.5 left-0 w-1 rounded-r-full bg-lime-500" />}
                      <item.icon className={cn('h-[18px] w-[18px] flex-shrink-0', active ? 'text-brand-600' : 'text-slate-400 group-hover:text-slate-500')} />
                      {!compact && <span className="flex-1">{item.label}</span>}
                      {!!count && (compact
                        ? <span className={cn('absolute right-1 top-1 h-2 w-2 rounded-full', item.badge === 'urgent' ? 'bg-red-600' : 'bg-amber-500')} />
                        : <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-bold',
                            item.badge === 'urgent' ? 'bg-red-600 text-white' : 'bg-amber-100 text-amber-800')}>{count}</span>)}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className={cn('border-t border-slate-100', compact ? 'p-2' : 'p-3')}>
        <div className={cn('flex items-center rounded-lg', compact ? 'flex-col gap-2 py-1' : 'gap-3 px-2 py-2')}>
          <span title={compact ? `${user.name || user.email} · ${user.jobTitle || ROLE_LABELS[user.role]}` : undefined}>
            <Avatar name={user.name || user.email} size="sm" />
          </span>
          {!compact && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-900">{user.name || user.email}</p>
              <p className="truncate text-xs text-slate-500">{user.jobTitle || ROLE_LABELS[user.role]}</p>
            </div>
          )}
          <button onClick={signOut} title="Sign out" aria-label="Sign out" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      <aside className={cn('fixed inset-y-0 left-0 z-30 hidden border-r border-slate-200 bg-white transition-[width] duration-200 lg:block',
        collapsed ? 'w-16' : 'w-64')}>
        {renderSidebar(collapsed, true)}
        {toggleButton}
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-brand-950/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-white shadow-pop">{renderSidebar(false, false)}</aside>
        </div>
      )}

      <div className={cn('transition-[padding] duration-200', collapsed ? 'lg:pl-16' : 'lg:pl-64')}>
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/85 px-4 backdrop-blur sm:px-6">
          <button className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
          <div className="lg:hidden"><Logo className="h-7" /></div>
          <div className="flex-1" />
          <Link href={notificationsHref} className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700" aria-label="Notifications">
            <Bell className="h-5 w-5" />
            {counts.notifications > 0 && (
              <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-lime-500 px-1 text-[10px] font-bold text-brand-950">
                {counts.notifications > 9 ? '9+' : counts.notifications}
              </span>
            )}
          </Link>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  )
}
