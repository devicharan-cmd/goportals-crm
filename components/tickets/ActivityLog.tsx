'use client'

import { Activity } from 'lucide-react'

type ActivityEntry = {
  id: string
  action: string
  old_value: string | null
  new_value: string | null
  created_at: string
  actor: { name: string } | null
}

const ACTION_LABELS: Record<string, string> = {
  status_changed: 'changed status',
  assignee_changed: 'changed assignee',
  priority_changed: 'changed priority',
  ticket_created: 'created this ticket',
  comment_added: 'added a comment',
  time_logged: 'logged time',
}

function formatTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function Arrow() {
  return <span className="text-gray-400 mx-1">→</span>
}

export default function ActivityLog({ entries }: { entries: ActivityEntry[] }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
        <Activity className="w-4 h-4 text-gray-400" />
        <h2 className="font-semibold text-gray-900">Activity</h2>
        <span className="text-xs text-gray-400">{entries.length} events</span>
      </div>

      <div className="divide-y divide-gray-50">
        {entries.map(entry => (
          <div key={entry.id} className="px-5 py-3 flex items-start gap-3">
            <span className="w-6 h-6 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
              {entry.actor?.name?.charAt(0) ?? '?'}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-700">
                <span className="font-medium">{entry.actor?.name ?? 'System'}</span>
                {' '}{ACTION_LABELS[entry.action] ?? entry.action}
                {entry.old_value && entry.new_value && (
                  <span className="text-gray-500">
                    {' '}
                    <span className="line-through text-gray-400">{entry.old_value.replace(/_/g, ' ')}</span>
                    <Arrow />
                    <span className="text-gray-800 font-medium">{entry.new_value.replace(/_/g, ' ')}</span>
                  </span>
                )}
                {!entry.old_value && entry.new_value && (
                  <span className="text-gray-500"> — <span className="font-medium text-gray-800">{entry.new_value.replace(/_/g, ' ')}</span></span>
                )}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">{formatTime(entry.created_at)}</p>
            </div>
          </div>
        ))}
        {entries.length === 0 && (
          <div className="px-5 py-5 text-center text-sm text-gray-400">No activity yet</div>
        )}
      </div>
    </div>
  )
}
