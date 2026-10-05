'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Flame, HelpCircle, Paperclip, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Alert, Field } from '@/components/ui/primitives'
import { TICKET_CATEGORIES, TICKET_CATEGORY_BY_VALUE, type TicketFieldDef, type TicketFieldShowIf } from '@/lib/ticket-categories'
import { cn, errorMessage } from '@/lib/utils'
import type { TaskPriority, Ticket, TicketCategory } from '@/types/database'

type Account = { id: string; account_name: string; platform_name: string; client_id?: string }
type PlatformOption = { id: string; name: string }
type ClientOption = { id: string; company_name: string }

const PRIORITIES: { value: TaskPriority; label: string; hint: string }[] = [
  { value: 'P1', label: 'Critical', hint: 'Sales are blocked' },
  { value: 'P2', label: 'High',     hint: 'Needed in 1–2 days' },
  { value: 'P3', label: 'Normal',   hint: 'This week' },
  { value: 'P4', label: 'Low',      hint: 'Whenever possible' },
]

/**
 * Create a ticket, or edit one while it's still open (category can't change — the DB enforces both).
 * Pass `clients` when staff are creating a ticket on a client's behalf (/tickets/new) — it adds a
 * Client picker, scopes the E-commerce account list to the chosen client, and sends client_id along
 * (clients themselves never pass this — their ticket's client_id is set by the DB from their own profile).
 */
export function PortalTicketForm({ ticket, accounts, platforms, clients, meId, hrefBase = '/portal/tickets' }: {
  ticket?: Ticket; accounts: Account[]; platforms: PlatformOption[]; clients?: ClientOption[]; meId: string; hrefBase?: string
}) {
  const router = useRouter()
  const isEdit = !!ticket
  const [category] = useState<TicketCategory | ''>(ticket?.category ?? '')
  const [pickedCategory, setPickedCategory] = useState<TicketCategory | ''>('')
  const [clientId, setClientId] = useState(ticket?.client_id ?? '')
  const [accountId, setAccountId] = useState(ticket?.ecommerce_account_id ?? '')
  const [subject, setSubject] = useState(ticket?.subject ?? '')
  const [description, setDescription] = useState(ticket?.description ?? '')
  const [priority, setPriority] = useState<TaskPriority | ''>(ticket?.priority ?? '')
  const [isUrgent, setIsUrgent] = useState(ticket?.is_urgent ?? false)
  const [details, setDetails] = useState<Record<string, string>>((ticket?.details as Record<string, string>) ?? {})
  const [files, setFiles] = useState<{ file: File; label?: string }[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showGuide, setShowGuide] = useState(false)
  const submittingRef = useRef(false)  // synchronous guard — `saving` state only updates on next render, too late for a fast double-click

  const activeCategory = isEdit ? category : pickedCategory
  const def = activeCategory ? TICKET_CATEGORY_BY_VALUE[activeCategory] : null
  const setField = (k: string, v: string) => setDetails(d => ({ ...d, [k]: v }))
  const isVisible = (showIf?: TicketFieldShowIf) => !showIf || details[showIf.key] === showIf.equals

  function renderField(f: TicketFieldDef) {
    return (
      <Field key={f.key} label={f.label} required={f.required} className={f.type === 'textarea' ? 'sm:col-span-2' : undefined}>
        {f.type === 'textarea' ? (
          <textarea className="input min-h-[90px]" value={details[f.key] ?? ''} placeholder={f.placeholder}
                    onChange={e => setField(f.key, e.target.value)} />
        ) : f.type === 'select' ? (
          <select className="input" value={details[f.key] ?? ''} onChange={e => setField(f.key, e.target.value)}>
            <option value="">Select…</option>
            {f.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ) : f.type === 'platform' ? (
          <select className="input" value={details[f.key] ?? ''} onChange={e => setField(f.key, e.target.value)}>
            <option value="">Select a platform…</option>
            {platforms.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        ) : (
          <input className="input" type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : f.type === 'password' ? 'password' : 'text'}
                 value={details[f.key] ?? ''} placeholder={f.placeholder} onChange={e => setField(f.key, e.target.value)}
                 autoComplete={f.type === 'password' ? 'new-password' : undefined} />
        )}
      </Field>
    )
  }
  const descriptionRequired = !!def && (def.descriptionRequired || isVisible(def.descriptionRequiredIf) && !!def.descriptionRequiredIf)
  const accountMode = def?.needsEcommerceAccountIf && isVisible(def.needsEcommerceAccountIf)
    ? def.needsEcommerceAccountIf.mode
    : def?.needsEcommerceAccount ?? 'hidden'
  const scopedAccounts = clients ? accounts.filter(a => a.client_id === clientId) : accounts

  async function uploadAttachments(ticketId: string, supabase: ReturnType<typeof createClient>) {
    for (const { file, label } of files) {
      const fileName = label ? `[${label}] ${file.name}` : file.name
      const path = `${ticketId}/${Date.now()}-${file.name}`
      const { error: upErr } = await supabase.storage.from('ticket-files').upload(path, file)
      if (upErr) continue  // best-effort: don't block the whole submission on one failed file
      await supabase.from('ticket_attachments').insert({
        ticket_id: ticketId, uploaded_by: meId, storage_path: path, file_name: fileName, mime_type: file.type || null, size_bytes: file.size,
      })
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (submittingRef.current) return
    if (!def) return
    if (clients && !clientId) return setError('Select a client for this ticket.')
    if (accountMode === 'required' && !accountId) return setError('Select an e-commerce account for this ticket.')
    for (const f of def.fields) {
      if (isVisible(f.showIf) && f.required && !(details[f.key] ?? '').trim()) return setError(`Please fill in "${f.label}".`)
    }
    if (descriptionRequired && !description.trim()) return setError('Please add a description.')
    if (!subject.trim()) return setError('Please add a subject.')

    submittingRef.current = true
    setSaving(true)
    setError('')
    const payload = {
      subject: subject.trim(),
      description: description.trim() || null,
      ecommerce_account_id: accountId || null,
      priority: priority || null,
      is_urgent: isUrgent,
      details,
      ...(clients ? { client_id: clientId } : {}),
    }
    const supabase = createClient()
    const { data, error } = isEdit
      ? await supabase.from('tickets').update(payload).eq('id', ticket!.id).select('id').single()
      : await supabase.from('tickets').insert({ ...payload, category: activeCategory }).select('id').single()
    if (error) {
      submittingRef.current = false
      setSaving(false)
      return setError(errorMessage(error))
    }
    if (files.length > 0) await uploadAttachments(data.id, supabase)
    setSaving(false)
    router.push(`${hrefBase}/${data.id}`)
    router.refresh()
    // submittingRef intentionally left true — we're navigating away, no need to re-arm the form
  }

  return (
    <form onSubmit={submit} className="card space-y-6 p-6">
      {error && <Alert>{error}</Alert>}

      {clients && (
        isEdit ? (
          <Field label="Client"><p className="text-sm font-medium text-slate-800">{clients.find(c => c.id === clientId)?.company_name ?? '—'}</p></Field>
        ) : (
          <Field label="Client" required>
            <select className="input" value={clientId} onChange={e => { setClientId(e.target.value); setAccountId('') }}>
              <option value="">Select client…</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
            </select>
          </Field>
        )
      )}

      {isEdit ? (
        <Field label="Category"><p className="text-sm font-medium text-slate-800">{def?.label} — can't be changed after submitting</p></Field>
      ) : (
        <Field label="What kind of ticket is this?" required>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {TICKET_CATEGORIES.map(c => (
              <button key={c.value} type="button" onClick={() => { setPickedCategory(c.value); setDetails({}) }}
                      className={cn('rounded-lg border px-3 py-2 text-left transition',
                        pickedCategory === c.value ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500' : 'border-slate-200 hover:bg-slate-50')}>
                <span className="block text-sm font-semibold text-slate-900">{c.label}</span>
                <span className="block text-xs text-slate-500">{c.hint}</span>
              </button>
            ))}
          </div>
        </Field>
      )}

      {def && (
        <>
          <Field label="Subject" required>
            <input className="input" required autoFocus value={subject} onChange={e => setSubject(e.target.value)}
                   placeholder="Short summary of your ticket" />
          </Field>

          {scopedAccounts.length > 0 && accountMode !== 'hidden' && (
            <Field label="E-commerce account" required={accountMode === 'required'}>
              <select className="input" value={accountId} onChange={e => setAccountId(e.target.value)}>
                <option value="">{accountMode === 'required' ? 'Select account…' : 'Not specific'}</option>
                {scopedAccounts.map(a => <option key={a.id} value={a.id}>{a.platform_name} · {a.account_name}</option>)}
              </select>
            </Field>
          )}

          {def.fields.some(f => isVisible(f.showIf) && f.slot === 'early') && (
            <div className="grid gap-4 sm:grid-cols-2">
              {def.fields.filter(f => isVisible(f.showIf) && f.slot === 'early').map(f => renderField(f))}
            </div>
          )}

          {(def.guide || def.guideUrl) && (
            <div className="flex flex-wrap items-center gap-3">
              {def.guide && (
                <button type="button" onClick={() => setShowGuide(s => !s)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:text-brand-800">
                  <HelpCircle className="h-3.5 w-3.5" /> {showGuide ? 'Hide guide' : 'See guide'}
                </button>
              )}
              {def.guideUrl && (
                <a href={def.guideUrl} target="_blank" rel="noopener noreferrer"
                   className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:text-brand-800">
                  <FileText className="h-3.5 w-3.5" /> View listing guideline (PDF)
                </a>
              )}
              {def.guide && showGuide && (
                <p className="w-full rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-800">{def.guide}</p>
              )}
            </div>
          )}

          {def.fields.some(f => isVisible(f.showIf) && (f.slot ?? 'default') === 'default') && (
            <div className="grid gap-4 sm:grid-cols-2">
              {def.fields.filter(f => isVisible(f.showIf) && (f.slot ?? 'default') === 'default').map(f => renderField(f))}
            </div>
          )}

          {def.fileFields?.filter(ff => isVisible(ff.showIf)).map(ff => (
            <Field key={ff.key} label={ff.label}>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-500 hover:bg-slate-50">
                <Paperclip className="h-4 w-4" />
                Choose file…
                <input type="file" multiple className="hidden"
                       onChange={e => setFiles(fs => [...fs, ...Array.from(e.target.files ?? []).map(file => ({ file, label: ff.label }))])} />
              </label>
              {files.some(f => f.label === ff.label) && (
                <ul className="mt-2 space-y-1">
                  {files.map((f, i) => f.label === ff.label && (
                    <li key={i} className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-3 py-1.5 text-xs text-slate-600">
                      <span className="truncate">{f.file.name}</span>
                      <button type="button" onClick={() => setFiles(fs => fs.filter((_, j) => j !== i))} aria-label={`Remove ${f.file.name}`}>
                        <X className="h-3.5 w-3.5 text-slate-400 hover:text-red-600" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Field>
          ))}

          {def.hasAttachments && !(def.hideAttachmentsIf && isVisible(def.hideAttachmentsIf)) && (
            <Field label="Attachments" hint="Screenshots, spreadsheets, exports — anything that helps us understand the ticket.">
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-500 hover:bg-slate-50">
                <Paperclip className="h-4 w-4" />
                Choose files…
                <input type="file" multiple className="hidden"
                       onChange={e => setFiles(fs => [...fs, ...Array.from(e.target.files ?? []).map(file => ({ file }))])} />
              </label>
              {files.some(f => !f.label) && (
                <ul className="mt-2 space-y-1">
                  {files.map((f, i) => !f.label && (
                    <li key={i} className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-3 py-1.5 text-xs text-slate-600">
                      <span className="truncate">{f.file.name}</span>
                      <button type="button" onClick={() => setFiles(fs => fs.filter((_, j) => j !== i))} aria-label={`Remove ${f.file.name}`}>
                        <X className="h-3.5 w-3.5 text-slate-400 hover:text-red-600" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Field>
          )}

          {def.fields.some(f => isVisible(f.showIf) && f.slot === 'late') && (
            <div className="grid gap-4 sm:grid-cols-2">
              {def.fields.filter(f => isVisible(f.showIf) && f.slot === 'late').map(f => renderField(f))}
            </div>
          )}

          {!def.hideDescription && (
            <Field label={def.descriptionLabel ?? 'Description'} required={descriptionRequired} hint="Anything else that helps us move faster.">
              <textarea className="input min-h-[110px]" value={description} onChange={e => setDescription(e.target.value)} />
            </Field>
          )}

          {!def.hidePriority && (
            <Field label="Priority" hint="Optional — leave it blank and our team will triage it.">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {PRIORITIES.map(p => (
                  <button key={p.value} type="button" onClick={() => setPriority(p.value)}
                          className={cn('rounded-lg border px-3 py-2 text-left transition',
                            priority === p.value ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500' : 'border-slate-200 hover:bg-slate-50')}>
                    <span className="block text-sm font-semibold text-slate-900">{p.label}</span>
                    <span className="block text-xs text-slate-500">{p.hint}</span>
                  </button>
                ))}
              </div>
            </Field>
          )}

          {!def.hideUrgent && (
            <label className={cn('flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition',
              isUrgent ? 'border-red-300 bg-red-50' : 'border-slate-200 hover:bg-slate-50')}>
              <input type="checkbox" checked={isUrgent} onChange={e => setIsUrgent(e.target.checked)}
                     className="mt-0.5 h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-500" />
              <span className="text-sm">
                <span className={cn('flex items-center gap-1.5 font-semibold', isUrgent ? 'text-red-800' : 'text-slate-800')}>
                  <Flame className="h-4 w-4" /> This is urgent
                </span>
                <span className="block text-slate-500">Puts it in front of any available team member right away, not just your account manager.</span>
              </span>
            </label>
          )}
        </>
      )}

      <div className="flex justify-end gap-2 border-t border-slate-100 pt-5">
        <Button type="button" variant="secondary" onClick={() => router.back()}>Cancel</Button>
        <Button type="submit" loading={saving} disabled={!activeCategory}>{isEdit ? 'Save changes' : 'Submit ticket'}</Button>
      </div>
    </form>
  )
}
