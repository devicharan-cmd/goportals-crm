import { CalendarDays, ClipboardList, Settings2 } from 'lucide-react'

export function TaskFormCard({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
  return <div className={enabled ? 'rounded-xl border border-slate-200 bg-white p-4 shadow-sm' : 'task-form-fields-stack'}>{children}</div>
}

export function TaskFormCardTitle({ title = 'Task 1', action }: { title?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <p className="text-sm font-semibold text-slate-800">{title}</p>
      {action}
    </div>
  )
}

export function TaskSectionHeader({ section, required = false }: { section: 'basic' | 'configuration' | 'deadline'; required?: boolean }) {
  const sections = {
    basic: { title: 'Basic Information', Icon: ClipboardList },
    configuration: { title: 'Task Configuration', Icon: Settings2 },
    deadline: { title: 'Deadline', Icon: CalendarDays },
  }
  const { title, Icon } = sections[section]

  return (
    <div className={`flex items-center gap-2 ${section === 'configuration' || section === 'deadline' ? 'mb-3 mt-4' : 'mb-3'}`}>
      <span className="inline-flex shrink-0 items-center gap-2 rounded-full bg-[#EAF4F8] px-3 py-1.5 text-sm font-semibold text-[#033B51]">
        <Icon aria-hidden="true" className="h-4 w-4 text-[#034C68]" />
        {title}
        {required && <span className="text-red-500">*</span>}
      </span>
    </div>
  )
}

export function TaskFieldsGrid({ columns, modal = true, children }: {
  columns: 'four' | 'three'
  modal?: boolean
  children: React.ReactNode
}) {
  return (
    <div className={modal
      ? `grid gap-3 sm:grid-cols-2 ${columns === 'four' ? 'lg:grid-cols-4' : 'mt-4 lg:grid-cols-3'}`
      : `grid gap-x-4 gap-y-5 sm:grid-cols-2 ${columns === 'four' ? 'xl:grid-cols-4' : 'xl:grid-cols-3'}`}>
      {children}
    </div>
  )
}
