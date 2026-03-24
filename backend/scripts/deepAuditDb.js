/**
 * Deep column audit - cross-references code references against live DB schema
 */
const db = require('../src/config/db')
const fs = require('fs')
const path = require('path')

async function getColumns(table) {
  const r = await db.query(
    `SELECT column_name FROM information_schema.columns 
     WHERE table_name = $1 AND table_schema = 'public' ORDER BY ordinal_position`,
    [table]
  )
  return r.rows.map(c => c.column_name)
}

async function tableExists(table) {
  const r = await db.query(
    `SELECT 1 FROM information_schema.tables WHERE table_name=$1 AND table_schema='public'`,
    [table]
  )
  return r.rows.length > 0
}

async function run() {
  console.log('\n=== MISSING MIGRATIONS CHECK ===')

  // Migration 051: portal_password_hash on customers, notes on appointments
  const custCols = await getColumns('customers')
  const apptCols = await getColumns('appointments')
  console.log('customers.portal_password_hash:', custCols.includes('portal_password_hash') ? 'EXISTS' : 'MISSING *** RUN 051 ***')
  console.log('appointments.notes:', apptCols.includes('notes') ? 'EXISTS' : 'MISSING *** RUN 051 ***')

  // Sales table checks
  const salesCols = await getColumns('sales')
  console.log('\nsales columns:', salesCols.join(', '))
  console.log('sales.quotation_id:', salesCols.includes('quotation_id') ? 'EXISTS' : 'MISSING')
  console.log('sales.workflow_status:', salesCols.includes('workflow_status') ? 'EXISTS' : 'MISSING')

  // Vehicles checks
  const vehCols = await getColumns('vehicles')
  console.log('\nvehicles.body_type:', vehCols.includes('body_type') ? 'EXISTS' : 'MISSING')
  console.log('vehicles.custom_make:', vehCols.includes('custom_make') ? 'EXISTS' : 'MISSING')

  // Users checks
  const userCols = await getColumns('users')
  console.log('\nusers columns:', userCols.join(', '))
  console.log('users.role (direct):', userCols.includes('role') ? 'EXISTS' : 'NOT PRESENT (uses role_id FK)')

  // Portal tables check
  const portalTables = ['customer_portal_sessions', 'portal_bookings']
  for (const t of portalTables) {
    const exists = await tableExists(t)
    console.log(`\n${t}:`, exists ? 'EXISTS' : 'MISSING')
  }

  // Check portal route for what it needs
  const portalRouteFile = path.resolve(__dirname, '../src/routes/portal.js')
  if (fs.existsSync(portalRouteFile)) {
    const content = fs.readFileSync(portalRouteFile, 'utf8')
    // Look for table references
    const tableRefs = [...new Set([...content.matchAll(/FROM\s+(\w+)|JOIN\s+(\w+)|INTO\s+(\w+)|UPDATE\s+(\w+)/gi)].map(m => m[1]||m[2]||m[3]||m[4]).filter(Boolean))]
    console.log('\nPortal route references tables:', tableRefs.join(', '))
    for (const t of tableRefs) {
      if (t.toLowerCase() === 'set') continue
      const exists = await tableExists(t.toLowerCase())
      if (!exists) console.log(`  *** MISSING TABLE: ${t} ***`)
    }
  }

  // Check configRoutes
  const configRouteFile = path.resolve(__dirname, '../src/routes/configRoutes.js')
  if (fs.existsSync(configRouteFile)) {
    const content = fs.readFileSync(configRouteFile, 'utf8')
    const tableRefs = [...new Set([...content.matchAll(/FROM\s+(\w+)|JOIN\s+(\w+)|INTO\s+(\w+)|UPDATE\s+(\w+)/gi)].map(m => m[1]||m[2]||m[3]||m[4]).filter(Boolean))]
    console.log('\nConfigRoutes references tables:', tableRefs.join(', '))
    for (const t of tableRefs) {
      if (t.toLowerCase() === 'set') continue
      const exists = await tableExists(t.toLowerCase())
      if (!exists) console.log(`  *** MISSING TABLE: ${t} ***`)
    }
  }

  // Check all routes for column references that look suspicious
  console.log('\n=== CHECKING ALL ROUTE FILES FOR MISSING TABLE REFERENCES ===')
  const routesDir = path.resolve(__dirname, '../src/routes')
  const files = fs.readdirSync(routesDir).filter(f => f.endsWith('.js'))
  for (const file of files) {
    const content = fs.readFileSync(path.join(routesDir, file), 'utf8')
    const tableRefs = [...new Set([...content.matchAll(/FROM\s+([a-z_][a-z0-9_]*)\b|JOIN\s+([a-z_][a-z0-9_]*)\b|INTO\s+([a-z_][a-z0-9_]*)\b|UPDATE\s+([a-z_][a-z0-9_]*)\b/gi)].map(m => (m[1]||m[2]||m[3]||m[4]||'').toLowerCase()).filter(t => t && t !== 'set' && t !== 'select' && t !== 'where'))]
    const missing = []
    for (const t of tableRefs) {
      const exists = await tableExists(t)
      if (!exists) missing.push(t)
    }
    if (missing.length > 0) {
      console.log(`${file}: MISSING TABLES => ${missing.join(', ')}`)
    }
  }
  console.log('Route scan complete.')

  process.exit(0)
}

run().catch(e => { console.error('Audit failed:', e.message, e.stack); process.exit(1) })
