import { useState, useEffect } from 'react'
import { BRAND } from '../lib/brand'
import { formatCurrency, formatPct } from '../lib/utils'
import { supabase } from '../lib/supabase'
import { PCS_SECTOR_ID, useSectorSummary, useEmployees } from '../hooks/useData'
import { KPICard, SectionHeader, LoadingState } from '../components/SharedUI'

export default function DashboardPage({ onNavigate }) {
  const { data: summary, loading: sumLoading } = useSectorSummary()
  const { data: employees, loading: empLoading } = useEmployees()
  const [workOrders, setWorkOrders] = useState([])
  const [invoices, setInvoices] = useState([])
  const [forecasts, setForecasts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      supabase.from('work_orders').select('id, budget, status, clients(name), po_reference').eq('sector_id', PCS_SECTOR_ID),
      supabase.from('invoices').select('id, amount, status, due_date, client_id').eq('sector_id', PCS_SECTOR_ID),
      supabase.from('forecasts').select('id, name, status, probability, probability_weight').eq('sector_id', PCS_SECTOR_ID),
    ]).then(([woRes, invRes, fRes]) => {
      setWorkOrders(woRes.data || [])
      setInvoices(invRes.data || [])
      setForecasts(fRes.data || [])
      setLoading(false)
    })
  }, [])

  if (sumLoading || empLoading || loading) return <LoadingState message="Loading dashboard..." />

  const s = summary?.[0] || {}
  const budgetTarget = Number(s.annual_budget_target) || 4133424.68
  const totalPlannedRev = Number(s.total_planned_revenue) || 0
  const totalActualRev = Number(s.total_actual_revenue) || 0
  const totalPlannedCost = Number(s.total_planned_cost) || 0
  const totalActualCost = Number(s.total_actual_cost) || 0
  const plannedMargin = totalPlannedRev - totalPlannedCost
  const plannedMarginPct = Number(s.planned_margin_pct) || 0
  const actualMargin = totalActualRev - totalActualCost
  const actualMarginPct = Number(s.actual_margin_pct) || 0
  const headcount = Number(s.active_headcount) || employees.length
  const totalPO = workOrders.reduce((sum, w) => sum + Number(w.budget || 0), 0)
  const totalInvoiced = invoices.filter(i => i.status !== 'draft').reduce((sum, i) => sum + Number(i.amount), 0)
  const overdueInvoices = invoices.filter(i => i.status === 'overdue')
  const overdueAmount = overdueInvoices.reduce((sum, i) => sum + Number(i.amount), 0)
  const activePipeline = forecasts.filter(f => f.status !== 'lost' && f.status !== 'won')
  const budgetPct = budgetTarget > 0 ? totalInvoiced / budgetTarget : 0

  const alerts = []
  if (overdueInvoices.length > 0) alerts.push({ type: 'warning', text: `${overdueInvoices.length} overdue invoice(s) totalling ${formatCurrency(overdueAmount)}` })
  const highBurnWOs = workOrders.filter(w => {
    const b = Number(w.budget || 0)
    const inv = invoices.filter(i => i.client_id === w.client_id && i.status !== 'draft').reduce((s2, i) => s2 + Number(i.amount), 0)
    return b > 0 && (inv / b) > 0.85
  })
  if (highBurnWOs.length > 0) alerts.push({ type: 'warning', text: `${highBurnWOs.length} PO(s) over 85% burned` })

  const nav = (key) => onNavigate && onNavigate(key)

  const quickActions = [
    { label: 'Enter Hours', desc: 'Weekly planned hours per project', nav: 'hoursrevenue', color: BRAND.purple },
    { label: 'Record Invoice', desc: 'Log invoices against clients', nav: 'commercial', color: BRAND.teal },
    { label: 'Add Opportunity', desc: 'Pipeline forecast entry', nav: 'forecast', color: BRAND.green },
    { label: 'PO Tracker', desc: 'Burn rates and PO balances', nav: 'commercial', color: BRAND.blue },
    { label: 'Manage Work', desc: 'Projects, clients, work orders', nav: 'work', color: BRAND.amber },
    { label: 'Admin', desc: 'Add employees, rates, configuration', nav: 'admin', color: BRAND.coolGrey },
  ]

  return (
    <div>
      <SectionHeader title="Dashboard" subtitle="PCS — Procurement & Compliance Sector, FY 2026" />

      {alerts.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          {alerts.map((a, i) => (
            <div key={i} style={{
              padding: '10px 16px', marginBottom: '6px', fontSize: '13px',
              background: a.type === 'warning' ? '#FFF4E5' : '#E8F4FD',
              color: a.type === 'warning' ? BRAND.amber : BRAND.blue,
              borderLeft: `3px solid ${a.type === 'warning' ? BRAND.amber : BRAND.blue}`,
            }}>{a.text}</div>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        <KPICard label="Budget Target" value={formatCurrency(budgetTarget)} />
        <KPICard label="Total Invoiced" value={formatCurrency(totalInvoiced)} color={BRAND.teal} />
        <KPICard label="Planned Revenue" value={formatCurrency(totalPlannedRev)} color={BRAND.blue} />
        <KPICard label="Planned Cost" value={formatCurrency(totalPlannedCost)} />
        <KPICard label="Planned Margin" value={formatPct(plannedMarginPct)} subValue={formatCurrency(plannedMargin)} color={plannedMarginPct > 0.3 ? BRAND.green : plannedMarginPct > 0.15 ? BRAND.amber : BRAND.red} />
        <KPICard label="Active Headcount" value={headcount} />
      </div>

      {/* Sector Margin Summary */}
      <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, padding: '24px', marginBottom: '24px' }}>
        <div style={{ fontSize: '15px', color: BRAND.purple, marginBottom: '16px' }}>Sector Margin</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div style={{ padding: '16px', background: BRAND.greyLight }}>
            <div style={{ fontSize: '12px', color: BRAND.coolGrey, marginBottom: '8px' }}>Planned (Full Year)</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
              <div><div style={{ fontSize: '11px', color: BRAND.coolGrey }}>Revenue</div><div style={{ fontSize: '16px', color: BRAND.purple }}>{formatCurrency(totalPlannedRev)}</div></div>
              <div><div style={{ fontSize: '11px', color: BRAND.coolGrey }}>Cost</div><div style={{ fontSize: '16px', color: BRAND.coolGrey }}>{formatCurrency(totalPlannedCost)}</div></div>
              <div><div style={{ fontSize: '11px', color: BRAND.coolGrey }}>Margin</div><div style={{ fontSize: '16px', color: plannedMarginPct > 0.3 ? BRAND.green : BRAND.amber }}>{formatCurrency(plannedMargin)} ({formatPct(plannedMarginPct)})</div></div>
            </div>
          </div>
          <div style={{ padding: '16px', background: BRAND.greyLight }}>
            <div style={{ fontSize: '12px', color: BRAND.coolGrey, marginBottom: '8px' }}>Actual (YTD)</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
              <div><div style={{ fontSize: '11px', color: BRAND.coolGrey }}>Revenue</div><div style={{ fontSize: '16px', color: BRAND.teal }}>{formatCurrency(totalActualRev)}</div></div>
              <div><div style={{ fontSize: '11px', color: BRAND.coolGrey }}>Cost</div><div style={{ fontSize: '16px', color: BRAND.coolGrey }}>{formatCurrency(totalActualCost)}</div></div>
              <div><div style={{ fontSize: '11px', color: BRAND.coolGrey }}>Margin</div><div style={{ fontSize: '16px', color: actualMarginPct > 0.3 ? BRAND.green : BRAND.amber }}>{formatCurrency(actualMargin)} ({formatPct(actualMarginPct)})</div></div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, padding: '24px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <span style={{ fontSize: '15px', color: BRAND.purple }}>Budget Target Progress</span>
          <span style={{ fontSize: '14px', color: BRAND.coolGrey }}>{formatCurrency(totalInvoiced)} of {formatCurrency(budgetTarget)}</span>
        </div>
        <div style={{ height: '32px', background: BRAND.greyLight, position: 'relative', overflow: 'hidden', marginBottom: '8px' }}>
          <div style={{
            position: 'absolute', left: 0, top: 0, height: '100%',
            width: `${Math.min(budgetPct * 100, 100)}%`,
            background: budgetPct > 0.9 ? BRAND.green : budgetPct > 0.5 ? BRAND.teal : BRAND.amber,
            transition: 'width 0.5s ease',
          }} />
          {[...Array(12)].map((_, i) => (
            <div key={i} style={{ position: 'absolute', left: `${((i + 1) / 12) * 100}%`, top: 0, height: '100%', width: '1px', background: 'rgba(0,0,0,0.1)' }} />
          ))}
          <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: budgetPct > 0.4 ? BRAND.white : BRAND.coolGrey, fontSize: '13px', zIndex: 1 }}>
            {(budgetPct * 100).toFixed(1)}%
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: BRAND.coolGrey }}>
          <span>Jan</span><span>Mar</span><span>Jun</span><span>Sep</span><span>Dec</span>
        </div>
      </div>

      {overdueInvoices.length > 0 && (
        <div style={{ background: '#FDECEC', border: `1px solid ${BRAND.red}`, padding: '16px 20px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '14px', color: BRAND.red, marginBottom: '2px' }}>Overdue Invoices</div>
            <div style={{ fontSize: '13px', color: BRAND.coolGrey }}>{overdueInvoices.length} invoice(s) — {formatCurrency(overdueAmount)} outstanding</div>
          </div>
          <button onClick={() => nav('commercial')} style={{ padding: '6px 16px', background: BRAND.red, color: BRAND.white, border: 'none', cursor: 'pointer', fontFamily: BRAND.font, fontSize: '12px' }}>View Invoices</button>
        </div>
      )}

      <span style={{ fontSize: '15px', color: BRAND.purple, display: 'block', marginBottom: '12px' }}>Quick Actions</span>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
        {quickActions.map((qa, i) => (
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
