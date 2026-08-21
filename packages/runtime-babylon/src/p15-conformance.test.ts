import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

import { NullEngine } from "@babylonjs/core/Engines/nullEngine.pure.js";
import type { Scene } from "@babylonjs/core/scene.pure.js";
import { sha256CanonicalJson } from "@whitebox-world/protocol";
import { describe, expect, it } from "vitest";

import { normalizeAuthoringSpec } from "@whitebox-world/authoring";
import {
  assertPublishedMovementMediumSupported,
  compileWorld,
} from "@whitebox-world/compiler";
import {
  createValidAuthoringSpec,
  createValidPackageSubjectWorld,
} from "../../authoring/src/test-fixture";
import type {
  ExecutionObjectV3,
  ExecutionPlanV4,
  FixedInputV1,
  WorldRuntimeSnapshotV3,
} from "@whitebox-world/runtime-contracts";

import { BabylonWorldRuntime } from "./babylon-world-runtime";

const MEDIUM_FEEL_REF = "worldkit://control-feel-profile/humanoid.medium-ground@1";
const HEAVY_FEEL_REF = "worldkit://control-feel-profile/humanoid.heavy-ground@1";

const kernelSource = readFileSync(
  new URL("./motion-kernel-runtime.ts", import.meta.url),
  "utf8",
);

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
  return compiled.executionPlan;
}

/**
 * A minimal single-subject plan on zero-height terrain: no water, optional
 * extra static objects, no layout assertions, and an explicit spawn position.
 */
function playerOnlyPlan(options: {
  spawnMetersXYZ: readonly [number, number, number];
  objects?: readonly ExecutionObjectV3[];
}): ExecutionPlanV4 {
  const base = compileFlatPackagePlan();
  const player = base.subjects.find((subject) => subject.entityId === "player")!;
  return {
    ...base,
    terrain: {
      ...base.terrain,
      heightSamplesMeters: base.terrain.heightSamplesMeters.map(() => 0),
      minimumHeightMeters: 0,
      maximumHeightMeters: 0,
    },
    waters: [],
    objects: [...(options.objects ?? [])],
    subjects: [
      {
        ...player,
        spawnSubjectOriginPositionMetersXYZ: [...options.spawnMetersXYZ],
      },
    ],
    layout: { ...base.layout, layoutAssertions: [] },
  };
}

function staticBox(options: {
  entityId: string;
  sizeMetersXYZ: readonly [number, number, number];
  positionMetersXYZ: readonly [number, number, number];
  rotationEulerRadiansXYZ?: readonly [number, number, number];
}): ExecutionObjectV3 {
  return {
    entityId: options.entityId,
    prototypeId: `${options.entityId}-prototype`,
    primitive: { kind: "box", sizeMetersXYZ: [...options.sizeMetersXYZ] },
    transform: {
      positionMetersXYZ: [...options.positionMetersXYZ],
      rotationEulerRadiansXYZ: [...(options.rotationEulerRadiansXYZ ?? [0, 0, 0])],
      scaleXYZ: [1, 1, 1],
    },
    collisionEnabled: true,
    semanticClassId: "obstacle.fixture",
  };
}

async function createConformanceRuntime(
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

type SubjectRuntimeState =
  WorldRuntimeSnapshotV3["subjectStatesByEntityId"][string];

function fixedTickStateHash(state: SubjectRuntimeState): string {
  return createHash("sha256")
    .update(JSON.stringify({
      positionMetersXYZ: state.positionMetersXYZ,
      velocityMetersPerSecondXYZ: state.velocityMetersPerSecondXYZ,
      forwardXYZ: state.forwardXYZ,
      speedMetersPerSecond: state.speedMetersPerSecond,
      movementMedium: state.movementMedium,
      locomotionMode: state.locomotionMode,
      activeControlFeelProfileRef: state.activeControlFeelProfileRef,
    }))
    .digest("hex");
}

function scriptedActionsAtTick(tick: number): FixedInputV1["actions"] {
  if (tick < 30) return ["move-forward", "run"];
  if (tick < 45) return ["jump"];
  if (tick < 75) return ["move-left"];
  return [];
}

async function runScriptedTicksWithRenderCadence(cadence: {
  ticksPerRender: number;
  rendersPerTick: number;
}): Promise<{ perTickMediums: string[]; finalHash: string }> {
  const runtime = await createConformanceRuntime(compileFlatPackagePlan());
  try {
    const perTickMediums: string[] = [];
    let latest = runtime.snapshot();
    for (let tick = 0; tick < 90; tick += 1) {
      latest = await runtime.runFixedInput({
        actions: scriptedActionsAtTick(tick),
        ticks: 1,
      });
      perTickMediums.push(latest.subjectStatesByEntityId.player!.movementMedium);
      if ((tick + 1) % cadence.ticksPerRender === 0) {
        for (let render = 0; render < cadence.rendersPerTick; render += 1) {
          runtime.renderFrame();
        }
      }
    }
    return {
      perTickMediums,
      finalHash: fixedTickStateHash(latest.subjectStatesByEntityId.player!),
    };
  } finally {
    await runtime.dispose();
  }
}

async function tickUntil(
  runtime: BabylonWorldRuntime,
  actions: FixedInputV1["actions"],
  maximumTicks: number,
  isDone: (state: SubjectRuntimeState) => boolean,
): Promise<{ state: SubjectRuntimeState; elapsedTicks: number } | undefined> {
  for (let tick = 0; tick < maximumTicks; tick += 1) {
    const snapshot = await runtime.runFixedInput({ actions, ticks: 1 });
    const state = snapshot.subjectStatesByEntityId.player!;
    if (isDone(state)) return { state, elapsedTicks: tick + 1 };
  }
  return undefined;
}

describe("P1.5 conformance: closed Ground/Air Feel slice", () => {
  it("1. produces the same fixed-tick state hash and movementMedium under 30/60/120 Hz-like render cadences", async () => {
    const thirtyHzLike = await runScriptedTicksWithRenderCadence({
      ticksPerRender: 2,
      rendersPerTick: 1,
    });
    const sixtyHzLike = await runScriptedTicksWithRenderCadence({
      ticksPerRender: 1,
      rendersPerTick: 1,
    });
    const oneTwentyHzLike = await runScriptedTicksWithRenderCadence({
      ticksPerRender: 1,
      rendersPerTick: 2,
    });

    expect(sixtyHzLike.perTickMediums).toEqual(thirtyHzLike.perTickMediums);
    expect(oneTwentyHzLike.perTickMediums).toEqual(thirtyHzLike.perTickMediums);
    expect(sixtyHzLike.finalHash).toBe(thirtyHzLike.finalHash);
    expect(oneTwentyHzLike.finalHash).toBe(thirtyHzLike.finalHash);
    // The script includes a held jump, so both mediums must appear, and the
    // published union stays closed to ground/air.
    expect(new Set(thirtyHzLike.perTickMediums)).toEqual(new Set(["ground", "air"]));
  }, 60_000);

  it("2. keeps speed, yaw, and Feel Refs isolated between instances with different Feels", async () => {
    const mediumRuntime = await createConformanceRuntime(compileFlatPackagePlan());
    const heavyRuntime = await createConformanceRuntime(compileFlatPackagePlan());
    try {
      const packAnimalFeelBefore = heavyRuntime
        .snapshot()
        .subjectStatesByEntityId["pack-animal-a"]!.activeControlFeelProfileRef;
      expect(heavyRuntime.requestControlFeelProfile("player", HEAVY_FEEL_REF)).toBe(
        true,
      );

      // Sample mid-turn, where the different Feel turn rates are visible.
      const turningInput = {
        actions: ["move-forward", "move-left"],
        ticks: 8,
      } as const;
      const mediumTurning = (await mediumRuntime.runFixedInput(turningInput))
        .subjectStatesByEntityId.player!;
      const heavyTurning = (await heavyRuntime.runFixedInput(turningInput))
        .subjectStatesByEntityId.player!;
      const yawDiverged =
        mediumTurning.forwardXYZ![0] !== heavyTurning.forwardXYZ![0] ||
        mediumTurning.forwardXYZ![2] !== heavyTurning.forwardXYZ![2];
      expect(yawDiverged).toBe(true);
      expect(fixedTickStateHash(mediumTurning)).not.toBe(
        fixedTickStateHash(heavyTurning),
      );

      // At the steady state, the Feel walk speeds stay distinguishable.
      const steadyInput = {
        actions: ["move-forward", "move-left"],
        ticks: 32,
      } as const;
      const mediumPlayer = (await mediumRuntime.runFixedInput(steadyInput))
        .subjectStatesByEntityId.player!;
      const heavyPlayer = (await heavyRuntime.runFixedInput(steadyInput))
        .subjectStatesByEntityId.player!;
      expect(mediumPlayer.activeControlFeelProfileRef).toBe(MEDIUM_FEEL_REF);
      expect(heavyPlayer.activeControlFeelProfileRef).toBe(HEAVY_FEEL_REF);
      expect(heavyPlayer.speedMetersPerSecond).toBeDefined();
      expect(mediumPlayer.speedMetersPerSecond!).toBeGreaterThan(
        heavyPlayer.speedMetersPerSecond! + 0.5,
      );

      // Switching the player's Feel must not leak to another subject instance
      // in the same world.
      expect(
        heavyRuntime.snapshot().subjectStatesByEntityId["pack-animal-a"]!
          .activeControlFeelProfileRef,
      ).toBe(packAnimalFeelBefore);
    } finally {
      await mediumRuntime.dispose();
      await heavyRuntime.dispose();
    }
  }, 60_000);

  it("3. reset while a move key is held republishes from bootstrap + checkSupport with zero coyote/buffer", async () => {
    // The spawn/reset bootstrap must not use a physics ray.
    expect(kernelSource.includes("raycast")).toBe(false);

    const groundedRuntime = await createConformanceRuntime(
      playerOnlyPlan({ spawnMetersXYZ: [0, 0, 30] }),
    );
    try {
      await groundedRuntime.runFixedInput({ actions: ["move-forward"], ticks: 30 });
      const afterReset = groundedRuntime.reset();
      const player = afterReset.subjectStatesByEntityId.player!;
      // The first published state after reset already reflects a fresh
      // support query on the spawn contact manifold.
      expect(player.movementMedium).toBe("ground");
      expect(player.positionMetersXYZ).toEqual([0, 0, 30]);
      expect(player.velocityMetersPerSecondXYZ).toEqual([0, 0, 0]);
    } finally {
      await groundedRuntime.dispose();
    }

    const airborneRuntime = await createConformanceRuntime(
      playerOnlyPlan({ spawnMetersXYZ: [0, 0.4, 30] }),
    );
    try {
      // Land, walk, and accumulate grounded coyote before the reset.
      const beforeReset = await airborneRuntime.runFixedInput({
        actions: ["move-forward"],
        ticks: 60,
      });
      expect(beforeReset.subjectStatesByEntityId.player!.movementMedium).toBe(
        "ground",
      );

      const afterReset = airborneRuntime.reset();
      // A 0.4 m airborne spawn republishes as air from checkSupport, not as
      // stale pre-reset ground state.
      expect(afterReset.subjectStatesByEntityId.player!.movementMedium).toBe("air");

      // Coyote and jump buffer were zeroed by the reset: a fresh jump press on
      // the first airborne tick must not take off from pre-reset ground time.
      const jumpPressed = await airborneRuntime.runFixedInput({
        actions: ["move-forward", "jump"],
        ticks: 1,
      });
      expect(
        jumpPressed.subjectStatesByEntityId.player!.velocityMetersPerSecondXYZ[1],
      ).toBeLessThan(1);
      for (let tick = 0; tick < 5; tick += 1) {
        const falling = await airborneRuntime.runFixedInput({
          actions: ["move-forward"],
          ticks: 1,
        });
        const state = falling.subjectStatesByEntityId.player!;
        expect(state.velocityMetersPerSecondXYZ[1]).toBeLessThan(1);
        expect(state.movementMedium).toBe("air");
      }
    } finally {
      await airborneRuntime.dispose();
    }
  }, 60_000);

  it("3b. spawn and reset publish cleared velocity even when the spawn capsule penetrates its support", async () => {
    // A slightly buried spawn forces the bootstrap contact-manifold integrate
    // to resolve penetration. That solver recovery impulse is a bootstrap
    // implementation detail and must not leak into the published spawn or
    // reset velocity.
    const runtime = await createConformanceRuntime(
      playerOnlyPlan({ spawnMetersXYZ: [0, -0.05, 30] }),
    );
    try {
      const spawn = runtime.snapshot();
      expect(
        spawn.subjectStatesByEntityId.player!.velocityMetersPerSecondXYZ,
      ).toEqual([0, 0, 0]);

      await runtime.runFixedInput({ actions: ["move-forward"], ticks: 30 });
      const afterReset = runtime.reset();
      expect(
        afterReset.subjectStatesByEntityId.player!.velocityMetersPerSecondXYZ,
      ).toEqual([0, 0, 0]);
    } finally {
      await runtime.dispose();
    }
  }, 60_000);

  it("4. publishes air after a 0.4 m ledge walk-off while coyote briefly keeps the jump", async () => {
    const runtime = await createConformanceRuntime(
      playerOnlyPlan({
        spawnMetersXYZ: [0, 0.45, 0],
        objects: [
          staticBox({
            entityId: "ledge",
            sizeMetersXYZ: [4, 0.4, 4],
            positionMetersXYZ: [0, 0.2, 0],
          }),
        ],
      }),
    );
    try {
      // Settle onto the 0.4 m ledge top.
      const settled = await tickUntil(
        runtime,
        [],
        60,
        (state) =>
          state.movementMedium === "ground" &&
          Math.abs(state.velocityMetersPerSecondXYZ[1]) < 0.01,
      );
      expect(settled).toBeDefined();
      expect(settled!.state.positionMetersXYZ[1]).toBeGreaterThan(0.3);

      // Walk off the edge and catch the first published air tick.
      const departed = await tickUntil(
        runtime,
        ["move-right"],
        300,
        (state) => state.movementMedium === "air",
      );
      expect(departed).toBeDefined();
      expect(departed!.state.positionMetersXYZ[0]).toBeGreaterThan(1.5);

      // Coyote from the supported ledge still allows the jump one tick into
      // the fall.
      const jumped = await runtime.runFixedInput({
        actions: ["move-right", "jump"],
        ticks: 1,
      });
      expect(
        jumped.subjectStatesByEntityId.player!.velocityMetersPerSecondXYZ[1],
      ).toBeGreaterThan(1);

      // The jump ends on the lower terrain as ground again.
      const landed = await tickUntil(
        runtime,
        [],
        300,
        (state) =>
          state.movementMedium === "ground" && state.positionMetersXYZ[1] < 0.2,
      );
      expect(landed).toBeDefined();
    } finally {
      await runtime.dispose();
    }
  }, 60_000);

  it("5a. forbids the jump from sliding and does not re-arm coyote from sliding", async () => {
    // A 51.6-degree box face is steeper than the Body's 42-degree slope lock,
    // so Havok classifies contact as SLIDING. Downhill faces +X.
    const runtime = await createConformanceRuntime(
      playerOnlyPlan({
        spawnMetersXYZ: [0.4, 3, 0],
        objects: [
          staticBox({
            entityId: "steep-ramp",
            sizeMetersXYZ: [4, 1, 4],
            positionMetersXYZ: [0, 2.4, 0],
            rotationEulerRadiansXYZ: [0, 0, -0.9],
          }),
        ],
      }),
    );
    try {
      // Land on the tilted face. Sliding still publishes the ground medium.
      const sliding = await tickUntil(
        runtime,
        [],
        120,
        (state) =>
          state.movementMedium === "ground" && state.positionMetersXYZ[1] > 1.2,
      );
      expect(sliding).toBeDefined();

      // A fresh jump press on the sliding face must not take off.
      const jumpOnSlide = await runtime.runFixedInput({
        actions: ["jump"],
        ticks: 1,
      });
      expect(
        jumpOnSlide.subjectStatesByEntityId.player!.velocityMetersPerSecondXYZ[1],
      ).toBeLessThan(1);
      for (let tick = 0; tick < 10; tick += 1) {
        const held = await runtime.runFixedInput({ actions: ["jump"], ticks: 1 });
        expect(
          held.subjectStatesByEntityId.player!.velocityMetersPerSecondXYZ[1],
        ).toBeLessThan(1);
      }

      // Drive off the low edge of the sliding face into the air.
      const departed = await tickUntil(
        runtime,
        ["move-right"],
        600,
        (state) =>
          state.movementMedium === "air" && state.positionMetersXYZ[1] > 0.6,
      );
      expect(departed).toBeDefined();

      // Sliding never re-armed coyote, so the same one-tick-late jump press
      // that succeeds after a supported ledge does nothing here.
      const jumpAfterSlideDeparture = await runtime.runFixedInput({
        actions: ["move-right", "jump"],
        ticks: 1,
      });
      expect(
        jumpAfterSlideDeparture.subjectStatesByEntityId.player!
          .velocityMetersPerSecondXYZ[1],
      ).toBeLessThan(1);
      for (let tick = 0; tick < 4; tick += 1) {
        const falling = await runtime.runFixedInput({
          actions: ["move-right"],
          ticks: 1,
        });
        expect(
          falling.subjectStatesByEntityId.player!.velocityMetersPerSecondXYZ[1],
        ).toBeLessThan(1);
      }
    } finally {
      await runtime.dispose();
    }
  }, 60_000);

  it("5b. applies Feel hold/release gravity ratios to held versus released jumps", async () => {
    const executionPlan = playerOnlyPlan({ spawnMetersXYZ: [0, 0, 30] });
    const playerFeel = executionPlan.subjects[0]!.controlFeel;
    expect(playerFeel.jumpHoldGravityRatio).toBeLessThan(1);
    expect(playerFeel.jumpReleaseGravityRatio).toBeGreaterThanOrEqual(1);

    const runtime = await createConformanceRuntime(executionPlan);
    try {
      const measureJumpApex = async (
        holdActions: FixedInputV1["actions"],
      ): Promise<{ apexMeters: number; airTicks: number }> => {
        const takeoff = await runtime.runFixedInput({ actions: ["jump"], ticks: 1 });
        expect(
          takeoff.subjectStatesByEntityId.player!.velocityMetersPerSecondXYZ[1],
        ).toBeGreaterThan(1);
        let apexMeters = takeoff.subjectStatesByEntityId.player!.positionMetersXYZ[1];
        let airTicks = 0;
        for (let tick = 0; tick < 240; tick += 1) {
          const snapshot = await runtime.runFixedInput({
            actions: holdActions,
            ticks: 1,
          });
          const state = snapshot.subjectStatesByEntityId.player!;
          apexMeters = Math.max(apexMeters, state.positionMetersXYZ[1]);
          if (
            state.movementMedium === "ground" &&
            Math.abs(state.velocityMetersPerSecondXYZ[1]) < 0.01
          ) {
            break;
          }
          airTicks += 1;
        }
        return { apexMeters, airTicks };
      };

      const held = await measureJumpApex(["jump"]);
      runtime.reset();
      await runtime.runFixedInput({ actions: [], ticks: 10 });
      const released = await measureJumpApex([]);

      // Hold gravity ratio < 1 lifts the held apex above the released apex,
      // and release gravity ratio >= 1 shortens the released flight.
      expect(held.apexMeters).toBeGreaterThan(released.apexMeters + 0.1);
      expect(held.airTicks).toBeGreaterThan(released.airTicks);
    } finally {
      await runtime.dispose();
    }
  }, 60_000);

  it("6. restores controller, body, and listener counts across rebind and reset cycles", async () => {
    const runtime = await createConformanceRuntime(compileFlatPackagePlan());
    try {
      const internals = runtime as unknown as {
        scene: Scene;
        subjectControllersByEntityId: ReadonlyMap<string, unknown>;
      };
      const countListeners = (): Record<string, number> => ({
        beforeRender: internals.scene.onBeforeRenderObservable.observers.length,
        afterRender: internals.scene.onAfterRenderObservable.observers.length,
        beforeAnimations:
          internals.scene.onBeforeAnimationsObservable.observers.length,
      });
      const baselineResources = runtime.snapshot().resources;
      const baselineControllers = internals.subjectControllersByEntityId.size;
      const baselineListeners = countListeners();

      for (let cycle = 0; cycle < 3; cycle += 1) {
        expect(
          runtime.bindControl({
            controllerId: "controller-primary",
            expectedControlledEntityId: "player",
            controlledEntityId: "pack-animal-a",
          }),
        ).toMatchObject({ status: "committed" });
        await runtime.runFixedInput({ actions: ["move-forward", "jump"], ticks: 20 });
        runtime.renderFrame();
        expect(
          runtime.requestControlFeelProfile(
            "player",
            cycle % 2 === 0 ? HEAVY_FEEL_REF : MEDIUM_FEEL_REF,
          ),
        ).toBe(true);
        const reset = runtime.reset();

        expect(reset.controlledEntityId).toBe("player");
        expect(reset.resources.bodies).toBe(baselineResources.bodies);
        expect(reset.resources.meshes).toBe(baselineResources.meshes);
        expect(internals.subjectControllersByEntityId.size).toBe(
          baselineControllers,
        );
        expect(countListeners()).toEqual(baselineListeners);
        for (const subject of Object.values(reset.subjectStatesByEntityId)) {
          expect(subject.velocityMetersPerSecondXYZ).toEqual([0, 0, 0]);
        }
      }
    } finally {
      await runtime.dispose();
    }
  }, 60_000);

  it("7. rejects publishing a water movementMedium through the compiler/resolver path", () => {
    expect(() => assertPublishedMovementMediumSupported("water")).toThrow(
      /^SUBJECT_MOVEMENT_MEDIUM_UNSUPPORTED:/,
    );
    expect(() => assertPublishedMovementMediumSupported("ground")).not.toThrow();
    expect(() => assertPublishedMovementMediumSupported("air")).not.toThrow();

    const spec = createValidAuthoringSpec();
    const subject = spec.nodes.find((node) => node.kind === "subject");
    if (subject === undefined || subject.kind !== "subject") {
      throw new Error("Expected the valid fixture to contain a Subject node.");
    }
    subject.subjectDefinitionRef = "worldkit://subject-definition/humanoid.g-bot@1";
    const normalized = normalizeAuthoringSpec(spec);
    if (!normalized.ok || normalized.value === undefined) {
      throw new Error(
        `G Bot fixture did not normalize: ${JSON.stringify(normalized.diagnostics)}`,
      );
    }
    const forged = structuredClone(normalized.value);
    const definition = forged.resources.subjectDefinitions[0];
    if (definition?.capabilityAssembly === undefined) {
      throw new Error("Expected capability assembly on forged G Bot definition.");
    }
    definition.capabilityAssembly.mediumProfile = {
      ...definition.capabilityAssembly.mediumProfile,
      water: { surfaceHoldStrength: 1, linearDragPerSecond: 0.1 },
    } as typeof definition.capabilityAssembly.mediumProfile;

    expect(
      compileWorld({
        normalizedWorldIr: forged,
        normalizedWorldIrHash: sha256CanonicalJson(forged),
      }),
    ).toMatchObject({
      ok: false,
      diagnostics: [
        {
          code: "COMPILER_NORMALIZED_IR_INVALID",
          message: expect.stringMatching(/^SUBJECT_MOVEMENT_MEDIUM_UNSUPPORTED:/),
        },
      ],
    });
  });
});
