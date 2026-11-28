'use strict'
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const binary = path.join(__dirname, '..', 'node_modules', 'mbt', 'unpacked_bin', process.platform === 'win32' ? 'mbt.exe' : 'mbt')
if (!fs.existsSync(binary)) {
  process.stderr.write('MBT binary is missing. Install the pinned mbt package with its approved install script, then retry.\n')
  process.exit(1)
}
if (spawnSync('make', ['--version'], { stdio: 'ignore' }).status !== 0) {
  process.stderr.write('MTA packaging needs GNU make. Use BAS or the Linux CI runner, or install GNU make locally.\n')
  process.exit(1)
}
const run = spawnSync(binary, ['build', '-t', 'gen', '--mtar', 'vob.mtar'], { stdio: 'inherit' })
if (run.status !== 0) process.exit(run.status || 1)
if (!fs.existsSync(path.join(__dirname, '..', 'gen', 'vob.mtar'))) {
  process.stderr.write('MBT did not produce gen/vob.mtar.\n')
  process.exit(1)
}
