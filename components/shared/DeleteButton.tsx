'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { errorMessage } from '@/lib/utils'
import { showErrorToast, showSuccessToast } from '@/lib/ui-toast'

export function DeleteButton({
  table, id, redirectTo, label = 'Delete', variant = 'ghost', description, confirmationTitle, confirmLabel,
}: {
  table: 'tasks' | 'tickets' | 'clients'
  id: string
  redirectTo: string
  label?: string
  variant?: 'ghost' | 'danger'
  description?: string
  confirmationTitle?: string
  confirmLabel?: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const itemName = table === 'tasks' ? 'task' : table === 'tickets' ? 'ticket' : 'client'

  async function remove() {
    setError('')
    setLoading(true)
    let failure: string | null = null
    if (table === 'clients') {
      try {
        const response = await fetch(`/api/admin/clients/${encodeURIComponent(id)}`, { method: 'DELETE' })
        const result = await response.json() as { error?: unknown }
        if (!response.ok) failure = typeof result.error === 'string' ? result.error : 'Could not delete the client.'
      } catch (requestError) {
        failure = errorMessage(requestError)
      }
    } else {
      const { data, error } = await createClient().from(table).delete().eq('id', id).select('id')
      if (error) failure = errorMessage(error)
      else if (!data?.length) failure = `Could not delete this ${itemName}; you may not have permission.`
    }
    setLoading(false)
    if (failure) {
      setError(failure)
      showErrorToast(failure)
      return
    }
    showSuccessToast(`${itemName[0].toUpperCase()}${itemName.slice(1)} deleted`)
    router.push(redirectTo)
    router.refresh()
  }

  return (
    <>
      <Button
        variant={variant}
        size="sm"
        className={variant === 'ghost' ? 'text-red-600 hover:bg-red-50 hover:text-red-700' : undefined}
        onClick={() => { setError(''); setOpen(true) }}
      >
        <Trash2 className="h-3.5 w-3.5" /> {label}
      </Button>
      <Modal
        open={open}
        onClose={() => { if (!loading) setOpen(false) }}
        title={confirmationTitle ?? `Delete ${itemName}?`}
        description={description ?? `This ${itemName} will be permanently deleted. This action cannot be undone.`}
      >
        {table === 'clients' && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            This permanently removes the client and portal login, including company/onboarding details, all client tickets and tasks (including company-side history), comments, attachments, activity, and uploaded files. This cannot be undone.
          </div>
        )}
        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" disabled={loading} onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="danger" size="sm" loading={loading} onClick={remove}>{confirmLabel ?? `Delete ${itemName}`}</Button>
        </div>
      </Modal>
    </>
  )
}
