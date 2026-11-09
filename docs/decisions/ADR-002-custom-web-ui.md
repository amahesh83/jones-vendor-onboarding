# ADR-002: Custom web UI instead of SAPUI5 / Fiori elements

| | |
|---|---|
| Status | **Accepted** |
| Date | 2026-11-09 |
| Decided by | Project owner (asked for a UI that is "fancy, intuitive, fun and beautiful, not bland") |
| Amends | ADR-001, UI bullets only. Platform (CAP on BTP, approvals in the app) is unchanged |

## Decision
Both apps (vendor portal and staff app) are plain HTML, CSS and JavaScript served by the CAP app from `app/`, with no UI framework and no build step:
- `app/assets/vob.css`: one design system (gradient brand, cards, chips, steppers, light and dark themes, reduced-motion support)
- `app/assets/ui.js`: small helpers (escaped HTML templates, API calls, toasts, modals, confetti)
- `srv/lib/validation.js`: the same validation rules run in the browser and on the server

The read-only OData V4 service `ReportingService` stays, so a Fiori elements list or Excel/Power BI reporting can be added later without touching the business logic.

## Why
- Fiori elements gives a standard, consistent SAP look, which is what the owner explicitly did not want.
- Freestyle SAPUI5 can be styled, but heavy custom theming fights the framework.
- No framework means no CDN, a strict Content Security Policy (`script-src 'self'`), nothing to upgrade, and fast pages on a phone.

## Consequences
- The internal app does not get Fiori launchpad features (personalisation, variants) for free. Saved views are fixed tabs instead.
- Developers need plain web skills, not UI5. The code is small (two files per app).
