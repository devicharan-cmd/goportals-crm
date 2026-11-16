'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { CreateTasksModal } from '@/components/tickets/CreateTasksModal'
import { TICKET_STATUS_DOT, TICKET_STATUS_LABELS, TICKET_STATUS_STYLES } from '@/lib/constants'
import { StatusBadge } from '@/components/ui/badges'
import { createClient } from '@/lib/supabase/client'
import { showErrorToast } from '@/lib/ui-toast'
import type { AssigneeOption } from '@/lib/queries'
import type { Department, Platform, Service, Ticket } from '@/types/database'

/** Staff ticket properties and permitted inline controls. */
export function TicketProperties({
  ticket,
  departments,
  platforms,
  services,
  assignees,
  canMarkUrgent,
  clientAssignee,
  meId,
  hasLinkedTasks,
}: {
  ticket: Ticket & { client?: { id?: string; company_name?: string; contact_name?: string | null } | null }
  departments: Department[]
  platforms: Platform[]
  services: Service[]
  assignees: AssigneeOption[]
  canMarkUrgent: boolean
  clientAssignee?: AssigneeOption
  meId: string
  hasLinkedTasks: boolean
  canChangeStatus: boolean
}) {
  const router = useRouter()
  const isClosed = ticket.status === 'closed'

  // Instant notification and redirect if client deletes this ticket while staff is viewing
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`ticket-live-${ticket.id}`)
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'tickets',
          filter: `id=eq.${ticket.id}`,
        },
        () => {
          const clientName = ticket.client?.company_name || 'the client'
          showErrorToast(`This ticket was deleted by ${clientName} and doesn't exist anymore.`)
          router.push('/tickets')
          router.refresh()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [ticket.id, ticket.client?.company_name, router])

  const row = 'grid grid-cols-[100px_1fr] items-center gap-3'
  const label = 'text-xs font-medium text-slate-500'

  return (
    <div className="space-y-3">
      {isClosed && (
        <p className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-600">
          This ticket is closed.
        </p>
      )}

      <div className={row}>
        <span className={label}>Status</span>
        <StatusBadge
          label={TICKET_STATUS_LABELS[ticket.status]}
          className={`${TICKET_STATUS_STYLES[ticket.status]} w-fit justify-self-start`}
          dotClassName={TICKET_STATUS_DOT[ticket.status]}
        />
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
