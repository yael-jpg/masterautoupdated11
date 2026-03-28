const fs = require('fs')
const path = require('path')
const db = require('../config/db')

function health(req, res) {
  res.json({ status: 'ok', service: 'masterauto-backend' })
}

function uploadsTest(req, res) {
  const uploadsPath = path.join(__dirname, '../../public/uploads/vehicles')

  try {
    const files = fs.readdirSync(uploadsPath)
    res.json({
      message: 'Uploads directory accessible',
      path: uploadsPath,
      files: files.filter((f) => !f.startsWith('.')),
    })
  } catch (error) {
    res.status(500).json({
      message: 'Error accessing uploads directory',
      error: error.message,
    })
  }
}

async function ready(req, res) {
  try {
    await db.query('SELECT 1 AS ok')
    return res.json({
      status: 'ready',
      service: 'masterauto-backend',
      checks: {
        database: 'ok',
      },
    })
  } catch (error) {
    return res.status(503).json({
      status: 'not_ready',
      service: 'masterauto-backend',
      checks: {
        database: 'failed',
      },
      message: error.message,
    })
  }
}

module.exports = {
  health,
  ready,
  uploadsTest,
}
