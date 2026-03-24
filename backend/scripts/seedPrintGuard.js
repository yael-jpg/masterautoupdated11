const db = require('../src/config/db')

async function run() {
  await db.query(`
    INSERT INTO configuration_settings (category, "key", value, description, data_type, is_editable)
    VALUES (
      'payment',
      'require_downpayment_before_print',
      'true',
      'Require at least 50% payment before the Print button is enabled on Job Orders',
      'boolean',
      true
    )
    ON CONFLICT (category, "key") DO UPDATE SET value = 'true'
  `)
  console.log('require_downpayment_before_print seeded with value: true')
  process.exit(0)
}

run().catch((e) => { console.error(e.message); process.exit(1) })
