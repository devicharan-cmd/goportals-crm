'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { UserPlus, Shield, ShieldOff, UserX, ChevronDown, ChevronUp } from 'lucide-react'

type Member = {
  id: string
  name: string
  email: string | null
  role: string
  department: string | null
  weekly_capacity_hours: number
  is_active: boolean
  is_admin: boolean
}

type Props = {
  allMembers: Member[]
}

const ROLES = ['account_manager', 'ads_manager', 'operations', 'reporting', 'admin', 'other']

export default function AdminTeamPanel({ allMembers }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [actionId, setActionId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [form, setForm] = useState({
    name: '',
    email: '',
    role: 'account_manager',
    department: '',
    weekly_capacity_hours: '40',
  })

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')

    const res = await fetch('/api/admin/team', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        weekly_capacity_hours: parseInt(form.weekly_capacity_hours),
      }),
    })
    const data = await res.json()

    if (!res.ok) {
      setError(data.error ?? 'Something went wrong')
    } else {
      setSuccess(`${form.name} added — they'll get an invite email at ${form.email}`)
      setForm({ name: '', email: '', role: 'account_manager', department: '', weekly_capacity_hours: '40' })
      setShowForm(false)
      router.refresh()
    }
    setSaving(false)
  }

  async function patchMember(id: string, updates: Record<string, unknown>) {
    setActionId(id)
    setError('')
    setSuccess('')

    const res = await fetch('/api/admin/team', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...updates }),
    })
    const data = await res.json()

    if (!res.ok) {
      setError(data.error ?? 'Something went wrong')
    } else {
      router.refresh()
    }
    setActionId(null)
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header — toggle */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-blue-600" />
          <span className="font-semibold text-gray-900">Manage Team</span>
          <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">Admin only</span>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>

      {open && (
        <div className="border-t border-gray-100 p-5 space-y-4">
          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
          {success && <p className="text-sm text-green-700 bg-green-50 px-3 py-2 rounded-lg">{success}</p>}

          {/* Member list */}
          <div className="space-y-2">
            {allMembers.map(m => (
              <div
                key={m.id}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg border ${m.is_active ? 'border-gray-200 bg-gray-50' : 'border-dashed border-gray-200 bg-gray-50 opacity-60'}`}
              >
                <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm flex-shrink-0">
                  {m.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 flex items-center gap-1.5">
                    {m.name}
                    {m.is_admin && <Shield className="w-3.5 h-3.5 text-blue-600" />}
                  </p>
                  <p className="text-xs text-gray-400 truncate">{m.email ?? '—'} · {m.role.replace('_', ' ')}</p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {/* Toggle admin */}
                  <button
                    onClick={() => patchMember(m.id, { is_admin: !m.is_admin })}
                    disabled={actionId === m.id}
                    title={m.is_admin ? 'Remove admin' : 'Make admin'}
                    className={`p-1.5 rounded-lg transition-colors ${m.is_admin ? 'text-blue-600 bg-blue-50 hover:bg-blue-100' : 'text-gray-400 hover:bg-gray-100'}`}
                  >
                    {m.is_admin ? <ShieldOff className="w-3.5 h-3.5" /> : <Shield className="w-3.5 h-3.5" />}
                  </button>
                  {/* Deactivate / Reactivate */}
                  <button
                    onClick={() => patchMember(m.id, { is_active: !m.is_active })}
                    disabled={actionId === m.id}
                    title={m.is_active ? 'Deactivate member' : 'Reactivate member'}
                    className={`p-1.5 rounded-lg transition-colors ${m.is_active ? 'text-gray-400 hover:bg-red-50 hover:text-red-600' : 'text-green-600 bg-green-50 hover:bg-green-100'}`}
                  >
                    <UserX className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Add member form */}
          {showForm ? (
            <form onSubmit={handleAddMember} className="border border-blue-200 rounded-xl p-4 space-y-3 bg-blue-50/40">
              <p className="text-sm font-semibold text-gray-800">Add new team member</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Rahul Sharma"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Work Email *</label>
                  <input
                    type="email"
                    required
                    value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="rahul@goportals.co"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Role *</label>
                  <select
                    value={form.role}
                    onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {ROLES.map(r => (
                      <option key={r} value={r}>{r.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Weekly Capacity (hrs)</label>
                  <input
                    type="number"
                    min="1"
                    max="60"
                    value={form.weekly_capacity_hours}
                    onChange={e => setForm(f => ({ ...f, weekly_capacity_hours: e.target.value }))}
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg"
                >
                  {saving ? 'Sending invite…' : 'Add & Send Invite'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-1.5 border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm rounded-lg"
                >
                  Cancel
                </button>
              </div>
              <p className="text-xs text-gray-400">They'll receive an email invite to set their password and log in.</p>
            </form>
          ) : (
            <button
              onClick={() => { setShowForm(true); setSuccess('') }}
              className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700 px-3 py-2 rounded-lg hover:bg-blue-50"
            >
              <UserPlus className="w-4 h-4" />
              Add team member
            </button>
          )}
        </div>
      )}
    </div>
  )
}
