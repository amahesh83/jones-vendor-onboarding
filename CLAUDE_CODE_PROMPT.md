# Retired Claude Code takeover prompt — Jones Vendor Onboarding

> **Retired 2026-11-27:** project ownership returned to Codex at the owner's request because Claude Code has no available usage. Do not execute this historical takeover. Current instructions are in [AGENTS.md](AGENTS.md).

```text
Take over Jones Vendor Onboarding end to end. The owner explicitly transferred completion ownership to Claude Code on 2026-11-10 because Codex will be unavailable. You are the implementing developer, not a review-only agent. Review, fix, test and finish the work yourself; do not send a fix prompt back to Codex or wait for Codex to return.

Open the existing Jones Vendor Onboarding project folder. Read, in order:
1. CLAUDE.md and AGENTS.md
2. docs/CLAUDE_CODE_HANDOVER.md
3. docs/decisions/ADR-001-platform-cap-on-btp.md, ADR-002-custom-web-ui.md and ADR-003-configurable-approval-routes.md
4. docs/deviations.md, docs/test-evidence.md, docs/01-solution-design.md, docs/demo-and-process-guide.md, docs/runtime-reliability.md, docs/abap-install.md and docs/deployment-runbook.md
5. CODEX_BUILD_PROMPT.md for the original acceptance scenarios; its old fixed-chain, UI5 and review-only instructions are superseded by the ADRs and this takeover.

Continue branch build/v1 in https://github.com/amahesh83/jones-vendor-onboarding. Reuse draft PR https://github.com/amahesh83/jones-vendor-onboarding/pull/2. Do not rebuild the app, create a duplicate PR or rewrite working code for style. Inspect local changes before editing and preserve unrelated user files.

The implementation checkpoint is a456354980c5fab4fbed50a5c278c4ae6ad549d1. CI run 42808148930 passed 28 Node tests, all 19 Playwright tests (15 journeys plus four viewport/theme screen checks), ESLint, ABAP parsing, production CAP build, MTA packaging and abapGit packaging. The handover commit after that checkpoint changes documentation only; do not confuse the verified checkpoint with a later untested code revision.

Finish the acceptance/security/UX review and fix anything you find. Verify configurable route priorities/conditions/default, requester review on/off, immutable saved routes, default one-business-approval and sub-contractor two-business-approval journeys, and Finance-owned call-backs. Check requester/one-person-one-step segregation, fresh call-backs after send-back, snapshot-based progress/emails/reminders/next-step text/process guide/FIN-010, route editor validation and demo-fill controls being hidden/refused in production. Keep the existing CSS/ui.js design system, no UI framework, and script-src 'self'.

Complete the outstanding fresh-checkout check, requirement-to-test mapping and coverage report. Review D3/D5/D7 honestly: durable application outbox and audit plugin are implemented; ABAP packaging and Unit source cases exist, but SAP semantic compilation/ABAP Unit execution, WHT mapping, ECC idempotency and live BTP Audit Log delivery remain unverified. Keep VERIFY IN DEV markers. Review remaining deviations and Jones configuration questions using the existing defaults; do not invent business values or claim mocks prove live SAP behaviour.

Use Node 24. Run npm ci, npm run lint, npm test, npm run lint:abap and npm run e2e. Use npm run build:cap to stage the plain UI as well as service/HANA content. Run npm run build in BAS/Linux with MBT and GNU make; the verified CI run already proved MTA packaging. Use npm run package:abap for the offline SAP import ZIP. See the handover for the Windows Node/TLS/browser details and existing local reports.

Update evidence, deviations, open questions, runbooks and PR #2 with actual findings/results. Push fixes to build/v1. Keep the PR unmerged under the current build brief unless the owner gives a subsequent merge instruction. No real SAP connections, credentials, emails or vendor data under the current guardrails. Prepare concrete deployment artifacts and simple click-by-click BAS/BTP guidance; clearly identify external prerequisites. Continue independently until the authorised work is complete or a genuine external dependency requires the owner. Keep updates concise and explain the next user action simply.
```
