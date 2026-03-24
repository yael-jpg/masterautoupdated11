const db = require('../src/config/db')
const { sendReadyForReleaseEmail } = require('../src/services/mailer')

function printUsage() {
  console.log(`
Usage:
  npm run email:test-release -- --saleId 123
  npm run email:test-release -- --to customer@example.com --customerName "Juan Dela Cruz" --plateNumber ABC1234

Options:
  --saleId        Existing sale ID to load customer + vehicle snapshot
  --to            Recipient email (required if sale has no customer email)
  --customerName  Customer name
  --plateNumber   Vehicle plate number
  --make          Vehicle make
  --model         Vehicle model
  --year          Vehicle year
  --referenceNo   Sale reference number
  --help          Show this help message

Env fallbacks:
  TEST_RELEASE_TO
  TEST_RELEASE_CUSTOMER_NAME
  TEST_RELEASE_PLATE_NUMBER
  TEST_RELEASE_MAKE
  TEST_RELEASE_MODEL
  TEST_RELEASE_YEAR
  TEST_RELEASE_REFERENCE_NO
`)
}

function parseArgs(argv) {
  const parsed = {}

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]

    if (!token.startsWith('--')) {
      continue
    }

    const withoutPrefix = token.slice(2)

    if (withoutPrefix.includes('=')) {
      const [key, ...valueParts] = withoutPrefix.split('=')
      parsed[key] = valueParts.join('=')
      continue
    }

    const next = argv[index + 1]
    if (next && !next.startsWith('--')) {
      parsed[withoutPrefix] = next
      index += 1
    } else {
      parsed[withoutPrefix] = 'true'
    }
  }

  return parsed
}

async function loadSaleSnapshot(saleId) {
  const numericSaleId = Number(saleId)
  if (!Number.isInteger(numericSaleId) || numericSaleId <= 0) {
    throw new Error('Invalid --saleId. It must be a positive integer.')
  }

  const { rows } = await db.query(
    `SELECT s.reference_no,
            c.full_name AS customer_name,
            c.email AS customer_email,
            v.plate_number,
            v.make,
            v.model,
            v.year
     FROM sales s
     JOIN customers c ON c.id = s.customer_id
     JOIN vehicles v ON v.id = s.vehicle_id
     WHERE s.id = $1`,
    [numericSaleId],
  )

  if (!rows.length) {
    throw new Error(`Sale ${numericSaleId} not found.`)
  }

  return {
    to: rows[0].customer_email || '',
    customerName: rows[0].customer_name || '',
    plateNumber: rows[0].plate_number || '',
    make: rows[0].make || '',
    model: rows[0].model || '',
    year: rows[0].year || '',
    referenceNo: rows[0].reference_no || '',
  }
}

async function run() {
  const args = parseArgs(process.argv.slice(2))

  if (args.help === 'true') {
    printUsage()
    return
  }

  const payload = {
    to: args.to || process.env.TEST_RELEASE_TO || '',
    customerName: args.customerName || process.env.TEST_RELEASE_CUSTOMER_NAME || 'Client',
    plateNumber: args.plateNumber || process.env.TEST_RELEASE_PLATE_NUMBER || '',
    make: args.make || process.env.TEST_RELEASE_MAKE || '',
    model: args.model || process.env.TEST_RELEASE_MODEL || '',
    year: args.year || process.env.TEST_RELEASE_YEAR || '',
    referenceNo: args.referenceNo || process.env.TEST_RELEASE_REFERENCE_NO || '',
  }

  if (args.saleId) {
    const snapshot = await loadSaleSnapshot(args.saleId)
    Object.assign(payload, snapshot, {
      to: args.to || payload.to || snapshot.to,
      customerName: args.customerName || payload.customerName || snapshot.customerName,
      plateNumber: args.plateNumber || payload.plateNumber || snapshot.plateNumber,
      make: args.make || payload.make || snapshot.make,
      model: args.model || payload.model || snapshot.model,
      year: args.year || payload.year || snapshot.year,
      referenceNo: args.referenceNo || payload.referenceNo || snapshot.referenceNo,
    })
  }

  if (!payload.to) {
    throw new Error('Recipient email is required. Pass --to or use --saleId with a customer email.')
  }

  const result = await sendReadyForReleaseEmail(payload)

  if (result.skipped) {
    console.log('Email send skipped. Check SMTP settings in backend/.env (SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_FROM).')
    return
  }

  console.log(`Ready-for-release email sent to ${payload.to}`)
}

run()
  .catch((error) => {
    console.error('Release email test failed:', error.message)
    process.exitCode = 1
  })
  .finally(async () => {
    await db.pool.end().catch(() => {})
  })
