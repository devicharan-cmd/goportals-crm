'use client'

import { Paperclip, X } from 'lucide-react'
import { TaskSectionHeader } from '@/components/tasks/TaskFormSections'

export function TaskBasicInformation({
  idPrefix,
  title,
  description,
  onTitleChange,
  onDescriptionChange,
  files,
  onFilesChange,
  onRemoveFile,
  disabled = false,
  titleError,
  descriptionError,
  titleLabel = 'Task title',
  titlePlaceholder = 'Enter task title',
  descriptionPlaceholder = 'Describe what needs to be done or provided',
  descriptionRequired = false,
  showAttachments = true,
}: {
  idPrefix: string
  title: string
  description: string
  onTitleChange: (value: string) => void
  onDescriptionChange: (value: string) => void
  files: File[]
  onFilesChange: (files: File[]) => void
  onRemoveFile: (index: number) => void
  disabled?: boolean
  titleError?: string
  descriptionError?: string
  titleLabel?: string
  titlePlaceholder?: string
  descriptionPlaceholder?: string
  descriptionRequired?: boolean
  showAttachments?: boolean
}) {
  const field = (message?: string) => message ? 'border-red-400 focus:border-red-500 focus:ring-red-100' : ''

  return (
    <>
      <TaskSectionHeader section="basic" />
      <div className="min-w-0">
        <label htmlFor={`${idPrefix}-title`} className="label text-sm">
          {titleLabel} <span className="text-red-600" aria-hidden="true">*</span>
        </label>
        <input id={`${idPrefix}-title`} aria-invalid={!!titleError} required disabled={disabled}
               className={`input h-9 rounded-xl text-sm ${field(titleError)}`} placeholder={titlePlaceholder}
               value={title} onChange={event => onTitleChange(event.target.value)} />
        {titleError && <p className="mt-1 text-xs font-medium text-red-600">{titleError}</p>}
      </div>
      <div className={`mt-3 grid gap-3 ${showAttachments ? 'sm:grid-cols-2' : ''}`}>
        <div className="min-w-0">
          <label htmlFor={`${idPrefix}-description`} className="label text-sm">
            Description {descriptionRequired && <span className="text-red-600" aria-hidden="true">*</span>}
          </label>
          <textarea id={`${idPrefix}-description`} aria-invalid={!!descriptionError}
                    required={descriptionRequired} disabled={disabled}
                    className={`input min-h-[76px] rounded-xl resize-y text-sm ${field(descriptionError)}`}
                    placeholder={descriptionPlaceholder} value={description}
                    onChange={event => onDescriptionChange(event.target.value)} />
          {descriptionError && <p className="mt-1 text-xs font-medium text-red-600">{descriptionError}</p>}
        </div>
        {showAttachments && (
          <div className="min-w-0">
            <label htmlFor={`${idPrefix}-files`} className="label text-sm">Attach files</label>
            <input id={`${idPrefix}-files`} type="file" multiple disabled={disabled} className="sr-only"
                   onChange={event => {
                     const selectedFiles = Array.from(event.currentTarget.files ?? [])
                     if (selectedFiles.length) onFilesChange([...files, ...selectedFiles])
                     event.currentTarget.value = ''
                   }} />
            <label htmlFor={`${idPrefix}-files`}
                   className={`flex h-[76px] w-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-brand-200 bg-brand-50/60 px-3 text-xs font-semibold text-brand-700 transition-colors hover:border-brand-300 hover:bg-brand-50 ${disabled ? 'pointer-events-none opacity-50' : 'cursor-pointer'}`}>
              <Paperclip aria-hidden="true" className="h-4 w-4" />
              Choose files
            </label>
            {files.length > 0 && (
              <ul className="mt-2 space-y-1">
                {files.map((file, index) => (
                  <li key={`${file.name}-${index}`} className="flex min-w-0 items-center justify-between gap-2 rounded-md bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600">
                    <span className="min-w-0 truncate" title={file.name}>{file.name}</span>
                    {!disabled && (
                      <button type="button" aria-label={`Remove ${file.name}`}
                              className="shrink-0 rounded px-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                              onClick={() => onRemoveFile(index)}>
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </>
  )
}
