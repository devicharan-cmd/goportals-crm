import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Edit } from 'lucide-react'
import { formatDate, formatRelative } from '@/lib/utils'
import { STATUS_COLORS, PRIORITY_COLORS } from '@/types'
import TicketStatusUpdater from '@/components/tickets/TicketStatusUpdater'
import CommentBox from '@/components/tickets/CommentBox'
import TimeLogBox from '@/components/tickets/TimeLogBox'
import ActivityLog from '@/components/tickets/ActivityLog'

export default async function TicketDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient()

  const { data: ticket } = await supabase
    .from('tickets')
    .select(`
      *,
      client:clients(id, name),
      assignee:team_members!assignee_id(id, name, avatar_url),
      reporter:team_members!reporter_id(id, name),
      comments(id, content, created_at, author:team_members!author_id(id, name))
    `)
    .eq('id', params.id)
    .single()

  if (!ticket) notFound()

  const { data: members } = await supabase
    .from('team_members')
    .select('id, name')
    .eq('is_active', true)

  const [{ data: timeLogs }, { data: activityLogs }, { data: currentUser }] = await Promise.all([
    supabase
      .from('time_logs')
      .select('id, hours, logged_date, notes, member:team_members!member_id(name)')
      .eq('ticket_id', params.id)
      .order('logged_date', { ascending: false }),
    supabase
      .from('activity_logs')
      .select('id, action, old_value, new_value, created_at, actor:team_members!actor_id(name)')
      .eq('ticket_id', params.id)
      .order('created_at', { ascending: false }),
    supabase.auth.getUser(),
  ])

  // Resolve current user to team_member id for activity logging
  const { data: actorRow } = currentUser?.user
    ? await supabase
        .from('team_members')
        .select('id')
        .eq('user_id', currentUser.user.id)
        .single()
    : { data: null }

  return (
    <div className="max-w-4xl space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/tickets" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs font-bold px-2 py-0.5 rounded ${PRIORITY_COLORS[ticket.priority as keyof typeof PRIORITY_COLORS]}`}>
              {ticket.priority}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${STATUS_COLORS[ticket.status as keyof typeof STATUS_COLORS]}`}>
              {ticket.status.replace(/_/g, ' ')}
            </span>
            {ticket.platform && (
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded capitalize">{ticket.platform}</span>
            )}
          </div>
          <h1 className="text-xl font-bold text-gray-900">{ticket.title}</h1>
        </div>
      </div>

      <div className="flex justify-end">
        <Link
          href={`/tickets/${ticket.id}/edit`}
          className="inline-flex items-center gap-2 text-sm text-gray-600 border border-gray-200 hover:border-gray-300 px-3 py-1.5 rounded-lg"
        >
          <Edit className="w-4 h-4" />
          Edit Ticket
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-5">
        {/* Main */}
        <div className="col-span-2 space-y-5">
          {/* Description */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-3">Description</h2>
            {ticket.description ? (
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{ticket.description}</p>
            ) : (
              <p className="text-sm text-gray-400">No description</p>
            )}
          </div>

          {/* Time Logging */}
          <TimeLogBox
            ticketId={ticket.id}
            logs={(timeLogs ?? []) as any}
            members={members ?? []}
          />

          {/* Comments */}
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Comments ({ticket.comments?.length ?? 0})</h2>
            </div>
            <div className="divide-y divide-gray-50">
              {ticket.comments?.map((comment: any) => (
                <div key={comment.id} className="px-5 py-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold">
                      {comment.author?.name?.charAt(0)}
                    </span>
                    <span className="text-sm font-medium text-gray-900">{comment.author?.name}</span>
                    <span className="text-xs text-gray-400">{formatRelative(comment.created_at)}</span>
                  </div>
                  <p className="text-sm text-gray-700 ml-8">{comment.content}</p>
                </div>
              ))}
            </div>
            <div className="px-5 py-4 border-t border-gray-100">
              <CommentBox ticketId={ticket.id} />
            </div>
          </div>

          {/* Activity Log */}
          <ActivityLog entries={(activityLogs ?? []) as any} />
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Status update */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3">Status</h3>
            <TicketStatusUpdater ticketId={ticket.id} currentStatus={ticket.status} members={members ?? []} currentAssigneeId={ticket.assignee_id} actorId={actorRow?.id ?? null} />
          </div>

          {/* Meta */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3 text-sm">
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Client</p>
              <Link href={`/clients/${ticket.client?.id}`} className="font-medium text-blue-600 hover:underline">
                {ticket.client?.name}
              </Link>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Assignee</p>
              <p className="font-medium">{ticket.assignee?.name || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Due Date</p>
              <p className={ticket.due_date && new Date(ticket.due_date) < new Date() && ticket.status !== 'done' ? 'text-red-600 font-medium' : ''}>
                {formatDate(ticket.due_date)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Estimated</p>
              <p>{ticket.estimated_hours}h</p>
            </div>
            {ticket.external_ref && (
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Case / Ref ID</p>
                <p className="font-mono text-xs">{ticket.external_ref}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Created</p>
              <p>{formatRelative(ticket.created_at)}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
