import { useState, useMemo } from 'react'
import { BRAND, NO_RADIUS } from '../lib/brand'
import { Icon } from './Icons'

export function NotificationsBanner({ notifications = [], onDismiss }) {
  const [dismissed, setDismissed] = useState(new Set())
  const visible = useMemo(() => notifications.filter(n => !dismissed.has(n.id)), [notifications, dismissed])
  if (visible.length === 0) return null

  const dismiss = (id) => { setDismissed(prev => new Set([...prev, id])); onDismiss?.(id) }
  const typeStyles = {
    error:   { bg: '#FEF2F2', border: BRAND.dataRed,   icon: 'alertTriangle', color: BRAND.dataRed },
    warning: { bg: '#FFFBEB', border: BRAND.dataAmber,  icon: 'alertTriangle', color: BRAND.dataAmber },
    info:    { bg: '#EFF6FF', border: BRAND.dataBlue,   icon: 'info',          color: BRAND.dataBlue },
    success: { bg: '#ECFDF5', border: BRAND.dataGreen,  icon: 'checkCircle',   color: BRAND.dataGreen },
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
      {visible.map(n => {
        const s = typeStyles[n.type] || typeStyles.info
        return (
          <div key={n.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 16px', background: s.bg, borderLeft: `3px solid ${s.border}`, ...NO_RADIUS, fontSize: '13px', color: BRAND.coolGrey }}>
            <Icon name={s.icon} size={16} style={{ color: s.color, flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{n.message}</span>
            {n.action && (
              <button onClick={n.action} style={{ background: 'none', border: `1px solid ${s.border}`, color: s.color, padding: '4px 12px', fontSize: '12px', cursor: 'pointer', fontFamily: BRAND.font, ...NO_RADIUS }}>
                {n.actionLabel || 'View'}
              </button>
            )}
            <button onClick={() => dismiss(n.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: BRAND.greyMuted, padding: '2px' }}>
              <Icon name="x" size={14} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
