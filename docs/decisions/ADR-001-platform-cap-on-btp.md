# ADR-001: Build vendor onboarding as a CAP application on SAP BTP

| | |
|---|---|
| Status | **Accepted** |
| Date | 2026-11-09 |
| Decided by | Project owner (Jones SAP team) |
| Replaces | Paper/PDF form FIN-010-IE01 Vendor Account Set up Form |
| Design | [`docs/01-solution-design.md`](../01-solution-design.md), Option 6 in §3 |
| Applies to | v1 and later, until a new ADR supersedes it |

## Decision

Jones Vendor Onboarding (VOB) is built as **one SAP CAP application (Node.js, plain JavaScript) on SAP BTP Cloud Foundry**:

- **Vendor portal:** SAPUI5 freestyle app. Vendors have no SAP or IAS account; they sign in with an invite link plus a one-time code sent to their email.
- **Internal app:** SAPUI5 Fiori elements (OData V4). Jones staff sign in with single sign-on: XSUAA, trusting IAS, trusting Entra ID.
- **Approvals run inside the app.** A CAP-native state machine driven by configuration tables handles the steps: Requester, Purchasing Manager, Procurement for 30 days EOM, bank call-back, Financial Controller.
- **Vendor creation:** after the final approval, the app creates the vendor in **ECC IE01** through a thin ABAP REST API (package `ZVOB`) that wraps `VMD_EI_API`. This produces the same vendor record as XK01.
- **Connection to ECC:** the app reaches ECC only through a BTP destination and the Cloud Connector. ECC never faces the internet.
- **Local build:** SAP, email and file scanning sit behind adapters, so the whole application runs and is tested on a laptop with mocks.

This is **Option 6** in the design. **Option 6b (approvals in SAP Build Process Automation and/or ECC traffic through CPI) is not used in v1.**

## Why

1. **Easiest for vendors.** There is no account or password; the form is guided, checks entries as you type, saves automatically and works on a phone.
2. **Easiest for approvers.** They work in one app with one "Waiting for me" list, open a request from an email link and approve it in one click.
3. **Trackable.** One page shows the status, who the request is waiting on, how long it has been in each step, a full timeline and an append-only audit log.
4. **Secure.** ECC stays private, and the only path in is the outbound Cloud Connector tunnel to one narrow API.
5. **Codex can build and test all of it.** Everything is code, SAP is mocked, and every journey is covered by automated tests.
6. **Clean core and ready for S/4HANA.** The only ABAP is a small wrapper around the standard vendor API. At S/4 conversion it is swapped for `API_BUSINESS_PARTNER` and the app does not change.

## Options rejected

| Option | Why not |
|---|---|
| Web Dynpro ABAP / FPM, BSP, UI5 on the ECC Gateway | ECC (or its Gateway) would have to accept traffic from the internet, the UX is dated, and none of it can be built or tested away from the SAP system. |
| SAP Build Process Automation forms + workflow, or Build Apps | No anonymous or public forms, so every vendor would need a login, and external logins count for licensing. The forms are weak for IBAN, tax and document rules, and they are built in the browser, so Codex cannot build or test them. |
| **6b: CAP + BPA approvals and/or CPI** | Approvals would move to a second inbox and monitor, so tracking is split across two places, and part of the solution would be browser-built and untestable as code. Not needed for v1. |
| Ariba SLP / Supplier Management | Only sensible if the current Ariba contract already includes it. Otherwise it is a large subscription for one form. |
| SAP MDG for Suppliers | Needs an extra licence, and vendor self-service still requires SLC or Ariba. |
| Power Pages + Power Automate + SAP ERP connector | A second integration stack beside BTP, it needs an on-premise data gateway, and it is harder to build and test as code. |
| E-signature web form + manual XK01 | No automatic SAP creation. Only a stop-gap. |

## Consequences

- **In scope for v1:**
  - the CAP app and both UIs;
  - the ABAP package `ZVOB`, delivered in abapGit format;
  - BTP deployment artefacts (`mta.yaml`, `xs-security.json`, App Router);
  - CI.
- **Not to be introduced:**
  - BPA or Build Apps;
  - SAP Business Workflow;
  - Web Dynpro or BSP;
  - an OData service on the ECC Gateway;
  - Power Platform;
  - a message broker, microservices or multitenancy.
- **CPI stays a deployment option, not a build item.** The SAP adapter calls a configurable BTP destination using the JSON contract in design §9. If the Jones/EY architecture later requires CPI in front of ECC, the destination is pointed at a CPI iFlow that passes the same contract through, with no code change. That iFlow would be separate work.
- **Needed from Jones:**
  - BTP entitlements: Cloud Foundry runtime, HANA Cloud or PostgreSQL, Object Store, Malware Scanning, Audit Log, Destination, Connectivity;
  - an IAS tenant trusting Entra ID;
  - a Cloud Connector mapping to `/sap/zvob/v1` only;
  - an ECC technical user with minimal authorisations;
  - a Microsoft Graph app registration or an SMTP relay for email.

  See design §13 Q12–Q14.
- **Delivery model (updated 2026-11-27):** Codex owns the existing implementation, development fixes, independent review, required checks and authorized merge of existing PR #2. The owner explicitly superseded the former one-pass Codex / Claude-review-only arrangement and the later Claude takeover. Continue the existing `build/v1` branch; do not rebuild from scratch. Merge only after independent review and all required checks pass on the exact PR head. This does not authorize production deployment or real SAP/BTP access.

## Revisit only if

- The Jones/EY BTP architecture board **mandates** BPA for all workflows. That would need a new ADR to move the approval steps; the state machine's step configuration is the seam.
- Jones confirms that the Ariba contract already includes SLP or Supplier Management.
- The S/4HANA conversion date moves into the v1 timeline. In that case the ABAP API is replaced by `API_BUSINESS_PARTNER` and the ADR is updated.

Changing this decision requires a new ADR that supersedes this one. Developers (including Codex) must not reopen it on their own: record any concern in `docs/deviations.md` and carry on.
