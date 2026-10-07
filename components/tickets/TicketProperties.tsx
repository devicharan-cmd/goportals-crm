'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Flame, RotateCcw } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { CreateTasksModal } from '@/components/tickets/CreateTasksModal'
import { PRIORITY_OPTIONS, TICKET_STATUS_OPTIONS } from '@/lib/constants'
import { cn, errorMessage } from '@/lib/utils'
import type { AssigneeOption } from '@/lib/queries'
import type { Department, TaskPriority, Ticket, TicketStatus } from '@/types/database'

// 'closed' and 'reopened' are never picked from the plain dropdown — they're only
// reachable through the dedicated close/reopen actions below (close_ticket()/reopen_ticket()
// RPCs, which check status='resolved' and client-or-admin), never a raw status write
// (guard_ticket_write rejects that directly).
const SELECTABLE_STATUSES = TICKET_STATUS_OPTIONS.filter(s => s.value !== 'closed' && s.value !== 'reopened')

type DeptLead = { id: string; name: string }

/** Inline-editable status / priority / department / urgency for the ticket detail sidebar, plus "make a task". */
export function TicketProperties({
  ticket, departments, deptLeads, assignees, canAssign, canMarkUrgent, canClose,
}: {
  ticket: Ticket; departments: Department[]; deptLeads: Record<string, DeptLead>; assignees: AssigneeOption[]
  canAssign: boolean; canMarkUrgent: boolean; canClose: boolean
}) {
  const router = useRouter()
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState('')
  const isClosed = ticket.status === 'closed'
  const isReopened = ticket.status === 'reopened'

  async function update(field: string, value: unknown) {
    setSaving(field)
    setError('')
    const { error } = await createClient().from('tickets').update({ [field]: value }).eq('id', ticket.id)
    setSaving(null)
    if (error) setError(errorMessage(error))
    router.refresh()
  }

  async function closeTicket() {
    setSaving('close')
    setError('')
    const { error } = await createClient().rpc('close_ticket', { p_ticket_id: ticket.id })
    setSaving(null)
    if (error) return setError(errorMessage(error))
    router.refresh()
  }

  async function reopenTicket() {
    setSaving('reopen')
    setError('')
    const { error } = await createClient().rpc('reopen_ticket', { p_ticket_id: ticket.id })
    setSaving(null)
    if (error) return setError(errorMessage(error))
    router.refresh()
  }

  async function changeDepartment(deptId: string) {
    setSaving('department_id')
    setError('')
    const lead = deptId ? deptLeads[deptId] : undefined
    // Auto-assign the new department's lead only when nobody's assigned yet —
    // never silently overwrite an existing assignee.
    const payload: Record<string, unknown> = { department_id: deptId || null }
    if (lead && !ticket.assignee_id) payload.assignee_id = lead.id
    const { error } = await createClient().from('tickets').update(payload).eq('id', ticket.id)
    setSaving(null)
    if (error) setError(errorMessage(error))
    router.refresh()
  }

  async function assignTo(profileId: string) {
    setSaving('assignee_id')
    setError('')
    const { error } = await createClient().from('tickets').update({ assignee_id: profileId }).eq('id', ticket.id)
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

      {isReopened && (
        <p className="rounded-lg bg-orange-50 px-3 py-2 text-xs text-orange-800">
          The client sent this back for changes — check their latest comment and rework the task(s).
        </p>
      )}

      {isClosed && (
        <p className="rounded-lg bg-lime-50 px-3 py-2 text-xs text-lime-800">
          This ticket is closed and permanently locked. Create a new ticket for further work.
        </p>
      )}

      <div className={row}>
        <span className={label}>Status</span>
        <select className={cn(select)} value={ticket.status} disabled={isClosed || isReopened || !canAssign || saving === 'status'}
                onChange={e => update('status', e.target.value as TicketStatus)}>
          {SELECTABLE_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      <div className={row}>
        <span className={label}>Priority</span>
        <select className={cn(select)} value={ticket.priority ?? ''} disabled={isClosed || saving === 'priority'}
                onChange={e => update('priority', e.target.value as TaskPriority)}>
          <option value="" disabled>Not set</option>
          {PRIORITY_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      <div className={row}>
        <span className={label}>Department</span>
        <select className={cn(select)} value={ticket.department_id ?? ''} disabled={isClosed || saving === 'department_id'}
                onChange={e => changeDepartment(e.target.value)}>
          <option value="">Not set</option>
          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>

      {canAssign && !isClosed && ticket.department_id && (() => {
        const lead = deptLeads[ticket.department_id]
        return lead && lead.id !== ticket.assignee_id ? (
          <div className="flex items-center justify-between gap-2 rounded-lg bg-sky-50 px-3 py-2 text-xs ring-1 ring-inset ring-sky-200">
            <span className="text-sky-800">Suggested: assign to <span className="font-semibold">{lead.name}</span> (dept lead)</span>
            <Button size="sm" variant="secondary" loading={saving === 'assignee_id'} onClick={() => assignTo(lead.id)}>Assign</Button>
          </div>
        ) : null
      })()}

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

      {canClose && ticket.status === 'resolved' && (
        <div className="space-y-2 border-t border-slate-100 pt-3">
          <Button size="sm" variant="secondary" className="w-full" loading={saving === 'close'} onClick={closeTicket}>
            <CheckCircle2 className="h-3.5 w-3.5" /> Close ticket
          </Button>
          <Button size="sm" variant="secondary" className="w-full" loading={saving === 'reopen'} onClick={reopenTicket}>
            <RotateCcw className="h-3.5 w-3.5" /> Reopen for rework
          </Button>
        </div>
      )}

      {!isClosed && (
        <div className="border-t border-slate-100 pt-3">
          <CreateTasksModal ticket={ticket} assignees={assignees} />
        </div>
      )}
    </div>
  )
}
