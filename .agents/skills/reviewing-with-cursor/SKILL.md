---
name: reviewing-with-cursor
description: Use when a non-Cursor coding agent needs an independent design, code, or completion review and an authenticated local Cursor Agent CLI is already installed.
---

# Reviewing with Cursor

## Overview

Use Cursor as a read-only second opinion. The host reproduces findings before changing code.

## Applicability preflight

Use only when Cursor is an external reviewer:

1. Identify the host from runtime context. If the host agent is Cursor or unknown, stop; self-review is not independent.
2. The Cursor Agent CLI must be already installed and authenticated. Resolve `CURSOR_AGENT_BIN` or use `command -v agent`; require `agent --help` to contain `Start the Cursor Agent` and `agent status` to succeed. Never install, log in, or change authentication automatically.
3. Require a Git worktree; the helper uses private Git metadata.

On failure, do not run the helper. Report blocked or not applicable; use another reviewer only when authorized.

If Cursor reports `Workspace Trust Required`, tell the user to trust the worktree (for example with `--trust`) after explicit approval. Never do this automatically.

## Review modes

| Role | Session policy | Purpose |
|---|---|---|
| `design` | Reuse per worktree and stage | Preserve design decisions |
| `code` | New `review-id` per task or commit | Inspect the actual diff |
| `final` | New `review-id` after gates | Challenge completion afresh |

Do not reuse a chat across worktrees, branches, stages, or reviewer roles. Never use `--continue`; resume only an explicit chat ID.

## Workflow

1. Self-review first. Record design, scope, commits, tests, closed findings, and prohibited changes.
2. Read [references/review-prompts.md](references/review-prompts.md); write the applicable prompt to a temporary file.
3. Resolve this skill directory, then run:

```bash
python3 <skill-dir>/scripts/cursor_review_session.py run \
  --workspace <worktree> \
  --stage <stage-id> \
  --role design \
  --prompt-file <prompt.md>
```

For `code` and `final`, also pass a stable, unique `--review-id`, such as the task ID plus head SHA. The default model is `cursor-grok-4.6-xhigh`.

4. Cursor must stay read-only through `--mode ask`. Do not add `--force` or `--yolo`.
5. Mark each finding `confirmed`, `rejected`, or `deferred`. Confirm defects with reproduction or source/contract evidence. Fix only confirmed in-scope defects, run gates, then re-review with the same ID.
6. Before claiming a stage complete, use a new `final` review ID and reconcile its findings independently.

The helper stores chat IDs in the worktree's private Git metadata, uses explicit `--resume`, and serializes access to each chat. `--dry-run` prints commands without invoking Cursor or writing state.

## Required output contract

Ask Cursor for a `GO` or `NO-GO` verdict followed by P0-P3 findings. Each finding must include file/line, violated contract, evidence, trigger or reproduction, impact, and a focused test. No finding is accepted merely because Cursor reported it.

## Stop conditions

- Missing `agent`, authentication, authoritative design, or review range: report the blocker; do not invent evidence.
- Cursor proposes edits outside scope: reject or defer them explicitly.
- A long-lived design chat cites stale code: provide current commits and diff; rotate the stage chat if it remains confused.
