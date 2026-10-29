import type { Ticket, TicketStatus } from '@/types/database'

export const CLIENT_TICKET_STAGES = [
  { label: 'New', description: 'Client created' },
  { label: 'Under review', description: 'Manager review' },
  { label: 'Assigned', description: 'Assigned to team' },
  { label: 'In progress', description: 'Tasks underway' },
  { label: 'Ready for review', description: 'Team Lead review' },
  { label: 'Resolved', description: 'All tasks approved' },
  { label: 'Client review', description: 'Review the completed work' },
  { label: 'Closed', description: 'Client approved' },
  { label: 'Reopened', description: 'Changes requested' },
] as const

export function clientWorkflowStageIndex(status: TicketStatus): number {
  switch (status) {
    case 'new': return 0
    case 'under_review':
    case 'awaiting_clarification': return 1
    case 'assigned': return 2
    case 'in_progress': return 3
    case 'ready_for_review': return 4
    case 'resolved': return 5
    case 'ready_for_client': return 6
    case 'closed': return 7
    case 'reopened': return 8
  }
}

export function isClientWorkflowStageComplete(index: number, status: TicketStatus, current: number): boolean {
  if (status === 'reopened') return index < 7
  return index < current
}

/**
 * Legacy tickets used awaiting_clarification as a workflow status. The client
 * portal now uses the current workflow stage plus a message-author badge, so
 * this old status is displayed as the manager review stage.
 */
export function clientPortalTicketStatus(
  ticket: Pick<Ticket, 'status'>,
): TicketStatus {
  return normalizeTicketStatus(ticket.status)
}

/** Collapse the retired hold status into the active Manager review stage. */
export function normalizeTicketStatus(status: TicketStatus): TicketStatus {
  return status === 'awaiting_clarification' ? 'under_review' : status
}
