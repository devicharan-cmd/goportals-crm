'use client'

import { CreateTasksModal } from '@/components/tickets/CreateTasksModal'
import { TICKET_STATUS_DOT, TICKET_STATUS_LABELS, TICKET_STATUS_STYLES } from '@/lib/constants'
import { StatusBadge } from '@/components/ui/badges'
import type { AssigneeOption } from '@/lib/queries'
import type { Department, Platform, Service, Ticket } from '@/types/database'

/** Ticket status is derived from its linked tasks; managers edit its details and create tasks here. */
export function TicketProperties({
  ticket, departments, platforms, services, assignees, canMarkUrgent, clientAssignee, meId, hasLinkedTasks,
}: {
  ticket: Ticket; departments: Department[]; platforms: Platform[]; services: Service[]
  assignees: AssigneeOption[]; canMarkUrgent: boolean
  clientAssignee?: AssigneeOption; meId: string
  hasLinkedTasks: boolean
}) {
  const isClosed = ticket.status === 'closed'

  const row = 'grid grid-cols-[100px_1fr] items-center gap-3'
  const label = 'text-xs font-medium text-slate-500'

  return (
    <div className="space-y-3">
      {isClosed && (
        <p className="rounded-lg bg-lime-50 px-3 py-2 text-xs text-lime-800">
          All active tasks linked to this ticket are complete.
        </p>
      )}

      <div className={row}>
        <span className={label}>Status</span>
        <StatusBadge label={TICKET_STATUS_LABELS[ticket.status]} className={`${TICKET_STATUS_STYLES[ticket.status]} w-fit justify-self-start`} dotClassName={TICKET_STATUS_DOT[ticket.status]} />
      </div>

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
