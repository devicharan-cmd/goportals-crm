import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Plus, Phone, MessageCircle } from 'lucide-react'
import { SERVICE_TYPE_LABELS, LIFECYCLE_STAGE_LABELS } from '@/types'

const DEPT_ORDER = ['ads', 'operations', 'listing', 'reporting', 'grievance', 'setup'] as const

export default async function ClientsPage() {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  const { data: currentMember } = user
    ? await supabase.from('team_members').select('id, is_admin').eq('user_id', user.id).single()
    : { data: null }
  const isAdmin = currentMember?.is_admin ?? false

  let assignedClientIds: string[] | null = null
  if (!isAdmin && currentMember) {
    const { data: assignments } = await supabase
      .from('client_assignments')
      .select('client_id')
      .eq('member_id', currentMember.id)
    assignedClientIds = (assignments ?? []).map((a: any) => a.client_id)
  }

  if (!isAdmin && assignedClientIds !== null && assignedClientIds.length === 0) {
    return (
      <div className="space-y-5">
        <h1 className="text-2xl font-bold text-gray-900">Clients</h1>
        <div className="bg-white rounded-xl border border-gray-200 px-4 py-10 text-center text-sm text-gray-400">
          You haven&apos;t been assigned to any brands yet.
        </div>
      </div>
    )
  }

  let query = supabase
    .from('clients')
    .select('*, primary_member:team_members!primary_member_id(id, name), secondary_member:team_members!secondary_member_id(id, name)')
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  if (!isAdmin && assignedClientIds && assignedClientIds.length > 0) {
    query = query.in('id', assignedClientIds)
  }

  const { data: clients } = await query

  // Dept in-charges
  const { data: allAssignments } = await supabase
    .from('client_assignments')
    .select('client_id, assignment_role, team_members(id, name, avatar_url)')

  // Open ticket counts per client
  const { data: openTicketCounts } = await supabase
    .from('tickets')
    .select('client_id, status')
    .not('status', 'eq', 'done')

  const accountStatusColors: Record<string, string> = {
    'Working':      'bg-green-100 text-green-700',
    'On Hold':      'bg-yellow-100 text-yellow-700',
    'Discontinued': 'bg-red-100 text-red-700',
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clients</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {clients?.length ?? 0} {isAdmin ? 'active brands' : 'assigned brands'}
          </p>
        </div>
        {isAdmin && (
          <Link
            href="/clients/new"
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Brand
          </Link>
        )}
      </div>

      <div className="space-y-4">
        {clients?.map((client: any) => {
          const clientAssignments = (allAssignments ?? []).filter(
            (a: any) => a.client_id === client.id
          )
          const deptInCharges = DEPT_ORDER
            .map(role => clientAssignments.find((a: any) => a.assignment_role === role))
            .filter(Boolean)

          const openCount = (openTicketCounts ?? []).filter(
            (t: any) => t.client_id === client.id
          ).length

          return (
            <div key={client.id} className="bg-white rounded-xl border border-gray-200 p-5">

              {/* ── Top row: name + badges + health + status ── */}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <Link
                    href={`/clients/${client.id}`}
                    className="text-base font-semibold text-gray-900 hover:text-blue-600"
                  >
                    {client.name}
                  </Link>
                  {client.industry && (
                    <span className="ml-2 text-xs text-gray-400">{client.industry}</span>
                  )}
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span className="text-xs bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-medium">
                      {SERVICE_TYPE_LABELS[client.service_type as keyof typeof SERVICE_TYPE_LABELS]}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      client.lifecycle_stage === 'onboarding' ? 'bg-yellow-100 text-yellow-700' :
                      client.lifecycle_stage === 'setup'      ? 'bg-blue-100 text-blue-700' :
                      client.lifecycle_stage === 'scale'      ? 'bg-green-100 text-green-700' :
                      client.lifecycle_stage === 'retention'  ? 'bg-purple-100 text-purple-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {LIFECYCLE_STAGE_LABELS[client.lifecycle_stage as keyof typeof LIFECYCLE_STAGE_LABELS]}
                    </span>
                    {client.platforms?.map((p: string) => (
                      <span key={p} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded capitalize">{p}</span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {/* Account status badge */}
                  {client.account_status && (
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${accountStatusColors[client.account_status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {client.account_status}
                    </span>
                  )}
                  {client.health_score != null && (
                    <div className="text-right">
                      <p className="text-xs text-gray-400 mb-0.5">Health</p>
                      <span className={`text-sm font-bold ${
                        client.health_score >= 80 ? 'text-green-600' :
                        client.health_score >= 50 ? 'text-yellow-600' : 'text-red-600'
                      }`}>{client.health_score}</span>
                    </div>
                  )}
                  <Link
                    href={`/clients/${client.id}`}
                    className="text-xs border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50"
                  >
                    View profile
                  </Link>
                </div>
              </div>

              {/* ── NEW: Listing stats row ── */}
              <div className="grid grid-cols-4 gap-3 mb-4">
                <div className="bg-gray-50 rounded-lg px-3 py-2.5">
                  <p className="text-xs text-gray-400 mb-1">Total Listings</p>
                  <p className="text-lg font-bold text-gray-900">{client.total_listings ?? 0}</p>
                </div>
                <div className="bg-gray-50 rounded-lg px-3 py-2.5">
                  <p className="text-xs text-gray-400 mb-1">Live Listings</p>
                  <p className="text-lg font-bold text-green-600">{client.live_listings ?? 0}</p>
                </div>
                <div className="bg-gray-50 rounded-lg px-3 py-2.5">
                  <p className="text-xs text-gray-400 mb-1">Pending Tasks</p>
                  <p className="text-lg font-bold text-amber-600">{openCount}</p>
                </div>
                <div className="bg-gray-50 rounded-lg px-3 py-2.5">
                  <p className="text-xs text-gray-400 mb-1">Retainer</p>
                  <p className="text-lg font-bold text-gray-900">
                    {client.monthly_retainer ? `₹${Number(client.monthly_retainer).toLocaleString('en-IN')}` : '—'}
                  </p>
                </div>
              </div>

              {/* ── Brand rep row ── */}
              {client.contact_name && (
                <div className="flex items-center gap-3 bg-blue-50 rounded-lg px-3 py-2 mb-4 flex-wrap">
                  <span className="text-xs text-blue-500 font-medium shrink-0">Brand rep</span>
                  <span className="text-sm font-medium text-gray-900">{client.contact_name}</span>
                  {client.contact_phone && (
                    <span className="flex items-center gap-1 text-xs text-gray-500">
                      <Phone className="w-3 h-3" />{client.contact_phone}
                    </span>
                  )}
                  {client.contact_email && (
                    <span className="text-xs text-gray-500">{client.contact_email}</span>
                  )}
                  {client.whatsapp_group_link && (
                    <a
                      href={client.whatsapp_group_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full"
                    >
                      <MessageCircle className="w-3 h-3" />WhatsApp
                    </a>
                  )}
                </div>
              )}

              {/* ── Dept in-charges ── */}
              {deptInCharges.length > 0 ? (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                    Department in-charges
                  </p>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                    {deptInCharges.map((a: any) => {
                      const member = a.team_members
                      return (
                        <div key={a.assignment_role} className="bg-gray-50 rounded-lg px-3 py-2">
                          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1.5 capitalize">
                            {a.assignment_role}
                          </p>
                          <div className="flex items-center gap-1.5">
                            <div className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold shrink-0">
                              {member?.name?.charAt(0) ?? '?'}
                            </div>
                            <span className="text-xs font-medium text-gray-800 truncate">
                              {member?.name ?? '—'}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : (
                (client.primary_member || client.secondary_member) && (
                  <div className="flex items-center gap-4">
                    {client.primary_member && (
                      <div className="flex items-center gap-1.5">
                        <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold">
                          {client.primary_member.name.charAt(0)}
                        </div>
                        <span className="text-xs font-medium">{client.primary_member.name}</span>
                      </div>
                    )}
                    {client.secondary_member && (
                      <div className="flex items-center gap-1.5">
                        <div className="w-6 h-6 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-xs font-bold">
                          {client.secondary_member.name.charAt(0)}
                        </div>
                        <span className="text-xs text-gray-500">{client.secondary_member.name}</span>
                      </div>
                    )}
                  </div>
                )
              )}
            </div>
          )
        })}

        {(!clients || clients.length === 0) && (
          <div className="bg-white rounded-xl border border-gray-200 px-4 py-10 text-center text-gray-400 text-sm">
            No clients yet.{' '}
            {isAdmin && <Link href="/clients/new" className="text-blue-600 hover:underline">Add your first brand →</Link>}
          </div>
        )}
      </div>
    </div>
  )
}
