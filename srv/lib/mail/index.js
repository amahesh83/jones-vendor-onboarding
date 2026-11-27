'use strict'
/*
 * Mail adapter:
 *   local (default): nothing leaves the machine; the email is kept in the
 *                    Notifications table and shown in the dev mailbox.
 *   graph:           Microsoft Graph sendMail through the BTP destination
 *                    configured as cds.requires['vob-graph'].
 * Every email is logged (recipient, subject, template). Bodies are stored only
 * by the local adapter, so one-time codes never sit in a production database.
 */
const cds = require('@sap/cds')
const { T } = require('./templates')
const { iso, now, settings, isProduction, fail } = require('../util')

const kind = () => cds.env.requires?.vob?.mail || 'local'

async function sendGraph ({ to, subject, html }) {
  const graph = await cds.connect.to('vob-graph')
  const s = await settings()
  await graph.send({
    method: 'POST',
    path: `/v1.0/users/${encodeURIComponent(s.senderAddress)}/sendMail`,
    data: {
      message: { subject, body: { contentType: 'HTML', content: html }, toRecipients: to.map(a => ({ emailAddress: { address: a } })) },
      saveToSentItems: false,
    },
  })
}

/**
 * Send one email from a template.
 * opts: { to: string|string[], template, data, requestId, actionUrl, code }
 */
async function send ({ to, template, data, requestId, actionUrl, code }) {
  const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean)
  if (!recipients.length) return
  const { subject, html, text } = T[template](data)
  const k = kind()
  if (k === 'local' && isProduction() && !cds.env.requires?.vob?.allowMocksInProduction) {
    throw new Error('The local mail adapter must not run in production. Set cds.requires.vob.mail = "graph".')
  }
  const row = {
    ID: cds.utils.uuid(), request_ID: requestId || null, toAddress: recipients.join(', '), subject, template,
    channel: k, createdAt: iso(now()), status: 'SENT',
  }
  let deliveryFailed = false
  if (k === 'local') Object.assign(row, { html, text, actionUrl: actionUrl || null, code: code || null })
  else {
    try { await sendGraph({ to: recipients, subject, html }) } catch (e) {
      deliveryFailed = true
      row.status = 'FAILED'
      row.error = String(e.message).slice(0, 500)
      cds.log('vob-mail').error('Email failed', e)
    }
  }
  await INSERT.into('jones.vob.Notifications').entries(row)
  if (deliveryFailed) fail(424, 'EMAIL_FAILED', 'Email delivery failed. This action was not completed; check the mail configuration before retrying.')
}

/** Email addresses for an approver role from the admin-maintained directory. */
async function roleRecipients (role) {
  const rows = await SELECT.from('jones.vob.RoleDirectory').where({ role })
  if (!rows.length) fail(503, 'MISSING_RECIPIENTS', `No email recipients are configured for ${role}. Ask a master data admin to add the role in Admin → Configuration before continuing.`)
  return rows.map(r => r.email)
}

module.exports = { send, roleRecipients, kind }
