'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Clock, Plus } from 'lucide-react'
import { format } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { errorMessage, formatDate } from '@/lib/utils'
import type { TimeLog } from '@/types/database'

export function TimeLogPanel({
  taskId, logs, names, meId, estimated,
}: { taskId: string; logs: TimeLog[]; names: Record<string, string>; meId: string; estimated: number | null }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ hours: '', logged_date: format(new Date(), 'yyyy-MM-dd'), notes: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const total = logs.reduce((s, l) => s + Number(l.hours), 0)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const { error } = await createClient().from('time_logs').insert({
      task_id: taskId, profile_id: meId, hours: Number(form.hours), logged_date: form.logged_date, notes: form.notes || null,
    })
    setSaving(false)
    if (error) return setError(errorMessage(error))
    setForm({ ...form, hours: '', notes: '' })
    setOpen(false)
    router.refresh()
  }

  const pct = estimated ? Math.min(100, Math.round((total / estimated) * 100)) : 0

  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between">
        <p className="text-2xl font-bold text-slate-900 font-display">{total}h</p>
        <p className="text-xs text-slate-500">{estimated ? `of ${estimated}h estimated` : 'no estimate'}</p>
      </div>
      {estimated ? (
        <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div className={`h-full rounded-full ${total > estimated ? 'bg-red-500' : 'bg-lime-500'}`} style={{ width: `${pct}%` }} />
        </div>
      ) : null}

      {logs.length > 0 && (
        <ul className="mb-3 space-y-2">
          {logs.map(l => (
            <li key={l.id} className="flex items-start justify-between gap-2 text-xs">
              <span className="text-slate-600">
                <span className="font-medium text-slate-800">{names[l.profile_id] ?? '—'}</span> · {formatDate(l.logged_date)}
                {l.notes && <span className="block text-slate-400">{l.notes}</span>}
              </span>
              <span className="font-semibold text-slate-800">{Number(l.hours)}h</span>
            </li>
          ))}
        </ul>
      )}

      {open ? (
        <form onSubmit={submit} className="space-y-2 rounded-lg bg-slate-50 p-3">
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="grid grid-cols-2 gap-2">
            <input className="input h-9" type="number" step="0.25" min="0.25" max="24" required placeholder="Hours"
                   value={form.hours} onChange={e => setForm({ ...form, hours: e.target.value })} />
            <input className="input h-9" type="date" required value={form.logged_date}
                   onChange={e => setForm({ ...form, logged_date: e.target.value })} />
          </div>
          <input className="input h-9" placeholder="What did you do? (optional)" value={form.notes}
                 onChange={e => setForm({ ...form, notes: e.target.value })} />
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" size="sm" loading={saving}>Log time</Button>
          </div>
        </form>
      ) : (
        <Button size="sm" variant="secondary" className="w-full" onClick={() => setOpen(true)}>
          <Clock className="h-3.5 w-3.5" /> <Plus className="-ml-1 h-3 w-3" /> Log time
        </Button>
      )}
    </div>
  )
}
