import { CalendarDays, ClipboardList, Settings2 } from 'lucide-react'

export function TaskFormCard({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
  return <div className={enabled ? 'rounded-xl border border-slate-200 bg-white p-4 shadow-sm' : 'contents'}>{children}</div>
}

export function TaskFormCardTitle({ title = 'Task 1', action }: { title?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <p className="text-sm font-semibold text-slate-800">{title}</p>
      {action}
    </div>
  )
}

export function TaskSectionHeader({ section }: { section: 'basic' | 'configuration' | 'deadline' }) {
  const sections = {
    basic: { title: 'Basic Information', Icon: ClipboardList },
    configuration: { title: 'Task Configuration', Icon: Settings2 },
    deadline: { title: 'Deadline', Icon: CalendarDays },
  }
  const { title, Icon } = sections[section]

  return (
    <div className={`flex items-center gap-2 ${section === 'configuration' || section === 'deadline' ? 'mb-3 mt-4' : 'mb-3'}`}>
      <span className="inline-flex shrink-0 items-center gap-2 rounded-full bg-brand-50 px-3 py-1.5 text-sm font-semibold text-brand-800">
        <Icon aria-hidden="true" className="h-4 w-4 text-brand-700" />
        {title}
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
      ? `grid gap-3 sm:grid-cols-2 ${columns === 'four' ? 'lg:grid-cols-4' : 'mt-3 lg:grid-cols-3'}`
      : `grid gap-4 sm:grid-cols-2 ${columns === 'four' ? 'xl:grid-cols-4' : 'xl:grid-cols-3'}`}>
      {children}
    </div>
  )
}
