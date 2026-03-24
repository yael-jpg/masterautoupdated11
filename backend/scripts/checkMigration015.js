const db = require('../src/config/db')
async function main() {
  const a = await db.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name='job_orders' AND column_name IN ('in_progress_at','for_qa_at','completed_at','released_at','previous_status')"
  )
  console.log('job_orders new cols:', a.rows.map(r => r.column_name).join(', '))
  const b = await db.query("SELECT to_regclass('public.status_transitions') AS t")
  console.log('status_transitions table exists:', b.rows[0].t)
  await db.pool.end()
}
main().catch(e => { console.error(e.message); process.exit(1) })
