'use strict'
const crypto = require('crypto')
const cds = require('@sap/cds')

/** An error with a plain-English message for the user and optional technical details. */
class AppError extends Error {
  constructor (status, code, message, details) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}
const fail = (status, code, message, details) => { throw new AppError(status, code, message, details) }

const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url')
const sha256 = v => crypto.createHash('sha256').update(String(v)).digest('hex')
const randomCode = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0')
const safeEqual = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b))
  return x.length === y.length && crypto.timingSafeEqual(x, y)
}

const now = () => new Date()
const iso = d => (d instanceof Date ? d : new Date(d)).toISOString()
const addMinutes = (d, m) => new Date(new Date(d).getTime() + m * 60000)
const addDays = (d, n) => new Date(new Date(d).getTime() + n * 86400000)

/** Whole working days (Mon-Fri) between two dates. */
function workingDaysBetween (from, to) {
  const a = new Date(from), b = new Date(to)
  if (b <= a) return 0
  let days = 0
  const d = new Date(a)
  d.setUTCHours(0, 0, 0, 0)
  const end = new Date(b)
  end.setUTCHours(0, 0, 0, 0)
  while (d < end) {
    d.setUTCDate(d.getUTCDate() + 1)
    const wd = d.getUTCDay()
    if (wd !== 0 && wd !== 6) days++
  }
  return days
}

const daysBetween = (from, to = new Date()) => Math.max(0, Math.floor((new Date(to) - new Date(from)) / 86400000))

/** Settings table as an object with numbers converted. */
async function settings () {
  const rows = await SELECT.from('jones.vob.Settings')
  const out = {}
  for (const r of rows) out[r.name] = r.value !== null && r.value !== '' && !isNaN(r.value) ? Number(r.value) : (r.value || '')
  return out
}

async function nextNumber (name, prefix) {
  const year = new Date().getUTCFullYear()
  const key = `${name}-${year}`
  const row = await SELECT.one.from('jones.vob.Counters').where({ name: key })
  let value
  if (!row) { value = 1; await INSERT.into('jones.vob.Counters').entries({ name: key, value }) } else {
    value = row.value + 1
    await UPDATE('jones.vob.Counters').set({ value }).where({ name: key, value: row.value })
  }
  return `${prefix}-${year}-${String(value).padStart(5, '0')}`
}

/** Write one append-only audit event. */
async function audit (requestId, actor, event, message, details) {
  await INSERT.into('jones.vob.AuditEvents').entries({
    ID: cds.utils.uuid(),
    request_ID: requestId,
    at: iso(now()),
    actorType: actor?.type || 'SYSTEM',
    actorId: actor?.id || 'system',
    actorName: actor?.name || 'System',
    event,
    message,
    details: details ? JSON.stringify(details) : null,
  })
  // Express routes bypass CAP's automatic service-level personal-data handlers.
  // Explicitly log sensitive bank reads, with field names only (never bank values).
  if (event === 'BANK_DATA_VIEWED') {
    const auditLog = await cds.connect.to('audit-log')
    await auditLog.log('SensitiveDataRead', {
      user: actor.id,
      data_subject: { type: 'jones.vob.VendorRequests', role: 'Vendor', id: { ID: requestId } },
      object: { type: 'jones.vob.VendorRequests', id: { ID: requestId } },
      attributes: ['iban', 'bankAccountNo', 'sortCode'].map(name => ({ name })),
    })
  }
}

const SYSTEM = { type: 'SYSTEM', id: 'system', name: 'System' }

const isProduction = () => process.env.NODE_ENV === 'production' || cds.env.profiles?.includes('production')

const parseJson = (v, fallback = null) => { try { return v ? JSON.parse(v) : fallback } catch { return fallback } }

module.exports = {
  AppError, fail, randomToken, sha256, randomCode, safeEqual,
  now, iso, addMinutes, addDays, workingDaysBetween, daysBetween,
  settings, nextNumber, audit, SYSTEM, isProduction, parseJson,
}
