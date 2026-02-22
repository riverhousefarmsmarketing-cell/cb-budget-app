import { useState, useEffect, useMemo } from 'react'
import { BRAND } from '../lib/brand'
import { formatCurrency, formatDate } from '../lib/utils'
import { supabase } from '../lib/supabase'
import { PCS_SECTOR_ID, useEmployees } from '../hooks/useData'
import { SectionHeader, LoadingState, StatusBadge, KPICard, ProjectLink, ClientLink } from '../components/SharedUI'

// ============================================================================
// Status maps
// ============================================================================
const pursuitStageMap = {
  identified: { bg: BRAND.greyLight, text: BRAND.coolGrey, label: 'Identified' },
  qualifying: { bg: '#FFF4E5', text: BRAND.amber, label: 'Qualifying' },
  introduced: { bg: '#E8F4FD', text: BRAND.blue, label: 'Introduced' },
  proposal_prep: { bg: '#E8F4FD', text: BRAND.blue, label: 'Proposal Prep' },
  proposal_submitted: { bg: '#E8F4FD', text: BRAND.blue, label: 'Submitted' },
  negotiation: { bg: '#FFF4E5', text: BRAND.amber, label: 'Negotiation' },
  won: { bg: '#E8F5E8', text: BRAND.green, label: 'Won' },
  lost: { bg: '#FDECEC', text: BRAND.red, label: 'Lost' },
  parked: { bg: BRAND.greyLight, text: BRAND.coolGrey, label: 'Parked' },
}

const probMap = {
  committed: { bg: '#E8F5E8', text: BRAND.green, label: 'Committed' },
  high: { bg: '#E8F4FD', text: BRAND.blue, label: 'High' },
  medium: { bg: '#FFF4E5', text: BRAND.amber, label: 'Medium' },
  low: { bg: '#FDECEC', text: BRAND.red, label: 'Low' },
}

const planStatusMap = {
  draft: { bg: BRAND.greyLight, text: BRAND.coolGrey, label: 'Draft' },
  submitted: { bg: '#E8F4FD', text: BRAND.blue, label: 'Submitted' },
  under_review: { bg: '#FFF4E5', text: BRAND.amber, label: 'Under Review' },
  revision_required: { bg: '#FDECEC', text: BRAND.red, label: 'Revision Required' },
  accepted: { bg: '#E8F5E8', text: BRAND.green, label: 'Accepted' },
}

const actionStatusMap = {
  not_started: { bg: BRAND.greyLight, text: BRAND.coolGrey, label: 'Not Started' },
  in_progress: { bg: '#E8F4FD', text: BRAND.blue, label: 'In Progress' },
  completed: { bg: '#E8F5E8', text: BRAND.green, label: 'Completed' },
  at_risk: { bg: '#FDECEC', text: BRAND.red, label: 'At Risk' },
  cancelled: { bg: BRAND.greyLight, text: BRAND.coolGrey, label: 'Cancelled' },
}

const categoryMap = {
  margin: { bg: '#E8F5E8', text: BRAND.green, label: 'Margin' },
  people: { bg: '#E8F4FD', text: BRAND.blue, label: 'People' },
  growth: { bg: '#FFF4E5', text: BRAND.amber, label: 'Growth' },
}

const TABS = [
  { key: 'crosssell', label: 'Cross-Sell Tracker' },
  { key: 'accountplans', label: 'Account Action Plans' },
]

// ============================================================================
// Main Component
// ============================================================================
export default function CrossSellAccountPage() {
  const [tab, setTab] = useState('crosssell')
  const { data: employees } = useEmployees()
  const [crossSells, setCrossSells] = useState([])
  const [plans, setPlans] = useState([])
  const [planActions, setPlanActions] = useState([])
  const [clients, setClients] = useState([])
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [csRes, plRes, paRes, clRes, prRes] = await Promise.all([
      supabase.from('cross_sell_opportunities').select('*').eq('sector_id', PCS_SECTOR_ID).order('created_at', { ascending: false }),
      supabase.from('account_action_plans').select('*').eq('sector_id', PCS_SECTOR_ID).order('plan_year', { ascending: false }),
      supabase.from('account_actions').select('*').eq('sector_id', PCS_SECTOR_ID).order('created_at'),
      supabase.from('clients').select('id, name').eq('sector_id', PCS_SECTOR_ID).order('name'),
      supabase.from('projects').select('id, code, name').eq('sector_id', PCS_SECTOR_ID).order('code'),
    ])
    setCrossSells(csRes.data || [])
    setPlans(plRes.data || [])
    setPlanActions(paRes.data || [])
    setClients(clRes.data || [])
    setProjects(prRes.data || [])
    setLoading(false)
  }

  const clientMap = useMemo(() => {
    const m = {}
    clients.forEach(c => { m[c.id] = c.name })
    return m
  }, [clients])

  const projectMap = useMemo(() => {
    const m = {}
    projects.forEach(p => { m[p.id] = p })
    return m
  }, [projects])

  if (loading) return <LoadingState message="Loading cross-sell and account plans..." />

  const inputStyle = {
    width: '100%', padding: '8px 12px', border: `1px solid ${BRAND.greyBorder}`,
    fontFamily: BRAND.font, fontSize: '14px', color: BRAND.coolGrey, boxSizing: 'border-box',
  }
  const labelStyle = { display: 'block', fontSize: '12px', color: BRAND.coolGrey, marginBottom: '4px' }

  return (
    <div>
      <SectionHeader title="Cross-Sell and Account Plans" subtitle="Track cross-selling opportunities and client account action plans" />

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

      {tab === 'crosssell' && (
        <CrossSellTab crossSells={crossSells} clientMap={clientMap} projectMap={projectMap}
          clients={clients} projects={projects} loadAll={loadAll} inputStyle={inputStyle} labelStyle={labelStyle} />
      )}
      {tab === 'accountplans' && (
        <AccountPlansTab plans={plans} planActions={planActions} clientMap={clientMap} projectMap={projectMap}
          clients={clients} projects={projects} loadAll={loadAll} inputStyle={inputStyle} labelStyle={labelStyle} />
      )}
    </div>
  )
}

// ============================================================================
// CROSS-SELL TAB
// ============================================================================
function CrossSellTab({ crossSells, clientMap, projectMap, clients, projects, loadAll, inputStyle, labelStyle }) {
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [filterStage, setFilterStage] = useState('active')
  const [form, setForm] = useState({
    title: '', client_id: '', source_project_id: '', target_service: '', target_sector: '',
    estimated_value: '', probability: 'medium', assigned_to_name: '', description: '',
  })

  const filtered = useMemo(() => {
    if (filterStage === 'active') return crossSells.filter(cs => !['won', 'lost', 'parked'].includes(cs.pursuit_stage))
    if (filterStage === 'all') return crossSells
    return crossSells.filter(cs => cs.pursuit_stage === filterStage)
  }, [crossSells, filterStage])

  const totalActive = crossSells.filter(cs => !['won', 'lost', 'parked'].includes(cs.pursuit_stage)).length
  const totalValue = crossSells.filter(cs => !['won', 'lost', 'parked'].includes(cs.pursuit_stage))
    .reduce((s, cs) => s + (Number(cs.estimated_value) || 0), 0)
  const weightedValue = crossSells.filter(cs => !['won', 'lost', 'parked'].includes(cs.pursuit_stage))
    .reduce((s, cs) => s + (Number(cs.estimated_value) || 0) * Number(cs.probability_weight), 0)
  const wonCount = crossSells.filter(cs => cs.pursuit_stage === 'won').length

  async function handleAdd(e) {
    e.preventDefault(); setSaving(true)
    const { error } = await supabase.from('cross_sell_opportunities').insert({
      sector_id: PCS_SECTOR_ID, title: form.title, client_id: form.client_id,
      source_project_id: form.source_project_id || null, target_service: form.target_service,
      target_sector: form.target_sector, estimated_value: form.estimated_value ? parseFloat(form.estimated_value) : null,
      probability: form.probability, assigned_to_name: form.assigned_to_name || null,
      description: form.description || null,
    })
    if (!error) {
      setForm({ title: '', client_id: '', source_project_id: '', target_service: '', target_sector: '',
        estimated_value: '', probability: 'medium', assigned_to_name: '', description: '' })
      setShowForm(false); loadAll()
    }
    setSaving(false)
  }

  async function updateStage(id, newStage) {
    const updates = { pursuit_stage: newStage }
    if (newStage === 'won') updates.won_date = new Date().toISOString().slice(0, 10)
    await supabase.from('cross_sell_opportunities').update(updates).eq('id', id)
    loadAll()
  }

  const selectStyle = {
    padding: '6px 10px', border: `1px solid ${BRAND.greyBorder}`,
    fontFamily: BRAND.font, fontSize: '13px', color: BRAND.coolGrey, background: BRAND.white,
  }

  return (
    <div>
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        <KPICard label="Active Opportunities" value={totalActive} />
        <KPICard label="Total Pipeline" value={formatCurrency(totalValue)} color={BRAND.teal} />
        <KPICard label="Weighted Value" value={formatCurrency(weightedValue)} color={BRAND.purple} />
        <KPICard label="Won" value={wonCount} color={BRAND.green} />
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div>
            <label style={{ fontSize: '12px', color: BRAND.coolGrey, display: 'block', marginBottom: '4px' }}>Stage</label>
            <select value={filterStage} onChange={e => setFilterStage(e.target.value)} style={selectStyle}>
              <option value="active">Active</option>
              <option value="all">All</option>
              <option value="won">Won</option>
              <option value="lost">Lost</option>
              <option value="parked">Parked</option>
            </select>
          </div>
          <span style={{ fontSize: '12px', color: BRAND.coolGrey, alignSelf: 'flex-end' }}>
            Showing {filtered.length} of {crossSells.length}
          </span>
        </div>
        <button onClick={() => setShowForm(!showForm)} style={{
          padding: '8px 20px', background: BRAND.purple, color: BRAND.white,
          border: 'none', cursor: 'pointer', fontFamily: BRAND.font, fontSize: '13px',
        }}>{showForm ? 'Cancel' : 'Add Opportunity'}</button>
      </div>

      {/* Add form */}
      {showForm && (
        <form onSubmit={handleAdd} style={{ background: BRAND.purpleLight, border: `1px solid ${BRAND.greyBorder}`, padding: '20px', marginBottom: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div><label style={labelStyle}>Title</label><input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required style={inputStyle} placeholder="e.g. Cost Management for TI Davis" /></div>
            <div><label style={labelStyle}>Client</label>
              <select value={form.client_id} onChange={e => setForm({ ...form, client_id: e.target.value })} required style={inputStyle}>
                <option value="">Select client...</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div><label style={labelStyle}>Source Project</label>
              <select value={form.source_project_id} onChange={e => setForm({ ...form, source_project_id: e.target.value })} style={inputStyle}>
                <option value="">None</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
              </select>
            </div>
            <div><label style={labelStyle}>Target Service</label><input value={form.target_service} onChange={e => setForm({ ...form, target_service: e.target.value })} required style={inputStyle} placeholder="e.g. Project Controls" /></div>
            <div><label style={labelStyle}>Target Sector</label><input value={form.target_sector} onChange={e => setForm({ ...form, target_sector: e.target.value })} required style={inputStyle} placeholder="e.g. Infrastructure" /></div>
            <div><label style={labelStyle}>Estimated Value</label><input type="number" step="0.01" value={form.estimated_value} onChange={e => setForm({ ...form, estimated_value: e.target.value })} style={inputStyle} /></div>
            <div><label style={labelStyle}>Probability</label>
              <select value={form.probability} onChange={e => setForm({ ...form, probability: e.target.value })} style={inputStyle}>
                <option value="committed">Committed (100%)</option><option value="high">High (75%)</option>
                <option value="medium">Medium (50%)</option><option value="low">Low (25%)</option>
              </select>
            </div>
            <div><label style={labelStyle}>Assigned To</label><input value={form.assigned_to_name} onChange={e => setForm({ ...form, assigned_to_name: e.target.value })} style={inputStyle} /></div>
            <div><label style={labelStyle}>Description</label><input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} style={inputStyle} /></div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" onClick={() => setShowForm(false)} style={{ padding: '8px 20px', background: BRAND.white, color: BRAND.coolGrey, border: `1px solid ${BRAND.greyBorder}`, cursor: 'pointer', fontFamily: BRAND.font, fontSize: '13px' }}>Cancel</button>
            <button type="submit" disabled={saving} style={{ padding: '8px 20px', background: BRAND.purple, color: BRAND.white, border: 'none', cursor: 'pointer', fontFamily: BRAND.font, fontSize: '13px' }}>{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </form>
      )}

      {/* Table */}
      <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr>
              {['Title', 'Client', 'Source Project', 'Target Service', 'Target Sector', 'Value', 'Probability', 'Stage', 'Owner', 'Identified'].map(h => (
                <th key={h} style={{ background: BRAND.purple, color: BRAND.white, padding: '10px 14px', textAlign: 'left', fontWeight: 400, whiteSpace: 'nowrap', letterSpacing: '0.01em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={10} style={{ padding: '40px 24px', color: BRAND.coolGrey }}>No cross-sell opportunities match the current filter.</td></tr>
            ) : (
              filtered.map((cs, i) => {
                const proj = projectMap[cs.source_project_id]
                return (
                  <tr key={cs.id} style={{ background: i % 2 === 0 ? BRAND.white : BRAND.greyLight }}>
                    <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, color: BRAND.coolGrey }}>
                      {cs.title}
                      {cs.description && <div style={{ fontSize: '11px', opacity: 0.7, marginTop: '2px' }}>{cs.description.length > 80 ? cs.description.slice(0, 80) + '...' : cs.description}</div>}
                    </td>
                    <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}` }}>
                      <ClientLink id={cs.client_id}>{clientMap[cs.client_id] || '—'}</ClientLink>
                    </td>
                    <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, whiteSpace: 'nowrap' }}>
                      {proj ? <ProjectLink id={proj.id}>{proj.code}</ProjectLink> : '—'}
                    </td>
                    <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, color: BRAND.coolGrey }}>{cs.target_service}</td>
                    <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, color: BRAND.coolGrey }}>{cs.target_sector}</td>
                    <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, color: BRAND.teal, whiteSpace: 'nowrap' }}>
                      {cs.estimated_value ? formatCurrency(cs.estimated_value) : '—'}
                    </td>
                    <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}` }}>
                      <StatusBadge status={cs.probability} map={probMap} />
                    </td>
                    <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}` }}>
                      <select value={cs.pursuit_stage} onChange={e => updateStage(cs.id, e.target.value)} style={{
                        padding: '3px 8px', border: `1px solid ${BRAND.greyBorder}`, fontFamily: BRAND.font,
                        fontSize: '12px', color: BRAND.coolGrey, background: BRAND.white, cursor: 'pointer',
                      }}>
                        <option value="identified">Identified</option><option value="qualifying">Qualifying</option>
                        <option value="introduced">Introduced</option><option value="proposal_prep">Proposal Prep</option>
                        <option value="proposal_submitted">Submitted</option><option value="negotiation">Negotiation</option>
                        <option value="won">Won</option><option value="lost">Lost</option><option value="parked">Parked</option>
                      </select>
                    </td>
                    <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, color: BRAND.coolGrey, whiteSpace: 'nowrap' }}>{cs.assigned_to_name || '—'}</td>
                    <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, color: BRAND.coolGrey, whiteSpace: 'nowrap', fontSize: '12px' }}>{formatDate(cs.identified_date)}</td>
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
// ACCOUNT ACTION PLANS TAB
// ============================================================================
function AccountPlansTab({ plans, planActions, clientMap, projectMap, clients, projects, loadAll, inputStyle, labelStyle }) {
  const [selectedPlan, setSelectedPlan] = useState(null)
  const [showPlanForm, setShowPlanForm] = useState(false)
  const [showActionForm, setShowActionForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [planForm, setPlanForm] = useState({ client_id: '', account_lead_name: '', sector_lead_name: '', plan_year: 2026 })
  const [actionForm, setActionForm] = useState({ category: 'margin', action_description: '', success_criteria: '', cb_tool_used: '', owner_name: '', deadline: '', project_id: '' })

  // Plan-level stats
  const planCount = plans.length
  const acceptedCount = plans.filter(p => p.status === 'accepted').length
  const totalActions = planActions.length
  const completedActions = planActions.filter(a => a.status === 'completed').length

  async function handleAddPlan(e) {
    e.preventDefault(); setSaving(true)
    const { error } = await supabase.from('account_action_plans').insert({
      sector_id: PCS_SECTOR_ID, client_id: planForm.client_id,
      account_lead_name: planForm.account_lead_name,
      sector_lead_name: planForm.sector_lead_name || null,
      plan_year: planForm.plan_year,
    })
    if (!error) {
      setPlanForm({ client_id: '', account_lead_name: '', sector_lead_name: '', plan_year: 2026 })
      setShowPlanForm(false); loadAll()
    }
    setSaving(false)
  }

  async function handleAddAction(e) {
    e.preventDefault(); setSaving(true)
    const { error } = await supabase.from('account_actions').insert({
      plan_id: selectedPlan, sector_id: PCS_SECTOR_ID,
      category: actionForm.category, action_description: actionForm.action_description,
      success_criteria: actionForm.success_criteria || null,
      cb_tool_used: actionForm.cb_tool_used || null,
      owner_name: actionForm.owner_name, deadline: actionForm.deadline,
      project_id: actionForm.project_id || null,
    })
    if (!error) {
      setActionForm({ category: 'margin', action_description: '', success_criteria: '', cb_tool_used: '', owner_name: '', deadline: '', project_id: '' })
      setShowActionForm(false); loadAll()
    }
    setSaving(false)
  }

  async function updateActionStatus(actionId, newStatus) {
    await supabase.from('account_actions').update({ status: newStatus }).eq('id', actionId)
    loadAll()
  }

  async function updatePlanStatus(planId, newStatus) {
    await supabase.from('account_action_plans').update({ status: newStatus }).eq('id', planId)
    loadAll()
  }

  // If a plan is selected, show its detail view
  if (selectedPlan) {
    const plan = plans.find(p => p.id === selectedPlan)
    if (!plan) { setSelectedPlan(null); return null }
    const actions = planActions.filter(a => a.plan_id === selectedPlan)
    const marginActions = actions.filter(a => a.category === 'margin')
    const peopleActions = actions.filter(a => a.category === 'people')
    const growthActions = actions.filter(a => a.category === 'growth')

    return (
      <div>
        <button onClick={() => setSelectedPlan(null)} style={{
          background: 'none', border: 'none', color: BRAND.purple, cursor: 'pointer',
          fontFamily: BRAND.font, fontSize: '13px', padding: 0, marginBottom: '16px',
        }}>Back to all plans</button>

        <SectionHeader
          title={`${clientMap[plan.client_id] || 'Client'} — ${plan.plan_year} Account Plan`}
          subtitle={`Lead: ${plan.account_lead_name}${plan.sector_lead_name ? ` | Sector Lead: ${plan.sector_lead_name}` : ''}`}
        />

        {/* Plan status + controls */}
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap' }}>
          <div>
            <label style={{ fontSize: '12px', color: BRAND.coolGrey, display: 'block', marginBottom: '4px' }}>Plan Status</label>
            <select value={plan.status} onChange={e => updatePlanStatus(plan.id, e.target.value)} style={{
              padding: '6px 10px', border: `1px solid ${BRAND.greyBorder}`, fontFamily: BRAND.font,
              fontSize: '13px', color: BRAND.coolGrey, background: BRAND.white,
            }}>
              <option value="draft">Draft</option><option value="submitted">Submitted</option>
              <option value="under_review">Under Review</option><option value="revision_required">Revision Required</option>
              <option value="accepted">Accepted</option>
            </select>
          </div>
          <StatusBadge status={plan.status} map={planStatusMap} />
          {plan.date_submitted && <span style={{ fontSize: '12px', color: BRAND.coolGrey }}>Submitted: {formatDate(plan.date_submitted)}</span>}
        </div>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', marginBottom: '24px' }}>
          <KPICard label="Total Actions" value={actions.length} />
          <KPICard label="Margin" value={marginActions.length} color={BRAND.green} />
          <KPICard label="People" value={peopleActions.length} color={BRAND.blue} />
          <KPICard label="Growth" value={growthActions.length} color={BRAND.amber} />
          <KPICard label="Completed" value={actions.filter(a => a.status === 'completed').length} color={BRAND.green}
            subValue={actions.length > 0 ? `${Math.round((actions.filter(a => a.status === 'completed').length / actions.length) * 100)}%` : '—'} />
        </div>

        {/* Add action button */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
          <button onClick={() => setShowActionForm(!showActionForm)} style={{
            padding: '8px 20px', background: BRAND.purple, color: BRAND.white,
            border: 'none', cursor: 'pointer', fontFamily: BRAND.font, fontSize: '13px',
          }}>{showActionForm ? 'Cancel' : 'Add Action'}</button>
        </div>

        {showActionForm && (
          <form onSubmit={handleAddAction} style={{ background: BRAND.purpleLight, border: `1px solid ${BRAND.greyBorder}`, padding: '20px', marginBottom: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <div><label style={labelStyle}>Category</label>
                <select value={actionForm.category} onChange={e => setActionForm({ ...actionForm, category: e.target.value })} style={inputStyle}>
                  <option value="margin">Margin</option><option value="people">People</option><option value="growth">Growth</option>
                </select>
              </div>
              <div><label style={labelStyle}>Action Description</label><input value={actionForm.action_description} onChange={e => setActionForm({ ...actionForm, action_description: e.target.value })} required style={inputStyle} /></div>
              <div><label style={labelStyle}>Success Criteria</label><input value={actionForm.success_criteria} onChange={e => setActionForm({ ...actionForm, success_criteria: e.target.value })} style={inputStyle} /></div>
              <div><label style={labelStyle}>CB Tool</label><input value={actionForm.cb_tool_used} onChange={e => setActionForm({ ...actionForm, cb_tool_used: e.target.value })} style={inputStyle} placeholder="PEP, QA Plan, GNG, RAM..." /></div>
              <div><label style={labelStyle}>Owner</label><select value={actionForm.owner_name} onChange={e => setActionForm({ ...actionForm, owner_name: e.target.value })} required style={inputStyle}><option value="">Select...</option>{(employees || []).map(e => <option key={e.id} value={e.name}>{e.name}</option>)}</select></div>
              <div><label style={labelStyle}>Deadline</label><input value={actionForm.deadline} onChange={e => setActionForm({ ...actionForm, deadline: e.target.value })} required style={inputStyle} placeholder="Q2 2026 or 2026-06-30" /></div>
              <div><label style={labelStyle}>Linked Project</label>
                <select value={actionForm.project_id} onChange={e => setActionForm({ ...actionForm, project_id: e.target.value })} style={inputStyle}>
                  <option value="">None</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="button" onClick={() => setShowActionForm(false)} style={{ padding: '8px 20px', background: BRAND.white, color: BRAND.coolGrey, border: `1px solid ${BRAND.greyBorder}`, cursor: 'pointer', fontFamily: BRAND.font, fontSize: '13px' }}>Cancel</button>
              <button type="submit" disabled={saving} style={{ padding: '8px 20px', background: BRAND.purple, color: BRAND.white, border: 'none', cursor: 'pointer', fontFamily: BRAND.font, fontSize: '13px' }}>{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </form>
        )}

        {/* Actions grouped by pillar */}
        {[{ key: 'margin', label: 'Margin', items: marginActions, color: BRAND.green },
          { key: 'people', label: 'People', items: peopleActions, color: BRAND.blue },
          { key: 'growth', label: 'Growth', items: growthActions, color: BRAND.amber },
        ].map(pillar => (
          <div key={pillar.key} style={{ marginBottom: '24px' }}>
            <div style={{ fontSize: '14px', color: pillar.color, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '4px', height: '20px', background: pillar.color }} />
              {pillar.label} ({pillar.items.length})
            </div>
            {pillar.items.length === 0 ? (
              <div style={{ padding: '20px 24px', color: BRAND.coolGrey, fontSize: '13px', background: BRAND.white, border: `1px solid ${BRAND.greyBorder}` }}>
                No {pillar.label.toLowerCase()} actions yet.
              </div>
            ) : (
              <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr>
                      {['Action', 'Success Criteria', 'CB Tool', 'Owner', 'Deadline', 'Project', 'Status'].map(h => (
                        <th key={h} style={{ background: BRAND.purple, color: BRAND.white, padding: '10px 14px', textAlign: 'left', fontWeight: 400, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pillar.items.map((a, i) => {
                      const proj = projectMap[a.project_id]
                      return (
                        <tr key={a.id} style={{ background: i % 2 === 0 ? BRAND.white : BRAND.greyLight }}>
                          <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, color: BRAND.coolGrey, maxWidth: '280px' }}>{a.action_description}</td>
                          <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, color: BRAND.coolGrey, fontSize: '12px' }}>{a.success_criteria || '—'}</td>
                          <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, color: BRAND.coolGrey, fontSize: '12px', whiteSpace: 'nowrap' }}>{a.cb_tool_used || '—'}</td>
                          <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, color: BRAND.coolGrey, whiteSpace: 'nowrap' }}>{a.owner_name}</td>
                          <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, color: BRAND.coolGrey, whiteSpace: 'nowrap', fontSize: '12px' }}>{a.deadline}</td>
                          <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, whiteSpace: 'nowrap' }}>
                            {proj ? <ProjectLink id={proj.id}>{proj.code}</ProjectLink> : '—'}
                          </td>
                          <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}` }}>
                            <select value={a.status} onChange={e => updateActionStatus(a.id, e.target.value)} style={{
                              padding: '3px 8px', border: `1px solid ${BRAND.greyBorder}`, fontFamily: BRAND.font,
                              fontSize: '12px', color: BRAND.coolGrey, background: BRAND.white, cursor: 'pointer',
                            }}>
                              <option value="not_started">Not Started</option><option value="in_progress">In Progress</option>
                              <option value="completed">Completed</option><option value="at_risk">At Risk</option>
                              <option value="cancelled">Cancelled</option>
                            </select>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>
    )
  }

  // Plans list view
  return (
    <div>
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        <KPICard label="Account Plans" value={planCount} />
        <KPICard label="Accepted" value={acceptedCount} color={BRAND.green} />
        <KPICard label="Total Actions" value={totalActions} />
        <KPICard label="Completed Actions" value={completedActions} color={BRAND.green}
          subValue={totalActions > 0 ? `${Math.round((completedActions / totalActions) * 100)}%` : '—'} />
      </div>

      {/* Add plan */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
        <button onClick={() => setShowPlanForm(!showPlanForm)} style={{
          padding: '8px 20px', background: BRAND.purple, color: BRAND.white,
          border: 'none', cursor: 'pointer', fontFamily: BRAND.font, fontSize: '13px',
        }}>{showPlanForm ? 'Cancel' : 'Create Account Plan'}</button>
      </div>

      {showPlanForm && (
        <form onSubmit={handleAddPlan} style={{ background: BRAND.purpleLight, border: `1px solid ${BRAND.greyBorder}`, padding: '20px', marginBottom: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div><label style={labelStyle}>Client</label>
              <select value={planForm.client_id} onChange={e => setPlanForm({ ...planForm, client_id: e.target.value })} required style={inputStyle}>
                <option value="">Select client...</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div><label style={labelStyle}>Account Lead</label><select value={planForm.account_lead_name} onChange={e => setPlanForm({ ...planForm, account_lead_name: e.target.value })} required style={inputStyle}><option value="">Select...</option>{(employees || []).map(e => <option key={e.id} value={e.name}>{e.name}</option>)}</select></div>
            <div><label style={labelStyle}>Sector Lead</label><select value={planForm.sector_lead_name} onChange={e => setPlanForm({ ...planForm, sector_lead_name: e.target.value })} style={inputStyle}><option value="">Select...</option>{(employees || []).map(e => <option key={e.id} value={e.name}>{e.name}</option>)}</select></div>
            <div><label style={labelStyle}>Plan Year</label><input type="number" value={planForm.plan_year} onChange={e => setPlanForm({ ...planForm, plan_year: parseInt(e.target.value) })} required style={inputStyle} /></div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" onClick={() => setShowPlanForm(false)} style={{ padding: '8px 20px', background: BRAND.white, color: BRAND.coolGrey, border: `1px solid ${BRAND.greyBorder}`, cursor: 'pointer', fontFamily: BRAND.font, fontSize: '13px' }}>Cancel</button>
            <button type="submit" disabled={saving} style={{ padding: '8px 20px', background: BRAND.purple, color: BRAND.white, border: 'none', cursor: 'pointer', fontFamily: BRAND.font, fontSize: '13px' }}>{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </form>
      )}

      {/* Plans table */}
      <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr>
              {['Client', 'Year', 'Account Lead', 'Sector Lead', 'Status', 'Actions', 'Completed', 'Progress'].map(h => (
                <th key={h} style={{ background: BRAND.purple, color: BRAND.white, padding: '10px 14px', textAlign: 'left', fontWeight: 400, whiteSpace: 'nowrap', letterSpacing: '0.01em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {plans.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: '40px 24px', color: BRAND.coolGrey }}>No account action plans created yet.</td></tr>
            ) : (
              plans.map((p, i) => {
                const actions = planActions.filter(a => a.plan_id === p.id)
                const completed = actions.filter(a => a.status === 'completed').length
                const pct = actions.length > 0 ? Math.round((completed / actions.length) * 100) : 0
                return (
                  <tr key={p.id} style={{ background: i % 2 === 0 ? BRAND.white : BRAND.greyLight, cursor: 'pointer' }}
                    onClick={() => setSelectedPlan(p.id)}>
                    <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, color: BRAND.purple, textDecoration: 'underline', textDecorationColor: 'rgba(74,21,75,0.3)' }}>
                      {clientMap[p.client_id] || '—'}
                    </td>
                    <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, color: BRAND.coolGrey }}>{p.plan_year}</td>
                    <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, color: BRAND.coolGrey }}>{p.account_lead_name}</td>
                    <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, color: BRAND.coolGrey }}>{p.sector_lead_name || '—'}</td>
                    <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}` }}><StatusBadge status={p.status} map={planStatusMap} /></td>
                    <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, color: BRAND.coolGrey }}>{actions.length}</td>
                    <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, color: BRAND.green }}>{completed}</td>
                    <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ flex: 1, height: '6px', background: BRAND.greyLight }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: BRAND.green }} />
                        </div>
                        <span style={{ fontSize: '11px', color: BRAND.coolGrey, whiteSpace: 'nowrap' }}>{pct}%</span>
                      </div>
                    </td>
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
