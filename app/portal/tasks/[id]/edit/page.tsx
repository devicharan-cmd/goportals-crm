import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireClient } from '@/lib/auth'
import { getPortalTaskOptions } from '@/lib/portal-options'
import { resolveTaskId } from '@/lib/queries'
import { PageHeader } from '@/components/ui/primitives'
import { PortalTaskForm } from '@/components/portal/PortalTaskForm'
import type { Task } from '@/types/database'

export const metadata = { title: 'Edit request' }

export default async function EditPortalTaskPage({ params }: { params: { id: string } }) {
  const me = await requireClient()
  const taskId = await resolveTaskId(params.id)
  if (!taskId) notFound()
  const { data } = await createClient().from('tasks').select('*').eq('id', taskId).maybeSingle()
  if (!data) notFound()
  const task = data as Task
  // Editable only while nobody has started it (the DB enforces this too).
  if (task.status !== 'open' || task.created_by !== me.id) redirect(`/portal/tasks/${task.id}`)
  const options = await getPortalTaskOptions(task.client_id)

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Edit request"
        back={<Link href={`/portal/tasks/${task.id}`} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" /> Back</Link>}
      />
      <PortalTaskForm task={task} platforms={options.platforms} services={options.services} />
    </div>
  )
}
