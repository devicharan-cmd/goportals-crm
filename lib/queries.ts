// Shared server-side queries. Call from Server Components / route handlers only.
import { createClient } from '@/lib/supabase/server'
import { ROLE_LABELS } from '@/lib/constants'
import { parseTaskCode, taskCode } from '@/lib/utils'
import type { Department, Platform, Profile, Service } from '@/types/database'

/** Columns + joins used by every task list / board. */
export const TASK_LIST_SELECT =
  '*, client:clients(id, company_name), platform:platforms(id, name), department:departments(id, name)'

export type Person = Pick<Profile, 'id' | 'full_name' | 'email' | 'role' | 'job_title' | 'status' | 'weekly_capacity_hours'>
export type ClientOption = { id: string; company_name: string }
export type DepartmentMember = { department_id: string; profile_id: string; is_lead: boolean }

export type StaffLookups = {
  people: Person[]               // all profiles staff can see (incl. clients' logins, for names)
  staff: Person[]                // active staff only — assignable
  clients: ClientOption[]
  departments: Department[]
  platforms: Platform[]
  services: Service[]
  departmentMembers: DepartmentMember[]
}

export async function getStaffLookups(): Promise<StaffLookups> {
  const supabase = createClient()
  const [people, clients, departments, platforms, services, members] = await Promise.all([
    supabase.from('profiles').select('id, full_name, email, role, job_title, status, weekly_capacity_hours').order('full_name'),
    supabase.from('clients').select('id, company_name').order('company_name'),
    supabase.from('departments').select('*').order('sort_order'),
    supabase.from('platforms').select('*').order('sort_order'),
    supabase.from('services').select('*').order('sort_order'),
    supabase.from('department_members').select('department_id, profile_id, is_lead'),
  ])
  const all = (people.data ?? []) as Person[]
  return {
    people: all,
    staff: all.filter(p => p.role !== 'client' && p.status === 'active'),
    clients: (clients.data ?? []) as ClientOption[],
    departments: (departments.data ?? []) as Department[],
    platforms: (platforms.data ?? []) as Platform[],
    services: (services.data ?? []) as Service[],
    departmentMembers: (members.data ?? []) as DepartmentMember[],
  }
}

/** People a user may assign to — mirrors can_assign() in the DB. */
export function assignableFor(me: Pick<Profile, 'id' | 'role'>, lookups: StaffLookups): Person[] {
  if (me.role === 'super_admin') return lookups.staff
  if (me.role === 'manager') {
    // Self first, then every active employee (see migration 005).
    return [
      ...lookups.staff.filter(p => p.id === me.id),
      ...lookups.staff.filter(p => p.role === 'employee'),
    ]
  }
  return lookups.staff.filter(p => p.id === me.id)
}

export function nameMap(people: { id: string; full_name: string; email?: string }[]): Record<string, string> {
  return Object.fromEntries(people.map(p => [p.id, p.full_name || p.email || 'Unknown']))
}

export type AssigneeOption = { id: string; name: string; subtitle?: string; isMe?: boolean }

/** Options for the "Change assignee" picker: who I may assign to, with job title + departments. */
export function assigneeOptionsFor(me: Pick<Profile, 'id' | 'role'>, lookups: StaffLookups): AssigneeOption[] {
  const deptName = Object.fromEntries(lookups.departments.map(d => [d.id, d.name]))
  return assignableFor(me, lookups).map(p => ({
    id: p.id,
    name: p.full_name || p.email,
    isMe: p.id === me.id,
    subtitle: [p.job_title || ROLE_LABELS[p.role],
               ...lookups.departmentMembers.filter(m => m.profile_id === p.id).map(m => deptName[m.department_id])]
              .filter(Boolean).join(' · '),
  }))
}

/** Task page URLs accept the UUID or the short ID: /tasks/GP-1024. Returns the UUID (or null). */
export async function resolveTaskId(param: string): Promise<string | null> {
  const n = parseTaskCode(decodeURIComponent(param))
  if (!n) return /^[0-9a-f-]{36}$/i.test(param) ? param : null
  const { data } = await createClient().from('tasks').select('id').eq('task_number', n).maybeSingle()
  return data?.id ?? null
}

/** Browser tab title for a task page: "GP-1024 · Launch Diwali ads". */
export async function taskPageTitle(param: string): Promise<string> {
  const id = await resolveTaskId(param)
  if (!id) return 'Task'
  const { data } = await createClient().from('tasks').select('task_number, title').eq('id', id).maybeSingle()
  return data ? `${taskCode(data.task_number)} · ${data.title}` : 'Task'
}
