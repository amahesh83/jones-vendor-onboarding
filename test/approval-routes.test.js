'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const A = require('../srv/lib/approval-routes')
const W = require('../srv/lib/workflow')
const seed = () => [
  { ID: 'SUB', name: 'Sub-contractors', priority: 10, active: true, accountTypes: 'YBCS,YBSP,YBVE', steps: 'PROCUREMENT,BANK_CHECK,FINANCE', bankCheckMode: 'SEPARATE' },
  { ID: 'SHORT', name: 'Short payment terms', priority: 20, active: true, paymentTerms: '30EOM', steps: 'PROCUREMENT,BANK_CHECK,FINANCE', bankCheckMode: 'SEPARATE' },
  { ID: 'DEFAULT', name: 'Default', priority: 99, active: true, steps: 'BANK_CHECK,FINANCE', bankCheckMode: 'SEPARATE' },
]
test('routes: seeded priorities, account types and empty-any fallback', () => {
  for (const accountType of ['YBCS', 'YBSP', 'YBVE']) assert.equal(A.resolve(seed(), { accountType, paymentTerms: '30EOM' }).name, 'Sub-contractors')
  assert.equal(A.resolve(seed(), { accountType: 'YBIV', paymentTerms: '30EOM' }).name, 'Short payment terms')
  const normal = A.resolve(seed(), { accountType: 'YBIV', paymentTerms: '60EOM' })
  assert.deepEqual(normal.steps.map(s => s.code), ['REQUESTER', 'BANK_CHECK', 'FINANCE'])
})
test('routes: all populated conditions must match, and inactive rules are ignored', () => {
  const routes = seed()
  routes.unshift({ ID: 'LOW', name: 'Low risk', priority: 1, active: true, accountTypes: 'YBIV', paymentTerms: '60EOM,90EOM', companyCode: 'IE01', country: 'GB', steps: 'FINANCE', bankCheckMode: 'IN_FINANCE' })
  const vendor = { accountType: 'YBIV', paymentTerms: '60EOM', companyCode: 'IE01', country: 'GB' }
  assert.equal(A.resolve(routes, vendor).name, 'Low risk')
  for (const key of Object.values(A.DIMENSIONS)) assert.notEqual(A.resolve(routes, { ...vendor, [key]: 'OTHER' }).name, 'Low risk')
  routes[0].active = false
  assert.equal(A.resolve(routes, vendor).name, 'Default')
})
test('routes: requester review is global and always first; snapshots remain immutable', () => {
  const routes = seed(), snap = A.resolve(routes, {}, { reminderDays: 4, bankReminderDays: 2 })
  assert.equal(snap.steps[0].code, 'REQUESTER')
  assert.equal(snap.steps[0].reminderDays, 4)
  const stored = JSON.stringify(snap)
  routes[2].steps = 'PURCHASING,BANK_CHECK,FINANCE'
  assert.deepEqual(W.routeFor({ routeSnapshot: stored }).steps.map(s => s.code), ['REQUESTER', 'BANK_CHECK', 'FINANCE'])
  assert.equal(A.resolve(routes, {}, { requesterReviewEnabled: false }).steps[0].code, 'PURCHASING')
})
test('routes: validate default, unique/known steps, bank mode and Finance-last', () => {
  assert.deepEqual(A.validate(seed()), [])
  for (const changes of [{ steps: 'FINANCE,BANK_CHECK' }, { steps: 'BANK_CHECK,BANK_CHECK,FINANCE' }, { steps: 'UNKNOWN,BANK_CHECK,FINANCE' }, { steps: 'BANK_CHECK,REQUESTER,FINANCE' }, { steps: 'FINANCE' }, { bankCheckMode: 'IN_FINANCE' }]) {
    const routes = seed(); Object.assign(routes[2], changes); assert.ok(A.validate(routes).length)
  }
  const routes = seed(); routes[2].active = false; assert.ok(A.validate(routes).length)
})
test('routes: Finance-owned bank check preserves SoD and blocks until confirmed', () => {
  const route = { name: 'Low risk', bankCheckMode: 'IN_FINANCE', steps: [W.STEPS.find(s => s.code === 'FINANCE')] }
  const r = { status: 'PENDING_FINANCE', requesterId: 'requester', round: 2, routeSnapshot: JSON.stringify(route) }
  assert.match(W.approvalBlocker(r, { simulationValid: true, bankConfirmed: false }), /call-back/)
  assert.equal(W.approvalBlocker(r, { simulationValid: true, bankConfirmed: true }), undefined)
  assert.equal(W.canAct({ id: 'requester', roles: ['VOB_FinancialController'] }, r, []).ok, false)
  assert.equal(W.canAct({ id: 'finance', roles: ['VOB_FinancialController'] }, r, [{ round: 2, userId: 'finance', step: 'PROCUREMENT' }]).ok, false)
  const separate = { ...r, routeSnapshot: JSON.stringify({ ...route, bankCheckMode: 'SEPARATE' }) }
  assert.equal(W.canAct({ id: 'finance', roles: ['VOB_FinancialController'] }, separate, [], [{ round: 2, userId: 'finance' }]).ok, false)
})
