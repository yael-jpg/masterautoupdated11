/*
Usage:
  node scripts/provisionPortalAccess.js <customerId>

Behavior:
- Loads the customer by id
- Requires a customer email
- Only provisions if portal_password_hash is currently NULL
- Generates a temporary password, stores bcrypt hash, emails the credentials
- Rolls back the hash if sending fails or is skipped
*/

const db = require('../src/config/db')
const bcrypt = require('bcryptjs')
const crypto = require('crypto')

const env = require('../src/config/env')
const mailer = require('../src/services/mailer')

function generateTemporaryPortalPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  const length = 10
  const bytes = crypto.randomBytes(length)
  let out = ''
  for (let i = 0; i < length; i += 1) out += alphabet[bytes[i] % alphabet.length]
  return out
}

function keyify(v) {
  return String(v || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

async function main() {
  const id = Number(process.argv[2])
  if (!id || Number.isNaN(id)) {
    console.error('Missing/invalid customerId. Usage: node scripts/provisionPortalAccess.js <customerId>')
    process.exitCode = 2
    return
  }

  const { rows } = await db.query(
    `SELECT id, full_name, email, mobile, customer_type, lead_source, portal_password_hash
     FROM customers
     WHERE id = $1`,
    [id],
  )

  if (!rows.length) {
    console.error('Customer not found:', id)
    process.exitCode = 3
    return
  }

  const c = rows[0]
  const email = String(c.email || '').trim()
  if (!email) {
    console.error('Customer has no email; cannot send portal access email.')
    process.exitCode = 4
    return
  }

  if (c.portal_password_hash) {
    console.error('Customer already has portal access (portal_password_hash is set). Not overwriting.')
    process.exitCode = 5
    return
  }

  if (!mailer.isEmailConfigured || !mailer.isEmailConfigured()) {
    console.error('Email is not configured; aborting (would create password with no delivery).')
    process.exitCode = 7
    return
  }

  const temporaryPassword = generateTemporaryPortalPassword()
  const passwordHash = await bcrypt.hash(temporaryPassword, 10)

  const upd = await db.query(
    `UPDATE customers
     SET portal_password_hash = $1
     WHERE id = $2 AND portal_password_hash IS NULL
     RETURNING id`,
    [passwordHash, c.id],
  )

  if (!upd.rows.length) {
    console.error('Portal access provisioning raced/failed; record was not updated.')
    process.exitCode = 8
    return
  }

  try {
    const res = await mailer.sendPortalAccessEmail({
      to: email,
      customerName: c.full_name,
      loginEmail: email,
      loginMobile: c.mobile,
      temporaryPassword,
      portalUrl: env.portalUrl,
    })

    if (res && res.skipped) {
      throw new Error('Portal access email skipped (email not configured)')
    }

    console.log('Portal access provisioned and email sent to:', email)
  } catch (e) {
    await db.query(
      `UPDATE customers SET portal_password_hash = NULL WHERE id = $1 AND portal_password_hash = $2`,
      [c.id, passwordHash],
    )

    const msg = e && e.message ? e.message : String(e)
    console.error('Failed to send portal access email. Rolled back hash. Error:', msg)
    process.exitCode = 9
  }
}

main()
  .catch((e) => {
    const msg = e && e.message ? e.message : String(e)
    console.error('Fatal error:', msg)
    process.exitCode = 1
  })
  .finally(async () => {
    try {
      await db.end()
    } catch (_) {
      // ignore
    }
  })
