const express = require('express')
const { body } = require('express-validator')
const bcrypt = require('bcryptjs')
const db = require('../config/db')
const { asyncHandler } = require('../utils/asyncHandler')
const { requireRole } = require('../middleware/auth')
const { validateRequest } = require('../middleware/validateRequest')
const { writeAuditLog } = require('../utils/auditLog')
const { runAutoCancelJob } = require('../utils/autoCancelJob')
const { createSqlGzipBackup } = require('../utils/pgDumpBackup')

const router = express.Router()

const ROLE_MODULES = [
  { key: 'dashboard', label: 'Dashboard', group: 'general', superAdminOnly: false, defaultAdminAccess: true },
  { key: 'crm', label: 'CRM', group: 'master', superAdminOnly: false, defaultAdminAccess: true },
  { key: 'services', label: 'Services', group: 'master', superAdminOnly: false, defaultAdminAccess: true },
  { key: 'pms', label: 'PMS Management', group: 'master', superAdminOnly: false, defaultAdminAccess: true },
  { key: 'online-quotation', label: 'Online Quotation', group: 'operations', superAdminOnly: false, defaultAdminAccess: true },
  { key: 'quotations', label: 'Quotations', group: 'operations', superAdminOnly: false, defaultAdminAccess: true },
  { key: 'scheduling', label: 'Scheduling', group: 'operations', superAdminOnly: false, defaultAdminAccess: true },
  { key: 'job-orders', label: 'Job Orders', group: 'operations', superAdminOnly: false, defaultAdminAccess: true },
  { key: 'jo-approval', label: 'JO Approval', group: 'operations', superAdminOnly: true, defaultAdminAccess: false },
  { key: 'subscriptions', label: 'Subscriptions', group: 'operations', superAdminOnly: false, defaultAdminAccess: true },
  { key: 'payments', label: 'Payments & POS', group: 'finance', superAdminOnly: false, defaultAdminAccess: true },
  { key: 'sales', label: 'Sales & Invoices', group: 'finance', superAdminOnly: false, defaultAdminAccess: true },
  { key: 'inventory', label: 'Inventory', group: 'management', superAdminOnly: false, defaultAdminAccess: true },
  { key: 'admin', label: 'Admin & Security', group: 'management', superAdminOnly: true, defaultAdminAccess: false },
  { key: 'settings', label: 'Configuration', group: 'settings', superAdminOnly: true, defaultAdminAccess: false },
]

function getDefaultAdminModules() {
  return ROLE_MODULES.filter((m) => !m.superAdminOnly && m.defaultAdminAccess).map((m) => m.key)
}

function normalizeAdminModules(candidate) {
  const editableKeys = new Set(ROLE_MODULES.filter((m) => !m.superAdminOnly).map((m) => m.key))
  const selected = Array.isArray(candidate) ? candidate : []
  const unique = new Set(selected.filter((k) => editableKeys.has(k)))
  unique.add('dashboard')
  return ROLE_MODULES.map((m) => m.key).filter((k) => unique.has(k))
}

async function getAdminModuleAccess() {
  const fallback = getDefaultAdminModules()
  const raw = await getSystemConfigValue('rbac', 'admin_modules', null)
  if (!raw) {
    await setSystemConfigValue({ category: 'rbac', key: 'admin_modules', value: JSON.stringify(fallback) })
    return fallback
  }
  try {
    const parsed = JSON.parse(raw)
    const normalized = normalizeAdminModules(parsed)
    if (JSON.stringify(parsed) !== JSON.stringify(normalized)) {
      await setSystemConfigValue({ category: 'rbac', key: 'admin_modules', value: JSON.stringify(normalized) })
    }
    return normalized
  } catch {
    await setSystemConfigValue({ category: 'rbac', key: 'admin_modules', value: JSON.stringify(fallback) })
    return fallback
  }
}

async function getSystemConfigValue(category, key, fallback = null) {
  const { rows } = await db.query(
    'SELECT value FROM system_config WHERE category = $1 AND key = $2',
    [category, key],
  )
  if (!rows.length) return fallback
  return rows[0].value
}

async function setSystemConfigValue({ category, key, value, userId, changedByName, ipAddress }) {
  const { rows: existing } = await db.query(
    'SELECT value FROM system_config WHERE category = $1 AND key = $2',
    [category, key],
  )
  const oldValue = existing[0]?.value ?? null

  await db.query(
    `INSERT INTO system_config (category, key, value, value_type, updated_by, updated_at)
     VALUES ($1, $2, $3, 'string', $4, NOW())
     ON CONFLICT (category, key)
     DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
    [category, key, value, userId || null],
  )

  await db.query(
    `INSERT INTO config_change_logs
       (category, config_key, old_value, new_value, changed_by, changed_by_name, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [category, key, oldValue, value, userId || null, changedByName || null, ipAddress || null],
  ).catch(() => {})
}

router.get(
  '/roles',
  requireRole('SuperAdmin'),
  asyncHandler(async (req, res) => {
    const { rows } = await db.query(
      `SELECT id, name FROM roles ORDER BY id ASC`,
    )
    res.json(rows)
  }),
)

router.get(
  '/module-access',
  requireRole('SuperAdmin', 'Admin'),
  asyncHandler(async (req, res) => {
    const adminAllowedModules = await getAdminModuleAccess()
    const isSuperAdmin = req.user?.role === 'SuperAdmin'
    const effective = isSuperAdmin
      ? ROLE_MODULES.map((m) => m.key)
      : adminAllowedModules

    res.json({
      role: req.user?.role,
      canEdit: isSuperAdmin,
      adminAllowedModules,
      modules: ROLE_MODULES.map((m) => ({
        key: m.key,
        label: m.label,
        group: m.group,
        superAdminOnly: m.superAdminOnly,
        editable: isSuperAdmin && !m.superAdminOnly,
        enabled: effective.includes(m.key),
      })),
    })
  }),
)

router.patch(
  '/module-access',
  requireRole('SuperAdmin'),
  body('modules').isArray().withMessage('modules must be an array'),
  validateRequest,
  asyncHandler(async (req, res) => {
    const modules = normalizeAdminModules(req.body.modules)
    await setSystemConfigValue({
      category: 'rbac',
      key: 'admin_modules',
      value: JSON.stringify(modules),
      userId: req.user?.id || null,
      changedByName: req.user?.email || 'System',
      ipAddress: req.ip || req.connection?.remoteAddress || null,
    })

    await writeAuditLog({
      userId: req.user?.id,
      action: 'UPDATE_ROLE_MODULE_ACCESS',
      entity: 'rbac',
      entityId: null,
      meta: { role: 'Admin', modules },
    })

    res.json({
      role: req.user?.role,
      canEdit: true,
      adminAllowedModules: modules,
      modules: ROLE_MODULES.map((m) => ({
        key: m.key,
        label: m.label,
        group: m.group,
        superAdminOnly: m.superAdminOnly,
        editable: !m.superAdminOnly,
        enabled: m.superAdminOnly ? true : modules.includes(m.key),
      })),
    })
  }),
)

router.get(
  '/users',
  requireRole('SuperAdmin'),
  asyncHandler(async (req, res) => {
    const { rows } = await db.query(
      `SELECT u.id, u.full_name, u.email, u.is_active, r.name AS role
       FROM users u
       JOIN roles r ON r.id = u.role_id
       ORDER BY u.id DESC`,
    )
    res.json(rows)
  }),
)

router.post(
  '/users',
  requireRole('SuperAdmin'),
  body('fullName').trim().notEmpty().withMessage('Full name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('roleId').isInt({ min: 1 }).withMessage('Valid role is required'),
  validateRequest,
  asyncHandler(async (req, res) => {
    const { fullName, email, password, roleId } = req.body

    const roleLookup = await db.query('SELECT id, name FROM roles WHERE id = $1', [roleId])
    if (!roleLookup.rows.length) {
      return res.status(400).json({ message: 'Selected role does not exist' })
    }
    const targetRole = roleLookup.rows[0]

    // Defense in depth: SuperAdmin assignment is always restricted.
    if (targetRole.name === 'SuperAdmin' && req.user?.role !== 'SuperAdmin') {
      return res.status(403).json({ message: 'Only SuperAdmin can assign the SuperAdmin role' })
    }

    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email])
    if (existing.rows.length > 0) {
      return res.status(409).json({ message: 'A user with this email already exists' })
    }

    const hash = await bcrypt.hash(password, 10)
    const { rows } = await db.query(
      `INSERT INTO users (full_name, email, password_hash, role_id, is_active)
       VALUES ($1, $2, $3, $4, TRUE)
       RETURNING id, full_name, email, is_active`,
      [fullName, email, hash, roleId],
    )

    await writeAuditLog({
      userId: req.user.id,
      action: 'CREATE_USER',
      entity: 'users',
      entityId: rows[0].id,
      meta: { email, role: targetRole.name },
    })

    res.status(201).json({ ...rows[0], role: targetRole.name })
  }),
)

// ── DELETE /admin/users/:id ─────────────────────────────────────────────────
// SuperAdmin only — hard-deletes a system user account.
// Guards: cannot delete yourself, cannot delete the last SuperAdmin.

router.delete(
  '/users/:id',
  requireRole('SuperAdmin'),
  asyncHandler(async (req, res) => {
    const targetId = Number(req.params.id)
    const requesterId = req.user?.id

    // Prevent self-deletion
    if (targetId === requesterId) {
      return res.status(400).json({ message: 'You cannot delete your own account.' })
    }

    // Fetch the target user
    const { rows: targetRows } = await db.query(
      `SELECT u.id, u.full_name, u.email, r.name AS role
       FROM users u JOIN roles r ON r.id = u.role_id
       WHERE u.id = $1`,
      [targetId],
    )
    if (!targetRows.length) {
      return res.status(404).json({ message: 'User not found.' })
    }
    const target = targetRows[0]

    // Prevent deleting the last SuperAdmin
    if (target.role === 'SuperAdmin') {
      const { rows: superAdmins } = await db.query(
        `SELECT COUNT(*)::int AS cnt FROM users u
         JOIN roles r ON r.id = u.role_id
         WHERE r.name = 'SuperAdmin'`,
      )
      if (superAdmins[0].cnt <= 1) {
        return res.status(400).json({ message: 'Cannot delete the last SuperAdmin account.' })
      }
    }

    await db.query('DELETE FROM users WHERE id = $1', [targetId])

    await writeAuditLog({
      userId: requesterId,
      action: 'DELETE_USER',
      entity: 'users',
      entityId: targetId,
      meta: { deletedEmail: target.email, deletedRole: target.role },
    })

    res.status(204).send()
  }),
)

router.get(
  '/audit-logs',
  requireRole('SuperAdmin'),
  asyncHandler(async (req, res) => {
    const { rows } = await db.query(
      `SELECT id, user_id, action, entity, entity_id, meta, created_at
       FROM audit_logs
       ORDER BY created_at DESC
       LIMIT 500`,
    )
    res.json(rows)
  }),
)

router.get(
  '/master-data',
  requireRole('SuperAdmin'),
  asyncHandler(async (req, res) => {
    const paymentMethods = await db.query('SELECT * FROM payment_methods ORDER BY id ASC')
    const discountRules = await db.query('SELECT * FROM discount_rules ORDER BY id ASC')
    const commissionRules = await db.query('SELECT * FROM staff_commissions ORDER BY id ASC')
    const notificationTemplates = await db.query('SELECT * FROM notification_templates ORDER BY id ASC')

    res.json({
      paymentMethods: paymentMethods.rows,
      discountRules: discountRules.rows,
      commissionRules: commissionRules.rows,
      notificationTemplates: notificationTemplates.rows,
    })
  }),
)

// ── GET /admin/status-transitions ─────────────────────────────────────────────
// Returns the full workflow audit trail across all entities.
// Only accessible by Admin and Manager roles.

router.get(
  '/status-transitions',
  requireRole('SuperAdmin'),
  asyncHandler(async (req, res) => {
    const entityType = req.query.entity_type || null   // 'appointment' | 'job_order' | null
    const entityId   = req.query.entity_id   || null
    const page       = Math.max(Number(req.query.page  || 1), 1)
    const limit      = Math.min(Math.max(Number(req.query.limit || 50), 1), 200)
    const offset     = (page - 1) * limit

    const conditions = []
    const values     = []
    let   idx        = 1

    if (entityType) { conditions.push(`st.entity_type = $${idx}`); values.push(entityType); idx++ }
    if (entityId)   { conditions.push(`st.entity_id   = $${idx}`); values.push(Number(entityId)); idx++ }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const { rows } = await db.query(
      `SELECT
         st.id,
         st.entity_type,
         st.entity_id,
         st.from_status,
         st.to_status,
         st.changed_at,
         st.is_override,
         st.override_reason,
         st.notes,
         u.full_name  AS changed_by_name,
         u.id         AS changed_by_id
       FROM status_transitions st
       LEFT JOIN users u ON u.id = st.changed_by
       ${where}
       ORDER BY st.changed_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...values, limit, offset],
    )

    const { rows: countRows } = await db.query(
      `SELECT COUNT(*)::int AS total FROM status_transitions st ${where}`,
      values,
    )

    res.json({
      data: rows,
      pagination: {
        page,
        limit,
        total: countRows[0].total,
        totalPages: Math.max(Math.ceil(countRows[0].total / limit), 1),
      },
    })
  }),
)

// ── POST /admin/run-auto-cancel ───────────────────────────────────────────────
// Manually trigger the auto-cancel job (Admin only).
router.post(
  '/run-auto-cancel',
  requireRole('SuperAdmin'),
  asyncHandler(async (req, res) => {
    await runAutoCancelJob()
    res.json({ message: 'Auto-cancel job completed. Check server logs for details.' })
  }),
)

// ── Backup & Export helpers (SuperAdmin only) ─────────────────────────────

router.get(
  '/backup/status',
  requireRole('SuperAdmin'),
  asyncHandler(async (req, res) => {
    const lastBackupAt = await getSystemConfigValue('general', 'last_backup_at', null)
    const lastBackupFile = await getSystemConfigValue('general', 'last_backup_file', null)
    res.json({ lastBackupAt, lastBackupFile })
  }),
)

router.get(
  '/backup/download',
  requireRole('SuperAdmin'),
  asyncHandler(async (req, res) => {
    const userId = req.user?.id || null
    const userRow = userId ? await db.query('SELECT full_name FROM users WHERE id = $1', [userId]) : { rows: [] }
    const changedByName = userRow.rows[0]?.full_name || 'Unknown'
    const ipAddress = req.ip || req.connection?.remoteAddress || null

    let result
    try {
      result = await createSqlGzipBackup({ reason: 'manual', requestedByUserId: userId })
    } catch (e) {
      const msg = String(e?.message || '')
      if (msg.toLowerCase().includes('spawn') || msg.toLowerCase().includes('enoent')) {
        return res.status(500).json({
          message:
            'Backup failed: SQL backup requires pg_dump. Install PostgreSQL client tools (pg_dump), or run the backend via docker-compose (postgres service) so the server can generate the dump.',
        })
      }
      throw e
    }

    const nowIso = new Date().toISOString()
    await setSystemConfigValue({ category: 'general', key: 'last_backup_at', value: nowIso, userId, changedByName, ipAddress })
    await setSystemConfigValue({ category: 'general', key: 'last_backup_file', value: result.fileName, userId, changedByName, ipAddress })

    await writeAuditLog({
      userId,
      action: 'CREATE_DB_BACKUP',
      entity: 'backups',
      entityId: null,
      meta: { file: result.fileName, bytes: result.bytes, format: result.format },
    })

    res.setHeader('Content-Type', 'application/gzip')
    res.setHeader('Content-Disposition', `attachment; filename=${result.fileName}`)
    return res.sendFile(result.filePath)
  }),
)

module.exports = router

