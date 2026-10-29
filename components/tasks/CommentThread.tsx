'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, CheckCheck, Globe, Lock, MessageSquare, Send } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Avatar } from '@/components/ui/primitives'
import { Button } from '@/components/ui/button'
import { ROLE_LABELS } from '@/lib/constants'
import { cn, errorMessage, formatRelative } from '@/lib/utils'

/** "Today" / "Yesterday" / "12 Mar" — the separator between days of chat. */
function dayLabel(iso: string) {
  const d = new Date(iso)
  const today = new Date()
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()
  if (sameDay(d, today)) return 'Today'
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (sameDay(d, yesterday)) return 'Yesterday'
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }).format(d)
}

function clockTime(iso: string) {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }).format(new Date(iso))
}
import type { AppRole } from '@/types/database'

type CommentLike = { id: string; author_id: string | null; body: string; is_internal: boolean; created_at: string; seen_at?: string | null }

/**
 * One discussion per task (or ticket — pass table="ticket_comments" idField="ticket_id").
 * Who decides visibility (also enforced in the DB, migration 009 for tasks / 014 for tickets):
 *   client → always public · employee → always team-only · manager / super admin → choose.
 */
export function CommentThread({
  taskId, comments, names, roles, meId, myRole, table = 'task_comments', idField = 'task_id', lockedNote, showReceipts = false,
}: {
  taskId: string
  comments: CommentLike[]
  names: Record<string, string>
  roles?: Record<string, AppRole>
  meId: string
  myRole: AppRole
  table?: 'task_comments' | 'ticket_comments'
  idField?: 'task_id' | 'ticket_id'
  /** Shown instead of the composer when the thread takes no more replies. */
  lockedNote?: string
  /** Ticks on your own messages: one for sent, two once the other side read it. */
  showReceipts?: boolean
}) {
  const router = useRouter()
  const isStaff = myRole !== 'client'
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const canChoose = myRole === 'super_admin' || myRole === 'admin' || myRole === 'team_lead'
  const [body, setBody] = useState('')
  const [isPublic, setIsPublic] = useState(true)
  const [filter, setFilter] = useState<'all' | 'public' | 'team'>('all')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const willBePublic = myRole === 'client' ? true : myRole === 'employee' ? false : isPublic

  // Newest message in view on open and after sending, like any chat.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [comments.length, filter])
  const shown = comments.filter(c => filter === 'all' || (filter === 'public' ? !c.is_internal : c.is_internal))

  async function submit(e?: React.FormEvent) {
    e?.preventDefault()
    if (!body.trim()) return
    setSaving(true)
    setError('')
    const { error } = await createClient().from(table).insert({
      [idField]: taskId, author_id: meId, body: body.trim(), is_internal: !willBePublic,
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
        <p className="flex items-center gap-2 py-6 text-sm text-slate-400">
          <MessageSquare className="h-4 w-4" /> {comments.length ? 'No comments in this view.' : 'No messages yet — say hello.'}
        </p>
      ) : (
        <div ref={scrollRef} className="max-h-[26rem] space-y-1 overflow-y-auto pr-1">
          {shown.map((c, i) => {
            const author = c.author_id ?? ''
            const role = roles?.[author]
            const mine = author === meId
            const prev = shown[i - 1]
            // A new day, or a different person, starts a fresh block.
            const newDay = !prev || dayLabel(prev.created_at) !== dayLabel(c.created_at)
            const newBlock = newDay || prev?.author_id !== c.author_id || prev?.is_internal !== c.is_internal
            return (
              <div key={c.id}>
                {newDay && (
                  <div className="my-3 flex items-center gap-3">
                    <span className="h-px flex-1 bg-slate-100" />
                    <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{dayLabel(c.created_at)}</span>
                    <span className="h-px flex-1 bg-slate-100" />
                  </div>
                )}
                <div className={cn('flex items-end gap-2', mine ? 'flex-row-reverse' : 'flex-row', newBlock ? 'mt-2.5' : 'mt-0.5')}>
                  <span className={cn('w-7 flex-shrink-0', mine && 'hidden')}>
                    {newBlock && !mine && <Avatar name={names[author] ?? '?'} size="xs" />}
                  </span>
                  <div className={cn('flex min-w-0 max-w-[78%] flex-col', mine ? 'items-end' : 'items-start')}>
                    {newBlock && !mine && (
                      <span className="mb-1 flex items-center gap-2 px-1 text-xs">
                        <span className="font-semibold text-slate-700">{names[author] ?? 'Unknown'}</span>
                        {role && <span className="text-slate-400">{ROLE_LABELS[role]}</span>}
                      </span>
                    )}
                    <div className={cn('rounded-2xl px-3.5 py-2 text-sm shadow-sm ring-1 ring-inset',
                      c.is_internal
                        ? 'bg-amber-50 text-amber-900 ring-amber-200'
                        : mine
                          ? 'bg-brand-600 text-white ring-brand-600'
                          : 'bg-white text-slate-700 ring-slate-200',
                      newBlock && (mine ? 'rounded-br-md' : 'rounded-bl-md'))}>
                      <p className="whitespace-pre-wrap break-words">{c.body}</p>
                    </div>
                    <span className={cn('mt-0.5 flex items-center gap-1.5 px-1 text-[11px] text-slate-400', mine && 'flex-row-reverse')}>
                      <span suppressHydrationWarning>{clockTime(c.created_at)}</span>
                      {showReceipts && mine && !c.is_internal && (c.seen_at
                        ? <span className="inline-flex items-center gap-0.5 text-brand-600" title={`Seen ${formatRelative(c.seen_at)}`}><CheckCheck className="h-3.5 w-3.5" /> Seen</span>
                        : <span className="inline-flex items-center gap-0.5" title="Sent"><Check className="h-3.5 w-3.5" /> Sent</span>)}
                      {isStaff && (c.is_internal
                        ? <span className="inline-flex items-center gap-0.5 font-medium text-amber-700"><Lock className="h-2.5 w-2.5" /> Team only</span>
                        : <span className="inline-flex items-center gap-0.5 font-medium text-brand-600"><Globe className="h-2.5 w-2.5" /> Public</span>)}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {lockedNote ? (
        <p className="mt-5 rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-500 ring-1 ring-inset ring-slate-200">{lockedNote}</p>
      ) : (
      <form onSubmit={submit} className="mt-5">
        {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
        {/* Composer sits in one rounded bar with the send button, like a chat. */}
        <div className={cn('flex items-end gap-2 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm transition focus-within:border-brand-300 focus-within:ring-2 focus-within:ring-brand-500/20',
          !willBePublic && 'border-amber-200 bg-amber-50/60 focus-within:border-amber-300 focus-within:ring-amber-500/20')}>
          <textarea
            rows={1}
            value={body}
            onChange={e => {
              setBody(e.target.value)
              e.target.style.height = 'auto'
              e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`
            }}
            onKeyDown={e => {
              // Enter sends, Shift + Enter starts a new line — the chat convention.
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }
            }}
            placeholder={
              myRole === 'client' ? 'Write a message to the GoPortals team…'
              : willBePublic ? 'Write a reply the client will see…'
              : 'Write a note for the team (client won’t see this)…'
            }
            className="max-h-40 min-h-[40px] flex-1 resize-none border-0 bg-transparent px-2.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-0"
          />
          <Button type="submit" size="sm" loading={saving} disabled={!body.trim()}
                  className="h-9 w-9 flex-shrink-0 rounded-full p-0" aria-label="Send message">
            {!saving && <Send className="h-4 w-4" />}
          </Button>
        </div>
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
          <span className="text-[11px] text-slate-400">Enter to send · Shift + Enter for a new line</span>
        </div>
      </form>
      )}
    </div>
  )
}
