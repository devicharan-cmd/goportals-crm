'use client'

import Link from 'next/link'
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Building2 } from 'lucide-react'
import { searchClients } from '@/app/actions/search'
import { DebouncedSearchInput } from '@/components/shared/DebouncedSearchInput'
import { SearchableSelect } from '@/components/shared/SearchableSelect'
import { AccountStatusBadge } from '@/components/ui/badges'
import { Alert, Avatar, CompanyAvatar, EmptyState } from '@/components/ui/primitives'
import { Button } from '@/components/ui/button'
import { errorMessage } from '@/lib/utils'
import { STAGE_LABELS } from '@/lib/constants'
import type { Client } from '@/types/database'

type ClientRow = Client & { client_team: { profile_id: string }[] }
type ClientStatus = '' | 'active' | 'pending' | 'suspended' | 'rejected'
type ClientSearchContextValue = {
  clients: ClientRow[]
  imageUrlByPath: Record<string, string>
  names: Record<string, string>
  avatarUrls: Record<string, string | null>
  openCount: Record<string, number>
  error: string
  searching: boolean
  hasMoreClients: boolean
  loadingMoreClients: boolean
  setQuery: (query: string) => void
  loadMoreClients: () => void
}

const ClientSearchContext = createContext<ClientSearchContextValue | null>(null)

export function ClientSearchProvider({
  initialClients,
  initialHasMoreClients,
  initialClientOffset,
  initialImageUrlByPath,
  names,
  avatarUrls,
  status,
  openCount,
  children,
}: {
  initialClients: ClientRow[]
  initialHasMoreClients: boolean
  initialClientOffset: number
  initialImageUrlByPath: Record<string, string>
  names: Record<string, string>
  avatarUrls: Record<string, string | null>
  status: ClientStatus
  openCount: Record<string, number>
  children: React.ReactNode
}) {
  const [query, setQuery] = useState('')
  const [clients, setClients] = useState(initialClients)
  const [imageUrlByPath, setImageUrlByPath] = useState(initialImageUrlByPath)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')
  const [hasMoreClients, setHasMoreClients] = useState(initialHasMoreClients)
  const [nextOffset, setNextOffset] = useState<number | null>(initialHasMoreClients ? initialClientOffset : null)
  const [loadingMoreClients, setLoadingMoreClients] = useState(false)
  const requestId = useRef(0)

  const setSearch = useCallback((value: string) => setQuery(value), [])

  useEffect(() => {
    const currentRequestId = ++requestId.current
    let active = true
    setLoadingMoreClients(false)
    if (!query) {
      setClients(initialClients)
      setImageUrlByPath(initialImageUrlByPath)
      setHasMoreClients(initialHasMoreClients)
      setNextOffset(initialHasMoreClients ? initialClientOffset : null)
      setSearching(false)
      setError('')
      return () => { active = false }
    }

    setSearching(true)
    setError('')
    void searchClients(query, status)
      .then(result => {
        if (!active) return
        setClients(result.clients)
        setImageUrlByPath(result.imageUrlByPath)
        setHasMoreClients(result.hasMore)
        setNextOffset(result.nextOffset)
      })
      .catch(searchError => {
        if (active) setError(errorMessage(searchError))
      })
      .finally(() => {
        if (active) setSearching(false)
      })

    return () => { active = false }
  }, [initialClientOffset, initialClients, initialHasMoreClients, initialImageUrlByPath, query, status])

  const loadMoreClients = useCallback(() => {
    if (loadingMoreClients || searching || !hasMoreClients || nextOffset === null) return
    const currentRequestId = requestId.current
    setLoadingMoreClients(true)
    setError('')
    void searchClients(query, status, nextOffset)
      .then(result => {
        if (requestId.current !== currentRequestId) return
        setClients(current => {
          const existingIds = new Set(current.map(client => client.id))
          return [...current, ...result.clients.filter(client => !existingIds.has(client.id))]
        })
        setImageUrlByPath(current => ({ ...current, ...result.imageUrlByPath }))
        setHasMoreClients(result.hasMore)
        setNextOffset(result.nextOffset)
      })
      .catch(loadError => {
        if (requestId.current === currentRequestId) setError(errorMessage(loadError))
      })
      .finally(() => {
        if (requestId.current === currentRequestId) setLoadingMoreClients(false)
      })
  }, [hasMoreClients, loadingMoreClients, nextOffset, query, searching, status])

  return (
    <ClientSearchContext.Provider value={{
      clients, imageUrlByPath, names, avatarUrls, openCount, error, searching,
      hasMoreClients, loadingMoreClients, setQuery: setSearch, loadMoreClients,
    }}>
      {children}
    </ClientSearchContext.Provider>
  )
}

export function ClientSearchField() {
  const search = useClientSearch()
  return (
    <DebouncedSearchInput
      placeholder="Search clients…"
      className="min-w-[220px] flex-1 sm:max-w-xs"
      ariaLabel="Search clients"
      onSearch={search.setQuery}
    />
  )
}

export function ClientStatusFilter({ status }: { status: ClientStatus }) {
  const pathname = usePathname()
  const router = useRouter()
  const [selectedStatus, setSelectedStatus] = useState<ClientStatus>(status)

  useEffect(() => setSelectedStatus(status), [status])

  function applyFilter(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextUrl = selectedStatus
      ? `${pathname}?status=${encodeURIComponent(selectedStatus)}`
      : pathname
    router.push(nextUrl, { scroll: false })
  }

  return (
    <form onSubmit={applyFilter} className="flex w-full min-w-0 items-center gap-2 sm:w-auto">
      <SearchableSelect
        value={selectedStatus}
        onChange={event => setSelectedStatus(event.target.value as ClientStatus)}
        className="form-field h-9 w-auto min-w-0 flex-1 py-1.5 sm:w-56 sm:flex-none"
        aria-label="Client status"
      >
        <option value="">All statuses</option>
        <option value="active">Active</option>
        <option value="pending">Pending</option>
        <option value="suspended">Suspended</option>
        <option value="rejected">Rejected</option>
      </SearchableSelect>
      <Button type="submit" variant="secondary" className="h-9 shrink-0 bg-slate-100 px-3 text-slate-700 ring-0 shadow-none hover:bg-slate-200">
        Filter
      </Button>
    </form>
  )
}

export function ClientSearchResults() {
  const { clients, imageUrlByPath, names, avatarUrls, openCount, error, searching, hasMoreClients, loadingMoreClients, loadMoreClients } = useClientSearch()
  return (
    <>
      {error && <Alert>{error}</Alert>}
      {searching && <span className="sr-only" role="status">Searching clients</span>}
      {clients.length === 0 ? (
        <EmptyState icon={<Building2 className="h-6 w-6" />} title="No clients found" />
      ) : (
        <ul className="divide-y divide-slate-100">
          {clients.map(client => {
            const team = Array.from(new Set(client.client_team.map(member => member.profile_id)))
            return (
              <li key={client.id}>
                <Link href={`/clients/${client.id}`} className="flex flex-col gap-3 px-5 py-4 hover:bg-slate-50/80 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <CompanyAvatar
                      name={client.company_name}
                      src={client.company_profile_image_path ? imageUrlByPath[client.company_profile_image_path] : null}
                      size="sm"
                    />
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-900">{client.company_name}</p>
                      <p className="truncate text-xs text-slate-500">
                        {STAGE_LABELS[client.stage]}{client.contact_name ? ` · ${client.contact_name}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 sm:w-60 sm:justify-end">
                    <div className="flex -space-x-2">
                      {team.slice(0, 4).map(id => <Avatar key={id} name={names[id]} src={avatarUrls[id]} size="sm" className="ring-2 ring-white" />)}
                    </div>
                    <span className="text-xs text-slate-500">{openCount[client.id] ?? 0} open</span>
                    <AccountStatusBadge status={client.status} />
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
      {hasMoreClients && (
        <div className="flex justify-center border-t border-slate-100 p-4">
          <Button variant="secondary" loading={loadingMoreClients} onClick={loadMoreClients}>
            Load more clients
          </Button>
        </div>
      )}
    </>
  )
}

function useClientSearch() {
  const value = useContext(ClientSearchContext)
  if (!value) throw new Error('Client search components must be rendered inside ClientSearchProvider')
  return value
}
