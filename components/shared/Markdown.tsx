/** Tiny, safe markdown renderer for agreement text: #/## headings, - / 1. lists, _italic_, **bold**, paragraphs. */
function inline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|_[^_]+_)/g)
  return parts.map((p, i) =>
    p.startsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong>
    : p.startsWith('_') && p.endsWith('_') && p.length > 2 ? <em key={i}>{p.slice(1, -1)}</em>
    : p,
  )
}

// Read line by line so a heading directly followed by text (no blank line) stays a heading.
export function Markdown({ text }: { text: string }) {
  const out: React.ReactNode[] = []
  let para: string[] = []
  let list: { ordered: boolean; items: string[] } | null = null

  const flushPara = () => {
    if (para.length) out.push(<p key={out.length} className="whitespace-pre-line">{inline(para.join('\n'))}</p>)
    para = []
  }
  const flushList = () => {
    if (!list) return
    const Tag = list.ordered ? 'ol' : 'ul'
    out.push(
      <Tag key={out.length} className={list.ordered ? 'list-decimal space-y-1 pl-5' : 'list-disc space-y-1 pl-5'}>
        {list.items.map((item, j) => <li key={j}>{inline(item)}</li>)}
      </Tag>,
    )
    list = null
  }

  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd()
    if (!line.trim()) { flushPara(); flushList(); continue }
    if (line.startsWith('## ')) {
      flushPara(); flushList()
      out.push(<h4 key={out.length} className="pt-2 text-sm font-semibold text-slate-900">{inline(line.slice(3))}</h4>)
      continue
    }
    if (line.startsWith('# ')) {
      flushPara(); flushList()
      out.push(<h3 key={out.length} className="text-base font-bold text-slate-900">{inline(line.slice(2))}</h3>)
      continue
    }
    const item = line.match(/^(\d+\.|-)\s+(.*)$/)
    if (item) {
      flushPara()
      const ordered = item[1] !== '-'
      if (list && list.ordered !== ordered) flushList()
      if (!list) list = { ordered, items: [] }
      list.items.push(item[2])
      continue
    }
    flushList()
    para.push(line)
  }
  flushPara(); flushList()

  return <div className="space-y-3 text-sm leading-relaxed text-slate-700">{out}</div>
}
