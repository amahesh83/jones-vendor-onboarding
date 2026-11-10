'use strict'
/*
 * The vendor-request domain: invite, vendor data, submission, approvals,
 * bank call-back, finance data, SAP simulation and creation, jobs.
 * Route handlers call these inside cds.tx(); all business rules live here.
 */
const cds = require('@sap/cds')
const V = require('./validation')
const W = require('./workflow')
const U = require('./util')
const mail = require('./mail')
const files = require('./files')
const { sap } = require('./sap')
const { buildVendorPayload } = require('./sap/mapping')
const { plainEnglish } = require('./sap/errors')
const { buildFin010 } = require('./pdf')

const { fail, iso, now } = U
const E = {
  R: 'jones.vob.VendorRequests', S: 'jones.vob.ApprovalSteps', B: 'jones.vob.BankVerifications',
  D: 'jones.vob.RequestDocuments', VER: 'jones.vob.RequestVersions', A: 'jones.vob.AuditEvents',
  T: 'jones.vob.InviteTokens', O: 'jones.vob.OtpChallenges', P: 'jones.vob.PortalSessions', N: 'jones.vob.Notifications',
}
const LOG = cds.log('vob')

const VENDOR_FIELDS = V.FIELDS.map(f => f.key).concat(['sortCode', 'bankAccountNo'])
const BANK_FIELDS = ['iban', 'bic', 'bankName', 'bankAddress', 'bankAccountNo', 'sortCode', 'accountHolder']
const CLOSED = ['CREATED', 'REJECTED', 'CANCELLED', 'EXPIRED']

// ------------------------------------------------------------------ config

async function config () {
  const [accountTypes, paymentTerms, countries, currencies, docTypes, whtCodes, companyCodes, s] = await Promise.all([
    SELECT.from('jones.vob.AccountTypes').orderBy('sortOrder'),
    SELECT.from('jones.vob.PaymentTerms').orderBy('sortOrder'),
    SELECT.from('jones.vob.Countries').orderBy('sortOrder', 'name'),
    SELECT.from('jones.vob.Currencies'),
    SELECT.from('jones.vob.DocumentTypes').orderBy('sortOrder'),
    SELECT.from('jones.vob.WithholdingCodes'),
    SELECT.from('jones.vob.CompanyCodes'),
    U.settings(),
  ])
  const approvalRoutes = await SELECT.from('jones.vob.ApprovalRoutes').orderBy('priority', 'ID')
  return { accountTypes, paymentTerms, countries, currencies, docTypes, whtCodes, companyCodes, approvalRoutes, approvalStepOptions: W.STEPS, settings: s }
}

const byCode = (list, code) => list.find(x => x.code === code)

function ctxFor (r, cfg) {
  const at = byCode(cfg.accountTypes, r.accountType)
  return { country: r.country, accountType: r.accountType, subcontractor: !!at?.subcontractor, notVatRegistered: !!r.notVatRegistered }
}

const base = cfg => String(cfg.settings.portalBaseUrl || '').replace(/\/$/, '')
const internalLink = (cfg, id) => `${base(cfg)}/internal/#/requests/${id}`
const portalLink = (cfg, token) => `${base(cfg)}/portal/?t=${encodeURIComponent(token)}`

async function load (id) {
  const r = await SELECT.one.from(E.R).where({ ID: id })
  if (!r) fail(404, 'NOT_FOUND', 'We couldn\'t find that request. It may have been removed.')
  return r
}

const vendorActor = r => ({ type: 'VENDOR', id: r.vendorEmail, name: r.vendorContactName || 'Vendor' })
const hasRole = (actor, role) => (actor.roles || []).includes(role)
const isAdmin = actor => hasRole(actor, W.ROLES.ADMIN)

async function decisionsOf (id) { return SELECT.from(E.S).where({ request_ID: id }).orderBy('decidedAt') }

// ------------------------------------------------------------------ invite

async function newInviteToken (r, cfg) {
  const token = U.randomToken(32)
  await UPDATE(E.T).set({ revoked: true }).where({ request_ID: r.ID, revoked: false })
  const expiresAt = U.addDays(now(), cfg.settings.inviteExpiryDays || 30)
  await INSERT.into(E.T).entries({ ID: cds.utils.uuid(), request_ID: r.ID, tokenHash: U.sha256(token), expiresAt: iso(expiresAt), createdAt: iso(now()), revoked: false })
  await UPDATE(E.R).set({ inviteExpiresAt: iso(expiresAt) }).where({ ID: r.ID })
  return { token, expiresAt }
}

async function sendInvite (r, cfg, template = 'invite', extra = {}) {
  const { token, expiresAt } = await newInviteToken(r, cfg)
  const link = portalLink(cfg, token)
  await mail.send({
    to: r.vendorEmail, template, requestId: r.ID, actionUrl: link,
    data: { contactName: r.vendorContactName, requesterName: r.requesterName, companyName: r.companyName, ref: r.requestNumber, link, expires: expiresAt.toISOString().slice(0, 10), ...extra },
  })
  return link
}

async function createInvite (actor, input) {
  if (!hasRole(actor, W.ROLES.REQUESTER)) fail(403, 'FORBIDDEN', 'Only requesters can invite vendors.')
  const cfg = await config()
  const errors = {}
  const req = (k, msg) => { if (!String(input[k] ?? '').trim()) errors[k] = msg }
  req('companyName', 'Please enter the company name.')
  req('vendorContactName', 'Please enter the contact\'s name.')
  req('businessReason', 'Please say why Jones needs this vendor (project or purpose).')
  const emailErr = V.checkEmail(input.vendorEmail)
  if (emailErr) errors.vendorEmail = emailErr
  if (!byCode(cfg.accountTypes, input.accountType)) errors.accountType = 'Please choose an account type.'
  if (!byCode(cfg.paymentTerms, input.paymentTerms)) errors.paymentTerms = 'Please choose the payment terms.'
  if (input.currency && !byCode(cfg.currencies, input.currency)) errors.currency = 'Please choose a currency from the list.'
  if (input.country && !byCode(cfg.countries, input.country)) errors.country = 'Please choose a country from the list.'
  const companyCode = input.companyCode || 'IE01'
  if (!cfg.companyCodes.find(c => c.code === companyCode && c.active)) errors.companyCode = 'That company code is not set up for onboarding.'
  if (Object.keys(errors).length) fail(422, 'INVALID', 'Please check the highlighted fields.', { errors })

  const email = String(input.vendorEmail).trim().toLowerCase()
  const open = (await SELECT.from(E.R).columns('requestNumber', 'status').where({ vendorEmail: email })).find(x => !CLOSED.includes(x.status))
  if (open) fail(409, 'DUPLICATE_INVITE', `There is already an open request for ${email} (${open.requestNumber}). Open that one instead, or cancel it first.`)

  const country = input.country || null
  const currency = input.currency || (country && byCode(cfg.countries, country)?.defaultCurrency) || 'EUR'
  const r = {
    ID: cds.utils.uuid(),
    requestNumber: await U.nextNumber('VOB', 'VOB'),
    companyCode, status: 'INVITED', round: 0,
    requesterId: actor.id, requesterName: actor.name, requesterEmail: actor.email,
    businessReason: String(input.businessReason).trim().slice(0, 500),
    accountType: input.accountType, paymentTerms: input.paymentTerms, currency,
    vendorContactName: String(input.vendorContactName).trim().slice(0, 120), vendorEmail: email,
    companyName: String(input.companyName).trim().replace(/\s+/g, ' ').slice(0, 140), country,
    accountHolder: null,
  }
  await INSERT.into(E.R).entries(r)
  const link = await sendInvite(r, cfg)
  await U.audit(r.ID, actor, 'INVITED', `Invited ${r.vendorContactName} <${email}> as ${byCode(cfg.accountTypes, r.accountType).label}`)
  const result = { ID: r.ID, requestNumber: r.requestNumber }
  if (mail.kind() === 'local') result.devLink = link
  return result
}

function assertOwnerOrAdmin (actor, r, what) {
  if (r.requesterId !== actor.id && !isAdmin(actor)) fail(403, 'FORBIDDEN', `Only the requester or a master data admin can ${what}.`)
}

async function resendInvite (actor, id) {
  const r = await load(id)
  assertOwnerOrAdmin(actor, r, 'resend the invite')
  if (!['INVITED', 'IN_PROGRESS', 'RETURNED', 'EXPIRED'].includes(r.status)) fail(409, 'WRONG_STATUS', 'The vendor has already submitted, so there is nothing to resend.')
  const cfg = await config()
  if (r.status === 'EXPIRED') {
    const back = r.returnMessage ? 'RETURNED' : r.vendorStartedAt ? 'IN_PROGRESS' : 'INVITED'
    await UPDATE(E.R).set({ status: back, closedAt: null }).where({ ID: id })
    r.status = back
  }
  const link = await sendInvite(r, cfg)
  await U.audit(id, actor, 'INVITE_RESENT', `Sent a new link to ${r.vendorEmail}. Older links no longer work.`)
  return mail.kind() === 'local' ? { devLink: link } : {}
}

async function changeVendorEmail (actor, id, email) {
  const r = await load(id)
  assertOwnerOrAdmin(actor, r, 'change the vendor email')
  if (r.status !== 'INVITED') fail(409, 'WRONG_STATUS', 'You can only change the email before the vendor has started.')
  const err = V.checkEmail(email)
  if (err) fail(422, 'INVALID', err, { errors: { vendorEmail: err } })
  const cfg = await config()
  const old = r.vendorEmail
  r.vendorEmail = String(email).trim().toLowerCase()
  await UPDATE(E.R).set({ vendorEmail: r.vendorEmail }).where({ ID: id })
  const link = await sendInvite(r, cfg)
  await U.audit(id, actor, 'EMAIL_CHANGED', `Vendor email changed from ${old} to ${r.vendorEmail}; new link sent`)
  return mail.kind() === 'local' ? { devLink: link } : {}
}

async function cancel (actor, id, reason) {
  const r = await load(id)
  assertOwnerOrAdmin(actor, r, 'cancel this request')
  if (CLOSED.includes(r.status) || r.status === 'CREATING') fail(409, 'WRONG_STATUS', 'This request can no longer be cancelled.')
  await UPDATE(E.R).set({ status: 'CANCELLED', currentStep: null, closedAt: iso(now()) }).where({ ID: id })
  await UPDATE(E.T).set({ revoked: true }).where({ request_ID: id })
  await DELETE.from(E.P).where({ request_ID: id })
  await U.audit(id, actor, 'CANCELLED', reason ? `Cancelled: ${String(reason).slice(0, 300)}` : 'Cancelled')
  return {}
}

// ------------------------------------------------------------------ vendor side

function vendorStatus (r) {
  const info = W.STATUS_INFO[r.status]
  return { code: r.status, label: info.vendor, editable: W.VENDOR_EDITABLE.includes(r.status) }
}

/** What the vendor portal shows: their own data only, bank masked once submitted. Never internal notes. */
async function vendorView (r) {
  const cfg = await config()
  const nextReview = W.routeStep(r)
  const ctx = ctxFor(r, cfg)
  const at = byCode(cfg.accountTypes, r.accountType)
  const st = vendorStatus(r)
  const data = {}
  for (const k of VENDOR_FIELDS) data[k] = r[k] ?? null
  data.notVatRegistered = !!r.notVatRegistered
  const bankLocked = st.editable && r.round > 0 && !!(r.iban || r.bankAccountNo)
  if (!st.editable || bankLocked) {
    data.iban = V.maskIban(r.iban)
    data.bankAccountNo = V.maskTail(r.bankAccountNo)
    data.sortCode = r.sortCode ? '••••' + String(r.sortCode).slice(-2) : null
  }
  const docs = await SELECT.from(E.D).columns('ID', 'docType', 'fileName', 'size', 'validUntil', 'scanStatus', 'uploadedAt').where({ request_ID: r.ID })
  return {
    reference: r.requestNumber,
    status: st,
    companyNameInvited: r.companyName,
    contactName: r.vendorContactName,
    requesterName: r.requesterName,
    accountType: { code: at?.code, label: at?.label, help: at?.help, subcontractor: !!at?.subcontractor },
    paymentTerms: byCode(cfg.paymentTerms, r.paymentTerms)?.label,
    currency: r.currency,
    data,
    bankLocked,
    round: r.round,
    returned: r.status === 'RETURNED' ? { message: r.returnMessage, sections: (r.returnSections || '').split(',').filter(Boolean) } : null,
    vendorNumber: r.status === 'CREATED' ? r.sapVendorNumber : null,
    reviewStages: r.routeSnapshot ? W.routeFor(r).steps.map(s => s.short) : [],
    nextReview: nextReview ? { role: nextReview.short, days: nextReview.reminderDays || (r.status === 'PENDING_BANK_CHECK' ? 1 : 2) } : null,
    bankCheckMode: r.routeSnapshot ? W.routeFor(r).bankCheckMode : 'SEPARATE',
    submittedAt: r.submittedAt,
    lastSavedAt: r.lastSavedAt,
    documents: docs.filter(d => d.scanStatus !== 'INFECTED'),
    documentTypes: V.visibleDocTypes(cfg.docTypes, ctx).map(d => ({
      code: d.code, label: d.label, help: d.help, needsValidUntil: !!d.needsValidUntil,
      required: V.requiredDocTypes(cfg.docTypes, ctx).some(x => x.code === d.code),
    })),
    countries: cfg.countries.map(c => ({ code: c.code, name: c.name, defaultCurrency: c.defaultCurrency })),
    supportEmail: cfg.settings.supportEmail,
    privacyNoticeUrl: /^https:\/\/[^\s"'<>]+$/.test(String(cfg.settings.privacyNoticeUrl || '')) ? cfg.settings.privacyNoticeUrl : null,
  }
}

function assertEditable (r) {
  if (!W.VENDOR_EDITABLE.includes(r.status)) {
    fail(409, 'LOCKED', r.status === 'CREATED' ? 'Your account is already set up. Nothing more to do!' : 'Thanks, we already have your details and they are being reviewed. You can\'t change them right now.')
  }
}

async function saveSection (r, section, input) {
  assertEditable(r)
  if (!['company', 'contacts', 'tax', 'bank'].includes(section)) fail(400, 'BAD_SECTION', 'Unknown section.')
  const cfg = await config()
  const ctx = ctxFor(r, cfg)
  const values = Object.values(input || {}).map(String)
  if (values.some(v => v.includes('•'))) fail(422, 'MASKED', 'Please type the full bank details again to change them.')
  const current = {}
  for (const f of V.FIELDS.filter(x => x.section === section)) current[f.key] = r[f.key]
  const clean = V.cleanSection(section, { ...current, ...(input || {}) }, ctx)
  if (section === 'company' && clean.country && !byCode(cfg.countries, clean.country)) fail(422, 'INVALID', 'Please choose a country from the list.')
  for (const f of V.FIELDS) if (f.max && typeof clean[f.key] === 'string') clean[f.key] = clean[f.key].slice(0, f.max)
  if (section === 'bank' && !clean.accountHolder && r.companyName) clean.accountHolder = r.companyName.slice(0, 60)
  const patch = { ...clean, lastSavedAt: iso(now()) }
  if (r.status === 'INVITED') Object.assign(patch, { status: 'IN_PROGRESS', vendorStartedAt: iso(now()) })
  if (section === 'company' && clean.country && clean.country !== r.country && r.round === 0 && !r.lastSavedAt) {
    patch.currency = byCode(cfg.countries, clean.country)?.defaultCurrency || r.currency
  }
  await UPDATE(E.R).set(patch).where({ ID: r.ID })
  if (r.status === 'INVITED') await U.audit(r.ID, vendorActor(r), 'VENDOR_STARTED', 'The vendor started filling in the form')
  const merged = { ...r, ...patch }
  const errors = V.validateSection(section, merged, ctxFor(merged, cfg))
  const warnings = {}
  if (section === 'bank') {
    const w = V.bicCountryWarning(merged.bic, merged.iban)
    if (w) warnings.bic = w
  }
  return { savedAt: patch.lastSavedAt, errors, warnings, derived: section === 'bank' ? { sortCode: clean.sortCode, bankAccountNo: clean.bankAccountNo } : undefined }
}

async function uploadDocument (r, input, actor) {
  assertEditable(r)
  const cfg = await config()
  const ctx = ctxFor(r, cfg)
  const type = V.visibleDocTypes(cfg.docTypes, ctx).find(d => d.code === input.docType)
  if (!type) fail(400, 'BAD_TYPE', 'Unknown document type.')
  let validUntil = null
  if (type.needsValidUntil) {
    if (!input.validUntil || isNaN(Date.parse(input.validUntil))) fail(422, 'VALID_UNTIL', `Please enter the date the ${type.label.toLowerCase()} is valid until.`)
    if (new Date(input.validUntil) < new Date(new Date().toISOString().slice(0, 10))) fail(422, 'EXPIRED_DOC', `That ${type.label.toLowerCase()} has already expired. Please upload a current one.`)
    validUntil = String(input.validUntil).slice(0, 10)
  }
  const f = files.inspect({ fileName: input.fileName, content: input.content })
  const scanStatus = await files.scan(f.buffer)
  if (scanStatus === 'INFECTED') {
    await U.audit(r.ID, actor, 'UPLOAD_BLOCKED', `Upload of ${f.fileName} was blocked by the malware scan`)
    fail(422, 'INFECTED', 'Our virus scanner flagged this file, so we didn\'t keep it. Please scan your computer and upload a clean copy.')
  }
  await DELETE.from(E.D).where({ request_ID: r.ID, docType: type.code })
  const ID = cds.utils.uuid()
  await INSERT.into(E.D).entries({
    ID, request_ID: r.ID, docType: type.code, fileName: f.fileName, mimeType: f.mimeType, size: f.size, sha256: f.sha256,
    content: f.buffer, validUntil, scanStatus, uploadedAt: iso(now()), uploadedBy: actor.id,
  })
  const patch = { lastSavedAt: iso(now()) }
  if (r.status === 'INVITED') Object.assign(patch, { status: 'IN_PROGRESS', vendorStartedAt: iso(now()) })
  await UPDATE(E.R).set(patch).where({ ID: r.ID })
  await U.audit(r.ID, actor, 'DOCUMENT_UPLOADED', `${type.label}: ${f.fileName} (${Math.round(f.size / 1024)} KB)`)
  return { ID, docType: type.code, fileName: f.fileName, size: f.size, validUntil, scanStatus }
}

async function removeDocument (r, docId, actor) {
  assertEditable(r)
  const d = await SELECT.one.from(E.D).columns('ID', 'docType', 'fileName').where({ ID: docId, request_ID: r.ID })
  if (!d) fail(404, 'NOT_FOUND', 'That document was already removed.')
  await DELETE.from(E.D).where({ ID: docId })
  await U.audit(r.ID, actor, 'DOCUMENT_REMOVED', `${d.docType}: ${d.fileName}`)
  return {}
}

function missingDocuments (r, cfg, docs) {
  const ctx = ctxFor(r, cfg)
  const today = new Date().toISOString().slice(0, 10)
  const out = []
  for (const t of V.requiredDocTypes(cfg.docTypes, ctx)) {
    const d = docs.find(x => x.docType === t.code && x.scanStatus === 'CLEAN')
    if (!d) out.push({ code: t.code, label: t.label, problem: 'missing' })
    else if (t.needsValidUntil && d.validUntil && String(d.validUntil) < today) out.push({ code: t.code, label: t.label, problem: 'expired' })
  }
  return out
}

/** Duplicate checks: SAP (adapter) and open requests. */
async function runChecks (r) {
  const result = { sap: { ran: false, matches: [] }, open: [], ranAt: iso(now()) }
  try {
    const out = await sap().duplicates({ companyCode: r.companyCode, name: r.companyName, postCode: r.postCode, country: r.country, vatNumber: r.notVatRegistered ? '' : r.vatNumber, iban: r.iban })
    result.sap = { ran: true, matches: out.matches || [] }
  } catch (e) {
    result.sap = { ran: false, matches: [], error: 'The duplicate check against SAP could not run. It will run again before the vendor is created.' }
    LOG.warn('Duplicate check failed', e.message)
  }
  const others = (await SELECT.from(E.R).columns('ID', 'requestNumber', 'companyName', 'vatNumber', 'iban', 'postCode', 'status'))
    .filter(o => o.ID !== r.ID && !['REJECTED', 'CANCELLED', 'EXPIRED'].includes(o.status))
  for (const o of others) {
    const on = []
    if (r.vatNumber && o.vatNumber && !r.notVatRegistered && V.normalizeVat(o.vatNumber) === V.normalizeVat(r.vatNumber)) on.push('VAT')
    if (r.iban && o.iban && V.normalizeIban(o.iban) === V.normalizeIban(r.iban)) on.push('IBAN')
    if (V.normalizeName(o.companyName) === V.normalizeName(r.companyName) && o.postCode && r.postCode && o.postCode.replace(/\s/g, '') === r.postCode.replace(/\s/g, '')) on.push('NAME_POSTCODE')
    if (on.length) result.open.push({ ID: o.ID, requestNumber: o.requestNumber, companyName: o.companyName, status: o.status, matchedOn: on })
  }
  const blocking = result.sap.matches.some(m => m.blocked)
  return { result, blocking }
}

function snapshotOf (r) {
  const s = {}
  for (const k of VENDOR_FIELDS) s[k] = r[k] ?? null
  s.notVatRegistered = !!r.notVatRegistered
  s.accountType = r.accountType; s.paymentTerms = r.paymentTerms; s.currency = r.currency
  return s
}

async function submit (r, { declarationName, accept, ip }, actor) {
  assertEditable(r)
  const cfg = await config()
  const ctx = ctxFor(r, cfg)
  // re-clean every section with the final context, so hidden fields are dropped
  const cleaned = {}
  for (const s of ['company', 'contacts', 'tax', 'bank']) Object.assign(cleaned, V.cleanSection(s, { ...r }, ctx))
  const data = { ...r, ...cleaned }
  const errors = V.validateAll(data, ctxFor(data, cfg))
  const docs = await SELECT.from(E.D).columns('ID', 'docType', 'validUntil', 'scanStatus').where({ request_ID: r.ID })
  const missing = missingDocuments(data, cfg, docs)
  if (!String(declarationName || '').trim()) errors.declarationName = 'Please type your full name.'
  if (accept !== true) errors.accept = 'Please tick the declaration.'
  if (Object.keys(errors).length || missing.length) {
    const sections = [...new Set(Object.keys(errors).map(k => V.FIELDS.find(f => f.key === k)?.section || 'review'))]
    if (missing.length) sections.push('documents')
    fail(422, 'INCOMPLETE', 'A few things still need your attention before you can submit.', { errors, missing, sections })
  }

  const round = (r.round || 0) + 1
  const route = r.routeSnapshot ? W.routeFor(r) : require('./approval-routes').resolve(cfg.approvalRoutes, data, cfg.settings)
  const patch = {
    routeSnapshot: JSON.stringify(route),
    ...cleaned, status: 'SUBMITTED', round, submittedAt: iso(now()),
    declarationName: String(declarationName).trim().slice(0, 120), declarationAt: iso(now()), declarationIp: String(ip || '').slice(0, 64),
    returnMessage: null, returnSections: null, sapSimulatedOk: false, sapSimulationJson: null, duplicateJustification: null,
  }
  await UPDATE(E.R).set(patch).where({ ID: r.ID })
  const merged = { ...r, ...patch }
  await INSERT.into(E.VER).entries({ ID: cds.utils.uuid(), request_ID: r.ID, round, snapshot: JSON.stringify(snapshotOf(merged)), createdAt: iso(now()) })
  await U.audit(r.ID, actor, 'SUBMITTED', round > 1 ? `Resubmitted (round ${round})` : 'Submitted with the declaration signed by ' + patch.declarationName)

  const { result, blocking } = await runChecks(merged)
  const step = route.steps[0]
  await UPDATE(E.R).set({ duplicatesJson: JSON.stringify(result), duplicateBlocking: blocking, status: step.status, currentStep: step.code, stepSince: iso(now()), lastReminderAt: null, escalatedAt: null }).where({ ID: r.ID })
  await U.audit(r.ID, U.SYSTEM, 'ROUTE_ASSIGNED', `Route: ${route.name} - ${route.steps.map(s => s.label).join(' -> ')}`)
  await notifyStep(merged, step.status, cfg)
  const found = result.sap.matches.length + result.open.length
  await U.audit(r.ID, U.SYSTEM, 'CHECKS_RUN', found ? `Automatic checks found ${found} possible duplicate(s)${blocking ? ' (exact VAT/IBAN match in SAP)' : ''}` : 'Automatic checks passed: no duplicates found')

  await mail.send({ to: r.vendorEmail, template: 'receiptVendor', requestId: r.ID, data: { companyName: merged.companyName, ref: r.requestNumber } })
  await mail.send({ to: r.requesterEmail, template: 'submittedRequester', requestId: r.ID, actionUrl: internalLink(cfg, r.ID), data: { companyName: merged.companyName, ref: r.requestNumber, link: internalLink(cfg, r.ID), nextStepLabel: step.label, routeSummary: route.steps.map(s => s.short).join(' → ') } })
  return { reference: r.requestNumber, status: vendorStatus({ ...merged, status: step.status }) }
}

// ------------------------------------------------------------------ approvals

async function notifyStep (r, status, cfg, prefix) {
  const step = W.routeFor(r).steps.find(s => s.status === status)
  if (!step) return
  const link = internalLink(cfg, r.ID)
  const to = step.code === 'REQUESTER' ? [r.requesterEmail] : await mail.roleRecipients(step.role)
  await mail.send({ to, template: 'task', requestId: r.ID, actionUrl: link, data: { companyName: r.companyName, ref: r.requestNumber, stepLabel: step.label, routeSummary: W.routeFor(r).steps.map(s => s.short).join(' → '), link, prefix } })
}

async function bankConfirmed (r, actor) {
  const rows = await SELECT.from(E.B).where({ request_ID: r.ID, round: r.round }).orderBy('recordedAt desc')
  const latest = rows.find(b => W.routeFor(r).bankCheckMode !== 'IN_FINANCE' || b.userId === actor?.id)
  return !!latest && latest.outcome === 'CONFIRMED' && V.normalizeIban(latest.ibanChecked) === V.normalizeIban(r.iban || r.bankAccountNo)
}

async function canAct (actor, r, decisions) {
  const checks = await SELECT.from(E.B).where({ request_ID: r.ID, round: r.round })
  return W.canAct(actor, r, decisions, checks)
}

async function decide (actor, id, action, payload = {}) {
  const r = await load(id)
  const decisions = await decisionsOf(id)
  const can = await canAct(actor, r, decisions)
  if (!can.ok) fail(403, 'NOT_ALLOWED', can.reason)
  const cfg = await config()
  const step = can.step
  const comment = String(payload.comment || payload.message || payload.reason || '').trim().slice(0, 1000)

  if (action === 'approve') {
    if (step.code === 'REQUESTER') {
      const patch = {}
      for (const k of ['accountType', 'paymentTerms', 'currency']) {
        if (payload[k] && payload[k] !== r[k]) {
          const list = { accountType: cfg.accountTypes, paymentTerms: cfg.paymentTerms, currency: cfg.currencies }[k]
          if (!byCode(list, payload[k])) fail(422, 'INVALID', `Unknown ${k}.`)
          patch[k] = payload[k]
        }
      }
      if (Object.keys(patch).length) {
        await UPDATE(E.R).set(patch).where({ ID: id })
        await U.audit(id, actor, 'REQUESTER_CHANGED', `Requester changed ${Object.entries(patch).map(([k, v]) => `${k} ${r[k]} → ${v}`).join(', ')}`)
        Object.assign(r, patch)
        if (patch.accountType || patch.paymentTerms) await reassessAfterRequesterChange(actor, r, cfg)
      }
    }
    const blocker = W.approvalBlocker(r, { bankConfirmed: await bankConfirmed(r, actor), simulationValid: !!r.sapSimulatedOk })
    if (blocker) fail(409, 'BLOCKED', blocker)
    const next = W.nextInRoute(r, step.code)
    await INSERT.into(E.S).entries({ ID: cds.utils.uuid(), request_ID: id, round: r.round, step: step.code, decision: 'APPROVED', userId: actor.id, userName: actor.name, comment, decidedAt: iso(now()) })
    const nextStep = W.routeFor(r).steps.find(s => s.status === next)
    await UPDATE(E.R).set({ status: next, currentStep: nextStep?.code || null, stepSince: iso(now()), lastReminderAt: null, escalatedAt: null }).where({ ID: id })
    await U.audit(id, actor, 'APPROVED', `${step.label} approved${comment ? ': ' + comment : ''}`)
    if (nextStep) await notifyStep(r, next, cfg)
    if (next === 'CREATING') await require('./sap/creation-queue').enqueue(id)
    return { status: next, startCreation: next === 'CREATING' }
  }

  if (action === 'sendBack') {
    if (!comment) fail(422, 'INVALID', 'Please tell the vendor what to change.', { errors: { message: 'Please tell the vendor what to change.' } })
    const sections = (Array.isArray(payload.sections) ? payload.sections : []).filter(s => ['company', 'contacts', 'tax', 'bank', 'documents'].includes(s))
    await INSERT.into(E.S).entries({ ID: cds.utils.uuid(), request_ID: id, round: r.round, step: step.code, decision: 'SENT_BACK', userId: actor.id, userName: actor.name, comment, decidedAt: iso(now()) })
    await UPDATE(E.R).set({ status: 'RETURNED', currentStep: null, stepSince: iso(now()), returnMessage: comment, returnSections: sections.join(','), sapSimulatedOk: false }).where({ ID: id })
    await U.audit(id, actor, 'SENT_BACK', `Sent back to the vendor at ${step.label}: ${comment}`)
    await sendInvite(r, cfg, 'sentBack', { message: comment })
    return { status: 'RETURNED' }
  }

  if (action === 'reject') {
    if (!comment) fail(422, 'INVALID', 'Please give a reason for rejecting.', { errors: { reason: 'Please give a reason for rejecting.' } })
    await rejectNow(actor, r, step, comment, cfg)
    return { status: 'REJECTED' }
  }
  fail(400, 'BAD_ACTION', 'Unknown action.')
}

/**
 * The requester reclassified the vendor at requester review (still the first step,
 * so no later approval exists yet). The route snapshot and the vendor's obligations
 * were derived from the old classification, so re-derive both:
 *  - if the new classification needs data or documents the vendor has not given
 *    (e.g. RCT number and sub-contractor documents), refuse; the requester sends it back;
 *  - otherwise re-resolve the route from current configuration and save it as the
 *    request's snapshot (requester review stays first, as it is the step in progress).
 * Throwing rolls back the classification change with the surrounding transaction.
 */
async function reassessAfterRequesterChange (actor, r, cfg) {
  const ctx = ctxFor(r, cfg)
  const errors = V.validateAll(r, ctx)
  const docs = await SELECT.from(E.D).columns('ID', 'docType', 'validUntil', 'scanStatus').where({ request_ID: r.ID })
  const missing = missingDocuments(r, cfg, docs)
  if (Object.keys(errors).length || missing.length) {
    const needs = [...new Set([...Object.keys(errors).map(k => { const f = V.FIELDS.find(x => x.key === k); return f ? V.labelOf(f, ctx) : k }), ...missing.map(m => m.label)])]
    fail(422, 'VENDOR_INPUT_NEEDED', `With this change the vendor must also provide: ${needs.join(', ')}. Send the request back to the vendor and ask for these instead.`, { errors, missing })
  }
  const before = W.routeFor(r)
  const route = require('./approval-routes').resolve(cfg.approvalRoutes, r, { ...cfg.settings, requesterReviewEnabled: true })
  r.routeSnapshot = JSON.stringify(route)
  await UPDATE(E.R).set({ routeSnapshot: r.routeSnapshot }).where({ ID: r.ID })
  const summary = x => x.steps.map(s => s.short).join(' → ')
  if (before.name !== route.name || summary(before) !== summary(route)) {
    await U.audit(r.ID, actor, 'ROUTE_REASSIGNED', `Route changed after reclassification: ${before.name} (${summary(before)}) → ${route.name} (${summary(route)})`)
  }
}

async function rejectNow (actor, r, step, reason, cfg) {
  await INSERT.into(E.S).entries({ ID: cds.utils.uuid(), request_ID: r.ID, round: r.round, step: step?.code || 'ADMIN', decision: 'REJECTED', userId: actor.id, userName: actor.name, comment: reason, decidedAt: iso(now()) })
  await UPDATE(E.R).set({ status: 'REJECTED', currentStep: null, rejectReason: reason, closedAt: iso(now()) }).where({ ID: r.ID })
  await UPDATE(E.T).set({ revoked: true }).where({ request_ID: r.ID })
  await U.audit(r.ID, actor, 'REJECTED', `Rejected${step ? ' at ' + step.label : ''}: ${reason}`)
  await mail.send({ to: r.vendorEmail, template: 'rejectedVendor', requestId: r.ID, data: { contactName: r.vendorContactName, companyName: r.companyName, ref: r.requestNumber } })
  if (r.requesterId !== actor.id) {
    await mail.send({ to: r.requesterEmail, template: 'rejectedRequester', requestId: r.ID, actionUrl: internalLink(cfg, r.ID), data: { companyName: r.companyName, ref: r.requestNumber, by: actor.name, reason, link: internalLink(cfg, r.ID) } })
  }
}

const NUMBER_SOURCES = ['INDEPENDENT_BANK', 'INDEPENDENT_WEBSITE', 'EXISTING_RECORD', 'VENDOR_PROVIDED']

async function recordBankVerification (actor, id, input) {
  const r = await load(id)
  const inFinance = W.routeFor(r).bankCheckMode === 'IN_FINANCE' && r.status === 'PENDING_FINANCE'
  if (r.status !== 'PENDING_BANK_CHECK' && !inFinance) fail(409, 'WRONG_STATUS', 'The bank call-back is available only at the configured bank or Finance step.')
  const can = await canAct(actor, r, await decisionsOf(id))
  if (!can.ok) fail(403, 'NOT_ALLOWED', can.reason)
  const errors = {}
  if (V.checkPhone(input.numberCalled)) errors.numberCalled = 'Please enter the number you called.'
  if (!NUMBER_SOURCES.includes(input.numberSource)) errors.numberSource = 'Please say where the number came from.'
  if (!String(input.personSpokenTo || '').trim()) errors.personSpokenTo = 'Please enter who you spoke to.'
  if (!['CONFIRMED', 'NOT_CONFIRMED'].includes(input.outcome)) errors.outcome = 'Please choose the outcome.'
  const calledAt = input.calledAt ? new Date(input.calledAt) : now()
  if (isNaN(calledAt) || calledAt > U.addMinutes(now(), 5)) errors.calledAt = 'Please enter when you called (not in the future).'
  if (Object.keys(errors).length) fail(422, 'INVALID', 'Please check the call-back details.', { errors })
  const row = {
    ID: cds.utils.uuid(), request_ID: id, round: r.round, ibanChecked: r.iban || r.bankAccountNo,
    numberCalled: String(input.numberCalled).trim(), numberSource: input.numberSource,
    personSpokenTo: String(input.personSpokenTo).trim().slice(0, 80), calledAt: iso(calledAt), outcome: input.outcome,
    notes: String(input.notes || '').slice(0, 1000), userId: actor.id, userName: actor.name, recordedAt: iso(now()),
  }
  await INSERT.into(E.B).entries(row)
  const src = { INDEPENDENT_BANK: 'number from the bank', INDEPENDENT_WEBSITE: 'number from the vendor\'s website', EXISTING_RECORD: 'number already on file', VENDOR_PROVIDED: 'number given on the form (not independent)' }[row.numberSource]
  await U.audit(id, actor, 'BANK_CALLBACK', `Call-back ${row.outcome === 'CONFIRMED' ? 'confirmed' : 'NOT confirmed'}: spoke to ${row.personSpokenTo} on ${row.numberCalled} (${src})`)
  return row
}

function financeDefaults (r, cfg) {
  const at = byCode(cfg.accountTypes, r.accountType)
  const cc = cfg.companyCodes.find(c => c.code === r.companyCode)
  const whtType = r.whtType ?? (at?.subcontractor ? (r.country === 'GB' ? 'CI' : at.whtType) : null)
  return {
    reconAccount: r.reconAccount || at?.reconAccount || '',
    paymentMethods: r.paymentMethods || (r.country === 'IE' || r.country === 'GB' ? 'T' : 'U'),
    whtType: whtType || '',
    whtCode: r.whtCode || '',
    purchasingOrg: r.purchasingOrg || cc?.purchasingOrg || '',
    grBasedIv: r.grBasedIv !== false,
    createMissingBank: !!r.createMissingBank,
  }
}

async function setFinanceData (actor, id, input) {
  const r = await load(id)
  if (r.status === 'PENDING_FINANCE') {
    const can = await canAct(actor, r, await decisionsOf(id))
    if (!can.ok) fail(403, 'NOT_ALLOWED', can.reason)
  } else if (r.status === 'SAP_ERROR') {
    if (!isAdmin(actor)) fail(403, 'NOT_ALLOWED', 'Only a master data admin can correct data after an SAP error.')
  } else fail(409, 'WRONG_STATUS', 'Finance data can only be changed at the finance step or after an SAP error.')
  const cfg = await config()
  const patch = {}
  const errors = {}
  if (input.reconAccount !== undefined) { if (!/^\d{1,10}$/.test(String(input.reconAccount))) errors.reconAccount = 'Reconciliation accounts are up to 10 digits.'; else patch.reconAccount = String(input.reconAccount) }
  if (input.paymentMethods !== undefined) { if (!/^[A-Z0-9]{0,10}$/i.test(String(input.paymentMethods))) errors.paymentMethods = 'Use payment method letters only, for example T.'; else patch.paymentMethods = String(input.paymentMethods).toUpperCase() }
  if (input.purchasingOrg !== undefined) { if (!/^[A-Z0-9]{0,4}$/i.test(String(input.purchasingOrg))) errors.purchasingOrg = 'A purchasing org has up to 4 characters.'; else patch.purchasingOrg = String(input.purchasingOrg).toUpperCase() }
  if (input.whtType !== undefined || input.whtCode !== undefined) {
    const t = input.whtType ?? r.whtType, c = input.whtCode ?? r.whtCode
    if (c && !cfg.whtCodes.find(w => w.companyCode === r.companyCode && w.whtType === t && w.code === c)) errors.whtCode = 'Choose a withholding tax code from the list.'
    else { patch.whtType = t || null; patch.whtCode = c || null }
  }
  if (input.grBasedIv !== undefined) patch.grBasedIv = !!input.grBasedIv
  if (input.createMissingBank !== undefined) patch.createMissingBank = !!input.createMissingBank
  if (Object.keys(errors).length) fail(422, 'INVALID', 'Please check the finance data.', { errors })
  patch.sapSimulatedOk = false
  await UPDATE(E.R).set(patch).where({ ID: id })
  await U.audit(id, actor, 'FINANCE_DATA', `Finance data updated (${Object.keys(patch).filter(k => k !== 'sapSimulatedOk').join(', ')})`)
  return { ...financeDefaults({ ...r, ...patch }, cfg) }
}

async function payloadFor (r, cfg, testRun) {
  const f = financeDefaults(r, cfg)
  const decisions = await decisionsOf(r.ID)
  return buildVendorPayload({ ...r, ...f, approvals: decisions.filter(d => d.round === r.round && d.decision === 'APPROVED') }, {
    accountType: byCode(cfg.accountTypes, r.accountType), paymentTerm: byCode(cfg.paymentTerms, r.paymentTerms),
    companyCode: cfg.companyCodes.find(c => c.code === r.companyCode),
  }, { testRun })
}

async function simulate (actor, id) {
  const r = await load(id)
  if (r.status === 'PENDING_FINANCE') {
    const can = await canAct(actor, r, await decisionsOf(id))
    if (!can.ok) fail(403, 'NOT_ALLOWED', can.reason)
  } else if (!(r.status === 'SAP_ERROR' && isAdmin(actor))) fail(409, 'WRONG_STATUS', 'Simulation is available at the finance step.')
  const cfg = await config()
  const payload = await payloadFor(r, cfg, true)
  let out
  try {
    const res = await sap().createVendor(payload)
    out = { ok: true, messages: res.messages || [], plain: 'SAP checked everything and found no errors. Nothing was saved.' }
  } catch (e) {
    out = { ok: false, messages: e.messages || [{ type: 'E', text: e.message }], plain: plainEnglish(e.messages || [{ type: 'E', text: e.message }]) }
  }
  out.at = iso(now())
  await UPDATE(E.R).set({ sapSimulatedOk: out.ok, sapSimulatedAt: out.at, sapSimulationJson: JSON.stringify(out) }).where({ ID: id })
  await U.audit(id, actor, 'SAP_SIMULATED', out.ok ? 'SAP simulation passed' : `SAP simulation failed: ${out.plain}`)
  return out
}

async function justifyDuplicate (actor, id, text) {
  const r = await load(id)
  const can = await canAct(actor, r, await decisionsOf(id))
  if (!can.ok) fail(403, 'NOT_ALLOWED', can.reason)
  const t = String(text || '').trim()
  if (t.length < 10) fail(422, 'INVALID', 'Please explain in a sentence why a new vendor is needed.', { errors: { text: 'Please explain in a sentence.' } })
  await UPDATE(E.R).set({ duplicateJustification: t.slice(0, 500) }).where({ ID: id })
  await U.audit(id, actor, 'DUPLICATE_JUSTIFIED', `Possible duplicate accepted: ${t.slice(0, 300)}`)
  return {}
}

async function retry (actor, id, input = {}) {
  if (!isAdmin(actor)) fail(403, 'NOT_ALLOWED', 'Only a master data admin can retry SAP creation.')
  const r = await load(id)
  if (r.status !== 'SAP_ERROR' && r.status !== 'CREATED') fail(409, 'WRONG_STATUS', 'Only requests with an SAP error can be retried.')
  if (r.status === 'CREATED') return { status: 'CREATED', vendorNumber: r.sapVendorNumber, result: 'ALREADY_CREATED' }
  if (input.createMissingBank !== undefined || input.reconAccount !== undefined) await setFinanceData(actor, id, input)
  await UPDATE(E.R).set({ status: 'CREATING', currentStep: null, stepSince: iso(now()) }).where({ ID: id, status: 'SAP_ERROR' })
  await U.audit(id, actor, 'SAP_RETRY', 'Retrying SAP creation')
  await require('./sap/creation-queue').enqueue(id)
  return { status: 'CREATING', startCreation: true }
}

async function adminReject (actor, id, reason) {
  if (!isAdmin(actor)) fail(403, 'NOT_ALLOWED', 'Only a master data admin can reject after an SAP error.')
  const r = await load(id)
  if (r.status !== 'SAP_ERROR') fail(409, 'WRONG_STATUS', 'Use the normal approval actions for this request.')
  if (!String(reason || '').trim()) fail(422, 'INVALID', 'Please give a reason for rejecting.')
  await rejectNow(actor, r, null, String(reason).trim().slice(0, 500), await config())
  return { status: 'REJECTED' }
}

// ------------------------------------------------------------------ SAP creation (background)

const pending = new Set()
const delays = () => cds.env.requires?.vob?.retryDelays || [0, 2000, 5000]

/** Start creation after the approving transaction has committed. */
function startCreation (_id) {
  const job = new Promise(resolve => setImmediate(resolve)).then(async () => {
    cds.context = { user: cds.User.privileged }
    await require('./sap/creation-queue').flush()
  }).catch(e => LOG.error('SAP creation job failed', e)).finally(() => pending.delete(job))
  pending.add(job)
  return job
}

async function idle () {
  while (pending.size) await Promise.all([...pending])
  await require('./sap/creation-queue').idle()
}

async function createInSap (id, { attempt = 1 } = {}) {
  const tx = fn => cds.tx(fn)
  const r = await tx(() => SELECT.one.from(E.R).where({ ID: id }))
  if (!r || r.status !== 'CREATING') return
  const cfg = await tx(() => config())
  const payload = await tx(() => payloadFor(r, cfg, false))
  let result, error
  try {
    result = await sap().createVendor(payload)
  } catch (e) {
    error = e
    await tx(() => UPDATE(E.R).set({ sapAttempts: (r.sapAttempts || 0) + 1 }).where({ ID: id }))
    if (e.kind === 'TRANSIENT' && attempt < delays().length) throw e
  }
  if (error) {
    const messages = error.messages || [{ type: 'E', text: error.message }]
    const plain = plainEnglish(messages)
    await tx(async () => {
      await UPDATE(E.R).set({ status: 'SAP_ERROR', sapMessagesJson: JSON.stringify({ messages, plain, kind: error.kind || 'UNKNOWN' }) }).where({ ID: id })
      await U.audit(id, U.SYSTEM, 'SAP_ERROR', plain, { messages })
      const link = `${base(cfg)}/internal/#/admin/sap-errors`
      await mail.send({ to: await mail.roleRecipients(W.ROLES.ADMIN), template: 'sapError', requestId: id, actionUrl: link, data: { companyName: r.companyName, ref: r.requestNumber, message: plain, link } })
    })
    return
  }
  await tx(async () => {
    await UPDATE(E.R).set({ status: 'CREATED', sapVendorNumber: result.vendorNumber, createdInSapAt: iso(now()), closedAt: iso(now()), currentStep: null, sapMessagesJson: JSON.stringify({ messages: result.messages, result: result.result }) }).where({ ID: id })
    await U.audit(id, U.SYSTEM, 'CREATED', result.result === 'ALREADY_CREATED' ? `SAP already had vendor ${result.vendorNumber} for this request (no duplicate created)` : `Vendor ${result.vendorNumber} created in SAP company code ${r.companyCode}`)
  })
  // attachments: FIN-010 PDF + documents (failure here never undoes the creation)
  try {
    const pdf = await tx(() => fin010(id))
    await sap().addAttachment(result.vendorNumber, { fileName: `FIN-010-${r.requestNumber}.pdf`, mimeType: 'application/pdf', contentBase64: pdf.toString('base64'), description: 'FIN-010 vendor set-up form with approval trail' })
    const docs = await tx(() => SELECT.from(E.D).columns('fileName', 'mimeType', 'content', 'docType').where({ request_ID: id, scanStatus: 'CLEAN' }))
    for (const d of docs) {
      const buf = await toBuffer(d.content)
      await sap().addAttachment(result.vendorNumber, { fileName: `${d.docType}-${d.fileName}`, mimeType: d.mimeType, contentBase64: buf.toString('base64') })
    }
    await tx(async () => {
      await UPDATE(E.R).set({ pdfAttached: true }).where({ ID: id })
      await U.audit(id, U.SYSTEM, 'ATTACHED', `FIN-010 PDF and ${docs.length} document(s) attached to vendor ${result.vendorNumber} in SAP`)
    })
  } catch (e) {
    LOG.error('Attaching documents failed', e)
    await tx(() => U.audit(id, U.SYSTEM, 'ATTACH_FAILED', `The vendor was created, but attaching the documents in SAP failed: ${e.message}`))
  }
  await tx(async () => {
    const fresh = await SELECT.one.from(E.R).where({ ID: id })
    const link = internalLink(cfg, id)
    await mail.send({ to: fresh.requesterEmail, template: 'createdRequester', requestId: id, actionUrl: link, data: { companyName: fresh.companyName, vendorNumber: fresh.sapVendorNumber, companyCode: fresh.companyCode, link } })
    await mail.send({ to: fresh.vendorEmail, template: 'createdVendor', requestId: id, data: { contactName: fresh.vendorContactName, companyName: fresh.companyName, vendorNumber: fresh.sapVendorNumber } })
  })
}

async function toBuffer (v) {
  if (!v) return Buffer.alloc(0)
  if (Buffer.isBuffer(v)) return v
  if (typeof v === 'string') return Buffer.from(v, 'base64')
  if (typeof v.pipe === 'function' || v[Symbol.asyncIterator]) {
    const chunks = []
    for await (const c of v) chunks.push(Buffer.from(c))
    return Buffer.concat(chunks)
  }
  return Buffer.from(v)
}

async function fin010 (id) {
  const r = await load(id)
  const cfg = await config()
  const [documents, decisions, checks, events] = await Promise.all([
    SELECT.from(E.D).columns('docType').where({ request_ID: id, scanStatus: 'CLEAN' }),
    SELECT.from(E.S).where({ request_ID: id, round: r.round }),
    SELECT.from(E.B).where({ request_ID: id, round: r.round, outcome: 'CONFIRMED' }).orderBy('recordedAt desc'),
    SELECT.from(E.A).where({ request_ID: id }).orderBy('at'),
  ])
  return buildFin010({ request: r, countryName: byCode(cfg.countries, r.country)?.name, documents, decisions, bankCheck: checks[0], events })
}

async function document (actor, id, docId) {
  const d = await SELECT.one.from(E.D).columns('ID', 'fileName', 'mimeType', 'scanStatus', 'content', 'docType').where({ ID: docId, request_ID: id })
  if (!d) fail(404, 'NOT_FOUND', 'That document is not available.')
  if (d.scanStatus !== 'CLEAN') fail(423, 'NOT_SCANNED', 'This file has not passed the malware scan, so it can\'t be opened.')
  await U.audit(id, actor, 'DOCUMENT_VIEWED', `${d.docType}: ${d.fileName}`)
  return { fileName: d.fileName, mimeType: d.mimeType, content: await toBuffer(d.content) }
}

// ------------------------------------------------------------------ internal views

function waitingOn (r) {
  if (['INVITED', 'IN_PROGRESS', 'RETURNED'].includes(r.status)) return 'Vendor'
  const step = W.routeStep(r)
  if (step) return step.code === 'REQUESTER' ? r.requesterName : W.roleLabel(step.role)
  if (r.status === 'SAP_ERROR') return 'Master data admin'
  if (r.status === 'CREATING') return 'SAP'
  return ''
}

function rowOf (r, cfg, actor, decisions, bankChecks) {
  const info = W.STATUS_INFO[r.status]
  const step = W.routeStep(r)
  const inStep = r.stepSince ? U.workingDaysBetween(r.stepSince, now()) : 0
  const limit = step ? step.escalationDays || cfg.settings[step.escalate] || 5 : null
  return {
    ID: r.ID, requestNumber: r.requestNumber, companyName: r.companyName, vendorEmail: r.vendorEmail,
    status: r.status, statusLabel: info.label, tone: info.tone, open: info.open,
    waitingOn: waitingOn(r), stepSince: r.stepSince, workingDaysInStep: inStep,
    overSla: !!(step && inStep >= limit), daysOpen: U.daysBetween(r.createdAt, r.closedAt || now()),
    requesterName: r.requesterName, requesterId: r.requesterId, accountType: r.accountType, paymentTerms: r.paymentTerms, country: r.country,
    createdAt: r.createdAt, sapVendorNumber: r.sapVendorNumber, ibanTail: r.iban ? V.maskTail(r.iban) : '',
    duplicateBlocking: !!r.duplicateBlocking,
    canAct: actor ? W.canAct(actor, r, decisions.filter(d => d.request_ID === r.ID), bankChecks.filter(b => b.request_ID === r.ID)).ok : false,
  }
}

const LIST_COLUMNS = ['ID', 'requestNumber', 'companyName', 'vendorEmail', 'status', 'stepSince', 'createdAt', 'closedAt', 'requesterName', 'requesterId', 'accountType', 'paymentTerms', 'country', 'sapVendorNumber', 'iban', 'duplicateBlocking', 'round', 'createdInSapAt', 'routeSnapshot']

async function list (actor, { view = 'all', q = '' } = {}) {
  const cfg = await config()
  const rows = await SELECT.from(E.R).columns(...LIST_COLUMNS).orderBy('createdAt desc')
  const decisions = await SELECT.from(E.S).columns('request_ID', 'round', 'step', 'userId')
  const bankChecks = await SELECT.from(E.B).columns('request_ID', 'round', 'userId')
  let out = rows.map(r => rowOf(r, cfg, actor, decisions, bankChecks))
  if (view === 'waiting') out = out.filter(r => r.canAct)
  else if (view === 'mine') out = out.filter(r => r.requesterId === actor.id)
  else if (view === 'open') out = out.filter(r => r.open)
  else if (view === 'created') out = out.filter(r => r.status === 'CREATED')
  else if (view === 'closed') out = out.filter(r => ['REJECTED', 'EXPIRED', 'CANCELLED'].includes(r.status))
  else if (view === 'sap-errors') out = out.filter(r => r.status === 'SAP_ERROR')
  const term = String(q).trim().toLowerCase()
  if (term) out = out.filter(r => [r.companyName, r.requestNumber, r.vendorEmail, r.sapVendorNumber, r.requesterName].some(v => String(v || '').toLowerCase().includes(term)))
  return out
}

async function dashboard (actor) {
  const all = await list(actor, { view: 'all' })
  const cfg = await config()
  const created90 = await SELECT.from(E.R).columns('createdAt', 'createdInSapAt').where({ status: 'CREATED' })
  const recent = created90.filter(r => r.createdInSapAt && new Date(r.createdInSapAt) > U.addDays(now(), -90))
  const avg = recent.length ? recent.reduce((s, r) => s + (new Date(r.createdInSapAt) - new Date(r.createdAt)) / 86400000, 0) / recent.length : null
  const month = new Date().toISOString().slice(0, 7)
  const groups = [
    { key: 'vendor', label: 'With the vendor', statuses: ['INVITED', 'IN_PROGRESS', 'RETURNED'] },
    ...W.STEPS.map(s => ({ key: s.code, label: s.short, statuses: [s.status] })),
    { key: 'sap', label: 'SAP', statuses: ['CREATING', 'SAP_ERROR'] },
    { key: 'created', label: 'Created', statuses: ['CREATED'] },
  ]
  const events = await SELECT.from(E.A).columns('at', 'actorName', 'actorType', 'event', 'message', 'request_ID').orderBy('at desc').limit(14)
  const names = Object.fromEntries(all.map(r => [r.ID, { companyName: r.companyName, requestNumber: r.requestNumber }]))
  return {
    counts: {
      waitingForMe: all.filter(r => r.canAct).length,
      open: all.filter(r => r.open).length,
      overSla: all.filter(r => r.overSla).length,
      createdThisMonth: created90.filter(r => String(r.createdInSapAt || '').startsWith(month)).length,
      avgDaysToCreate: avg === null ? null : Math.round(avg * 10) / 10,
      sapErrors: all.filter(r => r.status === 'SAP_ERROR').length,
    },
    waiting: all.filter(r => r.canAct).slice(0, 8),
    mine: all.filter(r => r.requesterId === actor.id && r.open).slice(0, 6),
    pipeline: groups.map(g => ({ key: g.key, label: g.label, count: all.filter(r => g.statuses.includes(r.status)).length })),
    activity: events.map(e => ({ ...e, ...names[e.request_ID] })),
    settings: { escalationDays: cfg.settings.escalationDays },
  }
}

const canSeeBank = actor => [W.ROLES.BANK_CHECK, W.ROLES.FINANCE, W.ROLES.ADMIN].some(r => hasRole(actor, r))

function nextAction (r) {
  const step = W.routeStep(r)
  if (step) return `${step.label}: ${step.code === 'REQUESTER' ? r.requesterName + ' (requester)' : W.roleLabel(step.role)} reviews this request next.${step.code === 'FINANCE' && W.routeFor(r).bankCheckMode === 'IN_FINANCE' ? ' Finance must record a confirmed bank call-back before approving.' : ''} Usual time: ${step.reminderDays || (step.code === 'BANK_CHECK' ? 1 : 2)} working day(s). These are reminder targets, not guaranteed completion times.`
  return {
    INVITED: 'The vendor opens their invitation and confirms an email code. Invitations normally expire after 30 days.',
    IN_PROGRESS: 'The vendor completes the form and uploads documents. Submission selects and saves the matching approval route.',
    RETURNED: 'The vendor makes the requested changes and resubmits. All approval steps restart, including a fresh bank call-back.',
    SUBMITTED: 'The system checks the details and possible duplicates, then starts the saved approval route.',
    CREATING: 'The system creates the vendor in SAP. Usually a few moments; temporary failures are retried automatically.',
    SAP_ERROR: 'A master data administrator reviews the SAP error, corrects the allowed finance fields and retries. No completion time is guaranteed until the error is resolved.',
    CREATED: `Vendor ${r.sapVendorNumber || ''} is ready. The vendor and requester are notified; the completed form and documents are attached in SAP.`,
    REJECTED: 'This request is closed. The requester sees the reason; the vendor receives a neutral update.',
    CANCELLED: 'This request is closed. The requester can send a new invitation if onboarding is still needed.',
    EXPIRED: 'The requester can resend the invitation to provide a fresh secure link.',
  }[r.status] || 'The Jones team will review the current status.'
}

async function detail (actor, id, { revealBank = false } = {}) {
  const r = await load(id)
  const cfg = await config()
  const [decisions, bankChecks, documents, events, versions] = await Promise.all([
    decisionsOf(id),
    SELECT.from(E.B).where({ request_ID: id }).orderBy('recordedAt desc'),
    SELECT.from(E.D).columns('ID', 'docType', 'fileName', 'mimeType', 'size', 'validUntil', 'scanStatus', 'uploadedAt').where({ request_ID: id }),
    SELECT.from(E.A).where({ request_ID: id }).orderBy('at desc'),
    SELECT.from(E.VER).where({ request_ID: id }).orderBy('round desc'),
  ])
  const reveal = revealBank && canSeeBank(actor)
  if (revealBank && !reveal) fail(403, 'NOT_ALLOWED', 'Only the bank verifier, Financial Controller or admin can see full bank details.')
  if (reveal && r.iban) await U.audit(id, actor, 'BANK_DATA_VIEWED', 'Full bank details viewed')
  const data = {}
  for (const k of VENDOR_FIELDS) data[k] = r[k] ?? null
  data.notVatRegistered = !!r.notVatRegistered
  if (!reveal) {
    data.iban = r.iban ? V.maskIban(r.iban) : null
    data.bankAccountNo = r.bankAccountNo ? V.maskTail(r.bankAccountNo) : null
  }
  // changes since the previous submission
  let changes = []
  if (versions.length > 1) {
    const cur = U.parseJson(versions[0].snapshot, {}), prev = U.parseJson(versions[1].snapshot, {})
    changes = Object.keys(cur).filter(k => String(cur[k] ?? '') !== String(prev[k] ?? '')).map(k => ({
      key: k, label: V.FIELDS.find(f => f.key === k) ? V.labelOf(V.FIELDS.find(f => f.key === k), { country: r.country }) : k,
      bank: BANK_FIELDS.includes(k),
    }))
  }
  const terms = byCode(cfg.paymentTerms, r.paymentTerms)
  const route = r.routeSnapshot || r.round ? W.routeFor(r) : require('./approval-routes').resolve(cfg.approvalRoutes, r, cfg.settings)
  const steps = route.steps.map(s => {
    const d = decisions.filter(x => x.round === r.round && x.step === s.code).slice(-1)[0]
    const state = r.status === s.status ? 'current' : d?.decision === 'APPROVED' ? 'done' : 'todo'
    return { code: s.code, label: s.label, short: s.short, reminderDays: s.reminderDays, escalationDays: s.escalationDays, state, by: d?.userName, at: d?.decidedAt, decision: d?.decision }
  })
  const can = W.canAct(actor, r, decisions, bankChecks)
  const pendingStep = W.routeStep(r)
  const bankOk = await bankConfirmed(r, actor)
  const blocker = can.ok ? W.approvalBlocker(r, { bankConfirmed: bankOk, simulationValid: !!r.sapSimulatedOk }) : undefined
  const owner = r.requesterId === actor.id
  const missing = r.round > 0 ? missingDocuments(r, cfg, documents) : []
  const at = byCode(cfg.accountTypes, r.accountType)
  return {
    request: {
      ID: r.ID, requestNumber: r.requestNumber, status: r.status, statusInfo: W.STATUS_INFO[r.status], round: r.round,
      companyCode: r.companyCode, createdAt: r.createdAt, submittedAt: r.submittedAt, stepSince: r.stepSince,
      workingDaysInStep: r.stepSince ? U.workingDaysBetween(r.stepSince, now()) : 0, daysOpen: U.daysBetween(r.createdAt, r.closedAt || now()),
      waitingOn: waitingOn(r), currentStep: pendingStep ? { code: pendingStep.code, label: pendingStep.label } : null,
      requesterName: r.requesterName, requesterEmail: r.requesterEmail, businessReason: r.businessReason,
      accountType: r.accountType, accountTypeLabel: at?.label, subcontractor: !!at?.subcontractor,
      paymentTerms: r.paymentTerms, paymentTermsLabel: terms?.label, requiresProcurement: !!terms?.requiresProcurement, currency: r.currency,
      vendorContactName: r.vendorContactName, vendorEmail: r.vendorEmail, inviteExpiresAt: r.inviteExpiresAt,
      returnMessage: r.returnMessage, returnSections: r.returnSections, rejectReason: r.rejectReason,
      declarationName: r.declarationName, declarationAt: r.declarationAt,
      sapVendorNumber: r.sapVendorNumber, createdInSapAt: r.createdInSapAt, pdfAttached: !!r.pdfAttached,
      duplicateBlocking: !!r.duplicateBlocking, duplicateJustification: r.duplicateJustification,
      countryName: byCode(cfg.countries, r.country)?.name,
    },
    nextAction: nextAction(r),
    route: { name: route.name, bankCheckMode: route.bankCheckMode, saved: !!r.round, summary: route.steps.map(s => s.short).join(' → ') },
    data, bankRevealed: reveal, canSeeBank: canSeeBank(actor),
    duplicates: U.parseJson(r.duplicatesJson, null),
    simulation: U.parseJson(r.sapSimulationJson, null),
    sap: U.parseJson(r.sapMessagesJson, null),
    finance: financeDefaults(r, cfg),
    steps, decisions, bankChecks, documents, missingDocuments: missing, changes,
    bankChanged: changes.some(c => c.bank),
    events,
    allowed: {
      approve: can.ok && !blocker, approveBlocker: can.ok ? blocker : undefined,
      sendBack: can.ok, reject: can.ok, why: can.ok ? undefined : (pendingStep ? can.reason : undefined),
      bankCheck: can.ok && (r.status === 'PENDING_BANK_CHECK' || (r.status === 'PENDING_FINANCE' && route.bankCheckMode === 'IN_FINANCE')),
      finance: (can.ok && r.status === 'PENDING_FINANCE') || (r.status === 'SAP_ERROR' && isAdmin(actor)),
      simulate: (can.ok && r.status === 'PENDING_FINANCE') || (r.status === 'SAP_ERROR' && isAdmin(actor)),
      justify: can.ok && !!r.duplicateBlocking && !r.duplicateJustification,
      requesterEdit: can.ok && r.status === 'PENDING_REQUESTER',
      retry: r.status === 'SAP_ERROR' && isAdmin(actor),
      adminReject: r.status === 'SAP_ERROR' && isAdmin(actor),
      resend: (owner || isAdmin(actor)) && ['INVITED', 'IN_PROGRESS', 'RETURNED', 'EXPIRED'].includes(r.status),
      changeEmail: (owner || isAdmin(actor)) && r.status === 'INVITED',
      cancel: (owner || isAdmin(actor)) && !CLOSED.includes(r.status) && r.status !== 'CREATING',
      revealBank: canSeeBank(actor) && !!r.iban && !reveal,
      pdf: r.round > 0,
    },
    options: {
      accountTypes: cfg.accountTypes.map(a => ({ code: a.code, label: a.label })),
      paymentTerms: cfg.paymentTerms.map(p => ({ code: p.code, label: p.label, requiresProcurement: !!p.requiresProcurement })),
      currencies: cfg.currencies.map(c => ({ code: c.code, name: c.name })),
      whtCodes: cfg.whtCodes.filter(w => w.companyCode === r.companyCode),
      numberSources: NUMBER_SOURCES,
      vendorPhone: r.bankContactPhone, vendorContact: r.bankContactName,
    },
  }
}

// ------------------------------------------------------------------ jobs

async function runJobs () {
  const cfg = await config()
  const out = { expired: 0, reminders: 0, escalations: 0 }
  const open = await SELECT.from(E.R).where({ status: { in: ['INVITED', 'IN_PROGRESS', 'RETURNED', ...W.STEPS.map(s => s.status)] } })
  for (const r of open) {
    if (W.VENDOR_EDITABLE.includes(r.status)) {
      if (r.inviteExpiresAt && new Date(r.inviteExpiresAt) < now()) {
        await UPDATE(E.R).set({ status: 'EXPIRED', closedAt: iso(now()), currentStep: null }).where({ ID: r.ID, status: r.status })
        await UPDATE(E.T).set({ revoked: true }).where({ request_ID: r.ID })
        await U.audit(r.ID, U.SYSTEM, 'EXPIRED', 'The invite expired before the vendor submitted. The requester can resend it.')
        out.expired++
      }
      continue
    }
    const step = W.routeStep(r)
    if (!step || !r.stepSince) continue
    const days = U.workingDaysBetween(r.stepSince, now())
    if (days >= (step.escalationDays || cfg.settings[step.escalate] || 5) && !r.escalatedAt) {
      await notifyStep(r, r.status, cfg, 'Escalation: ')
      const admins = await mail.roleRecipients(W.ROLES.ADMIN)
      const link = internalLink(cfg, r.ID)
      await mail.send({ to: admins, template: 'task', requestId: r.ID, actionUrl: link, data: { companyName: r.companyName, ref: r.requestNumber, stepLabel: step.label, routeSummary: W.routeFor(r).steps.map(s => s.short).join(' → '), link, prefix: 'Escalation: ', waitingDays: days } })
      await UPDATE(E.R).set({ escalatedAt: iso(now()), lastReminderAt: iso(now()) }).where({ ID: r.ID })
      await U.audit(r.ID, U.SYSTEM, 'ESCALATED', `${step.label} waiting ${days} working days: escalated`)
      out.escalations++
    } else if (days >= (step.reminderDays || cfg.settings[step.remind] || 2) && !r.lastReminderAt) {
      await notifyStep(r, r.status, cfg, 'Reminder: ')
      await UPDATE(E.R).set({ lastReminderAt: iso(now()) }).where({ ID: r.ID })
      await U.audit(r.ID, U.SYSTEM, 'REMINDER', `${step.label} waiting ${days} working days: reminder sent`)
      out.reminders++
    }
  }
  // housekeeping: expired sessions and challenges
  await DELETE.from(E.P).where({ expiresAt: { '<': iso(now()) } })
  await DELETE.from(E.O).where({ expiresAt: { '<': iso(U.addDays(now(), -1)) } })
  out.anonymised = await anonymiseClosed(cfg)
  return out
}

/** Columns that hold vendor personal, tax or bank data, or free text that may quote it. */
const PERSONAL_COLUMNS = [...new Set([...VENDOR_FIELDS.filter(k => k !== 'country'), 'vendorContactName', 'declarationName', 'declarationIp',
  'returnMessage', 'returnSections', 'duplicatesJson', 'checksJson', 'duplicateJustification', 'sapSimulationJson', 'sapMessagesJson'])]

/**
 * Retention (design §10, setting retentionMonthsClosed, default 12): requests that
 * ended without a vendor (rejected, expired, cancelled) lose their personal and bank
 * data, documents, versions, call-back evidence, links, codes and stored emails.
 * Created vendors are kept (7-year rule; nothing is old enough yet). The request
 * row, its status/dates and the audit trail remain for statistics and audit.
 */
async function anonymiseClosed (cfg) {
  const months = Number(cfg.settings.retentionMonthsClosed || 12)
  const cutoff = new Date(now()); cutoff.setMonth(cutoff.getMonth() - months)
  const stale = await SELECT.from(E.R).columns('ID', 'requestNumber')
    .where({ status: { in: ['REJECTED', 'EXPIRED', 'CANCELLED'] }, anonymisedAt: null, closedAt: { '<': iso(cutoff) } })
  for (const r of stale) {
    const patch = Object.fromEntries(PERSONAL_COLUMNS.map(k => [k, null]))
    Object.assign(patch, {
      companyName: `Anonymised vendor ${r.requestNumber}`, vendorEmail: `anonymised-${String(r.requestNumber).toLowerCase()}@invalid`,
      notVatRegistered: false, duplicateBlocking: false, anonymisedAt: iso(now()),
    })
    await UPDATE(E.R).set(patch).where({ ID: r.ID })
    for (const entity of [E.D, E.VER, E.B, E.T, E.O, E.P, E.N]) await DELETE.from(entity).where({ request_ID: r.ID })
    await U.audit(r.ID, U.SYSTEM, 'ANONYMISED', `Personal, tax and bank data, documents and stored emails removed ${months} months after closing (retention policy)`)
  }
  return stale.length
}

module.exports = {
  E, config, load, ctxFor, createInvite, resendInvite, changeVendorEmail, cancel,
  vendorView, saveSection, uploadDocument, removeDocument, submit, missingDocuments,
  decide, recordBankVerification, setFinanceData, simulate, justifyDuplicate, retry, adminReject,
  startCreation, createInSap, idle, fin010, document, list, dashboard, detail, runJobs, vendorActor, financeDefaults,
}
