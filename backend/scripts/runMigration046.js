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
    path.resolve(__dirname, '../sql/migrations/046_two_roles_only.sql'),
    'utf8'
  )
  const client = await pool.connect()
  try {
    console.log('Running migration 046 — consolidate to SuperAdmin and Admin roles …')
    await client.query(sql)
    console.log('Migration 046 complete.')

    const { rows: roles } = await client.query(`SELECT id, name FROM roles ORDER BY id ASC`)
    console.log('\nRoles in database:')
    roles.forEach(r => console.log(`  id=${r.id}  name=${r.name}`))

    const { rows: users } = await client.query(
      `SELECT u.id, u.full_name, u.email, r.name AS role
       FROM users u JOIN roles r ON r.id = u.role_id ORDER BY u.id ASC`
    )
    console.log('\nUsers with updated roles:')
    users.forEach(u => console.log(`  [${u.role}] ${u.full_name} <${u.email}>`))

  } catch (err) {
    console.error('Migration failed:', err.message)
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

run()
