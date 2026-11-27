'use strict'
/* End-to-end API journey: invite, vendor code, form, submit, approvals, SAP. */
process.env.CDS_ENV = 'test'
const cds = require('@sap/cds')
const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')
const V = require('../srv/lib/validation')
const { EICAR } = require('../srv/lib/files')

const { GET, POST, PUT } = cds.test(path.join(__dirname, '..'))
const as = id => ({ auth: { username: id, password: '' }, headers: { 'x-requested-with': 'VOB' } })
const fails = async (p, status, re) => {
  try { await p } catch (e) { assert.equal(e.status ?? e.response?.status, status); if (re) assert.match(JSON.stringify(e.response?.data || e.message), re); return }
  assert.fail(`expected HTTP ${status}`)
}
const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF').toString('base64')

async function mail (template, n = 0) {
  const rows = await SELECT.from('jones.vob.Notifications').where({ template }).orderBy('createdAt desc')
  return rows[n]
}

async function vendorSession (link) {
  const token = new URL(link, 'http://x').searchParams.get('t')
  await POST('/api/portal/start', { token })
  const code = (await mail('otp')).code
  const res = await POST('/api/portal/verify', { token, code })
  const sc = res.headers['set-cookie']
  const cookie = String(Array.isArray(sc) ? sc[0] : sc).split(';')[0]
  const h = { headers: { cookie, 'x-vob-csrf': res.data.csrf } }
  return { token, h }
}

async function submittedExample (suffix, options = {}) {
  const out = (await POST('/api/internal/requests', { companyName: `Route ${suffix} Demo Ltd`, vendorContactName: 'Route Tester', vendorEmail: `route-${suffix}@example.test`, accountType: 'YBIV', paymentTerms: '60EOM', businessReason: 'Route acceptance test', country: 'IE', ...options }, as('rachel'))).data
  const session = await vendorSession(out.devLink)
  await POST('/api/portal/demo-fill', { section: 'all' }, session.h)
  await POST('/api/portal/submit', { declarationName: 'Route Tester', accept: true }, session.h)
  return { ...out, session }
}

describe('vendor onboarding journey', () => {
  let id, link, h

  test('requester invites a vendor', async () => {
    const { data } = await POST('/api/internal/requests', { companyName: 'Test Sub Ltd', vendorContactName: 'Tess', vendorEmail: 'tess@test-sub.test', accountType: 'YBVE', paymentTerms: '30EOM', businessReason: 'Test', country: 'IE' }, as('rachel'))
    id = data.ID; link = data.devLink
    assert.match(data.requestNumber, /^VOB-\d{4}-\d{5}$/)
    await fails(POST('/api/internal/requests', { companyName: 'X' }, as('fiona')), 403)
    await fails(POST('/api/internal/requests', { companyName: 'X' }, { auth: { username: 'rachel', password: '' } }), 403, /reload/)
  })

  test('wrong codes lock; right code opens a session', async () => {
    const token = new URL(link, 'http://x').searchParams.get('t')
    await fails(POST('/api/portal/start', { token: 'nonsense-token-that-is-long-enough' }), 410)
    await POST('/api/portal/start', { token })
    await fails(POST('/api/portal/verify', { token, code: '000000' }), 401, /4 tries/)
    const s = await vendorSession(link)
    h = s.h
    const me = await GET('/api/portal/me', h)
    assert.equal(me.data.reference.startsWith('VOB-'), true)
    await fails(PUT('/api/portal/sections/company', { data: {} }, { headers: { cookie: h.headers.cookie } }), 403)
  })

  test('vendor fills the form, uploads, and submit needs every sub-contractor document', async () => {
    await PUT('/api/portal/sections/company', { data: { country: 'IE', companyName: 'Test Sub Ltd', street: '1 Main St', city: 'Dublin', postCode: 'D04HN50' } }, h)
    await PUT('/api/portal/sections/contacts', { data: { accountsContactName: 'Tess', accountsEmail: 'ap@test-sub.test' } }, h)
    await PUT('/api/portal/sections/tax', { data: { vatNumber: 'IE1234567T', rctNumber: '1234567T' } }, h)
    const bank = await PUT('/api/portal/sections/bank', { data: { iban: 'IE29 AIBK 9311 5212 3456 78', bic: 'AIBKIE2D', bankName: 'AIB', bankAddress: 'Dublin', bankContactName: 'Tess', bankContactPhone: '+353 1 555 0000' } }, h)
    assert.equal(bank.data.derived.sortCode, '931152')
    await fails(POST('/api/portal/documents', { docType: 'BANK_LETTER', fileName: 'x.exe', content: Buffer.from('MZ...').toString('base64') }, h), 415)
    await fails(POST('/api/portal/documents', { docType: 'BANK_LETTER', fileName: 'v.pdf', content: Buffer.from('%PDF-1.4 ' + EICAR).toString('base64') }, h), 422, /virus/)
    await POST('/api/portal/documents', { docType: 'BANK_LETTER', fileName: 'bank.pdf', content: pdf }, h)
    await fails(POST('/api/portal/submit', { declarationName: 'Tess', accept: true }, h), 422, /INSURANCE/)
    const future = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10)
    for (const t of ['TAX_CLEARANCE', 'INSURANCE']) await POST('/api/portal/documents', { docType: t, fileName: 't.pdf', content: pdf, validUntil: future }, h)
    for (const t of ['SAFETY', 'SUBCONTRACT']) await POST('/api/portal/documents', { docType: t, fileName: 't.pdf', content: pdf }, h)
    const out = await POST('/api/portal/submit', { declarationName: 'Tess Test', accept: true }, h)
    assert.equal(out.data.status.code, 'PENDING_REQUESTER')
    const me = await GET('/api/portal/me', h)
    assert.match(me.data.data.iban, /••••/)
  })

  test('approvals enforce roles and segregation of duties; 30 EOM adds procurement', async () => {
    await fails(POST(`/api/internal/requests/${id}/approve`, {}, as('ronan')), 403, /invited this vendor|Only the person/)
    await POST(`/api/internal/requests/${id}/approve`, {}, as('rachel'))
    await fails(POST(`/api/internal/requests/${id}/approve`, {}, as('rachel')), 403)
    let d = (await GET(`/api/internal/requests/${id}`, as('priya'))).data
    assert.equal(d.request.status, 'PENDING_PROCUREMENT')
    await POST(`/api/internal/requests/${id}/approve`, {}, as('priya'))
    await fails(POST(`/api/internal/requests/${id}/approve`, {}, as('ben')), 409, /call-back/)
    const callback = await POST(`/api/internal/requests/${id}/bank-verification`, { numberCalled: '+353 1 555 0000', numberSource: 'INDEPENDENT_BANK', personSpokenTo: 'Callback Sentinel', outcome: 'CONFIRMED' }, as('ben'))
    assert.equal(callback.data.outcome, 'CONFIRMED')
    assert.equal(callback.data.round, 1)
    assert.ok(callback.data.recordedAt)
    assert.equal(callback.data.ibanChecked, undefined)
    assert.equal(callback.data.numberCalled, undefined)
    assert.ok(!JSON.stringify(callback.data).includes('IE29AIBK93115212345678'))
    await POST(`/api/internal/requests/${id}/approve`, {}, as('ben'))
    await fails(POST(`/api/internal/requests/${id}/approve`, {}, as('fiona')), 409, /Simulate/)
    d = (await GET(`/api/internal/requests/${id}`, as('fiona'))).data
    assert.equal(d.data.iban.includes('•'), true)
    const full = (await GET(`/api/internal/requests/${id}?reveal=bank`, as('fiona'))).data
    assert.equal(full.data.iban, 'IE29AIBK93115212345678')
    await fails(GET(`/api/internal/requests/${id}?reveal=bank`, as('rachel')), 403)
    await POST(`/api/internal/requests/${id}/finance`, { whtType: 'RC', whtCode: 'R2' }, as('fiona'))
    const sim = await POST(`/api/internal/requests/${id}/simulate`, {}, as('fiona'))
    assert.equal(sim.data.ok, true)
    const ok = await POST(`/api/internal/requests/${id}/approve`, {}, as('fiona'))
    assert.equal(ok.data.status, 'CREATING')
    await require('../srv/lib/requests').idle()
    d = (await GET(`/api/internal/requests/${id}`, as('fiona'))).data
    assert.equal(d.request.status, 'CREATED')
    assert.match(d.request.sapVendorNumber, /^8\d{5}$/)
    assert.equal(d.request.pdfAttached, true)
    const pdfRes = await GET(`/api/internal/requests/${id}/fin010.pdf`, as('fiona'))
    assert.equal(pdfRes.headers['content-type'], 'application/pdf')
    assert.ok((await mail('createdVendor')).subject.includes(d.request.sapVendorNumber))
  })

  test('bank data is role-projected across detail, evidence downloads and FIN-010', async () => {
    const secretIban = 'IE29AIBK93115212345678'
    const separatedIban = 'IE29-AIBK-9311-5212-3456-78'
    const separatedSortCode = '93 11 52'
    const secretPhone = '+353 1 555 0000'
    const secretBic = 'AIBKIE2D'
    const bankLetter = await SELECT.one.from('jones.vob.RequestDocuments').columns('ID').where({ request_ID: id, docType: 'BANK_LETTER' })
    await UPDATE('jones.vob.VendorRequests').set({
      businessReason: `Justification includes ${separatedIban} ${separatedSortCode} ${secretPhone} ${secretBic}`,
      rejectReason: `Reason includes ${secretIban}`,
      sapSimulationJson: JSON.stringify({ ok: false, plain: `SAP says ${separatedIban} and ${separatedSortCode}`, messages: [{ type: 'E', text: `Bank key ${secretIban}`, field: 'bank.iban' }] }),
      sapMessagesJson: JSON.stringify({ messages: [{ type: 'E', text: `SAP echoed ${secretPhone} ${secretBic}`, field: 'bank.iban' }] }),
    }).where({ ID: id })
    await UPDATE('jones.vob.RequestDocuments').set({ fileName: `evidence-${secretIban}.pdf` }).where({ ID: bankLetter.ID })
    const detail = (await GET(`/api/internal/requests/${id}`, as('rachel'))).data
    const serialized = JSON.stringify(detail)
    for (const secret of [secretIban, separatedIban, separatedSortCode, '931152', secretPhone, secretBic, 'Callback Sentinel']) assert.ok(!serialized.includes(secret), `request detail exposed ${secret}`)
    assert.ok(!serialized.includes(`evidence-${secretIban}`))
    assert.ok(detail.simulation.messages.every(m => m.text === undefined))
    assert.ok(detail.sap.messages.every(m => m.text === undefined))
    assert.ok(detail.request.businessReason.includes('[restricted]'))
    assert.ok(detail.request.rejectReason.includes('[restricted]'))
    assert.equal(detail.data.iban.includes('•'), true)
    assert.equal(detail.data.sortCode.includes('•'), true)
    assert.equal(detail.data.bankContactName, null)
    assert.equal(detail.options.vendorPhone, null)
    assert.equal(detail.options.vendorContact, null)
    assert.equal(detail.bankChecks[0].ibanChecked, undefined)
    assert.equal(detail.bankChecks[0].numberCalled, undefined)
    assert.equal(detail.bankChecks[0].personSpokenTo, undefined)
    assert.ok(detail.events.every(e => e.message === require('../srv/lib/util').auditMessage(e.event, e.message)))
    assert.ok(detail.events.some(e => e.event === 'BANK_CALLBACK' && /confirmed/i.test(e.message)))
    assert.equal(detail.allowed.pdf, false)

    await fails(GET(`/api/internal/requests/${id}/documents/${bankLetter.ID}`, as('rachel')), 403, /bank evidence/)
    await fails(GET(`/api/internal/requests/${id}/documents/${bankLetter.ID}`, as('aoife')), 403, /bank evidence/)
    await fails(GET(`/api/internal/requests/${id}/fin010.pdf`, as('aoife')), 403, /full FIN-010/)

    const auditLog = await cds.connect.to('audit-log')
    const original = auditLog.log, seen = []
    auditLog.log = async (event, data) => { seen.push({ event, data }) }
    try {
      const pdfResponse = await GET(`/api/internal/requests/${id}/fin010.pdf`, as('fiona'))
      assert.equal(pdfResponse.headers['content-type'], 'application/pdf')
      const documentResponse = await GET(`/api/internal/requests/${id}/documents/${bankLetter.ID}`, as('fiona'))
      assert.equal(documentResponse.headers['content-type'], 'application/pdf')
      assert.equal(seen.filter(x => x.event === 'SensitiveDataRead').length, 2)
      assert.ok(seen.every(x => !JSON.stringify(x).includes('IE29AIBK93115212345678')))
    } finally { auditLog.log = original }
  })

  test('non-IBAN bank-account reveal is permissioned and audited; callback response omits account data', async () => {
    const request = (await POST('/api/internal/requests', {
      companyName: 'US Routing Regression Ltd', vendorContactName: 'Taylor Example', vendorEmail: 'us-routing@example.test',
      accountType: 'YBIV', paymentTerms: '60EOM', currency: 'USD', country: 'US', businessReason: 'Synthetic security test',
    }, as('rachel'))).data
    await UPDATE('jones.vob.VendorRequests').set({
      status: 'PENDING_BANK_CHECK', round: 1, currentStep: 'BANK_CHECK',
      bankAccountNo: '12345678', sortCode: '021000021', iban: null, bic: 'CHASUS33',
      bankName: 'Example US Bank', bankAddress: '1 Test Street, Boston', bankContactName: 'Taylor Example', bankContactPhone: '+16175550123',
    }).where({ ID: request.ID })

    const masked = (await GET(`/api/internal/requests/${request.ID}`, as('rachel'))).data
    assert.ok(masked.data.bankAccountNo.includes('•'))
    assert.equal(masked.allowed.revealBank, false)
    await fails(GET(`/api/internal/requests/${request.ID}?reveal=bank`, as('rachel')), 403)

    const auditLog = await cds.connect.to('audit-log')
    const original = auditLog.log, seen = []
    auditLog.log = async (event, data) => { seen.push({ event, data }) }
    try {
      const revealed = (await GET(`/api/internal/requests/${request.ID}?reveal=bank`, as('ben'))).data
      assert.equal(revealed.data.bankAccountNo, '12345678')
      assert.ok(seen.some(x => x.event === 'SensitiveDataRead' && x.data.attributes.some(a => a.name === 'bankAccountNo')))
      const callback = await POST(`/api/internal/requests/${request.ID}/bank-verification`, {
        numberCalled: '+16175550123', numberSource: 'INDEPENDENT_BANK', personSpokenTo: 'Taylor Example', outcome: 'CONFIRMED',
      }, as('ben'))
      assert.deepEqual(Object.keys(callback.data).sort(), ['outcome', 'recordedAt', 'round'])
      assert.ok(!JSON.stringify(callback.data).includes('12345678'))
    } finally { auditLog.log = original }
  })

  test('SAP error, admin allows bank creation, retry creates once', async () => {
    const { data } = await POST('/api/internal/requests', { companyName: 'SAPFAIL-BANK Test Ltd', vendorContactName: 'Sam', vendorEmail: 'sam@fail.test', accountType: 'YBIV', paymentTerms: '60EOM', businessReason: 'Test' }, as('ronan'))
    const s = await vendorSession(data.devLink)
    await PUT('/api/portal/sections/company', { data: { country: 'IE', companyName: 'SAPFAIL-BANK Test Ltd', street: '2 Main St', city: 'Cork', postCode: 'T12X70A' } }, s.h)
    await PUT('/api/portal/sections/contacts', { data: { accountsContactName: 'Sam', accountsEmail: 'ap@fail.test' } }, s.h)
    await PUT('/api/portal/sections/tax', { data: { vatNumber: 'IE7654321P' } }, s.h)
    await PUT('/api/portal/sections/bank', { data: { iban: V.makeIban('IE', 'ULSB98501013572400'), bic: 'ULSBIE2D', bankName: 'Ulster', bankAddress: 'Cork', bankContactName: 'Sam', bankContactPhone: '+353 21 555 0000' } }, s.h)
    await POST('/api/portal/documents', { docType: 'BANK_LETTER', fileName: 'bank.pdf', content: pdf }, s.h)
    await POST('/api/portal/submit', { declarationName: 'Sam', accept: true }, s.h)
    const x = data.ID
    await POST(`/api/internal/requests/${x}/approve`, {}, as('ronan'))
    await POST(`/api/internal/requests/${x}/bank-verification`, { numberCalled: '+353 21 555 0000', numberSource: 'EXISTING_RECORD', personSpokenTo: 'Sam', outcome: 'CONFIRMED' }, as('ben'))
    await POST(`/api/internal/requests/${x}/approve`, {}, as('ben'))
    await POST(`/api/internal/requests/${x}/simulate`, {}, as('fiona'))
    await POST(`/api/internal/requests/${x}/approve`, {}, as('fiona'))
    const R = require('../srv/lib/requests')
    await R.idle()
    let d = (await GET(`/api/internal/requests/${x}`, as('adam'))).data
    assert.equal(d.request.status, 'SAP_ERROR')
    assert.match(d.sap.plain, /doesn't know this bank/)
    await POST(`/api/internal/requests/${x}/retry`, { createMissingBank: true }, as('adam'))
    await R.idle()
    d = (await GET(`/api/internal/requests/${x}`, as('adam'))).data
    assert.equal(d.request.status, 'CREATED')
    const again = await POST(`/api/internal/requests/${x}/retry`, {}, as('adam'))
    assert.equal(again.data.result, 'ALREADY_CREATED')
  })

  test('dashboard, list and CSV export', async () => {
    const dash = (await GET('/api/internal/dashboard', as('aoife'))).data
    assert.ok(dash.counts.createdThisMonth >= 2)
    const csv = await GET('/api/internal/requests/export.csv', as('aoife'))
    assert.match(csv.data, /requestNumber/)
    await fails(GET('/api/internal/dashboard'), 401)
  })

  test('dev login refuses to load in production', () => {
    const prev = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    try { assert.throws(() => require('../srv/auth/dev-auth')(), /never run in production/) } finally { process.env.NODE_ENV = prev }
  })

  test('example data validates for IE and GB, including duplicate opt-in', async () => {
    const X = require('../srv/lib/demo-examples')
    for (const country of ['IE', 'GB']) {
      const a = X.example({ country }), b = X.example({ country })
      assert.notEqual(a.company.companyName, b.company.companyName)
      const data = { ...a.company, ...a.contacts, ...a.tax, ...a.bank }
      assert.deepEqual(V.validateAll(data, { country, subcontractor: true }), {})
      assert.equal(a.bank.accountHolder, a.company.companyName)
      assert.match(a.contacts.accountsEmail, /\.test$/)
      assert.equal(V.deriveFromIban(a.bank.iban).country, country)
    }
    assert.equal(X.example({ duplicate: true }).tax.vatNumber, 'IE6388047V')
  })

  test('demo whole-form fill uploads required PDFs through the real portal', async () => {
    const out = (await POST('/api/internal/requests', { companyName: 'Demo Fill Test Ltd', vendorContactName: 'Demo Tester', vendorEmail: 'fill@example.test', accountType: 'YBCS', paymentTerms: '60EOM', businessReason: 'Test' }, as('rachel'))).data
    const session = await vendorSession(out.devLink)
    const view = (await POST('/api/portal/demo-fill', { section: 'all' }, session.h)).data
    assert.equal(view.documents.length, view.documentTypes.filter(d => d.required).length)
    assert.ok(view.documents.every(d => d.scanStatus === 'CLEAN' && d.fileName.startsWith('demo-')))
    await POST('/api/portal/submit', { accept: true, declarationName: 'Demo Tester' }, session.h)
  })

  test('demo generator and both HTTP endpoints refuse production', async () => {
    const prev = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    try {
      assert.throws(() => require('../srv/lib/demo-examples').example(), /Not found/)
      await fails(GET('/api/dev/example'), 404)
      await fails(POST('/api/portal/demo-fill', { section: 'all' }), 404)
      assert.equal(require('../srv/routes/dev').enabled(), false)
    } finally { process.env.NODE_ENV = prev }
  })

  test('approval outbox write rolls back with its transaction', async () => {
    const queue = require('../srv/lib/sap/creation-queue')
    const jobId = cds.utils.uuid()
    await assert.rejects(cds.tx(async () => { await queue.enqueue(jobId); throw new Error('rollback test') }), /rollback test/)
    assert.equal(await SELECT.one.from('jones.vob.SapCreationJobs').where({ requestId: jobId }), undefined)
  })

  test('transient SAP failures persist backoff and resume; competing workers claim once', async () => {
    const queue = require('../srv/lib/sap/creation-queue')
    const mock = require('../srv/lib/sap/mock')
    const original = mock.createVendor
    const freshId = cds.utils.uuid()
    const r = await SELECT.one.from('jones.vob.VendorRequests').where({ ID: id })
    await cds.tx(async () => {
      await INSERT.into('jones.vob.VendorRequests').entries({ ...r, ID: freshId, requestNumber: 'VOB-2099-90002', companyName: 'Transient Queue Test Ltd', status: 'CREATING', sapVendorNumber: null })
      await queue.enqueue(freshId)
    })
    let calls = 0
    mock.createVendor = async payload => {
      if (++calls === 1) throw new (require('../srv/lib/sap/errors').SapTransientError)('Synthetic network failure')
      return original(payload)
    }
    try {
      await queue.flush()
      const waiting = await SELECT.one.from('jones.vob.SapCreationJobs').where({ requestId: freshId })
      assert.equal(waiting.state, 'READY')
      assert.equal(waiting.attempts, 1)
      assert.ok(waiting.nextAttemptAt)
      // A second module instance represents an independent worker's in-process state.
      delete require.cache[require.resolve('../srv/lib/sap/creation-queue')]
      const second = require('../srv/lib/sap/creation-queue')
      await Promise.all([queue.idle(), second.idle()])
      assert.equal(calls, 2)
      assert.equal((await SELECT.one.from('jones.vob.VendorRequests').where({ ID: freshId })).status, 'CREATED')
    } finally { mock.createVendor = original }
  })

  test('unmasked bank reads emit a plugin event with field names, never values', async () => {
    const auditLog = await cds.connect.to('audit-log')
    const original = auditLog.log, seen = []
    auditLog.log = async (event, data) => { seen.push({ event, data }) }
    try {
      await GET(`/api/internal/requests/${id}?reveal=bank`, as('fiona'))
      assert.equal(seen[0].event, 'SensitiveDataRead')
      assert.equal(seen[0].data.user, 'fiona.finance@jones.test')
      assert.equal(seen[0].data.object.id.ID, id)
      assert.ok(seen[0].data.attributes.some(a => a.name === 'iban'))
      assert.ok(seen[0].data.attributes.some(a => a.name === 'bankContactPhone'))
      assert.ok(!JSON.stringify(seen).includes('IE29AIBK'))
    } finally { auditLog.log = original }
  })

  test('default route has one business approval; admin edits do not change snapshots', async () => {
    const cfg = (await GET('/api/internal/config', as('adam'))).data
    const r = await submittedExample('default')
    const d = (await GET(`/api/internal/requests/${r.ID}`, as('rachel'))).data
    assert.deepEqual(d.steps.map(s => s.code), ['REQUESTER', 'BANK_CHECK', 'FINANCE'])
    assert.equal(d.steps.filter(s => !['REQUESTER', 'BANK_CHECK'].includes(s.code)).length, 1)
    const amended = cfg.approvalRoutes.map(x => x.ID === 'DEFAULT' ? { ...x, steps: 'PURCHASING,BANK_CHECK,FINANCE', name: 'New default' } : x)
    try {
      await fails(PUT('/api/internal/admin/routes', { routes: amended, requesterReviewEnabled: true }, as('rachel')), 403)
      await PUT('/api/internal/admin/routes', { routes: amended, requesterReviewEnabled: true }, as('adam'))
      const saved = (await GET(`/api/internal/requests/${r.ID}`, as('rachel'))).data
      assert.equal(saved.route.name, 'Default')
      assert.deepEqual(saved.steps.map(s => s.code), d.steps.map(s => s.code))
      const tester = (await POST('/api/internal/admin/routes/test', { vendor: { accountType: 'YBIV', paymentTerms: '60EOM', companyCode: 'IE01', country: 'IE' } }, as('adam'))).data
      assert.equal(tester.name, 'New default')
      await fails(PUT('/api/internal/admin/routes', { routes: amended.filter(x => x.ID !== 'DEFAULT'), requesterReviewEnabled: true }, as('adam')), 422, /default route/)
      await fails(PUT('/api/internal/admin/routes', { routes: amended.map(x => ({ ...x, steps: 'FINANCE,BANK_CHECK' })), requesterReviewEnabled: true }, as('adam')), 422, /Finance must be last/)
      const subcontract = await submittedExample('subcontract', { accountType: 'YBCS' })
      const sub = (await GET(`/api/internal/requests/${subcontract.ID}`, as('rachel'))).data
      assert.deepEqual(sub.steps.map(s => s.code), ['REQUESTER', 'PROCUREMENT', 'BANK_CHECK', 'FINANCE'])
    } finally { await PUT('/api/internal/admin/routes', { routes: cfg.approvalRoutes, requesterReviewEnabled: true }, as('adam')) }
  })

  test('requester reclassification re-resolves the route or asks the vendor for what is missing', async () => {
    // 60 -> 30 days EOM needs nothing new from the vendor: the saved route is re-derived.
    const terms = await submittedExample('reclassify-terms')
    await POST(`/api/internal/requests/${terms.ID}/approve`, { paymentTerms: '30EOM' }, as('rachel'))
    let d = (await GET(`/api/internal/requests/${terms.ID}`, as('rachel'))).data
    assert.equal(d.route.name, 'Short payment terms')
    assert.deepEqual(d.steps.map(s => s.code), ['REQUESTER', 'PROCUREMENT', 'BANK_CHECK', 'FINANCE'])
    assert.equal(d.request.status, 'PENDING_PROCUREMENT')
    assert.ok(d.events.some(e => e.event === 'ROUTE_REASSIGNED'))
    // Material supplier -> sub-contractor needs RCT and sub-contractor documents: refused, nothing changes.
    const sub = await submittedExample('reclassify-sub')
    await fails(POST(`/api/internal/requests/${sub.ID}/approve`, { accountType: 'YBCS' }, as('rachel')), 422, /Send the request back/)
    d = (await GET(`/api/internal/requests/${sub.ID}`, as('rachel'))).data
    assert.equal(d.request.accountType, 'YBIV')
    assert.equal(d.request.status, 'PENDING_REQUESTER')
    assert.equal(d.route.name, 'Default')
  })

  test('route editor refuses Requester review as a route step', async () => {
    const cfg = (await GET('/api/internal/config', as('adam'))).data
    const withRequester = cfg.approvalRoutes.map(x => x.ID === 'DEFAULT' ? { ...x, steps: 'REQUESTER,BANK_CHECK,FINANCE' } : x)
    await fails(PUT('/api/internal/admin/routes', { routes: withRequester, requesterReviewEnabled: true }, as('adam')), 422, /Requester review first/)
  })

  test('starting configuration is inserted only where missing, never over admin changes', async () => {
    const seed = require('../srv/lib/seed-config')
    await cds.tx(async () => {
      await UPDATE('jones.vob.Settings').set({ value: '7' }).where({ name: 'reminderDays' })
      await DELETE.from('jones.vob.Settings').where({ name: 'otpMinutes' })
      const added = await seed.seed({ production: true })
      assert.deepEqual(added, { Settings: 1 })
      const s = Object.fromEntries((await SELECT.from('jones.vob.Settings')).map(r => [r.name, r.value]))
      assert.equal(s.reminderDays, '7')
      assert.equal(s.otpMinutes, '10')
      await UPDATE('jones.vob.Settings').set({ value: '2' }).where({ name: 'reminderDays' })
    })
    // Admin-editable tables are no longer HDI table data (a redeploy would overwrite them).
    const fs = require('fs')
    for (const t of seed.TABLES) assert.ok(!fs.existsSync(`db/data/jones.vob-${t}.csv`), `${t} must not be in db/data`)
  })

  test('retention anonymises closed requests after the configured months; recent ones are kept', async () => {
    const R = require('../srv/lib/requests')
    const old = await submittedExample('retention-old')
    const recent = await submittedExample('retention-recent')
    for (const r of [old, recent]) await POST(`/api/internal/requests/${r.ID}/reject`, { reason: 'Synthetic retention test' }, as('rachel'))
    await cds.tx(async () => {
      await UPDATE('jones.vob.VendorRequests').set({ closedAt: new Date(Date.now() - 400 * 86400000).toISOString() }).where({ ID: old.ID })
      // Model legacy audit content written before event-message minimisation.
      await INSERT.into('jones.vob.AuditEvents').entries({
        ID: cds.utils.uuid(), request_ID: old.ID, at: new Date().toISOString(), actorType: 'VENDOR',
        actorId: 'legacy-vendor@example.test', actorName: 'Legacy Callback Person', event: 'BANK_CALLBACK',
        message: 'Called +353 1 555 0123; confirmed IE29AIBK93115212345678 with Legacy Callback Person',
        details: JSON.stringify({ email: 'legacy-vendor@example.test', phone: '+353 1 555 0123' }),
      })
      const out = await R.runJobs()
      assert.equal(out.anonymised, 1)
    })
    const gone = await SELECT.one.from('jones.vob.VendorRequests').where({ ID: old.ID })
    assert.ok(gone.anonymisedAt)
    assert.equal(gone.iban, null); assert.equal(gone.vatNumber, null); assert.equal(gone.accountsEmail, null)
    assert.match(gone.companyName, /^Anonymised vendor/); assert.match(gone.vendorEmail, /@invalid$/)
    assert.equal(gone.status, 'REJECTED')
    for (const t of ['RequestDocuments', 'RequestVersions', 'Notifications', 'InviteTokens']) {
      assert.equal((await SELECT.from(`jones.vob.${t}`).where({ request_ID: old.ID })).length, 0, t)
    }
    assert.equal((await SELECT.from('jones.vob.ApprovalSteps').where({ request_ID: old.ID })).length, 0)
    const oldEvents = await SELECT.from('jones.vob.AuditEvents').where({ request_ID: old.ID })
    assert.ok(oldEvents.some(e => e.event === 'ANONYMISED'))
    const oldAuditText = JSON.stringify(oldEvents)
    for (const secret of ['legacy-vendor@example.test', 'Legacy Callback Person', '+353 1 555 0123', 'IE29AIBK93115212345678']) assert.ok(!oldAuditText.includes(secret), `retained audit exposed ${secret}`)
    assert.ok(oldEvents.filter(e => e.actorType === 'VENDOR').every(e => e.actorId === 'anonymised' && e.actorName === 'Vendor'))
    const kept = await SELECT.one.from('jones.vob.VendorRequests').where({ ID: recent.ID })
    assert.equal(kept.anonymisedAt, null); assert.ok(kept.iban)
    // A second run finds nothing more to do.
    assert.equal((await cds.tx(() => R.runJobs())).anonymised, 0)
  })

  test('privacy notice link is https-only and reaches the vendor portal when set', async () => {
    await fails(PUT('/api/internal/admin/config/Settings', { name: 'privacyNoticeUrl', value: 'javascript:alert(1)' }, as('adam')), 422, /https/)
    const r = await submittedExample('privacy')
    assert.equal((await GET('/api/portal/me', r.session.h)).data.privacyNoticeUrl, null)
    await PUT('/api/internal/admin/config/Settings', { name: 'privacyNoticeUrl', value: 'https://privacy.example.test/vendors' }, as('adam'))
    try {
      assert.equal((await GET('/api/portal/me', r.session.h)).data.privacyNoticeUrl, 'https://privacy.example.test/vendors')
    } finally { await PUT('/api/internal/admin/config/Settings', { name: 'privacyNoticeUrl', value: '' }, as('adam')) }
  })

  test('IN_FINANCE route: requester review off, call-back gated, fresh after bank send-back', async () => {
    const cfg = (await GET('/api/internal/config', as('adam'))).data
    const lowRisk = { ID: 'LOW_RISK_TEST', priority: 1, name: 'Low-risk Finance', active: true, accountTypes: 'YBIV', country: 'IE', steps: 'FINANCE', bankCheckMode: 'IN_FINANCE' }
    try {
      await PUT('/api/internal/admin/routes', { routes: [lowRisk, ...cfg.approvalRoutes], requesterReviewEnabled: false }, as('adam'))
      const r = await submittedExample('in-finance')
      let d = (await GET(`/api/internal/requests/${r.ID}`, as('fiona'))).data
      assert.deepEqual(d.steps.map(s => s.code), ['FINANCE'])
      assert.equal(d.allowed.bankCheck, true)
      await POST(`/api/internal/requests/${r.ID}/simulate`, {}, as('fiona'))
      await fails(POST(`/api/internal/requests/${r.ID}/approve`, {}, as('fiona')), 409, /call-back/)
      await fails(POST(`/api/internal/requests/${r.ID}/bank-verification`, {}, as('ben')), 403)
      const evidence = { numberCalled: '+35315550123', numberSource: 'INDEPENDENT_BANK', personSpokenTo: 'Route Tester', outcome: 'CONFIRMED' }
      const R = require('../srv/lib/requests')
      await cds.tx(() => R.recordBankVerification({ id: 'other.finance@jones.test', name: 'Other Finance', roles: ['VOB_FinancialController'] }, r.ID, evidence))
      await fails(POST(`/api/internal/requests/${r.ID}/approve`, {}, as('fiona')), 409, /call-back/)
      await POST(`/api/internal/requests/${r.ID}/bank-verification`, evidence, as('fiona'))
      await POST(`/api/internal/requests/${r.ID}/send-back`, { message: 'Please update the bank details.', sections: ['bank'] }, as('fiona'))
      // Configuration changes during return do not rewrite the stored route or requester flag.
      await PUT('/api/internal/admin/routes', { routes: cfg.approvalRoutes, requesterReviewEnabled: true }, as('adam'))
      const returned = await mail('sentBack')
      const session = await vendorSession(returned.actionUrl)
      await PUT('/api/portal/sections/bank', { data: { iban: V.makeIban('IE', 'BOFI90001777881234'), bic: 'BOFIIE2D' } }, session.h)
      await POST('/api/portal/submit', { declarationName: 'Route Tester', accept: true }, session.h)
      d = (await GET(`/api/internal/requests/${r.ID}`, as('fiona'))).data
      assert.equal(d.request.status, 'PENDING_FINANCE')
      assert.equal(d.route.name, 'Low-risk Finance')
      assert.equal(d.request.round, 2)
      assert.match(d.allowed.approveBlocker, /call-back/)
      const process = (await GET('/api/portal/process', session.h)).data
      assert.equal(process.snapshot, true)
      assert.equal(process.routes[0].bankCheckMode, 'IN_FINANCE')
      const vendorView = (await GET('/api/portal/me', session.h)).data
      assert.equal(vendorView.nextReview.role, 'Finance')
      assert.equal(vendorView.nextReview.days, process.routes[0].steps[0].reminderDays)
      await POST(`/api/internal/requests/${r.ID}/bank-verification`, evidence, as('fiona'))
      await POST(`/api/internal/requests/${r.ID}/simulate`, {}, as('fiona'))
      await POST(`/api/internal/requests/${r.ID}/approve`, {}, as('fiona'))
      await require('../srv/lib/requests').idle()
      assert.equal((await GET(`/api/internal/requests/${r.ID}`, as('fiona'))).data.request.status, 'CREATED')
    } finally { await PUT('/api/internal/admin/routes', { routes: cfg.approvalRoutes, requesterReviewEnabled: true }, as('adam')) }
  })
})
