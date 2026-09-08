# Three Mounted Interaction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Root owns integration; this plan does not authorize additional parallel edits or another approval round.

**Goal:** Make the existing Three Training horse interaction safe, physically continuous, discoverable and verifiable with the actual horse and Source101 rider.

**Architecture:** Keep Simulation as the binding/control owner, EnvironmentQueries as the shape-query owner, HumanoidController as the character-motion owner, and TrainingRuntime/WorldEngine as the sole fixed-clock and presentation coordinators. Separate pure mounting decisions from synchronous commits, and fixed logical samples from temporary display samples. A small TrainingHorse loader/visual adapter owns one imported horse instance and mixer; Character owns its rider bones and pelvis alignment.

**Tech Stack:** TypeScript, Three 0.185.1, installed Rapier 0.20.0, Vitest, existing Creator compiler/browser recording and Episode ports. No dependency upgrade or additional package.

**Spec:** `docs/superpowers/specs/2026-09-08-three-mounted-interaction-design.md` (read together with `docs/three-sdk-architecture.md`, `docs/README.md`, `docs/three-sdk-data-production.md` and `docs/reviews/runtime-deep-review-checklist.md`).

**Worktree:** `/Users/xiateng/work/ai/agent-whitebox-world-sdk/.worktrees/three-mounted-interaction`.

**Feature branch:** `codex/three-mounted-interaction-20260908`; feature base `621cc9ea` (structure branch merged latest upstream PR208 state `754aee63`; tree byte-identical to reviewed structure commit `a301475e6613dd2ba181b64344bedcb11a1d17e8`); design's original code review base `35d917114be362e616a5f2354141fbe0b85962f1`. The structure branch including the upstream merge is reviewed/pushed and this feature worktree has fast-forwarded to it. The structure migration is also integrated into the working main branch codex/three-sdk-data-production-20260907 at this same commit. This document alone claims no implementation or production acceptance.

## Global Constraints

The following are copied from the spec; every task includes them:

- “保留 `packages/three-world` 的 Training 实现，不新增 package。”
- “本轮范围是一个受控人物、每个坐骑一个座位、同一时刻骑乘一个实例。”
- “新增的马专属登乘规则适用于地面 `mount` 模式；不自动改写船、飞行器等已有模式的规则。”
- “绑定身份始终使用场景 `instanceId`。”
- “失败必须保留原人物位置、控制状态和碰撞状态。”
- “人物的独立运动胶囊停用。”
- “不增加第二个会与马互相推挤的动态人物身体。”
- “初始速度继承马在提交时、经碰撞求解后的世界空间平移速度，写入实际人物运动控制器。”
- “首版不叠加 `angularVelocity × seatOffset` 的旋转切向速度。”
- “下马过渡仅限制新的主动步行输入，不能冻结重力和碰撞”
- “检查与状态提交之间不跨异步等待；成功提交后同步碰撞和查询可见状态。”
- “本轮保留一个 60 Hz 模拟时钟；显示刷新和录制帧率可以不同。”
- “暂停后重复显示/捕获同一时刻不得额外推进动画、过渡或模拟。”
- “Episode 持有时钟期间，普通命令不能绕过租约推进状态。”
- “媒体、执行日志、真实测试图片及案例数据保留在 Git 外部。”
- “Creator 继续保留 v0.2 当前世界、当前输入计划的真实 180 秒以上录制与交付契约。”

Additional existing branch requirements: keep cloud contract tests mocked; no production restart, paused-case submission, provider retry, SDK deployment or video submission. Episode execution retains `--stop-before-seedance`. Preserve the original horse GLB, source provenance, frozen asset policy and accepted source worktrees.

## Review findings incorporated

1. `simulation.ts` currently copies dismount velocity only to PlayerState; `HumanoidController.setMounted(false, position)` clears the real velocity in resetMovement; exit transition skips all character physics. Task 1 fixes the complete handoff.
2. Only the occupied vehicle advances today. Task 1 allows an unoccupied `mount` with remaining motion or unsupported body to coast/settle with empty input and actor collision resolution, without changing parked non-mount craft.
3. Environment filters exclude actors, safeSpawn may move a request and accepts missing support, PLAYER_BODY is not the real HumanoidController capsule. Task 1 supplies explicit direct shape checks and actual dimensions.
4. PresentationState is not connected to TrainingRuntime. Current rider-before-callback ordering and root-based observations would produce stale anchors or interpolated trace positions. Task 2 establishes clock/logical truth; Task 3 attaches horse/rider visuals to the ordered frame.
5. Explicit `enter(instanceId)` currently depends on global nearest selection and a second selection in interact. Task 1 fixes explicit identity and propagates structured reasons without a new operation system.
6. The horse visual loader is currently an example implementation, not an exported SDK capability. Task 3 supplies a bounded real-clip adapter; Task 4 consumes it through permitted resource resolution.
7. Direct `world.training` mutations bypass the world.execute lease check and several methods lack disposed checks. Task 2 puts checks on the actual external mutation entry points while preserving an internal Host path.

Rapier evidence already obtained in the read-only review, using the installed 0.20.0 distribution: a new collider is absent from world.intersectionWithShape before world.step; after collider.setTranslation its new location remains absent; propagateModifiedBodyPositionsToColliders does not refresh broadphase; direct collider.intersectsShape sees its current position; world.step refreshes the world query. A shape cast starting in penetration and moving outward returns TOI 0 with stopAtPenetration=true and null with false. Reproduce in Task 1 tests; never add an extra physics step to refresh a command query.

## Exclusive file ownership and integration seams

Execution is sequential. Root owns every shared/public contract and reviews each task before the next; ownership below is an edit boundary, not permission for concurrent workers. No worker edits another task's files while that task is active. Root resolves any changed signatures before consumers begin.

| Task | Exclusive files for that task | Responsibility |
| --- | --- | --- |
| 1 | `training/mounted-interaction.ts` (new), `training/environment/queries.ts`, `training/simulation.ts`, `training/humanoid/controller.ts`, `training/runtime.ts`, corresponding query/mounted tests | Safety decisions, direct queries, atomic handoff, real motion, reason codes |
| 2 | `training/presentation.ts`, `training/runtime.ts`, `training/character.ts`, `training/camera.ts`, `engine.ts`, `world.ts`, `contracts.ts` if needed, Host observer and Creator bridge/capture consumers, new presentation/lifecycle tests | Fixed state versus render state, input clock, lease/liveness, authoritative observations |
| 3 | `training/horse.ts` (new), `training/horse.test.ts` (new), `training/character.ts`, `training/runtime.ts`, `training/public.ts`, `index.ts`, SDK README | Real imported horse clips, visual adapter contract, bounded same-frame anchor/pelvis alignment |
| 4 | `scripts/three-creator/character-guidance.ts`, new `mount-guidance.ts` and test, `tools.ts`, `authoring-schema.ts`, `example-files.ts`, `examples.ts`, associated tests; `examples/three-creator/horse-riding/*` (new); new mounted browser runner; SDK README and test census | Discovery, schema/example consumption, actual browser and Episode verification |
| 5 | Only integration fixes identified by evidence, `docs/reviews/2026-09-08-three-mounted-interaction.md` (new), current spec status and final plan | Final checks, independent review, evidence and precise acceptance status |

All `training/*`, `engine.ts`, `world.ts`, `contracts.ts`, `index.ts` paths above are under `packages/three-world/src`. New policy/catalog locations are `config/three-creator/asset-policy.json` and `assets/three-creator/asset-catalog.json`; do not recreate old script-local paths. Keep the user-confirmed flat allowedAssetIds policy; asset classification and dependency availability belong in catalog/tools, never split whitelist files. Catalog content changes require measured calibration evidence; default expectation is no policy or original asset-byte change.

### Historical implementation sketches

The following snippets record the initial plan, not a second API contract. The implemented public signatures and guidance are maintained in the SDK source and README. Task review records below supersede proposed internal seams.

### Shared interface decisions

Keep public TrainingCommand and boolean enter/exit return types. Add no phase store, seat registry, asynchronous mount operation, general constraint system or mixer ownership registry.

Task 1 internal types in `mounted-interaction.ts`:

```ts
export type MountFailureCode =
  | 'TRAINING_TARGET_UNAVAILABLE' | 'TRAINING_ALREADY_MOUNTED'
  | 'TRAINING_NOT_MOUNTED' | 'TRAINING_TRANSITION_ACTIVE'
  | 'TRAINING_CHARACTER_BUSY' | 'TRAINING_MOUNT_TOO_FAST'
  | 'TRAINING_MOUNT_SIDE_REQUIRED' | 'TRAINING_MOUNT_OUT_OF_REACH'
  | 'TRAINING_MOUNT_OBSTRUCTED' | 'TRAINING_MOUNT_SPACE_BLOCKED'
  | 'TRAINING_MOUNT_GROUND_REQUIRED' | 'TRAINING_DISMOUNT_NO_SAFE_POINT';
export type MountDecision =
  | { ok: false; code: MountFailureCode; message: string }
  | { ok: true; instanceId: string; position: Vector3; yaw: number; velocity: Vector3 };
export interface MountContext {
  readonly environment: EnvironmentQueries;
  readonly humanoid: HumanoidController;
  readonly vehicles: readonly VehicleState[];
  readonly available: (vehicle: VehicleState) => boolean;
  readonly transitionSeconds: number;
  readonly mountedInstanceId: string | null;
}
export function evaluateMount(context: MountContext, targetId: string): MountDecision;
export function evaluateDismount(context: MountContext): MountDecision;
```

`position` is the committed rider logical seat position for mount, or the exact verified standing feet position for exit; yaw is logical upright yaw; velocity is copied from the solved target only on exit. Decision vectors are fresh values, never mutable references into Simulation. No commit function is exported from this module.

Environment query additions (internal package API):

```ts
export interface BodyPose { position: Vector3; rotation: Quaternion; body: QueryBody }
export interface BodyQueryFilter {
  readonly excludedColliderHandles?: ReadonlySet<number>;
  readonly excludedActorIds?: ReadonlySet<string>;
}
// Positive value admits only numerical contact slop, never a free-standing wall overlap.
bodyOverlap(pose: BodyPose, filter?: BodyQueryFilter, contactToleranceMeters?: number): boolean;
bodyPathBlocked(poses: readonly BodyPose[], filter?: BodyQueryFilter): boolean;
standingSupport(position: Vector3, maximumDropMeters: number, maximumSlopeRadians: number):
  {height: number; normal: Vector3} | null;
```

Implement over direct collider/shape queries with native sensor exclusion or precomputed handle sets. Keep existing general movement queries unchanged. Query helpers do not create/remove colliders or move real bodies. Retain all generated static slab colliders for these tests; the existing staticColliders map stores only the first subdivision per entity and is insufficient as an exhaustive direct-query list. Include live dynamic crates and actors; exclude only explicitly identified rider/attachment bodies. Direct-query iteration occurs outside KCC callbacks, avoiding borrowed WASM reentrancy.

HumanoidController additions:

```ts
get standingQueryBody(): QueryBody; // derived from HALF=.56, RADIUS=.28, center=.84; max slope from controller.maxSlopeClimbAngle() (currently Math.PI/4), offset from controller.offset()
commitDismount(position: Vector3, yaw: number, velocity: Vector3): void;
```

commitDismount is synchronous and receives a fully validated plan. It resets incompatible local movement state, restores standing shape and collision, puts velocity.x/z into horizontal velocity and velocity.y into vertical, commits actual rigid-body/collider position, and updates facing without inheriting pitch/roll. No pending displacement accumulator.

Task 2 presentation sample types in `training/presentation.ts`:

```ts
export interface TrainingDisplaySample {
  readonly epoch: number;
  readonly previousTick: number;
  readonly currentTick: number;
  readonly alpha: number;
  readonly timeSeconds: number;
  readonly mountedInstanceId: string | null;
  readonly player: MotionPose;
  readonly vehicles: readonly MotionPose[];
}
```

Extend existing PresentationState, not a second state owner. Engine owns live alpha from its accumulator; explicit `world.step` and Episode `frame()` request alpha=1 independent of live remainder. Add `PresentationState.sample(alpha:number, epoch:number, previousTick:number, currentTick:number):TrainingDisplaySample` to return the common immutable copied view. Sampling is read-only. Fixed input uses the canonical FollowCamera yaw, never a render-mutated yaw.

Task 3 bounded public addition in `training/horse.ts`, exported from `index.ts` and `training/public.ts`:

```ts
export type TrainingResourceResolver = (logicalPath: string) => string;
export interface TrainingHorseFrame {
  readonly epoch: number;
  readonly timeSeconds: number;
  readonly phase: number;
  readonly speedMetersPerSecond: number;
  readonly gait: string;
}
export interface TrainingSeatAnchor {
  readonly nodeName: string;
  readonly maximumOffsetMeters: number;
  readonly maximumRotationRadians: number;
}
export class TrainingHorse {
  readonly root: Group;
  readonly content: Group;
  get loaded(): boolean;
  load(resolve: TrainingResourceResolver): Promise<void>;
  sample(frame: TrainingHorseFrame): void;
  readSeatAnchor(seat: readonly [number, number, number], anchor?: TrainingSeatAnchor): Matrix4;
  dispose(): void;
}
```

Root is logical unit-scale instance root; normalization and source animation stay under content. readSeatAnchor returns a root-local calibrated transform (not a new logical seat). With no anchor declaration it returns a fresh fixed seat matrix. With declaration it uses a bind-pose relative calibration so the rest anchor equals spec.seat, then evaluates the current bone delta; offset/rotation beyond declared calibrated bounds throw a stable visual diagnostic. Loading is idempotent per instance and rejects after disposal. It resolves logical `creatures/horse.glb` using the existing permitted-resource route, directly obtains GLTF scene and original clips once, and owns disposal of that load.

Add to TrainingVehicleInstance only `readonly visual?: TrainingHorse` and `readonly seatAnchor?: TrainingSeatAnchor`. Require `object === visual.root`, loaded adapter, mode=mount, and a unit-scale logical root before runtime creation. Runtime exclusively samples owned horse adapters in the horse phase, rather than trusting callback registration order. Existing onVisualUpdate callbacks remain supported for unowned visual child content; they run once per new display sample before rider alignment and must not own the same horse subtree. Dispose runtime-owned horse adapters once.

## Task 1: Safe mount decisions and atomic physical handoff

Completed in `56f1962d` and `b6b3e90c`; independent review and scoped re-review approved. The latest affected run passed 92 tests, including real supported-step velocity inheritance and action-command refusal during exit. Actual models and capture acceptance remain later tasks.

**Consumes:** existing VehicleState, QueryBody, actual HumanoidController dimensions, map support/water data and Training command/receipt path.

**Produces:** MountDecision/evaluateMount/evaluateDismount, query methods and commitDismount signatures above; Simulation explicit-target enter and retained keyboard nearest-valid selection; stable receipt codes; physically simulated dismount transition and coasting horse.

**Files:** ownership row 1; create `training/mounted-interaction.test.ts` and `training/environment/mounted-queries.test.ts`. Add exported fixture helper `createMountedFixture` within new test-only `training/mounted-test-fixture.ts`; no fixture exports in public barrels.

- [x] Create a real Rapier map fixture with ground top y=0, horse root [0,.025,0], seat [0,1.65,0], envelope half extents [.8,1.65,1.9], offset [0,1.65,0], and player feet [1.45,.025,0]. Read the canonical horse spec from `assets/three-creator/asset-catalog.json` and structuredClone it; override only IDs/spawn for the fixture. Reuse actual source dimensions from controller. The helper signature is:

```ts
export async function createMountedFixture(options: {
  boxes?: MapDefinition['boxes'];
  secondHorsePosition?: [number, number, number];
} = {}): Promise<ThreeWorld>;
```

The fixture builds its map's `mount` region and per-instance explicit spawn records, uses Group visuals for physics tests and createWorld({navigation:false,...}), and positions the unmounted character through prepareCharacter. Tests dispose worlds in finally blocks.

- [x] Add the decisive failing velocity test before implementation:

```ts
it('hands off solved velocity and continues both bodies during the exit transition', async () => {
  const world = await createMountedFixture();
  try {
    const runtime = world.training!;
    expect(runtime.enter('horse-1')).toBe(true);
    world.step({}, 31);
    const horse = runtime.simulation.vehicle!;
    horse.velocity.set(0, 0, 1.5); horse.speed = 1.5; horse.grounded = true;
    expect(runtime.exit()).toBe(true);
    const human = runtime.simulation.humanoid!;
    expect(human.velocity.z).toBeCloseTo(1.5);
    const humanZ = human.position.z, horseZ = horse.position.z;
    world.step({moveZRatio: -1}, 1);
    expect(runtime.snapshot().transition.remainingSeconds).toBeGreaterThan(0);
    expect(human.position.z).toBeGreaterThan(humanZ);
    expect(horse.position.z).toBeGreaterThan(horseZ);
    expect(human.velocity.z).toBeLessThan(1.5);
  } finally { world.dispose(); }
});
```

- [x] Add query regressions reproducing current Rapier semantics without changing the world clock:

```ts
it('detects a moved collider directly before the next broadphase update', async () => {
  await RAPIER.init();
  const world = new RAPIER.World({x:0,y:0,z:0});
  try {
    const collider = world.createCollider(RAPIER.ColliderDesc.ball(.5));
    const rotation = {x:0,y:0,z:0,w:1}, shape = new RAPIER.Ball(.5);
    world.step(); collider.setTranslation({x:10,y:0,z:0});
    world.propagateModifiedBodyPositionsToColliders();
    expect(world.intersectionWithShape({x:10,y:0,z:0}, rotation, shape)).toBeNull();
    expect(collider.intersectsShape(shape,{x:10,y:0,z:0},rotation)).toBe(true);
  } finally { world.free(); }
});
```

Add direct helper assertions for a just-moved second horse, an enabled sensor beside a solid wall, an initial penetrating capsule moving out, an endpoint-clear blocked mid-path, low ceiling and collider-count invariance. The raw semantic test passes on baseline; helper/mount behavior tests must fail on baseline.

- [x] Run only the new failing behavior tests and retain the failure text externally:

```bash
pnpm exec vitest run packages/three-world/src/training/mounted-interaction.test.ts packages/three-world/src/training/environment/mounted-queries.test.ts --maxWorkers=1
```

Expected baseline failures: actual human velocity remains zero, horse does not move after exit, and missing direct query/policy methods. Do not mistake a missing fixture import for the required behavior reproducers; the velocity test must reach the existing runtime.

- [x] Implement direct queries first. Use Shape.contactShape signed distance for overlap tolerance, initial/final intersections separately from Shape.castShape, targetDistance taken from humanoid.controller.offset() (currently .015), stopAtPenetration=true, maxToi=1 with segment delta as velocity. Ground contact tolerance may exempt upward support contact within KCC precision only; do not shrink every body enough to admit wall penetration. Native direct methods inspect live collider poses and ignore sensors before the call. Keep exact actor IDs and body-part IDs associated with colliders. Validate finite vectors/quaternions/body extents before entering WASM.

- [x] Implement side candidates in the target's logical yaw frame using box lateral half extent, actual standing radius and existing KCC clearance; accept only lateral approaches, not head/tail shortcuts. Preserve the current upper reach bound and speed limits (<3 m/s entering, <=5 m/s exiting); require a ground mount to be supported and not submerged. Validate current human position without safeSpawn relocation; support-adjust only a candidate copy. Use humanoid.controller.maxSlopeClimbAngle(), currently Math.PI/4; the generic environment controller allows Math.PI/3 and support() accepts an even shallower normal threshold, neither is the mounted rider slope contract. Use a capsule path from current feet to chosen lateral standing point, then a vertical/lateral attachment path with capsule centers explicitly represented. Allow target exclusion only on the internal attachment segment; standing endpoints and outside approach still include the target. Final safety is the actual configured full combined envelope, not an extra upright person capsule erected above the saddle. Reject all other actors/solid geometry throughout. Verify full envelope bounds, low headroom and actual source-model containment in Task 3.

- [x] Implement a single synchronous Simulation commit; never reselect a target after evaluation. On failure only diagnostic code/message may change. On entry disable the independent capsule and commit seat/yaw/binding/transition together. On exit use commitDismount and mirror actual human state immediately. Keep .5s enter and .38s exit durations. During exit pass empty humanoid action/input to h.step while keeping physics; suppress jump/roll/interact rather than queueing them. Do not accumulate movement input. During enter keep the existing no-advance behavior. Step unoccupied moving/unsupported mounts with emptyInput and actor-contact rollback; exclude non-mount parked modes from this change. Failures propagate code through existing runtimeError/receipt parsing, never message matching.

- [x] Expand the behavioral tests with explicit horse-2 identity while horse-1 is nearer, +/- yaw, each side, rejected head/tail, initial overlap, wall, ceiling, slope, no support, deep water, air, busy action, excessive speed, repeated interaction, no safe exit and collision behind the exit point. Snapshot position/yaw/velocity/mounted flag/capsule enable/colliderCount before each refusal and assert equality afterward. Add a non-mount compatibility test using the existing car fixture.

- [x] Run the new tests plus `training/runtime.test.ts`; commit the reviewed task with `feat(three): enforce atomic ground mount interaction` using explicit task-owned paths. No broad git add.

## Task 2: Separate fixed state, display sampling and lifecycle authority

Completed in `0ae15867` and `57640fdd`; independent review and scoped re-review approved. Full task run passed 84 tests and five targeted capture checks; the subsequent history/ownership fix passed 48 affected tests, typecheck and a final cut regression. Real capture acceptance remains Task 4.

**Consumes:** task 1 atomic binding boundaries, Simulation teleportRevision, existing PresentationState and FollowCamera MotionPose argument.

**Produces:** TrainingDisplaySample above; internal `TrainingRuntime.present(sample: TrainingDisplaySample): () => void` returning a restoration function; canonical logical actor pose reads; a Host-only capability for lease-owned operations; display-clock-independent fixed input and idempotent rendering.

**Root integration decision:** Capture callers currently render and measure directly. Restore canonical animated subtree locals as well as roots; use one optional synchronous Host `withPresentation(callback)` seam for exact sampling, with the existing raw fallback. Keep internal display sampling behind Engine/Training, instead of adding a new public `present` method for the illustrative test below.

**Files:** ownership row 2, plus the existing Host `WorldObservation` contract and `apps/three-creator-playground/bridge.ts` / `capture.ts` consumers where necessary; create `training/mounted-presentation.test.ts` and `training/mounted-lifecycle.test.ts`. Existing `presentation.ts` belongs to Training history, not the separate user-facing world Presentation service.

- [x] Add a failing idempotence/logical-truth test using createMountedFixture:

```ts
it('does not advance or rewrite physical truth during repeated renders', async () => {
  const world = await createMountedFixture();
  try {
    expect(world.training!.enter('horse-1')).toBe(true);
    world.step({},31); world.step({training:{...emptyInput(),forward:1}},20);
    const history = new PresentationState(world.training!.simulation);
    history.beforeStep(world.training!.simulation);
    world.step({training:{...emptyInput(),forward:1}},1);
    history.afterStep(world.training!.simulation);
    const before = world.snapshot();
    const horsePosition = world.training!.simulation.vehicle!.position.clone();
    const sample = history.sample(.5,1,before.simulationTick-1,before.simulationTick);
    expect(sample.vehicles[0]!.position.distanceTo(horsePosition)).toBeGreaterThan(0);
    for (let frame=0;frame<2;frame++) {
      const restore = world.training!.present(sample);
      try {
        expect(world.getEntityState('horse-1').positionWorldMetersXYZ).toEqual(horsePosition.toArray());
      } finally {restore();}
    }
    expect(world.snapshot().simulationTick).toBe(before.simulationTick);
    expect(world.training!.simulation.vehicle!.position).toEqual(horsePosition);
    expect(world.getEntityState('horse-1').positionWorldMetersXYZ).toEqual(horsePosition.toArray());
  } finally {world.dispose();}
});
```

Import PresentationState from './presentation'. This test uses two unequal fixed samples and observes public logical state while an intermediate display pose is active; a snapped sample would miss the root/trace bug. Separately exercise the actual WorldEngine.render/Episode frame path with the existing renderer fixture; add no new public world.render API for testing.

- [x] Add the negative direct-API tests through the existing mock renderer and observer Episode fixture in runtime.test.ts. After `prepareSegment`, `runtime.enter`, `exit`, `setInput`, `prepareCharacter`, `prepare`, `approach`, `switchMap`, `applyProfile` and external `advance` must reject with EPISODE_CAPTURE_OWNS_CLOCK and leave the snapshot unchanged. After dispose the same mutation category rejects TRAINING_DISPOSED and onVisualUpdate cannot install a writing callback. Episode Host `advance` remains successful. Reuse the exact EpisodeStart/renderer fixture already present in runtime.test.ts instead of constructing an incompatible mock.

- [x] Run the new presentation/lifecycle suites and retain genuine failures; then connect PresentationState before/after each fixed tick and snap after enter/exit/reset/map replacement/Episode prepare. Add logical `TrainingRuntime.logicalPose(id)` returning copied `{position:Vector3,rotation:Quaternion}` and use it for state(), world.getEntityState and trace. Mounted logical position derives seat from the committed horse transform, not sim.player's old vehicle-center alias or object world position. Existing regular-world pose logic is untouched.

- [x] Render with a temporary root display transform and guaranteed restoration:

```ts
const restore = training.present(sample);
try {
  scene.updateMatrixWorld(true);
  renderer?.render(scene,camera);
} finally {
  restore();
}
```

Call existing render listeners after restoration. Underlying pixels and camera metadata retain the display sample, but object/physics observations remain canonical. present saves logical roots, applies the common sample, runs the ordered visual phases, and returns a function restoring only SDK-owned logical roots. It must restore even when a visual callback fails. An exception produces a visible runtime diagnostic and stops normal advancement according to current frame error handling.

- [x] Keep canonical animation and camera state on fixed ticks. Character evaluates its existing source animation once per fixed tick and stores previous/current local animated-node transforms; render interpolation blends those saved transforms without re-running source.update or mixer.update. Expose only internal `capturePresentationPose():void` and `applyPresentationPose(alpha:number):void` methods on Character. Snap both arrays on simulation identity/binding replacement. This preserves existing action clocks and avoids refactoring the Source101 controller into a new animation framework.

- [x] Keep FollowCamera's canonical orbit/recenter/zoom state advancing exactly once per fixed tick, because its yaw feeds camera-relative movement. Capture previous/current camera position, target, quaternion and fov along with actor samples. Add internal `present(pose:MotionPose,alpha:number):void` that derives the camera arm/aim from the same display timestamp and current physics obstacle query but does not mutate canonical yaw, timers or smoothing state. Restore canonical camera working state before the next fixed update; retain displayed camera transform for the renderer/metadata. Do not call FollowCamera.update a second time from render. Authored mode retains its current camera and opening framing; no follow reset on ordinary repeated frame.

- [x] Existing onVisualUpdate callbacks run in the generic visual phase once per changed sample key `(epoch, previousTick, currentTick, alpha)` and receive the elapsed sample time, zero after a history cut. Mounted alignment follows them. Paused repeated keys reuse the evaluated local visual state. Do not use Math.max(0, newTime-oldTime) alone to mask a rewind: identity/time rewind explicitly snaps/reinitializes state.

- [x] Create a small internal `training/host-access.ts` capability boundary, not a general authorization framework. It stores a WeakMap from runtime to `{setEpisodeOwned(owned:boolean):void; advance(input:WorldInput,dt:number,pointer?:CameraRigInput):void; reset():void; prepareEpisodeStart(start:EpisodeStart):void}`. Runtime constructor registers closures for private owner methods; only engine/world import this internal module and no public barrel exports it. External mutation methods call assertLive and assertExternalMutation; private Host closures still call assertLive. World sets/clears ownership with its existing lease and uses the host methods during preparation/reset/advance. This preserves direct API availability outside capture without a user-supplied guard override.

- [x] Verify fixed input equivalence over 2 seconds at 30/60/120 Hz with `WorldEngine.advance`, identical held input and exactly one interaction edge; compare canonical final tick, horse/rider position and yaw. Add a 250ms catch-up case, pause/resume transition, two Episode initializations, repeated frame, reset from each transition, direct API dispose and authored/follow camera continuity. Use `onVisualUpdate` instrumentation and a simple rider mesh to prove callback order and root restoration. Run:

```bash
pnpm exec vitest run packages/three-world/src/training/mounted-presentation.test.ts packages/three-world/src/training/mounted-lifecycle.test.ts packages/three-world/src/training/runtime.test.ts packages/three-world/src/presentation.test.ts --maxWorkers=1
```

Commit reviewed changes as `feat(three): separate mounted display sampling from fixed state`.

## Task 3: Imported horse visual adapter and same-frame saddle alignment

Completed in `0de3c727`; independent spec and quality review approved. The 57-test run and typecheck passed. Real Source101/horse geometry, blend poses and dense/key-time anchor calibration are recorded separately from the visual/capture acceptance completed in Tasks 4–5.

**Consumes:** Task 2 sample lifecycle/order and actual horse spec; existing Source101 Character source, pelvis and overlay; original horse GLB with 13 clips including Idle/Walk/Gallop and Body root-motion node.

**Produces:** TrainingHorse/TrainingHorseFrame/TrainingSeatAnchor and optional TrainingVehicleInstance visual/seatAnchor fields above; rider pelvis alignment to valid same-frame root-local anchors; documented fixture-derived visual limits.

**Files:** ownership row 3. Read only the source implementation `examples/three-creator/sdk-capabilities/creatures/visual.ts` and `creatures/manifest.ts` for normalization/gait provenance; do not copy procedural horse/dragon/carriage scaffolding or fallback success behavior.

- [x] Build a meaningful loader test from the actual GLB via GLTFLoader.parseAsync after reading its bytes, resolving the allowed logical path. Assert source clip names Idle/Walk/Gallop and Body existence; preserve cloned source tracks for comparison. Add the local GLTF parsing helpers already used by existing asset tests, including minimal ProgressEvent support if required, instead of a network dependency.

- [x] Add a missing-declaration test against a loaded real instance:

```ts
it('rejects a declared missing saddle rather than using the last anchor', async () => {
  const horse = new TrainingHorse();
  try {
    await horse.load(resolveFixtureResource);
    horse.sample({epoch:1,timeSeconds:0,phase:0,speedMetersPerSecond:0,gait:'graze'});
    expect(() => horse.readSeatAnchor([0,1.65,0], {
      nodeName:'missing-saddle',maximumOffsetMeters:.2,maximumRotationRadians:.2,
    })).toThrow('TRAINING_SEAT_ANCHOR_MISSING');
  } finally {horse.dispose();}
});
```

Add these real-byte fixture definitions in horse.test.ts (imports: readFile from node:fs/promises, fileURLToPath from node:url, GLTFLoader from Three addons, vi from Vitest):

```ts
function resolveFixtureResource(logicalPath:string):string {
  if(logicalPath!=='creatures/horse.glb')throw new Error('UNEXPECTED_FIXTURE_RESOURCE');
  return new URL('../../../../assets/three-creator/training/creatures/horse.glb',import.meta.url).href;
}
vi.spyOn(GLTFLoader.prototype,'loadAsync').mockImplementation(async(url) => {
  const bytes = await readFile(fileURLToPath(url));
  const data = bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
  return new GLTFLoader().parseAsync(data as ArrayBuffer,'');
});
```

Restore the spy in afterAll. This replaces transport only; source GLTF parsing and all clips/skeleton geometry stay real. Do not expand public AssetInstance to reveal clips/mixers or broaden adapter options for test injection.

- [x] Run new horse tests to demonstrate the missing capability, then implement direct resolver loading, per-instance skeleton/mixer ownership and disposal. Clone clips before removing only Body horizontal X/Z translation; preserve authored Y movement and all joint tracks. Normalize the imported model's visual child using the source adapter's targetSize [1.4,2.3,3.55], uniformScale, correct facing and ground baseline. Verify the measured source result, keeping the logical root unit-scale. One instance gets one scene clone and one mixer. Missing clips/Body, nonfinite transforms or load/dispose races reject with stable errors; no silent procedural substitute and no shared mutable action state between two instances.

- [x] Map graze to Idle, walk/trot to Walk with documented speed-relative sampling, gallop to Gallop. Evaluate action times from sample phase/time and blend using deterministic sample data; do not mixer.update(dt) on every render. Preserve all source vertical stride motion. `sample(frame)` is idempotent for the same sample and resets active clip blending on epoch change. No separate rider/horse RAF loop.

- [x] Calibrate `readSeatAnchor` in the rest pose. Default uses fixed root-local seat; declared Body/socket anchor stores the bind matrix inverse only (not a duplicate mutable seat), then computes `currentBone * inverse(restBone) * seatMatrix` in root coordinates. Validate determinant, finite entries, positive scale and displacement/angular bounds each time. The bounds in the example come from measuring all three clips over 64 evenly spaced samples, then rounding upward only by measured numerical precision; record maximum observed values and chosen bounds in the fixture report. Do not hardcode speculative `.2` defaults for the actual horse. A fixture may use `.2` solely to assert rejection on a missing node.

- [x] Connect runtime horse phase to `visual.sample`, update root/content world matrices, obtain fresh anchor, apply rider sampled pose/overlay and align pelvis. Add internal `Character.alignMountedPelvis(anchorWorld:Matrix4):void`; it converts desired anchor into actor-parent coordinates and applies translation/rotation only under Character.actor. It never writes Character.root or the capsule. Fixed default seat and animated anchor must both align in the same frame, including horse yaw +/-90 degrees. Ensure exiting clears mounted visual correction before showing upright source animation.

- [x] Load actual horse plus Source101 rider for a geometry/bone regression. Measure (a) logical root relative to spec.seat, (b) pelvis relative to selected anchor, (c) animated rider+horse bounds versus the configured envelope at 64 phase samples per clip. Horse envelope currently covers y=0..3.3 with seat y=1.65; do not enlarge it preemptively. If the imported model normalization or pose does not fit, fix that owner and rerun the fixed measurement; change instance envelope only with recorded actual measurements and targeted low-ceiling tests. Assert real root position is unchanged after sample and only intended visual nodes differ.

- [x] Run:

```bash
pnpm exec vitest run packages/three-world/src/training/horse.test.ts packages/three-world/src/training/mounted-presentation.test.ts packages/three-world/src/training/mounted-interaction.test.ts --maxWorkers=1
```

Commit as `feat(three): add owned horse clips and calibrated rider anchors`. Public contracts/README explain adapter disposal, resource resolver, real clip mapping and procedural rider-pose limitations.

## Task 4: Creator discovery, minimal example and real capture acceptance

**Consumes:** actual public Training types, Horse adapter and resolver, structured receipts, authoritative snapshot and existing Creator/Episode recording ports.

**Produces:** `mountUsage(asset,profile,allowedIds)` returning asset/dependency availability, schema/example topic and honest limitations; new `mounted-interaction` schema/example topic; complete `examples/three-creator/horse-riding` source graph; real mounted browser/Episode evidence under `.codex-tmp/mounted-acceptance/`.

**Root integration decisions:** Catalog owns descriptive horse metadata; tools derive profile/dependency readiness after whitelist filtering. Add only the already-supported `f/F` keyboard vocabulary to the Host episode schema. Commit source before actual recording so evidence names the actual source commit. Root maintains test census registration.

**Files:** ownership row 4, the narrow supported-key vocabulary in `contracts.ts`, plus source `config/three-creator/asset-policy.json` and `assets/three-creator/asset-catalog.json` only if a measured change is justified. Update tools and MCP schemas wherever existing topic unions are consumed; source schema text from real declarations/SDK README.

- [x] Add discovery tests using the current ThreeCreatorTools/executeThreeCreatorTool test pattern:

```ts
it('discovers horse integration and only its required example assets', async () => {
  const service = new ThreeCreatorTools(await root(),'three-sdk');
  try {
    const found:any = await executeThreeCreatorTool(service,'assets_search',{query:'骑马'});
    expect(found.assets.map((asset:any)=>asset.id)).toContain('training.horse');
    const example:any = await executeThreeCreatorTool(service,'creator_get_examples',{topic:'mounted-interaction'});
    expect(JSON.parse(example.files['project.json']).assetIds).toEqual(['humanoid.source-101','training.horse']);
    expect(example.files['main.ts']).toContain('TrainingHorse');
    expect(example.files['main.ts']).not.toContain('training.approach');
  } finally {await service.close();}
});
```

Use existing root() temp workspace helper in character-guidance.test.ts or define it explicitly in mount-guidance.test.ts with mkdtemp/afterEach cleanup. Add horse-disabled and Source101-disabled frozen policy tests: no executable example returned when either dependency is unavailable, clear missing asset IDs, no widening policy or silently substituting preset-101. Raw profile guidance must not claim Training gameplay exists.

- [x] Run those failing consumers; implement mountUsage as a focused sibling module and wire it into asset search/describe. Preserve characterUsage and the ordinary default character policy. New schema topic returns TrainingOptions/TrainingVehicleInstance/TrainingHorse/TrainingSnapshot/TrainingCommand actual source declarations and the mounted README section; no parallel hand-authored API schema protocol.

- [x] Create exactly `index.html`, `main.ts`, `project.json`, `episode.json` in the horse-riding example. main imports createWorld, TrainingCharacter, TrainingHorse; resolves policy-approved humanoid and horse logical resources using existing compiler/bootstrap maps; creates a flat course, a visible obstacle, a safe side exit patch and two independently identified horse instances. It uses the canonical asset spec clone per instance and unit-scale adapter roots. Place player a short straight walk from the first horse side, align authored camera for the opening, and register capture targets containing the full horse+rider assembly. Bind UI to receipts/snapshot/transition remainingSeconds, preserve actual keyboard F edge input, and show precise rejection code/text. Do not initialize by approach or call prepare after inputs begin.

- [x] Author a >=180-second deterministic Creator input plan with actual walk to the valid side, F enter, transition wait, straight walking gait, turn, gallop, braking, F exit, post-exit walk and reset demonstration. Keep the recorder's real keyboard stream and world identity. The browser runner may make feedback-driven input decisions based on actual measured proximity/velocity but must record them; never use hidden transform writes or approach to repair a failed route. Compile the example first and verify the complete requested source/resource graph and normalized runtime bytes.

- [x] Add `scripts/three-creator/training-mounted-browser-smoke.ts` using the existing training browser runner's server/compiler/Playwright lifecycle. It accepts `--output <directory>` and creates that new directory, failing on nonempty output. Start one browser sequentially; record canonical state, input transcript, seat/pelvis errors and screenshots at side/front/turning/exit/reset moments. Require no runtime errors, no overlapping duplicate mixer or logical root writes, successful actual entry/exit and continued movement. Save manifest with git SHA, source/runtime hashes, asset IDs, loaded clip names and input plan hash. Request no external provider.

- [x] In the same bounded browser session, use EpisodeRuntimePort to prepare an explicit mounted start, advance real training inputs, capture repeated identical frames, verify direct ordinary command rejection under lease, and prepare a second segment without old input or transition state. Record an actual >=30-second local Episode clip through the existing capture path and own trace (do not reuse Creator media). Explicitly choose exact tick sampling, and assert no RAF clock is active. Save input/trace/frame identities. Release the Episode lease and dispose all runtime/browser/server resources in finally paths.

- [x] Run the focused contracts, prebuild and acceptance command in order:

```bash
pnpm exec vitest run scripts/three-creator/mount-guidance.test.ts scripts/three-creator/character-guidance.test.ts scripts/three-creator/authoring-schema.test.ts scripts/three-creator/example-files.test.ts --maxWorkers=1
pnpm three:creator:prebuild --profile three-sdk --output .codex-tmp/mounted-runtime
pnpm exec tsx scripts/three-creator/training-mounted-browser-smoke.ts --output .codex-tmp/mounted-acceptance
```

- [x] Review actual images/video at side/front/turning and full targets; mark technical success, riding functional success and visual quality separately. If pose/body intersection fails, fix the Character/horse owner and repeat only affected acceptance. Record programmatic posture limits honestly; do not label clips-only evidence as a visual pass. Commit sources/tests as `feat(creator): expose and verify mounted horse authoring`; never git-add generated media or journals.

## Task 5: Final integration, review and evidence

**Consumes:** reviewed commits 1–4 and their external evidence. **Produces:** final-SHA focused aggregate verification, independent code review, source-linked documentation and accurate separate acceptance statuses.

**Files:** ownership row 5. Register each new test in the existing census if the test-gate census requires explicit classification. Root owns any cross-task fix; rerun evidence following changed inputs.

- [x] Run the spec coverage checklist below and update the implementation record with exact files, final code SHA, query semantic reproducers, known clip/pose limits and artifact paths. Never claim the design itself is execution evidence. Verify schema/doc links refer to relocated catalog/policy paths and real exported signatures.

- [x] Run the final source-state checks once after code has settled:

```bash
pnpm exec vitest run packages/three-world scripts/three-creator scripts/three-episode --maxWorkers=1
node --test --test-concurrency=2 scripts/three-episode/*.test.mjs scripts/cloud/three-episode-scheduling.test.mjs scripts/lib/cloud-production-run.test.mjs
pnpm typecheck
pnpm test:census
pnpm three:creator:prebuild --profile three-sdk --output .codex-tmp/mounted-runtime-final
git diff --check
```

All local cloud-related tests retain mocks. Do not run unrelated historical packages or cloud generation. If final runtime bytes differ from the acceptance build because runtime source changed, rerun the bounded browser/Episode case against the final build; documentation-only changes do not justify repeating runtime recordings.

- [x] Root requests independent final read-only review against the feature base with the spec, this plan, exact final SHA, changed files and test evidence. Address actionable correctness/ownership/lifecycle findings; do not merge or deploy automatically. Follow the user's existing branch handoff intent without creating a new PR/deployment scope from this plan.

- [x] Save `docs/reviews/2026-09-08-three-mounted-interaction.md` with separate statements for local contracts, final aggregate, Creator runtime/input/media, local Episode capture, actual source-model visual review and production/cloud deployment. Write the final user report in the same categories; any unperformed visual or capture requirement stays explicitly open instead of a broad “complete” claim.

## Spec coverage checklist

- [x] Sections 1–4: one package/physics/input/camera owner, ground-mount scope, explicit instances and no duplicate seat state — Tasks 1–3.
- [x] Section 5: resource discovery, Source101 dependency, truthful allowed-policy behavior, real gait adapter and complete minimum example — Tasks 3–4.
- [x] Section 6.1: explicit target, busy/transition/velocity/side/reach/support/path/whole-envelope checks and rollback-free refusal — Task 1.
- [x] Section 6.2: supported low-speed exit, exact verified final feet position/yaw/real velocity, active physics during transition, coasting horse — Task 1.
- [x] Section 6.3: independent capsule disabled while mounted, one combined configured envelope calibrated on actual rider+horse — Tasks 1, 3.
- [x] Section 6.4: single logical spec.seat, scale normalization, fixed and declared animated anchors, current-frame matrices, bounded diagnostic failure — Tasks 2–3.
- [x] Section 6.5: finite/bounds/initial/end overlap, body path with height changes, support/medium, fresh actor queries, sensors and unchanged collider count — Task 1.
- [x] Section 7: applied receipt semantics, distinct errors, no duplicate queue/input edge, held input transfer, pause/reset/dispose/lease and camera continuity — Tasks 1–2.
- [x] Section 7.1: common tick pair/alpha, discontinuity cuts, display→horse→anchor→rider→camera, idempotent frames, fixed input independent of display rate, exact Episode time — Tasks 2–3.
- [x] Section 8: all ten acceptance rows, actual models/inputs/Creator >=180s/local Episode trace and separate visual evidence — Tasks 1–4.
- [x] Sections 9–11: source-backed changes, final checks, source/runtime identity and scoped provenance without claiming external engine documentation proves correctness — Task 5.

## Resolved design choices and bounded review questions

The defaults in this plan are concrete, so execution does not require user clarification: explicit-target enter; boolean public methods plus structured world receipts; direct current-pose shape queries; existing single envelope; mount-only passive coasting; internal lease capability; temporary display roots with authoritative logical reads; fixed animation/camera history and idempotent sampling; TrainingCharacter-style real-resource horse loader. Root may simplify internal implementation while preserving these consumed/produced signatures and semantics.

Before executing Task 2, root should validate the camera/presentation seam against existing camera tests: canonical camera state must not be overwritten by display interpolation because yaw is consumed by movement. Before accepting Task 3, actual fixture measurements decide animated Body-anchor bounds and source normalization; the plan intentionally does not invent numeric calibration evidence. These are implementation/measurement decisions within the authorized scope, not new approval gates.

## Final execution status

Completed on final code `26163127844590e7e96c641524017fa507a97622`: 644 Three/Creator/Episode tests, 104 unchanged Node contracts, typecheck, census and runtime prebuild passed. The final whole-branch camera finding was reproduced, fixed and independently re-reviewed with no remaining actionable finding. Final-runtime Creator185.509s video and independent Episode30s/720frames passed. Actual source/model views and limitations are recorded in [the implementation record](../../reviews/2026-09-08-three-mounted-interaction.md). The user subsequently authorized integration into `codex/three-sdk-data-production-20260907`. The feature worktree and immutable evidence remain preserved; deployment and cloud restart are outside this handoff.
