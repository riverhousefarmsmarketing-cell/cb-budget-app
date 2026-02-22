import { useState, useEffect, useMemo } from 'react'
import { BRAND } from '../lib/brand'
import { formatDate } from '../lib/utils'
import { supabase } from '../lib/supabase'
import { PCS_SECTOR_ID } from '../hooks/useData'
import { SectionHeader, LoadingState, StatusBadge, KPICard, ProjectLink, EmployeeLink } from '../components/SharedUI'

// ============================================================================
// Status maps
// ============================================================================
const urgencyMap = {
  overdue: { bg: '#FDECEC', text: BRAND.red, label: 'Overdue' },
  due_now: { bg: '#FFF4E5', text: BRAND.amber, label: 'Due Now' },
  due_this_week: { bg: '#FFF4E5', text: BRAND.amber, label: 'This Week' },
  due_next_week: { bg: '#E8F4FD', text: BRAND.blue, label: 'Next Week' },
  on_track: { bg: '#E8F5E8', text: BRAND.green, label: 'On Track' },
  no_due_date: { bg: BRAND.greyLight, text: BRAND.coolGrey, label: 'No Date' },
}

const priorityMap = {
  critical: { bg: '#FDECEC', text: BRAND.red, label: 'Critical' },
  high: { bg: '#FFF4E5', text: BRAND.amber, label: 'High' },
  normal: { bg: BRAND.greyLight, text: BRAND.coolGrey, label: 'Normal' },
  low: { bg: '#E8F5E8', text: BRAND.green, label: 'Low' },
}

const statusMap = {
  open: { bg: '#FFF4E5', text: BRAND.amber, label: 'Open' },
  in_progress: { bg: '#E8F4FD', text: BRAND.blue, label: 'In Progress' },
}

const sourceTypeLabels = {
  meeting: 'Meeting',
  manual: 'Manual',
  phone_call: 'Phone Call',
  site_visit: 'Site Visit',
  email: 'Email',
  data_review: 'Data Review',
  risk_response: 'Risk Response',
  client_request: 'Client Request',
  internal_review: 'Internal Review',
  other: 'Other',
}

// ============================================================================
// Main Component
// ============================================================================
export default function ActionTrackerPage() {
  const [actions, setActions] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterOwner, setFilterOwner] = useState('all')
  const [filterProject, setFilterProject] = useState('all')
  const [filterUrgency, setFilterUrgency] = useState('all')

  useEffect(() => { loadActions() }, [])

  async function loadActions() {
    setLoading(true)
    const { data, error } = await supabase
      .from('v_sector_action_tracker')
      .select('*')
      .eq('sector_id', PCS_SECTOR_ID)

    if (!error) setActions(data || [])
    setLoading(false)
  }

  // Unique owners and projects for filters
  const owners = useMemo(() => {
    const set = new Set(actions.map(a => a.owner_name).filter(Boolean))
    return [...set].sort()
  }, [actions])

  const projects = useMemo(() => {
    const map = {}
    actions.forEach(a => {
      if (a.project_code) map[a.project_code] = a.project_name
    })
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]))
  }, [actions])

  // Filtered actions
  const filtered = useMemo(() => {
    return actions.filter(a => {
      if (filterOwner !== 'all' && a.owner_name !== filterOwner) return false
      if (filterProject !== 'all' && a.project_code !== filterProject) return false
      if (filterUrgency !== 'all' && a.urgency !== filterUrgency) return false
      return true
    })
  }, [actions, filterOwner, filterProject, filterUrgency])

  // KPI counts
  const overdue = actions.filter(a => a.urgency === 'overdue').length
  const dueThisWeek = actions.filter(a => a.urgency === 'due_now' || a.urgency === 'due_this_week').length
  const totalOpen = actions.length

  const selectStyle = {
    padding: '6px 10px', border: `1px solid ${BRAND.greyBorder}`,
    fontFamily: BRAND.font, fontSize: '13px', color: BRAND.coolGrey,
    background: BRAND.white,
  }

  if (loading) return <LoadingState message="Loading action tracker..." />

  return (
    <div>
      <SectionHeader
        title="Action Tracker"
        subtitle="All open actions across all projects — sorted by urgency"
      />

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        <KPICard label="Total Open" value={totalOpen} />
        <KPICard label="Overdue" value={overdue} color={overdue > 0 ? BRAND.red : BRAND.green} />
        <KPICard label="Due This Week" value={dueThisWeek} color={dueThisWeek > 0 ? BRAND.amber : BRAND.green} />
        <KPICard label="Owners" value={owners.length} />
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <label style={{ fontSize: '12px', color: BRAND.coolGrey, display: 'block', marginBottom: '4px' }}>Owner</label>
          <select value={filterOwner} onChange={e => setFilterOwner(e.target.value)} style={selectStyle}>
            <option value="all">All owners</option>
            {owners.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: '12px', color: BRAND.coolGrey, display: 'block', marginBottom: '4px' }}>Project</label>
          <select value={filterProject} onChange={e => setFilterProject(e.target.value)} style={selectStyle}>
            <option value="all">All projects</option>
            {projects.map(([code, name]) => <option key={code} value={code}>{code} — {name}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: '12px', color: BRAND.coolGrey, display: 'block', marginBottom: '4px' }}>Urgency</label>
          <select value={filterUrgency} onChange={e => setFilterUrgency(e.target.value)} style={selectStyle}>
            <option value="all">All</option>
            <option value="overdue">Overdue</option>
            <option value="due_now">Due Now</option>
            <option value="due_this_week">This Week</option>
            <option value="due_next_week">Next Week</option>
            <option value="on_track">On Track</option>
            <option value="no_due_date">No Date</option>
          </select>
        </div>
        {(filterOwner !== 'all' || filterProject !== 'all' || filterUrgency !== 'all') && (
          <button
            onClick={() => { setFilterOwner('all'); setFilterProject('all'); setFilterUrgency('all') }}
            style={{
              padding: '6px 14px', border: `1px solid ${BRAND.greyBorder}`, background: BRAND.white,
              color: BRAND.coolGrey, cursor: 'pointer', fontFamily: BRAND.font, fontSize: '12px',
              alignSelf: 'flex-end',
            }}
          >Clear filters</button>
        )}
        <span style={{ fontSize: '12px', color: BRAND.coolGrey, alignSelf: 'flex-end', marginLeft: 'auto' }}>
          Showing {filtered.length} of {totalOpen} actions
        </span>
      </div>

      {/* Actions list */}
      <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr>
              {['Ref', 'Action', 'Owner', 'Project', 'Due', 'Urgency', 'Priority', 'Status', 'Source'].map(h => (
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
                <td colSpan={9} style={{ padding: '40px 24px', color: BRAND.coolGrey, fontSize: '14px' }}>
                  {totalOpen === 0 ? 'No open actions. Nice work.' : 'No actions match the current filters.'}
                </td>
              </tr>
            ) : (
              filtered.map((a, i) => (
                <tr key={a.action_id} style={{ background: i % 2 === 0 ? BRAND.white : BRAND.greyLight }}>
                  <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, whiteSpace: 'nowrap', color: BRAND.coolGrey }}>
                    {a.action_ref}
                  </td>
                  <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, color: BRAND.coolGrey, maxWidth: '300px' }}>
                    {a.action_description}
                  </td>
                  <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, whiteSpace: 'nowrap', color: BRAND.coolGrey }}>
                    {a.owner_employee_id ? (
                      <EmployeeLink id={a.owner_employee_id}>{a.owner_name}</EmployeeLink>
                    ) : (
                      a.owner_name || '—'
                    )}
                  </td>
                  <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, whiteSpace: 'nowrap', color: BRAND.coolGrey }}>
                    {a.project_id ? (
                      <ProjectLink id={a.project_id}>{a.project_code}</ProjectLink>
                    ) : '—'}
                  </td>
                  <td style={{
                    padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, whiteSpace: 'nowrap',
                    color: a.urgency === 'overdue' ? BRAND.red : BRAND.coolGrey,
                  }}>
                    {formatDate(a.due_date)}
                    {a.days_overdue > 0 && (
                      <span style={{ fontSize: '11px', color: BRAND.red, marginLeft: '6px' }}>
                        +{a.days_overdue}d
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}` }}>
                    <StatusBadge status={a.urgency} map={urgencyMap} />
                  </td>
                  <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}` }}>
                    <StatusBadge status={a.priority} map={priorityMap} />
                  </td>
                  <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}` }}>
                    <StatusBadge status={a.status} map={statusMap} />
                  </td>
                  <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, whiteSpace: 'nowrap', color: BRAND.coolGrey, fontSize: '12px' }}>
                    {sourceTypeLabels[a.source_type] || a.source_type || '—'}
                    {a.source_ref && (
                      <span style={{ color: BRAND.coolGrey, marginLeft: '6px' }}>({a.source_ref})</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
