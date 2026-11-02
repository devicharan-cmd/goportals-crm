'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { Alert, Card } from '@/components/ui/primitives'
import { TicketTable, type TicketListItem } from '@/components/shared/TicketTable'
import { TicketBoard } from '@/components/tickets/TicketBoard'
import { DebouncedSearchInput } from '@/components/shared/DebouncedSearchInput'
import { searchPortalTickets, searchStaffTickets } from '@/app/actions/search'
import { clientPortalTicketStatus, normalizeTicketStatus } from '@/lib/ticket-status'
import { errorMessage } from '@/lib/utils'
import type { AssigneeOption } from '@/lib/queries'
import type { Ticket } from '@/types/database'

type SearchMode = 'client' | 'staff'
type TicketStatusFilter = 'open' | 'done' | 'all'
type SearchContextValue = {
  tickets: TicketListItem[]
  unreadByTicket?: Record<string, number>
  audience: SearchMode
  status: TicketStatusFilter
  board: boolean
  names: Record<string, string>
  assignOptions?: AssigneeOption[]
  searching: boolean
  error: string
  setQuery: (query: string) => void
}

const TicketSearchContext = createContext<SearchContextValue | null>(null)

export function TicketSearchProvider({
  initialTickets,
  unreadByTicket,
  audience,
  status,
  board = false,
  names = {},
  assignOptions,
  children,
}: {
  initialTickets: TicketListItem[]
  unreadByTicket?: Record<string, number>
  audience: SearchMode
  status: TicketStatusFilter
  board?: boolean
  names?: Record<string, string>
  assignOptions?: AssigneeOption[]
  children: React.ReactNode
}) {
  const [query, setQuery] = useState('')
  const [tickets, setTickets] = useState(initialTickets)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    if (!query) {
      setTickets(initialTickets)
      setSearching(false)
      setError('')
      return () => { active = false }
    }

    setSearching(true)
    setError('')
    const search = audience === 'client' ? searchPortalTickets : searchStaffTickets
    void search(query, status)
      .then(rows => {
        if (!active) return
        setTickets(rows.map(ticket => ({
          ...ticket,
          status: audience === 'client'
            ? clientPortalTicketStatus(ticket as Ticket)
            : normalizeTicketStatus(ticket.status),
        })))
      })
      .catch(searchError => {
        if (active) setError(errorMessage(searchError))
      })
      .finally(() => {
        if (active) setSearching(false)
      })

    return () => { active = false }
  }, [audience, initialTickets, query, status])

  const handleSearch = useCallback((value: string) => setQuery(value), [])
  const contextValue: SearchContextValue = {
    tickets, unreadByTicket, audience, status, board, names, assignOptions,
    searching, error, setQuery: handleSearch,
  }

  return <TicketSearchContext.Provider value={contextValue}>{children}</TicketSearchContext.Provider>
}

export function TicketSearchField({ className }: { className?: string }) {
  const search = useTicketSearch()

  return (
    <div className={`relative ${className ?? ''}`}>
      <DebouncedSearchInput
        placeholder="Search subject or TK-1024…"
        className="w-full"
        ariaLabel="Search tickets"
        onSearch={search.setQuery}
      />
      {search.searching && <span className="sr-only" role="status">Searching tickets</span>}
    </div>
  )
}

export function TicketSearchResults() {
  const search = useTicketSearch()

  return (
    <div className="space-y-2">
      {search.error && <Alert>{search.error}</Alert>}
      {search.board ? (
        <TicketBoard tickets={search.tickets} names={search.names} assignOptions={search.assignOptions} />
      ) : (
        <Card className="overflow-hidden">
          <TicketTable
            tickets={search.tickets}
            hrefBase={search.audience === 'client' ? '/portal/tickets' : '/tickets'}
            showClient={search.audience === 'staff'}
            audience={search.audience}
            unreadByTicket={search.unreadByTicket}
            empty={{ title: search.queryEmptyTitle }}
          />
        </Card>
      )}
    </div>
  )
}

function useTicketSearch() {
  const value = useContext(TicketSearchContext)
  if (!value) throw new Error('Ticket search components must be rendered inside TicketSearchProvider')
  return {
    ...value,
    queryEmptyTitle: value.status === 'done' ? 'Nothing completed yet' : value.status === 'all' ? 'No tickets found' : 'No open tickets',
  }
}
