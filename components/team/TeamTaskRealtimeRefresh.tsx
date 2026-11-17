'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { showErrorToast } from '@/lib/ui-toast'

type TaskAssigneeChange = { assignee_id?: string | null }

export function TeamTaskRealtimeRefresh({ profileId }: { profileId: string }) {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    let active = true
    let channel: ReturnType<typeof supabase.channel> | null = null
    let refreshTimer: ReturnType<typeof setTimeout> | null = null
    const refresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer)
      refreshTimer = setTimeout(() => router.refresh(), 150)
    }

    void (async () => {
      const { data } = await supabase.auth.getSession()
      if (!active) return
      if (data.session?.access_token) await supabase.realtime.setAuth(data.session.access_token)
      if (!active) return

      const nextChannel = supabase
        .channel(`team-tasks-${profileId}-${crypto.randomUUID()}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, payload => {
          if (payload.eventType === 'DELETE') {
            refresh()
            return
          }

          const next = payload.new as TaskAssigneeChange
          const previous = payload.eventType === 'UPDATE' ? payload.old as TaskAssigneeChange : null
          if (next.assignee_id === profileId || previous?.assignee_id === profileId) refresh()
        })
      channel = nextChannel
      if (!active) {
        void supabase.removeChannel(nextChannel)
        return
      }
      nextChannel.subscribe(status => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          showErrorToast('Live task updates are unavailable. Refresh to see the latest tasks.')
        }
      })
    })()

    return () => {
      active = false
      if (refreshTimer) clearTimeout(refreshTimer)
      if (channel) void supabase.removeChannel(channel)
    }
  }, [profileId, router])

  return null
}
