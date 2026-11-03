import { Download, FileText, Flame, Truck } from 'lucide-react'
import { Card } from '@/components/ui/primitives'
import { MarketplaceAccountLabel } from '@/components/shared/Marketplace'
import { TicketCode } from '@/components/tickets/TicketCode'
import type { TaskPriority, TicketStatus } from '@/types/database'
import type { AttachmentLink } from '@/components/shared/TicketAttachmentsList'

export type TicketOverviewField = {
  key: string
  label: string
  value: React.ReactNode
}

const STATUS_STYLES: Record<TicketStatus, string> = {
  unassigned: 'border-[#E2E8F0] bg-[#F1F5F9] text-[#475569]',
  assigned: 'border-[#B9E4EC] bg-[#E6F5F8] text-[#086581]',
  closed: 'border-[#E2E8F0] bg-[#F1F5F9] text-[#475569]',
}

const PRIORITY_STYLES: Record<TaskPriority, string> = {
  P1: 'border-[#FECACA] bg-[#FEE2E2] text-[#DC2626]',
  P2: 'border-[#FED7AA] bg-[#FFF7ED] text-[#C2410C]',
  P3: 'border-[#B9E4EC] bg-[#E6F5F8] text-[#086581]',
  P4: 'border-[#E2E8F0] bg-[#F1F5F9] text-[#475569]',
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 flex items-center gap-3 font-sans text-lg font-bold leading-6 text-[#0F172A]">
      <span aria-hidden="true" className="h-6 w-1.5 shrink-0 rounded-full bg-[#0D9488]" />
      {children}
    </h2>
  )
}

export function TicketOverviewCard({
  ticketNumber,
  subject,
  clientName,
  platformName,
  accountName,
  category,
  urgent,
  status,
  priority,
  requestFields,
  emptyRequestMessage,
  description,
  attachments,
  children,
}: {
  ticketNumber: string
  subject: string
  clientName: string | null
  platformName: string | null
  accountName: string | null
  category: string
  urgent: boolean
  status: TicketStatus
  priority: TaskPriority | null
  requestFields: TicketOverviewField[]
  emptyRequestMessage?: string
  description: string | null
  attachments: AttachmentLink[]
  children?: React.ReactNode
}) {
  return (
    <Card className="mx-auto w-full max-w-[1200px] rounded-2xl border border-[#E2E8F0] bg-white p-4 font-sans shadow-[0_4px_12px_rgba(15,23,42,0.06)] md:p-5">
      <header className="border-b border-[#E2E8F0] pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <TicketCode code={ticketNumber} />
            <span aria-hidden="true" className="h-4 w-px bg-[#DCE5EF]" />
            {urgent && status !== 'closed' && (
              <span className="inline-flex items-center gap-1 rounded-md border border-red-700 bg-gradient-to-r from-red-600 to-red-700 px-1.5 py-0.5 text-[11px] font-semibold leading-4 text-white">
                <Flame aria-hidden="true" className="h-3 w-3" />
                Urgent
              </span>
            )}
            <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold leading-4 ${STATUS_STYLES[status]}`}>
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />
              {status === 'unassigned' ? 'Unassigned' : status === 'assigned' ? 'Assigned' : 'Closed'}
            </span>
            {priority && (
              <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-semibold leading-4 ${PRIORITY_STYLES[priority]}`}>
                {priority}
              </span>
            )}
          </div>
          <span className="inline-flex max-w-full shrink-0 items-center gap-1 rounded-md border border-[#B9E4EC] bg-[#E6F5F8] px-2 py-0.5 text-[11px] font-semibold leading-4 text-[#086581]">
            {category.toLowerCase().includes('shipment') && <Truck aria-hidden="true" className="h-3.5 w-3.5" />}
            {category}
          </span>
        </div>
        <h1 className="mt-2.5 font-sans text-[22px] font-semibold leading-7 text-[#0F172A]">{subject}</h1>
        {(clientName || platformName || accountName) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] font-medium leading-5 text-[#526987]">
            {clientName && <span className="font-semibold">{clientName}</span>}
            {clientName && (platformName || accountName) && <span aria-hidden="true">·</span>}
            {(platformName || accountName) && <MarketplaceAccountLabel platformName={platformName} accountName={accountName} size="compact" />}
          </div>
        )}
      </header>

      {(requestFields.length > 0 || emptyRequestMessage) && (
        <section className="mt-5">
          <SectionHeading>Request Details</SectionHeading>
          {requestFields.length > 0 ? (
            <dl className="overflow-hidden rounded-[14px] border border-[#DCE5EF]">
              {requestFields.map((field, index) => (
                <div key={field.key} className={`grid grid-cols-1 md:grid-cols-[minmax(0,30%)_minmax(0,70%)] ${index ? 'border-t border-[#E2E8F0]' : ''}`}>
                  <dt className="bg-[#F1F5F9] px-3 py-2 text-[15px] font-semibold leading-[22px] text-[#334155] md:px-4 md:py-2.5">
                    {field.label}
                  </dt>
                  <dd className="break-words whitespace-pre-wrap bg-white px-3 py-2 text-[15px] font-normal leading-[22px] text-[#111827] md:px-4 md:py-2.5">
                    {field.value}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="rounded-[14px] border border-[#DCE5EF] bg-white px-3 py-2.5 text-[15px] leading-[22px] text-[#526987] md:px-4">
              {emptyRequestMessage}
            </p>
          )}
        </section>
      )}

      <section className="mt-5">
        <SectionHeading>Description</SectionHeading>
        <div className="rounded-[14px] border border-[#DCE5EF] bg-[#F8FAFC] px-3 py-2.5 text-[15px] font-normal leading-[22px] text-[#172033] md:px-4">
          {(description || 'No description.').split(/\n\s*\n/).map((paragraph, index, paragraphs) => (
            <p key={index} className={`whitespace-pre-wrap ${index < paragraphs.length - 1 ? 'mb-4' : ''}`}>{paragraph}</p>
          ))}
        </div>
      </section>

      <section className="mt-5">
        <SectionHeading>Attachments</SectionHeading>
        <ul className="space-y-2">
          {attachments.length ? attachments.map(file => (
            <li key={file.id} className="inline-flex w-fit max-w-full flex-wrap items-center gap-2 rounded-[10px] border border-[#CBD5E1] bg-white px-2.5 py-1.5">
              <div className="flex min-w-0 items-center gap-2">
                <FileTypeIcon fileName={file.file_name} />
                <span className="min-w-0 break-all text-sm font-semibold leading-5 text-[#0F172A]">
                  {file.file_name}
                </span>
                {file.size_bytes != null && (
                  <span className="shrink-0 rounded-md bg-[#F1F5F9] px-2 py-1 text-sm font-semibold leading-5 text-[#475569]">
                    {formatFileSize(file.size_bytes)}
                  </span>
                )}
              </div>
              <a href={file.url ?? '#'} download={file.file_name} className="inline-flex shrink-0 items-center gap-1 rounded-[10px] border border-[#0D9488] px-2.5 py-1.5 text-xs font-semibold text-[#0D9488] hover:bg-[#E6F5F8]">
                <Download aria-hidden="true" className="h-3 w-3" />
                Download
              </a>
            </li>
          )) : (
            <li className="rounded-[14px] border border-[#CBD5E1] bg-white px-4 py-3 text-sm text-[#64748B]">
              No attachments were added.
            </li>
          )}
        </ul>
      </section>
      {children}
    </Card>
  )
}

function FileTypeIcon({ fileName }: { fileName: string }) {
  const extension = fileName.split('.').pop()?.toLowerCase()
  if (extension === 'xls' || extension === 'xlsx' || extension === 'csv') {
    return <span aria-label="Spreadsheet file" className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-emerald-600 text-sm font-bold text-white">X</span>
  }
  if (extension === 'pdf') {
    return <span aria-label="PDF file" className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-red-600 text-[9px] font-bold text-white">PDF</span>
  }
  if (extension === 'doc' || extension === 'docx') {
    return <span aria-label="Document file" className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-blue-600 text-sm font-bold text-white">W</span>
  }
  return <FileText aria-label="File" className="h-6 w-6 shrink-0 text-slate-500" />
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
