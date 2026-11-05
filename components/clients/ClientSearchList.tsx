'use client'

import Link from 'next/link'
import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { Building2 } from 'lucide-react'
import { searchClients } from '@/app/actions/search'
import { DebouncedSearchInput } from '@/components/shared/DebouncedSearchInput'
import { AccountStatusBadge } from '@/components/ui/badges'
import { Alert, Avatar, CompanyAvatar, EmptyState } from '@/components/ui/primitives'
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
  setQuery: (query: string) => void
}

const ClientSearchContext = createContext<ClientSearchContextValue | null>(null)

export function ClientSearchProvider({
  initialClients,
  initialImageUrlByPath,
  names,
  avatarUrls,
  status,
  openCount,
  children,
}: {
  initialClients: ClientRow[]
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

  const setSearch = useCallback((value: string) => setQuery(value), [])

  useEffect(() => {
    let active = true
    if (!query) {
      setClients(initialClients)
      setImageUrlByPath(initialImageUrlByPath)
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
      })
      .catch(searchError => {
        if (active) setError(errorMessage(searchError))
      })
      .finally(() => {
        if (active) setSearching(false)
      })

    return () => { active = false }
  }, [initialClients, initialImageUrlByPath, query, status])

  return (
    <ClientSearchContext.Provider value={{ clients, imageUrlByPath, names, avatarUrls, openCount, error, searching, setQuery: setSearch }}>
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

export function ClientSearchResults() {
  const { clients, imageUrlByPath, names, avatarUrls, openCount, error, searching } = useClientSearch()
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
    </>
  )
}

function useClientSearch() {
  const value = useContext(ClientSearchContext)
  if (!value) throw new Error('Client search components must be rendered inside ClientSearchProvider')
  return value
}
