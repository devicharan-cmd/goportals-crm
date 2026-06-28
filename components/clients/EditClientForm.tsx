'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  SERVICE_TYPE_LABELS,
  LIFECYCLE_STAGE_LABELS,
  SERVICE_TYPE_ROLES,
  type ServiceType,
  type LifecycleStage,
  type Platform,
} from '@/types'

const PLATFORMS: Platform[] = ['amazon', 'flipkart', 'myntra', 'blinkit', 'meesho', 'nykaa', 'other']

type Props = {
  client: any
  members: { id: string; name: string; role: string }[]
}

export default function EditClientForm({ client, members }: Props) {
  const router = useRouter()
  const supabase = createClient()

  const [form, setForm] = useState({
    name: client.name ?? '',
    industry: client.industry ?? '',
    service_type: client.service_type as ServiceType,
    lifecycle_stage: client.lifecycle_stage as LifecycleStage,
    contact_name: client.contact_name ?? '',
    contact_email: client.contact_email ?? '',
    contact_phone: client.contact_phone ?? '',
    contract_start: client.contract_start ?? '',
    contract_end: client.contract_end ?? '',
    monthly_retainer: client.monthly_retainer?.toString() ?? '',
    primary_member_id: client.primary_member_id ?? '',
    secondary_member_id: client.secondary_member_id ?? '',
    platforms: (client.platforms ?? []) as Platform[],
    notes: client.notes ?? '',
    health_score: client.health_score?.toString() ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const roles = SERVICE_TYPE_ROLES[form.service_type]

  function togglePlatform(p: Platform) {
    setForm(f => ({
      ...f,
      platforms: f.platforms.includes(p)
        ? f.platforms.filter(x => x !== p)
        : [...f.platforms, p],
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')

    const { error } = await supabase
      .from('clients')
      .update({
        name: form.name,
        industry: form.industry || null,
        service_type: form.service_type,
        lifecycle_stage: form.lifecycle_stage,
        contact_name: form.contact_name || null,
        contact_email: form.contact_email || null,
        contact_phone: form.contact_phone || null,
        contract_start: form.contract_start || null,
        contract_end: form.contract_end || null,
        monthly_retainer: form.monthly_retainer ? parseFloat(form.monthly_retainer) : null,
        primary_member_id: form.primary_member_id || null,
        secondary_member_id: form.secondary_member_id || null,
        primary_work_role: form.primary_member_id ? roles.primary : null,
        secondary_work_role: form.secondary_member_id ? roles.secondary : null,
        platforms: form.platforms,
        notes: form.notes || null,
        health_score: form.health_score ? parseInt(form.health_score) : null,
      })
      .eq('id', client.id)

    if (error) {
      setError(error.message)
      setSaving(false)
    } else {
      router.push(`/clients/${client.id}`)
      router.refresh()
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
      {/* Basic Info */}
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Brand Name *</label>
          <input
            type="text"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Industry</label>
          <input
            type="text"
            value={form.industry}
            onChange={e => setForm(f => ({ ...f, industry: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="e.g. Fashion, FMCG"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Service Type *</label>
          <select
            value={form.service_type}
            onChange={e => setForm(f => ({ ...f, service_type: e.target.value as ServiceType }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {Object.entries(SERVICE_TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Lifecycle Stage</label>
          <select
            value={form.lifecycle_stage}
            onChange={e => setForm(f => ({ ...f, lifecycle_stage: e.target.value as LifecycleStage }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {Object.entries(LIFECYCLE_STAGE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Health Score (0–100)</label>
          <input
            type="number"
            min="0"
            max="100"
            value={form.health_score}
            onChange={e => setForm(f => ({ ...f, health_score: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Platforms */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Platforms</label>
        <div className="flex flex-wrap gap-2">
          {PLATFORMS.map(p => (
            <button
              key={p}
              type="button"
              onClick={() => togglePlatform(p)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                form.platforms.includes(p)
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Team Assignment */}
      <div className="grid grid-cols-2 gap-4 p-4 bg-blue-50 rounded-lg">
        <h3 className="col-span-2 text-sm font-semibold text-blue-800">
          Team Assignment ({SERVICE_TYPE_LABELS[form.service_type]})
        </h3>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Member 1 — <span className="text-blue-600 capitalize">{roles.primary.replace(/_/g, ' ')}</span>
          </label>
          <select
            value={form.primary_member_id}
            onChange={e => setForm(f => ({ ...f, primary_member_id: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select member</option>
            {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Member 2 — <span className="text-blue-600 capitalize">{roles.secondary.replace(/_/g, ' ')}</span>
          </label>
          <select
            value={form.secondary_member_id}
            onChange={e => setForm(f => ({ ...f, secondary_member_id: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select member</option>
            {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
      </div>

      {/* Contact */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Contact Name</label>
          <input
            type="text"
            value={form.contact_name}
            onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Contact Email</label>
          <input
            type="email"
            value={form.contact_email}
            onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Contract Start</label>
          <input
            type="date"
            value={form.contract_start}
            onChange={e => setForm(f => ({ ...f, contract_start: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Contract End</label>
          <input
            type="date"
            value={form.contract_end}
            onChange={e => setForm(f => ({ ...f, contract_end: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Monthly Retainer (₹)</label>
          <input
            type="number"
            value={form.monthly_retainer}
            onChange={e => setForm(f => ({ ...f, monthly_retainer: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
        <textarea
          value={form.notes}
          onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
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
