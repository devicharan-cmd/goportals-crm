'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { showErrorToast, showSuccessToast } from '@/lib/ui-toast'

export function TicketCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)

  async function copyTicketCode() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
      showSuccessToast('Ticket ID copied')
    } catch {
      showErrorToast('Could not copy ticket ID')
    }
  }

  return (
    <span className="inline-flex items-center gap-1">
      <span className="font-mono text-sm font-semibold leading-4 text-[#045E80]">{code}</span>
      <button
        type="button"
        onClick={copyTicketCode}
        aria-label={copied ? 'Ticket ID copied' : `Copy ticket ID ${code}`}
        title="Copy ticket ID"
        className="inline-flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:text-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#045E80]"
      >
        {copied
          ? <Check aria-hidden="true" className="h-3 w-3" />
          : <Copy aria-hidden="true" className="h-3 w-3" />}
      </button>
    </span>
  )
}