import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase/admin'
import { getProfile } from '@/lib/auth'

const FROM = 'GoPortals <notifications@goportals.co>'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://agency-crm-gilt-sigma.vercel.app'

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
const fmt = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

function email(title: string, tone: string, lines: string[], href: string, cta: string) {
  return `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
    <div style="background:#045E80;padding:18px 24px;border-bottom:4px solid #95C12C;">
      <h2 style="color:#fff;margin:0;font-size:18px;">GoPortals</h2>
    </div>
    <div style="padding:24px;background:#f8fafc;border:1px solid #e2e8f0;">
      <h3 style="color:${tone};margin:0 0 16px;">${title}</h3>
      ${lines.map(l => `<p style="margin:0 0 8px;color:#334155;font-size:14px;">${l}</p>`).join('')}
      <a href="${href}" style="display:inline-block;margin-top:12px;background:#045E80;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:14px;">${cta} →</a>
    </div>
  </div>`
}

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
        .lt('due_date', today).neq('status', 'done').not('assignee_id', 'is', null)
      for (const t of (data ?? []) as unknown as { id: string; task_number: number; title: string; due_date: string; priority: string; client: { company_name: string } | null; assignee: { email: string } | null }[]) {
        if (!t.assignee?.email) continue
        await resend.emails.send({
          from: FROM, to: t.assignee.email, subject: `Overdue GP-${t.task_number}: ${t.title}`,
          html: email('Task overdue', '#DC2626',
            [`<strong>GP-${t.task_number} · ${esc(t.title)}</strong>`, `Client: ${esc(t.client?.company_name ?? '—')}`, `Priority: ${t.priority}`, `Was due: ${fmt(t.due_date)}`],
            `${APP_URL}/tasks/${t.id}`, 'Open task'),
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
          html: email('Contract renewal due soon', '#B45309',
            [`<strong>${esc(r.client.company_name)}</strong>`, `Contract ends ${fmt(r.contract_end)}`],
            `${APP_URL}/clients/${r.client_id}`, 'Open client'),
        })
        sent.push(`renewal:${r.client_id}`)
      }
    }

    return NextResponse.json({ ok: true, sent })
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message, sent }, { status: 500 })
  }
}
