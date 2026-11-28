'use strict'
/*
 * Fills the real FIN-010-IE01 form (srv/assets/FIN-010-template.pdf) by its
 * exact AcroForm field names, writes "Approved electronically by ..." into the
 * signature areas, flattens it and appends an audit-trail page. Auditors get the
 * form they already know.
 */
const fs = require('fs')
const path = require('path')
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib')

const TEMPLATE = path.join(__dirname, '..', 'assets', 'FIN-010-template.pdf')

const ACCOUNT_BOXES = { YBIV: 'Material Supplier', YBCS: 'Contract for Service', YBSP: 'Supply of Personnel', YBVE: 'Fully Contracted out Service' }
const TERM_BOXES = { '30EOM': '30 Days EOM', '60EOM': '60 Days EOM', '90EOM': '90 Days EOM' }
const CURRENCY_BOXES = { EUR: 'Euro', GBP: 'GBP', USD: 'USD' }
const DOC_BOXES = { INSURANCE: 'Insurance Cert', SAFETY: 'Safety Statement', RCT1: 'RCT Form', SUBCONTRACT: 'Sub-Contract Agreement', TAX_CLEARANCE: 'Tax Clearance Cert' }

/** Standard PDF fonts only cover Latin-1: replace anything else so filling never fails. */
function safe (v) {
  return String(v ?? '')
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/…/g, '...')
    .replace(/[→]/g, '->').replace(/[•·]/g, '-').replace(/€/g, 'EUR ')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7E\xA0-\xFF\n]/g, '?')
}

const fmtDate = d => d ? new Date(d).toISOString().slice(0, 10).split('-').reverse().join('/') : ''
const fmtDateTime = d => d ? `${fmtDate(d)} ${new Date(d).toISOString().slice(11, 16)} UTC` : ''

/**
 * data: {
 *   request, countryName, documents:[{docType}], decisions:[{step, userName, decidedAt}],
 *   bankCheck:{userName, recordedAt}, events:[{at, actorName, event, message}]
 * }
 */
async function buildFin010 (data) {
  const r = data.request
  const doc = await PDFDocument.load(fs.readFileSync(TEMPLATE))
  const form = doc.getForm()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const pages = doc.getPages()

  const text = (name, value) => {
    try {
      const f = form.getTextField(name)
      f.setFontSize(0)
      f.setText(safe(value).slice(0, 200))
    } catch { /* field absent in a future template version: ignore */ }
  }
  const tick = name => { try { form.getCheckBox(name).check() } catch { /* ignore */ } }

  if (ACCOUNT_BOXES[r.accountType]) tick(ACCOUNT_BOXES[r.accountType])
  text('Company Name', r.companyName)
  text('Street Name/Number', r.street)
  text('District', r.district)
  text('City/County', r.city)
  text('Post Code', r.postCode)
  text('Country', data.countryName || r.country)
  text('Accounts Contact Name', r.accountsContactName)
  text('Accounts Email', r.accountsEmail)
  text('Sales Contact Name', r.salesContactName)
  text('Sales Email', r.salesEmail)
  text('CRO No', r.companyRegNo)
  text('VAT Reg No', r.notVatRegistered ? 'Not VAT registered' : r.vatNumber)
  text('RCT No', r.rctNumber)
  text('CIS No', r.cisNumber)
  text('UTR No', r.utrNumber)
  text('Bank Name', r.bankName)
  text('Bank Address', r.bankAddress)
  text('Bank Account No', r.bankAccountNo)
  text('Sort Code', r.sortCode)
  text('Swift Code/BIC', r.bic)
  text('IBAN', r.iban)
  text('Contact Name', r.bankContactName)
  text('Contact Phone No', r.bankContactPhone)
  if (TERM_BOXES[r.paymentTerms]) tick(TERM_BOXES[r.paymentTerms])
  if (CURRENCY_BOXES[r.currency]) tick(CURRENCY_BOXES[r.currency]); else text('Other', r.currency)
  for (const d of data.documents || []) if (DOC_BOXES[d.docType]) tick(DOC_BOXES[d.docType])
  text('Vendor Print Name', r.declarationName)
  text('Completed On Date_af_date', fmtDate(r.declarationAt))

  const decision = step => (data.decisions || []).filter(d => d.step === step && d.decision === 'APPROVED' && d.round === r.round).sort((a, b) => String(b.decidedAt).localeCompare(String(a.decidedAt)))[0]
  const procurement = decision('PROCUREMENT')
  if (procurement) text('Approved By', procurement.userName)
  const requester = decision('REQUESTER')
  text('Requested By', r.requesterName)
  text('Date 1', fmtDate(requester?.decidedAt || r.createdAt))
  const pm = decision('PURCHASING'), fc = decision('FINANCE')
  const bank = decision('BANK_CHECK') || (data.bankCheck?.outcome === 'CONFIRMED' ? { userName: data.bankCheck.userName, decidedAt: data.bankCheck.recordedAt } : null)
  text('Date 2', fmtDate(pm?.decidedAt))
  text('Date 3', fmtDate(fc?.decidedAt))
  text('Date 4', fmtDate(bank?.decidedAt))
  text('Created By', r.sapVendorNumber ? `SAP interface - vendor ${r.sapVendorNumber}` : 'Pending SAP creation')
  text('Date 5', fmtDate(r.createdInSapAt))

  // Signature fields: write the electronic approval into their boxes, then remove the empty /Sig fields
  const signatures = {
    'Vendor Signature': r.declarationAt ? `Declared electronically by ${r.declarationName} on ${fmtDate(r.declarationAt)}` : '',
    'Purchasing Manager': pm ? `Approved electronically by ${pm.userName} on ${fmtDate(pm.decidedAt)}` : '',
    'Financial Controller': fc ? `Approved electronically by ${fc.userName} on ${fmtDate(fc.decidedAt)}` : '',
    'Bank Confirmed By': bank ? `Confirmed by call-back: ${bank.userName} on ${fmtDate(bank.decidedAt)}` : '',
  }
  for (const [name, label] of Object.entries(signatures)) {
    let field
    try { field = form.getSignature(name) } catch { continue }
    const widget = field.acroField.getWidgets()[0]
    const rect = widget.getRectangle()
    const page = pages.find(p => p.ref === widget.P()) || pages[0]
    if (label) {
      const s = safe(label)
      let size = 7.5
      while (size > 4.5 && font.widthOfTextAtSize(s, size) > rect.width - 4) size -= 0.25
      page.drawText(s, { x: rect.x + 2, y: rect.y + Math.max(2, (rect.height - size) / 2), size, font, color: rgb(0.12, 0.16, 0.45) })
    }
    form.removeField(field)
  }

  form.updateFieldAppearances(font)
  form.flatten()

  // Audit trail page(s)
  const W = 595.5, H = 842.52, M = 40
  let page = doc.addPage([W, H])
  let y = H - M
  const line = (s, opts = {}) => {
    const size = opts.size || 9
    const f = opts.bold ? bold : font
    const words = safe(s).split(/\s+/)
    let current = ''
    const out = []
    for (const w of words) {
      const t = current ? current + ' ' + w : w
      if (f.widthOfTextAtSize(t, size) > (opts.width || W - 2 * M) && current) { out.push(current); current = w } else current = t
    }
    if (current) out.push(current)
    for (const l of out) {
      if (y < M + 20) { page = doc.addPage([W, H]); y = H - M }
      page.drawText(l, { x: opts.x || M, y, size, font: f, color: opts.color || rgb(0.1, 0.1, 0.2) })
      y -= size + 4
    }
  }
  page.drawRectangle({ x: 0, y: H - 70, width: W, height: 70, color: rgb(0.19, 0.18, 0.51) })
  page.drawText('FIN-010-IE01: electronic approval trail', { x: M, y: H - 42, size: 16, font: bold, color: rgb(1, 1, 1) })
  y = H - 95
  line(`Request ${r.requestNumber} - ${r.companyName}`, { bold: true, size: 11 })
  line(`Company code ${r.companyCode} | Account group ${r.accountType} | Payment terms ${r.paymentTerms} | Currency ${r.currency}`)
  line(`SAP vendor number: ${r.sapVendorNumber || 'not created yet'} | Generated ${fmtDateTime(new Date())}`)
  const route = require('./workflow').routeFor(r)
  line(`Route: ${route.name} - ${route.steps.map(s => s.label).join(' -> ')}`, { bold: true })
  line(`Bank call-back: ${route.bankCheckMode === 'IN_FINANCE' ? 'recorded within the Finance step (one-person bank/finance check)' : 'separate Bank verifier before Finance'}`)
  line('This form was completed online by the vendor and approved electronically in Jones Vendor Onboarding. Each approval below was made by a signed-in user; the vendor confirmed their identity with a one-time code sent to their email.', { size: 8.5 })
  y -= 6
  line('Approvals', { bold: true, size: 11 })
  for (const d of (data.decisions || []).filter(x => x.decision === 'APPROVED')) {
    line(`${fmtDateTime(d.decidedAt)}  ${d.step}  approved by ${d.userName}${d.comment ? ' - "' + d.comment + '"' : ''}`)
  }
  if (data.bankCheck) {
    line(`Bank call-back: ${data.bankCheck.outcome} by ${data.bankCheck.userName} on ${fmtDateTime(data.bankCheck.calledAt)}; number source ${data.bankCheck.numberSource}; spoke to ${data.bankCheck.personSpokenTo}.`)
  }
  y -= 6
  line('Full event history', { bold: true, size: 11 })
  for (const e of data.events || []) {
    line(`${fmtDateTime(e.at)}  ${e.actorName}  ${e.event}: ${e.message || ''}`, { size: 8 })
  }
  return Buffer.from(await doc.save())
}

module.exports = { buildFin010, safe }
