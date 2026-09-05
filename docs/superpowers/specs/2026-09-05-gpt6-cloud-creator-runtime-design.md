# GPT-6 Cloud Creator Runtime Design

Status: **Draft / design-only**. Baseline: `50a1e14a` on
`codex/gpt6-world-agent-refactor`. Date: 2026-09-05.

This document specifies the executable cloud environment for the
[controllable World Agent design](./2026-09-05-gpt6-controllable-world-agent-design.md).
It does not record a deployed environment or a successful cloud canary. No new
LWDP profile, worker pool, payload field, plugin, or tool in this document is
implemented merely by accepting this design. The user's clarification is that
Codex must have real **plugin and tool capabilities**, not only uploaded skill
instructions. Runtime-derived object tri-views remain a separate output requirement.

## 1. Decision and scope

Use one LWDP-managed **`worldkit-creator` runtime profile** and a dedicated
creator worker pool. Each creation task must have a reachable, version-locked
Codex CLI, WorldKit SDK, asset closure, WorldKit MCP tool host, Chromium,
Babylon/Havok, and media utilities. GPT-6 Astra with `xhigh` authors, previews,
plays, inspects, and revises in one creation session. The final trusted Host
independently admits the submitted candidate and publishes its artifacts.

“Same task environment” means that these components operate on the same
candidate identities and tool session without requiring the Agent to launch a
second unrelated generation task. It does **not** mean that all components must
share one Unix identity, container filesystem, or production credentials.

The runtime uses the existing LWDP account health, account lease, token refresh,
job identity, cancellation, and reconciliation authorities. WorldKit must not
create another account-selection or authentication implementation inside its
Scene Worker. Generic Codex remains available for light tasks, but a generic job
without the creator profile is not an eligible World Creator execution.

In scope:

- Actual loading and invocation of required plugins and tools.
- Image inputs, image inspection, optional image generation, asset/action reuse.
- Real Runtime preview, automated controller play, object tri-views, and evidence.
- Candidate revisions, asynchronous operations, failure recovery, and publication.
- Project versus LWDP platform implementation responsibilities.

Out of scope: changing the world authoring/control contract, defining all NPC
behaviors, implementing a video-model provider, or copying every plugin installed
on a developer's desktop into production.

## 2. Verified baseline and evidence limits

The baseline has two distinct cloud environments:

1. A complete Cloud Scene Worker runs `pnpm agent:world`, trusted replay,
   Babylon capture, and publication. Its
   [Dockerfile](../../../deploy/cloud-worker/Dockerfile) uses the Playwright image,
   installs project dependencies, ffmpeg/Python utilities, and prebuilds the
   Playground. It does not install Codex.
2. The pipeline submits Planner/Builder/visual work to an LWDP generic Codex
   worker. The Builder request in
   [run-spatial-world-agent.sh](../../../scripts/agents/run-spatial-world-agent.sh)
   includes a skill, brief, palette, and images, not the full rendering runtime.

The generic client in
[run-lwdp-codex-task.mjs](../../../scripts/agents/run-lwdp-codex-task.mjs)
creates `workspace-context.tar.gz`, declares a closed output list, and appends a
protocol requiring extracted context to remain read-only. Its current instruction
also forbids arbitrary external-service access. Adding a preview command to that
skill does not install its implementation or make its services reachable.

The project already provides useful implementations:

| Existing implementation | Reuse in the creator runtime |
| --- | --- |
| `scripts/agents/agent-runtime-preview.ts` | Compile a candidate and obtain real opening PNG, Snapshot, and compact actual-camera report. |
| `scripts/cli/worldkit.ts` / `captureFile` | Existing Chromium startup, Runtime readiness, capture, render-environment inspection, and tri-view pipeline. |
| `scripts/lib/deterministic-playthrough-capture.ts` | Existing fixed-step controller execution and actual rendered video frames. |
| `scripts/lib/agent-authoring-catalog.ts` | Generate authoritative asset, action, motion, camera, and compatibility metadata. |
| `assets/subjects/` and `apps/playground/public/subject-assets/` | Existing resource manifests and real GLB/animation closure. |
| `scripts/cloud/` | Durable Cloud Execution integration, cancellation, immutable artifact manifests, trusted publication, and recovery. |

Current production uses a digest-pinned Worker from
`config/cloud-scene-production.json`. Local source edits do not change that
image or the generic Codex image. Both deployment identities must be explicit
when evaluating a new creator run.

A local LWDP code snapshot was inspected at
`/Users/oricter/Desktop/code/Agent/leap_world_data_codex_media_fix_20260725`,
revision `9b5bfbd`. It is **historical source evidence, not proof of current
production behavior**:

- `ray_pipeline/generation/codex_runner.py` constructs `codex exec` with model,
  effort, sandbox, image, workdir, and output arguments. It does not add
  `--ignore-user-config` or register MCP/plugin configuration.
- `codex_job.py` prepares a temporary `CODEX_HOME` from the selected account and
  copies the process environment.
- `t2i.py::_prepare_codex_home` copies account-home contents except selected
  history/cache directories. That snapshot does not establish auth-only copying.

The new profile must inspect and update the **currently deployed** LWDP runner.
It must not assume that a historical implementation or an account's inherited
plugin configuration satisfies this contract. The inspected LWDP Generation API
skill says runtime setup fields such as `working_dir`, `pip`, `conda`, and
`py_modules` are ignored; only deployed image/platform code supplies dependencies.

## 3. Architecture alternatives

| Option | Benefits | Costs and risks | Decision |
| --- | --- | --- | --- |
| Dedicated complete creator profile | One candidate workspace and session; actual SDK/assets/browser; fast local tool transfer; direct visual repair; controlled versions. | Requires LWDP profile/scheduler deployment and a heavier worker. Browser and simulation resources must be budgeted. | **Primary implementation.** |
| Generic Codex plus scoped remote tool bridge | Can retain the existing Scene Worker rendering stack; small generic worker. | Still requires MCP installation/configuration in LWDP. Adds candidate uploads, remote session routing, authorization, operation recovery, output hydration, and stale-revision handling. No existing bridge was found. | Backup if platform cannot supply the primary runtime. Do not build both initially. |
| Upload a full checkout or skill and install on demand | Appears to minimize deployment work. | Dependencies, network policy, browser binaries, accounts, and configuration remain uncontrolled; credentials may leak through an overly broad archive; generation runtime setup fields do not install software. | Rejected. |

If the bridge becomes necessary, it must implement the exact same tool schemas,
candidate identities, operation receipts, and evidence rules. It is a deployment
adapter, not a second authoring or validation contract.

## 4. Ownership and trust boundaries

### 4.1 Four authorities

| Authority | Owns | Must not own |
| --- | --- | --- |
| LWDP task supervisor | Account eligibility/lease/refresh, controlled CLI startup, profile admission, process lifecycle, task-level quotas. | World correctness, scene geometry, or WorldKit publication signing decisions. |
| Creator Agent sandbox | User intent interpretation, authored source, temporary experiments, requests to the tools. | Host evidence files, signing material, another task's files, platform configuration. |
| WorldKit execution/tool Host | Candidate snapshotting, compilation, browser lifecycle, preview/playtest execution, authoritative tool reports. | Unrestricted execution under production credentials or final acceptance based only on the Agent's claim. |
| Trusted admission/publisher | Independent validation, release manifest, trusted signature, S3 publication/admission. | Mutable access by the Agent or generated module. |

The task may use multiple containers or sandboxes. **Same Pod is not a security
boundary**: filesystem mounts, process namespaces, socket access, network routes,
UIDs, kernel isolation, and service-account credentials must be designed and
tested separately.

Generated source is executable untrusted input. Importing `scene.ts` or any
generated module in a Node
process that also holds LWDP/AWS/provider credentials or the signing key is
forbidden. The execution sandbox must have:

- No production credentials, Codex account files, Kubernetes service-account
  token, cloud metadata access, signing keys, or general provider client config.
- No shared process namespace with the supervisor/authentication process.
- No writable SDK/tool binary mounts and no access to sibling task workspaces.
- Only the pinned runtime, candidate snapshot, declared assets, controlled output
  channels, and task-private scratch.
- Resource/deadline enforcement and network access limited to the required local
  runtime origin; arbitrary network and package installation are not available to
  generated world code.

Use platform-provided process/container isolation; do not invent a JavaScript
`vm` security boundary. If the platform uses containers sharing a network namespace,
the design must separately prevent generated code from reaching privileged local
services. A single NetworkPolicy on that shared Pod does not prove this property.
The precise platform primitive is a prerequisite before executing generated code
alongside a production supervisor.

Final replay runs in a separate clean execution sandbox. The publisher reads the
verified reports and artifacts; it does not import the generated module under its
privileged identity. Final publication credentials never enter the creator task.

### 4.2 Filesystem contract

Logical paths below describe mounts and ownership, not an instruction to grant
the whole tree writable access:

| Path | Agent access | Owner and purpose |
| --- | --- | --- |
| `/opt/worldkit/` | Read-only | Pinned SDK, CLI, schemas, examples, MCP executable. |
| `/opt/worldkit-assets/` | Read-only | Catalog lock, referenced models, rigs, clips, and preview fixtures. |
| `/workspace/input/` | Read-only | User images, prompt, immutable request and dependency lock. |
| `/workspace/authoring/` | Read/write | Scene source and authored data; the Agent can reorganize implementation within this root. |
| `/workspace/scratch/` | Read/write | Experiments, helper scripts, temporary images, generated candidate files. |
| `/workspace/evidence/` | Read-only to Agent | Tool Host copies completed immutable reports/images here. No Agent-authored receipts. |
| `/workspace/output/` | Read-only after submit | Host-sealed final candidate/output manifest. |
| `/run/worldkit/` | Only required scoped socket access | Supervisor/tool control; no general credentials available to Agent. |

Tool request paths must resolve inside the intended roots after symlink checks.
The execution Host copies the candidate into a content-addressed snapshot before
compilation. It never validates a mutable path while the Agent can change its
contents. User reference images remain available throughout the session and are
not replaced by intermediate planning images.

### 4.3 S3 and account responsibilities

LWDP hydrates immutable inputs and uploads task checkpoints/output through its
existing controlled transfer layer. The Agent receives local paths and resource
refs, not AWS credentials or a bucket-wide upload capability. Every task/attempt
has its own S3 prefix; no shared `result.png` or reusable scratch output path.

LWDP owns the account lease before Codex begins and refresh-token reconciliation
after it ends. A WorldKit process must not copy account homes, select another
account, refresh tokens, or read account credentials. The platform returns only
non-secret execution identity and capability results. Model incompatibility is an
explicit infrastructure result, not permission to substitute another model.

## 5. Proposed LWDP platform contract

**The fields and profiles in this section are proposed and unimplemented.** They
must be added to LWDP API validation, persistence, execution, and config echo before
the project client sends them in a real task. Unknown profile fields must be
rejected rather than ignored. A successful HTTP response is not profile activation.

Proposed wire addition to generic Codex submission:

```json
{
  "runtime_profile_ref": "worldkit-creator@1",
  "defaults": {
    "model": "gpt-6-astra",
    "reasoning_effort": "xhigh",
    "sandbox": "workspace-write"
  }
}
```

This fragment is **not** a complete submit payload. Existing task inputs, output
specifications, request identity, and S3 fields remain required. The snake-case
field is an LWDP wire field; internal WorldKit definitions use
`runtimeProfileRef`. This is a provider adapter boundary, not competing public
WorldKit schema dialects.

The caller supplies a profile ref, never an arbitrary container image, shell
bootstrap, MCP URL, package installer, account path, or secret. The platform
registry resolves it into an immutable lock containing:

- Creator image digest and SDK/plugin/catalog lock hashes.
- Codex CLI artifact/version and supported configuration flags.
- Required model/tool capabilities and allowlisted MCP tools.
- CPU, memory, ephemeral disk, browser concurrency, and optional GPU placement.
- Filesystem mounts, approved network routes, and isolation implementation.
- Provisioning/task/operation deadlines and checkpoint policy.
- Account-lease integration and the permitted identity transfer boundary.

Admission response/config echo must include the resolved profile identity and
image digest. Task execution evidence must report those identities again. A
profile resolution mismatch stops the task before the creative prompt runs.

The platform must use a dedicated schedulable resource/pool identity. Do not
mistake the normal generic job's account concurrency for browser capacity.
Initial admission is one active creation task and one active world browser per
creator worker, with separately bounded asset-preview work. Resource values are
deployment defaults to measure, not claims about achieved throughput. A first
benchmark can start around 4 vCPU / 8 GiB requested and 8 vCPU / 16 GiB limits,
then adjust from observed world/asset fixtures before broad admission.

## 6. Plugin and tool capability matrix

Only install the capabilities required for this product. Production does not
inherit desktop Chrome/CUA, email, Slack, document tools, personal automations, or
unrelated connectors.

| Capability | Delivery | Required use and proof | Missing behavior |
| --- | --- | --- | --- |
| Shell/file editing | Pinned Codex harness + writable authoring/scratch | Create and execute a small scratch program inside allowed roots. | Fail creator preflight. |
| Read user images | Codex image inputs | Attach the original image; visual probe proves the model observes image pixels. | Fail creator preflight. |
| Inspect newly rendered images | Built-in image viewer or image-valued MCP response | Inspect a runtime PNG created after task startup. A filename in text is insufficient. | Fail creator preflight. |
| WorldKit instructions | Pinned `worldkit-creator` plugin skill | Skill version/hash appears in environment receipt; instructions reference actually installed tools. | Fail creator preflight. |
| WorldKit MCP tools | Pinned executable + controlled MCP registration | Initialize, list exact tools, call environment and compile/preview probes. | Required server failure stops startup. |
| Asset/action access | MCP backed by pinned catalog and real files | Load G Bot GLB, play a real action, inspect its contact sheet. | Fail if a required resource cannot materialize. |
| Runtime preview | WorldKit MCP + SDK + Chromium/Babylon/Havok | Capture a nonempty opening and Snapshot from a known candidate. | Fail; software approximation cannot replace real Runtime. |
| Playtest | WorldKit MCP using shared runtime/controller implementation | Apply movement and capture position/support/events; produce a valid short test clip. | Fail playable-world profile. |
| Whitebox tri-views | Existing Authoring Capture adapter | Capture exact runtime meshes in Front/Right/Back with identity mapping. | Fail required tri-view output. |
| Built-in image generation | Codex built-in tool plus pinned supporting skill where needed | Real imagegen call, file integrity, and readback in the selected cloud model/account lane. | Fail a profile requiring styled outputs; never fabricate placeholders. |
| Media inspection | ffmpeg/ffprobe and image libraries in image | Decode PNG/contact sheet/video; verify dimensions and time base. | Fail corresponding required capability. |
| Web research | Optional separately controlled tool/profile | Only if a task explicitly requires external factual research. | Not required for image/prompt-driven world creation. |

One `worldkit-creator` plugin bundles the concise instructions, tool schemas,
examples, and MCP executable. It can coexist with an imagegen instruction skill,
but a skill is not the built-in image generation implementation. Tool installation,
account entitlement, and actual tool availability are separate checks.

The base creator profile requires image input/inspection, WorldKit tools, asset
reuse, runtime preview/playtest, and tri-views. A profile for complete styled
delivery additionally requires imagegen. The requested artifact contract selects
the profile before admission. A failure must not quietly change that contract.

## 7. Configuration loading and version lock

Official Codex documentation supports STDIO and Streamable HTTP MCP servers,
required initialization, enabled-tool lists, and startup/tool timeouts. Plugin
installation requires a new session before the bundled capabilities are used.
See [official MCP configuration](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)
and [official plugins](https://learn.chatgpt.com/docs/plugins).

A deployment-generated MCP configuration can use this documented shape:

```toml
[mcp_servers.worldkit_creator]
command = "/opt/worldkit/bin/worldkit-creator-mcp"
args = ["--stdio"]
required = true
startup_timeout_sec = 30
tool_timeout_sec = 60
enabled_tools = [
  "creator_describe_environment",
  "assets_search", "assets_describe", "assets_preview", "assets_publish_definition",
  "world_validate", "world_preview", "world_playtest",
  "world_capture_triviews", "world_inspect", "world_submit",
  "operations_get", "operations_cancel"
]
```

The executable path and tool names are **proposed WorldKit definitions**, not
currently installed files. The configuration syntax is documented; compatibility
with the selected cloud CLI binary must still be exercised in CI and canary.
The MCP implementation can be a scoped relay into a separately isolated execution
Host; STDIO does not require the generated module to run in the Codex process.

The launch sequence is:

1. LWDP resolves the profile lock and acquires its account lease.
2. The supervisor prepares an empty controlled Codex configuration root and
   injects authentication through the platform-owned mechanism.
3. Install/materialize the pinned plugin before starting the session. Do not
   inherit account-home plugin/MCP/hook settings or a developer's desktop config.
4. Apply the profile's configuration through the pinned CLI's verified loading
   mechanism. Record effective values, not only requested command-line text.
5. Start MCP, run process-level doctor, then start a new Codex session and run the
   model-visible capability canary before the creation instruction proceeds.

The selected configuration strategy is an empty per-task Codex home populated
only by LWDP's authenticated lease mechanism and the profile-generated config.
Do not copy an account's personal config, plugins, hooks or instructions. The
creator launch reads this controlled config; it does not blindly add
`--ignore-user-config` and thereby skip its own required MCP settings. Source
workspaces cannot override machine-owned profile settings. The exact CLI build
must prove this loading behavior in the effective-config and real-tool canaries.
If that build cannot load the controlled profile reliably, fix the launcher or
profile before admission; do not fall back to a personal home or missing tools.

The lock records image digest, CLI version/checksum, SDK source revision and
build hash, plugin version/hash, tool schema hash, Node/pnpm/Chromium/Playwright,
Babylon/Havok versions, asset-catalog hash, and declared model/effort. CI must
include a tiny real Codex invocation that observes and calls the required server;
parsing TOML alone is not configuration-loading evidence.

## 8. Tool contracts and asynchronous operations

Public MCP names use the identifiers in the configuration above. CLI wrappers
and internal modules implement the same schemas; they must not evolve a separate
prompt-only API dialect.

| Tool | Input purpose | Result and integration point |
| --- | --- | --- |
| `creator_describe_environment` | Read current creation session | Profile/runtime lock, active capabilities, quotas, health, and effective model metadata available from the harness. |
| `assets_search` | Query semantic terms and required behavior | Small ranked catalog subset with resource refs, exact actions, compatible motion, sockets, and usage limits. |
| `assets_describe` | Inspect one resource ref | Exact resource closure and immutable content hashes; animation does not imply gameplay capability. |
| `assets_preview` | Request model/action views | Operation receipt, then real tri-view/contact sheet/video and materialization report. |
| `assets_publish_definition` | Submit a Creator-authored local object definition candidate | Operation receipt, then admitted content-locked definitionRef and local template/geometry/capability/appearance hashes. Candidate execution stays isolated; the lightweight control Agent cannot submit code through this tool. |
| `world_validate` | Snapshot and validate authored source | Candidate ID, source hash, compile/control/resource diagnostics; validation never rewrites authored source silently. |
| `world_preview` | Open candidate and capture a requested view | Operation receipt, then PNG, Snapshot, actual camera/collision report, render environment, browser errors. |
| `world_playtest` | Execute a bounded input/goal plan | Operation receipt, then controller trajectory, events, support/camera evidence, keyframes/video and coverage report. |
| `world_capture_triviews` | Capture declared visual groups | Operation receipt, then runtime geometry tri-views with stable visual-group/entity mapping. |
| `world_inspect` | Query candidate/runtime entities | Compact entity, support, collision, behavior, and command capability state. |
| `world_submit` | Seal a candidate against explicit evidence | Submitted immutable candidate manifest and validation identity; never a production signature. |
| `operations_get` | Poll one operation, optionally after revision | Durable latest status/progress/result. |
| `operations_cancel` | Cancel one running operation | Idempotent cancellation receipt and eventual cleanup status. |

All operations bind `creationSessionId`, `candidateId`, `sourceHash`,
`sdkBuildHash`, tool version, and input hashes. Asset-only operations substitute
the locked asset identity for a candidate. The model never manually fills in
platform identity, credentials, or attempt prefixes that the host can derive.

Long work must return promptly with an operation receipt, for example:

```json
{
  "kind": "worldkit-operation",
  "schemaVersion": 1,
  "id": "operation-0007",
  "creationSessionId": "creation-001",
  "candidateId": "candidate-003",
  "type": "world.preview",
  "status": "queued",
  "revision": 1
}
```

Operation status is one of `queued`, `running`, `succeeded`, `failed`, or
`cancelled`. Only `succeeded` may reference completed result artifacts. A call
accepted by MCP is not a successful render. A 60-second MCP transport timeout is
not proof that the operation failed or succeeded. The caller reconciles its
existing operation ID or idempotency identity; it must not blindly create another
render/playtest after a lost response.

The short tool call records an operation durably before doing expensive work.
`operations_get` supports bounded waits of at most 30 seconds and a returned
revision; progress updates include simulation ticks, frames produced, current
phase, and last activity. Client polling uses bounded backoff/jitter and reads
only known operation IDs. Stop polling terminal operations. Cancellation first
marks intent, interrupts execution, then reports cleanup completion; do not return
`cancelled` while ffmpeg/browser processes continue writing final artifacts.

Repeat calls with the same task-derived operation request key and input hash
return the existing operation; conflicting inputs produce a conflict diagnostic.
The model-facing wrapper derives the key. Candidate edits produce a new source
hash and cannot reuse evidence attached to the old hash.

Images are returned as image-valued content when supported by the selected CLI,
plus immutable local paths and hashes. If the CLI requires a separate image-view
call, the task must invoke it; merely listing image paths is not visual review.
Video tools also return bounded contact sheets/keyframes so the model can inspect
the test without assuming that arbitrary MP4 playback is available to Codex.

## 9. Runtime behavior and evidence

The tool Host may keep a task-private browser/server alive to avoid repeated
startup costs. Each candidate load has a revision; reads and captures reject
stale candidates. A late completion from candidate A must never replace candidate
B's preview or report. World-changing operations on one live browser serialize;
independent asset previews can use separate, bounded browser contexts.

Reuse the existing real Runtime and controller paths. Do not add a second
software approximation as the authoritative preview. Existing portable layout
renders may remain optional fast diagnostics, explicitly labeled approximate.

For automated media, reuse/refactor the existing deterministic capture owner
instead of adding another MediaRecorder/frame-normalization implementation. The
new tool may supply a different input plan, but must preserve actual rendered
frames, tick authority, reset behavior, and metadata. General playtest goals must
resolve to real controller inputs/behaviors, not position teleportation disguised
as navigation success.

Evidence categories remain separate:

| Evidence | What it establishes | What it does not establish |
| --- | --- | --- |
| Real Babylon/Havok screenshot under software WebGL | Real SDK geometry, camera, materials, loading, and rendered composition in that environment. | Hardware rendering performance or realtime video latency. |
| Deterministic 180–300 second controller simulation | Executed movement/behavior history, route and interaction observations for that plan. | Universal absence of bugs or realtime frame rate. |
| GPU-backed render/performance run | Frame timing/resource behavior for the declared hardware/profile and world. | Fidelity on other devices or end-to-end video-model latency. |
| Manual product play | Human-observed control/visual experience in the tested build. | Exhaustive behavior coverage. |

The receipt reports WebGL vendor/renderer, whether hardware acceleration was
observed, resolution, Runtime/asset hashes, CPU/GPU profile, simulation duration,
wall time, frame count, cadence distribution, and memory metrics available from
the test harness. Never label software rendering as GPU evidence.

The first creator profile can use CPU/software WebGL for functional and visual
iteration if it meets bounded execution deadlines. A GPU profile/pool is required
for any claimed GPU performance gate. Do not reserve an unbounded GPU for all
model thinking time without measuring utilization; the platform may later
schedule the same task's execution sandbox onto GPU capacity while keeping the
tool contract unchanged. That optimization must not create a second Runtime
implementation or silently change the candidate identity.

## 10. Lifecycle, deadlines, and recovery

Creation lifecycle:

```text
queued -> provisioning -> doctor -> authoring
authoring <-> preview/playtest -> submitted -> trusted-validation -> published
```

Failure states distinguish provisioning, capability, model/account, content,
execution, publication, cancellation, and unknown-submission outcomes. Content
failure should return diagnostics to the same Agent session while its task budget
remains. It does not trigger an unrelated Planner or repair job.

The profile has separate provisioning, Codex task, browser startup, operation,
and no-progress deadlines. Defaults require canary measurement before promotion.
Keep the existing infrastructure/content failure distinction and request-ID
reconciliation rules. A task cannot finish successfully because all expected
filenames appeared before the final `world_submit` seal; early output existence
must not terminate the Agent during preview repair.

Durable state includes:

- Immutable user inputs and runtime lock.
- Latest sealed candidate snapshots and their source hashes.
- Operation journal and completed evidence artifact hashes.
- Codex execution/attempt identity and non-secret effective capability evidence.
- Submitted candidate identity and trusted validation/publication status.

Source, reports, and operation journals are checkpointed after meaningful work;
large media remain content-addressed and are not repeatedly uploaded unchanged.
History/transcripts may be retained according to platform policy but must never
contain authentication files or credential environment dumps.

For a transient tool connection loss, reconnect to the same operation/session.
For browser death, fail the affected operation, retain diagnostics, and allow a
new operation against the same candidate. For a lost creator worker, restore
only hash-verified checkpoints into the same locked profile; do not assert exact
in-memory browser continuation. Recreate the browser deterministically and mark
the resumed session. If Codex session resume is unsupported by the pinned
ephemeral runner, start an explicit continuation attempt with the prior sealed
candidate and evidence, rather than claiming the original conversation survived.

An unknown provider/task submit is reconciled by its original request identity.
No immediate second POST is allowed. A terminal infrastructure retry gets a new
attempt identity only through LWDP's bounded retry policy. User cancellation
does not automatically retry. Release publication remains conditional on the
current attempt/revision so an old worker cannot overwrite a newer result.

## 11. Doctor and real capability probes

`creator:doctor` has a process layer and a model-visible layer. Both write
Host-owned evidence; model-authored `{"ok":true}` is not evidence.

Process layer, before creative work:

1. Verify image/CLI/SDK/plugin/catalog/schema locks and effective permissions.
2. Initialize MCP, compare its tool inventory against the profile, and call the
   environment method.
3. Compile a tiny registered fixture through the real SDK.
4. Launch Chromium; observe WebGL and initialize Havok through the Runtime.
5. Materialize G Bot, its rig and a named action, then render an action probe.
6. Capture a nonempty Runtime opening, valid Snapshot, and complete tri-view.
7. Produce/decode a short real-controller clip through the shared capture path.
8. Prove write-root isolation, rejected cross-session access, and process cleanup.

Model-visible layer in the **selected cloud Codex CLI/model/account execution**:

1. Observe the actual tool inventory and invoke `creator_describe_environment`.
2. Call asset search/describe/preview, then read the generated image pixels.
3. Write a tiny source candidate, invoke validate/preview, poll its operation, and
   inspect the returned Runtime image.
4. Execute a short playtest and inspect a returned contact sheet and diagnostics.
5. Request true tri-views and identify a Host-randomized visual marker. The marker
   value must be absent from text/filenames so it tests the image channel.
6. In a styled-output profile, call built-in imagegen, inspect the resulting
   image, and record valid generated bytes and the genuine tool invocation.

An image passed with `--image` alone does not prove post-render image inspection.
Listing an MCP server in TOML does not prove tool registration. Listing a GLB in
the catalog does not prove asset loading. Each has its own executed probe.

Expensive imagegen checks can run once per deployed profile/account capability
class and have a declared freshness policy; every admitted task still verifies
required tool availability and records its actual tool use. Account/model
compatibility failures invalidate that cached qualification. Exact caching and
freshness rules must be settled before increasing concurrency.

## 12. MVP cloud validation ladder

No step substitutes for a later step. The rollout may stop at any failed step,
with its actual evidence recorded.

| Step | Required experiment | Passing evidence |
| --- | --- | --- |
| C0: packaging | Build immutable creator image and offline SDK/tool conformance. | Reproducible image lock, no secret files, compile and tool-schema tests. |
| C1: platform admission | Submit profile-qualified tiny task through LWDP. | API config echo, correct pool/image, account lease, bounded cancel and cleanup. |
| C2: actual Codex capabilities | Run both doctor layers using `gpt-6-astra/xhigh`. | Effective model/tool identities plus real image/MCP/asset/browser invocations. |
| C3: visual repair loop | Give original image/prompt; create a candidate, inspect real screenshot, make a visible improvement, preview again. | One continuing creator session, two source hashes, corresponding rendered evidence. |
| C4: playability | Run 180–300 seconds of actual controller exploration with meaningful destinations and return/obstacle coverage. | Trajectory, support/camera/errors, keyframes/video, observed failure list and repairs. |
| C5: controllability | Run spawn -> resize -> NPC move/follow/stop -> despawn on the SDK slice defined in the main specification. | Actual command receipts and state changes; player/camera state preserved; malformed commands rejected. |
| C6: full artifact delivery | Capture runtime tri-views and required styled outputs, replay trusted gates, publish S3 manifest. | Closed hashes, independent admission, actual Studio loading/play. |
| C7: adversarial recovery | Kill browser/worker, omit a required asset, lose a submit response, cancel during playtest, deliver stale operation result. | No duplicate jobs, false success, orphan processes, cross-task overwrite, or stale evidence promotion. |
| C8: performance and scale | Declare hardware profile and measure rendering/queue/utilization; then admit a small concurrent batch. | GPU/software evidence labels, actual timings, per-task isolation and bounded capacity. |

C5 depends on the new world-control contract and behaviors; it must not be
reported complete through mock tool outputs while those SDK capabilities remain
unimplemented. C6 must open the produced playable world, not merely observe an
LWDP `succeeded` status. First-frame visual comparison uses the original user
reference and declared requested changes; it does not restore a fixed centered
third-person composition constraint.

## 13. Module change inventory and integration order

Paths marked “new” are proposed implementation locations and remain subject to
the main design's ownership graph. This document grants no worker ownership of
existing modules during implementation.

| Workstream | Proposed files/areas | Integration contract and evidence |
| --- | --- | --- |
| Creator tool contract | New `packages/creator-contracts/` or main-design equivalent | Single schemas for MCP, CLI wrappers, operations, environment/evidence receipts. |
| Tool Host | New `packages/creator-tools/` and `scripts/agents/creator-*` | Adapt existing compile/capture/playthrough owners; operation journal and path isolation. |
| Plugin package | New project-owned `plugins/worldkit-creator/` | Pinned skill + MCP manifest/executable refs; no desktop dependency. |
| Runtime image | New `deploy/creator-runtime/` | SDK/assets/CLI/Chromium closure, read-only mounts, SBOM/version lock and doctor. |
| WorldKit routing | `scripts/agents/run-codex-task.mjs`, `run-lwdp-codex-task.mjs`, profile resolver, new creator launcher | Proposed profile field only after platform support; model lock and output seal. |
| Existing runtime adapters | `agent-runtime-preview.ts`, `worldkit.ts`, deterministic capture, authoring catalog | Shared implementation, no duplicate runtime/recording authority. |
| Final admission | `scripts/cloud/` and artifact manifest/trust utilities | Independent candidate replay, S3 checkpoint identity and signed release. |
| LWDP platform | Current generic request schema/controller, task runner, account integration, worker profile registry/pool manifests | Profile validation/echo, account leases, configuration isolation, image scheduling and cleanup. |
| Verification | New creator doctor/conformance/cloud-canary tests and fixtures | Runtime invocation evidence on exact deployed versions. |

Implement in this order: stabilize contracts and isolation -> build local
executable tools/image -> add LWDP profile and controlled configuration -> pass
C1/C2 -> connect the creator loop -> integrate world-control/playtest gates ->
trusted publication -> recovery and small-batch qualification. Do not require a
complete Agent refactor to discover at the end that cloud image inspection or
MCP initialization is unavailable.

## 14. Open decisions and release blockers

- Confirm the current LWDP runner source/deployed digest and its existing
  account-lease API. The historical local snapshot is insufficient for rollout.
- Select and verify the exact cloud Codex CLI build; settle controlled config and
  authentication injection using the chosen clean per-task-home strategy without
  suppressing required tools.
- Select the platform execution-isolation primitive and demonstrate that world
  code cannot reach authentication or publisher credentials.
- Agree on final package/tool names with the main design before implementation.
- Decide imagegen qualification cache freshness and per-account capability handling.
- Calibrate CPU/GPU resource and operation deadlines from real canaries; no
  throughput or latency promise is made by the provisional resource values.
- Define real GPU/product-performance thresholds and the test hardware; simulation
  duration alone does not establish the user experience.
- Confirm final styled-delivery profile requirements, while preserving runtime
  tri-view and identity correspondence in every required output.

These are implementation/deployment decisions, not reasons to reduce the required
outcome to a prompt rewrite. A release cannot claim cloud creator support before
the executable profile, tools, trust boundaries, and end-to-end evidence pass.

## 15. Sources

- [Main World Agent specification](./2026-09-05-gpt6-controllable-world-agent-design.md).
- [Project authoring/runtime rules](../../../AGENTS.md), baseline `50a1e14a`.
- [Cloud orchestration README](../../../scripts/cloud/README.md) and
  [Scene Worker Dockerfile](../../../deploy/cloud-worker/Dockerfile).
- [Generic Codex client](../../../scripts/agents/run-lwdp-codex-task.mjs) and
  [scene pipeline](../../../scripts/agents/run-spatial-world-agent.sh).
- [Runtime preview](../../../scripts/agents/agent-runtime-preview.ts),
  [capture CLI](../../../scripts/cli/worldkit.ts), and
  [deterministic capture](../../../scripts/lib/deterministic-playthrough-capture.ts).
- [Official Codex MCP documentation](https://learn.chatgpt.com/docs/extend/mcp?surface=cli),
  fetched 2026-09-05: supported transports, required servers, tool lists and timeouts.
- [Official plugin documentation](https://learn.chatgpt.com/docs/plugins), fetched
  2026-09-05: skills/connectors/MCP components and new-session loading after installation.
- Local LWDP Generation API skill at
  `/Users/oricter/.codex/skills/lwdp-generation-api/SKILL.md`, inspected 2026-09-05;
  protocol/deployment guidance, not current cluster-state evidence.
- Historical local LWDP source snapshot at
  `/Users/oricter/Desktop/code/Agent/leap_world_data_codex_media_fix_20260725`,
  revision `9b5bfbd`; `ray_pipeline/generation/codex_runner.py`, `codex_job.py`,
  and `t2i.py`. Current production equivalence remains unverified.
