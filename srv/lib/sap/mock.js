'use strict'
/*
 * Mock SAP ECC. Implements the same JSON contract as the ZVOB ABAP API,
 * in memory, so the whole journey runs on a laptop.
 *
 * Test triggers (company name contains):
 *   SAPDOWN       -> SAP unreachable (transient, retried, then SAP_ERROR)
 *   SAPFAIL-BANK  -> bank key unknown, until "createMissingBank" is allowed
 *   SAPFAIL-SIM   -> simulation fails with a reconciliation account error
 */
const V = require('../validation')
const { SapBusinessError, SapTransientError } = require('./errors')

const RANGES = { YBIV: 100000, YBCS: 600000, YBSP: 700000, YBVE: 800000 }

let vendors, byRequest, attachments

function seedVendors () {
  return [
    { vendorNumber: '100001', accountGroup: 'YBIV', name: 'Existing Supplies Ltd', city: 'Dublin 2', postCode: 'D02 X285', country: 'IE', vatNumber: 'IE6388047V', iban: V.makeIban('IE', 'AIBK93115299887766') },
    { vendorNumber: '100002', accountGroup: 'YBIV', name: 'Kilkenny Steel Fabrication Ltd', city: 'Kilkenny', postCode: 'R95 E2X3', country: 'IE', vatNumber: 'IE9876543W', iban: V.makeIban('IE', 'BOFI90001712345678') },
    { vendorNumber: '600001', accountGroup: 'YBCS', name: 'Brennan Engineering Consultancy Ltd', city: 'Cork', postCode: 'T12 X70A', country: 'IE', vatNumber: 'IE3333333H', iban: V.makeIban('IE', 'AIBK93208611111111') },
    { vendorNumber: '700001', accountGroup: 'YBSP', name: 'Northside Labour Services Ltd', city: 'Belfast', postCode: 'BT1 5GS', country: 'GB', vatNumber: 'GB123456789', iban: V.makeIban('GB', 'NWBK60161331926819') },
    { vendorNumber: '800001', accountGroup: 'YBVE', name: 'Atlantic Mechanical Contractors Ltd', city: 'Galway', postCode: 'H91 TK33', country: 'IE', vatNumber: 'IE8222222K', iban: V.makeIban('IE', 'BOFI90120922222222') },
  ]
}

function reset () {
  vendors = new Map(seedVendors().map(v => [v.vendorNumber, v]))
  byRequest = new Map()
  attachments = new Map()
}
reset()

const delay = ms => new Promise(r => setTimeout(r, ms))

async function ping () {
  await delay(120)
  return { ok: true, system: 'MOCK', client: '300', release: '750', user: 'VOB_TECH', messages: [{ type: 'S', text: 'Connected to the mock SAP system (no real SAP).' }] }
}

async function duplicates ({ name, postCode, vatNumber, iban }) {
  const matches = []
  const nName = V.normalizeName(name), nPost = String(postCode || '').replace(/\s/g, '').toUpperCase()
  const nVat = V.normalizeVat(vatNumber), nIban = V.normalizeIban(iban)
  for (const v of vendors.values()) {
    const on = []
    if (nVat && v.vatNumber && V.normalizeVat(v.vatNumber) === nVat) on.push('VAT')
    if (nIban && v.iban && V.normalizeIban(v.iban) === nIban) on.push('IBAN')
    if (nName && V.normalizeName(v.name) === nName && nPost && v.postCode.replace(/\s/g, '').toUpperCase() === nPost) on.push('NAME_POSTCODE')
    if (on.length) matches.push({ vendorNumber: v.vendorNumber, name: v.name, city: v.city, matchedOn: on, blocked: on.includes('VAT') || on.includes('IBAN') })
  }
  return { matches }
}

function check (p) {
  const msgs = []
  const name = [p.central?.name1, p.central?.name2].join(' ')
  if (/SAPDOWN/i.test(name)) throw new SapTransientError('SAP is not reachable right now.', 'HTTP 503 Service Unavailable (mock)')
  if (!RANGES[p.accountGroup]) msgs.push({ type: 'E', id: 'F2', number: '011', text: `Account group ${p.accountGroup} is not allowed`, field: 'accountGroup' })
  if (!p.central?.name1) msgs.push({ type: 'E', id: 'F2', number: '012', text: 'Name 1 is required', field: 'central.name1' })
  if (!p.companyData?.reconAccount) msgs.push({ type: 'E', id: 'F2', number: '060', text: 'Reconciliation account (AKONT) is missing', field: 'companyData.reconAccount' })
  if (/SAPFAIL-SIM/i.test(name)) msgs.push({ type: 'E', id: 'F2', number: '061', text: 'Reconciliation account 0000000000 is not defined in company code IE01 (AKONT)', field: 'companyData.reconAccount' })
  if (/SAPFAIL-BANK/i.test(name)) {
    if (p.testRun) msgs.push({ type: 'W', id: 'AR', number: '191', text: `Bank key ${p.bank?.bankKey} does not exist in country ${p.bank?.country}; it must be created before posting`, field: 'bank.bankKey' })
    else if (!p.bank?.createMissingBank) msgs.push({ type: 'E', id: 'AR', number: '191', text: `Bank key ${p.bank?.bankKey} does not exist for country ${p.bank?.country} (BNKA)`, field: 'bank.bankKey' })
  }
  return msgs
}

async function createVendor (payload) {
  await delay(250)
  const existing = byRequest.get(payload.requestId)
  if (existing && !payload.testRun) {
    return { result: 'ALREADY_CREATED', vendorNumber: existing, messages: [{ type: 'S', text: `Vendor ${existing} already exists for ${payload.requestId}` }] }
  }
  const msgs = check(payload)
  if (msgs.some(m => m.type === 'E')) throw new SapBusinessError(msgs)
  if (payload.testRun) {
    return { result: 'SIMULATED', messages: [...msgs, { type: 'S', id: 'F2', number: '175', text: 'Test run: no errors found. Nothing was saved.' }] }
  }
  const base = RANGES[payload.accountGroup]
  let max = base
  for (const v of vendors.values()) if (v.accountGroup === payload.accountGroup) max = Math.max(max, Number(v.vendorNumber))
  const vendorNumber = String(max + 1)
  vendors.set(vendorNumber, {
    vendorNumber, accountGroup: payload.accountGroup, name: [payload.central.name1, payload.central.name2].filter(Boolean).join(' '),
    city: payload.central.city, postCode: payload.central.postCode, country: payload.central.country,
    vatNumber: payload.central.vatNumber, iban: payload.bank.iban, payload,
  })
  byRequest.set(payload.requestId, vendorNumber)
  return { result: 'CREATED', vendorNumber, messages: [...msgs.filter(m => m.type === 'W'), { type: 'S', id: 'F2', number: '175', text: `Vendor ${vendorNumber} has been created for company code ${payload.companyCode}` }] }
}

async function getVendor (lifnr) {
  const v = vendors.get(lifnr)
  if (!v) return null
  return { vendorNumber: v.vendorNumber, accountGroup: v.accountGroup, name: v.name, city: v.city, country: v.country, attachments: (attachments.get(lifnr) || []).map(a => a.fileName) }
}

async function addAttachment (lifnr, { fileName, mimeType, contentBase64 }) {
  if (!vendors.has(lifnr)) throw new SapBusinessError([{ type: 'E', text: `Vendor ${lifnr} not found` }])
  const list = attachments.get(lifnr) || []
  list.push({ fileName, mimeType, size: Buffer.from(contentBase64 || '', 'base64').length })
  attachments.set(lifnr, list)
  return { ok: true, messages: [{ type: 'S', text: `${fileName} attached to vendor ${lifnr}` }] }
}

module.exports = { kind: 'mock', ping, duplicates, createVendor, getVendor, addAttachment, reset, _vendors: () => vendors }
