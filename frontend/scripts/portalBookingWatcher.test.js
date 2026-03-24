import test from 'node:test'
import assert from 'node:assert/strict'
import {
  computeNewPortalBookings,
  computeNewPortalCancellations,
  computeNewPortalCancellationRequests,
  createPortalBookingWatchState,
} from '../src/utils/portalBookingWatcher.js'

test('baseline poll does not emit notifications', () => {
  const state = createPortalBookingWatchState()
  const rows = [
    { id: 10, booking_source: 'portal', created_at: '2026-03-21T10:00:00.000Z' },
    { id: 11, booking_source: 'portal', created_at: '2026-03-21T11:00:00.000Z' },
  ]

  const { nextState, newRows } = computeNewPortalBookings(state, rows, new Date('2026-03-21T12:00:00.000Z'))
  assert.equal(newRows.length, 0)
  assert.equal(nextState.initialized, true)
  assert.equal(nextState.lastSeenIso, '2026-03-21T11:00:00.000Z')
  assert.equal(nextState.seenIds.has(10), true)
  assert.equal(nextState.seenIds.has(11), true)
})

test('subsequent poll emits only newer portal bookings', () => {
  const state = {
    initialized: true,
    lastSeenIso: '2026-03-21T11:00:00.000Z',
    seenIds: new Set([10, 11]),
  }

  const rows = [
    { id: 12, booking_source: 'portal', created_at: '2026-03-21T11:30:00.000Z' },
    { id: 13, booking_source: 'staff', created_at: '2026-03-21T11:40:00.000Z' },
  ]

  const { nextState, newRows } = computeNewPortalBookings(state, rows, new Date('2026-03-21T12:00:00.000Z'))
  assert.deepEqual(newRows.map((r) => r.id), [12])
  assert.equal(nextState.lastSeenIso, '2026-03-21T11:30:00.000Z')
  assert.equal(nextState.seenIds.has(12), true)
})

test('same-timestamp unseen id is treated as new', () => {
  const state = {
    initialized: true,
    lastSeenIso: '2026-03-21T11:00:00.000Z',
    seenIds: new Set([10]),
  }

  const rows = [
    { id: 11, booking_source: 'portal', created_at: '2026-03-21T11:00:00.000Z' },
  ]

  const { nextState, newRows } = computeNewPortalBookings(state, rows, new Date('2026-03-21T12:00:00.000Z'))
  assert.deepEqual(newRows.map((r) => r.id), [11])
  assert.equal(nextState.lastSeenIso, '2026-03-21T11:00:00.000Z')
  assert.equal(nextState.seenIds.has(11), true)
})

test('cancellation baseline does not emit notifications', () => {
  const state = createPortalBookingWatchState()
  const rows = [
    { id: 20, booking_source: 'portal', status: 'Cancelled', cancelled_at: '2026-03-21T10:00:00.000Z' },
    { id: 21, booking_source: 'portal', status: 'Cancelled', cancelled_at: '2026-03-21T11:00:00.000Z' },
  ]

  const { nextState, newRows } = computeNewPortalCancellations(state, rows, new Date('2026-03-21T12:00:00.000Z'))
  assert.equal(newRows.length, 0)
  assert.equal(nextState.initialized, true)
  assert.equal(nextState.lastSeenCancelledIso, '2026-03-21T11:00:00.000Z')
  assert.equal(nextState.seenCancelledIds.has(20), true)
  assert.equal(nextState.seenCancelledIds.has(21), true)
})

test('subsequent poll emits only newer cancellations', () => {
  const state = {
    initialized: true,
    lastSeenIso: '2026-03-21T11:00:00.000Z',
    seenIds: new Set([10]),
    lastSeenCancelledIso: '2026-03-21T11:00:00.000Z',
    seenCancelledIds: new Set([21]),
  }

  const rows = [
    { id: 22, booking_source: 'portal', status: 'Cancelled', cancelled_at: '2026-03-21T11:30:00.000Z' },
    { id: 23, booking_source: 'staff', status: 'Cancelled', cancelled_at: '2026-03-21T11:40:00.000Z' },
  ]

  const { nextState, newRows } = computeNewPortalCancellations(state, rows, new Date('2026-03-21T12:00:00.000Z'))
  assert.deepEqual(newRows.map((r) => r.id), [22])
  assert.equal(nextState.lastSeenCancelledIso, '2026-03-21T11:30:00.000Z')
  assert.equal(nextState.seenCancelledIds.has(22), true)
})

test('cancellation-request baseline does not emit notifications', () => {
  const state = createPortalBookingWatchState()
  const rows = [
    { id: 30, booking_source: 'portal', cancel_request_status: 'PENDING', cancel_requested_at: '2026-03-21T10:00:00.000Z' },
    { id: 31, booking_source: 'portal', cancel_request_status: 'PENDING', cancel_requested_at: '2026-03-21T11:00:00.000Z' },
  ]

  const { nextState, newRows } = computeNewPortalCancellationRequests(state, rows, new Date('2026-03-21T12:00:00.000Z'))
  assert.equal(newRows.length, 0)
  assert.equal(nextState.initialized, true)
  assert.equal(nextState.lastSeenCancelRequestIso, '2026-03-21T11:00:00.000Z')
  assert.equal(nextState.seenCancelRequestIds.has(30), true)
  assert.equal(nextState.seenCancelRequestIds.has(31), true)
})

test('subsequent poll emits only newer cancellation requests', () => {
  const state = {
    initialized: true,
    lastSeenCancelRequestIso: '2026-03-21T11:00:00.000Z',
    seenCancelRequestIds: new Set([31]),
  }

  const rows = [
    { id: 32, booking_source: 'portal', cancel_request_status: 'PENDING', cancel_requested_at: '2026-03-21T11:30:00.000Z' },
    { id: 33, booking_source: 'staff', cancel_request_status: 'PENDING', cancel_requested_at: '2026-03-21T11:40:00.000Z' },
  ]

  const { nextState, newRows } = computeNewPortalCancellationRequests(state, rows, new Date('2026-03-21T12:00:00.000Z'))
  assert.deepEqual(newRows.map((r) => r.id), [32])
  assert.equal(nextState.lastSeenCancelRequestIso, '2026-03-21T11:30:00.000Z')
  assert.equal(nextState.seenCancelRequestIds.has(32), true)
})
