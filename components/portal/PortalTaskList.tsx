'use client'

import { useMemo, useState } from 'react'
import { TaskBoard } from '@/components/tasks/TaskBoard'
import { TaskTable } from '@/components/tasks/TaskTable'
import { TaskFilterToolbar } from '@/components/tasks/TaskFilterToolbar'
import { Card } from '@/components/ui/primitives'
import { parseTaskCode } from '@/lib/utils'
import type { AssigneeOption, TaskAssignerInfo } from '@/lib/queries'
import type { TaskSummary } from '@/types/database'

type StaffOption = AssigneeOption & { role?: string }
type FilterOption = { value: string; label: string }

export function PortalTaskList({
  tasks, names, meId, people, taskAssigners,
}: {
  tasks: TaskSummary[]
  names: Record<string, string>
  meId: string
  people: StaffOption[]
  taskAssigners: Record<string, TaskAssignerInfo>
}) {
  const [scope, setScope] = useState<'mine' | 'all'>('mine')
  const [view, setView] = useState<'board' | 'list'>('board')
  const [status, setStatus] = useState('all')
  const [assignee, setAssignee] = useState('')
  const [assignedBy, setAssignedBy] = useState('')
  const [department, setDepartment] = useState('')
  const [due, setDue] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')

  const myTasks = useMemo(() => tasks.filter(task => task.assignee_id === meId), [meId, tasks])
  const departments = useMemo<FilterOption[]>(() => Array.from(new Set(
    tasks.flatMap(task => task.department?.name ? [task.department.name] : []),
  )).sort((a, b) => a.localeCompare(b)).map(name => ({ value: name, label: name })), [tasks])
  const visibleTasks = useMemo(() => {
    const availableTasks = scope === 'mine' ? myTasks : tasks
    const taskNumber = parseTaskCode(search)
    const query = search.trim().toLowerCase()

    return availableTasks.filter(task => {
      if (view === 'list' && status === 'active' && ['completed', 'cancelled'].includes(task.status)) return false
      if (view === 'list' && status !== 'all' && status !== 'active' && task.status !== status) return false
      if (assignee && task.assignee_id !== assignee) return false
      if (assignedBy && task.assigned_by !== assignedBy) return false
      if (department && task.department?.name !== department) return false
      if (due && task.due_date !== due) return false
      if (taskNumber !== null && task.task_number !== taskNumber) return false
      if (query && taskNumber === null && !task.title.toLowerCase().includes(query)) return false
      return true
    })
  }, [assignee, assignedBy, department, due, myTasks, search, scope, status, tasks, view])

  const filtered = Boolean(searchInput.trim() || status !== 'all' || assignee || assignedBy || department || due)
  function clearFilters() {
    setStatus('all')
    setAssignee('')
    setAssignedBy('')
    setDepartment('')
    setDue('')
    setSearchInput('')
    setSearch('')
  }

  return (
    <>
      <TaskFilterToolbar
        scope={scope}
        onScopeChange={value => {
          setScope(value)
          if (value === 'mine') setAssignee('')
        }}
        scopeCounts={{ mine: myTasks.length, all: tasks.length }}
        view={view}
        onViewChange={setView}
        status={status}
        onStatusChange={setStatus}
        people={people.map(person => ({
          value: person.id,
          label: person.name,
          avatarUrl: person.avatarUrl,
          role: person.avatarRole,
        }))}
        assignee={assignee}
        onAssigneeChange={setAssignee}
        showAssigneeFilter
        assigners={people.map(person => ({
          value: person.id,
          label: person.name,
          avatarUrl: person.avatarUrl,
          role: person.avatarRole,
        }))}
        assignedBy={assignedBy}
        onAssignedByChange={setAssignedBy}
        showAssignedByFilter
        departments={departments}
        department={department}
        onDepartmentChange={setDepartment}
        due={due}
        onDueChange={setDue}
        searchInput={searchInput}
        onSearchInput={setSearchInput}
        onSearch={setSearch}
        filtered={filtered}
        onClearFilters={clearFilters}
      />

      {view === 'board' ? (
        <TaskBoard
          tasks={visibleTasks}
          names={names}
          assignOptions={people}
          hrefBase="/portal/tasks"
          editableAssigneeId={scope === 'mine' ? meId : undefined}
          editableStatuses={['todo', 'in_progress', 'in_system_process', 'ready_for_review']}
        />
      ) : (
        <Card className="overflow-hidden">
          <TaskTable
            tasks={visibleTasks}
            names={names}
            hrefBase="/portal/tasks"
            showClient={false}
            showAssignee
            showAssignedBy
            taskAssigners={taskAssigners}
            empty={{
              title: scope === 'mine' ? 'No tasks assigned to you yet' : 'No tasks linked to your tickets yet',
              description: search || filtered
                ? 'Try changing or clearing the filters.'
                : scope === 'mine'
                  ? 'Tasks assigned to your client account will appear here.'
                  : 'Tasks created for your tickets will appear here.',
            }}
          />
        </Card>
      )}
    </>
  )
}
