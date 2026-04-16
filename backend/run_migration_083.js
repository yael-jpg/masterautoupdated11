const db = require('./src/config/db');

async function runMigrationFixed() {
  try {
    console.log('Running Migration 083: Adding message template configuration fields...\n');
    
    const settings = [
      // Promo Code Email Message Template
      { category: 'promo', key: 'promo_enabled', value: 'true', desc: 'Include promo message in email campaigns' },
      { category: 'promo', key: 'promo_subject', value: 'Exclusive Offer — {percent}% Off Your Next Service', desc: 'Subject line for promo emails' },
      { category: 'promo', key: 'promo_greeting', value: 'Hey {customer_name}! We have an exclusive offer just for you. Use code {code} for {percent}% off your next service.', desc: 'Opening message for promo email' },
      { category: 'promo', key: 'promo_reminders', value: 'This offer is valid for {days} days only.\nMinimum purchase of ₱{min_purchase} required.\nPromo code cannot be combined with other offers.', desc: 'Terms and conditions (newline separated)' },
      { category: 'promo', key: 'promo_closing', value: 'Don\'t miss out! Claim your discount today and give your vehicle the care it deserves.', desc: 'Closing message for promo email' },
      
      // PMS Email Message Template - Complete
      { category: 'pms_email', key: 'subject', value: 'PMS Reminder for {plate_number}', desc: 'Subject line for PMS reminder email' },
      { category: 'pms_email', key: 'greeting', value: 'This is to remind you that your vehicle plate no. {plate_number}, availed package {package_name} is due for your next preventive maintenance service.', desc: 'Opening message for PMS email' },
      { category: 'pms_email', key: 'reminders', value: 'Delaying your PMS may affect warranty coverage.\nYour last service was at {last_service_date}.\nBook early to avoid long wait times.', desc: 'Maintenance tips (newline separated)' },
      { category: 'pms_email', key: 'closing', value: 'Book your PMS appointment today to keep your vehicle in top condition.', desc: 'Closing message for PMS email' },
      
      // Subscription Email Message Template - Complete
      { category: 'subscription_email', key: 'subject', value: 'Your {package_name} Subscription is {status} — {plate_number}', desc: 'Subject line for subscription email' },
      { category: 'subscription_email', key: 'greeting', value: 'Dear {customer_name}, your {package_name} subscription for plate {plate_number} is {status}. Renew now to maintain continuous coverage and benefits.', desc: 'Opening message about subscription status' },
      { category: 'subscription_email', key: 'reminders', value: 'Your subscription expires on {end_date}.\nRenewal takes less than 5 minutes.\nAll benefits and coverage will cease after expiration.\nEarly renewal is available anytime.', desc: 'Renewal points (newline separated)' },
      { category: 'subscription_email', key: 'closing', value: 'Renew your subscription today and continue enjoying priority service and exclusive benefits.', desc: 'Closing call-to-action for renewal' },
    ];
    
    let inserted = 0;
    let skipped = 0;
    
    for (const setting of settings) {
      try {
        const result = await db.query(
          `INSERT INTO configuration_settings (category, "key", value, description, data_type, is_editable)
           VALUES ($1, $2, $3, $4, $5, TRUE)
           ON CONFLICT (category, "key") DO NOTHING
           RETURNING id`,
          [setting.category, setting.key, setting.value, setting.desc, 'string']
        );
        
        if (result.rowCount > 0) {
          console.log(`  ✓ ${setting.category}.${setting.key}`);
          inserted++;
        } else {
          console.log(`  ⚠ ${setting.category}.${setting.key} (already exists)`);
          skipped++;
        }
      } catch (err) {
        console.log(`  ✗ ${setting.category}.${setting.key}: ${err.message.substring(0, 40)}`);
      }
    }
    
    console.log(`\n✅ Migration 083 completed!`);
    console.log(`📊 Inserted: ${inserted}, Skipped: ${skipped}\n`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

runMigrationFixed();
