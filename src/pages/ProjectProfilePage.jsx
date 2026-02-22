import { useState, useEffect, useMemo } from 'react'
import { BRAND } from '../lib/brand'
import { formatCurrencyExact, formatCurrency, formatDate, formatPct } from '../lib/utils'
import { supabase } from '../lib/supabase'
import { PCS_SECTOR_ID, useClients } from '../hooks/useData'
import { SectionHeader, LoadingState, StatusBadge, DataTable, KPICard, EmployeeLink } from '../components/SharedUI'

// ============================================================================
// Status maps for new data types
// ============================================================================
const riskStatusMap = {
  open: { bg: '#FFF4E5', text: BRAND.amber, label: 'Open' },
  mitigating: { bg: '#E8F4FD', text: BRAND.blue, label: 'Mitigating' },
  escalated: { bg: '#FDECEC', text: BRAND.red, label: 'Escalated' },
  closed: { bg: '#E8F5E8', text: BRAND.green, label: 'Closed' },
  accepted: { bg: BRAND.greyLight, text: BRAND.coolGrey, label: 'Accepted' },
}

const riskLevelMap = {
  critical: { bg: '#FDECEC', text: BRAND.red, label: 'Critical' },
  high: { bg: '#FFF4E5', text: BRAND.amber, label: 'High' },
  medium: { bg: '#E8F4FD', text: BRAND.blue, label: 'Medium' },
  low: { bg: '#E8F5E8', text: BRAND.green, label: 'Low' },
}

const variationStatusMap = {
  draft: { bg: BRAND.greyLight, text: BRAND.coolGrey, label: 'Draft' },
  submitted: { bg: '#E8F4FD', text: BRAND.blue, label: 'Submitted' },
  under_review: { bg: '#FFF4E5', text: BRAND.amber, label: 'Under Review' },
  approved: { bg: '#E8F5E8', text: BRAND.green, label: 'Approved' },
  rejected: { bg: '#FDECEC', text: BRAND.red, label: 'Rejected' },
  withdrawn: { bg: BRAND.greyLight, text: BRAND.coolGrey, label: 'Withdrawn' },
}

const docApprovalMap = {
  not_required: { bg: BRAND.greyLight, text: BRAND.coolGrey, label: 'N/A' },
  pending: { bg: '#FFF4E5', text: BRAND.amber, label: 'Pending' },
  approved: { bg: '#E8F5E8', text: BRAND.green, label: 'Approved' },
  approved_with_comments: { bg: '#E8F4FD', text: BRAND.blue, label: 'Approved (comments)' },
  rejected: { bg: '#FDECEC', text: BRAND.red, label: 'Rejected' },
  superseded: { bg: BRAND.greyLight, text: BRAND.coolGrey, label: 'Superseded' },
}

const sentimentMap = {
  very_satisfied: { bg: '#E8F5E8', text: BRAND.green, label: 'Very Satisfied' },
  satisfied: { bg: '#E8F5E8', text: BRAND.green, label: 'Satisfied' },
  neutral: { bg: BRAND.greyLight, text: BRAND.coolGrey, label: 'Neutral' },
  concerned: { bg: '#FFF4E5', text: BRAND.amber, label: 'Concerned' },
  dissatisfied: { bg: '#FDECEC', text: BRAND.red, label: 'Dissatisfied' },
}

const lessonOutcomeMap = {
  went_well: { bg: '#E8F5E8', text: BRAND.green, label: 'Went Well' },
  improve: { bg: '#FFF4E5', text: BRAND.amber, label: 'To Improve' },
}

const stakeholderTypeMap = {
  decision_maker: { bg: '#FDECEC', text: BRAND.red, label: 'Decision Maker' },
  influencer: { bg: '#FFF4E5', text: BRAND.amber, label: 'Influencer' },
  operational: { bg: '#E8F4FD', text: BRAND.blue, label: 'Operational' },
  observer: { bg: BRAND.greyLight, text: BRAND.coolGrey, label: 'Observer' },
}

// ============================================================================
// Tab Button Component
// ============================================================================
function TabButton({ label, active, onClick, count }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '8px 16px',
        background: active ? BRAND.purple : 'transparent',
        color: active ? BRAND.white : BRAND.coolGrey,
        border: active ? 'none' : `1px solid ${BRAND.greyBorder}`,
        cursor: 'pointer',
        fontFamily: BRAND.font,
        fontSize: '13px',
        fontWeight: 400,
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
      }}
    >
      {label}
      {count != null && count > 0 && (
        <span style={{
          fontSize: '11px',
          padding: '1px 6px',
          background: active ? 'rgba(255,255,255,0.2)' : BRAND.greyLight,
          color: active ? BRAND.white : BRAND.coolGrey,
        }}>{count}</span>
      )}
    </button>
  )
}

// ============================================================================
// Main Component
// ============================================================================
export default function ProjectProfilePage({ projectId, onBack }) {
  const [project, setProject] = useState(null)
  const [workOrder, setWorkOrder] = useState(null)
  const [rateLines, setRateLines] = useState([])
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({})
  const [assignments, setAssignments] = useState([])
  const [invoices, setInvoices] = useState([])
  const [workOrders, setWorkOrders] = useState([])
  const { data: clients } = useClients()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)
  const [activeTab, setActiveTab] = useState('overview')

  // Migration 005-008 data
  const [contacts, setContacts] = useState([])
  const [risks, setRisks] = useState([])
  const [lessons, setLessons] = useState([])
  const [savings, setSavingsData] = useState([])
  const [meetings, setMeetings] = useState([])
  const [variations, setVariations] = useState([])
  const [documents, setDocuments] = useState([])
  const [healthScore, setHealthScore] = useState(null)

  useEffect(() => { loadAll() }, [projectId])

  async function loadAll() {
    setLoading(true)
    const { data: proj } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single()

    if (!proj) { setLoading(false); return }
    setProject(proj)
    setForm({
      name: proj.name, code: proj.code, type: proj.type,
      rate_type: proj.rate_type, adjusted_bill_rate: proj.adjusted_bill_rate || '',
      effective_start: proj.effective_start || '', effective_end: proj.effective_end || '',
      client_id: proj.client_id || '', work_order_id: proj.work_order_id || '',
      is_active: proj.is_active,
    })

    // Load work order + rate lines if linked
    if (proj.work_order_id) {
      const [woRes, rlRes] = await Promise.all([
        supabase.from('work_orders').select('*').eq('id', proj.work_order_id).single(),
        supabase.from('work_order_rate_lines').select('*').eq('work_order_id', proj.work_order_id).order('sort_order'),
      ])
      setWorkOrder(woRes.data)
      setRateLines(rlRes.data || [])
    }

    // Load all WOs for dropdown
    const { data: allWOs } = await supabase.from('work_orders').select('id, po_reference, name, client_id').eq('sector_id', PCS_SECTOR_ID)
    setWorkOrders(allWOs || [])

    // Load assignments
    const { data: asgn } = await supabase
      .from('planned_weekly_hours')
      .select('*, employees(employee_code, name, role, hourly_cost), work_order_rate_lines(label, bill_rate)')
      .eq('project_id', projectId)
      .order('week_ending', { ascending: true })
    setAssignments(asgn || [])

    // Load invoices for this project's client
    if (proj.client_id) {
      const { data: inv } = await supabase.from('invoices').select('*').eq('client_id', proj.client_id).eq('sector_id', PCS_SECTOR_ID).order('billing_month', { ascending: false })
      setInvoices(inv || [])
    }

    // Load migration 005-008 data in parallel
    const [contactsRes, risksRes, lessonsRes, savingsRes, meetingsRes, variationsRes, documentsRes, healthRes] = await Promise.all([
      supabase.from('project_contacts').select('*').eq('project_id', projectId).order('is_primary', { ascending: false }),
      supabase.from('project_risks').select('*').eq('project_id', projectId).order('identified_date', { ascending: false }),
      supabase.from('project_lessons').select('*').eq('project_id', projectId).order('lesson_date', { ascending: false }),
      supabase.from('project_savings').select('*').eq('project_id', projectId).order('saving_date', { ascending: false }),
      supabase.from('meetings').select('*').eq('project_id', projectId).order('meeting_date', { ascending: false }),
      supabase.from('project_variations').select('*').eq('project_id', projectId).order('variation_ref', { ascending: true }),
      supabase.from('project_documents').select('*').eq('project_id', projectId).order('document_ref', { ascending: true }),
      supabase.from('v_project_health').select('*').eq('project_id', projectId).maybeSingle(),
    ])

    setContacts(contactsRes.data || [])
    setRisks(risksRes.data || [])
    setLessons(lessonsRes.data || [])
    setSavingsData(savingsRes.data || [])
    setMeetings(meetingsRes.data || [])
    setVariations(variationsRes.data || [])
    setDocuments(documentsRes.data || [])
    setHealthScore(healthRes.data)

    setLoading(false)
  }

  async function handleSave() {
    setSaving(true); setMessage(null)
    const { error } = await supabase.from('projects').update({
      name: form.name, type: form.type, rate_type: form.rate_type,
      adjusted_bill_rate: form.adjusted_bill_rate ? parseFloat(form.adjusted_bill_rate) : null,
      effective_start: form.effective_start || null, effective_end: form.effective_end || null,
      client_id: form.client_id || null, work_order_id: form.work_order_id || null,
      is_active: form.is_active,
    }).eq('id', projectId)

    if (error) { setMessage({ type: 'error', text: error.message }) }
    else { setMessage({ type: 'success', text: 'Project updated.' }); setEditing(false); loadAll() }
    setSaving(false)
  }

  const employeeSummary = useMemo(() => {
    const map = {}
    assignments.forEach(a => {
      const empId = a.employee_id
      if (!map[empId]) {
        map[empId] = {
          employee_id: empId,
          employee_code: a.employees?.employee_code, name: a.employees?.name,
          role: a.employees?.role, hourly_cost: a.employees?.hourly_cost,
          rate_line_label: a.work_order_rate_lines?.label || '—',
          bill_rate: a.work_order_rate_lines?.bill_rate || 0,
          totalHours: 0, weeks: 0,
        }
      }
      map[empId].totalHours += Number(a.planned_hours)
      map[empId].weeks++
    })
    return Object.values(map)
  }, [assignments])

  if (loading) return <LoadingState message="Loading project profile..." />
  if (!project) return <div style={{ padding: '24px', color: BRAND.coolGrey }}>Project not found.</div>

  const client = clients.find(c => c.id === project.client_id)
  const totalPlannedHours = employeeSummary.reduce((s, e) => s + e.totalHours, 0)
  const totalInvoiced = invoices.reduce((s, i) => s + Number(i.amount), 0)
  const woBudget = workOrder?.budget ? Number(workOrder.budget) : 0
  const totalPlannedRevenue = employeeSummary.reduce((s, e) => s + (e.totalHours * Number(e.bill_rate || 0)), 0)
  const totalPlannedCost = employeeSummary.reduce((s, e) => s + (e.totalHours * Number(e.hourly_cost || 0)), 0)
  const projectMargin = totalPlannedRevenue - totalPlannedCost
  const projectMarginPct = totalPlannedRevenue > 0 ? projectMargin / totalPlannedRevenue : 0

  const tangibleSavings = savings.filter(s => s.saving_type === 'tangible').reduce((t, s) => t + Number(s.amount || 0), 0)
  const openRisks = risks.filter(r => r.status !== 'closed').length

  const inputStyle = {
    width: '100%', padding: '8px 12px', border: `1px solid ${BRAND.greyBorder}`,
    fontFamily: BRAND.font, fontSize: '14px', color: BRAND.coolGrey,
    background: editing ? BRAND.white : BRAND.greyLight, boxSizing: 'border-box',
  }

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'contacts', label: 'Contacts', count: contacts.length },
    { key: 'meetings', label: 'Meetings', count: meetings.length },
    { key: 'risks', label: 'Risks', count: openRisks },
    { key: 'lessons', label: 'Lessons', count: lessons.length },
    { key: 'savings', label: 'Savings', count: savings.length },
    { key: 'variations', label: 'Variations', count: variations.length },
    { key: 'documents', label: 'Documents', count: documents.length },
  ]

  return (
    <div>
      <button onClick={onBack} style={{
        background: 'none', border: 'none', cursor: 'pointer', color: BRAND.purple,
        fontFamily: BRAND.font, fontSize: '13px', padding: 0, marginBottom: '16px',
      }}>← Back to Projects</button>

      <SectionHeader
        title={`${project.code} — ${project.name}`}
        subtitle={[
          client ? client.name : null,
          workOrder ? `PO: ${workOrder.po_reference}` : null,
          healthScore ? `Health: ${healthScore.health_score || '—'}/100` : null,
        ].filter(Boolean).join(' | ') || 'No client or work order assigned'}
        action={
          activeTab === 'overview' && (
            !editing ? (
              <button onClick={() => setEditing(true)} style={{
                padding: '8px 20px', background: BRAND.purple, color: BRAND.white,
                border: 'none', cursor: 'pointer', fontFamily: BRAND.font, fontSize: '13px',
              }}>Edit Project</button>
            ) : (
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => { setEditing(false); loadAll() }} style={{
                  padding: '8px 20px', background: BRAND.white, color: BRAND.coolGrey,
                  border: `1px solid ${BRAND.greyBorder}`, cursor: 'pointer', fontFamily: BRAND.font, fontSize: '13px',
                }}>Cancel</button>
                <button onClick={handleSave} disabled={saving} style={{
                  padding: '8px 20px', background: BRAND.purple, color: BRAND.white,
                  border: 'none', cursor: 'pointer', fontFamily: BRAND.font, fontSize: '13px',
                }}>{saving ? 'Saving...' : 'Save'}</button>
              </div>
            )
          )
        }
      />

      {message && (
        <div style={{ padding: '10px 16px', marginBottom: '16px', fontSize: '13px',
          background: message.type === 'error' ? '#FDECEC' : '#E8F5E8',
          color: message.type === 'error' ? BRAND.red : BRAND.green,
        }}>{message.text}</div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', flexWrap: 'wrap' }}>
        {tabs.map(tab => (
          <TabButton
            key={tab.key}
            label={tab.label}
            active={activeTab === tab.key}
            onClick={() => setActiveTab(tab.key)}
            count={tab.count}
          />
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <OverviewTab
          project={project} workOrder={workOrder} rateLines={rateLines}
          employeeSummary={employeeSummary} clients={clients} form={form}
          setForm={setForm} editing={editing} inputStyle={inputStyle}
          workOrders={workOrders} woBudget={woBudget} totalInvoiced={totalInvoiced}
          totalPlannedRevenue={totalPlannedRevenue} totalPlannedCost={totalPlannedCost}
          projectMargin={projectMargin} projectMarginPct={projectMarginPct}
          totalPlannedHours={totalPlannedHours} tangibleSavings={tangibleSavings}
          openRisks={openRisks}
        />
      )}
      {activeTab === 'contacts' && <ContactsTab contacts={contacts} />}
      {activeTab === 'meetings' && <MeetingsTab meetings={meetings} />}
      {activeTab === 'risks' && <RisksTab risks={risks} />}
      {activeTab === 'lessons' && <LessonsTab lessons={lessons} />}
      {activeTab === 'savings' && <SavingsTab savings={savings} />}
      {activeTab === 'variations' && <VariationsTab variations={variations} />}
      {activeTab === 'documents' && <DocumentsTab documents={documents} />}
    </div>
  )
}

// ============================================================================
// OVERVIEW TAB
// ============================================================================
function OverviewTab({
  project, workOrder, rateLines, employeeSummary, clients, form, setForm,
  editing, inputStyle, workOrders, woBudget, totalInvoiced,
  totalPlannedRevenue, totalPlannedCost, projectMargin, projectMarginPct,
  totalPlannedHours, tangibleSavings, openRisks,
}) {
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        <KPICard label="WO Budget" value={woBudget ? formatCurrency(woBudget) : '—'} />
        <KPICard label="Total Invoiced" value={formatCurrency(totalInvoiced)} color={BRAND.teal} />
        <KPICard label="WO Remaining" value={woBudget ? formatCurrency(woBudget - totalInvoiced) : '—'} color={woBudget - totalInvoiced < 0 ? BRAND.red : BRAND.green} />
        <KPICard label="Planned Revenue" value={formatCurrency(totalPlannedRevenue)} color={BRAND.blue} />
        <KPICard label="Project Margin" value={formatPct(projectMarginPct)} subValue={formatCurrency(projectMargin)} color={projectMarginPct > 0.3 ? BRAND.green : projectMarginPct > 0.15 ? BRAND.amber : BRAND.red} />
        <KPICard label="Planned Hours" value={totalPlannedHours.toFixed(0)} />
        <KPICard label="Client Savings" value={formatCurrency(tangibleSavings)} color={BRAND.teal} />
        <KPICard label="Open Risks" value={openRisks} color={openRisks > 2 ? BRAND.red : openRisks > 0 ? BRAND.amber : BRAND.green} />
      </div>

      <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, padding: '24px', marginBottom: '24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: BRAND.coolGrey, marginBottom: '4px' }}>Project Code</label>
            <input value={form.code || ''} disabled style={{ ...inputStyle, background: BRAND.greyLight }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: BRAND.coolGrey, marginBottom: '4px' }}>Name</label>
            <input value={form.name || ''} disabled={!editing} onChange={e => setForm({ ...form, name: e.target.value })} style={inputStyle} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: BRAND.coolGrey, marginBottom: '4px' }}>Client</label>
            <select value={form.client_id || ''} disabled={!editing} onChange={e => setForm({ ...form, client_id: e.target.value })} style={inputStyle}>
              <option value="">No client</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: BRAND.coolGrey, marginBottom: '4px' }}>Work Order</label>
            <select value={form.work_order_id || ''} disabled={!editing} onChange={e => setForm({ ...form, work_order_id: e.target.value })} style={inputStyle}>
              <option value="">No work order</option>
              {workOrders.filter(w => !form.client_id || w.client_id === form.client_id).map(w => (
                <option key={w.id} value={w.id}>{w.po_reference}{w.name ? ` — ${w.name}` : ''}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: BRAND.coolGrey, marginBottom: '4px' }}>Type</label>
            <select value={form.type || 'billable'} disabled={!editing} onChange={e => setForm({ ...form, type: e.target.value })} style={inputStyle}>
              <option value="billable">Billable</option>
              <option value="overhead">Overhead</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: BRAND.coolGrey, marginBottom: '4px' }}>Start Date</label>
            <input type="date" value={form.effective_start || ''} disabled={!editing} onChange={e => setForm({ ...form, effective_start: e.target.value })} style={inputStyle} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: BRAND.coolGrey, marginBottom: '4px' }}>End Date</label>
            <input type="date" value={form.effective_end || ''} disabled={!editing} onChange={e => setForm({ ...form, effective_end: e.target.value })} style={inputStyle} />
          </div>
        </div>
      </div>

      {rateLines.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <span style={{ fontSize: '15px', color: BRAND.purple, display: 'block', marginBottom: '12px' }}>Available Rate Lines (from {workOrder?.po_reference})</span>
          <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}` }}>
            <DataTable
              columns={[
                { header: 'Label', accessor: 'label' },
                { header: 'Bill Rate', render: r => formatCurrencyExact(r.bill_rate), nowrap: true },
                { header: 'Default', render: r => r.is_default ? 'Yes' : '' },
              ]}
              data={rateLines}
            />
          </div>
        </div>
      )}

      <div style={{ marginBottom: '24px' }}>
        <span style={{ fontSize: '15px', color: BRAND.purple, display: 'block', marginBottom: '12px' }}>Assigned Employees</span>
        <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}` }}>
          <DataTable
            columns={[
              { header: 'Code', accessor: 'employee_code', nowrap: true },
              { header: 'Name', render: r => <EmployeeLink id={r.employee_id}>{r.name}</EmployeeLink> },
              { header: 'Role', accessor: 'role' },
              { header: 'Rate Line', accessor: 'rate_line_label' },
              { header: 'Bill Rate', render: r => r.bill_rate ? formatCurrencyExact(r.bill_rate) : '—', nowrap: true },
              { header: 'Cost Rate', render: r => formatCurrencyExact(r.hourly_cost), nowrap: true },
              { header: 'Hours', render: r => r.totalHours.toFixed(1), nowrap: true },
              { header: 'Revenue', render: r => formatCurrency(r.totalHours * Number(r.bill_rate || 0)), nowrap: true },
              { header: 'Cost', render: r => formatCurrency(r.totalHours * Number(r.hourly_cost)), nowrap: true },
              { header: 'Margin', render: r => {
                const rev = r.totalHours * Number(r.bill_rate || 0)
                const cost = r.totalHours * Number(r.hourly_cost)
                const margin = rev - cost
                const pct = rev > 0 ? margin / rev : 0
                return <span style={{ color: pct > 0.3 ? BRAND.green : pct > 0.15 ? BRAND.amber : BRAND.red }}>{formatPct(pct)}</span>
              }, nowrap: true },
            ]}
            data={employeeSummary}
            emptyMessage="No employees assigned. Use the Hours Grid to assign employees."
          />
        </div>
      </div>
    </>
  )
}

// ============================================================================
// CONTACTS TAB (Migration 005)
// ============================================================================
function ContactsTab({ contacts }) {
  const clientContacts = contacts.filter(c => c.organisation !== 'Currie & Brown')
  const cbContacts = contacts.filter(c => c.organisation === 'Currie & Brown')

  return (
    <>
      <span style={{ fontSize: '15px', color: BRAND.purple, display: 'block', marginBottom: '12px' }}>Client Stakeholders</span>
      <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, marginBottom: '24px' }}>
        <DataTable
          columns={[
            { header: 'Name', accessor: 'name' },
            { header: 'Organisation', accessor: 'organisation' },
            { header: 'Role', accessor: 'role' },
            { header: 'Type', render: r => <StatusBadge status={r.stakeholder_type} map={stakeholderTypeMap} /> },
            { header: 'Primary', render: r => r.is_primary ? 'Yes' : '' },
            { header: 'Email', accessor: 'email' },
            { header: 'Phone', accessor: 'phone' },
          ]}
          data={clientContacts}
          emptyMessage="No client stakeholders recorded."
        />
      </div>

      <span style={{ fontSize: '15px', color: BRAND.purple, display: 'block', marginBottom: '12px' }}>Currie & Brown Team</span>
      <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}` }}>
        <DataTable
          columns={[
            { header: 'Name', accessor: 'name' },
            { header: 'Role', accessor: 'role' },
            { header: 'Type', render: r => <StatusBadge status={r.stakeholder_type} map={stakeholderTypeMap} /> },
            { header: 'Primary', render: r => r.is_primary ? 'Yes' : '' },
            { header: 'Notes', accessor: 'notes' },
          ]}
          data={cbContacts}
          emptyMessage="No CB team members recorded."
        />
      </div>
    </>
  )
}

// ============================================================================
// MEETINGS TAB (Migration 007)
// ============================================================================
function MeetingsTab({ meetings }) {
  const [expanded, setExpanded] = useState(null)

  return (
    <div>
      <span style={{ fontSize: '15px', color: BRAND.purple, display: 'block', marginBottom: '12px' }}>
        {meetings.length} meeting{meetings.length !== 1 ? 's' : ''}
      </span>

      {meetings.length === 0 ? (
        <div style={{ padding: '24px', background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, color: BRAND.coolGrey, fontSize: '14px' }}>
          No meetings recorded for this project.
        </div>
      ) : (
        meetings.map(m => (
          <div key={m.id} style={{
            background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`,
            marginBottom: '8px', overflow: 'hidden',
          }}>
            <button
              onClick={() => setExpanded(expanded === m.id ? null : m.id)}
              style={{
                width: '100%', padding: '14px 20px', display: 'flex',
                justifyContent: 'space-between', alignItems: 'center',
                background: 'none', border: 'none', cursor: 'pointer',
                fontFamily: BRAND.font, textAlign: 'left',
              }}
            >
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                <span style={{ color: BRAND.coolGrey, fontSize: '13px', minWidth: '90px' }}>{formatDate(m.meeting_date)}</span>
                <span style={{ color: BRAND.purple, fontSize: '14px' }}>{m.title || m.meeting_number}</span>
                <span style={{ color: BRAND.coolGrey, fontSize: '12px', textTransform: 'capitalize' }}>{(m.meeting_type || '').replace(/_/g, ' ')}</span>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {m.client_sentiment && <StatusBadge status={m.client_sentiment} map={sentimentMap} />}
                <span style={{ color: BRAND.coolGrey, fontSize: '12px' }}>{expanded === m.id ? '▲' : '▼'}</span>
              </div>
            </button>

            {expanded === m.id && (
              <div style={{ padding: '0 20px 16px', borderTop: `1px solid ${BRAND.greyBorder}` }}>
                {m.description && (
                  <div style={{ padding: '12px 0 4px', fontSize: '13px', color: BRAND.coolGrey }}>{m.description}</div>
                )}
                {m.notes && (
                  <div style={{ padding: '8px 0', fontSize: '13px', color: BRAND.coolGrey, lineHeight: '1.5' }}>{m.notes}</div>
                )}
                <div style={{ display: 'flex', gap: '24px', fontSize: '12px', color: BRAND.coolGrey, paddingTop: '8px' }}>
                  {m.location && <span>Location: {m.location}</span>}
                  {m.start_time && <span>Time: {m.start_time}{m.end_time ? ` – ${m.end_time}` : ''}</span>}
                  {m.next_meeting_date && <span>Next: {formatDate(m.next_meeting_date)}</span>}
                  {m.status && <span style={{ textTransform: 'capitalize' }}>Status: {m.status}</span>}
                  {m.minutes_status && m.minutes_status !== 'not_started' && <span style={{ textTransform: 'capitalize' }}>Minutes: {m.minutes_status}</span>}
                </div>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  )
}

// ============================================================================
// RISKS TAB (Migration 005)
// ============================================================================
function RisksTab({ risks }) {
  return (
    <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}` }}>
      <DataTable
        columns={[
          { header: 'Title', accessor: 'title' },
          { header: 'Category', render: r => <span style={{ textTransform: 'capitalize' }}>{(r.category || '').replace(/_/g, ' ')}</span> },
          { header: 'Likelihood', render: r => <StatusBadge status={r.likelihood} map={riskLevelMap} /> },
          { header: 'Impact', render: r => <StatusBadge status={r.impact} map={riskLevelMap} /> },
          { header: 'Status', render: r => <StatusBadge status={r.status} map={riskStatusMap} /> },
          { header: 'Owner', accessor: 'owner' },
          { header: 'Mitigation', accessor: 'mitigation' },
          { header: 'Identified', render: r => formatDate(r.identified_date), nowrap: true },
          { header: 'Review', render: r => formatDate(r.review_date), nowrap: true },
        ]}
        data={risks}
        emptyMessage="No risks recorded for this project."
      />
    </div>
  )
}

// ============================================================================
// LESSONS TAB (Migration 005)
// ============================================================================
function LessonsTab({ lessons }) {
  return (
    <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}` }}>
      <DataTable
        columns={[
          { header: 'Date', render: r => formatDate(r.lesson_date), nowrap: true },
          { header: 'Category', render: r => <span style={{ textTransform: 'capitalize' }}>{(r.category || '').replace(/_/g, ' ')}</span> },
          { header: 'Outcome', render: r => <StatusBadge status={r.outcome} map={lessonOutcomeMap} /> },
          { header: 'What Happened', accessor: 'what_happened' },
          { header: 'Root Cause', accessor: 'root_cause' },
          { header: 'Action Taken', accessor: 'action_taken' },
        ]}
        data={lessons}
        emptyMessage="No lessons recorded for this project."
      />
    </div>
  )
}

// ============================================================================
// SAVINGS TAB (Migration 005)
// ============================================================================
function SavingsTab({ savings }) {
  const tangible = savings.filter(s => s.saving_type === 'tangible')
  const intangible = savings.filter(s => s.saving_type === 'intangible')
  const totalTangible = tangible.reduce((t, s) => t + Number(s.amount || 0), 0)

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        <KPICard label="Tangible Savings" value={formatCurrency(totalTangible)} color={BRAND.green} />
        <KPICard label="Tangible Count" value={tangible.length} />
        <KPICard label="Intangible Count" value={intangible.length} />
        <KPICard label="Verified" value={savings.filter(s => s.verified).length} color={BRAND.teal} />
      </div>

      <span style={{ fontSize: '15px', color: BRAND.purple, display: 'block', marginBottom: '12px' }}>Tangible Savings</span>
      <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, marginBottom: '24px' }}>
        <DataTable
          columns={[
            { header: 'Date', render: r => formatDate(r.saving_date), nowrap: true },
            { header: 'Title', accessor: 'title' },
            { header: 'Category', render: r => <span style={{ textTransform: 'capitalize' }}>{(r.category || '').replace(/_/g, ' ')}</span> },
            { header: 'Amount', render: r => formatCurrency(r.amount), nowrap: true },
            { header: 'Basis', accessor: 'calculation_basis' },
            { header: 'Verified', render: r => r.verified ? 'Yes' : 'No' },
            { header: 'Beneficiary', accessor: 'beneficiary' },
          ]}
          data={tangible}
          emptyMessage="No tangible savings recorded."
        />
      </div>

      <span style={{ fontSize: '15px', color: BRAND.purple, display: 'block', marginBottom: '12px' }}>Intangible Savings</span>
      <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}` }}>
        <DataTable
          columns={[
            { header: 'Date', render: r => formatDate(r.saving_date), nowrap: true },
            { header: 'Title', accessor: 'title' },
            { header: 'Category', render: r => <span style={{ textTransform: 'capitalize' }}>{(r.category || '').replace(/_/g, ' ')}</span> },
            { header: 'Impact', render: r => r.impact_level ? <span style={{ textTransform: 'capitalize' }}>{r.impact_level}</span> : '—' },
            { header: 'Description', accessor: 'description' },
            { header: 'Beneficiary', accessor: 'beneficiary' },
          ]}
          data={intangible}
          emptyMessage="No intangible savings recorded."
        />
      </div>
    </>
  )
}

// ============================================================================
// VARIATIONS TAB (Migration 008)
// ============================================================================
function VariationsTab({ variations }) {
  const approved = variations.filter(v => v.status === 'approved')
  const totalVariationValue = approved.reduce((t, v) => t + Number(v.variation_amount || 0), 0)

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        <KPICard label="Total Variations" value={variations.length} />
        <KPICard label="Approved" value={approved.length} color={BRAND.green} />
        <KPICard label="Pending" value={variations.filter(v => ['draft', 'submitted', 'under_review'].includes(v.status)).length} color={BRAND.amber} />
        <KPICard label="Net Approved Value" value={formatCurrency(totalVariationValue)} color={totalVariationValue >= 0 ? BRAND.green : BRAND.red} />
      </div>

      <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}` }}>
        <DataTable
          columns={[
            { header: 'Ref', accessor: 'variation_ref', nowrap: true },
            { header: 'Title', accessor: 'title' },
            { header: 'Type', render: r => <span style={{ textTransform: 'capitalize' }}>{(r.variation_type || '').replace(/_/g, ' ')}</span> },
            { header: 'Amount', render: r => r.variation_amount ? formatCurrency(r.variation_amount) : '—', nowrap: true },
            { header: 'Revised Value', render: r => r.revised_value ? formatCurrency(r.revised_value) : '—', nowrap: true },
            { header: 'Status', render: r => <StatusBadge status={r.status} map={variationStatusMap} /> },
            { header: 'Raised', render: r => formatDate(r.raised_date), nowrap: true },
            { header: 'Raised By', accessor: 'raised_by' },
            { header: 'Client Ref', accessor: 'client_reference' },
          ]}
          data={variations}
          emptyMessage="No variations recorded for this project."
        />
      </div>
    </>
  )
}

// ============================================================================
// DOCUMENTS TAB (Migration 008)
// ============================================================================
function DocumentsTab({ documents }) {
  return (
    <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}` }}>
      <DataTable
        columns={[
          { header: 'Ref', accessor: 'document_ref', nowrap: true },
          { header: 'Title', accessor: 'title' },
          { header: 'Type', render: r => <span style={{ textTransform: 'capitalize' }}>{(r.document_type || '').replace(/_/g, ' ')}</span> },
          { header: 'Version', accessor: 'version', nowrap: true },
          { header: 'Issued', render: r => formatDate(r.issued_date), nowrap: true },
          { header: 'Issued By', accessor: 'issued_by' },
          { header: 'Issued To', accessor: 'issued_to' },
          { header: 'Approval', render: r => <StatusBadge status={r.approval_status} map={docApprovalMap} /> },
          { header: 'Approved By', accessor: 'approved_by' },
        ]}
        data={documents}
        emptyMessage="No documents recorded for this project."
      />
    </div>
  )
}
