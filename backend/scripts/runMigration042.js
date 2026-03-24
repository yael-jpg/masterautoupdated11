const path = require('path')
const fs   = require('fs')
require('dotenv').config({ path: path.resolve(__dirname, '../.env') })
const { Pool } = require('pg')

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     process.env.DB_PORT     || 5432,
  database: process.env.DB_NAME     || 'masterauto',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD || '',
})

async function run() {
  const sql = fs.readFileSync(
    path.resolve(__dirname, '../sql/migrations/042_seed_remaining_makes_models.sql'),
    'utf8'
  )
  const client = await pool.connect()
  try {
    console.log('Running migration 042 …')
    await client.query('BEGIN')
    await client.query(sql)
    await client.query('COMMIT')

    const { rows: mRows } = await client.query(
      `SELECT mk.name AS make, COUNT(vm.id) AS models
       FROM vehicle_makes mk
       LEFT JOIN vehicle_models vm ON vm.make_id = mk.id
       WHERE mk.is_active = TRUE
       GROUP BY mk.name ORDER BY mk.name`
    )
    console.log('\nModels per make:')
    mRows.forEach(r => console.log(`  ${r.make.padEnd(20)} ${r.models} model(s)`))

    const { rows: totals } = await client.query(
      `SELECT
        (SELECT COUNT(*) FROM vehicle_models)   AS models,
        (SELECT COUNT(*) FROM vehicle_variants) AS variants,
        (SELECT COUNT(*) FROM vehicle_years)    AS years`
    )
    const t = totals[0]
    console.log(`\nTotals → models: ${t.models}, variants: ${t.variants}, years: ${t.years}`)
    console.log('\nMigration 042 completed successfully.')
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('Migration failed, rolled back:', err.message)
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

run()
