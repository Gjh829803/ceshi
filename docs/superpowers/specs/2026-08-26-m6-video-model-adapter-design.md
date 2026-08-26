# M6 Experimental Video Model Adapter Design

**Status:** implementation authority

**Date:** 2026-08-26

**Baseline:** `main@dea2d8e23aaacea3811619ee63dfd9d41e8184c5`

**Upstream authorities:**

- `docs/superpowers/specs/2026-08-19-agentic-whitebox-to-video-open-source-research.md`
- `docs/superpowers/specs/2026-08-19-simulation-take-control-capture-design.md`
- `docs/superpowers/specs/2026-08-19-world-validation-report-and-quality-gates-design.md`
- `docs/23-recording-and-video-workbench.md`
- `docs/11-world-model-team-handoff.md`

## 1. Outcome

M6 freezes one provider-neutral Video Model Adapter boundary and uses the existing Seedance 2.5 reference-video integration as its first experimental provider implementation. A user explicitly selects one gate-passed Control Capture Bundle, requests generation, and receives:

- a conformed final MP4;
- a sanitized, hash-bound generation run record;
- an input/output provenance manifest;
- a structural consistency report whose failures identify the responsible stage.

The adapter does not enter Canonical Authoring Schema, WorldPackage, Runtime, Browser Protocol or the automatic Planner/Builder workflow. Generated video is a downstream visual product, never simulation, Route, physics or Capture evidence.

## 2. Current implementation and gap

The current Recording Workbench already proves useful implementation mechanics:

- explicit user-triggered recording and generation;
- a 1280×720, 24 fps, exact-frame-count media contract;
- Codex-backed Prompt synthesis with frozen cloud/local backend;
- ordered subject/environment/landmark visual references;
- private S3 upload with short-lived URLs;
- one non-idempotent Ark submission followed by read-only polling;
- exact output conformance with required audio;
- sanitized result metadata and downloadable bundles.

It is not yet the M6 SDK boundary because Studio constructs a Seedance-specific request directly, file paths and provider naming are persisted in workflow state, the runner owns orchestration and provider logic together, and the input is a browser recording rather than a gate-passed Control Capture Bundle.

M6 extracts the reusable mechanics without falsely relabeling the current manual recording as validated Capture evidence.

## 3. Scope and non-goals

### 3.1 In scope

- a versioned adapter-level request, profile, run receipt, output manifest and consistency report;
- strict admission of a `passed` Capture/Integrity Validation Report bound to the exact Control Capture Bundle Root Hash;
- deterministic derivation of a reference video from the bundle's `neutral-color` frames;
- final Prompt and ordered styled-reference artifacts by content Hash;
- one Seedance 2.5/Ark adapter behind the provider-neutral port;
- exactly-once submission attempt and explicit unknown-outcome handling;
- polling, download, conformance, sanitization, cancellation-on-shutdown when supported, cleanup and retry policy;
- structural evaluation for Region/Anchor, subject identity, contact, occlusion, motion direction and temporal drift;
- a manual Studio trigger and portable result bundle.

### 3.2 Out of scope

- automatic video generation after Planner/Builder/whitebox/first-frame/styled-triview completion;
- declaring Seedance, model endpoint, S3, Ark, signed URL or Python fields in Canonical Schema;
- treating generated pixels as WorldState, Runtime or Validation truth;
- real-time streaming, frame replacement or asynchronous Runtime rendering;
- provider bake-off, model selection or production SLA;
- training/fine-tuning, cost optimization or multi-provider routing;
- silently treating a free-form browser recording as a gate-passed Control Capture Bundle;
- changing frozen Validation V1 fields or Capture Bundle V1 media semantics.

## 4. Product boundary: formal M6 versus Recording Workbench

The two workflows coexist but make different claims:

| Workflow | Motion/control input | Claim |
| --- | --- | --- |
| Recording Workbench | user-recorded Babylon canvas clip | manual creative reference; source and generated videos remain inspectable |
| Formal M6 Adapter | gate-passed Control Capture Bundle | reproducible, hash-bound experimental SDK video-generation slice |

The existing Workbench may later call the same provider implementation, but its direct recording input does not implement `VideoModelGenerationRequestV1` and cannot produce an M6 consistency report. There is no union field that lets a caller substitute one for the other.

The automatic Hosted Scene Brief workflow remains unchanged. A user may enter either manual workflow only after a playable world exists and must explicitly request generation.

## 5. Provider-neutral contracts

These contracts live in `@whitebox-world/video-model-contracts`. They are downstream SDK contracts, not Canonical Authoring contracts.

### 5.1 Adapter Profile

```ts
export interface VideoModelAdapterProfileV1 {
  readonly kind: "video-model-adapter-profile";
  readonly id: string;
  readonly version: 1;
  readonly resourceRef: string;
  readonly contentHash: Sha256HashV1;
  readonly requiredCaptureProfileRefs: readonly string[];
  readonly requiredCapturePassIds: readonly (
    | "neutral-color"
    | "linear-depth-meters"
    | "semantic-class-id"
    | "instance-id"
    | "world-normal"
  )[];
  readonly supportedReferenceRoles: readonly VideoReferenceRoleV1[];
  readonly output: Readonly<{
    widthPixels: 1280;
    heightPixels: 720;
    framesPerSecond: 24;
    audioMode: "synchronized-effects-no-music-or-speech";
  }>;
}
```

The Profile freezes SDK requirements only. Provider endpoint, model ID, credentials, bucket, polling interval and signed-URL lifetime belong to private adapter configuration.

### 5.2 Generation Request

```ts
export type VideoReferenceRoleV1 =
  | "primary-subject-styled-triview"
  | "styled-opening-frame"
  | "styled-landmark-triview";

export interface VideoReferenceArtifactV1 {
  readonly id: string;
  readonly role: VideoReferenceRoleV1;
  readonly artifactRef: string;
  readonly contentHash: Sha256HashV1;
  readonly mediaType: "image/png";
}

export interface VideoModelGenerationRequestV1 {
  readonly kind: "worldkit-video-model-generation-request";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly requestId: string;
  readonly adapterProfileRef: string;
  readonly adapterProfileHash: Sha256HashV1;
  readonly controlCaptureBundleRef: string;
  readonly controlCaptureBundleRootHash: Sha256HashV1;
  readonly validationReportRef: string;
  readonly validationReportHash: Sha256HashV1;
  readonly finalPromptArtifactRef: string;
  readonly finalPromptContentHash: Sha256HashV1;
  readonly referenceArtifacts: readonly VideoReferenceArtifactV1[];
  readonly expectedOutput: Readonly<{
    widthPixels: 1280;
    heightPixels: 720;
    framesPerSecond: 24;
    frameCount: number;
    audioMode: "synchronized-effects-no-music-or-speech";
  }>;
}
```

The request contains no paths, URLs, headers, credentials, provider/model fields or generic parameter bag. `referenceArtifacts` is in semantic order: exactly one primary subject, exactly one opening frame, then zero or more unique landmark tri-views sorted by ID.

The trusted Host resolves Refs and Hashes to local immutable paths after rejecting symlinks, empty files, Hash mismatch, unexpected media type and paths outside the job input root.

### 5.3 Run receipt and output

```ts
export type VideoModelGenerationRunStatusV1 =
  | "preparing"
  | "submitting"
  | "submitted"
  | "running"
  | "submission-outcome-unknown"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface VideoModelGenerationRunV1 {
  readonly kind: "worldkit-video-model-generation-run";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly requestRef: string;
  readonly requestHash: Sha256HashV1;
  readonly adapterProfileRef: string;
  readonly adapterProfileHash: Sha256HashV1;
  readonly status: VideoModelGenerationRunStatusV1;
  readonly submitAttemptCount: 0 | 1;
  readonly providerRunId?: string;
  readonly providerId?: string;
  readonly resolvedModelId?: string;
  readonly startedAt: string;
  readonly finishedAt?: string;
  readonly output?: VideoModelOutputArtifactV1;
  readonly diagnostic?: VideoModelDiagnosticV1;
}
```

Provider and model identity are sanitized provenance, not semantic behavior selection. Signed URLs, endpoint URLs, headers, raw response bodies and secrets are forbidden in the portable run.

The successful output records `artifactRef`, content Hash, byte length, `video/mp4`, dimensions Pixels, FPS, frame count, duration Seconds, codecs and `hasAudio: true`.

## 6. Admission and immutable input preparation

The Host admits a request only after all checks succeed:

1. Strict parse and content-Hash verification of Request and Adapter Profile.
2. Control Capture Bundle byte validation returns the declared Root Hash.
3. Validation Report V1 strictly parses, has `status: "passed"`, targets the same bundle ID/Root Hash, and uses a Profile required by the Adapter Profile.
4. Bundle contains exactly the required Capture passes, dimensions and scheduled frame count.
5. Prompt and reference artifact bytes match their declared Hashes and roles.
6. Expected output frame count equals bundle frame count; width/height/FPS equal Profile output.
7. No earlier active or succeeded Run exists for the same `requestId` and Request Hash.

Preparation creates a scene/run-scoped temporary directory. It encodes the canonical `neutral-color` PNG sequence to a silent 1280×720 H.264 MP4 at 24 fps and verifies exact frame parity. Depth, Semantic, Instance and Normal remain available to the consistency evaluator and to future adapters; the first Seedance provider consumes only the derived neutral reference video plus styled images and Prompt.

Prepared files are immutable for the lifetime of the Run. They are never written back into the Control Capture Bundle.

## 7. Adapter port and lifecycle

```ts
export interface VideoModelAdapterV1 {
  readonly profile: VideoModelAdapterProfileV1;
  prepare(input: ResolvedVideoModelGenerationInputV1): Promise<PreparedVideoModelJobV1>;
}

export interface PreparedVideoModelJobV1 {
  submitOnce(): Promise<VideoModelSubmissionV1>;
  poll(submission: VideoModelSubmissionV1): Promise<VideoModelPollResultV1>;
  downloadSucceededOutput(
    submission: VideoModelSubmissionV1,
    temporaryOutputPath: string,
  ): Promise<void>;
  cancel(submission: VideoModelSubmissionV1): Promise<"cancelled" | "unsupported">;
  dispose(): Promise<void>;
}
```

The provider adapter may upload private references and construct provider payloads only inside `prepare/submitOnce`. The orchestrator owns Run state, persistence, timeout, polling, output conformance and final atomic promotion.

Lifecycle:

```text
admitted → preparing → submitting → submitted → running
                                ↘ submission-outcome-unknown
                     running → succeeded → conformed → evaluated
                             ↘ failed / cancelled
```

All terminal paths dispose temporary files and provider reference uploads when the provider supports deletion. Cleanup failure is retained as a provider-neutral diagnostic and never replaces the primary error.

## 8. Exactly-once submission and reconciliation

Provider job creation is non-idempotent unless the provider documents and the adapter tests an idempotency key. The orchestrator writes an atomic submission-intent journal containing `requestId`, Request Hash and `submitAttemptCount: 1` before the single creation call.

- A response with a provider Run ID commits `submitted`.
- A definitive provider rejection commits `failed`.
- A timeout, connection loss or malformed success response after bytes may have reached the provider commits `submission-outcome-unknown`.
- Automatic retry never submits again from `submission-outcome-unknown`.
- If the provider offers request-ID reconciliation, only read-only lookup may recover the earliest Run ID; later duplicates are cancelled when supported.
- Without reconciliation support, an operator/user must explicitly abandon the unknown Run before creating a new Request ID. The old history is retained.

Polling and output download are read-only/recoverable operations and may use bounded retry with jitter. Process restart scans persisted Runs: `submitted/running` resumes polling; `submitting` becomes unknown unless a durable provider Run ID already exists.

## 9. Seedance 2.5 provider implementation

The current `run-seedance25-reference-video.py` behavior is split into:

- provider-neutral orchestration and contracts owned by the TypeScript packages;
- a Seedance/Ark adapter owning private config, credentials, uploads, payload, provider status mapping and response sanitization;
- shared media probe/conformance utilities with no provider vocabulary.

The first adapter maps:

- final Prompt → provider text content;
- styled images in canonical reference-role order → provider reference images;
- derived neutral-color control video → provider reference video;
- output audio policy → `generate_audio` plus prompt restrictions;
- output ratio/duration → values derived from the admitted Request.

The provider adapter cannot choose a different duration, reorder reference roles, disable audio, add a watermark, weaken Prompt restrictions or expose signed URLs in the portable Run. Model endpoint and resolved model remain private config/sanitized provenance.

Its integration record must separately freeze the provider/API terms reviewed,
model availability scope, credential source, region, required Python/FFmpeg/AWS
CLI runtime, external network dependencies, data-retention assumptions and the
date of verification. This operational record is not copied into Canonical or
portable request fields and must be refreshed before any production claim.

## 10. Output conformance and consistency report

Before promotion, the Host verifies and conforms provider output to:

- 1280×720 Pixels;
- 24 frames per second;
- exact Control Capture frame count and duration;
- H.264/yuv420p MP4 with fast-start;
- one decodable stereo AAC audio stream at 48 kHz;
- non-empty bytes and content Hash.

Missing audio is a failure, not silent padding. Length/raster conformance may resample/pad/trim the provider output exactly as the frozen Profile permits; raw provider media statistics remain in sanitized provenance.

`VideoStructureConsistencyReportV1` binds Request Hash, Bundle Root Hash and output Hash. Its closed checks are:

| Check | Initial method | Policy |
| --- | --- | --- |
| frame count/raster/FPS/audio | deterministic media probe | blocking |
| motion direction and start/end framing | optical/feature trajectory versus neutral-color frames | blocking for gross inversion/reversal |
| primary subject identity | reference-conditioned image similarity sampled across time | blocking below frozen threshold |
| Region/Anchor preservation | projected masks/anchors compared at scheduled frames | blocking when required evidence exists |
| contact and occlusion order | depth/instance/contact transition comparison | blocking for deterministic contradictions, otherwise advisory |
| long-duration drift/flicker | temporal identity/geometry metric | advisory in M6 |
| visual quality | VLM rubric | advisory only |

Thresholds belong to a versioned Video Consistency Profile. A single overall score cannot override a failed blocking check. VLM text never replaces deterministic Capture/identity checks.

## 11. Failure attribution

Every terminal diagnostic has one `failureDomain`:

```ts
type VideoGenerationFailureDomainV1 =
  | "authoring"
  | "placement"
  | "runtime"
  | "capture"
  | "validation"
  | "prompt"
  | "adapter-admission"
  | "provider-submission"
  | "provider-execution"
  | "output-conformance"
  | "consistency-evaluation"
  | "cleanup";
```

M6 itself creates only the last seven domains. Earlier domains are copied from the exact dependency Validation Report or upstream artifact diagnostic; the adapter never guesses them from provider failure text.

Diagnostics carry stable code, safe message, artifact Ref when applicable, retryability and suggested next action. Raw provider text is sanitized and capped before storage.

## 12. Work graph

| ID | Goal and independently verifiable deliverable | `depends_on` | `blocks` | Exclusive ownership | Stable input/output and exact integration point | Required evidence | Mode |
| --- | --- | --- | --- | --- | --- | --- | --- |
| M6-C1 | Freeze adapter Profile/Request/Run/output/diagnostic contracts | M3, M4 | M6-A1, M6-S1, M6-O1 | new video-model-contracts package | untrusted JSON → strict frozen/hash-checked adapter resources | unknown-key, provider-field rejection, hash/role/order/status tests | main-agent-only |
| M6-A1 | Admit exact passed Capture/Validation identity and prepare control video | M6-C1 | M6-O1, M6-E1 | video-model orchestrator admission/preparation | Bundle + Report + refs → immutable resolved job input | wrong/failed/incomplete/mixed report, symlink/path/hash/frame tests | sequential |
| M6-S1 | Extract Seedance/Ark provider adapter | M6-C1 | M6-O1 | provider adapter/config/tests | resolved job input → sanitized submission/poll/download results | payload snapshot, secret/url sanitization, status and upload cleanup tests | sequential |
| M6-O1 | Implement durable orchestration and exactly-once submission | M6-A1, M6-S1 | M6-E1, M6-I1 | video-model orchestrator run journal/process ownership | request + adapter → terminal Run and atomically promoted output | timeout/unknown/restart/duplicate/cancel/throwing-cleanup tests | main-agent-only |
| M6-E1 | Conform output and emit structural consistency report | M6-A1, M6-O1 | M6-I1 | media conformance and video consistency evaluator | raw output + Capture passes → final artifact + report | raster/FPS/frame/audio tamper plus direction/identity/anchor/contact fixtures | sequential |
| M6-W1 | Wire explicit Studio request and portable bundle | M6-O1, M6-E1 | M6-I1 | Recording Workbench service/UI/API behind manual trigger | selected passed Capture + prompt/references → Run status/downloads | authorization, queue isolation, shutdown and path traversal tests | sequential |
| M6-I1 | Run fixed-case Seedance slice and completion review | all prior | — | main agent; one fixture, gates and completion record | one frozen WorldPackage/Take/Bundle/Report → video/report/provenance | mock contract gates, real provider run when credentials available, visual inspection | main-agent-only |

## 13. Acceptance criteria

M6 is complete when one fixed terrain/water/subject/obstacle/camera Take can be captured, pass the frozen Validation gates, generate a final video through the Seedance adapter and produce a hash-bound consistency report on one tree.

Completion additionally requires:

1. no provider/model/path/credential fields in Canonical Schema or the portable Request;
2. no generation from a failed, incomplete, mismatched or unvalidated Bundle;
3. at most one provider creation attempt per Request ID;
4. exact MP4 frame/raster/FPS/audio conformance;
5. retained sanitized Adapter Profile, Request, Run, output provenance and consistency report;
6. manual explicit trigger only;
7. clear distinction between the existing browser Recording Workbench and formal M6 Capture-backed evidence;
8. no claim of production provider choice, real-time rendering or generated-video simulation truth.
