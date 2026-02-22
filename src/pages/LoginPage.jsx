import { useState } from 'react'
import { BRAND } from '../lib/brand'

export default function LoginPage({ onSignIn }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await onSignIn(email, password)
    if (error) {
      setError(error.message)
    }
    setLoading(false)
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: BRAND.greyLight,
      fontFamily: BRAND.font,
    }}>
      <div style={{
        background: BRAND.white,
        border: `1px solid ${BRAND.greyBorder}`,
        padding: '48px 40px',
        width: '100%',
        maxWidth: '400px',
      }}>
        <div style={{ marginBottom: '32px' }}>
          <div style={{ fontSize: '18px', color: BRAND.purple, marginBottom: '4px' }}>Currie & Brown</div>
          <div style={{ fontSize: '14px', color: BRAND.coolGrey }}>Budget Management Application</div>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '13px', color: BRAND.coolGrey, marginBottom: '6px' }}>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '10px 12px',
                border: `1px solid ${BRAND.greyBorder}`,
                fontFamily: BRAND.font,
                fontSize: '14px',
                color: BRAND.coolGrey,
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontSize: '13px', color: BRAND.coolGrey, marginBottom: '6px' }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '10px 12px',
                border: `1px solid ${BRAND.greyBorder}`,
                fontFamily: BRAND.font,
                fontSize: '14px',
                color: BRAND.coolGrey,
                boxSizing: 'border-box',
              }}
            />
          </div>

          {error && (
            <div style={{
              padding: '10px 12px',
              background: '#FDECEC',
              color: BRAND.red,
              fontSize: '13px',
              marginBottom: '16px',
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px',
              background: BRAND.purple,
              color: BRAND.white,
              border: 'none',
              cursor: loading ? 'wait' : 'pointer',
              fontFamily: BRAND.font,
              fontSize: '14px',
              letterSpacing: '0.02em',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div style={{ marginTop: '24px', fontSize: '12px', color: BRAND.coolGrey }}>
          PCS — Procurement & Compliance Sector
        </div>
      </div>
    </div>
  )
}
