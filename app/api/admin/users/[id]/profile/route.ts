import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { StaffRole } from '@/types/database'
import { validateMobilePhone, isValidTimeZone } from '@/lib/contact'

const STAFF_ROLES: StaffRole[] = ['super_admin', 'admin', 'team_lead', 'employee']
const REPORTING_ROLE: Partial<Record<StaffRole, StaffRole>> = {
  admin: 'super_admin',
  team_lead: 'admin',
  employee: 'team_lead',
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const sessionClient = createClient()
  const { data: { user }, error: authError } = await sessionClient.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Your session could not be verified. Sign in again.' }, { status: 401 })

  const admin = createAdminClient()
  const { data: actor, error: actorError } = await admin.from('profiles')
    .select('id, role, status').eq('id', user.id).maybeSingle()
  if (actorError) {
    console.error('[staff-profile] Could not verify the signed-in profile:', actorError.message)
    return NextResponse.json({ error: 'Could not verify your account permissions.' }, { status: 500 })
  }
  if (!actor || actor.role !== 'super_admin' || actor.status !== 'active') {
    return NextResponse.json({ error: 'Only an active Super Admin can manage staff profiles.' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'The profile update request is invalid.' }, { status: 400 })
  }

  const fullName = typeof body.full_name === 'string' ? body.full_name.trim() : ''
  const role = body.role
  const status = body.status
  const reportingTo = body.reporting_to
  const capacity = body.weekly_capacity_hours
  const departmentIds = body.department_ids
  const phone = typeof body.phone === 'string' ? body.phone.trim() : ''
  const timezone = typeof body.timezone === 'string' ? body.timezone.trim() : ''
  if (!fullName) return NextResponse.json({ error: 'Full name is required.' }, { status: 400 })
  const phoneError = validateMobilePhone(phone)
  if (phoneError) return NextResponse.json({ error: phoneError }, { status: 400 })
  if (!isValidTimeZone(timezone)) return NextResponse.json({ error: 'Select a valid timezone.' }, { status: 400 })
  if (typeof role !== 'string' || !STAFF_ROLES.includes(role as StaffRole)) {
    return NextResponse.json({ error: 'Choose a valid staff role.' }, { status: 400 })
  }
  if (status !== 'active' && status !== 'suspended') {
    return NextResponse.json({ error: 'Choose Active or Suspended status.' }, { status: 400 })
  }
  if (!Number.isInteger(capacity) || (capacity as number) < 1 || (capacity as number) > 168) {
    return NextResponse.json({ error: 'Weekly capacity must be between 1 and 168 hours.' }, { status: 400 })
  }
  if (!Array.isArray(departmentIds) || departmentIds.some(id => typeof id !== 'string') || new Set(departmentIds).size !== departmentIds.length) {
    return NextResponse.json({ error: 'Department assignments are invalid.' }, { status: 400 })
  }

  const { data: target, error: targetError } = await admin.from('profiles')
    .select('id, role, status, reporting_to').eq('id', params.id).maybeSingle()
  if (targetError) {
    console.error('[staff-profile] Could not load the target profile:', targetError.message)
    return NextResponse.json({ error: 'Could not load this staff profile.' }, { status: 500 })
  }
  if (!target || target.role === 'client') return NextResponse.json({ error: 'Staff profile not found.' }, { status: 404 })
  if (target.id === actor.id && (role !== target.role || status !== target.status)) {
    return NextResponse.json({ error: 'You cannot change your own role or employment status.' }, { status: 409 })
  }

  let reportingToId: string | null = null
  if (role !== 'super_admin') {
    const unchangedLegacyPoc = role === target.role && !target.reporting_to && !reportingTo
    if (unchangedLegacyPoc) {
      reportingToId = null
    } else if (typeof reportingTo !== 'string' || !reportingTo) {
      return NextResponse.json({ error: 'Select a Reporting To person.' }, { status: 400 })
    } else {
      if (reportingTo === target.id) return NextResponse.json({ error: 'A person cannot report to themselves.' }, { status: 400 })
      const expectedRole = REPORTING_ROLE[role as StaffRole]
      const { data: reportingPerson, error: reportingError } = await admin.from('profiles')
        .select('id, role, status').eq('id', reportingTo).maybeSingle()
      if (reportingError) {
        console.error('[staff-profile] Could not verify the Reporting To person:', reportingError.message)
        return NextResponse.json({ error: 'Could not verify the Reporting To person.' }, { status: 500 })
      }
      if (!reportingPerson || reportingPerson.role !== expectedRole || reportingPerson.status !== 'active') {
        return NextResponse.json({ error: 'Reporting To must be an active person in the role directly above this staff role.' }, { status: 400 })
      }
      reportingToId = reportingPerson.id
    }
  }

  if (departmentIds.length) {
    const { data: departments, error: departmentsError } = await admin.from('departments')
      .select('id').in('id', departmentIds as string[])
    if (departmentsError) {
      console.error('[staff-profile] Could not verify department assignments:', departmentsError.message)
      return NextResponse.json({ error: 'Could not verify department assignments.' }, { status: 500 })
    }
    if ((departments ?? []).length !== departmentIds.length) {
      return NextResponse.json({ error: 'One or more selected departments no longer exist.' }, { status: 400 })
    }
  }

  const optionalText = (key: string) => typeof body[key] === 'string' ? (body[key] as string).trim() || null : null
  const { error: updateError } = await admin.from('profiles').update({
    full_name: fullName,
    phone: optionalText('phone'),
    timezone,
    job_title: optionalText('job_title'),
    role,
    reporting_to: reportingToId,
    weekly_capacity_hours: capacity,
    status,
  }).eq('id', target.id)
  if (updateError) {
    console.error('[staff-profile] Could not update the profile:', updateError.message)
    return NextResponse.json({ error: updateError.message }, { status: 400 })
  }

  const { error: detailsError } = await admin.from('staff_profile_details').upsert({
    profile_id: target.id,
    current_address: optionalText('current_address'),
    permanent_address: optionalText('permanent_address'),
  })
  if (detailsError) {
    console.error('[staff-profile] Profile saved, but staff-only addresses could not be saved:', detailsError.message)
    return NextResponse.json({ error: 'Profile saved, but addresses could not be saved. Retry the save.' }, { status: 500 })
  }

  const { data: memberships, error: membershipError } = await admin.from('department_members')
    .select('department_id').eq('profile_id', target.id)
  if (membershipError) {
    console.error('[staff-profile] Profile saved, but existing department assignments could not be loaded:', membershipError.message)
    return NextResponse.json({ error: 'Profile saved, but department assignments could not be loaded. Retry the save.' }, { status: 500 })
  }
  const existingIds = (memberships ?? []).map(row => row.department_id)
  const selectedIds = departmentIds as string[]
  const added = selectedIds.filter(id => !existingIds.includes(id))
  const removed = existingIds.filter(id => !selectedIds.includes(id))
  if (added.length) {
    const { error } = await admin.from('department_members').insert(added.map(department_id => ({
      department_id, profile_id: target.id, is_lead: role === 'team_lead',
    })))
    if (error) {
      console.error('[staff-profile] Profile saved, but department assignments could not be added:', error.message)
      return NextResponse.json({ error: 'Profile saved, but department assignments could not be added. Retry the save.' }, { status: 500 })
    }
  }
  if (removed.length) {
    const { error } = await admin.from('department_members').delete()
      .eq('profile_id', target.id).in('department_id', removed)
    if (error) {
      console.error('[staff-profile] Profile saved, but department assignments could not be removed:', error.message)
      return NextResponse.json({ error: 'Profile saved, but department assignments could not be removed. Retry the save.' }, { status: 500 })
    }
  }
  const { error: leadError } = await admin.from('department_members').update({ is_lead: role === 'team_lead' })
    .eq('profile_id', target.id)
  if (leadError) {
    console.error('[staff-profile] Profile saved, but department leadership could not be synchronized:', leadError.message)
    return NextResponse.json({ error: 'Profile saved, but department leadership could not be synchronized. Retry the save.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
