'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { clientIp } = require('../srv/routes/http')

test('rate-limit IP key ignores unverified and spoofable forwarded values', () => {
  assert.equal(clientIp({ headers: { 'x-forwarded-for': '203.0.113.77, 198.51.100.20' }, socket: { remoteAddress: '10.0.0.8' } }), '10.0.0.8')
  assert.equal(clientIp({ headers: { 'x-forwarded-for': '203.0.113.77' }, socket: { remoteAddress: '10.0.0.8' } }), '10.0.0.8')
  assert.equal(clientIp({ headers: {}, socket: { remoteAddress: '10.0.0.9' } }), '10.0.0.9')
})
