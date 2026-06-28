'use client'

import { useState } from 'react'
import { Globe, X } from 'lucide-react'

export default function CreatePortalUserButton({
  clientId,
  defaultEmail,
  defaultName,
}: {
  clientId: string
  defaultEmail?: string
  defaultName?: string
}) {
  const [open, setOpen]       = useState(false)
  const [email, setEmail]     = useState(defaultEmail ?? '')
  const [name, setName]       = useState(defaultName ?? '')
  const [saving, setSaving]   = useState(false)
  const [result, setResult]   = useState<'sent' | 'error' | null>(null)
  const [errMsg, setErrMsg]   = useState('')

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setResult(null)

    const res = await fetch('/api/admin/portal-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, email, name }),
    })
    const data = await res.json()

    if (!res.ok) {
      setErrMsg(data.error ?? 'Something went wrong')
      setResult('error')
    } else {
      setResult('sent')
      setTimeout(() => { setOpen(false); setResult(null) }, 3000)
    }
    setSaving(false)
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
      >
        <Globe className="w-4 h-4" />
        Invite to Client Portal
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-semibold text-gray-900">Invite to Client Portal</h2>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {result === 'sent' ? (
              <div className="text-center py-4">
                <p className="text-2xl mb-2">✅</p>
                <p className="font-semibold text-gray-900">Invite sent!</p>
                <p className="text-sm text-gray-500 mt-1">{email} will receive an email to set their password.</p>
              </div>
            ) : (
              <form onSubmit={handleInvite} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Contact Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Brand contact name"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email Address *</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="contact@brand.com"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                {result === 'error' && (
                  <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{errMsg}</p>
                )}
                <p className="text-xs text-gray-400">
                  They'll get an invite email to set a password and access their brand's portal — they won't see any other brands or internal team data.
                </p>
                <div className="flex gap-3">
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg"
                  >
                    {saving ? 'Sending…' : 'Send Invite'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="px-4 py-2.5 border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm rounded-lg"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}
