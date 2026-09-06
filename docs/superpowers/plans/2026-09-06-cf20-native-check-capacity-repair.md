# CF-20 Native Check capacity repair

## Frozen real-Case evidence

- Candidate: `f72a4931ca341abed39ec62d1a3115859247b982`, branch
  `codex/cf-production-effect-closure`; pinned legacy reference remains
  `9e35ab53c634acaef8c53a33082fff77653f7bbb`.
- Scene: `paper-moon-054-cf-f72a493-0906`.
- Run: `run-20260906140808-99613`, attempt `0`.
- Planner execution: `planner-20260906-135631-99626`; self-check passed,
  Host promotion completed and the launcher reached `plan-ready`.
- Local formal Builder (`gpt-5.6-sol`, `xhigh`) completed with exit 0 after
  1,218,491 ms. Generation receipt says `completed`, cleanup `completed`,
  no diagnostic codes; `builder-self-check.host.json` has `ok: true`.
- Delivered `scene.ts`: 25,315 bytes,
  `sha256:41f226b6ded49074e31936bad34d8e93704f3f6564e98538353e8471552bdb20`.
- Host Native Check started Babylon NullEngine, then exhausted the roughly
  4 GiB V8 heap. Terminal error:
  `FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory`.
  Launcher returned `native-world-agent-result` with exit code `134`.
  Final GC output was around 1,633,868 ms in the Host process. Native Check
  did not produce a result; Ground, Runtime Capture and publication were not reached.

After the original process terminated, the exact frozen portable renderer replayed
the unchanged delivered source into `/tmp/cf20-mem3-capture.rpXWEo/`, exit 0.
It measured **158,100 Blocks**: background-mass 109,546; water-like-visual 30,165;
ground 7,889; structure 7,581; route 2,919. Shapes: full 151,511, half 5,239,
step 1,350. Captured identity:
`sha256:466ee4d22b40ce3cb6f0df116ee09941a7d57e521e6135be4359cdf0f1518d1d`.
This is lightweight VM/geometry-projection evidence, not successful Babylon
allocation, Native admission, Runtime capture or a repaired production outcome.
It replaces speculation about the actual source size; it does not yet identify
the exact OOM phase inside Native replay.

The run and declared source remain under `artifacts/scenes/<scene>/runs/<run>/`.
No source or historical receipt was repaired in place. Four earlier failed Cases
and their planning directories were moved to the user's Trash on explicit request;
this new failed run was not removed.

The two delivered advisory comparisons were actually viewed. The entry projection
has insufficient palace elevation and valley depth relative to the planning target;
top-down geography is also substantially simplified. This is separate CF-11/19/21
effect evidence, not a new ordinary-production veto. Builder exit 0 does not prove
scene-effect parity. This candidate is not eligible for main integration yet.

## Bounded next work

All tasks are **main-agent-only**, sequential; no development subagents or new
Planner/Builder stages. Preserve the original failed run and use private diagnostic
outputs. Do not add a Block count gate, lower the intended world, raise the heap to
claim a fix, bypass admission, or replace Runtime/Physics owners.

| Task | Depends on / exclusive owner | Input and output contract | Required evidence |
|---|---|---|---|
| CF-20/MEM3-A | Existing Profile Session, Native Host replay and allocation/audit owners; read-only diagnosis first | Exact delivered source and current Host path -> measured Block count, phase/resource measurements and a bounded failing reproducer identifying retained objects or superlinear work | Distinguish allocation, authority instrumentation, layout/topology and finalization; compare unbundled Profile and real Host execution, not only a small Session fixture |
| CF-20/MEM3-B | MEM3-A; only the proven existing owner | Preserve source, metric layout, logical IDs, rollback, cleanup and authority auditing while removing the proven avoidable allocation/retention cost | RED/GREEN, partial allocation and throwing cleanup, prior object preservation, focused direct consumers, typecheck and affected generated-tool drift |
| CF-20/MEM3-C | MEM3-B; existing Host production/resume owner | Replay unchanged paid source only through supported exact-input recovery, or a separately labeled diagnostic when identities invalidate formal resume | Complete Native/Ground/Package/Capture evidence, original failure unchanged; new production success must have its own valid provenance; final effect inspection remains separate |

One suspect is `Session.allocate()` copying all current Scene meshes into a Set
for every Block. This is visibly quadratic traversal, but the OOM stack's SetGrow
alone does not identify the retained owner. The earlier MEM1 regression covered
direct Session snapshot lifetime, not this exact large Host run. Babylon 9.23.0
`Scene.addMesh` sends `onNewMeshAddedObservable` through `TimingTools.SetImmediate`;
an asynchronous observer is not an equivalent synchronous partial-failure cleanup.
Do not substitute that observer without proving the lifecycle contract.

## MEM3-B1/B2 authority-audit lifetime slice

An isolated diagnostic uses the first 8,000 exact captured Blocks, real Babylon
Mesh allocation, and optionally the actual Host authority probe, without finalizing
a world. Outputs/script: `/tmp/cf20-mem3-allocation.LhZy4G/`. Its Set instrumentation
counts all allocations but takes WeakRefs only for the first 64 tiny snapshots:
taking a WeakRef to every Set would artificially pin all Sets until the JavaScript
job ends and is not a valid peak-memory measurement.

- Bare Session after explicit GC: 204,147,816 heap bytes. Audited allocation:
  618,856,608 heap bytes. Both traverse 31,996,000 prior Mesh entries for 8,000
  snapshot copies; sampled snapshots are collectible after the job completes.
- Before B1, the subsequent `probe.audit()` itself exhausted the diagnostic's
  fixed 1 GiB heap. It reads every never-used lazy Observable, creating Babylon
  objects and installing per-method guards just to inspect them.
- **MEM3-B1 implemented:** retain the installed getter identity and leave an
  unaccessed, intact guard lazy. A removed/replaced unused accessor is still
  rejected; an accessed Observable follows the exact existing identity/observer
  checks. Later callback injection remains guarded. Preserve the historical
  acceptance of an already-initialized Observable replaced with identical identity;
  this is not a stricter descriptor-admission gate.
- **MEM3-B2 implemented:** after successful `restore()`, release the restorer,
  created-object and StandardMaterial-transition arrays. Previously a still-live,
  restored probe retained 16/16 disposed Meshes in the isolated GC reproducer;
  it now retains zero. Idempotent restore remains supported.
- Same 8,000-Block diagnostic now completes allocation, audit and disposal under
  the unchanged 1 GiB limit. Live post-GC allocation is still 624,613,464 bytes;
  post-disposal heap is 40,944,208 bytes, compared with 438,796,984 bytes after B1
  alone. No callback or authority diagnostic is bypassed.

Evidence: two initial RED reproductions; five focused behavior/GC tests; final
three complete authority-audit/Candidate admission/Runtime replay files **290/290**;
typecheck and two focused renderer rebuild/frozen-copy drift tests passed (bundle
bytes unchanged). Timings from runs concurrent with tests are not a performance
speedup claim. This slice does **not** make 158,100 Blocks fit the production heap:
per-Block live instrumentation/geometry cost and quadratic allocation traversal
remain, as do layout/finalization measurements and unchanged-source Host replay.
No root full CI, independent review, new production pass or main merge is claimed.

## MEM3-B3 raw authoring geometry reuse

Main-agent-only, sequential after B1/B2. Exclusive owner: Profile Session's raw
Block allocation and rollback. Input remains the same parsed Block intent; output
remains one real Mesh per logical Block and the same checked metric layout.
Use a Session-local fixed-shape Geometry pool and immutable shape snapshots;
do not share Geometry across visual thin-instance batches or across Sessions.
No admission rule, source count limit, gameplay owner or Builder input changes.

Installed Babylon 9.23.0 `Geometry.applyToMesh` attaches one Geometry to multiple
Meshes; `releaseForMesh(mesh, true)` disposes only at the last reference. Pool
lifetime must account for failed grids and disposal. An invalid source mutation
must still fail the existing geometry check, never become the new snapshot.
Required evidence: a RED allocation-count test, all fixed shapes, cross-Session
isolation, last-reference rollback/retry, partial construction/throwing cleanup,
unchanged checked layout, and raw-versus-display Geometry separation. Then repeat
the unchanged 8,000-Block allocation/audit diagnostic and affected owner tests and
typecheck. This is not the final full-gate checkpoint or a complete Case pass.

Implemented in the repair worktree on `codex/cf-production-effect-closure`;
separate Case worktrees are execution-only, not development owners. The pool is
cleared on Session failure/disposal; a fully rolled-back grid's disposed Geometry
is replaced on the next allocation. Shared snapshots remain the original immutable
values even if source code mutates a buffer before allocating another Block.

Evidence: three focused tests first failed on the old allocation path. Four new
tests cover all five shapes and cross-Session isolation, disposal of one member,
unchanged layout with unique versus shared raw Geometry, independent display-batch
Geometry, geometry mutation rejection, and attachment failure preserving a prior
Block followed by retry. Existing full Session tests also cover grid rollback to
zero and retry, constructor failure after Scene insertion, and throwing disposers.
Seven complete directly affected Session/layout/visual batching/Capture/settlement/
Candidate admission/Runtime replay files passed **153/153**; typecheck passed.
The final failure-path pool-clear addition was covered by the complete Session
file again (**46/46**, included in that 153-test inventory). The two focused
renderer rebuild/frozen-copy drift tests also passed; generated bytes unchanged.

The same audited 8,000-Block diagnostic completed with no audit diagnostics under
the unchanged 1 GiB diagnostic heap. Geometry count fell from 8,000 to **2** (the
sample's actual distinct shapes); post-GC live heap was **577,032,528 bytes** versus
624,613,464 after B1/B2. Post-disposal heap: 40,350,328 bytes; Mesh/Geometry counts:
zero. All 31,996,000 prior-Mesh snapshot visits remain. Geometry's installed
reference-release implementation also searches its member array; this change is
not evidence of linear-time disposal or overall speedup. The larger 158,100-Block
capacity problem, finalization measurements and full production replay remain open.

## MEM3-B4 repeated insertion audit ownership

Main-agent-only, sequential; existing Native authority-audit owner. Babylon 9.23.0
`Geometry.applyToMesh` invokes `Scene.pushGeometry` even for a registered Geometry;
`pushGeometry` then returns false without a new registration. The audit wrapper
currently re-instruments before that call, stacking disposal wrappers, callback
guards and retained records on the same object for every attachment. B3's geometry
reuse exposes this repeatedly; it also exists for explicit repeated insertion.

Input: same Candidate object and same runtime-kind surface. Output: one installed
guard set and original audit baseline per object/kind for the active probe. Do not
skip a different kind, remove prior records, reset mutation diagnostics or alter
Scene insertion results. Track completed installation weakly so a closed probe
cannot retain scene objects. Required evidence: RED repeated-insertion identity
and disposal-stack tests, remove/reinsert callback mutation rejection, existing
authority/Candidate/Runtime tests, GC ownership regression, and the same isolated
8,000-Block diagnostic. Not a new gate or final full-production acceptance.

Implemented with probe-local WeakSets keyed by runtime kind, marking only completed
instrumentation. Original records remain active across remove/reinsert, and a
different runtime kind still has its own instrumentation path. No Scene insertion
return value or argument is changed. Weak ownership preserves the existing restored
probe GC contract.

RED evidence: repeated insertion changed the guarded function/descriptor identity;
32,768 repeats then Mesh disposal threw `RangeError: Maximum call stack size
exceeded`. (The smaller 8,192-repeat sample did not overflow.) Both regressions
now pass, as does callback mutation rejection after remove/reinsert. Four complete
authority-audit/Candidate admission/Runtime replay/Session files passed **339/339**,
including the disposed-Mesh GC reproducer; typecheck passed.

The unchanged audited 8,000-Block diagnostic again completed under its fixed 1 GiB
limit with no audit diagnostics and no retained sampled Scene snapshots. Live
post-GC heap: **556,598,744 bytes**, down from 577,032,528 after B3. Post-disposal:
40,618,080 bytes with zero Meshes/Geometries. This repairs a real large shared-
Geometry cleanup failure, but per-Mesh cost and the 31,996,000 snapshot visits
remain. No full 158,100-Block Host replay or scene-effect acceptance is claimed.

## MEM3-B5 production-loader guard allocation

Main-agent-only; existing authority-audit method guard factory. Two real V8 heap
snapshots of the same first 1,000 captured Blocks (private diagnostics at
`/tmp/cf20-mem3-heap.9LNvuw/`) show live post-GC heaps of 54,077,696 bytes without
audit and 104,619,200 with audit. These are equivalent inputs in separate processes,
not a claim of deterministic total heap size. Snapshot self-size deltas include
26,153,600 bytes of property arrays, 7,355,880 bytes of anonymous closures,
6,620,040 bytes of closure contexts, and 2,861,120 bytes of named method guards.
Tracing property-array ownership attributes 11,444,480 bytes to 44,705 guarded
method functions alone, versus 6,208,000 bytes on the 1,000 Mesh objects.

Installed `tsx` sets esbuild `keepNames: true`. An isolated transform verifies
that named function expressions receive `Object.defineProperty(fn, 'name', ...)`
on every factory invocation; an anonymous function returned directly from a
factory does not. Keep the same bound permission predicate, dynamic receiver,
original provider call, mutation latch, constructibility and restoration behavior;
only remove hot-path name decoration. Do not change global loader settings or
the classification of Babylon runtime constructors. Required evidence: RED
production-loader decoration test, complete authority/Candidate/Runtime/Session
tests, typecheck and the same 8,000-Block allocation diagnostic.

The old pinned compiler calls `createBlockWorldRuntimeClustersV2` before compiling
Canonical world nodes (`packages/block-world-compiler/src/compile.ts`, lines 520-521
and 394). Native currently allocates raw Meshes before later batching. This remains
a known representation/capacity difference; a small memory improvement alone does
not demonstrate that the old full-world capacity has been restored.

Implemented by extracting the existing method guard expression into one private
factory that returns it anonymously. The factory captures only the permission
predicate, original method and violation latch; descriptor restoration still
belongs to the original installation scope. No global tsx configuration or public
Runtime constructor naming changed.

The isolated regression patches `Object.defineProperty` **before** dynamically
importing the audited module, because tsx captures that function in its naming
helper at module initialization. An initial instrumentation placed after import
missed the writes and was not valid RED evidence. The corrected reproducer saw
all six sampled guards decorated before the fix, and zero afterward. Four complete
authority/Candidate/Runtime/Session files passed **340/340**; typecheck passed.
The unchanged audited 8,000-Block diagnostic completed with no diagnostics under
its unchanged 1 GiB limit: post-GC live heap **474,001,776 bytes**, compared with
556,598,744 before B5. Disposal left 40,664,832 bytes and zero Meshes/Geometries.
The original full Case still has no Native Check success; aggregate CI, rendered
acceptance and main merge remain open. This measurement does not justify raising
the production heap or reducing the generated world.

## MEM3-B6 immutable audit surface and reader allocation

Main-agent-only; existing authority-audit owner. Cache the immutable inherited
surface arrays by the closed runtime-kind union, and move the per-accessor
provider-value reader to a single module function with explicit current state.
Inputs and outputs of the reader stay identical, including own descriptor versus
inherited getter precedence and one-time Mesh provider assignment. Keep baselines,
mutation predicates and restored descriptors instance-local. The cache may contain
only frozen string arrays, never Candidate objects or closures capturing a Scene.
Required evidence: RED per-Mesh surface-allocation count across two probes, current
authority/Candidate/Runtime/Session files, typecheck and unchanged allocation probe.

Read-only investigation of Scene allocation rollback found no indexed Mesh
membership API in installed Babylon 9.23.0 (`addMesh` appends; `removeMesh` uses
`indexOf`; new-Mesh notifications are deferred). Replacing the snapshot by only
the prior array length would not preserve cleanup if construction mutates the
prior collection. Keep that contract and track its quadratic traversal as open;
do not silently substitute a weaker tail-slice cleanup.

Implemented. The isolated production-loader regression observed four identical
Mesh surface arrays for four Meshes across two probes before the change; afterward
it observes one. Four complete authority/Candidate/Runtime/Session files passed
**341/341** (including lazy accessors, provider assignment, mutation rejection,
repeated insertion, original descriptor restoration and closed-probe GC tests);
typecheck passed. The unchanged audited 8,000-Block diagnostic completed with no
diagnostics at the same 1 GiB limit. Post-GC live heap: **425,161,992 bytes**, down
from 474,001,776 after B5. Post-disposal: 40,663,224 bytes and zero Meshes/Geometries.
Snapshot traversal is unchanged at 31,996,000 entries; no timing speedup is claimed.
This still does not prove that the 158,100-Block world fits production capacity.
