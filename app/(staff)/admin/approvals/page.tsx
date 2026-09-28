import Link from 'next/link'
import { CheckCircle2, FileSignature, ShieldCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireSuperAdmin } from '@/lib/auth'
import { Card, EmptyState, PageHeader } from '@/components/ui/primitives'
import { Badge } from '@/components/ui/badges'
import { ApprovalActions } from '@/components/clients/ClientEditors'
import { formatRelative } from '@/lib/utils'
import type { Client } from '@/types/database'

export const metadata = { title: 'Approvals' }

type Row = Client & {
  client_platforms: { platform: { name: string } | null }[]
  client_services: { custom_name: string | null; service: { name: string } | null }[]
  agreement_acceptances: { accepted_at: string }[]
}

export default async function ApprovalsPage() {
  await requireSuperAdmin()
  const { data } = await createClient().from('clients')
    .select('*, client_platforms(platform:platforms(name)), client_services(custom_name, service:services(name)), agreement_acceptances(accepted_at)')
    .eq('status', 'pending').eq('signup_source', 'self_signup')
    .order('created_at')
  const rows = (data ?? []) as unknown as Row[]

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Client approvals" description="Brands that signed up themselves. Approve to give them portal access." />
      {rows.length === 0 ? (
        <Card><EmptyState icon={ShieldCheck} title="No pending sign-ups" description="New self-registered clients will appear here." /></Card>
      ) : (
        <div className="space-y-4">
          {rows.map(c => {
            const accepted = c.agreement_acceptances.length > 0
            return (
              <Card key={c.id} className="p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <Link href={`/clients/${c.id}`} className="text-lg font-semibold text-slate-900 hover:text-brand-700">{c.company_name}</Link>
                    <p className="text-sm text-slate-500">
                      {[c.contact_name, c.contact_email, c.contact_phone].filter(Boolean).join(' · ')}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">Signed up {formatRelative(c.created_at)}{c.gstin ? ` · GSTIN ${c.gstin}` : ''}</p>
                  </div>
                  <ApprovalActions clientId={c.id} hasAgreement={accepted} />
                </div>
                <div className="mt-4 grid gap-4 border-t border-slate-100 pt-4 sm:grid-cols-3">
                  <div>
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Platforms</p>
                    <div className="flex flex-wrap gap-1">
                      {c.client_platforms.map((p, i) => p.platform && <Badge key={i}>{p.platform.name}</Badge>)}
                      {c.client_platforms.length === 0 && <span className="text-sm text-slate-400">—</span>}
                    </div>
                  </div>
                  <div>
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Services</p>
                    <div className="flex flex-wrap gap-1">
                      {c.client_services.map((s, i) => (
                        <Badge key={i} className={s.service ? undefined : 'bg-lime-50 text-lime-800 ring-lime-200'}>{s.service?.name ?? s.custom_name}</Badge>
                      ))}
                      {c.client_services.length === 0 && <span className="text-sm text-slate-400">—</span>}
                    </div>
                  </div>
                  <div>
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Agreement</p>
                    {accepted
                      ? <span className="inline-flex items-center gap-1 text-sm font-medium text-lime-700"><CheckCircle2 className="h-4 w-4" /> Accepted {formatRelative(c.agreement_acceptances[0].accepted_at)}</span>
                      : <span className="inline-flex items-center gap-1 text-sm text-amber-700"><FileSignature className="h-4 w-4" /> Not yet accepted</span>}
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
