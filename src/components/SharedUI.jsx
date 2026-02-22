import { BRAND } from '../lib/brand'
import { useNav } from '../hooks/useNav'

// ============================================================================
// Navigation Links — clickable names that drill into profiles
// ============================================================================
export function ProjectLink({ id, children }) {
  const { openProject } = useNav()
  return <button onClick={(e) => { e.stopPropagation(); openProject(id) }} style={{ background: 'none', border: 'none', color: BRAND.purple, cursor: 'pointer', fontFamily: BRAND.font, fontSize: 'inherit', padding: 0, textAlign: 'left', textDecoration: 'underline', textDecorationColor: 'rgba(74,21,75,0.3)', fontWeight: 400 }}>{children}</button>
}

export function EmployeeLink({ id, children }) {
  const { openEmployee } = useNav()
  return <button onClick={(e) => { e.stopPropagation(); openEmployee(id) }} style={{ background: 'none', border: 'none', color: BRAND.purple, cursor: 'pointer', fontFamily: BRAND.font, fontSize: 'inherit', padding: 0, textAlign: 'left', textDecoration: 'underline', textDecorationColor: 'rgba(74,21,75,0.3)', fontWeight: 400 }}>{children}</button>
}

export function ClientLink({ id, children }) {
  const { openClient } = useNav()
  return <button onClick={(e) => { e.stopPropagation(); openClient(id) }} style={{ background: 'none', border: 'none', color: BRAND.purple, cursor: 'pointer', fontFamily: BRAND.font, fontSize: 'inherit', padding: 0, textAlign: 'left', textDecoration: 'underline', textDecorationColor: 'rgba(74,21,75,0.3)', fontWeight: 400 }}>{children}</button>
}

// ============================================================================
// KPI Card
// ============================================================================
export function KPICard({ label, value, subValue, color }) {
  return (
    <div style={{
      background: BRAND.white,
      border: `1px solid ${BRAND.greyBorder}`,
      padding: '20px 24px',
      display: 'flex',
      flexDirection: 'column',
      gap: '6px',
    }}>
      <span style={{ fontSize: '13px', color: BRAND.coolGrey, letterSpacing: '0.02em' }}>{label}</span>
      <span style={{ fontSize: '28px', color: color || BRAND.purple, letterSpacing: '-0.01em' }}>{value}</span>
      {subValue && <span style={{ fontSize: '12px', color: BRAND.coolGrey }}>{subValue}</span>}
    </div>
  )
}

// ============================================================================
// Data Table (purple header, alternating rows)
// ============================================================================
export function DataTable({ columns, data, emptyMessage = 'No data available' }) {
  if (!data || data.length === 0) {
    return (
      <div style={{ padding: '40px 24px', textAlign: 'left', color: BRAND.coolGrey, fontSize: '14px' }}>
        {emptyMessage}
      </div>
    )
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
        <thead>
          <tr>
            {columns.map((col, i) => (
              <th key={i} style={{
                background: BRAND.purple,
                color: BRAND.white,
                padding: '10px 14px',
                textAlign: 'left',
                fontWeight: 400,
                whiteSpace: 'nowrap',
                letterSpacing: '0.01em',
              }}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, rowIdx) => (
            <tr key={rowIdx} style={{
              background: rowIdx % 2 === 0 ? BRAND.white : BRAND.greyLight,
            }}>
              {columns.map((col, colIdx) => (
                <td key={colIdx} style={{
                  padding: '10px 14px',
                  color: BRAND.coolGrey,
                  textAlign: 'left',
                  borderBottom: `1px solid ${BRAND.greyBorder}`,
                  whiteSpace: col.nowrap ? 'nowrap' : 'normal',
                }}>
                  {col.render ? col.render(row) : row[col.accessor]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ============================================================================
// Status Badge
// ============================================================================
export function StatusBadge({ status, map }) {
  const config = map[status] || { bg: BRAND.greyLight, text: BRAND.coolGrey, label: status }
  return (
    <span style={{
      display: 'inline-block',
      padding: '3px 10px',
      fontSize: '12px',
      background: config.bg,
      color: config.text,
      letterSpacing: '0.02em',
    }}>
      {config.label || status}
    </span>
  )
}

// ============================================================================
// Section Header
// ============================================================================
export function SectionHeader({ title, subtitle, action }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '16px' }}>
      <div>
        <h2 style={{ fontSize: '20px', color: BRAND.purple, margin: 0, fontWeight: 400 }}>{title}</h2>
        {subtitle && <p style={{ fontSize: '13px', color: BRAND.coolGrey, margin: '4px 0 0' }}>{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

// ============================================================================
// Loading Spinner
// ============================================================================
export function LoadingState({ message = 'Loading...' }) {
  return (
    <div style={{ padding: '40px 24px', color: BRAND.coolGrey, fontSize: '14px' }}>
      {message}
    </div>
  )
}

// ============================================================================
// Error State
// ============================================================================
export function ErrorState({ message }) {
  return (
    <div style={{ padding: '20px 24px', background: '#FDECEC', color: BRAND.red, fontSize: '14px' }}>
      {message || 'An error occurred while loading data.'}
    </div>
  )
}

// ============================================================================
// Status Maps (shared across pages)
// ============================================================================
export const invoiceStatusMap = {
  draft: { bg: BRAND.greyLight, text: BRAND.coolGrey, label: 'Draft' },
  sent: { bg: '#E8F4FD', text: BRAND.blue, label: 'Sent' },
  paid: { bg: '#E8F5E8', text: BRAND.green, label: 'Paid' },
  overdue: { bg: '#FDECEC', text: BRAND.red, label: 'Overdue' },
}

export const clientStatusMap = {
  active: { bg: '#E8F5E8', text: BRAND.green, label: 'Active' },
  pipeline: { bg: '#FFF4E5', text: BRAND.amber, label: 'Pipeline' },
  closed: { bg: BRAND.greyLight, text: BRAND.coolGrey, label: 'Closed' },
}

export const probabilityMap = {
  committed: { bg: '#E8F5E8', text: BRAND.green, label: 'Committed (100%)' },
  high: { bg: '#E8F4FD', text: BRAND.blue, label: 'High (75%)' },
  medium: { bg: '#FFF4E5', text: BRAND.amber, label: 'Medium (50%)' },
  low: { bg: '#FDECEC', text: BRAND.red, label: 'Low (25%)' },
}

export const projectTypeMap = {
  billable: { bg: '#E8F5E8', text: BRAND.green, label: 'Billable' },
  overhead: { bg: BRAND.greyLight, text: BRAND.coolGrey, label: 'Overhead' },
}

export const activeStatusMap = {
  active: { bg: '#E8F5E8', text: BRAND.green, label: 'Active' },
  inactive: { bg: BRAND.greyLight, text: BRAND.coolGrey, label: 'Inactive' },
}
