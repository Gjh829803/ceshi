import { sha256CanonicalJson, type Sha256HashV1 } from
  "@whitebox-world/protocol";
import {
  BUILT_IN_NATIVE_BLOCK_GROUND_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF,
  createTraversalCapabilityEnvelopeV1,
  resolveTraversalGraphBuilderProfileV2,
  resolveTraversalLockV1,
  type ResolvedTraversalLockV1,
  type TraversalCapabilityEnvelopeReceiptV1,
} from "@whitebox-world/traversal";
import { describe, expect, it } from "vitest";

import {
  BABYLON_NATIVE_BLOCK_CURRENT_CHUNK_POLICY_V1,
} from "./chunk-policy.js";
import {
  analyzeBabylonNativeBlockGroundV1,
  analyzeBabylonNativeBlockSourceGroundV1,
  type BabylonNativeBlockGroundAnalysisBudgetV1,
  type BabylonNativeBlockGroundCaseIntentV1,
} from "./ground-analysis.js";
import {
  BABYLON_NATIVE_BLOCK_CURRENT_WALKABLE_TOPOLOGY_POLICY_V1,
  buildBabylonNativeBlockWalkableTopologyV1,
} from "./walkable-topology.js";
import type {
  BabylonNativeBlockLogicalGroundModelV1,
  BabylonNativeBlockLogicalSolidOccupancyCellV1,
  BabylonNativeBlockLogicalSupportTopCellV1,
} from "./logical-ground-model.js";

const H = (digit: string) => `sha256:${digit.repeat(64)}` as Sha256HashV1;
const CASE_HASH = H("4");
const PACKAGE_HASH = H("5");
const MEASUREMENT_CHUNK_POLICY = BABYLON_NATIVE_BLOCK_CURRENT_CHUNK_POLICY_V1;
const ANALYSIS_BUDGET = Object.freeze({
  kind: "babylon-native-block-ground-analysis-budget" as const,
  schemaVersion: 1 as const,
  maximumSolidOccupancyCellCount: 50_000,
  maximumSupportTopCellCount: 50_000,
});
const STATIC_SURFACE = Object.freeze({
  kind: "static-surface" as const,
  surfaceEntityId: "ground-surface",
  logicalSubshapeId: "top",
  traversalSurfaceProfileRef:
    "worldkit://traversal-surface-profile/ground.static@1",
});

function capability(
  overrides: Partial<ResolvedTraversalLockV1> = {},
): TraversalCapabilityEnvelopeReceiptV1 {
  const lock: ResolvedTraversalLockV1 = {
    kind: "resolved-traversal-lock",
    schemaVersion: 1,
    subjectEntityId: "player",
    resourceLockHash: H("a"),
    subjectDefinitionRef: "worldkit://subject-definition/humanoid.g-bot@2",
    subjectDefinitionHash: H("a"),
    colliderSource: { kind: "profile", colliderProfileRef: "worldkit://collider-profile/humanoid.medium-capsule@1", colliderProfileHash: H("a") },
    physicsBodyProfileRef: "worldkit://physics-body-profile/character.medium@1",
    physicsBodyProfileHash: H("a"),
    locomotionProfileRef: "worldkit://locomotion-profile/ground.standard@1",
    locomotionProfileHash: H("a"),
    locomotionCapabilityRef: "worldkit://capability/locomotion.ground@1",
    locomotionCapabilityHash: H("a"),
    controlFeelProfileRef: "worldkit://control-feel-profile/humanoid.medium-ground@1",
    controlFeelProfileHash: H("a"),
    controlProfileRef: "worldkit://control-profile/planar.camera-relative@1",
    controlProfileHash: H("a"),
    motionProfileRef: "worldkit://motion-profile/free-ground.humanoid-medium@1",
    motionProfileHash: H("a"),
    motionKernelRef: "worldkit://motion-kernel/free-ground@1",
    motionKernelHash: H("a"),
    mediumProfileRef: "worldkit://medium-profile/ground-air.standard@1",
    mediumProfileHash: H("a"),
    runtimeBackendRef: "worldkit://runtime-backend/babylon-havok@1",
    runtimeBackendResolvedVersion: "9.23.0+1.3.14",
    runtimeBackendHash: H("a"),
    runtimeAdapterRef: "worldkit://runtime-adapter/babylon.character-controller@1",
    runtimeAdapterResolvedVersion: "1",
    runtimeAdapterHash: H("b"),
    capsuleRadiusMeters: 0.2,
    capsuleHeightMeters: 1,
    colliderCenterOffsetMetersXYZ: [0, 0.5, 0],
    maxSlopeDegrees: 42,
    maxStepHeightMeters: 0.3,
    ...overrides,
  };
  return createTraversalCapabilityEnvelopeV1({
    traversalLockReceipt: resolveTraversalLockV1(lock),
    graphBuilderProfile: resolveTraversalGraphBuilderProfileV2(
      BUILT_IN_NATIVE_BLOCK_GROUND_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF,
    ),
  });
}

function logicalModel(input: Readonly<{
  capability: TraversalCapabilityEnvelopeReceiptV1;
  supportTopCellKeys: readonly string[];
  supportOccupiedCellKeys?: readonly string[];
  blockerCellKeys?: readonly string[];
  supportSourceBlockIdByTopCellKey?: Readonly<Record<string, string>>;
}>): BabylonNativeBlockLogicalGroundModelV1 {
  const supportTopCellKeys = [...input.supportTopCellKeys].sort();
  const supportSolidKeys = [...(input.supportOccupiedCellKeys ??
    supportTopCellKeys.map((key) => {
      const [x, y, z] = key.split(",").map(Number);
      return `${x},${y! - 1},${z}`;
    }))].sort();
  const blockerCellKeys = [...(input.blockerCellKeys ?? [])].sort();
  const supportBinding = STATIC_SURFACE;
  const solids: BabylonNativeBlockLogicalSolidOccupancyCellV1[] = [
    ...supportSolidKeys.map((cellKey, index) => {
      const [x, y, z] = cellKey.split(",").map(Number);
      const topCellKey = `${x},${y! + 1},${z}`;
      return Object.freeze({
      cellKey,
      colliderId: "ground-collider",
      sourceBlockId: input.supportSourceBlockIdByTopCellKey?.[topCellKey] ??
        `ground-block-${index.toString().padStart(4, "0")}`,
      colliderGroupId: "ground-group",
      visualGroupId: "ground-visual",
      traversalBinding: supportBinding,
      });
    }),
    ...blockerCellKeys.map((cellKey, index) => Object.freeze({
      cellKey,
      colliderId: "blocker-collider",
      sourceBlockId: `blocker-block-${index.toString().padStart(4, "0")}`,
      colliderGroupId: "blocker-group",
      visualGroupId: "blocker-visual",
      traversalBinding: Object.freeze({ kind: "not-traversable" as const }),
    })),
  ].sort((left, right) => left.cellKey.localeCompare(right.cellKey));
  const supportTops: BabylonNativeBlockLogicalSupportTopCellV1[] =
    supportTopCellKeys.map((topCellKey, index) => Object.freeze({
      topCellKey,
      sourceOccupiedCellKey: supportSolidKeys[index]!,
      colliderId: "ground-collider",
      sourceBlockId: input.supportSourceBlockIdByTopCellKey?.[topCellKey] ??
        `ground-block-${index.toString().padStart(4, "0")}`,
      colliderGroupId: "ground-group",
      visualGroupId: "ground-visual",
      traversalBinding: supportBinding,
    }));
  const colliderGroups = Object.freeze([
    Object.freeze({
      colliderId: "ground-collider",
      colliderGeometrySource: Object.freeze({
        kind: "block-group" as const,
        colliderGroupId: "ground-group",
      }),
      sourceBlockIds: Object.freeze([...new Set(
        solids.filter(({ colliderId }) => colliderId === "ground-collider")
          .map(({ sourceBlockId }) => sourceBlockId),
      )].sort()),
      visualGroupIds: Object.freeze(["ground-visual"]),
      traversalBinding: supportBinding,
      exposedEdgePolicy: "none" as const,
      occupiedMicroCellKeys: Object.freeze([...supportSolidKeys]),
    }),
    ...(blockerCellKeys.length === 0 ? [] : [Object.freeze({
      colliderId: "blocker-collider",
      colliderGeometrySource: Object.freeze({
        kind: "block-group" as const,
        colliderGroupId: "blocker-group",
      }),
      sourceBlockIds: Object.freeze([...new Set(
        solids.filter(({ colliderId }) => colliderId === "blocker-collider")
          .map(({ sourceBlockId }) => sourceBlockId),
      )].sort()),
      visualGroupIds: Object.freeze(["blocker-visual"]),
      traversalBinding: Object.freeze({ kind: "not-traversable" as const }),
      exposedEdgePolicy: "none" as const,
      occupiedMicroCellKeys: Object.freeze([...blockerCellKeys]),
    })]),
  ]);
  const body = Object.freeze({
    kind: "babylon-native-block-logical-ground-model" as const,
    schemaVersion: 1 as const,
    identity: Object.freeze({
      buildEpochId: "ground-analysis-epoch",
      checkedLayoutInventoryHash: H("1"),
      profileInventoryHash: H("2"),
      nativeSceneBootstrapHash: H("3"),
    }),
    declaredTraversalSurfaceProfileRefs: Object.freeze([
      STATIC_SURFACE.traversalSurfaceProfileRef,
    ]),
    colliderGroups,
    solidOccupancyCells: Object.freeze(solids),
    exposedSupportTopCells: Object.freeze(supportTops),
  });
  return Object.freeze({
    ...body,
    logicalGroundModelHash: sha256CanonicalJson(body) as Sha256HashV1,
  });
}

function position(topCellKey: string): readonly [number, number, number] {
  const [x, y, z] = topCellKey.split(",").map(Number);
  return Object.freeze([(x! + 0.5) * 0.5, y! * 0.5, (z! + 0.5) * 0.5]);
}

function caseIntent(input: Partial<BabylonNativeBlockGroundCaseIntentV1> &
  Pick<BabylonNativeBlockGroundCaseIntentV1, "spawn">,
): BabylonNativeBlockGroundCaseIntentV1 {
  return Object.freeze({
    kind: "babylon-native-block-ground-case-intent",
    schemaVersion: 1,
    id: "ground-case",
    caseHash: CASE_HASH,
    groundFailurePolicy: "block-admission",
    groundModelEvidenceRef:
      "artifact://case/ground-case/evidence/logical-ground-model.json",
    requiredTargets: Object.freeze([]),
    requiredTraversalBands: Object.freeze([]),
    requireSingleReachableComponent: true,
    ...input,
  });
}

function analyze(input: Readonly<{
  supportTopCellKeys: readonly string[];
  supportOccupiedCellKeys?: readonly string[];
  blockerCellKeys?: readonly string[];
  supportSourceBlockIdByTopCellKey?: Readonly<Record<string, string>>;
  capabilityOverrides?: Partial<ResolvedTraversalLockV1>;
  caseIntent: BabylonNativeBlockGroundCaseIntentV1;
  budget?: BabylonNativeBlockGroundAnalysisBudgetV1;
}>) {
  const receipt = capability(input.capabilityOverrides);
  const groundModel = logicalModel({
    capability: receipt,
    supportTopCellKeys: input.supportTopCellKeys,
    ...(input.supportOccupiedCellKeys === undefined
      ? {}
      : { supportOccupiedCellKeys: input.supportOccupiedCellKeys }),
    ...(input.blockerCellKeys === undefined
      ? {}
      : { blockerCellKeys: input.blockerCellKeys }),
    ...(input.supportSourceBlockIdByTopCellKey === undefined
      ? {}
      : {
          supportSourceBlockIdByTopCellKey:
            input.supportSourceBlockIdByTopCellKey,
        }),
  });
  return analyzeBabylonNativeBlockGroundV1({
    groundModel,
    walkableTopology: buildBabylonNativeBlockWalkableTopologyV1({
      groundModel,
      policy: BABYLON_NATIVE_BLOCK_CURRENT_WALKABLE_TOPOLOGY_POLICY_V1,
    }),
    traversalCapabilityEnvelopeReceipt: receipt,
    caseIntent: input.caseIntent,
    worldPackageRootHash: PACKAGE_HASH,
    measurementChunkPolicy: MEASUREMENT_CHUNK_POLICY,
    budget: input.budget ?? ANALYSIS_BUDGET,
  });
}

function rectangle(
  minimumX: number,
  maximumX: number,
  minimumZ: number,
  maximumZ: number,
  topY = 1,
): readonly string[] {
  const cells: string[] = [];
  for (let z = minimumZ; z <= maximumZ; z += 1) {
    for (let x = minimumX; x <= maximumX; x += 1) {
      cells.push(`${x},${topY},${z}`);
    }
  }
  return Object.freeze(cells);
}

const SPAWN = Object.freeze({
  id: "spawn-check",
  acceptanceTargetRef: "worldkit://acceptance-target/spawn@1",
  standPositionMetersXYZ: position("0,1,0"),
  openingYawQuarterTurnsY: 0 as const,
  openingFovDegrees: 60,
});

describe("Babylon Native Block Subject-relative ground analysis", () => {
  it.each(["supported", "hole", "headroom", "optional"] as const)(
    "keeps source feedback equal to formal Ground without forged identity: %s", (scenario) => {
      const receipt = capability();
      const groundModel = logicalModel({
        capability: receipt,
        supportTopCellKeys: scenario === "hole" ? [] : rectangle(-2, 3, -2, 3),
        blockerCellKeys: scenario === "headroom" ? ["0,2,0"] : [],
      });
      const intent = caseIntent({ spawn: SPAWN,
        ...(scenario === "optional" ? { groundFailurePolicy: "measure-only", requireSingleReachableComponent: false } : {}),
      });
      const { caseHash: _caseHash, ...sourceIntent } = intent;
      const { identity: _identity, logicalGroundModelHash: _hash, kind: _kind, schemaVersion: _version, ...geometry } = groundModel;
      const sourceInput = { groundModel: geometry, envelope: receipt.envelope,
        caseIntent: sourceIntent, measurementChunkPolicy: MEASUREMENT_CHUNK_POLICY, budget: ANALYSIS_BUDGET };
      const before = JSON.stringify(sourceInput);
      const source = analyzeBabylonNativeBlockSourceGroundV1(sourceInput);
      const formal = analyzeBabylonNativeBlockGroundV1({ groundModel,
        walkableTopology: buildBabylonNativeBlockWalkableTopologyV1({ groundModel, policy: BABYLON_NATIVE_BLOCK_CURRENT_WALKABLE_TOPOLOGY_POLICY_V1 }),
        traversalCapabilityEnvelopeReceipt: receipt, caseIntent: intent,
        worldPackageRootHash: PACKAGE_HASH, measurementChunkPolicy: MEASUREMENT_CHUNK_POLICY, budget: ANALYSIS_BUDGET });
      const { identity: _formalIdentity, kind: _formalKind, schemaVersion: _formalVersion, ...analysis } = formal;
      expect(source).toEqual(analysis);
      expect(source).not.toHaveProperty("identity");
      expect(JSON.stringify(sourceInput)).toBe(before);
    },
  );

  it("uses the legacy Capsule radius without an added clearance footprint", () => {
    // Radius .35 reaches the four adjacent cells but not the diagonal corners
    // (.353553m away). The old catalog publishes exactly collider.radiusMeters.
    const report = analyze({
      capabilityOverrides: { capsuleRadiusMeters: 0.35 },
      supportTopCellKeys: ["0,1,0", "-1,1,0", "1,1,0", "0,1,-1", "0,1,1"],
      caseIntent: caseIntent({ spawn: SPAWN }),
    });
    expect(report.admissionOutcome).toBe("passed");
    expect(report.failureFacts).toEqual([]);
  });

  it("publishes deterministic standability, connectivity, band and report metrics", () => {
    const target = Object.freeze({
      id: "remote-target",
      acceptanceTargetRef: "worldkit://acceptance-target/remote@1",
      standPositionMetersXYZ: position("4,1,0"),
    });
    const result = analyze({
      supportTopCellKeys: rectangle(-1, 5, -1, 1),
      caseIntent: caseIntent({
        spawn: SPAWN,
        requiredTargets: Object.freeze([target]),
        requiredTraversalBands: Object.freeze([{
          id: "main-band",
          acceptanceTargetRef: target.acceptanceTargetRef,
          centerlineStandPositionsMetersXYZ: Object.freeze([
            SPAWN.standPositionMetersXYZ,
            target.standPositionMetersXYZ,
          ]),
          halfWidthMeters: 0.5, isBidirectional: true,
        }]),
      }),
    });

    expect(result.failureFacts).toEqual([]);
    expect(result.analysisOutcome).toBe("passed");
    expect(result.admissionOutcome).toBe("passed");
    expect(result.metrics.reachableRequiredTargetCount).toBe(1);
    expect(result.metrics.reachableRequiredTraversalBandCount).toBe(1);
    expect(result.metrics.reachablePositionCount).toBeGreaterThan(5);
    expect(result.metrics.reachableHorizontalSpanMetersXZ).toEqual([3.5, 1.5]);
    expect(result.metrics.reachableChunkCount).toBe(1);
    expect(result.identity).toEqual({
      logicalGroundModelHash: expect.stringMatching(/^sha256:/),
      walkableTopologyHash: expect.stringMatching(/^sha256:/),
      traversalCapabilityEnvelopeHash: expect.stringMatching(/^sha256:/),
      caseHash: CASE_HASH,
      worldPackageRootHash: PACKAGE_HASH,
      measurementChunkPolicyHash: sha256CanonicalJson(
        MEASUREMENT_CHUNK_POLICY,
      ),
    });
    expect(Object.isFrozen(result.standableNodes)).toBe(true);
  });

  it("rejects a final topology bound to a different logical Ground Model", () => {
    const receipt = capability();
    const groundModel = logicalModel({
      capability: receipt,
      supportTopCellKeys: rectangle(-1, 1, -1, 1),
    });
    const topology = buildBabylonNativeBlockWalkableTopologyV1({
      groundModel,
      policy: BABYLON_NATIVE_BLOCK_CURRENT_WALKABLE_TOPOLOGY_POLICY_V1,
    });
    const { topologyHash: _topologyHash, ...topologyBody } = topology;
    const mismatchedBody = Object.freeze({
      ...topologyBody,
      identity: Object.freeze({
        ...topology.identity,
        logicalGroundModelHash: H("f"),
      }),
    });

    expect(() => analyzeBabylonNativeBlockGroundV1({
      groundModel,
      walkableTopology: Object.freeze({
        ...mismatchedBody,
        topologyHash: sha256CanonicalJson(mismatchedBody) as Sha256HashV1,
      }),
      traversalCapabilityEnvelopeReceipt: receipt,
      caseIntent: caseIntent({ spawn: SPAWN }),
      worldPackageRootHash: PACKAGE_HASH,
      measurementChunkPolicy: MEASUREMENT_CHUNK_POLICY,
      budget: ANALYSIS_BUDGET,
    })).toThrow("WORLDKIT_NATIVE_BLOCK_GROUND_ANALYSIS_IDENTITY_MISMATCH");
  });

  it("ports v2 Block-center stand samples across one admitted shared-edge step", () => {
    const lowerTopCellKeys = rectangle(-1, 0, 0, 1, 1);
    const upperTopCellKeys = rectangle(-1, 0, -2, -1, 2);
    const sourceByTopCellKey = Object.fromEntries([
      ...lowerTopCellKeys.map((key) => [key, "lower-tread"] as const),
      ...upperTopCellKeys.map((key) => [key, "upper-tread"] as const),
    ]);
    const spawn = Object.freeze({
      ...SPAWN,
      standPositionMetersXYZ: Object.freeze([0, 0.5, 0.5]) as
        readonly [number, number, number],
    });
    const target = Object.freeze({
      id: "upper-target",
      acceptanceTargetRef: "worldkit://acceptance-target/upper@1",
      standPositionMetersXYZ: Object.freeze([0, 1, -0.5]) as
        readonly [number, number, number],
    });
    const result = analyze({
      supportTopCellKeys: [...lowerTopCellKeys, ...upperTopCellKeys],
      supportSourceBlockIdByTopCellKey: sourceByTopCellKey,
      caseIntent: caseIntent({
        spawn,
        requiredTargets: Object.freeze([target]),
      }),
    });

    expect(result.failureFacts).toEqual([]);
    expect(result.analysisOutcome).toBe("passed");
    expect(result.admissionOutcome).toBe("passed");
    expect(result.metrics.reachableRequiredTargetCount).toBe(1);
    expect(result.standableNodes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        positionMetersXYZ: [0, 0.5, 0.5],
        isReachableFromSpawn: true,
      }),
      expect.objectContaining({
        positionMetersXYZ: [0, 1, -0.5],
        isReachableFromSpawn: true,
      }),
    ]));
  });

  it("does not shift a partially covered source Block center onto its exposed half", () => {
    const exposedTopCellKeys = rectangle(-1, -1, -1, 0, 1);
    const completeTopCellKeys = rectangle(-1, 0, -1, 0, 1);
    const sourceByTopCellKey = Object.fromEntries(
      completeTopCellKeys.map((key) => [key, "partially-covered-block"]),
    );
    const result = analyze({
      supportTopCellKeys: exposedTopCellKeys,
      supportOccupiedCellKeys: completeTopCellKeys.map((key) => {
        const [x, y, z] = key.split(",").map(Number);
        return `${x},${y! - 1},${z}`;
      }),
      blockerCellKeys: ["0,1,-1", "0,1,0"],
      supportSourceBlockIdByTopCellKey: sourceByTopCellKey,
      caseIntent: caseIntent({
        spawn: Object.freeze({
          ...SPAWN,
          standPositionMetersXYZ: [-0.25, 0.5, -0.25] as const,
        }),
        requireSingleReachableComponent: false,
      }),
    });

    expect(result.standableNodes.map(({ positionMetersXYZ }) =>
      positionMetersXYZ)).not.toContainEqual([-0.25, 0.5, 0]);
    expect(result.standableNodes.map(({ positionMetersXYZ }) =>
      positionMetersXYZ)).not.toContainEqual([0, 0.5, 0]);
  });

  it("rejects a narrow surface using full Capsule-footprint union coverage", () => {
    const result = analyze({
      supportTopCellKeys: rectangle(0, 3, 0, 0),
      capabilityOverrides: { capsuleRadiusMeters: 0.3 },
      caseIntent: caseIntent({ spawn: SPAWN }),
    });

    expect(result.analysisOutcome).toBe("failed");
    expect(result.admissionOutcome).toBe("failed");
    expect(result.failureFacts.map(({ metricId }) => metricId)).toContain(
      "ground-support-coverage-basis-points",
    );
    expect(result.metrics.footprintUnsupportedPositionCount).toBeGreaterThan(0);
  });

  it("admits a fitting source footprint without the Heightfield clearance margin", () => {
    const result = analyze({
      supportTopCellKeys: rectangle(0, 3, 0, 0),
      capabilityOverrides: { capsuleRadiusMeters: 0.24 },
      caseIntent: caseIntent({ spawn: Object.freeze({
        ...SPAWN,
        standPositionMetersXYZ: position("1,1,0"),
      }) }),
    });

    expect(result.analysisOutcome).toBe("passed");
    expect(result.admissionOutcome).toBe("passed");
    expect(result.failureFacts.map(({ metricId }) => metricId)).not.toContain(
      "ground-support-coverage-basis-points",
    );
  });

  it("reports exact low-overhead clearance without changing the Capsule", () => {
    const result = analyze({
      supportTopCellKeys: rectangle(-1, 1, -1, 1),
      blockerCellKeys: ["0,3,0"],
      capabilityOverrides: { capsuleHeightMeters: 1.2 },
      caseIntent: caseIntent({ spawn: SPAWN }),
    });

    const clearance = result.failureFacts.find(({ metricId }) =>
      metricId === "ground-clearance-millimeters");
    expect(clearance?.details).toEqual({
      kind: "millimeters-threshold",
      expectedMillimeters: 1_200,
      actualMillimeters: 1_000,
      maximumAllowedDriftMillimeters: 0,
      exceededByMillimeters: 200,
      correctionDirection: "increase",
    });
  });

  it("uses the lowest intersecting overhead regardless of cell-key order", () => {
    const result = analyze({
      supportTopCellKeys: rectangle(-1, 1, -1, 1),
      blockerCellKeys: ["0,10,0", "0,3,0"],
      capabilityOverrides: { capsuleHeightMeters: 3 },
      caseIntent: caseIntent({ spawn: SPAWN }),
    });

    const clearance = result.failureFacts.find(({ metricId }) =>
      metricId === "ground-clearance-millimeters");
    expect(clearance?.details).toMatchObject({
      kind: "millimeters-threshold",
      expectedMillimeters: 3_000,
      actualMillimeters: 1_000,
      exceededByMillimeters: 2_000,
    });
  });

  it.each([true, false])("reports the closest directed step frontier only when connectivity is required=%s", (requireSingleReachableComponent) => {
    const target = Object.freeze({
      id: "high-target",
      acceptanceTargetRef: "worldkit://acceptance-target/high@1",
      standPositionMetersXYZ: position("1,7,0"),
    });
    const result = analyze({
      supportTopCellKeys: [
        ...rectangle(-1, 0, -1, 1, 1),
        ...rectangle(1, 2, -1, 1, 7),
      ],
      caseIntent: caseIntent({
        spawn: SPAWN,
        requiredTargets: Object.freeze([target]),
        requireSingleReachableComponent,
      }),
    });

    const step = result.failureFacts.find(({ metricId }) =>
      metricId === "ground-step-up-millimeters");
    expect(result.metrics.reachableRequiredTargetCount).toBe(0);
    if (!requireSingleReachableComponent) {
      expect(step).toBeUndefined();
      expect(result.failureFacts).toEqual([]);
      expect(result.admissionOutcome).toBe("passed");
      return;
    }
    expect(step?.details).toEqual({
      kind: "millimeters-threshold",
      expectedMillimeters: 0,
      actualMillimeters: 3_000,
      maximumAllowedDriftMillimeters: 1_000,
      exceededByMillimeters: 2_000,
      correctionDirection: "decrease",
    });
  });

  it("CF-04/G1 does not apply raw-height step/slope vetoes to an old automatically smoothed join", () => {
    const target = Object.freeze({
      id: "slope-target",
      acceptanceTargetRef: "worldkit://acceptance-target/slope@1",
      standPositionMetersXYZ: position("1,2,0"),
    });
    const result = analyze({
      supportTopCellKeys: [
        ...rectangle(-1, 0, -1, 1, 1),
        ...rectangle(1, 2, -1, 1, 2),
      ],
      capabilityOverrides: { maxSlopeDegrees: 1 },
      caseIntent: caseIntent({
        spawn: SPAWN,
        requiredTargets: Object.freeze([target]),
      }),
    });

    // This graph is old structural connectivity, not a claim that the current
    // Character can traverse every slope. Actual motion remains Runtime-owned.
    expect(result.analysisOutcome).toBe("passed");
    expect(result.metrics.reachableRequiredTargetCount).toBe(1);
    expect(result.failureFacts).toEqual([]);
  });

  it("keeps a two-meter route rise reachable through four admitted half-meter joins", () => {
    const lowLanding = rectangle(-4, -3, -1, 0, 0);
    const firstTread = rectangle(-2, -1, -1, 0, 1);
    const secondTread = rectangle(0, 1, -1, 0, 2);
    const thirdTread = rectangle(2, 3, -1, 0, 3);
    const highLanding = rectangle(4, 7, -1, 0, 4);
    const target = Object.freeze({
      id: "high-landing-target",
      acceptanceTargetRef: "worldkit://acceptance-target/high-landing@1",
      standPositionMetersXYZ: position("7,4,-1"),
    });
    const result = analyze({
      supportTopCellKeys: Object.freeze([
        ...lowLanding,
        ...firstTread,
        ...secondTread,
        ...thirdTread,
        ...highLanding,
      ]),
      caseIntent: caseIntent({
        spawn: Object.freeze({
          ...SPAWN,
          standPositionMetersXYZ: position("-4,0,-1"),
        }),
        requiredTargets: Object.freeze([target]),
      }),
    });

    expect(result.analysisOutcome).toBe("passed");
    expect(result.metrics.reachableRequiredTargetCount).toBe(1);
    expect(result.failureFacts).toEqual([]);
  });

  it("CF-04/G1 preserves old source-top Spawn/waypoint intent without adding a post-smoothing exact-height gate", () => {
    const target = Object.freeze({
      id: "smoothed-target",
      acceptanceTargetRef: "worldkit://acceptance-target/smoothed@1",
      standPositionMetersXYZ: position("0,2,0"),
    });
    const result = analyze({
      supportTopCellKeys: [
        ...rectangle(-2, -1, -1, 1, 1),
        ...rectangle(0, 1, -1, 1, 2),
      ],
      caseIntent: caseIntent({
        spawn: Object.freeze({
          ...SPAWN,
          standPositionMetersXYZ: position("-1,1,0"),
        }),
        requiredTargets: Object.freeze([target]),
        requiredTraversalBands: Object.freeze([{
          id: "smoothed-band",
          acceptanceTargetRef: target.acceptanceTargetRef,
          centerlineStandPositionsMetersXYZ: Object.freeze([
            position("-1,1,0"),
            target.standPositionMetersXYZ,
          ]),
          halfWidthMeters: 0.5, isBidirectional: true,
        }]),
      }),
    });

    expect(result.admissionOutcome).toBe("passed");
    expect(result.failureFacts).toEqual([]);
    expect(result.metrics.reachableRequiredTraversalBandCount).toBe(1);
  });

  it("preserves directed step-down evidence from a higher Spawn", () => {
    const highSpawn = Object.freeze({
      ...SPAWN,
      standPositionMetersXYZ: position("0,7,0"),
    });
    const target = Object.freeze({
      id: "low-target",
      acceptanceTargetRef: "worldkit://acceptance-target/low@1",
      standPositionMetersXYZ: position("1,1,0"),
    });
    const result = analyze({
      supportTopCellKeys: [
        ...rectangle(-1, 0, -1, 1, 7),
        ...rectangle(1, 2, -1, 1, 1),
      ],
      caseIntent: caseIntent({
        spawn: highSpawn,
        requiredTargets: Object.freeze([target]),
      }),
    });

    const step = result.failureFacts.find(({ metricId }) =>
      metricId === "ground-step-down-millimeters");
    expect(step?.details).toMatchObject({
      kind: "millimeters-threshold",
      actualMillimeters: 3_000,
      maximumAllowedDriftMillimeters: 1_000,
      exceededByMillimeters: 2_000,
      correctionDirection: "decrease",
    });
  });

  it.each([true, false])("rejects a detour that leaves the declared traversal band with bidirectional=%s", (isBidirectional) => {
    const support = [...new Set([
      ...rectangle(-1, 1, -1, 0),
      ...rectangle(-1, 3, 2, 3),
      ...rectangle(3, 4, -1, 2),
    ])];
    const destination = position("3,1,0");
    const result = analyze({
      supportTopCellKeys: support,
      caseIntent: caseIntent({
        spawn: SPAWN,
        requiredTraversalBands: Object.freeze([{
          id: "tight-band",
          acceptanceTargetRef: "worldkit://acceptance-target/tight-band@1",
          centerlineStandPositionsMetersXYZ: Object.freeze([
            SPAWN.standPositionMetersXYZ,
            destination,
          ]),
          halfWidthMeters: 0.5, isBidirectional,
        }]),
      }),
    });

    expect(result.metrics.reachablePositionCount).toBeGreaterThan(1);
    expect(result.metrics.reachableRequiredTraversalBandCount).toBe(0);
    const failure = result.failureFacts.find(({ metricId }) =>
      metricId === "ground-traversal-band-reachability");
    expect(failure).toMatchObject({
      details: {
        kind: "state-mismatch",
        actualValue: "disconnected-inside-band:segment-000",
      },
    });
    expect(failure?.message).toContain(
      "segment segment-000 from [0.25,0.5,0.25] to [1.75,0.5,0.25]",
    );
    expect(failure?.repairInstruction).toContain(
      "between [0.25,0.5,0.25] and [1.75,0.5,0.25]",
    );
    expect(failure?.repairInstruction).toContain(
      "both endpoint supports exist, but no connected path stays inside the band",
    );
  });

  it.each([true, false])("identifies the exact missing endpoint in a traversal band with bidirectional=%s", (isBidirectional) => {
    const unsupportedDestination = position("4,1,0");
    const result = analyze({
      supportTopCellKeys: rectangle(-1, 1, -1, 1),
      caseIntent: caseIntent({
        spawn: SPAWN,
        requiredTraversalBands: Object.freeze([{
          id: "missing-endpoint-band",
          acceptanceTargetRef:
            "worldkit://acceptance-target/missing-endpoint-band@1",
          centerlineStandPositionsMetersXYZ: Object.freeze([
            SPAWN.standPositionMetersXYZ,
            unsupportedDestination,
          ]),
          halfWidthMeters: 0.5, isBidirectional,
        }]),
      }),
    });

    const failure = result.failureFacts.find(({ metricId }) =>
      metricId === "ground-traversal-band-reachability");
    expect(failure).toMatchObject({
      details: {
        kind: "state-mismatch",
        actualValue: "destination-node-missing:segment-000",
      },
    });
    expect(failure?.message).toContain(
      "the segment destination does not resolve to a standable ground node",
    );
    expect(result.failureFacts).toContainEqual(expect.objectContaining({
      targetId: "missing-endpoint-band-waypoint-001",
      metricId: "ground-support-coverage-basis-points",
      details: expect.objectContaining({
        kind: "basis-points-threshold",
        expectedBasisPoints: 10_000,
        actualBasisPoints: 0,
      }),
    }));
  });

  it("measures disconnected islands without blocking an air-Spawn Case", () => {
    const result = analyze({
      supportTopCellKeys: [
        ...rectangle(-1, 1, -1, 1),
        ...rectangle(10, 12, 10, 12),
      ],
      caseIntent: caseIntent({
        spawn: SPAWN,
        groundFailurePolicy: "measure-only",
      }),
    });

    expect(result.analysisOutcome).toBe("failed");
    expect(result.admissionOutcome).toBe("passed");
    expect(result.metrics.componentCount).toBe(2);
    expect(result.metrics.disconnectedStandablePositionCount).toBeGreaterThan(0);
    expect(result.failureFacts.map(({ metricId }) => metricId)).toContain(
      "ground-component-reachability",
    );
  });

  it.each([false, true])("preserves disconnected ground target measurements with required connectivity=%s", (requireSingleReachableComponent) => {
    const remote = position("11,1,11");
    const result = analyze({
      supportTopCellKeys: [
        ...rectangle(-1, 2, -1, 1),
        ...rectangle(10, 12, 10, 12),
      ],
      caseIntent: caseIntent({
        spawn: SPAWN, requireSingleReachableComponent,
        requiredTargets: [
          { id: "middle-target", acceptanceTargetRef: "worldkit://acceptance-target/middle@1",
            standPositionMetersXYZ: position("1,1,0") },
          { id: "remote-target", acceptanceTargetRef: "worldkit://acceptance-target/remote@1",
            standPositionMetersXYZ: remote },
        ],
      }),
    });
    expect(result.metrics).toMatchObject({
      requiredTargetCount: 2, reachableRequiredTargetCount: 1, componentCount: 2,
    });
    expect(result.metrics.disconnectedStandablePositionCount).toBeGreaterThan(0);
    expect(result.standableNodes).toContainEqual(expect.objectContaining({
      positionMetersXYZ: remote, isReachableFromSpawn: false,
    }));
    expect(result.analysisOutcome).toBe(requireSingleReachableComponent ? "failed" : "passed");
    expect(result.admissionOutcome).toBe(result.analysisOutcome);
    if (requireSingleReachableComponent) {
      const disconnectedFact = result.failureFacts.find(fact => fact.metricId === "ground-component-reachability")!;
      expect(disconnectedFact.details).toMatchObject({
        actualValue: `1-components-${result.metrics.disconnectedStandablePositionCount}-positions-disconnected`,
      });
      expect(disconnectedFact.message).toContain("across 1 components");
    }
    expect(result.failureFacts.map(({ metricId }) => metricId)).toEqual(
      requireSingleReachableComponent
        ? ["ground-component-reachability", "ground-target-reachability"] : [],
    );
  });

  it.each(["unsupported", "blocked"] as const)("still rejects an optional ground target that is %s", (condition) => {
    const result = analyze({
      supportTopCellKeys: [
        ...rectangle(-1, 1, -1, 1),
        ...(condition === "blocked" ? rectangle(10, 12, 10, 12) : []),
      ],
      ...(condition === "blocked" ? { blockerCellKeys: ["11,2,11"] } : {}),
      caseIntent: caseIntent({
        spawn: SPAWN, requireSingleReachableComponent: false,
        requiredTargets: [{ id: "remote-target",
          acceptanceTargetRef: "worldkit://acceptance-target/remote@1",
          standPositionMetersXYZ: position("11,1,11") }],
      }),
    });
    expect(result.admissionOutcome).toBe("failed");
    expect(result.metrics.reachableRequiredTargetCount).toBe(0);
    expect(result.failureFacts).toContainEqual(expect.objectContaining({
      targetId: "remote-target",
      metricId: condition === "blocked"
        ? "ground-clearance-millimeters" : "ground-support-coverage-basis-points",
    }));
    expect(result.failureFacts.map(({ metricId }) => metricId))
      .not.toContain("ground-target-reachability");
  });

  it("still rejects a disconnected explicit band when global connectivity is optional", () => {
    const remote = position("11,1,11");
    const result = analyze({
      supportTopCellKeys: [...rectangle(-1, 1, -1, 1), ...rectangle(10, 12, 10, 12)],
      caseIntent: caseIntent({
        spawn: SPAWN, requireSingleReachableComponent: false,
        requiredTargets: [{ id: "remote-target", acceptanceTargetRef: "worldkit://acceptance-target/remote@1",
          standPositionMetersXYZ: remote }],
        requiredTraversalBands: [{ id: "declared-band", acceptanceTargetRef: "worldkit://acceptance-target/remote@1",
          centerlineStandPositionsMetersXYZ: [SPAWN.standPositionMetersXYZ, remote],
          halfWidthMeters: 1, isBidirectional: false }],
      }),
    });
    expect(result.admissionOutcome).toBe("failed");
    expect(result.metrics.reachableRequiredTraversalBandCount).toBe(0);
    expect(result.failureFacts.map(({ metricId }) => metricId))
      .toEqual(["ground-traversal-band-reachability"]);
  });

  it("rejects duplicate anchor IDs or positions, but permits a shared Case obligation", () => {
    const target = Object.freeze({
      id: "same-target",
      acceptanceTargetRef: "worldkit://acceptance-target/same@1",
      standPositionMetersXYZ: position("1,1,0"),
    });
    expect(() => analyze({
      supportTopCellKeys: rectangle(-1, 2, -1, 1),
      caseIntent: caseIntent({
        spawn: SPAWN,
        requiredTargets: Object.freeze([target, target]),
      }),
    })).toThrow("WORLDKIT_NATIVE_BLOCK_GROUND_ANALYSIS_INPUT_INVALID");

    const sharedObligation = analyze({
      supportTopCellKeys: rectangle(-1, 3, -1, 1),
      caseIntent: caseIntent({
        spawn: SPAWN,
        requiredTargets: Object.freeze([
          target,
          Object.freeze({
            ...target,
            id: "same-ref-other-target",
            standPositionMetersXYZ: position("2,1,0"),
          }),
        ]),
      }),
    });
    expect(sharedObligation.metrics.requiredTargetCount).toBe(2);
    expect(sharedObligation.metrics.reachableRequiredTargetCount).toBe(2);
    expect(() => analyze({
      supportTopCellKeys: rectangle(-1, 3, -1, 1),
      caseIntent: caseIntent({ spawn: SPAWN, requiredTargets: [
        target, { ...target, id: "same-position-other-id" },
      ] }),
    })).toThrow("WORLDKIT_NATIVE_BLOCK_GROUND_ANALYSIS_INPUT_INVALID");
  });

  it("analyzes more than 256 exploration anchors and still rejects unsupported declared targets", () => {
    const requiredTargets = Array.from({ length: 257 }, (_, index) => ({
      id: `target-${String(index).padStart(3, "0")}`,
      acceptanceTargetRef: "worldkit://acceptance-target/ground@1",
      standPositionMetersXYZ: position(`${index % 17 + 1},1,${Math.floor(index / 17) + 1}`),
    }));
    const supportTopCellKeys = rectangle(-1, 19, -1, 19);
    const result = analyze({ supportTopCellKeys,
      caseIntent: caseIntent({ spawn: SPAWN, requiredTargets }),
    });
    expect(result.admissionOutcome).toBe("passed");
    expect(result.metrics.requiredTargetCount).toBe(257);
    expect(result.metrics.reachableRequiredTargetCount).toBe(257);
    const unsupported = analyze({ supportTopCellKeys,
      caseIntent: caseIntent({ spawn: SPAWN, requiredTargets: [
        ...requiredTargets.slice(0, -1),
        { ...requiredTargets.at(-1)!, standPositionMetersXYZ: position("50,1,50") },
      ] }),
    });
    expect(unsupported.admissionOutcome).toBe("failed");
    expect(unsupported.metrics.requiredTargetCount).toBe(257);
    expect(unsupported.metrics.reachableRequiredTargetCount).toBe(256);
  });

  it("does not invent cross-domain uniqueness between Spawn and target IDs", () => {
    expect(() => analyze({
      supportTopCellKeys: rectangle(-1, 2, -1, 1),
      caseIntent: caseIntent({
        spawn: SPAWN,
        requiredTargets: Object.freeze([Object.freeze({
          id: SPAWN.id,
          acceptanceTargetRef:
            "worldkit://acceptance-target/same-local-id-target@1",
          standPositionMetersXYZ: position("1,1,0"),
        })]),
      }),
    })).not.toThrow();
  });

  it("fails closed before analysis when the Host-frozen cell budget is exceeded", () => {
    expect(() => analyze({
      supportTopCellKeys: rectangle(-1, 1, -1, 1),
      caseIntent: caseIntent({ spawn: SPAWN }),
      budget: Object.freeze({
        ...ANALYSIS_BUDGET,
        maximumSolidOccupancyCellCount: 8,
      }),
    })).toThrow("WORLDKIT_NATIVE_BLOCK_GROUND_ANALYSIS_BUDGET_EXCEEDED");
  });

  it("analyzes a 6,400-cell ground model through bounded column lookups", () => {
    const result = analyze({
      supportTopCellKeys: rectangle(0, 79, 0, 79),
      caseIntent: caseIntent({
        spawn: Object.freeze({
          ...SPAWN,
          standPositionMetersXYZ: position("40,1,40"),
        }),
      }),
    });

    expect(result.analysisOutcome).toBe("passed");
    expect(result.metrics.supportTopCellCount).toBe(6_400);
    expect(result.metrics.reachablePositionCount).toBe(6_400);
  }, 5_000);

  it("is stable across source and target ordering", () => {
    const left = Object.freeze({
      id: "left-target",
      acceptanceTargetRef: "worldkit://acceptance-target/left@1",
      standPositionMetersXYZ: position("-1,1,0"),
    });
    const right = Object.freeze({
      id: "right-target",
      acceptanceTargetRef: "worldkit://acceptance-target/right@1",
      standPositionMetersXYZ: position("1,1,0"),
    });
    const cells = rectangle(-2, 2, -1, 1);
    const first = analyze({
      supportTopCellKeys: cells,
      caseIntent: caseIntent({
        spawn: SPAWN,
        requiredTargets: Object.freeze([left, right]),
      }),
    });
    const second = analyze({
      supportTopCellKeys: [...cells].reverse(),
      caseIntent: caseIntent({
        spawn: SPAWN,
        requiredTargets: Object.freeze([right, left]),
      }),
    });

    expect(second).toEqual(first);
    expect(sha256CanonicalJson(second)).toBe(sha256CanonicalJson(first));
  });

  it("rejects accessor-bearing Host input without invoking the accessor", () => {
    let accessCount = 0;
    const hostile = Object.defineProperty({}, "groundModel", {
      enumerable: true,
      get() {
        accessCount += 1;
        return undefined;
      },
    });
    expect(() => analyzeBabylonNativeBlockGroundV1(hostile as never))
      .toThrow("WORLDKIT_NATIVE_BLOCK_GROUND_ANALYSIS_INPUT_INVALID");
    expect(accessCount).toBe(0);
  });

  it("routes malformed and cyclic Host input through the Profile failure channel", () => {
    expect(() => analyzeBabylonNativeBlockGroundV1(null as never))
      .toThrow("WORLDKIT_NATIVE_BLOCK_GROUND_ANALYSIS_INPUT_INVALID");
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => analyzeBabylonNativeBlockGroundV1(cyclic as never))
      .toThrow("WORLDKIT_NATIVE_BLOCK_GROUND_ANALYSIS_INPUT_INVALID");
  });
});
