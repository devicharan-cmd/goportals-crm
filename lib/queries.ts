// Shared server-side queries. Call from Server Components / route handlers only.
import { createClient } from '@/lib/supabase/server'
import { ROLE_LABELS } from '@/lib/constants'
import { parseTaskCode, parseTicketCode, taskCode, ticketCode } from '@/lib/utils'
import type { AppRole, Department, Platform, Profile, Service, StaffDirectoryEntry, TaskAssigneeHistoryItem, TaskSummary } from '@/types/database'

/** Columns + joins used by every task list / board. */
export const TASK_LIST_SELECT =
  '*, client:clients(id, company_name, company_profile_image_path), platform:platforms(id, name), department:departments(id, name)'

/** Only the fields used by the staff task table and board. */
export const TASK_SUMMARY_SELECT =
  'id, task_number, title, status, priority, is_urgent, source, visibility, is_scheduled, schedule_id, platform_ids, due_date, due_at, created_at, client_id, ticket_id, assignee_id, assigned_by, client:clients(company_name), platform:platforms(name), department:departments(name)'

export type TaskPageCursor = Pick<TaskSummary, 'id' | 'is_urgent' | 'due_date' | 'created_at'>

type TaskSummaryRow = Omit<TaskSummary, 'client' | 'platform' | 'department'> & {
  client: TaskSummary['client'] | TaskSummary['client'][]
  platform: TaskSummary['platform'] | TaskSummary['platform'][]
  department: TaskSummary['department'] | TaskSummary['department'][]
}

function firstRelated<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value
}

export function normalizeTaskSummaryRows(rows: TaskSummaryRow[]): TaskSummary[] {
  return rows.map(({ client, platform, department, ...task }) => ({
    ...task,
    client: firstRelated(client),
    platform: firstRelated(platform),
    department: firstRelated(department),
  }))
}

/** Load current and former assignees using the task's assignment activity history. */
export async function getTaskAssigneeHistory(
  supabase: Awaited<ReturnType<typeof createClient>>,
  taskIds: string[],
): Promise<Map<string, TaskAssigneeHistoryItem[]>> {
  const uniqueTaskIds = Array.from(new Set(taskIds))
  if (uniqueTaskIds.length === 0) return new Map()
  const { data, error } = await supabase.rpc('task_assignee_history', { p_task_ids: uniqueTaskIds })
  if (error) throw new Error(`Could not load task assignee history: ${error.message}`)
  const historyByTask = new Map<string, TaskAssigneeHistoryItem[]>()
  for (const item of (data ?? []) as TaskAssigneeHistoryItem[]) {
    const history = historyByTask.get(item.task_id) ?? []
    history.push(item)
    historyByTask.set(item.task_id, history)
  }
  return historyByTask
}

/** Attach current and former assignees to task rows. */
export async function addTaskAssigneeHistory<T extends { id: string }>(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tasks: T[],
): Promise<(T & { assignee_history: TaskAssigneeHistoryItem[] })[]> {
  const historyByTask = await getTaskAssigneeHistory(supabase, tasks.map(task => task.id))
  return tasks.map(task => ({
    ...task,
    assignee_history: historyByTask.get(task.id) ?? [],
  }))
}

/** Small projections for ticket list rows; details stay on the ticket detail page. */
export const TICKET_LIST_SELECT = 'id, ticket_number, client_id, category, subject, priority, is_urgent, status, created_at, client:clients(id, company_name)'
export const STAFF_TICKET_LIST_SELECT = 'id, ticket_number, client_id, category, subject, priority, is_urgent, status, created_at, client:clients(id, company_name, company_profile_image_path)'

export type Person = Pick<Profile, 'id' | 'full_name' | 'email' | 'avatar_url' | 'role' | 'job_title' | 'status' | 'weekly_capacity_hours' | 'created_at' | 'reporting_to'> & Partial<Pick<Profile, 'phone'>>
export type TaskAssignerInfo = { name: string; role: AppRole; avatarUrl: string | null }
export type ClientOption = { id: string; company_name: string; company_profile_image_path: string | null; owner_id: string | null }
export type DepartmentMember = { department_id: string; profile_id: string; is_lead: boolean }

export type StaffLookups = {
  people: Person[]               // all profiles staff can see (incl. clients' logins, for names)
  staff: Person[]                // active staff only — assignable
  directoryStaff: StaffDirectoryEntry[]
  clients: ClientOption[]
  departments: Department[]
  platforms: Platform[]
  services: Service[]
  departmentMembers: DepartmentMember[]
}

const STAFF_ROLE_ORDER: Record<AppRole, number> = {
  super_admin: 0, manager: 1, team_lead: 2, employee: 3, client: 4,
}

/** Consistent staff ordering: role hierarchy, then earliest profile creation/join date. */
export function sortPeopleByRoleAndJoiningDate<T extends Pick<Person, 'id' | 'role' | 'created_at'>>(people: T[]): T[] {
  return [...people].sort((a, b) => STAFF_ROLE_ORDER[a.role] - STAFF_ROLE_ORDER[b.role]
    || a.created_at.localeCompare(b.created_at)
    || a.id.localeCompare(b.id))
}

export async function getStaffLookups({ includeDirectory = true }: { includeDirectory?: boolean } = {}): Promise<StaffLookups> {
  const supabase = await createClient()
  const [people, directory, clients, departments, platforms, services, members] = await Promise.all([
    supabase.from('profiles').select('id, full_name, email, avatar_url, role, job_title, status, weekly_capacity_hours, created_at, reporting_to'),
    includeDirectory ? supabase.rpc('staff_directory') : Promise.resolve({ data: [], error: null }),
    supabase.from('clients').select('id, company_name, company_profile_image_path, owner_id').order('company_name'),
    supabase.from('departments').select('id, name, slug, sort_order').order('sort_order'),
    supabase.from('platforms').select('id, name, category, is_active, sort_order').order('sort_order'),
    supabase.from('services').select('id, name, description, department_id, is_active, sort_order, default_price, default_billing_type').order('sort_order'),
    supabase.from('department_members').select('department_id, profile_id, is_lead'),
  ])
  for (const result of [people, directory, clients, departments, platforms, services, members]) {
    if (result.error) throw result.error
  }
  const all = sortPeopleByRoleAndJoiningDate((people.data ?? []) as Person[])
  return {
    people: all,
    staff: all.filter(p => p.role !== 'client' && p.status === 'active'),
    directoryStaff: (directory.data ?? []) as StaffDirectoryEntry[],
    clients: (clients.data ?? []) as ClientOption[],
    departments: (departments.data ?? []) as Department[],
    platforms: (platforms.data ?? []) as Platform[],
    services: (services.data ?? []) as Service[],
    departmentMembers: (members.data ?? []) as DepartmentMember[],
  }
}

export type UserAdminPerson = Person & Pick<Profile, 'phone'>
export type UserAdminLookups = {
  people: UserAdminPerson[]
  departments: Department[]
  departmentMembers: DepartmentMember[]
}

/** Minimal data required by /admin/users; avoids loading task-form and client lookups. */
const USER_ADMIN_PROFILE_SELECT =
  'id, full_name, email, avatar_url, role, job_title, status, weekly_capacity_hours, created_at, reporting_to, phone'

/** Load only the people and fields needed by the user-management screens. */
export async function getUserAdminLookups({
  includeClients = true,
  includeDepartmentMembers = true,
  departmentMemberProfileId,
}: {
  includeClients?: boolean
  /** Omit memberships for tabs that do not render the directory. */
  includeDepartmentMembers?: boolean
  /** Limit memberships when a screen only needs one person's departments. */
  departmentMemberProfileId?: string
} = {}): Promise<UserAdminLookups> {
  const supabase = await createClient()
  const profileSelect = includeDepartmentMembers
    ? `${USER_ADMIN_PROFILE_SELECT}, department_members(department_id, profile_id, is_lead)`
    : USER_ADMIN_PROFILE_SELECT
  const profilesQuery = supabase.from('profiles').select(profileSelect)
  if (!includeClients) profilesQuery.neq('role', 'client')

  const [profiles, departments, scopedMembers] = await Promise.all([
    profilesQuery,
    supabase.from('departments').select('id, name, slug, sort_order').order('sort_order'),
    departmentMemberProfileId
      ? supabase.from('department_members').select('department_id, profile_id, is_lead').eq('profile_id', departmentMemberProfileId)
      : Promise.resolve({ data: [], error: null }),
  ])
  for (const result of [profiles, departments, scopedMembers]) {
    if (result.error) throw result.error
  }
  type ProfileWithMemberships = UserAdminPerson & { department_members?: DepartmentMember[] | null }
  // The typed Supabase client cannot parse a runtime-composed nested select;
  // the relation itself is enforced by the profiles → department_members FK.
  const profileRows = (profiles.data ?? []) as unknown as ProfileWithMemberships[]
  const people = profileRows.map(({ department_members: _departmentMembers, ...person }) => person)
  return {
    people: sortPeopleByRoleAndJoiningDate(people),
    departments: (departments.data ?? []) as Department[],
    departmentMembers: includeDepartmentMembers
      ? profileRows.flatMap(profile => profile.department_members ?? [])
      : (scopedMembers.data ?? []) as DepartmentMember[],
  }
}

/** Ticket details need staff, assignment, and task-form lookups, but not the global client picker or public staff directory. */
export async function getTicketDetailLookups(): Promise<StaffLookups> {
  const supabase = await createClient()
  const [people, departments, platforms, services, members] = await Promise.all([
    supabase.from('profiles').select('id, full_name, email, phone, avatar_url, role, job_title, status, weekly_capacity_hours, created_at, reporting_to'),
    supabase.from('departments').select('id, name, slug, sort_order').order('sort_order'),
    supabase.from('platforms').select('*').order('sort_order'),
    supabase.from('services').select('*').order('sort_order'),
    supabase.from('department_members').select('department_id, profile_id, is_lead'),
  ])
  for (const result of [people, departments, platforms, services, members]) {
    if (result.error) throw result.error
  }
  const all = sortPeopleByRoleAndJoiningDate((people.data ?? []) as Person[])
  return {
    people: all,
    staff: all.filter(person => person.role !== 'client' && person.status === 'active'),
    directoryStaff: [],
    clients: [],
    departments: (departments.data ?? []) as Department[],
    platforms: (platforms.data ?? []) as Platform[],
    services: (services.data ?? []) as Service[],
    departmentMembers: (members.data ?? []) as DepartmentMember[],
  }
}

/** Only the lookups used by the staff task list and board. */
export async function getTaskPageLookups({ includePeople, includeAssignments }: {
  includePeople: boolean
  includeAssignments: boolean
}): Promise<StaffLookups> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('staff_task_page_lookups', {
    p_include_people: includePeople,
    p_include_assignments: includeAssignments,
  })
  if (error) throw error
  const payload = (data ?? {}) as {
    people?: Person[]
    clients?: ClientOption[]
    departments?: Department[]
    department_members?: DepartmentMember[]
  }
  const all = sortPeopleByRoleAndJoiningDate(payload.people ?? [])
  return {
    people: all,
    staff: all.filter(p => p.role !== 'client' && p.status === 'active'),
    // This staff-only page already loads profiles under the staff profiles RLS
    // policy, so calling staff_directory() here would fetch the same identities again.
    directoryStaff: [],
    clients: payload.clients ?? [],
    departments: payload.departments ?? [],
    platforms: [],
    services: [],
    departmentMembers: payload.department_members ?? [],
  }
}

/** Signed client profile images for visible client options. */
export async function getClientProfileImageUrls(clients: Pick<ClientOption, 'company_profile_image_path'>[]): Promise<Record<string, string>> {
  const paths = Array.from(new Set(clients.flatMap(client => client.company_profile_image_path ? [client.company_profile_image_path] : [])))
  if (!paths.length) return {}
  const { data, error } = await (await createClient()).storage.from('client-profile-images').createSignedUrls(paths, 3600)
  if (error) throw error
  return Object.fromEntries((data ?? []).flatMap(image => image.path && image.signedUrl ? [[image.path, image.signedUrl]] : []))
}

/** Department IDs a profile belongs to. */
export function departmentIdsFor(profileId: string, lookups: StaffLookups): Set<string> {
  return new Set(lookups.departmentMembers.filter(m => m.profile_id === profileId).map(m => m.department_id))
}

/** All profile IDs (excluding profileId itself) sharing at least one department with profileId. */
export function profileIdsSharingDepartment(profileId: string, lookups: StaffLookups): Set<string> {
  const myDepts = departmentIdsFor(profileId, lookups)
  return new Set(
    lookups.departmentMembers
      .filter(m => m.profile_id !== profileId && myDepts.has(m.department_id))
      .map(m => m.profile_id),
  )
}

/** Direct and nested staff reporting descendants for a profile. */
type ReportingPerson = Pick<Profile, 'id' | 'reporting_to'>
type AssignedScopePerson = Pick<Profile, 'id' | 'role' | 'status' | 'reporting_to'>

export function profileIdsReportingTo(profileId: string, lookups: { people: ReportingPerson[] }): Set<string> {
  const descendants = new Set<string>()
  const pending = [profileId]

  while (pending.length > 0) {
    const parentId = pending.pop()!
    for (const person of lookups.people) {
      if (person.reporting_to === parentId && !descendants.has(person.id)) {
        descendants.add(person.id)
        pending.push(person.id)
      }
    }
  }

  descendants.delete(profileId)
  return descendants
}

/** Active staff in the same reporting tree, including peers, managers, and reports. */
export function profileIdsInReportingHierarchy(profileId: string, lookups: { people: ReportingPerson[]; staff: AssignedScopePerson[] }): Set<string> {
  const childrenByParent = new Map<string, string[]>()
  const peopleById = new Map(lookups.people.map(person => [person.id, person]))
  for (const person of lookups.people) {
    if (!person.reporting_to) continue
    const children = childrenByParent.get(person.reporting_to) ?? []
    children.push(person.id)
    childrenByParent.set(person.reporting_to, children)
  }

  const hierarchyIds = new Set<string>([profileId])
  const pending = [profileId]
  while (pending.length) {
    const currentId = pending.pop()!
    const parentId = peopleById.get(currentId)?.reporting_to
    const relatedIds = [
      ...(parentId ? [parentId] : []),
      ...(childrenByParent.get(currentId) ?? []),
    ]

    for (const relatedId of relatedIds) {
      if (hierarchyIds.has(relatedId)) continue
      hierarchyIds.add(relatedId)
      pending.push(relatedId)
    }
  }

  return new Set(lookups.staff.filter(person => hierarchyIds.has(person.id)).map(person => person.id))
}

/** Staff a user may assign to, grouped for the Tasks "Assigned by me" scope. */
export function taskAssigneeIdsForAssignedScope(
  me: Pick<Profile, 'id' | 'role'>,
  lookups: { people: AssignedScopePerson[]; staff: AssignedScopePerson[] },
): string[] {
  const clientAssigneeIds = lookups.people
    .filter(person => person.role === 'client')
    .map(person => person.id)
  if (me.role === 'super_admin') {
    return [...lookups.staff.filter(person => person.status === 'active').map(person => person.id), ...clientAssigneeIds]
  }

  const hierarchyIds = profileIdsInReportingHierarchy(me.id, lookups)
  const superAdminIds = lookups.staff
    .filter(person => person.role === 'super_admin')
    .map(person => person.id)

  if (me.role === 'team_lead') {
    const employeeIds = profileIdsReportingTo(me.id, lookups)
    return [...lookups.staff
      .filter(person => (person.role === 'employee' && employeeIds.has(person.id)) || superAdminIds.includes(person.id))
      .map(person => person.id), ...clientAssigneeIds]
  }

  return [...lookups.staff
    .filter(person => hierarchyIds.has(person.id) || superAdminIds.includes(person.id))
    .map(person => person.id), ...(me.role === 'manager' ? clientAssigneeIds : [])]
}

/** People a user may assign to — mirrors can_assign() in the DB. */
export function assignableFor(me: Pick<Profile, 'id' | 'role'>, lookups: StaffLookups): Person[] {
  const ensureSelf = (people: Person[]) => {
    if (people.some(person => person.id === me.id)) return people
    const self = lookups.people.find(person => person.id === me.id)
    return self ? [self, ...people] : people
  }

  if (me.role === 'super_admin') return ensureSelf(activeStaffForSuperAdmin(lookups))

  // Profiles can be hidden by profile-table RLS; the safe staff directory is
  // the source for the full active Super Admin list across every staff role.
  const superAdmins = activeStaffForSuperAdmin(lookups).filter(person => person.role === 'super_admin')

  if (me.role === 'manager') {
    const reportIds = profileIdsReportingTo(me.id, lookups)
    return ensureSelf(Array.from(new Map([
      ...lookups.staff.filter(person => person.id === me.id || reportIds.has(person.id)),
      ...superAdmins,
    ].map(person => [person.id, person])).values()))
  }

  const allowedIds = profileIdsInReportingHierarchy(me.id, lookups)
  return ensureSelf(Array.from(new Map([
    ...lookups.staff.filter(person => allowedIds.has(person.id)),
    ...superAdmins,
  ].map(person => [person.id, person])).values()))
}

/** People available in the Tasks page assignee filter, scoped by reporting hierarchy. */
export function assigneeFilterPeopleFor(me: Pick<Profile, 'id' | 'role'>, lookups: StaffLookups): Person[] {
  return assignableFor(me, lookups)
}

/** Active staff who are allowed to assign tasks to the current user. */
export function taskAssignerFilterPeopleFor(me: Pick<Profile, 'id' | 'role'>, lookups: StaffLookups): Person[] {
  return assignableFor(me, lookups)
}

export function nameMap(people: { id: string; full_name: string; email?: string }[]): Record<string, string> {
  return Object.fromEntries(people.map(p => [p.id, p.full_name || p.email || 'Unknown']))
}

export type AssigneeOption = { id: string; name: string; avatarUrl?: string | null; role?: string; avatarRole?: AppRole; subtitle?: string; isMe?: boolean; clientId?: string }

function activeStaffForSuperAdmin(lookups: StaffLookups): Person[] {
  const staffById = new Map(lookups.staff.map(person => [person.id, person]))
  for (const person of lookups.directoryStaff) {
    if (staffById.has(person.id)) continue
    staffById.set(person.id, {
      id: person.id,
      full_name: person.full_name || 'Staff member',
      email: '',
      avatar_url: person.avatar_url,
      role: person.role,
      job_title: person.job_title,
      status: 'active',
      weekly_capacity_hours: 0,
      created_at: '',
      reporting_to: null,
    })
  }
  return sortPeopleByRoleAndJoiningDate(Array.from(staffById.values()))
}

/** Options for the "Change assignee" picker: who I may assign to, with job title + departments. */
export function assigneeOptionsFor(me: Pick<Profile, 'id' | 'role'>, lookups: StaffLookups): AssigneeOption[] {
  const deptName = Object.fromEntries(lookups.departments.map(d => [d.id, d.name]))
  return assignableFor(me, lookups).map(p => ({
    id: p.id,
    name: p.full_name || p.email,
    avatarUrl: p.avatar_url,
    role: ROLE_LABELS[p.role],
    avatarRole: p.role,
    isMe: p.id === me.id,
    subtitle: [p.job_title || ROLE_LABELS[p.role],
               ...lookups.departmentMembers.filter(m => m.profile_id === p.id).map(m => deptName[m.department_id])]
              .filter(Boolean).join(' · '),
  }))
}

/** Public-task assignees also include each client's active portal account. */
export function taskAssigneeOptionsFor(me: Pick<Profile, 'id' | 'role'>, lookups: StaffLookups): AssigneeOption[] {
  const staffOptions = assigneeOptionsFor(me, lookups)

  const clientOptions = lookups.clients.flatMap(client => {
    const owner = lookups.people.find(person =>
      person.id === client.owner_id && person.role === 'client' && person.status === 'active',
    )
    return owner ? [{
      id: owner.id,
      name: client.company_name,
      role: ROLE_LABELS.client,
      avatarRole: 'client' as const,
      clientId: client.id,
      subtitle: 'Client account',
    }] : []
  })

  return [...staffOptions, ...clientOptions]
}

/** Task page URLs accept the UUID or the short ID: /tasks/GP-1024. Returns the UUID (or null). */
export async function resolveTaskId(param: string): Promise<string | null> {
  const n = parseTaskCode(decodeURIComponent(param))
  if (!n) return /^[0-9a-f-]{36}$/i.test(param) ? param : null
  const { data } = await (await createClient()).from('tasks').select('id').eq('task_number', n).maybeSingle()
  return data?.id ?? null
}

/** Browser tab title for a task page: "GP-1024 · Launch Diwali ads". */
export async function taskPageTitle(param: string): Promise<string> {
  const id = await resolveTaskId(param)
  if (!id) return 'Task'
  const { data } = await (await createClient()).from('tasks').select('task_number, title').eq('id', id).maybeSingle()
  return data ? `${taskCode(data.task_number)} · ${data.title}` : 'Task'
}

/** Ticket page URLs accept the UUID or the short ID: /portal/tickets/TK-1024. Returns the UUID (or null). */
export async function resolveTicketId(param: string): Promise<string | null> {
  const n = parseTicketCode(decodeURIComponent(param))
  if (!n) return /^[0-9a-f-]{36}$/i.test(param) ? param : null
  const { data } = await (await createClient()).from('tickets').select('id').eq('ticket_number', n).maybeSingle()
  return data?.id ?? null
}

/** Browser tab title for a ticket page: "TK-1024 · Update prices". */
export async function ticketPageTitle(param: string): Promise<string> {
  const id = await resolveTicketId(param)
  if (!id) return 'Request'
  const { data } = await (await createClient()).from('tickets').select('ticket_number, subject').eq('id', id).maybeSingle()
  return data ? `${ticketCode(data.ticket_number)} · ${data.subject}` : 'Request'
}

export type TicketAttachmentLink = { id: string; file_name: string; size_bytes: number | null; url: string | null }

/** A ticket's attachments with short-lived signed download URLs (bucket is private). */
export async function getTicketAttachments(ticketId: string): Promise<TicketAttachmentLink[]> {
  const supabase = await createClient()
  const { data: rows } = await supabase.from('ticket_attachments')
    .select('id, file_name, storage_path, size_bytes').eq('ticket_id', ticketId).order('created_at')
  if (!rows || rows.length === 0) return []
  const { data: signed } = await supabase.storage.from('ticket-files').createSignedUrls(rows.map(r => r.storage_path), 3600)
  const urlByPath = Object.fromEntries((signed ?? []).map(s => [s.path, s.signedUrl]))
  return rows.map(r => ({ id: r.id, file_name: r.file_name, size_bytes: r.size_bytes, url: urlByPath[r.storage_path] ?? null }))
}
