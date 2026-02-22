import { useState, useEffect, useMemo } from 'react'
import { BRAND } from '../lib/brand'
import { formatCurrencyExact, formatCurrency, formatDate, formatPct } from '../lib/utils'
import { supabase } from '../lib/supabase'
import { PCS_SECTOR_ID, useClients, useEmployees } from '../hooks/useData'
import { SectionHeader, LoadingState, StatusBadge, DataTable, KPICard, EmployeeLink } from '../components/SharedUI'

// ============================================================================
// Shared form styles
// ============================================================================
const formInputStyle = {
  width: '100%', padding: '8px 12px', border: `1px solid ${BRAND.greyBorder}`,
  fontFamily: BRAND.font, fontSize: '13px', color: BRAND.coolGrey, background: BRAND.white,
  boxSizing: 'border-box',
}

function FormMessage({ msg }) {
  if (!msg) return null
  return (
    <div style={{ padding: '8px 12px', marginBottom: '12px', fontSize: '13px',
      background: msg.type === 'error' ? '#FDECEC' : '#E8F5E8',
      color: msg.type === 'error' ? BRAND.red : BRAND.green,
    }}>{msg.text}</div>
  )
}

function FormButtons({ onCancel, onSave, saving, label = 'Save' }) {
  return (
    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
      <button onClick={onCancel} style={{
        padding: '8px 20px', background: BRAND.white, color: BRAND.coolGrey,
        border: `1px solid ${BRAND.greyBorder}`, cursor: 'pointer', fontFamily: BRAND.font, fontSize: '13px',
      }}>Cancel</button>
      <button onClick={onSave} disabled={saving} style={{
        padding: '8px 20px', background: BRAND.purple, color: BRAND.white,
        border: 'none', cursor: 'pointer', fontFamily: BRAND.font, fontSize: '13px',
      }}>{saving ? 'Saving...' : label}</button>
    </div>
  )
}

function AddButton({ label, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: '8px 20px', background: BRAND.purple, color: BRAND.white,
      border: 'none', cursor: 'pointer', fontFamily: BRAND.font, fontSize: '13px',
    }}>{label}</button>
  )
}

function FormWrapper({ children }) {
  return (
    <div style={{ background: BRAND.purpleLight, border: `1px solid ${BRAND.greyBorder}`, padding: '20px', marginBottom: '20px' }}>
      {children}
    </div>
  )
}

function FormGrid({ children, cols = 2 }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '12px', marginBottom: '12px' }}>
      {children}
    </div>
  )
}

function FormField({ label, children, span }) {
  return (
    <div style={span ? { gridColumn: '1 / -1' } : undefined}>
      <label style={{ display: 'block', fontSize: '12px', color: BRAND.coolGrey, marginBottom: '4px' }}>{label}</label>
      {children}
    </div>
  )
}

// ============================================================================
// Status maps
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

const actionStatusMap = {
  open: { bg: '#FFF4E5', text: BRAND.amber, label: 'Open' },
  in_progress: { bg: '#E8F4FD', text: BRAND.blue, label: 'In Progress' },
  closed: { bg: '#E8F5E8', text: BRAND.green, label: 'Closed' },
  superseded: { bg: BRAND.greyLight, text: BRAND.coolGrey, label: 'Superseded' },
}

const actionPriorityMap = {
  critical: { bg: '#FDECEC', text: BRAND.red, label: 'Critical' },
  high: { bg: '#FFF4E5', text: BRAND.amber, label: 'High' },
  normal: { bg: BRAND.greyLight, text: BRAND.coolGrey, label: 'Normal' },
  low: { bg: '#E8F5E8', text: BRAND.green, label: 'Low' },
}

// ============================================================================
// Tab Button
// ============================================================================
function TabButton({ label, active, onClick, count }) {
  return (
    <button onClick={onClick} style={{
      padding: '8px 16px', background: active ? BRAND.purple : 'transparent',
      color: active ? BRAND.white : BRAND.coolGrey,
      border: active ? 'none' : `1px solid ${BRAND.greyBorder}`,
      cursor: 'pointer', fontFamily: BRAND.font, fontSize: '13px', fontWeight: 400,
      display: 'flex', alignItems: 'center', gap: '6px',
    }}>
      {label}
      {count != null && count > 0 && (
        <span style={{ fontSize: '11px', padding: '1px 6px',
          background: active ? 'rgba(255,255,255,0.2)' : BRAND.greyLight,
          color: active ? BRAND.white : BRAND.coolGrey,
        }}>{count}</span>
      )}
    </button>
  )
}

// ============================================================================
// MAIN COMPONENT
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
  const { data: employees } = useEmployees()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)
  const [activeTab, setActiveTab] = useState('overview')

  const [contacts, setContacts] = useState([])
  const [risks, setRisks] = useState([])
  const [lessons, setLessons] = useState([])
  const [savings, setSavingsData] = useState([])
  const [meetings, setMeetings] = useState([])
  const [variations, setVariations] = useState([])
  const [documents, setDocuments] = useState([])
  const [healthScore, setHealthScore] = useState(null)
  const [projectActions, setProjectActions] = useState([])

  useEffect(() => { loadAll() }, [projectId])

  async function loadAll() {
    setLoading(true)
    const { data: proj } = await supabase.from('projects').select('*').eq('id', projectId).single()
    if (!proj) { setLoading(false); return }
    setProject(proj)
    setForm({
      name: proj.name, code: proj.code, type: proj.type,
      rate_type: proj.rate_type, adjusted_bill_rate: proj.adjusted_bill_rate || '',
      effective_start: proj.effective_start || '', effective_end: proj.effective_end || '',
      client_id: proj.client_id || '', work_order_id: proj.work_order_id || '',
      is_active: proj.is_active,
    })

    if (proj.work_order_id) {
      const [woRes, rlRes] = await Promise.all([
        supabase.from('work_orders').select('*').eq('id', proj.work_order_id).single(),
        supabase.from('work_order_rate_lines').select('*').eq('work_order_id', proj.work_order_id).order('sort_order'),
      ])
      setWorkOrder(woRes.data)
      setRateLines(rlRes.data || [])
    }

    const { data: allWOs } = await supabase.from('work_orders').select('id, po_reference, name, client_id').eq('sector_id', PCS_SECTOR_ID)
    setWorkOrders(allWOs || [])

    const { data: asgn } = await supabase
      .from('planned_weekly_hours')
      .select('*, employees(employee_code, name, role, hourly_cost), work_order_rate_lines(label, bill_rate)')
      .eq('project_id', projectId).order('week_ending', { ascending: true })
    setAssignments(asgn || [])

    if (proj.client_id) {
      const { data: inv } = await supabase.from('invoices').select('*').eq('client_id', proj.client_id).eq('sector_id', PCS_SECTOR_ID).order('billing_month', { ascending: false })
      setInvoices(inv || [])
    }

    const [contactsRes, risksRes, lessonsRes, savingsRes, meetingsRes, variationsRes, documentsRes, healthRes, actionsRes] = await Promise.all([
      supabase.from('project_contacts').select('*').eq('project_id', projectId).order('is_primary', { ascending: false }),
      supabase.from('project_risks').select('*').eq('project_id', projectId).order('identified_date', { ascending: false }),
      supabase.from('project_lessons').select('*').eq('project_id', projectId).order('lesson_date', { ascending: false }),
      supabase.from('project_savings').select('*').eq('project_id', projectId).order('saving_date', { ascending: false }),
      supabase.from('meetings').select('*').eq('project_id', projectId).order('meeting_date', { ascending: false }),
      supabase.from('project_variations').select('*').eq('project_id', projectId).order('variation_ref', { ascending: true }),
      supabase.from('project_documents').select('*').eq('project_id', projectId).order('document_ref', { ascending: true }),
      supabase.from('v_project_health').select('*').eq('project_id', projectId).maybeSingle(),
      supabase.from('project_actions').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
    ])

    setContacts(contactsRes.data || [])
    setRisks(risksRes.data || [])
    setLessons(lessonsRes.data || [])
    setSavingsData(savingsRes.data || [])
    setMeetings(meetingsRes.data || [])
    setVariations(variationsRes.data || [])
    setDocuments(documentsRes.data || [])
    setHealthScore(healthRes.data)
    setProjectActions(actionsRes.data || [])
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
          employee_id: empId, employee_code: a.employees?.employee_code, name: a.employees?.name,
          role: a.employees?.role, hourly_cost: a.employees?.hourly_cost,
          rate_line_label: a.work_order_rate_lines?.label || '—',
          bill_rate: a.work_order_rate_lines?.bill_rate || 0, totalHours: 0, weeks: 0,
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
  const openActions = projectActions.filter(a => a.status !== 'closed' && a.status !== 'superseded').length

  const editInputStyle = {
    width: '100%', padding: '8px 12px', border: `1px solid ${BRAND.greyBorder}`,
    fontFamily: BRAND.font, fontSize: '14px', color: BRAND.coolGrey,
    background: editing ? BRAND.white : BRAND.greyLight, boxSizing: 'border-box',
  }

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'actions', label: 'Actions', count: openActions },
    { key: 'contacts', label: 'Key Contacts', count: contacts.length },
    { key: 'meetings', label: 'Meeting Minutes', count: meetings.length },
    { key: 'risks', label: 'Risk Register', count: openRisks },
    { key: 'lessons', label: 'Lessons Learned', count: lessons.length },
    { key: 'savings', label: 'Savings Log', count: savings.length },
    { key: 'variations', label: 'Change Orders', count: variations.length },
    { key: 'documents', label: 'Key Documents', count: documents.length },
  ]

  const commonProps = { projectId, employees, onReload: loadAll, clientName: client?.name || '' }

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
        action={activeTab === 'overview' && (
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
        )}
      />

      {message && (
        <div style={{ padding: '10px 16px', marginBottom: '16px', fontSize: '13px',
          background: message.type === 'error' ? '#FDECEC' : '#E8F5E8',
          color: message.type === 'error' ? BRAND.red : BRAND.green,
        }}>{message.text}</div>
      )}

      <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', flexWrap: 'wrap' }}>
        {tabs.map(tab => (
          <TabButton key={tab.key} label={tab.label} active={activeTab === tab.key}
            onClick={() => setActiveTab(tab.key)} count={tab.count} />
        ))}
      </div>

      {activeTab === 'overview' && (
        <OverviewTab project={project} workOrder={workOrder} rateLines={rateLines}
          employeeSummary={employeeSummary} clients={clients} form={form} setForm={setForm}
          editing={editing} inputStyle={editInputStyle} workOrders={workOrders}
          woBudget={woBudget} totalInvoiced={totalInvoiced}
          totalPlannedRevenue={totalPlannedRevenue} totalPlannedCost={totalPlannedCost}
          projectMargin={projectMargin} projectMarginPct={projectMarginPct}
          totalPlannedHours={totalPlannedHours} tangibleSavings={tangibleSavings} openRisks={openRisks} />
      )}
      {activeTab === 'actions' && <ActionsTab actions={projectActions} {...commonProps} />}
      {activeTab === 'contacts' && <ContactsTab contacts={contacts} {...commonProps} />}
      {activeTab === 'meetings' && <MeetingsTab meetings={meetings} {...commonProps} />}
      {activeTab === 'risks' && <RisksTab risks={risks} {...commonProps} />}
      {activeTab === 'lessons' && <LessonsTab lessons={lessons} {...commonProps} />}
      {activeTab === 'savings' && <SavingsTab savings={savings} {...commonProps} />}
      {activeTab === 'variations' && <VariationsTab variations={variations} {...commonProps} />}
      {activeTab === 'documents' && <DocumentsTab documents={documents} {...commonProps} />}
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
          <div><label style={{ display: 'block', fontSize: '12px', color: BRAND.coolGrey, marginBottom: '4px' }}>Project Code</label><input value={form.code || ''} disabled style={{ ...inputStyle, background: BRAND.greyLight }} /></div>
          <div><label style={{ display: 'block', fontSize: '12px', color: BRAND.coolGrey, marginBottom: '4px' }}>Name</label><input value={form.name || ''} disabled={!editing} onChange={e => setForm({ ...form, name: e.target.value })} style={inputStyle} /></div>
          <div><label style={{ display: 'block', fontSize: '12px', color: BRAND.coolGrey, marginBottom: '4px' }}>Client</label><select value={form.client_id || ''} disabled={!editing} onChange={e => setForm({ ...form, client_id: e.target.value })} style={inputStyle}><option value="">No client</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div><label style={{ display: 'block', fontSize: '12px', color: BRAND.coolGrey, marginBottom: '4px' }}>Work Order</label><select value={form.work_order_id || ''} disabled={!editing} onChange={e => setForm({ ...form, work_order_id: e.target.value })} style={inputStyle}><option value="">No work order</option>{workOrders.filter(w => !form.client_id || w.client_id === form.client_id).map(w => <option key={w.id} value={w.id}>{w.po_reference}{w.name ? ` — ${w.name}` : ''}</option>)}</select></div>
          <div><label style={{ display: 'block', fontSize: '12px', color: BRAND.coolGrey, marginBottom: '4px' }}>Type</label><select value={form.type || 'billable'} disabled={!editing} onChange={e => setForm({ ...form, type: e.target.value })} style={inputStyle}><option value="billable">Billable</option><option value="overhead">Overhead</option></select></div>
          <div><label style={{ display: 'block', fontSize: '12px', color: BRAND.coolGrey, marginBottom: '4px' }}>Start Date</label><input type="date" value={form.effective_start || ''} disabled={!editing} onChange={e => setForm({ ...form, effective_start: e.target.value })} style={inputStyle} /></div>
          <div><label style={{ display: 'block', fontSize: '12px', color: BRAND.coolGrey, marginBottom: '4px' }}>End Date</label><input type="date" value={form.effective_end || ''} disabled={!editing} onChange={e => setForm({ ...form, effective_end: e.target.value })} style={inputStyle} /></div>
        </div>
      </div>

      {rateLines.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <span style={{ fontSize: '15px', color: BRAND.purple, display: 'block', marginBottom: '12px' }}>Available Rate Lines (from {workOrder?.po_reference})</span>
          <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}` }}>
            <DataTable columns={[
              { header: 'Label', accessor: 'label' },
              { header: 'Bill Rate', render: r => formatCurrencyExact(r.bill_rate), nowrap: true },
              { header: 'Default', render: r => r.is_default ? 'Yes' : '' },
            ]} data={rateLines} />
          </div>
        </div>
      )}

      <div style={{ marginBottom: '24px' }}>
        <span style={{ fontSize: '15px', color: BRAND.purple, display: 'block', marginBottom: '12px' }}>Assigned Employees</span>
        <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}` }}>
          <DataTable columns={[
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
              const m = rev - cost; const pct = rev > 0 ? m / rev : 0
              return <span style={{ color: pct > 0.3 ? BRAND.green : pct > 0.15 ? BRAND.amber : BRAND.red }}>{formatPct(pct)}</span>
            }, nowrap: true },
          ]} data={employeeSummary} emptyMessage="No employees assigned. Use the Hours Grid to assign employees." />
        </div>
      </div>
    </>
  )
}

// ============================================================================
// ACTIONS TAB
// ============================================================================
const sourceOptions = [
  { value: 'manual', label: 'Manual entry' }, { value: 'phone_call', label: 'Phone call' },
  { value: 'site_visit', label: 'Site visit' }, { value: 'email', label: 'Email' },
  { value: 'data_review', label: 'Data review' }, { value: 'risk_response', label: 'Risk response' },
  { value: 'client_request', label: 'Client request' }, { value: 'internal_review', label: 'Internal review' },
  { value: 'other', label: 'Other' },
]

function ActionsTab({ actions, projectId, employees, onReload }) {
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)
  const [f, setF] = useState({ description: '', owner_name: '', due_date: '', priority: 'normal', source: 'manual', source_detail: '', notes: '' })

  const open = actions.filter(a => a.status !== 'closed' && a.status !== 'superseded')
  const closed = actions.filter(a => a.status === 'closed' || a.status === 'superseded')

  async function handleAdd() {
    if (!f.description.trim()) { setMsg({ type: 'error', text: 'Description is required.' }); return }
    if (!f.owner_name) { setMsg({ type: 'error', text: 'Owner is required.' }); return }
    setSaving(true); setMsg(null)
    const { error } = await supabase.from('project_actions').insert({
      sector_id: PCS_SECTOR_ID, project_id: projectId, action_ref: '',
      description: f.description.trim(), owner_name: f.owner_name,
      due_date: f.due_date || null, priority: f.priority, source: f.source,
      source_detail: f.source_detail.trim() || null, notes: f.notes.trim() || null,
    })
    if (error) { setMsg({ type: 'error', text: error.message }) }
    else { setF({ description: '', owner_name: '', due_date: '', priority: 'normal', source: 'manual', source_detail: '', notes: '' }); setShowForm(false); onReload() }
    setSaving(false)
  }

  async function handleStatusChange(id, status) {
    await supabase.from('project_actions').update({ status }).eq('id', id); onReload()
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <span style={{ fontSize: '15px', color: BRAND.purple }}>{open.length} open action{open.length !== 1 ? 's' : ''}{closed.length > 0 && <span style={{ fontSize: '12px', color: BRAND.coolGrey, marginLeft: '8px' }}>({closed.length} closed)</span>}</span>
        {!showForm && <AddButton label="Add Action" onClick={() => setShowForm(true)} />}
      </div>

      {showForm && (
        <FormWrapper>
          <span style={{ fontSize: '14px', color: BRAND.purple, display: 'block', marginBottom: '16px' }}>New Action</span>
          <FormMessage msg={msg} />
          <FormGrid>
            <FormField label="Description" span><textarea value={f.description} onChange={e => setF({ ...f, description: e.target.value })} rows={2} style={{ ...formInputStyle, resize: 'vertical' }} placeholder="What needs to be done?" /></FormField>
            <FormField label="Owner"><select value={f.owner_name} onChange={e => setF({ ...f, owner_name: e.target.value })} style={formInputStyle}><option value="">Select owner...</option>{employees.map(emp => <option key={emp.id} value={emp.name}>{emp.name}</option>)}</select></FormField>
            <FormField label="Due Date"><input type="date" value={f.due_date} onChange={e => setF({ ...f, due_date: e.target.value })} style={formInputStyle} /></FormField>
            <FormField label="Priority"><select value={f.priority} onChange={e => setF({ ...f, priority: e.target.value })} style={formInputStyle}><option value="critical">Critical</option><option value="high">High</option><option value="normal">Normal</option><option value="low">Low</option></select></FormField>
            <FormField label="Source"><select value={f.source} onChange={e => setF({ ...f, source: e.target.value })} style={formInputStyle}>{sourceOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></FormField>
            <FormField label="Source Detail"><input value={f.source_detail} onChange={e => setF({ ...f, source_detail: e.target.value })} style={formInputStyle} placeholder="e.g. Call with Jane Smith" /></FormField>
            <FormField label="Notes (optional)"><input value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} style={formInputStyle} placeholder="Additional context..." /></FormField>
          </FormGrid>
          <FormButtons onCancel={() => { setShowForm(false); setMsg(null) }} onSave={handleAdd} saving={saving} label="Add Action" />
        </FormWrapper>
      )}

      <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, marginBottom: '24px' }}>
        <DataTable columns={[
          { header: 'Ref', accessor: 'action_ref', nowrap: true },
          { header: 'Description', accessor: 'description' },
          { header: 'Owner', accessor: 'owner_name' },
          { header: 'Due', render: r => { const od = r.due_date && new Date(r.due_date) < new Date(); return <span style={{ color: od ? BRAND.red : BRAND.coolGrey }}>{formatDate(r.due_date)}</span> }, nowrap: true },
          { header: 'Priority', render: r => <StatusBadge status={r.priority} map={actionPriorityMap} /> },
          { header: 'Status', render: r => <select value={r.status} onChange={e => handleStatusChange(r.id, e.target.value)} style={{ padding: '3px 8px', border: `1px solid ${BRAND.greyBorder}`, fontFamily: BRAND.font, fontSize: '12px', color: BRAND.coolGrey, background: BRAND.white, cursor: 'pointer' }}><option value="open">Open</option><option value="in_progress">In Progress</option><option value="closed">Closed</option></select> },
          { header: 'Source', render: r => <span style={{ textTransform: 'capitalize', fontSize: '12px' }}>{(r.source || '').replace(/_/g, ' ')}</span> },
        ]} data={open} emptyMessage="No open actions. Use 'Add Action' to create one." />
      </div>

      {closed.length > 0 && (
        <>
          <span style={{ fontSize: '15px', color: BRAND.purple, display: 'block', marginBottom: '12px' }}>Closed Actions</span>
          <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}` }}>
            <DataTable columns={[
              { header: 'Ref', accessor: 'action_ref', nowrap: true },
              { header: 'Description', accessor: 'description' },
              { header: 'Owner', accessor: 'owner_name' },
              { header: 'Completed', render: r => formatDate(r.completed_date), nowrap: true },
              { header: 'Status', render: r => <StatusBadge status={r.status} map={actionStatusMap} /> },
            ]} data={closed} />
          </div>
        </>
      )}
    </div>
  )
}

// ============================================================================
// CONTACTS TAB
// ============================================================================
function ContactsTab({ contacts, projectId, employees, onReload, clientName }) {
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)
  const [f, setF] = useState({ name: '', organisation: '', role: '', stakeholder_type: 'operational', email: '', phone: '', is_primary: false, notes: '' })

  const clientContacts = contacts.filter(c => c.organisation !== 'Currie & Brown')
  const cbContacts = contacts.filter(c => c.organisation === 'Currie & Brown')

  // Build unique org list from existing contacts + always include CB and client
  const orgOptions = ['Currie & Brown']
  if (clientName && !orgOptions.includes(clientName)) orgOptions.push(clientName)
  contacts.forEach(c => { if (c.organisation && !orgOptions.includes(c.organisation)) orgOptions.push(c.organisation) })

  async function handleAdd() {
    if (!f.name.trim()) { setMsg({ type: 'error', text: 'Name is required.' }); return }
    if (!f.organisation.trim()) { setMsg({ type: 'error', text: 'Organisation is required.' }); return }
    setSaving(true); setMsg(null)
    const { error } = await supabase.from('project_contacts').insert({
      sector_id: PCS_SECTOR_ID, project_id: projectId,
      name: f.name.trim(), organisation: f.organisation.trim() || null, role: f.role.trim() || null,
      stakeholder_type: f.stakeholder_type, email: f.email.trim() || null, phone: f.phone.trim() || null,
      is_primary: f.is_primary, notes: f.notes.trim() || null,
    })
    if (error) { setMsg({ type: 'error', text: error.message }) }
    else { setF({ name: '', organisation: '', role: '', stakeholder_type: 'operational', email: '', phone: '', is_primary: false, notes: '' }); setShowForm(false); onReload() }
    setSaving(false)
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <span style={{ fontSize: '15px', color: BRAND.purple }}>{contacts.length} contact{contacts.length !== 1 ? 's' : ''}</span>
        {!showForm && <AddButton label="Add Contact" onClick={() => setShowForm(true)} />}
      </div>

      {showForm && (
        <FormWrapper>
          <span style={{ fontSize: '14px', color: BRAND.purple, display: 'block', marginBottom: '16px' }}>New Contact</span>
          <FormMessage msg={msg} />
          <FormGrid>
            <FormField label="Name"><input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} style={formInputStyle} placeholder="Full name" /></FormField>
            <FormField label="Organisation">
              <select value={orgOptions.includes(f.organisation) ? f.organisation : '__other'} onChange={e => {
                if (e.target.value === '__other') setF({ ...f, organisation: '' })
                else setF({ ...f, organisation: e.target.value })
              }} style={formInputStyle}>
                <option value="">Select organisation...</option>
                {orgOptions.map(o => <option key={o} value={o}>{o}</option>)}
                <option value="__other">Other...</option>
              </select>
              {!orgOptions.includes(f.organisation) && f.organisation !== '' && (
                <input value={f.organisation} onChange={e => setF({ ...f, organisation: e.target.value })} style={{ ...formInputStyle, marginTop: '6px' }} placeholder="Enter organisation name" />
              )}
              {f.organisation === '' && (
                <input value="" onChange={e => setF({ ...f, organisation: e.target.value })} style={{ ...formInputStyle, marginTop: '6px' }} placeholder="Enter organisation name" />
              )}
            </FormField>
            <FormField label="Role"><input value={f.role} onChange={e => setF({ ...f, role: e.target.value })} style={formInputStyle} placeholder="e.g. Program Director" /></FormField>
            <FormField label="Type"><select value={f.stakeholder_type} onChange={e => setF({ ...f, stakeholder_type: e.target.value })} style={formInputStyle}><option value="decision_maker">Decision Maker</option><option value="influencer">Influencer</option><option value="operational">Operational</option><option value="observer">Observer</option></select></FormField>
            <FormField label="Email"><input type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} style={formInputStyle} /></FormField>
            <FormField label="Phone"><input value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} style={formInputStyle} /></FormField>
            <FormField label="Notes" span><input value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} style={formInputStyle} placeholder="Additional notes..." /></FormField>
          </FormGrid>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: BRAND.coolGrey, cursor: 'pointer' }}>
              <input type="checkbox" checked={f.is_primary} onChange={e => setF({ ...f, is_primary: e.target.checked })} /> Primary contact
            </label>
            <FormButtons onCancel={() => { setShowForm(false); setMsg(null) }} onSave={handleAdd} saving={saving} label="Add Contact" />
          </div>
        </FormWrapper>
      )}

      <span style={{ fontSize: '15px', color: BRAND.purple, display: 'block', marginBottom: '12px' }}>Client Stakeholders</span>
      <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, marginBottom: '24px' }}>
        <DataTable columns={[
          { header: 'Name', accessor: 'name' }, { header: 'Organisation', accessor: 'organisation' },
          { header: 'Role', accessor: 'role' },
          { header: 'Type', render: r => <StatusBadge status={r.stakeholder_type} map={stakeholderTypeMap} /> },
          { header: 'Primary', render: r => r.is_primary ? 'Yes' : '' },
          { header: 'Email', accessor: 'email' }, { header: 'Phone', accessor: 'phone' },
        ]} data={clientContacts} emptyMessage="No client stakeholders recorded." />
      </div>

      <span style={{ fontSize: '15px', color: BRAND.purple, display: 'block', marginBottom: '12px' }}>Currie & Brown Team</span>
      <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}` }}>
        <DataTable columns={[
          { header: 'Name', accessor: 'name' }, { header: 'Role', accessor: 'role' },
          { header: 'Type', render: r => <StatusBadge status={r.stakeholder_type} map={stakeholderTypeMap} /> },
          { header: 'Primary', render: r => r.is_primary ? 'Yes' : '' },
          { header: 'Notes', accessor: 'notes' },
        ]} data={cbContacts} emptyMessage="No CB team members recorded." />
      </div>
    </>
  )
}

// ============================================================================
// MEETINGS TAB
// ============================================================================
function MeetingsTab({ meetings, projectId, employees, onReload }) {
  const [expanded, setExpanded] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)
  const [f, setF] = useState({ title: '', meeting_date: '', meeting_type: 'progress', location: '', notes: '', client_sentiment: '' })

  async function handleAdd() {
    if (!f.title.trim()) { setMsg({ type: 'error', text: 'Title is required.' }); return }
    if (!f.meeting_date) { setMsg({ type: 'error', text: 'Date is required.' }); return }
    setSaving(true); setMsg(null)
    const { error } = await supabase.from('meetings').insert({
      sector_id: PCS_SECTOR_ID, project_id: projectId,
      title: f.title.trim(), meeting_date: f.meeting_date, meeting_type: f.meeting_type,
      location: f.location.trim() || null, notes: f.notes.trim() || null,
      client_sentiment: f.client_sentiment || null, status: 'scheduled',
    })
    if (error) { setMsg({ type: 'error', text: error.message }) }
    else { setF({ title: '', meeting_date: '', meeting_type: 'progress', location: '', notes: '', client_sentiment: '' }); setShowForm(false); onReload() }
    setSaving(false)
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <span style={{ fontSize: '15px', color: BRAND.purple }}>{meetings.length} meeting{meetings.length !== 1 ? 's' : ''}</span>
        {!showForm && <AddButton label="Add Meeting" onClick={() => setShowForm(true)} />}
      </div>

      {showForm && (
        <FormWrapper>
          <span style={{ fontSize: '14px', color: BRAND.purple, display: 'block', marginBottom: '16px' }}>New Meeting</span>
          <FormMessage msg={msg} />
          <FormGrid>
            <FormField label="Title" span><input value={f.title} onChange={e => setF({ ...f, title: e.target.value })} style={formInputStyle} placeholder="Meeting title" /></FormField>
            <FormField label="Date"><input type="date" value={f.meeting_date} onChange={e => setF({ ...f, meeting_date: e.target.value })} style={formInputStyle} /></FormField>
            <FormField label="Type"><select value={f.meeting_type} onChange={e => setF({ ...f, meeting_type: e.target.value })} style={formInputStyle}><option value="progress">Progress</option><option value="kick_off">Kick Off</option><option value="review">Review</option><option value="workshop">Workshop</option><option value="site_visit">Site Visit</option><option value="close_out">Close Out</option><option value="introduction">Introduction</option><option value="proposal">Proposal</option><option value="pitch">Pitch</option><option value="negotiation">Negotiation</option></select></FormField>
            <FormField label="Location"><input value={f.location} onChange={e => setF({ ...f, location: e.target.value })} style={formInputStyle} placeholder="e.g. TSMC Phoenix Office" /></FormField>
            <FormField label="Client Sentiment"><select value={f.client_sentiment} onChange={e => setF({ ...f, client_sentiment: e.target.value })} style={formInputStyle}><option value="">Not recorded</option><option value="very_satisfied">Very Satisfied</option><option value="satisfied">Satisfied</option><option value="neutral">Neutral</option><option value="concerned">Concerned</option><option value="dissatisfied">Dissatisfied</option></select></FormField>
            <FormField label="Notes" span><textarea value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} rows={3} style={{ ...formInputStyle, resize: 'vertical' }} placeholder="Meeting notes..." /></FormField>
          </FormGrid>
          <FormButtons onCancel={() => { setShowForm(false); setMsg(null) }} onSave={handleAdd} saving={saving} label="Add Meeting" />
        </FormWrapper>
      )}

      {meetings.length === 0 ? (
        <div style={{ padding: '24px', background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, color: BRAND.coolGrey, fontSize: '14px' }}>No meetings recorded for this project.</div>
      ) : (
        meetings.map(m => (
          <div key={m.id} style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, marginBottom: '8px', overflow: 'hidden' }}>
            <button onClick={() => setExpanded(expanded === m.id ? null : m.id)} style={{
              width: '100%', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              background: 'none', border: 'none', cursor: 'pointer', fontFamily: BRAND.font, textAlign: 'left',
            }}>
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
                {m.description && <div style={{ padding: '12px 0 4px', fontSize: '13px', color: BRAND.coolGrey }}>{m.description}</div>}
                {m.notes && <div style={{ padding: '8px 0', fontSize: '13px', color: BRAND.coolGrey, lineHeight: '1.5' }}>{m.notes}</div>}
                <div style={{ display: 'flex', gap: '24px', fontSize: '12px', color: BRAND.coolGrey, paddingTop: '8px' }}>
                  {m.location && <span>Location: {m.location}</span>}
                  {m.next_meeting_date && <span>Next: {formatDate(m.next_meeting_date)}</span>}
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
// RISKS TAB
// ============================================================================
function RisksTab({ risks, projectId, employees, onReload }) {
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)
  const [f, setF] = useState({ title: '', category: 'delivery', likelihood: 'medium', impact: 'medium', status: 'open', owner: '', mitigation: '', identified_date: new Date().toISOString().slice(0, 10) })

  async function handleAdd() {
    if (!f.title.trim()) { setMsg({ type: 'error', text: 'Title is required.' }); return }
    setSaving(true); setMsg(null)
    const { error } = await supabase.from('project_risks').insert({
      sector_id: PCS_SECTOR_ID, project_id: projectId,
      title: f.title.trim(), category: f.category, likelihood: f.likelihood, impact: f.impact,
      status: f.status, owner: f.owner.trim() || null, mitigation: f.mitigation.trim() || null,
      identified_date: f.identified_date || null,
    })
    if (error) { setMsg({ type: 'error', text: error.message }) }
    else { setF({ title: '', category: 'delivery', likelihood: 'medium', impact: 'medium', status: 'open', owner: '', mitigation: '', identified_date: new Date().toISOString().slice(0, 10) }); setShowForm(false); onReload() }
    setSaving(false)
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <span style={{ fontSize: '15px', color: BRAND.purple }}>{risks.filter(r => r.status !== 'closed').length} open risk{risks.filter(r => r.status !== 'closed').length !== 1 ? 's' : ''}</span>
        {!showForm && <AddButton label="Add Risk" onClick={() => setShowForm(true)} />}
      </div>

      {showForm && (
        <FormWrapper>
          <span style={{ fontSize: '14px', color: BRAND.purple, display: 'block', marginBottom: '16px' }}>New Risk</span>
          <FormMessage msg={msg} />
          <FormGrid>
            <FormField label="Title" span><input value={f.title} onChange={e => setF({ ...f, title: e.target.value })} style={formInputStyle} placeholder="Risk description" /></FormField>
            <FormField label="Category"><select value={f.category} onChange={e => setF({ ...f, category: e.target.value })} style={formInputStyle}><option value="delivery">Delivery</option><option value="financial">Financial</option><option value="resource">Resource</option><option value="client">Client</option><option value="compliance">Compliance</option><option value="technical">Technical</option><option value="competition">Competition</option><option value="pricing">Pricing</option><option value="timeline">Timeline</option><option value="scope">Scope</option><option value="relationship">Relationship</option></select></FormField>
            <FormField label="Identified"><input type="date" value={f.identified_date} onChange={e => setF({ ...f, identified_date: e.target.value })} style={formInputStyle} /></FormField>
            <FormField label="Likelihood"><select value={f.likelihood} onChange={e => setF({ ...f, likelihood: e.target.value })} style={formInputStyle}><option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></FormField>
            <FormField label="Impact"><select value={f.impact} onChange={e => setF({ ...f, impact: e.target.value })} style={formInputStyle}><option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></FormField>
            <FormField label="Owner"><select value={f.owner} onChange={e => setF({ ...f, owner: e.target.value })} style={formInputStyle}><option value="">Select owner...</option>{employees.map(emp => <option key={emp.id} value={emp.name}>{emp.name}</option>)}</select></FormField>
            <FormField label="Mitigation" span><textarea value={f.mitigation} onChange={e => setF({ ...f, mitigation: e.target.value })} rows={2} style={{ ...formInputStyle, resize: 'vertical' }} placeholder="Mitigation strategy..." /></FormField>
          </FormGrid>
          <FormButtons onCancel={() => { setShowForm(false); setMsg(null) }} onSave={handleAdd} saving={saving} label="Add Risk" />
        </FormWrapper>
      )}

      <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}` }}>
        <DataTable columns={[
          { header: 'Title', accessor: 'title' },
          { header: 'Category', render: r => <span style={{ textTransform: 'capitalize' }}>{(r.category || '').replace(/_/g, ' ')}</span> },
          { header: 'Likelihood', render: r => <StatusBadge status={r.likelihood} map={riskLevelMap} /> },
          { header: 'Impact', render: r => <StatusBadge status={r.impact} map={riskLevelMap} /> },
          { header: 'Status', render: r => <StatusBadge status={r.status} map={riskStatusMap} /> },
          { header: 'Owner', accessor: 'owner' },
          { header: 'Mitigation', accessor: 'mitigation' },
          { header: 'Identified', render: r => formatDate(r.identified_date), nowrap: true },
        ]} data={risks} emptyMessage="No risks recorded for this project." />
      </div>
    </div>
  )
}

// ============================================================================
// LESSONS TAB
// ============================================================================
function LessonsTab({ lessons, projectId, employees, onReload }) {
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)
  const [f, setF] = useState({ lesson_date: new Date().toISOString().slice(0, 10), category: 'process', outcome: 'went_well', what_happened: '', root_cause: '', action_taken: '' })

  async function handleAdd() {
    if (!f.what_happened.trim()) { setMsg({ type: 'error', text: 'What happened is required.' }); return }
    setSaving(true); setMsg(null)
    const { error } = await supabase.from('project_lessons').insert({
      sector_id: PCS_SECTOR_ID, project_id: projectId,
      lesson_date: f.lesson_date || null, category: f.category, outcome: f.outcome,
      what_happened: f.what_happened.trim(), root_cause: f.root_cause.trim() || null,
      action_taken: f.action_taken.trim() || null,
    })
    if (error) { setMsg({ type: 'error', text: error.message }) }
    else { setF({ lesson_date: new Date().toISOString().slice(0, 10), category: 'process', outcome: 'went_well', what_happened: '', root_cause: '', action_taken: '' }); setShowForm(false); onReload() }
    setSaving(false)
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <span style={{ fontSize: '15px', color: BRAND.purple }}>{lessons.length} lesson{lessons.length !== 1 ? 's' : ''}</span>
        {!showForm && <AddButton label="Add Lesson" onClick={() => setShowForm(true)} />}
      </div>

      {showForm && (
        <FormWrapper>
          <span style={{ fontSize: '14px', color: BRAND.purple, display: 'block', marginBottom: '16px' }}>New Lesson</span>
          <FormMessage msg={msg} />
          <FormGrid>
            <FormField label="Date"><input type="date" value={f.lesson_date} onChange={e => setF({ ...f, lesson_date: e.target.value })} style={formInputStyle} /></FormField>
            <FormField label="Category"><select value={f.category} onChange={e => setF({ ...f, category: e.target.value })} style={formInputStyle}><option value="process">Process</option><option value="technical">Technical</option><option value="communication">Communication</option><option value="resource">Resource</option><option value="client">Client</option><option value="compliance">Compliance</option></select></FormField>
            <FormField label="Outcome"><select value={f.outcome} onChange={e => setF({ ...f, outcome: e.target.value })} style={formInputStyle}><option value="went_well">Went Well</option><option value="improve">To Improve</option></select></FormField>
            <FormField label="What Happened" span><textarea value={f.what_happened} onChange={e => setF({ ...f, what_happened: e.target.value })} rows={2} style={{ ...formInputStyle, resize: 'vertical' }} placeholder="Describe what happened..." /></FormField>
            <FormField label="Root Cause"><input value={f.root_cause} onChange={e => setF({ ...f, root_cause: e.target.value })} style={formInputStyle} placeholder="Why did this happen?" /></FormField>
            <FormField label="Action Taken"><input value={f.action_taken} onChange={e => setF({ ...f, action_taken: e.target.value })} style={formInputStyle} placeholder="What was done about it?" /></FormField>
          </FormGrid>
          <FormButtons onCancel={() => { setShowForm(false); setMsg(null) }} onSave={handleAdd} saving={saving} label="Add Lesson" />
        </FormWrapper>
      )}

      <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}` }}>
        <DataTable columns={[
          { header: 'Date', render: r => formatDate(r.lesson_date), nowrap: true },
          { header: 'Category', render: r => <span style={{ textTransform: 'capitalize' }}>{(r.category || '').replace(/_/g, ' ')}</span> },
          { header: 'Outcome', render: r => <StatusBadge status={r.outcome} map={lessonOutcomeMap} /> },
          { header: 'What Happened', accessor: 'what_happened' },
          { header: 'Root Cause', accessor: 'root_cause' },
          { header: 'Action Taken', accessor: 'action_taken' },
        ]} data={lessons} emptyMessage="No lessons recorded for this project." />
      </div>
    </div>
  )
}

// ============================================================================
// SAVINGS TAB
// ============================================================================
function SavingsTab({ savings, projectId, employees, onReload }) {
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)
  const [f, setF] = useState({ saving_date: new Date().toISOString().slice(0, 10), title: '', saving_type: 'tangible', category: 'cost_avoidance', amount: '', calculation_basis: '', beneficiary: '', description: '' })

  const tangible = savings.filter(s => s.saving_type === 'tangible')
  const intangible = savings.filter(s => s.saving_type === 'intangible')
  const totalTangible = tangible.reduce((t, s) => t + Number(s.amount || 0), 0)

  async function handleAdd() {
    if (!f.title.trim()) { setMsg({ type: 'error', text: 'Title is required.' }); return }
    setSaving(true); setMsg(null)
    const { error } = await supabase.from('project_savings').insert({
      sector_id: PCS_SECTOR_ID, project_id: projectId,
      saving_date: f.saving_date || null, title: f.title.trim(), saving_type: f.saving_type,
      category: f.category, amount: f.saving_type === 'tangible' && f.amount ? parseFloat(f.amount) : null,
      calculation_basis: f.calculation_basis.trim() || null, beneficiary: f.beneficiary.trim() || null,
      description: f.description.trim() || null,
    })
    if (error) { setMsg({ type: 'error', text: error.message }) }
    else { setF({ saving_date: new Date().toISOString().slice(0, 10), title: '', saving_type: 'tangible', category: 'cost_avoidance', amount: '', calculation_basis: '', beneficiary: '', description: '' }); setShowForm(false); onReload() }
    setSaving(false)
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', flex: 1, marginRight: '16px' }}>
          <KPICard label="Tangible Savings" value={formatCurrency(totalTangible)} color={BRAND.green} />
          <KPICard label="Tangible Count" value={tangible.length} />
          <KPICard label="Intangible Count" value={intangible.length} />
          <KPICard label="Verified" value={savings.filter(s => s.verified).length} color={BRAND.teal} />
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
        {!showForm && <AddButton label="Add Saving" onClick={() => setShowForm(true)} />}
      </div>

      {showForm && (
        <FormWrapper>
          <span style={{ fontSize: '14px', color: BRAND.purple, display: 'block', marginBottom: '16px' }}>New Saving</span>
          <FormMessage msg={msg} />
          <FormGrid>
            <FormField label="Title" span><input value={f.title} onChange={e => setF({ ...f, title: e.target.value })} style={formInputStyle} placeholder="Saving title" /></FormField>
            <FormField label="Date"><input type="date" value={f.saving_date} onChange={e => setF({ ...f, saving_date: e.target.value })} style={formInputStyle} /></FormField>
            <FormField label="Type"><select value={f.saving_type} onChange={e => setF({ ...f, saving_type: e.target.value })} style={formInputStyle}><option value="tangible">Tangible</option><option value="intangible">Intangible</option></select></FormField>
            <FormField label="Category"><select value={f.category} onChange={e => setF({ ...f, category: e.target.value })} style={formInputStyle}><option value="cost_avoidance">Cost Avoidance</option><option value="cost_reduction">Cost Reduction</option><option value="schedule_improvement">Schedule Improvement</option><option value="quality_improvement">Quality Improvement</option><option value="risk_mitigation">Risk Mitigation</option><option value="process_improvement">Process Improvement</option></select></FormField>
            {f.saving_type === 'tangible' && <FormField label="Amount ($)"><input type="number" value={f.amount} onChange={e => setF({ ...f, amount: e.target.value })} style={formInputStyle} placeholder="0.00" /></FormField>}
            {f.saving_type === 'tangible' && <FormField label="Calculation Basis"><input value={f.calculation_basis} onChange={e => setF({ ...f, calculation_basis: e.target.value })} style={formInputStyle} placeholder="How was this calculated?" /></FormField>}
            <FormField label="Beneficiary"><input value={f.beneficiary} onChange={e => setF({ ...f, beneficiary: e.target.value })} style={formInputStyle} placeholder="e.g. TSMC" /></FormField>
            <FormField label="Description"><input value={f.description} onChange={e => setF({ ...f, description: e.target.value })} style={formInputStyle} placeholder="Brief description..." /></FormField>
          </FormGrid>
          <FormButtons onCancel={() => { setShowForm(false); setMsg(null) }} onSave={handleAdd} saving={saving} label="Add Saving" />
        </FormWrapper>
      )}

      <span style={{ fontSize: '15px', color: BRAND.purple, display: 'block', marginBottom: '12px' }}>Tangible Savings</span>
      <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, marginBottom: '24px' }}>
        <DataTable columns={[
          { header: 'Date', render: r => formatDate(r.saving_date), nowrap: true },
          { header: 'Title', accessor: 'title' },
          { header: 'Category', render: r => <span style={{ textTransform: 'capitalize' }}>{(r.category || '').replace(/_/g, ' ')}</span> },
          { header: 'Amount', render: r => formatCurrency(r.amount), nowrap: true },
          { header: 'Basis', accessor: 'calculation_basis' },
          { header: 'Verified', render: r => r.verified ? 'Yes' : 'No' },
          { header: 'Beneficiary', accessor: 'beneficiary' },
        ]} data={tangible} emptyMessage="No tangible savings recorded." />
      </div>

      <span style={{ fontSize: '15px', color: BRAND.purple, display: 'block', marginBottom: '12px' }}>Intangible Savings</span>
      <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}` }}>
        <DataTable columns={[
          { header: 'Date', render: r => formatDate(r.saving_date), nowrap: true },
          { header: 'Title', accessor: 'title' },
          { header: 'Category', render: r => <span style={{ textTransform: 'capitalize' }}>{(r.category || '').replace(/_/g, ' ')}</span> },
          { header: 'Description', accessor: 'description' },
          { header: 'Beneficiary', accessor: 'beneficiary' },
        ]} data={intangible} emptyMessage="No intangible savings recorded." />
      </div>
    </>
  )
}

// ============================================================================
// VARIATIONS TAB
// ============================================================================
function VariationsTab({ variations, projectId, employees, onReload }) {
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)
  const [f, setF] = useState({ variation_ref: '', title: '', variation_type: 'scope_change', variation_amount: '', status: 'draft', raised_by: '', raised_date: new Date().toISOString().slice(0, 10), description: '' })

  const approved = variations.filter(v => v.status === 'approved')
  const totalVariationValue = approved.reduce((t, v) => t + Number(v.variation_amount || 0), 0)

  async function handleAdd() {
    if (!f.title.trim()) { setMsg({ type: 'error', text: 'Title is required.' }); return }
    if (!f.variation_ref.trim()) { setMsg({ type: 'error', text: 'Ref is required (e.g. V-003).' }); return }
    setSaving(true); setMsg(null)
    const { error } = await supabase.from('project_variations').insert({
      sector_id: PCS_SECTOR_ID, project_id: projectId,
      variation_ref: f.variation_ref.trim(), title: f.title.trim(), variation_type: f.variation_type,
      variation_amount: f.variation_amount ? parseFloat(f.variation_amount) : null,
      status: f.status, raised_by: f.raised_by.trim() || null,
      raised_date: f.raised_date || null, description: f.description.trim() || null,
    })
    if (error) { setMsg({ type: 'error', text: error.message }) }
    else { setF({ variation_ref: '', title: '', variation_type: 'scope_change', variation_amount: '', status: 'draft', raised_by: '', raised_date: new Date().toISOString().slice(0, 10), description: '' }); setShowForm(false); onReload() }
    setSaving(false)
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', flex: 1, marginRight: '16px' }}>
          <KPICard label="Total Variations" value={variations.length} />
          <KPICard label="Approved" value={approved.length} color={BRAND.green} />
          <KPICard label="Pending" value={variations.filter(v => ['draft', 'submitted', 'under_review'].includes(v.status)).length} color={BRAND.amber} />
          <KPICard label="Net Approved Value" value={formatCurrency(totalVariationValue)} color={totalVariationValue >= 0 ? BRAND.green : BRAND.red} />
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
        {!showForm && <AddButton label="Add Change Order" onClick={() => setShowForm(true)} />}
      </div>

      {showForm && (
        <FormWrapper>
          <span style={{ fontSize: '14px', color: BRAND.purple, display: 'block', marginBottom: '16px' }}>New Change Order</span>
          <FormMessage msg={msg} />
          <FormGrid>
            <FormField label="Ref (e.g. V-003)"><input value={f.variation_ref} onChange={e => setF({ ...f, variation_ref: e.target.value })} style={formInputStyle} placeholder="V-003" /></FormField>
            <FormField label="Title"><input value={f.title} onChange={e => setF({ ...f, title: e.target.value })} style={formInputStyle} placeholder="Change order title" /></FormField>
            <FormField label="Type"><select value={f.variation_type} onChange={e => setF({ ...f, variation_type: e.target.value })} style={formInputStyle}><option value="scope_change">Scope Change</option><option value="fee_variation">Fee Variation</option><option value="contract_amendment">Contract Amendment</option><option value="schedule_change">Schedule Change</option><option value="resource_change">Resource Change</option></select></FormField>
            <FormField label="Amount ($)"><input type="number" value={f.variation_amount} onChange={e => setF({ ...f, variation_amount: e.target.value })} style={formInputStyle} placeholder="0.00" /></FormField>
            <FormField label="Status"><select value={f.status} onChange={e => setF({ ...f, status: e.target.value })} style={formInputStyle}><option value="draft">Draft</option><option value="submitted">Submitted</option><option value="under_review">Under Review</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select></FormField>
            <FormField label="Raised By"><select value={f.raised_by} onChange={e => setF({ ...f, raised_by: e.target.value })} style={formInputStyle}><option value="">Select...</option>{employees.map(emp => <option key={emp.id} value={emp.name}>{emp.name}</option>)}</select></FormField>
            <FormField label="Raised Date"><input type="date" value={f.raised_date} onChange={e => setF({ ...f, raised_date: e.target.value })} style={formInputStyle} /></FormField>
            <FormField label="Description"><input value={f.description} onChange={e => setF({ ...f, description: e.target.value })} style={formInputStyle} placeholder="Brief description..." /></FormField>
          </FormGrid>
          <FormButtons onCancel={() => { setShowForm(false); setMsg(null) }} onSave={handleAdd} saving={saving} label="Add Change Order" />
        </FormWrapper>
      )}

      <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}` }}>
        <DataTable columns={[
          { header: 'Ref', accessor: 'variation_ref', nowrap: true },
          { header: 'Title', accessor: 'title' },
          { header: 'Type', render: r => <span style={{ textTransform: 'capitalize' }}>{(r.variation_type || '').replace(/_/g, ' ')}</span> },
          { header: 'Amount', render: r => r.variation_amount ? formatCurrency(r.variation_amount) : '—', nowrap: true },
          { header: 'Revised Value', render: r => r.revised_value ? formatCurrency(r.revised_value) : '—', nowrap: true },
          { header: 'Status', render: r => <StatusBadge status={r.status} map={variationStatusMap} /> },
          { header: 'Raised', render: r => formatDate(r.raised_date), nowrap: true },
          { header: 'Raised By', accessor: 'raised_by' },
          { header: 'Client Ref', accessor: 'client_reference' },
        ]} data={variations} emptyMessage="No variations recorded for this project." />
      </div>
    </>
  )
}

// ============================================================================
// DOCUMENTS TAB
// ============================================================================
function DocumentsTab({ documents, projectId, employees, onReload }) {
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)
  const [f, setF] = useState({ document_ref: '', title: '', document_type: 'report', version: '1.0', issued_date: new Date().toISOString().slice(0, 10), issued_by: '', issued_to: '', approval_status: 'not_required' })

  async function handleAdd() {
    if (!f.title.trim()) { setMsg({ type: 'error', text: 'Title is required.' }); return }
    if (!f.document_ref.trim()) { setMsg({ type: 'error', text: 'Ref is required (e.g. DOC-005).' }); return }
    setSaving(true); setMsg(null)
    const { error } = await supabase.from('project_documents').insert({
      sector_id: PCS_SECTOR_ID, project_id: projectId,
      document_ref: f.document_ref.trim(), title: f.title.trim(), document_type: f.document_type,
      version: f.version.trim() || '1.0', issued_date: f.issued_date || null,
      issued_by: f.issued_by.trim() || null, issued_to: f.issued_to.trim() || null,
      approval_status: f.approval_status,
    })
    if (error) { setMsg({ type: 'error', text: error.message }) }
    else { setF({ document_ref: '', title: '', document_type: 'report', version: '1.0', issued_date: new Date().toISOString().slice(0, 10), issued_by: '', issued_to: '', approval_status: 'not_required' }); setShowForm(false); onReload() }
    setSaving(false)
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <span style={{ fontSize: '15px', color: BRAND.purple }}>{documents.length} document{documents.length !== 1 ? 's' : ''}</span>
        {!showForm && <AddButton label="Add Document" onClick={() => setShowForm(true)} />}
      </div>

      {showForm && (
        <FormWrapper>
          <span style={{ fontSize: '14px', color: BRAND.purple, display: 'block', marginBottom: '16px' }}>New Document</span>
          <FormMessage msg={msg} />
          <FormGrid>
            <FormField label="Ref (e.g. DOC-005)"><input value={f.document_ref} onChange={e => setF({ ...f, document_ref: e.target.value })} style={formInputStyle} placeholder="DOC-005" /></FormField>
            <FormField label="Title"><input value={f.title} onChange={e => setF({ ...f, title: e.target.value })} style={formInputStyle} placeholder="Document title" /></FormField>
            <FormField label="Type"><select value={f.document_type} onChange={e => setF({ ...f, document_type: e.target.value })} style={formInputStyle}><option value="report">Report</option><option value="proposal">Proposal</option><option value="specification">Specification</option><option value="drawing">Drawing</option><option value="letter">Letter</option><option value="presentation">Presentation</option><option value="contract">Contract</option><option value="certificate">Certificate</option><option value="schedule">Schedule</option></select></FormField>
            <FormField label="Version"><input value={f.version} onChange={e => setF({ ...f, version: e.target.value })} style={formInputStyle} placeholder="1.0" /></FormField>
            <FormField label="Issued Date"><input type="date" value={f.issued_date} onChange={e => setF({ ...f, issued_date: e.target.value })} style={formInputStyle} /></FormField>
            <FormField label="Issued By"><select value={f.issued_by} onChange={e => setF({ ...f, issued_by: e.target.value })} style={formInputStyle}><option value="">Select...</option>{employees.map(emp => <option key={emp.id} value={emp.name}>{emp.name}</option>)}</select></FormField>
            <FormField label="Issued To"><input value={f.issued_to} onChange={e => setF({ ...f, issued_to: e.target.value })} style={formInputStyle} placeholder="e.g. TSMC" /></FormField>
            <FormField label="Approval Status"><select value={f.approval_status} onChange={e => setF({ ...f, approval_status: e.target.value })} style={formInputStyle}><option value="not_required">Not Required</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select></FormField>
          </FormGrid>
          <FormButtons onCancel={() => { setShowForm(false); setMsg(null) }} onSave={handleAdd} saving={saving} label="Add Document" />
        </FormWrapper>
      )}

      <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}` }}>
        <DataTable columns={[
          { header: 'Ref', accessor: 'document_ref', nowrap: true },
          { header: 'Title', accessor: 'title' },
          { header: 'Type', render: r => <span style={{ textTransform: 'capitalize' }}>{(r.document_type || '').replace(/_/g, ' ')}</span> },
          { header: 'Version', accessor: 'version', nowrap: true },
          { header: 'Issued', render: r => formatDate(r.issued_date), nowrap: true },
          { header: 'Issued By', accessor: 'issued_by' },
          { header: 'Issued To', accessor: 'issued_to' },
          { header: 'Approval', render: r => <StatusBadge status={r.approval_status} map={docApprovalMap} /> },
          { header: 'Approved By', accessor: 'approved_by' },
        ]} data={documents} emptyMessage="No documents recorded for this project." />
      </div>
    </div>
  )
}
