'use client'

import { useState } from 'react'
import { Layers3, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { TaskForm } from '@/components/tasks/TaskForm'
import type { TaskFormProps } from '@/components/tasks/TaskForm'
import type { Task } from '@/types/database'

export function TaskEditModal({
  task,
  schedule,
  canManageSchedule,
  meId,
  canMarkUrgent,
  canEditAssignment,
  canEditAssignee,
  clients,
  clientImageUrlByPath,
  assignees,
  clientAssignees,
  departments,
  platforms,
  services,
}: {
  task: Task
  schedule?: NonNullable<TaskFormProps['schedule']> | null
  canManageSchedule?: boolean
  meId: string
  canMarkUrgent: boolean
  canEditAssignment: boolean
  canEditAssignee?: boolean
  clients: TaskFormProps['clients']
  clientImageUrlByPath?: TaskFormProps['clientImageUrlByPath']
  assignees: TaskFormProps['assignees']
  clientAssignees?: TaskFormProps['clientAssignees']
  departments: TaskFormProps['departments']
  platforms: TaskFormProps['platforms']
  services: TaskFormProps['services']
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Pencil className="h-3.5 w-3.5" /> Edit
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Edit task"
        description="Update task details and assignment."
        size="xl"
        dialogClassName="flex min-h-[min(560px,88vh)] max-h-[92vh] flex-col overflow-hidden rounded-2xl sm:max-w-4xl"
        headerClassName="border-slate-100 bg-white px-6 py-3 sm:px-7"
        bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
        titleClassName="text-lg font-bold text-slate-900"
        closeButtonClassName="bg-slate-100 text-slate-600 shadow-sm ring-1 ring-inset ring-slate-200 transition-all hover:rotate-90 hover:bg-red-50 hover:text-red-600 hover:ring-red-200 focus-visible:ring-red-300"
        headerIcon={<span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[#CFE6EF] text-[#034C68]"><Layers3 className="h-5 w-5" /></span>}
      >
        <TaskForm
          mode="edit"
          task={task}
          schedule={schedule}
          canManageSchedule={canManageSchedule}
          meId={meId}
          canMarkUrgent={canMarkUrgent}
          canEditAssignment={canEditAssignment}
          canEditAssignee={canEditAssignee}
          clients={clients}
          clientImageUrlByPath={clientImageUrlByPath}
          assignees={assignees}
          clientAssignees={clientAssignees}
          departments={departments}
          platforms={platforms}
          services={services}
          onCancel={() => setOpen(false)}
          onSaved={() => setOpen(false)}
          modalLayout
        />
      </Modal>
    </>
  )
}
