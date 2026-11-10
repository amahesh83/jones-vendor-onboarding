# ECC side: ABAP package ZVOB (install guide)

The CAP app talks to ECC only through the small REST API in `abap/src/`, reached via a BTP destination and the Cloud Connector. ABAP 7.50 syntax only (ECC 6.0 EHP8).

> **Status: packaged sources, not compiled in SAP.** The abapGit package now includes class/interface descriptors, package metadata, the idempotency table and ABAP Unit sources. A local ABAP parser check is available, but is not an ECC compilation or an ABAP Unit execution. Every `VERIFY IN DEV` item must be checked in Jones DEV before transport.

## Objects

| Object | Purpose |
|---|---|
| `ZCL_VOB_REST_HANDLER` | ICF handler for `/sap/zvob/v1/`: `GET /ping`, `POST /duplicates`, `POST /vendors`, `GET /vendors/{lifnr}`, `POST /vendors/{lifnr}/attachments` |
| `ZCL_VOB_VENDOR_SERVICE` | Maps the JSON to `VMDS_EI_MAIN`, calls `VMD_EI_API=>MAINTAIN_BAPI` (test run or real), commits only when there are no errors; bank creation with `BAPI_BANK_CREATE` behind the `createMissingBank` flag |
| `ZCL_VOB_DUPLICATE_CHECK` / `ZIF_VOB_DUPLICATE_STORE` | Normalises the flat duplicate query and delegates persistence to an injectable interface; ABAP Unit uses a local store double |
| `ZCL_VOB_DUPLICATE_STORE` | LFA1 VAT/name-postcode and TIBAN/LFBK IBAN matches, merged per vendor |
| Table `ZVOB_REQLOG` | Included DDIC descriptor: `MANDT`, `REQUEST_ID` CHAR20 (key), `LIFNR`, `STATUS` CHAR10, `CREATED_BY`, `CREATED_ON`, `CREATED_AT`. Persisted with vendor creation in the same commit |

## Install

1. Create a transportable package `ZVOB` in DEV. Generate the offline abapGit ZIP using `npm run package:abap` on Windows PowerShell, or ZIP the **contents** of `abap/` (including `.abapgit.xml` and `src/`). The ZIP root must contain `.abapgit.xml`, not an enclosing `abap` folder.
2. In abapGit create an offline repository for `ZVOB`, import that ZIP, review and activate the DDIC table, interface, duplicate-store/check classes and vendor/REST classes. Do not try to use this repository root as an online ABAP-only repository: the abapGit root is the `abap/` export.
3. Work through every `VERIFY IN DEV` item:
   - `/UI2/CL_JSON` availability (else replace with sXML JSON writer/reader)
   - `VMD_EI_API=>MAINTAIN_BAPI` parameter names and `VMDS_EI_*` structure/field names (bank IBAN field, purchasing `WEBRE`, withholding tax structure)
   - `BAPI_BANK_CREATE` parameter for update/test mode
   - how the new LIFNR is returned in `ES_MASTER_DATA_CORRECT`
   - IBAN duplicate join against `TIBAN`/`LFBK`: bank control key, leading zeros and validity handling
   - GOS attachment (`SCMS_BASE64_DECODE_STR`, `SCMS_XSTRING_TO_BINARY`, `SO_FOLDER_ROOT_ID_GET`, `SO_DOCUMENT_INSERT_API1`, `BINARY_RELATION_CREATE_COMMIT`), their structures/parameters, `LFA1` object key, MIME/file handling, rollback and authorisations
   - `ENQUEUE_E_TABLE` generic table-lock key layout and lifetime for `ZVOB_REQLOG`; test concurrent requests with identical request IDs
   - vendor and request-log updates must participate in the same LUW; confirm the standard vendor API does not commit internally
   - all DDIC types in the payload and XML table metadata, especially contact and bank types
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
5. Run ABAP Unit for `ZCL_VOB_DUPLICATE_CHECK`: identifier normalisation, no database call for an empty query, and preservation of a blocking result. These tests use a store double and no real vendor data. Record actual test counts and results from DEV.
6. Simulate with a missing bank, then verify no BNKA/vendor/request-log change was committed. Simulate with each RCT/CIS setup; the withholding-tax mapping is still a `VERIFY IN DEV` integration gap and must be completed/validated before go-live.
7. Upload a synthetic PDF, verify GOS in XK03, force an attachment error and check HTTP/business error reporting. The REST attachment route must not report success on a failed result.
8. Inject a failure before the single commit and verify neither the vendor nor the request-log record persists. Repeat and run two concurrent calls; confirm one vendor number.

## Local verification limits

`npm run lint:abap` parses the exported source with the configured on-premise 7.50 language target. It does not resolve Jones-specific SAP structures or execute tests. Full semantic compilation, function-module signatures, account-group number assignment, withholding-tax mapping, attachment behaviour and live authorisations remain SAP DEV checks.
