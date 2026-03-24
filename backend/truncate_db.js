const db = require('./src/config/db');

const tablesToTruncate = [
  // Logs / dashboard activity
  'audit_logs',
  'configuration_audit_logs',
  'config_change_logs',
  'sales',
  'sale_items',
  'quotations',
  'online_quotation_requests',
  'job_orders',
  'job_order_parts',
  'appointments',
  'payments',
  'notifications',
  'notification_logs',
  'activity_logs',
  'email_notifications',
  'email_campaigns',
  'campaign_recipients',
  'campaign_audiences',
  'campaign_assets',
  'status_transitions',
  'overpayment_resolutions',
  'refunds',
  'installer_commissions',
  'staff_commissions',
  // Inventory (wipe both catalog + movements per request)
  'inventory_items',
  'inventory_movements',
  'customer_notes',
  'customer_documents',
  'customer_credits',
  'customer_credit_usage',
  'conditional_releases',
  'vehicle_service_records',
  'vehicle_photos',
  'customers',
  'vehicles'
];

async function truncateDb() {
  console.log('Starting fresh-system reset (truncate operational data)...');
  try {
    for (const table of tablesToTruncate) {
      console.log(`Truncating ${table}...`);
      // Use CASCADE to handle dependencies and RESTART IDENTITY to reset IDs
      await db.query(`TRUNCATE TABLE "${table}" RESTART IDENTITY CASCADE`);
    }
    
    // Also reset reference number sequences if any
    console.log('Resetting reference number sequences...');
    await db.query(`UPDATE reference_number_sequences SET next_sequence = 1`);
    
    console.log('Truncation complete. Preserved: users/roles + master/reference lists (services, vehicle makes/models/variants/years, promo/discount rules, notification templates, system/config settings).');
    process.exit(0);
  } catch (err) {
    console.error('Error during truncation:', err);
    process.exit(1);
  }
}

truncateDb();
