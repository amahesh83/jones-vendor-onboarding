# Claude Code project notice

Read `AGENTS.md` first.

On 2026-11-27 the owner transferred continuation/completion back to Codex because Claude Code has no available usage. This file remains only because Claude Code loads it automatically. Do not start a competing implementation; follow the current branch and ownership instructions in `AGENTS.md` if Claude Code is used again.

ADR-001 (CAP on BTP), ADR-002 (plain HTML/CSS/JS) and ADR-003 (configurable, snapshotted approval routes) remain authoritative. Preserve strict CSP, server-side authorisation and segregation of duties. Use synthetic data only and retain every `VERIFY IN DEV` marker until genuinely verified.

The former handover is retained for historical context in `docs/CLAUDE_CODE_HANDOVER.md`. Preserve unrelated user files, including `.claude/launch.json`.
