import { CheckCircle2 } from 'lucide-react'
import { Logo } from '@/components/layout/Logo'

const POINTS = [
  'Amazon, Flipkart, Blinkit, Zepto & more — one place',
  'Ads, listings and onboarding tracked end to end',
  'See every task, update and deadline in real time',
]

/** Split-screen frame for login / signup / password pages. */
export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-[#034C68] via-[#033B51] to-[#011B26] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-[#95C12C]/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-[#2A87AA]/30 blur-3xl" />

        <p className="relative text-sm font-semibold uppercase tracking-[0.2em] text-[#A5CD3F]">GoPortals</p>

        <div className="relative max-w-md">
          <h1 className="font-sans text-5xl font-extrabold leading-[1.05] text-white">
            Go beyond <span className="text-[#A5CD3F]">limit.</span>
          </h1>
          <p className="mt-4 text-lg text-[#CFE6EF]">
            Your e-commerce and quick-commerce growth partner — every ticket, task and result in one workspace.
          </p>
          <ul className="mt-8 space-y-3">
            {POINTS.map(p => (
              <li key={p} className="flex items-start gap-3 text-[#EAF4F8]">
                <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-[#A5CD3F]" />
                {p}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-[#9FCCDE]">© {new Date().getFullYear()} GoPortals</p>
      </div>

      <div className="flex items-center justify-center bg-white px-6 py-12">
        <div className="w-full max-w-sm">
          <Logo className="mb-10 h-10" priority />
          {children}
        </div>
      </div>
    </div>
  )
}
