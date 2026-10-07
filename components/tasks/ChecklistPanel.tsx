'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { cn, errorMessage } from '@/lib/utils'
import type { TaskChecklistItem } from '@/types/database'

export function ChecklistPanel({ taskId, items, canEdit }: { taskId: string; items: TaskChecklistItem[]; canEdit: boolean }) {
  const router = useRouter()
  const [text, setText] = useState('')
  const [adding, setAdding] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const done = items.filter(i => i.is_done).length

  async function addItem(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    setAdding(true)
    setError('')
    const { error } = await createClient().from('task_checklist_items').insert({
      task_id: taskId, text: text.trim(), sort_order: items.length,
    })
    setAdding(false)
    if (error) return setError(errorMessage(error))
    setText('')
    router.refresh()
  }

  async function toggle(item: TaskChecklistItem) {
    setBusyId(item.id)
    setError('')
    const { error } = await createClient().from('task_checklist_items').update({ is_done: !item.is_done }).eq('id', item.id)
    setBusyId(null)
    if (error) return setError(errorMessage(error))
    router.refresh()
  }

  async function remove(id: string) {
    setBusyId(id)
    setError('')
    const { error } = await createClient().from('task_checklist_items').delete().eq('id', id)
    setBusyId(null)
    if (error) return setError(errorMessage(error))
    router.refresh()
  }

  return (
    <div>
      {items.length > 0 && (
        <p className="mb-2 text-xs font-medium text-slate-500">{done} of {items.length} done</p>
      )}
      {error && <p className="mb-2 text-xs text-red-600">{error}</p>}

      {items.length > 0 && (
        <ul className="mb-3 space-y-1.5">
          {items.map(item => (
            <li key={item.id} className="group flex items-center gap-2">
              <button
                type="button" role="checkbox" aria-checked={item.is_done}
                onClick={() => toggle(item)} disabled={!canEdit || busyId === item.id}
                className={cn(
                  'flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border transition disabled:opacity-60',
                  item.is_done ? 'border-lime-500 bg-lime-500' : 'border-slate-300 bg-white',
                )}
              >
                {item.is_done && <span className="h-1.5 w-1.5 rounded-sm bg-white" />}
              </button>
              <span className={cn('flex-1 text-sm', item.is_done ? 'text-slate-400 line-through' : 'text-slate-800')}>{item.text}</span>
              {canEdit && (
                <button type="button" onClick={() => remove(item.id)} disabled={busyId === item.id}
                        className="invisible text-slate-300 hover:text-red-600 group-hover:visible disabled:opacity-60">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <form onSubmit={addItem} className="flex items-center gap-2">
          <input className="input h-8 flex-1 text-sm" placeholder="Add a checklist item" value={text} onChange={e => setText(e.target.value)} />
          <Button type="submit" size="sm" variant="secondary" loading={adding}><Plus className="h-3.5 w-3.5" /></Button>
        </form>
      )}

      {items.length === 0 && !canEdit && <p className="text-xs italic text-slate-400">No checklist for this task.</p>}
    </div>
  )
}
