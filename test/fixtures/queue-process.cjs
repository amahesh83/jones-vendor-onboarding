// Two separate Node processes use the same SQLite DB, proving restart recovery.
process.env.CDS_ENV = 'test'
const cds = require('@sap/cds')
;(async () => {
  const [mode, filename] = process.argv.slice(2)
  cds.env.requires.db.credentials = { url: filename }
  const model = await cds.load('db')
  cds.model = cds.linked(model)
  const db = await cds.connect.to('db')
  const queue = require('../../srv/lib/sap/creation-queue')
  const id = '11111111-1111-4111-8111-111111111111'
  if (mode === 'persist') {
    await cds.deploy(model).to(db)
    await cds.tx(async () => {
      await INSERT.into('jones.vob.VendorRequests').entries({ ID: id, requestNumber: 'VOB-2099-90001', companyName: 'Restart Synthetic Ltd', companyCode: 'IE01', country: 'IE', accountType: 'YBIV', paymentTerms: '60EOM', currency: 'EUR', status: 'CREATING', round: 1, requesterEmail: 'requester@example.test', vendorEmail: 'vendor@example.test' })
      await queue.enqueue(id)
    })
  } else {
    await queue.idle()
    const row = await SELECT.one.from('jones.vob.VendorRequests').where({ ID: id })
    const job = await SELECT.one.from('jones.vob.SapCreationJobs').where({ requestId: id })
    if (row.status !== 'CREATED' || job.state !== 'DONE') throw new Error('Recovery did not create the vendor')
    console.log('RECOVERED', row.sapVendorNumber)
  }
  await db.disconnect()
})().catch(e => { console.error(e); process.exitCode = 1 })
