import { useState, useMemo } from 'react'
import { BRAND } from '../lib/brand'
import { formatCurrency, formatDate } from '../lib/utils'
import { useClients, useProjects, useInvoices } from '../hooks/useData'
import { supabase } from '../lib/supabase'
import { PageHeader, DataTable, StatusBadge, LoadingState, FilterBar, FilterChip, Modal, FormField, TextInput, SelectInput, FormFooter, Card, KpiCard } from '../components/SharedUI'
import { PermissionGate } from '../components/PermissionGate'
import { useRole } from '../hooks/useRole'
import { useAuth } from '../hooks/useAuth'
import { exportCsv } from '../lib/export'
import { BTN_SECONDARY } from '../lib/brand'

const EMPTY_CLIENT = { name: '', standard_bill_rate: '', po_reference: '', budget: '', status: 'active' }

export default function ClientsPage() {
  const { userId } = useAuth()
  const { can } = useRole(userId)
  const { data: clients, loading, refetch } = useClients()
  const { data: projects } = useProjects()
  const { data: invoices } = useInvoices()
  const [filter, setFilter] = useState('active')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ ...EMPTY_CLIENT })
  const [saving, setSaving] = useState(false)

  const filtered = useMemo(() => {
    if (filter === 'all') return clients
    return clients.filter(c => c.status === filter)
  }, [clients, filter])

  // Enriched with project count and invoice totals
  const enriched = useMemo(() => {
    return filtered.map(c => {
      const clientProjects = projects.filter(p => p.client_id === c.id && p.is_active)
      const clientInvoices = invoices.filter(i => i.client_id === c.id)
      const totalInvoiced = clientInvoices.reduce((sum, i) => sum + (i.amount || 0), 0)
      const totalPaid = clientInvoices.filter(i => i.status === 'paid').reduce((sum, i) => sum + (i.amount || 0), 0)
      return { ...c, projectCount: clientProjects.length, totalInvoiced, totalPaid }
    })
  }, [filtered, projects, invoices])

  const totalBudget = useMemo(() => clients.filter(c => c.status === 'active').reduce((s, c) => s + (c.budget || 0), 0), [clients])

  const openNew = () => { setForm({ ...EMPTY_CLIENT }); setEditing(null); setShowForm(true) }
  const openEdit = (client) => {
    setForm({ ...client, standard_bill_rate: String(client.standard_bill_rate), budget: client.budget ? String(client.budget) : '' })
    setEditing(client.id); setShowForm(true)
  }

  const handleSave = async () => {
    setSaving(true)
    const payload = {
      name: form.name,
      standard_bill_rate: parseFloat(form.standard_bill_rate),
      po_reference: form.po_reference || null,
      budget: form.budget ? parseFloat(form.budget) : null,
      status: form.status,
      is_active: form.status !== 'closed',
    }
    if (editing) {
      await supabase.from('clients').update(payload).eq('id', editing)
    } else {
      const { data: members } = await supabase.from('sector_members').select('sector_id').limit(1)
      payload.sector_id = members?.[0]?.sector_id
      await supabase.from('clients').insert(payload)
    }
    setSaving(false); setShowForm(false); refetch()
  }

  const handleExport = () => {
    exportCsv(enriched.map(c => ({
      Name: c.name, 'Bill Rate': c.standard_bill_rate, 'PO Ref': c.po_reference || '',
      Budget: c.budget || '', Status: c.status, Projects: c.projectCount,
      'Total Invoiced': c.totalInvoiced, 'Total Paid': c.totalPaid,
    })), 'PCS_Clients')
  }

  if (loading) return <LoadingState message="Loading clients..." />

  const columns = [
    { key: 'name', label: 'Client', render: (r) => <span style={{ color: BRAND.purple }}>{r.name}</span> },
    { key: 'standard_bill_rate', label: 'Bill Rate', align: 'right', render: (r) => formatCurrency(r.standard_bill_rate) },
    { key: 'po_reference', label: 'PO Reference', render: (r) => r.po_reference || '--' },
    { key: 'budget', label: 'Budget', align: 'right', render: (r) => r.budget ? formatCurrency(r.budget) : '--' },
    { key: 'projectCount', label: 'Projects', align: 'right' },
    { key: 'totalInvoiced', label: 'Invoiced', align: 'right', render: (r) => formatCurrency(r.totalInvoiced) },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
  ]

  return (
    <div>
      <PageHeader title="Clients" subtitle={`${filtered.length} clients`} action={can('manage_clients') ? openNew : null} actionLabel="Add Client" actionIcon="plus" />

      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '20px' }}>
        <KpiCard label="Active Clients" value={clients.filter(c => c.status === 'active').length} color={BRAND.purple} />
        <KpiCard label="Pipeline" value={clients.filter(c => c.status === 'pipeline').length} color={BRAND.dataAmber} />
        <KpiCard label="Total Budget" value={formatCurrency(totalBudget)} color={BRAND.dataTeal} />
      </div>

      <FilterBar>
        <FilterChip label="Active" active={filter === 'active'} onClick={() => setFilter('active')} />
        <FilterChip label="Pipeline" active={filter === 'pipeline'} onClick={() => setFilter('pipeline')} />
        <FilterChip label="Closed" active={filter === 'closed'} onClick={() => setFilter('closed')} />
        <FilterChip label="All" active={filter === 'all'} onClick={() => setFilter('all')} />
        <div style={{ flex: 1 }} />
        <button onClick={handleExport} style={{ ...BTN_SECONDARY, fontSize: '12px', padding: '6px 14px' }}>Export CSV</button>
      </FilterBar>

      <DataTable columns={columns} rows={enriched} onRowClick={can('manage_clients') ? openEdit : null} emptyMessage="No clients found" />

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? 'Edit Client' : 'Add Client'} width="480px">
        <div style={{ background: BRAND.purpleLight, padding: '20px' }}>
          <FormField label="Client Name" required>
            <TextInput value={form.name} onChange={v => setForm({ ...form, name: v })} placeholder="TSMC" />
          </FormField>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <FormField label="Standard Bill Rate ($)" required>
              <TextInput type="number" value={form.standard_bill_rate} onChange={v => setForm({ ...form, standard_bill_rate: v })} placeholder="159.65" />
            </FormField>
            <FormField label="Budget ($)">
              <TextInput type="number" value={form.budget} onChange={v => setForm({ ...form, budget: v })} placeholder="4286860.13" />
            </FormField>
          </div>
          <FormField label="PO Reference">
            <TextInput value={form.po_reference || ''} onChange={v => setForm({ ...form, po_reference: v })} placeholder="WO-509227" />
          </FormField>
          <FormField label="Status">
            <SelectInput value={form.status} onChange={v => setForm({ ...form, status: v })} options={[
              { value: 'active', label: 'Active' }, { value: 'pipeline', label: 'Pipeline' }, { value: 'closed', label: 'Closed' },
            ]} />
          </FormField>
        </div>
        <FormFooter onCancel={() => setShowForm(false)} onSave={handleSave} saving={saving} />
      </Modal>
    </div>
  )
}
