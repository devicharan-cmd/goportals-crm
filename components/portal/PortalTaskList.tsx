'use client'

import { useMemo, useState } from 'react'
import { TaskBoard } from '@/components/tasks/TaskBoard'
import { TaskTable } from '@/components/tasks/TaskTable'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/primitives'
import type { TaskSummary } from '@/types/database'

export function PortalTaskList({
  tasks, names, meId,
}: { tasks: TaskSummary[]; names: Record<string, string>; meId: string }) {
  const [scope, setScope] = useState<'mine' | 'ticket'>('mine')
  const [view, setView] = useState<'board' | 'list'>('board')
  const myTasks = useMemo(() => tasks.filter(task => task.assignee_id === meId), [tasks, meId])
  const visibleTasks = scope === 'mine' ? myTasks : tasks

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg bg-slate-100 p-1" role="group" aria-label="Task scope">
          <button
            type="button"
            aria-pressed={scope === 'mine'}
            onClick={() => setScope('mine')}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${scope === 'mine' ? 'bg-white text-[#034C68] shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
          >
            My tasks <span className="ml-1 text-xs text-slate-400">{myTasks.length}</span>
          </button>
          <button
            type="button"
            aria-pressed={scope === 'ticket'}
            onClick={() => setScope('ticket')}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${scope === 'ticket' ? 'bg-white text-[#034C68] shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
          >
            Ticket tasks <span className="ml-1 text-xs text-slate-400">{tasks.length}</span>
          </button>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant={view === 'board' ? 'secondary' : 'ghost'} onClick={() => setView('board')}>Board</Button>
          <Button size="sm" variant={view === 'list' ? 'secondary' : 'ghost'} onClick={() => setView('list')}>List</Button>
        </div>
      </div>

      {scope === 'ticket' && (
        <p className="text-sm text-slate-500">
          Follow every task linked to your tickets. Only tasks assigned to you can be moved.
        </p>
      )}

      {view === 'board' ? (
        <TaskBoard
          tasks={visibleTasks}
          names={names}
          hrefBase="/portal/tasks"
          readOnly={scope === 'ticket'}
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
            showAssignee={scope === 'ticket'}
            empty={{
              title: scope === 'mine' ? 'No tasks assigned to you yet' : 'No tasks linked to your tickets yet',
              description: scope === 'mine'
                ? 'Tasks assigned to your client account will appear here.'
                : 'Tasks created for your tickets will appear here.',
            }}
          />
        </Card>
      )}
    </div>
  )
}
