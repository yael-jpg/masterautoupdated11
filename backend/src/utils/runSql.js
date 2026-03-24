const fs = require('fs')
const path = require('path')
const db = require('../config/db')

async function run() {
  const fileArg = process.argv[2]
  if (!fileArg) {
    throw new Error('Please provide a SQL file path, e.g. sql/schema.sql')
  }

  const absolutePath = path.resolve(process.cwd(), fileArg)
  const sql = fs.readFileSync(absolutePath, 'utf8')
  await db.pool.query(sql)
  console.log(`Executed SQL file: ${fileArg}`)
  await db.pool.end()
}

run().catch(async (error) => {
  console.error(error)
  await db.pool.end()
  process.exit(1)
})
