# Historical Claude Code takeover — superseded 2026-11-27

> This document records the 2026-11-10 handover and implementation state. The owner took the work back on 2026-11-27 because Claude Code has no available usage and authorized Codex to act as developer, reviewer and merger. Current instructions: [AGENTS.md](../AGENTS.md). Its historical instruction to leave PR #2 unmerged is superseded; merge only after independent review and all required checks pass on the exact PR head. Real SAP/BTP access and production deployment remain unauthorized.

> **Current security remediation:** unauthorized bank-data paths in request details, bank-letter downloads and FIN-010 PDFs are guarded; audit payloads and retention are minimized. Follow-up covers US-style non-IBAN accounts and separator variants. Latest local verification: 35/35 Node tests, lint, and targeted Playwright journey 06 pass. Full Playwright and fresh CI for the current revision are pending; do not merge until independent review and exact-head checks pass.

> **Status after the Claude Code completion pass (2026-11-10, later the same day).** Items 2–4 and 6–7 below are done for everything possible without Jones's SAP/BTP. See [test-evidence.md](test-evidence.md) for the requirement-to-test mapping and coverage, [btp-setup-guide.md](btp-setup-guide.md) for the click-by-click deployment path, and [deviations.md](deviations.md) D10.
>
> Fixes made:
> - Requester reclassification at requester review now re-derives the saved route, or refuses when the vendor must supply more.
> - "Requester review" can no longer be added as a route step.
> - Admin-editable configuration is seeded by the app, no longer HDI table data, so redeploys keep admin changes and production gets no placeholder approvers.
> - App Router CSRF token refresh is fixed.
> - The server's keep-alive timeout is raised; this was the source of random `ECONNRESET` errors.
> - axe now waits for entrance animations, which caused the flaky contrast failures.
> - Retention anonymisation and the privacy-notice link are implemented.
> - A coverage script is added.
>
> Item 5 (ABAP in ECC DEV) and all live integrations remain external. The original handover text follows unchanged.

## Ownership and exact checkpoint

The owner asked Claude Code to take over all remaining implementation, review, testing and completion work end to end. Codex is handing off now, not scheduling work for its return. The old “Claude reviews only, then gives Codex a fix prompt” arrangement is superseded. `AGENTS.md`, `CLAUDE.md` and the root takeover prompt reflect that change.

- Local folder: `C:\Users\maynor\Documents\Codex\projects\Jones Vendor Onboarding`
- Repository: https://github.com/amahesh83/jones-vendor-onboarding (private)
- Branch: `build/v1`; continue it, do not reset or rebuild.
- Existing draft PR: https://github.com/amahesh83/jones-vendor-onboarding/pull/2 (base `main`; leave unmerged under the current build brief).
- Last implementation commit: `a456354980c5fab4fbed50a5c278c4ae6ad549d1` — saved vendor process guidance and review targets.
- Previous main implementation commit: `eb972622e40ef816b42e160c59fa9ba92ba78d7f` — configurable routes, UI/demo/process improvements and reliability/ABAP work.
- Earlier working app: `aa24062`; visual refresh: `0153d2f`. Preserve this work.
- A documentation-only handover commit follows the implementation checkpoint. Resolve its exact SHA with `git log`; do not mistake it for the code tested in the CI run below.

## What is implemented

**ADR-003:** `db/approval-routes.cds`, seed CSV and `srv/lib/approval-routes.js` implement first active match by ascending priority, AND across populated condition dimensions, alternatives within each dimension, empty = any, deterministic ID tie-break, an active conditionless default, supported unique steps and Finance last. The three starting routes are seeded. Requester review is globally on by default. Submission stores a route snapshot; resubmission and later configuration edits retain it. Legacy submitted requests without snapshots retain their original chain; unsubmitted staff views show a labelled preview.

`srv/lib/workflow.js` and `requests.js` use snapshots for transitions, progress, roles, reminder/escalation targets, task emails, next-action text and FIN-010. Separate bank verification is the default. IN_FINANCE shows the callback panel on Finance and requires that approver's own confirmed evidence. Recording a separate bank callback prevents that person acting on another step, including when another verifier later approves the bank step. Requesters cannot act later; every resubmission needs fresh callback evidence. Admin cards in `app/assets/approval-routes.js` provide conditions, step chips, ordering/removal, mode warning, requester toggle, validation and a tester.

**UI/process/demo:** existing `app/assets/vob.css` and `ui.js` retained. Responsive navigation/cards/forms, contrast, modal focus/keyboard/inert background, skip links and horizontally scrollable progress were improved. Framework-free; CSP still `script-src 'self'`. Home links to How it works. Staff and vendor views show next actions. The process page reads saved vendor routes through `/api/portal/process` so the session cookie remains scoped to `/api/portal`; staff request links use the authenticated request API. Generic process content shows configured routes. Demo-only example buttons fill invites, individual/whole vendor forms, required sample PDFs and callback fields. Fake .test contacts, valid-format tax/postcodes and checksum-correct IBANs are generated; intentional duplicate VAT is opt-in. Production guards are tested on both fill endpoints.

**D3:** `db/queue.cds` and `srv/lib/sap/creation-queue.js` implement a transactional application outbox, conditional worker claims, persisted attempts/backoff, five-minute leases, startup recovery and terminal error/admin retry. This deliberately differs from CAP's generic dispatcher; documented in deviations/runtime reliability. Separate-process recovery, rollback and competing-worker/transient tests pass. ECC must still enforce idempotency after a remote commit/crash.

**D5:** `@cap-js/audit-logging` pinned; vendor data-subject annotations and explicit SensitiveDataRead calls for custom unmasked-bank routes. Events contain field names, actor and request ID, not bank values. MTA binds an existing write-capable `vob-audit-log` instance. Local plugin invocation is tested; live BTP delivery is not.

**D7:** offline abapGit root/descriptors/package/DDIC export plus six ABAP Unit source cases (including a duplicate-store double), duplicate persistence abstraction, IBAN lookup and GOS implementation, request-log write before the vendor commit and attachment error handling. Parser/archive checks pass. SAP semantic compilation and actual ABAP Unit execution have NOT happened; WHT mapping and all `VERIFY IN DEV` points remain real integration work.

**Build:** pinned test/lint dependencies and Node 24 engine. `npm run demo` is stable `cds serve`, not watch/live-reload (live-reload would violate CSP). `npm run build:cap` compiles and stages the plain `app/` assets into `gen/srv/app`; CAP alone omitted them. `npm run build` checks MBT/GNU make and archive output instead of accepting a misleading success without an archive.

## Verified evidence — read before rerunning

Authoritative full run for the implementation checkpoint:

https://github.com/amahesh83/jones-vendor-onboarding/actions/runs/42808148930

Run #6, job `verify` (`129802511317`), **success**:

- Node: **28 passed, 0 failed**.
- Playwright: **19 passed (7.2 minutes)** — original 13 acceptance journeys, demo controls, route editor/IN_FINANCE journey and four 375/1280 light/dark screen traversals.
- ESLint: passed, zero warnings.
- ABAP parser: 14 files, zero parser issues; not SAP semantic compilation.
- `npm run build:cap`: passed; UI staging verified.
- `npm run build`: passed on Linux; log confirms `gen/vob.mtar` generated.
- `npm run package:abap`: passed.
- Evidence artifact: `vob-test-evidence`, ID `13761936630`, containing reports/screenshots and `gen/zvob-abapgit.zip`. Download through the run's Artifacts section. MTA was built but is not included in that artifact's configured upload paths.

The latest **local** `test-results/e2e-results.json` is a later targeted run at 12:30 UTC: UK vendor, bank-change send-back and 375-dark, **3 passed**. It is NOT a complete-suite report. Earlier local runs had test-session cleanup and async UI timing failures which were fixed. Do not claim a local 19-test result from this overwritten report; the linked CI run is the full proof. Local screenshots in four `docs/test-evidence/` subfolders contain 34 PNGs each, from multiple runs; the CI artifact is the reproducible snapshot. Axe gates reject serious/critical issues; the deliberately sandboxed email-preview content is excluded from injection, while its shell/title are checked. This is not a blanket WCAG certification.

Local implementation checks also passed 28 Node tests, lint, ABAP parsing, CAP production build and packaging. Local Windows MTA failed because MBT's downloaded binary/GNU make were unavailable; Linux CI subsequently built it successfully. Do not repeat the old claim that MTA packaging is wholly unverified.

## Remaining work — do it directly

1. Inspect Git/PR/CI and local changes. `.claude/launch.json` appeared during the session and is user-owned; Codex did not edit or stage it. Local screenshot PNGs are generated evidence; inspect/redact before publishing. Never commit OTPs or invitation tokens. No Codex-owned demo/browser process was running at handover inspection.
2. Complete the final acceptance/security review against design §§5/6/10 and ADR-003. Fix findings yourself. Review snapshot invariance, SoD, fresh callback gates, production demo denial, uploads, bank masking/logging, strict CSP and route editor UX. Verify actual deployment behaviour of the standalone App Router/CSRF/auth with test identities in an authorised environment; mock tests alone do not prove it.
3. Finish the requirement-to-test mapping in `docs/test-evidence.md`, including honest gaps. **Coverage was not measured**; the original brief asks for a report and an 85% srv/ target. Do not invent a percentage. The clean/fresh-checkout installation smoke test is also outstanding.
4. Review D2/D4/D8/D9 (DB document storage, no SMTP adapter, per-instance rate limits and reminder timer). Keep intentional deviations explicit; the deployment remains single-instance unless these are addressed. D3's implementation is an application outbox, not CAP's generic dispatcher.
5. Work through `docs/abap-install.md` in authorised SAP DEV when available: structure/API names, internal numbering, WHT/RCT/CIS mapping, duplicate joins, GOS, enqueue key/lifetime, single LUW and concurrent idempotency. Six Unit source cases exist; none have run in SAP. Keep markers until actual verification. Do not use real SAP connections under the current guardrails.
6. Complete external prerequisites in `docs/deployment-runbook.md`: HANA/HDI, XSUAA/IAS/Entra roles, destinations/Cloud Connector, write-capable Audit Log, scanner, Graph mail, business SAP configuration and QAS validation. Review HDI seed behaviour so later deployments do not overwrite business-maintained ApprovalRoutes. No BTP deployment, real mail or live SAP connection has been performed here.
7. Update PR #2, evidence, deviations, open questions and runbooks as you go; push to `build/v1`. Leave the PR unmerged unless the owner gives a later merge instruction. Produce concrete artifacts and simple BAS/BTP click-by-click guidance for the owner. No further Codex review/fix loop is required.

## Environment and commands

PowerShell 5.1: no shell `&&`/`||`. Use separate commands. npm scripts are executed by npm's platform shell. Node 24 is required; the default host npm executable used Node 26 and emitted engine warnings, while test/build child processes used Node 24 after PATH setup.

Available local Node 24 executable (verify it still exists):

`C:\Users\maynor\AppData\Local\npm-cache\_npx\387698761821791d\node_modules\node\bin\node.exe`

```powershell
$env:PATH = 'C:\Users\maynor\AppData\Local\npm-cache\_npx\387698761821791d\node_modules\node\bin;' + $env:PATH
node --version
npm ci
npm run lint
npm test
npm run lint:abap
npm run e2e
npm run build:cap
npm run package:abap
```

Run `npm run build` in BAS/Linux with the installed MBT binary and GNU make. CI proved it works. `gen/` is ignored. On Windows, Node 24 can use the corporate Windows certificate store with `NODE_USE_SYSTEM_CA=1`; alternatively supply the corporate CA PEM using `NODE_EXTRA_CA_CERTS`. Never disable TLS verification. Playwright's bundled Chromium is installed; managed Edge/Chrome disallow remote debugging, so do not weaken browser policy. `playwright.config.js` adds localhost/127.0.0.1 to NO_PROXY and owns port 4004 by default. Do not run concurrent local suites against the same output folder/server. Use `VOB_REUSE_DEMO=1` only intentionally.

Run `npm run demo`, open http://localhost:4004 and use the persona switcher: Rachel/Ronan requester, Paddy purchasing, Priya procurement, Ben bank verifier, Fiona finance, Adam admin, Aoife auditor. All data and mail are synthetic. Defaults and click-by-click application usage are in `docs/demo-and-process-guide.md`.

## Important boundaries

CAP on BTP, custom HTML/CSS/JS, in-app approvals and ECC only through the adapter/destination remain fixed ADR decisions. No BPA, Build Apps, ECC Gateway/WDA/BSP, Power Platform or CPI implementation. CPI remains destination-only routing if EY requires it. Do not introduce frameworks or weaken CSP. Preserve working code. Real integrations, live data and production deployment are not silently authorised by this handover; keep the current guardrails and distinguish preparation from actual rollout.
