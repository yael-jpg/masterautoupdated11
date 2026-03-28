/**
 * Purge demo/seed customers and all related rows.
 *
 * Designed for Neon/PostgreSQL.
 * Safe by default: dry-run unless you pass `--yes`.
 *
 * Usage:
 *   # Dry-run (shows what would be deleted)
 *   node scripts/purgeSeedCustomers.js
 *
 *   # Actually delete
 *   node scripts/purgeSeedCustomers.js --yes
 *
 *   # Custom emails
 *   node scripts/purgeSeedCustomers.js --emails a@b.com,c@d.com --yes
 */

const db = require('../src/config/db')

const DEFAULT_EMAILS = ['juan@email.com', 'ops@megafleet.ph', 'maria@email.com']

function parseArgs(argv) {
  const args = { yes: false, emails: null }
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i]
    if (token === '--yes') {
      args.yes = true
      continue
    }

    if (token === '--emails') {
      const raw = argv[i + 1]
      i += 1
      args.emails = raw
        ? raw
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : []
      continue
    }

    if (token.startsWith('--emails=')) {
      const raw = token.slice('--emails='.length)
      args.emails = raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    }
  }
  return args
}

async function tableExists(client, tableName) {
  const res = await client.query(
    `SELECT 1
     FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1
     LIMIT 1`,
    [tableName]
  )
  return res.rowCount > 0
}

async function safeSelectIds(client, sql, params) {
  try {
    const res = await client.query(sql, params)
    return res.rows.map((r) => r.id).filter((v) => v !== null && v !== undefined)
  } catch (e) {
    return []
  }
}

async function safeDelete(client, tableName, whereSql, params, { dryRun }) {
  if (!(await tableExists(client, tableName))) return 0
  const sql = `DELETE FROM ${tableName} WHERE ${whereSql}`

  if (dryRun) {
    const countRes = await client.query(`SELECT COUNT(*)::int AS count FROM ${tableName} WHERE ${whereSql}`, params)
    return countRes.rows?.[0]?.count ?? 0
  }

  const res = await client.query(sql, params)
  return res.rowCount
}

async function purgeSeedCustomers({ emails, dryRun }) {
  const client = await db.pool.connect()
  try {
    await client.query('BEGIN')

    const customerIds = await safeSelectIds(
      client,
      'SELECT id FROM customers WHERE email = ANY($1::text[])',
      [emails]
    )

    if (customerIds.length === 0) {
      await client.query('ROLLBACK')
      console.log('No matching customers found for emails:', emails.join(', '))
      return
    }

    const vehicleIds = await safeSelectIds(
      client,
      'SELECT id FROM vehicles WHERE customer_id = ANY($1::int[])',
      [customerIds]
    )

    const saleIds = await safeSelectIds(
      client,
      'SELECT id FROM sales WHERE customer_id = ANY($1::int[]) OR vehicle_id = ANY($2::int[])',
      [customerIds, vehicleIds.length ? vehicleIds : [-1]]
    )

    const summary = []
    const del = async (table, where, params) => {
      const count = await safeDelete(client, table, where, params, { dryRun })
      summary.push({ table, count })
    }

    // Delete in FK-safe order
    if (saleIds.length) {
      await del('payments', 'sale_id = ANY($1::int[])', [saleIds])
      await del('sale_items', 'sale_id = ANY($1::int[])', [saleIds])
      await del('vehicle_photos', 'sale_id = ANY($1::int[])', [saleIds])
      await del('vehicle_service_records', 'sale_id = ANY($1::int[])', [saleIds])
    }

    if (vehicleIds.length) {
      await del('vehicle_photos', 'vehicle_id = ANY($1::int[])', [vehicleIds])
      await del('vehicle_service_records', 'vehicle_id = ANY($1::int[])', [vehicleIds])
    }

    await del('appointments', 'customer_id = ANY($1::int[]) OR vehicle_id = ANY($2::int[])', [
      customerIds,
      vehicleIds.length ? vehicleIds : [-1],
    ])

    if (saleIds.length) {
      await del('sales', 'id = ANY($1::int[])', [saleIds])
    }

    if (vehicleIds.length) {
      await del('vehicles', 'id = ANY($1::int[])', [vehicleIds])
    }

    await del('customer_notes', 'customer_id = ANY($1::int[])', [customerIds])
    await del('customer_documents', 'customer_id = ANY($1::int[])', [customerIds])

    // Also remove any guest quotation requests from these demo emails
    await del('online_quotation_requests', 'email = ANY($1::text[])', [emails])

    await del('customers', 'id = ANY($1::int[])', [customerIds])

    if (dryRun) {
      await client.query('ROLLBACK')
    } else {
      await client.query('COMMIT')
    }

    console.log(dryRun ? '\nDRY RUN (no changes applied)' : '\nDELETED')
    console.log('Target emails:', emails.join(', '))
    console.table(summary.filter((s) => s.count > 0))
  } catch (e) {
    try {
      await client.query('ROLLBACK')
    } catch (_) {
      // ignore
    }
    throw e
  } finally {
    client.release()
  }
}

async function main() {
  const args = parseArgs(process.argv)
  const emails = (args.emails && args.emails.length ? args.emails : DEFAULT_EMAILS).map((e) => e.toLowerCase())
  const dryRun = !args.yes

  await purgeSeedCustomers({ emails, dryRun })
  await db.pool.end()
}

main().catch((e) => {
  console.error('Purge failed:', e.message)
  process.exit(1)
})
