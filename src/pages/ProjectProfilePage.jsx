import { useState, useEffect, useMemo } from 'react'
import { BRAND } from '../lib/brand'
import { formatCurrencyExact, formatCurrency, formatDate, formatPct } from '../lib/utils'
import { supabase } from '../lib/supabase'
import { PCS_SECTOR_ID, useClients } from '../hooks/useData'
import { SectionHeader, LoadingState, StatusBadge, DataTable, KPICard, EmployeeLink } from '../components/SharedUI'

export default function ProjectProfilePage({ projectId, onBack }) {
  const [project, setProject] = useState(null)
  const [workOrder, setWorkOrder] = useState(null)
  const [rateLines, setRateLines] = useState([])
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({})
  const [assignments, setAssignments] = useState([])
  const [invoices, setInvoices] = useState([])
  const [workOrders, setWorkOrders] = useState([])
  const { data: clients } = useClients()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)

  useEffect(() => { loadAll() }, [projectId])

  async function loadAll() {
    setLoading(true)
    const { data: proj } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single()

    if (!proj) { setLoading(false); return }
    setProject(proj)
    setForm({
      name: proj.name, code: proj.code, type: proj.type,
      rate_type: proj.rate_type, adjusted_bill_rate: proj.adjusted_bill_rate || '',
      effective_start: proj.effective_start || '', effective_end: proj.effective_end || '',
      client_id: proj.client_id || '', work_order_id: proj.work_order_id || '',
      is_active: proj.is_active,
    })

    // Load work order + rate lines if linked
    if (proj.work_order_id) {
      const [woRes, rlRes] = await Promise.all([
        supabase.from('work_orders').select('*').eq('id', proj.work_order_id).single(),
        supabase.from('work_order_rate_lines').select('*').eq('work_order_id', proj.work_order_id).order('sort_order'),
      ])
      setWorkOrder(woRes.data)
      setRateLines(rlRes.data || [])
    }

    // Load all WOs for dropdown
    const { data: allWOs } = await supabase.from('work_orders').select('id, po_reference, name, client_id').eq('sector_id', PCS_SECTOR_ID)
    setWorkOrders(allWOs || [])

    // Load assignments
    const { data: asgn } = await supabase
      .from('planned_weekly_hours')
      .select('*, employees(employee_code, name, role, hourly_cost), work_order_rate_lines(label, bill_rate)')
      .eq('project_id', projectId)
      .order('week_ending', { ascending: true })
    setAssignments(asgn || [])

    // Load invoices for this project's client
    if (proj.client_id) {
      const { data: inv } = await supabase.from('invoices').select('*').eq('client_id', proj.client_id).eq('sector_id', PCS_SECTOR_ID).order('billing_month', { ascending: false })
      setInvoices(inv || [])
    }

    setLoading(false)
  }

  async function handleSave() {
    setSaving(true); setMessage(null)
    const { error } = await supabase.from('projects').update({
      name: form.name, type: form.type, rate_type: form.rate_type,
      adjusted_bill_rate: form.adjusted_bill_rate ? parseFloat(form.adjusted_bill_rate) : null,
      effective_start: form.effective_start || null, effective_end: form.effective_end || null,
      client_id: form.client_id || null, work_order_id: form.work_order_id || null,
      is_active: form.is_active,
    }).eq('id', projectId)

    if (error) { setMessage({ type: 'error', text: error.message }) }
    else { setMessage({ type: 'success', text: 'Project updated.' }); setEditing(false); loadAll() }
    setSaving(false)
  }

  const employeeSummary = useMemo(() => {
    const map = {}
    assignments.forEach(a => {
      const empId = a.employee_id
      if (!map[empId]) {
        map[empId] = {
          employee_id: empId,
          employee_code: a.employees?.employee_code, name: a.employees?.name,
          role: a.employees?.role, hourly_cost: a.employees?.hourly_cost,
          rate_line_label: a.work_order_rate_lines?.label || '—',
          bill_rate: a.work_order_rate_lines?.bill_rate || 0,
          totalHours: 0, weeks: 0,
        }
      }
      map[empId].totalHours += Number(a.planned_hours)
      map[empId].weeks++
    })
    return Object.values(map)
  }, [assignments])

  if (loading) return <LoadingState message="Loading project profile..." />
  if (!project) return <div style={{ padding: '24px', color: BRAND.coolGrey }}>Project not found.</div>

  const client = clients.find(c => c.id === project.client_id)
  const totalPlannedHours = employeeSummary.reduce((s, e) => s + e.totalHours, 0)
  const totalInvoiced = invoices.reduce((s, i) => s + Number(i.amount), 0)
  const woBudget = workOrder?.budget ? Number(workOrder.budget) : 0

  // Margin calculations per project
  const totalPlannedRevenue = employeeSummary.reduce((s, e) => s + (e.totalHours * Number(e.bill_rate || 0)), 0)
  const totalPlannedCost = employeeSummary.reduce((s, e) => s + (e.totalHours * Number(e.hourly_cost || 0)), 0)
  const projectMargin = totalPlannedRevenue - totalPlannedCost
  const projectMarginPct = totalPlannedRevenue > 0 ? projectMargin / totalPlannedRevenue : 0

  const inputStyle = {
    width: '100%', padding: '8px 12px', border: `1px solid ${BRAND.greyBorder}`,
    fontFamily: BRAND.font, fontSize: '14px', color: BRAND.coolGrey,
    background: editing ? BRAND.white : BRAND.greyLight, boxSizing: 'border-box',
  }

  return (
    <div>
      <button onClick={onBack} style={{
        background: 'none', border: 'none', cursor: 'pointer', color: BRAND.purple,
        fontFamily: BRAND.font, fontSize: '13px', padding: 0, marginBottom: '16px',
      }}>← Back to Projects</button>

      <SectionHeader
        title={`${project.code} — ${project.name}`}
        subtitle={[
          client ? client.name : null,
          workOrder ? `PO: ${workOrder.po_reference}` : null,
        ].filter(Boolean).join(' | ') || 'No client or work order assigned'}
        action={
          !editing ? (
            <button onClick={() => setEditing(true)} style={{
              padding: '8px 20px', background: BRAND.purple, color: BRAND.white,
              border: 'none', cursor: 'pointer', fontFamily: BRAND.font, fontSize: '13px',
            }}>Edit Project</button>
          ) : (
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => { setEditing(false); loadAll() }} style={{
                padding: '8px 20px', background: BRAND.white, color: BRAND.coolGrey,
                border: `1px solid ${BRAND.greyBorder}`, cursor: 'pointer', fontFamily: BRAND.font, fontSize: '13px',
              }}>Cancel</button>
              <button onClick={handleSave} disabled={saving} style={{
                padding: '8px 20px', background: BRAND.purple, color: BRAND.white,
                border: 'none', cursor: 'pointer', fontFamily: BRAND.font, fontSize: '13px',
              }}>{saving ? 'Saving...' : 'Save'}</button>
            </div>
          )
        }
      />

      {message && (
        <div style={{ padding: '10px 16px', marginBottom: '16px', fontSize: '13px',
          background: message.type === 'error' ? '#FDECEC' : '#E8F5E8',
          color: message.type === 'error' ? BRAND.red : BRAND.green,
        }}>{message.text}</div>
      )}

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        <KPICard label="WO Budget" value={woBudget ? formatCurrency(woBudget) : '—'} />
        <KPICard label="Total Invoiced" value={formatCurrency(totalInvoiced)} color={BRAND.teal} />
        <KPICard label="WO Remaining" value={woBudget ? formatCurrency(woBudget - totalInvoiced) : '—'} color={woBudget - totalInvoiced < 0 ? BRAND.red : BRAND.green} />
        <KPICard label="Planned Revenue" value={formatCurrency(totalPlannedRevenue)} color={BRAND.blue} />
        <KPICard label="Planned Cost" value={formatCurrency(totalPlannedCost)} />
        <KPICard label="Project Margin" value={formatPct(projectMarginPct)} subValue={formatCurrency(projectMargin)} color={projectMarginPct > 0.3 ? BRAND.green : projectMarginPct > 0.15 ? BRAND.amber : BRAND.red} />
        <KPICard label="Planned Hours" value={totalPlannedHours.toFixed(0)} />
      </div>

      {/* Project Details Form */}
      <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, padding: '24px', marginBottom: '24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: BRAND.coolGrey, marginBottom: '4px' }}>Project Code</label>
            <input value={form.code || ''} disabled style={{ ...inputStyle, background: BRAND.greyLight }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: BRAND.coolGrey, marginBottom: '4px' }}>Name</label>
            <input value={form.name || ''} disabled={!editing} onChange={e => setForm({ ...form, name: e.target.value })} style={inputStyle} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: BRAND.coolGrey, marginBottom: '4px' }}>Client</label>
            <select value={form.client_id || ''} disabled={!editing} onChange={e => setForm({ ...form, client_id: e.target.value })} style={inputStyle}>
              <option value="">No client</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: BRAND.coolGrey, marginBottom: '4px' }}>Work Order</label>
            <select value={form.work_order_id || ''} disabled={!editing} onChange={e => setForm({ ...form, work_order_id: e.target.value })} style={inputStyle}>
              <option value="">No work order</option>
              {workOrders.filter(w => !form.client_id || w.client_id === form.client_id).map(w => (
                <option key={w.id} value={w.id}>{w.po_reference}{w.name ? ` — ${w.name}` : ''}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: BRAND.coolGrey, marginBottom: '4px' }}>Type</label>
            <select value={form.type || 'billable'} disabled={!editing} onChange={e => setForm({ ...form, type: e.target.value })} style={inputStyle}>
              <option value="billable">Billable</option>
              <option value="overhead">Overhead</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: BRAND.coolGrey, marginBottom: '4px' }}>Start Date</label>
            <input type="date" value={form.effective_start || ''} disabled={!editing} onChange={e => setForm({ ...form, effective_start: e.target.value })} style={inputStyle} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: BRAND.coolGrey, marginBottom: '4px' }}>End Date</label>
            <input type="date" value={form.effective_end || ''} disabled={!editing} onChange={e => setForm({ ...form, effective_end: e.target.value })} style={inputStyle} />
          </div>
        </div>
      </div>

      {/* Rate Lines for this WO */}
      {rateLines.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <span style={{ fontSize: '15px', color: BRAND.purple, display: 'block', marginBottom: '12px' }}>Available Rate Lines (from {workOrder?.po_reference})</span>
          <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}` }}>
            <DataTable
              columns={[
                { header: 'Label', accessor: 'label' },
                { header: 'Bill Rate', render: r => formatCurrencyExact(r.bill_rate), nowrap: true },
                { header: 'Default', render: r => r.is_default ? 'Yes' : '' },
              ]}
              data={rateLines}
            />
          </div>
        </div>
      )}

      {/* Assigned Employees */}
      <div style={{ marginBottom: '24px' }}>
        <span style={{ fontSize: '15px', color: BRAND.purple, display: 'block', marginBottom: '12px' }}>Assigned Employees</span>
        <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}` }}>
          <DataTable
            columns={[
              { header: 'Code', accessor: 'employee_code', nowrap: true },
              { header: 'Name', render: r => <EmployeeLink id={r.employee_id}>{r.name}</EmployeeLink> },
              { header: 'Role', accessor: 'role' },
              { header: 'Rate Line', accessor: 'rate_line_label' },
              { header: 'Bill Rate', render: r => r.bill_rate ? formatCurrencyExact(r.bill_rate) : '—', nowrap: true },
              { header: 'Cost Rate', render: r => formatCurrencyExact(r.hourly_cost), nowrap: true },
              { header: 'Hours', render: r => r.totalHours.toFixed(1), nowrap: true },
              { header: 'Revenue', render: r => formatCurrency(r.totalHours * Number(r.bill_rate || 0)), nowrap: true },
              { header: 'Cost', render: r => formatCurrency(r.totalHours * Number(r.hourly_cost)), nowrap: true },
              { header: 'Margin', render: r => {
                const rev = r.totalHours * Number(r.bill_rate || 0)
                const cost = r.totalHours * Number(r.hourly_cost)
                const margin = rev - cost
                const pct = rev > 0 ? margin / rev : 0
                return <span style={{ color: pct > 0.3 ? BRAND.green : pct > 0.15 ? BRAND.amber : BRAND.red }}>{formatPct(pct)}</span>
              }, nowrap: true },
            ]}
            data={employeeSummary}
            emptyMessage="No employees assigned. Use the Hours Grid to assign employees."
          />
        </div>
      </div>
    </div>
  )
}
