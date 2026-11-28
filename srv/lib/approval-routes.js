'use strict'
const W = require('./workflow')
const DIMENSIONS = { accountTypes: 'accountType', paymentTerms: 'paymentTerms', companyCode: 'companyCode', country: 'country' }
const values = v => Array.isArray(v) ? v : String(v || '').split(',').map(x => x.trim()).filter(Boolean)
function validate (routes) {
  const errors = []
  if (!routes.some(r => r.active && Object.keys(DIMENSIONS).every(k => values(r[k]).length === 0))) errors.push('Keep at least one active default route with no conditions.')
  for (const r of routes) {
    const steps = values(r.steps)
    if (!String(r.name || '').trim()) errors.push('Give every route a name.')
    if (!Number.isInteger(Number(r.priority)) || Number(r.priority) < 0) errors.push(`${r.name}: priority must be a non-negative whole number.`)
    if (!['SEPARATE', 'IN_FINANCE'].includes(r.bankCheckMode)) errors.push(`${r.name}: choose a bank-check mode.`)
    if (!steps.length || steps.at(-1) !== 'FINANCE') errors.push(`${r.name}: Finance must be last.`)
    if (new Set(steps).size !== steps.length) errors.push(`${r.name}: each step can appear only once.`)
    if (steps.some(s => !W.STEPS.some(x => x.code === s))) errors.push(`${r.name}: choose steps from the supported list.`)
    // Requester review is the global on/off switch (ADR-003), never a route step:
    // resolve() would silently drop it, so reject it instead of pretending it was saved.
    if (steps.includes('REQUESTER')) errors.push(`${r.name}: Requester review is switched on or off for all routes with the "Requester review first" setting; remove it from this route.`)
    if (r.bankCheckMode === 'SEPARATE' && !steps.includes('BANK_CHECK')) errors.push(`${r.name}: include Bank call-back before Finance.`)
    if (r.bankCheckMode === 'IN_FINANCE' && steps.includes('BANK_CHECK')) errors.push(`${r.name}: remove the separate Bank call-back step when Finance performs it.`)
  }
  return errors
}
function resolve (routes, vendor, settings = {}) {
  const errors = validate(routes)
  if (errors.length) throw new Error(errors.join(' '))
  const sorted = [...routes].filter(r => r.active).sort((a, b) => Number(a.priority) - Number(b.priority) || String(a.ID).localeCompare(String(b.ID)))
  const route = sorted.find(r => Object.entries(DIMENSIONS).every(([key, field]) => !values(r[key]).length || values(r[key]).includes(vendor[field])))
  if (!route) throw new Error('No default approval route is configured.')
  let codes = values(route.steps).filter(s => s !== 'REQUESTER')
  if (String(settings.requesterReviewEnabled ?? 'true') !== 'false') codes = ['REQUESTER', ...codes]
  return {
    ID: route.ID, name: route.name, bankCheckMode: route.bankCheckMode,
    steps: codes.map(code => {
      const step = W.STEPS.find(s => s.code === code)
      return { ...step, reminderDays: Number(settings[step.remind] || (code === 'BANK_CHECK' ? 1 : 2)), escalationDays: Number(settings[step.escalate] || (code === 'BANK_CHECK' ? 3 : 5)) }
    }),
  }
}
module.exports = { validate, resolve, values, DIMENSIONS }
