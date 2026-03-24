const db = require('../src/config/db')

async function backfillPortalPreferredContactEmail() {
  const { rows } = await db.query(`
    UPDATE customers
    SET preferred_contact_method = 'Email'
    WHERE portal_password_hash IS NOT NULL
      AND COALESCE(preferred_contact_method, '') <> 'Email'
    RETURNING id, full_name, mobile, email, preferred_contact_method
  `)

  if (rows.length) {
    console.log(`Updated ${rows.length} portal customer(s) to preferred_contact_method = Email.`)
    console.table(rows.slice(0, 25))
    if (rows.length > 25) console.log(`(Showing first 25 of ${rows.length})`)
  } else {
    console.log('No portal customers needed backfill (already Email).')
  }

  process.exit(0)
}

backfillPortalPreferredContactEmail().catch((e) => {
  console.error(e)
  process.exit(1)
})
