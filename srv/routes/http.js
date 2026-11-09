'use strict'
const cds = require('@sap/cds')
const { AppError } = require('../lib/util')

const LOG = cds.log('vob-http')

/** Send a friendly JSON error. Unknown errors get a generic message plus a reference id. */
function sendError (req, res, e) {
  if (res.headersSent) return
  if (e instanceof AppError) return res.status(e.status).json({ error: { code: e.code, message: e.message, details: e.details } })
  const status = Number(e.status || e.statusCode) || 500
  if (status < 500 && e.message) return res.status(status).json({ error: { code: e.code || 'ERROR', message: e.message } })
  const ref = req.headers['x-correlation-id'] || cds.utils.uuid()
  LOG.error(`Unexpected error (ref ${ref})`, e)
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong on our side. Please try again in a minute.', ref, technical: process.env.NODE_ENV === 'production' ? undefined : String(e.stack || e.message).slice(0, 2000) } })
}

/** Wrap an async handler: runs it in one database transaction and sends JSON. */
const handle = fn => async (req, res) => {
  try {
    const out = await cds.tx(() => fn(req, res))
    if (out && out.__after) out.__after() // runs after commit, in the background
    if (!res.headersSent) res.json(out && out.__after ? out.body : (out ?? {}))
  } catch (e) { sendError(req, res, e) }
}

/** Very small fixed-window rate limiter (single instance; see docs/deviations.md). */
function rateLimit ({ windowMs, max, key = req => req.ip }) {
  const hits = new Map()
  return (req, res, next) => {
    const k = key(req), t = Date.now()
    const h = hits.get(k)
    if (!h || t - h.start > windowMs) hits.set(k, { start: t, n: 1 })
    else if (++h.n > max) return res.status(429).json({ error: { code: 'RATE_LIMIT', message: 'Too many attempts. Please wait a few minutes and try again.' } })
    if (hits.size > 5000) for (const [kk, v] of hits) if (t - v.start > windowMs) hits.delete(kk)
    next()
  }
}

const clientIp = req => String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim()

module.exports = { handle, sendError, rateLimit, clientIp }
