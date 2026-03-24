/**
 * Final comprehensive check for all known missing columns
 */
const db = require('../src/config/db')

async function hasCol(table, col) {
  const r = await db.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name=$1 AND column_name=$2 AND table_schema='public'`,
    [table, col]
  )
  return r.rows.length > 0
}

async function run() {
  const checks = [
    ['customers', 'is_blocked'],
    ['payments', 'status'],
    ['vehicles', 'archived_at'],
    ['vehicles', 'archived_by'],
    ['vehicles', 'archived_reason'],
    ['customers', 'portal_password_hash'],
    ['appointments', 'notes'],
    ['quotations', 'promo_code'],
    ['quotations', 'discount_amount'],
    ['quotations', 'coating_process'],
    ['quotations', 'vehicle_size'],
    ['job_orders', 'closed_at'],
    ['appointments', 'archived_at'],
    ['appointments', 'archived_by'],
  ]

  for (const [table, col] of checks) {
    const exists = await hasCol(table, col)
    console.log(`${table}.${col}: ${exists ? 'OK' : 'MISSING'}`)
  }
  process.exit(0)
}

run().catch(e => { console.error(e.message); process.exit(1) })
