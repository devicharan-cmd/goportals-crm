'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { errorMessage } from '@/lib/utils'

/** The client approving & closing their own resolved ticket (close_ticket RPC). */
export function CloseTicketButton({ ticketId }: { ticketId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function close() {
    setLoading(true)
    setError('')
    const { error } = await createClient().rpc('close_ticket', { p_ticket_id: ticketId })
    setLoading(false)
    if (error) setError(errorMessage(error))
    else router.refresh()
  }

  return (
    <div className="mt-6 flex flex-col items-start gap-2 rounded-lg bg-lime-50 px-4 py-3 ring-1 ring-inset ring-lime-200 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm font-medium text-lime-800">Happy with this? Closing confirms it's done.</p>
      <Button size="sm" variant="lime" loading={loading} onClick={close}><CheckCircle2 className="h-3.5 w-3.5" /> Close ticket</Button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  )
}
