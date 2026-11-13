'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { searchTasks } from '@/app/actions/search'
import { DebouncedSearchInput } from '@/components/shared/DebouncedSearchInput'
import { TaskBoard } from '@/components/tasks/TaskBoard'
import { TaskTable } from '@/components/tasks/TaskTable'
import { ButtonLink } from '@/components/ui/button'
import { Alert, Card } from '@/components/ui/primitives'
import type { AssigneeOption, TaskAssignerInfo } from '@/lib/queries'
import type { TaskSummary } from '@/types/database'
import { errorMessage } from '@/lib/utils'

type TaskSearchContextValue = {
  tasks: TaskSummary[]
  names: Record<string, string>
  taskAssigners: Record<string, TaskAssignerInfo>
  assignOptions?: AssigneeOption[]
  editableAssigneeId?: string
  query: string
  scope: 'mine' | 'assigned' | 'all'
  status: string
  board: boolean
  searching: boolean
  error: string
  setQuery: (query: string) => void
}

const TaskSearchContext = createContext<TaskSearchContextValue | null>(null)

export function TaskSearchProvider({
  initialTasks,
  initialNames,
  initialTaskAssigners,
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
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    if (!query) {
      setTasks(initialTasks)
      setNames(initialNames)
      setTaskAssigners(initialTaskAssigners)
      setSearching(false)
      setError('')
      return () => { active = false }
    }

    setSearching(true)
    setError('')
    void searchTasks(query, { scope, status, client, assignee, assignedBy, department, due, board })
      .then(result => {
        if (!active) return
        setTasks(result.tasks)
        setNames({ ...initialNames, ...result.names })
        setTaskAssigners({ ...initialTaskAssigners, ...result.taskAssigners })
      })
      .catch(searchError => {
        if (active) setError(errorMessage(searchError))
      })
      .finally(() => {
        if (active) setSearching(false)
      })

    return () => { active = false }
  }, [assignee, assignedBy, board, client, department, due, initialNames, initialTaskAssigners, initialTasks, query, scope, status])

  const handleSearch = useCallback((value: string) => setQuery(value), [])
  const value: TaskSearchContextValue = {
    tasks, names, taskAssigners, assignOptions, editableAssigneeId, query, scope, status, board, searching, error, setQuery: handleSearch,
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
      {search.board ? (
        <TaskBoard
          tasks={search.tasks}
          names={search.names}
          assignOptions={search.assignOptions}
          scope={search.scope}
          editableAssigneeId={search.editableAssigneeId}
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
    </div>
  )
}

export function useTaskSearch() {
  const value = useContext(TaskSearchContext)
  if (!value) throw new Error('Task search components must be rendered inside TaskSearchProvider')
  return value
}
