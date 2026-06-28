import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Edit, Plus } from 'lucide-react'
import { SERVICE_TYPE_LABELS, LIFECYCLE_STAGE_LABELS } from '@/types'
import { formatDate } from '@/lib/utils'
import AssignMembersPanel from '@/components/clients/AssignMembersPanel'
import CreatePortalUserButton from '@/components/clients/CreatePortalUserButton'

export default async function ClientDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  const { data: currentMember } = user
    ? await supabase.from('team_members').select('id, is_admin').eq('user_id', user.id).single()
    : { data: null }
  const isAdmin = currentMember?.is_admin ?? false

  const [{ data: client }, { data: tickets }, { data: allMembers }, { data: assignments }] = await Promise.all([
    supabase
      .from('clients')
      .select('*, primary_member:team_members!primary_member_id(id, name, email), secondary_member:team_members!secondary_member_id(id, name, email)')
      .eq('id', params.id)
      .single(),
    supabase
      .from('tickets')
      .select('*, assignee:team_members!assignee_id(name)')
      .eq('client_id', params.id)
      .order('created_at', { ascending: false })
      .limit(20),
    isAdmin
      ? supabase.from('team_members').select('id, name, role').eq('is_active', true).order('name')
      : { data: [] },
    isAdmin
      ? supabase.from('client_assignments').select('member_id').eq('client_id', params.id)
      : { data: [] },
  ])

  if (!client) notFound()

  const assignedIds = (assignments ?? []).map((a: any) => a.member_id)
  const openCount = tickets?.filter(t => t.status !== 'done').length ?? 0
  const doneCount = tickets?.filter(t => t.status === 'done').length ?? 0

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Link href="/clients" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{client.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm text-gray-500">{SERVICE_TYPE_LABELS[client.service_type as keyof typeof SERVICE_TYPE_LABELS]}</span>
              <span className="text-gray-300">·</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                client.lifecycle_stage === 'onboarding' ? 'bg-yellow-100 text-yellow-700' :
                client.lifecycle_stage === 'scale' ? 'bg-green-100 text-green-700' :
                'bg-blue-100 text-blue-700'
              }`}>
                {LIFECYCLE_STAGE_LABELS[client.lifecycle_stage as keyof typeof LIFECYCLE_STAGE_LABELS]}
              </span>
            </div>
          </div>
        </div>
        {isAdmin && (
          <Link href={`/clients/${client.id}/edit`} className="inline-flex items-center gap-2 text-sm text-gray-600 border border-gray-200 hover:border-gray-300 px-3 py-1.5 rounded-lg">
            <Edit className="w-4 h-4" />
            Edit
          </Link>
        )}
      </div>

      <div className="grid grid-cols-3 gap-5">
        <div className="col-span-2 space-y-5">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-4">Brand Details</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-400 text-xs mb-1">Contact</p>
                <p className="font-medium">{client.contact_name || '—'}</p>
                <p className="text-gray-500">{client.contact_email || ''}</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs mb-1">Contract</p>
                <p>{formatDate(client.contract_start)} → {formatDate(client.contract_end)}</p>
                {client.monthly_retainer && (
                  <p className="text-gray-500">₹{client.monthly_retainer.toLocaleString()}/mo</p>
                )}
              </div>
              <div>
                <p className="text-gray-400 text-xs mb-1">Platforms</p>
                <div className="flex flex-wrap gap-1">
                  {client.platforms?.map((p: string) => (
                    <span key={p} className="text-xs bg-gray-100 px-2 py-0.5 rounded capitalize">{p}</span>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-gray-400 text-xs mb-1">Health Score</p>
                <span className={`text-lg font-bold ${
                  (client.health_score ?? 0) >= 80 ? 'text-green-600' :
                  (client.health_score ?? 0) >= 50 ? 'text-yellow-600' : 'text-red-600'
                }`}>{client.health_score ?? '—'}</span>
              </div>
            </div>
            {client.notes && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-gray-400 text-xs mb-1">Notes</p>
                <p className="text-sm text-gray-700">{client.notes}</p>
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-200">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h2 className="font-semibold text-gray-900">Tickets</h2>
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{openCount} open</span>
                <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full">{doneCount} done</span>
              </div>
              <Link href={`/tickets/new?client_id=${client.id}`} className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700">
                <Plus className="w-3.5 h-3.5" />
                New ticket
              </Link>
            </div>
            <div className="divide-y divide-gray-50">
              {tickets?.map((ticket: any) => (
                <Link key={ticket.id} href={`/tickets/${ticket.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50">
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                    ticket.priority === 'P1' ? 'bg-red-100 text-red-700' :
                    ticket.priority === 'P2' ? 'bg-orange-100 text-orange-700' :
                    'bg-blue-100 text-blue-700'
                  }`}>{ticket.priority}</span>
                  <span className="text-sm text-gray-900 flex-1">{ticket.title}</span>
                  {ticket.platform && <span className="text-xs text-gray-400 capitalize">{ticket.platform}</span>}
                  {ticket.external_ref && <span className="text-xs text-gray-400 font-mono">{ticket.external_ref}</span>}
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    ticket.status === 'done' ? 'bg-green-100 text-green-700' :
                    ticket.status === 'blocked' ? 'bg-red-100 text-red-700' :
                    ticket.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>{ticket.status.replace('_', ' ')}</span>
                </Link>
              ))}
              {(!tickets || tickets.length === 0) && (
                <div className="px-5 py-6 text-center text-sm text-gray-400">No tickets for this brand yet</div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-5">
          {isAdmin && (
            <AssignMembersPanel
              clientId={client.id}
              allMembers={(allMembers ?? []) as any[]}
              assignedIds={assignedIds}
            />
          )}
          {isAdmin && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="font-semibold text-gray-900 mb-1">Client Portal</h2>
              <p className="text-xs text-gray-400 mb-3">Give this brand&apos;s contact their own portal login.</p>
              <CreatePortalUserButton
                clientId={client.id}
                defaultEmail={client.contact_email ?? ''}
                defaultName={client.contact_name ?? ''}
              />
            </div>
          )}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-4">Assigned Team</h2>
            <div className="space-y-3">
              {client.primary_member && (
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold">
                    {client.primary_member.name.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{client.primary_member.name}</p>
                    <p className="text-xs text-gray-400 capitalize">{client.primary_work_role?.replace('_', ' ')}</p>
                  </div>
                </div>
              )}
              {client.secondary_member && (
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-xs font-bold">
                    {client.secondary_member.name.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{client.secondary_member.name}</p>
                    <p className="text-xs text-gray-400 capitalize">{client.secondary_work_role?.replace('_', ' ')}</p>
                  </div>
                </div>
              )}
              {!client.primary_member && !client.secondary_member && (
                <p className="text-sm text-gray-400">No team members assigned</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
