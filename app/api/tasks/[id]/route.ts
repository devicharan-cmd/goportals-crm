import { NextRequest, NextResponse } from 'next/server'
import { getProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const profile = await getProfile()
  if (!profile || profile.status !== 'active' || profile.role === 'client') {
    return NextResponse.json({ error: 'Only active staff can delete tasks.' }, { status: 403 })
  }

  const { id } = await context.params
  const supabase = await createClient()
  const { data: paths, error } = await supabase.rpc('delete_task_for_assigner', { p_task_id: id })
  if (error) {
    const status = /only the person|former assignee|only active staff|pause the schedule/i.test(error.message) ? 403 : 400
    return NextResponse.json({ error: error.message }, { status })
  }

  if (paths?.length) {
    const { error: storageError } = await createAdminClient().storage.from('task-files').remove(paths)
    if (storageError) {
      return NextResponse.json({
        ok: true,
        warning: 'The task was deleted, but some attached files could not be removed.',
      })
    }
  }

  return NextResponse.json({ ok: true })
}
