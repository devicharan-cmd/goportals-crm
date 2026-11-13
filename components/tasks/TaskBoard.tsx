'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, X } from 'lucide-react'
import {
  DndContext, DragOverlay, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'
import { createClient } from '@/lib/supabase/client'
import { Avatar } from '@/components/ui/primitives'
import { MarketplacePlatformLabel } from '@/components/shared/Marketplace'
import type { AssigneeOption } from '@/lib/queries'
import { DueDate } from '@/components/ui/badges'
import { PRIORITY_STYLES, TASK_STATUS_DOT, TASK_STATUS_OPTIONS, TASK_TERMINAL_STATUSES } from '@/lib/constants'
import { cn, errorMessage, taskCode } from '@/lib/utils'
import type { TaskSummary, TaskStatus } from '@/types/database'
import { useSingleFlight } from '@/components/shared/useSingleFlight'

type CardProps = {
  task: TaskSummary
  names: Record<string, string>
  assignOptions?: AssigneeOption[]
  hrefBase: string
  scope?: 'mine' | 'assigned' | 'all'
}

function Card({ task, names, overlay, linked, assignOptions, hrefBase, scope }: CardProps & { overlay?: boolean; linked?: boolean }) {
  const assignee = task.assignee_id ? assignOptions?.find(option => option.id === task.assignee_id) : undefined
  const assigneeName = task.assignee_id ? names[task.assignee_id] ?? '—' : '—'
  const roleSuffix = assignee?.role ? ` (${assignee.role})` : ''
  const cardAssigneeName = roleSuffix && assigneeName.endsWith(roleSuffix)
    ? assigneeName.slice(0, -roleSuffix.length)
    : assigneeName
  const taskHref = `${hrefBase}/${task.id}${scope ? `?scope=${scope}` : ''}`
  const body = (
    <>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap">
          <span className="whitespace-nowrap font-mono text-[11px] font-semibold text-[#045E80]">{taskCode(task.task_number)}</span>
          <span className={cn('inline-flex shrink-0 items-center rounded-md px-1.5 py-0 text-[10px] font-bold leading-4 ring-1 ring-inset', PRIORITY_STYLES[task.priority])}>
            {task.priority}
          </span>
        </span>
        {task.platform?.name && (
          <span className="min-w-0 flex-1 overflow-hidden text-right text-[11px] text-slate-400">
            <MarketplacePlatformLabel name={task.platform.name} />
          </span>
        )}
      </div>
      <p className="text-sm font-medium leading-snug text-slate-900">{task.title}</p>
      <p className="mt-1 truncate text-xs text-slate-500">{task.client?.company_name}</p>
      <DueDate date={task.due_date} status={task.status} className="mt-2 block" />
    </>
  )
  return (
    <div className={cn('overflow-hidden rounded-lg border bg-white text-left transition-[border-color,box-shadow,transform] duration-200 ease-out',
      overlay ? 'rotate-1 border-[#2A87AA] [box-shadow:0_10px_30px_-10px_rgb(2_43_59_/_0.25)]' : 'border-slate-200 [box-shadow:0_1px_2px_0_rgb(2_43_59_/_0.04),0_1px_3px_0_rgb(2_43_59_/_0.06)] hover:-translate-y-0.5 hover:border-slate-400 hover:shadow-[0_6px_14px_rgba(15,23,42,0.12)]',
      task.is_urgent && !TASK_TERMINAL_STATUSES.includes(task.status) && 'border-l-4 border-l-red-500')}>
      {linked
        ? <Link href={taskHref} draggable={false} className="block p-3 pb-2 hover:bg-slate-50/60">{body}</Link>
        : <div className="p-3 pb-2">{body}</div>}
      <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-3 py-2">
        {task.assignee_id
          ? <span className="flex min-w-0 items-center gap-1.5 text-xs text-slate-600"><Avatar name={cardAssigneeName} src={assignee?.avatarUrl} role={assignee?.avatarRole} size="xs" /><span className="truncate">{cardAssigneeName}</span></span>
          : <span className="text-[11px] italic text-slate-400">Unassigned</span>}
      </div>
    </div>
  )
}

function DraggableCard({ task, names, assignOptions, hrefBase, scope, disabled }: CardProps & { disabled: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id, disabled })
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} className={cn(!disabled && 'touch-none', isDragging && 'opacity-30')}>
      <Card task={task} names={names} assignOptions={assignOptions} hrefBase={hrefBase} scope={scope} linked />
    </div>
  )
}

function Column({ status, label, tasks, names, assignOptions, hrefBase, scope, canDrop, canEditTask }: {
  status: TaskStatus
  label: string
  tasks: TaskSummary[]
  names: Record<string, string>
  assignOptions?: AssigneeOption[]
  hrefBase: string
  scope?: 'mine' | 'assigned' | 'all'
  canDrop: boolean
  canEditTask: (task: TaskSummary) => boolean
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status, disabled: !canDrop })
  return (
    <div className="flex min-w-0 flex-col">
      <div className="mb-2 flex items-center gap-2 px-1">
        <span className={cn('h-2 w-2 rounded-full', TASK_STATUS_DOT[status])} />
        <h3 className="whitespace-nowrap text-sm font-semibold text-slate-700">{label}</h3>
        <span className="shrink-0 rounded-full bg-slate-200/70 px-2 text-xs font-medium text-slate-600">{tasks.length}</span>
      </div>
      <div ref={setNodeRef}
           className={cn('box-border w-full flex-1 flex flex-col gap-2 rounded-xl border-2 bg-slate-200/60 p-2 transition-colors',
             isOver ? 'border-[#8CC7D9] bg-[#EAF5F9]' : 'border-transparent')}>
        {tasks.map(t => <DraggableCard key={t.id} task={t} names={names} assignOptions={assignOptions} hrefBase={hrefBase} scope={scope} disabled={!canEditTask(t)} />)}
      </div>
    </div>
  )
}

/** Kanban: drag between columns to change status (DB triggers log activity + notify). */
export function TaskBoard({
  tasks: initial, names, assignOptions, hrefBase = '/tasks', scope, editableAssigneeId, editableStatuses, readOnly = false,
  onMyTasksCountChange,
}: {
  tasks: TaskSummary[]
  names: Record<string, string>
  assignOptions?: AssigneeOption[]
  hrefBase?: string
  scope?: 'mine' | 'assigned' | 'all'
  editableAssigneeId?: string
  editableStatuses?: TaskStatus[]
  readOnly?: boolean
  onMyTasksCountChange?: (delta: number) => void
}) {
  const router = useRouter()
  const runOnce = useSingleFlight()
  const [tasks, setTasks] = useState(initial)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const allowedStatuses = (editableStatuses ?? TASK_STATUS_OPTIONS.map(status => status.value))
    .filter(status => status !== 'changes_requested')
  const canEditTask = (task: TaskSummary) =>
    !readOnly
    && (!editableAssigneeId || task.assignee_id === editableAssigneeId)
  useEffect(() => setTasks(initial), [initial])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
  )

  async function onDragEnd(e: DragEndEvent) {
    setActiveId(null)
    const id = String(e.active.id)
    const to = e.over?.id as TaskStatus | undefined
    const task = tasks.find(t => t.id === id)
    if (!task || !to || !canEditTask(task) || task.status === to) return

    if (to === 'changes_requested') {
      setError('Only the client can request changes from the client portal.')
      return
    }
    if (!allowedStatuses.some(status => status === to)) {
      setError('You do not have permission to move this task to that status.')
      return
    }

    const prev = tasks
    setTasks(ts => ts.map(t => (t.id === id ? { ...t, status: to } : t)))
    const wasCountedInMyTasks = !TASK_TERMINAL_STATUSES.includes(task.status)
    const willBeCountedInMyTasks = !TASK_TERMINAL_STATUSES.includes(to)
    const myTaskCountDelta = scope === 'mine' && wasCountedInMyTasks !== willBeCountedInMyTasks
      ? willBeCountedInMyTasks ? 1 : -1
      : 0
    onMyTasksCountChange?.(myTaskCountDelta)
    const { error } = await createClient().from('tasks').update({ status: to }).eq('id', id)
    if (error) {
      setTasks(prev)
      onMyTasksCountChange?.(-myTaskCountDelta)
      setError(errorMessage(error).replace(
        'Move the task to In review before Client review',
        'Move the task to Company review before Client review',
      ))
    } else {
      setError('')
      router.refresh()
    }
  }

  const active = tasks.find(t => t.id === activeId)

  return (
    <div>
      {error && (
        <p role="alert" className="mb-3 flex items-center gap-1.5 rounded-lg border border-amber-100 bg-amber-50/70 px-3 py-1.5 text-[13px] text-amber-800">
          <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5 flex-shrink-0 text-amber-600" />
          <span className="min-w-0 flex-1">{error}</span>
          <button
            type="button"
            aria-label="Dismiss warning"
            onClick={() => setError('')}
            className="flex-shrink-0 rounded p-0.5 text-amber-700 hover:bg-amber-100 hover:text-amber-900"
          >
            <X aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        </p>
      )}
      <DndContext id="task-board" sensors={sensors} onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))} onDragEnd={event => void runOnce('drag-update', () => onDragEnd(event))} onDragCancel={() => setActiveId(null)}>
        <div className={cn('-mx-4 grid auto-cols-[minmax(200px,1fr)] grid-flow-col gap-3 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0', tasks.length === 0 && 'min-h-[200px]')}>
          {TASK_STATUS_OPTIONS.map(s => (
            <Column
              key={s.value}
              status={s.value}
              label={s.label}
              names={names}
              assignOptions={assignOptions}
              hrefBase={hrefBase}
              scope={scope}
              canDrop={!readOnly}
              canEditTask={canEditTask}
              tasks={tasks.filter(t => t.status === s.value)}
            />
          ))}
        </div>
        <DragOverlay>{active && <Card task={active} names={names} hrefBase={hrefBase} scope={scope} overlay />}</DragOverlay>
      </DndContext>
    </div>
  )
}
