const express = require('express')
const { body } = require('express-validator')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const db = require('../config/db')
const env = require('../config/env')
const { asyncHandler } = require('../utils/asyncHandler')
const { writeAuditLog } = require('../utils/auditLog')
const { validateRequest } = require('../middleware/validateRequest')
const ConfigurationService = require('../services/configurationService')
const { randomB64url, deriveVerifierFromPassword, computeProof, timingSafeEqualB64url } = require('../utils/hashedLogin')

const router = express.Router()

let adminHashedColsChecked = false
let adminHashedColsAvailable = false

async function ensureAdminHashedLoginColumnsExist() {
  if (adminHashedColsChecked) return adminHashedColsAvailable
  adminHashedColsChecked = true
  try {
    const r = await db.query(
      `SELECT COUNT(*)::int AS cnt
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'users'
         AND column_name IN ('password_salt','password_verifier','password_verifier_iters')`,
    )
    adminHashedColsAvailable = Number(r.rows?.[0]?.cnt || 0) === 3
    return adminHashedColsAvailable
  } catch {
    adminHashedColsAvailable = false
    return false
  }
}

const clampMinutes = (v, { min = 1, max = 525600, fallback = 600 } = {}) => {
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.round(n)))
}

async function getAdminJwtTtlMinutes() {
  try {
    return clampMinutes(await ConfigurationService.get('system', 'admin_session_token_ttl_minutes'), { fallback: 600 })
  } catch {
    return 600
  }
}

async function getHashedLoginIters() {
  try {
    return clampMinutes(await ConfigurationService.get('system', 'hashed_login_pbkdf2_iters'), { min: 10000, max: 600000, fallback: 150000 })
  } catch {
    return 150000
  }
}

async function isForceHashedAdminLogin() {
  try {
    return Boolean(await ConfigurationService.get('system', 'force_hashed_admin_login'))
  } catch {
    return false
  }
}

// In-memory replay protection for challenge tokens (best-effort; per-process).
const usedChallengeJtis = new Map() // jti -> expiresAtMs
function markUsed(jti, expiresAtMs) {
  usedChallengeJtis.set(jti, expiresAtMs)
  // Opportunistic cleanup
  const now = Date.now()
  for (const [k, v] of usedChallengeJtis.entries()) {
    if (v <= now) usedChallengeJtis.delete(k)
  }
}

function wasUsed(jti) {
  const v = usedChallengeJtis.get(jti)
  if (!v) return false
  if (v <= Date.now()) {
    usedChallengeJtis.delete(jti)
    return false
  }
  return true
}

router.post(
  '/login/challenge',
  body('email').isEmail().withMessage('Valid email is required'),
  validateRequest,
  asyncHandler(async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase()

    const hasCols = await ensureAdminHashedLoginColumnsExist()
    if (!hasCols) {
      return res.json({ mode: 'plain' })
    }

    const iters = await getHashedLoginIters()
    const forceHashed = await isForceHashedAdminLogin()

    let result
    try {
      result = await db.query(
        `SELECT id, email, password_salt, password_verifier, password_verifier_iters
         FROM users
         WHERE LOWER(email) = LOWER($1)
         LIMIT 1`,
        [email],
      )
    } catch {
      // Schema not migrated yet (or partial migration) — fall back.
      return res.json({ mode: 'plain' })
    }

    const user = result.rows?.[0]
    const hasVerifier = Boolean(user?.password_verifier && user?.password_salt && user?.password_verifier_iters)

    if (!hasVerifier) {
      if (forceHashed && user) {
        return res.status(409).json({
          code: 'MISSING_VERIFIER',
          message: 'Hashed login is required but this account is not upgraded yet. Please disable force_hashed_admin_login temporarily to upgrade, or reset the password.',
        })
      }
      return res.json({ mode: 'plain' })
    }

    const nonce = randomB64url(32)
    const jti = randomB64url(16)
    const challengeToken = jwt.sign(
      { typ: 'admin_login_challenge', email, nonce, jti },
      env.jwtSecret,
      { expiresIn: 120 },
    )

    return res.json({
      mode: 'verifier',
      salt: user.password_salt,
      iters: Number(user.password_verifier_iters) || iters,
      nonce,
      challengeToken,
    })
  }),
)

router.post(
  '/login/response',
  body('email').isEmail().withMessage('Valid email is required'),
  body('challengeToken').notEmpty().withMessage('challengeToken is required'),
  body('proof').notEmpty().withMessage('proof is required'),
  validateRequest,
  asyncHandler(async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase()
    const challengeToken = String(req.body.challengeToken || '')
    const proof = String(req.body.proof || '')

    let payload
    try {
      payload = jwt.verify(challengeToken, env.jwtSecret)
    } catch {
      return res.status(401).json({ message: 'Invalid or expired challenge.' })
    }

    if (payload?.typ !== 'admin_login_challenge' || String(payload?.email || '').toLowerCase() !== email) {
      return res.status(401).json({ message: 'Invalid challenge.' })
    }

    const jti = String(payload?.jti || '')
    if (!jti) return res.status(401).json({ message: 'Invalid challenge.' })
    if (wasUsed(jti)) return res.status(401).json({ message: 'Challenge already used.' })

    const result = await db.query(
      `SELECT u.id, u.full_name, u.email, u.password_verifier, u.password_salt, u.password_verifier_iters, r.name AS role
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE LOWER(u.email) = LOWER($1)
       LIMIT 1`,
      [email],
    )

    const user = result.rows?.[0]
    if (!user || !user.password_verifier) {
      return res.status(401).json({ message: 'Invalid credentials' })
    }

    const expected = computeProof({ verifierB64url: user.password_verifier, nonce: String(payload.nonce || '') })
    const ok = timingSafeEqualB64url(expected, proof)
    if (!ok) return res.status(401).json({ message: 'Invalid credentials' })

    // Mark challenge used until its JWT expiration time (best-effort)
    const expMs = typeof payload.exp === 'number' ? payload.exp * 1000 : Date.now() + 120000
    markUsed(jti, expMs)

    const ttlMinutes = await getAdminJwtTtlMinutes()
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      env.jwtSecret,
      { expiresIn: ttlMinutes * 60 },
    )

    await writeAuditLog({ userId: user.id, action: 'LOGIN', entity: 'auth', meta: { email } })

    return res.json({
      token,
      user: {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        role: user.role,
      },
    })
  }),
)

router.post(
  '/login',
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  validateRequest,
  asyncHandler(async (req, res) => {
    const { email, password } = req.body

    const hasCols = await ensureAdminHashedLoginColumnsExist()

    let result
    if (hasCols) {
      try {
        result = await db.query(
          `SELECT u.id, u.full_name, u.email, u.password_hash,
                  u.password_salt, u.password_verifier, u.password_verifier_iters,
                  r.name AS role
           FROM users u
           JOIN roles r ON r.id = u.role_id
           WHERE u.email = $1`,
          [email],
        )
      } catch {
        // Fallback below
      }
    }
    if (!result) {
      result = await db.query(
        `SELECT u.id, u.full_name, u.email, u.password_hash, r.name AS role
         FROM users u
         JOIN roles r ON r.id = u.role_id
         WHERE u.email = $1`,
        [email],
      )
    }

    const user = result.rows[0]
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' })
    }

    const isValid = await bcrypt.compare(password || '', user.password_hash)
    if (!isValid) {
      return res.status(401).json({ message: 'Invalid credentials' })
    }

    // If verifier isn't set yet, upgrade it now (so the next login can be hashed-in-browser).
    if (hasCols && (!user.password_verifier || !user.password_salt || !user.password_verifier_iters)) {
      try {
        const iters = await getHashedLoginIters()
        const salt = randomB64url(16)
        const verifier = deriveVerifierFromPassword({ password, saltB64url: salt, iterations: iters })
        await db.query(
          `UPDATE users
           SET password_salt = $1,
               password_verifier = $2,
               password_verifier_iters = $3
           WHERE id = $4`,
          [salt, verifier, iters, user.id],
        )
      } catch {
        // Ignore upgrade failures; keep normal login working.
      }
    }

    const ttlMinutes = await getAdminJwtTtlMinutes()

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      env.jwtSecret,
      { expiresIn: ttlMinutes * 60 },
    )

    await writeAuditLog({ userId: user.id, action: 'LOGIN', entity: 'auth', meta: { email } })

    return res.json({
      token,
      user: {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        role: user.role,
      },
    })
  }),
)

module.exports = router

