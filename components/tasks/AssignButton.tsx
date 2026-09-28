'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Search, UserMinus, UserCog } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Avatar } from '@/components/ui/primitives'
import { cn, errorMessage } from '@/lib/utils'

import type { AssigneeOption } from '@/lib/queries'
export type { AssigneeOption }

/** "Change assignee" — pick someone from a searchable list and save straight away. */
export function AssignButton({
  taskId, currentId, options, variant = 'button',
}: {
  taskId: string
  currentId: string | null
  options: AssigneeOption[]
  variant?: 'button' | 'link'
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<string | null>(currentId)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    return s ? options.filter(o => `${o.name} ${o.subtitle ?? ''}`.toLowerCase().includes(s)) : options
  }, [q, options])

  function show() {
    setSelected(currentId)
    setQ('')
    setError('')
    setOpen(true)
  }

  async function save() {
    setSaving(true)
    setError('')
    const { error } = await createClient().from('tasks').update({ assignee_id: selected }).eq('id', taskId)
    setSaving(false)
    if (error) return setError(errorMessage(error))
    setOpen(false)
    router.refresh()
  }

  return (
    <>
      {variant === 'button'
        ? <Button size="sm" onClick={show}><UserCog className="h-3.5 w-3.5" /> {currentId ? 'Change assignee' : 'Assign'}</Button>
        : <button onClick={show} className="text-xs font-semibold text-brand-600 hover:text-brand-700">{currentId ? 'Change' : 'Assign'}</button>}

      <Modal open={open} onClose={() => setOpen(false)} title={currentId ? 'Change assignee' : 'Assign task'}
             description="They'll get a notification straight away.">
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search by name or role…" className="input pl-9" />
        </div>

        <ul className="-mx-2 max-h-80 space-y-0.5 overflow-y-auto px-2">
          {filtered.map(o => {
            const active = selected === o.id
            return (
              <li key={o.id}>
                <button
                  type="button"
                  onClick={() => setSelected(o.id)}
                  className={cn('flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition',
                    active ? 'bg-brand-50 ring-1 ring-brand-300' : 'hover:bg-slate-50')}
                >
                  <Avatar name={o.name} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-900">
                      {o.name} {o.isMe && <span className="font-normal text-slate-400">(me)</span>}
                      {o.id === currentId && <span className="ml-1 text-xs font-normal text-lime-700">· current</span>}
                    </span>
                    {o.subtitle && <span className="block truncate text-xs text-slate-500">{o.subtitle}</span>}
                  </span>
                  {active && <Check className="h-4 w-4 text-brand-600" />}
                </button>
              </li>
            )
          })}
          {filtered.length === 0 && <li className="px-3 py-6 text-center text-sm text-slate-400">No one matches “{q}”.</li>}
        </ul>

        {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div className="mt-5 flex items-center justify-between gap-2 border-t border-slate-100 pt-4">
          {currentId ? (
            <Button variant="ghost" size="sm" onClick={() => setSelected(null)} className={cn(selected === null && 'bg-slate-100')}>
              <UserMinus className="h-3.5 w-3.5" /> Unassign
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button loading={saving} disabled={selected === currentId} onClick={save}>Save</Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
