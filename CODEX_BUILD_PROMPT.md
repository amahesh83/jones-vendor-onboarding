> **Current owner — 2026-11-27:** Codex owns continuation, implementation, independent review and authorized merge of existing PR #2. This file remains the acceptance brief; follow [AGENTS.md](AGENTS.md) for current workflow. The 2026-11-10 Claude takeover text below is historical and superseded.

> **ADR-003 supersession (2026-11-10):** Approval routes are configurable and snapshotted at submission. The old fixed-chain references below are superseded by [ADR-003](docs/decisions/ADR-003-configurable-approval-routes.md) and design §6. ADR-002 supersedes UI5/Fiori implementation details. Keep the 13 acceptance scenarios, adapting expected steps to the saved route.

# Codex build prompt: Jones Vendor Onboarding (VOB) v1

> Historical Codex build prompt retained for acceptance requirements. Do not restart the build.
> Current ownership and continuation instructions are in CLAUDE_CODE_PROMPT.md.
>
> **Platform decision: Option 6, CAP on SAP BTP, approvals in the app (2026-11-09).**
> - Recorded in [docs/decisions/ADR-001-platform-cap-on-btp.md](docs/decisions/ADR-001-platform-cap-on-btp.md).
> - Codex is told in this prompt and in [AGENTS.md](AGENTS.md), which Codex reads automatically in every session.

````text
You are the developer for "Jones Vendor Onboarding" (VOB). Build the COMPLETE v1 application end to end in this
repository in ONE pass: build, test, do a final hardening pass, then stop and hand over for review.
Do not stop for intermediate reviews or approvals. If something only Jones can decide comes up, use the default
in the design, record it in docs/open-questions.md, and keep going.

PLATFORM DECISION (made by the project owner on 2026-11-09; recorded; final for v1)
- We are building OPTION 6 in the design: ONE SAP CAP application (Node.js, plain JavaScript) on SAP BTP
  Cloud Foundry. It has:
  - a SAPUI5 vendor portal (no SAP or IAS accounts for vendors);
  - a Fiori elements internal app;
  - approvals in the app (CAP-native state machine);
  - vendor creation in ECC IE01 through a thin ABAP REST API (package ZVOB, wrapping VMD_EI_API), reached
    only via a BTP destination and the Cloud Connector.
- Option 6b (approvals in SAP Build Process Automation and/or a CPI build) is NOT part of v1.
- Do NOT introduce:
  - BPA or SAP Build Apps;
  - SAP Business Workflow;
  - Web Dynpro or BSP;
  - an OData/Gateway service in ECC;
  - Power Platform;
  - a message broker, microservices or multitenancy.
- CPI is only a possible deployment-time routing (point the destination at a pass-through iFlow). Build nothing
  for it beyond keeping the SAP adapter contract (design §9) destination-agnostic.
- The decision record is docs/decisions/ADR-001-platform-cap-on-btp.md. Do not reopen it. If you see a real
  problem with it, write it in docs/deviations.md, say so in the hand-over, and keep building on Option 6.

READ FIRST (source of truth, in this order)
1. AGENTS.md: standing project rules (already in the repo; keep it and extend it, see WP0).
2. docs/decisions/ADR-001-platform-cap-on-btp.md: the platform decision above, with reasons and consequences.
3. docs/01-solution-design.md: the agreed design (options, architecture, journeys, workflow, field mapping,
   SAP contract, security, open questions). Follow it. If you must deviate, record why in docs/deviations.md.
4. reference/FIN-010-IE01-Vendor-Account-Setup-Form.pdf: the PDF being replaced. It has 53 AcroForm fields;
   the exact field names are listed in design §2. The app must also fill this PDF (see WP9).

WHAT "DONE" MEANS
- One command (`npm install` then `npm run demo`) starts the whole app locally on Windows with SQLite, a mock SAP,
  a local mailbox and fake users. It is seeded with requests in every status.
- The full journey works in a browser, tested automatically:
  requester invites → vendor opens link → email OTP → guided form → uploads → submit → automatic checks →
  requester → purchasing manager → (procurement if 30 days EOM) → bank call-back → financial controller
  (with SAP simulation) → vendor created in mock SAP → vendor number emailed → FIN-010 PDF generated and
  "attached" in mock SAP. Send-back, reject, SAP-error-and-retry and expiry paths work too.
- All tests pass. Lint is clean. `npm run build` produces deployable BTP artefacts (mta.yaml builds with `mbt` in CI).
- ABAP sources for the ECC side are complete in abapGit format, with ABAP Unit tests and an install guide.
- The docs listed in WP12 exist and are accurate for what was actually built.

FIXED DECISIONS (do not re-open; they implement ADR-001)
- Stack: SAP CAP (Node.js, plain JavaScript, ESLint), one CAP app. SAPUI5 freestyle vendor portal (Horizon theme).
  SAPUI5 Fiori elements (OData V4) internal app. Standalone SAP App Router for BTP.
- DB: SQLite for local/test. Production profile for SAP HANA Cloud, kept DB-agnostic so PostgreSQL is a config
  change (document how).
- Approvals: a CAP-native state machine driven by config tables (design §6). No BPA, no SAP Business Workflow.
- SAP access only through an adapter interface with two implementations: `mock` (default) and `http`.
  `http` calls a BTP destination using the JSON contract in design §9. The same adapter serves the direct
  Cloud Connector route and the CPI route.
- Vendors never get SAP or IAS accounts: invite magic link + email OTP + short session (design §10).
  Internal users: XSUAA (IAS trusting Entra ID) with the role collections in design §6.2.
- Email via adapter: `local` (default: writes .eml/.html to .outbox/ plus a dev mailbox page), `graph`
  (Microsoft Graph sendMail via destination), `smtp`.
- Files via adapter: local file system + mock malware scanner (rejects the EICAR test string) for dev; Object Store
  + SAP Malware Scanning Service for BTP. Use @cap-js/attachments if it fits cleanly; otherwise build a small
  equivalent.
- Keep it simple: no microservices, no message broker, no multitenancy, no extra frameworks beyond what is
  listed here plus small, well-known libraries (pdf-lib, nodemailer, a test runner, Playwright, axe).

WORK PACKAGES (build in this order, committing after each)
WP0 Repo
  - The repository ALREADY EXISTS. Do NOT run `git init`, do NOT create a GitHub repo, and do NOT rewrite history.
    - It is the private GitHub repo amahesh83/jones-vendor-onboarding, cloned in this folder with `origin` set.
    - `main` holds the docs, reference PDF, AGENTS.md, README.md and .gitignore. It was set up in PR #1, which is
      merged and covered repository setup only.
  - Start from the latest `main` and build on branch `build/v1`, brought up to date first. In PowerShell:
    `git switch main; git pull; git switch build/v1; git merge --ff-only origin/main`
    If the fast-forward fails, recreate the branch from main with `git switch -C build/v1 origin/main`.
  - .gitignore already exists. Extend it only if needed; keep the existing entries.
  - README.md already exists and says "repository setup only". Rewrite it in WP12 once the app is built.
  - AGENTS.md already exists. Keep its "Platform decision" and "Working model" sections exactly as they are.
    Fill in its "Commands" section with the real npm scripts once they exist.
  - Pin exact dependency versions (commit package-lock.json). Set `engines.node` to an LTS version supported by
    current CAP AND the SAP BTP Cloud Foundry Node.js buildpack. Local machine has Node 26.
  - npm scripts must work in Windows PowerShell 5.1 and in Linux CI (no bash-only syntax; no `&&` in docs
    commands meant for PowerShell users).
  - Behind Zscaler, npm/TLS can fail on the corporate CA. If it does, document NODE_EXTRA_CA_CERTS in the README
    rather than disabling TLS checks.
WP1 Domain model (db/)
  - Entities: VendorRequests (request number VOB-YYYY-NNNNN, status, current step, step-since, all vendor data
    sections, declaration, SAP vendor number/messages, duplicate-check results, version), ApprovalSteps,
    BankVerifications, FinanceData, RequestDocuments (type, valid-until, scan status), RequestVersions
    (snapshot per submission for "changed since last review" diffs), AuditEvents (append-only),
    InviteTokens/PortalSessions/OtpChallenges (hashed secrets only), Outbox/Notifications.
  - Config entities from design §8, with seed CSVs using the placeholder defaults from design §13.
  - @PersonalData annotations on personal and bank fields (for @cap-js/audit-logging).
WP2 Shared validation library (used by the server, and by the vendor UI through a small bundled copy or endpoint)
  - IBAN (mod-97 + per-country length, IE/GB derive sort code + account), BIC, VAT formats (IE, GB, EU list),
    Eircode, UK postcode, CRO/Companies House, UTR (10 digits), email, phone, SAP length limits
    (name split into NAME1-4 at 35 chars, SORTL 20, street 60, city 40, post code 10).
  - Pure functions with exhaustive unit tests (valid and invalid cases for each rule).
WP3 Vendor portal service (srv/portal-service)
  - Endpoints: start (token) → send OTP, verify OTP → session cookie, get my request, save section (autosave,
    partial), upload/delete document, submit (declaration), status. Strictly scoped to the session's request.
  - Security from design §10: hashed tokens, expiry and revocation, OTP 6 digits / 10 min / 5 attempts / lock,
    rate limits, HttpOnly Secure SameSite=Strict cookie, CSRF on state changes, bank data masked after submit,
    internal comments never exposed, generic messages that never reveal whether another vendor exists.
WP4 Vendor portal UI (app/portal)
  - Journeys in design §5.2: before-you-start checklist driven by account type, country-first conditional
    fields, IBAN-first with derived fields, inline validation with one-line "why we need this" help, autosave
    indicator, progress bar, review page with edit links, declaration, receipt, status tracker, send-back mode
    highlighting flagged sections, account-type help text (design §7.2).
  - Mobile first, WCAG 2.2 AA, plain English. A friendly error page for expired or invalid links that says
    what to do next.
WP5 Internal service + workflow engine (srv/onboarding-service)
  - State machine exactly as design §6.1. Conditional procurement step via payment-terms config.
  - Bound actions: inviteVendor, resendInvite, changeVendorEmail, cancel, approve, reject (reason required),
    sendBackToVendor (message + sections), recordBankVerification, setFinanceData, simulateInSap, retrySapCreation.
  - Server-side role, status and SoD checks (design §6.2: one person, at most one step; requester and bank
    verifier exclusions). Unit-test every rule.
  - Automatic checks on submit and before creation (design §6.3): validation, duplicates vs SAP (adapter) and
    vs open requests; an exact VAT/IBAN match blocks final approval until a justification is recorded.
  - Every state change writes an AuditEvent (who, when, what, before/after summary). There is no
    update/delete path for AuditEvents.
WP6 Internal Fiori app (app/internal)
  - Fiori elements List Report + Object Page on VendorRequests: status criticality chips, ageing,
    "waiting on" column. Variants: Waiting for me / All open / Created / Rejected-Expired. Header counts
    (waiting for me, open, over SLA, created this month, average days to create over 90 days).
  - Object Page: header (status, step, waiting since, days open); banners (duplicates, missing/expired docs,
    changed since last review); sections per data area with bank data masked by role; documents; bank call-back
    panel; finance data; timeline from AuditEvents; action buttons that appear only when the user may act.
  - Admin: maintain config tables (design §8), SAP errors queue with Retry, "Test SAP connection" with a
    plain-English result plus a Technical details toggle.
  - An "Invite vendor" dialog with the 3-question account-type helper (design §5.1).
WP7 SAP adapter + ABAP
  - srv/lib/sap/: interface + mock + http. The mock numbers per account-group range (YBIV 100xxx, YBCS 600xxx,
    YBSP 700xxx, YBVE 800xxx). Seed it with existing vendors for duplicate tests. Deterministic error triggers
    for tests (e.g. company name containing "SAPFAIL-BANK" → 422 bank key error; "SAPDOWN" → 503).
  - Create is idempotent on requestId (ALREADY_CREATED on retry). Run SAP calls through CAP's persistent
    queue/outbox with retry and backoff, then SAP_ERROR.
  - abap/ (abapGit format, package ZVOB, ABAP 7.50 syntax only; ECC 6.0 EHP8, no ABAP Cloud, no 7.51+ features):
    ZCL_VOB_REST_HANDLER, ZCL_VOB_VENDOR_SERVICE (VMD_EI_API=>MAINTAIN_BAPI with test run, COMMIT only when
    there are no errors), ZCL_VOB_DUPLICATE_CHECK (DB access behind an interface), bank creation via
    BAPI_BANK_CREATE behind a flag, GOS attachment on LFA1, table ZVOB_REQLOG, ABAP Unit tests with test doubles.
  - Mark EVERY SAP structure/field/method name you are not certain of with `" VERIFY IN DEV:` and list them all
    in docs/abap-install.md. Do not invent certainty.
  - docs/abap-install.md: abapGit import, SICF node /sap/zvob/v1, technical user + minimal authorisations,
    Cloud Connector mapping (only that path), a test sequence in SAP DEV (ping, simulate, create one test vendor
    per account group, check XK03).
WP8 Notifications
  - Branded HTML + text templates: invite, OTP, submission receipt (vendor + requester), task waiting
    (role directory), reminder, escalation, sent back, rejected (neutral for the vendor, reason for the requester),
    created (requester, and vendor with their Jones account number), SAP error (admins).
  - No bank data in any email. The OTP never goes in the same email as the link.
  - Reminder/escalation/expiry job via cds.spawn with a DB lease, idempotent (lastReminderAt), with
    working-day maths.
WP9 Documents + FIN-010 PDF
  - Upload checks (type allow-list, 10 MB, malware scan before internal users can open it).
  - Generate the completed FIN-010: fill the real template in reference/ by exact AcroForm field names. Tick
    checkboxes with /Yes. Draw "Approved electronically by <name> on <date>" into the signature-field areas.
    Flatten. Append an audit-trail page (every event).
  - Downloadable in the internal app. On creation, sent through the adapter to the vendor's GOS attachments,
    together with the bank letter and the other documents.
WP10 Security hardening
  - Headers (CSP, HSTS, nosniff, frame-deny), input size limits, rate limits, audit logging of every unmasked
    bank-data view.
  - The dev login switcher and mock adapters must refuse to start in the production profile; add a test that
    proves it.
  - Run `npm audit` and fix high/critical findings. Make sure no secrets or real data are committed.
WP11 Deployment artefacts
  - mta.yaml (srv, db deployer, app router, UI apps), xs-security.json (scopes/roles/role collections from
    design §6.2), app router xs-app.json (public routes ONLY for the portal UI + portal service; everything else
    authenticated), destination names documented, production profile config.
  - GitHub Actions CI: install, lint, unit + integration tests, Playwright (headless), mbt build.
WP12 Docs (accurate to what you built)
  - README.md: replace the setup-only Status and Next step sections. Cover what it is, the one-command demo,
    personas, scripts and troubleshooting.
  - docs/architecture.md (as built), docs/field-mapping.md (PDF field → app → SAP, final), docs/deployment-runbook.md
    (BTP subaccount, entitlements, IAS/Entra trust, role collections, destinations, Cloud Connector, ABAP install,
    go-live checklist), docs/user-guide-vendor.md, docs/user-guide-internal.md, docs/test-evidence.md,
    docs/open-questions.md (design §13 plus anything new), docs/deviations.md.

TESTING (you own all of it, before hand-over)
- Unit: validation library, state machine, SoD rules, mapping to the SAP contract, PDF field filling, token/OTP logic.
- Integration (cds.test): every action and every status transition, including forbidden ones (wrong role, wrong
  status, SoD breach, another vendor's session).
- End-to-end UI (Playwright, both apps, against `npm run demo` data), with screenshots saved to
  docs/test-evidence/:
  1. IE material supplier (YBIV) happy path to a vendor number 100xxx; emails present in the local mailbox;
     PDF generated.
  2. IE sub-contractor (YBCS): RCT fields shown; submit blocked until the 4 sub-contractor documents are
     uploaded.
  3. 30 days EOM → procurement step appears; 60 days → it doesn't.
  4. UK vendor: GB IBAN derives sort code + account; CIS/UTR fields shown; GBP default.
  5. Send back → vendor changes bank details → resubmit → all steps again, a new call-back is required,
     changes are highlighted.
  6. Duplicate VAT in SAP → banner; FC approval blocked until a justification is recorded.
  7. SoD: the requester can't approve their own request; a user can't act on two steps.
  8. Bad IBAN checksum rejected in the UI and by the server.
  9. SAP failure (SAPFAIL-BANK) → SAP_ERROR with a plain-English message → admin fixes → retry → created
     once; a second retry returns ALREADY_CREATED.
  10. Expired invite → friendly page; requester resends.
  11. 5 wrong OTPs → locked.
  12. Disallowed file type and EICAR file rejected.
  13. Rejection → neutral vendor email; requester sees the reason.
- Accessibility: axe checks on every vendor portal step and the main internal pages, with no serious or critical
  issues.
- Report coverage. Aim for at least 85% lines on srv/ (excluding generated code).

FINAL PASS (do this after everything is green)
1. Fresh clone, then `npm install` and `npm run demo` on Windows PowerShell 5.1. Fix anything that needs a manual step.
2. Walk both journeys yourself in the browser as each persona. Fix rough UX: wording, empty states, loading
   states, error messages (plain English plus Technical details for admins only).
3. Re-read design §5, §6, §10 line by line and tick each requirement in docs/test-evidence.md (requirement →
   test name/screenshot), or list it as a gap.
4. Remove dead code and TODOs (or move them to docs/open-questions.md). Make sure lint and all tests are green.
5. ADR-001 conformance check.
   - package.json, mta.yaml and the code contain no BPA, Build Apps, Workflow, WDA/BSP or Gateway pieces.
   - Approvals run only through the CAP state machine.
   - ECC is reached only through the SAP adapter and a destination.
   - Write the result in docs/test-evidence.md.
6. Commit, then push `build/v1` to origin. Do not push to `main` and do not merge.
   - If `gh auth status` succeeds, open ONE new draft PR "VOB v1: end-to-end build" from build/v1 to main.
   - PR #1 was setup only and is already merged, so this is a new PR. Never push secrets.
   - If the push or gh fails, leave the commits local and say so in the hand-over.

GUARDRAILS
- No real SAP connections, no real credentials, no real emails sent, no real vendor or personal data.
  Use synthetic data only (e.g. "Acme Test Supplies Ltd", example IBANs such as IE29AIBK93115212345678 and
  GB82WEST12345698765432).
- Never commit secrets, .env files or default-env.json.
- Do not weaken a security control to make a test pass.
- Do not claim something works unless a test or your own run shows it. Mark anything unverified clearly.

HAND-OVER (your final message, then STOP)
Start with the line `READY FOR REVIEW`, then:
1. Summary of what was built (one paragraph) and the PR link or local branch.
2. How to run it (exact commands) and the persona logins.
3. Test results: counts per suite, coverage, Playwright scenarios 1-13 pass/fail, axe results, and where the
   screenshots are.
4. What is mocked, and what is needed to go live (from the runbook).
5. Every `VERIFY IN DEV` item, every deviation from the design, and the open questions.
6. ADR-001 conformance: confirm the build is Option 6 (CAP on BTP, approvals in the app), or list exactly where it
   is not and why.
7. Known gaps or risks, honestly stated.
````

---

## Historical Claude Code takeover (superseded 2026-11-27)

The owner returned project ownership to Codex because Claude Code has no available usage. Do not use the former takeover prompt; use the current workflow in [AGENTS.md](AGENTS.md).
