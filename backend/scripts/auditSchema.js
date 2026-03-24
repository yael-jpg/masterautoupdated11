const db = require('../src/config/db')
async function audit() {
  for (const table of ['quotations','appointments','job_orders']) {
    const { rows } = await db.query(
      `SELECT column_name, data_type, column_default
       FROM information_schema.columns WHERE table_name=$1 ORDER BY ordinal_position`, [table])
    console.log(`\n=== ${table} ===`)
    console.table(rows.map(r => ({ col: r.column_name, type: r.data_type, default: r.column_default })))
  }
  process.exit()
}
audit().catch(e => { console.error(e.message); process.exit(1) })
