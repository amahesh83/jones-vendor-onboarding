'use strict'
/*
 * Upload checks: type allow-list (by content, not by file name), size limit,
 * malware scan before any internal user can open the file.
 *   scanner 'mock' (local): rejects the EICAR test string.
 *   scanner 'btp'         : SAP Malware Scanning Service binding (cds.requires['malware-scanner']).
 */
const cds = require('@sap/cds')
const { fail, sha256, isProduction } = require('./util')

const MAX_BYTES = 10 * 1024 * 1024
const TYPES = [
  { mime: 'application/pdf', ext: 'pdf', magic: b => b.subarray(0, 5).toString('latin1') === '%PDF-' },
  { mime: 'image/jpeg', ext: 'jpg', magic: b => b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF },
  { mime: 'image/png', ext: 'png', magic: b => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])) },
]
const EICAR = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'

function inspect ({ fileName, content }) {
  if (!content) fail(400, 'NO_FILE', 'Please choose a file to upload.')
  const buf = Buffer.isBuffer(content) ? content : Buffer.from(String(content).replace(/^data:[^,]*,/, ''), 'base64')
  if (!buf.length) fail(400, 'EMPTY_FILE', 'That file is empty. Please choose another one.')
  if (buf.length > MAX_BYTES) fail(413, 'FILE_TOO_LARGE', 'That file is larger than 10 MB. Please upload a smaller copy, for example a scan at lower resolution.')
  const type = TYPES.find(t => t.magic(buf))
  if (!type) fail(415, 'FILE_TYPE', 'Please upload a PDF, JPG or PNG file.')
  const safeName = String(fileName || `document.${type.ext}`).replace(/[^\w .()-]/g, '_').slice(0, 120) || `document.${type.ext}`
  return { buffer: buf, mimeType: type.mime, fileName: safeName, size: buf.length, sha256: sha256(buf.toString('base64')) }
}

async function scan (buffer) {
  const kind = cds.env.requires?.vob?.scanner || 'mock'
  if (kind === 'mock') {
    if (isProduction() && !cds.env.requires?.vob?.allowMocksInProduction) throw new Error('The mock malware scanner must not run in production.')
    return buffer.includes(Buffer.from(EICAR)) ? 'INFECTED' : 'CLEAN'
  }
  const creds = cds.env.requires?.['malware-scanner']?.credentials
  if (!creds?.uri) throw new Error('No SAP Malware Scanning Service binding found.')
  const res = await fetch(new URL('/scan', creds.uri), {
    method: 'POST',
    headers: { authorization: 'Basic ' + Buffer.from(`${creds.username}:${creds.password}`).toString('base64'), 'content-type': 'application/octet-stream' },
    body: buffer,
  })
  if (!res.ok) throw new Error(`Malware scan failed: HTTP ${res.status}`)
  const out = await res.json()
  return out.malwareDetected ? 'INFECTED' : 'CLEAN'
}

module.exports = { inspect, scan, MAX_BYTES, EICAR }
