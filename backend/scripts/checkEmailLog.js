const db = require('../src/config/db')

async function check() {
  // Recent email attempts
  const { rows } = await db.query(
    `SELECT event_type, entity_id, recipient_email, status, error_message, sent_at
     FROM email_notifications
     ORDER BY sent_at DESC LIMIT 15`,
  )
  console.log('\n=== Recent email_notifications ===')
  if (rows.length === 0) {
    console.log('(no records — table may be empty)')
  } else {
    rows.forEach((r) => {
      console.log(`[${r.status}] ${r.event_type} #${r.entity_id} → ${r.recipient_email} | ${r.sent_at}${r.error_message ? ' | ERR: ' + r.error_message : ''}`)
    })
  }

  // Check latest quotation
  const { rows: quotes } = await db.query(
    `SELECT q.id, q.quotation_no, q.status, c.email AS customer_email, c.full_name
     FROM quotations q
     JOIN customers c ON c.id = q.customer_id
     ORDER BY q.id DESC LIMIT 5`,
  )
  console.log('\n=== Latest 5 quotations ===')
  quotes.forEach((q) => {
    console.log(`#${q.id} ${q.quotation_no} [${q.status}] customer: ${q.full_name} | email: ${q.customer_email || '(none)'}`)
  })

  process.exit(0)
}

check().catch((e) => { console.error(e.message); process.exit(1) })
