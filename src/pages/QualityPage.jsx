import { useState, useMemo } from 'react'
import { BRAND, BTN_SECONDARY } from '../lib/brand'
import { formatDate, humanize, formatPct } from '../lib/utils'
import { useQualityPlanItems, useQualityChecks, useProjects, useEmployees } from '../hooks/useData'
import { supabase } from '../lib/supabase'
import { PageHeader, DataTable, StatusBadge, LoadingState, FilterBar, FilterChip, Modal, FormField, TextInput, SelectInput, FormFooter, Card, KpiCard, TabBar } from '../components/SharedUI'
import { useRole } from '../hooks/useRole'
import { useAuth } from '../hooks/useAuth'
import { exportCsv } from '../lib/export'

const EMPTY_PLAN_ITEM = { name: '', description: '', category: 'process', frequency: 'monthly', project_id: '', responsible_name: '', is_active: true }
const EMPTY_CHECK = { quality_plan_item_id: '', check_date: '', performed_by_name: '', outcome: 'pass', notes: '' }

export default function QualityPage() {
  const { userId } = useAuth()
  const { can } = useRole(userId)
  const { data: planItems, loading: piLoad, refetch: refetchPI } = useQualityPlanItems()
  const { data: checks, loading: cLoad, refetch: refetchChecks } = useQualityChecks()
  const { data: projects } = useProjects()
  const [tab, setTab] = useState('dashboard')
  const [filter, setFilter] = useState('active')
  const [showItemForm, setShowItemForm] = useState(false)
  const [showCheckForm, setShowCheckForm] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [editingCheck, setEditingCheck] = useState(null)
  const [itemForm, setItemForm] = useState({ ...EMPTY_PLAN_ITEM })
  const [checkForm, setCheckForm] = useState({ ...EMPTY_CHECK })
  const [saving, setSaving] = useState(false)

  const prjMap = useMemo(() => { const m = {}; projects.forEach(p => { m[p.id] = p.name }); return m }, [projects])
  const planMap = useMemo(() => { const m = {}; planItems.forEach(p => { m[p.id] = p }); return m }, [planItems])

  // KPIs
  const activeItems = useMemo(() => planItems.filter(p => p.is_active), [planItems])
  const totalChecks = checks.length
  const passRate = useMemo(() => {
    if (checks.length === 0) return 0
    return checks.filter(c => c.outcome === 'pass').length / checks.length
  }, [checks])
  const failCount = useMemo(() => checks.filter(c => c.outcome === 'fail').length, [checks])

  // Compliance: how many active items have had a check this month
  const currentMonth = new Date().toISOString().slice(0, 7)
  const complianceRate = useMemo(() => {
    if (activeItems.length === 0) return 0
    const checkedThisMonth = new Set(checks.filter(c => c.check_date?.startsWith(currentMonth)).map(c => c.quality_plan_item_id))
    const monthlyItems = activeItems.filter(i => i.frequency === 'monthly' || i.frequency === 'weekly')
    if (monthlyItems.length === 0) return 1
    return monthlyItems.filter(i => checkedThisMonth.has(i.id)).length / monthlyItems.length
  }, [activeItems, checks, currentMonth])

  // Items by category
  const categoryCounts = useMemo(() => {
    const counts = {}
    activeItems.forEach(i => { counts[i.category] = (counts[i.category] || 0) + 1 })
    return counts
  }, [activeItems])

  const filteredItems = useMemo(() => {
    if (filter === 'active') return planItems.filter(p => p.is_active)
    if (filter === 'inactive') return planItems.filter(p => !p.is_active)
    return planItems
  }, [planItems, filter])

  // Plan Item CRUD
  const openNewItem = () => { setItemForm({ ...EMPTY_PLAN_ITEM }); setEditingItem(null); setShowItemForm(true) }
  const openEditItem = (row) => {
    setItemForm({ ...row, project_id: row.project_id || '' })
    setEditingItem(row.id); setShowItemForm(true)
  }

  const saveItem = async () => {
    setSaving(true)
    const payload = {
      name: itemForm.name, description: itemForm.description || null,
      category: itemForm.category, frequency: itemForm.frequency,
      project_id: itemForm.project_id || null,
      responsible_name: itemForm.responsible_name || null,
      is_active: itemForm.is_active,
    }
    if (editingItem) {
      await supabase.from('quality_plan_items').update(payload).eq('id', editingItem)
    } else {
      const { data: members } = await supabase.from('sector_members').select('sector_id').limit(1)
      payload.sector_id = members?.[0]?.sector_id
      await supabase.from('quality_plan_items').insert(payload)
    }
    setSaving(false); setShowItemForm(false); refetchPI()
  }

  // Check CRUD
  const openNewCheck = (planItemId) => {
    setCheckForm({ ...EMPTY_CHECK, quality_plan_item_id: planItemId || '' })
    setEditingCheck(null); setShowCheckForm(true)
  }
  const openEditCheck = (row) => {
    setCheckForm({ ...row, check_date: row.check_date || '' })
    setEditingCheck(row.id); setShowCheckForm(true)
  }

  const saveCheck = async () => {
    setSaving(true)
    const payload = {
      quality_plan_item_id: checkForm.quality_plan_item_id,
      check_date: checkForm.check_date,
      performed_by_name: checkForm.performed_by_name || null,
      outcome: checkForm.outcome,
      notes: checkForm.notes || null,
    }
    if (editingCheck) {
      await supabase.from('quality_checks').update(payload).eq('id', editingCheck)
    } else {
      const { data: members } = await supabase.from('sector_members').select('sector_id').limit(1)
      payload.sector_id = members?.[0]?.sector_id
      await supabase.from('quality_checks').insert(payload)
    }
    setSaving(false); setShowCheckForm(false); refetchChecks()
  }

  const handleExportItems = () => {
    exportCsv(filteredItems.map(i => ({
      Name: i.name, Category: humanize(i.category), Frequency: humanize(i.frequency),
      Project: prjMap[i.project_id] || '', Responsible: i.responsible_name || '',
      Status: i.is_active ? 'Active' : 'Inactive',
    })), 'PCS_Quality_Plan')
  }

  const handleExportChecks = () => {
    exportCsv(checks.map(c => ({
      'Plan Item': planMap[c.quality_plan_item_id]?.name || '',
      Date: c.check_date, 'Performed By': c.performed_by_name || '',
      Outcome: c.outcome, Notes: c.notes || '',
    })), 'PCS_Quality_Checks')
  }

  if (piLoad || cLoad) return <LoadingState message="Loading quality data..." />

  const itemColumns = [
    { key: 'name', label: 'Plan Item', render: (r) => <span style={{ color: BRAND.purple }}>{r.name}</span> },
    { key: 'category', label: 'Category', render: (r) => <StatusBadge status={r.category} /> },
    { key: 'frequency', label: 'Frequency', render: (r) => humanize(r.frequency) },
    { key: 'project_id', label: 'Project', render: (r) => prjMap[r.project_id] || 'Sector-wide' },
    { key: 'responsible_name', label: 'Responsible', render: (r) => r.responsible_name || '--' },
    { key: 'checks', label: 'Checks', align: 'right', render: (r) => checks.filter(c => c.quality_plan_item_id === r.id).length },
    { key: 'is_active', label: 'Status', render: (r) => <StatusBadge status={r.is_active ? 'active' : 'inactive'} /> },
  ]

  const checkColumns = [
    { key: 'quality_plan_item_id', label: 'Plan Item', render: (r) => <span style={{ color: BRAND.purple }}>{planMap[r.quality_plan_item_id]?.name || '--'}</span> },
    { key: 'check_date', label: 'Date', render: (r) => formatDate(r.check_date, true) },
    { key: 'performed_by_name', label: 'Performed By', render: (r) => r.performed_by_name || '--' },
    { key: 'outcome', label: 'Outcome', render: (r) => {
      const color = r.outcome === 'pass' ? BRAND.dataGreen : r.outcome === 'fail' ? BRAND.dataRed : BRAND.dataAmber
      return <StatusBadge status={r.outcome} />
    }},
    { key: 'notes', label: 'Notes', render: (r) => r.notes ? (r.notes.slice(0, 60) + (r.notes.length > 60 ? '...' : '')) : '--' },
  ]

  return (
    <div>
      <PageHeader title="Quality" subtitle="Quality management and compliance tracking" action={can('manage_quality') ? openNewItem : null} actionLabel="Add Plan Item" actionIcon="plus" />

      {/* Dashboard KPIs */}
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '20px' }}>
        <KpiCard label="Active Plan Items" value={activeItems.length} color={BRAND.purple} />
        <KpiCard label="Compliance Rate" value={formatPct(complianceRate)} sub="Checked this month" color={complianceRate >= 0.8 ? BRAND.dataGreen : BRAND.dataAmber} />
        <KpiCard label="Pass Rate" value={formatPct(passRate)} sub={`${totalChecks} total checks`} color={passRate >= 0.9 ? BRAND.dataGreen : BRAND.dataAmber} />
        <KpiCard label="Failures" value={failCount} color={failCount > 0 ? BRAND.dataRed : BRAND.dataGreen} />
      </div>

      {/* Category breakdown */}
      {Object.keys(categoryCounts).length > 0 && (
        <Card title="Items by Category" style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', gap: '24px' }}>
            {Object.entries(categoryCounts).map(([cat, count]) => (
              <div key={cat}>
                <div style={{ fontSize: '20px', color: BRAND.purple }}>{count}</div>
                <div style={{ fontSize: '12px', color: BRAND.greyMuted }}>{humanize(cat)}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <TabBar tabs={[
        { key: 'dashboard', label: 'Plan Items' },
        { key: 'checks', label: `Checks (${checks.length})` },
      ]} activeTab={tab} onTabChange={setTab} />

      {tab === 'dashboard' && (
        <>
          <FilterBar>
            <FilterChip label="Active" active={filter === 'active'} onClick={() => setFilter('active')} />
            <FilterChip label="Inactive" active={filter === 'inactive'} onClick={() => setFilter('inactive')} />
            <FilterChip label="All" active={filter === 'all'} onClick={() => setFilter('all')} />
            <div style={{ flex: 1 }} />
            <button onClick={handleExportItems} style={{ ...BTN_SECONDARY, fontSize: '12px', padding: '6px 14px' }}>Export CSV</button>
          </FilterBar>
          <DataTable columns={itemColumns} rows={filteredItems} onRowClick={can('manage_quality') ? openEditItem : null} emptyMessage="No quality plan items" />
        </>
      )}

      {tab === 'checks' && (
        <>
          <FilterBar>
            {can('manage_quality') && (
              <button onClick={() => openNewCheck()} style={{ ...BTN_SECONDARY, fontSize: '12px', padding: '6px 14px' }}>Record Check</button>
            )}
            <div style={{ flex: 1 }} />
            <button onClick={handleExportChecks} style={{ ...BTN_SECONDARY, fontSize: '12px', padding: '6px 14px' }}>Export CSV</button>
          </FilterBar>
          <DataTable columns={checkColumns} rows={checks} onRowClick={can('manage_quality') ? openEditCheck : null} emptyMessage="No quality checks recorded" />
        </>
      )}

      {/* Plan Item Form */}
      <Modal open={showItemForm} onClose={() => setShowItemForm(false)} title={editingItem ? 'Edit Plan Item' : 'Add Plan Item'} width="520px">
        <div style={{ background: BRAND.purpleLight, padding: '20px' }}>
          <FormField label="Name" required>
            <TextInput value={itemForm.name} onChange={v => setItemForm({ ...itemForm, name: v })} placeholder="Document review checklist" />
          </FormField>
          <FormField label="Description">
            <TextInput value={itemForm.description || ''} onChange={v => setItemForm({ ...itemForm, description: v })} placeholder="Detailed description of quality requirement" />
          </FormField>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <FormField label="Category" required>
              <SelectInput value={itemForm.category} onChange={v => setItemForm({ ...itemForm, category: v })} options={[
                { value: 'process', label: 'Process' }, { value: 'deliverable', label: 'Deliverable' },
                { value: 'compliance', label: 'Compliance' }, { value: 'safety', label: 'Safety' },
              ]} />
            </FormField>
            <FormField label="Frequency" required>
              <SelectInput value={itemForm.frequency} onChange={v => setItemForm({ ...itemForm, frequency: v })} options={[
                { value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' },
                { value: 'quarterly', label: 'Quarterly' }, { value: 'per_deliverable', label: 'Per Deliverable' },
                { value: 'ad_hoc', label: 'Ad Hoc' },
              ]} />
            </FormField>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <FormField label="Project">
              <SelectInput value={itemForm.project_id || ''} onChange={v => setItemForm({ ...itemForm, project_id: v })} placeholder="Sector-wide" options={projects.map(p => ({ value: p.id, label: p.name }))} />
            </FormField>
            <FormField label="Responsible">
              <TextInput value={itemForm.responsible_name || ''} onChange={v => setItemForm({ ...itemForm, responsible_name: v })} placeholder="Name" />
            </FormField>
          </div>
          <FormField label="Status">
            <SelectInput value={itemForm.is_active ? 'true' : 'false'} onChange={v => setItemForm({ ...itemForm, is_active: v === 'true' })} options={[
              { value: 'true', label: 'Active' }, { value: 'false', label: 'Inactive' },
            ]} />
          </FormField>
        </div>
        <FormFooter onCancel={() => setShowItemForm(false)} onSave={saveItem} saving={saving} />
      </Modal>

      {/* Check Form */}
      <Modal open={showCheckForm} onClose={() => setShowCheckForm(false)} title={editingCheck ? 'Edit Check' : 'Record Quality Check'} width="480px">
        <div style={{ background: BRAND.purpleLight, padding: '20px' }}>
          <FormField label="Plan Item" required>
            <SelectInput value={checkForm.quality_plan_item_id || ''} onChange={v => setCheckForm({ ...checkForm, quality_plan_item_id: v })} placeholder="Select..." options={activeItems.map(i => ({ value: i.id, label: i.name }))} />
          </FormField>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <FormField label="Check Date" required>
              <TextInput type="date" value={checkForm.check_date} onChange={v => setCheckForm({ ...checkForm, check_date: v })} />
            </FormField>
            <FormField label="Outcome" required>
              <SelectInput value={checkForm.outcome} onChange={v => setCheckForm({ ...checkForm, outcome: v })} options={[
                { value: 'pass', label: 'Pass' }, { value: 'fail', label: 'Fail' },
                { value: 'partial', label: 'Partial' }, { value: 'not_applicable', label: 'N/A' },
              ]} />
            </FormField>
          </div>
          <FormField label="Performed By">
            <TextInput value={checkForm.performed_by_name || ''} onChange={v => setCheckForm({ ...checkForm, performed_by_name: v })} placeholder="Inspector name" />
          </FormField>
          <FormField label="Notes">
            <TextInput value={checkForm.notes || ''} onChange={v => setCheckForm({ ...checkForm, notes: v })} placeholder="Findings, observations, corrective actions" />
          </FormField>
        </div>
        <FormFooter onCancel={() => setShowCheckForm(false)} onSave={saveCheck} saving={saving} />
      </Modal>
    </div>
  )
}
