import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

async function listProfileImages(profileId: string): Promise<string[]> {
  const admin = createAdminClient()
  const paths: string[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await admin.storage.from('staff-profile-images').list(profileId, { limit: 1000, offset })
    if (error) throw new Error(`Could not list staff profile images: ${error.message}`)
    const entries = data ?? []
    for (const entry of entries) {
      if (entry.id) paths.push(`${profileId}/${entry.name}`)
      else paths.push(...(await listProfileImages(`${profileId}/${entry.name}`)))
    }
    if (entries.length < 1000) return paths
  }
}

async function removeProfileImages(paths: string[]) {
  const admin = createAdminClient()
  for (let index = 0; index < paths.length; index += 100) {
    const { error } = await admin.storage.from('staff-profile-images').remove(paths.slice(index, index + 100))
    if (error) throw new Error(`Could not remove staff profile images: ${error.message}`)
  }
}

export async function DELETE(_request: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  const sessionClient = await createClient()
  const { data: { user }, error: authError } = await sessionClient.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Your session could not be verified. Sign in again, then retry.' }, { status: 401 })
  }

  const admin = createAdminClient()
  const { data: actor, error: actorError } = await admin
    .from('profiles')
    .select('id, role, status')
    .eq('id', user.id)
    .maybeSingle()
  if (actorError) {
    console.error('[staff-delete] Could not verify the signed-in profile:', actorError.message)
    return NextResponse.json({ error: 'Could not verify your account permissions.' }, { status: 500 })
  }
  if (!actor || actor.role !== 'super_admin' || actor.status !== 'active') {
    return NextResponse.json({ error: 'Only an active Super Admin can permanently delete a staff account.' }, { status: 403 })
  }
  if (id === actor.id) {
    return NextResponse.json({ error: 'You cannot delete your own account.' }, { status: 409 })
  }

  const { data: ready, error: readinessError } = await admin.rpc('staff_deletion_ready')
  if (readinessError || ready !== true) {
    console.error('[staff-delete] Staff deletion database migration is missing or incomplete:', readinessError?.message)
    return NextResponse.json({
      error: 'Staff deletion is not enabled yet. Apply migrations 113_staff_account_deletion.sql and 114_transfer_staff_work_on_deletion.sql in Supabase, then retry.',
    }, { status: 503 })
  }

  const { data: target, error: targetError } = await admin
    .from('profiles')
    .select('id, email, full_name, role')
    .eq('id', id)
    .maybeSingle()
  if (targetError) {
    console.error('[staff-delete] Could not load the target profile:', targetError.message)
    return NextResponse.json({ error: 'Could not load the staff account for deletion.' }, { status: 500 })
  }
  if (!target || target.role === 'client') return NextResponse.json({ error: 'Staff account not found.' }, { status: 404 })
  if (target.role === 'super_admin') {
    return NextResponse.json({ error: 'Super Admin accounts cannot be deleted from the staff directory.' }, { status: 409 })
  }

  const [{ data: reports, error: reportsError }, { data: invites, error: invitesError }] = await Promise.all([
    admin.from('profiles').select('id').eq('reporting_to', target.id).limit(1),
    admin.from('invites').select('id').eq('reporting_to', target.id).limit(1),
  ])
  if (reportsError || invitesError) {
    console.error('[staff-delete] Could not verify reporting relationships:', reportsError?.message ?? invitesError?.message)
    return NextResponse.json({ error: 'Could not verify the staff member’s reporting relationships.' }, { status: 500 })
  }
  if (reports?.length || invites?.length) {
    return NextResponse.json({
      error: 'Reassign this person’s direct reports and reporting invitations before deleting the account.',
    }, { status: 409 })
  }

  const { error: transferError } = await admin.rpc('transfer_staff_work_to_reporting_poc', {
    p_profile_id: target.id,
    p_actor_id: actor.id,
  })
  if (transferError) {
    if (transferError.message.includes('no active Reporting To')) {
      return NextResponse.json({
        error: 'This person has assigned tasks or tickets but no active Reporting To person. Assign a Reporting To person before deleting this account.',
      }, { status: 409 })
    }
    console.error('[staff-delete] Could not transfer assigned work:', transferError.message)
    return NextResponse.json({
      error: 'Could not transfer this person’s assigned tasks and tickets to their Reporting To person. The account was not deleted.',
    }, { status: 500 })
  }

  let profileImages: string[]
  try {
    profileImages = await listProfileImages(target.id)
    await removeProfileImages(profileImages)
  } catch (cleanupError) {
    const message = cleanupError instanceof Error ? cleanupError.message : 'Unknown storage cleanup error'
    console.error('[staff-delete] Could not remove profile images:', message)
    return NextResponse.json({ error: `The account was not deleted because its profile images could not be removed. ${message}` }, { status: 500 })
  }

  const emailPattern = target.email.replace(/[\\%_]/g, '\\$&')
  const { error: inviteDeleteError } = await admin.from('invites').delete().ilike('email', emailPattern)
  if (inviteDeleteError) {
    console.error('[staff-delete] Could not remove invitations for the account:', inviteDeleteError.message)
    return NextResponse.json({ error: 'The account was not deleted because its invitations could not be removed.' }, { status: 500 })
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(target.id)
  const { data: remainingProfile, error: checkError } = await admin
    .from('profiles')
    .select('id')
    .eq('id', target.id)
    .maybeSingle()
  if (checkError || remainingProfile) {
    console.error('[staff-delete] Could not confirm account deletion:', {
      authError: deleteError?.message ?? null,
      profileCheckError: checkError?.message ?? null,
      profileStillExists: !!remainingProfile,
    })
    return NextResponse.json({ error: 'The account could not be fully deleted. Its profile image and invitation data were already removed; retry after resolving the deletion error.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, full_name: target.full_name, email: target.email })
}
