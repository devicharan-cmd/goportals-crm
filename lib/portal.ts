// Server helpers for the client portal.
import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/types/database'

/** Names a client may see: GoPortals staff (via the staff_directory() function) + themselves. */
export async function getPortalNames(me: Pick<Profile, 'id' | 'full_name' | 'email'>): Promise<Record<string, string>> {
  const { data } = await createClient().rpc('staff_directory')
  const names = Object.fromEntries((data ?? []).map((p: { id: string; full_name: string }) => [p.id, p.full_name || 'GoPortals team']))
  names[me.id] = me.full_name || me.email
  return names
}
