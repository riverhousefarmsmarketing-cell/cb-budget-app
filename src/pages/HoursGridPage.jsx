import { useState, useEffect } from 'react'
import { BRAND } from '../lib/brand'
import { supabase } from '../lib/supabase'
import { PCS_SECTOR_ID, useEmployees, useProjects } from '../hooks/useData'
import { SectionHeader, LoadingState } from '../components/SharedUI'

export default function HoursGridPage({ embedded }) {
  const { data: employees, loading: empLoading } = useEmployees()
  const { data: projects, loading: projLoading } = useProjects()
  const [workOrders, setWorkOrders] = useState([])
  const [rateLines, setRateLines] = useState([])
  const [selectedProject, setSelectedProject] = useState('')
  const [projectWO, setProjectWO] = useState(null)
  const [weekEndings, setWeekEndings] = useState([])
  const [gridData, setGridData] = useState({})
  const [rateMappings, setRateMappings] = useState({}) // { empId: rate_line_id }
  const [weeklyTotals, setWeeklyTotals] = useState({})
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)
  const [selectedMonth, setSelectedMonth] = useState('2026-01')
  const [dirty, setDirty] = useState(new Set())
  const [dirtyRates, setDirtyRates] = useState(new Set())

  // Load WOs and rate lines
  useEffect(() => {
    supabase.from('work_orders').select('id, po_reference, name, client_id')
      .eq('sector_id', PCS_SECTOR_ID).then(({ data }) => setWorkOrders(data || []))
  }, [])

  // When project changes, load its WO and rate lines
  useEffect(() => {
    if (!selectedProject) { setProjectWO(null); setRateLines([]); return }
    const proj = projects.find(p => p.id === selectedProject)
    if (proj?.work_order_id) {
      const wo = workOrders.find(w => w.id === proj.work_order_id)
      setProjectWO(wo || null)
      supabase.from('work_order_rate_lines').select('*')
        .eq('work_order_id', proj.work_order_id).order('sort_order')
        .then(({ data }) => setRateLines(data || []))
    } else {
      setProjectWO(null); setRateLines([])
    }
  }, [selectedProject, projects, workOrders])

  useEffect(() => { loadWeekEndings() }, [selectedMonth])

  useEffect(() => {
    if (selectedProject && weekEndings.length > 0) {
      loadHoursForProject()
      loadWeeklyTotals()
      loadRateMappings()
    }
  }, [selectedProject, weekEndings])

  async function loadWeekEndings() {
    const monthStart = `${selectedMonth}-01`
    const nextMonth = new Date(monthStart)
    nextMonth.setMonth(nextMonth.getMonth() + 1)
    const { data } = await supabase.from('week_endings').select('week_ending')
      .gte('week_ending', monthStart).lt('week_ending', nextMonth.toISOString().slice(0, 10))
      .order('week_ending')
    setWeekEndings((data || []).map(d => d.week_ending))
  }

  async function loadHoursForProject() {
    const { data } = await supabase.from('planned_weekly_hours')
      .select('employee_id, week_ending, planned_hours')
      .eq('project_id', selectedProject).eq('sector_id', PCS_SECTOR_ID)
      .in('week_ending', weekEndings)
    const map = {}
    ;(data || []).forEach(d => { map[`${d.employee_id}|${d.week_ending}`] = Number(d.planned_hours) })
    setGridData(map); setDirty(new Set())
  }

  async function loadWeeklyTotals() {
    const { data } = await supabase.from('v_employee_weekly_totals')
      .select('employee_id, week_ending, total_planned_hours')
      .eq('sector_id', PCS_SECTOR_ID).in('week_ending', weekEndings)
    const map = {}
    ;(data || []).forEach(d => { map[`${d.employee_id}|${d.week_ending}`] = Number(d.total_planned_hours) })
    setWeeklyTotals(map)
  }

  async function loadRateMappings() {
    // Get rate_line_id for each employee on this project (from most recent entry)
    const { data } = await supabase.from('planned_weekly_hours')
      .select('employee_id, rate_line_id')
      .eq('project_id', selectedProject).eq('sector_id', PCS_SECTOR_ID)
      .not('rate_line_id', 'is', null)
      .order('week_ending', { ascending: false })
    const map = {}
    ;(data || []).forEach(d => { if (!map[d.employee_id]) map[d.employee_id] = d.rate_line_id })
    setRateMappings(map); setDirtyRates(new Set())
  }

  function handleCellChange(empId, weekEnding, value) {
    const key = `${empId}|${weekEnding}`
    setGridData(prev => ({ ...prev, [key]: value === '' ? 0 : parseFloat(value) }))
    setDirty(prev => new Set(prev).add(key))
  }

  function handleRateChange(empId, rateLineId) {
    setRateMappings(prev => ({ ...prev, [empId]: rateLineId }))
    setDirtyRates(prev => new Set(prev).add(empId))
  }

  async function handleSave() {
    if (dirty.size === 0 && dirtyRates.size === 0) return
    setSaving(true); setMessage(null)

    // Build upserts for hours
    const upserts = Array.from(dirty).map(key => {
      const [employee_id, week_ending] = key.split('|')
      return {
        sector_id: PCS_SECTOR_ID, employee_id, project_id: selectedProject,
        week_ending, planned_hours: gridData[key] || 0,
        rate_line_id: rateMappings[employee_id] || null,
      }
    })

    // Also update rate_line_id for dirty rate changes (even if hours didn't change)
    for (const empId of dirtyRates) {
      if (!Array.from(dirty).some(k => k.startsWith(empId))) {
        // Rate changed but no hours changed — update existing rows for this employee/project
        await supabase.from('planned_weekly_hours')
          .update({ rate_line_id: rateMappings[empId] || null })
          .eq('employee_id', empId).eq('project_id', selectedProject).eq('sector_id', PCS_SECTOR_ID)
      }
    }

    if (upserts.length > 0) {
      const { error } = await supabase.from('planned_weekly_hours')
        .upsert(upserts, { onConflict: 'sector_id,employee_id,project_id,week_ending' })
      if (error) { setMessage({ type: 'error', text: error.message }); setSaving(false); return }
    }

    setMessage({ type: 'success', text: `Saved ${upserts.length} cell(s) and ${dirtyRates.size} rate assignment(s).` })
    setDirty(new Set()); setDirtyRates(new Set())
    loadWeeklyTotals()
    setSaving(false)
  }

  const months = [
    { value: '2026-01', label: 'January' }, { value: '2026-02', label: 'February' },
    { value: '2026-03', label: 'March' }, { value: '2026-04', label: 'April' },
    { value: '2026-05', label: 'May' }, { value: '2026-06', label: 'June' },
    { value: '2026-07', label: 'July' }, { value: '2026-08', label: 'August' },
    { value: '2026-09', label: 'September' }, { value: '2026-10', label: 'October' },
    { value: '2026-11', label: 'November' }, { value: '2026-12', label: 'December' },
  ]

  const billableProjects = projects.filter(p => p.type === 'billable')
  const overheadProjects = projects.filter(p => p.type === 'overhead')
  const totalChanges = dirty.size + dirtyRates.size

  if (empLoading || projLoading) return <LoadingState message="Loading hours grid..." />

  return (
    <div>
      {!embedded && <SectionHeader title="Hours Grid" subtitle="Enter weekly planned hours per employee per project" />}

      {/* Controls */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <label style={{ display: 'block', fontSize: '12px', color: BRAND.coolGrey, marginBottom: '4px' }}>Project</label>
          <select value={selectedProject} onChange={e => setSelectedProject(e.target.value)} style={{
            padding: '8px 12px', minWidth: '300px', border: `1px solid ${BRAND.greyBorder}`,
            background: BRAND.white, fontFamily: BRAND.font, fontSize: '13px', color: BRAND.coolGrey,
          }}>
            <option value="">Select a project...</option>
            <optgroup label="Billable">
              {billableProjects.map(p => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
            </optgroup>
            <optgroup label="Overhead">
              {overheadProjects.map(p => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
            </optgroup>
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '12px', color: BRAND.coolGrey, marginBottom: '4px' }}>Month</label>
          <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} style={{
            padding: '8px 12px', border: `1px solid ${BRAND.greyBorder}`,
            background: BRAND.white, fontFamily: BRAND.font, fontSize: '13px', color: BRAND.coolGrey,
          }}>
            {months.map(m => <option key={m.value} value={m.value}>{m.label} 2026</option>)}
          </select>
        </div>
        {totalChanges > 0 && (
          <button onClick={handleSave} disabled={saving} style={{
            padding: '8px 24px', background: BRAND.purple, color: BRAND.white,
            border: 'none', cursor: 'pointer', fontFamily: BRAND.font, fontSize: '13px',
            opacity: saving ? 0.7 : 1,
          }}>{saving ? 'Saving...' : `Save (${totalChanges} changes)`}</button>
        )}
      </div>

      {/* WO info bar */}
      {selectedProject && projectWO && (
        <div style={{
          background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, padding: '10px 16px',
          marginBottom: '12px', fontSize: '13px', color: BRAND.coolGrey, display: 'flex', gap: '24px',
        }}>
          <span>WO: <span style={{ color: BRAND.purple }}>{projectWO.po_reference}</span></span>
          {rateLines.length > 0 && <span>Rate lines: {rateLines.map(rl => `${rl.label} ($${rl.bill_rate})`).join(', ')}</span>}
        </div>
      )}

      {message && (
        <div style={{ padding: '10px 16px', marginBottom: '16px', fontSize: '13px',
          background: message.type === 'error' ? '#FDECEC' : '#E8F5E8',
          color: message.type === 'error' ? BRAND.red : BRAND.green,
        }}>{message.text}</div>
      )}

      {!selectedProject && (
        <div style={{ padding: '40px 24px', background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, color: BRAND.coolGrey, fontSize: '14px' }}>
          Select a project above to begin entering planned hours.
        </div>
      )}

      {/* The Grid */}
      {selectedProject && weekEndings.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr>
                <th style={{ background: BRAND.purple, color: BRAND.white, padding: '10px 12px', textAlign: 'left', fontWeight: 400, position: 'sticky', left: 0, zIndex: 2, minWidth: '180px' }}>Employee</th>
                {rateLines.length > 0 && (
                  <th style={{ background: BRAND.purple, color: BRAND.white, padding: '10px 8px', textAlign: 'left', fontWeight: 400, minWidth: '140px' }}>Rate Line</th>
                )}
                {weekEndings.map(we => (
                  <th key={we} style={{ background: BRAND.purple, color: BRAND.white, padding: '10px 8px', textAlign: 'left', fontWeight: 400, minWidth: '90px' }}>
                    w/e {new Date(we).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </th>
                ))}
                <th style={{ background: BRAND.purple, color: BRAND.white, padding: '10px 8px', textAlign: 'left', fontWeight: 400, minWidth: '70px' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {employees.filter(e => e.is_active).map((emp, empIdx) => {
                let rowTotal = 0
                return (
                  <tr key={emp.id} style={{ background: empIdx % 2 === 0 ? BRAND.white : BRAND.greyLight }}>
                    <td style={{
                      padding: '6px 12px', color: BRAND.coolGrey, borderBottom: `1px solid ${BRAND.greyBorder}`,
                      whiteSpace: 'nowrap', position: 'sticky', left: 0, zIndex: 1,
                      background: empIdx % 2 === 0 ? BRAND.white : BRAND.greyLight,
                    }}>
                      <div>{emp.name}</div>
                      <div style={{ fontSize: '11px', color: '#999' }}>{emp.role}</div>
                    </td>
                    {rateLines.length > 0 && (
                      <td style={{ padding: '4px 4px', borderBottom: `1px solid ${BRAND.greyBorder}` }}>
                        <select
                          value={rateMappings[emp.id] || ''}
                          onChange={e => handleRateChange(emp.id, e.target.value)}
                          style={{
                            width: '130px', padding: '4px 6px', border: `1px solid ${dirtyRates.has(emp.id) ? BRAND.purple : BRAND.greyBorder}`,
                            fontFamily: BRAND.font, fontSize: '11px', color: BRAND.coolGrey,
                            background: dirtyRates.has(emp.id) ? BRAND.purpleLight : BRAND.white,
                          }}
                        >
                          <option value="">No rate</option>
                          {rateLines.map(rl => (
                            <option key={rl.id} value={rl.id}>{rl.label} (${rl.bill_rate})</option>
                          ))}
                        </select>
                      </td>
                    )}
                    {weekEndings.map(we => {
                      const key = `${emp.id}|${we}`
                      const val = gridData[key] || 0
                      rowTotal += val
                      const weekTotal = weeklyTotals[key] || 0
                      const isOver = weekTotal > 40
                      const isDirty = dirty.has(key)
                      return (
                        <td key={we} style={{ padding: '4px', borderBottom: `1px solid ${BRAND.greyBorder}`, background: isOver ? '#FDECEC' : 'inherit' }}>
                          <input type="number" min="0" max="80" step="0.5" value={val || ''} placeholder="0"
                            onChange={e => handleCellChange(emp.id, we, e.target.value)}
                            style={{
                              width: '70px', padding: '4px 6px',
                              border: `1px solid ${isDirty ? BRAND.purple : BRAND.greyBorder}`,
                              background: isDirty ? BRAND.purpleLight : BRAND.white,
                              fontFamily: BRAND.font, fontSize: '13px',
                              color: isOver ? BRAND.red : BRAND.coolGrey, textAlign: 'left',
                            }}
                            title={isOver ? `Week total: ${weekTotal}h (exceeds 40h)` : `Week total: ${weekTotal}h`}
                          />
                          {isOver && <div style={{ fontSize: '10px', color: BRAND.red, marginTop: '2px' }}>{weekTotal.toFixed(1)}h total</div>}
                        </td>
                      )
                    })}
                    <td style={{ padding: '6px 8px', color: BRAND.coolGrey, borderBottom: `1px solid ${BRAND.greyBorder}` }}>
                      {rowTotal > 0 ? rowTotal.toFixed(1) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Legend */}
      {selectedProject && weekEndings.length > 0 && (
        <div style={{ display: 'flex', gap: '24px', marginTop: '12px', fontSize: '12px', color: BRAND.coolGrey }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '12px', height: '12px', background: '#FDECEC', border: `1px solid ${BRAND.red}` }} />
            <span>Week exceeds 40 hours (all projects)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '12px', height: '12px', background: BRAND.purpleLight, border: `1px solid ${BRAND.purple}` }} />
            <span>Unsaved change</span>
          </div>
        </div>
      )}
    </div>
  )
}
