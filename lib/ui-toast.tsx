import { Check, TriangleAlert } from 'lucide-react'
import toast from 'react-hot-toast'

type ToastTone = 'success' | 'error'

function showToast(message: string, tone: ToastTone) {
  const success = tone === 'success'
  return toast.custom(t => (
    <div
      className={`relative flex w-[min(calc(100vw-24px),300px)] items-center gap-2.5 overflow-hidden rounded-xl border px-3 py-2.5 shadow-[0_10px_24px_rgba(2,24,36,0.16),0_2px_7px_rgba(2,24,36,0.08)] backdrop-blur-xl transition-all duration-200 ease-out ${
        success
          ? 'border-[#b9d978]/35 bg-[#0d3b4d]/82'
          : 'border-red-300/35 bg-[#3b1c2a]/82'
      } ${t.visible ? 'translate-y-0 scale-100 opacity-100' : '-translate-y-1 scale-[.98] opacity-0'}`}
      role={success ? 'status' : 'alert'}
      aria-live={success ? 'polite' : 'assertive'}
    >
      <span className={`absolute inset-y-2 left-0 w-0.5 rounded-full ${success ? 'bg-[#a7cf36]' : 'bg-[#ff7a86]'}`} aria-hidden="true" />
      <span className={`ml-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${success ? 'bg-[#b9d978]/20 text-[#c7e66b]' : 'bg-[#ff7a86]/15 text-[#ff9da6]'}`}>
        {success
          ? <Check className="h-3.5 w-3.5" strokeWidth={3} />
          : <TriangleAlert className="h-3.5 w-3.5" strokeWidth={2.5} />}
      </span>
      <span className="min-w-0 flex-1 text-[11px] font-medium leading-[1.35] tracking-[0.01em] text-white/95">{message}</span>
    </div>
  ), { duration: success ? 3500 : 4500, position: 'top-right' })
}

export function showSuccessToast(message: string) {
  return showToast(message, 'success')
}

export function showErrorToast(message: string) {
  return showToast(message, 'error')
}
