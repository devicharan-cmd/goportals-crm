'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { Alert, Card } from '@/components/ui/primitives'
import { TicketTable, type TicketListItem } from '@/components/shared/TicketTable'
import { DebouncedSearchInput } from '@/components/shared/DebouncedSearchInput'
import { searchPortalTickets, searchStaffTickets } from '@/app/actions/search'
import { errorMessage } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import type { TicketStatus } from '@/types/database'

type SearchMode = 'client' | 'staff'
type TicketStatusFilter = TicketStatus | 'open' | 'done' | null
type SearchContextValue = {
  tickets: TicketListItem[]
  query: string
  unreadByTicket?: Record<string, number>
  realtimeUserId?: string
  audience: SearchMode
  status: TicketStatusFilter
  searching: boolean
  error: string
  hasMoreTickets: boolean
  loadingMoreTickets: boolean
  setQuery: (query: string) => void
  loadMoreTickets: () => void
}

const TicketSearchContext = createContext<SearchContextValue | null>(null)
type TicketPageCursor = { id: string; created_at: string }
type StaffTicketStatus = 'unassigned' | 'assigned' | 'closed'

function isStaffTicketStatus(status: TicketStatusFilter): status is StaffTicketStatus {
  return status === 'unassigned' || status === 'assigned' || status === 'closed'
}

export function TicketSearchProvider({
  initialTickets,
  initialHasMoreTickets = false,
  initialTicketCursor = null,
  unreadByTicket,
  realtimeUserId,
  audience,
  status,
  children,
}: {
  initialTickets: TicketListItem[]
  initialHasMoreTickets?: boolean
  initialTicketCursor?: TicketPageCursor | null
  unreadByTicket?: Record<string, number>
  realtimeUserId?: string
  audience: SearchMode
  status: TicketStatusFilter
  children: React.ReactNode
}) {
  const [query, setQuery] = useState('')
  const [tickets, setTickets] = useState(initialTickets)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')
  const [hasMoreTickets, setHasMoreTickets] = useState(initialHasMoreTickets)
  const [nextTicketCursor, setNextTicketCursor] = useState<TicketPageCursor | null>(initialTicketCursor)
  const [loadingMoreTickets, setLoadingMoreTickets] = useState(false)
  const ticketRequestId = useRef(0)

  useEffect(() => {
    ticketRequestId.current += 1
    let active = true
    setLoadingMoreTickets(false)
    if (!query) {
      setTickets(initialTickets)
      setHasMoreTickets(initialHasMoreTickets)
      setNextTicketCursor(initialTicketCursor)
      setSearching(false)
      setError('')
      return () => { active = false }
    }

    setSearching(true)
    setError('')
    const request = audience === 'client'
      ? searchPortalTickets(query, status === 'done' ? 'done' : 'open')
          .then(result => ({ ...result, tickets: result.tickets as TicketListItem[] }))
      : isStaffTicketStatus(status)
        ? searchStaffTickets(query, status)
        : Promise.reject(new Error('A staff status filter is required'))
    void request
      .then(result => {
        if (!active) return
        setTickets(result.tickets)
        setHasMoreTickets(result.hasMore)
        setNextTicketCursor(result.nextCursor)
      })
      .catch(searchError => {
        if (active) setError(errorMessage(searchError))
      })
      .finally(() => {
        if (active) setSearching(false)
      })

    return () => { active = false }
  }, [audience, initialHasMoreTickets, initialTicketCursor, initialTickets, query, status])

  const handleSearch = useCallback((value: string) => setQuery(value), [])
  const loadMoreTickets = useCallback(() => {
    if (loadingMoreTickets || searching || !hasMoreTickets || !nextTicketCursor) return
    const requestId = ticketRequestId.current
    setLoadingMoreTickets(true)
    setError('')
    const request = audience === 'client'
      ? searchPortalTickets(query, status === 'done' ? 'done' : 'open', nextTicketCursor)
      : isStaffTicketStatus(status)
        ? searchStaffTickets(query, status, nextTicketCursor)
        : Promise.reject(new Error('A staff status filter is required'))
    void request
      .then(result => {
        if (ticketRequestId.current !== requestId) return
        setTickets(current => {
          const existingIds = new Set(current.map(ticket => ticket.id))
          return [...current, ...(result.tickets as TicketListItem[]).filter(ticket => !existingIds.has(ticket.id))]
        })
        setHasMoreTickets(result.hasMore)
        setNextTicketCursor(result.nextCursor)
      })
      .catch(loadError => {
        if (ticketRequestId.current === requestId) setError(errorMessage(loadError))
      })
      .finally(() => {
        if (ticketRequestId.current === requestId) setLoadingMoreTickets(false)
      })
  }, [audience, hasMoreTickets, loadingMoreTickets, nextTicketCursor, query, searching, status])
  const contextValue: SearchContextValue = {
    tickets, query, unreadByTicket, realtimeUserId, audience, status,
    searching, error, hasMoreTickets, loadingMoreTickets, setQuery: handleSearch, loadMoreTickets,
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
          realtimeUserId={search.realtimeUserId}
          empty={{ title: search.queryEmptyTitle }}
        />
        {search.hasMoreTickets && (
          <div className="flex justify-center p-4">
            <Button variant="secondary" loading={search.loadingMoreTickets} onClick={search.loadMoreTickets}>
              Load more tickets
            </Button>
          </div>
        )}
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
