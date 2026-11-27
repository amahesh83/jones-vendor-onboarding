# Jones Vendor Onboarding (VOB)

**Current owner (2026-11-27):** Codex owns implementation, independent review and the authorized merge of [existing PR #2](https://github.com/amahesh83/jones-vendor-onboarding/pull/2). Continue on `build/v1`; do not rebuild or open a duplicate PR. Read [AGENTS.md](AGENTS.md), [current evidence](docs/test-evidence.md), and the [historical Claude handover](docs/CLAUDE_CODE_HANDOVER.md). Merge only after review and all required checks pass on the exact PR head. No production deployment or real SAP/BTP access is authorized.

Replaces the paper/PDF **FIN-010-IE01 Vendor Account Set up Form** (H. A. O'Neil Limited / Jones Engineering, company code IE01).

A Jones employee invites a vendor → the vendor opens a secure link, confirms a 6-digit email code and fills in a guided form → automatic checks (validation, duplicates in SAP and open requests) → a saved, configurable approval route (requester review by default, optional commercial checks, bank call-back and final Finance approval with SAP simulation) → the vendor is created in SAP ECC automatically, and the filled FIN-010 PDF with the approval trail is attached.

**Platform:** one SAP CAP (Node.js) app on SAP BTP ([ADR-001](docs/decisions/ADR-001-platform-cap-on-btp.md)); custom, colourful web UI ([ADR-002](docs/decisions/ADR-002-custom-web-ui.md)). Approval routes follow [ADR-003](docs/decisions/ADR-003-configurable-approval-routes.md). See the [demo and process guide](docs/demo-and-process-guide.md).

## Run it (demo mode)

```bash
npm install
```

```bash
npm run demo
```

Use Node.js 24 LTS. Open http://localhost:4004 (in SAP Business Application Studio: Ports: Preview → 4004).

Demo mode uses an in-memory database, a **mock SAP**, a **test mailbox** (nothing is sent) and synthetic data: 14 requests across the seeded routes and main lifecycle states. Data resets when the server restarts.

### Try the journey
1. Open **I work at Jones** and pick a person (e.g. *Rachel Requester*).
2. **＋ Invite vendor** → after sending, click **Open as the vendor**.
3. As the vendor, click **Email me a code**. The code is in the **Test mailbox** (staff app top menu).
4. Fill in the form, upload a PDF bank letter, submit 🎉
5. Follow **Route: …** on the request. By default: Rachel → Ben (record the call-back) → Fiona (simulate in SAP, then approve). Sub-contractors and 30 EOM also need Priya before Ben. Purchasing is used only if an admin adds it to a route.

### Demo people

| Person | Role |
|---|---|
| Rachel / Ronan Requester | Invite vendors, requester review |
| Paddy Purchasing | Purchasing Manager (also a requester) |
| Priya Procurement | Procurement approval for 30 days EOM |
| Ben Bankcheck | Bank call-back |
| Fiona Finance | Financial Controller |
| Adam Admin | Master data admin: SAP errors, configuration |
| Aoife Auditor | Read-only |

### Mock SAP test triggers
Company name containing `SAPFAIL-BANK` → bank unknown in SAP until *Create the bank in SAP* is ticked; `SAPFAIL-SIM` → simulation fails; `SAPDOWN` → SAP unreachable. VAT `IE6388047V` matches existing SAP vendor 100001 (duplicate demo).

## Scripts

| Command | Does |
|---|---|
| `npm run demo` | Start a stable demo server with in-memory data (no live-reload script; strict CSP stays intact) |
| `npm run watch` | Development watch mode; its cross-origin live-reload script is intentionally blocked by the application CSP |
| `npm test` | Unit + API journey tests (Node test runner) |
| `npm run e2e` | Playwright: original 13 scenarios plus demo/route journeys, with axe and 375/1280 px light/dark screen checks; starts `npm run demo` |
| `npm run e2e:report` | Open the browser-test report |
| `npm run lint` | ESLint, no warnings |
| `npm run lint:abap` | ABAP parser check; does not compile against ECC |
| `npm run package:abap` | Create the offline abapGit archive in `gen/zvob-abapgit.zip` |
| `npm run build:cap` | Compile production HANA/service content and copy the plain UI into gen/srv/app |
| `npm start` | Start without reload |
| `npm run build` | Build the BTP MTA archive (needs `mbt`) |

## Layout

```
app/            web UI: index.html, portal/ (vendors), internal/ (staff), assets/
srv/lib/        business logic: requests, workflow, validation, portal-auth, pdf, files, mail/, sap/
srv/routes/     JSON APIs: /api/portal, /api/internal, /api/dev (demo only)
srv/auth/       dev persona login (refuses to run in production)
db/             data model + configuration seed data
abap/           ZVOB REST API for ECC (draft, see docs/abap-install.md)
test/           automated tests
```

## Docs
- [Solution design](docs/01-solution-design.md) · [ADR-001](docs/decisions/ADR-001-platform-cap-on-btp.md) · [ADR-002](docs/decisions/ADR-002-custom-web-ui.md)
- [Deployment runbook](docs/deployment-runbook.md) · [ABAP install](docs/abap-install.md) · [Deviations](docs/deviations.md)
- [Demo controls and process guide](docs/demo-and-process-guide.md) · [SAP retry and audit delivery](docs/runtime-reliability.md)

## Browser checks

Run `npx playwright install chromium` once, then `npm run e2e`. The suite uses only synthetic data and the local test mailbox, saves screenshots under `docs/test-evidence/`, and keeps failure traces in `test-results/`. The HTML report includes axe findings. Production banking and email services are not used.

By default the suite owns its demo server on port 4004. Stop any existing server first. To explicitly test an already-running demo, set environment variable `VOB_REUSE_DEMO=1`. `PLAYWRIGHT_BROWSER=firefox` or `PLAYWRIGHT_CHANNEL=chrome` can select an installed supported engine/channel; the standard suite uses bundled Chromium.

## Troubleshooting
- **npm install fails with a certificate error** (Zscaler): set `NODE_EXTRA_CA_CERTS` to the corporate root CA file. Never disable TLS checks.
- **Playwright browser download has a certificate error:** Node.js 24 can use the Windows certificate store with `NODE_USE_SYSTEM_CA=1`, or set `NODE_EXTRA_CA_CERTS` to your corporate CA PEM. Keep TLS verification enabled. Managed Chrome/Edge may disallow remote debugging; do not change their policies. Use an approved Playwright test browser or the CI job.
- **"Unauthorized" on the BAS preview of /odata**: expected. Use the app's person switcher; the OData service needs the Auditor, Admin or FC role.
