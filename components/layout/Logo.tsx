import Image from 'next/image'
import { cn } from '@/lib/utils'

export function Logo({ className, priority }: { className?: string; priority?: boolean }) {
  return (
    <Image
      src="/logo.png"
      alt="GoPortals — Go beyond limit"
      width={253}
      height={54}
      priority={priority}
      className={cn('h-9 w-auto', className)}
    />
  )
}
