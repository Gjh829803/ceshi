import {
  hashAuthoringDocumentV4,
  type AuthoringSpecV4,
} from "@whitebox-world/authoring";
import {
  createValidAuthoringSpec,
  createValidMountedOnAuthoringSpec,
  createValidPackageSubjectWorld,
  createValidRiggedPackageDefinition,
} from "@whitebox-world/authoring/testing";
import { canonicalJsonBytes, sha256CanonicalJson } from "@whitebox-world/protocol";
import { isNil } from "lodash-es";
import { describe, expect, it } from "vitest";

import {
  applyWorldChangeSetV1,
  assembleWorldChangeDiffV1,
  FIRST_BATCH_ALLOWED_OVERRIDE_PATHS_V1,
  isAppliedWorldChangeSetResultV1,
  parseAuthoringEditWorkloadBudgetV1,
  parseWorldChangeSetV1,
  type AuthoringEditWorkloadBudgetV1,
  type Sha256HashV1,
  type WorldChangeOperationV1,
  type WorldChangeSetV1,
  type WorldChangeTargetV1,
  type WorldPreconditionV1,
  type WorldChangeOverrideValidationContextV1,
} from "../index.js";
import { hashTargetValue, lookupTargetValue } from "./targets.js";

const GENEROUS_BUDGET = parseAuthoringEditWorkloadBudgetV1({
  maximumChangeSetBytes: 1_000_000,
  maximumPreconditionCount: 64,
  maximumOperationCount: 64,
  maximumConcurrentNonTerminalRequestCount: 8,
  maximumPreparedCandidateCount: 8,
  maximumPreparedCandidateBytes: 1_000_000,
  maximumPreparedCandidateRetentionMilliseconds: 3_600_000,
});

const HOUSE_PROTOTYPE = {
  id: "house-blockout",
  version: 1,
  kind: "primitive",
  primitive: "box",
  sizeMetersXYZ: [8, 5, 10],
  collisionEnabled: true,
  semantic: { classId: "structure.house" },
} as const;

const HOUSE_NODE = {
  id: "house-north",
  kind: "object",
  prototypeRef: "package://prototype/house-blockout@1",
  placement: {
    kind: "fixed",
    transform: { positionMetersXYZ: [18, 2.5, -24] },
  },
} as const;

const CAMP_REGION = {
  id: "camp-clearing",
  kind: "polygon-xz",
  pointsMetersXZ: [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
  ],
  semanticClassId: "region.camp",
} as const;

const WATCH_ROUTE = {
  id: "spawn-to-watchtower",
  kind: "polyline-xz",
  pointsMetersXZ: [
    [0, 30],
    [12, -10],
  ],
  widthMeters: 3,
  locomotionProfileRef: "worldkit://locomotion-profile/humanoid.ground@1",
} as const;

const HUD_REGION = {
  id: "hud-subject",
  kind: "rectangle-uv",
  minimumUv: [0.4, 0.3],
  maximumUv: [0.6, 0.8],
} as const;

const BLOCKED_AREA = {
  id: "blocked-rocks",
  kind: "polygon-xz",
  pointsMetersXZ: [
    [20, 20],
    [24, 20],
    [24, 24],
    [20, 24],
  ],
  surfaceEntityId: "terrain-main",
  mode: "blocked",
} as const;

const WATCHTOWER_ANCHOR = {
  id: "watchtower-entry",
  kind: "anchor",
  placement: {
    kind: "fixed",
    transform: { positionMetersXYZ: [12, 0, -10] },
  },
  semantic: { classId: "landmark.entry" },
} as const;

const PLACEMENT_CONSTRAINT = {
  id: "player-inside-camp",
  requirement: "required",
  kind: "inside-region",
  entityId: "player",
  regionId: "camp-clearing",
  boundaryClearanceMeters: 1,
} as const;

const CONNECTIVITY_CONSTRAINT = {
  id: "player-can-reach-watchtower",
  kind: "connected-by-route",
  requirement: "required",
  traversingEntityId: "player",
  startAnchorEntityId: "spawn-main",
  destinationAnchorEntityId: "watchtower-entry",
  routeId: "spawn-to-watchtower",
} as const;

const FEEL_OVERRIDE = {
  id: "override.feel.heavy",
  kind: "resource-ref",
  path: "profiles.controlFeelProfileRef",
  resourceRef: "worldkit://control-feel-profile/humanoid.heavy-ground@1",
} as const;

const OVERRIDE_VALIDATION: WorldChangeOverrideValidationContextV1 = {
  definitionOwners: [
    {
      definitionKind: "subject-definition",
      definitionRef: "worldkit://subject-definition/humanoid.third-person@1",
      allowedOverridePaths: [...FIRST_BATCH_ALLOWED_OVERRIDE_PATHS_V1],
      bodyTopology: "biped",
      mediumProfileRef: "worldkit://medium-profile/ground-air.standard@1",
    },
  ],
  projectionAllowedOverridePaths: [...FIRST_BATCH_ALLOWED_OVERRIDE_PATHS_V1],
  hostPolicyAllowedOverridePaths: [...FIRST_BATCH_ALLOWED_OVERRIDE_PATHS_V1],
  registryLockEntries: [
    {
      resourceRef: FEEL_OVERRIDE.resourceRef,
      resourceKind: "control-feel-profile",
      contentHash: sha256CanonicalJson({ resourceRef: FEEL_OVERRIDE.resourceRef }) as Sha256HashV1,
      requiredCapabilityRefs: [],
      runtimeStatus: "implemented",
    },
    {
      resourceRef: "worldkit://control-profile/planar.camera-relative@1",
      resourceKind: "control-profile",
      contentHash: sha256CanonicalJson({
        resourceRef: "worldkit://control-profile/planar.camera-relative@1",
      }) as Sha256HashV1,
      requiredCapabilityRefs: [],
      runtimeStatus: "implemented",
    },
  ],
  allowedCapabilityRefs: [],
};

const MOUNTED_RELATIONSHIP = {
  id: "rider-mounted-on-board",
  type: "mountedOn",
  schemaVersion: 1,
  riderEntityId: "pack-animal-a",
  mountEntityId: "pack-animal-b",
  mountSlotId: "stand",
} as const;

function specHash(spec: AuthoringSpecV4): Sha256HashV1 {
  return hashAuthoringDocumentV4(spec) as Sha256HashV1;
}

function changeSet(
  spec: AuthoringSpecV4,
  operations: readonly WorldChangeOperationV1[],
  preconditions: readonly WorldPreconditionV1[] = [],
  id = "change.test.001",
): WorldChangeSetV1 {
  return parseWorldChangeSetV1({
    kind: "worldkit-world-change-set",
    schemaVersion: 1,
    id,
    baseAuthoringSpecHash: specHash(spec),
    preconditions,
    operations,
  });
}

function apply(
  spec: AuthoringSpecV4,
  operations: readonly WorldChangeOperationV1[],
  extras: {
    readonly preconditions?: readonly WorldPreconditionV1[];
    readonly budget?: AuthoringEditWorkloadBudgetV1;
    readonly admissionUsage?: {
      readonly concurrentNonTerminalRequestCount: number;
      readonly preparedCandidateCount: number;
      readonly preparedCandidateBytes: number;
      readonly preparedCandidateRetentionMilliseconds?: number;
    };
    readonly changeSetId?: string;
  } = {},
) {
  return applyWorldChangeSetV1({
    baseAuthoringSpec: spec,
    changeSet: changeSet(
      spec,
      operations,
      extras.preconditions ?? [],
      extras.changeSetId ?? "change.test.001",
    ),
    workloadBudget: extras.budget ?? GENEROUS_BUDGET,
    overrideValidation: OVERRIDE_VALIDATION,
    ...(isNil(extras.admissionUsage) ? {} : { admissionUsage: extras.admissionUsage }),
  });
}

function expectApplied(
  result: ReturnType<typeof applyWorldChangeSetV1>,
): Extract<ReturnType<typeof applyWorldChangeSetV1>, { status: "applied" }> {
  expect(result.status).toBe("applied");
  if (!isAppliedWorldChangeSetResultV1(result)) {
    throw new Error(result.diagnostics.map((item) => item.message).join("; "));
  }
  return result;
}

describe("P16-C1 WorldChangeSet apply", () => {
  it("applies the add-house ChangeSet onto an isolated candidate and emits Diff", () => {
    const base = createValidAuthoringSpec();
    const baseCopy = structuredClone(base);
    const result = expectApplied(
      apply(base, [
        {
          id: "operation.add-house-prototype",
          type: "resource-upsert",
          resourceKind: "prototype",
          prototype: HOUSE_PROTOTYPE,
        },
        {
          id: "operation.add-house-node",
          type: "node-upsert",
          node: HOUSE_NODE,
        },
      ], {
        preconditions: [
          {
            id: "precondition.house-prototype-absent",
            type: "target-absent",
            target: {
              kind: "resource",
              resourceKind: "prototype",
              resourceId: "house-blockout",
            },
          },
          {
            id: "precondition.house-node-absent",
            type: "target-absent",
            target: { kind: "node", nodeEntityId: "house-north" },
          },
        ],
        changeSetId: "change.add-house.001",
      }),
    );

    expect(base).toEqual(baseCopy);
    expect(result.candidateAuthoringSpec).not.toBe(base);
    expect(result.baseAuthoringSpecHash).toBe(specHash(base));
    expect(result.resultAuthoringSpecHash).not.toBe(result.baseAuthoringSpecHash);
    expect(result.affectedIds).toEqual({
      resourceIds: ["house-blockout"],
      nodeEntityIds: ["house-north"],
      relationshipIds: [],
      spatialFeatureIds: [],
      constraintIds: [],
      overrideIds: [],
    });
    expect(result.changes.map((row) => row.type)).toEqual(["added", "added"]);
    const house = result.candidateAuthoringSpec.resources.prototypes.find(
      (item) => item.id === "house-blockout",
    );
    const node = result.candidateAuthoringSpec.nodes.find((item) => item.id === "house-north");
    expect(house?.semantic?.classId).toBe("structure.house");
    expect(node?.kind).toBe("object");
    const diff = assembleWorldChangeDiffV1({
      id: "diff.add-house.001",
      requestId: "request.dry-run.add-house.001",
      applied: result,
    });
    expect(diff.resultAuthoringSpecHash).toBe(result.resultAuthoringSpecHash);
    expect(diff.changes).toHaveLength(2);
  });

  it("applies the remaining first-slice operation types", () => {
    const base = createValidAuthoringSpec();
    const definition = createValidRiggedPackageDefinition();
    const result = expectApplied(
      apply(base, [
        {
          id: "operation.add-companion-anchor",
          type: "node-upsert",
          node: {
            id: "companion-spawn",
            kind: "anchor",
            semantic: { classId: "spawn.companion" },
            placement: {
              kind: "fixed",
              transform: { positionMetersXYZ: [4, 0, 2] },
            },
          },
        },
        {
          id: "operation.add-companion",
          type: "node-upsert",
          node: {
            id: "companion",
            kind: "subject",
            subjectDefinitionRef: "worldkit://subject-definition/humanoid.g-bot@2",
            spawnAnchorEntityId: "companion-spawn",
          },
        },
        {
          id: "operation.add-definition",
          type: "resource-upsert",
          resourceKind: "subject-definition",
          subjectDefinition: definition,
        },
        {
          id: "operation.add-region",
          type: "spatial-feature-upsert",
          spatialFeatureKind: "region",
          spatialRegion: CAMP_REGION,
        },
        {
          id: "operation.add-route",
          type: "spatial-feature-upsert",
          spatialFeatureKind: "route",
          route: WATCH_ROUTE,
        },
        {
          id: "operation.add-screen-region",
          type: "spatial-feature-upsert",
          spatialFeatureKind: "screen-region",
          screenRegion: HUD_REGION,
        },
        {
          id: "operation.add-traversal-area",
          type: "spatial-feature-upsert",
          spatialFeatureKind: "traversal-area",
          traversalArea: BLOCKED_AREA,
        },
        {
          id: "operation.add-watchtower",
          type: "node-upsert",
          node: WATCHTOWER_ANCHOR,
        },
        {
          id: "operation.set-placement",
          type: "constraint-set",
          constraintKind: "placement",
          placementConstraint: PLACEMENT_CONSTRAINT,
        },
        {
          id: "operation.set-connectivity",
          type: "constraint-set",
          constraintKind: "connectivity",
          connectivityConstraint: CONNECTIVITY_CONSTRAINT,
        },
        {
          id: "operation.replace-terrain",
          type: "terrain-source-replace",
          terrainEntityId: "terrain-main",
          terrainSource: {
            kind: "procedural",
            relief: "mountains",
            baseHeightMeters: 0,
            amplitudeMeters: 18,
            frequencyPerMeter: 0.018,
            octaves: 5,
            lacunarityRatio: 2,
            persistenceRatio: 0.5,
          },
        },
        {
          id: "operation.set-startup",
          type: "startup-set",
          startup: {
            spawnAnchorEntityId: "spawn-main",
            controlledEntityId: "player",
            cameraEntityId: "camera-main",
          },
        },
        {
          id: "operation.set-override",
          type: "definition-override-set",
          nodeEntityId: "player",
          override: FEEL_OVERRIDE,
        },
      ]),
    );

    expect(result.candidateAuthoringSpec.nodes.map((item) => item.id)).toEqual(
      expect.arrayContaining(["companion", "companion-spawn", "watchtower-entry"]),
    );
    expect(result.candidateAuthoringSpec.resources.subjectDefinitions[0]?.id).toBe(
      "rigged-golden-package",
    );
    expect(result.candidateAuthoringSpec.spatial.regions[0]?.id).toBe("camp-clearing");
    expect(result.candidateAuthoringSpec.spatial.routes[0]?.id).toBe("spawn-to-watchtower");
    expect(result.candidateAuthoringSpec.spatial.screenRegions[0]?.id).toBe("hud-subject");
    expect(result.candidateAuthoringSpec.spatial.traversalAreas[0]?.id).toBe("blocked-rocks");
    expect(result.candidateAuthoringSpec.constraints.placements[0]?.id).toBe("player-inside-camp");
    expect(result.candidateAuthoringSpec.constraints.connectivity[0]?.id).toBe(
      "player-can-reach-watchtower",
    );
    const terrain = result.candidateAuthoringSpec.nodes.find((item) => item.id === "terrain-main");
    expect(terrain?.kind === "terrain" && terrain.components.terrain.source.relief).toBe(
      "mountains",
    );
    const player = result.candidateAuthoringSpec.nodes.find((item) => item.id === "player");
    expect(player?.kind === "subject" && player.overrides?.[0]?.id).toBe("override.feel.heavy");
    expect(result.changes.find((row) => row.target.kind === "startup")?.type).toBe("replaced");
  });

  it("adds and removes a relationship without mutating the mounted base", () => {
    const mounted = createValidMountedOnAuthoringSpec();
    const removed = expectApplied(
      apply(mounted, [
        {
          id: "operation.remove-relationship",
          type: "relationship-remove",
          relationshipId: "rider-mounted-on-board",
        },
      ]),
    );
    expect(removed.candidateAuthoringSpec.relationships).toEqual([]);
    expect(mounted.relationships).toHaveLength(1);

    const packageWorld = createValidPackageSubjectWorld();
    const added = expectApplied(
      apply(packageWorld, [
        {
          id: "operation.add-relationship",
          type: "relationship-add",
          relationship: MOUNTED_RELATIONSHIP,
        },
      ]),
    );
    expect(added.candidateAuthoringSpec.relationships[0]?.id).toBe("rider-mounted-on-board");
    expect(added.changes[0]?.type).toBe("added");
  });

  it("removes unused resources, nodes, spatial features, constraints, and overrides", () => {
    const base = createValidAuthoringSpec();
    const withExtras = expectApplied(
      apply(base, [
        {
          id: "operation.add-crate",
          type: "resource-upsert",
          resourceKind: "prototype",
          prototype: {
            id: "crate-unused",
            version: 1,
            kind: "primitive",
            primitive: "box",
            sizeMetersXYZ: [1, 1, 1],
            collisionEnabled: true,
            semantic: { classId: "prop.crate" },
          },
        },
        {
          id: "operation.add-region",
          type: "spatial-feature-upsert",
          spatialFeatureKind: "region",
          spatialRegion: CAMP_REGION,
        },
        {
          id: "operation.set-placement",
          type: "constraint-set",
          constraintKind: "placement",
          placementConstraint: PLACEMENT_CONSTRAINT,
        },
        {
          id: "operation.set-override",
          type: "definition-override-set",
          nodeEntityId: "player",
          override: FEEL_OVERRIDE,
        },
      ]),
    );

    const removed = expectApplied(
      apply(withExtras.candidateAuthoringSpec, [
        {
          id: "operation.remove-crate",
          type: "resource-remove",
          resourceKind: "prototype",
          resourceId: "crate-unused",
        },
        {
          id: "operation.remove-wall-node",
          type: "node-remove",
          nodeEntityId: "wall-east",
        },
        {
          id: "operation.remove-region",
          type: "spatial-feature-remove",
          spatialFeatureKind: "region",
          spatialFeatureId: "camp-clearing",
        },
        {
          id: "operation.remove-placement",
          type: "constraint-remove",
          constraintKind: "placement",
          constraintId: "player-inside-camp",
        },
        {
          id: "operation.remove-override",
          type: "definition-override-remove",
          nodeEntityId: "player",
          overrideId: "override.feel.heavy",
        },
      ]),
    );

    expect(
      removed.candidateAuthoringSpec.resources.prototypes.find((item) => item.id === "crate-unused"),
    ).toBeUndefined();
    expect(
      removed.candidateAuthoringSpec.nodes.find((item) => item.id === "wall-east"),
    ).toBeUndefined();
    expect(removed.candidateAuthoringSpec.spatial.regions).toEqual([]);
    expect(removed.candidateAuthoringSpec.constraints.placements).toEqual([]);
    const player = removed.candidateAuthoringSpec.nodes.find((item) => item.id === "player");
    expect(player?.kind === "subject" ? player.overrides : undefined).toBeUndefined();
    expect(removed.changes.every((row) => row.type === "removed")).toBe(true);
  });

  it("rejects ChangeSet-local and host-usage workload overruns before touching the base", () => {
    const base = createValidAuthoringSpec();
    const operations: WorldChangeOperationV1[] = [
      {
        id: "operation.add-house-prototype",
        type: "resource-upsert",
        resourceKind: "prototype",
        prototype: HOUSE_PROTOTYPE,
      },
      {
        id: "operation.add-house-node",
        type: "node-upsert",
        node: HOUSE_NODE,
      },
    ];
    const parsed = changeSet(base, operations, [
      {
        id: "precondition.house-prototype-absent",
        type: "target-absent",
        target: {
          kind: "resource",
          resourceKind: "prototype",
          resourceId: "house-blockout",
        },
      },
      {
        id: "precondition.house-node-absent",
        type: "target-absent",
        target: { kind: "node", nodeEntityId: "house-north" },
      },
    ]);
    const tinyBytes = parseAuthoringEditWorkloadBudgetV1({
      ...GENEROUS_BUDGET,
      maximumChangeSetBytes: 32,
    });
    const bytesRejected = applyWorldChangeSetV1({
      baseAuthoringSpec: base,
      changeSet: parsed,
      workloadBudget: tinyBytes,
    });
    expect(bytesRejected).toMatchObject({
      status: "rejected",
      failurePhase: "admission",
      diagnostics: [
        {
          code: "WORLD_CHANGE_ADMISSION_BUDGET_EXCEEDED",
          details: {
            kind: "admission-budget",
            budgetId: "change-set-bytes",
            actual: canonicalJsonBytes(parsed).byteLength,
          },
        },
      ],
    });

    const oneOp = parseAuthoringEditWorkloadBudgetV1({
      ...GENEROUS_BUDGET,
      maximumOperationCount: 1,
      maximumPreconditionCount: 1,
    });
    const countRejected = applyWorldChangeSetV1({
      baseAuthoringSpec: base,
      changeSet: parsed,
      workloadBudget: oneOp,
    });
    expect(countRejected.status).toBe("rejected");
    if (countRejected.status === "rejected") {
      expect(countRejected.failurePhase).toBe("admission");
      expect(countRejected.diagnostics.map((item) =>
        item.details && item.details.kind === "admission-budget"
          ? item.details.budgetId
          : undefined,
      )).toEqual(["precondition-count", "operation-count"]);
    }

    const usageRejected = apply(base, operations, {
      admissionUsage: {
        concurrentNonTerminalRequestCount: 9,
        preparedCandidateCount: 9,
        preparedCandidateBytes: 2_000_000,
        preparedCandidateRetentionMilliseconds: 4_000_000,
      },
    });
    expect(usageRejected.status).toBe("rejected");
    if (usageRejected.status === "rejected") {
      expect(usageRejected.failurePhase).toBe("admission");
      expect(usageRejected.diagnostics).toHaveLength(4);
    }
    expect(base.resources.prototypes.find((item) => item.id === "house-blockout")).toBeUndefined();
  });

  it("rejects a stale base hash without applying operations", () => {
    const base = createValidAuthoringSpec();
    const parsed = parseWorldChangeSetV1({
      kind: "worldkit-world-change-set",
      schemaVersion: 1,
      id: "change.stale.001",
      baseAuthoringSpecHash: sha256CanonicalJson({ stale: true }),
      preconditions: [],
      operations: [
        {
          id: "operation.add-house-node",
          type: "node-upsert",
          node: HOUSE_NODE,
        },
      ],
    });
    const result = applyWorldChangeSetV1({
      baseAuthoringSpec: base,
      changeSet: parsed,
      workloadBudget: GENEROUS_BUDGET,
    });
    expect(result).toMatchObject({
      status: "rejected",
      failurePhase: "base-check",
      currentAuthoringSpecHash: specHash(base),
      diagnostics: [{
        code: "WORLD_CHANGE_BASE_AUTHORING_SPEC_MISMATCH",
        details: { kind: "hash-mismatch" },
      }],
    });
    expect(result).not.toHaveProperty("rebaseRequired");
    if (result.status !== "rejected") throw new Error("expected rejected");
    expect(result.conflictingIds?.nodeEntityIds).toEqual(["house-north"]);
    expect(base.nodes.find((item) => item.id === "house-north")).toBeUndefined();
  });

  it("evaluates exists, absent, and hash preconditions against the immutable base", () => {
    const base = createValidAuthoringSpec();
    const wallTarget: WorldChangeTargetV1 = {
      kind: "resource",
      resourceKind: "prototype",
      resourceId: "wall",
    };
    const wallHash = hashTargetValue(lookupTargetValue(base, wallTarget));
    if (isNil(wallHash)) {
      throw new Error("Expected the wall prototype target hash.");
    }

    const passed = expectApplied(
      apply(base, [
        {
          id: "operation.replace-wall",
          type: "resource-upsert",
          resourceKind: "prototype",
          prototype: {
            ...HOUSE_PROTOTYPE,
            id: "wall",
            semantic: { classId: "obstacle.wall.replaced" },
          },
        },
      ], {
        preconditions: [
          { id: "precondition.wall-exists", type: "target-exists", target: wallTarget },
          {
            id: "precondition.house-absent",
            type: "target-absent",
            target: {
              kind: "resource",
              resourceKind: "prototype",
              resourceId: "house-blockout",
            },
          },
          {
            id: "precondition.wall-hash",
            type: "target-hash-equals",
            target: wallTarget,
            expectedTargetHash: wallHash,
          },
        ],
      }),
    );
    expect(
      passed.candidateAuthoringSpec.resources.prototypes.find((item) => item.id === "wall")
        ?.semantic?.classId,
    ).toBe("obstacle.wall.replaced");

    const failed = apply(base, [
      {
        id: "operation.add-house-node",
        type: "node-upsert",
        node: HOUSE_NODE,
      },
    ], {
      preconditions: [
        {
          id: "precondition.house-exists",
          type: "target-exists",
          target: { kind: "node", nodeEntityId: "house-north" },
        },
        {
          id: "precondition.player-absent",
          type: "target-absent",
          target: { kind: "node", nodeEntityId: "player" },
        },
        {
          id: "precondition.wall-wrong-hash",
          type: "target-hash-equals",
          target: wallTarget,
          expectedTargetHash: sha256CanonicalJson({ wrong: true }) as Sha256HashV1,
        },
      ],
    });
    expect(failed.status).toBe("rejected");
    if (failed.status === "rejected") {
      expect(failed.failurePhase).toBe("precondition");
      expect(failed.diagnostics).toHaveLength(3);
      expect(failed.diagnostics.every((item) => item.code === "WORLD_CHANGE_PRECONDITION_FAILED")).toBe(true);
    }
  });

  it("rejects same-target writes and Canonical target overlap", () => {
    const base = createValidAuthoringSpec();
    const sameTarget = apply(base, [
      {
        id: "operation.remove-wall",
        type: "resource-remove",
        resourceKind: "prototype",
        resourceId: "wall",
      },
      {
        id: "operation.upsert-wall",
        type: "resource-upsert",
        resourceKind: "prototype",
        prototype: { ...HOUSE_PROTOTYPE, id: "wall" },
      },
    ]);
    expect(sameTarget).toMatchObject({
      status: "rejected",
      failurePhase: "candidate-apply",
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "WORLD_CHANGE_TARGET_CONFLICT" }),
      ]),
    });

    const terrainOverlap = apply(base, [
      {
        id: "operation.replace-terrain-node",
        type: "node-upsert",
        node: {
          id: "terrain-main",
          kind: "terrain",
          components: {
            terrain: {
              source: { kind: "procedural", relief: "hills" },
              grid: {
                centerMetersXZ: [0, 0],
                sizeMetersXZ: [160, 160],
                resolutionCellsXZ: [65, 65],
              },
            },
          },
        },
      },
      {
        id: "operation.replace-terrain-source",
        type: "terrain-source-replace",
        terrainEntityId: "terrain-main",
        terrainSource: { kind: "procedural", relief: "mountains" },
      },
    ]);
    expect(terrainOverlap.status).toBe("rejected");
    if (terrainOverlap.status === "rejected") {
      expect(terrainOverlap.conflictingIds?.nodeEntityIds).toEqual(["terrain-main"]);
    }

    const overrideOverlap = apply(base, [
      {
        id: "operation.replace-player",
        type: "node-upsert",
        node: {
          id: "player",
          kind: "subject",
          subjectDefinitionRef: "worldkit://subject-definition/humanoid.g-bot@2",
          spawnAnchorEntityId: "spawn-main",
        },
      },
      {
        id: "operation.set-override",
        type: "definition-override-set",
        nodeEntityId: "player",
        override: FEEL_OVERRIDE,
      },
    ]);
    expect(overrideOverlap.status).toBe("rejected");

    const twoOverrides = expectApplied(
      apply(base, [
        {
          id: "operation.set-feel",
          type: "definition-override-set",
          nodeEntityId: "player",
          override: FEEL_OVERRIDE,
        },
        {
          id: "operation.set-control",
          type: "definition-override-set",
          nodeEntityId: "player",
          override: {
            id: "override.control.planar",
            kind: "resource-ref",
            path: "profiles.controlProfileRef",
            resourceRef: "worldkit://control-profile/planar.camera-relative@1",
          },
        },
      ]),
    );
    const player = twoOverrides.candidateAuthoringSpec.nodes.find((item) => item.id === "player");
    expect(player?.kind === "subject" ? player.overrides?.map((item) => item.id) : undefined).toEqual([
      "override.feel.heavy",
      "override.control.planar",
    ]);
  });

  it("maps Canonical Validation dangling references and apply-time missing targets", () => {
    const base = createValidAuthoringSpec();
    const dangling = apply(base, [
      {
        id: "operation.set-connectivity",
        type: "constraint-set",
        constraintKind: "connectivity",
        connectivityConstraint: CONNECTIVITY_CONSTRAINT,
      },
    ]);
    expect(dangling).toMatchObject({
      status: "rejected",
      failurePhase: "canonical-validation",
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "WORLD_CHANGE_REFERENCE_DANGLING" }),
      ]),
    });

    const missingRemove = apply(base, [
      {
        id: "operation.remove-missing",
        type: "node-remove",
        nodeEntityId: "house-north",
      },
    ]);
    expect(missingRemove).toMatchObject({
      status: "rejected",
      failurePhase: "candidate-apply",
      diagnostics: [{ code: "WORLD_CHANGE_CANDIDATE_INVALID" }],
    });
  });
});
