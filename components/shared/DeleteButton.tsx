'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { errorMessage } from '@/lib/utils'

export function DeleteButton({
  table, id, redirectTo, label = 'Delete', variant = 'ghost',
}: { table: 'tasks' | 'tickets' | 'clients'; id: string; redirectTo: string; label?: string; variant?: 'ghost' | 'danger' }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const itemName = table === 'tasks' ? 'task' : table === 'tickets' ? 'ticket' : 'client'

  async function remove() {
    setError('')
    setLoading(true)
    const { error } = await createClient().from(table).delete().eq('id', id)
    setLoading(false)
    if (error) {
      const message = errorMessage(error)
      setError(message)
      toast.error(message)
      return
    }
    toast(`${itemName[0].toUpperCase()}${itemName.slice(1)} deleted`, {
      icon: <Trash2 className="h-4 w-4 text-red-600" />,
      style: { background: '#fef2f2', borderColor: '#fecaca', color: '#b91c1c' },
    })
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
        title={`Delete ${itemName}?`}
        description={`This ${itemName} will be permanently deleted. This action cannot be undone.`}
      >
        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" disabled={loading} onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="danger" size="sm" loading={loading} onClick={remove}>Delete {itemName}</Button>
        </div>
      </Modal>
    </>
  )
}
