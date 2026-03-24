const db = require('../src/config/db')
db.query('SELECT category, key, value_type FROM system_config ORDER BY category, key')
  .then(r => {
    console.log('Rows:', r.rows.length)
    r.rows.forEach(x => console.log(x.category.padEnd(12), x.key.padEnd(38), x.value_type))
    process.exit(0)
  })
  .catch(e => { console.error(e.message); process.exit(1) })
