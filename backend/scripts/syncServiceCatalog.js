/*
  Sync the frontend SERVICE_CATALOG into the database `services` table.

  Why:
  - The Guest /api/public/services endpoint reads from Postgres.
  - The frontend also has a richer in-code SERVICE_CATALOG used for pricing/scheduling.
  - This script inserts missing catalog services into Postgres so they appear on /guest.

  Usage (PowerShell):
    Set-Location backend
    $env:DATABASE_URL="postgresql://..."; npm run sync:services-catalog

  Notes:
  - Inserts are idempotent (ON CONFLICT DO NOTHING).
  - Codes are stored as: CAT-<CATALOG_CODE_UPPERCASE> (e.g. CAT-PPF-BASIC)
*/

const path = require('path')
const { pathToFileURL } = require('url')

require('../src/config/env')
const db = require('../src/config/db')

function computeBasePrice(sizePrices) {
  if (!sizePrices || typeof sizePrices !== 'object') return 0
  const prices = Object.values(sizePrices)
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n) && n > 0)
  return prices.length ? Math.max(...prices) : 0
}

async function loadServiceCatalog() {
  const catalogPath = path.resolve(__dirname, '../../frontend/src/data/serviceCatalog.js')
  const mod = await import(pathToFileURL(catalogPath).href)
  const svc = mod?.SERVICE_CATALOG
  if (!Array.isArray(svc)) {
    throw new Error('SERVICE_CATALOG not found or not an array')
  }
  return svc
}

async function main() {
  const catalog = await loadServiceCatalog()

  const client = await db.pool.connect()
  try {
    await client.query('BEGIN')

    let inserted = 0
    for (const entry of catalog) {
      const codeRaw = String(entry?.code || '').trim()
      const name = String(entry?.name || '').trim()
      const category = String(entry?.group || '').trim()

      if (!codeRaw || !name || !category) continue

      const code = `CAT-${codeRaw.toUpperCase()}`
      const basePrice = computeBasePrice(entry?.sizePrices)

      // base_price is NOT NULL in schema; ensure we always insert something.
      const safeBasePrice = basePrice > 0 ? basePrice : 1

      const result = await client.query(
        `INSERT INTO services (code, name, category, base_price, description, materials_notes, is_active)
         VALUES ($1, $2, $3, $4, NULL, NULL, TRUE)
         ON CONFLICT (code) DO NOTHING`,
        [code, name, category, safeBasePrice],
      )

      inserted += result.rowCount || 0
    }

    await client.query('COMMIT')
    console.log(`Synced services catalog. Inserted: ${inserted}. Total catalog entries: ${catalog.length}.`) 
  } catch (err) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // ignore
    }

    // Common bootstrap issue
    if (/relation\s+"?services"?\s+does not exist/i.test(String(err?.message || ''))) {
      console.error('ERROR: services table not found. Run: npm run db:schema (against your DATABASE_URL)')
    }

    throw err
  } finally {
    client.release()
    // Ensure we close pool so the process exits
    await db.pool.end().catch(() => {})
  }
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
