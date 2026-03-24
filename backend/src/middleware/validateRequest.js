const { validationResult } = require('express-validator')

function validateRequest(req, res, next) {
  const result = validationResult(req)
  if (result.isEmpty()) {
    return next()
  }

  return res.status(400).json({
    message: 'Validation failed',
    errors: result.array().map((error) => ({
      field: error.path,
      message: error.msg,
    })),
  })
}

module.exports = { validateRequest }
