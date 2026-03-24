const path = require('path')
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
  const client = await pool.connect()
  try {
    // Demote admin@masterauto.com to Admin
    await client.query(`
      UPDATE users
      SET role_id = (SELECT id FROM roles WHERE name = 'Admin')
      WHERE email = 'admin@masterauto.com'
    `)

    const { rows } = await client.query(`
      SELECT u.full_name, u.email, r.name AS role
      FROM users u JOIN roles r ON r.id = u.role_id ORDER BY u.id
    `)
    console.log('Users:')
    rows.forEach(u => console.log(`  [${u.role}] ${u.full_name} <${u.email}>`))
  } finally {
    client.release()
    await pool.end()
  }
}

run().catch(console.error)
