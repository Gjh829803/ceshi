import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.pure.js";
import { isNil } from "lodash-es";
import { afterEach, describe, expect, it } from "vitest";

import {
  recordBabylonNativeBlockCheckedEpochEvidenceV1,
  takeBabylonNativeBlockCheckedEpochEvidenceV1,
  type BabylonNativeBlockCheckedEpochEvidenceV1,
} from "./host-evidence.js";

const retainedEngines: NullEngine[] = [];

function evidence(id: string): BabylonNativeBlockCheckedEpochEvidenceV1 {
  return {
    kind: "babylon-native-block-checked-epoch-evidence",
    schemaVersion: 1,
    checkedLayout: {
      kind: "babylon-native-block-checked-layout",
      schemaVersion: 1,
      layout: {
        blocks: [],
        issues: [],
        exposedTopSurfaceCellKeys: [],
        boundarySegmentKeys: [],
        structuralStepTransitionKeys: [],
        unsupportedBlockIds: [],
      },
      checkResult: {
        kind: "babylon-native-block-profile-check-result",
        schemaVersion: 1,
        id,
        outcome: "passed",
        diagnostics: [],
        metrics: {
          blockCount: 0,
          blockCountByShape: {
            full: 0,
            half: 0,
            quarter: 0,
            small: 0,
          },
          blockCountByPaletteRole: {
            ground: 0,
            route: 0,
            structure: 0,
            hazard: 0,
            "water-like-visual": 0,
            "background-mass": 0,
          },
          occupiedMicroCellCount: 0,
          exposedTopSurfaceCellCount: 0,
          boundarySegmentCount: 0,
          structuralStepTransitionCount: 0,
          unsupportedBlockCount: 0,
          structuralRouteComponentCount: 0,
          visualGroupCount: 0,
        },
        visualGroups: [],
      },
    },
    profileInventoryHash: `sha256:${"a".repeat(64)}`,
    colliderInventory: [],
    logicalGroundModel: {
      kind: "babylon-native-block-logical-ground-model",
      schemaVersion: 1,
      identity: {
        buildEpochId: "evidence-epoch",
        checkedLayoutInventoryHash: `sha256:${"b".repeat(64)}`,
        profileInventoryHash: `sha256:${"a".repeat(64)}`,
        nativeSceneBootstrapHash: `sha256:${"c".repeat(64)}`,
      },
      declaredTraversalSurfaceProfileRefs: [],
      colliderGroups: [],
      solidOccupancyCells: [],
      exposedSupportTopCells: [],
      logicalGroundModelHash: `sha256:${"d".repeat(64)}`,
    },
    topology: {
      kind: "babylon-native-block-walkable-topology",
      schemaVersion: 1,
      identity: {
        logicalGroundModelHash: `sha256:${"d".repeat(64)}`,
        topologyPolicyHash: `sha256:${"e".repeat(64)}`,
      },
      walkableGeometries: [],
      solidGeometries: [],
      logicalColliderCount: 0,
      colliderVertexCount: 0,
      colliderTriangleCount: 0,
      removedInternalFaceCount: 0,
      topologyHash: `sha256:${"f".repeat(64)}`,
    },
    groundBoundary: {
      kind: "babylon-native-block-ground-boundary",
      schemaVersion: 1,
      derivedColliderRole: "ground-safety-boundary",
      identity: {
        topologyHash: `sha256:${"f".repeat(64)}`,
        boundaryPolicyHash: `sha256:${"1".repeat(64)}`,
      },
      sourceSegmentCount: 0,
      mergedSegmentCount: 0,
      segments: [],
      positionsMetersXYZ: [],
      triangleIndices: [],
      vertexCount: 0,
      triangleCount: 0,
      boundaryHash: `sha256:${"2".repeat(64)}`,
    },
  };
}

afterEach(() => {
  while (retainedEngines.length > 0) retainedEngines.pop()?.dispose();
});

function scene(): Scene {
  const engine = new NullEngine();
  retainedEngines.push(engine);
  return new Scene(engine);
}

function expectDeeplyFrozenPlainData(value: unknown): void {
  if (isNil(value) || typeof value !== "object") return;
  expect(Object.isFrozen(value)).toBe(true);
  expect([Object.prototype, Array.prototype]).toContain(
    Object.getPrototypeOf(value),
  );
  for (const child of Object.values(value)) {
    expectDeeplyFrozenPlainData(child);
  }
}

describe("Block Profile Host checked-epoch evidence", () => {
  it("isolates scenes, preserves multiple sessions, and consumes exactly once", () => {
    const first = scene();
    const second = scene();
    recordBabylonNativeBlockCheckedEpochEvidenceV1(first, evidence("first-a"));
    recordBabylonNativeBlockCheckedEpochEvidenceV1(first, evidence("first-b"));
    recordBabylonNativeBlockCheckedEpochEvidenceV1(second, evidence("second"));

    expect(takeBabylonNativeBlockCheckedEpochEvidenceV1(first).map(
      ({ checkedLayout }) => checkedLayout.checkResult.id,
    )).toEqual(["first-a", "first-b"]);
    expect(takeBabylonNativeBlockCheckedEpochEvidenceV1(first)).toEqual([]);
    expect(takeBabylonNativeBlockCheckedEpochEvidenceV1(second)).toHaveLength(1);
  });

  it("returns deeply frozen plain data without Scene, Mesh, or record handles", () => {
    const candidate = scene();
    recordBabylonNativeBlockCheckedEpochEvidenceV1(candidate, evidence("plain"));
    const [captured] = takeBabylonNativeBlockCheckedEpochEvidenceV1(candidate);

    expect(captured).toBeDefined();
    expectDeeplyFrozenPlainData(captured);
  });
});
