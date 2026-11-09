/* Vendor portal: link → email code → guided form → submit → status. */
(function () {
  'use strict'
  const { html, raw, $, $$, api, toast, confetti, fmtDate, ago, debounce, readFile, errorBox } = UI
  const V = window.VobValidation
  const app = $('#app')
  const ICONS = { company: '🏢', contacts: '👥', tax: '🧾', bank: '🏦', documents: '📎', review: '✅' }
  const store = {
    get t () { try { return sessionStorage.getItem('vob_t') } catch { return null } },
    set t (v) { try { sessionStorage.setItem('vob_t', v) } catch {} },
    get csrf () { try { return sessionStorage.getItem('vob_csrf') } catch { return null } },
    set csrf (v) { try { sessionStorage.setItem('vob_csrf', v) } catch {} },
  }
  let S = null // vendor view from the server
  let step = 'company'
  let errors = {}
  let warnings = {}
  let bankUnlocked = false

  $('#themeBtn').onclick = UI.toggleTheme

  const call = (url, opts = {}) => api('/api/portal' + url, { ...opts, headers: { 'x-vob-csrf': store.csrf || '' } })

  function setSave (state) {
    const el = $('#saveState')
    if (state === 'saving') { el.className = 'saving'; el.textContent = '⏳ Saving…' } else if (state === 'saved') { el.className = 'saving ok'; el.textContent = '✓ Saved' } else if (state === 'error') { el.className = 'saving'; el.textContent = '⚠️ Not saved' } else el.textContent = ''
  }

  // ---------------------------------------------------------------- boot
  async function boot () {
    const params = new URLSearchParams(location.search)
    if (params.get('t')) { store.t = params.get('t'); history.replaceState(null, '', '/portal/') }
    try {
      S = await call('/me')
      return route()
    } catch (e) {
      if (store.t) return renderStart()
      renderInvalid()
    }
  }

  function ctx () { return { country: S.data.country, accountType: S.accountType.code, subcontractor: S.accountType.subcontractor, notVatRegistered: !!S.data.notVatRegistered } }

  function route () {
    if (!S.status.editable) return renderStatus()
    if (!S.lastSavedAt && S.round === 0 && !sessionStorage.getItem('vob_started')) return renderWelcome()
    if (S.returned && !sessionStorage.getItem('vob_seen_return')) { sessionStorage.setItem('vob_seen_return', '1'); step = S.returned.sections[0] || 'company' }
    renderForm()
  }

  // ---------------------------------------------------------------- link + code
  function renderInvalid (message) {
    app.innerHTML = html`<div class="card pad-lg fade-in" style="text-align:center">
      <div style="font-size:4rem">🔗</div>
      <h1>This link isn't working</h1>
      <p class="muted">${message || 'Links expire, and a new link replaces the old one. Please use the latest email from Jones Engineering, or ask your Jones contact to send you a new link.'}</p>
      <p class="small muted">If you've just been signed out, open the link from your email again.</p>
    </div>`
  }

  function renderStart () {
    app.innerHTML = html`<div class="card pad-lg fade-in" style="text-align:center">
      <div style="font-size:3.6rem">👋</div>
      <h1>Welcome!</h1>
      <p class="muted" style="max-width:480px;margin:0 auto 18px">Jones Engineering has invited you to set up a supplier account. First, let's check it's you: we'll email you a 6-digit code.</p>
      <div id="msg"></div>
      <button class="btn btn-primary btn-lg" id="send">Email me a code ✉️</button>
    </div>`
    $('#send').onclick = sendCode
  }

  async function sendCode () {
    const btn = $('#send') || $('#resend')
    if (btn) btn.disabled = true
    try {
      const out = await call('/start', { method: 'POST', body: { token: store.t } })
      renderOtp(out.maskedEmail, out.minutes)
    } catch (e) {
      if (e.code === 'LINK_INVALID') return renderInvalid(e.message)
      const m = $('#msg'); if (m) m.innerHTML = errorBox(e)
      if (btn) btn.disabled = false
    }
  }

  function renderOtp (masked, minutes) {
    app.innerHTML = html`<div class="card pad-lg fade-in" style="text-align:center">
      <div style="font-size:3.4rem">📬</div>
      <h1>Check your email</h1>
      <p class="muted">We've sent a 6-digit code to <b>${masked}</b>. It works for ${minutes} minutes.</p>
      <form id="otpForm" autocomplete="one-time-code">
        <div class="otp" style="margin:22px 0">${raw([0, 1, 2, 3, 4, 5].map(i => `<input inputmode="numeric" maxlength="6" aria-label="Digit ${i + 1}" data-i="${i}" autocomplete="${i ? 'off' : 'one-time-code'}">`).join(''))}</div>
        <div id="msg"></div>
        <button class="btn btn-primary btn-lg" type="submit" id="verify">Continue →</button>
      </form>
      <p class="small muted" style="margin-top:18px">No email? Check your spam folder, or <button class="linkish" id="resend" type="button">send a new code</button>.</p>
    </div>`
    const boxes = $$('.otp input')
    boxes.forEach((b, i) => {
      b.addEventListener('input', () => {
        const digits = b.value.replace(/\D/g, '')
        if (digits.length > 1) { digits.split('').slice(0, 6 - i).forEach((d, j) => { boxes[i + j].value = d }); boxes[Math.min(i + digits.length, 5)].focus() } else { b.value = digits; if (digits && boxes[i + 1]) boxes[i + 1].focus() }
        if (boxes.every(x => x.value)) $('#otpForm').requestSubmit()
      })
      b.addEventListener('keydown', e => { if (e.key === 'Backspace' && !b.value && boxes[i - 1]) boxes[i - 1].focus() })
      b.addEventListener('paste', e => { const d = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6); if (d.length) { e.preventDefault(); boxes.forEach((x, j) => { x.value = d[j] || '' }); boxes[Math.min(d.length, 5)].focus(); if (d.length === 6) $('#otpForm').requestSubmit() } })
    })
    boxes[0].focus()
    $('#resend').onclick = sendCode
    $('#otpForm').onsubmit = async e => {
      e.preventDefault()
      const code = boxes.map(b => b.value).join('')
      if (code.length < 6) return
      $('#verify').disabled = true
      try {
        const out = await call('/verify', { method: 'POST', body: { token: store.t, code } })
        store.csrf = out.csrf
        S = await call('/me')
        toast('You\'re in! 🎉', 'ok')
        route()
      } catch (err) {
        if (err.code === 'LINK_INVALID') return renderInvalid(err.message)
        $('#msg').innerHTML = errorBox(err)
        boxes.forEach(b => { b.value = '' }); boxes[0].focus()
        $('#verify').disabled = err.code === 'LOCKED'
      }
    }
  }

  // ---------------------------------------------------------------- welcome
  function renderWelcome () {
    const docs = S.documentTypes.filter(d => d.required)
    app.innerHTML = html`<div class="card pad-lg fade-in">
      <div class="row"><div class="icon-bubble" style="width:56px;height:56px;font-size:1.8rem">🚀</div><div><h1 style="margin:0">Hi ${S.contactName || 'there'}!</h1><div class="muted">Reference ${S.reference} · invited by ${S.requesterName}</div></div></div>
      <p style="margin-top:18px">Let's set up <b>${S.companyNameInvited}</b> as a Jones Engineering supplier. It takes about <b>10 minutes</b>, works on your phone, and <b>saves as you go</b>, so you can stop and come back with the same link.</p>
      <div class="banner info" style="margin:16px 0"><span class="i">ℹ️</span><div>Jones set you up as <b>${S.accountType.label}</b>: ${S.accountType.help} <span class="muted small">Doesn't look right? Tell your Jones contact.</span></div></div>
      <h3>Have these ready</h3>
      <div class="grid g2" style="margin:10px 0 22px">
        <div class="list-card"><span style="font-size:1.5rem">🧾</span><div><b>VAT number</b><div class="small muted">and company registration number</div></div></div>
        <div class="list-card"><span style="font-size:1.5rem">🏦</span><div><b>Bank details</b><div class="small muted">IBAN and BIC, plus a contact who can confirm them</div></div></div>
        ${docs.map(d => html`<div class="list-card"><span style="font-size:1.5rem">📄</span><div><b>${d.label}</b><div class="small muted">${d.help}</div></div></div>`)}
      </div>
      <button class="btn btn-primary btn-lg" id="go">Let's go →</button>
    </div>`
    $('#go').onclick = () => { sessionStorage.setItem('vob_started', '1'); renderForm() }
  }

  // ---------------------------------------------------------------- the form
  const SECTION_KEYS = V.SECTIONS.map(s => s.key)

  function sectionState (key) {
    if (S.returned && S.returned.sections.includes(key)) return 'flag'
    if (key === 'documents') return S.documentTypes.filter(d => d.required).every(d => S.documents.some(x => x.docType === d.code)) ? 'done' : ''
    if (key === 'review') return ''
    const errs = V.validateSection(key, S.data, ctx())
    const anyValue = V.fieldsFor(key, ctx()).some(f => S.data[f.key])
    return anyValue && !Object.keys(errs).length ? 'done' : ''
  }

  function renderForm () {
    const idx = SECTION_KEYS.indexOf(step)
    const done = SECTION_KEYS.filter(k => sectionState(k) === 'done').length
    const sec = V.SECTIONS[idx]
    app.innerHTML = html`
      ${S.returned ? html`<div class="banner warn fade-in" style="margin-bottom:16px"><span class="i">✏️</span><div><b>Jones needs a few changes</b><div>${S.returned.message}</div></div></div>` : ''}
      <div class="card fade-in" style="padding:16px 16px 10px;margin-bottom:16px">
        <nav class="stepper" aria-label="Steps">${V.SECTIONS.map((s, i) => html`<button type="button" data-step="${s.key}" class="${s.key === step ? 'on' : ''} ${sectionState(s.key)}" aria-current="${s.key === step ? 'step' : 'false'}"><span class="dot">${sectionState(s.key) === 'done' && s.key !== step ? '✓' : ICONS[s.key]}</span>${s.title}</button>`)}</nav>
        <div class="progress" aria-hidden="true"><i style="width:${Math.round((done / (SECTION_KEYS.length - 1)) * 100)}%"></i></div>
      </div>
      <section class="card pad-lg fade-in" id="sec">
        <div class="section-title"><span class="icon-bubble">${ICONS[step]}</span><div><h2 style="margin:0">${sec.title}</h2><div class="muted small">${sec.blurb}</div></div></div>
        <div id="body"></div>
        <div class="row" style="margin-top:20px">
          ${idx > 0 ? html`<button class="btn btn-line" id="back" type="button">← Back</button>` : ''}
          <span class="spacer"></span>
          ${step !== 'review' ? html`<button class="btn btn-primary" id="next" type="button">Next: ${V.SECTIONS[idx + 1].title} →</button>` : ''}
        </div>
      </section>`
    $$('.stepper button').forEach(b => { b.onclick = () => go(b.dataset.step) })
    if ($('#back')) $('#back').onclick = () => go(SECTION_KEYS[idx - 1])
    if ($('#next')) $('#next').onclick = next
    if (step === 'documents') renderDocuments()
    else if (step === 'review') renderReview()
    else renderFields()
  }

  function go (key) { errors = {}; warnings = {}; step = key; renderForm(); window.scrollTo({ top: 0, behavior: 'smooth' }) }

  async function next () {
    const idx = SECTION_KEYS.indexOf(step)
    if (!['documents', 'review'].includes(step)) {
      await saveNow()
      const errs = V.validateSection(step, S.data, ctx())
      if (Object.keys(errs).length) { errors = errs; renderFields(); toast('Almost! Please check the highlighted fields.', 'bad'); $('.invalid input, .invalid select')?.focus(); return }
    }
    if (step === 'documents') {
      const missing = S.documentTypes.filter(d => d.required && !S.documents.some(x => x.docType === d.code))
      if (missing.length) { toast(`Still needed: ${missing.map(m => m.label).join(', ')}`, 'bad'); return }
    }
    go(SECTION_KEYS[idx + 1])
  }

  function fieldHtml (f, c) {
    const v = S.data[f.key]
    const label = V.labelOf(f, c)
    const req = f.required && f.required(c)
    const err = errors[f.key], warn = warnings[f.key]
    const id = 'f_' + f.key
    const cls = `field ${err ? 'invalid' : (v && !err ? 'valid' : '')}`
    if (f.type === 'checkbox') return html`<div class="field"><label class="check"><input type="checkbox" id="${id}" data-k="${f.key}" ${v ? raw('checked') : ''}> ${label}</label></div>`
    let input
    if (f.type === 'country') {
      input = html`<select id="${id}" data-k="${f.key}" aria-invalid="${!!err}"><option value="">Choose a country…</option>${S.countries.map(x => html`<option value="${x.code}" ${x.code === v ? raw('selected') : ''}>${x.name}</option>`)}</select>`
    } else {
      const type = f.type === 'email' ? 'email' : f.type === 'tel' ? 'tel' : 'text'
      input = html`<input id="${id}" data-k="${f.key}" type="${type}" value="${v || ''}" maxlength="${f.max || 200}" ${f.autocomplete ? raw(`autocomplete="${f.autocomplete}"`) : ''} aria-invalid="${!!err}" aria-describedby="${id}_h" ${f.key === 'iban' || f.key === 'bic' || f.key === 'vatNumber' ? raw('autocapitalize="characters" spellcheck="false"') : ''}>`
    }
    return html`<div class="${cls}" ${f.key === 'country' || f.key === 'companyName' || f.key === 'iban' ? raw('style="grid-column:1/-1"') : ''}>
      <label for="${id}">${label}${req ? html`<span class="req" aria-hidden="true">*</span>` : html` <span class="muted small">(optional)</span>`}</label>
      ${input}
      ${err ? html`<span class="err" role="alert">⚠️ ${err}</span>` : warn ? html`<span class="warnmsg">💡 ${warn}</span>` : f.help ? html`<span class="hint" id="${id}_h">${f.help}</span>` : ''}
    </div>`
  }

  function renderFields () {
    const c = ctx()
    const body = $('#body')
    if (step === 'bank' && S.bankLocked && !bankUnlocked) {
      body.innerHTML = html`<div class="banner ok"><span class="i">🔐</span><div>We already have your bank details: <b class="mono">${S.data.iban || S.data.bankAccountNo}</b> at ${S.data.bankName}. For your security we don't show them in full.</div></div>
        <p style="margin-top:14px">Need to change them? We'll ask for the new details in full and phone you to confirm them again.</p>
        <button class="btn btn-ghost" id="unlock" type="button">Change bank details</button>`
      $('#unlock').onclick = () => { bankUnlocked = true; for (const k of ['iban', 'bic', 'bankName', 'bankAddress', 'bankAccountNo', 'sortCode']) S.data[k] = ''; renderFields() }
      return
    }
    const fields = V.fieldsFor(step, c)
    let extra = ''
    if (step === 'bank' && S.data.iban) {
      const d = V.deriveFromIban(S.data.iban)
      if (d && d.sortCode) extra = html`<div class="derived" style="grid-column:1/-1"><span class="pill">✓ Sort code ${V.formatSortCode(d.sortCode)}</span><span class="pill">✓ Account ${d.accountNo}</span><span class="small muted">filled in from your IBAN</span></div>`
      else if (d) extra = html`<div class="derived" style="grid-column:1/-1"><span class="pill">✓ Valid ${d.country} IBAN</span></div>`
    }
    if (step === 'company' && !S.data.country) {
      body.innerHTML = html`<p class="muted">Let's start with where your company is registered. It decides which questions we ask.</p><div class="form-grid">${fieldHtml(fields[0], c)}</div>`
    } else {
      body.innerHTML = html`<form class="form-grid" novalidate>${fields.map(f => f.key === 'bic' ? html`${extra}${fieldHtml(f, c)}` : fieldHtml(f, c))}</form>`
    }
    $$('#body [data-k]').forEach(el => {
      const handler = () => {
        const k = el.dataset.k
        S.data[k] = el.type === 'checkbox' ? el.checked : el.value
        if (errors[k]) { delete errors[k] }
        if (k === 'country' || k === 'notVatRegistered') { autosave(); return renderFields() }
        autosave()
      }
      el.addEventListener('input', handler)
      el.addEventListener('change', handler)
      el.addEventListener('blur', () => {
        const k = el.dataset.k
        const f = V.FIELDS.find(x => x.key === k)
        const one = V.validateSection(step, S.data, ctx())[k]
        if (one && S.data[k]) { errors[k] = one; refreshField(f) } else if (!one && (errors[k] || k === 'iban')) { delete errors[k]; refreshField(f) }
      })
    })
  }

  function refreshField (f) {
    if (f && f.key === 'iban') return renderFields()
    const el = $(`#f_${f.key}`)
    if (!el) return
    const pos = el.selectionStart
    const wrap = el.closest('.field')
    const tmp = document.createElement('div')
    tmp.innerHTML = String(fieldHtml(f, ctx()))
    const fresh = tmp.firstElementChild
    wrap.replaceWith(fresh)
    const input = $(`#f_${f.key}`)
    input.addEventListener('input', () => { S.data[f.key] = input.value; autosave() })
    input.addEventListener('blur', () => { const m = V.validateSection(step, S.data, ctx())[f.key]; if (m && S.data[f.key]) errors[f.key] = m; else delete errors[f.key]; refreshField(f) })
    if (document.activeElement === document.body && pos !== null) { /* keep focus where the user is */ }
  }

  let saving = Promise.resolve()
  const autosave = debounce(() => { saving = saveNow() }, 700)
  async function saveNow () {
    await saving
    if (['documents', 'review'].includes(step)) return
    if (step === 'bank' && S.bankLocked && !bankUnlocked) return
    const data = {}
    for (const f of V.FIELDS.filter(x => x.section === step)) data[f.key] = S.data[f.key] ?? null
    setSave('saving')
    try {
      const out = await call(`/sections/${step}`, { method: 'PUT', body: { data } })
      if (out.derived) Object.assign(S.data, { sortCode: out.derived.sortCode, bankAccountNo: out.derived.bankAccountNo })
      warnings = out.warnings || {}
      S.lastSavedAt = out.savedAt
      setSave('saved')
      if (Object.keys(warnings).length && step === 'bank') { const f = V.FIELDS.find(x => x.key === 'bic'); if (document.activeElement?.dataset?.k !== 'bic') refreshField(f) }
    } catch (e) {
      setSave('error')
      if (e.status === 401) { toast('Your session ended. Please open the link from your email again.', 'bad'); return renderInvalid('Your session ended after a while without activity. Open the link from your email again. Everything you typed so far is saved.') }
      toast(e.message, 'bad')
    }
  }

  // ---------------------------------------------------------------- documents
  function renderDocuments () {
    const body = $('#body')
    body.innerHTML = html`<p class="muted">Drag a file onto a box, or tap to choose one. PDF, JPG or PNG, up to 10 MB each. Photos of documents are fine if they're clear.</p>
      <div class="stack">${S.documentTypes.map(d => {
        const up = S.documents.find(x => x.docType === d.code)
        return html`<div class="drop ${up ? 'done' : ''}" data-doc="${d.code}">
          <span class="big">${up ? '✅' : '📄'}</span>
          <div style="flex:1;min-width:0">
            <b>${d.label}</b> ${d.required ? html`<span class="pill" style="background:var(--brand-soft);color:var(--brand)">Required</span>` : html`<span class="pill">Optional</span>`}
            <div class="small muted">${up ? html`${up.fileName} · ${Math.round(up.size / 1024)} KB${up.validUntil ? html` · valid until ${fmtDate(up.validUntil)}` : ''}` : d.help}</div>
            ${d.needsValidUntil && !up ? html`<label class="small" style="display:flex;gap:8px;align-items:center;margin-top:8px">Valid until <input type="date" data-valid="${d.code}" style="max-width:180px;padding:7px 10px"></label>` : ''}
          </div>
          ${up ? html`<button class="btn btn-sm btn-line" data-remove="${up.ID}" type="button">Replace</button>` : html`<label class="btn btn-sm btn-ghost" style="cursor:pointer">Choose file<input type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" data-file="${d.code}" class="sr"></label>`}
        </div>`
      })}</div>`
    $$('[data-file]').forEach(inp => { inp.onchange = () => inp.files[0] && upload(inp.dataset.file, inp.files[0]) })
    $$('[data-remove]').forEach(b => { b.onclick = async () => { try { await call(`/documents/${b.dataset.remove}`, { method: 'DELETE' }); S = await call('/me'); renderForm() } catch (e) { toast(e.message, 'bad') } } })
    $$('.drop').forEach(z => {
      z.addEventListener('dragover', e => { e.preventDefault(); z.classList.add('over') })
      z.addEventListener('dragleave', () => z.classList.remove('over'))
      z.addEventListener('drop', e => { e.preventDefault(); z.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) upload(z.dataset.doc, f) })
    })
  }

  async function upload (code, file) {
    const type = S.documentTypes.find(d => d.code === code)
    const validUntil = $(`[data-valid="${code}"]`)?.value
    if (type.needsValidUntil && !validUntil) { toast(`Please enter the date the ${type.label.toLowerCase()} is valid until first.`, 'bad'); $(`[data-valid="${code}"]`)?.focus(); return }
    if (file.size > 10 * 1024 * 1024) { toast('That file is larger than 10 MB. Please upload a smaller copy.', 'bad'); return }
    setSave('saving')
    try {
      const content = await readFile(file)
      await call('/documents', { method: 'POST', body: { docType: code, fileName: file.name, mimeType: file.type, content, validUntil } })
      S = await call('/me')
      setSave('saved')
      toast(`${type.label} uploaded 👍`, 'ok')
      renderForm()
    } catch (e) { setSave('error'); toast(e.message, 'bad') }
  }

  // ---------------------------------------------------------------- review
  function renderReview () {
    const c = ctx()
    const all = V.validateAll(S.data, c)
    const missing = S.documentTypes.filter(d => d.required && !S.documents.some(x => x.docType === d.code))
    const country = S.countries.find(x => x.code === S.data.country)?.name
    const value = (f) => {
      if (f.type === 'checkbox') return S.data[f.key] ? 'Yes' : 'No'
      if (f.key === 'country') return country
      if (f.key === 'iban') return S.bankLocked && !bankUnlocked ? S.data.iban : V.formatIban(S.data.iban)
      return S.data[f.key]
    }
    $('#body').innerHTML = html`
      ${Object.keys(all).length || missing.length ? html`<div class="banner warn" style="margin-bottom:16px"><span class="i">👀</span><div>A few things still need your attention: ${[...new Set(Object.keys(all).map(k => V.FIELDS.find(f => f.key === k).section))].map(s => V.SECTIONS.find(x => x.key === s).title).concat(missing.length ? ['Documents'] : []).join(', ')}.</div></div>` : html`<div class="banner ok" style="margin-bottom:16px"><span class="i">🎯</span><div>Everything looks complete. Have a final look, then submit.</div></div>`}
      <div class="stack">${['company', 'contacts', 'tax', 'bank'].map(s => html`<div class="card flat">
        <div class="row between"><h3 style="margin:0">${ICONS[s]} ${V.SECTIONS.find(x => x.key === s).title}</h3><button class="btn btn-sm btn-ghost" data-edit="${s}" type="button">Edit</button></div>
        <dl class="kv" style="margin-top:10px">${V.fieldsFor(s, c).filter(f => S.data[f.key] || all[f.key]).map(f => html`<dt>${V.labelOf(f, c)}</dt><dd>${value(f) || ''}${all[f.key] ? html`<div class="err small" style="color:var(--bad)">⚠️ ${all[f.key]}</div>` : ''}</dd>`)}
        ${s === 'bank' && S.data.sortCode && !S.bankLocked ? html`<dt>Sort code</dt><dd>${V.formatSortCode(S.data.sortCode)}</dd><dt>Account number</dt><dd>${S.data.bankAccountNo}</dd>` : ''}</dl>
      </div>`)}
      <div class="card flat"><div class="row between"><h3 style="margin:0">📎 Documents</h3><button class="btn btn-sm btn-ghost" data-edit="documents" type="button">Edit</button></div>
        <ul style="margin:10px 0 0;padding-left:20px">${S.documentTypes.filter(d => d.required || S.documents.some(x => x.docType === d.code)).map(d => { const up = S.documents.find(x => x.docType === d.code); return html`<li>${d.label}: ${up ? html`<b>${up.fileName}</b>` : html`<span style="color:var(--bad);font-weight:700">missing</span>`}</li>` })}</ul></div>
      </div>
      <div class="card" style="margin-top:18px;background:var(--brand-soft);border-color:transparent">
        <h3>Declaration</h3>
        <label class="check"><input type="checkbox" id="accept"> I confirm the information above is correct and complete, and I'm authorised to give it on behalf of ${S.data.companyName || 'the company'}.</label>
        <div class="field" style="margin-top:14px"><label for="decl">Your full name</label><input id="decl" autocomplete="name" value="${S.contactName || ''}"></div>
        <div class="small muted">Today's date (${fmtDate(new Date())}) is recorded with your name. This replaces the signature on the paper form.</div>
        <div id="msg" style="margin-top:12px"></div>
        <button class="btn btn-primary btn-lg" id="submit" type="button" style="margin-top:14px" ${Object.keys(all).length || missing.length ? raw('disabled') : ''}>Submit to Jones 🚀</button>
      </div>`
    $$('[data-edit]').forEach(b => { b.onclick = () => go(b.dataset.edit) })
    $('#submit').onclick = submit
  }

  async function submit () {
    const btn = $('#submit')
    btn.disabled = true
    try {
      await call('/submit', { method: 'POST', body: { declarationName: $('#decl').value, accept: $('#accept').checked } })
      S = await call('/me')
      confetti()
      sessionStorage.removeItem('vob_seen_return')
      renderStatus(true)
    } catch (e) {
      btn.disabled = false
      $('#msg').innerHTML = errorBox(e)
      if (e.details?.errors) { errors = e.details.errors }
    }
  }

  // ---------------------------------------------------------------- status
  function renderStatus (justSubmitted) {
    const code = S.status.code
    const created = code === 'CREATED', rejected = code === 'REJECTED', cancelled = code === 'CANCELLED'
    const stages = [
      { k: 'sub', t: 'Submitted', d: S.submittedAt ? fmtDate(S.submittedAt) : '' },
      { k: 'rev', t: 'Under review', d: 'Approvals and a call to confirm your bank details' },
      { k: 'done', t: created ? 'Account ready' : rejected ? 'Not approved' : 'Account ready', d: created ? `Account number ${S.vendorNumber}` : '' },
    ]
    const cur = created || rejected ? 2 : 1
    app.innerHTML = html`<div class="card pad-lg fade-in" style="text-align:center">
      <div style="font-size:4rem">${created ? '🎉' : rejected || cancelled ? '📭' : justSubmitted ? '🚀' : '⏳'}</div>
      <h1>${created ? 'Your account is ready!' : rejected ? 'Update on your application' : cancelled ? 'This request was closed' : justSubmitted ? 'Thank you, that\'s everything!' : 'We\'re reviewing your details'}</h1>
      <p class="muted" style="max-width:520px;margin:0 auto">${created ? 'Please quote your Jones account number on every invoice.' : rejected ? 'We\'re not able to set up an account at this time. If you have questions, please contact the person at Jones who invited you.' : cancelled ? 'Please contact your Jones contact if you think this is a mistake.' : 'Our team will review your details and phone your bank contact to confirm them. We\'ll email you as soon as your account is ready.'}</p>
      ${created ? html`<div class="code-big" style="margin:18px 0">${S.vendorNumber}</div>` : ''}
      <p class="small muted">Reference ${S.reference}</p>
    </div>
    ${!cancelled ? html`<div class="card fade-in" style="margin-top:16px"><div class="track">${stages.map((s, i) => html`<div class="st ${i < cur || (i === cur && created) ? 'done' : i === cur ? 'current' : ''}"><div class="b">${i < cur || (i === 2 && created) ? '✓' : i + 1}</div><div class="l">${s.t}</div><div class="s">${s.d}</div></div>`)}</div></div>` : ''}`
  }

  boot()
})()
