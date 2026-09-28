// Platform + service choices for the portal task form: the client's own first, then the rest.
import { createClient } from '@/lib/supabase/server'

type Option = { id: string; name: string }

export async function getPortalTaskOptions(clientId: string): Promise<{ platforms: Option[]; services: Option[] }> {
  const supabase = createClient()
  const [{ data: allPlatforms }, { data: allServices }, { data: mine }, { data: myServices }] = await Promise.all([
    supabase.from('platforms').select('id, name').eq('is_active', true).order('sort_order'),
    supabase.from('services').select('id, name').eq('is_active', true).order('sort_order'),
    supabase.from('client_platforms').select('platform_id').eq('client_id', clientId),
    supabase.from('client_services').select('service_id').eq('client_id', clientId),
  ])
  const minePlatforms = new Set((mine ?? []).map((m: { platform_id: string }) => m.platform_id))
  const mineServices = new Set((myServices ?? []).map((m: { service_id: string | null }) => m.service_id))
  const sortMineFirst = (list: Option[], mineSet: Set<string | null>) =>
    [...list.filter(x => mineSet.has(x.id)), ...list.filter(x => !mineSet.has(x.id))]
  return {
    platforms: sortMineFirst((allPlatforms ?? []) as Option[], minePlatforms),
    services: sortMineFirst((allServices ?? []) as Option[], mineServices),
  }
}
