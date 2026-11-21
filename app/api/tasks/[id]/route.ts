import { NextRequest, NextResponse } from 'next/server'
import { getProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const profile = await getProfile()
  if (!profile || profile.status !== 'active' || profile.role === 'client') {
    return NextResponse.json({ error: 'Only active staff can delete tasks.' }, { status: 403 })
  }

  const { id } = await context.params
  const supabase = await createClient()
  const scheduled = new URL(request.url).searchParams.get('scheduled') === '1'
  const { data: paths, error: pathsError } = await supabase.rpc('task_file_paths_for_deletion', {
    p_task_id: id,
    p_delete_schedule: scheduled,
  })
  if (pathsError) {
    const status = /only the person|former assignee|only active staff|pause the schedule/i.test(pathsError.message) ? 403 : 400
    return NextResponse.json({ error: pathsError.message }, { status })
  }

  if (paths?.length) {
    const { error: storageError } = await createAdminClient().storage.from('task-files').remove(paths)
    if (storageError) {
      return NextResponse.json({
        error: 'Could not remove this task’s uploaded files. The task was not deleted.',
      }, { status: 502 })
    }
  }

  const { error } = scheduled
    ? await supabase.rpc('delete_current_scheduled_task', { p_task_id: id })
    : await supabase.rpc('delete_task_for_assigner', { p_task_id: id })
  if (error) {
    const status = /only the person|former assignee|only active staff|pause the schedule/i.test(error.message) ? 403 : 400
    return NextResponse.json({ error: error.message }, { status })
  }

  return NextResponse.json({ ok: true })
}
