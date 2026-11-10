# Validation evidence

## Claude Code completion pass (2026-11-10)

Local runs were on Windows 11 with Node 24.22.2; the last row is the authoritative CI run:

| Check | Result |
|---|---|
| Fresh checkout of `67f2399` in an empty folder: `npm ci`, lint, tests, ABAP parse, `build:cap`, `package:abap` | All passed (28/28 tests at that commit) |
| `npm test` | **33 passed, 0 failed** (adds reclassification, route-editor, config-seeding, retention and privacy-link tests) |
| `npm run coverage` (`srv/**`) | 92.1 % lines, 73.4 % branches, 83.6 % functions. `sap/http.js` and `demo.js` are not loaded by Node tests; see [test-evidence.md](../test-evidence.md) |
| `npm run lint` | Passed, zero warnings |
| `npm run lint:abap` | 0 issues, 14 files (parser only, not SAP compilation) |
| `npm run build:cap` | Passed. `gen/db` has table data only for Countries/Currencies/WithholdingCodes; `gen/srv/srv/seed` and the staged UI are present |
| `npm run package:abap` | Passed (`gen/zvob-abapgit.zip`) |
| `npm run e2e`, full suite | **All 15 journeys passed**, plus the 375-light and 1280-light screen traversals. The two dark traversals failed with `ERR_NETWORK_IO_SUSPENDED` and timeouts while another project's Playwright suite was loading the same laptop. Re-run: 1280-dark **passed**; for 375-dark see the next line |
| **GitHub CI on `1cceb73`**, [run 42857157309](https://github.com/amahesh83/jones-vendor-onboarding/actions/runs/42857157309) (authoritative, clean Linux) | **All green:** lint, ABAP parser (0 issues/14 files), **33/33 Node tests**, **19/19 Playwright tests (7.3 min) including all four screen traversals**, `build:cap`, `npm run build` (`gen/vob.mtar` generated), `package:abap`. Artifact `vob-test-evidence` ID 13783278524 |

The earlier flaky failures (axe contrast in journeys 04/05 and `ECONNRESET` in 375-dark) were traced to real causes and fixed:
- axe ran while entrance animations were still fading in; it now waits for them to finish.
- Node's 5-second keep-alive timeout closed sockets the client was about to reuse; the server now keeps them for 65 seconds, matching CF gorouter practice.

Journeys 04 and 05 passed on every run after these fixes.

## Implementation checkpoint before takeover

`a456354` passed [CI run #6](https://github.com/amahesh83/jones-vendor-onboarding/actions/runs/42808148930): 28 Node tests, 19 Playwright tests, ESLint, ABAP parser, CAP build, MTA archive and abapGit packaging. Its artifact `vob-test-evidence` holds the HTML/JSON report, screenshots and ABAP ZIP.

## Limits

- Screenshots in `375-*`/`1280-*` folders are generated locally and not committed. Mailbox screenshots mask codes and links, but inspect them before sharing.
- Axe gates serious and critical issues only. The sandboxed email preview is excluded from injection; its shell and title are checked. This is not a WCAG certification.
- Nothing here exercises real SAP, BTP, XSUAA/IAS, Graph, the BTP malware scanner or Audit Log delivery.
