'use strict'
/*
 * The approval state machine (design section 6). Pure functions, no I/O,
 * so every rule is unit-tested in isolation.
 */

const ROLES = {
  REQUESTER: 'VOB_Requester',
  PURCHASING: 'VOB_PurchasingManager',
  PROCUREMENT: 'VOB_ProcurementApprover',
  BANK_CHECK: 'VOB_BankVerifier',
  FINANCE: 'VOB_FinancialController',
  ADMIN: 'VOB_MasterDataAdmin',
  AUDITOR: 'VOB_Auditor',
}

const STEPS = [
  { code: 'REQUESTER', status: 'PENDING_REQUESTER', role: ROLES.REQUESTER, label: 'Requester review', short: 'Requester', remind: 'reminderDays', escalate: 'escalationDays' },
  { code: 'PURCHASING', status: 'PENDING_PURCHASING', role: ROLES.PURCHASING, label: 'Purchasing Manager approval', short: 'Purchasing', remind: 'reminderDays', escalate: 'escalationDays' },
  { code: 'PROCUREMENT', status: 'PENDING_PROCUREMENT', role: ROLES.PROCUREMENT, label: 'Procurement approval (30 days EOM)', short: 'Procurement', remind: 'reminderDays', escalate: 'escalationDays', conditional: true },
  { code: 'BANK_CHECK', status: 'PENDING_BANK_CHECK', role: ROLES.BANK_CHECK, label: 'Bank details call-back', short: 'Bank check', remind: 'bankReminderDays', escalate: 'bankEscalationDays' },
  { code: 'FINANCE', status: 'PENDING_FINANCE', role: ROLES.FINANCE, label: 'Financial Controller approval', short: 'Finance', remind: 'reminderDays', escalate: 'escalationDays' },
]

const STATUS_INFO = {
  INVITED: { label: 'Invited', tone: 'info', open: true, vendor: 'Not started' },
  IN_PROGRESS: { label: 'Vendor filling in', tone: 'info', open: true, vendor: 'In progress' },
  SUBMITTED: { label: 'Submitted', tone: 'progress', open: true, vendor: 'Submitted' },
  PENDING_REQUESTER: { label: 'Requester review', tone: 'progress', open: true, vendor: 'Under review' },
  PENDING_PURCHASING: { label: 'Purchasing approval', tone: 'progress', open: true, vendor: 'Under review' },
  PENDING_PROCUREMENT: { label: 'Procurement approval', tone: 'progress', open: true, vendor: 'Under review' },
  PENDING_BANK_CHECK: { label: 'Bank call-back', tone: 'progress', open: true, vendor: 'Under review' },
  PENDING_FINANCE: { label: 'Finance approval', tone: 'progress', open: true, vendor: 'Under review' },
  RETURNED: { label: 'Sent back to vendor', tone: 'warning', open: true, vendor: 'Changes needed' },
  CREATING: { label: 'Creating in SAP', tone: 'progress', open: true, vendor: 'Under review' },
  SAP_ERROR: { label: 'SAP error', tone: 'error', open: true, vendor: 'Under review' },
  CREATED: { label: 'Created in SAP', tone: 'success', open: false, vendor: 'Account created' },
  REJECTED: { label: 'Rejected', tone: 'neutral', open: false, vendor: 'Not approved' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral', open: false, vendor: 'Cancelled' },
  EXPIRED: { label: 'Expired', tone: 'neutral', open: false, vendor: 'Expired' },
}

const VENDOR_EDITABLE = ['INVITED', 'IN_PROGRESS', 'RETURNED']

/** The steps that apply to this request (procurement only when the payment term needs it). */
function stepsFor (requiresProcurement) {
  return STEPS.filter(s => !s.conditional || requiresProcurement)
}

function stepForStatus (status) {
  return STEPS.find(s => s.status === status)
}

/** Status after the given step is approved. */
function nextStatusAfter (stepCode, requiresProcurement) {
  const steps = stepsFor(requiresProcurement)
  const i = steps.findIndex(s => s.code === stepCode)
  if (i < 0) throw new Error(`Unknown step ${stepCode}`)
  return i + 1 < steps.length ? steps[i + 1].status : 'CREATING'
}

const firstStatus = () => STEPS[0].status

/**
 * Can this user act on the request's current step?
 * user: { id, roles: string[] }
 * request: { status, requesterId, round }
 * decisions: ApprovalSteps of the request (any round)
 * Returns { ok: true, step } or { ok: false, reason } with a plain-English reason.
 */
function canAct (user, request, decisions) {
  const step = stepForStatus(request.status)
  if (!step) return { ok: false, reason: 'This request is not waiting for an approval right now.' }
  const has = r => (user.roles || []).includes(r)
  if (!has(step.role)) return { ok: false, step, reason: `Only a ${roleLabel(step.role)} can do the ${step.label.toLowerCase()}.` }
  if (step.code === 'REQUESTER') {
    if (user.id !== request.requesterId) return { ok: false, step, reason: 'Only the person who invited this vendor can do the requester review.' }
  } else if (user.id === request.requesterId) {
    return { ok: false, step, reason: 'You invited this vendor, so someone else must approve this step (segregation of duties).' }
  }
  const mine = (decisions || []).filter(d => d.round === request.round && d.userId === user.id && d.step !== step.code)
  if (mine.length) {
    return { ok: false, step, reason: `You already acted on this request (${labelOf(mine[0].step)}). One person can approve only one step (segregation of duties).` }
  }
  return { ok: true, step }
}

function labelOf (code) { return STEPS.find(s => s.code === code)?.label || code }

function roleLabel (role) {
  return {
    VOB_Requester: 'requester', VOB_PurchasingManager: 'Purchasing Manager', VOB_ProcurementApprover: 'Procurement approver',
    VOB_BankVerifier: 'bank verifier', VOB_FinancialController: 'Financial Controller', VOB_MasterDataAdmin: 'master data admin', VOB_Auditor: 'auditor',
  }[role] || role
}

/** Pre-conditions for approving the current step (beyond role and SoD). Returns a reason or undefined. */
function approvalBlocker (request, { bankConfirmed, simulationValid } = {}) {
  if (request.status === 'PENDING_BANK_CHECK' && !bankConfirmed) {
    return 'Record a successful call-back (outcome "Confirmed") before approving.'
  }
  if (request.status === 'PENDING_FINANCE') {
    if (request.duplicateBlocking && !request.duplicateJustification) {
      return 'This vendor may already exist in SAP. Record why a new vendor is needed before approving.'
    }
    if (!simulationValid) return 'Run "Simulate in SAP" successfully before approving.'
  }
  return undefined
}

module.exports = {
  ROLES, STEPS, STATUS_INFO, VENDOR_EDITABLE,
  stepsFor, stepForStatus, nextStatusAfter, firstStatus, canAct, approvalBlocker, labelOf, roleLabel,
}
