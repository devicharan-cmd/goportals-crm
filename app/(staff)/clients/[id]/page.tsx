import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, FileSignature, Mail, MessageCircle, Phone, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { assigneeOptionsFor, getStaffLookups, nameMap, TASK_LIST_SELECT } from '@/lib/queries'
import { ButtonLink } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/primitives'
import { AccountStatusBadge, Badge } from '@/components/ui/badges'
import { TaskTable } from '@/components/tasks/TaskTable'
import { ClientFormModal } from '@/components/clients/ClientFormModal'
import {
  ApprovalActions, ClientPlatformsEditor, ClientServicesEditor, ClientStatusSelect, ClientTeamEditor, InviteLoginButton,
  type ClientPlatformRow, type ClientServiceRow, type ClientTeamRow,
} from '@/components/clients/ClientEditors'
import { DeleteButton } from '@/components/shared/DeleteButton'
import { STAGE_LABELS } from '@/lib/constants'
import { formatDate, formatINR } from '@/lib/utils'
import type { Client, ClientInternal, TaskListItem } from '@/types/database'

export default async function ClientDetailPage({ params }: { params: { id: string } }) {
  const me = await requireRole(['super_admin', 'manager'])
  const supabase = createClient()
  const id = params.id

  const [{ data: clientData }, { data: internalData }, { data: platforms }, { data: services }, { data: team }, { data: tasks }, { data: acceptances }, lookups] =
    await Promise.all([
      supabase.from('clients').select('*').eq('id', id).maybeSingle(),
      supabase.from('client_internal').select('*').eq('client_id', id).maybeSingle(),
      supabase.from('client_platforms').select('platform_id').eq('client_id', id),
      supabase.from('client_services').select('id, service_id, custom_name, status').eq('client_id', id).order('created_at'),
      supabase.from('client_team').select('profile_id, department_id').eq('client_id', id),
      supabase.from('tasks').select(TASK_LIST_SELECT).eq('client_id', id).order('status').order('due_date', { nullsFirst: false }).limit(100),
      supabase.from('agreement_acceptances').select('accepted_at, agreement:agreements(version)').eq('client_id', id).order('accepted_at', { ascending: false }),
      getStaffLookups(),
    ])
  if (!clientData) notFound()
  const client = clientData as Client
  const internal = internalData as ClientInternal | null
  const names = nameMap(lookups.people)

  const isAdmin = me.role === 'super_admin'
  const myDepts = lookups.departmentMembers.filter(m => m.profile_id === me.id).map(m => m.department_id)
  const teamRows = (team ?? []) as ClientTeamRow[]
  const managerCovers = me.role === 'manager' && teamRows.some(r => r.profile_id === me.id || myDepts.includes(r.department_id))
  const canEdit = isAdmin || managerCovers
  const allTasks = (tasks ?? []) as TaskListItem[]
  const openTasks = allTasks.filter(t => t.status !== 'done')
  const doneTasks = allTasks.filter(t => t.status === 'done')
  const accepted = (acceptances ?? []) as unknown as { accepted_at: string; agreement: { version: string } | null }[]

  const staffWithDepts = lookups.staff.map(p => ({
    id: p.id,
    name: p.full_name || p.email,
    departmentIds: lookups.departmentMembers.filter(m => m.profile_id === p.id).map(m => m.department_id),
  }))

  return (
    <>
      <Link href="/clients" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" /> Clients</Link>

      {/* Header */}
      <Card className="mb-6 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-800 font-display text-lg font-bold text-white">
            {client.company_name.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold">{client.company_name}</h1>
              <AccountStatusBadge status={client.status} />
              <Badge className="bg-brand-50 text-brand-700 ring-brand-200">{STAGE_LABELS[client.stage]}</Badge>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-500">
              {client.contact_name && <span>{client.contact_name}</span>}
              {client.contact_email && <a href={`mailto:${client.contact_email}`} className="inline-flex items-center gap-1 hover:text-brand-700"><Mail className="h-3.5 w-3.5" />{client.contact_email}</a>}
              {client.contact_phone && <a href={`tel:${client.contact_phone}`} className="inline-flex items-center gap-1 hover:text-brand-700"><Phone className="h-3.5 w-3.5" />{client.contact_phone}</a>}
              {client.whatsapp_group_link && <a href={client.whatsapp_group_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-lime-700 hover:text-lime-800"><MessageCircle className="h-3.5 w-3.5" />WhatsApp group</a>}
              {client.gstin && <span>GSTIN {client.gstin}</span>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isAdmin && client.status === 'pending' && client.signup_source === 'self_signup' && (
              <ApprovalActions clientId={client.id} hasAgreement={accepted.length > 0} />
            )}
            {isAdmin && client.status !== 'pending' && <ClientStatusSelect clientId={client.id} ownerId={client.owner_id} status={client.status} />}
            {isAdmin && !client.owner_id && <InviteLoginButton clientId={client.id} email={client.contact_email} name={client.contact_name} />}
            {canEdit && <ClientFormModal client={client} internal={internal} canEditInternal={!!internal} />}
            <ButtonLink href={`/tasks/new?client_id=${client.id}`} size="sm"><Plus className="h-3.5 w-3.5" /> Task</ButtonLink>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-6">
          <Card className="overflow-hidden">
            <CardHeader title={`Open tasks (${openTasks.length})`} />
            <TaskTable tasks={openTasks} names={names} showClient={false} assignOptions={assigneeOptionsFor(me, lookups)} empty={{ title: 'No open tasks' }} />
          </Card>
          {doneTasks.length > 0 && (
            <Card className="overflow-hidden">
              <CardHeader title={`Completed (${doneTasks.length})`} />
              <TaskTable tasks={doneTasks.slice(0, 20)} names={names} showClient={false} />
            </Card>
          )}
        </div>

        <div className="space-y-6">
          {internal && (
            <Card>
              <CardHeader title="Account (internal)" />
              <dl className="grid grid-cols-2 gap-px bg-slate-100 text-sm">
                {[
                  ['Retainer', formatINR(internal.monthly_retainer) + (internal.monthly_retainer != null ? '/mo' : '')],
                  ['Health', `${internal.health_score}/100`],
                  ['Contract start', formatDate(internal.contract_start)],
                  ['Contract end', formatDate(internal.contract_end)],
                ].map(([k, v]) => (
                  <div key={k} className="bg-white px-5 py-3">
                    <dt className="text-xs text-slate-500">{k}</dt>
                    <dd className="font-semibold text-slate-900">{v}</dd>
                  </div>
                ))}
              </dl>
              {internal.notes && <p className="whitespace-pre-wrap border-t border-slate-100 px-5 py-3 text-sm text-slate-600">{internal.notes}</p>}
            </Card>
          )}

          <Card>
            <CardHeader title="Team" description="Who handles this brand" />
            <ClientTeamEditor
              clientId={client.id}
              rows={teamRows}
              people={staffWithDepts}
              departments={lookups.departments}
              editableDepartmentIds={isAdmin ? lookups.departments.map(d => d.id) : me.role === 'manager' ? myDepts : []}
            />
          </Card>

          <Card>
            <CardHeader title="Platforms" />
            <ClientPlatformsEditor clientId={client.id} rows={(platforms ?? []) as ClientPlatformRow[]} platforms={lookups.platforms} editable={canEdit} />
          </Card>

          <Card>
            <CardHeader title="Services" />
            <ClientServicesEditor clientId={client.id} rows={(services ?? []) as ClientServiceRow[]} services={lookups.services} editable={canEdit} />
          </Card>

          <Card>
            <CardHeader title="Account" />
            <dl className="divide-y divide-slate-100 text-sm">
              <div className="flex justify-between px-5 py-2.5"><dt className="text-slate-500">Portal login</dt><dd>{client.owner_id ? names[client.owner_id] ?? 'Yes' : <span className="text-slate-400">None</span>}</dd></div>
              <div className="flex justify-between px-5 py-2.5"><dt className="text-slate-500">Joined via</dt><dd className="capitalize">{client.signup_source.replace('_', ' ')}</dd></div>
              <div className="flex justify-between px-5 py-2.5"><dt className="text-slate-500">Created</dt><dd>{formatDate(client.created_at)}</dd></div>
              {client.approved_at && <div className="flex justify-between px-5 py-2.5"><dt className="text-slate-500">Approved</dt><dd>{formatDate(client.approved_at)}</dd></div>}
              <div className="flex justify-between gap-3 px-5 py-2.5">
                <dt className="flex items-center gap-1 text-slate-500"><FileSignature className="h-3.5 w-3.5" /> Agreement</dt>
                <dd className="text-right">{accepted.length ? accepted.map(a => `${a.agreement?.version ?? '?'} · ${formatDate(a.accepted_at)}`).join(', ') : <span className="text-amber-700">Not accepted</span>}</dd>
              </div>
            </dl>
            {isAdmin && <div className="border-t border-slate-100 px-5 py-3"><DeleteButton table="clients" id={client.id} redirectTo="/clients" label="Delete client" /></div>}
          </Card>
        </div>
      </div>
    </>
  )
}
