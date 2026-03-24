const express = require('express')
const { body } = require('express-validator')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const db = require('../config/db')
const env = require('../config/env')
const { asyncHandler } = require('../utils/asyncHandler')
const { writeAuditLog } = require('../utils/auditLog')
const { validateRequest } = require('../middleware/validateRequest')

const router = express.Router()

router.post(
  '/login',
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  validateRequest,
  asyncHandler(async (req, res) => {
    const { email, password } = req.body

    const result = await db.query(
      `SELECT u.id, u.full_name, u.email, u.password_hash, r.name AS role
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE u.email = $1`,
      [email],
    )

    const user = result.rows[0]
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' })
    }

    const isValid = await bcrypt.compare(password || '', user.password_hash)
    if (!isValid) {
      return res.status(401).json({ message: 'Invalid credentials' })
    }

    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, env.jwtSecret, {
      expiresIn: '10h',
    })

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

