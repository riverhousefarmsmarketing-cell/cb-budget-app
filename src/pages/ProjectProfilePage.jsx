import React, { useState, useEffect, useMemo } from 'react'
import { BRAND } from '../lib/brand'
import { formatCurrencyExact, formatCurrency, formatDate, formatPct } from '../lib/utils'
import { supabase } from '../lib/supabase'
import { PCS_SECTOR_ID, useClients, useEmployees } from '../hooks/useData'
import { SectionHeader, LoadingState, StatusBadge, DataTable, KPICard, EmployeeLink } from '../components/SharedUI'
import AccountActionPlanSection from '../components/AccountActionPlanSection'
import QualityPlanSection from '../components/QualityPlanSection'
import { ApprovalBanner, isLocked } from '../components/ApprovalWorkflow'
import { auditDelete, auditDeleteWithData } from '../lib/auditDelete'

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
  const [accountPlans, setAccountPlans] = useState([])
  const [accountPlanActions, setAccountPlanActions] = useState([])
  const [qualityItems, setQualityItems] = useState([])

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

    const [contactsRes, risksRes, lessonsRes, savingsRes, meetingsRes, variationsRes, documentsRes, healthRes, actionsRes, acctPlansRes, acctActionsRes, qualityRes] = await Promise.all([
      supabase.from('project_contacts').select('*').eq('project_id', projectId).order('is_primary', { ascending: false }),
      supabase.from('project_risks').select('*').eq('project_id', projectId).order('identified_date', { ascending: false }),
      supabase.from('project_lessons').select('*').eq('project_id', projectId).order('lesson_date', { ascending: false }),
      supabase.from('project_savings').select('*').eq('project_id', projectId).order('saving_date', { ascending: false }),
      supabase.from('meetings').select('*').eq('project_id', projectId).order('meeting_date', { ascending: false }),
      supabase.from('project_variations').select('*').eq('project_id', projectId).order('variation_ref', { ascending: true }),
      supabase.from('project_documents').select('*').eq('project_id', projectId).order('document_ref', { ascending: true }),
      supabase.from('v_project_health').select('*').eq('project_id', projectId).maybeSingle(),
      supabase.from('project_actions').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
      supabase.from('account_action_plans').select('*').eq('sector_id', PCS_SECTOR_ID),
      supabase.from('account_actions').select('*').eq('sector_id', PCS_SECTOR_ID),
      supabase.from('quality_plan_items').select('*').eq('sector_id', PCS_SECTOR_ID),
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
    setAccountPlans(acctPlansRes.data || [])
    setAccountPlanActions(acctActionsRes.data || [])
    setQualityItems(qualityRes.data || [])
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
    { key: 'accountplan', label: 'Account Plan', count: accountPlanActions.filter(a => a.project_id === projectId).length },
    { key: 'quality', label: 'Quality Plan', count: qualityItems.filter(i => i.project_id === projectId || (i.client_id === project?.client_id && !i.project_id)).length },
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
      {activeTab === 'accountplan' && (
        <AccountActionPlanSection
          plans={accountPlans} planActions={accountPlanActions}
          projects={[]} projectMap={{}} projectId={projectId}
          clientId={project.client_id} clientName={client?.name || ''}
          employees={employees}
          onReload={loadAll} mode="project"
        />
      )}
      {activeTab === 'quality' && (
        <QualityPlanSection
          items={qualityItems} projectId={projectId}
          clientId={project.client_id} projects={[]}
          projectMap={{}} onReload={loadAll} mode="project"
          employees={employees}
        />
      )}
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
    if (!f.organisation.trim()) { setMsg({ type: 'error', text: 'Organization is required.' }); return }
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
            <FormField label="Organization">
              <select value={orgOptions.includes(f.organisation) ? f.organisation : '__other'} onChange={e => {
                if (e.target.value === '__other') setF({ ...f, organisation: '' })
                else setF({ ...f, organisation: e.target.value })
              }} style={formInputStyle}>
                <option value="">Select organization...</option>
                {orgOptions.map(o => <option key={o} value={o}>{o}</option>)}
                <option value="__other">Other...</option>
              </select>
              {!orgOptions.includes(f.organisation) && f.organisation !== '' && (
                <input value={f.organisation} onChange={e => setF({ ...f, organisation: e.target.value })} style={{ ...formInputStyle, marginTop: '6px' }} placeholder="Enter organization name" />
              )}
              {f.organisation === '' && (
                <input value="" onChange={e => setF({ ...f, organisation: e.target.value })} style={{ ...formInputStyle, marginTop: '6px' }} placeholder="Enter organization name" />
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
          { header: 'Name', accessor: 'name' }, { header: 'Organization', accessor: 'organisation' },
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
// MEETINGS TAB — unified minutes with line items (agenda + actions merged)
// ============================================================================
const minutesStatusMap = {
  not_started: { bg: BRAND.greyLight, text: BRAND.coolGrey, label: 'Not Started' },
  draft: { bg: '#FFF4E5', text: BRAND.amber, label: 'Draft' },
  issued: { bg: '#E8F4FD', text: BRAND.blue, label: 'Issued' },
  accepted: { bg: '#E8F5E8', text: BRAND.green, label: 'Accepted' },
}
const meetingStatusMap = {
  scheduled: { bg: '#E8F4FD', text: BRAND.blue, label: 'Scheduled' },
  in_progress: { bg: '#FFF4E5', text: BRAND.amber, label: 'In Progress' },
  completed: { bg: '#E8F5E8', text: BRAND.green, label: 'Completed' },
  cancelled: { bg: BRAND.greyLight, text: BRAND.coolGrey, label: 'Cancelled' },
}
const attendanceMap = {
  invited: { bg: BRAND.greyLight, text: BRAND.coolGrey, label: 'Invited' },
  present: { bg: '#E8F5E8', text: BRAND.green, label: 'Present' },
  apologies: { bg: '#FFF4E5', text: BRAND.amber, label: 'Apologies' },
  absent: { bg: '#FDECEC', text: BRAND.red, label: 'Absent' },
}
const meetingActionStatusMap = {
  open: { bg: '#FFF4E5', text: BRAND.amber, label: 'Open' },
  in_progress: { bg: '#E8F4FD', text: BRAND.blue, label: 'In Progress' },
  closed: { bg: '#E8F5E8', text: BRAND.green, label: 'Closed' },
  superseded: { bg: BRAND.greyLight, text: BRAND.coolGrey, label: 'Superseded' },
}

const mtgTh = { background: BRAND.purple, color: BRAND.white, padding: '8px 12px', textAlign: 'left', fontWeight: 400, whiteSpace: 'nowrap', fontSize: '12px' }
const mtgTd = (i) => ({ padding: '8px 12px', borderBottom: `1px solid ${BRAND.greyBorder}`, color: BRAND.coolGrey, fontSize: '12px', background: i % 2 === 0 ? BRAND.white : BRAND.greyLight })

function MeetingsTab({ meetings, projectId, employees, onReload }) {
  const [selectedMeeting, setSelectedMeeting] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)
  const [f, setF] = useState({ title: '', meeting_date: '', meeting_type: 'project', location: '', notes: '', client_sentiment: '', start_time: '', end_time: '', next_meeting_date: '' })

  // Detail data
  const [attendees, setAttendees] = useState([])
  const [lineItems, setLineItems] = useState([]) // merged agenda+action data
  const [decisions, setDecisions] = useState([])
  const [detailLoading, setDetailLoading] = useState(false)

  // Sub-forms
  const [showAttendeeForm, setShowAttendeeForm] = useState(false)
  const [showLineItemForm, setShowLineItemForm] = useState(false)
  const [showDecisionForm, setShowDecisionForm] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [templates, setTemplates] = useState([])
  const [showTemplateMenu, setShowTemplateMenu] = useState(false)
  const [af, setAf] = useState({ employee_id: '', external_name: '', external_organisation: '', external_role: '', attendance_status: 'invited' })
  const [lf, setLf] = useState({ title: '', description: '', owner_employee_id: '', owner_name: '', due_date: '', priority: 'normal', duration_minutes: '' })
  const [df, setDf] = useState({ description: '', agreed_by: '' })

  const empMap = Object.fromEntries((employees || []).map(e => [e.id, e]))

  // Load templates from app_settings
  useEffect(() => {
    supabase.from('app_settings').select('*').eq('sector_id', PCS_SECTOR_ID).like('setting_key', 'meeting_template_%')
      .then(({ data }) => {
        const parsed = (data || []).map(d => {
          try { return { id: d.id, key: d.setting_key, ...JSON.parse(d.setting_value) } }
          catch { return null }
        }).filter(Boolean)
        setTemplates(parsed)
      })
  }, [])

  async function applyTemplate(template) {
    if (!selectedMeeting) return
    setSaving(true)
    const startOrder = lineItems.length > 0 ? Math.max(...lineItems.map(a => a.item_order)) + 1 : 1
    for (let i = 0; i < template.items.length; i++) {
      await supabase.from('meeting_agenda_items').insert({
        meeting_id: selectedMeeting, sector_id: PCS_SECTOR_ID,
        item_order: startOrder + i, title: template.items[i],
      })
    }
    setSaving(false); setShowTemplateMenu(false); loadDetail(selectedMeeting)
  }

  async function loadDetail(meetingId) {
    setDetailLoading(true)
    const [attRes, agRes, actRes, decRes] = await Promise.all([
      supabase.from('meeting_attendees').select('*').eq('meeting_id', meetingId).order('created_at'),
      supabase.from('meeting_agenda_items').select('*').eq('meeting_id', meetingId).order('item_order'),
      supabase.from('meeting_actions').select('*').eq('meeting_id', meetingId).order('action_ref'),
      supabase.from('meeting_decisions').select('*').eq('meeting_id', meetingId).order('decision_ref'),
    ])
    // Merge: each agenda item is a line item, with its linked action (if any) joined
    const agendaItems = agRes.data || []
    const actionItems = actRes.data || []
    const merged = agendaItems.map(ag => {
      const linkedAction = actionItems.find(a => a.agenda_item_id === ag.id)
      return { ...ag, action: linkedAction || null }
    })
    setLineItems(merged)
    setAttendees(attRes.data || [])
    setDecisions(decRes.data || [])
    setDetailLoading(false)
  }

  function openMeeting(meetingId) {
    setSelectedMeeting(meetingId)
    setEditingItem(null)
    loadDetail(meetingId)
  }

  // ===== Meeting CRUD =====
  async function handleAdd() {
    if (!f.title.trim()) { setMsg({ type: 'error', text: 'Title is required.' }); return }
    if (!f.meeting_date) { setMsg({ type: 'error', text: 'Date is required.' }); return }
    setSaving(true); setMsg(null)
    const { error } = await supabase.from('meetings').insert({
      sector_id: PCS_SECTOR_ID, project_id: projectId,
      title: f.title.trim(), meeting_date: f.meeting_date, meeting_type: f.meeting_type,
      location: f.location.trim() || null, notes: f.notes.trim() || null,
      client_sentiment: f.client_sentiment || null, status: 'scheduled',
      start_time: f.start_time || null, end_time: f.end_time || null,
      next_meeting_date: f.next_meeting_date || null,
    })
    if (error) { setMsg({ type: 'error', text: error.message }) }
    else { setF({ title: '', meeting_date: '', meeting_type: 'project', location: '', notes: '', client_sentiment: '', start_time: '', end_time: '', next_meeting_date: '' }); setShowForm(false); onReload() }
    setSaving(false)
  }

  async function updateMeetingField(meetingId, field, value) {
    await supabase.from('meetings').update({ [field]: value }).eq('id', meetingId)
    onReload()
  }

  // ===== Attendees =====
  async function addAttendee() {
    if (!af.employee_id && !af.external_name.trim()) return
    setSaving(true)
    await supabase.from('meeting_attendees').insert({
      meeting_id: selectedMeeting, sector_id: PCS_SECTOR_ID,
      employee_id: af.employee_id || null,
      external_name: af.external_name.trim() || null,
      external_organisation: af.external_organisation.trim() || null,
      external_role: af.external_role.trim() || null,
      attendance_status: af.attendance_status,
    })
    setAf({ employee_id: '', external_name: '', external_organisation: '', external_role: '', attendance_status: 'invited' })
    setShowAttendeeForm(false); setSaving(false); loadDetail(selectedMeeting)
  }

  async function updateAttendance(id, status) {
    await supabase.from('meeting_attendees').update({ attendance_status: status }).eq('id', id)
    loadDetail(selectedMeeting)
  }

  async function deleteAttendee(id) {
    await auditDelete('meeting_attendees', id)
    loadDetail(selectedMeeting)
  }

  // ===== Unified Line Items (agenda + auto-linked action) =====
  function buildItemRef(mtg, order) {
    return `${mtg.meeting_number}-${String(order).padStart(2, '0')}`
  }

  async function addLineItem() {
    if (!lf.title.trim()) return
    setSaving(true)
    const mtg = meetings.find(m => m.id === selectedMeeting)
    const nextOrder = lineItems.length > 0 ? Math.max(...lineItems.map(a => a.item_order)) + 1 : 1

    // Create agenda item
    const { data: agData, error: agError } = await supabase.from('meeting_agenda_items').insert({
      meeting_id: selectedMeeting, sector_id: PCS_SECTOR_ID,
      item_order: nextOrder, title: lf.title.trim(),
      description: lf.description.trim() || null,
      duration_minutes: lf.duration_minutes ? parseInt(lf.duration_minutes) : null,
    }).select()

    // If owner or due date provided, create linked action
    if (!agError && agData?.[0] && (lf.owner_employee_id || lf.owner_name.trim() || lf.due_date)) {
      const ownerEmp = empMap[lf.owner_employee_id]
      await supabase.from('meeting_actions').insert({
        meeting_id: selectedMeeting, sector_id: PCS_SECTOR_ID,
        project_id: projectId,
        action_ref: '', // auto-generated by trigger
        description: lf.title.trim(),
        owner_employee_id: lf.owner_employee_id || null,
        owner_name: lf.owner_employee_id ? (ownerEmp?.name || '') : lf.owner_name.trim(),
        due_date: lf.due_date || null,
        priority: lf.priority,
        agenda_item_id: agData[0].id,
      })
    }

    setLf({ title: '', description: '', owner_employee_id: '', owner_name: '', due_date: '', priority: 'normal', duration_minutes: '' })
    setShowLineItemForm(false); setSaving(false); loadDetail(selectedMeeting)
  }

  async function updateLineItemNotes(agendaId, notes) {
    await supabase.from('meeting_agenda_items').update({ discussion_notes: notes, updated_at: new Date().toISOString() }).eq('id', agendaId)
  }

  async function saveItemEdits(item) {
    setSaving(true)
    const ef = editForm

    // Update agenda item
    await supabase.from('meeting_agenda_items').update({
      title: ef.title || item.title,
      description: ef.description ?? item.description,
      updated_at: new Date().toISOString(),
    }).eq('id', item.id)

    // Handle action: create, update, or leave alone
    const hasOwner = ef.owner_employee_id || ef.owner_name?.trim() || ef.due_date
    if (item.action && hasOwner) {
      // Update existing action
      const ownerEmp = empMap[ef.owner_employee_id]
      const updates = {
        description: ef.title || item.title,
        owner_employee_id: ef.owner_employee_id || null,
        owner_name: ef.owner_employee_id ? (ownerEmp?.name || '') : (ef.owner_name?.trim() || item.action.owner_name),
        due_date: ef.due_date || null,
        priority: ef.priority || item.action.priority,
      }
      if (ef.action_status) updates.status = ef.action_status
      if (ef.action_status === 'closed') updates.completed_date = new Date().toISOString().slice(0, 10)
      await supabase.from('meeting_actions').update(updates).eq('id', item.action.id)
    } else if (!item.action && hasOwner) {
      // Create new linked action
      const ownerEmp = empMap[ef.owner_employee_id]
      await supabase.from('meeting_actions').insert({
        meeting_id: selectedMeeting, sector_id: PCS_SECTOR_ID,
        project_id: projectId, action_ref: '',
        description: ef.title || item.title,
        owner_employee_id: ef.owner_employee_id || null,
        owner_name: ef.owner_employee_id ? (ownerEmp?.name || '') : (ef.owner_name?.trim() || ''),
        due_date: ef.due_date || null,
        priority: ef.priority || 'normal',
        agenda_item_id: item.id,
      })
    }

    setEditingItem(null); setEditForm({}); setSaving(false); loadDetail(selectedMeeting)
  }

  async function deleteLineItem(item) {
    if (item.action) await auditDelete('meeting_actions', item.action.id, item.action)
    await auditDelete('meeting_agenda_items', item.id, item)
    loadDetail(selectedMeeting)
  }

  function startEdit(item) {
    setEditingItem(item.id)
    setEditForm({
      title: item.title,
      description: item.description || '',
      owner_employee_id: item.action?.owner_employee_id || '',
      owner_name: item.action?.owner_name || '',
      due_date: item.action?.due_date || '',
      priority: item.action?.priority || 'normal',
      action_status: item.action?.status || 'open',
    })
  }

  // ===== Decisions =====
  async function addDecision() {
    if (!df.description.trim()) return
    setSaving(true)
    const nextRef = 'D-' + String(decisions.length + 1).padStart(2, '0')
    const mtg = meetings.find(m => m.id === selectedMeeting)
    await supabase.from('meeting_decisions').insert({
      meeting_id: selectedMeeting, sector_id: PCS_SECTOR_ID,
      decision_ref: nextRef, description: df.description.trim(),
      agreed_by: df.agreed_by.trim() || null,
      decision_date: mtg?.meeting_date || new Date().toISOString().slice(0, 10),
    })
    setDf({ description: '', agreed_by: '' })
    setShowDecisionForm(false); setSaving(false); loadDetail(selectedMeeting)
  }

  async function deleteDecision(id) {
    await auditDelete('meeting_decisions', id)
    loadDetail(selectedMeeting)
  }

  function downloadMeetingMinutes(mtg) {
    const lines = []
    lines.push('MEETING MINUTES')
    lines.push('=' .repeat(60))
    lines.push(`Title: ${mtg.title}`)
    lines.push(`Date: ${formatDate(mtg.meeting_date)}`)
    lines.push(`Time: ${mtg.start_time || ''} - ${mtg.end_time || ''}`)
    lines.push(`Location: ${mtg.location || '—'}`)
    lines.push(`Type: ${(mtg.meeting_type || '').replace(/_/g, ' ')}`)
    lines.push(`Status: ${mtg.status}`)
    lines.push(`Minutes Status: ${(mtg.minutes_status || '').replace(/_/g, ' ')}`)
    lines.push(`Client Sentiment: ${(mtg.client_sentiment || '—').replace(/_/g, ' ')}`)
    lines.push('')

    if (attendees.length > 0) {
      lines.push('ATTENDEES')
      lines.push('-'.repeat(40))
      attendees.forEach(a => lines.push(`  ${a.external_name || '—'} (${a.external_organisation || '—'}) — ${a.attended ? 'Present' : 'Absent'}`))
      lines.push('')
    }

    if (lineItems.length > 0) {
      lines.push('AGENDA / MINUTES')
      lines.push('-'.repeat(40))
      lineItems.forEach((item, idx) => {
        lines.push(`${idx + 1}. ${item.title || 'Untitled'}`)
        if (item.notes) lines.push(`   Notes: ${item.notes}`)
        if (item.action) {
          lines.push(`   ACTION: ${item.action.description || '—'}`)
          lines.push(`   Owner: ${item.action.owner_name || '—'} | Due: ${item.action.due_date ? formatDate(item.action.due_date) : '—'} | Status: ${item.action.status || '—'}`)
        }
        lines.push('')
      })
    }

    if (decisions.length > 0) {
      lines.push('DECISIONS')
      lines.push('-'.repeat(40))
      decisions.forEach(d => {
        lines.push(`  ${d.decision_ref || ''}: ${d.description || ''}`)
        if (d.made_by) lines.push(`    Made by: ${d.made_by}`)
      })
      lines.push('')
    }

    if (mtg.notes) {
      lines.push('NOTES')
      lines.push('-'.repeat(40))
      lines.push(mtg.notes)
    }

    lines.push('')
    lines.push(`Generated: ${new Date().toLocaleString()}`)

    const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Minutes_${(mtg.title || 'meeting').replace(/\s+/g, '_')}_${mtg.meeting_date || 'undated'}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  // =====================================================================
  // MEETING DETAIL VIEW
  // =====================================================================
  if (selectedMeeting) {
    const mtg = meetings.find(m => m.id === selectedMeeting)
    if (!mtg) { setSelectedMeeting(null); return null }
    const present = attendees.filter(a => a.attendance_status === 'present').length
    const openActions = lineItems.filter(li => li.action && li.action.status !== 'closed' && li.action.status !== 'superseded').length
    const totalActions = lineItems.filter(li => li.action).length

    return (
      <div>
        <button onClick={() => { setSelectedMeeting(null); setEditingItem(null) }} style={{ background: 'none', border: 'none', color: BRAND.purple, cursor: 'pointer', fontFamily: BRAND.font, fontSize: '13px', padding: 0, marginBottom: '16px' }}>Back to meetings</button>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ fontSize: '18px', color: BRAND.purple }}>{mtg.meeting_number} — {mtg.title}</div>
            <div style={{ fontSize: '13px', color: BRAND.coolGrey, marginTop: '4px', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              <span>{formatDate(mtg.meeting_date)}</span>
              {mtg.start_time && <span>{mtg.start_time?.slice(0,5)}{mtg.end_time ? ` - ${mtg.end_time.slice(0,5)}` : ''}</span>}
              <span style={{ textTransform: 'capitalize' }}>{(mtg.meeting_type || '').replace(/_/g, ' ')}</span>
              {mtg.location && <span>{mtg.location}</span>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            {mtg.client_sentiment && <StatusBadge status={mtg.client_sentiment} map={sentimentMap} />}
            <select value={mtg.status} onChange={e => updateMeetingField(mtg.id, 'status', e.target.value)} style={{ padding: '4px 8px', border: `1px solid ${BRAND.greyBorder}`, fontFamily: BRAND.font, fontSize: '12px', color: BRAND.coolGrey, background: BRAND.white }}>
              <option value="scheduled">Scheduled</option><option value="in_progress">In Progress</option>
              <option value="completed">Completed</option><option value="cancelled">Cancelled</option>
            </select>
            <select value={mtg.minutes_status} onChange={e => updateMeetingField(mtg.id, 'minutes_status', e.target.value)} style={{ padding: '4px 8px', border: `1px solid ${BRAND.greyBorder}`, fontFamily: BRAND.font, fontSize: '12px', color: BRAND.coolGrey, background: BRAND.white }}>
              <option value="not_started">Minutes: Not Started</option><option value="draft">Minutes: Draft</option>
              <option value="issued">Minutes: Issued</option><option value="accepted">Minutes: Accepted</option>
            </select>
          </div>
        </div>

        {/* Mode banner — clear visual distinction */}
        {(() => {
          const isAgendaMode = mtg.status === 'scheduled'
          const bannerBg = isAgendaMode ? '#E8F4FD' : '#E8F5E8'
          const bannerColor = isAgendaMode ? BRAND.blue : BRAND.green
          const bannerText = isAgendaMode
            ? 'AGENDA MODE — Build your agenda before the meeting. Add attendees, line items, and load templates.'
            : 'MINUTES MODE — Record discussion notes, assign actions, and log decisions.'
          return (
            <div style={{ padding: '12px 20px', background: bannerBg, borderLeft: `4px solid ${bannerColor}`, marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <span style={{ fontSize: '13px', color: bannerColor, fontFamily: BRAND.font, fontWeight: 600 }}>{bannerText}</span>
              <div style={{ display: 'flex', gap: '8px' }}>
                {isAgendaMode && (
                  <button onClick={() => updateMeetingField(mtg.id, 'status', 'in_progress')} style={{ padding: '6px 16px', background: bannerColor, color: BRAND.white, border: 'none', cursor: 'pointer', fontFamily: BRAND.font, fontSize: '12px' }}>Start Meeting</button>
                )}
                {!isAgendaMode && (
                  <button onClick={() => downloadMeetingMinutes(mtg)} style={{ padding: '6px 16px', background: BRAND.purple, color: BRAND.white, border: 'none', cursor: 'pointer', fontFamily: BRAND.font, fontSize: '12px' }}>Download Minutes</button>
                )}
              </div>
            </div>
          )
        })()}

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px', marginBottom: '20px' }}>
          <KPICard label="Attendees" value={attendees.length} subValue={`${present} present`} />
          <KPICard label="Line Items" value={lineItems.length} />
          <KPICard label="Actions" value={totalActions} color={openActions > 0 ? BRAND.amber : BRAND.green} subValue={`${openActions} open`} />
          <KPICard label="Decisions" value={decisions.length} />
        </div>

        {detailLoading ? <LoadingState message="Loading meeting detail..." /> : (
          <div>
            {/* ---- ATTENDEES ---- */}
            <div style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '14px', color: BRAND.purple }}>Attendees</span>
                <button onClick={() => setShowAttendeeForm(!showAttendeeForm)} style={{ padding: '4px 14px', background: BRAND.purple, color: BRAND.white, border: 'none', cursor: 'pointer', fontFamily: BRAND.font, fontSize: '12px' }}>{showAttendeeForm ? 'Cancel' : 'Add Attendee'}</button>
              </div>
              {showAttendeeForm && (
                <FormWrapper>
                  <FormGrid cols={3}>
                    <FormField label="Internal Employee">
                      <select value={af.employee_id} onChange={e => setAf({ ...af, employee_id: e.target.value })} style={formInputStyle}>
                        <option value="">-- External --</option>
                        {(employees || []).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                      </select>
                    </FormField>
                    {!af.employee_id && <FormField label="External Name"><input value={af.external_name} onChange={e => setAf({ ...af, external_name: e.target.value })} style={formInputStyle} placeholder="Full name" /></FormField>}
                    {!af.employee_id && <FormField label="Organization"><input value={af.external_organisation} onChange={e => setAf({ ...af, external_organisation: e.target.value })} style={formInputStyle} placeholder="Company" /></FormField>}
                    {!af.employee_id && <FormField label="Role"><input value={af.external_role} onChange={e => setAf({ ...af, external_role: e.target.value })} style={formInputStyle} placeholder="Title / role" /></FormField>}
                    <FormField label="Attendance">
                      <select value={af.attendance_status} onChange={e => setAf({ ...af, attendance_status: e.target.value })} style={formInputStyle}>
                        <option value="invited">Invited</option><option value="present">Present</option>
                        <option value="apologies">Apologies</option><option value="absent">Absent</option>
                      </select>
                    </FormField>
                  </FormGrid>
                  <FormButtons onCancel={() => setShowAttendeeForm(false)} onSave={addAttendee} saving={saving} label="Add" />
                </FormWrapper>
              )}
              <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>
                    <th style={mtgTh}>Name</th><th style={mtgTh}>Organization</th><th style={mtgTh}>Role</th><th style={mtgTh}>Attendance</th><th style={{ ...mtgTh, width: '60px' }}></th>
                  </tr></thead>
                  <tbody>
                    {attendees.length === 0 ? (
                      <tr><td colSpan={5} style={{ padding: '20px', color: BRAND.coolGrey, fontSize: '13px' }}>No attendees added.</td></tr>
                    ) : attendees.map((a, i) => {
                      const emp = empMap[a.employee_id]
                      return (
                        <tr key={a.id} style={{ background: i % 2 === 0 ? BRAND.white : BRAND.greyLight }}>
                          <td style={mtgTd(i)}>{emp ? <EmployeeLink id={emp.id}>{emp.name}</EmployeeLink> : (a.external_name || '—')}</td>
                          <td style={mtgTd(i)}>{emp ? 'Currie & Brown' : (a.external_organisation || '—')}</td>
                          <td style={mtgTd(i)}>{emp ? emp.role : (a.external_role || '—')}</td>
                          <td style={mtgTd(i)}>
                            <select value={a.attendance_status} onChange={e => updateAttendance(a.id, e.target.value)} style={{ padding: '2px 6px', border: `1px solid ${BRAND.greyBorder}`, fontFamily: BRAND.font, fontSize: '11px', color: BRAND.coolGrey, background: BRAND.white }}>
                              <option value="invited">Invited</option><option value="present">Present</option>
                              <option value="apologies">Apologies</option><option value="absent">Absent</option>
                            </select>
                          </td>
                          <td style={mtgTd(i)}><button onClick={() => deleteAttendee(a.id)} style={{ background: 'none', border: 'none', color: BRAND.red, cursor: 'pointer', fontFamily: BRAND.font, fontSize: '11px' }}>Remove</button></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ---- AGENDA / MINUTES (auto-switches based on meeting status) ---- */}
            <div style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <div>
                  <span style={{ fontSize: '16px', color: BRAND.purple, fontWeight: 600 }}>
                    {mtg.status === 'scheduled' ? 'Agenda' : 'Minutes'}
                  </span>
                  <span style={{ fontSize: '12px', color: BRAND.coolGrey, marginLeft: '12px' }}>
                    {mtg.status === 'scheduled' ? 'Add items to build the meeting agenda' : 'Record notes, actions, and owners against each item'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', position: 'relative' }}>
                  {templates.length > 0 && (
                    <div style={{ position: 'relative' }}>
                      <button onClick={() => setShowTemplateMenu(!showTemplateMenu)} style={{ padding: '4px 14px', background: BRAND.white, color: BRAND.purple, border: `1px solid ${BRAND.greyBorder}`, cursor: 'pointer', fontFamily: BRAND.font, fontSize: '12px' }}>Load Template</button>
                      {showTemplateMenu && (
                        <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: '4px', background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, zIndex: 10, minWidth: '220px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                          {templates.map(t => (
                            <button key={t.id} onClick={() => applyTemplate(t)} style={{ display: 'block', width: '100%', padding: '10px 16px', background: 'none', border: 'none', borderBottom: `1px solid ${BRAND.greyBorder}`, cursor: 'pointer', fontFamily: BRAND.font, fontSize: '12px', color: BRAND.coolGrey, textAlign: 'left' }}
                              onMouseEnter={e => e.currentTarget.style.background = BRAND.greyLight}
                              onMouseLeave={e => e.currentTarget.style.background = BRAND.white}
                            >
                              <div style={{ color: BRAND.purple, marginBottom: '2px' }}>{t.name}</div>
                              <div style={{ fontSize: '11px' }}>{t.items.length} item{t.items.length !== 1 ? 's' : ''}</div>
                            </button>
                          ))}
                          <button onClick={() => setShowTemplateMenu(false)} style={{ display: 'block', width: '100%', padding: '8px 16px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: BRAND.font, fontSize: '11px', color: BRAND.coolGrey, textAlign: 'center' }}>Cancel</button>
                        </div>
                      )}
                    </div>
                  )}
                  <button onClick={() => setShowLineItemForm(!showLineItemForm)} style={{ padding: '4px 14px', background: BRAND.purple, color: BRAND.white, border: 'none', cursor: 'pointer', fontFamily: BRAND.font, fontSize: '12px' }}>{showLineItemForm ? 'Cancel' : 'Add Line Item'}</button>
                </div>
              </div>
              {showLineItemForm && (
                <FormWrapper>
                  <FormGrid cols={3}>
                    <FormField label="Item / Description" span><input value={lf.title} onChange={e => setLf({ ...lf, title: e.target.value })} style={formInputStyle} placeholder="Agenda item or discussion point" /></FormField>
                    <FormField label="Detail / Notes" span><textarea value={lf.description} onChange={e => setLf({ ...lf, description: e.target.value })} rows={2} style={{ ...formInputStyle, resize: 'vertical' }} placeholder="Additional context" /></FormField>
                    <FormField label="Owner (if action required)">
                      <select value={lf.owner_employee_id} onChange={e => setLf({ ...lf, owner_employee_id: e.target.value })} style={formInputStyle}>
                        <option value="">No action / external</option>
                        {(employees || []).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                      </select>
                    </FormField>
                    {!lf.owner_employee_id && <FormField label="External Owner"><input value={lf.owner_name} onChange={e => setLf({ ...lf, owner_name: e.target.value })} style={formInputStyle} placeholder="Full name (if external)" /></FormField>}
                    <FormField label="Due Date"><input type="date" value={lf.due_date} onChange={e => setLf({ ...lf, due_date: e.target.value })} style={formInputStyle} /></FormField>
                    <FormField label="Priority">
                      <select value={lf.priority} onChange={e => setLf({ ...lf, priority: e.target.value })} style={formInputStyle}>
                        <option value="critical">Critical</option><option value="high">High</option>
                        <option value="normal">Normal</option><option value="low">Low</option>
                      </select>
                    </FormField>
                    <FormField label="Duration (min)"><input type="number" value={lf.duration_minutes} onChange={e => setLf({ ...lf, duration_minutes: e.target.value })} style={formInputStyle} placeholder="15" /></FormField>
                  </FormGrid>
                  <FormButtons onCancel={() => setShowLineItemForm(false)} onSave={addLineItem} saving={saving} label="Add Item" />
                </FormWrapper>
              )}

              {lineItems.length === 0 ? (
                <div style={{ padding: '20px', background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, color: BRAND.coolGrey, fontSize: '13px' }}>No line items. Add agenda items or load a template to get started.</div>
              ) : (
                <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, overflow: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr>
                      <th style={{ ...mtgTh, width: '100px' }}>Ref</th>
                      <th style={mtgTh}>Description</th>
                      <th style={mtgTh}>Owner</th>
                      <th style={mtgTh}>Due</th>
                      <th style={mtgTh}>Priority</th>
                      <th style={mtgTh}>Status</th>
                      <th style={{ ...mtgTh, width: '90px' }}></th>
                    </tr></thead>
                    <tbody>
                      {lineItems.map((item, i) => {
                        const ref = buildItemRef(mtg, item.item_order)
                        const act = item.action
                        const owner = act ? (empMap[act.owner_employee_id] || null) : null
                        const overdue = act?.due_date && act.status !== 'closed' && act.due_date < new Date().toISOString().slice(0, 10)
                        const isEditing = editingItem === item.id

                        return (
                          <React.Fragment key={item.id}>
                            <tr style={{ background: i % 2 === 0 ? BRAND.white : BRAND.greyLight }}>
                              <td style={{ ...mtgTd(i), fontWeight: 600, color: BRAND.purple, whiteSpace: 'nowrap' }}>{ref}</td>
                              <td style={{ ...mtgTd(i), maxWidth: '300px' }}>
                                <div style={{ fontSize: '12px', fontWeight: 600, color: BRAND.coolGrey }}>{item.title}</div>
                                {item.description && <div style={{ fontSize: '11px', color: BRAND.coolGrey, marginTop: '2px' }}>{item.description}</div>}
                              </td>
                              <td style={{ ...mtgTd(i), whiteSpace: 'nowrap' }}>
                                {act ? (owner ? <EmployeeLink id={owner.id}>{owner.name}</EmployeeLink> : (act.owner_name || '—')) : <span style={{ color: '#bbb', fontSize: '11px' }}>—</span>}
                              </td>
                              <td style={{ ...mtgTd(i), whiteSpace: 'nowrap', color: overdue ? BRAND.red : BRAND.coolGrey }}>
                                {act?.due_date ? formatDate(act.due_date) : '—'}
                              </td>
                              <td style={mtgTd(i)}>
                                {act ? <StatusBadge status={act.priority} map={actionPriorityMap} /> : '—'}
                              </td>
                              <td style={mtgTd(i)}>
                                {act ? <StatusBadge status={act.status} map={meetingActionStatusMap} /> : <span style={{ color: '#bbb', fontSize: '11px' }}>Info only</span>}
                              </td>
                              <td style={mtgTd(i)}>
                                <div style={{ display: 'flex', gap: '6px' }}>
                                  <button onClick={() => isEditing ? setEditingItem(null) : startEdit(item)} style={{ background: 'none', border: 'none', color: BRAND.purple, cursor: 'pointer', fontFamily: BRAND.font, fontSize: '11px' }}>{isEditing ? 'Close' : 'Edit'}</button>
                                  <button onClick={() => deleteLineItem(item)} style={{ background: 'none', border: 'none', color: BRAND.red, cursor: 'pointer', fontFamily: BRAND.font, fontSize: '11px' }}>Remove</button>
                                </div>
                              </td>
                            </tr>
                            {/* Inline discussion notes */}
                            <tr style={{ background: i % 2 === 0 ? BRAND.white : BRAND.greyLight }}>
                              <td style={{ padding: '0 12px 8px', border: 'none' }}></td>
                              <td colSpan={6} style={{ padding: '0 12px 8px', border: 'none', background: i % 2 === 0 ? BRAND.white : BRAND.greyLight }}>
                                <textarea defaultValue={item.discussion_notes || ''} onBlur={e => updateLineItemNotes(item.id, e.target.value)} rows={1} style={{ width: '100%', padding: '4px 8px', border: `1px solid ${BRAND.greyBorder}`, fontFamily: BRAND.font, fontSize: '11px', color: BRAND.coolGrey, background: BRAND.purpleLight, boxSizing: 'border-box', resize: 'vertical' }} placeholder={mtg.status === 'scheduled' ? 'Planned discussion points...' : 'Discussion notes...'} />
                              </td>
                            </tr>
                            {/* Expanded edit form */}
                            {isEditing && (
                              <tr><td colSpan={7} style={{ padding: 0 }}>
                                <div style={{ padding: '16px 20px', background: BRAND.purpleLight, borderTop: `1px solid ${BRAND.greyBorder}`, borderBottom: `1px solid ${BRAND.greyBorder}` }}>
                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                                    <div style={{ gridColumn: '1 / -1' }}><label style={{ display: 'block', fontSize: '11px', color: BRAND.coolGrey, marginBottom: '2px' }}>Title</label><input value={editForm.title || ''} onChange={e => setEditForm({ ...editForm, title: e.target.value })} style={formInputStyle} /></div>
                                    <div style={{ gridColumn: '1 / -1' }}><label style={{ display: 'block', fontSize: '11px', color: BRAND.coolGrey, marginBottom: '2px' }}>Detail</label><textarea value={editForm.description || ''} onChange={e => setEditForm({ ...editForm, description: e.target.value })} rows={2} style={{ ...formInputStyle, resize: 'vertical' }} /></div>
                                    <div>
                                      <label style={{ display: 'block', fontSize: '11px', color: BRAND.coolGrey, marginBottom: '2px' }}>Owner</label>
                                      <select value={editForm.owner_employee_id || ''} onChange={e => setEditForm({ ...editForm, owner_employee_id: e.target.value })} style={formInputStyle}>
                                        <option value="">No action / external</option>
                                        {(employees || []).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                                      </select>
                                    </div>
                                    {!editForm.owner_employee_id && <div><label style={{ display: 'block', fontSize: '11px', color: BRAND.coolGrey, marginBottom: '2px' }}>External Owner</label><input value={editForm.owner_name || ''} onChange={e => setEditForm({ ...editForm, owner_name: e.target.value })} style={formInputStyle} /></div>}
                                    <div><label style={{ display: 'block', fontSize: '11px', color: BRAND.coolGrey, marginBottom: '2px' }}>Due Date</label><input type="date" value={editForm.due_date || ''} onChange={e => setEditForm({ ...editForm, due_date: e.target.value })} style={formInputStyle} /></div>
                                    <div><label style={{ display: 'block', fontSize: '11px', color: BRAND.coolGrey, marginBottom: '2px' }}>Priority</label>
                                      <select value={editForm.priority || 'normal'} onChange={e => setEditForm({ ...editForm, priority: e.target.value })} style={formInputStyle}>
                                        <option value="critical">Critical</option><option value="high">High</option>
                                        <option value="normal">Normal</option><option value="low">Low</option>
                                      </select>
                                    </div>
                                    {item.action && <div><label style={{ display: 'block', fontSize: '11px', color: BRAND.coolGrey, marginBottom: '2px' }}>Action Status</label>
                                      <select value={editForm.action_status || 'open'} onChange={e => setEditForm({ ...editForm, action_status: e.target.value })} style={formInputStyle}>
                                        <option value="open">Open</option><option value="in_progress">In Progress</option>
                                        <option value="closed">Closed</option><option value="superseded">Superseded</option>
                                      </select>
                                    </div>}
                                  </div>
                                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                    <button onClick={() => { setEditingItem(null); setEditForm({}) }} style={{ padding: '6px 16px', background: BRAND.white, color: BRAND.coolGrey, border: `1px solid ${BRAND.greyBorder}`, cursor: 'pointer', fontFamily: BRAND.font, fontSize: '12px' }}>Cancel</button>
                                    <button disabled={saving} onClick={() => saveItemEdits(item)} style={{ padding: '6px 16px', background: BRAND.purple, color: BRAND.white, border: 'none', cursor: 'pointer', fontFamily: BRAND.font, fontSize: '12px' }}>{saving ? 'Saving...' : 'Save'}</button>
                                  </div>
                                </div>
                              </td></tr>
                            )}
                          </React.Fragment>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* ---- DECISIONS ---- */}
            <div style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '14px', color: BRAND.purple }}>Decisions</span>
                <button onClick={() => setShowDecisionForm(!showDecisionForm)} style={{ padding: '4px 14px', background: BRAND.purple, color: BRAND.white, border: 'none', cursor: 'pointer', fontFamily: BRAND.font, fontSize: '12px' }}>{showDecisionForm ? 'Cancel' : 'Add Decision'}</button>
              </div>
              {showDecisionForm && (
                <FormWrapper>
                  <FormGrid>
                    <FormField label="Decision" span><textarea value={df.description} onChange={e => setDf({ ...df, description: e.target.value })} rows={2} style={{ ...formInputStyle, resize: 'vertical' }} placeholder="What was decided" /></FormField>
                    <FormField label="Agreed By"><input value={df.agreed_by} onChange={e => setDf({ ...df, agreed_by: e.target.value })} style={formInputStyle} placeholder="Names or roles" /></FormField>
                  </FormGrid>
                  <FormButtons onCancel={() => setShowDecisionForm(false)} onSave={addDecision} saving={saving} label="Add Decision" />
                </FormWrapper>
              )}
              <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>
                    <th style={{ ...mtgTh, width: '60px' }}>Ref</th><th style={mtgTh}>Decision</th><th style={mtgTh}>Agreed By</th><th style={{ ...mtgTh, width: '60px' }}></th>
                  </tr></thead>
                  <tbody>
                    {decisions.length === 0 ? (
                      <tr><td colSpan={4} style={{ padding: '20px', color: BRAND.coolGrey, fontSize: '13px' }}>No decisions recorded.</td></tr>
                    ) : decisions.map((d, i) => (
                      <tr key={d.id} style={{ background: i % 2 === 0 ? BRAND.white : BRAND.greyLight }}>
                        <td style={{ ...mtgTd(i), fontWeight: 600, color: BRAND.purple }}>{d.decision_ref}</td>
                        <td style={mtgTd(i)}>{d.description}</td>
                        <td style={mtgTd(i)}>{d.agreed_by || '—'}</td>
                        <td style={mtgTd(i)}><button onClick={() => deleteDecision(d.id)} style={{ background: 'none', border: 'none', color: BRAND.red, cursor: 'pointer', fontFamily: BRAND.font, fontSize: '11px' }}>Remove</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* General notes + next meeting */}
            {mtg.notes && (
              <div style={{ marginBottom: '16px' }}>
                <span style={{ fontSize: '14px', color: BRAND.purple, display: 'block', marginBottom: '8px' }}>General Notes</span>
                <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, padding: '16px', fontSize: '13px', color: BRAND.coolGrey, lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>{mtg.notes}</div>
              </div>
            )}
            {mtg.next_meeting_date && (
              <div style={{ fontSize: '13px', color: BRAND.coolGrey }}>Next meeting: {formatDate(mtg.next_meeting_date)}</div>
            )}
          </div>
        )}
      </div>
    )
  }

  // =====================================================================
  // MEETINGS LIST VIEW
  // =====================================================================
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <span style={{ fontSize: '15px', color: BRAND.purple }}>{meetings.length} meeting{meetings.length !== 1 ? 's' : ''}</span>
        {!showForm && <AddButton label="Schedule Meeting" onClick={() => setShowForm(true)} />}
      </div>

      {showForm && (
        <FormWrapper>
          <span style={{ fontSize: '14px', color: BRAND.purple, display: 'block', marginBottom: '4px' }}>Schedule Meeting</span>
          <span style={{ fontSize: '12px', color: BRAND.coolGrey, display: 'block', marginBottom: '16px' }}>Create a meeting, then build the agenda from the detail view. You can also load a template.</span>
          <FormMessage msg={msg} />
          <FormGrid cols={3}>
            <FormField label="Title" span><input value={f.title} onChange={e => setF({ ...f, title: e.target.value })} style={formInputStyle} placeholder="Meeting title" /></FormField>
            <FormField label="Date"><input type="date" value={f.meeting_date} onChange={e => setF({ ...f, meeting_date: e.target.value })} style={formInputStyle} /></FormField>
            <FormField label="Start Time"><input type="time" value={f.start_time} onChange={e => setF({ ...f, start_time: e.target.value })} style={formInputStyle} /></FormField>
            <FormField label="End Time"><input type="time" value={f.end_time} onChange={e => setF({ ...f, end_time: e.target.value })} style={formInputStyle} /></FormField>
            <FormField label="Type">
              <select value={f.meeting_type} onChange={e => setF({ ...f, meeting_type: e.target.value })} style={formInputStyle}>
                <option value="project">Project</option><option value="client">Client</option><option value="internal">Internal</option>
                <option value="governance">Governance</option><option value="kickoff">Kick Off</option><option value="standard">Standard</option>
                <option value="review">Review</option><option value="escalation">Escalation</option><option value="ad_hoc">Ad Hoc</option>
                <option value="introduction">Introduction</option><option value="proposal">Proposal</option><option value="pitch">Pitch</option>
                <option value="negotiation">Negotiation</option><option value="site_visit">Site Visit</option><option value="other">Other</option>
              </select>
            </FormField>
            <FormField label="Location"><input value={f.location} onChange={e => setF({ ...f, location: e.target.value })} style={formInputStyle} placeholder="e.g. TSMC Phoenix Office" /></FormField>
            <FormField label="Client Sentiment">
              <select value={f.client_sentiment} onChange={e => setF({ ...f, client_sentiment: e.target.value })} style={formInputStyle}>
                <option value="">Not recorded</option><option value="very_satisfied">Very Satisfied</option><option value="satisfied">Satisfied</option>
                <option value="neutral">Neutral</option><option value="concerned">Concerned</option><option value="dissatisfied">Dissatisfied</option>
              </select>
            </FormField>
            <FormField label="Next Meeting"><input type="date" value={f.next_meeting_date} onChange={e => setF({ ...f, next_meeting_date: e.target.value })} style={formInputStyle} /></FormField>
            <FormField label="Notes" span><textarea value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} rows={3} style={{ ...formInputStyle, resize: 'vertical' }} placeholder="Meeting notes..." /></FormField>
          </FormGrid>
          <FormButtons onCancel={() => { setShowForm(false); setMsg(null) }} onSave={handleAdd} saving={saving} label="Schedule Meeting" />
        </FormWrapper>
      )}

      {meetings.length === 0 ? (
        <div style={{ padding: '24px', background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, color: BRAND.coolGrey, fontSize: '14px' }}>No meetings recorded for this project.</div>
      ) : (
        <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead><tr>
              {['Ref', 'Date', 'Title', 'Type', 'Status', 'Minutes', 'Sentiment', ''].map(h => (
                <th key={h} style={{ background: BRAND.purple, color: BRAND.white, padding: '10px 14px', textAlign: 'left', fontWeight: 400, whiteSpace: 'nowrap', fontSize: '13px' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {meetings.map((m, i) => (
                <tr key={m.id} style={{ background: i % 2 === 0 ? BRAND.white : BRAND.greyLight, cursor: 'pointer' }} onClick={() => openMeeting(m.id)}>
                  <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, color: BRAND.purple, fontWeight: 600 }}>{m.meeting_number}</td>
                  <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, color: BRAND.coolGrey, whiteSpace: 'nowrap' }}>{formatDate(m.meeting_date)}</td>
                  <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, color: BRAND.purple, textDecoration: 'underline', textDecorationColor: 'rgba(74,21,75,0.3)' }}>{m.title}</td>
                  <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, color: BRAND.coolGrey, textTransform: 'capitalize' }}>{(m.meeting_type || '').replace(/_/g, ' ')}</td>
                  <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}` }}><StatusBadge status={m.status} map={meetingStatusMap} /></td>
                  <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}` }}><StatusBadge status={m.minutes_status} map={minutesStatusMap} /></td>
                  <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}` }}>{m.client_sentiment ? <StatusBadge status={m.client_sentiment} map={sentimentMap} /> : '—'}</td>
                  <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, color: m.status === 'scheduled' ? BRAND.blue : BRAND.purple, fontSize: '12px', fontWeight: 600 }}>{m.status === 'scheduled' ? 'Build Agenda' : 'View Minutes'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
  const [expandedId, setExpandedId] = useState(null)

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
      description: f.description.trim() || null, verified: false,
    })
    if (error) { setMsg({ type: 'error', text: error.message }) }
    else { setF({ saving_date: new Date().toISOString().slice(0, 10), title: '', saving_type: 'tangible', category: 'cost_avoidance', amount: '', calculation_basis: '', beneficiary: '', description: '' }); setShowForm(false); onReload() }
    setSaving(false)
  }

  async function handleVerifyTransition(savingId, currentVerified) {
    // verified = true means approved/locked; false means draft
    // Toggling to verified locks the record
    const updates = { verified: !currentVerified }
    if (!currentVerified) {
      updates.verified_date = new Date().toISOString().slice(0, 10)
    } else {
      updates.verified_date = null
    }
    await supabase.from('project_savings').update(updates).eq('id', savingId)
    onReload()
  }

  const savingsBadge = (verified) => ({
    bg: verified ? '#E8F5E8' : BRAND.greyLight,
    text: verified ? BRAND.green : BRAND.coolGrey,
    label: verified ? 'Verified (Locked)' : 'Pending Verification',
  })

  function renderSavingsTable(data, showAmount = true) {
    if (data.length === 0) return <div style={{ padding: '20px', background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, color: BRAND.coolGrey, fontSize: '13px' }}>No records.</div>
    return data.map((s, idx) => {
      const locked = s.verified
      const expanded = expandedId === s.id
      return (
        <div key={s.id} style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, marginBottom: '4px' }}>
          <button onClick={() => setExpandedId(expanded ? null : s.id)} style={{ width: '100%', padding: '10px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', fontFamily: BRAND.font, textAlign: 'left' }}>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
              {locked && <span style={{ fontSize: '12px', color: BRAND.coolGrey }}>LOCKED</span>}
              <span style={{ color: BRAND.coolGrey, fontSize: '12px' }}>{formatDate(s.saving_date)}</span>
              <span style={{ color: BRAND.purple, fontSize: '13px' }}>{s.title}</span>
              {showAmount && s.amount && <span style={{ color: BRAND.green, fontSize: '13px' }}>{formatCurrency(s.amount)}</span>}
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ padding: '2px 10px', fontSize: '11px', background: savingsBadge(s.verified).bg, color: savingsBadge(s.verified).text, fontFamily: BRAND.font }}>{savingsBadge(s.verified).label}</span>
              <span style={{ color: BRAND.coolGrey, fontSize: '12px' }}>{expanded ? 'Collapse' : 'Expand'}</span>
            </div>
          </button>
          {expanded && (
            <div style={{ padding: '0 20px 16px', borderTop: `1px solid ${BRAND.greyBorder}` }}>
              {/* Approval banner */}
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 16px', marginBottom: '12px', marginTop: '8px',
                background: savingsBadge(s.verified).bg,
                borderLeft: `4px solid ${savingsBadge(s.verified).text}`,
              }}>
                <span style={{ fontSize: '13px', color: savingsBadge(s.verified).text, fontWeight: 600, fontFamily: BRAND.font }}>{savingsBadge(s.verified).label}</span>
                <button onClick={() => handleVerifyTransition(s.id, s.verified)} style={{
                  padding: '6px 16px', background: s.verified ? BRAND.amber : BRAND.green, color: BRAND.white,
                  border: 'none', cursor: 'pointer', fontFamily: BRAND.font, fontSize: '12px',
                }}>
                  {s.verified ? 'Unlock for Changes' : 'Verify and Lock'}
                </button>
              </div>
              {locked && (
                <div style={{ padding: '6px 16px', background: BRAND.greyLight, fontSize: '12px', color: BRAND.coolGrey, fontFamily: BRAND.font, marginBottom: '12px' }}>
                  This saving is verified and locked. Click "Unlock for Changes" to edit.
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', fontSize: '12px', color: BRAND.coolGrey }}>
                <div><span style={{ display: 'block', fontSize: '11px' }}>Category</span><span style={{ textTransform: 'capitalize' }}>{(s.category || '').replace(/_/g, ' ')}</span></div>
                {showAmount && <div><span style={{ display: 'block', fontSize: '11px' }}>Amount</span>{s.amount ? formatCurrency(s.amount) : '—'}</div>}
                {s.calculation_basis && <div><span style={{ display: 'block', fontSize: '11px' }}>Calculation Basis</span>{s.calculation_basis}</div>}
                {s.beneficiary && <div><span style={{ display: 'block', fontSize: '11px' }}>Beneficiary</span>{s.beneficiary}</div>}
                {s.description && <div style={{ gridColumn: '1 / -1' }}><span style={{ display: 'block', fontSize: '11px' }}>Description</span>{s.description}</div>}
                {s.verified_date && <div><span style={{ display: 'block', fontSize: '11px' }}>Verified Date</span>{formatDate(s.verified_date)}</div>}
              </div>
            </div>
          )}
        </div>
      )
    })
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
            <FormField label="Category"><select value={f.category} onChange={e => setF({ ...f, category: e.target.value })} style={formInputStyle}><option value="cost_avoidance">Cost Avoidance</option><option value="compliance">Compliance</option><option value="efficiency">Efficiency</option><option value="risk_reduction">Risk Reduction</option><option value="quality">Quality</option><option value="relationship">Relationship</option><option value="knowledge">Knowledge</option><option value="other">Other</option></select></FormField>
            {f.saving_type === 'tangible' && <FormField label="Amount ($)"><input type="number" value={f.amount} onChange={e => setF({ ...f, amount: e.target.value })} style={formInputStyle} placeholder="0.00" /></FormField>}
            {f.saving_type === 'tangible' && <FormField label="Calculation Basis"><input value={f.calculation_basis} onChange={e => setF({ ...f, calculation_basis: e.target.value })} style={formInputStyle} placeholder="How was this calculated?" /></FormField>}
            <FormField label="Beneficiary"><input value={f.beneficiary} onChange={e => setF({ ...f, beneficiary: e.target.value })} style={formInputStyle} placeholder="e.g. Client name" /></FormField>
            <FormField label="Description" span><textarea value={f.description} onChange={e => setF({ ...f, description: e.target.value })} rows={2} style={{ ...formInputStyle, resize: 'vertical' }} placeholder="Brief description..." /></FormField>
          </FormGrid>
          <FormButtons onCancel={() => { setShowForm(false); setMsg(null) }} onSave={handleAdd} saving={saving} label="Add Saving" />
        </FormWrapper>
      )}

      <span style={{ fontSize: '15px', color: BRAND.purple, display: 'block', marginBottom: '12px' }}>Tangible Savings</span>
      {renderSavingsTable(tangible, true)}

      <span style={{ fontSize: '15px', color: BRAND.purple, display: 'block', marginBottom: '12px', marginTop: '24px' }}>Intangible Savings</span>
      {renderSavingsTable(intangible, false)}
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
  const [f, setF] = useState({ variation_ref: '', title: '', variation_type: 'scope_change', variation_amount: '', raised_by: '', raised_date: new Date().toISOString().slice(0, 10), description: '' })
  const [expandedId, setExpandedId] = useState(null)

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
      status: 'draft', raised_by: f.raised_by || null,
      raised_date: f.raised_date || null, description: f.description.trim() || null,
    })
    if (error) { setMsg({ type: 'error', text: error.message }) }
    else { setF({ variation_ref: '', title: '', variation_type: 'scope_change', variation_amount: '', raised_by: '', raised_date: new Date().toISOString().slice(0, 10), description: '' }); setShowForm(false); onReload() }
    setSaving(false)
  }

  async function handleApprovalTransition(variationId, newStatus, notes) {
    const updates = { status: newStatus }
    if (newStatus === 'approved') {
      updates.approved_by = 'Sector Manager'
      updates.approved_date = new Date().toISOString().slice(0, 10)
    }
    if (newStatus === 'submitted') {
      updates.submitted_date = new Date().toISOString().slice(0, 10)
    }
    if (newStatus === 'rejected' && notes) {
      updates.rejected_reason = notes
    }
    // pending_change → back to draft so PM can edit
    if (newStatus === 'pending_change') {
      updates.status = 'draft'
      updates.approved_by = null
      updates.approved_date = null
    }
    await supabase.from('project_variations').update(updates).eq('id', variationId)
    onReload()
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', flex: 1, marginRight: '16px' }}>
          <KPICard label="Total Change Orders" value={variations.length} />
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
            <FormField label="Raised By">
              <select value={f.raised_by} onChange={e => setF({ ...f, raised_by: e.target.value })} style={formInputStyle}>
                <option value="">Select...</option>
                {employees.map(emp => <option key={emp.id} value={emp.name}>{emp.name}</option>)}
              </select>
            </FormField>
            <FormField label="Raised Date"><input type="date" value={f.raised_date} onChange={e => setF({ ...f, raised_date: e.target.value })} style={formInputStyle} /></FormField>
            <FormField label="Description" span><textarea value={f.description} onChange={e => setF({ ...f, description: e.target.value })} rows={2} style={{ ...formInputStyle, resize: 'vertical' }} placeholder="Brief description..." /></FormField>
          </FormGrid>
          <FormButtons onCancel={() => { setShowForm(false); setMsg(null) }} onSave={handleAdd} saving={saving} label="Add Change Order" />
        </FormWrapper>
      )}

      {variations.length === 0 ? (
        <div style={{ padding: '24px', background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, color: BRAND.coolGrey, fontSize: '13px' }}>No change orders recorded for this project.</div>
      ) : variations.map((v, idx) => {
        const locked = v.status === 'approved'
        const expanded = expandedId === v.id
        return (
          <div key={v.id} style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, marginBottom: '8px' }}>
            <button onClick={() => setExpandedId(expanded ? null : v.id)} style={{ width: '100%', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', fontFamily: BRAND.font, textAlign: 'left' }}>
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                {locked && <span style={{ fontSize: '12px', color: BRAND.coolGrey }}>LOCKED</span>}
                <span style={{ color: BRAND.purple, fontWeight: 600, fontSize: '13px' }}>{v.variation_ref}</span>
                <span style={{ color: BRAND.coolGrey, fontSize: '13px' }}>{v.title}</span>
                {v.variation_amount && <span style={{ color: BRAND.purple, fontSize: '13px' }}>{formatCurrency(v.variation_amount)}</span>}
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <StatusBadge status={v.status} map={variationStatusMap} />
                <span style={{ color: BRAND.coolGrey, fontSize: '12px' }}>{expanded ? 'Collapse' : 'Expand'}</span>
              </div>
            </button>
            {expanded && (
              <div style={{ padding: '0 20px 16px', borderTop: `1px solid ${BRAND.greyBorder}` }}>
                <ApprovalBanner
                  status={v.status}
                  onTransition={(newStatus, notes) => handleApprovalTransition(v.id, newStatus, notes)}
                  entityLabel="Change Order"
                  approvedBy={v.approved_by}
                  approvedDate={v.approved_date}
                  rejectionReason={v.rejected_reason}
                />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', fontSize: '12px', color: BRAND.coolGrey }}>
                  <div><span style={{ display: 'block', fontSize: '11px', color: BRAND.coolGrey }}>Type</span><span style={{ textTransform: 'capitalize' }}>{(v.variation_type || '').replace(/_/g, ' ')}</span></div>
                  <div><span style={{ display: 'block', fontSize: '11px', color: BRAND.coolGrey }}>Raised By</span>{v.raised_by || '—'}</div>
                  <div><span style={{ display: 'block', fontSize: '11px', color: BRAND.coolGrey }}>Raised Date</span>{v.raised_date ? formatDate(v.raised_date) : '—'}</div>
                  {v.description && <div style={{ gridColumn: '1 / -1' }}><span style={{ display: 'block', fontSize: '11px', color: BRAND.coolGrey }}>Description</span>{v.description}</div>}
                  {v.approved_by && <div><span style={{ display: 'block', fontSize: '11px', color: BRAND.coolGrey }}>Approved By</span>{v.approved_by}</div>}
                  {v.approved_date && <div><span style={{ display: 'block', fontSize: '11px', color: BRAND.coolGrey }}>Approved Date</span>{formatDate(v.approved_date)}</div>}
                </div>
              </div>
            )}
          </div>
        )
      })}
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
