const fs = require('fs')
const path = require('path')
const zlib = require('zlib')
const { spawn } = require('child_process')
const { finished } = require('stream/promises')
const env = require('../config/env')

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
}

function safeFileStamp(date = new Date()) {
  // Windows-safe, filesystem-safe timestamp
  return date.toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', 'Z')
}

function buildPgDumpArgs() {
  // Produce plain SQL (schema + data). Keep it portable for restores.
  const common = ['--format=p', '--no-owner', '--no-privileges']

  if (env.dbUrl) {
    // Use DATABASE_URL directly.
    return ['--dbname', env.dbUrl, ...common]
  }

  return [
    '--host',
    String(env.dbHost || 'localhost'),
    '--port',
    String(env.dbPort || 5432),
    '--username',
    String(env.dbUser || 'postgres'),
    '--dbname',
    String(env.dbName || 'postgres'),
    ...common,
  ]
}

function getComposeFilePath() {
  // backend/src/utils -> repo root is ../../..
  return path.resolve(__dirname, '../../..', 'docker-compose.yml')
}

function buildDockerComposePgDumpArgs() {
  // Run pg_dump inside the docker-compose postgres service.
  // This is a dev-friendly fallback for Windows hosts without pg_dump installed.
  const composeFile = getComposeFilePath()
  const service = process.env.DOCKER_DB_SERVICE || 'postgres'
  const user = String(env.dbUser || 'postgres')
  const dbName = String(env.dbName || 'postgres')

  const pgDumpArgs = ['--format=p', '--no-owner', '--no-privileges', '--username', user, '--dbname', dbName]
  return {
    composeFile,
    args: ['compose', '-f', composeFile, 'exec', '-T', service, 'pg_dump', ...pgDumpArgs],
  }
}

function spawnPgDumpWithFallback({ pgDumpArgs, childEnv }) {
  return new Promise((resolve, reject) => {
    const tryNative = () => {
      const p = spawn('pg_dump', pgDumpArgs, {
        env: childEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      p.once('spawn', () => resolve(p))
      p.once('error', (e) => {
        if (String(e?.code || '').toUpperCase() === 'ENOENT') {
          return tryDocker()
        }
        reject(e)
      })
    }

    const tryDocker = () => {
      const { args } = buildDockerComposePgDumpArgs()
      const dockerEnv = { ...childEnv }
      if (env.dbPassword) dockerEnv.PGPASSWORD = String(env.dbPassword)

      const p = spawn('docker', args, {
        env: dockerEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      p.once('spawn', () => resolve(p))
      p.once('error', reject)
    }

    tryNative()
  })
}

async function createSqlGzipBackup({ backupDir, reason = 'manual', requestedByUserId = null } = {}) {
  const dir = backupDir || path.join(process.cwd(), 'backups')
  ensureDir(dir)

  const stamp = safeFileStamp(new Date())
  const fileName = `db-backup-${stamp}.sql.gz`
  const filePath = path.join(dir, fileName)

  const gzip = zlib.createGzip({ level: 9 })
  const out = fs.createWriteStream(filePath)

  const pgDumpArgs = buildPgDumpArgs()

  const childEnv = { ...process.env }
  // Prefer explicit DB_PASSWORD over URL-embedded password; pg_dump reads PGPASSWORD.
  if (!env.dbUrl && env.dbPassword) childEnv.PGPASSWORD = String(env.dbPassword)
  if (env.dbUrl && process.env.PGPASSWORD) {
    // if runtime already provided PGPASSWORD, keep it
  }

  let child
  try {
    child = await spawnPgDumpWithFallback({ pgDumpArgs, childEnv })
  } catch (e) {
    try { out.destroy() } catch { /* ignore */ }
    try { gzip.destroy() } catch { /* ignore */ }
    try { fs.unlinkSync(filePath) } catch { /* ignore */ }
    throw e
  }

  let stderr = ''
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString('utf8')
  })

  child.stdout.pipe(gzip).pipe(out)

  const exitCode = await new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('close', resolve)
  }).catch((e) => {
    try { out.destroy() } catch { /* ignore */ }
    try { gzip.destroy() } catch { /* ignore */ }
    try { fs.unlinkSync(filePath) } catch { /* ignore */ }
    throw e
  })

  await finished(out).catch(() => {})

  if (exitCode !== 0) {
    try { fs.unlinkSync(filePath) } catch { /* ignore */ }
    const hint = stderr && stderr.trim() ? stderr.trim() : 'pg_dump failed'
    const err = new Error(hint)
    err.code = 'PG_DUMP_FAILED'
    throw err
  }

  const stats = fs.statSync(filePath)
  return {
    fileName,
    filePath,
    bytes: stats.size,
    createdAt: new Date().toISOString(),
    format: 'sql.gz',
    reason,
    requestedByUserId,
  }
}

module.exports = {
  createSqlGzipBackup,
}
