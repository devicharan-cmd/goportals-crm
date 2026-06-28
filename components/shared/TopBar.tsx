'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import type { User } from '@supabase/supabase-js'

export default function TopBar({ user }: { user: User }) {
  const router = useRouter()
  const supabase = createClient()

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-end gap-4">
      <span className="text-sm text-gray-500">{user.email}</span>
      <button
        onClick={handleSignOut}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
      >
        <LogOut className="w-4 h-4" />
        Sign out
      </button>
    </header>
  )
}
