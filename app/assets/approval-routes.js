/* Approval route cards. The server validates all changes; requests retain snapshots. */
(function () {
  'use strict'
  const { html, raw, api, $, $$, errorBox, toast } = UI
  const list = v => Array.isArray(v) ? v : String(v || '').split(',').filter(Boolean)
  async function render (root) {
    const cfg = await api('/api/internal/config')
    let routes = structuredClone(cfg.approvalRoutes)
    let review = String(cfg.settings.requesterReviewEnabled ?? 'true') !== 'false'
    const options = cfg.approvalStepOptions
    const label = code => options.find(s => s.code === code)?.short || code
    const codes = r => [...(review ? ['REQUESTER'] : []), ...list(r.steps).filter(s => s !== 'REQUESTER')]
    function summary (r) {
      const clauses = [list(r.accountTypes).length ? `account types ${list(r.accountTypes).join(', ')}` : '', list(r.paymentTerms).length ? `terms ${list(r.paymentTerms).join(', ')}` : '', list(r.companyCode).length ? `company ${list(r.companyCode).join(', ')}` : '', list(r.country).length ? `country ${list(r.country).join(', ')}` : ''].filter(Boolean)
      return `${clauses.length ? 'When ' + clauses.join(' and ') : 'Any vendor (default)'}: ${codes(r).map(label).join(' → ')}${r.bankCheckMode === 'IN_FINANCE' ? '; Finance also confirms the bank call-back' : ''}.`
    }
    const condition = (r, key, title, choices) => html`<fieldset><legend>${title} <span class="muted">(none selected = any)</span></legend><div class="row">${choices.map(c => html`<label class="check small"><input type="checkbox" data-condition="${key}" value="${c.code}" ${list(r[key]).includes(c.code) ? raw('checked') : ''}> ${c.label || c.name || c.code}</label>`)}</div></fieldset>`
    function draw () {
      root.innerHTML = html`<div class="banner info"><div><b>First matching route wins, starting with the lowest priority number.</b><p class="small">Keep one active route with no conditions. Existing requests keep the route saved at submission.</p></div></div>
      <div class="card" style="margin:16px 0"><label class="check"><input id="requesterReviewEnabled" type="checkbox" ${review ? raw('checked') : ''}> Requester review first (recommended)</label><p class="small muted">Turning this off removes requester review from new submissions only. The requester still cannot approve later steps.</p></div>
      <div class="stack" id="routeCards">${routes.map((r, index) => html`<article class="card route-card" data-route="${r.ID}">
        <div class="form-grid"><div class="field"><label for="rn${index}">Route name</label><input id="rn${index}" data-field="name" value="${r.name}"></div><div class="field"><label for="rp${index}">Priority</label><input id="rp${index}" data-field="priority" type="number" min="0" step="1" value="${r.priority}"></div></div>
        <div class="row between"><label class="check"><input data-field="active" type="checkbox" ${r.active ? raw('checked') : ''}> Active</label><button class="btn btn-bad btn-sm" data-remove-route="${r.ID}" type="button">Remove route</button></div>
        <p class="small route-summary">${summary(r)}</p>
        ${condition(r, 'accountTypes', 'Account types', cfg.accountTypes)}${condition(r, 'paymentTerms', 'Payment terms', cfg.paymentTerms)}${condition(r, 'companyCode', 'Company codes', cfg.companyCodes)}${condition(r, 'country', 'Countries', cfg.countries)}
        <div class="field"><label for="bm${index}">Who performs the bank call-back?</label><select id="bm${index}" data-field="bankCheckMode"><option value="SEPARATE" ${r.bankCheckMode === 'SEPARATE' ? raw('selected') : ''}>Separate Bank verifier before Finance (default)</option><option value="IN_FINANCE" ${r.bankCheckMode === 'IN_FINANCE' ? raw('selected') : ''}>Finance approver performs the call-back</option></select></div>
        ${r.bankCheckMode === 'IN_FINANCE' ? html`<div class="banner warn" role="note"><div><b>This removes the two-person check on bank details.</b> The Finance approver both confirms the bank call-back and gives final approval. Use only for low-risk routes.</div></div>` : ''}
        <div class="route-steps" aria-label="Ordered approval steps">${list(r.steps).map((code, i) => html`<span class="route-step"><b>${i + 1}. ${label(code)}</b><button class="btn btn-sm btn-line" data-move="${i}" data-delta="-1" type="button" aria-label="Move ${label(code)} earlier" ${i === 0 ? raw('disabled') : ''}>↑</button><button class="btn btn-sm btn-line" data-move="${i}" data-delta="1" type="button" aria-label="Move ${label(code)} later" ${i === list(r.steps).length - 1 ? raw('disabled') : ''}>↓</button><button class="btn btn-sm btn-line" data-remove-step="${i}" aria-label="Remove ${label(code)}" type="button">×</button></span>`)}</div>
        <div class="field"><label for="rs${index}">Add a step (Finance must stay last)</label><select id="rs${index}" data-add-step><option value="">Choose a step…</option>${options.filter(o => o.code !== 'REQUESTER' && !list(r.steps).includes(o.code)).map(o => html`<option value="${o.code}">${o.label}</option>`)}</select></div>
      </article>`)}</div>
      <div class="row" style="margin:18px 0"><button class="btn btn-line" id="addRoute">＋ Add route</button><button class="btn btn-primary" id="saveRoutes">Save routes</button></div><div id="routeMessage" aria-live="polite"></div>
      <section class="card"><h2>Which route would this vendor get?</h2><p class="muted">Tests the cards above, including unsaved changes.</p><div class="form-grid">${[['accountType', 'Account type', cfg.accountTypes], ['paymentTerms', 'Payment terms', cfg.paymentTerms], ['companyCode', 'Company code', cfg.companyCodes], ['country', 'Country', cfg.countries]].map(([key, title, choices]) => html`<div class="field"><label for="test_${key}">${title}</label><select id="test_${key}">${choices.map(c => html`<option value="${c.code}">${c.label || c.name || c.code}</option>`)}</select></div>`)}</div><button class="btn btn-line" id="testRoute">Test this vendor</button><div id="routeTestResult" class="next-step" aria-live="polite" hidden></div></section>`
      $('#requesterReviewEnabled', root).onchange = e => { review = e.target.checked; draw() }
      $$('.route-card', root).forEach(card => {
        const r = routes.find(x => x.ID === card.dataset.route)
        $$('[data-field]', card).forEach(input => { input.onchange = () => {
          r[input.dataset.field] = input.type === 'checkbox' ? input.checked : input.type === 'number' ? Number(input.value) : input.value
          if (input.dataset.field === 'bankCheckMode') {
            const steps = list(r.steps).filter(s => s !== 'BANK_CHECK')
            if (r.bankCheckMode === 'SEPARATE') steps.splice(Math.max(0, steps.indexOf('FINANCE')), 0, 'BANK_CHECK')
            r.steps = steps.join(',')
          }
          if (input.dataset.field === 'bankCheckMode') draw()
          else $('.route-summary', card).textContent = summary(r)
        } })
        $$('[data-condition]', card).forEach(input => { input.onchange = () => { r[input.dataset.condition] = $$(`[data-condition="${input.dataset.condition}"]:checked`, card).map(x => x.value).join(','); $('.route-summary', card).textContent = summary(r) } })
        $('[data-remove-route]', card).onclick = () => { routes = routes.filter(x => x !== r); draw() }
        $$('[data-move]', card).forEach(b => { b.onclick = () => { const steps = list(r.steps), i = Number(b.dataset.move), j = i + Number(b.dataset.delta); [steps[i], steps[j]] = [steps[j], steps[i]]; r.steps = steps.join(','); draw() } })
        $$('[data-remove-step]', card).forEach(b => { b.onclick = () => { r.steps = list(r.steps).filter((_, i) => i !== Number(b.dataset.removeStep)).join(','); draw() } })
        $('[data-add-step]', card).onchange = e => { if (!e.target.value) return; const steps = list(r.steps); steps.splice(e.target.value === 'FINANCE' ? steps.length : Math.max(0, steps.indexOf('FINANCE')), 0, e.target.value); r.steps = steps.join(','); draw() }
      })
      $('#addRoute', root).onclick = () => { routes.push({ ID: 'route-' + window.crypto.randomUUID().slice(0, 12), name: 'New route', priority: 50, active: true, accountTypes: '', paymentTerms: '', companyCode: '', country: '', steps: 'BANK_CHECK,FINANCE', bankCheckMode: 'SEPARATE' }); draw() }
      $('#saveRoutes', root).onclick = async () => {
        try { await api('/api/internal/admin/routes', { method: 'PUT', body: { routes, requesterReviewEnabled: review } }); $('#routeMessage', root).innerHTML = html`<div class="banner ok">Routes saved. In-flight requests keep their snapshots.</div>`; toast('Approval routes saved', 'ok') } catch (e) { $('#routeMessage', root).innerHTML = errorBox(e) }
      }
      $('#testRoute', root).onclick = async () => {
        const box = $('#routeTestResult', root); box.hidden = false
        try { const vendor = Object.fromEntries(['accountType', 'paymentTerms', 'companyCode', 'country'].map(k => [k, $('#test_' + k, root).value])); const out = await api('/api/internal/admin/routes/test', { method: 'POST', body: { routes, requesterReviewEnabled: review, vendor } }); box.textContent = `${out.name}: ${out.summary}${out.bankCheckMode === 'IN_FINANCE' ? '. Bank call-back is recorded in Finance.' : ''}` } catch (e) { box.innerHTML = errorBox(e) }
      }
    }
    draw()
  }
  window.VobRoutes = { render }
})()
