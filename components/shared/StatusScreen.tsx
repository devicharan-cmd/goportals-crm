import { Logo } from '@/components/layout/Logo'
import { SignOutButton } from '@/components/shared/SignOutButton'

/** Full-page message for pending / blocked accounts. */
export function StatusScreen({
  icon: Icon, tone, title, children,
}: { icon: React.ElementType; tone: 'amber' | 'red'; title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-brand-50 to-slate-50 px-4">
      <Logo className="mb-10 h-10" priority />
      <div className="card w-full max-w-md p-8 text-center">
        <div className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full ${tone === 'amber' ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-600'}`}>
          <Icon className="h-7 w-7" />
        </div>
        <h1 className="text-xl font-bold">{title}</h1>
        <div className="mt-2 text-sm text-slate-500">{children}</div>
        <SignOutButton className="mt-6" />
      </div>
    </div>
  )
}
