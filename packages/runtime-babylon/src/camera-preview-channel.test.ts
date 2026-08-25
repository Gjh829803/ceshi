import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

import { NullEngine } from "@babylonjs/core/Engines/nullEngine.pure.js";
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

async function createCameraPreviewChannelRuntime() {
  const subjectDefinitionRef = "worldkit://subject-definition/humanoid.g-bot@2";
  const spec = createFlatTerrainCapabilitySpec();
  const subject = spec.nodes.find((node) => node.kind === "subject");
  if (subject?.kind !== "subject") {
    throw new Error("Camera preview fixture Subject is missing.");
  }
  subject.subjectDefinitionRef = subjectDefinitionRef;
  const executionPlan = compileRuntimeTestPlanV5(spec, {
    subjectResourceRegistry: builtInSubjectResourceRegistry,
  });
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

describe("camera preview channel stays out of Gameplay truth", () => {
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
      firstRuntime.requestCameraProfile(ORBIT_REF);
      secondRuntime.requestCameraProfile(ORBIT_REF);
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
        runtime.requestCameraProfile(ORBIT_REF);
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
      runtime.requestCameraProfile(ORBIT_REF);
      const withoutPreview = await runtime.runFixedInput({
        actions: ["move-forward"],
        ticks: 30,
      });
      runtime.reset();
      await bindRuntimeTestPossession(runtime, "player");
      runtime.requestCameraProfile(ORBIT_REF);
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
      runtime.requestCameraProfile(FOLLOW_REF);
      const reset = runtime.reset();
      expect(reset.possessionTarget).toEqual({ mode: "unbound" });
      expect(runtime.getCameraPreviewState().tuningByProfileRef).toEqual({});
      await bindRuntimeTestPossession(runtime, "player");
      const afterRebindTick = await runtime.runFixedInput({ actions: [], ticks: 1 });
      expect(afterRebindTick.camera.activeCameraProfileRef).toBe(
        automaticProfileRef,
      );
      runtime.requestCameraProfile(ORBIT_REF);
      expect(runtime.getCameraPreviewState().tuningByProfileRef[ORBIT_REF])
        .toBeUndefined();
      const switched = runtime.requestCameraProfile(FOLLOW_REF);
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
      runtime.requestCameraProfile(ORBIT_REF);
      runtime.adjustCameraView({ yawDeltaRadians: 1 });
      const withoutPreview = await runtime.runFixedInput({
        actions: ["move-forward"],
        ticks: 30,
      });

      runtime.reset();
      await bindRuntimeTestPossession(runtime, "player");
      runtime.requestCameraProfile(ORBIT_REF);
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

  it("requestCameraProfile rejects unreachable refs without mutating the active Profile", async () => {
    const runtime = await createCameraPreviewChannelRuntime();
    try {
      await runtime.runFixedInput({ actions: [], ticks: 4 });
      runtime.requestCameraProfile(ORBIT_REF);
      const stableRef = runtime.snapshot().camera.activeCameraProfileRef;

      expect(() => runtime.requestCameraProfile("not-a-ref")).toThrow(RangeError);
      expect(() =>
        runtime.requestCameraProfile("worldkit://camera-profile/does-not-exist@1"),
      ).toThrow(RangeError);
      // Legacy free strings are no longer accepted by the production path.
      expect(() => runtime.requestCameraProfile("auto")).toThrow(RangeError);
      expect(() => runtime.requestCameraProfile("first-person")).toThrow(RangeError);
      expect(() => runtime.requestCameraProfile("")).toThrow(RangeError);
      expect(() => runtime.requestCameraProfile("   ")).toThrow(RangeError);
      expect(runtime.snapshot().camera.activeCameraProfileRef).toBe(stableRef);

      // Reset returns the Camera Context default deterministically.
      const firstDefault = runtime.resetCameraProfile().camera.activeCameraProfileRef;
      runtime.requestCameraProfile(FOLLOW_REF);
      const secondDefault = runtime.resetCameraProfile().camera.activeCameraProfileRef;
      expect(secondDefault).toBe(firstDefault);
    } finally {
      await runtime.dispose();
    }
  });

  it("applyCameraPreview rejects malformed requests atomically and stably", async () => {
    const runtime = await createCameraPreviewChannelRuntime();
    try {
      await runtime.runFixedInput({ actions: [], ticks: 4 });
      runtime.requestCameraProfile(ORBIT_REF);
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
      runtime.requestCameraProfile(ORBIT_REF);
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
});
