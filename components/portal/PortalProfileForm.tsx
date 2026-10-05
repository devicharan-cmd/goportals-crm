'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Alert, Field } from '@/components/ui/primitives'
import { AddressPicker, type AddressValue } from '@/components/shared/AddressPicker'
import { errorMessage } from '@/lib/utils'
import type { Client } from '@/types/database'

/**
 * Client edits their own basic details + address only. Platform/service/price are
 * admin-only — this form never touches them, and the DB (guard_client_update, 017)
 * rejects any other column even if someone tried.
 */
export function PortalProfileForm({ client }: { client: Client }) {
  const router = useRouter()
  const [form, setForm] = useState({
    company_name:        client.company_name,
    gstin:                client.gstin ?? '',
    contact_name:         client.contact_name ?? '',
    contact_email:        client.contact_email ?? '',
    contact_phone:        client.contact_phone ?? '',
    whatsapp_group_link:  client.whatsapp_group_link ?? '',
  })
  const [address, setAddress] = useState<AddressValue>({
    address_line: client.address_line ?? '', city: client.city ?? '', state: client.state ?? '',
    postal_code: client.postal_code ?? '', country: client.country ?? 'India',
    latitude: client.latitude, longitude: client.longitude, place_id: client.place_id, address_source: client.address_source,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSaved(false)
    const { error } = await createClient().from('clients').update({
      company_name:        form.company_name.trim(),
      gstin:                form.gstin.trim() || null,
      contact_name:         form.contact_name.trim() || null,
      contact_email:        form.contact_email.trim() || null,
      contact_phone:        form.contact_phone.trim() || null,
      whatsapp_group_link:  form.whatsapp_group_link.trim() || null,
      address_line: address.address_line.trim() || null,
      city: address.city.trim() || null,
      state: address.state.trim() || null,
      postal_code: address.postal_code.trim() || null,
      country: address.country.trim() || null,
      latitude: address.latitude,
      longitude: address.longitude,
      place_id: address.place_id,
      address_source: address.address_source,
    }).eq('id', client.id)
    setSaving(false)
    if (error) return setError(errorMessage(error))
    setSaved(true)
    router.refresh()
  }

  return (
    <form onSubmit={submit} className="card space-y-6 p-6">
      {error && <Alert>{error}</Alert>}
      {saved && <Alert tone="success">Saved.</Alert>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Company / brand name" required className="sm:col-span-2">
          <input className="input" required value={form.company_name} onChange={e => setForm({ ...form, company_name: e.target.value })} />
        </Field>
        <Field label="Contact name"><input className="input" value={form.contact_name} onChange={e => setForm({ ...form, contact_name: e.target.value })} /></Field>
        <Field label="Contact email"><input className="input" type="email" value={form.contact_email} onChange={e => setForm({ ...form, contact_email: e.target.value })} /></Field>
        <Field label="Phone"><input className="input" value={form.contact_phone} onChange={e => setForm({ ...form, contact_phone: e.target.value })} /></Field>
        <Field label="GSTIN"><input className="input uppercase" value={form.gstin} onChange={e => setForm({ ...form, gstin: e.target.value })} /></Field>
        <Field label="WhatsApp group link" className="sm:col-span-2"><input className="input" value={form.whatsapp_group_link} onChange={e => setForm({ ...form, whatsapp_group_link: e.target.value })} /></Field>
      </div>

      <div className="border-t border-slate-100 pt-5">
        <p className="mb-3 text-sm font-semibold text-slate-800">Business address</p>
        <AddressPicker value={address} onChange={setAddress} />
      </div>

      <p className="text-xs text-slate-400">
        Platforms, services and pricing are set by your GoPortals account manager and can't be changed here.
      </p>

      <div className="flex justify-end border-t border-slate-100 pt-5">
        <Button type="submit" loading={saving}>Save changes</Button>
      </div>
    </form>
  )
}
