'use strict'
/* Development helpers: persona login switcher and the local mailbox. Never mounted in production. */
const express = require('express')
const cds = require('@sap/cds')
const { PERSONAS, find } = require('../auth/personas')
const R = require('../lib/requests')
const { handle } = require('./http')

const router = express.Router()
router.use((req, res, next) => {
  try { require('../lib/demo-examples').assertEnabled(); next() } catch { res.status(404).json({ error: { message: 'Not found.' } }) }
})
router.get('/example', handle(async req => require('../lib/demo-examples').example({ country: req.query.country })))

router.get('/personas', (req, res) => res.json(PERSONAS))

router.post('/login', (req, res) => {
  const p = find(req.body?.id)
  if (!p) return res.status(404).json({ error: { message: 'Unknown persona' } })
  res.cookie('vob_dev_user', p.id, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 7 * 86400000 })
  res.json(p)
})

router.post('/logout', (req, res) => { res.clearCookie('vob_dev_user', { path: '/' }); res.json({}) })

router.get('/mailbox', handle(async () => {
  const rows = await SELECT.from('jones.vob.Notifications').columns('ID', 'toAddress', 'subject', 'template', 'actionUrl', 'code', 'createdAt', 'request_ID').orderBy('createdAt desc').limit(200)
  return rows
}))

router.get('/mailbox/:id', handle(async req => SELECT.one.from('jones.vob.Notifications').where({ ID: req.params.id })))

router.post('/run-jobs', handle(async () => R.runJobs()))

/** Move a request's step clock back, to try out reminders and escalations. */
router.post('/age/:id', handle(async req => {
  const days = Number(req.body?.days || 7)
  const d = new Date(Date.now() - days * 86400000).toISOString()
  await UPDATE('jones.vob.VendorRequests').set({ stepSince: d, lastReminderAt: null, escalatedAt: null }).where({ ID: req.params.id })
  return { ok: true }
}))

module.exports = router
module.exports.enabled = () => process.env.NODE_ENV !== 'production' && !cds.env.profiles?.includes('production') && /dev-auth/.test(String(cds.env.requires?.auth?.impl || ''))
