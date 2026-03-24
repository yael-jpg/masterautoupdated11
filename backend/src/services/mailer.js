const nodemailer = require('nodemailer')
const env = require('../config/env')
const path = require('path')
const fs = require('fs')
const {
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
  buildPaymentReceiptEmail,
} = require('./emailTemplates')

const isSmtpConfigured =
  Boolean(env.smtpHost) &&
  Boolean(env.smtpUser) &&
  Boolean(env.smtpPass) &&
  Boolean(env.smtpFrom)

let transporter

// Default MasterAuto logo attachment (CID). Used by emailTemplates wrapLayout.
let DEFAULT_LOGO_ATTACHMENT = null
try {
  const preferredLogoPath = path.join(__dirname, '../../public/images/masterauto_logo.png')
  const fallbackLogoPath = path.join(__dirname, '../../public/images/logo.png')
  const logoPath = fs.existsSync(preferredLogoPath) ? preferredLogoPath : fallbackLogoPath
  if (fs.existsSync(logoPath)) {
    DEFAULT_LOGO_ATTACHMENT = {
      filename: path.basename(logoPath),
      path: logoPath,
      cid: 'masterauto_logo',
    }
  }
} catch (_) {
  DEFAULT_LOGO_ATTACHMENT = null
}

function withDefaultAttachments(extra) {
  const merged = []
  if (DEFAULT_LOGO_ATTACHMENT) merged.push(DEFAULT_LOGO_ATTACHMENT)
  if (Array.isArray(extra) && extra.length) merged.push(...extra)
  return merged.length ? merged : undefined
}

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtpHost,
      port: env.smtpPort,
      secure: env.smtpSecure,
      tls: {
        rejectUnauthorized: env.smtpTlsRejectUnauthorized,
      },
      auth: {
        user: env.smtpUser,
        pass: env.smtpPass,
      },
    })
  }

  return transporter
}

function buildVehicleLabel({ make, model, year }) {
  return [year, make, model].filter(Boolean).join(' ')
}

async function sendReadyForReleaseEmail({
  to,
  customerName,
  plateNumber,
  make,
  model,
  year,
  referenceNo,
}) {
  if (!to || !isSmtpConfigured) {
    return { skipped: true }
  }

  const vehicleLabel = buildVehicleLabel({ make, model, year })
  const subject = `Vehicle Ready for Release${plateNumber ? ` - ${plateNumber}` : ''}`

  const text = [
    `Hello ${customerName || 'Client'},`,
    '',
    'Your vehicle is now ready for release.',
    vehicleLabel ? `Vehicle: ${vehicleLabel}` : null,
    plateNumber ? `Plate Number: ${plateNumber}` : null,
    referenceNo ? `Reference No: ${referenceNo}` : null,
    '',
    'Please contact us to confirm your pick-up schedule.',
    '',
    'Thank you.',
  ]
    .filter(Boolean)
    .join('\n')

  const innerHtml = `
    <p>Hello ${customerName || 'Client'},</p>
    <p>Your vehicle is now <strong>ready for release</strong>.</p>
    <ul>
      ${vehicleLabel ? `<li>Vehicle: ${vehicleLabel}</li>` : ''}
      ${plateNumber ? `<li>Plate Number: ${plateNumber}</li>` : ''}
      ${referenceNo ? `<li>Reference No: ${referenceNo}</li>` : ''}
    </ul>
    <p>Please contact us to confirm your pick-up schedule.</p>
    <p>Thank you.</p>
  `

  const html = wrapLayout(`
    <div class="header">
      <img class="header-logo" src="cid:masterauto_logo" alt="MasterAuto" />
      <h1>🚗 Ready for Release</h1>
      <p>Your vehicle is ready for pick-up</p>
    </div>
    <div class="body">
      ${innerHtml}
    </div>
  `)

  await getTransporter().sendMail({
    from: env.smtpFrom,
    to,
    replyTo: env.smtpReplyTo || undefined,
    subject,
    text,
    html,
    attachments: withDefaultAttachments(),
  })

  return { skipped: false }
}

async function sendReceiptEmail({
  to,
  customerName,
  plateNumber,
  make,
  model,
  year,
  referenceNo,
  warrantyExpiresAt,
  followUpDate,
}) {
  if (!to || !isSmtpConfigured) {
    return { skipped: true }
  }

  const vehicleLabel = buildVehicleLabel({ make, model, year })
  const subject = `Vehicle Released${plateNumber ? ` - ${plateNumber}` : ''} — Thank You!`

  const warrantyLine = warrantyExpiresAt
    ? `Warranty Valid Until: ${new Date(warrantyExpiresAt).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}`
    : null

  const followUpLine = followUpDate
    ? `We will follow up with you around ${new Date(followUpDate).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}`
    : null

  const innerHtml = `
    <p>Hello ${customerName || 'Client'},</p>
    <p>Thank you for trusting <strong>MasterAuto</strong>! Your vehicle has been successfully released.</p>
    <ul>
      ${vehicleLabel ? `<li><strong>Vehicle:</strong> ${vehicleLabel}</li>` : ''}
      ${plateNumber ? `<li><strong>Plate Number:</strong> ${plateNumber}</li>` : ''}
      ${referenceNo ? `<li><strong>Reference No:</strong> ${referenceNo}</li>` : ''}
      ${warrantyLine ? `<li><strong>${warrantyLine}</strong></li>` : ''}
    </ul>
    ${followUpLine ? `<p>${followUpLine} to check on your vehicle's condition.</p>` : ''}
    <p>We look forward to seeing you again. Drive safe!</p>
    <p><em>— MasterAuto Team</em></p>
  `

  const html = wrapLayout(`
    <div class="header">
      <img class="header-logo" src="cid:masterauto_logo" alt="MasterAuto" />
      <h1>🚗 Vehicle Released</h1>
      <p>Thank you for choosing MasterAuto</p>
    </div>
    <div class="body">
      ${innerHtml}
    </div>
  `)

  await getTransporter().sendMail({
    from: env.smtpFrom,
    to,
    replyTo: env.smtpReplyTo || undefined,
    subject,
    html,
    text: `Hello ${customerName || 'Client'}, your vehicle ${vehicleLabel || ''} (${plateNumber || ''}) has been released. Reference: ${referenceNo || ''}. ${warrantyLine || ''} Thank you from MasterAuto!`,
    attachments: withDefaultAttachments(),
  })

  return { skipped: false }
}

async function sendCompletionEmail({
  to,
  customerName,
  plateNumber,
  make,
  model,
  year,
  referenceNo,
  servicePackage,
}) {
  if (!to || !isSmtpConfigured) {
    return { skipped: true }
  }

  const vehicleLabel = buildVehicleLabel({ make, model, year })
  const subject = `Service Completed${plateNumber ? ` - ${plateNumber}` : ''} — MasterAuto`

  const innerHtml = `
    <p>Hello ${customerName || 'Client'},</p>
    <p>We are pleased to inform you that the service on your vehicle has been <strong>successfully completed</strong>.</p>
    <ul>
      ${vehicleLabel ? `<li><strong>Vehicle:</strong> ${vehicleLabel}</li>` : ''}
      ${plateNumber ? `<li><strong>Plate Number:</strong> ${plateNumber}</li>` : ''}
      ${servicePackage ? `<li><strong>Service:</strong> ${servicePackage}</li>` : ''}
      ${referenceNo ? `<li><strong>Reference No:</strong> ${referenceNo}</li>` : ''}
      <li><strong>Completed On:</strong> ${new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</li>
    </ul>
    <p>Thank you for choosing <strong>MasterAuto</strong>. We hope to see you again!</p>
    <p><em>— MasterAuto Team</em></p>
  `

  const html = wrapLayout(`
    <div class="header">
      <img class="header-logo" src="cid:masterauto_logo" alt="MasterAuto" />
      <h1>✅ Service Completed</h1>
      <p>Your vehicle service has been completed</p>
    </div>
    <div class="body">
      ${innerHtml}
    </div>
  `)

  await getTransporter().sendMail({
    from: env.smtpFrom,
    to,
    replyTo: env.smtpReplyTo || undefined,
    subject,
    html,
    text: `Hello ${customerName || 'Client'}, your service on ${vehicleLabel || ''} (${plateNumber || ''}) has been completed. Reference: ${referenceNo || ''}. Thank you from MasterAuto!`,
    attachments: withDefaultAttachments(),
  })

  return { skipped: false }
}

// ── New: Service Confirmation Email (Quotation → Approved) ───────────────────

async function sendServiceConfirmationEmail({
  to,
  customerName,
  quotationNo,
  plateNumber,
  make,
  model,
  vehicleYear,
  color,
  services,
  totalAmount,
  subtotal,
  vatAmount,
  notes,
  hasCoating = false,
  hasPpf = false,
  hasTint = false,
  hasExteriorDetail = false,
  hasInteriorDetail = false,
  configSubject,
  configGreeting,
  configReminders,
  configClosing,
}) {
  if (!to || !isSmtpConfigured) {
    return { skipped: true }
  }

  const { subject, html, text } = buildServiceConfirmationEmail({
    customerName,
    quotationNo,
    plateNumber,
    make,
    model,
    vehicleYear,
    color,
    services,
    totalAmount,
    subtotal,
    vatAmount,
    notes,
    hasCoating,
    hasPpf,
    hasTint,
    hasExteriorDetail,
    hasInteriorDetail,
    configSubject,
    configGreeting,
    configReminders,
    configClosing,
  })

  await getTransporter().sendMail({
    from:    env.smtpFrom,
    to,
    replyTo: env.smtpReplyTo || undefined,
    subject,
    html,
    text,
    attachments: withDefaultAttachments(),
  })

  return { skipped: false }
}

// ── New: Work Started Email (Job Order → In Progress) ────────────────────────

async function sendWorkStartedEmail({
  to,
  customerName,
  jobOrderNo,
  quotationNo,
  plateNumber,
  make,
  model,
  vehicleYear,
  color,
  services,
  technicianNames,
  startedAt,
  scheduleEnd,
  scheduleBay,
}) {
  if (!to || !isSmtpConfigured) {
    return { skipped: true }
  }

  const { subject, html, text } = buildWorkStartedEmail({
    customerName,
    jobOrderNo,
    quotationNo,
    plateNumber,
    make,
    model,
    vehicleYear,
    color,
    services,
    technicianNames,
    startedAt,
    scheduleEnd,
    scheduleBay,
  })

  await getTransporter().sendMail({
    from:    env.smtpFrom,
    to,
    replyTo: env.smtpReplyTo || undefined,
    subject,
    html,
    text,
    attachments: withDefaultAttachments(),
  })

  return { skipped: false }
}

// ── New: Technician Assigned Email (Pending job, installers saved) ────────────

async function sendTechnicianAssignedEmail({
  to,
  customerName,
  jobOrderNo,
  quotationNo,
  plateNumber,
  make,
  model,
  vehicleYear,
  color,
  services,
  technicianNames,
  scheduleStart,
  scheduleEnd,
  scheduleBay,
}) {
  if (!to || !isSmtpConfigured) {
    return { skipped: true }
  }

  const { subject, html, text } = buildTechnicianAssignedEmail({
    customerName,
    jobOrderNo,
    quotationNo,
    plateNumber,
    make,
    model,
    vehicleYear,
    color,
    services,
    technicianNames,
    scheduleStart,
    scheduleEnd,
    scheduleBay,
  })

  await getTransporter().sendMail({
    from:    env.smtpFrom,
    to,
    replyTo: env.smtpReplyTo || undefined,
    subject,
    html,
    text,
    attachments: withDefaultAttachments(),
  })

  return { skipped: false }
}

// ── New: Job Released Email (Job Order → Released) ────────────────────────────

async function sendJobCompletedEmail({
  to,
  customerName,
  jobOrderNo,
  quotationNo,
  plateNumber,
  make,
  model,
  vehicleYear,
  color,
  services,
  totalAmount,
  technicianNames,
  completedAt,
  customerMobile,
}) {
  if (!to || !isSmtpConfigured) {
    return { skipped: true }
  }

  const { subject, html, text } = buildJobCompletedEmail({
    customerName,
    jobOrderNo,
    quotationNo,
    plateNumber,
    make,
    model,
    vehicleYear,
    color,
    services,
    totalAmount,
    technicianNames,
    completedAt,
    customerMobile,
  })

  await getTransporter().sendMail({
    from:    env.smtpFrom,
    to,
    replyTo: env.smtpReplyTo || undefined,
    subject,
    html,
    text,
    attachments: withDefaultAttachments(),
  })

  return { skipped: false }
}

// ── New: Vehicle Released Email (Job Order → Released) ───────────────────────

async function sendJobReleasedEmail({
  to,
  customerName,
  jobOrderNo,
  quotationNo,
  plateNumber,
  make,
  model,
  vehicleYear,
  color,
  services,
  totalAmount,
  technicianNames,
  releasedAt,
}) {
  if (!to || !isSmtpConfigured) {
    return { skipped: true }
  }

  const { subject, html, text } = buildJobReleasedEmail({
    customerName,
    jobOrderNo,
    quotationNo,
    plateNumber,
    make,
    model,
    vehicleYear,
    color,
    services,
    totalAmount,
    technicianNames,
    releasedAt,
  })

  await getTransporter().sendMail({
    from:    env.smtpFrom,
    to,
    replyTo: env.smtpReplyTo || undefined,
    subject,
    html,
    text,
    attachments: withDefaultAttachments(),
  })

  return { skipped: false }
}

// ─────────────────────────────────────────────────────────────────────────────

async function sendCancellationEmail({
  to,
  customerName,
  plateNumber,
  make,
  model,
  year,
  referenceNo,
  scheduledAt,
  cancelledAt,
  cancelReason,
  paymentAction,  // 'refund' | 'credit' | null
  amountPaid,
  refundNote,
}) {
  if (!to || !isSmtpConfigured) return { skipped: true }

  const { subject, html, text } = buildCancellationEmail({
    customerName, plateNumber, make, model, year,
    referenceNo, scheduledAt, cancelledAt, cancelReason,
    paymentAction, amountPaid, refundNote,
  })

  await getTransporter().sendMail({
    from: env.smtpFrom,
    to,
    replyTo: env.smtpReplyTo || undefined,
    subject,
    html,
    text,
    attachments: withDefaultAttachments(),
  })

  return { skipped: false }
}

// ─────────────────────────────────────────────────────────────────────────────

// ── New: Booking Confirmation (appointment created) ────────────────────────────

async function sendBookingConfirmationEmail({
  to,
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
  configSubject,
  configGreeting,
  configReminders,
  configClosing,
}) {
  if (!to || !isSmtpConfigured) {
    return { skipped: true }
  }

  const { subject, html, text } = buildBookingConfirmationEmail({
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
    configSubject,
    configGreeting,
    configReminders,
    configClosing,
  })

  await getTransporter().sendMail({
    from:    env.smtpFrom,
    to,
    replyTo: env.smtpReplyTo || undefined,
    subject,
    html,
    text,
    attachments: withDefaultAttachments(),
  })

  return { skipped: false }
}

// ── Portal: Quotation Request Received (portal booking creates a quotation) ──

async function sendPortalBookingRequestEmail({
  to,
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
}) {
  if (!to || !isSmtpConfigured) return { skipped: true }

  const { subject, html, text } = buildPortalBookingRequestEmail({
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
  })

  await getTransporter().sendMail({
    from: env.smtpFrom,
    to,
    replyTo: env.smtpReplyTo || undefined,
    subject,
    html,
    text,
    attachments: withDefaultAttachments(),
  })

  return { skipped: false }
}

// ── Portal: Quotation Approved & Scheduled (staff scheduled the appointment) ──

async function sendQuotationApprovedScheduledEmail({
  to,
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
}) {
  if (!to || !isSmtpConfigured) return { skipped: true }

  const { subject, html, text } = buildQuotationApprovedScheduledEmail({
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
  })

  await getTransporter().sendMail({
    from: env.smtpFrom,
    to,
    replyTo: env.smtpReplyTo || undefined,
    subject,
    html,
    text,
    attachments: withDefaultAttachments(),
  })

  return { skipped: false }
}

// ── New: Payment Receipt Email (Payment recorded) ────────────────────────────

async function sendPaymentReceiptEmail({
  to,
  customerName,
  quotationNo,
  paymentAmount,
  totalPaid,
  totalAmount,
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
  if (!to || !isSmtpConfigured) {
    return { skipped: true }
  }

  const { subject, html, text } = buildPaymentReceiptEmail({
    customerName,
    quotationNo,
    paymentAmount,
    totalPaid,
    totalAmount,
    outstandingBalance,
    paymentMethod,
    paymentReference,
    paymentDate,
    plateNumber,
    make,
    model,
    vehicleYear,
    color,
  })

  await getTransporter().sendMail({
    from:    env.smtpFrom,
    to,
    replyTo: env.smtpReplyTo || undefined,
    subject,
    html,
    text,
    attachments: withDefaultAttachments(),
  })

  return { skipped: false }
}

// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  sendReadyForReleaseEmail,
  sendReceiptEmail,
  sendCompletionEmail,
  sendServiceConfirmationEmail,
  sendWorkStartedEmail,
  sendTechnicianAssignedEmail,
  sendJobCompletedEmail,
  sendJobReleasedEmail,
  sendCancellationEmail,
  sendBookingConfirmationEmail,
  sendPortalBookingRequestEmail,
  sendQuotationApprovedScheduledEmail,
  sendPaymentReceiptEmail,
  // Generic send helper for campaign / custom emails
  sendRawEmail: async function ({ to, subject, html, text, from, attachments }) {
    if (!to || !isSmtpConfigured) return { skipped: true }
    await getTransporter().sendMail({
      from: from || env.smtpFrom,
      to,
      replyTo: env.smtpReplyTo || undefined,
      subject,
      html,
      text,
      ...(withDefaultAttachments(attachments) ? { attachments: withDefaultAttachments(attachments) } : {}),
    })
    return { skipped: false }
  },

  sendCampaignEmail: async function ({ to, subject, content, ctaLabel, ctaUrl, customerName, from, bannerImageUrl }) {
    if (!to || !isSmtpConfigured) return { skipped: true }
    
    // CID Embedding: If image is local, attach it to the email
    let finalBannerUrl = bannerImageUrl
    let attachments = []
    
    if (bannerImageUrl && bannerImageUrl.startsWith('/uploads/')) {
      const path = require('path')
      const fs = require('fs')
      // Try resolving relative to package root (assuming started from backend/)
      const filePath = path.join(process.cwd(), 'public', bannerImageUrl)
      
      if (fs.existsSync(filePath)) {
        finalBannerUrl = 'cid:campaign_banner'
        attachments.push({
          filename: path.basename(filePath),
          path: filePath,
          cid: 'campaign_banner'
        })
      } else {
        // Fallback to absolute URL if file not found locally
        const baseUrl = env.apiBaseUrl.endsWith('/') ? env.apiBaseUrl.slice(0, -1) : env.apiBaseUrl
        finalBannerUrl = `${baseUrl}${bannerImageUrl}`
      }
    }
    
    const { buildCampaignEmail } = require('./emailTemplates')
    const { html, text } = buildCampaignEmail({ subject, content, ctaLabel, ctaUrl, customerName, bannerImageUrl: finalBannerUrl })
    
    await getTransporter().sendMail({
      from: from || env.smtpFrom,
      to,
      replyTo: env.smtpReplyTo || undefined,
      subject,
      html,
      text,
      ...(withDefaultAttachments(attachments) ? { attachments: withDefaultAttachments(attachments) } : {}),
    })
    return { skipped: false }
  },
}

