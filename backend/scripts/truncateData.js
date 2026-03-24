/**
 * truncateData.js
 * Clears all business/operational data from masterauto_db.
 * Preserves: users, roles, permissions, audit_logs (security/admin tables).
 * Run: node scripts/truncateData.js
 */
const { Pool } = require('pg')

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     Number(process.env.DB_PORT || 5432),
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD || 'admin123',
  database: process.env.DB_NAME     || 'masterauto_db',
})

async function main() {
  const client = await pool.connect()
  try {
    // List all public tables
    const { rows: tableRows } = await client.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
    )
    const allTables = tableRows.map(r => r.tablename)
    console.log('All tables:', allTables.join(', '))

    // Tables to KEEP (admin / security / configuration / vehicle reference data)
    const KEEP = new Set([
      // Admin & Security
      'users',
      'roles',
      'permissions',
      'role_permissions',
      'user_roles',
      'audit_logs',
      'activity_logs',

      // Configuration (Settings page)
      'configuration_settings',
      'config_change_logs',
      'configuration_audit_logs',
      'system_config',
      'notification_templates',

      // Vehicle registration — Make, Model, Variant reference tables
      'vehicle_makes',
      'vehicle_models',
      'vehicle_variants',
      'vehicle_years',

      // Service catalogue — reference data
      'services',
      'service_catalog',
    ])

    const toTruncate = allTables.filter(t => !KEEP.has(t))
    console.log('\nTables to truncate:', toTruncate.join(', '))

    const proceed = process.argv.includes('--confirm')
    if (!proceed) {
      console.log(
        '\n⚠  DRY RUN — no changes made.\n' +
        '   Run with --confirm to actually truncate:\n' +
        '   node scripts/truncateData.js --confirm'
      )
      return
    }

    // Truncate in one statement with CASCADE to handle FK constraints
    const quotedList = toTruncate.map(t => `"${t}"`).join(', ')
    await client.query(`TRUNCATE TABLE ${quotedList} RESTART IDENTITY CASCADE`)
    console.log(`\n✅ Truncated ${toTruncate.length} tables. Sequences reset.`)
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch(err => {
  console.error('Error:', err.message)
  process.exit(1)
})
