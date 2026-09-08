# Three evaluation progress projection

This Host-only reader projects existing local run evidence to a public, bounded
`progress.json`. It does not submit jobs, invoke models, execute authored worlds,
or grant delivery acceptance.

```sh
node scripts/cloud/three-eval-progress.mjs \
  --run-root /absolute/path/to/primary-run \
  --attempt-run-root /absolute/path/to/authorized-retry-run \
  --live-status /absolute/path/to/primary-run/live-status.json \
  --output /absolute/path/to/existing-gallery/progress.json
```

`--attempt-run-root` can be repeated. Retry plans must retain the same selected
task, case hash, runtime hash and profile. Every attempt retains its own job and
timestamps. The output is written to a sibling temporary file and renamed last.
Scheduling and publication are separate Host responsibilities.

The exported function is
`buildThreeRunProgress({runRoot, attemptRunRoots = [], liveStatus = null, now = Date.now()})`.
Its schema is `three-creator-run-progress`, version 1. `phase` is one of
`running`, `queued`, `failed`, `delivered`, `unknown`. `stage` and event `stage`
use `queued`, `starting`, `authoring`, `preview`, `playtest`, `capture`,
`packaging`, `delivered`, `failed`, `unknown`; their fixed Chinese labels are
exported as `THREE_PROGRESS_STAGE_LABELS`.

Actual launcher/CLI evidence overrides stale provider queue counters. Tool and
operation events determine activity stages; elapsed time never advances a
stage. A finished CLI remains `packaging` until Host delivery validation passes.
Tool failures during a running attempt do not make the attempt terminal.
`completedAt` is only set from a recorded terminal timestamp. Missing times are
`null`; a poll's observation timestamp is never used as a tool's event timestamp.
Live snapshots may supply a bounded `events.operations` history; downloaded
local event streams also supply history. Operations are deduplicated by their
identity, preserving the latest recorded state and real timestamps, then sorted
chronologically. Missing timestamps stay null. The projection does not invent
missing events or reconstruct their timestamps.
A pending response with no operation type keeps the last valid observed stage,
with `awaitingToolResult: true` and `stageLabel: "等待工具返回"`; it does not
reset an active Agent to its initial startup stage.

Operation events and `toolSummary.latestOperation` separate `executionStatus`
(whether a tool call finished) from `resultStatus` (the returned check result).
A failed check produces a failed event even when execution succeeded. Sanitized
`resultSummary` retains only known result states, booleans and finite numeric
measurements. `playtestAdequacy` distinguishes `short-test`,
`invalid-recording`, `unverified`, and `complete`. A truncated debug run is
`short-test`; a complete episode requires captured input and finite positive
active/input/wall/video durations. Invalid timing evidence, including zero
duration, is `invalid-recording`. Missing evidence remains `unverified`.
These states report recording completeness; they do not determine core-function
coverage. A tool success with no result state is described only as a completed
call. Host delivery validation stays separate.

`failureFacts` retains only known, correctly paired Host layer/code facts with
fixed public wording. On terminal failures, verified Host facts take precedence
over generic execution errors; an opaque terminal diagnostic may fall back to
the latest failed operation, explicitly marked `latest-failed-operation`.
This describes observed evidence without claiming every earlier tool failure
caused the terminal result. Unknown diagnostics stay private.

The public file excludes raw reasoning, commands, source, file paths, tool
arguments, credentials, images and arbitrary error text. Inputs are bounded
regular files with no symbolic/hard links. Identity mismatches fail closed.
Public tool names, operation kinds, statuses and numeric progress use explicit
allowlists. This file is suitable for polling by the static gallery; the
publisher must still enforce run identity and reject stale updates.

Focused regressions: `node --test scripts/cloud/three-eval-progress.test.mjs`.
