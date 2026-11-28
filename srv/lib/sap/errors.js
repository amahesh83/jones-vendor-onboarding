'use strict'

/** SAP refused the data (HTTP 422). Not retried automatically: a person must fix something. */
class SapBusinessError extends Error {
  constructor (messages, message) {
    super(message || messages?.find(m => m.type === 'E')?.text || 'SAP rejected the vendor data.')
    this.kind = 'BUSINESS'
    this.messages = messages || []
  }
}

/** SAP or the network was unavailable (HTTP 5xx, timeout). Retried with backoff. */
class SapTransientError extends Error {
  constructor (message, technical) {
    super(message || 'SAP is not reachable right now.')
    this.kind = 'TRANSIENT'
    this.technical = technical
    this.messages = [{ type: 'E', id: 'HTTP', number: '503', text: technical || message || 'Service unavailable' }]
  }
}

/** Turn SAP messages into one friendly sentence for people who don't speak SAP. */
function plainEnglish (messages) {
  const errors = (messages || []).filter(m => m.type === 'E' || m.type === 'A')
  if (!errors.length) return 'SAP accepted the data.'
  const m = errors[0]
  const t = String(m.text || '')
  if (/bank key|bank.*not exist|BNKA/i.test(t)) return 'SAP doesn\'t know this bank yet. Allow "Create missing bank in SAP" in the finance data, then retry, or ask the master data team to create the bank first.'
  if (/unavailable|timeout|503|connect/i.test(t)) return 'SAP was not reachable. We tried several times. Please retry later; nothing was created.'
  if (/reconciliation|AKONT/i.test(t)) return 'The reconciliation account is not valid for this company code. Correct it in the finance data and retry.'
  if (/payment term|ZTERM/i.test(t)) return 'SAP doesn\'t recognise the payment terms key. Ask the admin to check the payment terms configuration.'
  if (/tax|VAT|STCEG/i.test(t)) return 'SAP rejected the VAT or tax number. Check it with the vendor and send the request back if needed.'
  return `SAP said: ${t}`
}

module.exports = { SapBusinessError, SapTransientError, plainEnglish }
