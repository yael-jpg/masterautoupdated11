const db = require('../src/config/db')
db.query("ALTER TABLE appointments ADD COLUMN IF NOT EXISTS down_payment_status VARCHAR(20) NOT NULL DEFAULT 'pending'")
  .then(() => { console.log('Migration 055 applied.'); process.exit(0) })
  .catch(e => { console.error(e.message); process.exit(1) })
