import { createClient } from '@/lib/supabase/server'
import { requireClient } from '@/lib/auth'
import { PageHeader } from '@/components/ui/primitives'
import { PortalTaskList } from '@/components/portal/PortalTaskList'
import { getPortalNames } from '@/lib/portal'
import type { TaskSummary } from '@/types/database'

export const metadata = { title: 'My tasks' }

export default async function PortalTasksPage() {
  const me = await requireClient()
  const [result, names] = await Promise.all([
    (await createClient()).rpc('client_ticket_tasks', { p_task_id: null, p_task_number: null }),
    getPortalNames(me),
  ])
  const { data, error } = result
  if (error) throw new Error(error.message)

  return (
    <>
      <PageHeader title="My tasks" description="Work assigned to you and the progress of tasks linked to your tickets." />
      <PortalTaskList tasks={(data ?? []) as TaskSummary[]} names={names} meId={me.id} />
    </>
  )
}
