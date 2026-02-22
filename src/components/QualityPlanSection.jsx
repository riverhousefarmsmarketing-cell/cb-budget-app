import { useState, useMemo, useEffect } from 'react'
import { BRAND } from '../lib/brand'
import { formatDate } from '../lib/utils'
import { supabase } from '../lib/supabase'
import { PCS_SECTOR_ID } from '../hooks/useData'
import { StatusBadge, KPICard, ProjectLink } from './SharedUI'
import { ApprovalBanner, isLocked } from './ApprovalWorkflow'

// ============================================================================
// Status maps
// ============================================================================
const statusMap = {
  not_started: { bg: BRAND.greyLight, text: BRAND.coolGrey, label: 'Not Started' },
  in_progress: { bg: '#E8F4FD', text: BRAND.blue, label: 'In Progress' },
  compliant: { bg: '#E8F5E8', text: BRAND.green, label: 'Compliant' },
  non_compliant: { bg: '#FDECEC', text: BRAND.red, label: 'Non-Compliant' },
  not_applicable: { bg: BRAND.greyLight, text: BRAND.coolGrey, label: 'N/A' },
}

const categoryMap = {
  general: { bg: BRAND.greyLight, text: BRAND.coolGrey, label: 'General' },
  deliverable: { bg: '#E8F4FD', text: BRAND.blue, label: 'Deliverable' },
  process: { bg: '#FFF4E5', text: BRAND.amber, label: 'Process' },
  compliance: { bg: '#E8F5E8', text: BRAND.green, label: 'Compliance' },
  health_safety: { bg: '#FDECEC', text: BRAND.red, label: 'H&S' },
  environmental: { bg: '#E8F5E8', text: BRAND.green, label: 'Environmental' },
  client_specific: { bg: '#E8F4FD', text: BRAND.blue, label: 'Client Specific' },
}

const auditOutcomeMap = {
  pass: { bg: '#E8F5E8', text: BRAND.green, label: 'Pass' },
  fail: { bg: '#FDECEC', text: BRAND.red, label: 'Fail' },
  partial: { bg: '#FFF4E5', text: BRAND.amber, label: 'Partial' },
  deferred: { bg: BRAND.greyLight, text: BRAND.coolGrey, label: 'Deferred' },
}

const correctiveStatusMap = {
  open: { bg: '#FDECEC', text: BRAND.red, label: 'Open' },
  in_progress: { bg: '#FFF4E5', text: BRAND.amber, label: 'In Progress' },
  closed: { bg: '#E8F5E8', text: BRAND.green, label: 'Closed' },
  overdue: { bg: '#FDECEC', text: BRAND.red, label: 'Overdue' },
}

// ============================================================================
// Props:
//   items - array of quality_plan_items
//   clientId - (optional) filter/pre-fill for client
//   projectId - (optional) filter/pre-fill for project
//   projects - array for project dropdown
//   projectMap - { id: { id, code, name } }
//   onReload - callback
//   mode - 'client' | 'project'
// ============================================================================
export default function QualityPlanSection({ items, clientId, projectId, projects, projectMap, onReload, mode, employees }) {
  const [showForm, setShowForm] = useState(false)
  const [showCorrective, setShowCorrective] = useState(null)
  const [saving, setSaving] = useState(false)
  const [expandedId, setExpandedId] = useState(null)
  const [filterStatus, setFilterStatus] = useState('all')
  const [planApprovalStatus, setPlanApprovalStatus] = useState('draft')
  const planLocked = isLocked(planApprovalStatus)
  const [form, setForm] = useState({
    objective: '', category: 'general', owner_name: '', deadline: '',
    next_audit_date: '', project_id: projectId || '', notes: '',
  })
  const [correctiveForm, setCorrectiveForm] = useState({
    corrective_action: '', corrective_owner: '', corrective_deadline: '',
  })

  const inputStyle = {
    width: '100%', padding: '8px 12px', border: `1px solid ${BRAND.greyBorder}`,
    fontFamily: BRAND.font, fontSize: '14px', color: BRAND.coolGrey, boxSizing: 'border-box',
  }
  const labelStyle = { display: 'block', fontSize: '12px', color: BRAND.coolGrey, marginBottom: '4px' }

  // Filter items
  const relevantItems = useMemo(() => {
    let filtered = items
    if (mode === 'project') filtered = items.filter(i => i.project_id === projectId || (i.client_id === clientId && !i.project_id))
    if (mode === 'client') filtered = items.filter(i => i.client_id === clientId)
    if (filterStatus !== 'all') filtered = filtered.filter(i => i.status === filterStatus)
    return filtered.sort((a, b) => a.sort_order - b.sort_order)
  }, [items, clientId, projectId, mode, filterStatus])

  const applicable = items.filter(i => {
    if (mode === 'project') return (i.project_id === projectId || (i.client_id === clientId && !i.project_id)) && i.status !== 'not_applicable'
    return i.client_id === clientId && i.status !== 'not_applicable'
  })
  const compliantCount = applicable.filter(i => i.status === 'compliant').length
  const nonCompliantCount = applicable.filter(i => i.status === 'non_compliant').length
  const compliancePct = applicable.length > 0 ? Math.round((compliantCount / applicable.length) * 100) : 0
  const openCorrective = items.filter(i => ['open', 'in_progress', 'overdue'].includes(i.corrective_status)).length
  const overdueAudits = items.filter(i => i.next_audit_date && new Date(i.next_audit_date) < new Date() && i.status !== 'not_applicable').length

  async function handleAdd(e) {
    e.preventDefault(); setSaving(true)
    const { error } = await supabase.from('quality_plan_items').insert({
      sector_id: PCS_SECTOR_ID,
      client_id: clientId || null,
      project_id: form.project_id || null,
      objective: form.objective,
      category: form.category,
      owner_name: form.owner_name,
      deadline: form.deadline || null,
      next_audit_date: form.next_audit_date || null,
      notes: form.notes || null,
    })
    if (!error) {
      setForm({ objective: '', category: 'general', owner_name: '', deadline: '', next_audit_date: '', project_id: projectId || '', notes: '' })
      setShowForm(false); onReload()
    }
    setSaving(false)
  }

  async function updateStatus(id, newStatus) {
    await supabase.from('quality_plan_items').update({ status: newStatus }).eq('id', id)
    onReload()
  }

  async function updateAudit(id, outcome) {
    await supabase.from('quality_plan_items').update({
      audit_outcome: outcome, last_audit_date: new Date().toISOString().slice(0, 10),
    }).eq('id', id)
    onReload()
  }

  async function saveCorrective(id) {
    setSaving(true)
    await supabase.from('quality_plan_items').update({
      corrective_action: correctiveForm.corrective_action,
      corrective_owner: correctiveForm.corrective_owner,
      corrective_deadline: correctiveForm.corrective_deadline || null,
      corrective_status: 'open',
      status: 'non_compliant',
    }).eq('id', id)
    setShowCorrective(null)
    setCorrectiveForm({ corrective_action: '', corrective_owner: '', corrective_deadline: '' })
    onReload(); setSaving(false)
  }

  async function updateCorrectiveStatus(id, newStatus) {
    const updates = { corrective_status: newStatus }
    if (newStatus === 'closed') {
      updates.corrective_closed_date = new Date().toISOString().slice(0, 10)
      updates.status = 'compliant'
    }
    await supabase.from('quality_plan_items').update(updates).eq('id', id)
    onReload()
  }

  const settingKey = mode === 'project' ? `quality_plan_status:project:${projectId}` : `quality_plan_status:client:${clientId}`

  useEffect(() => {
    if (!settingKey) return
    supabase.from('app_settings').select('setting_value').eq('sector_id', PCS_SECTOR_ID).eq('setting_key', settingKey).single()
      .then(({ data }) => { if (data) setPlanApprovalStatus(data.setting_value) })
  }, [settingKey])

  async function handlePlanApproval(newStatus) {
    const resolvedStatus = newStatus === 'pending_change' ? 'draft' : newStatus
    // Upsert into app_settings
    const { data: existing } = await supabase.from('app_settings').select('id').eq('sector_id', PCS_SECTOR_ID).eq('setting_key', settingKey).single()
    if (existing) {
      await supabase.from('app_settings').update({ setting_value: resolvedStatus, updated_at: new Date().toISOString() }).eq('id', existing.id)
    } else {
      await supabase.from('app_settings').insert({ sector_id: PCS_SECTOR_ID, setting_key: settingKey, setting_value: resolvedStatus })
    }
    setPlanApprovalStatus(resolvedStatus)
  }

  const selectStyle = {
    padding: '6px 10px', border: `1px solid ${BRAND.greyBorder}`,
    fontFamily: BRAND.font, fontSize: '13px', color: BRAND.coolGrey, background: BRAND.white,
  }

  return (
    <div>
      {/* Plan-level approval */}
      <ApprovalBanner
        status={planApprovalStatus}
        onTransition={handlePlanApproval}
        entityLabel="Quality Plan"
        isSectorManager={true}
      />

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        <KPICard label="Total Items" value={applicable.length + items.filter(i => i.status === 'not_applicable').length} />
        <KPICard label="Compliance" value={`${compliancePct}%`} color={compliancePct >= 80 ? BRAND.green : compliancePct >= 50 ? BRAND.amber : BRAND.red} />
        <KPICard label="Compliant" value={compliantCount} color={BRAND.green} />
        <KPICard label="Non-Compliant" value={nonCompliantCount} color={nonCompliantCount > 0 ? BRAND.red : BRAND.green} />
        <KPICard label="Open Corrective" value={openCorrective} color={openCorrective > 0 ? BRAND.red : BRAND.green} />
        {overdueAudits > 0 && <KPICard label="Overdue Audits" value={overdueAudits} color={BRAND.red} />}
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div>
            <label style={{ fontSize: '12px', color: BRAND.coolGrey, display: 'block', marginBottom: '4px' }}>Status</label>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={selectStyle}>
              <option value="all">All</option>
              <option value="compliant">Compliant</option>
              <option value="non_compliant">Non-Compliant</option>
              <option value="in_progress">In Progress</option>
              <option value="not_started">Not Started</option>
            </select>
          </div>
          <span style={{ fontSize: '12px', color: BRAND.coolGrey, alignSelf: 'flex-end' }}>
            {relevantItems.length} items
          </span>
        </div>
        <button onClick={() => !planLocked && setShowForm(!showForm)} disabled={planLocked} style={{
          padding: '8px 20px', background: planLocked ? BRAND.greyLight : BRAND.purple, color: planLocked ? BRAND.coolGrey : BRAND.white,
          border: 'none', cursor: planLocked ? 'not-allowed' : 'pointer', fontFamily: BRAND.font, fontSize: '13px',
        }}>{planLocked ? 'Locked' : showForm ? 'Cancel' : 'Add Quality Item'}</button>
      </div>

      {/* Add form */}
      {showForm && (
        <form onSubmit={handleAdd} style={{ background: BRAND.purpleLight, border: `1px solid ${BRAND.greyBorder}`, padding: '20px', marginBottom: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div style={{ gridColumn: '1 / -1' }}><label style={labelStyle}>Quality Objective / Standard</label>
              <input value={form.objective} onChange={e => setForm({ ...form, objective: e.target.value })} required style={inputStyle}
                placeholder="e.g. All deliverables reviewed by Senior PM before issue" />
            </div>
            <div><label style={labelStyle}>Category</label>
              <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} style={inputStyle}>
                <option value="general">General</option><option value="deliverable">Deliverable</option>
                <option value="process">Process</option><option value="compliance">Compliance</option>
                <option value="health_safety">Health and Safety</option><option value="environmental">Environmental</option>
                <option value="client_specific">Client Specific</option>
              </select>
            </div>
            <div><label style={labelStyle}>Owner</label><select value={form.owner_name} onChange={e => setForm({ ...form, owner_name: e.target.value })} required style={inputStyle}><option value="">Select...</option>{(employees || []).map(e => <option key={e.id} value={e.name}>{e.name}</option>)}</select></div>
            <div><label style={labelStyle}>Deadline</label><input type="date" value={form.deadline} onChange={e => setForm({ ...form, deadline: e.target.value })} style={inputStyle} /></div>
            <div><label style={labelStyle}>Next Audit Date</label><input type="date" value={form.next_audit_date} onChange={e => setForm({ ...form, next_audit_date: e.target.value })} style={inputStyle} /></div>
            {mode === 'client' && (
              <div><label style={labelStyle}>Linked Project</label>
                <select value={form.project_id} onChange={e => setForm({ ...form, project_id: e.target.value })} style={inputStyle}>
                  <option value="">All (client-level)</option>
                  {(projects || []).map(p => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
                </select>
              </div>
            )}
            <div><label style={labelStyle}>Notes</label><input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} style={inputStyle} /></div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" onClick={() => setShowForm(false)} style={{ padding: '8px 20px', background: BRAND.white, color: BRAND.coolGrey, border: `1px solid ${BRAND.greyBorder}`, cursor: 'pointer', fontFamily: BRAND.font, fontSize: '13px' }}>Cancel</button>
            <button type="submit" disabled={saving} style={{ padding: '8px 20px', background: BRAND.purple, color: BRAND.white, border: 'none', cursor: 'pointer', fontFamily: BRAND.font, fontSize: '13px' }}>{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </form>
      )}

      {/* Items */}
      {relevantItems.length === 0 ? (
        <div style={{ padding: '40px 24px', color: BRAND.coolGrey, fontSize: '14px', background: BRAND.white, border: `1px solid ${BRAND.greyBorder}` }}>
          No quality plan items{filterStatus !== 'all' ? ' match the current filter' : ' yet'}.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {relevantItems.map(item => {
            const isExpanded = expandedId === item.id
            const isOverdueAudit = item.next_audit_date && new Date(item.next_audit_date) < new Date() && item.status !== 'not_applicable'
            const proj = projectMap?.[item.project_id]

            return (
              <div key={item.id} style={{ background: BRAND.white, border: `1px solid ${BRAND.greyBorder}` }}>
                {/* Summary row */}
                <div onClick={() => setExpandedId(isExpanded ? null : item.id)}
                  style={{ padding: '12px 20px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', color: BRAND.coolGrey }}>{item.objective}</div>
                    <div style={{ fontSize: '11px', color: BRAND.coolGrey, marginTop: '4px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                      <StatusBadge status={item.category} map={categoryMap} />
                      <span>{item.owner_name}</span>
                      {item.deadline && <span>Due: {formatDate(item.deadline)}</span>}
                      {proj && <span><ProjectLink id={proj.id}>{proj.code}</ProjectLink></span>}
                      {isOverdueAudit && <span style={{ color: BRAND.red }}>Audit overdue</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
                    <select value={item.status} onClick={e => e.stopPropagation()} onChange={e => updateStatus(item.id, e.target.value)} style={{
                      padding: '3px 8px', border: `1px solid ${BRAND.greyBorder}`, fontFamily: BRAND.font,
                      fontSize: '12px', color: BRAND.coolGrey, background: BRAND.white, cursor: 'pointer',
                    }}>
                      <option value="not_started">Not Started</option><option value="in_progress">In Progress</option>
                      <option value="compliant">Compliant</option><option value="non_compliant">Non-Compliant</option>
                      <option value="not_applicable">N/A</option>
                    </select>
                    {item.corrective_status && ['open', 'in_progress', 'overdue'].includes(item.corrective_status) && (
                      <StatusBadge status={item.corrective_status} map={correctiveStatusMap} />
                    )}
                    <span style={{ fontSize: '14px', color: BRAND.coolGrey }}>{isExpanded ? '−' : '+'}</span>
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div style={{ borderTop: `1px solid ${BRAND.greyBorder}`, padding: '20px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '16px', marginBottom: '16px', fontSize: '13px' }}>
                      <div>
                        <span style={{ fontSize: '12px', color: BRAND.coolGrey, display: 'block', marginBottom: '4px' }}>Last Audit</span>
                        {item.last_audit_date ? formatDate(item.last_audit_date) : '—'}
                      </div>
                      <div>
                        <span style={{ fontSize: '12px', color: BRAND.coolGrey, display: 'block', marginBottom: '4px' }}>Audit Outcome</span>
                        {item.audit_outcome ? <StatusBadge status={item.audit_outcome} map={auditOutcomeMap} /> : '—'}
                      </div>
                      <div>
                        <span style={{ fontSize: '12px', color: BRAND.coolGrey, display: 'block', marginBottom: '4px' }}>Next Audit</span>
                        <span style={{ color: isOverdueAudit ? BRAND.red : 'inherit' }}>{item.next_audit_date ? formatDate(item.next_audit_date) : '—'}</span>
                      </div>
                      <div>
                        <span style={{ fontSize: '12px', color: BRAND.coolGrey, display: 'block', marginBottom: '4px' }}>Record Audit</span>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          {['pass', 'fail', 'partial'].map(o => (
                            <button key={o} onClick={() => updateAudit(item.id, o)} style={{
                              padding: '3px 10px', border: `1px solid ${BRAND.greyBorder}`, background: item.audit_outcome === o ? auditOutcomeMap[o].bg : BRAND.white,
                              color: item.audit_outcome === o ? auditOutcomeMap[o].text : BRAND.coolGrey,
                              fontFamily: BRAND.font, fontSize: '11px', cursor: 'pointer',
                            }}>{auditOutcomeMap[o].label}</button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {item.notes && (
                      <div style={{ fontSize: '12px', color: BRAND.coolGrey, padding: '10px 14px', background: BRAND.greyLight, marginBottom: '16px' }}>
                        {item.notes}
                      </div>
                    )}

                    {/* Corrective action section */}
                    {item.corrective_action ? (
                      <div style={{ border: `1px solid ${BRAND.greyBorder}`, padding: '16px' }}>
                        <div style={{ fontSize: '13px', color: BRAND.red, marginBottom: '12px' }}>Corrective Action</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: '12px', fontSize: '13px' }}>
                          <div>
                            <span style={{ fontSize: '12px', color: BRAND.coolGrey, display: 'block', marginBottom: '4px' }}>Action</span>
                            {item.corrective_action}
                          </div>
                          <div>
                            <span style={{ fontSize: '12px', color: BRAND.coolGrey, display: 'block', marginBottom: '4px' }}>Owner</span>
                            {item.corrective_owner || '—'}
                          </div>
                          <div>
                            <span style={{ fontSize: '12px', color: BRAND.coolGrey, display: 'block', marginBottom: '4px' }}>Deadline</span>
                            {item.corrective_deadline ? formatDate(item.corrective_deadline) : '—'}
                          </div>
                          <div>
                            <span style={{ fontSize: '12px', color: BRAND.coolGrey, display: 'block', marginBottom: '4px' }}>Status</span>
                            <select value={item.corrective_status || 'open'} onChange={e => updateCorrectiveStatus(item.id, e.target.value)} style={{
                              padding: '3px 8px', border: `1px solid ${BRAND.greyBorder}`, fontFamily: BRAND.font,
                              fontSize: '12px', color: BRAND.coolGrey, background: BRAND.white, cursor: 'pointer',
                            }}>
                              <option value="open">Open</option><option value="in_progress">In Progress</option>
                              <option value="closed">Closed</option><option value="overdue">Overdue</option>
                            </select>
                          </div>
                        </div>
                        {item.corrective_closed_date && (
                          <div style={{ fontSize: '11px', color: BRAND.green, marginTop: '8px' }}>Closed: {formatDate(item.corrective_closed_date)}</div>
                        )}
                      </div>
                    ) : (
                      <div>
                        {showCorrective === item.id ? (
                          <div style={{ border: `1px solid ${BRAND.greyBorder}`, padding: '16px' }}>
                            <div style={{ fontSize: '13px', color: BRAND.red, marginBottom: '12px' }}>Raise Corrective Action</div>
                            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                              <div><label style={labelStyle}>Corrective Action</label><input value={correctiveForm.corrective_action} onChange={e => setCorrectiveForm({ ...correctiveForm, corrective_action: e.target.value })} required style={inputStyle} /></div>
                              <div><label style={labelStyle}>Owner</label><select value={correctiveForm.corrective_owner} onChange={e => setCorrectiveForm({ ...correctiveForm, corrective_owner: e.target.value })} required style={inputStyle}><option value="">Select...</option>{(employees || []).map(e => <option key={e.id} value={e.name}>{e.name}</option>)}</select></div>
                              <div><label style={labelStyle}>Deadline</label><input type="date" value={correctiveForm.corrective_deadline} onChange={e => setCorrectiveForm({ ...correctiveForm, corrective_deadline: e.target.value })} style={inputStyle} /></div>
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button onClick={() => setShowCorrective(null)} style={{ padding: '6px 16px', background: BRAND.white, color: BRAND.coolGrey, border: `1px solid ${BRAND.greyBorder}`, cursor: 'pointer', fontFamily: BRAND.font, fontSize: '12px' }}>Cancel</button>
                              <button onClick={() => saveCorrective(item.id)} disabled={!correctiveForm.corrective_action || saving} style={{
                                padding: '6px 16px', background: BRAND.red, color: BRAND.white, border: 'none', cursor: 'pointer', fontFamily: BRAND.font, fontSize: '12px',
                                opacity: !correctiveForm.corrective_action || saving ? 0.5 : 1,
                              }}>{saving ? 'Saving...' : 'Raise Corrective Action'}</button>
                            </div>
                          </div>
                        ) : (
                          <button onClick={() => setShowCorrective(item.id)} style={{
                            padding: '6px 16px', background: BRAND.white, color: BRAND.red,
                            border: `1px solid ${BRAND.red}`, cursor: 'pointer', fontFamily: BRAND.font, fontSize: '12px',
                          }}>Raise Corrective Action</button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
