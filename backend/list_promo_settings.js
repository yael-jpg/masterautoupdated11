const db = require('./src/config/db');

async function listAllPromoSettings() {
  try {
    console.log('📋 All Promo Configuration Settings:\n');
    
    const result = await db.query(
      `SELECT "key", value FROM configuration_settings WHERE category = 'promo' ORDER BY "key"`
    );
    
    console.log(`Found ${result.rows.length} settings:\n`);
    
    const rules = [];
    const messages = [];
    
    result.rows.forEach(row => {
      if (row.key.startsWith('promo_')) {
        messages.push(row);
      } else {
        rules.push(row);
      }
    });
    
    console.log('🔧 CONFIGURATION RULES:');
    console.log('─'.repeat(60));
    rules.forEach(row => {
      const val = row.value.length > 40 ? row.value.substring(0, 37) + '...' : row.value;
      console.log(`  ${row.key.padEnd(30)} = ${val}`);
    });
    
    console.log('\n💬 MESSAGE TEMPLATES:');
    console.log('─'.repeat(60));
    messages.forEach(row => {
      const val = row.value.length > 40 ? row.value.substring(0, 37) + '...' : row.value;
      console.log(`  ${row.key.padEnd(30)} = ${val}`);
    });
    
    console.log('\n✅ All settings loaded successfully!\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

listAllPromoSettings();
