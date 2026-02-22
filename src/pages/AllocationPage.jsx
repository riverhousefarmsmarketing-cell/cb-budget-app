import { useState, useMemo } from 'react'
import { BRAND, BTN_SECONDARY } from '../lib/brand'
import { formatCurrency, formatNumber, formatPct, formatDate } from '../lib/utils'
import { useResourceAllocations, useEmployees, useProjects, useClients, useWorkingHours } from '../hooks/useData'
import { supabase } from '../lib/supabase'
import { PageHeader, DataTable, StatusBadge, LoadingState, FilterBar, FilterChip, Modal, FormField, TextInput, SelectInput, FormFooter, Card, KpiCard } from '../components/SharedUI'
import { useRole } from '../hooks/useRole'
import { useAuth } from '../hooks/useAuth'
import { exportCsv } from '../lib/export'
import { auditDelete } from '../lib/auditDelete'

const MONTHS_2026 = [
  '2026-01-01','2026-02-01','2026-03-01','2026-04-01','2026-05-01','2026-06-01',
  '2026-07-01','2026-08-01','2026-09-01','2026-10-01','2026-11-01','2026-12-01',
]
const SHORT_MONTH = (m) => new Date(m + 'T00:00:00').toLocaleDateString('en-GB', { month: 'short' })

const EMPTY_ALLOC = { employee_id: '', project_id: '', month: '', planned_hours: '', allocation_status: 'planned' }

export default function AllocationPage() {
  const { userId } = useAuth()
  const { can } = useRole(userId)
  const { data: allocations, loading, refetch } = useResourceAllocations()
  const { data: employees } = useEmployees()
  const { data: projects } = useProjects()
  const { data: clients } = useClients()
  const { data: workingHours } = useWorkingHours()
  const [monthFilter, setMonthFilter] = useState('all')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ ...EMPTY_ALLOC })
  const [saving, setSaving] = useState(false)

  const empMap = useMemo(() => { const m = {}; employees.forEach(e => { m[e.id] = e }); return m }, [employees])
  const prjMap = useMemo(() => { const m = {}; projects.forEach(p => { m[p.id] = p }); return m }, [projects])
  const clientMap = useMemo(() => { const m = {}; clients.forEach(c => { m[c.id] = c }); return m }, [clients])

  const filtered = useMemo(() => {
    if (monthFilter === 'all') return allocations
    return allocations.filter(a => a.month === monthFilter)
  }, [allocations, monthFilter])

  const activeEmployees = useMemo(() => employees.filter(e => e.is_active), [employees])
  const billableProjects = useMemo(() => projects.filter(p => p.is_active), [projects])

  // KPIs
  const currentMonth = MONTHS_2026.find(m => m <= new Date().toISOString().slice(0, 10)) || MONTHS_2026[0]
  const currentAllocations = useMemo(() => allocations.filter(a => a.month === currentMonth), [allocations, currentMonth])
  const totalPlanned = useMemo(() => currentAllocations.reduce((s, a) => s + (a.planned_hours || 0), 0), [currentAllocations])
  const totalActual = useMemo(() => currentAllocations.reduce((s, a) => s + (a.actual_hours || 0), 0), [currentAllocations])
  const whc = useMemo(() => workingHours.find(w => w.month === currentMonth), [workingHours, currentMonth])
  const totalCapacity = useMemo(() => activeEmployees.length * (whc?.working_days || 20) * 8, [activeEmployees, whc])

  const openNew = () => { setForm({ ...EMPTY_ALLOC }); setEditing(null); setShowForm(true) }
  const openEdit = (row) => {
    setForm({ ...row, planned_hours: String(row.planned_hours), actual_hours: row.actual_hours ? String(row.actual_hours) : '' })
    setEditing(row.id); setShowForm(true)
  }

  const handleSave = async () => {
    setSaving(true)
    const payload = {
      employee_id: form.employee_id,
      project_id: form.project_id,
      month: form.month,
      planned_hours: parseFloat(form.planned_hours),
      actual_hours: form.actual_hours ? parseFloat(form.actual_hours) : null,
      allocation_status: form.allocation_status,
    }
    if (editing) {
      await supabase.from('resource_allocations').update(payload).eq('id', editing)
    } else {
      const { data: members } = await supabase.from('sector_members').select('sector_id').limit(1)
      payload.sector_id = members?.[0]?.sector_id
      await supabase.from('resource_allocations').insert(payload)
    }
    setSaving(false); setShowForm(false); refetch()
  }

  const handleDelete = async (row) => {
    const emp = empMap[row.employee_id]
    const prj = prjMap[row.project_id]
    const result = await auditDelete('resource_allocations', row.id, `${emp?.name || 'Employee'} on ${prj?.name || 'Project'}`)
    if (result.ok) refetch()
  }

  const handleExport = () => {
    exportCsv(filtered.map(a => {
      const emp = empMap[a.employee_id] || {}
      const prj = prjMap[a.project_id] || {}
      return { Employee: emp.name, Project: prj.name, Month: a.month, 'Planned Hrs': a.planned_hours, 'Actual Hrs': a.actual_hours || '', Status: a.allocation_status }
    }), 'PCS_Allocations')
  }

  if (loading) return <LoadingState message="Loading allocations..." />

  const columns = [
    { key: 'employee_id', label: 'Employee', render: (r) => <span style={{ color: BRAND.purple }}>{empMap[r.employee_id]?.name || '--'}</span> },
    { key: 'project_id', label: 'Project', render: (r) => prjMap[r.project_id]?.name || '--' },
    { key: 'month', label: 'Month', render: (r) => formatDate(r.month) },
    { key: 'planned_hours', label: 'Planned Hrs', align: 'right', render: (r) => formatNumber(r.planned_hours) },
    { key: 'actual_hours', label: 'Actual Hrs', align: 'right', render: (r) => r.actual_hours ? formatNumber(r.actual_hours) : '--' },
    { key: 'variance', label: 'Variance', align: 'right', render: (r) => {
      if (!r.actual_hours) return '--'
      const v = r.actual_hours - r.planned_hours
      const color = Math.abs(v) <= r.planned_hours * 0.1 ? BRAND.dataGreen : v > 0 ? BRAND.dataRed : BRAND.dataAmber
      return <span style={{ color }}>{v > 0 ? '+' : ''}{formatNumber(v)}</span>
    }},
    { key: 'allocation_status', label: 'Status', render: (r) => <StatusBadge status={r.allocation_status} /> },
  ]

  return (
    <div>
      <PageHeader title="Resource Allocation" subtitle="Employee-project-month assignments" action={can('manage_allocations') ? openNew : null} actionLabel="Add Allocation" actionIcon="plus" />

      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '20px' }}>
        <KpiCard label={`Capacity (${SHORT_MONTH(currentMonth)})`} value={`${formatNumber(totalCapacity, 0)} hrs`} color={BRAND.purple} />
        <KpiCard label="Planned" value={`${formatNumber(totalPlanned, 0)} hrs`} sub={totalCapacity > 0 ? formatPct(totalPlanned / totalCapacity) + ' utilised' : ''} color={BRAND.dataTeal} />
        <KpiCard label="Actual" value={`${formatNumber(totalActual, 0)} hrs`} color={BRAND.dataBlue} />
        <KpiCard label="Allocations" value={allocations.length} sub="All months" color={BRAND.greyMuted} />
      </div>

      <FilterBar>
        <FilterChip label="All Months" active={monthFilter === 'all'} onClick={() => setMonthFilter('all')} />
        {MONTHS_2026.slice(0, 6).map(m => (
          <FilterChip key={m} label={SHORT_MONTH(m)} active={monthFilter === m} onClick={() => setMonthFilter(m)} />
        ))}
        <div style={{ flex: 1 }} />
        <button onClick={handleExport} style={{ ...BTN_SECONDARY, fontSize: '12px', padding: '6px 14px' }}>Export CSV</button>
      </FilterBar>

      <DataTable columns={columns} rows={filtered} onRowClick={can('manage_allocations') ? openEdit : null} emptyMessage="No allocations for this period" />

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? 'Edit Allocation' : 'Add Allocation'} width="480px">
        <div style={{ background: BRAND.purpleLight, padding: '20px' }}>
          <FormField label="Employee" required>
            <SelectInput value={form.employee_id} onChange={v => setForm({ ...form, employee_id: v })} placeholder="Select employee..." options={activeEmployees.map(e => ({ value: e.id, label: `${e.employee_code} - ${e.name}` }))} />
          </FormField>
          <FormField label="Project" required>
            <SelectInput value={form.project_id} onChange={v => setForm({ ...form, project_id: v })} placeholder="Select project..." options={billableProjects.map(p => ({ value: p.id, label: `${p.code} - ${p.name}` }))} />
          </FormField>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <FormField label="Month" required>
              <SelectInput value={form.month} onChange={v => setForm({ ...form, month: v })} placeholder="Select month..." options={MONTHS_2026.map(m => ({ value: m, label: SHORT_MONTH(m) + ' 2026' }))} />
            </FormField>
            <FormField label="Status">
              <SelectInput value={form.allocation_status} onChange={v => setForm({ ...form, allocation_status: v })} options={[
                { value: 'planned', label: 'Planned' }, { value: 'confirmed', label: 'Confirmed' },
                { value: 'actual', label: 'Actual' }, { value: 'tentative', label: 'Tentative' },
              ]} />
            </FormField>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <FormField label="Planned Hours" required>
              <TextInput type="number" value={form.planned_hours} onChange={v => setForm({ ...form, planned_hours: v })} placeholder="160" />
            </FormField>
            <FormField label="Actual Hours">
              <TextInput type="number" value={form.actual_hours || ''} onChange={v => setForm({ ...form, actual_hours: v })} placeholder="--" />
            </FormField>
          </div>
        </div>
        <FormFooter onCancel={() => setShowForm(false)} onSave={handleSave} saving={saving} />
        {editing && can('manage_allocations') && (
          <div style={{ padding: '0 24px 16px', textAlign: 'right' }}>
            <button onClick={() => { setShowForm(false); handleDelete({ id: editing, employee_id: form.employee_id, project_id: form.project_id }) }} style={{ background: 'none', border: 'none', color: BRAND.dataRed, fontSize: '12px', cursor: 'pointer', fontFamily: BRAND.font }}>Delete allocation</button>
          </div>
        )}
      </Modal>
    </div>
  )
}
