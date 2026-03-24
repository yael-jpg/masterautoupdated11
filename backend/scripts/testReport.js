const db = require('../src/config/db')

async function test() {
  try {
    const r1 = await db.query(
      "SELECT COALESCE(SUM(total_amount), 0) AS total FROM quotations WHERE status NOT IN ('Not Approved')"
    )
    console.log('Total quotation amount:', r1.rows[0].total)

    const r2 = await db.query(
      `SELECT COALESCE(svc->>'name','Custom') AS service_package,
              COALESCE(SUM((svc->>'total')::NUMERIC), 0) AS total
       FROM quotations q,
            jsonb_array_elements(q.services) AS svc
       WHERE q.status NOT IN ('Not Approved')
       GROUP BY svc->>'name'
       ORDER BY total DESC
       LIMIT 5`
    )
    console.log('By service:', JSON.stringify(r2.rows))

    const r3 = await db.query(
      `SELECT COALESCE(SUM(outstanding_balance), 0) AS outstanding
       FROM quotation_payment_summary`
    )
    console.log('Outstanding:', r3.rows[0].outstanding)
  } catch (e) {
    console.error('ERROR:', e.message)
  }
  process.exit(0)
}

test()
