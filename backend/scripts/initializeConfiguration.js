const db = require('../src/config/db')

/**
 * Script to initialize configuration management tables
 * Run: node backend/scripts/initializeConfiguration.js
 */

async function initializeConfiguration() {
  try {
    console.log('🔧 Initializing configuration management tables...')

    // Create configuration_settings table
    console.log('📋 Creating configuration_settings table...')
    await db.query(`
      CREATE TABLE IF NOT EXISTS configuration_settings (
        id SERIAL PRIMARY KEY,
        category VARCHAR(50) NOT NULL,
        "key" VARCHAR(100) NOT NULL,
        value TEXT,
        description TEXT,
        data_type VARCHAR(20) DEFAULT 'string',
        is_editable BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by INT REFERENCES users(id) ON DELETE SET NULL,
        updated_by INT REFERENCES users(id) ON DELETE SET NULL,
        UNIQUE(category, "key")
      )
    `)
    console.log('✅ configuration_settings table created')

    // Create configuration_audit_logs table
    console.log('📋 Creating configuration_audit_logs table...')
    await db.query(`
      CREATE TABLE IF NOT EXISTS configuration_audit_logs (
        id SERIAL PRIMARY KEY,
        category VARCHAR(50) NOT NULL,
        "key" VARCHAR(100) NOT NULL,
        old_value TEXT,
        new_value TEXT,
        changed_by INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        change_reason TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        ip_address VARCHAR(45)
      )
    `)
    console.log('✅ configuration_audit_logs table created')

    // Create indexes
    console.log('📊 Creating indexes...')
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_config_category_key 
      ON configuration_settings(category, "key")
    `)
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at 
      ON configuration_audit_logs(created_at)
    `)
    console.log('✅ Indexes created')

    console.log('\n✅ Configuration tables initialized successfully!')
    process.exit(0)
  } catch (err) {
    console.error('❌ Error initializing configuration tables:', err.message)
    process.exit(1)
  }
}

initializeConfiguration()
