import { useState, useMemo } from 'react'
import { BRAND, BTN_SECONDARY } from '../lib/brand'
import { formatCurrency, formatDate, humanize } from '../lib/utils'
import { useProjects, useClients, useEmployees } from '../hooks/useData'
import { supabase } from '../lib/supabase'
import { PageHeader, DataTable, StatusBadge, LoadingState, FilterBar, FilterChip, Modal, FormField, TextInput, SelectInput, FormFooter, KpiCard } from '../components/SharedUI'
import { useRole } from '../hooks/useRole'
import { useAuth } from '../hooks/useAuth'
import { exportCsv } from '../lib/export'

const EMPTY_PROJECT = { code: '', name: '', type: 'billable', rate_type: 'standard', adjusted_bill_rate: '', client_id: '', effective_start: '', effective_end: '', is_active: true }

export default function ProjectsPage() {
  const { userId } = useAuth()
  const { can } = useRole(userId)
  const { data: projects, loading, refetch } = useProjects()
  const { data: clients } = useClients()
  const [filter, setFilter] = useState('billable')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ ...EMPTY_PROJECT })
  const [saving, setSaving] = useState(false)

  const clientMap = useMemo(() => {
    const m = {}; clients.forEach(c => { m[c.id] = c.name }); return m
  }, [clients])

  const filtered = useMemo(() => {
    if (filter === 'all') return projects
    if (filter === 'active') return projects.filter(p => p.is_active)
    return projects.filter(p => p.type === filter)
  }, [projects, filter])

  const billableCount = useMemo(() => projects.filter(p => p.type === 'billable' && p.is_active).length, [projects])
  const overheadCount = useMemo(() => projects.filter(p => p.type === 'overhead' && p.is_active).length, [projects])

  const openNew = () => { setForm({ ...EMPTY_PROJECT }); setEditing(null); setShowForm(true) }
  const openEdit = (prj) => {
    setForm({
      ...prj,
      adjusted_bill_rate: prj.adjusted_bill_rate ? String(prj.adjusted_bill_rate) : '',
      client_id: prj.client_id || '',
      effective_start: prj.effective_start || '',
      effective_end: prj.effective_end || '',
    })
    setEditing(prj.id); setShowForm(true)
  }

  const handleSave = async () => {
    setSaving(true)
    const payload = {
      code: form.code,
      name: form.name,
      type: form.type,
      rate_type: form.rate_type,
      adjusted_bill_rate: form.rate_type === 'cross_sector_adjusted' && form.adjusted_bill_rate ? parseFloat(form.adjusted_bill_rate) : null,
      client_id: form.client_id || null,
      effective_start: form.effective_start || null,
      effective_end: form.effective_end || null,
      is_active: form.is_active,
    }
    if (editing) {
      await supabase.from('projects').update(payload).eq('id', editing)
    } else {
      const { data: members } = await supabase.from('sector_members').select('sector_id').limit(1)
      payload.sector_id = members?.[0]?.sector_id
      await supabase.from('projects').insert(payload)
    }
    setSaving(false); setShowForm(false); refetch()
  }

  const handleExport = () => {
    exportCsv(filtered.map(p => ({
      Code: p.code, Name: p.name, Type: humanize(p.type), Client: clientMap[p.client_id] || '--',
      'Rate Type': humanize(p.rate_type), 'Adj Rate': p.adjusted_bill_rate || '',
      Start: p.effective_start || '', End: p.effective_end || '',
      Status: p.is_active ? 'Active' : 'Inactive',
    })), 'PCS_Projects')
  }

  if (loading) return <LoadingState message="Loading projects..." />

  const columns = [
    { key: 'code', label: 'Code', width: '90px' },
    { key: 'name', label: 'Project', render: (r) => <span style={{ color: BRAND.purple }}>{r.name}</span> },
    { key: 'type', label: 'Type', render: (r) => <StatusBadge status={r.type} /> },
    { key: 'client_id', label: 'Client', render: (r) => clientMap[r.client_id] || '--' },
    { key: 'rate_type', label: 'Rate', render: (r) => r.rate_type === 'cross_sector_adjusted' ? <span style={{ color: BRAND.dataAmber }}>Cross-sector ({formatCurrency(r.adjusted_bill_rate)})</span> : 'Standard' },
    { key: 'effective_start', label: 'Start', render: (r) => formatDate(r.effective_start, true) },
    { key: 'effective_end', label: 'End', render: (r) => formatDate(r.effective_end, true) },
    { key: 'is_active', label: 'Status', render: (r) => <StatusBadge status={r.is_active ? 'active' : 'inactive'} /> },
  ]

  return (
    <div>
      <PageHeader title="Projects" subtitle={`${filtered.length} projects`} action={can('manage_projects') ? openNew : null} actionLabel="Add Project" actionIcon="plus" />

      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '20px' }}>
        <KpiCard label="Billable" value={billableCount} color={BRAND.dataTeal} />
        <KpiCard label="Overhead" value={overheadCount} color={BRAND.greyMuted} />
        <KpiCard label="Total Active" value={projects.filter(p => p.is_active).length} color={BRAND.purple} />
      </div>

      <FilterBar>
        <FilterChip label="Billable" active={filter === 'billable'} onClick={() => setFilter('billable')} />
        <FilterChip label="Overhead" active={filter === 'overhead'} onClick={() => setFilter('overhead')} />
        <FilterChip label="Active" active={filter === 'active'} onClick={() => setFilter('active')} />
        <FilterChip label="All" active={filter === 'all'} onClick={() => setFilter('all')} />
        <div style={{ flex: 1 }} />
        <button onClick={handleExport} style={{ ...BTN_SECONDARY, fontSize: '12px', padding: '6px 14px' }}>Export CSV</button>
      </FilterBar>

      <DataTable columns={columns} rows={filtered} onRowClick={can('manage_projects') ? openEdit : null} emptyMessage="No projects found" />

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? 'Edit Project' : 'Add Project'} width="520px">
        <div style={{ background: BRAND.purpleLight, padding: '20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '12px' }}>
            <FormField label="Project Code" required>
              <TextInput value={form.code} onChange={v => setForm({ ...form, code: v })} placeholder="PRJ-001" />
            </FormField>
            <FormField label="Project Name" required>
              <TextInput value={form.name} onChange={v => setForm({ ...form, name: v })} placeholder="TSMC Davis Bacon Monitoring" />
            </FormField>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <FormField label="Type" required>
              <SelectInput value={form.type} onChange={v => setForm({ ...form, type: v })} options={[
                { value: 'billable', label: 'Billable' }, { value: 'overhead', label: 'Overhead' },
              ]} />
            </FormField>
            <FormField label="Client">
              <SelectInput value={form.client_id} onChange={v => setForm({ ...form, client_id: v })} placeholder="Select client..." options={clients.map(c => ({ value: c.id, label: c.name }))} />
            </FormField>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <FormField label="Rate Type">
              <SelectInput value={form.rate_type} onChange={v => setForm({ ...form, rate_type: v })} options={[
                { value: 'standard', label: 'Standard' }, { value: 'cross_sector_adjusted', label: 'Cross-Sector Adjusted' },
              ]} />
            </FormField>
            {form.rate_type === 'cross_sector_adjusted' && (
              <FormField label="Adjusted Bill Rate ($)">
                <TextInput type="number" value={form.adjusted_bill_rate} onChange={v => setForm({ ...form, adjusted_bill_rate: v })} placeholder="145.00" />
              </FormField>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <FormField label="Effective Start">
              <TextInput type="date" value={form.effective_start || ''} onChange={v => setForm({ ...form, effective_start: v })} />
            </FormField>
            <FormField label="Effective End">
              <TextInput type="date" value={form.effective_end || ''} onChange={v => setForm({ ...form, effective_end: v })} />
            </FormField>
          </div>
          <FormField label="Status">
            <SelectInput value={form.is_active ? 'true' : 'false'} onChange={v => setForm({ ...form, is_active: v === 'true' })} options={[
              { value: 'true', label: 'Active' }, { value: 'false', label: 'Inactive' },
            ]} />
          </FormField>
        </div>
        <FormFooter onCancel={() => setShowForm(false)} onSave={handleSave} saving={saving} />
      </Modal>
    </div>
  )
}
