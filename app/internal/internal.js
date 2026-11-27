/* Internal app for Jones staff: dashboard, requests, approvals, admin, test mailbox. */
(function () {
  'use strict'
  const { html, raw, $, $$, api, toast, modal, confetti, fmtDate, fmtDateTime, ago, avatar, errorBox } = UI
  const V = window.VobValidation
  const app = $('#app')
  let ME = null, DEV = false, PERSONAS = [], CFG = null

  const STEP_ICON = { REQUESTER: UI.icon('userCheck'), PURCHASING: UI.icon('cart'), PROCUREMENT: UI.icon('clipboard'), BANK_CHECK: UI.icon('phone'), FINANCE: UI.icon('euro') }
  const I = UI.icon
  const bubble = (name, tone = '') => html`<span class="icon-bubble ${tone}">${I(name)}</span>`
  const EVENT_ICON = { INVITED: '✉️', VENDOR_STARTED: '✍️', VENDOR_SIGNED_IN: '🔑', SUBMITTED: '📨', CHECKS_RUN: '🔎', APPROVED: '✅', SENT_BACK: '↩️', REJECTED: '⛔', BANK_CALLBACK: '📞', SAP_SIMULATED: '🧪', CREATED: '🎉', SAP_ERROR: '🚨', SAP_RETRY: '🔁', ATTACHED: '📎', DOCUMENT_UPLOADED: '📄', EXPIRED: '⌛', CANCELLED: '🗑️', REMINDER: '⏰', ESCALATED: '📣', BANK_DATA_VIEWED: '👁️', FINANCE_DATA: '🧮', DUPLICATE_JUSTIFIED: '📝', INVITE_RESENT: '🔁', DOCUMENT_VIEWED: '👁️', PDF_DOWNLOADED: '🧾' }
  const chip = (tone, label) => html`<span class="chip tone-${tone}">${label}</span>`
  const greet = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening' }
  const has = r => ME.roles.includes(r)
  const errMsg = e => { toast(e.message, 'bad') }

  $('#themeBtn').onclick = UI.toggleTheme

  // ---------------------------------------------------------------- boot & personas
  async function boot () {
    try { PERSONAS = await api('/api/dev/personas'); DEV = true } catch { DEV = false }
    if (DEV) $('#devRibbon').innerHTML = html`<div class="dev-ribbon">🧪 Demo mode: mock SAP, test mailbox, synthetic data. Pick who you are with the switcher (top right).</div>`
    try { ME = await api('/api/internal/me') } catch (e) {
      if (DEV) return pickPersona(true)
      app.innerHTML = html`<div class="narrow" style="padding-top:40px">${errorBox(e)}</div>`
      return
    }
    renderWho()
    $('#inviteBtn').hidden = !has('VOB_Requester')
    $('#inviteBtn').onclick = inviteDialog
    $('#navAdmin').hidden = !has('VOB_MasterDataAdmin')
    $('#navMail').hidden = !DEV
    window.addEventListener('hashchange', router)
    router()
  }

  function renderWho () {
    const p = PERSONAS.find(x => x.id === ME.id)
    $('#who').innerHTML = html`<button class="persona" id="whoBtn" aria-label="Current user: ${ME.name}. Switch demo persona" type="button" aria-haspopup="true">${p ? html`<span class="avatar" style="background:${p.color}">${p.emoji}</span>` : avatar(ME.name)}<span class="hide-sm" style="text-align:left;line-height:1.15"><b style="font-size:.88rem">${ME.name}</b><br><span class="small muted">${ME.roleLabels.join(', ')}</span></span>${DEV ? ' ▾' : ''}</button>`
    if (DEV) $('#whoBtn').onclick = () => pickPersona(false)
  }

  function pickPersona (first) {
    const existing = $('.menu')
    if (existing) return existing.remove()
    const body = html`<div class="small muted" style="padding:6px 8px 8px">${first ? 'Welcome! Who are you today?' : 'Switch person (demo only)'}</div>${PERSONAS.map(p => html`<button data-p="${p.id}" class="${ME && ME.id === p.id ? 'on' : ''}" type="button"><span class="avatar" style="background:${p.color};width:34px;height:34px;border-radius:50%">${p.emoji}</span><span><b>${p.name}</b><br><span class="small muted">${p.title}</span></span></button>`)}`
    if (first) {
      app.innerHTML = html`<section class="hero"><div class="wrap"><h1>Hello! 👋 Who are you today?</h1><p>This is the demo build. Pick a person to see the app through their eyes. Each has different approval rights.</p></div></section>
      <div class="wrap"><div class="grid g3">${PERSONAS.map(p => html`<button class="card choice fade-in" data-p="${p.id}" type="button" style="display:flex;gap:14px;align-items:center"><span class="avatar" style="background:${p.color};width:52px;height:52px;border-radius:18px;font-size:1.5rem">${p.emoji}</span><span><b style="font-size:1.05rem">${p.name}</b><br><span class="muted small">${p.title}</span></span></button>`)}</div></div>`
    } else {
      const m = document.createElement('div'); m.className = 'menu'; m.innerHTML = String(body); $('#who').appendChild(m)
      setTimeout(() => document.addEventListener('click', function close (e) { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('click', close) } }), 0)
    }
    $$('[data-p]').forEach(b => { b.onclick = async () => { await api('/api/dev/login', { method: 'POST', body: { id: b.dataset.p } }); location.hash = '#/'; location.reload() } })
  }

  // ---------------------------------------------------------------- router
  function router () {
    const h = location.hash.replace(/^#/, '') || '/'
    const [path, qs] = h.split('?')
    const q = new URLSearchParams(qs || '')
    const parts = path.split('/').filter(Boolean)
    $$('#nav a').forEach(a => a.classList.toggle('active', a.dataset.nav === (parts[0] || 'home')))
    window.scrollTo(0, 0)
    if (!parts.length) return home()
    if (parts[0] === 'requests' && parts[1]) return detail(parts[1])
    if (parts[0] === 'requests') return requests(q.get('view') || (has('VOB_Auditor') ? 'all' : 'open'), q.get('q') || '')
    if (parts[0] === 'admin') return admin(parts[1] || 'sap-errors')
    if (parts[0] === 'mailbox') return mailbox(parts[1])
    home()
  }

  // ---------------------------------------------------------------- home
  async function home () {
    app.innerHTML = html`<section class="hero"><div class="wrap"><div class="skeleton" style="height:60px;max-width:420px;opacity:.4"></div></div></section>`
    let d
    try { d = await api('/api/internal/dashboard') } catch (e) { app.innerHTML = html`<div class="wrap" style="padding-top:30px">${errorBox(e)}</div>`; return }
    const c = d.counts
    const first = ME.name.split(' ')[0]
    const total = d.pipeline.reduce((s, p) => s + p.count, 0) || 1
    const colors = ['#94a3b8', '#6366f1', '#0ea5e9', '#14b8a6', '#f59e0b', '#10b981', '#ef4444', '#22c55e']
    app.innerHTML = html`
      <section class="hero"><div class="wrap">
        <span class="eyebrow">${I('sparkles')} ${new Date().toLocaleDateString('en-IE', { weekday: 'long', day: 'numeric', month: 'long' })} · ${ME.roleLabels.join(' · ')}</span>
        <h1>${greet()}, ${first}</h1>
        <p style="font-size:1.08rem">${c.waitingForMe ? html`You have <b>${c.waitingForMe}</b> request${c.waitingForMe > 1 ? 's' : ''} waiting for you.` : 'Nothing is waiting for you right now. Nice work!'} ${has('VOB_Requester') ? 'Need a new supplier? Invite them in under a minute.' : ''}</p>
        ${has('VOB_Requester') ? html`<button class="btn btn-lg btn-white" style="margin-top:6px" id="heroInvite">${I('plus')} Invite a vendor</button>` : ''}
      </div></section>
      <div class="wrap fade-in">
        <div class="grid g5">
          <a class="card kpi hot" href="#/requests?view=waiting"><span class="emoji">${I('target')}</span><div class="lbl">Waiting for me</div><div class="num">${c.waitingForMe}</div></a>
          <a class="card kpi" href="#/requests?view=open"><span class="emoji">${I('folder')}</span><div class="lbl">Open requests</div><div class="num">${c.open}</div></a>
          <a class="card kpi" href="#/requests?view=open"><span class="emoji" style="${c.overSla ? 'background:var(--bad-soft);color:var(--bad)' : 'background:var(--ok-soft);color:var(--ok)'}">${I(c.overSla ? 'flame' : 'checkCircle')}</span><div class="lbl">Over SLA</div><div class="num" style="color:${c.overSla ? 'var(--bad)' : 'inherit'}">${c.overSla}</div></a>
          <a class="card kpi" href="#/requests?view=created"><span class="emoji" style="background:var(--ok-soft);color:var(--ok)">${I('sparkles')}</span><div class="lbl">Created this month</div><div class="num">${c.createdThisMonth}</div></a>
          <div class="card kpi"><span class="emoji">${I('clock')}</span><div class="lbl">Avg days to create</div><div class="num">${c.avgDaysToCreate ?? '–'}</div></div>
        </div>
        <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr));margin-top:16px">
          <div class="card">
            <div class="row between"><div class="section-title" style="margin:0">${bubble('target')}<h2 style="margin:0">Waiting for you</h2></div><a href="#/requests?view=waiting" class="small">See all</a></div>
            <div class="stack" style="margin-top:14px">${d.waiting.length ? d.waiting.map(r => rowCard(r)) : html`<div class="empty"><div class="art">🏖️</div>All clear! Nothing needs you right now.</div>`}</div>
            ${d.mine.length ? html`<h3 style="margin-top:22px">🙋 My open requests</h3><div class="stack">${d.mine.map(r => rowCard(r))}</div>` : ''}
          </div>
          <div class="stack">
            <div class="card">
              <div class="section-title">${bubble('branch', 'info')}<h2 style="margin:0">Pipeline</h2></div>
              <div class="bar" style="margin:6px 0 14px">${d.pipeline.map((p, i) => p.count ? html`<i style="width:${(p.count / total) * 100}%;background:${colors[i % colors.length]}" title="${p.label}: ${p.count}"></i>` : '')}</div>
              <div class="pipeline">${d.pipeline.map((p, i) => html`<div class="pipe ${p.count ? 'hot' : ''}"><div class="n" style="color:${p.count ? colors[i % colors.length] : 'inherit'}">${p.count}</div><div class="l">${p.label}</div></div>`)}</div>
            </div>
            <div class="card">
              <div class="section-title">${bubble('zap', 'pink')}<h2 style="margin:0">Latest activity</h2></div>
              <ul class="timeline" style="margin-top:12px">${d.activity.slice(0, 8).map(e => html`<li><span class="dot ${e.actorType === 'VENDOR' ? 'vendor' : ''}"></span><div class="small"><b>${EVENT_ICON[e.event] || '•'} ${e.actorName}</b> <span class="muted">${ago(e.at)}</span></div><div class="small">${e.request_ID ? html`<a href="#/requests/${e.request_ID}">${e.companyName || e.requestNumber}</a>: ` : ''}${e.message}</div></li>`)}</ul>
            </div>
          </div>
        </div>
      </div>`
    if ($('#heroInvite')) $('#heroInvite').onclick = inviteDialog
  }

  function rowCard (r) {
    return html`<a class="list-card" href="#/requests/${r.ID}">${avatar(r.companyName)}<div style="flex:1;min-width:0"><b>${r.companyName}</b><div class="small muted">${r.requestNumber} · ${r.waitingOn ? 'waiting on ' + r.waitingOn : r.statusLabel}${r.workingDaysInStep ? ` · ${r.workingDaysInStep} working day${r.workingDaysInStep > 1 ? 's' : ''}` : ''}</div></div>${r.overSla ? html`<span class="chip tone-error">Over SLA</span>` : ''}${chip(r.tone, r.statusLabel)}</a>`
  }

  // ---------------------------------------------------------------- list
  async function requests (view, q) {
    const views = [['waiting', '🎯 Waiting for me'], ['mine', '🙋 My requests'], ['open', '📂 All open'], ['created', '🎉 Created'], ['closed', '🗄️ Rejected / expired'], ['all', 'Everything']]
    app.innerHTML = html`<div class="wrap" style="padding-top:26px">
      <div class="row between" style="margin-bottom:14px"><h1 style="margin:0">Requests</h1>
        <div class="row"><input id="q" aria-label="Search requests" type="search" placeholder="🔎 Search company, reference, email…" value="${q}" style="width:300px;max-width:70vw"><a class="btn btn-line btn-sm" id="csv" href="/api/internal/requests/export.csv?view=${view}">⬇ Excel (CSV)</a></div></div>
      <div class="seg" style="margin-bottom:16px">${views.map(([k, l]) => html`<button class="${k === view ? 'on' : ''}" data-v="${k}" type="button">${l}</button>`)}</div>
      <div class="card" style="padding:6px 6px 2px" id="tbl"><div class="skeleton" style="height:200px"></div></div></div>`
    $$('[data-v]').forEach(b => { b.onclick = () => { location.hash = `#/requests?view=${b.dataset.v}${$('#q').value ? '&q=' + encodeURIComponent($('#q').value) : ''}` } })
    $('#q').addEventListener('input', UI.debounce(() => load(), 250))
    async function load () {
      const term = $('#q').value
      let rows
      try { rows = await api(`/api/internal/requests?view=${view}&q=${encodeURIComponent(term)}`) } catch (e) { $('#tbl').innerHTML = errorBox(e); return }
      $('#csv').href = `/api/internal/requests/export.csv?view=${view}&q=${encodeURIComponent(term)}`
      if (!rows.length) { $('#tbl').innerHTML = html`<div class="empty"><div class="art">${view === 'waiting' ? '🏖️' : '🔍'}</div>${view === 'waiting' ? 'Nothing is waiting for you. Enjoy the calm!' : 'No requests match.'}</div>`; return }
      $('#tbl').innerHTML = html`<div class="table-wrap"><table class="table"><thead><tr><th>Vendor</th><th>Status</th><th class="hide-sm">Waiting on</th><th class="hide-sm">In step</th><th class="hide-sm">Requester</th><th class="hide-sm">Type</th><th>SAP no.</th></tr></thead><tbody>
        ${rows.map(r => html`<tr data-id="${r.ID}" tabindex="0"><td><div class="row" style="flex-wrap:nowrap">${avatar(r.companyName, 34)}<div><b>${r.companyName}</b><div class="small muted">${r.requestNumber} · ${r.daysOpen} days open</div></div></div></td>
          <td>${chip(r.tone, r.statusLabel)} ${r.canAct ? html`<span class="pill" style="background:var(--brand-soft);color:var(--brand)">Your turn</span>` : ''} ${r.duplicateBlocking ? html`<span class="pill" style="background:var(--warn-soft);color:var(--warn)">Duplicate?</span>` : ''}</td>
          <td class="hide-sm">${r.waitingOn}</td><td class="hide-sm">${r.stepSince && r.open ? html`<span style="color:${r.overSla ? 'var(--bad)' : 'inherit'};font-weight:${r.overSla ? 800 : 500}">${r.workingDaysInStep} d${r.overSla ? ' 🔥' : ''}</span>` : '–'}</td>
          <td class="hide-sm">${r.requesterName}</td><td class="hide-sm"><span class="pill">${r.accountType}</span></td><td class="mono">${r.sapVendorNumber || ''}</td></tr>`)}
      </tbody></table></div>`
      $$('tr[data-id]').forEach(tr => { tr.onclick = () => { location.hash = `#/requests/${tr.dataset.id}` }; tr.onkeydown = e => { if (e.key === 'Enter') tr.click() } })
    }
    load()
  }

  // ---------------------------------------------------------------- detail
  async function detail (id, opts = {}) {
    if (!opts.keep) app.innerHTML = html`<div class="wrap" style="padding-top:26px"><div class="skeleton" style="height:180px"></div></div>`
    let d
    try { d = await api(`/api/internal/requests/${id}${opts.reveal ? '?reveal=bank' : ''}`) } catch (e) { app.innerHTML = html`<div class="wrap" style="padding-top:30px">${errorBox(e)}</div>`; return }
    if (!CFG) CFG = d.options
    const r = d.request, a = d.allowed, data = d.data
    const changed = new Set(d.changes.map(c => c.key))
    const ctx = { country: data.country, accountType: r.accountType, subcontractor: r.subcontractor, notVatRegistered: data.notVatRegistered }
    const kv = (label, v, key) => v || v === 0 ? html`<dt>${label}</dt><dd class="${key && changed.has(key) ? 'changed' : ''}">${v}${key && changed.has(key) ? html` <span class="small" title="Changed since the last review">✏️</span>` : ''}</dd>` : ''
    const section = s => V.fieldsFor(s, ctx).filter(f => f.type !== 'checkbox').map(f => kv(V.labelOf(f, ctx), f.key === 'country' ? r.countryName : f.key === 'iban' && d.bankRevealed ? V.formatIban(data.iban) : data[f.key], f.key))
    const dup = d.duplicates
    const sapMatches = dup?.sap?.matches || [], openMatches = dup?.open || []
    const sim = d.simulation, sapErr = r.status === 'SAP_ERROR' ? d.sap : null
    const lastBank = d.bankChecks.find(b => b.round === r.round)

    app.innerHTML = html`
      <section class="hero" style="padding-bottom:70px"><div class="wrap">
        <a href="#/requests" style="color:rgba(255,255,255,.85);text-decoration:none" class="small">← All requests</a>
        <div class="row" style="margin-top:10px;align-items:flex-start">
          <div style="flex:1;min-width:260px">
            <h1 style="margin-bottom:6px">${r.status === 'CREATED' ? '🎉 ' : ''}${data.companyName || 'New vendor'}</h1>
            <div class="row" style="gap:8px">${chip(r.statusInfo.tone, r.statusInfo.label)}<span class="pill" style="background:rgba(255,255,255,.2);color:#fff">${r.requestNumber}</span><span class="pill" style="background:rgba(255,255,255,.2);color:#fff">${r.accountTypeLabel} · ${r.accountType}</span><span class="pill" style="background:rgba(255,255,255,.2);color:#fff">${r.paymentTermsLabel} · ${r.currency}</span></div>
          </div>
          <div class="row" style="gap:18px;color:#fff">
            ${r.sapVendorNumber ? html`<div style="text-align:center"><div class="small" style="opacity:.8">SAP vendor</div><div style="font-size:2rem;font-weight:850" class="mono">${r.sapVendorNumber}</div></div>` : ''}
            <div style="text-align:center"><div class="small" style="opacity:.8">Days open</div><div style="font-size:2rem;font-weight:850">${r.daysOpen}</div></div>
            ${r.waitingOn ? html`<div style="text-align:center"><div class="small" style="opacity:.8">Waiting on</div><div style="font-size:1.05rem;font-weight:800">${r.waitingOn}</div><div class="small" style="opacity:.8">${r.workingDaysInStep} working day(s)</div></div>` : ''}
          </div>
        </div>
      </div></section>
      <div class="wrap fade-in" style="padding-bottom:30px">
        <div class="card" style="margin-bottom:16px"><div class="track" tabindex="0" role="region" aria-label="Onboarding progress">
          <div class="st ${r.round > 0 ? 'done' : ['INVITED', 'IN_PROGRESS', 'RETURNED'].includes(r.status) ? 'current' : ''}"><div class="b">${r.round > 0 && r.status !== 'RETURNED' ? '✓' : '✍️'}</div><div class="l">Vendor</div><div class="s">${r.submittedAt ? 'Submitted ' + fmtDate(r.submittedAt) : r.status === 'INVITED' ? 'Invited' : r.status === 'RETURNED' ? 'Making changes' : 'Filling in'}</div></div>
          ${d.steps.map(s => html`<div class="st ${s.state}"><div class="b">${s.state === 'done' ? '✓' : STEP_ICON[s.code]}</div><div class="l">${s.short}</div><div class="s">${s.by ? html`${s.by}<br>${fmtDate(s.at)}` : s.state === 'current' ? 'Now' : ''}</div></div>`)}
          <div class="st ${r.status === 'CREATED' ? 'done' : ['CREATING', 'SAP_ERROR'].includes(r.status) ? 'current' : ''}"><div class="b">${r.status === 'CREATED' ? '✓' : r.status === 'SAP_ERROR' ? '🚨' : '⚙️'}</div><div class="l">SAP</div><div class="s">${r.sapVendorNumber || (r.status === 'SAP_ERROR' ? 'Error' : r.status === 'CREATING' ? 'Creating…' : '')}</div></div>
        </div></div>

        <div class="stack" id="banners">
          <div class="card flat"><b>Route: ${d.route.summary}</b><div class="small muted">${d.route.name} · ${d.route.bankCheckMode === 'IN_FINANCE' ? 'Bank call-back inside Finance' : 'Separate bank verification'}. ${d.route.saved ? 'Saved at submission; configuration changes do not alter this request.' : 'Preview only; the matching route is saved when the vendor submits.'}</div></div>
          <div class="next-step"><b>What happens next</b><p>${d.nextAction}</p><a href="/how-it-works.html?request=${id}">See this route and usual times →</a></div>
          ${r.status === 'CREATING' ? html`<div class="banner info"><span class="i">⚙️</span><div>Creating the vendor in SAP… this page refreshes by itself.</div></div>` : ''}
          ${sapErr ? html`<div class="banner bad"><span class="i">🚨</span><div><b>SAP could not create this vendor.</b> ${sapErr.plain}<details class="small"><summary>Technical details</summary><pre class="mono small" style="white-space:pre-wrap">${JSON.stringify(sapErr.messages, null, 2)}</pre></details></div></div>` : ''}
          ${a.why && r.currentStep ? html`<div class="banner info"><span class="i">🔒</span><div>${a.why}</div></div>` : ''}
          ${sapMatches.length ? html`<div class="banner ${r.duplicateBlocking && !r.duplicateJustification ? 'bad' : 'warn'}"><span class="i">👯</span><div><b>Possible duplicate in SAP:</b> ${sapMatches.map(m => `${m.name} (${m.vendorNumber}, ${m.city}) matched on ${m.matchedOn.join(' + ')}`).join('; ')}.${r.duplicateJustification ? html`<div class="small">Justified: “${r.duplicateJustification}”</div>` : r.duplicateBlocking ? ' Final approval is blocked until someone records why a new vendor is needed, or the request is cancelled so the existing vendor can be extended instead.' : ''}</div></div>` : ''}
          ${openMatches.length ? html`<div class="banner warn"><span class="i">🔁</span><div><b>Similar open request:</b> ${raw(openMatches.map(m => `<a href="#/requests/${UI.esc(m.ID)}">${UI.esc(m.companyName)} (${UI.esc(m.requestNumber)})</a> on ${UI.esc(m.matchedOn.join(' + '))}`).join('; '))}</div></div>` : ''}
          ${dup && dup.sap && !dup.sap.ran ? html`<div class="banner warn"><span class="i">⚠️</span><div>${dup.sap.error}</div></div>` : ''}
          ${d.missingDocuments.length ? html`<div class="banner warn"><span class="i">📎</span><div>Documents ${d.missingDocuments.map(m => `${m.label} (${m.problem})`).join(', ')}.</div></div>` : ''}
          ${d.changes.length ? html`<div class="banner ${d.bankChanged ? 'bad' : 'warn'}"><span class="i">✏️</span><div><b>Changed since the last submission:</b> ${d.changes.map(c => c.label).join(', ')}.${d.bankChanged ? ' Bank details changed, so a new call-back is required.' : ''}</div></div>` : ''}
          ${r.status === 'RETURNED' ? html`<div class="banner warn"><span class="i">↩️</span><div><b>Sent back to the vendor:</b> ${r.returnMessage}</div></div>` : ''}
          ${r.status === 'REJECTED' ? html`<div class="banner bad"><span class="i">⛔</span><div><b>Rejected:</b> ${r.rejectReason}</div></div>` : ''}
        </div>

        <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr));margin-top:16px;align-items:start">
          <div class="stack">
            ${a.bankCheck ? bankPanel(d, lastBank) : ''}
            ${a.finance || a.simulate ? financePanel(d, sim) : ''}
            ${a.justify ? html`<div class="card" style="border:2px solid var(--warn)"><h3>📝 Why is a new vendor needed?</h3><p class="small muted">An active SAP vendor has the same VAT number or IBAN. Explain why this isn't a duplicate (for example, a separate legal entity).</p><textarea id="justText" aria-label="Why a new vendor is needed" placeholder="e.g. Different legal entity: the SAP vendor is the UK sister company"></textarea><button class="btn btn-warn" id="justBtn" style="margin-top:10px">Record justification</button></div>` : ''}
            ${a.requesterEdit ? html`<div class="card" style="border:2px solid var(--brand)"><h3>🙋 Your review</h3><p class="small muted">Confirm the account type, payment terms and currency the vendor will get. You can change them here before approving.</p>
              <div class="form-grid"><div class="field"><label for="rvType">Account type</label><select id="rvType">${d.options.accountTypes.map(o => html`<option value="${o.code}" ${o.code === r.accountType ? raw('selected') : ''}>${o.label} (${o.code})</option>`)}</select></div>
              <div class="field"><label for="rvTerms">Payment terms</label><select id="rvTerms">${d.options.paymentTerms.map(o => html`<option value="${o.code}" ${o.code === r.paymentTerms ? raw('selected') : ''}>${o.label}</option>`)}</select></div>
              <div class="field"><label for="rvCur">Currency</label><select id="rvCur">${d.options.currencies.map(o => html`<option value="${o.code}" ${o.code === r.currency ? raw('selected') : ''}>${o.code} · ${o.name}</option>`)}</select></div></div></div>` : ''}

            <div class="card"><div class="section-title">${bubble('building')}<h3 style="margin:0">Company</h3></div><dl class="kv">${section('company')}</dl></div>
            <div class="card"><div class="section-title">${bubble('users', 'info')}<h3 style="margin:0">Contacts</h3></div><dl class="kv">${section('contacts')}</dl></div>
            <div class="card"><div class="section-title">${bubble('receipt', 'pink')}<h3 style="margin:0">Tax</h3></div><dl class="kv">${data.notVatRegistered ? kv('VAT', 'Not VAT registered') : ''}${section('tax')}</dl></div>
            <div class="card"><div class="row between"><div class="section-title" style="margin:0">${bubble('bank', 'ok')}<h3 style="margin:0">Bank</h3></div>${a.revealBank ? html`<button class="btn btn-sm btn-ghost" id="reveal">${I('eye')} Show full details</button>` : d.bankRevealed ? html`<span class="pill" style="background:var(--warn-soft);color:var(--warn)">Full view logged</span>` : ''}</div>
              <dl class="kv" style="margin-top:12px">${section('bank')}${data.sortCode && V.isIbanCountry(data.country) ? kv('Sort code', V.formatSortCode(data.sortCode)) : ''}${data.bankAccountNo && V.isIbanCountry(data.country) ? kv('Account number', data.bankAccountNo) : ''}</dl></div>
          </div>
          <div class="stack">
            <div class="card"><div class="section-title">${bubble('pin')}<h3 style="margin:0">Request</h3></div><dl class="kv">
              ${kv('Requested by', r.requesterName)}${kv('Why', r.businessReason)}${kv('Vendor contact', html`${r.vendorContactName}<br><span class="small muted">${r.vendorEmail}</span>`)}${kv('Company code', r.companyCode)}${kv('Created', fmtDateTime(r.createdAt))}${kv('Invite expires', ['INVITED', 'IN_PROGRESS', 'RETURNED'].includes(r.status) ? fmtDate(r.inviteExpiresAt) : '')}${kv('Declaration', r.declarationName ? `${r.declarationName}, ${fmtDate(r.declarationAt)}` : '')}
            </dl>
            <div class="row" style="margin-top:14px">
              ${a.pdf ? html`<a class="btn btn-ghost btn-sm" href="/api/internal/requests/${r.ID}/fin010.pdf" target="_blank" rel="noopener">🧾 FIN-010 PDF</a>` : ''}
              ${a.resend ? html`<button class="btn btn-line btn-sm" id="resend">🔁 Resend invite</button>` : ''}
              ${a.changeEmail ? html`<button class="btn btn-line btn-sm" id="chEmail">✉️ Change email</button>` : ''}
              ${a.cancel ? html`<button class="btn btn-bad btn-sm" id="cancel">Cancel request</button>` : ''}
            </div></div>
            <div class="card"><div class="section-title">${bubble('clip', 'info')}<h3 style="margin:0">Documents</h3></div>
              ${d.documents.length ? html`<div class="stack">${d.documents.map(doc => html`<div class="list-card" style="padding:10px"><span style="font-size:1.4rem">${doc.mimeType === 'application/pdf' ? '📄' : '🖼️'}</span><div style="flex:1;min-width:0"><b class="small">${doc.docType.replace(/_/g, ' ')}</b><div class="small muted" style="overflow:hidden;text-overflow:ellipsis">${doc.fileName}${doc.validUntil ? ` · valid until ${fmtDate(doc.validUntil)}` : ''}</div></div>${doc.scanStatus === 'CLEAN' && (doc.docType !== 'BANK_LETTER' || d.canSeeBank) ? html`<a class="btn btn-sm btn-ghost" target="_blank" rel="noopener" href="/api/internal/requests/${r.ID}/documents/${doc.ID}">Open</a>` : doc.docType === 'BANK_LETTER' && !d.canSeeBank ? html`<span class="small muted">Bank role only</span>` : chip('warning', doc.scanStatus)}</div>`)}</div>` : html`<div class="muted small">No documents yet.</div>`}
            </div>
            ${d.bankChecks.length ? html`<div class="card"><div class="section-title"><span class="icon-bubble">📞</span><h3 style="margin:0">Bank call-backs</h3></div>${d.bankChecks.map(b => html`<div class="small" style="margin-bottom:10px">${chip(b.outcome === 'CONFIRMED' ? 'success' : 'error', b.outcome === 'CONFIRMED' ? 'Confirmed' : 'Not confirmed')} <b>${b.userName}</b>${d.bankRevealed ? html` called ${b.numberCalled} (${b.numberSource.replace(/_/g, ' ').toLowerCase()}) and spoke to ${b.personSpokenTo}${b.notes ? html`<div class="muted">${b.notes}</div>` : ''}` : ' · callback evidence is restricted to bank-authorised roles'}, ${fmtDateTime(b.calledAt)}${b.round !== r.round ? ' · earlier round' : ''}</div>`)}</div>` : ''}
            <div class="card"><div class="section-title">${bubble('history')}<h3 style="margin:0">Timeline</h3></div>
              <ul class="timeline">${d.events.map(e => html`<li><span class="dot ${/CREATED|APPROVED|CONFIRM/.test(e.event) ? 'ok' : /ERROR|REJECT|BLOCK|LOCK/.test(e.event) ? 'bad' : /SENT_BACK|EXPIRED|REMINDER|ESCALAT/.test(e.event) ? 'warn' : e.actorType === 'VENDOR' ? 'vendor' : ''}"></span><div class="small"><b>${EVENT_ICON[e.event] || '•'} ${e.actorName}</b> <span class="muted">${fmtDateTime(e.at)}</span></div><div class="small">${e.message}</div></li>`)}</ul>
            </div>
          </div>
        </div>
        ${a.approve || a.approveBlocker || a.sendBack || a.retry ? html`<div class="sticky-actions"><div class="row">
          <span class="small muted hide-sm">${r.currentStep ? html`Your step: <b>${r.currentStep.label}</b>` : r.status === 'SAP_ERROR' ? 'Fix and retry, or reject.' : ''}</span><span class="spacer"></span>
          ${a.reject ? html`<button class="btn btn-bad" id="reject">Reject</button>` : ''}
          ${a.adminReject ? html`<button class="btn btn-bad" id="adminReject">Reject</button>` : ''}
          ${a.sendBack ? html`<button class="btn btn-warn" id="sendBack">↩️ Send back to vendor</button>` : ''}
          ${a.retry ? html`<button class="btn btn-primary" id="retry">🔁 Retry in SAP</button>` : ''}
          ${a.approve || a.approveBlocker ? html`<button class="btn btn-ok btn-lg" id="approve" ${a.approve ? '' : raw('disabled')} title="${a.approveBlocker || ''}">✓ Approve${r.currentStep?.code === 'FINANCE' ? ' & create in SAP' : ''}</button>` : ''}
        </div>${a.approveBlocker ? html`<div class="small" style="text-align:right;color:var(--warn);font-weight:600;margin-top:6px">${a.approveBlocker}</div>` : ''}</div>` : ''}
      </div>`

    const reload = (o = {}) => detail(id, { keep: true, ...o })
    const post = async (path, body, msg) => { try { const out = await api(`/api/internal/requests/${id}/${path}`, { method: 'POST', body }); if (msg) toast(msg, 'ok'); return out } catch (e) { errMsg(e); throw e } }
    if ($('#reveal')) $('#reveal').onclick = () => reload({ reveal: true })
    if ($('#resend')) $('#resend').onclick = async () => { const out = await post('resend-invite', {}, 'New link sent ✉️'); if (out.devLink) devLinkModal(out.devLink); reload() }
    if ($('#chEmail')) $('#chEmail').onclick = () => promptModal('✉️ Change vendor email', 'New email address', 'email', async v => { await post('change-email', { email: v }, 'Email changed and new link sent'); reload() })
    if ($('#cancel')) $('#cancel').onclick = () => promptModal('Cancel this request?', 'Reason (optional)', 'textarea', async v => { await post('cancel', { reason: v }, 'Request cancelled'); reload() }, true)
    if ($('#justBtn')) $('#justBtn').onclick = async () => { await post('duplicate-justification', { text: $('#justText').value }, 'Justification recorded'); reload() }
    if ($('#reject')) $('#reject').onclick = () => promptModal('⛔ Reject this request', 'Reason (the requester sees this; the vendor gets a neutral email)', 'textarea', async v => { await post('reject', { reason: v }, 'Request rejected'); reload() })
    if ($('#adminReject')) $('#adminReject').onclick = () => promptModal('⛔ Reject after SAP error', 'Reason', 'textarea', async v => { await post('admin-reject', { reason: v }, 'Request rejected'); reload() })
    if ($('#sendBack')) $('#sendBack').onclick = () => sendBackModal(id, reload)
    if ($('#approve')) $('#approve').onclick = async () => {
      const body = a.requesterEdit ? { accountType: $('#rvType').value, paymentTerms: $('#rvTerms').value, currency: $('#rvCur').value } : {}
      $('#approve').disabled = true
      try { const out = await post('approve', body); confetti(out.status === 'CREATING' ? 200 : 70); toast(out.status === 'CREATING' ? 'Approved! Creating the vendor in SAP… 🚀' : 'Approved ✓ Passed to the next step.', 'ok'); reload() } catch { $('#approve').disabled = false }
    }
    if ($('#retry')) $('#retry').onclick = async () => { await post('retry', { createMissingBank: $('#fCreateBank') ? $('#fCreateBank').checked : undefined }, 'Retrying in SAP…'); reload() }
    wireBank(id, reload)
    wireFinance(id, reload)
    if (r.status === 'CREATING') setTimeout(() => { if (location.hash.includes(id)) reload().then(() => { if ($('.chip.tone-success')) confetti() }) }, 1500)
  }

  function bankPanel (d, last) {
    const data = d.data
    const o = d.options
    return html`<div class="card" style="border:2px solid var(--warn)">
      <div class="section-title">${bubble('phone', 'warn')}<div><h3 style="margin:0">Bank details call-back</h3><div class="small muted">Phone the vendor to confirm the bank details before anyone can pay them.</div></div></div>
      <div class="banner info small" style="margin-bottom:12px"><span class="i">💡</span><div>Use an <b>independent</b> number where possible (from the bank, the vendor's website or an existing record), not only the number on the form. The vendor gave: <b>${o.vendorContact}</b>, ${o.vendorPhone}.</div></div>
      ${last ? html`<div class="banner ${last.outcome === 'CONFIRMED' ? 'ok' : 'bad'} small" style="margin-bottom:12px"><span class="i">${last.outcome === 'CONFIRMED' ? '✅' : '❌'}</span><div>Last call: ${last.outcome === 'CONFIRMED' ? 'confirmed' : 'not confirmed'} by ${last.userName}. ${last.outcome === 'CONFIRMED' ? 'Check the remaining approval requirements below.' : ''}</div></div>` : ''}
      <div class="small" style="margin-bottom:10px">Checking: <b class="mono">${d.bankRevealed ? V.formatIban(data.iban) : data.iban || data.bankAccountNo}</b> · BIC ${data.bic} · ${data.bankName}${!d.bankRevealed ? html` · <button class="linkish" id="reveal2">show full IBAN</button>` : ''}</div>
      <div class="form-grid">
        <div class="field"><label for="bNum">Number called</label><input id="bNum" type="tel" placeholder="+353 1 …"></div>
        <div class="field"><label for="bSrc">Where did the number come from?</label><select id="bSrc"><option value="INDEPENDENT_BANK">The bank (independent)</option><option value="INDEPENDENT_WEBSITE">Vendor website (independent)</option><option value="EXISTING_RECORD">Existing record (independent)</option><option value="VENDOR_PROVIDED">The form (vendor-provided)</option></select></div>
        <div class="field"><label for="bWho">Who did you speak to?</label><input id="bWho" value="${o.vendorContact || ''}"></div>
        <div class="field"><label for="bAt">When</label><input id="bAt" type="datetime-local" value="${new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}"></div>
      </div>
      <div class="field"><label>Outcome</label><div class="choices"><button class="choice" type="button" data-out="CONFIRMED"><span class="t">✅ Confirmed</span><span class="d">Account name and IBAN match</span></button><button class="choice" type="button" data-out="NOT_CONFIRMED"><span class="t">❌ Not confirmed</span><span class="d">Something didn't match</span></button></div></div>
      <div class="field"><label for="bNotes">Notes</label><textarea id="bNotes" placeholder="What was confirmed?"></textarea></div>
      <button class="btn btn-primary" id="bSave">Record call-back</button>
      ${DEV ? html`<button class="btn btn-line" id="fillCallback" type="button">✨ Fill for me</button>` : ''}
    </div>`
  }

  function wireBank (id, reload) {
    if (!$('#bSave')) return
    let outcome = null
    if ($('#fillCallback')) $('#fillCallback').onclick = async () => {
      try {
        const sample = await api('/api/dev/example')
        $('#bNum').value = sample.callback.numberCalled; $('#bSrc').value = sample.callback.numberSource
        $('#bWho').value = sample.callback.personSpokenTo; $('#bNotes').value = sample.callback.notes
        $('[data-out="CONFIRMED"]').click()
      } catch (e) { errMsg(e) }
    }
    if ($('#reveal2')) $('#reveal2').onclick = () => reload({ reveal: true })
    $$('[data-out]').forEach(b => { b.onclick = () => { outcome = b.dataset.out; $$('[data-out]').forEach(x => x.classList.toggle('on', x === b)) } })
    $('#bSave').onclick = async () => {
      try {
        await api(`/api/internal/requests/${id}/bank-verification`, { method: 'POST', body: { numberCalled: $('#bNum').value, numberSource: $('#bSrc').value, personSpokenTo: $('#bWho').value, calledAt: new Date($('#bAt').value).toISOString(), outcome, notes: $('#bNotes').value } })
        toast(outcome === 'CONFIRMED' ? 'Call-back recorded ✅ Review the remaining approval checks.' : 'Call-back recorded. Consider sending it back to the vendor.', 'ok')
        reload()
      } catch (e) { errMsg(e) }
    }
  }

  function financePanel (d, sim) {
    const f = d.finance, r = d.request
    const wht = d.options.whtCodes.filter(w => !f.whtType || w.whtType === f.whtType)
    return html`<div class="card" style="border:2px solid var(--ok)">
      <div class="section-title">${bubble('calc', 'ok')}<div><h3 style="margin:0">Finance data & SAP check</h3><div class="small muted">Defaults come from configuration. Change them if needed, then run the SAP simulation.</div></div></div>
      <div class="form-grid">
        <div class="field"><label for="fRecon">Reconciliation account</label><input id="fRecon" value="${f.reconAccount}" inputmode="numeric"></div>
        <div class="field"><label for="fPm">Payment methods</label><input id="fPm" value="${f.paymentMethods}"></div>
        <div class="field"><label for="fPorg">Purchasing org</label><input id="fPorg" value="${f.purchasingOrg}"></div>
        <div class="field"><label for="fWht">Withholding tax (RCT / CIS)</label><select id="fWht"><option value="">None</option>${wht.map(w => html`<option value="${w.whtType}|${w.code}" ${w.code === f.whtCode ? raw('selected') : ''}>${w.label}</option>`)}</select></div>
      </div>
      <label class="check small"><input type="checkbox" id="fGr" ${f.grBasedIv ? raw('checked') : ''}> GR-based invoice verification</label>
      <label class="check small" style="margin-top:8px"><input type="checkbox" id="fCreateBank" ${f.createMissingBank ? raw('checked') : ''}> Create the bank in SAP if it doesn't exist yet</label>
      <div class="row" style="margin-top:14px"><button class="btn btn-line" id="fSave">Save</button><button class="btn btn-primary" id="fSim">🧪 Simulate in SAP</button></div>
      ${sim ? html`<div class="banner ${sim.ok ? 'ok' : 'bad'}" style="margin-top:14px"><span class="i">${sim.ok ? '✅' : '❌'}</span><div><b>${sim.ok ? 'Simulation passed' : 'Simulation failed'}</b> <span class="small muted">${fmtDateTime(sim.at)}</span><div>${sim.plain}</div>${r.status === 'PENDING_FINANCE' && !d.allowed.approve && sim.ok && d.allowed.approveBlocker ? '' : ''}<details class="small"><summary>SAP messages</summary><ul>${sim.messages.map(m => html`<li><b>${m.type}</b> ${m.text}</li>`)}</ul></details></div></div>` : ''}
    </div>`
  }

  function wireFinance (id, reload) {
    if (!$('#fSim')) return
    const body = () => { const [whtType, whtCode] = ($('#fWht').value || '|').split('|'); return { reconAccount: $('#fRecon').value, paymentMethods: $('#fPm').value, purchasingOrg: $('#fPorg').value, whtType: whtType || null, whtCode: whtCode || null, grBasedIv: $('#fGr').checked, createMissingBank: $('#fCreateBank').checked } }
    $('#fSave').onclick = async () => { try { await api(`/api/internal/requests/${id}/finance`, { method: 'POST', body: body() }); toast('Saved. Run the simulation again.', 'ok'); reload() } catch (e) { errMsg(e) } }
    $('#fSim').onclick = async () => {
      $('#fSim').disabled = true; $('#fSim').textContent = '⏳ Asking SAP…'
      try { await api(`/api/internal/requests/${id}/finance`, { method: 'POST', body: body() }); const out = await api(`/api/internal/requests/${id}/simulate`, { method: 'POST', body: {} }); toast(out.ok ? 'SAP is happy ✅' : 'SAP found a problem', out.ok ? 'ok' : 'bad'); reload() } catch (e) { errMsg(e); $('#fSim').disabled = false }
    }
  }

  function promptModal (title, label, type, onOk, danger) {
    const m = modal(html`<h2>${title}</h2><div class="field"><label for="pm">${label}</label>${type === 'textarea' ? html`<textarea id="pm"></textarea>` : html`<input id="pm" type="${type}">`}</div><div id="pmErr"></div><div class="row"><span class="spacer"></span><button class="btn btn-line" data-close>Back</button><button class="btn ${danger ? 'btn-bad' : 'btn-primary'}" id="pmOk">Confirm</button></div>`)
    $('#pmOk', m.el).onclick = async () => { try { await onOk($('#pm', m.el).value); m.close() } catch (e) { $('#pmErr', m.el).innerHTML = errorBox(e) } }
  }

  function sendBackModal (id, reload) {
    const secs = [['company', '🏢 Company'], ['contacts', '👥 Contacts'], ['tax', '🧾 Tax'], ['bank', '🏦 Bank'], ['documents', '📎 Documents']]
    const m = modal(html`<h2>↩️ Send back to the vendor</h2><p class="muted small">The vendor gets an email with your message and a fresh link. All approval steps are collected again after they resubmit.</p>
      <div class="field"><label>Which parts need changes?</label><div class="choices">${secs.map(([k, l]) => html`<button class="choice" type="button" data-sec="${k}"><span class="t">${l}</span></button>`)}</div></div>
      <div class="field"><label for="sbMsg">Message to the vendor</label><textarea id="sbMsg" placeholder="Be specific and friendly, e.g. 'Please upload a bank letter on your bank's headed paper.'"></textarea></div><div id="sbErr"></div>
      <div class="row"><span class="spacer"></span><button class="btn btn-line" data-close>Back</button><button class="btn btn-warn" id="sbOk">Send back</button></div>`)
    $$('[data-sec]', m.el).forEach(b => { b.onclick = () => b.classList.toggle('on') })
    $('#sbOk', m.el).onclick = async () => {
      try { await api(`/api/internal/requests/${id}/send-back`, { method: 'POST', body: { message: $('#sbMsg', m.el).value, sections: $$('[data-sec].on', m.el).map(b => b.dataset.sec) } }); m.close(); toast('Sent back to the vendor ✉️', 'ok'); reload() } catch (e) { $('#sbErr', m.el).innerHTML = errorBox(e) }
    }
  }

  function devLinkModal (link) {
    const full = new URL(link, location.origin).href
    modal(html`<h2>✉️ Invite sent</h2><p>In demo mode no real email goes out. You can open the vendor's view directly, or find the email in the test mailbox.</p><input readonly aria-label="Demo vendor invitation link" value="${full}"><div class="row" style="margin-top:14px"><a class="btn btn-line" href="#/mailbox" data-close>Open test mailbox</a><span class="spacer"></span><a class="btn btn-primary" href="${full}" target="_blank" rel="noopener">Open as the vendor →</a></div>`)
  }

  // ---------------------------------------------------------------- invite wizard
  async function inviteDialog () {
    let cfg
    try { cfg = await api('/api/internal/config') } catch (e) { return errMsg(e) }
    const at = cfg.accountTypes, terms = cfg.paymentTerms
    const st = { accountType: null, paymentTerms: (terms.find(t => t.isDefault) || terms[0]).code, country: 'IE', currency: 'EUR' }
    const m = modal(html`<div class="row between"><h2 style="margin:0">＋ Invite a vendor</h2><button class="btn btn-line btn-sm" data-close>✕</button></div>
      <p class="muted small">The vendor gets a secure link to fill in their own details. You'll review them when they're done.</p>
      <div class="form-grid">
        <div class="field" style="grid-column:1/-1"><label for="iCo">Company name</label><input id="iCo" placeholder="e.g. Acme Test Supplies Ltd"></div>
        <div class="field"><label for="iName">Contact name</label><input id="iName" placeholder="Who fills in the form?"></div>
        <div class="field"><label for="iEmail">Contact email</label><input id="iEmail" type="email" placeholder="name@company.com"></div>
        <div class="field"><label for="iCountry">Country</label><select id="iCountry">${cfg.countries.map(c => html`<option value="${c.code}" ${c.code === 'IE' ? raw('selected') : ''}>${c.name}</option>`)}</select></div>
        <div class="field"><label for="iCur">Trading currency</label><select id="iCur">${cfg.currencies.map(c => html`<option value="${c.code}" ${c.code === 'EUR' ? raw('selected') : ''}>${c.code} · ${c.name}</option>`)}</select></div>
      </div>
      <div class="field"><label>What will they do for Jones?</label>
        <div class="choices" id="iTypes">${at.map(a => html`<button class="choice" type="button" data-at="${a.code}"><span class="t">${{ box: '📦', person: '🧑‍💻', people: '👷', crane: '🏗️' }[a.icon] || '•'} ${a.label}</span><span class="d">${a.question}</span><span class="d" style="font-weight:700">${a.code} · ${a.numberRange}</span></button>`)}</div>
        <span class="hint">Not sure? Materials only → Material Supplier. Labour only, under Jones supervision → Supply of Personnel. Goods and labour with their own spec and quality → Fully Contracted out.</span></div>
      <div class="field"><label>Payment terms (set by Jones)</label><div class="seg" id="iTerms">${terms.map(t => html`<button type="button" data-t="${t.code}" class="${t.code === st.paymentTerms ? 'on' : ''}">${t.label}</button>`)}</div></div>
      <div class="field"><label for="iWhy">Why do we need them? (project or purpose)</label><input id="iWhy" placeholder="e.g. Pipework for the Cork pharma site"></div>
      ${DEV ? html`<button class="btn btn-line" id="fillInvite" type="button">✨ Fill for me</button>` : ''}
      <div id="iErr"></div>
      <div class="row"><span class="spacer"></span><button class="btn btn-line" data-close>Cancel</button><button class="btn btn-primary btn-lg" id="iGo">Send invite ✉️</button></div>`, { wide: true })
    $$('[data-at]', m.el).forEach(b => { b.onclick = () => { st.accountType = b.dataset.at; $$('[data-at]', m.el).forEach(x => x.classList.toggle('on', x === b)) } })
    $$('[data-t]', m.el).forEach(b => { b.onclick = () => { st.paymentTerms = b.dataset.t; $$('[data-t]', m.el).forEach(x => x.classList.toggle('on', x === b)) } })
    $('#iCountry', m.el).onchange = e => { const c = cfg.countries.find(x => x.code === e.target.value); if (c) $('#iCur', m.el).value = c.defaultCurrency }
    if ($('#fillInvite')) $('#fillInvite').onclick = async () => {
      try {
        const sample = await api('/api/dev/example?country=' + $('#iCountry').value)
        for (const [id, key] of Object.entries({ iCo: 'companyName', iName: 'vendorContactName', iEmail: 'vendorEmail', iWhy: 'businessReason', iCur: 'currency' })) $('#' + id).value = sample.invite[key]
        $('[data-at="YBIV"]', m.el).click()
      } catch (e) { errMsg(e) }
    }
    $('#iGo', m.el).onclick = async () => {
      const body = { companyName: $('#iCo', m.el).value, vendorContactName: $('#iName', m.el).value, vendorEmail: $('#iEmail', m.el).value, country: $('#iCountry', m.el).value, currency: $('#iCur', m.el).value, accountType: st.accountType, paymentTerms: st.paymentTerms, businessReason: $('#iWhy', m.el).value }
      $('#iGo', m.el).disabled = true
      try {
        const out = await api('/api/internal/requests', { method: 'POST', body })
        m.close(); confetti(90); toast(`Invite sent to ${body.vendorEmail} ✉️`, 'ok')
        location.hash = `#/requests/${out.ID}`
        if (out.devLink) setTimeout(() => devLinkModal(out.devLink), 400)
      } catch (e) {
        $('#iGo', m.el).disabled = false
        $('#iErr', m.el).innerHTML = errorBox(e.details?.errors ? Object.assign(new Error(Object.values(e.details.errors).join(' ')), {}) : e)
      }
    }
  }

  // ---------------------------------------------------------------- admin
  async function admin (tab) {
    if (!has('VOB_MasterDataAdmin')) { app.innerHTML = html`<div class="wrap" style="padding-top:30px"><div class="banner info"><span class="i">🔒</span><div>Only master data admins can open this page.</div></div></div>`; return }
    const tabs = [['sap-errors', '🚨 SAP errors'], ['routes', '🔀 Approval routes'], ['config', '⚙️ Configuration'], ['connection', '🔌 SAP connection']]
    app.innerHTML = html`<div class="wrap" style="padding-top:26px"><h1>Admin</h1><div class="seg" style="margin-bottom:16px">${tabs.map(([k, l]) => html`<button class="${k === tab ? 'on' : ''}" data-tab="${k}" type="button">${l}</button>`)}</div><div id="adm"></div></div>`
    $$('[data-tab]').forEach(b => { b.onclick = () => { location.hash = '#/admin/' + b.dataset.tab } })
    const box = $('#adm')
    if (tab === 'routes') return window.VobRoutes.render(box)
    if (tab === 'sap-errors') {
      const rows = await api('/api/internal/requests?view=sap-errors')
      box.innerHTML = rows.length ? html`<div class="stack">${rows.map(r => rowCard(r))}</div><p class="small muted" style="margin-top:12px">Open a request to see SAP's message in plain English, correct the finance data, and retry. Retries never create a second vendor.</p>` : html`<div class="card empty"><div class="art">🌈</div>No SAP errors. Everything is flowing.</div>`
    } else if (tab === 'connection') {
      box.innerHTML = html`<div class="card"><h2>🔌 Test the SAP connection</h2><p class="muted">Calls <span class="mono">GET /ping</span> on the ZVOB API through the BTP destination.</p><button class="btn btn-primary" id="ping">Test connection</button><div id="pingOut" style="margin-top:14px"></div></div>`
      $('#ping').onclick = async () => {
        $('#ping').disabled = true
        try { const o = await api('/api/internal/admin/sap-ping', { method: 'POST', body: {} }); $('#pingOut').innerHTML = html`<div class="banner ${o.ok ? 'ok' : 'bad'}"><span class="i">${o.ok ? '✅' : '❌'}</span><div>${o.plain} <span class="small muted">(${o.ms} ms)</span><details class="small"><summary>Technical details</summary><pre class="mono small">${JSON.stringify(o.technical, null, 2)}</pre></details></div></div>` } catch (e) { $('#pingOut').innerHTML = errorBox(e) }
        $('#ping').disabled = false
      }
    } else {
      const cfg = await api('/api/internal/config')
      const s = cfg.settings
      box.innerHTML = html`<div class="grid g2">
        <div class="card"><h3>⏱️ Settings</h3>${Object.entries(s).map(([k, v]) => html`<div class="field"><label for="s_${k}" class="small mono">${k}</label><div class="row" style="flex-wrap:nowrap"><input id="s_${k}" value="${v}"><button class="btn btn-sm btn-ghost" data-set="${k}">Save</button></div></div>`)}</div>
        <div class="stack">
          <div class="card"><h3>💳 Payment terms</h3><table class="table"><thead><tr><th>Code</th><th>SAP key</th></tr></thead><tbody>${cfg.paymentTerms.map(t => html`<tr><td>${t.label}</td><td><input data-pt="${t.code}" aria-label="SAP payment key for ${t.label}" value="${t.sapKey}" style="width:90px;padding:6px 8px"></td></tr>`)}</tbody></table><button class="btn btn-sm btn-ghost" id="savePt" style="margin-top:8px">Save SAP keys</button></div>
          <div class="card"><h3>🏷️ Account types</h3><table class="table"><thead><tr><th>Group</th><th>Recon. account</th></tr></thead><tbody>${cfg.accountTypes.map(a => html`<tr><td><b>${a.code}</b> ${a.label}</td><td><input data-at="${a.code}" aria-label="Reconciliation account for ${a.label}" value="${a.reconAccount || ''}" style="width:130px;padding:6px 8px"></td></tr>`)}</tbody></table><button class="btn btn-sm btn-ghost" id="saveAt" style="margin-top:8px">Save accounts</button></div>
          <div class="card"><h3>📎 Document types</h3>${cfg.docTypes.map(d => html`<div class="small" style="margin-bottom:6px"><b>${d.label}</b> · required for <span class="pill">${d.requiredFor}</span>${d.countries ? html` · <span class="pill">${d.countries}</span>` : ''}${d.needsValidUntil ? ' · has expiry date' : ''}</div>`)}</div>
          <div class="card"><h3>📇 Approver directory</h3><p class="small muted">Who receives approval, reminder and SAP-error emails. Add a replacement before removing the last person for a role.</p><div id="dir" class="small muted">Loading…</div><form id="dirForm" class="stack" style="margin-top:14px"><div class="grid g3"><label class="field"><span>Role</span><select id="dirRole"><option value="VOB_PurchasingManager">Purchasing</option><option value="VOB_ProcurementApprover">Procurement</option><option value="VOB_BankVerifier">Bank Check</option><option value="VOB_FinancialController">Finance</option><option value="VOB_MasterDataAdmin">Admin</option></select></label><label class="field"><span>Name</span><input id="dirName" maxlength="120" required autocomplete="name"></label><label class="field"><span>Email</span><input id="dirEmail" type="email" maxlength="255" required autocomplete="email"></label></div><button class="btn btn-sm btn-primary" type="submit">Add or update recipient</button><div id="dirErr" class="small" aria-live="polite"></div></form></div>
        </div></div>`
      $$('[data-set]').forEach(b => { b.onclick = async () => { try { await api('/api/internal/admin/config/Settings', { method: 'PUT', body: { name: b.dataset.set, value: $('#s_' + b.dataset.set).value } }); toast('Saved ✓', 'ok') } catch (e) { errMsg(e) } } })
      $('#savePt').onclick = async () => { try { for (const i of $$('[data-pt]')) await api('/api/internal/admin/config/PaymentTerms', { method: 'PUT', body: { code: i.dataset.pt, sapKey: i.value } }); toast('Saved ✓', 'ok') } catch (e) { errMsg(e) } }
      $('#saveAt').onclick = async () => { try { for (const i of $$('input[data-at]')) await api('/api/internal/admin/config/AccountTypes', { method: 'PUT', body: { code: i.dataset.at, reconAccount: i.value } }); toast('Saved ✓', 'ok') } catch (e) { errMsg(e) } }
      const roleNames = { VOB_PurchasingManager: 'Purchasing', VOB_ProcurementApprover: 'Procurement', VOB_BankVerifier: 'Bank Check', VOB_FinancialController: 'Finance', VOB_MasterDataAdmin: 'Admin' }
      const renderDirectory = async () => {
        const rows = await api('/api/internal/admin/role-directory')
        const missing = Object.entries(roleNames).filter(([role]) => !rows.some(r => r.role === role))
        $('#dir').innerHTML = `${missing.length ? html`<div class="banner bad" style="margin-bottom:12px"><span class="i">⚠️</span><div><b>Email recipients missing</b><br>Add recipients for ${missing.map(([, label]) => label).join(', ')} before using approvals in production. Approval notifications cannot be delivered to an empty role pool.</div></div>` : html`<div class="banner ok" style="margin-bottom:12px"><span class="i">✅</span><div>Every notification role has at least one recipient.</div></div>`}${rows.length ? html`<div class="stack">${rows.map(r => html`<div class="row" style="justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid var(--line)"><div><b>${roleNames[r.role] || r.role}</b> · ${r.name}<div class="small muted">${r.email}</div></div><button class="btn btn-sm btn-ghost" type="button" data-dir-delete="${r.role}" data-dir-email="${r.email}" aria-label="Remove ${r.name} from ${roleNames[r.role] || r.role}">Remove</button></div>`)}</div>` : html`<p class="small muted">No recipients configured yet.</p>`}`
        $$('[data-dir-delete]').forEach(b => { b.onclick = async () => { try { await api(`/api/internal/admin/role-directory?role=${encodeURIComponent(b.dataset.dirDelete)}&email=${encodeURIComponent(b.dataset.dirEmail)}`, { method: 'DELETE' }); await renderDirectory(); toast('Recipient removed', 'ok') } catch (e) { errMsg(e) } } })
      }
      $('#dirForm').onsubmit = async e => {
        e.preventDefault()
        $('#dirErr').textContent = ''
        try { await api('/api/internal/admin/role-directory', { method: 'POST', body: { role: $('#dirRole').value, name: $('#dirName').value, email: $('#dirEmail').value } }); $('#dirName').value = ''; $('#dirEmail').value = ''; await renderDirectory(); toast('Recipient saved ✓', 'ok') } catch (e) { $('#dirErr').innerHTML = errorBox(e) }
      }
      await renderDirectory()
    }
  }

  // ---------------------------------------------------------------- dev mailbox
  async function mailbox (id) {
    if (!DEV) return home()
    const mails = await api('/api/dev/mailbox')
    app.innerHTML = html`<div class="wrap" style="padding-top:26px"><h1>📬 Test mailbox</h1><p class="muted">Every email the app would send. Nothing leaves this computer in demo mode. Vendor links and one-time codes are here.</p>
      <div class="grid" style="grid-template-columns:minmax(260px,380px) 1fr;align-items:start" id="mb">
        <div class="card" style="padding:8px;max-height:75vh;overflow:auto">${mails.map(mm => html`<a class="list-card" style="margin-bottom:6px;border-color:${mm.ID === id ? 'var(--brand)' : 'var(--line)'}" href="#/mailbox/${mm.ID}"><span style="font-size:1.3rem">${mm.code ? '🔢' : mm.actionUrl ? '🔗' : '✉️'}</span><div style="min-width:0"><b class="small">${mm.subject}</b><div class="small muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${mm.toAddress} · ${ago(mm.createdAt)}</div></div></a>`)}</div>
        <div id="mail">${mails.length ? '' : html`<div class="card empty"><div class="art">📭</div>No emails yet.</div>`}</div>
      </div></div>`
    const show = id || mails[0]?.ID
    if (!show) return
    const mm = await api(`/api/dev/mailbox/${show}`)
    const link = mm.actionUrl ? new URL(mm.actionUrl, location.origin).href : null
    $('#mail').innerHTML = html`<div class="card"><div class="small muted">To: ${mm.toAddress} · ${fmtDateTime(mm.createdAt)}</div><h2 style="margin-top:6px">${mm.subject}</h2>
      ${mm.code ? html`<div style="margin:10px 0">One-time code: <span class="code-big">${mm.code}</span></div>` : ''}
      ${link ? html`<div class="row" style="margin:10px 0"><a class="btn btn-primary" href="${link}" target="_blank" rel="noopener">${link.includes('/portal/') ? 'Open as the vendor →' : 'Open link →'}</a><span class="small muted mono" style="word-break:break-all">${link}</span></div>` : ''}
      <iframe class="mail-frame" sandbox="" title="Email preview" id="frame"></iframe></div>`
    $('#frame').srcdoc = mm.html || `<pre>${UI.esc(mm.text || '')}</pre>`
  }

  boot()
})()
