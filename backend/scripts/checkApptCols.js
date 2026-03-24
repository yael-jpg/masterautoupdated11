const db = require('../src/config/db')
db.query("SELECT column_name FROM information_schema.columns WHERE table_name='appointments' ORDER BY ordinal_position")
  .then(r => { console.log(r.rows.map(x => x.column_name).join(', ')); process.exit() })
  .catch(e => { console.error(e.message); process.exit(1) })
