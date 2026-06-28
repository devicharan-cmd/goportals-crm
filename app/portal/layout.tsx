import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PortalSignOutButton from '@/components/portal/PortalSignOutButton'

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user || user.user_metadata?.role !== 'client') {
    redirect('/login')
  }

  const clientId = user.user_metadata?.client_id as string
  const { data: client } = clientId
    ? await supabase.from('clients').select('name').eq('id', clientId).single()
    : { data: null }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top nav */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
            <span className="text-white font-bold text-sm">GP</span>
          </div>
          <div>
            <span className="font-semibold text-gray-900 text-sm">GoPortals</span>
            {client?.name && (
              <span className="text-gray-400 text-sm"> · {client.name}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">{user.email}</span>
          <PortalSignOutButton />
        </div>
      </header>

      {/* Nav tabs */}
      <nav className="bg-white border-b border-gray-100 px-6">
        <div className="flex gap-1">
          {[
            { href: '/portal/dashboard', label: 'Overview' },
            { href: '/portal/tickets',   label: 'Tickets' },
          ].map(item => (
            <a
              key={item.href}
              href={item.href}
              className="px-4 py-3 text-sm font-medium text-gray-600 hover:text-gray-900 border-b-2 border-transparent hover:border-blue-500 transition-colors"
            >
              {item.label}
            </a>
          ))}
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {children}
      </main>
    </div>
  )
}
