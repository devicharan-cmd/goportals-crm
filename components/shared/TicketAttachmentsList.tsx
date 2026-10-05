import { Paperclip } from 'lucide-react'

export type AttachmentLink = { id: string; file_name: string; size_bytes: number | null; url: string | null }

function humanSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function TicketAttachmentsList({ attachments }: { attachments: AttachmentLink[] }) {
  if (attachments.length === 0) return null
  return (
    <ul className="mt-4 space-y-1.5 border-t border-slate-100 pt-3">
      {attachments.map(a => (
        <li key={a.id}>
          <a href={a.url ?? '#'} target="_blank" rel="noreferrer"
             className="flex items-center gap-2 rounded-md px-2 py-1 text-sm text-brand-700 hover:bg-slate-50 hover:underline">
            <Paperclip className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="truncate">{a.file_name}</span>
            {a.size_bytes != null && <span className="flex-shrink-0 text-xs text-slate-400">{humanSize(a.size_bytes)}</span>}
          </a>
        </li>
      ))}
    </ul>
  )
}
