'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const V = require('../srv/lib/validation')
const W = require('../srv/lib/workflow')

test('IBAN: valid examples pass, typos fail', () => {
  assert.equal(V.checkIban('IE29 AIBK 9311 5212 3456 78'), undefined)
  assert.equal(V.checkIban('GB82WEST12345698765432'), undefined)
  assert.match(V.checkIban('IE29AIBK93115212345679'), /check digits/)
  assert.match(V.checkIban('IE29AIBK931152'), /22 characters/)
  assert.match(V.checkIban(''), /enter/)
})

test('IBAN: IE/GB derive sort code and account', () => {
  const d = V.deriveFromIban('IE29AIBK93115212345678')
  assert.deepEqual(d, { country: 'IE', bankCode: 'AIBK', sortCode: '931152', accountNo: '12345678' })
  assert.equal(V.formatSortCode('931152'), '93-11-52')
  assert.equal(V.checkIban(V.makeIban('IE', 'AIBK93115299887766')), undefined)
})

test('BIC, VAT, postcodes, UTR', () => {
  assert.equal(V.checkBic('AIBKIE2D'), undefined)
  assert.ok(V.checkBic('AIBK'))
  assert.ok(V.bicCountryWarning('NWBKGB2L', 'IE29AIBK93115212345678'))
  assert.equal(V.checkVat('IE1234567T', 'IE'), undefined)
  assert.equal(V.checkVat('GB123456789', 'GB'), undefined)
  assert.ok(V.checkVat('IE12', 'IE'))
  assert.equal(V.checkPostCode('D04 HN50', 'IE'), undefined)
  assert.ok(V.checkPostCode('12345', 'IE'))
  assert.equal(V.checkPostCode('SW1A 1AA', 'GB'), undefined)
  assert.equal(V.formatPostCode('d04hn50', 'IE'), 'D04 HN50')
})

test('conditional fields: RCT for IE sub-contractors, UTR for GB', () => {
  const ie = V.fieldsFor('tax', { country: 'IE', subcontractor: true }).map(f => f.key)
  assert.ok(ie.includes('rctNumber') && !ie.includes('utrNumber'))
  const gb = V.fieldsFor('tax', { country: 'GB', subcontractor: true }).map(f => f.key)
  assert.ok(gb.includes('utrNumber') && gb.includes('cisNumber') && !gb.includes('rctNumber'))
  const errs = V.validateSection('tax', { country: 'GB' }, { country: 'GB', subcontractor: true })
  assert.ok(errs.utrNumber && errs.vatNumber)
})

test('SAP name split at 35 characters and search term', () => {
  const parts = V.splitName('The Very Long Named International Construction Supplies Company of Ireland Limited')
  assert.ok(parts.every(p => p.length <= 35) && parts.length >= 2)
  assert.equal(V.searchTerm('Acme Test Supplies Ltd'), 'ACME TEST SUPPLIES')
})

test('workflow: procurement only for 30 EOM; SoD rules', () => {
  assert.equal(W.nextStatusAfter('PURCHASING', true), 'PENDING_PROCUREMENT')
  assert.equal(W.nextStatusAfter('PURCHASING', false), 'PENDING_BANK_CHECK')
  assert.equal(W.nextStatusAfter('FINANCE', false), 'CREATING')
  const r = { status: 'PENDING_PURCHASING', requesterId: 'paddy', round: 1 }
  assert.equal(W.canAct({ id: 'paddy', roles: ['VOB_PurchasingManager'] }, r, []).ok, false)
  assert.equal(W.canAct({ id: 'pm2', roles: ['VOB_PurchasingManager'] }, r, []).ok, true)
  assert.equal(W.canAct({ id: 'pm2', roles: ['VOB_FinancialController'] }, r, []).ok, false)
  const fin = { status: 'PENDING_FINANCE', requesterId: 'x', round: 1 }
  assert.equal(W.canAct({ id: 'ben', roles: ['VOB_FinancialController', 'VOB_BankVerifier'] }, fin, [{ round: 1, step: 'BANK_CHECK', userId: 'ben' }]).ok, false)
  assert.match(W.approvalBlocker({ status: 'PENDING_BANK_CHECK' }, {}), /call-back/)
  assert.match(W.approvalBlocker({ status: 'PENDING_FINANCE', duplicateBlocking: true }, { simulationValid: true }), /already exist/)
})
