import { StatusBadge } from '@/components/ui/badges'
import { TICKET_STATUS_DOT, TICKET_STATUS_LABELS_CLIENT, TICKET_STATUS_STYLES } from '@/lib/constants'
import type { TicketStatus } from '@/types/database'

export function ClientTicketStatusBadge({ status }: { status: TicketStatus }) {
  return <StatusBadge label={TICKET_STATUS_LABELS_CLIENT[status]} className={TICKET_STATUS_STYLES[status]} dotClassName={TICKET_STATUS_DOT[status]} />
}
