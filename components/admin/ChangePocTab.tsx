'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Check, ChevronLeft, ChevronRight, Search, UsersRound, UserRoundPlus, X } from 'lucide-react'
import { Avatar, Card, CardHeader, EmptyState, Alert } from '@/components/ui/primitives'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { SearchableSelect } from '@/components/shared/SearchableSelect'
import { ROLE_LABELS } from '@/lib/constants'
import { cn, errorMessage } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { showSuccessToast } from '@/lib/ui-toast'
import type { Department, StaffRole } from '@/types/database'
import type { StaffRow } from '@/components/admin/UserAdmin'

const PAGE_SIZE = 6
const NONE = '__no_poc__'
type PocPerson = Pick<StaffRow, 'id' | 'full_name' | 'email' | 'avatar_url' | 'role' | 'status' | 'reporting_to'>

function expectedPocRole(role: StaffRole): StaffRole | null {
  if (role === 'manager') return 'super_admin'
  if (role === 'team_lead') return 'manager'
  if (role === 'employee') return 'team_lead'
  return null
}

export function ChangePocTab({ rows, departments, people, initialSelectedIds = [] }: {
  rows: StaffRow[]
  departments: Department[]
  people: PocPerson[]
  initialSelectedIds?: string[]
}) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [role, setRole] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [pocId, setPocId] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>(initialSelectedIds)
  const [newPocId, setNewPocId] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const departmentNames = useMemo(() => new Map(departments.map(item => [item.id, item.name])), [departments])
  const peopleById = useMemo(() => new Map(people.map(person => [person.id, person])), [people])

  const filteredRows = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return rows.filter(row => {
      if (role && row.role !== role) return false
      if (departmentId && !row.departmentIds.includes(departmentId)) return false
      if (pocId === NONE && row.reporting_to) return false
      if (pocId && pocId !== NONE && row.reporting_to !== pocId) return false
      if (!normalized) return true
      const names = row.departmentIds.map(id => departmentNames.get(id) ?? '')
      return [row.full_name, row.email, row.id, row.job_title ?? '', ROLE_LABELS[row.role], ...names]
        .join(' ').toLowerCase().includes(normalized)
    })
  }, [departmentId, departmentNames, pocId, query, role, rows])

  const maxPage = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE))
  const pageRows = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const selectedRows = selectedIds.map(id => rows.find(row => row.id === id)).filter((row): row is StaffRow => !!row)
  const unchangedPocRows = selectedRows.filter(row => row.reporting_to === newPocId && !!newPocId)
  const newPoc = peopleById.get(newPocId)
  const allFilteredSelected = filteredRows.length > 0 && filteredRows.every(row => selectedIds.includes(row.id))
  const commonPocRole = selectedRows.length
    ? expectedPocRole(selectedRows[0].role)
    : null
  const compatibleRole = commonPocRole && selectedRows.every(row => expectedPocRole(row.role) === commonPocRole)
    ? commonPocRole
    : null
  const candidateIdsInCycle = useMemo(() => {
    const selected = new Set(selectedIds)
    const cyclic = new Set<string>()
    for (const person of people) {
      let current: string | null = person.id
      const visited = new Set<string>()
      while (current && !visited.has(current)) {
        if (selected.has(current)) { cyclic.add(person.id); break }
        visited.add(current)
        current = peopleById.get(current)?.reporting_to ?? null
      }
    }
    return cyclic
  }, [people, peopleById, selectedIds])
  const pocOptions = compatibleRole
    ? people.filter(person => person.status === 'active' && person.role === compatibleRole && !candidateIdsInCycle.has(person.id))
    : []

  function toggleSelected(id: string) {
    setSelectedIds(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id])
    setNewPocId('')
    setError('')
  }

  function toggleFiltered() {
    setSelectedIds(current => allFilteredSelected
      ? current.filter(id => !filteredRows.some(row => row.id === id))
      : Array.from(new Set([...current, ...filteredRows.map(row => row.id)])))
    setNewPocId('')
    setError('')
  }

  async function confirmChange() {
    if (!selectedRows.length || !newPocId || unchangedPocRows.length) return
    const previousPocNames = Array.from(new Set(selectedRows.map(row => row.reporting_to_name || 'No POC assigned')))
    const newPocName = newPoc?.full_name || newPoc?.email || 'the selected POC'
    setSaving(true)
    setError('')
    const { data, error: rpcError } = await createClient().rpc('change_staff_poc', {
      p_staff_ids: selectedRows.map(row => row.id),
      p_new_poc_id: newPocId,
    })
    setSaving(false)
    if (rpcError) {
      setError(errorMessage(rpcError))
      setConfirmOpen(false)
      return
    }
    const updatedCount = Number(data ?? selectedRows.length)
    const countLabel = `${updatedCount} staff member${updatedCount === 1 ? '' : 's'}`
    const changeSummary = previousPocNames.length === 1
      ? `${previousPocNames[0]} → ${newPocName}`
      : `to ${newPocName}`
    showSuccessToast(`Reporting POC changed ${changeSummary} for ${countLabel}.`)
    setConfirmOpen(false)
    setSelectedIds([])
    setNewPocId('')
    if (selectedRows.some(row => row.reporting_to === pocId)) setPocId('')
    setPage(1)
    router.refresh()
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <Card className="overflow-hidden">
        <CardHeader
          title={<span className="flex items-center gap-2"><UsersRound className="h-5 w-5 text-[#045E80]" />Change POC (Reporting Person)</span>}
          description="Find staff by search or filters, select the people to update, and assign a new reporting POC."
        />
        <div className="grid gap-2 border-b border-slate-100 bg-slate-50/70 p-3 sm:grid-cols-[minmax(0,1fr)_145px_175px_175px] sm:gap-2 sm:bg-white sm:p-4">
          <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-2 sm:contents">
          <label className="relative order-1 min-w-0 sm:order-1">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={query} onChange={event => { setQuery(event.target.value); setPage(1) }} type="search"
              placeholder="Search name, email or employee ID..." aria-label="Search staff by name, email or employee ID"
              className="form-field search-input-with-icon h-9 w-full min-w-0 rounded-lg border-slate-200 bg-white text-[13px] shadow-sm transition focus:border-[#045E80] focus:ring-2 focus:ring-[#045E80]/10 sm:rounded-xl sm:text-sm" />
          </label>
          <SearchableSelect className="form-field h-9 w-full min-w-0 rounded-lg border-slate-200 bg-white px-3 py-1.5 text-[13px] shadow-sm transition focus:border-[#045E80] focus:ring-2 focus:ring-[#045E80]/10 sm:order-2 sm:rounded-xl sm:text-sm" aria-label="Filter by role"
            value={role} onChange={event => { setRole(event.target.value); setPage(1) }}>
            <option value="">All roles</option>
            {(['super_admin', 'manager', 'team_lead', 'employee'] as StaffRole[]).map(value => <option key={value} value={value}>{ROLE_LABELS[value]}</option>)}
          </SearchableSelect>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:contents">
          <SearchableSelect className="form-field h-9 w-full min-w-0 rounded-lg border-slate-200 bg-white px-3 py-1.5 text-[13px] shadow-sm transition focus:border-[#045E80] focus:ring-2 focus:ring-[#045E80]/10 sm:order-3 sm:rounded-xl sm:text-sm" aria-label="Filter by department" searchable
            searchPlaceholder="Search departments..." value={departmentId} onChange={event => { setDepartmentId(event.target.value); setPage(1) }}>
            <option value="">All departments</option>
            {departments.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </SearchableSelect>
          <SearchableSelect className="form-field h-9 w-full min-w-0 rounded-lg border-slate-200 bg-white px-3 py-1.5 text-[13px] shadow-sm transition focus:border-[#045E80] focus:ring-2 focus:ring-[#045E80]/10 sm:order-4 sm:rounded-xl sm:text-sm" aria-label="Filter by current POC" searchable
            searchPlaceholder="Search POCs..." value={pocId} onChange={event => { setPocId(event.target.value); setPage(1) }}
            options={[
              { value: '', label: 'All POCs', text: 'All POCs' },
              { value: NONE, label: 'No POC assigned', text: 'No POC assigned' },
              ...people.filter(person => rows.some(row => row.reporting_to === person.id)).map(person => {
                const name = person.full_name || person.email
                const personRole = ROLE_LABELS[person.role]
                return {
                  value: person.id,
                  text: `${name} ${personRole}`,
                  label: (
                    <span className="flex min-w-0 flex-col">
                      <span className="block truncate">{name}</span>
                      <span className="block truncate text-xs font-normal text-slate-500">{personRole}</span>
                    </span>
                  ),
                  selectedLabel: <span className="block truncate">{name}</span>,
                }
              }),
            ]}
          />
          </div>
        </div>

        {error && !confirmOpen && <div className="px-4 pt-4"><Alert tone="error">{error}</Alert></div>}
        {filteredRows.length ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-[#EAF4F8]/60 px-4 py-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-800">
                <input type="checkbox" checked={allFilteredSelected} onChange={toggleFiltered} aria-label="Select all filtered staff"
                  className="h-4 w-4 rounded border-slate-300 text-[#045E80] focus:ring-[#045E80]" />
                {selectedIds.length} selected
              </label>
              <span className="text-xs text-slate-500">{filteredRows.length} matching staff found</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[780px] text-left text-sm">
                <thead className="bg-white text-xs text-slate-500">
                  <tr className="border-b border-slate-100">
                    <th className="w-12 px-4 py-3"><span className="sr-only">Select</span></th>
                    <th className="px-3 py-3 font-semibold">Name (All employees)</th>
                    <th className="px-3 py-3 font-semibold">Role</th>
                    <th className="px-3 py-3 font-semibold">Department</th>
                    <th className="px-3 py-3 font-semibold">Current POC (Reporting to)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pageRows.map(row => {
                    const checked = selectedIds.includes(row.id)
                    const currentPoc = row.reporting_to ? peopleById.get(row.reporting_to) : null
                    const rowDepartments = row.departmentIds.map(id => departmentNames.get(id)).filter(Boolean)
                    return (
                      <tr key={row.id} className={cn('transition-colors hover:bg-slate-50/70', checked && 'bg-[#EAF4F8]/40')}>
                        <td className="px-4 py-3"><input type="checkbox" checked={checked} onChange={() => toggleSelected(row.id)}
                          aria-label={`Select ${row.full_name || row.email}`} className="h-4 w-4 rounded border-slate-300 text-[#045E80] focus:ring-[#045E80]" /></td>
                        <td className="px-3 py-3">
                          <div className="flex min-w-0 items-center gap-2.5"><Avatar name={row.full_name || row.email} src={row.avatar_url} role={row.role} size="sm" />
                            <span className="min-w-0"><span className="block truncate font-medium text-slate-900">{row.full_name || row.email}</span><span className="block truncate text-xs text-slate-500">{row.email}</span></span>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-slate-600">{ROLE_LABELS[row.role]}</td>
                        <td className="px-3 py-3 text-slate-600">{rowDepartments.length ? rowDepartments.join(', ') : '—'}</td>
                        <td className="px-3 py-3">
                          {currentPoc ? <span className="flex items-center gap-2"><Avatar name={currentPoc.full_name || currentPoc.email} src={currentPoc.avatar_url} role={currentPoc.role} size="xs" /><span className="min-w-0"><span className="block truncate font-medium text-slate-800">{currentPoc.full_name || currentPoc.email}</span><span className="block text-xs text-slate-500">{ROLE_LABELS[currentPoc.role]}</span></span></span> : <span className="text-slate-400">No POC</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
              <span>Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filteredRows.length)} of {filteredRows.length}</span>
              <div className="flex items-center gap-1">
                <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage(current => current - 1)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
                <span className="px-2">{page} / {maxPage}</span>
                <button type="button" aria-label="Next page" disabled={page >= maxPage} onClick={() => setPage(current => current + 1)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
              </div>
            </div>
          </>
        ) : <EmptyState title="No staff found" description="Try changing the search or filters." />}
      </Card>

      <Card className="h-fit overflow-hidden">
        <CardHeader title={<span className="flex items-center gap-2"><UsersRound className="h-5 w-5 text-[#045E80]" />Selected Staff</span>}
          action={<span className="rounded-full bg-[#EAF4F8] px-2.5 py-1 text-xs font-semibold text-[#045E80]">{selectedRows.length} selected</span>} />
        <div className="max-h-64 space-y-2 overflow-y-auto p-4">
          {selectedRows.length ? selectedRows.map(row => (
            <div key={row.id} className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-white p-2.5">
              <Avatar name={row.full_name || row.email} src={row.avatar_url} role={row.role} size="md" />
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-slate-900">{row.full_name || row.email}</p><p className="truncate text-xs text-slate-500">{ROLE_LABELS[row.role]} · {row.reporting_to_name || 'No POC'}</p></div>
              <button type="button" aria-label={`Remove ${row.full_name || row.email}`} onClick={() => toggleSelected(row.id)} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-4 w-4" /></button>
            </div>
          )) : <p className="py-3 text-sm text-slate-500">Select staff from the list to prepare a POC change.</p>}
        </div>
        <div className="border-t border-slate-100 p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><UserRoundPlus className="h-4 w-4 text-[#045E80]" />New POC</h3>
          <p className="mt-1 text-xs text-slate-500">Choose an active person with the correct role for every selected staff member.</p>
          <SearchableSelect className={cn('form-field mt-3 h-10 w-full rounded-xl text-sm', unchangedPocRows.length > 0 && 'border-red-400 bg-red-50/30 focus:border-red-500')} aria-label="New POC" aria-invalid={unchangedPocRows.length > 0} aria-describedby={unchangedPocRows.length > 0 ? 'new-poc-validation-error' : undefined} searchable
            searchPlaceholder="Search eligible POCs..." value={newPocId} disabled={!selectedRows.length || !pocOptions.length}
            onChange={event => { setNewPocId(event.target.value); setError('') }}>
            <option value="">{!selectedRows.length ? 'Select staff first' : compatibleRole ? 'Select new POC' : 'Selected roles need different POCs'}</option>
            {pocOptions.map(person => <option key={person.id} value={person.id}>{person.full_name || person.email} · {ROLE_LABELS[person.role]}</option>)}
          </SearchableSelect>
          {selectedRows.length > 0 && !compatibleRole && <p className="mt-2 text-xs text-amber-700">Select staff with the same reporting level to assign one POC in this change.</p>}
          {selectedRows.length > 0 && compatibleRole && !pocOptions.length && <p className="mt-2 text-xs text-amber-700">No active eligible POC is available for these staff members.</p>}
          {unchangedPocRows.length > 0 && <p id="new-poc-validation-error" role="alert" className="field-error">{newPoc?.full_name || newPoc?.email} is already the current POC for {unchangedPocRows.map(row => row.full_name || row.email).join(', ')}. Choose a different person.</p>}
          <div className="mt-4 rounded-xl bg-[#EAF4F8] p-3 text-xs leading-5 text-[#034C68]">
            Only active staff with the correct reporting role can be selected. This updates reporting relationships only; tasks, tickets, and client coverage stay with their current owners.
          </div>
          <Button className="mt-4 w-full" disabled={!selectedRows.length || !newPocId || unchangedPocRows.length > 0} onClick={() => { setError(''); setConfirmOpen(true) }}>
            <UserRoundPlus className="h-4 w-4" /> Review POC change
          </Button>
        </div>
      </Card>

      <Modal open={confirmOpen} onClose={() => !saving && setConfirmOpen(false)} title="Confirm POC change"
        description={`Review the reporting change for ${selectedRows.length} selected staff member${selectedRows.length === 1 ? '' : 's'}.`}>
        <div className="space-y-4">
          {error && <Alert tone="error">{error}</Alert>}
          <div className="flex items-start gap-3 rounded-xl border border-[#CFE4EC] bg-[#F3FAFC] p-3">
            <Avatar name={newPoc?.full_name || newPoc?.email || 'New POC'} src={newPoc?.avatar_url} role={newPoc?.role} size="md" />
            <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">New reporting POC</p><p className="truncate text-sm font-semibold text-slate-900">{newPoc?.full_name || newPoc?.email || 'Select a POC'}</p><p className="text-xs text-slate-600">{newPoc ? ROLE_LABELS[newPoc.role] : ''}</p></div>
          </div>
          <ul className="max-h-64 space-y-2 overflow-y-auto">
            {selectedRows.map(row => {
              const previousPoc = row.reporting_to ? peopleById.get(row.reporting_to) : null
              return <li key={row.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="mb-3 flex items-start gap-2 border-b border-slate-100 pb-2.5">
                  <Avatar name={row.full_name || row.email} src={row.avatar_url} role={row.role} size="sm" />
                  <div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">{row.full_name || row.email}</p><p className="text-xs text-slate-500">{ROLE_LABELS[row.role]}</p></div>
                </div>
                <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
                  <div className="min-w-0"><p className="text-xs font-medium text-slate-500">Current POC</p><p className="truncate text-sm font-medium text-slate-800">{previousPoc?.full_name || previousPoc?.email || row.reporting_to_name || 'No POC assigned'}</p><p className="truncate text-xs text-slate-500">{previousPoc ? ROLE_LABELS[previousPoc.role] : ''}</p></div>
                  <ArrowRight aria-hidden="true" className="h-4 w-4 text-slate-400" />
                  <div className="min-w-0"><p className="text-xs font-medium text-slate-500">New POC</p><p className="truncate text-sm font-medium text-slate-800">{newPoc?.full_name || newPoc?.email || '—'}</p><p className="truncate text-xs text-slate-500">{newPoc ? ROLE_LABELS[newPoc.role] : ''}</p></div>
                </div>
              </li>
            })}
          </ul>
          <div className="flex justify-end gap-2"><Button variant="secondary" disabled={saving} onClick={() => setConfirmOpen(false)}>Cancel</Button><Button disabled={unchangedPocRows.length > 0 || !newPocId} loading={saving} onClick={() => void confirmChange()}><Check className="h-4 w-4" /> Update POC for {selectedRows.length} Staff</Button></div>
        </div>
      </Modal>
    </div>
  )
}
