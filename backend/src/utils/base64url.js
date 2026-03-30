function base64urlEncode(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function base64urlDecode(str) {
  const s = String(str || '')
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  const padded = s + '='.repeat((4 - (s.length % 4)) % 4)
  return Buffer.from(padded, 'base64')
}

module.exports = {
  base64urlEncode,
  base64urlDecode,
}
