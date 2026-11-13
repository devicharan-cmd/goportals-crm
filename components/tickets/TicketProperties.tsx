'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CreateTasksModal } from '@/components/tickets/CreateTasksModal'
import { SearchableSelect } from '@/components/shared/SearchableSelect'
import { TICKET_STATUS_DOT, TICKET_STATUS_LABELS, TICKET_STATUS_STYLES } from '@/lib/constants'
import { StatusBadge } from '@/components/ui/badges'
import { createClient } from '@/lib/supabase/client'
import { errorMessage } from '@/lib/utils'
import type { AssigneeOption } from '@/lib/queries'
import type { Department, Platform, Service, Ticket, TicketStatus } from '@/types/database'
import { useSingleFlight } from '@/components/shared/useSingleFlight'

/** Staff ticket properties and permitted inline controls. */
export function TicketProperties({
  ticket, departments, platforms, services, assignees, canMarkUrgent, clientAssignee, meId, hasLinkedTasks, canChangeStatus,
}: {
  ticket: Ticket; departments: Department[]; platforms: Platform[]; services: Service[]
  assignees: AssigneeOption[]; canMarkUrgent: boolean
  clientAssignee?: AssigneeOption; meId: string
  hasLinkedTasks: boolean
  canChangeStatus: boolean
}) {
  const router = useRouter()
  const runOnce = useSingleFlight()
  const [savingStatus, setSavingStatus] = useState(false)
  const [statusError, setStatusError] = useState('')
  const isClosed = ticket.status === 'closed'

  async function changeStatus(status: TicketStatus) {
    if (status === ticket.status) return
    setSavingStatus(true)
    setStatusError('')
    const { error } = await createClient().rpc('set_ticket_status', {
      p_ticket_id: ticket.id,
      p_status: status,
    })
    setSavingStatus(false)
    if (error) {
      setStatusError(errorMessage(error))
      return
    }
    router.refresh()
  }

  const row = 'grid grid-cols-[100px_1fr] items-center gap-3'
  const label = 'text-xs font-medium text-slate-500'

  return (
    <div className="space-y-3">
      {isClosed && (
        <p className="rounded-lg bg-[#F5FAE8] px-3 py-2 text-xs text-[#465B17]">
          This ticket is closed. Reopen it here before adding or relinking tasks. Existing task statuses can still be changed.
        </p>
      )}

      <div className={row}>
        <span className={label}>Status</span>
        {canChangeStatus ? (
          <SearchableSelect
            value={ticket.status}
            onChange={event => void runOnce('status', () => changeStatus(event.target.value as TicketStatus))}
            disabled={savingStatus}
            aria-label="Ticket status"
            className="w-full"
          >
            {Object.entries(TICKET_STATUS_LABELS)
              .filter(([status]) => status !== 'unassigned')
              .map(([status, statusLabel]) => (
              <option key={status} value={status}>{statusLabel}</option>
              ))}
          </SearchableSelect>
        ) : (
          <StatusBadge label={TICKET_STATUS_LABELS[ticket.status]} className={`${TICKET_STATUS_STYLES[ticket.status]} w-fit justify-self-start`} dotClassName={TICKET_STATUS_DOT[ticket.status]} />
        )}
      </div>
      {statusError && <p role="alert" className="text-xs text-red-600">{statusError}</p>}

      {!isClosed && (
        <div className="border-t border-slate-100 pt-3">
          <CreateTasksModal
            ticket={ticket}
            assignees={assignees}
            clientAssignee={clientAssignee}
            meId={meId}
            canMarkUrgent={canMarkUrgent}
            departments={departments}
            platforms={platforms}
            services={services}
            hasLinkedTasks={hasLinkedTasks}
          />
        </div>
      )}
    </div>
  )
}
