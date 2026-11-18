'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, CalendarClock, LockKeyhole, X } from 'lucide-react'
import {
  DndContext, DragOverlay, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'
import { createClient } from '@/lib/supabase/client'
import { Avatar } from '@/components/ui/primitives'
import { MarketplacePlatformLabel } from '@/components/shared/Marketplace'
import type { AssigneeOption } from '@/lib/queries'
import { DueDate, DueDatePill } from '@/components/ui/badges'
import { PRIORITY_STYLES, TASK_STATUS_OPTIONS, TASK_TERMINAL_STATUSES, taskStatusTransitionWarning } from '@/lib/constants'
import { cn, dueState, errorMessage, taskCode } from '@/lib/utils'
import type { TaskSummary, TaskStatus } from '@/types/database'
import { useSingleFlight } from '@/components/shared/useSingleFlight'

type CardProps = {
  task: TaskSummary
  names: Record<string, string>
  assignOptions?: AssigneeOption[]
  hrefBase: string
  scope?: 'mine' | 'assigned' | 'all'
}

function BoardDueDate({ date, status }: { date: TaskSummary['due_date']; status: TaskSummary['status'] }) {
  const state = dueState(date, status)
  const compactClass = '!rounded-full !px-1.5 !py-0.5 !text-[10px] !leading-4'

  if (state === 'ok' || state === 'overdue' || state === 'today') {
    return (
      <DueDatePill
        date={date}
        status={status}
        className={cn(
          compactClass,
          state === 'overdue' || state === 'today'
            ? '!ring-1 !ring-inset !ring-red-200'
            : '!font-semibold !ring-1 !ring-inset !ring-slate-200',
        )}
      />
    )
  }
  return <DueDate date={date} status={status} className="block text-xs" />
}

function Card({ task, names, overlay, linked, assignOptions, hrefBase, scope }: CardProps & { overlay?: boolean; linked?: boolean }) {
  const assignee = task.assignee_id ? assignOptions?.find(option => option.id === task.assignee_id) : undefined
  const assigneeName = task.assignee_id ? assignee?.name ?? names[task.assignee_id] ?? '—' : '—'
  const roleSuffix = assignee?.role ? ` (${assignee.role})` : ''
  const cardAssigneeName = roleSuffix && assigneeName.endsWith(roleSuffix)
    ? assigneeName.slice(0, -roleSuffix.length)
    : assigneeName
  const taskHref = `${hrefBase}/${task.id}${scope ? `?scope=${scope}` : ''}`
  const body = (
    <>
      <div className="mb-1.5 flex min-w-0 items-start gap-1.5">
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          <span className="shrink-0 whitespace-nowrap font-mono text-xs font-semibold text-[#045E80]">{taskCode(task.task_number)}</span>
          <span className={cn('inline-flex shrink-0 items-center rounded-md px-1.5 py-0 text-xs font-bold leading-4 ring-1 ring-inset', PRIORITY_STYLES[task.priority])}>
            {task.priority}
          </span>
          {task.is_scheduled && <span title="Scheduled task" className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md bg-[#F5FAE8] px-1.5 py-0.5 text-[11px] font-semibold leading-4 text-[#5B771A] ring-1 ring-inset ring-[#D3E896]"><CalendarClock aria-hidden="true" className="h-3 w-3" />Scheduled</span>}
        </span>
        {task.platform?.name && (
          <span className="shrink-0 text-right text-xs text-slate-400">
            <MarketplacePlatformLabel name={task.platform.name} />
          </span>
        )}
      </div>
      <p className="text-sm font-medium leading-snug text-slate-900">{task.title}</p>
      <div className="mt-2 min-w-0">
        {task.client?.company_name && <p className="truncate text-xs text-slate-500">{task.client.company_name}</p>}
        <div className={cn('flex min-w-0 flex-nowrap items-center gap-1.5 text-xs text-slate-500', task.client?.company_name && 'mt-1')}>
          {task.visibility === 'private' && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold leading-4 text-violet-700 ring-1 ring-inset ring-violet-200">
              <LockKeyhole aria-hidden="true" className="h-3 w-3" /> Private
            </span>
          )}
          <div className="w-fit shrink-0">
            <BoardDueDate date={task.due_date} status={task.status} />
          </div>
        </div>
      </div>
    </>
  )
  return (
    <div className={cn('overflow-hidden rounded-lg border bg-white text-left transition-[border-color,box-shadow,transform] duration-200 ease-out',
      overlay ? 'rotate-1 border-[#2A87AA] [box-shadow:0_10px_30px_-10px_rgb(2_43_59_/_0.25)]' : 'border-slate-200 [box-shadow:0_1px_2px_0_rgb(2_43_59_/_0.04),0_1px_3px_0_rgb(2_43_59_/_0.06)] hover:-translate-y-0.5 hover:border-slate-400 hover:shadow-[0_6px_14px_rgba(15,23,42,0.12)]',
      task.is_urgent && !TASK_TERMINAL_STATUSES.includes(task.status) && 'border-l-4 border-l-red-500')}>
      {linked
        ? <Link href={taskHref} prefetch={false} draggable={false} className="block p-3 pb-2 hover:bg-slate-50/60">{body}</Link>
        : <div className="p-3 pb-2">{body}</div>}
      <div className="flex min-w-0 flex-col items-start gap-1.5 border-t border-slate-100 px-3 py-2">
        {task.assignee_id
          ? <span className="flex min-w-0 items-center gap-1.5 text-xs text-slate-600"><Avatar name={cardAssigneeName} src={assignee?.avatarUrl} role={assignee?.avatarRole} size="xs" /><span className="truncate">{cardAssigneeName}</span></span>
          : <span className="text-xs italic text-slate-400">Unassigned</span>}
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
  const boardStyle: Record<TaskStatus, string> = {
    todo: 'bg-slate-500',
    in_progress: 'bg-[#0A6F94]',
    in_system_process: 'bg-sky-500',
    ready_for_review: 'bg-violet-500',
    client_review: 'bg-amber-500',
    changes_requested: 'bg-orange-500',
    completed: 'bg-[#95C12C]',
    cancelled: 'bg-slate-500',
  }
  return (
    <div className="flex min-w-0 flex-col flex-1 rounded-xl border border-slate-200 bg-white p-2">
      <div className={cn('flex h-8 shrink-0 items-center gap-2 rounded-md px-2.5 text-white', boardStyle[status])}>
        <h3 className="!text-white min-w-0 truncate text-xs font-semibold">{label}</h3>
        <span className="ml-auto inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-md bg-white/20 px-1.5 text-[11px] font-semibold leading-none text-white">{tasks.length}</span>
      </div>
      <div ref={setNodeRef}
           className={cn('box-border w-full flex-1 flex flex-col gap-2 pt-2 transition-colors', isOver ? 'bg-[#EAF5F9]' : 'bg-white')}
           style={{ backgroundImage: 'radial-gradient(rgba(148,163,184,.24) 1px, transparent 1px)', backgroundSize: '14px 14px' }}>
        {tasks.map(t => <DraggableCard key={t.id} task={t} names={names} assignOptions={assignOptions} hrefBase={hrefBase} scope={scope} disabled={!canEditTask(t)} />)}
      </div>
    </div>
  )
}

/** Kanban: drag between columns to change status (DB triggers log activity + notify). */
export function TaskBoard({
  tasks: initial, names, assignOptions, hrefBase = '/tasks', scope, editableTaskActorId, editableStatuses, readOnly = false,
  onMyTasksCountChange,
}: {
  tasks: TaskSummary[]
  names: Record<string, string>
  assignOptions?: AssigneeOption[]
  hrefBase?: string
  scope?: 'mine' | 'assigned' | 'all'
  editableTaskActorId?: string
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
    && (!editableTaskActorId
      || task.assignee_id === editableTaskActorId
      || task.assigned_by === editableTaskActorId)
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
    const transitionWarning = taskStatusTransitionWarning(task.status, to, {
      visibility: task.visibility,
      ticketId: task.ticket_id ?? null,
    })
    if (transitionWarning) {
      setError(transitionWarning)
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
        <p role="alert" className="mb-3 flex items-center gap-1.5 rounded-lg border border-amber-100 bg-amber-50/70 px-3 py-1.5 text-xs text-amber-800">
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
        <DragOverlay>{active && <Card task={active} names={names} assignOptions={assignOptions} hrefBase={hrefBase} scope={scope} overlay />}</DragOverlay>
      </DndContext>
    </div>
  )
}
