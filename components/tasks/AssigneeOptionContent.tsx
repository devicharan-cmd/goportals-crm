import { Avatar } from '@/components/ui/primitives'
import type { AppRole } from '@/types/database'

export function AssigneeOptionContent({
  name, avatarUrl, avatarRole, roleLabel, isMe = false, compact = false,
}: {
  name: string
  avatarUrl?: string | null
  avatarRole?: AppRole
  roleLabel?: string
  isMe?: boolean
  compact?: boolean
}) {
  return (
    <span className={compact ? 'flex min-w-0 items-center gap-1.5' : 'flex min-w-0 items-center gap-2'}>
      <Avatar name={name} src={avatarUrl} role={avatarRole} size="sm" className={compact ? 'h-5 w-5 text-[10px]' : 'h-6 w-6 text-xs'} />
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-xs font-medium leading-4 text-slate-900">{name}{isMe ? ' (me)' : ''}</span>
        {roleLabel && <span className={compact ? 'truncate text-[10px] leading-3 text-slate-500' : 'truncate text-xs leading-3 text-slate-500'}>({roleLabel})</span>}
      </span>
    </span>
  )
}
