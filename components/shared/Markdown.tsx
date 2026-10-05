/** Tiny, safe markdown renderer for agreement text: #/## headings, - lists, _italic_, **bold**, paragraphs. */
function inline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|_[^_]+_)/g)
  return parts.map((p, i) =>
    p.startsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong>
    : p.startsWith('_') && p.endsWith('_') && p.length > 2 ? <em key={i}>{p.slice(1, -1)}</em>
    : p,
  )
}

export function Markdown({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/)
  return (
    <div className="space-y-3 text-sm leading-relaxed text-slate-700">
      {blocks.map((block, i) => {
        const lines = block.split('\n')
        if (block.startsWith('## ')) return <h4 key={i} className="pt-2 text-sm font-semibold text-slate-900">{inline(block.slice(3))}</h4>
        if (block.startsWith('# '))  return <h3 key={i} className="text-base font-bold text-slate-900">{inline(block.slice(2))}</h3>
        if (lines.every(l => /^(\d+\.|-)\s/.test(l))) {
          const ordered = /^\d+\./.test(lines[0])
          const Tag = ordered ? 'ol' : 'ul'
          return (
            <Tag key={i} className={ordered ? 'list-decimal space-y-1 pl-5' : 'list-disc space-y-1 pl-5'}>
              {lines.map((l, j) => <li key={j}>{inline(l.replace(/^(\d+\.|-)\s/, ''))}</li>)}
            </Tag>
          )
        }
        return <p key={i} className="whitespace-pre-line">{inline(block)}</p>
      })}
    </div>
  )
}
