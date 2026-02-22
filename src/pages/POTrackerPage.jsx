import { useState, useEffect, useMemo } from 'react'
import { BRAND } from '../lib/brand'
import { formatCurrency, formatCurrencyExact, formatDate, formatPct } from '../lib/utils'
import { supabase } from '../lib/supabase'
import { PCS_SECTOR_ID } from '../hooks/useData'
import { SectionHeader, LoadingState, KPICard, StatusBadge } from '../components/SharedUI'
import { SimpleBarChart } from '../components/Charts'

export default function POTrackerPage({ embedded }) {
  const [workOrders, setWorkOrders] = useState([])
  const [invoices, setInvoices] = useState([])
  const [weeklyHours, setWeeklyHours] = useState([])
  const [rateLines, setRateLines] = useState([])
  const [timesheets, setTimesheets] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    const [woRes, invRes, pwhRes, rlRes, tsRes] = await Promise.all([
      supabase.from('work_orders').select('*, clients(name)').eq('sector_id', PCS_SECTOR_ID).order('created_at'),
      supabase.from('invoices').select('*').eq('sector_id', PCS_SECTOR_ID),
      supabase.from('planned_weekly_hours').select('employee_id, project_id, week_ending, planned_hours, rate_line_id, projects(work_order_id)').eq('sector_id', PCS_SECTOR_ID),
      supabase.from('work_order_rate_lines').select('*').eq('sector_id', PCS_SECTOR_ID),
      supabase.from('timesheet_entries').select('employee_id, project_id, week_ending, hours, projects(work_order_id)').eq('sector_id', PCS_SECTOR_ID),
    ])
    setWorkOrders(woRes.data || [])
    setInvoices(invRes.data || [])
    setWeeklyHours(pwhRes.data || [])
    setRateLines(rlRes.data || [])
    setTimesheets(tsRes.data || [])
    setLoading(false)
  }

  // Build rate line lookup
  const rlMap = useMemo(() => {
    const m = {}
    rateLines.forEach(rl => { m[rl.id] = rl })
    return m
  }, [rateLines])

  // Default rate line per WO (for entries without explicit rate_line_id)
  const defaultRLByWO = useMemo(() => {
    const m = {}
    rateLines.forEach(rl => { if (rl.is_default) m[rl.work_order_id] = rl })
    return m
  }, [rateLines])

  // Current month boundary for accrual logic
  const now = new Date()
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  // Calculate metrics per work order
  const woMetrics = useMemo(() => {
    return workOrders.map(wo => {
      const poValue = Number(wo.budget) || 0

      // Invoiced: sum of all invoices for this client (sent + paid)
      const woInvoices = invoices.filter(i => i.client_id === wo.client_id && (i.status === 'sent' || i.status === 'paid' || i.status === 'overdue'))
      const invoicedTotal = woInvoices.reduce((s, i) => s + Number(i.amount), 0)

      // Monthly invoice breakdown
      const invoiceByMonth = {}
      woInvoices.forEach(i => {
        const m = i.billing_month?.slice(0, 7) || 'unknown'
        invoiceByMonth[m] = (invoiceByMonth[m] || 0) + Number(i.amount)
      })

      // Accrued: for each planned_weekly_hours entry linked to this WO
      // Use actuals if timesheet data exists for that employee+project+week, else use planned
      const woPlanned = weeklyHours.filter(h => h.projects?.work_order_id === wo.id)
      const woActuals = timesheets.filter(t => t.projects?.work_order_id === wo.id)

      // Build actuals lookup: empId|projId|weekEnding -> hours
      const actualLookup = {}
      woActuals.forEach(a => {
        actualLookup[`${a.employee_id}|${a.project_id}|${a.week_ending}`] = Number(a.hours)
      })

      let accruedTotal = 0
      const accruedByMonth = {}

      woPlanned.forEach(h => {
        const weekDate = new Date(h.week_ending)
        // Only accrue for past and current months (not future)
        if (weekDate >= currentMonthStart) return

        const monthKey = h.week_ending.slice(0, 7)
        const actualKey = `${h.employee_id}|${h.project_id}|${h.week_ending}`
        const hours = actualLookup[actualKey] !== undefined ? actualLookup[actualKey] : Number(h.planned_hours)

        // Get bill rate from rate line
        const rl = h.rate_line_id ? rlMap[h.rate_line_id] : defaultRLByWO[wo.id]
        const rate = rl ? Number(rl.bill_rate) : 0

        const amount = hours * rate
        accruedTotal += amount
        accruedByMonth[monthKey] = (accruedByMonth[monthKey] || 0) + amount
      })

      // Also count actuals that don't have a planned entry
      woActuals.forEach(a => {
        const weekDate = new Date(a.week_ending)
        if (weekDate >= currentMonthStart) return

        const plannedExists = woPlanned.some(h =>
          h.employee_id === a.employee_id && h.project_id === a.project_id && h.week_ending === a.week_ending
        )
        if (!plannedExists) {
          const monthKey = a.week_ending.slice(0, 7)
          const rl = defaultRLByWO[wo.id]
          const rate = rl ? Number(rl.bill_rate) : 0
          const amount = Number(a.hours) * rate
          accruedTotal += amount
          accruedByMonth[monthKey] = (accruedByMonth[monthKey] || 0) + amount
        }
      })

      // Remaining balance
      const remaining = poValue - invoicedTotal

      // Variance (invoiced vs accrued)
      const variance = invoicedTotal - accruedTotal

      // Monthly burn rate (based on invoiced months)
      const invoiceMonths = Object.keys(invoiceByMonth).length
      const monthlyBurn = invoiceMonths > 0 ? invoicedTotal / invoiceMonths : 0

      // If no invoices yet, use accrued burn rate
      const accruedMonths = Object.keys(accruedByMonth).length
      const effectiveBurn = monthlyBurn > 0 ? monthlyBurn : (accruedMonths > 0 ? accruedTotal / accruedMonths : 0)

      // Months remaining at current burn
      const monthsRemaining = effectiveBurn > 0 ? remaining / effectiveBurn : null

      // Build monthly breakdown (union of all months)
      const allMonths = new Set([...Object.keys(invoiceByMonth), ...Object.keys(accruedByMonth)])
      const monthlyBreakdown = Array.from(allMonths).sort().map(m => ({
        month: m,
        accrued: accruedByMonth[m] || 0,
        invoiced: invoiceByMonth[m] || 0,
        variance: (invoiceByMonth[m] || 0) - (accruedByMonth[m] || 0),
      }))

      return {
        ...wo,
        poValue, invoicedTotal, accruedTotal, remaining, variance,
        monthlyBurn: effectiveBurn, monthsRemaining, monthlyBreakdown,
        burnPct: poValue > 0 ? invoicedTotal / poValue : 0,
      }
    })
  }, [workOrders, invoices, weeklyHours, timesheets, rlMap, defaultRLByWO])

  // Top-level KPIs across all WOs
  const totals = useMemo(() => {
    return woMetrics.reduce((t, w) => ({
      poValue: t.poValue + w.poValue,
      invoiced: t.invoiced + w.invoicedTotal,
      accrued: t.accrued + w.accruedTotal,
      remaining: t.remaining + w.remaining,
      variance: t.variance + w.variance,
    }), { poValue: 0, invoiced: 0, accrued: 0, remaining: 0, variance: 0 })
  }, [woMetrics])

  if (loading) return <LoadingState message="Loading PO tracker..." />

  return (
    <div>
      {!embedded && <SectionHeader title="PO Tracker" subtitle="Purchase order burn rates, accrued vs invoiced, and remaining balances" />}

      {/* Top-level KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        <KPICard label="Total PO Value" value={formatCurrency(totals.poValue)} />
        <KPICard label="Total Invoiced" value={formatCurrency(totals.invoiced)} color={BRAND.teal} />
        <KPICard label="Total Accrued" value={formatCurrency(totals.accrued)} color={BRAND.blue} />
        <KPICard label="Total Remaining" value={formatCurrency(totals.remaining)} color={totals.remaining < 0 ? BRAND.red : BRAND.green} />
        <KPICard label="Variance (Inv - Acc)" value={formatCurrency(totals.variance)}
          color={Math.abs(totals.variance) < 1000 ? BRAND.green : totals.variance > 0 ? BRAND.teal : BRAND.red}
          subValue={totals.variance > 0 ? 'Over-billed' : totals.variance < 0 ? 'Under-billed' : 'In balance'} />
      </div>

      {/* Per-WO cards */}
      {woMetrics.filter(w => w.poValue > 0).map(wo => (
        <div key={wo.id} style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, padding: '24px', marginBottom: '20px' }}>
          {/* WO header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
            <div>
              <div style={{ fontSize: '16px', color: BRAND.purple, marginBottom: '2px' }}>
                {wo.po_reference}{wo.name ? ` — ${wo.name}` : ''}
              </div>
              <div style={{ fontSize: '13px', color: BRAND.coolGrey }}>
                {wo.clients?.name} | {wo.start_date && formatDate(wo.start_date)}{wo.end_date && ` to ${formatDate(wo.end_date)}`}
              </div>
            </div>
            <StatusBadge status={wo.status} map={{
              active: { bg: '#E8F5E8', text: BRAND.green, label: 'Active' },
              pipeline: { bg: '#FFF4E5', text: BRAND.amber, label: 'Pipeline' },
              closed: { bg: BRAND.greyLight, text: BRAND.coolGrey, label: 'Closed' },
            }} />
          </div>

          {/* KPIs row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', marginBottom: '20px' }}>
            <KPICard label="PO Value" value={formatCurrency(wo.poValue)} />
            <KPICard label="Invoiced" value={formatCurrency(wo.invoicedTotal)} color={BRAND.teal} />
            <KPICard label="Accrued" value={formatCurrency(wo.accruedTotal)} color={BRAND.blue} />
            <KPICard label="Remaining" value={formatCurrency(wo.remaining)} color={wo.remaining < 0 ? BRAND.red : BRAND.green} />
            <KPICard label="Burn Rate / Month" value={wo.monthlyBurn > 0 ? formatCurrency(wo.monthlyBurn) : '—'} />
            <KPICard label="Months Remaining" value={wo.monthsRemaining !== null ? wo.monthsRemaining.toFixed(1) : '—'}
              color={wo.monthsRemaining !== null && wo.monthsRemaining < 3 ? BRAND.red : BRAND.coolGrey} />
            <KPICard label="Variance" value={formatCurrency(wo.variance)}
              color={wo.variance > 0 ? BRAND.teal : wo.variance < 0 ? BRAND.red : BRAND.green}
              subValue={wo.variance > 0 ? 'Over-billed' : wo.variance < 0 ? 'Under-billed' : 'Balanced'} />
          </div>

          {/* Burn progress bar */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: BRAND.coolGrey, marginBottom: '4px' }}>
              <span>PO Burn: {(wo.burnPct * 100).toFixed(1)}%</span>
              <span>{formatCurrency(wo.invoicedTotal)} of {formatCurrency(wo.poValue)}</span>
            </div>
            <div style={{ height: '8px', background: BRAND.greyLight, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${Math.min(wo.burnPct * 100, 100)}%`,
                background: wo.burnPct > 0.9 ? BRAND.red : wo.burnPct > 0.7 ? BRAND.amber : BRAND.green,
                transition: 'width 0.3s ease',
              }} />
            </div>
          </div>

          {/* Monthly breakdown table */}
          {wo.monthlyBreakdown.length > 0 && (
            <div>
              <span style={{ fontSize: '13px', color: BRAND.coolGrey, display: 'block', marginBottom: '8px' }}>Monthly Breakdown</span>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr>
                      {['Month', 'Accrued', 'Invoiced', 'Variance'].map(h => (
                        <th key={h} style={{ background: BRAND.purple, color: BRAND.white, padding: '8px 14px', textAlign: 'left', fontWeight: 400 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {wo.monthlyBreakdown.map((row, idx) => (
                      <tr key={row.month} style={{ background: idx % 2 === 0 ? BRAND.white : BRAND.greyLight }}>
                        <td style={{ padding: '8px 14px', color: BRAND.coolGrey, borderBottom: `1px solid ${BRAND.greyBorder}` }}>
                          {new Date(row.month + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                        </td>
                        <td style={{ padding: '8px 14px', color: BRAND.blue, borderBottom: `1px solid ${BRAND.greyBorder}` }}>
                          {formatCurrency(row.accrued)}
                        </td>
                        <td style={{ padding: '8px 14px', color: BRAND.teal, borderBottom: `1px solid ${BRAND.greyBorder}` }}>
                          {formatCurrency(row.invoiced)}
                        </td>
                        <td style={{ padding: '8px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`,
                          color: row.variance > 0 ? BRAND.teal : row.variance < 0 ? BRAND.red : BRAND.green,
                        }}>
                          {formatCurrency(row.variance)}
                          {row.variance !== 0 && (
                            <span style={{ fontSize: '11px', marginLeft: '4px' }}>
                              ({row.variance > 0 ? 'over' : 'under'})
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {/* Totals row */}
                    <tr style={{ borderTop: `2px solid ${BRAND.purple}` }}>
                      <td style={{ padding: '8px 14px', color: BRAND.purple }}>Total</td>
                      <td style={{ padding: '8px 14px', color: BRAND.blue }}>{formatCurrency(wo.accruedTotal)}</td>
                      <td style={{ padding: '8px 14px', color: BRAND.teal }}>{formatCurrency(wo.invoicedTotal)}</td>
                      <td style={{ padding: '8px 14px', color: wo.variance > 0 ? BRAND.teal : wo.variance < 0 ? BRAND.red : BRAND.green }}>{formatCurrency(wo.variance)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {wo.monthlyBreakdown.length === 0 && (
            <div style={{ fontSize: '13px', color: BRAND.coolGrey, padding: '12px 0' }}>
              No accrued or invoiced data yet. Enter hours in the Hours Grid and record invoices to see the monthly breakdown.
            </div>
          )}
        </div>
      ))}

      {woMetrics.filter(w => w.poValue > 0).length === 0 && (
        <div style={{ padding: '40px', background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, color: BRAND.coolGrey, fontSize: '14px' }}>
          No work orders with PO values found. Add work orders with budget amounts in the Admin page.
        </div>
      )}
    </div>
  )
}
