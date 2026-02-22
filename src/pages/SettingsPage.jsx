import { useState, useEffect } from 'react'
import { BRAND } from '../lib/brand'
import { formatCurrencyExact, formatCurrency, formatDate } from '../lib/utils'
import { supabase } from '../lib/supabase'
import { auditDelete, getDeletionLog } from '../lib/auditDelete'
import { PCS_SECTOR_ID, useEmployees, useClients, useProjects } from '../hooks/useData'
import { SectionHeader, LoadingState, DataTable, StatusBadge, EmployeeLink, ProjectLink, ClientLink } from '../components/SharedUI'

const TABS = [
  { key: 'employees', label: 'Employees' },
  { key: 'clients', label: 'Clients' },
  { key: 'projects', label: 'Projects' },
  { key: 'workorders', label: 'Work Orders' },
  { key: 'ratelines', label: 'Rate Lines' },
  { key: 'templates', label: 'Meeting Templates' },
  { key: 'deletions', label: 'Deletion Log' },
  { key: 'roles', label: 'Roles & Access' },
]

export default function SettingsPage() {
  const [tab, setTab] = useState('employees')

  return (
    <div>
      <SectionHeader title="Settings" subtitle="Manage employees, clients, projects, work orders, rate lines, and user roles" />
      <div style={{ display: 'flex', gap: '0', borderBottom: `2px solid ${BRAND.greyBorder}`, marginBottom: '24px', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '10px 20px', background: tab === t.key ? BRAND.purple : 'transparent',
            color: tab === t.key ? BRAND.white : BRAND.coolGrey,
            border: 'none', cursor: 'pointer', fontFamily: BRAND.font, fontSize: '13px',
            borderBottom: tab === t.key ? `2px solid ${BRAND.purple}` : '2px solid transparent',
            marginBottom: '-2px',
          }}>{t.label}</button>
        ))}
      </div>

      {tab === 'employees' && <EmployeesTab />}
      {tab === 'clients' && <ClientsTab />}
      {tab === 'projects' && <ProjectsTab />}
      {tab === 'workorders' && <WorkOrdersTab />}
      {tab === 'ratelines' && <RateLinesTab />}
      {tab === 'templates' && <MeetingTemplatesTab />}
      {tab === 'deletions' && <DeletionLogTab />}
      {tab === 'roles' && <RolesTab />}
    </div>
  )
}

// ============================================================================
// Shared form styles
// ============================================================================
const inputStyle = {
  width: '100%', padding: '8px 12px', border: `1px solid ${BRAND.greyBorder}`,
  fontFamily: BRAND.font, fontSize: '14px', color: BRAND.coolGrey, boxSizing: 'border-box',
}
const labelStyle = { display: 'block', fontSize: '12px', color: BRAND.coolGrey, marginBottom: '4px' }
const btnStyle = {
  padding: '8px 24px', background: BRAND.purple, color: BRAND.white,
  border: 'none', cursor: 'pointer', fontFamily: BRAND.font, fontSize: '13px',
}

function Message({ msg }) {
  if (!msg) return null
  return (
    <div style={{
      padding: '10px 16px', marginBottom: '16px', fontSize: '13px',
      background: msg.type === 'error' ? '#FDECEC' : '#E8F5E8',
      color: msg.type === 'error' ? BRAND.red : BRAND.green,
    }}>{msg.text}</div>
  )
}

// ============================================================================
// EMPLOYEES TAB (with cross-charge support)
// ============================================================================
function EmployeesTab() {
  const { data: employees, loading } = useEmployees()
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)
  const [form, setForm] = useState({
    employee_code: '', name: '', role: '', hourly_cost: '',
    target_utilization: '0.75', start_date: '',
    is_cross_charge: false, originating_sector: '',
  })

  async function handleAdd(e) {
    e.preventDefault(); setSaving(true); setMessage(null)
    const { error } = await supabase.from('employees').insert({
      sector_id: PCS_SECTOR_ID,
      employee_code: form.employee_code,
      name: form.name,
      role: form.role,
      hourly_cost: parseFloat(form.hourly_cost),
      target_utilization: parseFloat(form.target_utilization),
      start_date: form.start_date || null,
      is_cross_charge: form.is_cross_charge,
      originating_sector: form.is_cross_charge ? form.originating_sector : null,
    })
    if (error) setMessage({ type: 'error', text: error.message })
    else {
      setMessage({ type: 'success', text: `Employee ${form.name} added.` })
      setForm({ employee_code: '', name: '', role: '', hourly_cost: '', target_utilization: '0.75', start_date: '', is_cross_charge: false, originating_sector: '' })
      setShowForm(false)
      window.location.reload()
    }
    setSaving(false)
  }

  if (loading) return <LoadingState />

  const internal = employees.filter(e => !e.is_cross_charge)
  const crossCharge = employees.filter(e => e.is_cross_charge)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <span style={{ fontSize: '14px', color: BRAND.coolGrey }}>{employees.length} employees ({internal.length} internal, {crossCharge.length} cross-charge)</span>
        <button onClick={() => setShowForm(!showForm)} style={btnStyle}>{showForm ? 'Cancel' : 'Add Employee'}</button>
      </div>
      <Message msg={message} />
      {showForm && (
        <form onSubmit={handleAdd} style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, padding: '20px', marginBottom: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div><label style={labelStyle}>Employee Code</label><input value={form.employee_code} onChange={e => setForm({ ...form, employee_code: e.target.value })} required placeholder="EMP-XX, NH-X, or XC-X" style={inputStyle} /></div>
            <div><label style={labelStyle}>Full Name</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required style={inputStyle} /></div>
            <div><label style={labelStyle}>Role</label><input value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} required placeholder="e.g. Field Monitor" style={inputStyle} /></div>
            <div><label style={labelStyle}>Hourly Cost ($)</label><input type="number" step="0.01" value={form.hourly_cost} onChange={e => setForm({ ...form, hourly_cost: e.target.value })} required style={inputStyle} /></div>
            <div><label style={labelStyle}>Target Utilization (0-1)</label><input type="number" step="0.01" min="0" max="1" value={form.target_utilization} onChange={e => setForm({ ...form, target_utilization: e.target.value })} required style={inputStyle} /></div>
            <div><label style={labelStyle}>Start Date</label><input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} style={inputStyle} /></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '20px' }}>
              <input type="checkbox" checked={form.is_cross_charge} onChange={e => setForm({ ...form, is_cross_charge: e.target.checked })} id="xc" />
              <label htmlFor="xc" style={{ fontSize: '13px', color: BRAND.coolGrey }}>Cross-charge employee</label>
            </div>
            {form.is_cross_charge && (
              <div><label style={labelStyle}>Originating Sector</label><input value={form.originating_sector} onChange={e => setForm({ ...form, originating_sector: e.target.value })} placeholder="e.g. INFRA, PM" style={inputStyle} /></div>
            )}
          </div>
          <button type="submit" disabled={saving} style={{ ...btnStyle, opacity: saving ? 0.7 : 1 }}>{saving ? 'Adding...' : 'Add Employee'}</button>
        </form>
      )}

      {/* Internal employees */}
      <span style={{ fontSize: '13px', color: BRAND.coolGrey, display: 'block', marginBottom: '8px' }}>Internal Employees</span>
      <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, marginBottom: '20px' }}>
        <DataTable
          columns={[
            { header: 'Code', accessor: 'employee_code', nowrap: true },
            { header: 'Name', render: r => <EmployeeLink id={r.id}>{r.name}</EmployeeLink> },
            { header: 'Role', accessor: 'role' },
            { header: 'Hourly Cost', render: r => formatCurrencyExact(r.hourly_cost), nowrap: true },
            { header: 'Target Util', render: r => `${(Number(r.target_utilization) * 100).toFixed(0)}%`, nowrap: true },
            { header: 'Start', render: r => formatDate(r.start_date), nowrap: true },
            { header: 'Status', render: r => <StatusBadge status={r.is_active ? 'active' : 'inactive'} map={{ active: { bg: '#E8F5E8', text: BRAND.green, label: 'Active' }, inactive: { bg: BRAND.greyLight, text: BRAND.coolGrey, label: 'Inactive' } }} /> },
          ]}
          data={internal}
        />
      </div>

      {/* Cross-charge employees */}
      {crossCharge.length > 0 && (
        <>
          <span style={{ fontSize: '13px', color: BRAND.coolGrey, display: 'block', marginBottom: '8px' }}>Cross-Charge Employees</span>
          <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}` }}>
            <DataTable
              columns={[
                { header: 'Code', accessor: 'employee_code', nowrap: true },
                { header: 'Name', render: r => <EmployeeLink id={r.id}>{r.name}</EmployeeLink> },
                { header: 'Role', accessor: 'role' },
                { header: 'Hourly Cost', render: r => formatCurrencyExact(r.hourly_cost), nowrap: true },
                { header: 'From Sector', accessor: 'originating_sector', nowrap: true },
                { header: 'Start', render: r => formatDate(r.start_date), nowrap: true },
                { header: 'Status', render: r => <StatusBadge status={r.is_active ? 'active' : 'inactive'} map={{ active: { bg: '#E8F5E8', text: BRAND.green, label: 'Active' }, inactive: { bg: BRAND.greyLight, text: BRAND.coolGrey, label: 'Inactive' } }} /> },
              ]}
              data={crossCharge}
            />
          </div>
        </>
      )}
    </div>
  )
}

// ============================================================================
// CLIENTS TAB
// ============================================================================
function ClientsTab() {
  const { data: clients, loading } = useClients()
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)
  const [form, setForm] = useState({ name: '', standard_bill_rate: '159.65', status: 'active' })

  async function handleAdd(e) {
    e.preventDefault(); setSaving(true); setMessage(null)
    const { error } = await supabase.from('clients').insert({
      sector_id: PCS_SECTOR_ID, name: form.name,
      standard_bill_rate: parseFloat(form.standard_bill_rate), status: form.status,
    })
    if (error) setMessage({ type: 'error', text: error.message })
    else { setMessage({ type: 'success', text: `Client ${form.name} added.` }); setForm({ name: '', standard_bill_rate: '159.65', status: 'active' }); setShowForm(false); window.location.reload() }
    setSaving(false)
  }

  if (loading) return <LoadingState />
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <span style={{ fontSize: '14px', color: BRAND.coolGrey }}>{clients.length} clients</span>
        <button onClick={() => setShowForm(!showForm)} style={btnStyle}>{showForm ? 'Cancel' : 'Add Client'}</button>
      </div>
      <Message msg={message} />
      {showForm && (
        <form onSubmit={handleAdd} style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, padding: '20px', marginBottom: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div><label style={labelStyle}>Client Name</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required style={inputStyle} /></div>
            <div><label style={labelStyle}>Default Bill Rate ($)</label><input type="number" step="0.01" value={form.standard_bill_rate} onChange={e => setForm({ ...form, standard_bill_rate: e.target.value })} required style={inputStyle} /></div>
            <div><label style={labelStyle}>Status</label><select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} style={inputStyle}><option value="active">Active</option><option value="pipeline">Pipeline</option></select></div>
          </div>
          <button type="submit" disabled={saving} style={{ ...btnStyle, opacity: saving ? 0.7 : 1 }}>{saving ? 'Adding...' : 'Add Client'}</button>
        </form>
      )}
      <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}` }}>
        <DataTable
          columns={[
            { header: 'Name', render: r => <ClientLink id={r.id}>{r.name}</ClientLink> },
            { header: 'Default Rate', render: r => formatCurrencyExact(r.standard_bill_rate), nowrap: true },
            { header: 'Status', render: r => <StatusBadge status={r.status} map={{ active: { bg: '#E8F5E8', text: BRAND.green, label: 'Active' }, pipeline: { bg: '#FFF4E5', text: BRAND.amber, label: 'Pipeline' }, closed: { bg: BRAND.greyLight, text: BRAND.coolGrey, label: 'Closed' } }} /> },
          ]}
          data={clients}
        />
      </div>
    </div>
  )
}

// ============================================================================
// PROJECTS TAB
// ============================================================================
function ProjectsTab() {
  const { data: projects, loading: pLoading } = useProjects()
  const { data: clients, loading: cLoading } = useClients()
  const [workOrders, setWorkOrders] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)
  const [form, setForm] = useState({ code: '', name: '', type: 'billable', client_id: '', work_order_id: '', effective_start: '' })

  useEffect(() => {
    supabase.from('work_orders').select('id, po_reference, client_id').eq('sector_id', PCS_SECTOR_ID).then(({ data }) => setWorkOrders(data || []))
  }, [])

  const getClientName = (cid) => { const c = clients.find(cl => cl.id === cid); return c ? c.name : '—' }
  const filteredWOs = form.client_id ? workOrders.filter(w => w.client_id === form.client_id) : []

  async function handleAdd(e) {
    e.preventDefault(); setSaving(true); setMessage(null)
    const { error } = await supabase.from('projects').insert({
      sector_id: PCS_SECTOR_ID, code: form.code, name: form.name, type: form.type,
      client_id: form.client_id || null, work_order_id: form.work_order_id || null,
      effective_start: form.effective_start || null,
    })
    if (error) setMessage({ type: 'error', text: error.message })
    else { setMessage({ type: 'success', text: `Project ${form.code} added.` }); setShowForm(false); window.location.reload() }
    setSaving(false)
  }

  if (pLoading || cLoading) return <LoadingState />
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <span style={{ fontSize: '14px', color: BRAND.coolGrey }}>{projects.length} projects</span>
        <button onClick={() => setShowForm(!showForm)} style={btnStyle}>{showForm ? 'Cancel' : 'Add Project'}</button>
      </div>
      <Message msg={message} />
      {showForm && (
        <form onSubmit={handleAdd} style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, padding: '20px', marginBottom: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div><label style={labelStyle}>Project Code</label><input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} required placeholder="PRJ-XXX or OVH-XXX" style={inputStyle} /></div>
            <div><label style={labelStyle}>Name</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required style={inputStyle} /></div>
            <div><label style={labelStyle}>Type</label><select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} style={inputStyle}><option value="billable">Billable</option><option value="overhead">Overhead</option></select></div>
            <div><label style={labelStyle}>Client</label><select value={form.client_id} onChange={e => setForm({ ...form, client_id: e.target.value, work_order_id: '' })} style={inputStyle}><option value="">None</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <div><label style={labelStyle}>Work Order</label><select value={form.work_order_id} onChange={e => setForm({ ...form, work_order_id: e.target.value })} style={inputStyle} disabled={!form.client_id}><option value="">None</option>{filteredWOs.map(w => <option key={w.id} value={w.id}>{w.po_reference}</option>)}</select></div>
            <div><label style={labelStyle}>Start Date</label><input type="date" value={form.effective_start} onChange={e => setForm({ ...form, effective_start: e.target.value })} style={inputStyle} /></div>
          </div>
          <button type="submit" disabled={saving} style={{ ...btnStyle, opacity: saving ? 0.7 : 1 }}>{saving ? 'Adding...' : 'Add Project'}</button>
        </form>
      )}
      <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}` }}>
        <DataTable
          columns={[
            { header: 'Code', accessor: 'code', nowrap: true },
            { header: 'Name', render: r => <ProjectLink id={r.id}>{r.name}</ProjectLink> },
            { header: 'Client', render: r => r.client_id ? <ClientLink id={r.client_id}>{getClientName(r.client_id)}</ClientLink> : '—' },
            { header: 'Type', render: r => <StatusBadge status={r.type} map={{ billable: { bg: '#E8F5E8', text: BRAND.green, label: 'Billable' }, overhead: { bg: BRAND.greyLight, text: BRAND.coolGrey, label: 'Overhead' } }} /> },
            { header: 'Start', render: r => formatDate(r.effective_start), nowrap: true },
          ]}
          data={projects}
        />
      </div>
    </div>
  )
}

// ============================================================================
// WORK ORDERS TAB
// ============================================================================
function WorkOrdersTab() {
  const { data: clients, loading: cLoading } = useClients()
  const [workOrders, setWorkOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)
  const [form, setForm] = useState({ client_id: '', po_reference: '', name: '', budget: '', monthly_forecast: '', start_date: '', end_date: '', status: 'active' })

  useEffect(() => {
    supabase.from('work_orders').select('*, clients(name)').eq('sector_id', PCS_SECTOR_ID).order('created_at').then(({ data }) => { setWorkOrders(data || []); setLoading(false) })
  }, [])

  async function handleAdd(e) {
    e.preventDefault(); setSaving(true); setMessage(null)
    const { error } = await supabase.from('work_orders').insert({
      sector_id: PCS_SECTOR_ID, client_id: form.client_id, po_reference: form.po_reference,
      name: form.name || null, budget: form.budget ? parseFloat(form.budget) : null,
      monthly_forecast: form.monthly_forecast ? parseFloat(form.monthly_forecast) : null,
      start_date: form.start_date || null, end_date: form.end_date || null, status: form.status,
    })
    if (error) setMessage({ type: 'error', text: error.message })
    else { setMessage({ type: 'success', text: `Work Order ${form.po_reference} added.` }); setShowForm(false); window.location.reload() }
    setSaving(false)
  }

  if (loading || cLoading) return <LoadingState />
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <span style={{ fontSize: '14px', color: BRAND.coolGrey }}>{workOrders.length} work orders</span>
        <button onClick={() => setShowForm(!showForm)} style={btnStyle}>{showForm ? 'Cancel' : 'Add Work Order'}</button>
      </div>
      <Message msg={message} />
      {showForm && (
        <form onSubmit={handleAdd} style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, padding: '20px', marginBottom: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div><label style={labelStyle}>Client</label><select value={form.client_id} onChange={e => setForm({ ...form, client_id: e.target.value })} required style={inputStyle}><option value="">Select...</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <div><label style={labelStyle}>PO Reference</label><input value={form.po_reference} onChange={e => setForm({ ...form, po_reference: e.target.value })} required placeholder="WO-XXXXXX" style={inputStyle} /></div>
            <div><label style={labelStyle}>Name</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={inputStyle} /></div>
            <div><label style={labelStyle}>Budget ($)</label><input type="number" step="0.01" value={form.budget} onChange={e => setForm({ ...form, budget: e.target.value })} style={inputStyle} /></div>
            <div><label style={labelStyle}>Monthly Forecast ($)</label><input type="number" step="0.01" value={form.monthly_forecast} onChange={e => setForm({ ...form, monthly_forecast: e.target.value })} style={inputStyle} /></div>
            <div><label style={labelStyle}>Status</label><select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} style={inputStyle}><option value="active">Active</option><option value="pipeline">Pipeline</option><option value="closed">Closed</option></select></div>
            <div><label style={labelStyle}>Start Date</label><input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} style={inputStyle} /></div>
            <div><label style={labelStyle}>End Date</label><input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} style={inputStyle} /></div>
          </div>
          <button type="submit" disabled={saving} style={{ ...btnStyle, opacity: saving ? 0.7 : 1 }}>{saving ? 'Adding...' : 'Add Work Order'}</button>
        </form>
      )}
      <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}` }}>
        <DataTable
          columns={[
            { header: 'PO Ref', accessor: 'po_reference', nowrap: true },
            { header: 'Client', render: r => r.clients?.name ? <ClientLink id={r.client_id}>{r.clients.name}</ClientLink> : '—' },
            { header: 'Name', render: r => r.name || '—' },
            { header: 'Budget', render: r => r.budget ? formatCurrency(r.budget) : '—', nowrap: true },
            { header: 'Status', render: r => <StatusBadge status={r.status} map={{ active: { bg: '#E8F5E8', text: BRAND.green, label: 'Active' }, pipeline: { bg: '#FFF4E5', text: BRAND.amber, label: 'Pipeline' }, closed: { bg: BRAND.greyLight, text: BRAND.coolGrey, label: 'Closed' } }} /> },
          ]}
          data={workOrders}
        />
      </div>
    </div>
  )
}

// ============================================================================
// RATE LINES TAB
// ============================================================================
function RateLinesTab() {
  const [rateLines, setRateLines] = useState([])
  const [workOrders, setWorkOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)
  const [form, setForm] = useState({ work_order_id: '', label: '', bill_rate: '' })

  useEffect(() => {
    Promise.all([
      supabase.from('work_order_rate_lines').select('*, work_orders(po_reference, clients(name))').eq('sector_id', PCS_SECTOR_ID),
      supabase.from('work_orders').select('id, po_reference').eq('sector_id', PCS_SECTOR_ID),
    ]).then(([rlRes, woRes]) => { setRateLines(rlRes.data || []); setWorkOrders(woRes.data || []); setLoading(false) })
  }, [])

  async function handleAdd(e) {
    e.preventDefault(); setSaving(true); setMessage(null)
    const existing = rateLines.filter(r => r.work_order_id === form.work_order_id)
    const { error } = await supabase.from('work_order_rate_lines').insert({
      sector_id: PCS_SECTOR_ID, work_order_id: form.work_order_id,
      label: form.label, bill_rate: parseFloat(form.bill_rate),
      is_default: existing.length === 0,
    })
    if (error) setMessage({ type: 'error', text: error.message })
    else { setMessage({ type: 'success', text: `Rate line added.` }); setShowForm(false); window.location.reload() }
    setSaving(false)
  }

  if (loading) return <LoadingState />
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <span style={{ fontSize: '14px', color: BRAND.coolGrey }}>{rateLines.length} rate lines</span>
        <button onClick={() => setShowForm(!showForm)} style={btnStyle}>{showForm ? 'Cancel' : 'Add Rate Line'}</button>
      </div>
      <Message msg={message} />
      {showForm && (
        <form onSubmit={handleAdd} style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, padding: '20px', marginBottom: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div><label style={labelStyle}>Work Order</label><select value={form.work_order_id} onChange={e => setForm({ ...form, work_order_id: e.target.value })} required style={inputStyle}><option value="">Select...</option>{workOrders.map(w => <option key={w.id} value={w.id}>{w.po_reference}</option>)}</select></div>
            <div><label style={labelStyle}>Label</label><input value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} required placeholder="e.g. Senior Compliance" style={inputStyle} /></div>
            <div><label style={labelStyle}>Bill Rate ($)</label><input type="number" step="0.01" value={form.bill_rate} onChange={e => setForm({ ...form, bill_rate: e.target.value })} required style={inputStyle} /></div>
          </div>
          <button type="submit" disabled={saving} style={{ ...btnStyle, opacity: saving ? 0.7 : 1 }}>{saving ? 'Adding...' : 'Add Rate Line'}</button>
        </form>
      )}
      <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}` }}>
        <DataTable
          columns={[
            { header: 'Work Order', render: r => r.work_orders?.po_reference || '—', nowrap: true },
            { header: 'Client', render: r => r.work_orders?.clients?.name || '—' },
            { header: 'Label', accessor: 'label' },
            { header: 'Bill Rate', render: r => formatCurrencyExact(r.bill_rate), nowrap: true },
            { header: 'Default', render: r => r.is_default ? 'Yes' : '—' },
          ]}
          data={rateLines}
        />
      </div>
    </div>
  )
}

// ============================================================================
// ROLES & ACCESS TAB
// ============================================================================
function RolesTab() {
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ email: '', role: 'viewer' })

  useEffect(() => {
    supabase.from('sector_members').select('*, users:user_id(email)')
      .eq('sector_id', PCS_SECTOR_ID)
      .then(({ data, error }) => {
        // users join may not work without admin access — handle gracefully
        setMembers(data || [])
        setLoading(false)
      })
  }, [])

  async function handleChangeRole(memberId, newRole) {
    setSaving(true)
    const { error } = await supabase.from('sector_members').update({ role: newRole }).eq('id', memberId)
    if (error) setMessage({ type: 'error', text: error.message })
    else {
      setMembers(prev => prev.map(m => m.id === memberId ? { ...m, role: newRole } : m))
      setMessage({ type: 'success', text: 'Role updated.' })
    }
    setSaving(false)
  }

  async function handleInvite(e) {
    e.preventDefault(); setSaving(true); setMessage(null)
    // Note: in production, this would look up user by email or send invite
    setMessage({ type: 'info', text: `To add users, they must first create a Supabase auth account. Then add their user ID to sector_members with the desired role. A proper invite flow will be built in a future iteration.` })
    setSaving(false)
  }

  if (loading) return <LoadingState />

  const roleDescriptions = {
    admin: 'Full access. Can manage settings, roles, all data.',
    sector_lead: 'Can manage employees, clients, projects, WOs. Cannot change roles.',
    project_manager: 'Can enter hours, record invoices, manage timesheets. Cannot edit employees or rates.',
    viewer: 'Read-only. Can see project performance dashboard (no per-person financials).',
  }

  return (
    <div>
      <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, padding: '20px', marginBottom: '20px' }}>
        <span style={{ fontSize: '14px', color: BRAND.purple, display: 'block', marginBottom: '12px' }}>Role Definitions</span>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          {Object.entries(roleDescriptions).map(([role, desc]) => (
            <div key={role} style={{ padding: '12px', background: BRAND.greyLight }}>
              <div style={{ fontSize: '13px', color: BRAND.purple, marginBottom: '4px', textTransform: 'capitalize' }}>{role.replace('_', ' ')}</div>
              <div style={{ fontSize: '12px', color: BRAND.coolGrey }}>{desc}</div>
            </div>
          ))}
        </div>
      </div>

      <Message msg={message} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <span style={{ fontSize: '14px', color: BRAND.coolGrey }}>{members.length} sector member(s)</span>
      </div>

      <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}` }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
          <thead><tr>
            {['User ID', 'Email', 'Current Role', 'Change Role'].map(h => (
              <th key={h} style={{ background: BRAND.purple, color: BRAND.white, padding: '10px 14px', textAlign: 'left', fontWeight: 400 }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {members.map((m, i) => (
              <tr key={m.id} style={{ background: i % 2 === 0 ? BRAND.white : BRAND.greyLight }}>
                <td style={{ padding: '8px 14px', color: BRAND.coolGrey, borderBottom: `1px solid ${BRAND.greyBorder}`, fontSize: '11px', fontFamily: 'monospace' }}>{m.user_id?.slice(0, 12)}...</td>
                <td style={{ padding: '8px 14px', color: BRAND.coolGrey, borderBottom: `1px solid ${BRAND.greyBorder}` }}>{m.users?.email || '—'}</td>
                <td style={{ padding: '8px 14px', borderBottom: `1px solid ${BRAND.greyBorder}` }}>
                  <StatusBadge status={m.role} map={{
                    admin: { bg: '#F3E8F9', text: BRAND.purple, label: 'Admin' },
                    sector_lead: { bg: '#E8F4FD', text: BRAND.blue, label: 'Sector Lead' },
                    project_manager: { bg: '#E8F5E8', text: BRAND.green, label: 'Project Manager' },
                    viewer: { bg: BRAND.greyLight, text: BRAND.coolGrey, label: 'Viewer' },
                  }} />
                </td>
                <td style={{ padding: '4px 14px', borderBottom: `1px solid ${BRAND.greyBorder}` }}>
                  <select value={m.role} onChange={e => handleChangeRole(m.id, e.target.value)} disabled={saving}
                    style={{ padding: '4px 8px', border: `1px solid ${BRAND.greyBorder}`, fontFamily: BRAND.font, fontSize: '12px', color: BRAND.coolGrey }}>
                    <option value="admin">Admin</option>
                    <option value="sector_lead">Sector Lead</option>
                    <option value="project_manager">Project Manager</option>
                    <option value="viewer">Viewer</option>
                  </select>
                </td>
              </tr>
            ))}
            {members.length === 0 && (
              <tr><td colSpan={4} style={{ padding: '20px', color: BRAND.coolGrey, fontSize: '13px', textAlign: 'center' }}>No sector members found. You may need to add your user to the sector_members table.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ============================================================================
// Meeting Templates Tab
// ============================================================================
function MeetingTemplatesTab() {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)
  const [name, setName] = useState('')
  const [items, setItems] = useState([''])
  const [editId, setEditId] = useState(null)

  useEffect(() => { loadTemplates() }, [])

  async function loadTemplates() {
    setLoading(true)
    const { data } = await supabase.from('app_settings')
      .select('*').eq('sector_id', PCS_SECTOR_ID).like('setting_key', 'meeting_template_%')
      .order('created_at')
    const parsed = (data || []).map(d => {
      try { return { id: d.id, key: d.setting_key, ...JSON.parse(d.setting_value) } }
      catch { return null }
    }).filter(Boolean)
    setTemplates(parsed)
    setLoading(false)
  }

  function addItem() { setItems([...items, '']) }
  function removeItem(i) { setItems(items.filter((_, idx) => idx !== i)) }
  function updateItem(i, val) { const n = [...items]; n[i] = val; setItems(n) }

  async function handleSave() {
    const trimmedName = name.trim()
    const trimmedItems = items.map(i => i.trim()).filter(Boolean)
    if (!trimmedName) { setMsg({ type: 'error', text: 'Template name is required.' }); return }
    if (trimmedItems.length === 0) { setMsg({ type: 'error', text: 'At least one agenda item is required.' }); return }
    setSaving(true); setMsg(null)

    const key = editId
      ? templates.find(t => t.id === editId)?.key
      : `meeting_template_${Date.now()}`
    const value = JSON.stringify({ name: trimmedName, items: trimmedItems })

    if (editId) {
      const { error } = await supabase.from('app_settings').update({ setting_value: value, updated_at: new Date().toISOString() }).eq('id', editId)
      if (error) { setMsg({ type: 'error', text: error.message }); setSaving(false); return }
    } else {
      const { error } = await supabase.from('app_settings').insert({ sector_id: PCS_SECTOR_ID, setting_key: key, setting_value: value })
      if (error) { setMsg({ type: 'error', text: error.message }); setSaving(false); return }
    }
    setName(''); setItems(['']); setShowForm(false); setEditId(null); setSaving(false); loadTemplates()
  }

  function startEdit(t) {
    setEditId(t.id); setName(t.name); setItems(t.items.length > 0 ? [...t.items] : ['']); setShowForm(true)
  }

  async function handleDelete(id) {
    await auditDelete('app_settings', id)
    loadTemplates()
  }

  if (loading) return <div style={{ padding: '20px', color: BRAND.coolGrey, fontSize: '13px' }}>Loading templates...</div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <span style={{ fontSize: '15px', color: BRAND.purple }}>Meeting Templates ({templates.length})</span>
        {!showForm && <button onClick={() => { setShowForm(true); setEditId(null); setName(''); setItems(['']) }} style={btnStyle}>Add Template</button>}
      </div>

      <div style={{ fontSize: '12px', color: BRAND.coolGrey, marginBottom: '16px' }}>
        Templates provide standard agenda items that can be loaded into any new meeting. Create sector-wide templates here, or project-specific templates from the Meeting Minutes tab.
      </div>

      {showForm && (
        <div style={{ background: BRAND.purpleLight, border: `1px solid ${BRAND.greyBorder}`, padding: '20px', marginBottom: '20px' }}>
          <span style={{ fontSize: '14px', color: BRAND.purple, display: 'block', marginBottom: '16px' }}>{editId ? 'Edit Template' : 'New Template'}</span>
          <Message msg={msg} />
          <div style={{ marginBottom: '12px' }}>
            <label style={labelStyle}>Template Name</label>
            <input value={name} onChange={e => setName(e.target.value)} style={inputStyle} placeholder="e.g. Monthly Progress Review" />
          </div>
          <label style={labelStyle}>Agenda Items</label>
          {items.map((item, i) => (
            <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '6px' }}>
              <span style={{ minWidth: '30px', color: BRAND.coolGrey, fontSize: '13px', paddingTop: '8px' }}>{i + 1}.</span>
              <input value={item} onChange={e => updateItem(i, e.target.value)} style={{ ...inputStyle, flex: 1 }} placeholder="Agenda item title" />
              {items.length > 1 && (
                <button onClick={() => removeItem(i)} style={{ background: 'none', border: 'none', color: BRAND.red, cursor: 'pointer', fontFamily: BRAND.font, fontSize: '12px', padding: '8px' }}>Remove</button>
              )}
            </div>
          ))}
          <button onClick={addItem} style={{ background: 'none', border: 'none', color: BRAND.purple, cursor: 'pointer', fontFamily: BRAND.font, fontSize: '12px', padding: '4px 0', marginBottom: '16px' }}>+ Add another item</button>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button onClick={() => { setShowForm(false); setEditId(null); setMsg(null) }} style={{ padding: '8px 20px', background: BRAND.white, color: BRAND.coolGrey, border: `1px solid ${BRAND.greyBorder}`, cursor: 'pointer', fontFamily: BRAND.font, fontSize: '13px' }}>Cancel</button>
            <button onClick={handleSave} disabled={saving} style={btnStyle}>{saving ? 'Saving...' : editId ? 'Update Template' : 'Save Template'}</button>
          </div>
        </div>
      )}

      {templates.length === 0 ? (
        <div style={{ padding: '24px', background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, color: BRAND.coolGrey, fontSize: '13px' }}>No meeting templates created yet.</div>
      ) : templates.map((t, idx) => (
        <div key={t.id} style={{ background: idx % 2 === 0 ? BRAND.white : BRAND.greyLight, border: `1px solid ${BRAND.greyBorder}`, marginBottom: '4px', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: '14px', color: BRAND.purple, marginBottom: '4px' }}>{t.name}</div>
            <div style={{ fontSize: '12px', color: BRAND.coolGrey }}>
              {t.items.map((item, i) => <span key={i}>{i + 1}. {item}{i < t.items.length - 1 ? '  |  ' : ''}</span>)}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
            <button onClick={() => startEdit(t)} style={{ background: 'none', border: 'none', color: BRAND.purple, cursor: 'pointer', fontFamily: BRAND.font, fontSize: '12px' }}>Edit</button>
            <button onClick={() => handleDelete(t.id)} style={{ background: 'none', border: 'none', color: BRAND.red, cursor: 'pointer', fontFamily: BRAND.font, fontSize: '12px' }}>Delete</button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ============================================================================
// Deletion Log Tab
// ============================================================================
function DeletionLogTab() {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState(null)

  useEffect(() => {
    getDeletionLog(100).then(data => { setEntries(data); setLoading(false) })
  }, [])

  if (loading) return <div style={{ padding: '20px', color: BRAND.coolGrey, fontSize: '13px' }}>Loading deletion log...</div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <span style={{ fontSize: '15px', color: BRAND.purple }}>Deletion Log ({entries.length} entries)</span>
      </div>
      <div style={{ fontSize: '12px', color: BRAND.coolGrey, marginBottom: '16px' }}>
        Every deleted record is logged here with a snapshot of the data at the time of deletion.
      </div>

      {entries.length === 0 ? (
        <div style={{ padding: '24px', background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, color: BRAND.coolGrey, fontSize: '13px' }}>No deletions recorded.</div>
      ) : (
        <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['When', 'Table', 'Deleted By', 'Record Summary', ''].map(h => (
                  <th key={h} style={{ background: BRAND.purple, color: BRAND.white, padding: '10px 14px', textAlign: 'left', fontWeight: 400, fontSize: '13px', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => {
                const snap = e.snapshot || {}
                const summary = snap.title || snap.name || snap.description || snap.external_name || snap.decision_ref || snap.action_ref || snap.variation_ref || JSON.stringify(snap).slice(0, 80)
                const expanded = expandedId === e.id
                return (
                  <>
                    <tr key={e.id} style={{ background: i % 2 === 0 ? BRAND.white : BRAND.greyLight, cursor: 'pointer' }} onClick={() => setExpandedId(expanded ? null : e.id)}>
                      <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, color: BRAND.coolGrey, fontSize: '12px', whiteSpace: 'nowrap' }}>{e.deleted_at ? new Date(e.deleted_at).toLocaleString() : '—'}</td>
                      <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, color: BRAND.purple, fontSize: '12px' }}>{e.table}</td>
                      <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, color: BRAND.coolGrey, fontSize: '12px' }}>{e.deleted_by || '—'}</td>
                      <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, color: BRAND.coolGrey, fontSize: '12px', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{summary}</td>
                      <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, color: BRAND.purple, fontSize: '12px' }}>{expanded ? 'Collapse' : 'Details'}</td>
                    </tr>
                    {expanded && (
                      <tr key={`${e.id}-detail`}><td colSpan={5} style={{ padding: '16px 20px', background: BRAND.purpleLight, borderBottom: `1px solid ${BRAND.greyBorder}` }}>
                        <pre style={{ fontFamily: 'monospace', fontSize: '11px', color: BRAND.coolGrey, whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0 }}>{JSON.stringify(snap, null, 2)}</pre>
                      </td></tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
