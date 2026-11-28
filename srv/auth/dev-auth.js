'use strict'
/*
 * Development-only login: the persona picked in the app (cookie vob_dev_user)
 * or HTTP Basic with a persona id (used by tests). Refuses to load in production.
 * Production uses XSUAA (IAS trusting Entra ID), configured in package.json.
 */
const cds = require('@sap/cds')
const { find } = require('./personas')

module.exports = function dev_auth () {
  if (process.env.NODE_ENV === 'production' || cds.env.profiles?.includes('production')) {
    throw new Error('The development login must never run in production. Configure cds.requires.auth = "xsuaa".')
  }
  return function dev_auth_middleware (req, res, next) {
    let id
    const h = req.headers.authorization
    if (h && /^basic /i.test(h)) id = Buffer.from(h.slice(6), 'base64').toString().split(':')[0]
    else {
      const m = /(?:^|;\s*)vob_dev_user=([^;]+)/.exec(req.headers.cookie || '')
      if (m) id = decodeURIComponent(m[1])
    }
    const p = id && find(id)
    const user = p
      ? new cds.User({ id: p.id, roles: [...p.roles, 'authenticated-user'], attr: { name: p.name, email: p.id } })
      : new cds.User.Anonymous()
    req.user = user
    if (cds.context) cds.context.user = user
    next()
  }
}
