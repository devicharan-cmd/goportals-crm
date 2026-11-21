'use client'

import Link from 'next/link'
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Building2, Mail, MapPin, Phone } from 'lucide-react'
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
type ClientOpenWorkCount = { tasks: number; tickets: number }
type ClientSearchContextValue = {
  clients: ClientRow[]
  imageUrlByPath: Record<string, string>
  names: Record<string, string>
  avatarUrls: Record<string, string | null>
  openWorkCounts: Record<string, ClientOpenWorkCount>
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
  openWorkCounts,
  children,
}: {
  initialClients: ClientRow[]
  initialHasMoreClients: boolean
  initialClientOffset: number
  initialImageUrlByPath: Record<string, string>
  names: Record<string, string>
  avatarUrls: Record<string, string | null>
  status: ClientStatus
  openWorkCounts: Record<string, ClientOpenWorkCount>
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
      clients, imageUrlByPath, names, avatarUrls, openWorkCounts, error, searching,
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
  const { clients, imageUrlByPath, names, avatarUrls, openWorkCounts, error, searching, hasMoreClients, loadingMoreClients, loadMoreClients } = useClientSearch()
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
            const work = openWorkCounts[client.id] ?? { tasks: 0, tickets: 0 }
            const totalOpenWork = work.tasks + work.tickets
            const locationParts = [client.address_line, client.city, client.state, client.postal_code, client.country]
              .filter((part): part is string => !!part?.trim())
              .filter((part, index, parts) => !parts.slice(0, index).some(previous => previous.toLowerCase().includes(part.toLowerCase())))
            const location = locationParts.join(', ')
            return (
              <li key={client.id}>
                <Link href={`/clients/${client.id}`} className="group flex flex-col gap-4 p-4 transition-colors hover:bg-slate-50/80 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <CompanyAvatar
                      name={client.company_name}
                      src={client.company_profile_image_path ? imageUrlByPath[client.company_profile_image_path] : null}
                      size="md"
                      className="h-12 w-12 text-base"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="min-w-0 break-words font-semibold text-slate-900 group-hover:text-[#034C68]">{client.company_name}</p>
                        <AccountStatusBadge status={client.status} />
                        <span className="rounded-full bg-[#EAF4F8] px-2 py-0.5 text-xs font-medium text-[#034C68] ring-1 ring-inset ring-[#9FCCDE]">
                          {STAGE_LABELS[client.stage]}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-500">
                        {client.contact_name && <span className="font-medium text-slate-700">{client.contact_name}</span>}
                        {client.contact_email && <span className="inline-flex min-w-0 items-center gap-1.5"><Mail className="h-3.5 w-3.5 shrink-0" /><span className="break-all">{client.contact_email}</span></span>}
                        {client.contact_phone && <span className="inline-flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 shrink-0" />{client.contact_phone}</span>}
                        {location && <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 shrink-0" />{location}</span>}
                        {client.gstin && <span>GSTIN {client.gstin}</span>}
                        {!client.contact_name && !client.contact_email && !client.contact_phone && !location && (
                          <span className="italic text-slate-400">No contact details provided</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:w-[440px] lg:flex-none 2xl:w-[520px]">
                    <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-slate-500">Open work</span>
                        <span className="text-sm font-semibold text-slate-900">{totalOpenWork} items</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {work.tasks} {work.tasks === 1 ? 'task' : 'tasks'} <span aria-hidden="true">·</span> {work.tickets} {work.tickets === 1 ? 'ticket' : 'tickets'}
                      </p>
                    </div>
                    <div className="min-w-0 rounded-xl border border-slate-100 bg-white px-3 py-2.5">
                      <p className="text-xs font-medium text-slate-500">Client team</p>
                      {team.length > 0 ? (
                        <ul className="mt-1.5 flex flex-wrap gap-1.5">
                          {team.map(id => (
                            <li key={id} className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-slate-50 py-0.5 pl-0.5 pr-2 text-xs text-slate-700 ring-1 ring-inset ring-slate-200">
                              <Avatar name={names[id] ?? 'Unknown teammate'} src={avatarUrls[id]} size="xs" />
                              <span className="break-words">{names[id] ?? 'Unknown teammate'}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-1.5 text-xs text-slate-400">No team assigned</p>
                      )}
                    </div>
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
