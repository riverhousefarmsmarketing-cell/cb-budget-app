import { useState, useEffect, useRef } from 'react'
import { BRAND } from '../lib/brand'
import { Icons } from '../components/Icons'
import { supabase } from '../lib/supabase'
import { PCS_SECTOR_ID, useEmployees } from '../hooks/useData'
import { SectionHeader, KPICard, StatusBadge, LoadingState } from '../components/SharedUI'
import { formatDate, formatCurrency } from '../lib/utils'

const thStyle = { background: BRAND.purple, color: BRAND.white, padding: '10px 14px', textAlign: 'left', fontWeight: 400, fontSize: '13px', whiteSpace: 'nowrap' }
const tdStyle = (i) => ({ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, fontSize: '12px', color: BRAND.coolGrey, background: i % 2 === 0 ? BRAND.white : BRAND.greyLight })

const uploadStatusMap = {
  pending: { bg: BRAND.greyLight, text: BRAND.coolGrey, label: 'Pending' },
  valid: { bg: '#E8F4FD', text: BRAND.blue, label: 'Valid' },
  errors: { bg: '#FDECEC', text: BRAND.red, label: 'Errors' },
  imported: { bg: '#E8F5E8', text: BRAND.green, label: 'Imported' },
}

export default function TimesheetsPage({ embedded }) {
  const [entries, setEntries] = useState([])
  const [uploads, setUploads] = useState([])
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('entries')
  const [uploadMsg, setUploadMsg] = useState(null)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef(null)
  const { data: employees } = useEmployees()

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [entRes, uplRes, invRes] = await Promise.all([
      supabase.from('timesheet_entries').select('*, employees(name, employee_code), projects(project_code, project_name)').eq('sector_id', PCS_SECTOR_ID).order('week_ending', { ascending: false }).limit(200),
      supabase.from('timesheet_uploads').select('*').eq('sector_id', PCS_SECTOR_ID).order('created_at', { ascending: false }).limit(50),
      supabase.from('invoices').select('*, clients(name)').eq('sector_id', PCS_SECTOR_ID).order('billing_month', { ascending: false }),
    ])
    setEntries(entRes.data || [])
    setUploads(uplRes.data || [])
    setInvoices(invRes.data || [])
    setLoading(false)
  }

  // CSV Upload handler
  async function handleFileUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true); setUploadMsg(null)

    try {
      const text = await file.text()
      const lines = text.trim().split('\n')
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
      const rows = lines.slice(1).map(line => {
        const vals = line.split(',').map(v => v.trim())
        const obj = {}
        headers.forEach((h, i) => { obj[h] = vals[i] || '' })
        return obj
      }).filter(r => r.employee_code && r.project_code && r.week_ending && r.hours)

      if (rows.length === 0) {
        setUploadMsg({ type: 'error', text: 'No valid rows found. Expected columns: employee_code, project_code, week_ending, hours' })
        setUploading(false); return
      }

      // Create upload record
      const weekEndings = rows.map(r => r.week_ending).sort()
      const { data: uploadRec, error: uplError } = await supabase.from('timesheet_uploads').insert({
        sector_id: PCS_SECTOR_ID,
        uploaded_by: (await supabase.auth.getUser()).data.user?.id,
        filename: file.name,
        row_count: rows.length,
        validation_status: 'pending',
        period_start: weekEndings[0],
        period_end: weekEndings[weekEndings.length - 1],
      }).select().single()

      if (uplError) { setUploadMsg({ type: 'error', text: uplError.message }); setUploading(false); return }

      // Resolve employee_code and project_code to IDs
      const { data: allEmps } = await supabase.from('employees').select('id, employee_code').eq('sector_id', PCS_SECTOR_ID)
      const { data: allProjects } = await supabase.from('projects').select('id, project_code').eq('sector_id', PCS_SECTOR_ID)
      const empCodeMap = Object.fromEntries((allEmps || []).map(e => [e.employee_code, e.id]))
      const projCodeMap = Object.fromEntries((allProjects || []).map(p => [p.project_code, p.id]))

      const validRows = []
      const errors = []
      rows.forEach((r, i) => {
        const empId = empCodeMap[r.employee_code]
        const projId = projCodeMap[r.project_code]
        if (!empId) errors.push({ row: i + 2, error: `Unknown employee_code: ${r.employee_code}` })
        else if (!projId) errors.push({ row: i + 2, error: `Unknown project_code: ${r.project_code}` })
        else if (isNaN(parseFloat(r.hours))) errors.push({ row: i + 2, error: `Invalid hours: ${r.hours}` })
        else validRows.push({
          sector_id: PCS_SECTOR_ID, employee_id: empId, project_id: projId,
          week_ending: r.week_ending, hours: parseFloat(r.hours),
          upload_batch_id: uploadRec.id,
        })
      })

      if (validRows.length > 0) {
        const { error: insError } = await supabase.from('timesheet_entries').upsert(validRows, { onConflict: 'sector_id,employee_id,project_id,week_ending' })
        if (insError) errors.push({ row: 0, error: insError.message })
      }

      await supabase.from('timesheet_uploads').update({
        validation_status: errors.length > 0 ? 'errors' : 'imported',
        validation_errors: errors.length > 0 ? errors : null,
        row_count: validRows.length,
      }).eq('id', uploadRec.id)

      setUploadMsg({
        type: errors.length > 0 ? 'warning' : 'success',
        text: `Imported ${validRows.length} entries from ${file.name}.${errors.length > 0 ? ` ${errors.length} row(s) had errors.` : ''}`
      })
      loadAll()
    } catch (err) {
      setUploadMsg({ type: 'error', text: `Upload failed: ${err.message}` })
    }
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  // Invoice lag: months with timesheets but no invoice
  function getInvoiceLag() {
    const monthsWithTime = new Set()
    entries.forEach(e => {
      const d = new Date(e.week_ending)
      monthsWithTime.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    })
    const monthsInvoiced = new Set()
    invoices.forEach(inv => {
      const d = new Date(inv.billing_month)
      monthsInvoiced.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    })
    return [...monthsWithTime].filter(m => !monthsInvoiced.has(m)).sort()
  }

  if (loading) return <LoadingState message="Loading timesheet data..." />

  const totalHours = entries.reduce((t, e) => t + Number(e.hours || 0), 0)
  const uniqueWeeks = new Set(entries.map(e => e.week_ending)).size
  const invoiceLag = getInvoiceLag()
  const tabs = [
    { key: 'entries', label: `Timesheet Entries (${entries.length})` },
    { key: 'uploads', label: `Upload History (${uploads.length})` },
    { key: 'invoicelag', label: `Invoice Status${invoiceLag.length > 0 ? ` (${invoiceLag.length} behind)` : ''}` },
  ]

  return (
    <div>
      {!embedded && <SectionHeader title="Timesheets" subtitle="Upload and review timesheet data. Entries are read-only after import." />}

      {/* Upload Section */}
      <div style={{ background: BRAND.white, border: `2px dashed ${BRAND.greyBorder}`, padding: '24px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ color: BRAND.purple }}><Icons.Upload /></div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: '14px', color: BRAND.purple, margin: '0 0 4px', fontFamily: BRAND.font }}>Upload Timesheet CSV</p>
            <p style={{ fontSize: '12px', color: BRAND.coolGrey, margin: '0 0 12px', fontFamily: BRAND.font }}>
              CSV columns: employee_code, project_code, week_ending, hours. Entries are validated, imported, and locked — they cannot be edited after upload.
            </p>
            <input ref={fileRef} type="file" accept=".csv" onChange={handleFileUpload} style={{ display: 'none' }} />
            <button onClick={() => fileRef.current?.click()} disabled={uploading} style={{
              padding: '8px 20px', background: BRAND.purple, color: BRAND.white,
              border: 'none', cursor: uploading ? 'not-allowed' : 'pointer',
              fontFamily: BRAND.font, fontSize: '13px',
            }}>
              {uploading ? 'Uploading...' : 'Select File and Upload'}
            </button>
          </div>
        </div>
        {uploadMsg && (
          <div style={{ marginTop: '12px', padding: '10px 16px', fontSize: '13px', fontFamily: BRAND.font,
            background: uploadMsg.type === 'error' ? '#FDECEC' : uploadMsg.type === 'warning' ? '#FFF4E5' : '#E8F5E8',
            color: uploadMsg.type === 'error' ? BRAND.red : uploadMsg.type === 'warning' ? BRAND.amber : BRAND.green,
          }}>{uploadMsg.text}</div>
        )}
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        <KPICard label="Total Entries" value={entries.length} />
        <KPICard label="Total Hours" value={totalHours.toLocaleString()} />
        <KPICard label="Weeks Covered" value={uniqueWeeks} />
        <KPICard label="Uploads" value={uploads.length} />
        <KPICard label="Invoicing Behind" value={invoiceLag.length} color={invoiceLag.length > 0 ? BRAND.red : BRAND.green} />
      </div>

      {/* Read-only notice */}
      <div style={{ padding: '10px 16px', background: BRAND.greyLight, fontSize: '12px', color: BRAND.coolGrey, fontFamily: BRAND.font, marginBottom: '16px', borderLeft: `4px solid ${BRAND.coolGrey}` }}>
        LOCKED — Timesheet entries are read-only after upload. They cannot be edited or deleted. To correct data, upload a corrected CSV which will overwrite entries for the same employee/project/week.
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 0, borderBottom: `2px solid ${BRAND.greyBorder}`, marginBottom: '20px' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '10px 20px', fontFamily: BRAND.font, fontSize: '13px', cursor: 'pointer',
            background: tab === t.key ? BRAND.purple : 'transparent',
            color: tab === t.key ? BRAND.white : BRAND.coolGrey,
            border: 'none', borderBottom: tab === t.key ? `2px solid ${BRAND.purple}` : '2px solid transparent',
            marginBottom: '-2px',
          }}>{t.label}</button>
        ))}
      </div>

      {/* ENTRIES TAB — read-only */}
      {tab === 'entries' && (
        <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              {['Week Ending', 'Employee', 'Code', 'Project', 'Hours', 'Upload'].map(h => <th key={h} style={thStyle}>{h}</th>)}
            </tr></thead>
            <tbody>
              {entries.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: '24px', color: BRAND.coolGrey, fontSize: '13px' }}>No timesheet entries. Upload a CSV to get started.</td></tr>
              ) : entries.map((e, i) => (
                <tr key={e.id}>
                  <td style={{ ...tdStyle(i), whiteSpace: 'nowrap' }}>{formatDate(e.week_ending)}</td>
                  <td style={tdStyle(i)}>{e.employees?.name || '—'}</td>
                  <td style={tdStyle(i)}>{e.employees?.employee_code || '—'}</td>
                  <td style={tdStyle(i)}>{e.projects?.project_code || '—'} — {e.projects?.project_name || ''}</td>
                  <td style={{ ...tdStyle(i), fontWeight: 600 }}>{e.hours}</td>
                  <td style={{ ...tdStyle(i), fontSize: '11px' }}>{e.upload_batch_id ? 'CSV Import' : 'Manual'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* UPLOADS TAB */}
      {tab === 'uploads' && (
        <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              {['Date', 'Filename', 'Rows', 'Period', 'Status', 'Errors'].map(h => <th key={h} style={thStyle}>{h}</th>)}
            </tr></thead>
            <tbody>
              {uploads.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: '24px', color: BRAND.coolGrey, fontSize: '13px' }}>No uploads yet.</td></tr>
              ) : uploads.map((u, i) => (
                <tr key={u.id}>
                  <td style={{ ...tdStyle(i), whiteSpace: 'nowrap' }}>{new Date(u.created_at).toLocaleString()}</td>
                  <td style={tdStyle(i)}>{u.filename}</td>
                  <td style={tdStyle(i)}>{u.row_count}</td>
                  <td style={{ ...tdStyle(i), whiteSpace: 'nowrap' }}>{u.period_start ? `${formatDate(u.period_start)} - ${formatDate(u.period_end)}` : '—'}</td>
                  <td style={tdStyle(i)}><StatusBadge status={u.validation_status} map={uploadStatusMap} /></td>
                  <td style={tdStyle(i)}>{u.validation_errors ? JSON.stringify(u.validation_errors).slice(0, 80) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* INVOICE LAG TAB */}
      {tab === 'invoicelag' && (
        <div>
          <div style={{ fontSize: '12px', color: BRAND.coolGrey, marginBottom: '16px', fontFamily: BRAND.font }}>
            Months where timesheet hours exist but no invoice has been recorded. These months may need invoicing attention.
          </div>
          {invoiceLag.length === 0 ? (
            <div style={{ padding: '24px', background: '#E8F5E8', border: `1px solid ${BRAND.greyBorder}`, color: BRAND.green, fontSize: '13px' }}>All months with timesheet data have corresponding invoices.</div>
          ) : (
            <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  <th style={thStyle}>Month</th>
                  <th style={thStyle}>Timesheet Hours</th>
                  <th style={thStyle}>Invoice Status</th>
                </tr></thead>
                <tbody>
                  {invoiceLag.map((m, i) => {
                    const [y, mo] = m.split('-')
                    const monthHours = entries.filter(e => {
                      const d = new Date(e.week_ending)
                      return d.getFullYear() === parseInt(y) && d.getMonth() + 1 === parseInt(mo)
                    }).reduce((t, e) => t + Number(e.hours || 0), 0)
                    return (
                      <tr key={m}>
                        <td style={{ ...tdStyle(i), fontWeight: 600, color: BRAND.purple }}>{new Date(parseInt(y), parseInt(mo) - 1).toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}</td>
                        <td style={tdStyle(i)}>{monthHours.toLocaleString()} hrs</td>
                        <td style={{ ...tdStyle(i), color: BRAND.red, fontWeight: 600 }}>No Invoice</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {invoices.length > 0 && (
            <>
              <span style={{ fontSize: '14px', color: BRAND.purple, display: 'block', marginTop: '24px', marginBottom: '12px' }}>Recent Invoices</span>
              <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>
                    {['Invoice #', 'Client', 'Billing Month', 'Amount', 'Status', 'Date Paid'].map(h => <th key={h} style={thStyle}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {invoices.slice(0, 20).map((inv, i) => (
                      <tr key={inv.id}>
                        <td style={{ ...tdStyle(i), color: BRAND.purple }}>{inv.invoice_number}</td>
                        <td style={tdStyle(i)}>{inv.clients?.name || '—'}</td>
                        <td style={{ ...tdStyle(i), whiteSpace: 'nowrap' }}>{formatDate(inv.billing_month)}</td>
                        <td style={tdStyle(i)}>{formatCurrency(inv.amount)}</td>
                        <td style={tdStyle(i)}>
                          <span style={{
                            padding: '2px 10px', fontSize: '11px', fontFamily: BRAND.font,
                            background: inv.status === 'paid' ? '#E8F5E8' : inv.status === 'overdue' ? '#FDECEC' : inv.status === 'sent' ? '#E8F4FD' : BRAND.greyLight,
                            color: inv.status === 'paid' ? BRAND.green : inv.status === 'overdue' ? BRAND.red : inv.status === 'sent' ? BRAND.blue : BRAND.coolGrey,
                          }}>{inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}</span>
                        </td>
                        <td style={tdStyle(i)}>{inv.date_paid ? formatDate(inv.date_paid) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
