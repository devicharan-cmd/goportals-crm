import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

const BUCKET = 'staff-profile-images'
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_BYTES = 5 * 1024 * 1024

async function authorizeSuperAdmin() {
  const sessionClient = createClient()
  const { data: { user }, error: authError } = await sessionClient.auth.getUser()
  if (authError || !user) return { error: NextResponse.json({ error: 'Your session could not be verified. Sign in again.' }, { status: 401 }) }

  const admin = createAdminClient()
  const { data: actor, error } = await admin.from('profiles').select('id, role, status').eq('id', user.id).maybeSingle()
  if (error) {
    console.error('[staff-photo] Could not verify the signed-in profile:', error.message)
    return { error: NextResponse.json({ error: 'Could not verify your account permissions.' }, { status: 500 }) }
  }
  if (!actor || actor.role !== 'super_admin' || actor.status !== 'active') {
    return { error: NextResponse.json({ error: 'Only an active Super Admin can manage staff profile photos.' }, { status: 403 }) }
  }
  return { admin, actor }
}

function storedPath(url: string | null, profileId: string) {
  if (!url) return null
  try {
    const path = new URL(url).pathname
    const prefix = `/storage/v1/object/public/${BUCKET}/`
    if (!path.includes(prefix)) return null
    const filePath = decodeURIComponent(path.slice(path.indexOf(prefix) + prefix.length))
    return filePath.startsWith(`${profileId}/`) ? filePath : null
  } catch {
    return null
  }
}

async function getTarget(admin: ReturnType<typeof createAdminClient>, profileId: string) {
  const { data, error } = await admin.from('profiles').select('id, role, avatar_url').eq('id', profileId).maybeSingle()
  if (error) throw new Error(`Could not load the staff profile: ${error.message}`)
  if (!data || data.role === 'client') return null
  return data
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const authorization = await authorizeSuperAdmin()
  if (authorization.error) return authorization.error
  const { admin } = authorization

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'The profile photo upload is invalid.' }, { status: 400 })
  }
  const file = formData.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'Choose a profile photo to upload.' }, { status: 400 })
  if (!ALLOWED_TYPES.has(file.type)) return NextResponse.json({ error: 'Choose a PNG, JPG, or WebP image.' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Image must be 5 MB or smaller.' }, { status: 400 })

  let target
  try {
    target = await getTarget(admin, params.id)
  } catch (error) {
    console.error('[staff-photo] Could not load the target profile:', error)
    return NextResponse.json({ error: 'Could not load this staff profile.' }, { status: 500 })
  }
  if (!target) return NextResponse.json({ error: 'Staff profile not found.' }, { status: 404 })

  const extension = file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/png' ? 'png' : 'webp'
  const path = `${target.id}/${crypto.randomUUID()}.${extension}`
  const { error: uploadError } = await admin.storage.from(BUCKET).upload(path, file, {
    contentType: file.type, cacheControl: '0',
  })
  if (uploadError) {
    console.error('[staff-photo] Could not upload the image:', uploadError.message)
    return NextResponse.json({ error: uploadError.message.includes('Bucket not found')
      ? 'Photo storage is not configured. Apply migration 083_staff_profile_images.sql, then retry.'
      : 'Could not upload the profile photo.' }, { status: 500 })
  }

  const imageUrl = admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
  const { error: updateError } = await admin.from('profiles').update({ avatar_url: imageUrl }).eq('id', target.id)
  if (updateError) {
    const { error: cleanupError } = await admin.storage.from(BUCKET).remove([path])
    console.error('[staff-photo] Could not save the image URL:', updateError.message)
    return NextResponse.json({ error: cleanupError
      ? `Could not save the profile photo, and its uploaded file could not be removed: ${cleanupError.message}`
      : updateError.message }, { status: 500 })
  }

  const oldPath = storedPath(target.avatar_url, target.id)
  let warning: string | undefined
  if (oldPath) {
    const { error } = await admin.storage.from(BUCKET).remove([oldPath])
    if (error) warning = `Photo updated, but the previous image could not be removed: ${error.message}`
  }
  return NextResponse.json({ ok: true, avatar_url: imageUrl, warning })
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const authorization = await authorizeSuperAdmin()
  if (authorization.error) return authorization.error
  const { admin } = authorization
  let target
  try {
    target = await getTarget(admin, params.id)
  } catch (error) {
    console.error('[staff-photo] Could not load the target profile:', error)
    return NextResponse.json({ error: 'Could not load this staff profile.' }, { status: 500 })
  }
  if (!target) return NextResponse.json({ error: 'Staff profile not found.' }, { status: 404 })
  const { error: updateError } = await admin.from('profiles').update({ avatar_url: null }).eq('id', target.id)
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  const oldPath = storedPath(target.avatar_url, target.id)
  let warning: string | undefined
  if (oldPath) {
    const { error } = await admin.storage.from(BUCKET).remove([oldPath])
    if (error) warning = `Photo removed, but the stored image could not be deleted: ${error.message}`
  }
  return NextResponse.json({ ok: true, avatar_url: null, warning })
}
