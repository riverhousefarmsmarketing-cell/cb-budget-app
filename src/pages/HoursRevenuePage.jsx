import { useState } from 'react'
import { BRAND } from '../lib/brand'
import { SectionHeader } from '../components/SharedUI'
import HoursGridPage from './HoursGridPage'
import RevenuePage from './RevenuePage'
import TimesheetsPage from './TimesheetsPage'
import ResourceAllocationPage from './ResourceAllocationPage'

const TABS = [
  { key: 'hours', label: 'Hours Grid' },
  { key: 'resources', label: 'Resource Allocation' },
  { key: 'revenue', label: 'Revenue' },
  { key: 'timesheets', label: 'Timesheets' },
]

export default function HoursRevenuePage() {
  const [tab, setTab] = useState('hours')

  return (
    <div>
      <SectionHeader title="Hours & Revenue" subtitle="Plan hours, allocate resources, track revenue, and upload timesheets" />
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
      {tab === 'hours' && <HoursGridPage embedded />}
      {tab === 'resources' && <ResourceAllocationPage embedded />}
      {tab === 'revenue' && <RevenuePage embedded />}
      {tab === 'timesheets' && <TimesheetsPage embedded />}
    </div>
  )
}
