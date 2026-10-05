'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { errorMessage } from '@/lib/utils'

/** Two-step delete (no browser confirm dialog). RLS decides who may actually delete. */
export function DeleteButton({
  table, id, redirectTo, label = 'Delete',
}: { table: 'tasks' | 'clients'; id: string; redirectTo: string; label?: string }) {
  const router = useRouter()
  const [armed, setArmed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function remove() {
    setLoading(true)
    const { error } = await createClient().from(table).delete().eq('id', id)
    setLoading(false)
    if (error) return setError(errorMessage(error))
    router.push(redirectTo)
    router.refresh()
  }

  if (!armed) {
    return (
      <Button variant="ghost" size="sm" className="text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => setArmed(true)}>
        <Trash2 className="h-3.5 w-3.5" /> {label}
      </Button>
    )
  }
  return (
    <span className="inline-flex items-center gap-2">
      {error && <span className="text-xs text-red-600">{error}</span>}
      <span className="text-xs text-slate-500">This can&apos;t be undone.</span>
      <Button variant="ghost" size="sm" onClick={() => setArmed(false)}>Cancel</Button>
      <Button variant="danger" size="sm" loading={loading} onClick={remove}>Yes, delete</Button>
    </span>
  )
}
