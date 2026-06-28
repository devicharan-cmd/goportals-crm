'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { TicketType, TicketPriority, Platform } from '@/types'

const PLATFORMS: Platform[] = ['amazon', 'flipkart', 'myntra', 'blinkit', 'meesho', 'nykaa', 'other']

interface Props {
  ticket: any
  clients: { id: string; name: string }[]
  members: { id: string; name: string }[]
}

export default function EditTicketForm({ ticket, clients, members }: Props) {
  const router = useRouter()
  const supabase = createClient()

  const [form, setForm] = useState({
    title: ticket.title ?? '',
    description: ticket.description ?? '',
    client_id: ticket.client_id ?? '',
    assignee_id: ticket.assignee_id ?? '',
    type: ticket.type as TicketType,
    priority: ticket.priority as TicketPriority,
    platform: (ticket.platform ?? '') as Platform | '',
    external_ref: ticket.external_ref ?? '',
    due_date: ticket.due_date ?? '',
    estimated_hours: ticket.estimated_hours?.toString() ?? '3',
    deadline_type: (ticket.deadline_type ?? '') as 'today' | 'this_week' | 'this_month' | '',
  })

  function applyDeadlineType(dt: 'today' | 'this_week' | 'this_month' | '') {
    const now = new Date()
    let due = ''
    if (dt === 'today') {
      due = now.toISOString().split('T')[0]
    } else if (dt === 'this_week') {
      const end = new Date(now)
      end.setDate(now.getDate() + (7 - now.getDay()))
      due = end.toISOString().split('T')[0]
    } else if (dt === 'this_month') {
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      due = end.toISOString().split('T')[0]
    }
    setForm(f => ({ ...f, deadline_type: dt, due_date: due }))
  }
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')

    const { error } = await supabase
      .from('tickets')
      .update({
        title: form.title,
        description: form.description || null,
        client_id: form.client_id,
        assignee_id: form.assignee_id || null,
        type: form.type,
        priority: form.priority,
        platform: form.platform || null,
        external_ref: form.external_ref || null,
        due_date: form.due_date || null,
        estimated_hours: parseFloat(form.estimated_hours),
        deadline_type: form.deadline_type || null,
      })
      .eq('id', ticket.id)

    if (error) {
      setError(error.message)
      setSaving(false)
    } else {
      router.push(`/tickets/${ticket.id}`)
      router.refresh()
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
        <input
          type="text"
          value={form.title}
          onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
          required
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
        <textarea
          value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          rows={4}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Client *</label>
          <select
            value={form.client_id}
            onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select brand</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Assignee</label>
          <select
            value={form.assignee_id}
            onChange={e => setForm(f => ({ ...f, assignee_id: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Unassigned</option>
            {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
          <select
            value={form.type}
            onChange={e => setForm(f => ({ ...f, type: e.target.value as TicketType }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="task">Task</option>
            <option value="issue">Issue</option>
            <option value="request">Request</option>
            <option value="grievance">Grievance</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
          <select
            value={form.priority}
            onChange={e => setForm(f => ({ ...f, priority: e.target.value as TicketPriority }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="P1">P1 — Critical</option>
            <option value="P2">P2 — High</option>
            <option value="P3">P3 — Medium</option>
            <option value="P4">P4 — Low</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Platform</label>
          <select
            value={form.platform}
            onChange={e => setForm(f => ({ ...f, platform: e.target.value as Platform | '' }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">None</option>
            {PLATFORMS.map(p => (
              <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Case / Ref ID</label>
          <input
            type="text"
            value={form.external_ref}
            onChange={e => setForm(f => ({ ...f, external_ref: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Amazon case ID etc."
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Deadline</label>
          <div className="flex gap-2 flex-wrap">
            {(['today', 'this_week', 'this_month'] as const).map(dt => (
              <button
                key={dt}
                type="button"
                onClick={() => applyDeadlineType(form.deadline_type === dt ? '' : dt)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  form.deadline_type === dt
                    ? dt === 'today' ? 'bg-red-600 text-white'
                    : dt === 'this_week' ? 'bg-orange-500 text-white'
                    : 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {dt === 'today' ? '🔴 Today' : dt === 'this_week' ? '🟠 This Week' : '🔵 This Month'}
              </button>
            ))}
          </div>
          {form.due_date && (
            <p className="text-xs text-gray-400 mt-1.5">Due: {new Date(form.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Estimated Hours</label>
          <input
            type="number"
            min="0.5"
            step="0.5"
            value={form.estimated_hours}
            onChange={e => setForm(f => ({ ...f, estimated_hours: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving}
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg"
        >
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="px-5 py-2.5 border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm rounded-lg"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
