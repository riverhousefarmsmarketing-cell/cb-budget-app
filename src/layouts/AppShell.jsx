import { useState } from 'react'
import { BRAND } from '../lib/brand'
import { Icons } from '../components/Icons'

const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', icon: Icons.Dashboard },
  { key: 'people', label: 'People', icon: Icons.People },
  { key: 'work', label: 'Work', icon: Icons.Folder },
  { key: 'hoursrevenue', label: 'Hours & Revenue', icon: Icons.Grid },
  { key: 'commercial', label: 'Commercial', icon: Icons.DollarSign },
  { key: 'forecast', label: 'Forecast Planner', icon: Icons.TrendingUp },
  { key: 'actions', label: 'Action Tracker', icon: Icons.CheckSquare },
  { key: 'raid', label: 'RAID Log', icon: Icons.Shield },
  { key: 'quality', label: 'Quality', icon: Icons.ClipboardCheck },
]

const SETTINGS_ITEM = { key: 'settings', label: 'Settings', icon: Icons.Settings }

export default function AppShell({ activeView, onNavigate, onSignOut, children }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const renderNavButton = (item) => {
    const isActive = activeView === item.key
    const IconComponent = item.icon
    return (
      <button key={item.key} onClick={() => onNavigate(item.key)} style={{
        display: 'flex', alignItems: 'center', gap: '12px', width: '100%',
        padding: sidebarCollapsed ? '12px 20px' : '10px 20px',
        background: isActive ? 'rgba(255,255,255,0.12)' : 'transparent',
        border: 'none', borderLeft: isActive ? '3px solid #FFFFFF' : '3px solid transparent',
        color: isActive ? BRAND.white : 'rgba(255,255,255,0.65)',
        cursor: 'pointer', fontFamily: BRAND.font, fontSize: '13px', textAlign: 'left',
        fontWeight: 400, fontStyle: 'normal',
      }}>
        <IconComponent />
        {!sidebarCollapsed && item.label}
      </button>
    )
  }

  return (
    <div style={{
      fontFamily: BRAND.font, display: 'flex', minHeight: '100vh',
      background: BRAND.greyLight, color: BRAND.coolGrey, fontWeight: 400, fontStyle: 'normal',
    }}>
      <nav style={{
        width: sidebarCollapsed ? '60px' : '220px', background: BRAND.purple, color: BRAND.white,
        display: 'flex', flexDirection: 'column', transition: 'width 0.2s ease', flexShrink: 0,
      }}>
        <div style={{ padding: sidebarCollapsed ? '20px 12px' : '20px 20px', borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
          {!sidebarCollapsed ? (
            <>
              <div style={{ fontSize: '15px', color: BRAND.white, letterSpacing: '0.02em', marginBottom: '2px' }}>Currie & Brown</div>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>Budget Management</div>
            </>
          ) : (
            <div style={{ fontSize: '16px', color: BRAND.white, textAlign: 'center' }}>CB</div>
          )}
        </div>
        <div style={{ flex: 1, paddingTop: '8px' }}>
          {NAV_ITEMS.map(renderNavButton)}
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.12)', margin: '8px 0' }} />
          {renderNavButton(SETTINGS_ITEM)}
        </div>
        <button onClick={onSignOut} style={{
          display: 'flex', alignItems: 'center', gap: '12px', width: '100%', padding: '12px 20px',
          background: 'transparent', border: 'none', borderTop: '1px solid rgba(255,255,255,0.12)',
          color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontFamily: BRAND.font, fontSize: '12px',
          textAlign: 'left', fontWeight: 400,
        }}>
          <Icons.LogOut />
          {!sidebarCollapsed && 'Sign Out'}
        </button>
        <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)} style={{
          padding: '12px 20px', background: 'transparent', border: 'none',
          borderTop: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.5)',
          cursor: 'pointer', fontFamily: BRAND.font, fontSize: '12px', textAlign: 'left', fontWeight: 400,
        }}>
          {sidebarCollapsed ? '»' : '« Collapse'}
        </button>
      </nav>
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{
          background: BRAND.white, borderBottom: `1px solid ${BRAND.greyBorder}`,
          padding: '12px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div style={{ fontSize: '14px', color: BRAND.coolGrey }}>PCS — Procurement & Compliance Sector</div>
          <div style={{ fontSize: '12px', color: BRAND.coolGrey }}>Budget Year 2026</div>
        </header>
        <div style={{ flex: 1, overflow: 'auto', padding: '24px 28px' }}>
          {children}
        </div>
      </main>
    </div>
  )
}
