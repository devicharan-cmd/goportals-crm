'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  DndContext, DragOverlay, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'
import { createClient } from '@/lib/supabase/client'
import { Avatar } from '@/components/ui/primitives'
import { AssignButton, type AssigneeOption } from '@/components/tasks/AssignButton'
import { PriorityBadge, UrgentBadge } from '@/components/ui/badges'
import { TICKET_CATEGORY_LABELS } from '@/lib/ticket-categories'
import { TICKET_STATUS_DOT, TICKET_STATUS_OPTIONS, TICKET_TERMINAL_STATUSES } from '@/lib/constants'
import { cn, errorMessage, ticketCode } from '@/lib/utils'
import type { Ticket, TicketStatus } from '@/types/database'

type TicketItem = Ticket & { client?: { id: string; company_name: string } | null }
type CardProps = { ticket: TicketItem; names: Record<string, string>; assignOptions?: AssigneeOption[] }

function Card({ ticket, names, overlay, linked, assignOptions }: CardProps & { overlay?: boolean; linked?: boolean }) {
  const body = (
    <>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5">
          <span className="font-mono text-[11px] font-semibold text-slate-400">{ticketCode(ticket.ticket_number)}</span>
          {ticket.is_urgent && !TICKET_TERMINAL_STATUSES.includes(ticket.status) && <UrgentBadge />}
          {ticket.priority && <PriorityBadge priority={ticket.priority} />}
        </span>
        <span className="truncate text-[11px] text-slate-400">{TICKET_CATEGORY_LABELS[ticket.category]}</span>
      </div>
      <p className="text-sm font-medium leading-snug text-slate-900">{ticket.subject}</p>
      <p className="mt-1 truncate text-xs text-slate-500">{ticket.client?.company_name}</p>
    </>
  )
  return (
    <div className={cn('rounded-lg border bg-white text-left',
      overlay ? 'rotate-1 border-brand-400 shadow-pop' : 'border-slate-200 shadow-card',
      ticket.is_urgent && !TICKET_TERMINAL_STATUSES.includes(ticket.status) && 'border-l-4 border-l-red-500')}>
      {linked
        ? <Link href={`/tickets/${ticket.id}`} draggable={false} className="block p-3 pb-2 hover:bg-slate-50/60">{body}</Link>
        : <div className="p-3 pb-2">{body}</div>}
      <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-3 py-2">
        {ticket.assignee_id
          ? <span className="flex min-w-0 items-center gap-1.5 text-xs text-slate-600"><Avatar name={names[ticket.assignee_id]} size="xs" /><span className="truncate">{names[ticket.assignee_id] ?? '—'}</span></span>
          : <span className="text-[11px] italic text-slate-400">Unassigned</span>}
        {assignOptions && !TICKET_TERMINAL_STATUSES.includes(ticket.status) && (
          <span onPointerDown={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
            <AssignButton taskId={ticket.id} currentId={ticket.assignee_id} options={assignOptions} variant="link" table="tickets" />
          </span>
        )}
      </div>
    </div>
  )
}

function DraggableCard({ ticket, names, assignOptions }: CardProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: ticket.id })
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} className={cn('touch-none', isDragging && 'opacity-30')}>
      <Card ticket={ticket} names={names} assignOptions={assignOptions} linked />
    </div>
  )
}

function Column({
  status, label, tickets, names, assignOptions,
}: { status: TicketStatus; label: string; tickets: TicketItem[]; names: Record<string, string>; assignOptions?: AssigneeOption[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  return (
    <div className="flex min-w-0 flex-col">
      <div className="mb-2 flex items-center gap-2 px-1">
        <span className={cn('h-2 w-2 rounded-full', TICKET_STATUS_DOT[status])} />
        <h3 className="text-sm font-semibold text-slate-700">{label}</h3>
        <span className="rounded-full bg-slate-200/70 px-2 text-xs font-medium text-slate-600">{tickets.length}</span>
      </div>
      <div ref={setNodeRef}
           className={cn('min-h-[200px] flex-1 space-y-2 rounded-xl p-2 transition-colors',
             isOver ? 'bg-brand-50 ring-2 ring-brand-200' : 'bg-slate-100/70')}>
        {tickets.map(t => <DraggableCard key={t.id} ticket={t} names={names} assignOptions={assignOptions} />)}
      </div>
    </div>
  )
}

/** Kanban for tickets: drag between columns to change status. */
export function TicketBoard({
  tickets: initial, names, assignOptions,
}: { tickets: TicketItem[]; names: Record<string, string>; assignOptions?: AssigneeOption[] }) {
  const router = useRouter()
  const [tickets, setTickets] = useState(initial)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [error, setError] = useState('')
  useEffect(() => setTickets(initial), [initial])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
  )

  async function onDragEnd(e: DragEndEvent) {
    setActiveId(null)
    const id = String(e.active.id)
    const to = e.over?.id as TicketStatus | undefined
    const ticket = tickets.find(t => t.id === id)
    if (!ticket || !to || ticket.status === to) return

    const prev = tickets
    setTickets(ts => ts.map(t => (t.id === id ? { ...t, status: to } : t)))
    const { error } = await createClient().from('tickets').update({ status: to }).eq('id', id)
    if (error) {
      setTickets(prev)
      setError(errorMessage(error))
    } else {
      setError('')
      router.refresh()
    }
  }

  const active = tickets.find(t => t.id === activeId)

  return (
    <div>
      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <DndContext id="ticket-board" sensors={sensors} onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
        <div className="-mx-4 grid auto-cols-[minmax(180px,1fr)] grid-flow-col gap-3 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0">
          {TICKET_STATUS_OPTIONS.map(s => (
            <Column key={s.value} status={s.value} label={s.label} names={names} assignOptions={assignOptions} tickets={tickets.filter(t => t.status === s.value)} />
          ))}
        </div>
        <DragOverlay>{active && <Card ticket={active} names={names} overlay />}</DragOverlay>
      </DndContext>
    </div>
  )
}
