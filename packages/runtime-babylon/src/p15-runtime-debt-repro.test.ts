import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

import { NullEngine } from "@babylonjs/core/Engines/nullEngine.pure.js";
import { describe, expect, it } from "vitest";

import { createValidPackageSubjectWorldV4 } from "@whitebox-world/authoring/testing";
import type { CanonicalSceneExecutionPlanV1 } from "@whitebox-world/runtime-contracts";

import { BabylonWorldRuntime } from "./babylon-world-runtime";
import { bindRuntimeTestPossession } from "./runtime-test-possession";
import type { BabylonRuntimeProjectionV1 } from "./runtime-projection";
import {
  compileRuntimeTestScenePlanV1,
  createRuntimeTestWorldVariantV1,
  runtimeTestSubjectsForPlanV1,
  runtimeTestWorldArtifactsForPlanV1,
  runtimeTestWorldInputForPlanV1,
} from "./runtime-test-plan";

const kernelSource = readFileSync(
  new URL("./motion-kernel-runtime.ts", import.meta.url),
  "utf8",
);
const worldSource = readFileSync(
  new URL("./babylon-world-runtime.ts", import.meta.url),
  "utf8",
);

const MEDIUM_FEEL_REF = "worldkit://control-feel-profile/humanoid.medium-ground@1";
const HEAVY_FEEL_REF = "worldkit://control-feel-profile/humanoid.heavy-ground@1";

const havokWasmBytes = await readFile(
  createRequire(import.meta.url).resolve("@babylonjs/havok/lib/esm/HavokPhysics.wasm"),
);
const havokWasmBinary = havokWasmBytes.buffer.slice(
  havokWasmBytes.byteOffset,
  havokWasmBytes.byteOffset + havokWasmBytes.byteLength,
) as ArrayBuffer;

function compileFlatPackagePlan(
  playerControlFeelRef = MEDIUM_FEEL_REF,
): CanonicalSceneExecutionPlanV1 {
  const spec = createValidPackageSubjectWorldV4();
  spec.nodes = spec.nodes.map((node) =>
    node.kind === "terrain" && node.components.terrain.source.kind === "procedural"
      ? {
          ...node,
          components: {
            terrain: {
              ...node.components.terrain,
              source: {
                ...node.components.terrain.source,
                relief: "flat" as const,
                baseHeightMeters: 0,
                amplitudeMeters: 0,
              },
            },
          },
        }
      : node,
  );
  const plan = compileRuntimeTestScenePlanV1(spec);
  return createRuntimeTestWorldVariantV1(plan, {
    runtimeSubjects: runtimeTestSubjectsForPlanV1(plan).map((subject) => {
      if (subject.entityId !== "player") return subject;
      const controlFeel = subject.availableControlFeels.find(
        (candidate) => candidate.resourceRef === playerControlFeelRef,
      );
      if (controlFeel === undefined) {
        throw new Error(`Missing compiled Control Feel '${playerControlFeelRef}'.`);
      }
      return { ...subject, controlFeel };
    }),
  });
}

async function createDebtRuntime(
  executionPlan: CanonicalSceneExecutionPlanV1,
): Promise<BabylonWorldRuntime> {
  const runtime = await BabylonWorldRuntime.create({
    ...runtimeTestWorldInputForPlanV1(executionPlan),
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
  await bindRuntimeTestPossession(
    runtime,
    runtimeTestWorldArtifactsForPlanV1(executionPlan).worldRuntimeBootstrap
      .initialControlledEntityId,
  );
  return runtime;
}

function playerTrajectoryHash(snapshot: BabylonRuntimeProjectionV1): string {
  const player = snapshot.subjectStatesByEntityId.player!;
  return createHash("sha256")
    .update(JSON.stringify({
      positionMetersXYZ: player.positionMetersXYZ,
      velocityMetersPerSecondXYZ: player.velocityMetersPerSecondXYZ,
      forwardXYZ: player.forwardXYZ,
      speedMetersPerSecond: player.speedMetersPerSecond,
    }))
    .digest("hex");
}

describe("P1.5 runtime debt", () => {
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

  it("no longer revalidates object supported-by with the AABB top", () => {
    expect(worldSource.includes("supporting.maximumMetersXYZ[1]")).toBe(false);
  });

  it("publishes air from initialization support when spawned 0.4 m above terrain", async () => {
    const base = compileFlatPackagePlan();
    const player = runtimeTestSubjectsForPlanV1(base)
      .find((subject) => subject.entityId === "player")!;
    const executionPlan = createRuntimeTestWorldVariantV1(base, {
      scenePlanPatch: {
        terrain: {
        ...base.terrain,
        heightSamplesMeters: base.terrain.heightSamplesMeters.map(() => 0),
        },
        waters: [],
        objects: [],
        layout: { ...base.layout, layoutAssertions: [] },
      },
      runtimeSubjects: [
        {
          ...player,
          spawnSubjectOriginPositionMetersXYZ: [0, 0.4, 30],
        },
      ],
    });
    const runtime = await createDebtRuntime(executionPlan);
    try {
      const medium = runtime.snapshot().subjectStatesByEntityId.player!.movementMedium;
      expect(medium === "air" || medium === "ground").toBe(true);
      expect(medium).toBe("air");
      expect(medium).not.toBe("ground");
    } finally {
      await runtime.dispose();
    }
  }, 15_000);

  it("keeps separately compiled Feel locks distinct without runtime tuning", async () => {
    expect(worldSource.includes("setMotionTuning")).toBe(false);
    expect(kernelSource.includes("setMotionTuning")).toBe(false);
    expect(kernelSource.includes("setParameterTuning")).toBe(false);

    const mediumRuntime = await createDebtRuntime(
      compileFlatPackagePlan(MEDIUM_FEEL_REF),
    );
    const heavyRuntime = await createDebtRuntime(
      compileFlatPackagePlan(HEAVY_FEEL_REF),
    );
    try {
      const medium = await mediumRuntime.runFixedInput({
        actions: ["move-forward", "move-left"],
        ticks: 30,
      });
      const heavy = await heavyRuntime.runFixedInput({
        actions: ["move-forward", "move-left"],
        ticks: 30,
      });
      const mediumPlayer = medium.subjectStatesByEntityId.player!;
      const heavyPlayer = heavy.subjectStatesByEntityId.player!;
      expect(mediumPlayer.activeControlFeelProfileRef).toBe(MEDIUM_FEEL_REF);
      expect(heavyPlayer.activeControlFeelProfileRef).toBe(HEAVY_FEEL_REF);
      const speedOrYawDiverged =
        mediumPlayer.speedMetersPerSecond !== heavyPlayer.speedMetersPerSecond ||
        mediumPlayer.forwardXYZ?.[0] !== heavyPlayer.forwardXYZ?.[0] ||
        mediumPlayer.forwardXYZ?.[2] !== heavyPlayer.forwardXYZ?.[2];
      expect(speedOrYawDiverged).toBe(true);
      const mediumHash = playerTrajectoryHash(medium);
      const heavyHash = playerTrajectoryHash(heavy);
      expect(mediumHash).not.toBe(heavyHash);
      expect(() =>
        mediumRuntime.requestControlFeelProfile(
          "player",
          HEAVY_FEEL_REF,
        ),
      ).toThrow(/^SUBJECT_OVERRIDE_FORBIDDEN/);
    } finally {
      await Promise.all([mediumRuntime.dispose(), heavyRuntime.dispose()]);
    }
  }, 15_000);
});
