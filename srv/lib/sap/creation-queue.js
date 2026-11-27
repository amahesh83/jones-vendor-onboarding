'use strict'
// Durable transactional outbox; no DB transaction is held during the SAP call.
const cds = require('@sap/cds')
const JOBS = 'jones.vob.SapCreationJobs'
let draining
const stamp = () => new Date().toISOString()
async function enqueue (requestId) {
  await UPSERT.into(JOBS).entries({ requestId, state: 'READY', attempts: 0, nextAttemptAt: stamp(), leaseUntil: null, owner: null, lastError: null })
}
async function drain () {
  const jobs = await cds.tx(() => SELECT.from(JOBS).where`(state = 'READY' and nextAttemptAt <= ${stamp()}) or (state = 'WORKING' and leaseUntil < ${stamp()})`)
  for (const job of jobs) {
    const owner = cds.utils.uuid()
    const claimed = await cds.tx(() => UPDATE(JOBS).set({ state: 'WORKING', owner, leaseUntil: new Date(Date.now() + 300000).toISOString(), attempts: job.attempts + 1 }).where`requestId = ${job.requestId} and ((state = 'READY' and nextAttemptAt <= ${stamp()}) or (state = 'WORKING' and leaseUntil < ${stamp()}))`)
    if (!claimed) continue
    try {
      const R = require('../requests')
      let request = await cds.tx(() => SELECT.one.from(R.E.R).columns('status').where({ ID: job.requestId }))
      if (request?.status !== 'CREATED') {
        await R.createInSap(job.requestId, { attempt: job.attempts + 1 })
        request = await cds.tx(() => SELECT.one.from(R.E.R).columns('status').where({ ID: job.requestId }))
      }
      if (request?.status === 'CREATED') await R.sendCreatedNotifications(job.requestId)
      await cds.tx(() => UPDATE(JOBS).set({ state: 'DONE', owner: null, leaseUntil: null }).where({ requestId: job.requestId, owner }))
    } catch (e) {
      const attempts = job.attempts + 1
      const delays = cds.env.requires?.vob?.retryDelays || [0, 2000, 5000]
      const request = await cds.tx(() => SELECT.one.from('jones.vob.VendorRequests').columns('status').where({ ID: job.requestId }))
      if (request?.status === 'CREATED') {
        if (attempts >= delays.length) {
          await cds.tx(async () => {
            const U = require('../util')
            await U.audit(job.requestId, U.SYSTEM, 'CREATED_EMAIL_FAILED', 'SAP created the vendor, but created-number email delivery exhausted automatic retries. An admin can retry the failed notices.')
            await UPDATE(JOBS).set({ state: 'FAILED', lastError: String(e.message).slice(0, 500), owner: null, leaseUntil: null }).where({ requestId: job.requestId, owner })
          })
        } else {
          await cds.tx(() => UPDATE(JOBS).set({ state: 'READY', nextAttemptAt: new Date(Date.now() + delays[attempts]).toISOString(), owner: null, leaseUntil: null, lastError: String(e.message).slice(0, 500) }).where({ requestId: job.requestId, owner }))
        }
      } else if (attempts >= delays.length) {
        await cds.tx(async () => {
          const R = require('../requests'), U = require('../util')
          await UPDATE(R.E.R).set({ status: 'SAP_ERROR', sapMessagesJson: JSON.stringify({ plain: 'SAP processing could not complete. An administrator can retry this request.', messages: [] }) }).where({ ID: job.requestId, status: 'CREATING' })
          await U.audit(job.requestId, U.SYSTEM, 'SAP_ERROR', 'Persistent creation job exhausted retries; administrator retry required.')
          await UPDATE(JOBS).set({ state: 'FAILED', lastError: String(e.message).slice(0, 500), owner: null, leaseUntil: null }).where({ requestId: job.requestId, owner })
        })
      } else {
        await cds.tx(() => UPDATE(JOBS).set({ state: 'READY', nextAttemptAt: new Date(Date.now() + delays[attempts]).toISOString(), owner: null, leaseUntil: null, lastError: String(e.message).slice(0, 500) }).where({ requestId: job.requestId, owner }))
      }
    }
  }
}
function flush () {
  if (!draining) draining = drain().finally(() => { draining = null })
  return draining
}
async function idle () {
  for (let i = 0; i < 400; i++) {
    await flush()
    const todo = await cds.tx(() => SELECT.one.from(JOBS).where`state = 'READY' or state = 'WORKING'`)
    if (!todo) return
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  throw new Error('SAP queue did not become idle')
}
module.exports = { enqueue, flush, idle }
