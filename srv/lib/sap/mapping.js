'use strict'
const V = require('../validation')

/**
 * Build the JSON body for POST /vendors (design section 9) from a request.
 * cfg: { accountType, paymentTerm, companyCode } config rows.
 * Field names follow the ECC contract; the ABAP side maps them to VMDS_EI_MAIN.
 */
function buildVendorPayload (r, cfg = {}, { testRun = false } = {}) {
  const names = V.splitName(r.companyName)
  const derived = r.iban ? V.deriveFromIban(r.iban) : null
  const wht = []
  if (r.whtType && r.whtCode) {
    wht.push({ type: r.whtType, code: r.whtCode, subject: true, id: r.rctNumber || r.utrNumber || null })
  }
  return {
    requestId: r.requestNumber,
    testRun: !!testRun,
    companyCode: r.companyCode,
    accountGroup: r.accountType,
    central: {
      name1: names[0] || '', name2: names[1] || '', name3: names[2] || '', name4: names[3] || '',
      searchTerm: V.searchTerm(r.companyName),
      country: r.country,
      language: 'EN',
      street: r.street,
      district: r.district || '',
      city: r.city,
      postCode: r.postCode,
      phone: r.phone || '',
      email: r.accountsEmail,
      vatNumber: r.notVatRegistered ? '' : (r.vatNumber || ''),
      companyRegNo: r.companyRegNo || '',
    },
    contacts: {
      accountsClerk: r.accountsContactName,
      accountsEmail: r.accountsEmail,
      salesPerson: r.salesContactName || '',
      salesEmail: r.salesEmail || '',
    },
    bank: {
      country: r.iban ? r.iban.slice(0, 2) : r.country,
      bankKey: (derived && derived.sortCode) || r.sortCode || r.bic || '',
      bankAccount: (derived && derived.accountNo) || r.bankAccountNo || '',
      iban: r.iban || '',
      swift: r.bic || '',
      bankName: r.bankName,
      bankAddress: r.bankAddress,
      accountHolder: r.accountHolder || r.companyName,
      createMissingBank: !!r.createMissingBank,
    },
    companyData: {
      companyCode: r.companyCode,
      reconAccount: r.reconAccount || cfg.accountType?.reconAccount || '',
      paymentTerms: cfg.paymentTerm?.sapKey || '',
      paymentMethods: r.paymentMethods || '',
    },
    withholdingTax: wht,
    purchasing: {
      purchasingOrg: r.purchasingOrg || cfg.companyCode?.purchasingOrg || '',
      currency: r.currency,
      paymentTerms: cfg.paymentTerm?.sapKey || '',
      grBasedInvoiceVerification: r.grBasedIv !== false,
      salesPerson: r.salesContactName || '',
      phone: r.phone || '',
    },
    trace: {
      requestedBy: r.requesterName,
      approvals: (r.approvals || []).map(a => ({ step: a.step, by: a.userName, at: a.decidedAt })),
    },
  }
}

module.exports = { buildVendorPayload }
