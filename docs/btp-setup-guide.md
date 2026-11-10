# BAS and BTP setup: click by click

This is the plain-English path from "code in GitHub" to "the app running on BTP". It is a guide only: **nothing in it has been run against Jones's BTP account yet.** The detailed checklist stays in [deployment-runbook.md](deployment-runbook.md).

**Words used here:**
- **BAS** (Business Application Studio): SAP's browser-based code editor, where you build the app.
- **Cloud Foundry space**: a folder in your BTP subaccount that holds running apps and their services. It is like a client in SAP: separate data and users.
- **MTA archive** (`.mtar`): one zip file with the whole app (service, database content, login router). `cf deploy` installs it, a bit like importing a transport.
- **Service instance**: a BTP building block the app uses, for example the HANA database or the login service (XSUAA).

## Part A: things someone else must provide first (external prerequisites)

The app cannot be deployed until these exist. Each one needs a BTP or Jones administrator.

| # | What | Who usually does it | Why the app needs it |
|---|---|---|---|
| A1 | A Cloud Foundry space, e.g. `vob-dev` in **Jones Applications Non-Prod**, with you as *Space Developer* | BTP subaccount admin | Somewhere to deploy |
| A2 | Entitlements in that subaccount: Cloud Foundry runtime (≈1 GB), HANA Cloud `hdi-shared`, XSUAA `application`, Destination `lite`, Connectivity `lite`, Malware Scanning `clamav`, Audit Log (write plan) | BTP subaccount admin | The MTA creates these services; missing entitlements make `cf deploy` fail |
| A3 | A **SAP HANA Cloud** database instance **mapped to the space** (HANA Cloud Central → instance → *Instance Mapping* → add the Cloud Foundry org and space) | HANA / BTP admin | The app's HDI container lives in it |
| A4 | An Audit Log service instance named exactly **`vob-audit-log`** in the space (BTP cockpit → space → *Services* → *Service Marketplace* → *Audit Log Service* → *Create*, choosing the write-capable plan Jones has) | BTP admin | The MTA binds an existing instance with this name |
| A5 | Trust between the subaccount and Jones's **IAS** tenant, which itself trusts **Entra ID** | Identity / BTP admin | Staff sign in with Jones accounts |
| A6 | Role collections assigned to test users (`VOB_Requester`, `VOB_FinancialController`, …) after the first deploy | BTP admin | Without a role, staff see "not authorised" |
| A7 | Cloud Connector to ECC DEV, destination `VOB_ECC`, ZVOB package installed in ECC DEV | Basis + ABAP | The production profile uses the real SAP adapter, and the mock refuses to run in production. Without this the app starts, but every approved vendor ends in the **SAP errors** queue |
| A8 | An Entra app registration with `Mail.Send`, destination `VOB_GRAPH`, and the `senderAddress` mailbox | M365 admin | The production profile sends email through Graph, and the local test mailbox refuses to run in production. Without this, **vendors never receive their invite link or 6-digit code**, so they cannot start |

> **Important:** A7 and A8 are needed for a *usable* BTP deployment, not only a "live" one. A BTP deployment without them can only show the staff screens. A shareable *BTP demo* (mock SAP plus an in-app mailbox on BTP) is possible, but it is a separate, explicit decision by the project owner: it would mean deliberately allowing mocks in a cloud space that real people can reach. It has **not** been built.

## Part B: get the latest code into BAS

1. Open BAS and start your dev space (`ws-1lygj`). Wait for it to show **RUNNING**, then open it.
2. **Terminal → New Terminal**.
3. Go to the project folder (the usual clone location is shown; use yours if it differs) and get the latest code:
   ```bash
   cd ~/projects/jones-vendor-onboarding
   ```
   ```bash
   git checkout build/v1
   ```
   ```bash
   git pull
   ```
4. Install exactly the pinned packages:
   ```bash
   npm ci
   ```
5. Optional check that everything still works in BAS:
   ```bash
   npm test
   ```
   You should see `pass 31` and `fail 0`.

## Part C: try the demo in BAS (no BTP services needed)

1. `npm run demo`
2. BAS shows a pop-up **"A service is listening on port 4004"**. Click **Open in New Tab**.
3. Use the persona switcher (top right) to act as each person. Stop the demo with **Ctrl+C** in the terminal.

## Part D: build the deployable file

1. In the BAS terminal:
   ```bash
   npm run build
   ```
2. Wait for `gen/vob.mtar` to be written (a few minutes). BAS already has the MBT build tool and GNU make. This step failed on the Windows laptop for that reason and is expected to work in BAS; GitHub CI builds it successfully on Linux.

## Part E: deploy to the Cloud Foundry space

1. Log in to Cloud Foundry (EU10 shown, which matches the BAS URL):
   ```bash
   cf login -a https://api.cf.eu10.hana.ondemand.com --sso
   ```
   Open the link it prints, sign in, paste the temporary code back into the terminal, and pick the Jones Non-Prod org and the `vob-dev` space.
2. Deploy:
   ```bash
   cf deploy gen/vob.mtar
   ```
   This creates the HDI container, XSUAA, destination, connectivity and malware-scanner services, binds `vob-audit-log`, deploys the database and starts `vob-srv` and `vob-approuter`. A first run takes about 5–10 minutes.
3. Find the app URL:
   ```bash
   cf apps
   ```
   The `vob-approuter` route is the address staff and vendors use, for example `https://<org>-vob-dev-vob-approuter.cfapps.eu10.hana.ondemand.com`.

## Part F: first-time settings after the first deploy

1. In the BTP cockpit, assign yourself **VOB_MasterDataAdmin** (and any other roles you want to test): Subaccount → *Security* → *Role Collections* → open the collection → *Edit* → add your user.
2. Open the App Router URL. You land on the home page; click **Open the staff app** and sign in.
3. **Admin → Configuration**:
   - set `portalBaseUrl` to the App Router URL (vendor invite links use it);
   - add the real approver pools in the **role directory**. Production starts with an **empty** role directory on purpose: the demo's `@jones.test` people are never loaded there.
4. **Admin → Approval routes**: check the three starting routes with the business and press **Save routes**. Your changes are kept on later deploys. The app only inserts starting values into empty tables, and HDI no longer owns these tables (see deviation D10).
5. **Admin → SAP connection → Test**: green only once A7 is in place. Until then it says it could not reach SAP; that is expected.
6. Send yourself a test invite to an internal mailbox. It arrives only once A8 is in place. **Admin → Test mailbox is not available on BTP**, because emails really leave the app there.

## Part G: what is ready versus not ready

| Ready and tested | Not done or not verified |
|---|---|
| App, approvals, routes, vendor portal and PDF, all tested locally and in CI against mock SAP | No BTP deployment has been performed |
| CAP production build and MTA archive (built on Linux CI) | XSUAA/IAS/Entra login and App Router CSRF with real users |
| ABAP package ZIP for abapGit import | ABAP compile, ABAP Unit and every `VERIFY IN DEV` item in ECC DEV |
| Audit Log calls in code | Delivery to the real Audit Log service |
| Email templates and the local test mailbox | Real email through Microsoft Graph |
