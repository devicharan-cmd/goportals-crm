'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CircleCheck, Layers3, UsersRound } from 'lucide-react'
import { cn } from '@/lib/utils'

type StaffTicketStatus = 'unassigned' | 'assigned' | 'closed'
const TABS: { key: StaffTicketStatus; label: string; icon: typeof Layers3 }[] = [
  { key: 'unassigned', label: 'Unassigned', icon: Layers3 },
  { key: 'assigned', label: 'Assigned', icon: UsersRound },
  { key: 'closed', label: 'Closed', icon: CircleCheck },
]

type TicketCountEvent = {
  eventType?: 'INSERT' | 'UPDATE' | 'DELETE'
  eventKey?: string
  previousStatus?: string | null
  nextStatus?: string | null
}
type Counts = Record<StaffTicketStatus, number>

function isTicketStatus(value: string | null | undefined): value is StaffTicketStatus {
  return TABS.some(tab => tab.key === value)
}

export function StaffTicketTabs({ activeStatus, initialCounts }: { activeStatus: StaffTicketStatus; initialCounts: Counts }) {
  const [counts, setCounts] = useState(initialCounts)

  useEffect(() => setCounts(initialCounts), [initialCounts])

  useEffect(() => {
    const processedEvents = new Set<string>()
    function onTicketCountChange(event: Event) {
      const change = (event as CustomEvent<TicketCountEvent>).detail
      if (!change) return
      if (change.eventKey) {
        if (processedEvents.has(change.eventKey)) return
        processedEvents.add(change.eventKey)
        if (processedEvents.size > 128) processedEvents.delete(processedEvents.values().next().value!)
      }

      const deltas: Partial<Counts> = {}
      if (change.eventType === 'INSERT' && isTicketStatus(change.nextStatus)) {
        deltas[change.nextStatus] = 1
      } else if (change.eventType === 'DELETE' && isTicketStatus(change.previousStatus)) {
        deltas[change.previousStatus] = -1
      } else if (change.eventType === 'UPDATE' && change.previousStatus !== change.nextStatus) {
        if (isTicketStatus(change.previousStatus)) deltas[change.previousStatus] = -1
        if (isTicketStatus(change.nextStatus)) deltas[change.nextStatus] = (deltas[change.nextStatus] ?? 0) + 1
      }

      if (Object.keys(deltas).length) {
        setCounts(previous => ({
          ...previous,
          ...Object.fromEntries(Object.entries(deltas).map(([status, delta]) => [
            status,
            Math.max(0, previous[status as StaffTicketStatus] + (delta ?? 0)),
          ])),
        }))
      }
    }

    window.addEventListener('gp:ticket-count-change', onTicketCountChange)
    return () => window.removeEventListener('gp:ticket-count-change', onTicketCountChange)
  }, [])

  return (
    <div className="grid h-9 min-w-0 grid-cols-3 gap-px rounded-xl border border-slate-200 bg-white p-0.5 [box-shadow:0_1px_2px_0_rgb(2_43_59_/_0.04),0_1px_3px_0_rgb(2_43_59_/_0.06)]">
      {TABS.map(tab => (
        <Link key={tab.key} href={tab.key === 'unassigned' ? '/tickets' : `/tickets?status=${tab.key}`} prefetch={false}
          className={cn(
            'relative flex h-full min-w-0 items-center gap-2 rounded-lg px-3 pr-7 text-xs transition-[background-color,color,box-shadow] duration-200 ease-out motion-reduce:transition-none',
            activeStatus === tab.key
              ? 'bg-[#034C68] font-semibold text-white shadow-[0_2px_5px_rgba(2,43,59,0.2)]'
              : 'bg-white font-medium text-slate-800',
          )}>
          <tab.icon aria-hidden="true" className={cn('h-3.5 w-3.5 shrink-0', activeStatus === tab.key ? 'text-white' : 'text-slate-800')} />
          <span className="min-w-0 truncate">{tab.label}</span>
          <span className={cn(
            'absolute right-1 top-1/2 inline-flex h-4 min-w-4 -translate-y-1/2 items-center justify-center rounded-full px-0.5 text-[9px] font-bold leading-none shadow-sm',
            counts[tab.key] > 0 ? 'bg-[#95C12C] text-white' : 'bg-slate-200 text-[#0F172A]',
          )}>
            {counts[tab.key] > 99 ? '99+' : counts[tab.key]}
          </span>
        </Link>
      ))}
    </div>
  )
}
