const db = require('./src/config/db');

async function verifyMigration() {
  try {
    console.log('Verifying Migration 083: Checking if message template settings exist...\n');
    
    const categories = ['promo', 'pms_email', 'subscription_email'];
    const fields = ['enabled', 'subject', 'greeting', 'reminders', 'closing'];
    
    let totalFound = 0;
    
    for (const category of categories) {
      console.log(`\n📁 Category: ${category}`);
      console.log('─'.repeat(60));
      
      for (const field of fields) {
        try {
          const result = await db.query(
            'SELECT category, "key", value FROM configuration_settings WHERE category = $1 AND "key" = $2',
            [category, field]
          );
          
          if (result.rows.length > 0) {
            const row = result.rows[0];
            const value = row.value.length > 50 ? row.value.substring(0, 47) + '...' : row.value;
            console.log(`  ✓ ${field.padEnd(15)} = "${value}"`);
            totalFound++;
          } else {
            console.log(`  ✗ ${field.padEnd(15)} NOT FOUND`);
          }
        } catch (err) {
          console.log(`  ✗ ${field.padEnd(15)} ERROR: ${err.message.substring(0, 30)}`);
        }
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log(`\n✅ Verification complete!`);
    console.log(`📊 Total settings found: ${totalFound}/${categories.length * fields.length}`);
    
    if (totalFound === categories.length * fields.length) {
      console.log('🎉 All message template settings are in the database!\n');
    } else {
      console.log('⚠️  Some settings are missing. You may need to run the migration again.\n');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Verification failed:', error.message);
    process.exit(1);
  }
}

verifyMigration();
