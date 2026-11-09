'use strict'
/*
 * Vendor access (design section 10): invite link (256-bit token, stored hashed)
 * + 6-digit email code (10 min, 5 attempts, 15 min lock) + short session cookie
 * (HttpOnly, Secure, SameSite=Strict, sliding 2 h) scoped to one request.
 * Functions that must persist a failed attempt return { error } instead of
 * throwing, so the attempt counter is committed.
 */
const cds = require('@sap/cds')
const U = require('./util')
const V = require('./validation')
const mail = require('./mail')

const T = 'jones.vob.InviteTokens', O = 'jones.vob.OtpChallenges', P = 'jones.vob.PortalSessions', R = 'jones.vob.VendorRequests'
const COOKIE = 'vob_portal'

const LINK_INVALID = 'This link has expired or has been replaced by a newer one. Please ask your Jones contact to send you a new link.'

async function tokenRow (token) {
  if (!token || String(token).length < 20 || String(token).length > 100) return null
  const row = await SELECT.one.from(T).where({ tokenHash: U.sha256(token) })
  if (!row || row.revoked || new Date(row.expiresAt) < U.now()) return null
  const r = await SELECT.one.from(R).where({ ID: row.request_ID })
  if (!r || ['EXPIRED', 'CANCELLED', 'REJECTED'].includes(r.status)) return null
  return { row, request: r }
}

async function start (token) {
  const t = await tokenRow(token)
  if (!t) return { error: { status: 410, code: 'LINK_INVALID', message: LINK_INVALID } }
  const s = await U.settings()
  const challenges = await SELECT.from(O).where({ tokenHash: t.row.tokenHash }).orderBy('createdAt desc')
  const locked = challenges.find(c => c.lockedUntil && new Date(c.lockedUntil) > U.now())
  if (locked) return { error: { status: 423, code: 'LOCKED', message: `For your security this link is locked after too many wrong codes. Please try again after ${new Date(locked.lockedUntil).toISOString().slice(11, 16)} UTC.` } }
  const recent = challenges.filter(c => new Date(c.createdAt) > U.addMinutes(U.now(), -15))
  if (recent.length >= 5) return { error: { status: 429, code: 'TOO_MANY', message: 'We\'ve sent several codes already. Please check your inbox (and spam folder), or wait 15 minutes and ask for a new one.' } }
  const code = U.randomCode()
  const ID = cds.utils.uuid()
  const minutes = s.otpMinutes || 10
  await UPDATE(O).set({ consumedAt: U.iso(U.now()) }).where({ tokenHash: t.row.tokenHash, consumedAt: null })
  await INSERT.into(O).entries({ ID, request_ID: t.request.ID, tokenHash: t.row.tokenHash, codeHash: U.sha256(ID + ':' + code), expiresAt: U.iso(U.addMinutes(U.now(), minutes)), attempts: 0, createdAt: U.iso(U.now()) })
  await UPDATE(T).set({ lastUsedAt: U.iso(U.now()) }).where({ ID: t.row.ID })
  await mail.send({ to: t.request.vendorEmail, template: 'otp', requestId: t.request.ID, code, data: { code, minutes } })
  return { maskedEmail: V.maskEmail(t.request.vendorEmail), minutes }
}

async function verify (token, code, ip) {
  const t = await tokenRow(token)
  if (!t) return { error: { status: 410, code: 'LINK_INVALID', message: LINK_INVALID } }
  const s = await U.settings()
  const ch = await SELECT.one.from(O).where({ tokenHash: t.row.tokenHash }).orderBy('createdAt desc')
  if (ch?.lockedUntil && new Date(ch.lockedUntil) > U.now()) return { error: { status: 423, code: 'LOCKED', message: 'For your security this link is locked for 15 minutes after too many wrong codes.' } }
  if (!ch || ch.consumedAt || new Date(ch.expiresAt) < U.now()) return { error: { status: 410, code: 'CODE_EXPIRED', message: 'That code has expired. Please ask for a new one.' } }
  const clean = String(code || '').replace(/\D/g, '')
  if (!U.safeEqual(U.sha256(ch.ID + ':' + clean), ch.codeHash)) {
    const attempts = (ch.attempts || 0) + 1
    const max = s.otpMaxAttempts || 5
    if (attempts >= max) {
      await UPDATE(O).set({ attempts, lockedUntil: U.iso(U.addMinutes(U.now(), s.otpLockMinutes || 15)) }).where({ ID: ch.ID })
      await U.audit(t.request.ID, { type: 'VENDOR', id: t.request.vendorEmail, name: 'Vendor' }, 'OTP_LOCKED', `Locked after ${attempts} wrong codes (IP ${ip || 'unknown'})`)
      return { error: { status: 423, code: 'LOCKED', message: 'That code wasn\'t right, and that was the last try. For your security this link is now locked for 15 minutes.' } }
    }
    await UPDATE(O).set({ attempts }).where({ ID: ch.ID })
    const left = max - attempts
    return { error: { status: 401, code: 'WRONG_CODE', message: `That code isn't right. You have ${left} ${left === 1 ? 'try' : 'tries'} left.` } }
  }
  await UPDATE(O).set({ consumedAt: U.iso(U.now()) }).where({ ID: ch.ID })
  const session = U.randomToken(32), csrf = U.randomToken(24)
  const minutes = s.sessionMinutes || 120
  await INSERT.into(P).entries({ ID: cds.utils.uuid(), request_ID: t.request.ID, sessionHash: U.sha256(session), csrfHash: U.sha256(csrf), expiresAt: U.iso(U.addMinutes(U.now(), minutes)), createdAt: U.iso(U.now()), lastSeenAt: U.iso(U.now()), ip: String(ip || '').slice(0, 64) })
  await U.audit(t.request.ID, { type: 'VENDOR', id: t.request.vendorEmail, name: t.request.vendorContactName || 'Vendor' }, 'VENDOR_SIGNED_IN', 'Signed in with the email code')
  return { session, csrf, maxAgeMs: minutes * 60000 }
}

function readCookie (req, name) {
  const raw = req.headers.cookie || ''
  for (const part of raw.split(';')) {
    const i = part.indexOf('=')
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim())
  }
  return undefined
}

/** Resolve the vendor session from the cookie; checks CSRF for state-changing calls; slides the expiry. */
async function session (req, { mutating }) {
  const raw = readCookie(req, COOKIE)
  if (!raw) return null
  const row = await SELECT.one.from(P).where({ sessionHash: U.sha256(raw) })
  if (!row || new Date(row.expiresAt) < U.now()) return null
  if (mutating) {
    const csrf = req.headers['x-vob-csrf']
    if (!csrf || !U.safeEqual(U.sha256(csrf), row.csrfHash)) U.fail(403, 'CSRF', 'Your session needs refreshing. Please reload the page.')
  }
  const s = await U.settings()
  await UPDATE(P).set({ expiresAt: U.iso(U.addMinutes(U.now(), s.sessionMinutes || 120)), lastSeenAt: U.iso(U.now()) }).where({ ID: row.ID })
  const request = await SELECT.one.from(R).where({ ID: row.request_ID })
  if (!request) return null
  return { row, request }
}

async function logout (req) {
  const raw = readCookie(req, COOKIE)
  if (raw) await DELETE.from(P).where({ sessionHash: U.sha256(raw) })
}

const cookieOptions = maxAge => ({ httpOnly: true, secure: true, sameSite: 'strict', path: '/api/portal', maxAge })

module.exports = { start, verify, session, logout, readCookie, COOKIE, cookieOptions, LINK_INVALID }
