export function TaskTabsSkeleton() {
  return (
    <div className="flex h-11 w-fit max-w-full items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 animate-pulse">
      <div className="h-8 w-24 rounded-lg bg-slate-200" />
      <div className="h-8 w-32 rounded-lg bg-slate-100" />
      <div className="h-8 w-24 rounded-lg bg-slate-100" />
      <div className="ml-1 h-9 w-10 rounded-lg bg-slate-100" />
      <div className="h-9 w-10 rounded-lg bg-slate-100" />
    </div>
  )
}

export function TaskFiltersSkeleton() {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 animate-pulse">
      {['w-40', 'w-48', 'w-44', 'w-44', 'w-40', 'w-40'].map((width, index) => (
        <div key={`${width}-${index}`} className={`h-11 ${width} rounded-lg border border-slate-200 bg-white`} />
      ))}
      <div className="ml-auto h-11 w-72 rounded-lg border border-slate-200 bg-white max-sm:ml-0 max-sm:w-full" />
    </div>
  )
}

function TaskCardSkeleton() {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm animate-pulse">
      <div className="flex items-center justify-between gap-2">
        <div className="h-3 w-16 rounded bg-slate-200" />
        <div className="h-5 w-14 rounded-full bg-slate-100" />
      </div>
      <div className="mt-4 h-4 w-11/12 rounded bg-slate-200" />
      <div className="mt-2 h-4 w-3/4 rounded bg-slate-100" />
      <div className="mt-5 border-t border-slate-100 pt-3">
        <div className="h-3 w-24 rounded bg-slate-100" />
      </div>
    </div>
  )
}

export function TaskBoardSkeleton() {
  return (
    <div className="-mx-4 grid min-h-[520px] auto-cols-[minmax(240px,1fr)] grid-flow-col gap-3 overflow-hidden px-4 pb-4 animate-pulse sm:mx-0 sm:px-0">
      {Array.from({ length: 6 }).map((_, index) => (
        <section key={index} className="flex min-w-0 flex-1 flex-col rounded-xl border border-slate-200 bg-white p-2.5">
          <div className="flex h-8 items-center justify-between rounded-md bg-slate-200 px-3">
            <div className="h-3 w-28 rounded bg-white/70" />
            <div className="h-5 w-5 rounded-full bg-white/60" />
          </div>
          <div className="mt-2 flex flex-col gap-2 bg-[radial-gradient(rgba(148,163,184,.24)_1px,transparent_1px)] [background-size:14px_14px] p-1">
            <TaskCardSkeleton />
            <TaskCardSkeleton />
          </div>
        </section>
      ))}
    </div>
  )
}

export function TaskListSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white animate-pulse">
      <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr] gap-4 border-b border-slate-100 px-5 py-4">
        {[1, 2, 3, 4].map(item => <div key={item} className="h-3 rounded bg-slate-200" />)}
      </div>
      {Array.from({ length: 8 }).map((_, index) => (
        <div key={index} className="grid grid-cols-[1.5fr_1fr_1fr_1fr] gap-4 border-b border-slate-100 px-5 py-4 last:border-0">
          <div className="h-4 w-4/5 rounded bg-slate-200" />
          <div className="h-4 w-3/5 rounded bg-slate-100" />
          <div className="h-4 w-3/5 rounded bg-slate-100" />
          <div className="h-4 w-2/5 rounded bg-slate-100" />
        </div>
      ))}
    </div>
  )
}

export function TaskPageSkeleton({ board = true }: { board?: boolean }) {
  return (
    <div className="space-y-3">
      <TaskTabsSkeleton />
      <TaskFiltersSkeleton />
      <TaskResultsSkeleton board={board} />
    </div>
  )
}

export function TaskResultsSkeleton({ board = true }: { board?: boolean }) {
  return board ? <TaskBoardSkeleton /> : <TaskListSkeleton />
}
