'use strict'
const cds = require('@sap/cds')
const { isProduction } = require('../util')

/** Returns the configured SAP adapter: 'mock' (default, local) or 'http' (BTP destination). */
function sap () {
  const kind = cds.env.requires?.vob?.sap || 'mock'
  if (kind === 'mock') {
    if (isProduction() && !cds.env.requires?.vob?.allowMocksInProduction) {
      throw new Error('The mock SAP adapter must not run in production. Set cds.requires.vob.sap = "http".')
    }
    return require('./mock')
  }
  return require('./http')
}

module.exports = { sap }
