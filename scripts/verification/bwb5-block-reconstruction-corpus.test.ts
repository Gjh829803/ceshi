import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

import { NullEngine } from "@babylonjs/core/Engines/nullEngine.pure.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { PhysicsEngine } from "@babylonjs/core/Physics/v2/physicsEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import {
  type BabylonNativeSceneModuleV1,
} from "@whitebox-world/native-babylon";
import { createBabylonNativeBlockReconstructionCorpusModuleV1 } from
  "@whitebox-world/native-babylon-block-profile/testing";
import { admitBabylonNativeSceneCandidateV1 } from
  "@whitebox-world/native-babylon/host";
import { BabylonWorldRuntime } from "@whitebox-world/runtime-babylon";
import {
  bindRuntimeTestPossession,
  resetAndBindRuntimeTestPossession,
} from "@whitebox-world/runtime-babylon/testing";
import { sha256CanonicalJson } from "@whitebox-world/protocol";
import { runtimeWorldConfigurationFromVerifiedWorldPackageV1 } from
  "@whitebox-world/runtime-host";
import {
  createBabylonNativeWorldPackageV1,
  type VerifiedBabylonNativeWorldPackageDirectoryV1,
  verifyWorldPackageDirectoryV1,
} from "@whitebox-world/world-package";
import { createBabylonNativeBlockWorldPackageTestInputV1 } from
  "@whitebox-world/world-package/testing";
import { isNil } from "lodash-es";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const havokWasmBytes = await readFile(
  require.resolve("@babylonjs/havok/lib/esm/HavokPhysics.wasm"),
);
const havokWasmBinary = havokWasmBytes.buffer.slice(
  havokWasmBytes.byteOffset,
  havokWasmBytes.byteOffset + havokWasmBytes.byteLength,
) as ArrayBuffer;

const RESOURCE_BUDGET = Object.freeze({
  maximumVertices: 256,
  maximumTriangles: 288,
  maximumColliders: 24,
});

const POSITIVE_CASE_IDS = Object.freeze([
  "ordinary-and-blocked-steps",
  "t-shaped-traversal",
  "mountain-cliff",
  "building-exterior",
  "limited-interior",
] as const);

type PassedCandidateAdmission = Extract<
  Awaited<ReturnType<typeof admitBabylonNativeSceneCandidateV1>>,
  { readonly outcome: "passed" }
>;

async function auditedAdmission(
  module: BabylonNativeSceneModuleV1,
): Promise<Readonly<{
  admission: PassedCandidateAdmission;
  candidateColliderMeshes: readonly Mesh[];
  candidateScene: Scene;
  candidateEngine: NullEngine;
}>> {
  const packageInput = createBabylonNativeBlockWorldPackageTestInputV1({
    resourceBudget: RESOURCE_BUDGET,
  });
  const engine = new NullEngine();
  const scene = new Scene(engine);
  let admission: PassedCandidateAdmission | undefined;
  let candidateColliderMeshes: readonly Mesh[] = Object.freeze([]);
  try {
    const result = await admitBabylonNativeSceneCandidateV1({
      candidate: Object.freeze({ engine, scene }),
      bootstrap: packageInput.nativeSceneBootstrap,
      module,
      assets: Object.freeze({
        async resolve(): Promise<never> {
          throw new Error("BWB-5 corpus declares no Native assets.");
        },
      }),
      budget: Object.freeze({
        maximumStaticColliderCount: RESOURCE_BUDGET.maximumColliders,
        maximumStaticColliderVertexCount: RESOURCE_BUDGET.maximumVertices,
        maximumStaticColliderTriangleCount: RESOURCE_BUDGET.maximumTriangles,
      }),
    });
    if (result.outcome !== "passed") {
      throw new Error(JSON.stringify(result.diagnostics));
    }
    admission = result;
    candidateColliderMeshes = Object.freeze(scene.meshes.filter(
      (mesh): mesh is Mesh =>
        mesh instanceof Mesh &&
        mesh.name.startsWith("worldkit-block-collider-"),
    ));
  } finally {
    scene.dispose();
    engine.dispose();
  }
  if (isNil(admission)) {
    throw new Error("BWB-5 corpus admission did not publish a Contribution.");
  }
  return Object.freeze({
    admission,
    candidateColliderMeshes,
    candidateScene: scene,
    candidateEngine: engine,
  });
}

function verifiedPackage(
  contribution: PassedCandidateAdmission["contribution"],
): VerifiedBabylonNativeWorldPackageDirectoryV1 {
  const verified = verifyWorldPackageDirectoryV1(
    createBabylonNativeWorldPackageV1(
      createBabylonNativeBlockWorldPackageTestInputV1({
        resourceBudget: RESOURCE_BUDGET,
        nativeSceneContribution: contribution,
      }),
    ),
  );
  if (verified.kind !== "babylon-native-scene") {
    throw new Error("BWB-5 corpus must verify as one Babylon Native Package.");
  }
  return verified;
}

async function createRuntime(
  caseId: (typeof POSITIVE_CASE_IDS)[number] | "unsupported-spawn",
): Promise<Readonly<{
  runtime: BabylonWorldRuntime;
  verified: VerifiedBabylonNativeWorldPackageDirectoryV1;
}>> {
  const module = createBabylonNativeBlockReconstructionCorpusModuleV1({
    caseId,
  });
  const packageAdmission = await auditedAdmission(module);
  const verified = verifiedPackage(packageAdmission.admission.contribution);
  const configuration = runtimeWorldConfigurationFromVerifiedWorldPackageV1(
    verified,
  );
  if (configuration.sceneSource.kind !== "babylon-native-scene") {
    throw new Error("BWB-5 corpus must select the Babylon Native Scene Source.");
  }
  const runtimeSessionId = `runtime.bwb5-${caseId}`;
  const runtime = await BabylonWorldRuntime.create({
    sceneSource: {
      kind: "babylon-native-scene",
      descriptor: Object.freeze({
        runtimeSessionId,
        worldSessionId: `world-session.bwb5-${caseId}`,
        worldBuildIdentity: configuration.worldBuildIdentity,
        gameplayBootstrap: configuration.gameplayBootstrap,
        worldRuntimeBootstrap: configuration.worldRuntimeBootstrap,
        sceneSource: configuration.sceneSource,
      }),
      verifiedWorldPackage: verified,
      moduleLoader: Object.freeze({ load: async () => module }),
    },
    worldRuntimeBootstrap: verified.worldRuntimeBootstrap,
    gameplayBootstrap: verified.gameplayBootstrap,
    runtimeSessionId,
    havokWasmBinary,
    engineFactory: () => new NullEngine({
      renderWidth: 64,
      renderHeight: 64,
      textureSize: 64,
      deterministicLockstep: true,
      lockstepMaxSteps: 4,
    }),
  });
  await bindRuntimeTestPossession(
    runtime,
    verified.worldRuntimeBootstrap.initialControlledEntityId,
  );
  return Object.freeze({ runtime, verified });
}

function subjectOf(
  snapshot: Awaited<ReturnType<BabylonWorldRuntime["runFixedInput"]>>,
  entityId: string,
) {
  const subject = snapshot.subjectStatesByEntityId[entityId];
  if (isNil(subject)) {
    throw new Error(`Missing subject '${entityId}'.`);
  }
  return subject;
}

describe("BWB-5 Block Reconstruction Corpus Runtime", () => {
  it("keeps 0.25m pass, 0.5m block, reset hash, and ledge air on ordinary-and-blocked-steps", async () => {
    const { runtime, verified } = await createRuntime(
      "ordinary-and-blocked-steps",
    );
    const internals = runtime as unknown as {
      scene: Scene;
      engine: NullEngine;
    };
    const entityId = verified.worldRuntimeBootstrap.initialControlledEntityId;
    const collisionMeshes = internals.scene.meshes.filter(({ name }) =>
      name.startsWith("worldkit.native-collider."));
    try {
      const physicsEngine = internals.scene.getPhysicsEngine();
      if (isNil(physicsEngine) || !(physicsEngine instanceof PhysicsEngine)) {
        throw new Error("BWB-5 Runtime did not initialize installed Havok.");
      }
      expect(collisionMeshes.length).toBeGreaterThan(0);
      expect(collisionMeshes[0]?.metadata).toMatchObject({
        worldkitNativeTraversalKind: expect.stringMatching(
          /static-surface|not-traversable/,
        ),
      });
      const settled = await runtime.runFixedInput({ actions: [], ticks: 5 });
      expect(subjectOf(settled, entityId)).toMatchObject({
        movementMedium: "ground",
      });
      const crossed = await runtime.runFixedInput({
        actions: ["move-forward"],
        ticks: 65,
      });
      expect(subjectOf(crossed, entityId).positionMetersXYZ[1])
        .toBeGreaterThan(0.24);
      expect(subjectOf(crossed, entityId).movementMedium).toBe("ground");
      const elevated = await runtime.runFixedInput({
        actions: ["move-forward"],
        ticks: 30,
      });
      expect(subjectOf(elevated, entityId).positionMetersXYZ[2])
        .toBeLessThan(-2.5);
      const blocked = await runtime.runFixedInput({
        actions: ["move-forward"],
        ticks: 85,
      });
      expect(subjectOf(blocked, entityId).positionMetersXYZ[2])
        .toBeGreaterThan(-4.2);
      const hash = sha256CanonicalJson(blocked);
      await resetAndBindRuntimeTestPossession(runtime, entityId);
      const replayedSettled = await runtime.runFixedInput({
        actions: [],
        ticks: 5,
      });
      const replayedCrossed = await runtime.runFixedInput({
        actions: ["move-forward"],
        ticks: 65,
      });
      const replayedElevated = await runtime.runFixedInput({
        actions: ["move-forward"],
        ticks: 30,
      });
      const replayedBlocked = await runtime.runFixedInput({
        actions: ["move-forward"],
        ticks: 85,
      });
      expect(replayedSettled).toEqual(settled);
      expect(replayedCrossed).toEqual(crossed);
      expect(replayedElevated).toEqual(elevated);
      expect(replayedBlocked).toEqual(blocked);
      expect(sha256CanonicalJson(replayedBlocked)).toBe(hash);
      await resetAndBindRuntimeTestPossession(runtime, entityId);
      await runtime.runFixedInput({ actions: [], ticks: 5 });
      await runtime.runFixedInput({ actions: ["move-forward"], ticks: 95 });
      const departed = await runtime.runFixedInput({
        actions: ["move-right"],
        ticks: 180,
      });
      expect(subjectOf(departed, entityId).positionMetersXYZ[0])
        .toBeGreaterThan(0.5);
      expect(subjectOf(departed, entityId).movementMedium).toBe("air");
    } finally {
      await runtime.dispose();
    }
    expect(collisionMeshes.every((mesh) => mesh.isDisposed())).toBe(true);
    expect(internals.scene.isDisposed).toBe(true);
    expect(internals.engine.isDisposed).toBe(true);
  }, 30_000);

  it("proves expected pass and block corridors for mountain, T, building, and limited interior", async () => {
    const { runtime: tRuntime, verified: tVerified } = await createRuntime(
      "t-shaped-traversal",
    );
    const tEntity = tVerified.worldRuntimeBootstrap.initialControlledEntityId;
    try {
      await tRuntime.runFixedInput({ actions: [], ticks: 5 });
      await tRuntime.runFixedInput({ actions: ["move-forward"], ticks: 70 });
      const east = await tRuntime.runFixedInput({
        actions: ["move-right"],
        ticks: 70,
      });
      expect(subjectOf(east, tEntity).positionMetersXYZ[0]).toBeGreaterThan(0.6);
      expect(subjectOf(east, tEntity).movementMedium).toBe("ground");
      await resetAndBindRuntimeTestPossession(tRuntime, tEntity);
      await tRuntime.runFixedInput({ actions: [], ticks: 5 });
      await tRuntime.runFixedInput({ actions: ["move-forward"], ticks: 70 });
      const west = await tRuntime.runFixedInput({
        actions: ["move-left"],
        ticks: 90,
      });
      expect(subjectOf(west, tEntity).positionMetersXYZ[0]).toBeGreaterThan(-2.4);
      expect(subjectOf(west, tEntity).movementMedium).toBe("ground");
    } finally {
      await tRuntime.dispose();
    }

    const { runtime: mountainRuntime, verified: mountainVerified } =
      await createRuntime("mountain-cliff");
    const mountainEntity =
      mountainVerified.worldRuntimeBootstrap.initialControlledEntityId;
    try {
      await mountainRuntime.runFixedInput({ actions: [], ticks: 5 });
      const along = await mountainRuntime.runFixedInput({
        actions: ["move-forward"],
        ticks: 90,
      });
      expect(subjectOf(along, mountainEntity).positionMetersXYZ[2])
        .toBeLessThan(-1.5);
      expect(subjectOf(along, mountainEntity).movementMedium).toBe("ground");
      await resetAndBindRuntimeTestPossession(mountainRuntime, mountainEntity);
      await mountainRuntime.runFixedInput({ actions: [], ticks: 5 });
      const intoCliff = await mountainRuntime.runFixedInput({
        actions: ["move-left"],
        ticks: 90,
      });
      expect(subjectOf(intoCliff, mountainEntity).positionMetersXYZ[0])
        .toBeGreaterThan(-1.6);
      expect(subjectOf(intoCliff, mountainEntity).movementMedium).toBe("ground");
    } finally {
      await mountainRuntime.dispose();
    }

    for (const caseId of ["building-exterior", "limited-interior"] as const) {
      const { runtime, verified } = await createRuntime(caseId);
      const entityId = verified.worldRuntimeBootstrap.initialControlledEntityId;
      try {
        await runtime.runFixedInput({ actions: [], ticks: 5 });
        const entered = await runtime.runFixedInput({
          actions: ["move-forward"],
          ticks: 55,
        });
        expect(subjectOf(entered, entityId).positionMetersXYZ[2])
          .toBeLessThan(-1);
        expect(subjectOf(entered, entityId).movementMedium).toBe("ground");
        const blocked = await runtime.runFixedInput({
          actions: ["move-forward"],
          ticks: 90,
        });
        expect(subjectOf(blocked, entityId).positionMetersXYZ[2])
          .toBeGreaterThan(-3.9);
        expect(subjectOf(blocked, entityId).movementMedium).toBe("ground");
      } finally {
        await runtime.dispose();
      }
    }
  }, 90_000);

  it("leaves unsupported-spawn in air after settle ticks", async () => {
    const { runtime, verified } = await createRuntime("unsupported-spawn");
    const entityId = verified.worldRuntimeBootstrap.initialControlledEntityId;
    try {
      const settled = await runtime.runFixedInput({ actions: [], ticks: 20 });
      expect(subjectOf(settled, entityId).movementMedium).toBe("air");
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  it("keeps fixed-tick hashes identical under 30/60/120-like submission", async () => {
    const sessions: BabylonWorldRuntime[] = [];
    const hashes: string[] = [];
    try {
      for (const suffix of ["timing-30", "timing-60", "timing-120"] as const) {
        const { runtime, verified } = await createRuntime(
          "ordinary-and-blocked-steps",
        );
        void suffix;
        sessions.push(runtime);
        const entityId =
          verified.worldRuntimeBootstrap.initialControlledEntityId;
        if (suffix === "timing-30") {
          for (let index = 0; index < 30; index += 1) {
            await runtime.runFixedInput({
              actions: ["move-forward"],
              ticks: 2,
            });
          }
        } else if (suffix === "timing-60") {
          for (let index = 0; index < 60; index += 1) {
            await runtime.runFixedInput({
              actions: ["move-forward"],
              ticks: 1,
            });
          }
        } else {
          for (let index = 0; index < 120; index += 1) {
            await runtime.runFixedInput({
              actions: ["move-forward"],
              ticks: index % 2 === 0 ? 1 : 0,
            });
          }
        }
        const snapshot = runtime.snapshot();
        expect(snapshot.tick).toBe(60);
        hashes.push(sha256CanonicalJson(
          snapshot.subjectStatesByEntityId[entityId],
        ));
      }
      expect(hashes[1]).toBe(hashes[0]);
      expect(hashes[2]).toBe(hashes[0]);
    } finally {
      await Promise.all(sessions.map((session) => session.dispose()));
    }
  }, 90_000);

  it("clears Subject, Collider, listener, camera, and input owners across sequential rebind", async () => {
    const first = await createRuntime("mountain-cliff");
    const firstInternals = first.runtime as unknown as {
      scene: Scene;
      engine: NullEngine;
    };
    const firstColliderNames = firstInternals.scene.meshes
      .filter(({ name }) => name.startsWith("worldkit.native-collider."))
      .map(({ name }) => name);
    const firstEntityId =
      first.verified.worldRuntimeBootstrap.initialControlledEntityId;
    await first.runtime.runFixedInput({ actions: ["move-forward"], ticks: 20 });
    await first.runtime.dispose();
    expect(firstInternals.scene.isDisposed).toBe(true);
    expect(firstInternals.engine.isDisposed).toBe(true);
    expect(firstInternals.scene.meshes.every((mesh) => mesh.isDisposed()))
      .toBe(true);

    const second = await createRuntime("building-exterior");
    const secondInternals = second.runtime as unknown as {
      scene: Scene;
      engine: NullEngine;
    };
    try {
      const secondColliderNames = secondInternals.scene.meshes
        .filter(({ name }) => name.startsWith("worldkit.native-collider."))
        .map(({ name }) => name);
      expect(firstColliderNames.some((name) =>
        secondColliderNames.includes(name) &&
        !name.includes("player-spawn")
      )).toBe(false);
      expect(secondInternals.scene).not.toBe(firstInternals.scene);
      const secondEntityId =
        second.verified.worldRuntimeBootstrap.initialControlledEntityId;
      await resetAndBindRuntimeTestPossession(second.runtime, secondEntityId);
      const rebound = await second.runtime.runFixedInput({
        actions: [],
        ticks: 5,
      });
      expect(subjectOf(rebound, secondEntityId).movementMedium).toBe("ground");
      expect(secondEntityId).toBe(firstEntityId);
    } finally {
      await second.runtime.dispose();
    }
    expect(secondInternals.scene.isDisposed).toBe(true);
    expect(secondInternals.engine.isDisposed).toBe(true);
  }, 60_000);
});
