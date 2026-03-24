/**
 * Database audit script - checks existing tables and columns
 */
const db = require('../src/config/db')

async function audit() {
  // All tables
  const tables = await db.query(
    `SELECT table_name FROM information_schema.tables 
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
     ORDER BY table_name`
  )
  console.log('\n=== TABLES ===')
  console.log(tables.rows.map(t => t.table_name).join(', '))

  // Check columns for key tables
  const keyTables = [
    'quotations', 'sales', 'appointments', 'vehicles', 'users',
    'job_orders', 'inventory_items', 'customers', 'payments',
    'promo_codes', 'email_campaigns', 'customer_credits',
    'overpayment_resolutions', 'system_config', 'vehicle_makes',
    'vehicle_models', 'vehicle_variants'
  ]

  console.log('\n=== COLUMNS PER TABLE ===')
  for (const tbl of keyTables) {
    try {
      const cols = await db.query(
        `SELECT column_name, data_type FROM information_schema.columns 
         WHERE table_name = $1 AND table_schema = 'public'
         ORDER BY ordinal_position`,
        [tbl]
      )
      if (cols.rows.length === 0) {
        console.log(`${tbl}: *** TABLE MISSING ***`)
      } else {
        console.log(`${tbl}: ${cols.rows.map(c => c.column_name).join(', ')}`)
      }
    } catch (e) {
      console.log(`${tbl}: ERROR - ${e.message}`)
    }
  }

  // Check views
  const views = await db.query(
    `SELECT table_name FROM information_schema.views WHERE table_schema = 'public' ORDER BY table_name`
  )
  console.log('\n=== VIEWS ===')
  console.log(views.rows.map(v => v.table_name).join(', ') || '(none)')

  process.exit(0)
}

audit().catch(e => { console.error('Audit failed:', e.message); process.exit(1) })
