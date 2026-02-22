import { useState, useEffect, useMemo } from 'react'
import { BRAND } from '../lib/brand'
import { formatCurrency, formatPct } from '../lib/utils'
import { supabase } from '../lib/supabase'
import { PCS_SECTOR_ID, useEmployees, useProjects, useClients } from '../hooks/useData'
import { KPICard, SectionHeader, LoadingState, ProjectLink, ClientLink, EmployeeLink } from '../components/SharedUI'

// ============================================================================
// Styles
// ============================================================================
const thStyle = { background: BRAND.purple, color: BRAND.white, padding: '10px 14px', textAlign: 'left', fontWeight: 400, whiteSpace: 'nowrap', fontSize: '13px' }
const thStyleRight = { ...thStyle, textAlign: 'right' }
const tdBase = { padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, color: BRAND.coolGrey, fontSize: '13px' }
const tdRight = { ...tdBase, textAlign: 'right' }
const sectionTitle = { fontSize: '15px', color: BRAND.purple, marginBottom: '12px', display: 'block' }

function rowBg(i) { return i % 2 === 0 ? BRAND.white : BRAND.greyLight }

// ============================================================================
// Helper: safe view query — returns [] if view doesn't exist
// ============================================================================
async function safeViewQuery(viewName, sectorId, opts = {}) {
  let q = supabase.from(viewName).select(opts.select || '*').eq('sector_id', sectorId)
  if (opts.limit) q = q.limit(opts.limit)
  const { data, error } = await q
  if (error) {
    console.warn(`Dashboard: view "${viewName}" unavailable (${error.code}), using fallback`)
    return []
  }
  return data || []
}

// ============================================================================
// MarginBar
// ============================================================================
function MarginBar({ pct }) {
  const color = pct >= 0.30 ? BRAND.green : pct >= 0.15 ? BRAND.amber : BRAND.red
  const width = Math.min(Math.max(pct * 100, 0), 100)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-end' }}>
      <div style={{ width: '60px', height: '6px', background: BRAND.greyLight }}>
        <div style={{ height: '100%', width: `${width}%`, background: color }} />
      </div>
      <span style={{ fontSize: '12px', color, minWidth: '40px', textAlign: 'right' }}>{(pct * 100).toFixed(1)}%</span>
    </div>
  )
}

// ============================================================================
// UrgencyBadge
// ============================================================================
function UrgencyBadge({ urgency }) {
  const map = {
    overdue: { bg: '#FDECEC', text: BRAND.red, label: 'Overdue' },
    due_now: { bg: '#FFF4E5', text: BRAND.amber, label: 'Due Now' },
    due_this_week: { bg: '#FFF4E5', text: BRAND.amber, label: 'This Week' },
    due_next_week: { bg: '#E8F4FD', text: BRAND.blue, label: 'Next Week' },
    on_track: { bg: '#E8F5E8', text: BRAND.green, label: 'On Track' },
    no_due_date: { bg: BRAND.greyLight, text: BRAND.coolGrey, label: 'No Date' },
  }
  const s = map[urgency] || map.on_track
  return <span style={{ padding: '2px 10px', fontSize: '11px', background: s.bg, color: s.text, fontFamily: BRAND.font }}>{s.label}</span>
}

// ============================================================================
// Helper: compute urgency from a due_date
// ============================================================================
function computeUrgency(dueDate) {
  if (!dueDate) return 'no_due_date'
  const d = new Date(dueDate)
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const diff = (d - now) / (1000 * 60 * 60 * 24)
  if (diff < 0) return 'overdue'
  if (diff <= 3) return 'due_now'
  if (diff <= 7) return 'due_this_week'
  if (diff <= 14) return 'due_next_week'
  return 'on_track'
}

const STANDARD_MONTHLY_HOURS = 173.3

// ============================================================================
// DashboardPage
// ============================================================================
export default function DashboardPage({ onNavigate }) {
  const { data: employees, loading: empLoading } = useEmployees()
  const { data: projects, loading: projLoading } = useProjects()
  const { data: clients } = useClients()

  // Raw tables (always available)
  const [invoices, setInvoices] = useState([])
  const [forecasts, setForecasts] = useState([])
  const [allocations, setAllocations] = useState([])
  const [workOrders, setWorkOrders] = useState([])
  const [sectorData, setSectorData] = useState(null)
  const [rawRisks, setRawRisks] = useState([])
  const [rawMeetingActions, setRawMeetingActions] = useState([])
  const [rawProjectActions, setRawProjectActions] = useState([])

  // Views (may be empty if views don't exist)
  const [viewActions, setViewActions] = useState([])
  const [viewRisks, setViewRisks] = useState([])
  const [viewUtil, setViewUtil] = useState([])
  const [viewWoSummary, setViewWoSummary] = useState([])
  const [viewSectorSummary, setViewSectorSummary] = useState(null)

  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadAll() {
      // Phase 1: raw tables (always exist, always work)
      const [invRes, fRes, allocRes, woRes, sectorRes, rawRiskRes, rawMARes, rawPARes] = await Promise.all([
        supabase.from('invoices').select('id, amount, status, due_date, client_id, billing_month, date_paid').eq('sector_id', PCS_SECTOR_ID),
        supabase.from('forecasts').select('id, name, status, probability, probability_weight, bill_rate, forecast_allocations(planned_hours, month)').eq('sector_id', PCS_SECTOR_ID),
        supabase.from('resource_allocations').select('project_id, employee_id, month, planned_hours, actual_hours').eq('sector_id', PCS_SECTOR_ID),
        supabase.from('work_orders').select('id, name, budget, status, client_id, clients(name), po_reference, end_date').eq('sector_id', PCS_SECTOR_ID),
        supabase.from('sectors').select('*').eq('id', PCS_SECTOR_ID).single(),
        supabase.from('project_risks').select('id, project_id, title, status, impact, owner, review_date, projects(code)').eq('sector_id', PCS_SECTOR_ID),
        supabase.from('meeting_actions').select('id, action_ref, description, status, priority, due_date, owner_name, owner_employee_id, project_id, notes, meetings(title), projects(code), employees(name)').eq('sector_id', PCS_SECTOR_ID).not('status', 'in', '("closed","superseded")').order('due_date', { ascending: true, nullsLast: true }).limit(20),
        supabase.from('project_actions').select('id, action_ref, description, status, priority, due_date, owner_name, owner_employee_id, source, source_detail, project_id, notes, projects(code), employees(name)').eq('sector_id', PCS_SECTOR_ID).not('status', 'in', '("closed","superseded")').order('due_date', { ascending: true, nullsLast: true }).limit(20),
      ])
      setInvoices(invRes.data || [])
      setForecasts(fRes.data || [])
      setAllocations(allocRes.data || [])
      setWorkOrders(woRes.data || [])
      setSectorData(sectorRes.data || null)
      setRawRisks(rawRiskRes.data || [])
      setRawMeetingActions(rawMARes.data || [])
      setRawProjectActions(rawPARes.data || [])

      // Phase 2: views (graceful fallback if missing)
      const [vActions, vRisks, vUtil, vWoSum, vSectorSum] = await Promise.all([
        safeViewQuery('v_sector_action_tracker', PCS_SECTOR_ID, { limit: 20 }),
        safeViewQuery('v_sector_risks_summary', PCS_SECTOR_ID),
        safeViewQuery('v_employee_utilization', PCS_SECTOR_ID),
        safeViewQuery('v_work_order_summary', PCS_SECTOR_ID),
        safeViewQuery('v_sector_summary', PCS_SECTOR_ID),
      ])
      setViewActions(vActions)
      setViewRisks(vRisks)
      setViewUtil(vUtil)
      setViewWoSummary(vWoSum)
      setViewSectorSummary(vSectorSum?.[0] || null)
      setLoading(false)
    }
    loadAll()
  }, [])

  // ===== MAPS =====
  const clientMap = useMemo(() => Object.fromEntries((clients || []).map(c => [c.id, c])), [clients])
  const empMap = useMemo(() => Object.fromEntries((employees || []).map(e => [e.id, e])), [employees])

  // ===== SECTOR KPIs =====
  const budgetTarget = Number(sectorData?.annual_budget_target || 0)
  const budgetYear = sectorData?.budget_year || 2026
  const headcount = (employees || []).filter(e => e.is_active !== false).length

  const totalInvoiced = useMemo(() =>
    (invoices || []).filter(i => i.status === 'paid' || i.status === 'sent').reduce((s, i) => s + Number(i.amount || 0), 0), [invoices])
  const totalOverdue = useMemo(() =>
    (invoices || []).filter(i => i.status === 'overdue' || (i.status === 'sent' && i.due_date && new Date(i.due_date) < new Date())).reduce((s, i) => s + Number(i.amount || 0), 0), [invoices])
  const budgetPct = budgetTarget > 0 ? totalInvoiced / budgetTarget : 0

  // Revenue/Cost: prefer view, fallback to raw calc
  const { totalPlannedRev, totalActualRev, totalPlannedCost, totalActualCost } = useMemo(() => {
    if (viewSectorSummary && Number(viewSectorSummary.total_planned_revenue || 0) > 0) {
      return {
        totalPlannedRev: Number(viewSectorSummary.total_planned_revenue || 0),
        totalActualRev: Number(viewSectorSummary.total_actual_revenue || 0),
        totalPlannedCost: Number(viewSectorSummary.total_planned_cost || 0),
        totalActualCost: Number(viewSectorSummary.total_actual_cost || 0),
      }
    }
    let pRev = 0, aRev = 0, pCost = 0, aCost = 0
    ;(allocations || []).forEach(a => {
      const emp = empMap[a.employee_id]
      const proj = (projects || []).find(p => p.id === a.project_id)
      const cl = proj ? clientMap[proj.client_id] : null
      const rate = proj?.rate_type === 'cross_sector_adjusted' ? Number(proj.adjusted_bill_rate || 0) : Number(cl?.standard_bill_rate || 0)
      const hCost = Number(emp?.hourly_cost || 0)
      const pH = Number(a.planned_hours || 0)
      const aH = Number(a.actual_hours || 0)
      pRev += pH * rate; aRev += aH * rate; pCost += pH * hCost; aCost += aH * hCost
    })
    return { totalPlannedRev: pRev, totalActualRev: aRev, totalPlannedCost: pCost, totalActualCost: aCost }
  }, [viewSectorSummary, allocations, empMap, projects, clientMap])

  const plannedMargin = totalPlannedRev - totalPlannedCost
  const plannedMarginPct = totalPlannedRev > 0 ? plannedMargin / totalPlannedRev : 0
  const actualMargin = totalActualRev - totalActualCost
  const actualMarginPct = totalActualRev > 0 ? actualMargin / totalActualRev : 0

  // ===== PIPELINE =====
  const pipelineForecasts = useMemo(() => (forecasts || []).filter(f => f.status !== 'lost' && f.status !== 'won'), [forecasts])
  const pipelineWeightedTotal = useMemo(() =>
    pipelineForecasts.reduce((sum, f) => {
      const gross = (f.forecast_allocations || []).reduce((s2, a) => s2 + Number(a.planned_hours || 0) * Number(f.bill_rate || 0), 0)
      return sum + gross * Number(f.probability_weight || 0)
    }, 0), [pipelineForecasts])

  // ===== PER-PROJECT MARGIN =====
  const projectMargins = useMemo(() => {
    if (!projects || !allocations) return []
    return (projects || []).filter(p => p.type === 'billable' && p.is_active).map(p => {
      const pAllocs = allocations.filter(a => a.project_id === p.id)
      const cl = clientMap[p.client_id]
      const rate = p.rate_type === 'cross_sector_adjusted' ? Number(p.adjusted_bill_rate || 0) : Number(cl?.standard_bill_rate || 0)
      let pRev = 0, aRev = 0, pCst = 0, aCst = 0
      pAllocs.forEach(a => {
        const emp = empMap[a.employee_id]
        const hCost = Number(emp?.hourly_cost || 0)
        const pH = Number(a.planned_hours || 0); const aH = Number(a.actual_hours || 0)
        pRev += pH * rate; aRev += aH * rate; pCst += pH * hCost; aCst += aH * hCost
      })
      return {
        id: p.id, code: p.code, name: p.name, clientName: cl?.name || '—',
        plannedRev: pRev, actualRev: aRev, plannedCost: pCst, actualCost: aCst,
        plannedMargin: pRev - pCst, actualMargin: aRev - aCst,
        plannedMarginPct: pRev > 0 ? (pRev - pCst) / pRev : 0,
        actualMarginPct: aRev > 0 ? (aRev - aCst) / aRev : 0,
      }
    }).sort((a, b) => b.plannedRev - a.plannedRev)
  }, [projects, allocations, empMap, clientMap])

  // ===== UTILIZATION (view with fallback) =====
  const currentMonth = new Date().toISOString().slice(0, 7) + '-01'
  const utilData = useMemo(() => {
    if (viewUtil.length > 0) return viewUtil
    const monthAllocs = (allocations || []).filter(a => a.month && a.month.startsWith(currentMonth.slice(0, 7)))
    const empHours = {}
    monthAllocs.forEach(a => {
      if (!empHours[a.employee_id]) empHours[a.employee_id] = { planned: 0, actual: 0 }
      empHours[a.employee_id].planned += Number(a.planned_hours || 0)
    })
    return (employees || []).filter(e => e.is_active !== false).map(e => {
      const h = empHours[e.id] || { planned: 0 }
      const target = Number(e.target_utilization || 0.85)
      const targetHrs = STANDARD_MONTHLY_HOURS * target
      const pUtil = targetHrs > 0 ? h.planned / targetHrs : 0
      return { employee_id: e.id, employee_name: e.name, role: e.role, month: currentMonth, planned_utilization: pUtil, target_utilization: target, utilization_status: pUtil >= target ? 'on_target' : pUtil >= target * 0.8 ? 'near_target' : 'below_target' }
    })
  }, [viewUtil, allocations, employees, currentMonth])

  const currentUtil = useMemo(() => {
    const curr = utilData.filter(u => u.month === currentMonth || u.month?.startsWith(currentMonth.slice(0, 7)))
    if (curr.length === 0) return { avg: 0, belowTarget: 0, onTarget: 0, total: 0 }
    const avg = curr.reduce((s, u) => s + Number(u.planned_utilization || 0), 0) / curr.length
    return { avg, belowTarget: curr.filter(u => u.utilization_status === 'below_target').length, onTarget: curr.filter(u => u.utilization_status !== 'below_target').length, total: curr.length }
  }, [utilData, currentMonth])

  // ===== ACTIONS (view with fallback) =====
  const actions = useMemo(() => {
    if (viewActions.length > 0) return viewActions
    const merged = []
    ;(rawMeetingActions || []).forEach(ma => merged.push({ action_id: ma.id, action_ref: ma.action_ref, action_description: ma.description, status: ma.status, priority: ma.priority, due_date: ma.due_date, urgency: computeUrgency(ma.due_date), owner_name: ma.employees?.name || ma.owner_name || '—', project_code: ma.projects?.code || '—', source_type: 'meeting' }))
    ;(rawProjectActions || []).forEach(pa => merged.push({ action_id: pa.id, action_ref: pa.action_ref, action_description: pa.description, status: pa.status, priority: pa.priority, due_date: pa.due_date, urgency: computeUrgency(pa.due_date), owner_name: pa.employees?.name || pa.owner_name || '—', project_code: pa.projects?.code || '—', source_type: pa.source }))
    const order = { overdue: 0, due_now: 1, due_this_week: 2, due_next_week: 3, on_track: 4, no_due_date: 5 }
    merged.sort((a, b) => (order[a.urgency] ?? 4) - (order[b.urgency] ?? 4) || (a.due_date && b.due_date ? new Date(a.due_date) - new Date(b.due_date) : a.due_date ? -1 : 1))
    return merged.slice(0, 20)
  }, [viewActions, rawMeetingActions, rawProjectActions])

  // ===== RISKS (view with fallback) =====
  const risks = useMemo(() => {
    if (viewRisks.length > 0) return viewRisks
    const byProject = {}
    ;(rawRisks || []).forEach(r => {
      const pid = r.project_id; if (!pid) return
      if (!byProject[pid]) byProject[pid] = { project_id: pid, project_code: r.projects?.code || '—', open_count: 0, escalated_count: 0, high_impact_active: 0, overdue_review_count: 0 }
      const bp = byProject[pid]
      if (['open', 'identified', 'mitigating'].includes(r.status)) bp.open_count++
      if (r.status === 'escalated') bp.escalated_count++
      if (['critical', 'high'].includes(r.impact) && r.status !== 'closed') bp.high_impact_active++
      if (r.review_date && new Date(r.review_date) < new Date() && r.status !== 'closed') bp.overdue_review_count++
    })
    return Object.values(byProject).sort((a, b) => (b.escalated_count + b.open_count) - (a.escalated_count + a.open_count))
  }, [viewRisks, rawRisks])

  const riskTotals = useMemo(() => {
    const t = { escalated: 0, highImpact: 0, overdueReviews: 0, open: 0 }
    ;(risks || []).forEach(r => { t.escalated += Number(r.escalated_count || 0); t.highImpact += Number(r.high_impact_active || 0); t.overdueReviews += Number(r.overdue_review_count || 0); t.open += Number(r.open_count || 0) })
    return t
  }, [risks])

  // ===== PO BURN (view with fallback) =====
  const poBurn = useMemo(() => {
    if (viewWoSummary.length > 0) {
      return viewWoSummary.filter(w => w.status === 'active' && Number(w.budget || 0) > 0).map(w => {
        const budget = Number(w.budget); const invoiced = Number(w.total_invoiced || 0)
        return { ...w, burnPct: budget > 0 ? invoiced / budget : 0, remaining: budget - invoiced }
      }).sort((a, b) => b.burnPct - a.burnPct)
    }
    const woInvMap = {}
    ;(invoices || []).forEach(inv => {
      const wo = (workOrders || []).find(w => w.client_id === inv.client_id && w.status === 'active')
      if (wo) { woInvMap[wo.id] = (woInvMap[wo.id] || 0) + Number(inv.amount || 0) }
    })
    return (workOrders || []).filter(w => w.status === 'active' && Number(w.budget || 0) > 0).map(w => {
      const budget = Number(w.budget); const invoiced = woInvMap[w.id] || 0
      return { work_order_id: w.id, work_order_name: w.name, po_reference: w.po_reference, client_name: w.clients?.name || '—', budget, total_invoiced: invoiced, burnPct: budget > 0 ? invoiced / budget : 0, remaining: budget - invoiced }
    }).sort((a, b) => b.burnPct - a.burnPct)
  }, [viewWoSummary, workOrders, invoices])

  // ===== ALERTS =====
  const alerts = useMemo(() => {
    const a = []
    const overdueInv = invoices.filter(i => i.status === 'overdue' || (i.status === 'sent' && i.due_date && new Date(i.due_date) < new Date()))
    if (overdueInv.length > 0) a.push({ type: 'warning', text: `${overdueInv.length} overdue invoice(s) totalling ${formatCurrency(totalOverdue)}` })
    const hotPOs = poBurn.filter(p => p.burnPct > 0.85)
    if (hotPOs.length > 0) a.push({ type: 'warning', text: `${hotPOs.length} PO(s) over 85% burned` })
    if (riskTotals.escalated > 0) a.push({ type: 'danger', text: `${riskTotals.escalated} escalated risk(s) require attention` })
    const overdueAct = actions.filter(ac => ac.urgency === 'overdue')
    if (overdueAct.length > 0) a.push({ type: 'warning', text: `${overdueAct.length} overdue action(s)` })
    if (currentUtil.belowTarget > 0) a.push({ type: 'info', text: `${currentUtil.belowTarget} employee(s) below utilization target this month` })
    return a
  }, [invoices, totalOverdue, poBurn, riskTotals, actions, currentUtil])

  const nav = (key) => onNavigate && onNavigate(key)

  if (empLoading || projLoading || loading) return <LoadingState message="Loading dashboard..." />

  return (
    <div>
      <SectionHeader title="Dashboard" subtitle={`PCS — Procurement & Compliance Sector, FY ${budgetYear}`} />

      {/* Alerts */}
      {alerts.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          {alerts.map((a, i) => {
            const colors = { danger: { bg: '#FDECEC', border: BRAND.red, text: BRAND.red }, warning: { bg: '#FFF4E5', border: BRAND.amber, text: BRAND.amber }, info: { bg: '#E8F4FD', border: BRAND.blue, text: BRAND.blue } }
            const c = colors[a.type] || colors.info
            return <div key={i} style={{ padding: '10px 16px', marginBottom: '6px', fontSize: '13px', background: c.bg, color: c.text, borderLeft: `3px solid ${c.border}` }}>{a.text}</div>
          })}
        </div>
      )}

      {/* Top KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        <KPICard label="Budget Target" value={formatCurrency(budgetTarget)} />
        <KPICard label="Total Invoiced" value={formatCurrency(totalInvoiced)} color={BRAND.teal} subValue={budgetTarget > 0 ? `${(budgetPct * 100).toFixed(1)}% of target` : undefined} />
        <KPICard label="Planned Revenue" value={formatCurrency(totalPlannedRev)} color={BRAND.blue} />
        <KPICard label="Planned Margin" value={formatPct(plannedMarginPct)} subValue={formatCurrency(plannedMargin)} color={plannedMarginPct >= 0.30 ? BRAND.green : plannedMarginPct >= 0.15 ? BRAND.amber : BRAND.red} />
        <KPICard label="Actual Margin (YTD)" value={formatPct(actualMarginPct)} subValue={formatCurrency(actualMargin)} color={actualMarginPct >= 0.30 ? BRAND.green : actualMarginPct >= 0.15 ? BRAND.amber : BRAND.red} />
        <KPICard label="Active Headcount" value={headcount} subValue={`${currentUtil.onTarget} on target`} />
        <KPICard label="Pipeline (Weighted)" value={formatCurrency(pipelineWeightedTotal)} color={BRAND.teal} subValue={`${pipelineForecasts.length} opportunit${pipelineForecasts.length === 1 ? 'y' : 'ies'}`} />
        <KPICard label="Open Risks" value={riskTotals.open + riskTotals.escalated} color={riskTotals.escalated > 0 ? BRAND.red : BRAND.green} subValue={riskTotals.escalated > 0 ? `${riskTotals.escalated} escalated` : 'None escalated'} />
      </div>

      {/* Sector Margin */}
      <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, padding: '24px', marginBottom: '24px' }}>
        <div style={{ fontSize: '15px', color: BRAND.purple, marginBottom: '16px' }}>Sector Margin</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div style={{ padding: '16px', background: BRAND.greyLight }}>
            <div style={{ fontSize: '12px', color: BRAND.coolGrey, marginBottom: '8px' }}>Planned (Full Year)</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
              <div><div style={{ fontSize: '11px', color: BRAND.coolGrey }}>Revenue</div><div style={{ fontSize: '16px', color: BRAND.purple }}>{formatCurrency(totalPlannedRev)}</div></div>
              <div><div style={{ fontSize: '11px', color: BRAND.coolGrey }}>Cost</div><div style={{ fontSize: '16px', color: BRAND.coolGrey }}>{formatCurrency(totalPlannedCost)}</div></div>
              <div><div style={{ fontSize: '11px', color: BRAND.coolGrey }}>Margin</div><div style={{ fontSize: '16px', color: plannedMarginPct >= 0.30 ? BRAND.green : BRAND.amber }}>{formatCurrency(plannedMargin)} ({formatPct(plannedMarginPct)})</div></div>
            </div>
          </div>
          <div style={{ padding: '16px', background: BRAND.greyLight }}>
            <div style={{ fontSize: '12px', color: BRAND.coolGrey, marginBottom: '8px' }}>Actual (Year to Date)</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
              <div><div style={{ fontSize: '11px', color: BRAND.coolGrey }}>Revenue</div><div style={{ fontSize: '16px', color: BRAND.teal }}>{formatCurrency(totalActualRev)}</div></div>
              <div><div style={{ fontSize: '11px', color: BRAND.coolGrey }}>Cost</div><div style={{ fontSize: '16px', color: BRAND.coolGrey }}>{formatCurrency(totalActualCost)}</div></div>
              <div><div style={{ fontSize: '11px', color: BRAND.coolGrey }}>Margin</div><div style={{ fontSize: '16px', color: actualMarginPct >= 0.30 ? BRAND.green : BRAND.amber }}>{formatCurrency(actualMargin)} ({formatPct(actualMarginPct)})</div></div>
            </div>
          </div>
        </div>
      </div>

      {/* Budget Target Progress */}
      <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, padding: '24px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <span style={{ fontSize: '15px', color: BRAND.purple }}>Budget Target Progress</span>
          <span style={{ fontSize: '14px', color: BRAND.coolGrey }}>{formatCurrency(totalInvoiced)} of {formatCurrency(budgetTarget)}</span>
        </div>
        <div style={{ height: '32px', background: BRAND.greyLight, position: 'relative', overflow: 'hidden', marginBottom: '8px' }}>
          <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${Math.min(budgetPct * 100, 100)}%`, background: budgetPct > 0.9 ? BRAND.green : budgetPct > 0.5 ? BRAND.teal : BRAND.amber, transition: 'width 0.5s ease' }} />
          {[...Array(12)].map((_, i) => <div key={i} style={{ position: 'absolute', left: `${((i + 1) / 12) * 100}%`, top: 0, height: '100%', width: '1px', background: 'rgba(0,0,0,0.1)' }} />)}
          <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: budgetPct > 0.4 ? BRAND.white : BRAND.coolGrey, fontSize: '13px', zIndex: 1 }}>{(budgetPct * 100).toFixed(1)}%</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: BRAND.coolGrey }}>
          <span>Jan</span><span>Mar</span><span>Jun</span><span>Sep</span><span>Dec</span>
        </div>
      </div>

      {/* Monthly Invoicing Chart */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <span style={sectionTitle}>Monthly Invoicing</span>
          <button onClick={() => nav('commercial')} style={{ padding: '5px 14px', background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, color: BRAND.purple, fontFamily: BRAND.font, fontSize: '12px', cursor: 'pointer' }}>View Invoices</button>
        </div>
        <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, padding: '16px' }}>
          {(() => {
            const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
            const byMonth = {}
            ;(invoices || []).forEach(inv => {
              const m = inv.billing_month?.slice(5, 7)
              if (m) { const idx = parseInt(m, 10) - 1; byMonth[idx] = (byMonth[idx] || 0) + Number(inv.amount || 0) }
            })
            const monthlyTarget = budgetTarget / 12
            const maxAmt = Math.max(...months.map((_, i) => byMonth[i] || 0), monthlyTarget, 1)
            return (
              <div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '120px' }}>
                  {months.map((label, i) => {
                    const amt = byMonth[i] || 0
                    const pct = (amt / maxAmt) * 100
                    const isFuture = i > new Date().getMonth()
                    return (
                      <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', height: '100%', justifyContent: 'flex-end' }}>
                        <div style={{ width: '100%', maxWidth: '40px', height: `${Math.max(pct, 2)}%`, background: isFuture ? BRAND.greyLight : amt >= monthlyTarget ? BRAND.teal : BRAND.amber, opacity: isFuture ? 0.4 : 1, position: 'relative' }}>
                          {amt > 0 && <div style={{ position: 'absolute', top: '-16px', left: '50%', transform: 'translateX(-50%)', fontSize: '9px', color: BRAND.coolGrey, whiteSpace: 'nowrap' }}>{(amt / 1000).toFixed(0)}k</div>}
                        </div>
                        <div style={{ fontSize: '10px', color: BRAND.coolGrey, marginTop: '4px' }}>{label}</div>
                        <div style={{ position: 'absolute', bottom: `${(monthlyTarget / maxAmt) * 100}%`, left: 0, right: 0, height: '1px', borderTop: `1px dashed ${BRAND.red}`, opacity: 0.5 }} />
                      </div>
                    )
                  })}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '8px', fontSize: '11px', color: BRAND.coolGrey }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ width: '12px', height: '8px', background: BRAND.teal, display: 'inline-block' }} /> On/above target</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ width: '12px', height: '8px', background: BRAND.amber, display: 'inline-block' }} /> Below target</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ width: '12px', height: '1px', borderTop: `1px dashed ${BRAND.red}`, display: 'inline-block' }} /> Monthly target ({formatCurrency(budgetTarget / 12)})</span>
                </div>
              </div>
            )
          })()}
        </div>
      </div>

      {/* Project Margin Table */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <span style={sectionTitle}>Project Margins</span>
          <button onClick={() => nav('work')} style={{ padding: '5px 14px', background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, color: BRAND.purple, fontFamily: BRAND.font, fontSize: '12px', cursor: 'pointer' }}>View All Projects</button>
        </div>
        <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={thStyle}>Project</th>
              <th style={thStyle}>Client</th>
              <th style={thStyleRight}>Planned Rev</th>
              <th style={thStyleRight}>Planned Cost</th>
              <th style={thStyleRight}>Planned Margin</th>
              <th style={thStyleRight}>Actual Rev (YTD)</th>
              <th style={thStyleRight}>Actual Margin</th>
            </tr></thead>
            <tbody>
              {projectMargins.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: '40px 24px', color: BRAND.coolGrey, fontSize: '13px' }}>No active billable projects with resource allocations.</td></tr>
              ) : projectMargins.map((p, i) => (
                <tr key={p.id} style={{ background: rowBg(i) }}>
                  <td style={{ ...tdBase, background: rowBg(i) }}><ProjectLink id={p.id}>{p.code}</ProjectLink></td>
                  <td style={{ ...tdBase, background: rowBg(i) }}>{p.clientName}</td>
                  <td style={{ ...tdRight, background: rowBg(i) }}>{formatCurrency(p.plannedRev)}</td>
                  <td style={{ ...tdRight, background: rowBg(i) }}>{formatCurrency(p.plannedCost)}</td>
                  <td style={{ ...tdRight, background: rowBg(i) }}><MarginBar pct={p.plannedMarginPct} /></td>
                  <td style={{ ...tdRight, background: rowBg(i) }}>{formatCurrency(p.actualRev)}</td>
                  <td style={{ ...tdRight, background: rowBg(i) }}>{p.actualRev > 0 ? <MarginBar pct={p.actualMarginPct} /> : <span style={{ fontSize: '12px' }}>—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Two-column: PO Burn + Actions */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={sectionTitle}>PO Burn Rates</span>
            <button onClick={() => nav('commercial')} style={{ padding: '5px 14px', background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, color: BRAND.purple, fontFamily: BRAND.font, fontSize: '12px', cursor: 'pointer' }}>View POs</button>
          </div>
          <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, overflow: 'auto', maxHeight: '360px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={thStyle}>PO / Client</th>
                <th style={thStyleRight}>Budget</th>
                <th style={thStyleRight}>Invoiced</th>
                <th style={thStyleRight}>Burn %</th>
              </tr></thead>
              <tbody>
                {poBurn.length === 0 ? (
                  <tr><td colSpan={4} style={{ padding: '24px', color: BRAND.coolGrey, fontSize: '13px' }}>No active POs.</td></tr>
                ) : poBurn.map((w, i) => {
                  const burnColor = w.burnPct > 0.9 ? BRAND.red : w.burnPct > 0.75 ? BRAND.amber : BRAND.green
                  return (
                    <tr key={w.work_order_id || i} style={{ background: rowBg(i) }}>
                      <td style={{ ...tdBase, background: rowBg(i) }}><div style={{ fontSize: '13px' }}>{w.po_reference || w.work_order_name}</div><div style={{ fontSize: '11px', color: BRAND.coolGrey }}>{w.client_name}</div></td>
                      <td style={{ ...tdRight, background: rowBg(i) }}>{formatCurrency(w.budget)}</td>
                      <td style={{ ...tdRight, background: rowBg(i) }}>{formatCurrency(w.total_invoiced)}</td>
                      <td style={{ ...tdRight, background: rowBg(i) }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>
                          <div style={{ width: '50px', height: '6px', background: BRAND.greyLight }}><div style={{ height: '100%', width: `${Math.min(w.burnPct * 100, 100)}%`, background: burnColor }} /></div>
                          <span style={{ fontSize: '12px', color: burnColor }}>{(w.burnPct * 100).toFixed(0)}%</span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={sectionTitle}>Open Actions</span>
            <button onClick={() => nav('actions')} style={{ padding: '5px 14px', background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, color: BRAND.purple, fontFamily: BRAND.font, fontSize: '12px', cursor: 'pointer' }}>View All</button>
          </div>
          <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, overflow: 'auto', maxHeight: '360px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={thStyle}>Action</th>
                <th style={thStyle}>Owner</th>
                <th style={thStyle}>Project</th>
                <th style={thStyle}>Urgency</th>
              </tr></thead>
              <tbody>
                {actions.length === 0 ? (
                  <tr><td colSpan={4} style={{ padding: '24px', color: BRAND.coolGrey, fontSize: '13px' }}>No open actions.</td></tr>
                ) : actions.slice(0, 10).map((a, i) => (
                  <tr key={a.action_id} style={{ background: rowBg(i) }}>
                    <td style={{ ...tdBase, background: rowBg(i), maxWidth: '200px' }}>
                      <div style={{ fontSize: '12px', color: BRAND.coolGrey }}>{a.action_ref}</div>
                      <div style={{ fontSize: '13px' }}>{a.action_description?.substring(0, 60)}{a.action_description?.length > 60 ? '...' : ''}</div>
                    </td>
                    <td style={{ ...tdBase, background: rowBg(i), whiteSpace: 'nowrap' }}>{a.owner_name}</td>
                    <td style={{ ...tdBase, background: rowBg(i), whiteSpace: 'nowrap' }}>{a.project_code || '—'}</td>
                    <td style={{ ...tdBase, background: rowBg(i) }}><UrgencyBadge urgency={a.urgency} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Two-column: Risks + Utilization */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={sectionTitle}>Risk Summary by Project</span>
            <button onClick={() => nav('raid')} style={{ padding: '5px 14px', background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, color: BRAND.purple, fontFamily: BRAND.font, fontSize: '12px', cursor: 'pointer' }}>RAID Log</button>
          </div>
          <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, overflow: 'auto', maxHeight: '300px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={thStyle}>Project</th>
                <th style={thStyleRight}>Open</th>
                <th style={thStyleRight}>Escalated</th>
                <th style={thStyleRight}>High Impact</th>
                <th style={thStyleRight}>Overdue Reviews</th>
              </tr></thead>
              <tbody>
                {risks.length === 0 ? (
                  <tr><td colSpan={5} style={{ padding: '24px', color: BRAND.coolGrey, fontSize: '13px' }}>No risks logged.</td></tr>
                ) : risks.map((r, i) => (
                  <tr key={r.project_id || i} style={{ background: rowBg(i) }}>
                    <td style={{ ...tdBase, background: rowBg(i) }}><ProjectLink id={r.project_id}>{r.project_code}</ProjectLink></td>
                    <td style={{ ...tdRight, background: rowBg(i) }}>{r.open_count}</td>
                    <td style={{ ...tdRight, background: rowBg(i), color: Number(r.escalated_count) > 0 ? BRAND.red : BRAND.coolGrey }}>{r.escalated_count}</td>
                    <td style={{ ...tdRight, background: rowBg(i), color: Number(r.high_impact_active) > 0 ? BRAND.amber : BRAND.coolGrey }}>{r.high_impact_active}</td>
                    <td style={{ ...tdRight, background: rowBg(i), color: Number(r.overdue_review_count) > 0 ? BRAND.red : BRAND.coolGrey }}>{r.overdue_review_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={sectionTitle}>Utilization Snapshot (Current Month)</span>
            <button onClick={() => nav('hoursrevenue')} style={{ padding: '5px 14px', background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, color: BRAND.purple, fontFamily: BRAND.font, fontSize: '12px', cursor: 'pointer' }}>View Hours</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '16px' }}>
            <KPICard label="Avg Utilization" value={formatPct(currentUtil.avg)} color={currentUtil.avg >= 0.75 ? BRAND.green : BRAND.amber} />
            <KPICard label="On Target" value={currentUtil.onTarget} color={BRAND.green} subValue={`of ${currentUtil.total}`} />
            <KPICard label="Below Target" value={currentUtil.belowTarget} color={currentUtil.belowTarget > 0 ? BRAND.red : BRAND.green} />
          </div>
          <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, overflow: 'auto', maxHeight: '200px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={thStyle}>Employee</th>
                <th style={thStyle}>Role</th>
                <th style={thStyleRight}>Planned</th>
                <th style={thStyleRight}>Target</th>
              </tr></thead>
              <tbody>
                {(() => {
                  const curr = utilData.filter(u => u.month === currentMonth || u.month?.startsWith(currentMonth.slice(0, 7)))
                    .sort((a, b) => Number(a.planned_utilization || 0) - Number(b.planned_utilization || 0))
                  if (curr.length === 0) return <tr><td colSpan={4} style={{ padding: '24px', color: BRAND.coolGrey, fontSize: '13px' }}>No utilization data for current month.</td></tr>
                  return curr.slice(0, 8).map((u, i) => {
                    const pUtil = Number(u.planned_utilization || 0)
                    const tUtil = Number(u.target_utilization || 0)
                    const color = pUtil >= tUtil ? BRAND.green : pUtil >= tUtil * 0.8 ? BRAND.amber : BRAND.red
                    return (
                      <tr key={u.employee_id} style={{ background: rowBg(i) }}>
                        <td style={{ ...tdBase, background: rowBg(i) }}><EmployeeLink id={u.employee_id}>{u.employee_name}</EmployeeLink></td>
                        <td style={{ ...tdBase, background: rowBg(i), fontSize: '12px' }}>{u.role}</td>
                        <td style={{ ...tdRight, background: rowBg(i), color }}>{formatPct(pUtil)}</td>
                        <td style={{ ...tdRight, background: rowBg(i) }}>{formatPct(tUtil)}</td>
                      </tr>
                    )
                  })
                })()}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <span style={sectionTitle}>Quick Actions</span>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
        {[
          { label: 'Enter Hours', desc: 'Weekly planned hours per project', nav: 'hoursrevenue', color: BRAND.purple },
          { label: 'Record Invoice', desc: 'Log invoices against clients', nav: 'commercial', color: BRAND.teal },
          { label: 'Add Opportunity', desc: 'Pipeline forecast entry', nav: 'forecast', color: BRAND.green },
          { label: 'PO Tracker', desc: 'Burn rates and PO balances', nav: 'commercial', color: BRAND.blue },
          { label: 'Manage Work', desc: 'Projects, clients, work orders', nav: 'work', color: BRAND.amber },
          { label: 'Settings', desc: 'Employees, rates, configuration', nav: 'settings', color: BRAND.coolGrey },
        ].map((qa, i) => (
          <button key={i} onClick={() => nav(qa.nav)} style={{
            background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, padding: '20px',
            cursor: 'pointer', textAlign: 'left', fontFamily: BRAND.font,
            borderLeft: `4px solid ${qa.color}`, transition: 'background 0.15s',
          }}
            onMouseEnter={e => e.currentTarget.style.background = BRAND.greyLight}
            onMouseLeave={e => e.currentTarget.style.background = BRAND.white}
          >
            <div style={{ fontSize: '14px', color: BRAND.purple, marginBottom: '4px' }}>{qa.label}</div>
            <div style={{ fontSize: '12px', color: BRAND.coolGrey }}>{qa.desc}</div>
          </button>
        ))}
      </div>
    </div>
  )
}
