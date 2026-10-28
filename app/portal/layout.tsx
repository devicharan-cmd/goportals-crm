import { AppShell } from '@/components/layout/AppShell'
import { createClient } from '@/lib/supabase/server'
import { requireClient } from '@/lib/auth'

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const me = await requireClient()
  const supabase = createClient()
  const [{ data: client, error: clientError }, { count }] = await Promise.all([
    supabase.from('clients').select('company_name, company_profile_image_path').eq('owner_id', me.id).maybeSingle(),
    supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('recipient_id', me.id).eq('is_read', false),
  ])
  // Keep the company name available if the image migration hasn't been run yet:
  // PostgREST rejects the whole select when the new path column is missing.
  const { data: legacyClient } = clientError
    ? await supabase.from('clients').select('company_name').eq('owner_id', me.id).maybeSingle()
    : { data: null }
  const companyName = client?.company_name ?? legacyClient?.company_name
  const imagePath = client?.company_profile_image_path ?? null
  const { data: profileImage } = imagePath
    ? await supabase.storage.from('client-profile-images').createSignedUrl(imagePath, 3600)
    : { data: null }

  return (
    <AppShell
      user={{ name: companyName || me.full_name || me.email, email: me.email, role: me.role, jobTitle: null }}
      counts={{ notifications: count ?? 0 }}
      companyName={companyName}
      companyProfileImageUrl={profileImage?.signedUrl}
    >
      {children}
    </AppShell>
  )
}
