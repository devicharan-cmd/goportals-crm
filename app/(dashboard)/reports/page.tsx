import { createClient } from '@/lib/supabase/server'
import ReportsClient from './ReportsClient'

export default async function ReportsPage() {
  const supabase = createClient()
  const now = new Date()

  const [
    { data: allTickets },
    { data: members },
    { data: clients },
  ] = await Promise.all([
    supabase
      .from('tickets')
      .select('id, status, priority, assignee_id, due_date, closed_at, created_at, assigned_date, estimated_hours, actual_hours'),
    supabase.from('team_members').select('id, name, role').eq('is_active', true),
    supabase.from('clients').select('id, name, health_score, lifecycle_stage, contract_end').eq('is_active', true),
  ])

  const renewalAlerts = (clients ?? []).filter((c: any) => {
    if (!c.contract_end) return false
    const diff = (new Date(c.contract_end).getTime() - now.getTime()) / 86400000
    return diff >= 0 && diff <= 60
  })

  return (
    <ReportsClient
      allTickets={allTickets ?? []}
      members={members ?? []}
      clients={clients ?? []}
      renewalAlerts={renewalAlerts}
    />
  )
}
