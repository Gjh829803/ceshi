import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

import { NullEngine } from "@babylonjs/core/Engines/nullEngine.pure.js";
import type { Scene } from "@babylonjs/core/scene.pure.js";
import { describe, expect, it } from "vitest";

// Test-only Registry access via a cross-workspace relative path; production
// runtime-babylon src must not read the Registry.
import { builtInSubjectResourceRegistry } from "../../subject-registry/src/index";

import { createValidAuthoringSpecV4 } from "../../authoring/src/test-fixture";
import { BabylonWorldRuntime } from "./babylon-world-runtime";
import { bindRuntimeTestPossession } from "./runtime-test-possession";
import { compileRuntimeTestPlanV5 } from "./runtime-test-plan";

const havokWasmBytes = await readFile(
  createRequire(import.meta.url).resolve(
    "@babylonjs/havok/lib/esm/HavokPhysics.wasm",
  ),
);
const havokWasmBinary = havokWasmBytes.buffer.slice(
  havokWasmBytes.byteOffset,
  havokWasmBytes.byteOffset + havokWasmBytes.byteLength,
) as ArrayBuffer;
const gBotAssetBytes = new Uint8Array(
  await readFile(
    new URL(
      "../../../apps/playground/public/subject-assets/humanoid/g-bot/v2/g-bot.glb",
      import.meta.url,
    ),
  ),
);

const ORBIT_REF = "worldkit://camera-profile/orbit.medium@1";
const FOLLOW_REF = "worldkit://camera-profile/follow.medium@1";
const CHASE_REF = "worldkit://camera-profile/chase.surface-fast@1";

function setCameraProfile(runtime: BabylonWorldRuntime, cameraRigProfileRef: string) {
  return runtime.setCameraViewPreference({
    mode: "camera-rig-profile",
    cameraRigProfileRef,
  });
}

function createFlatTerrainCapabilitySpec() {
  const spec = createValidAuthoringSpecV4();
  const terrain = spec.nodes.find((node) => node.kind === "terrain");
  if (terrain?.kind !== "terrain") {
    throw new Error("Capability fixture terrain is missing.");
  }
  terrain.components.terrain.source = {
    kind: "procedural",
    relief: "flat",
    baseHeightMeters: 0,
    amplitudeMeters: 0,
  };
  return spec;
}

async function createCameraPreviewChannelRuntime(options?: {
  readonly blockCameraArm?: boolean;
  readonly cameraBlockerZMeters?: number;
  readonly invalidCombinedCameraModifiers?: boolean;
  readonly omitFirstPersonSocket?: boolean;
  readonly previewCompositionModifier?: "reachable" | "unreferenced";
  readonly waterOnlyCameraRule?: boolean;
}) {
  const subjectDefinitionRef = "worldkit://subject-definition/humanoid.g-bot@2";
  const spec = createFlatTerrainCapabilitySpec();
  const subject = spec.nodes.find((node) => node.kind === "subject");
  if (subject?.kind !== "subject") {
    throw new Error("Camera preview fixture Subject is missing.");
  }
  subject.subjectDefinitionRef = subjectDefinitionRef;
  if (options?.blockCameraArm === true) {
    const wall = spec.nodes.find((node) => node.id === "wall-east");
    const wallPrototype = spec.resources.prototypes.find(
      (prototype) => prototype.id === "wall",
    );
    if (
      wall?.kind !== "object" ||
      wallPrototype?.kind !== "primitive" ||
      wallPrototype.primitive !== "box"
    ) {
      throw new Error("Camera preview fixture wall is missing.");
    }
    wall.placement = {
      kind: "fixed",
      transform: { positionMetersXYZ: [0, 2, options.cameraBlockerZMeters ?? 33] },
    };
    wallPrototype.sizeMetersXYZ = [4, 4, 0.5];
  }
  const executionPlan = structuredClone(compileRuntimeTestPlanV5(spec, {
    subjectResourceRegistry: builtInSubjectResourceRegistry,
  }));
  if (options?.omitFirstPersonSocket === true) {
    const firstPersonProfile = executionPlan.subjects
      .find((candidate) => candidate.entityId === executionPlan.initialControlledEntityId)
      ?.capabilityAssembly.cameraContext.cameraRigProfiles
      .find((profile) =>
        profile.resourceRef === "worldkit://camera-profile/first-person.standard@1"
      );
    if (firstPersonProfile === undefined) {
      throw new Error("Camera preview fixture first-person profile is missing.");
    }
    firstPersonProfile.preferredSocketIds = ["missing-first-person-socket"];
  }
  if (options?.waterOnlyCameraRule === true) {
    const cameraContext = executionPlan.subjects
      .find((candidate) => candidate.entityId === executionPlan.initialControlledEntityId)
      ?.capabilityAssembly.cameraContext;
    if (cameraContext === undefined) {
      throw new Error("Camera preview fixture Camera Context is missing.");
    }
    cameraContext.rules = [
      ...cameraContext.rules,
      {
        id: "water-only-p1-5",
        priority: 1000,
        when: { movementMediums: ["water"] },
        cameraModifierRefs: ["worldkit://camera-modifier/mounted-framing@1"],
      },
    ];
  }
  if (options?.invalidCombinedCameraModifiers === true) {
    const cameraContext = executionPlan.subjects
      .find((candidate) => candidate.entityId === executionPlan.initialControlledEntityId)
      ?.capabilityAssembly.cameraContext;
    const modifierTemplate = cameraContext?.cameraModifierProfiles[0];
    if (cameraContext === undefined || modifierTemplate === undefined) {
      throw new Error("Camera preview fixture Camera Modifier is missing.");
    }
    const distanceModifierRef =
      "worldkit://camera-modifier/test-invalid-distance@1";
    const maximumModifierRef =
      "worldkit://camera-modifier/test-invalid-maximum@1";
    cameraContext.cameraModifierProfiles = [
      ...cameraContext.cameraModifierProfiles,
      {
        ...modifierTemplate,
        resourceRef: distanceModifierRef,
        parameterOverrides: { distanceMeters: 12 },
      },
      {
        ...modifierTemplate,
        resourceRef: maximumModifierRef,
        parameterOverrides: { maximumDistanceMeters: 10 },
      },
    ];
    cameraContext.rules = [
      ...cameraContext.rules,
      {
        id: "test-invalid-distance",
        priority: 2_001,
        when: { requiredCameraContextTags: ["aim"] },
        cameraModifierRefs: [distanceModifierRef],
      },
      {
        id: "test-invalid-maximum",
        priority: 2_000,
        when: { requiredCameraContextTags: ["sprint"] },
        cameraModifierRefs: [maximumModifierRef],
      },
    ];
  }
  if (options?.previewCompositionModifier !== undefined) {
    const cameraContext = executionPlan.subjects
      .find((candidate) => candidate.entityId === executionPlan.initialControlledEntityId)
      ?.capabilityAssembly.cameraContext;
    const modifierTemplate = cameraContext?.cameraModifierProfiles[0];
    if (cameraContext === undefined || modifierTemplate === undefined) {
      throw new Error("Camera preview fixture Camera Modifier is missing.");
    }
    const modifierRef = "worldkit://camera-modifier/test-preview-maximum@1";
    cameraContext.cameraModifierProfiles = [
      ...cameraContext.cameraModifierProfiles,
      {
        ...modifierTemplate,
        resourceRef: modifierRef,
        parameterOverrides: { maximumDistanceMeters: 10 },
      },
    ];
    if (options.previewCompositionModifier === "reachable") {
      cameraContext.rules = [
        ...cameraContext.rules,
        {
          id: "test-preview-maximum",
          priority: 2_000,
          when: {},
          cameraModifierRefs: [modifierRef],
        },
      ];
    }
  }
  const runtime = await BabylonWorldRuntime.create({
    executionPlan,
    havokWasmBinary,
    subjectAssetResolver: {
      async resolveSubjectAsset() {
        return { bytes: gBotAssetBytes, sourceLabel: "camera-preview-channel-test" };
      },
    },
    engineFactory: () =>
      new NullEngine({
        renderWidth: 640,
        renderHeight: 360,
        textureSize: 512,
        deterministicLockstep: true,
        lockstepMaxSteps: 4,
      }),
  });
  await bindRuntimeTestPossession(runtime, executionPlan.initialControlledEntityId);
  return runtime;
}

function countScenePickQueries(runtime: BabylonWorldRuntime) {
  const scene = (runtime as unknown as { scene: Scene }).scene;
  const originalPickWithRay = scene.pickWithRay.bind(scene);
  let queryCount = 0;
  scene.pickWithRay = ((...args: Parameters<Scene["pickWithRay"]>) => {
    queryCount += 1;
    return originalPickWithRay(...args);
  }) as Scene["pickWithRay"];
  return {
    count: () => queryCount,
    restore: () => {
      scene.pickWithRay = originalPickWithRay;
    },
  };
}

function smoothedCameraTarget(runtime: BabylonWorldRuntime): readonly [number, number, number] {
  const target = (runtime as unknown as {
    readonly cameraComponent: {
      readonly director: {
        readonly smoothedTarget: { readonly x: number; readonly y: number; readonly z: number };
      };
    };
  }).cameraComponent.director.smoothedTarget;
  return [target.x, target.y, target.z];
}

function distanceMeters(
  left: readonly [number, number, number],
  right: readonly [number, number, number],
): number {
  return Math.hypot(
    left[0] - right[0],
    left[1] - right[1],
    left[2] - right[2],
  );
}

function smoothstep01(value: number): number {
  const clamped = Math.max(0, Math.min(1, value));
  return clamped * clamped * (3 - 2 * clamped);
}

function renderedTransitionProgressRatio(
  runtime: BabylonWorldRuntime,
  fixedStepDeltaSeconds: number,
): number {
  const director = (runtime as unknown as {
    readonly cameraComponent: {
      readonly director: {
        readonly transitionElapsedSeconds: number;
        readonly transitionDurationSeconds: number;
      };
    };
  }).cameraComponent.director;
  return smoothstep01(
    (director.transitionElapsedSeconds - fixedStepDeltaSeconds) /
      director.transitionDurationSeconds,
  );
}

function expectSafeActualArm(camera: ReturnType<BabylonWorldRuntime["snapshot"]>["camera"]) {
  const safeArmLengthMeters = camera.safeArmLengthMeters;
  const actualPositionMetersXYZ = camera.actualPositionMetersXYZ;
  const desiredTargetPositionMetersXYZ = camera.desiredTargetPositionMetersXYZ;
  if (
    safeArmLengthMeters === undefined ||
    actualPositionMetersXYZ === undefined ||
    desiredTargetPositionMetersXYZ === undefined
  ) {
    throw new Error("Expected collision-retracted Follow Arm telemetry.");
  }
  expect(camera.isCollisionRetracted).toBe(true);
  expect(distanceMeters(
    actualPositionMetersXYZ,
    desiredTargetPositionMetersXYZ,
  )).toBeLessThanOrEqual(safeArmLengthMeters + 0.000001);
}

function expectTargetAndFovRemainTransitioning(
  beforeTarget: readonly [number, number, number],
  beforeFovDegrees: number,
  firstTarget: readonly [number, number, number],
  firstFovDegrees: number,
  settledTarget: readonly [number, number, number],
  settledFovDegrees: number,
) {
  const targetTransitionDistanceMeters = distanceMeters(settledTarget, beforeTarget);
  const fovTransitionDegrees = Math.abs(settledFovDegrees - beforeFovDegrees);
  expect(targetTransitionDistanceMeters).toBeGreaterThan(0.001);
  expect(fovTransitionDegrees).toBeGreaterThan(0.01);
  expect(distanceMeters(firstTarget, beforeTarget)).toBeLessThanOrEqual(0.0001);
  expect(distanceMeters(firstTarget, settledTarget)).toBeGreaterThan(0.001);
  expect(Math.abs(firstFovDegrees - settledFovDegrees)).toBeGreaterThan(0.01);
}

describe("camera preview channel stays out of Gameplay truth", () => {
  it("rejects an invalid final Rig and Modifier composition before mutating Camera state", async () => {
    const runtime = await createCameraPreviewChannelRuntime({
      invalidCombinedCameraModifiers: true,
    });
    try {
      await runtime.runFixedInput({ actions: [], ticks: 4 });
      setCameraProfile(runtime, ORBIT_REF);
      const before = runtime.snapshot().camera;

      await expect(runtime.runFixedInput({
        actions: ["aim", "run"],
        ticks: 1,
      })).rejects.toThrow(/WORLDKIT_RUNTIME_CAMERA_RESOLVED_PARAMETERS_INVALID/);

      expect(runtime.snapshot().camera).toEqual(before);
    } finally {
      await runtime.dispose();
    }
  }, 15_000);

  it("rejects Preview tuning that is valid on the base Rig but invalid with a reachable Modifier", async () => {
    const runtime = await createCameraPreviewChannelRuntime({
      previewCompositionModifier: "reachable",
    });
    try {
      await runtime.runFixedInput({ actions: [], ticks: 4 });
      setCameraProfile(runtime, ORBIT_REF);
      const beforeCamera = runtime.snapshot().camera;
      const beforePreview = runtime.getCameraPreviewState();

      expect(() => runtime.applyCameraPreview({
        tuningByProfileRef: {
          [ORBIT_REF]: { distanceMeters: 12 },
        },
      })).toThrow(/SUBJECT_PRESET_INVALID_CAMERA_TUNING/);

      expect(runtime.snapshot().camera).toEqual(beforeCamera);
      expect(runtime.getCameraPreviewState()).toEqual(beforePreview);
    } finally {
      await runtime.dispose();
    }
  }, 15_000);

  it("does not reject Preview tuning because of an unreferenced Modifier resource", async () => {
    const runtime = await createCameraPreviewChannelRuntime({
      previewCompositionModifier: "unreferenced",
    });
    try {
      await runtime.runFixedInput({ actions: [], ticks: 4 });
      setCameraProfile(runtime, ORBIT_REF);

      expect(() => runtime.applyCameraPreview({
        tuningByProfileRef: {
          [ORBIT_REF]: { distanceMeters: 12 },
        },
      })).not.toThrow();
      expect(runtime.getCameraPreviewState().tuningByProfileRef[ORBIT_REF])
        .toEqual({ distanceMeters: 12 });
    } finally {
      await runtime.dispose();
    }
  }, 15_000);

  it("publishes first-person socket, FOV, and resolved telemetry without arm state", async () => {
    const runtime = await createCameraPreviewChannelRuntime();
    try {
      await runtime.runFixedInput({ actions: [], ticks: 4 });
      runtime.setCameraViewPreference({ mode: "first-person" });
      const beforePreview = runtime.snapshot();

      expect(beforePreview.camera.selectionDecision?.cameraViewPreference).toEqual({
        mode: "first-person",
      });

      expect(() => runtime.applyCameraPreview({
        tuningByProfileRef: {
          "worldkit://camera-profile/first-person.standard@1": {
            distanceMeters: 6,
            collisionRadiusMeters: 0.3,
            collisionRecoveryMetersPerSecond: 1,
          },
        },
      })).toThrow(/SUBJECT_PRESET_INVALID_CAMERA_TUNING/);
      const afterPreview = runtime.snapshot();

      expect(afterPreview.subjectStatesByEntityId).toEqual(
        beforePreview.subjectStatesByEntityId,
      );
      expect(afterPreview.camera).toHaveProperty("selectedTargetSocketId");
      expect(afterPreview.camera).toHaveProperty("targetSocketPositionMetersXYZ");
      expect(afterPreview.camera).toHaveProperty("finalFovDegrees");
      expect(afterPreview.camera).toHaveProperty("rotationLagRadiansXYZ");
      expect(afterPreview.camera).toHaveProperty("fixedStepDeltaSeconds");
      expect(afterPreview.camera).toHaveProperty("resolvedParameters");
      expect(afterPreview.camera.requestedArmLengthMeters).toBeUndefined();
      expect(afterPreview.camera.safeArmLengthMeters).toBeUndefined();
      expect(afterPreview.camera.effectiveArmLengthMeters).toBeUndefined();
      expect(afterPreview.camera.isCollisionRetracted).toBeUndefined();
    } finally {
      await runtime.dispose();
    }
  }, 15_000);

  it("publishes a frozen diagnostic when the first-person socket falls back", async () => {
    const runtime = await createCameraPreviewChannelRuntime({
      omitFirstPersonSocket: true,
    });
    try {
      await runtime.runFixedInput({ actions: [], ticks: 4 });
      setCameraProfile(runtime,
        "worldkit://camera-profile/first-person.standard@1",
      );
      const beforePreview = runtime.snapshot();

      runtime.applyCameraPreview({
        tuningByProfileRef: {
          "worldkit://camera-profile/first-person.standard@1": {
            baseFovDegrees: 70,
          },
        },
      });
      const afterPreview = runtime.snapshot();

      expect(afterPreview.subjectStatesByEntityId).toEqual(
        beforePreview.subjectStatesByEntityId,
      );
      expect(afterPreview.camera.isTargetSocketFallback).toBe(true);
      expect(afterPreview.camera.targetSocketPositionMetersXYZ).toBeUndefined();
      expect(afterPreview.camera.selectionDecision?.diagnostics).toContainEqual(
        expect.objectContaining({ code: "CAMERA_REQUIRED_SOCKET_MISSING" }),
      );
      expect(afterPreview.camera.requestedArmLengthMeters).toBeUndefined();
      expect(afterPreview.camera.safeArmLengthMeters).toBeUndefined();
      expect(afterPreview.camera.effectiveArmLengthMeters).toBeUndefined();
      expect(afterPreview.camera.isCollisionRetracted).toBeUndefined();
    } finally {
      await runtime.dispose();
    }
  }, 15_000);

  it("publishes collision-retracted orbit arm telemetry without changing Subject truth", async () => {
    const runtime = await createCameraPreviewChannelRuntime({
      blockCameraArm: true,
    });
    try {
      await runtime.runFixedInput({ actions: [], ticks: 4 });
      setCameraProfile(runtime, ORBIT_REF);
      const beforePreview = runtime.snapshot();

      runtime.applyCameraPreview({
        tuningByProfileRef: {
          [ORBIT_REF]: { distanceMeters: 6 },
        },
      });
      const afterPreview = runtime.snapshot();

      expect(afterPreview.subjectStatesByEntityId).toEqual(
        beforePreview.subjectStatesByEntityId,
      );
      const requestedArmLengthMeters = afterPreview.camera.requestedArmLengthMeters;
      const safeArmLengthMeters = afterPreview.camera.safeArmLengthMeters;
      const effectiveArmLengthMeters = afterPreview.camera.effectiveArmLengthMeters;
      if (
        requestedArmLengthMeters === undefined ||
        safeArmLengthMeters === undefined ||
        effectiveArmLengthMeters === undefined
      ) throw new Error("Expected orbit arm telemetry.");
      expect(requestedArmLengthMeters).toBeGreaterThan(0);
      expect(safeArmLengthMeters).toBeGreaterThan(0);
      expect(effectiveArmLengthMeters).toBeLessThan(requestedArmLengthMeters);
      expect(afterPreview.camera.isCollisionRetracted).toBe(true);
      const desiredTarget = afterPreview.camera.desiredTargetPositionMetersXYZ;
      const actualPosition = afterPreview.camera.actualPositionMetersXYZ;
      if (actualPosition === undefined || desiredTarget === undefined) {
        throw new Error("Expected actual and desired Camera positions.");
      }
      expect(distanceMeters(actualPosition, desiredTarget)).toBeLessThanOrEqual(
        safeArmLengthMeters + 0.000001,
      );
      expect(afterPreview.camera.recenterRemainingSeconds).toBeUndefined();
    } finally {
      await runtime.dispose();
    }
  }, 15_000);

  it("uses physics collision and arm telemetry only for third-person camera poses", async () => {
    const runtime = await createCameraPreviewChannelRuntime({
      blockCameraArm: true,
    });
    const sceneQueries = countScenePickQueries(runtime);
    try {
      setCameraProfile(runtime,
        "worldkit://camera-profile/first-person.standard@1",
      );
      const firstPerson = await runtime.runFixedInput({ actions: [], ticks: 4 });

      expect(sceneQueries.count()).toBe(0);
      expect(firstPerson.camera.requestedArmLengthMeters).toBeUndefined();
      expect(firstPerson.camera.safeArmLengthMeters).toBeUndefined();
      expect(firstPerson.camera.effectiveArmLengthMeters).toBeUndefined();
      expect(firstPerson.camera.isCollisionRetracted).toBeUndefined();

      setCameraProfile(runtime, ORBIT_REF);
      const thirdPerson = await runtime.runFixedInput({ actions: [], ticks: 1 });

      expect(sceneQueries.count()).toBe(0);
      expect(thirdPerson.camera.requestedArmLengthMeters).toBeDefined();
      expect(thirdPerson.camera.safeArmLengthMeters).toBeDefined();
      expect(thirdPerson.camera.effectiveArmLengthMeters).toBeDefined();
      expect(thirdPerson.camera.isCollisionRetracted).toBeDefined();
    } finally {
      sceneQueries.restore();
      await runtime.dispose();
    }
  }, 15_000);

  it("publishes a recenter delay countdown only for an enabled recenter profile", async () => {
    const runtime = await createCameraPreviewChannelRuntime();
    try {
      setCameraProfile(runtime, "worldkit://camera-profile/follow.medium@1");
      const enabled = await runtime.runFixedInput({ actions: [], ticks: 1 });
      expect(enabled.camera.recenterRemainingSeconds).toEqual(expect.any(Number));
      expect(enabled.camera.recenterRemainingSeconds).toBeGreaterThanOrEqual(0);
      expect(enabled.camera.fixedStepDeltaSeconds).toBe(1 / 60);

      setCameraProfile(runtime, ORBIT_REF);
      const off = await runtime.runFixedInput({ actions: [], ticks: 1 });
      expect(off.camera.recenterRemainingSeconds).toBeUndefined();
    } finally {
      await runtime.dispose();
    }
  }, 15_000);

  it("uses the Follow Arm safe position on the first orbit tick into an extremely close blocker", async () => {
    const runtime = await createCameraPreviewChannelRuntime({
      blockCameraArm: true,
      cameraBlockerZMeters: 31,
    });
    try {
      await runtime.runFixedInput({ actions: [], ticks: 4 });
      setCameraProfile(runtime, ORBIT_REF);
      runtime.applyCameraPreview({
        tuningByProfileRef: { [ORBIT_REF]: { distanceMeters: 6 } },
      });
      runtime.adjustCameraView({ yawDeltaRadians: Math.PI });
      await runtime.runFixedInput({ actions: [], ticks: 120 });

      runtime.adjustCameraView({ yawDeltaRadians: Math.PI });
      let collided: ReturnType<typeof runtime.snapshot> | undefined;
      for (let tick = 0; tick < 120; tick += 1) {
        const snapshot = await runtime.runFixedInput({ actions: [], ticks: 1 });
        if (snapshot.camera.isCollisionRetracted === true) {
          collided = snapshot;
          break;
        }
      }
      if (collided === undefined) {
        throw new Error("Expected the orbit arm to encounter the blocker.");
      }
      const safeArmLengthMeters = collided.camera.safeArmLengthMeters;
      if (safeArmLengthMeters === undefined) {
        throw new Error("Expected collision-retracted Follow Arm telemetry.");
      }
      const desiredTarget = collided.camera.desiredTargetPositionMetersXYZ;
      const actualPosition = collided.camera.actualPositionMetersXYZ;
      if (actualPosition === undefined || desiredTarget === undefined) {
        throw new Error("Expected actual and desired Camera positions.");
      }

      expect(collided.camera.isCollisionRetracted).toBe(true);
      expect(distanceMeters(actualPosition, desiredTarget)).toBeLessThanOrEqual(
        safeArmLengthMeters + 0.000001,
      );
    } finally {
      await runtime.dispose();
    }
  }, 15_000);

  it("keeps an obstructed existing chase pose to orbit transition safe without snapping its target or FOV", async () => {
    const runtime = await createCameraPreviewChannelRuntime({
      blockCameraArm: true,
      cameraBlockerZMeters: 31,
    });
    try {
      await runtime.runFixedInput({ actions: [], ticks: 4 });
      setCameraProfile(runtime, CHASE_REF);
      await runtime.runFixedInput({ actions: [], ticks: 120 });
      runtime.applyCameraPreview({
        tuningByProfileRef: {
          [CHASE_REF]: { targetHeightMeters: 1, baseFovDegrees: 70 },
          [ORBIT_REF]: {
            distanceMeters: 6,
            targetHeightMeters: 3,
            baseFovDegrees: 90,
          },
        },
      });
      await runtime.runFixedInput({ actions: [], ticks: 120 });
      const before = runtime.snapshot();
      const beforeTarget = smoothedCameraTarget(runtime);
      const beforeFovDegrees = before.camera.finalFovDegrees;
      if (beforeFovDegrees === undefined) throw new Error("Expected camera FOV telemetry.");

      setCameraProfile(runtime, ORBIT_REF);
      const firstTick = await runtime.runFixedInput({ actions: [], ticks: 1 });
      const firstTarget = smoothedCameraTarget(runtime);
      expect(firstTick.camera.profileTransitionProgressRatio).toBeLessThan(1);
      expect(firstTick.camera.profileTransitionProgressRatio).toBeCloseTo(
        renderedTransitionProgressRatio(
          runtime,
          firstTick.camera.fixedStepDeltaSeconds!,
        ),
        12,
      );
      expectSafeActualArm(firstTick.camera);

      await runtime.runFixedInput({ actions: [], ticks: 120 });
      const settled = runtime.snapshot();
      const settledFovDegrees = settled.camera.finalFovDegrees;
      if (settledFovDegrees === undefined) throw new Error("Expected camera FOV telemetry.");
      expectTargetAndFovRemainTransitioning(
        beforeTarget,
        beforeFovDegrees,
        firstTarget,
        firstTick.camera.finalFovDegrees!,
        smoothedCameraTarget(runtime),
        settledFovDegrees,
      );
    } finally {
      await runtime.dispose();
    }
  }, 15_000);

  it("keeps an obstructed active third-person profile transition safe without snapping its target or FOV", async () => {
    const runtime = await createCameraPreviewChannelRuntime({
      blockCameraArm: true,
      cameraBlockerZMeters: 31,
    });
    try {
      await runtime.runFixedInput({ actions: [], ticks: 4 });
      runtime.applyCameraPreview({
        tuningByProfileRef: {
          [FOLLOW_REF]: { baseFovDegrees: 70, targetHeightMeters: 1 },
          [ORBIT_REF]: {
            distanceMeters: 6,
            targetHeightMeters: 3,
            baseFovDegrees: 90,
          },
        },
      });
      setCameraProfile(runtime, FOLLOW_REF);
      await runtime.runFixedInput({ actions: [], ticks: 120 });
      const before = runtime.snapshot();
      const beforeTarget = smoothedCameraTarget(runtime);
      const beforeFovDegrees = before.camera.finalFovDegrees;
      if (beforeFovDegrees === undefined) throw new Error("Expected camera FOV telemetry.");

      setCameraProfile(runtime, ORBIT_REF);
      const firstTick = await runtime.runFixedInput({ actions: [], ticks: 1 });
      const firstTarget = smoothedCameraTarget(runtime);
      expect(firstTick.camera.profileTransitionProgressRatio).toBeLessThan(1);
      expectSafeActualArm(firstTick.camera);

      await runtime.runFixedInput({ actions: [], ticks: 120 });
      const settled = runtime.snapshot();
      const settledFovDegrees = settled.camera.finalFovDegrees;
      if (settledFovDegrees === undefined) throw new Error("Expected camera FOV telemetry.");
      expectTargetAndFovRemainTransitioning(
        beforeTarget,
        beforeFovDegrees,
        firstTarget,
        firstTick.camera.finalFovDegrees!,
        smoothedCameraTarget(runtime),
        settledFovDegrees,
      );
    } finally {
      await runtime.dispose();
    }
  }, 15_000);

  it("keeps a collision-retracted Follow Arm continuous across sprint modifier activation and release", async () => {
    const runtime = await createCameraPreviewChannelRuntime({
      blockCameraArm: true,
    });
    const assertSafeRetractedArm = (camera: ReturnType<typeof runtime.snapshot>["camera"]) => {
      const requestedArmLengthMeters = camera.requestedArmLengthMeters;
      const safeArmLengthMeters = camera.safeArmLengthMeters;
      const effectiveArmLengthMeters = camera.effectiveArmLengthMeters;
      if (
        requestedArmLengthMeters === undefined ||
        safeArmLengthMeters === undefined ||
        effectiveArmLengthMeters === undefined
      ) throw new Error("Expected collision-retracted Follow Arm telemetry.");
      expect(effectiveArmLengthMeters).toBeLessThanOrEqual(safeArmLengthMeters + 0.000001);
      expect(effectiveArmLengthMeters).toBeLessThan(requestedArmLengthMeters);
    };
    try {
      await runtime.runFixedInput({ actions: [], ticks: 4 });
      setCameraProfile(runtime, ORBIT_REF);
      runtime.applyCameraPreview({
        tuningByProfileRef: { [ORBIT_REF]: { distanceMeters: 6 } },
      });
      const settled = await runtime.runFixedInput({ actions: [], ticks: 120 });
      assertSafeRetractedArm(settled.camera);

      const sprinting = await runtime.runFixedInput({
        actions: ["move-forward", "run"],
        ticks: 1,
      });
      expect(sprinting.camera.activeCameraProfileRef).toBe(ORBIT_REF);
      expect(sprinting.camera.activeCameraModifierRefs).toContain(
        "worldkit://camera-modifier/sprint-emphasis@1",
      );
      assertSafeRetractedArm(sprinting.camera);

      const released = await runtime.runFixedInput({ actions: [], ticks: 1 });
      expect(released.camera.activeCameraProfileRef).toBe(ORBIT_REF);
      expect(released.camera.activeCameraModifierRefs).not.toContain(
        "worldkit://camera-modifier/sprint-emphasis@1",
      );
      assertSafeRetractedArm(released.camera);
    } finally {
      await runtime.dispose();
    }
  }, 15_000);

  it("recovers a third-person arm monotonically after it exits a collision", async () => {
    const collisionRecoveryMetersPerSecond = 2;
    const runtime = await createCameraPreviewChannelRuntime({
      blockCameraArm: true,
    });
    try {
      await runtime.runFixedInput({ actions: [], ticks: 4 });
      setCameraProfile(runtime, ORBIT_REF);
      runtime.applyCameraPreview({
        tuningByProfileRef: {
          [ORBIT_REF]: {
            distanceMeters: 6,
            collisionRecoveryMetersPerSecond,
          },
        },
      });
      const collided = runtime.snapshot().camera;
      expect(collided.isCollisionRetracted).toBe(true);

      runtime.adjustCameraView({ yawDeltaRadians: Math.PI });
      const recoverySamples: number[] = [];
      let requestedArmLengthMeters: number | undefined;
      for (let tick = 0; tick < 12; tick += 1) {
        const snapshot = await runtime.runFixedInput({ actions: [], ticks: 1 });
        const effectiveArmLengthMeters = snapshot.camera.effectiveArmLengthMeters;
        if (effectiveArmLengthMeters === undefined) {
          throw new Error("Expected third-person Follow Arm telemetry.");
        }
        recoverySamples.push(effectiveArmLengthMeters);
        requestedArmLengthMeters = snapshot.camera.requestedArmLengthMeters;
      }
      expect(recoverySamples).toEqual([...recoverySamples].sort((left, right) => left - right));
      expect(recoverySamples.at(-1)).toBeGreaterThan(recoverySamples[0]!);
      for (let index = 1; index < recoverySamples.length; index += 1) {
        expect(recoverySamples[index]! - recoverySamples[index - 1]!).toBeLessThanOrEqual(
          collisionRecoveryMetersPerSecond / 60 + 0.000001,
        );
      }
      expect(requestedArmLengthMeters).toBeDefined();
      expect(recoverySamples.at(-1)).toBeLessThanOrEqual(requestedArmLengthMeters!);
    } finally {
      await runtime.dispose();
    }
  }, 15_000);

  it("does not apply mounted framing when the Runtime publishes relationshipRole none", async () => {
    const runtime = await createCameraPreviewChannelRuntime();
    try {
      await runtime.runFixedInput({ actions: [], ticks: 4 });
      const snapshot = setCameraProfile(runtime, ORBIT_REF);

      expect(snapshot.camera.activeCameraProfileRef).toBe(ORBIT_REF);
      expect(snapshot.camera.activeCameraModifierRefs).not.toContain(
        "worldkit://camera-modifier/mounted-framing@1",
      );
    } finally {
      await runtime.dispose();
    }
  }, 15_000);

  it("keeps water-only execution Camera rules unavailable at the frozen P1.5 boundary", async () => {
    const runtime = await createCameraPreviewChannelRuntime({
      waterOnlyCameraRule: true,
    });
    try {
      const snapshot = await runtime.runFixedInput({ actions: [], ticks: 4 });
      const decision = snapshot.camera.selectionDecision;
      if (decision === undefined) {
        throw new Error("Expected Camera selection telemetry.");
      }

      expect(decision.explain.cameraContextRules.map(
        (rule) => rule.cameraContextRuleId,
      )).not.toContain("water-only-p1-5");
    } finally {
      await runtime.dispose();
    }
  }, 15_000);

  it("isolates preview state between Runtime instances through reset and dispose", async () => {
    const [firstRuntime, secondRuntime] = await Promise.all([
      createCameraPreviewChannelRuntime(),
      createCameraPreviewChannelRuntime(),
    ]);
    try {
      await Promise.all([
        firstRuntime.runFixedInput({ actions: [], ticks: 4 }),
        secondRuntime.runFixedInput({ actions: [], ticks: 4 }),
      ]);
      setCameraProfile(firstRuntime, ORBIT_REF);
      setCameraProfile(secondRuntime, ORBIT_REF);
      firstRuntime.applyCameraPreview({
        tuningByProfileRef: {
          [ORBIT_REF]: { distanceMeters: 4, targetHeightMeters: 1.5 },
        },
      });
      secondRuntime.applyCameraPreview({
        tuningByProfileRef: {
          [ORBIT_REF]: { distanceMeters: 7, targetHeightMeters: 2.75 },
        },
      });

      expect(firstRuntime.getCameraPreviewState().tuningByProfileRef).toEqual({
        [ORBIT_REF]: { distanceMeters: 4, targetHeightMeters: 1.5 },
      });
      const secondPreview = secondRuntime.getCameraPreviewState();
      expect(secondPreview.tuningByProfileRef).toEqual({
        [ORBIT_REF]: { distanceMeters: 7, targetHeightMeters: 2.75 },
      });

      firstRuntime.reset();
      expect(firstRuntime.getCameraPreviewState().tuningByProfileRef).toEqual({});
      expect(secondRuntime.getCameraPreviewState()).toEqual(secondPreview);

      await firstRuntime.dispose();
      expect(secondRuntime.getCameraPreviewState()).toEqual(secondPreview);
      expect(secondRuntime.snapshot().camera.activeCameraProfileRef).toBe(ORBIT_REF);
    } finally {
      await Promise.all([firstRuntime.dispose(), secondRuntime.dispose()]);
    }
  }, 15_000);

  it("keeps previewed rendered Camera state deterministic across 30/60/120 Hz cadence", async () => {
    const runtime = await createCameraPreviewChannelRuntime();
    try {
      const runScenario = async (
        previewEnabled: boolean,
        renderCadenceHz: 30 | 60 | 120,
      ) => {
        runtime.reset();
        await bindRuntimeTestPossession(runtime, "player");
        setCameraProfile(runtime, ORBIT_REF);
        if (previewEnabled) {
          runtime.applyCameraPreview({
            tuningByProfileRef: {
              [ORBIT_REF]: {
                distanceMeters: 6,
                targetHeightMeters: 3,
                lookAheadSeconds: 0.75,
              },
            },
          });
        }
        for (let tick = 0; tick < 60; tick += 1) {
          await runtime.runFixedInput({ actions: ["move-forward"], ticks: 1 });
          const renderCount = renderCadenceHz === 30
            ? (tick % 2 === 1 ? 1 : 0)
            : renderCadenceHz === 60
              ? 1
              : 2;
          for (let render = 0; render < renderCount; render += 1) {
            runtime.renderFrame();
          }
        }
        return runtime.snapshot();
      };

      const baseline = await runScenario(false, 60);
      const previewAt30Hz = await runScenario(true, 30);
      const previewAt60Hz = await runScenario(true, 60);
      const previewAt120Hz = await runScenario(true, 120);

      expect(previewAt60Hz.camera.positionMetersXYZ).not.toEqual(
        baseline.camera.positionMetersXYZ,
      );
      for (const previewSnapshot of [
        previewAt30Hz,
        previewAt60Hz,
        previewAt120Hz,
      ]) {
        expect(previewSnapshot.tick).toBe(baseline.tick);
        expect(previewSnapshot.subjectStatesByEntityId).toEqual(
          baseline.subjectStatesByEntityId,
        );
        expect(previewSnapshot.camera.positionMetersXYZ).toEqual(
          previewAt60Hz.camera.positionMetersXYZ,
        );
        expect(previewSnapshot.camera.positionLagXYZ).toEqual(
          previewAt60Hz.camera.positionLagXYZ,
        );
        expect(previewSnapshot.camera.rotationLagRadiansXYZ).toEqual(
          previewAt60Hz.camera.rotationLagRadiansXYZ,
        );
        expect(previewSnapshot.camera.fixedStepDeltaSeconds).toBe(1 / 60);
      }
    } finally {
      await runtime.dispose();
    }
  }, 15_000);

  it("never exposes tuning or preference in the canonical snapshot", async () => {
    const runtime = await createCameraPreviewChannelRuntime();
    try {
      await runtime.runFixedInput({ actions: [], ticks: 4 });
      const before = runtime.snapshot();
      const automaticProfileRef = before.camera.activeCameraProfileRef;
      expect(before.camera).not.toHaveProperty("tuning");
      expect(before.camera).not.toHaveProperty("preference");

      runtime.applyCameraPreview({
        tuningByProfileRef: { [ORBIT_REF]: { distanceMeters: 6 } },
      });
      const afterPreview = runtime.snapshot();
      expect(afterPreview.camera).not.toHaveProperty("tuning");
      expect(afterPreview.camera).not.toHaveProperty("preference");
      // Preview is render-layer state: it must not perturb Subject gameplay truth.
      expect(afterPreview.subjectStatesByEntityId).toEqual(before.subjectStatesByEntityId);

      // Same fixed input with and without preview keeps Subject determinism.
      runtime.reset();
      await bindRuntimeTestPossession(runtime, "player");
      setCameraProfile(runtime, ORBIT_REF);
      const withoutPreview = await runtime.runFixedInput({
        actions: ["move-forward"],
        ticks: 30,
      });
      runtime.reset();
      await bindRuntimeTestPossession(runtime, "player");
      setCameraProfile(runtime, ORBIT_REF);
      runtime.applyCameraPreview({
        tuningByProfileRef: {
          [ORBIT_REF]: { lookAheadSeconds: 1.5, targetHeightMeters: 3 },
        },
      });
      const withPreview = await runtime.runFixedInput({
        actions: ["move-forward"],
        ticks: 30,
      });
      expect(withPreview.subjectStatesByEntityId.player).toEqual(
        withoutPreview.subjectStatesByEntityId.player,
      );

      // Runtime reset restores the locked Camera Context baseline. The
      // authoring host may explicitly reapply its current working draft.
      setCameraProfile(runtime, FOLLOW_REF);
      const reset = runtime.reset();
      expect(reset.possessionTarget).toEqual({ mode: "unbound" });
      expect(runtime.getCameraPreviewState().tuningByProfileRef).toEqual({});
      await bindRuntimeTestPossession(runtime, "player");
      const afterRebindTick = await runtime.runFixedInput({ actions: [], ticks: 1 });
      expect(afterRebindTick.camera.activeCameraProfileRef).toBe(
        automaticProfileRef,
      );
      setCameraProfile(runtime, ORBIT_REF);
      expect(runtime.getCameraPreviewState().tuningByProfileRef[ORBIT_REF])
        .toBeUndefined();
      const switched = setCameraProfile(runtime, FOLLOW_REF);
      expect(switched.camera).not.toHaveProperty("tuning");
      expect(runtime.getCameraPreviewState().tuningByProfileRef[FOLLOW_REF])
        .toBeUndefined();
    } finally {
      await runtime.dispose();
    }
  });

  it("keeps authoring preview sensitivity out of fixed-tick Gameplay movement", async () => {
    const runtime = await createCameraPreviewChannelRuntime();
    try {
      await runtime.runFixedInput({ actions: [], ticks: 4 });
      setCameraProfile(runtime, ORBIT_REF);
      runtime.adjustCameraView({ yawDeltaRadians: 1 });
      const withoutPreview = await runtime.runFixedInput({
        actions: ["move-forward"],
        ticks: 30,
      });

      runtime.reset();
      await bindRuntimeTestPossession(runtime, "player");
      setCameraProfile(runtime, ORBIT_REF);
      runtime.applyCameraPreview({
        tuningByProfileRef: {
          [ORBIT_REF]: { lookSensitivityXRatio: 3 },
        },
      });
      runtime.adjustCameraView({ yawDeltaRadians: 1 });
      const withPreview = await runtime.runFixedInput({
        actions: ["move-forward"],
        ticks: 30,
      });

      expect(withPreview.subjectStatesByEntityId.player).toEqual(
        withoutPreview.subjectStatesByEntityId.player,
      );
      expect(withPreview.camera.positionMetersXYZ).not.toEqual(
        withoutPreview.camera.positionMetersXYZ,
      );
    } finally {
      await runtime.dispose();
    }
  });

  it("setCameraViewPreference rejects unreachable refs without mutating the active Profile", async () => {
    const runtime = await createCameraPreviewChannelRuntime();
    try {
      await runtime.runFixedInput({ actions: [], ticks: 4 });
      setCameraProfile(runtime, ORBIT_REF);
      const stableRef = runtime.snapshot().camera.activeCameraProfileRef;

      expect(() => setCameraProfile(runtime, "not-a-ref")).toThrow(RangeError);
      expect(() =>
        setCameraProfile(runtime, "worldkit://camera-profile/does-not-exist@1"),
      ).toThrow(RangeError);
      // Legacy free strings are no longer accepted by the production path.
      expect(() => setCameraProfile(runtime, "auto")).toThrow(RangeError);
      expect(() => setCameraProfile(runtime, "first-person")).toThrow(RangeError);
      expect(() => setCameraProfile(runtime, "")).toThrow(RangeError);
      expect(() => setCameraProfile(runtime, "   ")).toThrow(RangeError);
      expect(runtime.snapshot().camera.activeCameraProfileRef).toBe(stableRef);

      runtime.adjustCameraView({ yawDeltaRadians: 0.4, zoomDeltaMeters: 1 });
      // Reset returns Auto/default deterministically and clears manual view state.
      const firstDefault = runtime.resetCameraViewPreference().camera.activeCameraProfileRef;
      expect(runtime.snapshot().camera.selectionDecision?.cameraViewPreference).toEqual({
        mode: "auto",
      });
      expect(runtime.snapshot().camera).toMatchObject({
        viewYawOffsetRadians: 0,
        viewPitchOffsetRadians: 0,
        viewDistanceOffsetMeters: 0,
      });
      setCameraProfile(runtime, FOLLOW_REF);
      const secondDefault = runtime.resetCameraViewPreference().camera.activeCameraProfileRef;
      expect(secondDefault).toBe(firstDefault);
    } finally {
      await runtime.dispose();
    }
  });

  it("applyCameraPreview rejects malformed requests atomically and stably", async () => {
    const runtime = await createCameraPreviewChannelRuntime();
    try {
      await runtime.runFixedInput({ actions: [], ticks: 4 });
      setCameraProfile(runtime, ORBIT_REF);
      runtime.applyCameraPreview({
        tuningByProfileRef: { [ORBIT_REF]: { distanceMeters: 5 } },
      });

      const invalidRequests = [
        { tuningByProfileRef: { "worldkit://camera-profile/ghost@1": { distanceMeters: 4 } } },
        { tuningByProfileRef: { [ORBIT_REF]: { distanceMeters: Number.NaN } } },
        { tuningByProfileRef: { [ORBIT_REF]: { distanceMeters: Number.POSITIVE_INFINITY } } },
        { tuningByProfileRef: { [ORBIT_REF]: { targetHeightMeters: 999 } } },
        { tuningByProfileRef: { [ORBIT_REF]: { inventedKnob: 1 } as never } },
        { tuningByProfileRef: { [ORBIT_REF]: 5 as never } },
        { tuningByProfileRef: [] as never },
        // An invalid second entry must reject the whole request.
        {
          tuningByProfileRef: {
            [ORBIT_REF]: { distanceMeters: 6 },
            [FOLLOW_REF]: { targetHeightMeters: -5 },
          },
        },
        // Missing tuningByProfileRef must fail with the stable contract error.
        {} as never,
      ];
      for (const request of invalidRequests) {
        expect(() => runtime.applyCameraPreview(request))
          .toThrow(/SUBJECT_PRESET_INVALID_CAMERA_TUNING/);
      }
      // Failed requests leave the previous preview state untouched.
      expect(runtime.getCameraPreviewState().tuningByProfileRef[ORBIT_REF])
        .toEqual({ distanceMeters: 5 });
    } finally {
      await runtime.dispose();
    }
  });

  it("keeps orbit authority separate from Subject facing", async () => {
    const runtime = await createCameraPreviewChannelRuntime();
    try {
      await runtime.runFixedInput({ actions: [], ticks: 4 });
      setCameraProfile(runtime, ORBIT_REF);
      const forwardBefore = runtime.snapshot().subjectStatesByEntityId.player?.forwardXYZ;
      runtime.adjustCameraView({ yawDeltaRadians: 1.2, pitchDeltaRadians: 0.3 });
      // Orbit alone never rotates the Subject.
      expect(runtime.snapshot().subjectStatesByEntityId.player?.forwardXYZ)
        .toEqual(forwardBefore);
      // Moving afterwards turns the Subject toward the committed view direction.
      const moved = await runtime.runFixedInput({ actions: ["move-forward"], ticks: 10 });
      expect(moved.subjectStatesByEntityId.player?.forwardXYZ).not.toEqual(forwardBefore);
      // Reset clears the user view offsets immediately.
      const afterReset = runtime.reset().camera;
      expect(afterReset.viewYawOffsetRadians).toBe(0);
      expect(afterReset.viewPitchOffsetRadians).toBe(0);
    } finally {
      await runtime.dispose();
    }
  });

  it("keeps manual orbit yaw fixed while fixed-tick WASD and Shift move the Subject", async () => {
    const runtime = await createCameraPreviewChannelRuntime();
    try {
      await runtime.runFixedInput({ actions: [], ticks: 4 });
      setCameraProfile(runtime, ORBIT_REF);
      runtime.adjustCameraView({ yawDeltaRadians: 1.2 });
      const settled = await runtime.runFixedInput({ actions: [], ticks: 120 });
      expect(settled.camera.viewYawOffsetRadians).toBeCloseTo(1.2, 6);

      for (const actions of [
        ["move-forward"],
        ["move-left"],
        ["move-backward"],
        ["move-right"],
        ["move-forward", "run"],
      ] as const) {
        const moved = await runtime.runFixedInput({ actions, ticks: 12 });
        expect(moved.camera.viewYawOffsetRadians).toBeCloseTo(1.2, 6);
      }

      const recentered = await runtime.runFixedInput({
        actions: ["camera-recenter"],
        ticks: 120,
      });
      expect(recentered.camera.viewYawOffsetRadians).toBeCloseTo(0, 6);
    } finally {
      await runtime.dispose();
    }
  });
});
