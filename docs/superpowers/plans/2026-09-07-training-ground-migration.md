# Whitebox training ground migration

Approved user plan, 2026-09-07. Target branch: codex/three-sdk-data-production-20260907.
Donor: D:/01_Workspace/01_Loopit/07_world_model/vehicle-training-ground at c293622a63716b8473cc2a95cb485c515265945e.

## Binding requirements

Preserve the source 101-bone character, all 48 runtime actions, all 19 vehicles,
three maps, workspace UI, controls, camera modes, mounting and training facilities.
Keep one SDK simulation clock, physics owner, animation owner and camera writer.
Content belongs to the example; reusable movement/interaction execution belongs
to the SDK. Keep asset/instance identities distinct, profiles exportable and
delivery resources hash-closed. Preserve Creator v0.2 and Episode capture.
Do not create a worktree, replace the character, delete source assets, rewrite
history, deploy over existing production or restart old campaigns.

The user corrected the earlier asset-deletion interpretation: remove redundant
project-authored license commentary and obsolete guidance only. Original licenses,
attributions and provenance remain with assets. No license status is changed.

## Tasks

1. Freeze source inventory and import the runtime asset closure with provenance.
2. Integrate reusable simulation, collision, actions, mounting, camera and lifecycle.
3. Replace sdk-capabilities with the three-map workspace, profiles and instances.
4. Connect examples, catalog, compiler, capsule, delivery and Episode consumers.
5. Verify focused behavior, 19-asset smoke, family capture and independent delivery.

## Verification

19 vehicles: load, prepare, enter/exit, control, three cameras and reset.
48 character action bindings and physical training behavior. Asymmetric collisions,
water, flight, carriage, blocked exits, duplicate instances and map lifecycle.
Creator independent source: compile, browser preview, clean captures, >=180s actual
self-check, submit, relocate and consume. Episode family recordings remain real
input/physics and stop before Seedance. Final relevant Three tests, typecheck,
census and runtime prebuild. Cloud contract tests mock external calls.

## Progress

Implementation checkpoint, 2026-09-07. Work remains uncommitted in the requested
checkout. This is **not full acceptance of every item in the approved plan**.

| Task | Dependencies / owner / mode | Current evidence |
| --- | --- | --- |
| T1 inventory and content closure | none; main; main-agent-only | Pinned source, 101 bones, 48 clips, 19 vehicles; 82 copied runtime resources and generated mechanical GLBs; catalog now 22 assets including the two previous entries. |
| T2 SDK execution | T1; SDK owner; sequential | Single selected SDK physics backend and fixed clock; source movement/action/camera, mounting, instance profiles, transactional map/reset, input leases and actual-state observations. 15 SDK regressions pass. |
| T3 workspace | T1/T2; main; sequential | Three maps, original workspace modules, asset library, inspector, profiles, humanoid panel and input integrated. 19 vehicle browser checks pass across the general and corrected aircraft runs. |
| T4 Creator / Episode consumers | T2/T3; main; sequential | Catalog hash closure, modular examples/types/schema, compiler/capsule/site dependency copies, mounted Episode initialization and family-aware input routes. Independent local 181-second delivery and relocated Episode consumption pass. |
| T5 acceptance | T1–T4; main; main-agent-only | Focused physics/routes and browser evidence collected. Full family video, original action adversarial matrix, cloud production and full-gate acceptance remain open. |

Cross-cutting SDK contracts, runtime integration and candidate identity stayed with
the main integration path. Independent review reproduced three P1s (camera profile
pollution, absent local storage replacing project settings, and idle UI erasing
model input); all three were fixed with focused regressions/browser evidence.

### Verified local evidence

- `outputs/training-migration/browser/report.json`: original 19-asset run: all
  load/mount/exit/camera/reset pass, 16 movement checks pass. Its three aircraft
  failures used W instead of the documented Shift throttle/release control.
- `outputs/training-migration/browser/report-selected.json`: corrected glider,
  plane and trainer-plane checks all pass. Zero horizontal drift after held-key
  reset; model command moved the character 1.248 m; no page errors. Three-map
  cycle returns to campus. `workspace.png` is a **UI inspection screenshot**,
  deliberately not a Creator/model-conditioning capture.
- `training-families.test.ts`: 28 independent-map physics tests, 12 vehicle
  families plus character, 30-second motion/barrier checks, independent twins
  and blocked exits. No fake encoder or renderer is involved in this evidence.
- `training-route.test.ts`: 9 tests including five real 720-decision / 1,800-tick
  PlayerCaptureController integrations (rover, plane, glider, sub, space). Each
  reached two successive waypoints without teleports. These are not videos.
- `outputs/training-migration/delivery-ffmpeg9/creator-receipt.json`: actual
  Creator v0.2 same-session input 181.2599 seconds, complete real keyboard
  episode, 186.354-second encoded video, no page/runtime/network errors, captures
  and closed archive. Original failed encoder run remains in `delivery-final`.
- `outputs/training-migration/delivery-ffmpeg9/report.json`: unpacked delivery,
  separate Episode source, mounted rover initialized and driven 180 ticks;
  `episode-consumer.png` is captured from the world renderer only.
- `outputs/training-migration/rover-capture/capture-summary.json`: all six actual
  rover segments completed without cache reuse, each 720 frames / 30 seconds,
  1280×720 H264 at 24 fps. Physical route traces, start probes, health reports,
  first-frame PNGs and videos are preserved per segment. This covers the rover
  family only, not the other twelve representative classes. First-frame visual
  inspection confirms no workbench DOM in the recording.
- Runtime prebuild: `outputs/training-migration/runtime-prebuild`, runtime hash
  `12124830772d196383e8034772f693fe7ff7f1bd246a764ac20e6f8e4e1c2bde`.
- Capsule staging: `outputs/training-migration/capsule-final/stage-report.json`,
  239 files / 22 assets; all declared dependencies checked for bytes and SHA.
  This is source staging, **not a built/published Linux production capsule**.
- Root and training-example TypeScript checks, test registration census, Three
  workspace boundary and 20 evaluation-site/publisher Python tests pass.

Creator build identity:
`ab92b6412281be91e948846d94ad963271250735552480166d581675b768f08c`.
Derived Episode build:
`21291c4a1192376b1e4be5ac061fdacf8a977e42231deddce3587bc18577796f`.
Both refer to the independently authored local case, **not a cloud-generated
production case or an external publication**. Temporary outputs are gitignored.

### Full-gate result and bounded reruns

Later camera fixes and a newly authored harbor flow were checked separately in
[2026-09-07 end-to-end acceptance](../../reviews/2026-09-07-training-flow-acceptance.md),
including fresh Creator delivery, unpacked character/vehicle resource loading,
rover/boat Episode input and six newly recorded rover clips. That record owns the
new identities and final Git byte-preservation check; the counts below remain
historical evidence for the earlier migration state.

The one integrated Vitest run reported 463 passing / 16 failing out of 479 at
that tree state. It is not reported as green. Test-only Windows fixes covered
command-discriminator extraction, tar CRLF, a file-URL MCP loader, portable path
expectations and the unchanged pinned camera source's CRLF representation.
The command test, camera/workflow tests, actual MCP tests and real JPEG-to-H264
encoder subsequently passed in focused reruns. The encoder needed a 30-second
test budget on this host (original five-second timeout failed). One cold MCP
startup timed out; an unchanged rerun passed both transports.

Symbolic-link security fixtures still require a Windows privilege unavailable
on this host: compiler (5), Creator (3), Episode MCP (1), source export (1).
They were not disabled and their assertions were not weakened. The separate
Python production-sync fixture also hits this host's long-path limit; the 20
evaluation/publisher tests were run independently and passed.

### Remaining acceptance / implementation boundaries

- Arbitrary snapshot restore/replay is not supplied by this migration: snapshots
  expose actual state, reset reconstructs the solver, and Episode uses explicit
  start initialization. Do not describe observations as a rollback checkpoint.
- Terrain collision uses source envelopes and the carriage's compound bodies,
  but vehicle-to-vehicle separation still uses the donor's coarse planar pair
  treatment; collision entity IDs are not yet reported for training vehicles.
- Training does not implement navigation `actor.move-to`; Episode routes use
  actual normalized inputs. Character action data remains all 48 clips, while
  atomic skill commands cover six guarded actions plus input-driven traversal,
  swimming and surface actions—not 48 independently invocable atomic tasks.
- Complete rendered six-segment evidence for all 13 families, all humanoid
  workshop/adversarial cases, and a real cloud-generated world remain pending.
- Docker executable exists but its engine is not running. No Linux production
  capsule build, remote upload, evaluation-site publication, cloud style jobs or
  Seedance submission was performed. Existing production tasks were untouched.

### Documentation and asset preservation

Donor cleanup removed only its project-authored license-analysis paragraph from
`docs/HUMANOID_ASSET_SOURCES.md`, replacing it with a pointer to original source
notices. No source asset, original license/attribution or Git history was deleted.
Whitebox keeps original notices/provenance in the runtime resource closure, not
in the default development guide. The one-shot workspace adaptation script was
removed after integration so it cannot overwrite the hand-integrated runtime.
