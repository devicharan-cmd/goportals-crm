'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { MoreHorizontal, Trash2, Globe, Lock, MessageSquare, Send, Paperclip, X, FileText, RotateCcw, ImagePlay } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Avatar } from '@/components/ui/primitives'
import { Button } from '@/components/ui/button'
import { ROLE_LABELS, ROLE_STYLES } from '@/lib/constants'
import { cn, errorMessage, splitTeamName } from '@/lib/utils'
import type { AppRole } from '@/types/database'

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

type CommentLike = {
  id: string
  author_id: string | null
  body: string
  is_internal: boolean
  is_change_request?: boolean
  created_at: string
}
type CommentAttachment = {
  id: string
  comment_id: string | null
  uploaded_by: string | null
  storage_path: string
  file_name: string
  mime_type: string | null
  size_bytes: number | null
  signedUrl: string
  downloadUrl: string
}

const DOCUMENT_EXTENSIONS = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'csv', 'txt', 'rtf', 'odt', 'ods', 'odp'])
const MEDIA_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'bmp', 'mp4', 'webm', 'mov'])
const DOCUMENT_ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.rtf,.odt,.ods,.odp'
const MEDIA_ACCEPT = '.jpg,.jpeg,.png,.webp,.bmp,.mp4,.webm,.mov'

/** Task-comment actions. Ticket conversations intentionally have no per-message menu. */
function MessageMenu({ commentId, table, canDelete, mine, attachments }: {
  commentId: string
  table: 'task_comments'
  canDelete: boolean
  mine: boolean
  attachments: CommentAttachment[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')

  async function toggle() {
    const next = !open
    setOpen(next)
  }

  async function remove() {
    setWorking(true)
    setError('')
    const client = createClient()
    if (attachments.length) {
      const { error: storageError } = await client.storage.from('task-files')
        .remove(attachments.map(attachment => attachment.storage_path))
      if (storageError) {
        setWorking(false)
        setError(errorMessage(storageError))
        return
      }
    }
    const { error } = await client.from(table).delete().eq('id', commentId)
    setWorking(false)
    if (error) return setError(errorMessage(error))
    setOpen(false)
    router.refresh()
  }

  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        onClick={toggle}
        aria-label="Message options"
        title="Message options"
        className={cn(
          'rounded p-0.5 text-slate-400 transition hover:bg-slate-200/60 hover:text-slate-700 focus:opacity-100',
          open ? 'opacity-100 bg-slate-200/70 text-slate-700' : 'opacity-0 group-hover/msg:opacity-100'
        )}
      >
        <MoreHorizontal className="h-3.5 w-3.5" />
      </button>
      {open && (
        <>
          <span className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <span className={cn(
            'absolute bottom-full mb-1.5 z-30 block w-64 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-xl ring-1 ring-black/5',
            mine ? 'right-0' : 'left-0'
          )}>
            {canDelete && (
              <button
                type="button"
                onClick={remove}
                disabled={working}
                className="mt-2.5 flex w-full items-center gap-1.5 rounded-lg border-t border-slate-100 px-1 pt-2 text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" /> {working ? 'Deleting…' : 'Delete message'}
              </button>
            )}
            {error && <span className="mt-1.5 block text-[11px] text-red-600">{error}</span>}
          </span>
        </>
      )}
    </span>
  )
}

function AttachmentMenu({ attachment, canDelete }: { attachment: CommentAttachment; canDelete: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')

  async function remove() {
    setWorking(true)
    setError('')
    const client = createClient()
    const { error: storageError } = await client.storage.from('task-files').remove([attachment.storage_path])
    if (storageError) {
      setWorking(false)
      setError(errorMessage(storageError))
      return
    }
    const { error: rowError } = await client.from('task_attachments').delete().eq('id', attachment.id)
    setWorking(false)
    if (rowError) {
      setError(errorMessage(rowError))
      return
    }
    setOpen(false)
    router.refresh()
  }

  if (!canDelete) return null
  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-label="File options"
        title="File options"
        className={cn(
          'rounded p-0.5 text-slate-400 transition hover:bg-slate-200/60 hover:text-slate-700',
          open ? 'bg-slate-200/70 text-slate-700' : 'opacity-0 group-hover/file:opacity-100',
        )}
      >
        <MoreHorizontal className="h-3.5 w-3.5" />
      </button>
      {open && (
        <>
          <span className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <span className="absolute bottom-full right-0 z-30 mb-1.5 block w-40 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
            <button type="button" onClick={remove} disabled={working}
              className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50">
              <Trash2 className="h-3.5 w-3.5" /> {working ? 'Deleting…' : 'Delete file'}
            </button>
            {error && <span className="mt-1 block text-[11px] text-red-600">{error}</span>}
          </span>
        </>
      )}
    </span>
  )
}

export function CommentThread({
  taskId, comments, names, roles, avatarUrls, meId, myRole, attachments = [], table = 'task_comments', idField = 'task_id', lockedNote, bounded = false, replyNeeded = false,
}: {
  taskId: string
  comments: CommentLike[]
  names: Record<string, string>
  roles?: Record<string, AppRole>
  avatarUrls?: Record<string, string | null>
  attachments?: CommentAttachment[]
  meId: string
  myRole: AppRole
  table?: 'task_comments' | 'ticket_comments'
  idField?: 'task_id' | 'ticket_id'
  /** Shown instead of the composer when the thread takes no more replies. */
  lockedNote?: string
  /** Keep ticket conversations a fixed height and scroll messages inside them. */
  bounded?: boolean
  /** Whether this client reply is expected to clear the awaiting-client state. */
  replyNeeded?: boolean
}) {
  const router = useRouter()
  const isStaff = myRole !== 'client'
  const isTicketThread = table === 'ticket_comments'
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const documentInputRef = useRef<HTMLInputElement | null>(null)
  const mediaInputRef = useRef<HTMLInputElement | null>(null)
  const readMarkedRef = useRef(new Set<string>())
  const readInFlightRef = useRef(new Set<string>())
  const canChoose = isTicketThread && (myRole === 'super_admin' || myRole === 'manager')
  const [body, setBody] = useState('')
  const [isPublic, setIsPublic] = useState(true)
  const [filter, setFilter] = useState<'all' | 'public' | 'team'>('all')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [requestChanges, setRequestChanges] = useState(false)
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false)

  useEffect(() => {
    if (isTicketThread || myRole !== 'client') return
    function focusRequestComposer(event: Event) {
      const detail = (event as CustomEvent<{ taskId: string }>).detail
      if (detail?.taskId !== taskId) return
      setRequestChanges(true)
      document.getElementById('conversation')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      window.setTimeout(() => textareaRef.current?.focus(), 250)
    }
    window.addEventListener('task-request-changes', focusRequestComposer)
    return () => window.removeEventListener('task-request-changes', focusRequestComposer)
  }, [isTicketThread, myRole, taskId])

  const willBePublic = myRole === 'client' ? true
    : myRole === 'employee' || (isTicketThread && myRole === 'team_lead') ? false
    : isPublic

  // Newest message in view on open and after sending, like any chat.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [comments.length, filter])

  // A message is read only when its bubble is actually visible in the
  // conversation viewport. One reader must never clear another reader's badge.
  useEffect(() => {
    const root = scrollRef.current
    if (!isTicketThread || !root) return
    let cancelled = false
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        const commentId = (entry.target as HTMLElement).dataset.ticketCommentId
        if (!commentId || readMarkedRef.current.has(commentId) || readInFlightRef.current.has(commentId)) continue
        readInFlightRef.current.add(commentId)
        void (async () => {
          for (let attempt = 0; attempt < 3 && !cancelled; attempt += 1) {
            const { error } = await createClient().rpc('mark_ticket_message_seen', { p_comment_id: commentId })
            if (cancelled) break
            if (!error) {
              readMarkedRef.current.add(commentId)
              break
            }
            if (attempt < 2) await new Promise(resolve => window.setTimeout(resolve, 750 * (attempt + 1)))
          }
          readInFlightRef.current.delete(commentId)
        })()
      }
    }, { root, threshold: 0.2 })

    root.querySelectorAll<HTMLElement>('[data-ticket-comment-id]').forEach(node => observer.observe(node))
    return () => { cancelled = true; observer.disconnect() }
  }, [comments, filter, isTicketThread])
  const shown = comments.filter(c => filter === 'all' || (filter === 'public' ? !c.is_internal : c.is_internal))

  function addSelectedFiles(event: React.ChangeEvent<HTMLInputElement>, allowedExtensions: Set<string>) {
    const selected = Array.from(event.target.files ?? [])
    const accepted = selected.filter(file => {
      const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
      return allowedExtensions.has(extension)
        && !file.type.startsWith('audio/')
        && file.type.toLowerCase() !== 'image/gif'
    })
    const rejected = selected.filter(file => !accepted.includes(file))
    if (rejected.length) {
      setError(`GIF, audio, and unsupported file types cannot be attached: ${rejected.map(file => file.name).join(', ')}`)
    } else {
      setError('')
    }
    if (accepted.length) setPendingFiles(files => [...files, ...accepted])
    event.target.value = ''
  }

  async function submit(e?: React.FormEvent) {
    e?.preventDefault()
    if (!body.trim() && pendingFiles.length === 0) return
    setSaving(true)
    setError('')
    const client = createClient()
    const uploaded: { file: File; path: string }[] = []
    for (const file of pendingFiles) {
      const safeName = file.name.replace(/[\\/]/g, '_')
      const path = `${taskId}/chat/${meId}/${crypto.randomUUID()}-${safeName}`
      const { error: uploadError } = await client.storage.from('task-files').upload(path, file, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      })
      if (uploadError) {
        const { error: cleanupError } = uploaded.length
          ? await client.storage.from('task-files').remove(uploaded.map(item => item.path))
          : { error: null }
        setSaving(false)
        setError(cleanupError
          ? `${errorMessage(uploadError)} Uploaded files could not be cleaned up; contact GoPortals support.`
          : errorMessage(uploadError))
        return
      }
      uploaded.push({ file, path })
    }

    let sendError: string | null = null
    if (table === 'ticket_comments') {
      const { error: commentError } = await client.rpc('send_ticket_comment', {
        p_ticket_id: taskId,
        p_body: body.trim(),
        p_is_internal: !willBePublic,
      })
      if (commentError) sendError = errorMessage(commentError)
    } else {
      const attachmentData = uploaded.map(({ file, path }) => ({
        storage_path: path,
        file_name: file.name,
        mime_type: file.type || null,
        size_bytes: file.size,
      }))
      const { error: commentError } = requestChanges && myRole === 'client'
        ? await client.rpc('client_request_task_changes', {
            p_task_id: taskId,
            p_feedback: body.trim(),
            p_attachments: attachmentData,
          })
        : await client.rpc('send_task_comment', {
            p_task_id: taskId,
            p_body: body.trim(),
            p_is_internal: !willBePublic,
            p_attachments: attachmentData,
          })
      if (commentError) sendError = errorMessage(commentError)
    }

    if (sendError) {
      const { error: cleanupError } = uploaded.length
        ? await client.storage.from('task-files').remove(uploaded.map(item => item.path))
        : { error: null }
      setSaving(false)
      setError(cleanupError
        ? `${sendError} Uploaded files could not be cleaned up; contact GoPortals support.`
        : sendError)
      return
    }
    setSaving(false)
    setBody('')
    setPendingFiles([])
    setRequestChanges(false)
    if (table === 'ticket_comments' && myRole === 'client' && replyNeeded) {
      window.dispatchEvent(new CustomEvent('ticket-client-replied', { detail: { ticketId: taskId } }))
    }
    router.refresh()
  }

  return (
    <div className={bounded ? 'flex h-full min-h-0 flex-col' : undefined}>
      {isStaff && isTicketThread && comments.length > 0 && (
        <div className="mb-4 inline-flex rounded-lg bg-slate-100 p-1 text-xs font-medium">
          {([
            ['all', `All (${comments.length})`],
            ['public', `Public (${comments.filter(c => !c.is_internal).length})`],
            ['team', `Team only (${comments.filter(c => c.is_internal).length})`],
          ] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setFilter(k)}
                    className={cn('rounded-md px-2.5 py-1', filter === k ? 'bg-white text-[#034C68] shadow-sm' : 'text-slate-500 hover:text-slate-800')}>
              {l}
            </button>
          ))}
        </div>
      )}

      {shown.length === 0 ? (
        <p className={cn('flex items-center gap-2 py-6 text-sm text-slate-400', bounded && 'min-h-0 flex-1 justify-center')}>
          <MessageSquare className="h-4 w-4" /> {comments.length ? 'No comments in this view.' : 'No messages yet — say hello.'}
        </p>
      ) : (
        <div ref={scrollRef} className={cn('space-y-1 overflow-y-auto overscroll-contain scroll-smooth pr-1', bounded ? 'min-h-0 flex-1' : 'max-h-[26rem]')}>
          {shown.map((c, i) => {
            const author = c.author_id ?? ''
            const role = roles?.[author]
            const [senderName, senderQualifier] = splitTeamName(names[author] ?? '')
            const mine = author === meId
            const prev = shown[i - 1]
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
                    {newBlock && !mine && <Avatar name={senderName || '?'} src={avatarUrls?.[author]} role={role} size="xs" />}
                  </span>
                  <div className={cn('group/msg flex min-w-0 max-w-[78%] flex-col', mine ? 'items-end' : 'items-start')}>
                    {newBlock && !mine && (
                      <span className="mb-1 flex items-center gap-2 px-1 text-xs">
                        <span className="font-semibold text-slate-700">
                          {senderName || 'Unknown'}
                          {senderQualifier && <span className="ml-1 text-[11px] font-normal text-slate-500">({senderQualifier})</span>}
                        </span>
                        {role && <span className={ROLE_STYLES[role].text}>{ROLE_LABELS[role]}</span>}
                      </span>
                    )}
                    <div data-ticket-comment-id={isTicketThread && !mine && !c.is_internal ? c.id : undefined}
                      className={cn('rounded-2xl px-3.5 py-2 text-sm shadow-sm ring-1 ring-inset transition-shadow hover:shadow-md',
                      c.is_internal
                        ? 'bg-amber-50 text-amber-900 ring-amber-200'
                        : mine
                          ? 'bg-[#045E80] text-white ring-[#045E80]'
                          : 'bg-white text-slate-700 ring-slate-200',
                      newBlock && (mine ? 'rounded-br-md' : 'rounded-bl-md'))}>
                      {c.is_change_request && (
                        <span className="mb-1.5 inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-semibold text-orange-700 ring-1 ring-inset ring-orange-200">
                          <RotateCcw className="h-3 w-3" /> Change request
                        </span>
                      )}
                      {c.body.trim() && <p className="whitespace-pre-wrap break-words">{c.body}</p>}
                      {attachments.filter(attachment => attachment.comment_id === c.id).map(attachment => {
                        const isImage = attachment.mime_type?.startsWith('image/')
                        const isVideo = attachment.mime_type?.startsWith('video/')
                        return (
                          <div key={attachment.id} className="group/file mt-2 flex min-w-0 items-start gap-2">
                            {isImage ? (
                              <div className="min-w-0">
                                <a href={attachment.signedUrl} target="_blank" rel="noreferrer" className="relative block h-64 w-64 max-w-full">
                                  <Image src={attachment.signedUrl} alt={attachment.file_name} fill unoptimized sizes="(max-width: 640px) 100vw, 256px"
                                    className="rounded-lg object-contain" />
                                </a>
                                <a href={attachment.downloadUrl} download={attachment.file_name} className="mt-1 block max-w-64 truncate text-xs underline">
                                  {attachment.file_name}
                                </a>
                              </div>
                            ) : isVideo ? (
                              <div className="min-w-0">
                                <video src={attachment.signedUrl} controls preload="metadata" className="max-h-64 max-w-full rounded-lg" />
                                <a href={attachment.downloadUrl} download={attachment.file_name} className="mt-1 block max-w-64 truncate text-xs underline">
                                  {attachment.file_name}
                                </a>
                              </div>
                            ) : (
                              <a href={attachment.downloadUrl} download={attachment.file_name}
                                className="flex min-w-0 items-center gap-2 rounded-lg bg-black/5 px-2.5 py-2 text-inherit hover:bg-black/10">
                                <FileText className="h-4 w-4 shrink-0" />
                                <span className="min-w-0 truncate text-xs font-medium">{attachment.file_name}</span>
                              </a>
                            )}
                            {!isTicketThread && (
                              <AttachmentMenu attachment={attachment} canDelete={attachment.uploaded_by === meId} />
                            )}
                          </div>
                        )
                      })}
                    </div>
                    <span className={cn('mt-0.5 flex items-center gap-1.5 px-1 text-[11px] text-slate-400', mine && 'flex-row-reverse')}>
                      <span suppressHydrationWarning>{clockTime(c.created_at)}</span>
                      {!isTicketThread && mine && (
                        <MessageMenu commentId={c.id} table="task_comments"
                                     mine={mine} canDelete={mine}
                                     attachments={attachments.filter(attachment => attachment.comment_id === c.id)} />
                      )}
                      {isStaff && isTicketThread && (c.is_internal
                        ? <span className="inline-flex items-center gap-0.5 font-medium text-amber-700"><Lock className="h-2.5 w-2.5" /> Team only</span>
                        : <span className="inline-flex items-center gap-0.5 font-medium text-[#045E80]"><Globe className="h-2.5 w-2.5" /> Public</span>)}
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
        {requestChanges && (
          <div className="mb-2 flex items-center justify-between gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-inset ring-amber-200">
            <span>Sending this message will request changes and return the task to the team.</span>
            <button type="button" onClick={() => {
              setRequestChanges(false)
              window.dispatchEvent(new CustomEvent('task-request-changes-cancelled', { detail: { taskId } }))
            }} className="rounded p-0.5 hover:bg-amber-100" aria-label="Cancel request changes">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
        {!isTicketThread && pendingFiles.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {pendingFiles.map((file, index) => (
              <span key={`${file.name}-${file.lastModified}-${index}`} className="inline-flex max-w-full items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs text-slate-700">
                <FileText className="h-3.5 w-3.5 shrink-0" />
                <span className="max-w-48 truncate">{file.name}</span>
                <button type="button" onClick={() => setPendingFiles(files => files.filter((_, fileIndex) => fileIndex !== index))}
                  className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700" aria-label={`Remove ${file.name}`}>
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
          </div>
        )}
        {/* Composer sits in one rounded bar with the send button, like a chat. */}
        <div className={cn('flex items-end gap-2 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm transition focus-within:border-[#63A9C4] focus-within:ring-2 focus-within:ring-[#0A6F94]/20',
          !willBePublic && 'border-amber-200 bg-amber-50/60 focus-within:border-amber-300 focus-within:ring-amber-500/20')}>
          {!isTicketThread && (
            <div className="relative mb-0.5">
              <input ref={documentInputRef} type="file" multiple accept={DOCUMENT_ACCEPT} className="hidden"
                onChange={event => addSelectedFiles(event, DOCUMENT_EXTENSIONS)} />
              <input ref={mediaInputRef} type="file" multiple accept={MEDIA_ACCEPT} className="hidden"
                onChange={event => addSelectedFiles(event, MEDIA_EXTENSIONS)} />
              <button type="button" onClick={() => setAttachmentMenuOpen(open => !open)} disabled={saving}
                className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-[#045E80] disabled:opacity-50"
                aria-label="Attach files" aria-expanded={attachmentMenuOpen} title="Attach files">
                <Paperclip className="h-4 w-4" />
              </button>
              {attachmentMenuOpen && (
                <>
                  <button type="button" className="fixed inset-0 z-20 cursor-default" aria-label="Close attachment menu"
                    onClick={() => setAttachmentMenuOpen(false)} />
                  <div className="absolute bottom-full left-0 z-30 mb-2 w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                    <button type="button" onClick={() => {
                      setAttachmentMenuOpen(false)
                      documentInputRef.current?.click()
                    }} className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50">
                      <FileText className="mt-0.5 h-4 w-4 shrink-0 text-[#045E80]" />
                      <span className="min-w-0">
                        <span className="block font-medium">Document</span>
                      </span>
                    </button>
                    <button type="button" onClick={() => {
                      setAttachmentMenuOpen(false)
                      mediaInputRef.current?.click()
                    }} className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50">
                      <ImagePlay className="mt-0.5 h-4 w-4 shrink-0 text-[#045E80]" />
                      <span className="min-w-0">
                        <span className="block font-medium">Photos & videos</span>
                      </span>
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
          <textarea
            ref={textareaRef}
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
              : !isTicketThread ? 'Write a note for the team…'
              : willBePublic ? 'Write a reply the client will see…'
              : 'Write a note for the team (client won’t see this)…'
            }
            className={cn('max-h-40 min-h-[40px] flex-1 resize-none border-0 bg-transparent px-2.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-0',
              body ? 'overflow-y-auto' : 'overflow-hidden')}
          />
          <Button type="submit" size="sm" loading={saving}
                  disabled={!body.trim() && pendingFiles.length === 0}
                  className="h-9 w-9 flex-shrink-0 rounded-full p-0" aria-label="Send message">
            {!saving && <Send className="h-4 w-4" />}
          </Button>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          {canChoose ? (
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-lg bg-slate-100 p-1 text-xs font-medium" role="radiogroup" aria-label="Who can see this comment">
                <button type="button" role="radio" aria-checked={!isPublic} onClick={() => setIsPublic(false)}
                        className={cn('inline-flex items-center gap-1 rounded-md px-2.5 py-1', !isPublic ? 'bg-white text-amber-700 shadow-sm' : 'text-slate-500')}>
                  <Lock className="h-3 w-3" /> Team only
                </button>
                <button type="button" role="radio" aria-checked={isPublic} onClick={() => setIsPublic(true)}
                        className={cn('inline-flex items-center gap-1 rounded-md px-2.5 py-1', isPublic ? 'bg-white text-[#034C68] shadow-sm' : 'text-slate-500')}>
                  <Globe className="h-3 w-3" /> Public (client can see)
                </button>
              </div>
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
