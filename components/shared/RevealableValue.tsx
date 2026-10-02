'use client'

import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

/** Masks a sensitive detail value (e.g. a password) behind a reveal toggle. */
export function RevealableValue({ value }: { value: string }) {
  const [shown, setShown] = useState(false)
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="font-mono">{shown ? value : '•'.repeat(Math.min(value.length, 10))}</span>
      <button type="button" onClick={() => setShown(s => !s)} aria-label={shown ? 'Hide value' : 'Show value'}
              className="text-slate-400 hover:text-slate-600">
        {shown ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </button>
    </span>
  )
}
