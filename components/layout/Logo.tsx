import Image from 'next/image'
import { cn } from '@/lib/utils'

export function Logo({ className, priority }: { className?: string; priority?: boolean }) {
  return (
    <Image
      src="/logo.webp"
      alt="GoPortals — Go beyond limit"
      // Keep the intrinsic dimensions in sync with public/logo.webp (800×150)
      // so the browser can reserve the correct aspect ratio before loading.
      width={800}
      height={150}
      // The logo never occupies the full viewport. This prevents Next from
      // selecting the 1920px responsive candidate for a compact header logo.
      sizes="(min-width: 640px) 160px, 128px"
      priority={priority}
      className={cn('h-6 w-auto', className)}
    />
  )
}
