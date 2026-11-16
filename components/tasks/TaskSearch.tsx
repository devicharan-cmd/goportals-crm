'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { searchTasks } from '@/app/actions/search'
import { DebouncedSearchInput } from '@/components/shared/DebouncedSearchInput'
import { TaskBoard } from '@/components/tasks/TaskBoard'
import { TaskTable } from '@/components/tasks/TaskTable'
import { Button, ButtonLink } from '@/components/ui/button'
import { Alert, Card } from '@/components/ui/primitives'
import type { AssigneeOption, TaskAssignerInfo, TaskPageCursor } from '@/lib/queries'
import type { TaskSummary } from '@/types/database'
import { errorMessage } from '@/lib/utils'

type TaskSearchContextValue = {
  tasks: TaskSummary[]
  names: Record<string, string>
  taskAssigners: Record<string, TaskAssignerInfo>
  scopeCounts: { mine: number; assigned: number; all: number }
  assignOptions?: AssigneeOption[]
  editableAssigneeId?: string
  query: string
  scope: 'mine' | 'assigned' | 'all'
  scopeChanging: boolean
  status: string
  board: boolean
  searching: boolean
  error: string
  setQuery: (query: string) => void
  changeScope: (
    scope: 'mine' | 'assigned' | 'all',
    filters: Omit<TaskSearchFilters, 'scope'>,
  ) => void
  adjustMyTaskCount: (delta: number) => void
  loadMoreTasks: () => void
  hasMoreTasks: boolean
  loadingMoreTasks: boolean
}

type TaskSearchFilters = {
  status: string
  client: string
  assignee: string
  assignedBy: string
  department: string
  due: string
  board: boolean
}

const TaskSearchContext = createContext<TaskSearchContextValue | null>(null)

export function TaskSearchProvider({
  initialTasks,
  initialNames,
  initialTaskAssigners,
  initialHasMoreTasks,
  initialTaskCursor,
  initialScopeCounts,
  assignOptions,
  editableAssigneeId,
  scope,
  status,
  client,
  assignee,
  assignedBy,
  department,
  due,
  board,
  children,
}: {
  initialTasks: TaskSummary[]
  initialNames: Record<string, string>
  initialTaskAssigners: Record<string, TaskAssignerInfo>
  initialHasMoreTasks: boolean
  initialTaskCursor: TaskPageCursor | null
  initialScopeCounts: { mine: number; assigned: number; all: number }
  assignOptions?: AssigneeOption[]
  editableAssigneeId?: string
  scope: 'mine' | 'assigned' | 'all'
  status: string
  client: string
  assignee: string
  assignedBy: string
  department: string
  due: string
  board: boolean
  children: React.ReactNode
}) {
  const [query, setQuery] = useState('')
  const [tasks, setTasks] = useState(initialTasks)
  const [names, setNames] = useState(initialNames)
  const [taskAssigners, setTaskAssigners] = useState(initialTaskAssigners)
  const [activeScope, setActiveScope] = useState(scope)
  const [scopeFilterOverrides, setScopeFilterOverrides] = useState<Omit<TaskSearchFilters, 'scope'> | null>(null)
  const [hasMoreTasks, setHasMoreTasks] = useState(initialHasMoreTasks)
  const [nextTaskCursor, setNextTaskCursor] = useState(initialTaskCursor)
  const [loadingMoreTasks, setLoadingMoreTasks] = useState(false)
  const [serverScopeCounts, setServerScopeCounts] = useState(initialScopeCounts)
  const [pendingMyTaskCountDelta, setPendingMyTaskCountDelta] = useState(0)
  const [searching, setSearching] = useState(false)
  const [scopeChanging, setScopeChanging] = useState(false)
  const [error, setError] = useState('')
  const taskRequestId = useRef(0)
  const previousServerMineCount = useRef(initialScopeCounts.mine)
  const { all: initialAllCount, assigned: initialAssignedCount, mine: initialMineCount } = initialScopeCounts

  useEffect(() => {
    const previousMineCount = previousServerMineCount.current
    previousServerMineCount.current = initialMineCount
    setServerScopeCounts({ all: initialAllCount, assigned: initialAssignedCount, mine: initialMineCount })
    if (pendingMyTaskCountDelta !== 0 && initialMineCount === previousMineCount + pendingMyTaskCountDelta) {
      setPendingMyTaskCountDelta(0)
    }
  }, [initialAllCount, initialAssignedCount, initialMineCount, pendingMyTaskCountDelta])

  useEffect(() => {
    if (scope === activeScope && scopeFilterOverrides) setScopeFilterOverrides(null)
  }, [activeScope, scope, scopeFilterOverrides])

  useEffect(() => {
    const requestId = ++taskRequestId.current
    let active = true
    setLoadingMoreTasks(false)
    if (!query && activeScope === scope && !scopeFilterOverrides) {
      setTasks(initialTasks)
      setNames(initialNames)
      setTaskAssigners(initialTaskAssigners)
      setHasMoreTasks(initialHasMoreTasks)
      setNextTaskCursor(initialTaskCursor)
      setSearching(false)
      setScopeChanging(false)
      setError('')
      return () => {
        active = false
        if (taskRequestId.current === requestId) taskRequestId.current += 1
      }
    }

    setSearching(true)
    setScopeChanging(activeScope !== scope || scopeFilterOverrides !== null)
    setTasks([])
    setHasMoreTasks(false)
    setNextTaskCursor(null)
    setError('')
    const filters = scopeFilterOverrides ?? { status, client, assignee, assignedBy, department, due, board }
    void searchTasks(query, { ...filters, scope: activeScope })
      .then(result => {
        if (!active) return
        setTasks(result.tasks)
        setNames({ ...initialNames, ...result.names })
        setTaskAssigners({ ...initialTaskAssigners, ...result.taskAssigners })
        setHasMoreTasks(result.hasMore)
        setNextTaskCursor(result.nextCursor)
      })
      .catch(searchError => {
        if (active) setError(errorMessage(searchError))
      })
      .finally(() => {
        if (active) {
          setSearching(false)
          setScopeChanging(false)
        }
      })

    return () => {
      active = false
      if (taskRequestId.current === requestId) taskRequestId.current += 1
    }
  }, [activeScope, assignee, assignedBy, board, client, department, due, initialHasMoreTasks, initialNames, initialTaskAssigners, initialTaskCursor, initialTasks, query, scope, scopeFilterOverrides, status])

  const handleSearch = useCallback((value: string) => setQuery(value), [])
  const changeScope = useCallback((
    nextScope: 'mine' | 'assigned' | 'all',
    filters: Omit<TaskSearchFilters, 'scope'>,
  ) => {
    if (nextScope === activeScope) return
    setActiveScope(nextScope)
    setScopeFilterOverrides(nextScope === scope ? null : filters)
    setScopeChanging(true)
    setTasks([])
    setHasMoreTasks(false)
    setNextTaskCursor(null)
    setError('')
  }, [activeScope, scope])
  const adjustMyTaskCount = useCallback((delta: number) => {
    if (delta === 0) return
    setPendingMyTaskCountDelta(current => current + delta)
  }, [])
  const loadMoreTasks = useCallback(() => {
    if (loadingMoreTasks || searching || !hasMoreTasks || !nextTaskCursor) return
    const requestId = taskRequestId.current
    setLoadingMoreTasks(true)
    setError('')
    const filters = scopeFilterOverrides ?? { status, client, assignee, assignedBy, department, due, board }
    void searchTasks(query, { ...filters, scope: activeScope }, nextTaskCursor)
      .then(result => {
        if (taskRequestId.current !== requestId) return
        setTasks(current => {
          const existingIds = new Set(current.map(task => task.id))
          return [...current, ...result.tasks.filter(task => !existingIds.has(task.id))]
        })
        setNames(current => ({ ...current, ...result.names }))
        setTaskAssigners(current => ({ ...current, ...result.taskAssigners }))
        setHasMoreTasks(result.hasMore)
        setNextTaskCursor(result.nextCursor)
      })
      .catch(loadError => {
        if (taskRequestId.current === requestId) setError(errorMessage(loadError))
      })
      .finally(() => {
        if (taskRequestId.current === requestId) setLoadingMoreTasks(false)
      })
  }, [activeScope, assignee, assignedBy, board, client, department, due, hasMoreTasks, loadingMoreTasks, nextTaskCursor, query, scopeFilterOverrides, searching, status])
  const scopeCounts = {
    ...serverScopeCounts,
    mine: Math.max(0, serverScopeCounts.mine + pendingMyTaskCountDelta),
  }
  const value: TaskSearchContextValue = {
    tasks, names, taskAssigners, scopeCounts, assignOptions, editableAssigneeId, query, scope: activeScope, scopeChanging,
    status, board, searching, error, setQuery: handleSearch, changeScope, adjustMyTaskCount, loadMoreTasks,
    hasMoreTasks, loadingMoreTasks,
  }

  return <TaskSearchContext.Provider value={value}>{children}</TaskSearchContext.Provider>
}

export function TaskSearchField({
  value,
  onValueChange,
}: {
  value: string
  onValueChange: (value: string) => void
}) {
  const search = useTaskSearch()
  return (
    <DebouncedSearchInput
      placeholder="Search title or GP-1024…"
      className="w-full"
      ariaLabel="Search tasks"
      value={value}
      onValueChange={onValueChange}
      onSearch={search.setQuery}
    />
  )
}

export function TaskSearchResults() {
  const search = useTaskSearch()
  return (
    <div className="space-y-2">
      {search.error && <Alert>{search.error}</Alert>}
      {search.searching && <span className="sr-only" role="status">Searching tasks</span>}
      {search.scopeChanging ? (
        <div className="flex min-h-32 items-center justify-center rounded-xl border border-slate-200 bg-white text-sm text-slate-500" role="status">
          Loading {search.scope === 'mine' ? 'your' : search.scope === 'assigned' ? 'assigned' : 'all'} tasks…
        </div>
      ) : search.board ? (
        <TaskBoard
          tasks={search.tasks}
          names={search.names}
          assignOptions={search.assignOptions}
          scope={search.scope}
          editableAssigneeId={search.editableAssigneeId}
          onMyTasksCountChange={search.adjustMyTaskCount}
        />
      ) : (
        <Card className="overflow-hidden">
          <TaskTable
            tasks={search.tasks}
            names={search.names}
            taskAssigners={search.taskAssigners}
            showAssignedBy
            assignOptions={search.assignOptions}
            scope={search.scope}
            empty={{
              title: search.query ? 'No tasks match this search'
                : search.scope === 'mine' ? 'Nothing assigned to you'
                  : search.scope === 'assigned' ? 'No tasks assigned by you'
                    : search.status === 'active' ? 'No open tasks' : 'No tasks match these filters',
              description: search.query ? 'Try another search.' : search.scope === 'mine' ? 'Check the urgent pool or create a task.'
                : search.scope === 'assigned' ? 'Tasks you assigned to people in your allowed scope will appear here.'
                  : search.status === 'active' ? 'Finished tasks are hidden. Choose “Status: all” to see them.'
                    : 'Try clearing the filters.',
              action: search.scope === 'mine' && !search.query ? <ButtonLink href="/urgent" variant="secondary">Open urgent pool</ButtonLink> : undefined,
            }}
          />
        </Card>
      )}
      {search.hasMoreTasks && (
        <div className="flex justify-center pt-4">
          <Button variant="secondary" loading={search.loadingMoreTasks} onClick={search.loadMoreTasks}>
            Load more tasks
          </Button>
        </div>
      )}
    </div>
  )
}

export function useTaskSearch() {
  const value = useContext(TaskSearchContext)
  if (!value) throw new Error('Task search components must be rendered inside TaskSearchProvider')
  return value
}
