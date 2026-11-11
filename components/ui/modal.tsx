'use client'

import { useEffect } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Modal({
  open, onClose, title, description, children, size = 'md', titleClassName,
  closeButtonClassName, closeIconClassName, dialogClassName, headerClassName,
  bodyClassName, headerIcon,
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: React.ReactNode
  size?: 'md' | 'lg' | 'xl'
  titleClassName?: string
  closeButtonClassName?: string
  closeIconClassName?: string
  dialogClassName?: string
  headerClassName?: string
  bodyClassName?: string
  headerIcon?: React.ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[1100] flex items-end justify-center bg-[#011B26]/40 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        onClick={e => e.stopPropagation()}
        className={cn('max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white [box-shadow:0_10px_30px_-10px_rgb(2_43_59_/_0.25)] sm:rounded-2xl',
          size === 'md' ? 'sm:max-w-md' : size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-5xl',
          dialogClassName)}
      >
        <div className={cn('flex flex-shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-6 py-4', headerClassName)}>
          <div className="flex min-w-0 items-start gap-4">
            {headerIcon}
            <div className="min-w-0">
              <h2 className={cn('text-base font-semibold', titleClassName)}>{title}</h2>
              {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
            </div>
          </div>
          <button
            onClick={onClose}
            className={cn('flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[#EAF4F8] text-[#034C68] transition-all duration-150 hover:bg-red-50 hover:text-red-600 active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#63A9C4] focus-visible:ring-offset-2', closeButtonClassName)}
            aria-label="Close"
          >
            <X className={cn('h-5 w-5', closeIconClassName)} />
          </button>
        </div>
        <div className={cn('px-6 py-5', bodyClassName)}>{children}</div>
      </div>
    </div>
  )
}
