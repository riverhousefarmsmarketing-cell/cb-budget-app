import { useState, useEffect, useMemo } from 'react'
import { BRAND } from '../lib/brand'
import { formatDate } from '../lib/utils'
import { supabase } from '../lib/supabase'
import { PCS_SECTOR_ID } from '../hooks/useData'
import { SectionHeader, LoadingState, StatusBadge, KPICard, ProjectLink } from '../components/SharedUI'

// ============================================================================
// RAID type tabs and maps
// ============================================================================
const RAID_TABS = [
  { key: 'all', label: 'All' },
  { key: 'risk', label: 'Risks' },
  { key: 'action', label: 'Actions' },
  { key: 'issue', label: 'Issues' },
  { key: 'decision', label: 'Decisions' },
]

const raidTypeMap = {
  risk: { bg: '#FFF4E5', text: BRAND.amber, label: 'Risk' },
  action: { bg: '#E8F4FD', text: BRAND.blue, label: 'Action' },
  issue: { bg: '#FDECEC', text: BRAND.red, label: 'Issue' },
  decision: { bg: '#E8F5E8', text: BRAND.green, label: 'Decision' },
}

const statusMap = {
  open: { bg: '#FFF4E5', text: BRAND.amber, label: 'Open' },
  in_progress: { bg: '#E8F4FD', text: BRAND.blue, label: 'In Progress' },
  mitigating: { bg: '#E8F4FD', text: BRAND.blue, label: 'Mitigating' },
  monitoring: { bg: '#E8F4FD', text: BRAND.blue, label: 'Monitoring' },
  escalated: { bg: '#FDECEC', text: BRAND.red, label: 'Escalated' },
  closed: { bg: BRAND.greyLight, text: BRAND.coolGrey, label: 'Closed' },
  accepted: { bg: '#E8F5E8', text: BRAND.green, label: 'Accepted' },
}

const priorityMap = {
  high: { bg: '#FDECEC', text: BRAND.red, label: 'High' },
  normal: { bg: BRAND.greyLight, text: BRAND.coolGrey, label: 'Normal' },
  low: { bg: '#E8F5E8', text: BRAND.green, label: 'Low' },
}

// ============================================================================
// Main Component
// ============================================================================
export default function RAIDLogPage() {
  const [items, setItems] = useState([])
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [raidTab, setRaidTab] = useState('all')
  const [filterProject, setFilterProject] = useState('all')
  const [filterStatus, setFilterStatus] = useState('open') // default to open items
  const [filterPriority, setFilterPriority] = useState('all')
  const [filterOwner, setFilterOwner] = useState('all')

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const [raidRes, projRes] = await Promise.all([
      supabase.from('v_project_raid').select('*').eq('sector_id', PCS_SECTOR_ID),
      supabase.from('projects').select('id, code, name').eq('sector_id', PCS_SECTOR_ID).order('code'),
    ])
    setItems(raidRes.data || [])
    setProjects(projRes.data || [])
    setLoading(false)
  }

  // Unique owners for filter
  const owners = useMemo(() => {
    const set = new Set(items.map(i => i.owner_name).filter(Boolean))
    return [...set].sort()
  }, [items])

  // Filtered items
  const filtered = useMemo(() => {
    return items.filter(i => {
      if (raidTab !== 'all' && i.raid_type !== raidTab) return false
      if (filterProject !== 'all' && i.project_id !== filterProject) return false
      if (filterStatus === 'open' && i.status === 'closed') return false
      if (filterStatus === 'closed' && i.status !== 'closed') return false
      if (filterPriority !== 'all' && i.priority !== filterPriority) return false
      if (filterOwner !== 'all' && i.owner_name !== filterOwner) return false
      return true
    }).sort((a, b) => {
      // Sort: high priority first, then by due date (nulls last)
      const pOrder = { high: 0, normal: 1, low: 2 }
      const pa = pOrder[a.priority] ?? 1
      const pb = pOrder[b.priority] ?? 1
      if (pa !== pb) return pa - pb
      if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date)
      if (a.due_date) return -1
      if (b.due_date) return 1
      return (b.updated_at || '').localeCompare(a.updated_at || '')
    })
  }, [items, raidTab, filterProject, filterStatus, filterPriority, filterOwner])

  // KPI counts
  const totalOpen = items.filter(i => i.status !== 'closed').length
  const risks = items.filter(i => i.raid_type === 'risk' && i.status !== 'closed').length
  const actions = items.filter(i => i.raid_type === 'action' && i.status !== 'closed').length
  const issues = items.filter(i => i.raid_type === 'issue' && i.status !== 'closed').length
  const decisions = items.filter(i => i.raid_type === 'decision').length
  const highPriority = items.filter(i => i.priority === 'high' && i.status !== 'closed').length

  // Project lookup
  const projMap = useMemo(() => {
    const m = {}
    projects.forEach(p => { m[p.id] = p })
    return m
  }, [projects])

  const selectStyle = {
    padding: '6px 10px', border: `1px solid ${BRAND.greyBorder}`,
    fontFamily: BRAND.font, fontSize: '13px', color: BRAND.coolGrey,
    background: BRAND.white,
  }

  const hasFilters = filterProject !== 'all' || filterStatus !== 'open' || filterPriority !== 'all' || filterOwner !== 'all'

  if (loading) return <LoadingState message="Loading RAID log..." />

  return (
    <div>
      <SectionHeader
        title="RAID Log"
        subtitle="Risks, Actions, Issues and Decisions across all projects"
      />

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        <KPICard label="Total Open" value={totalOpen} />
        <KPICard label="Risks" value={risks} color={risks > 0 ? BRAND.amber : BRAND.green} />
        <KPICard label="Actions" value={actions} color={actions > 0 ? BRAND.blue : BRAND.green} />
        <KPICard label="Issues" value={issues} color={issues > 0 ? BRAND.red : BRAND.green} />
        <KPICard label="Decisions" value={decisions} color={BRAND.teal} />
        <KPICard label="High Priority" value={highPriority} color={highPriority > 0 ? BRAND.red : BRAND.green} />
      </div>

      {/* RAID type tabs */}
      <div style={{ display: 'flex', gap: '0', borderBottom: `2px solid ${BRAND.greyBorder}`, marginBottom: '20px' }}>
        {RAID_TABS.map(t => {
          const isActive = raidTab === t.key
          const count = t.key === 'all'
            ? items.filter(i => i.status !== 'closed').length
            : items.filter(i => i.raid_type === t.key && (t.key === 'decision' || i.status !== 'closed')).length
          return (
            <button key={t.key} onClick={() => setRaidTab(t.key)} style={{
              padding: '10px 24px', background: isActive ? BRAND.purple : 'transparent',
              color: isActive ? BRAND.white : BRAND.coolGrey,
              border: 'none', cursor: 'pointer', fontFamily: BRAND.font, fontSize: '13px',
              borderBottom: isActive ? `2px solid ${BRAND.purple}` : '2px solid transparent',
              marginBottom: '-2px', display: 'flex', gap: '6px', alignItems: 'center',
            }}>
              {t.label}
              <span style={{
                fontSize: '11px', padding: '1px 6px',
                background: isActive ? 'rgba(255,255,255,0.2)' : BRAND.greyLight,
                color: isActive ? BRAND.white : BRAND.coolGrey,
              }}>{count}</span>
            </button>
          )
        })}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <label style={{ fontSize: '12px', color: BRAND.coolGrey, display: 'block', marginBottom: '4px' }}>Project</label>
          <select value={filterProject} onChange={e => setFilterProject(e.target.value)} style={selectStyle}>
            <option value="all">All projects</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: '12px', color: BRAND.coolGrey, display: 'block', marginBottom: '4px' }}>Status</label>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={selectStyle}>
            <option value="open">Open items</option>
            <option value="all">All statuses</option>
            <option value="closed">Closed only</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize: '12px', color: BRAND.coolGrey, display: 'block', marginBottom: '4px' }}>Priority</label>
          <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} style={selectStyle}>
            <option value="all">All</option>
            <option value="high">High</option>
            <option value="normal">Normal</option>
            <option value="low">Low</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize: '12px', color: BRAND.coolGrey, display: 'block', marginBottom: '4px' }}>Owner</label>
          <select value={filterOwner} onChange={e => setFilterOwner(e.target.value)} style={selectStyle}>
            <option value="all">All owners</option>
            {owners.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        {hasFilters && (
          <button
            onClick={() => { setFilterProject('all'); setFilterStatus('open'); setFilterPriority('all'); setFilterOwner('all') }}
            style={{
              padding: '6px 14px', border: `1px solid ${BRAND.greyBorder}`, background: BRAND.white,
              color: BRAND.coolGrey, cursor: 'pointer', fontFamily: BRAND.font, fontSize: '12px',
              alignSelf: 'flex-end',
            }}
          >Clear filters</button>
        )}
        <span style={{ fontSize: '12px', color: BRAND.coolGrey, alignSelf: 'flex-end', marginLeft: 'auto' }}>
          Showing {filtered.length} items
        </span>
      </div>

      {/* RAID table */}
      <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr>
              {['Type', 'Ref', 'Title', 'Project', 'Owner', 'Priority', 'Status', 'Raised', 'Due', 'Detail'].map(h => (
                <th key={h} style={{
                  background: BRAND.purple, color: BRAND.white, padding: '10px 14px',
                  textAlign: 'left', fontWeight: 400, whiteSpace: 'nowrap', letterSpacing: '0.01em',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={10} style={{ padding: '40px 24px', color: BRAND.coolGrey, fontSize: '14px' }}>
                  No items match the current filters.
                </td>
              </tr>
            ) : (
              filtered.map((item, i) => {
                const proj = projMap[item.project_id]
                return (
                  <tr key={`${item.raid_type}-${item.item_id}`} style={{ background: i % 2 === 0 ? BRAND.white : BRAND.greyLight }}>
                    <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}` }}>
                      <StatusBadge status={item.raid_type} map={raidTypeMap} />
                    </td>
                    <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, whiteSpace: 'nowrap', color: BRAND.coolGrey, fontSize: '12px' }}>
                      {item.ref_code || '—'}
                    </td>
                    <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, color: BRAND.coolGrey, maxWidth: '280px' }}>
                      <div>{item.title}</div>
                      {item.description && (
                        <div style={{ fontSize: '11px', color: BRAND.coolGrey, marginTop: '2px', opacity: 0.7 }}>
                          {item.description.length > 120 ? item.description.slice(0, 120) + '...' : item.description}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, whiteSpace: 'nowrap' }}>
                      {proj ? <ProjectLink id={proj.id}>{proj.code}</ProjectLink> : '—'}
                    </td>
                    <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, whiteSpace: 'nowrap', color: BRAND.coolGrey }}>
                      {item.owner_name || '—'}
                    </td>
                    <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}` }}>
                      <StatusBadge status={item.priority} map={priorityMap} />
                    </td>
                    <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}` }}>
                      <StatusBadge status={item.status} map={statusMap} />
                    </td>
                    <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, whiteSpace: 'nowrap', color: BRAND.coolGrey, fontSize: '12px' }}>
                      {formatDate(item.raised_date)}
                    </td>
                    <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, whiteSpace: 'nowrap', color: BRAND.coolGrey, fontSize: '12px' }}>
                      {formatDate(item.due_date)}
                    </td>
                    <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, color: BRAND.coolGrey, fontSize: '12px', maxWidth: '200px' }}>
                      {item.sub_category && <span style={{ marginRight: '4px' }}>{item.sub_category}</span>}
                      {item.detail && (
                        <span style={{ opacity: 0.7 }}>
                          {item.detail.length > 80 ? item.detail.slice(0, 80) + '...' : item.detail}
                        </span>
                      )}
                      {!item.sub_category && !item.detail && '—'}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
