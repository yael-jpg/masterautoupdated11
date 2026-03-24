const cron = require('node-cron')
const fs = require('fs')
const path = require('path')
const db = require('../config/db')

function startBackupJob() {
  cron.schedule('0 2 * * *', async () => {
    const backupDir = path.join(process.cwd(), 'backups')
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true })
    }

    const filePath = path.join(backupDir, `daily-backup-${Date.now()}.json`)
    const customers = await db.query('SELECT * FROM customers ORDER BY id DESC LIMIT 200')
    const sales = await db.query('SELECT * FROM sales ORDER BY id DESC LIMIT 200')
    fs.writeFileSync(filePath, JSON.stringify({ customers: customers.rows, sales: sales.rows }, null, 2))
  })
}

module.exports = { startBackupJob }
