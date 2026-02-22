import { useState, useEffect, useMemo } from 'react'
import { BRAND } from '../lib/brand'
import { formatDate } from '../lib/utils'
import { supabase } from '../lib/supabase'
import { PCS_SECTOR_ID, useEmployees } from '../hooks/useData'
import { SectionHeader, LoadingState, KPICard, StatusBadge, ClientLink } from '../components/SharedUI'
import QualityPlanSection from '../components/QualityPlanSection'

// ============================================================================
// QUALITY DASHBOARD — Sector-level compliance roll-up
// ============================================================================
const TABS = [
  { key: 'dashboard', label: 'Compliance Dashboard' },
  { key: 'sector', label: 'Sector Quality Items' },
]

export default function QualityDashboardPage() {
  const [tab, setTab] = useState('dashboard')
  const { data: employees } = useEmployees()
  const [dashboardData, setDashboardData] = useState([])
  const [sectorSummary, setSectorSummary] = useState(null)
  const [allItems, setAllItems] = useState([])
  const [sectorItems, setSectorItems] = useState([])
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [dashRes, summRes, itemsRes, sectorItemsRes, clRes] = await Promise.all([
      supabase.from('v_quality_dashboard').select('*').eq('sector_id', PCS_SECTOR_ID),
      supabase.from('v_quality_sector_summary').select('*').eq('sector_id', PCS_SECTOR_ID).maybeSingle(),
      supabase.from('quality_plan_items').select('*').eq('sector_id', PCS_SECTOR_ID).order('sort_order'),
      supabase.from('quality_plan_items').select('*').eq('sector_id', PCS_SECTOR_ID).is('client_id', null).order('sort_order'),
      supabase.from('clients').select('id, name').eq('sector_id', PCS_SECTOR_ID).order('name'),
    ])
    setDashboardData(dashRes.data || [])
    setSectorSummary(summRes.data)
    setAllItems(itemsRes.data || [])
    setSectorItems(sectorItemsRes.data || [])
    setClients(clRes.data || [])
    setLoading(false)
  }

  if (loading) return <LoadingState message="Loading quality dashboard..." />

  const totalItems = sectorSummary?.total_items || 0
  const compliancePct = sectorSummary?.compliance_pct || 0
  const nonCompliant = sectorSummary?.non_compliant_count || 0
  const openCorrective = sectorSummary?.open_corrective_actions || 0
  const overdueAudits = sectorSummary?.overdue_audits || 0
  const sectorTemplates = sectorSummary?.sector_template_count || 0

  return (
    <div>
      <SectionHeader title="Quality Management" subtitle="Sector compliance dashboard and quality plan oversight" />

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0', borderBottom: `2px solid ${BRAND.greyBorder}`, marginBottom: '24px' }}>
        {TABS.map(t => {
          const isActive = tab === t.key
          return (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              padding: '10px 24px', background: isActive ? BRAND.purple : 'transparent',
              color: isActive ? BRAND.white : BRAND.coolGrey,
              border: 'none', cursor: 'pointer', fontFamily: BRAND.font, fontSize: '13px',
              borderBottom: isActive ? `2px solid ${BRAND.purple}` : '2px solid transparent',
              marginBottom: '-2px',
            }}>{t.label}</button>
          )
        })}
      </div>

      {tab === 'dashboard' && (
        <DashboardTab
          dashboardData={dashboardData} totalItems={totalItems}
          compliancePct={compliancePct} nonCompliant={nonCompliant}
          openCorrective={openCorrective} overdueAudits={overdueAudits}
          sectorTemplates={sectorTemplates}
        />
      )}
      {tab === 'sector' && (
        <SectorItemsTab sectorItems={sectorItems} allItems={allItems} clients={clients} onReload={loadAll} />
      )}
    </div>
  )
}

// ============================================================================
// DASHBOARD TAB — Compliance % per client
// ============================================================================
function DashboardTab({ dashboardData, totalItems, compliancePct, nonCompliant, openCorrective, overdueAudits, sectorTemplates }) {

  return (
    <div>
      {/* Sector KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        <KPICard label="Total Quality Items" value={totalItems} />
        <KPICard label="Sector Compliance" value={`${compliancePct}%`}
          color={compliancePct >= 80 ? BRAND.green : compliancePct >= 50 ? BRAND.amber : BRAND.red} />
        <KPICard label="Non-Compliant" value={nonCompliant} color={nonCompliant > 0 ? BRAND.red : BRAND.green} />
        <KPICard label="Open Corrective" value={openCorrective} color={openCorrective > 0 ? BRAND.red : BRAND.green} />
        <KPICard label="Overdue Audits" value={overdueAudits} color={overdueAudits > 0 ? BRAND.red : BRAND.green} />
        <KPICard label="Sector Templates" value={sectorTemplates} />
      </div>

      {/* Compliance by client */}
      <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, overflow: 'auto' }}>
        <div style={{ padding: '16px 20px', fontSize: '14px', color: BRAND.purple }}>Compliance by Client</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr>
              {['Client', 'Total Items', 'Compliant', 'Non-Compliant', 'In Progress', 'Not Started', 'Compliance %', 'Open Corrective', 'Overdue Audits'].map(h => (
                <th key={h} style={{ background: BRAND.purple, color: BRAND.white, padding: '10px 14px', textAlign: 'left', fontWeight: 400, whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dashboardData.length === 0 ? (
              <tr><td colSpan={9} style={{ padding: '40px 24px', color: BRAND.coolGrey }}>No quality data yet. Add quality items to client accounts to see compliance tracking here.</td></tr>
            ) : (
              dashboardData.sort((a, b) => Number(a.compliance_pct) - Number(b.compliance_pct)).map((row, i) => {
                const pct = Number(row.compliance_pct)
                const pctColor = pct >= 80 ? BRAND.green : pct >= 50 ? BRAND.amber : BRAND.red
                return (
                  <tr key={row.client_id} style={{ background: i % 2 === 0 ? BRAND.white : BRAND.greyLight }}>
                    <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}` }}>
                      <ClientLink id={row.client_id}>{row.client_name}</ClientLink>
                    </td>
                    <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, color: BRAND.coolGrey }}>{row.total_items}</td>
                    <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, color: BRAND.green }}>{row.compliant_count}</td>
                    <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, color: row.non_compliant_count > 0 ? BRAND.red : BRAND.coolGrey }}>{row.non_compliant_count}</td>
                    <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, color: BRAND.blue }}>{row.in_progress_count}</td>
                    <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, color: BRAND.coolGrey }}>{row.not_started_count}</td>
                    <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ flex: 1, height: '8px', background: BRAND.greyLight, minWidth: '60px' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: pctColor }} />
                        </div>
                        <span style={{ fontSize: '12px', color: pctColor, whiteSpace: 'nowrap' }}>{pct}%</span>
                      </div>
                    </td>
                    <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, color: row.open_corrective_actions > 0 ? BRAND.red : BRAND.coolGrey }}>{row.open_corrective_actions}</td>
                    <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, color: row.overdue_audits > 0 ? BRAND.red : BRAND.coolGrey }}>{row.overdue_audits}</td>
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
// SECTOR ITEMS TAB — Sector-wide quality standards
// ============================================================================
function SectorItemsTab({ sectorItems, allItems, clients, onReload }) {
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ objective: '', category: 'general', owner_name: '' })

  const inputStyle = {
    width: '100%', padding: '8px 12px', border: `1px solid ${BRAND.greyBorder}`,
    fontFamily: BRAND.font, fontSize: '14px', color: BRAND.coolGrey, boxSizing: 'border-box',
  }
  const labelStyle = { display: 'block', fontSize: '12px', color: BRAND.coolGrey, marginBottom: '4px' }

  const categoryMap = {
    general: { bg: BRAND.greyLight, text: BRAND.coolGrey, label: 'General' },
    deliverable: { bg: '#E8F4FD', text: BRAND.blue, label: 'Deliverable' },
    process: { bg: '#FFF4E5', text: BRAND.amber, label: 'Process' },
    compliance: { bg: '#E8F5E8', text: BRAND.green, label: 'Compliance' },
    health_safety: { bg: '#FDECEC', text: BRAND.red, label: 'H&S' },
    environmental: { bg: '#E8F5E8', text: BRAND.green, label: 'Environmental' },
    client_specific: { bg: '#E8F4FD', text: BRAND.blue, label: 'Client Specific' },
  }

  async function handleAdd(e) {
    e.preventDefault(); setSaving(true)
    const { error } = await supabase.from('quality_plan_items').insert({
      sector_id: PCS_SECTOR_ID, client_id: null, project_id: null,
      objective: form.objective, category: form.category,
      owner_name: form.owner_name, is_sector_template: true,
    })
    if (!error) { setForm({ objective: '', category: 'general', owner_name: '' }); setShowForm(false); onReload() }
    setSaving(false)
  }

  return (
    <div>
      <div style={{ fontSize: '13px', color: BRAND.coolGrey, marginBottom: '16px' }}>
        Sector-level quality standards apply across all accounts. These are reference items that set the baseline expectation for quality across PCS.
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <span style={{ fontSize: '14px', color: BRAND.coolGrey }}>{sectorItems.length} sector-level items</span>
        <button onClick={() => setShowForm(!showForm)} style={{
          padding: '8px 20px', background: BRAND.purple, color: BRAND.white,
          border: 'none', cursor: 'pointer', fontFamily: BRAND.font, fontSize: '13px',
        }}>{showForm ? 'Cancel' : 'Add Sector Quality Item'}</button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} style={{ background: BRAND.purpleLight, border: `1px solid ${BRAND.greyBorder}`, padding: '20px', marginBottom: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div><label style={labelStyle}>Quality Objective / Standard</label><input value={form.objective} onChange={e => setForm({ ...form, objective: e.target.value })} required style={inputStyle} placeholder="e.g. PEP must be completed before project mobilisation" /></div>
            <div><label style={labelStyle}>Category</label>
              <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} style={inputStyle}>
                <option value="general">General</option><option value="deliverable">Deliverable</option>
                <option value="process">Process</option><option value="compliance">Compliance</option>
                <option value="health_safety">Health and Safety</option><option value="environmental">Environmental</option>
              </select>
            </div>
            <div><label style={labelStyle}>Owner</label><select value={form.owner_name} onChange={e => setForm({ ...form, owner_name: e.target.value })} required style={inputStyle}><option value="">Select...</option>{(employees || []).map(e => <option key={e.id} value={e.name}>{e.name}</option>)}</select></div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" onClick={() => setShowForm(false)} style={{ padding: '8px 20px', background: BRAND.white, color: BRAND.coolGrey, border: `1px solid ${BRAND.greyBorder}`, cursor: 'pointer', fontFamily: BRAND.font, fontSize: '13px' }}>Cancel</button>
            <button type="submit" disabled={saving} style={{ padding: '8px 20px', background: BRAND.purple, color: BRAND.white, border: 'none', cursor: 'pointer', fontFamily: BRAND.font, fontSize: '13px' }}>{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </form>
      )}

      <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr>
              {['Objective', 'Category', 'Owner', 'Created'].map(h => (
                <th key={h} style={{ background: BRAND.purple, color: BRAND.white, padding: '10px 14px', textAlign: 'left', fontWeight: 400, whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sectorItems.length === 0 ? (
              <tr><td colSpan={4} style={{ padding: '40px 24px', color: BRAND.coolGrey }}>No sector-level quality items defined yet.</td></tr>
            ) : (
              sectorItems.map((item, i) => (
                <tr key={item.id} style={{ background: i % 2 === 0 ? BRAND.white : BRAND.greyLight }}>
                  <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, color: BRAND.coolGrey }}>{item.objective}</td>
                  <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}` }}><StatusBadge status={item.category} map={categoryMap} /></td>
                  <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, color: BRAND.coolGrey }}>{item.owner_name}</td>
                  <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, color: BRAND.coolGrey, fontSize: '12px' }}>{formatDate(item.created_at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
