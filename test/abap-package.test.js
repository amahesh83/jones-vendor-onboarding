'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { spawnSync } = require('node:child_process')
const { unzipSync, strFromU8 } = require('fflate')
test('offline abapGit archive includes descriptors, DDIC and ABAP Unit sources', () => {
  const run = spawnSync(process.execPath, ['scripts/package-abap.cjs'], { encoding: 'utf8' })
  assert.equal(run.status, 0, run.stderr)
  const entries = unzipSync(fs.readFileSync('gen/zvob-abapgit.zip'))
  assert.ok(entries['.abapgit.xml'])
  assert.ok(entries['src/zvob_reqlog.tabl.xml'])
  assert.ok(entries['src/zif_vob_duplicate_store.intf.xml'])
  for (const name of Object.keys(entries).filter(n => n.endsWith('.clas.abap'))) {
    assert.ok(entries[name.replace('.clas.abap', '.clas.xml')], name)
  }
  assert.match(strFromU8(entries['src/zcl_vob_duplicate_check.clas.testclasses.abap']), /lcl_store_double/)
  assert.match(strFromU8(entries['src/zcl_vob_vendor_service.clas.testclasses.abap']), /RISK LEVEL HARMLESS/)
  const vendor = strFromU8(entries['src/zcl_vob_vendor_service.clas.abap'])
  assert.match(vendor, /VERIFY IN DEV/)
  assert.doesNotMatch(vendor, /NOT_IMPLEMENTED/)
  assert.ok(vendor.indexOf('INSERT zvob_reqlog') < vendor.indexOf('COMMIT WORK AND WAIT'))
})
