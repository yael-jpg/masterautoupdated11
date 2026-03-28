const { Client } = require('pg')

async function main() {
  const client = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'admin123',
    database: 'masterauto_db'
  })

  await client.connect()

  // Select last 10 customers
  const res = await client.query('SELECT id, full_name, mobile, created_at FROM customers ORDER BY created_at DESC LIMIT 20')
  console.log(JSON.stringify(res.rows, null, 2))

  await client.end()
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
