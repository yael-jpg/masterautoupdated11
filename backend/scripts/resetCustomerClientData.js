const db = require('../src/config/db')

const TABLE_CANDIDATES = [
  ['landing_chat_messages'],
  ['landing_chat_threads'],
  ['portal_cancellation_requests'],
  ['online_quotation_requests', 'online_quotations'],
  ['quotations'],
  ['job_order_parts'],
  ['job_orders'],
  ['appointments', 'schedules'],
  ['payments'],
  ['sale_items'],
  ['sales'],
  ['vehicle_photos'],
  ['vehicle_service_records'],
  ['customer_credit_usage'],
  ['customer_credits'],
  ['customer_documents'],
  ['customer_notes'],
  ['vehicles'],
  ['customers'],
  ['notifications'],
  ['email_notifications', 'email_logs'],
]

function hasConfirmArg() {
  const args = process.argv.slice(2)
  return args.includes('--confirm-reset') || args.includes('--yes')
}

async function resolveExistingTableName(candidates) {
  for (const name of candidates) {
    const fq = `public.${name}`
    const { rows } = await db.query('SELECT to_regclass($1) AS reg', [fq])
    if (rows[0]?.reg) return name
  }
  return null
}

async function fetchCount(tableName) {
  const { rows } = await db.query(`SELECT COUNT(*)::int AS count FROM "${tableName}"`)
  return Number(rows[0]?.count || 0)
}

async function main() {
  if (!hasConfirmArg()) {
    console.error('Refusing to run without explicit confirmation.')
    console.error('Run with: node scripts/resetCustomerClientData.js --confirm-reset')
    process.exit(1)
  }

  console.log('Resolving customer/client tables to truncate...')
  const resolved = []
  for (const candidates of TABLE_CANDIDATES) {
    // eslint-disable-next-line no-await-in-loop
    const found = await resolveExistingTableName(candidates)
    if (found) resolved.push(found)
  }

  const tables = Array.from(new Set(resolved))
  if (!tables.length) {
    console.log('No target tables found. Nothing to reset.')
    process.exit(0)
  }

  console.log('Truncating customer/client tables with RESTART IDENTITY CASCADE...')
  const quoted = tables.map((t) => `"${t}"`).join(', ')
  await db.query(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`)

  console.log('Running post-reset validation...')
  const failed = []
  for (const table of tables) {
    // eslint-disable-next-line no-await-in-loop
    const count = await fetchCount(table)
    if (count !== 0) failed.push({ table, count })
  }

  console.log('=== Customer/Client Reset Summary ===')
  console.log(`Truncated tables (${tables.length}): ${tables.join(', ')}`)
  console.log('Preserved: users/roles/admin access, configuration/system settings, service catalog, inventory master data.')

  if (failed.length) {
    console.error('Validation failed. Non-empty tables detected:')
    for (const f of failed) {
      console.error(` - ${f.table}: ${f.count}`)
    }
    process.exit(2)
  }

  console.log('Validation passed: all targeted customer/client tables are empty.')
  process.exit(0)
}

main().catch((error) => {
  console.error('Customer/client reset failed:', error)
  process.exit(1)
})
