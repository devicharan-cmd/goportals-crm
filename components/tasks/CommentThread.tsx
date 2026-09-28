'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Globe, Lock, MessageSquare, Send } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Avatar } from '@/components/ui/primitives'
import { Button } from '@/components/ui/button'
import { ROLE_LABELS } from '@/lib/constants'
import { cn, errorMessage, formatRelative } from '@/lib/utils'
import type { AppRole, TaskComment } from '@/types/database'

/**
 * One discussion per task. Who decides visibility (also enforced in the DB, migration 009):
 *   client → always public · employee → always team-only · manager / super admin → choose.
 */
export function CommentThread({
  taskId, comments, names, roles, meId, myRole,
}: {
  taskId: string
  comments: TaskComment[]
  names: Record<string, string>
  roles?: Record<string, AppRole>
  meId: string
  myRole: AppRole
}) {
  const router = useRouter()
  const isStaff = myRole !== 'client'
  const canChoose = myRole === 'super_admin' || myRole === 'manager'
  const [body, setBody] = useState('')
  const [isPublic, setIsPublic] = useState(!isStaff)
  const [filter, setFilter] = useState<'all' | 'public' | 'team'>('all')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const willBePublic = myRole === 'client' ? true : myRole === 'employee' ? false : isPublic
  const shown = comments.filter(c => filter === 'all' || (filter === 'public' ? !c.is_internal : c.is_internal))

  async function submit(e?: React.FormEvent) {
    e?.preventDefault()
    if (!body.trim()) return
    setSaving(true)
    setError('')
    const { error } = await createClient().from('task_comments').insert({
      task_id: taskId, author_id: meId, body: body.trim(), is_internal: !willBePublic,
    })
    setSaving(false)
    if (error) return setError(errorMessage(error))
    setBody('')
    router.refresh()
  }

  return (
    <div>
      {isStaff && comments.length > 0 && (
        <div className="mb-4 inline-flex rounded-lg bg-slate-100 p-1 text-xs font-medium">
          {([
            ['all', `All (${comments.length})`],
            ['public', `Public (${comments.filter(c => !c.is_internal).length})`],
            ['team', `Team only (${comments.filter(c => c.is_internal).length})`],
          ] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setFilter(k)}
                    className={cn('rounded-md px-2.5 py-1', filter === k ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-800')}>
              {l}
            </button>
          ))}
        </div>
      )}

      {shown.length === 0 ? (
        <p className="flex items-center gap-2 py-4 text-sm text-slate-400">
          <MessageSquare className="h-4 w-4" /> {comments.length ? 'No comments in this view.' : 'No comments yet — start the conversation.'}
        </p>
      ) : (
        <ul className="space-y-4">
          {shown.map(c => {
            const author = c.author_id ?? ''
            const role = roles?.[author]
            const mine = author === meId
            return (
              <li key={c.id} className={cn('flex gap-3', mine && 'flex-row-reverse')}>
                <Avatar name={names[author] ?? '?'} size="sm" />
                <div className={cn('min-w-0 max-w-[85%] flex-1 rounded-xl px-4 py-3',
                  c.is_internal ? 'bg-amber-50 ring-1 ring-inset ring-amber-200' : mine ? 'bg-brand-50' : 'bg-slate-50')}>
                  <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                    <span className="font-semibold text-slate-800">{names[author] ?? 'Unknown'}{mine && ' (you)'}</span>
                    {role && <span className="text-slate-400">{ROLE_LABELS[role]}</span>}
                    <span className="text-slate-400" suppressHydrationWarning>{formatRelative(c.created_at)}</span>
                    {isStaff && (c.is_internal
                      ? <span className="ml-auto inline-flex items-center gap-1 font-medium text-amber-700"><Lock className="h-3 w-3" /> Team only</span>
                      : <span className="ml-auto inline-flex items-center gap-1 font-medium text-brand-700"><Globe className="h-3 w-3" /> Public</span>)}
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-slate-700">{c.body}</p>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <form onSubmit={submit} className="mt-5">
        {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit() }}
          placeholder={
            myRole === 'client' ? 'Write a message to the GoPortals team…'
            : willBePublic ? 'Write a reply the client will see…'
            : 'Write a note for the team (client won’t see this)…'
          }
          className={cn('input min-h-[84px]', !willBePublic && 'bg-amber-50/50')}
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          {canChoose ? (
            <div className="inline-flex rounded-lg bg-slate-100 p-1 text-xs font-medium" role="radiogroup" aria-label="Who can see this comment">
              <button type="button" role="radio" aria-checked={!isPublic} onClick={() => setIsPublic(false)}
                      className={cn('inline-flex items-center gap-1 rounded-md px-2.5 py-1', !isPublic ? 'bg-white text-amber-700 shadow-sm' : 'text-slate-500')}>
                <Lock className="h-3 w-3" /> Team only
              </button>
              <button type="button" role="radio" aria-checked={isPublic} onClick={() => setIsPublic(true)}
                      className={cn('inline-flex items-center gap-1 rounded-md px-2.5 py-1', isPublic ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500')}>
                <Globe className="h-3 w-3" /> Public (client can see)
              </button>
            </div>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs text-slate-500">
              {myRole === 'employee'
                ? <><Lock className="h-3 w-3 text-amber-600" /> Visible to the GoPortals team only</>
                : <><Globe className="h-3 w-3" /> Visible to the GoPortals team</>}
            </span>
          )}
          <Button type="submit" size="sm" loading={saving} disabled={!body.trim()}><Send className="h-3.5 w-3.5" /> Send</Button>
        </div>
        <p className="mt-1 text-right text-[11px] text-slate-400">Ctrl + Enter to send</p>
      </form>
    </div>
  )
}
