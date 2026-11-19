'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Modal({
  open, onClose, title, description, children, size = 'md', titleClassName,
  descriptionClassName,
  closeButtonClassName, closeIconClassName, dialogClassName, headerClassName,
  bodyClassName, headerIcon,
  centerHeader = false,
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: React.ReactNode
  size?: 'md' | 'lg' | 'xl'
  titleClassName?: string
  descriptionClassName?: string
  closeButtonClassName?: string
  closeIconClassName?: string
  dialogClassName?: string
  headerClassName?: string
  bodyClassName?: string
  headerIcon?: React.ReactNode
  centerHeader?: boolean
}) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!open) return
    const previousBodyOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previousBodyOverflow
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open || !mounted) return null

  return createPortal((
    <div className="fixed inset-0 z-[1100] flex items-end justify-center bg-[#011B26]/40 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        onClick={e => e.stopPropagation()}
        className={cn('flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white text-left [box-shadow:0_10px_30px_-10px_rgb(2_43_59_/_0.25)] sm:rounded-2xl',
          size === 'md' ? 'sm:max-w-md' : size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-5xl',
          dialogClassName)}
      >
        <div className={cn('relative flex flex-shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-6 py-4 text-left', centerHeader && 'justify-center text-center', headerClassName)}>
          <div className={cn('flex min-w-0 items-start gap-4 text-left', centerHeader && 'justify-center text-center')}>
            {headerIcon}
            <div className={cn('min-w-0 text-left', centerHeader && 'text-center')}>
              <h2 className={cn('text-base font-semibold text-left', centerHeader && 'text-center', titleClassName)}>{title}</h2>
              {description && <p className={cn('mt-0.5 text-sm text-slate-500 text-left', centerHeader && 'text-center', descriptionClassName)}>{description}</p>}
            </div>
          </div>
          <button
            onClick={onClose}
            className={cn('flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[#EAF4F8] text-[#034C68] transition-all duration-150 hover:bg-red-50 hover:text-red-600 active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#63A9C4] focus-visible:ring-offset-2', centerHeader && 'absolute right-6 top-4', closeButtonClassName)}
            aria-label="Close"
          >
            <X className={cn('h-5 w-5', closeIconClassName)} />
          </button>
        </div>
        <div className={cn('min-h-0 flex-1 overflow-y-auto px-6 py-5 text-left', bodyClassName)}>{children}</div>
      </div>
    </div>
  ), document.body)
}
