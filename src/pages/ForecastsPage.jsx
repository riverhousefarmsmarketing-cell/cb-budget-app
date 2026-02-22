import { useState, useMemo } from 'react'
import { BRAND, BTN_SECONDARY } from '../lib/brand'
import { formatCurrency, formatCurrencyCompact, formatPct, formatDate, humanize } from '../lib/utils'
import { useForecasts, useClients, useProjects, useEmployees, useForecastAllocations } from '../hooks/useData'
import { supabase } from '../lib/supabase'
import { PageHeader, DataTable, StatusBadge, LoadingState, FilterBar, FilterChip, Modal, FormField, TextInput, SelectInput, FormFooter, Card, KpiCard, TabBar } from '../components/SharedUI'
import { useRole } from '../hooks/useRole'
import { useAuth } from '../hooks/useAuth'
import { exportCsv } from '../lib/export'

const PROB_COLORS = { committed: BRAND.dataGreen, high: BRAND.dataTeal, medium: BRAND.dataAmber, low: BRAND.dataRed }
const STAGE_ORDER = ['identified','qualifying','proposal_prep','proposal_submitted','negotiation','awaiting_decision','won','lost']

const EMPTY_FORECAST = {
  name: '', description: '', forecast_type: 'new_project', parent_project_id: '', proposed_client_id: '',
  bill_rate: '', rate_type: 'standard', probability: 'medium', start_date: '', end_date: '', status: 'draft',
  pursuit_stage: 'identified', assigned_to_name: '',
}

export default function ForecastsPage() {
  const { userId } = useAuth()
  const { can } = useRole(userId)
  const { data: forecasts, loading, refetch } = useForecasts()
  const { data: clients } = useClients()
  const { data: projects } = useProjects()
  const { data: allocations } = useForecastAllocations()
  const [filter, setFilter] = useState('active')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ ...EMPTY_FORECAST })
  const [saving, setSaving] = useState(false)

  const clientMap = useMemo(() => { const m = {}; clients.forEach(c => { m[c.id] = c.name }); return m }, [clients])

  const filtered = useMemo(() => {
    if (filter === 'active') return forecasts.filter(f => f.status !== 'lost' && f.status !== 'won')
    if (filter === 'won') return forecasts.filter(f => f.status === 'won')
    if (filter === 'lost') return forecasts.filter(f => f.status === 'lost')
    return forecasts
  }, [forecasts, filter])

  // Calculate weighted revenue per forecast
  const enriched = useMemo(() => {
    return filtered.map(f => {
      const fa = allocations.filter(a => a.forecast_id === f.id)
      const totalHours = fa.reduce((s, a) => s + (a.planned_hours || 0), 0)
      const grossRevenue = totalHours * (f.bill_rate || 0)
      const weightedRevenue = grossRevenue * (f.probability_weight || 0.5)
      return { ...f, totalHours, grossRevenue, weightedRevenue }
    })
  }, [filtered, allocations])

  // Pipeline KPIs
  const pipelineGross = useMemo(() => enriched.reduce((s, f) => s + f.grossRevenue, 0), [enriched])
  const pipelineWeighted = useMemo(() => enriched.reduce((s, f) => s + f.weightedRevenue, 0), [enriched])

  // Funnel counts by stage
  const stageCounts = useMemo(() => {
    const counts = {}
    STAGE_ORDER.forEach(s => { counts[s] = 0 })
    forecasts.forEach(f => { if (f.pursuit_stage) counts[f.pursuit_stage] = (counts[f.pursuit_stage] || 0) + 1 })
    return counts
  }, [forecasts])

  const openNew = () => { setForm({ ...EMPTY_FORECAST }); setEditing(null); setShowForm(true) }
  const openEdit = (row) => {
    setForm({ ...row, bill_rate: String(row.bill_rate || ''), start_date: row.start_date || '', end_date: row.end_date || '' })
    setEditing(row.id); setShowForm(true)
  }

  const handleSave = async () => {
    setSaving(true)
    const payload = {
      name: form.name, description: form.description || null,
      forecast_type: form.forecast_type,
      parent_project_id: form.forecast_type === 'change_order' ? form.parent_project_id || null : null,
      proposed_client_id: form.forecast_type === 'new_project' ? form.proposed_client_id || null : null,
      bill_rate: parseFloat(form.bill_rate), rate_type: form.rate_type,
      probability: form.probability, start_date: form.start_date, end_date: form.end_date,
      status: form.status, pursuit_stage: form.pursuit_stage,
      assigned_to_name: form.assigned_to_name || null,
    }
    if (editing) {
      await supabase.from('forecasts').update(payload).eq('id', editing)
    } else {
      const { data: members } = await supabase.from('sector_members').select('sector_id').limit(1)
      payload.sector_id = members?.[0]?.sector_id
      payload.created_by = userId
      await supabase.from('forecasts').insert(payload)
    }
    setSaving(false); setShowForm(false); refetch()
  }

  const handleExport = () => {
    exportCsv(enriched.map(f => ({
      Name: f.name, Type: humanize(f.forecast_type), Probability: f.probability,
      'Bill Rate': f.bill_rate, 'Gross Revenue': f.grossRevenue?.toFixed(2),
      'Weighted Revenue': f.weightedRevenue?.toFixed(2), Stage: humanize(f.pursuit_stage),
      Status: f.status, Start: f.start_date, End: f.end_date,
    })), 'PCS_Forecasts')
  }

  if (loading) return <LoadingState message="Loading forecasts..." />

  const columns = [
    { key: 'name', label: 'Forecast', render: (r) => <span style={{ color: BRAND.purple }}>{r.name}</span> },
    { key: 'forecast_type', label: 'Type', render: (r) => humanize(r.forecast_type) },
    { key: 'probability', label: 'Probability', render: (r) => <span style={{ color: PROB_COLORS[r.probability] || BRAND.coolGrey }}>{humanize(r.probability)}</span> },
    { key: 'grossRevenue', label: 'Gross Rev', align: 'right', render: (r) => formatCurrency(r.grossRevenue) },
    { key: 'weightedRevenue', label: 'Weighted Rev', align: 'right', render: (r) => formatCurrency(r.weightedRevenue) },
    { key: 'pursuit_stage', label: 'Stage', render: (r) => <StatusBadge status={r.pursuit_stage} /> },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
    { key: 'start_date', label: 'Start', render: (r) => formatDate(r.start_date) },
  ]

  return (
    <div>
      <PageHeader title="Forecasts" subtitle="Revenue pipeline and opportunity management" action={can('manage_forecasts') ? openNew : null} actionLabel="Add Forecast" actionIcon="plus" />

      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '20px' }}>
        <KpiCard label="Pipeline (Gross)" value={formatCurrencyCompact(pipelineGross)} color={BRAND.purple} />
        <KpiCard label="Pipeline (Weighted)" value={formatCurrencyCompact(pipelineWeighted)} color={BRAND.dataTeal} />
        <KpiCard label="Active Forecasts" value={forecasts.filter(f => f.status !== 'lost' && f.status !== 'won').length} color={BRAND.dataBlue} />
        <KpiCard label="Won" value={forecasts.filter(f => f.status === 'won').length} color={BRAND.dataGreen} />
      </div>

      {/* Stage funnel */}
      <Card title="Pursuit Stage Funnel" style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'flex-end', height: '60px' }}>
          {STAGE_ORDER.filter(s => s !== 'won' && s !== 'lost').map(stage => {
            const count = stageCounts[stage] || 0
            const maxCount = Math.max(...Object.values(stageCounts), 1)
            const height = Math.max((count / maxCount) * 48, 4)
            return (
              <div key={stage} style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ background: BRAND.purple, height: `${height}px`, marginBottom: '4px', opacity: count > 0 ? 1 : 0.2 }} />
                <div style={{ fontSize: '16px', color: BRAND.purple }}>{count}</div>
                <div style={{ fontSize: '10px', color: BRAND.greyMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{humanize(stage)}</div>
              </div>
            )
          })}
        </div>
      </Card>

      <FilterBar>
        <FilterChip label="Active" active={filter === 'active'} onClick={() => setFilter('active')} />
        <FilterChip label="Won" active={filter === 'won'} onClick={() => setFilter('won')} />
        <FilterChip label="Lost" active={filter === 'lost'} onClick={() => setFilter('lost')} />
        <FilterChip label="All" active={filter === 'all'} onClick={() => setFilter('all')} />
        <div style={{ flex: 1 }} />
        <button onClick={handleExport} style={{ ...BTN_SECONDARY, fontSize: '12px', padding: '6px 14px' }}>Export CSV</button>
      </FilterBar>

      <DataTable columns={columns} rows={enriched} onRowClick={can('manage_forecasts') ? openEdit : null} emptyMessage="No forecasts found" />

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? 'Edit Forecast' : 'Add Forecast'} width="560px">
        <div style={{ background: BRAND.purpleLight, padding: '20px' }}>
          <FormField label="Forecast Name" required>
            <TextInput value={form.name} onChange={v => setForm({ ...form, name: v })} placeholder="TI Davis Bacon Phase 2" />
          </FormField>
          <FormField label="Description">
            <TextInput value={form.description || ''} onChange={v => setForm({ ...form, description: v })} placeholder="Optional description" />
          </FormField>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <FormField label="Type" required>
              <SelectInput value={form.forecast_type} onChange={v => setForm({ ...form, forecast_type: v })} options={[
                { value: 'new_project', label: 'New Project' }, { value: 'change_order', label: 'Change Order' },
              ]} />
            </FormField>
            {form.forecast_type === 'new_project' ? (
              <FormField label="Proposed Client">
                <SelectInput value={form.proposed_client_id || ''} onChange={v => setForm({ ...form, proposed_client_id: v })} placeholder="Select..." options={clients.map(c => ({ value: c.id, label: c.name }))} />
              </FormField>
            ) : (
              <FormField label="Parent Project">
                <SelectInput value={form.parent_project_id || ''} onChange={v => setForm({ ...form, parent_project_id: v })} placeholder="Select..." options={projects.filter(p => p.type === 'billable').map(p => ({ value: p.id, label: p.name }))} />
              </FormField>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            <FormField label="Bill Rate ($)" required>
              <TextInput type="number" value={form.bill_rate} onChange={v => setForm({ ...form, bill_rate: v })} placeholder="145.00" />
            </FormField>
            <FormField label="Probability" required>
              <SelectInput value={form.probability} onChange={v => setForm({ ...form, probability: v })} options={[
                { value: 'committed', label: 'Committed (100%)' }, { value: 'high', label: 'High (75%)' },
                { value: 'medium', label: 'Medium (50%)' }, { value: 'low', label: 'Low (25%)' },
              ]} />
            </FormField>
            <FormField label="Pursuit Stage">
              <SelectInput value={form.pursuit_stage} onChange={v => setForm({ ...form, pursuit_stage: v })} options={STAGE_ORDER.map(s => ({ value: s, label: humanize(s) }))} />
            </FormField>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <FormField label="Start Date" required>
              <TextInput type="date" value={form.start_date} onChange={v => setForm({ ...form, start_date: v })} />
            </FormField>
            <FormField label="End Date" required>
              <TextInput type="date" value={form.end_date} onChange={v => setForm({ ...form, end_date: v })} />
            </FormField>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <FormField label="Status">
              <SelectInput value={form.status} onChange={v => setForm({ ...form, status: v })} options={[
                { value: 'draft', label: 'Draft' }, { value: 'submitted', label: 'Submitted' },
                { value: 'approved', label: 'Approved' }, { value: 'won', label: 'Won' }, { value: 'lost', label: 'Lost' },
              ]} />
            </FormField>
            <FormField label="Assigned To">
              <TextInput value={form.assigned_to_name || ''} onChange={v => setForm({ ...form, assigned_to_name: v })} placeholder="Name" />
            </FormField>
          </div>
        </div>
        <FormFooter onCancel={() => setShowForm(false)} onSave={handleSave} saving={saving} />
      </Modal>
    </div>
  )
}
