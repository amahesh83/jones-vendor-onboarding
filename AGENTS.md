# AGENTS.md: Jones Vendor Onboarding (VOB)

Standing rules for every coding agent (Codex, Claude) working in this repository. Read this first.

## What this is

VOB replaces the paper/PDF form **FIN-010-IE01 Vendor Account Set up Form** (H. A. O'Neil Limited / Jones Engineering, company code IE01). The flow is:

1. A Jones employee invites a vendor.
2. The vendor completes a guided online form.
3. The request goes through the Jones approvals.
4. The vendor is created automatically in SAP ECC (the same record as XK01).

## Platform decision (do not change)

**Option 6: one SAP CAP application on SAP BTP, approvals in the app.** It was decided by the project owner on 2026-11-09 and is recorded in [`docs/decisions/ADR-001-platform-cap-on-btp.md`](docs/decisions/ADR-001-platform-cap-on-btp.md).

- **Application:** SAP CAP (Node.js, plain JavaScript) on BTP Cloud Foundry, behind a standalone App Router.
- **Vendor portal:** SAPUI5 freestyle app. Vendors sign in with an invite link plus an email one-time code. Vendors never get SAP or IAS accounts.
- **Internal app:** SAPUI5 Fiori elements (OData V4). Staff sign in with XSUAA, trusting IAS, trusting Entra ID.
- **Approvals:** a CAP-native state machine driven by configuration tables.
- **ECC:** reached only through the SAP adapter, then a BTP destination, then the Cloud Connector, then ABAP package `ZVOB` (REST, wrapping `VMD_EI_API`). The ABAP uses 7.50 syntax only (ECC 6.0 EHP8).
- **Not used:**
  - SAP Build Process Automation or Build Apps (Option 6b is not in v1);
  - SAP Business Workflow;
  - Web Dynpro or BSP;
  - Gateway/OData services in ECC;
  - Power Platform;
  - message brokers, microservices or multitenancy.
- **CPI:** only a possible deployment-time route (the destination points at a pass-through iFlow). Keep the adapter contract in design §9 destination-agnostic and build nothing CPI-specific.
- **Changing the decision:** do not reopen it on your own. Write any concern in `docs/deviations.md` and carry on. Only a new ADR approved by the project owner can supersede ADR-001.

## Working model (do not change)

1. **Codex builds the whole v1 end to end in one pass:** build, test, final pass. The brief is [`CODEX_BUILD_PROMPT.md`](CODEX_BUILD_PROMPT.md).
2. Codex hands over with a final message starting `READY FOR REVIEW`, then stops.
3. **Claude does one review and test pass**, then gives one Codex fix prompt.
4. There are no mid-build review cycles, label loops or hand-off brokers.

## Sources of truth

1. [`docs/decisions/`](docs/decisions/): architecture decisions (ADR-001 and any later ones).
2. [`docs/01-solution-design.md`](docs/01-solution-design.md): the design, covering journeys, workflow, field mapping, the ECC contract, security and open questions.
3. [`reference/FIN-010-IE01-Vendor-Account-Setup-Form.pdf`](reference/FIN-010-IE01-Vendor-Account-Setup-Form.pdf): the form being replaced, which is also the PDF template the app fills.

Questions only Jones can answer: use the default in design §13, add the question to `docs/open-questions.md`, and keep going.

## Guardrails

- No real SAP connections, credentials, emails, or vendor or personal data. Use synthetic data only, for example "Acme Test Supplies Ltd", `IE29AIBK93115212345678` or `GB82WEST12345698765432`.
- Never commit secrets, tokens, `.env*` files or `default-env.json`.
- Never weaken a security control to make a test pass.
- Never claim something works unless a test or a run shows it; mark anything unverified.
- Mark every ABAP name you are not certain of with `" VERIFY IN DEV:` and list it in `docs/abap-install.md`.

## Windows / shell

- The developer machine uses **Windows PowerShell 5.1**:
  - `&&` and `||` are parse errors, so use `;`;
  - there are no Unix tools (`grep`, `head`, `which`, ...);
  - the execution policy is `Restricted`, so run scripts with `powershell -ExecutionPolicy Bypass -File <path>`.
- npm scripts must work both in PowerShell 5.1 and in Linux CI.
- The network is behind Zscaler. If npm or TLS fails, set `NODE_EXTRA_CA_CERTS`; never disable TLS checks.

## Commands

<!-- Codex: fill this section with the real npm scripts once they exist (demo, test, lint, build, e2e). -->
_Not built yet._
