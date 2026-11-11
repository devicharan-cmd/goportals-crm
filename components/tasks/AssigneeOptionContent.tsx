import { Avatar } from '@/components/ui/primitives'
import type { AppRole } from '@/types/database'

export function AssigneeOptionContent({
  name, avatarUrl, avatarRole, roleLabel, isMe = false,
}: {
  name: string
  avatarUrl?: string | null
  avatarRole?: AppRole
  roleLabel?: string
  isMe?: boolean
}) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Avatar name={name} src={avatarUrl} role={avatarRole} size="sm" className="h-6 w-6 text-[11px]" />
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-[13px] font-medium leading-4 text-slate-900">{name}{isMe ? ' (me)' : ''}</span>
        {roleLabel && <span className="truncate text-[11px] leading-3 text-slate-500">({roleLabel})</span>}
      </span>
    </span>
  )
}
