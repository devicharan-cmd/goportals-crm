'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { TaskFilterToolbar } from '@/components/tasks/TaskFilterToolbar'
import { useTaskSearch } from '@/components/tasks/TaskSearch'
import type { AppRole } from '@/types/database'

type Option = { value: string; label: string; avatarUrl?: string | null; role?: AppRole }

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
    router.push(`${pathname}?${next.toString()}`)
  }

  const view = params.get('view') === 'list' ? 'list' : 'board'
  const status = params.get('status') ?? 'all'
  const client = params.get('client') ?? ''
  const assignee = params.get('assignee') ?? ''
  const assignedBy = params.get('assigned_by') ?? ''
  const department = params.get('dept') ?? ''
  const due = params.get('due') ?? ''
  const scopeParam = params.get('scope')
  const urlScope = scopeParam === 'assigned' ? 'assigned' : scopeParam === 'all' ? 'all' : 'mine'
  const filtered = Boolean(searchInput || taskSearch.query)
    || ['status', 'client', 'assignee', 'assigned_by', 'dept', 'due'].some(key => params.get(key))

  useEffect(() => {
    if (urlScope === activeScope) return
    changeScope(urlScope, {
      status,
      client,
      assignee,
      assignedBy,
      department,
      due,
      board: view === 'board',
    })
  }, [activeScope, assignee, assignedBy, changeScope, client, department, due, status, urlScope, view])

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
      board: view === 'board',
    })
  }

  function clearFilters() {
    const next = new URLSearchParams()
    if (params.get('scope')) next.set('scope', params.get('scope')!)
    if (params.get('view')) next.set('view', params.get('view')!)
    taskSearch.setQuery('')
    setSearchInput('')
    router.push(`${pathname}?${next.toString()}`)
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
      clients={clients}
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
      onDueChange={value => set('due', value)}
      searchInput={searchInput}
      onSearchInput={setSearchInput}
      onSearch={taskSearch.setQuery}
      filtered={!!filtered}
      onClearFilters={clearFilters}
      action={action}
    />
  )
}
