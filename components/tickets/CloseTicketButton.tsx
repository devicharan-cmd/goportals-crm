'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { errorMessage } from '@/lib/utils'
import { showSuccessToast } from '@/lib/ui-toast'
import { useSingleFlight } from '@/components/shared/useSingleFlight'

export function CloseTicketButton({
  ticketId,
  ticketCode,
}: {
  ticketId: string
  ticketCode: string
}) {
  const router = useRouter()
  const runOnce = useSingleFlight()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleConfirmClose() {
    setLoading(true)
    setError('')
    const { error: rpcError } = await createClient().rpc('close_ticket', { p_ticket_id: ticketId })
    setLoading(false)
    if (rpcError) {
      setError(errorMessage(rpcError))
      return
    }
    setOpen(false)
    showSuccessToast(`Ticket ${ticketCode} closed successfully`)
    router.refresh()
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError('')
          setOpen(true)
        }}
        className="inline-flex items-center gap-1.5 rounded-lg bg-[#045E80] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-all duration-150 hover:bg-[#034C68] hover:shadow active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#045E80] focus-visible:ring-offset-2"
        aria-label={`Close ticket ${ticketCode}`}
      >
        <CheckCircle2 className="h-3.5 w-3.5" /> Close ticket
      </button>

      <Modal
        open={open}
        onClose={() => {
          if (!loading) setOpen(false)
        }}
        title={`Close ticket ${ticketCode}?`}
        description="Are you sure you want to close this ticket?"
        dialogClassName="text-left"
        headerClassName="text-left"
        bodyClassName="text-left"
      >
        <div className="space-y-4 text-left">
          <div className="space-y-2 rounded-xl border border-amber-200/90 bg-amber-50/80 p-3.5 text-xs text-left">
            <p className="font-semibold text-amber-950 text-left">What happens when you close this ticket:</p>
            <ul className="list-disc space-y-1.5 pl-5 text-amber-900 text-left">
              <li className="text-left">The ticket status will change to <strong>Closed</strong>.</li>
              <li className="text-left">No new tasks can be created from this ticket.</li>
              <li className="text-left">Existing tasks and their progress will remain saved and intact.</li>
            </ul>
          </div>

          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-600 text-left" role="alert">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3 text-left">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={loading}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              loading={loading}
              onClick={() => void runOnce('close_ticket', handleConfirmClose)}
            >
              Confirm & close ticket
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
