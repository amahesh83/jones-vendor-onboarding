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

## 4. Configuration after the first deploy
Admin page → Configuration: payment-term SAP keys (Q1), reconciliation accounts per account group (Q2), `portalBaseUrl` (public URL of the App Router), `senderAddress` (Q14), approver directory emails.

Admin → Approval routes: confirm the ADR-003 starting routes with the business, keep an active conditionless default and Finance last. Requester review defaults to on. SEPARATE bank checks are the default; IN_FINANCE requires explicit low-risk acceptance and removes the two-person bank check. Test representative IE/GB vendors before accepting changes. Existing requests retain their saved routes.

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
- [ ] ApprovalRoutes and VendorRequests.routeSnapshot migrated; preserve existing configuration on later deploys (review HDI seed-table behaviour). Do not overwrite business-maintained routes with seed CSVs
- [ ] Run `npm run build:cap` to compile HANA/service content and stage the plain app assets; verify app/ and the FIN-010 template exist under gen/srv before MTA packaging
- [ ] Demo fill controls absent, and `/api/dev/example` plus `/api/portal/demo-fill` return 404 in the production profile
- [ ] Use Node.js 24; MTA packaging needs the MBT binary and GNU make (available on the Linux CI runner). A successful CAP build alone is not a completed MTA archive
