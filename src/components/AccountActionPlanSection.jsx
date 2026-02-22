import React, { useState, useMemo } from 'react'
import { BRAND } from '../lib/brand'
import { formatDate } from '../lib/utils'
import { supabase } from '../lib/supabase'
import { PCS_SECTOR_ID } from '../hooks/useData'
import { StatusBadge, KPICard, ProjectLink } from './SharedUI'
import { ApprovalBanner, isLocked } from './ApprovalWorkflow'

// ============================================================================
// Status maps
// ============================================================================
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

const midyearStatusMap = {
  not_started: { bg: BRAND.greyLight, text: BRAND.coolGrey, label: 'Not Started' },
  on_track: { bg: '#E8F5E8', text: BRAND.green, label: 'On Track' },
  at_risk: { bg: '#FFF4E5', text: BRAND.amber, label: 'At Risk' },
  behind: { bg: '#FDECEC', text: BRAND.red, label: 'Behind' },
  completed: { bg: '#E8F5E8', text: BRAND.green, label: 'Completed' },
}

const yearendStatusMap = {
  achieved: { bg: '#E8F5E8', text: BRAND.green, label: 'Achieved' },
  partially_achieved: { bg: '#FFF4E5', text: BRAND.amber, label: 'Partially Achieved' },
  not_achieved: { bg: '#FDECEC', text: BRAND.red, label: 'Not Achieved' },
  superseded: { bg: BRAND.greyLight, text: BRAND.coolGrey, label: 'Superseded' },
}

const categoryMap = {
  margin: { bg: '#E8F5E8', text: BRAND.green, label: 'Margin' },
  people: { bg: '#E8F4FD', text: BRAND.blue, label: 'People' },
  growth: { bg: '#FFF4E5', text: BRAND.amber, label: 'Growth' },
}

const PILLAR_COLORS = { margin: BRAND.green, people: BRAND.blue, growth: BRAND.amber }

// Rubric dimensions for review scoring
const RUBRIC_DIMENSIONS = [
  { key: 'category_coverage', label: 'Category Coverage', desc: 'Actions cover all three pillars (Margin, People, Growth)' },
  { key: 'specificity', label: 'Specificity', desc: 'Actions have measurable targets, not vague aspirations' },
  { key: 'strategic_depth', label: 'Strategic Depth', desc: 'Actions address root causes and long-term positioning' },
  { key: 'cb_tools', label: 'CB Tools', desc: 'Actions reference appropriate C&B tools (PEP, QA Plan, GNG, RAM, etc.)' },
  { key: 'accountability', label: 'Accountability', desc: 'Each action has a named owner and deadline' },
]

const RUBRIC_RATINGS = ['strong', 'adequate', 'weak']
const RUBRIC_RATING_STYLES = {
  strong: { bg: '#E8F5E8', text: BRAND.green },
  adequate: { bg: '#FFF4E5', text: BRAND.amber },
  weak: { bg: '#FDECEC', text: BRAND.red },
}

// Plan status workflow — which transitions are allowed
const PLAN_STATUS_FLOW = {
  draft: ['submitted'],
  submitted: ['under_review', 'draft'],
  under_review: ['accepted', 'revision_required'],
  revision_required: ['submitted'],
  accepted: [],
}

const TRANSITION_LABELS = {
  draft: 'Return to Draft',
  submitted: 'Submit',
  under_review: 'Begin Review',
  revision_required: 'Request Revision',
  accepted: 'Accept',
}

// ============================================================================
// Reusable inline styles
// ============================================================================
const inputStyle = {
  width: '100%', padding: '8px 12px', border: `1px solid ${BRAND.greyBorder}`,
  fontFamily: BRAND.font, fontSize: '14px', color: BRAND.coolGrey, boxSizing: 'border-box',
}
const labelStyle = { display: 'block', fontSize: '12px', color: BRAND.coolGrey, marginBottom: '4px' }
const textareaStyle = { ...inputStyle, minHeight: '72px', resize: 'vertical' }
const thStyle = { background: BRAND.purple, color: BRAND.white, padding: '10px 14px', textAlign: 'left', fontWeight: 400, whiteSpace: 'nowrap' }
const tdBase = { padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, color: BRAND.coolGrey }

// ============================================================================
// RubricSelector — three-option strong/adequate/weak button group
// ============================================================================
function RubricSelector({ value, onChange, disabled }) {
  return (
    <div style={{ display: 'flex', gap: 0 }}>
      {RUBRIC_RATINGS.map((r, idx) => {
        const active = value === r
        const colors = RUBRIC_RATING_STYLES[r]
        return (
          <button key={r} type="button" disabled={disabled}
            onClick={() => onChange(active ? null : r)}
            style={{
              padding: '5px 14px', fontFamily: BRAND.font, fontSize: '12px', cursor: disabled ? 'default' : 'pointer',
              border: `1px solid ${active ? colors.text : BRAND.greyBorder}`,
              background: active ? colors.bg : BRAND.white,
              color: active ? colors.text : BRAND.coolGrey,
              fontWeight: active ? 600 : 400,
              borderRight: idx < RUBRIC_RATINGS.length - 1 ? 'none' : undefined,
              opacity: disabled ? 0.6 : 1,
            }}>
            {r.charAt(0).toUpperCase() + r.slice(1)}
          </button>
        )
      })}
    </div>
  )
}

// ============================================================================
// OverallRating — colored display of a rubric rating value
// ============================================================================
function OverallRating({ value }) {
  if (!value) return <span style={{ fontSize: '13px', color: BRAND.coolGrey }}>Not rated</span>
  const colors = RUBRIC_RATING_STYLES[value]
  return (
    <span style={{
      display: 'inline-block', padding: '4px 14px', fontSize: '13px', fontWeight: 600,
      background: colors.bg, color: colors.text, fontFamily: BRAND.font,
    }}>
      {value.charAt(0).toUpperCase() + value.slice(1)}
    </span>
  )
}

// ============================================================================
// Review Scoring Panel — sub-component for mid-year / year-end scoring
// ============================================================================
function ReviewScoringPanel({ plan, onSave, saving }) {
  const buildScores = (period) => {
    const scores = {}
    RUBRIC_DIMENSIONS.forEach(d => { scores[d.key] = plan[`${period}_${d.key}`] || null })
    scores.overall = plan[`${period}_overall`] || null
    scores.feedback = plan[`${period}_feedback`] || ''
    scores.review_date = plan[`${period}_review_date`] || ''
    return scores
  }

  const [midyearScores, setMidyearScores] = useState(() => buildScores('midyear'))
  const [yearendScores, setYearendScores] = useState(() => buildScores('yearend'))
  const [editingPeriod, setEditingPeriod] = useState(null)

  function handleSave(period) {
    const scores = period === 'midyear' ? midyearScores : yearendScores
    onSave(plan.id, period, scores)
    setEditingPeriod(null)
  }

  function countRated(scores) {
    return RUBRIC_DIMENSIONS.filter(d => scores[d.key]).length
  }

  function renderPanel(period, label, scores, setScores) {
    const isEditing = editingPeriod === period
    const rated = countRated(scores)
    const hasReview = scores.review_date || rated > 0

    return (
      <div style={{ border: `1px solid ${BRAND.greyBorder}`, background: BRAND.white, marginBottom: '24px' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: `1px solid ${BRAND.greyBorder}`, background: BRAND.greyLight }}>
          <div>
            <div style={{ fontSize: '15px', color: BRAND.purple, fontWeight: 600 }}>{label}</div>
            {scores.review_date && (
              <div style={{ fontSize: '12px', color: BRAND.coolGrey, marginTop: '2px' }}>Reviewed: {formatDate(scores.review_date)}</div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {hasReview && <OverallRating value={scores.overall} />}
            <button onClick={() => setEditingPeriod(isEditing ? null : period)} style={{
              padding: '6px 16px', border: `1px solid ${BRAND.greyBorder}`, background: isEditing ? BRAND.purple : BRAND.white,
              color: isEditing ? BRAND.white : BRAND.purple, fontFamily: BRAND.font, fontSize: '12px', cursor: 'pointer',
            }}>{isEditing ? 'Cancel' : hasReview ? 'Edit Scores' : 'Score Now'}</button>
          </div>
        </div>

        <div style={{ padding: '20px' }}>
          {/* Read-only summary */}
          {!isEditing && hasReview && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: scores.feedback ? '16px' : 0 }}>
              {RUBRIC_DIMENSIONS.map(d => (
                <div key={d.key} style={{ border: `1px solid ${BRAND.greyBorder}`, padding: '12px' }}>
                  <div style={{ fontSize: '11px', color: BRAND.coolGrey, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{d.label}</div>
                  {scores[d.key] ? <OverallRating value={scores[d.key]} /> : <span style={{ fontSize: '12px', color: BRAND.coolGrey }}>Not rated</span>}
                </div>
              ))}
            </div>
          )}

          {/* No review placeholder */}
          {!isEditing && !hasReview && (
            <div style={{ padding: '20px', color: BRAND.coolGrey, fontSize: '13px' }}>
              No {label.toLowerCase()} has been completed yet. Click "Score Now" to begin.
            </div>
          )}

          {/* Editing mode */}
          {isEditing && (
            <div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', marginBottom: '16px' }}>
                <thead><tr>
                  <th style={{ ...thStyle, width: '180px' }}>Dimension</th>
                  <th style={thStyle}>Description</th>
                  <th style={{ ...thStyle, width: '240px' }}>Rating</th>
                </tr></thead>
                <tbody>
                  {RUBRIC_DIMENSIONS.map((d, i) => (
                    <tr key={d.key} style={{ background: i % 2 === 0 ? BRAND.white : BRAND.greyLight }}>
                      <td style={{ padding: '12px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, color: BRAND.purple, fontWeight: 600, fontSize: '13px' }}>{d.label}</td>
                      <td style={{ padding: '12px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, color: BRAND.coolGrey, fontSize: '12px' }}>{d.desc}</td>
                      <td style={{ padding: '12px 14px', borderBottom: `1px solid ${BRAND.greyBorder}` }}>
                        <RubricSelector value={scores[d.key]} onChange={v => setScores({ ...scores, [d.key]: v })} />
                      </td>
                    </tr>
                  ))}
                  {/* Overall row */}
                  <tr style={{ background: RUBRIC_DIMENSIONS.length % 2 === 0 ? BRAND.white : BRAND.greyLight }}>
                    <td style={{ padding: '12px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, color: BRAND.purple, fontWeight: 600, fontSize: '14px' }}>Overall</td>
                    <td style={{ padding: '12px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, color: BRAND.coolGrey, fontSize: '12px' }}>Holistic assessment considering all dimensions</td>
                    <td style={{ padding: '12px 14px', borderBottom: `1px solid ${BRAND.greyBorder}` }}>
                      <RubricSelector value={scores.overall} onChange={v => setScores({ ...scores, overall: v })} />
                    </td>
                  </tr>
                </tbody>
              </table>

              <div style={{ marginBottom: '16px' }}>
                <label style={labelStyle}>Feedback / Comments</label>
                <textarea value={scores.feedback || ''} onChange={e => setScores({ ...scores, feedback: e.target.value })} style={textareaStyle} placeholder={`Written feedback for the ${label.toLowerCase()}...`} />
              </div>
              <div style={{ marginBottom: '16px', maxWidth: '240px' }}>
                <label style={labelStyle}>Review Date</label>
                <input type="date" value={scores.review_date || ''} onChange={e => setScores({ ...scores, review_date: e.target.value })} style={inputStyle} />
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" onClick={() => setEditingPeriod(null)} style={{ padding: '8px 20px', background: BRAND.white, color: BRAND.coolGrey, border: `1px solid ${BRAND.greyBorder}`, cursor: 'pointer', fontFamily: BRAND.font, fontSize: '13px' }}>Cancel</button>
                <button type="button" disabled={saving} onClick={() => handleSave(period)} style={{ padding: '8px 20px', background: BRAND.purple, color: BRAND.white, border: 'none', cursor: 'pointer', fontFamily: BRAND.font, fontSize: '13px' }}>{saving ? 'Saving...' : 'Save Scores'}</button>
              </div>
            </div>
          )}

          {/* Feedback display */}
          {!isEditing && scores.feedback && (
            <div style={{ borderTop: `1px solid ${BRAND.greyBorder}`, paddingTop: '12px', marginTop: '4px' }}>
              <div style={{ fontSize: '11px', color: BRAND.coolGrey, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}>Feedback</div>
              <div style={{ fontSize: '13px', color: BRAND.coolGrey, whiteSpace: 'pre-wrap' }}>{scores.feedback}</div>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ fontSize: '13px', color: BRAND.coolGrey, marginBottom: '20px' }}>
        Score the account plan against the Currie &amp; Brown rubric dimensions. Each dimension is rated Strong, Adequate, or Weak.
      </div>
      {renderPanel('midyear', 'Mid-Year Review (July)', midyearScores, setMidyearScores)}
      {renderPanel('yearend', 'Year-End Review (January)', yearendScores, setYearendScores)}
    </div>
  )
}

// ============================================================================
// Account Action Plan Section — main export
// ============================================================================
export default function AccountActionPlanSection({ plans, planActions, projects, projectMap, clientId, projectId, clientName, clients, employees, onReload, mode }) {
  const [selectedPlan, setSelectedPlan] = useState(null)
  const [detailTab, setDetailTab] = useState('actions')
  const [showPlanForm, setShowPlanForm] = useState(false)
  const [showActionForm, setShowActionForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingAction, setEditingAction] = useState(null)
  const [progressForm, setProgressForm] = useState({})
  const [reviewSaving, setReviewSaving] = useState(false)
  const [planForm, setPlanForm] = useState({ client_id: clientId || '', account_lead_name: '', sector_lead_name: '', plan_year: 2026 })
  const [actionForm, setActionForm] = useState({ category: 'margin', action_description: '', success_criteria: '', cb_tool_used: '', owner_name: '', deadline: '', milestones: '', project_id: projectId || '' })

  const relevantPlans = useMemo(() => {
    if (mode === 'client') return plans.filter(p => p.client_id === clientId)
    const planIdsWithActions = new Set(planActions.filter(a => a.project_id === projectId).map(a => a.plan_id))
    return plans.filter(p => planIdsWithActions.has(p.id))
  }, [plans, planActions, clientId, projectId, mode])

  const relevantActions = useMemo(() => {
    if (mode === 'project') return planActions.filter(a => a.project_id === projectId)
    return planActions.filter(a => relevantPlans.some(p => p.id === a.plan_id))
  }, [planActions, relevantPlans, projectId, mode])

  const totalActions = relevantActions.length
  const completedActions = relevantActions.filter(a => a.status === 'completed').length
  const atRiskActions = relevantActions.filter(a => a.status === 'at_risk').length

  // ===== CRUD =====
  async function handleAddPlan(e) {
    e.preventDefault(); setSaving(true)
    const { error } = await supabase.from('account_action_plans').insert({
      sector_id: PCS_SECTOR_ID, client_id: planForm.client_id || clientId,
      account_lead_name: planForm.account_lead_name,
      sector_lead_name: planForm.sector_lead_name || null,
      plan_year: planForm.plan_year,
    })
    if (!error) { setPlanForm({ client_id: clientId || '', account_lead_name: '', sector_lead_name: '', plan_year: 2026 }); setShowPlanForm(false); onReload() }
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
      milestones: actionForm.milestones || null,
      project_id: actionForm.project_id || null,
    })
    if (!error) { setActionForm({ category: 'margin', action_description: '', success_criteria: '', cb_tool_used: '', owner_name: '', deadline: '', milestones: '', project_id: projectId || '' }); setShowActionForm(false); onReload() }
    setSaving(false)
  }

  async function updateActionStatus(actionId, newStatus) {
    await supabase.from('account_actions').update({ status: newStatus }).eq('id', actionId)
    onReload()
  }

  async function updatePlanStatus(planId, newStatus) {
    const updates = { status: newStatus }
    if (newStatus === 'submitted') updates.date_submitted = new Date().toISOString().slice(0, 10)
    await supabase.from('account_action_plans').update(updates).eq('id', planId)
    onReload()
  }

  async function saveReviewScores(planId, period, scores) {
    setReviewSaving(true)
    const updates = {}
    RUBRIC_DIMENSIONS.forEach(d => { updates[`${period}_${d.key}`] = scores[d.key] || null })
    updates[`${period}_overall`] = scores.overall || null
    updates[`${period}_feedback`] = scores.feedback || null
    updates[`${period}_review_date`] = scores.review_date || new Date().toISOString().slice(0, 10)
    await supabase.from('account_action_plans').update(updates).eq('id', planId)
    setReviewSaving(false)
    onReload()
  }

  async function saveActionProgress(actionId) {
    setSaving(true)
    const f = progressForm
    const updates = {}
    if (f.progress_notes !== undefined) updates.progress_notes = f.progress_notes || null
    if (f.midyear_update !== undefined) updates.midyear_update = f.midyear_update || null
    if (f.midyear_status !== undefined) updates.midyear_status = f.midyear_status || null
    if (f.yearend_update !== undefined) updates.yearend_update = f.yearend_update || null
    if (f.yearend_status !== undefined) updates.yearend_status = f.yearend_status || null
    await supabase.from('account_actions').update(updates).eq('id', actionId)
    setEditingAction(null)
    setProgressForm({})
    setSaving(false)
    onReload()
  }

  function startEditProgress(action) {
    setEditingAction(action.id)
    setProgressForm({
      progress_notes: action.progress_notes || '',
      midyear_update: action.midyear_update || '',
      midyear_status: action.midyear_status || '',
      yearend_update: action.yearend_update || '',
      yearend_status: action.yearend_status || '',
    })
  }

  // =====================================================================
  // PLAN DETAIL VIEW
  // =====================================================================
  if (selectedPlan) {
    const plan = plans.find(p => p.id === selectedPlan)
    if (!plan) { setSelectedPlan(null); return null }
    const actions = mode === 'project'
      ? planActions.filter(a => a.plan_id === selectedPlan && a.project_id === projectId)
      : planActions.filter(a => a.plan_id === selectedPlan)
    const marginActions = actions.filter(a => a.category === 'margin')
    const peopleActions = actions.filter(a => a.category === 'people')
    const growthActions = actions.filter(a => a.category === 'growth')
    const completed = actions.filter(a => a.status === 'completed').length
    const pct = actions.length > 0 ? Math.round((completed / actions.length) * 100) : 0
    const clientLabel = clients ? (clients.find(c => c.id === plan.client_id)?.name || clientName || '—') : (clientName || '—')
    const planLocked = isLocked(plan.status)
    const availableTransitions = PLAN_STATUS_FLOW[plan.status] || []

    const tabs = [
      { key: 'actions', label: 'Actions' },
      { key: 'progress', label: 'Progress Tracking' },
      { key: 'review', label: 'Review Scoring' },
    ]

    return (
      <div>
        {/* Back */}
        <button onClick={() => { setSelectedPlan(null); setDetailTab('actions') }} style={{
          background: 'none', border: 'none', color: BRAND.purple, cursor: 'pointer',
          fontFamily: BRAND.font, fontSize: '13px', padding: 0, marginBottom: '16px',
        }}>Back to plans</button>

        {/* Header */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '18px', color: BRAND.purple }}>{clientLabel} — {plan.plan_year} Account Plan</div>
          <div style={{ fontSize: '13px', color: BRAND.coolGrey, marginTop: '4px' }}>
            Lead: {plan.account_lead_name}{plan.sector_lead_name ? ` | Sector Lead: ${plan.sector_lead_name}` : ''}
            {plan.date_submitted ? ` | Submitted: ${formatDate(plan.date_submitted)}` : ''}
          </div>
        </div>

        {/* Approval workflow */}
        <ApprovalBanner
          status={plan.status}
          onTransition={async (newStatus, notes) => {
            const updates = { status: newStatus }
            if (newStatus === 'submitted') updates.date_submitted = new Date().toISOString().slice(0, 10)
            if (newStatus === 'pending_change') {
              updates.status = 'draft'
            }
            await supabase.from('account_action_plans').update(updates).eq('id', plan.id)
            onReload()
          }}
          entityLabel="Account Plan"
          isSectorManager={true}
        />

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '20px' }}>
          <KPICard label="Total Actions" value={actions.length} />
          <KPICard label="Margin" value={marginActions.length} color={BRAND.green} />
          <KPICard label="People" value={peopleActions.length} color={BRAND.blue} />
          <KPICard label="Growth" value={growthActions.length} color={BRAND.amber} />
          <KPICard label="Completed" value={completed} color={BRAND.green} subValue={`${pct}%`} />
          <KPICard label="At Risk" value={actions.filter(a => a.status === 'at_risk').length} color={BRAND.red} />
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 0, borderBottom: `2px solid ${BRAND.greyBorder}`, marginBottom: '20px' }}>
          {tabs.map(t => (
            <button key={t.key} onClick={() => setDetailTab(t.key)} style={{
              padding: '10px 24px', fontFamily: BRAND.font, fontSize: '13px', cursor: 'pointer',
              background: detailTab === t.key ? BRAND.purple : 'transparent',
              color: detailTab === t.key ? BRAND.white : BRAND.coolGrey,
              border: 'none', borderBottom: detailTab === t.key ? `2px solid ${BRAND.purple}` : '2px solid transparent',
              marginBottom: '-2px',
            }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ===== ACTIONS TAB ===== */}
        {detailTab === 'actions' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
              <button onClick={() => !planLocked && setShowActionForm(!showActionForm)} disabled={planLocked} style={{
                padding: '8px 20px', background: planLocked ? BRAND.greyLight : BRAND.purple, color: planLocked ? BRAND.coolGrey : BRAND.white,
                border: 'none', cursor: planLocked ? 'not-allowed' : 'pointer', fontFamily: BRAND.font, fontSize: '13px',
              }}>{planLocked ? 'Locked' : showActionForm ? 'Cancel' : 'Add Action'}</button>
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
                  <div><label style={labelStyle}>Milestones</label><input value={actionForm.milestones} onChange={e => setActionForm({ ...actionForm, milestones: e.target.value })} style={inputStyle} placeholder="Interim milestones" /></div>
                  {mode === 'client' && (
                    <div><label style={labelStyle}>Linked Project</label>
                      <select value={actionForm.project_id} onChange={e => setActionForm({ ...actionForm, project_id: e.target.value })} style={inputStyle}>
                        <option value="">None</option>
                        {projects.map(p => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
                      </select>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="button" onClick={() => setShowActionForm(false)} style={{ padding: '8px 20px', background: BRAND.white, color: BRAND.coolGrey, border: `1px solid ${BRAND.greyBorder}`, cursor: 'pointer', fontFamily: BRAND.font, fontSize: '13px' }}>Cancel</button>
                  <button type="submit" disabled={saving} style={{ padding: '8px 20px', background: BRAND.purple, color: BRAND.white, border: 'none', cursor: 'pointer', fontFamily: BRAND.font, fontSize: '13px' }}>{saving ? 'Saving...' : 'Save'}</button>
                </div>
              </form>
            )}

            {/* Pillar tables */}
            {[{ key: 'margin', label: 'Margin', items: marginActions },
              { key: 'people', label: 'People', items: peopleActions },
              { key: 'growth', label: 'Growth', items: growthActions },
            ].map(pillar => (
              <div key={pillar.key} style={{ marginBottom: '24px' }}>
                <div style={{ fontSize: '14px', color: PILLAR_COLORS[pillar.key], marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '4px', height: '20px', background: PILLAR_COLORS[pillar.key] }} />
                  {pillar.label} ({pillar.items.length})
                </div>
                {pillar.items.length === 0 ? (
                  <div style={{ padding: '20px 24px', color: BRAND.coolGrey, fontSize: '13px', background: BRAND.white, border: `1px solid ${BRAND.greyBorder}` }}>
                    No {pillar.label.toLowerCase()} actions yet.
                  </div>
                ) : (
                  <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, overflow: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                      <thead><tr>
                        {['Action', 'Success Criteria', 'CB Tool', 'Owner', 'Deadline', 'Milestones', 'Project', 'Status'].map(h => (
                          <th key={h} style={thStyle}>{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {pillar.items.map((a, i) => {
                          const proj = projectMap?.[a.project_id]
                          return (
                            <tr key={a.id} style={{ background: i % 2 === 0 ? BRAND.white : BRAND.greyLight }}>
                              <td style={{ ...tdBase, background: i % 2 === 0 ? BRAND.white : BRAND.greyLight, maxWidth: '260px' }}>{a.action_description}</td>
                              <td style={{ ...tdBase, background: i % 2 === 0 ? BRAND.white : BRAND.greyLight, fontSize: '12px' }}>{a.success_criteria || '—'}</td>
                              <td style={{ ...tdBase, background: i % 2 === 0 ? BRAND.white : BRAND.greyLight, fontSize: '12px', whiteSpace: 'nowrap' }}>{a.cb_tool_used || '—'}</td>
                              <td style={{ ...tdBase, background: i % 2 === 0 ? BRAND.white : BRAND.greyLight, whiteSpace: 'nowrap' }}>{a.owner_name}</td>
                              <td style={{ ...tdBase, background: i % 2 === 0 ? BRAND.white : BRAND.greyLight, whiteSpace: 'nowrap', fontSize: '12px' }}>{a.deadline}</td>
                              <td style={{ ...tdBase, background: i % 2 === 0 ? BRAND.white : BRAND.greyLight, fontSize: '12px' }}>{a.milestones || '—'}</td>
                              <td style={{ ...tdBase, background: i % 2 === 0 ? BRAND.white : BRAND.greyLight, whiteSpace: 'nowrap' }}>
                                {proj ? <ProjectLink id={proj.id}>{proj.code}</ProjectLink> : '—'}
                              </td>
                              <td style={{ ...tdBase, background: i % 2 === 0 ? BRAND.white : BRAND.greyLight }}>
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
        )}

        {/* ===== PROGRESS TRACKING TAB ===== */}
        {detailTab === 'progress' && (
          <div>
            <div style={{ fontSize: '13px', color: BRAND.coolGrey, marginBottom: '16px' }}>
              Track mid-year and year-end progress for each action. Click a row to expand the progress form.
            </div>
            <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead><tr>
                  {['Pillar', 'Action', 'Owner', 'Status', 'Mid-Year Status', 'Year-End Status', ''].map(h => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {actions.length === 0 ? (
                    <tr><td colSpan={7} style={{ padding: '40px 24px', color: BRAND.coolGrey }}>No actions to track.</td></tr>
                  ) : actions.map((a, i) => {
                    const isEditing = editingAction === a.id
                    return (
                      <React.Fragment key={a.id}>
                        <tr style={{ background: i % 2 === 0 ? BRAND.white : BRAND.greyLight, cursor: 'pointer' }}
                          onClick={() => isEditing ? null : startEditProgress(a)}>
                          <td style={{ ...tdBase, background: i % 2 === 0 ? BRAND.white : BRAND.greyLight }}>
                            <StatusBadge status={a.category} map={categoryMap} />
                          </td>
                          <td style={{ ...tdBase, background: i % 2 === 0 ? BRAND.white : BRAND.greyLight, maxWidth: '280px' }}>{a.action_description}</td>
                          <td style={{ ...tdBase, background: i % 2 === 0 ? BRAND.white : BRAND.greyLight, whiteSpace: 'nowrap' }}>{a.owner_name}</td>
                          <td style={{ ...tdBase, background: i % 2 === 0 ? BRAND.white : BRAND.greyLight }}>
                            <StatusBadge status={a.status} map={actionStatusMap} />
                          </td>
                          <td style={{ ...tdBase, background: i % 2 === 0 ? BRAND.white : BRAND.greyLight }}>
                            {a.midyear_status ? <StatusBadge status={a.midyear_status} map={midyearStatusMap} /> : <span style={{ fontSize: '12px' }}>—</span>}
                          </td>
                          <td style={{ ...tdBase, background: i % 2 === 0 ? BRAND.white : BRAND.greyLight }}>
                            {a.yearend_status ? <StatusBadge status={a.yearend_status} map={yearendStatusMap} /> : <span style={{ fontSize: '12px' }}>—</span>}
                          </td>
                          <td style={{ ...tdBase, background: i % 2 === 0 ? BRAND.white : BRAND.greyLight }}>
                            <button onClick={(e) => { e.stopPropagation(); isEditing ? setEditingAction(null) : startEditProgress(a) }} style={{
                              padding: '3px 10px', border: `1px solid ${BRAND.greyBorder}`, background: BRAND.white,
                              fontFamily: BRAND.font, fontSize: '11px', color: BRAND.purple, cursor: 'pointer',
                            }}>{isEditing ? 'Close' : 'Edit'}</button>
                          </td>
                        </tr>
                        {isEditing && (
                          <tr><td colSpan={7} style={{ padding: 0, background: BRAND.purpleLight }}>
                            <div style={{ padding: '20px', borderTop: `1px solid ${BRAND.greyBorder}`, borderBottom: `1px solid ${BRAND.greyBorder}` }}>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                                {/* Mid-Year panel */}
                                <div style={{ border: `1px solid ${BRAND.greyBorder}`, background: BRAND.white, padding: '16px' }}>
                                  <div style={{ fontSize: '14px', color: BRAND.purple, marginBottom: '12px', fontWeight: 600 }}>Mid-Year Review</div>
                                  <div style={{ marginBottom: '10px' }}>
                                    <label style={labelStyle}>Status</label>
                                    <select value={progressForm.midyear_status || ''} onChange={e => setProgressForm({ ...progressForm, midyear_status: e.target.value || null })} style={inputStyle}>
                                      <option value="">Not assessed</option>
                                      <option value="not_started">Not Started</option>
                                      <option value="on_track">On Track</option>
                                      <option value="at_risk">At Risk</option>
                                      <option value="behind">Behind</option>
                                      <option value="completed">Completed</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label style={labelStyle}>Update Notes</label>
                                    <textarea value={progressForm.midyear_update || ''} onChange={e => setProgressForm({ ...progressForm, midyear_update: e.target.value })} style={textareaStyle} placeholder="Written update for July review..." />
                                  </div>
                                </div>
                                {/* Year-End panel */}
                                <div style={{ border: `1px solid ${BRAND.greyBorder}`, background: BRAND.white, padding: '16px' }}>
                                  <div style={{ fontSize: '14px', color: BRAND.purple, marginBottom: '12px', fontWeight: 600 }}>Year-End Review</div>
                                  <div style={{ marginBottom: '10px' }}>
                                    <label style={labelStyle}>Status</label>
                                    <select value={progressForm.yearend_status || ''} onChange={e => setProgressForm({ ...progressForm, yearend_status: e.target.value || null })} style={inputStyle}>
                                      <option value="">Not assessed</option>
                                      <option value="achieved">Achieved</option>
                                      <option value="partially_achieved">Partially Achieved</option>
                                      <option value="not_achieved">Not Achieved</option>
                                      <option value="superseded">Superseded</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label style={labelStyle}>Update Notes</label>
                                    <textarea value={progressForm.yearend_update || ''} onChange={e => setProgressForm({ ...progressForm, yearend_update: e.target.value })} style={textareaStyle} placeholder="Written update for January review..." />
                                  </div>
                                </div>
                              </div>
                              <div style={{ marginBottom: '16px' }}>
                                <label style={labelStyle}>General Progress Notes</label>
                                <textarea value={progressForm.progress_notes || ''} onChange={e => setProgressForm({ ...progressForm, progress_notes: e.target.value })} style={textareaStyle} placeholder="Ongoing progress notes..." />
                              </div>
                              <div style={{ display: 'flex', gap: '8px' }}>
                                <button type="button" onClick={() => { setEditingAction(null); setProgressForm({}) }} style={{ padding: '8px 20px', background: BRAND.white, color: BRAND.coolGrey, border: `1px solid ${BRAND.greyBorder}`, cursor: 'pointer', fontFamily: BRAND.font, fontSize: '13px' }}>Cancel</button>
                                <button type="button" disabled={saving} onClick={() => saveActionProgress(a.id)} style={{ padding: '8px 20px', background: BRAND.purple, color: BRAND.white, border: 'none', cursor: 'pointer', fontFamily: BRAND.font, fontSize: '13px' }}>{saving ? 'Saving...' : 'Save Progress'}</button>
                              </div>
                            </div>
                          </td></tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ===== REVIEW SCORING TAB ===== */}
        {detailTab === 'review' && (
          <ReviewScoringPanel plan={plan} onSave={saveReviewScores} saving={reviewSaving} />
        )}
      </div>
    )
  }

  // =====================================================================
  // PLANS LIST VIEW
  // =====================================================================
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        <KPICard label="Account Plans" value={relevantPlans.length} />
        <KPICard label="Total Actions" value={totalActions} />
        <KPICard label="Completed" value={completedActions} color={BRAND.green}
          subValue={totalActions > 0 ? `${Math.round((completedActions / totalActions) * 100)}%` : '—'} />
        <KPICard label="At Risk" value={atRiskActions} color={atRiskActions > 0 ? BRAND.red : BRAND.green} />
      </div>

      {mode === 'client' && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
          <button onClick={() => setShowPlanForm(!showPlanForm)} style={{
            padding: '8px 20px', background: BRAND.purple, color: BRAND.white,
            border: 'none', cursor: 'pointer', fontFamily: BRAND.font, fontSize: '13px',
          }}>{showPlanForm ? 'Cancel' : 'Create Account Plan'}</button>
        </div>
      )}

      {showPlanForm && mode === 'client' && (
        <form onSubmit={handleAddPlan} style={{ background: BRAND.purpleLight, border: `1px solid ${BRAND.greyBorder}`, padding: '20px', marginBottom: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
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

      <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead><tr>
            {['Client', 'Year', 'Account Lead', 'Status', 'Actions', 'Completed', 'At Risk', 'Progress'].map(h => (
              <th key={h} style={thStyle}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {relevantPlans.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: '40px 24px', color: BRAND.coolGrey }}>
                {mode === 'project' ? 'No account action plans with actions linked to this project.' : 'No account action plans created yet.'}
              </td></tr>
            ) : (
              relevantPlans.map((p, i) => {
                const pActions = planActions.filter(a => a.plan_id === p.id)
                const pCompleted = pActions.filter(a => a.status === 'completed').length
                const pAtRisk = pActions.filter(a => a.status === 'at_risk').length
                const pPct = pActions.length > 0 ? Math.round((pCompleted / pActions.length) * 100) : 0
                const pClientLabel = clients ? (clients.find(c => c.id === p.client_id)?.name || clientName || '—') : (clientName || '—')
                return (
                  <tr key={p.id} style={{ background: i % 2 === 0 ? BRAND.white : BRAND.greyLight, cursor: 'pointer' }}
                    onClick={() => setSelectedPlan(p.id)}>
                    <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, color: BRAND.purple, textDecoration: 'underline', textDecorationColor: 'rgba(74,21,75,0.3)' }}>{pClientLabel}</td>
                    <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, color: BRAND.coolGrey }}>{p.plan_year}</td>
                    <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, color: BRAND.coolGrey }}>{p.account_lead_name}</td>
                    <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}` }}><StatusBadge status={p.status} map={planStatusMap} /></td>
                    <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, color: BRAND.coolGrey }}>{pActions.length}</td>
                    <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, color: BRAND.green }}>{pCompleted}</td>
                    <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}`, color: pAtRisk > 0 ? BRAND.red : BRAND.coolGrey }}>{pAtRisk}</td>
                    <td style={{ padding: '10px 14px', borderBottom: `1px solid ${BRAND.greyBorder}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ flex: 1, height: '6px', background: BRAND.greyLight, minWidth: '60px' }}>
                          <div style={{ height: '100%', width: `${pPct}%`, background: BRAND.green }} />
                        </div>
                        <span style={{ fontSize: '11px', color: BRAND.coolGrey, whiteSpace: 'nowrap' }}>{pPct}%</span>
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
