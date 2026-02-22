import { useState, useEffect } from 'react'
import { BRAND } from '../lib/brand'
import { formatCurrency, formatCurrencyExact, formatDate } from '../lib/utils'
import { supabase } from '../lib/supabase'
import { PCS_SECTOR_ID } from '../hooks/useData'
import { SectionHeader, LoadingState, KPICard, DataTable, StatusBadge } from '../components/SharedUI'

const woStatusMap = {
  active: { bg: '#E8F5E8', text: BRAND.green, label: 'Active' },
  pipeline: { bg: '#FFF4E5', text: BRAND.amber, label: 'Pipeline' },
  closed: { bg: BRAND.greyLight, text: BRAND.coolGrey, label: 'Closed' },
  expired: { bg: '#FDECEC', text: BRAND.red, label: 'Expired' },
}

export default function ClientProfilePage({ clientId, onBack }) {
  const [client, setClient] = useState(null)
  const [workOrders, setWorkOrders] = useState([])
  const [rateLines, setRateLines] = useState({}) // keyed by work_order_id
  const [invoices, setInvoices] = useState([])
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [clientForm, setClientForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)

  // Work order form
  const [showWOForm, setShowWOForm] = useState(false)
  const [woForm, setWOForm] = useState({ po_reference: '', name: '', budget: '', monthly_forecast: '', start_date: '', end_date: '', status: 'active' })

  // Rate line form
  const [showRLForm, setShowRLForm] = useState(null) // work_order_id or null
  const [rlForm, setRLForm] = useState({ label: '', bill_rate: '' })

  useEffect(() => { loadAll() }, [clientId])

  async function loadAll() {
    setLoading(true)
    const [clientRes, woRes, invRes, projRes] = await Promise.all([
      supabase.from('clients').select('*').eq('id', clientId).single(),
      supabase.from('work_orders').select('*').eq('client_id', clientId).order('created_at', { ascending: true }),
      supabase.from('invoices').select('*').eq('client_id', clientId).eq('sector_id', PCS_SECTOR_ID).order('billing_month', { ascending: false }),
      supabase.from('projects').select('*').eq('client_id', clientId).order('code', { ascending: true }),
    ])

    if (clientRes.data) { setClient(clientRes.data); setClientForm(clientRes.data) }
    setWorkOrders(woRes.data || [])
    setInvoices(invRes.data || [])
    setProjects(projRes.data || [])

    // Load rate lines for all work orders
    const woIds = (woRes.data || []).map(w => w.id)
    if (woIds.length > 0) {
      const { data: rlData } = await supabase
        .from('work_order_rate_lines')
        .select('*')
        .in('work_order_id', woIds)
        .order('sort_order', { ascending: true })

      const grouped = {}
      ;(rlData || []).forEach(rl => {
        if (!grouped[rl.work_order_id]) grouped[rl.work_order_id] = []
        grouped[rl.work_order_id].push(rl)
      })
      setRateLines(grouped)
    }
    setLoading(false)
  }

  async function saveClient() {
    setSaving(true); setMessage(null)
    const { error } = await supabase.from('clients').update({
      name: clientForm.name,
      standard_bill_rate: parseFloat(clientForm.standard_bill_rate),
      status: clientForm.status,
    }).eq('id', clientId)

    if (error) { setMessage({ type: 'error', text: error.message }) }
    else { setMessage({ type: 'success', text: 'Client updated.' }); setEditing(false); loadAll() }
    setSaving(false)
  }

  async function addWorkOrder(e) {
    e.preventDefault(); setSaving(true); setMessage(null)
    const { error } = await supabase.from('work_orders').insert({
      sector_id: PCS_SECTOR_ID,
      client_id: clientId,
      po_reference: woForm.po_reference,
      name: woForm.name || null,
      budget: woForm.budget ? parseFloat(woForm.budget) : null,
      monthly_forecast: woForm.monthly_forecast ? parseFloat(woForm.monthly_forecast) : null,
      start_date: woForm.start_date || null,
      end_date: woForm.end_date || null,
      status: woForm.status,
    })
    if (error) { setMessage({ type: 'error', text: error.message }) }
    else {
      setMessage({ type: 'success', text: 'Work order added.' })
      setShowWOForm(false)
      setWOForm({ po_reference: '', name: '', budget: '', monthly_forecast: '', start_date: '', end_date: '', status: 'active' })
      loadAll()
    }
    setSaving(false)
  }

  async function addRateLine(e) {
    e.preventDefault(); setSaving(true); setMessage(null)
    const woId = showRLForm
    const existing = rateLines[woId] || []
    const { error } = await supabase.from('work_order_rate_lines').insert({
      sector_id: PCS_SECTOR_ID,
      work_order_id: woId,
      label: rlForm.label,
      bill_rate: parseFloat(rlForm.bill_rate),
      is_default: existing.length === 0,
      sort_order: existing.length + 1,
    })
    if (error) { setMessage({ type: 'error', text: error.message }) }
    else {
      setMessage({ type: 'success', text: 'Rate line added.' })
      setShowRLForm(null)
      setRLForm({ label: '', bill_rate: '' })
      loadAll()
    }
    setSaving(false)
  }

  if (loading) return <LoadingState message="Loading client profile..." />
  if (!client) return <div style={{ padding: '24px', color: BRAND.coolGrey }}>Client not found.</div>

  const totalInvoiced = invoices.reduce((s, i) => s + Number(i.amount), 0)
  const totalPaid = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.amount), 0)
  const totalWOBudget = workOrders.reduce((s, w) => s + Number(w.budget || 0), 0)

  const inputStyle = {
    width: '100%', padding: '8px 12px', border: `1px solid ${BRAND.greyBorder}`,
    fontFamily: BRAND.font, fontSize: '14px', color: BRAND.coolGrey, boxSizing: 'border-box',
  }

  return (
    <div>
      <button onClick={onBack} style={{
        background: 'none', border: 'none', cursor: 'pointer', color: BRAND.purple,
        fontFamily: BRAND.font, fontSize: '13px', padding: 0, marginBottom: '16px',
      }}>← Back to Projects</button>

      <SectionHeader
        title={client.name}
        subtitle={`Default rate: ${formatCurrencyExact(client.standard_bill_rate)} | Status: ${client.status}`}
        action={
          !editing ? (
            <button onClick={() => setEditing(true)} style={{
              padding: '8px 20px', background: BRAND.purple, color: BRAND.white,
              border: 'none', cursor: 'pointer', fontFamily: BRAND.font, fontSize: '13px',
            }}>Edit Client</button>
          ) : (
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => { setEditing(false); setClientForm(client) }} style={{
                padding: '8px 20px', background: BRAND.white, color: BRAND.coolGrey,
                border: `1px solid ${BRAND.greyBorder}`, cursor: 'pointer', fontFamily: BRAND.font, fontSize: '13px',
              }}>Cancel</button>
              <button onClick={saveClient} disabled={saving} style={{
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
        <KPICard label="Total PO Value" value={formatCurrency(totalWOBudget)} />
        <KPICard label="Total Invoiced" value={formatCurrency(totalInvoiced)} color={BRAND.teal} />
        <KPICard label="Total Paid" value={formatCurrency(totalPaid)} color={BRAND.green} />
        <KPICard label="PO Remaining" value={formatCurrency(totalWOBudget - totalInvoiced)} color={totalWOBudget - totalInvoiced < 0 ? BRAND.red : BRAND.green} />
        <KPICard label="Work Orders" value={workOrders.length} />
        <KPICard label="Projects" value={projects.length} />
      </div>

      {/* Client Details (editable) */}
      {editing && (
        <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, padding: '24px', marginBottom: '24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: BRAND.coolGrey, marginBottom: '4px' }}>Client Name</label>
              <input value={clientForm.name || ''} onChange={e => setClientForm({ ...clientForm, name: e.target.value })} style={inputStyle} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: BRAND.coolGrey, marginBottom: '4px' }}>Default Bill Rate ($)</label>
              <input type="number" step="0.01" value={clientForm.standard_bill_rate || ''} onChange={e => setClientForm({ ...clientForm, standard_bill_rate: e.target.value })} style={inputStyle} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: BRAND.coolGrey, marginBottom: '4px' }}>Status</label>
              <select value={clientForm.status || 'active'} onChange={e => setClientForm({ ...clientForm, status: e.target.value })} style={inputStyle}>
                <option value="active">Active</option>
                <option value="pipeline">Pipeline</option>
                <option value="closed">Closed</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Work Orders */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <span style={{ fontSize: '15px', color: BRAND.purple }}>Work Orders / Purchase Orders</span>
          <button onClick={() => setShowWOForm(!showWOForm)} style={{
            padding: '6px 16px', background: BRAND.purple, color: BRAND.white,
            border: 'none', cursor: 'pointer', fontFamily: BRAND.font, fontSize: '12px',
          }}>{showWOForm ? 'Cancel' : 'Add Work Order'}</button>
        </div>

        {/* Add WO form */}
        {showWOForm && (
          <form onSubmit={addWorkOrder} style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, padding: '20px', marginBottom: '12px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: BRAND.coolGrey, marginBottom: '4px' }}>PO Reference</label>
                <input value={woForm.po_reference} onChange={e => setWOForm({ ...woForm, po_reference: e.target.value })} required style={inputStyle} placeholder="WO-XXXXXX" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: BRAND.coolGrey, marginBottom: '4px' }}>Name</label>
                <input value={woForm.name} onChange={e => setWOForm({ ...woForm, name: e.target.value })} style={inputStyle} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: BRAND.coolGrey, marginBottom: '4px' }}>PO Budget ($)</label>
                <input type="number" step="0.01" value={woForm.budget} onChange={e => setWOForm({ ...woForm, budget: e.target.value })} style={inputStyle} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: BRAND.coolGrey, marginBottom: '4px' }}>Monthly Forecast ($)</label>
                <input type="number" step="0.01" value={woForm.monthly_forecast} onChange={e => setWOForm({ ...woForm, monthly_forecast: e.target.value })} style={inputStyle} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: BRAND.coolGrey, marginBottom: '4px' }}>Start Date</label>
                <input type="date" value={woForm.start_date} onChange={e => setWOForm({ ...woForm, start_date: e.target.value })} style={inputStyle} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: BRAND.coolGrey, marginBottom: '4px' }}>End Date</label>
                <input type="date" value={woForm.end_date} onChange={e => setWOForm({ ...woForm, end_date: e.target.value })} style={inputStyle} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: BRAND.coolGrey, marginBottom: '4px' }}>Status</label>
                <select value={woForm.status} onChange={e => setWOForm({ ...woForm, status: e.target.value })} style={inputStyle}>
                  <option value="active">Active</option>
                  <option value="pipeline">Pipeline</option>
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                <button type="submit" disabled={saving} style={{
                  padding: '8px 20px', background: BRAND.purple, color: BRAND.white,
                  border: 'none', cursor: 'pointer', fontFamily: BRAND.font, fontSize: '13px',
                }}>Add</button>
              </div>
            </div>
          </form>
        )}

        {/* Work order cards */}
        {workOrders.map(wo => {
          const woInvoiced = invoices.reduce((s, i) => s + Number(i.amount), 0) // TODO: link invoices to WO
          const woProjects = projects.filter(p => p.work_order_id === wo.id)
          const lines = rateLines[wo.id] || []

          return (
            <div key={wo.id} style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, padding: '20px', marginBottom: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                <div>
                  <div style={{ fontSize: '14px', color: BRAND.purple, marginBottom: '2px' }}>{wo.po_reference}{wo.name ? ` — ${wo.name}` : ''}</div>
                  <div style={{ fontSize: '12px', color: BRAND.coolGrey }}>
                    {wo.start_date && `${formatDate(wo.start_date)}`}{wo.end_date && ` to ${formatDate(wo.end_date)}`}
                  </div>
                </div>
                <StatusBadge status={wo.status} map={woStatusMap} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '16px' }}>
                <div>
                  <span style={{ fontSize: '11px', color: BRAND.coolGrey, display: 'block' }}>PO Budget</span>
                  <span style={{ fontSize: '16px', color: BRAND.purple }}>{wo.budget ? formatCurrency(wo.budget) : '—'}</span>
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: BRAND.coolGrey, display: 'block' }}>Monthly Forecast</span>
                  <span style={{ fontSize: '16px', color: BRAND.coolGrey }}>{wo.monthly_forecast ? formatCurrencyExact(wo.monthly_forecast) : '—'}</span>
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: BRAND.coolGrey, display: 'block' }}>Projects</span>
                  <span style={{ fontSize: '16px', color: BRAND.coolGrey }}>{woProjects.length}</span>
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: BRAND.coolGrey, display: 'block' }}>Rate Lines</span>
                  <span style={{ fontSize: '16px', color: BRAND.coolGrey }}>{lines.length}</span>
                </div>
              </div>

              {/* Rate Lines Table */}
              <div style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '12px', color: BRAND.coolGrey }}>Bill Rate Lines</span>
                  <button onClick={() => { setShowRLForm(showRLForm === wo.id ? null : wo.id); setRLForm({ label: '', bill_rate: '' }) }} style={{
                    padding: '4px 12px', background: BRAND.greyLight, color: BRAND.coolGrey,
                    border: `1px solid ${BRAND.greyBorder}`, cursor: 'pointer', fontFamily: BRAND.font, fontSize: '11px',
                  }}>{showRLForm === wo.id ? 'Cancel' : 'Add Rate'}</button>
                </div>

                {showRLForm === wo.id && (
                  <form onSubmit={addRateLine} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                    <input value={rlForm.label} onChange={e => setRLForm({ ...rlForm, label: e.target.value })} required placeholder="Label (e.g. Senior Compliance)" style={{ ...inputStyle, flex: 2 }} />
                    <input type="number" step="0.01" value={rlForm.bill_rate} onChange={e => setRLForm({ ...rlForm, bill_rate: e.target.value })} required placeholder="Rate ($)" style={{ ...inputStyle, flex: 1 }} />
                    <button type="submit" style={{ padding: '8px 16px', background: BRAND.purple, color: BRAND.white, border: 'none', cursor: 'pointer', fontFamily: BRAND.font, fontSize: '12px', whiteSpace: 'nowrap' }}>Add</button>
                  </form>
                )}

                {lines.length > 0 ? (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead><tr>
                      <th style={{ background: BRAND.purple, color: BRAND.white, padding: '6px 12px', textAlign: 'left', fontWeight: 400 }}>Label</th>
                      <th style={{ background: BRAND.purple, color: BRAND.white, padding: '6px 12px', textAlign: 'left', fontWeight: 400 }}>Bill Rate</th>
                      <th style={{ background: BRAND.purple, color: BRAND.white, padding: '6px 12px', textAlign: 'left', fontWeight: 400 }}>Default</th>
                    </tr></thead>
                    <tbody>
                      {lines.map((rl, idx) => (
                        <tr key={rl.id} style={{ background: idx % 2 === 0 ? BRAND.white : BRAND.greyLight }}>
                          <td style={{ padding: '6px 12px', color: BRAND.coolGrey, borderBottom: `1px solid ${BRAND.greyBorder}` }}>{rl.label}</td>
                          <td style={{ padding: '6px 12px', color: BRAND.coolGrey, borderBottom: `1px solid ${BRAND.greyBorder}` }}>{formatCurrencyExact(rl.bill_rate)}</td>
                          <td style={{ padding: '6px 12px', borderBottom: `1px solid ${BRAND.greyBorder}` }}>
                            {rl.is_default && <span style={{ fontSize: '11px', background: '#E8F5E8', color: BRAND.green, padding: '2px 8px' }}>Default</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div style={{ fontSize: '12px', color: BRAND.coolGrey, padding: '8px 0' }}>No rate lines defined yet.</div>
                )}
              </div>

              {/* Projects under this WO */}
              {woProjects.length > 0 && (
                <div>
                  <span style={{ fontSize: '12px', color: BRAND.coolGrey, display: 'block', marginBottom: '4px' }}>Projects</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {woProjects.map(p => (
                      <span key={p.id} style={{ fontSize: '12px', padding: '4px 10px', background: BRAND.greyLight, color: BRAND.coolGrey, border: `1px solid ${BRAND.greyBorder}` }}>
                        {p.code} — {p.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {workOrders.length === 0 && (
          <div style={{ padding: '24px', background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, color: BRAND.coolGrey, fontSize: '14px' }}>
            No work orders yet. Click "Add Work Order" to create one.
          </div>
        )}
      </div>

      {/* Invoices */}
      {invoices.length > 0 && (
        <div>
          <span style={{ fontSize: '15px', color: BRAND.purple, display: 'block', marginBottom: '12px' }}>Invoices</span>
          <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}` }}>
            <DataTable
              columns={[
                { header: 'Invoice', accessor: 'invoice_number', nowrap: true },
                { header: 'Month', render: r => formatDate(r.billing_month), nowrap: true },
                { header: 'Amount', render: r => formatCurrencyExact(r.amount), nowrap: true },
                { header: 'Status', render: r => <StatusBadge status={r.status} map={{
                  draft: { bg: BRAND.greyLight, text: BRAND.coolGrey, label: 'Draft' },
                  sent: { bg: '#E8F4FD', text: BRAND.blue, label: 'Sent' },
                  paid: { bg: '#E8F5E8', text: BRAND.green, label: 'Paid' },
                  overdue: { bg: '#FDECEC', text: BRAND.red, label: 'Overdue' },
                }} /> },
                { header: 'Date Paid', render: r => formatDate(r.date_paid), nowrap: true },
              ]}
              data={invoices}
            />
          </div>
        </div>
      )}
    </div>
  )
}
