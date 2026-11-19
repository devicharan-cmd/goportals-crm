'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { cn, errorMessage } from '@/lib/utils'
import { showSuccessToast } from '@/lib/ui-toast'
import { useSingleFlight } from '@/components/shared/useSingleFlight'

export function DeleteButton({
  table, id, redirectTo, label = 'Delete', variant = 'ghost', description, confirmationTitle, confirmLabel,
  disabled = false, disabledReason, deleteCurrentScheduledTask = false, successMessage,
}: {
  table: 'tasks' | 'tickets' | 'clients'
  id: string
  redirectTo: string
  label?: string
  variant?: 'ghost' | 'danger'
  description?: string
  confirmationTitle?: string
  confirmLabel?: string
  disabled?: boolean
  disabledReason?: string
  deleteCurrentScheduledTask?: boolean
  successMessage?: string
}) {
  const router = useRouter()
  const runOnce = useSingleFlight()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const itemName = table === 'tasks' ? 'task' : table === 'tickets' ? 'ticket' : 'client'

  async function remove() {
    setError('')
    setLoading(true)
    if (table === 'tickets') {
      window.dispatchEvent(new CustomEvent('gp:ticket-delete-started', { detail: { id } }))
    }
    let failure: string | null = null
    let warning: string | null = null
    if (table === 'clients') {
      try {
        const response = await fetch(`/api/admin/clients/${encodeURIComponent(id)}`, { method: 'DELETE' })
        const result = await response.json() as { error?: unknown }
        if (!response.ok) failure = typeof result.error === 'string' ? result.error : 'Could not delete the client.'
      } catch (requestError) {
        failure = errorMessage(requestError)
      }
    } else if (table === 'tasks') {
      const client = createClient()
      if (deleteCurrentScheduledTask) {
        try {
          const response = await fetch(`/api/tasks/${encodeURIComponent(id)}?scheduled=1`, { method: 'DELETE' })
          const result = await response.json() as { error?: unknown; warning?: unknown }
          if (!response.ok) failure = typeof result.error === 'string' ? result.error : 'Could not delete this scheduled task.'
          else if (typeof result.warning === 'string') warning = result.warning
        } catch (requestError) {
          failure = errorMessage(requestError)
        }
      } else {
        try {
          const response = await fetch(`/api/tasks/${encodeURIComponent(id)}`, { method: 'DELETE' })
          const result = await response.json() as { error?: unknown; warning?: unknown }
          if (!response.ok) failure = typeof result.error === 'string' ? result.error : 'Could not delete this task.'
          else if (typeof result.warning === 'string') warning = result.warning
        } catch (requestError) {
          failure = errorMessage(requestError)
        }
      }
    } else {
      const client = createClient()
      const { data, error } = await client.from(table).delete().eq('id', id).select('id')
      if (error) failure = errorMessage(error)
      else if (!data?.length) failure = `Could not delete this ${itemName}; you may not have permission.`
    }
    setLoading(false)
    if (failure) {
      if (table === 'tickets') {
        window.dispatchEvent(new CustomEvent('gp:ticket-delete-failed', { detail: { id } }))
      }
      setError(failure)
      return
    }
    showSuccessToast(warning ?? successMessage ?? `${itemName[0].toUpperCase()}${itemName.slice(1)} deleted`)
    router.push(redirectTo)
    router.refresh()
  }

  return (
    <>
      <Button
        variant={variant}
        size="sm"
        className={variant === 'ghost' ? 'text-red-600 hover:bg-red-50 hover:text-red-700' : undefined}
        disabled={disabled}
        title={disabled ? disabledReason : undefined}
        onClick={() => { setError(''); setOpen(true) }}
      >
        <Trash2 className="h-3.5 w-3.5" /> {label}
      </Button>
      <Modal
        open={open}
        onClose={() => { if (!loading) setOpen(false) }}
        title={confirmationTitle ?? `Delete ${itemName}?`}
        description={table === 'tickets' ? undefined : description ?? `This ${itemName} will be permanently deleted. This action cannot be undone.`}
        centerHeader={table === 'clients'}
        titleClassName={table === 'clients' ? 'text-lg font-semibold leading-6' : undefined}
        descriptionClassName={table === 'clients' ? 'mt-2 text-sm font-normal leading-5 text-slate-500' : undefined}
        headerClassName={table === 'clients' ? 'border-b-0 px-10 pb-4 pt-6' : undefined}
        bodyClassName={table === 'clients' ? 'px-5 pb-5 pt-0' : undefined}
        dialogClassName={table === 'clients' ? 'sm:max-w-[26rem] sm:rounded-lg' : undefined}
        closeButtonClassName={table === 'clients' ? 'right-3 top-3 h-7 w-7 rounded-md bg-transparent text-slate-400 hover:bg-slate-100 hover:text-slate-600' : undefined}
        closeIconClassName={table === 'clients' ? 'h-4 w-4' : undefined}
        headerIcon={
          <span className={cn('mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600 ring-1 ring-inset ring-red-100', table === 'clients' && 'hidden')}>
            <AlertTriangle className="h-5 w-5" strokeWidth={2.25} />
          </span>
        }
      >
        {table === 'tickets' && (
          <p className="mx-auto max-w-md text-center text-sm leading-6 text-slate-600">
            {description ?? 'This ticket will be permanently deleted. This action cannot be undone.'}
          </p>
        )}
        {table === 'clients' && (
          <div className="mx-auto max-w-md rounded-lg bg-[#ffeddc] px-4 py-4 text-sm font-normal leading-5 text-[#c2410c]">
            <p className="flex items-center gap-2 font-medium">
              <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={2.5} />
              Warning
            </p>
            <p className="mt-1.5">
              This permanently removes the client and portal login, including company/onboarding details, all client tickets and tasks (including company-side history), comments, attachments, activity, and uploaded files. This cannot be undone.
            </p>
          </div>
        )}
        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className={cn('mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4', table === 'clients' && 'justify-center gap-4 border-t-0 pt-0')}>
          <Button variant="secondary" size="sm" disabled={loading} onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            variant="danger"
            size="sm"
            loading={loading}
            className={cn('shadow-[0_4px_12px_rgba(220,38,38,0.2)] transition-all hover:-translate-y-0.5 hover:shadow-[0_6px_16px_rgba(220,38,38,0.28)] active:translate-y-0', table === 'clients' && 'bg-red-600 shadow-none hover:translate-y-0 hover:bg-red-700 hover:shadow-none')}
            onClick={() => void runOnce('delete', remove)}
          >
            <Trash2 className="h-3.5 w-3.5" /> {confirmLabel ?? `Delete ${itemName}`}
          </Button>
        </div>
      </Modal>
    </>
  )
}
