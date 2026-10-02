import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase/admin'
import { getProfile } from '@/lib/auth'
import { brandedEmailHtml } from '@/lib/email'

const FROM = 'GoPortals <notifications@goportals.co>'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://agency-crm-gilt-sigma.vercel.app'

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
const fmt = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

/**
 * POST /api/notify { type: 'overdue' | 'renewal' | 'all' }
 * Allowed for a signed-in super admin, or a scheduler sending `Authorization: Bearer $CRON_SECRET`.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const viaCron = !!secret && req.headers.get('authorization') === `Bearer ${secret}`
  if (!viaCron) {
    const me = await getProfile()
    if (!me || me.role !== 'super_admin' || me.status !== 'active') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }
  if (!process.env.RESEND_API_KEY) return NextResponse.json({ error: 'RESEND_API_KEY is not set' }, { status: 500 })

  const { type = 'all' } = await req.json().catch(() => ({}))
  const resend = new Resend(process.env.RESEND_API_KEY)
  const db = createAdminClient()
  const today = new Date().toISOString().slice(0, 10)
  const sent: string[] = []

  try {
    if (type === 'overdue' || type === 'all') {
      const { data } = await db.from('tasks')
        .select('id, task_number, title, due_date, priority, client:clients(company_name), assignee:profiles!tasks_assignee_id_fkey(full_name, email)')
        .lt('due_date', today).not('status', 'in', '(completed,cancelled)').not('assignee_id', 'is', null)
      for (const t of (data ?? []) as unknown as { id: string; task_number: number; title: string; due_date: string; priority: string; client: { company_name: string } | null; assignee: { email: string } | null }[]) {
        if (!t.assignee?.email) continue
        await resend.emails.send({
          from: FROM, to: t.assignee.email, subject: `Overdue GP-${t.task_number}: ${t.title}`,
          html: brandedEmailHtml('Task overdue',
            [`<strong>GP-${t.task_number} · ${esc(t.title)}</strong>`, `Client: ${esc(t.client?.company_name ?? '—')}`, `Priority: ${t.priority}`, `Was due: ${fmt(t.due_date)}`],
            `${APP_URL}/tasks/${t.id}`, 'Open task', '#DC2626'),
        })
        sent.push(`overdue:${t.id}`)
      }
    }

    if (type === 'renewal' || type === 'all') {
      const in7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
      const [{ data: renewals }, { data: admins }] = await Promise.all([
        db.from('client_internal').select('client_id, contract_end, client:clients(company_name, status)')
          .gte('contract_end', today).lte('contract_end', in7),
        db.from('profiles').select('email').eq('role', 'super_admin').eq('status', 'active'),
      ])
      const to = (admins ?? []).map((a: { email: string }) => a.email)
      for (const r of (renewals ?? []) as unknown as { client_id: string; contract_end: string; client: { company_name: string; status: string } | null }[]) {
        if (!to.length || r.client?.status !== 'active') continue
        await resend.emails.send({
          from: FROM, to, subject: `Contract renewal: ${r.client.company_name}`,
          html: brandedEmailHtml('Contract renewal due soon',
            [`<strong>${esc(r.client.company_name)}</strong>`, `Contract ends ${fmt(r.contract_end)}`],
            `${APP_URL}/clients/${r.client_id}`, 'Open client', '#B45309'),
        })
        sent.push(`renewal:${r.client_id}`)
      }
    }

    return NextResponse.json({ ok: true, sent })
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message, sent }, { status: 500 })
  }
}
