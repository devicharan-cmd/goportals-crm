'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Calendar, Camera, ImagePlus, Loader2, MapPin, Trash2, Upload } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Alert, Field } from '@/components/ui/primitives'
import { Modal } from '@/components/ui/modal'
import { AddressPicker, type AddressValue } from '@/components/shared/AddressPicker'
import { errorMessage, formatDate } from '@/lib/utils'
import type { Client } from '@/types/database'

/**
 * Client edits their own basic details + address only. Platform/service/price are
 * admin-only — this form never touches them, and the DB (guard_client_update, 017)
 * rejects any other column even if someone tried.
 */
const PROFILE_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const PROFILE_IMAGE_MAX_BYTES = 5 * 1024 * 1024
const PROFILE_IMAGE_BUCKET = 'client-profile-images'

export function PortalProfileForm({ client, imageUrl }: { client: Client; imageUrl?: string | null }) {
  const router = useRouter()
  const [form, setForm] = useState({
    company_name:        client.company_name,
    gstin:                client.gstin ?? '',
    contact_name:         client.contact_name ?? '',
    contact_email:        client.contact_email ?? '',
    contact_phone:        client.contact_phone ?? '',
    whatsapp_group_link:  client.whatsapp_group_link ?? '',
  })
  const [address, setAddress] = useState<AddressValue>({
    address_line: client.address_line ?? '', city: client.city ?? '', state: client.state ?? '',
    postal_code: client.postal_code ?? '', country: client.country ?? 'India',
    latitude: client.latitude, longitude: client.longitude, place_id: client.place_id, address_source: client.address_source,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [imageBusy, setImageBusy] = useState(false)
  const [imageError, setImageError] = useState('')
  const [currentImage, setCurrentImage] = useState<string | null>(imageUrl ?? null)
  const [selectedImage, setSelectedImage] = useState<File | null>(null)
  const [selectedImagePreview, setSelectedImagePreview] = useState<string | null>(null)
  const [imageDialogOpen, setImageDialogOpen] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  // After router.refresh() the server sends a fresh signed URL — use it.
  useEffect(() => { setCurrentImage(imageUrl ?? null) }, [imageUrl])

  useEffect(() => {
    if (!selectedImage) { setSelectedImagePreview(null); return }
    const url = URL.createObjectURL(selectedImage)
    setSelectedImagePreview(url)
    return () => URL.revokeObjectURL(url)
  }, [selectedImage])

  function openImageDialog() {
    setImageError('')
    setSelectedImage(null)
    setImageDialogOpen(true)
  }

  function selectLogo(file?: File) {
    setImageError('')
    setSelectedImage(null)
    if (!file) return
    if (!PROFILE_IMAGE_TYPES.includes(file.type)) return setImageError('Choose a PNG, JPG, or WebP image.')
    if (file.size > PROFILE_IMAGE_MAX_BYTES) return setImageError('Image must be 5 MB or smaller.')
    setSelectedImage(file)
  }

  // The user confirms the selected file in the dialog before replacing the logo.
  async function uploadLogo() {
    if (!selectedImage || imageBusy) return
    setImageBusy(true)
    const supabase = createClient()
    // Keep one deterministic Storage object per client. Re-uploading replaces
    // that object's bytes instead of accumulating a new object per upload.
    const path = `${client.id}/company-profile`
    const oldPath = client.company_profile_image_path
    const { error: uploadError } = await supabase.storage.from(PROFILE_IMAGE_BUCKET).upload(path, selectedImage, {
      contentType: selectedImage.type, cacheControl: '0', upsert: true,
    })
    if (uploadError) {
      setImageBusy(false)
      return setImageError(uploadError.message.toLowerCase().includes('bucket not found')
        ? 'Logo storage is not configured for this Supabase project. Apply migration 059_client_company_profile_image.sql, then try again.'
        : errorMessage(uploadError))
    }
    const { error } = await supabase.from('clients').update({ company_profile_image_path: path }).eq('id', client.id)
    if (error) {
      // Only remove the upload if the database doesn't already point at it.
      if (path !== oldPath) await supabase.storage.from(PROFILE_IMAGE_BUCKET).remove([path])
      setImageBusy(false)
      return setImageError(errorMessage(error))
    }
    if (oldPath && oldPath !== path) await supabase.storage.from(PROFILE_IMAGE_BUCKET).remove([oldPath])
    setCurrentImage(URL.createObjectURL(selectedImage))
    setSelectedImage(null)
    setImageDialogOpen(false)
    setImageBusy(false)
    router.refresh()
  }

  function cancelLogoUpload() {
    if (imageBusy) return
    setImageDialogOpen(false)
    setSelectedImage(null)
    setImageError('')
  }

  async function removeLogo() {
    if (imageBusy) return
    setImageError('')
    setImageBusy(true)
    const supabase = createClient()
    const { error } = await supabase.from('clients').update({ company_profile_image_path: null }).eq('id', client.id)
    if (error) {
      setImageBusy(false)
      return setImageError(errorMessage(error))
    }
    if (client.company_profile_image_path) await supabase.storage.from(PROFILE_IMAGE_BUCKET).remove([client.company_profile_image_path])
    setCurrentImage(null)
    setImageBusy(false)
    setImageDialogOpen(false)
    router.refresh()
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSaved(false)
    const supabase = createClient()
    const updates: Partial<Client> = {
      company_name:        form.company_name.trim(),
      gstin:                form.gstin.trim() || null,
      contact_name:         form.contact_name.trim() || null,
      contact_email:        form.contact_email.trim() || null,
      contact_phone:        form.contact_phone.trim() || null,
      whatsapp_group_link:  form.whatsapp_group_link.trim() || null,
      address_line: address.address_line.trim() || null,
      city: address.city.trim() || null,
      state: address.state.trim() || null,
      postal_code: address.postal_code.trim() || null,
      country: address.country.trim() || null,
      latitude: address.latitude,
      longitude: address.longitude,
      place_id: address.place_id,
      address_source: address.address_source,
    }
    const { error } = await supabase.from('clients').update(updates).eq('id', client.id)
    setSaving(false)
    if (error) return setError(errorMessage(error))
    setSaved(true)
    router.refresh()
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
      <section className="card self-start overflow-visible" aria-labelledby="brand-logo-title">
        {/* Brand banner with the logo circle overlapping its bottom edge */}
        <div className="h-24 rounded-t-xl bg-gradient-to-br from-brand-500 via-brand-700 to-brand-900" />
        <div className="-mt-14 flex flex-col items-center px-5 pb-6 text-center">
            <div className="relative">
            <button type="button" disabled={imageBusy}
                    onClick={openImageDialog}
                    aria-label={currentImage ? 'Change company logo' : 'Add company logo'}
                    className="group relative flex h-28 w-28 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-brand-500 to-brand-900 text-4xl font-bold text-white shadow-lg ring-4 ring-white transition focus:outline-none focus-visible:ring-brand-200">
              {currentImage
                ? <img src={currentImage} alt={`${form.company_name} logo`} className="h-full w-full object-cover" />
                : form.company_name.trim().charAt(0).toUpperCase() || '?'}
              <span className="absolute inset-0 flex items-center justify-center bg-slate-900/35 opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
                <Camera className="h-7 w-7 text-white" />
              </span>
              {imageBusy && (
                <span className="absolute inset-0 flex items-center justify-center bg-slate-900/50">
                  <Loader2 className="h-6 w-6 animate-spin text-white" />
                </span>
              )}
            </button>

            <button type="button" disabled={imageBusy} onClick={openImageDialog}
                    aria-label={currentImage ? 'Replace company logo' : 'Upload company logo'}
                    className="absolute bottom-0 right-0 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-lime-500 text-white shadow-md ring-2 ring-white transition hover:bg-lime-600 disabled:opacity-50">
              <Camera className="h-4 w-4" />
            </button>

            <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" tabIndex={-1}
                   onChange={e => { selectLogo(e.target.files?.[0]); e.currentTarget.value = '' }} />
          </div>

          <h2 id="brand-logo-title" className="mt-4 w-full break-words text-xl font-bold leading-tight text-slate-900">
            {form.company_name.trim() || 'Your company'}
          </h2>
          {form.contact_name.trim() && <p className="mt-1 text-sm text-slate-500">{form.contact_name.trim()}</p>}
          {imageError && !imageDialogOpen && <p role="alert" className="mt-2 text-xs text-red-600">{imageError}</p>}

          <div className="mt-5 w-full space-y-2 border-t border-slate-100 pt-4 text-center text-xs text-slate-500">
            {(address.city.trim() || address.state.trim()) && (
              <p className="flex items-center justify-center gap-2">
                <MapPin className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
                <span className="truncate">{[address.city.trim(), address.state.trim()].filter(Boolean).join(', ')}</span>
              </p>
            )}
            <p className="flex items-center justify-center gap-2">
              <Calendar className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
              <span>Client since {formatDate(client.approved_at ?? client.created_at)}</span>
            </p>
          </div>
        </div>
      </section>

      <form onSubmit={submit} className="card min-w-0 space-y-6 p-5 sm:p-6">
        {error && <Alert>{error}</Alert>}
        {saved && <Alert tone="success">Saved.</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Company / brand name" required className="sm:col-span-2">
            <input className="input" required value={form.company_name} onChange={e => setForm({ ...form, company_name: e.target.value })} />
          </Field>
          <Field label="Contact name"><input className="input" value={form.contact_name} onChange={e => setForm({ ...form, contact_name: e.target.value })} /></Field>
          <Field label="Contact email"><input className="input" type="email" value={form.contact_email} onChange={e => setForm({ ...form, contact_email: e.target.value })} /></Field>
          <Field label="Phone"><input className="input" value={form.contact_phone} onChange={e => setForm({ ...form, contact_phone: e.target.value })} /></Field>
          <Field label="GSTIN"><input className="input uppercase" value={form.gstin} onChange={e => setForm({ ...form, gstin: e.target.value })} /></Field>
          <Field label="WhatsApp group link" className="sm:col-span-2"><input className="input" value={form.whatsapp_group_link} onChange={e => setForm({ ...form, whatsapp_group_link: e.target.value })} /></Field>
        </div>

        <div className="border-t border-slate-100 pt-5">
          <p className="mb-3 text-sm font-semibold text-slate-800">Business address</p>
          <AddressPicker value={address} onChange={setAddress} />
        </div>

        <p className="text-xs text-slate-400">
          Platforms, services and pricing are set by your GoPortals account manager and can't be changed here.
        </p>

        <div className="flex justify-end border-t border-slate-100 pt-5">
          <Button type="submit" loading={saving}>Save changes</Button>
        </div>
      </form>

      <Modal
        open={imageDialogOpen}
        onClose={cancelLogoUpload}
        title={currentImage ? 'Update company logo' : 'Add company logo'}
        titleClassName="text-lg"
      >
        <div className="space-y-5">
          <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 sm:flex-row">
            <div className="flex h-24 w-24 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-brand-500 to-brand-900 text-3xl font-bold text-white ring-4 ring-white">
              {selectedImagePreview
                ? <img src={selectedImagePreview} alt="Selected company logo preview" className="h-full w-full object-cover" />
                : form.company_name.trim().charAt(0).toUpperCase() || '?' }
            </div>
            <div className="min-w-0 text-center sm:text-left">
              <p className="break-all font-medium text-slate-900">{selectedImage?.name ?? 'No image selected'}</p>
              <p className="mt-1 text-[11px] leading-4 text-slate-500">{selectedImage ? `${(selectedImage.size / 1024 / 1024).toFixed(2)} MB` : 'PNG, JPG, or WebP · Max 5 MB'}</p>
              <Button type="button" variant="secondary" className="mt-3" onClick={() => fileInput.current?.click()} disabled={imageBusy}>
                <ImagePlus className="mr-2 h-4 w-4" /> Choose image
              </Button>
            </div>
          </div>
          {imageError && <Alert>{imageError}</Alert>}
          <div className="flex justify-end gap-2">
            {currentImage && !selectedImage && (
              <Button type="button" variant="ghost" className="mr-auto text-red-600 hover:bg-red-50 hover:text-red-700" onClick={removeLogo} loading={imageBusy}>
                <Trash2 className="mr-2 h-4 w-4" /> Remove logo
              </Button>
            )}
            <Button type="button" variant="secondary" onClick={cancelLogoUpload} disabled={imageBusy}>Cancel</Button>
            <Button type="button" onClick={uploadLogo} loading={imageBusy} disabled={!selectedImage || imageBusy}>
              {!imageBusy && <Upload className="mr-2 h-4 w-4" />} Upload logo
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
