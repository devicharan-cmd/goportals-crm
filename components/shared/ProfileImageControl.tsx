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
      <button
        type="button"
        disabled={busy}
        onClick={onClick}
        aria-label={label}
        className={cn('group relative overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-[#63A9C4]', className)}
      >
        {children}
        <span className="absolute inset-0 flex items-center justify-center bg-slate-900/35 opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
          <Camera className="h-7 w-7 text-white" />
        </span>
        {busy && (
          <span className="absolute inset-0 flex items-center justify-center bg-slate-900/50">
            <Loader2 className="h-6 w-6 animate-spin text-white" />
          </span>
        )}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={onClick}
        aria-label={label}
        className="absolute bottom-0 right-0 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-[#95C12C] text-white shadow-md ring-2 ring-white transition hover:bg-[#789C20] disabled:opacity-50"
      >
        <Camera className="h-4 w-4" />
      </button>
    </div>
  )
}
