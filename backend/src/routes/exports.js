const express = require('express')
const PDFDocument = require('pdfkit')
const XLSX = require('xlsx')
const fs = require('fs')
const db = require('../config/db')
const { asyncHandler } = require('../utils/asyncHandler')

const router = express.Router()

const allowedTables = new Set(['customers', 'vehicles', 'services', 'sales', 'payments', 'appointments'])

// ─────────────────────────────────────────────────────────────────────────────
// Sales Report: GET /exports/report/sales
//   ?format=csv|excel|pdf|json
//   &dateFrom=YYYY-MM-DD &dateTo=YYYY-MM-DD   (custom range)
//   &month=1-12 &year=YYYY                    (month picker — used when no range)
//   &status=In Progress,Completed/Released…   (comma-separated)
//   &columns=date,reference,customer_name,…   (comma-separated)
// ─────────────────────────────────────────────────────────────────────────────
const REPORT_COLUMN_DEFS = [
  { key: 'date',            label: 'Date' },
  { key: 'reference',       label: 'Reference No.' },
  { key: 'customer_name',   label: 'Customer Name' },
  { key: 'customer_id',     label: 'Customer ID' },
  { key: 'services',        label: 'Service / Description' },
  { key: 'vehicle_make',    label: 'Vehicle Make' },
  { key: 'vehicle_model',   label: 'Vehicle Model' },
  { key: 'vehicle_variant', label: 'Vehicle Variant' },
  { key: 'vehicle_plate',   label: 'Plate Number' },
  { key: 'amount_subtotal', label: 'Subtotal' },
  { key: 'amount_discount', label: 'Discount' },
  { key: 'amount_total',    label: 'Total Amount' },
  { key: 'amount_paid',     label: 'Amount Paid' },
  { key: 'amount_balance',  label: 'Outstanding Balance' },
  { key: 'payment_status',  label: 'Payment Status' },
  { key: 'status',          label: 'Workflow Status' },
  { key: 'staff',           label: 'Created By' },
]
const DEFAULT_COLUMNS = ['date','reference','customer_name','services','vehicle_plate','amount_total','payment_status','status']

const fmtAmt   = (v) => Number(v || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })
const fmtAmtRaw = (v) => Number(v || 0)

const buildReportRows = (rows, columns) => {
  const colMap = {
    date:            (r) => r.created_at ? new Date(r.created_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: '2-digit' }) : '',
    reference:       (r) => r.reference_no || '',
    customer_name:   (r) => r.customer_name || '',
    customer_id:     (r) => String(r.customer_id || ''),
    services:        (r) => r.services || '',
    vehicle_make:    (r) => r.make || '',
    vehicle_model:   (r) => r.model || '',
    vehicle_variant: (r) => r.variant || '',
    vehicle_plate:   (r) => r.plate_number || '',
    amount_subtotal: (r) => fmtAmt(Number(r.total_amount || 0) + Number(r.discount_amount || 0)),
    amount_discount: (r) => fmtAmt(r.discount_amount),
    amount_total:    (r) => fmtAmt(r.total_amount),
    amount_paid:     (r) => fmtAmt(r.total_paid),
    amount_balance:  (r) => fmtAmt(r.outstanding_balance),
    payment_status:  (r) => r.payment_status || '',
    status:          (r) => r.workflow_status || '',
    staff:           (r) => r.created_by || '',
  }
  return rows.map((r) => {
    const obj = {}
    for (const col of columns) {
      if (colMap[col]) obj[col] = colMap[col](r)
    }
    return obj
  })
}

router.get(
  '/report/sales',
  asyncHandler(async (req, res) => {
    const format   = String(req.query.format  || 'json').toLowerCase()
    const dateFrom = String(req.query.dateFrom || '').trim()
    const dateTo   = String(req.query.dateTo   || '').trim()
    const month    = req.query.month ? Number(req.query.month) : null
    const year     = req.query.year  ? Number(req.query.year)  : null
    const statuses = req.query.status  ? String(req.query.status).split(',').map(s => s.trim()).filter(Boolean) : []
    const columns  = req.query.columns ? String(req.query.columns).split(',').map(s => s.trim()).filter(Boolean) : DEFAULT_COLUMNS

    const conditions = []
    const values = []
    let idx = 1

    if (dateFrom) {
      conditions.push(`q.created_at >= $${idx}::date`)
      values.push(dateFrom); idx++
    }
    if (dateTo) {
      conditions.push(`q.created_at < ($${idx}::date + INTERVAL '1 day')`)
      values.push(dateTo); idx++
    }
    if (!dateFrom && !dateTo && month && year) {
      conditions.push(`EXTRACT(MONTH FROM q.created_at) = $${idx}`)
      values.push(month); idx++
      conditions.push(`EXTRACT(YEAR FROM q.created_at) = $${idx}`)
      values.push(year); idx++
    }
    if (statuses.length) {
      const placeholders = statuses.map((_, i) => `$${idx + i}`).join(', ')
      conditions.push(`q.status IN (${placeholders})`)
      values.push(...statuses)
      idx += statuses.length
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const { rows } = await db.query(
      `SELECT
              q.id,
              q.quotation_no                                            AS reference_no,
              'Quotation'                                               AS doc_type,
              q.status                                                  AS workflow_status,
              q.created_at,
              q.total_amount,
              0                                                         AS discount_amount,
              q.created_by,
              c.id                                                      AS customer_id,
              c.full_name                                               AS customer_name,
              c.mobile                                                  AS customer_mobile,
              v.plate_number,
              v.make,
              v.model,
              COALESCE(v.variant, '')                                   AS variant,
              v.year                                                    AS vehicle_year,
              COALESCE(qps.total_paid, 0)::NUMERIC                     AS total_paid,
              COALESCE(qps.outstanding_balance, q.total_amount)::NUMERIC AS outstanding_balance,
              COALESCE(qps.payment_status, 'UNPAID')                   AS payment_status,
              COALESCE(
                (SELECT STRING_AGG(svc->>'name', ' | ')
                 FROM jsonb_array_elements(
                   CASE jsonb_typeof(q.services)
                     WHEN 'array' THEN q.services
                     ELSE '[]'::jsonb
                   END
                 ) AS svc
                 WHERE svc->>'name' IS NOT NULL),
                'N/A'
              )                                                         AS services
       FROM quotations q
       JOIN customers c ON c.id = q.customer_id
       JOIN vehicles v  ON v.id  = q.vehicle_id
       LEFT JOIN quotation_payment_summary qps ON qps.quotation_id = q.id
       ${whereClause}
       ORDER BY q.created_at DESC
       LIMIT 2000`,
      values,
    )

    // Totals for summary row
    const grandTotal    = rows.reduce((s, r) => s + fmtAmtRaw(r.total_amount), 0)
    const grandPaid     = rows.reduce((s, r) => s + fmtAmtRaw(r.total_paid), 0)
    const grandBalance  = rows.reduce((s, r) => s + fmtAmtRaw(r.outstanding_balance), 0)

    // ── JSON preview ────────────────────────────────────────────────────────
    if (format === 'json') {
      return res.json({
        columns,
        rows: buildReportRows(rows.slice(0, 10), columns),
        total: rows.length,
        summary: { grandTotal, grandPaid, grandBalance },
      })
    }

    const reportRows = buildReportRows(rows, columns)
    const colDefs    = REPORT_COLUMN_DEFS.filter(d => columns.includes(d.key))
    const headers    = colDefs.map(d => d.label)
    const now        = new Date().toLocaleString('en-PH')
    const periodLabel = dateFrom && dateTo
      ? `${dateFrom} to ${dateTo}`
      : month && year
        ? `${new Date(year, month - 1).toLocaleString('en-PH', { month: 'long', year: 'numeric' })}`
        : 'All Time'

    // ── CSV ──────────────────────────────────────────────────────────────────
    if (format === 'csv') {
      const sheetData = [
        [`MasterAuto - Sales Report`, '', '', '', `Generated: ${now}`],
        [`Period: ${periodLabel}`, '', '', '', `${rows.length} record(s)`],
        [],
        headers,
        ...reportRows.map(r => colDefs.map(d => r[d.key] ?? '')),
        [],
        ['', '', '', 'Grand Total:', fmtAmt(grandTotal)],
        ['', '', '', 'Total Paid:',  fmtAmt(grandPaid)],
        ['', '', '', 'Outstanding:', fmtAmt(grandBalance)],
      ]
      const worksheet = XLSX.utils.aoa_to_sheet(sheetData)
      const workbook  = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Sales Report')
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'csv' })
      res.setHeader('Content-Type', 'text/csv')
      res.setHeader('Content-Disposition', `attachment; filename=sales-report-${Date.now()}.csv`)
      return res.send(buffer)
    }

    // ── Excel (styled) ───────────────────────────────────────────────────────
    if (format === 'excel') {
      const ExcelJS = require('exceljs')
      const wb = new ExcelJS.Workbook()
      wb.creator = 'MasterAuto'
      wb.created = new Date()

      const ws = wb.addWorksheet('Sales Report', {
        pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
      })

      const numCols = colDefs.length

      // ── Column width map ──────────────────────────────────────────────────
      const COL_WIDTHS = {
        date: 14, reference: 17, customer_name: 24, customer_id: 12,
        services: 30, vehicle_make: 14, vehicle_model: 14, vehicle_variant: 14,
        vehicle_plate: 14, amount_subtotal: 15, amount_discount: 13,
        amount_total: 15, amount_paid: 15, amount_balance: 18,
        payment_status: 15, status: 18, staff: 14,
      }
      ws.columns = colDefs.map(d => ({ key: d.key, width: COL_WIDTHS[d.key] || 16 }))

      // ── Helper — apply border to a cell ──────────────────────────────────
      const hairBorder  = { style: 'hair',  color: { argb: 'FFD1D5DB' } }
      const thinBorder  = { style: 'thin',  color: { argb: 'FFD1D5DB' } }
      const applyBorder = (cell, b) => { cell.border = { top: b, bottom: b, left: b, right: b } }

      // ── Row 1: Title ──────────────────────────────────────────────────────
      if (numCols > 1) ws.mergeCells(1, 1, 1, numCols > 2 ? numCols - 1 : 1)
      const titleCell = ws.getCell(1, 1)
      titleCell.value = 'MasterAuto \u2013 Sales'
      titleCell.font      = { name: 'Calibri', bold: true, size: 16, color: { argb: 'FF0F172A' } }
      titleCell.alignment = { vertical: 'middle' }
      ws.getRow(1).height = 30

      if (numCols > 1) {
        const genCell = ws.getCell(1, numCols)
        genCell.value     = `Generated: ${now}`
        genCell.font      = { name: 'Calibri', size: 9, color: { argb: 'FF64748B' } }
        genCell.alignment = { horizontal: 'right', vertical: 'middle' }
      }

      // ── Row 2: Period + count ─────────────────────────────────────────────
      if (numCols > 1) ws.mergeCells(2, 1, 2, numCols > 2 ? numCols - 1 : 1)
      const periodCell = ws.getCell(2, 1)
      periodCell.value     = `Period: ${periodLabel}`
      periodCell.font      = { name: 'Calibri', size: 10, color: { argb: 'FF475569' } }
      periodCell.alignment = { vertical: 'middle' }
      ws.getRow(2).height = 20

      if (numCols > 1) {
        const cntCell = ws.getCell(2, numCols)
        cntCell.value     = `${rows.length} record(s)`
        cntCell.font      = { name: 'Calibri', size: 9, color: { argb: 'FF64748B' } }
        cntCell.alignment = { horizontal: 'right', vertical: 'middle' }
      }

      // ── Row 3: Spacer ─────────────────────────────────────────────────────
      ws.getRow(3).height = 8

      // ── Row 4: Header ─────────────────────────────────────────────────────
      const HDR_ROW = 4
      const hdrRow  = ws.getRow(HDR_ROW)
      hdrRow.height = 22
      colDefs.forEach((d, i) => {
        const cell = hdrRow.getCell(i + 1)
        cell.value     = d.label
        cell.font      = { name: 'Calibri', bold: true, size: 9.5, color: { argb: 'FFFFFFFF' } }
        cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } }
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: false }
        cell.border    = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder }
      })

      // ── Numeric column set & payment status colors ────────────────────────
      const NUMERIC_COLS = new Set([
        'amount_subtotal', 'amount_discount', 'amount_total',
        'amount_paid', 'amount_balance',
      ])
      const RAW_KEY = {
        amount_subtotal: r => Number(r.total_amount   || 0),
        amount_total:    r => Number(r.total_amount   || 0),
        amount_paid:     r => Number(r.total_paid     || 0),
        amount_balance:  r => Number(r.outstanding_balance || 0),
        amount_discount: r => Number(r.discount_amount || 0),
        amount_subtotal: r => Number(r.total_amount   || 0) + Number(r.discount_amount || 0),
      }
      const PMT_COLORS = {
        PAID:     { bg: 'FF16A34A', fg: 'FFFFFFFF' },
        PARTIAL:  { bg: 'FFEA580C', fg: 'FFFFFFFF' },
        UNPAID:   { bg: 'FFEA580C', fg: 'FFFFFFFF' },
        OVERPAID: { bg: 'FF7C3AED', fg: 'FFFFFFFF' },
      }

      // ── Data rows ─────────────────────────────────────────────────────────
      rows.forEach((rawRow, ri) => {
        const fmtRow = reportRows[ri]
        const rowIdx = HDR_ROW + 1 + ri
        const exRow  = ws.getRow(rowIdx)
        exRow.height = 18
        const rowBg  = ri % 2 === 1 ? 'FFF1F5F9' : 'FFFFFFFF'

        colDefs.forEach((d, ci) => {
          const cell = exRow.getCell(ci + 1)
          applyBorder(cell, hairBorder)

          if (d.key === 'payment_status') {
            const val    = rawRow.payment_status || ''
            const colors = PMT_COLORS[val] || { bg: 'FF94A3B8', fg: 'FFFFFFFF' }
            cell.value     = val
            cell.font      = { name: 'Calibri', bold: true, size: 9, color: { argb: colors.fg } }
            cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.bg } }
            cell.alignment = { horizontal: 'center', vertical: 'middle' }
          } else if (NUMERIC_COLS.has(d.key)) {
            const getter = RAW_KEY[d.key]
            cell.value     = getter ? getter(rawRow) : 0
            cell.numFmt    = '#,##0.00'
            cell.font      = { name: 'Calibri', size: 9, color: { argb: 'FF1E293B' } }
            cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } }
            cell.alignment = { horizontal: 'right', vertical: 'middle' }
          } else {
            cell.value     = fmtRow[d.key] ?? ''
            cell.font      = { name: 'Calibri', size: 9, color: { argb: 'FF1E293B' } }
            cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } }
            cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true }
          }
        })
      })

      // ── Summary rows ──────────────────────────────────────────────────────
      const SUM_START = HDR_ROW + 1 + rows.length + 1
      const mergeTo   = numCols > 2 ? numCols - 1 : 1

      const addSumRow = (rowIdx, label, value, labelArgb, valueArgb) => {
        const row = ws.getRow(rowIdx)
        row.height = 20
        if (numCols > 2) ws.mergeCells(rowIdx, 1, rowIdx, mergeTo)
        const lc = row.getCell(1)
        lc.value     = label
        lc.font      = { name: 'Calibri', bold: true, size: 10.5, color: { argb: 'FF0F172A' } }
        lc.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: labelArgb } }
        lc.alignment = { horizontal: 'right', vertical: 'middle' }
        lc.border    = { top: thinBorder, bottom: thinBorder, left: hairBorder, right: hairBorder }

        const vc = row.getCell(numCols)
        vc.value     = Number(value)
        vc.numFmt    = '\u20b1#,##0.00'
        vc.font      = { name: 'Calibri', bold: true, size: 10.5, color: { argb: valueArgb } }
        vc.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: labelArgb } }
        vc.alignment = { horizontal: 'right', vertical: 'middle' }
        vc.border    = { top: thinBorder, bottom: thinBorder, left: hairBorder, right: thinBorder }

        // Fill in-between merged cells with same bg
        for (let c = 2; c < numCols; c++) {
          const mc = row.getCell(c)
          mc.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: labelArgb } }
          mc.border = { top: thinBorder, bottom: thinBorder }
        }
      }

      addSumRow(SUM_START,     'Grand Total:', grandTotal,   'FFF8FAFC', 'FF0F172A')
      addSumRow(SUM_START + 1, 'Total Paid:',  grandPaid,    'FFF0FDF4', 'FF16A34A')
      addSumRow(SUM_START + 2, 'Outstanding:', grandBalance, 'FFFEF9C3', 'FFB45309')

      // ── Freeze panes below header ─────────────────────────────────────────
      ws.views = [{ state: 'frozen', ySplit: HDR_ROW, activeCell: `A${HDR_ROW + 1}` }]

      const buffer = await wb.xlsx.writeBuffer()
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      res.setHeader('Content-Disposition', `attachment; filename=sales-report-${Date.now()}.xlsx`)
      return res.send(buffer)
    }

    // ── PDF ──────────────────────────────────────────────────────────────────
    if (format === 'pdf') {
      const fontPaths = [
        '/usr/share/fonts/dejavu/DejaVuSans.ttf',
        '/usr/share/fonts/ttf-dejavu/DejaVuSans.ttf',
        'C:\\Windows\\Fonts\\arial.ttf',
        'C:\\Windows\\Fonts\\calibri.ttf',
      ]
      const fontPath = fontPaths.find(p => { try { return fs.existsSync(p) } catch { return false } })
      const doc = new PDFDocument({ margin: 36, size: 'A4', layout: 'landscape' })
      if (fontPath) {
        doc.registerFont('UniReg', fontPath)
        const boldPath = fontPath.replace('DejaVuSans.ttf', 'DejaVuSans-Bold.ttf')
        doc.registerFont('UniBold', (boldPath !== fontPath && fs.existsSync(boldPath)) ? boldPath : fontPath)
      }
      const fReg  = fontPath ? 'UniReg'  : 'Helvetica'
      const fBold = fontPath ? 'UniBold' : 'Helvetica-Bold'

      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', `attachment; filename=sales-report-${Date.now()}.pdf`)
      doc.pipe(res)

      const PW = doc.page.width - 72   // usable width

      // Header
      doc.fontSize(16).font(fBold).text('MasterAuto', 36, 32, { continued: true })
      doc.fontSize(10).font(fReg).fillColor('#888888').text('  ·  Sales Report', { continued: false })
      doc.fillColor('#000000')
      doc.fontSize(8).font(fReg).text(`Period: ${periodLabel}   |   ${rows.length} record(s)   |   Generated: ${now}`, 36, doc.y + 2)
      doc.moveDown(0.3)
      doc.moveTo(36, doc.y).lineTo(36 + PW, doc.y).strokeColor('#cccccc').lineWidth(0.5).stroke()
      doc.moveDown(0.4)

      // Column widths distributed proportionally
      const COL_FLEX = {
        date: 1.1, reference: 1.3, customer_name: 1.8, customer_id: 0.8,
        services: 2.4, vehicle_make: 1, vehicle_model: 1, vehicle_variant: 1, vehicle_plate: 1,
        amount_subtotal: 1.1, amount_discount: 1, amount_total: 1.1, amount_paid: 1.1, amount_balance: 1.2,
        payment_status: 1.3, status: 1.4, staff: 1.1,
      }
      const totalFlex  = colDefs.reduce((s, d) => s + (COL_FLEX[d.key] || 1), 0)
      const unitW      = PW / totalFlex
      const colWidths  = colDefs.map(d => (COL_FLEX[d.key] || 1) * unitW)

      const drawRow = (cells, y, bold, bgColor) => {
        if (bgColor) {
          doc.rect(36, y - 2, PW, 13).fillColor(bgColor).fill()
          doc.fillColor('#000000')
        }
        const f = bold ? fBold : fReg
        doc.font(f).fontSize(bold ? 7.5 : 7)
        let cx = 36
        cells.forEach((cell, i) => {
          doc.text(String(cell ?? ''), cx + 2, y, { width: colWidths[i] - 4, ellipsis: true, lineBreak: false })
          cx += colWidths[i]
        })
      }

      // Header row
      const headerY = doc.y
      drawRow(headers, headerY, true, '#e8edf5')
      doc.moveDown(0.1)
      doc.moveTo(36, headerY + 14).lineTo(36 + PW, headerY + 14).strokeColor('#aaaaaa').lineWidth(0.5).stroke()
      doc.y = headerY + 16

      // Data rows
      let rowNum = 0
      for (const r of reportRows) {
        if (doc.y > doc.page.height - 80) {
          doc.addPage({ size: 'A4', layout: 'landscape', margin: 36 })
          doc.y = 36
          drawRow(headers, doc.y, true, '#e8edf5')
          doc.y += 16
        }
        const bg = rowNum % 2 === 1 ? '#f7f8fa' : null
        drawRow(colDefs.map(d => r[d.key] ?? ''), doc.y, false, bg)
        doc.y += 13
        rowNum++
      }

      // Summary
      doc.moveDown(0.6)
      doc.moveTo(36, doc.y).lineTo(36 + PW, doc.y).strokeColor('#cccccc').lineWidth(0.5).stroke()
      doc.moveDown(0.4)
      doc.font(fBold).fontSize(8)
      doc.text(`Grand Total: ₱${fmtAmt(grandTotal)}   |   Total Paid: ₱${fmtAmt(grandPaid)}   |   Outstanding: ₱${fmtAmt(grandBalance)}`, 36, doc.y, { align: 'right', width: PW })

      doc.end()
      return undefined
    }

    return res.status(400).json({ message: 'Invalid format. Use csv, excel, pdf, or json.' })
  }),
)

router.get(
  '/:table/csv',
  asyncHandler(async (req, res) => {
    const { table } = req.params
    if (!allowedTables.has(table)) {
      return res.status(400).json({ message: 'Invalid export table' })
    }

    const { rows } = await db.query(`SELECT * FROM ${table} ORDER BY id DESC LIMIT 500`)
    const worksheet = XLSX.utils.json_to_sheet(rows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, table)
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'csv' })

    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', `attachment; filename=${table}.csv`)
    return res.send(buffer)
  }),
)

router.get(
  '/:table/excel',
  asyncHandler(async (req, res) => {
    const { table } = req.params
    if (!allowedTables.has(table)) {
      return res.status(400).json({ message: 'Invalid export table' })
    }

    const { rows } = await db.query(`SELECT * FROM ${table} ORDER BY id DESC LIMIT 500`)
    const worksheet = XLSX.utils.json_to_sheet(rows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, table)
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
    res.setHeader('Content-Disposition', `attachment; filename=${table}.xlsx`)
    return res.send(buffer)
  }),
)

router.get(
  '/sales/:id/:type/pdf',
  asyncHandler(async (req, res) => {
    const { id, type } = req.params
    const allowedTypes = new Set(['quotation', 'job-order', 'invoice'])

    if (!allowedTypes.has(type)) {
      return res.status(400).json({ message: 'Invalid PDF type' })
    }

    const [saleResult, itemsResult] = await Promise.all([
      db.query(
        `SELECT s.*, c.full_name, c.mobile, v.plate_number, v.make, v.model, v.color, v.year
         FROM sales s
         JOIN customers c ON c.id = s.customer_id
         JOIN vehicles v ON v.id = s.vehicle_id
         WHERE s.id = $1`,
        [id],
      ),
      db.query(
        `SELECT item_name, item_type, qty, price FROM sale_items WHERE sale_id = $1 ORDER BY id ASC`,
        [id],
      ),
    ])

    if (!saleResult.rows.length) {
      return res.status(404).json({ message: 'Record not found' })
    }

    const record = saleResult.rows[0]
    const lineItems = itemsResult.rows

    const doc = new PDFDocument({ margin: 48 })

    // Register a Unicode font so the peso sign (₱) renders correctly.
    // Try Linux/Docker path first (DejaVu installed via apk), then Windows Arial.
    const os = require('os')
    const fs = require('fs')
    const fontPaths = [
      '/usr/share/fonts/dejavu/DejaVuSans.ttf',
      '/usr/share/fonts/ttf-dejavu/DejaVuSans.ttf',
      'C:\\Windows\\Fonts\\arial.ttf',
      'C:\\Windows\\Fonts\\calibri.ttf',
    ]
    const fontPath = fontPaths.find(p => { try { return fs.existsSync(p) } catch { return false } })
    const FONT_REG  = fontPath || 'Helvetica'
    const FONT_BOLD = fontPath
      ? fontPaths.find(p => p.includes('DejaVuSans-Bold') && fs.existsSync(p))
        || fontPath.replace('DejaVuSans.ttf', 'DejaVuSans-Bold.ttf')
        || fontPath
      : 'Helvetica-Bold'
    if (fontPath) {
      doc.registerFont('UniReg',  fontPath)
      const boldPath = FONT_BOLD !== fontPath && fs.existsSync(FONT_BOLD) ? FONT_BOLD : fontPath
      doc.registerFont('UniBold', boldPath)
    }
    const fReg  = fontPath ? 'UniReg'  : 'Helvetica'
    const fBold = fontPath ? 'UniBold' : 'Helvetica-Bold'

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `inline; filename=${type}-${record.reference_no}.pdf`)
    doc.pipe(res)

    // ── Header ────────────────────────────────────────────────
    doc.fontSize(22).font(fBold).text('MasterAuto', { continued: true })
    doc.fontSize(14).font(fReg).text(`  •  ${type.replace('-', ' ').toUpperCase()}`, { align: 'left' })
    doc.moveDown(0.3)
    doc.moveTo(48, doc.y).lineTo(doc.page.width - 48, doc.y).strokeColor('#cccccc').stroke()
    doc.moveDown(0.5)

    // ── Sale Info ─────────────────────────────────────────────
    doc.fontSize(10).font(fReg)
    doc.text(`Reference No:   ${record.reference_no}`)
    doc.text(`Date:           ${new Date(record.created_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}`)
    doc.moveDown(0.5)

    // ── Customer & Vehicle ────────────────────────────────────
    const colLeft = 48
    const colRight = doc.page.width / 2 + 10
    const startY = doc.y

    doc.font(fBold).text('CUSTOMER', colLeft, startY)
    doc.font(fReg)
    doc.text(record.full_name, colLeft, doc.y)
    if (record.mobile) doc.text(record.mobile, colLeft, doc.y)

    doc.font(fBold).text('VEHICLE', colRight, startY)
    doc.font(fReg)
    const vehicleDesc = [record.year, record.make, record.model, record.color].filter(Boolean).join(' ')
    doc.text(vehicleDesc || '—', colRight, startY + 14)
    doc.text(`Plate: ${record.plate_number}`, colRight, doc.y)

    doc.moveDown(2)
    doc.moveTo(48, doc.y).lineTo(doc.page.width - 48, doc.y).strokeColor('#cccccc').stroke()
    doc.moveDown(0.6)

    // ── Line Items Table ──────────────────────────────────────
    const tableLeft = 48
    const tableRight = doc.page.width - 48
    // Total usable width ≈ 499px (A4) or 516px (Letter). Widths sum to 496.
    const colWidths = { no: 24, item: 190, type: 78, qty: 38, price: 83, subtotal: 83 }
    const fmt = (n) => `₱${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`

    // Table header
    doc.font(fBold).fontSize(9)
    const headerY = doc.y
    let cx = tableLeft
    doc.text('#',          cx, headerY, { width: colWidths.no, align: 'center' })
    cx += colWidths.no
    doc.text('ITEM / SERVICE', cx, headerY, { width: colWidths.item })
    cx += colWidths.item
    doc.text('TYPE',       cx, headerY, { width: colWidths.type })
    cx += colWidths.type
    doc.text('QTY',        cx, headerY, { width: colWidths.qty, align: 'center' })
    cx += colWidths.qty
    doc.text('UNIT PRICE', cx, headerY, { width: colWidths.price, align: 'right' })
    cx += colWidths.price
    doc.text('SUBTOTAL',   cx, headerY, { width: colWidths.subtotal, align: 'right' })

    doc.moveDown(0.2)
    doc.moveTo(tableLeft, doc.y).lineTo(tableRight, doc.y).strokeColor('#999999').stroke()
    doc.moveDown(0.4)

    // Rows
    doc.font(fReg).fontSize(10)

    // Use line items if available; fall back to service_package summary row
    const saleRows = lineItems.length
      ? lineItems
      : [{ item_name: record.service_package || '—', item_type: '', qty: 1, price: record.total_amount }]

    let computedTotal = 0
    for (let i = 0; i < saleRows.length; i++) {
      const item = saleRows[i]
      const subtotal = Number(item.qty || 1) * Number(item.price || 0)
      computedTotal += subtotal
      const rowY = doc.y
      cx = tableLeft
      doc.text(String(i + 1), cx, rowY, { width: colWidths.no, align: 'center' })
      cx += colWidths.no
      doc.text(item.item_name || '—', cx, rowY, { width: colWidths.item })
      cx += colWidths.item
      doc.text(item.item_type || '', cx, rowY, { width: colWidths.type, ellipsis: true })
      cx += colWidths.type
      doc.text(String(item.qty ?? 1), cx, rowY, { width: colWidths.qty, align: 'center' })
      cx += colWidths.qty
      doc.text(fmt(item.price), cx, rowY, { width: colWidths.price, align: 'right' })
      cx += colWidths.price
      doc.text(fmt(subtotal), cx, rowY, { width: colWidths.subtotal, align: 'right' })
      doc.moveDown(0.5)
    }

    // Total row
    doc.moveTo(tableLeft, doc.y).lineTo(tableRight, doc.y).strokeColor('#999999').stroke()
    doc.moveDown(0.4)
    const totalAmt = Number(record.total_amount) || computedTotal
    doc.font(fBold).fontSize(11)
    doc.text(`TOTAL: ${fmt(totalAmt)}`, tableLeft, doc.y, { align: 'right', width: tableRight - tableLeft })

    doc.moveDown(0.8)
    doc.moveTo(48, doc.y).lineTo(doc.page.width - 48, doc.y).strokeColor('#cccccc').stroke()
    doc.moveDown(0.5)

    // ── Footer Info ───────────────────────────────────────────
    doc.font(fReg).fontSize(9)
    doc.text(`Status: ${record.workflow_status || '—'}`)
    doc.text(`Generated: ${new Date().toLocaleString('en-PH')}`)

    doc.end()
    return undefined
  }),
)

module.exports = router

