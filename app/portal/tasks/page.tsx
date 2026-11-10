import { createClient } from '@/lib/supabase/server'
import { requireClient } from '@/lib/auth'
import { PageHeader, Card } from '@/components/ui/primitives'
import { TaskTable } from '@/components/tasks/TaskTable'
import { TASK_LIST_SELECT } from '@/lib/queries'
import type { TaskListItem } from '@/types/database'

export const metadata = { title: 'My tasks' }

export default async function PortalTasksPage() {
  const me = await requireClient()
  const { data, error } = await (await createClient()).from('tasks')
    .select(TASK_LIST_SELECT)
    .eq('assignee_id', me.id)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)

  return (
    <>
      <PageHeader title="My tasks" description="Work and information requests from the GoPortals team." />
      <Card className="overflow-hidden">
        <TaskTable
          tasks={(data ?? []) as TaskListItem[]}
          names={{ [me.id]: me.full_name || me.email }}
          hrefBase="/portal/tasks"
          showClient={false}
          showAssignee={false}
          empty={{
            title: 'No tasks yet',
            description: 'Tasks or information requests from the GoPortals team will appear here.',
          }}
        />
      </Card>
    </>
  )
}
