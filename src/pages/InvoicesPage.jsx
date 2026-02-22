import { useState, useEffect } from 'react'
import { BRAND } from '../lib/brand'
import { formatCurrency, formatCurrencyExact, formatDate } from '../lib/utils'
import { supabase } from '../lib/supabase'
import { useInvoices, useClients, useInvoiceAging, PCS_SECTOR_ID } from '../hooks/useData'
import { KPICard, DataTable, StatusBadge, SectionHeader, LoadingState, invoiceStatusMap } from '../components/SharedUI'

const agingBucketMap = {
  paid: { bg: '#E8F5E8', text: BRAND.green, label: 'Paid' },
  current: { bg: '#E8F5E8', text: BRAND.green, label: 'Current' },
  '1_to_30_days': { bg: '#FFF4E5', text: BRAND.amber, label: '1-30 days' },
  '31_to_60_days': { bg: '#FFF4E5', text: BRAND.amber, label: '31-60 days' },
  '61_to_90_days': { bg: '#FDECEC', text: BRAND.red, label: '61-90 days' },
  over_90_days: { bg: '#FDECEC', text: BRAND.red, label: '90+ days' },
}

export default function InvoicesPage({ embedded }) {
  const { data: invoices, loading: invLoading } = useInvoices()
  const { data: clients } = useClients()
  const { data: aging } = useInvoiceAging()
  const [statusFilter, setStatusFilter] = useState('all')
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)
  const [form, setForm] = useState({
    client_id: '', billing_month: '', amount: '', notes: '',
  })

  if (invLoading) return <LoadingState message="Loading invoices..." />

  const filtered = statusFilter === 'all' ? invoices : invoices.filter(i => i.status === statusFilter)
  const totalAmt = invoices.reduce((s, i) => s + Number(i.amount), 0)
  const paidAmt = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.amount), 0)
  const overdueAmt = invoices.filter(i => i.status === 'overdue').reduce((s, i) => s + Number(i.amount), 0)
  const outstandingAmt = invoices.filter(i => i.status === 'sent' || i.status === 'overdue').reduce((s, i) => s + Number(i.amount), 0)

  const getClientName = (cid) => { const c = clients.find(cl => cl.id === cid); return c ? c.name : '—' }

  // PO comparison: client budget vs total invoiced per client
  const clientComparison = clients.filter(c => c.budget || c.monthly_forecast).map(c => {
    const clientInvoices = invoices.filter(i => i.client_id === c.id)
    const totalInvoiced = clientInvoices.reduce((s, i) => s + Number(i.amount), 0)
    const paidTotal = clientInvoices.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.amount), 0)
    return {
      ...c,
      totalInvoiced,
      paidTotal,
      remaining: (Number(c.budget) || 0) - totalInvoiced,
    }
  })

  async function handleSubmitInvoice(e) {
    e.preventDefault()
    setSaving(true)
    setMessage(null)

    const { data: { user } } = await supabase.auth.getUser()

    // Generate invoice number
    const month = new Date(form.billing_month + '-01')
    const monthStr = month.toLocaleDateString('en-US', { month: '2-digit' })
    const yearStr = month.getFullYear()
    const clientShort = clients.find(c => c.id === form.client_id)?.name?.substring(0, 4).toUpperCase() || 'XXXX'
    const invNum = `INV-${yearStr}-${monthStr}-${clientShort}`

    const { error } = await supabase.from('invoices').insert({
      sector_id: PCS_SECTOR_ID,
      client_id: form.client_id,
      invoice_number: invNum,
      billing_month: form.billing_month + '-01',
      amount: parseFloat(form.amount),
      status: 'sent',
      due_date: new Date(new Date(form.billing_month + '-01').getTime() + 30 * 86400000).toISOString().slice(0, 10),
      notes: form.notes || null,
      entered_by: user.id,
    })

    if (error) {
      setMessage({ type: 'error', text: error.message })
    } else {
      setMessage({ type: 'success', text: 'Invoice recorded successfully.' })
      setForm({ client_id: '', billing_month: '', amount: '', notes: '' })
      setShowForm(false)
      // Force page refresh to show new invoice
      window.location.reload()
    }
    setSaving(false)
  }

  const inputStyle = {
    width: '100%', padding: '8px 12px', border: `1px solid ${BRAND.greyBorder}`,
    fontFamily: BRAND.font, fontSize: '14px', color: BRAND.coolGrey, boxSizing: 'border-box',
  }

  return (
    <div>
      {!embedded && <SectionHeader
        title="Invoices"
        subtitle="Invoice tracking, PO comparison, and aged debt"
      />}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
        <button onClick={() => setShowForm(!showForm)} style={{
          padding: '8px 20px', background: BRAND.purple, color: BRAND.white,
          border: 'none', cursor: 'pointer', fontFamily: BRAND.font, fontSize: '13px',
        }}>{showForm ? 'Close Form' : 'Record Invoice'}</button>
      </div>

      {message && (
        <div style={{
          padding: '10px 16px', marginBottom: '16px', fontSize: '13px',
          background: message.type === 'error' ? '#FDECEC' : '#E8F5E8',
          color: message.type === 'error' ? BRAND.red : BRAND.green,
        }}>{message.text}</div>
      )}

      {/* Invoice Entry Form */}
      {showForm && (
        <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, padding: '24px', marginBottom: '24px' }}>
          <span style={{ fontSize: '14px', color: BRAND.purple, display: 'block', marginBottom: '16px' }}>Record Invoice Amount</span>
          <form onSubmit={handleSubmitInvoice}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: BRAND.coolGrey, marginBottom: '4px' }}>Client</label>
                <select value={form.client_id} onChange={e => setForm({ ...form, client_id: e.target.value })} required style={inputStyle}>
                  <option value="">Select client...</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: BRAND.coolGrey, marginBottom: '4px' }}>Billing Month</label>
                <input type="month" value={form.billing_month} onChange={e => setForm({ ...form, billing_month: e.target.value })} required style={inputStyle} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: BRAND.coolGrey, marginBottom: '4px' }}>Amount ($)</label>
                <input type="number" step="0.01" min="0" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} required style={inputStyle} placeholder="0.00" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: BRAND.coolGrey, marginBottom: '4px' }}>Notes (optional)</label>
                <input type="text" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} style={inputStyle} placeholder="PO ref, etc." />
              </div>
            </div>
            <button type="submit" disabled={saving} style={{
              padding: '8px 24px', background: BRAND.purple, color: BRAND.white,
              border: 'none', cursor: 'pointer', fontFamily: BRAND.font, fontSize: '13px',
              opacity: saving ? 0.7 : 1,
            }}>{saving ? 'Saving...' : 'Record Invoice'}</button>
          </form>
        </div>
      )}

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        <KPICard label="Total Invoiced" value={formatCurrency(totalAmt)} />
        <KPICard label="Paid" value={formatCurrency(paidAmt)} color={BRAND.green} />
        <KPICard label="Outstanding" value={formatCurrency(outstandingAmt)} color={BRAND.amber} />
        <KPICard label="Overdue" value={formatCurrency(overdueAmt)} color={BRAND.red} />
      </div>

      {/* PO Comparison */}
      {clientComparison.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <span style={{ fontSize: '15px', color: BRAND.purple, display: 'block', marginBottom: '12px' }}>PO Value vs Invoiced</span>
          <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}` }}>
            <DataTable
              columns={[
                { header: 'Client', accessor: 'name' },
                { header: 'PO / Budget', render: r => formatCurrency(r.budget), nowrap: true },
                { header: 'Monthly Forecast', render: r => r.monthly_forecast ? formatCurrencyExact(r.monthly_forecast) : '—', nowrap: true },
                { header: 'Total Invoiced', render: r => formatCurrency(r.totalInvoiced), nowrap: true },
                { header: 'Paid', render: r => formatCurrency(r.paidTotal), nowrap: true },
                { header: 'PO Remaining', render: r => (
                  <span style={{ color: r.remaining < 0 ? BRAND.red : BRAND.green }}>
                    {formatCurrency(r.remaining)}
                  </span>
                ), nowrap: true },
                { header: 'Burn %', render: r => {
                  const pct = Number(r.budget) > 0 ? (r.totalInvoiced / Number(r.budget) * 100).toFixed(1) : '—'
                  return typeof pct === 'string' ? pct : pct + '%'
                }, nowrap: true },
              ]}
              data={clientComparison}
            />
          </div>
        </div>
      )}

      {/* Invoice List */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <span style={{ fontSize: '15px', color: BRAND.purple }}>All Invoices</span>
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
        </div>
        <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}` }}>
          <DataTable
            columns={[
              { header: 'Invoice No.', accessor: 'invoice_number', nowrap: true },
              { header: 'Client', render: r => getClientName(r.client_id) },
              { header: 'Billing Month', render: r => formatDate(r.billing_month), nowrap: true },
              { header: 'Amount', render: r => formatCurrencyExact(r.amount), nowrap: true },
              { header: 'Status', render: r => <StatusBadge status={r.status} map={invoiceStatusMap} /> },
              { header: 'Due Date', render: r => formatDate(r.due_date), nowrap: true },
              { header: 'Date Paid', render: r => formatDate(r.date_paid), nowrap: true },
              { header: 'Notes', accessor: 'notes' },
            ]}
            data={filtered}
            emptyMessage="No invoices yet. Use 'Record Invoice' to add one."
          />
        </div>
      </div>

      {/* Aged Debt */}
      {aging.filter(a => a.status !== 'paid').length > 0 && (
        <div>
          <span style={{ fontSize: '15px', color: BRAND.purple, display: 'block', marginBottom: '12px' }}>Aged Debt</span>
          <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}` }}>
            <DataTable
              columns={[
                { header: 'Invoice', accessor: 'invoice_number', nowrap: true },
                { header: 'Client', accessor: 'client_name' },
                { header: 'Amount', render: r => formatCurrencyExact(r.amount), nowrap: true },
                { header: 'Due Date', render: r => formatDate(r.due_date), nowrap: true },
                { header: 'Days Outstanding', accessor: 'days_outstanding', nowrap: true },
                { header: 'Aging Bucket', render: r => <StatusBadge status={r.aging_bucket} map={agingBucketMap} /> },
              ]}
              data={aging.filter(a => a.status !== 'paid')}
            />
          </div>
        </div>
      )}
    </div>
  )
}
