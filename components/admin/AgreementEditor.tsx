'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, Pencil, Send } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Alert, Field } from '@/components/ui/primitives'
import { Modal } from '@/components/ui/modal'
import { Markdown } from '@/components/shared/Markdown'
import { errorMessage } from '@/lib/utils'
import type { Agreement } from '@/types/database'

const DEFAULT_TITLE = 'GoPortals Service Agreement'

/**
 * Shows the live agreement read-only. "Update agreement" unlocks the fields for a new
 * version; Publish is enabled only once something changed and asks for confirmation.
 * Every client must accept the new version on their next visit.
 */
export function AgreementEditor({ current, nextVersion }: { current: Agreement | null; nextVersion: string }) {
  const router = useRouter()
  const liveForm = () => ({ version: current?.version ?? nextVersion, title: current?.title ?? DEFAULT_TITLE, body: current?.body ?? '' })
  const [form, setForm] = useState(liveForm)
  const [editing, setEditing] = useState(!current)
  const [preview, setPreview] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // After publishing, the server sends the new live version — show it locked.
  useEffect(() => {
    setForm(liveForm())
    setEditing(!current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id])

  const changed = !current || form.title.trim() !== current.title || form.body !== current.body
  const canPublish = editing && changed && !!form.version.trim() && !!form.body.trim() && form.version.trim() !== current?.version

  function startUpdate() {
    setMsg(null)
    setForm({ ...liveForm(), version: nextVersion })
    setEditing(true)
  }

  function cancelUpdate() {
    setForm(liveForm())
    setEditing(false)
  }

  async function publish() {
    setBusy(true); setMsg(null)
    const supabase = createClient()
    const { data, error } = await supabase.from('agreements')
      .insert({ version: form.version.trim(), title: form.title.trim(), body: form.body, is_current: false })
      .select('id').single()
    if (error) { setBusy(false); setConfirm(false); return setMsg({ ok: false, text: errorMessage(error) }) }
    // Only one agreement can be current: clear the old flag first, then set the new one.
    if (current) await supabase.from('agreements').update({ is_current: false }).eq('id', current.id)
    const { error: e2 } = await supabase.from('agreements').update({ is_current: true, published_at: new Date().toISOString() }).eq('id', data.id)
    setBusy(false)
    setConfirm(false)
    if (e2) return setMsg({ ok: false, text: errorMessage(e2) })
    setEditing(false)
    setMsg({ ok: true, text: `Version ${form.version.trim()} published. Clients will be asked to accept it.` })
    router.refresh()
  }

  return (
    <div className="space-y-4">
      {msg && <Alert tone={msg.ok ? 'success' : 'error'}>{msg.text}</Alert>}
      <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
        <Field label="Version">
          <input className="input disabled:bg-slate-50 disabled:text-slate-500" disabled={!editing} value={form.version}
                 onChange={e => setForm({ ...form, version: e.target.value })} />
        </Field>
        <Field label="Title">
          <input className="input disabled:bg-slate-50 disabled:text-slate-500" disabled={!editing} value={form.title}
                 onChange={e => setForm({ ...form, title: e.target.value })} />
        </Field>
      </div>
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className="label mb-0">Agreement text</label>
          <button type="button" onClick={() => setPreview(true)} disabled={!form.body.trim()}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 disabled:text-slate-300">
            <Eye className="h-3.5 w-3.5" /> Preview
          </button>
        </div>
        <textarea className="input min-h-[360px] font-mono text-xs leading-relaxed disabled:bg-slate-50 disabled:text-slate-500"
                  disabled={!editing} value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} />
        {editing && <p className="mt-1 text-xs text-slate-500">Use # for headings, ## for sub-headings, “1.” or “-” for lists, **bold**.</p>}
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
        {editing ? (
          <>
            {current && <Button variant="secondary" onClick={cancelUpdate}>Cancel</Button>}
            {canPublish && (
              <Button onClick={() => setConfirm(true)}><Send className="h-4 w-4" /> Publish {form.version.trim()}</Button>
            )}
          </>
        ) : (
          <Button onClick={startUpdate}><Pencil className="h-4 w-4" /> Update agreement</Button>
        )}
      </div>

      <Modal open={preview} onClose={() => setPreview(false)} size="lg"
             title={form.title.trim() || DEFAULT_TITLE} description={`Version ${form.version.trim() || '—'} · as clients will see it`}>
        <div className="max-h-[65vh] overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-5">
          <Markdown text={form.body} />
        </div>
        <div className="mt-4 flex justify-end">
          <Button variant="secondary" onClick={() => setPreview(false)}>Close</Button>
        </div>
      </Modal>

      <Modal open={confirm} onClose={() => !busy && setConfirm(false)} title={`Publish ${form.version.trim()}?`}>
        <p className="text-sm text-slate-600">
          This replaces the live agreement{current ? ` (${current.version})` : ''}. Every client will have to accept
          the new version before they can use the portal again.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirm(false)} disabled={busy}>Cancel</Button>
          <Button loading={busy} onClick={publish}>Yes, publish</Button>
        </div>
      </Modal>
    </div>
  )
}
