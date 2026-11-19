'use client'

import { useState } from 'react'
import { CalendarClock } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { errorMessage } from '@/lib/utils'

export function TaskScheduleControl({ taskId, enabled, repeatLabel, canManage }: {
  taskId: string
  enabled: boolean
  repeatLabel: string
  canManage: boolean
}) {
  const router = useRouter()
  const [active, setActive] = useState(enabled)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function toggle() {
    setSaving(true)
    setError('')
    const next = !active
    const { error: updateError } = await createClient().rpc('set_task_schedule_enabled', {
      p_task_id: taskId,
      p_enabled: next,
    })
    if (updateError) setError(errorMessage(updateError))
    else {
      setActive(next)
      router.refresh()
    }
    setSaving(false)
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50/60 px-4 py-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <CalendarClock aria-hidden="true" className="h-5 w-5 shrink-0 text-indigo-700" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-800">Scheduled task</p>
          <p className="text-xs text-slate-500">{repeatLabel} · {active ? 'Schedule enabled' : 'Schedule paused'}</p>
          {error && <p role="alert" className="field-error">{error}</p>}
        </div>
      </div>
      {canManage && (
        <button type="button" onClick={() => void toggle()} disabled={saving}
          className="rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-800 transition hover:bg-indigo-100 disabled:cursor-wait disabled:opacity-60">
          {saving ? 'Saving…' : active ? 'Disable schedule' : 'Enable schedule'}
        </button>
      )}
    </div>
  )
}
