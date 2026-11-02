'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Flame } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { CreateTasksModal } from '@/components/tickets/CreateTasksModal'
import { PRIORITY_OPTIONS, TICKET_STATUS_DOT, TICKET_STATUS_LABELS, TICKET_STATUS_STYLES } from '@/lib/constants'
import { StatusBadge } from '@/components/ui/badges'
import { cn, errorMessage } from '@/lib/utils'
import type { AssigneeOption } from '@/lib/queries'
import type { Department, TaskPriority, Ticket } from '@/types/database'

/** Ticket status is derived from its linked tasks; managers edit its details and create tasks here. */
export function TicketProperties({
  ticket, departments, assignees, canMarkUrgent, canEdit, clientAssignee, canAssignToClient,
}: {
  ticket: Ticket; departments: Department[]; assignees: AssigneeOption[]; canMarkUrgent: boolean
  canEdit: boolean; clientAssignee?: AssigneeOption; canAssignToClient: boolean
}) {
  const router = useRouter()
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState('')
  const isClosed = ticket.status === 'closed'

  async function update(field: string, value: unknown) {
    setSaving(field)
    setError('')
    const { error } = await createClient().from('tickets').update({ [field]: value }).eq('id', ticket.id)
    setSaving(null)
    if (error) setError(errorMessage(error))
    router.refresh()
  }

  const row = 'grid grid-cols-[100px_1fr] items-center gap-3'
  const label = 'text-xs font-medium text-slate-500'
  const select = 'input h-9 py-1.5 text-sm'

  return (
    <div className="space-y-3">
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

      {isClosed && (
        <p className="rounded-lg bg-lime-50 px-3 py-2 text-xs text-lime-800">
          All active tasks linked to this ticket are complete.
        </p>
      )}

      <div className={row}>
        <span className={label}>Status</span>
        <StatusBadge label={TICKET_STATUS_LABELS[ticket.status]} className={TICKET_STATUS_STYLES[ticket.status]} dotClassName={TICKET_STATUS_DOT[ticket.status]} />
      </div>

      <div className={row}>
        <span className={label}>Priority</span>
        {canEdit
          ? <select className={cn(select)} value={ticket.priority ?? ''} disabled={isClosed || saving === 'priority'}
                    onChange={e => update('priority', e.target.value as TaskPriority)}>
              <option value="" disabled>Not set</option>
              {PRIORITY_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          : <span className="text-sm text-slate-700">{ticket.priority ?? 'Not set'}</span>}
      </div>

      <div className={row}>
        <span className={label}>Department</span>
        {canEdit
          ? <select className={cn(select)} value={ticket.department_id ?? ''} disabled={isClosed || saving === 'department_id'}
                    onChange={e => update('department_id', e.target.value || null)}>
              <option value="">Not set</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          : <span className="text-sm text-slate-700">{departments.find(d => d.id === ticket.department_id)?.name ?? 'Not set'}</span>}
      </div>

      {canMarkUrgent && (
        <div className={row}>
          <span className={label}>Urgent</span>
          <button
            type="button"
            role="switch"
            aria-checked={ticket.is_urgent}
            onClick={() => update('is_urgent', !ticket.is_urgent)}
            disabled={isClosed || saving === 'is_urgent'}
            title={ticket.is_urgent ? 'In the urgent pool — click to remove' : 'Put this ticket in the urgent pool'}
            className="flex items-center gap-2 text-sm disabled:opacity-60"
          >
            <span className={cn('relative h-5 w-9 flex-shrink-0 rounded-full transition', ticket.is_urgent ? 'bg-red-600' : 'bg-slate-300')}>
              <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition', ticket.is_urgent ? 'left-[18px]' : 'left-0.5')} />
            </span>
            <span className={cn('inline-flex items-center gap-1', ticket.is_urgent ? 'font-semibold text-red-700' : 'text-slate-500')}>
              {ticket.is_urgent && <Flame className="h-3.5 w-3.5" />}{ticket.is_urgent ? 'Yes' : 'No'}
            </span>
          </button>
        </div>
      )}

      {!isClosed && (
        <div className="border-t border-slate-100 pt-3">
          <CreateTasksModal
            ticket={ticket}
            assignees={assignees}
            clientAssignee={canAssignToClient ? clientAssignee : undefined}
          />
        </div>
      )}
    </div>
  )
}
