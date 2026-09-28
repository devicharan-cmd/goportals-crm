'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { PLATFORM_CATEGORY_LABELS } from '@/lib/constants'
import { cn, errorMessage } from '@/lib/utils'
import type { Department, Platform, PlatformCategory, Service } from '@/types/database'

type Table = 'platforms' | 'services' | 'departments'

function useSave() {
  const router = useRouter()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function save(table: Table, id: string | null, fields: Record<string, unknown>) {
    setBusy(true); setError('')
    const supabase = createClient()
    const { error } = id
      ? await supabase.from(table).update(fields).eq('id', id)
      : await supabase.from(table).insert(fields)
    setBusy(false)
    if (error) { setError(errorMessage(error)); return false }
    router.refresh()
    return true
  }
  return { save, error, busy }
}

function ActiveToggle({ active, onChange, disabled }: { active: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onChange} disabled={disabled} role="switch" aria-checked={active}
            className={cn('relative h-5 w-9 flex-shrink-0 rounded-full transition', active ? 'bg-lime-500' : 'bg-slate-300')}>
      <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition', active ? 'left-[18px]' : 'left-0.5')} />
    </button>
  )
}

const inlineInput = 'input h-8 py-1 text-sm'

export function PlatformsEditor({ platforms }: { platforms: Platform[] }) {
  const { save, error, busy } = useSave()
  const [draft, setDraft] = useState({ name: '', category: 'marketplace' as PlatformCategory })
  return (
    <div>
      <ul className="divide-y divide-slate-100">
        {platforms.map(p => (
          <li key={p.id} className={cn('flex items-center gap-2 px-5 py-2.5', !p.is_active && 'opacity-60')}>
            <input defaultValue={p.name} className={cn(inlineInput, 'flex-1')}
                   onBlur={e => e.target.value.trim() && e.target.value !== p.name && save('platforms', p.id, { name: e.target.value.trim() })} />
            <select defaultValue={p.category} className={cn(inlineInput, 'w-40')} onChange={e => save('platforms', p.id, { category: e.target.value })}>
              {Object.entries(PLATFORM_CATEGORY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <ActiveToggle active={p.is_active} disabled={busy} onChange={() => save('platforms', p.id, { is_active: !p.is_active })} />
          </li>
        ))}
      </ul>
      {error && <p className="px-5 pb-2 text-xs text-red-600">{error}</p>}
      <form className="flex gap-2 border-t border-slate-100 px-5 py-3"
            onSubmit={async e => { e.preventDefault(); if (await save('platforms', null, { ...draft, name: draft.name.trim(), sort_order: platforms.length + 1 })) setDraft({ ...draft, name: '' }) }}>
        <input required placeholder="New platform (e.g. Tata CLiQ)" className={cn(inlineInput, 'flex-1')} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} />
        <select className={cn(inlineInput, 'w-40')} value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value as PlatformCategory })}>
          {Object.entries(PLATFORM_CATEGORY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <Button size="sm" loading={busy}><Plus className="h-3.5 w-3.5" /> Add</Button>
      </form>
    </div>
  )
}

export function ServicesEditor({ services, departments }: { services: Service[]; departments: Department[] }) {
  const { save, error, busy } = useSave()
  const [draft, setDraft] = useState({ name: '', department_id: '' })
  return (
    <div>
      <ul className="divide-y divide-slate-100">
        {services.map(s => (
          <li key={s.id} className={cn('px-5 py-2.5', !s.is_active && 'opacity-60')}>
            <div className="flex items-center gap-2">
              <input defaultValue={s.name} className={cn(inlineInput, 'flex-1')}
                     onBlur={e => e.target.value.trim() && e.target.value !== s.name && save('services', s.id, { name: e.target.value.trim() })} />
              <select defaultValue={s.department_id ?? ''} className={cn(inlineInput, 'w-36')} onChange={e => save('services', s.id, { department_id: e.target.value || null })}>
                <option value="">No department</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <ActiveToggle active={s.is_active} disabled={busy} onChange={() => save('services', s.id, { is_active: !s.is_active })} />
            </div>
            <input defaultValue={s.description ?? ''} placeholder="Short description shown to clients" className={cn(inlineInput, 'mt-1.5 text-xs text-slate-500')}
                   onBlur={e => e.target.value !== (s.description ?? '') && save('services', s.id, { description: e.target.value || null })} />
          </li>
        ))}
      </ul>
      {error && <p className="px-5 pb-2 text-xs text-red-600">{error}</p>}
      <form className="flex gap-2 border-t border-slate-100 px-5 py-3"
            onSubmit={async e => {
              e.preventDefault()
              if (await save('services', null, { name: draft.name.trim(), department_id: draft.department_id || null, sort_order: services.length + 1 }))
                setDraft({ name: '', department_id: '' })
            }}>
        <input required placeholder="New service" className={cn(inlineInput, 'flex-1')} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} />
        <select className={cn(inlineInput, 'w-36')} value={draft.department_id} onChange={e => setDraft({ ...draft, department_id: e.target.value })}>
          <option value="">Department…</option>
          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <Button size="sm" loading={busy}><Plus className="h-3.5 w-3.5" /> Add</Button>
      </form>
    </div>
  )
}

export function DepartmentsEditor({ departments }: { departments: Department[] }) {
  const { save, error, busy } = useSave()
  const [name, setName] = useState('')
  return (
    <div>
      <ul className="divide-y divide-slate-100">
        {departments.map(d => (
          <li key={d.id} className="px-5 py-2.5">
            <input defaultValue={d.name} className={inlineInput}
                   onBlur={e => e.target.value.trim() && e.target.value !== d.name && save('departments', d.id, { name: e.target.value.trim() })} />
          </li>
        ))}
      </ul>
      {error && <p className="px-5 pb-2 text-xs text-red-600">{error}</p>}
      <form className="flex gap-2 border-t border-slate-100 px-5 py-3"
            onSubmit={async e => {
              e.preventDefault()
              const n = name.trim()
              if (await save('departments', null, { name: n, slug: n.toLowerCase().replace(/[^a-z0-9]+/g, '-'), sort_order: departments.length + 1 })) setName('')
            }}>
        <input required placeholder="New department" className={cn(inlineInput, 'flex-1')} value={name} onChange={e => setName(e.target.value)} />
        <Button size="sm" loading={busy}><Plus className="h-3.5 w-3.5" /> Add</Button>
      </form>
    </div>
  )
}
