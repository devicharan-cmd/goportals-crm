import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

async function uploadedPaths(table: 'task_attachments' | 'ticket_attachments', profileId: string) {
  const admin = createAdminClient()
  const paths: string[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await admin
      .from(table)
      .select('storage_path')
      .eq('uploaded_by', profileId)
      .range(offset, offset + 999)
    if (error) throw new Error(`Could not load ${table}: ${error.message}`)
    paths.push(...(data ?? []).map(row => row.storage_path))
    if (!data || data.length < 1000) return paths
  }
}

async function listStorageFiles(prefix: string): Promise<string[]> {
  const admin = createAdminClient()
  const paths: string[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await admin.storage.from('staff-profile-images').list(prefix, { limit: 1000, offset })
    if (error) throw new Error(`Could not list staff profile images: ${error.message}`)
    const entries = data ?? []
    for (const entry of entries) {
      if (entry.id) paths.push(`${prefix}/${entry.name}`)
      else paths.push(...(await listStorageFiles(`${prefix}/${entry.name}`)))
    }
    if (entries.length < 1000) return paths
  }
}

async function removeStorageFiles(bucket: string, paths: string[]) {
  const admin = createAdminClient()
  for (let index = 0; index < paths.length; index += 100) {
    const { error } = await admin.storage.from(bucket).remove(paths.slice(index, index + 100))
    if (error) throw new Error(`Could not remove ${bucket} files: ${error.message}`)
  }
}

export async function DELETE(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
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
    console.error('[user-delete] Could not load the signed-in profile:', actorError.message)
    return NextResponse.json({ error: 'Could not verify your account permissions.' }, { status: 500 })
  }
  if (!actor || actor.status !== 'active' || actor.role !== 'super_admin') {
    console.error('[user-delete] Account deletion denied:', {
      userId: user.id,
      profileFound: !!actor,
      role: actor?.role ?? null,
      status: actor?.status ?? null,
    })
    const reason = !actor
      ? 'No profile row was found for your signed-in account.'
      : actor.status !== 'active'
        ? `Your profile status is "${actor.status}", not active.`
        : `Your profile role is "${actor.role}", not super admin.`
    return NextResponse.json({
      error: `Account deletion was denied. ${reason} The request was authenticated as user ${user.id}.`,
    }, { status: 403 })
  }
  if (params.id === actor.id) {
    return NextResponse.json({ error: 'You cannot delete your own account.' }, { status: 409 })
  }

  const { data: target, error: targetError } = await admin
    .from('profiles')
    .select('id, email, full_name, role')
    .eq('id', params.id)
    .maybeSingle()

  if (targetError) {
    console.error('[user-delete] Could not load account:', targetError.message)
    return NextResponse.json({ error: 'Could not load the account for deletion.' }, { status: 500 })
  }
  if (!target) return NextResponse.json({ error: 'Account not found.' }, { status: 404 })
  if (target.role !== 'client') {
    return NextResponse.json({ error: 'This action is only for unlinked client accounts.' }, { status: 409 })
  }

  const { data: linkedClient, error: clientLookupError } = await admin
    .from('clients')
    .select('id')
    .eq('owner_id', target.id)
    .maybeSingle()
  if (clientLookupError) {
    console.error('[user-delete] Could not verify linked client:', clientLookupError.message)
    return NextResponse.json({ error: 'Could not verify whether this account owns a client.' }, { status: 500 })
  }
  if (linkedClient) {
    return NextResponse.json({ error: 'This account owns a client. Delete it from that client’s page instead.' }, { status: 409 })
  }

  let taskPaths: string[]
  let ticketPaths: string[]
  let profilePaths: string[]
  try {
    const [listedTaskPaths, listedTicketPaths, listedProfilePaths] = await Promise.all([
      uploadedPaths('task_attachments', target.id),
      uploadedPaths('ticket_attachments', target.id),
      listStorageFiles(target.id),
    ])
    taskPaths = listedTaskPaths
    ticketPaths = listedTicketPaths
    profilePaths = listedProfilePaths
    await Promise.all([
      removeStorageFiles('task-files', taskPaths),
      removeStorageFiles('ticket-files', ticketPaths),
      removeStorageFiles('staff-profile-images', profilePaths),
    ])
  } catch (cleanupError) {
    const message = cleanupError instanceof Error ? cleanupError.message : 'Unknown storage cleanup error'
    console.error('[user-delete] Could not clean account files:', message)
    return NextResponse.json({
      error: `The account was not deleted because file cleanup failed. Some files may already have been removed; retry deletion to finish cleanup. ${message}`,
    }, { status: 500 })
  }

  const { error: purgeError } = await admin.rpc('purge_orphan_client_profile', {
    p_profile_id: target.id,
    p_actor_id: actor.id,
  })
  if (purgeError) {
    console.error('[user-delete] Could not remove account-linked data:', purgeError.message)
    return NextResponse.json({
      error: `Account files were removed, but related database data was not fully cleaned. The login remains. Retry after resolving the database error. ${purgeError.message}`,
    }, { status: 500 })
  }

  const { error: authDeleteError } = await admin.auth.admin.deleteUser(target.id)
  if (authDeleteError) {
    const { data: remainingProfile, error: profileCheckError } = await admin
      .from('profiles')
      .select('id')
      .eq('id', target.id)
      .maybeSingle()
    if (profileCheckError || remainingProfile) {
      console.error('[user-delete] Could not delete Auth user:', authDeleteError.message)
      return NextResponse.json({
        error: 'The account’s related files and database data were removed, but its login still exists. Retry deletion.',
      }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true, email: target.email, full_name: target.full_name })
}
