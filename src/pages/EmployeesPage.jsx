import { useState } from 'react'
import { BRAND } from '../lib/brand'
import { formatCurrencyExact, formatPct, formatDate, formatCurrency } from '../lib/utils'
import { useEmployees } from '../hooks/useData'
import { KPICard, StatusBadge, SectionHeader, LoadingState, activeStatusMap, EmployeeLink } from '../components/SharedUI'

export default function EmployeesPage() {
  const { data: employees, loading } = useEmployees()
  const [filter, setFilter] = useState('all')

  if (loading) return <LoadingState message="Loading employees..." />

  const roles = [...new Set(employees.map(e => e.role))]
  const filtered = filter === 'all' ? employees : employees.filter(e => e.role === filter)
  const internal = filtered.filter(e => !e.is_cross_charge)
  const crossCharge = filtered.filter(e => e.is_cross_charge)
  const avgCost = filtered.length > 0 ? filtered.reduce((s, e) => s + Number(e.hourly_cost), 0) / filtered.length : 0

  return (
    <div>
      <SectionHeader
        title="People"
        subtitle={`${filtered.length} employees${crossCharge.length > 0 ? ` (${internal.length} internal, ${crossCharge.length} cross-charge)` : ''}`}
        action={
          <select value={filter} onChange={e => setFilter(e.target.value)} style={{
            padding: '6px 12px', border: `1px solid ${BRAND.greyBorder}`, background: BRAND.white,
            color: BRAND.coolGrey, fontFamily: BRAND.font, fontSize: '13px',
          }}>
            <option value="all">All roles</option>
            {roles.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        }
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        <KPICard label="Headcount" value={filtered.length} />
        <KPICard label="Avg Hourly Cost" value={formatCurrencyExact(avgCost)} />
        <KPICard label="Total Annual Cost" value={formatCurrency(filtered.reduce((s, e) => s + Number(e.hourly_cost) * 2080, 0))} subValue="2,080 hrs/yr" />
      </div>

      <EmployeeTable title="Internal Employees" employees={internal} />
      {crossCharge.length > 0 && <EmployeeTable title="Cross-Charge Employees" employees={crossCharge} showSector />}
    </div>
  )
}

function EmployeeTable({ title, employees, showSector }) {
  if (employees.length === 0) return null

  const headers = ['Code', 'Name', 'Role', 'Hourly Cost', 'Target Util.', 'Start Date', 'Status']
  if (showSector) headers.splice(3, 0, 'From Sector')

  return (
    <div style={{ marginBottom: '24px' }}>
      <span style={{ fontSize: '13px', color: BRAND.coolGrey, display: 'block', marginBottom: '8px' }}>{title}</span>
      <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
          <thead><tr>
            {headers.map(h => (
              <th key={h} style={{ background: BRAND.purple, color: BRAND.white, padding: '10px 14px', textAlign: 'left', fontWeight: 400, whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {employees.map((emp, i) => (
              <tr key={emp.id} style={{ background: i % 2 === 0 ? BRAND.white : BRAND.greyLight }}>
                <td style={{ padding: '10px 14px', color: BRAND.coolGrey, borderBottom: `1px solid ${BRAND.greyBorder}` }}>{emp.employee_code}</td>
                <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}` }}><EmployeeLink id={emp.id}>{emp.name}</EmployeeLink></td>
                <td style={{ padding: '10px 14px', color: BRAND.coolGrey, borderBottom: `1px solid ${BRAND.greyBorder}` }}>{emp.role}</td>
                {showSector && <td style={{ padding: '10px 14px', color: BRAND.coolGrey, borderBottom: `1px solid ${BRAND.greyBorder}` }}>{emp.originating_sector || '—'}</td>}
                <td style={{ padding: '10px 14px', color: BRAND.coolGrey, borderBottom: `1px solid ${BRAND.greyBorder}` }}>{formatCurrencyExact(emp.hourly_cost)}</td>
                <td style={{ padding: '10px 14px', color: BRAND.coolGrey, borderBottom: `1px solid ${BRAND.greyBorder}` }}>{formatPct(emp.target_utilization)}</td>
                <td style={{ padding: '10px 14px', color: BRAND.coolGrey, borderBottom: `1px solid ${BRAND.greyBorder}` }}>{formatDate(emp.start_date)}</td>
                <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}` }}>
                  <StatusBadge status={emp.is_active ? 'active' : 'inactive'} map={{
                    active: { bg: '#E8F5E8', text: BRAND.green, label: 'Active' },
                    inactive: { bg: BRAND.greyLight, text: BRAND.coolGrey, label: 'Inactive' },
                  }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
