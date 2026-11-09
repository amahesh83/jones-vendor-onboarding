# Jones Vendor Onboarding

Replaces the FIN-010-IE01 vendor account setup form for H. A. O'Neil Limited (Jones Engineering), company code IE01.

## Status

Repository setup and requirements only. The application, automated tests and deployment artefacts have not been built. There are no application commands to run yet.

## Agreed platform

One SAP CAP application (Node.js, plain JavaScript) on SAP BTP Cloud Foundry, with a SAPUI5 vendor portal and a Fiori elements internal application. Approvals run inside CAP. ECC integration uses an adapter, a BTP destination, Cloud Connector and the ZVOB ABAP REST API.

ADR-001 fixes this architecture. BPA and a CPI implementation are outside v1. CPI may later provide a pass-through route without changing the application contract.

## Project documents

- [Standing project rules](AGENTS.md)
- [Accepted platform decision](docs/decisions/ADR-001-platform-cap-on-btp.md)
- [Solution design](docs/01-solution-design.md)
- [Build brief and review prompt](CODEX_BUILD_PROMPT.md)
- [Original vendor form](reference/FIN-010-IE01-Vendor-Account-Setup-Form.pdf)

## Next development step

Implement the work packages in the build brief, starting with the supported Node.js runtime and CAP project foundation. Local development uses synthetic data, mock SAP and a local mailbox. BAS is optional for the local build.

Keep credentials, environment files and real vendor data out of Git. Preserve TLS verification on corporate networks; use NODE_EXTRA_CA_CERTS when a corporate certificate is required.
