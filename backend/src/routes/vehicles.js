const express = require('express')
const { body, param } = require('express-validator')
const db = require('../config/db')
const VehicleService = require('../services/vehicleService')
const { asyncHandler } = require('../utils/asyncHandler')
const { writeAuditLog } = require('../utils/auditLog')
const { validateRequest } = require('../middleware/validateRequest')
const { upload } = require('../middleware/upload')
const { normalizePlate, validatePlateFormat, isSuspiciousPlate, validatePrivatePlate, formatPlateForDisplay } = require('../utils/plateValidator')
const { requireAuth, requireRole } = require('../middleware/auth')

const router = express.Router()

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const search = String(req.query.search || '').trim().toLowerCase()
    const page = Math.max(Number(req.query.page || 1), 1)
    const limit = Math.min(Math.max(Number(req.query.limit || 10), 1), 100)
    const offset = (page - 1) * limit

    const statusFilter = String(req.query.status || '').toLowerCase()
    // Check whether the 'status' column exists in the vehicles table in this database.
    // Some deployments may not have applied migration that adds this column.
    const { rows: statusColRows } = await db.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'vehicles' AND column_name = 'status'`
    )
    const hasStatusCol = statusColRows.length > 0

    // statusFilter: 'archived' => only archived; 'all' => include all; default => exclude archived
    // If the 'status' column is missing, avoid referencing it to prevent SQL errors.
    let archivedCond
    if (!hasStatusCol) {
      // If status column doesn't exist, we cannot filter by archived state.
      // - 'all' should include everything
      // - 'archived' cannot be satisfied (no archived info) so return no archived rows by using FALSE
      // - default (no filter) show all
      if (statusFilter === 'archived') archivedCond = 'FALSE'
      else archivedCond = 'TRUE'
    } else {
      archivedCond = `(v.status IS NULL OR v.status != 'Archived')`
      if (statusFilter === 'archived') archivedCond = `(v.status = 'Archived')`
      if (statusFilter === 'all') archivedCond = `TRUE`
    }

    let whereClause = ''
    let params = []
    let countParams = []
    if (search) {
      whereClause = `WHERE (LOWER(v.plate_number) LIKE $1
            OR LOWER(COALESCE(v.make, '')) LIKE $1
            OR LOWER(COALESCE(v.model, '')) LIKE $1
            OR LOWER(COALESCE(v.color, '')) LIKE $1
            OR LOWER(COALESCE(c.full_name, '')) LIKE $1
            OR EXISTS (SELECT 1 FROM quotations q WHERE q.vehicle_id = v.id AND LOWER(q.quotation_no) LIKE $1)
            OR EXISTS (SELECT 1 FROM job_orders jo WHERE jo.vehicle_id = v.id AND LOWER(jo.job_order_no) LIKE $1))
            AND ${archivedCond}`
      params = [`%${search}%`, limit, offset]
      countParams = [`%${search}%`]
    } else {
      whereClause = `WHERE ${archivedCond}`
      params = [limit, offset]
      countParams = []
    }

    const { rows } = await db.query(
      `SELECT v.*, c.full_name AS customer_name
       FROM vehicles v
       JOIN customers c ON c.id = v.customer_id
       ${whereClause}
       ORDER BY v.id DESC
       LIMIT $${search ? 2 : 1}
       OFFSET $${search ? 3 : 2}`,
      params,
    )

    const count = await db.query(
      `SELECT COUNT(*)::int AS total
       FROM vehicles v
       JOIN customers c ON c.id = v.customer_id
       ${whereClause}`,
      countParams,
    )

    res.json({
      data: rows,
      pagination: {
        page,
        limit,
        total: count.rows[0].total,
        totalPages: Math.max(Math.ceil(count.rows[0].total / limit), 1),
      },
    })
  }),
)

router.get(
  '/:id/history',
  asyncHandler(async (req, res) => {
    const vehicleId = req.params.id
    const { rows } = await db.query(
      `SELECT s.id, s.reference_no, s.workflow_status, s.total_amount, s.created_at
       FROM sales s
       WHERE s.vehicle_id = $1
       ORDER BY s.created_at DESC`,
      [vehicleId],
    )
    res.json(rows)
  }),
)

// Get all vehicles for a specific customer
router.get(
  '/customer/:customerId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { customerId } = req.params

    if (!customerId) {
      return res.status(400).json({ message: 'Missing customer ID' })
    }

    try {
      const vehicles = await VehicleService.getCustomerVehicles(customerId)
      return res.json({ success: true, count: vehicles.length, data: vehicles })
    } catch (err) {
      console.error('Error fetching customer vehicles:', err.message || err)
      // Fallback: return a safe minimal projection directly from DB when service fails due to schema mismatch
      if ((err.message || '').includes('custom_model') || (err.message || '').includes('customMake') || (err.message || '').includes('make_id') || (err.message || '').includes('model_id') || (err.message || '').includes('variant_id')) {
        const { rows } = await db.query(
          `SELECT id, customer_id, make, model, variant, plate_number, color, year, odometer, created_at FROM vehicles WHERE customer_id = $1 ORDER BY created_at DESC`,
          [customerId],
        )
        return res.json({ success: true, count: rows.length, data: rows })
      }
      throw err
    }
  }),
)

// Get a single vehicle (with owner name)
router.get(
  '/:id',
  param('id').isInt({ min: 1 }).withMessage('Invalid vehicle id'),
  validateRequest,
  asyncHandler(async (req, res) => {
    const { id } = req.params

    const { rows } = await db.query(
      `SELECT v.*, c.full_name AS customer_name
       FROM vehicles v
       LEFT JOIN customers c ON c.id = v.customer_id
       WHERE v.id = $1`,
      [id],
    )

    if (!rows.length) {
      return res.status(404).json({ message: 'Vehicle not found' })
    }

    return res.json(rows[0])
  }),
)

router.post(
  '/',
  body('customerId').isInt({ min: 1 }).withMessage('customerId is required'),
  body('plateNumber').isString().notEmpty().withMessage('plateNumber is required'),
  body('make').isString().notEmpty().withMessage('make is required'),
  body('model').isString().notEmpty().withMessage('model is required'),
  validateRequest,
  asyncHandler(async (req, res) => {
    const {
      customerId,
      conductionSticker,
      vinChassis,
      make,
      model,
      year,
      variant,
      color,
      odometer,
      forceCreate,          // client sends true to acknowledge duplicate warning
      customMake,
      bodyType,
    } = req.body

    // ── 1. Normalise plate ──────────────────────────────────────────────
    const plateNumber = normalizePlate(req.body.plateNumber)

    // Enforce uppercase + trimmed storage format
    // plateNumber is already normalized to storage form (ABC1234)

    // ── 1b. Validate make against DB list ───────────────────────────────
    let makeTrimmed = (make || '').trim()
    let { rows: makeRows } = await db.query(
      'SELECT id, name FROM vehicle_makes WHERE LOWER(name) = LOWER($1) AND is_active = TRUE',
      [makeTrimmed],
    )

    let resolvedMake = null
    let currentCustomMake = customMake

    if (makeRows.length) {
      resolvedMake = makeRows[0].name
    } else {
      // Fallback: If make not found, use 'Other' if it exists.
      const { rows: otherRows } = await db.query(
        "SELECT id, name FROM vehicle_makes WHERE LOWER(name) = 'other' AND is_active = TRUE"
      )
      if (otherRows.length) {
        resolvedMake = otherRows[0].name
        currentCustomMake = makeTrimmed
      } else {
        return res.status(400).json({ message: `Invalid vehicle make: "${makeTrimmed}". Please select from the list.` })
      }
    }

    const isOther = resolvedMake === 'Other'
    if (isOther && !currentCustomMake?.trim()) {
      return res.status(400).json({ message: 'Please specify the vehicle make when selecting "Other".' })
    }
    const finalMake = isOther ? currentCustomMake.trim() : resolvedMake
    const finalCustomMake = isOther ? currentCustomMake.trim() : null

    // ── 2. Validate format ──────────────────────────────────────────────
    // If conductionSticker present, allow temporary (more relaxed) format
    const isTemporary = !!conductionSticker
    if (!isTemporary) {
      const { valid, errors: plateErrors } = validatePlateFormat(plateNumber)
      if (!valid) {
        return res.status(400).json({
          message: plateErrors[0] || 'Invalid plate format.',
          plateErrors,
        })
      }
    } else {
      // For temporary plates, require at least 3 chars and uppercase alphanumeric
      if (!/^[A-Z0-9]{3,10}$/.test(plateNumber)) {
        return res.status(400).json({ message: 'Temporary plate must be 3-10 uppercase alphanumeric characters.' })
      }
    }

    // ── 3. Suspicious-input detection ───────────────────────────────────
    const suspicious = isSuspiciousPlate(plateNumber)

    // ── 4. Duplicate check ──────────────────────────────────────────────
    const { rows: existing } = await db.query(
      'SELECT id, customer_id, plate_number FROM vehicles WHERE plate_number = $1',
      [plateNumber],
    )

    if (existing.length) {
      const sameCustomer = existing.some((v) => Number(v.customer_id) === Number(customerId))
      if (sameCustomer) {
        return res.status(409).json({
          message: 'This plate number is already registered to this customer.',
          duplicate: true,
          sameCustomer: true,
        })
      }
      // Different customer — warn but allow override
      if (!forceCreate) {
        return res.status(409).json({
          message: 'This plate number already exists in the system. Please confirm if this is a returning vehicle.',
          duplicate: true,
          sameCustomer: false,
          existingCustomerId: existing[0].customer_id,
        })
      }
    }

    // ── 5. Insert ───────────────────────────────────────────────────────
    const { rows } = await db.query(
      `INSERT INTO vehicles (
        customer_id, plate_number, conduction_sticker, vin_chassis,
        make, model, year, variant, color, odometer, is_suspicious, custom_make, body_type
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING *`,
      [customerId, plateNumber, conductionSticker, vinChassis, finalMake, model, year, variant, color, odometer, suspicious, finalCustomMake, bodyType || null],
    )

    await writeAuditLog({
      userId: req.user.id,
      action: 'CREATE_VEHICLE',
      entity: 'vehicles',
      entityId: rows[0].id,
      meta: { plateNumber, suspicious, make: finalMake },
    })

    res.status(201).json({ ...rows[0], warning: suspicious ? 'Plate flagged as suspicious — admin verification recommended.' : undefined })
  }),
)

router.patch(
  '/:id',
  requireRole('SuperAdmin'),
  param('id').isInt({ min: 1 }).withMessage('Invalid vehicle id'),
  body('plateNumber').isString().notEmpty().withMessage('plateNumber is required'),
  body('make').isString().notEmpty().withMessage('make is required'),
  body('model').isString().notEmpty().withMessage('model is required'),
  validateRequest,
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const {
      customerId,
      conductionSticker,
      vinChassis,
      make,
      model,
      year,
      variant,
      color,
      odometer,
      forceCreate,
      customMake,
      bodyType,
    } = req.body

    // ── 1. Normalise plate ──────────────────────────────────────────────
    const plateNumber = normalizePlate(req.body.plateNumber)

    // ── 1b. Validate make against DB list ───────────────────────────────
    const makeTrimmed = (make || '').trim()
    const { rows: makeRows } = await db.query(
      'SELECT id, name FROM vehicle_makes WHERE LOWER(name) = LOWER($1) AND is_active = TRUE',
      [makeTrimmed],
    )
    if (!makeRows.length) {
      return res.status(400).json({ message: `Invalid vehicle make: "${makeTrimmed}". Please select from the list.` })
    }
    const resolvedMake = makeRows[0].name
    const isOther = resolvedMake === 'Other'
    if (isOther && !customMake?.trim()) {
      return res.status(400).json({ message: 'Please specify the vehicle make when selecting "Other".' })
    }
    const finalMake = isOther ? customMake.trim() : resolvedMake
    const finalCustomMake = isOther ? customMake.trim() : null

    // ── 2. Validate format ──────────────────────────────────────────────
    const isTemporary = !!conductionSticker
    if (!isTemporary) {
      const { valid, errors: plateErrors } = validatePrivatePlate(plateNumber)
      if (!valid) {
        return res.status(400).json({
          message: plateErrors[0] || 'Invalid plate format.',
          plateErrors,
        })
      }
    } else {
      if (!/^[A-Z0-9]{3,10}$/.test(plateNumber)) {
        return res.status(400).json({ message: 'Temporary plate must be 3-10 uppercase alphanumeric characters.' })
      }
    }

    // ── 3. Suspicious-input detection ───────────────────────────────────
    const suspicious = isSuspiciousPlate(plateNumber)

    // ── Check existing vehicle and block plate edits when linked to transactions ─
    const { rows: currentRows } = await db.query('SELECT id, plate_number FROM vehicles WHERE id = $1', [id])
    if (!currentRows.length) {
      return res.status(404).json({ message: 'Vehicle not found' })
    }
    const current = currentRows[0]

    // If plate is being changed, and vehicle has linked transactional records, only Admin may change
    const plateChanged = current.plate_number !== plateNumber
    if (plateChanged) {
      const { rows: rel } = await db.query(
        `SELECT
           EXISTS(SELECT 1 FROM appointments a WHERE a.vehicle_id = $1) AS has_bookings,
           EXISTS(SELECT 1 FROM job_orders jo WHERE jo.vehicle_id = $1) AS has_job_orders,
           EXISTS(SELECT 1 FROM sales s WHERE s.vehicle_id = $1) AS has_sales,
           EXISTS(SELECT 1 FROM vehicle_service_records vsr WHERE vsr.vehicle_id = $1) AS has_service_records
         `,
        [id],
      )
      const r = rel[0]
      if (r.has_bookings || r.has_job_orders || r.has_sales || r.has_service_records) {
        if (!['Admin', 'SuperAdmin'].includes(req.user?.role)) {
          return res.status(403).json({ message: 'Plate number cannot be changed for vehicles with transaction history. Contact an administrator.' })
        }
      }
    }

    // ── 4. Duplicate check (exclude self) ───────────────────────────────
    const { rows: existing } = await db.query(
      'SELECT id, customer_id FROM vehicles WHERE plate_number = $1 AND id != $2',
      [plateNumber, id],
    )

    if (existing.length) {
      const sameCustomer = existing.some((v) => Number(v.customer_id) === Number(customerId))
      if (sameCustomer) {
        return res.status(409).json({
          message: 'This plate number is already registered to this customer.',
          duplicate: true,
          sameCustomer: true,
        })
      }
      if (!forceCreate) {
        return res.status(409).json({
          message: 'This plate number already exists in the system. Please confirm if this is a returning vehicle.',
          duplicate: true,
          sameCustomer: false,
          existingCustomerId: existing[0].customer_id,
        })
      }
    }

    // ── 5. Update ───────────────────────────────────────────────────────
    const { rows } = await db.query(
      `UPDATE vehicles
       SET customer_id = $1,
           plate_number = $2,
           conduction_sticker = $3,
           vin_chassis = $4,
           make = $5,
           model = $6,
           year = $7,
           variant = $8,
           color = $9,
           odometer = $10,
           is_suspicious = $11,
           custom_make = $12,
           body_type = $13
       WHERE id = $14
       RETURNING *`,
      [customerId, plateNumber, conductionSticker, vinChassis, finalMake, model, year, variant, color, odometer, suspicious, finalCustomMake, bodyType || null, id],
    )

    if (!rows.length) {
      return res.status(404).json({ message: 'Vehicle not found' })
    }

    // Log plate edits explicitly (old -> new)
    await writeAuditLog({
      userId: req.user.id,
      action: 'UPDATE_VEHICLE',
      entity: 'vehicles',
      entityId: Number(id),
      meta: JSON.stringify({
        plateOld: current.plate_number,
        plateNew: plateNumber,
        suspicious,
        make: finalMake,
      }),
    })

    return res.json({ ...rows[0], warning: suspicious ? 'Plate flagged as suspicious — admin verification recommended.' : undefined })
  }),
)

// ── Admin: Verify a plate number ────────────────────────────────────────────
router.patch(
  '/:id/verify-plate', requireRole('SuperAdmin'), param('id').isInt({ min: 1 }).withMessage('Invalid vehicle id'),
  validateRequest,
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const { rows } = await db.query(
      `UPDATE vehicles
       SET plate_verified = TRUE,
           verified_by = $1,
           verified_at = NOW(),
           is_suspicious = FALSE
       WHERE id = $2
       RETURNING *`,
      [req.user.id, id],
    )
    if (!rows.length) {
      return res.status(404).json({ message: 'Vehicle not found' })
    }
    await writeAuditLog({
      userId: req.user.id,
      action: 'VERIFY_PLATE',
      entity: 'vehicles',
      entityId: Number(id),
      meta: { plateNumber: rows[0].plate_number },
    })
    return res.json(rows[0])
  }),
)

router.delete(
  '/:id',
  requireRole('SuperAdmin'),
  param('id').isInt({ min: 1 }).withMessage('Invalid vehicle id'),
  validateRequest,
  asyncHandler(async (req, res) => {
    const { id } = req.params
    // Check for related transactional records that would prevent hard-delete
    const { rows: rel } = await db.query(
      `SELECT
         EXISTS(SELECT 1 FROM appointments a WHERE a.vehicle_id = $1) AS has_bookings,
         EXISTS(SELECT 1 FROM job_orders jo WHERE jo.vehicle_id = $1) AS has_job_orders,
         EXISTS(SELECT 1 FROM sales s WHERE s.vehicle_id = $1) AS has_sales,
         EXISTS(SELECT 1 FROM vehicle_service_records vsr WHERE vsr.vehicle_id = $1) AS has_service_records
       `,
      [id],
    )

    if (!rel || !rel.length) {
      return res.status(404).json({ message: 'Vehicle not found' })
    }

    const r = rel[0]
    if (r.has_bookings || r.has_job_orders || r.has_sales || r.has_service_records) {
      // Log attempted deletion
      await db.query(
        `INSERT INTO activity_logs (user_id, action, entity, entity_id, notes, created_at)
         VALUES ($1, 'DELETE_BLOCKED', 'vehicles', $2, 'Attempted hard-delete of vehicle with transactions — blocked', NOW())`,
        [req.user?.id || null, id],
      ).catch(() => { })

      await writeAuditLog({
        userId: req.user?.id,
        action: 'DELETE_BLOCKED',
        entity: 'vehicles',
        entityId: Number(id),
        meta: JSON.stringify({ has_bookings: r.has_bookings, has_job_orders: r.has_job_orders, has_sales: r.has_sales, has_service_records: r.has_service_records }),
      })

      return res.status(409).json({ message: 'Vehicle has related transaction history and cannot be permanently deleted. Use the archive endpoint instead.' })
    }

    const { rowCount } = await db.query('DELETE FROM vehicles WHERE id = $1', [id])

    if (!rowCount) {
      return res.status(404).json({ message: 'Vehicle not found' })
    }

    await writeAuditLog({
      userId: req.user.id,
      action: 'DELETE_VEHICLE',
      entity: 'vehicles',
      entityId: Number(id),
    })

    return res.status(204).send()
  }),
)

// Archive vehicle (soft delete) — SuperAdmin only
router.post(
  '/:id/archive',
  requireAuth,
  requireRole('SuperAdmin'),
  param('id').isInt({ min: 1 }).withMessage('Invalid vehicle id'),
  validateRequest,
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const userId = req.user?.id

    const { rows } = await db.query('SELECT id, status, archived_at FROM vehicles WHERE id = $1', [id])
    if (!rows.length) return res.status(404).json({ message: 'Vehicle not found' })
    const vehicle = rows[0]

    if (vehicle.archived_at || vehicle.status === 'Archived') {
      return res.status(409).json({ message: 'This vehicle is already archived.' })
    }

    const { rows: updated } = await db.query(
      `UPDATE vehicles
         SET status = 'Archived', archived_at = NOW(), archived_by = $1
       WHERE id = $2
       RETURNING *`,
      [userId, id],
    )

    // Activity & audit logs
    await db.query(
      `INSERT INTO activity_logs (user_id, action, entity, entity_id, notes, created_at)
       VALUES ($1, 'ARCHIVE', 'vehicles', $2, 'Vehicle archived by admin', NOW())`,
      [userId, id],
    ).catch(() => { })

    await writeAuditLog({
      userId,
      action: 'ARCHIVE',
      entity: 'vehicles',
      entityId: Number(id),
      meta: JSON.stringify({ archivedBy: userId }),
    })

    return res.json(updated[0])
  }),
)

// Reactivate archived vehicle — SuperAdmin only
router.post(
  '/:id/reactivate',
  requireAuth,
  requireRole('SuperAdmin'),
  param('id').isInt({ min: 1 }).withMessage('Invalid vehicle id'),
  validateRequest,
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const userId = req.user?.id

    const { rows } = await db.query('SELECT id, status FROM vehicles WHERE id = $1', [id])
    if (!rows.length) return res.status(404).json({ message: 'Vehicle not found' })

    const { rows: updated } = await db.query(
      `UPDATE vehicles
         SET status = 'Active', archived_at = NULL, archived_by = NULL
       WHERE id = $1
       RETURNING *`,
      [id],
    )

    await db.query(
      `INSERT INTO activity_logs (user_id, action, entity, entity_id, notes, created_at)
       VALUES ($1, 'REACTIVATE', 'vehicles', $2, 'Vehicle reactivated by admin', NOW())`,
      [userId, id],
    ).catch(() => { })

    await writeAuditLog({
      userId,
      action: 'REACTIVATE',
      entity: 'vehicles',
      entityId: Number(id),
      meta: JSON.stringify({ reactivatedBy: userId }),
    })

    return res.json(updated[0])
  }),
)

// Get full service history for a vehicle
router.get(
  '/:id/service-history',
  param('id').isInt({ min: 1 }).withMessage('Invalid vehicle id'),
  validateRequest,
  asyncHandler(async (req, res) => {
    const { id } = req.params

    // Get sales records with full details (legacy workflow)
    const { rows: salesHistory } = await db.query(
      `SELECT 
        s.id,
        s.reference_no,
        s.doc_type,
        s.service_package,
        s.add_ons,
        s.total_amount,
        s.workflow_status,
        s.created_at AS service_date,
        u.full_name AS created_by_name,
        COALESCE(
          json_agg(
            json_build_object(
              'item_name', si.item_name,
              'item_type', si.item_type,
              'qty', si.qty,
              'price', si.price
            ) ORDER BY si.id
          ) FILTER (WHERE si.id IS NOT NULL),
          '[]'
        ) AS items
       FROM sales s
       LEFT JOIN users u ON u.id = s.created_by
       LEFT JOIN sale_items si ON si.sale_id = s.id
       WHERE s.vehicle_id = $1
       GROUP BY s.id, u.full_name
       ORDER BY s.created_at DESC`,
      [id],
    )

    // Get job orders (new quotation workflow)
    const { rows: jobOrderHistory } = await db.query(
      `SELECT
        jo.id,
        jo.job_order_no                                  AS reference_no,
        'Job Order'                                      AS doc_type,
        COALESCE(
          (SELECT svc->>'name' FROM jsonb_array_elements(jo.services) svc LIMIT 1),
          'Service Job'
        )                                                AS service_package,
        NULL                                             AS add_ons,
        q.total_amount,
        jo.status                                        AS workflow_status,
        COALESCE(a.schedule_start, jo.created_at)        AS service_date,
        u.full_name                                      AS created_by_name,
        jo.services                                      AS items_raw
       FROM job_orders jo
       JOIN  quotations   q ON q.id  = jo.quotation_id
       LEFT JOIN appointments a ON a.id  = jo.schedule_id
       LEFT JOIN users        u ON u.id  = jo.created_by
       WHERE jo.vehicle_id = $1
       ORDER BY service_date DESC`,
      [id],
    )

    // Normalise job-order rows to match the sales shape the frontend expects
    const jobOrdersNormalised = jobOrderHistory.map((jo) => {
      const rawServices = Array.isArray(jo.items_raw) ? jo.items_raw : []
      return {
        id: jo.id,
        reference_no: jo.reference_no,
        doc_type: jo.doc_type,
        service_package: jo.service_package,
        add_ons: null,
        total_amount: jo.total_amount,
        workflow_status: jo.workflow_status,
        service_date: jo.service_date,
        created_by_name: jo.created_by_name,
        items: rawServices.map((s) => ({
          item_name: s.name || s.code || 'Service',
          item_type: 'Service',
          qty: s.qty || 1,
          price: s.price || 0,
        })),
      }
    })

    // Merge and sort newest-first
    const allSalesHistory = [...salesHistory, ...jobOrdersNormalised].sort(
      (a, b) => new Date(b.service_date) - new Date(a.service_date),
    )

    // Get service records with damage and remarks
    const { rows: serviceRecords } = await db.query(
      `SELECT 
        vsr.id,
        vsr.service_date,
        vsr.service_description,
        vsr.damage_notes,
        vsr.remarks,
        vsr.assigned_staff_name,
        vsr.odometer_reading,
        vsr.sale_id,
        vsr.status,
        vsr.completed_at,
        vsr.completed_by,
        u.full_name AS created_by_name,
        uc.full_name AS completed_by_name
       FROM vehicle_service_records vsr
       LEFT JOIN users u ON u.id = vsr.created_by
       LEFT JOIN users uc ON uc.id = vsr.completed_by
       WHERE vsr.vehicle_id = $1
       ORDER BY vsr.service_date DESC`,
      [id],
    )

    // Get photos grouped by sale
    const { rows: photos } = await db.query(
      `SELECT 
        id,
        photo_type,
        tag,
        file_url,
        sale_id,
        created_at
       FROM vehicle_photos
       WHERE vehicle_id = $1
       ORDER BY created_at DESC`,
      [id],
    )

    res.json({
      salesHistory: allSalesHistory,
      serviceRecords,
      photos,
    })
  }),
)

// Add service record with damage and remarks
router.post(
  '/:id/service-records',
  param('id').isInt({ min: 1 }).withMessage('Invalid vehicle id'),
  body('serviceDate').isISO8601().withMessage('serviceDate is required'),
  body('serviceDescription').optional().isString(),
  body('damageNotes').optional().isString(),
  body('remarks').optional().isString(),
  body('assignedStaffName').optional().isString(),
  body('odometerReading').optional().isInt({ min: 0 }),
  body('saleId').optional().isInt({ min: 1 }),
  body('status').optional().isIn(['pending', 'in-progress', 'completed', 'cancelled']),
  validateRequest,
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const {
      serviceDate,
      serviceDescription,
      damageNotes,
      remarks,
      assignedStaffName,
      odometerReading,
      saleId,
      status,
    } = req.body

    const { rows } = await db.query(
      `INSERT INTO vehicle_service_records (
        vehicle_id, sale_id, service_date, service_description, 
        damage_notes, remarks, assigned_staff_name, odometer_reading, status, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        id,
        saleId || null,
        serviceDate,
        serviceDescription || null,
        damageNotes || null,
        remarks || null,
        assignedStaffName || null,
        odometerReading || null,
        status || 'pending',
        req.user.id,
      ],
    )

    await writeAuditLog({
      userId: req.user.id,
      action: 'CREATE_SERVICE_RECORD',
      entity: 'vehicle_service_records',
      entityId: rows[0].id,
      meta: { vehicleId: id },
    })

    res.status(201).json(rows[0])
  }),
)

// Update service record
router.patch(
  '/:vehicleId/service-records/:recordId',
  param('vehicleId').isInt({ min: 1 }).withMessage('Invalid vehicle id'),
  param('recordId').isInt({ min: 1 }).withMessage('Invalid record id'),
  validateRequest,
  requireRole('SuperAdmin'),
  asyncHandler(async (req, res) => {
    const { vehicleId, recordId } = req.params
    const {
      serviceDate,
      serviceDescription,
      damageNotes,
      remarks,
      assignedStaffName,
      odometerReading,
      status,
    } = req.body

    // If marking as completed, set completed timestamp and user
    const completedAt = status === 'completed' ? new Date() : undefined
    const completedBy = status === 'completed' ? req.user.id : undefined

    const { rows } = await db.query(
      `UPDATE vehicle_service_records
       SET service_date = COALESCE($1, service_date),
           service_description = COALESCE($2, service_description),
           damage_notes = COALESCE($3, damage_notes),
           remarks = COALESCE($4, remarks),
           assigned_staff_name = COALESCE($5, assigned_staff_name),
           odometer_reading = COALESCE($6, odometer_reading),
           status = COALESCE($7, status),
           completed_at = COALESCE($8, completed_at),
           completed_by = COALESCE($9, completed_by)
       WHERE id = $10 AND vehicle_id = $11
       RETURNING *`,
      [
        serviceDate,
        serviceDescription,
        damageNotes,
        remarks,
        assignedStaffName,
        odometerReading,
        status,
        completedAt,
        completedBy,
        recordId,
        vehicleId,
      ],
    )

    if (!rows.length) {
      return res.status(404).json({ message: 'Service record not found' })
    }

    await writeAuditLog({
      userId: req.user.id,
      action: 'UPDATE_SERVICE_RECORD',
      entity: 'vehicle_service_records',
      entityId: Number(recordId),
      meta: { vehicleId },
    })

    res.json(rows[0])
  }),
)

// Add vehicle photo with file upload
router.post(
  '/:id/photos',
  upload.single('photo'),
  param('id').isInt({ min: 1 }).withMessage('Invalid vehicle id'),
  asyncHandler(async (req, res) => {
    const { id } = req.params

    if (!req.file) {
      return res.status(400).json({ message: 'Photo file is required' })
    }

    // Get form data from request body
    const { photoType, tag, saleId } = req.body

    // Validate photo type
    const validTypes = ['before', 'after', 'damage', 'general']
    if (!photoType || !validTypes.includes(photoType)) {
      return res.status(400).json({ message: 'Invalid photo type' })
    }

    // Construct the file URL (relative path that will be served by express.static)
    const fileUrl = `/uploads/vehicles/${req.file.filename}`

    const { rows } = await db.query(
      `INSERT INTO vehicle_photos (vehicle_id, photo_type, tag, file_url, sale_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [id, photoType, tag || null, fileUrl, saleId ? Number(saleId) : null],
    )

    await writeAuditLog({
      userId: req.user.id,
      action: 'ADD_VEHICLE_PHOTO',
      entity: 'vehicle_photos',
      entityId: rows[0].id,
      meta: { vehicleId: id, photoType, filename: req.file.filename },
    })

    // Auto-complete pending service records when "after" photos are uploaded
    if (photoType === 'after') {
      await db.query(
        `UPDATE vehicle_service_records
         SET status = 'completed',
             completed_at = NOW(),
             completed_by = $1
         WHERE vehicle_id = $2
           AND status IN ('pending', 'in-progress')
           AND service_date <= NOW()`,
        [req.user.id, id]
      )
    }

    // Mark completed records as pending when "before" photos are uploaded (new work cycle)
    if (photoType === 'before') {
      await db.query(
        `UPDATE vehicle_service_records
         SET status = 'pending',
             completed_at = NULL,
             completed_by = NULL
         WHERE vehicle_id = $1
           AND status = 'completed'`,
        [id]
      )
    }

    res.status(201).json(rows[0])
  }),
)

// Delete vehicle photo
router.delete(
  '/:vehicleId/photos/:photoId',
  param('vehicleId').isInt({ min: 1 }).withMessage('Invalid vehicle id'),
  param('photoId').isInt({ min: 1 }).withMessage('Invalid photo id'),
  validateRequest,
  requireRole('SuperAdmin'),
  asyncHandler(async (req, res) => {
    const { vehicleId, photoId } = req.params

    // Get photo info before deleting to check if it's an "after" photo
    const { rows: photoRows } = await db.query(
      'SELECT photo_type FROM vehicle_photos WHERE id = $1 AND vehicle_id = $2',
      [photoId, vehicleId],
    )

    if (!photoRows.length) {
      return res.status(404).json({ message: 'Photo not found' })
    }

    const photoType = photoRows[0].photo_type

    // Delete the photo
    const { rowCount } = await db.query(
      'DELETE FROM vehicle_photos WHERE id = $1 AND vehicle_id = $2',
      [photoId, vehicleId],
    )

    if (!rowCount) {
      return res.status(404).json({ message: 'Photo not found' })
    }

    // If deleting an "after" photo, check if any other "after" photos remain
    if (photoType === 'after') {
      const { rows: remainingAfterPhotos } = await db.query(
        'SELECT COUNT(*) as count FROM vehicle_photos WHERE vehicle_id = $1 AND photo_type = $2',
        [vehicleId, 'after']
      )

      // If no "after" photos remain, revert completed records back to pending
      if (remainingAfterPhotos[0].count === '0') {
        await db.query(
          `UPDATE vehicle_service_records
           SET status = 'pending',
               completed_at = NULL,
               completed_by = NULL
           WHERE vehicle_id = $1
             AND status = 'completed'`,
          [vehicleId]
        )
      }
    }

    await writeAuditLog({
      userId: req.user.id,
      action: 'DELETE_VEHICLE_PHOTO',
      entity: 'vehicle_photos',
      entityId: Number(photoId),
      meta: { vehicleId, photoType },
    })

    res.status(204).send()
  }),
)

module.exports = router


