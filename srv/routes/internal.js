'use strict'
/*
 * Internal API for Jones staff: /api/internal.
 * Authentication comes from CAP (XSUAA in production, the dev persona login locally).
 * Every rule (role, status, segregation of duties) is enforced in lib/requests.js.
 */
const express = require('express')
const R = require('../lib/requests')
const W = require('../lib/workflow')
const V = require('../lib/validation')
const { sap } = require('../lib/sap')
const { fail } = require('../lib/util')
const { handle } = require('./http')

const ALL_ROLES = Object.values(W.ROLES)
const router = express.Router()

function actorOf (req) {
  const u = req.user
  if (!u || u.id === 'anonymous' || u._is_anonymous) fail(401, 'LOGIN', 'Please sign in.')
  const roles = ALL_ROLES.filter(r => u.is(r))
  if (!roles.length) fail(403, 'NO_ROLE', 'You don\'t have access to Vendor Onboarding yet. Ask IT for one of the VOB roles.')
  const name = u.attr?.name || [u.attr?.givenName, u.attr?.familyName].filter(Boolean).join(' ') || u.id
  return { type: 'USER', id: u.id, name, email: u.attr?.email || u.id, roles }
}

// CSRF: browsers can't add custom headers cross-site, so require one on writes.
router.use((req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next()
  if (req.headers['x-requested-with'] !== 'VOB') return res.status(403).json({ error: { code: 'CSRF', message: 'Please reload the page and try again.' } })
  next()
})

const after = (out, id) => out?.startCreation ? { body: out, __after: () => R.startCreation(id) } : out

router.get('/me', handle(async req => {
  const a = actorOf(req)
  return { ...a, roleLabels: a.roles.map(W.roleLabel) }
}))
router.get('/dashboard', handle(async req => R.dashboard(actorOf(req))))
router.get('/config', handle(async req => { actorOf(req); return R.config() }))
router.get('/requests', handle(async req => R.list(actorOf(req), { view: req.query.view, q: req.query.q })))

router.get('/requests/export.csv', async (req, res, next) => {
  try {
    const cds = require('@sap/cds')
    const rows = await cds.tx(() => R.list(actorOf(req), { view: req.query.view, q: req.query.q }))
    const cols = ['requestNumber', 'companyName', 'statusLabel', 'waitingOn', 'workingDaysInStep', 'daysOpen', 'requesterName', 'accountType', 'paymentTerms', 'country', 'sapVendorNumber', 'createdAt']
    const esc = v => {
      const s = String(v ?? '')
      // Prefix a text marker before any leading whitespace/control + formula
      // operator. Quote all cells so CSV parsing cannot change the boundary.
      let first = 0
      while (first < s.length && s.charCodeAt(first) <= 0x20) first++
      const safe = first < s.length && '=+-@'.includes(s[first]) ? `'${s}` : s
      return `"${safe.replace(/"/g, '""')}"`
    }
    const csv = '﻿' + [cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\r\n')
    res.set('content-type', 'text/csv; charset=utf-8').set('content-disposition', 'attachment; filename="vendor-requests.csv"').send(csv)
  } catch (e) { next(e) }
})

router.post('/requests', handle(async req => R.createInvite(actorOf(req), req.body || {})))
router.get('/requests/:id', handle(async req => R.detail(actorOf(req), req.params.id, { revealBank: req.query.reveal === 'bank' })))
router.post('/requests/:id/resend-invite', handle(async req => R.resendInvite(actorOf(req), req.params.id)))
router.post('/requests/:id/change-email', handle(async req => R.changeVendorEmail(actorOf(req), req.params.id, req.body?.email)))
router.post('/requests/:id/cancel', handle(async req => R.cancel(actorOf(req), req.params.id, req.body?.reason)))
router.post('/requests/:id/approve', handle(async req => after(await R.decide(actorOf(req), req.params.id, 'approve', req.body || {}), req.params.id)))
router.post('/requests/:id/send-back', handle(async req => R.decide(actorOf(req), req.params.id, 'sendBack', req.body || {})))
router.post('/requests/:id/reject', handle(async req => R.decide(actorOf(req), req.params.id, 'reject', req.body || {})))
router.post('/requests/:id/bank-verification', handle(async req => R.recordBankVerification(actorOf(req), req.params.id, req.body || {})))
router.post('/requests/:id/finance', handle(async req => R.setFinanceData(actorOf(req), req.params.id, req.body || {})))
router.post('/requests/:id/simulate', handle(async req => R.simulate(actorOf(req), req.params.id)))
router.post('/requests/:id/duplicate-justification', handle(async req => R.justifyDuplicate(actorOf(req), req.params.id, req.body?.text)))
router.post('/requests/:id/retry', handle(async req => after(await R.retry(actorOf(req), req.params.id, req.body || {}), req.params.id)))
router.post('/requests/:id/admin-reject', handle(async req => R.adminReject(actorOf(req), req.params.id, req.body?.reason)))

router.get('/requests/:id/documents/:docId', async (req, res, next) => {
  try {
    const cds = require('@sap/cds')
    const d = await cds.tx(() => R.document(actorOf(req), req.params.id, req.params.docId))
    res.set('content-type', d.mimeType)
      .set('content-disposition', `${req.query.download ? 'attachment' : 'inline'}; filename="${d.fileName.replace(/"/g, '')}"`)
      .set('x-content-type-options', 'nosniff')
      .set('content-security-policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox")
      .send(d.content)
  } catch (e) { next(e) }
})

router.get('/requests/:id/fin010.pdf', async (req, res, next) => {
  try {
    const cds = require('@sap/cds')
    const pdf = await cds.tx(async () => {
      const a = actorOf(req)
      if (!R.canSeeBank(a)) fail(403, 'NOT_ALLOWED', 'Only the bank verifier, Financial Controller or admin can download the full FIN-010 form.')
      const r = await R.load(req.params.id)
      if (!r.round) fail(409, 'NOT_SUBMITTED', 'The vendor has not submitted yet.')
      const out = await R.fin010(req.params.id)
      await require('../lib/util').audit(req.params.id, a, 'BANK_DATA_VIEWED', 'Full FIN-010 with bank details viewed')
      await require('../lib/util').audit(req.params.id, a, 'PDF_DOWNLOADED', 'FIN-010 PDF downloaded')
      return { out, r }
    })
    res.set('content-type', 'application/pdf').set('content-disposition', `inline; filename="FIN-010-${pdf.r.requestNumber}.pdf"`).send(pdf.out)
  } catch (e) { next(e) }
})

// Admin
const adminOnly = req => { const a = actorOf(req); if (!a.roles.includes(W.ROLES.ADMIN)) fail(403, 'NOT_ALLOWED', 'Only master data admins can do this.'); return a }
const NOTIFICATION_ROLES = [W.ROLES.PURCHASING, W.ROLES.PROCUREMENT, W.ROLES.BANK_CHECK, W.ROLES.FINANCE, W.ROLES.ADMIN]

router.get('/admin/role-directory', handle(async req => {
  adminOnly(req)
  return SELECT.from('jones.vob.RoleDirectory').orderBy('role', 'name', 'email')
}))

router.post('/admin/role-directory', handle(async req => {
  const actor = adminOnly(req), input = req.body || {}
  const role = String(input.role || '').trim()
  const email = String(input.email || '').trim().toLowerCase()
  const name = String(input.name || '').trim()
  if (!NOTIFICATION_ROLES.includes(role)) fail(422, 'INVALID', 'Choose a notification role: Purchasing, Procurement, Bank Check, Finance or Admin.')
  const emailError = V.checkEmail(email)
  if (emailError) fail(422, 'INVALID', emailError)
  if (!name || name.length > 120) fail(422, 'INVALID', 'Enter a name of 1 to 120 characters.')
  const key = { role, email }
  const existing = await SELECT.one.from('jones.vob.RoleDirectory').where(key)
  if (existing) await UPDATE('jones.vob.RoleDirectory').set({ name }).where(key)
  else await INSERT.into('jones.vob.RoleDirectory').entries({ ...key, name })
  await require('../lib/util').audit(null, actor, 'CONFIG_CHANGED', `Approver directory ${role} recipient updated`)
  return { ok: true }
}))

router.delete('/admin/role-directory', handle(async req => {
  const actor = adminOnly(req)
  const role = String(req.query.role || '').trim(), email = String(req.query.email || '').trim().toLowerCase()
  if (!NOTIFICATION_ROLES.includes(role) || !email) fail(422, 'INVALID', 'Choose a valid notification role and email address.')
  // Every concurrent delete in this pool updates the same first row before
  // counting. The row write lock serializes the check/delete in the DB.
  for (let attempt = 0; attempt < 3; attempt++) {
    const gate = await SELECT.one.from('jones.vob.RoleDirectory').where({ role }).orderBy('email')
    if (!gate) break
    const locked = await UPDATE('jones.vob.RoleDirectory').set({ name: gate.name }).where({ role, email: gate.email })
    if (Number(locked) > 0) break
    if (attempt === 2) fail(503, 'DIRECTORY_BUSY', 'The approver directory is changing. Please try again.')
  }
  const existing = await SELECT.one.from('jones.vob.RoleDirectory').where({ role, email })
  if (!existing) fail(404, 'NOT_FOUND', 'That approver is not in the directory.')
  const count = await SELECT.from('jones.vob.RoleDirectory').where({ role })
  if (count.length <= 1) fail(409, 'LAST_RECIPIENT', 'Add another recipient for this role before removing the last one.')
  await DELETE.from('jones.vob.RoleDirectory').where({ role, email })
  await require('../lib/util').audit(null, actor, 'CONFIG_CHANGED', `Approver directory ${role} recipient removed`)
  return { ok: true }
}))

function routeInput (input, cfg) {
  const A = require('../lib/approval-routes')
  if (!Array.isArray(input) || input.length > 50) fail(422, 'INVALID', 'Provide up to 50 approval routes.')
  const routes = input.map(r => ({ ID: String(r.ID || '').slice(0, 40), name: String(r.name || '').trim().slice(0, 100), priority: Number(r.priority), active: r.active === true, steps: A.values(r.steps).join(','), bankCheckMode: r.bankCheckMode,
    ...Object.fromEntries(Object.keys(A.DIMENSIONS).map(k => [k, A.values(r[k]).join(',')])) }))
  const errors = A.validate(routes)
  if (routes.some(r => !/^[A-Za-z0-9_-]{1,40}$/.test(r.ID)) || new Set(routes.map(r => r.ID)).size !== routes.length) errors.push('Every route needs a different ID containing letters, numbers or hyphens.')
  const allowed = { accountTypes: cfg.accountTypes.map(x => x.code), paymentTerms: cfg.paymentTerms.map(x => x.code), companyCode: cfg.companyCodes.map(x => x.code), country: cfg.countries.map(x => x.code) }
  for (const r of routes) for (const key of Object.keys(allowed)) if (A.values(r[key]).some(x => !allowed[key].includes(x))) errors.push(`${r.name}: choose known ${key} values.`)
  if (errors.length) fail(422, 'INVALID_ROUTE', errors.join(' '), { errors })
  return routes
}

router.put('/admin/routes', handle(async req => {
  const actor = adminOnly(req), cfg = await R.config()
  const routes = routeInput(req.body?.routes, cfg)
  if (typeof req.body.requesterReviewEnabled !== 'boolean') fail(422, 'INVALID', 'Choose whether requester review is enabled.')
  await DELETE.from('jones.vob.ApprovalRoutes')
  await INSERT.into('jones.vob.ApprovalRoutes').entries(routes)
  await UPSERT.into('jones.vob.Settings').entries({ name: 'requesterReviewEnabled', value: String(req.body.requesterReviewEnabled), description: 'Requester review before configured approval route' })
  await require('../lib/util').audit(null, actor, 'ROUTES_CHANGED', `Saved ${routes.length} routes; requester review ${req.body.requesterReviewEnabled ? 'on' : 'off'}. Existing request snapshots unchanged.`)
  return { routes }
}))

router.post('/admin/routes/test', handle(async req => {
  adminOnly(req)
  const cfg = await R.config(), routes = req.body?.routes ? routeInput(req.body.routes, cfg) : cfg.approvalRoutes
  const settings = { ...cfg.settings }
  if (typeof req.body?.requesterReviewEnabled === 'boolean') settings.requesterReviewEnabled = req.body.requesterReviewEnabled
  const route = require('../lib/approval-routes').resolve(routes, req.body?.vendor || {}, settings)
  return { ...route, summary: route.steps.map(s => s.short).join(' → ') }
}))

router.post('/admin/sap-ping', handle(async req => {
  adminOnly(req)
  const t0 = Date.now()
  try {
    const out = await sap().ping()
    return { ok: true, ms: Date.now() - t0, plain: `Connected to SAP ${out.system} client ${out.client} (release ${out.release}) as ${out.user}.`, technical: out }
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, plain: 'We could not reach SAP. Check the BTP destination and the Cloud Connector.', technical: { message: e.message, messages: e.messages } }
  }
}))

router.get('/admin/failed-notifications', handle(async req => {
  adminOnly(req)
  const rows = await SELECT.from('jones.vob.Notifications').columns('ID', 'request_ID', 'toAddress', 'subject', 'template', 'createdAt')
    .where({ status: 'FAILED', template: { in: ['createdRequester', 'createdVendor'] } }).orderBy('createdAt desc')
  return Promise.all(rows.map(async n => {
    const r = await SELECT.one.from('jones.vob.VendorRequests').columns('requestNumber', 'companyName', 'sapVendorNumber').where({ ID: n.request_ID })
    const job = await SELECT.one.from('jones.vob.SapCreationJobs').columns('state').where({ requestId: n.request_ID })
    return { ...n, requestNumber: r?.requestNumber, companyName: r?.companyName, sapVendorNumber: r?.sapVendorNumber, jobState: job?.state }
  }))
}))

router.post('/admin/notifications/:id/retry', handle(async req => {
  const actor = adminOnly(req)
  const notice = await SELECT.one.from('jones.vob.Notifications').where({ ID: req.params.id })
  if (!notice || !['createdRequester', 'createdVendor'].includes(notice.template)) fail(404, 'NOT_FOUND', 'That created-number email is no longer available.')
  if (notice.status !== 'FAILED') fail(409, 'RETRY_PENDING', 'That email is already being retried or has completed.')
  const r = await R.load(notice.request_ID)
  if (r.status !== 'CREATED') fail(409, 'NOT_CREATED', 'The vendor must be created in SAP before retrying this email.')
  const job = await SELECT.one.from('jones.vob.SapCreationJobs').where({ requestId: r.ID })
  if (job?.state !== 'FAILED') fail(409, 'RETRY_PENDING', 'Automatic email retry is still running or has already completed.')
  if (!await require('../lib/sap/creation-queue').retryFailed(r.ID)) fail(409, 'RETRY_PENDING', 'Another admin already queued this email retry.')
  await require('../lib/util').audit(r.ID, actor, 'CREATED_EMAIL_RETRY', 'Admin queued automatic retry of failed created-number emails')
  return after({ queued: true }, r.ID)
}))

const EDITABLE = {
  Settings: { key: ['name'], fields: ['value'] },
  PaymentTerms: { key: ['code'], fields: ['label', 'sapKey', 'requiresProcurement', 'isDefault'] },
  AccountTypes: { key: ['code'], fields: ['label', 'help', 'reconAccount', 'whtType'] },
  DocumentTypes: { key: ['code'], fields: ['label', 'help', 'needsValidUntil', 'requiredFor', 'countries'] },
  CompanyCodes: { key: ['code'], fields: ['name', 'purchasingOrg', 'active'] },
}

router.put('/admin/config/:table', handle(async req => {
  const actor = adminOnly(req)
  const def = EDITABLE[req.params.table]
  if (!def) fail(400, 'BAD_TABLE', 'That table cannot be edited here.')
  const row = req.body || {}
  const numericSettings = { inviteExpiryDays: [1, 365], otpMinutes: [1, 60], otpMaxAttempts: [1, 10], otpLockMinutes: [1, 1440], sessionMinutes: [5, 1440], reminderDays: [1, 30], escalationDays: [1, 90], bankReminderDays: [1, 30], bankEscalationDays: [1, 90], retentionMonthsClosed: [1, 120] }
  if (req.params.table === 'Settings' && numericSettings[row.name]) {
    const [min, max] = numericSettings[row.name], value = Number(row.value)
    if (!Number.isSafeInteger(value) || value < min || value > max) fail(422, 'INVALID', `${row.name} must be a whole number between ${min} and ${max}.`)
    row.value = String(value)
  }
  if (req.params.table === 'Settings' && row.name === 'requesterReviewEnabled' && !['true', 'false'].includes(String(row.value))) fail(422, 'INVALID', 'Requester review must be true or false.')
  if (req.params.table === 'Settings' && row.name === 'privacyNoticeUrl' && row.value && !/^https:\/\/[^\s"'<>]+$/.test(String(row.value))) fail(422, 'INVALID', 'The privacy notice link must start with https:// (or be empty).')
  const where = Object.fromEntries(def.key.map(k => [k, row[k]]))
  if (def.key.some(k => !String(row[k] ?? '').trim())) fail(422, 'INVALID', 'Key fields are required.')
  const set = Object.fromEntries(def.fields.filter(f => f in row).map(f => [f, row[f]]))
  const entity = `jones.vob.${req.params.table}`
  const exists = await SELECT.one.from(entity).where(where)
  if (!exists) {
    if (!def.insert) fail(404, 'NOT_FOUND', 'Row not found.')
    await INSERT.into(entity).entries({ ...where, ...set })
  } else await UPDATE(entity).set(set).where(where)
  await require('../lib/util').audit(null, actor, 'CONFIG_CHANGED', `${req.params.table} ${JSON.stringify(where)} updated`)
  return { ok: true }
}))

router.delete('/admin/config/:table', handle(async req => {
  const actor = adminOnly(req)
  const def = EDITABLE[req.params.table]
  if (!def?.remove) fail(400, 'BAD_TABLE', 'Rows of that table cannot be removed.')
  const where = Object.fromEntries(def.key.map(k => [k, req.query[k]]))
  await DELETE.from(`jones.vob.${req.params.table}`).where(where)
  await require('../lib/util').audit(null, actor, 'CONFIG_CHANGED', `${req.params.table} ${JSON.stringify(where)} removed`)
  return { ok: true }
}))

router.use((err, req, res, _next) => require('./http').sendError(req, res, err))

module.exports = router
