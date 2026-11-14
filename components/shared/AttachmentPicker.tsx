'use client'

import { useRef, useState } from 'react'
import { FileText, ImagePlay, Paperclip } from 'lucide-react'
import { cn } from '@/lib/utils'

const FILE_CATEGORIES = [
  {
    label: 'Document',
    accept: '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.rtf,.odt,.ods,.odp',
    extensions: new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'csv', 'txt', 'rtf', 'odt', 'ods', 'odp']),
    Icon: FileText,
  },
  {
    label: 'Photos & videos',
    accept: '.jpg,.jpeg,.png,.webp,.bmp,.mp4,.webm,.mov',
    extensions: new Set(['jpg', 'jpeg', 'png', 'webp', 'bmp', 'mp4', 'webm', 'mov']),
    Icon: ImagePlay,
  },
] as const

export function AttachmentPicker({
  disabled = false,
  onFilesSelected,
  buttonClassName,
  buttonLabel,
  fullWidth = false,
}: {
  disabled?: boolean
  onFilesSelected: (accepted: File[], rejected: File[]) => void
  buttonClassName?: string
  buttonLabel?: string
  fullWidth?: boolean
}) {
  const inputRefs = useRef<Array<HTMLInputElement | null>>([])
  const [open, setOpen] = useState(false)

  function selectFiles(event: React.ChangeEvent<HTMLInputElement>, extensions: ReadonlySet<string>) {
    const selected = Array.from(event.currentTarget.files ?? [])
    const accepted = selected.filter(file => {
      const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
      return extensions.has(extension)
        && !file.type.startsWith('audio/')
        && file.type.toLowerCase() !== 'image/gif'
    })
    onFilesSelected(accepted, selected.filter(file => !accepted.includes(file)))
    event.currentTarget.value = ''
  }

  return (
    <div className={cn('relative inline-flex', fullWidth && 'w-full')}>
      {FILE_CATEGORIES.map((category, index) => (
        <input
          key={category.label}
          ref={element => { inputRefs.current[index] = element }}
          type="file"
          multiple
          accept={category.accept}
          className="hidden"
          onChange={event => selectFiles(event, category.extensions)}
        />
      ))}
      <button
        type="button"
        onClick={() => setOpen(current => !current)}
        disabled={disabled}
        className={cn(
          fullWidth
            ? 'inline-flex h-9 w-full items-center justify-start gap-2 rounded-lg px-3 text-sm transition disabled:opacity-50'
            : 'inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-[#045E80] disabled:opacity-50',
          buttonClassName,
        )}
        aria-label="Attach files"
        aria-expanded={open}
        title="Attach files"
      >
        <Paperclip aria-hidden="true" className="h-4 w-4" />
        {buttonLabel && <span>{buttonLabel}</span>}
      </button>
      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-20 cursor-default"
            aria-label="Close attachment menu"
            onClick={() => setOpen(false)}
          />
          <div className="absolute bottom-full left-0 z-30 mb-2 w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
            {FILE_CATEGORIES.map(({ label, Icon }, index) => (
              <button
                key={label}
                type="button"
                onClick={() => {
                  setOpen(false)
                  inputRefs.current[index]?.click()
                }}
                className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"
              >
                <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[#045E80]" />
                <span className="min-w-0">
                  <span className="block font-medium">{label}</span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
