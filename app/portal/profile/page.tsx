import { createClient } from '@/lib/supabase/server'
import { requireClient } from '@/lib/auth'
import { PageHeader } from '@/components/ui/primitives'
import { PortalProfileForm } from '@/components/portal/PortalProfileForm'
import type { Client } from '@/types/database'

export const metadata = { title: 'Company profile' }

export default async function PortalProfilePage() {
  const me = await requireClient()
  const supabase = createClient()
  const { data: client } = await supabase.from('clients').select('*').eq('owner_id', me.id).single()
  const { data: image } = client?.company_profile_image_path
    ? await supabase.storage.from('client-profile-images').createSignedUrl(client.company_profile_image_path, 3600)
    : { data: null }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Company profile" description="Keep your basic details and address up to date." />
      <PortalProfileForm client={client as Client} imageUrl={image?.signedUrl} />
    </div>
  )
}
