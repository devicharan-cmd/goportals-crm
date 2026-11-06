import { NextResponse } from 'next/server'
import { getProfile } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

async function idsForClient(table: 'tasks' | 'tickets', clientId: string) {
  const admin = createAdminClient()
  const ids: string[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await admin.from(table).select('id').eq('client_id', clientId).range(offset, offset + 999)
    if (error) throw new Error(`Could not load client ${table}: ${error.message}`)
    ids.push(...(data ?? []).map(row => row.id))
    if (!data || data.length < 1000) return ids
  }
}

async function listStorageFiles(bucket: string, prefix: string): Promise<string[]> {
  const admin = createAdminClient()
  const paths: string[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000, offset })
    if (error) throw new Error(`Could not list ${bucket} files: ${error.message}`)
    const entries = data ?? []
    for (const entry of entries) {
      if (entry.id) paths.push(`${prefix}/${entry.name}`)
      else paths.push(...(await listStorageFiles(bucket, `${prefix}/${entry.name}`)))
    }
    if (entries.length < 1000) return paths
  }
}

async function listStorageFilesForIds(bucket: string, ids: string[]) {
  const paths: string[] = []
  for (let index = 0; index < ids.length; index += 20) {
    const groups = await Promise.all(ids.slice(index, index + 20).map(id => listStorageFiles(bucket, id)))
    paths.push(...groups.flat())
  }
  return paths
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
  const me = await getProfile()
  if (!me || me.status !== 'active' || me.role !== 'super_admin') {
    return NextResponse.json({ error: 'Only an active super admin can delete a client' }, { status: 403 })
  }

  const admin = createAdminClient()
  const { data: client, error: clientLookupError } = await admin
    .from('clients')
    .select('id, owner_id, company_profile_image_path')
    .eq('id', params.id)
    .maybeSingle()

  if (clientLookupError) {
    console.error('[client-delete] Could not load client:', clientLookupError.message)
    return NextResponse.json({ error: 'Could not load the client for deletion.' }, { status: 500 })
  }
  if (!client) return NextResponse.json({ error: 'Client not found.' }, { status: 404 })

  try {
    const [taskIds, ticketIds] = await Promise.all([
      idsForClient('tasks', client.id),
      idsForClient('tickets', client.id),
    ])
    const [profileImages, taskFiles, ticketFiles] = await Promise.all([
      client.company_profile_image_path
        ? listStorageFiles('client-profile-images', client.id)
        : Promise.resolve([]),
      listStorageFilesForIds('task-files', taskIds),
      listStorageFilesForIds('ticket-files', ticketIds),
    ])
    await Promise.all([
      removeStorageFiles('client-profile-images', profileImages),
      removeStorageFiles('task-files', taskFiles),
      removeStorageFiles('ticket-files', ticketFiles),
    ])
  } catch (cleanupError) {
    const message = cleanupError instanceof Error ? cleanupError.message : 'Unknown storage cleanup error'
    console.error('[client-delete] Could not clean client-owned files:', message)
    return NextResponse.json({ error: `Client was not deleted because file cleanup failed. Some files may already have been removed; retry deletion to finish cleanup. ${message}` }, { status: 500 })
  }

  if (client.owner_id) {
    const { data: owner, error: ownerLookupError } = await admin
      .from('profiles')
      .select('role, email')
      .eq('id', client.owner_id)
      .maybeSingle()

    if (ownerLookupError) {
      console.error('[client-delete] Could not verify client account:', ownerLookupError.message)
      return NextResponse.json({ error: 'Could not verify the client portal account.' }, { status: 500 })
    }
    if (!owner || owner.role !== 'client') {
      return NextResponse.json({ error: 'The linked account is not a client account; no data was deleted.' }, { status: 409 })
    }

    const emailPattern = owner.email.replace(/[\\%_]/g, '\\$&')
    const { error: inviteDeleteError } = await admin
      .from('invites')
      .delete()
      .ilike('email', emailPattern)
    if (inviteDeleteError) {
      console.error('[client-delete] Could not remove client invites:', inviteDeleteError.message)
      return NextResponse.json({ error: 'Could not remove the client’s invitations. The client account was not deleted; retry deletion.' }, { status: 500 })
    }

    const { error: authDeleteError } = await admin.auth.admin.deleteUser(client.owner_id)
    if (authDeleteError) {
      const { data: remainingProfile, error: profileCheckError } = await admin
        .from('profiles')
        .select('id')
        .eq('id', client.owner_id)
        .maybeSingle()
      if (profileCheckError || remainingProfile) {
        console.error('[client-delete] Could not delete client Auth user:', authDeleteError.message)
        return NextResponse.json({ error: 'Could not delete the client portal account. The client record was not deleted.' }, { status: 500 })
      }
    }
  }

  const { data: deletedClient, error: deleteError } = await admin
    .from('clients')
    .delete()
    .eq('id', client.id)
    .select('id')
    .maybeSingle()

  if (deleteError) {
    console.error('[client-delete] Could not delete client record:', deleteError.message)
    return NextResponse.json({
      error: client.owner_id
        ? 'The portal login and client-owned files were deleted, but the client record could not be deleted. Try deleting the client again.'
        : 'Could not delete the client record.',
    }, { status: 500 })
  }
  if (!deletedClient) {
    return NextResponse.json({
      error: client.owner_id
        ? 'The portal login and client-owned files were deleted, but the client record was not found. Refresh the page.'
        : 'Client was not found or was already deleted.',
    }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
}
