'use strict'
/*
 * Starting values for the configuration that master data admins edit in the app
 * (settings, approval routes, payment terms, account types, document types,
 * company codes and the role directory).
 *
 * These deliberately do NOT live in db/data: CAP turns db/data CSVs into HDI
 * .hdbtabledata, and HDI rewrites that table content on every deployment, which
 * would silently undo an admin's approval-route or settings changes on the next
 * `cf deploy`. Instead the app inserts starting values only where nothing exists:
 *   - Settings: any setting name that is missing (so new settings arrive with an
 *     upgrade, and admin-edited values are never touched);
 *   - every other table: only when the table is completely empty (first start).
 * The role directory holds placeholder @jones.test people, so it is never seeded
 * in production: real approver pools must be maintained there by an admin.
 * Reference data that admins cannot edit (countries, currencies, WHT codes) stays
 * in db/data and is deployment-managed.
 */
const cds = require('@sap/cds')
const fs = require('fs')
const path = require('path')

const FOLDER = path.join(__dirname, '..', 'seed')
const TABLES = ['Settings', 'CompanyCodes', 'AccountTypes', 'PaymentTerms', 'DocumentTypes', 'ApprovalRoutes', 'RoleDirectory']
const LOG = cds.log('vob')

function rows (table) {
  const entity = cds.model.definitions[`jones.vob.${table}`]
  if (!entity) throw new Error(`Unknown configuration entity ${table}`)
  const lines = fs.readFileSync(path.join(FOLDER, `jones.vob-${table}.csv`), 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim())
  const header = lines.shift().split(';')
  return lines.map(line => {
    const cells = line.split(';')
    if (cells.length !== header.length) throw new Error(`${table}: expected ${header.length} columns in "${line}"`)
    return Object.fromEntries(header.map((column, i) => {
      const element = entity.elements[column]
      if (!element) throw new Error(`${table}: unknown column ${column}`)
      const raw = cells[i]
      if (raw === '') return [column, null]
      if (element.type === 'cds.Boolean') return [column, raw === 'true']
      if (element.type === 'cds.Integer') return [column, Number(raw)]
      return [column, raw]
    }))
  })
}

/** Insert starting configuration where it is missing. Safe to run on every start. */
async function seed ({ production = require('./util').isProduction() } = {}) {
  const added = {}
  for (const table of TABLES) {
    if (table === 'RoleDirectory' && production) continue
    const entity = `jones.vob.${table}`
    const wanted = rows(table)
    let missing
    if (table === 'Settings') {
      const have = new Set((await SELECT.from(entity).columns('name')).map(r => r.name))
      missing = wanted.filter(r => !have.has(r.name))
    } else {
      const { count } = await SELECT.one.from(entity).columns('count(1) as count')
      missing = Number(count) ? [] : wanted
    }
    if (missing.length) {
      await INSERT.into(entity).entries(missing)
      added[table] = missing.length
    }
  }
  if (Object.keys(added).length) LOG.info('Starting configuration inserted', added)
  return added
}

module.exports = { seed, rows, TABLES, FOLDER }
