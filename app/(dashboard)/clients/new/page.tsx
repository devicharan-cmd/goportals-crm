import ClientForm from '@/components/clients/ClientForm'
import { createClient } from '@/lib/supabase/server'

export default async function NewClientPage() {
  const supabase = createClient()
  const { data: members } = await supabase
    .from('team_members')
    .select('id, name, role')
    .eq('is_active', true)
    .order('name')

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Add New Brand</h1>
        <p className="text-sm text-gray-500 mt-1">Fill in the brand details and assign team members</p>
      </div>
      <ClientForm members={members ?? []} />
    </div>
  )
}
