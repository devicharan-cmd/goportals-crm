'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { toast } from 'sonner'

export function TicketCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)

  async function copyTicketCode() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
      toast.success('Ticket ID copied')
    } catch {
      toast.error('Could not copy ticket ID')
    }
  }

  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-sm font-normal leading-4 text-[#7DAA24]">{code}</span>
      <button
        type="button"
        onClick={copyTicketCode}
        aria-label={copied ? 'Ticket ID copied' : `Copy ticket ID ${code}`}
        title="Copy ticket ID"
        className="inline-flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:text-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600"
      >
        {copied
          ? <Check aria-hidden="true" className="h-3 w-3" />
          : <Copy aria-hidden="true" className="h-3 w-3" />}
      </button>
    </span>
  )
}