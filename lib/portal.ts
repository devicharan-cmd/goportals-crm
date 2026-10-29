// Server helpers for the client portal.
import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/types/database'

/** Resolves the client row owned by the logged-in client profile. */
export async function getMyClientId(meId: string): Promise<string> {
  const { data } = await createClient().from('clients').select('id').eq('owner_id', meId).single()
  return data!.id
}

/**
 * Names a client may see. Staff appear as one team, never as individuals:
 * the portal, the comment box and the notifications all say "GoPortals team",
 * so naming a person here only made the same event read two different ways.
 */
export async function getPortalNames(me: Pick<Profile, 'id' | 'full_name' | 'email'>): Promise<Record<string, string>> {
  const { data } = await createClient().rpc('staff_directory')
  const names = Object.fromEntries((data ?? []).map((p: { id: string }) => [p.id, 'GoPortals team']))
  names[me.id] = me.full_name || me.email
  return names
}
