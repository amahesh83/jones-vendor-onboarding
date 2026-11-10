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
let ready = false

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
  app.get('/api/health', (req, res) => res.status(ready ? 200 : 503).json({ status: ready ? 'UP' : 'STARTING' }))
  app.get('/api/process', require('./srv/routes/http').handle(async req => {
    const R = require('./srv/lib/requests'), W = require('./srv/lib/workflow')
    const session = await require('./srv/lib/portal-auth').session(req, { mutating: false })
    if (session?.request.routeSnapshot) return { snapshot: true, routes: [W.routeFor(session.request)] }
    const cfg = await R.config()
    const A = require('./srv/lib/approval-routes')
    const enabled = String(cfg.settings.requesterReviewEnabled ?? 'true') !== 'false'
    return { snapshot: false, routes: cfg.approvalRoutes.filter(r => r.active).map(r => ({
      name: r.name, priority: r.priority, bankCheckMode: r.bankCheckMode,
      when: [r.accountTypes && `account types ${r.accountTypes}`, r.paymentTerms && `payment terms ${r.paymentTerms}`, r.companyCode && `company ${r.companyCode}`, r.country && `country ${r.country}`].filter(Boolean).join('; ') || 'Any vendor (default)',
      steps: [...(enabled ? ['REQUESTER'] : []), ...A.values(r.steps).filter(s => s !== 'REQUESTER')].map(code => {
        const s = W.STEPS.find(s => s.code === code)
        return { ...s, reminderDays: Number(cfg.settings[s.remind] || (code === 'BANK_CHECK' ? 1 : 2)), escalationDays: Number(cfg.settings[s.escalate] || (code === 'BANK_CHECK' ? 3 : 5)) }
      }),
    })) }
  }))
})

cds.on('served', async () => {
  // Admin-editable configuration is seeded by the app, not HDI table data, so a
  // redeployment never overwrites approval routes or settings (see seed-config.js).
  await cds.tx({ user: cds.User.privileged }, () => require('./srv/lib/seed-config').seed())
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

cds.on('listening', async ({ server } = {}) => {
  // Keep idle connections open longer than the App Router / gorouter (and test
  // clients) reuse them. Node's 5 s default closes sockets a client may be about
  // to reuse, which surfaces as random ECONNRESET errors.
  if (server) { server.keepAliveTimeout = 65000; server.headersTimeout = 66000 }
  // Queue workers use unref timers: the HTTP server must exist before seeding awaits them.
  try {
    if (cds.env.requires?.vob?.demoData && !isProduction()) await require('./srv/lib/demo').seed()
    await require('./srv/lib/sap/creation-queue').flush()
    const worker = setInterval(() => require('./srv/lib/sap/creation-queue').flush().catch(e => LOG.error('SAP worker failed', e)), 1000)
    worker.unref()
    cds.on('shutdown', () => clearInterval(worker))
    ready = true
  } catch (e) { LOG.error('Startup recovery failed', e) }
})

module.exports = cds.server
