import { useCallback, useEffect, useRef, useState } from 'react'
import { apiGet, apiPut, apiPost, apiPatch, apiDelete, pushToast } from '../api/client'
import { SERVICE_CATALOG, VEHICLE_SIZE_OPTIONS, getCatalogGroups } from '../data/serviceCatalog'
import './SettingsPage.css'
import CampaignsModal from './CampaignsModal'
import PromoEmailModal from './PromoEmailModal'
import { emitConfigUpdated, emitVehicleMakesUpdated } from '../utils/events'

// ── Payment methods tag editor ───────────────────────────────────────────────
const PRESET_PAYMENT_METHODS = ['Cash', 'GCash', 'Credit Card', 'Debit Card', 'Bank Transfer', 'PayMaya', 'Check']

function MethodsEditor({ value, onChange, disabled }) {
  const [customInput, setCustomInput] = useState('')

  let selected = []
  try { selected = JSON.parse(value || '[]') } catch { selected = [] }
  if (!Array.isArray(selected)) selected = []

  const toggle = (method) => {
    const next = selected.includes(method)
      ? selected.filter((m) => m !== method)
      : [...selected, method]
    onChange(JSON.stringify(next))
  }

  const addCustom = () => {
    const trimmed = customInput.trim()
    if (!trimmed || selected.includes(trimmed)) return
    onChange(JSON.stringify([...selected, trimmed]))
    setCustomInput('')
  }

  const removeCustom = (method) => {
    onChange(JSON.stringify(selected.filter((m) => m !== method)))
  }

  const allMethods = [
    ...PRESET_PAYMENT_METHODS,
    ...selected.filter((m) => !PRESET_PAYMENT_METHODS.includes(m)),
  ]

  return (
    <div className="methods-editor">
      <div className="methods-switch-list">
        {allMethods.map((m) => {
          const isOn = selected.includes(m)
          const isCustom = !PRESET_PAYMENT_METHODS.includes(m)
          return (
            <div key={m} className="methods-switch-row">
              <button
                type="button"
                className={`toggle-switch ${isOn ? 'toggle-on' : 'toggle-off'}`}
                onClick={() => toggle(m)}
                disabled={disabled}
                aria-checked={isOn}
              >
                <span className="toggle-knob" />
              </button>
              <span className={`methods-switch-label${isOn ? ' methods-switch-label--on' : ''}`}>{m}</span>
              {isCustom && !disabled && (
                <button
                  type="button"
                  className="methods-remove-btn"
                  onClick={() => removeCustom(m)}
                  title="Remove"
                >×</button>
              )}
            </div>
          )
        })}
      </div>
      {!disabled && (
        <div className="methods-add-row">
          <input
            type="text"
            className="settings-input methods-add-input"
            value={customInput}
            placeholder="Add custom method…"
            onChange={(e) => setCustomInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom() } }}
          />
          <button
            type="button"
            className="methods-add-btn"
            onClick={addCustom}
            disabled={!customInput.trim()}
          >
            + Add
          </button>
        </div>
      )}
    </div>
  )
}

// ── Tag list editor (used for default_categories etc.) ─────────────────────
function TagListEditor({ value, onChange, disabled, placeholder }) {
  const [input, setInput] = useState('')

  let items = []
  try { items = JSON.parse(value || '[]') } catch { items = [] }
  if (!Array.isArray(items)) items = []

  const add = () => {
    const trimmed = input.trim()
    if (!trimmed || items.includes(trimmed)) return
    onChange(JSON.stringify([...items, trimmed]))
    setInput('')
  }

  const remove = (item) => {
    onChange(JSON.stringify(items.filter((i) => i !== item)))
  }

  return (
    <div className="tag-list-editor">
      <div className="tag-list-tags">
        {items.map((item) => (
          <span key={item} className="tag-pill">
            {item}
            {!disabled && (
              <button type="button" className="tag-pill-remove" onClick={() => remove(item)} title="Remove">×</button>
            )}
          </span>
        ))}
        {items.length === 0 && <span className="tag-list-empty">No categories added yet</span>}
      </div>
      {!disabled && (
        <div className="tag-list-add-row">
          <input
            type="text"
            className="settings-input tag-list-input"
            value={input}
            placeholder={placeholder || 'Add category…'}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
          />
          <button type="button" className="tag-list-add-btn" onClick={add} disabled={!input.trim()}>+ Add</button>
        </div>
      )}
    </div>
  )
}

// ── Operating Hours Editor (friendly key-value editor) ───────────────────────
function OperatingHoursEditor({ value, onChange, disabled }) {
  let schedule = { mon_fri: '9:00 AM - 6:00 PM', sat: '9:00 AM - 5:00 PM', sun: 'Closed' }
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      schedule = { ...schedule, ...parsed }
    }
  } catch (e) { /* fallback to default */ }

  const update = (key, val) => {
    const next = { ...schedule, [key]: val }
    onChange(JSON.stringify(next, null, 2))
  }

  const ROWS = [
    { key: 'mon_fri', label: 'Monday - Friday' },
    { key: 'sat',     label: 'Saturday' },
    { key: 'sun',     label: 'Sunday' },
  ]

  return (
    <div className="operating-hours-editor">
      {ROWS.map((row) => (
        <div key={row.key} className="oh-row" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <label className="oh-label" style={{ minWidth: 120, fontSize: 13, fontWeight: 600, color: '#94a3b8' }}>{row.label}</label>
          <input
            type="text"
            className="settings-input oh-input"
            value={schedule[row.key] || ''}
            onChange={(e) => update(row.key, e.target.value)}
            disabled={disabled}
            placeholder="e.g. 9:00 AM - 6:00 PM or Closed"
            style={{ flex: 1 }}
          />
        </div>
      ))}
      <div style={{ fontSize: 11, color: '#64748b', marginTop: 4, fontStyle: 'italic' }}>
        Tip: You can use "Closed" or specify time ranges like "9:00 AM - 6:00 PM".
      </div>
    </div>
  )
}

const TABS = [
  { key: 'general',         label: 'General',           icon: '⚙️' },
  { key: 'business',        label: 'Business',          icon: '🏢' },
  { key: 'crm',             label: 'CRM',               icon: '🎯' },
  { key: 'vehicle',         label: 'Vehicles',          icon: '🚗' },
  { key: 'services',        label: 'Services',          icon: '🛠️' },
  { key: 'quotations',      label: 'Quotations',        icon: '📋' },
  { key: 'quotation_email', label: 'Quotations Email',  icon: '📧' },
  { key: 'booking',         label: 'Bookings',          icon: '📅' },
  { key: 'booking_email',   label: 'Booking Email',     icon: '📨' },
  { key: 'payment',         label: 'Payments',          icon: '💳' },
  { key: 'sales',           label: 'Sales',             icon: '📊' },
  { key: 'roles',           label: 'Roles',             icon: '👥' },
  { key: 'inventory',       label: 'Inventory',         icon: '📦' },
  { key: 'system',          label: 'System',            icon: '🖥️' },
  { key: 'logs',            label: 'Audit Logs',        icon: '🔍' },
  { key: 'services_process', label: 'Services Process', icon: '⚙️' },
]

const CATEGORY_LABELS = {
  general:          'General Settings',
  business:         'Business Information',
  crm:              'CRM Configuration',
  vehicle:          'Vehicle Configuration',
  booking:          'Booking Rules',
  payment:          'Payment Configuration',
  sales:            'Sales Configuration',
  quotations:       'Quotation Rules',
  services:         'Services & Pricing',
  services_process:  'Services Process',
  inventory:        'Inventory Settings',
  quotation_email:  'Quotation Email Settings',
  booking_email:    'Booking Confirmation Email Settings',
  roles:            'User Roles & Permissions',
  system:           'System Settings',
  email:            'Email Blasting',
}

const CATEGORY_DESCRIPTIONS = {
  general:          'Configure system-wide display and locale settings.',
  business:         'Manage your business identity, contact details, and tax rate.',
  crm:              'Manage customer classifications, lead sources, and interaction methods.',
  vehicle:          'Control vehicle classification and plate validation behaviour.',
  booking:          'Define the rules that govern how appointments are created and managed.',
  payment:          'Control payment methods, minimums, and refund policies.',
  sales:            'Adjust how sales data is calculated and reported.',
  quotations:       'Manage vehicle size options used in Operations > Quotations.',
  services:         'Manage custom services and adjust global service pricing table.',
  services_process: 'Configure service steps, checklists, and workflow status rules.',
  inventory:        'Configure stock thresholds and default inventory rules.',
  quotation_email:  'Customize the Service Confirmation email sent to customers when a quotation is approved.',
  booking_email:    'Customize the Booking Confirmation email sent to customers when a new booking/appointment is created.',
  roles:            'Define user roles and access permissions across the system.',
  system:           'Manage audit logging, retention policies, and view read-only system metadata.',
  email:            'Create and manage bulk email campaigns for CRM audiences.',
}

// ── Structured field definitions per category ───────────────────────────────
// Each section groups related fields. Each field defines the label, description,
// input type, and any constraints shown in the UI.
const FIELD_SCHEMA = {
  general: [
    {
      section: 'System Identity',
      desc: 'Core branding and contact information for this installation.',
      fields: [
        { key: 'system_name',      label: 'System Name',   type: 'text',  placeholder: 'e.g. Master Auto' },
        { key: 'system_logo_url',  label: 'Logo URL/Path', type: 'text',  placeholder: '/images/logo.png', desc: 'Relative path or full URL to your logo file.' },
        { key: 'system_email',     label: 'System Email',  type: 'text',  placeholder: 'info@example.com', desc: 'Used for system-generated notifications.' },
      ],
    },
    {
      section: 'Locale & Format',
      desc: 'Regional and display format preferences.',
      fields: [
        { key: 'default_currency', label: 'Currency',    type: 'select', options: ['PHP','USD','EUR','SGD','AUD','GBP'] },
        { key: 'time_zone',        label: 'Time Zone',   type: 'select', options: ['Asia/Manila','Asia/Singapore','Asia/Tokyo','Asia/Jakarta','America/New_York','Europe/London','UTC'] },
        { key: 'date_format',      label: 'Date Format', type: 'select', options: ['MM/DD/YYYY','DD/MM/YYYY','YYYY-MM-DD','DD-MMM-YYYY'] },
        { key: 'language',         label: 'Language',    type: 'select', options: ['en','fil'] },
      ],
    },
  ],
  business: [
    {
      section: 'Business Details',
      desc: 'Official identity used in documents, invoices, and customer communications.',
      fields: [
        { key: 'business_name',        label: 'Business Name',      type: 'text',     placeholder: 'Master Auto Service Center' },
        { key: 'business_address',     label: 'Address',            type: 'textarea', placeholder: '123 Auto Street, Manila', desc: 'Full address printed on invoices.' },
        { key: 'business_contact',     label: 'Contact Number',     type: 'text',     placeholder: '+63 2 1234 5678' },
        { key: 'business_email',       label: 'Business Email',     type: 'text',     placeholder: 'contact@example.com' },
        { key: 'registration_number',  label: 'Registration No.',   type: 'text',     placeholder: 'Business registration / TIN' },
      ],
    },
    {
      section: 'Financial & Tax',
      desc: 'Tax rate and operating schedule.',
      fields: [
        { key: 'tax_vat_rate',      label: 'VAT Rate (%)',    type: 'number', min: 0, max: 100, step: 0.01, desc: 'Applied to taxable transactions.' },
        { key: 'operating_hours',   label: 'Operating Hours', type: 'operating-hours', desc: 'Define your business schedule by day-group.' },
      ],
    },
  ],
  crm: [
    {
      section: 'Classification',
      desc: 'Define how customers are tagged and categorized.',
      fields: [
        { key: 'customer_types',   label: 'Customer Types',     type: 'tag-list', defaultValue: JSON.stringify(['Retail', 'Dealer', 'Corporate', 'VIP']), placeholder: 'Add type…', desc: 'e.g. Retail, Dealer, Corporate, VIP' },
        { key: 'lead_sources',     label: 'Lead Sources',       type: 'tag-list', defaultValue: JSON.stringify(['Walk-in', 'Facebook', 'Referral', 'Google', 'Other']), placeholder: 'Add source…', desc: 'e.g. Walk-in, Facebook, Referral' },
        { key: 'contact_methods',  label: 'Contact Methods',    type: 'tag-list', defaultValue: JSON.stringify(['Call', 'SMS', 'Email', 'WhatsApp']), placeholder: 'Add method…', desc: 'e.g. Mobile, Email, WhatsApp, Viber' },
      ],
    },
    {
      section: 'Notifications',
      desc: 'Automation for customer follow-ups.',
      fields: [
        { key: 'enable_birthday_greetings', label: 'Automated Birthday Greetings', type: 'toggle', defaultValue: 'false' },
        { key: 'enable_service_reminders',   label: 'Automated Service Reminders',  type: 'toggle', defaultValue: 'false' },
      ],
    },
  ],
  vehicle: [
    {
      section: 'Classification',
      desc: 'Enable and manage vehicle make, model, and variant lookups.',
      fields: [
        { key: 'enable_vehicle_makes',   label: 'Enable Vehicle Makes',  type: 'toggle' },
        { key: 'enable_vehicle_models',  label: 'Enable Vehicle Models', type: 'toggle' },
        { key: 'enable_variants',        label: 'Enable Variants',       type: 'toggle' },
        { key: 'default_categories',     label: 'Default Categories',    type: 'tag-list', placeholder: 'Add category…', desc: 'List of vehicle category names.' },
      ],
    },
    {
      section: 'Plate Validation',
      desc: 'Configure plate format rules applied on vehicle registration.',
      fields: [
        { key: 'plate_validation_enabled', label: 'Enable Plate Validation',   type: 'toggle' },
        { key: 'plate_format',             label: 'Accepted Format Patterns',  type: 'text',   placeholder: 'XX###XXXX|###XXXX|XXXX###', desc: 'Pipe-separated regex patterns for valid plates.' },
        { key: 'allow_custom_plate',       label: 'Allow Placeholder Plates',  type: 'toggle', desc: 'Permit vehicles with non-standard or temporary plates.' },
      ],
    },
  ],
  booking: [
    {
      section: 'Branches',
      desc: 'Locations / branches customers can be booked into.',
      fields: [
        { key: 'branch_locations', label: 'Branch Locations', type: 'tag-list', placeholder: 'Add branch name…', desc: 'Add each branch name. These appear as options in the New Booking “In Branch” dropdown.' },
      ],
    },
    {
      section: 'Availability Rules',
      desc: 'Control how far in advance bookings must be made and what is allowed.',
      fields: [
        { key: 'minimum_booking_notice',   label: 'Minimum Notice (hours)',           type: 'number', min: 0, max: 720, step: 1 },
        { key: 'allow_multiple_services',  label: 'Allow Multiple Services per Booking', type: 'toggle' },
        { key: 'enable_guest_booking',     label: 'Enable Guest Booking',             type: 'toggle', desc: 'Allow customers to book without registering an account.' },
        { key: 'require_phone_verification', label: 'Require Phone Verification',     type: 'toggle', desc: 'SMS/OTP check for guest bookings.' },
      ],
    },
    {
      section: 'Auto-actions',
      desc: 'Automated transitions triggered by payment or time elapsed.',
      fields: [
        { key: 'auto_cancel_unpaid_hours',           label: 'Auto-cancel Unpaid After (hours)',     type: 'number', min: 0, max: 720, step: 1 },
        { key: 'auto_complete_when_paid',            label: 'Auto-complete When Fully Paid',       type: 'toggle' },
        { key: 'allow_cancel_after_partial_payment', label: 'Allow Cancel After Partial Payment',  type: 'toggle' },
        { key: 'allow_edit_after_approval',          label: 'Allow Edit After Approval',           type: 'toggle' },
      ],
    },
  ],
  payment: [
    {
      section: 'Payment Methods',
      desc: 'Define which payment channels are accepted at checkout.',
      fields: [
        { key: 'accepted_payment_methods', label: 'Accepted Methods', type: 'methods', desc: 'Toggle the payment channels accepted at checkout.' },
        { key: 'enable_online_payment',    label: 'Enable Online Payment Gateway', type: 'toggle' },
        { key: 'online_payment_provider',  label: 'Payment Provider',             type: 'text',   placeholder: 'e.g. Stripe, PayMongo', desc: 'Leave blank if online payments are disabled.' },
      ],
    },
    {
      section: 'Limits & Policy',
      desc: 'Down payment minimums, payment deadlines, and refund windows.',
      fields: [
        { key: 'enable_partial_payments',               label: 'Enable Partial Payments',                 type: 'toggle' },
        { key: 'minimum_down_payment_percentage',       label: 'Minimum Down Payment (%)',                type: 'number', min: 0, max: 100, step: 1 },
        { key: 'payment_due_days',                      label: 'Full Payment Due Within (days)',          type: 'number', min: 1, max: 365, step: 1 },
        { key: 'enable_refunds',                        label: 'Enable Refund Processing',                type: 'toggle' },
        { key: 'refund_eligibility_days',               label: 'Refund Window (days after payment)',      type: 'number', min: 0, max: 365, step: 1 },
        { key: 'require_downpayment_before_print',      label: 'Require 50% Payment Before Printing Job Order', type: 'toggle', desc: 'When enabled, the Print button on Job Orders is locked until the customer has paid at least 50% of the total amount.' },
      ],
    },
  ],
  sales: [
    {
      section: 'Reporting',
      desc: 'Control how sales summaries are computed and scheduled.',
      fields: [
        { key: 'calculate_daily_sales',       label: 'Auto-calculate Daily Sales',         type: 'toggle' },
        { key: 'report_generation_time',      label: 'Daily Report Generation Time',       type: 'text',   placeholder: '00:00', desc: 'HH:MM format (24-hour).' },
        { key: 'include_archived_in_reports', label: 'Include Archived Records',           type: 'toggle' },
        { key: 'tax_calculation_method',      label: 'Tax Calculation Method',             type: 'select', options: ['inclusive','exclusive'], desc: '"inclusive" means tax is embedded in prices, "exclusive" adds on top.' },
        { key: 'default_service_pricing',     label: 'Default Service Pricing Rules',      type: 'json',   placeholder: '{"labor_cost":"hourly","parts_markup":"25"}' },
      ],
    },
    {
      section: 'Sales Targets',
      desc: 'Optional monthly target to track team performance.',
      fields: [
        { key: 'enable_sales_targets',  label: 'Enable Sales Targets',   type: 'toggle' },
        { key: 'sales_target_amount',   label: 'Monthly Target Amount',  type: 'number', min: 0, step: 1000 },
      ],
    },
  ],
  roles: [
    {
      section: 'SuperAdmin Features',
      desc: 'Features exclusively available to SuperAdmin. Admin users can view but cannot execute these actions.',
      fields: [
        { key: 'superadmin_permissions', label: 'SuperAdmin Permissions', type: 'readonly', desc: 'SuperAdmin: Add/delete services, change prices, change discounts, reset configuration. Admin: View settings, input general data — no delete or price changes.' },
      ],
    },
    {
      section: 'Security & Authentication',
      desc: 'Session and login security configuration.',
      fields: [
        { key: 'session_timeout_minutes',   label: 'Session Timeout (minutes)',          type: 'number', min: 5,  max: 480, step: 5 },
        { key: 'max_login_attempts',        label: 'Max Failed Login Attempts',          type: 'number', min: 1,  max: 20,  step: 1 },
        { key: 'password_expiry_days',      label: 'Password Expiry (days, 0=disabled)', type: 'number', min: 0,  max: 365, step: 1 },
        { key: 'require_two_factor_auth',   label: 'Require Two-Factor Authentication',  type: 'toggle' },
      ],
    },
    {
      section: 'Assigned Workers',
      desc: 'List of worker / installer names available for job assignment.',
      fields: [
        { key: 'assigned_workers', label: 'Assigned Workers', type: 'tag-list', placeholder: 'Add worker name…', desc: 'Add each worker\'s name. These appear as options when assigning installers to a job.' },
      ],
    },
    {
      section: 'Prepared By',
      desc: 'List of names available for the "Prepared By" field on job orders.',
      fields: [
        { key: 'prepared_by_names', label: 'Prepared By Options', type: 'tag-list', placeholder: 'Add name…', desc: 'Add each person\'s name. These appear as options for the Prepared By field.' },
      ],
    },
  ],
  system: [
    {
      section: 'Logging',
      desc: 'Audit trail and error logging preferences.',
      fields: [
        { key: 'enable_audit_logging',  label: 'Enable Audit Logging',  type: 'toggle' },
        { key: 'log_retention_days',    label: 'Log Retention (days)',   type: 'number', min: 7, max: 3650, step: 1, desc: 'Logs older than this will be purged automatically.' },
        { key: 'enable_error_logging',  label: 'Enable Error Logging',   type: 'toggle' },
      ],
    },
    {
      section: 'Security',
      desc: 'Control how long session tokens remain valid before requiring sign-in again.',
      fields: [
        { key: 'admin_session_token_ttl_minutes',  label: 'Admin Session Token Expiry (minutes)',  type: 'number', min: 1, max: 525600, step: 1, desc: 'Example: 600 = 10 hours.' },
        { key: 'portal_session_token_ttl_minutes', label: 'Portal Session Token Expiry (minutes)', type: 'number', min: 1, max: 525600, step: 1, desc: 'Example: 43200 = 30 days.' },
      ],
    },
    {
      section: 'System Info',
      desc: 'Read-only metadata managed by the system.',
      fields: [
        { key: 'system_version',          label: 'System Version',    type: 'readonly' },
        { key: 'system_status',           label: 'System Status',     type: 'readonly' },
        { key: 'database_backup_enabled', label: 'Database Backup',   type: 'readonly' },
        { key: 'last_backup_date',        label: 'Last Backup Date',  type: 'readonly' },
      ],
    },
  ],
  inventory: [
    {
      section: 'Stock Rules',
      desc: 'Define how stock levels are monitored and flagged.',
      fields: [
        { key: 'default_qty_minimum', label: 'Default Low Stock Threshold', type: 'number', min: 0, desc: 'Initial minimum quantity set for new inventory items.' },
        { key: 'enable_inventory_notifications', label: 'Low Stock Alerts', type: 'toggle', desc: 'Enable dashboard alerts when items fall below their threshold.' },
      ],
    },
    {
      section: 'Categories',
      desc: 'Manage the classification list for your inventory items.',
      fields: [
        { key: 'inventory_categories', label: 'Inventory Categories', type: 'tag-list', placeholder: 'Add category (e.g. Oil, Tints, Parts)', desc: 'List of valid categories for organizing products.' },
      ],
    },
  ],
  quotation_email: [
    {
      section: 'Quotation Approval Email',
      desc: 'Sent automatically to customers when their quotation is approved (Service Confirmation email).',
      fields: [
        {
          key: 'enabled',
          label: 'Send Email on Approval',
          type: 'toggle',
          desc: 'When enabled, an email is automatically sent to the customer when their quotation is approved.',
        },
        {
          key: 'subject',
          label: 'Email Subject',
          type: 'text',
          placeholder: 'e.g. Your Service Quotation has been Approved',
          desc: 'The subject line of the approval email. Leave blank to use the default.',
        },
        {
          key: 'greeting',
          label: 'Greeting / Intro Message',
          type: 'textarea',
          placeholder: 'e.g. Great news! Your service quotation has been APPROVED. Please review the details below and contact us to confirm your service schedule.',
          desc: 'The opening paragraph shown after "Dear [Customer Name],".',
        },
        {
          key: 'reminders',
          label: 'Important Reminders (one per line)',
          type: 'textarea',
          placeholder: 'Please arrive on time on your scheduled service date.\nBring this confirmation reference number.\nFinal cost may vary depending on additional parts.',
          desc: 'Each line becomes a bullet point in the "⚠️ Important Reminders" section.',
        },
        {
          key: 'closing',
          label: 'Closing Message',
          type: 'textarea',
          placeholder: 'e.g. Thank you for trusting MasterAuto!',
          desc: 'The final paragraph shown before the email signature.',
        },
      ],
    },
  ],
  services_process: [
    {
      section: 'PPF SERVICES',
      desc: 'Paint Protection Film application workflow',
      fields: [
        {
          key: 'ppf_process',
          label: 'Process Steps (one per line)',
          type: 'textarea',
          defaultValue: '1ST DAY — PREPARATION\n1. Initial Vehicle Checking: Damages, paint defects, etc. — if everything is okay, proceed to Step 2\n2. Decontamination: Clay bar treatment and iron removal for smooth surface\n3. Exterior Detailing: Paint correction and surface preparation before film application\n\n2ND-5TH DAY — PPF INSTALLATION\n4. PPF Installation (MULTI-DAY): Precision film cutting and application on all panels (4 Days)\n\n6TH-7TH DAY — FINISHING\n5. Retouch & Curing: Edge sealing, heat gun finishing and curing period (6th Day)\n6. Release: Quality check and customer handover (7th Day 3PM)\n\nEstimated Total Duration: 7 Days',
          placeholder: '1st Day...',
        }
      ]
    },
    {
      section: 'DETAILING PROCESS',
      desc: '3-4 day detailing workflow',
      fields: [
        {
          key: 'detailing_process',
          label: 'Process Steps (one per line)',
          type: 'textarea',
          defaultValue: '1ST DAY — EXTERIOR DETAILING\n1. Initial Vehicle Checking: Damages, paint defects, etc. — if everything is okay, proceed to Step 2\n2. Decontamination: Clay bar treatment and surface decontamination\n3. Exterior Detailing (MULTI-DAY): Days of work will vary on the car\'s condition\n\nEstimated Total Duration: 3-4 Days',
          placeholder: '1st Day...',
        }
      ]
    },
    {
      section: 'COATING PROCESS',
      desc: 'Premium ceramic & graphene coating workflow',
      fields: [
        {
          key: 'coating_process',
          label: 'Process Steps (one per line)',
          type: 'textarea',
          defaultValue: 'DAY 1 — PREPARATION & APPLICATION\n1. Premium Wash: Thorough cleaning to remove surface dirt and contaminants (1-2 hrs)\n2. Decontamination: Clay bar treatment and iron removal for smooth surface (2-3 hrs)\n3. Exterior Detailing (MULTI-DAY): Paint correction and polishing (continues to Day 2 if needed) (4-8 hrs)\n4. Ceramic / Graphene Coating: Application of protective coating layer (2-3 hrs)\n\nDAY 2 — CURING & COMPLETION\n5. Curing Period: Coating hardens and bonds to paint surface (12-24 hrs)\n6. Final Inspection & Release: Quality check and customer handover (Afternoon)\n\nEstimated Total Duration: 2 Days',
          placeholder: 'Day 1...',
        }
      ]
    },
    {
      section: 'WINDOW TINT PROCESS',
      desc: '1-day installation + curing workflow',
      fields: [
        {
          key: 'window_tint_process',
          label: 'Process Steps (one per line)',
          type: 'textarea',
          defaultValue: '1ST DAY — INSTALLATION\n1. Initial Check-Up: Check for scratches and existing damage — inform client and seek go signal before proceeding\n2. Remove Existing Tint / Install: Remove old tint film if present, then install new window tint on all selected panels\n\n2ND-4TH DAY — CURING PERIOD\n3. Curing Period (3-4 DAYS): ⚠️ Do not put down all windows during curing period (3-4 Days)\n\nEstimated Total Duration: 3-4 Days',
          placeholder: '1st Day...',
        }
      ]
    },
    {
      section: 'CAR WASH PROCESS',
      desc: 'Professional wash workflow — 45 min to 3 hrs',
      fields: [
        {
          key: 'car_wash_process',
          label: 'Process Steps (one per line)',
          type: 'textarea',
          defaultValue: 'SAME DAY — FULL SERVICE\n1. Pre-Rinse & High-Pressure Wash: High-pressure rinse removes loose dirt and debris from the exterior and wheel wells\n2. Snow Foam Bath: pH-neutral foam applied and left to dwell, safely lifting contaminants before contact washing\n3. Two-Bucket Hand Wash: Safe hand wash with premium wash mitt — one bucket wash, one bucket rinse\n4. Clay Bar Decontamination: Iron fallout and tar removal for a perfectly clean surface (PREMIUM+)\n5. Air Dry & Final Wipe: Compressed air clears water from gaps, then streak-free glass clean and trim dress-off\n\nEstimated Total Duration: 45 min – 3 hrs',
          placeholder: 'Same Day...',
        }
      ]
    },
    {
      section: 'OTHER SERVICES PROCESS',
      desc: 'Targeted treatments — same-day workflow',
      fields: [
        {
          key: 'other_services_process',
          label: 'Process Steps (one per line)',
          type: 'textarea',
          defaultValue: 'SAME DAY — TREATMENT & RELEASE\n1. Service Consultation: Technician identifies the issue and recommends the right treatment approach\n2. Area Preparation: Targeted cleaning and masking of adjacent panels to isolate the treatment zone\n3. Treatment Application: Specialist product applied — acid remover, headlight compound, ArmorAll, engine cleaner, etc.\n4. Rinse & Neutralise: Product fully rinsed off and surface neutralized where required (acid rain, engine wash)\n5. Result Check & Release: Before-and-after review with client. Any touch-ups addressed before vehicle released (FINAL)\n\nEstimated Total Duration: Same Day',
          placeholder: 'Same Day...',
        }
      ]
    }
  ],
  booking_email: [
    {
      section: 'Booking Confirmation Email',
      desc: 'Sent automatically to customers when a new booking/appointment is created for them.',
      fields: [
        {
          key: 'enabled',
          label: 'Send Email on Booking Created',
          type: 'toggle',
          desc: 'When enabled, a confirmation email is automatically sent to the customer when a new booking is created.',
        },
        {
          key: 'subject',
          label: 'Email Subject',
          type: 'text',
          placeholder: 'e.g. Your Booking has been Confirmed — MasterAuto',
          desc: 'The subject line of the booking confirmation email. Leave blank to use the default.',
        },
        {
          key: 'greeting',
          label: 'Greeting / Intro Message',
          type: 'textarea',
          placeholder: 'e.g. Great news! Your booking with MasterAuto has been CONFIRMED. Please review the details below and make sure to arrive on time.',
          desc: 'The opening paragraph shown after "Dear [Customer Name],".',
        },
        {
          key: 'reminders',
          label: 'Important Reminders (one per line)',
          type: 'textarea',
          placeholder: 'Please arrive on time (or a few minutes early) on your scheduled date.\nBring a valid ID and this booking confirmation for reference.\nTo reschedule, contact us at least 24 hours in advance.',
          desc: 'Each line becomes a bullet point in the "⚠️ Important Reminders" section.',
        },
        {
          key: 'closing',
          label: 'Closing Message',
          type: 'textarea',
          placeholder: 'e.g. We look forward to serving you. Thank you for choosing MasterAuto!',
          desc: 'The final paragraph shown before the email signature.',
        },
      ],
    },
  ],
}

export function SettingsPage({ token, user }) {
  const isAdmin = ['Admin', 'SuperAdmin'].includes(user?.role)
  const isSuperAdmin = user?.role === 'SuperAdmin'

  const configRef = useRef({})
  const draftRef = useRef({})
  const autoSaveTimersRef = useRef(new Map())

  const [activeTab, setActiveTab]         = useState('general')
  const [config, setConfig]               = useState({})
  const [draft, setDraft]                 = useState({})
  const [logs, setLogs]                   = useState([])
  const [logsMeta, setLogsMeta]           = useState({ page: 1, totalPages: 1, total: 0 })
  const [logsPage, setLogsPage]           = useState(1)
  const [loadingConfig, setLoadingConfig] = useState(true)
  const [loadingLogs, setLoadingLogs]     = useState(false)
  const [saving, setSaving]               = useState(false)
  const [resetting, setResetting]         = useState(false)
  const [dirtyCategories, setDirtyCategories] = useState(new Set())
  const [vehicleMakes, setVehicleMakes] = useState([])
  const [loadingVehicleMakes, setLoadingVehicleMakes] = useState(false)
  const [newMakeName, setNewMakeName] = useState('')
  const [newMakeCategory, setNewMakeCategory] = useState('')
  const [showCampaigns, setShowCampaigns] = useState(false)

  useEffect(() => {
    configRef.current = config
  }, [config])

  useEffect(() => {
    draftRef.current = draft
  }, [draft])

  useEffect(() => {
    return () => {
      try {
        for (const t of autoSaveTimersRef.current.values()) clearTimeout(t)
        autoSaveTimersRef.current.clear()
      } catch {
        // ignore
      }
    }
  }, [])

  const normalizeConfigValue = (v) => {
    if (v === undefined || v === null) return ''
    if (typeof v === 'object') {
      try { return JSON.stringify(v) } catch { return String(v) }
    }
    return String(v)
  }

  const getConfigValue = (cfg, category, key) => {
    const entries = cfg?.[category]
    if (Array.isArray(entries)) return entries.find((e) => e.key === key)?.value
    if (entries && typeof entries === 'object') return entries[key]?.value
    return undefined
  }

  const updateConfigValue = (cfg, category, key, value) => {
    const next = { ...(cfg || {}) }
    const entries = next[category]
    if (Array.isArray(entries)) {
      const idx = entries.findIndex((e) => e.key === key)
      if (idx >= 0) {
        const updatedEntry = { ...entries[idx], value }
        next[category] = [...entries.slice(0, idx), updatedEntry, ...entries.slice(idx + 1)]
      } else {
        next[category] = [...entries, { key, value }]
      }
      return next
    }
    if (entries && typeof entries === 'object') {
      next[category] = {
        ...entries,
        [key]: { ...(entries[key] || {}), value },
      }
      return next
    }
    next[category] = [{ key, value }]
    return next
  }

  const isCategoryDirty = (category, nextDraft, cfg) => {
    const categoryDraft = nextDraft?.[category] || {}
    for (const [k, v] of Object.entries(categoryDraft)) {
      const saved = getConfigValue(cfg, category, k)
      if (normalizeConfigValue(saved) !== normalizeConfigValue(v)) return true
    }
    return false
  }

  const scheduleAutoSave = useCallback((category, key, value, nextDraft) => {
    if (!isAdmin) return
    const timerKey = `${category}:${key}`

    try {
      const existing = autoSaveTimersRef.current.get(timerKey)
      if (existing) clearTimeout(existing)
    } catch {
      // ignore
    }

    const t = setTimeout(async () => {
      try {
        const saved = getConfigValue(configRef.current, category, key)
        if (normalizeConfigValue(saved) === normalizeConfigValue(value)) {
          // Nothing to save (or already saved)
          setDirtyCategories((prev) => {
            const next = new Set(prev)
            if (!isCategoryDirty(category, nextDraft || draftRef.current, configRef.current)) next.delete(category)
            return next
          })
          return
        }

        await apiPut(`/config/${category}/${key}`, token, { value })
        setConfig((prev) => {
          const nextCfg = updateConfigValue(prev, category, key, value)
          configRef.current = nextCfg
          return nextCfg
        })

        emitConfigUpdated({ source: 'autosave', category, key })

        setDirtyCategories((prev) => {
          const next = new Set(prev)
          if (!isCategoryDirty(category, nextDraft || draftRef.current, configRef.current)) next.delete(category)
          return next
        })
      } catch (e) {
        pushToast('error', e.message)
      }
    }, 900)

    autoSaveTimersRef.current.set(timerKey, t)
  }, [isAdmin, token])

  // ── Promo Codes state ────────────────────────────────────────────────────
  const [promoCodes, setPromoCodes]           = useState([])
  const [promoLoading, setPromoLoading]         = useState(false)
  const [promoForm, setPromoForm]               = useState({ code: '', discount_type: 'percent', discount_value: '', expires_at: '', description: '' })
  const [promoSaving, setPromoSaving]           = useState(false)
  const [promoError, setPromoError]             = useState('')
  const [blastPromo, setBlastPromo]              = useState(null)   // promo code row to email-blast

  const loadPromoCodes = useCallback(async () => {
    setPromoLoading(true)
    try {
      const res = await apiGet('/promo-codes', token, { limit: 100 })
      setPromoCodes(res.data || [])
    } catch (e) {
      pushToast('error', e.message)
    } finally {
      setPromoLoading(false)
    }
  }, [token])

  useEffect(() => {
    if (activeTab === 'promo') loadPromoCodes()
  }, [activeTab, loadPromoCodes])

  // ── Quotations pricing state ─────────────────────────────────────────────
  const [quotPrices, setQuotPrices]         = useState({})
  const [quotPricesDirty, setQuotPricesDirty] = useState(false)
  const [quotPricesSaving, setQuotPricesSaving] = useState(false)
  const [quotServiceNames, setQuotServiceNames] = useState({})
  const [quotServiceNamesDirty, setQuotServiceNamesDirty] = useState(false)
  const [quotSizes, setQuotSizes] = useState(() =>
    VEHICLE_SIZE_OPTIONS.map((s) => ({ ...s, enabled: true }))
  )
  const [quotSizesNewKey, setQuotSizesNewKey]     = useState('')
  const [quotSizesNewLabel, setQuotSizesNewLabel] = useState('')
  const [quotSizesDirty, setQuotSizesDirty]       = useState(false)
  const [quotSizesSaving, setQuotSizesSaving]     = useState(false)
  const [quotCustomServices, setQuotCustomServices] = useState([])
  const [quotCustomSvcDirty, setQuotCustomSvcDirty] = useState(false)
  const [quotCustomSvcSaving, setQuotCustomSvcSaving] = useState(false)
  const [quotNewSvcName, setQuotNewSvcName]   = useState('')
  const [quotNewSvcGroup, setQuotNewSvcGroup] = useState('')
  const [quotPriceGroup, setQuotPriceGroup]   = useState(null)

  // Built-in fallback categories to ensure a dropdown appears even if config isn't loaded
  const DEFAULT_VEHICLE_CATEGORIES = ['Sedan', 'SUV', 'Pickup', 'Van', 'Hatchback', 'Motorcycle', 'Truck', 'Bus']

  // Derive default vehicle categories from loaded config (fall back to DEFAULT_VEHICLE_CATEGORIES)
  const vehicleDefaultCategories = (() => {
    try {
      const entries = config.vehicle || []
      let entry
      if (Array.isArray(entries)) {
        entry = entries.find((e) => e.key === 'default_categories')
      } else if (entries && typeof entries === 'object') {
        entry = Object.entries(entries).map(([k, v]) => ({ key: k, value: v.value })).find((e) => e.key === 'default_categories')
      }
      if (entry && entry.value) {
        try { return JSON.parse(entry.value || '[]') } catch { return DEFAULT_VEHICLE_CATEGORIES }
      }
    } catch (err) {
      // ignore parse errors
    }
    return DEFAULT_VEHICLE_CATEGORIES
  })()

  // Load vehicle makes (admin master data) when Vehicle tab is active
  const loadVehicleMakes = useCallback(async () => {
    if (!isAdmin) return
    setLoadingVehicleMakes(true)
    try {
      const makes = await apiGet('/vehicle-makes/admin', token)
      // API returns an array of makes
      setVehicleMakes(Array.isArray(makes) ? makes : (makes.data || []))
    } catch (e) {
      pushToast('error', e.message)
    } finally {
      setLoadingVehicleMakes(false)
    }
  }, [isAdmin, token])

  async function handleAddMake() {
    if (!newMakeName || !isAdmin) return
    try {
      setLoadingVehicleMakes(true)
      await apiPost('/vehicle-makes', token, { name: newMakeName.trim(), category: newMakeCategory || null })
      pushToast('success', `Brand "${newMakeName.trim()}" added`) 
      setNewMakeName('')
      setNewMakeCategory('')
      await loadVehicleMakes()
      emitVehicleMakesUpdated({ source: 'settings', action: 'add' })
    } catch (err) {
      pushToast('error', err.message || 'Failed to add brand')
    } finally {
      setLoadingVehicleMakes(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'vehicle') loadVehicleMakes()
  }, [activeTab, loadVehicleMakes])

  const handleToggleMakeActive = async (id, current) => {
    try {
      await apiPatch(`/vehicle-makes/${id}`, token, { is_active: !current })
      pushToast('success', 'Make updated')
      await loadVehicleMakes()
      emitVehicleMakesUpdated({ source: 'settings', action: 'toggle', id })
    } catch (e) {
      pushToast('error', e.message)
    }
  }

  // ── Load all config on mount ────────────────────────────────────────────
  const loadConfig = useCallback(async () => {
    setLoadingConfig(true)
    try {
      const response = await apiGet('/config', token)
      const data = response.data || response
      setConfig(data)
      // Build nested draft: { category: { key: value } }
      const initial = {}
      for (const [cat, entries] of Object.entries(data)) {
        initial[cat] = {}
        if (Array.isArray(entries)) {
          for (const entry of entries) {
            const v = entry.value ?? ''
            // Keep JSON values as formatted strings so textareas display correctly
            initial[cat][entry.key] = (typeof v === 'object' && v !== null) ? JSON.stringify(v, null, 2) : v
          }
        } else if (entries && typeof entries === 'object') {
          // Handle object format: { key: { value, description, type } }
          for (const [key, entry] of Object.entries(entries)) {
            const v = entry.value ?? ''
            initial[cat][key] = (typeof v === 'object' && v !== null) ? JSON.stringify(v, null, 2) : v
          }
        }
      }
      setDraft(initial)
    } catch (e) {
      pushToast('error', e.message)
    } finally {
      setLoadingConfig(false)
    }
  }, [token])

  // ── Load audit logs ─────────────────────────────────────────────────────
  const loadLogs = useCallback(async () => {
    setLoadingLogs(true)
    try {
      const response = await apiGet(`/config/logs/audit?limit=20&offset=${(logsPage - 1) * 20}`, token)
      setLogs(response.data || [])
      setLogsMeta(response.pagination || { page: 1, totalPages: 1, total: 0 })
    } catch (e) {
      pushToast('error', e.message)
    } finally {
      setLoadingLogs(false)
    }
  }, [token, logsPage])

  useEffect(() => { loadConfig() }, [loadConfig])

  // Sync quotations price overrides whenever config reloads
  useEffect(() => {
    const entries = config.quotations
    if (!Array.isArray(entries)) return
    const priceEntry = entries.find((e) => e.key === 'service_prices')
    if (priceEntry?.value) {
      try {
        const parsed = typeof priceEntry.value === 'string' ? JSON.parse(priceEntry.value) : priceEntry.value
        if (parsed && typeof parsed === 'object') setQuotPrices(parsed)
      } catch {}
    }
    const sizesEntry = entries.find((e) => e.key === 'vehicle_sizes')
    if (sizesEntry?.value) {
      try {
        const parsed = typeof sizesEntry.value === 'string' ? JSON.parse(sizesEntry.value) : sizesEntry.value
        if (Array.isArray(parsed) && parsed.length > 0) setQuotSizes(parsed)
      } catch {}
    }
    const customSvcEntry = entries.find((e) => e.key === 'custom_services')
    if (customSvcEntry?.value) {
      try {
        const parsed = typeof customSvcEntry.value === 'string' ? JSON.parse(customSvcEntry.value) : customSvcEntry.value
        if (Array.isArray(parsed)) setQuotCustomServices(parsed)
      } catch {}
    }
    const nameEntry = entries.find((e) => e.key === 'service_name_overrides')
    if (nameEntry?.value) {
      try {
        const parsed = typeof nameEntry.value === 'string' ? JSON.parse(nameEntry.value) : nameEntry.value
        if (parsed && typeof parsed === 'object') setQuotServiceNames(parsed)
      } catch {}
    }
  }, [config.quotations])

  async function handleSaveQuotationPrices() {
    setQuotPricesSaving(true)
    try {
      await apiPut('/config/quotations/service_prices', token, { value: JSON.stringify(quotPrices) })
      if (quotServiceNamesDirty) {
        await apiPut('/config/quotations/service_name_overrides', token, { value: JSON.stringify(quotServiceNames) })
        setQuotServiceNamesDirty(false)
      }
      if (quotCustomSvcDirty) {
        await apiPut('/config/quotations/custom_services', token, { value: JSON.stringify(quotCustomServices) })
        setQuotCustomSvcDirty(false)
      }
      pushToast('success', 'Service pricing saved')
      setQuotPricesDirty(false)
      emitConfigUpdated({ source: 'settings', category: 'quotations', key: 'service_prices' })
      if (quotServiceNamesDirty) emitConfigUpdated({ source: 'settings', category: 'quotations', key: 'service_name_overrides' })
      if (quotCustomSvcDirty) emitConfigUpdated({ source: 'settings', category: 'quotations', key: 'custom_services' })
      await loadConfig()
    } catch (e) {
      pushToast('error', e.message)
    } finally {
      setQuotPricesSaving(false)
    }
  }

  async function handleSaveQuotationSizes() {
    setQuotSizesSaving(true)
    try {
      await apiPut('/config/quotations/vehicle_sizes', token, { value: JSON.stringify(quotSizes) })
      pushToast('success', 'Vehicle sizes saved')
      setQuotSizesDirty(false)
      emitConfigUpdated({ source: 'settings', category: 'quotations', key: 'vehicle_sizes' })
      await loadConfig()
    } catch (e) {
      pushToast('error', e.message)
    } finally {
      setQuotSizesSaving(false)
    }
  }

  async function handleSaveQuotationCustomServices() {
    setQuotCustomSvcSaving(true)
    try {
      await apiPut('/config/quotations/custom_services', token, { value: JSON.stringify(quotCustomServices) })
      pushToast('success', 'Custom services saved')
      setQuotCustomSvcDirty(false)
      emitConfigUpdated({ source: 'settings', category: 'quotations', key: 'custom_services' })
      await loadConfig()
    } catch (e) {
      pushToast('error', e.message)
    } finally {
      setQuotCustomSvcSaving(false)
    }
  }
  useEffect(() => {
    if (activeTab === 'logs') loadLogs()
  }, [activeTab, loadLogs])

  // ── Draft change handlers ────────────────────────────────────────────────
  function handleChange(category, key, value) {
    const current = draftRef.current || {}
    const nextCategory = { ...(current[category] || {}), [key]: value }
    const nextDraft = { ...current, [category]: nextCategory }

    draftRef.current = nextDraft
    setDraft(nextDraft)

    setDirtyCategories((prev) => {
      const next = new Set(prev)
      if (isCategoryDirty(category, nextDraft, configRef.current)) next.add(category)
      else next.delete(category)
      return next
    })

    scheduleAutoSave(category, key, value, nextDraft)
  }

  function handleToggle(category, key, current) {
    const currStr = String(current)
    const next = currStr === 'true' ? 'false' : 'true'
    handleChange(category, key, next)
  }

  // ── Save changes ────────────────────────────────────────────────────────
  async function handleSave(category) {
    if (!isAdmin) return
    setSaving(true)
    try {
      const categoryDraft = draft[category] || {}
      const updates = []

      for (const [key, value] of Object.entries(categoryDraft)) {
        const entries = config[category]
        let oldVal
        if (Array.isArray(entries)) {
          oldVal = entries.find(c => c.key === key)?.value
        } else if (entries && typeof entries === 'object') {
          oldVal = entries[key]?.value
        }
        // Normalize both sides — parsed objects become JSON strings for comparison
        const normalize = (v) => (typeof v === 'object' && v !== null) ? JSON.stringify(v) : String(v ?? '')
        if (normalize(oldVal) !== normalize(value)) {
          updates.push({ key, value })
        }
      }

      for (const { key, value } of updates) {
        await apiPut(`/config/${category}/${key}`, token, { value })
      }

      if (updates.length > 0) {
        emitConfigUpdated({ source: 'settings', category, keys: updates.map((u) => u.key) })
      }

      pushToast('success', `${CATEGORY_LABELS[category]} saved successfully`)
      setDirtyCategories((prev) => {
        const next = new Set(prev)
        next.delete(category)
        return next
      })
      
      // Reload to sync
      await loadConfig()
    } catch (e) {
      // Error toast already emitted by the API client
    } finally {
      setSaving(false)
    }
  }

  // ── Reset to defaults ───────────────────────────────────────────────────
  async function handleReset(category) {
    if (!isAdmin || !window.confirm(`Reset ${CATEGORY_LABELS[category]} to defaults?`)) return
    setResetting(true)
    try {
      await apiPost(`/config/${category}/reset`, token, {})
      pushToast('success', `${CATEGORY_LABELS[category]} reset to defaults`)
      emitConfigUpdated({ source: 'settings', category, action: 'reset' })
      setDirtyCategories((prev) => {
        const next = new Set(prev)
        next.delete(category)
        return next
      })
      await loadConfig()
    } catch (e) {
      pushToast('error', e.message)
    } finally {
      setResetting(false)
    }
  }

  if (!isAdmin) {
    return (
      <div className="settings-page">
        <div className="settings-unauthorized">
          <h2>🔒 Admin Access Required</h2>
          <p>Only administrators can access Configuration Management.</p>
        </div>
      </div>
    )
  }

  // ── Render a single field by its schema definition ──────────────────────
  function renderFieldDef(category, fieldDef, draftValue) {
    const { key, type, label: _label, placeholder, min, max, step, options, defaultValue } = fieldDef
    const disabled = saving || resetting || type === 'readonly'
    let val = draftValue === undefined ? (defaultValue ?? '') : String(draftValue ?? '')

    if (type === 'toggle') {
      const isOn = val === 'true' || val === true
      return (
        <button
          type="button"
          className={`toggle-switch ${isOn ? 'toggle-on' : 'toggle-off'}`}
          onClick={() => handleToggle(category, key, val)}
          disabled={disabled}
          aria-checked={isOn}
        >
          <span className="toggle-knob" />
        </button>
      )
    }
    if (type === 'select') {
      return (
        <select
          className="settings-input"
          value={val}
          onChange={(e) => handleChange(category, key, e.target.value)}
          disabled={disabled}
        >
          {(options || []).map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      )
    }
    if (type === 'number') {
      return (
        <input
          type="number"
          className="settings-input settings-input--number"
          value={val}
          min={min}
          max={max}
          step={step ?? 1}
          onChange={(e) => handleChange(category, key, e.target.value)}
          disabled={disabled}
          placeholder={placeholder}
        />
      )
    }
    if (type === 'textarea') {
      return (
        <textarea
          className="settings-input settings-input--textarea"
          value={val}
          onChange={(e) => handleChange(category, key, e.target.value)}
          disabled={disabled}
          placeholder={placeholder}
          rows={3}
        />
      )
    }
    if (type === 'methods') {
      return (
        <MethodsEditor
          value={val}
          onChange={(v) => handleChange(category, key, v)}
          disabled={disabled}
        />
      )
    }
    if (type === 'tag-list') {
      return (
        <TagListEditor
          value={val}
          onChange={(v) => handleChange(category, key, v)}
          disabled={disabled}
          placeholder={placeholder}
        />
      )
    }
    if (type === 'operating-hours') {
      return (
        <OperatingHoursEditor
          value={val}
          onChange={(v) => handleChange(category, key, v)}
          disabled={disabled}
        />
      )
    }
    if (type === 'json') {
      return (
        <textarea
          className="settings-input settings-input--json"
          value={val}
          onChange={(e) => handleChange(category, key, e.target.value)}
          disabled={disabled}
          placeholder={placeholder}
          rows={4}
          spellCheck={false}
        />
      )
    }
    if (type === 'readonly') {
      return (
        <div className="settings-input settings-input--readonly">
          {val || <span className="settings-null">—</span>}
        </div>
      )
    }
    // default: text
    return (
      <input
        type="text"
        className="settings-input"
        value={val}
        onChange={(e) => handleChange(category, key, e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
      />
    )
  }

  // ── Render categorised sections using FIELD_SCHEMA ───────────────────────
  function renderSections(category) {
    const categoryDraft = draft[category] || {}
    const schemaSections = FIELD_SCHEMA[category]

    // If no schema defined, fall back to raw config array (generic mode)
    if (!schemaSections) {
      const categoryConfig = config[category] || []
      const configArray = Array.isArray(categoryConfig)
        ? categoryConfig
        : Object.entries(categoryConfig).map(([k, e]) => ({ key: k, value: e.value ?? '', description: e.description ?? '', type: e.type ?? 'string' }))
      return (
        <div className="settings-sections">
          <div className="settings-section">
            <div className="settings-fields-grid">
              {configArray.map((item) => {
                const val = categoryDraft[item.key]
                const isBoolean = item.type === 'boolean' || String(item.value) === 'true' || String(item.value) === 'false'
                return (
                  <div key={item.key} className="settings-field">
                    <label className="settings-label">{item.key.replace(/_/g, ' ')}</label>
                    {item.description && <p className="settings-hint">{item.description}</p>}
                    {isBoolean ? (
                      <div className="settings-toggle-row">
                        <button
                          type="button"
                          className={`toggle-switch ${(val === 'true' || val === true) ? 'toggle-on' : 'toggle-off'}`}
                          onClick={() => handleToggle(category, item.key, val)}
                          disabled={saving || resetting}
                        >
                          <span className="toggle-knob" />
                        </button>
                        <span className="toggle-label">{(val === 'true' || val === true) ? 'Enabled' : 'Disabled'}</span>
                      </div>
                    ) : (
                      <input type="text" className="settings-input" value={val ?? ''} onChange={(e) => handleChange(category, item.key, e.target.value)} disabled={saving || resetting} />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="settings-sections">
        {schemaSections.map((sec) => (
          <div key={sec.section} className="settings-section">
            <div className="settings-section-head">
              <h3 className="settings-section-title">{sec.section}</h3>
              {sec.desc && <p className="settings-section-desc">{sec.desc}</p>}
            </div>
            <div className="settings-fields-grid">
              {sec.fields.map((fieldDef) => {
                const draftValue = categoryDraft[fieldDef.key]
                const isToggle = fieldDef.type === 'toggle'
                const isOn = isToggle && (String(draftValue) === 'true' || draftValue === true)
                return (
                  <div
                    key={fieldDef.key}
                    className={`settings-field${isToggle ? ' settings-field--toggle' : ''}${fieldDef.type === 'json' || fieldDef.type === 'textarea' || fieldDef.type === 'tag-list' || fieldDef.type === 'methods' ? ' settings-field--full' : ''}`}
                  >
                    <div className="settings-field-header">
                      <label className="settings-label">{fieldDef.label}</label>
                      {isToggle && (
                        <span className={`settings-toggle-badge ${isOn ? 'badge-on' : 'badge-off'}`}>
                          {isOn ? 'Enabled' : 'Disabled'}
                        </span>
                      )}
                    </div>
                    {(fieldDef.desc) && (
                      <p className="settings-hint">{fieldDef.desc}</p>
                    )}
                    <div className={`settings-input-wrap${isToggle ? ' settings-input-wrap--toggle' : ''}`}>
                      {renderFieldDef(category, fieldDef, draftValue)}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    )
  }

  function renderPanel(category) {
    const categoryDraft = draft[category] || {}

    return (
      <div className="settings-panel">
        <div className="settings-panel-header">
          <div>
            <h2 className="settings-panel-title">{CATEGORY_LABELS[category]}</h2>
            <p className="settings-panel-desc">{CATEGORY_DESCRIPTIONS[category]}</p>
          </div>
        </div>

        {category === 'vehicle' && (
          <div className="vehicle-master-data" style={{ margin: '16px 0' }}>
            <h3 style={{ marginBottom: 8 }}>Vehicle Makes (Master Data)</h3>
            {loadingVehicleMakes ? (
              <div className="loading-message">Loading vehicle makes...</div>
            ) : vehicleMakes.length === 0 ? (
              <div className="settings-empty">No vehicle makes found</div>
            ) : (
              <div className="makes-table-wrap">
                <div className="add-brand-row">
                  <input
                    type="text"
                    placeholder="Add brand name..."
                    value={newMakeName}
                    onChange={(e) => setNewMakeName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddMake() }}
                    className="form-input add-brand-input"
                  />

                  {vehicleDefaultCategories.length > 0 ? (
                    <select
                      value={newMakeCategory}
                      onChange={(e) => setNewMakeCategory(e.target.value)}
                      className="form-input add-brand-select"
                    >
                      <option value="">(No category)</option>
                      {vehicleDefaultCategories.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      placeholder="Category (optional)"
                      value={newMakeCategory}
                      onChange={(e) => setNewMakeCategory(e.target.value)}
                      className="form-input add-brand-select"
                    />
                  )}

                  <button
                    type="button"
                    className="btn-primary add-brand-btn"
                    onClick={handleAddMake}
                    disabled={!newMakeName || loadingVehicleMakes}
                  >
                    {loadingVehicleMakes ? 'Adding…' : 'Add Brand'}
                  </button>
                </div>
                <table className="makes-table">
                  <thead>
                    <tr>
                      <th style={{ minWidth: 260 }}>Make</th>
                      <th>Country</th>
                      <th style={{ width: 110 }}>Status</th>
                      <th style={{ width: 100 }}>Toggle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vehicleMakes.map((m) => (
                      <tr key={m.id}>
                        <td>
                          <div className="make-name">{m.name}</div>
                          <div className="make-category">{m.category || '—'}</div>
                        </td>
                        <td>
                          <span className="make-country">{m.country_origin || '—'}</span>
                        </td>
                        <td>
                          <span className={`make-status-badge ${m.is_active ? 'badge-active' : 'badge-inactive'}`}>
                            {m.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className={`toggle-switch ${m.is_active ? 'toggle-on' : 'toggle-off'}`}
                            onClick={() => handleToggleMakeActive(m.id, m.is_active)}
                            disabled={loadingVehicleMakes}
                            aria-checked={!!m.is_active}
                            role="switch"
                            title={m.is_active ? 'Deactivate brand' : 'Activate brand'}
                          >
                            <span className="toggle-knob" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

          </div>
        )}

        {category === 'email' && (
          <div style={{ margin: '16px 0', padding: '20px 24px', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, background: 'rgba(255,255,255,0.025)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, gap: 16, flexWrap: 'wrap' }}>
              <div>
                <h3 style={{ margin: 0, color: '#d0d8e8', fontWeight: 600 }}>Email Blasting</h3>
                <p style={{ margin: '4px 0 0', color: '#7a8394', fontSize: 13 }}>Set default content for bulk email campaigns. These values pre-fill the campaign editor.</p>
              </div>
              <button
                type="button"
                className="btn-primary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7, flexShrink: 0 }}
                onClick={() => setShowCampaigns(true)}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16v16H4z"/><polyline points="22,6 12,13 2,6"/>
                </svg>
                Manage Campaigns
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 24 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 12, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Campaign Name</label>
                <input className="settings-input" value={categoryDraft.default_campaign_name || ''} onChange={(e) => handleChange('email', 'default_campaign_name', e.target.value)} placeholder="e.g. Monthly Newsletter" />

                <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', marginBottom: 6, fontSize: 12, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Email Subject</label>
                    <input className="settings-input" value={categoryDraft.default_campaign_subject || ''} onChange={(e) => handleChange('email', 'default_campaign_subject', e.target.value)} placeholder="Email subject line..." />
                  </div>
                  <div style={{ width: 190 }}>
                    <label style={{ display: 'block', marginBottom: 6, fontSize: 12, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Send To</label>
                    <select className="settings-input" value={categoryDraft.default_audience || 'VIP'} onChange={(e) => handleChange('email', 'default_audience', e.target.value)}>
                      <option value="ALL">All Customers</option>
                      <option value="VIP">VIP Customers</option>
                      <option value="FIRST_TIME">First-Time Customers</option>
                      <option value="INACTIVE">Inactive Customers</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', marginBottom: 6, fontSize: 12, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Sender Name</label>
                    <input className="settings-input" value={categoryDraft.default_sender_name || ''} onChange={(e) => handleChange('email', 'default_sender_name', e.target.value)} placeholder="e.g. MasterAuto" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', marginBottom: 6, fontSize: 12, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Sender Email</label>
                    <input className="settings-input" type="email" value={categoryDraft.default_sender_email || ''} onChange={(e) => handleChange('email', 'default_sender_email', e.target.value)} placeholder="noreply@masterauto.com" />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', marginBottom: 6, fontSize: 12, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>CTA Button Label</label>
                    <input className="settings-input" value={categoryDraft.default_cta_label || ''} onChange={(e) => handleChange('email', 'default_cta_label', e.target.value)} placeholder="ENROLL NOW" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', marginBottom: 6, fontSize: 12, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>CTA URL</label>
                    <input className="settings-input" value={categoryDraft.default_cta_url || ''} onChange={(e) => handleChange('email', 'default_cta_url', e.target.value)} placeholder="https://..." />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', marginBottom: 6, fontSize: 12, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Send Date & Time</label>
                    <input type="datetime-local" className="settings-input" value={categoryDraft.default_scheduled_at || ''} onChange={(e) => handleChange('email', 'default_scheduled_at', e.target.value)} />
                  </div>
                  <div style={{ width: 190 }}>
                    <label style={{ display: 'block', marginBottom: 6, fontSize: 12, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Timezone</label>
                    <input className="settings-input" value={categoryDraft.default_schedule_timezone || draft.general?.time_zone || 'Asia/Manila'} onChange={(e) => handleChange('email', 'default_schedule_timezone', e.target.value)} />
                  </div>
                </div>

                <div style={{ marginTop: 16 }}>
                  <label style={{ display: 'block', marginBottom: 4, fontSize: 12, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Email Content</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
                    {['{{customer_name}}','{{promo_code}}','{{service_date}}','{{vehicle}}','{{cta_url}}'].map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        style={{ padding: '2px 9px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.06)', color: '#a0a8b8', fontSize: 11.5, fontFamily: 'inherit', cursor: 'pointer' }}
                        onClick={() => {
                          const raw = (categoryDraft.default_campaign_content || '').replace(/\\n/g, '\n')
                          handleChange('email', 'default_campaign_content', raw + tag)
                        }}
                      >{tag}</button>
                    ))}
                    <span style={{ color: '#4a5568', fontSize: 11, alignSelf: 'center', marginLeft: 4 }}>click to insert</span>
                  </div>
                  <textarea
                    rows={8}
                    className="settings-input settings-input--textarea"
                    value={(categoryDraft.default_campaign_content || '').replace(/\\n/g, '\n')}
                    onChange={(e) => handleChange('email', 'default_campaign_content', e.target.value)}
                    placeholder={'Write your email body here.\nYou can use {{customer_name}}, {{promo_code}}, etc.'}
                    style={{ fontFamily: 'inherit', fontSize: 13, lineHeight: 1.6 }}
                  />
                </div>

                <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button
                    type="button"
                    className={`toggle-switch ${(categoryDraft.auto_unsubscribe === 'true' || categoryDraft.auto_unsubscribe === true) ? 'toggle-on' : 'toggle-off'}`}
                    onClick={() => handleToggle('email', 'auto_unsubscribe', categoryDraft.auto_unsubscribe)}
                  >
                    <span className="toggle-knob" />
                  </button>
                  <span style={{ color: '#c0c8d8', fontSize: 13 }}>Automatically append unsubscribe link</span>
                </div>
              </div>

              <div style={{ borderLeft: '1px solid rgba(255,255,255,0.07)', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Preview</label>
                <div className="email-preview" style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: 14, minHeight: 260, background: 'rgba(255,255,255,0.03)', flex: 1 }}>
                  <div style={{ fontWeight: 700, marginBottom: 8, color: '#d0d8e8' }}>{categoryDraft.default_campaign_subject || 'Subject preview'}</div>
                  <div style={{ color: '#a0aec0', fontSize: 13, lineHeight: '1.6' }} dangerouslySetInnerHTML={{ __html: (categoryDraft.default_campaign_content || '').replace(/\\n/g, '\n').replace(/\n/g, '<br/>') }} />
                  <div style={{ marginTop: 16 }}>
                    <button className="btn-cta">{(categoryDraft.default_cta_label || 'ENROLL NOW').toUpperCase()}</button>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <button className="btn-secondary" style={{ flex: 1 }} onClick={() => handleReset('email')}>Reset</button>
                  <button className="btn-primary" style={{ flex: 2 }} onClick={() => handleSave('email')}>Save Changes</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {category === 'promo' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* ── Create new promo code ── */}
            <div style={{ padding: '18px 20px', background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#d0d8e8', marginBottom: 14 }}>Create New Promo Code</div>
              {promoError && <div style={{ marginBottom: 10, padding: '8px 12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 7, color: '#f87171', fontSize: 13 }}>{promoError}</div>}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: '1 1 140px' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Code *</span>
                  <input
                    className="settings-input"
                    value={promoForm.code}
                    onChange={(e) => setPromoForm((p) => ({ ...p, code: e.target.value.toUpperCase() }))}
                    placeholder="e.g. SUMMER20"
                    style={{ fontWeight: 700, letterSpacing: '0.07em' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: '0 0 130px' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Discount Type</span>
                  <select className="settings-input" value={promoForm.discount_type} onChange={(e) => setPromoForm((p) => ({ ...p, discount_type: e.target.value }))}>
                    <option value="percent">Percent (%)</option>
                    <option value="fixed">Fixed (₱)</option>
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: '0 0 100px' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Value *</span>
                  <input
                    className="settings-input"
                    type="number" min="0"
                    value={promoForm.discount_value}
                    onChange={(e) => setPromoForm((p) => ({ ...p, discount_value: e.target.value }))}
                    placeholder={promoForm.discount_type === 'percent' ? '20' : '500'}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: '1 1 140px' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Expires (optional)</span>
                  <input
                    className="settings-input"
                    type="date"
                    value={promoForm.expires_at}
                    onChange={(e) => setPromoForm((p) => ({ ...p, expires_at: e.target.value }))}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: '2 1 200px' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Description (optional)</span>
                  <input
                    className="settings-input"
                    value={promoForm.description}
                    onChange={(e) => setPromoForm((p) => ({ ...p, description: e.target.value }))}
                    placeholder="e.g. Summer discount — 20% off"
                  />
                </div>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={promoSaving || !promoForm.code || !promoForm.discount_value}
                  style={{ flexShrink: 0, alignSelf: 'flex-end' }}
                  onClick={async () => {
                    setPromoSaving(true)
                    setPromoError('')
                    try {
                      await apiPost('/promo-codes', token, {
                        code:           promoForm.code.trim(),
                        discount_type:  promoForm.discount_type,
                        discount_value: Number(promoForm.discount_value),
                        expires_at:     promoForm.expires_at ? new Date(promoForm.expires_at).toISOString() : null,
                        description:    promoForm.description || null,
                      })
                      setPromoForm({ code: '', discount_type: 'percent', discount_value: '', expires_at: '', description: '' })
                      await loadPromoCodes()
                      pushToast('success', 'Promo code created')
                    } catch (e) {
                      setPromoError(e.message || 'Failed to create promo code')
                    } finally {
                      setPromoSaving(false)
                    }
                  }}
                >
                  {promoSaving ? 'Saving…' : '+ Create'}
                </button>
              </div>
            </div>

            {/* ── Promo codes list ── */}
            <div style={{ padding: '18px 20px', background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#d0d8e8', marginBottom: 14 }}>Active Promo Codes</div>
              {promoLoading ? (
                <div style={{ color: '#64748b', fontSize: 13 }}>Loading…</div>
              ) : promoCodes.length === 0 ? (
                <div style={{ color: '#64748b', fontSize: 13 }}>No promo codes yet. Create one above.</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                      {['Code','Type','Value','Expires','Uses','Status','Description','Campaign',''].map((h) => (
                        <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600, color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {promoCodes.map((pc) => {
                      const expired = pc.expires_at && new Date(pc.expires_at) < new Date()
                      const maxed = pc.max_uses !== null && pc.uses_count >= pc.max_uses
                      const statusColor = !pc.is_active ? '#64748b' : expired || maxed ? '#f87171' : '#4ade80'
                      const statusLabel = !pc.is_active ? 'Inactive' : expired ? 'Expired' : maxed ? 'Maxed' : 'Active'
                      return (
                        <tr key={pc.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <td style={{ padding: '9px 10px', fontWeight: 700, color: '#e2e8f0', letterSpacing: '0.06em', fontFamily: 'monospace' }}>{pc.code}</td>
                          <td style={{ padding: '9px 10px', color: '#94a3b8', textTransform: 'capitalize' }}>{pc.discount_type}</td>
                          <td style={{ padding: '9px 10px', color: '#fbbf24', fontWeight: 600 }}>
                            {pc.discount_type === 'percent' ? `${pc.discount_value}%` : `₱${Number(pc.discount_value).toLocaleString('en-PH')}`}
                          </td>
                          <td style={{ padding: '9px 10px', color: expired ? '#f87171' : '#94a3b8', whiteSpace: 'nowrap' }}>
                            {pc.expires_at ? new Date(pc.expires_at).toLocaleDateString('en-PH') : '—'}
                          </td>
                          <td style={{ padding: '9px 10px', color: '#94a3b8' }}>
                            {pc.uses_count}{pc.max_uses !== null ? ` / ${pc.max_uses}` : ''}
                          </td>
                          <td style={{ padding: '9px 10px' }}>
                            <span style={{ fontWeight: 700, color: statusColor, fontSize: 12 }}>{statusLabel}</span>
                          </td>
                          <td style={{ padding: '9px 10px', color: '#64748b', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pc.description || '—'}</td>
                          <td style={{ padding: '9px 10px', color: '#64748b', fontSize: 12 }}>{pc.campaign_name || '—'}</td>
                          <td style={{ padding: '9px 10px', whiteSpace: 'nowrap' }}>
                            {pc.is_active && !expired && !maxed && (
                              <button
                                type="button"
                                onClick={() => setBlastPromo(pc)}
                                style={{ marginRight: 8, padding: '3px 10px', borderRadius: 6, border: '1px solid rgba(37,99,235,0.4)', background: 'rgba(37,99,235,0.12)', color: '#60a5fa', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}
                                title="Send promo email to all clients"
                              >
                                📧 Send Email
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  await apiPatch(`/promo-codes/${pc.id}`, token, { is_active: !pc.is_active })
                                  await loadPromoCodes()
                                } catch (e) { pushToast('error', e.message) }
                              }}
                              style={{ marginRight: 8, padding: '3px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: '#a0a8b8', fontSize: 12, cursor: 'pointer' }}
                            >
                              {pc.is_active ? 'Deactivate' : 'Activate'}
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                if (!window.confirm(`Delete promo code ${pc.code}?`)) return
                                try {
                                  await apiDelete(`/promo-codes/${pc.id}`, token)
                                  await loadPromoCodes()
                                  pushToast('success', 'Deleted')
                                } catch (e) { pushToast('error', e.message) }
                              }}
                              style={{ padding: '3px 10px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.08)', color: '#f87171', fontSize: 12, cursor: 'pointer' }}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {category === 'quotations' && (() => {
          const quotReadOnly = !isSuperAdmin
          const autoShort = (label) => {
            const words = (label || '').trim().split(/\s+/)
            if (words.length === 1) return words[0].slice(0, 3).toUpperCase()
            return words.map((w) => (w[0] || '').toUpperCase()).join('').slice(0, 4)
          }
          const sizeShort = (sz) => {
            const BUILT_IN = {
              'small-bike': 'S.Bike', 'big-bike': 'B.Bike',
              'x-small': 'XS', small: 'S', medium: 'M',
              large: 'L', 'x-large': 'XL', 'xx-large': 'XXL',
            }
            return BUILT_IN[sz.key] || autoShort(sz.label)
          }

          return (
            <div>
              {/* SuperAdmin access notice */}
              {quotReadOnly && (
                <div style={{ marginBottom: 16, padding: '10px 16px', background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.3)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 16 }}>🔒</span>
                  <span style={{ fontSize: 13, color: '#fde68a' }}><strong>View Only</strong> — Changing vehicle sizes require <strong>SuperAdmin</strong> access.</span>
                </div>
              )}
              {/* Vehicle Sizes — toggle + add */}
              <div style={{ marginBottom: 24, padding: '16px 20px', background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#d0d8e8' }}>Vehicle Sizes (for Pricing)</div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>Toggle to enable/disable a size. Disabled sizes won't appear in Quotations. Add custom sizes below.</div>
                  </div>
                  <button
                    type="button"
                    className="btn-primary"
                    style={{ flexShrink: 0, opacity: (quotSizesDirty && isSuperAdmin) ? 1 : 0.5 }}
                    disabled={quotSizesSaving || !isSuperAdmin}
                    onClick={handleSaveQuotationSizes}
                  >
                    {quotSizesSaving ? 'Saving…' : 'Save Sizes'}
                  </button>
                </div>

                {/* Size rows */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {quotSizes.map((sz) => (
                    <div key={sz.key} style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '8px 12px',
                      background: sz.enabled ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.02)',
                      border: `1px solid ${sz.enabled ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.06)'}`,
                      borderRadius: 8,
                      opacity: sz.enabled ? 1 : 0.55,
                    }}>
                      {/* Toggle */}
                      <button
                        type="button"
                        className={`toggle-switch ${sz.enabled ? 'toggle-on' : 'toggle-off'}`}
                        style={{ flexShrink: 0 }}
                        disabled={!isSuperAdmin}
                        onClick={() => {
                          if (!isSuperAdmin) return
                          setQuotSizes((prev) => prev.map((s) => s.key === sz.key ? { ...s, enabled: !s.enabled } : s))
                          setQuotSizesDirty(true)
                        }}
                      >
                        <span className="toggle-knob" />
                      </button>
                      {/* Short code badge */}
                      <span style={{ fontSize: 12, fontWeight: 700, color: sz.enabled ? '#a0a8b8' : '#475569', minWidth: 42 }}>{sizeShort(sz)}</span>
                      {/* Label */}
                      <span style={{ fontSize: 13, color: sz.enabled ? '#d0d8e8' : '#64748b', flex: 1 }}>{sz.label}</span>
                      {/* Key code */}
                      <code style={{ fontSize: 11, color: '#475569', background: 'rgba(0,0,0,0.25)', borderRadius: 4, padding: '2px 6px' }}>{sz.key}</code>
                      {/* Remove button for custom sizes (not built-in) */}
                      {!VEHICLE_SIZE_OPTIONS.find((b) => b.key === sz.key) && isSuperAdmin && (
                        <button
                          type="button"
                          onClick={() => {
                            setQuotSizes((prev) => prev.filter((s) => s.key !== sz.key))
                            setQuotSizesDirty(true)
                          }}
                          style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '0 2px' }}
                          title="Remove custom size"
                        >×</button>
                      )}
                    </div>
                  ))}
                </div>

                {/* Add new size — SuperAdmin only */}
                {isSuperAdmin && (
                <div style={{ marginTop: 14, display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    className="settings-input"
                    style={{ flex: 1 }}
                    placeholder="Key (e.g. mini)"
                    value={quotSizesNewKey}
                    onChange={(e) => setQuotSizesNewKey(e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''))}
                    onKeyDown={(e) => { if (e.key === 'Enter') document.getElementById('addSizeBtn')?.click() }}
                  />
                  <input
                    className="settings-input"
                    style={{ flex: 2 }}
                    placeholder="Label (e.g. Mini Car)"
                    value={quotSizesNewLabel}
                    onChange={(e) => setQuotSizesNewLabel(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') document.getElementById('addSizeBtn')?.click() }}
                  />
                  <button
                    id="addSizeBtn"
                    type="button"
                    className="btn-secondary"
                    style={{ flexShrink: 0 }}
                    disabled={!quotSizesNewKey.trim() || !quotSizesNewLabel.trim() || quotSizes.some((s) => s.key === quotSizesNewKey.trim())}
                    onClick={() => {
                      const key = quotSizesNewKey.trim()
                      const label = quotSizesNewLabel.trim()
                      if (!key || !label || quotSizes.some((s) => s.key === key)) return
                      setQuotSizes((prev) => [...prev, { key, label, enabled: true }])
                      setQuotSizesNewKey('')
                      setQuotSizesNewLabel('')
                      setQuotSizesDirty(true)
                    }}
                  >+ Add Size</button>
                </div>
                )}
              </div>
            </div>
          )
        })()}

        {category === 'services' && (() => {
          const quotReadOnly = !isSuperAdmin
          const autoShort = (label) => {
            const words = (label || '').trim().split(/\s+/)
            if (words.length === 1) return words[0].slice(0, 3).toUpperCase()
            return words.map((w) => (w[0] || '').toUpperCase()).join('').slice(0, 4)
          }
          const sizeShort = (sz) => {
            const BUILT_IN = {
              'small-bike': 'S.Bike', 'big-bike': 'B.Bike',
              'x-small': 'XS', small: 'S', medium: 'M',
              large: 'L', 'x-large': 'XL', 'xx-large': 'XXL',
            }
            return BUILT_IN[sz.key] || autoShort(sz.label)
          }
          const enabledSizes = quotSizes.filter((s) => s.enabled)
          const groups = getCatalogGroups()
          return (
            <div>
              {/* SuperAdmin access notice */}
              {quotReadOnly && (
                <div style={{ marginBottom: 16, padding: '10px 16px', background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.3)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 16 }}>🔒</span>
                  <span style={{ fontSize: 13, color: '#fde68a' }}><strong>View Only</strong> — Adding/removing services, changing prices and discounts require <strong>SuperAdmin</strong> access.</span>
                </div>
              )}

              {/* ── Custom Services ── */}
              <div style={{ marginBottom: 24, padding: '16px 20px', background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#d0d8e8' }}>Custom Services</div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>Add custom services that appear alongside built-in services in Quotations. Set prices in the pricing table below.</div>
                  </div>
                  <button
                    type="button"
                    className="btn-primary"
                    style={{ flexShrink: 0, opacity: (quotCustomSvcDirty && isSuperAdmin) ? 1 : 0.5 }}
                    disabled={quotCustomSvcSaving || !isSuperAdmin}
                    onClick={handleSaveQuotationCustomServices}
                  >
                    {quotCustomSvcSaving ? 'Saving…' : 'Save Services'}
                  </button>
                </div>

                {/* List of custom services */}
                {quotCustomServices.length === 0 && (
                  <div style={{ fontSize: 12, color: '#475569', fontStyle: 'italic', marginBottom: 8 }}>No custom services yet. Add one below.</div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {quotCustomServices.map((svc) => (
                    <div key={svc.code} style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '8px 12px',
                      background: svc.enabled !== false ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.02)',
                      border: `1px solid ${svc.enabled !== false ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)'}`,
                      borderRadius: 8,
                      opacity: svc.enabled !== false ? 1 : 0.55,
                    }}>
                      {/* Toggle */}
                      <button
                        type="button"
                        className={`toggle-switch ${svc.enabled !== false ? 'toggle-on' : 'toggle-off'}`}
                        style={{ flexShrink: 0 }}
                        disabled={!isSuperAdmin}
                        onClick={() => {
                          if (!isSuperAdmin) return
                          setQuotCustomServices((prev) => prev.map((s) => s.code === svc.code ? { ...s, enabled: s.enabled === false } : s))
                          setQuotCustomSvcDirty(true)
                        }}
                      >
                        <span className="toggle-knob" />
                      </button>
                      {/* Name */}
                      <span style={{ fontSize: 13, color: svc.enabled !== false ? '#d0d8e8' : '#64748b', flex: 1, fontWeight: 600 }}>{svc.name}</span>
                      {/* Group badge */}
                      <span style={{ fontSize: 11, color: '#a0a8b8', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: '2px 8px' }}>{svc.group}</span>
                      {/* Code */}
                      <code style={{ fontSize: 11, color: '#475569', background: 'rgba(0,0,0,0.25)', borderRadius: 4, padding: '2px 6px' }}>{svc.code}</code>
                      {/* Remove */}
                      {isSuperAdmin && (
                      <button
                        type="button"
                        onClick={() => {
                          setQuotCustomServices((prev) => prev.filter((s) => s.code !== svc.code))
                          setQuotCustomSvcDirty(true)
                        }}
                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '0 2px' }}
                        title="Remove custom service"
                      >×</button>
                      )}
                    </div>
                  ))}
                </div>

                {/* Add new service row — SuperAdmin only */}
                {isSuperAdmin && (
                <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                  <input
                    className="settings-input"
                    style={{ flex: '2 1 160px', minWidth: 130 }}
                    placeholder="Service name (e.g. Basic Tint)"
                    value={quotNewSvcName}
                    onChange={(e) => setQuotNewSvcName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') document.getElementById('addSvcBtn')?.click() }}
                  />
                  <input
                    className="settings-input"
                    style={{ flex: '1 1 140px', minWidth: 120 }}
                    placeholder="Group (e.g. Tint Services)"
                    value={quotNewSvcGroup}
                    onChange={(e) => setQuotNewSvcGroup(e.target.value)}
                    list="svc-group-list"
                    onKeyDown={(e) => { if (e.key === 'Enter') document.getElementById('addSvcBtn')?.click() }}
                  />
                  <datalist id="svc-group-list">
                    {[...new Set([...getCatalogGroups(), ...quotCustomServices.map((s) => s.group)])].map((g) => (
                      <option key={g} value={g} />
                    ))}
                  </datalist>
                  <button
                    id="addSvcBtn"
                    type="button"
                    className="btn-secondary"
                    style={{ flexShrink: 0 }}
                    disabled={
                      !quotNewSvcName.trim() ||
                      !quotNewSvcGroup.trim()
                    }
                    onClick={() => {
                      const name  = quotNewSvcName.trim()
                      const group = quotNewSvcGroup.trim()
                      if (!name || !group) return
                      // Auto-generate code from name
                      const baseCode = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
                      let code = baseCode
                      let i = 2
                      while (SERVICE_CATALOG.some((s) => s.code === code) || quotCustomServices.some((s) => s.code === code)) {
                        code = `${baseCode}-${i++}`
                      }
                      const sizePrices = Object.fromEntries(VEHICLE_SIZE_OPTIONS.map((s) => [s.key, 0]))
                      setQuotCustomServices((prev) => [...prev, { code, name, group, enabled: true, sizePrices }])
                      setQuotNewSvcName('')
                      setQuotNewSvcGroup('')
                      setQuotCustomSvcDirty(true)
                      // Jump to that group in the pricing table
                      setQuotPriceGroup(group)
                      setTimeout(() => {
                        document.getElementById('quot-pricing-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                      }, 80)
                    }}
                  >+ Add Service</button>
                </div>
                )}
              </div>

              {/* Service Pricing editor */}
              <div id="quot-pricing-section" style={{ padding: '16px 20px', background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#d0d8e8' }}>Service Pricing</div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>Prices are in ₱. Highlighted cells have custom overrides. Changes apply immediately in Quotations when saved.</div>
                  </div>
                  <button
                    type="button"
                    className="btn-primary"
                    style={{ flexShrink: 0, opacity: ((quotPricesDirty || quotCustomSvcDirty) && isSuperAdmin) ? 1 : 0.5 }}
                    disabled={quotPricesSaving || !isSuperAdmin}
                    onClick={handleSaveQuotationPrices}
                  >
                    {quotPricesSaving ? 'Saving…' : 'Save Pricing'}
                  </button>
                </div>

                {/* Category filter tabs */}
                {(() => {
                  const allGroups = [
                    ...groups,
                    ...([...new Set(quotCustomServices.filter((s) => s.enabled !== false).map((s) => s.group))]
                      .filter((g) => !groups.includes(g)))
                  ]
                  return (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16, marginTop: 8 }}>
                      <button
                        type="button"
                        onClick={() => setQuotPriceGroup(null)}
                        style={{
                          padding: '4px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1px solid',
                          background: quotPriceGroup === null ? 'rgba(255,255,255,0.15)' : 'transparent',
                          borderColor: quotPriceGroup === null ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.1)',
                          color: quotPriceGroup === null ? '#a0a8b8' : '#64748b',
                        }}
                      >All</button>
                      {allGroups.map((g) => {
                        const isCustom = !groups.includes(g)
                        const isActive = quotPriceGroup === g
                        return (
                          <button
                            key={g}
                            type="button"
                            onClick={() => setQuotPriceGroup(g)}
                            style={{
                              padding: '4px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1px solid',
                              background: isActive ? 'rgba(255,255,255,0.08)' : 'transparent',
                              borderColor: isActive ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.1)',
                              color: isActive ? '#c0c8d8' : '#64748b',
                            }}
                          >{g}</button>
                        )
                      })}
                    </div>
                  )
                })()}

                {groups.filter((g) => quotPriceGroup === null || quotPriceGroup === g).map((group) => {
                  const services = SERVICE_CATALOG.filter((s) => s.group === group)
                  return (
                    <div key={group} style={{ marginTop: 20 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#a0a8b8', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>{group}</div>
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ borderCollapse: 'collapse', fontSize: 13, width: '100%' }}>
                          <thead>
                            <tr>
                              <th style={{ textAlign: 'left', color: '#94a3b8', padding: '6px 12px', borderBottom: '1px solid rgba(255,255,255,0.07)', minWidth: 160, fontWeight: 600, fontSize: 11 }}>Service</th>
                              {enabledSizes.map((sz) => (
                                <th key={sz.key} style={{ color: '#94a3b8', padding: '6px 6px', borderBottom: '1px solid rgba(255,255,255,0.07)', minWidth: 76, textAlign: 'center', fontWeight: 600, fontSize: 11 }}>
                                  {sizeShort(sz)}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {services.map((service) => (
                              <tr key={service.code} style={{ '&:hover': { background: 'rgba(255,255,255,0.02)' } }}>
                                <td style={{ padding: '5px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                  <input
                                    className="settings-input"
                                    value={quotServiceNames[service.code] ?? service.name}
                                    readOnly={!isSuperAdmin}
                                    disabled={!isSuperAdmin}
                                    onChange={(e) => {
                                      setQuotServiceNames((prev) => ({ ...prev, [service.code]: e.target.value }))
                                      setQuotServiceNamesDirty(true)
                                      setQuotPricesDirty(true)
                                    }}
                                    style={{
                                      width: '100%',
                                      minWidth: '140px',
                                      background: 'rgba(255,255,255,0.04)',
                                      border: quotServiceNames[service.code] ? '1px solid rgba(255,255,255,0.35)' : '1px solid rgba(255,255,255,0.12)',
                                      borderRadius: 4,
                                      color: quotServiceNames[service.code] ? '#7dd3fc' : '#d0d8e8',
                                      fontSize: 13,
                                      padding: '4px 8px',
                                      transition: 'all 0.2s ease',
                                    }}
                                  />
                                </td>
                                {enabledSizes.map((sz) => {
                                  const hasSize = service.sizePrices[sz.key] !== undefined
                                  const override = quotPrices[service.code]?.[sz.key]
                                  const defaultVal = service.sizePrices[sz.key] ?? ''
                                  const displayVal = override !== undefined ? override : defaultVal
                                  const isOverridden = override !== undefined && override !== service.sizePrices[sz.key]
                                  return (
                                    <td key={sz.key} style={{ padding: '4px 4px', borderBottom: '1px solid rgba(255,255,255,0.04)', textAlign: 'center' }}>
                                      {hasSize ? (
                                        <input
                                          type="number"
                                          min="0"
                                          step="100"
                                          value={displayVal}
                                          readOnly={!isSuperAdmin}
                                          disabled={!isSuperAdmin}
                                          onChange={(e) => {
                                            if (!isSuperAdmin) return
                                            const val = Number(e.target.value) || 0
                                            setQuotPrices((prev) => ({
                                              ...prev,
                                              [service.code]: {
                                                ...(service.sizePrices),
                                                ...(prev[service.code] || {}),
                                                [sz.key]: val,
                                              },
                                            }))
                                            setQuotPricesDirty(true)
                                          }}
                                          style={{
                                            width: '74px',
                                            background: isOverridden ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)',
                                            border: `1px solid ${isOverridden ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.1)'}`,
                                            borderRadius: 4,
                                            color: isOverridden ? '#7dd3fc' : '#d0d8e8',
                                            fontSize: 12,
                                            padding: '3px 5px',
                                            textAlign: 'right',
                                          }}
                                        />
                                      ) : (
                                        <span style={{ color: '#1e293b', fontSize: 12 }}>—</span>
                                      )}
                                    </td>
                                  )
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )
                })}

                {/* Custom service rows in pricing table */}
                {quotCustomServices.filter((s) => s.enabled !== false).length > 0 && (() => {
                  const customGroups = [...new Set(quotCustomServices.filter((s) => s.enabled !== false).map((s) => s.group))]
                  return customGroups.filter((g) => quotPriceGroup === null || quotPriceGroup === g).map((grp) => {
                    const services = quotCustomServices.filter((s) => s.enabled !== false && s.group === grp)
                    return (
                      <div key={`custom-${grp}`} style={{ marginTop: 20 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#a0a8b8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{grp}</div>
                          <span style={{ fontSize: 10, color: '#8a9ab8', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '1px 6px' }}>custom</span>
                        </div>
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ borderCollapse: 'collapse', fontSize: 13, width: '100%' }}>
                            <thead>
                              <tr>
                                <th style={{ textAlign: 'left', color: '#94a3b8', padding: '6px 12px', borderBottom: '1px solid rgba(255,255,255,0.07)', minWidth: 160, fontWeight: 600, fontSize: 11 }}>Service</th>
                                {enabledSizes.map((sz) => (
                                  <th key={sz.key} style={{ color: '#94a3b8', padding: '6px 6px', borderBottom: '1px solid rgba(255,255,255,0.07)', minWidth: 76, textAlign: 'center', fontWeight: 600, fontSize: 11 }}>
                                    {sizeShort(sz)}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {services.map((service) => (
                                <tr key={service.code}>
                                  <td style={{ padding: '5px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                    <input
                                      className="settings-input"
                                      value={service.name}
                                      readOnly={!isSuperAdmin}
                                      disabled={!isSuperAdmin}
                                      onChange={(e) => {
                                        setQuotCustomServices((prev) => 
                                          prev.map((s) => s.code === service.code ? { ...s, name: e.target.value } : s)
                                        )
                                        setQuotCustomSvcDirty(true)
                                        setQuotPricesDirty(true)
                                      }}
                                      style={{
                                        width: '100%',
                                        minWidth: '140px',
                                        background: 'rgba(255,255,255,0.04)',
                                        border: '1px solid rgba(255,255,255,0.12)',
                                        borderRadius: 4,
                                        color: '#d0d8e8',
                                        fontSize: 13,
                                        padding: '4px 8px',
                                        transition: 'all 0.2s ease',
                                      }}
                                    />
                                  </td>
                                  {enabledSizes.map((sz) => {
                                    const override = quotPrices[service.code]?.[sz.key]
                                    const defaultVal = service.sizePrices?.[sz.key] ?? 0
                                    const displayVal = override !== undefined ? override : defaultVal
                                    const isOverridden = override !== undefined && override !== defaultVal
                                    return (
                                      <td key={sz.key} style={{ padding: '4px 4px', borderBottom: '1px solid rgba(255,255,255,0.04)', textAlign: 'center' }}>
                                        <input
                                          type="number"
                                          min="0"
                                          step="100"
                                          value={displayVal}
                                          readOnly={!isSuperAdmin}
                                          disabled={!isSuperAdmin}
                                          onChange={(e) => {
                                            if (!isSuperAdmin) return
                                            const val = Number(e.target.value) || 0
                                            setQuotPrices((prev) => ({
                                              ...prev,
                                              [service.code]: {
                                                ...(service.sizePrices || {}),
                                                ...(prev[service.code] || {}),
                                                [sz.key]: val,
                                              },
                                            }))
                                            setQuotPricesDirty(true)
                                          }}
                                          style={{
                                            width: '74px',
                                            background: isOverridden ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)',
                                            border: `1px solid ${isOverridden ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.1)'}`,
                                            borderRadius: 4,
                                            color: isOverridden ? '#c0c8d8' : '#d0d8e8',
                                            fontSize: 12,
                                            padding: '3px 5px',
                                            textAlign: 'right',
                                          }}
                                        />
                                      </td>
                                    )
                                  })}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )
                  })
                })()}
              </div>
            </div>
          )
        })()}

        {category !== 'email' && category !== 'quotations' && category !== 'services' && renderSections(category)}

        {isAdmin && category !== 'email' && category !== 'quotations' && (
          <div className="settings-actions">
            <button 
              type="button" 
              className="btn-secondary" 
              onClick={() => handleReset(category)} 
              disabled={resetting || saving || !isSuperAdmin}
              title={isSuperAdmin ? '' : 'SuperAdmin only'}
            >
              {resetting ? 'Resetting…' : 'Reset to Defaults'}
            </button>
            <button 
              type="button" 
              className="btn-primary" 
              onClick={() => handleSave(category)} 
              disabled={saving || resetting || !dirtyCategories.has(category)}
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        )}
      </div>
    )
  }

  function renderLogs() {
    return (
      <div className="settings-panel">
        <div className="settings-panel-header">
          <div>
            <h2 className="settings-panel-title">Audit Logs</h2>
            <p className="settings-panel-desc">View complete history of all configuration changes</p>
          </div>
        </div>

        {loadingLogs ? (
          <div className="settings-loading">Loading logs…</div>
        ) : logs.length === 0 ? (
          <div className="settings-empty">No configuration changes recorded yet</div>
        ) : (
          <div className="settings-logs">
            <table className="logs-table">
              <thead>
                <tr>
                  <th>Date & Time</th>
                  <th>Category</th>
                  <th>Setting</th>
                  <th>Old Value</th>
                  <th>New Value</th>
                  <th>Changed By</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td>{new Date(log.created_at).toLocaleString('en-PH')}</td>
                    <td className="log-category">{log.category}</td>
                    <td className="log-key">{log.key}</td>
                    <td className="log-value-old">{String(log.old_value).slice(0, 30)}</td>
                    <td className="log-value-new">{String(log.new_value).slice(0, 30)}</td>
                    <td>{log.changed_by}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {logsMeta.totalPages > 1 && (
              <div className="logs-pagination">
                <button 
                  disabled={logsPage === 1}
                  onClick={() => setLogsPage(p => p - 1)}
                >
                  ← Previous
                </button>
                <span>Page {logsPage} of {logsMeta.totalPages}</span>
                <button 
                  disabled={logsPage === logsMeta.totalPages}
                  onClick={() => setLogsPage(p => p + 1)}
                >
                  Next →
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  if (loadingConfig) {
    return (
      <div className="settings-page">
        <div className="settings-loading">Loading Configuration…</div>
      </div>
    )
  }

  return (
    <div className="settings-page">
      {/* Page header */}
      <div className="settings-page-header">
        <div className="settings-page-title-wrap">
          <h1 className="settings-page-title">Settings</h1>
          <p className="settings-page-subtitle">
            Manage system configuration, business rules, and operational behaviour.
          </p>
        </div>
      </div>

      <div className="settings-layout">
        {/* Sidebar tabs */}
        <nav className="settings-tabs">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`settings-tab-btn${activeTab === tab.key ? ' settings-tab-btn--active' : ''}${tab.key === 'email' ? ' email-tab' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              <span className="settings-tab-icon">{tab.icon}</span>
              <span className="settings-tab-label">{tab.label}</span>
              {tab.key !== 'logs' && dirtyCategories.has(tab.key) && (
                <span className="settings-tab-dot" aria-label="Unsaved changes" />
              )}
            </button>
          ))}
        </nav>

        {/* Content area */}
        <div className="settings-content">
          {activeTab === 'logs'
            ? renderLogs()
            : renderPanel(activeTab)}
        </div>
      </div>
      {showCampaigns && <CampaignsModal token={token} onClose={() => setShowCampaigns(false)} />}
      {blastPromo && (
        <PromoEmailModal
          promo={blastPromo}
          token={token}
          onClose={() => setBlastPromo(null)}
        />
      )}
    </div>
  )
}
