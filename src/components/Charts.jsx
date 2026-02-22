import { BRAND } from '../lib/brand'
import { formatCurrency } from '../lib/utils'

// ============================================================================
// Simple Bar Chart
// ============================================================================
export function SimpleBarChart({ data, labelKey, valueKey, color = BRAND.teal, height = 200 }) {
  const maxVal = Math.max(...data.map(d => d[valueKey] || 0), 1)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height, paddingTop: '20px' }}>
      {data.map((d, i) => {
        const h = ((d[valueKey] || 0) / maxVal) * (height - 30)
        return (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontSize: '10px', color: BRAND.coolGrey }}>{formatCurrency(d[valueKey])}</span>
            <div style={{
              width: '100%',
              maxWidth: '48px',
              height: Math.max(h, 2),
              background: color,
              transition: 'height 0.3s ease',
            }} />
            <span style={{ fontSize: '11px', color: BRAND.coolGrey }}>{d[labelKey]}</span>
          </div>
        )
      })}
    </div>
  )
}

// ============================================================================
// Dual Bar Chart (Plan vs Actual)
// ============================================================================
export function DualBarChart({ data, labelKey, value1Key, value2Key, color1 = BRAND.teal, color2 = BRAND.amber, label1, label2, height = 200 }) {
  const maxVal = Math.max(...data.map(d => Math.max(d[value1Key] || 0, d[value2Key] || 0)), 1)
  return (
    <div>
      <div style={{ display: 'flex', gap: '16px', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '12px', height: '12px', background: color1 }} />
          <span style={{ fontSize: '12px', color: BRAND.coolGrey }}>{label1}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '12px', height: '12px', background: color2 }} />
          <span style={{ fontSize: '12px', color: BRAND.coolGrey }}>{label2}</span>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height, paddingTop: '20px' }}>
        {data.map((d, i) => {
          const h1 = ((d[value1Key] || 0) / maxVal) * (height - 30)
          const h2 = ((d[value2Key] || 0) / maxVal) * (height - 30)
          return (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
              <div style={{ display: 'flex', gap: '2px', alignItems: 'flex-end' }}>
                <div style={{ width: '18px', height: Math.max(h1, 2), background: color1 }} />
                <div style={{ width: '18px', height: Math.max(h2, 2), background: color2 }} />
              </div>
              <span style={{ fontSize: '11px', color: BRAND.coolGrey }}>{d[labelKey]}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
