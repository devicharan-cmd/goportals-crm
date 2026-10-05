import { cn } from '@/lib/utils'

export type WeekBucket = { label: string; range: string; count: number }

/**
 * Tasks completed per week — single series, so no legend (the card title names it).
 * Thin bars rounded at the data end, recessive baseline, value shown on hover and on the latest week.
 */
export function WeeklyDoneChart({ weeks }: { weeks: WeekBucket[] }) {
  const max = Math.max(1, ...weeks.map(w => w.count))
  const total = weeks.reduce((s, w) => s + w.count, 0)
  return (
    <figure>
      <div className="flex h-40 items-end gap-2 border-b border-slate-200 px-1" role="img"
           aria-label={`Tasks completed per week, last ${weeks.length} weeks: ${weeks.map(w => `${w.label} ${w.count}`).join(', ')}`}>
        {weeks.map((w, i) => {
          const last = i === weeks.length - 1
          return (
            <div key={w.label} className="group relative flex h-full flex-1 flex-col justify-end">
              {/* hover target is the whole column, bigger than the bar */}
              <div className="pointer-events-none absolute -top-1 left-1/2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[11px] text-white opacity-0 shadow transition group-hover:opacity-100">
                <span className="font-semibold">{w.count}</span> done · {w.range}
              </div>
              {(last || w.count === max) && w.count > 0 && (
                <span className="mb-1 text-center text-[11px] font-semibold text-slate-700">{w.count}</span>
              )}
              <div
                className={cn('mx-auto w-full max-w-[28px] rounded-t transition-colors',
                  w.count ? 'bg-brand-500 group-hover:bg-brand-700' : 'bg-slate-200')}
                style={{ height: w.count ? `${(w.count / max) * 100}%` : '2px', minHeight: w.count ? 4 : 2 }}
              />
            </div>
          )
        })}
      </div>
      <div className="mt-1.5 flex gap-2 px-1">
        {weeks.map(w => <span key={w.label} className="flex-1 text-center text-[10px] text-slate-400">{w.label}</span>)}
      </div>
      <figcaption className="mt-2 text-xs text-slate-500">{total} completed in the last {weeks.length} weeks</figcaption>
    </figure>
  )
}
