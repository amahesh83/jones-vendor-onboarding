'use strict'
// CAP's Node build does not copy plain app/ assets automatically.
const fs = require('node:fs')
const path = require('node:path')
const root = path.join(__dirname, '..')
const target = path.join(root, 'gen', 'srv')
if (!fs.existsSync(path.join(target, 'package.json'))) throw new Error('Run cds build --production first.')
fs.cpSync(path.join(root, 'app'), path.join(target, 'app'), { recursive: true })
for (const file of ['app/internal/index.html', 'app/portal/index.html', 'app/assets/approval-routes.js', 'srv/assets/FIN-010-template.pdf']) {
  if (!fs.existsSync(path.join(target, file))) throw new Error('Deployment asset missing: ' + file)
}
process.stdout.write('Staged staff/portal assets and verified FIN-010 template.\n')
