/*
 * Generates local HTML previews for key transactional emails.
 * These previews inline the logo (replace cid:masterauto_logo) so they render in a normal browser.
 */

const fs = require('fs')
const path = require('path')

const {
  wrapLayout,
  buildQuotationRequestReceivedEmail,
  buildQuotationRequestStaffEmail,
  buildServiceConfirmationEmail,
  buildBookingConfirmationEmail,
  buildPaymentReceiptEmail,
} = require('../src/services/emailTemplates')

function readLogoDataUri() {
  const preferredLogoPath = path.join(__dirname, '..', 'public', 'images', 'masterauto_logo.png')
  const fallbackLogoPath = path.join(__dirname, '..', 'public', 'images', 'logo.png')
  const logoPath = fs.existsSync(preferredLogoPath) ? preferredLogoPath : fallbackLogoPath

  if (!fs.existsSync(logoPath)) {
    return null
  }

  const buf = fs.readFileSync(logoPath)
  const base64 = buf.toString('base64')
  return `data:image/png;base64,${base64}`
}

function inlineCidLogo(html, logoDataUri) {
  if (!html) return html
  if (!logoDataUri) return html
  return html.split('cid:masterauto_logo').join(logoDataUri)
}

function writePreviewFile(outDir, fileName, html) {
  const outPath = path.join(outDir, fileName)
  fs.writeFileSync(outPath, html, 'utf8')
  return outPath
}

function main() {
  const outDir = path.join(__dirname, '..', 'email-previews')
  fs.mkdirSync(outDir, { recursive: true })

  const logoDataUri = readLogoDataUri()

  const previews = []

  // 1) Quotation Request Received (Customer)
  {
    const { html } = buildQuotationRequestReceivedEmail({
      customerName: 'Juan Dela Cruz',
      quotationNo: 'ONLINE-#1234',
      branch: 'Cubao',
      mobile: '0917 123 4567',
      email: 'juan@example.com',
      make: 'Toyota',
      model: 'Fortuner',
      vehicleSize: 'SUV',
      serviceName: 'PPF Basic Package',
      notes: 'Please contact me in the afternoon. Preferred schedule next week.',
    })

    previews.push([
      '01-quotation-request-received-customer.html',
      inlineCidLogo(html, logoDataUri),
    ])
  }

  // 2) Quotation Request Received (Staff)
  {
    const { html } = buildQuotationRequestStaffEmail({
      quotationNo: 'ONLINE-#1234',
      branch: 'Cubao',
      customerName: 'Juan Dela Cruz',
      mobile: '0917 123 4567',
      email: 'juan@example.com',
      make: 'Toyota',
      model: 'Fortuner',
      vehicleSize: 'SUV',
      serviceName: 'PPF Basic Package',
      notes: 'Preferred start: Mar 25, 2026, 10:00 AM\nEstimated end: Mar 25, 2026, 06:00 PM\nGuest notes: afternoon call-back',
    })

    previews.push([
      '02-quotation-request-received-staff.html',
      inlineCidLogo(html, logoDataUri),
    ])
  }

  // 3) Approval / Service Confirmation
  {
    const { html } = buildServiceConfirmationEmail({
      customerName: 'Juan Dela Cruz',
      quotationNo: 'QTN-2026-0001',
      plateNumber: 'ABC-1234',
      make: 'Toyota',
      model: 'Fortuner',
      vehicleYear: 2022,
      color: 'Black',
      services: [
        { name: 'PPF Basic Package', unitPrice: 45000, total: 45000 },
        { name: 'Ceramic Coating', unitPrice: 28000, total: 28000 },
      ],
      subtotal: 73000,
      vatAmount: 0,
      totalAmount: 73000,
      notes: 'Please confirm schedule with our team.',
      hasCoating: true,
      hasPpf: true,
    })

    previews.push([
      '03-service-confirmation-approved.html',
      inlineCidLogo(html, logoDataUri),
    ])
  }

  // 4) Booking Confirmed
  {
    const { html } = buildBookingConfirmationEmail({
      customerName: 'Juan Dela Cruz',
      plateNumber: 'ABC-1234',
      make: 'Toyota',
      model: 'Fortuner',
      vehicleYear: 2022,
      color: 'Black',
      scheduleStart: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      scheduleEnd: new Date(Date.now() + 24 * 60 * 60 * 1000 + 6 * 60 * 60 * 1000).toISOString(),
      bay: 'BAY 2',
      installerTeam: 'Team A',
      serviceName: 'PPF Basic Package',
      referenceNo: 'APT-2026-0101',
      notes: 'Customer will arrive early.',
    })

    previews.push([
      '04-booking-confirmation.html',
      inlineCidLogo(html, logoDataUri),
    ])
  }

  // 5) Payment Receipt
  {
    const { html } = buildPaymentReceiptEmail({
      customerName: 'Juan Dela Cruz',
      quotationNo: 'QTN-2026-0001',
      paymentAmount: 15000,
      totalPaid: 15000,
      totalAmount: 73000,
      outstandingBalance: 58000,
      paymentMethod: 'GCash',
      paymentReference: 'GCASH-REF-000123',
      paymentDate: new Date().toISOString(),
      plateNumber: 'ABC-1234',
      make: 'Toyota',
      model: 'Fortuner',
      vehicleYear: 2022,
      color: 'Black',
    })

    previews.push([
      '05-payment-receipt.html',
      inlineCidLogo(html, logoDataUri),
    ])
  }

  // 6) Ready for Release (legacy mailer inline)
  {
    const bodyHtml = `
      <div class="header">
        <img class="header-logo" src="cid:masterauto_logo" alt="MasterAuto" />
        <h1>🚗 Ready for Release</h1>
        <p>Your vehicle is ready for pick-up</p>
      </div>
      <div class="body">
        <p>Hello Juan Dela Cruz,</p>
        <p>Your vehicle is now <strong>ready for release</strong>.</p>
        <ul>
          <li>Vehicle: Toyota Fortuner 2022</li>
          <li>Plate Number: ABC-1234</li>
          <li>Reference No: SALE-2026-0009</li>
        </ul>
        <p>Please contact us to confirm your pick-up schedule.</p>
        <p>Thank you.</p>
      </div>
    `

    const html = wrapLayout(bodyHtml)
    previews.push([
      '06-ready-for-release.html',
      inlineCidLogo(html, logoDataUri),
    ])
  }

  // 7) Vehicle Released (legacy mailer inline)
  {
    const bodyHtml = `
      <div class="header">
        <img class="header-logo" src="cid:masterauto_logo" alt="MasterAuto" />
        <h1>🚗 Vehicle Released</h1>
        <p>Thank you for choosing MasterAuto</p>
      </div>
      <div class="body">
        <p>Hello Juan Dela Cruz,</p>
        <p>Thank you for trusting <strong>MasterAuto</strong>! Your vehicle has been successfully released.</p>
        <ul>
          <li><strong>Vehicle:</strong> Toyota Fortuner 2022</li>
          <li><strong>Plate Number:</strong> ABC-1234</li>
          <li><strong>Reference No:</strong> SALE-2026-0009</li>
          <li><strong>Warranty Valid Until: December 31, 2026</strong></li>
        </ul>
        <p>We look forward to seeing you again. Drive safe!</p>
        <p><em>— MasterAuto Team</em></p>
      </div>
    `

    const html = wrapLayout(bodyHtml)
    previews.push([
      '07-vehicle-released.html',
      inlineCidLogo(html, logoDataUri),
    ])
  }

  // 8) Service Completed (legacy mailer inline)
  {
    const bodyHtml = `
      <div class="header">
        <img class="header-logo" src="cid:masterauto_logo" alt="MasterAuto" />
        <h1>✅ Service Completed</h1>
        <p>Your vehicle service has been completed</p>
      </div>
      <div class="body">
        <p>Hello Juan Dela Cruz,</p>
        <p>We are pleased to inform you that the service on your vehicle has been <strong>successfully completed</strong>.</p>
        <ul>
          <li><strong>Vehicle:</strong> Toyota Fortuner 2022</li>
          <li><strong>Plate Number:</strong> ABC-1234</li>
          <li><strong>Service:</strong> PPF Basic Package</li>
          <li><strong>Reference No:</strong> SALE-2026-0009</li>
          <li><strong>Completed On:</strong> ${new Date().toLocaleString('en-PH')}</li>
        </ul>
        <p>Thank you for choosing <strong>MasterAuto</strong>. We hope to see you again!</p>
        <p><em>— MasterAuto Team</em></p>
      </div>
    `

    const html = wrapLayout(bodyHtml)
    previews.push([
      '08-service-completed.html',
      inlineCidLogo(html, logoDataUri),
    ])
  }

  const written = previews.map(([fileName, html]) => writePreviewFile(outDir, fileName, html))

  // eslint-disable-next-line no-console
  console.log('Generated email previews:')
  for (const p of written) {
    // eslint-disable-next-line no-console
    console.log(' -', p)
  }
}

main()
