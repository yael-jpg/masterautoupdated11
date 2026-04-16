// Human-readable messages for common PostgreSQL error codes
const PG_ERROR_MESSAGES = {
  // Foreign key violation
  '23503': (err) => {
    const constraint = err.constraint || ''
    if (constraint.includes('subscriptions_package_id')) {
      return { status: 409, message: 'Subscription package reference is invalid. Please refresh packages and try again.' }
    }
    if (constraint === 'job_orders_quotation_id_fkey') {
      return { status: 409, message: 'This quotation cannot be modified or deleted because it has a linked Job Order. Remove the Job Order first.' }
    }
    if (constraint.includes('appointment')) {
      return { status: 409, message: 'This record cannot be deleted because it is linked to one or more appointments.' }
    }
    if (constraint.includes('payment')) {
      return { status: 409, message: 'This record cannot be deleted because it has associated payment records.' }
    }
    return { status: 409, message: 'This record is referenced by another record and cannot be deleted or modified.' }
  },
  // Unique constraint violation
  '23505': (err) => {
    const constraint = err.constraint || ''
    if (constraint.includes('email')) return { status: 409, message: 'That email address is already in use.' }
    if (constraint.includes('plate')) return { status: 409, message: 'A vehicle with that plate number already exists.' }
    if (constraint.includes('quotation_no')) return { status: 409, message: 'That quotation number already exists.' }
    if (constraint.includes('job_order_no')) return { status: 409, message: 'That job order number already exists.' }
    return { status: 409, message: 'A record with those details already exists.' }
  },
  // Not-null violation
  '23502': () => ({ status: 400, message: 'A required field is missing. Please fill in all required fields.' }),
  // Check constraint violation
  '23514': () => ({ status: 400, message: 'The submitted value is not allowed for this field.' }),
}

function notFound(req, res) {
  res.status(404).json({ message: 'Route not found' })
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error)
  }

  // Translate PostgreSQL errors into user-friendly messages
  if (error.code && PG_ERROR_MESSAGES[error.code]) {
    const { status, message } = PG_ERROR_MESSAGES[error.code](error)
    return res.status(status).json({ message })
  }

  const status = error.status || 500
  res.status(status).json({
    message: error.message || 'Internal server error',
    details: process.env.NODE_ENV === 'production' ? undefined : error.stack,
  })
}

module.exports = { notFound, errorHandler }
