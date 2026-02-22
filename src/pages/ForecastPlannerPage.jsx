import { useState, useEffect, useMemo } from 'react'
import { BRAND } from '../lib/brand'
import { formatCurrency, formatCurrencyExact, formatDate, formatPct } from '../lib/utils'
import { supabase } from '../lib/supabase'
import { PCS_SECTOR_ID } from '../hooks/useData'
import { SectionHeader, LoadingState, KPICard, DataTable, StatusBadge, ClientLink, ProjectLink } from '../components/SharedUI'
import OpportunityProfilePage from './OpportunityProfilePage'

const PROB_PRESETS = [
  { key: 'committed', label: 'Committed', weight: 1.00 },
  { key: 'high', label: 'High', weight: 0.75 },
  { key: 'medium', label: 'Medium', weight: 0.50 },
  { key: 'low', label: 'Low', weight: 0.25 },
]

const probMap = {
  committed: { bg: '#E8F5E8', text: BRAND.green, label: 'Committed (100%)' },
  high: { bg: '#E8F4FD', text: BRAND.blue, label: 'High (75%)' },
  medium: { bg: '#FFF4E5', text: BRAND.amber, label: 'Medium (50%)' },
  low: { bg: '#FDECEC', text: BRAND.red, label: 'Low (25%)' },
}

const statusMap = {
  draft: { bg: BRAND.greyLight, text: BRAND.coolGrey, label: 'Draft' },
  submitted: { bg: '#E8F4FD', text: BRAND.blue, label: 'Submitted' },
  approved: { bg: '#E8F5E8', text: BRAND.green, label: 'Approved' },
  won: { bg: '#E8F5E8', text: BRAND.green, label: 'Won' },
  lost: { bg: '#FDECEC', text: BRAND.red, label: 'Lost' },
}

const PURSUIT_STAGES = [
  { key: 'identified', label: 'Identified', color: BRAND.coolGrey },
  { key: 'qualifying', label: 'Qualifying', color: BRAND.amber },
  { key: 'proposal_prep', label: 'Proposal Prep', color: BRAND.blue },
  { key: 'proposal_submitted', label: 'Submitted', color: BRAND.teal },
  { key: 'negotiation', label: 'Negotiation', color: BRAND.purple },
  { key: 'awaiting_decision', label: 'Awaiting Decision', color: BRAND.amber },
  { key: 'won', label: 'Won', color: BRAND.green },
  { key: 'lost', label: 'Lost', color: BRAND.red },
]

const pursuitStageMap = Object.fromEntries(
  PURSUIT_STAGES.map(s => [s.key, { bg: s.color + '1A', text: s.color, label: s.label }])
)

const TABS = [
  { key: 'pipeline', label: 'Pipeline' },
  { key: 'crosssell', label: 'Cross-Sell' },
  { key: 'scenarios', label: 'Scenarios' },
  { key: 'budget', label: 'Budget Forecast' },
]

const MONTHS_2026 = [
  '2026-01','2026-02','2026-03','2026-04','2026-05','2026-06',
  '2026-07','2026-08','2026-09','2026-10','2026-11','2026-12',
]
const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export default function ForecastPlannerPage() {
  const [tab, setTab] = useState('pipeline')
  const [forecasts, setForecasts] = useState([])
  const [allocations, setAllocations] = useState([])
  const [invoices, setInvoices] = useState([])
  const [weeklyHours, setWeeklyHours] = useState([])
  const [rateLines, setRateLines] = useState([])
  const [sector, setSector] = useState(null)
  const [clients, setClients] = useState([])
  const [crossSells, setCrossSells] = useState([])
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedOpportunity, setSelectedOpportunity] = useState(null)
  const [resourceAllocations, setResourceAllocations] = useState([])
  const [employees, setEmployees] = useState([])

  // Custom probability overrides (in-memory, keyed by forecast id)
  const [customProbs, setCustomProbs] = useState({})

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    const [fRes, faRes, invRes, pwhRes, rlRes, secRes, clRes, csRes, prRes, raRes, empRes] = await Promise.all([
      supabase.from('forecasts').select('*').eq('sector_id', PCS_SECTOR_ID).order('created_at'),
      supabase.from('forecast_allocations').select('*').eq('sector_id', PCS_SECTOR_ID),
      supabase.from('invoices').select('*').eq('sector_id', PCS_SECTOR_ID),
      supabase.from('planned_weekly_hours').select('employee_id, project_id, week_ending, planned_hours, rate_line_id').eq('sector_id', PCS_SECTOR_ID),
      supabase.from('work_order_rate_lines').select('*').eq('sector_id', PCS_SECTOR_ID),
      supabase.from('sectors').select('*').eq('id', PCS_SECTOR_ID).single(),
      supabase.from('clients').select('*').eq('sector_id', PCS_SECTOR_ID),
      supabase.from('cross_sell_opportunities').select('*').eq('sector_id', PCS_SECTOR_ID).order('created_at', { ascending: false }),
      supabase.from('projects').select('id, code, name').eq('sector_id', PCS_SECTOR_ID).order('code'),
      supabase.from('resource_allocations').select('*').eq('sector_id', PCS_SECTOR_ID),
      supabase.from('employees').select('id, name, hourly_cost, target_utilization').eq('sector_id', PCS_SECTOR_ID),
    ])
    setForecasts(fRes.data || [])
    setAllocations(faRes.data || [])
    setInvoices(invRes.data || [])
    setWeeklyHours(pwhRes.data || [])
    setRateLines(rlRes.data || [])
    setSector(secRes.data)
    setClients(clRes.data || [])
    setCrossSells(csRes.data || [])
    setProjects(prRes.data || [])
    setResourceAllocations(raRes.data || [])
    setEmployees(empRes.data || [])
    setLoading(false)
  }

  const budgetTarget = sector?.annual_budget_target ? Number(sector.annual_budget_target) : 4133424.68
  const monthlyTarget = budgetTarget / 12

  // Get effective probability for a forecast
  function getProb(f) {
    if (customProbs[f.id] !== undefined) return customProbs[f.id] / 100
    return Number(f.probability_weight)
  }

  // Calculate revenue per forecast from its allocations
  const forecastRevenue = useMemo(() => {
    const map = {}
    forecasts.forEach(f => {
      const fas = allocations.filter(a => a.forecast_id === f.id)
      const totalHours = fas.reduce((s, a) => s + Number(a.planned_hours), 0)
      const grossRev = totalHours * Number(f.bill_rate)
      map[f.id] = { totalHours, grossRev }
    })
    return map
  }, [forecasts, allocations])

  // Monthly revenue from forecast allocations
  const forecastMonthlyRev = useMemo(() => {
    const map = {} // { forecastId: { '2026-01': amount, ... } }
    forecasts.forEach(f => {
      const fas = allocations.filter(a => a.forecast_id === f.id)
      const byMonth = {}
      fas.forEach(a => {
        const m = a.month?.slice(0, 7)
        if (m) byMonth[m] = (byMonth[m] || 0) + Number(a.planned_hours) * Number(f.bill_rate)
      })
      map[f.id] = byMonth
    })
    return map
  }, [forecasts, allocations])

  // Actual revenue from weekly hours (already confirmed work)
  const actualMonthlyRev = useMemo(() => {
    const rlMap = {}
    rateLines.forEach(rl => { rlMap[rl.id] = Number(rl.bill_rate) })
    const defaultRate = rateLines.find(rl => rl.is_default)
    const fallbackRate = defaultRate ? Number(defaultRate.bill_rate) : 159.65

    const byMonth = {}
    weeklyHours.forEach(h => {
      const m = h.week_ending?.slice(0, 7)
      if (!m) return
      const rate = h.rate_line_id && rlMap[h.rate_line_id] ? rlMap[h.rate_line_id] : fallbackRate
      byMonth[m] = (byMonth[m] || 0) + Number(h.planned_hours) * rate
    })
    return byMonth
  }, [weeklyHours, rateLines])

  // Invoiced revenue by month
  const invoicedByMonth = useMemo(() => {
    const byMonth = {}
    invoices.filter(i => i.status !== 'draft').forEach(i => {
      const m = i.billing_month?.slice(0, 7)
      if (m) byMonth[m] = (byMonth[m] || 0) + Number(i.amount)
    })
    return byMonth
  }, [invoices])

  // Resource allocation revenue by month (from confirmed allocations)
  const resourceAllocRevByMonth = useMemo(() => {
    const rlMap = {}
    rateLines.forEach(rl => { rlMap[rl.id] = Number(rl.bill_rate) })
    const defaultRate = rateLines.find(rl => rl.is_default)
    const fallbackRate = defaultRate ? Number(defaultRate.bill_rate) : 159.65

    const byMonth = {}
    resourceAllocations.forEach(ra => {
      const m = ra.month?.slice(0, 7)
      if (!m) return
      byMonth[m] = (byMonth[m] || 0) + Number(ra.planned_hours) * fallbackRate
    })
    return byMonth
  }, [resourceAllocations, rateLines])

  // Cost by month (from resource allocations x employee hourly cost)
  const costByMonth = useMemo(() => {
    const empCostMap = {}
    employees.forEach(e => { empCostMap[e.id] = Number(e.hourly_cost || 0) })
    const byMonth = {}
    resourceAllocations.forEach(ra => {
      const m = ra.month?.slice(0, 7)
      if (!m) return
      const cost = empCostMap[ra.employee_id] || 0
      byMonth[m] = (byMonth[m] || 0) + Number(ra.planned_hours) * cost
    })
    return byMonth
  }, [resourceAllocations, employees])

  // Total cost from planned weekly hours (actual staff cost)
  const actualCostByMonth = useMemo(() => {
    const empCostMap = {}
    employees.forEach(e => { empCostMap[e.id] = Number(e.hourly_cost || 0) })
    const byMonth = {}
    weeklyHours.forEach(h => {
      const m = h.week_ending?.slice(0, 7)
      if (!m) return
      const cost = empCostMap[h.employee_id] || 0
      byMonth[m] = (byMonth[m] || 0) + Number(h.planned_hours) * cost
    })
    return byMonth
  }, [weeklyHours, employees])

  if (loading) return <LoadingState message="Loading forecast planner..." />

  // Opportunity drill-down
  if (selectedOpportunity) {
    return <OpportunityProfilePage forecastId={selectedOpportunity} onBack={() => { setSelectedOpportunity(null); loadAll() }} />
  }

  const inputStyle = {
    width: '100%', padding: '8px 12px', border: `1px solid ${BRAND.greyBorder}`,
    fontFamily: BRAND.font, fontSize: '14px', color: BRAND.coolGrey, boxSizing: 'border-box',
  }
  const labelStyle = { display: 'block', fontSize: '12px', color: BRAND.coolGrey, marginBottom: '4px' }

  return (
    <div>
      <SectionHeader title="Forecast Planner" subtitle={`Annual budget target: ${formatCurrency(budgetTarget)}`} />

      <div style={{ display: 'flex', gap: '0', borderBottom: `2px solid ${BRAND.greyBorder}`, marginBottom: '24px' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '10px 24px', background: tab === t.key ? BRAND.purple : 'transparent',
            color: tab === t.key ? BRAND.white : BRAND.coolGrey,
            border: 'none', cursor: 'pointer', fontFamily: BRAND.font, fontSize: '13px',
            borderBottom: tab === t.key ? `2px solid ${BRAND.purple}` : '2px solid transparent',
            marginBottom: '-2px',
          }}>{t.label}</button>
        ))}
      </div>

      {tab === 'pipeline' && (
        <PipelineTab
          forecasts={forecasts} forecastRevenue={forecastRevenue}
          customProbs={customProbs} setCustomProbs={setCustomProbs}
          getProb={getProb} clients={clients} loadAll={loadAll}
          inputStyle={inputStyle} labelStyle={labelStyle}
          onOpenOpportunity={setSelectedOpportunity}
        />
      )}
      {tab === 'crosssell' && (
        <CrossSellTab crossSells={crossSells} clients={clients} projects={projects}
          loadAll={loadAll} inputStyle={inputStyle} labelStyle={labelStyle} />
      )}
      {tab === 'scenarios' && (
        <ScenariosTab
          forecasts={forecasts} forecastRevenue={forecastRevenue}
          forecastMonthlyRev={forecastMonthlyRev} actualMonthlyRev={actualMonthlyRev}
          invoicedByMonth={invoicedByMonth} getProb={getProb}
          budgetTarget={budgetTarget} monthlyTarget={monthlyTarget}
          actualCostByMonth={actualCostByMonth}
        />
      )}
      {tab === 'budget' && (
        <BudgetForecastTab
          forecasts={forecasts} forecastRevenue={forecastRevenue}
          forecastMonthlyRev={forecastMonthlyRev} actualMonthlyRev={actualMonthlyRev}
          invoicedByMonth={invoicedByMonth} getProb={getProb}
          budgetTarget={budgetTarget} monthlyTarget={monthlyTarget}
          customProbs={customProbs}
          resourceAllocRevByMonth={resourceAllocRevByMonth}
          costByMonth={costByMonth} actualCostByMonth={actualCostByMonth}
        />
      )}
    </div>
  )
}

// ============================================================================
// PIPELINE TAB
// ============================================================================
function PipelineTab({ forecasts, forecastRevenue, customProbs, setCustomProbs, getProb, clients, loadAll, inputStyle, labelStyle, onOpenOpportunity }) {
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)
  const [form, setForm] = useState({
    name: '', forecast_type: 'new_project', bill_rate: '159.65',
    probability: 'medium', start_date: '2026-01-01', end_date: '2026-12-31',
    proposed_client_id: '', description: '', monthly_hours: '',
  })

  const clientMap = {}
  clients.forEach(c => { clientMap[c.id] = c.name })

  const active = forecasts.filter(f => f.status !== 'lost' && f.status !== 'won')
  const won = forecasts.filter(f => f.status === 'won')
  const lost = forecasts.filter(f => f.status === 'lost')

  const totalWeighted = active.reduce((s, f) => {
    const rev = forecastRevenue[f.id]?.grossRev || 0
    return s + rev * getProb(f)
  }, 0)

  async function handleAdd(e) {
    e.preventDefault(); setSaving(true); setMessage(null)
    const { data: { user } } = await supabase.auth.getUser()

    const { data: forecast, error } = await supabase.from('forecasts').insert({
      sector_id: PCS_SECTOR_ID, name: form.name, description: form.description || null,
      forecast_type: form.forecast_type, bill_rate: parseFloat(form.bill_rate),
      probability: form.probability, start_date: form.start_date, end_date: form.end_date,
      proposed_client_id: form.proposed_client_id || null,
      status: 'draft', created_by: user.id,
    }).select().single()

    if (error) { setMessage({ type: 'error', text: error.message }); setSaving(false); return }

    // Auto-create monthly allocations if monthly_hours provided
    if (form.monthly_hours && forecast) {
      const hrs = parseFloat(form.monthly_hours)
      const start = new Date(form.start_date)
      const end = new Date(form.end_date)
      const allocs = []
      const d = new Date(start.getFullYear(), start.getMonth(), 1)
      while (d <= end) {
        allocs.push({
          forecast_id: forecast.id, sector_id: PCS_SECTOR_ID,
          month: d.toISOString().slice(0, 10), planned_hours: hrs,
        })
        d.setMonth(d.getMonth() + 1)
      }
      if (allocs.length > 0) {
        await supabase.from('forecast_allocations').insert(allocs)
      }
    }

    setMessage({ type: 'success', text: `Forecast "${form.name}" added.` })
    setForm({ name: '', forecast_type: 'new_project', bill_rate: '159.65', probability: 'medium',
      start_date: '2026-01-01', end_date: '2026-12-31', proposed_client_id: '', description: '', monthly_hours: '' })
    setShowForm(false); loadAll()
    setSaving(false)
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        <KPICard label="Active Pipeline" value={active.length} subValue="opportunities" />
        <KPICard label="Weighted Revenue" value={formatCurrency(totalWeighted)} color={BRAND.teal} subValue="probability-adjusted" />
        <KPICard label="Won" value={won.length} color={BRAND.green} />
        <KPICard label="Lost" value={lost.length} color={BRAND.red} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <span style={{ fontSize: '14px', color: BRAND.coolGrey }}>Pipeline Opportunities</span>
        <button onClick={() => setShowForm(!showForm)} style={{
          padding: '8px 20px', background: BRAND.purple, color: BRAND.white,
          border: 'none', cursor: 'pointer', fontFamily: BRAND.font, fontSize: '13px',
        }}>{showForm ? 'Cancel' : 'Add Opportunity'}</button>
      </div>

      {message && (
        <div style={{ padding: '10px 16px', marginBottom: '16px', fontSize: '13px',
          background: message.type === 'error' ? '#FDECEC' : '#E8F5E8',
          color: message.type === 'error' ? BRAND.red : BRAND.green,
        }}>{message.text}</div>
      )}

      {showForm && (
        <form onSubmit={handleAdd} style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, padding: '20px', marginBottom: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div><label style={labelStyle}>Name</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required style={inputStyle} placeholder="e.g. TI Davis Bacon Support" /></div>
            <div><label style={labelStyle}>Type</label>
              <select value={form.forecast_type} onChange={e => setForm({ ...form, forecast_type: e.target.value })} style={inputStyle}>
                <option value="new_project">New Project</option><option value="change_order">Change Order</option>
              </select>
            </div>
            <div><label style={labelStyle}>Client</label>
              <select value={form.proposed_client_id} onChange={e => setForm({ ...form, proposed_client_id: e.target.value })} style={inputStyle}>
                <option value="">Select client...</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div><label style={labelStyle}>Bill Rate ($/hr)</label><input type="number" step="0.01" value={form.bill_rate} onChange={e => setForm({ ...form, bill_rate: e.target.value })} required style={inputStyle} /></div>
            <div><label style={labelStyle}>Probability</label>
              <select value={form.probability} onChange={e => setForm({ ...form, probability: e.target.value })} style={inputStyle}>
                {PROB_PRESETS.map(p => <option key={p.key} value={p.key}>{p.label} ({(p.weight * 100)}%)</option>)}
              </select>
            </div>
            <div><label style={labelStyle}>Est. Monthly Hours</label><input type="number" step="1" value={form.monthly_hours} onChange={e => setForm({ ...form, monthly_hours: e.target.value })} style={inputStyle} placeholder="Auto-creates allocations" /></div>
            <div><label style={labelStyle}>Start Date</label><input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} style={inputStyle} /></div>
            <div><label style={labelStyle}>End Date</label><input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} style={inputStyle} /></div>
            <div><label style={labelStyle}>Description</label><input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} style={inputStyle} /></div>
          </div>
          <button type="submit" disabled={saving} style={{
            padding: '8px 24px', background: BRAND.purple, color: BRAND.white,
            border: 'none', cursor: 'pointer', fontFamily: BRAND.font, fontSize: '13px',
          }}>{saving ? 'Adding...' : 'Add Opportunity'}</button>
        </form>
      )}

      {/* Pipeline table */}
      <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead><tr>
            {['Name','Type','Client','Bill Rate','Gross Revenue','Probability','Custom %','Weighted Revenue','Stage','Status'].map(h => (
              <th key={h} style={{ background: BRAND.purple, color: BRAND.white, padding: '10px 12px', textAlign: 'left', fontWeight: 400, whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {forecasts.filter(f => f.status !== 'lost').map((f, i) => {
              const rev = forecastRevenue[f.id] || { totalHours: 0, grossRev: 0 }
              const prob = getProb(f)
              const weighted = rev.grossRev * prob
              return (
                <tr key={f.id} style={{ background: i % 2 === 0 ? BRAND.white : BRAND.greyLight }}>
                  <td style={{ padding: '8px 12px', borderBottom: `1px solid ${BRAND.greyBorder}` }}>
                    <button onClick={() => onOpenOpportunity(f.id)} style={{
                      background: 'none', border: 'none', color: BRAND.purple, cursor: 'pointer',
                      fontFamily: BRAND.font, fontSize: 'inherit', padding: 0, textAlign: 'left',
                      textDecoration: 'underline', textDecorationColor: 'rgba(74,21,75,0.3)',
                    }}>{f.name}</button>
                  </td>
                  <td style={{ padding: '8px 12px', color: BRAND.coolGrey, borderBottom: `1px solid ${BRAND.greyBorder}`, fontSize: '12px' }}>{f.forecast_type === 'new_project' ? 'New' : 'CO'}</td>
                  <td style={{ padding: '8px 12px', color: BRAND.coolGrey, borderBottom: `1px solid ${BRAND.greyBorder}` }}>{clientMap[f.proposed_client_id] || '—'}</td>
                  <td style={{ padding: '8px 12px', color: BRAND.coolGrey, borderBottom: `1px solid ${BRAND.greyBorder}` }}>{formatCurrencyExact(f.bill_rate)}</td>
                  <td style={{ padding: '8px 12px', color: BRAND.coolGrey, borderBottom: `1px solid ${BRAND.greyBorder}` }}>{formatCurrency(rev.grossRev)}</td>
                  <td style={{ padding: '8px 12px', borderBottom: `1px solid ${BRAND.greyBorder}` }}><StatusBadge status={f.probability} map={probMap} /></td>
                  <td style={{ padding: '4px 8px', borderBottom: `1px solid ${BRAND.greyBorder}` }}>
                    <input type="number" min="0" max="100" step="5"
                      value={customProbs[f.id] !== undefined ? customProbs[f.id] : ''}
                      placeholder={`${(Number(f.probability_weight) * 100).toFixed(0)}%`}
                      onChange={e => {
                        const val = e.target.value
                        setCustomProbs(prev => val === '' ? (() => { const n = { ...prev }; delete n[f.id]; return n })() : { ...prev, [f.id]: Number(val) })
                      }}
                      style={{ width: '60px', padding: '4px 6px', border: `1px solid ${BRAND.greyBorder}`, fontFamily: BRAND.font, fontSize: '12px', color: BRAND.coolGrey }}
                    />
                  </td>
                  <td style={{ padding: '8px 12px', color: BRAND.teal, borderBottom: `1px solid ${BRAND.greyBorder}` }}>{formatCurrency(weighted)}</td>
                  <td style={{ padding: '8px 12px', borderBottom: `1px solid ${BRAND.greyBorder}` }}><StatusBadge status={f.pursuit_stage || 'identified'} map={pursuitStageMap} /></td>
                  <td style={{ padding: '8px 12px', borderBottom: `1px solid ${BRAND.greyBorder}` }}><StatusBadge status={f.status} map={statusMap} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ============================================================================
// SCENARIOS TAB
// ============================================================================
function ScenariosTab({ forecasts, forecastRevenue, forecastMonthlyRev, actualMonthlyRev, invoicedByMonth, getProb, budgetTarget, monthlyTarget, actualCostByMonth }) {
  // Monthly breakdown: actual (from hours grid) + weighted pipeline
  const monthlyData = useMemo(() => {
    return MONTHS_2026.map((m, idx) => {
      const confirmedRev = actualMonthlyRev[m] || 0
      const invoiced = invoicedByMonth[m] || 0

      let pipelineWeighted = 0
      forecasts.filter(f => f.status !== 'lost' && f.status !== 'won').forEach(f => {
        const monthRev = forecastMonthlyRev[f.id]?.[m] || 0
        pipelineWeighted += monthRev * getProb(f)
      })

      // Won forecasts at 100%
      let wonRev = 0
      forecasts.filter(f => f.status === 'won').forEach(f => {
        wonRev += forecastMonthlyRev[f.id]?.[m] || 0
      })

      const expectedTotal = confirmedRev + wonRev + pipelineWeighted

      return {
        month: m,
        label: MONTH_LABELS[idx],
        confirmed: confirmedRev,
        won: wonRev,
        pipeline: pipelineWeighted,
        expected: expectedTotal,
        invoiced,
        target: monthlyTarget,
        gap: expectedTotal - monthlyTarget,
        cost: actualCostByMonth[m] || 0,
        margin: expectedTotal - (actualCostByMonth[m] || 0),
      }
    })
  }, [forecasts, forecastMonthlyRev, actualMonthlyRev, invoicedByMonth, getProb, monthlyTarget])

  const totalExpected = monthlyData.reduce((s, m) => s + m.expected, 0)
  const totalConfirmed = monthlyData.reduce((s, m) => s + m.confirmed, 0)
  const totalPipeline = monthlyData.reduce((s, m) => s + m.pipeline, 0)
  const totalInvoiced = monthlyData.reduce((s, m) => s + m.invoiced, 0)
  const gapToBudget = totalExpected - budgetTarget

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        <KPICard label="Budget Target" value={formatCurrency(budgetTarget)} />
        <KPICard label="Confirmed Revenue" value={formatCurrency(totalConfirmed)} color={BRAND.green} subValue="From Hours Grid" />
        <KPICard label="Pipeline (weighted)" value={formatCurrency(totalPipeline)} color={BRAND.teal} subValue="Probability-adjusted" />
        <KPICard label="Expected Total" value={formatCurrency(totalExpected)} color={BRAND.purple} />
        <KPICard label="Gap to Budget" value={formatCurrency(gapToBudget)}
          color={gapToBudget >= 0 ? BRAND.green : BRAND.red}
          subValue={gapToBudget >= 0 ? 'On track' : 'Shortfall'} />
        <KPICard label="Total Invoiced" value={formatCurrency(totalInvoiced)} color={BRAND.teal} />
      </div>

      {/* Budget progress bar */}
      <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, padding: '20px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: BRAND.coolGrey, marginBottom: '8px' }}>
          <span>Expected vs Budget Target</span>
          <span>{formatPct(totalExpected / budgetTarget)} of target</span>
        </div>
        <div style={{ height: '24px', background: BRAND.greyLight, position: 'relative', overflow: 'hidden' }}>
          {/* Confirmed bar */}
          <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${Math.min((totalConfirmed / budgetTarget) * 100, 100)}%`, background: BRAND.green, zIndex: 3 }} />
          {/* Pipeline bar (stacked) */}
          <div style={{ position: 'absolute', left: `${(totalConfirmed / budgetTarget) * 100}%`, top: 0, height: '100%', width: `${Math.min((totalPipeline / budgetTarget) * 100, 100)}%`, background: BRAND.teal, opacity: 0.6, zIndex: 2 }} />
          {/* Target line */}
          <div style={{ position: 'absolute', left: '100%', top: 0, height: '100%', width: '2px', background: BRAND.purple, zIndex: 4 }} />
        </div>
        <div style={{ display: 'flex', gap: '20px', marginTop: '8px', fontSize: '11px', color: BRAND.coolGrey }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <div style={{ width: '10px', height: '10px', background: BRAND.green }} /> Confirmed
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <div style={{ width: '10px', height: '10px', background: BRAND.teal, opacity: 0.6 }} /> Pipeline (weighted)
          </div>
        </div>
      </div>

      {/* Monthly table */}
      <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead><tr>
            {['Month','Confirmed','Pipeline (wtd)','Expected Total','Target','Gap','Cost','Margin','Invoiced'].map(h => (
              <th key={h} style={{ background: BRAND.purple, color: BRAND.white, padding: '10px 14px', textAlign: 'left', fontWeight: 400, whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {monthlyData.map((row, idx) => (
              <tr key={row.month} style={{ background: idx % 2 === 0 ? BRAND.white : BRAND.greyLight }}>
                <td style={{ padding: '8px 14px', color: BRAND.coolGrey, borderBottom: `1px solid ${BRAND.greyBorder}` }}>{row.label} 2026</td>
                <td style={{ padding: '8px 14px', color: BRAND.green, borderBottom: `1px solid ${BRAND.greyBorder}` }}>{formatCurrency(row.confirmed)}</td>
                <td style={{ padding: '8px 14px', color: BRAND.teal, borderBottom: `1px solid ${BRAND.greyBorder}` }}>{formatCurrency(row.pipeline)}</td>
                <td style={{ padding: '8px 14px', color: BRAND.purple, borderBottom: `1px solid ${BRAND.greyBorder}` }}>{formatCurrency(row.expected)}</td>
                <td style={{ padding: '8px 14px', color: BRAND.coolGrey, borderBottom: `1px solid ${BRAND.greyBorder}` }}>{formatCurrency(row.target)}</td>
                <td style={{ padding: '8px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, color: row.gap >= 0 ? BRAND.green : BRAND.red }}>{formatCurrency(row.gap)}</td>
                <td style={{ padding: '8px 14px', color: BRAND.amber, borderBottom: `1px solid ${BRAND.greyBorder}` }}>{row.cost > 0 ? formatCurrency(row.cost) : '—'}</td>
                <td style={{ padding: '8px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, color: row.margin >= 0 ? BRAND.green : BRAND.red }}>{row.expected > 0 || row.cost > 0 ? formatCurrency(row.margin) : '—'}</td>
                <td style={{ padding: '8px 14px', color: BRAND.coolGrey, borderBottom: `1px solid ${BRAND.greyBorder}` }}>{row.invoiced > 0 ? formatCurrency(row.invoiced) : '—'}</td>
              </tr>
            ))}
            <tr style={{ borderTop: `2px solid ${BRAND.purple}` }}>
              <td style={{ padding: '8px 14px', color: BRAND.purple }}>Total</td>
              <td style={{ padding: '8px 14px', color: BRAND.green }}>{formatCurrency(totalConfirmed)}</td>
              <td style={{ padding: '8px 14px', color: BRAND.teal }}>{formatCurrency(totalPipeline)}</td>
              <td style={{ padding: '8px 14px', color: BRAND.purple }}>{formatCurrency(totalExpected)}</td>
              <td style={{ padding: '8px 14px', color: BRAND.coolGrey }}>{formatCurrency(budgetTarget)}</td>
              <td style={{ padding: '8px 14px', color: gapToBudget >= 0 ? BRAND.green : BRAND.red }}>{formatCurrency(gapToBudget)}</td>
              <td style={{ padding: '8px 14px', color: BRAND.amber }}>{formatCurrency(monthlyData.reduce((s, m) => s + m.cost, 0))}</td>
              <td style={{ padding: '8px 14px', color: (totalExpected - monthlyData.reduce((s, m) => s + m.cost, 0)) >= 0 ? BRAND.green : BRAND.red }}>{formatCurrency(totalExpected - monthlyData.reduce((s, m) => s + m.cost, 0))}</td>
              <td style={{ padding: '8px 14px', color: BRAND.coolGrey }}>{formatCurrency(totalInvoiced)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ============================================================================
// BUDGET FORECAST TAB
// ============================================================================
function BudgetForecastTab({ forecasts, forecastRevenue, forecastMonthlyRev, actualMonthlyRev, invoicedByMonth, getProb, budgetTarget, monthlyTarget, customProbs, resourceAllocRevByMonth, costByMonth, actualCostByMonth }) {
  const now = new Date()
  const currentMonth = now.getMonth() // 0-indexed

  // Split: YTD actual + remaining months forecast
  const ytdActual = MONTHS_2026.slice(0, currentMonth).reduce((s, m) => s + (actualMonthlyRev[m] || 0), 0)
  const ytdInvoiced = MONTHS_2026.slice(0, currentMonth).reduce((s, m) => s + (invoicedByMonth[m] || 0), 0)
  const ytdCost = MONTHS_2026.slice(0, currentMonth).reduce((s, m) => s + (actualCostByMonth[m] || 0), 0)
  const ytdMargin = ytdActual - ytdCost
  const ytdMarginPct = ytdActual > 0 ? ytdMargin / ytdActual : 0

  // Remaining months: confirmed work + weighted pipeline
  let remainingConfirmed = 0
  let remainingPipeline = 0

  MONTHS_2026.slice(currentMonth).forEach(m => {
    remainingConfirmed += actualMonthlyRev[m] || 0

    forecasts.filter(f => f.status !== 'lost' && f.status !== 'won').forEach(f => {
      remainingPipeline += (forecastMonthlyRev[f.id]?.[m] || 0) * getProb(f)
    })

    forecasts.filter(f => f.status === 'won').forEach(f => {
      remainingConfirmed += forecastMonthlyRev[f.id]?.[m] || 0
    })
  })

  const projectedEOY = ytdActual + remainingConfirmed + remainingPipeline
  const projectedWithoutPipeline = ytdActual + remainingConfirmed
  const gapWithPipeline = projectedEOY - budgetTarget
  const gapWithoutPipeline = projectedWithoutPipeline - budgetTarget

  // Revenue needed per remaining month to hit target
  const remainingMonths = 12 - currentMonth
  const neededPerMonth = remainingMonths > 0 ? (budgetTarget - ytdActual) / remainingMonths : 0
  const currentRunRate = currentMonth > 0 ? ytdActual / currentMonth : 0

  // Probability of hitting budget: simple heuristic based on gap
  const hitProbability = projectedEOY >= budgetTarget ? 'High'
    : projectedWithoutPipeline >= budgetTarget ? 'High (even without pipeline)'
    : projectedEOY >= budgetTarget * 0.9 ? 'Moderate'
    : projectedEOY >= budgetTarget * 0.75 ? 'Low'
    : 'At Risk'

  const hitColor = hitProbability.startsWith('High') ? BRAND.green
    : hitProbability === 'Moderate' ? BRAND.amber : BRAND.red

  return (
    <div>
      {/* Top KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        <KPICard label="Budget Target" value={formatCurrency(budgetTarget)} />
        <KPICard label="YTD Revenue" value={formatCurrency(ytdActual)} color={BRAND.green} subValue={`${currentMonth} months`} />
        <KPICard label="YTD Invoiced" value={formatCurrency(ytdInvoiced)} color={BRAND.teal} />
        <KPICard label="YTD Cost" value={formatCurrency(ytdCost)} color={BRAND.amber} subValue="Staff cost" />
        <KPICard label="YTD Margin" value={formatCurrency(ytdMargin)} color={ytdMargin >= 0 ? BRAND.green : BRAND.red} subValue={ytdActual > 0 ? `${(ytdMarginPct * 100).toFixed(1)}%` : '--'} />
        <KPICard label="Remaining (Confirmed)" value={formatCurrency(remainingConfirmed)} color={BRAND.blue} subValue={`${remainingMonths} months`} />
        <KPICard label="Remaining (Pipeline)" value={formatCurrency(remainingPipeline)} color={BRAND.amber} subValue="Weighted" />
      </div>

      {/* Projection card */}
      <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, padding: '24px', marginBottom: '24px' }}>
        <div style={{ fontSize: '16px', color: BRAND.purple, marginBottom: '16px' }}>End-of-Year Projection</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px', marginBottom: '20px' }}>
          <div style={{ padding: '16px', background: BRAND.greyLight }}>
            <div style={{ fontSize: '12px', color: BRAND.coolGrey, marginBottom: '4px' }}>Without Pipeline</div>
            <div style={{ fontSize: '22px', color: gapWithoutPipeline >= 0 ? BRAND.green : BRAND.red }}>
              {formatCurrency(projectedWithoutPipeline)}
            </div>
            <div style={{ fontSize: '12px', color: BRAND.coolGrey }}>
              {gapWithoutPipeline >= 0 ? `${formatCurrency(gapWithoutPipeline)} over target` : `${formatCurrency(Math.abs(gapWithoutPipeline))} shortfall`}
            </div>
          </div>
          <div style={{ padding: '16px', background: BRAND.greyLight }}>
            <div style={{ fontSize: '12px', color: BRAND.coolGrey, marginBottom: '4px' }}>With Pipeline (Expected)</div>
            <div style={{ fontSize: '22px', color: gapWithPipeline >= 0 ? BRAND.green : BRAND.red }}>
              {formatCurrency(projectedEOY)}
            </div>
            <div style={{ fontSize: '12px', color: BRAND.coolGrey }}>
              {gapWithPipeline >= 0 ? `${formatCurrency(gapWithPipeline)} over target` : `${formatCurrency(Math.abs(gapWithPipeline))} shortfall`}
            </div>
          </div>
          <div style={{ padding: '16px', background: BRAND.greyLight }}>
            <div style={{ fontSize: '12px', color: BRAND.coolGrey, marginBottom: '4px' }}>Likelihood of Hitting Budget</div>
            <div style={{ fontSize: '22px', color: hitColor }}>{hitProbability}</div>
          </div>
        </div>

        {/* Run rate analysis */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
          <div>
            <div style={{ fontSize: '12px', color: BRAND.coolGrey }}>Current Run Rate</div>
            <div style={{ fontSize: '18px', color: BRAND.purple }}>{formatCurrency(currentRunRate)}<span style={{ fontSize: '12px' }}>/month</span></div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: BRAND.coolGrey }}>Needed to Hit Budget</div>
            <div style={{ fontSize: '18px', color: neededPerMonth > currentRunRate * 1.2 ? BRAND.red : BRAND.coolGrey }}>
              {formatCurrency(neededPerMonth)}<span style={{ fontSize: '12px' }}>/month</span>
            </div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: BRAND.coolGrey }}>Gap per Month</div>
            <div style={{ fontSize: '18px', color: neededPerMonth > currentRunRate ? BRAND.red : BRAND.green }}>
              {formatCurrency(neededPerMonth - currentRunRate)}<span style={{ fontSize: '12px' }}>/month</span>
            </div>
          </div>
        </div>
      </div>

      {/* What-if scenarios */}
      <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, padding: '24px' }}>
        <div style={{ fontSize: '14px', color: BRAND.purple, marginBottom: '12px' }}>Pipeline Impact Analysis</div>
        <div style={{ fontSize: '13px', color: BRAND.coolGrey, marginBottom: '16px' }}>
          How each pipeline opportunity affects the end-of-year forecast:
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead><tr>
            {['Opportunity','Gross Revenue','Probability','Weighted Contribution','Impact on Gap'].map(h => (
              <th key={h} style={{ background: BRAND.purple, color: BRAND.white, padding: '8px 12px', textAlign: 'left', fontWeight: 400 }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {forecasts.filter(f => f.status !== 'lost' && f.status !== 'won').map((f, i) => {
              const rev = forecastRevenue[f.id] || { grossRev: 0 }
              const prob = getProb(f)
              const weighted = rev.grossRev * prob
              return (
                <tr key={f.id} style={{ background: i % 2 === 0 ? BRAND.white : BRAND.greyLight }}>
                  <td style={{ padding: '8px 12px', color: BRAND.purple, borderBottom: `1px solid ${BRAND.greyBorder}` }}>{f.name}</td>
                  <td style={{ padding: '8px 12px', color: BRAND.coolGrey, borderBottom: `1px solid ${BRAND.greyBorder}` }}>{formatCurrency(rev.grossRev)}</td>
                  <td style={{ padding: '8px 12px', borderBottom: `1px solid ${BRAND.greyBorder}` }}>
                    <StatusBadge status={f.probability} map={probMap} />
                    {customProbs[f.id] !== undefined && <span style={{ fontSize: '11px', color: BRAND.purple, marginLeft: '4px' }}>→ {customProbs[f.id]}%</span>}
                  </td>
                  <td style={{ padding: '8px 12px', color: BRAND.teal, borderBottom: `1px solid ${BRAND.greyBorder}` }}>{formatCurrency(weighted)}</td>
                  <td style={{ padding: '8px 12px', borderBottom: `1px solid ${BRAND.greyBorder}`, color: BRAND.green }}>
                    +{formatCurrency(weighted)} toward target
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Margin Analysis */}
      <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, padding: '24px', marginTop: '24px' }}>
        <div style={{ fontSize: '14px', color: BRAND.purple, marginBottom: '12px' }}>Margin Analysis (from Resource Allocations)</div>
        <div style={{ fontSize: '13px', color: BRAND.coolGrey, marginBottom: '16px' }}>
          Compares planned revenue against staff costs based on resource allocations and employee hourly rates.
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead><tr>
            {['Month', 'Planned Revenue', 'Staff Cost', 'Margin', 'Margin %'].map(h => (
              <th key={h} style={{ background: BRAND.purple, color: BRAND.white, padding: '8px 12px', textAlign: 'left', fontWeight: 400 }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {MONTHS_2026.map((m, idx) => {
              const rev = resourceAllocRevByMonth[m] || actualMonthlyRev[m] || 0
              const cost = costByMonth[m] || actualCostByMonth[m] || 0
              const margin = rev - cost
              const marginPct = rev > 0 ? (margin / rev) * 100 : 0
              return (
                <tr key={m} style={{ background: idx % 2 === 0 ? BRAND.white : BRAND.greyLight }}>
                  <td style={{ padding: '8px 12px', color: BRAND.coolGrey, borderBottom: `1px solid ${BRAND.greyBorder}` }}>{MONTH_LABELS[idx]} 2026</td>
                  <td style={{ padding: '8px 12px', color: BRAND.teal, borderBottom: `1px solid ${BRAND.greyBorder}` }}>{rev > 0 ? formatCurrency(rev) : '—'}</td>
                  <td style={{ padding: '8px 12px', color: BRAND.amber, borderBottom: `1px solid ${BRAND.greyBorder}` }}>{cost > 0 ? formatCurrency(cost) : '—'}</td>
                  <td style={{ padding: '8px 12px', color: margin >= 0 ? BRAND.green : BRAND.red, borderBottom: `1px solid ${BRAND.greyBorder}` }}>{rev > 0 || cost > 0 ? formatCurrency(margin) : '—'}</td>
                  <td style={{ padding: '8px 12px', color: marginPct >= 30 ? BRAND.green : marginPct >= 15 ? BRAND.amber : BRAND.red, borderBottom: `1px solid ${BRAND.greyBorder}` }}>{rev > 0 ? marginPct.toFixed(1) + '%' : '—'}</td>
                </tr>
              )
            })}
            {(() => {
              const totalRev = MONTHS_2026.reduce((s, m) => s + (resourceAllocRevByMonth[m] || actualMonthlyRev[m] || 0), 0)
              const totalCost = MONTHS_2026.reduce((s, m) => s + (costByMonth[m] || actualCostByMonth[m] || 0), 0)
              const totalMargin = totalRev - totalCost
              const totalMarginPct = totalRev > 0 ? (totalMargin / totalRev) * 100 : 0
              return (
                <tr style={{ borderTop: `2px solid ${BRAND.purple}` }}>
                  <td style={{ padding: '8px 12px', color: BRAND.purple, fontWeight: 500 }}>Total</td>
                  <td style={{ padding: '8px 12px', color: BRAND.teal, fontWeight: 500 }}>{formatCurrency(totalRev)}</td>
                  <td style={{ padding: '8px 12px', color: BRAND.amber, fontWeight: 500 }}>{formatCurrency(totalCost)}</td>
                  <td style={{ padding: '8px 12px', color: totalMargin >= 0 ? BRAND.green : BRAND.red, fontWeight: 500 }}>{formatCurrency(totalMargin)}</td>
                  <td style={{ padding: '8px 12px', color: totalMarginPct >= 30 ? BRAND.green : totalMarginPct >= 15 ? BRAND.amber : BRAND.red, fontWeight: 500 }}>{totalMarginPct.toFixed(1)}%</td>
                </tr>
              )
            })()}
          </tbody>
        </table>
      </div>
    </div>
  )
}


// ============================================================================
// CROSS-SELL TAB — Rich detail with activities, next actions, contacts
// ============================================================================
function CrossSellTab({ crossSells, clients, projects, loadAll, inputStyle, labelStyle }) {
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [expandedId, setExpandedId] = useState(null)
  const [filterStage, setFilterStage] = useState('active')
  const [form, setForm] = useState({
    title: '', client_id: '', source_project_id: '', target_service: '', target_sector: '',
    estimated_value: '', probability: 'medium', assigned_to_name: '', description: '',
  })

  // Next action form (inline per opportunity)
  const [showNextAction, setShowNextAction] = useState(null)
  const [nextActionForm, setNextActionForm] = useState({ action: '', due_date: '', owner: '' })

  const clientMap = {}
  clients.forEach(c => { clientMap[c.id] = c.name })
  const projectMap = {}
  projects.forEach(p => { projectMap[p.id] = p })

  const filtered = useMemo(() => {
    if (filterStage === 'active') return crossSells.filter(cs => !['won', 'lost', 'parked'].includes(cs.pursuit_stage))
    if (filterStage === 'all') return crossSells
    return crossSells.filter(cs => cs.pursuit_stage === filterStage)
  }, [crossSells, filterStage])

  const totalActive = crossSells.filter(cs => !['won', 'lost', 'parked'].includes(cs.pursuit_stage)).length
  const totalValue = crossSells.filter(cs => !['won', 'lost', 'parked'].includes(cs.pursuit_stage))
    .reduce((s, cs) => s + (Number(cs.estimated_value) || 0), 0)
  const weightedValue = crossSells.filter(cs => !['won', 'lost', 'parked'].includes(cs.pursuit_stage))
    .reduce((s, cs) => s + (Number(cs.estimated_value) || 0) * Number(cs.probability_weight), 0)
  const wonValue = crossSells.filter(cs => cs.pursuit_stage === 'won')
    .reduce((s, cs) => s + (Number(cs.estimated_value) || 0), 0)
  const wonCount = crossSells.filter(cs => cs.pursuit_stage === 'won').length

  // Stage funnel counts
  const stageCounts = useMemo(() => {
    const counts = {}
    crossSells.forEach(cs => { counts[cs.pursuit_stage] = (counts[cs.pursuit_stage] || 0) + 1 })
    return counts
  }, [crossSells])

  async function handleAdd(e) {
    e.preventDefault(); setSaving(true)
    const { error } = await supabase.from('cross_sell_opportunities').insert({
      sector_id: PCS_SECTOR_ID, title: form.title, client_id: form.client_id,
      source_project_id: form.source_project_id || null, target_service: form.target_service,
      target_sector: form.target_sector, estimated_value: form.estimated_value ? parseFloat(form.estimated_value) : null,
      probability: form.probability, assigned_to_name: form.assigned_to_name || null,
      description: form.description || null,
    })
    if (!error) {
      setForm({ title: '', client_id: '', source_project_id: '', target_service: '', target_sector: '',
        estimated_value: '', probability: 'medium', assigned_to_name: '', description: '' })
      setShowForm(false); loadAll()
    }
    setSaving(false)
  }

  async function updateStage(id, newStage) {
    const updates = { pursuit_stage: newStage }
    if (newStage === 'won') updates.won_date = new Date().toISOString().slice(0, 10)
    await supabase.from('cross_sell_opportunities').update(updates).eq('id', id)
    loadAll()
  }

  async function updateNotes(id, notes) {
    await supabase.from('cross_sell_opportunities').update({ notes }).eq('id', id)
    loadAll()
  }

  const pursuitStages = [
    { key: 'identified', label: 'Identified' }, { key: 'qualifying', label: 'Qualifying' },
    { key: 'introduced', label: 'Introduced' }, { key: 'proposal_prep', label: 'Proposal Prep' },
    { key: 'proposal_submitted', label: 'Submitted' }, { key: 'negotiation', label: 'Negotiation' },
  ]

  const selectStyle = {
    padding: '6px 10px', border: `1px solid ${BRAND.greyBorder}`,
    fontFamily: BRAND.font, fontSize: '13px', color: BRAND.coolGrey, background: BRAND.white,
  }

  const stageProbMap = {
    committed: { bg: '#E8F5E8', text: BRAND.green, label: 'Committed' },
    high: { bg: '#E8F4FD', text: BRAND.blue, label: 'High' },
    medium: { bg: '#FFF4E5', text: BRAND.amber, label: 'Medium' },
    low: { bg: '#FDECEC', text: BRAND.red, label: 'Low' },
  }

  return (
    <div>
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        <KPICard label="Active Opportunities" value={totalActive} />
        <KPICard label="Total Pipeline" value={formatCurrency(totalValue)} color={BRAND.teal} />
        <KPICard label="Weighted Value" value={formatCurrency(weightedValue)} color={BRAND.purple} />
        <KPICard label="Won" value={wonCount} color={BRAND.green} subValue={formatCurrency(wonValue)} />
      </div>

      {/* Stage funnel */}
      <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, padding: '16px 20px', marginBottom: '24px' }}>
        <div style={{ fontSize: '13px', color: BRAND.coolGrey, marginBottom: '12px' }}>Pursuit Stage Funnel</div>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'flex-end' }}>
          {pursuitStages.map((s, i) => {
            const count = stageCounts[s.key] || 0
            const maxCount = Math.max(...pursuitStages.map(st => stageCounts[st.key] || 0), 1)
            const height = Math.max((count / maxCount) * 60, 4)
            return (
              <div key={s.key} style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: '16px', color: count > 0 ? BRAND.purple : BRAND.coolGrey, marginBottom: '4px' }}>{count}</div>
                <div style={{ height: `${height}px`, background: count > 0 ? BRAND.purple : BRAND.greyLight, marginBottom: '6px' }} />
                <div style={{ fontSize: '10px', color: BRAND.coolGrey }}>{s.label}</div>
              </div>
            )
          })}
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: '16px', color: wonCount > 0 ? BRAND.green : BRAND.coolGrey, marginBottom: '4px' }}>{wonCount}</div>
            <div style={{ height: `${Math.max((wonCount / Math.max(...pursuitStages.map(st => stageCounts[st.key] || 0), 1)) * 60, 4)}px`, background: wonCount > 0 ? BRAND.green : BRAND.greyLight, marginBottom: '6px' }} />
            <div style={{ fontSize: '10px', color: BRAND.coolGrey }}>Won</div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div>
            <label style={{ fontSize: '12px', color: BRAND.coolGrey, display: 'block', marginBottom: '4px' }}>Filter</label>
            <select value={filterStage} onChange={e => setFilterStage(e.target.value)} style={selectStyle}>
              <option value="active">Active</option><option value="all">All</option>
              <option value="won">Won</option><option value="lost">Lost</option><option value="parked">Parked</option>
            </select>
          </div>
          <span style={{ fontSize: '12px', color: BRAND.coolGrey, alignSelf: 'flex-end' }}>
            {filtered.length} of {crossSells.length} opportunities
          </span>
        </div>
        <button onClick={() => setShowForm(!showForm)} style={{
          padding: '8px 20px', background: BRAND.purple, color: BRAND.white,
          border: 'none', cursor: 'pointer', fontFamily: BRAND.font, fontSize: '13px',
        }}>{showForm ? 'Cancel' : 'Add Opportunity'}</button>
      </div>

      {/* Add form */}
      {showForm && (
        <form onSubmit={handleAdd} style={{ background: BRAND.purpleLight, border: `1px solid ${BRAND.greyBorder}`, padding: '20px', marginBottom: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div><label style={labelStyle}>Title</label><input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required style={inputStyle} /></div>
            <div><label style={labelStyle}>Client</label>
              <select value={form.client_id} onChange={e => setForm({ ...form, client_id: e.target.value })} required style={inputStyle}>
                <option value="">Select client...</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div><label style={labelStyle}>Source Project</label>
              <select value={form.source_project_id} onChange={e => setForm({ ...form, source_project_id: e.target.value })} style={inputStyle}>
                <option value="">None</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
              </select>
            </div>
            <div><label style={labelStyle}>Target Service</label><input value={form.target_service} onChange={e => setForm({ ...form, target_service: e.target.value })} required style={inputStyle} placeholder="e.g. Project Controls" /></div>
            <div><label style={labelStyle}>Target Sector</label><input value={form.target_sector} onChange={e => setForm({ ...form, target_sector: e.target.value })} required style={inputStyle} placeholder="e.g. Infrastructure" /></div>
            <div><label style={labelStyle}>Estimated Value</label><input type="number" step="0.01" value={form.estimated_value} onChange={e => setForm({ ...form, estimated_value: e.target.value })} style={inputStyle} /></div>
            <div><label style={labelStyle}>Probability</label>
              <select value={form.probability} onChange={e => setForm({ ...form, probability: e.target.value })} style={inputStyle}>
                <option value="committed">Committed (100%)</option><option value="high">High (75%)</option>
                <option value="medium">Medium (50%)</option><option value="low">Low (25%)</option>
              </select>
            </div>
            <div><label style={labelStyle}>Owner</label><input value={form.assigned_to_name} onChange={e => setForm({ ...form, assigned_to_name: e.target.value })} style={inputStyle} /></div>
            <div><label style={labelStyle}>Description</label><input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} style={inputStyle} /></div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" onClick={() => setShowForm(false)} style={{ padding: '8px 20px', background: BRAND.white, color: BRAND.coolGrey, border: `1px solid ${BRAND.greyBorder}`, cursor: 'pointer', fontFamily: BRAND.font, fontSize: '13px' }}>Cancel</button>
            <button type="submit" disabled={saving} style={{ padding: '8px 20px', background: BRAND.purple, color: BRAND.white, border: 'none', cursor: 'pointer', fontFamily: BRAND.font, fontSize: '13px' }}>{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </form>
      )}

      {/* Opportunities — expandable cards */}
      {filtered.length === 0 ? (
        <div style={{ padding: '40px 24px', color: BRAND.coolGrey, fontSize: '14px', background: BRAND.white, border: `1px solid ${BRAND.greyBorder}` }}>
          No cross-sell opportunities match the current filter.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {filtered.map(cs => {
            const isExpanded = expandedId === cs.id
            const proj = projectMap[cs.source_project_id]
            const daysSinceUpdate = Math.floor((Date.now() - new Date(cs.updated_at).getTime()) / (1000 * 60 * 60 * 24))
            const isStale = daysSinceUpdate > 14

            return (
              <div key={cs.id} style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}` }}>
                {/* Header row */}
                <div onClick={() => setExpandedId(isExpanded ? null : cs.id)}
                  style={{ padding: '14px 20px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '14px', color: BRAND.purple, marginBottom: '4px' }}>{cs.title}</div>
                    <div style={{ fontSize: '12px', color: BRAND.coolGrey, display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                      <span><ClientLink id={cs.client_id}>{clientMap[cs.client_id] || '—'}</ClientLink></span>
                      <span>{cs.target_service} / {cs.target_sector}</span>
                      {proj && <span>from <ProjectLink id={proj.id}>{proj.code}</ProjectLink></span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexShrink: 0 }}>
                    {cs.estimated_value && <span style={{ fontSize: '14px', color: BRAND.teal }}>{formatCurrency(cs.estimated_value)}</span>}
                    <StatusBadge status={cs.probability} map={stageProbMap} />
                    <select value={cs.pursuit_stage} onClick={e => e.stopPropagation()} onChange={e => updateStage(cs.id, e.target.value)} style={{
                      padding: '3px 8px', border: `1px solid ${BRAND.greyBorder}`, fontFamily: BRAND.font,
                      fontSize: '12px', color: BRAND.coolGrey, background: BRAND.white, cursor: 'pointer',
                    }}>
                      <option value="identified">Identified</option><option value="qualifying">Qualifying</option>
                      <option value="introduced">Introduced</option><option value="proposal_prep">Proposal Prep</option>
                      <option value="proposal_submitted">Submitted</option><option value="negotiation">Negotiation</option>
                      <option value="won">Won</option><option value="lost">Lost</option><option value="parked">Parked</option>
                    </select>
                    {isStale && <span style={{ fontSize: '11px', color: BRAND.red }}>Stale ({daysSinceUpdate}d)</span>}
                    <span style={{ fontSize: '14px', color: BRAND.coolGrey }}>{isExpanded ? '−' : '+'}</span>
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div style={{ borderTop: `1px solid ${BRAND.greyBorder}`, padding: '20px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '16px', marginBottom: '20px', fontSize: '13px' }}>
                      <div>
                        <span style={{ fontSize: '12px', color: BRAND.coolGrey, display: 'block', marginBottom: '4px' }}>Owner</span>
                        {cs.assigned_to_name || '—'}
                      </div>
                      <div>
                        <span style={{ fontSize: '12px', color: BRAND.coolGrey, display: 'block', marginBottom: '4px' }}>Identified</span>
                        {formatDate(cs.identified_date)}
                      </div>
                      <div>
                        <span style={{ fontSize: '12px', color: BRAND.coolGrey, display: 'block', marginBottom: '4px' }}>Last Updated</span>
                        <span style={{ color: isStale ? BRAND.red : BRAND.coolGrey }}>{formatDate(cs.updated_at)}</span>
                      </div>
                      <div>
                        <span style={{ fontSize: '12px', color: BRAND.coolGrey, display: 'block', marginBottom: '4px' }}>Won Date</span>
                        {cs.won_date ? formatDate(cs.won_date) : '—'}
                      </div>
                    </div>

                    {cs.description && (
                      <div style={{ fontSize: '13px', color: BRAND.coolGrey, marginBottom: '16px', padding: '12px 16px', background: BRAND.greyLight }}>
                        {cs.description}
                      </div>
                    )}

                    {/* Notes / Activity log */}
                    <div style={{ marginBottom: '16px' }}>
                      <div style={{ fontSize: '13px', color: BRAND.purple, marginBottom: '8px' }}>Notes and Activity</div>
                      <textarea
                        defaultValue={cs.notes || ''}
                        onBlur={e => { if (e.target.value !== (cs.notes || '')) updateNotes(cs.id, e.target.value) }}
                        placeholder="Log activities, next steps, contacts, strategy notes here. Updates save automatically when you click away."
                        style={{
                          width: '100%', minHeight: '100px', padding: '12px', border: `1px solid ${BRAND.greyBorder}`,
                          fontFamily: BRAND.font, fontSize: '13px', color: BRAND.coolGrey, boxSizing: 'border-box',
                          resize: 'vertical', background: BRAND.white,
                        }}
                      />
                      <div style={{ fontSize: '11px', color: BRAND.coolGrey, marginTop: '4px' }}>
                        Track contacts, meetings held, proposals sent, next actions, and competitor intelligence. Saves on blur.
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
