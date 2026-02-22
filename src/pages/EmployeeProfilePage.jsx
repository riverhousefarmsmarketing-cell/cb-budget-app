import { useState, useEffect, useMemo } from 'react'
import { BRAND } from '../lib/brand'
import { formatCurrencyExact, formatPct, formatDate, formatCurrency } from '../lib/utils'
import { supabase } from '../lib/supabase'
import { PCS_SECTOR_ID } from '../hooks/useData'
import { SectionHeader, LoadingState, StatusBadge, DataTable, KPICard, ProjectLink } from '../components/SharedUI'
import { Icons } from '../components/Icons'

export default function EmployeeProfilePage({ employeeId, onBack }) {
  const [employee, setEmployee] = useState(null)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({})
  const [weeklyTotals, setWeeklyTotals] = useState([])
  const [assignments, setAssignments] = useState([])
  const [timesheets, setTimesheets] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)
  const [utilTab, setUtilTab] = useState('utilization')

  useEffect(() => {
    loadEmployee()
    loadWeeklyTotals()
    loadAssignments()
    loadTimesheets()
  }, [employeeId])

  async function loadEmployee() {
    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .eq('id', employeeId)
      .single()
    if (data) {
      setEmployee(data)
      setForm(data)
    }
    setLoading(false)
  }

  async function loadWeeklyTotals() {
    const { data } = await supabase
      .from('v_employee_weekly_totals')
      .select('*')
      .eq('employee_id', employeeId)
      .order('week_ending', { ascending: true })
    setWeeklyTotals(data || [])
  }

  async function loadAssignments() {
    const { data } = await supabase
      .from('planned_weekly_hours')
      .select('*, projects(code, name, type), work_order_rate_lines(label, bill_rate)')
      .eq('employee_id', employeeId)
      .order('week_ending', { ascending: true })
    setAssignments(data || [])
  }

  async function loadTimesheets() {
    const { data } = await supabase
      .from('timesheet_entries')
      .select('*, projects(code, name, type)')
      .eq('employee_id', employeeId)
      .order('week_ending', { ascending: false })
    setTimesheets(data || [])
  }

  async function handleSave() {
    setSaving(true)
    setMessage(null)
    const { error } = await supabase
      .from('employees')
      .update({
        name: form.name,
        role: form.role,
        hourly_cost: parseFloat(form.hourly_cost),
        target_utilization: parseFloat(form.target_utilization),
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        is_active: form.is_active,
      })
      .eq('id', employeeId)

    if (error) {
      setMessage({ type: 'error', text: error.message })
    } else {
      setMessage({ type: 'success', text: 'Employee updated successfully.' })
      setEditing(false)
      loadEmployee()
    }
    setSaving(false)
  }

  // Group assignments by project for summary with margin
  const projectSummary = useMemo(() => {
    const map = {}
    assignments.forEach(a => {
      const code = a.projects?.code || 'Unknown'
      const billRate = a.work_order_rate_lines?.bill_rate ? Number(a.work_order_rate_lines.bill_rate) : 0
      if (!map[code]) {
        map[code] = { code, project_id: a.project_id, name: a.projects?.name, type: a.projects?.type, totalHours: 0, weeks: 0, billRate }
      }
      map[code].totalHours += Number(a.planned_hours)
      map[code].weeks++
      if (billRate > 0) map[code].billRate = billRate
    })
    return Object.values(map)
  }, [assignments])

  // Weeks with warnings
  const warningWeeks = weeklyTotals.filter(w => w.exceeds_40)

  // Utilization from actual timesheets — grouped by month
  const monthlyUtilization = useMemo(() => {
    const byMonth = {}
    timesheets.forEach(t => {
      const d = new Date(t.week_ending)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      if (!byMonth[key]) byMonth[key] = { month: key, billable: 0, overhead: 0, total: 0 }
      const hours = Number(t.hours || 0)
      byMonth[key].total += hours
      if (t.projects?.type === 'billable') byMonth[key].billable += hours
      else byMonth[key].overhead += hours
    })
    // Add utilization rate (assume 173.3 hrs/month standard = 40h x 52w / 12m)
    const stdMonthlyHrs = 173.3
    const target = employee ? Number(employee.target_utilization) : 0.80
    return Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month)).map(m => ({
      ...m,
      utilization: m.total > 0 ? m.billable / stdMonthlyHrs : 0,
      targetMet: m.total > 0 && (m.billable / stdMonthlyHrs) >= target,
    }))
  }, [timesheets, employee])

  // Timesheet project breakdown
  const tsProjectBreakdown = useMemo(() => {
    const byProj = {}
    timesheets.forEach(t => {
      const code = t.projects?.code || 'Unknown'
      if (!byProj[code]) byProj[code] = { code, name: t.projects?.name || '', type: t.projects?.type || 'billable', hours: 0, weeks: 0 }
      byProj[code].hours += Number(t.hours || 0)
      byProj[code].weeks++
    })
    return Object.values(byProj).sort((a, b) => b.hours - a.hours)
  }, [timesheets])

  // Actual totals
  const actualTotalHours = timesheets.reduce((s, t) => s + Number(t.hours || 0), 0)
  const actualBillableHours = timesheets.filter(t => t.projects?.type === 'billable').reduce((s, t) => s + Number(t.hours || 0), 0)
  const actualOverheadHours = actualTotalHours - actualBillableHours
  const tsWeeks = new Set(timesheets.map(t => t.week_ending)).size
  const avgWeeklyHours = tsWeeks > 0 ? actualTotalHours / tsWeeks : 0
  const overallUtilization = actualTotalHours > 0 ? actualBillableHours / actualTotalHours : 0

  // Employee-level margin calculations
  const hourlyCost = employee ? Number(employee.hourly_cost) : 0
  const empTotalHours = projectSummary.filter(p => p.type === 'billable').reduce((s, p) => s + p.totalHours, 0)
  const empTotalRevenue = projectSummary.filter(p => p.type === 'billable').reduce((s, p) => s + (p.totalHours * p.billRate), 0)
  const empTotalCost = projectSummary.reduce((s, p) => s + (p.totalHours * hourlyCost), 0)
  const empMargin = empTotalRevenue - empTotalCost
  const empMarginPct = empTotalRevenue > 0 ? empMargin / empTotalRevenue : 0

  if (loading) return <LoadingState message="Loading employee profile..." />
  if (!employee) return <div style={{ padding: '24px', color: BRAND.coolGrey }}>Employee not found.</div>

  const inputStyle = {
    width: '100%',
    padding: '8px 12px',
    border: `1px solid ${BRAND.greyBorder}`,
    fontFamily: BRAND.font,
    fontSize: '14px',
    color: BRAND.coolGrey,
    background: editing ? BRAND.white : BRAND.greyLight,
    boxSizing: 'border-box',
  }

  return (
    <div>
      {/* Back button */}
      <button
        onClick={onBack}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: BRAND.purple, fontFamily: BRAND.font, fontSize: '13px',
          padding: '0', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '4px',
        }}
      >
        ← Back to Employees
      </button>

      <SectionHeader
        title={employee.name}
        subtitle={`${employee.employee_code} — ${employee.role}`}
        action={
          !editing ? (
            <button
              onClick={() => setEditing(true)}
              style={{
                padding: '8px 20px', background: BRAND.purple, color: BRAND.white,
                border: 'none', cursor: 'pointer', fontFamily: BRAND.font, fontSize: '13px',
              }}
            >
              Edit Profile
            </button>
          ) : (
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => { setEditing(false); setForm(employee) }}
                style={{
                  padding: '8px 20px', background: BRAND.white, color: BRAND.coolGrey,
                  border: `1px solid ${BRAND.greyBorder}`, cursor: 'pointer', fontFamily: BRAND.font, fontSize: '13px',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  padding: '8px 20px', background: BRAND.purple, color: BRAND.white,
                  border: 'none', cursor: 'pointer', fontFamily: BRAND.font, fontSize: '13px',
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          )
        }
      />

      {message && (
        <div style={{
          padding: '10px 16px', marginBottom: '16px', fontSize: '13px',
          background: message.type === 'error' ? '#FDECEC' : '#E8F5E8',
          color: message.type === 'error' ? BRAND.red : BRAND.green,
        }}>
          {message.text}
        </div>
      )}

      {/* Profile Form */}
      <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, padding: '24px', marginBottom: '24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: BRAND.coolGrey, marginBottom: '4px' }}>Employee Code</label>
            <input value={form.employee_code || ''} disabled style={{ ...inputStyle, background: BRAND.greyLight }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: BRAND.coolGrey, marginBottom: '4px' }}>Name</label>
            <input value={form.name || ''} disabled={!editing} onChange={e => setForm({ ...form, name: e.target.value })} style={inputStyle} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: BRAND.coolGrey, marginBottom: '4px' }}>Role</label>
            <input value={form.role || ''} disabled={!editing} onChange={e => setForm({ ...form, role: e.target.value })} style={inputStyle} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: BRAND.coolGrey, marginBottom: '4px' }}>Hourly Cost ($)</label>
            <input type="number" step="0.01" value={form.hourly_cost || ''} disabled={!editing} onChange={e => setForm({ ...form, hourly_cost: e.target.value })} style={inputStyle} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: BRAND.coolGrey, marginBottom: '4px' }}>Target Utilization (0.00 - 1.00)</label>
            <input type="number" step="0.01" min="0" max="1" value={form.target_utilization || ''} disabled={!editing} onChange={e => setForm({ ...form, target_utilization: e.target.value })} style={inputStyle} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: BRAND.coolGrey, marginBottom: '4px' }}>Start Date</label>
            <input type="date" value={form.start_date || ''} disabled={!editing} onChange={e => setForm({ ...form, start_date: e.target.value })} style={inputStyle} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: BRAND.coolGrey, marginBottom: '4px' }}>End Date</label>
            <input type="date" value={form.end_date || ''} disabled={!editing} onChange={e => setForm({ ...form, end_date: e.target.value })} style={inputStyle} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: BRAND.coolGrey, marginBottom: '4px' }}>Status</label>
            <select
              value={form.is_active ? 'active' : 'inactive'}
              disabled={!editing}
              onChange={e => setForm({ ...form, is_active: e.target.value === 'active' })}
              style={inputStyle}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>
      </div>

      {/* Employee Margin KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        <KPICard label="Hourly Cost" value={formatCurrencyExact(hourlyCost)} />
        <KPICard label="Billable Hours (Plan)" value={empTotalHours.toFixed(0)} />
        <KPICard label="Billable Hours (Actual)" value={actualBillableHours.toFixed(0)} color={BRAND.blue} />
        <KPICard label="Actual Utilization" value={formatPct(overallUtilization)} color={overallUtilization >= Number(employee?.target_utilization || 0.8) ? BRAND.green : BRAND.red} />
        <KPICard label="Avg Weekly Hours" value={avgWeeklyHours.toFixed(1)} />
        <KPICard label="Planned Revenue" value={formatCurrency(empTotalRevenue)} />
        <KPICard label="Margin" value={formatPct(empMarginPct)} subValue={formatCurrency(empMargin)} color={empMarginPct > 0.3 ? BRAND.green : empMarginPct > 0.15 ? BRAND.amber : BRAND.red} />
      </div>

      {/* Tab bar for lower sections */}
      <div style={{ display: 'flex', gap: 0, borderBottom: `2px solid ${BRAND.greyBorder}`, marginBottom: '20px' }}>
        {[
          { key: 'utilization', label: 'Utilization' },
          { key: 'assignments', label: 'Project Assignments' },
          { key: 'timesheets', label: `Timesheet Detail (${timesheets.length})` },
          { key: 'weekly', label: 'Weekly Totals' },
        ].map(t => (
          <button key={t.key} onClick={() => setUtilTab(t.key)} style={{
            padding: '10px 20px', fontFamily: BRAND.font, fontSize: '13px', cursor: 'pointer',
            background: utilTab === t.key ? BRAND.purple : 'transparent',
            color: utilTab === t.key ? BRAND.white : BRAND.coolGrey,
            border: 'none', borderBottom: utilTab === t.key ? `2px solid ${BRAND.purple}` : '2px solid transparent',
            marginBottom: '-2px',
          }}>{t.label}</button>
        ))}
      </div>

      {/* UTILIZATION TAB */}
      {utilTab === 'utilization' && (
        <div>
          {/* Monthly utilization bars */}
          {monthlyUtilization.length === 0 ? (
            <div style={{ padding: '24px', background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, color: BRAND.coolGrey, fontSize: '13px' }}>No timesheet data available. Upload timesheets to see utilization metrics.</div>
          ) : (
            <>
              <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, padding: '20px', marginBottom: '20px' }}>
                <span style={{ fontSize: '14px', color: BRAND.purple, display: 'block', marginBottom: '16px' }}>Monthly Utilization (Actual from Timesheets)</span>
                {monthlyUtilization.map(m => {
                  const target = Number(employee?.target_utilization || 0.8)
                  const pct = m.utilization
                  const barColor = pct >= target ? BRAND.green : pct >= target * 0.8 ? BRAND.amber : BRAND.red
                  return (
                    <div key={m.month} style={{ marginBottom: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: BRAND.coolGrey, marginBottom: '4px' }}>
                        <span>{new Date(m.month + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
                        <span>{m.billable.toFixed(0)}h billable / {m.overhead.toFixed(0)}h overhead / {m.total.toFixed(0)}h total — <span style={{ color: barColor, fontWeight: 600 }}>{(pct * 100).toFixed(1)}%</span></span>
                      </div>
                      <div style={{ height: '12px', background: BRAND.greyLight, position: 'relative' }}>
                        <div style={{ height: '100%', width: `${Math.min(pct * 100, 100)}%`, background: barColor, transition: 'width 0.3s' }} />
                        {/* Target line */}
                        <div style={{ position: 'absolute', left: `${target * 100}%`, top: 0, bottom: 0, width: '2px', background: BRAND.purple, opacity: 0.7 }} />
                      </div>
                    </div>
                  )
                })}
                <div style={{ fontSize: '11px', color: BRAND.coolGrey, marginTop: '8px' }}>
                  Purple line = target utilization ({formatPct(Number(employee?.target_utilization || 0.8))}). Based on 173.3 standard hours per month.
                </div>
              </div>

              {/* Project split from timesheets */}
              <span style={{ fontSize: '14px', color: BRAND.purple, display: 'block', marginBottom: '12px' }}>Hours by Project (Actual)</span>
              <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, overflow: 'auto', marginBottom: '20px' }}>
                <DataTable
                  columns={[
                    { header: 'Project', accessor: 'code', nowrap: true },
                    { header: 'Name', accessor: 'name' },
                    { header: 'Type', render: r => <StatusBadge status={r.type} map={{ billable: { bg: '#E8F5E8', text: BRAND.green, label: 'Billable' }, overhead: { bg: BRAND.greyLight, text: BRAND.coolGrey, label: 'Overhead' } }} /> },
                    { header: 'Total Hours', render: r => r.hours.toFixed(1), nowrap: true },
                    { header: '% of Total', render: r => actualTotalHours > 0 ? formatPct(r.hours / actualTotalHours) : '—', nowrap: true },
                  ]}
                  data={tsProjectBreakdown}
                />
              </div>

              {/* Planned vs Actual summary */}
              <span style={{ fontSize: '14px', color: BRAND.purple, display: 'block', marginBottom: '12px' }}>Planned vs Actual</span>
              <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, padding: '20px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
                  <KPICard label="Planned Billable" value={empTotalHours.toFixed(0) + 'h'} />
                  <KPICard label="Actual Billable" value={actualBillableHours.toFixed(0) + 'h'} color={BRAND.blue} />
                  <KPICard label="Variance" value={((actualBillableHours - empTotalHours).toFixed(0)) + 'h'} color={actualBillableHours >= empTotalHours ? BRAND.green : BRAND.red} subValue={empTotalHours > 0 ? `${((actualBillableHours / empTotalHours - 1) * 100).toFixed(0)}%` : ''} />
                  <KPICard label="Planned Revenue" value={formatCurrency(empTotalRevenue)} />
                  <KPICard label="Actual Revenue" value={formatCurrency(actualBillableHours * (empTotalHours > 0 ? empTotalRevenue / empTotalHours : 0))} color={BRAND.blue} />
                  <KPICard label="Target Util." value={formatPct(Number(employee?.target_utilization || 0.8))} />
                  <KPICard label="Actual Util." value={formatPct(overallUtilization)} color={overallUtilization >= Number(employee?.target_utilization || 0.8) ? BRAND.green : BRAND.red} />
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* 40-Hour Warnings */}
      {warningWeeks.length > 0 && (
        <div style={{
          background: '#FDECEC', border: `1px solid ${BRAND.red}`, padding: '16px 24px',
          marginBottom: '24px', fontSize: '14px', color: BRAND.red,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <Icons.AlertCircle />
            <span>{warningWeeks.length} week(s) exceed 40 planned hours</span>
          </div>
          <div style={{ fontSize: '12px', color: BRAND.coolGrey }}>
            {warningWeeks.slice(0, 5).map(w => (
              <span key={w.week_ending} style={{ marginRight: '12px' }}>
                w/e {formatDate(w.week_ending)}: {Number(w.total_planned_hours).toFixed(1)}h
              </span>
            ))}
            {warningWeeks.length > 5 && <span>...and {warningWeeks.length - 5} more</span>}
          </div>
        </div>
      )}

      {/* ASSIGNMENTS TAB */}
      {utilTab === 'assignments' && (
      <div style={{ marginBottom: '24px' }}>
        <span style={{ fontSize: '15px', color: BRAND.purple, display: 'block', marginBottom: '12px' }}>Project Assignments (Planned)</span>
        <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}` }}>
          <DataTable
            columns={[
              { header: 'Project', accessor: 'code', nowrap: true },
              { header: 'Name', render: r => r.project_id ? <ProjectLink id={r.project_id}>{r.name}</ProjectLink> : r.name },
              { header: 'Type', render: r => (
                <StatusBadge status={r.type} map={{
                  billable: { bg: '#E8F5E8', text: BRAND.green, label: 'Billable' },
                  overhead: { bg: BRAND.greyLight, text: BRAND.coolGrey, label: 'Overhead' },
                }} />
              ) },
              { header: 'Hours', render: r => r.totalHours.toFixed(1), nowrap: true },
              { header: 'Bill Rate', render: r => r.billRate > 0 ? formatCurrencyExact(r.billRate) : '—', nowrap: true },
              { header: 'Revenue', render: r => r.type === 'billable' ? formatCurrency(r.totalHours * r.billRate) : '—', nowrap: true },
              { header: 'Cost', render: r => formatCurrency(r.totalHours * hourlyCost), nowrap: true },
              { header: 'Margin', render: r => {
                if (r.type !== 'billable') return <span style={{ color: BRAND.coolGrey }}>—</span>
                const rev = r.totalHours * r.billRate
                const cost = r.totalHours * hourlyCost
                const m = rev - cost
                const pct = rev > 0 ? m / rev : 0
                return <span style={{ color: pct > 0.3 ? BRAND.green : pct > 0.15 ? BRAND.amber : BRAND.red }}>{formatPct(pct)} ({formatCurrency(m)})</span>
              }, nowrap: true },
            ]}
            data={projectSummary}
            emptyMessage="No project assignments yet. Use the Hours Grid to assign this employee to projects."
          />
        </div>
      </div>
      )}

      {/* TIMESHEETS TAB */}
      {utilTab === 'timesheets' && (
        <div>
          {timesheets.length === 0 ? (
            <div style={{ padding: '24px', background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, color: BRAND.coolGrey, fontSize: '13px' }}>No timesheet entries for this employee.</div>
          ) : (
            <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, overflow: 'auto' }}>
              <DataTable
                columns={[
                  { header: 'Week Ending', render: r => formatDate(r.week_ending), nowrap: true },
                  { header: 'Project', render: r => `${r.projects?.code || '—'} — ${r.projects?.name || ''}` },
                  { header: 'Type', render: r => <StatusBadge status={r.projects?.type || 'billable'} map={{ billable: { bg: '#E8F5E8', text: BRAND.green, label: 'Billable' }, overhead: { bg: BRAND.greyLight, text: BRAND.coolGrey, label: 'Overhead' } }} /> },
                  { header: 'Hours', render: r => Number(r.hours).toFixed(1), nowrap: true },
                ]}
                data={timesheets}
              />
            </div>
          )}
        </div>
      )}

      {/* WEEKLY TOTALS TAB */}
      {utilTab === 'weekly' && weeklyTotals.length > 0 && (
        <div>
          <span style={{ fontSize: '15px', color: BRAND.purple, display: 'block', marginBottom: '12px' }}>Weekly Hours (all projects combined)</span>
          <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}` }}>
            <DataTable
              columns={[
                { header: 'Week Ending', render: r => formatDate(r.week_ending), nowrap: true },
                { header: 'Planned Hours', render: r => (
                  <span style={{ color: r.exceeds_40 ? BRAND.red : BRAND.coolGrey }}>
                    {Number(r.total_planned_hours).toFixed(1)}
                    {r.exceeds_40 && ` (+${Number(r.hours_over).toFixed(1)} over)`}
                  </span>
                ), nowrap: true },
                { header: 'Actual Hours', render: r => Number(r.total_actual_hours) > 0 ? Number(r.total_actual_hours).toFixed(1) : '—', nowrap: true },
                { header: 'Status', render: r => (
                  <StatusBadge
                    status={r.exceeds_40 ? 'over' : 'ok'}
                    map={{
                      over: { bg: '#FDECEC', text: BRAND.red, label: 'Over 40h' },
                      ok: { bg: '#E8F5E8', text: BRAND.green, label: 'OK' },
                    }}
                  />
                ) },
              ]}
              data={weeklyTotals}
            />
          </div>
        </div>
      )}
    </div>
  )
}
