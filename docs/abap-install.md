# ECC side: ABAP package ZVOB (install guide)

The CAP app talks to ECC only through the small REST API in `abap/src/`, reached via a BTP destination and the Cloud Connector. ABAP 7.50 syntax only (ECC 6.0 EHP8).

> **Status: first draft, not compiled.** It was written without access to an SAP system. Every line marked `VERIFY IN DEV` must be checked in SE11/SE24 on Jones DEV before transport. The CAP app is fully tested against the mock SAP, which implements the same contract.

## Objects

| Object | Purpose |
|---|---|
| `ZCL_VOB_REST_HANDLER` | ICF handler for `/sap/zvob/v1/`: `GET /ping`, `POST /duplicates`, `POST /vendors`, `GET /vendors/{lifnr}`, `POST /vendors/{lifnr}/attachments` |
| `ZCL_VOB_VENDOR_SERVICE` | Maps the JSON to `VMDS_EI_MAIN`, calls `VMD_EI_API=>MAINTAIN_BAPI` (test run or real), commits only when there are no errors; bank creation with `BAPI_BANK_CREATE` behind the `createMissingBank` flag |
| Table `ZVOB_REQLOG` (create in SE11) | `MANDT`, `REQUEST_ID` CHAR20 (key), `LIFNR`, `STATUS` CHAR10, `CREATED_BY`, `CREATED_ON`, `CREATED_AT`. Guarantees one vendor per request id |

## Install

1. Create package `ZVOB` and table `ZVOB_REQLOG` (fields above, delivery class A).
2. Create the two classes from `abap/src/*.clas.abap` (SE24 source mode, or abapGit with a generated XML wrapper).
3. Work through every `VERIFY IN DEV` item:
   - `/UI2/CL_JSON` availability (else replace with sXML JSON writer/reader)
   - `VMD_EI_API=>MAINTAIN_BAPI` parameter names and `VMDS_EI_*` structure/field names (bank IBAN field, purchasing `WEBRE`, withholding tax structure)
   - `BAPI_BANK_CREATE` parameter for update/test mode
   - how the new LIFNR is returned in `ES_MASTER_DATA_CORRECT`
   - IBAN duplicate check against `TIBAN`/`LFBK`
   - GOS attachment (`add_attachment` is a stub)
   - whether CVI/BP synchronisation is active (SAP KBA 3738190)
4. SICF: create node `/sap/zvob/v1` with handler `ZCL_VOB_REST_HANDLER`, logon via the technical user.
5. Technical user (system user) with only: `F_LFA1_APP`, `F_LFA1_GRP` (YBIV, YBCS, YBSP, YBVE), `F_LFA1_BUK` (IE01), `M_LFM1_EKO`, `F_BNKA_MAN`, GOS, `S_ICF`. Basis to confirm.
6. Cloud Connector: map a virtual host to ECC and expose **only** the path `/sap/zvob/v1/`.
7. BTP destination `VOB_ECC` (OnPremise, basic auth with the technical user, URL = virtual host).

## Test sequence in DEV

1. Admin page → **Test SAP connection** (calls `/ping`).
2. Simulate one vendor per account group (YBIV, YBCS, YBSP, YBVE) from the Finance step.
3. Create one test vendor per account group; check in XK03 (address, bank, company code IE01, purchasing org, payment terms).
4. Retry the same request: must return `ALREADY_CREATED`, no second vendor.
