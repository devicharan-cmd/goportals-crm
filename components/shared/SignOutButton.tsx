'use client'

import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'

export function SignOutButton({ className }: { className?: string }) {
  const router = useRouter()
  async function signOut() {
    await createClient().auth.signOut()
    router.push('/login')
    router.refresh()
  }
  return <Button variant="secondary" className={className} onClick={signOut}><LogOut className="h-4 w-4" /> Sign out</Button>
}
