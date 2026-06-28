import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { SERVICE_TYPE_LABELS, LIFECYCLE_STAGE_LABELS } from '@/types'

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
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clients</h1>
          <p className="text-sm text-gray-500 mt-0.5">Your assigned brands</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 px-4 py-10 text-center text-sm text-gray-400">
          You haven&apos;t been assigned to any brands yet. Ask your admin to assign you.
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

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-left">
              <th className="px-4 py-3 font-medium text-gray-600">Brand</th>
              <th className="px-4 py-3 font-medium text-gray-600">Service</th>
              <th className="px-4 py-3 font-medium text-gray-600">Stage</th>
              <th className="px-4 py-3 font-medium text-gray-600">Team</th>
              <th className="px-4 py-3 font-medium text-gray-600">Platforms</th>
              <th className="px-4 py-3 font-medium text-gray-600">Health</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {clients?.map((client: any) => (
              <tr key={client.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <Link href={`/clients/${client.id}`} className="font-medium text-gray-900 hover:text-blue-600">
                    {client.name}
                  </Link>
                  {client.industry && (
                    <p className="text-xs text-gray-400">{client.industry}</p>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {SERVICE_TYPE_LABELS[client.service_type as keyof typeof SERVICE_TYPE_LABELS]}
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    client.lifecycle_stage === 'onboarding' ? 'bg-yellow-100 text-yellow-700' :
                    client.lifecycle_stage === 'setup' ? 'bg-blue-100 text-blue-700' :
                    client.lifecycle_stage === 'scale' ? 'bg-green-100 text-green-700' :
                    client.lifecycle_stage === 'retention' ? 'bg-purple-100 text-purple-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {LIFECYCLE_STAGE_LABELS[client.lifecycle_stage as keyof typeof LIFECYCLE_STAGE_LABELS]}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-600">
                  <div className="flex flex-col gap-0.5">
                    {client.primary_member && (
                      <span className="text-xs">{client.primary_member.name}</span>
                    )}
                    {client.secondary_member && (
                      <span className="text-xs text-gray-400">{client.secondary_member.name}</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {client.platforms?.map((p: string) => (
                      <span key={p} className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded capitalize">{p}</span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3">
                  {client.health_score != null ? (
                    <span className={`font-semibold ${
                      client.health_score >= 80 ? 'text-green-600' :
                      client.health_score >= 50 ? 'text-yellow-600' :
                      'text-red-600'
                    }`}>
                      {client.health_score}
                    </span>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>
              </tr>
            ))}
            {(!clients || clients.length === 0) && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-gray-400">
                  No clients yet.{' '}
                  {isAdmin && <Link href="/clients/new" className="text-blue-600 hover:underline">Add your first brand →</Link>}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
