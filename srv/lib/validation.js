/*
 * Jones Vendor Onboarding: shared validation rules.
 * This one file is used by the server (require) and by the browser
 * (served at /assets/validation.js, exposed as window.VobValidation),
 * so the rules can never drift apart. Pure functions only.
 */
(function (root, factory) {
  const api = factory()
  if (typeof module === 'object' && module.exports) module.exports = api
  else root.VobValidation = api
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict'

  // IBAN lengths per country (ISO 13616 registry, the countries Jones is likely to see)
  const IBAN_LENGTHS = {
    AD: 24, AE: 23, AT: 20, BA: 20, BE: 16, BG: 22, CH: 21, CY: 28, CZ: 24, DE: 22, DK: 18,
    EE: 20, ES: 24, FI: 18, FO: 18, FR: 27, GB: 22, GI: 23, GL: 18, GR: 27, HR: 21, HU: 28,
    IE: 22, IS: 26, IT: 27, LI: 21, LT: 20, LU: 20, LV: 21, MC: 27, MT: 31, NL: 18, NO: 15,
    PL: 28, PT: 25, RO: 24, RS: 22, SE: 24, SI: 19, SK: 24, SM: 27,
  }

  const VAT_PATTERNS = {
    IE: /^IE(\d{7}[A-W][A-IW]?|\d[A-Z+*]\d{5}[A-W])$/,
    GB: /^(GB|XI)(\d{9}|\d{12}|GD[0-4]\d{2}|HA[5-9]\d{2})$/,
    AT: /^ATU\d{8}$/, BE: /^BE[01]\d{9}$/, DE: /^DE\d{9}$/, DK: /^DK\d{8}$/,
    ES: /^ES[A-Z0-9]\d{7}[A-Z0-9]$/, FI: /^FI\d{8}$/, FR: /^FR[A-HJ-NP-Z0-9]{2}\d{9}$/,
    IT: /^IT\d{11}$/, LU: /^LU\d{8}$/, NL: /^NL\d{9}B\d{2}$/, PL: /^PL\d{10}$/,
    PT: /^PT\d{9}$/, SE: /^SE\d{12}$/, CH: /^CHE\d{9}(MWST|TVA|IVA)?$/, NO: /^NO\d{9}(MVA)?$/,
  }
  const VAT_EXAMPLES = { IE: 'IE1234567T', GB: 'GB123456789', DE: 'DE123456789', FR: 'FR12345678901', NL: 'NL123456789B01' }
  const VAT_COUNTRIES = Object.keys(VAT_PATTERNS)

  const EIRCODE = /^(?:[AC-FHKNPRTV-Y]\d{2}|D6W) ?[0-9AC-FHKNPRTV-Y]{4}$/i
  const UK_POSTCODE = /^(GIR ?0AA|[A-PR-UWYZ](\d{1,2}|[A-HK-Y]\d{1,2}|\d[A-HJKPSTUW]|[A-HK-Y]\d[ABEHMNPRV-Y]) ?\d[ABD-HJLNP-UW-Z]{2})$/i
  const BIC = /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/
  const EMAIL = /^[^\s@<>()[\],;:"]+@[^\s@<>()[\],;:"]+\.[A-Za-z]{2,}$/
  const PHONE = /^\+?[0-9][0-9 ()-]{6,19}$/
  const IE_TAX_REF = /^\d{7}[A-W][A-IW]?$/

  // ---------------------------------------------------------------- helpers

  const str = v => (v === undefined || v === null) ? '' : String(v)
  const compact = v => str(v).replace(/[\s.-]/g, '').toUpperCase()
  const isBlank = v => str(v).trim() === ''

  function mod97 (numeric) {
    let rest = 0
    for (let i = 0; i < numeric.length; i += 7) rest = Number(String(rest) + numeric.slice(i, i + 7)) % 97
    return rest
  }
  function ibanNumeric (s) {
    return s.replace(/[A-Z]/g, ch => String(ch.charCodeAt(0) - 55))
  }

  function normalizeIban (v) { return str(v).replace(/\s+/g, '').toUpperCase() }

  function formatIban (v) { return normalizeIban(v).replace(/(.{4})/g, '$1 ').trim() }

  /** Returns undefined when the IBAN is valid, otherwise a plain-English problem. */
  function checkIban (v) {
    const s = normalizeIban(v)
    if (!s) return 'Please enter the IBAN.'
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(s)) return 'An IBAN starts with two letters and two numbers, for example IE29 AIBK 9311 5212 3456 78.'
    const country = s.slice(0, 2), len = IBAN_LENGTHS[country]
    if (!len) return `We can't check IBANs from ${country} yet. Please contact your Jones contact.`
    if (s.length !== len) return `An IBAN from ${country} has ${len} characters. This one has ${s.length}.`
    if (mod97(ibanNumeric(s.slice(4) + s.slice(0, 4))) !== 1) return 'This IBAN has a typo: the check digits don\'t match. Please copy it from your bank letter.'
    return undefined
  }

  /** Build a valid IBAN from country + BBAN (used for test and demo data). */
  function makeIban (country, bban) {
    const b = normalizeIban(bban), c = String(country).toUpperCase()
    const check = 98 - mod97(ibanNumeric(b + c + '00'))
    return c + String(check).padStart(2, '0') + b
  }

  /** For IE and GB IBANs, derive bank code, sort code and account number. */
  function deriveFromIban (v) {
    const s = normalizeIban(v)
    if (checkIban(s)) return null
    const country = s.slice(0, 2)
    if ((country === 'IE' || country === 'GB') && s.length === 22) {
      return { country, bankCode: s.slice(4, 8), sortCode: s.slice(8, 14), accountNo: s.slice(14, 22) }
    }
    return { country }
  }

  function formatSortCode (v) {
    const d = str(v).replace(/\D/g, '')
    return d.length === 6 ? `${d.slice(0, 2)}-${d.slice(2, 4)}-${d.slice(4)}` : str(v)
  }

  function checkBic (v) {
    const s = compact(v)
    if (!s) return 'Please enter the BIC (also called SWIFT code).'
    if (!BIC.test(s)) return 'A BIC has 8 or 11 characters, for example AIBKIE2D.'
    return undefined
  }

  function bicCountryWarning (bic, iban) {
    const b = compact(bic), i = normalizeIban(iban)
    if (BIC.test(b) && i.length > 2 && b.slice(4, 6) !== i.slice(0, 2)) {
      return `The BIC is for ${b.slice(4, 6)} but the IBAN is from ${i.slice(0, 2)}. Please double-check both.`
    }
    return undefined
  }

  function normalizeVat (v) { return compact(v) }

  function checkVat (v, country) {
    const s = normalizeVat(v)
    if (!s) return 'Please enter the VAT number.'
    const prefix = s.slice(0, 2)
    const key = (country === 'GB' && prefix === 'XI') ? 'GB' : (VAT_PATTERNS[country] ? country : prefix === 'EL' ? 'GR' : prefix)
    const re = VAT_PATTERNS[key]
    if (re) {
      if (!re.test(s)) return `That doesn't look like a ${key} VAT number. Example: ${VAT_EXAMPLES[key] || key + '…'}.`
      return undefined
    }
    if (!/^[A-Z0-9]{4,20}$/.test(s)) return 'Please use letters and numbers only (4 to 20 characters).'
    return undefined
  }

  function checkPostCode (v, country) {
    const s = str(v).trim()
    if (!s) return country === 'IE' ? 'Please enter the Eircode.' : 'Please enter the postcode.'
    if (country === 'IE' && !EIRCODE.test(s)) return 'An Eircode looks like D04 HN50.'
    if (country === 'GB' && !UK_POSTCODE.test(s)) return 'A UK postcode looks like BT1 5GS or SW1A 1AA.'
    if (s.length > 10) return 'Postcodes can have at most 10 characters.'
    return undefined
  }

  function formatPostCode (v, country) {
    const s = str(v).trim().toUpperCase().replace(/\s+/g, '')
    if (country === 'IE' && EIRCODE.test(s)) return s.slice(0, 3) + ' ' + s.slice(3)
    if (country === 'GB' && UK_POSTCODE.test(s)) return s.slice(0, -3) + ' ' + s.slice(-3)
    return str(v).trim().toUpperCase()
  }

  function checkEmail (v) {
    const s = str(v).trim()
    if (!s) return 'Please enter an email address.'
    if (s.length > 241 || !EMAIL.test(s)) return 'Please check the email address, for example accounts@company.com.'
    return undefined
  }

  function checkPhone (v) {
    const s = str(v).trim()
    if (!PHONE.test(s)) return 'Please enter a phone number with the country code, for example +353 1 474 9800.'
    return undefined
  }

  function maskEmail (v) {
    const s = str(v)
    const at = s.indexOf('@')
    if (at < 1) return '***'
    return s[0] + '***' + s.slice(at)
  }

  function maskIban (v) {
    const s = normalizeIban(v)
    if (s.length < 8) return s ? '••••' : ''
    return s.slice(0, 4) + ' •••• •••• ' + s.slice(-4)
  }

  function maskTail (v, keep = 4) {
    const s = str(v).replace(/\s/g, '')
    if (!s) return ''
    return '••••' + s.slice(-keep)
  }

  /** Split a long name into SAP NAME1..NAME4 (35 characters each) at word boundaries. */
  function splitName (name, size = 35, parts = 4) {
    const words = str(name).trim().split(/\s+/).filter(Boolean)
    const out = []
    let line = ''
    for (let w of words) {
      while (w.length > size) { if (line) { out.push(line); line = '' } out.push(w.slice(0, size)); w = w.slice(size) }
      if (!line) line = w
      else if ((line + ' ' + w).length <= size) line += ' ' + w
      else { out.push(line); line = w }
    }
    if (line) out.push(line)
    return out.slice(0, parts)
  }

  function searchTerm (name) {
    return str(name).toUpperCase().replace(/\b(LIMITED|LTD|PLC|DAC|CLG|UC|GMBH|BV|SA|SRL|INC|LLC)\b\.?/g, '')
      .replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim().slice(0, 20)
  }

  function normalizeName (name) {
    return searchTerm(name).replace(/\s/g, '')
  }

  // --------------------------------------------------------- field catalogue

  const isIbanCountry = c => !!IBAN_LENGTHS[c]
  const isVatCountry = c => VAT_COUNTRIES.includes(c)

  /** Context for conditional fields: { country, accountType, subcontractor } */
  const FIELDS = [
    // Company
    { key: 'country', section: 'company', label: 'Country', type: 'country', required: () => true,
      help: 'Where your company is registered. This decides which tax and bank details we ask for.' },
    { key: 'companyName', section: 'company', label: 'Legal company name', max: 140, required: () => true,
      help: 'Exactly as registered, so our payments match your bank account.' },
    { key: 'street', section: 'company', label: 'Street and number', max: 60, required: () => true, autocomplete: 'address-line1' },
    { key: 'district', section: 'company', label: 'District or locality', max: 40, required: () => false, autocomplete: 'address-line2' },
    { key: 'city', section: 'company', label: 'Town or city', max: 40, required: () => true, autocomplete: 'address-level2' },
    { key: 'postCode', section: 'company', label: ctx => ctx.country === 'IE' ? 'Eircode' : 'Postcode', max: 10, required: () => true,
      check: (v, ctx) => checkPostCode(v, ctx.country), autocomplete: 'postal-code' },
    { key: 'phone', section: 'company', label: 'Main phone number', type: 'tel', max: 30, required: () => false,
      check: v => checkPhone(v), help: 'So our buyers can reach you.' },
    { key: 'companyRegNo', section: 'company', max: 20, required: () => false,
      label: ctx => ctx.country === 'IE' ? 'CRO number' : ctx.country === 'GB' ? 'Companies House number' : 'Company registration number',
      check: (v, ctx) => {
        const s = compact(v)
        if (ctx.country === 'IE' && !/^\d{1,6}$/.test(s)) return 'A CRO number has up to 6 digits.'
        if (ctx.country === 'GB' && !/^([0-9]{8}|[A-Z]{2}[0-9]{6})$/.test(s)) return 'A Companies House number has 8 characters, for example 01234567 or NI123456.'
        return undefined
      },
      help: 'Leave blank if you are a sole trader.' },

    // Contacts
    { key: 'accountsContactName', section: 'contacts', label: 'Accounts contact name', max: 80, required: () => true,
      help: 'The person we contact about invoices and payments.' },
    { key: 'accountsEmail', section: 'contacts', label: 'Accounts email', type: 'email', max: 241, required: () => true,
      check: v => checkEmail(v), help: 'Remittance advice goes here.' },
    { key: 'salesContactName', section: 'contacts', label: 'Sales contact name', max: 80, required: () => false,
      help: 'Who our buyers should talk to about orders.' },
    { key: 'salesEmail', section: 'contacts', label: 'Sales email', type: 'email', max: 241, required: () => false,
      check: v => checkEmail(v) },

    // Tax
    { key: 'notVatRegistered', section: 'tax', label: 'We are not registered for VAT', type: 'checkbox', required: () => false,
      visible: ctx => isVatCountry(ctx.country) },
    { key: 'vatNumber', section: 'tax', label: 'VAT number', max: 20,
      required: ctx => isVatCountry(ctx.country) && !ctx.notVatRegistered,
      visible: ctx => !ctx.notVatRegistered,
      check: (v, ctx) => checkVat(v, ctx.country), normalize: normalizeVat,
      help: 'Include the country prefix, for example IE1234567T. We use it to check for duplicates.' },
    { key: 'rctNumber', section: 'tax', label: 'RCT tax reference', max: 20,
      visible: ctx => ctx.country === 'IE' && ctx.subcontractor, required: ctx => ctx.country === 'IE' && ctx.subcontractor,
      check: v => IE_TAX_REF.test(compact(v)) ? undefined : 'An Irish tax reference looks like 1234567T or 1234567TA.', normalize: compact,
      help: 'Needed for Relevant Contracts Tax because you are a sub-contractor.' },
    { key: 'utrNumber', section: 'tax', label: 'UTR number', max: 13,
      visible: ctx => ctx.country === 'GB' && ctx.subcontractor, required: ctx => ctx.country === 'GB' && ctx.subcontractor,
      check: v => /^\d{10}$/.test(str(v).replace(/\s/g, '')) ? undefined : 'A UTR has 10 digits.', normalize: v => str(v).replace(/\s/g, ''),
      help: 'Your Unique Taxpayer Reference from HMRC.' },
    { key: 'cisNumber', section: 'tax', label: 'CIS registration number', max: 20,
      visible: ctx => ctx.country === 'GB' && ctx.subcontractor, required: () => false,
      check: v => /^[A-Z0-9/ -]{4,20}$/i.test(str(v).trim()) ? undefined : 'Please use letters and numbers only.',
      help: 'Only if you are registered for the Construction Industry Scheme.' },

    // Bank
    { key: 'iban', section: 'bank', label: 'IBAN', max: 34,
      visible: ctx => isIbanCountry(ctx.country), required: ctx => isIbanCountry(ctx.country),
      check: v => checkIban(v), normalize: normalizeIban,
      help: 'Copy it from your bank letter. For Irish and UK accounts we fill in the sort code and account number for you.' },
    { key: 'bankAccountNo', section: 'bank', label: 'Account number', max: 18,
      visible: ctx => !isIbanCountry(ctx.country), required: ctx => !isIbanCountry(ctx.country),
      check: v => /^[0-9A-Z -]{4,18}$/i.test(str(v).trim()) ? undefined : 'Please use numbers and letters only (4 to 18 characters).' },
    { key: 'sortCode', section: 'bank', label: 'Bank or routing code', max: 10,
      visible: ctx => !isIbanCountry(ctx.country), required: ctx => !isIbanCountry(ctx.country),
      check: v => /^[0-9A-Z -]{3,10}$/i.test(str(v).trim()) ? undefined : 'Please use numbers and letters only.' },
    { key: 'bic', section: 'bank', label: 'BIC / SWIFT code', max: 11, required: () => true,
      check: v => checkBic(v), normalize: compact, help: 'Usually 8 or 11 characters, printed on your bank letter.' },
    { key: 'bankName', section: 'bank', label: 'Bank name', max: 60, required: () => true },
    { key: 'bankAddress', section: 'bank', label: 'Bank branch address', max: 120, required: () => true },
    { key: 'accountHolder', section: 'bank', label: 'Account holder name', max: 60, required: () => true,
      help: 'As shown on the bank account. Usually your company name.' },
    { key: 'bankContactName', section: 'bank', label: 'Who can confirm these bank details?', max: 80, required: () => true,
      help: 'We phone to confirm bank details before any payment. It\'s a standard fraud check.' },
    { key: 'bankContactPhone', section: 'bank', label: 'Their phone number', type: 'tel', max: 30, required: () => true,
      check: v => checkPhone(v) },
  ]

  const SECTIONS = [
    { key: 'company', title: 'Company', icon: 'building', blurb: 'Who you are and where you are based.' },
    { key: 'contacts', title: 'Contacts', icon: 'people', blurb: 'Who we talk to about invoices and orders.' },
    { key: 'tax', title: 'Tax', icon: 'receipt', blurb: 'Your VAT and tax references.' },
    { key: 'bank', title: 'Bank', icon: 'bank', blurb: 'Where we pay you. We confirm these details by phone.' },
    { key: 'documents', title: 'Documents', icon: 'folder', blurb: 'Upload the documents we need.' },
    { key: 'review', title: 'Review & submit', icon: 'check', blurb: 'Check everything and send it to Jones.' },
  ]

  function labelOf (field, ctx) { return typeof field.label === 'function' ? field.label(ctx || {}) : field.label }

  function isVisible (field, ctx) { return field.visible ? !!field.visible(ctx) : true }

  function fieldsFor (section, ctx) {
    return FIELDS.filter(f => f.section === section && isVisible(f, ctx))
  }

  /** Validate the visible fields of one section. Returns { field: message }. */
  function validateSection (section, data, ctx) {
    const errors = {}
    const c = Object.assign({}, ctx, { country: data.country || ctx.country, notVatRegistered: !!data.notVatRegistered })
    for (const f of fieldsFor(section, c)) {
      if (f.type === 'checkbox') continue
      const v = data[f.key]
      if (isBlank(v)) {
        if (f.required && f.required(c)) {
          const label = labelOf(f, c)
          errors[f.key] = f.key === 'bankContactName' ? 'Please tell us who can confirm these bank details.'
            : f.key === 'country' ? 'Please choose a country.'
              : `Please enter the ${/^[A-Z][a-z]/.test(label) ? label[0].toLowerCase() + label.slice(1) : label}.`
        }
        continue
      }
      if (f.max && str(v).length > f.max) { errors[f.key] = `Please keep this to ${f.max} characters or fewer.`; continue }
      const msg = f.check && f.check(v, c)
      if (msg) errors[f.key] = msg
    }
    return errors
  }

  function validateAll (data, ctx) {
    const all = {}
    for (const s of ['company', 'contacts', 'tax', 'bank']) Object.assign(all, validateSection(s, data, ctx))
    return all
  }

  /** Clean a section's data: keep known visible fields only, normalise, derive. */
  function cleanSection (section, input, ctx) {
    const c = Object.assign({}, ctx, { country: input.country || ctx.country, notVatRegistered: !!input.notVatRegistered })
    const out = {}
    for (const f of FIELDS.filter(x => x.section === section)) {
      if (!isVisible(f, c)) { out[f.key] = f.type === 'checkbox' ? false : null; continue }
      let v = input[f.key]
      if (f.type === 'checkbox') { out[f.key] = !!v; continue }
      v = isBlank(v) ? null : str(v).trim()
      if (v && f.normalize) v = f.normalize(v)
      if (v && f.key === 'postCode') v = formatPostCode(v, c.country)
      if (v && f.key === 'companyName') v = v.replace(/\s+/g, ' ')
      out[f.key] = v
    }
    if (section === 'bank' && isIbanCountry(c.country)) {
      const d = out.iban && deriveFromIban(out.iban)
      out.sortCode = d && d.sortCode ? d.sortCode : null
      out.bankAccountNo = d && d.accountNo ? d.accountNo : null
    }
    return out
  }

  /** Which document types are required for this vendor. */
  function requiredDocTypes (docTypes, ctx) {
    return docTypes.filter(d => {
      if (d.countries && !String(d.countries).split(',').map(s => s.trim()).includes(ctx.country)) return false
      if (d.requiredFor === 'ALL') return true
      if (d.requiredFor === 'SUB') return !!ctx.subcontractor
      if (!d.requiredFor || d.requiredFor === 'NONE') return false
      return String(d.requiredFor).split(',').map(s => s.trim()).includes(ctx.accountType)
    })
  }

  function visibleDocTypes (docTypes, ctx) {
    return docTypes.filter(d => !d.countries || String(d.countries).split(',').map(s => s.trim()).includes(ctx.country))
  }

  return {
    IBAN_LENGTHS, VAT_PATTERNS, FIELDS, SECTIONS,
    normalizeIban, formatIban, checkIban, makeIban, deriveFromIban, formatSortCode,
    checkBic, bicCountryWarning, normalizeVat, checkVat, checkPostCode, formatPostCode,
    checkEmail, checkPhone, maskEmail, maskIban, maskTail, splitName, searchTerm, normalizeName,
    isIbanCountry, isVatCountry, labelOf, isVisible, fieldsFor, validateSection, validateAll,
    cleanSection, requiredDocTypes, visibleDocTypes,
  }
})
