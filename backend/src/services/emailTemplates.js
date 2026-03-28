/**
 * emailTemplates.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Centralised HTML email template factory for MasterAuto automated notifications.
 * Each exported function returns { subject, html, text } ready for nodemailer.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Shared helpers ────────────────────────────────────────────────────────────

const BRAND_COLOR   = '#1a56db'
const BRAND_NAME    = 'MasterAuto'
const SUPPORT_EMAIL = 'masterautoofficial712@gmail.com'

function escapeHtml(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-PH', {
    year: 'numeric', month: 'long', day: 'numeric',
  })
}

function formatDateTime(d) {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-PH', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function formatCurrency(n) {
  return `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
}

function buildVehicleLabel({ make, model, year, color } = {}) {
  return [year, make, model, color ? `(${color})` : null].filter(Boolean).join(' ')
}

/** Shared outer shell — header + footer */
function wrapLayout(bodyHtml) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${BRAND_NAME} Notification</title>
  <style>
    body { margin:0; padding:0; background:#f3f4f6; font-family:'Segoe UI',Arial,sans-serif; color:#111827; }
    .page      { width:100%; padding:18px 10px 26px; }
    .card      { max-width:620px; margin:0 auto; background:#ffffff; border-radius:14px;
                 overflow:hidden; box-shadow:0 8px 24px rgba(15,23,42,0.08); border:1px solid rgba(15,23,42,0.06); }
    .card-pad  { padding:18px; }

    /* Blue title bar (matches screenshot) */
    .header    { background:${BRAND_COLOR}; padding:14px 16px; text-align:center; border-radius:12px; }
    .header-logo { display:block; margin:0 auto 8px; max-width:160px; width:52%; height:auto; }
    .header h1 { margin:0; color:#ffffff; font-size:22px; font-weight:800; letter-spacing:0.2px; }
    .header p  { margin:6px 0 0; color:rgba(255,255,255,0.82); font-size:13px; }

    .body      { padding:18px 6px 0; }
    .body p    { font-size:15px; line-height:1.7; margin:0 0 14px; color:#111827; }
    .body a    { color:${BRAND_COLOR}; text-decoration:none; font-weight:600; }

    /* Tables as soft sections */
    .info-table, .services-table { width:100%; border-collapse:separate; border-spacing:0; margin:16px 0 18px; font-size:14px; }
    .info-table thead th,
    .services-table thead th {
      background:#f1f5f9; color:#0f172a; text-align:left; padding:12px 14px;
      font-size:13px; font-weight:800; letter-spacing:0.2px; border-top:1px solid #e5e7eb;
      border-bottom:1px solid #e5e7eb;
    }
    .info-table thead th:first-child,
    .services-table thead th:first-child { border-top-left-radius:10px; }
    .info-table thead th:last-child,
    .services-table thead th:last-child { border-top-right-radius:10px; }

    .info-table td, .services-table td {
      padding:10px 14px; border-bottom:1px solid #e5e7eb; background:#ffffff; vertical-align:top;
    }
    .info-table tbody tr:last-child td,
    .services-table tbody tr:last-child td {
      border-bottom:1px solid #e5e7eb;
    }
    .info-table tbody tr:last-child td:first-child,
    .services-table tbody tr:last-child td:first-child { border-bottom-left-radius:10px; }
    .info-table tbody tr:last-child td:last-child,
    .services-table tbody tr:last-child td:last-child { border-bottom-right-radius:10px; }

    .services-table thead th { background:#f1f5f9; }
    .services-table td.price { text-align:right; white-space:nowrap; }
    .total-row td { background:#f8fafc; font-weight:800; color:#0f172a; }

    .badge { display:inline-block; padding:4px 10px; border-radius:999px; font-weight:800; font-size:12px; }
    .badge-green { background:#dcfce7; color:#166534; }
    .badge-blue  { background:#dbeafe; color:#1e40af; }

    .reminders { background:#f8fafc; border:1px solid #e5e7eb; border-radius:10px; padding:14px 16px; margin:18px 0 18px; font-size:14px; }
    .reminders ul { margin:8px 0 0; padding-left:18px; }
    .reminders li { margin-bottom:6px; line-height:1.5; }
    .divider { border:none; border-top:1px solid #e5e7eb; margin:18px 0; }

    .footer { padding:14px 6px 0; text-align:center; font-size:12px; color:#6b7280; }
    .footer a { color:${BRAND_COLOR}; text-decoration:none; }
  </style>
</head>
<body>
  <div class="page">
    <div class="card">
      <div class="card-pad">
        ${bodyHtml}

        <div class="footer">
          <div>Questions? Contact us at <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a></div>
          <div style="margin-top:6px;">© ${new Date().getFullYear()} <strong>${BRAND_NAME}</strong></div>
          <div style="margin-top:8px;color:#9ca3af;font-size:11px;">This is an automated email. Please do not reply directly.</div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`
}

// ── Template 1: Service Confirmation (Quotation → Approved) ──────────────────

/**
 * @param {object} params
 * @param {string}  params.customerName
 * @param {string}  params.quotationNo
 * @param {string}  params.plateNumber
 * @param {string}  params.make
 * @param {string}  params.model
 * @param {number|string} params.vehicleYear
 * @param {string}  params.color
 * @param {Array}   params.services        – array of { name, price }
 * @param {number}  params.totalAmount
 * @param {string}  [params.notes]
 * @returns {{ subject: string, html: string, text: string }}
 */
// ── Process block helper (Gmail-compatible, matches image style) ─────────────
function buildProcessBlock(title, steps) {
  const rows = steps.map((s, i) => `
    <tr style="border-bottom:${i < steps.length - 1 ? '1px solid #e2e8f0' : 'none'};">
      <td style="padding:10px 16px;font-size:14px;color:#1e293b;">
        <strong>${i + 1}.</strong> ${s.name}${s.note ? ` <em style="font-size:12px;color:#9ca3af;">(${s.note})</em>` : ''}
        ${s.warning ? `<br><span style="font-size:12px;color:#dc2626;font-weight:600;">${s.warning}</span>` : ''}
      </td>
      <td style="padding:10px 16px;font-size:13px;color:#6b7280;text-align:right;white-space:nowrap;">${s.timing}</td>
    </tr>
  `).join('')
  return `
    <div style="margin-top:20px;border-radius:8px;overflow:hidden;border:1px solid #dbeafe;">
      <div style="background:#eff6ff;padding:10px 16px;">
        <span style="font-size:12px;font-weight:700;color:#1e40af;letter-spacing:0.08em;text-transform:uppercase;">${title}</span>
      </div>
      <table style="width:100%;border-collapse:collapse;background:#ffffff;">
        ${rows}
      </table>
    </div>
  `
}

function buildServiceConfirmationEmail({
  customerName,
  quotationNo,
  plateNumber,
  make,
  model,
  vehicleYear,
  color,
  services = [],
  totalAmount,
  subtotal,
  vatAmount,
  notes,
  hasCoating = false,
  hasPpf = false,
  hasTint = false,
  hasExteriorDetail = false,
  hasInteriorDetail = false,
  // Optional config overrides from the quotation_email settings category
  configSubject,
  configGreeting,
  configReminders,  // newline-separated string → each line becomes a <li>
  configClosing,
}) {
  const vehicleLabel = buildVehicleLabel({ make, model, year: vehicleYear, color })

  // Config-overridable content (fall back to defaults when not set)
  const greetingText = configGreeting
    || 'Great news! Your service quotation has been APPROVED. Please review the details below and contact us to confirm your service schedule.'

  const defaultReminderLines = [
    `Please arrive on time on your scheduled service date.`,
    `Bring this confirmation reference number: <strong>${quotationNo}</strong>.`,
    `Final cost may vary depending on additional parts or discovered issues.`,
    `Estimated completion time will be confirmed upon check-in.`,
    `For rescheduling, please contact us at least 24 hours in advance.`,
  ]
  const reminderLines = configReminders
    ? configReminders.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => l.replace('{quotation_no}', quotationNo))
    : defaultReminderLines

  const closingText = configClosing || `Thank you for trusting <strong>${BRAND_NAME}</strong>!`

  const serviceRows = services.map((s) => `
    <tr>
      <td>${s.name || s.description || 'Service'}</td>
      <td class="price">${formatCurrency(s.unitPrice || s.total || s.price || s.amount || 0)}</td>
    </tr>
  `).join('')

  const html = wrapLayout(`
    <div class="header">
      <img class="header-logo" src="cid:masterauto_logo" alt="${BRAND_NAME}" />
      <h1>✅ Service Confirmation</h1>
      <p>Quotation ${quotationNo} has been approved</p>
    </div>
    <div class="body">
      <p>Dear <strong>${customerName || 'Valued Client'}</strong>,</p>
      <p>${greetingText}</p>

      <table class="info-table">
        <thead><tr><th colspan="2">Vehicle Information</th></tr></thead>
        <tbody>
          <tr><td><strong>Vehicle</strong></td>  <td>${vehicleLabel || '—'}</td></tr>
          ${plateNumber ? `<tr><td><strong>Plate No.</strong></td><td>${plateNumber}</td></tr>` : ''}
          <tr><td><strong>Reference No.</strong></td><td>${quotationNo}</td></tr>
        </tbody>
      </table>

      <table class="services-table">
        <thead>
          <tr>
            <th>Service / Description</th>
            <th style="text-align:right;">Price</th>
          </tr>
        </thead>
        <tbody>
          ${serviceRows || '<tr><td colspan="2">No services listed</td></tr>'}
          ${(vatAmount > 0) ? `
          <tr style="border-top:1px solid #e2e8f0;">
            <td style="color:#475569;">Subtotal</td>
            <td class="price" style="color:#475569;">${formatCurrency(subtotal)}</td>
          </tr>
          <tr>
            <td style="color:#475569;">VAT</td>
            <td class="price" style="color:#475569;">+ ${formatCurrency(vatAmount)}</td>
          </tr>` : ''}
          <tr class="total-row">
            <td><strong>TOTAL PRICE</strong></td>
            <td class="price"><strong>${formatCurrency(totalAmount)}</strong></td>
          </tr>
        </tbody>
      </table>

      ${hasCoating ? buildProcessBlock('Coating Service Process', [
        { name: 'Premium wash',                timing: '1st day' },
        { name: 'Decontamination',             timing: '1st day' },
        { name: 'Exterior detailing',          timing: '1st–2nd day', note: 'depends on car condition' },
        { name: 'Ceramic / Graphene coating',  timing: '1st day' },
        { name: 'Curing',                      timing: '2nd day' },
        { name: 'Release',                     timing: '2nd day afternoon' },
      ]) : ''}

      ${hasPpf ? buildProcessBlock('PPF Installation Process', [
        { name: 'Surface preparation & decontamination', timing: 'Day 1' },
        { name: 'Film cutting & templating',             timing: 'Day 2' },
        { name: 'PPF application begins',                timing: 'Day 3' },
        { name: 'Application continues',                 timing: 'Days 3–5' },
        { name: 'Film trimming & edge sealing',          timing: 'Day 5' },
        { name: 'Curing stage',                          timing: 'Day 6' },
        { name: 'Final inspection & release',            timing: 'Day 7' },
      ]) : ''}

      ${hasTint ? buildProcessBlock('Window Tint Process', [
        { name: 'Vehicle inspection & glass cleaning', timing: 'Day 1' },
        { name: 'Tint film application',               timing: 'Day 2' },
        { name: 'Curing stage',                        timing: 'Day 3', warning: '⚠ Do not roll down windows during curing' },
        { name: 'Final check & release',               timing: 'Day 3/4' },
      ]) : ''}

      ${hasExteriorDetail ? buildProcessBlock('Exterior Detail Process', [
        { name: 'Initial Vehicle Checking', timing: '1st day', note: 'damages, paint defects, etc. — if okay, proceed to Step 2' },
        { name: 'Decontamination',          timing: '1st day' },
        { name: 'Exterior Detailing',       timing: '1st–3rd day', note: 'days of work will vary on the car\'s condition' },
      ]) : ''}

      ${hasInteriorDetail ? buildProcessBlock('Interior Detail Process', [
        { name: 'Initial Vehicle Checking',    timing: '1st day', note: 'interior checking — dust, dirt, etc.' },
        { name: 'Chair & Matting Removal',     timing: '1st day' },
        { name: 'Vacuum & Vacmaster',          timing: '2nd day', note: 'deep vacuum of seats and carpets' },
        { name: 'Drying Stage & Reinstallation', timing: '3rd–4th day', note: 'reinstall all chairs and carpets, release car' },
      ]) : ''}

      ${notes ? `<p><strong>Notes:</strong> ${notes}</p>` : ''}

      <div class="reminders">
        <strong>⚠️ Important Reminders</strong>
        <ul>
          ${reminderLines.map((l) => `<li>${l}</li>`).join('\n          ')}
        </ul>
      </div>

      <hr class="divider" />
      <p style="font-size:14px;color:#475569;">
        If you have any questions about your service, feel free to reach us at
        <a href="mailto:${SUPPORT_EMAIL}" style="color:${BRAND_COLOR};">${SUPPORT_EMAIL}</a>.
      </p>
      <p>${closingText}</p>
      <p style="margin-top:20px;"><em>— The ${BRAND_NAME} Team</em></p>
    </div>
  `)

  const text = [
    `Dear ${customerName || 'Valued Client'},`,
    '',
    `Your service quotation (${quotationNo}) has been APPROVED.`,
    '',
    `Vehicle: ${vehicleLabel || '—'}`,
    plateNumber ? `Plate No.: ${plateNumber}` : null,
    '',
    'APPROVED SERVICES:',
    ...services.map((s) => `  - ${s.name || 'Service'}: ${formatCurrency(s.unitPrice || s.total || s.price || 0)}`),  
    '',
    `ESTIMATED TOTAL: ${formatCurrency(totalAmount)}`,
    ...(vatAmount > 0 ? [`  (Subtotal: ${formatCurrency(subtotal)} + VAT: ${formatCurrency(vatAmount)})`] : []),
    '',
    ...(hasCoating ? [
      'COATING SERVICE PROCESS:',
      '  1. Premium wash — 1st day',
      '  2. Decontamination — 1st day',
      '  3. Exterior detailing — 1st-2nd day (depends on car condition)',
      '  4. Ceramic / Graphene coating — 1st day',
      '  5. Curing — 2nd day',
      '  6. Release — 2nd day afternoon',
      '',
    ] : []),
    ...(hasPpf ? [
      'PPF INSTALLATION PROCESS:',
      '  1. Surface preparation & decontamination — Day 1',
      '  2. Film cutting & templating — Day 2',
      '  3. PPF application begins — Day 3',
      '  4. Application continues — Days 3-5',
      '  5. Film trimming & edge sealing — Day 5',
      '  6. Curing stage — Day 6',
      '  7. Final inspection & release — Day 7',
      '',
    ] : []),
    ...(hasTint ? [
      'WINDOW TINT PROCESS:',
      '  1. Vehicle inspection & glass cleaning — Day 1',
      '  2. Tint film application — Day 2',
      '  3. Curing stage — Day 3 (⚠ Do not roll down windows)',
      '  4. Final check & release — Day 3/4',
      '',
    ] : []),
    ...(hasExteriorDetail ? [
      'EXTERIOR DETAIL PROCESS:',
      '  1. Initial Vehicle Checking — 1st day (damages, paint defects, etc.)',
      '  2. Decontamination — 1st day',
      "  3. Exterior Detailing — 1st-3rd day (days of work will vary on the car's condition)",
      '',
    ] : []),
    ...(hasInteriorDetail ? [
      'INTERIOR DETAIL PROCESS:',
      '  1. Initial Vehicle Checking — 1st day (interior: dust, dirt, etc.)',
      '  2. Chair & Matting Removal — 1st day',
      '  3. Vacuum & Vacmaster (seats and carpets) — 2nd day',
      '  4. Drying Stage & Reinstallation / Release car — 3rd-4th day',
      '',
    ] : []),
    notes ? `Notes: ${notes}` : null,
    '',
    'IMPORTANT REMINDERS:',
    '  - Please arrive on time on your scheduled service date.',
    `  - Bring reference number: ${quotationNo}`,
    '  - Final cost may vary depending on additional parts.',
    '  - Contact us 24 hours in advance to reschedule.',
    '',
    `Questions? Contact us at ${SUPPORT_EMAIL}`,
    '',
    `— The ${BRAND_NAME} Team`,
  ].filter((l) => l !== null).join('\n')

  return {
    subject: configSubject
      ? configSubject.replace('{quotation_no}', quotationNo).replace('{plate_number}', plateNumber || '')
      : `Service Confirmed: ${quotationNo}${plateNumber ? ` — ${plateNumber}` : ''} | ${BRAND_NAME}`,
    html,
    text,
  }
}

// ── Template 2: Work Started (Job Order → In Progress) ───────────────────────

/**
 * @param {object} params
 * @param {string}  params.customerName
 * @param {string}  params.jobOrderNo
 * @param {string}  params.quotationNo
 * @param {string}  params.plateNumber
 * @param {string}  params.make
 * @param {string}  params.model
 * @param {number|string} params.vehicleYear
 * @param {string}  params.color
 * @param {Array}   params.services
 * @param {string|string[]} params.technicianNames
 * @param {Date|string}   params.startedAt
 * @param {Date|string}   [params.scheduleEnd]      – estimated completion from appointment
 * @param {string}  [params.scheduleBay]
 * @returns {{ subject: string, html: string, text: string }}
 */
function buildWorkStartedEmail({
  customerName,
  jobOrderNo,
  quotationNo,
  plateNumber,
  make,
  model,
  vehicleYear,
  color,
  services = [],
  technicianNames,
  startedAt,
  scheduleEnd,
  scheduleBay,
}) {
  const vehicleLabel = buildVehicleLabel({ make, model, year: vehicleYear, color })
  const techList     = Array.isArray(technicianNames)
    ? technicianNames.filter(Boolean).join(', ')
    : (technicianNames || 'Assigned Technician')

  const serviceRows = services.map((s) => `
    <tr><td>${s.name || s.description || 'Service'}</td></tr>
  `).join('')

  const html = wrapLayout(`
    <div class="header">
      <img class="header-logo" src="cid:masterauto_logo" alt="${BRAND_NAME}" />
      <h1>🔧 Work Has Started</h1>
      <p>Job Order ${jobOrderNo} is now In Progress</p>
    </div>
    <div class="body">
      <p>Dear <strong>${customerName || 'Valued Client'}</strong>,</p>
      <p>
        We are pleased to inform you that work on your vehicle has
        <span class="badge badge-blue">STARTED</span>.
        Our technicians are already on the job!
      </p>

      <table class="info-table">
        <thead><tr><th colspan="2">Job Order Details</th></tr></thead>
        <tbody>
          <tr><td><strong>Job Order No.</strong></td>    <td>${jobOrderNo}</td></tr>
          <tr><td><strong>Quotation Ref.</strong></td>   <td>${quotationNo || '—'}</td></tr>
          <tr><td><strong>Vehicle</strong></td>          <td>${vehicleLabel || '—'}</td></tr>
          ${plateNumber ? `<tr><td><strong>Plate No.</strong></td><td>${plateNumber}</td></tr>` : ''}
          <tr><td><strong>Assigned Technician(s)</strong></td><td>${techList}</td></tr>
          <tr><td><strong>Start Date &amp; Time</strong></td>  <td>${formatDateTime(startedAt)}</td></tr>
          ${scheduleEnd
            ? `<tr><td><strong>Est. Completion</strong></td><td>${formatDateTime(scheduleEnd)}</td></tr>`
            : ''}
          ${scheduleBay
            ? `<tr><td><strong>Service Bay</strong></td><td>${scheduleBay}</td></tr>`
            : ''}
        </tbody>
      </table>

      ${services.length > 0 ? `
      <table class="services-table">
        <thead><tr><th>Services Being Performed</th></tr></thead>
        <tbody>${serviceRows}</tbody>
      </table>` : ''}

      <div class="reminders">
        <strong>📋 What happens next?</strong>
        <ul>
          <li>Our technicians will keep you updated on the progress.</li>
          <li>You will receive a notification once the service is <strong>completed</strong>.</li>
          <li>Please ensure your contact details are up to date for follow-ups.</li>
          <li>For urgent inquiries, please contact us with Job Order <strong>${jobOrderNo}</strong>.</li>
        </ul>
      </div>

      <hr class="divider" />
      <p style="font-size:14px;color:#475569;">
        Track your service progress or contact us at
        <a href="mailto:${SUPPORT_EMAIL}" style="color:${BRAND_COLOR};">${SUPPORT_EMAIL}</a>.
      </p>
      <p>Thank you for your patience and for choosing <strong>${BRAND_NAME}</strong>!</p>
      <p style="margin-top:20px;"><em>— The ${BRAND_NAME} Team</em></p>
    </div>
  `)

  const text = [
    `Dear ${customerName || 'Valued Client'},`,
    '',
    `Work on your vehicle has started! Job Order: ${jobOrderNo}`,
    '',
    `Vehicle:              ${vehicleLabel || '—'}`,
    plateNumber ? `Plate No.:            ${plateNumber}` : null,
    `Assigned Technician:  ${techList}`,
    `Start Date & Time:    ${formatDateTime(startedAt)}`,
    scheduleEnd ? `Est. Completion:      ${formatDateTime(scheduleEnd)}` : null,
    scheduleBay ? `Service Bay:          ${scheduleBay}` : null,
    '',
    services.length > 0 ? 'SERVICES BEING PERFORMED:' : null,
    ...services.map((s) => `  - ${s.name || 'Service'}`),
    '',
    'WHAT HAPPENS NEXT:',
    '  - You will be notified when the service is completed.',
    `  - For inquiries, reference Job Order: ${jobOrderNo}`,
    '',
    `Contact us: ${SUPPORT_EMAIL}`,
    '',
    `— The ${BRAND_NAME} Team`,
  ].filter((l) => l !== null).join('\n')

  return {
    subject: `Work Started: ${jobOrderNo}${plateNumber ? ` — ${plateNumber}` : ''} | ${BRAND_NAME}`,
    html,
    text,
  }
}

// ── Template 3: Technician Assigned (Pending job, installers saved) ────────────────

function buildTechnicianAssignedEmail({
  customerName, jobOrderNo, quotationNo, plateNumber, make, model, vehicleYear,
  color, services = [], technicianNames, scheduleStart, scheduleEnd, scheduleBay,
}) {
  const vehicleLabel = buildVehicleLabel({ make, model, year: vehicleYear, color })
  const techList = Array.isArray(technicianNames)
    ? technicianNames.filter(Boolean).join(', ') : (technicianNames || 'Assigned Technician')
  const serviceRows = services.map((s) => `<tr><td>${s.name || 'Service'}</td></tr>`).join('')
  const html = wrapLayout(`
    <div class="header">
      <img class="header-logo" src="cid:masterauto_logo" alt="${BRAND_NAME}" />
      <h1>👨‍🔧 Technician(s) Assigned</h1>
      <p>Job Order ${jobOrderNo} is ready to begin</p>
    </div>
    <div class="body">
      <p>Dear <strong>${customerName || 'Valued Client'}</strong>,</p>
      <p>Your technician team has been <span class="badge badge-blue">ASSIGNED</span> and your service is ready to begin!</p>
      <table class="info-table">
        <thead><tr><th colspan="2">Assignment Details</th></tr></thead>
        <tbody>
          <tr><td><strong>Job Order No.</strong></td><td>${jobOrderNo}</td></tr>
          <tr><td><strong>Quotation Ref.</strong></td><td>${quotationNo || '—'}</td></tr>
          <tr><td><strong>Vehicle</strong></td><td>${vehicleLabel || '—'}</td></tr>
          ${plateNumber ? `<tr><td><strong>Plate No.</strong></td><td>${plateNumber}</td></tr>` : ''}
          <tr><td><strong>Assigned Technician(s)</strong></td><td><strong>${techList}</strong></td></tr>
          ${scheduleStart ? `<tr><td><strong>Scheduled Start</strong></td><td>${formatDateTime(scheduleStart)}</td></tr>` : ''}
          ${scheduleEnd ? `<tr><td><strong>Est. Completion</strong></td><td>${formatDateTime(scheduleEnd)}</td></tr>` : ''}
          ${scheduleBay ? `<tr><td><strong>Service Bay</strong></td><td>${scheduleBay}</td></tr>` : ''}
        </tbody>
      </table>
      ${services.length > 0 ? `<table class="services-table"><thead><tr><th>Scheduled Services</th></tr></thead><tbody>${serviceRows}</tbody></table>` : ''}
      <div class="reminders"><strong>📌 What to expect</strong><ul>
        <li>Your dedicated technician team is ready and prepared.</li>
        <li>Please arrive at or before your scheduled time.</li>
        <li>You will receive another notification once work has <strong>officially started</strong>.</li>
        <li>For inquiries, reference Job Order <strong>${jobOrderNo}</strong>.</li>
      </ul></div>
      <hr class="divider" />
      <p style="font-size:14px;color:#475569;">Questions? <a href="mailto:${SUPPORT_EMAIL}" style="color:${BRAND_COLOR};">${SUPPORT_EMAIL}</a></p>
      <p>Thank you for choosing <strong>${BRAND_NAME}</strong>!</p>
      <p style="margin-top:20px;"><em>— The ${BRAND_NAME} Team</em></p>
    </div>`)
  const text = [
    `Dear ${customerName || 'Valued Client'},`,
    `Your technician team has been assigned. Job Order: ${jobOrderNo}`,
    `Vehicle: ${vehicleLabel || '—'}`, plateNumber ? `Plate No.: ${plateNumber}` : null,
    `Technician: ${techList}`,
    scheduleStart ? `Start: ${formatDateTime(scheduleStart)}` : null,
    scheduleEnd ? `Est. Completion: ${formatDateTime(scheduleEnd)}` : null,
    `Contact: ${SUPPORT_EMAIL}`, `— The ${BRAND_NAME} Team`,
  ].filter(Boolean).join('\n')
  return { subject: `Technician Assigned: ${jobOrderNo}${plateNumber ? ` — ${plateNumber}` : ''} | ${BRAND_NAME}`, html, text }
}

// ── Template 4: Job Completed (Job Order → Completed) ────────────────────────────

function buildJobCompletedEmail({
  customerName, jobOrderNo, quotationNo, plateNumber, make, model, vehicleYear,
  color, services = [], totalAmount, subtotal, vatAmount, technicianNames, completedAt, customerMobile,
}) {
  const vehicleLabel = buildVehicleLabel({ make, model, year: vehicleYear, color })
  const techList = Array.isArray(technicianNames)
    ? technicianNames.filter(Boolean).join(', ') : (technicianNames || 'Our Service Team')
  const serviceRows = services.map((s) => `
    <tr>
      <td>${s.name || 'Service'}</td>
      <td style="text-align:center">${s.qty || 1}</td>
      <td class="price">${formatCurrency(s.unitPrice || 0)}</td>
      <td class="price"><strong>${formatCurrency(s.total || s.price || 0)}</strong></td>
    </tr>`).join('')
  const html = wrapLayout(`
    <div class="header">
      <img class="header-logo" src="cid:masterauto_logo" alt="${BRAND_NAME}" />
      <h1>✅ Service Completed!</h1>
      <p>Job Order ${jobOrderNo} — All services have been performed</p>
    </div>
    <div class="body">
      <p>Dear <strong>${customerName || 'Valued Client'}</strong>,</p>
      <p>All services on your vehicle are <span class="badge badge-green">COMPLETED</span> and it is now ready for pick-up!</p>
      <table class="info-table">
        <thead><tr><th colspan="2">Job Details</th></tr></thead>
        <tbody>
          <tr><td><strong>Job Order No.</strong></td><td>${jobOrderNo}</td></tr>
          <tr><td><strong>Quotation Ref.</strong></td><td>${quotationNo || '—'}</td></tr>
          <tr><td><strong>Vehicle</strong></td><td>${vehicleLabel || '—'}</td></tr>
          ${plateNumber ? `<tr><td><strong>Plate No.</strong></td><td>${plateNumber}</td></tr>` : ''}
          <tr><td><strong>Completed By</strong></td><td>${techList}</td></tr>
          <tr><td><strong>Completed On</strong></td><td><strong>${formatDateTime(completedAt)}</strong></td></tr>
          ${customerMobile ? `<tr><td><strong>Your Contact</strong></td><td>${customerMobile}</td></tr>` : ''}
        </tbody>
      </table>
      ${services.length > 0 ? `
      <table class="services-table">
        <thead><tr><th>Service Performed</th><th style="text-align:center">Qty</th><th style="text-align:right">Unit Price</th><th style="text-align:right">Total</th></tr></thead>
        <tbody>
          ${serviceRows}
          ${(Number(vatAmount) > 0) ? `
          <tr style="border-top:1px solid #e2e8f0;">
            <td colspan="3" style="color:#475569;">Subtotal</td>
            <td class="price" style="color:#475569;">${formatCurrency(subtotal)}</td>
          </tr>
          <tr>
            <td colspan="3" style="color:#475569;">VAT</td>
            <td class="price" style="color:#475569;">+ ${formatCurrency(vatAmount)}</td>
          </tr>` : ''}
          <tr class="total-row"><td colspan="3"><strong>GRAND TOTAL</strong></td><td class="price"><strong>${formatCurrency(totalAmount)}</strong></td></tr>
        </tbody>
      </table>` : ''}
      <div class="reminders"><strong>🚗 Ready for Pick-up</strong><ul>
        <li>Your vehicle is ready. Please come to our shop to pick it up.</li>
        <li>Bring reference number <strong>${jobOrderNo}</strong> when you arrive.</li>
        <li>Please settle any remaining balance upon pick-up.</li>
        <li>A warranty card will be issued for applicable services.</li>
      </ul></div>
      <hr class="divider" />
      <p style="font-size:14px;color:#475569;">Questions? <a href="mailto:${SUPPORT_EMAIL}" style="color:${BRAND_COLOR};">${SUPPORT_EMAIL}</a></p>
      <p>Thank you for trusting <strong>${BRAND_NAME}</strong>! Drive safe. 😊</p>
      <p style="margin-top:20px;"><em>— The ${BRAND_NAME} Team</em></p>
    </div>`)
  const text = [
    `Dear ${customerName || 'Valued Client'},`,
    `All services are COMPLETED. Job Order: ${jobOrderNo}`,
    `Vehicle: ${vehicleLabel || '—'}`, plateNumber ? `Plate No.: ${plateNumber}` : null,
    `Completed By: ${techList}`, `Completed On: ${formatDateTime(completedAt)}`,
    services.length > 0 ? 'SERVICES PERFORMED:' : null,
    ...services.map((s) => `  - ${s.name || 'Service'} x${s.qty || 1}: ${formatCurrency(s.total || 0)}`),
    (Number(vatAmount) > 0) ? `SUBTOTAL: ${formatCurrency(subtotal)}` : null,
    (Number(vatAmount) > 0) ? `VAT: +${formatCurrency(vatAmount)}` : null,
    totalAmount ? `TOTAL: ${formatCurrency(totalAmount)}` : null,
    'Your vehicle is ready for pick-up. Please settle any remaining balance.',
    `Contact: ${SUPPORT_EMAIL}`, `— The ${BRAND_NAME} Team`,
  ].filter(Boolean).join('\n')
  return { subject: `Service Completed ✅: ${jobOrderNo}${plateNumber ? ` — ${plateNumber}` : ''} | ${BRAND_NAME}`, html, text }
}

// ── Job Released Email ──────────────────────────────────────────────────────

/**
 * Sent when a Job Order transitions to → Released.
 * Confirms vehicle handover + payment received.
 */
function buildJobReleasedEmail({
  customerName,
  jobOrderNo,
  quotationNo,
  plateNumber,
  make,
  model,
  vehicleYear,
  color,
  services = [],
  totalAmount = 0,
  subtotal,
  vatAmount,
  technicianNames = [],
  releasedAt,
}) {
  const vehicleLabel = buildVehicleLabel({ make, model, year: vehicleYear, color })
  const techList     = technicianNames.length > 0 ? technicianNames.join(', ') : 'Our Team'
  const serviceRows  = services.map((s) => `
    <tr>
      <td>${s.name || 'Service'}</td>
      <td style="text-align:center">${s.qty || 1}</td>
      <td class="price">${formatCurrency(s.unitPrice || 0)}</td>
      <td class="price"><strong>${formatCurrency(s.total || s.price || 0)}</strong></td>
    </tr>`).join('')
  const html = wrapLayout(`
    <div class="header">
      <img class="header-logo" src="cid:masterauto_logo" alt="${BRAND_NAME}" />
      <h1>🚗 Vehicle Released!</h1>
      <p>Job Order ${jobOrderNo} — Your vehicle has been officially handed over</p>
    </div>
    <div class="body">
      <p>Dear <strong>${customerName || 'Valued Client'}</strong>,</p>
      <p>Great news! Your vehicle has been <span class="badge badge-green">RELEASED</span>. All services have been completed, payment has been confirmed, and your vehicle is now in your hands.</p>
      <table class="info-table">
        <thead><tr><th colspan="2">Release Details</th></tr></thead>
        <tbody>
          <tr><td><strong>Job Order No.</strong></td><td>${jobOrderNo}</td></tr>
          <tr><td><strong>Quotation Ref.</strong></td><td>${quotationNo || '—'}</td></tr>
          <tr><td><strong>Vehicle</strong></td><td>${vehicleLabel || '—'}</td></tr>
          ${plateNumber ? `<tr><td><strong>Plate No.</strong></td><td>${plateNumber}</td></tr>` : ''}
          <tr><td><strong>Serviced By</strong></td><td>${techList}</td></tr>
          <tr><td><strong>Released On</strong></td><td><strong>${formatDateTime(releasedAt)}</strong></td></tr>
        </tbody>
      </table>
      ${services.length > 0 ? `
      <table class="services-table">
        <thead><tr><th>Service Performed</th><th style="text-align:center">Qty</th><th style="text-align:right">Unit Price</th><th style="text-align:right">Total</th></tr></thead>
        <tbody>
          ${serviceRows}
          ${(Number(vatAmount) > 0) ? `
          <tr style="border-top:1px solid #e2e8f0;">
            <td colspan="3" style="color:#475569;">Subtotal</td>
            <td class="price" style="color:#475569;">${formatCurrency(subtotal)}</td>
          </tr>
          <tr>
            <td colspan="3" style="color:#475569;">VAT</td>
            <td class="price" style="color:#475569;">+ ${formatCurrency(vatAmount)}</td>
          </tr>` : ''}
          <tr class="total-row"><td colspan="3"><strong>TOTAL AMOUNT PAID</strong></td><td class="price"><strong>${formatCurrency(totalAmount)}</strong></td></tr>
        </tbody>
      </table>` : ''}
      <div class="reminders"><strong>🎉 Thank You for Choosing ${BRAND_NAME}!</strong><ul>
        <li>Please keep your reference number <strong>${jobOrderNo}</strong> for any future warranty claims.</li>
        <li>If you experience any issues covered under our warranty, contact us immediately.</li>
        <li>We value your trust and look forward to serving you again!</li>
      </ul></div>
      <hr class="divider" />
      <p style="font-size:14px;color:#475569;">Questions? <a href="mailto:${SUPPORT_EMAIL}" style="color:${BRAND_COLOR};">${SUPPORT_EMAIL}</a></p>
      <p>Thank you for trusting <strong>${BRAND_NAME}</strong>! Drive safe. 😊</p>
      <p style="margin-top:20px;"><em>— The ${BRAND_NAME} Team</em></p>
    </div>`)
  const text = [
    `Dear ${customerName || 'Valued Client'},`,
    `Your vehicle has been RELEASED. Job Order: ${jobOrderNo}`,
    `Vehicle: ${vehicleLabel || '—'}`, plateNumber ? `Plate No.: ${plateNumber}` : null,
    `Serviced By: ${techList}`, `Released On: ${formatDateTime(releasedAt)}`,
    services.length > 0 ? 'SERVICES PERFORMED:' : null,
    ...services.map((s) => `  - ${s.name || 'Service'} x${s.qty || 1}: ${formatCurrency(s.total || 0)}`),
    (Number(vatAmount) > 0) ? `SUBTOTAL: ${formatCurrency(subtotal)}` : null,
    (Number(vatAmount) > 0) ? `VAT: +${formatCurrency(vatAmount)}` : null,
    totalAmount ? `TOTAL PAID: ${formatCurrency(totalAmount)}` : null,
    `Thank you for choosing ${BRAND_NAME}! Drive safe.`,
    `Contact: ${SUPPORT_EMAIL}`, `— The ${BRAND_NAME} Team`,
  ].filter(Boolean).join('\n')
  return {
    subject: `Vehicle Released 🚗: ${jobOrderNo}${plateNumber ? ` — ${plateNumber}` : ''} | ${BRAND_NAME}`,
    html,
    text,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Booking Cancellation Notification
// ─────────────────────────────────────────────────────────────────────────────
function buildCancellationEmail({
  customerName, plateNumber, make, model, year,
  referenceNo, scheduledAt, cancelledAt, cancelReason,
  paymentAction, amountPaid, refundNote,
} = {}) {
  const vehicleLabel = buildVehicleLabel({ make, model, year })

  const paymentRow = (() => {
    if (paymentAction === 'refund' && amountPaid) return `
      <tr><td><strong>Payment Status</strong></td><td><span class="badge" style="background:#fef2f2;color:#b91c1c;">REFUND PENDING</span></td></tr>
      <tr><td><strong>Refund Amount</strong></td><td>${formatCurrency(amountPaid)}</td></tr>`
    if (paymentAction === 'credit' && amountPaid) return `
      <tr><td><strong>Payment Status</strong></td><td><span class="badge badge-blue">CREDIT APPLIED</span></td></tr>
      <tr><td><strong>Credit Amount</strong></td><td>${formatCurrency(amountPaid)}</td></tr>`
    return ''
  })()

  const html = wrapLayout(`
    <div class="header">
      <img class="header-logo" src="cid:masterauto_logo" alt="${BRAND_NAME}" />
      <h1>❌ Booking Cancelled</h1>
      <p>Your appointment has been cancelled</p>
    </div>
    <div class="body">
      <p>Dear <strong>${customerName || 'Valued Customer'}</strong>,</p>
      <p>We regret to inform you that your booking has been
         <strong style="color:#dc2626;">cancelled</strong>. Below are the details:</p>
      <table class="info-table">
        <tbody>
          ${referenceNo   ? `<tr><td><strong>Reference No.</strong></td><td>${referenceNo}</td></tr>` : ''}
          ${vehicleLabel  ? `<tr><td><strong>Vehicle</strong></td><td>${vehicleLabel}</td></tr>` : ''}
          ${plateNumber   ? `<tr><td><strong>Plate No.</strong></td><td>${plateNumber}</td></tr>` : ''}
          ${scheduledAt   ? `<tr><td><strong>Scheduled For</strong></td><td>${formatDateTime(scheduledAt)}</td></tr>` : ''}
          <tr><td><strong>Cancelled On</strong></td><td>${formatDateTime(cancelledAt || new Date())}</td></tr>
          ${cancelReason  ? `<tr><td><strong>Reason</strong></td><td>${cancelReason}</td></tr>` : ''}
          ${paymentRow}
        </tbody>
      </table>
      ${refundNote ? `<div class="reminders"><strong>Note:</strong> ${refundNote}</div>` : ''}
      <p>If you have questions or would like to rebook, please contact us at
         <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>.</p>
      <p>We apologize for any inconvenience and look forward to serving you again.</p>
    </div>
  `)

  const text = [
    `Dear ${customerName || 'Valued Customer'},`,
    `Your booking has been cancelled.`,
    referenceNo  ? `Reference No.: ${referenceNo}`                 : null,
    vehicleLabel ? `Vehicle: ${vehicleLabel}`                       : null,
    plateNumber  ? `Plate No.: ${plateNumber}`                      : null,
    scheduledAt  ? `Scheduled For: ${formatDateTime(scheduledAt)}`  : null,
    `Cancelled On: ${formatDateTime(cancelledAt || new Date())}`,
    cancelReason ? `Reason: ${cancelReason}`                        : null,
    paymentAction === 'refund' && amountPaid
      ? `A refund of ${formatCurrency(amountPaid)} is pending manual processing.` : null,
    paymentAction === 'credit' && amountPaid
      ? `${formatCurrency(amountPaid)} has been applied as credit for a future booking.` : null,
    refundNote   ? `Note: ${refundNote}`                            : null,
    `For inquiries: ${SUPPORT_EMAIL}`,
    `— The ${BRAND_NAME} Team`,
  ].filter(Boolean).join('\n')

  return {
    subject: `Booking Cancelled${referenceNo ? ` — ${referenceNo}` : ''} | ${BRAND_NAME}`,
    html,
    text,
  }
}

// ── Portal Access Created (staff walk-in registration) ─────────────────────

function buildPortalAccessEmail({
  customerName,
  loginEmail,
  loginMobile,
  temporaryPassword,
  portalUrl,
}) {
  const safeName = customerName || 'Customer'
  const loginParts = []
  if (loginEmail) loginParts.push(`Email: ${loginEmail}`)
  if (loginMobile) loginParts.push(`Mobile: ${loginMobile}`)
  const loginText = loginParts.length
    ? loginParts.join(' | ')
    : 'Use your registered email or mobile number'

  const safePortalUrl = portalUrl ? String(portalUrl) : ''
  const portalHref = safePortalUrl ? escapeHtml(safePortalUrl) : ''
  const portalDisplay = portalHref

  const html = wrapLayout(`
    <div class="header">
      <img class="header-logo" src="cid:masterauto_logo" alt="${BRAND_NAME}" />
      <h1>Client Portal Access</h1>
      <p>Your portal login has been created.</p>
    </div>
    <div class="body">
      <p>Hi <strong>${safeName}</strong>,</p>
      <p>
        We created your <strong>${BRAND_NAME}</strong> Client Portal access so you can view your service updates and manage your account.
      </p>

      ${safePortalUrl ? `
        <div style="margin:18px 0 10px;">
          <a href="${portalHref}" style="display:block;background:${BRAND_COLOR};color:#ffffff;text-align:center;padding:12px 14px;border-radius:10px;font-weight:800;">
            Open Client Portal
          </a>
        </div>
        <div style="font-size:13px;color:#475569;line-height:1.5;margin:0 0 16px;">
          Portal link: <a href="${portalHref}" style="color:${BRAND_COLOR};font-weight:700;word-break:break-all;">${portalDisplay}</a>
        </div>
      ` : `
        <p style="margin: 18px 0;">Please open the <strong>${BRAND_NAME}</strong> Client Portal and log in.</p>
      `}

      <table class="info-table" style="margin-top:6px;">
        <thead>
          <tr><th colspan="2">Login Details</th></tr>
        </thead>
        <tbody>
          ${loginEmail ? `<tr><td><strong>Email</strong></td><td>${escapeHtml(loginEmail)}</td></tr>` : ''}
          ${loginMobile ? `<tr><td><strong>Mobile</strong></td><td>${escapeHtml(loginMobile)}</td></tr>` : ''}
          ${!loginEmail && !loginMobile ? `<tr><td><strong>Login</strong></td><td>${escapeHtml(loginText)}</td></tr>` : ''}
          <tr>
            <td><strong>Temporary Password</strong></td>
            <td>
              <span style="display:inline-block;padding:8px 10px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;font-size:15px;font-weight:800;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono','Courier New',monospace;letter-spacing:0.2px;">
                ${escapeHtml(temporaryPassword || '')}
              </span>
            </td>
          </tr>
        </tbody>
      </table>

      <p style="margin-top: 14px;">After you log in, please change your password in the portal for security.</p>

      <hr class="divider" />
      <p style="font-size:14px;color:#475569;">
        If you did not request this, please ignore this message or contact our staff.
      </p>
      <p style="margin-top:20px;"><em>— The ${BRAND_NAME} Team</em></p>
    </div>
  `)

  const textLines = [
    `${BRAND_NAME} Client Portal Access`,
    '',
    `Hi ${safeName},`,
    '',
    `We created your Client Portal access.`,
    portalUrl ? `Portal login: ${portalUrl}` : `Portal login: (open the ${BRAND_NAME} Client Portal)`,
    '',
    `Login: ${loginText}`,
    `Temporary Password: ${temporaryPassword || ''}`,
    '',
    `After you log in, please change your password in the portal.`,
  ]

  return {
    subject: `Your Client Portal Access | ${BRAND_NAME}`,
    html,
    text: textLines.join('\n'),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Booking Confirmation — sent right after a new booking/appointment is created
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {object} params
 * @param {string}  params.customerName
 * @param {string}  params.plateNumber
 * @param {string}  params.make
 * @param {string}  params.model
 * @param {string|number} params.vehicleYear
 * @param {string}  [params.color]
 * @param {string}  params.scheduleStart
 * @param {string}  [params.scheduleEnd]
 * @param {string}  [params.bay]
 * @param {string}  [params.installerTeam]
 * @param {string}  [params.serviceName]
 * @param {string}  [params.referenceNo]   – quotation or sale reference
 * @param {string}  [params.notes]
 * @returns {{ subject: string, html: string, text: string }}
 */
function buildBookingConfirmationEmail({
  customerName,
  plateNumber,
  make,
  model,
  vehicleYear,
  color,
  scheduleStart,
  scheduleEnd,
  bay,
  installerTeam,
  serviceName,
  referenceNo,
  notes,
  // Optional config overrides from the booking_email settings category
  configSubject,
  configGreeting,
  configReminders,  // newline-separated string → each line becomes a <li>
  configClosing,
} = {}) {
  const vehicleLabel = buildVehicleLabel({ make, model, year: vehicleYear, color })

  // Config-overridable content (fall back to defaults when not set)
  const greetingText = configGreeting
    || `Great news! Your booking with <strong>${BRAND_NAME}</strong> has been <span class="badge badge-green">CONFIRMED</span>. Please review the details below and make sure to arrive on time.`

  const defaultReminderLines = [
    'Please arrive on time (or a few minutes early) on your scheduled date.',
    'Bring a valid ID and this booking confirmation for reference.',
    referenceNo ? `Your reference number is <strong>${referenceNo}</strong> — keep it handy.` : null,
    'If you need to reschedule, please contact us at least <strong>24 hours in advance</strong>.',
    `For urgent inquiries, reach us at <a href="mailto:${SUPPORT_EMAIL}" style="color:${BRAND_COLOR}">${SUPPORT_EMAIL}</a>.`,
  ].filter(Boolean)

  const reminderLines = configReminders
    ? configReminders.split('\n').map((l) => l.trim()).filter(Boolean)
    : defaultReminderLines

  const closingText = configClosing || `We look forward to serving you. Thank you for choosing <strong>${BRAND_NAME}</strong>!`

  const html = wrapLayout(`
    <div class="header">
      <img class="header-logo" src="cid:masterauto_logo" alt="${BRAND_NAME}" />
      <h1>📅 Booking Confirmed!</h1>
      <p>Your appointment has been successfully scheduled</p>
    </div>
    <div class="body">
      <p>Dear <strong>${customerName || 'Valued Client'}</strong>,</p>
      <p>${greetingText}</p>

      <table class="info-table">
        <thead><tr><th colspan="2">Booking Details</th></tr></thead>
        <tbody>
          <tr><td><strong>Vehicle</strong></td><td>${vehicleLabel || '—'}</td></tr>
          ${plateNumber   ? `<tr><td><strong>Plate No.</strong></td><td>${plateNumber}</td></tr>` : ''}
          ${serviceName   ? `<tr><td><strong>Service</strong></td><td>${serviceName}</td></tr>` : ''}
          ${referenceNo   ? `<tr><td><strong>Reference No.</strong></td><td>${referenceNo}</td></tr>` : ''}
          <tr><td><strong>Scheduled Date &amp; Time</strong></td><td><strong>${formatDateTime(scheduleStart)}</strong></td></tr>
          ${scheduleEnd   ? `<tr><td><strong>Est. Completion</strong></td><td>${formatDateTime(scheduleEnd)}</td></tr>` : ''}
          ${bay           ? `<tr><td><strong>Service Bay</strong></td><td>${bay}</td></tr>` : ''}
          ${installerTeam ? `<tr><td><strong>Assigned Team</strong></td><td>${installerTeam}</td></tr>` : ''}
        </tbody>
      </table>

      ${notes ? `<p><strong>Notes:</strong> ${notes}</p>` : ''}

      <div class="reminders">
        <strong>⚠️ Important Reminders</strong>
        <ul>
          ${reminderLines.map((l) => `<li>${l}</li>`).join('\n          ')}
        </ul>
      </div>

      <hr class="divider" />
      <p>${closingText}</p>
      <p style="margin-top:20px;"><em>— The ${BRAND_NAME} Team</em></p>
    </div>
  `)

  const text = [
    `Dear ${customerName || 'Valued Client'},`,
    '',
    `Your booking with ${BRAND_NAME} has been CONFIRMED.`,
    '',
    `Vehicle:    ${vehicleLabel || '—'}`,
    plateNumber   ? `Plate No.:  ${plateNumber}`                          : null,
    serviceName   ? `Service:    ${serviceName}`                          : null,
    referenceNo   ? `Reference:  ${referenceNo}`                         : null,
    `Scheduled:  ${formatDateTime(scheduleStart)}`,
    scheduleEnd   ? `Est. Done:  ${formatDateTime(scheduleEnd)}`          : null,
    bay           ? `Bay:        ${bay}`                                  : null,
    installerTeam ? `Team:       ${installerTeam}`                        : null,
    notes         ? `Notes:      ${notes}`                               : null,
    '',
    'REMINDERS:',
    ...reminderLines.map((l) => `  - ${l.replace(/<[^>]+>/g, '')}`),
    '',
    `Contact: ${SUPPORT_EMAIL}`,
    '',
    `— The ${BRAND_NAME} Team`,
  ].filter((l) => l !== null).join('\n')

  return {
    subject: configSubject
      ? configSubject.replace('{plate_number}', plateNumber || '').replace('{reference_no}', referenceNo || '')
      : `Booking Confirmed${plateNumber ? ` — ${plateNumber}` : ''}${referenceNo ? ` (${referenceNo})` : ''} | ${BRAND_NAME}`,
    html,
    text,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Portal Booking Request Received — sent right after portal creates a quotation
// ─────────────────────────────────────────────────────────────────────────────

function buildPortalBookingRequestEmail({
  customerName,
  plateNumber,
  make,
  model,
  vehicleYear,
  color,
  preferredStart,
  preferredEnd,
  serviceName,
  referenceNo,
  notes,
} = {}) {
  const vehicleLabel = buildVehicleLabel({ make, model, year: vehicleYear, color })

  const html = wrapLayout(`
    <div class="header">
      <img class="header-logo" src="cid:masterauto_logo" alt="${BRAND_NAME}" />
      <h1>🧾 Quotation Request Received</h1>
      <p>We will review your request and confirm schedule after approval</p>
    </div>
    <div class="body">
      <p>Dear <strong>${customerName || 'Valued Client'}</strong>,</p>
      <p>
        Thank you! We received your booking request. This is a <strong>quotation request</strong>
        and is <strong>not yet confirmed</strong>. Our team will review it, then once approved we will
        schedule your appointment and send you a confirmation email.
      </p>

      <table class="info-table">
        <thead><tr><th colspan="2">Request Details</th></tr></thead>
        <tbody>
          <tr><td><strong>Vehicle</strong></td><td>${vehicleLabel || '—'}</td></tr>
          ${plateNumber ? `<tr><td><strong>Plate No.</strong></td><td>${plateNumber}</td></tr>` : ''}
          ${serviceName ? `<tr><td><strong>Requested Service</strong></td><td>${serviceName}</td></tr>` : ''}
          ${referenceNo ? `<tr><td><strong>Reference No.</strong></td><td>${referenceNo}</td></tr>` : ''}
          ${preferredStart ? `<tr><td><strong>Preferred Start</strong></td><td><strong>${formatDateTime(preferredStart)}</strong></td></tr>` : ''}
          ${preferredEnd ? `<tr><td><strong>Estimated End</strong></td><td>${formatDateTime(preferredEnd)}</td></tr>` : ''}
        </tbody>
      </table>

      ${notes ? `<p><strong>Notes:</strong> ${escapeHtml(notes)}</p>` : ''}

      <div class="reminders">
        <strong>⚠️ Next Steps</strong>
        <ul>
          <li>Wait for approval — we will review your request as soon as possible.</li>
          <li>Once approved, we will schedule your appointment and email you the confirmed schedule.</li>
          <li>For urgent inquiries, reach us at <a href="mailto:${SUPPORT_EMAIL}" style="color:${BRAND_COLOR}">${SUPPORT_EMAIL}</a>.</li>
        </ul>
      </div>

      <hr class="divider" />
      <p>Thank you for choosing <strong>${BRAND_NAME}</strong>!</p>
      <p style="margin-top:20px;"><em>— The ${BRAND_NAME} Team</em></p>
    </div>
  `)

  const text = [
    `Dear ${customerName || 'Valued Client'},`,
    '',
    `We received your booking request. This is a quotation request and is NOT yet confirmed.`,
    `Once approved, we will schedule your appointment and send you a confirmation email.`,
    '',
    `Vehicle: ${vehicleLabel || '—'}`,
    plateNumber ? `Plate No.: ${plateNumber}` : null,
    serviceName ? `Requested Service: ${serviceName}` : null,
    referenceNo ? `Reference No.: ${referenceNo}` : null,
    preferredStart ? `Preferred Start: ${formatDateTime(preferredStart)}` : null,
    preferredEnd ? `Estimated End: ${formatDateTime(preferredEnd)}` : null,
    notes ? `Notes: ${String(notes)}` : null,
    '',
    `For urgent inquiries: ${SUPPORT_EMAIL}`,
    '',
    `— The ${BRAND_NAME} Team`,
  ].filter(Boolean).join('\n')

  return {
    subject: `Quotation Request Received${plateNumber ? ` — ${plateNumber}` : ''}${referenceNo ? ` (${referenceNo})` : ''} | ${BRAND_NAME}`,
    html,
    text,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Portal Quotation Approved & Scheduled — sent when staff schedules the booking
// ─────────────────────────────────────────────────────────────────────────────

function buildQuotationApprovedScheduledEmail({
  customerName,
  plateNumber,
  make,
  model,
  vehicleYear,
  color,
  scheduleStart,
  scheduleEnd,
  bay,
  installerTeam,
  serviceName,
  referenceNo,
} = {}) {
  const vehicleLabel = buildVehicleLabel({ make, model, year: vehicleYear, color })

  const html = wrapLayout(`
    <div class="header">
      <img class="header-logo" src="cid:masterauto_logo" alt="${BRAND_NAME}" />
      <h1>✅ Approved &amp; Scheduled</h1>
      <p>Your quotation request has been approved</p>
    </div>
    <div class="body">
      <p>Dear <strong>${customerName || 'Valued Client'}</strong>,</p>
      <p>
        Good news — your quotation request has been <span class="badge badge-green">APPROVED</span>
        and your appointment is now <span class="badge badge-blue">SCHEDULED</span>.
      </p>

      <table class="info-table">
        <thead><tr><th colspan="2">Appointment Details</th></tr></thead>
        <tbody>
          <tr><td><strong>Vehicle</strong></td><td>${vehicleLabel || '—'}</td></tr>
          ${plateNumber ? `<tr><td><strong>Plate No.</strong></td><td>${plateNumber}</td></tr>` : ''}
          ${serviceName ? `<tr><td><strong>Service</strong></td><td>${serviceName}</td></tr>` : ''}
          ${referenceNo ? `<tr><td><strong>Reference No.</strong></td><td>${referenceNo}</td></tr>` : ''}
          <tr><td><strong>Scheduled Date &amp; Time</strong></td><td><strong>${formatDateTime(scheduleStart)}</strong></td></tr>
          ${scheduleEnd ? `<tr><td><strong>Est. Completion</strong></td><td>${formatDateTime(scheduleEnd)}</td></tr>` : ''}
          ${bay ? `<tr><td><strong>Service Bay</strong></td><td>${bay}</td></tr>` : ''}
          ${installerTeam ? `<tr><td><strong>Assigned Team</strong></td><td>${installerTeam}</td></tr>` : ''}
        </tbody>
      </table>

      <div class="reminders">
        <strong>⚠️ Important Reminders</strong>
        <ul>
          <li>Please arrive on time (or a few minutes early) on your scheduled date.</li>
          <li>If you need to reschedule, please contact us at least <strong>24 hours in advance</strong>.</li>
          <li>For urgent inquiries, reach us at <a href="mailto:${SUPPORT_EMAIL}" style="color:${BRAND_COLOR}">${SUPPORT_EMAIL}</a>.</li>
        </ul>
      </div>

      <hr class="divider" />
      <p>We look forward to serving you. Thank you for choosing <strong>${BRAND_NAME}</strong>!</p>
      <p style="margin-top:20px;"><em>— The ${BRAND_NAME} Team</em></p>
    </div>
  `)

  const text = [
    `Dear ${customerName || 'Valued Client'},`,
    '',
    `Good news — your quotation request has been APPROVED and your appointment is now SCHEDULED.`,
    '',
    `Vehicle: ${vehicleLabel || '—'}`,
    plateNumber ? `Plate No.: ${plateNumber}` : null,
    serviceName ? `Service: ${serviceName}` : null,
    referenceNo ? `Reference No.: ${referenceNo}` : null,
    `Scheduled: ${formatDateTime(scheduleStart)}`,
    scheduleEnd ? `Est. Done: ${formatDateTime(scheduleEnd)}` : null,
    bay ? `Bay: ${bay}` : null,
    installerTeam ? `Team: ${installerTeam}` : null,
    '',
    `Contact: ${SUPPORT_EMAIL}`,
    '',
    `— The ${BRAND_NAME} Team`,
  ].filter(Boolean).join('\n')

  return {
    subject: `Approved & Scheduled${plateNumber ? ` — ${plateNumber}` : ''}${referenceNo ? ` (${referenceNo})` : ''} | ${BRAND_NAME}`,
    html,
    text,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Quotation Request Received — sent from Guest Portal request-quotation
// ─────────────────────────────────────────────────────────────────────────────

function buildQuotationRequestReceivedEmail({
  customerName,
  quotationNo,
  branch,
  mobile,
  email,
  make,
  model,
  vehicleSize,
  serviceName,
  notes,
} = {}) {
  const safeCustomerName = escapeHtml(customerName || 'Valued Client')
  const safeQuotationNo = escapeHtml(quotationNo || '')
  const safeBranch = escapeHtml(branch || '')
  const safeMobile = escapeHtml(mobile || '')
  const safeEmail = escapeHtml(email || '')
  const safeSize = escapeHtml(vehicleSize || '')
  const safeServiceName = escapeHtml(serviceName || '')
  const safeNotes = escapeHtml(notes || '')

  const vehicleLabelRaw = [make, model].filter(Boolean).join(' ')
  const safeVehicleLabel = escapeHtml(vehicleLabelRaw || '—')

  const html = wrapLayout(`
    <div class="header">
      <img class="header-logo" src="cid:masterauto_logo" alt="${BRAND_NAME}" />
      <h1>📝 Quotation Request Received</h1>
      <p>We've received your request and it's now pending review</p>
    </div>
    <div class="body">
      <p>Dear <strong>${safeCustomerName}</strong>,</p>
      <p>
        Thank you for contacting <strong>${BRAND_NAME}</strong>. We've received your online quotation request.
        Our team will review your details and contact you shortly.
      </p>

      <table class="info-table">
        <thead><tr><th colspan="2">Request Details</th></tr></thead>
        <tbody>
          ${safeQuotationNo ? `<tr><td><strong>Reference No.</strong></td><td><strong>${safeQuotationNo}</strong></td></tr>` : ''}
          ${safeBranch ? `<tr><td><strong>Branch</strong></td><td>${safeBranch}</td></tr>` : ''}
          <tr><td><strong>Vehicle</strong></td><td>${safeVehicleLabel}</td></tr>
          ${safeSize ? `<tr><td><strong>Vehicle Size</strong></td><td>${safeSize}</td></tr>` : ''}
          ${safeServiceName ? `<tr><td><strong>Requested Service</strong></td><td>${safeServiceName}</td></tr>` : ''}
          ${safeMobile ? `<tr><td><strong>Mobile</strong></td><td>${safeMobile}</td></tr>` : ''}
          ${safeEmail ? `<tr><td><strong>Email</strong></td><td>${safeEmail}</td></tr>` : ''}
        </tbody>
      </table>

      ${safeNotes ? `<p><strong>Notes:</strong> ${safeNotes}</p>` : ''}

      <div class="reminders">
        <strong>⚠️ Important Reminders</strong>
        <ul>
          <li>Please keep your reference number <strong>${safeQuotationNo || '—'}</strong> for follow-ups.</li>
          <li>If you need to update your details, contact us at <a href="mailto:${SUPPORT_EMAIL}" style="color:${BRAND_COLOR}">${SUPPORT_EMAIL}</a>.</li>
          <li>Approval and scheduling will be confirmed by our staff after review.</li>
        </ul>
      </div>

      <hr class="divider" />
      <p>Thank you for choosing <strong>${BRAND_NAME}</strong>!</p>
      <p style="margin-top:20px;"><em>— The ${BRAND_NAME} Team</em></p>
    </div>
  `)

  const text = [
    `Dear ${customerName || 'Valued Client'},`,
    '',
    `We received your online quotation request.`,
    quotationNo ? `Reference: ${quotationNo}` : null,
    branch ? `Branch: ${branch}` : null,
    `Vehicle: ${vehicleLabelRaw || '—'}`,
    vehicleSize ? `Vehicle Size: ${vehicleSize}` : null,
    serviceName ? `Requested Service: ${serviceName}` : null,
    mobile ? `Mobile: ${mobile}` : null,
    email ? `Email: ${email}` : null,
    notes ? `Notes: ${notes}` : null,
    '',
    'Our team will review and contact you shortly.',
    `For updates, contact: ${SUPPORT_EMAIL}`,
    '',
    `— The ${BRAND_NAME} Team`,
  ].filter(Boolean).join('\n')

  return {
    subject: `Quotation Request Received: ${quotationNo || ''}${vehicleSize ? ` — Size: ${vehicleSize}` : ''} | ${BRAND_NAME}`.trim(),
    html,
    text,
  }
}

function buildQuotationRequestStaffEmail({
  quotationNo,
  branch,
  customerName,
  mobile,
  email,
  make,
  model,
  vehicleSize,
  serviceName,
  notes,
} = {}) {
  const safeQuotationNo = escapeHtml(quotationNo || '')
  const safeBranch = escapeHtml(branch || '')
  const safeCustomerName = escapeHtml(customerName || '')
  const safeMobile = escapeHtml(mobile || '')
  const safeEmail = escapeHtml(email || '')
  const safeSize = escapeHtml(vehicleSize || '')
  const safeServiceName = escapeHtml(serviceName || '')
  const safeNotes = escapeHtml(notes || '')

  const vehicleLabelRaw = [make, model].filter(Boolean).join(' ')
  const safeVehicleLabel = escapeHtml(vehicleLabelRaw || '—')

  const html = wrapLayout(`
    <div class="header">
      <img class="header-logo" src="cid:masterauto_logo" alt="${BRAND_NAME}" />
      <h1>📥 New Online Quotation Request</h1>
      <p>Guest Portal request submitted</p>
    </div>
    <div class="body">
      <p>A new online quotation request has been received.</p>

      <table class="info-table">
        <thead><tr><th colspan="2">Request Summary</th></tr></thead>
        <tbody>
          ${safeQuotationNo ? `<tr><td><strong>Quotation No.</strong></td><td><strong>${safeQuotationNo}</strong></td></tr>` : ''}
          ${safeBranch ? `<tr><td><strong>Branch</strong></td><td>${safeBranch}</td></tr>` : ''}
          ${safeCustomerName ? `<tr><td><strong>Customer</strong></td><td>${safeCustomerName}</td></tr>` : ''}
          ${safeMobile ? `<tr><td><strong>Mobile</strong></td><td>${safeMobile}</td></tr>` : ''}
          ${safeEmail ? `<tr><td><strong>Email</strong></td><td>${safeEmail}</td></tr>` : ''}
          <tr><td><strong>Vehicle</strong></td><td>${safeVehicleLabel}</td></tr>
          ${safeSize ? `<tr><td><strong>Vehicle Size</strong></td><td>${safeSize}</td></tr>` : ''}
          ${safeServiceName ? `<tr><td><strong>Requested Service</strong></td><td>${safeServiceName}</td></tr>` : ''}
        </tbody>
      </table>

      ${safeNotes ? `<p><strong>Notes:</strong> ${safeNotes}</p>` : ''}

      <div class="reminders">
        <strong>Next step</strong>
        <ul>
          <li>Open the Staff Dashboard → <strong>Quotations</strong> and review this request.</li>
          <li>Approve the quotation to proceed with booking and confirmation.</li>
        </ul>
      </div>

      <hr class="divider" />
      <p style="font-size:14px;color:#475569;">This message was generated automatically by ${BRAND_NAME}.</p>
    </div>
  `)

  const text = [
    'New online quotation request received.',
    quotationNo ? `Quotation: ${quotationNo}` : null,
    branch ? `Branch: ${branch}` : null,
    customerName ? `Name: ${customerName}` : null,
    mobile ? `Mobile: ${mobile}` : null,
    email ? `Email: ${email}` : null,
    `Vehicle: ${vehicleLabelRaw || '—'}`,
    vehicleSize ? `Vehicle Size: ${vehicleSize}` : null,
    serviceName ? `Service: ${serviceName}` : null,
    notes ? `Notes: ${notes}` : null,
    '',
    'Open the Staff Dashboard → Quotations to review and approve.',
  ].filter(Boolean).join('\n')

  return {
    subject: `New Online Quotation Request — ${quotationNo || ''} | ${BRAND_NAME}`.trim(),
    html,
    text,
  }
}

// ─────────────────────────────────────────────────────────────────────────────

/** Template 8: Payment Receipt Confirmation */
function buildPaymentReceiptEmail({
  customerName,
  quotationNo,
  paymentAmount,
  totalPaid,
  totalAmount,
  subtotal,
  vatAmount,
  outstandingBalance,
  paymentMethod,
  paymentReference,
  paymentDate,
  plateNumber,
  make,
  model,
  vehicleYear,
  color,
}) {
  const vehicleLabel = buildVehicleLabel({ make, model, year: vehicleYear, color })
  const html = wrapLayout(`
    <div class="header">
      <img class="header-logo" src="cid:masterauto_logo" alt="${BRAND_NAME}" />
      <h1>💰 Payment Received</h1>
      <p>Receipt for Quotation ${quotationNo}</p>
    </div>
    <div class="body">
      <p>Dear <strong>${customerName || 'Valued Client'}</strong>,</p>
      <p>We have successfully received your payment. Thank you for your continued trust in <strong>${BRAND_NAME}</strong>!</p>

      <table class="info-table">
        <thead><tr><th colspan="2">Payment Summary</th></tr></thead>
        <tbody>
          <tr><td><strong>Amount Received</strong></td><td><strong style="color:#166534;">${formatCurrency(paymentAmount)}</strong></td></tr>
          <tr><td><strong>Payment Method</strong></td><td>${paymentMethod || '—'}</td></tr>
          ${paymentReference ? `<tr><td><strong>Reference No.</strong></td><td>${paymentReference}</td></tr>` : ''}
          <tr><td><strong>Date Received</strong></td><td>${formatDateTime(paymentDate || new Date())}</td></tr>
        </tbody>
      </table>

      <table class="info-table">
        <thead><tr><th colspan="2">Quotation & Balance Details</th></tr></thead>
        <tbody>
          <tr><td><strong>Reference No.</strong></td><td>${quotationNo}</td></tr>
          <tr><td><strong>Vehicle</strong></td><td>${vehicleLabel || '—'}</td></tr>
          ${plateNumber ? `<tr><td><strong>Plate No.</strong></td><td>${plateNumber}</td></tr>` : ''}
          <tr class="divider"><td colspan="2" style="padding:0;height:1px;background:#e2e8f0;"></td></tr>
          ${(Number(vatAmount) > 0) ? `
          <tr><td style="color:#475569;"><strong>Subtotal</strong></td><td style="color:#475569;">${formatCurrency(subtotal)}</td></tr>
          <tr><td style="color:#475569;"><strong>VAT</strong></td><td style="color:#475569;">+ ${formatCurrency(vatAmount)}</td></tr>
          ` : ''}
          <tr><td><strong>Quotation Total</strong></td><td>${formatCurrency(totalAmount)}</td></tr>
          <tr><td><strong>Total Paid to Date</strong></td><td>${formatCurrency(totalPaid)}</td></tr>
          <tr style="background:#fefce8;"><td style="font-weight:700;">Outstanding Balance</td><td><strong style="color:${BRAND_COLOR};">${formatCurrency(outstandingBalance)}</strong></td></tr>
        </tbody>
      </table>

      <div class="reminders">
        <strong>📌 What's Next?</strong>
        <ul>
          ${outstandingBalance > 0 
            ? `<li>Please remember to settle the remaining balance of <strong>${formatCurrency(outstandingBalance)}</strong> upon vehicle release.</li>`
            : `<li>Your account for this quotation is now <strong>FULLY PAID</strong>. Thank you!</li>`
          }
          <li>If you haven't scheduled your service yet, please contact us to book your preferred slot.</li>
          <li>For job-related inquiries, please reference <strong>${quotationNo}</strong>.</li>
        </ul>
      </div>

      <hr class="divider" />
      <p>Thank you for choosing <strong>${BRAND_NAME}</strong>!</p>
      <p style="margin-top:20px;"><em>— The ${BRAND_NAME} Team</em></p>
    </div>
  `)

  const text = [
    `Dear ${customerName || 'Valued Client'},`,
    '',
    `Payment Received: ${formatCurrency(paymentAmount)}`,
    `Quotation No:    ${quotationNo}`,
    `Method:          ${paymentMethod || '—'}`,
    `Ref No:          ${paymentReference || '—'}`,
    '',
    (Number(vatAmount) > 0) ? `Subtotal:       ${formatCurrency(subtotal)}` : null,
    (Number(vatAmount) > 0) ? `VAT:            +${formatCurrency(vatAmount)}` : null,
    `Quotation Total: ${formatCurrency(totalAmount)}`,
    `Total Paid:      ${formatCurrency(totalPaid)}`,
    `Outstanding:     ${formatCurrency(outstandingBalance)}`,
    '',
    `Vehicle:         ${vehicleLabel || '—'}`,
    '',
    `Thank you for choosing ${BRAND_NAME}!`,
  ].join('\n')

  return {
    subject: `Payment Received: ${formatCurrency(paymentAmount)} for ${quotationNo} | ${BRAND_NAME}`,
    html,
    text,
  }
}

// ─────────────────────────────────────────────────────────────────────────────

function buildCampaignEmail({
  subject,
  content,
  ctaLabel,
  ctaUrl,
  customerName,
  bannerImageUrl,
}) {
  const bannerSection = bannerImageUrl ? `
    <div style="width:100%; text-align:center; margin-bottom: 24px;">
      <img src="${bannerImageUrl}" alt="MasterAuto Promotion" style="max-width:100%; border-radius:8px; display:block; margin:0 auto; box-shadow:0 4px 12px rgba(0,0,0,0.1);" />
    </div>
  ` : ''

  const html = wrapLayout(`
    <div class="header">
      <img class="header-logo" src="cid:masterauto_logo" alt="${BRAND_NAME}" />
      <h1>${BRAND_NAME} Special Update</h1>
      <p>${subject || 'A message from our team'}</p>
    </div>
    <div class="body">
      ${bannerSection}
      ${content}

      ${ctaLabel && ctaUrl ? `
        <div style="margin: 32px 0; text-align: center;">
          <a href="${ctaUrl}" style="background:${BRAND_COLOR}; color:#fff; padding: 14px 28px; text-decoration:none; border-radius:6px; font-weight:700; font-size:16px; display:inline-block;">
            ${ctaLabel}
          </a>
        </div>
      ` : ''}

      <hr class="divider" />
      <p style="font-size:14px;color:#475569;">
        Thank you for being a valued customer of <strong>${BRAND_NAME}</strong>.
      </p>
      <p style="margin-top:20px;"><em>— The ${BRAND_NAME} Team</em></p>
    </div>
  `)

  return { subject, html, text: content.replace(/<[^>]+>/g, '') }
}

module.exports = {
  wrapLayout,
  buildServiceConfirmationEmail,
  buildWorkStartedEmail,
  buildTechnicianAssignedEmail,
  buildJobCompletedEmail,
  buildJobReleasedEmail,
  buildCancellationEmail,
  buildBookingConfirmationEmail,
  buildPortalBookingRequestEmail,
  buildQuotationApprovedScheduledEmail,
  buildPortalAccessEmail,
  buildPaymentReceiptEmail,
  buildQuotationRequestReceivedEmail,
  buildQuotationRequestStaffEmail,
  buildCampaignEmail,
}

