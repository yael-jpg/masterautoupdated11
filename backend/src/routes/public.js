/**
 * /api/public/* — Public endpoints used by the guest online quotation page.
 *
 * These are intentionally unauthenticated and should only expose safe, read-only
 * data required to browse services and vehicle make/model lists.
 */

const express = require('express')
const db = require('../config/db')
const { asyncHandler } = require('../utils/asyncHandler')
const ConfigurationService = require('../services/configurationService')
const mailer = require('../services/mailer')
const {
  buildQuotationRequestReceivedEmail,
  buildQuotationRequestStaffEmail,
} = require('../services/emailTemplates')

const router = express.Router()

// ── Helpers ────────────────────────────────────────────────────────────────

const BRANCH_CODES = { cubao: 'CBO', manila: 'MNL' }
function getBranchCode(bay) {
  if (!bay) return 'BR'
  const raw = String(bay || '').toLowerCase().trim()
  return BRANCH_CODES[raw] || String(bay || '').substring(0, 3).toUpperCase()
}

function normalizePlate(raw) {
  return String(raw || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

function normalizeMobile(raw) {
  return String(raw || '').replace(/\D/g, '')
}

function makeTempPlate() {
  const stamp = Date.now().toString(36).toUpperCase()
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `TMP${stamp}${rand}`
}

async function nextQuotationNo(client, branchCode = 'BR') {
  const year = new Date().getFullYear()
  const yearShort = String(year).slice(-3)
  const prefix = `QT-${branchCode}-${yearShort}-`
  const { rows } = await client.query(
    `SELECT quotation_no FROM quotations
     WHERE quotation_no LIKE $1
     ORDER BY quotation_no DESC LIMIT 1`,
    [`${prefix}%`],
  )
  const last = rows[0]?.quotation_no
  const seq = last ? parseInt(last.split('-')[3], 10) + 1 : 1
  return `${prefix}${String(seq).padStart(4, '0')}`
}

// GET /api/public/services — active services list
router.get(
  '/services',
  asyncHandler(async (_req, res) => {
    const { rows } = await db.query(
      `SELECT id, code, name, category, base_price, description, materials_notes
       FROM services
       WHERE COALESCE(is_active, TRUE) = TRUE
       ORDER BY name ASC`,
    )
    return res.json(rows)
  }),
)

// GET /api/public/branch-locations — configured branches list for guest quotation dropdown
router.get(
  '/branch-locations',
  asyncHandler(async (_req, res) => {
    // Stored under booking.branch_locations as JSON array (migration 043)
    let value = await ConfigurationService.get('booking', 'branch_locations')

    if (typeof value === 'string') {
      const s = value.trim()
      if (s) {
        try {
          value = JSON.parse(s)
        } catch {
          // Fallback: allow newline/comma separated
          value = s.split(/\r?\n|,/).map((x) => x.trim()).filter(Boolean)
        }
      }
    }

    if (!Array.isArray(value)) {
      return res.json(['Cubao', 'Manila'])
    }

    const cleaned = value
      .map((x) => String(x || '').trim())
      .filter(Boolean)

    return res.json(cleaned.length ? cleaned : ['Cubao', 'Manila'])
  }),
)

// POST /api/public/quotation-requests — guest online quotation request
// Creates a real quotation row (status Pending) so it appears in staff Quotations page.
router.post(
  '/quotation-requests',
  asyncHandler(async (req, res) => {
    const {
      fullName,
      mobile,
      email,
      branch,
      vehicleMake,
      vehicleModel,
      vehicleSize,
      serviceId,
      preferredDate,
      endDate,
      notes,
      unitPrice,
      vehiclePlate,
    } = req.body || {}

    const cleanName = String(fullName || '').trim()
    const cleanMobile = normalizeMobile(mobile)
    const cleanEmail = String(email || '').trim() || null
    const cleanBranch = String(branch || '').trim() || null
    const cleanMake = String(vehicleMake || '').trim()
    const cleanModel = String(vehicleModel || '').trim()
    const cleanSize = String(vehicleSize || 'medium').trim()

    if (!cleanName) return res.status(400).json({ message: 'Full name is required' })
    if (!cleanMobile) return res.status(400).json({ message: 'Mobile number is required' })
    if (cleanMobile.length !== 11) return res.status(400).json({ message: 'Mobile number must contain exactly 11 digits' })
    if (!cleanMake) return res.status(400).json({ message: 'Vehicle make is required' })

    // Resolve service (optional)
    let selectedService = null
    if (serviceId) {
      if (!isNaN(serviceId)) {
        // Search by numeric ID
        const { rows } = await db.query(
          `SELECT id, code, name, category, base_price, description, is_active
           FROM services
           WHERE id = $1`,
          [Number(serviceId)],
        )
        if (rows.length && (rows[0].is_active === undefined || rows[0].is_active === true)) {
          selectedService = rows[0]
        }
      } else {
        // Search by code (e.g. 'ppf-basic' or 'CAT-PPF-BASIC')
        const normalizedCode = String(serviceId).startsWith('CAT-') ? serviceId.toUpperCase() : ('CAT-' + serviceId).toUpperCase()
        const { rows } = await db.query(
          `SELECT id, code, name, category, base_price, description, is_active
           FROM services
           WHERE code = $1`,
          [normalizedCode],
        )
        if (rows.length && (rows[0].is_active === undefined || rows[0].is_active === true)) {
          selectedService = rows[0]
        }
      }
    }

    // Build stored notes (guest notes only) and email notes (include schedule context)
    const dt = (iso) => {
      if (!iso) return null
      const d = new Date(iso)
      if (Number.isNaN(d.getTime())) return null
      return d.toLocaleString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    }
    const preferredLabel = dt(preferredDate)
    const endLabel = dt(endDate)
    const storedNotesParts = [
      !selectedService && serviceId ? `Requested service code: ${serviceId}` : null,
      notes ? String(notes).trim() : null,
    ].filter(Boolean)
    const storedNotes = storedNotesParts.join('\n').trim() || null

    const emailNotesParts = [
      preferredLabel ? `Preferred start: ${preferredLabel}` : null,
      endLabel ? `Estimated end: ${endLabel}` : null,
      notes ? String(notes).trim() : null,
      !selectedService && serviceId ? `Requested service code: ${serviceId}` : null,
    ].filter(Boolean)
    const emailNotes = emailNotesParts.join('\n').trim() || null

    const client = await db.pool.connect()
    try {
      await client.query('BEGIN')

      const { rows: requestRows } = await client.query(
        `INSERT INTO online_quotation_requests (
          branch, full_name, mobile, email, 
          vehicle_make, vehicle_model, vehicle_plate, vehicle_size,
          service_id, unit_price, preferred_date, end_date, notes, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'New')
        RETURNING id`,
        [
          cleanBranch, cleanName, cleanMobile, cleanEmail,
          cleanMake, cleanModel, vehiclePlate || null, cleanSize,
          selectedService?.id || null, Number(unitPrice || 0), preferredDate || null, endDate || null, storedNotes
        ],
      )

      await client.query('COMMIT')
      const requestId = requestRows[0].id

      res.status(201).json({
        message: 'Quotation request submitted successfully. Our team will contact you soon.',
        requestId,
      })

      // Non-blocking emails
      ;(async () => {
        try {
          const businessEmail = await ConfigurationService.get('business', 'business_email')
          const staffTemplate = buildQuotationRequestStaffEmail({
            quotationNo: `ONLINE-#${requestId}`,
            branch: cleanBranch,
            customerName: cleanName,
            mobile: cleanMobile,
            email: cleanEmail,
            make: cleanMake,
            model: cleanModel,
            vehicleSize: cleanSize,
            serviceName: selectedService?.name,
            notes: emailNotes,
          })

          if (businessEmail) {
            await mailer.sendRawEmail({
              to: businessEmail,
              subject: `[New Online Request] ${cleanName} - ${cleanMake}`,
              text: staffTemplate.text,
              html: staffTemplate.html,
            })
          }

          if (cleanEmail) {
            const customerTemplate = buildQuotationRequestReceivedEmail({
              customerName: cleanName,
              quotationNo: `ONLINE-#${requestId}`,
              branch: cleanBranch,
              mobile: cleanMobile,
              email: cleanEmail,
              make: cleanMake,
              model: cleanModel,
              vehicleSize: cleanSize,
              serviceName: selectedService?.name,
              notes: emailNotes,
            })
            await mailer.sendRawEmail({
              to: cleanEmail,
              subject: `Request Received: ${cleanName}`,
              text: customerTemplate.text,
              html: customerTemplate.html,
            })
          }
        } catch (emailErr) {
          console.error('[PublicQuotationRequest] email failed:', emailErr.message)
        }
      })()
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }),
)

// GET /api/public/price-config — quotations.service_prices overrides
router.get(
  '/price-config',
  asyncHandler(async (_req, res) => {
    // Expected shape: { [catalogCode]: { [sizeKey]: price } }
    // Example: { "ppf-basic": { "small": 12345 } }
    let value = await ConfigurationService.get('quotations', 'service_prices')

    // Backward compatibility: if stored as string, try parse JSON.
    if (typeof value === 'string') {
      try {
        value = JSON.parse(value)
      } catch {
        value = null
      }
    }

    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return res.json({})
    }
    return res.json(value)
  }),
)

// GET /api/public/vehicle-makes — list all active makes
router.get(
  '/vehicle-makes',
  asyncHandler(async (_req, res) => {
    try {
      const { rows } = await db.query(
        `SELECT id, name, category, is_active, sort_order
         FROM vehicle_makes
         WHERE is_active = TRUE
         ORDER BY sort_order, name`,
      )
      return res.json(rows)
    } catch (err) {
      // Some deployments may not have vehicle_makes tables. Return empty list.
      console.error('Public vehicle-makes unavailable:', err.message)
      return res.json([])
    }
  }),
)

// GET /api/public/vehicle-makes/:makeId/models — models for a specific make
router.get(
  '/vehicle-makes/:makeId/models',
  asyncHandler(async (req, res) => {
    const { makeId } = req.params
    if (!makeId || Number.isNaN(Number(makeId))) {
      return res.status(400).json({ message: 'Invalid make id' })
    }

    try {
      const cols = await db.query(
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'vehicle_models' AND column_name IN ('year_from','year_to','is_active')",
      )
      const colNames = cols.rows.map((r) => r.column_name)
      const hasYearFrom = colNames.includes('year_from')
      const hasYearTo = colNames.includes('year_to')
      const hasIsActive = colNames.includes('is_active')

      const selectFields = ['id', 'name']
      if (hasYearFrom) selectFields.push('year_from')
      if (hasYearTo) selectFields.push('year_to')
      if (hasIsActive) selectFields.push('is_active')

      const whereClause = hasIsActive
        ? 'WHERE make_id = $1 AND is_active = TRUE'
        : 'WHERE make_id = $1'

      const { rows } = await db.query(
        `SELECT ${selectFields.join(', ')}
         FROM vehicle_models
         ${whereClause}
         ORDER BY name`,
        [makeId],
      )
      return res.json(rows)
    } catch (err) {
      console.error('Public vehicle models unavailable:', err.message)
      return res.json([])
    }
  }),
)

// GET /api/public/vehicle-makes/models/:modelId/variants
router.get(
  '/vehicle-makes/models/:modelId/variants',
  asyncHandler(async (req, res) => {
    const { modelId } = req.params
    if (!modelId || Number.isNaN(Number(modelId))) {
      return res.status(400).json({ message: 'Invalid model id' })
    }
    try {
      const { rows } = await db.query(
        `SELECT id, name, fuel_type, transmission, is_active
         FROM vehicle_variants
         WHERE model_id = $1 AND is_active = TRUE
         ORDER BY name`,
        [modelId],
      )
      return res.json(rows)
    } catch (err) {
      console.error('Public variants unavailable:', err.message)
      return res.json([])
    }
  }),
)

// GET /api/public/vehicle-makes/variants/:variantId/years
router.get(
  '/vehicle-makes/variants/:variantId/years',
  asyncHandler(async (req, res) => {
    const { variantId } = req.params
    if (!variantId || Number.isNaN(Number(variantId))) {
      return res.status(400).json({ message: 'Invalid variant id' })
    }
    try {
      const { rows } = await db.query(
        `SELECT id, year_model
         FROM vehicle_years
         WHERE variant_id = $1 AND is_active = TRUE
         ORDER BY year_model DESC`,
        [variantId],
      )
      return res.json(rows)
    } catch (err) {
      console.error('Public years unavailable:', err.message)
      return res.json([])
    }
  }),
)

module.exports = router
