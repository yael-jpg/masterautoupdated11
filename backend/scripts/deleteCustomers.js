const db = require('../src/config/db')

function parseArgs(argv) {
  const names = []
  const flags = {
    apply: false,
    contains: false,
    force: false,
    help: false,
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]

    if (arg === '--apply') {
      flags.apply = true
      continue
    }
    if (arg === '--contains') {
      flags.contains = true
      continue
    }
    if (arg === '--force') {
      flags.force = true
      continue
    }
    if (arg === '--help' || arg === '-h') {
      flags.help = true
      continue
    }

    if (arg.startsWith('-')) {
      throw new Error(`Unknown flag: ${arg}`)
    }

    names.push(arg)
  }

  return { names, flags }
}

function usage() {
  return [
    'Usage:',
    '  node scripts/deleteCustomers.js "Full Name" ["Another Name" ...] [--contains] [--apply] [--force]',
    '',
    'Default behavior is DRY-RUN (no deletes).',
    '',
    'Examples:',
    '  node scripts/deleteCustomers.js "Jan Leeius" "Chester"',
    '  node scripts/deleteCustomers.js "Chester" --contains',
    '  node scripts/deleteCustomers.js "Jan Leeius" "Chester" --apply',
  ].join('\n')
}

async function getRelatedCounts(customerId) {
  // Keep this resilient across schema drift: if any table/column is missing, skip counts.
  try {
    const res = await db.query(
      `SELECT
        (SELECT COUNT(*)::int FROM vehicles            WHERE customer_id = $1) AS vehicles,
        (SELECT COUNT(*)::int FROM sales               WHERE customer_id = $1) AS sales,
        (SELECT COUNT(*)::int FROM appointments        WHERE customer_id = $1) AS appointments,
        (SELECT COUNT(*)::int FROM customer_notes      WHERE customer_id = $1) AS notes,
        (SELECT COUNT(*)::int FROM customer_documents  WHERE customer_id = $1) AS documents`,
      [customerId],
    )
    return res.rows[0]
  } catch {
    return null
  }
}

async function safeDeleteByCustomerIds(table, customerIds) {
  try {
    const res = await db.query(
      `DELETE FROM ${table} WHERE customer_id = ANY($1::int[])`,
      [customerIds],
    )
    return res.rowCount
  } catch (err) {
    // If table doesn't exist in the current schema, ignore.
    if (String(err?.code) === '42P01') return null
    throw err
  }
}

async function main() {
  const { names, flags } = parseArgs(process.argv.slice(2))

  if (flags.help || names.length === 0) {
    console.log(usage())
    process.exit(names.length === 0 ? 1 : 0)
  }

  const matchList = []
  for (const rawName of names) {
    const pattern = flags.contains ? `%${rawName}%` : rawName
    const res = await db.query(
      'SELECT id, full_name, mobile, email, created_at FROM customers WHERE full_name ILIKE $1 ORDER BY created_at DESC, id DESC',
      [pattern],
    )

    if (res.rows.length === 0) {
      console.log(`No matches for: ${JSON.stringify(rawName)} (${flags.contains ? 'contains' : 'exact'} match)`) 
      continue
    }

    if (!flags.force && res.rows.length > 10) {
      console.log(`Too many matches for ${JSON.stringify(rawName)} (${res.rows.length}). Re-run with a more specific name, or add --force.`)
      continue
    }

    for (const row of res.rows) {
      const counts = await getRelatedCounts(row.id)
      matchList.push({ ...row, counts })
    }
  }

  if (matchList.length === 0) {
    console.log('No customers matched. Nothing to do.')
    return
  }

  console.log(`Matched ${matchList.length} customer(s):`)
  for (const c of matchList) {
    const counts = c.counts
      ? ` vehicles=${c.counts.vehicles} sales=${c.counts.sales} appointments=${c.counts.appointments} notes=${c.counts.notes} docs=${c.counts.documents}`
      : ''
    console.log(
      `- id=${c.id} name=${JSON.stringify(c.full_name)} mobile=${JSON.stringify(c.mobile)} email=${JSON.stringify(c.email)} created_at=${c.created_at}${counts}`,
    )
  }

  if (!flags.apply) {
    console.log('\nDRY-RUN only. To delete these customers, re-run with --apply.')
    return
  }

  const customerIds = [...new Set(matchList.map((c) => Number(c.id)).filter(Boolean))]

  console.log('\nDeleting...')
  await db.query('BEGIN')
  try {
    // Delete dependent/transactional rows first to avoid FK violations in environments
    // where ON DELETE CASCADE is not present for newer tables.
    const steps = [
      'job_orders',
      'quotations',
      'appointments',
      'sales',
      'vehicles',
      'customer_notes',
      'customer_documents',
    ]

    for (const table of steps) {
      const count = await safeDeleteByCustomerIds(table, customerIds)
      if (count === null) {
        console.log(`Skipped ${table} (table not found)`)
      } else {
        console.log(`Deleted ${count} row(s) from ${table}`)
      }
    }

    const delRes = await db.query('DELETE FROM customers WHERE id = ANY($1::int[]) RETURNING id, full_name', [customerIds])
    for (const row of delRes.rows) {
      console.log(`Deleted customer id=${row.id} (${JSON.stringify(row.full_name)})`)
    }

    const deletedIds = new Set(delRes.rows.map((r) => Number(r.id)))
    const missing = customerIds.filter((id) => !deletedIds.has(id))
    if (missing.length) {
      console.log(`Some customers were not deleted (missing?): ${missing.join(', ')}`)
    }

    await db.query('COMMIT')
  } catch (err) {
    await db.query('ROLLBACK')
    throw err
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error:', err?.message || err)
    console.error('\n' + usage())
    process.exit(1)
  })
