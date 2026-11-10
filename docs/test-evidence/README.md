# Validation evidence at Claude Code handover

Implementation checkpoint: `a456354980c5fab4fbed50a5c278c4ae6ad549d1`.

[Full successful CI run #6](https://github.com/amahesh83/jones-vendor-onboarding/actions/runs/42808148930): 28 Node tests and 19 Playwright tests passed, ESLint passed, ABAP parser checked 14 files with zero issues, CAP production/UI staging passed, MTA archive generation passed, offline abapGit packaging passed.

Download **vob-test-evidence** (artifact ID `13761936630`) from that run for the complete HTML/JSON report, screenshots, axe attachments and abapGit ZIP. Playwright includes 15 journeys and four viewport/theme traversals at 375 and 1280 px in light/dark. Each traversal covers 34 screen states, including route editing warnings and Finance-owned call-backs. Serious/critical axe issues fail the tests. The sandboxed email-preview content cannot run axe; its shell and accessible title are checked without relaxing the sandbox. Mailbox screenshots mask short-lived demo authentication data.

Local PNGs are generated, untracked evidence from multiple runs. The latest local JSON report contains only three passing targeted checks, not the full suite. Use the CI artifact as the versioned full-run evidence. Do not commit screenshots containing tokens/OTPs or infer a full-suite result from a targeted rerun.

No live SAP/BTP integration, ECC semantic compilation or ABAP Unit execution is claimed. Coverage measurement, a fresh-checkout smoke test and a complete requirement mapping remain outstanding. See [the handover](../CLAUDE_CODE_HANDOVER.md) and [acceptance mapping status](../test-evidence.md).
