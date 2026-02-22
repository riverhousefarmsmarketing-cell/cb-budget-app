import { useState } from 'react'
import { BRAND } from '../lib/brand'
import { SectionHeader } from '../components/SharedUI'
import InvoicesPage from './InvoicesPage'
import POTrackerPage from './POTrackerPage'

const TABS = [
  { key: 'invoices', label: 'Invoices' },
  { key: 'potracker', label: 'PO Tracker' },
]

export default function CommercialPage() {
  const [tab, setTab] = useState('invoices')

  return (
    <div>
      <SectionHeader title="Commercial" subtitle="Invoice management and purchase order tracking" />
      <div style={{ display: 'flex', gap: '0', borderBottom: `2px solid ${BRAND.greyBorder}`, marginBottom: '24px' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '10px 24px', background: tab === t.key ? BRAND.purple : 'transparent',
            color: tab === t.key ? BRAND.white : BRAND.coolGrey,
            border: 'none', cursor: 'pointer', fontFamily: BRAND.font, fontSize: '13px',
            borderBottom: tab === t.key ? `2px solid ${BRAND.purple}` : '2px solid transparent',
            marginBottom: '-2px',
          }}>{t.label}</button>
        ))}
      </div>
      {tab === 'invoices' && <InvoicesPage embedded />}
      {tab === 'potracker' && <POTrackerPage embedded />}
    </div>
  )
}
