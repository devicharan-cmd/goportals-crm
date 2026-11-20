'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { CircleCheck, Layers3, UsersRound } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'

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

export function StaffTicketTabs({ activeStatus }: { activeStatus: StaffTicketStatus }) {
  const [counts, setCounts] = useState<Counts | null>(null)
  const pendingDeltas = useRef<Partial<Counts>>({})
  const countsLoaded = useRef(false)

  useEffect(() => {
    let active = true
    const supabase = createClient()
    void (async () => {
      let loadedCounts: Counts
      const { data, error } = await supabase.rpc('staff_ticket_status_counts')
      if (!error && data?.[0]) {
        loadedCounts = {
          unassigned: Number(data[0].unassigned_count) || 0,
          assigned: Number(data[0].assigned_count) || 0,
          closed: Number(data[0].closed_count) || 0,
        }
      } else {
        const results = await Promise.all(TABS.map(({ key }) => supabase.from('tickets')
          .select('id', { count: 'exact', head: true })
          .eq('status', key)))
        loadedCounts = Object.fromEntries(TABS.map((tab, index) => [
          tab.key,
          results[index].count ?? 0,
        ])) as Counts
      }
      if (!active) return
      const deltas = pendingDeltas.current
      pendingDeltas.current = {}
      countsLoaded.current = true
      setCounts(previous => {
        const base = previous ?? loadedCounts
        return Object.fromEntries(TABS.map(({ key }) => [
          key,
          Math.max(0, base[key] + (deltas[key] ?? 0)),
        ])) as Counts
      })
    })().catch(() => {
      if (!active) return
      const deltas = pendingDeltas.current
      pendingDeltas.current = {}
      countsLoaded.current = true
      setCounts(previous => {
        const base = previous ?? { unassigned: 0, assigned: 0, closed: 0 }
        return Object.fromEntries(TABS.map(({ key }) => [
          key,
          Math.max(0, base[key] + (deltas[key] ?? 0)),
        ])) as Counts
      })
    })
    return () => { active = false }
  }, [])

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

      if (Object.keys(deltas).length && !countsLoaded.current) {
        for (const [status, delta] of Object.entries(deltas)) {
          const key = status as StaffTicketStatus
          pendingDeltas.current[key] = (pendingDeltas.current[key] ?? 0) + (delta ?? 0)
        }
      } else if (Object.keys(deltas).length) {
        setCounts(previous => {
          const current = previous ?? { unassigned: 0, assigned: 0, closed: 0 }
          return {
            ...current,
            ...Object.fromEntries(Object.entries(deltas).map(([status, delta]) => [
              status,
              Math.max(0, current[status as StaffTicketStatus] + (delta ?? 0)),
            ])),
          }
        })
      }
    }

    window.addEventListener('gp:ticket-count-change', onTicketCountChange)
    return () => window.removeEventListener('gp:ticket-count-change', onTicketCountChange)
  }, [])

  return (
    <div className="inline-flex h-8 w-fit max-w-full min-w-0 gap-px rounded-lg border border-slate-200 bg-white p-0.5 [box-shadow:0_1px_2px_0_rgb(2_43_59_/_0.04),0_1px_3px_0_rgb(2_43_59_/_0.06)] sm:h-9 sm:rounded-xl">
      {TABS.map(tab => (
        <Link key={tab.key} href={tab.key === 'unassigned' ? '/tickets' : `/tickets?status=${tab.key}`} prefetch={false}
          className={cn(
            'relative flex h-full shrink-0 items-center gap-1 rounded-md px-2 pr-5 text-[11px] transition-[background-color,color,box-shadow] duration-200 ease-out motion-reduce:transition-none sm:gap-1.5 sm:rounded-lg sm:px-2.5 sm:pr-6 sm:text-xs',
            activeStatus === tab.key
              ? 'bg-[#034C68] font-semibold text-white shadow-[0_2px_5px_rgba(2,43,59,0.2)]'
              : 'bg-white font-medium text-slate-800',
          )}>
          <tab.icon aria-hidden="true" className={cn('h-3.5 w-3.5 shrink-0', activeStatus === tab.key ? 'text-white' : 'text-slate-800')} />
          <span className="min-w-0 truncate">{tab.label}</span>
          <span className={cn(
            'absolute right-1 top-1/2 inline-grid h-3.5 min-w-3.5 -translate-y-1/2 place-items-center rounded-full px-0.5 text-center text-[9px] font-semibold leading-3.5 tabular-nums sm:h-4 sm:min-w-4 sm:px-1 sm:text-[10px] sm:leading-4',
            counts?.[tab.key] ? 'bg-[#95C12C] text-white' : 'bg-slate-200 text-[#0F172A]',
          )}>
            {counts ? (counts[tab.key] > 99 ? '99+' : counts[tab.key]) : '·'}
          </span>
        </Link>
      ))}
    </div>
  )
}
