const db = require('../src/config/db')
db.query("SELECT a.id, a.status, a.quotation_id, a.booking_source, q.status as q_status FROM appointments a LEFT JOIN quotations q ON q.id=a.quotation_id WHERE a.id=15")
  .then(r => { console.log(JSON.stringify(r.rows[0], null, 2)); process.exit() })
  .catch(e => { console.error(e.message); process.exit(1) })
