/**
 * workflowEngine.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Centralized workflow definitions and validators for the MasterAuto platform.
 *
 * PRINCIPLES
 *  • Operational status transitions are MANUAL (button-triggered by authorized users).
 *  • Financial status (payment) is AUTOMATIC (computed from recorded payments).
 *  • Every transition is validated here before being applied.
 *  • Role-based access control is enforced per stage.
 *  • Cancelled status cannot be reversed without a Manager/Admin override endpoint.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Role constants ────────────────────────────────────────────────────────────
const ROLES = {
  SUPERADMIN:  'SuperAdmin',
  ADMIN:       'Admin',
}

// SuperAdmin and Admin both have full management access
const MANAGEMENT  = [ROLES.SUPERADMIN, ROLES.ADMIN]
const OPERATIONAL = [ROLES.SUPERADMIN, ROLES.ADMIN]
const ALL_STAFF   = [ROLES.SUPERADMIN, ROLES.ADMIN]

// ── Appointment (Scheduling) Workflow ─────────────────────────────────────────
//   Scheduled → Checked-In → In Progress → For QA → Ready for Release
//             → Paid → Released → Completed
//   Cancelled: can be set from any non-terminal state; only MANAGEMENT can set it.
//   Terminal states: Completed, Released, Cancelled
//   The 'Paid' step is automatic when payment view signals PAID, but also manually
//   advanceable by Cashier/Admin/Manager for edge cases.

const APPOINTMENT_WORKFLOW = {
  statusOrder: [
    'Scheduled',        // 0 - appointment created
    'Checked-In',       // 1 - customer arrived
    'In Progress',      // 2 - work started by technician
    'For QA',           // 3 - work done, awaiting quality check
    'Ready for Release',// 4 - QA approved, vehicle ready
    'Paid',             // 5 - payment cleared
    'Released',         // 6 - vehicle handed over to customer
    'Completed',        // 7 - appointment fully closed
  ],

  // Statuses that end the workflow; no further transitions except via override
  // NOTE: 'Released' is NOT terminal for appointments — the final step is 'Completed'
  //       (Released = vehicle handed over, Completed = appointment fully closed)
  terminalStatuses: new Set(['Completed', 'Cancelled']),

  // Statuses from which Cancelled is allowed (all non-terminal, non-Completed)
  cancelAllowedFrom: new Set([
    'Scheduled', 'Checked-In', 'In Progress', 'For QA', 'Ready for Release', 'Paid', 'Released',
  ]),

  // Per-stage role permissions (who can trigger this transition)
  rolePermissions: {
    'Checked-In':         ALL_STAFF,
    'In Progress':        ALL_STAFF,
    'For QA':             ALL_STAFF,
    'Ready for Release':  ALL_STAFF,
    'Paid':               ALL_STAFF,
    'Released':           MANAGEMENT,
    'Completed':          [ROLES.ADMIN, ROLES.SUPERADMIN],
    'Cancelled':          MANAGEMENT,
  },

  // Timestamp column that gets stamped on each transition
  timestampColumn: {
    'Checked-In':         'checked_in_at',
    'In Progress':        'in_progress_at',
    'For QA':             'for_qa_at',
    'Ready for Release':  'ready_at',
    'Paid':               'paid_at',
    'Released':           'released_at',
    'Completed':          'completed_at',
    'Cancelled':          'cancelled_at',
  },
}

// ── Job Order Workflow ────────────────────────────────────────────────────────
//   Pending → In Progress → For QA → Completed → Released
//   Cancelled: Admin/Manager only, from any non-terminal state.
//   Terminal states: Released, Cancelled
//   NO reversal from Cancelled (use force-release variant for override).
//
//   Automatic side-effects (enforced in route, not here):
//     Completed → inventory parts deduction
//     Released  → commission calculation + inventory parts deduction (if not done yet)

// ── Job Order Workflow ───────────────────────────────────────────────────────────────────
//   Pending -> In Progress -> For QA -> Completed -> Released -> Complete
//   Cancelled: Admin/Manager only, from Pending only.
//   Terminal states: Complete, Cancelled
//
//   Automatic side-effects (enforced in route, not here):
//     Completed -> inventory parts deduction + Job Completed email
//     Released  -> commission calculation + inventory parts deduction + Released email
//     Complete  -> stamps closed_at; record becomes read-only

const JOB_ORDER_WORKFLOW = {
  statusOrder: [
    'Pending JO Approval', // 0 - job order created, waiting for Super Admin
    'Pending',             // 1 - approved and queued for operations
    'In Progress',         // 2 - technician starts work
    'For QA',              // 3 - work done, awaiting quality check
    'Completed',           // 4 - QA approved; email notification fires here
    'Released',            // 5 - vehicle released to customer (payment required) + email
    'Complete',            // 6 - fully archived; no further actions
  ],

  terminalStatuses: new Set(['Complete', 'Cancelled']),

  cancelAllowedFrom: new Set(['Pending JO Approval', 'Pending', 'In Progress', 'For QA', 'Completed']),

  rolePermissions: {
    'Pending':     [ROLES.SUPERADMIN],
    'In Progress': ALL_STAFF,
    'For QA':      ALL_STAFF,
    'Completed':   ALL_STAFF,
    'Released':    MANAGEMENT,
    'Complete':    MANAGEMENT,
    'Cancelled':   MANAGEMENT,
  },

  timestampColumn: {
    'Pending':     'pending_at',
    'In Progress': 'in_progress_at',
    'For QA':      'for_qa_at',
    'Completed':   'completed_at',
    'Released':    'released_at',
    'Complete':    'closed_at',
    'Cancelled':   'cancelled_at',
  },

  // Legacy compatibility:
  // Older records may still have removed statuses from the previous deposit flow.
  // Treat them as "Pending" to keep transitions valid.
  legacyStatusAliases: {
    'Awaiting Deposit': 'Pending',
    'Ready for Service': 'Pending',
  },
}

// ── Quotation Workflow ────────────────────────────────────────────────────────
//   Draft → Sent → Approved
//   Not Approved: Admin/Manager only, from Draft or Sent.
//   Terminal states: Approved, Not Approved
//   Legacy status 'Pending' is treated as an alias for 'Draft' in the route layer.
//
//   Automatic side-effects (enforced in route, not here):
//     Sent     → records sent_at timestamp
//     Approved → locks quotation (is_locked = TRUE, locked_at, locked_by)

const QUOTATION_WORKFLOW = {
  statusOrder: [
    'Draft',        // 0 - quotation created (internal review)
    'Sent',         // 1 - sent to customer for review
    'Approved',     // 2 - customer/manager approved; can now schedule & create JO
  ],

  terminalStatuses: new Set(['Approved', 'Not Approved']),

  cancelAllowedFrom: new Set(['Draft', 'Sent', 'Pending']),

  rolePermissions: {
    'Sent':         MANAGEMENT,
    'Approved':     MANAGEMENT,
    'Not Approved': MANAGEMENT,
  },

  timestampColumn: {
    'Sent':         'sent_at',
    'Approved':     'locked_at',
  },
}

// ── Core validator ────────────────────────────────────────────────────────────
/**
 * validateTransition
 * @param {string} currentStatus   - Current entity status
 * @param {string} nextStatus      - Desired next status
 * @param {object} workflow        - One of APPOINTMENT_WORKFLOW / JOB_ORDER_WORKFLOW
 * @param {string} userRole        - Caller's role (req.user.role)
 * @returns {{ valid: boolean, httpStatus?: number, message?: string }}
 */
function validateTransition(currentStatus, nextStatus, workflow, userRole) {
  const { statusOrder, terminalStatuses, cancelAllowedFrom, rolePermissions } = workflow
  const normalizeStatus = (status) => {
    const aliasMap = workflow.legacyStatusAliases || {}
    return aliasMap[status] || status
  }

  const normalizedCurrent = normalizeStatus(currentStatus)
  const normalizedNext = normalizeStatus(nextStatus)

  // 1. Block any transition OUT of a terminal status (except overrides handled separately)
  if (terminalStatuses.has(normalizedCurrent)) {
    return {
      valid: false,
      httpStatus: 409,
      message: `Cannot transition from terminal status "${currentStatus}". Use the override endpoint if a Manager approval is needed.`,
    }
  }

  // 2. Cancellation path
  if (normalizedNext === 'Cancelled') {
    if (!cancelAllowedFrom.has(normalizedCurrent)) {
      return {
        valid: false,
        httpStatus: 409,
        message: `Cannot cancel from status "${currentStatus}".`,
      }
    }
    const allowedRoles = rolePermissions['Cancelled'] || MANAGEMENT
    if (!allowedRoles.includes(userRole)) {
      return {
        valid: false,
        httpStatus: 403,
        message: `Insufficient permissions to cancel. Required roles: ${allowedRoles.join(', ')}.`,
      }
    }
    return { valid: true }
  }

  // 3. Sequential order enforcement
  const currentIdx = statusOrder.indexOf(normalizedCurrent)
  const nextIdx    = statusOrder.indexOf(normalizedNext)

  if (nextIdx === -1) {
    return {
      valid: false,
      httpStatus: 400,
      message: `Unknown target status: "${nextStatus}".`,
    }
  }

  if (currentIdx === -1) {
    return {
      valid: false,
      httpStatus: 409,
      message: `Current status "${currentStatus}" is not part of the workflow order. Cannot advance.`,
    }
  }

  if (nextIdx !== currentIdx + 1) {
    const expected = statusOrder[currentIdx + 1] || '(none — already at end)'
    return {
      valid: false,
      httpStatus: 422,
      message: `Invalid transition: "${currentStatus}" → "${nextStatus}". Expected next step: "${expected}". Stages cannot be skipped or reversed.`,
    }
  }

  // 4. Role check for this specific stage
  const allowedRoles = rolePermissions[nextStatus]
  if (allowedRoles && !allowedRoles.includes(userRole)) {
    return {
      valid: false,
      httpStatus: 403,
      message: `Role "${userRole}" is not permitted to advance to "${nextStatus}". Required: ${allowedRoles.join(', ')}.`,
    }
  }

  return { valid: true }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * getNextStatus — returns what the next sequential status would be, or null if
 * already at the last step or in a terminal/unknown state.
 */
function getNextStatus(currentStatus, workflow) {
  const { statusOrder, terminalStatuses } = workflow
  const normalizeStatus = (status) => {
    const aliasMap = workflow.legacyStatusAliases || {}
    return aliasMap[status] || status
  }
  const normalizedCurrent = normalizeStatus(currentStatus)
  if (terminalStatuses.has(normalizedCurrent)) return null
  const idx = statusOrder.indexOf(normalizedCurrent)
  if (idx === -1 || idx === statusOrder.length - 1) return null
  return statusOrder[idx + 1]
}

/**
 * getWorkflowProgress — returns {stepNumber, totalSteps, percent} for UI steppers.
 */
function getWorkflowProgress(currentStatus, workflow) {
  const { statusOrder } = workflow
  const normalizeStatus = (status) => {
    const aliasMap = workflow.legacyStatusAliases || {}
    return aliasMap[status] || status
  }
  const idx = statusOrder.indexOf(normalizeStatus(currentStatus))
  if (idx === -1) return { stepNumber: 0, totalSteps: statusOrder.length, percent: 0 }
  return {
    stepNumber: idx + 1,
    totalSteps: statusOrder.length,
    percent: Math.round(((idx + 1) / statusOrder.length) * 100),
    allSteps: statusOrder,
  }
}

/**
 * isTerminal — convenience check.
 */
function isTerminal(status, workflow) {
  return workflow.terminalStatuses.has(status)
}

// ── Exports ───────────────────────────────────────────────────────────────────
module.exports = {
  ROLES,
  MANAGEMENT,
  OPERATIONAL,
  ALL_STAFF,
  APPOINTMENT_WORKFLOW,
  JOB_ORDER_WORKFLOW,
  QUOTATION_WORKFLOW,
  validateTransition,
  getNextStatus,
  getWorkflowProgress,
  isTerminal,
}
