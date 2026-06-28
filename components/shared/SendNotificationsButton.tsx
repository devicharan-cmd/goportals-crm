'use client'

import { useState } from 'react'
import { Bell } from 'lucide-react'

export default function SendNotificationsButton() {
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')
  const [count, setCount] = useState(0)

  async function handleSend() {
    setState('sending')
    try {
      const res = await fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'all' }),
      })
      const data = await res.json()
      if (data.ok) {
        setCount(data.sent.length)
        setState('done')
        setTimeout(() => setState('idle'), 4000)
      } else {
        setState('error')
        setTimeout(() => setState('idle'), 4000)
      }
    } catch {
      setState('error')
      setTimeout(() => setState('idle'), 4000)
    }
  }

  return (
    <button
      onClick={handleSend}
      disabled={state === 'sending'}
      className={`inline-flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg transition-colors ${
        state === 'done' ? 'bg-green-100 text-green-700' :
        state === 'error' ? 'bg-red-100 text-red-700' :
        'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
      }`}
    >
      <Bell className="w-4 h-4" />
      {state === 'sending' ? 'Sending…' :
       state === 'done' ? `✓ Sent ${count} alert${count !== 1 ? 's' : ''}` :
       state === 'error' ? 'Failed — check API key' :
       'Send Alerts'}
    </button>
  )
}
