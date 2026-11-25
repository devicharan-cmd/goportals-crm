'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import {
  Check, ImagePlus, Lock, Mail, Pencil, Phone, Trash2, Upload, Loader2, ChevronDown, Search
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { ACCOUNT_STATUS_STYLES, ROLE_LABELS } from '@/lib/constants'
import { Alert, Avatar } from '@/components/ui/primitives'
import { Button } from '@/components/ui/button'
import { cn, errorMessage, formatDate } from '@/lib/utils'
import { Modal } from '@/components/ui/modal'
import { ProfileImageControl } from '@/components/shared/ProfileImageControl'
import { SearchableSelect } from '@/components/shared/SearchableSelect'
import { InternationalPhoneField } from '@/components/shared/InternationalPhoneField'
import { TimezoneSelect } from '@/components/shared/TimezoneSelect'
import { validateMobilePhone, isValidTimeZone } from '@/lib/contact'
import { showSuccessToast } from '@/lib/ui-toast'
import type { AccountStatus, AppRole, Department, Profile, StaffRole } from '@/types/database'
import { useSingleFlight } from '@/components/shared/useSingleFlight'

const PROFILE_IMAGE_BUCKET = 'staff-profile-images'
const PROFILE_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const PROFILE_IMAGE_MAX_BYTES = 5 * 1024 * 1024

function ReportingPersonSelect({
  people,
  value,
  onChange,
  disabled,
  invalid,
}: {
  people: { id: string; full_name: string; email: string; role: AppRole; status: string; avatar_url?: string | null }[]
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  invalid?: boolean
}) {
  const selectId = useId()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const selected = people.find(person => person.id === value)
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return query
      ? people.filter(person => `${person.full_name} ${person.email}`.toLowerCase().includes(query))
      : people
  }, [people, search])

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    return () => document.removeEventListener('mousedown', closeOnOutsideClick)
  }, [])

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        role="combobox"
        aria-label="Reporting To"
        aria-controls={`${selectId}-options`}
        aria-expanded={open}
        aria-haspopup="listbox"
        disabled={disabled}
        onClick={() => setOpen(current => !current)}
        className={cn(
          'flex h-[42px] w-full items-center gap-2 rounded-xl border bg-white px-3.5 text-sm text-slate-900 shadow-sm transition focus:border-[#0A6F94] focus:outline-none disabled:bg-slate-50 disabled:text-slate-500',
          invalid ? 'border-red-500 focus:border-red-500' : 'border-slate-200'
        )}
        aria-invalid={invalid}
      >
        {selected ? (
          <>
            <Avatar name={selected.full_name || selected.email} src={selected.avatar_url} role={selected.role} size="xs" className="h-7 w-7 text-xs" />
            <span className="min-w-0 flex-1 truncate text-left">{selected.full_name || selected.email}</span>
          </>
        ) : (
          <span className="flex-1 text-left text-slate-500">Select Reporting To</span>
        )}
        <ChevronDown className={cn('h-4 w-4 flex-shrink-0 text-slate-400 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
          <div className="relative mb-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Search team members..."
              className="h-9 w-full rounded-lg border border-slate-200 pl-8 pr-3 text-sm outline-none focus:border-[#0A6F94]"
            />
          </div>
          <div id={`${selectId}-options`} role="listbox" aria-label="Reporting people" className="max-h-52 overflow-y-auto">
            {filtered.map(person => (
              <button
                key={person.id}
                type="button"
                onClick={() => { onChange(person.id); setOpen(false); setSearch('') }}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-slate-50"
              >
                <Avatar name={person.full_name || person.email} src={person.avatar_url} role={person.role} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-800">{person.full_name || person.email}</span>
                  <span className="block truncate text-xs text-slate-500">{ROLE_LABELS[person.role]}</span>
                </span>
              </button>
            ))}
            {filtered.length === 0 && <div className="px-3 py-4 text-center text-sm text-slate-500">No team members found.</div>}
          </div>
        </div>
      )}
    </div>
  )
}

interface StaffProfileSettingsProps {
  profile: Profile
  initialAddress: { current_address: string | null; permanent_address: string | null }
  departments: Department[]
  initialDepartmentIds: string[]
  actorRole: AppRole
  actorId?: string
  isOwnProfile?: boolean
  reportingPeople?: { id: string; full_name: string; email: string; role: AppRole; status: string; avatar_url?: string | null }[]
  directReports?: { id: string; role: AppRole }[]
}

export function StaffProfileSettings({
  profile,
  initialAddress,
  departments,
  initialDepartmentIds,
  actorRole,
  actorId,
  isOwnProfile = true,
  reportingPeople = [],
  directReports = [],
}: StaffProfileSettingsProps) {
  const router = useRouter()
  const runOnce = useSingleFlight()
  const isSuperAdmin = actorRole === 'super_admin'
  const canEditProfile = isOwnProfile || isSuperAdmin || actorRole === 'manager'
  const canChangeRole = isSuperAdmin && !isOwnProfile && profile.role !== 'super_admin'
  const canChangeStatus = isSuperAdmin && !isOwnProfile && actorId !== profile.id
    && (profile.status === 'active' || profile.status === 'suspended')

  // View vs Edit mode state (defaults to uneditable view mode)
  const [isEditing, setIsEditing] = useState(false)

  // Form state
  const [fullName, setFullName] = useState(profile.full_name || '')
  const [email, setEmail] = useState(profile.email)
  const [phone, setPhone] = useState(profile.phone || '')
  const [timezone, setTimezone] = useState(profile.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata')
  const [currentAddress, setCurrentAddress] = useState(initialAddress.current_address || '')
  const [permanentAddress, setPermanentAddress] = useState(initialAddress.permanent_address || '')
  const [jobTitle, setJobTitle] = useState(profile.job_title || '')
  const [role, setRole] = useState<AppRole>(profile.role)
  const [employmentStatus, setEmploymentStatus] = useState<AccountStatus>(profile.status)
  useEffect(() => {
    if (!isEditing) setEmploymentStatus(profile.status)
  }, [profile.status, isEditing])
  const [reportingTo, setReportingTo] = useState(profile.reporting_to || '')
  const [weeklyCapacity, setWeeklyCapacity] = useState<string>(
    profile.weekly_capacity_hours != null ? String(profile.weekly_capacity_hours) : '40'
  )
  const [selectedDeptIds, setSelectedDeptIds] = useState<string[]>(initialDepartmentIds)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [emailError, setEmailError] = useState('')
  const [phoneError, setPhoneError] = useState('')
  const [timezoneError, setTimezoneError] = useState('')
  const [jobTitleError, setJobTitleError] = useState('')
  const [roleError, setRoleError] = useState('')
  const [reportingToError, setReportingToError] = useState('')
  const [capacityError, setCapacityError] = useState('')
  const [promotionBlockedIds, setPromotionBlockedIds] = useState<string[]>([])
  const [promotionBlocked, setPromotionBlocked] = useState(false)
  const [currentImage, setCurrentImage] = useState<string | null>(profile.avatar_url)
  const [imageLoadFailed, setImageLoadFailed] = useState(false)
  const [selectedImage, setSelectedImage] = useState<File | null>(null)
  const [selectedImagePreview, setSelectedImagePreview] = useState<string | null>(null)
  const [imageBusy, setImageBusy] = useState(false)
  const [imageError, setImageError] = useState('')
  const [imageDialogOpen, setImageDialogOpen] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const updateProfileButton = useRef<HTMLButtonElement>(null)


  useEffect(() => { setCurrentImage(profile.avatar_url) }, [profile.avatar_url])
  useEffect(() => { setImageLoadFailed(false) }, [currentImage])

  useEffect(() => {
    if (!selectedImage) { setSelectedImagePreview(null); return }
    const url = URL.createObjectURL(selectedImage)
    setSelectedImagePreview(url)
    return () => URL.revokeObjectURL(url)
  }, [selectedImage])

  function getStoredImagePath(url: string | null) {
    if (!url) return null
    try {
      const path = new URL(url).pathname
      const prefix = `/storage/v1/object/public/${PROFILE_IMAGE_BUCKET}/`
      if (!path.includes(prefix)) return null
      const storagePath = decodeURIComponent(path.slice(path.indexOf(prefix) + prefix.length))
      return storagePath.startsWith(`${profile.id}/`) ? storagePath : null
    } catch {
      return null
    }
  }

  function openImageDialog() {
    setImageError('')
    setSelectedImage(null)
    setImageDialogOpen(true)
  }

  function handleProfileImageClick() {
    if (isEditing) {
      openImageDialog()
      return
    }
    updateProfileButton.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    updateProfileButton.current?.focus()
  }

  function selectImage(file?: File) {
    setImageError('')
    setSelectedImage(null)
    if (!file) return
    if (!PROFILE_IMAGE_TYPES.includes(file.type)) return setImageError('Choose a PNG, JPG, or WebP image.')
    if (file.size > PROFILE_IMAGE_MAX_BYTES) return setImageError('Image must be 5 MB or smaller.')
    setSelectedImage(file)
  }

  async function uploadImage() {
    if (!selectedImage || imageBusy) return
    setImageBusy(true)
    setImageError('')
    if (!isOwnProfile) {
      try {
        const payload = new FormData()
        payload.set('file', selectedImage)
        const response = await fetch(`/api/admin/users/${profile.id}/photo`, { method: 'POST', body: payload })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Could not update the profile photo.')
        setCurrentImage(result.avatar_url)
        setSelectedImage(null)
        setImageDialogOpen(false)
        setImageError(result.warning || '')
        router.refresh()
      } catch (uploadError) {
        setImageError(errorMessage(uploadError))
      } finally {
        setImageBusy(false)
      }
      return
    }
    const supabase = createClient()
    const extension = selectedImage.type === 'image/jpeg' ? 'jpg' : selectedImage.type === 'image/png' ? 'png' : 'webp'
    const path = `${profile.id}/${crypto.randomUUID()}.${extension}`
    const { error: uploadError } = await supabase.storage.from(PROFILE_IMAGE_BUCKET).upload(path, selectedImage, {
      contentType: selectedImage.type, cacheControl: '0',
    })
    if (uploadError) {
      setImageBusy(false)
      return setImageError(uploadError.message.toLowerCase().includes('bucket not found')
        ? 'Photo storage is not configured. Apply migration 083_staff_profile_images.sql, then try again.'
        : errorMessage(uploadError))
    }

    const imageUrl = supabase.storage.from(PROFILE_IMAGE_BUCKET).getPublicUrl(path).data.publicUrl
    const { error: updateError } = await supabase.from('profiles').update({ avatar_url: imageUrl }).eq('id', profile.id)
    if (updateError) {
      const { error: cleanupError } = await supabase.storage.from(PROFILE_IMAGE_BUCKET).remove([path])
      setImageBusy(false)
      return setImageError(cleanupError
        ? `${errorMessage(updateError)} The uploaded image could not be cleaned up: ${errorMessage(cleanupError)}`
        : errorMessage(updateError))
    }

    const oldPath = getStoredImagePath(currentImage)
    let cleanupMessage = ''
    if (oldPath) {
      const { error: cleanupError } = await supabase.storage.from(PROFILE_IMAGE_BUCKET).remove([oldPath])
      if (cleanupError) cleanupMessage = `Photo updated, but the previous image could not be removed: ${errorMessage(cleanupError)}`
    }
    setCurrentImage(imageUrl)
    window.dispatchEvent(new CustomEvent('gp:profile-avatar-change', { detail: imageUrl }))
    setSelectedImage(null)
    setImageDialogOpen(false)
    setImageBusy(false)
    setImageError(cleanupMessage)
    router.refresh()
  }

  async function removeImage() {
    if (imageBusy) return
    setImageBusy(true)
    setImageError('')
    if (!isOwnProfile) {
      try {
        const response = await fetch(`/api/admin/users/${profile.id}/photo`, { method: 'DELETE' })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Could not remove the profile photo.')
        setCurrentImage(null)
        setImageDialogOpen(false)
        setImageError(result.warning || '')
        router.refresh()
      } catch (removeError) {
        setImageError(errorMessage(removeError))
      } finally {
        setImageBusy(false)
      }
      return
    }
    const supabase = createClient()
    const { error: updateError } = await supabase.from('profiles').update({ avatar_url: null }).eq('id', profile.id)
    if (updateError) {
      setImageBusy(false)
      return setImageError(errorMessage(updateError))
    }
    const oldPath = getStoredImagePath(currentImage)
    let cleanupMessage = ''
    if (oldPath) {
      const { error: cleanupError } = await supabase.storage.from(PROFILE_IMAGE_BUCKET).remove([oldPath])
      if (cleanupError) cleanupMessage = `Photo removed, but the stored image could not be deleted: ${errorMessage(cleanupError)}`
    }
    setCurrentImage(null)
    window.dispatchEvent(new CustomEvent('gp:profile-avatar-change', { detail: null }))
    setImageDialogOpen(false)
    setImageBusy(false)
    setImageError(cleanupMessage)
    router.refresh()
  }

  function cancelImageDialog() {
    if (imageBusy) return
    setImageDialogOpen(false)
    setSelectedImage(null)
    setImageError('')
  }

  function handleDiscard() {
    setFullName(profile.full_name || '')
    setEmail(profile.email)
    setPhone(profile.phone || '')
    setTimezone(profile.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata')
    setCurrentAddress(initialAddress.current_address || '')
    setPermanentAddress(initialAddress.permanent_address || '')
    setJobTitle(profile.job_title || '')
    setRole(profile.role)
    setEmploymentStatus(profile.status)
    setReportingTo(profile.reporting_to || '')
    setWeeklyCapacity(profile.weekly_capacity_hours != null ? String(profile.weekly_capacity_hours) : '40')
    setSelectedDeptIds(initialDepartmentIds)
    setError('')
    setEmailError('')
    setPhoneError('')
    setTimezoneError('')
    setJobTitleError('')
    setRoleError('')
    setPromotionBlockedIds([])
    setPromotionBlocked(false)
    setReportingToError('')
    setCapacityError('')
    setIsEditing(false)
  }

  function toggleDepartment(deptId: string) {
    if (!isSuperAdmin || !isEditing) return
    setSelectedDeptIds(prev =>
      prev.includes(deptId) ? prev.filter(id => id !== deptId) : [...prev, deptId]
    )
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    setEmailError('')
    setPhoneError('')
    setTimezoneError('')
    setJobTitleError('')
    setRoleError('')
    setPromotionBlockedIds([])
    setPromotionBlocked(false)
    setReportingToError('')
    setCapacityError('')
    const normalizedEmail = email.trim().toLowerCase()
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      setSaving(false)
      setEmailError('Enter a valid email address.')
      return
    }
    if (!jobTitle.trim()) {
      setSaving(false)
      setJobTitleError('Job title is required.')
      return
    }
    const phoneValidationError = validateMobilePhone(phone)
    if (phoneValidationError) {
      setSaving(false)
      setPhoneError(phoneValidationError)
      return
    }
    if (!isValidTimeZone(timezone)) {
      setSaving(false)
      setTimezoneError('Select a valid timezone.')
      return
    }
    if (!role) {
      setSaving(false)
      setRoleError('Select a role.')
      return
    }
    if (role !== 'super_admin' && !reportingTo) {
      setSaving(false)
      setReportingToError('Select a Reporting To person.')
      return
    }
    const capacity = Number(weeklyCapacity)
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 168) {
      setSaving(false)
      setCapacityError('Weekly capacity must be between 1 and 168 hours.')
      return
    }

    try {
      const emailChanged = normalizedEmail !== profile.email.trim().toLowerCase()
      if (!isOwnProfile || (isSuperAdmin && emailChanged)) {
        const response = await fetch(`/api/admin/users/${profile.id}/profile`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            full_name: fullName.trim(),
            email: normalizedEmail,
            phone: phone.trim() || null,
            timezone,
            current_address: currentAddress.trim() || null,
            permanent_address: permanentAddress.trim() || null,
            job_title: jobTitle.trim() || null,
            role,
            reporting_to: role === 'super_admin' ? null : reportingTo,
            weekly_capacity_hours: Number(weeklyCapacity),
            status: employmentStatus,
            department_ids: selectedDeptIds,
          }),
        })
        const responseText = await response.text()
        let result: { error?: string } = {}
        if (responseText) {
          try {
            result = JSON.parse(responseText)
          } catch {
            throw new Error('The server could not process this update. Please try again.')
          }
        }
        if (!response.ok) throw new Error(result.error || 'Could not update the staff profile.')
        setIsEditing(false)
        showSuccessToast('Profile updated successfully')
        router.refresh()
        return
      }

      const supabase = createClient()

      // Base fields any staff can update on their own row
      const updates: Record<string, unknown> = {
        full_name: fullName.trim(),
        phone: phone.trim() || null,
        timezone,
        updated_at: new Date().toISOString(),
      }

      // A Super Admin may update their own job title and capacity, but not their role.
      if (isSuperAdmin) {
        updates.job_title = jobTitle.trim() || null
        updates.weekly_capacity_hours = weeklyCapacity ? parseInt(weeklyCapacity, 10) : 40
      }

      const { error: profileError } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', profile.id)

      if (profileError) throw profileError

      const { error: detailsError } = await supabase.from('staff_profile_details').upsert({
        profile_id: profile.id,
        current_address: currentAddress.trim() || null,
        permanent_address: permanentAddress.trim() || null,
      })
      if (detailsError) throw detailsError

      // Update departments if actor is super admin
      if (isSuperAdmin) {
        const added = selectedDeptIds.filter(id => !initialDepartmentIds.includes(id))
        const removed = initialDepartmentIds.filter(id => !selectedDeptIds.includes(id))

        if (removed.length > 0) {
          const { error: remErr } = await supabase
            .from('department_members')
            .delete()
            .eq('profile_id', profile.id)
            .in('department_id', removed)
          if (remErr) throw remErr
        }

        if (added.length > 0) {
          const isLead = role === 'team_lead'
          const newRows = added.map(deptId => ({
            department_id: deptId,
            profile_id: profile.id,
            is_lead: isLead,
          }))
          const { error: addErr } = await supabase
            .from('department_members')
            .insert(newRows)
          if (addErr) throw addErr
        }
      }

      // After updating, lock fields back to uneditable mode
      setIsEditing(false)
      showSuccessToast('Profile updated successfully')
      router.refresh()
    } catch (err: unknown) {
      const message = errorMessage(err)
      if (/email/i.test(message)) setEmailError(message)
      else if (/mobile number|phone/i.test(message)) setPhoneError(message)
      else if (/timezone/i.test(message)) setTimezoneError(message)
      else if (/job title/i.test(message)) setJobTitleError(message)
      else if (/reporting (to|poc)/i.test(message)) setReportingToError(message)
      else if (/weekly capacity|capacity/i.test(message)) setCapacityError(message)
      else {
        if (/reassign direct reports/i.test(message)) {
          const childRoleAfterChange: StaffRole | null = role === 'super_admin' ? 'manager'
            : role === 'manager' ? 'team_lead'
              : role === 'team_lead' ? 'employee' : null
          setPromotionBlockedIds(directReports
            .filter(report => employmentStatus !== 'active' || report.role !== childRoleAfterChange)
            .map(report => report.id))
          setPromotionBlocked(true)
          setRoleError(message)
        } else if (!isOwnProfile) setJobTitleError(message)
        else setError(message)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="rounded-xl border border-slate-200/80 bg-white [box-shadow:0_1px_2px_0_rgb(2_43_59_/_0.04),0_1px_3px_0_rgb(2_43_59_/_0.06)] overflow-hidden">
            {/* Card Header */}
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 sm:px-6 sm:py-5">
              <div>
                <h2 className="text-base font-semibold text-slate-900 sm:text-lg">
                  {isOwnProfile
                    ? 'Your profile'
                    : `${profile.role === 'employee' ? 'Employee' : profile.role === 'team_lead' ? 'Team Lead' : profile.role === 'manager' ? 'Manager' : 'Super Admin'} Profile`}
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  How you appear to your team and on tickets, tasks, and communications.
                </p>
              </div>
            </div>

            <div className="space-y-4 p-4 sm:space-y-6 sm:p-10">
              {/* Profile Avatar Header */}
              <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-start sm:gap-5 sm:pb-6">
                <div className="flex min-w-0 flex-1 flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-5">
                  <div className="h-20 w-20 shrink-0 rounded-full sm:h-24 sm:w-24">
                    {canEditProfile ? (
                      <ProfileImageControl
                        busy={imageBusy}
                        onClick={handleProfileImageClick}
                        label={currentImage ? 'Update profile photo' : 'Add profile photo'}
                        className="flex h-20 w-20 items-center justify-center rounded-full shadow-sm sm:h-24 sm:w-24"
                      >
                        {currentImage && !imageLoadFailed ? (
                          <Image
                            src={currentImage}
                            alt={fullName || email}
                            width={512}
                            height={512}
                            sizes="256px"
                            quality={90}
                            unoptimized={currentImage.startsWith('http')}
                            className="h-full w-full rounded-full object-cover"
                            onError={() => setImageLoadFailed(true)}
                          />
                        ) : (
                          <Avatar name={fullName || email} role={role} size="lg" className="h-20 w-20 text-xl sm:h-24 sm:w-24 sm:text-2xl" />
                        )}
                      </ProfileImageControl>
                    ) : (
                      currentImage && !imageLoadFailed ? (
                        <Image
                          src={currentImage}
                          alt={fullName || email}
                          width={512}
                          height={512}
                          sizes="256px"
                          quality={90}
                          unoptimized={currentImage.startsWith('http')}
                          className="h-20 w-20 rounded-full object-cover sm:h-24 sm:w-24"
                          onError={() => setImageLoadFailed(true)}
                        />
                      ) : (
                        <Avatar name={fullName || email} role={role} size="lg" className="h-20 w-20 text-xl sm:h-24 sm:w-24 sm:text-2xl" />
                      )
                    )}
                  </div>

                  <div className="min-w-0 flex-1 text-center sm:text-left">
                    <h3 className="truncate text-xl font-bold text-slate-900 sm:text-2xl">
                      {fullName || email}
                    </h3>
                    <div className="mt-1.5 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                      {jobTitle.trim() && (
                        <span className="text-xs font-semibold text-[#034C68]">{jobTitle.trim()}</span>
                      )}
                      <span className="text-xs text-slate-500">Joined {formatDate(profile.created_at)}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                      <a
                        href={`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex max-w-full items-center gap-1.5 break-all rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs font-medium text-slate-600 transition-colors hover:border-[#63A9C4] hover:text-[#034C68]"
                      >
                        <Mail className="h-3.5 w-3.5 flex-shrink-0" /> {email}
                      </a>
                      {phone.trim() ? (
                        <a href={`tel:${phone.trim().replace(/[^+\d]/g, '')}`} className="inline-flex max-w-full items-center gap-1.5 break-all rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs font-medium text-slate-600 transition-colors hover:border-[#63A9C4] hover:text-[#034C68]">
                          <Phone className="h-3.5 w-3.5 flex-shrink-0" /> {phone}
                        </a>
                      ) : (
                        <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs font-medium text-slate-600">
                          <Phone className="h-3.5 w-3.5 flex-shrink-0" /> --
                        </span>
                      )}
                    </div>
                    {imageError && !imageDialogOpen && <p role="alert" className="field-error">{imageError}</p>}
                  </div>
                </div>
                <span className={cn(
                  'inline-flex shrink-0 items-center gap-1.5 self-center rounded-full px-2.5 py-1 text-xs font-medium sm:self-start',
                  ACCOUNT_STATUS_STYLES[employmentStatus],
                )}>
                  <span className={cn('h-1.5 w-1.5 rounded-full', employmentStatus === 'active' ? 'bg-[#95C12C]' : employmentStatus === 'pending' ? 'bg-amber-500' : employmentStatus === 'rejected' ? 'bg-red-500' : 'bg-slate-400')} />
                  <span className="capitalize">{employmentStatus}</span>
                </span>
              </div>

              {/* Form Fields Grid */}
              <div className="staff-profile-fields grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 sm:gap-y-6">
                {/* Full Name */}
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                    Full name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    disabled={!isEditing || (!isOwnProfile && !isSuperAdmin)}
                    onChange={e => setFullName(e.target.value)}
                    placeholder="Enter your full name"
                    className={cn(
                      'w-full rounded-xl border px-3.5 py-2.5 text-sm transition shadow-sm',
                      isEditing && (isOwnProfile || isSuperAdmin)
                        ? 'border-slate-200 text-slate-900 placeholder-slate-400 focus:border-[#0A6F94] focus:outline-none'
                        : 'border-slate-200 bg-slate-50 text-slate-700 cursor-default'
                    )}
                  />
                </div>

                <div>
                  <label className="mb-1.5 flex items-center justify-between text-sm font-semibold text-slate-700">
                    <span>Email <span className="text-red-500">*</span></span>
                    {(!isSuperAdmin || !isEditing) && !(isOwnProfile && isSuperAdmin) && (
                      <span className="flex items-center gap-1 text-xs font-normal text-slate-400 lowercase">
                        <Lock className="h-3 w-3" /> Managed by Super Admin
                      </span>
                    )}
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    disabled={!isSuperAdmin || !isEditing}
                    onChange={event => {
                      setEmail(event.target.value)
                      if (emailError) setEmailError('')
                    }}
                    aria-invalid={!!emailError}
                    aria-describedby={emailError ? 'profile-email-error' : undefined}
                    className={cn(
                      'w-full rounded-xl border px-3.5 py-2.5 text-sm transition shadow-sm',
                      isSuperAdmin && isEditing
                        ? emailError
                          ? 'border-red-500 text-slate-900 focus:border-red-500 focus:outline-none'
                          : 'border-slate-200 bg-white text-slate-900 focus:border-[#0A6F94] focus:outline-none'
                        : 'border-slate-200 bg-slate-50 text-slate-700 cursor-not-allowed',
                    )}
                  />
                  {emailError && <p id="profile-email-error" role="alert" className="field-error">{emailError}</p>}
                </div>

                {/* Phone */}
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                    Mobile number <span className="text-red-500">*</span>
                  </label>
                  <InternationalPhoneField
                    value={phone}
                    disabled={!isEditing || (!isOwnProfile && !isSuperAdmin)}
                    onChange={value => {
                      setPhone(value)
                      if (phoneError) setPhoneError('')
                    }}
                    invalid={!!phoneError}
                  />
                  {phoneError && (
                    <p role="alert" className="field-error">{phoneError}</p>
                  )}
                </div>

                {/* Job Title */}
                <div>
                  <label className="mb-1.5 flex items-center justify-between text-sm font-semibold text-slate-700">
                    <span>Job title <span className="text-red-500">*</span></span>
                    {!isOwnProfile && (!isSuperAdmin || !isEditing) && (
                      <span className="flex items-center gap-1 text-xs font-normal text-slate-400 lowercase">
                        <Lock className="h-3 w-3" /> Managed by Super Admin
                      </span>
                    )}
                  </label>
                  <input
                    type="text"
                    required
                    value={jobTitle}
                    disabled={!isSuperAdmin || !isEditing}
                    onChange={e => {
                      if (!isSuperAdmin) return
                      setJobTitle(e.target.value)
                      if (jobTitleError) setJobTitleError('')
                    }}
                    placeholder="e.g. Ads Executive, Senior Designer"
                    className={cn(
                      'w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm transition shadow-sm',
                      isSuperAdmin && isEditing
                        ? jobTitleError
                          ? '!border-red-500 text-slate-900 placeholder-slate-400 focus:border-red-500 focus:outline-none'
                          : 'text-slate-900 placeholder-slate-400 focus:border-[#0A6F94] focus:outline-none'
                        : 'bg-slate-50 text-slate-600 cursor-not-allowed'
                    )}
                    aria-invalid={!!jobTitleError}
                  />
                  {jobTitleError && (
                    <p role="alert" className="field-error">{jobTitleError}</p>
                  )}
                </div>

                <div>
                  <label className="mb-1.5 flex items-center justify-between text-sm font-semibold text-slate-700">
                    <span>Role <span className="text-red-500">*</span></span>
                    {(!canChangeRole || !isEditing) && !(isOwnProfile && isSuperAdmin) && (
                      <span className="flex items-center gap-1 text-xs font-normal text-slate-400 lowercase">
                        <Lock className="h-3 w-3" /> Managed by Super Admin
                      </span>
                    )}
                  </label>
                  {canChangeRole && isEditing ? (
                    <SearchableSelect
                      value={role}
                      onChange={e => {
                        const nextRole = e.target.value as AppRole
                        setRole(nextRole)
                        if (roleError) setRoleError('')
                        setPromotionBlocked(false)
                        setPromotionBlockedIds([])
                        // A reporting POC may be any active staff member. Role-based
                        // permissions for task visibility and assignment are enforced
                        // independently of this reporting link.
                        if (nextRole === 'super_admin' || !reportingPeople.some(person =>
                          person.id === reportingTo
                          && person.id !== profile.id
                          && person.status === 'active'
                          && person.role !== 'client'
                        )) {
                          setReportingTo('')
                        }
                      }}
                      aria-invalid={!!roleError}
                      required
                      className={cn(
                        'h-[42px] w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-[#0A6F94] focus:outline-none transition shadow-sm',
                        roleError ? 'border-red-500' : 'border-slate-200'
                      )}
                    >
                      <option value="super_admin">Super Admin</option>
                      <option value="manager">Manager</option>
                      <option value="team_lead">Team Lead</option>
                      <option value="employee">Employee</option>
                    </SearchableSelect>
                  ) : (
                    <div className="flex h-[42px] items-center rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm font-medium text-slate-700">
                      {ROLE_LABELS[role]}
                    </div>
                  )}
                  {roleError && (
                    <p role="alert" className="field-error">{roleError}</p>
                  )}
                  {promotionBlocked && (
                    <Link href={promotionBlockedIds.length
                      ? `/admin/users?tab=change-poc&select=${promotionBlockedIds.join(',')}`
                      : '/admin/users?tab=invites'}
                      className="mt-2 inline-flex text-xs font-semibold text-[#045E80] underline underline-offset-2 hover:text-[#034C68]">
                      {promotionBlockedIds.length ? 'Select these reports and assign a replacement POC' : 'Review incompatible pending invitations'}
                    </Link>
                  )}
                </div>

                <div>
                  <label className="mb-1.5 flex items-center justify-between text-sm font-semibold text-slate-700">
                    <span>Reporting To (POC) {role !== 'super_admin' && <span className="text-red-500">*</span>}</span>
                    {(!canChangeRole || !isEditing) && !(isOwnProfile && isSuperAdmin) && (
                      <span className="flex items-center gap-1 text-xs font-normal text-slate-400 lowercase">
                        <Lock className="h-3 w-3" /> Managed by Super Admin
                      </span>
                    )}
                  </label>
                  {canChangeRole && isEditing && role !== 'super_admin' ? (
                    <ReportingPersonSelect
                      value={reportingTo}
                      onChange={value => {
                        setReportingTo(value)
                        if (reportingToError) setReportingToError('')
                      }}
                      invalid={!!reportingToError}
                      people={reportingPeople.filter(person =>
                        person.id !== profile.id
                        && person.status === 'active'
                        && person.role !== 'client'
                      )}
                    />
                  ) : (
                    <div className="flex h-[42px] items-center rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm font-medium text-slate-700">
                      {(() => {
                        const reportingPerson = reportingPeople.find(person => person.id === reportingTo)
                        return reportingPerson ? (
                          <>
                            <Avatar name={reportingPerson.full_name || reportingPerson.email} src={reportingPerson.avatar_url} role={reportingPerson.role} size="xs" className="mr-2 h-7 w-7 text-xs" />
                            <span className="min-w-0 truncate">{reportingPerson.full_name || reportingPerson.email}</span>
                          </>
                        ) : '--'
                      })()}
                    </div>
                  )}
                  {reportingToError && (
                    <p role="alert" className="field-error">{reportingToError}</p>
                  )}
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                    Timezone <span className="text-red-500">*</span>
                  </label>
                  <TimezoneSelect
                    value={timezone}
                    onChange={value => {
                      setTimezone(value)
                      if (timezoneError) setTimezoneError('')
                    }}
                    disabled={!isEditing || (!isOwnProfile && !isSuperAdmin)}
                    invalid={!!timezoneError}
                  />
                  {timezoneError && (
                    <p role="alert" className="field-error">{timezoneError}</p>
                  )}
                </div>

                {!isOwnProfile && (
                  <div>
                    <label className="mb-1.5 flex items-center justify-between text-sm font-semibold text-slate-700">
                      <span>Employment status</span>
                      {!canChangeStatus || !isEditing ? (
                        <span className="flex items-center gap-1 text-xs font-normal text-slate-400 lowercase">
                          <Lock className="h-3 w-3" /> Managed by Super Admin
                        </span>
                      ) : null}
                    </label>
                    <SearchableSelect
                      value={employmentStatus}
                      disabled={!canChangeStatus || !isEditing}
                      onChange={event => setEmploymentStatus(event.target.value as AccountStatus)}
                      className="h-[42px] w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900"
                    >
                      {employmentStatus === 'pending' && <option value="pending">Pending</option>}
                      {employmentStatus === 'rejected' && <option value="rejected">Rejected</option>}
                      <option value="active">Active</option>
                      <option value="suspended">Suspended</option>
                    </SearchableSelect>
                  </div>
                )}
                {isOwnProfile && <div className="hidden sm:block" />}

                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">Current address</label>
                  <textarea
                    value={currentAddress}
                    disabled={!isEditing || (!isOwnProfile && !isSuperAdmin)}
                    onChange={e => setCurrentAddress(e.target.value)}
                    placeholder="Enter your current address"
                    className={cn(
                      'w-full rounded-xl border px-3.5 py-2.5 text-sm transition shadow-sm',
                      isEditing && (isOwnProfile || isSuperAdmin)
                        ? 'border-slate-200 text-slate-900 placeholder-slate-400 focus:border-[#0A6F94] focus:outline-none'
                        : 'border-slate-200 bg-slate-50 text-slate-700 cursor-default'
                    )}
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">Permanent address</label>
                  <textarea
                    value={permanentAddress}
                    disabled={!isEditing || (!isOwnProfile && !isSuperAdmin)}
                    onChange={e => setPermanentAddress(e.target.value)}
                    placeholder="Enter your permanent address"
                    className={cn(
                      'w-full rounded-xl border px-3.5 py-2.5 text-sm transition shadow-sm',
                      isEditing && (isOwnProfile || isSuperAdmin)
                        ? 'border-slate-200 text-slate-900 placeholder-slate-400 focus:border-[#0A6F94] focus:outline-none'
                        : 'border-slate-200 bg-slate-50 text-slate-700 cursor-default'
                    )}
                  />
                </div>

                {/* Weekly Capacity Hours */}
                <div>
                  <label className="mb-1.5 flex items-center justify-between text-sm font-semibold text-slate-700">
                    <span>Weekly capacity</span>
                    {!isOwnProfile && (!isSuperAdmin || !isEditing) && (
                      <span className="flex items-center gap-1 text-xs font-normal text-slate-400 lowercase">
                        <Lock className="h-3 w-3" /> Managed by Super Admin
                      </span>
                    )}
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min="1"
                      max="168"
                      value={weeklyCapacity}
                      disabled={!isSuperAdmin || !isEditing}
                      onChange={e => {
                        if (!isSuperAdmin) return
                        setWeeklyCapacity(e.target.value)
                        if (capacityError) setCapacityError('')
                      }}
                      placeholder="40"
                      className={cn(
                        'h-[42px] w-full rounded-xl border px-3.5 py-2.5 text-sm pr-16 transition shadow-sm',
                        isSuperAdmin && isEditing
                          ? 'border-slate-200 text-slate-900 placeholder-slate-400 focus:border-[#0A6F94] focus:outline-none'
                          : 'border-slate-200 bg-slate-50 text-slate-600 cursor-not-allowed',
                        capacityError && isEditing && 'border-red-500'
                      )}
                    />
                    <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400">
                      hrs / wk
                    </span>
                  </div>
                  {capacityError && (
                    <p role="alert" className="field-error">{capacityError}</p>
                  )}
                </div>
              </div>

              {/* Department Badges Section */}
              <div className="pt-2">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-semibold text-slate-700">
                    Departments
                  </label>
                  {(!isSuperAdmin || !isEditing) && (
                    <span className="flex items-center gap-1 text-xs font-normal text-slate-400">
                      <Lock className="h-3 w-3" /> Assigned by Super Admin
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  {departments.map(dept => {
                    const isSelected = selectedDeptIds.includes(dept.id)
                    return (
                      <button
                        key={dept.id}
                        type="button"
                        disabled={!isSuperAdmin || !isEditing}
                        onClick={() => toggleDepartment(dept.id)}
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition',
                          isSelected
                            ? 'bg-[#045E80] text-white shadow-sm ring-1 ring-[#034C68]'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80',
                          (!isSuperAdmin || !isEditing) && !isSelected && 'opacity-40 cursor-not-allowed',
                          (!isSuperAdmin || !isEditing) && isSelected && 'cursor-default'
                        )}
                      >
                        {isSelected && <Check className="h-3.5 w-3.5" />}
                        {dept.name}
                      </button>
                    )
                  })}
                  {departments.length === 0 && (
                    <p className="text-xs text-slate-400">No departments configured yet.</p>
                  )}
                </div>

                {!isSuperAdmin && (
                  <p className="mt-2 text-xs text-slate-500">
                    Departments dictate which tickets and tasks you are assigned to. Contact a Super Admin to update your department memberships.
                  </p>
                )}
              </div>

              {/* Action Buttons: View mode has 'Update profile'; Edit mode has 'Discard' and 'Save changes' */}
              <div className="flex items-center justify-end gap-3 pt-6 border-t border-slate-100">
                {!isEditing ? canEditProfile ? (
                  <Button
                    ref={updateProfileButton}
                    onClick={() => setIsEditing(true)}
                    className="px-6 py-2.5 rounded-xl font-semibold shadow-sm inline-flex items-center gap-2"
                  >
                    <Pencil className="h-4 w-4" />
                    Update profile
                  </Button>
                ) : null : (
                  <>
                    <button
                      type="button"
                      onClick={handleDiscard}
                      disabled={saving}
                      className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition disabled:opacity-50"
                    >
                      Discard
                    </button>
                    <Button
                      onClick={() => void runOnce('save-profile', handleSave)}
                      loading={saving}
                      className="px-6 py-2.5 rounded-xl font-semibold shadow-sm"
                    >
                      Save changes
                    </Button>
                  </>
                )}
              </div>
            </div>
      </div>

      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        tabIndex={-1}
        onChange={e => { selectImage(e.target.files?.[0]); e.currentTarget.value = '' }}
      />

      <Modal
        open={imageDialogOpen}
        onClose={cancelImageDialog}
        title={currentImage ? 'Update profile photo' : 'Add profile photo'}
      >
        <div className="space-y-5">
          <div className="flex items-center gap-5 rounded-2xl border-2 border-dashed border-[#9FCCDE] bg-gradient-to-r from-[#EAF4F8]/70 to-white p-5">
            <Avatar
              name={fullName || email}
              src={selectedImagePreview ?? currentImage}
              role={role}
              size="lg"
              className="h-20 w-20 text-2xl shadow-sm"
            />
            <div className="min-w-0 flex-1">
              <p className="break-all text-sm font-semibold text-slate-900">{selectedImage?.name ?? (currentImage ? 'Current profile photo' : 'No photo selected')}</p>
              <p className="mt-1 text-xs text-slate-500">{selectedImage ? `${(selectedImage.size / 1024 / 1024).toFixed(2)} MB` : 'PNG, JPG, or WebP · Max 5 MB'}</p>
              <Button type="button" variant="secondary" size="sm" className="mt-3" onClick={() => fileInput.current?.click()} disabled={imageBusy}>
                <ImagePlus className="h-4 w-4" /> {selectedImage ? 'Choose another' : 'Choose image'}
              </Button>
            </div>
          </div>
          {imageError && <Alert>{imageError}</Alert>}
          <div className="flex flex-wrap justify-end gap-2">
            {currentImage && !selectedImage && (
              <Button type="button" variant="ghost" className="mr-auto text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => void runOnce('remove-image', removeImage)} loading={imageBusy}>
                <Trash2 className="h-4 w-4" /> Remove photo
              </Button>
            )}
            <Button type="button" variant="secondary" onClick={cancelImageDialog} disabled={imageBusy}>Cancel</Button>
            <Button type="button" onClick={() => void runOnce('upload-image', uploadImage)} loading={imageBusy} disabled={!selectedImage || imageBusy}>
              {!imageBusy && <Upload className="h-4 w-4" />} Upload photo
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
