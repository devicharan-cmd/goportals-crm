import { Camera, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export function ProfileImageControl({
  children,
  busy = false,
  onClick,
  label,
  className,
}: {
  children: React.ReactNode
  busy?: boolean
  onClick: () => void
  label: string
  className: string
}) {
  return (
    <div className="relative inline-flex">
      <div className={cn('relative overflow-hidden', className)}>
        {children}
        {busy && (
          <span className="absolute inset-0 flex items-center justify-center bg-slate-900/50">
            <Loader2 className="h-5 w-5 animate-spin text-white sm:h-6 sm:w-6" />
          </span>
        )}
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={onClick}
        aria-label={label}
        className="absolute bottom-0 right-0 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-[#95C12C] text-white shadow-md ring-2 ring-white transition hover:bg-[#789C20] disabled:opacity-50 sm:h-7 sm:w-7"
      >
        <Camera className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
      </button>
    </div>
  )
}
