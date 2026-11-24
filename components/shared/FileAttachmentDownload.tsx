'use client'

import { useState } from 'react'
import { Archive, Download, FileSpreadsheet, FileText, Film, Image as ImageIcon, Loader2 } from 'lucide-react'

export function FileTypeIcon({ fileName }: { fileName: string }) {
  const extension = fileName.split('.').pop()?.toLowerCase()
  if (['xls', 'xlsx', 'csv', 'ods'].includes(extension ?? '')) {
    return <span aria-label="Spreadsheet file" className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200"><FileSpreadsheet aria-hidden="true" className="h-4 w-4" /></span>
  }
  if (extension === 'pdf') {
    return <span aria-label="PDF file" className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-red-600 text-[9px] font-bold text-white">PDF</span>
  }
  if (['doc', 'docx', 'rtf', 'odt'].includes(extension ?? '')) {
    return <span aria-label="Document file" className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-blue-600 text-sm font-bold text-white">W</span>
  }
  if (['ppt', 'pptx', 'odp'].includes(extension ?? '')) {
    return <span aria-label="Presentation file" className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-orange-600 text-sm font-bold text-white">P</span>
  }
  if (['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif', 'svg'].includes(extension ?? '')) {
    return <ImageIcon aria-label="Image file" className="h-5 w-5 shrink-0 text-violet-600" />
  }
  if (['mp4', 'webm', 'mov', 'mkv'].includes(extension ?? '')) {
    return <Film aria-label="Video file" className="h-5 w-5 shrink-0 text-violet-600" />
  }
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(extension ?? '')) {
    return <Archive aria-label="Archive file" className="h-5 w-5 shrink-0 text-slate-500" />
  }
  return <FileText aria-label="File" className="h-6 w-6 shrink-0 text-slate-500" />
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function FileAttachmentDownload({
  fileName, sizeBytes, downloadUrl, className = '',
}: {
  fileName: string
  sizeBytes: number | null
  downloadUrl: string
  className?: string
}) {
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState('')
  const size = formatFileSize(sizeBytes)

  async function downloadFile() {
    if (downloading) return
    setDownloading(true)
    setError('')
    try {
      const response = await fetch(downloadUrl)
      if (!response.ok) throw new Error(`Download failed (${response.status})`)
      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(objectUrl)
    } catch {
      setError('Could not download this file. Please try again.')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className={`inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-[10px] border border-[#CBD5E1] bg-white px-2 py-1 ${className}`}>
      <div className="flex min-w-0 items-center gap-1.5">
        <FileTypeIcon fileName={fileName} />
        <span className="min-w-0 max-w-[min(18rem,42vw)] truncate text-xs font-medium leading-4 text-[#0F172A]" title={fileName}>{fileName}</span>
        {size && <span className="shrink-0 rounded-md bg-[#F1F5F9] px-1.5 py-0.5 text-[10px] font-semibold leading-4 text-[#475569]">{size}</span>}
      </div>
      <button type="button" onClick={() => void downloadFile()} disabled={downloading} aria-busy={downloading} aria-label={`Download ${fileName}`} title={error || `Download ${fileName}`} className="inline-flex h-7 shrink-0 items-center gap-1 rounded-lg border border-[#0D9488] px-2 py-1 text-[11px] font-semibold text-[#0D9488] hover:bg-[#E6F5F8] disabled:cursor-wait disabled:opacity-70">
        {downloading
          ? <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
          : <Download aria-hidden="true" className="h-3.5 w-3.5" />}
        {downloading ? 'Downloading…' : 'Download'}
      </button>
      {error && <span role="status" className="sr-only">{error}</span>}
    </div>
  )
}
