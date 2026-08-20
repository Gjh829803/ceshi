import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

import { NullEngine } from "@babylonjs/core/Engines/nullEngine.pure.js";
import { isNil } from "lodash-es";
import { describe, expect, it } from "vitest";

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

const WHITEBOX_PACKAGES = [
  [
    "worldkit://subject-definition/animal.quadruped.forward-steer@1",
    "worldkit://motion-kernel/forward-steer@1",
  ],
  [
    "worldkit://subject-definition/vehicle.four-wheel.arcade@1",
    "worldkit://motion-kernel/wheeled-arcade@1",
  ],
  [
    "worldkit://subject-definition/surface-craft.ice-skimmer@1",
    "worldkit://motion-kernel/surface-slide@1",
  ],
  [
    "worldkit://subject-definition/watercraft.kayak.surface@1",
    "worldkit://motion-kernel/water-surface@1",
  ],
  [
    "worldkit://subject-definition/glider.paraglider.unpowered@1",
    "worldkit://motion-kernel/unpowered-glide@1",
  ],
] as const;

const NON_FLIGHT_WHITEBOX_PACKAGES = WHITEBOX_PACKAGES.filter(
  ([, motionKernelRef]) => !motionKernelRef.includes("unpowered-glide"),
);

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
    "worldkit://camera-profile/follow.water-surface@1",
    "worldkit://camera-rig/orbit-follow@1",
  ],
  [
    "worldkit://camera-profile/flight.glide@1",
    "worldkit://camera-rig/flight-horizon@1",
  ],
  [
    "worldkit://camera-profile/follow.mounted@1",
    "worldkit://camera-rig/orbit-follow@1",
  ],
] as const;

describe("capability package runtime smoke tests", () => {
  it("loads the locked 25-clip G Bot package into a live Runtime", async () => {
    const subjectDefinitionRef =
      "worldkit://subject-definition/humanoid.g-bot.ground@1";
    const loaded = await loadAuthoringScene(
      async () => new Response(JSON.stringify(createValidAuthoringSpec())),
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
      for (const [cameraProfileRef, cameraRigRef] of CAMERA_PROFILES) {
        const camera = runtime.setCameraPreference(cameraProfileRef).camera;
        expect(camera).toMatchObject({
          activeCameraProfileRef: cameraProfileRef,
          activeCameraRigRef: cameraRigRef,
          preference: cameraProfileRef,
          safeFallbackActive: false,
        });
        expect(camera.positionMetersXYZ.every(Number.isFinite)).toBe(true);
      }
      runtime.setCameraPreference("worldkit://camera-profile/orbit.medium@1");
      const adjustedCamera = runtime.adjustCameraView({
        yawDeltaRadians: 0.5,
        pitchDeltaRadians: 0.2,
        zoomDeltaMeters: 1,
      }).camera;
      expect(adjustedCamera.viewYawOffsetRadians).toBeGreaterThan(0);
      expect(adjustedCamera.viewPitchOffsetRadians).toBeGreaterThan(0);
      expect(adjustedCamera.viewDistanceOffsetMeters).toBeGreaterThan(0);
      expect(runtime.setCameraTuning({
        distanceMeters: 6,
        rotationDampingPerSecond: 18,
        lookAheadSeconds: 0.4,
      }).camera.tuning).toEqual({
        distanceMeters: 6,
        rotationDampingPerSecond: 18,
        lookAheadSeconds: 0.4,
      });
      runtime.resetCameraView();
      expect(runtime.setCameraPreference("auto").camera.preference).toBe("auto");
      runtime.reset();
      runtime.setCameraPreference("worldkit://camera-profile/orbit.medium@1");
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
      expect((await runtime.runHarness("player")).passed).toBe(true);
    } finally {
      await runtime.dispose();
    }
  }, 15_000);

  it.each(WHITEBOX_PACKAGES)(
    "runs %s through its committed Kernel, Camera Director and H01-H09 harness",
    async (subjectDefinitionRef, motionKernelRef) => {
      const loaded = await loadAuthoringScene(
        async () => new Response(JSON.stringify(createValidAuthoringSpec())),
        { subjectDefinitionRef },
      );
      if (!loaded.ok || loaded.executionPlan === undefined) {
        throw new Error(
          `Capability package failed to load: ${JSON.stringify(loaded.diagnostics)}`,
        );
      }
      const runtime = await BabylonWorldRuntime.create({
        executionPlan: loaded.executionPlan,
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

        expect(state.activeMotionKernelRef).toBe(motionKernelRef);
        expect(
          [...state.positionMetersXYZ, ...state.velocityMetersPerSecondXYZ].every(
            Number.isFinite,
          ),
        ).toBe(true);
        expect(snapshot.camera.positionMetersXYZ.every(Number.isFinite)).toBe(true);
        expect(harness.passed).toBe(true);
        expect(harness.checks).toHaveLength(9);
        if (subjectDefinitionRef.includes("vehicle.four-wheel")) {
          runtime.reset();
          expect(runtime.setMotionTuning("player", {
            lowSpeedTurnRateRadiansPerSecond: 0.2,
            highSpeedTurnRateRadiansPerSecond: 0.1,
          }).subjectStatesByEntityId.player?.motionParameterTuning).toEqual({
            lowSpeedTurnRateRadiansPerSecond: 0.2,
            highSpeedTurnRateRadiansPerSecond: 0.1,
          });
          const gentleTurn = await runtime.runFixedInput({
            actions: ["move-forward", "move-left"],
            ticks: 15,
          });
          runtime.reset();
          runtime.setMotionTuning("player", {
            lowSpeedTurnRateRadiansPerSecond: 5,
            highSpeedTurnRateRadiansPerSecond: 2,
          });
          const sharpTurn = await runtime.runFixedInput({
            actions: ["move-forward", "move-left"],
            ticks: 15,
          });
          expect(Math.abs(sharpTurn.subjectStatesByEntityId.player!.forwardXYZ![0]))
            .toBeGreaterThan(
              Math.abs(gentleTurn.subjectStatesByEntityId.player!.forwardXYZ![0]),
            );
          expect(() => runtime.setMotionTuning("player", {
            lowSpeedTurnRateRadiansPerSecond: 99,
          })).toThrow(RangeError);
        }
      } finally {
        await runtime.dispose();
      }
    },
  );

  it("keeps the capability camera frozen across render-only paused frames", async () => {
    const loaded = await loadAuthoringScene(
      async () => new Response(JSON.stringify(createValidAuthoringSpec())),
      {
        subjectDefinitionRef:
          "worldkit://subject-definition/animal.quadruped.forward-steer@1",
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
      runtime.setCameraPreference("worldkit://camera-profile/orbit.medium@1");
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

  it.each(NON_FLIGHT_WHITEBOX_PACKAGES)(
    "applies unsupported gravity to %s instead of hovering",
    async (subjectDefinitionRef) => {
      const loaded = await loadAuthoringScene(
        async () => new Response(JSON.stringify(createValidAuthoringSpec())),
        { subjectDefinitionRef },
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
    },
  );

  it("executes a switched Profile from its locked Kernel descriptor instead of parsing its Ref", async () => {
    const loaded = await loadAuthoringScene(
      async () => new Response(JSON.stringify(createValidAuthoringSpec())),
      {
        subjectDefinitionRef:
          "worldkit://subject-definition/vehicle.four-wheel.arcade@1",
      },
    );
    if (!loaded.ok || loaded.executionPlan === undefined) {
      throw new Error(`Capability package failed: ${JSON.stringify(loaded.diagnostics)}`);
    }
    const executionPlan = structuredClone(loaded.executionPlan);
    const subject = executionPlan.subjects[0]!;
    const assembly = subject.capabilityAssembly!;
    const originalKernelRef = "worldkit://motion-kernel/forward-steer@1";
    const aliasedKernelRef = "worldkit://motion-kernel/custom-steering-implementation@1";
    const optionalProfile = assembly.optionalMotionProfiles.find(
      (profile) => profile.motionKernelRef === originalKernelRef,
    )!;
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
      ).toBeGreaterThan(0.5);
    } finally {
      await runtime.dispose();
    }
  });

  it("fires one forward-steer jump until the held action is released", async () => {
    const loaded = await loadAuthoringScene(
      async () => new Response(JSON.stringify(createValidAuthoringSpec())),
      {
        subjectDefinitionRef:
          "worldkit://subject-definition/animal.quadruped.forward-steer@1",
      },
    );
    if (!loaded.ok || loaded.executionPlan === undefined) {
      throw new Error(`Capability package failed: ${JSON.stringify(loaded.diagnostics)}`);
    }
    const runtime = await BabylonWorldRuntime.create({
      executionPlan: loaded.executionPlan,
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
});
