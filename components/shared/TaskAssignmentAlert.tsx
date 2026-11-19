'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { CheckCircle2, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type AssignmentAlertItem = {
  id: string
  title: string
  body: string | null
  task_id: string
  type: string
  created_at: string
}
type SuccessParam = 'scheduled' | 'created' | 'reassigned'

const RECENT_ASSIGNMENT_WINDOW_MS = 5 * 60 * 1000

export function TaskAssignmentAlert({ userId, taskHref = '/tasks' }: { userId: string; taskHref?: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryString = searchParams.toString()
  const successParam = searchParams.get('scheduled') === '1'
    ? 'scheduled'
    : searchParams.get('created') === '1' ? 'created' : null
  const [successToast, setSuccessToast] = useState<{ param: SuccessParam; title: string; body: string } | null>(null)
  const [notices, setNotices] = useState<AssignmentAlertItem[]>([])
  const dismissedNoticeIds = useRef(new Set<string>())
  const taskNoticeIds = useRef(new Map<string, string[]>())
  const dismissedStorageKey = `gp:dismissed-task-alerts:${userId}`

  const refresh = useCallback(async () => {
    try {
      const storedIds: unknown = JSON.parse(window.sessionStorage.getItem(dismissedStorageKey) ?? '[]')
      if (Array.isArray(storedIds)) storedIds.forEach(id => typeof id === 'string' && dismissedNoticeIds.current.add(id))
    } catch { /* Ignore unavailable or malformed session storage. */ }
    const supabase = createClient()
    const { data } = await supabase
      .from('notifications')
      .select('id, title, body, task_id, type, created_at')
      .eq('recipient_id', userId)
      .eq('is_read', false)
      .in('type', ['assigned', 'scheduled_assignment', 'client_task_approved', 'client_task_changes_requested'])
      .not('task_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(50)

    const latestByTask = new Map<string, AssignmentAlertItem>()
    const idsByTask = new Map<string, string[]>()
    for (const item of (data ?? []).filter((item): item is AssignmentAlertItem => Boolean(item.task_id)
      && (!['assigned', 'scheduled_assignment'].includes(item.type)
        || Date.now() - new Date(item.created_at).getTime() <= RECENT_ASSIGNMENT_WINDOW_MS))) {
      if (!dismissedNoticeIds.current.has(item.id)) {
        const ids = idsByTask.get(item.task_id) ?? []
        ids.push(item.id)
        idsByTask.set(item.task_id, ids)
      }
      const previous = latestByTask.get(item.task_id)
      if (!dismissedNoticeIds.current.has(item.id)
        && (!previous || (item.type === 'scheduled_assignment' && previous.type !== 'scheduled_assignment'))) {
        latestByTask.set(item.task_id, item)
      }
    }
    taskNoticeIds.current = idsByTask
    setNotices(Array.from(latestByTask.values()))
  }, [dismissedStorageKey, userId])

  useEffect(() => {
    void refresh()
    const supabase = createClient()
    const channel = supabase
      .channel(`task-assignment-alert-${userId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${userId}`,
      }, () => { void refresh() })
      .subscribe()

    return () => { void supabase.removeChannel(channel) }
  }, [refresh, userId])

  useEffect(() => {
    let timer: number | undefined
    function showReassigned(event: Event) {
      const detail = (event as CustomEvent<{ assigneeName?: string }>).detail
      setSuccessToast({
        param: 'reassigned',
        title: 'Task reassigned',
        body: detail?.assigneeName === 'Unassigned'
          ? 'The task is now unassigned.'
          : `The task is now assigned to ${detail?.assigneeName ?? 'the selected person'}.`,
      })
      if (timer !== undefined) window.clearTimeout(timer)
      timer = window.setTimeout(() => setSuccessToast(current => current?.param === 'reassigned' ? null : current), 5000)
    }
    window.addEventListener('gp:task-reassigned', showReassigned)
    return () => {
      window.removeEventListener('gp:task-reassigned', showReassigned)
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [])

  const clearSuccessParam = useCallback((param: 'scheduled' | 'created') => {
    const nextParams = new URLSearchParams(queryString)
    nextParams.delete(param)
    const query = nextParams.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }, [pathname, queryString, router])

  useEffect(() => {
    if (!successParam) {
      setSuccessToast(null)
      return
    }
    setSuccessToast(successParam === 'scheduled'
      ? {
          param: 'scheduled',
          title: 'Schedule saved',
          body: 'The task will appear when its first assignment runs.',
        }
      : {
          param: 'created',
          title: 'Task assigned',
          body: pathname.startsWith('/tickets/')
            ? 'Tasks for this ticket have been created and assigned.'
            : 'The task has been created and assigned.',
        })
    const timer = window.setTimeout(() => {
      setSuccessToast(null)
      clearSuccessParam(successParam)
    }, 5000)
    return () => window.clearTimeout(timer)
  }, [clearSuccessParam, pathname, successParam])

  const dismiss = useCallback(async (notice: AssignmentAlertItem) => {
    const ids = taskNoticeIds.current.get(notice.task_id) ?? [notice.id]
    for (const id of ids) {
      dismissedNoticeIds.current.add(id)
    }
    try {
      window.sessionStorage.setItem(dismissedStorageKey, JSON.stringify(Array.from(dismissedNoticeIds.current)))
    } catch { /* The alert can still be dismissed for this page session. */ }
    setNotices(current => current.filter(item => item.task_id !== notice.task_id))
    await createClient().from('notifications').update({ is_read: true })
      .eq('recipient_id', userId)
      .in('id', ids)
  }, [dismissedStorageKey, userId])

  useEffect(() => {
    const taskPath = pathname.startsWith(`${taskHref}/`) ? pathname.slice(taskHref.length + 1) : ''
    if (!taskPath || taskPath.includes('/')) return

    const viewedNotices = notices.filter(notice => {
      const taskCode = notice.title.match(/\bGP-\d+\b/)?.[0]
      return taskPath === notice.task_id || taskPath === taskCode
    })
    if (viewedNotices.length === 0) return

    const timers = viewedNotices
      .filter(notice => ['assigned', 'scheduled_assignment'].includes(notice.type))
      .map(notice => window.setTimeout(() => { void dismiss(notice) }, 5000))
    return () => timers.forEach(timer => window.clearTimeout(timer))
  }, [dismiss, notices, pathname, taskHref])

  if (notices.length === 0 && !successToast) return null

  return (
    <div aria-label="Task alerts" className="pointer-events-none fixed right-3 top-[4.5rem] z-40 flex max-h-[calc(100dvh-5.25rem)] w-[min(26rem,calc(100vw-1.5rem))] flex-col gap-2 overflow-y-auto p-1 sm:right-5 sm:top-[4.75rem] sm:w-[min(26rem,calc(100vw-2.5rem))]">
      {successToast && (
        <div key={successToast.param} role="status" className="pointer-events-auto flex items-center gap-2 rounded-lg border border-[#D3E896] bg-[#F5FAE8] px-3 py-2 text-sm text-[#465B17] shadow-lg">
          <CheckCircle2 aria-hidden="true" className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{successToast.title}</span>
            <span className="block text-xs">{successToast.body}</span>
          </span>
          <button type="button" onClick={() => { setSuccessToast(null); if (successToast.param !== 'reassigned') clearSuccessParam(successToast.param) }} aria-label="Dismiss task confirmation" className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#617A25] transition hover:bg-[#EAF4D1] hover:text-[#344711] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#95C12C]">
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
      )}
      {notices.map(notice => (
        <div key={notice.id} role="status" className="pointer-events-auto flex items-center gap-2 rounded-lg border border-slate-200 border-l-4 border-l-[#95C12C] bg-white px-3 py-2 text-sm text-slate-800 shadow-lg">
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">{notice.title.replace(/\b(?:GP|TK)-\d+\s*:?\s*/gi, '').trim() || 'Task update'}</span>
            {notice.body && <span className="block truncate text-xs text-slate-600">{notice.body.replace(/\b(?:GP|TK)-\d+\s*:?\s*/gi, '').trim()}</span>}
          </span>
          <Link href={`${taskHref}/${notice.task_id}`} prefetch={false} className="shrink-0 rounded-md bg-[#95C12C] px-2.5 py-1.5 text-xs font-semibold text-[#151F35] transition-colors hover:bg-[#A5CD3F]">View task</Link>
          <button type="button" onClick={() => dismiss(notice)} aria-label="Dismiss task assignment alert" className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#95C12C]">
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  )
}
