import { useState, useMemo } from 'react'
import { BRAND, BTN_SECONDARY } from '../lib/brand'
import { formatDate, humanize } from '../lib/utils'
import { useMeetings, useMeetingActions, useEmployees, useProjects, useClients } from '../hooks/useData'
import { supabase } from '../lib/supabase'
import { PageHeader, DataTable, StatusBadge, LoadingState, FilterBar, FilterChip, Modal, FormField, TextInput, SelectInput, FormFooter, Card, KpiCard, TabBar } from '../components/SharedUI'
import { useRole } from '../hooks/useRole'
import { useAuth } from '../hooks/useAuth'
import { exportCsv } from '../lib/export'
import { Icon } from '../components/Icons'

const EMPTY_MEETING = { title: '', meeting_type: 'internal', project_id: '', client_id: '', meeting_date: '', location: '', notes: '', agenda: '' }
const EMPTY_ACTION = { description: '', owner_name: '', due_date: '', status: 'open', priority: 'medium' }

export default function MeetingsPage() {
  const { userId } = useAuth()
  const { can } = useRole(userId)
  const { data: meetings, loading: mLoad, refetch: refetchMeetings } = useMeetings()
  const { data: actions, loading: aLoad, refetch: refetchActions } = useMeetingActions()
  const { data: employees } = useEmployees()
  const { data: projects } = useProjects()
  const { data: clients } = useClients()
  const [tab, setTab] = useState('meetings')
  const [filter, setFilter] = useState('all')
  const [showMeetingForm, setShowMeetingForm] = useState(false)
  const [showActionForm, setShowActionForm] = useState(false)
  const [editingMeeting, setEditingMeeting] = useState(null)
  const [editingAction, setEditingAction] = useState(null)
  const [mForm, setMForm] = useState({ ...EMPTY_MEETING })
  const [aForm, setAForm] = useState({ ...EMPTY_ACTION })
  const [saving, setSaving] = useState(false)
  const [selectedMeeting, setSelectedMeeting] = useState(null)

  const prjMap = useMemo(() => { const m = {}; projects.forEach(p => { m[p.id] = p.name }); return m }, [projects])
  const clientMap = useMemo(() => { const m = {}; clients.forEach(c => { m[c.id] = c.name }); return m }, [clients])

  const filteredMeetings = useMemo(() => {
    if (filter === 'all') return meetings
    return meetings.filter(m => m.meeting_type === filter)
  }, [meetings, filter])

  const meetingActions = useMemo(() => {
    if (!selectedMeeting) return actions
    return actions.filter(a => a.meeting_id === selectedMeeting)
  }, [actions, selectedMeeting])

  // KPIs
  const upcomingCount = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return meetings.filter(m => m.meeting_date >= today).length
  }, [meetings])
  const openActionCount = useMemo(() => actions.filter(a => a.status === 'open' || a.status === 'in_progress').length, [actions])
  const overdueActionCount = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return actions.filter(a => (a.status === 'open' || a.status === 'in_progress') && a.due_date && a.due_date < today).length
  }, [actions])

  // Meeting CRUD
  const openNewMeeting = () => { setMForm({ ...EMPTY_MEETING }); setEditingMeeting(null); setShowMeetingForm(true) }
  const openEditMeeting = (row) => {
    setMForm({ ...row, meeting_date: row.meeting_date || '', project_id: row.project_id || '', client_id: row.client_id || '' })
    setEditingMeeting(row.id); setShowMeetingForm(true)
  }

  const saveMeeting = async () => {
    setSaving(true)
    const payload = {
      title: mForm.title, meeting_type: mForm.meeting_type,
      project_id: mForm.project_id || null, client_id: mForm.client_id || null,
      meeting_date: mForm.meeting_date, location: mForm.location || null,
      notes: mForm.notes || null, agenda: mForm.agenda || null,
    }
    if (editingMeeting) {
      await supabase.from('meetings').update(payload).eq('id', editingMeeting)
    } else {
      const { data: members } = await supabase.from('sector_members').select('sector_id').limit(1)
      payload.sector_id = members?.[0]?.sector_id
      payload.created_by = userId
      await supabase.from('meetings').insert(payload)
    }
    setSaving(false); setShowMeetingForm(false); refetchMeetings()
  }

  // Action CRUD
  const openNewAction = (meetingId) => {
    setAForm({ ...EMPTY_ACTION, meeting_id: meetingId || selectedMeeting || '' })
    setEditingAction(null); setShowActionForm(true)
  }
  const openEditAction = (row) => {
    setAForm({ ...row, due_date: row.due_date || '' })
    setEditingAction(row.id); setShowActionForm(true)
  }

  const saveAction = async () => {
    setSaving(true)
    const payload = {
      meeting_id: aForm.meeting_id, description: aForm.description,
      owner_name: aForm.owner_name || null, due_date: aForm.due_date || null,
      status: aForm.status, priority: aForm.priority,
    }
    if (editingAction) {
      await supabase.from('meeting_actions').update(payload).eq('id', editingAction)
    } else {
      const { data: members } = await supabase.from('sector_members').select('sector_id').limit(1)
      payload.sector_id = members?.[0]?.sector_id
      await supabase.from('meeting_actions').insert(payload)
    }
    setSaving(false); setShowActionForm(false); refetchActions()
  }

  const handleExportMeetings = () => {
    exportCsv(filteredMeetings.map(m => ({
      Title: m.title, Type: humanize(m.meeting_type), Date: m.meeting_date,
      Project: prjMap[m.project_id] || '', Client: clientMap[m.client_id] || '',
      Location: m.location || '',
    })), 'PCS_Meetings')
  }

  const handleExportActions = () => {
    exportCsv(meetingActions.map(a => ({
      Description: a.description, Owner: a.owner_name || '', Due: a.due_date || '',
      Status: a.status, Priority: a.priority,
    })), 'PCS_Meeting_Actions')
  }

  if (mLoad || aLoad) return <LoadingState message="Loading meetings..." />

  const meetingColumns = [
    { key: 'title', label: 'Meeting', render: (r) => (
      <span style={{ color: BRAND.purple, cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); setSelectedMeeting(r.id); setTab('actions') }}>{r.title}</span>
    )},
    { key: 'meeting_type', label: 'Type', render: (r) => <StatusBadge status={r.meeting_type} /> },
    { key: 'meeting_date', label: 'Date', render: (r) => formatDate(r.meeting_date, true) },
    { key: 'project_id', label: 'Project', render: (r) => prjMap[r.project_id] || '--' },
    { key: 'client_id', label: 'Client', render: (r) => clientMap[r.client_id] || '--' },
    { key: 'location', label: 'Location', render: (r) => r.location || '--' },
    { key: 'actions', label: 'Actions', align: 'right', render: (r) => {
      const count = actions.filter(a => a.meeting_id === r.id).length
      return count > 0 ? <span style={{ color: BRAND.dataBlue }}>{count}</span> : '--'
    }},
  ]

  const actionColumns = [
    { key: 'description', label: 'Action', render: (r) => <span style={{ color: BRAND.purple }}>{(r.description || '').slice(0, 80)}{(r.description || '').length > 80 ? '...' : ''}</span> },
    { key: 'owner_name', label: 'Owner', render: (r) => r.owner_name || '--' },
    { key: 'due_date', label: 'Due', render: (r) => {
      if (!r.due_date) return '--'
      const overdue = (r.status === 'open' || r.status === 'in_progress') && r.due_date < new Date().toISOString().slice(0, 10)
      return <span style={{ color: overdue ? BRAND.dataRed : BRAND.coolGrey }}>{formatDate(r.due_date, true)}{overdue ? ' (overdue)' : ''}</span>
    }},
    { key: 'priority', label: 'Priority', render: (r) => <StatusBadge status={r.priority} /> },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
  ]

  return (
    <div>
      <PageHeader title="Meetings" subtitle="Meeting management and action tracking" action={can('manage_meetings') ? openNewMeeting : null} actionLabel="Add Meeting" actionIcon="plus" />

      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '20px' }}>
        <KpiCard label="Total Meetings" value={meetings.length} color={BRAND.purple} />
        <KpiCard label="Upcoming" value={upcomingCount} color={BRAND.dataTeal} />
        <KpiCard label="Open Actions" value={openActionCount} color={BRAND.dataBlue} />
        <KpiCard label="Overdue Actions" value={overdueActionCount} color={overdueActionCount > 0 ? BRAND.dataRed : BRAND.dataGreen} />
      </div>

      <TabBar tabs={[
        { key: 'meetings', label: 'Meetings' },
        { key: 'actions', label: `Actions (${meetingActions.length})` },
      ]} activeTab={tab} onTabChange={(t) => { setTab(t); if (t === 'meetings') setSelectedMeeting(null) }} />

      {tab === 'meetings' && (
        <>
          <FilterBar>
            <FilterChip label="All" active={filter === 'all'} onClick={() => setFilter('all')} />
            <FilterChip label="Internal" active={filter === 'internal'} onClick={() => setFilter('internal')} />
            <FilterChip label="Client" active={filter === 'client'} onClick={() => setFilter('client')} />
            <FilterChip label="Project" active={filter === 'project'} onClick={() => setFilter('project')} />
            <div style={{ flex: 1 }} />
            <button onClick={handleExportMeetings} style={{ ...BTN_SECONDARY, fontSize: '12px', padding: '6px 14px' }}>Export CSV</button>
          </FilterBar>
          <DataTable columns={meetingColumns} rows={filteredMeetings} onRowClick={can('manage_meetings') ? openEditMeeting : null} emptyMessage="No meetings found" />
        </>
      )}

      {tab === 'actions' && (
        <>
          {selectedMeeting && (
            <div style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button onClick={() => setSelectedMeeting(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: BRAND.purple, fontSize: '13px', fontFamily: BRAND.font, display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Icon name="chevronLeft" size={14} /> All actions
              </button>
              <span style={{ color: BRAND.greyMuted, fontSize: '13px' }}>Filtered to: {meetings.find(m => m.id === selectedMeeting)?.title}</span>
            </div>
          )}
          <FilterBar>
            {can('manage_actions') && (
              <button onClick={() => openNewAction()} style={{ ...BTN_SECONDARY, fontSize: '12px', padding: '6px 14px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Icon name="plus" size={14} /> Add Action
              </button>
            )}
            <div style={{ flex: 1 }} />
            <button onClick={handleExportActions} style={{ ...BTN_SECONDARY, fontSize: '12px', padding: '6px 14px' }}>Export CSV</button>
          </FilterBar>
          <DataTable columns={actionColumns} rows={meetingActions} onRowClick={can('manage_actions') ? openEditAction : null} emptyMessage="No actions found" />
        </>
      )}

      {/* Meeting Form */}
      <Modal open={showMeetingForm} onClose={() => setShowMeetingForm(false)} title={editingMeeting ? 'Edit Meeting' : 'Add Meeting'} width="520px">
        <div style={{ background: BRAND.purpleLight, padding: '20px' }}>
          <FormField label="Title" required>
            <TextInput value={mForm.title} onChange={v => setMForm({ ...mForm, title: v })} placeholder="Weekly project review" />
          </FormField>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <FormField label="Type" required>
              <SelectInput value={mForm.meeting_type} onChange={v => setMForm({ ...mForm, meeting_type: v })} options={[
                { value: 'internal', label: 'Internal' }, { value: 'client', label: 'Client' }, { value: 'project', label: 'Project' },
              ]} />
            </FormField>
            <FormField label="Date" required>
              <TextInput type="date" value={mForm.meeting_date} onChange={v => setMForm({ ...mForm, meeting_date: v })} />
            </FormField>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <FormField label="Project">
              <SelectInput value={mForm.project_id || ''} onChange={v => setMForm({ ...mForm, project_id: v })} placeholder="Select..." options={projects.map(p => ({ value: p.id, label: p.name }))} />
            </FormField>
            <FormField label="Client">
              <SelectInput value={mForm.client_id || ''} onChange={v => setMForm({ ...mForm, client_id: v })} placeholder="Select..." options={clients.map(c => ({ value: c.id, label: c.name }))} />
            </FormField>
          </div>
          <FormField label="Location">
            <TextInput value={mForm.location || ''} onChange={v => setMForm({ ...mForm, location: v })} placeholder="Conference Room / Teams" />
          </FormField>
          <FormField label="Agenda">
            <TextInput value={mForm.agenda || ''} onChange={v => setMForm({ ...mForm, agenda: v })} placeholder="Meeting agenda items" />
          </FormField>
          <FormField label="Notes / Minutes">
            <TextInput value={mForm.notes || ''} onChange={v => setMForm({ ...mForm, notes: v })} placeholder="Key discussion points and decisions" />
          </FormField>
        </div>
        <FormFooter onCancel={() => setShowMeetingForm(false)} onSave={saveMeeting} saving={saving} />
      </Modal>

      {/* Action Form */}
      <Modal open={showActionForm} onClose={() => setShowActionForm(false)} title={editingAction ? 'Edit Action' : 'Add Action'} width="480px">
        <div style={{ background: BRAND.purpleLight, padding: '20px' }}>
          <FormField label="Meeting" required>
            <SelectInput value={aForm.meeting_id || ''} onChange={v => setAForm({ ...aForm, meeting_id: v })} placeholder="Select meeting..." options={meetings.map(m => ({ value: m.id, label: `${formatDate(m.meeting_date, true)} - ${m.title}` }))} />
          </FormField>
          <FormField label="Description" required>
            <TextInput value={aForm.description} onChange={v => setAForm({ ...aForm, description: v })} placeholder="Action to be completed" />
          </FormField>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <FormField label="Owner">
              <TextInput value={aForm.owner_name || ''} onChange={v => setAForm({ ...aForm, owner_name: v })} placeholder="Responsible person" />
            </FormField>
            <FormField label="Due Date">
              <TextInput type="date" value={aForm.due_date || ''} onChange={v => setAForm({ ...aForm, due_date: v })} />
            </FormField>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <FormField label="Priority">
              <SelectInput value={aForm.priority} onChange={v => setAForm({ ...aForm, priority: v })} options={[
                { value: 'high', label: 'High' }, { value: 'medium', label: 'Medium' }, { value: 'low', label: 'Low' },
              ]} />
            </FormField>
            <FormField label="Status">
              <SelectInput value={aForm.status} onChange={v => setAForm({ ...aForm, status: v })} options={[
                { value: 'open', label: 'Open' }, { value: 'in_progress', label: 'In Progress' },
                { value: 'completed', label: 'Completed' }, { value: 'cancelled', label: 'Cancelled' },
              ]} />
            </FormField>
          </div>
        </div>
        <FormFooter onCancel={() => setShowActionForm(false)} onSave={saveAction} saving={saving} />
      </Modal>
    </div>
  )
}
