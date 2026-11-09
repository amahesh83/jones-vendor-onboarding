'use strict'
/*
 * Jones Vendor Onboarding: server bootstrap.
 * CAP serves the data model, the read-only OData service and the static apps in app/.
 * We add: security headers, the vendor portal API, the internal API, dev helpers,
 * demo data and the reminder/expiry job.
 */
const cds = require('@sap/cds')
const express = require('express')
const path = require('path')
const { isProduction } = require('./srv/lib/util')

const LOG = cds.log('vob')

function securityHeaders (req, res, next) {
  if (req.path.startsWith('/.cap') || req.path.startsWith('/$fiori') || req.path.startsWith('/odata')) return next()
  res.set('X-Content-Type-Options', 'nosniff')
  res.set('Referrer-Policy', 'no-referrer')
  res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  const frame = cds.env.requires?.vob?.allowFraming ? '' : "frame-ancestors 'none'; "
  if (frame) res.set('X-Frame-Options', 'DENY')
  res.set('Content-Security-Policy', `default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self' data:; frame-src 'self' blob: data:; object-src 'none'; base-uri 'self'; form-action 'self'; ${frame}`.trim())
  if (isProduction()) res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  next()
}

cds.on('bootstrap', app => {
  app.disable('x-powered-by')
  app.set('trust proxy', 1)
  app.use(securityHeaders)

  const json = express.json({ limit: '16mb' })
  app.get('/assets/validation.js', (req, res) => res.type('application/javascript').sendFile(path.join(__dirname, 'srv/lib/validation.js')))
  app.use('/api/portal', json, require('./srv/routes/portal'))
  app.use('/api/internal', json, ...cds.middlewares.before, require('./srv/routes/internal'))

  const dev = require('./srv/routes/dev')
  if (dev.enabled()) {
    app.use('/api/dev', json, dev)
    LOG.info('Development helpers enabled: persona login and mailbox at /api/dev')
  }
  app.get('/api/health', (req, res) => res.json({ status: 'UP' }))
})

cds.on('served', async () => {
  if (cds.env.requires?.vob?.demoData && !isProduction()) {
    try { await require('./srv/lib/demo').seed() } catch (e) { LOG.error('Demo data failed', e) }
  }
  const every = cds.env.requires?.vob?.jobMinutes
  if (every) {
    const R = require('./srv/lib/requests')
    const timer = setInterval(() => {
      cds.context = { user: cds.User.privileged }
      cds.tx(() => R.runJobs()).catch(e => LOG.error('Job failed', e))
    }, every * 60000)
    timer.unref()
  }
})

module.exports = cds.server
