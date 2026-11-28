'use strict'
const fs = require('node:fs')
const path = require('node:path')
const { zipSync } = require('fflate')
const entries = {}
function collect (folder, prefix = '') {
  for (const item of fs.readdirSync(folder, { withFileTypes: true })) {
    const name = prefix + item.name
    if (item.isDirectory()) collect(path.join(folder, item.name), name + '/')
    else entries[name] = new Uint8Array(fs.readFileSync(path.join(folder, item.name)))
  }
}
collect(path.join(__dirname, '..', 'abap'))
fs.mkdirSync(path.join(__dirname, '..', 'gen'), { recursive: true })
fs.writeFileSync(path.join(__dirname, '..', 'gen', 'zvob-abapgit.zip'), zipSync(entries))
