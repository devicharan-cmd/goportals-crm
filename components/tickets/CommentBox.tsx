'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function CommentBox({ ticketId }: { ticketId: string }) {
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!content.trim()) return
    setSaving(true)

    // Get current member
    const { data: { user } } = await supabase.auth.getUser()
    const { data: member } = await supabase
      .from('team_members')
      .select('id')
      .eq('user_id', user?.id)
      .single()

    await supabase.from('comments').insert({
      ticket_id: ticketId,
      author_id: member?.id ?? null,
      content: content.trim(),
    })

    setContent('')
    setSaving(false)
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-3">
      <input
        type="text"
        value={content}
        onChange={e => setContent(e.target.value)}
        placeholder="Add a comment…"
        className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <button
        type="submit"
        disabled={saving || !content.trim()}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-medium rounded-lg"
      >
        {saving ? '…' : 'Post'}
      </button>
    </form>
  )
}
