const db = require('./src/config/db');

async function completeSystemVerification() {
  try {
    console.log('🔍 MESSAGE TEMPLATES SYSTEM VERIFICATION\n');
    console.log('═'.repeat(70));
    
    // 1. Check database table exists
    console.log('\n1️⃣  Database Table Status:');
    try {
      const tableCheck = await db.query(
        "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='configuration_settings')"
      );
      const exists = tableCheck.rows[0].exists;
      console.log(`   ${exists ? '✅' : '❌'} configuration_settings table exists`);
    } catch (e) {
      console.log(`   ❌ Error checking table: ${e.message.substring(0, 50)}`);
    }

    // 2. Check all promo message fields exist
    console.log('\n2️⃣  Promo Message Template Fields:');
    const promoFields = ['promo_enabled', 'promo_subject', 'promo_greeting', 'promo_reminders', 'promo_closing'];
    for (const field of promoFields) {
      const result = await db.query(
        'SELECT value FROM configuration_settings WHERE category = $1 AND "key" = $2',
        ['promo', field]
      );
      if (result.rowCount > 0) {
        console.log(`   ✅ ${field.padEnd(20)} = "${result.rows[0].value.substring(0, 40)}..."`);
      } else {
        console.log(`   ❌ ${field.padEnd(20)} NOT FOUND`);
      }
    }

    // 3. Check PMS email complete
    console.log('\n3️⃣  PMS Email Template Fields:');
    const pmsFields = ['enabled', 'subject', 'greeting', 'reminders', 'closing'];
    for (const field of pmsFields) {
      const result = await db.query(
        'SELECT value FROM configuration_settings WHERE category = $1 AND "key" = $2',
        ['pms_email', field]
      );
      if (result.rowCount > 0) {
        console.log(`   ✅ ${field.padEnd(20)} = "${result.rows[0].value.substring(0, 40)}..."`);
      } else {
        console.log(`   ❌ ${field.padEnd(20)} NOT FOUND`);
      }
    }

    // 4. Check subscription email complete
    console.log('\n4️⃣  Subscription Email Template Fields:');
    const subFields = ['enabled', 'subject', 'greeting', 'reminders', 'closing'];
    for (const field of subFields) {
      const result = await db.query(
        'SELECT value FROM configuration_settings WHERE category = $1 AND "key" = $2',
        ['subscription_email', field]
      );
      if (result.rowCount > 0) {
        console.log(`   ✅ ${field.padEnd(20)} = "${result.rows[0].value.substring(0, 40)}..."`);
      } else {
        console.log(`   ❌ ${field.padEnd(20)} NOT FOUND`);
      }
    }

    // 5. Check total promo settings
    console.log('\n5️⃣  Total Promo Configuration Settings:');
    const totalPromo = await db.query(
      'SELECT COUNT(*) as count FROM configuration_settings WHERE category = $1',
      ['promo']
    );
    console.log(`   📊 ${totalPromo.rows[0].count} total settings in promo category`);
    console.log(`   ${totalPromo.rows[0].count >= 17 ? '✅' : '⚠️'} Expected 17+ (12 rules + 5 message)`);

    // 6. Check PMS settings
    console.log('\n6️⃣  Total PMS Email Settings:');
    const totalPms = await db.query(
      'SELECT COUNT(*) as count FROM configuration_settings WHERE category = $1',
      ['pms_email']
    );
    console.log(`   📊 ${totalPms.rows[0].count} total settings in pms_email category`);
    console.log(`   ${totalPms.rows[0].count >= 5 ? '✅' : '⚠️'} Expected 5 (enabled, subject, greeting, reminders, closing)`);

    // 7. Check subscription settings
    console.log('\n7️⃣  Total Subscription Email Settings:');
    const totalSub = await db.query(
      'SELECT COUNT(*) as count FROM configuration_settings WHERE category = $1',
      ['subscription_email']
    );
    console.log(`   📊 ${totalSub.rows[0].count} total settings in subscription_email category`);
    console.log(`   ${totalSub.rows[0].count >= 5 ? '✅' : '⚠️'} Expected 5 (enabled, subject, greeting, reminders, closing)`);

    // 8. Check audit logging
    console.log('\n8️⃣  Audit Logging Support:');
    const auditCheck = await db.query(
      "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='configuration_audit_logs')"
    );
    console.log(`   ${auditCheck.rows[0].exists ? '✅' : '❌'} configuration_audit_logs table exists`);
    
    // 9. Sample config fetch simulation
    console.log('\n9️⃣  API Endpoint Simulation (GET /api/config/category/promo):');
    const promoConfig = await db.query(
      'SELECT "key", value FROM configuration_settings WHERE category = $1 ORDER BY "key"',
      ['promo']
    );
    const configMap = {};
    promoConfig.rows.forEach(row => {
      configMap[row.key] = row.value;
    });
    
    const messageFields = Object.keys(configMap).filter(k => k.startsWith('promo_'));
    const ruleFields = Object.keys(configMap).filter(k => !k.startsWith('promo_'));
    
    console.log(`   📋 Message Fields: ${messageFields.length} fields`);
    messageFields.forEach(k => console.log(`      • ${k}`));
    console.log(`   📋 Rule Fields: ${ruleFields.length} fields`);
    
    // 10. Final summary
    console.log('\n🎯 Summary:');
    console.log('═'.repeat(70));
    const allGood = 
      totalPromo.rows[0].count >= 17 &&
      totalPms.rows[0].count >= 5 &&
      totalSub.rows[0].count >= 5 &&
      promoFields.every(f => Object.keys(configMap).includes(f));
    
    if (allGood) {
      console.log('\n✅ ALL SYSTEMS GO! Message Template system is fully deployed.\n');
      console.log('Next Steps:');
      console.log('1. Go to Configuration → 🎁 Promo Codes');
      console.log('2. Scroll to "Promo Code Email Message" section');
      console.log('3. Edit subject, greeting, reminders, closing');
      console.log('4. Create an email campaign and select a promo code');
      console.log('5. Subject will auto-fill from configuration\n');
    } else {
      console.log('\n⚠️  INCOMPLETE: Some message template fields are missing.\n');
      console.log('Missing fields:');
      const missingPromo = promoFields.filter(f => !Object.keys(configMap).includes(f));
      if (missingPromo.length > 0) {
        console.log(`  • Promo: ${missingPromo.join(', ')}`);
      }
      if (totalPms.rows[0].count < 5) {
        console.log(`  • PMS Email: Missing ${5 - totalPms.rows[0].count} fields`);
      }
      if (totalSub.rows[0].count < 5) {
        console.log(`  • Subscription: Missing ${5 - totalSub.rows[0].count} fields`);
      }
    }
    
    console.log('\n✨ For more information, see:');
    console.log('  • EMAIL_MESSAGE_TEMPLATES_GUIDE.md - User guide');
    console.log('  • IMPLEMENTATION_MESSAGE_TEMPLATES.md - Technical details');
    console.log('  • MESSAGE_TEMPLATES_QUICK_SUMMARY.md - Quick reference\n');
    
    process.exit(allGood ? 0 : 1);
  } catch (error) {
    console.error('\n❌ Verification Error:', error.message);
    process.exit(1);
  }
}

completeSystemVerification();
