import { cn, healthColor } from '@/lib/utils'

/** Client relationship health as just a coloured bar (green/amber/red) — no label or number. */
export function HealthBar({ score }: { score: number }) {
  return (
    <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
      <div className={cn('h-full rounded-full transition-all', healthColor(score))} style={{ width: `${Math.min(100, Math.max(0, score))}%` }} />
    </div>
  )
}
