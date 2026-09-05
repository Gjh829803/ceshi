# Experimental five-case cloud Creator runner

This launcher uses the existing LWDP `options.codex_bin` field. It does not add a
runtime profile or modify the deployed CLI, account homes or global environment.

Stage these files together in the unique FSx experiment directory:

- `creator-eval-launcher.mjs` (executable)
- `creator-eval-runtime.mjs`
- `creator-eval-mcp-bridge.mjs`
- `creator-eval-statistics.mjs`
- `runtime-lock.json` (same bytes as the local frozen lock)

The required runtime-lock fields are `schemaVersion: 1`, `status: "ready"`,
`launcherPath`, `toolkitRoot`, `browserRoot`, `codexBinary`, and
`codexBinarySha256`. The approved binary SHA-256 is
`f9d4eab23d0e0726340e084ed22d668885c1dcabeb29ec508b8962e5e29b8dc6`.
Optional `nodeBinary` defaults to `/codex-tools/bin/node`; optional
`maximumTaskSeconds` defaults to 2700. Include toolkit/browser content hashes in
the frozen lock so its raw-byte SHA-256 identifies the complete selected runtime.

`browserEnvironment` admits only `PLAYWRIGHT_BROWSERS_PATH`,
`WORLDKIT_CHROMIUM_EXECUTABLE`, `LD_LIBRARY_PATH`, `FONTCONFIG_PATH`,
`FONTCONFIG_FILE`, and `LANG`. Supply the actual staged capsule paths. The launcher
computes `WORLDKIT_CREATOR_RUNTIME_HASH=sha256:<lock-file-hash>` itself. The real
WorldKit MCP child receives this hash and the restricted environment, without
`CODEX_HOME`, `AWS_*`, `LWDP_*`, or model-provider credentials.

The Codex process retains only the platform-provided `CODEX_HOME` for existing
authentication. It ignores user config/rules, disables apps/plugins/hooks and
automatic skill instructions, and registers the explicit required WorldKit MCP.
Only the eleven named WorldKit tools are exposed and individually preapproved
with `tools.<name>.approval_mode="approve"`; the server default stays `prompt`,
and global `approval_policy="never"`
and the workspace-write sandbox remain in effect. This implements the user's
authorized world-creation operations without treating write tools as read-only.
This controls configuration and environment inheritance; it does not claim a
complete OS/filesystem isolation boundary for the legacy generic worker.

## Workspace/output layout

The existing LWDP command supplies `-C <task-directory>`,
`--add-dir <task-directory>/outputs`, `--add-dir <task-directory>/inputs`, and
`--output-last-message <task-directory>/outputs/assistant_response.md`.
The launcher cross-checks those arguments and resolves their real paths.

```text
<task-directory>/
  inputs/                         # provider-hydrated original image and case input
  scene.ts, scene.json, helpers.ts # Agent-authored world source
  .creator-session/               # private HOME and TMPDIR, no auth copied here
  .creator-evidence/              # WorldKit operations/candidates/runtime evidence
  creator-result.json             # world_submit output
  creator-delivery.tar.gz         # world_submit output
  outputs/
    creator-events.jsonl          # exact complete Codex JSON transport stream
    creator-stderr.log
    creator-mcp-stderr.log
    creator-launcher-report.json
    creator-result.json           # copied only after successful Codex execution
    creator-delivery.tar.gz
```

The MCP execution cwd is the frozen SDK root, with its explicit tsconfig and
native Node `--import` tsx loader. Transform caching is disabled because the
tsx CLI cache failed pnpm peer resolution with an FSx TMPDIR. The explicit
`--workspace` remains `<task-directory>` and owns all authored/captured files.
The tools must use the same server session for `world_playtest` and `world_submit`.

The launcher hashes the transport stream while receiving it and compares its
final file bytes. It binds `world_submit`'s actual operation ID to an
`operations_get` success event, then checks the source identity, complete delivery
JSON and archive hash. It also requires an actual completed preview response with
an image. Unknown event formats fail closed; raw events and candidate artifacts
remain available for independent Host review. A successful process and authored
`creator-result.json` alone never qualify delivery.

## Local orchestration

The selected five cases stay fixed in
`.codex-tmp/gpt6-five-case-eval/selected-cases.json`. Original images/prompts and
explicit experiment policy overrides are checked by byte hash. Prior Builder
sources and planning images are not sent to the new Creator.

Prepare without any upload or model call:

```sh
node scripts/cloud/run-creator-five-case-eval.mjs --mode prepare
```

For the executed September 5 experiment, the passing immutable lock is
`.codex-tmp/gpt6-five-case-eval/runtime-lock-v3.json`. The unversioned lock is
retained as evidence of the older failed setup, not an alias for V3. Always
pass the intended lock explicitly for a real run. A future four-way experiment
must also select both coordinator and account concurrency; for example, prepare
a new plan (this command submits nothing):

```sh
node scripts/cloud/run-creator-five-case-eval.mjs --mode prepare \
  --runtime-lock .codex-tmp/gpt6-five-case-eval/runtime-lock-v3.json \
  --run-id gpt6-five-case-followup-20260905 \
  --max-concurrency 4 --account-concurrency 4
```

Using V3 reproduces its original SDK, including known quality/authoring limits;
later local source improvements require a separately built and hashed capsule.
When deliberately executing a prepared plan, retain the same explicit lock,
run ID and account-concurrency arguments for `run` and `resume`.

After the runtime's real cloud CLI preview smoke passes and the lock is frozen,
run only the first case to verify actual MCP/event protocol behavior:

```sh
node scripts/cloud/run-creator-five-case-eval.mjs --mode run --case-limit 1 --max-concurrency 1
```

After reviewing that result, use the same lock/run ID for the remaining cases:

```sh
node scripts/cloud/run-creator-five-case-eval.mjs --mode run --case-limit 5 --max-concurrency 4
node scripts/cloud/run-creator-five-case-eval.mjs --mode resume
node scripts/cloud/run-creator-five-case-eval.mjs --mode stats
```

`run` also resumes known requests and skips delivered or terminal failed cases.
`resume` reconciles existing submission intents/jobs only; it never submits a
case without an existing intent. Every logical submission has one POST and a
durable intent; an unknown response is reconciled by exact request ID. Unknown
execution stops further admission. There are no automatic terminal-failure
model retries. Required output download failures can resume against the same job.
To retry one terminal failed case deliberately, use a new run ID and
`--case-id <one-of-the-five-frozen-case-ids>`. The complete five-case plan remains
frozen. A shared local admission record rejects another run while the previous
case is unknown or nonterminal; it must first be reconciled to a terminal state.

`--max-concurrency` permits one to four local case coordinators. The separate
`--account-concurrency` permits one to four shared slots per cloud account and
defaults to one for compatibility with the original frozen requests. The
deployed account semaphore is shared across jobs: requesting one slot can make
otherwise parallel jobs wait for the same account's slot zero. An explicitly
authorized parallel experiment can request four account slots while retaining
`pod_concurrency: 1` and at most four cases in flight. This changes the payload;
never change it for an existing submission intent. Reconcile that request first,
then use a deliberate new run ID for any terminal retry.

The current provider skips declared-output uploads after a nonzero Codex exit.
For these failures the trusted Host recovers only the four diagnostic files from
the exact job/task `outputs` directory and uploads them under that case's S3
`diagnostics/` prefix. It opens every source path component without following
symlinks, requires regular files with one link and a 512 MiB size limit, and
checks stable file metadata plus the copied SHA-256. It does not convert the
failed provider result to success or synthesize missing delivery artifacts.

Each case retains source/model/runtime hashes, request and job identities,
queue/run/delivery timings, full events, binary evidence, and failure class.
`summary.json` distinguishes delivered, failed, pending and unstarted cases. Its
delivery count is not a first-frame-quality score or production support claim.
