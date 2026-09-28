'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Alert, Field } from '@/components/ui/primitives'
import { STAGE_OPTIONS } from '@/lib/constants'
import { errorMessage } from '@/lib/utils'
import type { Client, ClientInternal, ClientStage } from '@/types/database'

/**
 * Create (super admin) or edit a client. Creating can also send the portal invite
 * so the brand's contact gets a login straight away.
 */
export function ClientFormModal({
  client, internal, canEditInternal,
}: { client?: Client; internal?: ClientInternal | null; canEditInternal: boolean }) {
  const router = useRouter()
  const isEdit = !!client
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    company_name:        client?.company_name ?? '',
    gstin:               client?.gstin ?? '',
    contact_name:        client?.contact_name ?? '',
    contact_email:       client?.contact_email ?? '',
    contact_phone:       client?.contact_phone ?? '',
    whatsapp_group_link: client?.whatsapp_group_link ?? '',
    stage:               (client?.stage ?? 'onboarding') as ClientStage,
    health_score:        String(internal?.health_score ?? 70),
    contract_start:      internal?.contract_start ?? '',
    contract_end:        internal?.contract_end ?? '',
    monthly_retainer:    internal?.monthly_retainer != null ? String(internal.monthly_retainer) : '',
    notes:               internal?.notes ?? '',
    send_invite:         true,
  })
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm(f => ({ ...f, [k]: v }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const supabase = createClient()

    const clientPayload = {
      company_name:        form.company_name.trim(),
      gstin:               form.gstin.trim() || null,
      contact_name:        form.contact_name.trim() || null,
      contact_email:       form.contact_email.trim() || null,
      contact_phone:       form.contact_phone.trim() || null,
      whatsapp_group_link: form.whatsapp_group_link.trim() || null,
      stage:               form.stage,
    }

    let clientId = client?.id
    if (isEdit) {
      const { error } = await supabase.from('clients').update(clientPayload).eq('id', clientId!)
      if (error) return fail(error)
    } else {
      const { data, error } = await supabase.from('clients')
        .insert({ ...clientPayload, signup_source: 'admin_created', status: 'pending' })
        .select('id').single()
      if (error) return fail(error)
      clientId = data.id
    }

    if (canEditInternal) {
      const { error } = await supabase.from('client_internal').update({
        health_score:     Number(form.health_score) || 0,
        contract_start:   form.contract_start || null,
        contract_end:     form.contract_end || null,
        monthly_retainer: form.monthly_retainer ? Number(form.monthly_retainer) : null,
        notes:            form.notes.trim() || null,
      }).eq('client_id', clientId!)
      if (error) return fail(error)
    }

    if (!isEdit && form.send_invite && form.contact_email.trim()) {
      const res = await fetch('/api/admin/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'client', client_id: clientId, email: form.contact_email, full_name: form.contact_name }),
      })
      if (!res.ok) {
        const data = await res.json()
        setSaving(false)
        router.push(`/clients/${clientId}`)
        router.refresh()
        return setError(`Client created, but the invite failed: ${data.error}`)
      }
    }

    setSaving(false)
    setOpen(false)
    if (!isEdit) router.push(`/clients/${clientId}`)
    router.refresh()
  }

  function fail(err: unknown) {
    setError(errorMessage(err))
    setSaving(false)
  }

  return (
    <>
      {isEdit
        ? <Button variant="secondary" size="sm" onClick={() => setOpen(true)}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
        : <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add client</Button>}

      <Modal open={open} onClose={() => setOpen(false)} size="lg"
             title={isEdit ? 'Edit client' : 'Add a client'}
             description={isEdit ? undefined : 'Create the brand and (optionally) email its contact a portal invite.'}>
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && <Alert>{error}</Alert>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Company / brand name" required className="sm:col-span-2">
              <input className="input" required value={form.company_name} onChange={e => set('company_name', e.target.value)} />
            </Field>
            <Field label="Contact name"><input className="input" value={form.contact_name} onChange={e => set('contact_name', e.target.value)} /></Field>
            <Field label="Contact email" required={!isEdit && form.send_invite}>
              <input className="input" type="email" required={!isEdit && form.send_invite} value={form.contact_email} onChange={e => set('contact_email', e.target.value)} />
            </Field>
            <Field label="Phone"><input className="input" value={form.contact_phone} onChange={e => set('contact_phone', e.target.value)} /></Field>
            <Field label="GSTIN"><input className="input uppercase" value={form.gstin} onChange={e => set('gstin', e.target.value)} /></Field>
            <Field label="WhatsApp group link"><input className="input" value={form.whatsapp_group_link} onChange={e => set('whatsapp_group_link', e.target.value)} /></Field>
            <Field label="Stage">
              <select className="input" value={form.stage} onChange={e => set('stage', e.target.value as ClientStage)}>
                {STAGE_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </Field>
          </div>

          {canEditInternal && (
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Internal — never shown to the client</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Monthly retainer (₹)"><input className="input" type="number" min="0" value={form.monthly_retainer} onChange={e => set('monthly_retainer', e.target.value)} /></Field>
                <Field label="Health score (0–100)"><input className="input" type="number" min="0" max="100" value={form.health_score} onChange={e => set('health_score', e.target.value)} /></Field>
                <Field label="Contract start"><input className="input" type="date" value={form.contract_start} onChange={e => set('contract_start', e.target.value)} /></Field>
                <Field label="Contract end"><input className="input" type="date" value={form.contract_end} onChange={e => set('contract_end', e.target.value)} /></Field>
                <Field label="Notes" className="sm:col-span-2"><textarea className="input min-h-[70px]" value={form.notes} onChange={e => set('notes', e.target.value)} /></Field>
              </div>
            </div>
          )}

          {!isEdit && (
            <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3">
              <input type="checkbox" checked={form.send_invite} onChange={e => set('send_invite', e.target.checked)}
                     className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600" />
              <span className="text-sm text-slate-700">
                <span className="font-semibold">Email a portal invite to the contact</span>
                <span className="block text-slate-500">They set a password, accept the agreement, and can raise requests — no approval step needed.</span>
              </span>
            </label>
          )}

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" loading={saving}>{isEdit ? 'Save changes' : 'Create client'}</Button>
          </div>
        </form>
      </Modal>
    </>
  )
}
