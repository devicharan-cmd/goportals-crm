import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireClient } from '@/lib/auth'
import { getPortalTaskOptions } from '@/lib/portal-options'
import { PageHeader } from '@/components/ui/primitives'
import { PortalTaskForm } from '@/components/portal/PortalTaskForm'

export const metadata = { title: 'New request' }

export default async function NewPortalTaskPage() {
  const me = await requireClient()
  const { data: client } = await createClient().from('clients').select('id').eq('owner_id', me.id).single()
  const options = await getPortalTaskOptions(client!.id)
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="New request"
        description="Tell us what you need. Our team is notified straight away."
        back={<Link href="/portal/tasks" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" /> My tasks</Link>}
      />
      <PortalTaskForm platforms={options.platforms} services={options.services} />
    </div>
  )
}
