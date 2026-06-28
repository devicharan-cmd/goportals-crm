'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Users } from 'lucide-react'

type Member = { id: string; name: string; role: string }

type Props = {
  clientId: string
  allMembers: Member[]
  assignedIds: string[]
}

export default function AssignMembersPanel({ clientId, allMembers, assignedIds }: Props) {
  const router = useRouter()
  const [assigned, setAssigned] = useState<Set<string>>(new Set(assignedIds))
  const [loading, setLoading] = useState<string | null>(null)

  async function toggle(memberId: string) {
    setLoading(memberId)
    const isAssigned = assigned.has(memberId)

    const res = await fetch('/api/admin/assignments', {
      method: isAssigned ? 'DELETE' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, member_id: memberId }),
    })

    if (res.ok) {
      setAssigned(prev => {
        const next = new Set(prev)
        isAssigned ? next.delete(memberId) : next.add(memberId)
        return next
      })
      router.refresh()
    }
    setLoading(null)
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center gap-2 mb-4">
        <Users className="w-4 h-4 text-blue-600" />
        <h2 className="font-semibold text-gray-900">Brand Access</h2>
        <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">Admin</span>
      </div>
      <p className="text-xs text-gray-400 mb-3">Toggle which team members can see this brand.</p>
      <div className="space-y-2">
        {allMembers.map(m => {
          const isAssigned = assigned.has(m.id)
          return (
            <button
              key={m.id}
              onClick={() => toggle(m.id)}
              disabled={loading === m.id}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all ${
                isAssigned
                  ? 'border-blue-200 bg-blue-50'
                  : 'border-gray-200 bg-white hover:bg-gray-50'
              }`}
            >
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                isAssigned ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'
              }`}>
                {loading === m.id ? '…' : m.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">{m.name}</p>
                <p className="text-xs text-gray-400 capitalize">{m.role.replace(/_/g, ' ')}</p>
              </div>
              <span className={`text-xs font-medium ${isAssigned ? 'text-blue-600' : 'text-gray-300'}`}>
                {isAssigned ? '✓ Access' : 'No access'}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
