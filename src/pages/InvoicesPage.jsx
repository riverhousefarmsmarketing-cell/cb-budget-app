import { useState, useEffect } from 'react'
import { BRAND } from '../lib/brand'
import { formatCurrency, formatCurrencyExact, formatDate } from '../lib/utils'
import { supabase } from '../lib/supabase'
import { PCS_SECTOR_ID, useClients } from '../hooks/useData'
import { KPICard, StatusBadge, SectionHeader, LoadingState } from '../components/SharedUI'
import { auditDelete } from '../lib/auditDelete'

const thStyle = { background: BRAND.purple, color: BRAND.white, padding: '10px 14px', textAlign: 'left', fontWeight: 400, fontSize: '13px', whiteSpace: 'nowrap' }
const tdStyle = (i) => ({ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, fontSize: '12px', color: BRAND.coolGrey, background: i % 2 === 0 ? BRAND.white : BRAND.greyLight })
const inputStyle = { width: '100%', padding: '8px 12px', border: `1px solid ${BRAND.greyBorder}`, fontFamily: BRAND.font, fontSize: '13px', color: BRAND.coolGrey, boxSizing: 'border-box' }
const formLabelStyle = { display: 'block', fontSize: '12px', color: BRAND.coolGrey, marginBottom: '4px', fontFamily: BRAND.font }

const invoiceStatusMap = {
  draft: { bg: BRAND.greyLight, text: BRAND.coolGrey, label: 'Draft' },
  sent: { bg: '#E8F4FD', text: BRAND.blue, label: 'Sent' },
  paid: { bg: '#E8F5E8', text: BRAND.green, label: 'Paid' },
  overdue: { bg: '#FDECEC', text: BRAND.red, label: 'Overdue' },
}

const agingBucketMap = {
  paid: { bg: '#E8F5E8', text: BRAND.green, label: 'Paid' },
  current: { bg: '#E8F5E8', text: BRAND.green, label: 'Current' },
  '1_to_30_days': { bg: '#FFF4E5', text: BRAND.amber, label: '1-30 days' },
  '31_to_60_days': { bg: '#FFF4E5', text: BRAND.amber, label: '31-60 days' },
  '61_to_90_days': { bg: '#FDECEC', text: BRAND.red, label: '61-90 days' },
  over_90_days: { bg: '#FDECEC', text: BRAND.red, label: '90+ days' },
}

export default function InvoicesPage({ embedded }) {
  const [invoices, setInvoices] = useState([])
  const [aging, setAging] = useState([])
  const [loading, setLoading] = useState(true)
  const { data: clients } = useClients()
  const [statusFilter, setStatusFilter] = useState('all')
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)
  const [form, setForm] = useState({ client_id: '', billing_month: '', amount: '', notes: '', status: 'sent', due_date: '', date_paid: '' })

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [invRes, agingRes] = await Promise.all([
      supabase.from('invoices').select('*').eq('sector_id', PCS_SECTOR_ID).order('billing_month', { ascending: false }),
      supabase.from('v_invoice_aging').select('*').eq('sector_id', PCS_SECTOR_ID),
    ])
    setInvoices(invRes.data || [])
    setAging(agingRes.data || [])
    setLoading(false)
  }

  const clientMap = Object.fromEntries((clients || []).map(c => [c.id, c]))
  const getClientName = (cid) => clientMap[cid]?.name || '—'
  const filtered = statusFilter === 'all' ? invoices : invoices.filter(i => i.status === statusFilter)

  // KPIs
  const totalAmt = invoices.reduce((s, i) => s + Number(i.amount || 0), 0)
  const paidAmt = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.amount || 0), 0)
  const overdueAmt = invoices.filter(i => i.status === 'overdue').reduce((s, i) => s + Number(i.amount || 0), 0)
  const outstandingAmt = invoices.filter(i => i.status === 'sent' || i.status === 'overdue').reduce((s, i) => s + Number(i.amount || 0), 0)
  const draftAmt = invoices.filter(i => i.status === 'draft').reduce((s, i) => s + Number(i.amount || 0), 0)

  // Monthly revenue summary
  const monthlyRevenue = {}
  invoices.forEach(inv => {
    const m = inv.billing_month?.slice(0, 7)
    if (!m) return
    if (!monthlyRevenue[m]) monthlyRevenue[m] = { invoiced: 0, paid: 0, outstanding: 0 }
    monthlyRevenue[m].invoiced += Number(inv.amount || 0)
    if (inv.status === 'paid') monthlyRevenue[m].paid += Number(inv.amount || 0)
    if (inv.status === 'sent' || inv.status === 'overdue') monthlyRevenue[m].outstanding += Number(inv.amount || 0)
  })
  const monthlySorted = Object.entries(monthlyRevenue).sort(([a], [b]) => a.localeCompare(b))

  // PO comparison per client
  const clientComparison = (clients || []).filter(c => c.budget).map(c => {
    const clientInvoices = invoices.filter(i => i.client_id === c.id)
    const totalInvoiced = clientInvoices.reduce((s, i) => s + Number(i.amount || 0), 0)
    const paidTotal = clientInvoices.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.amount || 0), 0)
    return { ...c, totalInvoiced, paidTotal, remaining: (Number(c.budget) || 0) - totalInvoiced }
  })

  function resetForm() {
    setForm({ client_id: '', billing_month: '', amount: '', notes: '', status: 'sent', due_date: '', date_paid: '' })
    setEditId(null)
    setShowForm(false)
  }

  function startEdit(inv) {
    setForm({
      client_id: inv.client_id || '',
      billing_month: inv.billing_month?.slice(0, 7) || '',
      amount: inv.amount || '',
      notes: inv.notes || '',
      status: inv.status || 'sent',
      due_date: inv.due_date || '',
      date_paid: inv.date_paid || '',
    })
    setEditId(inv.id)
    setShowForm(true)
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true); setMessage(null)

    // Auto-flip status to paid when date_paid is entered
    let status = form.status
    if (form.date_paid && status !== 'paid') status = 'paid'

    const payload = {
      client_id: form.client_id,
      billing_month: form.billing_month + '-01',
      amount: parseFloat(form.amount),
      status,
      notes: form.notes || null,
      due_date: form.due_date || null,
      date_paid: form.date_paid || null,
    }

    if (editId) {
      const { error } = await supabase.from('invoices').update(payload).eq('id', editId)
      if (error) { setMessage({ type: 'error', text: error.message }) }
      else { setMessage({ type: 'success', text: 'Invoice updated.' }); resetForm(); loadAll() }
    } else {
      const { data: { user } } = await supabase.auth.getUser()
      const month = new Date(form.billing_month + '-01')
      const monthStr = String(month.getMonth() + 1).padStart(2, '0')
      const clientShort = clientMap[form.client_id]?.name?.substring(0, 4).toUpperCase() || 'XXXX'
      const invNum = `INV-${month.getFullYear()}-${monthStr}-${clientShort}`

      payload.sector_id = PCS_SECTOR_ID
      payload.invoice_number = invNum
      payload.entered_by = user?.id
      if (!payload.due_date) {
        payload.due_date = new Date(month.getTime() + 30 * 86400000).toISOString().slice(0, 10)
      }

      const { error } = await supabase.from('invoices').insert(payload)
      if (error) { setMessage({ type: 'error', text: error.message }) }
      else { setMessage({ type: 'success', text: 'Invoice recorded.' }); resetForm(); loadAll() }
    }
    setSaving(false)
  }

  async function handleDelete(inv) {
    if (!confirm(`Delete invoice ${inv.invoice_number}?`)) return
    await auditDelete('invoices', inv.id, inv)
    loadAll()
  }

  // Quick inline status update
  async function quickStatusUpdate(inv, newStatus) {
    const update = { status: newStatus }
    if (newStatus === 'paid' && !inv.date_paid) {
      update.date_paid = new Date().toISOString().slice(0, 10)
    }
    await supabase.from('invoices').update(update).eq('id', inv.id)
    loadAll()
  }

  // Quick inline date paid entry
  async function quickDatePaid(inv, datePaid) {
    const update = { date_paid: datePaid }
    if (datePaid) update.status = 'paid'
    await supabase.from('invoices').update(update).eq('id', inv.id)
    loadAll()
  }

  if (loading) return <LoadingState message="Loading invoices..." />

  return (
    <div>
      {!embedded && <SectionHeader title="Invoices" subtitle="Invoice tracking, PO comparison, and aged debt" />}

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        <KPICard label="Total Invoiced" value={formatCurrency(totalAmt)} />
        <KPICard label="Paid" value={formatCurrency(paidAmt)} color={BRAND.green} />
        <KPICard label="Outstanding" value={formatCurrency(outstandingAmt)} color={BRAND.amber} />
        <KPICard label="Overdue" value={formatCurrency(overdueAmt)} color={BRAND.red} />
        <KPICard label="Draft" value={formatCurrency(draftAmt)} />
        <KPICard label="Collection Rate" value={totalAmt > 0 ? `${(paidAmt / totalAmt * 100).toFixed(0)}%` : '—'} color={BRAND.green} />
      </div>

      {/* Monthly Revenue Summary */}
      {monthlySorted.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <span style={{ fontSize: '14px', color: BRAND.purple, display: 'block', marginBottom: '12px' }}>Monthly Revenue Summary</span>
          <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                {['Month', 'Invoiced', 'Paid', 'Outstanding', 'Collection %'].map(h => <th key={h} style={thStyle}>{h}</th>)}
              </tr></thead>
              <tbody>
                {monthlySorted.map(([m, d], i) => (
                  <tr key={m}>
                    <td style={{ ...tdStyle(i), color: BRAND.purple, fontWeight: 600 }}>{new Date(m + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</td>
                    <td style={tdStyle(i)}>{formatCurrency(d.invoiced)}</td>
                    <td style={{ ...tdStyle(i), color: BRAND.green }}>{formatCurrency(d.paid)}</td>
                    <td style={{ ...tdStyle(i), color: d.outstanding > 0 ? BRAND.amber : BRAND.coolGrey }}>{formatCurrency(d.outstanding)}</td>
                    <td style={tdStyle(i)}>{d.invoiced > 0 ? `${(d.paid / d.invoiced * 100).toFixed(0)}%` : '—'}</td>
                  </tr>
                ))}
                <tr style={{ borderTop: `2px solid ${BRAND.purple}` }}>
                  <td style={{ padding: '10px 14px', color: BRAND.purple, fontWeight: 600, fontSize: '12px' }}>Total</td>
                  <td style={{ padding: '10px 14px', fontSize: '12px', fontWeight: 600 }}>{formatCurrency(totalAmt)}</td>
                  <td style={{ padding: '10px 14px', fontSize: '12px', fontWeight: 600, color: BRAND.green }}>{formatCurrency(paidAmt)}</td>
                  <td style={{ padding: '10px 14px', fontSize: '12px', fontWeight: 600, color: BRAND.amber }}>{formatCurrency(outstandingAmt)}</td>
                  <td style={{ padding: '10px 14px', fontSize: '12px', fontWeight: 600 }}>{totalAmt > 0 ? `${(paidAmt / totalAmt * 100).toFixed(0)}%` : '—'}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PO Comparison */}
      {clientComparison.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <span style={{ fontSize: '14px', color: BRAND.purple, display: 'block', marginBottom: '12px' }}>Client PO vs Invoiced</span>
          <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                {['Client', 'PO / Budget', 'Invoiced', 'Paid', 'Remaining', 'Burn %'].map(h => <th key={h} style={thStyle}>{h}</th>)}
              </tr></thead>
              <tbody>
                {clientComparison.map((c, i) => {
                  const burnPct = Number(c.budget) > 0 ? (c.totalInvoiced / Number(c.budget) * 100) : 0
                  return (
                    <tr key={c.id}>
                      <td style={{ ...tdStyle(i), color: BRAND.purple }}>{c.name}</td>
                      <td style={tdStyle(i)}>{formatCurrency(c.budget)}</td>
                      <td style={tdStyle(i)}>{formatCurrency(c.totalInvoiced)}</td>
                      <td style={{ ...tdStyle(i), color: BRAND.green }}>{formatCurrency(c.paidTotal)}</td>
                      <td style={{ ...tdStyle(i), color: c.remaining < 0 ? BRAND.red : BRAND.green, fontWeight: 600 }}>{formatCurrency(c.remaining)}</td>
                      <td style={tdStyle(i)}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ flex: 1, height: '6px', background: BRAND.greyLight, minWidth: '60px' }}>
                            <div style={{ height: '100%', width: `${Math.min(burnPct, 100)}%`, background: burnPct > 90 ? BRAND.red : burnPct > 70 ? BRAND.amber : BRAND.green }} />
                          </div>
                          <span style={{ fontSize: '11px', whiteSpace: 'nowrap' }}>{burnPct.toFixed(0)}%</span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Action bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <span style={{ fontSize: '14px', color: BRAND.purple }}>All Invoices ({filtered.length})</span>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{
            padding: '6px 12px', border: `1px solid ${BRAND.greyBorder}`, background: BRAND.white,
            color: BRAND.coolGrey, fontFamily: BRAND.font, fontSize: '13px',
          }}>
            <option value="all">All statuses</option>
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="paid">Paid</option>
            <option value="overdue">Overdue</option>
          </select>
          <button onClick={() => { resetForm(); setShowForm(!showForm) }} style={{
            padding: '8px 20px', background: BRAND.purple, color: BRAND.white,
            border: 'none', cursor: 'pointer', fontFamily: BRAND.font, fontSize: '13px',
          }}>{showForm && !editId ? 'Cancel' : 'Record Invoice'}</button>
        </div>
      </div>

      {message && (
        <div style={{ padding: '10px 16px', marginBottom: '12px', fontSize: '13px',
          background: message.type === 'error' ? '#FDECEC' : '#E8F5E8',
          color: message.type === 'error' ? BRAND.red : BRAND.green,
        }}>{message.text}</div>
      )}

      {/* Invoice Entry/Edit Form */}
      {showForm && (
        <div style={{ background: BRAND.purpleLight, border: `1px solid ${BRAND.greyBorder}`, padding: '24px', marginBottom: '20px' }}>
          <span style={{ fontSize: '14px', color: BRAND.purple, display: 'block', marginBottom: '16px' }}>
            {editId ? 'Edit Invoice' : 'Record New Invoice'}
          </span>
          <form onSubmit={handleSave}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '16px' }}>
              <div>
                <label style={formLabelStyle}>Client *</label>
                <select value={form.client_id} onChange={e => setForm({ ...form, client_id: e.target.value })} required style={inputStyle}>
                  <option value="">Select client...</option>
                  {(clients || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label style={formLabelStyle}>Billing Month *</label>
                <input type="month" value={form.billing_month} onChange={e => setForm({ ...form, billing_month: e.target.value })} required style={inputStyle} />
              </div>
              <div>
                <label style={formLabelStyle}>Amount ($) *</label>
                <input type="number" step="0.01" min="0" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} required style={inputStyle} placeholder="0.00" />
              </div>
              <div>
                <label style={formLabelStyle}>Status</label>
                <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} style={inputStyle}>
                  <option value="draft">Draft</option>
                  <option value="sent">Sent</option>
                  <option value="paid">Paid</option>
                  <option value="overdue">Overdue</option>
                </select>
              </div>
              <div>
                <label style={formLabelStyle}>Due Date</label>
                <input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} style={inputStyle} />
              </div>
              <div>
                <label style={formLabelStyle}>Date Paid</label>
                <input type="date" value={form.date_paid} onChange={e => setForm({ ...form, date_paid: e.target.value })} style={inputStyle} />
                {form.date_paid && form.status !== 'paid' && (
                  <span style={{ fontSize: '10px', color: BRAND.green }}>Status will auto-change to Paid</span>
                )}
              </div>
              <div>
                <label style={formLabelStyle}>Notes</label>
                <input type="text" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} style={inputStyle} placeholder="PO ref, payment ref, etc." />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button type="button" onClick={resetForm} style={{
                padding: '8px 20px', background: BRAND.white, color: BRAND.coolGrey,
                border: `1px solid ${BRAND.greyBorder}`, cursor: 'pointer', fontFamily: BRAND.font, fontSize: '13px',
              }}>Cancel</button>
              <button type="submit" disabled={saving} style={{
                padding: '8px 24px', background: BRAND.purple, color: BRAND.white,
                border: 'none', cursor: 'pointer', fontFamily: BRAND.font, fontSize: '13px',
              }}>{saving ? 'Saving...' : editId ? 'Save Changes' : 'Record Invoice'}</button>
            </div>
          </form>
        </div>
      )}

      {/* Invoice List with inline actions */}
      <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, overflow: 'auto', marginBottom: '24px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            {['Invoice #', 'Client', 'Billing Month', 'Amount', 'Status', 'Due Date', 'Date Paid', 'Notes', 'Actions'].map(h => <th key={h} style={thStyle}>{h}</th>)}
          </tr></thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={9} style={{ padding: '24px', color: BRAND.coolGrey, fontSize: '13px' }}>No invoices found.</td></tr>
            ) : filtered.map((inv, i) => (
              <tr key={inv.id}>
                <td style={{ ...tdStyle(i), color: BRAND.purple, fontWeight: 600, whiteSpace: 'nowrap' }}>{inv.invoice_number}</td>
                <td style={tdStyle(i)}>{getClientName(inv.client_id)}</td>
                <td style={{ ...tdStyle(i), whiteSpace: 'nowrap' }}>{inv.billing_month ? new Date(inv.billing_month).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '—'}</td>
                <td style={{ ...tdStyle(i), fontWeight: 600, whiteSpace: 'nowrap' }}>{formatCurrencyExact(inv.amount)}</td>
                <td style={tdStyle(i)}>
                  <StatusBadge status={inv.status} map={invoiceStatusMap} />
                </td>
                <td style={{ ...tdStyle(i), whiteSpace: 'nowrap' }}>{formatDate(inv.due_date)}</td>
                <td style={tdStyle(i)}>
                  {inv.date_paid ? (
                    <span style={{ color: BRAND.green }}>{formatDate(inv.date_paid)}</span>
                  ) : inv.status !== 'paid' ? (
                    <input type="date" style={{ border: `1px solid ${BRAND.greyBorder}`, padding: '3px 6px', fontSize: '11px', fontFamily: BRAND.font, color: BRAND.coolGrey }}
                      onChange={e => { if (e.target.value) quickDatePaid(inv, e.target.value) }}
                    />
                  ) : '—'}
                </td>
                <td style={{ ...tdStyle(i), maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inv.notes || '—'}</td>
                <td style={{ ...tdStyle(i), whiteSpace: 'nowrap' }}>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {inv.status === 'draft' && (
                      <button onClick={() => quickStatusUpdate(inv, 'sent')} style={{ background: 'none', border: 'none', color: BRAND.blue, cursor: 'pointer', fontSize: '11px', fontFamily: BRAND.font, textDecoration: 'underline' }}>Mark Sent</button>
                    )}
                    {(inv.status === 'sent' || inv.status === 'overdue') && (
                      <button onClick={() => quickStatusUpdate(inv, 'paid')} style={{ background: 'none', border: 'none', color: BRAND.green, cursor: 'pointer', fontSize: '11px', fontFamily: BRAND.font, textDecoration: 'underline' }}>Mark Paid</button>
                    )}
                    <button onClick={() => startEdit(inv)} style={{ background: 'none', border: 'none', color: BRAND.purple, cursor: 'pointer', fontSize: '11px', fontFamily: BRAND.font, textDecoration: 'underline' }}>Edit</button>
                    <button onClick={() => handleDelete(inv)} style={{ background: 'none', border: 'none', color: BRAND.red, cursor: 'pointer', fontSize: '11px', fontFamily: BRAND.font, textDecoration: 'underline' }}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Aged Debt */}
      {aging.filter(a => a.status !== 'paid').length > 0 && (
        <div>
          <span style={{ fontSize: '14px', color: BRAND.purple, display: 'block', marginBottom: '12px' }}>Aged Debt</span>
          <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                {['Invoice', 'Client', 'Amount', 'Due Date', 'Days Outstanding', 'Aging Bucket'].map(h => <th key={h} style={thStyle}>{h}</th>)}
              </tr></thead>
              <tbody>
                {aging.filter(a => a.status !== 'paid').map((a, i) => (
                  <tr key={a.id || i}>
                    <td style={{ ...tdStyle(i), color: BRAND.purple }}>{a.invoice_number}</td>
                    <td style={tdStyle(i)}>{a.client_name}</td>
                    <td style={{ ...tdStyle(i), fontWeight: 600 }}>{formatCurrencyExact(a.amount)}</td>
                    <td style={{ ...tdStyle(i), whiteSpace: 'nowrap' }}>{formatDate(a.due_date)}</td>
                    <td style={{ ...tdStyle(i), fontWeight: 600, color: a.days_outstanding > 60 ? BRAND.red : a.days_outstanding > 30 ? BRAND.amber : BRAND.coolGrey }}>{a.days_outstanding}</td>
                    <td style={tdStyle(i)}><StatusBadge status={a.aging_bucket} map={agingBucketMap} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
