'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Alert, Field } from '@/components/ui/primitives'
import { HealthBar } from '@/components/clients/HealthBar'
import { errorMessage } from '@/lib/utils'
import type { BillingType, Client, ClientInternal, Platform, Service } from '@/types/database'

let draftKeySeq = 0
const newDraftKey = () => `d${++draftKeySeq}`

type AccountDraft = { key: string; platform_id: string; account_name: string; seller_id: string }
type ServiceDraft = { key: string; service_id: string; custom_name: string; account_key: string; price: string; billing_type: BillingType }

/**
 * Create (super admin) or edit a client. Creating also lets the admin decide the
 * e-commerce accounts, services and price right away — the client only ever sees
 * these as read-only, in the agreement they accept at onboarding (never a picker).
 * Editing existing accounts/services/pricing happens on the client detail page instead.
 */
export function ClientFormModal({
  client, internal, canEditInternal, platforms = [], services = [],
}: { client?: Client; internal?: ClientInternal | null; canEditInternal: boolean; platforms?: Platform[]; services?: Service[] }) {
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
    health_score:        String(internal?.health_score ?? 70),
    contract_start:      internal?.contract_start ?? '',
    contract_end:        internal?.contract_end ?? '',
    monthly_retainer:    internal?.monthly_retainer != null ? String(internal.monthly_retainer) : '',
    notes:               internal?.notes ?? '',
    send_invite:         true,
  })
  const [accountDrafts, setAccountDrafts] = useState<AccountDraft[]>([])
  const [serviceDrafts, setServiceDrafts] = useState<ServiceDraft[]>([])
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm(f => ({ ...f, [k]: v }))

  const addAccount = () => setAccountDrafts(d => [...d, { key: newDraftKey(), platform_id: '', account_name: '', seller_id: '' }])
  const updateAccount = (key: string, patch: Partial<AccountDraft>) => setAccountDrafts(d => d.map(a => a.key === key ? { ...a, ...patch } : a))
  const removeAccount = (key: string) => {
    setAccountDrafts(d => d.filter(a => a.key !== key))
    setServiceDrafts(d => d.map(s => s.account_key === key ? { ...s, account_key: '' } : s))
  }

  const addService = () => setServiceDrafts(d => [...d, { key: newDraftKey(), service_id: '', custom_name: '', account_key: '', price: '', billing_type: 'monthly' }])
  const updateService = (key: string, patch: Partial<ServiceDraft>) => setServiceDrafts(d => d.map(s => s.key === key ? { ...s, ...patch } : s))
  const removeService = (key: string) => setServiceDrafts(d => d.filter(s => s.key !== key))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!isEdit) {
      const seen = new Set<string>()
      for (const s of serviceDrafts) {
        const svcKey = s.service_id || s.custom_name.trim().toLowerCase()
        if (!svcKey) continue
        const comboKey = `${svcKey}::${s.account_key}`
        if (seen.has(comboKey)) {
          return setError('The same service is added twice for the same account (or both "whole client") — remove one before saving.')
        }
        seen.add(comboKey)
      }
    }

    setSaving(true)
    const supabase = createClient()

    const clientPayload = {
      company_name:        form.company_name.trim(),
      gstin:               form.gstin.trim() || null,
      contact_name:        form.contact_name.trim() || null,
      contact_email:       form.contact_email.trim() || null,
      contact_phone:       form.contact_phone.trim() || null,
      whatsapp_group_link: form.whatsapp_group_link.trim() || null,
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

    if (!isEdit) {
      const accountIdByKey: Record<string, string> = {}
      for (const a of accountDrafts) {
        if (!a.platform_id || !a.account_name.trim()) continue
        const { data, error } = await supabase.from('ecommerce_accounts').insert({
          client_id: clientId, platform_id: a.platform_id, account_name: a.account_name.trim(), seller_id: a.seller_id.trim() || null,
        }).select('id').single()
        if (error) return fail(error)
        accountIdByKey[a.key] = data.id
      }
      for (const s of serviceDrafts) {
        if (!s.service_id && !s.custom_name.trim()) continue
        const { error } = await supabase.from('client_services').insert({
          client_id: clientId,
          service_id: s.service_id || null,
          custom_name: s.service_id ? null : s.custom_name.trim(),
          ecommerce_account_id: s.account_key ? accountIdByKey[s.account_key] ?? null : null,
          agreed_price: s.price ? Number(s.price) : null,
          billing_type: s.billing_type,
          status: 'active',
        })
        if (error) return fail(error)
      }
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
          </div>

          {!isEdit && (
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">E-commerce accounts</p>
              <p className="mb-3 text-xs text-slate-500">Shown to the client as read-only, once they accept the agreement.</p>
              {accountDrafts.map(a => (
                <div key={a.key} className="mb-2 flex flex-wrap items-center gap-2">
                  <select className="input h-9 w-32 py-1.5" value={a.platform_id} onChange={e => updateAccount(a.key, { platform_id: e.target.value })}>
                    <option value="">Platform…</option>
                    {platforms.filter(p => p.is_active).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <input className="input h-9 flex-1" placeholder="Account name (e.g. ABC Amazon Seller)" value={a.account_name}
                         onChange={e => updateAccount(a.key, { account_name: e.target.value })} />
                  <input className="input h-9 w-28" placeholder="Seller ID" value={a.seller_id} onChange={e => updateAccount(a.key, { seller_id: e.target.value })} />
                  <button type="button" onClick={() => removeAccount(a.key)} className="rounded p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-600" aria-label="Remove account">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <Button type="button" size="sm" variant="secondary" onClick={addAccount}><Plus className="h-3.5 w-3.5" /> Add account</Button>
            </div>
          )}

          {!isEdit && (
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Services & pricing</p>
              <p className="mb-3 text-xs text-slate-500">The client sees this price in the agreement — it won't change if the service's default price changes later.</p>
              {serviceDrafts.map(s => (
                <div key={s.key} className="mb-2 flex flex-wrap items-center gap-2">
                  <select className="input h-9 w-40 py-1.5" value={s.service_id} onChange={e => updateService(s.key, { service_id: e.target.value })}>
                    <option value="">Service…</option>
                    {services.filter(sv => sv.is_active).map(sv => <option key={sv.id} value={sv.id}>{sv.name}</option>)}
                  </select>
                  {!s.service_id && (
                    <input className="input h-9 w-40" placeholder="…or custom name" value={s.custom_name} onChange={e => updateService(s.key, { custom_name: e.target.value })} />
                  )}
                  <select className="input h-9 w-36 py-1.5" value={s.account_key} onChange={e => updateService(s.key, { account_key: e.target.value })}>
                    <option value="">Whole client</option>
                    {accountDrafts.filter(a => a.account_name.trim()).map(a => <option key={a.key} value={a.key}>{a.account_name}</option>)}
                  </select>
                  <input className="input h-9 w-24" type="number" min="0" placeholder="Price ₹" value={s.price} onChange={e => updateService(s.key, { price: e.target.value })} />
                  <select className="input h-9 w-28 py-1.5" value={s.billing_type} onChange={e => updateService(s.key, { billing_type: e.target.value as BillingType })}>
                    <option value="monthly">Monthly</option>
                    <option value="one_time">One-time</option>
                    <option value="per_task">Per task</option>
                  </select>
                  <button type="button" onClick={() => removeService(s.key)} className="rounded p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-600" aria-label="Remove service">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <Button type="button" size="sm" variant="secondary" onClick={addService}><Plus className="h-3.5 w-3.5" /> Add service</Button>
            </div>
          )}

          {canEditInternal && (
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Internal — never shown to the client</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Monthly retainer (₹)"><input className="input" type="number" min="0" value={form.monthly_retainer} onChange={e => set('monthly_retainer', e.target.value)} /></Field>
                <Field label="Health score" className="sm:col-span-2">
                  <HealthBar score={Number(form.health_score) || 0} />
                  <input type="range" min="0" max="100" value={form.health_score}
                         onChange={e => set('health_score', e.target.value)}
                         className="mt-2 w-full cursor-pointer" />
                </Field>
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
                <span className="block text-slate-500">They set a password, accept the agreement, and can raise tickets — no approval step needed.</span>
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
