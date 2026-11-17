'use client'

import { useEffect, useState } from 'react'
import { getClientProfileImageUrls } from '@/lib/client-profile-image-cache'
import { Avatar, CompanyAvatar } from '@/components/ui/primitives'
import type { AppRole } from '@/types/database'

type Props = {
  name: string
  imagePath: string | null
  size?: 'xs' | 'sm' | 'md' | 'lg'
  role?: AppRole
  company?: boolean
}

/** Render the fallback immediately, then load a private client image in the browser. */
export function SignedClientAvatar({ name, imagePath, size = 'xs', role = 'client', company = false }: Props) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setSignedUrl(null)
    if (!imagePath) return () => { active = false }

    void getClientProfileImageUrls([imagePath])
      .then(urls => {
        if (active) setSignedUrl(urls[imagePath] ?? null)
      })
      .catch(() => {})

    return () => { active = false }
  }, [imagePath])

  return company
    ? <CompanyAvatar name={name} src={signedUrl} size={size} />
    : <Avatar name={name} src={signedUrl} role={role} size={size} />
}
