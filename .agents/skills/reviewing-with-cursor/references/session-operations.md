# Cursor review session operations

## Durable reports and tree identity

`--output-file <report.md>` atomically writes the Cursor output with the workspace,
branch, chat ID, Cursor exit code, and before/after tree fingerprints. Without this
option, output is terminal-only; the helper does not implicitly create a file under
`.codex`.

The fingerprint covers HEAD, staged and unstaged binary diffs, and the bytes of
untracked files. If inputs change while Cursor runs, the helper returns exit code 3.
Discard that verdict and rerun on the stable tree.

## Silent-run monitoring

- Every 15 silent seconds, confirm the original Cursor process is alive and report
  its PID and elapsed silence.
- After 60 silent seconds, periodically `--resume` the same explicit chat ID with a
  read-only request for three facts: completed work, current execution/wait, and
  remaining work. Only one progress query runs at a time.
- If the live query fails or times out, fall back to process state plus
  `agent status --format json`. Authentication alone is not proof that the review is
  progressing.

The installed Cursor CLI permits the live progress query while the original request
continues. Keep it read-only and status-only; do not ask the progress query to restart,
change scope, or modify files.

Tune or disable checks with `--output-check-seconds` and
`--session-inspect-seconds`; `0` disables the corresponding check.

## On-demand inspection and recovery

Use the same workspace, stage, role, and review ID:

```bash
python3 <skill-dir>/scripts/cursor_review_session.py inspect \
  --workspace <worktree> --stage <stage-id> --role final --review-id <id>
```

This reports stored session metadata, current branch/tree fingerprint, and CLI
authentication without changing the review. If the original process exited, resume
only the stored explicit chat ID; never use `--continue`.
