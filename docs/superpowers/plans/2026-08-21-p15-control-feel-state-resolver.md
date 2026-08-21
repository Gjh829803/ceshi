# P1.5 Control Feel / Medium / State Resolver Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Ground/Air humanoid feel, support, and movement medium follow one locked Profile set and one `checkSupport()` per tick, then prove it with Golden and G Bot gates.

**Architecture:** Clean-break Registry contracts move speeds into `control-feel-profile`, keep slope/step on `physics-body-profile`, and shrink `locomotion-profile` / `motion-profile` / `medium-profile` to their spec owners. A pure State Resolver writes `movementMedium: "ground" | "air"`. The Babylon adapter only executes compiled numbers, bootstraps contact with one unpublished integrate, and never raycasts or uses AABB tops.

**Tech Stack:** TypeScript 5.9, Vitest, existing Registry/Authoring/Compiler/Babylon+Havok packages, lockfile `@babylonjs/core@9.21.2` and `@babylonjs/havok@1.3.14`.

**Spec:** `docs/superpowers/specs/2026-08-21-control-feel-physics-medium-state-resolver-design.md` on `main`. Read only that file for field names, ranges, diagnostics, and closed set.

## Global Constraints

- First slice is Ground/Air humanoid Character only. Do not publish `movementMedium: "water"`.
- Do not add Validation Report, CLI, or Browser protocol fields. Do not edit `scripts/worldkit.ts`, `scripts/worldkit.test.ts`, root `package.json`, `pnpm-lock.yaml`, `docs/18-refactor-progress-and-backlog.md` until Task 8, `docs/superpowers/specs/2026-08-19-world-validation-report-and-quality-gates-design.md`, `packages/validation/**`, or `packages/control-capture/src/control-capture-bundle.ts`.
- Do not add a new workspace package. Put the collider support helper in `@whitebox-world/terrain-surface`.
- Clean Break: no aliases for deleted speed fields, motion parameter bags, `ground-water-air.standard@1`, or ray bootstrap flags.
- Public kinds are exactly `control-profile`, `control-feel-profile`, `locomotion-profile`, `medium-profile`. Do not introduce `control-method-profile` or `physics-medium-profile`.
- Feel numbers live only on `control-feel-profile`. Slope/step live only on `physics-body-profile.physicsBody`.
- Every published Character tick calls `checkSupport(FIXED_TIME_STEP_SECONDS, gravity)` once. `FIXED_TIME_STEP_SECONDS` stays `1/60`.
- Use `===` / `!==`, `isNil` / `isEmpty` from `lodash-es` named imports, no `==`.
- Diagnostic messages must start with the spec code, for example `LOCOMOTION_PROFILE_SPEED_FORBIDDEN:`.
- TDD every task. Stage only that task's files. Commit after the focused gate is green.
- Do not update `docs/18` checkboxes or progress percentages until Task 8's full gates pass.

## Locked first-slice values

Use these exact production Refs and numbers. Do not invent a third Feel or keep `stepHeightMeters` on Motion/Feel.

| Ref | Role |
| --- | --- |
| `worldkit://control-feel-profile/humanoid.medium-ground@1` | Current medium humanoid feel |
| `worldkit://control-feel-profile/humanoid.heavy-ground@1` | Distinguishable heavier feel |
| `worldkit://medium-profile/ground-air.standard@1` | Replaces `ground-water-air.standard@1` |
| `worldkit://locomotion-profile/ground.standard@1` | Boolean-only locomotion |
| `worldkit://control-profile/planar.camera-relative@1` | Production intent profile |
| `worldkit://motion-profile/free-ground.humanoid-medium@1` | Kernel + tags only |
| `worldkit://motion-profile/safe-ground@1` | Fallback kernel + tags; same Definition Feel |

`humanoid.medium-ground@1`:

```ts
{
  walkSpeedMetersPerSecond: 2.4,
  runSpeedMetersPerSecond: 4,
  jumpSpeedMetersPerSecond: 5.5,
  accelerationMetersPerSecondSquared: 16,
  decelerationMetersPerSecondSquared: 22,
  turnRateRadiansPerSecond: 9,
  moveResponseExponent: 1.4,
  airControlRatio: 0.3,
  coyoteTimeSeconds: 0.1,
  jumpBufferSeconds: 0.12,
  variableJumpHoldSeconds: 0.18,
  jumpHoldGravityRatio: 0.45,
  jumpReleaseGravityRatio: 2,
}
```

`humanoid.heavy-ground@1`:

```ts
{
  walkSpeedMetersPerSecond: 1.6,
  runSpeedMetersPerSecond: 2.6,
  jumpSpeedMetersPerSecond: 4.5,
  accelerationMetersPerSecondSquared: 8,
  decelerationMetersPerSecondSquared: 14,
  turnRateRadiansPerSecond: 4,
  moveResponseExponent: 1.8,
  airControlRatio: 0.12,
  coyoteTimeSeconds: 0.1,
  jumpBufferSeconds: 0.12,
  variableJumpHoldSeconds: 0.18,
  jumpHoldGravityRatio: 0.45,
  jumpReleaseGravityRatio: 2,
}
```

`ground-air.standard@1`:

```ts
{ air: { gravityRatio: 1, linearDragPerSecond: 0.05 } }
```

`ground.standard@1` locomotion payload:

```ts
{ allowWalk: true, allowRun: true, allowJump: true }
```

Production `control-profile` payload:

```ts
{
  commandKind: "planar-vector",
  inputSpace: "camera-relative",
  facingPolicy: "align-to-move" | "align-to-view",
  lateralMovementPolicy: "allowed",
  moveDeadzoneRatio: 0.1,
}
```

Golden and G Bot Definitions must set `profiles.controlFeelProfileRef` to `humanoid.medium-ground@1` and `profiles.mediumProfileRef` to `ground-air.standard@1`.

---

### Task 1: Lock failing reproducers for current debt

**Files:**
- Create: `packages/subject-registry/src/p15-admission-repro.test.ts`
- Create: `packages/runtime-babylon/src/p15-runtime-debt-repro.test.ts`

**Interfaces:**
- Consumes: current `main` Registry and Runtime APIs.
- Produces: failing tests that name the debt. Do not change production code in this task.

- [ ] **Step 1: Write Registry admission RED tests**

```ts
import { describe, expect, it } from "vitest";
import { createBuiltInSubjectResourceRegistry } from "./index.js";

describe("P1.5 admission debt", () => {
  const registry = createBuiltInSubjectResourceRegistry();

  it("currently admits locomotion speeds that must become LOCOMOTION_PROFILE_SPEED_FORBIDDEN", () => {
    const locomotion = registry.getResource(
      "worldkit://locomotion-profile/ground.standard@1",
    );
    expect(locomotion?.kind).toBe("locomotion-profile");
    expect(
      (locomotion as { locomotion?: { walkSpeedMetersPerSecond?: number } })
        .locomotion?.walkSpeedMetersPerSecond,
    ).toBe(2.4);
  });

  it("currently admits motion numeric bags including stepHeightMeters 0.35", () => {
    const motion = registry.getResource(
      "worldkit://motion-profile/free-ground.humanoid-medium@1",
    );
    expect(motion?.kind).toBe("motion-profile");
    expect(
      (motion as { parameters?: { stepHeightMeters?: number } }).parameters
        ?.stepHeightMeters,
    ).toBe(0.35);
  });

  it("currently binds ground-water-air medium and no controlFeelProfileRef", () => {
    const subject = registry.getResource(
      "worldkit://subject-definition/humanoid.g-bot@1",
    );
    expect(subject?.kind).toBe("subject-definition");
    const profiles = (
      subject as {
        profiles: {
          mediumProfileRef: string;
          controlFeelProfileRef?: string;
        };
      }
    ).profiles;
    expect(profiles.mediumProfileRef).toBe(
      "worldkit://medium-profile/ground-water-air.standard@1",
    );
    expect(profiles.controlFeelProfileRef).toBeUndefined();
  });
});
```

- [ ] **Step 2: Write Runtime debt RED tests that inspect current behavior**

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const kernelSource = readFileSync(
  new URL("./motion-kernel-runtime.ts", import.meta.url),
  "utf8",
);
const worldSource = readFileSync(
  new URL("./babylon-world-runtime.ts", import.meta.url),
  "utf8",
);

describe("P1.5 runtime debt", () => {
  it("still bootstraps ground with a physics raycast", () => {
    expect(kernelSource.includes("hasWalkablePhysicalGroundAt")).toBe(true);
    expect(kernelSource.includes("physicsEngine.raycast")).toBe(true);
    expect(kernelSource.includes("initialGroundSupportPending")).toBe(true);
  });

  it("still overwrites controller step/slope from motion parameters", () => {
    expect(kernelSource.includes('numberParameter(\n        this.activeProfile,\n        "stepHeightMeters",\n        0.35,')).toBe(true);
    expect(kernelSource.includes('"maximumSlopeDegrees", 50)')).toBe(true);
  });

  it("still treats water membership as a published movementMedium", () => {
    expect(kernelSource.includes('return "water"')).toBe(true);
  });

  it("still revalidates object supported-by with AABB Y", () => {
    expect(worldSource.includes("supporting.maximumMetersXYZ[1]")).toBe(true);
  });
});
```

- [ ] **Step 3: Run the new tests**

Run: `pnpm vitest run packages/subject-registry/src/p15-admission-repro.test.ts packages/runtime-babylon/src/p15-runtime-debt-repro.test.ts`

Expected: PASS against current `main` (they document debt). After later tasks flip these files into inverted assertions, they must still pass.

- [ ] **Step 4: Commit**

```bash
git add packages/subject-registry/src/p15-admission-repro.test.ts packages/runtime-babylon/src/p15-runtime-debt-repro.test.ts
git commit -m "test: lock P1.5 feel and support debt reproducers"
```

---

### Task 2: Clean-break Registry types and admission

**Files:**
- Modify: `packages/subject-registry/src/types-v2.ts`
- Modify: `packages/subject-registry/src/types-v3.ts`
- Modify: `packages/subject-registry/src/subject-resource-registry.ts`
- Modify: `packages/subject-registry/src/p15-admission-repro.test.ts`
- Test: `packages/subject-registry/src/subject-registry.test.ts`
- Test: `packages/subject-registry/src/capability-registry.test.ts`

**Interfaces:**
- Produces: `ControlFeelProfileInputV1`, boolean-only `LocomotionProfileManifestInputV1`, bag-free `MotionProfileInputV1`, first-slice `ControlProfileInputV1`, first-slice `MediumProfileInputV1`, `profiles.controlFeelProfileRef` on `RegistrySubjectDefinitionInputV3`.
- Admission functions throw the spec codes from spec §11.

- [ ] **Step 1: Write inverted admission tests first**

Replace Task 1 Registry assertions with:

```ts
it("rejects locomotion speed fields", () => {
  expect(() =>
    createSubjectResourceRegistry([
      {
        kind: "locomotion-profile",
        id: "illegal",
        version: 1,
        resourceRef: "worldkit://locomotion-profile/illegal@1",
        allowWalk: true,
        allowRun: true,
        allowJump: true,
        walkSpeedMetersPerSecond: 2.4,
        aiMetadata: { displayName: "x", description: "x", semanticTags: ["x"] },
      } as never,
    ]),
  ).toThrow(/LOCOMOTION_PROFILE_SPEED_FORBIDDEN/);
});

it("rejects motion parameter bags", () => {
  expect(() =>
    createSubjectResourceRegistry([
      {
        kind: "motion-profile",
        id: "illegal",
        version: 1,
        resourceRef: "worldkit://motion-profile/illegal@1",
        motionKernelRef: "worldkit://motion-kernel/free-ground@1",
        parameters: { stepHeightMeters: 0.35 },
        motionTags: ["ground"],
        aiMetadata: { displayName: "x", description: "x", semanticTags: ["x"] },
      } as never,
    ]),
  ).toThrow(/MOTION_PROFILE_NUMERIC_BAG_FORBIDDEN/);
});

it("rejects water or groundingTolerance on medium V1", () => {
  expect(() =>
    createSubjectResourceRegistry([
      {
        kind: "medium-profile",
        id: "illegal",
        version: 1,
        resourceRef: "worldkit://medium-profile/illegal@1",
        air: { gravityRatio: 1, linearDragPerSecond: 0.05 },
        water: { buoyancyRatio: 1 },
        aiMetadata: { displayName: "x", description: "x", semanticTags: ["x"] },
      } as never,
    ]),
  ).toThrow(/MEDIUM_PROFILE_FIELD_FORBIDDEN/);
});

it("rejects a subject definition without controlFeelProfileRef", () => {
  const { G_BOT_HUMANOID_DEFINITION } = await import(
    "./built-in-subject-definitions.js"
  );
  const withoutFeel = {
    ...G_BOT_HUMANOID_DEFINITION,
    profiles: { ...G_BOT_HUMANOID_DEFINITION.profiles },
  };
  delete (withoutFeel.profiles as { controlFeelProfileRef?: string })
    .controlFeelProfileRef;
  expect(() => createSubjectResourceRegistry([withoutFeel as never])).toThrow(
    /SUBJECT_CONTROL_FEEL_PROFILE_REQUIRED/,
  );
});
```

Also add range tests for Feel: `walk > run`, `airControlRatio > 1`, `jumpReleaseGravityRatio < 1` → `CONTROL_FEEL_PROFILE_INVALID`. Physics `maxStepHeightMeters: Number.NaN` → `PHYSICS_BODY_TRAVERSAL_LIMIT_INVALID`.

- [ ] **Step 2: Run RED**

Run: `pnpm vitest run packages/subject-registry/src/p15-admission-repro.test.ts`
Expected: FAIL because current types still accept the old bags.

- [ ] **Step 3: Replace the types**

`LocomotionProfileManifestInputV1` in `types-v2.ts`:

```ts
export interface LocomotionProfileManifestInputV1
  extends SubjectRegistryResourceBaseInputV1 {
  kind: "locomotion-profile";
  requiredCapabilityRefs: readonly string[];
  allowWalk: boolean;
  allowRun: boolean;
  allowJump: boolean;
}
```

Delete `locomotion: { mode, *SpeedMetersPerSecond }`.

Add to `types-v3.ts`:

```ts
export interface ControlFeelProfileInputV1 extends CapabilityResourceBaseInputV1 {
  kind: "control-feel-profile";
  walkSpeedMetersPerSecond: number;
  runSpeedMetersPerSecond: number;
  jumpSpeedMetersPerSecond: number;
  accelerationMetersPerSecondSquared: number;
  decelerationMetersPerSecondSquared: number;
  turnRateRadiansPerSecond: number;
  moveResponseExponent: number;
  airControlRatio: number;
  coyoteTimeSeconds: number;
  jumpBufferSeconds: number;
  variableJumpHoldSeconds: number;
  jumpHoldGravityRatio: number;
  jumpReleaseGravityRatio: number;
}
```

Replace `MotionProfileInputV1` with `{ kind, motionKernelRef, motionTags }` only. Delete `parameters`, `safetyLimits`, `authoringRanges`.

Replace `ControlProfileInputV1` with spec §5.4. Delete `inputTuning`. Production `commandKind` is `"planar-vector" | "none"`. Delete `throttle-steer` / `flight-attitude` production combinations.

Replace `MediumProfileInputV1` with `{ kind, air: { gravityRatio, linearDragPerSecond } }`. Delete `supportedMediums`, `ground`, `water`, `gravityScale`.

Add `controlFeelProfileRef: string` to `RegistrySubjectDefinitionInputV3.profiles`. Delete the comment that locomotion is a V2 compatibility projection for speeds.

Union `ControlFeelProfileInputV1` into `SubjectCapabilityResourceInputV1` and hashed exports.

- [ ] **Step 4: Rewrite admission**

In `subject-resource-registry.ts`:

- `validateLocomotionProfile`: if any own key matches `/Speed|Acceleration|Deceleration|TurnRate|Gravity|Slope|StepHeight|Seconds|Meters|Radians|Ratio/` or if `locomotion` / `parameters` / `tuning` / `supportedMediums` / `allowedMotionKernelRefs` exist, throw `LOCOMOTION_PROFILE_SPEED_FORBIDDEN` or `LOCOMOTION_PROFILE_FIELD_FORBIDDEN`. Require `allowWalk === true` for first-slice built-ins.
- `validateMotionProfile`: if `"parameters" in source || "safetyLimits" in source || "authoringRanges" in source` or any numeric speed/slope/step field exists, throw `MOTION_PROFILE_NUMERIC_BAG_FORBIDDEN`.
- `validateControlFeelProfile`: finite, spec §5.7 bounds, `walk <= run`, `airControlRatio` and `jumpHoldGravityRatio` in `0..1`, `jumpReleaseGravityRatio >= 1`. Else `CONTROL_FEEL_PROFILE_INVALID`.
- `validateMediumProfile`: only `air.gravityRatio` and `air.linearDragPerSecond`. Any `ground` / `water` / `gravityScale` / `groundingToleranceMeters` → `MEDIUM_PROFILE_FIELD_FORBIDDEN`.
- `validatePhysicsBodyProfile`: finite `maxSlopeDegrees` in `(0, 90]` and `maxStepHeightMeters` in `[0, 2]`. Else `PHYSICS_BODY_TRAVERSAL_LIMIT_INVALID`.
- Subject definition: missing/unlocked `controlFeelProfileRef` → `SUBJECT_CONTROL_FEEL_PROFILE_REQUIRED`.
- `allowedOverridePaths` first slice: only `profiles.controlFeelProfileRef`, `profiles.controlProfileRef`, `profiles.motion.defaultMotionProfileRef`. Anything else, including `parameters.*`, → `SUBJECT_OVERRIDE_FORBIDDEN`.

- [ ] **Step 5: Run Registry unit tests**

Run: `pnpm vitest run packages/subject-registry/src`
Expected: FAIL on catalog/definition fixtures until Task 3. Do not edit catalogs in this task except to keep types compiling if needed; prefer Task 3 for fixture rewrite. If TypeScript cannot compile, stub the built-in catalog loaders only enough to finish typecheck of this package, then immediately continue Task 3 in the same working tree before claiming Task 2 done.

If `pnpm typecheck` fails globally because catalogs still have old fields, that is expected. Task 2 is done when the new types and validators exist and the new admission tests fail only on missing catalog entries, not on validator absence.

- [ ] **Step 6: Commit**

```bash
git add packages/subject-registry/src/types-v2.ts packages/subject-registry/src/types-v3.ts packages/subject-registry/src/subject-resource-registry.ts packages/subject-registry/src/p15-admission-repro.test.ts
git commit -m "feat: clean-break P1.5 registry profile contracts"
```

---

### Task 3: Catalog, manifests, and subject definitions

**Files:**
- Create: `assets/registry/control-feel-profiles/catalog.json`
- Modify: `assets/registry/medium-profiles/catalog.json`
- Modify: `assets/registry/motion-profiles/catalog.json`
- Modify: `assets/registry/control-profiles/catalog.json`
- Modify: `packages/subject-registry/src/built-in-resource-manifests.ts`
- Modify: `packages/subject-registry/src/built-in-capability-resources.ts`
- Modify: `packages/subject-registry/src/built-in-subject-definitions.ts`
- Modify: `packages/subject-registry/src/p15-admission-repro.test.ts`
- Modify: `packages/subject-registry/src/subject-registry.test.ts`
- Modify: `packages/subject-registry/src/capability-registry.test.ts`

**Interfaces:**
- Consumes: Task 2 types.
- Produces: loadable built-in registry with two Feel Refs, boolean locomotion, bag-free motion, `ground-air.standard@1`, and Definitions that bind `controlFeelProfileRef`.

- [ ] **Step 1: Write catalog presence tests**

```ts
it("registers two distinguishable built-in feel profiles", () => {
  const registry = createBuiltInSubjectResourceRegistry();
  const medium = registry.getResource(
    "worldkit://control-feel-profile/humanoid.medium-ground@1",
  );
  const heavy = registry.getResource(
    "worldkit://control-feel-profile/humanoid.heavy-ground@1",
  );
  expect(medium?.kind).toBe("control-feel-profile");
  expect(heavy?.kind).toBe("control-feel-profile");
  expect(
    (medium as { accelerationMetersPerSecondSquared: number })
      .accelerationMetersPerSecondSquared,
  ).toBe(16);
  expect(
    (heavy as { accelerationMetersPerSecondSquared: number })
      .accelerationMetersPerSecondSquared,
  ).toBe(8);
});

it("replaces water medium and binds feel on G Bot and Golden", () => {
  const registry = createBuiltInSubjectResourceRegistry();
  expect(
    registry.getResource("worldkit://medium-profile/ground-water-air.standard@1"),
  ).toBeUndefined();
  for (const ref of [
    "worldkit://subject-definition/humanoid.g-bot@1",
    "worldkit://subject-definition/humanoid.golden-rigged@1",
  ]) {
    const subject = registry.getResource(ref) as {
      profiles: { controlFeelProfileRef: string; mediumProfileRef: string };
    };
    expect(subject.profiles.controlFeelProfileRef).toBe(
      "worldkit://control-feel-profile/humanoid.medium-ground@1",
    );
    expect(subject.profiles.mediumProfileRef).toBe(
      "worldkit://medium-profile/ground-air.standard@1",
    );
  }
});
```

- [ ] **Step 2: Run RED**

Run: `pnpm vitest run packages/subject-registry/src/p15-admission-repro.test.ts`
Expected: FAIL, missing Feel catalog.

- [ ] **Step 3: Rewrite catalogs and built-ins**

`assets/registry/control-feel-profiles/catalog.json`: the two Feel objects using locked numbers above. `authoringAvailability` is `"recommended"` for medium and `"advanced"` for heavy.

`medium-profiles/catalog.json`: one object, `id: "ground-air.standard"`, `resourceRef: "worldkit://medium-profile/ground-air.standard@1"`, only `air`.

`motion-profiles/catalog.json`: every profile keeps `kind`, `id`, `version`, `resourceRef`, `authoringAvailability`, `motionKernelRef`, `motionTags`, `aiMetadata`. Delete `parameters`, `safetyLimits`, `authoringRanges`.

`control-profiles/catalog.json`: keep only `planar.camera-relative` and `planar.aim-relative` with `moveDeadzoneRatio` at the top level. Delete `inputTuning`. Delete `throttle-steer.*` and flight control entries so the catalog cannot imply those command kinds are supported.

`built-in-capability-resources.ts`: import the new Feel catalog.

`built-in-resource-manifests.ts`: rewrite `STANDARD_GROUND_LOCOMOTION_PROFILE` to boolean fields only.

`built-in-subject-definitions.ts`: add `controlFeelProfileRef` and switch medium Ref on every V3 definition.

- [ ] **Step 4: Update existing Registry tests**

Remove expectations for `walkSpeedMetersPerSecond` on locomotion, motion `parameters`, `ground-water-air`, and deleted control profiles. Assert boolean locomotion and Feel Ref instead.

- [ ] **Step 5: Run Registry package tests**

Run: `pnpm vitest run packages/subject-registry/src`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add assets/registry packages/subject-registry/src
git commit -m "feat: clean-break built-in feel, medium, and locomotion catalogs"
```

---

### Task 4: Authoring, Compiler, and ExecutionPlan projection

**Files:**
- Modify: `packages/authoring/src/types.ts`
- Modify: `packages/authoring/src/subject-definition-normalizer.ts`
- Modify: `packages/authoring/src/subject-definition-normalizer.test.ts`
- Modify: `packages/compiler/src/compile.ts`
- Modify: `packages/compiler/src/compile.test.ts`
- Modify: `packages/runtime-contracts/src/execution-plan.ts`
- Modify: `packages/runtime-contracts/src/runtime-session.ts`
- Modify: `packages/runtime-contracts/src/runtime-contracts.test.ts`
- Modify: any Authoring/Compiler fixtures that embed old locomotion speeds

**Interfaces:**
- Consumes: Task 3 locked Refs.
- Produces: `ExecutionSubjectV3.controlFeel`, `ExecutionSubjectV3.mediumProfile`, bag-free `ExecutionMotionProfileV1`, `ExecutionControlProfileV1.moveDeadzoneRatio`, Snapshot `movementMedium: "ground" | "air"`, Snapshot `activeControlFeelProfileRef`.
- Deletes: `ExecutionSubjectV3.locomotion.*Speed*`, `ExecutionMotionProfileV1.parameters`, `capabilityAssembly.mediumProfile.water`, `setMotionTuning` numeric bag from the production session contract.

- [ ] **Step 1: Write Compiler projection tests**

```ts
it("projects feel and body traversal, not locomotion speeds", () => {
  const plan = compileAuthoringSpec(
    createValidAuthoringSpec({
      subjectDefinitionRef: "worldkit://subject-definition/humanoid.g-bot@1",
    }),
  );
  const player = plan.subjectsByEntityId.player;
  expect(player.locomotion).toEqual({
    allowWalk: true,
    allowRun: true,
    allowJump: true,
  });
  expect(player.controlFeel).toEqual(
    expect.objectContaining({
      resourceRef: "worldkit://control-feel-profile/humanoid.medium-ground@1",
      walkSpeedMetersPerSecond: 2.4,
      accelerationMetersPerSecondSquared: 16,
    }),
  );
  expect(player.collider.maxStepHeightMeters).toBe(0.3);
  expect(player.collider.maxSlopeDegrees).toBe(42);
  expect(player.capabilityAssembly?.defaultMotionProfile.parameters).toBeUndefined();
  expect(player.capabilityAssembly?.mediumProfile).toEqual({
    resourceRef: "worldkit://medium-profile/ground-air.standard@1",
    air: { gravityRatio: 1, linearDragPerSecond: 0.05 },
  });
});

it("refuses to compile a published water movementMedium", () => {
  const spec = createValidAuthoringSpec();
  expect(() =>
    compileAuthoringSpec({
      ...spec,
      // Force a compiled subject snapshot medium. The compiler must reject
      // any path that would publish "water" on ExecutionSubject or defaults.
      subjects: [{ ...spec.nodes.find((node) => node.kind === "subject"), movementMedium: "water" }],
    } as never),
  ).toThrow(/SUBJECT_MOVEMENT_MEDIUM_UNSUPPORTED/);
});
```

- [ ] **Step 2: Run RED**

Run: `pnpm vitest run packages/compiler/src/compile.test.ts packages/authoring/src/subject-definition-normalizer.test.ts packages/runtime-contracts/src/runtime-contracts.test.ts`
Expected: FAIL on missing `controlFeel` / leftover speeds.

- [ ] **Step 3: Change the contracts**

`ExecutionSubjectV3.locomotion`:

```ts
locomotion: {
  allowWalk: boolean;
  allowRun: boolean;
  allowJump: boolean;
};
controlFeel: {
  resourceRef: string;
  walkSpeedMetersPerSecond: number;
  runSpeedMetersPerSecond: number;
  jumpSpeedMetersPerSecond: number;
  accelerationMetersPerSecondSquared: number;
  decelerationMetersPerSecondSquared: number;
  turnRateRadiansPerSecond: number;
  moveResponseExponent: number;
  airControlRatio: number;
  coyoteTimeSeconds: number;
  jumpBufferSeconds: number;
  variableJumpHoldSeconds: number;
  jumpHoldGravityRatio: number;
  jumpReleaseGravityRatio: number;
};
```

`ExecutionMotionProfileV1`: `{ resourceRef, motionKernelRef, motionTags }`.

`ExecutionControlProfileV1`: drop `inputTuning`; keep `moveDeadzoneRatio`.

`ExecutionSubjectCapabilityAssemblyV1.mediumProfile`: `{ resourceRef, air: { gravityRatio, linearDragPerSecond } }`.

`SubjectRuntimeStateV3.movementMedium`: `"ground" | "air"`. Add `activeControlFeelProfileRef?: string` and `locomotionMode?: "idle" | "walk" | "run" | "airborne"`.

Remove `setMotionTuning` from `runtime-session.ts` or keep the method but type it as forbidden; first slice must not accept a numeric bag. Prefer deletion and replace tests with Feel Ref override.

Authoring normalizer reads Feel from `profiles.controlFeelProfileRef` and copies the locked numbers onto the normalized subject. It must not copy speeds from locomotion.

Compiler copies the same fields. If any compiled snapshot/default medium is `"water"`, throw `SUBJECT_MOVEMENT_MEDIUM_UNSUPPORTED`.

- [ ] **Step 4: Update tests and fixtures**

Replace every `walkSpeedMetersPerSecond` expectation on locomotion with Feel. Replace `setMotionTuning` tests later in Task 6; in this task only fix compile/authoring/contract tests so they compile.

- [ ] **Step 5: Run focused gates**

Run: `pnpm vitest run packages/authoring/src packages/compiler/src packages/runtime-contracts/src`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/authoring/src packages/compiler/src packages/runtime-contracts/src
git commit -m "feat: project P1.5 feel and boolean locomotion into ExecutionPlan"
```

---

### Task 5: Pure State Resolver

**Files:**
- Create: `packages/subject-actions/src/character-state-resolver.ts`
- Create: `packages/subject-actions/src/character-state-resolver.test.ts`
- Modify: `packages/subject-actions/src/types.ts`
- Modify: `packages/subject-actions/src/ground-humanoid-action-resolver.ts`
- Modify: `packages/subject-actions/src/subject-actions.test.ts`
- Modify: `packages/subject-actions/src/index.ts`

**Interfaces:**
- Consumes: `CharacterSupportSampleV1`, locked profile refs, Feel jump flags, previous `SubjectResolvedStateV1`.
- Produces: `resolveCharacterStateV1(input): { state: SubjectResolvedStateV1; diagnosticCode?: string }`.

```ts
export type CharacterSupportStateV1 = "supported" | "sliding" | "unsupported";

export interface CharacterSupportSampleV1 {
  supportState: CharacterSupportStateV1;
  supportNormalWorldXYZ: readonly [number, number, number];
}

export interface SubjectResolvedStateV1 {
  movementMedium: "ground" | "air";
  locomotionMode: "idle" | "walk" | "run" | "airborne";
  activePhysicsBodyProfileRef: string;
  activeLocomotionProfileRef: string;
  activeMotionProfileRef: string;
  activeMotionKernelRef: string;
  activeControlFeelProfileRef: string;
  activeControlProfileRef: string;
  activeMediumProfileRef: string;
  isJumpAllowed: boolean;
}

export interface ResolveCharacterStateInputV1 {
  previousState: SubjectResolvedStateV1 | undefined;
  supportSample: CharacterSupportSampleV1 | undefined;
  locked: {
    physicsBodyProfileRef: string;
    locomotionProfileRef: string;
    motionProfileRef: string;
    motionKernelRef: string;
    controlFeelProfileRef: string;
    controlProfileRef: string;
    mediumProfileRef: string;
    allowWalk: boolean;
    allowRun: boolean;
    allowJump: boolean;
    coyoteTimeSeconds: number;
  };
  requested: {
    moveRequested: boolean;
    runRequested: boolean;
  };
  coyoteRemainingSeconds: number;
}
```

- [ ] **Step 1: Write resolver tests**

```ts
it("maps unsupported to air and does not publish water", () => {
  const result = resolveCharacterStateV1({
    previousState: undefined,
    supportSample: {
      supportState: "unsupported",
      supportNormalWorldXYZ: [0, 1, 0],
    },
    locked: MEDIUM_LOCK,
    requested: { moveRequested: false, runRequested: false },
    coyoteRemainingSeconds: 0,
  });
  expect(result.state.movementMedium).toBe("air");
  expect(result.state.locomotionMode).toBe("airborne");
  expect(result.state.isJumpAllowed).toBe(false);
});

it("maps sliding to ground but does not arm jump or coyote", () => {
  const result = resolveCharacterStateV1({
    previousState: GROUND_IDLE,
    supportSample: {
      supportState: "sliding",
      supportNormalWorldXYZ: [0.4, 0.9, 0],
    },
    locked: { ...MEDIUM_LOCK, allowJump: true },
    requested: { moveRequested: true, runRequested: false },
    coyoteRemainingSeconds: 0,
  });
  expect(result.state.movementMedium).toBe("ground");
  expect(result.state.locomotionMode).toBe("walk");
  expect(result.state.isJumpAllowed).toBe(false);
});

it("allows jump only on supported plus allowJump or remaining coyote", () => {
  expect(
    resolveCharacterStateV1({
      previousState: GROUND_IDLE,
      supportSample: { supportState: "supported", supportNormalWorldXYZ: [0, 1, 0] },
      locked: { ...MEDIUM_LOCK, allowJump: true },
      requested: { moveRequested: false, runRequested: false },
      coyoteRemainingSeconds: 0,
    }).state.isJumpAllowed,
  ).toBe(true);
  expect(
    resolveCharacterStateV1({
      previousState: GROUND_IDLE,
      supportSample: { supportState: "unsupported", supportNormalWorldXYZ: [0, 1, 0] },
      locked: { ...MEDIUM_LOCK, allowJump: true, coyoteTimeSeconds: 0.1 },
      requested: { moveRequested: false, runRequested: false },
      coyoteRemainingSeconds: 0.05,
    }).state.isJumpAllowed,
  ).toBe(true);
});

it("keeps the previous combination when a locked ref is missing", () => {
  const result = resolveCharacterStateV1({
    previousState: GROUND_IDLE,
    supportSample: { supportState: "supported", supportNormalWorldXYZ: [0, 1, 0] },
    locked: { ...MEDIUM_LOCK, controlFeelProfileRef: "" },
    requested: { moveRequested: false, runRequested: false },
    coyoteRemainingSeconds: 0,
  });
  expect(result.state).toEqual(GROUND_IDLE);
  expect(result.diagnosticCode).toBe("SUBJECT_STATE_RESOLVE_UNCHANGED");
});

it("fails when support sample is missing", () => {
  const result = resolveCharacterStateV1({
    previousState: GROUND_IDLE,
    supportSample: undefined,
    locked: MEDIUM_LOCK,
    requested: { moveRequested: false, runRequested: false },
    coyoteRemainingSeconds: 0,
  });
  expect(result.diagnosticCode).toBe("SUBJECT_SUPPORT_QUERY_MISSING");
});
```

`isNil` for missing refs/samples. Coyote must not set `movementMedium` back to `"ground"`.

- [ ] **Step 2: Run RED**

Run: `pnpm vitest run packages/subject-actions/src/character-state-resolver.test.ts`
Expected: FAIL, module missing.

- [ ] **Step 3: Implement the resolver**

Follow spec §7 order exactly. Map Provider-neutral support states only. Cold start with an incomplete lock throws `SUBJECT_CONTROL_FEEL_PROFILE_REQUIRED` rather than inventing defaults.

Change `GroundHumanoidActionInputV1.movementMedium` to `"ground" | "air"`. Update action tests that used `"water"`: they must now treat a water volume as still `"ground"` or `"air"` from support, never a third medium.

- [ ] **Step 4: Run subject-actions tests**

Run: `pnpm vitest run packages/subject-actions/src`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/subject-actions/src
git commit -m "feat: add ground/air character state resolver"
```

---

### Task 6: Babylon adapter — Feel, one support query, bootstrap

**Files:**
- Modify: `packages/runtime-babylon/src/motion-kernel-runtime.ts`
- Modify: `packages/runtime-babylon/src/subject-controller.ts`
- Modify: `packages/runtime-babylon/src/babylon-world-runtime.ts`
- Modify: `packages/runtime-babylon/src/p15-runtime-debt-repro.test.ts`
- Modify: `packages/runtime-babylon/src/runtime.test.ts`
- Modify: `packages/runtime-babylon/src/capability-runtime.test.ts`
- Modify: `packages/animation/src/humanoid-action-state-machine.ts` only if it still reads `movementMedium: "water"`

**Interfaces:**
- Consumes: `ExecutionSubjectV3.controlFeel`, Task 5 resolver, `PhysicsCharacterController` from `@babylonjs/core/Physics/v2/characterController.js`.
- Produces: adapter that reads Feel, maps Body slope/step once, bootstraps without publishing, and never writes water.

- [ ] **Step 1: Invert the debt tests**

```ts
it("does not bootstrap ground with a physics raycast", () => {
  expect(kernelSource.includes("hasWalkablePhysicalGroundAt")).toBe(false);
  expect(kernelSource.includes("physicsEngine.raycast")).toBe(false);
  expect(kernelSource.includes("initialGroundSupportPending")).toBe(false);
});

it("does not overwrite controller step/slope from motion parameters", () => {
  expect(kernelSource.includes("stepHeightMeters")).toBe(false);
  expect(kernelSource.includes("maximumSlopeDegrees")).toBe(false);
});

it("does not publish water from membership", () => {
  expect(kernelSource.includes('return "water"')).toBe(false);
});
```

Add a runtime integration test: after `reset()`, first published snapshot `movementMedium` is `"air"` or `"ground"` from `checkSupport`, never forced ground. A subject spawned 0.4 m above terrain must publish `"air"` on the first published tick.

Add a Feel switch test: same world, same input ticks, `humanoid.medium-ground@1` vs `humanoid.heavy-ground@1` produce different `speedMetersPerSecond` or yaw; both hashes differ; no `setMotionTuning`.

- [ ] **Step 2: Run RED**

Run: `pnpm vitest run packages/runtime-babylon/src/p15-runtime-debt-repro.test.ts`
Expected: FAIL until the adapter is rewritten.

- [ ] **Step 3: Rewrite MotionKernelRuntimeV1**

Constructor:

```ts
this.physicsController.maxSlopeCosine = Math.cos(
  (subject.collider.maxSlopeDegrees * Math.PI) / 180,
);
this.physicsController.maxStepHeight = subject.collider.maxStepHeightMeters;
this.physicsController.characterMass = subject.collider.massKilograms;
// Do not assign physicsController.acceleration.
this.bootstrapContactManifold();
```

`bootstrapContactManifold`:

```ts
private bootstrapContactManifold(): void {
  const unsupported = {
    supportedState: CharacterSupportedState.UNSUPPORTED,
    averageSurfaceNormal: Vector3.Zero(),
    averageSurfaceVelocity: Vector3.Zero(),
    averageAngularSurfaceVelocity: Vector3.Zero(),
    isSurfaceDynamic: false,
  };
  this.physicsController.integrate(
    FIXED_TIME_STEP_SECONDS,
    unsupported,
    this.gravity,
  );
}
```

This integrate must not call the resolver, must not emit a snapshot, must not start an action, and must not write `movementMedium`. After it, the first published tick calls `checkSupport` once and passes the projected sample into `resolveCharacterStateV1`.

Delete `hasWalkablePhysicalGroundAt`, `initialGroundSupportPending`, `movementMediumForSupport` water branch, and `numberParameter(..., "stepHeightMeters" | "maximumSlopeDegrees" | "walkSpeedMetersPerSecond", fallback)`.

Every feel number comes from `subject.controlFeel`. Missing Feel throws `SUBJECT_CONTROL_FEEL_PROFILE_REQUIRED` at construction.

Gravity:

```ts
const jumpPhaseRatio = this.jumpHoldActive
  ? this.subject.controlFeel.jumpHoldGravityRatio
  : this.jumpReleasedThisApex
    ? this.subject.controlFeel.jumpReleaseGravityRatio
    : 1;
const effectiveGravity = this.gravity.scale(
  this.subject.capabilityAssembly?.mediumProfile.air.gravityRatio ?? 1,
).scale(jumpPhaseRatio);
```

If medium profile is missing, fail admission earlier; do not default `?? 1` in production construction. The `?? 1` above is not allowed in shipped code. Require `mediumProfile` on first-slice capability-driven subjects.

Coyote timer updates from resolver `isJumpAllowed` rules: decrement only while unsupported; do not re-arm from sliding.

`reset()` repeats setPosition, zero velocity, clear latches, bootstrap integrate, then first published support query. Do not publish the bootstrap tick.

Delete `setMotionTuning`. Add `requestControlFeelProfile(resourceRef: string): boolean` that only accepts a locked Feel Ref on `allowedOverridePaths`. Failure keeps the previous Feel and surfaces `SUBJECT_OVERRIDE_FORBIDDEN` or `SUBJECT_STATE_RESOLVE_UNCHANGED`.

Snapshot must include `activeControlFeelProfileRef` and `locomotionMode`. Never `"water"`.

Rewrite water tests in `runtime.test.ts`: a water volume may exist as scenery, but `movementMedium` stays `"ground"` or `"air"` from support. Delete assertions that expect `"water"`.

Rewrite capability tuning tests to switch Feel Refs.

- [ ] **Step 4: Run runtime tests**

Run: `pnpm vitest run packages/runtime-babylon/src`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/runtime-babylon/src packages/animation/src
git commit -m "feat: drive character motion from locked feel and checkSupport"
```

---

### Task 7: Collider-backed object `supported-by`

**Files:**
- Create: `packages/terrain-surface/src/collider-support.ts`
- Modify: `packages/terrain-surface/src/index.ts`
- Modify: `packages/terrain-surface/src/terrain-surface.test.ts`
- Modify: `packages/layout-solver/src/evaluators.ts`
- Modify: `packages/layout-solver/src/evaluators.test.ts`
- Modify: `packages/runtime-babylon/src/babylon-world-runtime.ts`
- Modify: `packages/runtime-babylon/src/runtime.test.ts`
- Modify: `packages/runtime-babylon/src/p15-runtime-debt-repro.test.ts`

**Interfaces:**

```ts
export type LockedSupportColliderV1 =
  | {
      kind: "box";
      centerMetersXYZ: readonly [number, number, number];
      halfExtentsMetersXYZ: readonly [number, number, number];
      rotationEulerRadiansXYZ: readonly [number, number, number];
    }
  | {
      kind: "capsule" | "cylinder" | "sphere";
      centerMetersXYZ: readonly [number, number, number];
      radiusMeters: number;
      heightMeters?: number;
    }
  | { kind: "convex"; verticesMetersXYZ: readonly (readonly [number, number, number])[] };

export function queryLockedColliderSupportHeightMeters(
  collider: LockedSupportColliderV1,
  pointMetersXZ: readonly [number, number],
): number | undefined;
```

- Consumes: locked object collider, not mesh bounds.
- Produces: support height for Layout evaluation and Runtime revalidation. Unsupported kinds throw `OBJECT_SUPPORT_SURFACE_QUERY_UNSUPPORTED`.

- [ ] **Step 1: Write surface tests**

```ts
it("returns the box top at an interior XZ sample, not an inflated AABB after rotation", () => {
  const height = queryLockedColliderSupportHeightMeters(
    {
      kind: "box",
      centerMetersXYZ: [0, 1, 0],
      halfExtentsMetersXYZ: [1, 0.25, 1],
      rotationEulerRadiansXYZ: [0, 0, 0],
    },
    [0.2, -0.1],
  );
  expect(height).toBeCloseTo(1.25, 5);
});

it("returns undefined outside the footprint", () => {
  expect(
    queryLockedColliderSupportHeightMeters(
      {
        kind: "box",
        centerMetersXYZ: [0, 1, 0],
        halfExtentsMetersXYZ: [1, 0.25, 1],
        rotationEulerRadiansXYZ: [0, 0, 0],
      },
      [4, 0],
    ),
  ).toBeUndefined();
});
```

Add a Runtime test: object visual box taller than collider must fail `supported-by` if the collider top is below the supported bottom. A matching collider top must pass. A custom/unknown collider kind must throw `OBJECT_SUPPORT_SURFACE_QUERY_UNSUPPORTED` and must not read `maximumMetersXYZ[1]`.

Invert the debt test: `babylon-world-runtime.ts` must not contain `supporting.maximumMetersXYZ[1]` as the object support height.

- [ ] **Step 2: Run RED**

Run: `pnpm vitest run packages/terrain-surface/src/terrain-surface.test.ts`
Expected: FAIL, helper missing.

- [ ] **Step 3: Implement the helper and wire both call sites**

Box: transform the sample into collider local XZ, reject outside `[-hx, hx] × [-hz, hz]`, return world Y of the local top face.

Capsule/cylinder: reject outside radius in XZ, return centerY + half height.

Sphere: reject outside radius, return centerY + `sqrt(r^2 - dx^2 - dz^2)`.

Convex: reject if the vertical ray at the sample misses the hull; otherwise return the highest hit Y. If the convex query cannot be determined from the locked vertex set, throw `OBJECT_SUPPORT_SURFACE_QUERY_UNSUPPORTED`.

`evaluateSupport` in `packages/layout-solver/src/evaluators.ts`: terrain stays `sampleHeightfieldV1`. Object path must load the locked collider from context geometry. If only AABB exists and no collider, fail with `OBJECT_SUPPORT_SURFACE_QUERY_UNSUPPORTED`. Sample the supported footprint, compute gaps against collider heights, keep the existing ratio/gap thresholds.

`revalidateSupportAssertion` in `babylon-world-runtime.ts` must call the same helper. Delete the AABB top path.

This query must not write Character `movementMedium` or `isGrounded`.

- [ ] **Step 4: Run focused tests**

Run: `pnpm vitest run packages/terrain-surface/src packages/layout-solver/src/evaluators.test.ts packages/runtime-babylon/src/runtime.test.ts packages/runtime-babylon/src/p15-runtime-debt-repro.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/terrain-surface/src packages/layout-solver/src packages/runtime-babylon/src
git commit -m "feat: query locked colliders for object supported-by"
```

---

### Task 8: Adversarial evidence, full gates, then backlog

**Files:**
- Modify: `packages/runtime-babylon/src/runtime.test.ts`
- Modify: `docs/18-refactor-progress-and-backlog.md` only in the last step
- Modify: fixtures/goldens whose hashes change because Definition/Feel hashes changed

**Interfaces:**
- Consumes: Tasks 3–7.
- Produces: closed-set evidence and updated backlog checkboxes after gates pass.

- [ ] **Step 1: Add adversarial runtime tests**

Cover all of these in `runtime.test.ts` or a new `p15-conformance.test.ts`:

1. Same input ticks at 30/60/120 Hz-like render intervals produce the same fixed-tick snapshot hash and `movementMedium`.
2. Two instances with different Feel Refs do not share speed/yaw.
3. Reset while a move key is held: first published tick uses bootstrap + `checkSupport`, not a ray; coyote/buffer are zero before that query.
4. Walk off a 0.4 m ledge: `movementMedium` becomes `"air"`; coyote may keep `isJumpAllowed` briefly; sliding does not re-arm coyote.
5. Held jump vs press/release uses Feel hold/release gravity ratios; jump is not allowed from `sliding`.
6. Rebind/reset restores controller, body, and listener counts.
7. Publishing `"water"` through the resolver/compiler path throws `SUBJECT_MOVEMENT_MEDIUM_UNSUPPORTED`.

- [ ] **Step 2: Run the new tests**

Run: `pnpm vitest run packages/runtime-babylon/src/p15-conformance.test.ts`
Expected: FAIL if a case is missing, then PASS after the cases exist and the adapter already satisfies them.

- [ ] **Step 3: Run package tests and typecheck**

Run:

```bash
pnpm typecheck
pnpm vitest run packages/subject-registry/src packages/authoring/src packages/compiler/src packages/runtime-contracts/src packages/subject-actions/src packages/layout-solver/src packages/terrain-surface/src packages/runtime-babylon/src packages/animation/src
```

Expected: exit 0.

- [ ] **Step 4: Run the repository production gates named by the spec**

Run:

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm verify:canonical
pnpm verify:placement-layout
pnpm verify:rigged-subject
pnpm verify:g-bot-subject
```

Expected: exit 0. Update Golden/G Bot hashes only when the Definition/Feel content hash actually changed; do not refresh PNG goldens for background noise.

If a gate fails, fix the owning task. Do not weaken Feel numbers, restore `stepHeightMeters` on Motion, or reintroduce ray/AABB.

- [ ] **Step 5: Update backlog only after gates pass**

In `docs/18-refactor-progress-and-backlog.md`:

- Link this plan from P1.5 and M7.
- Check only the P1.5 boxes this slice actually delivered: Feel/Locomotion field ownership, Medium Ground/Air, State Resolver, removal of adapter feel/slope/step defaults, Snapshot Profile refs, Reset/Feel isolation tests.
- Leave water/swim, Hybrid Surface, Validation, and CLI/Browser new protocol boxes unchecked.
- Recalculate progress only if the slice changed a workflow percentage under the 20% design / full-gate rule.

- [ ] **Step 6: Commit**

```bash
git add packages/runtime-babylon/src docs/18-refactor-progress-and-backlog.md
git add # any golden hash files actually changed
git commit -m "test: close P1.5 ground/air feel slice and record backlog"
```

---

## Spec coverage

| Spec closed-set item | Task |
| --- | --- |
| §5–§6 four kinds + Definition Feel binding | 2, 3 |
| Boolean locomotion, bag-free motion, unique Feel | 2, 3, 4 |
| Two distinguishable Feels on Golden / G Bot | 3, 6, 8 |
| Spawn/Reset bootstrap, one support query, ledge, jump edges | 6, 8 |
| Resolver + Snapshot Ground/Air + Profile Refs | 4, 5, 6 |
| Object primitive/convex `supported-by`, no AABB | 7 |
| 30/60/120 Hz-like replay, dual-instance isolation | 8 |
| Existing Admission/Explain/Snapshot diagnostics, no new Validation/CLI/Browser | 2, 6, 8 |
| §11 diagnostic codes | 2, 5, 6, 7 |
| §10 remove adapter defaults, water medium switch, motion slope/step override | 6 |
| `docs/18` last | 8 |

## Out of scope

- P2.5 water sensor, swim, buoyancy, `movementMedium: "water"`
- P2.6 triangle subshape, Surface ID, bridge fixture
- Route Graph M5, except this slice makes the 0.3 m / 42° Body lock real
- P0.3 Validation report
- Vehicle / flight control profiles
