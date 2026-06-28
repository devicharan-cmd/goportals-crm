'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Search, X, GripVertical } from 'lucide-react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { createClient } from '@/lib/supabase/client'

const COLUMNS = [
  { key: 'open',        label: 'Open',        color: 'bg-gray-100 text-gray-700',     border: 'border-gray-200' },
  { key: 'in_progress', label: 'In Progress',  color: 'bg-blue-100 text-blue-700',     border: 'border-blue-200' },
  { key: 'in_review',   label: 'In Review',    color: 'bg-purple-100 text-purple-700', border: 'border-purple-200' },
  { key: 'blocked',     label: 'Blocked',      color: 'bg-red-100 text-red-700',       border: 'border-red-200' },
  { key: 'done',        label: 'Done',         color: 'bg-green-100 text-green-700',   border: 'border-green-200' },
]

type Ticket = {
  id: string
  title: string
  status: string
  priority: string
  platform: string | null
  due_date: string | null
  deadline_type: string | null
  external_ref: string | null
  clients: { id: string; name: string } | null
  assignee: { id: string; name: string } | null
}

type Props = {
  tickets: Ticket[]
  clients: { id: string; name: string }[]
  members: { id: string; name: string }[]
}

// ─── Card component (draggable) ──────────────────────────────────────────────
function TicketCard({ ticket, overlay = false }: { ticket: Ticket; overlay?: boolean }) {
  const isOverdue = ticket.due_date && new Date(ticket.due_date) < new Date() && ticket.status !== 'done'

  return (
    <div className={`bg-white rounded-lg border p-3 ${overlay ? 'border-blue-400 shadow-lg rotate-1 opacity-95' : 'border-gray-200'}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className={`text-xs font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${
          ticket.priority === 'P1' ? 'bg-red-100 text-red-700' :
          ticket.priority === 'P2' ? 'bg-orange-100 text-orange-700' :
          ticket.priority === 'P3' ? 'bg-blue-100 text-blue-700' :
          'bg-gray-100 text-gray-600'
        }`}>{ticket.priority}</span>
        {ticket.platform && (
          <span className="text-xs text-gray-400 capitalize">{ticket.platform}</span>
        )}
      </div>
      <p className="text-sm text-gray-900 leading-snug">{ticket.title}</p>
      {ticket.external_ref && (
        <p className="text-xs text-gray-400 font-mono mt-1">#{ticket.external_ref}</p>
      )}
      {ticket.deadline_type && ticket.status !== 'done' && (
        <span className={`inline-block mt-1.5 text-xs font-medium px-1.5 py-0.5 rounded ${
          ticket.deadline_type === 'today' ? 'bg-red-50 text-red-600' :
          ticket.deadline_type === 'this_week' ? 'bg-orange-50 text-orange-600' :
          'bg-blue-50 text-blue-600'
        }`}>
          {ticket.deadline_type === 'today' ? '🔴 Today' :
           ticket.deadline_type === 'this_week' ? '🟠 This Week' : '🔵 This Month'}
        </span>
      )}
      <div className="flex items-center justify-between mt-3">
        <span className="text-xs text-gray-400">{ticket.clients?.name}</span>
        <div className="flex items-center gap-1.5">
          {isOverdue && <span className="text-xs text-red-500 font-medium">Overdue</span>}
          {ticket.assignee && (
            <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold">
              {ticket.assignee.name.charAt(0)}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function DraggableCard({ ticket }: { ticket: Ticket }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: ticket.id })

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.3 : 1,
    cursor: isDragging ? 'grabbing' : 'grab',
  }

  return (
    <div ref={setNodeRef} style={style} className="relative group">
      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing p-0.5 rounded text-gray-300 hover:text-gray-500"
      >
        <GripVertical className="w-3.5 h-3.5" />
      </div>
      <Link href={`/tickets/${ticket.id}`}>
        <TicketCard ticket={ticket} />
      </Link>
    </div>
  )
}

function DroppableColumn({
  col,
  tickets,
  hasFilters,
}: {
  col: typeof COLUMNS[0]
  tickets: Ticket[]
  hasFilters: boolean
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.key })

  return (
    <div className="flex-shrink-0 w-72">
      <div className="flex items-center gap-2 mb-3">
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${col.color}`}>{col.label}</span>
        <span className="text-xs text-gray-400">{tickets.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={`min-h-24 rounded-xl transition-colors space-y-2 p-1 -m-1 ${
          isOver ? `bg-blue-50 ring-2 ring-blue-300 ring-dashed` : ''
        }`}
      >
        {tickets.map(ticket => (
          <DraggableCard key={ticket.id} ticket={ticket} />
        ))}
        {tickets.length === 0 && (
          <div className={`rounded-lg border-2 border-dashed p-4 text-xs text-center transition-colors ${
            isOver ? 'border-blue-300 text-blue-400 bg-blue-50' : 'border-gray-200 text-gray-300'
          }`}>
            {hasFilters ? 'No matches' : 'Drop here'}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main board ──────────────────────────────────────────────────────────────
export default function KanbanBoard({ tickets: initialTickets, clients, members }: Props) {
  const supabase = createClient()

  const [tickets, setTickets] = useState(initialTickets)
  const [activeTicket, setActiveTicket] = useState<Ticket | null>(null)

  const [search, setSearch]           = useState('')
  const [filterClient, setFilterClient]     = useState('')
  const [filterMember, setFilterMember]     = useState('')
  const [filterPriority, setFilterPriority] = useState('')
  const [filterPlatform, setFilterPlatform] = useState('')
  const [filterDeadline, setFilterDeadline] = useState('')

  const hasFilters = !!(search || filterClient || filterMember || filterPriority || filterPlatform || filterDeadline)

  function clearFilters() {
    setSearch(''); setFilterClient(''); setFilterMember('')
    setFilterPriority(''); setFilterPlatform(''); setFilterDeadline('')
  }

  const filtered = useMemo(() => {
    return tickets.filter(t => {
      if (search && !t.title.toLowerCase().includes(search.toLowerCase()) &&
          !(t.external_ref ?? '').toLowerCase().includes(search.toLowerCase())) return false
      if (filterClient && t.clients?.id !== filterClient) return false
      if (filterMember && t.assignee?.id !== filterMember) return false
      if (filterPriority && t.priority !== filterPriority) return false
      if (filterPlatform && t.platform !== filterPlatform) return false
      if (filterDeadline && t.deadline_type !== filterDeadline) return false
      return true
    })
  }, [tickets, search, filterClient, filterMember, filterPriority, filterPlatform, filterDeadline])

  const byStatus = useMemo(() =>
    COLUMNS.reduce((acc, col) => {
      acc[col.key] = filtered.filter(t => t.status === col.key)
      return acc
    }, {} as Record<string, Ticket[]>),
  [filtered])

  // ── DnD ─────────────────────────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 200, tolerance: 8 } })
  )

  function handleDragStart(event: DragStartEvent) {
    const t = tickets.find(t => t.id === event.active.id)
    setActiveTicket(t ?? null)
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveTicket(null)
    const { active, over } = event
    if (!over) return

    const newStatus = over.id as string
    const ticket = tickets.find(t => t.id === active.id)
    if (!ticket || ticket.status === newStatus) return

    // Optimistic update
    setTickets(prev => prev.map(t => t.id === ticket.id ? { ...t, status: newStatus } : t))

    // Persist
    const { error } = await supabase
      .from('tickets')
      .update({ status: newStatus })
      .eq('id', ticket.id)

    if (error) {
      // Revert on failure
      setTickets(prev => prev.map(t => t.id === ticket.id ? { ...t, status: ticket.status } : t))
    }
  }

  const selectClass = "px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-700"

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="space-y-4">
        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search tickets…"
              className="pl-9 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
            />
          </div>

          <select value={filterClient} onChange={e => setFilterClient(e.target.value)} className={selectClass}>
            <option value="">All Brands</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          <select value={filterMember} onChange={e => setFilterMember(e.target.value)} className={selectClass}>
            <option value="">All Members</option>
            {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>

          <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} className={selectClass}>
            <option value="">All Priorities</option>
            <option value="P1">P1 — Critical</option>
            <option value="P2">P2 — High</option>
            <option value="P3">P3 — Medium</option>
            <option value="P4">P4 — Low</option>
          </select>

          <select value={filterPlatform} onChange={e => setFilterPlatform(e.target.value)} className={selectClass}>
            <option value="">All Platforms</option>
            {['amazon','flipkart','myntra','blinkit','meesho','nykaa','other'].map(p => (
              <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
            ))}
          </select>

          <select value={filterDeadline} onChange={e => setFilterDeadline(e.target.value)} className={selectClass}>
            <option value="">All Deadlines</option>
            <option value="today">🔴 Today</option>
            <option value="this_week">🟠 This Week</option>
            <option value="this_month">🔵 This Month</option>
          </select>

          {hasFilters && (
            <button
              onClick={clearFilters}
              className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 px-2 py-1.5 rounded-lg hover:bg-gray-100"
            >
              <X className="w-3.5 h-3.5" />
              Clear
            </button>
          )}

          <span className="text-xs text-gray-400 ml-auto">
            {filtered.length} of {tickets.length} tickets
          </span>
        </div>

        {/* Kanban columns */}
        <div className="flex gap-4 overflow-x-auto pb-4">
          {COLUMNS.map(col => (
            <DroppableColumn
              key={col.key}
              col={col}
              tickets={byStatus[col.key]}
              hasFilters={hasFilters}
            />
          ))}
        </div>
      </div>

      {/* Drag ghost */}
      <DragOverlay>
        {activeTicket && <TicketCard ticket={activeTicket} overlay />}
      </DragOverlay>
    </DndContext>
  )
}
