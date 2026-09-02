import { describe, expect, it } from "vitest";

import type { BabylonNativeBlockProfileCheckResultV1 } from "./check.js";
import type {
  BabylonNativeBlockStaticColliderSelectionV1,
} from "./collider-contribution.js";
import type {
  BabylonNativeBlockLayoutEntryV1,
  BabylonNativeBlockLayoutV1,
} from "./layout.js";
import {
  freezeBabylonNativeBlockLogicalGroundModelV1,
} from "./logical-ground-model.js";

const H = (digit: string) => `sha256:${digit.repeat(64)}` as const;
const STATIC_SURFACE = Object.freeze({
  kind: "static-surface" as const,
  surfaceEntityId: "ground-surface",
  logicalSubshapeId: "top",
  traversalSurfaceProfileRef:
    "worldkit://traversal-surface-profile/ground.static@1",
});
const BLOCKER = Object.freeze({ kind: "not-traversable" as const });

function block(input: Readonly<{
  id: string;
  cells: readonly string[];
  colliderGroupId?: string;
  visualGroupId?: string;
}>): BabylonNativeBlockLayoutEntryV1 {
  return Object.freeze({
    id: input.id,
    shape: "full",
    paletteRole: "ground",
    ...(input.visualGroupId === undefined
      ? {}
      : { visualGroupId: input.visualGroupId }),
    ...(input.colliderGroupId === undefined
      ? {}
      : { colliderGroupId: input.colliderGroupId }),
    centerMetersXYZ: Object.freeze([0, 0.5, 0] as const),
    rotationQuarterTurnsY: 0,
    sizeMetersXYZ: Object.freeze([1, 1, 1] as const),
    minimumMetersXYZ: Object.freeze([-0.5, 0, -0.5] as const),
    maximumMetersXYZ: Object.freeze([0.5, 1, 0.5] as const),
    occupiedMicroCellKeys: Object.freeze([...input.cells]),
  });
}

function checkedLayout(
  blocks: readonly BabylonNativeBlockLayoutEntryV1[],
  buildEpochId = "logical-ground-epoch",
): Readonly<{
  kind: "babylon-native-block-checked-layout";
  schemaVersion: 1;
  layout: BabylonNativeBlockLayoutV1;
  checkResult: BabylonNativeBlockProfileCheckResultV1;
}> {
  const sortedBlocks = Object.freeze([...blocks].sort((left, right) =>
    left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
  const grouped = new Map<string, BabylonNativeBlockLayoutEntryV1[]>();
  for (const entry of sortedBlocks) {
    if (entry.visualGroupId === undefined) continue;
    const entries = grouped.get(entry.visualGroupId) ?? [];
    entries.push(entry);
    grouped.set(entry.visualGroupId, entries);
  }
  const visualGroups = Object.freeze([...grouped.entries()]
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([id, entries]) => Object.freeze({
      id,
      blockIds: Object.freeze(entries.map(({ id: blockId }) => blockId).sort()),
      paletteRoles: Object.freeze([...new Set(
        entries.map(({ paletteRole }) => paletteRole),
      )].sort()),
      minimumMetersXYZ: Object.freeze([0, 1, 2].map((axis) =>
        Math.min(...entries.map((entry) => entry.minimumMetersXYZ[axis]!)),
      ) as [number, number, number]),
      maximumMetersXYZ: Object.freeze([0, 1, 2].map((axis) =>
        Math.max(...entries.map((entry) => entry.maximumMetersXYZ[axis]!)),
      ) as [number, number, number]),
    })));
  return Object.freeze({
    kind: "babylon-native-block-checked-layout" as const,
    schemaVersion: 1 as const,
    layout: Object.freeze({
      blocks: sortedBlocks,
      issues: Object.freeze([]),
      exposedTopSurfaceCellKeys: Object.freeze([]),
      boundarySegmentKeys: Object.freeze([]),
      structuralStepTransitionKeys: Object.freeze([]),
      unsupportedBlockIds: Object.freeze([]),
    }),
    checkResult: Object.freeze({
      kind: "babylon-native-block-profile-check-result" as const,
      schemaVersion: 1 as const,
      id: `${buildEpochId}.whitebox-blocks-check`,
      outcome: "passed" as const,
      diagnostics: Object.freeze([]),
      metrics: Object.freeze({
        blockCount: sortedBlocks.length,
        blockCountByShape: Object.freeze({
          full: sortedBlocks.length,
          half: 0,
          quarter: 0,
          small: 0,
          step: 0,
        }),
        blockCountByPaletteRole: Object.freeze({
          ground: sortedBlocks.length,
          route: 0,
          structure: 0,
          hazard: 0,
          "water-like-visual": 0,
          "background-mass": 0,
        }),
        occupiedMicroCellCount: new Set(
          sortedBlocks.flatMap(({ occupiedMicroCellKeys }) =>
            occupiedMicroCellKeys),
        ).size,
        exposedTopSurfaceCellCount: 0,
        boundarySegmentCount: 0,
        structuralStepTransitionCount: 0,
        unsupportedBlockCount: 0,
        structuralRouteComponentCount: 0,
        visualGroupCount: visualGroups.length,
      }),
      visualGroups,
    }),
  });
}

function selection(input: Readonly<{
  id: string;
  source:
    | Readonly<{ kind: "block"; blockId: string }>
    | Readonly<{ kind: "block-group"; colliderGroupId: string }>;
  traversal?: "surface" | "blocker";
}>): BabylonNativeBlockStaticColliderSelectionV1 {
  return Object.freeze({
    id: input.id,
    colliderGeometrySource: Object.freeze(input.source),
    traversalBinding: input.traversal === "blocker"
      ? BLOCKER
      : STATIC_SURFACE,
    exposedEdgePolicy: "none" as const,
  });
}

function freeze(input: Readonly<{
  blocks: readonly BabylonNativeBlockLayoutEntryV1[];
  selections: readonly BabylonNativeBlockStaticColliderSelectionV1[];
  buildEpochId?: string;
}>) {
  const buildEpochId = input.buildEpochId ?? "logical-ground-epoch";
  return freezeBabylonNativeBlockLogicalGroundModelV1({
    buildEpochId,
    checkedLayout: checkedLayout(input.blocks, buildEpochId),
    profileInventoryHash: H("1"),
    worldRuntimeBootstrapHash: H("2"),
    traversalCapabilityEnvelopeHash: H("3"),
    caseHash: H("4"),
    supportedTraversalSurfaceProfileRefs: Object.freeze([
      STATIC_SURFACE.traversalSurfaceProfileRef,
    ]),
    selections: Object.freeze([...input.selections]),
  });
}

describe("Babylon Native Block logical ground model", () => {
  it("freezes one sorted identity-bound occupancy and support inventory", () => {
    const model = freeze({
      blocks: [
        block({
          id: "ground-east",
          colliderGroupId: "ground-group",
          visualGroupId: "ground-visual",
          cells: ["1,0,0"],
        }),
        block({
          id: "ground-west",
          colliderGroupId: "ground-group",
          visualGroupId: "ground-visual",
          cells: ["0,0,0"],
        }),
        block({ id: "wall", cells: ["1,1,0"] }),
      ],
      selections: [
        selection({
          id: "wall-collider",
          source: { kind: "block", blockId: "wall" },
          traversal: "blocker",
        }),
        selection({
          id: "ground-collider",
          source: {
            kind: "block-group",
            colliderGroupId: "ground-group",
          },
        }),
      ],
    });

    expect(model.identity).toEqual({
      buildEpochId: "logical-ground-epoch",
      checkedLayoutInventoryHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      profileInventoryHash: H("1"),
      worldRuntimeBootstrapHash: H("2"),
      traversalCapabilityEnvelopeHash: H("3"),
      caseHash: H("4"),
    });
    expect(model.colliderGroups.map(({ colliderId, sourceBlockIds }) => ({
      colliderId,
      sourceBlockIds,
    }))).toEqual([
      {
        colliderId: "ground-collider",
        sourceBlockIds: ["ground-east", "ground-west"],
      },
      { colliderId: "wall-collider", sourceBlockIds: ["wall"] },
    ]);
    expect(model.solidOccupancyCells.map(({ cellKey, colliderId }) => ({
      cellKey,
      colliderId,
    }))).toEqual([
      { cellKey: "0,0,0", colliderId: "ground-collider" },
      { cellKey: "1,0,0", colliderId: "ground-collider" },
      { cellKey: "1,1,0", colliderId: "wall-collider" },
    ]);
    expect(model.exposedSupportTopCells.map(({ topCellKey, sourceBlockId }) =>
      ({ topCellKey, sourceBlockId }))).toEqual([
      { topCellKey: "0,1,0", sourceBlockId: "ground-west" },
    ]);
    expect(model.logicalGroundModelHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(Object.isFrozen(model)).toBe(true);
    expect(Object.isFrozen(model.solidOccupancyCells)).toBe(true);
  });

  it("is deterministic across Block and selection order", () => {
    const blocks = [
      block({
        id: "floor-left",
        colliderGroupId: "floor-group",
        cells: ["0,0,0"],
      }),
      block({
        id: "floor-right",
        colliderGroupId: "floor-group",
        cells: ["1,0,0"],
      }),
      block({ id: "pillar", cells: ["2,0,0"] }),
    ];
    const selections = [
      selection({ id: "floor-collider", source: {
        kind: "block-group", colliderGroupId: "floor-group",
      } }),
      selection({ id: "pillar-collider", source: {
        kind: "block", blockId: "pillar",
      }, traversal: "blocker" }),
    ];

    const first = freeze({ blocks, selections });
    const second = freeze({
      blocks: [...blocks].reverse(),
      selections: [...selections].reverse(),
    });

    expect(second).toEqual(first);
    expect(second.logicalGroundModelHash).toBe(first.logicalGroundModelHash);
  });

  it("keeps unsupported static surfaces solid but out of support tops", () => {
    const result = freezeBabylonNativeBlockLogicalGroundModelV1({
      buildEpochId: "unsupported-surface-epoch",
      checkedLayout: checkedLayout([
        block({ id: "ground-block", cells: ["0,0,0"] }),
      ], "unsupported-surface-epoch"),
      profileInventoryHash: H("1"),
      worldRuntimeBootstrapHash: H("2"),
      traversalCapabilityEnvelopeHash: H("3"),
      caseHash: H("4"),
      supportedTraversalSurfaceProfileRefs: Object.freeze([]),
      selections: Object.freeze([selection({ id: "ground", source: {
        kind: "block", blockId: "ground-block",
      } })]),
    });

    expect(result.solidOccupancyCells).toHaveLength(1);
    expect(result.exposedSupportTopCells).toEqual([]);
  });

  it.each([
    ["empty group", [block({ id: "only-block", cells: ["0,0,0"] })], [
      selection({ id: "missing-group", source: {
        kind: "block-group", colliderGroupId: "empty-group",
      } }),
    ], "WORLDKIT_NATIVE_BLOCK_LOGICAL_GROUND_SOURCE_MISSING"],
    ["missing Block", [block({ id: "only-block", cells: ["0,0,0"] })], [
      selection({ id: "missing-block", source: {
        kind: "block", blockId: "other-block",
      } }),
    ], "WORLDKIT_NATIVE_BLOCK_LOGICAL_GROUND_SOURCE_MISSING"],
    ["duplicate group", [block({
      id: "group-block", colliderGroupId: "group-one", cells: ["0,0,0"],
    })], [
      selection({ id: "group-a", source: {
        kind: "block-group", colliderGroupId: "group-one",
      } }),
      selection({ id: "group-b", source: {
        kind: "block-group", colliderGroupId: "group-one",
      }, traversal: "blocker" }),
    ], "WORLDKIT_NATIVE_BLOCK_LOGICAL_GROUND_SOURCE_DUPLICATE"],
    ["group and singleton overlap", [block({
      id: "group-block", colliderGroupId: "group-one", cells: ["0,0,0"],
    })], [
      selection({ id: "group", source: {
        kind: "block-group", colliderGroupId: "group-one",
      } }),
      selection({ id: "single", source: {
        kind: "block", blockId: "group-block",
      } }),
    ], "WORLDKIT_NATIVE_BLOCK_LOGICAL_GROUND_SOURCE_DUPLICATE"],
  ])("rejects %s", (_name, blocks, selections, code) => {
    expect(() => freeze({ blocks, selections })).toThrow(code);
  });

  it("rejects cross-Epoch checked Layout identity", () => {
    expect(() => freezeBabylonNativeBlockLogicalGroundModelV1({
      buildEpochId: "current-epoch",
      checkedLayout: checkedLayout([
        block({ id: "ground-block", cells: ["0,0,0"] }),
      ], "foreign-epoch"),
      profileInventoryHash: H("1"),
      worldRuntimeBootstrapHash: H("2"),
      traversalCapabilityEnvelopeHash: H("3"),
      caseHash: H("4"),
      supportedTraversalSurfaceProfileRefs: Object.freeze([
        STATIC_SURFACE.traversalSurfaceProfileRef,
      ]),
      selections: Object.freeze([selection({ id: "ground", source: {
        kind: "block", blockId: "ground-block",
      } })]),
    })).toThrow("WORLDKIT_NATIVE_BLOCK_LOGICAL_GROUND_IDENTITY_MISMATCH");
  });

  it("rejects accessor-bearing input without invoking the accessor", () => {
    let accessCount = 0;
    const hostile = Object.freeze(Object.defineProperty({}, "buildEpochId", {
      enumerable: true,
      get(): string {
        accessCount += 1;
        return "hostile-epoch";
      },
    }));

    expect(() => freezeBabylonNativeBlockLogicalGroundModelV1(
      hostile as never,
    )).toThrow("WORLDKIT_NATIVE_BLOCK_LOGICAL_GROUND_INPUT_INVALID");
    expect(accessCount).toBe(0);
  });

  it("binds every external authority hash into model identity", () => {
    const blocks = [block({ id: "ground-block", cells: ["0,0,0"] })];
    const selections = [selection({ id: "ground", source: {
      kind: "block", blockId: "ground-block",
    } })];
    const base = {
      buildEpochId: "logical-ground-epoch",
      checkedLayout: checkedLayout(blocks),
      profileInventoryHash: H("1"),
      worldRuntimeBootstrapHash: H("2"),
      traversalCapabilityEnvelopeHash: H("3"),
      caseHash: H("4"),
      supportedTraversalSurfaceProfileRefs: Object.freeze([
        STATIC_SURFACE.traversalSurfaceProfileRef,
      ]),
      selections: Object.freeze(selections),
    } as const;
    const original = freezeBabylonNativeBlockLogicalGroundModelV1(base);

    for (const [key, value] of [
      ["profileInventoryHash", H("5")],
      ["worldRuntimeBootstrapHash", H("6")],
      ["traversalCapabilityEnvelopeHash", H("7")],
      ["caseHash", H("8")],
    ] as const) {
      const changed = freezeBabylonNativeBlockLogicalGroundModelV1({
        ...base,
        [key]: value,
      });
      expect(changed.logicalGroundModelHash).not.toBe(
        original.logicalGroundModelHash,
      );
    }
  });
});
