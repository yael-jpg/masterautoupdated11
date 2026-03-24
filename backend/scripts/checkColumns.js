/**
 * Targeted column check - verifies exact columns used in routes exist in DB
 */
const db = require('../src/config/db')

async function cols(table) {
  const r = await db.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name=$1 AND table_schema='public'`,
    [table]
  )
  return new Set(r.rows.map(c => c.column_name))
}

async function run() {
  const issues = []

  const check = (table, col, existing) => {
    if (!existing.has(col)) issues.push(`MISSING: ${table}.${col}`)
  }

  // customers
  const cust = await cols('customers')
  check('customers', 'portal_password_hash', cust)
  check('customers', 'is_blocked', cust)
  check('customers', 'customer_type', cust)
  check('customers', 'lead_source', cust)
  console.log('customers:', [...cust].join(', '))

  // sales
  const sales = await cols('sales')
  check('sales', 'workflow_status', sales)
  check('sales', 'doc_type', sales)
  console.log('sales:', [...sales].join(', '))

  // appointments
  const appts = await cols('appointments')
  check('appointments', 'notes', appts)
  check('appointments', 'quotation_id', appts)
  console.log('appointments:', [...appts].join(', '))

  // vehicles  
  const vehs = await cols('vehicles')
  check('vehicles', 'body_type', vehs)
  check('vehicles', 'custom_make', vehs)
  console.log('vehicles:', [...vehs].join(', '))

  // services
  const svcs = await cols('services')
  check('services', 'materials_notes', svcs)
  console.log('services:', [...svcs].join(', '))

  // email_campaigns
  const ec = await cols('email_campaigns')
  check('email_campaigns', 'expires_at', ec)
  check('email_campaigns', 'auto_disable_after_expiry', ec)
  check('email_campaigns', 'cta_url', ec)
  console.log('email_campaigns (key cols):', ['expires_at','auto_disable_after_expiry','cta_url','show_promo_code'].filter(c=>ec.has(c)).join(', '))

  // promo_codes
  const pc = await cols('promo_codes')
  check('promo_codes', 'campaign_id', pc)
  console.log('promo_codes:', [...pc].join(', '))

  // quotations
  const quot = await cols('quotations')
  check('quotations', 'promo_code', quot)
  check('quotations', 'discount_amount', quot)
  check('quotations', 'coating_process', quot)
  check('quotations', 'vehicle_size', quot)
  console.log('quotations:', [...quot].join(', '))

  // job_orders
  const jo = await cols('job_orders')
  check('job_orders', 'quotation_id', jo)
  check('job_orders', 'schedule_id', jo)
  console.log('job_orders (key cols):', ['quotation_id','schedule_id','assigned_installers','cancel_reason'].filter(c=>jo.has(c)).join(', '))

  // Check views exist
  const views = ['sale_financial_summary','quotation_payment_summary','workflow_role_permissions','inventory_stock_status','installer_commission_summary']
  for (const v of views) {
    const r = await db.query(`SELECT 1 FROM information_schema.views WHERE table_name=$1 AND table_schema='public'`,[v])
    if (!r.rows.length) issues.push(`MISSING VIEW: ${v}`)
    else console.log(`view ${v}: OK`)
  }

  // Verify the views actually query without error
  for (const v of views) {
    try {
      await db.query(`SELECT * FROM ${v} LIMIT 0`)
      console.log(`view ${v} queryable: OK`)
    } catch(e) {
      issues.push(`VIEW BROKEN: ${v} - ${e.message}`)
    }
  }

  console.log('\n=== ISSUES FOUND ===')
  if (issues.length === 0) console.log('None! All checks passed.')
  else issues.forEach(i => console.log(' ❌', i))

  process.exit(0)
}

run().catch(e => { console.error(e.message); process.exit(1) })
