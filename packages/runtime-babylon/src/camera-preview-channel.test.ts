import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.pure.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate.js";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import { Scene } from "@babylonjs/core/scene.js";
import {
  parseCameraContextSampleV2,
  type CameraGeometryQueryPortV2,
  type CameraGeometryQueryRequestV2,
} from "@whitebox-world/camera";
import {
  createWorldRuntimeBootstrapV1,
  type CanonicalSceneExecutionPlanV1,
  type ViewTargetSampleV1,
} from "@whitebox-world/runtime-contracts";
import { describe, expect, it, vi } from "vitest";

// Test-only Registry access via a cross-workspace relative path; production
// runtime-babylon src must not read the Registry.
import { builtInSubjectResourceRegistry } from "@whitebox-world/subject-registry";

import { createValidAuthoringSpecV4 } from "@whitebox-world/authoring/testing";
import { BabylonWorldRuntime } from "./babylon-world-runtime";
import { BABYLON_GAMEPLAY_RUNTIME_INTERNAL } from "./gameplay-runtime-internal";
import {
  CameraDirectorV1,
  committedCameraContextFromViewTargetV2,
} from "./camera-director";
import { SpringArmComponentV1 } from "./spring-arm-component";
import { CameraComponentV1 } from "./camera-component";
import { bindRuntimeTestPossession } from "./runtime-test-possession";
import {
  compileRuntimeTestScenePlanV1,
  registerRuntimeTestWorldArtifactsV1,
  runtimeTestSubjectsForPlanV1,
  runtimeTestWorldArtifactsForPlanV1,
  runtimeTestWorldInputForPlanV1,
} from "./runtime-test-plan";

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

function cameraGeometryQuery(
  query: CameraGeometryQueryPortV2["query"] = () => undefined,
): CameraGeometryQueryPortV2 {
  return {
    capability: {
      shape: "sphere",
      maximumHitCount: 1,
      maximumExcludedEntityCount: 1,
      reportsContactNormal: true,
      reportsStartOverlap: true,
      penetrationDepth: "exact-or-zero",
    },
    query,
  };
}

function createCameraRenderFixture() {
  const executionPlan = compileRuntimeTestScenePlanV1(createFlatTerrainCapabilitySpec(), {
    subjectResourceRegistry: builtInSubjectResourceRegistry,
  });
  const subject = runtimeSubject(executionPlan);
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const camera = new FreeCamera("camera.render-history", Vector3.Zero(), scene);
  const query = vi.fn<CameraGeometryQueryPortV2["query"]>(() => undefined);
  const component = new CameraComponentV1(initialCamera(executionPlan), camera, scene, cameraGeometryQuery(query));
  const arm = new SpringArmComponentV1();
  const sample: ViewTargetSampleV1 = {
    controlledEntityId: subject.entityId, entityId: subject.entityId,
    targetPositionMetersXYZ: [3, 1, -7], forwardXYZ: [0, 0, -1], upXYZ: [0, 1, 0],
    velocityMetersPerSecondXYZ: [0, 0, 0], approximateRadiusMeters: 0.5,
    socketPositionsMetersXYZById: {}, movementMedium: "ground",
    relationshipContexts: [], cameraContextTags: [],
  };
  component.setViewPreference(subject.capabilityAssembly.cameraContext, {
    mode: "camera-rig-profile", cameraRigProfileRef: ORBIT_REF,
  });
  return {
    component, camera, query, sample, subject,
    update(tick: number, overrides: Partial<ViewTargetSampleV1> = {}, deltaSeconds = 1 / 60) {
      const next = { ...sample, ...overrides };
      component.update(subject.capabilityAssembly.cameraContext, next, deltaSeconds,
        committedCameraContextFromViewTargetV2(next, tick, "idle", 0), arm);
    },
    dispose() { component.dispose(); arm.dispose(); engine.dispose(); },
  };
}

function setCameraProfile(runtime: BabylonWorldRuntime, cameraRigProfileRef: string) {
  return runtime.setCameraViewPreference({
    mode: "camera-rig-profile",
    cameraRigProfileRef,
  });
}

async function bindAndPublishInitialCamera(
  runtime: BabylonWorldRuntime,
  controlledEntityId: string,
): Promise<void> {
  await bindRuntimeTestPossession(runtime, controlledEntityId);
  runtime.publishInitialBoundCameraView(
    runtime[BABYLON_GAMEPLAY_RUNTIME_INTERNAL]().readViewProjection()
      .viewStateRevision,
  );
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

function runtimeSubject(executionPlan: CanonicalSceneExecutionPlanV1) {
  const subject = runtimeTestSubjectsForPlanV1(executionPlan)[0];
  if (subject === undefined) {
    throw new Error("CameraDirector fixture Subject missing.");
  }
  return subject;
}

function initialCamera(executionPlan: CanonicalSceneExecutionPlanV1) {
  return runtimeTestWorldArtifactsForPlanV1(executionPlan)
    .worldRuntimeBootstrap.initialCamera;
}

async function createCameraPreviewChannelRuntime(options?: {
  readonly blockCameraArm?: boolean;
  readonly cameraBlockerZMeters?: number;
  readonly invalidCombinedCameraModifiers?: boolean;
  readonly omitFirstPersonSocket?: boolean;
  readonly previewCompositionModifier?: "reachable" | "unreferenced";
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
  const executionPlan = compileRuntimeTestScenePlanV1(spec, {
    subjectResourceRegistry: builtInSubjectResourceRegistry,
  });
  const artifacts = runtimeTestWorldArtifactsForPlanV1(executionPlan);
  const controlledEntityId = artifacts.worldRuntimeBootstrap.initialControlledEntityId;
  const subjectRuntimeDescriptors = structuredClone(
    artifacts.worldRuntimeBootstrap.subjectRuntimeDescriptors,
  );
  const controlledSubject = subjectRuntimeDescriptors.find(
    (candidate) => candidate.entityId === controlledEntityId,
  );
  if (controlledSubject === undefined) {
    throw new Error("Camera preview fixture controlled Subject is missing.");
  }
  if (options?.omitFirstPersonSocket === true) {
    const firstPersonProfile = controlledSubject.capabilityAssembly.cameraContext
      .cameraRigProfiles
      .find((profile) =>
        profile.resourceRef === "worldkit://camera-profile/first-person.standard@1"
      );
    if (firstPersonProfile === undefined) {
      throw new Error("Camera preview fixture first-person profile is missing.");
    }
    firstPersonProfile.preferredSocketIds = ["missing-first-person-socket"];
  }
  if (options?.invalidCombinedCameraModifiers === true) {
    const cameraContext = controlledSubject.capabilityAssembly.cameraContext;
    const modifierTemplate = cameraContext.cameraModifierProfiles[0];
    if (modifierTemplate === undefined) {
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
        when: { gaits: ["run"] },
        cameraModifierRefs: [distanceModifierRef],
      },
      {
        id: "test-invalid-maximum",
        priority: 2_000,
        when: { gaits: ["run"] },
        cameraModifierRefs: [maximumModifierRef],
      },
    ];
  }
  if (options?.previewCompositionModifier !== undefined) {
    const cameraContext = controlledSubject.capabilityAssembly.cameraContext;
    const modifierTemplate = cameraContext.cameraModifierProfiles[0];
    if (modifierTemplate === undefined) {
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
  const { contentHash: _contentHash, ...runtimeBootstrapBody } =
    artifacts.worldRuntimeBootstrap;
  const worldRuntimeBootstrap = createWorldRuntimeBootstrapV1({
    ...runtimeBootstrapBody,
    subjectRuntimeDescriptors,
  });
  const runtimeExecutionPlan: CanonicalSceneExecutionPlanV1 = {
    ...executionPlan,
    worldRuntimeBootstrapHash: worldRuntimeBootstrap.contentHash,
  };
  registerRuntimeTestWorldArtifactsV1({
    ...artifacts,
    executionPlan: runtimeExecutionPlan,
    worldRuntimeBootstrap,
  });
  const runtime = await BabylonWorldRuntime.create({
    ...runtimeTestWorldInputForPlanV1(runtimeExecutionPlan),
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
  await bindAndPublishInitialCamera(runtime, controlledEntityId);
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

function expectActualArmWithinReportedSafety(
  camera: ReturnType<BabylonWorldRuntime["snapshot"]>["camera"],
) {
  const safeArmLengthMeters = camera.safeArmLengthMeters;
  const actualPositionMetersXYZ = camera.actualPositionMetersXYZ;
  const desiredTargetPositionMetersXYZ = camera.desiredTargetPositionMetersXYZ;
  if (
    safeArmLengthMeters === undefined ||
    actualPositionMetersXYZ === undefined ||
    desiredTargetPositionMetersXYZ === undefined
  ) {
    throw new Error("Expected Spring Arm safety telemetry.");
  }
  expect(distanceMeters(
    actualPositionMetersXYZ,
    desiredTargetPositionMetersXYZ,
  )).toBeLessThanOrEqual(safeArmLengthMeters + 0.000001);
}

function expectSafeActualArm(camera: ReturnType<BabylonWorldRuntime["snapshot"]>["camera"]) {
  expect(camera.isCollisionRetracted).toBe(true);
  expectActualArmWithinReportedSafety(camera);
}

function subjectStateWithoutLocomotionCommittedTick(input: unknown): unknown {
  const clone = JSON.parse(JSON.stringify(input)) as {
    locomotion?: Record<string, unknown>;
  };
  if (clone.locomotion !== undefined) delete clone.locomotion.committedTick;
  return clone;
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
  it.each([false, true])("projects all four authored opening values onto the selected Profile before modifiers and Preview (Socket available: %s)", (hasTargetSocket) => {
    const plan = compileRuntimeTestScenePlanV1(createFlatTerrainCapabilitySpec(), {
      subjectResourceRegistry: builtInSubjectResourceRegistry,
    });
    const subject = runtimeSubject(plan);
    const context = structuredClone(subject.capabilityAssembly.cameraContext);
    const authored = {
      ...initialCamera(plan),
      cameraRigProfileRef: FOLLOW_REF,
      distanceMeters: 5.5,
      targetHeightMeters: 1.1,
      pitchRadians: 0.12,
      fovDegrees: 56,
    };
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const camera = new FreeCamera("camera.authored-opening", Vector3.Zero(), scene);
    let failQuery = true;
    const director = new CameraDirectorV1(authored, camera, scene, cameraGeometryQuery(() => {
      if (failQuery) throw new Error("test query unavailable");
      return undefined;
    }));
    const arm = new SpringArmComponentV1();
    const sample: ViewTargetSampleV1 = {
      controlledEntityId: subject.entityId, entityId: subject.entityId,
      targetPositionMetersXYZ: [3, 2, -7], forwardXYZ: [0, 0, -1], upXYZ: [0, 1, 0],
      velocityMetersPerSecondXYZ: [0, 0, 0], approximateRadiusMeters: 0.5,
      socketPositionsMetersXYZById: hasTargetSocket
        ? { ThirdPersonTarget: [3, 3.25, -7] }
        : {}, movementMedium: "ground",
      relationshipContexts: [], cameraContextTags: [],
    };
    let tick = 0;
    const update = () => director.update(context, sample, 1 / 60,
      committedCameraContextFromViewTargetV2(sample, ++tick, "idle", 0), arm);
    try {
      expect(() => update()).toThrow();
      expect(director.snapshot().authoredOpeningProfileRef).toBeUndefined();
      expect(director.captureTransactionState().values.authoredOpeningProfileRef).toBeUndefined();
      expect(camera.position.asArray()).toEqual([0, 0, 0]);
      failQuery = false;
      update();
      const opening = director.snapshot();
      const openingRef = opening.activeCameraProfileRef;
      expect(openingRef).not.toBe(authored.cameraRigProfileRef);
      expect(opening.resolvedParameters).toMatchObject({
        distanceMeters: 5.5, targetHeightMeters: 1.1, pitchRadians: 0.12, baseFovDegrees: 56,
      });
      expect(camera.fov).toBeCloseTo(56 * Math.PI / 180, 8);
      const expectedTargetHeightMeters = hasTargetSocket ? 3.25 : 3.1;
      expect(opening.selectedTargetSocketId).toBe(hasTargetSocket ? "ThirdPersonTarget" : undefined);
      expect(opening.desiredTargetPositionMetersXYZ).toEqual([3, expectedTargetHeightMeters, -7]);
      expect(opening.desiredPositionMetersXYZ![0]).toBeCloseTo(3, 8);
      expect(opening.desiredPositionMetersXYZ![1]).toBeCloseTo(expectedTargetHeightMeters + 5.5 * Math.sin(0.12), 8);
      expect(opening.desiredPositionMetersXYZ![2]).toBeCloseTo(-7 + 5.5 * Math.cos(0.12), 8);
      expect(opening.authoredOpeningProfileRef).toBe(openingRef);
      expect(director.previewState().tuningByProfileRef).toEqual({});
      const beforeSwitch = director.captureTransactionState();
      const beforeSwitchArm = arm.captureTransactionState();
      const otherProfileRef = openingRef === FOLLOW_REF ? ORBIT_REF : FOLLOW_REF;
      const otherProfile = context.cameraRigProfiles.find((profile) => profile.resourceRef === otherProfileRef)!;
      expect(director.setViewPreference(context, {
        mode: "camera-rig-profile", cameraRigProfileRef: otherProfileRef,
      }).ok).toBe(true);
      update();
      expect(director.snapshot().activeCameraProfileRef).toBe(otherProfileRef);
      expect(director.snapshot().resolvedParameters).toEqual(otherProfile.parameters);
      expect(director.snapshot().authoredOpeningProfileRef).toBe(openingRef);
      director.restoreTransactionState(beforeSwitch);
      arm.restoreTransactionState(beforeSwitchArm);
      update();
      expect(director.snapshot().resolvedParameters).toEqual(opening.resolvedParameters);

      const modifier = {
        ...context.cameraModifierProfiles[0]!,
        resourceRef: "worldkit://camera-modifier/authored-opening-test@1",
        parameterOverrides: { distanceMeters: 7 },
      };
      context.cameraModifierProfiles = [...context.cameraModifierProfiles, modifier];
      context.rules = [...context.rules, {
        id: "authored-opening-test", priority: 3000, when: {}, cameraModifierRefs: [modifier.resourceRef],
      }];
      update();
      expect(director.snapshot().resolvedParameters?.distanceMeters).toBe(7);
      expect(director.snapshot().resolvedParameters?.baseFovDegrees).toBe(56);
      expect(director.applyPreview({ [openingRef]: { distanceMeters: 6 } }, context)).toBe(true);
      update();
      expect(director.snapshot().resolvedParameters?.distanceMeters).toBe(6);
      director.resetViewPreference();
      update();
      expect(director.snapshot().resolvedParameters?.distanceMeters).toBe(7);

      context.rules = context.rules.filter((rule) => rule.id !== "authored-opening-test");
      director.reset();
      arm.reset();
      update();
      expect(director.snapshot().resolvedParameters).toEqual(opening.resolvedParameters);
      expect(director.snapshot().desiredPositionMetersXYZ).toEqual(opening.desiredPositionMetersXYZ);
    } finally {
      director.dispose();
      engine.dispose();
    }
  });

  it("rejects an invalid final Rig and Modifier composition before mutating Camera state", async () => {
    const runtime = await createCameraPreviewChannelRuntime({
      invalidCombinedCameraModifiers: true,
    });
    try {
      await runtime.runFixedInput({ actions: [], ticks: 4 });
      setCameraProfile(runtime, ORBIT_REF);
      const before = runtime.snapshot().camera;
      expect(before.authoredOpeningProfileRef).toBe(before.activeCameraProfileRef);

      await expect(runtime.runFixedInput({
        actions: ["move-forward", "run"],
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
      // Preference changes are staged; a new committed Tick owns the next pose.
      await runtime.runFixedInput({ actions: [], ticks: 1 });
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
      expect(afterPreview.camera.selectedTargetSocketId).toBeUndefined();
      expect(afterPreview.camera.targetSocketPositionMetersXYZ).toBeUndefined();
      expect(afterPreview.camera.isTargetSocketFallback).toBe(true);
      expect(afterPreview.camera.selectionDecision?.diagnostics).toContainEqual(
        expect.objectContaining({ code: "CAMERA_REQUIRED_SOCKET_MISSING" }),
      );
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
      await runtime.runFixedInput({ actions: [], ticks: 1 });
      const beforePreview = runtime.snapshot();

      runtime.applyCameraPreview({
        tuningByProfileRef: {
          "worldkit://camera-profile/first-person.standard@1": {
            baseFovDegrees: 70,
          },
        },
      });
      const afterPreview = await runtime.runFixedInput({ actions: [], ticks: 1 });

      const beforeSubject = beforePreview.subjectStatesByEntityId.player;
      const afterSubject = afterPreview.subjectStatesByEntityId.player;
      expect(afterSubject?.locomotion?.committedTick).toBe(
        (beforeSubject?.locomotion?.committedTick ?? -1) + 1,
      );
      expect(subjectStateWithoutLocomotionCommittedTick(afterSubject)).toEqual(
        subjectStateWithoutLocomotionCommittedTick(beforeSubject),
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
      await runtime.runFixedInput({ actions: [], ticks: 1 });
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
      expect(afterPreview.camera.decollisionPhase).toBe("constrained");
      expect(afterPreview.camera.collisionHitNormalXYZ).toEqual([0, 0, -1]);
      expect(afterPreview.camera.startedOverlapping).toBe(false);
      expect(afterPreview.camera.penetrationDepthMeters).toBe(0);
      expect(afterPreview.camera.clearHoldRemainingSeconds).toBe(0);
      const desiredTarget = afterPreview.camera.desiredTargetPositionMetersXYZ;
      const actualPosition = afterPreview.camera.actualPositionMetersXYZ;
      if (actualPosition === undefined || desiredTarget === undefined) {
        throw new Error("Expected actual and desired Camera positions.");
      }
      const runtimeScene = (runtime as unknown as { readonly scene: Scene }).scene;
      const renderedCamera = runtimeScene.activeCamera;
      if (!(renderedCamera instanceof FreeCamera)) {
        throw new Error("Expected the runtime FreeCamera.");
      }
      renderedCamera.getViewMatrix(true);
      const renderedTargetHeightMeters = renderedCamera.getTarget().y;
      expect(renderedTargetHeightMeters).toBeCloseTo(desiredTarget[1], 6);
      expect(distanceMeters(actualPosition, desiredTarget)).toBeLessThanOrEqual(
        safeArmLengthMeters + 0.000001,
      );
      expect(afterPreview.camera.recenterRemainingSeconds).toBeUndefined();
    } finally {
      await runtime.dispose();
    }
  }, 15_000);

  it("uses geometry collision and arm telemetry only for third-person camera poses", async () => {
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

  it("uses the Spring Arm safe position on the first orbit tick into an extremely close blocker", async () => {
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
        throw new Error("Expected collision-retracted Spring Arm telemetry.");
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

  it("keeps an obstructed existing follow pose to orbit transition safe without snapping its target or FOV", async () => {
    const runtime = await createCameraPreviewChannelRuntime({
      blockCameraArm: true,
      cameraBlockerZMeters: 31,
    });
    try {
      await runtime.runFixedInput({ actions: [], ticks: 4 });
      setCameraProfile(runtime, FOLLOW_REF);
      await runtime.runFixedInput({ actions: [], ticks: 120 });
      runtime.applyCameraPreview({
        tuningByProfileRef: {
          [FOLLOW_REF]: { targetHeightMeters: 1, baseFovDegrees: 70 },
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
      expectActualArmWithinReportedSafety(firstTick.camera);

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
      expectActualArmWithinReportedSafety(firstTick.camera);

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

  it("keeps a collision-retracted Spring Arm continuous while raw sprint input remains semantically unavailable", async () => {
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
      ) throw new Error("Expected collision-retracted Spring Arm telemetry.");
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
      expect(sprinting.camera.activeCameraModifierRefs).not.toContain(
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

  it.each([1 / 30, 1 / 60, 1 / 120])("recovers the Director arm at the old profile speed without double damping at dt=%s", (deltaSeconds) => {
    const executionPlan = compileRuntimeTestScenePlanV1(
      createFlatTerrainCapabilitySpec(),
      { subjectResourceRegistry: builtInSubjectResourceRegistry },
    );
    const subject = runtimeSubject(executionPlan);
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const camera = new FreeCamera("camera.recovery-parity", Vector3.Zero(), scene);
    let obstructed = true;
    const queryPort = cameraGeometryQuery((request) => {
      if (!obstructed) return undefined;
      const start = new Vector3(...request.startPositionMetersXYZ);
      const end = new Vector3(...request.endPositionMetersXYZ);
      const length = Vector3.Distance(start, end);
      const travel = Math.min(0.75, length);
      return {
        schemaVersion: 2,
        travelDistanceMeters: travel,
        travelFraction: travel / length,
        hitPointMetersXYZ: start.add(end.subtract(start).normalize().scale(travel)).asArray() as [number, number, number],
        hitNormalXYZ: [0, 0, -1],
        hitEntityId: "wall",
        startedOverlapping: false,
        penetrationDepthMeters: 0,
        obstructionClass: "hard",
      };
    });
    const director = new CameraDirectorV1(initialCamera(executionPlan), camera, scene, queryPort);
    const springArm = new SpringArmComponentV1();
    const sample: ViewTargetSampleV1 = {
      controlledEntityId: subject.entityId, entityId: subject.entityId,
      targetPositionMetersXYZ: [3, 1, -7], forwardXYZ: [0, 0, -1], upXYZ: [0, 1, 0],
      velocityMetersPerSecondXYZ: [0, 0, 0], approximateRadiusMeters: 0.5,
      socketPositionsMetersXYZById: {}, movementMedium: "ground",
      relationshipContexts: [], cameraContextTags: [],
    };
    try {
      director.setViewPreference(subject.capabilityAssembly.cameraContext, {
        mode: "camera-rig-profile", cameraRigProfileRef: ORBIT_REF,
      });
      expect(director.applyPreview({ [ORBIT_REF]: {
        distanceMeters: 6, collisionRecoveryMetersPerSecond: 6,
        horizontalPositionDampingPerSecond: 0.5, verticalPositionDampingPerSecond: 0.5,
        maximumPositionLagMeters: 10,
      } }, subject.capabilityAssembly.cameraContext)).toBe(true);
      const update = (tick: number) => director.update(
        subject.capabilityAssembly.cameraContext, sample, deltaSeconds,
        committedCameraContextFromViewTargetV2(sample, tick, "idle", 0), springArm,
      );
      update(1);
      expect(director.snapshot().effectiveArmLengthMeters).toBeCloseTo(0.75, 8);
      obstructed = false;
      for (let tick = 2; tick <= 12; tick += 1) {
        update(tick);
        const snapshot = director.snapshot();
        const expected = 0.75 + (tick - 1) * 6 * deltaSeconds;
        expect(snapshot.effectiveArmLengthMeters).toBeCloseTo(expected, 8);
        expect(distanceMeters(snapshot.actualPositionMetersXYZ!, snapshot.desiredTargetPositionMetersXYZ!))
          .toBeCloseTo(expected, 8);
      }
    } finally {
      director.dispose();
      engine.dispose();
    }
  });

  it.each([1 / 30, 1 / 60, 1 / 120])("matches old independent position and target damping for a moving Subject at dt=%s", (deltaSeconds) => {
    const executionPlan = compileRuntimeTestScenePlanV1(
      createFlatTerrainCapabilitySpec(),
      { subjectResourceRegistry: builtInSubjectResourceRegistry },
    );
    const subject = runtimeSubject(executionPlan);
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const camera = new FreeCamera("camera.moving-target-parity", Vector3.Zero(), scene);
    const director = new CameraDirectorV1(initialCamera(executionPlan), camera, scene, cameraGeometryQuery());
    const springArm = new SpringArmComponentV1();
    const sample: ViewTargetSampleV1 = {
      controlledEntityId: subject.entityId, entityId: subject.entityId,
      targetPositionMetersXYZ: [3, 1, -7], forwardXYZ: [0, 0, -1], upXYZ: [0, 1, 0],
      velocityMetersPerSecondXYZ: [0, 0, 0], approximateRadiusMeters: 0.5,
      socketPositionsMetersXYZById: {}, movementMedium: "ground",
      relationshipContexts: [], cameraContextTags: [],
    };
    try {
      director.setViewPreference(subject.capabilityAssembly.cameraContext, {
        mode: "camera-rig-profile", cameraRigProfileRef: ORBIT_REF,
      });
      expect(director.applyPreview({ [ORBIT_REF]: {
        distanceMeters: 6, targetHeightMeters: 1.2, pitchRadians: 0.2,
        shoulderOffsetMeters: 0.3, lookAheadSeconds: 0, accelerationLookAheadSecondsSquared: 0,
        horizontalDeadZoneRatio: 0, verticalDeadZoneRatio: 0,
        horizontalPositionDampingPerSecond: 2, verticalPositionDampingPerSecond: 3,
        yawDampingPerSecond: 5, pitchDampingPerSecond: 7, maximumPositionLagMeters: 10,
      } }, subject.capabilityAssembly.cameraContext)).toBe(true);
      director.update(subject.capabilityAssembly.cameraContext, sample, deltaSeconds,
        committedCameraContextFromViewTargetV2(sample, 1, "idle", 0), springArm);
      let expectedPosition = camera.position.clone();
      let expectedTarget = new Vector3(...director.snapshot().desiredTargetPositionMetersXYZ!);
      const offset = expectedPosition.subtract(expectedTarget);
      const moves = [[4, 1.1, -7.3], [3.7, 0.8, -6.8], [4.5, 1.2, -7.8]] as const;
      for (const [index, position] of moves.entries()) {
        const moved = { ...sample, targetPositionMetersXYZ: position };
        const rawTarget = new Vector3(position[0], position[1] + 1.2, position[2]);
        const idealPosition = rawTarget.add(offset);
        // 9e35ab53 Director: position damping consumes the raw ideal position;
        // target damping is independent and is not also added to ideal position.
        expectedPosition = new Vector3(
          expectedPosition.x + (idealPosition.x - expectedPosition.x) * (1 - Math.exp(-2 * deltaSeconds)),
          expectedPosition.y + (idealPosition.y - expectedPosition.y) * (1 - Math.exp(-3 * deltaSeconds)),
          expectedPosition.z + (idealPosition.z - expectedPosition.z) * (1 - Math.exp(-2 * deltaSeconds)),
        );
        expectedTarget = new Vector3(
          expectedTarget.x + (rawTarget.x - expectedTarget.x) * (1 - Math.exp(-5 * deltaSeconds)),
          expectedTarget.y + (rawTarget.y - expectedTarget.y) * (1 - Math.exp(-7 * deltaSeconds)),
          expectedTarget.z + (rawTarget.z - expectedTarget.z) * (1 - Math.exp(-5 * deltaSeconds)),
        );
        director.update(subject.capabilityAssembly.cameraContext, moved, deltaSeconds,
          committedCameraContextFromViewTargetV2(moved, index + 2, "idle", 0), springArm);
        expect(Vector3.Distance(camera.position, expectedPosition)).toBeLessThan(1e-9);
        expect(Vector3.Distance(new Vector3(...director.snapshot().desiredTargetPositionMetersXYZ!), expectedTarget))
          .toBeLessThan(1e-9);
      }
    } finally {
      director.dispose();
      engine.dispose();
    }
  });

  it.each([1 / 30, 1 / 60, 1 / 120])("matches pinned-old bidirectional Profile transition traces at dt=%s", (dt) => {
    for (const reverse of [false, true]) for (const blocked of [false, true]) {
      const f = createCameraRenderFixture();
      try {
        const shared = {
          horizontalDeadZoneRatio: 0, verticalDeadZoneRatio: 0,
          lookAheadSeconds: 0, accelerationLookAheadSecondsSquared: 0, maximumPositionLagMeters: 10,
        };
        const orbit = { ...shared, distanceMeters: 4, targetHeightMeters: 1.1, pitchRadians: 0.15,
          shoulderOffsetMeters: -0.3, baseFovDegrees: 48, horizontalPositionDampingPerSecond: 2,
          verticalPositionDampingPerSecond: 3, yawDampingPerSecond: 4, pitchDampingPerSecond: 5,
          fovDampingPerSecond: 6, transitionSeconds: 0.4 };
        const follow = { ...shared, distanceMeters: 7, targetHeightMeters: 2.3, pitchRadians: 0.35,
          shoulderOffsetMeters: 0.6, baseFovDegrees: 78, horizontalPositionDampingPerSecond: 7,
          verticalPositionDampingPerSecond: 8, yawDampingPerSecond: 9, pitchDampingPerSecond: 10,
          fovDampingPerSecond: 11, transitionSeconds: 0.3 };
        const fromRef = reverse ? FOLLOW_REF : ORBIT_REF;
        const toRef = reverse ? ORBIT_REF : FOLLOW_REF;
        const to = reverse ? orbit : follow;
        const context = f.subject.capabilityAssembly.cameraContext;
        expect(f.component.setViewPreference(context, { mode: "camera-rig-profile", cameraRigProfileRef: fromRef }).ok).toBe(true);
        expect(f.component.applyPreview({ [ORBIT_REF]: orbit, [FOLLOW_REF]: follow }, context)).toBe(true);
        const wallZ = -6;
        if (blocked) f.query.mockImplementation((request) => {
          const start = new Vector3(...request.startPositionMetersXYZ);
          const end = new Vector3(...request.endPositionMetersXYZ);
          if (end.z <= wallZ + 1e-9 || end.z <= start.z) return undefined;
          const fraction = (wallZ - start.z) / (end.z - start.z);
          return {
            schemaVersion: 2, travelFraction: fraction,
            travelDistanceMeters: Vector3.Distance(start, end) * fraction,
            hitPointMetersXYZ: Vector3.Lerp(start, end, fraction).asArray() as [number, number, number],
            hitNormalXYZ: [0, 0, -1], hitEntityId: "wall", startedOverlapping: false,
            penetrationDepthMeters: 0, obstructionClass: "hard",
          };
        });
        f.update(1, {}, dt);
        const startPosition = f.camera.position.clone();
        const startTarget = new Vector3(...f.component.snapshot().desiredTargetPositionMetersXYZ!);
        const startFov = f.camera.fov;
        let position = startPosition.clone();
        let target = startTarget.clone();
        let dampedFov = startFov;
        expect(f.component.setViewPreference(context, { mode: "camera-rig-profile", cameraRigProfileRef: toRef }).ok).toBe(true);
        const rawTarget = new Vector3(3, 1 + to.targetHeightMeters, -7);
        const ideal = new Vector3(3 - to.shoulderOffsetMeters,
          rawTarget.y + Math.sin(to.pitchRadians) * to.distanceMeters,
          -7 + Math.cos(to.pitchRadians) * to.distanceMeters);
        let elapsed = 0;
        for (let tick = 2; tick < Math.ceil(to.transitionSeconds / dt) + 6; tick += 1) {
          const alpha = smoothstep01(elapsed / to.transitionSeconds);
          const nextPosition = blocked
            ? Vector3.Lerp(rawTarget, ideal, (wallZ - rawTarget.z) / (ideal.z - rawTarget.z))
            : new Vector3(
                position.x + (ideal.x - position.x) * (1 - Math.exp(-to.horizontalPositionDampingPerSecond * dt)),
                position.y + (ideal.y - position.y) * (1 - Math.exp(-to.verticalPositionDampingPerSecond * dt)),
                position.z + (ideal.z - position.z) * (1 - Math.exp(-to.horizontalPositionDampingPerSecond * dt)),
              );
          const nextTarget = new Vector3(
            target.x + (rawTarget.x - target.x) * (1 - Math.exp(-to.yawDampingPerSecond * dt)),
            target.y + (rawTarget.y - target.y) * (1 - Math.exp(-to.pitchDampingPerSecond * dt)),
            target.z + (rawTarget.z - target.z) * (1 - Math.exp(-to.yawDampingPerSecond * dt)),
          );
          dampedFov += (to.baseFovDegrees * Math.PI / 180 - dampedFov) * (1 - Math.exp(-to.fovDampingPerSecond * dt));
          position = blocked ? nextPosition : Vector3.Lerp(startPosition, nextPosition, alpha);
          target = Vector3.Lerp(startTarget, nextTarget, alpha);
          const fov = startFov + (dampedFov - startFov) * alpha;
          f.update(tick, {}, dt);
          expect(f.component.snapshot().activeCameraProfileRef).toBe(toRef);
          expect(f.component.snapshot().resolvedParameters).toMatchObject(to);
          expect(f.component.snapshot().profileTransitionProgressRatio).toBeCloseTo(alpha, 12);
          expect(Vector3.Distance(f.camera.position, position)).toBeLessThan(1e-8);
          expect(Vector3.Distance(new Vector3(...f.component.snapshot().desiredTargetPositionMetersXYZ!), target)).toBeLessThan(1e-8);
          expect(f.camera.fov).toBeCloseTo(fov, 10);
          elapsed += dt;
        }
      } finally { f.dispose(); }
    }
  });

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
          throw new Error("Expected third-person Spring Arm telemetry.");
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

  it("does not apply mounted framing without a committed mountedOn Rider context", async () => {
    const runtime = await createCameraPreviewChannelRuntime();
    try {
      await runtime.runFixedInput({ actions: [], ticks: 4 });
      setCameraProfile(runtime, ORBIT_REF);
      const snapshot = await runtime.runFixedInput({ actions: [], ticks: 1 });

      expect(snapshot.camera.activeCameraProfileRef).toBe(ORBIT_REF);
      expect(snapshot.camera.activeCameraModifierRefs).not.toContain(
        "worldkit://camera-modifier/mounted-framing@1",
      );
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
      await Promise.all([
        firstRuntime.runFixedInput({ actions: [], ticks: 1 }),
        secondRuntime.runFixedInput({ actions: [], ticks: 1 }),
      ]);

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

  it("renders old committed Camera interpolation at alpha 0/0.5/1 and restores authoritative state", async () => {
    const runtime = await createCameraPreviewChannelRuntime();
    try {
      await runtime.runFixedInput({ actions: [], ticks: 4 });
      setCameraProfile(runtime, ORBIT_REF);
      runtime.adjustCameraView({ yawDeltaRadians: 0.6 });
      const previous = await runtime.runFixedInput({ actions: [], ticks: 1 });
      const current = await runtime.runFixedInput({ actions: [], ticks: 1 });
      expect(distanceMeters(previous.camera.actualPositionMetersXYZ!, current.camera.actualPositionMetersXYZ!))
        .toBeGreaterThan(0.001);
      const scene = (runtime as unknown as { readonly scene: Scene }).scene;
      const camera = scene.activeCamera;
      if (!(camera instanceof FreeCamera)) throw new Error("Expected runtime Camera.");
      const render = vi.spyOn(scene, "render");
      try {
        for (const alpha of [0, 0.5, 1]) {
          render.mockImplementation(() => {
            const position = Vector3.Lerp(new Vector3(...previous.camera.actualPositionMetersXYZ!),
              new Vector3(...current.camera.actualPositionMetersXYZ!), alpha);
            const target = Vector3.Lerp(new Vector3(...previous.camera.desiredTargetPositionMetersXYZ!),
              new Vector3(...current.camera.desiredTargetPositionMetersXYZ!), alpha);
            camera.getViewMatrix(true);
            expect(Vector3.Distance(camera.position, position)).toBeLessThan(1e-8);
            expect(Vector3.Distance(camera.getTarget(), target)).toBeLessThan(1e-5);
            expect(camera.fov).toBeCloseTo((previous.camera.finalFovDegrees! +
              (current.camera.finalFovDegrees! - previous.camera.finalFovDegrees!) * alpha) * Math.PI / 180, 10);
          });
          runtime.renderFrame(alpha);
          expect(runtime.snapshot().camera).toEqual(current.camera);
          expect(runtime.snapshot().subjectStatesByEntityId).toEqual(current.subjectStatesByEntityId);
        }
        render.mockImplementation(() => { throw new Error("render interrupted"); });
        expect(() => runtime.renderFrame(0.5)).toThrow("render interrupted");
        expect(runtime.snapshot().camera).toEqual(current.camera);
        expect(runtime.snapshot().subjectStatesByEntityId).toEqual(current.subjectStatesByEntityId);
      } finally {
        render.mockRestore();
      }
    } finally {
      await runtime.dispose();
    }
  });

  it("keeps a pending render-history reset through a repeated committed tick", () => {
    const f = createCameraRenderFixture();
    try {
      f.update(1);
      f.update(2, { targetPositionMetersXYZ: [4, 1, -7] });
      expect(f.component.applyPreview({ [ORBIT_REF]: { baseFovDegrees: 80 } },
        f.subject.capabilityAssembly.cameraContext)).toBe(true);
      f.update(2, { targetPositionMetersXYZ: [4, 1, -7] });
      expect(f.component.captureTransactionState().renderPoseHistoryNeedsReset).toBe(true);
      const before = f.component.captureTransactionState();
      f.component.render(0.5, () => {});
      expect(f.component.captureTransactionState()).toEqual(before);
      f.update(3, { targetPositionMetersXYZ: [4, 1, -7] });
      const folded = f.component.captureTransactionState();
      expect(folded.renderPoseHistoryNeedsReset).toBe(false);
      expect(folded.renderPoseHistory.previous).toEqual(folded.renderPoseHistory.current);
    } finally { f.dispose(); }
  });

  it.each(["target-rebind", "teleport"])("collapses Camera render history on %s without inferring another movement state", (change) => {
    const f = createCameraRenderFixture();
    try {
      f.update(1);
      f.update(2, { targetPositionMetersXYZ: [4, 1, -7] });
      f.update(3, change === "target-rebind"
        ? { entityId: "render-target-b", targetPositionMetersXYZ: [4, 1, -7] }
        : { targetPositionMetersXYZ: [100, 1, -7] });
      const state = f.component.captureTransactionState();
      expect(state.renderPoseHistory.previous).toEqual(state.renderPoseHistory.current);
      f.component.render(0.5, () => {
        expect(f.camera.position.asArray()).toEqual(state.renderPoseHistory.current.positionMetersXYZ);
      });
    } finally { f.dispose(); }
  });

  it.each(["path-blocked", "lookat-blocked", "query-failed"])("uses the committed pose for %s during display interpolation without mutating authority", (failure) => {
    const f = createCameraRenderFixture();
    try {
      f.update(1);
      f.update(2, { targetPositionMetersXYZ: [4, 1.5, -7.5] });
      const before = f.component.captureTransactionState();
      f.query.mockClear();
      f.query.mockImplementation(() => {
        if (failure === "query-failed") throw new Error("geometry unavailable");
        if (failure === "lookat-blocked" && f.query.mock.calls.length === 1) return undefined;
        return {
          schemaVersion: 2, travelDistanceMeters: 0, travelFraction: 0,
          hitPointMetersXYZ: [0, 0, 0], hitNormalXYZ: [0, 0, -1],
          hitEntityId: "wall", startedOverlapping: false, penetrationDepthMeters: 0,
          obstructionClass: "hard",
        };
      });
      f.component.render(0.5, () => {
        expect(f.camera.position.asArray()).toEqual(before.renderPoseHistory.current.positionMetersXYZ);
      });
      expect(f.query).toHaveBeenCalledTimes(failure === "lookat-blocked" ? 2 : 1);
      expect(f.query.mock.calls[0]![0]).toMatchObject({
        committedTick: 2, excludedEntityIds: [f.sample.entityId], collisionMask: "camera-hard",
        startPositionMetersXYZ: before.renderPoseHistory.previous.positionMetersXYZ,
        endPositionMetersXYZ: before.renderPoseHistory.current.positionMetersXYZ,
      });
      expect(f.component.captureTransactionState()).toEqual(before);
      f.query.mockClear();
      f.component.render(1, () => {});
      expect(f.query).not.toHaveBeenCalled();
      expect(f.component.captureTransactionState()).toEqual(before);
    } finally { f.dispose(); }
  });

  it("interpolates changing FOV and restores render history with the existing Camera transaction", () => {
    const f = createCameraRenderFixture();
    try {
      f.update(1);
      f.component.applyPreview({ [ORBIT_REF]: { baseFovDegrees: 90 } }, f.subject.capabilityAssembly.cameraContext);
      f.update(2);
      f.update(3, { targetPositionMetersXYZ: [4, 1, -7] });
      const before = f.component.captureTransactionState();
      const { previous, current } = before.renderPoseHistory;
      expect(current.fovRadians).not.toBe(previous.fovRadians);
      const renderAndCheck = () => f.component.render(0.5, () => {
        expect(f.camera.fov).toBeCloseTo((previous.fovRadians + current.fovRadians) / 2, 12);
        expect(Vector3.Distance(f.camera.position, Vector3.Lerp(new Vector3(...previous.positionMetersXYZ),
          new Vector3(...current.positionMetersXYZ), 0.5))).toBeLessThan(1e-9);
      });
      renderAndCheck();
      f.update(4, { targetPositionMetersXYZ: [5, 1, -7] });
      f.component.restoreTransactionState(before);
      expect(f.component.captureTransactionState()).toEqual(before);
      renderAndCheck();
      expect(f.component.captureTransactionState()).toEqual(before);
      expect(Vector3.Distance(f.camera.getTarget(), new Vector3(...current.targetPositionMetersXYZ)))
        .toBeLessThan(1e-5);
      f.component.reset();
      expect(f.component.captureTransactionState().renderPoseHistoryNeedsReset).toBe(true);
      f.update(1);
      const reset = f.component.captureTransactionState();
      expect(reset.renderPoseHistory.previous).toEqual(reset.renderPoseHistory.current);
    } finally { f.dispose(); }
  });

  it("snaps a real Havok-obstructed interpolation segment with two individually safe Camera endpoints", async () => {
    const runtime = await createCameraPreviewChannelRuntime();
    try {
      await runtime.runFixedInput({ actions: [], ticks: 4 });
      setCameraProfile(runtime, ORBIT_REF);
      runtime.applyCameraPreview({ tuningByProfileRef: {
        [ORBIT_REF]: { distanceMeters: 6, maximumPositionLagMeters: 0 },
      } });
      runtime.adjustCameraView({ yawDeltaRadians: 1.4 });
      const previous = await runtime.runFixedInput({ actions: [], ticks: 1 });
      const current = await runtime.runFixedInput({ actions: [], ticks: 1 });
      const scene = (runtime as unknown as { readonly scene: Scene }).scene;
      const port = (runtime as unknown as {
        readonly cameraComponent: { readonly director: { readonly cameraGeometryQuery: CameraGeometryQueryPortV2 } };
      }).cameraComponent.director.cameraGeometryQuery;
      const camera = scene.activeCamera;
      if (!(camera instanceof FreeCamera)) throw new Error("Expected runtime Camera.");
      const radius = current.camera.resolvedParameters!.collisionRadiusMeters;
      expect(distanceMeters(previous.camera.actualPositionMetersXYZ!, current.camera.actualPositionMetersXYZ!))
        .toBeGreaterThan(radius * 2 + 0.1);
      const wall = MeshBuilder.CreateBox("render-corner-blocker", { size: 0.04 }, scene);
      wall.position.copyFrom(Vector3.Lerp(new Vector3(...previous.camera.actualPositionMetersXYZ!),
        new Vector3(...current.camera.actualPositionMetersXYZ!), 0.5));
      wall.metadata = { worldkitEntityId: "render-corner-blocker" };
      const aggregate = new PhysicsAggregate(wall, PhysicsShapeType.BOX, { mass: 0 }, scene);
      const render = vi.spyOn(scene, "render");
      const query = vi.spyOn(port, "query");
      try {
        for (const endpoint of [previous, current]) {
          expect(port.query({
            schemaVersion: 2, committedTick: current.tick,
            startPositionMetersXYZ: endpoint.camera.desiredTargetPositionMetersXYZ!,
            endPositionMetersXYZ: endpoint.camera.actualPositionMetersXYZ!,
            radiusMeters: radius, collisionMask: "camera-hard", excludedEntityIds: ["player"], maximumHitCount: 1,
          })).toBeUndefined();
        }
        query.mockClear();
        render.mockImplementation(() => {
          expect(camera.position.asArray()).toEqual(current.camera.actualPositionMetersXYZ);
        });
        runtime.renderFrame(0.5);
        expect(query).toHaveBeenCalledTimes(1);
        expect(query.mock.results[0]!.value).toMatchObject({ hitEntityId: "render-corner-blocker" });
        expect(runtime.snapshot().camera).toEqual(current.camera);
        expect(runtime.snapshot().subjectStatesByEntityId).toEqual(current.subjectStatesByEntityId);
      } finally {
        query.mockRestore(); render.mockRestore(); aggregate.dispose(); wall.dispose();
      }
    } finally { await runtime.dispose(); }
  });

  it("keeps previewed rendered Camera state deterministic across 30/60/120 Hz cadence", async () => {
    const runtime = await createCameraPreviewChannelRuntime();
    try {
      const runScenario = async (
        previewEnabled: boolean,
        renderCadenceHz: 30 | 60 | 120,
      ) => {
        runtime.reset();
        await bindAndPublishInitialCamera(runtime, "player");
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
      await bindAndPublishInitialCamera(runtime, "player");
      setCameraProfile(runtime, ORBIT_REF);
      const withoutPreview = await runtime.runFixedInput({
        actions: ["move-forward"],
        ticks: 30,
      });
      runtime.reset();
      await bindAndPublishInitialCamera(runtime, "player");
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
      await bindAndPublishInitialCamera(runtime, "player");
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
      await bindAndPublishInitialCamera(runtime, "player");
      setCameraProfile(runtime, ORBIT_REF);
      runtime.applyCameraPreview({
        tuningByProfileRef: {
          [ORBIT_REF]: { lookSensitivityXRatio: 3 },
        },
      });
      // Commit the staged Profile + Preview before applying input that reads
      // the resolved sensitivity.
      await runtime.runFixedInput({ actions: [], ticks: 1 });
      runtime.adjustCameraView({ yawDeltaRadians: 1 });
      const withPreview = await runtime.runFixedInput({
        actions: ["move-forward"],
        ticks: 30,
      });

      expect(withPreview.subjectStatesByEntityId.player?.locomotion?.committedTick)
        .toBe(withPreview.tick);
      expect(withoutPreview.subjectStatesByEntityId.player?.locomotion?.committedTick)
        .toBe(withoutPreview.tick);
      expect(subjectStateWithoutLocomotionCommittedTick(
        withPreview.subjectStatesByEntityId.player,
      )).toEqual(subjectStateWithoutLocomotionCommittedTick(
        withoutPreview.subjectStatesByEntityId.player,
      ));
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
      await runtime.runFixedInput({ actions: [], ticks: 1 });
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
      runtime.resetCameraViewPreference();
      const firstDefault = (await runtime.runFixedInput({ actions: [], ticks: 1 }))
        .camera.activeCameraProfileRef;
      expect(runtime.snapshot().camera.selectionDecision?.cameraViewPreference).toEqual({
        mode: "auto",
      });
      expect(runtime.snapshot().camera).toMatchObject({
        viewYawOffsetRadians: 0,
        viewPitchOffsetRadians: 0,
        viewDistanceOffsetMeters: 0,
      });
      setCameraProfile(runtime, FOLLOW_REF);
      await runtime.runFixedInput({ actions: [], ticks: 1 });
      runtime.resetCameraViewPreference();
      const secondDefault = (await runtime.runFixedInput({ actions: [], ticks: 1 }))
        .camera.activeCameraProfileRef;
      expect(secondDefault).toBe(firstDefault);
    } finally {
      await runtime.dispose();
    }
  });

  it("prepares Camera View changes invisibly and restores all state when update throws", async () => {
    const runtime = await createCameraPreviewChannelRuntime();
    try {
      await runtime.runFixedInput({ actions: [], ticks: 4 });
      setCameraProfile(runtime, ORBIT_REF);
      await runtime.runFixedInput({ actions: [], ticks: 1 });
      runtime.adjustCameraView({ yawDeltaRadians: 0.35, zoomDeltaMeters: 0.5 });
      const before = runtime.snapshot().camera;
      const prepared = runtime.prepareCameraViewPreference({
        mode: "camera-rig-profile",
        cameraRigProfileRef: FOLLOW_REF,
      });

      expect(runtime.snapshot().camera).toEqual(before);
      expect(prepared.previous.camera).toEqual(before);
      // A prepared preference only stages Camera state; it cannot re-query or
      // commit a second pose for the already committed Tick.
      expect(prepared.next.camera).toEqual(before);
      prepared.commitPrepared();
      expect(runtime.snapshot().camera).toEqual(before);
      expect((await runtime.runFixedInput({ actions: [], ticks: 1 }))
        .camera.activeCameraProfileRef).toBe(FOLLOW_REF);
      prepared.rollbackPrepared();
      expect(runtime.snapshot().camera).toEqual(before);

      const updateSpy = vi.spyOn(
        runtime as unknown as { updateCamera(): void },
        "updateCamera",
      ).mockImplementationOnce(() => {
        throw new Error("forced update failure after preference mutation");
      });
      expect(() => runtime.prepareCameraViewPreference({
        mode: "camera-rig-profile",
        cameraRigProfileRef: FOLLOW_REF,
      })).toThrow("forced update failure after preference mutation");
      expect(runtime.snapshot().camera).toEqual(before);
      updateSpy.mockRestore();
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
      await runtime.runFixedInput({ actions: [], ticks: 1 });
      const beforeOrbit = runtime.snapshot();
      const subjectBefore = beforeOrbit.subjectStatesByEntityId.player;
      const facingBytesBefore = JSON.stringify(subjectBefore?.forwardXYZ);
      const locomotionBytesBefore = JSON.stringify({
        locomotionMode: subjectBefore?.locomotionMode,
        movementMedium: subjectBefore?.movementMedium,
        speedMetersPerSecond: subjectBefore?.speedMetersPerSecond,
        activeMotionProfileRef: subjectBefore?.activeMotionProfileRef,
        motionTags: subjectBefore?.motionTags,
      });
      const cameraPoseBytesBefore = JSON.stringify(beforeOrbit.camera.positionMetersXYZ);
      const staged = runtime.adjustCameraView({
        yawDeltaRadians: 1.2,
        pitchDeltaRadians: 0.3,
      });
      // Orbit input only stages CameraDirector state. The already committed
      // Camera pose, Subject facing and Locomotion projection stay byte-identical.
      expect(JSON.stringify(staged.camera.positionMetersXYZ)).toBe(cameraPoseBytesBefore);
      expect(JSON.stringify(staged.subjectStatesByEntityId.player?.forwardXYZ))
        .toBe(facingBytesBefore);
      expect(JSON.stringify({
        locomotionMode: staged.subjectStatesByEntityId.player?.locomotionMode,
        movementMedium: staged.subjectStatesByEntityId.player?.movementMedium,
        speedMetersPerSecond: staged.subjectStatesByEntityId.player?.speedMetersPerSecond,
        activeMotionProfileRef: staged.subjectStatesByEntityId.player?.activeMotionProfileRef,
        motionTags: staged.subjectStatesByEntityId.player?.motionTags,
      })).toBe(locomotionBytesBefore);
      const committedOrbit = await runtime.runFixedInput({ actions: [], ticks: 1 });
      expect(JSON.stringify(committedOrbit.camera.positionMetersXYZ))
        .not.toBe(cameraPoseBytesBefore);
      // Moving afterwards turns the Subject toward the committed view direction.
      const moved = await runtime.runFixedInput({ actions: ["move-forward"], ticks: 10 });
      expect(JSON.stringify(moved.subjectStatesByEntityId.player?.forwardXYZ))
        .not.toBe(facingBytesBefore);
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

  it("accepts only byte-identical committed Context on a repeated Director Tick", () => {
    const executionPlan = compileRuntimeTestScenePlanV1(
      createFlatTerrainCapabilitySpec(),
      { subjectResourceRegistry: builtInSubjectResourceRegistry },
    );
    const subject = runtimeSubject(executionPlan);
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const camera = new FreeCamera("camera.test", Vector3.Zero(), scene);
    let queryCount = 0;
    const queryPort = cameraGeometryQuery(() => {
        queryCount += 1;
        return undefined;
      });
    const director = new CameraDirectorV1(initialCamera(executionPlan), camera, scene, queryPort);
    const springArm = new SpringArmComponentV1();
    const sample: ViewTargetSampleV1 = {
      controlledEntityId: subject.entityId,
      entityId: subject.entityId,
      targetPositionMetersXYZ: [0, 1, 0],
      forwardXYZ: [0, 0, -1],
      upXYZ: [0, 1, 0],
      velocityMetersPerSecondXYZ: [0, 0, 0],
      approximateRadiusMeters: 0.5,
      socketPositionsMetersXYZById: {},
      movementMedium: "ground",
      relationshipContexts: [],
      cameraContextTags: [],
    };
    try {
      const context = committedCameraContextFromViewTargetV2(
        sample,
        7,
        "idle",
        0,
      );
      director.update(
        subject.capabilityAssembly.cameraContext,
        sample,
        1 / 60,
        context,
        springArm,
      );
      const poseBytes = JSON.stringify(camera.position.asArray());
      director.adjustView({ yawDeltaRadians: 0.5 });
      director.update(
        subject.capabilityAssembly.cameraContext,
        // This provider shell is not a solver authority input.
        { ...sample, approximateRadiusMeters: 99 },
        1 / 60,
        structuredClone(context),
        springArm,
      );
      expect(queryCount).toBe(1);
      expect(JSON.stringify(camera.position.asArray())).toBe(poseBytes);

      const conflictingContext = {
        ...structuredClone(context),
        subjectPose: {
          ...context.subjectPose,
          positionMetersXYZ: [1, 1, 0] as const,
        },
      };
      expect(() => director.update(
        subject.capabilityAssembly.cameraContext,
        sample,
        1 / 60,
        conflictingContext,
        springArm,
      )).toThrow("3C_CAMERA_CONTEXT_UNCOMMITTED");
      expect(() => director.update(
        subject.capabilityAssembly.cameraContext,
        sample,
        1 / 60,
        committedCameraContextFromViewTargetV2(sample, 6, "idle", 0),
        springArm,
      )).toThrow("3C_CAMERA_CONTEXT_UNCOMMITTED");
      expect(queryCount).toBe(1);
    } finally {
      director.dispose();
      engine.dispose();
    }
  });

  it("solves the raw ideal arm and also validates the actual smoothed LookAt while retracted", () => {
    const executionPlan = compileRuntimeTestScenePlanV1(
      createFlatTerrainCapabilitySpec(),
      { subjectResourceRegistry: builtInSubjectResourceRegistry },
    );
    const subject = runtimeSubject(executionPlan);
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const camera = new FreeCamera("camera.smoothed-collision", Vector3.Zero(), scene);
    const requests: CameraGeometryQueryRequestV2[] = [];
    const queryPort = cameraGeometryQuery((request) => {
      requests.push(structuredClone(request));
      const delta = request.endPositionMetersXYZ.map(
        (coordinate, index) => coordinate - request.startPositionMetersXYZ[index]!,
      ) as [number, number, number];
      const armLengthMeters = Math.hypot(...delta);
      return {
        schemaVersion: 2,
        travelDistanceMeters: armLengthMeters * 0.5,
        travelFraction: 0.5,
        hitPointMetersXYZ: [
          request.startPositionMetersXYZ[0] + delta[0] * 0.5,
          request.startPositionMetersXYZ[1] + delta[1] * 0.5,
          request.startPositionMetersXYZ[2] + delta[2] * 0.5,
        ],
        hitNormalXYZ: [0, 0, -1],
        hitEntityId: "wall-primary",
        startedOverlapping: false,
        penetrationDepthMeters: 0,
        obstructionClass: "hard",
      };
    });
    const director = new CameraDirectorV1(initialCamera(executionPlan), camera, scene, queryPort);
    const springArm = new SpringArmComponentV1();
    const initialSample: ViewTargetSampleV1 = {
      controlledEntityId: subject.entityId,
      entityId: subject.entityId,
      targetPositionMetersXYZ: [0, 1, 0],
      forwardXYZ: [0, 0, -1],
      upXYZ: [0, 1, 0],
      velocityMetersPerSecondXYZ: [0, 0, 0],
      approximateRadiusMeters: 0.5,
      socketPositionsMetersXYZById: {},
      movementMedium: "ground",
      relationshipContexts: [],
      cameraContextTags: [],
    };
    try {
      expect(director.applyPreview({
        [ORBIT_REF]: { horizontalDeadZoneRatio: 0, verticalDeadZoneRatio: 0 },
        [FOLLOW_REF]: { horizontalDeadZoneRatio: 0, verticalDeadZoneRatio: 0 },
      }, subject.capabilityAssembly.cameraContext)).toBe(true);
      director.update(
        subject.capabilityAssembly.cameraContext,
        initialSample,
        1 / 60,
        committedCameraContextFromViewTargetV2(initialSample, 1, "idle", 0),
        springArm,
      );
      const movedSample = {
        ...initialSample,
        targetPositionMetersXYZ: [10, 1, 0] as const,
      };
      director.update(
        subject.capabilityAssembly.cameraContext,
        movedSample,
        1 / 60,
        committedCameraContextFromViewTargetV2(movedSample, 2, "idle", 0),
        springArm,
      );

      const nominalRequest = requests[1];
      const finalRequest = requests[2];
      if (nominalRequest === undefined || finalRequest === undefined) {
        throw new Error("Expected nominal and final geometry queries after target movement.");
      }
      expect(nominalRequest.startPositionMetersXYZ[0]).toBe(10);
      expect(nominalRequest.endPositionMetersXYZ[0]).toBe(10);
      expect(finalRequest.startPositionMetersXYZ).toEqual(
        director.snapshot().desiredTargetPositionMetersXYZ,
      );
      expect(finalRequest.startPositionMetersXYZ[0]).toBeGreaterThan(0);
      expect(finalRequest.startPositionMetersXYZ[0]).toBeLessThan(10);
      expect(finalRequest.endPositionMetersXYZ[0]).toBe(10);
      expect(distanceMeters(director.snapshot().actualPositionMetersXYZ!, finalRequest.startPositionMetersXYZ))
        .toBeLessThanOrEqual(distanceMeters(finalRequest.startPositionMetersXYZ, finalRequest.endPositionMetersXYZ) * 0.5);
    } finally {
      director.dispose();
      engine.dispose();
    }
  });

  it("keeps the rendered target and FOV on the hard-collision-validated pose", () => {
    const executionPlan = compileRuntimeTestScenePlanV1(
      createFlatTerrainCapabilitySpec(),
      { subjectResourceRegistry: builtInSubjectResourceRegistry },
    );
    const subject = runtimeSubject(executionPlan);
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const camera = new FreeCamera("camera.collision-composition", Vector3.Zero(), scene);
    const requests: CameraGeometryQueryRequestV2[] = [];
    const queryPort = cameraGeometryQuery((request) => {
      requests.push(structuredClone(request));
      const delta = request.endPositionMetersXYZ.map(
        (coordinate, index) => coordinate - request.startPositionMetersXYZ[index]!,
      ) as [number, number, number];
      const armLengthMeters = Math.hypot(...delta);
      const travelFraction = 0.18;
      return {
        schemaVersion: 2,
        travelDistanceMeters: armLengthMeters * travelFraction,
        travelFraction,
        hitPointMetersXYZ: [
          request.startPositionMetersXYZ[0] + delta[0] * travelFraction,
          request.startPositionMetersXYZ[1] + delta[1] * travelFraction,
          request.startPositionMetersXYZ[2] + delta[2] * travelFraction,
        ],
        hitNormalXYZ: [0, 0, -1],
        hitEntityId: "wall-primary",
        startedOverlapping: false,
        penetrationDepthMeters: 0,
        obstructionClass: "hard",
      };
    });
    const director = new CameraDirectorV1(
      initialCamera(executionPlan),
      camera,
      scene,
      queryPort,
    );
    const springArm = new SpringArmComponentV1();
    const sample: ViewTargetSampleV1 = {
      controlledEntityId: subject.entityId,
      entityId: subject.entityId,
      targetPositionMetersXYZ: [0, 0, 0],
      forwardXYZ: [0, 0, -1],
      upXYZ: [0, 1, 0],
      velocityMetersPerSecondXYZ: [0, 0, 0],
      approximateRadiusMeters: 0.35,
      socketPositionsMetersXYZById: {
        FootAlignment: [0, 0, 0],
        FirstPersonView: [0, 1.8, 0],
        ThirdPersonTarget: [0, 1.8, 0],
      },
      movementMedium: "ground",
      relationshipContexts: [],
      cameraContextTags: [],
    };
    try {
      director.setViewPreference(
        subject.capabilityAssembly.cameraContext,
        {
          mode: "camera-rig-profile",
          cameraRigProfileRef: ORBIT_REF,
        },
      );
      director.update(
        subject.capabilityAssembly.cameraContext,
        sample,
        1 / 60,
        committedCameraContextFromViewTargetV2(sample, 1, "idle", 0),
        springArm,
      );

      const snapshot = director.snapshot();
      const request = requests[0];
      if (request === undefined) throw new Error("Expected a geometry query.");
      if (snapshot.resolvedParameters === undefined) {
        throw new Error("Expected resolved Camera parameters.");
      }
      camera.getViewMatrix(true);
      expect(snapshot.isCollisionRetracted).toBe(true);
      expect(snapshot.effectiveArmLengthMeters! / snapshot.requestedArmLengthMeters!)
        .toBeLessThan(0.3);
      expect.soft(camera.getTarget().x).toBeCloseTo(
        request.startPositionMetersXYZ[0],
        6,
      );
      expect.soft(camera.getTarget().y).toBeCloseTo(
        request.startPositionMetersXYZ[1],
        6,
      );
      expect.soft(camera.getTarget().z).toBeCloseTo(
        request.startPositionMetersXYZ[2],
        6,
      );
      expect.soft(snapshot.finalFovDegrees).toBeCloseTo(
        snapshot.resolvedParameters.baseFovDegrees,
        6,
      );
    } finally {
      director.dispose();
      engine.dispose();
    }
  });

  it("selects orbit.medium from committed grounded Camera Context V2", () => {
    const executionPlan = compileRuntimeTestScenePlanV1(
      createFlatTerrainCapabilitySpec(),
      { subjectResourceRegistry: builtInSubjectResourceRegistry },
    );
    const subject = runtimeSubject(executionPlan);
    const sample: ViewTargetSampleV1 = {
      controlledEntityId: subject.entityId,
      entityId: subject.entityId,
      targetPositionMetersXYZ: [0, 1, 0],
      forwardXYZ: [0, 0, -1],
      upXYZ: [0, 1, 0],
      velocityMetersPerSecondXYZ: [0.4, 0, 0],
      approximateRadiusMeters: 0.5,
      socketPositionsMetersXYZById: {},
      movementMedium: "ground",
      relationshipContexts: [],
      cameraContextTags: [],
    };
    const groundedContext = parseCameraContextSampleV2({
      schemaVersion: 2,
      semanticAuthorityStatus: "available",
      committedTick: 3,
      controlledEntityId: subject.entityId,
      targetEntityId: subject.entityId,
      subjectPose: {
        positionMetersXYZ: [0, 1, 0],
        facingYawRadians: 0,
      },
      locomotion: {
        schemaVersion: 2,
        status: "active",
        mobilityMode: "grounded",
        gait: "walk",
        verticalPhase: "none",
        supportMode: "supported",
        movementMedium: "ground",
        facingYawRadians: 0,
        linearVelocity: { x: 0.4, y: 0, z: 0 },
        horizontalSpeedMetersPerSecond: 0.4,
        committedTick: 3,
        phaseEnteredTick: 0,
        transitionSequence: 0,
      },
      actionSummary: {
        status: "available",
        activeActionRefs: [],
        isInterruptible: true,
      },
      environment: {
        relationshipContexts: [],
        socketPositionsMetersXYZById: {},
        cameraContextTags: [],
      },
    });
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const camera = new FreeCamera("camera.free-ground", Vector3.Zero(), scene);
    const director = new CameraDirectorV1(
      initialCamera(executionPlan),
      camera,
      scene,
      cameraGeometryQuery(),
    );
    const springArm = new SpringArmComponentV1();
    try {
      director.update(
        subject.capabilityAssembly.cameraContext,
        sample,
        1 / 60,
        groundedContext,
        springArm,
      );
      expect(director.snapshot().activeCameraProfileRef).toBe(ORBIT_REF);
      expect(director.snapshot().selectionDecision?.explain.fallbackActive)
        .toBe(false);
    } finally {
      director.dispose();
      engine.dispose();
    }
  });

  it("publishes non-Golden committed locomotion as available Camera Context V2", () => {
    const sample: ViewTargetSampleV1 = {
      controlledEntityId: "player",
      entityId: "player",
      targetPositionMetersXYZ: [1, 0.56, 2],
      forwardXYZ: [0, 0, -1],
      upXYZ: [0, 1, 0],
      velocityMetersPerSecondXYZ: [1.2, 0, 0],
      approximateRadiusMeters: 0.35,
      socketPositionsMetersXYZById: {},
      movementMedium: "ground",
      relationshipContexts: [],
      cameraContextTags: ["forward-intent"],
    };

    const grounded = committedCameraContextFromViewTargetV2(
      sample,
      9,
      "walk",
      0,
    );
    expect(grounded.semanticAuthorityStatus).toBe("available");
    expect(grounded.locomotion).toMatchObject({
      status: "active",
      mobilityMode: "grounded",
      gait: "walk",
      movementMedium: "ground",
      committedTick: 9,
    });
    expect(grounded.environment.cameraContextTags).toEqual(["forward-intent"]);

    const airborne = committedCameraContextFromViewTargetV2(
      {
        ...sample,
        movementMedium: "air",
        velocityMetersPerSecondXYZ: [0.2, 3, 0],
        cameraContextTags: [],
      },
      10,
      "airborne",
      0,
    );
    expect(airborne.locomotion).toMatchObject({
      status: "active",
      mobilityMode: "airborne",
      gait: "none",
      verticalPhase: "rising",
      supportMode: "unsupported",
      movementMedium: "air",
      committedTick: 10,
    });

    const signedZero = committedCameraContextFromViewTargetV2(
      {
        ...sample,
        targetPositionMetersXYZ: [0, 0.56, -0],
        velocityMetersPerSecondXYZ: [-0, -0, -0],
        cameraContextTags: [],
      },
      11,
      "idle",
      -0,
    );
    expect(signedZero.subjectPose.positionMetersXYZ).toEqual([0, 0.56, 0]);
    expect(signedZero.subjectPose.facingYawRadians).toBe(0);
    expect(signedZero.locomotion).toMatchObject({
      status: "active",
      mobilityMode: "grounded",
      gait: "idle",
      linearVelocity: { x: 0, y: 0, z: 0 },
      horizontalSpeedMetersPerSecond: 0,
    });
  });

  it("publishes non-Golden mounted Gameplay relationship ids as Camera Context V2", () => {
    const relationshipId = `mounted-on:sha256:${"ef".repeat(32)}`;
    const sample: ViewTargetSampleV1 = {
      controlledEntityId: "player",
      entityId: "skateboard",
      targetPositionMetersXYZ: [2, 0.2, -1],
      forwardXYZ: [0, 0, -1],
      upXYZ: [0, 1, 0],
      velocityMetersPerSecondXYZ: [0, 0, -1.5],
      approximateRadiusMeters: 0.4,
      socketPositionsMetersXYZById: {},
      movementMedium: "ground",
      relationshipContexts: [{
        id: relationshipId,
        type: "mountedOn",
        riderEntityId: "player",
        mountEntityId: "skateboard",
        mountSlotId: "stand",
      }],
      cameraContextTags: ["forward-intent"],
    };

    const context = committedCameraContextFromViewTargetV2(
      sample,
      12,
      "idle",
      0,
    );
    expect(context.semanticAuthorityStatus).toBe("available");
    expect(context.controlledEntityId).toBe("player");
    expect(context.targetEntityId).toBe("skateboard");
    expect(context.environment).toMatchObject({
      relationshipContexts: [{
        id: relationshipId,
        type: "mountedOn",
        riderEntityId: "player",
        mountEntityId: "skateboard",
        mountSlotId: "stand",
      }],
    });
  });

  it("excludes the mounted physical ViewTarget from camera geometry queries", () => {
    const executionPlan = compileRuntimeTestScenePlanV1(
      createFlatTerrainCapabilitySpec(),
      { subjectResourceRegistry: builtInSubjectResourceRegistry },
    );
    const subject = runtimeSubject(executionPlan);
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const camera = new FreeCamera("camera.mounted-view-target", Vector3.Zero(), scene);
    const requests: CameraGeometryQueryRequestV2[] = [];
    const director = new CameraDirectorV1(
      initialCamera(executionPlan),
      camera,
      scene,
      cameraGeometryQuery((request) => {
        requests.push(structuredClone(request));
        return undefined;
      }),
    );
    const springArm = new SpringArmComponentV1();
    const relationshipId = `mounted-on:sha256:${"ab".repeat(32)}`;
    const sample: ViewTargetSampleV1 = {
      controlledEntityId: "rider",
      entityId: "mount",
      targetPositionMetersXYZ: [2, 0.2, -1],
      forwardXYZ: [0, 0, -1],
      upXYZ: [0, 1, 0],
      velocityMetersPerSecondXYZ: [0, 0, 0],
      approximateRadiusMeters: 0.4,
      socketPositionsMetersXYZById: {},
      movementMedium: "ground",
      relationshipContexts: [{
        id: relationshipId,
        type: "mountedOn",
        riderEntityId: "rider",
        mountEntityId: "mount",
        mountSlotId: "stand",
      }],
      cameraContextTags: [],
    };

    try {
      director.update(
        subject.capabilityAssembly.cameraContext,
        sample,
        1 / 60,
        committedCameraContextFromViewTargetV2(sample, 1, "idle", 0),
        springArm,
      );

      expect(requests).toHaveLength(1);
      expect(requests[0]!.excludedEntityIds).toEqual(["mount"]);
    } finally {
      director.dispose();
      engine.dispose();
    }
  });

  it("rolls a failed Tick back atomically and preserves the next Profile transition", () => {
    const executionPlan = compileRuntimeTestScenePlanV1(
      createFlatTerrainCapabilitySpec(),
      { subjectResourceRegistry: builtInSubjectResourceRegistry },
    );
    const subject = runtimeSubject(executionPlan);
    const cameraContext = subject.capabilityAssembly.cameraContext;
    const alternateProfileRef = cameraContext.defaultCameraRigProfileRef;
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const camera = new FreeCamera("camera.atomic", Vector3.Zero(), scene);
    let failQuery = false;
    const queryPort = cameraGeometryQuery(() => {
        if (failQuery) throw new Error("provider failure");
        return undefined;
      });
    const director = new CameraDirectorV1(initialCamera(executionPlan), camera, scene, queryPort);
    const springArm = new SpringArmComponentV1();
    const sample: ViewTargetSampleV1 = {
      controlledEntityId: subject.entityId,
      entityId: subject.entityId,
      targetPositionMetersXYZ: [0, 1, 0],
      forwardXYZ: [0, 0, -1],
      upXYZ: [0, 1, 0],
      velocityMetersPerSecondXYZ: [0, 0, 0],
      approximateRadiusMeters: 0.5,
      socketPositionsMetersXYZById: {},
      movementMedium: "ground",
      relationshipContexts: [],
      cameraContextTags: [],
    };
    const poseBytes = () => JSON.stringify({
      position: camera.position.asArray(),
      rotation: camera.rotation.asArray(),
      rotationQuaternionState: camera.rotationQuaternion === undefined
        ? "undefined"
        : camera.rotationQuaternion === null
          ? "null"
          : camera.rotationQuaternion.asArray(),
      fov: camera.fov,
    });
    try {
      director.update(cameraContext, sample, 1 / 60,
        committedCameraContextFromViewTargetV2(sample, 1, "idle", 0), springArm);
      expect(director.setViewPreference(cameraContext, {
        mode: "camera-rig-profile",
        cameraRigProfileRef: alternateProfileRef,
      }).ok).toBe(true);
      const beforeSnapshot = JSON.stringify(director.snapshot());
      const beforePose = poseBytes();
      failQuery = true;
      expect(() => director.update(cameraContext, sample, 1 / 60,
        committedCameraContextFromViewTargetV2(sample, 2, "idle", 0), springArm))
        .toThrow("3C_CAMERA_QUERY_UNAVAILABLE");
      expect(JSON.stringify(director.snapshot())).toBe(beforeSnapshot);
      expect(poseBytes()).toBe(beforePose);
      expect(() => director.update(cameraContext, sample, 1 / 60,
        committedCameraContextFromViewTargetV2(sample, 2, "idle", 0), springArm))
        .toThrow("3C_CAMERA_QUERY_UNAVAILABLE");

      failQuery = false;
      director.update(cameraContext, sample, 1 / 60,
        committedCameraContextFromViewTargetV2(sample, 3, "idle", 0), springArm);
      expect(director.snapshot()).toMatchObject({
        activeCameraProfileRef: alternateProfileRef,
        profileTransitionProgressRatio: 0,
      });
    } finally {
      director.dispose();
      engine.dispose();
    }
  });

  it("resets Director state without owning the injected geometry port, then closes lifecycle", () => {
    const executionPlan = compileRuntimeTestScenePlanV1(
      createFlatTerrainCapabilitySpec(),
      { subjectResourceRegistry: builtInSubjectResourceRegistry },
    );
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const queryPort = cameraGeometryQuery();
    const director = new CameraDirectorV1(
      initialCamera(executionPlan),
      new FreeCamera("camera.test", Vector3.Zero(), scene),
      scene,
      queryPort,
    );
    try {
      director.reset();
      director.dispose();
      director.dispose();
      const snapshotBytes = JSON.stringify(director.snapshot());
      const previewBytes = JSON.stringify(director.previewState());
      expect(Object.isFrozen(director.snapshot())).toBe(true);
      expect(Object.isFrozen(director.snapshot().activeCameraModifierRefs)).toBe(true);
      expect(Object.isFrozen(director.previewState())).toBe(true);
      expect(Object.isFrozen(director.previewState().activeCameraModifierRefs)).toBe(true);
      expect(Object.isFrozen(director.previewState().tuningByProfileRef)).toBe(true);
      const postDisposeMutators = [
        () => director.setViewPreference(
          runtimeSubject(executionPlan).capabilityAssembly.cameraContext,
          {
            mode: "camera-rig-profile",
            cameraRigProfileRef: "worldkit://camera-profile/hostile@1",
          },
        ),
        () => director.resetViewPreference(),
        () => director.setInputActions(["camera-shoulder-swap"]),
        () => director.adjustView({ yawDeltaRadians: 0.5 }),
        () => director.resetView(),
        () => director.applyPreview(
          {},
          runtimeSubject(executionPlan).capabilityAssembly.cameraContext,
        ),
        () => director.reset(),
      ];
      for (const mutate of postDisposeMutators) {
        expect(mutate).toThrow("3C_RUNTIME_DISPOSED");
        expect(JSON.stringify(director.snapshot())).toBe(snapshotBytes);
        expect(JSON.stringify(director.previewState())).toBe(previewBytes);
      }
    } finally {
      engine.dispose();
    }
  });
});
