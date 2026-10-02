'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Mail, Plus, Trash2, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Avatar } from '@/components/ui/primitives'
import { Badge } from '@/components/ui/badges'
import { Modal } from '@/components/ui/modal'
import { BILLING_LABELS, SERVICE_STATUS_STYLES } from '@/lib/constants'
import { cn, errorMessage, formatINR } from '@/lib/utils'
import type { BillingType, ClientServiceStatus, Department, EcommerceAccountStatus, Platform, Service } from '@/types/database'

function useMutation() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function run(fn: () => PromiseLike<{ error: unknown }>) {
    setBusy(true)
    setError('')
    const { error } = await fn()
    setBusy(false)
    if (error) setError(errorMessage(error))
    else router.refresh()
    return !error
  }
  return { busy, error, run }
}

const ErrorLine = ({ error }: { error: string }) => (error ? <p className="px-5 pb-3 text-xs text-red-600">{error}</p> : null)

// ─── E-commerce accounts (renamed from client_platforms, migration 013) ────
// A client can have several accounts on the same platform (e.g. two Amazon sellers).
export type EcommerceAccountRow = {
  id: string; platform_id: string; account_name: string; seller_id: string | null; status: EcommerceAccountStatus
}

export function EcommerceAccountsEditor({
  clientId, rows, platforms, editable,
}: { clientId: string; rows: EcommerceAccountRow[]; platforms: Platform[]; editable: boolean }) {
  const { busy, error, run } = useMutation()
  const [platformId, setPlatformId] = useState('')
  const [accountName, setAccountName] = useState('')
  const [sellerId, setSellerId] = useState('')
  const byId = Object.fromEntries(platforms.map(p => [p.id, p]))
  const supabase = createClient()

  return (
    <div>
      {rows.length === 0 && <p className="px-5 py-4 text-sm text-slate-400">No e-commerce accounts yet.</p>}
      <ul className="divide-y divide-slate-100">
        {rows.map(r => (
          <li key={r.id} className="flex items-center gap-3 px-5 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-800">{r.account_name}</p>
              <p className="text-xs text-slate-400">{byId[r.platform_id]?.name ?? '—'}{r.seller_id ? ` · ${r.seller_id}` : ''}</p>
            </div>
            {editable ? (
              <select value={r.status} disabled={busy}
                      onChange={e => run(() => supabase.from('ecommerce_accounts').update({ status: e.target.value }).eq('id', r.id))}
                      className={cn('rounded-md border-0 py-0.5 pl-2 pr-7 text-xs font-medium ring-1 ring-inset',
                        r.status === 'active' ? 'bg-lime-50 text-lime-700 ring-lime-200' : 'bg-slate-100 text-slate-500 ring-slate-200')}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            ) : (
              <Badge className={r.status === 'active' ? 'bg-lime-50 text-lime-700 ring-lime-200' : 'bg-slate-100 text-slate-500 ring-slate-200'}>{r.status}</Badge>
            )}
            {editable && (
              <button disabled={busy} onClick={() => run(() => supabase.from('ecommerce_accounts').delete().eq('id', r.id))}
                      className="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-600" aria-label="Remove account" title="Remove account">
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </li>
        ))}
      </ul>
      <ErrorLine error={error} />
      {editable && (
        <div className="flex flex-wrap gap-2 border-t border-slate-100 px-5 py-3">
          <select className="input h-9 w-32 py-1.5" value={platformId} onChange={e => setPlatformId(e.target.value)}>
            <option value="">Platform…</option>
            {platforms.filter(p => p.is_active).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input className="input h-9 flex-1" placeholder="Account name (e.g. ABC Amazon Seller 2)" value={accountName} onChange={e => setAccountName(e.target.value)} />
          <input className="input h-9 w-32" placeholder="Seller ID" value={sellerId} onChange={e => setSellerId(e.target.value)} />
          <Button size="sm" variant="secondary" disabled={!platformId || !accountName.trim()} loading={busy}
                  onClick={async () => {
                    const ok = await run(() => supabase.from('ecommerce_accounts').insert({
                      client_id: clientId, platform_id: platformId, account_name: accountName.trim(), seller_id: sellerId.trim() || null,
                    }))
                    if (ok) { setPlatformId(''); setAccountName(''); setSellerId('') }
                  }}>
            <Plus className="h-3.5 w-3.5" /> Add
          </Button>
        </div>
      )}
    </div>
  )
}

// ─── Services (with admin-set price, migration 015) ──────────
export type ClientServiceRow = {
  id: string; service_id: string | null; custom_name: string | null; status: ClientServiceStatus
  ecommerce_account_id: string | null; agreed_price: number | null; currency: string; billing_type: BillingType
}

export function ClientServicesEditor({
  clientId, rows, services, accounts, editable,
}: { clientId: string; rows: ClientServiceRow[]; services: Service[]; accounts: EcommerceAccountRow[]; editable: boolean }) {
  const { busy, error, run } = useMutation()
  const [adding, setAdding] = useState('')
  const [custom, setCustom] = useState('')
  const [accountId, setAccountId] = useState('')
  const [price, setPrice] = useState('')
  const [billing, setBilling] = useState<BillingType>('monthly')
  const byId = Object.fromEntries(services.map(s => [s.id, s]))
  const accountName = Object.fromEntries(accounts.map(a => [a.id, a.account_name]))
  const supabase = createClient()

  return (
    <div>
      {rows.length === 0 && <p className="px-5 py-4 text-sm text-slate-400">No services yet.</p>}
      <ul className="divide-y divide-slate-100">
        {rows.map(r => (
          <li key={r.id} className="flex items-center gap-3 px-5 py-3">
            <div className="min-w-0 flex-1">
              <span className="text-sm text-slate-800">
                {r.service_id ? byId[r.service_id]?.name : r.custom_name}
                {!r.service_id && <span className="ml-2 text-xs text-slate-400">(custom)</span>}
              </span>
              <p className="text-xs text-slate-400">
                {r.ecommerce_account_id ? accountName[r.ecommerce_account_id] ?? 'account' : 'Whole account'}
                {r.agreed_price != null && ` · ${formatINR(r.agreed_price)} ${BILLING_LABELS[r.billing_type]}`}
              </p>
            </div>
            {editable ? (
              <select value={r.status} disabled={busy}
                      onChange={e => run(() => supabase.from('client_services').update({ status: e.target.value }).eq('id', r.id))}
                      className={cn('rounded-md border-0 py-0.5 pl-2 pr-7 text-xs font-medium ring-1 ring-inset', SERVICE_STATUS_STYLES[r.status])}>
                <option value="requested">Requested</option>
                <option value="active">Active</option>
                <option value="stopped">Stopped</option>
              </select>
            ) : (
              <Badge className={cn('capitalize', SERVICE_STATUS_STYLES[r.status])}>{r.status}</Badge>
            )}
          </li>
        ))}
      </ul>
      <ErrorLine error={error} />
      {editable && (
        <div className="space-y-2 border-t border-slate-100 px-5 py-3">
          <div className="flex flex-wrap gap-2">
            <select className="input h-9 flex-1 py-1.5" value={adding} onChange={e => setAdding(e.target.value)}>
              <option value="">Service…</option>
              {services.filter(s => s.is_active).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <input className="input h-9 flex-1" placeholder="…or type a custom one" value={custom} onChange={e => setCustom(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2">
            <select className="input h-9 w-40 py-1.5" value={accountId} onChange={e => setAccountId(e.target.value)}>
              <option value="">Whole client</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.account_name}</option>)}
            </select>
            <input className="input h-9 w-28" type="number" min="0" placeholder="Price ₹" value={price} onChange={e => setPrice(e.target.value)} />
            <select className="input h-9 w-28 py-1.5" value={billing} onChange={e => setBilling(e.target.value as BillingType)}>
              <option value="monthly">Monthly</option>
              <option value="one_time">One-time</option>
              <option value="per_task">Per task</option>
            </select>
            <Button size="sm" variant="secondary" disabled={!adding && !custom.trim()} loading={busy}
                    onClick={async () => {
                      const ok = await run(() => supabase.from('client_services').insert({
                        client_id: clientId,
                        service_id: adding || null,
                        custom_name: adding ? null : custom.trim(),
                        ecommerce_account_id: accountId || null,
                        agreed_price: price ? Number(price) : null,
                        billing_type: billing,
                        status: 'active',
                      }))
                      if (ok) { setAdding(''); setCustom(''); setAccountId(''); setPrice(''); setBilling('monthly') }
                    }}>
              <Plus className="h-3.5 w-3.5" /> Add
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Team (who handles this client, per department) ──────────
export type ClientTeamRow = { profile_id: string; department_id: string }

export function ClientTeamEditor({
  clientId, rows, people, departments, editableDepartmentIds,
}: {
  clientId: string
  rows: ClientTeamRow[]
  people: { id: string; name: string; departmentIds: string[] }[]
  departments: Department[]
  editableDepartmentIds: string[]   // super admin: all; manager: their departments
}) {
  const { busy, error, run } = useMutation()
  const [dept, setDept] = useState('')
  const [person, setPerson] = useState('')
  const supabase = createClient()
  const names = Object.fromEntries(people.map(p => [p.id, p.name]))
  const deptName = Object.fromEntries(departments.map(d => [d.id, d.name]))
  const editableDepts = departments.filter(d => editableDepartmentIds.includes(d.id))
  const candidates = people.filter(p => dept && p.departmentIds.includes(dept) && !rows.some(r => r.profile_id === p.id && r.department_id === dept))

  return (
    <div>
      {rows.length === 0 && <p className="px-5 py-4 text-sm text-slate-400">No one assigned yet.</p>}
      <ul className="divide-y divide-slate-100">
        {rows.map(r => (
          <li key={`${r.profile_id}-${r.department_id}`} className="flex items-center gap-3 px-5 py-2.5">
            <Avatar name={names[r.profile_id]} size="sm" />
            <span className="flex-1 text-sm font-medium text-slate-800">{names[r.profile_id] ?? '—'}</span>
            <Badge>{deptName[r.department_id] ?? '—'}</Badge>
            {editableDepartmentIds.includes(r.department_id) && (
              <button disabled={busy} aria-label="Remove"
                      onClick={() => run(() => supabase.from('client_team').delete()
                        .eq('client_id', clientId).eq('profile_id', r.profile_id).eq('department_id', r.department_id))}
                      className="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-600">
                <X className="h-4 w-4" />
              </button>
            )}
          </li>
        ))}
      </ul>
      <ErrorLine error={error} />
      {editableDepts.length > 0 && (
        <div className="flex flex-wrap gap-2 border-t border-slate-100 px-5 py-3">
          <select className="input h-9 flex-1 py-1.5" value={dept} onChange={e => { setDept(e.target.value); setPerson('') }}>
            <option value="">Department…</option>
            {editableDepts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select className="input h-9 flex-1 py-1.5" value={person} onChange={e => setPerson(e.target.value)} disabled={!dept}>
            <option value="">{dept && candidates.length === 0 ? 'No one in this department' : 'Person…'}</option>
            {candidates.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <Button size="sm" variant="secondary" disabled={!dept || !person} loading={busy}
                  onClick={async () => {
                    if (await run(() => supabase.from('client_team').insert({ client_id: clientId, profile_id: person, department_id: dept }))) setPerson('')
                  }}>
            <Plus className="h-3.5 w-3.5" /> Assign
          </Button>
        </div>
      )}
    </div>
  )
}

// ─── Approval (self-signups) ─────────────────────────────────
export function ApprovalActions({ clientId, hasAgreement }: { clientId: string; hasAgreement: boolean }) {
  const { busy, error, run } = useMutation()
  const supabase = createClient()
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" disabled={busy}
                onClick={() => run(() => supabase.rpc('approve_client', { p_client_id: clientId, p_approve: false }))}>
          <X className="h-3.5 w-3.5" /> Reject
        </Button>
        <Button size="sm" variant="lime" loading={busy} disabled={!hasAgreement}
                onClick={() => run(() => supabase.rpc('approve_client', { p_client_id: clientId, p_approve: true }))}>
          <Check className="h-3.5 w-3.5" /> Approve
        </Button>
      </div>
      {!hasAgreement && <span className="text-xs text-amber-700">Waiting for the client to accept the agreement</span>}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  )
}

// ─── Status (suspend / reactivate) ───────────────────────────
export function ClientStatusSelect({ clientId, ownerId, status }: { clientId: string; ownerId: string | null; status: string }) {
  const { busy, error, run } = useMutation()
  const supabase = createClient()
  async function change(next: string) {
    await run(async () => {
      const r1 = await supabase.from('clients').update({ status: next }).eq('id', clientId)
      if (r1.error || !ownerId) return r1
      return supabase.from('profiles').update({ status: next }).eq('id', ownerId)
    })
  }
  return (
    <span className="inline-flex flex-col items-end">
      <select className="input h-8 w-auto py-1 text-xs" value={status} disabled={busy} onChange={e => change(e.target.value)}>
        <option value="active">Active</option>
        <option value="suspended">Suspended</option>
        <option value="pending">Pending</option>
        <option value="rejected">Rejected</option>
      </select>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  )
}

// ─── Give an existing client a portal login ──────────────────
export function InviteLoginButton({ clientId, email, name }: { clientId: string; email: string | null; name: string | null }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ email: email ?? '', full_name: name ?? '' })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)

  async function send(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    const res = await fetch('/api/admin/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'client', client_id: clientId, ...form }),
    })
    const data = await res.json()
    setBusy(false)
    if (!res.ok) return setMsg({ tone: 'err', text: data.error })
    setMsg({ tone: 'ok', text: `Invite sent to ${form.email}.` })
    router.refresh()
  }

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}><Mail className="h-3.5 w-3.5" /> Invite to portal</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Invite to client portal"
             description="They'll get an email to set a password, then accept the agreement.">
        <form onSubmit={send} className="space-y-4">
          {msg && <p className={cn('rounded-lg px-3 py-2 text-sm', msg.tone === 'ok' ? 'bg-lime-50 text-lime-800' : 'bg-red-50 text-red-700')}>{msg.text}</p>}
          <div>
            <label className="label">Name</label>
            <input className="input" value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} />
          </div>
          <div>
            <label className="label">Email *</label>
            <input className="input" type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Close</Button>
            <Button type="submit" loading={busy}>Send invite</Button>
          </div>
        </form>
      </Modal>
    </>
  )
}
