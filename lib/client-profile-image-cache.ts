'use client'

import { createClient } from '@/lib/supabase/client'

const SIGNED_URL_TTL_MS = 55 * 60 * 1000
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>()
const pendingUrls = new Map<string, Promise<string | null>>()

/** Reuse and coalesce signed client-avatar requests across mounted CRM views. */
export async function getClientProfileImageUrls(paths: string[]): Promise<Record<string, string>> {
  const uniquePaths = Array.from(new Set(paths.filter(Boolean)))
  const now = Date.now()
  const results: Record<string, string> = {}
  const pathsToSign: string[] = []
  const waits: Promise<void>[] = []

  for (const path of uniquePaths) {
    const cached = signedUrlCache.get(path)
    if (cached && cached.expiresAt > now) {
      results[path] = cached.url
      continue
    }
    signedUrlCache.delete(path)
    const pending = pendingUrls.get(path)
    if (pending) {
      waits.push(pending.then(url => { if (url) results[path] = url }))
      continue
    }
    pathsToSign.push(path)
  }

  if (pathsToSign.length) {
    let resolveBatch!: (urls: Map<string, string>) => void
    const batch = new Promise<Map<string, string>>(resolve => { resolveBatch = resolve })
    for (const path of pathsToSign) {
      const pending = batch.then(urls => urls.get(path) ?? null)
      pendingUrls.set(path, pending)
      waits.push(pending.then(url => { if (url) results[path] = url }))
    }

    try {
      const { data, error } = await createClient().storage.from('client-profile-images').createSignedUrls(pathsToSign, 3600)
      const signedUrls = new Map<string, string>()
      if (!error) {
        for (const [index, item] of (data ?? []).entries()) {
          const path = item.path ?? pathsToSign[index]
          if (path && item.signedUrl) {
            signedUrls.set(path, item.signedUrl)
            signedUrlCache.set(path, { url: item.signedUrl, expiresAt: Date.now() + SIGNED_URL_TTL_MS })
          }
        }
      }
      resolveBatch(signedUrls)
    } catch {
      resolveBatch(new Map())
    } finally {
      pathsToSign.forEach(path => pendingUrls.delete(path))
    }
  }

  await Promise.all(waits)
  return results
}
