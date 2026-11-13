'use server'

import { requireClient, requireRole, requireStaff } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { TASK_PAGE_SIZE, TASK_STATUS_OPTIONS } from '@/lib/constants'
import { getTaskPageLookups, nameMap, normalizeTaskSummaryRows, taskAssigneeIdsForAssignedScope, TASK_SUMMARY_SELECT, type TaskAssignerInfo, type TaskPageCursor } from '@/lib/queries'
import { parseTaskCode, parseTicketCode } from '@/lib/utils'
import type { Client, TaskSummary, Ticket } from '@/types/database'

type TicketStatusFilter = 'unassigned' | 'assigned' | 'closed'
type ClientStatusFilter = '' | 'active' | 'pending' | 'suspended' | 'rejected'
type ClientSearchRow = Client & { client_team: { profile_id: string }[] }
type StaffTicketSearchRow = Ticket & { client: { id: string; company_name: string } | null }
type TaskSearchFilters = {
  scope: 'mine' | 'assigned' | 'all'
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

function taskCursorFilter(cursor: TaskPageCursor): string {
  const taskOrderAfter = cursor.due_date
    ? `or(due_date.gt.${cursor.due_date},due_date.is.null,and(due_date.eq.${cursor.due_date},or(created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.gt.${cursor.id}))))`
    : `and(due_date.is.null,or(created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.gt.${cursor.id})))`
  const sameUrgencyOrder = `and(is_urgent.eq.${cursor.is_urgent},${taskOrderAfter})`
  return cursor.is_urgent
    ? `is_urgent.eq.false,${sameUrgencyOrder}`
    : `and(is_urgent.eq.false,${taskOrderAfter})`
}

function isValidTaskPageCursor(cursor: TaskPageCursor) {
  return typeof cursor.id === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cursor.id)
    && typeof cursor.is_urgent === 'boolean'
    && (cursor.due_date === null || /^\d{4}-\d{2}-\d{2}$/.test(cursor.due_date))
    && typeof cursor.created_at === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(cursor.created_at)
}

export async function searchTasks(value: string, filters: TaskSearchFilters, cursor: TaskPageCursor | null = null): Promise<{
  tasks: TaskSummary[]
  names: Record<string, string>
  taskAssigners: Record<string, TaskAssignerInfo>
  hasMore: boolean
  nextCursor: TaskPageCursor | null
}> {
  if (cursor && !isValidTaskPageCursor(cursor)) throw new Error('Invalid task page cursor')
  const me = await requireStaff()
  const supabase = await createClient()
  const queryText = safeSearchText(value)
  const taskNumber = parseTaskCode(queryText)
  const isExactTaskSearch = taskNumber !== null
  const taskStatus = TASK_STATUS_OPTIONS.find(option => option.value === filters.status)?.value
  if (!['mine', 'assigned', 'all'].includes(filters.scope)) throw new Error('Invalid task scope filter')
  if (!['active', 'all'].includes(filters.status) && !taskStatus) throw new Error('Invalid task status filter')

  let query = supabase.from('tasks').select(TASK_SUMMARY_SELECT)
    .order('is_urgent', { ascending: false })
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
    .order('id', { ascending: true })
    .range(0, TASK_PAGE_SIZE)

  if (cursor) query = query.or(taskCursorFilter(cursor))

  if (filters.scope === 'mine' && !isExactTaskSearch) query = query.eq('assignee_id', me.id)
  else if (filters.scope === 'assigned') {
    const lookups = await getTaskPageLookups({ includePeople: true, includeAssignments: true })
    const assigneeIds = taskAssigneeIdsForAssignedScope(me, lookups)
    query = query.eq('assigned_by', me.id)
    query = assigneeIds.length
      ? query.in('assignee_id', assigneeIds)
      : query.eq('id', '00000000-0000-0000-0000-000000000000')
  } else if (filters.assignee) query = query.eq('assignee_id', filters.assignee)

  if (!filters.board && !isExactTaskSearch) {
    if (filters.status === 'active') query = query.not('status', 'in', '(completed,cancelled)')
    else if (taskStatus) query = query.eq('status', taskStatus)
  }
  if (filters.client) query = query.eq('client_id', filters.client)
  if (filters.scope === 'all' && filters.assignedBy) query = query.eq('assigned_by', filters.assignedBy)
  if (filters.department) query = query.eq('department_id', filters.department)
  if (filters.due) query = query.eq('due_date', filters.due)
  if (taskNumber !== null) query = query.eq('task_number', taskNumber)
  else if (queryText) query = query.ilike('title', `%${queryText}%`)

  const { data, error } = await query
  if (error) throw new Error(error.message)
  const hasMore = (data?.length ?? 0) > TASK_PAGE_SIZE
  const tasks = normalizeTaskSummaryRows((data ?? []).slice(0, TASK_PAGE_SIZE) as Parameters<typeof normalizeTaskSummaryRows>[0])
  const lastTask = tasks[tasks.length - 1]
  const nextCursor = hasMore && lastTask
    ? { id: lastTask.id, is_urgent: lastTask.is_urgent, due_date: lastTask.due_date, created_at: lastTask.created_at }
    : null
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
  return { tasks, names: nameMap(peopleResult.data ?? []), taskAssigners, hasMore, nextCursor }
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
