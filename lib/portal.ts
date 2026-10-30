// Server helpers for the client portal.
import { createClient } from '@/lib/supabase/server'
import type { AppRole, Profile } from '@/types/database'

/** Resolves the client row owned by the logged-in client profile. */
export async function getMyClientId(meId: string): Promise<string> {
  const { data } = await createClient().from('clients').select('id').eq('owner_id', meId).single()
  return data!.id
}

/**
 * Names a client may see. Staff appear as one team, never as individuals:
 * the portal, the comment box and the notifications all say "GoPortals team",
 * so naming a person here only made the same event read two different ways.
 *
 * A Manager is marked as one, so the client can tell a reply from the manager
 * handling their account from one from the Super Admin. Only those two roles
 * ever reach a client conversation — send_ticket_comment() refuses anyone
 * else a client-visible message, and the select policy hides public messages
 * from team leads and employees — so no other role needs a name here.
 */
export async function getPortalNames(me: Pick<Profile, 'id' | 'full_name' | 'email'>): Promise<Record<string, string>> {
  const { data } = await createClient().rpc('staff_directory')
  const names = Object.fromEntries((data ?? []).map((p: { id: string, role: AppRole }) =>
    [p.id, p.role === 'admin' ? 'GoPortals team (Manager)' : 'GoPortals team']))
  names[me.id] = me.full_name || me.email
  return names
}
