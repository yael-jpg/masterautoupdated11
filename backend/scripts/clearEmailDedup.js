const db = require('../src/config/db')

async function main() {
  const { rowCount } = await db.query(
    "DELETE FROM email_notifications WHERE event_type = 'quotation_approved'"
  )
  console.log(`Cleared ${rowCount} dedup record(s) — quotation approval emails will now re-send.`)
  process.exit(0)
}

main().catch((e) => { console.error(e.message); process.exit(1) })
