import Link from 'next/link'
import { CheckCircle2, FileSignature, ShieldCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import { Card, EmptyState } from '@/components/ui/primitives'
import { Badge } from '@/components/ui/badges'
import { ApprovalActions } from '@/components/clients/ClientEditors'
import { formatRelative } from '@/lib/utils'
import type { Client } from '@/types/database'

export const metadata = { title: 'Approvals' }

type Row = Client & {
  ecommerce_accounts: { account_name: string; platform: { name: string } | null }[]
  client_services: { custom_name: string | null; service: { name: string } | null }[]
  agreement_acceptances: { accepted_at: string }[]
}

export default async function ApprovalsPage() {
  await requireAdmin()
  const { data } = await createClient().from('clients')
    .select('*, ecommerce_accounts(account_name, platform:platforms(name)), client_services(custom_name, service:services(name)), agreement_acceptances(accepted_at)')
    .eq('status', 'pending')
    .order('created_at')
  const rows = (data ?? []) as unknown as Row[]

  return (
    <div className="mx-auto max-w-4xl">
      {rows.length === 0 ? (
        <Card><EmptyState icon={ShieldCheck} title="No clients waiting" description="Clients appear here once they finish onboarding, until you approve them." /></Card>
      ) : (
        <div className="space-y-5">
          {rows.map(c => {
            const accepted = c.agreement_acceptances.length > 0
            const contact = [c.contact_name, c.contact_email, c.contact_phone].filter(Boolean)
            return (
              <Card key={c.id} className="overflow-hidden p-6 sm:p-7">
                {/* Header: who is waiting, and the decision — never crowded together */}
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between lg:gap-8">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <Link href={`/clients/${c.id}`} className="text-xl font-semibold tracking-tight text-slate-900 hover:text-brand-700">
                        {c.company_name}
                      </Link>
                      <Badge className="bg-amber-50 text-amber-800 ring-amber-200">Awaiting approval</Badge>
                    </div>
                    {contact.length > 0 && (
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-600">
                        {contact.map((item, i) => (
                          <span key={i} className="inline-flex items-center gap-2">
                            {i > 0 && <span aria-hidden className="text-slate-300">·</span>}
                            {item}
                          </span>
                        ))}
                      </p>
                    )}
                    <p className="text-xs text-slate-400">
                      Added {formatRelative(c.created_at)}{c.gstin ? ` · GSTIN ${c.gstin}` : ''}
                    </p>
                  </div>
                  <div className="lg:shrink-0">
                    <ApprovalActions clientId={c.id} hasAgreement={accepted} size="md" />
                  </div>
                </div>

                {/* What they signed up for */}
                <div className="mt-6 grid gap-6 border-t border-slate-100 pt-6 sm:grid-cols-2 lg:grid-cols-3">
                  <section>
                    <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">E-commerce accounts</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {c.ecommerce_accounts.map((a, i) => <Badge key={i}>{a.platform?.name ? `${a.platform.name} · ${a.account_name}` : a.account_name}</Badge>)}
                      {c.ecommerce_accounts.length === 0 && <span className="text-sm text-slate-400">—</span>}
                    </div>
                  </section>
                  <section>
                    <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Services</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {c.client_services.map((s, i) => (
                        <Badge key={i} className={s.service ? undefined : 'bg-lime-50 text-lime-800 ring-lime-200'}>{s.service?.name ?? s.custom_name}</Badge>
                      ))}
                      {c.client_services.length === 0 && <span className="text-sm text-slate-400">—</span>}
                    </div>
                  </section>
                  <section>
                    <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Agreement</h3>
                    {accepted
                      ? <span className="inline-flex items-center gap-1.5 rounded-lg bg-lime-50 px-2.5 py-1.5 text-sm font-medium text-lime-800 ring-1 ring-inset ring-lime-200"><CheckCircle2 className="h-4 w-4 flex-shrink-0" /> Accepted {formatRelative(c.agreement_acceptances[0].accepted_at)}</span>
                      : <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-sm font-medium text-amber-800 ring-1 ring-inset ring-amber-200"><FileSignature className="h-4 w-4 flex-shrink-0" /> Not yet accepted</span>}
                  </section>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
