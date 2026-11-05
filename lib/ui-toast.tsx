import { Check, TriangleAlert } from 'lucide-react'
import toast from 'react-hot-toast'

export function showSuccessToast(message: string) {
  return toast.custom(t => (
    <div
      className={`flex max-w-[260px] items-center gap-2.5 rounded-lg border border-slate-200/90 bg-white px-2.5 py-2 shadow-[0_6px_18px_rgba(15,23,42,0.12)] transition-all duration-200 ${
        t.visible ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0'
      }`}
      role="status"
      aria-live="polite"
    >
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-lime-100 text-lime-700 ring-1 ring-lime-200">
        <Check className="h-3.5 w-3.5" strokeWidth={3} />
      </span>
      <span className="min-w-0 flex-1 text-[12px] font-semibold leading-4 text-slate-700">{message}</span>
    </div>
  ), { duration: 3500, position: 'top-right' })
}

export function showErrorToast(message: string) {
  return toast.custom(t => (
    <div
      className={`flex max-w-[260px] items-center gap-2.5 rounded-lg border border-red-200 bg-white px-2.5 py-2 shadow-[0_6px_18px_rgba(127,29,29,0.12)] transition-all duration-200 ${
        t.visible ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0'
      }`}
      role="alert"
    >
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600 ring-1 ring-red-200">
        <TriangleAlert className="h-3.5 w-3.5" strokeWidth={2.5} />
      </span>
      <span className="min-w-0 flex-1 text-[12px] font-semibold leading-4 text-slate-700">{message}</span>
    </div>
  ), { duration: 4500, position: 'top-right' })
}
