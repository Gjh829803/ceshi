import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

import { NullEngine } from "@babylonjs/core/Engines/nullEngine.pure.js";
import { describe, expect, it } from "vitest";

import {
  normalizeAuthoringSpec,
} from "@whitebox-world/authoring";
import { compileWorld } from "@whitebox-world/compiler";
import { createValidPackageSubjectWorld } from "../../authoring/src/test-fixture";
import type { ExecutionPlanV4, WorldRuntimeSnapshotV3 } from "@whitebox-world/runtime-contracts";

import { BabylonWorldRuntime } from "./babylon-world-runtime";
import { lockPublishedGroundFeels } from "./lock-published-ground-feels";

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

function compileFlatPackagePlan(): ExecutionPlanV4 {
  const spec = createValidPackageSubjectWorld();
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
  const normalized = normalizeAuthoringSpec(spec);
  if (
    !normalized.ok ||
    normalized.value === undefined ||
    normalized.normalizedWorldIrHash === undefined
  ) {
    throw new Error(`Fixture normalize failed: ${JSON.stringify(normalized.diagnostics)}`);
  }
  const compiled = compileWorld({
    normalizedWorldIr: normalized.value,
    normalizedWorldIrHash: normalized.normalizedWorldIrHash,
  });
  if (!compiled.ok || compiled.executionPlan === undefined) {
    throw new Error(`Fixture compile failed: ${JSON.stringify(compiled.diagnostics)}`);
  }
  return lockPublishedGroundFeels(compiled.executionPlan);
}

async function createDebtRuntime(
  executionPlan: ExecutionPlanV4,
): Promise<BabylonWorldRuntime> {
  return BabylonWorldRuntime.create({
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
}

function playerTrajectoryHash(snapshot: WorldRuntimeSnapshotV3): string {
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

  it("publishes air from checkSupport after reset when spawned 0.4 m above terrain", async () => {
    const base = compileFlatPackagePlan();
    const player = base.subjects.find((subject) => subject.entityId === "player")!;
    const executionPlan: ExecutionPlanV4 = {
      ...base,
      terrain: {
        ...base.terrain,
        heightSamplesMeters: base.terrain.heightSamplesMeters.map(() => 0),
      },
      waters: [],
      objects: [],
      subjects: [
        {
          ...player,
          spawnSubjectOriginPositionMetersXYZ: [0, 0.4, 30],
        },
      ],
      layout: { ...base.layout, layoutAssertions: [] },
    };
    const runtime = await createDebtRuntime(executionPlan);
    try {
      const afterReset = runtime.reset();
      const medium = afterReset.subjectStatesByEntityId.player!.movementMedium;
      expect(medium === "air" || medium === "ground").toBe(true);
      expect(medium).toBe("air");
      expect(medium).not.toBe("ground");
    } finally {
      await runtime.dispose();
    }
  }, 15_000);

  it("switches locked feel refs without setMotionTuning and diverges speed or yaw hashes", async () => {
    expect(worldSource.includes("setMotionTuning")).toBe(false);
    expect(kernelSource.includes("setMotionTuning")).toBe(false);
    expect(kernelSource.includes("setParameterTuning")).toBe(false);

    const executionPlan = compileFlatPackagePlan();
    const runtime = await createDebtRuntime(executionPlan);
    try {
      expect(runtime.requestControlFeelProfile("player", MEDIUM_FEEL_REF)).toBe(true);
      const medium = await runtime.runFixedInput({
        actions: ["move-forward", "move-left"],
        ticks: 30,
      });
      runtime.reset();
      expect(runtime.requestControlFeelProfile("player", HEAVY_FEEL_REF)).toBe(true);
      const heavy = await runtime.runFixedInput({
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
        runtime.requestControlFeelProfile(
          "player",
          "worldkit://control-feel-profile/unknown.unlisted@1",
        ),
      ).toThrow(/^SUBJECT_OVERRIDE_FORBIDDEN/);
    } finally {
      await runtime.dispose();
    }
  }, 15_000);
});
