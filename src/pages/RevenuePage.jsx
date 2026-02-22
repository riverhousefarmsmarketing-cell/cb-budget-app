import { BRAND } from '../lib/brand'
import { formatCurrency, formatPct } from '../lib/utils'
import { useSectorSummary } from '../hooks/useData'
import { KPICard, SectionHeader, LoadingState } from '../components/SharedUI'

export default function RevenuePage({ embedded }) {
  const { data: summary, loading } = useSectorSummary()

  if (loading) return <LoadingState message="Loading revenue data..." />

  const s = summary?.[0] || {}

  return (
    <div>
      {!embedded && <SectionHeader title="Revenue — Plan vs Actual" subtitle="Billable revenue summary, FY 2026" />}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        <KPICard label="FY Planned Revenue" value={formatCurrency(s.total_planned_revenue)} />
        <KPICard label="YTD Actual Revenue" value={formatCurrency(s.total_actual_revenue)} color={BRAND.teal} />
        <KPICard label="FY Planned Cost" value={formatCurrency(s.total_planned_cost)} />
        <KPICard label="FY Planned Margin" value={formatPct(s.planned_margin_pct)} subValue={formatCurrency(s.planned_margin)} />
        <KPICard label="YTD Actual Margin" value={formatPct(s.actual_margin_pct)} subValue={formatCurrency(s.actual_margin)} color={BRAND.teal} />
      </div>

      <div style={{ padding: '24px', background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, color: BRAND.coolGrey, fontSize: '14px' }}>
        Monthly revenue charts will populate once resource allocations are entered. The v_sector_summary view calculates planned revenue from (planned_hours x bill_rate) and actual revenue from (actual_hours x bill_rate) for all billable projects.
      </div>
    </div>
  )
}
