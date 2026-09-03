# Workflow design

```text
Admitted Scene manifest
  → CPU episode-prepare: reconnaissance + navigation + one Planner Codex Job
  → S3 GPU ready-wave queue
  → indexed GPU capture: six independent 30s captures per Episode
  → style plan → ten opening anchors → variant visuals and tri-views → Codex reviews
  → diversity review → Gemini events → sixty detailed prompts
  → sixty Seedance 2.5 720p Jobs → exact media conformance
  → S3 publication manifest + review ZIP
```

## Authority

- Planner owns six starts, local wander intentions, WASD/Shift/Space and I/J/K/L timing.
- Runtime owns actual movement, collision, subject pose, camera and every recorded frame.
- Host owns safe relocation, executable structure, Tick/motion health, media closure, hashes,
  idempotency and publication. It does not score exploration style.
- Episode Visual Reconstructor owns final appearance references only.
- Gemini owns five large, scene-specific and mutually different events in one call.
- Seedance owns natural motion detail, final photoreal/stylized rendering and synchronized sound,
  while the whitebox video remains the sole motion/camera/space authority.

## Independent capture semantics

The six captures share one plan and one global interaction timeline only for packaging. At each
capture boundary the Runtime resets, then Host relocates the controlled Subject to that Segment's
declared safe position and facing before frame zero. Camera starts from the Runtime tracking profile.
No segment inherits position, velocity, camera orbit or collision state from another.

The navigation-evidence producer derives a bounded, geographically distributed catalog from actual
support blocks, collider clearance and non-edge neighborhood support. All six starts must be distinct
exact members of that catalog. This is a Runtime safety contract, not a score for route or camera style.

## Selection and event distribution

All six captures generate styled openings and Seedance videos. Only 00/02/04 receive Prompt Events;
Gemini receives those three together so it can avoid repeating the same visual mechanism. Host assigns
the returned events in fixed order: two to 00, two to 02 and one to 04. This is one model request,
not three parallel requests.

## Failure and resume

Each internal stage is content-addressed and resumes when its exact inputs still match. Six whitebox
captures are the only stages that require the shared Runtime/GPU lane. Seedance Jobs are admitted
through a per-Case limit of 10 and a global limit of 96. Provider submission persists the exact payload before POST and uses one stable
Idempotency-Key; after Job ID creation, resume only polls that Job. A Seedance failure does not
recapture whitebox or regenerate Scene/Planner/Visual assets.

Cloud requests freeze the production mode and Worker image digest. Every coarse retry reuses that
request, restores only hash-verified prior artifacts, and writes its new publication beneath an
attempt-specific S3 prefix. `episode-source-receipt.json` binds the Episode to the admitted Scene.
Seedance raw checkpoints carry their own content hash and provider result URL; a corrupt checkpoint
is downloaded again from the same provider Job instead of creating a replacement Job.

New full cloud production keeps one parent LWDP execution with durable boundaries for prepare,
capture, style plan, openings, visuals, diversity, events, prompts, Seedance, conformance, and
publication. A failed boundary retries independently from its direct S3 predecessor; successful
Cases continue downstream without waiting for sibling failures. Historical and visual-sample runs
keep the three-stage replay path. Large artifacts stay in S3; disposable Workers hydrate only the
checkpoint they need, Studio streams media on demand, and no persistent local media copy is required.

LWDP caller capacity counts batches, not tasks inside a batch. One Codex or T2I request may contain
up to 1000 compatible tasks/items and occupies one of at most 120 non-terminal batch slots. At most
24 create HTTP requests may be in flight. Batch-internal account and Pod concurrency remain LWDP
scheduler settings and are not modeled as 1000 caller-side slots.
