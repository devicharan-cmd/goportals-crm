'use client'

import { Download } from 'lucide-react'

export default function ExportPDFButton() {
  return (
    <button
      onClick={() => window.print()}
      className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg"
    >
      <Download className="w-4 h-4" />
      Download PDF
    </button>
  )
}
