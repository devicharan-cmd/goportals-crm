'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Flame } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Alert, Field } from '@/components/ui/primitives'
import { DEADLINE_OPTIONS, PRIORITY_OPTIONS, TYPE_OPTIONS } from '@/lib/constants'
import { cn, dueDateFor, errorMessage } from '@/lib/utils'
import type { Department, DeadlineType, Platform, Service, Task, TaskPriority, TaskType } from '@/types/database'

type Option = { id: string; name: string }

export type TaskFormProps = {
  mode: 'create' | 'edit'
  task?: Task
  defaultClientId?: string
  defaultAssigneeId?: string
  canMarkUrgent: boolean
  /** false when an employee is editing a task that's already assigned — only managers/admins can then change assignee/due date. */
  canEditAssignment?: boolean
  clients: { id: string; company_name: string }[]
  assignees: Option[]
  departments: Department[]
  platforms: Platform[]
  services: Service[]
  meId: string
}

export function TaskForm(p: TaskFormProps) {
  const router = useRouter()
  const t = p.task
  const [form, setForm] = useState({
    title:           t?.title ?? '',
    description:     t?.description ?? '',
    client_id:       t?.client_id ?? p.defaultClientId ?? '',
    type:            (t?.type ?? 'task') as TaskType,
    priority:        (t?.priority ?? 'P3') as TaskPriority,
    is_urgent:       t?.is_urgent ?? false,
    service_id:      t?.service_id ?? '',
    department_id:   t?.department_id ?? '',
    platform_id:     t?.platform_id ?? '',
    assignee_id:     t?.assignee_id
                     ?? (p.defaultAssigneeId && p.assignees.some(a => a.id === p.defaultAssigneeId) ? p.defaultAssigneeId : null)
                     ?? (p.mode === 'create' && p.assignees.length === 1 ? p.meId : ''),
    due_date:        t?.due_date ?? '',
    deadline_type:   (t?.deadline_type ?? '') as DeadlineType | '',
    estimated_hours: String(t?.estimated_hours ?? 3),
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm(f => ({ ...f, [k]: v }))
  const canEditAssignment = p.canEditAssignment ?? true

  const activePlatforms = useMemo(() => p.platforms.filter(x => x.is_active || x.id === form.platform_id), [p.platforms, form.platform_id])
  const activeServices = useMemo(() => p.services.filter(x => x.is_active || x.id === form.service_id), [p.services, form.service_id])

  function pickService(id: string) {
    const svc = p.services.find(s => s.id === id)
    setForm(f => ({ ...f, service_id: id, department_id: svc?.department_id ?? f.department_id }))
  }

  function pickDeadline(type: DeadlineType) {
    setForm(f => f.deadline_type === type
      ? { ...f, deadline_type: '', due_date: '' }
      : { ...f, deadline_type: type, due_date: dueDateFor(type) })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.client_id) return setError('Choose a client.')
    setSaving(true)
    setError('')

    const payload = {
      title:           form.title.trim(),
      description:     form.description.trim() || null,
      client_id:       form.client_id,
      type:            form.type,
      priority:        form.priority,
      is_urgent:       form.is_urgent,
      service_id:      form.service_id || null,
      department_id:   form.department_id || null,
      platform_id:     form.platform_id || null,
      assignee_id:     form.assignee_id || null,
      due_date:        form.due_date || null,
      deadline_type:   form.deadline_type || null,
      estimated_hours: form.estimated_hours ? Number(form.estimated_hours) : null,
    }

    const supabase = createClient()
    const { data, error } = p.mode === 'create'
      ? await supabase.from('tasks').insert(payload).select('id').single()
      : await supabase.from('tasks').update(payload).eq('id', t!.id).select('id').single()

    if (error) {
      setError(errorMessage(error))
      setSaving(false)
      return
    }
    router.push(`/tasks/${data.id}`)
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-6 p-6">
      {error && <Alert>{error}</Alert>}

      <Field label="Title" required>
        <input className="input" required value={form.title} onChange={e => set('title', e.target.value)}
               placeholder="e.g. Launch Diwali sponsored ads on Amazon" autoFocus={p.mode === 'create'} />
      </Field>

      <Field label="Description">
        <textarea className="input min-h-[110px]" value={form.description} onChange={e => set('description', e.target.value)}
                  placeholder="Details, links, marketplace case IDs…" />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Client" required>
          <select className="input" value={form.client_id} onChange={e => set('client_id', e.target.value)} required>
            <option value="">Select client…</option>
            {p.clients.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
          </select>
        </Field>
        <Field label="Type">
          <select className="input" value={form.type} onChange={e => set('type', e.target.value as TaskType)}>
            {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
        <Field label="Service">
          <select className="input" value={form.service_id} onChange={e => pickService(e.target.value)}>
            <option value="">—</option>
            {activeServices.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Department">
          <select className="input" value={form.department_id} onChange={e => set('department_id', e.target.value)}>
            <option value="">—</option>
            {p.departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </Field>
        <Field label="Platform">
          <select className="input" value={form.platform_id} onChange={e => set('platform_id', e.target.value)}>
            <option value="">—</option>
            {activePlatforms.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </Field>
        <Field label="Assignee"
               hint={!canEditAssignment ? 'Only managers and admins can change the assignee.' : p.assignees.length === 1 ? 'You can assign tasks to yourself.' : undefined}>
          <select className="input" value={form.assignee_id} disabled={!canEditAssignment} onChange={e => set('assignee_id', e.target.value)}>
            <option value="">Unassigned</option>
            {p.assignees.map(a => <option key={a.id} value={a.id}>{a.id === p.meId ? `${a.name} (me)` : a.name}</option>)}
          </select>
        </Field>
        <Field label="Priority">
          <select className="input" value={form.priority} onChange={e => set('priority', e.target.value as TaskPriority)}>
            {PRIORITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
        <Field label="Estimated hours">
          <input className="input" type="number" min="0" step="0.5" value={form.estimated_hours} onChange={e => set('estimated_hours', e.target.value)} />
        </Field>
      </div>

      <Field label="Deadline" hint={!canEditAssignment ? 'Only managers and admins can change the due date.' : undefined}>
        <div className="flex flex-wrap items-center gap-2">
          {DEADLINE_OPTIONS.map(d => (
            <button key={d.value} type="button" disabled={!canEditAssignment} onClick={() => pickDeadline(d.value)}
                    className={cn('rounded-lg px-3 py-1.5 text-sm font-medium ring-1 ring-inset transition disabled:cursor-not-allowed disabled:opacity-50',
                      form.deadline_type === d.value ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-600 ring-slate-300 hover:bg-slate-50')}>
              {d.label}
            </button>
          ))}
          <input type="date" className="input w-auto" value={form.due_date} disabled={!canEditAssignment}
                 onChange={e => setForm(f => ({ ...f, due_date: e.target.value, deadline_type: '' }))} />
        </div>
      </Field>

      {p.canMarkUrgent && (
        <label className={cn('flex cursor-pointer items-center gap-3 rounded-lg border p-4 transition',
          form.is_urgent ? 'border-red-300 bg-red-50' : 'border-slate-200 hover:bg-slate-50')}>
          <input type="checkbox" checked={form.is_urgent} onChange={e => set('is_urgent', e.target.checked)}
                 className="h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-500" />
          <Flame className={cn('h-5 w-5', form.is_urgent ? 'text-red-600' : 'text-slate-400')} />
          <span className="text-sm">
            <span className="font-semibold text-slate-900">Mark as urgent</span>
            <span className="block text-slate-500">Everyone on the team will see it in the urgent pool and can pick it up.</span>
          </span>
        </label>
      )}

      <div className="flex justify-end gap-2 border-t border-slate-100 pt-5">
        <Button type="button" variant="secondary" onClick={() => router.back()}>Cancel</Button>
        <Button type="submit" loading={saving}>{p.mode === 'create' ? 'Create task' : 'Save changes'}</Button>
      </div>
    </form>
  )
}
