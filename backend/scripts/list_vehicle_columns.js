const db = require('../src/config/db')

async function run() {
  try {
    const res = await db.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='vehicles' ORDER BY ordinal_position")
    console.log('columns:', res.rows.map(r => r.column_name))
    process.exit(0)
  } catch (err) {
    console.error('error querying columns:', err.message || err)
    process.exit(2)
  }
}

run()
