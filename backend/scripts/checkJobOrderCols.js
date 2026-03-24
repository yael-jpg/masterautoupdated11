const db = require('../src/config/db')
db.query(`SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns WHERE table_name='job_orders' ORDER BY ordinal_position`)
  .then(r => { r.rows.forEach(x => console.log(x)); process.exit() })
  .catch(e => { console.error(e.message); process.exit(1) })
