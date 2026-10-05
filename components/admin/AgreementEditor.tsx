'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, Pencil } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Alert, Field } from '@/components/ui/primitives'
import { Markdown } from '@/components/shared/Markdown'
import { errorMessage } from '@/lib/utils'
import type { Agreement } from '@/types/database'

/** Publish a new agreement version. Every client must accept the new version on their next visit. */
export function AgreementEditor({ current, nextVersion }: { current: Agreement | null; nextVersion: string }) {
  const router = useRouter()
  const [form, setForm] = useState({ version: nextVersion, title: current?.title ?? 'GoPortals Service Agreement', body: current?.body ?? '' })
  const [preview, setPreview] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function publish() {
    setBusy(true); setMsg(null)
    const supabase = createClient()
    const { data, error } = await supabase.from('agreements')
      .insert({ version: form.version.trim(), title: form.title.trim(), body: form.body, is_current: false })
      .select('id').single()
    if (error) { setBusy(false); return setMsg({ ok: false, text: errorMessage(error) }) }
    // Only one agreement can be current: clear the old flag first, then set the new one.
    if (current) await supabase.from('agreements').update({ is_current: false }).eq('id', current.id)
    const { error: e2 } = await supabase.from('agreements').update({ is_current: true, published_at: new Date().toISOString() }).eq('id', data.id)
    setBusy(false)
    setConfirm(false)
    if (e2) return setMsg({ ok: false, text: errorMessage(e2) })
    setMsg({ ok: true, text: `Version ${form.version} published. Clients will be asked to accept it.` })
    router.refresh()
  }

  return (
    <div className="space-y-4">
      {msg && <Alert tone={msg.ok ? 'success' : 'error'}>{msg.text}</Alert>}
      <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
        <Field label="Version"><input className="input" value={form.version} onChange={e => setForm({ ...form, version: e.target.value })} /></Field>
        <Field label="Title"><input className="input" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></Field>
      </div>
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className="label mb-0">Agreement text</label>
          <button type="button" onClick={() => setPreview(p => !p)} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600">
            {preview ? <><Pencil className="h-3.5 w-3.5" /> Edit</> : <><Eye className="h-3.5 w-3.5" /> Preview</>}
          </button>
        </div>
        {preview
          ? <div className="max-h-[480px] overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-5"><Markdown text={form.body} /></div>
          : <textarea className="input min-h-[360px] font-mono text-xs leading-relaxed" value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} />}
        <p className="mt-1 text-xs text-slate-500">Use # for headings, ## for sub-headings, “1.” or “-” for lists, **bold**.</p>
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
        {confirm ? (
          <>
            <span className="text-sm text-amber-700">All clients will have to accept this before using the portal again.</span>
            <Button variant="secondary" onClick={() => setConfirm(false)}>Cancel</Button>
            <Button loading={busy} onClick={publish}>Yes, publish</Button>
          </>
        ) : (
          <Button disabled={!form.version.trim() || !form.body.trim() || form.version === current?.version} onClick={() => setConfirm(true)}>
            Publish as new version
          </Button>
        )}
      </div>
    </div>
  )
}
