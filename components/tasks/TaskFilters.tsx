'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { TaskFilterToolbar } from '@/components/tasks/TaskFilterToolbar'
import { useTaskSearch } from '@/components/tasks/TaskSearch'
import { getClientProfileImageUrls } from '@/lib/client-profile-image-cache'
import type { AppRole } from '@/types/database'

type Option = { value: string; label: string; avatarUrl?: string | null; imagePath?: string | null; role?: AppRole }

export function TaskFilters({
  clients, people, departments, showScope, showAssigneeFilter, defaultScope = 'mine', assigners, action,
}: {
  clients: Option[]
  people: Option[]
  departments: Option[]
  showScope: boolean
  showAssigneeFilter: boolean
  defaultScope?: 'mine' | 'all'
  assigners: Option[]
  action?: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const taskSearch = useTaskSearch()
  const { changeScope, scope: activeScope } = taskSearch
  const [searchInput, setSearchInput] = useState('')
  const [clientOptions, setClientOptions] = useState(clients)

  useEffect(() => {
    let active = true
    setClientOptions(clients.map(client => ({ ...client, avatarUrl: null })))
    const imagePaths = Array.from(new Set(clients.flatMap(client => client.imagePath ? [client.imagePath] : [])))
    if (!imagePaths.length) return () => { active = false }

    // Sign client avatars after the task page has rendered, not on its RSC path.
    void getClientProfileImageUrls(imagePaths)
      .then(signedUrlByPath => {
        if (!active) return
        setClientOptions(clients.map(client => ({
          ...client,
          avatarUrl: client.imagePath ? signedUrlByPath[client.imagePath] ?? null : null,
        })))
      })
      .catch(() => {})

    return () => { active = false }
  }, [clients])

  useEffect(() => {
    if (!params.has('q')) return
    const next = new URLSearchParams(params.toString())
    next.delete('q')
    const query = next.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }, [params, pathname, router])

  function set(key: string, value: string) {
    const next = new URLSearchParams(params.toString())
    next.delete('q')
    if (value) next.set(key, value)
    else next.delete(key)
    // Filter changes are replacements, not navigations. This avoids growing
    // browser history and lets Next keep the current shell while the filtered
    // RSC payload is fetched.
    router.replace(`${pathname}?${next.toString()}`, { scroll: false })
  }

  const view = params.get('view') === 'list' ? 'list' : 'board'
  const status = params.get('status') ?? 'all'
  const client = params.get('client') ?? ''
  const assignee = params.get('assignee') ?? ''
  const assignedBy = params.get('assigned_by') ?? ''
  const department = params.get('dept') ?? ''
  const due = params.get('due') ?? ''
  const dateBy = params.get('date_by') === 'assigned' ? 'assigned' : params.get('date_by') === 'completed' ? 'completed' : 'due'
  const scopeParam = params.get('scope')
  const urlScope = scopeParam === 'assigned' ? 'assigned' : scopeParam === 'all' ? 'all' : 'mine'
  const filtered = Boolean(searchInput || taskSearch.query)
    || Boolean(due)
    || ['status', 'client', 'assignee', 'assigned_by', 'dept'].some(key => params.get(key))

  useEffect(() => {
    if (urlScope === activeScope) return
    changeScope(urlScope, {
      status,
      client,
      assignee,
      assignedBy,
      department,
      due,
      dateBy,
      board: view === 'board',
    })
  }, [activeScope, assignee, assignedBy, changeScope, client, dateBy, department, due, status, urlScope, view])

  function setScope(value: 'mine' | 'assigned' | 'all') {
    if (value === activeScope) return
    const next = new URLSearchParams(params.toString())
    next.delete('q')
    if (value !== 'all') next.delete('assignee')
    if (value !== 'all') next.delete('assigned_by')
    if (value === defaultScope) next.delete('scope')
    else next.set('scope', value)
    const search = next.toString()
    window.history.pushState(null, '', search ? `${pathname}?${search}` : pathname)
    changeScope(value, {
      status,
      client,
      assignee: value === 'all' ? assignee : '',
      assignedBy: value === 'all' ? assignedBy : '',
      department,
      due,
      dateBy,
      board: view === 'board',
    })
  }

  function clearFilters() {
    const next = new URLSearchParams()
    if (params.get('scope')) next.set('scope', params.get('scope')!)
    if (params.get('view')) next.set('view', params.get('view')!)
    taskSearch.setQuery('')
    setSearchInput('')
    router.replace(`${pathname}?${next.toString()}`, { scroll: false })
  }

  return (
    <TaskFilterToolbar
      scope={activeScope}
      onScopeChange={setScope}
      scopeCounts={taskSearch.scopeCounts}
      scopeLoading={taskSearch.scopeChanging}
      showScope={showScope}
      showAssignedScope
      view={view}
      onViewChange={value => set('view', value === 'board' ? '' : value)}
      status={status}
      onStatusChange={value => set('status', value === 'all' ? '' : value)}
      clients={clientOptions.map(({ imagePath: _imagePath, ...client }) => client)}
      client={client}
      onClientChange={value => set('client', value)}
      showClientFilter
      people={people}
      assignee={assignee}
      onAssigneeChange={value => set('assignee', value)}
      showAssigneeFilter={showAssigneeFilter}
      assigners={assigners}
      assignedBy={assignedBy}
      onAssignedByChange={value => set('assigned_by', value)}
      showAssignedByFilter
      departments={departments}
      department={department}
      onDepartmentChange={value => set('dept', value)}
      due={due}
      dateBy={dateBy}
      onDateByChange={value => set('date_by', value === 'due' ? '' : value)}
      onDateFilterApply={(nextDateBy, nextDue) => {
        const next = new URLSearchParams(params.toString())
        next.delete('q')
        next.set('due', nextDue)
        if (nextDateBy !== 'due') next.set('date_by', nextDateBy)
        else next.delete('date_by')
        router.replace(`${pathname}?${next.toString()}`, { scroll: false })
      }}
      onDateFilterClear={() => {
        const next = new URLSearchParams(params.toString())
        next.delete('q')
        next.delete('due')
        next.delete('date_by')
        router.replace(`${pathname}?${next.toString()}`, { scroll: false })
      }}
      onDueChange={value => {
        const next = new URLSearchParams(params.toString())
        next.delete('q')
        if (value) next.set('due', value)
        else {
          next.delete('due')
          next.delete('date_by')
        }
        router.replace(`${pathname}?${next.toString()}`, { scroll: false })
      }}
      searchInput={searchInput}
      onSearchInput={setSearchInput}
      onSearch={taskSearch.setQuery}
      filtered={!!filtered}
      onClearFilters={clearFilters}
      action={action}
    />
  )
}
