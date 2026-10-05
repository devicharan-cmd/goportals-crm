// Category field definitions for client tickets (migration 014).
// Kept in sync by hand with guard_ticket_details() in supabase/migrations/014_tickets.sql —
// these are fixed, business-defined categories, not admin-configurable, so a plain TS map
// (not a DB-driven EAV system) is the field source of truth. If required keys change here,
// update the trigger too.
import type { TicketCategory } from '@/types/database'

export type TicketFieldType = 'text' | 'textarea' | 'number' | 'date' | 'select' | 'password' | 'platform'

/** Show this field only when another field (usually a 'select') already holds a given value. */
export type TicketFieldShowIf = { key: string; equals: string }

export type TicketFieldDef = {
  key: string
  label: string
  type: TicketFieldType
  required: boolean
  placeholder?: string
  /** Only for type: 'select'. */
  options?: { value: string; label: string }[]
  showIf?: TicketFieldShowIf
  /** type: 'platform' options come from the live `platforms` table instead of a static list. */
  /** Where this field renders relative to the fixed blocks (Guide, Attachments): 'early' = before the guide,
   *  'late' = after attachments, default = grouped with the rest of the category's fields (after the guide). */
  slot?: 'early' | 'default' | 'late'
}

/** A named file upload slot (distinct from the generic Attachments control), e.g. "Updated GST certificate". */
export type TicketFileFieldDef = {
  key: string
  label: string
  showIf?: TicketFieldShowIf
}

/** Switches the E-commerce account field to `mode` only when another field already holds a given value. */
export type TicketAccountRule = TicketFieldShowIf & { mode: 'required' | 'optional' }

export type TicketCategoryDef = {
  value: TicketCategory
  label: string
  hint: string
  descriptionRequired: boolean
  needsEcommerceAccount: 'required' | 'optional' | 'hidden'
  /** Overrides needsEcommerceAccount with `mode` only when the named field holds the given value. */
  needsEcommerceAccountIf?: TicketAccountRule
  fields: TicketFieldDef[]
  fileFields?: TicketFileFieldDef[]
  /** Shows the generic Attachments upload control. Off by default — turn on only for categories that genuinely need a file upload. */
  hasAttachments?: boolean
  /** Hides the generic Attachments control (even when hasAttachments is on) when the named field holds a given value —
   *  e.g. when a `fileFields` upload already covers that case. */
  hideAttachmentsIf?: TicketFieldShowIf
  /** Hides the Priority picker — for categories simple enough that triage doesn't need it. */
  hidePriority?: boolean
  /** Hides the "This is urgent" checkbox — for categories that are never escalated this way. */
  hideUrgent?: boolean
  /** Hides the Description field entirely — for categories where a field (usually a 'note') replaces it. */
  hideDescription?: boolean
  /** Overrides the "Description" field label — for categories where different wording fits better. */
  descriptionLabel?: string
  /** Makes the Description field required only when another field already holds a given value (on top of descriptionRequired). */
  descriptionRequiredIf?: TicketFieldShowIf
  /** Short plain-text help shown behind a "See guide" toggle on the form, for categories that need one. */
  guide?: string
  /** Link to an admin-provided guideline document (PDF), shown as a "View guideline" link on the form. */
  guideUrl?: string
}

export const TICKET_CATEGORIES: TicketCategoryDef[] = [
  {
    value: 'new_listing', label: 'New listing', hint: 'Get a new product listed',
    descriptionRequired: false, needsEcommerceAccount: 'optional',
    fields: [
      { key: 'drive_link', label: 'Spreadsheet / Drive link', type: 'text', required: false, slot: 'early',
        placeholder: 'Google Sheet, Drive folder, or image link (optional if you\'re uploading files below)' },
      { key: 'note', label: 'Note', type: 'textarea', required: true, slot: 'late',
        placeholder: 'Product name, SKU, category, and key attributes (size, color, variant, price)' },
    ],
    guide: 'In the note below, please include: product name, SKU, category, and key attributes (size, color, variant, price). '
         + 'Attach product images and any spec sheets or compliance documents, or share a Drive link.',
    guideUrl: '/guidelines/new-listing-guideline.pdf',
    hasAttachments: true,
    hideDescription: true,
  },
  {
    value: 'active_product_change', label: 'Active product change', hint: 'Change something on a live listing',
    descriptionRequired: false, needsEcommerceAccount: 'optional',
    fields: [
      { key: 'sku', label: 'SKU', type: 'text', required: true },
      { key: 'asin', label: 'ASIN', type: 'text', required: false },
      { key: 'change_type', label: 'What needs to change', type: 'text', required: true, placeholder: 'e.g. title, images, bullet points' },
      { key: 'drive_link', label: 'Spreadsheet / Drive link', type: 'text', required: false, slot: 'early',
        placeholder: 'Google Sheet, Drive folder, or image link (optional if you\'re uploading files below)' },
      { key: 'note', label: 'Note', type: 'textarea', required: true, slot: 'late', placeholder: 'The current value and the new value' },
    ],
    guide: 'Tell us the SKU/ASIN, what needs to change (title, images, bullet points, etc.), and in the note, the current value and the new value. '
         + 'Attach new images or spec sheets below, or share a Drive link.',
    guideUrl: '/guidelines/active-product-change-guideline.pdf',
    hasAttachments: true,
    hideDescription: true,
  },
  {
    value: 'price_updation', label: 'Price update', hint: 'Change the price of a listing',
    descriptionRequired: false, needsEcommerceAccount: 'optional',
    fields: [
      { key: 'update_type', label: 'Single or bulk?', type: 'select', required: true, slot: 'early',
        options: [
          { value: 'single', label: 'Single product' },
          { value: 'bulk',    label: 'Bulk (multiple products)' },
        ] },
      { key: 'drive_link', label: 'Spreadsheet / Drive link', type: 'text', required: false, slot: 'early',
        placeholder: 'Google Sheet or Drive link (optional if you\'re uploading a file below)',
        showIf: { key: 'update_type', equals: 'bulk' } },
      { key: 'sku', label: 'SKU', type: 'text', required: true,
        showIf: { key: 'update_type', equals: 'single' } },
      { key: 'asin', label: 'ASIN', type: 'text', required: false,
        showIf: { key: 'update_type', equals: 'single' } },
      { key: 'old_price', label: 'Current price', type: 'number', required: true,
        showIf: { key: 'update_type', equals: 'single' } },
      { key: 'new_price', label: 'New price', type: 'number', required: true,
        showIf: { key: 'update_type', equals: 'single' } },
      { key: 'note', label: 'Note', type: 'textarea', required: false, slot: 'late', placeholder: 'Anything else we should know (optional)' },
    ],
    guide: 'For a single product, tell us the SKU/ASIN, the current price, and the new price. '
         + 'For bulk, attach a spreadsheet, or share a Drive link.',
    guideUrl: '/guidelines/price-update-guideline.pdf',
    hasAttachments: true,
    hideDescription: true,
  },
  {
    value: 'inventory_update', label: 'Inventory update', hint: 'Update stock quantity',
    descriptionRequired: false, needsEcommerceAccount: 'optional',
    fields: [
      { key: 'update_type', label: 'Single or bulk?', type: 'select', required: true, slot: 'early',
        options: [
          { value: 'single', label: 'Single product' },
          { value: 'bulk',    label: 'Bulk (multiple products)' },
        ] },
      { key: 'drive_link', label: 'Spreadsheet / Drive link', type: 'text', required: false, slot: 'early',
        placeholder: 'Google Sheet or Drive link (optional if you\'re uploading a file below)',
        showIf: { key: 'update_type', equals: 'bulk' } },
      { key: 'sku', label: 'SKU', type: 'text', required: true,
        showIf: { key: 'update_type', equals: 'single' } },
      { key: 'asin', label: 'ASIN', type: 'text', required: false,
        showIf: { key: 'update_type', equals: 'single' } },
      { key: 'note', label: 'Note', type: 'textarea', required: true, slot: 'late',
        placeholder: 'Current quantity, new quantity, and when it should take effect' },
    ],
    guide: 'For a single product, tell us the SKU/ASIN. For bulk, attach a spreadsheet, or share a Drive link. '
         + 'In the note, tell us the current quantity, new quantity and when it should take effect.',
    guideUrl: '/guidelines/inventory-update-guideline.pdf',
    hasAttachments: true,
    hideDescription: true,
  },
  {
    value: 'ads_campaign', label: 'Ads & campaign', hint: 'Launch or change an ad campaign',
    descriptionRequired: true, needsEcommerceAccount: 'optional',
    fields: [],
    descriptionLabel: 'Describe your work',
  },
  {
    value: 'shipment', label: 'Shipment', hint: 'New shipment, a change, or a new warehouse',
    descriptionRequired: true, needsEcommerceAccount: 'optional',
    fields: [
      { key: 'shipment_type', label: 'What do you need?', type: 'select', required: true,
        options: [
          { value: 'new_shipment',    label: 'Create a new shipment' },
          { value: 'change_existing', label: 'Change in an existing shipment' },
          { value: 'new_warehouse',   label: 'Add / upgrade a warehouse' },
        ] },
      { key: 'existing_shipment_detail', label: 'Existing shipment detail', type: 'textarea', required: false,
        placeholder: 'Shipment ID, order / tracking number, carrier, etc.',
        showIf: { key: 'shipment_type', equals: 'change_existing' } },
      { key: 'changes_required', label: 'Changes required', type: 'textarea', required: false,
        placeholder: 'What needs to change on this shipment',
        showIf: { key: 'shipment_type', equals: 'change_existing' } },
      { key: 'state', label: 'State', type: 'text', required: false,
        placeholder: 'State the new warehouse is in',
        showIf: { key: 'shipment_type', equals: 'new_warehouse' } },
      { key: 'gst_id', label: 'GST ID (GSTIN)', type: 'text', required: false,
        showIf: { key: 'shipment_type', equals: 'new_warehouse' } },
      { key: 'gst_password', label: 'GST portal password', type: 'password', required: false,
        showIf: { key: 'shipment_type', equals: 'new_warehouse' } },
    ],
    fileFields: [
      { key: 'noc_gst', label: 'Generated NOC / GST upload', showIf: { key: 'shipment_type', equals: 'new_warehouse' } },
      { key: 'gst_certificate', label: 'Updated GST certificate', showIf: { key: 'shipment_type', equals: 'new_warehouse' } },
    ],
    hasAttachments: true,
    hideAttachmentsIf: { key: 'shipment_type', equals: 'new_warehouse' },
  },
  {
    value: 'complaint', label: 'Complaint', hint: 'Raise a complaint',
    descriptionRequired: false, needsEcommerceAccount: 'optional',
    fields: [
      { key: 'complaint_type', label: 'This complaint is about', type: 'select', required: true,
        options: [
          { value: 'platform',    label: 'Platform' },
          { value: 'team_member', label: 'Team member' },
        ] },
    ],
    descriptionRequiredIf: { key: 'complaint_type', equals: 'team_member' },
  },
  {
    value: 'new_expansion', label: 'New expansion', hint: 'Expand to a new platform, country or account',
    descriptionRequired: false, needsEcommerceAccount: 'hidden',
    fields: [
      { key: 'platform_id', label: 'Platform', type: 'platform', required: true },
      { key: 'note', label: 'Note', type: 'textarea', required: true, slot: 'late',
        placeholder: 'What you want to expand into, and any details we should know' },
    ],
    hideDescription: true,
  },
  {
    value: 'report', label: 'Report', hint: 'Request a performance report',
    descriptionRequired: true, needsEcommerceAccount: 'hidden',
    needsEcommerceAccountIf: { key: 'report_scope', equals: 'platform', mode: 'required' },
    fields: [
      { key: 'report_scope', label: 'Platform', type: 'select', required: true,
        options: [
          { value: 'platform', label: 'A specific platform' },
          { value: 'all',      label: 'All platforms' },
        ] },
      { key: 'report_type', label: 'Report type', type: 'select', required: true,
        options: [
          { value: 'sales',               label: 'Sales report' },
          { value: 'product_wise',        label: 'Product wise report' },
          { value: 'campaign_level',      label: 'Campaign level report' },
          { value: 'warehouse_inventory', label: 'Warehouse inventory report' },
        ] },
      { key: 'duration', label: 'Duration', type: 'select', required: true,
        options: [
          { value: 'last_7_days',  label: 'Last 7 days' },
          { value: 'last_30_days', label: 'Last 30 days' },
          { value: 'last_quarter', label: 'Last 3 months' },
          { value: 'custom',       label: 'Custom range' },
        ] },
      { key: 'date_from', label: 'From', type: 'date', required: false,
        showIf: { key: 'duration', equals: 'custom' } },
      { key: 'date_to', label: 'To', type: 'date', required: false,
        showIf: { key: 'duration', equals: 'custom' } },
    ],
  },
  {
    value: 'other', label: 'Other', hint: 'Anything else',
    descriptionRequired: true, needsEcommerceAccount: 'hidden',
    fields: [],
    hidePriority: true, hideUrgent: true,
  },
]

export const TICKET_CATEGORY_BY_VALUE = Object.fromEntries(TICKET_CATEGORIES.map(c => [c.value, c])) as
  Record<TicketCategory, TicketCategoryDef>

export const TICKET_CATEGORY_LABELS = Object.fromEntries(TICKET_CATEGORIES.map(c => [c.value, c.label])) as
  Record<TicketCategory, string>
