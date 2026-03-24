const db = require('../src/config/db')

async function fixSync() {
  // Catch up job orders whose appointment is already at Ready for Release / Paid / Released / Completed
  // but the JO is still stuck behind
  const { rows } = await db.query(`
    UPDATE job_orders jo
    SET    status = CASE
             WHEN a.status IN ('Released', 'Completed') THEN 'Released'
             ELSE 'Completed'
           END,
           previous_status = jo.status
    FROM appointments a
    WHERE jo.quotation_id = a.quotation_id
      AND jo.status NOT IN ('Cancelled', 'Released', 'Completed')
      AND a.status IN ('Ready for Release', 'Paid', 'Released', 'Completed')
    RETURNING jo.id, jo.job_order_no, jo.status AS new_status
  `)
  if (rows.length) {
    console.log('Fixed out-of-sync job orders:')
    console.table(rows)
  } else {
    console.log('No out-of-sync records found.')
  }
  process.exit()
}

fixSync().catch(e => { console.error(e.message); process.exit(1) })
