import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createClient } from '@/lib/supabase/server'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM = 'GoPortals CRM <notifications@goportals.co>'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://agency-crm-gilt-sigma.vercel.app'

export async function POST(req: Request) {
  try {
    const { type } = await req.json()
    const supabase = createClient()
    const now = new Date()
    const sent: string[] = []

    // ── 1. OVERDUE ALERTS ──────────────────────────────────────────
    if (type === 'overdue' || type === 'all') {
      const { data: overdue } = await supabase
        .from('tickets')
        .select('id, title, due_date, priority, clients(name), assignee:team_members!assignee_id(name, email)')
        .lt('due_date', now.toISOString())
        .neq('status', 'done')
        .not('assignee_id', 'is', null)

      for (const ticket of overdue ?? []) {
        const assignee = ticket.assignee as any
        if (!assignee?.email) continue
        await resend.emails.send({
          from: FROM,
          to: assignee.email,
          subject: `⚠️ Overdue: ${ticket.title}`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
              <div style="background:#1E40AF;padding:20px 24px;">
                <h2 style="color:white;margin:0;font-size:18px;">GoPortals CRM</h2>
              </div>
              <div style="padding:24px;background:#f9fafb;border:1px solid #e5e7eb;">
                <h3 style="color:#DC2626;margin:0 0 16px;">Ticket Overdue</h3>
                <p style="margin:0 0 8px;color:#111827;font-size:15px;font-weight:600;">${ticket.title}</p>
                <p style="margin:0 0 8px;color:#6B7280;font-size:13px;">Client: ${(ticket.clients as any)?.name ?? '—'}</p>
                <p style="margin:0 0 8px;color:#6B7280;font-size:13px;">Priority: ${ticket.priority}</p>
                <p style="margin:0 0 20px;color:#DC2626;font-size:13px;">Due date: ${new Date(ticket.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                <a href="${APP_URL}/tickets/${ticket.id}" style="background:#1E40AF;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:14px;">View Ticket →</a>
              </div>
              <p style="color:#9CA3AF;font-size:12px;padding:12px 24px;text-align:center;">GoPortals Agency CRM · <a href="${APP_URL}" style="color:#9CA3AF;">Open App</a></p>
            </div>
          `,
        })
        sent.push(`overdue:${ticket.id}`)
      }
    }

    // ── 2. RENEWAL ALERTS ─────────────────────────────────────────
    if (type === 'renewal' || type === 'all') {
      const in7Days = new Date(now.getTime() + 7 * 86400000).toISOString()
      const { data: renewals } = await supabase
        .from('clients')
        .select('id, name, contract_end, primary_member:team_members!primary_member_id(name, email)')
        .lte('contract_end', in7Days)
        .gte('contract_end', now.toISOString())
        .eq('is_active', true)

      for (const client of renewals ?? []) {
        const member = client.primary_member as any
        if (!member?.email) continue
        const daysLeft = Math.ceil((new Date(client.contract_end).getTime() - now.getTime()) / 86400000)
        await resend.emails.send({
          from: FROM,
          to: member.email,
          subject: `🔔 Renewal in ${daysLeft}d: ${client.name}`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
              <div style="background:#1E40AF;padding:20px 24px;">
                <h2 style="color:white;margin:0;font-size:18px;">GoPortals CRM</h2>
              </div>
              <div style="padding:24px;background:#fffbeb;border:1px solid #FCD34D;">
                <h3 style="color:#92400E;margin:0 0 16px;">Contract Renewal Due Soon</h3>
                <p style="margin:0 0 8px;color:#111827;font-size:15px;font-weight:600;">${client.name}</p>
                <p style="margin:0 0 8px;color:#6B7280;font-size:13px;">Contract ends: ${new Date(client.contract_end).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                <p style="margin:0 0 20px;color:#92400E;font-size:13px;font-weight:600;">${daysLeft} day${daysLeft !== 1 ? 's' : ''} remaining</p>
                <a href="${APP_URL}/clients/${client.id}" style="background:#1E40AF;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:14px;">View Client →</a>
              </div>
              <p style="color:#9CA3AF;font-size:12px;padding:12px 24px;text-align:center;">GoPortals Agency CRM · <a href="${APP_URL}" style="color:#9CA3AF;">Open App</a></p>
            </div>
          `,
        })
        sent.push(`renewal:${client.id}`)
      }
    }

    return NextResponse.json({ ok: true, sent })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
