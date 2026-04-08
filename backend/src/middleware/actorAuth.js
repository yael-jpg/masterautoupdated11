function getActorFromRequest(req) {
  const payload = req.user || {}

  if (payload.customerId) {
    return { role: 'client', userId: Number(payload.customerId) }
  }

  if (payload.role === 'Admin' || payload.role === 'SuperAdmin') {
    return { role: 'admin', userId: Number(payload.id) }
  }

  return null
}

module.exports = {
  getActorFromRequest,
}
