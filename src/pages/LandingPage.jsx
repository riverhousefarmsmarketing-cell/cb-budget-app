import { useState } from 'react'
import { BRAND } from '../lib/brand'

// ============================================================================
// Simple password gate for prototype demo access
// Password stored in sessionStorage so it persists during browsing session
// ============================================================================

const DEMO_PASSWORD = 'PCS2026'
const STORAGE_KEY = 'cb_demo_access'

export function isDemoAuthenticated() {
  try { return sessionStorage.getItem(STORAGE_KEY) === 'granted' } catch { return false }
}

export default function LandingPage({ onEnter }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState(false)
  const [shake, setShake] = useState(false)

  const handleSubmit = (e) => {
    e.preventDefault()
    if (password === DEMO_PASSWORD) {
      try { sessionStorage.setItem(STORAGE_KEY, 'granted') } catch {}
      onEnter()
    } else {
      setError(true)
      setShake(true)
      setTimeout(() => setShake(false), 500)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: BRAND.purple,
      fontFamily: BRAND.font,
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Subtle grid pattern overlay */}
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.04,
        backgroundImage: `linear-gradient(${BRAND.white} 1px, transparent 1px), linear-gradient(90deg, ${BRAND.white} 1px, transparent 1px)`,
        backgroundSize: '40px 40px',
      }} />

      {/* Main card */}
      <div style={{
        background: BRAND.white,
        border: `1px solid ${BRAND.greyBorder}`,
        padding: '56px 48px',
        width: '100%',
        maxWidth: '480px',
        position: 'relative',
        zIndex: 1,
        animation: shake ? 'shake 0.4s ease' : undefined,
      }}>
        {/* Branding header */}
        <div style={{ marginBottom: '8px' }}>
          <div style={{ fontSize: '13px', color: BRAND.coolGrey, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '8px' }}>
            BUDGET MANAGEMENT
          </div>
          <div style={{ fontSize: '28px', color: BRAND.purple, lineHeight: 1.2, marginBottom: '4px' }}>
            Budget Management
          </div>
          <div style={{ fontSize: '15px', color: BRAND.coolGrey }}>
            Procurement & Compliance Sector
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: '3px', background: BRAND.purple, width: '48px', margin: '24px 0' }} />

        {/* Description */}
        <div style={{ fontSize: '14px', color: BRAND.coolGrey, lineHeight: 1.6, marginBottom: '32px' }}>
          Sector-level budget tracking, margin analysis, resource allocation, pipeline forecasting, 
          and project management — built to replace the spreadsheet.
        </div>

        {/* Feature highlights */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '32px' }}>
          {[
            'Margin at 3 levels',
            'Resource heatmaps',
            'Pipeline forecasting',
            'PO burn tracking',
            'Meeting minutes',
            'RAID log',
            'Action tracker',
            'Quality management',
          ].map((f, i) => (
            <div key={i} style={{
              fontSize: '12px', color: BRAND.coolGrey, padding: '8px 12px',
              background: BRAND.greyLight, borderLeft: `2px solid ${BRAND.purple}`,
            }}>
              {f}
            </div>
          ))}
        </div>

        {/* Password form */}
        <form onSubmit={handleSubmit}>
          <label style={{ display: 'block', fontSize: '13px', color: BRAND.coolGrey, marginBottom: '8px' }}>
            Enter access code to continue
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="password"
              value={password}
              onChange={e => { setPassword(e.target.value); setError(false) }}
              placeholder="Access code"
              autoFocus
              style={{
                flex: 1,
                padding: '12px 14px',
                border: `1px solid ${error ? BRAND.red : BRAND.greyBorder}`,
                fontFamily: BRAND.font,
                fontSize: '14px',
                color: BRAND.coolGrey,
                outline: 'none',
                transition: 'border-color 0.2s',
              }}
              onFocus={e => e.target.style.borderColor = BRAND.purple}
              onBlur={e => e.target.style.borderColor = error ? BRAND.red : BRAND.greyBorder}
            />
            <button
              type="submit"
              style={{
                padding: '12px 28px',
                background: BRAND.purple,
                color: BRAND.white,
                border: 'none',
                cursor: 'pointer',
                fontFamily: BRAND.font,
                fontSize: '14px',
                letterSpacing: '0.02em',
                transition: 'opacity 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.opacity = '0.9'}
              onMouseLeave={e => e.currentTarget.style.opacity = '1'}
            >
              Enter
            </button>
          </div>
          {error && (
            <div style={{ fontSize: '12px', color: BRAND.red, marginTop: '8px' }}>
              Incorrect access code. Please try again.
            </div>
          )}
        </form>

        {/* Footer */}
        <div style={{ marginTop: '32px', paddingTop: '20px', borderTop: `1px solid ${BRAND.greyBorder}` }}>
          <div style={{ fontSize: '12px', color: BRAND.coolGrey, lineHeight: 1.6 }}>
            Prototype application — React / Supabase / Vercel
          </div>
          <div style={{ fontSize: '12px', color: BRAND.coolGrey, marginTop: '4px' }}>
            sectorbudget.app
          </div>
        </div>
      </div>

      {/* Message for Mark */}
      <div style={{
        marginTop: '32px',
        padding: '24px 32px',
        background: 'rgba(255,255,255,0.12)',
        maxWidth: '480px',
        width: '100%',
        position: 'relative',
        zIndex: 1,
        borderLeft: `3px solid rgba(255,255,255,0.3)`,
      }}>
        <div style={{ fontSize: '16px', color: 'rgba(255,255,255,0.9)', lineHeight: 1.7 }}>
          Mark Petchey — welcome to the mind of Christine. Enter at your own risk.
        </div>
        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginTop: '12px' }}>
          — Christine
        </div>
      </div>

      {/* Shake animation */}
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0) }
          20% { transform: translateX(-8px) }
          40% { transform: translateX(8px) }
          60% { transform: translateX(-4px) }
          80% { transform: translateX(4px) }
        }
      `}</style>
    </div>
  )
}
