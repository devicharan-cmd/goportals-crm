'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Alert, Field } from '@/components/ui/primitives'
import { cn, errorMessage } from '@/lib/utils'
import type { Task, TaskPriority, TaskType } from '@/types/database'

type Option = { id: string; name: string }

const PRIORITIES: { value: TaskPriority; label: string; hint: string }[] = [
  { value: 'P1', label: 'Critical', hint: 'Sales are blocked' },
  { value: 'P2', label: 'High',     hint: 'Needed in 1–2 days' },
  { value: 'P3', label: 'Normal',   hint: 'This week' },
  { value: 'P4', label: 'Low',      hint: 'Whenever possible' },
]
const TYPES: { value: TaskType; label: string }[] = [
  { value: 'request',   label: 'Request' },
  { value: 'issue',     label: 'Problem / issue' },
  { value: 'grievance', label: 'Complaint' },
]

/** Client creates a request, or edits it while it's still open (DB enforces both). */
export function PortalTaskForm({ task, platforms, services }: { task?: Task; platforms: Option[]; services: Option[] }) {
  const router = useRouter()
  const [form, setForm] = useState({
    title:       task?.title ?? '',
    description: task?.description ?? '',
    type:        (task?.type === 'task' ? 'request' : task?.type ?? 'request') as TaskType,
    priority:    (task?.priority ?? 'P3') as TaskPriority,
    platform_id: task?.platform_id ?? '',
    service_id:  task?.service_id ?? '',
    due_date:    task?.due_date ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm(f => ({ ...f, [k]: v }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const common = {
      title:       form.title.trim(),
      description: form.description.trim() || null,
      platform_id: form.platform_id || null,
      service_id:  form.service_id || null,
      due_date:    form.due_date || null,
    }
    const supabase = createClient()
    const { data, error } = task
      ? await supabase.from('tasks').update(common).eq('id', task.id).select('id').single()
      : await supabase.from('tasks').insert({ ...common, type: form.type, priority: form.priority }).select('id').single()
    if (error) {
      setError(errorMessage(error))
      setSaving(false)
      return
    }
    router.push(`/portal/tasks/${data.id}`)
    router.refresh()
  }

  return (
    <form onSubmit={submit} className="card space-y-6 p-6">
      {error && <Alert>{error}</Alert>}
      <Field label="What do you need?" required>
        <input className="input" required value={form.title} onChange={e => set('title', e.target.value)} autoFocus
               placeholder="e.g. Update prices for our Diwali range on Blinkit" />
      </Field>
      <Field label="Details" hint="Links, SKUs, marketplace case IDs — anything that helps us move faster.">
        <textarea className="input min-h-[130px]" value={form.description} onChange={e => set('description', e.target.value)} />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Platform">
          <select className="input" value={form.platform_id} onChange={e => set('platform_id', e.target.value)}>
            <option value="">Not specific</option>
            {platforms.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Service">
          <select className="input" value={form.service_id} onChange={e => set('service_id', e.target.value)}>
            <option value="">Not sure</option>
            {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        {!task && (
          <Field label="Type">
            <select className="input" value={form.type} onChange={e => set('type', e.target.value as TaskType)}>
              {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>
        )}
        <Field label="Needed by" hint="Optional">
          <input type="date" className="input" value={form.due_date} onChange={e => set('due_date', e.target.value)} />
        </Field>
      </div>

      {!task && (
        <Field label="How urgent is it?">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {PRIORITIES.map(p => (
              <button key={p.value} type="button" onClick={() => set('priority', p.value)}
                      className={cn('rounded-lg border px-3 py-2 text-left transition',
                        form.priority === p.value ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500' : 'border-slate-200 hover:bg-slate-50')}>
                <span className="block text-sm font-semibold text-slate-900">{p.label}</span>
                <span className="block text-xs text-slate-500">{p.hint}</span>
              </button>
            ))}
          </div>
        </Field>
      )}

      <div className="flex justify-end gap-2 border-t border-slate-100 pt-5">
        <Button type="button" variant="secondary" onClick={() => router.back()}>Cancel</Button>
        <Button type="submit" loading={saving}>{task ? 'Save changes' : 'Submit request'}</Button>
      </div>
    </form>
  )
}
