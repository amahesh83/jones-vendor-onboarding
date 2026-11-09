# Deviations from the design and build brief

| # | Brief said | Built | Why |
|---|---|---|---|
| D1 | SAPUI5 vendor portal + Fiori elements internal app | Custom HTML/CSS/JS for both ([ADR-002](decisions/ADR-002-custom-web-ui.md)) | Owner asked for a fun, beautiful, not-bland UI |
| D2 | Object Store for documents | Documents stored in the database (`LargeBinary`) | Low volume (tens per month); one less BTP service. Swap later behind `srv/lib/files.js` |
| D3 | CAP persistent outbox for SAP calls | In-process background job with retries (0 s, 2 s, 5 s), then `SAP_ERROR` | Simpler; single instance. A crash during creation leaves status `CREATING` (admin can see it). Codex to harden |
| D4 | Mail adapters local / graph / smtp | local and graph only | SMTP needs nodemailer; Graph is the expected Jones route (Q14) |
| D5 | `@cap-js/audit-logging` | `@PersonalData` annotations present, plugin not installed; business audit table is used | Add the plugin when the Audit Log service is entitled |
| D6 | Playwright E2E (13 scenarios) + axe | API-level journey tests (`test/journey.test.js`) cover the scenarios; UI checked manually in the browser | Time. Playwright + axe left for Codex |
| D7 | ABAP in full abapGit format with ABAP Unit | `.abap` sources + install guide, not compiled; GOS attachment and IBAN duplicate check are stubs | No SAP system available; see `docs/abap-install.md` |
| D8 | Rate limits | In-memory per instance | Single instance; move to a shared store if scaled out |
| D9 | Reminder job lease in the DB | Interval timer per instance (`cds.requires.vob.jobMinutes`) | Single instance |
