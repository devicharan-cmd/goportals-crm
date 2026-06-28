'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Clock, Plus } from 'lucide-react'

type TimeLog = {
  id: string
  hours: number
  logged_date: string
  notes: string | null
  member: { name: string } | null
}

type Props = {
  ticketId: string
  logs: TimeLog[]
  members: { id: string; name: string }[]
}

export default function TimeLogBox({ ticketId, logs, members }: Props) {
  const router = useRouter()
  const supabase = createClient()

  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    member_id: '',
    hours: '1',
    logged_date: new Date().toISOString().split('T')[0],
    notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const totalHours = logs.reduce((sum, l) => sum + Number(l.hours), 0)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.member_id) { setError('Select a team member'); return }
    setSaving(true)
    setError('')

    const { error } = await supabase.from('time_logs').insert({
      ticket_id: ticketId,
      member_id: form.member_id,
      hours: parseFloat(form.hours),
      logged_date: form.logged_date,
      notes: form.notes || null,
    })

    if (error) {
      setError(error.message)
      setSaving(false)
    } else {
      setOpen(false)
      setForm({ member_id: '', hours: '1', logged_date: new Date().toISOString().split('T')[0], notes: '' })
      setSaving(false)
      router.refresh()
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-gray-400" />
          <h2 className="font-semibold text-gray-900">Time Logged</h2>
          <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium">
            {totalHours}h total
          </span>
        </div>
        <button
          onClick={() => setOpen(o => !o)}
          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
        >
          <Plus className="w-3.5 h-3.5" />
          Log time
        </button>
      </div>

      {/* Log time form */}
      {open && (
        <form onSubmit={handleSubmit} className="px-5 py-4 border-b border-gray-100 bg-blue-50/40 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Team Member *</label>
              <select
                value={form.member_id}
                onChange={e => setForm(f => ({ ...f, member_id: e.target.value }))}
                className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select member</option>
                {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Hours *</label>
              <input
                type="number"
                min="0.5"
                step="0.5"
                value={form.hours}
                onChange={e => setForm(f => ({ ...f, hours: e.target.value }))}
                className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
              <input
                type="date"
                value={form.logged_date}
                onChange={e => setForm(f => ({ ...f, logged_date: e.target.value }))}
                className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
              <input
                type="text"
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Optional"
                className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-4 py-1.5 border border-gray-200 text-gray-600 hover:bg-gray-50 text-xs rounded-lg"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Log history */}
      <div className="divide-y divide-gray-50">
        {logs.map(log => (
          <div key={log.id} className="px-5 py-3 flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-xs font-bold flex-shrink-0">
                {log.member?.name?.charAt(0) ?? '?'}
              </span>
              <div>
                <p className="text-sm font-medium text-gray-900">{log.member?.name ?? 'Unknown'}</p>
                {log.notes && <p className="text-xs text-gray-400">{log.notes}</p>}
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-sm font-semibold text-blue-700">{log.hours}h</p>
              <p className="text-xs text-gray-400">{new Date(log.logged_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
            </div>
          </div>
        ))}
        {logs.length === 0 && !open && (
          <div className="px-5 py-5 text-center text-sm text-gray-400">No time logged yet</div>
        )}
      </div>
    </div>
  )
}
