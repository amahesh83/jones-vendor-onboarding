'use strict'
/*
 * Real SAP adapter: calls the ZVOB REST API (design section 9) through the
 * BTP destination configured as cds.requires['vob-ecc'] (Cloud Connector, or
 * a CPI pass-through iFlow; the contract is the same either way).
 */
const cds = require('@sap/cds')
const { SapBusinessError, SapTransientError } = require('./errors')

let ecc
async function service () {
  ecc ??= await cds.connect.to('vob-ecc')
  return ecc
}

async function call (method, path, data) {
  const srv = await service()
  try {
    return await srv.send({ method, path, data, headers: { 'content-type': 'application/json', accept: 'application/json' } })
  } catch (e) {
    const status = e.statusCode || e.status || e.reason?.response?.status || e.response?.status
    const body = e.reason?.response?.data || e.response?.data || e.innererror?.response?.data
    if (status === 422) throw new SapBusinessError(body?.messages || [{ type: 'E', text: e.message }])
    throw new SapTransientError('SAP is not reachable right now.', `${status || ''} ${e.message}`.trim())
  }
}

module.exports = {
  kind: 'http',
  ping: () => call('GET', '/ping'),
  duplicates: q => call('POST', '/duplicates', q),
  createVendor: p => call('POST', '/vendors', p),
  getVendor: lifnr => call('GET', `/vendors/${encodeURIComponent(lifnr)}`),
  addAttachment: (lifnr, a) => call('POST', `/vendors/${encodeURIComponent(lifnr)}/attachments`, a),
}
