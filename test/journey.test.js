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
    await POST(`/api/internal/requests/${id}/approve`, {}, as('paddy'))
    let d = (await GET(`/api/internal/requests/${id}`, as('priya'))).data
    assert.equal(d.request.status, 'PENDING_PROCUREMENT')
    await POST(`/api/internal/requests/${id}/approve`, {}, as('priya'))
    await fails(POST(`/api/internal/requests/${id}/approve`, {}, as('ben')), 409, /call-back/)
    await POST(`/api/internal/requests/${id}/bank-verification`, { numberCalled: '+353 1 555 0000', numberSource: 'INDEPENDENT_BANK', personSpokenTo: 'Tess', outcome: 'CONFIRMED' }, as('ben'))
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
    const pdfRes = await GET(`/api/internal/requests/${id}/fin010.pdf`, as('aoife'))
    assert.equal(pdfRes.headers['content-type'], 'application/pdf')
    assert.ok((await mail('createdVendor')).subject.includes(d.request.sapVendorNumber))
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
    await POST(`/api/internal/requests/${x}/approve`, {}, as('paddy'))
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
})
