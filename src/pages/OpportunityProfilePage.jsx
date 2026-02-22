import { useState, useEffect } from 'react'
import { BRAND } from '../lib/brand'
import { formatDate, formatCurrency, formatCurrencyExact } from '../lib/utils'
import { supabase } from '../lib/supabase'
import { PCS_SECTOR_ID } from '../hooks/useData'
import { SectionHeader, LoadingState, StatusBadge, KPICard, ClientLink } from '../components/SharedUI'
import { auditDelete } from '../lib/auditDelete'

// ============================================================================
// Status maps
// ============================================================================
const pursuitStageMap = {
  identified: { bg: BRAND.greyLight, text: BRAND.coolGrey, label: 'Identified' },
  qualifying: { bg: '#FFF4E5', text: BRAND.amber, label: 'Qualifying' },
  proposal_prep: { bg: '#E8F4FD', text: BRAND.blue, label: 'Proposal Prep' },
  proposal_submitted: { bg: '#E8F4FD', text: BRAND.blue, label: 'Proposal Submitted' },
  negotiation: { bg: '#FFF4E5', text: BRAND.amber, label: 'Negotiation' },
  awaiting_decision: { bg: '#FFF4E5', text: BRAND.amber, label: 'Awaiting Decision' },
  won: { bg: '#E8F5E8', text: BRAND.green, label: 'Won' },
  lost: { bg: '#FDECEC', text: BRAND.red, label: 'Lost' },
}

const probMap = {
  committed: { bg: '#E8F5E8', text: BRAND.green, label: 'Committed (100%)' },
  high: { bg: '#E8F4FD', text: BRAND.blue, label: 'High (75%)' },
  medium: { bg: '#FFF4E5', text: BRAND.amber, label: 'Medium (50%)' },
  low: { bg: '#FDECEC', text: BRAND.red, label: 'Low (25%)' },
}

const relationshipMap = {
  new: { bg: BRAND.greyLight, text: BRAND.coolGrey, label: 'New' },
  warm: { bg: '#FFF4E5', text: BRAND.amber, label: 'Warm' },
  engaged: { bg: '#E8F4FD', text: BRAND.blue, label: 'Engaged' },
  champion: { bg: '#E8F5E8', text: BRAND.green, label: 'Champion' },
  blocker: { bg: '#FDECEC', text: BRAND.red, label: 'Blocker' },
}

const activityTypeMap = {
  meeting: { bg: '#E8F4FD', text: BRAND.blue, label: 'Meeting' },
  call: { bg: '#E8F4FD', text: BRAND.blue, label: 'Call' },
  email: { bg: BRAND.greyLight, text: BRAND.coolGrey, label: 'Email' },
  proposal: { bg: '#FFF4E5', text: BRAND.amber, label: 'Proposal' },
  site_visit: { bg: '#E8F5E8', text: BRAND.green, label: 'Site Visit' },
  presentation: { bg: '#FFF4E5', text: BRAND.amber, label: 'Presentation' },
  negotiation: { bg: '#FDECEC', text: BRAND.red, label: 'Negotiation' },
  other: { bg: BRAND.greyLight, text: BRAND.coolGrey, label: 'Other' },
}

const noteTypeMap = {
  general: { bg: BRAND.greyLight, text: BRAND.coolGrey, label: 'General' },
  strategy: { bg: '#E8F4FD', text: BRAND.blue, label: 'Strategy' },
  risk: { bg: '#FDECEC', text: BRAND.red, label: 'Risk' },
  competitor: { bg: '#FFF4E5', text: BRAND.amber, label: 'Competitor' },
  pricing: { bg: '#E8F5E8', text: BRAND.green, label: 'Pricing' },
  relationship: { bg: '#E8F4FD', text: BRAND.blue, label: 'Relationship' },
}

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'contacts', label: 'Contacts' },
  { key: 'activities', label: 'Activities' },
  { key: 'notes', label: 'Notes' },
]

// ============================================================================
// Main Component
// ============================================================================
export default function OpportunityProfilePage({ forecastId, onBack }) {
  const [forecast, setForecast] = useState(null)
  const [allocations, setAllocations] = useState([])
  const [contacts, setContacts] = useState([])
  const [activities, setActivities] = useState([])
  const [notes, setNotes] = useState([])
  const [client, setClient] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('overview')

  useEffect(() => { loadAll() }, [forecastId])

  async function loadAll() {
    setLoading(true)
    const [fRes, faRes, cRes, actRes, nRes] = await Promise.all([
      supabase.from('forecasts').select('*').eq('id', forecastId).single(),
      supabase.from('forecast_allocations').select('*').eq('forecast_id', forecastId).order('month'),
      supabase.from('opportunity_contacts').select('*').eq('forecast_id', forecastId).order('created_at'),
      supabase.from('opportunity_activities').select('*').eq('forecast_id', forecastId).order('activity_date', { ascending: false }),
      supabase.from('opportunity_notes').select('*').eq('forecast_id', forecastId).order('created_at', { ascending: false }),
    ])
    setForecast(fRes.data)
    setAllocations(faRes.data || [])
    setContacts(cRes.data || [])
    setActivities(actRes.data || [])
    setNotes(nRes.data || [])

    if (fRes.data?.proposed_client_id) {
      const { data: cl } = await supabase.from('clients').select('id, name').eq('id', fRes.data.proposed_client_id).single()
      setClient(cl)
    }
    setLoading(false)
  }

  async function updateStage(newStage) {
    const { error } = await supabase.from('forecasts').update({ pursuit_stage: newStage }).eq('id', forecastId)
    if (!error) setForecast(prev => ({ ...prev, pursuit_stage: newStage }))
  }

  async function updateStatus(newStatus) {
    const { error } = await supabase.from('forecasts').update({ status: newStatus }).eq('id', forecastId)
    if (!error) setForecast(prev => ({ ...prev, status: newStatus }))
  }

  if (loading) return <LoadingState message="Loading opportunity..." />
  if (!forecast) return <div style={{ padding: '40px', color: BRAND.coolGrey }}>Opportunity not found.</div>

  const totalHours = allocations.reduce((s, a) => s + Number(a.planned_hours), 0)
  const grossRev = totalHours * Number(forecast.bill_rate)
  const weightedRev = grossRev * Number(forecast.probability_weight)

  const selectStyle = {
    padding: '6px 10px', border: `1px solid ${BRAND.greyBorder}`,
    fontFamily: BRAND.font, fontSize: '13px', color: BRAND.coolGrey, background: BRAND.white,
  }
  const inputStyle = {
    width: '100%', padding: '8px 12px', border: `1px solid ${BRAND.greyBorder}`,
    fontFamily: BRAND.font, fontSize: '14px', color: BRAND.coolGrey, boxSizing: 'border-box',
  }
  const labelStyle = { display: 'block', fontSize: '12px', color: BRAND.coolGrey, marginBottom: '4px' }

  return (
    <div>
      {/* Back button + header */}
      <div style={{ marginBottom: '20px' }}>
        <button onClick={onBack} style={{
          background: 'none', border: 'none', color: BRAND.purple, cursor: 'pointer',
          fontFamily: BRAND.font, fontSize: '13px', padding: 0, marginBottom: '12px',
        }}>Back to Forecast Planner</button>
      </div>

      <SectionHeader
        title={forecast.name}
        subtitle={`${forecast.forecast_type === 'new_project' ? 'New Project' : 'Change Order'} -- ${client ? client.name : 'No client assigned'}`}
      />

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        <KPICard label="Gross Revenue" value={formatCurrency(grossRev)} />
        <KPICard label="Weighted Revenue" value={formatCurrency(weightedRev)} color={BRAND.teal} />
        <KPICard label="Bill Rate" value={formatCurrencyExact(forecast.bill_rate)} subValue="/hour" />
        <KPICard label="Total Hours" value={totalHours.toLocaleString()} />
        <KPICard label="Contacts" value={contacts.length} color={BRAND.blue} />
        <KPICard label="Activities" value={activities.length} color={BRAND.amber} />
      </div>

      {/* Stage + Status controls */}
      <div style={{ display: 'flex', gap: '20px', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap' }}>
        <div>
          <label style={labelStyle}>Pursuit Stage</label>
          <select value={forecast.pursuit_stage || 'identified'} onChange={e => updateStage(e.target.value)} style={selectStyle}>
            <option value="identified">Identified</option>
            <option value="qualifying">Qualifying</option>
            <option value="proposal_prep">Proposal Prep</option>
            <option value="proposal_submitted">Proposal Submitted</option>
            <option value="negotiation">Negotiation</option>
            <option value="awaiting_decision">Awaiting Decision</option>
            <option value="won">Won</option>
            <option value="lost">Lost</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>Status</label>
          <select value={forecast.status} onChange={e => updateStatus(e.target.value)} style={selectStyle}>
            <option value="draft">Draft</option>
            <option value="submitted">Submitted</option>
            <option value="approved">Approved</option>
            <option value="won">Won</option>
            <option value="lost">Lost</option>
          </select>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
          <StatusBadge status={forecast.pursuit_stage || 'identified'} map={pursuitStageMap} />
          <StatusBadge status={forecast.probability} map={probMap} />
        </div>
        <div style={{ marginLeft: 'auto', fontSize: '12px', color: BRAND.coolGrey }}>
          {formatDate(forecast.start_date)} -- {formatDate(forecast.end_date)}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0', borderBottom: `2px solid ${BRAND.greyBorder}`, marginBottom: '24px' }}>
        {TABS.map(t => {
          const isActive = tab === t.key
          return (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              padding: '10px 24px', background: isActive ? BRAND.purple : 'transparent',
              color: isActive ? BRAND.white : BRAND.coolGrey,
              border: 'none', cursor: 'pointer', fontFamily: BRAND.font, fontSize: '13px',
              borderBottom: isActive ? `2px solid ${BRAND.purple}` : '2px solid transparent',
              marginBottom: '-2px',
            }}>{t.label}</button>
          )
        })}
      </div>

      {tab === 'overview' && <OverviewTab forecast={forecast} allocations={allocations} client={client} />}
      {tab === 'contacts' && <ContactsTab contacts={contacts} forecastId={forecastId} reload={loadAll} inputStyle={inputStyle} labelStyle={labelStyle} />}
      {tab === 'activities' && <ActivitiesTab activities={activities} forecastId={forecastId} reload={loadAll} inputStyle={inputStyle} labelStyle={labelStyle} />}
      {tab === 'notes' && <NotesTab notes={notes} forecastId={forecastId} reload={loadAll} inputStyle={inputStyle} labelStyle={labelStyle} />}
    </div>
  )
}

// ============================================================================
// OVERVIEW TAB
// ============================================================================
function OverviewTab({ forecast, allocations, client }) {
  const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

  return (
    <div>
      <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, padding: '24px', marginBottom: '24px' }}>
        <div style={{ fontSize: '14px', color: BRAND.purple, marginBottom: '16px' }}>Opportunity Details</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', fontSize: '13px' }}>
          <div>
            <span style={{ color: BRAND.coolGrey, display: 'block', fontSize: '12px', marginBottom: '4px' }}>Type</span>
            {forecast.forecast_type === 'new_project' ? 'New Project' : 'Change Order'}
          </div>
          <div>
            <span style={{ color: BRAND.coolGrey, display: 'block', fontSize: '12px', marginBottom: '4px' }}>Client</span>
            {client ? <ClientLink id={client.id}>{client.name}</ClientLink> : '—'}
          </div>
          <div>
            <span style={{ color: BRAND.coolGrey, display: 'block', fontSize: '12px', marginBottom: '4px' }}>Assigned To</span>
            {forecast.assigned_to_name || '—'}
          </div>
          <div>
            <span style={{ color: BRAND.coolGrey, display: 'block', fontSize: '12px', marginBottom: '4px' }}>Start Date</span>
            {formatDate(forecast.start_date)}
          </div>
          <div>
            <span style={{ color: BRAND.coolGrey, display: 'block', fontSize: '12px', marginBottom: '4px' }}>End Date</span>
            {formatDate(forecast.end_date)}
          </div>
          <div>
            <span style={{ color: BRAND.coolGrey, display: 'block', fontSize: '12px', marginBottom: '4px' }}>Created</span>
            {formatDate(forecast.created_at)}
          </div>
        </div>
        {forecast.description && (
          <div style={{ marginTop: '16px', fontSize: '13px', color: BRAND.coolGrey }}>
            <span style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>Description</span>
            {forecast.description}
          </div>
        )}
      </div>

      {allocations.length > 0 && (
        <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, overflowX: 'auto' }}>
          <div style={{ padding: '16px 20px', fontSize: '14px', color: BRAND.purple }}>Monthly Resource Allocation</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr>
                {['Month', 'Planned Hours', 'Revenue'].map(h => (
                  <th key={h} style={{
                    background: BRAND.purple, color: BRAND.white, padding: '10px 14px',
                    textAlign: 'left', fontWeight: 400, whiteSpace: 'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allocations.map((a, i) => {
                const d = new Date(a.month)
                const label = `${MONTH_LABELS[d.getMonth()]} ${d.getFullYear()}`
                const rev = Number(a.planned_hours) * Number(forecast.bill_rate)
                return (
                  <tr key={a.id} style={{ background: i % 2 === 0 ? BRAND.white : BRAND.greyLight }}>
                    <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, color: BRAND.coolGrey }}>{label}</td>
                    <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, color: BRAND.coolGrey }}>{Number(a.planned_hours).toLocaleString()}</td>
                    <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, color: BRAND.teal }}>{formatCurrency(rev)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// CONTACTS TAB — Full CRUD with Edit + Delete (auditDelete)
// ============================================================================
function ContactsTab({ contacts, forecastId, reload, inputStyle, labelStyle }) {
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState({ name: '', organisation: '', role: '', email: '', phone: '', relationship_status: 'new', notes: '' })

  function resetForm() {
    setForm({ name: '', organisation: '', role: '', email: '', phone: '', relationship_status: 'new', notes: '' })
    setEditId(null)
    setShowForm(false)
  }

  function startEdit(contact) {
    setForm({
      name: contact.name || '',
      organisation: contact.organisation || '',
      role: contact.role || '',
      email: contact.email || '',
      phone: contact.phone || '',
      relationship_status: contact.relationship_status || 'new',
      notes: contact.notes || '',
    })
    setEditId(contact.id)
    setShowForm(true)
  }

  async function handleSubmit(e) {
    e.preventDefault(); setSaving(true)
    const payload = {
      name: form.name, organisation: form.organisation || null, role: form.role || null,
      email: form.email || null, phone: form.phone || null,
      relationship_status: form.relationship_status, notes: form.notes || null,
    }

    let error
    if (editId) {
      ;({ error } = await supabase.from('opportunity_contacts').update(payload).eq('id', editId))
    } else {
      ;({ error } = await supabase.from('opportunity_contacts').insert({
        sector_id: PCS_SECTOR_ID, forecast_id: forecastId, ...payload,
      }))
    }
    if (!error) { resetForm(); reload() }
    setSaving(false)
  }

  async function handleDelete(contact) {
    if (!confirm(`Delete contact "${contact.name}"?`)) return
    await auditDelete('opportunity_contacts', contact.id, contact)
    reload()
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <span style={{ fontSize: '14px', color: BRAND.coolGrey }}>{contacts.length} contact{contacts.length !== 1 ? 's' : ''}</span>
        <button onClick={() => { if (showForm && !editId) { resetForm() } else { resetForm(); setShowForm(true) } }} style={{
          padding: '8px 20px', background: BRAND.purple, color: BRAND.white,
          border: 'none', cursor: 'pointer', fontFamily: BRAND.font, fontSize: '13px',
        }}>{showForm && !editId ? 'Cancel' : 'Add Contact'}</button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} style={{ background: BRAND.purpleLight, border: `1px solid ${BRAND.greyBorder}`, padding: '20px', marginBottom: '16px' }}>
          {editId && <div style={{ fontSize: '13px', color: BRAND.purple, marginBottom: '12px' }}>Editing: {form.name}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div><label style={labelStyle}>Name</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required style={inputStyle} /></div>
            <div><label style={labelStyle}>Organization</label><input value={form.organisation} onChange={e => setForm({ ...form, organisation: e.target.value })} style={inputStyle} /></div>
            <div><label style={labelStyle}>Role</label><input value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} style={inputStyle} /></div>
            <div><label style={labelStyle}>Email</label><input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} style={inputStyle} /></div>
            <div><label style={labelStyle}>Phone</label><input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} style={inputStyle} /></div>
            <div><label style={labelStyle}>Relationship</label>
              <select value={form.relationship_status} onChange={e => setForm({ ...form, relationship_status: e.target.value })} style={inputStyle}>
                <option value="new">New</option><option value="warm">Warm</option>
                <option value="engaged">Engaged</option><option value="champion">Champion</option>
                <option value="blocker">Blocker</option>
              </select>
            </div>
          </div>
          <div style={{ marginBottom: '12px' }}><label style={labelStyle}>Notes</label><input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} style={inputStyle} /></div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" onClick={resetForm} style={{ padding: '8px 20px', background: BRAND.white, color: BRAND.coolGrey, border: `1px solid ${BRAND.greyBorder}`, cursor: 'pointer', fontFamily: BRAND.font, fontSize: '13px' }}>Cancel</button>
            <button type="submit" disabled={saving} style={{ padding: '8px 20px', background: BRAND.purple, color: BRAND.white, border: 'none', cursor: 'pointer', fontFamily: BRAND.font, fontSize: '13px' }}>{saving ? 'Saving...' : (editId ? 'Update' : 'Save')}</button>
          </div>
        </form>
      )}

      <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr>
              {['Name', 'Organization', 'Role', 'Email', 'Phone', 'Relationship', 'Notes', ''].map(h => (
                <th key={h} style={{ background: BRAND.purple, color: BRAND.white, padding: '10px 14px', textAlign: 'left', fontWeight: 400, whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {contacts.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: '40px 24px', color: BRAND.coolGrey }}>No contacts added yet.</td></tr>
            ) : (
              contacts.map((c, i) => (
                <tr key={c.id} style={{ background: i % 2 === 0 ? BRAND.white : BRAND.greyLight }}>
                  <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, color: BRAND.coolGrey }}>{c.name}</td>
                  <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, color: BRAND.coolGrey }}>{c.organisation || '—'}</td>
                  <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, color: BRAND.coolGrey }}>{c.role || '—'}</td>
                  <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, color: BRAND.coolGrey }}>{c.email || '—'}</td>
                  <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, color: BRAND.coolGrey, whiteSpace: 'nowrap' }}>{c.phone || '—'}</td>
                  <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}` }}><StatusBadge status={c.relationship_status} map={relationshipMap} /></td>
                  <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, color: BRAND.coolGrey, fontSize: '12px', maxWidth: '200px' }}>{c.notes || '—'}</td>
                  <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, whiteSpace: 'nowrap' }}>
                    <button onClick={() => startEdit(c)} style={{ background: 'none', border: 'none', color: BRAND.purple, cursor: 'pointer', fontFamily: BRAND.font, fontSize: '12px', padding: '2px 6px' }}>Edit</button>
                    <button onClick={() => handleDelete(c)} style={{ background: 'none', border: 'none', color: BRAND.red, cursor: 'pointer', fontFamily: BRAND.font, fontSize: '12px', padding: '2px 6px' }}>Del</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ============================================================================
// ACTIVITIES TAB — Full CRUD with Edit + Delete (auditDelete)
// ============================================================================
function ActivitiesTab({ activities, forecastId, reload, inputStyle, labelStyle }) {
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState({ activity_type: 'meeting', activity_date: new Date().toISOString().slice(0, 10), description: '', outcome: '', next_steps: '' })

  function resetForm() {
    setForm({ activity_type: 'meeting', activity_date: new Date().toISOString().slice(0, 10), description: '', outcome: '', next_steps: '' })
    setEditId(null)
    setShowForm(false)
  }

  function startEdit(activity) {
    setForm({
      activity_type: activity.activity_type || 'meeting',
      activity_date: activity.activity_date || new Date().toISOString().slice(0, 10),
      description: activity.description || '',
      outcome: activity.outcome || '',
      next_steps: activity.next_steps || '',
    })
    setEditId(activity.id)
    setShowForm(true)
  }

  async function handleSubmit(e) {
    e.preventDefault(); setSaving(true)
    const payload = {
      activity_type: form.activity_type, activity_date: form.activity_date,
      description: form.description, outcome: form.outcome || null, next_steps: form.next_steps || null,
    }

    let error
    if (editId) {
      ;({ error } = await supabase.from('opportunity_activities').update(payload).eq('id', editId))
    } else {
      ;({ error } = await supabase.from('opportunity_activities').insert({
        sector_id: PCS_SECTOR_ID, forecast_id: forecastId, ...payload,
      }))
    }
    if (!error) { resetForm(); reload() }
    setSaving(false)
  }

  async function handleDelete(activity) {
    if (!confirm('Delete this activity?')) return
    await auditDelete('opportunity_activities', activity.id, activity)
    reload()
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <span style={{ fontSize: '14px', color: BRAND.coolGrey }}>{activities.length} activit{activities.length !== 1 ? 'ies' : 'y'}</span>
        <button onClick={() => { if (showForm && !editId) { resetForm() } else { resetForm(); setShowForm(true) } }} style={{
          padding: '8px 20px', background: BRAND.purple, color: BRAND.white,
          border: 'none', cursor: 'pointer', fontFamily: BRAND.font, fontSize: '13px',
        }}>{showForm && !editId ? 'Cancel' : 'Log Activity'}</button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} style={{ background: BRAND.purpleLight, border: `1px solid ${BRAND.greyBorder}`, padding: '20px', marginBottom: '16px' }}>
          {editId && <div style={{ fontSize: '13px', color: BRAND.purple, marginBottom: '12px' }}>Editing activity</div>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div><label style={labelStyle}>Type</label>
              <select value={form.activity_type} onChange={e => setForm({ ...form, activity_type: e.target.value })} style={inputStyle}>
                <option value="meeting">Meeting</option><option value="call">Call</option>
                <option value="email">Email</option><option value="proposal">Proposal</option>
                <option value="site_visit">Site Visit</option><option value="presentation">Presentation</option>
                <option value="negotiation">Negotiation</option><option value="other">Other</option>
              </select>
            </div>
            <div><label style={labelStyle}>Date</label><input type="date" value={form.activity_date} onChange={e => setForm({ ...form, activity_date: e.target.value })} required style={inputStyle} /></div>
            <div><label style={labelStyle}>Description</label><input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} required style={inputStyle} /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div><label style={labelStyle}>Outcome</label><input value={form.outcome} onChange={e => setForm({ ...form, outcome: e.target.value })} style={inputStyle} /></div>
            <div><label style={labelStyle}>Next Steps</label><input value={form.next_steps} onChange={e => setForm({ ...form, next_steps: e.target.value })} style={inputStyle} /></div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" onClick={resetForm} style={{ padding: '8px 20px', background: BRAND.white, color: BRAND.coolGrey, border: `1px solid ${BRAND.greyBorder}`, cursor: 'pointer', fontFamily: BRAND.font, fontSize: '13px' }}>Cancel</button>
            <button type="submit" disabled={saving} style={{ padding: '8px 20px', background: BRAND.purple, color: BRAND.white, border: 'none', cursor: 'pointer', fontFamily: BRAND.font, fontSize: '13px' }}>{saving ? 'Saving...' : (editId ? 'Update' : 'Save')}</button>
          </div>
        </form>
      )}

      <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr>
              {['Date', 'Type', 'Description', 'Outcome', 'Next Steps', ''].map(h => (
                <th key={h} style={{ background: BRAND.purple, color: BRAND.white, padding: '10px 14px', textAlign: 'left', fontWeight: 400, whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {activities.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: '40px 24px', color: BRAND.coolGrey }}>No activities logged yet.</td></tr>
            ) : (
              activities.map((a, i) => (
                <tr key={a.id} style={{ background: i % 2 === 0 ? BRAND.white : BRAND.greyLight }}>
                  <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, color: BRAND.coolGrey, whiteSpace: 'nowrap' }}>{formatDate(a.activity_date)}</td>
                  <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}` }}><StatusBadge status={a.activity_type} map={activityTypeMap} /></td>
                  <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, color: BRAND.coolGrey, maxWidth: '300px' }}>{a.description}</td>
                  <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, color: BRAND.coolGrey }}>{a.outcome || '—'}</td>
                  <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, color: BRAND.coolGrey }}>{a.next_steps || '—'}</td>
                  <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, whiteSpace: 'nowrap' }}>
                    <button onClick={() => startEdit(a)} style={{ background: 'none', border: 'none', color: BRAND.purple, cursor: 'pointer', fontFamily: BRAND.font, fontSize: '12px', padding: '2px 6px' }}>Edit</button>
                    <button onClick={() => handleDelete(a)} style={{ background: 'none', border: 'none', color: BRAND.red, cursor: 'pointer', fontFamily: BRAND.font, fontSize: '12px', padding: '2px 6px' }}>Del</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ============================================================================
// NOTES TAB — Full CRUD with Edit + Delete (auditDelete)
// ============================================================================
function NotesTab({ notes, forecastId, reload, inputStyle, labelStyle }) {
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState({ note_type: 'general', content: '' })

  function resetForm() {
    setForm({ note_type: 'general', content: '' })
    setEditId(null)
    setShowForm(false)
  }

  function startEdit(note) {
    setForm({
      note_type: note.note_type || 'general',
      content: note.content || '',
    })
    setEditId(note.id)
    setShowForm(true)
  }

  async function handleSubmit(e) {
    e.preventDefault(); setSaving(true)
    const payload = {
      note_type: form.note_type, content: form.content,
    }

    let error
    if (editId) {
      ;({ error } = await supabase.from('opportunity_notes').update(payload).eq('id', editId))
    } else {
      ;({ error } = await supabase.from('opportunity_notes').insert({
        sector_id: PCS_SECTOR_ID, forecast_id: forecastId, ...payload,
      }))
    }
    if (!error) { resetForm(); reload() }
    setSaving(false)
  }

  async function handleDelete(note) {
    if (!confirm('Delete this note?')) return
    await auditDelete('opportunity_notes', note.id, note)
    reload()
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <span style={{ fontSize: '14px', color: BRAND.coolGrey }}>{notes.length} note{notes.length !== 1 ? 's' : ''}</span>
        <button onClick={() => { if (showForm && !editId) { resetForm() } else { resetForm(); setShowForm(true) } }} style={{
          padding: '8px 20px', background: BRAND.purple, color: BRAND.white,
          border: 'none', cursor: 'pointer', fontFamily: BRAND.font, fontSize: '13px',
        }}>{showForm && !editId ? 'Cancel' : 'Add Note'}</button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} style={{ background: BRAND.purpleLight, border: `1px solid ${BRAND.greyBorder}`, padding: '20px', marginBottom: '16px' }}>
          {editId && <div style={{ fontSize: '13px', color: BRAND.purple, marginBottom: '12px' }}>Editing note</div>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px', marginBottom: '12px' }}>
            <div><label style={labelStyle}>Type</label>
              <select value={form.note_type} onChange={e => setForm({ ...form, note_type: e.target.value })} style={inputStyle}>
                <option value="general">General</option><option value="strategy">Strategy</option>
                <option value="risk">Risk</option><option value="competitor">Competitor</option>
                <option value="pricing">Pricing</option><option value="relationship">Relationship</option>
              </select>
            </div>
            <div><label style={labelStyle}>Content</label><input value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} required style={inputStyle} placeholder="Enter note..." /></div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" onClick={resetForm} style={{ padding: '8px 20px', background: BRAND.white, color: BRAND.coolGrey, border: `1px solid ${BRAND.greyBorder}`, cursor: 'pointer', fontFamily: BRAND.font, fontSize: '13px' }}>Cancel</button>
            <button type="submit" disabled={saving} style={{ padding: '8px 20px', background: BRAND.purple, color: BRAND.white, border: 'none', cursor: 'pointer', fontFamily: BRAND.font, fontSize: '13px' }}>{saving ? 'Saving...' : (editId ? 'Update' : 'Save')}</button>
          </div>
        </form>
      )}

      {notes.length === 0 ? (
        <div style={{ padding: '40px 24px', color: BRAND.coolGrey, fontSize: '14px', background: BRAND.white, border: `1px solid ${BRAND.greyBorder}` }}>No notes added yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {notes.map(n => (
            <div key={n.id} style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, padding: '16px 20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <StatusBadge status={n.note_type} map={noteTypeMap} />
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '11px', color: BRAND.coolGrey }}>{formatDate(n.created_at)}</span>
                  <button onClick={() => startEdit(n)} style={{ background: 'none', border: 'none', color: BRAND.purple, cursor: 'pointer', fontFamily: BRAND.font, fontSize: '12px', padding: '2px 6px' }}>Edit</button>
                  <button onClick={() => handleDelete(n)} style={{ background: 'none', border: 'none', color: BRAND.red, cursor: 'pointer', fontFamily: BRAND.font, fontSize: '12px', padding: '2px 6px' }}>Del</button>
                </div>
              </div>
              <div style={{ fontSize: '13px', color: BRAND.coolGrey }}>{n.content}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
