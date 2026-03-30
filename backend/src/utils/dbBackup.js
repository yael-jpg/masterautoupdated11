const fs = require('fs')
const path = require('path')
const zlib = require('zlib')
const { finished } = require('stream/promises')
const db = require('../config/db')

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
}

function safeFileStamp(date = new Date()) {
  // Windows-safe, filesystem-safe timestamp
  return date.toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', 'Z')
}

function quoteIdent(identifier) {
  // Identifiers come from information_schema, but still quote defensively.
  const s = String(identifier)
  return '"' + s.replace(/"/g, '""') + '"'
}

async function listPublicTables() {
  const { rows } = await db.query(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_type = 'BASE TABLE'
     ORDER BY table_name`,
  )
  return rows.map((r) => r.table_name)
}

async function createJsonGzipBackup({ backupDir, reason = 'manual', requestedByUserId = null } = {}) {
  const dir = backupDir || path.join(process.cwd(), 'backups')
  ensureDir(dir)

  const stamp = safeFileStamp(new Date())
  const fileName = `db-backup-${stamp}.json.gz`
  const filePath = path.join(dir, fileName)

  const gzip = zlib.createGzip({ level: 9 })
  const out = fs.createWriteStream(filePath)
  gzip.pipe(out)

  const tables = await listPublicTables()
  const meta = {
    generated_at: new Date().toISOString(),
    format: 'json.gz',
    reason,
    requested_by_user_id: requestedByUserId,
    tables,
  }

  // Stream a single JSON object to avoid holding the entire DB in memory.
  gzip.write('{"meta":')
  gzip.write(JSON.stringify(meta))
  gzip.write(',"tables":{')

  let first = true
  for (const table of tables) {
    if (!first) gzip.write(',')
    first = false

    gzip.write(JSON.stringify(table))
    gzip.write(':')

    // Note: This loads one table at a time into memory.
    // For very large tables, consider switching to pg streaming/cursor later.
    const { rows } = await db.query(`SELECT * FROM ${quoteIdent(table)}`)
    gzip.write(JSON.stringify(rows))
  }

  gzip.write('}}')
  gzip.end()
  await finished(out)

  const stats = fs.statSync(filePath)
  return {
    fileName,
    filePath,
    bytes: stats.size,
    createdAt: meta.generated_at,
    format: 'json.gz',
  }
}

module.exports = {
  createJsonGzipBackup,
}
