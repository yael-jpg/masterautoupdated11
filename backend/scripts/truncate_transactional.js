const db = require('../src/config/db');

// Tables to TRUNCATE (Transactional Data)
// Preserving: users, roles, system_config, configuration_settings, notification_templates, 
// payment_methods, promo_codes, installer_commission_rates, discount_rules, 
// vehicles, vehicle_makes, vehicle_models, vehicle_variants, vehicle_years, 
// customers, services, inventory_items.
const tablesToTruncate = [
  'sales',
  'quotations',
  'job_orders',
  'appointments',
  'payments',
  'audit_logs',
  'activity_logs',
  'notification_logs',
  'email_notifications',
  'email_campaigns',
  'campaign_recipients',
  'status_transitions',
  'overpayment_resolutions',
  'refunds',
  'installer_commissions',
  'staff_commissions',
  'inventory_movements',
  'customer_notes',
  'customer_documents',
  'customer_credits',
  'customer_credit_usage',
  'conditional_releases',
  'vehicle_service_records',
  'vehicle_photos',
  'config_change_logs',
  'configuration_audit_logs',
  'sale_items',
  'job_order_parts',
  'notifications'
];

async function truncateTransactional() {
  console.log('Starting truncation of transactional data only...');
  console.log('Preserving: Admin/Security, Configuration, Customers, and Registered Vehicles.');
  
  try {
    for (const table of tablesToTruncate) {
      console.log(`Truncating ${table}...`);
      // Use CASCADE to handle dependencies and RESTART IDENTITY to reset IDs
      await db.query(`TRUNCATE TABLE "${table}" RESTART IDENTITY CASCADE`);
    }
    
    // Reset reference number sequences so new JOs/QTs start from 1
    console.log('Resetting reference number sequences...');
    await db.query(`UPDATE reference_number_sequences SET next_sequence = 1`);
    
    console.log('Successfully truncated transactional data.');
    console.log('All master data and system configurations have been preserved.');
    process.exit(0);
  } catch (err) {
    console.error('Error during truncation:', err);
    process.exit(1);
  }
}

truncateTransactional();
