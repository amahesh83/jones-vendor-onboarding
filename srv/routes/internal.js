'use strict'
/*
 * Internal API for Jones staff: /api/internal.
 * Authentication comes from CAP (XSUAA in production, the dev persona login locally).
 * Every rule (role, status, segregation of duties) is enforced in lib/requests.js.
 */
const express = require('express')
const R = require('../lib/requests')
const W = require('../lib/workflow')
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
    const esc = v => { const s = String(v ?? ''); return /[",\n;]/.test(s) || /^[=+\-@]/.test(s) ? `"${s.replace(/^([=+\-@])/, "'$1").replace(/"/g, '""')}"` : s }
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
    const pdf = await cds.tx(async () => { const a = actorOf(req); const r = await R.load(req.params.id); if (!r.round) fail(409, 'NOT_SUBMITTED', 'The vendor has not submitted yet.'); const out = await R.fin010(req.params.id); await require('../lib/util').audit(req.params.id, a, 'PDF_DOWNLOADED', 'FIN-010 PDF downloaded'); return { out, r } })
    res.set('content-type', 'application/pdf').set('content-disposition', `inline; filename="FIN-010-${pdf.r.requestNumber}.pdf"`).send(pdf.out)
  } catch (e) { next(e) }
})

// Admin
const adminOnly = req => { const a = actorOf(req); if (!a.roles.includes(W.ROLES.ADMIN)) fail(403, 'NOT_ALLOWED', 'Only master data admins can do this.'); return a }

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

const EDITABLE = {
  Settings: { key: ['name'], fields: ['value'] },
  PaymentTerms: { key: ['code'], fields: ['label', 'sapKey', 'requiresProcurement', 'isDefault'] },
  AccountTypes: { key: ['code'], fields: ['label', 'help', 'reconAccount', 'whtType'] },
  DocumentTypes: { key: ['code'], fields: ['label', 'help', 'needsValidUntil', 'requiredFor', 'countries'] },
  CompanyCodes: { key: ['code'], fields: ['name', 'purchasingOrg', 'active'] },
  RoleDirectory: { key: ['role', 'email'], fields: ['name'], insert: true, remove: true },
}

router.put('/admin/config/:table', handle(async req => {
  const actor = adminOnly(req)
  const def = EDITABLE[req.params.table]
  if (!def) fail(400, 'BAD_TABLE', 'That table cannot be edited here.')
  const row = req.body || {}
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
