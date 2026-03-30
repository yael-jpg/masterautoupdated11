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

function isLocalSmtpHost(host) {
  const h = String(host || '').trim().toLowerCase()
  return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === 'mailhog' || h === 'mailpit'
}

const isSmtpAuthProvided = Boolean(env.smtpUser) && Boolean(env.smtpPass)

const isSmtpTransportDefined = Boolean(env.smtpHost) && Boolean(env.smtpFrom)

const isSmtpSendable =
  isSmtpTransportDefined &&
  (isLocalSmtpHost(env.smtpHost) ? true : isSmtpAuthProvided)

const isResendConfigured =
  Boolean(env.resendApiKey) &&
  Boolean(env.resendFrom || env.smtpFrom)

function getEmailProvider() {
  const provider = (env.emailProvider || '').trim().toLowerCase()
  if (provider === 'resend' || provider === 'smtp') return provider
  // Auto-detect: always default to SMTP.
  // Resend must be explicitly selected via EMAIL_PROVIDER=resend.
  // This prevents a RESEND_API_KEY from accidentally taking over when SMTP is partially configured.
  return 'smtp'
}

function isEmailConfigured() {
  const provider = getEmailProvider()
  // "Configured" here means: the app is set up enough that it will attempt sending.
  // For non-local SMTP hosts, actual sendability also requires credentials; sendEmail()
  // will raise a clear error if they're missing.
  return provider === 'resend' ? isResendConfigured : isSmtpTransportDefined
}

let transporter

let resendClientPromise

function getResendClient() {
  if (!resendClientPromise) {
    resendClientPromise = Promise.resolve()
      .then(async () => {
        // The SDK may be ESM depending on version; support both.
        try {
          // eslint-disable-next-line global-require
          const mod = require('resend')
          return mod.Resend ? new mod.Resend(env.resendApiKey) : new mod.default.Resend(env.resendApiKey)
        } catch (_) {
          const mod = await import('resend')
          const Resend = mod.Resend || (mod.default && mod.default.Resend)
          return new Resend(env.resendApiKey)
        }
      })
  }
  return resendClientPromise
}

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
    const auth = env.smtpUser && env.smtpPass ? { user: env.smtpUser, pass: env.smtpPass } : undefined
    transporter = nodemailer.createTransport({
      host: env.smtpHost,
      port: env.smtpPort,
      secure: env.smtpSecure,
      tls: {
        rejectUnauthorized: env.smtpTlsRejectUnauthorized,
      },
      ...(auth ? { auth } : {}),
    })
  }

  return transporter
}

const attachmentContentCache = new Map()

function readAttachmentContent(filePath) {
  if (!filePath) return null
  if (attachmentContentCache.has(filePath)) return attachmentContentCache.get(filePath)
  const buf = fs.readFileSync(filePath)
  attachmentContentCache.set(filePath, buf)
  return buf
}

function convertAttachmentsForResend(nodemailerAttachments) {
  if (!Array.isArray(nodemailerAttachments) || !nodemailerAttachments.length) return undefined

  const out = []
  for (const a of nodemailerAttachments) {
    if (!a) continue

    // We primarily support the attachment style used in this repo: { filename, path, cid }
    const filename = a.filename || (a.path ? path.basename(a.path) : undefined)
    let content = a.content

    if (!content && a.path && fs.existsSync(a.path)) {
      content = readAttachmentContent(a.path)
    }

    if (!filename || !content) continue

    const ra = {
      filename,
      content,
    }

    if (a.cid) {
      ra.contentId = a.cid
    }

    out.push(ra)
  }

  return out.length ? out : undefined
}

async function sendEmail({ from, to, replyTo, subject, html, text, attachments }) {
  const provider = getEmailProvider()

  if (!to) return { skipped: true }

  if (provider === 'smtp' && !isSmtpSendable) {
    if (env.smtpHost && !isLocalSmtpHost(env.smtpHost)) {
      throw new Error(
        `SMTP is selected but not configured. Set SMTP_USER and SMTP_PASS for host ${env.smtpHost}. ` +
          'For Gmail, use an App Password (not your normal password).',
      )
    }
    return { skipped: true }
  }

  if (provider === 'resend' && !isResendConfigured) {
    return { skipped: true }
  }

  if (provider === 'smtp') {
    await getTransporter().sendMail({
      from: from || env.smtpFrom,
      to,
      replyTo: replyTo || env.smtpReplyTo || undefined,
      subject,
      html,
      text,
      ...(attachments ? { attachments } : {}),
    })
    return { skipped: false }
  }

  const resend = await getResendClient()
  const resendAttachments = convertAttachmentsForResend(attachments)
  const payload = {
    from: from || env.resendFrom || env.smtpFrom,
    to,
    subject,
    html,
    text,
    replyTo: replyTo || env.resendReplyTo || env.smtpReplyTo || undefined,
    ...(resendAttachments ? { attachments: resendAttachments } : {}),
  }

  const { data, error } = await resend.emails.send(payload)
  if (error) {
    const message = error.message || (typeof error === 'string' ? error : JSON.stringify(error))
    throw new Error(message)
  }

  return { skipped: false, id: data && data.id }
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
  if (!to || !isEmailConfigured()) return { skipped: true }

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

  await sendEmail({
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
  if (!to || !isEmailConfigured()) return { skipped: true }

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

  await sendEmail({
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
  if (!to || !isEmailConfigured()) return { skipped: true }

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

  await sendEmail({
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
  if (!to || !isEmailConfigured()) return { skipped: true }

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

  await sendEmail({
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
  if (!to || !isEmailConfigured()) return { skipped: true }

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

  await sendEmail({
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
  if (!to || !isEmailConfigured()) return { skipped: true }

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

  await sendEmail({
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
  subtotal,
  vatAmount,
  technicianNames,
  completedAt,
  customerMobile,
}) {
  if (!to || !isEmailConfigured()) return { skipped: true }

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
    subtotal,
    vatAmount,
    technicianNames,
    completedAt,
    customerMobile,
  })

  await sendEmail({
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
  subtotal,
  vatAmount,
  technicianNames,
  releasedAt,
}) {
  if (!to || !isEmailConfigured()) return { skipped: true }

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
    subtotal,
    vatAmount,
    technicianNames,
    releasedAt,
  })

  await sendEmail({
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
  if (!to || !isEmailConfigured()) return { skipped: true }

  const { subject, html, text } = buildCancellationEmail({
    customerName, plateNumber, make, model, year,
    referenceNo, scheduledAt, cancelledAt, cancelReason,
    paymentAction, amountPaid, refundNote,
  })

  await sendEmail({
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
  if (!to || !isEmailConfigured()) return { skipped: true }

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

  await sendEmail({
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
  if (!to || !isEmailConfigured()) return { skipped: true }

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

  await sendEmail({
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
  if (!to || !isEmailConfigured()) return { skipped: true }

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

  await sendEmail({
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

// ── Portal: Access Created (staff walk-in registration) ─────────────────────

async function sendPortalAccessEmail({
  to,
  customerName,
  loginEmail,
  loginMobile,
  temporaryPassword,
  portalUrl,
}) {
  if (!to || !isEmailConfigured()) return { skipped: true }

  const { buildPortalAccessEmail } = require('./emailTemplates')
  const { subject, html, text } = buildPortalAccessEmail({
    customerName,
    loginEmail,
    loginMobile,
    temporaryPassword,
    portalUrl,
  })

  await sendEmail({
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

// ── Portal: Email Verification (OTP) ────────────────────────────────────────

async function sendPortalEmailVerificationEmail({
  to,
  customerName,
  otpCode,
  expiresMinutes,
  portalUrl,
}) {
  if (!to || !isEmailConfigured()) return { skipped: true }

  const { buildPortalEmailVerificationEmail } = require('./emailTemplates')
  const { subject, html, text } = buildPortalEmailVerificationEmail({
    customerName,
    otpCode,
    expiresMinutes,
    portalUrl: portalUrl || env.portalUrl,
  })

  await sendEmail({
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
  if (!to || !isEmailConfigured()) return { skipped: true }

  const { subject, html, text } = buildPaymentReceiptEmail({
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
  })

  await sendEmail({
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

module.exports = {
  isEmailConfigured,
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
  sendPortalAccessEmail,
  sendPortalEmailVerificationEmail,
  sendPaymentReceiptEmail,
  // Generic send helper for campaign / custom emails
  sendRawEmail: async function ({ to, subject, html, text, from, attachments }) {
    if (!to || !isEmailConfigured()) return { skipped: true }
    await sendEmail({
      from: from || env.smtpFrom,
      to,
      replyTo: env.smtpReplyTo || undefined,
      subject,
      html,
      text,
      attachments: withDefaultAttachments(attachments),
    })
    return { skipped: false }
  },

  sendCampaignEmail: async function ({ to, subject, content, ctaLabel, ctaUrl, customerName, from, bannerImageUrl }) {
    if (!to || !isEmailConfigured()) return { skipped: true }
    
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
    
    await sendEmail({
      from: from || env.smtpFrom,
      to,
      replyTo: env.smtpReplyTo || undefined,
      subject,
      html,
      text,
      attachments: withDefaultAttachments(attachments),
    })
    return { skipped: false }
  },
}

