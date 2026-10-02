import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/auth'
import { assignableFor, getStaffLookups, nameMap } from '@/lib/queries'
import { PageHeader } from '@/components/ui/primitives'
import { TaskForm } from '@/components/tasks/TaskForm'
import type { Task } from '@/types/database'

export const metadata = { title: 'Edit task' }

export default async function EditTaskPage({ params }: { params: { id: string } }) {
  const me = await requireStaff()
  const supabase = createClient()
  const [{ data }, lookups] = await Promise.all([
    supabase.from('tasks').select('*').eq('id', params.id).maybeSingle(),
    getStaffLookups(),
  ])
  if (!data) notFound()
  const task = data as Task

  const names = nameMap(lookups.people)
  const assignees = assignableFor(me, lookups).map(p => ({ id: p.id, name: p.full_name || p.email }))
  if (task.assignee_id && !assignees.some(a => a.id === task.assignee_id)) {
    assignees.unshift({ id: task.assignee_id, name: names[task.assignee_id] ?? 'Current assignee' })
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Edit task"
        back={<Link href={`/tasks/${task.id}`} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" /> Back to task</Link>}
      />
      <TaskForm
        mode="edit"
        task={task}
        meId={me.id}
        canMarkUrgent={me.role !== 'employee'}
        canEditAssignment={me.role !== 'employee'}
        clients={lookups.clients}
        assignees={assignees}
        departments={lookups.departments}
        platforms={lookups.platforms}
        services={lookups.services}
      />
    </div>
  )
}
