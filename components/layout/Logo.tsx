import Image from 'next/image'
import { cn } from '@/lib/utils'

export function Logo({ className, priority }: { className?: string; priority?: boolean }) {
  return (
    <Image
      src="/logo.png"
      alt="GoPortals — Go beyond limit"
      // Keep the intrinsic dimensions in sync with public/logo.png (800×150)
      // so the browser can reserve the correct aspect ratio before loading.
      width={800}
      height={150}
      priority={priority}
      className={cn('h-6 w-auto', className)}
    />
  )
}
