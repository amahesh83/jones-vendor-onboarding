'use strict'
/*
 * Demo data for local runs (`npm run demo`): requests in every status, created
 * through the real business logic so everything is consistent. Synthetic data only.
 */
const cds = require('@sap/cds')
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib')
const R = require('./requests')
const V = require('./validation')
const { PERSONAS } = require('../auth/personas')

const P = Object.fromEntries(PERSONAS.map(p => [p.id.split('.')[0], { type: 'USER', id: p.id, name: p.name, email: p.id, roles: p.roles }]))

async function samplePdf (title, company) {
  const doc = await PDFDocument.create()
  const page = doc.addPage([420, 300])
  const font = await doc.embedFont(StandardFonts.HelveticaBold)
  const reg = await doc.embedFont(StandardFonts.Helvetica)
  page.drawRectangle({ x: 0, y: 250, width: 420, height: 50, color: rgb(0.31, 0.27, 0.9) })
  page.drawText('SAMPLE DOCUMENT (demo data)', { x: 20, y: 268, size: 14, font, color: rgb(1, 1, 1) })
  page.drawText(title, { x: 20, y: 210, size: 16, font })
  page.drawText(company, { x: 20, y: 185, size: 12, font: reg })
  page.drawText('Synthetic file generated for the Jones Vendor Onboarding demo.', { x: 20, y: 150, size: 9, font: reg })
  return Buffer.from(await doc.save())
}

const ieBank = (bank, sort, acct, bic, name) => ({
  iban: V.makeIban('IE', bank + sort + acct), bic, bankName: name, bankAddress: `${name}, 1 Main Street, Dublin 2`,
})

const VENDORS = {
  shannon: { company: { country: 'IE', companyName: 'Shannon Scaffolding Ltd', street: '12 Dock Road', district: 'Dock Road', city: 'Limerick', postCode: 'V94 K2X3', phone: '+353 61 555 0101', companyRegNo: '512345' },
    contacts: { accountsContactName: 'Siobhán Ryan', accountsEmail: 'accounts@shannon-scaffolding.test', salesContactName: 'Mark Ryan', salesEmail: 'sales@shannon-scaffolding.test' },
    tax: { vatNumber: 'IE4567891K', rctNumber: '4567891K' },
    bank: { ...ieBank('AIBK', '931152', '10293847', 'AIBKIE2D', 'AIB Bank'), accountHolder: 'Shannon Scaffolding Ltd', bankContactName: 'Siobhán Ryan', bankContactPhone: '+353 61 555 0102' } },
  boyne: { company: { country: 'IE', companyName: 'Boyne Electrical Contractors Ltd', street: '4 Mill Lane', city: 'Drogheda', postCode: 'A92 F2XY', phone: '+353 41 555 0199', companyRegNo: '623451' },
    contacts: { accountsContactName: 'Ciarán Byrne', accountsEmail: 'finance@boyne-electrical.test' },
    tax: { vatNumber: 'IE7654321P', rctNumber: '7654321P' },
    bank: { ...ieBank('BOFI', '900017', '55667788', 'BOFIIE2D', 'Bank of Ireland'), accountHolder: 'Boyne Electrical Contractors Ltd', bankContactName: 'Ciarán Byrne', bankContactPhone: '+353 41 555 0198' } },
  corrib: { company: { country: 'IE', companyName: 'Corrib Concrete Products Ltd', street: 'Unit 7, Galway Business Park', city: 'Galway', postCode: 'H91 TK33', phone: '+353 91 555 0123' },
    contacts: { accountsContactName: 'Aisling Walsh', accountsEmail: 'ap@corrib-concrete.test', salesContactName: 'Tomás Walsh', salesEmail: 'orders@corrib-concrete.test' },
    tax: { vatNumber: 'IE1122334W' },
    bank: { ...ieBank('AIBK', '937055', '11223344', 'AIBKIE2D', 'AIB Bank'), accountHolder: 'Corrib Concrete Products Ltd', bankContactName: 'Aisling Walsh', bankContactPhone: '+353 91 555 0124' } },
  mourne: { company: { country: 'GB', companyName: 'Mourne Steel Fixers Ltd', street: '22 Harbour Road', city: 'Belfast', postCode: 'BT1 5GS', phone: '+44 28 9055 0111', companyRegNo: 'NI654321' },
    contacts: { accountsContactName: 'Gareth Maguire', accountsEmail: 'accounts@mourne-steel.test' },
    tax: { vatNumber: 'GB987654321', utrNumber: '1234567890', cisNumber: 'CIS-445566' },
    bank: { iban: V.makeIban('GB', 'NWBK60161331926819'), bic: 'NWBKGB2L', bankName: 'NatWest', bankAddress: '11 Donegall Square, Belfast', accountHolder: 'Mourne Steel Fixers Ltd', bankContactName: 'Gareth Maguire', bankContactPhone: '+44 28 9055 0112' } },
  wicklow: { company: { country: 'IE', companyName: 'Wicklow Tools & Hire Ltd', street: '3 Bray Road', city: 'Wicklow', postCode: 'A67 X2W4', phone: '+353 404 55 010' },
    contacts: { accountsContactName: 'Niamh Doyle', accountsEmail: 'accounts@wicklow-hire.test' },
    tax: { vatNumber: 'IE5566778R' },
    bank: { ...ieBank('IPBS', '990622', '87654321', 'IPBSIE2D', 'PTSB'), accountHolder: 'Wicklow Tools & Hire Ltd', bankContactName: 'Niamh Doyle', bankContactPhone: '+353 404 55 011' } },
  existing: { company: { country: 'IE', companyName: 'Existing Supplies Limited', street: '1 Grand Canal Quay', city: 'Dublin 2', postCode: 'D02 X285', phone: '+353 1 555 0100' },
    contacts: { accountsContactName: 'Joe Bloggs', accountsEmail: 'accounts@existing-supplies.test' },
    tax: { vatNumber: 'IE6388047V' },
    bank: { ...ieBank('AIBK', '931152', '99887766', 'AIBKIE2D', 'AIB Bank'), accountHolder: 'Existing Supplies Limited', bankContactName: 'Joe Bloggs', bankContactPhone: '+353 1 555 0101' } },
  barrow: { company: { country: 'IE', companyName: 'Barrow Insulation Ltd', street: 'Quay Street', city: 'Carlow', postCode: 'R93 K7C2' },
    contacts: { accountsContactName: 'Eoin Nolan', accountsEmail: 'eoin@barrow-insulation.test' },
    tax: { vatNumber: 'IE9988776M' },
    bank: { ...ieBank('AIBK', '934121', '24681357', 'AIBKIE2D', 'AIB Bank'), accountHolder: 'Barrow Insulation Ltd', bankContactName: 'Eoin Nolan', bankContactPhone: '+353 59 555 0177' } },
  sapfail: { company: { country: 'IE', companyName: 'SAPFAIL-BANK Demo Interiors Ltd', street: '9 Patrick Street', city: 'Cork', postCode: 'T12 X70A' },
    contacts: { accountsContactName: 'Aoife Murphy', accountsEmail: 'accounts@demo-interiors.test' },
    tax: { vatNumber: 'IE3344556L' },
    bank: { ...ieBank('ULSB', '985010', '13572468', 'ULSBIE2D', 'Ulster Bank'), accountHolder: 'SAPFAIL-BANK Demo Interiors Ltd', bankContactName: 'Aoife Murphy', bankContactPhone: '+353 21 555 0166' } },
  lee: { company: { country: 'IE', companyName: 'Lee Valley Fasteners Ltd', street: '14 Western Road', city: 'Cork', postCode: 'T12 K8AF' },
    contacts: { accountsContactName: 'Liam Kelly', accountsEmail: 'ap@leevalley-fasteners.test' },
    tax: { vatNumber: 'IE2233445H' },
    bank: { ...ieBank('BOFI', '901234', '33445566', 'BOFIIE2D', 'Bank of Ireland'), accountHolder: 'Lee Valley Fasteners Ltd', bankContactName: 'Liam Kelly', bankContactPhone: '+353 21 555 0123' } },
  suir: { company: { country: 'IE', companyName: 'Suir Valley Joinery Ltd', street: 'Ballybricken', city: 'Waterford', postCode: 'X91 D2PE' },
    contacts: { accountsContactName: 'Gráinne Power', accountsEmail: 'accounts@suir-joinery.test' },
    tax: { vatNumber: 'IE6677889T', rctNumber: '6677889T' },
    bank: { ...ieBank('AIBK', '936250', '77889900', 'AIBKIE2D', 'AIB Bank'), accountHolder: 'Suir Valley Joinery Ltd', bankContactName: 'Gráinne Power', bankContactPhone: '+353 51 555 0188' } },
  moy: { company: { country: 'IE', companyName: 'Moy Cleaning Services Ltd', street: 'Main Street', city: 'Ballina', postCode: 'F26 H2C7' },
    contacts: { accountsContactName: 'Sean Gallagher', accountsEmail: 'sean@moy-cleaning.test' },
    tax: { vatNumber: 'IE8899001A' },
    bank: { ...ieBank('AIBK', '937312', '99001122', 'AIBKIE2D', 'AIB Bank'), accountHolder: 'Moy Cleaning Services Ltd', bankContactName: 'Sean Gallagher', bankContactPhone: '+353 96 555 0101' } },
}

const tx = fn => cds.tx(fn)

async function invite (by, { company, contact, email, accountType, terms = '60EOM', currency, country = 'IE', reason }) {
  return tx(() => R.createInvite(P[by], { companyName: company, vendorContactName: contact, vendorEmail: email, accountType, paymentTerms: terms, currency, country, businessReason: reason }))
}

async function fill (id, v, sections = ['company', 'contacts', 'tax', 'bank']) {
  for (const s of sections) {
    const r = await tx(() => R.load(id))
    await tx(() => R.saveSection(r, s, v[s] || {}))
  }
}

async function docs (id, codes) {
  for (const code of codes) {
    const r = await tx(() => R.load(id))
    const content = (await samplePdf(code.replace('_', ' '), r.companyName)).toString('base64')
    const validUntil = ['INSURANCE', 'TAX_CLEARANCE'].includes(code) ? new Date(Date.now() + 200 * 86400000).toISOString().slice(0, 10) : undefined
    await tx(() => R.uploadDocument(r, { docType: code, fileName: `${code.toLowerCase()}.pdf`, content, validUntil }, R.vendorActor(r)))
  }
}

async function submit (id, name) {
  const r = await tx(() => R.load(id))
  await tx(() => R.submit(r, { declarationName: name, accept: true, ip: '127.0.0.1' }, R.vendorActor(r)))
}

const approve = (who, id, body = {}) => tx(() => R.decide(P[who], id, 'approve', body))

async function bankCheck (id) {
  const r = await tx(() => R.load(id))
  await tx(() => R.recordBankVerification(P.ben, id, { numberCalled: '+353 1 555 0000', numberSource: 'INDEPENDENT_BANK', personSpokenTo: r.bankContactName, outcome: 'CONFIRMED', notes: 'Account name and IBAN confirmed against the bank letter.' }))
}

async function age (id, days, extra = {}) {
  const d = new Date(Date.now() - days * 86400000).toISOString()
  await tx(() => UPDATE('jones.vob.VendorRequests').set({ createdAt: d, ...extra }).where({ ID: id }))
}

async function stepAge (id, days) {
  await tx(() => UPDATE('jones.vob.VendorRequests').set({ stepSince: new Date(Date.now() - days * 86400000).toISOString() }).where({ ID: id }))
}

async function toFinance (id) {
  for (let count = 0; count < 6; count++) {
    const r = await tx(() => R.load(id))
    if (r.status === 'PENDING_FINANCE') return
    if (r.status === 'PENDING_REQUESTER') await approve(r.requesterId.split('.')[0], id)
    else if (r.status === 'PENDING_PURCHASING') await approve('paddy', id)
    else if (r.status === 'PENDING_PROCUREMENT') await approve('priya', id)
    else if (r.status === 'PENDING_BANK_CHECK') { await bankCheck(id); await approve('ben', id) }
  }
  throw new Error('Demo route did not reach Finance')
}

async function seed () {
  const existing = await tx(() => SELECT.one.from('jones.vob.VendorRequests').columns('ID'))
  if (existing) return
  const LOG = cds.log('vob')
  LOG.info('Creating demo data…')
  cds.context = { user: cds.User.privileged }

  const SUB = ['BANK_LETTER', 'TAX_CLEARANCE', 'INSURANCE', 'SAFETY', 'SUBCONTRACT']

  // 1. INVITED: the vendor hasn't opened the link yet
  await invite('rachel', { company: 'Acme Test Supplies Ltd', contact: 'Alex Acme', email: 'alex@acme-test-supplies.test', accountType: 'YBIV', reason: 'Fixings and consumables for the Dublin data centre project' })

  // 2. IN_PROGRESS: started, half way
  const liffey = await invite('ronan', { company: 'Liffey Plumbing Supplies Ltd', contact: 'Fiona Kavanagh', email: 'fiona@liffey-plumbing.test', accountType: 'YBIV', terms: '90EOM', reason: 'Pipework and valves for the Cork pharma site' })
  await fill(liffey.ID, { company: { country: 'IE', companyName: 'Liffey Plumbing Supplies Ltd', street: '45 Thomas Street', city: 'Dublin 8', postCode: 'D08 W2C6' }, contacts: { accountsContactName: 'Fiona Kavanagh', accountsEmail: 'accounts@liffey-plumbing.test' } }, ['company', 'contacts'])

  // 3. PENDING_REQUESTER: sub-contractor, 30 days (procurement step will follow)
  const shannon = await invite('rachel', { company: 'Shannon Scaffolding Ltd', contact: 'Siobhán Ryan', email: 'siobhan@shannon-scaffolding.test', accountType: 'YBVE', terms: '30EOM', reason: 'Scaffolding package for the Limerick hospital extension' })
  await fill(shannon.ID, VENDORS.shannon); await docs(shannon.ID, SUB); await submit(shannon.ID, 'Siobhán Ryan')
  await age(shannon.ID, 3); await stepAge(shannon.ID, 1)

  // 4. PENDING_PROCUREMENT: sub-contractor route (ADR-003)
  const boyne = await invite('ronan', { company: 'Boyne Electrical Contractors Ltd', contact: 'Ciarán Byrne', email: 'ciaran@boyne-electrical.test', accountType: 'YBCS', reason: 'Electrical commissioning on the Drogheda site' })
  await fill(boyne.ID, VENDORS.boyne); await docs(boyne.ID, SUB); await submit(boyne.ID, 'Ciarán Byrne')
  await approve('ronan', boyne.ID); await age(boyne.ID, 6); await stepAge(boyne.ID, 6)

  // 5. PENDING_PROCUREMENT (30 days EOM)
  const corrib = await invite('rachel', { company: 'Corrib Concrete Products Ltd', contact: 'Aisling Walsh', email: 'aisling@corrib-concrete.test', accountType: 'YBIV', terms: '30EOM', reason: 'Precast concrete for the Galway campus' })
  await fill(corrib.ID, VENDORS.corrib); await docs(corrib.ID, ['BANK_LETTER']); await submit(corrib.ID, 'Aisling Walsh')
  await approve('rachel', corrib.ID); await age(corrib.ID, 4); await stepAge(corrib.ID, 2)

  // 6. PENDING_BANK_CHECK: UK sub-contractor, GBP
  const mourne = await invite('ronan', { company: 'Mourne Steel Fixers Ltd', contact: 'Gareth Maguire', email: 'gareth@mourne-steel.test', accountType: 'YBSP', currency: 'GBP', country: 'GB', reason: 'Steel fixing crew for the Belfast office fit-out' })
  await fill(mourne.ID, VENDORS.mourne); await docs(mourne.ID, ['BANK_LETTER', 'INSURANCE', 'SAFETY', 'SUBCONTRACT']); await submit(mourne.ID, 'Gareth Maguire')
  await approve('ronan', mourne.ID); await approve('priya', mourne.ID); await age(mourne.ID, 5); await stepAge(mourne.ID, 1)

  // 7. PENDING_FINANCE: ready for simulation and final approval
  const wicklow = await invite('rachel', { company: 'Wicklow Tools & Hire Ltd', contact: 'Niamh Doyle', email: 'niamh@wicklow-hire.test', accountType: 'YBIV', reason: 'Plant hire for the Wicklow road scheme' })
  await fill(wicklow.ID, VENDORS.wicklow); await docs(wicklow.ID, ['BANK_LETTER']); await submit(wicklow.ID, 'Niamh Doyle')
  await toFinance(wicklow.ID); await age(wicklow.ID, 7)

  // 8. PENDING_FINANCE with a duplicate in SAP (VAT + IBAN match vendor 100001)
  const dup = await invite('ronan', { company: 'Existing Supplies Limited', contact: 'Joe Bloggs', email: 'joe@existing-supplies.test', accountType: 'YBIV', reason: 'Emergency supply of PPE' })
  await fill(dup.ID, VENDORS.existing); await docs(dup.ID, ['BANK_LETTER']); await submit(dup.ID, 'Joe Bloggs')
  await toFinance(dup.ID); await age(dup.ID, 2)

  // 9. RETURNED: sent back to the vendor
  const barrow = await invite('rachel', { company: 'Barrow Insulation Ltd', contact: 'Eoin Nolan', email: 'eoin@barrow-insulation.test', accountType: 'YBIV', reason: 'Insulation for the Carlow school' })
  await fill(barrow.ID, VENDORS.barrow); await docs(barrow.ID, ['BANK_LETTER']); await submit(barrow.ID, 'Eoin Nolan')
  await approve('rachel', barrow.ID)
  await tx(() => R.decide(P.ben, barrow.ID, 'sendBack', { message: 'The bank letter is a screenshot of online banking. Please upload a letter on the bank\'s headed paper.', sections: ['documents'] }))
  await age(barrow.ID, 9)

  // 10. SAP_ERROR: the bank doesn't exist in SAP yet
  const fail = await invite('rachel', { company: 'SAPFAIL-BANK Demo Interiors Ltd', contact: 'Aoife Murphy', email: 'aoife@demo-interiors.test', accountType: 'YBIV', reason: 'Fit-out materials (demo of an SAP error and retry)' })
  await fill(fail.ID, VENDORS.sapfail); await docs(fail.ID, ['BANK_LETTER']); await submit(fail.ID, 'Aoife Murphy')
  await toFinance(fail.ID)
  await tx(() => R.simulate(P.fiona, fail.ID)); await approve('fiona', fail.ID)
  await R.startCreation(fail.ID); await R.idle()

  // 11-12. CREATED
  for (const [key, by, type, contact, terms] of [['lee', 'ronan', 'YBIV', 'Liam Kelly', '60EOM'], ['suir', 'rachel', 'YBCS', 'Gráinne Power', '30EOM']]) {
    const v = VENDORS[key]
    const x = await invite(by, { company: v.company.companyName, contact, email: v.contacts.accountsEmail.replace('accounts@', 'hello@').replace('ap@', 'hello@'), accountType: type, terms, reason: 'Ongoing supply' })
    await fill(x.ID, v); await docs(x.ID, type === 'YBIV' ? ['BANK_LETTER'] : SUB); await submit(x.ID, contact)
    await toFinance(x.ID)
    await tx(() => R.simulate(P.fiona, x.ID)); await approve('fiona', x.ID)
    await R.startCreation(x.ID); await R.idle()
    await age(x.ID, key === 'lee' ? 12 : 6)
  }

  // 13. REJECTED
  const moy = await invite('ronan', { company: 'Moy Cleaning Services Ltd', contact: 'Sean Gallagher', email: 'sean@moy-cleaning.test', accountType: 'YBIV', reason: 'Site cleaning' })
  await fill(moy.ID, VENDORS.moy); await docs(moy.ID, ['BANK_LETTER']); await submit(moy.ID, 'Sean Gallagher')
  await approve('ronan', moy.ID)
  await tx(() => R.decide(P.ben, moy.ID, 'reject', { reason: 'We already have a framework cleaning contractor for the region.' }))

  // 14. EXPIRED
  const exp = await invite('rachel', { company: 'Blackwater Hauliers Ltd', contact: 'Pat Fitz', email: 'pat@blackwater-haulage.test', accountType: 'YBIV', reason: 'Haulage' })
  await tx(() => UPDATE('jones.vob.VendorRequests').set({ inviteExpiresAt: new Date(Date.now() - 86400000).toISOString() }).where({ ID: exp.ID }))
  await tx(() => R.runJobs())
  await age(exp.ID, 35)

  LOG.info('Demo data ready: 14 requests across the seeded approval routes. Open http://localhost:4004')
}

module.exports = { seed, samplePdf }
