const fs = require('fs')
const path = require('path')
const db = require('../config/db')

function health(req, res) {
  res.json({ status: 'ok', service: 'masterauto-backend' })
}

function uploadsTest(req, res) {
  const uploadsPath = path.join(__dirname, '../../public/uploads/vehicles')

  try {
    const files = fs.readdirSync(uploadsPath)
    res.json({
      message: 'Uploads directory accessible',
      path: uploadsPath,
      files: files.filter((f) => !f.startsWith('.')),
    })
  } catch (error) {
    res.status(500).json({
      message: 'Error accessing uploads directory',
      error: error.message,
    })
  }
}

async function ready(req, res) {
  try {
    await db.query('SELECT 1 AS ok')

    const [dbNameRes, customersBayRes, apptDownPaymentMethodRes] = await Promise.all([
      db.query('SELECT current_database() AS name'),
      db.query(
        `SELECT 1 AS ok
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'customers'
           AND column_name = 'bay'
         LIMIT 1`,
      ),
      db.query(
        `SELECT 1 AS ok
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'appointments'
           AND column_name = 'down_payment_method'
         LIMIT 1`,
      ),
    ])

    let lastMigration = null
    try {
      const lastRes = await db.query(
        'SELECT filename, applied_at FROM schema_migrations ORDER BY applied_at DESC, filename DESC LIMIT 1',
      )
      if (lastRes.rows?.length) lastMigration = lastRes.rows[0]
    } catch {
      // schema_migrations table doesn't exist yet (migrations not run)
    }

    return res.json({
      status: 'ready',
      service: 'masterauto-backend',
      checks: {
        database: 'ok',
        db: {
          name: dbNameRes.rows?.[0]?.name || null,
        },
        schema: {
          customers_bay: Boolean(customersBayRes.rows?.length),
          appointments_down_payment_method: Boolean(apptDownPaymentMethodRes.rows?.length),
        },
        migrations: {
          last: lastMigration ? { filename: lastMigration.filename, applied_at: lastMigration.applied_at } : null,
        },
      },
    })
  } catch (error) {
    return res.status(503).json({
      status: 'not_ready',
      service: 'masterauto-backend',
      checks: {
        database: 'failed',
      },
      message: error.message,
    })
  }
}

module.exports = {
  health,
  ready,
  uploadsTest,
}
