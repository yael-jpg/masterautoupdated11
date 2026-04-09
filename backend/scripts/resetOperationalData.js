const path = require('path')
const db = require('../src/config/db')
const { createSqlGzipBackup } = require('../src/utils/pgDumpBackup')

const RESET_TABLE_CANDIDATES = [
  ['customers'],
  ['vehicles'],
  ['quotations'],
  ['online_quotations', 'online_quotation_requests'],
  ['job_orders'],
  ['schedules', 'appointments'],
  ['payments'],
  ['sales'],
  ['notifications'],
  ['activity_logs'],
  ['email_logs', 'email_notifications'],
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
    console.error('Run with: node scripts/resetOperationalData.js --confirm-reset')
    process.exit(1)
  }

  console.log('Resolving tables to truncate...')
  const resolution = []
  for (const candidates of RESET_TABLE_CANDIDATES) {
    // eslint-disable-next-line no-await-in-loop
    const found = await resolveExistingTableName(candidates)
    resolution.push({ requested: candidates[0], resolved: found, candidates })
  }

  const tablesToTruncate = Array.from(
    new Set(resolution.map((r) => r.resolved).filter(Boolean)),
  )

  if (tablesToTruncate.length === 0) {
    console.log('No target tables found. Nothing to truncate.')
    process.exit(0)
  }

  console.log('Creating full SQL backup before reset...')
  const backup = await createSqlGzipBackup({
    backupDir: path.join(process.cwd(), 'backups'),
    reason: 'operational-data-reset',
    requestedByUserId: null,
  })
  console.log(`Backup created: ${backup.filePath}`)

  console.log('Truncating operational tables with RESTART IDENTITY CASCADE...')
  console.log('Note: PostgreSQL uses TRUNCATE ... CASCADE for FK-safe resets.')

  const quoted = tablesToTruncate.map((t) => `"${t}"`).join(', ')
  await db.query(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`)

  console.log('Running post-reset validation...')
  const validation = []
  for (const table of tablesToTruncate) {
    // eslint-disable-next-line no-await-in-loop
    const count = await fetchCount(table)
    validation.push({ table, count })
  }

  const failures = validation.filter((v) => v.count !== 0)

  console.log('\n=== Reset Summary ===')
  console.log(`Backup: ${backup.fileName}`)
  console.log(`Truncated tables (${tablesToTruncate.length}): ${tablesToTruncate.join(', ')}`)

  const skipped = resolution.filter((r) => !r.resolved).map((r) => r.requested)
  if (skipped.length) {
    console.log(`Skipped (not found): ${skipped.join(', ')}`)
  }

  if (failures.length) {
    console.error('Validation failed. Non-empty tables detected:')
    for (const f of failures) {
      console.error(` - ${f.table}: ${f.count}`)
    }
    process.exit(2)
  }

  console.log('Validation passed: all targeted operational tables are empty.')
  console.log('Preserved: roles, users, permissions, system/configuration tables.')
  process.exit(0)
}

main().catch((error) => {
  console.error('Operational reset failed:', error)
  process.exit(1)
})
