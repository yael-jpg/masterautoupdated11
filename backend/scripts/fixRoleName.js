const db = require('../src/config/db')

async function run() {
  // Fix role name: 'Super Admin' → 'SuperAdmin' to match all requireRole() calls
  const result = await db.query(
    "UPDATE roles SET name = 'SuperAdmin' WHERE name = 'Super Admin' RETURNING id, name"
  )
  if (result.rows.length > 0) {
    console.log('✓ Role renamed:', result.rows[0].id, result.rows[0].name)
  } else {
    console.log('No change — role may already be correct')
  }

  // Show current roles
  const roles = await db.query('SELECT id, name FROM roles ORDER BY id')
  console.log('\nCurrent roles:')
  roles.rows.forEach(r => console.log(' ', r.id, r.name))

  process.exit(0)
}

run().catch(e => { console.error(e.message); process.exit(1) })
