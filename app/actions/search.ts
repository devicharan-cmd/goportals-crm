'use server'

import { requireClient, requireRole, requireStaff } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { TASK_STATUS_OPTIONS } from '@/lib/constants'
import { nameMap, normalizeTaskSummaryRows, TASK_SUMMARY_SELECT, type TaskAssignerInfo } from '@/lib/queries'
import { parseTaskCode, parseTicketCode } from '@/lib/utils'
import type { Client, TaskSummary, Ticket } from '@/types/database'

type TicketStatusFilter = 'unassigned' | 'assigned' | 'closed'
type ClientStatusFilter = '' | 'active' | 'pending' | 'suspended' | 'rejected'
type ClientSearchRow = Client & { client_team: { profile_id: string }[] }
type StaffTicketSearchRow = Ticket & { client: { id: string; company_name: string } | null }
type TaskSearchFilters = {
  scope: 'mine' | 'all'
  status: string
  client: string
  assignee: string
  assignedBy: string
  department: string
  due: string
  board: boolean
}

function safeSearchText(value: string) {
  return value.trim().replace(/[%_,()]/g, ' ')
}

export async function searchTasks(value: string, filters: TaskSearchFilters): Promise<{
  tasks: TaskSummary[]
  names: Record<string, string>
  taskAssigners: Record<string, TaskAssignerInfo>
}> {
  const me = await requireStaff()
  const supabase = await createClient()
  const queryText = safeSearchText(value)
  const taskNumber = parseTaskCode(queryText)
  const isExactTaskSearch = taskNumber !== null
  const taskStatus = TASK_STATUS_OPTIONS.find(option => option.value === filters.status)?.value
  if (!['mine', 'all'].includes(filters.scope)) throw new Error('Invalid task scope filter')
  if (!['active', 'all'].includes(filters.status) && !taskStatus) throw new Error('Invalid task status filter')

  let query = supabase.from('tasks').select(TASK_SUMMARY_SELECT)
    .order('is_urgent', { ascending: false })
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(500)

  if (filters.scope === 'mine' && !isExactTaskSearch) query = query.eq('assignee_id', me.id)
  else if (filters.assignee) query = query.eq('assignee_id', filters.assignee)

  if (!filters.board && !isExactTaskSearch) {
    if (filters.status === 'active') query = query.not('status', 'in', '(completed,cancelled)')
    else if (taskStatus) query = query.eq('status', taskStatus)
  }
  if (filters.client) query = query.eq('client_id', filters.client)
  if (filters.assignedBy) query = query.eq('assigned_by', filters.assignedBy)
  if (filters.department) query = query.eq('department_id', filters.department)
  if (filters.due) query = query.eq('due_date', filters.due)
  if (taskNumber !== null) query = query.eq('task_number', taskNumber)
  else if (queryText) query = query.ilike('title', `%${queryText}%`)

  const { data, error } = await query
  if (error) throw new Error(error.message)
  const tasks = normalizeTaskSummaryRows((data ?? []) as Parameters<typeof normalizeTaskSummaryRows>[0])
  const assigneeIds = Array.from(new Set(tasks.flatMap(task => task.assignee_id ? [task.assignee_id] : [])))
  const taskAssignerIds = Array.from(new Set(tasks.flatMap(task => task.assigned_by ? [task.assigned_by] : [])))
  const [peopleResult, taskAssignersResult] = await Promise.all([
    assigneeIds.length
      ? supabase.from('profiles').select('id, full_name, email').in('id', assigneeIds)
      : Promise.resolve({ data: [], error: null }),
    taskAssignerIds.length
      ? supabase.from('profiles').select('id, full_name, email, role, avatar_url').in('id', taskAssignerIds)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (peopleResult.error) throw new Error(peopleResult.error.message)
  if (taskAssignersResult.error) throw new Error(taskAssignersResult.error.message)

  const taskAssigners = Object.fromEntries((taskAssignersResult.data ?? []).map(person => [
    person.id,
    { name: person.full_name || person.email, role: person.role, avatarUrl: person.avatar_url },
  ]))
  return { tasks, names: nameMap(peopleResult.data ?? []), taskAssigners }
}

export async function searchPortalTickets(value: string, status: 'open' | 'done'): Promise<Ticket[]> {
  if (!['open', 'done'].includes(status)) throw new Error('Invalid ticket status filter')
  await requireClient()
  const supabase = await createClient()
  const queryText = safeSearchText(value)
  let query = supabase.from('tickets').select('*').order('created_at', { ascending: false })
  const ticketNumber = parseTicketCode(queryText)
  if (ticketNumber) query = query.eq('ticket_number', ticketNumber)
  else if (queryText) query = query.ilike('subject', `%${queryText}%`)

  if (status === 'open') query = query.neq('status', 'closed')
  else query = query.eq('status', 'closed')

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []) as Ticket[]
}

export async function searchStaffTickets(value: string, status: TicketStatusFilter): Promise<StaffTicketSearchRow[]> {
  if (!['unassigned', 'assigned', 'closed'].includes(status)) throw new Error('Invalid ticket status filter')
  await requireRole(['super_admin', 'manager', 'team_lead'])
  const supabase = await createClient()
  const queryText = safeSearchText(value)
  let query = supabase.from('tickets')
    .select('*, client:clients(id, company_name)')
    .order('created_at', { ascending: false })
    .limit(200)
  const ticketNumber = parseTicketCode(queryText)
  if (ticketNumber) query = query.eq('ticket_number', ticketNumber)
  else if (queryText) query = query.ilike('subject', `%${queryText}%`)
  query = query.eq('status', status)

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []) as StaffTicketSearchRow[]
}

export async function searchClients(value: string, status: ClientStatusFilter): Promise<{
  clients: ClientSearchRow[]
  imageUrlByPath: Record<string, string>
}> {
  if (!['', 'active', 'pending', 'suspended', 'rejected'].includes(status)) {
    throw new Error('Invalid client status filter')
  }
  await requireRole(['super_admin', 'manager'])
  const supabase = await createClient()
  const queryText = safeSearchText(value)
  let query = supabase.from('clients')
    .select('*, client_team(profile_id)')
    .order('company_name')
  if (queryText) query = query.ilike('company_name', `%${queryText}%`)
  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) throw new Error(error.message)

  const clients = (data ?? []) as ClientSearchRow[]
  const imagePaths = clients.flatMap(client => client.company_profile_image_path ? [client.company_profile_image_path] : [])
  const { data: signedImages, error: imageError } = imagePaths.length
    ? await supabase.storage.from('client-profile-images').createSignedUrls(imagePaths, 3600)
    : { data: [], error: null }
  if (imageError) throw new Error(imageError.message)

  return {
    clients,
    imageUrlByPath: Object.fromEntries((signedImages ?? []).map(image => [image.path, image.signedUrl ?? ''])),
  }
}
