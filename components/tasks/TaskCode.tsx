'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { cn, taskCode } from '@/lib/utils'

/** Task ID pill (GP-1024). Click to copy — handy for WhatsApp / email. */
export function TaskCode({ number, className }: { number: number; className?: string }) {
  const [copied, setCopied] = useState(false)
  const code = taskCode(number)

  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard blocked — the ID is still visible to copy by hand */ }
  }

  return (
    <button
      type="button"
      onClick={copy}
      title="Copy task ID"
      className={cn('inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-600 ring-1 ring-inset ring-slate-200 transition hover:bg-slate-200',
        copied && 'bg-lime-50 text-lime-700 ring-lime-200', className)}
    >
      {code}
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3 opacity-60" />}
    </button>
  )
}
