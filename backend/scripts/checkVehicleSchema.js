const db = require('../src/config/db')
async function main() {
  const m = await db.query("SELECT column_name FROM information_schema.columns WHERE table_name='vehicle_models' ORDER BY ordinal_position")
  console.log('vehicle_models:', m.rows.map(r=>r.column_name).join(', '))
  const v = await db.query("SELECT column_name FROM information_schema.columns WHERE table_name='vehicle_variants' ORDER BY ordinal_position")
  console.log('vehicle_variants:', v.rows.map(r=>r.column_name).join(', '))
  const y = await db.query("SELECT to_regclass('vehicle_years') AS t")
  console.log('vehicle_years exists:', y.rows[0].t)
  await db.pool.end()
}
main().catch(e => { console.error(e.message); process.exit(1) })
