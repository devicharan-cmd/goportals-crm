'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { TicketStatus } from '@/types'

const STATUSES: { value: TicketStatus; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'in_review', label: 'In Review' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'done', label: 'Done' },
]

interface Props {
  ticketId: string
  currentStatus: TicketStatus
  members: { id: string; name: string }[]
  currentAssigneeId: string | null
  actorId?: string | null
}

export default function TicketStatusUpdater({ ticketId, currentStatus, members, currentAssigneeId, actorId }: Props) {
  const [status, setStatus] = useState<TicketStatus>(currentStatus)
  const [assigneeId, setAssigneeId] = useState(currentAssigneeId ?? '')
  const [saving, setSaving] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function save() {
    setSaving(true)

    await supabase
      .from('tickets')
      .update({ status, assignee_id: assigneeId || null })
      .eq('id', ticketId)

    // Write activity log entries
    const logs = []
    if (status !== currentStatus) {
      logs.push({
        ticket_id: ticketId,
        actor_id: actorId ?? null,
        action: 'status_changed',
        old_value: currentStatus,
        new_value: status,
      })
    }
    if (assigneeId !== (currentAssigneeId ?? '')) {
      const oldName = members.find(m => m.id === (currentAssigneeId ?? ''))?.name ?? 'Unassigned'
      const newName = members.find(m => m.id === assigneeId)?.name ?? 'Unassigned'
      logs.push({
        ticket_id: ticketId,
        actor_id: actorId ?? null,
        action: 'assignee_changed',
        old_value: oldName,
        new_value: newName,
      })
    }
    if (logs.length > 0) {
      await supabase.from('activity_logs').insert(logs)
    }

    setSaving(false)
    router.refresh()
  }

  const changed = status !== currentStatus || assigneeId !== (currentAssigneeId ?? '')

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs text-gray-500 mb-1.5">Status</p>
        <div className="space-y-1">
          {STATUSES.map(s => (
            <button
              key={s.value}
              onClick={() => setStatus(s.value)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                status === s.value
                  ? 'bg-blue-600 text-white font-medium'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs text-gray-500 mb-1.5">Assignee</p>
        <select
          value={assigneeId}
          onChange={e => setAssigneeId(e.target.value)}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
        >
          <option value="">Unassigned</option>
          {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </div>
      {changed && (
        <button
          onClick={save}
          disabled={saving}
          className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg"
        >
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      )}
    </div>
  )
}
