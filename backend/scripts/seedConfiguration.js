const db = require('../src/config/db')

/**
 * Script to seed configuration settings into the database
 * Run: node backend/scripts/seedConfiguration.js
 */

const configSettings = [
  // A. General Settings
  {
    category: 'general',
    key: 'system_name',
    value: 'Master Auto',
    description: 'Main system name displayed throughout the app',
    data_type: 'string',
    is_editable: true,
  },
  {
    category: 'general',
    key: 'default_currency',
    value: 'PHP',
    description: 'Default currency for transactions',
    data_type: 'string',
    is_editable: true,
  },
  {
    category: 'general',
    key: 'time_zone',
    value: 'Asia/Manila',
    description: 'System time zone settings',
    data_type: 'string',
    is_editable: true,
  },
  {
    category: 'general',
    key: 'date_format',
    value: 'MM/DD/YYYY',
    description: 'Default date format for display',
    data_type: 'string',
    is_editable: true,
  },
  {
    category: 'general',
    key: 'system_logo_url',
    value: '/images/logo.png',
    description: 'URL to system logo',
    data_type: 'string',
    is_editable: true,
  },
  {
    category: 'general',
    key: 'system_email',
    value: 'info@masterauto.com',
    description: 'System email for notifications',
    data_type: 'string',
    is_editable: true,
  },
  {
    category: 'general',
    key: 'language',
    value: 'en',
    description: 'Default language',
    data_type: 'string',
    is_editable: true,
  },
  // B. Business Information
  {
    category: 'business',
    key: 'business_name',
    value: 'Master Auto Service Center',
    description: 'Official business name',
    data_type: 'string',
    is_editable: true,
  },
  {
    category: 'business',
    key: 'business_address',
    value: '123 Auto Street, Manila',
    description: 'Business address',
    data_type: 'string',
    is_editable: true,
  },
  {
    category: 'business',
    key: 'business_contact',
    value: '+63 2 1234 5678',
    description: 'Main contact number',
    data_type: 'string',
    is_editable: true,
  },
  {
    category: 'business',
    key: 'business_email',
    value: 'contact@masterauto.com',
    description: 'Business email address',
    data_type: 'string',
    is_editable: true,
  },
  {
    category: 'business',
    key: 'tax_vat_rate',
    value: '12',
    description: 'VAT rate percentage',
    data_type: 'number',
    is_editable: true,
  },
  {
    category: 'business',
    key: 'registration_number',
    value: '',
    description: 'Business registration number',
    data_type: 'string',
    is_editable: true,
  },
  {
    category: 'business',
    key: 'operating_hours',
    value: '{"mon_fri":"9:00 AM - 6:00 PM","sat":"9:00 AM - 5:00 PM","sun":"Closed"}',
    description: 'Operating hours by day',
    data_type: 'json',
    is_editable: true,
  },
  // C. Vehicle Configuration
  {
    category: 'vehicle',
    key: 'enable_vehicle_makes',
    value: 'true',
    description: 'Enable vehicle make management',
    data_type: 'boolean',
    is_editable: true,
  },
  {
    category: 'vehicle',
    key: 'enable_vehicle_models',
    value: 'true',
    description: 'Enable vehicle model management',
    data_type: 'boolean',
    is_editable: true,
  },
  {
    category: 'vehicle',
    key: 'enable_variants',
    value: 'true',
    description: 'Enable vehicle variant management',
    data_type: 'boolean',
    is_editable: true,
  },
  {
    category: 'vehicle',
    key: 'plate_validation_enabled',
    value: 'true',
    description: 'Enable plate number validation',
    data_type: 'boolean',
    is_editable: true,
  },
  {
    category: 'vehicle',
    key: 'plate_format',
    value: 'XX###XXXX|###XXXX|XXXX###|ABC1234',
    description: 'Accepted plate formats (regex patterns)',
    data_type: 'string',
    is_editable: true,
  },
  {
    category: 'vehicle',
    key: 'default_categories',
    value: '["Sedan","SUV","Hatchback","Pickup","Van"]',
    description: 'Default vehicle categories',
    data_type: 'json',
    is_editable: true,
  },
  {
    category: 'vehicle',
    key: 'allow_custom_plate',
    value: 'false',
    description: 'Allow vehicles with placeholder plates',
    data_type: 'boolean',
    is_editable: true,
  },
  // D. Booking Rules
  {
    category: 'booking',
    key: 'enable_guest_booking',
    value: 'false',
    description: 'Allow bookings without customer registration',
    data_type: 'boolean',
    is_editable: true,
  },
  {
    category: 'booking',
    key: 'allow_cancel_after_partial_payment',
    value: 'true',
    description: 'Allow cancellation after partial payment',
    data_type: 'boolean',
    is_editable: true,
  },
  {
    category: 'booking',
    key: 'allow_edit_after_approval',
    value: 'false',
    description: 'Allow editing booking details after approval',
    data_type: 'boolean',
    is_editable: true,
  },
  {
    category: 'booking',
    key: 'auto_complete_when_paid',
    value: 'false',
    description: 'Auto-mark booking as completed when fully paid',
    data_type: 'boolean',
    is_editable: true,
  },
  {
    category: 'booking',
    key: 'auto_cancel_unpaid_hours',
    value: '48',
    description: 'Hours to wait before auto-cancelling unpaid bookings',
    data_type: 'number',
    is_editable: true,
  },
  {
    category: 'booking',
    key: 'minimum_booking_notice',
    value: '24',
    description: 'Minimum hours notice required to book',
    data_type: 'number',
    is_editable: true,
  },
  {
    category: 'booking',
    key: 'allow_multiple_services',
    value: 'true',
    description: 'Allow multiple services in single booking',
    data_type: 'boolean',
    is_editable: true,
  },
  {
    category: 'booking',
    key: 'require_phone_verification',
    value: 'false',
    description: 'Require phone verification for guest bookings',
    data_type: 'boolean',
    is_editable: true,
  },
  {
    category: 'booking',
    key: 'branch_locations',
    value: '["Cubao","Manila"]',
    description: 'List of branch locations shown in the New Booking dropdown',
    data_type: 'json',
    is_editable: true,
  },
  // E. Payment Configuration
  {
    category: 'payment',
    key: 'enable_partial_payments',
    value: 'true',
    description: 'Enable partial/installment payments',
    data_type: 'boolean',
    is_editable: true,
  },
  {
    category: 'payment',
    key: 'minimum_down_payment_percentage',
    value: '30',
    description: 'Minimum down payment as percentage of total',
    data_type: 'number',
    is_editable: true,
  },
  {
    category: 'payment',
    key: 'accepted_payment_methods',
    value: '["Cash","Credit Card","Debit Card","Bank Transfer","GCash","PayMaya"]',
    description: 'List of accepted payment methods',
    data_type: 'json',
    is_editable: true,
  },
  {
    category: 'payment',
    key: 'enable_refunds',
    value: 'true',
    description: 'Enable refund processing',
    data_type: 'boolean',
    is_editable: true,
  },
  {
    category: 'payment',
    key: 'refund_eligibility_days',
    value: '30',
    description: 'Days after payment to allow refunds',
    data_type: 'number',
    is_editable: true,
  },
  {
    category: 'payment',
    key: 'payment_due_days',
    value: '30',
    description: 'Days after booking for full payment due',
    data_type: 'number',
    is_editable: true,
  },
  {
    category: 'payment',
    key: 'enable_online_payment',
    value: 'false',
    description: 'Enable online payment gateway integration',
    data_type: 'boolean',
    is_editable: true,
  },
  {
    category: 'payment',
    key: 'online_payment_provider',
    value: '',
    description: 'Online payment provider (Stripe, PayMongo, etc)',
    data_type: 'string',
    is_editable: true,
  },
  // F. Sales Configuration
  {
    category: 'sales',
    key: 'include_archived_in_reports',
    value: 'false',
    description: 'Include archived records in sales reports',
    data_type: 'boolean',
    is_editable: true,
  },
  {
    category: 'sales',
    key: 'default_service_pricing',
    value: '{"labor_cost":"hourly","parts_markup":"25"}',
    description: 'Default pricing rules for services',
    data_type: 'json',
    is_editable: true,
  },
  {
    category: 'sales',
    key: 'calculate_daily_sales',
    value: 'true',
    description: 'Auto-calculate daily sales summary',
    data_type: 'boolean',
    is_editable: true,
  },
  {
    category: 'sales',
    key: 'report_generation_time',
    value: '00:00',
    description: 'Time to generate daily reports (HH:MM format)',
    data_type: 'string',
    is_editable: true,
  },
  {
    category: 'sales',
    key: 'enable_sales_targets',
    value: 'false',
    description: 'Enable sales target tracking',
    data_type: 'boolean',
    is_editable: true,
  },
  {
    category: 'sales',
    key: 'sales_target_amount',
    value: '0',
    description: 'Monthly sales target amount',
    data_type: 'number',
    is_editable: true,
  },
  // G. User Roles & Permissions
  {
    category: 'roles',
    key: 'enable_role_based_access',
    value: 'true',
    description: 'Enable role-based access control',
    data_type: 'boolean',
    is_editable: true,
  },
  {
    category: 'roles',
    key: 'default_staff_role',
    value: 'Mechanic',
    description: 'Default role for new staff members',
    data_type: 'string',
    is_editable: true,
  },
  {
    category: 'roles',
    key: 'require_approval_for_roles',
    value: 'false',
    description: 'Require admin approval for role assignments',
    data_type: 'boolean',
    is_editable: true,
  },
  {
    category: 'roles',
    key: 'allow_multiple_roles',
    value: 'false',
    description: 'Allow users to have multiple roles',
    data_type: 'boolean',
    is_editable: true,
  },

  // Quotation Email Settings
  {
    category: 'quotation_email',
    key: 'enabled',
    value: 'true',
    description: 'Send a Service Confirmation email when a quotation is approved',
    data_type: 'boolean',
    is_editable: true,
  },
  {
    category: 'quotation_email',
    key: 'subject',
    value: '',
    description: 'Custom email subject line (leave blank for default)',
    data_type: 'string',
    is_editable: true,
  },
  {
    category: 'quotation_email',
    key: 'greeting',
    value: 'Great news! Your service quotation has been APPROVED. Please review the details below and contact us to confirm your service schedule.',
    description: 'Opening paragraph of the Service Confirmation email',
    data_type: 'string',
    is_editable: true,
  },
  {
    category: 'quotation_email',
    key: 'reminders',
    value: 'Please arrive on time on your scheduled service date.\nBring this confirmation reference number: {quotation_no}.\nFinal cost may vary depending on additional parts or discovered issues.\nEstimated completion time will be confirmed upon check-in.\nFor rescheduling, please contact us at least 24 hours in advance.',
    description: 'Important Reminders bullet points (one per line)',
    data_type: 'string',
    is_editable: true,
  },
  {
    category: 'quotation_email',
    key: 'closing',
    value: 'Thank you for trusting MasterAuto!',
    description: 'Closing line before the email signature',
    data_type: 'string',
    is_editable: true,
  },

  // Roles — Assigned Workers
  {
    category: 'roles',
    key: 'assigned_workers',
    value: '["Mark Santos","Jay Reyes","Carlo dela Cruz","Bong Villanueva","Renz Aquino","Dodong Macaraeg"]',
    description: 'JSON array of worker/installer names',
    data_type: 'string',
    is_editable: true,
  },
]

async function seedConfiguration() {
  try {
    console.log('🌱 Starting configuration seeding...')
    
    let inserted = 0
    let skipped = 0

    for (const config of configSettings) {
      try {
        await db.query(
          `INSERT INTO configuration_settings (category, "key", value, description, data_type, is_editable)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (category, "key") DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description`,
          [config.category, config.key, config.value, config.description, config.data_type, config.is_editable]
        )
        inserted++
      } catch (err) {
        if (err.code === 'ER_DUP_ENTRY' || err.code === '23505') {
          skipped++
        } else {
          console.error(`❌ Error inserting ${config.category}.${config.key}:`, err.message)
        }
      }
    }

    console.log(`✅ Configuration seeding complete!`)
    console.log(`   📝 Inserted: ${inserted}`)
    console.log(`   ⏭️  Skipped (already exists): ${skipped}`)
    process.exit(0)
  } catch (err) {
    console.error('❌ Fatal error:', err)
    process.exit(1)
  }
}

seedConfiguration()
