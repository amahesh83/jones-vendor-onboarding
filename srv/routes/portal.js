'use strict'
/* Public vendor API: /api/portal. Every call is scoped to the session's single request. */
const express = require('express')
const cds = require('@sap/cds')
const R = require('../lib/requests')
const A = require('../lib/portal-auth')
const { fail } = require('../lib/util')
const { handle, sendError, rateLimit, clientIp } = require('./http')

const router = express.Router()
const limiter = rateLimit({ windowMs: 10 * 60000, max: 30, key: clientIp })

async function withSession (req, mutating) {
  const s = await A.session(req, { mutating })
  if (!s) fail(401, 'NO_SESSION', 'Your session has ended. Please open the link from your email again.')
  return s
}

// 1. Open the link: check the invite token and email a code
router.post('/start', limiter, async (req, res) => {
  try {
    const out = await cds.tx(() => A.start(req.body?.token))
    if (out.error) return res.status(out.error.status).json({ error: out.error })
    res.json(out)
  } catch (e) { sendError(req, res, e) }
})

// 2. Enter the code: on success set the session cookie
router.post('/verify', limiter, async (req, res) => {
  try {
    const out = await cds.tx(() => A.verify(req.body?.token, req.body?.code, clientIp(req)))
    if (out.error) return res.status(out.error.status).json({ error: out.error })
    res.cookie(A.COOKIE, out.session, A.cookieOptions(out.maxAgeMs))
    res.json({ csrf: out.csrf })
  } catch (e) { sendError(req, res, e) }
})

router.get('/me', handle(async req => {
  const s = await withSession(req, false)
  return R.vendorView(s.request)
}))

router.put('/sections/:section', handle(async req => {
  const s = await withSession(req, true)
  return R.saveSection(s.request, req.params.section, req.body?.data || {})
}))

router.post('/documents', handle(async req => {
  const s = await withSession(req, true)
  return R.uploadDocument(s.request, req.body || {}, R.vendorActor(s.request))
}))

router.delete('/documents/:id', handle(async req => {
  const s = await withSession(req, true)
  return R.removeDocument(s.request, req.params.id, R.vendorActor(s.request))
}))

router.post('/submit', handle(async req => {
  const s = await withSession(req, true)
  return R.submit(s.request, { declarationName: req.body?.declarationName, accept: req.body?.accept === true, ip: clientIp(req) }, R.vendorActor(s.request))
}))

router.post('/logout', async (req, res) => {
  try {
    await cds.tx(() => A.logout(req))
    res.clearCookie(A.COOKIE, A.cookieOptions(0))
    res.json({})
  } catch (e) { sendError(req, res, e) }
})

module.exports = router
