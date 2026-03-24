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
    path.resolve(__dirname, '../sql/migrations/048_seed_inventory_items.sql'),
    'utf8'
  )
  const client = await pool.connect()
  try {
    console.log('Running migration 048 — seed initial inventory items …')
    await client.query(sql)
    console.log('Migration 048 complete.')

    const { rows } = await client.query(
      `SELECT sku, name, category, qty_on_hand FROM inventory_items ORDER BY sku ASC`
    )
    console.log('\nCurrent inventory_items:')
    rows.forEach(r => console.log(`  [${r.sku}] ${r.name} (${r.category}) — qty: ${r.qty_on_hand}`))
  } finally {
    client.release()
    await pool.end()
  }
}

run().catch(err => { console.error(err); process.exit(1) })
