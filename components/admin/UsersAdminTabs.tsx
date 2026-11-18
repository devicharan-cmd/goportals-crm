'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { ContactRound, Mail, UsersRound } from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'
import type { AppRole, Department, Invite } from '@/types/database'
import type { StaffRow, UnlinkedClientAccount } from '@/components/admin/UserAdmin'
import { PendingInvites, StaffDirectory, UnlinkedClientAccounts } from '@/components/admin/UserAdmin'
import { ChangePocTab } from '@/components/admin/ChangePocTab'

type Tab = 'users' | 'invites' | 'change-poc'

export function UsersAdminTabs({ rows, departments, invites, inviteButton, unlinkedClientAccounts = [], actorId, actorRole, initialTab = 'users', initialSelectedIds = [] }: {
  rows: StaffRow[]
  departments: Department[]
  invites: Invite[]
  inviteButton: ReactNode
  unlinkedClientAccounts?: UnlinkedClientAccount[]
  actorId: string
  actorRole: AppRole
  initialTab?: Tab
  initialSelectedIds?: string[]
}) {
  const searchParams = useSearchParams()
  const pathname = usePathname()
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
    window.history.pushState(null, '', query ? `${pathname}?${query}` : pathname)
  }

  const tabs: { id: Tab; label: string; Icon: typeof UsersRound }[] = [
    { id: 'users', label: 'All Users', Icon: UsersRound },
    { id: 'invites', label: 'Invites', Icon: Mail },
    ...(actorRole === 'super_admin' ? [{ id: 'change-poc' as const, label: 'Change POC', Icon: ContactRound }] : []),
  ]
  const initialSelection = initialSelectedIds.length ? initialSelectedIds : (searchParams.get('select') ?? '').split(',').filter(Boolean)

  return (
    <div>
      <div role="tablist" aria-label="Users and invites" className="mb-5 flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        {tabs.map(({ id, label, Icon }) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => selectTab(id)}
            className={cn('inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors',
              tab === id ? 'bg-[#045E80] text-white shadow-sm' : 'bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50 hover:text-slate-900')}>
            <Icon aria-hidden="true" className="h-4 w-4" />{label}
          </button>
        ))}
      </div>

      {tab === 'users' && (
        <div className={actorRole === 'team_lead' ? '' : 'grid gap-6 xl:grid-cols-[1fr_340px]'}>
          <Card className="overflow-hidden">
            <StaffDirectory rows={rows} departments={departments} canEdit={actorRole === 'super_admin'} actorId={actorId} actorRole={actorRole} inviteButton={inviteButton} />
          </Card>
          {actorRole !== 'team_lead' && (
            <div className="space-y-6">
              <Card className="h-fit overflow-hidden"><CardHeader title="Pending invites" /><PendingInvites invites={invites} /></Card>
              {actorRole === 'super_admin' && unlinkedClientAccounts.length > 0 && (
                <Card className="h-fit overflow-hidden">
                  <CardHeader title={`Unlinked client accounts (${unlinkedClientAccounts.length})`}
                    description="These logins have no client company. Super admins can permanently remove an account and its personal data here." />
                  <UnlinkedClientAccounts accounts={unlinkedClientAccounts} />
                </Card>
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'invites' && actorRole !== 'team_lead' && (
        <Card className="overflow-hidden">
          <CardHeader title="Invites" description="Send staff or client invitations and manage pending invitations." action={inviteButton} />
          <PendingInvites invites={invites} />
        </Card>
      )}

      {tab === 'change-poc' && actorRole === 'super_admin' && (
        <ChangePocTab rows={rows} departments={departments} people={people} initialSelectedIds={initialSelection} />
      )}
    </div>
  )
}
