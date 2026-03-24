/**
 * Backfill existing job order numbers to new branch-code format.
 * Old format: JO-2026-0001
 * New format: JO-CBO-026-0001 / JO-MNL-026-0001
 *
 * Usage (from the backend/ directory):
 *   node scripts/backfillJobOrderNos.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') })
const db = require('../src/config/db')

const BRANCH_CODES = { cubao: 'CBO', manila: 'MNL' }

function getBranchCode(bay) {
  if (!bay) return 'BR'
  return BRANCH_CODES[(bay || '').toLowerCase().trim()] || bay.substring(0, 3).toUpperCase()
}

async function run() {
  // Fetch all old-format job orders (JO-YYYY-NNNN — exactly 3 parts split by '-')
  const { rows: jobOrders } = await db.query(
    `SELECT jo.id, jo.job_order_no, c.bay
     FROM job_orders jo
     LEFT JOIN customers c ON c.id = jo.customer_id
     WHERE jo.job_order_no ~ '^JO-[0-9]{4}-[0-9]+'
     ORDER BY jo.id`,
  )

  if (!jobOrders.length) {
    console.log('No old-format job orders found. Nothing to update.')
    await db.pool.end()
    return
  }

  console.log(`Found ${jobOrders.length} job order(s) to update…\n`)

  let updated = 0
  for (const jo of jobOrders) {
    const parts = jo.job_order_no.split('-') // ['JO', '2026', '0001']
    const yearFull = parts[1]               // '2026'
    const seq      = parts[2]               // '0001'
    const yearShort = yearFull.slice(-3)    // '026'
    const branchCode = getBranchCode(jo.bay)
    const newNo = `JO-${branchCode}-${yearShort}-${seq}`

    await db.query(
      `UPDATE job_orders SET job_order_no = $1 WHERE id = $2`,
      [newNo, jo.id],
    )
    console.log(`  ${jo.job_order_no}  →  ${newNo}  (branch: ${jo.bay || 'none'})`)
    updated++
  }

  console.log(`\n✅ Updated ${updated} job order(s) to new format.`)
  await db.pool.end()
}

run().catch(e => {
  console.error('\nBackfill failed:', e.message)
  process.exit(1)
})
