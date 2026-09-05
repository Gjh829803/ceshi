# Three Creator cloud experiment

This is a new experimental lane. The Native V3 SDK, locks, jobs, gallery results
and receipt rules stay unchanged. A Three delivery is technical evidence ready
for independent review; it is never relabeled Native or semantic success.

## Identity and execution

- `three-raw` and `three-sdk` are explicit task suffixes, profiles, lock entries
  and delivery fields. Both use GPT-6 Astra / xhigh and the same pinned Codex
  0.153.3 Linux binary, browser capsule, original reference, creative request,
  asset catalog, deadline and review goals.
- The original five-case manifest is retained as provenance. The default
  `--suite sdk-only` produces exactly five SDK task identities, with experiment
  revision `three-sdk-v2`. This revision labels the experiment; the implemented
  runtime/delivery profile remains `three-sdk`. The old Native policy suffix is
  replaced with `three-eval-instructions.md`; the two inherited block/centered-rear
  phrases are explicitly normalized to free geometry/reference camera. Original
  policy bytes remain in the Host source manifest and their hash in case-input.
  Both paired profiles receive identical cleaned creative input bytes.
- SDK-only defaults to all five cases; `--case-id <source-case-id>` or
  `--case-limit N` narrows execution while retaining the five-case plan.
  `--suite paired` explicitly restores the previous raw/SDK experiment: it
  plans ten tasks and defaults to the forest pair. `--profile` can narrow a
  suite but cannot admit raw into SDK-only. Existing run plans retain their
  suite/revision; changing either requires a deliberate new run ID.
- SDK-only account and local concurrency default to five; the paired defaults
  remain four. Both flags accept one through five, pod concurrency stays one.
  These are requested limits, not proof of five actual simultaneous processes;
  account caps, scheduler resources and observed startup are reported separately.
  A shared local admission mutex caps all Three in-flight requests at five
  across multiple coordinators. Mutex
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

Create a freeze input JSON containing explicit status (`draft` until Root's T5
approval), source commit, absolute cloud paths, pinned capsule/source/manifest
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

The launcher loads only `worldkit_three_creator`, with exactly 15 declared tools
and per-tool approval. Global `never` plus `workspace-write` remains unchanged.
The MCP child receives no authentication variables. The Codex process receives
only the platform-provided CODEX_HOME in addition to the task environment; no
account home is copied, inspected or modified by these scripts.

This release pins Creator tool version `0.2.0-experimental`; SDK receipts must
carry the same `sdkVersion` and `WorldObservation-v2`. Raw retains the minimum
`WorldObservation-v1` contract and null SDK version. The two new MCP tools,
`world_execute_command` and `world_get_operation`, expose structured SDK control
and its ongoing operation status. A Creator operation and a world operation are
separate IDs. Old version-0.1 doctor artifacts remain historical evidence and
cannot satisfy this new delivery contract.

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
node three-runtime-doctor.mjs --runtime-lock /ABS/runtime-lock.json --output-root /ABS/new-doctor --profile three-sdk --duration-seconds 180
```

It requires the selected MCP tool list, real previews and image bytes, actual browser
keyboard/video, compiler runtime pins and episode-only world reuse. It accepts
a draft lock to allow capability verification before release. Four seconds is
the default smoke duration; it does not imply a 180-second delivery or semantic
acceptance. `--duration-seconds 180` additionally tests actual three views,
same-session world_submit, final JSON equality and the archive byte hash, with a
small alternating-input fixture. Omitting `--profile` checks both profiles.
The installed toolkit/browser closure must pass both before and after browser
execution. SDK/browser/toolkit changes require the affected doctor again.

## Prepare, run and recover

```sh
node scripts/cloud/three-eval-runner.mjs --mode prepare --suite sdk-only --experiment-revision three-sdk-v2 --run-id RUN --runtime-lock LOCK --max-concurrency 5 --account-concurrency 5
node scripts/cloud/three-eval-runner.mjs --mode run --suite sdk-only --experiment-revision three-sdk-v2 --run-id RUN --runtime-lock LOCK --max-concurrency 5 --account-concurrency 5
node scripts/cloud/three-eval-runner.mjs --mode resume --run-id RUN --runtime-lock LOCK
node scripts/cloud/three-eval-runner.mjs --mode stats --run-id RUN
```

Prepare never uploads or submits. Run/resume require a ready lock and the
checkout's existing closed runtime-config files. Defaults point to the project's
S3 prefix `.../agent-whitebox-world-sdk/three-creator/sdk-eval` (`paired-eval` for
the explicit paired suite). Changing a
durable payload is rejected. Failure diagnostics use the existing trusted Host
reader of four exact files, with directory-FD/no-follow and size/hash checks.

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
matching engine/profile/lock/fixed-runtime/world/episode identities; complete
receipt equality; and raw transport hashes matching the downloaded result/tar.
Episode-only edits require a new episode, not an unnecessary new world image.
Host wall duration, browser input duration, active play duration and actual
encoded video duration must each reach 180 seconds and match the sealed
playtest. The video is compared with browser input time, not evidence-transfer
or encoder recovery time. Actual-canvas capture endpoints use that browser
clock; stopped-canvas postroll is recorded separately and never counted as
input or active play. VFR output is allowed and its average frame rate is not
forced to equal the requested sampling rate. The independent extractor uses
`ffprobe` to compare actual MP4 duration, frame count and dimensions with the
MCP-bound metadata. Episode schema v1 remains compatible; v2 can include
structured commands and explicit lifecycle steps.

Then independently verify and extract without executing author files:

```sh
node scripts/cloud/three-eval-verify.mjs --case-root DOWNLOAD --runtime-lock LOCK --output NEW_HOST_DIR
```

The extractor rejects path traversal, links, duplicate paths, special files,
oversized archives and incomplete manifest/file/video/capture evidence. It
preserves recorded unreachable targets for independent review. Real replay,
reference composition, complete moving subjects and external path goals remain
separate acceptance gates. Publishing is not performed by these new scripts.

Validation: `node --test scripts/cloud/three-eval.test.mjs` plus capsule tests.
Tests, Linux dependency import doctor, full browser doctor and model execution
are reported separately; passing one is never used to claim another occurred.
