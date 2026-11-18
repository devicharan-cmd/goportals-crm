'use client'

import { Avatar } from '@/components/ui/primitives'
import { ROLE_LABELS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import type { TaskAssigneeHistoryItem } from '@/types/database'

export function TaskPreviousAssignees({
  history,
  className,
  compact = false,
}: {
  history?: TaskAssigneeHistoryItem[]
  className?: string
  compact?: boolean
}) {
  const previousAssignees = history?.filter(assignee => !assignee.is_current) ?? []
  if (previousAssignees.length === 0) return null

  return (
    <div className={cn('min-w-0 space-y-1', className)} aria-label="Previous assignees">
      {previousAssignees.map(assignee => (
        <div key={`${assignee.task_id}-${assignee.profile_id}`} className="flex min-w-0 items-center gap-1.5 text-xs text-slate-500">
          <Avatar
            name={assignee.full_name}
            src={assignee.avatar_url}
            role={assignee.role ?? undefined}
            size="xs"
          />
          <span className="min-w-0 truncate">{assignee.full_name}</span>
          {!compact && assignee.role && (
            <span className="shrink-0 text-xs text-slate-400">({ROLE_LABELS[assignee.role]})</span>
          )}
          <span className="shrink-0 text-xs text-slate-400">Previous</span>
        </div>
      ))}
    </div>
  )
}
