# Deployment runbook (BTP Cloud Foundry)

## 1. Subaccount and entitlements (open question Q12)
Cloud Foundry runtime (≈1 GB), SAP HANA Cloud database plus an HDI container (`hana` / `hdi-shared`), Authorization & Trust (`xsuaa application`), Destination (`lite`), Connectivity (`lite`), Malware Scanning (`clamav`), and a write-capable Audit Log service instance named `vob-audit-log`. The MTA binds that existing Audit Log instance; provision it before deployment and verify the account's supported write-service plan.

Jones uses shared application subaccounts: **Jones Applications Non-Prod** with `vob-dev` and later `vob-qas` spaces; **Jones Applications Prod** with `vob-prd`. Assign separate service instances, credentials and app roles per environment. Space membership controls deployments; identity trust and other subaccount-wide settings affect every project in that subaccount.

## 2. Identity (Q13)
- IAS tenant trusting Entra ID; establish trust between the subaccount and IAS.
- Assign the role collections from `xs-security.json` (`VOB_Requester`, `VOB_PurchasingManager`, `VOB_ProcurementApprover`, `VOB_BankVerifier`, `VOB_FinancialController`, `VOB_MasterDataAdmin`, `VOB_Auditor`), ideally mapped from Entra groups.
- Vendors never get accounts: the App Router serves `/portal/` and `/api/portal/` without login (`approuter/xs-app.json`).

## 3. Destinations
| Name | Type | Target |
|---|---|---|
| `VOB_ECC` | OnPremise via Cloud Connector, basic auth (technical user) | `http://<virtual-host>:<port>` + path `/sap/zvob/v1` (or a CPI pass-through iFlow with the same contract) |
| `VOB_GRAPH` | Internet, OAuth2ClientCredentials (Entra app registration with `Mail.Send`) | `https://graph.microsoft.com` |

Step-by-step BAS/BTP instructions and the list of external prerequisites are in [btp-setup-guide.md](btp-setup-guide.md). With the `[production]` profile the app uses the real SAP adapter (`VOB_ECC`) and Graph mail (`VOB_GRAPH`). Both mocks refuse to run in production, so both destinations are needed for a usable deployment. Graph send failures surface as a failed action (HTTP 424); fix the destination or sender configuration before retrying, and do not assume the invite or approval step completed. If a vendor is already created but a created-number email exhausted retries, open **Admin → Email failures** and retry the email; this does not call SAP again.

## 4. Configuration after the first deploy
Admin page → Configuration: payment-term SAP keys (Q1), reconciliation accounts per account group (Q2), `portalBaseUrl` (public URL of the App Router), `senderAddress` (Q14), approver directory emails.

Admin-editable configuration (Settings, ApprovalRoutes, PaymentTerms, AccountTypes, DocumentTypes, CompanyCodes, RoleDirectory) is **not** HDI table data. On start-up the app inserts starting values from `srv/seed/` only into empty tables, plus any missing setting names. Later deploys therefore never overwrite business-maintained values ([deviation D10](deviations.md)). The role directory is never seeded in production. After the first deploy, open **Admin → Configuration → Approver directory**, add at least one real mailbox for Purchasing, Procurement, Bank Check, Finance and Admin, and confirm the missing-recipient warning is gone. Do this before live approvals; empty pools have no approver mail target. The app prevents removing the last recipient in a pool. To change a starting value in an existing environment, change it in the app, not in the CSV.

Admin → Approval routes: confirm the ADR-003 starting routes with the business, keep an active conditionless default and Finance last. Requester review defaults to on. SEPARATE bank checks are the default; IN_FINANCE requires explicit low-risk acceptance and removes the two-person bank check. Test representative IE/GB vendors before accepting changes. Existing requests retain their saved routes.

Numeric timing settings are whole numbers with server-side bounds: invite expiry 1–365 days; OTP expiry 1–60 minutes; OTP attempts 1–10; OTP lock 1–1440 minutes; vendor session 5–1440 minutes; reminders 1–30 working days; escalations 1–90 working days; and closed-request retention 1–120 months. A rejected value is not saved.

## 5. Build and deploy
```bash
npm ci
```
```bash
npm run build
```
```bash
cf deploy gen/vob.mtar
```

## 6. Go-live checklist
- [ ] ABAP package installed and every `VERIFY IN DEV` item closed (docs/abap-install.md)
- [ ] Test SAP connection green in each landscape (DEV → QAS → PRD)
- [ ] One vendor per account group created in QAS and checked in XK03
- [ ] Graph email tested with an internal mailbox
- [ ] Role collections assigned; segregation of duties tested with real users
- [ ] `NODE_ENV=production` (set in mta.yaml); dev login and mocks refuse to start in production
- [ ] `vob-audit-log` bound; reveal a synthetic bank record in QAS and verify a SensitiveDataRead event in Audit Log retrieval
- [ ] Durable database migrated with SapCreationJobs and CAP audit outbox tables; restart a QAS worker with pending work and check recovery without duplicate SAP creation
- [ ] ApprovalRoutes and VendorRequests.routeSnapshot migrated. Check in QAS that an admin route/setting change survives a second `cf deploy`. The build already contains no `.hdbtabledata` for admin-editable tables (verified locally in `gen/db`); only Countries, Currencies and WithholdingCodes remain deployment-managed
- [ ] Admin → Configuration → Approver directory has at least one verified real recipient for Purchasing, Procurement, Bank Check, Finance and Admin; no missing-recipient warning remains
- [ ] Staff UI saves still work after the App Router session times out. The UI re-fetches the CSRF token on `403 x-csrf-token: Required` and retries once; verify this with real XSUAA login
- [ ] Run `npm run build:cap` to compile HANA/service content and stage the plain app assets; verify app/ and the FIN-010 template exist under gen/srv before MTA packaging
- [ ] Demo fill controls absent, and `/api/dev/example` plus `/api/portal/demo-fill` return 404 in the production profile
- [ ] Use Node.js 24; MTA packaging needs the MBT binary and GNU make (available on the Linux CI runner). A successful CAP build alone is not a completed MTA archive
