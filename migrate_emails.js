const db = require('./backend/src/config/db');

async function migrate() {
  try {
    console.log('Adding banner_image_url to email_campaigns table...');
    await db.query(`
      ALTER TABLE email_campaigns 
      ADD COLUMN IF NOT EXISTS banner_image_url TEXT
    `);
    console.log('Migration successful.');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  }
}

migrate();
