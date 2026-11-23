'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

/** Return to the task list with client-side App Router navigation. */
export function TaskBackLink() {
  return (
    <Link
      href="/tasks"
      prefetch
      className="-ml-2 inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
    >
      <ArrowLeft className="h-4 w-4" /> Tasks
    </Link>
  )
}
