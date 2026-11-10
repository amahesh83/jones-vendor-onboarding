'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
test('committed SAP creation survives process exit and resumes from SQLite', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'vob-queue-'))
  try {
    const db = path.join(folder, 'jobs.sqlite')
    for (const mode of ['persist', 'recover', 'recover']) {
      const run = spawnSync(process.execPath, ['test/fixtures/queue-process.cjs', mode, db], { encoding: 'utf8', timeout: 30000 })
      assert.equal(run.status, 0, run.stdout + run.stderr)
      if (mode === 'recover') assert.match(run.stdout, /RECOVERED 100003/)
    }
  } finally { fs.rmSync(folder, { recursive: true, force: true }) }
})
