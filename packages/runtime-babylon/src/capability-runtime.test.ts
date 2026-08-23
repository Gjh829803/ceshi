import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

import { NullEngine } from "@babylonjs/core/Engines/nullEngine.pure.js";
import {
  TRUSTED_DEFAULT_CONTROLLER_ID,
  type ExecutionPlanV4,
} from "@whitebox-world/runtime-contracts";
import { isNil } from "lodash-es";
import { describe, expect, it } from "vitest";

// Test-only Registry access via a cross-workspace relative path (matching the
// fixture imports below); production runtime-babylon src must not read the Registry.
import { builtInSubjectResourceRegistry } from "../../subject-registry/src/index";

import { loadAuthoringScene } from "../../../apps/playground/src/authoring-loader";
import { createValidAuthoringSpec } from "../../authoring/src/test-fixture";
import { BabylonWorldRuntime } from "./babylon-world-runtime";

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
      "../../../apps/playground/public/subject-assets/humanoid/g-bot/v1/g-bot.glb",
      import.meta.url,
    ),
  ),
);
const cameraDirectorSource = await readFile(
  new URL("./camera-director.ts", import.meta.url),
  "utf8",
);

const UNAVAILABLE_RELATIONSHIP_PACKAGES = [
  [
    "worldkit://subject-definition/animal.quadruped.forward-steer@2",
    "worldkit://capability/relationship.mount@1",
    "worldkit://motion-kernel/forward-steer@1",
    "worldkit://subject-definition/playground-preview.animal.quadruped.forward-steer@2",
  ],
  [
    "worldkit://subject-definition/vehicle.four-wheel.arcade@1",
    "worldkit://capability/relationship.seat@1",
    "worldkit://motion-kernel/wheeled-arcade@1",
    "worldkit://subject-definition/playground-preview.vehicle.four-wheel.arcade@1",
  ],
  [
    "worldkit://subject-definition/surface-craft.ice-skimmer@1",
    "worldkit://capability/relationship.seat@1",
    "worldkit://motion-kernel/surface-slide@1",
    "worldkit://subject-definition/playground-preview.surface-craft.ice-skimmer@1",
  ],
  [
    "worldkit://subject-definition/watercraft.kayak.surface@1",
    "worldkit://capability/relationship.seat@1",
    "worldkit://motion-kernel/water-surface@1",
    "worldkit://subject-definition/playground-preview.watercraft.kayak.surface@1",
  ],
  [
    "worldkit://subject-definition/glider.paraglider.unpowered@1",
    "worldkit://capability/relationship.tether@1",
    "worldkit://motion-kernel/unpowered-glide@1",
    "worldkit://subject-definition/playground-preview.glider.paraglider.unpowered@1",
  ],
] as const;

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
  [
    "worldkit://camera-profile/chase.surface-fast@1",
    "worldkit://camera-rig/velocity-chase@1",
  ],
  [
    "worldkit://camera-profile/flight.glide@1",
    "worldkit://camera-rig/flight-horizon@1",
  ],
] as const;

const MEDIUM_FEEL_REF = "worldkit://control-feel-profile/humanoid.medium-ground@1";
const HEAVY_FEEL_REF = "worldkit://control-feel-profile/humanoid.heavy-ground@1";

function withExtraCapabilitySubject(executionPlan: ExecutionPlanV4): ExecutionPlanV4 {
  const player = executionPlan.subjects[0];
  if (player === undefined) {
    throw new Error("Expected a compiled capability Subject.");
  }
  return {
    ...executionPlan,
    subjects: [
      player,
      {
        ...player,
        entityId: "extra",
        spawnAnchorEntityId: "spawn-extra",
        spawnSubjectOriginPositionMetersXYZ: [
          player.spawnSubjectOriginPositionMetersXYZ[0] + 4,
          player.spawnSubjectOriginPositionMetersXYZ[1],
          player.spawnSubjectOriginPositionMetersXYZ[2],
        ],
      },
    ],
  };
}

function createFlatTerrainCapabilitySpec() {
  const spec = createValidAuthoringSpec();
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

describe("capability package runtime smoke tests", () => {
  it("keeps Camera Director independent from controls and real-world subject categories", () => {
    expect(cameraDirectorSource).not.toMatch(
      /controlProfile|SubjectController|ExecutionSubjectV3|humanoid|vehicle|category\s*===/,
    );
  });

  it("loads the locked 25-clip G Bot package into a live Runtime", async () => {
    const subjectDefinitionRef =
      "worldkit://subject-definition/humanoid.g-bot@1";
    const loaded = await loadAuthoringScene(
      async () => new Response(JSON.stringify(createFlatTerrainCapabilitySpec())),
      { subjectDefinitionRef },
    );
    if (!loaded.ok || loaded.executionPlan === undefined) {
      throw new Error(
        `G Bot package failed to load: ${JSON.stringify(loaded.diagnostics)}`,
      );
    }
    const gBotAssetPart = loaded.executionPlan.subjects[0]?.visualParts.find(
      (part) => part.id === "body.asset",
    );
    expect(gBotAssetPart?.localTransform.rotationEulerRadiansXYZ[1]).toBeCloseTo(
      Math.PI,
      12,
    );
    expect(loaded.executionPlan.subjects[0]?.sockets.map((socket) => socket.id).sort())
      .toEqual([
        "CameraTarget3D",
        "FirstPersonView",
        "LookAhead",
        "SeatAlignment",
        "ThirdPersonTarget",
        "hand.right",
      ]);
    expect(loaded.executionPlan.subjects[0]?.capabilityAssembly).toBeDefined();
    const runtime = await BabylonWorldRuntime.create({
      executionPlan: loaded.executionPlan,
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
    try {
      const snapshot = await runtime.runFixedInput({
        actions: ["move-forward"],
        ticks: 30,
      });
      expect(snapshot.subjectStatesByEntityId.player).toMatchObject({
        activeMotionKernelRef: "worldkit://motion-kernel/free-ground@1",
        activeActionId: "walk",
      });
      expect(
        (await runtime.runFixedInput({ actions: ["aim"], ticks: 1 })).camera
          .activeCameraModifierRefs,
      ).toContain("worldkit://camera-modifier/aim-framing@1");
      expect(
        (await runtime.runFixedInput({ actions: ["move-forward", "run"], ticks: 1 }))
          .camera.activeCameraModifierRefs,
      ).toContain("worldkit://camera-modifier/sprint-emphasis@1");
      for (const [cameraProfileRef, cameraRigRef] of CAMERA_PROFILES) {
        const camera = runtime.requestCameraProfile(cameraProfileRef).camera;
        expect(camera).toMatchObject({
          activeCameraProfileRef: cameraProfileRef,
          activeCameraRigRef: cameraRigRef,
          safeFallbackActive: false,
        });
        expect(camera.positionMetersXYZ.every(Number.isFinite)).toBe(true);
      }
      runtime.requestCameraProfile("worldkit://camera-profile/first-person.standard@1");
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
      runtime.requestCameraProfile("worldkit://camera-profile/orbit.medium@1");
      const adjustedCamera = runtime.adjustCameraView({
        yawDeltaRadians: 0.5,
        pitchDeltaRadians: 0.2,
        zoomDeltaMeters: 1,
      }).camera;
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
      expect(runtime.resetCameraProfile().camera).not.toHaveProperty("preference");
      runtime.reset();
      runtime.requestCameraProfile("worldkit://camera-profile/orbit.medium@1");
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
      runtime.requestCameraProfile("worldkit://camera-profile/orbit.medium@1");
      const movingNormally = await runtime.runFixedInput({
        actions: ["move-forward"],
        ticks: 60,
      });
      runtime.reset();
      runtime.requestCameraProfile("worldkit://camera-profile/orbit.medium@1");
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
      runtime.requestCameraProfile("worldkit://camera-profile/orbit.medium@1");
      runtime.applyCameraPreview({
        tuningByProfileRef: {
          "worldkit://camera-profile/orbit.medium@1": { distanceMeters: 6 },
        },
      });
      expect(
        runtime.requestCameraProfile("worldkit://camera-profile/follow.medium@1")
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

      runtime.requestCameraProfile("worldkit://camera-profile/orbit.medium@1");
      const beforeTransition = runtime.snapshot().camera.positionMetersXYZ;
      const firstTransitionFrame = runtime.requestCameraProfile(
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
      expect(
        runtime.requestControlFeelProfile(
          "player",
          "worldkit://control-feel-profile/humanoid.heavy-ground@1",
        ),
      ).toBe(true);
      const slowAcceleration = await runtime.runFixedInput({
        actions: ["move-forward"],
        ticks: 6,
      });
      runtime.reset();
      expect(
        runtime.requestControlFeelProfile(
          "player",
          "worldkit://control-feel-profile/humanoid.medium-ground@1",
        ),
      ).toBe(true);
      const fastAcceleration = await runtime.runFixedInput({
        actions: ["move-forward"],
        ticks: 6,
      });
      expect(fastAcceleration.subjectStatesByEntityId.player!.speedMetersPerSecond)
        .toBeGreaterThan(
          slowAcceleration.subjectStatesByEntityId.player!.speedMetersPerSecond!,
        );

      runtime.reset();
      runtime.requestControlFeelProfile(
        "player",
        "worldkit://control-feel-profile/humanoid.heavy-ground@1",
      );
      const slowTurn = await runtime.runFixedInput({ actions: ["move-left"], ticks: 10 });
      runtime.reset();
      runtime.requestControlFeelProfile(
        "player",
        "worldkit://control-feel-profile/humanoid.medium-ground@1",
      );
      const fastTurn = await runtime.runFixedInput({ actions: ["move-left"], ticks: 10 });
      expect(Math.abs(fastTurn.subjectStatesByEntityId.player!.forwardXYZ![0]))
        .toBeGreaterThan(
          Math.abs(slowTurn.subjectStatesByEntityId.player!.forwardXYZ![0]),
        );
      expect(() => runtime.requestControlFeelProfile(
        "player",
        "worldkit://control-feel-profile/unknown.unlisted@1",
      )).toThrow(/^SUBJECT_OVERRIDE_FORBIDDEN/);

      runtime.reset();
      expect(runtime).not.toHaveProperty("setControlFeelTuning");
      expect(runtime).not.toHaveProperty("getControlFeelTuning");
      expect(runtime).not.toHaveProperty("setControlTuning");
      expect(runtime).not.toHaveProperty("getControlTuning");
      expect(runtime.snapshot().subjectStatesByEntityId.player)
        .not.toHaveProperty("controlFeelParameterTuning");
      expect(runtime.snapshot().subjectStatesByEntityId.player)
        .not.toHaveProperty("controlParameterTuning");

      const capabilityAssembly = loaded.executionPlan.subjects[0]!.capabilityAssembly!;
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
          loaded.executionPlan.subjects[0]!.subjectDefinitionHash,
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
          loaded.executionPlan.subjects[0]!.subjectDefinitionHash,
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
      const committedPreset = runtime.applySubjectPresetTuning({
        subjectEntityId: "player",
        expectedSubjectDefinitionRef: subjectDefinitionRef,
        expectedSubjectDefinitionContentHash:
          loaded.executionPlan.subjects[0]!.subjectDefinitionHash,
        selectedMotionProfileRef: defaultMotionProfileRef,
        selectedControlFeelProfileRef:
          "worldkit://control-feel-profile/humanoid.heavy-ground@1",
        selectedControlProfileRef: controlProfile.resourceRef,
      });
      expect(committedPreset.status).toBe("committed");
      expect(committedPreset.snapshot.camera).not.toHaveProperty("tuning");
      expect(committedPreset.snapshot.camera).not.toHaveProperty("preference");
      expect(committedPreset.snapshot.subjectStatesByEntityId.player)
        .toMatchObject({
          activeControlFeelProfileRef:
            "worldkit://control-feel-profile/humanoid.medium-ground@1",
          activePhysicsBodyProfileRef:
            "worldkit://physics-body-profile/character.capability-medium@1",
        });
      const afterFeelTick = await runtime.runFixedInput({ actions: [], ticks: 1 });
      expect(afterFeelTick.subjectStatesByEntityId.player)
        .toMatchObject({
          activeControlFeelProfileRef:
            "worldkit://control-feel-profile/humanoid.heavy-ground@1",
          activePhysicsBodyProfileRef:
            "worldkit://physics-body-profile/character.capability-medium@1",
        });
      expect(committedPreset.snapshot.subjectStatesByEntityId.player)
        .not.toHaveProperty("controlFeelParameterTuning");
      expect(committedPreset.snapshot.subjectStatesByEntityId.player)
        .not.toHaveProperty("controlParameterTuning");
      expect((await runtime.runHarness("player")).passed).toBe(true);
    } finally {
      await runtime.dispose();
    }
  }, 15_000);

  it.each(UNAVAILABLE_RELATIONSHIP_PACKAGES)(
    "loads %s through an explicit motion-only Playground preview",
    async (subjectDefinitionRef, capabilityRef, _motionKernelRef, previewDefinitionRef) => {
      const loaded = await loadAuthoringScene(
        async () => new Response(JSON.stringify(createFlatTerrainCapabilitySpec())),
        { subjectDefinitionRef },
      );

      expect(loaded.ok).toBe(true);
      expect(loaded.diagnostics).toEqual([]);
      expect(loaded.executionPlan?.subjects[0]?.subjectDefinitionRef)
        .toBe(previewDefinitionRef);
      expect(loaded.executionPlan?.subjects[0]?.capabilityAssembly?.relationshipProfiles)
        .toEqual([]);
      expect(loaded.hostOverlay?.changes).toContainEqual({
        type: "relationship-capabilities-deferred",
        sourceSubjectDefinitionRef: subjectDefinitionRef,
        runtimeSubjectDefinitionRef: previewDefinitionRef,
        deferredCapabilityRefs: [capabilityRef],
      });
    },
  );

  it.each(UNAVAILABLE_RELATIONSHIP_PACKAGES)(
    "executes implemented Kernel for %s through the Playground preview Definition",
    async (subjectDefinitionRef, _capabilityRef, motionKernelRef) => {
      const loaded = await loadAuthoringScene(
        async () => new Response(JSON.stringify(createFlatTerrainCapabilitySpec())),
        { subjectDefinitionRef },
      );
      if (!loaded.ok || loaded.executionPlan === undefined) {
        throw new Error(`Playground preview failed: ${JSON.stringify(loaded.diagnostics)}`);
      }
      const executionPlan = loaded.executionPlan;
      const assembly = executionPlan.subjects[0]?.capabilityAssembly;
      expect(assembly?.relationshipProfiles).toEqual([]);
      const lockedMotionKernelRef = assembly?.defaultMotionProfile.motionKernelRef;
      expect(assembly?.motionKernels).toContainEqual(expect.objectContaining({
        resourceRef: lockedMotionKernelRef,
      }));
      expect(
        builtInSubjectResourceRegistry.resolveMotionKernel(
          lockedMotionKernelRef ?? "",
        )?.runtimeStatus,
      ).toBe("implemented");
      const runtime = await BabylonWorldRuntime.create({
        executionPlan,
        havokWasmBinary,
        engineFactory: () =>
          new NullEngine({
            renderWidth: 640,
            renderHeight: 360,
            textureSize: 512,
            deterministicLockstep: true,
            lockstepMaxSteps: 4,
          }),
      });
      try {
        const snapshot = await runtime.runFixedInput({
          actions: ["move-forward"],
          ticks: 30,
        });
        const state = snapshot.subjectStatesByEntityId.player!;
        const harness = await runtime.runHarness("player");
        expect(state.activeMotionKernelRef).toBe(lockedMotionKernelRef);
        expect([
          ...state.positionMetersXYZ,
          ...state.velocityMetersPerSecondXYZ,
        ].every(Number.isFinite)).toBe(true);
        expect(snapshot.camera.positionMetersXYZ.every(Number.isFinite)).toBe(true);
        expect(harness.passed).toBe(true);
        expect(harness.checks).toHaveLength(9);

        if (lockedMotionKernelRef === "worldkit://motion-kernel/wheeled-arcade@1") {
          runtime.reset();
          const stationaryTurn = await runtime.runFixedInput({
            actions: ["move-left"],
            ticks: 120,
          });
          expect(Math.abs(stationaryTurn.subjectStatesByEntityId.player!.forwardXYZ![0]))
            .toBeLessThan(Math.sin((0.5 * Math.PI) / 180));

          runtime.reset();
          const defaultQuarterSecondTurn = await runtime.runFixedInput({
            actions: ["move-forward", "move-left"],
            ticks: 15,
          });
          const defaultForward = defaultQuarterSecondTurn
            .subjectStatesByEntityId.player!.forwardXYZ!;
          expect(Math.acos(Math.max(-1, Math.min(1, -defaultForward[2]))))
            .toBeLessThan((8 * Math.PI) / 180);

          const afterSteeringRelease = await runtime.runFixedInput({
            actions: ["move-forward"],
            ticks: 15,
          });
          const afterSecondReleaseWindow = await runtime.runFixedInput({
            actions: ["move-forward"],
            ticks: 15,
          });
          const releasedForward = afterSteeringRelease.subjectStatesByEntityId.player!.forwardXYZ!;
          const settledForward = afterSecondReleaseWindow.subjectStatesByEntityId.player!.forwardXYZ!;
          expect(Math.acos(Math.max(-1, Math.min(1,
            releasedForward[0] * settledForward[0] + releasedForward[2] * settledForward[2],
          )))).toBeLessThan(0.005);

          runtime.reset();
          expect(() => runtime.requestControlFeelProfile(
            "player",
            "worldkit://control-feel-profile/unknown.unlisted@1",
          )).toThrow(/^SUBJECT_OVERRIDE_FORBIDDEN/);

          runtime.reset();
          runtime.requestCameraProfile("worldkit://camera-profile/chase.surface-fast@1");
          const reversing = await runtime.runFixedInput({
            actions: ["move-backward"],
            ticks: 90,
          });
          const reversingState = reversing.subjectStatesByEntityId.player!;
          expect(reversing.camera.activeCameraModifierRefs).toContain(
            "worldkit://camera-modifier/reverse-stability@1",
          );
          const reverseOffsetX = reversing.camera.positionMetersXYZ[0] -
            reversingState.positionMetersXYZ[0];
          const reverseOffsetZ = reversing.camera.positionMetersXYZ[2] -
            reversingState.positionMetersXYZ[2];
          const reverseOffsetLength = Math.hypot(reverseOffsetX, reverseOffsetZ);
          expect(
            (reverseOffsetX * reversingState.forwardXYZ![0] +
              reverseOffsetZ * reversingState.forwardXYZ![2]) /
              reverseOffsetLength,
          ).toBeLessThan(-0.8);

          const cameraPositionAfterTurn = async (
            minimumHeadingSpeedMetersPerSecond: number,
          ) => {
            runtime.reset();
            runtime.requestCameraProfile("worldkit://camera-profile/chase.surface-fast@1");
            runtime.applyCameraPreview({
              tuningByProfileRef: {
                "worldkit://camera-profile/chase.surface-fast@1": {
                  minimumHeadingSpeedMetersPerSecond,
                  velocityHeadingDampingPerSecond: 40,
                  yawDampingPerSecond: 40,
                  transitionSeconds: 0,
                },
              },
            });
            return (await runtime.runFixedInput({
              actions: ["move-forward", "move-left"],
              ticks: 90,
            })).camera.positionMetersXYZ;
          };
          const velocityHeadingCamera = await cameraPositionAfterTurn(0);
          const stableHeadingCamera = await cameraPositionAfterTurn(20);
          expect(Math.hypot(
            velocityHeadingCamera[0] - stableHeadingCamera[0],
            velocityHeadingCamera[2] - stableHeadingCamera[2],
          )).toBeGreaterThan(1);

          const cameraDistanceAfterRun = async (maximumPositionLagMeters: number) => {
            runtime.reset();
            runtime.requestCameraProfile("worldkit://camera-profile/chase.surface-fast@1");
            runtime.applyCameraPreview({
              tuningByProfileRef: {
                "worldkit://camera-profile/chase.surface-fast@1": {
                  positionDampingPerSecond: 0,
                  maximumPositionLagMeters,
                  lookAheadSeconds: 0,
                },
              },
            });
            const after = await runtime.runFixedInput({
              actions: ["move-forward"],
              ticks: 90,
            });
            const afterState = after.subjectStatesByEntityId.player!;
            return Math.hypot(
              after.camera.positionMetersXYZ[0] - afterState.positionMetersXYZ[0],
              after.camera.positionMetersXYZ[2] - afterState.positionMetersXYZ[2],
            );
          };
          expect(await cameraDistanceAfterRun(20)).toBeGreaterThan(
            (await cameraDistanceAfterRun(0)) + 2,
          );
        }
        if (lockedMotionKernelRef === "worldkit://motion-kernel/water-surface@1") {
          runtime.reset();
          runtime.requestCameraProfile(
            "worldkit://camera-profile/follow.medium@1",
          );
          await runtime.runFixedInput({
            actions: ["move-forward", "move-left"],
            ticks: 60,
          });
          const turned = await runtime.runFixedInput({ actions: [], ticks: 120 });
          const turnedState = turned.subjectStatesByEntityId.player!;
          expect(turned.camera.activeCameraModifierRefs).toContain(
            "worldkit://camera-modifier/water-stability@1",
          );
          const offsetX = turned.camera.positionMetersXYZ[0] - turnedState.positionMetersXYZ[0];
          const offsetZ = turned.camera.positionMetersXYZ[2] - turnedState.positionMetersXYZ[2];
          const offsetLength = Math.hypot(offsetX, offsetZ);
          expect(
            (offsetX * turnedState.forwardXYZ![0] +
              offsetZ * turnedState.forwardXYZ![2]) / offsetLength,
          ).toBeLessThan(-0.85);
        }
        if (lockedMotionKernelRef === "worldkit://motion-kernel/unpowered-glide@1") {
          runtime.reset();
          const stableGlide = await runtime.runFixedInput({ actions: [], ticks: 300 });
          expect(stableGlide.subjectStatesByEntityId.player!.velocityMetersPerSecondXYZ[1])
            .toBeGreaterThanOrEqual(-6.01);
          expect(stableGlide.subjectStatesByEntityId.player!.velocityMetersPerSecondXYZ[1])
            .toBeLessThanOrEqual(1.51);

          runtime.reset();
          const climb = await runtime.runFixedInput({
            actions: ["move-backward"],
            ticks: 90,
          });
          runtime.reset();
          const dive = await runtime.runFixedInput({
            actions: ["move-forward"],
            ticks: 90,
          });
          expect(climb.subjectStatesByEntityId.player!.velocityMetersPerSecondXYZ[1])
            .toBeGreaterThan(
              dive.subjectStatesByEntityId.player!.velocityMetersPerSecondXYZ[1],
            );

          runtime.reset();
          const steered = await runtime.runFixedInput({
            actions: ["move-left"],
            ticks: 60,
          });
          expect(Math.abs(steered.subjectStatesByEntityId.player!.forwardXYZ![0]))
            .toBeGreaterThan(0.5);
          expect(() => runtime.requestControlFeelProfile(
            "player",
            "worldkit://control-feel-profile/unknown.unlisted@1",
          )).toThrow(/^SUBJECT_OVERRIDE_FORBIDDEN/);
        }
      } finally {
        await runtime.dispose();
      }
    },
  );

  it("keeps the capability camera frozen across render-only paused frames", async () => {
    const loaded = await loadAuthoringScene(
      async () => new Response(JSON.stringify(createFlatTerrainCapabilitySpec())),
      {
        subjectDefinitionRef:
          "worldkit://subject-definition/humanoid.g-bot@1",
      },
    );
    if (!loaded.ok || isNil(loaded.executionPlan)) {
      throw new Error(
        `Capability package failed to load: ${JSON.stringify(loaded.diagnostics)}`,
      );
    }
    const runtime = await BabylonWorldRuntime.create({
      executionPlan: loaded.executionPlan,
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
    try {
      runtime.requestCameraProfile("worldkit://camera-profile/orbit.medium@1");
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
    const loaded = await loadAuthoringScene(
      async () => new Response(JSON.stringify(createFlatTerrainCapabilitySpec())),
      { subjectDefinitionRef: "worldkit://subject-definition/humanoid.g-bot@1" },
    );
    if (!loaded.ok || loaded.executionPlan === undefined) {
      throw new Error(
        `Capability package failed to load: ${JSON.stringify(loaded.diagnostics)}`,
      );
    }
    const executionPlan = {
      ...structuredClone(loaded.executionPlan),
      waters: [],
    };
    const controlledSubject = executionPlan.subjects.find(
      (subject) => subject.entityId === executionPlan.controlledEntityId,
    );
    if (controlledSubject === undefined) throw new Error("Controlled Subject missing.");
    controlledSubject.spawnSubjectOriginPositionMetersXYZ = [0, 8, 30];
    const runtime = await BabylonWorldRuntime.create({
      executionPlan,
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

  it("executes a switched Profile from its locked Kernel descriptor instead of parsing its Ref", async () => {
    const loaded = await loadAuthoringScene(
      async () => new Response(JSON.stringify(createFlatTerrainCapabilitySpec())),
      {
        subjectDefinitionRef:
          "worldkit://subject-definition/humanoid.g-bot@1",
      },
    );
    if (!loaded.ok || loaded.executionPlan === undefined) {
      throw new Error(`Capability package failed: ${JSON.stringify(loaded.diagnostics)}`);
    }
    const executionPlan = structuredClone(loaded.executionPlan);
    const subject = executionPlan.subjects[0]!;
    const assembly = subject.capabilityAssembly!;
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

    const runtime = await BabylonWorldRuntime.create({
      executionPlan,
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
    try {
      const initialZ = runtime.snapshot().subjectStatesByEntityId.player!.positionMetersXYZ[2];
      expect(runtime.requestMotionProfile("player", optionalProfile.resourceRef)).toBe(true);
      const moved = await runtime.runFixedInput({
        actions: ["move-forward"],
        ticks: 60,
      });
      expect(moved.subjectStatesByEntityId.player?.activeMotionKernelRef).toBe(
        aliasedKernelRef,
      );
      expect(
        Math.abs(moved.subjectStatesByEntityId.player!.positionMetersXYZ[2] - initialZ),
      ).toBeGreaterThan(0.1);
    } finally {
      await runtime.dispose();
    }
  });

  it("fires one free-ground jump until the held action is released", async () => {
    const loaded = await loadAuthoringScene(
      async () => new Response(JSON.stringify(createFlatTerrainCapabilitySpec())),
      {
        subjectDefinitionRef:
          "worldkit://subject-definition/humanoid.g-bot@1",
      },
    );
    if (!loaded.ok || loaded.executionPlan === undefined) {
      throw new Error(`Capability package failed: ${JSON.stringify(loaded.diagnostics)}`);
    }
    const runtime = await BabylonWorldRuntime.create({
      executionPlan: loaded.executionPlan,
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

  it("commits Control Feel on the next tick, keeps authoring selection across reset, and forbids extra-subject Camera overrides", async () => {
    const loaded = await loadAuthoringScene(
      async () => new Response(JSON.stringify(createFlatTerrainCapabilitySpec())),
      { subjectDefinitionRef: "worldkit://subject-definition/humanoid.g-bot@1" },
    );
    if (
      !loaded.ok ||
      loaded.executionPlan === undefined ||
      loaded.executionPlan.schemaVersion !== 4
    ) {
      throw new Error(
        `G Bot package failed to load: ${JSON.stringify(loaded.diagnostics)}`,
      );
    }
    const executionPlan = withExtraCapabilitySubject(loaded.executionPlan);
    const playerSubject = executionPlan.subjects[0]!;
    const extraSubject = executionPlan.subjects[1]!;
    const capabilityAssembly = playerSubject.capabilityAssembly!;
    const orbitProfile = capabilityAssembly.cameraContext.cameraRigProfiles.find(
      (profile) => profile.resourceRef === "worldkit://camera-profile/orbit.medium@1",
    )!;
    const runtime = await BabylonWorldRuntime.create({
      executionPlan,
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
    try {
      await runtime.runFixedInput({ actions: [], ticks: 8 });
      const beforeRequest = runtime.snapshot();
      const beforePlayer = beforeRequest.subjectStatesByEntityId.player!;
      expect(beforePlayer.activeControlFeelProfileRef).toBe(MEDIUM_FEEL_REF);

      expect(runtime.requestControlFeelProfile("player", HEAVY_FEEL_REF)).toBe(true);
      const queued = runtime.snapshot();
      expect(queued.tick).toBe(beforeRequest.tick);
      expect(queued.subjectStatesByEntityId.player).toMatchObject({
        activeControlFeelProfileRef: MEDIUM_FEEL_REF,
        locomotionMode: beforePlayer.locomotionMode,
        positionMetersXYZ: beforePlayer.positionMetersXYZ,
      });

      expect(runtime.requestControlFeelProfile("player", MEDIUM_FEEL_REF)).toBe(true);
      expect(runtime.requestControlFeelProfile("player", HEAVY_FEEL_REF)).toBe(true);
      const afterTick = await runtime.runFixedInput({ actions: [], ticks: 1 });
      expect(afterTick.subjectStatesByEntityId.player!.activeControlFeelProfileRef)
        .toBe(HEAVY_FEEL_REF);

      runtime.requestCameraProfile(orbitProfile.resourceRef);
      const orbitPreview = runtime.applyCameraPreview({
        tuningByProfileRef: { [orbitProfile.resourceRef]: { targetHeightMeters: 1.4 } },
      });
      expect(orbitPreview.tuningByProfileRef[orbitProfile.resourceRef])
        .toEqual({ targetHeightMeters: 1.4 });
      runtime.reset();
      const afterReset = runtime.snapshot();
      expect(afterReset.subjectStatesByEntityId.player!.activeControlFeelProfileRef)
        .toBe(HEAVY_FEEL_REF);
      expect(afterReset.camera).not.toHaveProperty("tuning");
      expect(runtime.getCameraPreviewState().tuningByProfileRef[orbitProfile.resourceRef])
        .toEqual({ targetHeightMeters: 1.4 });

      expect(runtime.requestControlFeelProfile("extra", HEAVY_FEEL_REF)).toBe(true);
      const extraAfterTick = await runtime.runFixedInput({ actions: [], ticks: 1 });
      expect(extraAfterTick.subjectStatesByEntityId.extra!.activeControlFeelProfileRef)
        .toBe(HEAVY_FEEL_REF);
      expect(extraAfterTick.camera).not.toHaveProperty("tuning");
    } finally {
      await runtime.dispose();
    }
  }, 15_000);

  it("rejects Camera writes from the previous owner after bindControl rebind", async () => {
    const loaded = await loadAuthoringScene(
      async () => new Response(JSON.stringify(createFlatTerrainCapabilitySpec())),
      { subjectDefinitionRef: "worldkit://subject-definition/humanoid.g-bot@1" },
    );
    if (
      !loaded.ok ||
      loaded.executionPlan === undefined ||
      loaded.executionPlan.schemaVersion !== 4
    ) {
      throw new Error(
        `G Bot package failed to load: ${JSON.stringify(loaded.diagnostics)}`,
      );
    }
    const executionPlan = withExtraCapabilitySubject(loaded.executionPlan);
    const playerSubject = executionPlan.subjects[0]!;
    const extraSubject = executionPlan.subjects[1]!;
    const capabilityAssembly = playerSubject.capabilityAssembly!;
    const orbitProfile = capabilityAssembly.cameraContext.cameraRigProfiles.find(
      (profile) => profile.resourceRef === "worldkit://camera-profile/orbit.medium@1",
    )!;
    const runtime = await BabylonWorldRuntime.create({
      executionPlan,
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
    try {
      await runtime.runFixedInput({ actions: [], ticks: 4 });
      runtime.requestCameraProfile(orbitProfile.resourceRef);
      const orbitPreview = runtime.applyCameraPreview({
        tuningByProfileRef: { [orbitProfile.resourceRef]: { targetHeightMeters: 1.4 } },
      });
      expect(orbitPreview.tuningByProfileRef[orbitProfile.resourceRef])
        .toEqual({ targetHeightMeters: 1.4 });

      const rebound = runtime.bindControl({
        controllerId: TRUSTED_DEFAULT_CONTROLLER_ID,
        expectedControlledEntityId: "player",
        controlledEntityId: extraSubject.entityId,
      });
      expect(rebound.status).toBe("committed");
      expect(runtime.snapshot().camera.targetEntityId).toBe(extraSubject.entityId);
      expect(runtime.snapshot().camera).not.toHaveProperty("tuning");
    } finally {
      await runtime.dispose();
    }
  }, 15_000);

  it("zeros locomotion intent when safe-ground fallback is active even if move is held", async () => {
    const loaded = await loadAuthoringScene(
      async () => new Response(JSON.stringify(createFlatTerrainCapabilitySpec())),
      { subjectDefinitionRef: "worldkit://subject-definition/humanoid.g-bot@1" },
    );
    if (!loaded.ok || loaded.executionPlan === undefined) {
      throw new Error(
        `G Bot package failed to load: ${JSON.stringify(loaded.diagnostics)}`,
      );
    }
    const runtime = await BabylonWorldRuntime.create({
      executionPlan: loaded.executionPlan,
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
    try {
      const moving = await runtime.runFixedInput({
        actions: ["move-forward"],
        ticks: 45,
      });
      const movingPlayer = moving.subjectStatesByEntityId.player!;
      expect(movingPlayer.speedMetersPerSecond ?? 0).toBeGreaterThan(0.4);
      const movingZ = movingPlayer.positionMetersXYZ[2];

      expect(runtime.requestMotionProfile(
        "player",
        "worldkit://motion-profile/safe-ground@1",
      )).toBe(true);
      const stopped = await runtime.runFixedInput({
        actions: ["move-forward", "jump"],
        ticks: 90,
      });
      const stoppedPlayer = stopped.subjectStatesByEntityId.player!;
      expect(stoppedPlayer.safeFallbackActive).toBe(true);
      expect(stoppedPlayer.activeMotionProfileRef).toBe(
        "worldkit://motion-profile/safe-ground@1",
      );
      expect(stoppedPlayer.speedMetersPerSecond ?? 1).toBeLessThan(0.05);
      expect(Math.abs(stoppedPlayer.positionMetersXYZ[2] - movingZ)).toBeLessThan(0.35);
    } finally {
      await runtime.dispose();
    }
  }, 15_000);
});
