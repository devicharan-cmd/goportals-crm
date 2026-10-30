// Server helpers for the client portal.
import { createClient } from '@/lib/supabase/server'
import { ROLE_LABELS } from '@/lib/constants'
import type { AppRole, Profile } from '@/types/database'

/** Resolves the client row owned by the logged-in client profile. */
export async function getMyClientId(meId: string): Promise<string> {
  const { data } = await createClient().from('clients').select('id').eq('owner_id', meId).single()
  return data!.id
}

/**
 * Names a client may see in the portal. Shows the staff member's name and role
 * (e.g. "Sahil Gupta (Manager)").
 */
export async function getPortalNames(me: Pick<Profile, 'id' | 'full_name' | 'email'>): Promise<Record<string, string>> {
  const { data } = await createClient().rpc('staff_directory')
  const names = Object.fromEntries((data ?? []).map((p: { id: string, full_name: string | null, role: AppRole }) => {
    const roleLabel = ROLE_LABELS[p.role] || 'Staff'
    const name = p.full_name?.trim()
    return [p.id, name ? `${name} (${roleLabel})` : `GoPortals team (${roleLabel})`]
  }))
  names[me.id] = me.full_name || me.email
  return names
}
