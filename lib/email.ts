// Branded HTML shared by transactional emails sent via Resend
// (app/api/notify/route.ts: overdue/renewal alerts).
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://agency-crm-gilt-sigma.vercel.app'

export function brandedEmailHtml(title: string, lines: string[], href: string, cta: string, tone = '#045E80') {
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
    <p style="text-align:center;color:#94a3b8;font-size:11px;margin-top:12px;">GoPortals · ${APP_URL.replace(/^https?:\/\//, '')}</p>
  </div>`
}
