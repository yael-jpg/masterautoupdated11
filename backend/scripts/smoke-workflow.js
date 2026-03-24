/**
 * smoke-workflow.js
 * Quick in-process test of the workflow engine business rules.
 * Run: node scripts/smoke-workflow.js
 */

const {
  APPOINTMENT_WORKFLOW,
  JOB_ORDER_WORKFLOW,
  validateTransition,
  getNextStatus,
  getWorkflowProgress,
  isTerminal,
} = require('../src/utils/workflowEngine')

let pass = 0
let fail = 0
let name = ''

function assert(condition, label) {
  if (condition) {
    console.log('  ✓', label)
    pass++
  } else {
    console.error('  ✗ FAIL:', label)
    fail++
  }
}

// ── 1. Appointment workflow ───────────────────────────────────────────────────
console.log('\n=== APPOINTMENT WORKFLOW ===')

name = 'Legal forward: Scheduled → Checked-In (all-staff)'
assert(validateTransition('Scheduled', 'Checked-In', APPOINTMENT_WORKFLOW, 'Reception').valid, name)

name = 'Legal forward: Checked-In → In Progress (Technician)'
assert(validateTransition('Checked-In', 'In Progress', APPOINTMENT_WORKFLOW, 'Technician').valid, name)

name = 'BLOCK skip: Scheduled → In Progress (skips Checked-In)'
assert(!validateTransition('Scheduled', 'In Progress', APPOINTMENT_WORKFLOW, 'Manager').valid, name)

name = 'BLOCK reverse: In Progress → Checked-In'
assert(!validateTransition('In Progress', 'Checked-In', APPOINTMENT_WORKFLOW, 'Admin').valid, name)

name = 'BLOCK terminal re-transition: Completed → any'
assert(!validateTransition('Completed', 'Released', APPOINTMENT_WORKFLOW, 'Admin').valid, name)

name = 'Cancel from In Progress (Manager allowed)'
assert(validateTransition('In Progress', 'Cancelled', APPOINTMENT_WORKFLOW, 'Manager').valid, name)

name = 'Cancel BLOCKED for non-Management (Technician)'
assert(!validateTransition('In Progress', 'Cancelled', APPOINTMENT_WORKFLOW, 'Technician').valid, name)

name = 'Released → Completed (Manager)'
assert(validateTransition('Released', 'Completed', APPOINTMENT_WORKFLOW, 'Manager').valid, name)

name = 'Paid → Released BLOCKED for Technician (role guard)'
assert(!validateTransition('Paid', 'Released', APPOINTMENT_WORKFLOW, 'Technician').valid, name)

name = 'Paid → Released allowed for Admin'
assert(validateTransition('Paid', 'Released', APPOINTMENT_WORKFLOW, 'Admin').valid, name)

// ── 2. Job Order workflow ─────────────────────────────────────────────────────
console.log('\n=== JOB ORDER WORKFLOW ===')

name = 'Pending → In Progress (Technician)'
assert(validateTransition('Pending', 'In Progress', JOB_ORDER_WORKFLOW, 'Technician').valid, name)

name = 'BLOCK skip: Pending → For QA'
assert(!validateTransition('Pending', 'For QA', JOB_ORDER_WORKFLOW, 'Manager').valid, name)

name = 'For QA → Completed (QA allowed)'
assert(validateTransition('For QA', 'Completed', JOB_ORDER_WORKFLOW, 'QA').valid, name)

name = 'For QA → Completed BLOCKED for Cashier'
assert(!validateTransition('For QA', 'Completed', JOB_ORDER_WORKFLOW, 'Cashier').valid, name)

name = 'Completed → Released (Manager)'
assert(validateTransition('Completed', 'Released', JOB_ORDER_WORKFLOW, 'Manager').valid, name)

name = 'Released terminal — no further normal transitions'
assert(!validateTransition('Released', 'Completed', JOB_ORDER_WORKFLOW, 'Admin').valid, name)

name = 'Cancel from Completed (Admin)'
assert(validateTransition('Completed', 'Cancelled', JOB_ORDER_WORKFLOW, 'Admin').valid, name)

name = 'Cancel BLOCKED after Release'
assert(!validateTransition('Released', 'Cancelled', JOB_ORDER_WORKFLOW, 'Admin').valid, name)

// ── 3. Helpers ────────────────────────────────────────────────────────────────
console.log('\n=== HELPERS ===')

name = 'getNextStatus: Pending → In Progress'
assert(getNextStatus('Pending', JOB_ORDER_WORKFLOW) === 'In Progress', name)

name = 'getNextStatus: Released → null (terminal)'
assert(getNextStatus('Released', JOB_ORDER_WORKFLOW) === null, name)

name = 'getWorkflowProgress: In Progress step 2 of 5'
const prog = getWorkflowProgress('In Progress', JOB_ORDER_WORKFLOW)
assert(prog.stepNumber === 2 && prog.totalSteps === 5, name)

name = 'isTerminal: Released = true'
assert(isTerminal('Released', JOB_ORDER_WORKFLOW) === true, name)

name = 'isTerminal: In Progress = false'
assert(isTerminal('In Progress', JOB_ORDER_WORKFLOW) === false, name)

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n==========================`)
console.log(`PASSED: ${pass}  FAILED: ${fail}`)
if (fail > 0) process.exit(1)
