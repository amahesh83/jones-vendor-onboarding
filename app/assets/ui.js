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
  async function api (url, { method = 'GET', body, headers = {} } = {}) {
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
      if (res.status === 403 && /csrf/i.test(res.headers.get('x-csrf-token') || '')) csrf = null
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
    const back = document.createElement('div')
    back.className = 'modal-back'
    back.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">${content}</div>`
    const close = () => { back.remove(); document.removeEventListener('keydown', key); onClose && onClose() }
    const key = e => { if (e.key === 'Escape') close() }
    back.addEventListener('mousedown', e => { if (e.target === back) close() })
    document.addEventListener('keydown', key)
    document.body.appendChild(back)
    back.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close))
    setTimeout(() => back.querySelector('input,select,textarea,button')?.focus(), 30)
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

  window.UI = { esc, html, raw, $, $$, api, toast, modal, confetti, fmtDate, fmtDateTime, ago, debounce, initials, avatar, readFile, errorBox, toggleTheme }
})()
