'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  DndContext, DragOverlay, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'
import { createClient } from '@/lib/supabase/client'
import { Avatar } from '@/components/ui/primitives'
import { AssignButton } from '@/components/tasks/AssignButton'
import type { AssigneeOption } from '@/lib/queries'
import { DueDate, PriorityBadge } from '@/components/ui/badges'
import { STATUS_DOT, STATUS_OPTIONS } from '@/lib/constants'
import { cn, errorMessage, taskCode } from '@/lib/utils'
import type { TaskListItem, TaskStatus } from '@/types/database'

type CardProps = { task: TaskListItem; names: Record<string, string>; assignOptions?: AssigneeOption[] }

function Card({ task, names, overlay, linked, assignOptions }: CardProps & { overlay?: boolean; linked?: boolean }) {
  const body = (
    <>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5">
          <span className="font-mono text-[11px] font-semibold text-slate-400">{taskCode(task.task_number)}</span>
          <PriorityBadge priority={task.priority} />
        </span>
        <span className="truncate text-[11px] text-slate-400">{task.platform?.name}</span>
      </div>
      <p className="text-sm font-medium leading-snug text-slate-900">{task.title}</p>
      <p className="mt-1 truncate text-xs text-slate-500">{task.client?.company_name}</p>
      <DueDate date={task.due_date} status={task.status} className="mt-2 block" />
    </>
  )
  return (
    <div className={cn('rounded-lg border bg-white text-left',
      overlay ? 'rotate-1 border-brand-400 shadow-pop' : 'border-slate-200 shadow-card',
      task.is_urgent && task.status !== 'done' && 'border-l-4 border-l-red-500')}>
      {linked
        ? <Link href={`/tasks/${task.id}`} draggable={false} className="block p-3 pb-2 hover:bg-slate-50/60">{body}</Link>
        : <div className="p-3 pb-2">{body}</div>}
      <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-3 py-2">
        {task.assignee_id
          ? <span className="flex min-w-0 items-center gap-1.5 text-xs text-slate-600"><Avatar name={names[task.assignee_id]} size="xs" /><span className="truncate">{names[task.assignee_id] ?? '—'}</span></span>
          : <span className="text-[11px] italic text-slate-400">Unassigned</span>}
        {assignOptions && task.status !== 'done' && (
          // Keep clicks / drags inside the picker from starting a drag or opening the task.
          <span onPointerDown={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
            <AssignButton taskId={task.id} currentId={task.assignee_id} options={assignOptions} variant="link" />
          </span>
        )}
      </div>
    </div>
  )
}

function DraggableCard({ task, names, assignOptions }: CardProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id })
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} className={cn('touch-none', isDragging && 'opacity-30')}>
      <Card task={task} names={names} assignOptions={assignOptions} linked />
    </div>
  )
}

function Column({ status, label, tasks, names, assignOptions }: { status: TaskStatus; label: string; tasks: TaskListItem[]; names: Record<string, string>; assignOptions?: AssigneeOption[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  return (
    <div className="flex w-72 flex-shrink-0 flex-col">
      <div className="mb-2 flex items-center gap-2 px-1">
        <span className={cn('h-2 w-2 rounded-full', STATUS_DOT[status])} />
        <h3 className="text-sm font-semibold text-slate-700">{label}</h3>
        <span className="rounded-full bg-slate-200/70 px-2 text-xs font-medium text-slate-600">{tasks.length}</span>
      </div>
      <div ref={setNodeRef}
           className={cn('min-h-[200px] flex-1 space-y-2 rounded-xl p-2 transition-colors',
             isOver ? 'bg-brand-50 ring-2 ring-brand-200' : 'bg-slate-100/70')}>
        {tasks.map(t => <DraggableCard key={t.id} task={t} names={names} assignOptions={assignOptions} />)}
      </div>
    </div>
  )
}

/** Kanban: drag between columns to change status (DB triggers log activity + notify). */
export function TaskBoard({
  tasks: initial, names, assignOptions,
}: { tasks: TaskListItem[]; names: Record<string, string>; assignOptions?: AssigneeOption[] }) {
  const router = useRouter()
  const [tasks, setTasks] = useState(initial)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [error, setError] = useState('')
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
    if (!task || !to || task.status === to) return

    const prev = tasks
    setTasks(ts => ts.map(t => (t.id === id ? { ...t, status: to } : t)))
    const { error } = await createClient().from('tasks').update({ status: to }).eq('id', id)
    if (error) {
      setTasks(prev)
      setError(errorMessage(error))
    } else {
      setError('')
      router.refresh()
    }
  }

  const active = tasks.find(t => t.id === activeId)

  return (
    <div>
      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <DndContext id="task-board" sensors={sensors} onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
        <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0">
          {STATUS_OPTIONS.map(s => (
            <Column key={s.value} status={s.value} label={s.label} names={names} assignOptions={assignOptions} tasks={tasks.filter(t => t.status === s.value)} />
          ))}
        </div>
        <DragOverlay>{active && <Card task={active} names={names} overlay />}</DragOverlay>
      </DndContext>
    </div>
  )
}
