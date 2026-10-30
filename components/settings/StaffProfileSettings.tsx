'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Check, CheckCircle2, Lock, User, AlertCircle, Loader2
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { ROLE_LABELS } from '@/lib/constants'
import { Avatar } from '@/components/ui/primitives'
import { Button } from '@/components/ui/button'
import { cn, errorMessage } from '@/lib/utils'
import type { AppRole, Department, Profile } from '@/types/database'

interface StaffProfileSettingsProps {
  profile: Profile
  departments: Department[]
  initialDepartmentIds: string[]
  actorRole: AppRole
}

const COLOR_ACCENTS = [
  { name: 'Emerald', bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-emerald-500' },
  { name: 'Sky',     bg: 'bg-sky-100',     text: 'text-sky-800',     border: 'border-sky-500' },
  { name: 'Violet',  bg: 'bg-violet-100',  text: 'text-violet-800',  border: 'border-violet-500' },
  { name: 'Amber',   bg: 'bg-amber-100',   text: 'text-amber-800',   border: 'border-amber-500' },
  { name: 'Rose',    bg: 'bg-rose-100',    text: 'text-rose-800',    border: 'border-rose-500' },
]

export function StaffProfileSettings({
  profile,
  departments,
  initialDepartmentIds,
  actorRole,
}: StaffProfileSettingsProps) {
  const router = useRouter()
  const isSuperAdmin = actorRole === 'super_admin'

  // Editable form state
  const [fullName, setFullName] = useState(profile.full_name || '')
  const [phone, setPhone] = useState(profile.phone || '')
  const [jobTitle, setJobTitle] = useState(profile.job_title || '')
  const [role, setRole] = useState<AppRole>(profile.role)
  const [weeklyCapacity, setWeeklyCapacity] = useState<string>(
    profile.weekly_capacity_hours != null ? String(profile.weekly_capacity_hours) : '40'
  )
  const [selectedDeptIds, setSelectedDeptIds] = useState<string[]>(initialDepartmentIds)
  const [selectedColor, setSelectedColor] = useState(0)

  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  function handleDiscard() {
    setFullName(profile.full_name || '')
    setPhone(profile.phone || '')
    setJobTitle(profile.job_title || '')
    setRole(profile.role)
    setWeeklyCapacity(profile.weekly_capacity_hours != null ? String(profile.weekly_capacity_hours) : '40')
    setSelectedDeptIds(initialDepartmentIds)
    setError('')
    setSuccess(false)
  }

  function toggleDepartment(deptId: string) {
    if (!isSuperAdmin) return
    setSelectedDeptIds(prev =>
      prev.includes(deptId) ? prev.filter(id => id !== deptId) : [...prev, deptId]
    )
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    setSuccess(false)

    try {
      const supabase = createClient()

      // Base fields any staff can update on their own row
      const updates: Record<string, unknown> = {
        full_name: fullName.trim(),
        phone: phone.trim() || null,
        updated_at: new Date().toISOString(),
      }

      // Privileged fields: only super admin can modify role, job_title, capacity
      if (isSuperAdmin) {
        updates.role = role
        updates.job_title = jobTitle.trim() || null
        updates.weekly_capacity_hours = weeklyCapacity ? parseInt(weeklyCapacity, 10) : 40
      }

      const { error: profileError } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', profile.id)

      if (profileError) throw profileError

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

      setSuccess(true)
      router.refresh()
      setTimeout(() => setSuccess(false), 4000)
    } catch (err: unknown) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Setting</h1>
        <p className="mt-1 text-sm text-slate-500">
          Manage your personal profile, account details, and preferences.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Left Sub-Navigation: ONLY Profile */}
        <aside className="lg:col-span-3">
          <nav className="space-y-1.5" aria-label="Settings Tabs">
            <div className="flex items-center gap-3 rounded-xl bg-brand-50 px-4 py-3 text-sm font-semibold text-brand-900 border border-brand-200/80 shadow-xs">
              <User className="h-5 w-5 text-brand-600" />
              <div>
                <p className="leading-tight">Profile</p>
                <p className="text-[11px] font-normal text-brand-600/80">Name, photo, contact</p>
              </div>
            </div>
          </nav>
        </aside>

        {/* Main Content Card: Your Profile */}
        <main className="lg:col-span-9">
          <div className="rounded-2xl border border-slate-200/80 bg-white shadow-card overflow-hidden">
            {/* Card Header */}
            <div className="border-b border-slate-100 px-6 py-5 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Your profile</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  How you appear to your team and on tickets, tasks, and communications.
                </p>
              </div>
              {success && (
                <span className="flex items-center gap-1.5 rounded-full bg-lime-50 px-3 py-1 text-xs font-semibold text-lime-800 ring-1 ring-lime-200 animate-in fade-in">
                  <CheckCircle2 className="h-4 w-4 text-lime-600" />
                  All changes saved
                </span>
              )}
            </div>

            <div className="p-6 sm:p-8 space-y-8">
              {/* Profile Avatar Header */}
              <div className="flex flex-col sm:flex-row items-center gap-5 sm:gap-6 pb-6 border-b border-slate-100">
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-brand-100 font-display text-2xl font-bold text-brand-700 shadow-sm border border-brand-200 flex-shrink-0">
                  {profile.full_name
                    ? profile.full_name
                        .split(' ')
                        .map(w => w[0])
                        .slice(0, 2)
                        .join('')
                        .toUpperCase()
                    : profile.email.slice(0, 2).toUpperCase()}
                </div>

                <div className="text-center sm:text-left flex-1 min-w-0">
                  <h3 className="text-xl font-bold text-slate-900 truncate">
                    {fullName || profile.email}
                  </h3>
                  
                  {/* Single Role Badge + Job Title */}
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 justify-center sm:justify-start">
                    <span className="inline-flex items-center rounded-md bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700 ring-1 ring-inset ring-brand-700/10">
                      {ROLE_LABELS[role]}
                    </span>
                    {jobTitle && (
                      <span className="text-xs font-medium text-slate-500">
                        · {jobTitle}
                      </span>
                    )}
                  </div>
                  
                  <p className="text-xs text-slate-400 mt-1">{profile.email}</p>

                  {/* Accent Badges */}
                  <div className="mt-3 flex items-center gap-2 justify-center sm:justify-start">
                    <span className="text-xs text-slate-400">Accent:</span>
                    {COLOR_ACCENTS.map((c, i) => (
                      <button
                        key={c.name}
                        type="button"
                        onClick={() => setSelectedColor(i)}
                        title={c.name}
                        className={cn(
                          'h-6 w-6 rounded-full border-2 transition flex items-center justify-center',
                          c.bg,
                          selectedColor === i ? 'ring-2 ring-brand-500 ring-offset-1 ' + c.border : 'border-transparent'
                        )}
                      >
                        {selectedColor === i && <Check className="h-3 w-3 text-slate-700" />}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Form Fields Grid */}
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                {/* Full Name */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                    Full name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    placeholder="Enter your full name"
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 transition shadow-sm"
                  />
                </div>

                {/* Email (Read-Only) */}
                <div>
                  <label className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                    <span>Email</span>
                    <span className="flex items-center gap-1 text-[11px] font-normal text-slate-400 lowercase">
                      <Lock className="h-3 w-3" /> Account email
                    </span>
                  </label>
                  <input
                    type="email"
                    value={profile.email}
                    disabled
                    readOnly
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-sm text-slate-600 cursor-not-allowed shadow-sm"
                  />
                </div>

                {/* Role */}
                <div>
                  <label className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                    <span>Role</span>
                    {!isSuperAdmin && (
                      <span className="flex items-center gap-1 text-[11px] font-normal text-slate-400 lowercase">
                        <Lock className="h-3 w-3" /> Managed by Super Admin
                      </span>
                    )}
                  </label>
                  {isSuperAdmin ? (
                    <select
                      value={role}
                      onChange={e => setRole(e.target.value as AppRole)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 transition shadow-sm"
                    >
                      <option value="super_admin">Super Admin</option>
                      <option value="admin">Manager (Admin)</option>
                      <option value="team_lead">Team Lead</option>
                      <option value="employee">Employee</option>
                    </select>
                  ) : (
                    <div className="flex h-[42px] items-center rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 text-sm font-medium text-slate-700">
                      {ROLE_LABELS[role]}
                    </div>
                  )}
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                    Phone number
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="e.g. +91 98765 43210"
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 transition shadow-sm"
                  />
                </div>

                {/* Job Title */}
                <div>
                  <label className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                    <span>Job title</span>
                    {!isSuperAdmin && (
                      <span className="flex items-center gap-1 text-[11px] font-normal text-slate-400 lowercase">
                        <Lock className="h-3 w-3" /> Managed by Super Admin
                      </span>
                    )}
                  </label>
                  <input
                    type="text"
                    value={jobTitle}
                    disabled={!isSuperAdmin}
                    onChange={e => isSuperAdmin && setJobTitle(e.target.value)}
                    placeholder="e.g. Ads Executive, Senior Designer"
                    className={cn(
                      'w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm transition shadow-sm',
                      isSuperAdmin
                        ? 'text-slate-900 placeholder-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'
                        : 'bg-slate-50/70 text-slate-600 cursor-not-allowed'
                    )}
                  />
                </div>

                {/* Weekly Capacity Hours */}
                <div>
                  <label className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                    <span>Weekly capacity</span>
                    {!isSuperAdmin && (
                      <span className="flex items-center gap-1 text-[11px] font-normal text-slate-400 lowercase">
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
                      disabled={!isSuperAdmin}
                      onChange={e => isSuperAdmin && setWeeklyCapacity(e.target.value)}
                      placeholder="40"
                      className={cn(
                        'w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm pr-16 transition shadow-sm',
                        isSuperAdmin
                          ? 'text-slate-900 placeholder-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'
                          : 'bg-slate-50/70 text-slate-600 cursor-not-allowed'
                      )}
                    />
                    <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400">
                      hrs / wk
                    </span>
                  </div>
                </div>
              </div>

              {/* Department Badges Section */}
              <div className="pt-2">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                    Departments
                  </label>
                  {!isSuperAdmin && (
                    <span className="flex items-center gap-1 text-[11px] font-normal text-slate-400">
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
                        disabled={!isSuperAdmin}
                        onClick={() => toggleDepartment(dept.id)}
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition',
                          isSelected
                            ? 'bg-brand-600 text-white shadow-sm ring-1 ring-brand-700'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80',
                          !isSuperAdmin && !isSelected && 'opacity-40 cursor-not-allowed',
                          !isSuperAdmin && isSelected && 'cursor-default'
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

              {/* Error Alert */}
              {error && (
                <div className="flex items-center gap-2 rounded-xl bg-red-50 p-4 text-sm text-red-700 ring-1 ring-red-200">
                  <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-600" />
                  <p>{error}</p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-6 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleDiscard}
                  disabled={saving}
                  className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition disabled:opacity-50"
                >
                  Discard
                </button>
                <Button
                  onClick={handleSave}
                  loading={saving}
                  className="px-6 py-2.5 rounded-xl font-semibold shadow-sm"
                >
                  Save changes
                </Button>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
