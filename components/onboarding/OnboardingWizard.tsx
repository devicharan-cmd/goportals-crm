'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, Building2, Check, FileSignature, LogOut, Plus, Store, Wrench, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Logo } from '@/components/layout/Logo'
import { Button } from '@/components/ui/button'
import { Alert, Field } from '@/components/ui/primitives'
import { Markdown } from '@/components/shared/Markdown'
import { AddressPicker, EMPTY_ADDRESS, type AddressValue } from '@/components/shared/AddressPicker'
import { PLATFORM_CATEGORY_LABELS } from '@/lib/constants'
import { cn, errorMessage, formatINR } from '@/lib/utils'
import type { Agreement, Client, Platform, PlatformCategory, Service } from '@/types/database'

const STEPS = [
  { key: 'company',   label: 'Company',   icon: Building2 },
  { key: 'platforms', label: 'Platforms', icon: Store },
  { key: 'services',  label: 'Services',  icon: Wrench },
  { key: 'agreement', label: 'Agreement', icon: FileSignature },
] as const

type AccountSummary = { account_name: string; platform: { name: string } | null; status: string }
type ServiceSummary = {
  agreed_price: number | null; currency: string; billing_type: string; custom_name: string | null
  service: { name: string } | null; ecommerce_account: { account_name: string } | null
}

type Props = {
  profile: { full_name: string; email: string }
  client: Client | null
  platforms: Platform[]
  services: Service[]
  agreement: Agreement | null
  agreementOnly: boolean
  initialPlatformIds: string[]
  initialServiceIds: string[]
  initialCustomServices: string[]
  myAccounts: AccountSummary[]
  myClientServices: ServiceSummary[]
}

export function OnboardingWizard(props: Props) {
  const { profile, client, platforms, services, agreement, agreementOnly, myAccounts, myClientServices } = props
  const router = useRouter()
  // Admin already picked accounts/services/prices at creation time — skip straight to
  // the client's own details + address, then the agreement.
  const isAdminProvisioned = client?.signup_source === 'admin_created' || client?.signup_source === 'invite'
  const steps = agreementOnly
    ? STEPS.filter(s => s.key === 'agreement')
    : isAdminProvisioned
      ? STEPS.filter(s => s.key === 'company' || s.key === 'agreement')
      : STEPS
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [company, setCompany] = useState({
    company_name:  client?.company_name ?? '',
    gstin:         client?.gstin ?? '',
    contact_name:  client?.contact_name ?? profile.full_name,
    contact_email: client?.contact_email ?? profile.email,
    contact_phone: client?.contact_phone ?? '',
  })
  const [address, setAddress] = useState<AddressValue>(client ? {
    address_line: client.address_line ?? '', city: client.city ?? '', state: client.state ?? '',
    postal_code: client.postal_code ?? '', country: client.country ?? 'India',
    latitude: client.latitude, longitude: client.longitude, place_id: client.place_id, address_source: client.address_source,
  } : EMPTY_ADDRESS)
  const [platformIds, setPlatformIds] = useState<string[]>(props.initialPlatformIds)
  const [serviceIds, setServiceIds] = useState<string[]>(props.initialServiceIds)
  const [custom, setCustom] = useState<string[]>(props.initialCustomServices)
  const [customInput, setCustomInput] = useState('')
  const [agreed, setAgreed] = useState(false)

  const byCategory = useMemo(() => {
    const groups = new Map<PlatformCategory, Platform[]>()
    platforms.forEach(p => groups.set(p.category, [...(groups.get(p.category) ?? []), p]))
    return Array.from(groups.entries())
  }, [platforms])

  const toggle = (list: string[], set: (v: string[]) => void, id: string) =>
    set(list.includes(id) ? list.filter(x => x !== id) : [...list, id])

  function addCustom() {
    const v = customInput.trim()
    if (v && !custom.includes(v)) setCustom([...custom, v])
    setCustomInput('')
  }

  function validate(): string {
    const key = steps[step].key
    if (key === 'company') {
      if (!company.company_name.trim()) return 'Please enter your company or brand name.'
      if (!address.address_line.trim()) return 'Please add your business address.'
    }
    if (key === 'platforms' && platformIds.length === 0) return 'Select at least one platform.'
    if (key === 'services' && serviceIds.length + custom.length === 0) return 'Select at least one service, or type one.'
    if (key === 'agreement' && !agreed) return 'Please read and accept the agreement to continue.'
    return ''
  }

  async function next() {
    const v = validate()
    if (v) return setError(v)
    setError('')

    // Save company/address/platforms/services on the last step before the agreement.
    const isLastBeforeAgreement = steps[step + 1]?.key === 'agreement'
    if (isLastBeforeAgreement) {
      setSaving(true)
      const { error } = await createClient().rpc('save_client_onboarding', {
        p_company: { ...company, ...address },
        p_platform_ids: platformIds,
        p_service_ids: serviceIds,
        p_custom_services: custom,
      })
      setSaving(false)
      if (error) return setError(errorMessage(error))
    }

    if (steps[step].key === 'agreement') {
      if (!agreement) return setError('No agreement is published yet. Please contact GoPortals.')
      setSaving(true)
      const res = await fetch('/api/agreement/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agreement_id: agreement.id }),
      })
      const data = await res.json()
      setSaving(false)
      if (!res.ok) return setError(data.error ?? 'Could not save your acceptance.')
      router.replace(data.status === 'active' ? '/portal' : '/pending')
      router.refresh()
      return
    }

    setStep(s => s + 1)
  }

  async function signOut() {
    await createClient().auth.signOut()
    router.push('/login')
  }

  const current = steps[step].key

  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-50 to-slate-50">
      <header className="flex h-16 items-center justify-between px-6">
        <Logo className="h-8" priority />
        <button onClick={signOut} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </header>

      <div className="mx-auto max-w-3xl px-4 pb-16 pt-6">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold">
            {agreementOnly ? 'Updated agreement' : `Welcome${profile.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}!`}
          </h1>
          <p className="mt-2 text-slate-500">
            {agreementOnly
              ? 'Our service agreement has been updated. Please review and accept it to continue.'
              : "Let's set up your brand. It only takes a couple of minutes."}
          </p>
        </div>

        {/* Stepper */}
        {steps.length > 1 && (
          <ol className="mb-8 flex items-center justify-center gap-2 sm:gap-4">
            {steps.map((s, i) => (
              <li key={s.key} className="flex items-center gap-2 sm:gap-4">
                <div className="flex items-center gap-2">
                  <span className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold transition',
                    i < step ? 'bg-lime-500 text-brand-950' : i === step ? 'bg-brand-600 text-white ring-4 ring-brand-100' : 'bg-white text-slate-400 ring-1 ring-slate-200',
                  )}>
                    {i < step ? <Check className="h-4 w-4" /> : i + 1}
                  </span>
                  <span className={cn('hidden text-sm font-medium sm:inline', i === step ? 'text-slate-900' : 'text-slate-500')}>{s.label}</span>
                </div>
                {i < steps.length - 1 && <span className="h-px w-6 bg-slate-300 sm:w-10" />}
              </li>
            ))}
          </ol>
        )}

        <div className="card p-6 sm:p-8">
          {error && <div className="mb-5"><Alert>{error}</Alert></div>}

          {current === 'company' && (
            <div className="space-y-5">
              <StepTitle title="About your company" subtitle="This is how our team will know your brand." />
              <Field label="Company / brand name" required>
                <input className="input" value={company.company_name} autoFocus
                       onChange={e => setCompany({ ...company, company_name: e.target.value })} placeholder="e.g. Himalaya Naturals Pvt Ltd" />
              </Field>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="GSTIN" hint="Optional">
                  <input className="input uppercase" value={company.gstin} maxLength={15}
                         onChange={e => setCompany({ ...company, gstin: e.target.value })} />
                </Field>
                <Field label="Phone / WhatsApp">
                  <input className="input" value={company.contact_phone} type="tel"
                         onChange={e => setCompany({ ...company, contact_phone: e.target.value })} placeholder="+91 98xxxxxxx" />
                </Field>
                <Field label="Contact person">
                  <input className="input" value={company.contact_name}
                         onChange={e => setCompany({ ...company, contact_name: e.target.value })} />
                </Field>
                <Field label="Contact email">
                  <input className="input" value={company.contact_email} type="email"
                         onChange={e => setCompany({ ...company, contact_email: e.target.value })} />
                </Field>
              </div>
              <div className="border-t border-slate-100 pt-5">
                <p className="mb-3 text-sm font-semibold text-slate-800">Business address</p>
                <AddressPicker value={address} onChange={setAddress} />
              </div>
            </div>
          )}

          {current === 'platforms' && (
            <div className="space-y-6">
              <StepTitle title="Where do you sell (or want to)?" subtitle="Select all platforms that apply." />
              {byCategory.map(([cat, list]) => (
                <div key={cat}>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">{PLATFORM_CATEGORY_LABELS[cat]}</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {list.map(p => (
                      <ChoiceTile key={p.id} selected={platformIds.includes(p.id)} onClick={() => toggle(platformIds, setPlatformIds, p.id)}>
                        {p.name}
                      </ChoiceTile>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {current === 'services' && (
            <div className="space-y-6">
              <StepTitle title="What do you need help with?" subtitle="Pick our services — or type anything that isn't listed." />
              <div className="grid gap-2 sm:grid-cols-2">
                {services.map(s => (
                  <ChoiceTile key={s.id} selected={serviceIds.includes(s.id)} onClick={() => toggle(serviceIds, setServiceIds, s.id)}>
                    <span className="block">{s.name}</span>
                    {s.description && <span className="mt-0.5 block text-xs font-normal text-slate-500">{s.description}</span>}
                  </ChoiceTile>
                ))}
              </div>
              <div>
                <label className="label">Something else?</label>
                <div className="flex gap-2">
                  <input className="input" value={customInput} placeholder="e.g. Influencer marketing"
                         onChange={e => setCustomInput(e.target.value)}
                         onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustom() } }} />
                  <Button type="button" variant="secondary" onClick={addCustom}><Plus className="h-4 w-4" /> Add</Button>
                </div>
                {custom.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {custom.map(c => (
                      <span key={c} className="inline-flex items-center gap-1 rounded-full bg-lime-100 px-3 py-1 text-sm font-medium text-lime-800">
                        {c}
                        <button onClick={() => setCustom(custom.filter(x => x !== c))} aria-label={`Remove ${c}`}><X className="h-3.5 w-3.5" /></button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {current === 'agreement' && (
            <div className="space-y-5">
              <StepTitle title={agreement?.title ?? 'Service agreement'} subtitle={agreement ? `Version ${agreement.version}` : undefined} />

              {(myAccounts.length > 0 || myClientServices.length > 0) && (
                <div className="rounded-lg border border-slate-200 p-4">
                  <p className="mb-3 text-sm font-semibold text-slate-800">What you're agreeing to</p>
                  {myAccounts.length > 0 && (
                    <div className="mb-3 flex flex-wrap gap-1.5">
                      {myAccounts.map((a, i) => (
                        <span key={i} className="inline-flex items-center rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700">
                          {a.platform?.name ? `${a.platform.name} · ${a.account_name}` : a.account_name}
                        </span>
                      ))}
                    </div>
                  )}
                  {myClientServices.length > 0 && (
                    <ul className="divide-y divide-slate-100 text-sm">
                      {myClientServices.map((s, i) => (
                        <li key={i} className="flex items-center justify-between gap-3 py-1.5">
                          <span className="text-slate-700">
                            {s.service?.name ?? s.custom_name}
                            {s.ecommerce_account && <span className="text-slate-400"> · {s.ecommerce_account.account_name}</span>}
                          </span>
                          {s.agreed_price != null && (
                            <span className="flex-shrink-0 font-semibold text-slate-900">
                              {formatINR(s.agreed_price)}{s.billing_type === 'monthly' ? '/mo' : s.billing_type === 'per_task' ? '/task' : ''}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {agreement ? (
                <div className="max-h-80 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-5">
                  <Markdown text={agreement.body} />
                </div>
              ) : (
                <Alert tone="info">No agreement has been published yet. Please contact GoPortals.</Alert>
              )}
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-4 hover:bg-slate-50">
                <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)}
                       className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
                <span className="text-sm text-slate-700">
                  I have read and agree to the {agreement?.title ?? 'service agreement'} on behalf of{' '}
                  <strong>{company.company_name || client?.company_name || 'my company'}</strong>.
                </span>
              </label>
              {!agreementOnly && client?.signup_source !== 'admin_created' && client?.signup_source !== 'invite' && (
                <p className="text-xs text-slate-500">After you accept, our team will review your details and activate your account.</p>
              )}
            </div>
          )}

          <div className="mt-8 flex items-center justify-between border-t border-slate-100 pt-6">
            {step > 0 ? (
              <Button variant="ghost" onClick={() => { setError(''); setStep(s => s - 1) }}><ArrowLeft className="h-4 w-4" /> Back</Button>
            ) : <span />}
            <Button onClick={next} loading={saving} size="lg">
              {current === 'agreement' ? 'Accept & finish' : 'Continue'} {current !== 'agreement' && <ArrowRight className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function StepTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <h2 className="text-lg font-bold">{title}</h2>
      {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
    </div>
  )
}

function ChoiceTile({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative rounded-lg border px-4 py-3 text-left text-sm font-medium transition',
        selected ? 'border-brand-500 bg-brand-50 text-brand-800 ring-1 ring-brand-500' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50',
      )}
    >
      {selected && (
        <span className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-brand-600 text-white">
          <Check className="h-3 w-3" />
        </span>
      )}
      {children}
    </button>
  )
}
