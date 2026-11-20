'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ContactRound, Mail, UsersRound } from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'
import type { AppRole, Department, InviteListItem } from '@/types/database'
import type { StaffRow, UnlinkedClientAccount } from '@/components/admin/UserAdmin'
import { PendingInvites, StaffDirectory, UnlinkedClientAccounts } from '@/components/admin/UserAdmin'
import { ChangePocTab } from '@/components/admin/ChangePocTab'

type Tab = 'users' | 'invites' | 'change-poc'

export function UsersAdminTabs({ rows, departments, invites, inviteButton, unlinkedClientAccounts = [], actorId, actorRole, initialTab = 'users', initialSelectedIds = [] }: {
  rows: StaffRow[]
  departments: Department[]
  invites: InviteListItem[]
  inviteButton: ReactNode
  unlinkedClientAccounts?: UnlinkedClientAccount[]
  actorId: string
  actorRole: AppRole
  initialTab?: Tab
  initialSelectedIds?: string[]
}) {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()
  const [tab, setTab] = useState<Tab>(initialTab)
  const people = rows.map(({ id, full_name, email, avatar_url, role, status, reporting_to }) => ({ id, full_name, email, avatar_url, role, status, reporting_to }))

  useEffect(() => {
    const requestedTab = searchParams.get('tab')
    const nextTab: Tab = requestedTab === 'invites' || (requestedTab === 'change-poc' && actorRole === 'super_admin')
      ? requestedTab
      : 'users'
    setTab(current => current === nextTab ? current : nextTab)
  }, [actorRole, searchParams])

  function selectTab(nextTab: Tab) {
    setTab(nextTab)
    const next = new URLSearchParams(searchParams.toString())
    if (nextTab === 'users') next.delete('tab')
    else next.set('tab', nextTab)
    const query = next.toString()
    router.replace(query ? `${pathname}?${query}` : pathname)
  }

  const tabs: { id: Tab; label: string; Icon: typeof UsersRound }[] = [
    { id: 'users', label: 'All Users', Icon: UsersRound },
    { id: 'invites', label: 'Invites', Icon: Mail },
    ...(actorRole === 'super_admin' ? [{ id: 'change-poc' as const, label: 'Change POC', Icon: ContactRound }] : []),
  ]
  const initialSelection = initialSelectedIds.length ? initialSelectedIds : (searchParams.get('select') ?? '').split(',').filter(Boolean)

  return (
    <div className="w-full min-w-0">
      <div role="tablist" aria-label="Users and invites" className="mb-3 flex flex-wrap gap-2">
        {tabs.map(({ id, label, Icon }) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => selectTab(id)}
            className={cn('inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#63A9C4] focus-visible:ring-offset-2 sm:h-10 sm:gap-1.5 sm:px-3.5 sm:text-sm',
              tab === id ? 'bg-[#045E80] text-white shadow-sm' : 'bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50 hover:text-slate-900')}>
            <Icon aria-hidden="true" className="h-3.5 w-3.5 sm:h-4 sm:w-4" />{label}
          </button>
        ))}
      </div>

      {tab === 'users' && (
        <div className={cn('w-full min-w-0', actorRole === 'super_admin' && unlinkedClientAccounts.length > 0 ? 'grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]' : '')}>
          <Card className="w-full min-w-0 overflow-hidden">
            <StaffDirectory rows={rows} departments={departments} canEdit={actorRole === 'super_admin'} actorId={actorId} actorRole={actorRole} inviteButton={inviteButton} />
          </Card>
          {actorRole === 'super_admin' && unlinkedClientAccounts.length > 0 && (
            <Card className="h-fit overflow-hidden">
              <CardHeader title={`Unlinked client accounts (${unlinkedClientAccounts.length})`}
                description="These logins have no client company. Super admins can permanently remove an account and its personal data here." />
              <UnlinkedClientAccounts accounts={unlinkedClientAccounts} />
            </Card>
          )}
        </div>
      )}

      {tab === 'invites' && actorRole !== 'team_lead' && (
        <Card className="overflow-hidden">
          <CardHeader
            className="items-center gap-2 px-3 py-3 sm:gap-4 sm:px-5 sm:py-4"
            title="Invites"
            description="Send invitations and track acceptance, role, and who sent each one."
            action={<div className="shrink-0 whitespace-nowrap [&_button]:h-8 [&_button]:gap-1.5 [&_button]:px-2.5 [&_button]:text-xs sm:[&_button]:h-9 sm:[&_button]:gap-2 sm:[&_button]:px-4 sm:[&_button]:text-sm">{inviteButton}</div>}
          />
          <PendingInvites invites={invites} canReject={actorRole === 'super_admin'} />
        </Card>
      )}

      {tab === 'change-poc' && actorRole === 'super_admin' && (
        <ChangePocTab rows={rows} departments={departments} people={people} initialSelectedIds={initialSelection} />
      )}
    </div>
  )
}
