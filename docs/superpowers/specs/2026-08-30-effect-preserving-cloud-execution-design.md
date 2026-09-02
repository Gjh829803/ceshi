# Effect-Preserving Cloud Execution Migration

## Decision

Cloud migration changes orchestration, workspace lifetime, artifact transport,
and execution location only. It does not change Planner, Block Builder, Visual
Reconstructor, Episode prompts, Skills, model selection, repair loops, authored
outputs, Host replay, compilation, Runtime, capture, or media conformance.

The first production slice wraps the existing Scene pipeline in one durable
LWDP Cloud Execution worker stage named `scene-production`. That worker runs the
unchanged `scripts/agents/run-spatial-world-agent.sh` inside an ephemeral cloud
workspace. Planner, Builder, and Visual Reconstructor therefore keep submitting
the same formal `gpt-5.6-sol` / `xhigh` Generic Codex tasks with the same closed
context and output contracts. Internal `WORLDKIT_STAGE` markers are reported as
worker progress; they are not new retry or authority boundaries.

## Authority boundaries

- LWDP Cloud Execution owns request idempotency, durable state, lease expiry,
  cancellation, and the terminal parent result.
- The existing Agent tasks own exactly the same authored outputs as before.
- The trusted WorldKit Host inside the worker owns replay, compilation,
  Babylon/Havok capture, Snapshot, receipt signing, and promotion.
- S3 owns all durable inputs and outputs. Worker filesystem state is disposable.
- Studio and test tooling keep only execution IDs and metadata; they do not
  retain generated images, worlds, or videos on the user's machine.

## Artifact layout

```text
<execution-prefix>/
  inputs/request.json
  inputs/references/<index>.<ext>
  stages/scene-production/scene/**
  stages/scene-production/scene-plan/**
  stages/scene-production/cloud-artifact-manifest.json
  stages/scene-production/logs/pipeline.log
```

The cloud artifact manifest records relative path, content type, byte size,
SHA-256, S3 URI, producer stage, and required/optional status. The Cloud
Execution progress API receives only its admitted worker artifact fields; the
hash-closed manifest remains the durable storage contract until LWDP exposes a
unified first-class Artifact Registry for Codex and worker outputs.

## Work graph

| ID | Goal and independently verifiable deliverable | depends_on | blocks | Exclusive ownership / integration | Evidence | Mode |
| --- | --- | --- | --- | --- | --- | --- |
| `CE-01` | Add an idempotent Cloud Execution API client with recovery, lease, progress, retry, cancel, capacity, and polling | — | `CE-02`, `CE-03` | `scripts/lib/lwdp-cloud-execution-client.mjs` | mocked HTTP contract tests and live read-only capacity probe | sequential |
| `CE-02` | Package the existing Scene pipeline as one ephemeral worker without changing Agent inputs or behavior | `CE-01` | `CE-04` | cloud worker, artifact manifest, stage heartbeat parser | local worker fixture and exact prompt/Skill source census | sequential |
| `CE-03` | Submit source images directly to S3 and create a one-stage durable Scene execution | `CE-01` | `CE-04` | submit CLI and request schema | idempotent live control-plane smoke | parallel-safe after CE-01 |
| `CE-04` | Build and deploy the pinned worker image and launcher | `CE-02`, `CE-03` | `CE-05` | Dockerfile and Kubernetes Job contract | image digest, one cloud smoke, lease/cleanup evidence | sequential |
| `CE-05` | Run one real Case to terminal and compare its deterministic Host artifacts with the unchanged pipeline contract | `CE-04` | `CE-06` | one Scene execution | build identity, self-check receipts, Snapshot V4, playable capture | main-agent-only |
| `CE-06` | Submit and monitor twenty current test-set Cases, repairing only orchestration/storage/infrastructure defects | `CE-05` | `CE-07` | batch manifest and execution IDs | terminal status table, failed-stage diagnostics, artifact admission | main-agent-only |
| `CE-07` | Expose cloud execution/artifact state through Studio without local durable media | `CE-05` | — | Studio cloud adapter and URLs | Studio tests, range streaming/preview smoke, local disk census | sequential |

## Non-regression rules

1. Existing prompt strings and Skill bytes are inputs, never re-authored by the
   cloud adapter.
2. Formal Agent jobs remain `gpt-5.6-sol` / `xhigh`.
3. The cloud worker uses one pinned repository commit and dependency lock.
4. Every worker stage has a unique temporary workspace and removes it on exit.
5. A worker success requires the same Host gates and required artifacts as the
   existing pipeline.
6. Infrastructure retries reuse immutable source inputs and create a new Cloud
   Execution stage attempt; they never silently regenerate Planner output in a
   downstream-only retry.
7. Tri-view or styled-output failure never revokes an admitted playable
   whitebox receipt.

## Implemented production slice

The implemented slice deliberately uses one coarse worker stage rather than
the built-in ten-stage Scene template. The existing pipeline already places
Planner self-repair inside Planner, Builder structural and visual self-review
inside Builder, and trusted replay/capture inside Host. Re-describing those
steps as separate cloud stages would change retry and context boundaries and is
therefore outside this migration.

The caller uploads only original test-set images and a schema-versioned request
document. The worker verifies every reference hash before invoking the existing
command. On completion it uploads the Scene artifact tree, public Scene-plan
tree, pipeline log, and a SHA-256 manifest to S3. Kubernetes injects the LWDP
token and Host capture key; neither secret is part of the artifact bundle.

## Episode production slice

Episode production uses one LWDP execution with three coarse engineering stages:
`episode-prepare -> whitebox-capture -> episode-render`. This split does not
change an Agent or prompt boundary. CPU prepare runs the existing reconnaissance,
navigation and Playthrough Planner; shared GPU capture runs the exact six
independent deterministic 30-second captures; CPU render resumes those bytes and
runs the existing visual reconstruction, one Gemini five-event call, six direct
Seedance 2.5 720p Jobs, conformance and portable ZIP publication.

`episode-prepare` uploads its hash-closed checkpoint and one immutable GPU queue
entry. The production dispatcher does not create a GPU Job below 100 compatible
ready entries. At 100–128 it starts one digest-pinned GPU Pod, which processes the
whole Batch sequentially and publishes an isolated receipt for every Episode.
One task failure never terminates the remaining Batch. The Pod is reused for the
entire Batch rather than created once per Episode.

Every stage attempt writes to its own S3 prefix. Provider request payload and
idempotency identity are additionally checkpointed immediately around Seedance
submission, so a hard Worker loss can resume the same provider Job. Studio
projects run state from LWDP and the S3 Run Index; local Episode files are a
compatibility cache, not production authority. Video and ZIP requests redirect
to short-lived S3 URLs and do not require durable local media.
