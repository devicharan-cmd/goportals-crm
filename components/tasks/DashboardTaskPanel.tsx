'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Card, CardHeader } from '@/components/ui/primitives'
import { TaskTable } from '@/components/tasks/TaskTable'
import { cn } from '@/lib/utils'
import type { TaskListItem } from '@/types/database'

type Group = 'working' | 'done'

/** Dashboard "All tasks" card: one panel, status filter tabs switch which group shows. */
export function DashboardTaskPanel({
  workingTasks, doneTasks, workingCount, doneCount, names,
}: {
  workingTasks: TaskListItem[]
  doneTasks: TaskListItem[]
  workingCount: number
  doneCount: number
  names: Record<string, string>
}) {
  const [group, setGroup] = useState<Group>('working')
  const tasks = group === 'working' ? workingTasks : doneTasks

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="All tasks"
        description={group === 'working' ? 'Todo, in progress, ready for review & changes requested' : 'Most recently completed'}
        action={
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setGroup('working')}
                className={cn('rounded-md px-2.5 py-1', group === 'working' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700')}
              >
                Working ({workingCount})
              </button>
              <button
                type="button"
                onClick={() => setGroup('done')}
                className={cn('rounded-md px-2.5 py-1', group === 'done' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700')}
              >
                Done ({doneCount})
              </button>
            </div>
            <Link
              href={group === 'working' ? '/tasks?scope=all&status=active' : '/tasks?scope=all&status=completed'}
              className="text-xs font-semibold text-brand-600 hover:text-brand-700"
            >
              View all
            </Link>
          </div>
        }
      />
      <TaskTable
        tasks={tasks}
        names={names}
        empty={{ title: group === 'working' ? 'Nothing in progress' : 'Nothing completed yet', description: group === 'working' ? 'No active tasks right now.' : undefined }}
      />
    </Card>
  )
}
