import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

import { NullEngine } from "@babylonjs/core/Engines/nullEngine.pure.js";
import { createGameplayBootstrapV1 } from "@whitebox-world/gameplay-contracts";
import {
  createWorldRuntimeBootstrapV1,
  type CanonicalSceneExecutionPlanV1,
} from "@whitebox-world/runtime-contracts";
import { describe, expect, it } from "vitest";

// Test-only Registry access via a cross-workspace relative path (matching the
// fixture imports below); production runtime-babylon src must not read the Registry.
import { builtInSubjectResourceRegistry } from "../../subject-registry/src/index";

import { createValidAuthoringSpecV4 } from "../../authoring/src/test-fixture";
import { BabylonWorldRuntime } from "./babylon-world-runtime";
import { BABYLON_GAMEPLAY_RUNTIME_INTERNAL } from "./gameplay-runtime-internal";
import { bindRuntimeTestPossession } from "./runtime-test-possession";
import {
  compileRuntimeTestScenePlanV1,
  registerRuntimeTestWorldArtifactsV1,
  runtimeTestSubjectsForPlanV1,
  runtimeTestWorldArtifactsForPlanV1,
  runtimeTestWorldInputForPlanV1,
} from "./runtime-test-plan";

function setCameraProfile(runtime: BabylonWorldRuntime, cameraRigProfileRef: string) {
  return runtime.setCameraViewPreference({
    mode: "camera-rig-profile",
    cameraRigProfileRef,
  });
}

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
const cameraDirectorSource = await readFile(
  new URL("./camera-director.ts", import.meta.url),
  "utf8",
);
const cameraViewSolverSource = await readFile(
  new URL("./camera-view-solver.ts", import.meta.url),
  "utf8",
).catch(() => "");
const springArmComponentSource = await readFile(
  new URL("./spring-arm-component.ts", import.meta.url),
  "utf8",
).catch(() => "");


const CAMERA_PROFILES = [
  [
    "worldkit://camera-profile/first-person.standard@1",
    "worldkit://camera-rig/socket-first-person@1",
  ],
  [
    "worldkit://camera-profile/orbit.medium@1",
    "worldkit://camera-rig/orbit-follow@1",
  ],
  [
    "worldkit://camera-profile/follow.medium@1",
    "worldkit://camera-rig/orbit-follow@1",
  ],
] as const;

const UNREACHABLE_CAMERA_PROFILE_REFS = [
  "worldkit://camera-profile/chase.surface-fast@1",
  "worldkit://camera-profile/flight.glide@1",
] as const;

const MEDIUM_FEEL_REF = "worldkit://control-feel-profile/humanoid.medium-ground@1";
const HEAVY_FEEL_REF = "worldkit://control-feel-profile/humanoid.heavy-ground@1";

function rebuildRuntimeBootstrap(
  executionPlan: CanonicalSceneExecutionPlanV1,
  patch: Partial<
    Omit<
      ReturnType<typeof runtimeTestWorldArtifactsForPlanV1>["worldRuntimeBootstrap"],
      "contentHash"
    >
  >,
) {
  const { contentHash: _contentHash, ...body } =
    runtimeTestWorldArtifactsForPlanV1(executionPlan).worldRuntimeBootstrap;
  return createWorldRuntimeBootstrapV1({ ...body, ...patch });
}

function withExtraCapabilitySubject(executionPlan: CanonicalSceneExecutionPlanV1): CanonicalSceneExecutionPlanV1 {
  const artifacts = runtimeTestWorldArtifactsForPlanV1(executionPlan);
  const player = runtimeTestSubjectsForPlanV1(executionPlan)[0];
  if (player === undefined) {
    throw new Error("Expected a compiled capability Subject.");
  }
  const subjects = [
    player,
    {
      ...player,
      entityId: "extra",
      spawnAnchorEntityId: "spawn-extra",
      spawnSubjectOriginPositionMetersXYZ: [
        player.spawnSubjectOriginPositionMetersXYZ[0] + 4,
        player.spawnSubjectOriginPositionMetersXYZ[1],
        player.spawnSubjectOriginPositionMetersXYZ[2],
      ] as const,
    },
  ] as const;
  const playerEntityDescriptor = artifacts.gameplayBootstrap.entityDescriptors
    .find((descriptor) => descriptor.id === player.entityId);
  if (playerEntityDescriptor === undefined) {
    throw new Error("Expected a compiled capability Gameplay entity.");
  }
  const {
    contentHash: _gameplayBootstrapContentHash,
    ...gameplayBootstrapBody
  } = artifacts.gameplayBootstrap;
  const gameplayBootstrap = createGameplayBootstrapV1({
    ...gameplayBootstrapBody,
    entityDescriptors: [
      ...artifacts.gameplayBootstrap.entityDescriptors,
      { ...playerEntityDescriptor, id: "extra" },
    ],
  });
  const nextBootstrap = rebuildRuntimeBootstrap(executionPlan, {
    gameplayBootstrapRef: gameplayBootstrap.resourceRef,
    gameplayBootstrapHash: gameplayBootstrap.contentHash,
    runtimeResourceLockEntries:
      artifacts.worldRuntimeBootstrap.runtimeResourceLockEntries.map((entry) =>
        entry.resourceKind === "gameplay-bootstrap"
          ? { ...entry, contentHash: gameplayBootstrap.contentHash }
          : entry
      ),
    subjectRuntimeDescriptors: subjects.map((subject) => {
      const {
        spawnAnchorEntityId: _spawnAnchorEntityId,
        spawnSubjectOriginPositionMetersXYZ: _spawnSubjectOriginPositionMetersXYZ,
        spawnSubjectFacingRadians: _spawnSubjectFacingRadians,
        ...descriptor
      } = subject;
      return descriptor;
    }),
  });
  const nextPlan: CanonicalSceneExecutionPlanV1 = {
    ...executionPlan,
    worldRuntimeBootstrapHash: nextBootstrap.contentHash,
    subjectInstances: subjects.map((subject) => ({
      entityId: subject.entityId,
      spawnAnchorEntityId: subject.spawnAnchorEntityId,
      subjectOriginPositionMetersXYZ: subject.spawnSubjectOriginPositionMetersXYZ,
      subjectFacingRadians: subject.spawnSubjectFacingRadians,
    })),
  };
  registerRuntimeTestWorldArtifactsV1({
    ...artifacts,
    executionPlan: nextPlan,
    gameplayBootstrap,
    worldRuntimeBootstrap: nextBootstrap,
  });
  return nextPlan;
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

function createGbotCapabilityExecutionPlan(): CanonicalSceneExecutionPlanV1 {
  const spec = createFlatTerrainCapabilitySpec();
  const subject = spec.nodes.find((node) => node.kind === "subject");
  if (subject?.kind !== "subject") {
    throw new Error("Capability fixture Subject is missing.");
  }
  subject.subjectDefinitionRef =
    "worldkit://subject-definition/humanoid.g-bot@2";
  return compileRuntimeTestScenePlanV1(spec, {
    subjectResourceRegistry: builtInSubjectResourceRegistry,
  });
}

async function createBoundGbotRuntime(
  executionPlan: CanonicalSceneExecutionPlanV1,
): Promise<BabylonWorldRuntime> {
  const runtime = await BabylonWorldRuntime.create({
    ...runtimeTestWorldInputForPlanV1(executionPlan),
    havokWasmBinary,
    subjectAssetResolver: {
      async resolveSubjectAsset() {
        return { bytes: gBotAssetBytes, sourceLabel: "g-bot-test" };
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
  await bindAndPublishInitialCamera(
    runtime,
    runtimeTestWorldArtifactsForPlanV1(executionPlan).worldRuntimeBootstrap
      .initialControlledEntityId,
  );
  return runtime;
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

describe("capability package runtime smoke tests", () => {
  it("keeps Camera Director independent from controls and real-world subject categories", () => {
    expect(cameraDirectorSource).not.toMatch(
      /controlProfile|CharacterMovementComponentV1|RuntimeSubjectDescriptorV1|humanoid|vehicle|category\s*===/,
    );
  });

  it("keeps view and Spring Arm solving outside the Camera Director", () => {
    expect(cameraDirectorSource).not.toMatch(
      /pickWithRay|collisionDistanceMeters|collisionShortenedPosition/,
    );
    expect(cameraViewSolverSource).toContain("export class CameraViewSolverV1");
    expect(cameraViewSolverSource).not.toMatch(/FreeCamera|ViewControlFrame|Gameplay/);
    expect(springArmComponentSource).toContain("export class SpringArmComponentV1");
    expect(springArmComponentSource).toContain("sweepSphere");
    expect(springArmComponentSource).not.toMatch(/FreeCamera|ViewControlFrame|Gameplay/);
  });

  it("keeps manual orbit heading when raw sprint input has no committed Camera semantic", async () => {
    const runtime = await createBoundGbotRuntime(createGbotCapabilityExecutionPlan());
    const horizontalCameraOffset = (snapshot: ReturnType<typeof runtime.snapshot>) => {
      const subject = snapshot.subjectStatesByEntityId.player!;
      const offsetX = snapshot.camera.positionMetersXYZ[0] - subject.positionMetersXYZ[0];
      const offsetZ = snapshot.camera.positionMetersXYZ[2] - subject.positionMetersXYZ[2];
      const length = Math.hypot(offsetX, offsetZ);
      return [offsetX / length, offsetZ / length] as const;
    };
    try {
      setCameraProfile(runtime, "worldkit://camera-profile/orbit.medium@1");
      runtime.adjustCameraView({ yawDeltaRadians: 1.2 });
      await runtime.runFixedInput({ actions: [], ticks: 120 });
      await runtime.runFixedInput({ actions: ["move-forward"], ticks: 120 });
      const beforeSprint = await runtime.runFixedInput({ actions: [], ticks: 120 });
      const beforeOffset = horizontalCameraOffset(beforeSprint);

      const sprinting = await runtime.runFixedInput({
        actions: ["move-forward", "run"],
        ticks: 120,
      });
      const sprintOffset = horizontalCameraOffset(sprinting);
      const afterRelease = await runtime.runFixedInput({ actions: [], ticks: 120 });
      const releasedOffset = horizontalCameraOffset(afterRelease);

      expect(sprinting.camera.activeCameraModifierRefs).not.toContain(
        "worldkit://camera-modifier/sprint-emphasis@1",
      );
      expect(sprinting.camera.activeCameraProfileRef).toBe(
        "worldkit://camera-profile/orbit.medium@1",
      );
      expect(sprinting.camera.viewYawOffsetRadians).toBeCloseTo(1.2, 6);
      expect(
        beforeOffset[0] * sprintOffset[0] + beforeOffset[1] * sprintOffset[1],
      ).toBeGreaterThan(0.999);
      expect(afterRelease.camera.activeCameraModifierRefs).not.toContain(
        "worldkit://camera-modifier/sprint-emphasis@1",
      );
      expect(
        beforeOffset[0] * releasedOffset[0] + beforeOffset[1] * releasedOffset[1],
      ).toBeGreaterThan(0.999);
    } finally {
      await runtime.dispose();
    }
  });

  it("loads the locked 25-clip G Bot package into a live Runtime", async () => {
    const subjectDefinitionRef =
      "worldkit://subject-definition/humanoid.g-bot@2";
    const executionPlan = createGbotCapabilityExecutionPlan();
    const subject = runtimeTestSubjectsForPlanV1(executionPlan)[0];
    const gBotAssetPart = subject?.visualParts.find(
      (part) => part.id === "body.asset",
    );
    expect(gBotAssetPart?.localTransform.rotationEulerRadiansXYZ[1]).toBeCloseTo(
      Math.PI,
      12,
    );
    expect(subject?.sockets.map((socket) => socket.id).sort())
      .toEqual([
        "CameraTarget3D",
        "FirstPersonView",
        "FootAlignment",
        "LookAhead",
        "SeatAlignment",
        "ThirdPersonTarget",
        "hand.right",
      ]);
    expect(subject?.capabilityAssembly).toBeDefined();
    const runtime = await createBoundGbotRuntime(executionPlan);
    try {
      const snapshot = await runtime.runFixedInput({
        actions: ["move-forward"],
        ticks: 30,
      });
      expect(snapshot.subjectStatesByEntityId.player).toMatchObject({
        activeActionId: "walk",
      });
      expect(snapshot.subjectStatesByEntityId.player).not.toHaveProperty(
        "activeMotionKernelRef",
      );
      expect(
        (await runtime.runFixedInput({ actions: ["aim"], ticks: 1 })).camera
          .activeCameraModifierRefs,
      ).not.toContain("worldkit://camera-modifier/aim-framing@1");
      expect(
        (await runtime.runFixedInput({ actions: ["move-forward", "run"], ticks: 1 }))
          .camera.activeCameraModifierRefs,
      ).not.toContain("worldkit://camera-modifier/sprint-emphasis@1");
      for (const [cameraProfileRef, cameraRigRef] of CAMERA_PROFILES) {
        expect(
          () => setCameraProfile(runtime, cameraProfileRef),
          cameraProfileRef,
        ).not.toThrow();
        const camera = (await runtime.runFixedInput({ actions: [], ticks: 1 })).camera;
        expect(camera).toMatchObject({
          activeCameraProfileRef: cameraProfileRef,
          activeCameraRigRef: cameraRigRef,
          safeFallbackActive: false,
        });
        expect(camera.positionMetersXYZ.every(Number.isFinite)).toBe(true);
      }
      for (const cameraProfileRef of UNREACHABLE_CAMERA_PROFILE_REFS) {
        expect(() => setCameraProfile(runtime, cameraProfileRef)).toThrow(
          "CAMERA_PREFERENCE_NOT_ALLOWED",
        );
      }
      setCameraProfile(runtime, "worldkit://camera-profile/first-person.standard@1");
      expect(() => runtime.applyCameraPreview({
        tuningByProfileRef: {
          "worldkit://camera-profile/first-person.standard@1": { distanceMeters: 6 },
        },
      })).toThrow(/SUBJECT_PRESET_INVALID_CAMERA_TUNING/);
      expect(() => runtime.applyCameraPreview({
        tuningByProfileRef: {
          "worldkit://camera-profile/first-person.standard@1": {
            minimumDistanceMeters: 1,
          } as never,
        },
      })).toThrow(/SUBJECT_PRESET_INVALID_CAMERA_TUNING/);
      setCameraProfile(runtime, "worldkit://camera-profile/orbit.medium@1");
      await runtime.runFixedInput({ actions: [], ticks: 1 });
      runtime.adjustCameraView({
        yawDeltaRadians: 0.5,
        pitchDeltaRadians: 0.2,
        zoomDeltaMeters: 1,
      });
      const adjustedCamera = (
        await runtime.runFixedInput({ actions: [], ticks: 1 })
      ).camera;
      expect(adjustedCamera.viewYawOffsetRadians).toBeGreaterThan(0);
      expect(adjustedCamera.viewPitchOffsetRadians).toBeGreaterThan(0);
      expect(adjustedCamera.viewDistanceOffsetMeters).toBeGreaterThan(0);
      const orbitPreview = runtime.applyCameraPreview({
        tuningByProfileRef: {
          "worldkit://camera-profile/orbit.medium@1": {
            distanceMeters: 6,
            rotationDampingPerSecond: 18,
            lookAheadSeconds: 0.4,
          },
        },
      });
      expect(orbitPreview.tuningByProfileRef["worldkit://camera-profile/orbit.medium@1"])
        .toEqual({
          distanceMeters: 6,
          rotationDampingPerSecond: 18,
          lookAheadSeconds: 0.4,
        });
      expect(() => runtime.applyCameraPreview({
        tuningByProfileRef: {
          "worldkit://camera-profile/orbit.medium@1": { inventedCameraKnob: 1 } as never,
        },
      })).toThrow(/SUBJECT_PRESET_INVALID_CAMERA_TUNING/);
      expect(() => runtime.applyCameraPreview({
        tuningByProfileRef: {
          "worldkit://camera-profile/orbit.medium@1": { targetHeightMeters: 999 },
        },
      })).toThrow(/SUBJECT_PRESET_INVALID_CAMERA_TUNING/);
      expect(() => runtime.applyCameraPreview({
        tuningByProfileRef: {
          "worldkit://camera-profile/orbit.medium@1": { pitchRadians: 1.3 },
        },
      })).toThrow(/SUBJECT_PRESET_INVALID_CAMERA_TUNING/);
      runtime.resetCameraView();
      expect(runtime.resetCameraViewPreference().camera).not.toHaveProperty("preference");
      runtime.reset();
      await bindAndPublishInitialCamera(runtime, "player");
      setCameraProfile(runtime, "worldkit://camera-profile/orbit.medium@1");
      const runRenderedFixedInput = async (
        actions: readonly ("move-left")[],
        ticks: number,
      ) => {
        for (let tick = 0; tick < ticks; tick += 1) {
          await runtime.runFixedInput({ actions, ticks: 1 });
          runtime.renderFrame();
        }
        return runtime.snapshot();
      };
      const beforeStrafe = await runRenderedFixedInput([], 1);
      await runRenderedFixedInput(["move-left"], 30);
      const afterStrafe = await runRenderedFixedInput([], 120);
      const horizontalCameraOffset = (snapshot: typeof beforeStrafe) => {
        const state = snapshot.subjectStatesByEntityId.player!;
        const x = snapshot.camera.positionMetersXYZ[0] - state.positionMetersXYZ[0];
        const z = snapshot.camera.positionMetersXYZ[2] - state.positionMetersXYZ[2];
        const length = Math.hypot(x, z);
        return [x / length, z / length] as const;
      };
      const beforeOffset = horizontalCameraOffset(beforeStrafe);
      const afterOffset = horizontalCameraOffset(afterStrafe);
      expect(beforeOffset[0] * afterOffset[0] + beforeOffset[1] * afterOffset[1])
        .toBeGreaterThan(0.995);
      expect(Math.abs(afterStrafe.subjectStatesByEntityId.player!.forwardXYZ![0]))
        .toBeGreaterThan(0.9);

      runtime.reset();
      await bindAndPublishInitialCamera(runtime, "player");
      setCameraProfile(runtime, "worldkit://camera-profile/orbit.medium@1");
      const movingNormally = await runtime.runFixedInput({
        actions: ["move-forward"],
        ticks: 60,
      });
      runtime.reset();
      await bindAndPublishInitialCamera(runtime, "player");
      setCameraProfile(runtime, "worldkit://camera-profile/orbit.medium@1");
      const movingWhileLookingBack = await runtime.runFixedInput({
        actions: ["move-forward", "camera-look-back"],
        ticks: 60,
      });
      const normalPosition = movingNormally.subjectStatesByEntityId.player!.positionMetersXYZ;
      const lookBackPosition = movingWhileLookingBack.subjectStatesByEntityId.player!.positionMetersXYZ;
      const normalLength = Math.hypot(normalPosition[0], normalPosition[2]);
      const lookBackLength = Math.hypot(lookBackPosition[0], lookBackPosition[2]);
      expect(
        (normalPosition[0] * lookBackPosition[0] + normalPosition[2] * lookBackPosition[2]) /
          (normalLength * lookBackLength),
      ).toBeGreaterThan(0.995);

      runtime.reset();
      await bindAndPublishInitialCamera(runtime, "player");
      setCameraProfile(runtime, "worldkit://camera-profile/orbit.medium@1");
      runtime.applyCameraPreview({
        tuningByProfileRef: {
          "worldkit://camera-profile/orbit.medium@1": { distanceMeters: 6 },
        },
      });
      expect(
        setCameraProfile(runtime, "worldkit://camera-profile/follow.medium@1")
          .camera,
      ).not.toHaveProperty("tuning");
      expect(
        runtime.getCameraPreviewState()
          .tuningByProfileRef["worldkit://camera-profile/follow.medium@1"],
      ).toBeUndefined();
      expect(
        runtime.getCameraPreviewState()
          .tuningByProfileRef["worldkit://camera-profile/orbit.medium@1"],
      ).toEqual({ distanceMeters: 6 });

      setCameraProfile(runtime, "worldkit://camera-profile/orbit.medium@1");
      const beforeTransition = runtime.snapshot().camera.positionMetersXYZ;
      const firstTransitionFrame = setCameraProfile(runtime,
        "worldkit://camera-profile/follow.medium@1",
      ).camera.positionMetersXYZ;
      expect(firstTransitionFrame).toEqual(beforeTransition);
      await runRenderedFixedInput(["move-left"], 30);
      const followed = await runRenderedFixedInput([], 120);
      const followedState = followed.subjectStatesByEntityId.player!;
      const followedOffset = horizontalCameraOffset(followed);
      expect(
        followedOffset[0] * followedState.forwardXYZ![0] +
          followedOffset[1] * followedState.forwardXYZ![2],
      ).toBeLessThan(-0.9);

      runtime.reset();
      await bindAndPublishInitialCamera(runtime, "player");
      const beforeRejectedFeelOverride = runtime.snapshot();
      expect(() =>
        runtime.requestControlFeelProfile(
          "player",
          "worldkit://control-feel-profile/humanoid.heavy-ground@1",
        ),
      ).toThrow(/^SUBJECT_OVERRIDE_FORBIDDEN/);
      expect(runtime.snapshot()).toEqual(beforeRejectedFeelOverride);
      expect(
        runtime.requestControlFeelProfile(
          "player",
          "worldkit://control-feel-profile/humanoid.medium-ground@1",
        ),
      ).toBe(true);
      const compilerLockedFeel = await runtime.runFixedInput({
        actions: ["move-forward"],
        ticks: 6,
      });
      expect(
        compilerLockedFeel.subjectStatesByEntityId.player!
          .activeControlFeelProfileRef,
      ).toBe(MEDIUM_FEEL_REF);
      expect(
        compilerLockedFeel.subjectStatesByEntityId.player!.speedMetersPerSecond,
      ).toBeGreaterThan(0);
      expect(() => runtime.requestControlFeelProfile(
        "player",
        "worldkit://control-feel-profile/unknown.unlisted@1",
      )).toThrow(/^SUBJECT_OVERRIDE_FORBIDDEN/);

      runtime.reset();
      await bindAndPublishInitialCamera(runtime, "player");
      expect(runtime).not.toHaveProperty("setControlFeelTuning");
      expect(runtime).not.toHaveProperty("getControlFeelTuning");
      expect(runtime).not.toHaveProperty("setControlTuning");
      expect(runtime).not.toHaveProperty("getControlTuning");
      expect(runtime.snapshot().subjectStatesByEntityId.player)
        .not.toHaveProperty("controlFeelParameterTuning");
      expect(runtime.snapshot().subjectStatesByEntityId.player)
        .not.toHaveProperty("controlParameterTuning");

      const capabilitySubject = runtimeTestSubjectsForPlanV1(executionPlan)[0]!;
      const capabilityAssembly = capabilitySubject.capabilityAssembly;
      const defaultMotionProfileRef = capabilityAssembly.defaultMotionProfile.resourceRef;
      const orbitProfile = capabilityAssembly.cameraContext.cameraRigProfiles.find(
        (profile) =>
          profile.resourceRef === "worldkit://camera-profile/orbit.medium@1",
      )!;
      const beforeRejectedPreset = runtime.snapshot();
      const selectedControlFeelProfileRef =
        "worldkit://control-feel-profile/humanoid.medium-ground@1";
      const selectedControlProfileRef = capabilityAssembly.controlProfile.resourceRef;
      const rejectedPreset = runtime.applySubjectPresetTuning({
        subjectEntityId: "player",
        expectedSubjectDefinitionRef: subjectDefinitionRef,
        expectedSubjectDefinitionContentHash: "sha256:" + "0".repeat(64),
        selectedMotionProfileRef: defaultMotionProfileRef,
        selectedControlFeelProfileRef,
        selectedControlProfileRef,
      });
      expect(rejectedPreset.status).toBe("rejected");
      expect(rejectedPreset.snapshot).toEqual(beforeRejectedPreset);

      const rejectedUnlockedFeel = runtime.applySubjectPresetTuning({
        subjectEntityId: "player",
        expectedSubjectDefinitionRef: subjectDefinitionRef,
        expectedSubjectDefinitionContentHash:
          capabilitySubject.subjectDefinitionHash,
        selectedMotionProfileRef: defaultMotionProfileRef,
        selectedControlFeelProfileRef:
          "worldkit://control-feel-profile/unknown.unlisted@1",
        selectedControlProfileRef,
      });
      expect(rejectedUnlockedFeel.status).toBe("rejected");
      expect(rejectedUnlockedFeel.snapshot).toEqual(beforeRejectedPreset);

      const rejectedControlProfile = runtime.applySubjectPresetTuning({
        subjectEntityId: "player",
        expectedSubjectDefinitionRef: subjectDefinitionRef,
        expectedSubjectDefinitionContentHash:
          capabilitySubject.subjectDefinitionHash,
        selectedMotionProfileRef: defaultMotionProfileRef,
        selectedControlFeelProfileRef,
        selectedControlProfileRef:
          "worldkit://control-profile/unknown.unlisted@1",
      });
      expect(rejectedControlProfile.status).toBe("rejected");
      expect(rejectedControlProfile.snapshot).toEqual(beforeRejectedPreset);

      const exactControlProfile = capabilityAssembly.controlProfile;
      expect(() => runtime.applyCameraPreview({
        tuningByProfileRef: {
          [orbitProfile.resourceRef]: { targetHeightMeters: 999 },
        },
      })).toThrow(/SUBJECT_PRESET_INVALID_CAMERA_TUNING/);

      const controlProfile = exactControlProfile;
      const rejectedCompilerLockedFeel = runtime.applySubjectPresetTuning({
        subjectEntityId: "player",
        expectedSubjectDefinitionRef: subjectDefinitionRef,
        expectedSubjectDefinitionContentHash:
          capabilitySubject.subjectDefinitionHash,
        selectedMotionProfileRef: defaultMotionProfileRef,
        selectedControlFeelProfileRef:
          "worldkit://control-feel-profile/humanoid.heavy-ground@1",
        selectedControlProfileRef: controlProfile.resourceRef,
      });
      expect(rejectedCompilerLockedFeel.status).toBe("rejected");
      expect(rejectedCompilerLockedFeel.snapshot).toEqual(beforeRejectedPreset);
      const afterFeelTick = await runtime.runFixedInput({ actions: [], ticks: 1 });
      expect(afterFeelTick.subjectStatesByEntityId.player)
        .toMatchObject({
          activeControlFeelProfileRef:
            "worldkit://control-feel-profile/humanoid.medium-ground@1",
          activePhysicsBodyProfileRef:
            "worldkit://physics-body-profile/character.capability-medium@1",
        });
      expect(rejectedCompilerLockedFeel.snapshot.subjectStatesByEntityId.player)
        .not.toHaveProperty("controlFeelParameterTuning");
      expect(rejectedCompilerLockedFeel.snapshot.subjectStatesByEntityId.player)
        .not.toHaveProperty("controlParameterTuning");
      expect((await runtime.runHarness("player")).passed).toBe(true);
    } finally {
      await runtime.dispose();
    }
  }, 15_000);


  it("keeps the capability camera frozen across render-only paused frames", async () => {
    const executionPlan = createGbotCapabilityExecutionPlan();
    const runtime = await createBoundGbotRuntime(executionPlan);
    try {
      setCameraProfile(runtime, "worldkit://camera-profile/orbit.medium@1");
      runtime.adjustCameraView({
        yawDeltaRadians: 0.8,
        pitchDeltaRadians: 0.25,
        zoomDeltaMeters: 1.5,
      });
      const beforeRender = runtime.snapshot().camera;

      for (let frame = 0; frame < 12; frame += 1) runtime.renderFrame();

      expect(runtime.snapshot().camera).toEqual(beforeRender);
    } finally {
      await runtime.dispose();
    }
  });

  it("applies unsupported gravity to the canonical G Bot instead of hovering", async () => {
    const baseExecutionPlan = createGbotCapabilityExecutionPlan();
    const baseArtifacts = runtimeTestWorldArtifactsForPlanV1(baseExecutionPlan);
    const initialControlledEntityId =
      baseArtifacts.worldRuntimeBootstrap.initialControlledEntityId;
    const executionPlan: CanonicalSceneExecutionPlanV1 = {
      ...structuredClone(baseExecutionPlan),
      waters: [],
      subjectInstances: baseExecutionPlan.subjectInstances.map((subject) =>
        subject.entityId === initialControlledEntityId
          ? { ...subject, subjectOriginPositionMetersXYZ: [0, 8, 30] }
          : subject
      ),
    };
    const controlledSubject = executionPlan.subjectInstances.find(
      (subject) => subject.entityId === initialControlledEntityId,
    );
    if (controlledSubject === undefined) throw new Error("Controlled Subject missing.");
    registerRuntimeTestWorldArtifactsV1({
      ...baseArtifacts,
      executionPlan,
    });
    const runtime = await createBoundGbotRuntime(executionPlan);
    try {
      const landed = await runtime.runFixedInput({ actions: [], ticks: 300 });
      expect(landed.subjectStatesByEntityId.player).toMatchObject({
        movementMedium: "ground",
      });
      expect(
        landed.subjectStatesByEntityId.player!.positionMetersXYZ[1],
      ).toBeLessThan(2);
      expect(
        Math.abs(
          landed.subjectStatesByEntityId.player!.velocityMetersPerSecondXYZ[1],
        ),
      ).toBeLessThan(0.1);
    } finally {
      await runtime.dispose();
    }
  });

  it("rejects runtime Motion Profile switching for the Golden Humanoid authority", async () => {
    const baseExecutionPlan = createGbotCapabilityExecutionPlan();
    const artifacts = runtimeTestWorldArtifactsForPlanV1(baseExecutionPlan);
    let executionPlan = structuredClone(baseExecutionPlan);
    const subject = structuredClone(runtimeTestSubjectsForPlanV1(baseExecutionPlan)[0]!);
    const assembly = subject.capabilityAssembly;
    const originalKernelRef = "worldkit://motion-kernel/free-ground@1";
    const aliasedKernelRef = "worldkit://motion-kernel/custom-steering-implementation@1";
    const optionalProfile = {
      ...structuredClone(assembly.defaultMotionProfile),
      resourceRef: "worldkit://motion-profile/custom-steering-profile@1",
      contentHash:
        "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    };
    assembly.optionalMotionProfiles = [
      ...assembly.optionalMotionProfiles,
      optionalProfile,
    ];
    const optionalKernel = assembly.motionKernels.find(
      (kernel) => kernel.resourceRef === originalKernelRef,
    )!;
    for (const profile of [
      assembly.defaultMotionProfile,
      ...assembly.optionalMotionProfiles,
      assembly.fallbackMotionProfile,
    ]) {
      if (profile.motionKernelRef === originalKernelRef) {
        profile.motionKernelRef = aliasedKernelRef;
      }
    }
    optionalKernel.resourceRef = aliasedKernelRef;
    const {
      spawnAnchorEntityId: _spawnAnchorEntityId,
      spawnSubjectOriginPositionMetersXYZ: _spawnSubjectOriginPositionMetersXYZ,
      spawnSubjectFacingRadians: _spawnSubjectFacingRadians,
      ...subjectDescriptor
    } = subject;
    const worldRuntimeBootstrap = rebuildRuntimeBootstrap(baseExecutionPlan, {
      subjectRuntimeDescriptors:
        artifacts.worldRuntimeBootstrap.subjectRuntimeDescriptors.map(
          (candidate) => candidate.entityId === subject.entityId
            ? subjectDescriptor
            : candidate,
        ),
    });
    executionPlan = {
      ...executionPlan,
      worldRuntimeBootstrapHash: worldRuntimeBootstrap.contentHash,
    };
    registerRuntimeTestWorldArtifactsV1({
      ...artifacts,
      executionPlan,
      worldRuntimeBootstrap,
    });

    const runtime = await createBoundGbotRuntime(executionPlan);
    try {
      const initialZ = runtime.snapshot().subjectStatesByEntityId.player!.positionMetersXYZ[2];
      const beforeRejectedOverride = runtime.snapshot();
      expect(() => runtime.requestMotionProfile(
        "player",
        optionalProfile.resourceRef,
      )).toThrow(/^SUBJECT_OVERRIDE_FORBIDDEN/);
      expect(runtime.snapshot()).toEqual(beforeRejectedOverride);
      const moved = await runtime.runFixedInput({
        actions: ["move-forward"],
        ticks: 60,
      });
      expect(moved.subjectStatesByEntityId.player).not.toHaveProperty(
        "activeMotionKernelRef",
      );
      expect(
        Math.abs(moved.subjectStatesByEntityId.player!.positionMetersXYZ[2] - initialZ),
      ).toBeGreaterThan(0.1);
    } finally {
      await runtime.dispose();
    }
  });

  it("fires one free-ground jump until the held action is released", async () => {
    const executionPlan = createGbotCapabilityExecutionPlan();
    const runtime = await createBoundGbotRuntime(executionPlan);
    try {
      let takeoffCount = 0;
      let previousVerticalVelocity = 0;
      for (let tick = 0; tick < 180; tick += 1) {
        const snapshot = await runtime.runFixedInput({ actions: ["jump"], ticks: 1 });
        const verticalVelocity =
          snapshot.subjectStatesByEntityId.player!.velocityMetersPerSecondXYZ[1];
        if (previousVerticalVelocity <= 1 && verticalVelocity > 1) takeoffCount += 1;
        previousVerticalVelocity = verticalVelocity;
      }
      expect(takeoffCount).toBe(1);
      await runtime.runFixedInput({ actions: [], ticks: 1 });
      const secondJump = await runtime.runFixedInput({ actions: ["jump"], ticks: 1 });
      expect(
        secondJump.subjectStatesByEntityId.player!.velocityMetersPerSecondXYZ[1],
      ).toBeGreaterThan(1);
    } finally {
      await runtime.dispose();
    }
  });

  it("keeps every Golden Control Feel locked and reset clears Camera authoring state", async () => {
    const baseExecutionPlan = createGbotCapabilityExecutionPlan();
    const executionPlan = withExtraCapabilitySubject(baseExecutionPlan);
    const subjects = runtimeTestSubjectsForPlanV1(executionPlan);
    const playerSubject = subjects.find((subject) => subject.entityId === "player");
    const extraSubject = subjects.find((subject) => subject.entityId === "extra");
    if (playerSubject === undefined || extraSubject === undefined) {
      throw new Error("Expected two capability Subjects.");
    }
    const capabilityAssembly = playerSubject.capabilityAssembly;
    const orbitProfile = capabilityAssembly.cameraContext.cameraRigProfiles.find(
      (profile) => profile.resourceRef === "worldkit://camera-profile/orbit.medium@1",
    )!;
    const followProfile = capabilityAssembly.cameraContext.cameraRigProfiles.find(
      (profile) => profile.resourceRef === "worldkit://camera-profile/follow.medium@1",
    )!;
    const runtime = await createBoundGbotRuntime(executionPlan);
    try {
      await runtime.runFixedInput({ actions: [], ticks: 8 });
      const beforeRequest = runtime.snapshot();
      const automaticCameraProfileRef = beforeRequest.camera.activeCameraProfileRef;
      const beforePlayer = beforeRequest.subjectStatesByEntityId.player!;
      expect(beforePlayer.activeControlFeelProfileRef).toBe(MEDIUM_FEEL_REF);

      expect(() => runtime.requestControlFeelProfile("player", HEAVY_FEEL_REF))
        .toThrow("SUBJECT_OVERRIDE_FORBIDDEN: Golden Control Feel is compiler-locked.");
      const queued = runtime.snapshot();
      expect(queued.tick).toBe(beforeRequest.tick);
      expect(queued.subjectStatesByEntityId.player).toMatchObject({
        activeControlFeelProfileRef: MEDIUM_FEEL_REF,
        locomotionMode: beforePlayer.locomotionMode,
        positionMetersXYZ: beforePlayer.positionMetersXYZ,
      });

      expect(runtime.requestControlFeelProfile("player", MEDIUM_FEEL_REF)).toBe(true);
      const afterTick = await runtime.runFixedInput({ actions: [], ticks: 1 });
      expect(afterTick.subjectStatesByEntityId.player!.activeControlFeelProfileRef)
        .toBe(MEDIUM_FEEL_REF);

      setCameraProfile(runtime, followProfile.resourceRef);
      const orbitPreview = runtime.applyCameraPreview({
        tuningByProfileRef: { [orbitProfile.resourceRef]: { targetHeightMeters: 1.4 } },
      });
      expect(orbitPreview.tuningByProfileRef[orbitProfile.resourceRef])
        .toEqual({ targetHeightMeters: 1.4 });
      runtime.reset();
      await bindAndPublishInitialCamera(runtime, "player");
      const afterReset = await runtime.runFixedInput({ actions: [], ticks: 1 });
      expect(afterReset.subjectStatesByEntityId.player!.activeControlFeelProfileRef)
        .toBe(MEDIUM_FEEL_REF);
      expect(afterReset.camera).not.toHaveProperty("tuning");
      expect(afterReset.camera.activeCameraProfileRef).toBe(automaticCameraProfileRef);
      expect(runtime.getCameraPreviewState().tuningByProfileRef).toEqual({});

      expect(() => runtime.requestControlFeelProfile("extra", HEAVY_FEEL_REF))
        .toThrow("SUBJECT_OVERRIDE_FORBIDDEN: Golden Control Feel is compiler-locked.");
      const extraAfterTick = await runtime.runFixedInput({ actions: [], ticks: 1 });
      expect(extraAfterTick.subjectStatesByEntityId.extra!.activeControlFeelProfileRef)
        .toBe(MEDIUM_FEEL_REF);
      expect(extraAfterTick.camera).not.toHaveProperty("tuning");
    } finally {
      await runtime.dispose();
    }
  }, 15_000);

  it("clears the previous owner's Camera selection and preview after Gameplay possession commit", async () => {
    const baseExecutionPlan = createGbotCapabilityExecutionPlan();
    const executionPlan = withExtraCapabilitySubject(baseExecutionPlan);
    const subjects = runtimeTestSubjectsForPlanV1(executionPlan);
    const playerSubject = subjects.find((subject) => subject.entityId === "player");
    const extraSubject = subjects.find((subject) => subject.entityId === "extra");
    if (playerSubject === undefined || extraSubject === undefined) {
      throw new Error("Expected two capability Subjects.");
    }
    const capabilityAssembly = playerSubject.capabilityAssembly;
    const orbitProfile = capabilityAssembly.cameraContext.cameraRigProfiles.find(
      (profile) => profile.resourceRef === "worldkit://camera-profile/orbit.medium@1",
    )!;
    const followProfile = capabilityAssembly.cameraContext.cameraRigProfiles.find(
      (profile) => profile.resourceRef === "worldkit://camera-profile/follow.medium@1",
    )!;
    const runtime = await createBoundGbotRuntime(executionPlan);
    try {
      await runtime.runFixedInput({ actions: [], ticks: 4 });
      const automaticCameraProfileRef = runtime.snapshot().camera.activeCameraProfileRef;
      setCameraProfile(runtime, followProfile.resourceRef);
      const orbitPreview = runtime.applyCameraPreview({
        tuningByProfileRef: { [orbitProfile.resourceRef]: { targetHeightMeters: 1.4 } },
      });
      expect(orbitPreview.tuningByProfileRef[orbitProfile.resourceRef])
        .toEqual({ targetHeightMeters: 1.4 });
      await runtime.runFixedInput({
        actions: ["move-forward", "run"],
        ticks: 1,
      });

      const rebound = await runtime[BABYLON_GAMEPLAY_RUNTIME_INTERNAL]()
        .preparePossessionTarget({
        mode: "possessed",
        controlledEntityId: extraSubject.entityId,
      });
      rebound.commitPrepared();
      const afterRebindTick = await runtime.runFixedInput({ actions: [], ticks: 1 });
      expect(afterRebindTick.camera.targetEntityId).toBe(extraSubject.entityId);
      expect(afterRebindTick.camera.activeCameraProfileRef).toBe(automaticCameraProfileRef);
      expect(afterRebindTick.camera).not.toHaveProperty("tuning");
      expect(runtime.getCameraPreviewState().tuningByProfileRef).toEqual({});
    } finally {
      await runtime.dispose();
    }
  }, 15_000);

  it("rejects runtime safe-ground fallback injection for the Golden Humanoid authority", async () => {
    const executionPlan = createGbotCapabilityExecutionPlan();
    const runtime = await createBoundGbotRuntime(executionPlan);
    try {
      const moving = await runtime.runFixedInput({
        actions: ["move-forward"],
        ticks: 45,
      });
      const movingPlayer = moving.subjectStatesByEntityId.player!;
      expect(movingPlayer.speedMetersPerSecond ?? 0).toBeGreaterThan(0.4);
      const movingZ = movingPlayer.positionMetersXYZ[2];

      const beforeRejectedOverride = runtime.snapshot();
      expect(() => runtime.requestMotionProfile(
        "player",
        "worldkit://motion-profile/safe-ground@1",
      )).toThrow(/^SUBJECT_OVERRIDE_FORBIDDEN/);
      expect(runtime.snapshot()).toEqual(beforeRejectedOverride);
      const continued = await runtime.runFixedInput({
        actions: ["move-forward", "jump"],
        ticks: 90,
      });
      const continuedPlayer = continued.subjectStatesByEntityId.player!;
      expect(continuedPlayer.safeFallbackActive).toBe(false);
      expect(continuedPlayer.activeMotionProfileRef).not.toBe(
        "worldkit://motion-profile/safe-ground@1",
      );
      expect(
        Math.abs(continuedPlayer.positionMetersXYZ[2] - movingZ),
      ).toBeGreaterThan(0.35);
    } finally {
      await runtime.dispose();
    }
  }, 15_000);
});
