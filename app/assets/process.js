'use strict'
document.getElementById('themeBtn').addEventListener('click', UI.toggleTheme)
;(async () => {
  const { html, api, $, errorBox } = UI
  const descriptions = {
    REQUESTER: 'The person who invited the vendor checks the account type, terms, currency and business need.',
    PURCHASING: 'A Purchasing Manager reviews the commercial details.',
    PROCUREMENT: 'A Procurement approver reviews the supplier and payment terms.',
    BANK_CHECK: 'A separate Bank verifier confirms the bank details by phone using an independent number where possible and records evidence.',
    FINANCE: 'The Financial Controller checks finance data, runs a successful SAP simulation and gives final approval.',
  }
  try {
    const request = new URLSearchParams(location.search).get('request')
    let data = await api('/api/process')
    if (request) {
      const d = await api('/api/internal/requests/' + encodeURIComponent(request))
      data = { snapshot: true, routes: [{ ...d.route, steps: d.steps }] }
    }
    $('.process-flow').innerHTML = html`
      <li class="card"><h2>Invitation and supplier details</h2><p>A Jones employee invites the vendor. The vendor confirms an email code, completes company, contact, tax and bank details, uploads documents and submits.</p></li>
      <li class="card"><h2>Automatic checks</h2><p>The system validates the details and checks possible duplicates. Exact SAP VAT or IBAN matches require an internal justification before final approval.</p></li>
      ${data.routes.map(r => html`<li class="card"><h2>${data.snapshot ? 'Your saved route' : r.name}</h2>${r.when ? html`<p class="small muted">${r.when}${r.priority !== undefined ? ` · priority ${r.priority}` : ''}</p>` : ''}<p><b>Route: ${r.steps.map(s => s.short).join(' → ')}</b></p><div class="stack">${r.steps.map(s => html`<section><h3>${s.label}</h3><p>${descriptions[s.code]}</p><p class="small muted">Reminder: ${s.reminderDays || (s.code === 'BANK_CHECK' ? 1 : 2)} working day(s) · escalation: ${s.escalationDays || (s.code === 'BANK_CHECK' ? 3 : 5)} working day(s).</p></section>`)}</div>${r.bankCheckMode === 'IN_FINANCE' ? html`<div class="banner warn">The Finance approver also records the confirmed bank call-back before approving. This route does not have a separate two-person bank check.</div>` : ''}</li>`)}
      <li class="card"><h2>Account ready</h2><p>The system creates the vendor once, stores the SAP account number, attaches FIN-010 and supporting documents, and notifies the requester and vendor.</p></li>`
    if (!data.snapshot) $('.eyebrow').textContent = 'First matching route wins · saved when the vendor submits'
  } catch (e) { $('.process-flow').innerHTML = html`<li class="card">${errorBox(e)}</li>` }
})()
