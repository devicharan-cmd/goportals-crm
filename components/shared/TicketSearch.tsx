'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { Alert, Card } from '@/components/ui/primitives'
import { TicketTable, type TicketListItem } from '@/components/shared/TicketTable'
import { DebouncedSearchInput } from '@/components/shared/DebouncedSearchInput'
import { searchPortalTickets, searchStaffTickets } from '@/app/actions/search'
import { errorMessage } from '@/lib/utils'
import type { TicketStatus } from '@/types/database'

type SearchMode = 'client' | 'staff'
type TicketStatusFilter = TicketStatus | 'open' | 'done' | null
type SearchContextValue = {
  tickets: TicketListItem[]
  query: string
  unreadByTicket?: Record<string, number>
  audience: SearchMode
  status: TicketStatusFilter
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
  children,
}: {
  initialTickets: TicketListItem[]
  unreadByTicket?: Record<string, number>
  audience: SearchMode
  status: TicketStatusFilter
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
    const request = audience === 'client'
      ? searchPortalTickets(query, status === 'done' ? 'done' : 'open')
      : status && status !== 'done' && status !== 'open'
        ? searchStaffTickets(query, status)
        : Promise.reject(new Error('A staff status filter is required'))
    void request
      .then(rows => {
        if (!active) return
        setTickets(rows)
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
    tickets, query, unreadByTicket, audience, status,
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
    </div>
  )
}

function useTicketSearch() {
  const value = useContext(TicketSearchContext)
  if (!value) throw new Error('Ticket search components must be rendered inside TicketSearchProvider')
  return {
    ...value,
    queryEmptyTitle: value.query
      ? 'No tickets match this search'
      : value.status === 'done' || value.status === 'closed'
        ? 'No closed tickets'
        : value.status === 'assigned'
        ? 'No assigned tickets'
        : value.status === 'unassigned'
          ? 'No unassigned tickets'
          : 'No open tickets',
  }
}
