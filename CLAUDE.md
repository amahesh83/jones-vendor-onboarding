# Claude Code entry point

Read `AGENTS.md` first, then `docs/CLAUDE_CODE_HANDOVER.md` and `CLAUDE_CODE_PROMPT.md`.

The project owner transferred full continuation/completion ownership to Claude Code on 2026-11-10. Continue the existing `build/v1` implementation and draft PR #2. Review and fix issues yourself; the old review-only / return-a-Codex-fix-prompt workflow is superseded. Do not restart the build.

ADR-001 (CAP on BTP), ADR-002 (plain HTML/CSS/JS) and ADR-003 (configurable, snapshotted approval routes) remain authoritative. Preserve strict CSP, server-side authorisation and segregation of duties. Use synthetic data only and retain every `VERIFY IN DEV` marker until genuinely verified.

The handover records tested results, unfinished acceptance work, local environment details and external deployment dependencies. Check current Git/CI state before assuming an old report describes the latest checkout. Preserve unrelated user files, including `.claude/launch.json`.
