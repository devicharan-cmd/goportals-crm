'use client'

import { useEffect } from 'react'
import { RefreshCw, WifiOff } from 'lucide-react'
import { Button, ButtonLink } from '@/components/ui/button'

/** Shown when a page fails to load — most often a dropped connection to Supabase. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error) }, [error])

  const network = /fetch failed|network|timeout|Failed to fetch/i.test(error.message ?? '')

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="card w-full max-w-md p-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-600">
          <WifiOff className="h-7 w-7" />
        </div>
        <h1 className="text-xl font-bold">{network ? 'Connection problem' : 'Something went wrong'}</h1>
        <p className="mt-2 text-sm text-slate-500">
          {network
            ? "We couldn't reach the server. Check your internet connection and try again."
            : 'This page could not be loaded. Please try again.'}
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <ButtonLink href="/" variant="secondary">Go home</ButtonLink>
          <Button onClick={reset}><RefreshCw className="h-4 w-4" /> Try again</Button>
        </div>
      </div>
    </div>
  )
}
