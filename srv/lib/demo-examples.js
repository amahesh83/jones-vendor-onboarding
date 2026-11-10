'use strict'
const cds = require('@sap/cds')
const V = require('./validation')
const { isProduction, fail } = require('./util')
const { PDFDocument } = require('pdf-lib')
function assertEnabled () {
  if (isProduction() || !/dev-auth/.test(String(cds.env.requires?.auth?.impl || ''))) fail(404, 'NOT_FOUND', 'Not found.')
}
function example ({ country = 'IE', companyName, duplicate = false, seed } = {}) {
  assertEnabled()
  const unique = seed || cds.utils.uuid()
  const number = parseInt(require('crypto').createHash('sha256').update(unique).digest('hex').slice(0, 7), 16)
  const suffix = unique.slice(0, 8)
  const gb = country === 'GB'
  const name = companyName || `Demo ${gb ? 'Thames' : 'Liffey'} Supplies ${suffix} Ltd`
  const iban = V.makeIban(gb ? 'GB' : 'IE', (gb ? 'NWBK601613' : 'AIBK931152') + String(10000000 + number % 89999999).padStart(8, '0'))
  return {
    company: { country: gb ? 'GB' : 'IE', companyName: name, street: '1 Example Street', district: 'Demo Business Park', city: gb ? 'London' : 'Dublin', postCode: gb ? 'SW1A 1AA' : 'D04 HN50', companyRegNo: gb ? '12345678' : '123456', phone: gb ? '+442079460000' : '+35315550100' },
    contacts: { accountsContactName: 'Taylor Example', accountsEmail: `accounts-${suffix}@example.test`, salesContactName: 'Alex Example', salesEmail: `sales-${suffix}@example.test` },
    tax: { vatNumber: duplicate ? (gb ? 'GB123456789' : 'IE6388047V') : gb ? 'GB' + String(100000000 + number % 899999999) : 'IE' + String(1000000 + number % 8999999) + 'T', rctNumber: '1234567T', utrNumber: '1234567890', cisNumber: 'DEMO-CIS-123' },
    bank: { iban, bic: gb ? 'NWBKGB2L' : 'AIBKIE2D', bankName: `${gb ? 'NatWest' : 'AIB'} — DEMO ONLY`, bankAddress: gb ? '1 Example Square, London' : '1 Example Square, Dublin', accountHolder: name, bankContactName: 'Taylor Example', bankContactPhone: gb ? '+442079460000' : '+35315550100' },
    invite: { companyName: name, vendorContactName: 'Taylor Example', vendorEmail: `vendor-${suffix}@example.test`, country: gb ? 'GB' : 'IE', currency: gb ? 'GBP' : 'EUR', accountType: 'YBIV', businessReason: 'DEMO ONLY — synthetic supplier for testing' },
    callback: { numberCalled: gb ? '+442079460000' : '+35315550100', numberSource: 'INDEPENDENT_BANK', personSpokenTo: 'Taylor Example', notes: 'DEMO ONLY — simulated call, no real person contacted.' },
  }
}
async function fill (r, section, options = {}) {
  assertEnabled()
  const R = require('./requests')
  const data = example({ country: options.country || r.country || 'IE', companyName: section === 'company' || section === 'all' ? undefined : r.companyName, seed: r.ID, duplicate: options.duplicate === true })
  const sections = section === 'all' ? ['company', 'contacts', 'tax', 'bank', 'documents'] : [section]
  for (const key of sections) {
    r = await R.load(r.ID)
    if (key === 'documents') {
      const view = await R.vendorView(r)
      for (const type of view.documentTypes.filter(t => t.required && !view.documents.some(d => d.docType === t.code))) {
        const pdf = await PDFDocument.create(); pdf.addPage([420, 300]).drawText('DEMO ONLY - ' + type.label, { x: 24, y: 240, size: 15 })
        await R.uploadDocument(r, { docType: type.code, fileName: `demo-${type.code.toLowerCase()}.pdf`, content: Buffer.from(await pdf.save()).toString('base64'), validUntil: new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10) }, R.vendorActor(r))
      }
    } else if (data[key]) await R.saveSection(r, key, data[key])
    else fail(400, 'BAD_SECTION', 'Choose a form section.')
  }
  return R.vendorView(await R.load(r.ID))
}
module.exports = { assertEnabled, example, fill }
