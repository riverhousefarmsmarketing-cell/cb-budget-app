import { useState, useMemo } from 'react'
import { BRAND, BTN_SECONDARY } from '../lib/brand'
import { formatDate, humanize } from '../lib/utils'
import { useProjectActions, useMeetingActions, useEmployees, useProjects } from '../hooks/useData'
import { supabase } from '../lib/supabase'
import { PageHeader, DataTable, StatusBadge, LoadingState, FilterBar, FilterChip, Modal, FormField, TextInput, SelectInput, FormFooter, Card, KpiCard } from '../components/SharedUI'
import { useRole } from '../hooks/useRole'
import { useAuth } from '../hooks/useAuth'
import { exportCsv } from '../lib/export'
import { Icon } from '../components/Icons'

const EMPTY_ACTION = { description: '', owner_name: '', project_id: '', due_date: '', status: 'open', priority: 'medium', action_type: 'general' }

export default function ActionsPage() {
  const { userId } = useAuth()
  const { can } = useRole(userId)
  const { data: projectActions, loading: paLoad, refetch: refetchPA } = useProjectActions()
  const { data: meetingActions, loading: maLoad } = useMeetingActions()
  const { data: employees } = useEmployees()
  const { data: projects } = useProjects()
  const [filter, setFilter] = useState('open')
  const [ownerFilter, setOwnerFilter] = useState('all')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ ...EMPTY_ACTION })
  const [saving, setSaving] = useState(false)

  const prjMap = useMemo(() => { const m = {}; projects.forEach(p => { m[p.id] = p.name }); return m }, [projects])

  // Combine both action sources for the "Monday morning" view
  const allActions = useMemo(() => {
    const pa = projectActions.map(a => ({ ...a, source: 'project' }))
    const ma = meetingActions.map(a => ({ ...a, source: 'meeting' }))
    return [...pa, ...ma].sort((a, b) => {
      if (!a.due_date) return 1; if (!b.due_date) return -1
      return a.due_date.localeCompare(b.due_date)
    })
  }, [projectActions, meetingActions])

  // Unique owners
  const owners = useMemo(() => {
    const set = new Set(allActions.map(a => a.owner_name).filter(Boolean))
    return [...set].sort()
  }, [allActions])

  const filtered = useMemo(() => {
    let result = allActions
    if (filter === 'open') result = result.filter(a => a.status === 'open' || a.status === 'in_progress')
    else if (filter === 'completed') result = result.filter(a => a.status === 'completed')
    else if (filter === 'overdue') {
      const today = new Date().toISOString().slice(0, 10)
      result = result.filter(a => (a.status === 'open' || a.status === 'in_progress') && a.due_date && a.due_date < today)
    }
    if (ownerFilter !== 'all') result = result.filter(a => a.owner_name === ownerFilter)
    return result
  }, [allActions, filter, ownerFilter])

  // KPIs
  const today = new Date().toISOString().slice(0, 10)
  const openCount = useMemo(() => allActions.filter(a => a.status === 'open' || a.status === 'in_progress').length, [allActions])
  const overdueCount = useMemo(() => allActions.filter(a => (a.status === 'open' || a.status === 'in_progress') && a.due_date && a.due_date < today).length, [allActions, today])
  const completedCount = useMemo(() => allActions.filter(a => a.status === 'completed').length, [allActions])
  const dueThisWeek = useMemo(() => {
    const weekEnd = new Date(); weekEnd.setDate(weekEnd.getDate() + 7)
    const end = weekEnd.toISOString().slice(0, 10)
    return allActions.filter(a => (a.status === 'open' || a.status === 'in_progress') && a.due_date && a.due_date >= today && a.due_date <= end).length
  }, [allActions, today])

  // Project action CRUD (meeting actions managed in MeetingsPage)
  const openNew = () => { setForm({ ...EMPTY_ACTION }); setEditing(null); setShowForm(true) }
  const openEdit = (row) => {
    if (row.source === 'meeting') return // meeting actions edited on Meetings page
    setForm({ ...row, due_date: row.due_date || '', project_id: row.project_id || '' })
    setEditing(row.id); setShowForm(true)
  }

  const handleSave = async () => {
    setSaving(true)
    const payload = {
      description: form.description, owner_name: form.owner_name || null,
      project_id: form.project_id || null, due_date: form.due_date || null,
      status: form.status, priority: form.priority, action_type: form.action_type,
    }
    if (editing) {
      await supabase.from('project_actions').update(payload).eq('id', editing)
    } else {
      const { data: members } = await supabase.from('sector_members').select('sector_id').limit(1)
      payload.sector_id = members?.[0]?.sector_id
      payload.created_by = userId
      await supabase.from('project_actions').insert(payload)
    }
    setSaving(false); setShowForm(false); refetchPA()
  }

  const handleExport = () => {
    exportCsv(filtered.map(a => ({
      Description: a.description, Owner: a.owner_name || '', Project: prjMap[a.project_id] || '',
      'Due Date': a.due_date || '', Status: a.status, Priority: a.priority,
      Source: a.source === 'meeting' ? 'Meeting' : 'Project', Type: humanize(a.action_type || 'general'),
    })), 'PCS_All_Actions')
  }

  if (paLoad || maLoad) return <LoadingState message="Loading actions..." />

  const columns = [
    { key: 'source', label: '', width: '28px', render: (r) => (
      <Icon name={r.source === 'meeting' ? 'calendar' : 'folder'} size={14} style={{ color: BRAND.greyMuted }} />
    )},
    { key: 'description', label: 'Action', render: (r) => (
      <span style={{ color: r.source === 'meeting' ? BRAND.coolGrey : BRAND.purple }}>
        {(r.description || '').slice(0, 80)}{(r.description || '').length > 80 ? '...' : ''}
      </span>
    )},
    { key: 'owner_name', label: 'Owner', render: (r) => r.owner_name || '--' },
    { key: 'project_id', label: 'Project', render: (r) => prjMap[r.project_id] || '--' },
    { key: 'due_date', label: 'Due', render: (r) => {
      if (!r.due_date) return '--'
      const overdue = (r.status === 'open' || r.status === 'in_progress') && r.due_date < today
      return <span style={{ color: overdue ? BRAND.dataRed : BRAND.coolGrey, fontWeight: overdue ? 500 : 400 }}>{formatDate(r.due_date, true)}{overdue ? ' OVERDUE' : ''}</span>
    }},
    { key: 'priority', label: 'Priority', render: (r) => <StatusBadge status={r.priority} /> },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
  ]

  return (
    <div>
      <PageHeader title="Action Tracker" subtitle="Monday morning — who owes what" action={can('manage_actions') ? openNew : null} actionLabel="Add Action" actionIcon="plus" />

      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '20px' }}>
        <KpiCard label="Open" value={openCount} color={BRAND.dataBlue} />
        <KpiCard label="Overdue" value={overdueCount} color={overdueCount > 0 ? BRAND.dataRed : BRAND.dataGreen} />
        <KpiCard label="Due This Week" value={dueThisWeek} color={BRAND.dataAmber} />
        <KpiCard label="Completed" value={completedCount} color={BRAND.dataGreen} />
      </div>

      <FilterBar>
        <FilterChip label="Open" active={filter === 'open'} onClick={() => setFilter('open')} />
        <FilterChip label="Overdue" active={filter === 'overdue'} onClick={() => setFilter('overdue')} />
        <FilterChip label="Completed" active={filter === 'completed'} onClick={() => setFilter('completed')} />
        <FilterChip label="All" active={filter === 'all'} onClick={() => setFilter('all')} />
        <span style={{ color: BRAND.greyBorder }}>|</span>
        <SelectInput
          value={ownerFilter}
          onChange={setOwnerFilter}
          options={[{ value: 'all', label: 'All owners' }, ...owners.map(o => ({ value: o, label: o }))]}
        />
        <div style={{ flex: 1 }} />
        <button onClick={handleExport} style={{ ...BTN_SECONDARY, fontSize: '12px', padding: '6px 14px' }}>Export CSV</button>
      </FilterBar>

      <DataTable columns={columns} rows={filtered} onRowClick={can('manage_actions') ? openEdit : null} emptyMessage="No actions found" />

      <div style={{ marginTop: '12px', fontSize: '11px', color: BRAND.greyMuted, display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Icon name="folder" size={12} /> Project action</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Icon name="calendar" size={12} /> Meeting action (edit in Meetings)</span>
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? 'Edit Action' : 'Add Action'} width="480px">
        <div style={{ background: BRAND.purpleLight, padding: '20px' }}>
          <FormField label="Description" required>
            <TextInput value={form.description} onChange={v => setForm({ ...form, description: v })} placeholder="Submit compliance report to client" />
          </FormField>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <FormField label="Owner">
              <TextInput value={form.owner_name || ''} onChange={v => setForm({ ...form, owner_name: v })} placeholder="Responsible person" />
            </FormField>
            <FormField label="Project">
              <SelectInput value={form.project_id || ''} onChange={v => setForm({ ...form, project_id: v })} placeholder="Select..." options={projects.map(p => ({ value: p.id, label: p.name }))} />
            </FormField>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            <FormField label="Due Date">
              <TextInput type="date" value={form.due_date || ''} onChange={v => setForm({ ...form, due_date: v })} />
            </FormField>
            <FormField label="Priority">
              <SelectInput value={form.priority} onChange={v => setForm({ ...form, priority: v })} options={[
                { value: 'high', label: 'High' }, { value: 'medium', label: 'Medium' }, { value: 'low', label: 'Low' },
              ]} />
            </FormField>
            <FormField label="Status">
              <SelectInput value={form.status} onChange={v => setForm({ ...form, status: v })} options={[
                { value: 'open', label: 'Open' }, { value: 'in_progress', label: 'In Progress' },
                { value: 'completed', label: 'Completed' }, { value: 'cancelled', label: 'Cancelled' },
              ]} />
            </FormField>
          </div>
          <FormField label="Type">
            <SelectInput value={form.action_type || 'general'} onChange={v => setForm({ ...form, action_type: v })} options={[
              { value: 'general', label: 'General' }, { value: 'compliance', label: 'Compliance' },
              { value: 'financial', label: 'Financial' }, { value: 'client_care', label: 'Client Care' },
            ]} />
          </FormField>
        </div>
        <FormFooter onCancel={() => setShowForm(false)} onSave={handleSave} saving={saving} />
      </Modal>
    </div>
  )
}
