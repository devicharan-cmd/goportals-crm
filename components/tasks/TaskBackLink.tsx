'use client'

import Link from 'next/link'
import { ArrowLeft, ChevronRight } from 'lucide-react'

/** Return to the task list with client-side App Router navigation. */
export function TaskBackLink() {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm">
      <Link
        href="/tasks"
        prefetch
        className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Tasks
      </Link>
      <ChevronRight aria-hidden="true" className="h-4 w-4 text-slate-400" />
      <span aria-current="page" className="font-medium text-slate-700">New task</span>
    </nav>
  )
}
