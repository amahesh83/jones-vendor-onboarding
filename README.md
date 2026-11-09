# Jones Vendor Onboarding (VOB)

Replaces the paper/PDF **FIN-010-IE01 Vendor Account Set up Form** (H. A. O'Neil Limited / Jones Engineering, company code IE01).

A Jones employee invites a vendor → the vendor opens a secure link, confirms a 6-digit email code and fills in a guided form → automatic checks (validation, duplicates in SAP and open requests) → Requester → Purchasing Manager → Procurement (30 days EOM only) → bank call-back → Financial Controller (with SAP simulation) → the vendor is created in SAP ECC automatically, and the filled FIN-010 PDF with the approval trail is attached.

**Platform:** one SAP CAP (Node.js) app on SAP BTP ([ADR-001](docs/decisions/ADR-001-platform-cap-on-btp.md)); custom, colourful web UI ([ADR-002](docs/decisions/ADR-002-custom-web-ui.md)).

## Run it (demo mode)

```bash
npm install
```

```bash
npm run demo
```

Open http://localhost:4004 (in SAP Business Application Studio: Ports: Preview → 4004).

Demo mode uses an in-memory database, a **mock SAP**, a **test mailbox** (nothing is sent) and synthetic data: 14 requests in every status. Data resets when the server restarts.

### Try the journey
1. Open **I work at Jones** and pick a person (e.g. *Rachel Requester*).
2. **＋ Invite vendor** → after sending, click **Open as the vendor**.
3. As the vendor, click **Email me a code**. The code is in the **Test mailbox** (staff app top menu).
4. Fill in the form, upload a PDF bank letter, submit 🎉
5. Switch person (top right) and approve each step: Rachel → Paddy → (Priya for 30 days) → Ben (record the call-back) → Fiona (simulate in SAP, then approve).

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
| `npm run demo` | Start with live reload and demo data |
| `npm test` | Unit + API journey tests (Node test runner) |
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

## Troubleshooting
- **npm install fails with a certificate error** (Zscaler): set `NODE_EXTRA_CA_CERTS` to the corporate root CA file. Never disable TLS checks.
- **"Unauthorized" on the BAS preview of /odata**: expected. Use the app's person switcher; the OData service needs the Auditor, Admin or FC role.
