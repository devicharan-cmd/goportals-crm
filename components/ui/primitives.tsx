 'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2 } from 'lucide-react'
import { cn, getInitials } from '@/lib/utils'
import type { AppRole } from '@/types/database'
import { ROLE_STYLES } from '@/lib/constants'

export function Card({ className, children, id }: { className?: string; children: React.ReactNode; id?: string }) {
  return <div id={id} className={cn('content-card', className)}>{children}</div>
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
}: { title?: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; back?: React.ReactNode }) {
  return (
    <div className="mb-6">
      {back && <div className="mb-3">{back}</div>}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {title && <h1 className="text-2xl font-bold">{title}</h1>}
          {description && <p className={title ? 'mt-1 text-sm text-slate-500' : 'text-sm text-slate-500'}>{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  )
}

export function EmptyState({
  icon, title, description, action,
}: { icon?: React.ReactNode; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon && (
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#EAF4F8] text-[#045E80]">
          <span className="[&>svg]:h-6 [&>svg]:w-6">{icon}</span>
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
    success: 'bg-[#F5FAE8] text-[#465B17] ring-[#D3E896]',
    info:    'bg-[#EAF4F8] text-[#033B51] ring-[#9FCCDE]',
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
  label, hint, error, errorId, required, className, children,
}: { label?: string; hint?: string; error?: string; errorId?: string; required?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      {label && (
        <label className="form-field-label">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      {children}
      {hint && !error && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {error && <p id={errorId} className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}

const AVATAR_COLORS = [
  'bg-[#CFE6EF] text-[#034C68]', 'bg-[#E8F3C8] text-[#465B17]', 'bg-violet-100 text-violet-700',
  'bg-amber-100 text-amber-800', 'bg-sky-100 text-sky-700', 'bg-rose-100 text-rose-700',
]

export function Avatar({ name, src, role, size = 'md', className }: { name: string | null | undefined; src?: string | null; role?: AppRole; size?: 'xs' | 'sm' | 'md' | 'lg'; className?: string }) {
  const sizes = { xs: 'h-5 w-5 text-[10px]', sm: 'h-7 w-7 text-xs', md: 'h-9 w-9 text-sm', lg: 'h-12 w-12 text-base' }
  const hash = (name ?? '').split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  const [imageFailed, setImageFailed] = useState(false)
  useEffect(() => setImageFailed(false), [src])
  return (
    <span
      title={name ?? undefined}
      className={cn('inline-flex flex-shrink-0 items-center justify-center rounded-full font-semibold',
        sizes[size], (role ? ROLE_STYLES[role].avatar : undefined) ?? AVATAR_COLORS[hash % AVATAR_COLORS.length], className)}
    >
      {src && !imageFailed
        ? <img src={src} alt="" className="h-full w-full rounded-[inherit] object-cover" onError={() => setImageFailed(true)} />
        : getInitials(name)}
    </span>
  )
}

export function CompanyAvatar({ name, src, size = 'md', className }: { name: string; src?: string | null; size?: 'xs' | 'sm' | 'md' | 'lg'; className?: string }) {
  const sizes = { xs: 'h-5 w-5 text-[8px]', sm: 'h-10 w-10 text-sm', md: 'h-14 w-14 text-lg', lg: 'h-20 w-20 text-2xl' }
  return (
    <div aria-label={`${name} company image`} role="img" className={cn(
      'flex flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-[#0A6F94] to-[#033B51] font-sans font-bold text-white',
      sizes[size], className,
    )} style={size === 'xs' ? { width: 20, height: 20, minWidth: 20, minHeight: 20 } : undefined}>
      {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : getInitials(name)}
    </div>
  )
}

export function StatCard({
  label, value, hint, icon, tone = 'brand', href,
}: { label: string; value: React.ReactNode; hint?: string; icon: React.ReactNode; tone?: 'brand' | 'lime' | 'red' | 'amber'; href?: string }) {
  const tones = {
    brand: 'bg-[#EAF4F8] text-[#045E80]',
    lime:  'bg-[#F5FAE8] text-[#5B771A]',
    red:   'bg-red-50 text-red-600',
    amber: 'bg-amber-50 text-amber-600',
  }
  const body = (
    <div className="content-card flex items-center gap-4 p-5 transition hover:[box-shadow:0_10px_30px_-10px_rgb(2_43_59_/_0.25)]">
      <div className={cn('flex h-11 w-11 items-center justify-center rounded-xl', tones[tone])}>
        <span className="[&>svg]:h-5 [&>svg]:w-5">{icon}</span>
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold text-slate-900 font-sans">{value}</p>
        <p className="text-xs font-medium text-slate-500">{label}</p>
        {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
      </div>
    </div>
  )
  return href ? <Link href={href}>{body}</Link> : body
}
