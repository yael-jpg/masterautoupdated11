const db = require('../src/config/db')
db.query(`
  SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
  WHERE table_name = 'appointments' AND column_name LIKE 'down_payment%'
  ORDER BY ordinal_position
`).then(r => { r.rows.forEach(c => console.log(JSON.stringify(c))); process.exit(0) })
  .catch(e => { console.error(e.message); process.exit(1) })
