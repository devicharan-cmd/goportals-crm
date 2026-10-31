'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Bell, Briefcase, Building2, CheckSquare, ChevronDown, ChevronLeft, ChevronRight,
  ClipboardList, FileSignature, Flame, LayoutDashboard, Layers, Loader2, LogOut,
  Menu, PieChart, Settings, Settings2, ShieldCheck, User, UserCircle, UserPlus, Users, X,
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
      { href: '/tickets',       label: 'Tickets',     icon: ClipboardList },
      { href: '/tasks',         label: 'Tasks',       icon: CheckSquare },
      { href: '/urgent',        label: 'Urgent pool', icon: Flame, badge: 'urgent' },
      { href: '/clients',       label: 'Clients',     icon: Building2, roles: ['super_admin', 'admin'] },
      { href: '/team',          label: 'Team',        icon: Users, roles: ['super_admin', 'admin', 'team_lead'] },
      { href: '/reports',       label: 'Reports',     icon: PieChart, roles: ['super_admin', 'admin'] },
      { href: '/settings',      label: 'Setting',     icon: Settings },
    ],
  },
  {
    label: 'Manager',
    items: [
      { href: '/admin/approvals', label: 'Approvals',  icon: ShieldCheck, roles: ['super_admin'], badge: 'approvals' },
      { href: '/admin/users',     label: 'Users & invites', icon: UserPlus, roles: ['super_admin', 'admin'] },
      { href: '/admin/settings',  label: 'Platforms & services', icon: Settings2, roles: ['super_admin'] },
      { href: '/admin/agreement', label: 'Agreement',  icon: FileSignature, roles: ['super_admin'] },
    ],
  },
]

const CLIENT_NAV: NavGroup[] = [
  {
    items: [
      { href: '/portal',             label: 'Overview',    icon: LayoutDashboard },
      { href: '/portal/tickets',     label: 'My tickets', icon: ClipboardList },
      { href: '/portal/tickets/new', label: 'New ticket', icon: Briefcase },
      { href: '/portal/services',    label: 'My services', icon: Layers },
      { href: '/portal/profile',     label: 'Company profile', icon: UserCircle },
    ],
  },
]

const COLLAPSE_KEY = 'gp.sidebar.collapsed'

export type ShellUser = { name: string; email: string; role: AppRole; jobTitle: string | null }
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
  const profileMenuRef = useRef<HTMLDivElement>(null)

  const isClient = user.role === 'client'
  const groups = (isClient ? CLIENT_NAV : STAFF_NAV)
    .map(g => ({ ...g, items: g.items.filter(i => !i.roles || i.roles.includes(user.role)) }))
    .filter(g => g.items.length > 0)
  const notificationsHref = isClient ? '/portal/notifications' : '/notifications'

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
                      onMouseEnter={() => router.prefetch(item.href)}
                      onFocus={() => router.prefetch(item.href)}
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
                        ? <span className={cn('absolute right-1 top-1 h-2 w-2 rounded-full', item.badge === 'urgent' ? 'bg-red-600' : 'bg-lime-500')} />
                        : <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-bold',
                            item.badge === 'urgent' ? 'bg-red-600 text-white' : 'bg-lime-500 text-brand-950')}>{count}</span>)}
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
          <span title={compact ? `${user.name || user.email} · ${user.jobTitle || ROLE_LABELS[user.role]}` : undefined}>
            <Avatar name={user.name || user.email} src={isClient ? companyProfileImageUrl : undefined} role={isClient ? 'client' : user.role} size="md" />
          </span>
          {!compact && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-900">{user.name || user.email}</p>
              <p className="truncate text-xs text-slate-500">{user.jobTitle || ROLE_LABELS[user.role]}</p>
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
    <div className="h-screen overflow-hidden">
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

      {/* Only the area under the top bar scrolls, so the scrollbar never runs beside the top bar. */}
      <div className={cn('flex h-full min-h-0 flex-col transition-[padding] duration-200', collapsed ? 'lg:pl-16' : 'lg:pl-64')}>
        <header className="z-20 flex h-16 flex-shrink-0 items-center gap-3 border-b border-slate-200 bg-white/85 px-4 backdrop-blur sm:px-6">
          <button className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
          <div className="lg:hidden"><Logo className="h-7" priority /></div>
          {pageTitle && (
            <div className="hidden min-w-0 items-center gap-2.5 sm:flex">
              <span className="hidden h-6 w-px bg-slate-200 sm:block lg:hidden" />
              <p className="truncate font-display text-xl font-semibold text-slate-900">{pageTitle}</p>
            </div>
          )}
          <div className="min-h-0 flex-1" />

          {/* Right Header Navigation */}
          <div className="flex items-center gap-2.5">
            {/* Notification Bell */}
            <Link
              href={notificationsHref}
              className="relative rounded-xl p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition"
              aria-label="Notifications"
            >
              <Bell className="h-5 w-5" />
              {counts.notifications > 0 && (
                <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-lime-500 px-1 text-[10px] font-bold text-brand-950">
                  {counts.notifications > 9 ? '9+' : counts.notifications}
                </span>
              )}
            </Link>

            {/* Profile Dropdown Trigger & Floating Menu */}
            {!isClient && (
              <div className="relative" ref={profileMenuRef}>
                <button
                  type="button"
                  onClick={() => setProfileMenuOpen(v => !v)}
                  className={cn(
                    'flex items-center gap-2 rounded-full border border-slate-200 bg-white px-2 py-1.5 transition-all text-left focus:outline-none select-none shadow-xs',
                    profileMenuOpen
                      ? 'border-slate-300 bg-slate-50'
                      : 'hover:border-slate-300 hover:bg-slate-50'
                  )}
                  aria-expanded={profileMenuOpen}
                  aria-haspopup="true"
                >
                  <Avatar name={user.name || user.email} role={user.role} size="sm" />
                  <div className="hidden min-w-0 sm:flex sm:flex-col sm:justify-center text-left">
                    <p className="max-w-[130px] truncate text-[11px] font-semibold text-slate-900 leading-[1.2]">
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
                  <div className="absolute right-0 top-full mt-1.5 w-48 rounded-xl border border-slate-200/80 bg-white p-1.5 shadow-pop z-50 animate-in fade-in zoom-in-95 duration-100">
                    <Link
                      href="/settings"
                      onClick={() => setProfileMenuOpen(false)}
                      className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition"
                    >
                      <User className="h-4 w-4 text-slate-500" />
                      Profile
                    </Link>

                    <div className="border-t border-slate-100 my-1" />

                    <button
                      onClick={() => {
                        setProfileMenuOpen(false)
                        signOut()
                      }}
                      disabled={signingOut}
                      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 hover:text-red-700 transition"
                    >
                      {signingOut ? <Loader2 className="h-4 w-4 animate-spin text-red-600" /> : <LogOut className="h-4 w-4" />}
                      Log out
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
        </div>
      </div>
    </div>
  )
}
