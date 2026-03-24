/**
 * Run migration 041: vehicle_models/variants schema upgrades + vehicle_years table + seed data
 * Usage: node scripts/runMigration041.js
 */
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
  const sqlFile = path.resolve(__dirname, '../sql/migrations/041_vehicle_models_variants_years.sql')
  const sql = fs.readFileSync(sqlFile, 'utf8')

  const client = await pool.connect()
  try {
    console.log('Running migration 041 …')
    await client.query('BEGIN')
    await client.query(sql)
    await client.query('COMMIT')

    // Quick summary
    const { rows: mRows } = await client.query(
      `SELECT vm.name AS model, mk.name AS make
       FROM vehicle_models vm JOIN vehicle_makes mk ON mk.id = vm.make_id
       ORDER BY mk.name, vm.name`
    )
    console.log(`\n✅ vehicle_models seeded: ${mRows.length} total`)
    mRows.forEach(r => console.log(`   ${r.make} → ${r.model}`))

    const { rows: vRows } = await client.query(
      'SELECT COUNT(*) AS cnt FROM vehicle_variants'
    )
    console.log(`\n✅ vehicle_variants total: ${vRows[0].cnt}`)

    const { rows: yRows } = await client.query(
      'SELECT COUNT(*) AS cnt FROM vehicle_years'
    )
    console.log(`✅ vehicle_years total:    ${yRows[0].cnt}`)

    console.log('\nMigration 041 completed successfully.')
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
