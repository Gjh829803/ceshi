# Three Episode production

This independent Host pipeline consumes an already delivered `three-sdk` world.
It does not add a Creator preview/recording gate. It creates six 30-second,
1280×720, 24 FPS recordings, ten visual styles, and sixty prepared rendering
requests. **Every executable entry requires `--stop-before-seedance`. No video
provider submission is implemented in this lane.**

## Boundaries

- `source.ts` verifies the closed Creator payload, preserves author source and
  compiled entries, and explicitly derives a new runtime/playable identity for
  older deliveries. It never overwrites the published world.
- `mcp.ts` supplies the actual `episode_observe`, `episode_probe`, and
  `episode_submit_plan` tools to the isolated cloud GPT-6/xhigh planner.
- `capture.ts` executes the planner's free coordinates through the same SDK
  input, Rapier physics, animation, camera and fixed 60 Hz clock. Six segments
  share one initialized browser/reset baseline. Each output frame is real;
  encoding never pads, interpolates or changes capture dimensions.
- `EpisodeFrame.captureSurface` is `world-renderer-canvas`. Independent DOM UI,
  UI canvases and displayed model output are excluded. UI already authored
  inside the original Three scene is still scene geometry and cannot be
  automatically separated.
- `capture-cloud.mjs` enqueues a registered capture task and returns a durable
  paused state. A single L4 batch worker records the six segments; successful
  segments survive route repairs. Route decisions remain Agent-owned.
- `visuals.mjs` locks independently accepted style anchors, generates complete
  target tri-views and segment openings, prepares video-only events, and writes
  `pre-seedance-manifest.json`. All target IDs are retained.
- `cloud.mjs` persists exact request identities and unknown submission states.
  Do not delete journals or submit another job to get around a pending job.
- `outbox.mjs` is the delivery deduplication adapter. Automatic delivery-service
  subscription is not deployed by the single-case experiment; invoking the
  workflow currently creates its event. Creator-wide background production
  must not be described as enabled until an actual delivery consumer is wired.

## Source preparation

```sh
pnpm exec tsx scripts/three-episode/source.ts \
  --payload /absolute/verified/payload \
  --output /absolute/episode/source \
  --world-id case-id
```

The portable `source.json` records original and derived world/runtime hashes.
Only the new production copy receives the current SDK.

## Portable source copying and received-package verification

When preparing a capture capsule from an existing `source.json`, copy its full
manifest dependency closure. Do not select only `source/`, `playable/` and
`captures/`: the original reference, world plan and context may live elsewhere.

```sh
pnpm three:episode:source --copy /absolute/original/source.json --output /absolute/new-capsule/case
pnpm three:episode:source --verify /absolute/unpacked-capsule/case/source.json
```

`copyEpisodeSourceBundle` copies all declared source/playable files and the
opening, target views, optional reference image, world plan and context. It
checks each copied file and runs `loadEpisodeSource` on the destination before
returning. Runtime and world identities remain unchanged; it neither rewrites
the SDK nor copies unrelated review stores. The output must be a new or empty
directory outside the source bundle.

Run `--verify` again **after transport and extraction**, before admitting a
capture job. A locally valid source cannot prove a later archive retained every
file. A declared context must be an ordinary package-local file; images and
source/playable files also retain their declared hash validation. Source
preparation from a Creator payload now reloads its completed output as well.

## Batch admission and deployment

Only whitebox recording/first-frame/tri-view extraction requests a GPU. Planner
observations use the existing CPU SwiftShader browser path. The formal queue
admits 100 compatible Episode tasks, or immediately admits the remainder once
all registered producers in that cohort have reached a known terminal state.
One task means all six recordings for one Episode. GPU concurrency is one;
H100 and individual GPU Host submissions are rejected.

The queue uses Kubernetes ConfigMap `resourceVersion` compare-and-swap, one
immutable case roster per cohort, and one global GPU execution slot. Each cohort
is bounded to 250 cases and 850 KB of state; larger campaigns must register
multiple cohorts. Cases cannot be added to a sealed roster. No queue timeout
is treated as proof that upstream has finished.

Before starting CPU prepare jobs, register their exact Episode IDs:

```sh
node scripts/three-episode/batch-cli.mjs register \
  --cohort production-run-001 --cases-file /absolute/case-ids.json
```

The JSON file is an array of the actual `--episode-id` values. Prepare failures
that reach a known final state are recorded by the workflow. For externally
managed producers, explicitly report final failure/cancellation; never use
this to hide an unknown or still-running submission:

```sh
node scripts/three-episode/batch-cli.mjs terminal \
  --cohort production-run-001 --case actual-episode-id --status failed-final
node scripts/three-episode/batch-cli.mjs status --cohort production-run-001
node scripts/three-episode/batch-cli.mjs reconcile
```

Add `captureCohortId`, `sourceArchiveSha256` and, if different from the default,
`sourceManifestRelativePath` to `.codex-tmp/three-episode-runtime.json`.
The archive hash is mandatory for both CPU Host and capture. Freeze the updated
code into the source capsule and worker image; old r9/r10 archives must not be
replayed. The image must contain `batch-cli.mjs`; the source capsule must contain
the same compatible batch implementation. The small-tail test used image `455922bb…`; the final controller image is
`00637f56…`. Full digests and scope are recorded in the validation report.

`three-episode-batch-infrastructure.mjs <digest-pinned-image> [namespace]` emits
an installation List containing dedicated service accounts/RBAC, a single-card
`g6.2xlarge` Spot NodePool, a one-minute CPU reconciler CronJob and fail-closed
admission policies. The pool reuses the existing
`ray-gpu-ec2-all-baked` NodeClass and waits two idle minutes before considering
consolidation. Confirm NodeClass/AMI, CPU capacity, image digest and AWS read
permissions before activation. Apply admission policy/RBAC first, then pool and
reconciler. Disable the old dispatcher for these tasks before enabling this one;
its global slot is not shared with the new Three queue.

The dedicated accounts, RBAC, single-card pool and admission policies are now
installed. A pool-scoped NVIDIA device-plugin DaemonSet was added because the
shared plugin does not tolerate this pool's isolation taint; shared DaemonSets
were not changed. Live server admission accepted the L4 Pod and rejected the
H100 Pod. Both reconciler CronJobs are deliberately suspended and the global
queue is paused after the bounded test; no unattended production is enabled.

The real small-tail test completed one Episode/six clips and CPU capture
admission. Two Spot fleet attempts had no capacity; this test temporarily used
one g6.2xlarge On-Demand instance, then restored Spot. The instance, Node,
NodeClaim and root EBS volume were all verified removed. No new style images or
Seedance jobs were submitted. This verifies the capture/continuation/resource
boundary, not a new full visual-generation campaign or 100-case throughput.

GPU workers publish a verified per-case receipt; CPU reconciliation submits a
separate pre-Seedance continuation after the producing CPU Job ends. CPU
postprocessing has its own two-slot admission cap, independent of the GPU slot. The old
Seedance-capable `episode-render` path is not called. An admitted batch interrupted
at the Pod level may recover at most once, after the old Pod is terminal; only
missing cases/segments run again. A bad case does not restart the entire batch.
Unknown create results reconcile the same Job identity. `pause` freezes dispatch
and cancels an active owned GPU Job on reconciliation; `cancel --cohort ID` is
persistent and cannot be undone by recovery. `resume` only removes the global
pause; it does not resurrect cancelled cohorts.

The CPU reconciler separately records `cleanup-pending` and `resource-closed`.
It queries EC2, Spot request and volume evidence using project-local AWS
credentials. Missing read permissions or incomplete volume evidence keep it
pending. It never terminates shared nodes itself. CPU terminal receipts are persisted after the checkpoint upload. Confirmed
transient failures can resume once from the latest checkpoint; unknown removed
Jobs release capacity only after their Pods are absent, remain attention-required,
and are not blindly resubmitted. Successful whitebox media is retained.

GPU workers cache one hash-locked capsule (compressed limit 1 GiB, expanded limit
4 GiB). They verify the uploaded manifest against local bytes; CPU admission
performs the complete media download/hash verification. The one-case cloud test
did not measure a repeated-capsule cache hit or savings across different worlds.

See [implementation and verification](../../docs/superpowers/plans/2026-09-06-three-episode-batch-capture.md).

## Cloud execution

Freeze a toolkit, Linux dependencies, portable source, and
`scripts/three-episode/episode-runtime.json` under a unique FSx release directory.
Package the same release for a digest-pinned cloud Host image.
`.codex-tmp/three-episode-runtime.json` supplies launcher and source paths,
source hash, S3 prefixes, image digest, and bounded concurrency.
Provider credentials are materialized only from the Host's Kubernetes Secrets;
Planner MCP and Chromium receive no provider credentials.

Inside that isolated Host:

```sh
node scripts/cloud/three-episode-host.mjs --run \
  --import ./node_modules/tsx/dist/loader.mjs \
  scripts/three-episode/workflow.ts \
  --source-manifest inputs/source/source.json \
  --output-root output/episode \
  --episode-id episode-case-run \
  --publish-s3 s3://bucket/owned-run/host \
  --stop-before-seedance
```

`--until plan` and `--until capture` are optional earlier stops. Preserve
`output/episode` and its provider journals when resuming. The final report is
`output/episode/report/index.html`; it presents existing artifacts and truthful
production states. A provider job status alone is not a successful delivery.

## Validation

```sh
pnpm exec vitest run scripts/three-episode packages/three-world/src/episode.test.ts packages/three-world/src/presentation.test.ts
node --test scripts/three-episode/*.test.mjs
pnpm typecheck
pnpm test:census
```

Tests include actual stdio MCP and Chromium; cloud transport/image fixtures
verify contracts but are not real cloud generation evidence. See the dated
continuation plan and `.codex-tmp/three-episode-evidence/` for this run's evidence.

Resume a failed cloud attempt with `scripts/three-episode/resume.ts`, passing
`--checkpoint-s3`, `--source-manifest`, `--output-root`, `--publish-s3`, and
`--stop-before-seedance`. Use the same absolute output root in the new isolated
Host. Closed six-clip captures are hash-verified before reuse. A Host-selected
`stylePlanCandidate` in the private runtime configuration is only an untrusted
draft for a fresh cloud task; it never bypasses independent delivery validation.
Launcher transport logs live outside the Agent workspace while the model runs.

When the SDK runtime changes, use `scripts/three-episode/rerun-runtime.ts` with
those same arguments plus a fresh `--episode-id`. Its predecessor must be a
closed failed checkpoint. It creates fresh planning, capture and review state;
only completed image recipes are staged, and exact input/file hashes still
control reuse. Optional `routePlanCandidate` requires the unchanged author
`sourceHash` and candidate `sha256`, and is re-submitted by the cloud Agent under
the current derived world hash. Never rewrite old recording provenance to make
it match a new runtime.

Native image generation uses one current whitebox reference per image. An accepted
anchor is converted by cloud Codex into a text appearance dictionary bound to the
anchor SHA256 and every ordered target ID. This prevents additional image layouts
from competing with the current camera/tri-view composition; subsequent reviewers
still compare the actual generated images against the accepted anchor. Histories
are namespaced by image-input policy, preserving failed earlier-policy evidence.

## User-calibrated review

`config/prompts/three-episode-review.md` now evaluates practical spatial/motion
correspondence, allowing modest framing, silhouette and decorative differences.
Reject material changes to camera/visible side, principal entities, route space,
readability or actual large-scale topology; do not turn cosmetic notes into failures.

`config/three-episode-review-calibration.json` records explicit user decisions for
exact opening-image hashes, world/plan/whitebox identities and policy version. Add a
new decision for subsequent user feedback; do not fabricate decisions from source
assets. Include this config and `review-policy.mjs` in the next frozen cloud release.
An exact user-accepted anchor can be reused without regeneration. Original cloud
verdicts remain unchanged; user admissions are separate records in histories and
outputs. They never approve later frames, tri-views or videos. A changed rubric first
re-evaluates the existing candidate before attempting another image, preserving the
old attempt count. Changing review instructions/acceptances invalidates only the
relevant review cache; it does not erase images or historical provider journals.

## Player input policy

`player-controller.ts` wraps the Agent's route with versioned player inputs:
brief look-around pauses, two moving side glances, small pitch changes, short
sprints/walk breaks and one locally probed jump on Segments 00/02/04 when the
subject supports it. Pause time is excluded from route-stuck detection. Local
capsule/support probes only inspect the current Agent edge; they are not a
ballistic clearance proof or a global navigation catalog. The SDK remains the
sole owner of physics, animation, camera collision and simulation time.

`health.json` measures rendered camera travel/range, actual movement with gait
inputs, and input-associated upward takeoff/landing. Missing visible camera
rotation, gait variation or a requested-but-uncompleted jump fails the capture.
Unsafe jumps are bounded deferrals, and unsupported actions remain explicit.
The full 30 seconds/720 frames/1800 ticks and untouched opening capture remain.

`playback-policy.mjs` is shared by capture recipes, cloud dispatch and workflow
resume. Bump it when controller behavior changes; an older completed capture
cannot bypass a new policy. Include the controller and shared policy in the next
immutable cloud worker release. A local recording is developer evidence, not a
cloud capture delivery. Image approvals remain bound to their original first
frame hashes; a new renderer or first frame never inherits them automatically.

For local review, `node scripts/three-episode/preview-server.mjs REPORT_DIRECTORY
53747` serves only that directory on loopback and supports native video seeking
with HTTP byte ranges. Keep its lifetime independent of a short shell session
when leaving the review page open for the user.

## One original-reference style plus nine reinterpretations

When a user original exists, package its exact bytes with `prepareEpisodeSource`
(`referenceImage: {path, sha256}`), or pass `--reference-image FILE
--reference-image-sha256 HASH` to the source CLI. It is a portable, hash-verified
source artifact independent of the scene/runtime identity. Never substitute the
whitebox, a generated concept, or an inferred style for a missing original.

The Style Director and independent reviews receive the original image. Exactly
one variant must use `styleMode: "source-reference"` and the exact
`referenceImageSha256`; its reserved ID defaults to `style-00`. A recovery may set
`referenceStyleVariantId` to another slot (this case uses `style-02`) to preserve
previously accepted IDs. Its subject, landmarks, materials, palette, illumination
and photographic/illustrative treatment follow the original. Nine other variants
remain diverse reinterpretations; do not count the original as an eleventh style.

ImageGen still receives only the current whitebox composition image. The Director
writes the observed original appearance into that slot's complete prompt and target
descriptions. Reviews compare the actual original, whitebox and output independently;
copying the original camera, retaining low-poly whitebox shading, or relabeling an
unrelated concept does not satisfy original-style fidelity. Subsequent views use
the admitted anchor's appearance dictionary as before. Original reference identity
participates in planning/review/cache identities; missing or corrupted references
cannot be admitted. Historical image approvals keep their existing scoped receipts.

## Resume selected anchors after a policy update

The optional runtime `anchorContinuation: {path,sha256}` names a frozen
`three-episode-anchor-continuation` manifest. It closes the exact source/runtime,
whitebox opening, current and historical style plans, ten images, spent attempts
and an explicit bounded additional budget (0–2 per slot). The new Director must
preserve all imported variant definitions. Every image is verified before reuse.
Original user decisions carry only across unchanged variant definitions and exact
opening bytes, with the original approval receipt retained; later frames still
need independent review. A changed world or opening fails closed.

`continue.ts` can seed an existing cloud Agent plan into a fresh run from its
actual `episode_submit_plan` receipt and original source manifest. It validates
source/runtime/scene closure and does not run a Host route planner. Normal cloud
capture, style reviews and pre-Seedance preparation then continue through
`workflow.ts`. Keep the immutable run inputs, logs and provider request journals.

### Failure and cancellation closure (r13)

The workflow records its original error before attempting producer cleanup or
publication. Only a still-pending producer may be failed by this cleanup; a
restored pre-capture checkpoint does not imply the producer is still pending.
CPU success requires an explicit `prepared` or `paused-before-visuals` state and
a successful checkpoint publication. Cleanup failures preserve the primary error.
A missing application receipt is `unknown`, even if Kubernetes says Complete.

CPU receipt identity includes an unacknowledged `cpuPending` attempt. Its durable
success prevents another create after Job TTL; retryable failure uses the latest
checkpoint with a maximum of two attempts. Old-attempt receipts are rejected.
Slots are released only after the owned execution has no active Pods.

Cohort cancellation prevents new submissions and the reconciler deletes active
owned CPU Jobs, including a Job created concurrently with cancellation. Cancellation
cleanup still runs with queue admission paused; suspending the CronJob itself
requires an explicit `reconcile` invocation to perform cleanup.
Before each Codex/T2I POST, the worker persists its exact pipeline/request identity
in the cohort. Cancellation resolves unknown submissions by that identity and
cancels only the resulting owned job. Each reconcile handles at most three remote
cancellations, with five-second HTTP timeouts and durable retry state. Terminal
remote history stays in local/S3 journals; the cohort retains only outstanding
calls and its last cancellation result, keeping the queue bounded.
Already-issued synchronous Gemini requests have no supported cancellation API.
They remain `cancellation-unconfirmed` with `attentionRequired`, never falsely
reported stopped or automatically resubmitted. New downstream calls are blocked.

The r13 controller image and frozen source capsule are recorded in
[the fix verification report](../../docs/reviews/2026-09-06-three-episode-fixes-validation.md).
Both deployed CronJobs remain suspended. Existing source archives and completed
cohorts remain immutable; new work must select the new image and matching source
archive together. This update does not start a cohort or submit Seedance.

### Human-ten delivery compatibility and UI removal

`prepareEpisodeSource` recognizes the original runtime hash recorded in
`compat/creator-camera-provenance.json`. For that delivery it compiles the pinned
Creator camera kernel with the SDK Episode port. The kernel's original follow,
quaternion transition and collision code is retained; the only behavioral extension
is rebasing its pose/memory when the SDK initializes an Episode segment. Selection
happens at build time: there is one camera writer, one scene and one physics world.
The override bytes participate in the runtime cache identity; default builds do
not consume the compatibility kernel.

The derived page loads `episode-presentation.js` and hides DOM HUD, instructions,
menus, notifications and secondary canvases, including elements created later.
Only the observer renderer's canvas is shown and captured. Nodes remain available
to author callbacks. World-space signs/materials remain part of the scene. This is
scoped to the production copy; author sources and compiled scene entries are
unchanged, while the new HTML/presentation bytes receive a new playable identity.
An existing nonempty output directory is rejected instead of overwritten.

For `important-representatives-v1`, use the manifest's conditioning entity list
rather than every historical triview. The capture alias `player` resolves through
`orientationTargetId` to the real actor (for example `traveler`). The exact original
reference is retained for the required original-style candidate.

The human-ten adapter is currently local only. See
[adaptation evidence](../../docs/reviews/2026-09-06-three-episode-human-ten-adaptation.md).
No real case recording, cloud submission, deployment or Seedance run accompanied
this adaptation.

### 已录制案例的独立后处理并发

全局队列 `maximumCpuSlots` 默认 2，显式生产配置允许 1–9；案例拥有安全检查点和有效接续回执后，即可独立进入 CPU 后处理，无需等待其他案例补录。每个后处理 Host 请求 500m CPU / 4Gi，保留 4 CPU / 12Gi 上限。GPU 的单卡 L4 约束保持独立。并发上限是准入容量，必须另查 Pod 是否 Running 和服务端账号槽位，不能把 Pending 算作正在生成。账号额度表不保证实时可用，以实际任务错误为准；增大并发不绕过额度或有界重试。

### 按样式独立准备 Seedance 输入

默认采用 streaming 流程：单个样式的锚点检查、首帧与全部目标三视图、素材检查、视觉事件、六条渲染请求按依赖接续。优先 style-00，一套样式可使用配置允许的图像并发槽；后续样式不受前一套明确失败的影响。任何时候都不调用视频提交接口。

`visuals/ready-render-requests.json` 是独立样式就绪清单，保存世界/锚点/素材检查/请求hash，`readinessScope=independent-style`。每新增六条请求即发布检查点，恢复时先重新校验既有请求对应文件和hash，保留仍有效的就绪样式；失效输入不继续展示为就绪。跨样式差异检查作为后续批次报告，不能自动改写已就绪的样式；其pending/检查结果与单样式就绪分开报告。完整60条汇总仍写pre-seedance-manifest.json。`streaming=false`保留原批次流程用于兼容与回归。

冻结过的捕获源包通过独立CPU streaming overlay升级：镜像与三个工作流文件hash均固定，补丁安装在源包解压之后，不能改动捕获GPU。全局队列streamingOverlay决定后续CPU接续采用哪个版本；运行中Host需先停止唯一工作流写入、发布完整检查点，再通过队列身份迁移切换Host；不得同时运行两个写入者。保留在途provider request/job ID，以原请求恢复。
