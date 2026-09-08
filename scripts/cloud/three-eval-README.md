# Three Creator cloud experiment

Run a frozen selection of Three authoring cases through cloud Codex. Each
delivery contains technical evidence for independent visual and playable review.

## Identity and execution

- `three-raw` and `three-sdk` are explicit task suffixes, profiles, lock entries
  and delivery fields. Both use GPT-6 Astra / xhigh and the same pinned Codex
  0.153.3 Linux binary, browser capsule, original reference, creative request,
  asset catalog, deadline and review goals.
- A selection manifest contains 1–100 unique cases. The default `--suite sdk-only`
  creates one `three-sdk` task per case. Its default experiment revision is
  `three-sdk-v2`; use an explicit revision to identify a particular evaluation.
  Every task receives the reference image, creative request and shared
  `three-eval-instructions.md`. Acceptance policy stays in the Host plan.
- SDK-only executes the entire manifest by default. `--case-id <source-case-id>`
  or `--case-limit N` selects a subset. `--suite paired` creates raw/SDK tasks
  and defaults to the forest pair. `--profile` narrows the selected suite.
  Saved task selections are reused on resume. Changing selection, suite or
  revision requires a new run ID.
- SDK-only account and local concurrency default to five; paired defaults to
  four. Local concurrency accepts 1–64 and account concurrency accepts 1–20;
  pod concurrency stays one. These are requested limits, not measured capacity;
  account caps, scheduler resources and observed startup are reported separately.
  A shared local admission mutex checks all Three in-flight requests against
  the configured local limit across coordinators. Mutex
  contention is retried briefly; unknown requests and crashed locks are never
  guessed complete or silently removed.
- A durable request intent is written before the one POST. Unknown outcomes
  only reconcile the exact request ID. A deliberate new attempt requires the
  prior same-case/profile request to be terminal. All attempts remain retained.

This pair compares complete assistance packages, not the isolated causal effect
of a thin API. Raw has Three/addons and authors its movement/physics; SDK adds
the prepared Rapier/Recast, controller and asset helpers. Their examples reflect
that difference. Raw missing SDK diagnostics mean unobserved, not fewer bugs.
Shared acceptance uses reference images, actual keyboard behavior, fixed semantic
routes and collision/attachment checks. A single forest pair is a pipeline pilot,
not evidence of a stable model or SDK quality advantage.

## Runtime preparation

`three-capsule.mjs` builds a minimal Linux dependency closure and optional final
SDK capsule. Read its help and `deploy/three-creator-runtime/README.md` for its
stage/dependency/freeze controls. It contains no account, LWDP, AWS or personal
configuration. Both profiles are prebuilt using
`scripts/three-creator/prebuild.ts`; the tools verify each manifest pin and
actual bundle bytes before loading the fixed runtime.

Create a freeze input JSON containing explicit status (`draft` until the installed
doctor passes), source commit, absolute cloud paths, pinned capsule/source/manifest
hashes, browser environment, `hostCacheRoot` and `prebuiltRuntimes`.
`hostCacheRoot` must be the experiment's `host-cache` sibling of `toolkit`, for
example `/fsx/pipeline/worldkit-three-creator-experiments/RUN/host-cache`.
The prebuilt profile entries are:

```json
{
  "three-raw": {
    "root": "/fsx/pipeline/worldkit-three-creator-experiments/RUN/toolkit/prebuilt/three-raw",
    "manifestSha256": "<plain64>",
    "runtimeHash": "<plain64>"
  },
  "three-sdk": {
    "root": "/fsx/pipeline/worldkit-three-creator-experiments/RUN/toolkit/prebuilt/three-sdk",
    "manifestSha256": "<plain64>",
    "runtimeHash": "<plain64>"
  }
}
```

`node scripts/cloud/three-runtime-lock.mjs --config FREEZE_INPUT --output LOCK`
records the exact four launcher module hashes. Its output alone does not prove
installation or cloud capabilities. Use a fresh task-owned FSx prefix under
`/fsx/pipeline/worldkit-three-creator-experiments/`; reuse existing immutable
Codex/browser binaries without overwriting them. Stage the four launcher modules
alongside `runtime-lock.json`. Stage the doctor separately when needed.

The launcher loads only `worldkit_three_creator`, with exactly 16 declared tools
and per-tool approval. Global `never` plus `workspace-write` remains unchanged.
The MCP child receives no authentication variables. The Codex process receives
only the platform-provided CODEX_HOME in addition to the task environment; no
account home is copied, inspected or modified by these scripts.

This release pins Creator tool version `0.2.0-experimental`; SDK receipts must
carry the same `sdkVersion` and `WorldObservation-v2`. Raw retains the minimum
`WorldObservation-v1` contract and null SDK version. The MCP tools
`world_execute_command` and `world_get_operation`, expose structured SDK control
and its ongoing operation status. A Creator operation and a world operation are
separate IDs. `creator_materialize_runtime` exports project-owned SDK source for
customization; delivery identifies the actual source and runtime bytes.

Each task uses `hostCacheRoot/<sha256(absolute workspace)>/browser-registry` as
the effective `PLAYWRIGHT_BROWSERS_PATH`. It is outside the author workspace.
The version directory such as `chromium_headless_shell-1234` is a real writable
directory; only its executable child directory and fixed installation marker
link into the immutable capsule. Playwright's `DEPENDENCIES_VALIDATED` marker
therefore remains in Host cache. The entire version directory must never be a
symlink to the capsule. Fontconfig caches use the browser's per-task HOME/XDG;
build-time font `.uuid` sidecars are excluded from the versioned browser package.
Browser/library/font body hashes stay pinned, and the entire installed SDK and
browser closure is rechecked after the affected browser test. No dependency
validation skip flag is used.

Run the actual installed no-model doctor with the capsule's Node:

```sh
node three-runtime-doctor.mjs --runtime-lock /ABS/runtime-lock.json --output-root /ABS/new-doctor --profile three-sdk --duration-seconds 4
```

It verifies the MCP tool list, compiler runtime pins, actual browser images,
keyboard movement, recorded video, world commands and three views. It verifies
delivery from a complete real input episode and requires `world_submit` to reject
a truncated debug episode with `THREE_SUBMIT_PLAYTEST_REQUIRED`. It accepts a
draft lock; omitting `--profile` checks both profiles. This infrastructure check
does not establish case quality or coverage of a separate task's goals.
The installed toolkit/browser closure must pass both before and after browser
execution. SDK/browser/toolkit changes require the affected doctor again.

## Prepare, run and recover

```sh
node scripts/cloud/three-eval-runner.mjs --mode prepare --manifest SELECTION --suite sdk-only --experiment-revision three-sdk-v2 --run-id RUN --runtime-lock LOCK --max-concurrency 5 --account-concurrency 5
node scripts/cloud/three-eval-runner.mjs --mode run --manifest SELECTION --suite sdk-only --experiment-revision three-sdk-v2 --run-id RUN --runtime-lock LOCK --max-concurrency 5 --account-concurrency 5
node scripts/cloud/three-eval-runner.mjs --mode resume --run-id RUN --runtime-lock LOCK
node scripts/cloud/three-eval-runner.mjs --mode stats --run-id RUN
```

Prepare never uploads or submits. Run/resume require a ready lock and the
checkout's existing closed runtime-config files. Defaults point to the project's
S3 prefix `.../agent-whitebox-world-sdk/three-creator/sdk-eval` (`paired-eval` for
the explicit paired suite). Changing a
durable payload is rejected. Failure diagnostics use the existing trusted Host
reader of four exact files, with directory-FD/no-follow and size/hash checks.
Provider attempt workspaces are selected from the exact task's provider metadata
or verified live launcher. Their job, task, workspace and runtime must agree.
Fixed-output recovery can retrieve the four formal files and two stderr logs;
result/archive bytes must match the delivered launcher's hashes. Recovery and
independent verification use this same workspace identity.

Account policy defaults to one selected account. An optional `codexAccountRoot`
uses one prepared subdirectory per selected identity hash. `selection: "pool"`
requires that root and requests every eligible preferred account, up to 64,
using the shared root directly. Its physical members, preferred policy and
requested account IDs must agree; actual execution must belong to that requested
set. Account basenames and the provider's global slot limits remain shared.
An optional `submissionApiBase` accepts only `http://127.0.0.1:<port>` for a
task-owned submission proxy. Initial and identical-idempotency replay POSTs use
that endpoint; lookup, polling, cancellation and uncertain-POST recovery GETs
keep the original service configuration. A proxy failure never triggers a POST
to the original endpoint. Authentication stays in the private runtime config.

A new run requires an explicit selection manifest. Resume uses the saved manifest
path and verifies its unchanged bytes. Model input contains the original reference,
the uniformly normalized source request, frozen general instructions and technical
identity only. Scene-specific acceptance hints, subject labels and reviewer policy
remain in the Host plan; they are not attached to the generating Agent.

The cloud launcher has the frozen model wall-time deadline and kills its process
group after a 15-second TERM grace. The Host retains the original submission time
across resume, limits pre-start queueing to 30 minutes and total queue/run/drain
to 30 minutes + model deadline + 3 minutes. It checks actual service model, effort,
sandbox, timeout and concurrency; unexpected task fanout or provider reattempts
halt admission and stop only the precisely owned request. API cancellation alone
does not free admission while Ray cleanup is still unconfirmed. A durable halt
admits no fresh jobs; original requests remain recoverable. A Host connection loss
leaves outcomes pending while the independently running cloud deadline remains.
LWDP exposes no per-job monetary ledger here; time and raw token counters cannot
be presented as a measured currency charge or a dollar cap.

Explicitly stop an existing Three task and confirm cleanup without another model:

```sh
node scripts/cloud/three-eval-stop.mjs --case-root DOWNLOAD --reason "operator stop"
```

Then resume its original run to collect terminal diagnostics. If cancellation
remains unknown, the stop intent is reconciled by exact job identity; no replacement
generation is submitted. Foreign job identities are never cancelled.

Each successful task must preserve the full Codex event stream. The validator
requires a real final-world preview PNG whose bytes match the MCP image hash;
an actual world_submit operation followed by its successful operations_get;
matching engine/profile/lock/world/runtime/episode identities; complete
receipt equality; and raw transport hashes matching the downloaded result/tar.
The schema-version-1 delivery must be `ready-for-independent-review`, with a
complete real input episode, finite positive actual wall/input/active/video
durations and captured three-view images. The episode should cover the requested
core functions and action outcomes; recording length follows that coverage.
Actual video metadata and browser capture timing must agree with the receipt.
A project-owned runtime
binds its source and manifest hashes to the delivered runtime. Episode schema
v2 can include structured commands and explicit lifecycle steps.

Then independently verify and extract without executing author files:

```sh
node scripts/cloud/three-eval-verify.mjs --case-root DOWNLOAD --runtime-lock LOCK --output NEW_HOST_DIR
```

The extractor rejects path traversal, links, duplicate paths, special files,
oversized archives and incomplete manifest/file/video/capture evidence. Real replay,
whitebox composition, complete moving subjects and external task goals remain
separate acceptance gates. Run preparation and execution do not publish the site.

Validation: `node --test scripts/cloud/three-eval.test.mjs` plus capsule tests.
Tests, Linux dependency import doctor, full browser doctor and model execution
are reported separately; passing one is never used to claim another occurred.


### Account policy location and frozen runs

The Host default account-routing policy is
[`config/three-creator/account-policy.json`](../../config/three-creator/account-policy.json).
The executable selection rules stay in `three-account-routing.mjs`; the policy is
not included in Creator authoring capsules.

A saved run retains its `accountPolicyPath` and `accountPolicySha256`. If that path
is the removed `scripts/cloud/creator-account-policy.json` default in this exact
checkout, the Host may read the new default only when the old file is absent and
the new bytes match the saved SHA-256. It does not rewrite the saved identity.
Missing hash pins, changed bytes and unrelated missing paths fail closed.
An explicit `--account-policy-file` uses that exact file and still checks the
saved hash. Existing external runs, source worktrees and provider archives are
not migrated or restarted by this repository change.
