'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Paperclip } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { errorMessage, formatDate } from '@/lib/utils'
import type { TaskAttachment, TaskStatus } from '@/types/database'

type AttachmentLink = TaskAttachment & { signedUrl: string }

export function ClientTaskAttachments({
  taskId, meId, attachments, status,
}: { taskId: string; meId: string; attachments: AttachmentLink[]; status: TaskStatus }) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const canUpload = status !== 'completed' && status !== 'cancelled'

  async function upload(file: File) {
    setUploading(true)
    setError('')
    const safeName = file.name.replace(/[\\/]/g, '_')
    const path = `${taskId}/${crypto.randomUUID()}-${safeName}`
    const supabase = createClient()
    const { error: uploadError } = await supabase.storage.from('task-files').upload(path, file)
    if (uploadError) {
      setUploading(false)
      setError(errorMessage(uploadError))
      return
    }

    const { error: insertError } = await supabase.from('task_attachments').insert({
      task_id: taskId,
      uploaded_by: meId,
      storage_path: path,
      file_name: file.name,
      mime_type: file.type || null,
      size_bytes: file.size,
    })
    if (insertError) {
      const { error: cleanupError } = await supabase.storage.from('task-files').remove([path])
      setUploading(false)
      setError(cleanupError
        ? `${errorMessage(insertError)} The uploaded file could not be cleaned up; contact GoPortals support.`
        : errorMessage(insertError))
      return
    }

    setUploading(false)
    router.refresh()
  }

  return (
    <div className="space-y-3 p-5">
      {attachments.length === 0 ? (
        <p className="text-sm text-slate-500">No files have been added yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {attachments.map(attachment => (
            <li key={attachment.id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                <FileText className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <a href={attachment.signedUrl} target="_blank" rel="noreferrer"
                   className="block truncate text-sm font-medium text-[#034C68] hover:underline">
                  {attachment.file_name}
                </a>
                <p className="text-xs text-slate-400">{formatDate(attachment.created_at)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      {canUpload && (
        <>
          <input ref={inputRef} type="file" className="hidden" aria-label="Choose a file to attach"
                 disabled={uploading} onChange={event => {
                   const file = event.currentTarget.files?.[0]
                   event.currentTarget.value = ''
                   if (file) void upload(file)
                 }} />
          <Button variant="secondary" size="sm" loading={uploading} disabled={uploading}
                  onClick={() => inputRef.current?.click()}>
            {!uploading && <Paperclip className="h-3.5 w-3.5" />}
            Add file
          </Button>
        </>
      )}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
