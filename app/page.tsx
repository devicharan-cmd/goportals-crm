import { redirect } from 'next/navigation'
import { getProfile, homePathFor } from '@/lib/auth'

// Middleware normally routes '/' already; this is the fallback.
export default async function Home() {
  const profile = await getProfile()
  redirect(profile ? homePathFor(profile) : '/login')
}
