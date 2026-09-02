# Cloud Production Run and GPU Capture Batching

## Decision

The whitebox-world to whitebox-video to Seedance pipeline uses one durable
LWDP Cloud Execution as its production identity. The Episode execution has
three coarse engineering stages without changing any Agent, Skill, prompt,
model, authored output, Runtime behavior, or media contract:

1. `episode-prepare` runs reconnaissance, navigation evidence, and the existing
   Playthrough Planner on CPU.
2. `whitebox-capture` runs the existing deterministic six-capture implementation
   on a shared GPU Batch Worker.
3. `episode-render` resumes the exact capture checkpoint on CPU and runs the
   existing visual reconstruction, Gemini, Seedance, conformance, and publication
   behavior.

Every normal GPU Batch contains 100–128 distinct ready Episode capture stages.
After every same-image registered producer has reached capture-ready, no producer
or queue publication remains in flight, and the queue has stayed stable for the
configured interval, one final smaller tail Batch is allowed. Elapsed time alone
never flushes an open producer set below 100. One GPU Pod processes the whole
Batch in one lifecycle and isolates each Episode workspace and outcome. A failed
Episode never terminates the remaining Batch.

## Durable boundaries

- LWDP owns each Production Run, stage DAG, atomic worker lease, retry,
  cancellation, heartbeat, and terminal status.
- S3 owns immutable requests, phase checkpoints, GPU queue entries, GPU Batch
  manifests, provider journals, final artifact manifests, and releases.
- A Worker filesystem is a disposable cache. A valid downstream phase hydrates
  only the hash-verified manifest reported by its direct upstream stage.
- Studio is a stateless projection of LWDP records and S3 manifests. Local
  `artifacts/` hydration remains a compatibility cache and is not production
  authority.
- GPU batching changes scheduling only. It does not change captures, frame
  cadence, camera, inputs, prompts, or final media.

## GPU queue contract

`episode-prepare` publishes one immutable queue entry after its checkpoint is
uploaded and before it reports success. The entry freezes the execution ID,
Episode ID, request URI, upstream manifest URI and hash, output prefix, Worker
image digest, and requested capture stage.

The cloud dispatcher starts no GPU when fewer than 100 eligible entries exist
while any compatible producer remains open. When the threshold is met it selects
100–128 entries in stable creation order; when the producer set is closed it may
select the stable final tail. In either case it writes one immutable Batch manifest
and creates one digest-pinned GPU Job. The
Batch Worker claims each `whitebox-capture` stage through the existing LWDP
atomic worker-lease endpoint immediately before execution. Entries already
claimed, cancelled, stale, or no longer ready are recorded as skipped; the
dispatcher replenishes the manifest before launch so the admitted Batch still
contains at least 100 executable tasks.

The Batch Worker publishes a per-task terminal receipt immediately. On Pod
recovery the same Batch manifest is replayed, completed receipts are skipped,
and incomplete Cloud Execution stages are reconciled through LWDP rather than
blindly duplicated.

## Work graph

| ID | Goal and independently verifiable deliverable | depends_on | blocks | Exclusive ownership / integration | Evidence | Mode |
| --- | --- | --- | --- | --- | --- | --- |
| `CP-01` | Versioned Production Run, phase checkpoint, Provider Journal, queue-entry, and GPU Batch contracts | — | `CP-02`, `CP-03`, `CP-04` | new cloud-production contract modules and configs | parser/adversarial tests | main-agent-only |
| `CP-02` | Execute the unchanged Episode workflow as CPU prepare, GPU capture, or CPU render | `CP-01` | `CP-03`, `CP-04` | `run-episode-workflow.mjs`, Episode Worker | phase-resume and source-identity tests | sequential |
| `CP-03` | Enforce the 100-entry production floor while producers are open, drain one closed stable tail, and process one isolated long-lived GPU Batch | `CP-01`, `CP-02` | `CP-05` | queue, dispatcher, Batch Worker, K8s manifests | open 99 does not launch, 100 launches, closed stable tail launches, partial-failure tests | sequential |
| `CP-04` | Persist stage checkpoints and provider identities outside disposable Worker storage | `CP-01`, `CP-02` | `CP-05` | S3 checkpoint and Provider Journal adapter | hard-exit/lost-response recovery tests | sequential |
| `CP-05` | Project Studio state from LWDP/S3 and launch CPU continuation after Batch capture | `CP-03`, `CP-04` | `CP-06` | Studio cloud adapter and remote artifact projection | restart/recovery tests | sequential |
| `CP-06` | Unify status, capacity, timing, cancellation, and publication around the versioned pipeline profile | `CP-05` | `CP-07` | Studio API/UI and documentation | Studio contract tests | sequential |
| `CP-07` | Prove local contracts and fault recovery without submitting a real Case | `CP-01`–`CP-06` | — | test fixtures only | typecheck, unit, Studio, build, fault-injection tests | main-agent-only |

## Release gate

No real Case is submitted by this implementation task. A later user-authorized
canary must first prove: Studio restart recovery, GPU Pod loss recovery, no GPU
launch at 99 entries while a producer remains open, one launch at 100 entries,
one launch for a stable closed-producer tail, no duplicate provider Job after
lost response, per-task Batch failure isolation, exact six-video media closure,
and zero required durable media on the initiating machine.
