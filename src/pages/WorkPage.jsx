import { useState, useEffect } from 'react'
import { BRAND } from '../lib/brand'
import { formatCurrencyExact, formatDate, formatCurrency } from '../lib/utils'
import { supabase } from '../lib/supabase'
import { useProjects, useClients, PCS_SECTOR_ID } from '../hooks/useData'
import { DataTable, KPICard, StatusBadge, SectionHeader, LoadingState, projectTypeMap, clientStatusMap, ProjectLink, ClientLink, EmployeeLink } from '../components/SharedUI'

const SUB_TABS = [
  { key: 'projects', label: 'Projects' },
  { key: 'clients', label: 'Clients' },
  { key: 'workorders', label: 'Work Orders' },
]

export default function WorkPage() {
  const [tab, setTab] = useState('projects')

  return (
    <div>
      <SectionHeader title="Work" subtitle="Manage projects, clients, and work orders" />
      <div style={{ display: 'flex', gap: 0, borderBottom: `2px solid ${BRAND.greyBorder}`, marginBottom: '24px' }}>
        {SUB_TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '10px 24px', background: tab === t.key ? BRAND.purple : 'transparent',
            color: tab === t.key ? BRAND.white : BRAND.coolGrey,
            border: 'none', cursor: 'pointer', fontFamily: BRAND.font, fontSize: '13px',
            borderBottom: tab === t.key ? `2px solid ${BRAND.purple}` : '2px solid transparent',
            marginBottom: '-2px',
          }}>{t.label}</button>
        ))}
      </div>

      {tab === 'projects' && <ProjectsTab />}
      {tab === 'clients' && <ClientsTab />}
      {tab === 'workorders' && <WorkOrdersTab />}
    </div>
  )
}

function ProjectsTab() {
  const { data: projects, loading: projLoading } = useProjects()
  const { data: clients, loading: clientLoading } = useClients()
  const [typeFilter, setTypeFilter] = useState('all')

  if (projLoading || clientLoading) return <LoadingState />

  const filtered = typeFilter === 'all' ? projects : projects.filter(p => p.type === typeFilter)
  const getClientName = (cid) => { const c = clients.find(cl => cl.id === cid); return c ? c.name : '—' }
  const getBillRate = (p) => {
    if (p.type === 'overhead') return null
    if (p.rate_type === 'cross_sector_adjusted' && p.adjusted_bill_rate) return Number(p.adjusted_bill_rate)
    const c = clients.find(cl => cl.id === p.client_id)
    return c ? Number(c.standard_bill_rate) : null
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <span style={{ fontSize: '13px', color: BRAND.coolGrey }}>{filtered.length} projects</span>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{
          padding: '6px 12px', border: `1px solid ${BRAND.greyBorder}`, background: BRAND.white,
          color: BRAND.coolGrey, fontFamily: BRAND.font, fontSize: '13px',
        }}>
          <option value="all">All types</option>
          <option value="billable">Billable</option>
          <option value="overhead">Overhead</option>
        </select>
      </div>
      <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}` }}>
        <DataTable
          columns={[
            { header: 'Code', accessor: 'code', nowrap: true },
            { header: 'Name', render: r => <ProjectLink id={r.id}>{r.name}</ProjectLink> },
            { header: 'Client', render: r => r.client_id ? <ClientLink id={r.client_id}>{getClientName(r.client_id)}</ClientLink> : '—' },
            { header: 'Type', render: r => <StatusBadge status={r.type} map={projectTypeMap} /> },
            { header: 'Bill Rate', render: r => { const rate = getBillRate(r); return rate ? formatCurrencyExact(rate) : '—' }, nowrap: true },
            { header: 'Start', render: r => formatDate(r.effective_start), nowrap: true },
            { header: 'End', render: r => formatDate(r.effective_end), nowrap: true },
          ]}
          data={filtered}
        />
      </div>
    </div>
  )
}

function ClientsTab() {
  const { data: clients, loading } = useClients()
  if (loading) return <LoadingState />

  return (
    <div>
      <div style={{ fontSize: '13px', color: BRAND.coolGrey, marginBottom: '12px' }}>{clients.length} clients</div>
      <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}` }}>
        <DataTable
          columns={[
            { header: 'Client Name', render: r => <ClientLink id={r.id}>{r.name}</ClientLink> },
            { header: 'Default Rate', render: r => formatCurrencyExact(r.standard_bill_rate), nowrap: true },
            { header: 'Status', render: r => <StatusBadge status={r.status} map={clientStatusMap} /> },
          ]}
          data={clients}
        />
      </div>
    </div>
  )
}

function WorkOrdersTab() {
  const [workOrders, setWorkOrders] = useState([])
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      supabase.from('work_orders').select('*, clients(name)').eq('sector_id', PCS_SECTOR_ID).order('created_at'),
      supabase.from('invoices').select('client_id, amount, status').eq('sector_id', PCS_SECTOR_ID),
    ]).then(([woRes, invRes]) => {
      setWorkOrders(woRes.data || [])
      setInvoices(invRes.data || [])
      setLoading(false)
    })
  }, [])

  if (loading) return <LoadingState />

  return (
    <div>
      <div style={{ fontSize: '13px', color: BRAND.coolGrey, marginBottom: '12px' }}>{workOrders.length} work orders</div>
      <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}` }}>
        <DataTable
          columns={[
            { header: 'PO Ref', accessor: 'po_reference', nowrap: true },
            { header: 'Client', render: r => r.clients?.name ? <ClientLink id={r.client_id}>{r.clients.name}</ClientLink> : '—' },
            { header: 'Name', render: r => r.name || '—' },
            { header: 'PO Value', render: r => r.budget ? formatCurrency(r.budget) : '—', nowrap: true },
            { header: 'Invoiced', render: r => {
              const inv = invoices.filter(i => i.client_id === r.client_id && i.status !== 'draft').reduce((s, i) => s + Number(i.amount), 0)
              return formatCurrency(inv)
            }, nowrap: true },
            { header: 'Remaining', render: r => {
              const po = Number(r.budget || 0)
              const inv = invoices.filter(i => i.client_id === r.client_id && i.status !== 'draft').reduce((s, i) => s + Number(i.amount), 0)
              return po > 0 ? <span style={{ color: (po - inv) < 0 ? BRAND.red : BRAND.green }}>{formatCurrency(po - inv)}</span> : '—'
            }, nowrap: true },
            { header: 'Status', render: r => <StatusBadge status={r.status} map={{
              active: { bg: '#E8F5E8', text: BRAND.green, label: 'Active' },
              pipeline: { bg: '#FFF4E5', text: BRAND.amber, label: 'Pipeline' },
              closed: { bg: BRAND.greyLight, text: BRAND.coolGrey, label: 'Closed' },
            }} /> },
          ]}
          data={workOrders}
        />
      </div>
    </div>
  )
}
