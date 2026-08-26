# M6 Experimental Video Model Adapter Implementation Plan

> **Execution:** Implement task-by-task in the main process. Use subagents only when the user explicitly requests delegation. Observe every focused RED before production changes and run the relevant complete gate once on the final tree.

**Goal:** Generate a conformed final video from one gate-passed Control Capture Bundle through a provider-neutral interface and the first Seedance 2.5 adapter, with durable provenance and structural consistency evidence.

**Architecture:** A strict contracts package describes provider-neutral inputs/results. A trusted orchestrator admits immutable Capture/Validation artifacts, prepares the neutral-color reference video, owns durable exactly-once job state and conforms/evaluates output. Seedance/Ark owns only provider config, upload, submission, polling, download and sanitized status mapping. Studio remains an explicit manual trigger.

**Tech stack:** TypeScript 5.9, Node.js, Python 3 provider shim, FFmpeg/FFprobe, Vitest/Node test, current Control Capture and Validation packages.

**Spec:** `docs/superpowers/specs/2026-08-26-m6-video-model-adapter-design.md`

## Global constraints

- Formal M6 accepts only a `passed` Validation Report bound to the exact Bundle Root Hash.
- Do not add video fields to Canonical Authoring, ExecutionPlan, Runtime Snapshot or Browser Protocol.
- Provider/model/config/credentials/URLs remain behind the adapter.
- Provider creation is called at most once per Request ID; ambiguous submission is not automatically retried.
- Prompt synthesis and video generation remain separate persisted stages.
- Generated video never becomes Runtime/Capture/Route evidence.
- The existing direct browser-recording workflow remains manual and must not be presented as formal M6 Capture evidence.

## Task 1: Provider-neutral contract package

**Files:**

- Create: `packages/video-model-contracts/package.json`
- Create: `packages/video-model-contracts/tsconfig.json`
- Create: `packages/video-model-contracts/src/index.ts`
- Create: `packages/video-model-contracts/src/video-model-contracts.ts`
- Create: `packages/video-model-contracts/src/video-model-contracts.test.ts`
- Modify: workspace/package map and test census through owning files

**Produces:** exact Profile, Request, Run, output, diagnostic and consistency-report contracts from the spec.

- [ ] Add RED table tests for exact keys, plain-data snapshots, deep freeze, canonical ordering, duplicate roles/IDs, wrong Hash, invalid frame count, forbidden provider/path/URL fields, inconsistent status/output/diagnostic shapes and content-hash derivation.
- [ ] Run:

  ```bash
  pnpm exec vitest run packages/video-model-contracts/src/video-model-contracts.test.ts --no-file-parallelism --maxWorkers=1 --minWorkers=1
  ```

- [ ] Implement strict parsers/builders using `@whitebox-world/protocol` canonical JSON/Hash utilities. Declare it as a direct dependency. Do not add permissive optional fields.
- [ ] Add the package's test to the fail-closed test manifest after observing the expected `UNCLASSIFIED` census failure.
- [ ] Run focused GREEN, package typecheck and `pnpm verify:unreleased-clean-break`.

## Task 2: Capture/Validation admission and reference-video preparation

**Files:**

- Create: `packages/video-model/package.json`
- Create: `packages/video-model/src/video-model-admission.ts`
- Create: `packages/video-model/src/video-reference-preparation.ts`
- Create: adjacent tests
- Reuse: `scripts/lib/control-capture-bundle.ts`, `scripts/lib/control-capture-validation.ts`

**Produces:** trusted refs/paths → immutable `ResolvedVideoModelGenerationInputV1` in a run-scoped temporary root.

- [ ] Add RED cases for failed/incomplete/wrong-profile Validation, mismatched Bundle Root/Take/WorldPackage, missing pass/frame, wrong role order, duplicate primary/opening, prompt/image hash mismatch, symlink input, outside-root path, empty file and output frame mismatch.
- [ ] Validate Bundle bytes first, then strict Validation Report identity/status, then Request/Profile and artifact membership. Preserve the original diagnostic domain.
- [ ] Encode `frames/*/neutral-color.png` in capture-frame order to 1280×720, 24 fps H.264 without audio. Probe exact frame parity before adapter preparation.
- [ ] Copy/link no mutable inputs; reject symlinks and keep resolved artifacts read-only to the job.
- [ ] Run focused tests and the existing Control Capture/Validation suites.

## Task 3: Adapter port and durable orchestrator

**Files:**

- Create: `packages/video-model/src/video-model-adapter.ts`
- Create: `packages/video-model/src/video-model-orchestrator.ts`
- Create: `packages/video-model/src/video-model-run-store.ts`
- Create: adjacent lifecycle tests

**Produces:** admitted Request → terminal Run with one submit attempt and exact cleanup.

- [ ] Add fake-adapter RED tests for prepare throw, submit rejection, submit timeout, malformed submitted result, poll transient error, provider failure, download failure, process restart, shutdown cancellation, unsupported cancel and sibling cleanup throw.
- [ ] Atomically persist submission intent with `submitAttemptCount: 1` before `submitOnce()`. Never call it again for the same Request ID.
- [ ] Map ambiguous creation outcomes to `submission-outcome-unknown`. Resume only polling when a durable provider Run ID exists.
- [ ] Keep primary failure and append cleanup diagnostics without replacing it. Dispose owned resources exactly once in reverse order.
- [ ] Enforce bounded queue concurrency and unique scene/run temporary roots.
- [ ] Run focused lifecycle tests twice to expose leaked process/timer state.

## Task 4: Extract the Seedance 2.5 provider adapter

**Files:**

- Create: `scripts/providers/seedance25-reference-video-adapter.py`
- Create: provider unit tests with mocked HTTP/AWS/subprocess boundaries
- Create: `docs/integrations/video-model/seedance25-ark-experimental.md`
- Move: shared probe/conformance mechanics out of `scripts/run-seedance25-reference-video.py`
- Create: `config/video-model-adapters/seedance25-reference-video.json`
- Modify/delete: old direct runner/config only after all callers migrate

**Produces:** resolved immutable input → provider submission/poll/download operations with no orchestration ownership.

- [ ] Snapshot the exact provider payload: Prompt first, images in semantic role order, derived control video last, required audio, exact duration, 16:9 and no watermark.
- [ ] Add tests proving API key, Authorization, endpoint, signed URLs, bucket/object paths and raw provider bodies never enter portable output/logs.
- [ ] Add upload failure/partial cleanup, HTTP rejection, timeout unknown outcome, missing task ID, unknown status, failure status, success-without-video and corrupt download cases.
- [ ] Keep credentials from environment/keychain only. Do not copy them into job directories.
- [ ] Record the currently verified provider/API terms, model availability, region, credential source, required local tools, network/data-retention assumptions and verification date in the integration record. Do not infer production licensing from API access.
- [ ] Migrate Studio to the provider-neutral orchestrator, then delete Seedance-named Request/Run shapes rather than accepting both.

## Task 5: Output media conformance

**Files:**

- Create: `packages/video-model/src/video-media-conformance.ts` or a package-owned process wrapper
- Move/update: `scripts/seedance25-media-conformance.test.mjs`
- Test: provider-neutral media fixture matrix

**Produces:** raw provider video → exact final MP4 artifact/provenance.

- [ ] Generalize the existing Seedance conformance test to provider-neutral naming.
- [ ] Add RED fixtures for no video, no audio, wrong duration, wrong FPS, zero frames, corrupt bytes, odd dimensions and FFmpeg failure.
- [ ] Require audio from the provider; do not synthesize silence. Conform raster/FPS/frame count within the Profile policy and retain raw media statistics.
- [ ] Write to a sibling temporary file, probe it, compute bytes/Hash, then atomically promote. Failure removes the temporary file and preserves any prior successful artifact.

## Task 6: Structural consistency evaluation

**Files:**

- Create: `packages/video-model/src/video-consistency-profile.ts`
- Create: `packages/video-model/src/video-consistency-evaluator.ts`
- Create: deterministic/advisory fixture tests

**Produces:** final video + Capture passes → hash-bound `VideoStructureConsistencyReportV1`.

- [ ] Freeze one M6 development Profile with blocking/advisory checks and explicit required evidence.
- [ ] Add deterministic RED/GREEN fixtures for reversed motion, shifted start/end framing, missing primary subject, required Anchor/Region displacement, inverted occlusion order and contact contradiction.
- [ ] Add temporal drift/flicker and VLM rubric results as advisory only. Prove an overall/advisory score cannot override a blocking failure.
- [ ] Emit `incomplete` when required evidence or evaluator capability is absent; never silently pass.

## Task 7: Explicit Studio integration and portable bundle

**Files:**

- Modify: `apps/studio/recording-workbench.mjs`
- Modify: `apps/studio/recording-workbench.test.mjs`
- Modify: Studio UI/API/proxy files owning the current Generate action

**Produces:** user-selected passed Capture → queued Run → source/control/final/report downloads.

- [ ] Require an explicit Generate request naming the Capture Bundle and Validation Report identity. Reject generation before their pass status is loaded and verified.
- [ ] Persist provider-neutral `video-model-request.json`, `video-model-run.json`, `video-model-output.json` and `video-consistency-report.json`; remove hard-coded `seedance-*` state fields from Studio after migration.
- [ ] Keep prompt backend freezing/rewrite semantics unchanged. Pass only final Prompt Ref/Hash to the adapter.
- [ ] Extend queue/restart/shutdown tests for two scenes, same-recording duplicate request, unknown submission and clean cancellation.
- [ ] Bundle original manual recording separately when present; label it creative-reference evidence, not Control Capture evidence.

## Task 8: Fixed vertical slice and completion

**Files:**

- Create: one M6 fixture manifest under `examples/` or the current verifier-owned fixture root
- Create: `scripts/verify-video-model-adapter.ts`
- Create: `docs/reviews/2026-08-26-m6-video-model-adapter-completion.md`
- Modify: `docs/18-refactor-progress-and-backlog.md`, `docs/23-recording-and-video-workbench.md`, `docs/11-world-model-team-handoff.md`

- [ ] Freeze one world containing terrain, water, one moving subject, a blocking obstacle and camera motion; compile one Take, Bundle and passed Validation Report.
- [ ] Run the complete mocked provider flow and verify exact Request/Run/output/report hashes and failure attribution.
- [ ] When Seedance credentials and network are available, run one real generation. Treat unavailable credentials as a blocked external evidence lane, not proof of provider success.
- [ ] Inspect the final video for motion direction, identity, contact, occlusion, framing and drift; keep human visual notes separate from deterministic/advisory metrics.
- [ ] Run on the final tree:

  ```bash
  pnpm typecheck
  pnpm test
  pnpm build
  pnpm test:studio
  pnpm test:independent
  pnpm verify:validation-capture
  pnpm verify:control-capture-browser
  pnpm verify:unreleased-clean-break
  pnpm verify:video-model-adapter
  ```

- [ ] Apply the full-dimension design/change review and runtime lifecycle/evidence checklist. Use a fresh read-only Cursor completion review when authenticated and independently reproduce every finding.
- [ ] Mark M6 complete only when the formal Capture-backed slice passes. Do not infer completion from the pre-existing direct Recording Workbench path.
