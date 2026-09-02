# Workflow design

```text
Admitted Scene manifest
  → Runtime reconnaissance + navigation context
  → one Playthrough Planner Codex Job
  → six independent 30s deterministic captures
  → one Episode Visual Reconstructor Codex Job
  → one Gemini call: 3 videos @ 0.25fps + 3 styled frames → 5 events
  → six detailed Seedance prompts + all styled tri-views
  → six direct seedance-2.5 720p Jobs
  → exact media conformance + S3 manifest + review ZIP
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
captures are the only stages that require the shared Runtime slot. Six Seedance Jobs are admitted
through a bounded three-slot pool. Provider submission persists the exact payload before POST and uses one stable
Idempotency-Key; after Job ID creation, resume only polls that Job. A Seedance failure does not
recapture whitebox or regenerate Scene/Planner/Visual assets.

Cloud requests freeze the production mode and Worker image digest. Every coarse retry reuses that
request, restores only hash-verified prior artifacts, and writes its new publication beneath an
attempt-specific S3 prefix. `episode-source-receipt.json` binds the Episode to the admitted Scene.
Seedance raw checkpoints carry their own content hash and provider result URL; a corrupt checkpoint
is downloaded again from the same provider Job instead of creating a replacement Job.

Cloud production remains one coarse `episode-production` Worker stage. Large artifacts stay in S3;
the Studio streams them through signed URLs and never needs a persistent local media copy.
