---
name: reviewing-with-cursor
description: Use when a non-Cursor coding agent needs an independent design, code, or completion review and an authenticated local Cursor Agent CLI is already installed.
---

# Reviewing with Cursor

Use Cursor as a read-only second opinion. The host reproduces findings before changing code.

## Applicability preflight

1. Identify whether the host agent is Cursor. If it is Cursor or unknown, this is not independent.
2. The CLI must be already installed and authenticated. Resolve `CURSOR_AGENT_BIN` or `command -v agent`; require `agent --help` to contain `Start the Cursor Agent` and `agent status` to succeed. Never install or log in automatically.
3. Require a Git worktree because the helper uses private Git metadata.

On failure, do not run the helper. If Cursor reports `Workspace Trust Required`, request explicit approval before suggesting `--trust`; never add trust automatically.

## Review modes

| Role | Session policy | Purpose |
|---|---|---|
| `design` | Reuse per worktree/stage | Preserve decisions |
| `code` | New `review-id` per task/commit | Inspect the diff |
| `final` | New `review-id` after gates | Challenge completion afresh |

Never reuse a chat across worktrees, branches, stages, or roles. Never use `--continue`; use explicit `--resume` only.

## Workflow

1. Self-review. Record scope, commits, tests, closed findings, and prohibited changes.
2. Read [review-prompts.md](references/review-prompts.md) and write the smallest applicable prompt.
3. Run:

```bash
python3 <skill-dir>/scripts/cursor_review_session.py run \
  --workspace <worktree> --stage <stage-id> --role design \
  --prompt-file <prompt.md> --output-file <report.md>
```

For `code` and `final`, add a stable unique `--review-id`. `--output-file` is optional and atomic. Cursor stays read-only through `--mode ask`; never add `--force` or `--yolo`.

4. Disposition every finding as `confirmed`, `rejected`, or `deferred`. Reproduce confirmed defects, fix only in-scope defects, rerun invalidated gates, then use the narrow follow-up prompt with the same ID.
5. Before completion, use a fresh `final` review ID and independently reconcile its findings.

The helper fingerprints review inputs and rejects verdicts after tree drift. It also monitors silent runs and can query live progress through the same chat. Read [session-operations.md](references/session-operations.md) for reports, liveness checks, `inspect`, and recovery.

## Required output contract

Any unresolved P0/P1 or unmet required gate means `NO-GO`. `GO` may retain only explicitly non-blocking, tracked P2/P3 items. Each finding includes file/line, contract, evidence, reproduction, impact, and focused test. Cursor's claim alone is not proof.

## Stop conditions

- Missing CLI, authentication, authority, or review range: report the blocker.
- Out-of-scope edits: reject or defer them.
- Stale long-lived chat: provide current commits/diff; rotate it if confusion remains.
