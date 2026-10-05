import { createClient } from '@/lib/supabase/server'
import { requireSuperAdmin } from '@/lib/auth'
import { Card, CardHeader, PageHeader } from '@/components/ui/primitives'
import { Badge } from '@/components/ui/badges'
import { AgreementEditor } from '@/components/admin/AgreementEditor'
import { formatDate } from '@/lib/utils'
import type { Agreement } from '@/types/database'

export const metadata = { title: 'Agreement' }

export default async function AgreementPage() {
  await requireSuperAdmin()
  const supabase = createClient()
  const [{ data }, { count }] = await Promise.all([
    supabase.from('agreements').select('*').order('created_at', { ascending: false }),
    supabase.from('agreement_acceptances').select('id', { count: 'exact', head: true }),
  ])
  const versions = (data ?? []) as Agreement[]
  const current = versions.find(v => v.is_current) ?? null
  const n = versions.length + 1
  const nextVersion = `v${n}`

  return (
    <>
      <PageHeader title="Client agreement" description="Clients must accept the current version before they can use the portal." />
      <div className="grid gap-6 xl:grid-cols-[1fr_300px]">
        <Card>
          <CardHeader title="Publish a new version" description={current ? `Currently live: ${current.version}` : 'No agreement is live yet'} />
          <div className="p-5"><AgreementEditor current={current} nextVersion={nextVersion} /></div>
        </Card>
        <Card className="h-fit">
          <CardHeader title="History" description={`${count ?? 0} acceptances recorded`} />
          <ul className="divide-y divide-slate-100">
            {versions.map(v => (
              <li key={v.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <span><span className="font-semibold">{v.version}</span> <span className="text-slate-500">· {formatDate(v.published_at ?? v.created_at)}</span></span>
                {v.is_current && <Badge className="bg-lime-50 text-lime-700 ring-lime-200">Live</Badge>}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  )
}
