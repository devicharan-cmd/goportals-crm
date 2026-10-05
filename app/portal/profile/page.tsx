import { createClient } from '@/lib/supabase/server'
import { requireClient } from '@/lib/auth'
import { PageHeader } from '@/components/ui/primitives'
import { PortalProfileForm } from '@/components/portal/PortalProfileForm'
import type { Client } from '@/types/database'

export const metadata = { title: 'Company profile' }

export default async function PortalProfilePage() {
  const me = await requireClient()
  const { data: client } = await createClient().from('clients').select('*').eq('owner_id', me.id).single()

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Company profile" description="Keep your basic details and address up to date." />
      <PortalProfileForm client={client as Client} />
    </div>
  )
}
