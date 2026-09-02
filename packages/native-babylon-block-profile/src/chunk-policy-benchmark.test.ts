import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import {
  createBabylonNativeHostRandomV1,
  defineBabylonNativeScene,
  type BabylonNativeSceneBuildContextV1,
} from "@whitebox-world/native-babylon";
import { admitBabylonNativeSceneCandidateV1 } from
  "@whitebox-world/native-babylon/host";
import { describe, expect, it } from "vitest";

import {
  BABYLON_NATIVE_BLOCK_CHUNK_POLICY_CANDIDATES_V1,
  BABYLON_NATIVE_BLOCK_CURRENT_CHUNK_POLICY_HASH_V1,
  BABYLON_NATIVE_BLOCK_CURRENT_CHUNK_POLICY_V1,
} from "./chunk-policy.js";
import {
  BABYLON_NATIVE_BLOCK_CHUNK_POLICY_PENDING_CASE_SLOTS_V1,
  measureBabylonNativeBlockChunkPolicyBenchmarkV1,
} from "./chunk-policy-benchmark.js";
import type { BabylonNativeBlockFinalizedEpochV1 } from "./session.js";
import {
  materializeBabylonNativeBlockReconstructionCorpusCaseV1,
  type BabylonNativeBlockReconstructionCorpusCaseIdV1,
} from "./testing.js";

const POSITIVE_CASE_IDS = [
  "building-exterior",
  "limited-interior",
  "mountain-cliff",
  "ordinary-and-blocked-steps",
  "t-shaped-traversal",
] as const satisfies readonly BabylonNativeBlockReconstructionCorpusCaseIdV1[];

function bootstrap(caseId: string): BabylonNativeSceneBuildContextV1["bootstrap"] {
  return Object.freeze({
    kind: "babylon-native-scene-bootstrap" as const,
    schemaVersion: 1 as const,
    id: `chunk-benchmark-${caseId}`,
    sceneModuleRef: `worldkit://native-scene/chunk-benchmark-${caseId}@1`,
    nativeSceneApiRef: "worldkit://native-scene-api/babylon@1",
    nativeSceneProfileRef: "worldkit://native-scene-profile/whitebox.blocks@1",
    gameplayBootstrapRef:
      `worldkit://gameplay-bootstrap/chunk-benchmark-${caseId}@1`,
    initialControlledEntityId: "player",
    gravityMetersPerSecondSquaredXYZ: Object.freeze([0, -9.81, 0] as const),
    initialCamera: Object.freeze({
      mode: "third-person" as const,
      pitchRadians: 0.2,
      distanceMeters: 5,
      fovDegrees: 60,
      targetHeightMeters: 1.2,
    }),
    seed: 202609021,
    spawnMarkerId: "player-spawn",
  });
}

async function measureCorpusEpochs(): Promise<
  readonly Readonly<{
    caseId: string;
    finalizedEpoch: BabylonNativeBlockFinalizedEpochV1;
  }>[]
> {
  const measured: Array<Readonly<{
    caseId: string;
    finalizedEpoch: BabylonNativeBlockFinalizedEpochV1;
  }>> = [];
  for (const caseId of POSITIVE_CASE_IDS) {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    try {
      let materialization: ReturnType<
        typeof materializeBabylonNativeBlockReconstructionCorpusCaseV1
      > | undefined;
      const admission = await admitBabylonNativeSceneCandidateV1({
        candidate: Object.freeze({ engine, scene }),
        hostDerivedStaticColliders: Object.freeze([]),
        bootstrap: bootstrap(caseId),
        module: defineBabylonNativeScene({
          kind: "babylon-native-scene-module",
          id: `chunk-benchmark-${caseId}-module`,
          build(buildContext): void {
            materialization =
              materializeBabylonNativeBlockReconstructionCorpusCaseV1(
                buildContext,
                caseId,
              );
          },
        }),
        assets: Object.freeze({
          async resolve(): Promise<never> {
            throw new Error("chunk benchmark fixture has no assets");
          },
        }),
        budget: Object.freeze({
          maximumStaticColliderCount: 24,
          maximumStaticColliderVertexCount: 1_024,
          maximumStaticColliderTriangleCount: 1_024,
        }),
      });
      if (
        admission.outcome !== "passed" ||
        materialization?.outcome !== "finalized"
      ) throw new Error(`${caseId} did not finalize`);
      measured.push(Object.freeze({
        caseId,
        finalizedEpoch: materialization.epoch,
      }));
    } finally {
      scene.dispose();
      engine.dispose();
    }
  }
  return Object.freeze(measured);
}

describe("NBR-65F Chunk policy benchmark", () => {
  it("re-derives the frozen policy from every positive Corpus Case", async () => {
    const measuredCases = await measureCorpusEpochs();
    const benchmark = measureBabylonNativeBlockChunkPolicyBenchmarkV1({
      candidatePolicies: BABYLON_NATIVE_BLOCK_CHUNK_POLICY_CANDIDATES_V1,
      measuredCases,
      pendingCaseSlots: BABYLON_NATIVE_BLOCK_CHUNK_POLICY_PENDING_CASE_SLOTS_V1,
    });
    expect(benchmark.measuredCaseIds).toEqual([...POSITIVE_CASE_IDS]);
    expect(benchmark.policyRows.map(({ policyId }) => policyId)).toEqual([
      "chunk-xz-16m",
      "chunk-xz-2m",
      "chunk-xz-4m",
      "chunk-xz-8m",
    ]);
    expect(Object.fromEntries(benchmark.policyRows.map((row) =>
      [row.policyId, row.totals]))).toEqual({
      "chunk-xz-2m": {
        baselineVisualDrawUnitCount: 48,
        baselineColliderProxyCount: 10,
        visualDrawUnitCount: 30,
        visualGeometryBufferSetCount: 30,
        thinInstanceBatchCount: 15,
        independentVisualMeshCount: 15,
        residencyGroupCount: 23,
        colliderProxyCount: 10,
        colliderTriangleCount: 1440,
      },
      "chunk-xz-4m": {
        baselineVisualDrawUnitCount: 48,
        baselineColliderProxyCount: 10,
        visualDrawUnitCount: 25,
        visualGeometryBufferSetCount: 25,
        thinInstanceBatchCount: 17,
        independentVisualMeshCount: 8,
        residencyGroupCount: 16,
        colliderProxyCount: 10,
        colliderTriangleCount: 1440,
      },
      "chunk-xz-8m": {
        baselineVisualDrawUnitCount: 48,
        baselineColliderProxyCount: 10,
        visualDrawUnitCount: 25,
        visualGeometryBufferSetCount: 25,
        thinInstanceBatchCount: 17,
        independentVisualMeshCount: 8,
        residencyGroupCount: 16,
        colliderProxyCount: 10,
        colliderTriangleCount: 1440,
      },
      "chunk-xz-16m": {
        baselineVisualDrawUnitCount: 48,
        baselineColliderProxyCount: 10,
        visualDrawUnitCount: 25,
        visualGeometryBufferSetCount: 25,
        thinInstanceBatchCount: 17,
        independentVisualMeshCount: 8,
        residencyGroupCount: 16,
        colliderProxyCount: 10,
        colliderTriangleCount: 1440,
      },
    });
    expect(benchmark.selection).toEqual({
      selectedPolicyId: BABYLON_NATIVE_BLOCK_CURRENT_CHUNK_POLICY_V1.id,
      selectedPolicyHash: BABYLON_NATIVE_BLOCK_CURRENT_CHUNK_POLICY_HASH_V1,
      selectionRule:
        "minimum-total-visual-draw-units-then-minimum-peak-residency-block-count-then-finest-chunk-edge-then-lexicographic-policy-id",
      isRealCaseEvidenceComplete: false,
      pendingRealCaseIds: ["petrified-primordial-forest"],
    });
    expect(benchmark.benchmarkHash).toMatch(/^sha256:[0-9a-f]{64}$/);

    const replay = measureBabylonNativeBlockChunkPolicyBenchmarkV1({
      candidatePolicies: [...BABYLON_NATIVE_BLOCK_CHUNK_POLICY_CANDIDATES_V1]
        .reverse(),
      measuredCases: [...measuredCases].reverse(),
      pendingCaseSlots: BABYLON_NATIVE_BLOCK_CHUNK_POLICY_PENDING_CASE_SLOTS_V1,
    });
    expect(replay).toEqual(benchmark);
  });

  it("keeps the petrified-forest Case declared and unmeasured", () => {
    expect(BABYLON_NATIVE_BLOCK_CHUNK_POLICY_PENDING_CASE_SLOTS_V1).toEqual([{
      kind: "babylon-native-block-chunk-policy-pending-case-slot",
      schemaVersion: 1,
      caseId: "petrified-primordial-forest",
      referenceLabel: "024_petrified_primordial_forest.png",
      measurementStatus: "not-run",
      ownerTask: "NBR-65I",
    }]);
  });

  it("rejects a benchmark that cannot compare or replay", async () => {
    const measuredCases = await measureCorpusEpochs();
    const single = [BABYLON_NATIVE_BLOCK_CURRENT_CHUNK_POLICY_V1];
    expect(() => measureBabylonNativeBlockChunkPolicyBenchmarkV1({
      candidatePolicies: single,
      measuredCases,
      pendingCaseSlots: [],
    })).toThrow(/CHUNK_POLICY_BENCHMARK_INPUT_INVALID/);
    expect(() => measureBabylonNativeBlockChunkPolicyBenchmarkV1({
      candidatePolicies: BABYLON_NATIVE_BLOCK_CHUNK_POLICY_CANDIDATES_V1,
      measuredCases: [],
      pendingCaseSlots: [],
    })).toThrow(/CHUNK_POLICY_BENCHMARK_INPUT_INVALID/);
    expect(() => measureBabylonNativeBlockChunkPolicyBenchmarkV1({
      candidatePolicies: BABYLON_NATIVE_BLOCK_CHUNK_POLICY_CANDIDATES_V1,
      measuredCases: [...measuredCases, measuredCases[0]!],
      pendingCaseSlots: [],
    })).toThrow(/CHUNK_POLICY_BENCHMARK_INPUT_INVALID/);
    expect(() => measureBabylonNativeBlockChunkPolicyBenchmarkV1({
      candidatePolicies: BABYLON_NATIVE_BLOCK_CHUNK_POLICY_CANDIDATES_V1,
      measuredCases,
      pendingCaseSlots: [Object.freeze({
        ...BABYLON_NATIVE_BLOCK_CHUNK_POLICY_PENDING_CASE_SLOTS_V1[0]!,
        measurementStatus: "passed",
      })] as never,
    })).toThrow(/CHUNK_POLICY_BENCHMARK_INPUT_INVALID/);
    expect(() => measureBabylonNativeBlockChunkPolicyBenchmarkV1({
      candidatePolicies: BABYLON_NATIVE_BLOCK_CHUNK_POLICY_CANDIDATES_V1,
      measuredCases,
      pendingCaseSlots: [Object.freeze({
        ...BABYLON_NATIVE_BLOCK_CHUNK_POLICY_PENDING_CASE_SLOTS_V1[0]!,
        caseId: "mountain-cliff",
      })],
    })).toThrow(/CHUNK_POLICY_BENCHMARK_INPUT_INVALID/);
  });
});
