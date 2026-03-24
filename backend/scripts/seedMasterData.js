/**
 * seedMasterData.js
 * Re-seeds master data tables that are cleared by truncateData.js:
 *   payment_methods, discount_rules, staff_commissions, notification_templates
 *
 * Run: node scripts/seedMasterData.js
 */
const { Pool } = require('pg')

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     Number(process.env.DB_PORT || 5432),
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD || 'admin123',
  database: process.env.DB_NAME     || 'masterauto_db',
})

async function main() {
  const client = await pool.connect()
  try {
    // ── Payment Methods ──────────────────────────────────────────────────────
    await client.query(`
      INSERT INTO payment_methods (method_name, is_active) VALUES
        ('Cash',           TRUE),
        ('Credit Card',    TRUE),
        ('GCash/Maya',     TRUE),
        ('Bank Transfer',  TRUE)
      ON CONFLICT (method_name) DO NOTHING
    `)
    console.log('✅ payment_methods seeded')

    // ── Discount Rules ───────────────────────────────────────────────────────
    await client.query(`
      INSERT INTO discount_rules (rule_name, discount_type, value, requires_approval) VALUES
        ('VIP Loyalty',     'percent', 10,   FALSE),
        ('Corporate Fleet', 'percent',  8,   TRUE),
        ('Promo Voucher',   'fixed',   2000, TRUE)
      ON CONFLICT DO NOTHING
    `)
    console.log('✅ discount_rules seeded')

    // ── Staff Commissions ────────────────────────────────────────────────────
    await client.query(`
      INSERT INTO staff_commissions (staff_name, service_category, commission_percent) VALUES
        ('Team A', 'Ceramic Coating', 5),
        ('Team B', 'PPF',             7),
        ('Team C', 'Detailing',       4)
      ON CONFLICT DO NOTHING
    `)
    console.log('✅ staff_commissions seeded')

    // ── Notification Templates ───────────────────────────────────────────────
    await client.query(`
      INSERT INTO notification_templates (channel, template_name, message_template) VALUES
        ('SMS',      'Appointment Reminder',    'Hi {{name}}, reminder: your {{service}} is scheduled on {{date}}.'),
        ('Email',    'Vehicle Ready',           'Your vehicle is ready for pickup. Ref: {{referenceNo}}.'),
        ('WhatsApp', 'Post Service Follow-up',  'Thank you for choosing MasterAuto. How was your experience?')
      ON CONFLICT DO NOTHING
    `)
    console.log('✅ notification_templates seeded')

    // ── Summary ──────────────────────────────────────────────────────────────
    const { rows: pm   } = await client.query('SELECT COUNT(*) FROM payment_methods')
    const { rows: dr   } = await client.query('SELECT COUNT(*) FROM discount_rules')
    const { rows: sc   } = await client.query('SELECT COUNT(*) FROM staff_commissions')
    const { rows: nt   } = await client.query('SELECT COUNT(*) FROM notification_templates')
    console.log(`\n── Summary ─────────────────────────────`)
    console.log(`   payment_methods:       ${pm[0].count}`)
    console.log(`   discount_rules:        ${dr[0].count}`)
    console.log(`   staff_commissions:     ${sc[0].count}`)
    console.log(`   notification_templates:${nt[0].count}`)
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch(err => { console.error('❌', err.message); process.exit(1) })
