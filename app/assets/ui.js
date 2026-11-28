/* Tiny UI helpers shared by the vendor portal and the internal app. No framework. */
(function () {
  'use strict'
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ESC[c])

  /** Safe HTML template: interpolations are escaped unless wrapped with raw(). */
  class Raw { constructor (s) { this.s = s } toString () { return this.s } }
  const raw = s => new Raw(s)
  function html (strings, ...vals) {
    let out = ''
    strings.forEach((s, i) => {
      out += s
      if (i < vals.length) {
        const v = vals[i]
        if (v instanceof Raw) out += v.s
        else if (Array.isArray(v)) out += v.map(x => x instanceof Raw ? x.s : esc(x)).join('')
        else if (v === false || v === null || v === undefined) out += ''
        else out += esc(v)
      }
    })
    return raw(out)
  }

  const $ = (sel, root = document) => root.querySelector(sel)
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)]

  let csrf = null
  async function api (url, { method = 'GET', body, headers = {} } = {}, retried = false) {
    const h = { accept: 'application/json', ...headers }
    if (body !== undefined) h['content-type'] = 'application/json'
    if (method !== 'GET') {
      h['x-requested-with'] = 'VOB'
      if (url.startsWith('/api/internal')) {
        if (!csrf) {
          try { const r = await fetch('/api/internal/me', { headers: { 'x-csrf-token': 'fetch' }, credentials: 'same-origin' }); csrf = r.headers.get('x-csrf-token') || 'none' } catch { csrf = 'none' }
        }
        if (csrf && csrf !== 'none') h['x-csrf-token'] = csrf
      }
    }
    const res = await fetch(url, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'same-origin' })
    let data = null
    const ct = res.headers.get('content-type') || ''
    if (ct.includes('json')) data = await res.json().catch(() => null)
    if (!res.ok) {
      // The App Router answers a missing/stale token with 403 and "x-csrf-token: Required"
      // (e.g. after its session timed out). Fetch a fresh token and retry once.
      if (res.status === 403 && /required/i.test(res.headers.get('x-csrf-token') || '')) {
        csrf = null
        if (!retried) return api(url, { method, body, headers }, true)
      }
      const err = new Error(data?.error?.message || `Something went wrong (HTTP ${res.status}).`)
      err.status = res.status; err.code = data?.error?.code; err.details = data?.error?.details; err.technical = data?.error?.technical || data?.error?.ref
      throw err
    }
    return data
  }

  function toast (msg, kind = '') {
    let box = $('#toasts')
    if (!box) { box = document.createElement('div'); box.id = 'toasts'; box.setAttribute('role', 'status'); document.body.appendChild(box) }
    const t = document.createElement('div')
    t.className = 'toast ' + kind
    t.textContent = msg
    box.appendChild(t)
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 300) }, kind === 'bad' ? 6000 : 3200)
  }

  function modal (content, { wide = false, onClose } = {}) {
    const previousFocus = document.activeElement
    const back = document.createElement('div')
    back.className = 'modal-back'
    back.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" tabindex="-1">${content}</div>`
    const title = back.querySelector('h1,h2,h3')
    if (title) { title.id = 'dialog-title'; back.firstElementChild.setAttribute('aria-labelledby', title.id) }
    const siblings = [...document.body.children].filter(el => !el.inert && !['SCRIPT', 'STYLE'].includes(el.tagName))
    siblings.forEach(el => { el.inert = true })
    const close = () => {
      back.remove(); siblings.forEach(el => { el.inert = false })
      document.removeEventListener('keydown', key)
      if (previousFocus?.isConnected) previousFocus.focus()
      onClose && onClose()
    }
    const key = e => {
      if (e.key === 'Escape') close()
      if (e.key !== 'Tab') return
      const items = [...back.querySelectorAll('a[href],button,input,select,textarea,[tabindex="0"]')].filter(el => !el.disabled && el.getClientRects().length)
      const first = items[0], last = items.at(-1)
      if (!first) { e.preventDefault(); back.firstElementChild.focus(); return }
      if (e.shiftKey && (document.activeElement === first || document.activeElement === back.firstElementChild)) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    back.addEventListener('mousedown', e => { if (e.target === back) close() })
    document.addEventListener('keydown', key)
    document.body.appendChild(back)
    back.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close))
    setTimeout(() => (back.querySelector('input,select,textarea,button') || back.firstElementChild).focus(), 30)
    return { el: back.firstElementChild, close }
  }

  function confetti (n = 160) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const c = document.createElement('canvas')
    c.className = 'confetti'
    document.body.appendChild(c)
    const ctx = c.getContext('2d')
    const W = c.width = innerWidth, H = c.height = innerHeight
    const colors = ['#4f46e5', '#06b6d4', '#a855f7', '#f59e0b', '#10b981', '#ef4444', '#ec4899']
    const ps = Array.from({ length: n }, () => ({ x: W / 2 + (Math.random() - .5) * 200, y: H * .35, vx: (Math.random() - .5) * 14, vy: Math.random() * -14 - 4, r: Math.random() * 6 + 4, c: colors[Math.floor(Math.random() * colors.length)], a: Math.random() * 6, s: (Math.random() - .5) * .3 }))
    let t = 0
    ;(function frame () {
      ctx.clearRect(0, 0, W, H)
      for (const p of ps) { p.vy += .35; p.x += p.vx; p.y += p.vy; p.vx *= .99; p.a += p.s; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c; ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * .6); ctx.restore() }
      if (++t < 220) requestAnimationFrame(frame); else c.remove()
    })()
  }

  const fmtDate = d => d ? new Date(d).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
  const fmtDateTime = d => d ? new Date(d).toLocaleString('en-IE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''
  function ago (d) {
    if (!d) return ''
    const s = (Date.now() - new Date(d)) / 1000
    if (s < 60) return 'just now'
    if (s < 3600) return `${Math.floor(s / 60)} min ago`
    if (s < 86400) return `${Math.floor(s / 3600)} h ago`
    const days = Math.floor(s / 86400)
    return days === 1 ? 'yesterday' : `${days} days ago`
  }
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms) } }
  const initials = s => String(s || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()
  const hue = s => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) % 360; return h }
  const avatar = (name, size) => html`<span class="avatar" style="background:linear-gradient(135deg,hsl(${hue(name)} 75% 55%),hsl(${(hue(name) + 50) % 360} 80% 50%));${size ? `width:${size}px;height:${size}px` : ''}" aria-hidden="true">${initials(name)}</span>`

  function readFile (file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(String(r.result).split(',')[1])
      r.onerror = () => reject(new Error('Could not read the file.'))
      r.readAsDataURL(file)
    })
  }

  function errorBox (e) {
    return html`<div class="banner bad"><span class="i">😕</span><div><div>${e.message}</div>${e.technical ? html`<details class="small"><summary>Technical details</summary><pre class="mono small" style="white-space:pre-wrap">${e.technical}</pre></details>` : ''}</div></div>`
  }

  function theme () {
    try { const t = localStorage.getItem('vob-theme'); if (t) document.documentElement.dataset.theme = t } catch {}
  }
  function toggleTheme () {
    const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    const next = cur === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    try { localStorage.setItem('vob-theme', next) } catch {}
  }
  theme()

  // Line icons (Lucide-style, 24px grid)
  const P = {
    building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    receipt: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    bank: '<path d="M3 22h18M6 18v-7M10 18v-7M14 18v-7M18 18v-7"/><path d="M12 2 20 7H4z"/>',
    clip: '<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    checkCircle: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/>',
    target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    folder: '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/>',
    flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
    sparkles: '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
    euro: '<path d="M4 10h12M4 14h9"/><path d="M19 6a7.7 7.7 0 0 0-5.2-2A7.9 7.9 0 0 0 6 12c0 4.4 3.5 8 7.8 8 2 0 3.8-.8 5.2-2"/>',
    pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
    history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5M12 7v5l4 2"/>',
    file: '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><path d="M14 2v6h6"/>',
    cart: '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
    userCheck: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m16 11 2 2 4-4"/>',
    clipboard: '<rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
    pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    db: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/>',
    zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
    branch: '<path d="M6 3v12"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="m9 12 2 2 4-4"/>',
    mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
    plus: '<path d="M5 12h14M12 5v14"/>',
    arrow: '<path d="M5 12h14M13 5l7 7-7 7"/>',
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
    calc: '<rect width="16" height="20" x="4" y="2" rx="2"/><path d="M8 6h8M16 14v4M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M8 18h.01M12 18h.01"/>',
    alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4M12 17h.01"/>',
    rocket: '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>',
    eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
    lock: '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  }
  const icon = (name, cls = '') => raw(`<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[name] || P.sparkles}</svg>`)

  window.UI = { icon, esc, html, raw, $, $$, api, toast, modal, confetti, fmtDate, fmtDateTime, ago, debounce, initials, avatar, readFile, errorBox, toggleTheme }
})()
