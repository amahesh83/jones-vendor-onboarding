'use strict'
const { expect } = require('@playwright/test')
const { default: AxeBuilder } = require('@axe-core/playwright')
const { PDFDocument } = require('pdf-lib')
const fs = require('fs')
const path = require('path')
const V = require('../srv/lib/validation')
let sequence = 0
const prefix = `${Date.now()}`
const actor = name => ({ rachel: 'rachel.requester', paddy: 'paddy.purchasing', priya: 'priya.procurement', ben: 'ben.bank', fiona: 'fiona.finance', adam: 'adam.admin', aoife: 'aoife.auditor', ronan: 'ronan.requester' }[name] + '@jones.test')
async function login (page, name = 'rachel') {
  await page.request.post('/api/dev/login', { data: { id: actor(name) } })
}
async function post (page, url, data = {}) {
  const r = await page.request.post('/api/internal' + url, { data, headers: { 'x-requested-with': 'VOB' } })
  expect(r.ok(), await r.text()).toBeTruthy()
  return r.json()
}
async function mails (page, id) {
  const r = await page.request.get('/api/dev/mailbox')
  return (await r.json()).filter(m => !id || m.request_ID === id)
}
async function invite (page, opts = {}) {
  await login(page, opts.requester || 'rachel')
  const n = ++sequence
  const body = { companyName: `Test ${prefix} ${n} Ltd`, vendorContactName: 'Taylor Test', vendorEmail: `vendor-${prefix}-${n}@example.test`, accountType: 'YBIV', paymentTerms: '60EOM', businessReason: 'Synthetic browser acceptance test', country: 'IE', ...opts }
  delete body.requester
  return { ...(await post(page, '/requests', body)), body }
}
async function accessibility (page) {
  await page.locator('.skeleton').first().waitFor({ state: 'hidden' })
  await expect(page.locator('.toast')).toHaveCount(0, { timeout: 10000 })
  await page.evaluate(() => document.fonts.ready)
  // Let finite entrance animations (fade-in/rise/pop) settle: axe measures the
  // colours it sees, and a half-faded element reports false contrast failures.
  // Infinite ones (pulse, shimmer) never finish, so they are skipped.
  await page.evaluate(() => Promise.all(document.getAnimations()
    .filter(a => a.effect?.getComputedTiming().iterations !== Infinity)
    .map(a => a.finished.catch(() => {}))))
  // The email preview intentionally forbids scripts. Do not relax its sandbox to
  // inject axe; scan the mailbox UI and verify the preview's accessible title.
  if (await page.locator('iframe[sandbox]').count()) await expect(page.getByTitle('Email preview')).toBeVisible()
  const result = await new AxeBuilder({ page }).exclude('iframe[sandbox]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
  const serious = result.violations.filter(v => ['serious', 'critical'].includes(v.impact))
  expect(serious, JSON.stringify(serious.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })))).toEqual([])
  return result
}
async function check (page, label, info) {
  const result = await accessibility(page)
  const dir = path.join('docs', 'test-evidence', info.project.name)
  fs.mkdirSync(dir, { recursive: true })
  await page.screenshot({ path: path.join(dir, label + '.png'), fullPage: true,
    // Mailbox contains short-lived demo auth links/codes; never commit them.
    mask: [page.locator('#mb .list-card b'), page.locator('#mail .mono'), page.locator('#mail .code-big'), page.locator('#mail h2'), page.locator('#mail iframe')],
    maskColor: '#cbd5e1',
  })
  await info.attach(label + '-axe', { body: JSON.stringify(result.violations, null, 2), contentType: 'application/json' })
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)
  expect(overflow, `${label}: page must not scroll horizontally`).toBe(false)
}
async function openVendor (page, request, inspect) {
  // A test can onboard two vendors; never inherit the first vendor's session.
  await page.context().clearCookies({ name: 'vob_portal' })
  await page.goto(request.devLink)
  await page.locator('#send').click()
  await expect(page.locator('#otpForm')).toBeVisible()
  if (inspect) await inspect('vendor-code')
  const otp = (await mails(page, request.ID)).find(m => m.template === 'otp')
  await page.locator('.otp input').first().fill(otp.code)
  await expect(page.locator('#otpForm')).toBeHidden()
  if (inspect && await page.locator('#go').count()) await inspect('vendor-checklist')
  if (await page.locator('#begin').count()) await page.locator('#begin').click()
  // Welcome CTA's stable ID is read from the real portal.
  if (await page.getByRole('button', { name: /Let's go|Get started|Start filling|Let’s go/ }).count()) await page.getByRole('button', { name: /Let's go|Get started|Start filling|Let’s go/ }).click()
}
async function docFile (name = 'bank.pdf') {
  const pdf = await PDFDocument.create(); pdf.addPage([420, 300]).drawText('Synthetic acceptance-test document')
  return { name, mimeType: 'application/pdf', buffer: Buffer.from(await pdf.save()) }
}
async function upload (page, code) {
  const valid = page.locator(`[data-valid="${code}"]`)
  if (await valid.count()) await valid.fill('2030-12-31')
  const response = page.waitForResponse(r => r.url().endsWith('/api/portal/documents') && r.request().method() === 'POST')
  await page.locator(`[data-file="${code}"]`).setInputFiles(await docFile())
  expect((await response).ok()).toBeTruthy()
  await expect(page.locator(`[data-doc="${code}"]`)).toHaveClass(/done/)
}
async function fillVendor (page, request, inspect) {
  const gb = request.body.country === 'GB'
  const unique = parseInt(require('node:crypto').createHash('sha256').update(request.ID).digest('hex').slice(0, 7), 16) % 8999999
  const values = {
    company: { country: gb ? 'GB' : 'IE', companyName: request.body.companyName, street: '1 Test Street', city: gb ? 'London' : 'Dublin', postCode: gb ? 'SW1A 1AA' : 'D04 HN50', companyRegNo: gb ? '12345678' : '123456' },
    contacts: { accountsContactName: 'Taylor Test', accountsEmail: request.body.vendorEmail },
    tax: { vatNumber: gb ? 'GB987654321' : 'IE' + (1000000 + unique) + 'T', rctNumber: '1234567T', utrNumber: '1234567890', cisNumber: 'CIS12345' },
    bank: { iban: gb ? 'GB82WEST12345698765432' : V.makeIban('IE', 'AIBK931152' + String(10000000 + unique).padStart(8, '0')), bic: gb ? 'WESTGB2L' : 'AIBKIE2D', bankName: 'Test Bank', bankAddress: '1 Test Square', accountHolder: request.body.companyName, bankContactName: 'Taylor Test', bankContactPhone: '+35315550123' },
  }
  for (const section of ['company', 'contacts', 'tax', 'bank']) {
    await page.locator(`[data-step="${section}"]`).click()
    for (const [key, value] of Object.entries(values[section])) {
      const field = page.locator(`#f_${key}`)
      if (!await field.count()) continue
      if (key === 'country') await field.selectOption(value)
      else await field.fill(value)
    }
    if (inspect) await inspect(`vendor-${section}`)
    await page.locator('#next').click()
    await expect(page.locator(`[data-step="${section}"]`)).not.toHaveClass(/\bon\b/)
  }
  return values
}
async function submit (page) {
  await page.locator('[data-step="review"]').click()
  await page.locator('#accept').check()
  await page.locator('#decl').fill('Taylor Test')
  await page.locator('#submit').click()
  await expect(page.getByRole('heading', { name: /Thank you/ })).toBeVisible()
}
async function detail (page, id, who) {
  await login(page, who)
  await page.goto(`/internal/?visit=${Date.now()}-${who}#/requests/${id}`)
  await expect(page.locator('#banners')).toBeVisible()
}
async function approve (page, id, who) {
  await detail(page, id, who)
  const response = page.waitForResponse(r => r.url().endsWith(`/requests/${id}/approve`) && r.request().method() === 'POST')
  await page.locator('#approve').click()
  const out = await response
  expect(out.ok(), await out.text()).toBeTruthy()
}
async function throughFinance (page, id, procurement = false, inspect) {
  await approve(page, id, 'rachel')
  if (procurement) {
    if (inspect) { await detail(page, id, 'priya'); await inspect('procurement') }
    await approve(page, id, 'priya')
  }
  await detail(page, id, 'ben')
  await page.locator('#bNum').fill('+35315550123')
  await page.locator('#bWho').fill('Taylor Test')
  await page.locator('[data-out="CONFIRMED"]').click()
  await page.locator('#bSave').click()
  await expect(page.locator('#approve')).toBeEnabled()
  if (inspect) await inspect('bank-callback')
  const bankApproved = page.waitForResponse(r => r.url().endsWith(`/requests/${id}/approve`) && r.request().method() === 'POST')
  await page.locator('#approve').click()
  expect((await bankApproved).ok()).toBeTruthy()
  await detail(page, id, 'fiona')
  if (inspect) await inspect('finance')
  await page.locator('#fSim').click()
  await expect(page.locator('#approve')).toBeEnabled()
}
async function prepared (page, opts = {}) {
  const request = await invite(page, opts)
  await openVendor(page, request)
  await fillVendor(page, request)
  for (const code of ['BANK_LETTER', ...(opts.accountType && opts.accountType !== 'YBIV' ? ['TAX_CLEARANCE', 'INSURANCE', 'SAFETY', 'SUBCONTRACT'] : [])]) {
    if (await page.locator(`[data-file="${code}"]`).count()) await upload(page, code)
  }
  await submit(page)
  return request
}
module.exports = { expect, login, post, mails, invite, check, accessibility, openVendor, fillVendor, upload, submit, detail, approve, throughFinance, prepared, docFile, actor }
