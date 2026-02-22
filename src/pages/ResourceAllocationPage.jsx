import { useState, useEffect, useMemo } from 'react'
import { BRAND } from '../lib/brand'
import { formatCurrency, formatDate } from '../lib/utils'
import { supabase } from '../lib/supabase'
import { PCS_SECTOR_ID, useEmployees, useProjects } from '../hooks/useData'
import { SectionHeader, LoadingState, KPICard, StatusBadge, EmployeeLink, ProjectLink } from '../components/SharedUI'
import { auditDelete } from '../lib/auditDelete'

// ============================================================================
// Constants
// ============================================================================
const MONTHS_2026 = [
  { value: '2026-01-01', label: 'Jan', short: 'Jan 26' },
  { value: '2026-02-01', label: 'Feb', short: 'Feb 26' },
  { value: '2026-03-01', label: 'Mar', short: 'Mar 26' },
  { value: '2026-04-01', label: 'Apr', short: 'Apr 26' },
  { value: '2026-05-01', label: 'May', short: 'May 26' },
  { value: '2026-06-01', label: 'Jun', short: 'Jun 26' },
  { value: '2026-07-01', label: 'Jul', short: 'Jul 26' },
  { value: '2026-08-01', label: 'Aug', short: 'Aug 26' },
  { value: '2026-09-01', label: 'Sep', short: 'Sep 26' },
  { value: '2026-10-01', label: 'Oct', short: 'Oct 26' },
  { value: '2026-11-01', label: 'Nov', short: 'Nov 26' },
  { value: '2026-12-01', label: 'Dec', short: 'Dec 26' },
]

const STANDARD_MONTHLY_HOURS = 173.3 // 40h x 52w / 12m
const TABS = [
  { key: 'heatmap', label: 'Capacity Heatmap' },
  { key: 'detail', label: 'Allocation Detail' },
  { key: 'edit', label: 'Edit Allocations' },
]

const statusColorMap = {
  planned: { bg: BRAND.greyLight, text: BRAND.coolGrey, label: 'Planned' },
  confirmed: { bg: '#E8F5E8', text: BRAND.green, label: 'Confirmed' },
  actual: { bg: '#E8F4FD', text: BRAND.blue, label: 'Actual' },
  tentative: { bg: '#FFF4E5', text: BRAND.amber, label: 'Tentative' },
}

// ============================================================================
// Utilization color helper
// ============================================================================
function utilColor(pct) {
  if (pct >= 1.1) return { bg: '#FDECEC', text: BRAND.red }       // Over-allocated (>110%)
  if (pct >= 0.85) return { bg: '#E8F5E8', text: BRAND.green }    // Ideal (85-110%)
  if (pct >= 0.6) return { bg: '#FFF4E5', text: BRAND.amber }     // Under-utilized (60-85%)
  if (pct > 0) return { bg: '#FFF4E5', text: BRAND.amber }        // Low (<60%)
  return { bg: BRAND.white, text: BRAND.coolGrey }                 // Unallocated
}

function utilColorForHours(hours, target = STANDARD_MONTHLY_HOURS) {
  if (target === 0) return { bg: BRAND.white, text: BRAND.coolGrey }
  return utilColor(hours / target)
}

// ============================================================================
// Main Component
// ============================================================================
export default function ResourceAllocationPage({ embedded }) {
  const { data: employees, loading: empLoading } = useEmployees()
  const { data: projects, loading: projLoading } = useProjects()
  const [allocations, setAllocations] = useState([])
  const [timesheetActuals, setTimesheetActuals] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('heatmap')

  useEffect(() => { loadAllocations() }, [])

  async function loadAllocations() {
    setLoading(true)
    const [allocRes, tsRes] = await Promise.all([
      supabase.from('resource_allocations').select('*')
        .eq('sector_id', PCS_SECTOR_ID).order('month'),
      supabase.from('timesheet_entries').select('employee_id, week_ending, hours')
        .eq('sector_id', PCS_SECTOR_ID),
    ])
    setAllocations(allocRes.data || [])
    setTimesheetActuals(tsRes.data || [])
    setLoading(false)
  }

  // Aggregate actuals by employee + month
  const actualsByEmpMonth = useMemo(() => {
    const map = {}
    timesheetActuals.forEach(ts => {
      const m = ts.week_ending?.slice(0, 7)
      if (!m) return
      const key = `${ts.employee_id}|${m}`
      map[key] = (map[key] || 0) + Number(ts.hours)
    })
    return map
  }, [timesheetActuals])

  // Aggregate planned by employee + month
  const plannedByEmpMonth = useMemo(() => {
    const map = {}
    allocations.forEach(a => {
      const m = a.month?.slice(0, 7)
      if (!m) return
      const key = `${a.employee_id}|${m}`
      map[key] = (map[key] || 0) + Number(a.planned_hours)
    })
    return map
  }, [allocations])

  // Aggregate planned by employee + project + month
  const plannedByEmpProjMonth = useMemo(() => {
    const map = {}
    allocations.forEach(a => {
      const m = a.month?.slice(0, 7)
      if (!m) return
      const key = `${a.employee_id}|${a.project_id}|${m}`
      map[key] = { hours: Number(a.planned_hours), status: a.allocation_status, id: a.id }
    })
    return map
  }, [allocations])

  const activeEmployees = employees.filter(e => e.is_active)

  if (empLoading || projLoading || loading) return <LoadingState message="Loading resource allocations..." />

  // KPIs
  const totalPlanned = allocations.reduce((s, a) => s + Number(a.planned_hours), 0)
  const totalActual = Object.values(actualsByEmpMonth).reduce((s, h) => s + h, 0)
  const uniqueEmployees = new Set(allocations.map(a => a.employee_id)).size
  const uniqueProjects = new Set(allocations.map(a => a.project_id)).size

  return (
    <div>
      {!embedded && <SectionHeader title="Resource Allocation" subtitle="Capacity planning and allocation management" />}

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        <KPICard label="Total Planned Hours" value={totalPlanned.toLocaleString()} subValue="across all months" />
        <KPICard label="Total Actual Hours" value={totalActual.toLocaleString()} color={BRAND.teal} subValue="from timesheets" />
        <KPICard label="Employees Allocated" value={uniqueEmployees} />
        <KPICard label="Projects Allocated" value={uniqueProjects} />
      </div>

      {/* Tabs */}
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

      {tab === 'heatmap' && (
        <HeatmapTab
          employees={activeEmployees} projects={projects}
          plannedByEmpMonth={plannedByEmpMonth}
          actualsByEmpMonth={actualsByEmpMonth}
        />
      )}
      {tab === 'detail' && (
        <DetailTab
          allocations={allocations} employees={employees} projects={projects}
          reload={loadAllocations}
        />
      )}
      {tab === 'edit' && (
        <EditTab
          employees={activeEmployees} projects={projects}
          allocations={allocations} reload={loadAllocations}
        />
      )}
    </div>
  )
}


// ============================================================================
// HEATMAP TAB — Employee x Month capacity overview
// ============================================================================
function HeatmapTab({ employees, projects, plannedByEmpMonth, actualsByEmpMonth }) {
  const [viewMode, setViewMode] = useState('planned') // 'planned' | 'actual' | 'variance'

  const visibleMonths = MONTHS_2026

  return (
    <div>
      {/* View toggle */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', alignItems: 'center' }}>
        <span style={{ fontSize: '12px', color: BRAND.coolGrey }}>View:</span>
        {[
          { key: 'planned', label: 'Planned Hours' },
          { key: 'actual', label: 'Actual Hours' },
          { key: 'variance', label: 'Variance' },
        ].map(v => (
          <button key={v.key} onClick={() => setViewMode(v.key)} style={{
            padding: '6px 14px', fontSize: '12px', fontFamily: BRAND.font,
            background: viewMode === v.key ? BRAND.purple : BRAND.white,
            color: viewMode === v.key ? BRAND.white : BRAND.coolGrey,
            border: `1px solid ${viewMode === v.key ? BRAND.purple : BRAND.greyBorder}`,
            cursor: 'pointer',
          }}>{v.label}</button>
        ))}
      </div>

      {/* Heatmap grid */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr>
              <th style={{
                background: BRAND.purple, color: BRAND.white, padding: '10px 12px',
                textAlign: 'left', fontWeight: 400, position: 'sticky', left: 0, zIndex: 2, minWidth: '180px',
              }}>Employee</th>
              {visibleMonths.map(m => (
                <th key={m.value} style={{
                  background: BRAND.purple, color: BRAND.white, padding: '10px 8px',
                  textAlign: 'center', fontWeight: 400, minWidth: '70px',
                }}>{m.label}</th>
              ))}
              <th style={{
                background: BRAND.purple, color: BRAND.white, padding: '10px 8px',
                textAlign: 'center', fontWeight: 400, minWidth: '80px',
              }}>Total</th>
              <th style={{
                background: BRAND.purple, color: BRAND.white, padding: '10px 8px',
                textAlign: 'center', fontWeight: 400, minWidth: '70px',
              }}>Avg Util.</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((emp, empIdx) => {
              let rowTotal = 0
              let monthsWithData = 0
              const targetUtil = Number(emp.target_utilization || 0.8)
              const targetHours = STANDARD_MONTHLY_HOURS * targetUtil

              const cells = visibleMonths.map(m => {
                const monthKey = m.value.slice(0, 7)
                const key = `${emp.id}|${monthKey}`
                const planned = plannedByEmpMonth[key] || 0
                const actual = actualsByEmpMonth[key] || 0

                let displayVal, colorObj
                if (viewMode === 'planned') {
                  displayVal = planned
                  colorObj = utilColorForHours(planned, targetHours)
                } else if (viewMode === 'actual') {
                  displayVal = actual
                  colorObj = utilColorForHours(actual, targetHours)
                } else {
                  // Variance: actual - planned
                  displayVal = actual - planned
                  colorObj = displayVal >= 0
                    ? { bg: '#E8F5E8', text: BRAND.green }
                    : { bg: '#FDECEC', text: BRAND.red }
                  if (displayVal === 0 && actual === 0 && planned === 0) {
                    colorObj = { bg: BRAND.white, text: BRAND.coolGrey }
                  }
                }

                if (planned > 0 || actual > 0) monthsWithData++
                rowTotal += viewMode === 'actual' ? actual : planned

                return { displayVal, colorObj, monthKey }
              })

              const avgUtil = monthsWithData > 0 ? rowTotal / (monthsWithData * targetHours) : 0
              const avgUtilColor = utilColor(avgUtil)

              return (
                <tr key={emp.id} style={{ background: empIdx % 2 === 0 ? BRAND.white : BRAND.greyLight }}>
                  <td style={{
                    padding: '8px 12px', borderBottom: `1px solid ${BRAND.greyBorder}`,
                    position: 'sticky', left: 0, zIndex: 1,
                    background: empIdx % 2 === 0 ? BRAND.white : BRAND.greyLight,
                  }}>
                    <EmployeeLink id={emp.id}>{emp.name}</EmployeeLink>
                    <div style={{ fontSize: '11px', color: '#999' }}>{emp.role}</div>
                  </td>
                  {cells.map((cell, ci) => (
                    <td key={ci} style={{
                      padding: '6px 4px', textAlign: 'center',
                      borderBottom: `1px solid ${BRAND.greyBorder}`,
                      background: cell.colorObj.bg,
                      color: cell.colorObj.text,
                      fontSize: '12px', fontWeight: cell.displayVal !== 0 ? 500 : 400,
                    }}
                      title={`${emp.name} - ${MONTHS_2026[ci].short}: ${cell.displayVal.toFixed(1)}h`}
                    >
                      {cell.displayVal !== 0 ? (viewMode === 'variance' && cell.displayVal > 0 ? '+' : '') + cell.displayVal.toFixed(0) : ''}
                    </td>
                  ))}
                  <td style={{
                    padding: '6px 8px', textAlign: 'center',
                    borderBottom: `1px solid ${BRAND.greyBorder}`,
                    color: BRAND.coolGrey, fontSize: '12px', fontWeight: 500,
                  }}>
                    {rowTotal > 0 ? rowTotal.toFixed(0) : ''}
                  </td>
                  <td style={{
                    padding: '6px 8px', textAlign: 'center',
                    borderBottom: `1px solid ${BRAND.greyBorder}`,
                    background: avgUtilColor.bg, color: avgUtilColor.text,
                    fontSize: '12px', fontWeight: 500,
                  }}>
                    {monthsWithData > 0 ? (avgUtil * 100).toFixed(0) + '%' : ''}
                  </td>
                </tr>
              )
            })}
            {/* Column totals */}
            <tr style={{ background: BRAND.purpleLight }}>
              <td style={{
                padding: '8px 12px', fontWeight: 500, color: BRAND.purple,
                borderTop: `2px solid ${BRAND.purple}`, position: 'sticky', left: 0,
                background: BRAND.purpleLight,
              }}>Total</td>
              {MONTHS_2026.map(m => {
                const monthKey = m.value.slice(0, 7)
                let total = 0
                employees.forEach(emp => {
                  const key = `${emp.id}|${monthKey}`
                  total += viewMode === 'actual'
                    ? (actualsByEmpMonth[key] || 0)
                    : (plannedByEmpMonth[key] || 0)
                })
                return (
                  <td key={m.value} style={{
                    padding: '6px 4px', textAlign: 'center',
                    borderTop: `2px solid ${BRAND.purple}`,
                    color: BRAND.purple, fontSize: '12px', fontWeight: 500,
                  }}>
                    {total > 0 ? total.toFixed(0) : ''}
                  </td>
                )
              })}
              <td style={{ padding: '6px 8px', textAlign: 'center', borderTop: `2px solid ${BRAND.purple}`, color: BRAND.purple, fontWeight: 500, fontSize: '12px' }}>
                {(() => {
                  let gt = 0
                  employees.forEach(emp => {
                    MONTHS_2026.forEach(m => {
                      const key = `${emp.id}|${m.value.slice(0, 7)}`
                      gt += viewMode === 'actual' ? (actualsByEmpMonth[key] || 0) : (plannedByEmpMonth[key] || 0)
                    })
                  })
                  return gt > 0 ? gt.toFixed(0) : ''
                })()}
              </td>
              <td style={{ borderTop: `2px solid ${BRAND.purple}` }} />
            </tr>
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: '20px', marginTop: '16px', fontSize: '12px', color: BRAND.coolGrey, flexWrap: 'wrap' }}>
        {[
          { color: '#E8F5E8', border: BRAND.green, label: 'Ideal (85-110%)' },
          { color: '#FFF4E5', border: BRAND.amber, label: 'Under-utilized (<85%)' },
          { color: '#FDECEC', border: BRAND.red, label: 'Over-allocated (>110%)' },
          { color: BRAND.white, border: BRAND.greyBorder, label: 'Unallocated' },
        ].map(l => (
          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '14px', height: '14px', background: l.color, border: `1px solid ${l.border}` }} />
            <span>{l.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}


// ============================================================================
// DETAIL TAB — All allocations in a filterable table
// ============================================================================
function DetailTab({ allocations, employees, projects, reload }) {
  const [filterEmp, setFilterEmp] = useState('all')
  const [filterProj, setFilterProj] = useState('all')

  const empMap = {}
  employees.forEach(e => { empMap[e.id] = e })
  const projMap = {}
  projects.forEach(p => { projMap[p.id] = p })

  const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

  const filtered = allocations.filter(a => {
    if (filterEmp !== 'all' && a.employee_id !== filterEmp) return false
    if (filterProj !== 'all' && a.project_id !== filterProj) return false
    return true
  })

  async function handleDelete(alloc) {
    if (!confirm('Delete this allocation?')) return
    await auditDelete('resource_allocations', alloc.id, alloc)
    reload()
  }

  return (
    <div>
      {/* Filters */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <div>
          <label style={{ display: 'block', fontSize: '12px', color: BRAND.coolGrey, marginBottom: '4px' }}>Employee</label>
          <select value={filterEmp} onChange={e => setFilterEmp(e.target.value)} style={{
            padding: '6px 12px', border: `1px solid ${BRAND.greyBorder}`, background: BRAND.white,
            fontFamily: BRAND.font, fontSize: '13px', color: BRAND.coolGrey, minWidth: '200px',
          }}>
            <option value="all">All employees</option>
            {employees.filter(e => e.is_active).map(e => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '12px', color: BRAND.coolGrey, marginBottom: '4px' }}>Project</label>
          <select value={filterProj} onChange={e => setFilterProj(e.target.value)} style={{
            padding: '6px 12px', border: `1px solid ${BRAND.greyBorder}`, background: BRAND.white,
            fontFamily: BRAND.font, fontSize: '13px', color: BRAND.coolGrey, minWidth: '200px',
          }}>
            <option value="all">All projects</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.code} -- {p.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ fontSize: '13px', color: BRAND.coolGrey, marginBottom: '8px' }}>{filtered.length} allocation{filtered.length !== 1 ? 's' : ''}</div>

      <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr>
              {['Employee', 'Project', 'Month', 'Planned Hours', 'Actual Hours', 'Status', 'Rate Type', ''].map(h => (
                <th key={h} style={{
                  background: BRAND.purple, color: BRAND.white, padding: '10px 14px',
                  textAlign: 'left', fontWeight: 400, whiteSpace: 'nowrap',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: '40px 24px', color: BRAND.coolGrey }}>No allocations match the current filters.</td></tr>
            ) : (
              filtered.map((a, i) => {
                const emp = empMap[a.employee_id]
                const proj = projMap[a.project_id]
                const d = new Date(a.month)
                const monthLabel = `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`
                return (
                  <tr key={a.id} style={{ background: i % 2 === 0 ? BRAND.white : BRAND.greyLight }}>
                    <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}` }}>
                      {emp ? <EmployeeLink id={emp.id}>{emp.name}</EmployeeLink> : '—'}
                    </td>
                    <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}` }}>
                      {proj ? <ProjectLink id={proj.id}>{proj.code} -- {proj.name}</ProjectLink> : '—'}
                    </td>
                    <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, color: BRAND.coolGrey, whiteSpace: 'nowrap' }}>{monthLabel}</td>
                    <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, color: BRAND.coolGrey }}>{Number(a.planned_hours).toFixed(1)}</td>
                    <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, color: a.actual_hours ? BRAND.teal : BRAND.coolGrey }}>
                      {a.actual_hours ? Number(a.actual_hours).toFixed(1) : '—'}
                    </td>
                    <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}` }}>
                      <StatusBadge status={a.allocation_status} map={statusColorMap} />
                    </td>
                    <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, color: BRAND.coolGrey, fontSize: '12px' }}>
                      {a.rate_type === 'cross_sector_adjusted' ? 'Cross-sector' : 'Standard'}
                    </td>
                    <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}` }}>
                      <button onClick={() => handleDelete(a)} style={{
                        background: 'none', border: 'none', color: BRAND.red, cursor: 'pointer',
                        fontFamily: BRAND.font, fontSize: '12px', padding: '2px 8px',
                      }}>Del</button>
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


// ============================================================================
// EDIT TAB — Editable grid: employee x month for selected project
// ============================================================================
function EditTab({ employees, projects, allocations, reload }) {
  const [selectedProject, setSelectedProject] = useState('')
  const [gridData, setGridData] = useState({})     // { "empId|month": hours }
  const [gridStatus, setGridStatus] = useState({})  // { "empId|month": status }
  const [dirty, setDirty] = useState(new Set())
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [addForm, setAddForm] = useState({ employee_id: '', month: '2026-01-01', planned_hours: '', allocation_status: 'planned' })

  // Load existing allocations for selected project into grid
  useEffect(() => {
    if (!selectedProject) { setGridData({}); setGridStatus({}); return }
    const projAllocs = allocations.filter(a => a.project_id === selectedProject)
    const data = {}
    const statuses = {}
    projAllocs.forEach(a => {
      const m = a.month?.slice(0, 7)
      if (!m) return
      const key = `${a.employee_id}|${m}`
      data[key] = Number(a.planned_hours)
      statuses[key] = a.allocation_status
    })
    setGridData(data)
    setGridStatus(statuses)
    setDirty(new Set())
    setMessage(null)
  }, [selectedProject, allocations])

  // Get employees who have allocations on this project
  const allocatedEmployees = useMemo(() => {
    if (!selectedProject) return []
    const empIds = new Set(allocations.filter(a => a.project_id === selectedProject).map(a => a.employee_id))
    return employees.filter(e => empIds.has(e.id))
  }, [selectedProject, allocations, employees])

  function handleCellChange(empId, month, value) {
    const key = `${empId}|${month}`
    setGridData(prev => ({ ...prev, [key]: value === '' ? 0 : parseFloat(value) }))
    setDirty(prev => new Set(prev).add(key))
  }

  async function handleSave() {
    if (dirty.size === 0) return
    setSaving(true); setMessage(null)

    const upserts = Array.from(dirty).map(key => {
      const [employee_id, monthKey] = key.split('|')
      return {
        sector_id: PCS_SECTOR_ID,
        employee_id,
        project_id: selectedProject,
        month: `${monthKey}-01`,
        planned_hours: gridData[key] || 0,
        allocation_status: gridStatus[key] || 'planned',
      }
    })

    const { error } = await supabase.from('resource_allocations')
      .upsert(upserts, { onConflict: 'sector_id,employee_id,project_id,month' })

    if (error) {
      setMessage({ type: 'error', text: error.message })
    } else {
      setMessage({ type: 'success', text: `Saved ${upserts.length} allocation(s).` })
      setDirty(new Set())
      reload()
    }
    setSaving(false)
  }

  async function handleAddAllocation(e) {
    e.preventDefault()
    setSaving(true); setMessage(null)

    const { error } = await supabase.from('resource_allocations').upsert({
      sector_id: PCS_SECTOR_ID,
      employee_id: addForm.employee_id,
      project_id: selectedProject,
      month: addForm.month,
      planned_hours: parseFloat(addForm.planned_hours),
      allocation_status: addForm.allocation_status,
    }, { onConflict: 'sector_id,employee_id,project_id,month' })

    if (error) {
      setMessage({ type: 'error', text: error.message })
    } else {
      setMessage({ type: 'success', text: 'Allocation added.' })
      setAddForm({ employee_id: '', month: '2026-01-01', planned_hours: '', allocation_status: 'planned' })
      setShowAddForm(false)
      reload()
    }
    setSaving(false)
  }

  const billableProjects = projects.filter(p => p.type === 'billable')
  const overheadProjects = projects.filter(p => p.type === 'overhead')
  const totalChanges = dirty.size

  const inputStyle = {
    width: '100%', padding: '8px 12px', border: `1px solid ${BRAND.greyBorder}`,
    fontFamily: BRAND.font, fontSize: '14px', color: BRAND.coolGrey, boxSizing: 'border-box',
  }
  const labelStyle = { display: 'block', fontSize: '12px', color: BRAND.coolGrey, marginBottom: '4px' }

  return (
    <div>
      {/* Project selector */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <label style={labelStyle}>Project</label>
          <select value={selectedProject} onChange={e => setSelectedProject(e.target.value)} style={{
            padding: '8px 12px', minWidth: '300px', border: `1px solid ${BRAND.greyBorder}`,
            background: BRAND.white, fontFamily: BRAND.font, fontSize: '13px', color: BRAND.coolGrey,
          }}>
            <option value="">Select a project...</option>
            <optgroup label="Billable">
              {billableProjects.map(p => <option key={p.id} value={p.id}>{p.code} -- {p.name}</option>)}
            </optgroup>
            <optgroup label="Overhead">
              {overheadProjects.map(p => <option key={p.id} value={p.id}>{p.code} -- {p.name}</option>)}
            </optgroup>
          </select>
        </div>
        {selectedProject && (
          <button onClick={() => setShowAddForm(!showAddForm)} style={{
            padding: '8px 20px', background: BRAND.purple, color: BRAND.white,
            border: 'none', cursor: 'pointer', fontFamily: BRAND.font, fontSize: '13px',
          }}>{showAddForm ? 'Cancel' : 'Add Employee to Project'}</button>
        )}
        {totalChanges > 0 && (
          <button onClick={handleSave} disabled={saving} style={{
            padding: '8px 24px', background: BRAND.purple, color: BRAND.white,
            border: 'none', cursor: 'pointer', fontFamily: BRAND.font, fontSize: '13px',
            opacity: saving ? 0.7 : 1,
          }}>{saving ? 'Saving...' : `Save (${totalChanges} changes)`}</button>
        )}
      </div>

      {/* Add employee allocation form */}
      {showAddForm && selectedProject && (
        <form onSubmit={handleAddAllocation} style={{ background: BRAND.purpleLight, border: `1px solid ${BRAND.greyBorder}`, padding: '20px', marginBottom: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label style={labelStyle}>Employee</label>
              <select value={addForm.employee_id} onChange={e => setAddForm({ ...addForm, employee_id: e.target.value })} required style={inputStyle}>
                <option value="">Select...</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.name} ({emp.role})</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Month</label>
              <select value={addForm.month} onChange={e => setAddForm({ ...addForm, month: e.target.value })} style={inputStyle}>
                {MONTHS_2026.map(m => <option key={m.value} value={m.value}>{m.short}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Planned Hours</label>
              <input type="number" min="0" max="300" step="0.5" value={addForm.planned_hours}
                onChange={e => setAddForm({ ...addForm, planned_hours: e.target.value })} required style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Status</label>
              <select value={addForm.allocation_status} onChange={e => setAddForm({ ...addForm, allocation_status: e.target.value })} style={inputStyle}>
                <option value="planned">Planned</option>
                <option value="confirmed">Confirmed</option>
                <option value="tentative">Tentative</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" onClick={() => setShowAddForm(false)} style={{
              padding: '8px 20px', background: BRAND.white, color: BRAND.coolGrey,
              border: `1px solid ${BRAND.greyBorder}`, cursor: 'pointer', fontFamily: BRAND.font, fontSize: '13px',
            }}>Cancel</button>
            <button type="submit" disabled={saving} style={{
              padding: '8px 20px', background: BRAND.purple, color: BRAND.white,
              border: 'none', cursor: 'pointer', fontFamily: BRAND.font, fontSize: '13px',
            }}>{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </form>
      )}

      {message && (
        <div style={{
          padding: '10px 16px', marginBottom: '16px', fontSize: '13px',
          background: message.type === 'error' ? '#FDECEC' : '#E8F5E8',
          color: message.type === 'error' ? BRAND.red : BRAND.green,
        }}>{message.text}</div>
      )}

      {!selectedProject && (
        <div style={{ padding: '40px 24px', background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, color: BRAND.coolGrey, fontSize: '14px' }}>
          Select a project above to edit resource allocations by employee and month.
        </div>
      )}

      {/* Editable grid: Employee x Month */}
      {selectedProject && allocatedEmployees.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr>
                <th style={{
                  background: BRAND.purple, color: BRAND.white, padding: '10px 12px',
                  textAlign: 'left', fontWeight: 400, position: 'sticky', left: 0, zIndex: 2, minWidth: '180px',
                }}>Employee</th>
                {MONTHS_2026.map(m => (
                  <th key={m.value} style={{
                    background: BRAND.purple, color: BRAND.white, padding: '10px 6px',
                    textAlign: 'center', fontWeight: 400, minWidth: '80px',
                  }}>{m.label}</th>
                ))}
                <th style={{
                  background: BRAND.purple, color: BRAND.white, padding: '10px 8px',
                  textAlign: 'center', fontWeight: 400, minWidth: '70px',
                }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {allocatedEmployees.map((emp, empIdx) => {
                let rowTotal = 0
                return (
                  <tr key={emp.id} style={{ background: empIdx % 2 === 0 ? BRAND.white : BRAND.greyLight }}>
                    <td style={{
                      padding: '6px 12px', borderBottom: `1px solid ${BRAND.greyBorder}`,
                      position: 'sticky', left: 0, zIndex: 1,
                      background: empIdx % 2 === 0 ? BRAND.white : BRAND.greyLight,
                    }}>
                      <div style={{ color: BRAND.coolGrey }}>{emp.name}</div>
                      <div style={{ fontSize: '11px', color: '#999' }}>{emp.role}</div>
                    </td>
                    {MONTHS_2026.map(m => {
                      const monthKey = m.value.slice(0, 7)
                      const key = `${emp.id}|${monthKey}`
                      const val = gridData[key] || 0
                      rowTotal += val
                      const isDirty = dirty.has(key)
                      const targetHours = STANDARD_MONTHLY_HOURS * Number(emp.target_utilization || 0.8)
                      const cellColor = utilColorForHours(val, targetHours)

                      return (
                        <td key={m.value} style={{
                          padding: '4px', borderBottom: `1px solid ${BRAND.greyBorder}`,
                          background: isDirty ? BRAND.purpleLight : (val > 0 ? cellColor.bg : 'inherit'),
                        }}>
                          <input type="number" min="0" max="300" step="0.5"
                            value={val || ''} placeholder="0"
                            onChange={e => handleCellChange(emp.id, monthKey, e.target.value)}
                            style={{
                              width: '65px', padding: '4px 6px',
                              border: `1px solid ${isDirty ? BRAND.purple : BRAND.greyBorder}`,
                              background: isDirty ? BRAND.purpleLight : BRAND.white,
                              fontFamily: BRAND.font, fontSize: '13px',
                              color: BRAND.coolGrey, textAlign: 'center',
                            }}
                          />
                        </td>
                      )
                    })}
                    <td style={{
                      padding: '6px 8px', textAlign: 'center',
                      borderBottom: `1px solid ${BRAND.greyBorder}`,
                      color: BRAND.coolGrey, fontWeight: 500, fontSize: '12px',
                    }}>
                      {rowTotal > 0 ? rowTotal.toFixed(0) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {selectedProject && allocatedEmployees.length === 0 && (
        <div style={{ padding: '40px 24px', background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, color: BRAND.coolGrey, fontSize: '14px' }}>
          No employees are allocated to this project yet. Use "Add Employee to Project" above to create allocations.
        </div>
      )}

      {/* Legend */}
      {selectedProject && allocatedEmployees.length > 0 && (
        <div style={{ display: 'flex', gap: '24px', marginTop: '12px', fontSize: '12px', color: BRAND.coolGrey }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '12px', height: '12px', background: BRAND.purpleLight, border: `1px solid ${BRAND.purple}` }} />
            <span>Unsaved change</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '12px', height: '12px', background: '#E8F5E8', border: `1px solid ${BRAND.green}` }} />
            <span>Ideal utilization</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '12px', height: '12px', background: '#FFF4E5', border: `1px solid ${BRAND.amber}` }} />
            <span>Under-utilized</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '12px', height: '12px', background: '#FDECEC', border: `1px solid ${BRAND.red}` }} />
            <span>Over-allocated</span>
          </div>
        </div>
      )}
    </div>
  )
}
