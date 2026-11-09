# Deployment runbook (BTP Cloud Foundry)

## 1. Subaccount and entitlements (open question Q12)
Cloud Foundry runtime (≈1 GB), SAP HANA Cloud (`hdi-shared`), Authorization & Trust (`xsuaa application`), Destination (`lite`), Connectivity (`lite`), Malware Scanning (`clamav`). Optional: Audit Log.

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

## 5. Build and deploy
```bash
npm ci
```
```bash
mbt build -t gen --mtar vob.mtar
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
