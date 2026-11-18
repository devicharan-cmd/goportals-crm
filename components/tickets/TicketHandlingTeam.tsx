import { Mail, Phone } from 'lucide-react'
import { Avatar, Card, CardHeader } from '@/components/ui/primitives'
import { ROLE_LABELS } from '@/lib/constants'
import type { AppRole } from '@/types/database'

export type TicketHandlingContact = {
  id: string
  full_name: string | null
  avatar_url: string | null
  role: AppRole
  email: string | null
  phone: string | null
}

export function TicketHandlingTeam({ people, unavailable = false }: { people: TicketHandlingContact[]; unavailable?: boolean }) {
  return (
    <Card>
      <CardHeader title="Ticket handling team" />
      {people.length ? (
        <ul className="divide-y divide-slate-100">
          {people.map(person => (
            <li key={person.id} className="flex items-start gap-3 px-5 py-3">
              <Avatar name={person.full_name || 'Staff member'} src={person.avatar_url} role={person.role} size="md" />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="break-words text-sm font-medium text-slate-800">{person.full_name || 'Staff member'}</p>
                <p className="text-xs text-slate-500">{ROLE_LABELS[person.role]}</p>
                {person.email ? (
                  <a className="flex min-w-0 items-center gap-1.5 break-all text-xs text-slate-600 hover:text-teal-700" href={`mailto:${person.email}`}>
                    <Mail className="h-3.5 w-3.5 flex-shrink-0" />{person.email}
                  </a>
                ) : <p className="text-xs text-slate-400">—</p>}
                {person.phone ? (
                  <a className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-teal-700" href={`tel:${person.phone}`}>
                    <Phone className="h-3.5 w-3.5 flex-shrink-0" />{person.phone}
                  </a>
                ) : <p className="flex items-center gap-1.5 text-xs text-slate-400"><Phone className="h-3.5 w-3.5" />—</p>}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-5 py-3 text-sm text-slate-500">
          {unavailable ? 'Handling team details are temporarily unavailable.' : 'No handling team has been assigned to this client yet.'}
        </p>
      )}
    </Card>
  )
}
