/**
 * Run all pending missing migrations:
 *   031 - vehicle archive fields (status, archived_at, archived_by enum types)
 *   033a - customers.is_blocked
 *   033b - payments.status
 */
const fs   = require('fs')
const path = require('path')
const db   = require('../src/config/db')

const MIGRATIONS = [
  '031_vehicle_archive_fields.sql',
  '033_customers_block_flag.sql',
  '033_payments_status.sql',
]

async function run() {
  for (const filename of MIGRATIONS) {
    const filePath = path.resolve(__dirname, '../sql/migrations', filename)
    const sql = fs.readFileSync(filePath, 'utf8')
    console.log(`\nRunning ${filename} …`)
    try {
      await db.query(sql)
      console.log(`  ✓ ${filename} complete`)
    } catch (e) {
      console.error(`  ✗ ${filename} FAILED: ${e.message}`)
      throw e
    }
  }

  // Verify
  console.log('\n=== Verification ===')
  const checks = [
    ['vehicles', 'status'],
    ['vehicles', 'archived_at'],
    ['vehicles', 'archived_by'],
    ['customers', 'is_blocked'],
    ['payments', 'status'],
  ]
  for (const [table, col] of checks) {
    const r = await db.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name=$1 AND column_name=$2 AND table_schema='public'`,
      [table, col]
    )
    console.log(`${table}.${col}: ${r.rows.length ? '✓ OK' : '✗ STILL MISSING'}`)
  }

  console.log('\nAll pending migrations applied.')
  process.exit(0)
}

run().catch(e => {
  console.error('\nMigration failed:', e.message)
  process.exit(1)
})
