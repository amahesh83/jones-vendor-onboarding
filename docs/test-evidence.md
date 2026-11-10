# Acceptance mapping and evidence

Evidence for the Claude Code completion pass on 2026-11-10, on top of implementation checkpoint `a456354` (CI [run #6](https://github.com/amahesh83/jones-vendor-onboarding/actions/runs/42808148930), all green). Run details and their limits are in [test-evidence/README.md](test-evidence/README.md).

**Key:** ✅ tested and passing · 🟡 partly tested (the gap is stated) · ⛔ not testable here (needs Jones SAP/BTP or Jones input)

## Design §5: user journeys

| Requirement | Evidence | State |
|---|---|---|
| 5.1 Invite dialog: required fields, company code, payment-term default | `journey.test.js` "requester invites a vendor"; e2e 01 | ✅ |
| 5.1 Resend, change email before start, cancel | e2e 10 (expired invite and resend); API checks in `requests.js` (owner or admin only) | 🟡 Change email and cancel have no dedicated test |
| 5.1 Requester review: confirm type, terms and currency; approve or send back | e2e 01/03/05; **new:** reclassification re-resolves the route, or is refused when the vendor must supply more (`journey.test.js`) | ✅ |
| 5.2 Invite and OTP emails, code in a separate email, lock after 5 wrong codes | `journey.test.js` "wrong codes lock…"; e2e 11 | ✅ |
| 5.2 Country-driven fields (IE/GB), IBAN-derived sort code/account, BIC checks | `validation.test.js`; e2e 04 (UK) and 08 (bad IBAN) | ✅ |
| 5.2 Documents: PDF/JPG/PNG, 10 MB, valid-until, malware scan | `journey.test.js` (EICAR); e2e 02 and 12 | ✅ |
| 5.2 Review & submit, declaration, receipt; status page; sent-back sections | e2e 01 and 05; `journey.test.js` | ✅ |
| 5.3 Approver page: banners, masked bank data, timeline, approve/send back/reject | e2e 01/06/13; screen traversals in `screens.spec.js` | ✅ |
| 5.3 Bank call-back panel and evidence fields | e2e 01/05/15; `journey.test.js` IN_FINANCE | ✅ |
| 5.3 Finance: finance data, Simulate in SAP, approve only after simulation | e2e 01/09; `workflow` blockers | ✅ against mock SAP |
| 5.4 SAP errors queue, idempotent retry, admin correction/reject | e2e 09; `journey.test.js` "SAP error … retry creates once" | ✅ against mock SAP |
| 5.4 Configuration pages and Test SAP connection | Screen traversal (configuration, connection); `journey.test.js` privacy-URL validation | 🟡 Live connection ⛔ |
| 5.5 List, filters, variants, header counts, export | `journey.test.js` "dashboard, list and CSV export"; screens | ✅ |

## Design §6 and ADR-003: workflow and approval routes

| Requirement | Evidence | State |
|---|---|---|
| First active match by priority, AND across conditions, OR within, empty = any, ID tie-break | `approval-routes.test.js` (2 tests) | ✅ |
| Default route always present; unique and known steps; Finance last; bank-mode consistency | `approval-routes.test.js` validate; `journey.test.js` 422 on save | ✅ |
| **New:** Requester review cannot be added as a route step (it is the global switch) | `approval-routes.test.js` (existing case), `journey.test.js` "route editor refuses…"; editor no longer offers it | ✅ |
| Requester review on/off globally, always first | `approval-routes.test.js`; `journey.test.js` IN_FINANCE (off) | ✅ |
| Saved route snapshot is immutable after config edits and resubmission | `approval-routes.test.js`; `journey.test.js` "admin edits do not change snapshots" and IN_FINANCE resubmission | ✅ |
| Default route = one business approval; sub-contractor = two | `journey.test.js`; e2e 01/02/03 | ✅ |
| IN_FINANCE: Finance records own confirmed call-back; another person's evidence does not count | `journey.test.js` IN_FINANCE; e2e 15 | ✅ |
| SoD: requester never approves later steps; one person one step; separate call-back person blocked from other steps | `workflow` unit test; `approval-routes.test.js`; e2e 07 | ✅ |
| Fresh call-back after send-back / bank change | e2e 05; `journey.test.js` IN_FINANCE round 2 | ✅ |
| Snapshot drives progress, task/reminder emails, next-step text, process guide, FIN-010 | Code review of `workflow.routeFor` use in `requests.js`, `pdf.js`, `mail/templates.js`; `journey.test.js` checks portal process/next-review from the snapshot | 🟡 Reminder/escalation emails are reviewed in code, not asserted by a test |
| 6.3 Duplicate checks (SAP and open requests); exact VAT blocks until justified | e2e 06; `journey.test.js` duplicate opt-in | ✅ against mock SAP |

## Design §10: security and controls

| Requirement | Evidence | State |
|---|---|---|
| Invite token hashed; OTP 6 digits/10 min/5 attempts/lock; session cookie flags; CSRF | `journey.test.js`; e2e 11; code review of `portal-auth.js` | ✅ |
| Bank data masked; full view only for bank verifier/FC/admin; each view audit-logged | `journey.test.js` "unmasked bank reads emit a plugin event…" | ✅ locally; live Audit Log ⛔ |
| Server-side authorisation and SoD | `journey.test.js` (403s); e2e 07 | ✅ |
| Upload allow-list, size, malware scan | `journey.test.js` EICAR; e2e 12 | ✅ with mock scanner; BTP scanner ⛔ |
| CSP `script-src 'self'`, HSTS (production), nosniff, frame-deny | Code review of `server.js`; e2e runs under the CSP | ✅ |
| **New:** Retention: anonymise rejected/expired/cancelled after 12 months | `journey.test.js` "retention anonymises…" | ✅ |
| **New:** Privacy notice in the portal | Link shown when `privacyNoticeUrl` (https only) is set; `journey.test.js` | 🟡 Notice text must come from Jones (Q16) |
| Dev login and mocks impossible in production | `journey.test.js` "dev login refuses…", "demo generator and both HTTP endpoints refuse production" | ✅ |
| **New:** Admin configuration survives redeploys (not HDI table data) | `journey.test.js` "starting configuration…"; `gen/db` checked: only Countries/Currencies/WHT data | ✅ locally; real HDI redeploy ⛔ |
| **New:** App Router CSRF token refresh after session timeout | `ui.js` re-fetches the token on `403 x-csrf-token: Required` and retries once | ⛔ needs a real App Router |

## Reliability, build and packaging

| Item | Evidence | State |
|---|---|---|
| Durable SAP creation outbox, restart recovery, competing workers | `restart.test.js`; `journey.test.js` outbox tests | ✅ |
| Fresh Windows checkout | Clone of `67f2399` into an empty folder: `npm ci`, lint, 28/28 tests, ABAP parse, `build:cap` (UI staged) and ABAP ZIP all passed on Node 24.22.2 | ✅ |
| CAP production build and UI staging | `npm run build:cap` on the final code | ✅ |
| MTA archive | Linux CI run #6; not possible on this Windows laptop (no MBT/GNU make) | ✅ in CI |
| ABAP parse and abapGit ZIP | `npm run lint:abap` (0 issues, 14 files); `npm run package:abap` | ✅ parse only; SAP compile and ABAP Unit ⛔ |

## Coverage (`npm run coverage`)

Node's built-in coverage over `srv/**`, final code, 33 tests:

| Lines | Branches | Functions |
|---|---|---|
| **92.1 %** | 73.4 % | 83.6 % |

- The **85 % line target is met** for the server files the Node tests load.
- Two files are **not loaded** by Node tests and so are not in that figure:
  - `srv/lib/sap/http.js` (32 lines): the real ECC adapter, testable only against ECC DEV;
  - `srv/lib/demo.js` (188 lines): demo data, exercised by the Playwright suite.
- Branch coverage is lower, mainly in error paths of the routes and SAP mock.
- Browser (Playwright) runs are not included in the coverage figure.

## Not verified anywhere yet (needs Jones SAP/BTP)

ECC compile and ABAP Unit, every `VERIFY IN DEV` item, live idempotency, BTP deployment, XSUAA/IAS/Entra login, App Router CSRF, Graph email, BTP malware scanner, Audit Log delivery, HDI redeploy behaviour. See [abap-install.md](abap-install.md) and [btp-setup-guide.md](btp-setup-guide.md).
