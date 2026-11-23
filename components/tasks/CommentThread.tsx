'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { MoreHorizontal, Trash2, Globe, Lock, MessageSquare, Send, X, FileText, RotateCcw } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Avatar } from '@/components/ui/primitives'
import { Button } from '@/components/ui/button'
import { AttachmentPicker } from '@/components/shared/AttachmentPicker'
import { FileAttachmentDownload } from '@/components/shared/FileAttachmentDownload'
import { ROLE_LABELS, ROLE_STYLES } from '@/lib/constants'
import { cn, errorMessage, splitTeamName } from '@/lib/utils'
import type { AppRole } from '@/types/database'
import { useSingleFlight } from '@/components/shared/useSingleFlight'

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

/** Task-comment actions. */
function MessageMenu({ commentId, table, canDelete, mine, attachments }: {
  commentId: string
  table: 'task_comments'
  canDelete: boolean
  mine: boolean
  attachments: CommentAttachment[]
}) {
  const router = useRouter()
  const runOnce = useSingleFlight()
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
                onClick={() => void runOnce('delete-comment', remove)}
                disabled={working}
                className="mt-2.5 flex w-full items-center gap-1.5 rounded-lg border-t border-slate-100 px-1 pt-2 text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" /> {working ? 'Deleting…' : 'Delete message'}
              </button>
            )}
            {error && <span className="mt-1.5 block text-xs text-red-600">{error}</span>}
          </span>
        </>
      )}
    </span>
  )
}

function AttachmentMenu({ attachment, canDelete }: { attachment: CommentAttachment; canDelete: boolean }) {
  const router = useRouter()
  const runOnce = useSingleFlight()
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
            <button type="button" onClick={() => void runOnce('delete-attachment', remove)} disabled={working}
              className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50">
              <Trash2 className="h-3.5 w-3.5" /> {working ? 'Deleting…' : 'Delete file'}
            </button>
            {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
          </span>
        </>
      )}
    </span>
  )
}

export function CommentThread({
  taskId, comments, names, roles, avatarUrls, meId, myRole, attachments = [], lockedNote, bounded = false, readOnly = false,
}: {
  taskId: string
  comments: CommentLike[]
  names: Record<string, string>
  roles?: Record<string, AppRole>
  avatarUrls?: Record<string, string | null>
  attachments?: CommentAttachment[]
  meId: string
  myRole: AppRole
  /** Shown instead of the composer when the thread takes no more replies. */
  lockedNote?: string
  bounded?: boolean
  readOnly?: boolean
}) {
  const router = useRouter()
  const runOnce = useSingleFlight()
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [requestChanges, setRequestChanges] = useState(false)
  const [visibleComments, setVisibleComments] = useState<CommentLike[]>(comments)
  const [visibleAttachments, setVisibleAttachments] = useState<CommentAttachment[]>(attachments)

  useEffect(() => setVisibleComments(comments), [comments])
  useEffect(() => setVisibleAttachments(attachments), [attachments])

  useEffect(() => {
    if (myRole !== 'client') return
    function focusRequestComposer(event: Event) {
      const detail = (event as CustomEvent<{ taskId: string }>).detail
      if (detail?.taskId !== taskId) return
      setRequestChanges(true)
      document.getElementById('conversation')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      window.setTimeout(() => textareaRef.current?.focus(), 250)
    }
    window.addEventListener('task-request-changes', focusRequestComposer)
    return () => window.removeEventListener('task-request-changes', focusRequestComposer)
  }, [myRole, taskId])

  const willBePublic = myRole === 'client' ? true
    : myRole !== 'employee'

  // Newest message in view on open and after sending, like any chat.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [visibleComments.length])

  async function loadComment(commentId: string) {
    const client = createClient()
    const [{ data: comment }, { data: rows }] = await Promise.all([
      client.from('task_comments').select('id, author_id, body, is_internal, is_change_request, created_at').eq('id', commentId).maybeSingle(),
      client.from('task_attachments').select('id, comment_id, uploaded_by, storage_path, file_name, mime_type, size_bytes').eq('comment_id', commentId),
    ])
    if (!comment) return
    const attachmentRows = rows ?? []
    const paths = attachmentRows.map(row => row.storage_path)
    const [{ data: signed }, { data: downloads }] = paths.length
      ? await Promise.all([
          client.storage.from('task-files').createSignedUrls(paths, 3600),
          client.storage.from('task-files').createSignedUrls(paths, 3600, { download: true }),
        ])
      : [{ data: [] }, { data: [] }]
    const signedByPath = new Map((signed ?? []).map(item => [item.path, item.signedUrl]))
    const downloadByPath = new Map((downloads ?? []).map(item => [item.path, item.signedUrl]))
    const nextAttachments = attachmentRows.flatMap(row => {
      const signedUrl = signedByPath.get(row.storage_path)
      const downloadUrl = downloadByPath.get(row.storage_path)
      return signedUrl && downloadUrl ? [{ ...row, signedUrl, downloadUrl }] : []
    })
    setVisibleComments(current => current.some(item => item.id === comment.id)
      ? current.map(item => item.id === comment.id ? comment as CommentLike : item)
      : [...current, comment as CommentLike].sort((a, b) => a.created_at.localeCompare(b.created_at)))
    setVisibleAttachments(current => [
      ...current.filter(item => item.comment_id !== comment.id),
      ...nextAttachments,
    ] as CommentAttachment[])
  }

  // Keep the open task discussion in sync for every participant. Attachments
  // are loaded together with the new comment, so messages and their files
  // appear in place without refreshing the page.
  useEffect(() => {
    const client = createClient()
    const channel = client
      .channel(`task-comments-live-${taskId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'task_comments',
        filter: `task_id=eq.${taskId}`,
      }, payload => {
        const record = payload.new as { id?: unknown }
        const previous = payload.old as { id?: unknown }
        const commentId = typeof record.id === 'string' ? record.id : typeof previous.id === 'string' ? previous.id : null
        if (!commentId) return
        if (payload.eventType === 'DELETE') {
          setVisibleComments(current => current.filter(comment => comment.id !== commentId))
          setVisibleAttachments(current => current.filter(attachment => attachment.comment_id !== commentId))
          return
        }
        void loadComment(commentId)
      })
      .subscribe()

    return () => { void client.removeChannel(channel) }
  }, [router, taskId])

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

    const attachmentData = uploaded.map(({ file, path }) => ({
      storage_path: path,
      file_name: file.name,
      mime_type: file.type || null,
      size_bytes: file.size,
    }))
    const { data: commentId, error: commentError } = requestChanges && myRole === 'client'
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
    const sendError = commentError ? errorMessage(commentError) : null

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
    if (typeof commentId === 'string') await loadComment(commentId)
  }

  return (
    <div className={bounded ? 'flex h-full min-h-0 flex-col' : undefined}>
      {visibleComments.length === 0 ? (
        <p className={cn('flex items-center gap-2 py-6 text-sm text-slate-400', bounded && 'min-h-0 flex-1 justify-center')}>
          <MessageSquare className="h-4 w-4" /> {readOnly ? 'No messages yet.' : 'No messages yet — say hello.'}
        </p>
      ) : (
        <div ref={scrollRef} className={cn('space-y-1 overflow-y-auto overscroll-contain scroll-smooth pr-1', bounded ? 'min-h-0 flex-1' : 'max-h-[26rem]')}>
          {visibleComments.map((c, i) => {
            const author = c.author_id ?? ''
            const role = roles?.[author]
            const [senderName, senderQualifier] = splitTeamName(names[author] ?? '')
            const mine = author === meId
            const prev = comments[i - 1]
            const newDay = !prev || dayLabel(prev.created_at) !== dayLabel(c.created_at)
            const newBlock = newDay || prev?.author_id !== c.author_id || prev?.is_internal !== c.is_internal
            return (
              <div key={c.id}>
                {newDay && (
                  <div className="my-3 flex items-center gap-3">
                    <span className="h-px flex-1 bg-slate-100" />
                    <span className="text-xs font-medium uppercase tracking-wide text-slate-400">{dayLabel(c.created_at)}</span>
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
                          {senderQualifier && <span className="ml-1 text-xs font-normal text-slate-500">({senderQualifier})</span>}
                        </span>
                        {role && <span className={ROLE_STYLES[role].text}>{ROLE_LABELS[role]}</span>}
                      </span>
                    )}
                    <div className={cn('rounded-2xl px-3.5 py-2 text-sm shadow-sm ring-1 ring-inset transition-shadow hover:shadow-md',
                      c.is_internal
                        ? 'bg-amber-50 text-amber-900 ring-amber-200'
                        : mine
                          ? 'bg-[#045E80] text-white ring-[#045E80]'
                          : 'bg-white text-slate-700 ring-slate-200',
                      newBlock && (mine ? 'rounded-br-md' : 'rounded-bl-md'))}>
                      {c.is_change_request && (
                        <span className="mb-1.5 inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-xs font-semibold text-orange-700 ring-1 ring-inset ring-orange-200">
                          <RotateCcw className="h-3 w-3" /> Change request
                        </span>
                      )}
                      {c.body.trim() && <p className="whitespace-pre-wrap break-words">{c.body}</p>}
                      {visibleAttachments.filter(attachment => attachment.comment_id === c.id).map(attachment => {
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
                                <FileAttachmentDownload className="mt-1" fileName={attachment.file_name} sizeBytes={attachment.size_bytes} downloadUrl={attachment.downloadUrl} />
                              </div>
                            ) : isVideo ? (
                              <div className="min-w-0">
                                <video src={attachment.signedUrl} controls preload="metadata" className="max-h-64 max-w-full rounded-lg" />
                                <FileAttachmentDownload className="mt-1" fileName={attachment.file_name} sizeBytes={attachment.size_bytes} downloadUrl={attachment.downloadUrl} />
                              </div>
                            ) : (
                              <FileAttachmentDownload fileName={attachment.file_name} sizeBytes={attachment.size_bytes} downloadUrl={attachment.downloadUrl} />
                            )}
                            <AttachmentMenu attachment={attachment} canDelete={!readOnly && attachment.uploaded_by === meId} />
                          </div>
                        )
                      })}
                    </div>
                    <span className={cn('mt-0.5 flex items-center gap-1.5 px-1 text-xs text-slate-400', mine && 'flex-row-reverse')}>
                      <span suppressHydrationWarning>{clockTime(c.created_at)}</span>
                      {mine && !readOnly && (
                        <MessageMenu commentId={c.id} table="task_comments"
                                     mine={mine} canDelete={mine}
                                     attachments={visibleAttachments.filter(attachment => attachment.comment_id === c.id)} />
                      )}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {readOnly ? (
        <p className="mt-5 rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-500 ring-1 ring-inset ring-slate-200">
          You previously worked on this task. You can view its discussion, but cannot add or change messages.
        </p>
      ) : lockedNote ? (
        <p className="mt-5 rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-500 ring-1 ring-inset ring-slate-200">{lockedNote}</p>
      ) : (
      <form onSubmit={event => void runOnce('send-comment', () => submit(event))} className="mt-5">
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
        {pendingFiles.length > 0 && (
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
          <AttachmentPicker
            disabled={saving}
            onFilesSelected={(accepted, rejected) => {
              if (rejected.length) {
                setError(`GIF, audio, and unsupported file types cannot be attached: ${rejected.map(file => file.name).join(', ')}`)
              } else {
                setError('')
              }
              if (accepted.length) setPendingFiles(files => [...files, ...accepted])
            }}
          />
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
              : 'Write a note for the team…'
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
          <span className="inline-flex items-center gap-1 text-xs text-slate-500">
            {myRole === 'employee'
              ? <><Lock className="h-3 w-3 text-amber-600" /> Visible to the GoPortals team only</>
              : <><Globe className="h-3 w-3" /> Visible to the GoPortals team</>}
          </span>
          <span className="text-xs text-slate-400">Enter to send · Shift + Enter for a new line</span>
        </div>
      </form>
      )}
    </div>
  )
}
