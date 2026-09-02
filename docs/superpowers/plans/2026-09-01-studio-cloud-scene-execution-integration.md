# Studio Cloud Scene Execution Integration

## Decision

World production has one routing rule:

- `codexBackend: "cloud"` means the complete Scene workflow runs inside one
  digest-pinned Cloud Scene Worker: Planner, Builder, trusted Host replay,
  Babylon capture, entry validation, Visual Reconstructor, signed artifact
  publication, and S3 delivery.
- `codexBackend: "local"` remains an explicit developer-only lane and runs the
  same workflow locally. Production cloud runs must never fall back to local
  Host capture.

The Planner, Builder, Host checks, capture contracts, prompts, and visual
generation behavior stay unchanged. This change moves execution and durable
storage; it does not introduce a second Scene-production implementation.

## Work graph

### C1 — Cloud execution contract

- **Goal:** freeze the single router and the durable Record/Manifest contract.
- **Depends on:** none.
- **Blocks:** C2, C3, C4, C5.
- **Ownership:** this document, Cloud Execution client types, Studio Record
  fields, remote artifact descriptor names.
- **Input:** immutable scene request, selected `codexBackend`, reference image.
- **Output:** one Cloud Execution ID, stage ID, request ID, digest-pinned worker
  image, and one S3 cloud artifact manifest URI.
- **Integration point:** Studio `runJob` dispatch.
- **Evidence:** schema/unit tests plus a request/record round trip.
- **Execution:** main-agent-only.

### C2 — Monotonic Studio state machine

- **Goal:** prevent stale workers or reconcilers from regressing a newer or
  terminal Record and prevent duplicate stage submission.
- **Depends on:** C1.
- **Blocks:** C3.
- **Ownership:** Studio Record mutation and remote reconciliation only.
- **Input:** expected record revision, attempt, execution ID, stage ID, and
  remote Job ID.
- **Output:** conditional transition result: `applied`, `already-complete`, or
  `stale`.
- **Integration point:** every queued/running/remote-pending/failed/ready write.
- **Evidence:** adversarial tests for ready-during-recovery, old attempt failure,
  old remote Job failure, active execution reconciliation, and duplicate
  recovery.
- **Execution:** sequential.

### C3 — Studio Cloud Scene orchestration

- **Goal:** route cloud production through the existing Cloud Scene Worker and
  never spawn the local Scene pipeline for a cloud Record.
- **Depends on:** C1, C2.
- **Blocks:** C4, C6.
- **Ownership:** Studio cloud dispatch/poll/cancel/retry adapter and Cloud
  Execution client extensions.
- **Input:** Studio Record and project-local Cloud Worker configuration.
- **Output:** persisted execution identity, progress, terminal result, and
  artifact manifest URI.
- **Integration point:** Studio queue runner.
- **Evidence:** mocked end-to-end Studio tests and Cloud orchestration tests.
- **Execution:** sequential.

### C4 — Remote artifact and Preview admission

- **Goal:** keep large artifacts in S3 while preserving details, downloads, and
  playable Preview.
- **Depends on:** C1, C3.
- **Blocks:** C6.
- **Ownership:** cloud artifact resolver, trusted manifest admission, Preview
  bootstrap materialization, and remote artifact HTTP responses.
- **Input:** signed Cloud artifact manifest plus separately trusted capture
  public key.
- **Output:** small persisted remote artifact index and on-demand streamed
  content; no durable local Scene bundle.
- **Integration point:** Studio artifact and Preview APIs.
- **Evidence:** forged manifest rejection, hash mismatch rejection, range/stream
  tests, and remote Preview bootstrap test.
- **Execution:** sequential.

### C5 — Cloud capture resilience

- **Goal:** distinguish slow progress from a dead Runtime and make transient
  browser navigation recoverable without rerunning Agents.
- **Depends on:** C1.
- **Blocks:** C6.
- **Ownership:** Capture CLI/browser diagnostics and Cloud Worker Host-resume
  policy. Runtime simulation and authored Scene behavior are out of scope.
- **Input:** trusted AuthoringSpec, implementation map, capture signing key.
- **Output:** phase timings, browser diagnostics, signed capture artifacts, or a
  retryable Host-capture failure classification.
- **Integration point:** `worldkit capture` inside the Cloud Scene Worker.
- **Evidence:** navigation-destroyed retry, progress-aware timeout, no-progress
  timeout, and Host-only resume tests.
- **Execution:** sequential.

### C6 — Release verification

- **Goal:** prove the integrated path before making it the production default.
- **Depends on:** C2, C3, C4, C5.
- **Blocks:** release.
- **Ownership:** configuration examples, docs, immutable ECR image digest,
  smoke/batch manifests, and verification report.
- **Input:** exact current tree and project-local runtime configuration.
- **Output:** one successful real Cloud Scene smoke followed by a monitored
  20-case batch.
- **Integration point:** Studio and LWDP Cloud Execution.
- **Evidence:** focused tests, `test:studio`, `test:cloud-orchestration`,
  typecheck/build, signed artifact verification, playable remote Preview, and
  batch terminal counts.
- **Execution:** main-agent-only.

## Non-negotiable invariants

- `ready` is absorbing within one attempt. Only an explicit user retry creates
  a newer attempt that may leave `ready`.
- A remote result may update a Record only when execution, stage, attempt, and
  revision still match.
- A cloud Record never calls local `pnpm agent:world` or local `worldkit
  capture`.
- Cloud workers use immutable image digests and ephemeral workspaces.
- Large Scene artifacts remain in S3; Studio persists only bounded metadata and
  may stream verified bytes on demand.
- A capture-only failure reuses the exact trusted upstream artifact manifest
  and never resubmits Planner or Builder.
- A Builder infrastructure failure may reuse the exact hash-closed Planner
  handoff and rerun only Builder; it must replay Planner self-check and palette
  derivation before Builder starts and must not ask Planner to regenerate.
- Stale LWDP state is never guessed from elapsed time. Recovery requires either
  an exact successful S3 delivery closure or a terminal infrastructure result
  from the exact Ray submission.
- Visual failure never revokes a trusted playable whitebox.
