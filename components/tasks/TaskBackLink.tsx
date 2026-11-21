'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

/**
 * Return to the task list with a document navigation.
 *
 * The task-create form is a large client boundary. On some App Router
 * transitions its RSC payload can arrive successfully without replacing that
 * boundary, which leaves the form visible. A document navigation guarantees
 * the list route is mounted before this form unmounts.
 */
export function TaskBackLink() {
  return (
    <Link
      href="/tasks"
      prefetch={false}
      onClick={event => {
        event.preventDefault()
        window.location.assign('/tasks')
      }}
      className="-ml-2 inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
    >
      <ArrowLeft className="h-4 w-4" /> Tasks
    </Link>
  )
}
