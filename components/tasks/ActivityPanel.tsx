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
    <Card className="flex h-[26rem] flex-col">
      <CardHeader title="Activity" />
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <ActivityTimeline activity={activity} names={names} kind={kind} audience={audience} />
      </div>
    </Card>
  )
}
