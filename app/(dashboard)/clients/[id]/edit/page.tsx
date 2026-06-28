import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import EditClientForm from '@/components/clients/EditClientForm'

export default async function EditClientPage({ params }: { params: { id: string } }) {
  const supabase = createClient()

  const [{ data: client }, { data: members }] = await Promise.all([
    supabase.from('clients').select('*').eq('id', params.id).single(),
    supabase.from('team_members').select('id, name, role').order('name'),
  ])

  if (!client) notFound()

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href={`/clients/${params.id}`} className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Edit Brand</h1>
          <p className="text-sm text-gray-500 mt-0.5">{client.name}</p>
        </div>
      </div>

      <EditClientForm client={client} members={members ?? []} />
    </div>
  )
}
