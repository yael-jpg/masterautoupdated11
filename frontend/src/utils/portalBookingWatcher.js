export function createPortalBookingWatchState() {
  return {
    appointmentsInitialized: false,
    lastSeenIso: null,
    seenIds: new Set(),
    quotationsInitialized: false,
    lastSeenQuotationIso: null,
    seenQuotationIds: new Set(),
    cancellationsInitialized: false,
    lastSeenCancelledIso: null,
    seenCancelledIds: new Set(),
    cancelRequestsInitialized: false,
    lastSeenCancelRequestIso: null,
    seenCancelRequestIds: new Set(),
  }
}

function toIso(value) {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

/**
 * Computes which portal bookings are new compared to the previous watch state.
 *
 * Behavior:
 * - First call (initialized=false): establishes a baseline and returns no new rows
 * - Subsequent calls: returns portal rows newer than lastSeenIso, plus any rows
 *   with the same created_at as lastSeenIso that weren't seen before.
 */
export function computeNewPortalBookings(prevState, appointmentRows, now = new Date()) {
  const prev = prevState || createPortalBookingWatchState()

  const rows = Array.isArray(appointmentRows) ? appointmentRows : []
  const portalRows = rows.filter((r) => {
    if (!r) return false
    const source = String(r.booking_source || '').toLowerCase()
    if (source === 'portal') return true
    const notes = String(r.notes || '')
    return notes.includes('[PORTAL BOOKING REQUEST]')
  })

  // Normalize to comparable ISO timestamps; ignore rows without created_at
  const portalWithIso = portalRows
    .map((r) => ({ row: r, createdIso: toIso(r.created_at) }))
    .filter((x) => x.createdIso)

  if (!prev.appointmentsInitialized) {
    // On first load establish a baseline, but surface *very recent* portal bookings
    // so staff don't miss a request created just before login/refresh.
    const graceMs = 10 * 60 * 1000
    const graceCutoffIso = new Date(now.getTime() - graceMs).toISOString()

    const recentRows = portalWithIso
      .filter((x) => x.createdIso >= graceCutoffIso)
      .sort((a, b) => new Date(a.createdIso) - new Date(b.createdIso))
      .map((x) => x.row)

    const latest = portalWithIso
      .slice()
      .sort((a, b) => new Date(b.createdIso) - new Date(a.createdIso))[0]

    const nextState = {
      ...prev,
      appointmentsInitialized: true,
      lastSeenIso: latest?.createdIso || now.toISOString(),
      seenIds: new Set(portalRows.map((r) => r.id).filter((id) => id !== undefined && id !== null)),
    }

    return { nextState, newRows: recentRows }
  }

  const lastSeenIso = prev.lastSeenIso || now.toISOString()
  const seenIds = prev.seenIds instanceof Set ? new Set(prev.seenIds) : new Set()

  const newRows = portalWithIso
    .filter(({ row, createdIso }) => {
      if (createdIso > lastSeenIso) return true
      if (createdIso === lastSeenIso && !seenIds.has(row.id)) return true
      return false
    })
    .sort((a, b) => new Date(a.createdIso) - new Date(b.createdIso))
    .map((x) => x.row)

  if (newRows.length === 0) {
    return {
      nextState: {
        ...prev,
        appointmentsInitialized: true,
        lastSeenIso,
        seenIds,
      },
      newRows: [],
    }
  }

  newRows.forEach((r) => {
    if (r?.id !== undefined && r?.id !== null) seenIds.add(r.id)
  })

  const newestIso = toIso(newRows[newRows.length - 1]?.created_at) || lastSeenIso

  return {
    nextState: {
      ...prev,
      appointmentsInitialized: true,
      lastSeenIso: newestIso,
      seenIds,
    },
    newRows,
  }
}

/**
 * Computes which portal booking-requests (quotations) are new.
 *
 * Portal booking flow creates quotations with:
 * - created_by = NULL
 * - notes containing '[PORTAL BOOKING REQUEST]'
 */
export function computeNewPortalQuotationBookings(prevState, quotationRows, now = new Date()) {
  const prev = prevState || createPortalBookingWatchState()

  const rows = Array.isArray(quotationRows) ? quotationRows : []
  const portalRows = rows.filter((r) => {
    if (!r) return false
    const notes = String(r.notes || '')
    const isPortalMarker = notes.includes('[PORTAL BOOKING REQUEST]')
    const createdByNull = r.created_by === null || r.created_by === undefined
    return isPortalMarker && createdByNull
  })

  const withIso = portalRows
    .map((r) => ({ row: r, createdIso: toIso(r.created_at) }))
    .filter((x) => x.createdIso)

  if (!prev.quotationsInitialized) {
    // On first load we establish a baseline to avoid spamming old rows.
    // However, we still surface *very recent* portal requests so admins/staff
    // don't miss a new request that happened right before they opened the app.
    const graceMs = 2 * 60 * 1000
    const graceCutoffIso = new Date(now.getTime() - graceMs).toISOString()

    const recentRows = withIso
      .filter((x) => x.createdIso >= graceCutoffIso)
      .sort((a, b) => new Date(a.createdIso) - new Date(b.createdIso))
      .map((x) => x.row)

    const latest = withIso
      .slice()
      .sort((a, b) => new Date(b.createdIso) - new Date(a.createdIso))[0]

    const nextState = {
      ...prev,
      quotationsInitialized: true,
      lastSeenQuotationIso: latest?.createdIso || now.toISOString(),
      seenQuotationIds: new Set(portalRows.map((r) => r.id).filter((id) => id !== undefined && id !== null)),
    }

    return { nextState, newRows: recentRows }
  }

  const lastSeenQuotationIso = prev.lastSeenQuotationIso || now.toISOString()
  const seenQuotationIds = prev.seenQuotationIds instanceof Set ? new Set(prev.seenQuotationIds) : new Set()

  const newRows = withIso
    .filter(({ row, createdIso }) => {
      if (createdIso > lastSeenQuotationIso) return true
      if (createdIso === lastSeenQuotationIso && !seenQuotationIds.has(row.id)) return true
      return false
    })
    .sort((a, b) => new Date(a.createdIso) - new Date(b.createdIso))
    .map((x) => x.row)

  if (newRows.length === 0) {
    return {
      nextState: {
        ...prev,
        quotationsInitialized: true,
        lastSeenQuotationIso,
        seenQuotationIds,
      },
      newRows: [],
    }
  }

  newRows.forEach((r) => {
    if (r?.id !== undefined && r?.id !== null) seenQuotationIds.add(r.id)
  })

  const newestIso = toIso(newRows[newRows.length - 1]?.created_at) || lastSeenQuotationIso

  return {
    nextState: {
      ...prev,
      quotationsInitialized: true,
      lastSeenQuotationIso: newestIso,
      seenQuotationIds,
    },
    newRows,
  }
}

/**
 * Computes which portal bookings have been newly cancelled compared to the previous watch state.
 *
 * Uses `cancelled_at` because `created_at` does not change on cancellation.
 *
 * Behavior mirrors computeNewPortalBookings:
 * - First call (initialized=false): establishes a baseline and returns no rows
 * - Subsequent calls: returns portal rows newer than lastSeenCancelledIso, plus
 *   any rows with the same cancelled_at that weren't seen before.
 */
export function computeNewPortalCancellations(prevState, appointmentRows, now = new Date()) {
  const prev = prevState || createPortalBookingWatchState()

  const rows = Array.isArray(appointmentRows) ? appointmentRows : []
  const portalCancelled = rows
    .filter((r) => r && r.booking_source === 'portal' && String(r.status || '').toLowerCase() === 'cancelled')
    .map((r) => ({ row: r, cancelledIso: toIso(r.cancelled_at) }))
    .filter((x) => x.cancelledIso)

  if (!prev.cancellationsInitialized) {
    const latest = portalCancelled
      .slice()
      .sort((a, b) => new Date(b.cancelledIso) - new Date(a.cancelledIso))[0]

    return {
      nextState: {
        ...prev,
        cancellationsInitialized: true,
        lastSeenCancelledIso: latest?.cancelledIso || now.toISOString(),
        seenCancelledIds: new Set(portalCancelled.map((x) => x.row?.id).filter((id) => id !== undefined && id !== null)),
      },
      newRows: [],
    }
  }

  const lastSeenCancelledIso = prev.lastSeenCancelledIso || now.toISOString()
  const seenCancelledIds = prev.seenCancelledIds instanceof Set ? new Set(prev.seenCancelledIds) : new Set()

  const newRows = portalCancelled
    .filter(({ row, cancelledIso }) => {
      if (cancelledIso > lastSeenCancelledIso) return true
      if (cancelledIso === lastSeenCancelledIso && !seenCancelledIds.has(row.id)) return true
      return false
    })
    .sort((a, b) => new Date(a.cancelledIso) - new Date(b.cancelledIso))
    .map((x) => x.row)

  if (newRows.length === 0) {
    return {
      nextState: {
        ...prev,
        cancellationsInitialized: true,
        lastSeenCancelledIso,
        seenCancelledIds,
      },
      newRows: [],
    }
  }

  newRows.forEach((r) => {
    if (r?.id !== undefined && r?.id !== null) seenCancelledIds.add(r.id)
  })

  const newestIso = toIso(newRows[newRows.length - 1]?.cancelled_at) || lastSeenCancelledIso

  return {
    nextState: {
      ...prev,
      cancellationsInitialized: true,
      lastSeenCancelledIso: newestIso,
      seenCancelledIds,
    },
    newRows,
  }
}

/**
 * Computes which portal bookings have newly requested cancellation.
 *
 * Uses `cancel_requested_at` and `cancel_request_status = 'PENDING'`.
 */
export function computeNewPortalCancellationRequests(prevState, appointmentRows, now = new Date()) {
  const prev = prevState || createPortalBookingWatchState()

  const rows = Array.isArray(appointmentRows) ? appointmentRows : []
  const portalReq = rows
    .filter((r) => r && r.booking_source === 'portal' && String(r.cancel_request_status || '').toUpperCase() === 'PENDING')
    .map((r) => ({ row: r, requestedIso: toIso(r.cancel_requested_at) }))
    .filter((x) => x.requestedIso)

  if (!prev.cancelRequestsInitialized) {
    const latest = portalReq
      .slice()
      .sort((a, b) => new Date(b.requestedIso) - new Date(a.requestedIso))[0]

    return {
      nextState: {
        ...prev,
        cancelRequestsInitialized: true,
        lastSeenCancelRequestIso: latest?.requestedIso || now.toISOString(),
        seenCancelRequestIds: new Set(portalReq.map((x) => x.row?.id).filter((id) => id !== undefined && id !== null)),
      },
      newRows: [],
    }
  }

  const lastSeenCancelRequestIso = prev.lastSeenCancelRequestIso || now.toISOString()
  const seenCancelRequestIds = prev.seenCancelRequestIds instanceof Set ? new Set(prev.seenCancelRequestIds) : new Set()

  const newRows = portalReq
    .filter(({ row, requestedIso }) => {
      if (requestedIso > lastSeenCancelRequestIso) return true
      if (requestedIso === lastSeenCancelRequestIso && !seenCancelRequestIds.has(row.id)) return true
      return false
    })
    .sort((a, b) => new Date(a.requestedIso) - new Date(b.requestedIso))
    .map((x) => x.row)

  if (newRows.length === 0) {
    return {
      nextState: {
        ...prev,
        cancelRequestsInitialized: true,
        lastSeenCancelRequestIso,
        seenCancelRequestIds,
      },
      newRows: [],
    }
  }

  newRows.forEach((r) => {
    if (r?.id !== undefined && r?.id !== null) seenCancelRequestIds.add(r.id)
  })

  const newestIso = toIso(newRows[newRows.length - 1]?.cancel_requested_at) || lastSeenCancelRequestIso

  return {
    nextState: {
      ...prev,
      cancelRequestsInitialized: true,
      lastSeenCancelRequestIso: newestIso,
      seenCancelRequestIds,
    },
    newRows,
  }
}
