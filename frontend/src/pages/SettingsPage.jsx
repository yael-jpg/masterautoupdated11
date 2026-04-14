import { useCallback, useEffect, useRef, useState } from 'react'
import { apiGet, apiPut, apiPost, apiPatch, apiDelete, pushToast } from '../api/client'
import { SERVICE_CATALOG, VEHICLE_SIZE_OPTIONS, getCatalogGroups } from '../data/serviceCatalog'
import './SettingsPage.css'
import CampaignsModal from './CampaignsModal'
import PromoEmailModal from './PromoEmailModal'
import { emitConfigUpdated, emitPackagesUpdated, emitVehicleMakesUpdated } from '../utils/events'

const REMOVED_SERVICE_CODES = new Set(['ppf-full'])

function sanitizeServiceCodeMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const out = {}
  Object.entries(value).forEach(([k, v]) => {
    const code = String(k || '').trim().toLowerCase()
    if (!code || REMOVED_SERVICE_CODES.has(code)) return
    out[code] = v
  })
  return out
}

function sanitizeCustomServices(value) {
  if (!Array.isArray(value)) return []
  return value.filter((svc) => {
    const code = String(svc?.code || '').trim().toLowerCase()
    return code && !REMOVED_SERVICE_CODES.has(code)
  })
}

function sanitizeDeletedServiceCodes(value) {
  const list = Array.isArray(value) ? value : []
  const merged = [...REMOVED_SERVICE_CODES, ...list.map((v) => String(v || '').trim().toLowerCase())]
  return Array.from(new Set(merged.filter(Boolean)))
}

// ── Payment methods tag editor ───────────────────────────────────────────────
const PRESET_PAYMENT_METHODS = ['Cash', 'GCash', 'Credit Card', 'Debit Card', 'Bank Transfer', 'PayMaya', 'Check']
const BASIC_PMS_CORE_INCLUSIONS = [
  'Engine Maintenance: Replacement of engine oil and oil filter.',
  'Fluid Service: Top-up or replacement of brake fluid, clutch fluid, coolant, and washer fluid.',
  'Brake System: Inspection of brake pads/shoes, cleaning of front and rear brakes, and brake fluid moisture testing.',
  'Inspection & Cleaning: Air filter and cabin filter cleaning or replacement, and spark plug check.',
  'Underchassis & Tires: Tire pressure check, tire rotation, and inspection of suspension, steering, and CV boots.',
  'Electrical & Engine: Battery health check (voltage/terminals), light inspection, and basic computer box scanning.',
]

const PMS_TIER_LABEL_BY_KM = {
  5000: 'Basic PMS',
  10000: 'Standard PMS',
  20000: 'Advanced PMS',
  40000: 'Major PMS',
  50000: 'Premium PMS',
}

const PMS_INCLUSIONS_BY_KM = {
  5000: BASIC_PMS_CORE_INCLUSIONS,
  10000: [
    'Engine Maintenance PLUS: Replacement of engine oil and oil filter, and full underhood inspection.',
    'Fluid Service PLUS: Top-up of brake, clutch, coolant, and washer fluids with leak-point inspection.',
    'Brake System PLUS: Brake pad/shoe wear check, rotor/drum cleaning, and brake fluid condition check.',
    'Inspection & Cleaning PLUS: Air filter and cabin filter inspection with replacement recommendation.',
    'Underchassis & Tires PLUS: Tire rotation, pressure balancing, and steering/suspension visual check.',
    'Electrical & Engine PLUS: Battery load test, charging output test, and scan for warning faults.',
  ],
  20000: [
    'Engine Maintenance ADVANCED: Engine oil and oil filter replacement plus spark plug inspection.',
    'Fluid Service ADVANCED: Brake fluid moisture test and coolant condition test with top-up/reset.',
    'Brake System ADVANCED: Front and rear brake cleaning, adjustment, and wear trend recording.',
    'Inspection & Cleaning ADVANCED: Air and cabin filter replacement as needed with throttle body check.',
    'Underchassis & Tires ADVANCED: Tire rotation with wheel alignment check and underchassis torque check.',
    'Electrical & Engine ADVANCED: Battery/alternator test and ECU scan with service reminder reset.',
  ],
  40000: [
    'Engine Maintenance MAJOR: Engine oil and oil filter replacement with full tune-up inspection.',
    'Fluid Service MAJOR: Brake fluid replacement and coolant flush/top-up based on condition.',
    'Brake System MAJOR: Detailed brake overhaul check including caliper slide pins and brake lines.',
    'Inspection & Cleaning MAJOR: Air and cabin filter replacement with spark plug service recommendation.',
    'Underchassis & Tires MAJOR: Suspension bushings, steering links, and CV boots comprehensive inspection.',
    'Electrical & Engine MAJOR: Battery health, starter draw test, alternator output, and full scan diagnostics.',
  ],
  50000: [
    'Engine Maintenance PREMIUM: Engine oil and oil filter replacement with long-interval wear assessment.',
    'Fluid Service PREMIUM: Transmission fluid check, brake fluid service, and coolant refresh as required.',
    'Brake System PREMIUM: Full brake performance test, cleaning, and component replacement advisory.',
    'Inspection & Cleaning PREMIUM: Air/cabin filter replacement and ignition/fuel system inspection.',
    'Underchassis & Tires PREMIUM: Deep underchassis inspection with steering, suspension, and tire health report.',
    'Electrical & Engine PREMIUM: Battery, charging, and electronic systems diagnostics with preventive recommendations.',
  ],
}

function extractPmsServiceNames(services) {
  if (!Array.isArray(services)) return []
  return services
    .map((item) => {
      if (item && typeof item === 'object') return String(item.name || '').trim()
      return String(item || '').trim()
    })
    .filter(Boolean)
}

function parseManualServices(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

function areSameServiceLists(a, b) {
  if (a.length !== b.length) return false
  return a.every((v, i) => String(v).toLowerCase() === String(b[i]).toLowerCase())
}

function getPmsTierLabel(kmValue) {
  const km = Number(kmValue)
  if (!Number.isFinite(km) || km <= 0) return 'Custom PMS'
  return PMS_TIER_LABEL_BY_KM[km] || 'Custom PMS'
}

function getPmsDisplayName(name, kmValue) {
  const rawName = String(name || '').trim()
  const km = Number(kmValue)
  if (!Number.isFinite(km) || km <= 0) return rawName || 'PMS Package'

  const legacyNamePattern = /(kilometer\s*pms|km\s*pms)$/i
  if (!rawName || legacyNamePattern.test(rawName)) {
    return `${getPmsTierLabel(km)} - ${km.toLocaleString('en-US')} KM`
  }
  return rawName
}

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
  { key: 'subscriptions',   label: 'Subscriptions',     icon: '🛒' },
  { key: 'pms',             label: 'PMS Packages',      icon: '🧰' },
  { key: 'quotations',      label: 'Quotations',        icon: '📋' },
  { key: 'quotation_email', label: 'Quotations Email',  icon: '📧' },
  { key: 'booking',         label: 'Bookings',          icon: '📅' },
  { key: 'booking_email',   label: 'Booking Email',     icon: '📨' },
  { key: 'pms_email',       label: 'PMS Email',         icon: '🛎️' },
  { key: 'subscription_email', label: 'Subscription Email', icon: '📬' },
  { key: 'landing_chat',    label: 'Landing Chat AI',   icon: '🤖' },
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
  subscriptions:    'Subscription Packages',
  pms:              'PMS Packages',
  services_process:  'Services Process',
  inventory:        'Inventory Settings',
  quotation_email:  'Quotation Email Settings',
  booking_email:    'Booking Confirmation Email Settings',
  pms_email:        'PMS Reminder Email Settings',
  subscription_email: 'Subscription Reminder Email Settings',
  landing_chat:     'Landing Chat AI Settings',
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
  subscriptions:    'Manage subscription plans and service bundles.',
  pms:              'Manage Preventive Maintenance Service schedules.',
  services_process: 'Configure service steps, checklists, and workflow status rules.',
  inventory:        'Configure stock thresholds and default inventory rules.',
  quotation_email:  'Customize the Service Confirmation email sent to customers when a quotation is approved.',
  booking_email:    'Customize the Booking Confirmation email sent to customers when a new booking/appointment is created.',
  pms_email:        'Customize the PMS Reminder email sent when a vehicle is due for follow-up maintenance.',
  subscription_email: 'Customize the Subscription reminder email sent before expiry and when expired.',
  landing_chat:     'Configure automatic chat replies and ML-style intent behavior for landing-page chat.',
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
  landing_chat: [
    {
      section: 'Automatic Reply',
      desc: 'Controls for pre-reply behavior before SuperAdmin manually replies.',
      fields: [
        { key: 'auto_reply_enabled', label: 'Enable Automatic Reply', type: 'toggle', defaultValue: 'true' },
        {
          key: 'welcome_message',
          label: 'Welcome / Intro Message',
          type: 'textarea',
          defaultValue: 'Hello! Thank you for contacting Master Auto. Please share your concern and our assistant will acknowledge it first, then a SuperAdmin will respond shortly.',
          placeholder: 'Message shown when chat starts and no messages exist yet',
          desc: 'Displayed as the first system message before any chat messages appear.',
        },
        {
          key: 'auto_reply_template',
          label: 'Fallback Reply Template',
          type: 'textarea',
          defaultValue: 'Thank you, {{name}}. Your message has been received and queued. A SuperAdmin will assist you as soon as possible.',
          placeholder: 'Use placeholders like {{name}}',
          desc: 'Used when ML intent does not find a match. Supports {{name}}.',
        },
      ],
    },
    {
      section: 'Machine Learning Intent',
      desc: 'ML-style keyword intent matching and intent-based response templates.',
      fields: [
        { key: 'ml_intent_enabled', label: 'Enable Intent Matching', type: 'toggle', defaultValue: 'true' },
        {
          key: 'ml_intent_rules',
          label: 'Intent Rules (JSON)',
          type: 'json',
          defaultValue: JSON.stringify([
            { intent: 'pricing', keywords: ['price', 'cost', 'how much', 'rate', 'discount'] },
            { intent: 'booking', keywords: ['book', 'schedule', 'appointment', 'slot', 'available'] },
            { intent: 'location', keywords: ['where', 'location', 'address', 'branch', 'map'] },
            { intent: 'services', keywords: ['service', 'ppf', 'ceramic', 'tint', 'detailing', 'package'] },
            { intent: 'status', keywords: ['status', 'update', 'progress', 'follow up', 'follow-up'] },
          ], null, 2),
          desc: 'Array of intent objects: { intent, keywords[] }',
        },
        {
          key: 'ml_intent_replies',
          label: 'Intent Replies (JSON)',
          type: 'json',
          defaultValue: JSON.stringify({
            pricing: 'Thanks {{name}}. For pricing, our team will provide a quotation based on your vehicle and preferred service.',
            booking: 'Thanks {{name}}. For booking requests, please share your preferred date/time and vehicle details.',
            location: 'Thanks {{name}}. Our team will send the exact branch/location details shortly.',
            services: 'Thanks {{name}}. We offer PPF, ceramic coating, tint, detailing, and seat cover packages.',
            status: 'Thanks {{name}}. We have logged your request and SuperAdmin will send an update soon.',
            fallback: 'Thanks {{name}}! Your message is queued. SuperAdmin will reply as soon as possible.',
          }, null, 2),
          desc: 'Object map by intent name + fallback. Supports {{name}} and {{intent}}.',
        },
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
        {
          key: 'default_service_pricing',
          label: 'Default Service Pricing Rules',
          type: 'json',
          defaultValue: JSON.stringify({ labor_cost: 'hourly', parts_markup: 25 }, null, 2),
          placeholder: '{\n  "labor_cost": "hourly",\n  "parts_markup": 25\n}',
        },
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
  pms_email: [
    {
      section: 'PMS Reminder Email',
      desc: 'Sent automatically when PMS reminders are generated for customers.',
      fields: [
        {
          key: 'enabled',
          label: 'Send PMS Reminder Emails',
          type: 'toggle',
          desc: 'When enabled, customer PMS reminders are sent by email. Turn off to keep in-app reminders only.',
        },
        {
          key: 'subject',
          label: 'Email Subject',
          type: 'text',
          placeholder: 'e.g. PMS Reminder for {plate_number}',
          desc: 'Supports placeholders: {plate_number}, {package_name}, {kilometer_interval}. Leave blank to use the default.',
        },
        {
          key: 'greeting',
          label: 'Greeting / Intro Message',
          type: 'textarea',
          placeholder: 'e.g. This is to remind you that your vehicle plate no. {plate_number}, availed package {package_name} is due for your next preventive maintenance service.',
          desc: 'Supports placeholders: {plate_number}, {package_name}, {kilometer_interval}.',
        },
      ],
    },
  ],
  subscription_email: [
    {
      section: 'Subscription Reminder Email',
      desc: 'Sent automatically to customers 5 days before expiry and again when already expired.',
      fields: [
        {
          key: 'enabled',
          label: 'Send Subscription Reminder Emails',
          type: 'toggle',
          desc: 'When enabled, reminder emails are sent for both expiring soon and expired subscriptions.',
        },
        {
          key: 'subject',
          label: 'Email Subject',
          type: 'text',
          placeholder: 'e.g. Subscription {status} — {plate_number}',
          desc: 'Supports placeholders: {status}, {plate_number}, {package_name}, {end_date}. Leave blank to use default subjects.',
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

  const [subscriptionPackages, setSubscriptionPackages] = useState([])
  const [subsLoading, setSubsLoading] = useState(false)
  const [subsSearch, setSubsSearch] = useState('')
  const [subsStatusFilter, setSubsStatusFilter] = useState('all')
  const [showSubsModal, setShowSubsModal] = useState(false)
  const [showSubsDeleteModal, setShowSubsDeleteModal] = useState(false)
  const [editingPackage, setEditingPackage] = useState(null)
  const [deletingPackage, setDeletingPackage] = useState(null)
  const [subsSaving, setSubsSaving] = useState(false)
  const [subsDeleting, setSubsDeleting] = useState(false)
  const [subsError, setSubsError] = useState('')
  const [subsForm, setSubsForm] = useState({
    name: '',
    description: '',
    priceWeekly: '',
    priceMonthly: '',
    priceAnnual: '',
    status: 'Active',
  })

  const [pmsPackages, setPmsPackages] = useState([])
  const [pmsLoading, setPmsLoading] = useState(false)
  const [pmsSearch, setPmsSearch] = useState('')
  const [pmsStatusFilter, setPmsStatusFilter] = useState('all')
  const [showPmsModal, setShowPmsModal] = useState(false)
  const [showPmsDeleteModal, setShowPmsDeleteModal] = useState(false)
  const [editingPmsPackage, setEditingPmsPackage] = useState(null)
  const [deletingPmsPackage, setDeletingPmsPackage] = useState(null)
  const [pmsSaving, setPmsSaving] = useState(false)
  const [pmsDeleting, setPmsDeleting] = useState(false)
  const [pmsError, setPmsError] = useState('')
  const [pmsNameManuallyEdited, setPmsNameManuallyEdited] = useState(false)
  const [pmsForm, setPmsForm] = useState({
    name: '',
    kilometerInterval: '',
    description: '',
    price: '',
    inclusionMode: 'auto',
    manualServicesText: '',
    status: 'Active',
  })

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
  const [quotDeletedServiceCodes, setQuotDeletedServiceCodes] = useState(() => Array.from(REMOVED_SERVICE_CODES))
  const [quotDeletedSvcDirty, setQuotDeletedSvcDirty] = useState(false)
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

  const loadSubscriptionPackages = useCallback(async () => {
    if (!isAdmin) return
    setSubsLoading(true)
    try {
      const packages = await apiGet('/subscriptions', token)
      setSubscriptionPackages(Array.isArray(packages) ? packages : [])
    } catch (e) {
      pushToast('error', e.message)
    } finally {
      setSubsLoading(false)
    }
  }, [isAdmin, token])

  useEffect(() => {
    if (activeTab === 'subscriptions') loadSubscriptionPackages()
  }, [activeTab, loadSubscriptionPackages])

  const openCreateSubscriptionModal = () => {
    setEditingPackage(null)
    setSubsError('')
    setSubsForm({
      name: '',
      description: '',
      priceWeekly: '',
      priceMonthly: '',
      priceAnnual: '',
      status: 'Active',
    })
    setShowSubsModal(true)
  }

  const openEditSubscriptionModal = (pkg) => {
    const freq = pkg?.price_by_frequency || {}
    setEditingPackage(pkg)
    setSubsError('')
    setSubsForm({
      name: pkg.name || '',
      description: pkg.description || '',
      priceWeekly: freq.weekly == null ? '' : String(freq.weekly),
      priceMonthly: freq.monthly == null ? String(pkg.price ?? '') : String(freq.monthly),
      priceAnnual: freq.annual == null ? '' : String(freq.annual),
      status: String(pkg.status || 'Active') === 'Inactive' ? 'Inactive' : 'Active',
    })
    setShowSubsModal(true)
  }

  const saveSubscriptionPackage = async () => {
    const cleanName = subsForm.name.trim()
    const weekly = Number(subsForm.priceWeekly)
    const monthly = Number(subsForm.priceMonthly)
    const annual = Number(subsForm.priceAnnual)
    const duration = String(editingPackage?.duration || 'Monthly')
    if (
      !cleanName ||
      !Number.isFinite(weekly) || weekly < 0 ||
      !Number.isFinite(monthly) || monthly < 0 ||
      !Number.isFinite(annual) || annual < 0
    ) {
      setSubsError('Package Name and valid Weekly/Monthly/Annual prices are required.')
      return
    }

    setSubsSaving(true)
    setSubsError('')
    try {
      const payload = {
        name: cleanName,
        description: subsForm.description.trim(),
        price: monthly,
        price_by_frequency: {
          weekly,
          monthly,
          annual,
        },
        duration,
        services: [],
        status: subsForm.status,
      }

      if (editingPackage?.id) {
        await apiPut(`/subscriptions/${editingPackage.id}`, token, payload)
        pushToast('success', 'Subscription Updated')
        emitPackagesUpdated({ scope: 'subscriptions', action: 'update', id: editingPackage.id })
      } else {
        await apiPost('/subscriptions', token, payload)
        pushToast('success', 'Subscription Created')
        emitPackagesUpdated({ scope: 'subscriptions', action: 'create' })
      }

      setShowSubsModal(false)
      await loadSubscriptionPackages()
    } catch (e) {
      setSubsError(e.message || 'Failed to save subscription package')
    } finally {
      setSubsSaving(false)
    }
  }

  const deleteSubscriptionPackage = async () => {
    if (!deletingPackage?.id) return
    setSubsDeleting(true)
    try {
      await apiDelete(`/subscriptions/${deletingPackage.id}`, token)
      pushToast('success', 'Subscription Deleted')
      emitPackagesUpdated({ scope: 'subscriptions', action: 'delete', id: deletingPackage.id })
      setShowSubsDeleteModal(false)
      setDeletingPackage(null)
      await loadSubscriptionPackages()
    } catch (e) {
      pushToast('error', e.message || 'Failed to delete subscription package')
    } finally {
      setSubsDeleting(false)
    }
  }

  const formatPmsNameFromKm = (km) => {
    const n = Number(km)
    if (!Number.isFinite(n) || n <= 0) return ''
    return `${getPmsTierLabel(n)} - ${n.toLocaleString('en-US')} KM`
  }

  const getAutoPmsInclusions = (kmValue, excludePackageId = null) => {
    const km = Number(kmValue)
    if (!Number.isFinite(km) || km <= 0) return BASIC_PMS_CORE_INCLUSIONS

    // For official tiers, always use the fixed template (do not inherit old same-KM rows).
    if (PMS_INCLUSIONS_BY_KM[km]) return PMS_INCLUSIONS_BY_KM[km]

    const sameKm = pmsPackages.find((pkg) => (
      Number(pkg.kilometer_interval) === km && Number(pkg.id) !== Number(excludePackageId || 0)
    ))
    const sameKmServices = extractPmsServiceNames(sameKm?.services)
    if (sameKmServices.length > 0) return sameKmServices

    return BASIC_PMS_CORE_INCLUSIONS
  }

  const loadPmsPackages = useCallback(async () => {
    if (!isAdmin) return
    setPmsLoading(true)
    try {
      const data = await apiGet('/pms', token)
      setPmsPackages(Array.isArray(data) ? data : [])
    } catch (e) {
      pushToast('error', e.message)
    } finally {
      setPmsLoading(false)
    }
  }, [isAdmin, token])

  useEffect(() => {
    if (activeTab === 'pms') {
      loadPmsPackages()
    }
  }, [activeTab, loadPmsPackages])

  const openCreatePmsModal = () => {
    setEditingPmsPackage(null)
    setPmsError('')
    setPmsNameManuallyEdited(false)
    setPmsForm({
      name: '',
      kilometerInterval: '',
      description: '',
      price: '',
      inclusionMode: 'auto',
      manualServicesText: '',
      status: 'Active',
    })
    setShowPmsModal(true)
  }

  const openEditPmsModal = (pkg) => {
    const existingServices = extractPmsServiceNames(pkg?.services)
    const autoServices = getAutoPmsInclusions(pkg?.kilometer_interval, pkg?.id)
    const isAuto = existingServices.length > 0 && areSameServiceLists(existingServices, autoServices)

    setEditingPmsPackage(pkg)
    setPmsError('')
    setPmsNameManuallyEdited(true)
    setPmsForm({
      name: pkg.name || '',
      kilometerInterval: pkg.kilometer_interval == null ? '' : String(pkg.kilometer_interval),
      description: pkg.description || '',
      price: pkg.estimated_price == null ? '' : String(pkg.estimated_price),
      inclusionMode: isAuto ? 'auto' : 'manual',
      manualServicesText: existingServices.join('\n'),
      status: String(pkg.status || 'Active') === 'Inactive' ? 'Inactive' : 'Active',
    })
    setShowPmsModal(true)
  }

  const savePmsPackage = async () => {
    const cleanName = pmsForm.name.trim()
    const km = Number(pmsForm.kilometerInterval)
    if (!cleanName || !Number.isFinite(km) || km <= 0) {
      setPmsError('Package Name and Kilometer Interval are required.')
      return
    }

    const duplicate = pmsPackages.some((pkg) => Number(pkg.kilometer_interval) === km && Number(pkg.id) !== Number(editingPmsPackage?.id || 0))
    if (duplicate) {
      setPmsError('A PMS package with this kilometer interval already exists.')
      return
    }

    const parsedPrice = Number(pmsForm.price)
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      setPmsError('Price is required and must be a valid non-negative number.')
      return
    }

    setPmsSaving(true)
    setPmsError('')
    try {
      const autoServices = getAutoPmsInclusions(km, editingPmsPackage?.id)
      const manualServices = parseManualServices(pmsForm.manualServicesText)
      const selectedServices = pmsForm.inclusionMode === 'manual' ? manualServices : autoServices

      if (!selectedServices.length) {
        setPmsError('Included Services is required. Please add at least one service.')
        setPmsSaving(false)
        return
      }

      const payload = {
        name: cleanName,
        kilometer_interval: km,
        description: pmsForm.description.trim(),
        services: selectedServices.map((name) => ({ id: null, name })),
        estimated_price: parsedPrice,
        status: pmsForm.status,
      }

      if (editingPmsPackage?.id) {
        await apiPut(`/pms/${editingPmsPackage.id}`, token, payload)
        pushToast('success', 'PMS Package Updated')
        emitPackagesUpdated({ scope: 'pms', action: 'update', id: editingPmsPackage.id })
      } else {
        await apiPost('/pms', token, payload)
        pushToast('success', 'PMS Package Created')
        emitPackagesUpdated({ scope: 'pms', action: 'create' })
      }

      setShowPmsModal(false)
      await loadPmsPackages()
    } catch (e) {
      setPmsError(e.message || 'Failed to save PMS package')
    } finally {
      setPmsSaving(false)
    }
  }

  const deletePmsPackage = async () => {
    if (!deletingPmsPackage?.id) return
    setPmsDeleting(true)
    try {
      await apiDelete(`/pms/${deletingPmsPackage.id}`, token)
      pushToast('success', 'PMS Package Deleted')
      emitPackagesUpdated({ scope: 'pms', action: 'delete', id: deletingPmsPackage.id })
      setShowPmsDeleteModal(false)
      setDeletingPmsPackage(null)
      await loadPmsPackages()
    } catch (e) {
      pushToast('error', e.message || 'Failed to delete PMS package')
    } finally {
      setPmsDeleting(false)
    }
  }

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
        if (parsed && typeof parsed === 'object') setQuotPrices(sanitizeServiceCodeMap(parsed))
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
        if (Array.isArray(parsed)) setQuotCustomServices(sanitizeCustomServices(parsed))
      } catch {}
    }
    const nameEntry = entries.find((e) => e.key === 'service_name_overrides')
    if (nameEntry?.value) {
      try {
        const parsed = typeof nameEntry.value === 'string' ? JSON.parse(nameEntry.value) : nameEntry.value
        if (parsed && typeof parsed === 'object') setQuotServiceNames(sanitizeServiceCodeMap(parsed))
      } catch {}
    }
    const deletedEntry = entries.find((e) => e.key === 'deleted_service_codes')
    if (deletedEntry?.value) {
      try {
        const parsed = typeof deletedEntry.value === 'string' ? JSON.parse(deletedEntry.value) : deletedEntry.value
        setQuotDeletedServiceCodes(sanitizeDeletedServiceCodes(parsed))
      } catch {}
    } else {
      setQuotDeletedServiceCodes(Array.from(REMOVED_SERVICE_CODES))
    }
  }, [config.quotations])

  async function handleSaveQuotationPrices() {
    setQuotPricesSaving(true)
    try {
      const cleanedPrices = sanitizeServiceCodeMap(quotPrices)
      const cleanedNames = sanitizeServiceCodeMap(quotServiceNames)
      const cleanedCustom = sanitizeCustomServices(quotCustomServices)
      const cleanedDeleted = sanitizeDeletedServiceCodes(quotDeletedServiceCodes)

      await apiPut('/config/quotations/service_prices', token, { value: JSON.stringify(cleanedPrices) })
      if (quotServiceNamesDirty) {
        await apiPut('/config/quotations/service_name_overrides', token, { value: JSON.stringify(cleanedNames) })
        setQuotServiceNamesDirty(false)
      }
      if (quotCustomSvcDirty) {
        await apiPut('/config/quotations/custom_services', token, { value: JSON.stringify(cleanedCustom) })
        setQuotCustomSvcDirty(false)
      }
      if (quotDeletedSvcDirty) {
        await apiPut('/config/quotations/deleted_service_codes', token, { value: JSON.stringify(cleanedDeleted) })
        setQuotDeletedSvcDirty(false)
      }
      pushToast('success', 'Service pricing saved')
      setQuotPricesDirty(false)
      emitConfigUpdated({ source: 'settings', category: 'quotations', key: 'service_prices' })
      if (quotServiceNamesDirty) emitConfigUpdated({ source: 'settings', category: 'quotations', key: 'service_name_overrides' })
      if (quotCustomSvcDirty) emitConfigUpdated({ source: 'settings', category: 'quotations', key: 'custom_services' })
      if (quotDeletedSvcDirty) emitConfigUpdated({ source: 'settings', category: 'quotations', key: 'deleted_service_codes' })
      await loadConfig()
    } catch (e) {
      pushToast('error', e.message)
    } finally {
      setQuotPricesSaving(false)
    }
  }

  const handleDeleteQuotationService = async (serviceCode, serviceName) => {
    if (!isSuperAdmin) return
    const code = String(serviceCode || '').trim().toLowerCase()
    if (!code) return

    const ok = window.confirm(`Delete service "${serviceName}"?\n\nThis will hide the row from Settings/Portal and remove related pricing/name overrides.`)
    if (!ok) return

    const nextDeleted = sanitizeDeletedServiceCodes([...quotDeletedServiceCodes, code])
    const nextPrices = sanitizeServiceCodeMap(
      Object.fromEntries(
        Object.entries(quotPrices || {}).filter(([k]) => String(k || '').trim().toLowerCase() !== code),
      ),
    )
    const nextNames = sanitizeServiceCodeMap(
      Object.fromEntries(
        Object.entries(quotServiceNames || {}).filter(([k]) => String(k || '').trim().toLowerCase() !== code),
      ),
    )
    const nextCustom = sanitizeCustomServices(
      (quotCustomServices || []).filter((s) => String(s?.code || '').trim().toLowerCase() !== code),
    )

    // Optimistic UI update
    setQuotDeletedServiceCodes(nextDeleted)
    setQuotPrices(nextPrices)
    setQuotServiceNames(nextNames)
    setQuotCustomServices(nextCustom)

    // Persist immediately so delete has visible effect right away.
    try {
      await apiPut('/config/quotations/deleted_service_codes', token, { value: JSON.stringify(nextDeleted) })
      await apiPut('/config/quotations/service_prices', token, { value: JSON.stringify(nextPrices) })
      await apiPut('/config/quotations/service_name_overrides', token, { value: JSON.stringify(nextNames) })
      await apiPut('/config/quotations/custom_services', token, { value: JSON.stringify(nextCustom) })

      emitConfigUpdated({ source: 'settings', category: 'quotations', key: 'deleted_service_codes' })
      emitConfigUpdated({ source: 'settings', category: 'quotations', key: 'service_prices' })
      emitConfigUpdated({ source: 'settings', category: 'quotations', key: 'service_name_overrides' })
      emitConfigUpdated({ source: 'settings', category: 'quotations', key: 'custom_services' })

      setQuotDeletedSvcDirty(false)
      setQuotPricesDirty(false)
      setQuotServiceNamesDirty(false)
      setQuotCustomSvcDirty(false)

      // Best-effort physical delete from services table for matching code.
      await apiDelete(`/services/by-code/${encodeURIComponent(code)}`, token)
      pushToast('success', `Service "${serviceName}" deleted.`)
      await loadConfig()
    } catch {
      pushToast('error', `Failed to delete "${serviceName}". Please try again.`)
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
      const cleanedCustom = sanitizeCustomServices(quotCustomServices)
      const activeCodes = new Set(cleanedCustom.map((s) => String(s.code || '').trim().toLowerCase()))
      const cleanedDeleted = sanitizeDeletedServiceCodes(quotDeletedServiceCodes)
        .filter((code) => !activeCodes.has(code))

      await apiPut('/config/quotations/custom_services', token, { value: JSON.stringify(cleanedCustom) })
      await apiPut('/config/quotations/deleted_service_codes', token, { value: JSON.stringify(cleanedDeleted) })

      setQuotCustomServices(cleanedCustom)
      setQuotDeletedServiceCodes(cleanedDeleted)
      pushToast('success', 'Custom services saved')
      setQuotCustomSvcDirty(false)
      setQuotDeletedSvcDirty(false)
      emitConfigUpdated({ source: 'settings', category: 'quotations', key: 'custom_services' })
      emitConfigUpdated({ source: 'settings', category: 'quotations', key: 'deleted_service_codes' })
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
      const schemaSections = FIELD_SCHEMA[category] || []
      const jsonFieldKeys = new Set(
        schemaSections.flatMap((sec) => (sec.fields || []).filter((f) => f.type === 'json').map((f) => f.key)),
      )
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
        let nextValue = value

        if (jsonFieldKeys.has(key)) {
          try {
            const parsed = String(value ?? '').trim() ? JSON.parse(String(value)) : {}
            nextValue = JSON.stringify(parsed, null, 2)
          } catch {
            pushToast('error', `Invalid JSON in ${key.replace(/_/g, ' ')}.`)
            return
          }
        }

        if (normalize(oldVal) !== normalize(nextValue)) {
          updates.push({ key, value: nextValue })
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
          const deletedCodeSet = new Set(sanitizeDeletedServiceCodes(quotDeletedServiceCodes))
          const isDeletedCode = (code) => deletedCodeSet.has(String(code || '').trim().toLowerCase())
          const visibleCatalog = SERVICE_CATALOG.filter((s) => !isDeletedCode(s.code))
          const visibleCustomServices = quotCustomServices.filter((s) => s.enabled !== false && !isDeletedCode(s.code))
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
          const groups = getCatalogGroups().filter((g) => visibleCatalog.some((s) => s.group === g))
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
                      setQuotDeletedServiceCodes((prev) => {
                        const next = sanitizeDeletedServiceCodes(prev).filter((c) => c !== code)
                        return next
                      })
                      setQuotNewSvcName('')
                      setQuotNewSvcGroup('')
                      setQuotCustomSvcDirty(true)
                      setQuotDeletedSvcDirty(true)
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
                    ...([...new Set(visibleCustomServices.map((s) => s.group))]
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
                  const services = visibleCatalog.filter((s) => s.group === group)
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
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
                                    {isSuperAdmin && (
                                      <button
                                        type="button"
                                        title="Delete service row"
                                        onClick={() => handleDeleteQuotationService(service.code, quotServiceNames[service.code] ?? service.name)}
                                        style={{
                                          flexShrink: 0,
                                          width: 26,
                                          height: 26,
                                          borderRadius: 6,
                                          border: '1px solid rgba(239,68,68,0.45)',
                                          background: 'rgba(239,68,68,0.10)',
                                          color: '#ef4444',
                                          fontSize: 14,
                                          fontWeight: 700,
                                          cursor: 'pointer',
                                        }}
                                      >×</button>
                                    )}
                                  </div>
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
                {visibleCustomServices.length > 0 && (() => {
                  const customGroups = [...new Set(visibleCustomServices.map((s) => s.group))]
                  return customGroups.filter((g) => quotPriceGroup === null || quotPriceGroup === g).map((grp) => {
                    const services = visibleCustomServices.filter((s) => s.group === grp)
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
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
                                      {isSuperAdmin && (
                                        <button
                                          type="button"
                                          title="Delete service row"
                                          onClick={() => handleDeleteQuotationService(service.code, service.name)}
                                          style={{
                                            flexShrink: 0,
                                            width: 26,
                                            height: 26,
                                            borderRadius: 6,
                                            border: '1px solid rgba(239,68,68,0.45)',
                                            background: 'rgba(239,68,68,0.10)',
                                            color: '#ef4444',
                                            fontSize: 14,
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                          }}
                                        >×</button>
                                      )}
                                    </div>
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

        {category === 'subscriptions' && (() => {
          const keyword = subsSearch.trim().toLowerCase()
          const filtered = subscriptionPackages.filter((pkg) => {
            const statusOk = subsStatusFilter === 'all'
              ? true
              : subsStatusFilter === 'active'
                ? String(pkg.status || 'Active') === 'Active'
                : String(pkg.status || 'Active') === 'Inactive'
            if (!statusOk) return false
            if (!keyword) return true
              return [pkg.name, pkg.description]
              .map((v) => String(v || '').toLowerCase())
              .some((v) => v.includes(keyword))
          })

          return (
            <div>
              <div style={{ padding: '16px 20px', background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: '#d0d8e8' }}>Subscription Packages</div>
                    <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>Manage subscription plans and service bundles</div>
                  </div>
                  <button type="button" className="btn-primary" onClick={openCreateSubscriptionModal}>+ Add Package</button>
                </div>

                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
                  <input
                    className="settings-input"
                    style={{ flex: '1 1 280px' }}
                    placeholder="Search package, description..."
                    value={subsSearch}
                    onChange={(e) => setSubsSearch(e.target.value)}
                  />
                  <select className="settings-input" style={{ width: 180 }} value={subsStatusFilter} onChange={(e) => setSubsStatusFilter(e.target.value)}>
                    <option value="all">All Status</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                        <th style={{ padding: '8px 10px', textAlign: 'left', color: '#94a3b8', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Package Name</th>
                        <th style={{ padding: '8px 10px', textAlign: 'left', color: '#94a3b8', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Weekly</th>
                        <th style={{ padding: '8px 10px', textAlign: 'left', color: '#94a3b8', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Monthly</th>
                        <th style={{ padding: '8px 10px', textAlign: 'left', color: '#94a3b8', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Annual</th>
                        <th style={{ padding: '8px 10px', textAlign: 'left', color: '#94a3b8', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Status</th>
                        <th style={{ padding: '8px 10px', textAlign: 'left', color: '#94a3b8', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {subsLoading ? (
                        <tr><td colSpan="7" style={{ padding: '16px 10px', color: '#64748b' }}>Loading packages…</td></tr>
                      ) : filtered.length === 0 ? (
                        <tr><td colSpan="7" style={{ padding: '16px 10px', color: '#64748b' }}>No packages found.</td></tr>
                      ) : filtered.map((pkg) => (
                        <tr key={pkg.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <td style={{ padding: '10px' }}>
                            <div style={{ fontWeight: 600, color: '#d0d8e8' }}>{pkg.name}</div>
                            {pkg.description ? <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{pkg.description}</div> : null}
                          </td>
                          <td style={{ padding: '10px', color: '#d0d8e8' }}>₱{Number(pkg?.price_by_frequency?.weekly ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td style={{ padding: '10px', color: '#d0d8e8' }}>₱{Number(pkg?.price_by_frequency?.monthly ?? pkg?.price ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td style={{ padding: '10px', color: '#d0d8e8' }}>₱{Number(pkg?.price_by_frequency?.annual ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td style={{ padding: '10px' }}>
                            <span style={{
                              display: 'inline-flex',
                              padding: '3px 9px',
                              borderRadius: 999,
                              fontSize: 11,
                              fontWeight: 700,
                              color: String(pkg.status || 'Active') === 'Active' ? '#9af0b8' : '#f5c58a',
                              border: `1px solid ${String(pkg.status || 'Active') === 'Active' ? 'rgba(16,185,129,0.35)' : 'rgba(245,158,11,0.35)'}`,
                              background: String(pkg.status || 'Active') === 'Active' ? 'rgba(16,185,129,0.14)' : 'rgba(245,158,11,0.14)',
                            }}>{String(pkg.status || 'Active') === 'Active' ? 'Active' : 'Inactive'}</span>
                          </td>
                          <td style={{ padding: '10px' }}>
                            <div style={{ display: 'flex', gap: 8 }}>
                              <button type="button" className="btn-secondary" style={{ minHeight: 32, padding: '6px 12px', borderRadius: 8 }} onClick={() => openEditSubscriptionModal(pkg)}>Edit</button>
                              <button
                                type="button"
                                className="btn-danger"
                                style={{ minHeight: 32, padding: '6px 12px', borderRadius: 8 }}
                                onClick={() => { setDeletingPackage(pkg); setShowSubsDeleteModal(true) }}
                              >Delete</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {showSubsModal ? (
                <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => !subsSaving && setShowSubsModal(false)}>
                  <div className="modal-content" style={{ width: 'min(860px, 100%)' }} onClick={(e) => e.stopPropagation()}>
                    <div className="modal-header">
                      <h2>{editingPackage ? 'Edit Package' : 'Add Package'}</h2>
                      <button type="button" className="btn-close" onClick={() => !subsSaving && setShowSubsModal(false)} aria-label="Close">×</button>
                    </div>
                    <div className="modal-body">
                      <div className="settings-fields-grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                        <div className="settings-field">
                          <label className="settings-label">Package Name</label>
                          <input className="settings-input" value={subsForm.name} onChange={(e) => setSubsForm((p) => ({ ...p, name: e.target.value }))} />
                        </div>
                        <div className="settings-field">
                          <label className="settings-label">Weekly Price</label>
                          <input className="settings-input" type="number" min="0" step="0.01" value={subsForm.priceWeekly} onChange={(e) => setSubsForm((p) => ({ ...p, priceWeekly: e.target.value }))} />
                        </div>
                        <div className="settings-field">
                          <label className="settings-label">Monthly Price</label>
                          <input className="settings-input" type="number" min="0" step="0.01" value={subsForm.priceMonthly} onChange={(e) => setSubsForm((p) => ({ ...p, priceMonthly: e.target.value }))} />
                        </div>
                        <div className="settings-field">
                          <label className="settings-label">Annual Price</label>
                          <input className="settings-input" type="number" min="0" step="0.01" value={subsForm.priceAnnual} onChange={(e) => setSubsForm((p) => ({ ...p, priceAnnual: e.target.value }))} />
                        </div>
                        <div className="settings-field settings-field--full">
                          <label className="settings-label">Description</label>
                          <textarea className="settings-input settings-input--textarea" rows="3" value={subsForm.description} onChange={(e) => setSubsForm((p) => ({ ...p, description: e.target.value }))} />
                        </div>
                        <div className="settings-field">
                          <label className="settings-label">Status</label>
                          <div className="settings-toggle-row">
                            <button
                              type="button"
                              className={`toggle-switch ${subsForm.status === 'Active' ? 'toggle-on' : 'toggle-off'}`}
                              onClick={() => setSubsForm((p) => ({ ...p, status: p.status === 'Active' ? 'Inactive' : 'Active' }))}
                            >
                              <span className="toggle-knob" />
                            </button>
                            <span className="toggle-label">{subsForm.status}</span>
                          </div>
                        </div>
                      </div>

                      {subsError ? <div className="form-error-banner" style={{ marginTop: 14 }}>{subsError}</div> : null}

                      <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                        <button type="button" className="btn-secondary" onClick={() => setShowSubsModal(false)} disabled={subsSaving}>Cancel</button>
                        <button type="button" className="btn-primary" onClick={saveSubscriptionPackage} disabled={subsSaving}>{subsSaving ? 'Saving…' : 'Save'}</button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {showSubsDeleteModal ? (
                <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => !subsDeleting && setShowSubsDeleteModal(false)}>
                  <div className="modal-content" style={{ width: 'min(500px, 100%)' }} onClick={(e) => e.stopPropagation()}>
                    <div className="modal-header">
                      <h2>Delete Subscription Package</h2>
                    </div>
                    <div className="modal-body">
                      <p style={{ marginTop: 0, color: '#94a3b8' }}>Are you sure you want to delete <strong>{deletingPackage?.name}</strong>?</p>
                      <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                        <button type="button" className="btn-secondary" onClick={() => setShowSubsDeleteModal(false)} disabled={subsDeleting}>Cancel</button>
                        <button type="button" className="btn-danger" onClick={deleteSubscriptionPackage} disabled={subsDeleting}>{subsDeleting ? 'Deleting…' : 'Delete'}</button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          )
        })()}

        {category === 'pms' && (() => {
          const keyword = pmsSearch.trim().toLowerCase()
          const sorted = [...pmsPackages].sort((a, b) => Number(a.kilometer_interval || 0) - Number(b.kilometer_interval || 0))
          const filtered = sorted.filter((pkg) => {
            const statusOk = pmsStatusFilter === 'all'
              ? true
              : pmsStatusFilter === 'active'
                ? String(pkg.status || 'Active') === 'Active'
                : String(pkg.status || 'Active') === 'Inactive'
            if (!statusOk) return false
            if (!keyword) return true
            return [pkg.name, pkg.description, String(pkg.kilometer_interval || '')]
              .map((v) => String(v || '').toLowerCase())
              .some((v) => v.includes(keyword))
          })

          const commonIntervals = new Set([5000, 10000, 20000])

          return (
            <div>
              <div style={{ padding: '16px 20px', background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: '#d0d8e8' }}>PMS Packages</div>
                    <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>Manage Preventive Maintenance Service schedules</div>
                  </div>
                  <button type="button" className="btn-primary" onClick={openCreatePmsModal}>+ Add PMS Package</button>
                </div>

                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
                  <input
                    className="settings-input"
                    style={{ flex: '1 1 280px' }}
                    placeholder="Search package, kilometer, description..."
                    value={pmsSearch}
                    onChange={(e) => setPmsSearch(e.target.value)}
                  />
                  <select className="settings-input" style={{ width: 180 }} value={pmsStatusFilter} onChange={(e) => setPmsStatusFilter(e.target.value)}>
                    <option value="all">All Status</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                        <th style={{ padding: '8px 10px', textAlign: 'left', color: '#94a3b8', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Package Name</th>
                        <th style={{ padding: '8px 10px', textAlign: 'left', color: '#94a3b8', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase' }}>KM Interval</th>
                        <th style={{ padding: '8px 10px', textAlign: 'left', color: '#94a3b8', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Description</th>
                        <th style={{ padding: '8px 10px', textAlign: 'left', color: '#94a3b8', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Price</th>
                        <th style={{ padding: '8px 10px', textAlign: 'left', color: '#94a3b8', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Status</th>
                        <th style={{ padding: '8px 10px', textAlign: 'left', color: '#94a3b8', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pmsLoading ? (
                        <tr><td colSpan="6" style={{ padding: '16px 10px', color: '#64748b' }}>Loading PMS packages...</td></tr>
                      ) : filtered.length === 0 ? (
                        <tr><td colSpan="6" style={{ padding: '16px 10px', color: '#64748b' }}>No PMS packages found.</td></tr>
                      ) : filtered.map((pkg) => {
                        const km = Number(pkg.kilometer_interval || 0)
                        const isCommon = commonIntervals.has(km)
                        const displayName = getPmsDisplayName(pkg.name, km)
                        return (
                          <tr key={pkg.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            <td style={{ padding: '10px' }}>
                              <div style={{ fontWeight: 600, color: '#d0d8e8' }}>{displayName}</div>
                            </td>
                            <td style={{ padding: '10px', color: '#d0d8e8' }}>
                              <span>{km.toLocaleString('en-US')}</span>
                              {isCommon ? (
                                <span style={{ marginLeft: 8, padding: '2px 8px', fontSize: 10, borderRadius: 999, color: '#93c5fd', border: '1px solid rgba(59,130,246,0.35)', background: 'rgba(59,130,246,0.14)' }}>Common</span>
                              ) : null}
                            </td>
                            <td style={{ padding: '10px', color: '#94a3b8' }}>{pkg.description || '—'}</td>
                            <td style={{ padding: '10px', color: '#d0d8e8' }}>
                              {pkg.estimated_price == null ? '—' : `₱${Number(pkg.estimated_price).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                            </td>
                            <td style={{ padding: '10px' }}>
                              <span style={{
                                display: 'inline-flex',
                                padding: '3px 9px',
                                borderRadius: 999,
                                fontSize: 11,
                                fontWeight: 700,
                                color: String(pkg.status || 'Active') === 'Active' ? '#9af0b8' : '#f5c58a',
                                border: `1px solid ${String(pkg.status || 'Active') === 'Active' ? 'rgba(16,185,129,0.35)' : 'rgba(245,158,11,0.35)'}`,
                                background: String(pkg.status || 'Active') === 'Active' ? 'rgba(16,185,129,0.14)' : 'rgba(245,158,11,0.14)',
                              }}>{String(pkg.status || 'Active') === 'Active' ? 'Active' : 'Inactive'}</span>
                            </td>
                            <td style={{ padding: '10px' }}>
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button type="button" className="btn-secondary" style={{ minHeight: 32, padding: '6px 12px', borderRadius: 8 }} onClick={() => openEditPmsModal(pkg)}>Edit</button>
                                <button
                                  type="button"
                                  className="btn-danger"
                                  style={{ minHeight: 32, padding: '6px 12px', borderRadius: 8 }}
                                  onClick={() => { setDeletingPmsPackage(pkg); setShowPmsDeleteModal(true) }}
                                >Delete</button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {showPmsModal ? (
                <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => !pmsSaving && setShowPmsModal(false)}>
                  <div className="modal-content" style={{ width: 'min(900px, 100%)' }} onClick={(e) => e.stopPropagation()}>
                    <div className="modal-header">
                      <h2>{editingPmsPackage ? 'Edit PMS Package' : 'Add PMS Package'}</h2>
                      <button type="button" className="btn-close" onClick={() => !pmsSaving && setShowPmsModal(false)} aria-label="Close">×</button>
                    </div>
                    <div className="modal-body">
                      {(() => {
                        const autoInclusions = getAutoPmsInclusions(pmsForm.kilometerInterval, editingPmsPackage?.id)
                        return (
                      <div className="settings-fields-grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                        <div className="settings-field">
                          <label className="settings-label">Package Name</label>
                          <input
                            className="settings-input"
                            value={pmsForm.name}
                            onChange={(e) => {
                              setPmsNameManuallyEdited(true)
                              setPmsForm((prev) => ({ ...prev, name: e.target.value }))
                            }}
                          />
                        </div>
                        <div className="settings-field">
                          <label className="settings-label">Kilometer Interval</label>
                          <input
                            className="settings-input"
                            type="number"
                            min="1"
                            step="1"
                            value={pmsForm.kilometerInterval}
                            onChange={(e) => {
                              const kmValue = e.target.value
                              setPmsForm((prev) => {
                                if (!pmsNameManuallyEdited) {
                                  return {
                                    ...prev,
                                    kilometerInterval: kmValue,
                                    name: formatPmsNameFromKm(kmValue) || prev.name,
                                  }
                                }
                                return { ...prev, kilometerInterval: kmValue }
                              })
                            }}
                          />
                        </div>
                        <div className="settings-field settings-field--full">
                          <label className="settings-label">Description</label>
                          <textarea className="settings-input settings-input--textarea" rows="3" value={pmsForm.description} onChange={(e) => setPmsForm((prev) => ({ ...prev, description: e.target.value }))} />
                        </div>
                        <div className="settings-field">
                          <label className="settings-label">Price</label>
                          <input className="settings-input" type="number" min="0" step="0.01" value={pmsForm.price} onChange={(e) => setPmsForm((prev) => ({ ...prev, price: e.target.value }))} />
                        </div>
                        <div className="settings-field">
                          <label className="settings-label">Status</label>
                          <div className="settings-toggle-row">
                            <button
                              type="button"
                              className={`toggle-switch ${pmsForm.status === 'Active' ? 'toggle-on' : 'toggle-off'}`}
                              onClick={() => setPmsForm((prev) => ({ ...prev, status: prev.status === 'Active' ? 'Inactive' : 'Active' }))}
                            >
                              <span className="toggle-knob" />
                            </button>
                            <span className="toggle-label">{pmsForm.status}</span>
                          </div>
                        </div>
                        <div className="settings-field settings-field--full">
                          <label className="settings-label">Included Services Mode</label>
                          <select
                            className="settings-input"
                            value={pmsForm.inclusionMode}
                            onChange={(e) => setPmsForm((prev) => ({ ...prev, inclusionMode: e.target.value }))}
                          >
                            <option value="auto">Auto by Kilometer Interval</option>
                            <option value="manual">Manual (Type Services)</option>
                          </select>
                        </div>
                        <div className="settings-field settings-field--full">
                          <label className="settings-label">
                            {pmsForm.inclusionMode === 'manual' ? 'Included Services (One per line)' : 'Included Services (Auto by Kilometer)'}
                          </label>
                          <div style={{ border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: 12, background: 'rgba(0,0,0,0.16)' }}>
                            {pmsForm.inclusionMode === 'manual' ? (
                              <textarea
                                className="settings-input settings-input--textarea"
                                rows="6"
                                placeholder={[
                                  'Engine oil replacement',
                                  'Brake inspection',
                                  'Tire rotation',
                                ].join('\n')}
                                value={pmsForm.manualServicesText}
                                onChange={(e) => setPmsForm((prev) => ({ ...prev, manualServicesText: e.target.value }))}
                              />
                            ) : (
                              <>
                                <div style={{ fontSize: 12, color: '#7a8aa0', marginBottom: 8 }}>
                                  {Number.isFinite(Number(pmsForm.kilometerInterval))
                                    ? `Using ${getPmsTierLabel(pmsForm.kilometerInterval)} template for ${Number(pmsForm.kilometerInterval).toLocaleString('en-US')} KM.`
                                    : 'Enter Kilometer Interval to preview matching auto inclusions.'}
                                </div>
                                <ul style={{ margin: 0, paddingLeft: 18, color: '#cbd5e1', display: 'grid', gap: 8 }}>
                                  {autoInclusions.map((item) => (
                                    <li key={item} style={{ fontSize: 13, lineHeight: 1.45 }}>{item}</li>
                                  ))}
                                </ul>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                        )
                      })()}

                      {pmsError ? <div className="form-error-banner" style={{ marginTop: 14 }}>{pmsError}</div> : null}

                      <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                        <button type="button" className="btn-secondary" onClick={() => setShowPmsModal(false)} disabled={pmsSaving}>Cancel</button>
                        <button type="button" className="btn-primary" onClick={savePmsPackage} disabled={pmsSaving}>{pmsSaving ? 'Saving…' : 'Save'}</button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {showPmsDeleteModal ? (
                <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => !pmsDeleting && setShowPmsDeleteModal(false)}>
                  <div className="modal-content" style={{ width: 'min(500px, 100%)' }} onClick={(e) => e.stopPropagation()}>
                    <div className="modal-header">
                      <h2>Delete PMS Package</h2>
                    </div>
                    <div className="modal-body">
                      <p style={{ marginTop: 0, color: '#94a3b8' }}>Are you sure you want to delete <strong>{deletingPmsPackage?.name}</strong>?</p>
                      <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                        <button type="button" className="btn-secondary" onClick={() => setShowPmsDeleteModal(false)} disabled={pmsDeleting}>Cancel</button>
                        <button type="button" className="btn-danger" onClick={deletePmsPackage} disabled={pmsDeleting}>{pmsDeleting ? 'Deleting…' : 'Delete'}</button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          )
        })()}

        {category !== 'email' && category !== 'quotations' && category !== 'services' && category !== 'subscriptions' && category !== 'pms' && renderSections(category)}

        {isAdmin && category !== 'email' && category !== 'quotations' && category !== 'subscriptions' && category !== 'pms' && (
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
    const formatAuditValue = (value) => {
      if (value === null || value === undefined || value === '') return '—'

      const raw = typeof value === 'string' ? value : JSON.stringify(value)
      try {
        const parsed = typeof value === 'string' ? JSON.parse(value) : value
        const normalized = JSON.stringify(parsed)
        return normalized.length > 120 ? `${normalized.slice(0, 120)}...` : normalized
      } catch {
        return raw.length > 120 ? `${raw.slice(0, 120)}...` : raw
      }
    }

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
                    <td className="log-value-old" title={formatAuditValue(log.old_value)}>{formatAuditValue(log.old_value)}</td>
                    <td className="log-value-new" title={formatAuditValue(log.new_value)}>{formatAuditValue(log.new_value)}</td>
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
