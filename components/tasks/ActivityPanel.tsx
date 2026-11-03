import { ActivityTimeline } from '@/components/tasks/ActivityTimeline'
import { Card, CardHeader } from '@/components/ui/primitives'
import type { ActivityEntry } from '@/types/database'

export function ActivityPanel({
  activity,
  names,
  kind = 'task',
  audience = 'staff',
}: {
  activity: ActivityEntry[]
  names: Record<string, string>
  kind?: 'task' | 'ticket'
  audience?: 'staff' | 'client'
}) {
  return (
    <Card>
      <CardHeader title="Activity" />
      <div className="max-h-80 overflow-y-auto p-5">
        <ActivityTimeline activity={activity} names={names} kind={kind} audience={audience} />
      </div>
    </Card>
  )
}
