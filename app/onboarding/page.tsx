import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth'
import { OnboardingWizard } from '@/components/onboarding/OnboardingWizard'
import type { Agreement, Client, Platform, Service } from '@/types/database'

export const metadata = { title: 'Set up your account' }

export default async function OnboardingPage() {
  const profile = await getProfile()
  if (!profile) redirect('/login')
  if (profile.role !== 'client') redirect('/dashboard')

  const supabase = createClient()
  const [{ data: client }, { data: platforms }, { data: services }, { data: agreement }, { data: needsAgreement }] =
    await Promise.all([
      supabase.from('clients').select('*').eq('owner_id', profile.id).maybeSingle(),
      supabase.from('platforms').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('services').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('agreements').select('*').eq('is_current', true).maybeSingle(),
      supabase.rpc('needs_agreement'),
    ])

  const [{ data: myPlatforms }, { data: myServices }, { data: myAccounts }, { data: myClientServices }] = client
    ? await Promise.all([
        supabase.from('ecommerce_accounts').select('platform_id').eq('client_id', client.id),
        supabase.from('client_services').select('service_id, custom_name').eq('client_id', client.id),
        supabase.from('ecommerce_accounts').select('account_name, platform:platforms(name), status').eq('client_id', client.id),
        supabase.from('client_services').select('agreed_price, currency, billing_type, custom_name, service:services(name), ecommerce_account:ecommerce_accounts(account_name)').eq('client_id', client.id).neq('status', 'stopped'),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }]

  return (
    <OnboardingWizard
      profile={{ full_name: profile.full_name, email: profile.email }}
      client={client as Client | null}
      platforms={(platforms ?? []) as Platform[]}
      services={(services ?? []) as Service[]}
      agreement={agreement as Agreement | null}
      agreementOnly={client?.status === 'active' && !!needsAgreement}
      initialPlatformIds={(myPlatforms ?? []).map((p: { platform_id: string }) => p.platform_id)}
      initialServiceIds={(myServices ?? []).filter((s: { service_id: string | null }) => s.service_id).map((s: { service_id: string | null }) => s.service_id!)}
      initialCustomServices={(myServices ?? []).filter((s: { custom_name: string | null }) => s.custom_name).map((s: { custom_name: string | null }) => s.custom_name!)}
      myAccounts={(myAccounts ?? []) as unknown as { account_name: string; platform: { name: string } | null; status: string }[]}
      myClientServices={(myClientServices ?? []) as unknown as {
        agreed_price: number | null; currency: string; billing_type: string; custom_name: string | null
        service: { name: string } | null; ecommerce_account: { account_name: string } | null
      }[]}
    />
  )
}
