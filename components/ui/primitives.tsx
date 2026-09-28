import Link from 'next/link'
import { AlertCircle, CheckCircle2 } from 'lucide-react'
import { cn, getInitials } from '@/lib/utils'

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('card', className)}>{children}</div>
}

export function CardHeader({
  title, description, action, className,
}: { title: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4', className)}>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
      </div>
      {action}
    </div>
  )
}

export function PageHeader({
  title, description, actions, back,
}: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; back?: React.ReactNode }) {
  return (
    <div className="mb-6">
      {back && <div className="mb-3">{back}</div>}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">{title}</h1>
          {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  )
}

export function EmptyState({
  icon: Icon, title, description, action,
}: { icon?: React.ElementType; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {Icon && (
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">
          <Icon className="h-6 w-6" />
        </div>
      )}
      <p className="font-semibold text-slate-900">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Alert({ tone = 'error', children }: { tone?: 'error' | 'success' | 'info'; children: React.ReactNode }) {
  const styles = {
    error:   'bg-red-50 text-red-700 ring-red-200',
    success: 'bg-lime-50 text-lime-800 ring-lime-200',
    info:    'bg-brand-50 text-brand-800 ring-brand-200',
  }
  const Icon = tone === 'success' ? CheckCircle2 : AlertCircle
  return (
    <div className={cn('flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm ring-1 ring-inset', styles[tone])}>
      <Icon className="mt-0.5 h-4 w-4 flex-shrink-0" />
      <div>{children}</div>
    </div>
  )
}

export function Field({
  label, hint, error, required, className, children,
}: { label?: string; hint?: string; error?: string; required?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      {label && (
        <label className="label">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      {children}
      {hint && !error && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}

const AVATAR_COLORS = [
  'bg-brand-100 text-brand-700', 'bg-lime-100 text-lime-800', 'bg-violet-100 text-violet-700',
  'bg-amber-100 text-amber-800', 'bg-sky-100 text-sky-700', 'bg-rose-100 text-rose-700',
]

export function Avatar({ name, size = 'md', className }: { name: string | null | undefined; size?: 'xs' | 'sm' | 'md' | 'lg'; className?: string }) {
  const sizes = { xs: 'h-5 w-5 text-[10px]', sm: 'h-7 w-7 text-xs', md: 'h-9 w-9 text-sm', lg: 'h-12 w-12 text-base' }
  const hash = (name ?? '').split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  return (
    <span
      title={name ?? undefined}
      className={cn('inline-flex flex-shrink-0 items-center justify-center rounded-full font-semibold',
        sizes[size], AVATAR_COLORS[hash % AVATAR_COLORS.length], className)}
    >
      {getInitials(name)}
    </span>
  )
}

export function StatCard({
  label, value, hint, icon: Icon, tone = 'brand', href,
}: { label: string; value: React.ReactNode; hint?: string; icon: React.ElementType; tone?: 'brand' | 'lime' | 'red' | 'amber'; href?: string }) {
  const tones = {
    brand: 'bg-brand-50 text-brand-600',
    lime:  'bg-lime-50 text-lime-700',
    red:   'bg-red-50 text-red-600',
    amber: 'bg-amber-50 text-amber-600',
  }
  const body = (
    <div className="card flex items-center gap-4 p-5 transition hover:shadow-pop">
      <div className={cn('flex h-11 w-11 items-center justify-center rounded-xl', tones[tone])}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold text-slate-900 font-display">{value}</p>
        <p className="text-xs font-medium text-slate-500">{label}</p>
        {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
      </div>
    </div>
  )
  return href ? <Link href={href}>{body}</Link> : body
}
