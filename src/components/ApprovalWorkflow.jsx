import { useState } from 'react'
import { BRAND } from '../lib/brand'
import { supabase } from '../lib/supabase'

// ============================================================================
// Sector Manager Approval Workflow
// ============================================================================
// Shared component providing approval state, banner, and edit-lock logic.
// Used by: Account Action Plans, Quality Plans, Change Orders, Savings Log.
//
// Workflow:
//   draft → submitted → approved (locked)
//   approved → pending_change → submitted → approved
//   submitted → revision_required → draft (PM reworks)
//
// Compatible with existing schema status fields:
//   - account_action_plans: draft/submitted/under_review/revision_required/accepted
//   - project_variations: draft/submitted/under_review/approved/rejected/withdrawn
//   - project_savings: adds approval_status field (or uses verified as proxy)
// ============================================================================

const approvalStatusMap = {
  draft: { bg: BRAND.greyLight, text: BRAND.coolGrey, label: 'Draft' },
  submitted: { bg: '#E8F4FD', text: BRAND.blue, label: 'Submitted for Approval' },
  under_review: { bg: '#FFF4E5', text: BRAND.amber, label: 'Under Review' },
  revision_required: { bg: '#FDECEC', text: BRAND.red, label: 'Revision Required' },
  approved: { bg: '#E8F5E8', text: BRAND.green, label: 'Approved' },
  accepted: { bg: '#E8F5E8', text: BRAND.green, label: 'Accepted' },
  rejected: { bg: '#FDECEC', text: BRAND.red, label: 'Rejected' },
  pending_change: { bg: '#FFF4E5', text: BRAND.amber, label: 'Change Requested' },
}

// Which statuses mean the record is locked from editing
const LOCKED_STATUSES = ['approved', 'accepted']

// Allowed transitions per role
const SM_TRANSITIONS = {
  submitted: ['approved', 'accepted', 'revision_required', 'rejected'],
  under_review: ['approved', 'accepted', 'revision_required', 'rejected'],
  approved: ['pending_change'],
  accepted: ['pending_change'],
  pending_change: ['submitted'],
}

const PM_TRANSITIONS = {
  draft: ['submitted'],
  revision_required: ['submitted', 'draft'],
  pending_change: ['submitted'],
}

// Transition button labels
const TRANSITION_LABELS = {
  draft: 'Return to Draft',
  submitted: 'Submit for Approval',
  under_review: 'Begin Review',
  revision_required: 'Request Revision',
  approved: 'Approve',
  accepted: 'Accept',
  rejected: 'Reject',
  pending_change: 'Request Change',
}

// Button colors by target status
const TRANSITION_COLORS = {
  submitted: { bg: BRAND.blue, text: BRAND.white },
  approved: { bg: BRAND.green, text: BRAND.white },
  accepted: { bg: BRAND.green, text: BRAND.white },
  revision_required: { bg: BRAND.amber, text: BRAND.white },
  rejected: { bg: BRAND.red, text: BRAND.white },
  pending_change: { bg: BRAND.amber, text: BRAND.white },
  draft: { bg: BRAND.white, text: BRAND.coolGrey, border: `1px solid ${BRAND.greyBorder}` },
}

/**
 * Check if a record is locked (approved/accepted)
 */
export function isLocked(status) {
  return LOCKED_STATUSES.includes(status)
}

/**
 * Get available transitions for current status
 * isSectorManager: true = SM role, false = PM role
 */
export function getTransitions(status, isSectorManager = true) {
  const map = isSectorManager ? { ...PM_TRANSITIONS, ...SM_TRANSITIONS } : PM_TRANSITIONS
  return map[status] || []
}

/**
 * ApprovalBanner — shows current approval status and available actions
 *
 * Props:
 *   status: current status string
 *   onTransition: async (newStatus) => void
 *   isSectorManager: boolean (defaults true for Christine)
 *   entityLabel: string e.g. "Account Plan", "Change Order"
 *   revisionNotes: optional string showing why revision was requested
 *   rejectionReason: optional string
 *   approvedBy: optional string
 *   approvedDate: optional string
 */
export function ApprovalBanner({ status, onTransition, isSectorManager = true, entityLabel = 'Record', revisionNotes, rejectionReason, approvedBy, approvedDate }) {
  const [transitioning, setTransitioning] = useState(false)
  const [confirmTarget, setConfirmTarget] = useState(null)
  const [notes, setNotes] = useState('')

  const statusInfo = approvalStatusMap[status] || approvalStatusMap.draft
  const transitions = getTransitions(status, isSectorManager)
  const locked = isLocked(status)

  async function handleTransition(targetStatus) {
    // For revision/rejection, ask for notes first
    if (['revision_required', 'rejected'].includes(targetStatus) && !confirmTarget) {
      setConfirmTarget(targetStatus)
      return
    }
    setTransitioning(true)
    await onTransition(targetStatus, notes.trim() || null)
    setTransitioning(false)
    setConfirmTarget(null)
    setNotes('')
  }

  return (
    <div style={{ marginBottom: '16px' }}>
      {/* Status bar */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '12px 20px', background: statusInfo.bg,
        borderLeft: `4px solid ${statusInfo.text}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {locked && <span style={{ fontSize: '14px' }}>LOCKED</span>}
          <div>
            <span style={{ fontSize: '13px', color: statusInfo.text, fontWeight: 600, fontFamily: BRAND.font }}>{statusInfo.label}</span>
            {approvedBy && locked && (
              <span style={{ fontSize: '12px', color: BRAND.coolGrey, marginLeft: '12px', fontFamily: BRAND.font }}>
                by {approvedBy}{approvedDate ? ` on ${approvedDate}` : ''}
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {transitions.map(target => {
            const colors = TRANSITION_COLORS[target] || TRANSITION_COLORS.draft
            return (
              <button key={target} onClick={() => handleTransition(target)} disabled={transitioning} style={{
                padding: '6px 16px', background: colors.bg, color: colors.text,
                border: colors.border || 'none', cursor: 'pointer',
                fontFamily: BRAND.font, fontSize: '12px',
              }}>
                {transitioning ? 'Processing...' : TRANSITION_LABELS[target] || target}
              </button>
            )
          })}
        </div>
      </div>

      {/* Revision / rejection notes display */}
      {status === 'revision_required' && revisionNotes && (
        <div style={{ padding: '10px 20px', background: '#FFF4E5', fontSize: '12px', color: BRAND.amber, fontFamily: BRAND.font, borderLeft: `4px solid ${BRAND.amber}`, marginTop: '2px' }}>
          Revision requested: {revisionNotes}
        </div>
      )}
      {status === 'rejected' && rejectionReason && (
        <div style={{ padding: '10px 20px', background: '#FDECEC', fontSize: '12px', color: BRAND.red, fontFamily: BRAND.font, borderLeft: `4px solid ${BRAND.red}`, marginTop: '2px' }}>
          Rejection reason: {rejectionReason}
        </div>
      )}

      {/* Notes input for revision/rejection */}
      {confirmTarget && (
        <div style={{ padding: '16px 20px', background: BRAND.purpleLight, border: `1px solid ${BRAND.greyBorder}`, marginTop: '4px' }}>
          <label style={{ display: 'block', fontSize: '12px', color: BRAND.coolGrey, marginBottom: '4px', fontFamily: BRAND.font }}>
            {confirmTarget === 'rejected' ? 'Rejection reason' : 'Revision notes'} (optional)
          </label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} style={{
            width: '100%', padding: '8px 12px', border: `1px solid ${BRAND.greyBorder}`,
            fontFamily: BRAND.font, fontSize: '12px', color: BRAND.coolGrey, background: BRAND.white,
            boxSizing: 'border-box', resize: 'vertical', marginBottom: '8px',
          }} placeholder={`Why is this ${entityLabel} being ${confirmTarget === 'rejected' ? 'rejected' : 'sent back for revision'}?`} />
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button onClick={() => { setConfirmTarget(null); setNotes('') }} style={{ padding: '6px 16px', background: BRAND.white, color: BRAND.coolGrey, border: `1px solid ${BRAND.greyBorder}`, cursor: 'pointer', fontFamily: BRAND.font, fontSize: '12px' }}>Cancel</button>
            <button onClick={() => handleTransition(confirmTarget)} disabled={transitioning} style={{ padding: '6px 16px', background: TRANSITION_COLORS[confirmTarget]?.bg || BRAND.purple, color: BRAND.white, border: 'none', cursor: 'pointer', fontFamily: BRAND.font, fontSize: '12px' }}>
              {transitioning ? 'Processing...' : `Confirm ${TRANSITION_LABELS[confirmTarget]}`}
            </button>
          </div>
        </div>
      )}

      {/* Locked editing notice */}
      {locked && (
        <div style={{ padding: '8px 20px', background: BRAND.greyLight, fontSize: '12px', color: BRAND.coolGrey, fontFamily: BRAND.font, marginTop: '2px' }}>
          This {entityLabel} is approved and locked. To make changes, click "Request Change" above.
        </div>
      )}
    </div>
  )
}

/**
 * Helper: disabled style override for form inputs when locked
 */
export const lockedInputStyle = {
  opacity: 0.6, pointerEvents: 'none', background: BRAND.greyLight,
}

/**
 * Helper: wrap form input style with lock check
 */
export function lockStyle(baseStyle, locked) {
  return locked ? { ...baseStyle, ...lockedInputStyle } : baseStyle
}

export default ApprovalBanner
