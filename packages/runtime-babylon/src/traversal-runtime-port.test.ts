import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.pure.js";
import {
  normalizeAuthoringSpecV4,
  type AuthoringSpecV4,
  type NormalizedWorldIRV4,
} from "@whitebox-world/authoring";
import {
  compileResolvedTraversalLockV1,
  compileWorldV5,
} from "@whitebox-world/compiler";
import type {
  ExecutionPlanV4,
  ExecutionPlanV5,
} from "@whitebox-world/runtime-contracts";
import { TRUSTED_DEFAULT_CONTROLLER_ID } from "@whitebox-world/runtime-contracts";
import { sha256CanonicalJson } from "@whitebox-world/protocol";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import {
  emitStaticColliderTriangleMeshV1,
  emitTransformedStaticColliderTriangleMeshV1,
} from "@whitebox-world/terrain-surface";
import {
  assertTraversalRuntimeWorldIdentityMatchesGraphV1,
  resolveTraversalLockV1,
  TraversalRuntimeErrorV1,
  type ResolvedTraversalLockReceiptV1,
} from "@whitebox-world/traversal";
import { describe, expect, it, vi } from "vitest";

import {
  createValidAuthoringSpec,
  createValidPackageSubjectWorld,
} from "../../authoring/src/test-fixture";
import {
  BabylonWorldRuntime,
  isWorldRuntimeLayoutAssertionErrorV1,
} from "./babylon-world-runtime";
import { BABYLON_TRAVERSAL_RUNTIME_INTERNAL } from "./traversal-runtime-internal";
import { createBabylonTraversalRuntimePortV1 } from "./traversal-runtime-port";
import {
  BABYLON_TRAVERSAL_RUNTIME_IMPLEMENTATION_IDENTITY_V1,
} from "./traversal-implementation-identity";

const havokWasmBytes = await readFile(
  createRequire(import.meta.url).resolve(
    "@babylonjs/havok/lib/esm/HavokPhysics.wasm",
  ),
);
const havokWasmBinary = havokWasmBytes.buffer.slice(
  havokWasmBytes.byteOffset,
  havokWasmBytes.byteOffset + havokWasmBytes.byteLength,
) as ArrayBuffer;

function routeWorld(
  source = createValidAuthoringSpec(),
): AuthoringSpecV4 {
  return {
    ...source,
    schemaVersion: 4,
    spatial: {
      ...source.spatial,
      traversalAreas: [],
      routes: [{
        id: "main-route",
        kind: "polyline-xz",
        pointsMetersXZ: [[0, 30], [0, -20]],
        widthMeters: 4,
        locomotionProfileRef:
          "worldkit://locomotion-profile/ground.standard@1",
      }],
    },
    nodes: [
      ...source.nodes.map((node) =>
        node.kind === "terrain" &&
          node.components.terrain.source.kind === "procedural"
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
          : node
      ),
      {
        id: "goal",
        kind: "anchor",
        placement: {
          kind: "fixed",
          transform: { positionMetersXYZ: [0, 0, -20] },
        },
        semantic: { classId: "route.destination" },
      },
    ],
    constraints: {
      placements: source.constraints.placements,
      connectivity: [{
        id: "hero-to-goal",
        kind: "connected-by-route",
        requirement: "required",
        traversingEntityId: "player",
        startAnchorEntityId: "spawn-main",
        destinationAnchorEntityId: "goal",
        routeId: "main-route",
      }],
    },
  };
}

function compileFixture(world = routeWorld()): {
  normalizedWorldIr: NormalizedWorldIRV4;
  executionPlan: ExecutionPlanV5;
  traversalLockReceipt: ResolvedTraversalLockReceiptV1;
} {
  const normalized = normalizeAuthoringSpecV4(world);
  if (
    !normalized.ok ||
    normalized.value === undefined ||
    normalized.normalizedWorldIrHash === undefined
  ) {
    throw new Error("Route fixture normalization failed.");
  }
  const compiled = compileWorldV5({
    normalizedWorldIr: normalized.value,
    normalizedWorldIrHash: normalized.normalizedWorldIrHash,
  });
  if (!compiled.ok || compiled.executionPlan === undefined) {
    throw new Error("Route fixture compilation failed.");
  }
  const traversalLockReceipt = compileResolvedTraversalLockV1({
    normalizedWorldIr: normalized.value,
    executionPlan: compiled.executionPlan,
    traversingEntityId: "player",
    runtimeImplementationIdentity:
      BABYLON_TRAVERSAL_RUNTIME_IMPLEMENTATION_IDENTITY_V1,
  });
  return {
    normalizedWorldIr: normalized.value,
    executionPlan: compiled.executionPlan,
    traversalLockReceipt,
  };
}

async function createRuntime(
  executionPlan: ExecutionPlanV4 | ExecutionPlanV5,
): Promise<BabylonWorldRuntime> {
  return BabylonWorldRuntime.create({
    executionPlan,
    havokWasmBinary,
    autoStartRenderLoop: false,
    engineFactory: () => new NullEngine({
      renderWidth: 320,
      renderHeight: 180,
      textureSize: 256,
      deterministicLockstep: true,
      lockstepMaxSteps: 4,
    }),
  });
}

function expectRuntimeCode(
  operation: () => unknown,
  code: TraversalRuntimeErrorV1["code"],
): void {
  try {
    operation();
    throw new Error("Expected traversal runtime operation to fail.");
  } catch (error) {
    expect(error).toBeInstanceOf(TraversalRuntimeErrorV1);
    expect((error as TraversalRuntimeErrorV1).code).toBe(code);
    expect((error as Error).message).toBe(code);
  }
}

function withStaticBoxAtStart(
  fixture: ReturnType<typeof compileFixture>,
  heightMeters: number,
): ExecutionPlanV5 {
  const plan = structuredClone(fixture.executionPlan);
  const placement = plan.layout.placementsByEntityId["spawn-main"]!;
  const startPlacement = {
    ...placement,
      transform: {
      ...placement.transform,
      positionMetersXYZ: [
        placement.transform.positionMetersXYZ[0],
        heightMeters,
        placement.transform.positionMetersXYZ[2],
      ] as const,
    },
  };
  const supportCollider = {
    entityId: `support-box-${heightMeters}`,
    logicalSubshapeId: "primary",
    colliderSubshapeId: `collider:support-box-${heightMeters}:primary`,
    colliderHash: `sha256:${"c".repeat(64)}` as const,
    transform: {
      positionMetersXYZ: [
        placement.transform.positionMetersXYZ[0],
        heightMeters / 2,
        placement.transform.positionMetersXYZ[2],
      ] as const,
      rotationEulerRadiansXYZ: [0, 0.37, 0] as const,
      scaleXYZ: [1.5, 1, 0.5] as const,
    },
    shape: {
      kind: "box" as const,
      sizeMetersXYZ: [2, heightMeters, 2] as const,
    },
  };
  return {
    ...plan,
    layout: {
      ...plan.layout,
      placementsByEntityId: {
        ...plan.layout.placementsByEntityId,
        "spawn-main": startPlacement,
      },
    },
    staticColliders: [
    ...plan.staticColliders,
      supportCollider,
    ],
  };
}

function withAsymmetricSaddleAtStart(
  fixture: ReturnType<typeof compileFixture>,
): ExecutionPlanV5 {
  const plan = structuredClone(fixture.executionPlan);
  const placement = plan.layout.placementsByEntityId["spawn-main"]!;
  return {
    ...plan,
    terrain: {
      ...plan.terrain,
      centerMetersXZ: [0, 30],
      sizeMetersXZ: [2, 2],
      resolutionCellsXZ: [2, 2],
      heightSamplesMeters: [0, 0.2, 0.4, 0],
      minimumHeightMeters: 0,
      maximumHeightMeters: 0.4,
    },
    layout: {
      ...plan.layout,
      placementsByEntityId: {
        ...plan.layout.placementsByEntityId,
        "spawn-main": {
          ...placement,
          transform: {
            ...placement.transform,
            positionMetersXYZ: [0, 0.3, 30],
          },
        },
      },
    },
  };
}

function withOutsideTerrainStaticSupport(
  fixture: ReturnType<typeof compileFixture>,
): ExecutionPlanV5 {
  const plan = structuredClone(fixture.executionPlan);
  const placement = plan.layout.placementsByEntityId["spawn-main"]!;
  const outsidePosition = [1_000, 1, 1_000] as const;
  return {
    ...plan,
    layout: {
      ...plan.layout,
      layoutAssertions: [],
      placementsByEntityId: {
        ...plan.layout.placementsByEntityId,
        "spawn-main": {
          ...placement,
          transform: {
            ...placement.transform,
            positionMetersXYZ: outsidePosition,
          },
        },
      },
    },
    staticColliders: [
      ...plan.staticColliders,
      {
        entityId: "outside-support",
        logicalSubshapeId: "primary",
        colliderSubshapeId: "collider:outside-support:primary",
        colliderHash: `sha256:${"d".repeat(64)}`,
        transform: {
          positionMetersXYZ: [outsidePosition[0], 0.5, outsidePosition[2]],
          rotationEulerRadiansXYZ: [0, 0, 0],
          scaleXYZ: [1, 1, 1],
        },
        shape: { kind: "box", sizeMetersXYZ: [4, 1, 4] },
      },
    ],
  };
}

function withNearbyRotatedCurbOutsideFootColumn(
  fixture: ReturnType<typeof compileFixture>,
): ExecutionPlanV5 {
  const plan = structuredClone(fixture.executionPlan);
  const [footX, , footZ] = plan.layout
    .placementsByEntityId["spawn-main"]!.transform.positionMetersXYZ;
  // The 45-degree curb's world AABB covers the foot, but its exact thin strip
  // stays outside the vertical XZ column through that foot sample.
  return {
    ...plan,
    staticColliders: [
      ...plan.staticColliders,
      {
        entityId: "nearby-curb",
        logicalSubshapeId: "primary",
        colliderSubshapeId: "collider:nearby-curb:primary",
        colliderHash: `sha256:${"e".repeat(64)}`,
        transform: {
          positionMetersXYZ: [footX, 0.05, footZ + 1],
          rotationEulerRadiansXYZ: [0, Math.PI / 4, 0],
          scaleXYZ: [1, 1, 1],
        },
        shape: { kind: "box", sizeMetersXYZ: [4, 0.1, 0.2] },
      },
    ],
  };
}

function withTieredStaticSupportAssertion(
  fixture: ReturnType<typeof compileFixture>,
): ExecutionPlanV5 {
  const plan = structuredClone(fixture.executionPlan);
  const supportedEntityId = "wall-east";
  const supportingEntityId = "tiered-support";
  const supportedTransform = {
    positionMetersXYZ: [20, 1.5, 20] as const,
    rotationEulerRadiansXYZ: [0, 0, 0] as const,
    scaleXYZ: [1, 1, 1] as const,
  };
  const originalPlacement =
    plan.layout.placementsByEntityId[supportedEntityId]!;
  return {
    ...plan,
    objects: plan.objects.map((object) =>
      object.entityId === supportedEntityId
        ? {
            ...object,
            primitive: {
              kind: "box" as const,
              sizeMetersXYZ: [1, 1, 1] as const,
            },
            transform: supportedTransform,
            collisionEnabled: false,
          }
        : object
    ),
    layout: {
      ...plan.layout,
      placementsByEntityId: {
        ...plan.layout.placementsByEntityId,
        [supportedEntityId]: {
          ...originalPlacement,
          transform: supportedTransform,
        },
        [supportingEntityId]: {
          entityId: supportingEntityId,
          transform: {
            positionMetersXYZ: [20, 0.5, 20],
            rotationEulerRadiansXYZ: [0, 0, 0],
            scaleXYZ: [1, 1, 1],
          },
          placementProvenance: originalPlacement.placementProvenance,
        },
      },
      layoutAssertions: [{
        constraintId: "wall-on-tiered-support",
        kind: "supported-by",
        supportedEntityId,
        supportingEntityId,
        maximumSupportGapMeters: 0.01,
        minimumSupportRatio: 1,
        evidenceEntityIds: [supportedEntityId, supportingEntityId],
        measurements: {},
        tolerances: {},
      }],
    },
    staticColliders: [
      ...plan.staticColliders.filter(
        (collider) => collider.entityId !== supportedEntityId,
      ),
      {
        entityId: supportingEntityId,
        logicalSubshapeId: "low",
        colliderSubshapeId: "collider:tiered-support:low",
        colliderHash: `sha256:${"f".repeat(64)}`,
        transform: {
          positionMetersXYZ: [20, 0.25, 20],
          rotationEulerRadiansXYZ: [0, 0, 0],
          scaleXYZ: [1, 1, 1],
        },
        shape: { kind: "box", sizeMetersXYZ: [4, 0.5, 4] },
      },
      {
        entityId: supportingEntityId,
        logicalSubshapeId: "high",
        colliderSubshapeId: "collider:tiered-support:high",
        colliderHash: `sha256:${"1".repeat(64)}`,
        transform: {
          positionMetersXYZ: [20, 0.5, 20],
          rotationEulerRadiansXYZ: [0, 0, 0],
          scaleXYZ: [1, 1, 1],
        },
        shape: { kind: "box", sizeMetersXYZ: [4, 1, 4] },
      },
    ],
  };
}


function privateFloat32ToleranceMeters(operationMagnitudeMeters: number): number {
  return 1e-6 + 2 * (2 ** -23) * Math.max(1, operationMagnitudeMeters);
}

function spyPlayerCheckSupport(runtime: BabylonWorldRuntime) {
  const controller = (runtime as unknown as {
    subjectControllersByEntityId: Map<string, {
      physicsController: { checkSupport: (...args: unknown[]) => unknown };
    }>;
  }).subjectControllersByEntityId.get("player")!;
  return vi.spyOn(controller.physicsController, "checkSupport");
}

function expectNoExpectedPathSurfaceState(evidence: {
  characterSupport: { surfaceResolution: object };
}): void {
  expect(JSON.stringify(evidence)).not.toMatch(/expectedPath/i);
  const keys = Object.keys(evidence.characterSupport.surfaceResolution).sort();
  if (keys.includes("mode") && keys.length === 1) {
    return;
  }
  expect(keys).toEqual([
    "colliderSubshapeId",
    "mode",
    "resolvedVersion",
    "resourceHash",
    "resourceRef",
    "surfaceEntityId",
    "traversalSurfaceId",
  ]);
}

function boundSurfaceForCollider(
  collider: ExecutionPlanV5["staticColliders"][number],
  logicalSurfaceId: string,
): ExecutionPlanV5["traversal"]["surfaces"][number] {
  return {
    kind: "static-collider",
    traversalSurfaceId: `traversal-surface:${collider.entityId}:${logicalSurfaceId}`,
    surfaceEntityId: collider.entityId,
    colliderSubshapeId: collider.colliderSubshapeId,
    resourceRef: `package://traversal-surface/${collider.entityId}.${logicalSurfaceId}@1`,
    resolvedVersion: "1",
    resourceHash: `sha256:${"a".repeat(64)}`,
    logicalSurfaceId,
    logicalSubshapeId: collider.logicalSubshapeId,
    colliderHash: collider.colliderHash,
    traversalSurfaceProfileRef:
      "worldkit://traversal-surface-profile/ground.static@1",
    traversalSurfaceProfileResolvedVersion: "1",
    traversalSurfaceProfileHash: `sha256:${"b".repeat(64)}`,
  };
}

function withBoundStaticBoxAtStart(
  fixture: ReturnType<typeof compileFixture>,
  heightMeters: number,
): ExecutionPlanV5 {
  const plan = withStaticBoxAtStart(fixture, heightMeters);
  const collider = plan.staticColliders[plan.staticColliders.length - 1]!;
  return {
    ...plan,
    traversal: {
      ...plan.traversal,
      surfaces: [
        ...plan.traversal.surfaces,
        boundSurfaceForCollider(collider, "primary"),
      ],
    },
  };
}

function rotateScaleCanonical(
  localMetersXYZ: readonly [number, number, number],
  rotationEulerRadiansXYZ: readonly [number, number, number],
  scaleXYZ: readonly [number, number, number],
): [number, number, number] {
  let x = localMetersXYZ[0] * scaleXYZ[0];
  let y = localMetersXYZ[1] * scaleXYZ[1];
  let z = localMetersXYZ[2] * scaleXYZ[2];
  const [pitch, yaw, roll] = rotationEulerRadiansXYZ;
  const cosineRoll = Math.cos(roll);
  const sineRoll = Math.sin(roll);
  [x, y] = [
    x * cosineRoll - y * sineRoll,
    x * sineRoll + y * cosineRoll,
  ];
  const cosinePitch = Math.cos(pitch);
  const sinePitch = Math.sin(pitch);
  [y, z] = [
    y * cosinePitch - z * sinePitch,
    y * sinePitch + z * cosinePitch,
  ];
  const cosineYaw = Math.cos(yaw);
  const sineYaw = Math.sin(yaw);
  [x, z] = [
    x * cosineYaw + z * sineYaw,
    -x * sineYaw + z * cosineYaw,
  ];
  return [x, y, z];
}

function rotateScaleWrongEulerXyz(
  localMetersXYZ: readonly [number, number, number],
  rotationEulerRadiansXYZ: readonly [number, number, number],
  scaleXYZ: readonly [number, number, number],
): [number, number, number] {
  let x = localMetersXYZ[0] * scaleXYZ[0];
  let y = localMetersXYZ[1] * scaleXYZ[1];
  let z = localMetersXYZ[2] * scaleXYZ[2];
  const [pitch, yaw, roll] = rotationEulerRadiansXYZ;
  const cosinePitch = Math.cos(pitch);
  const sinePitch = Math.sin(pitch);
  [y, z] = [
    y * cosinePitch - z * sinePitch,
    y * sinePitch + z * cosinePitch,
  ];
  const cosineYaw = Math.cos(yaw);
  const sineYaw = Math.sin(yaw);
  [x, z] = [
    x * cosineYaw + z * sineYaw,
    -x * sineYaw + z * cosineYaw,
  ];
  const cosineRoll = Math.cos(roll);
  const sineRoll = Math.sin(roll);
  [x, y] = [
    x * cosineRoll - y * sineRoll,
    x * sineRoll + y * cosineRoll,
  ];
  return [x, y, z];
}

function linearRowsCanonical(
  rotationEulerRadiansXYZ: readonly [number, number, number],
  scaleXYZ: readonly [number, number, number],
): readonly [readonly [number, number, number], readonly [number, number, number], readonly [number, number, number]] {
  const basis = [
    rotateScaleCanonical([1, 0, 0], rotationEulerRadiansXYZ, scaleXYZ),
    rotateScaleCanonical([0, 1, 0], rotationEulerRadiansXYZ, scaleXYZ),
    rotateScaleCanonical([0, 0, 1], rotationEulerRadiansXYZ, scaleXYZ),
  ] as const;
  return [
    [basis[0][0], basis[1][0], basis[2][0]],
    [basis[0][1], basis[1][1], basis[2][1]],
    [basis[0][2], basis[1][2], basis[2][2]],
  ];
}

function operationMagnitudeMeters(
  translationMetersXYZ: readonly [number, number, number],
  linear: readonly [readonly [number, number, number], readonly [number, number, number], readonly [number, number, number]],
  localMetersXYZ: readonly [number, number, number],
): [number, number, number] {
  return [0, 1, 2].map((axis) =>
    Math.abs(translationMetersXYZ[axis]!) +
    Math.abs(linear[axis]![0]! * localMetersXYZ[0]) +
    Math.abs(linear[axis]![1]! * localMetersXYZ[1]) +
    Math.abs(linear[axis]![2]! * localMetersXYZ[2])
  ) as [number, number, number];
}

function withBoundOrientedPlatformAtStart(
  fixture: ReturnType<typeof compileFixture>,
  options: Readonly<{
    entityId: string;
    heightMeters: number;
    sizeMetersXYZ: readonly [number, number, number];
    rotationEulerRadiansXYZ: readonly [number, number, number];
    scaleXYZ: readonly [number, number, number];
    translationMetersXYZ?: readonly [number, number, number];
  }>,
): ExecutionPlanV5 {
  const plan = structuredClone(fixture.executionPlan);
  const placement = plan.layout.placementsByEntityId["spawn-main"]!;
  const spawnXz: readonly [number, number] = [
    placement.transform.positionMetersXYZ[0],
    placement.transform.positionMetersXYZ[2],
  ];
  const localTopCenter: readonly [number, number, number] = [
    0,
    options.sizeMetersXYZ[1] / 2,
    0,
  ];
  const rotated = rotateScaleCanonical(
    localTopCenter,
    options.rotationEulerRadiansXYZ,
    options.scaleXYZ,
  );
  const translationMetersXYZ = options.translationMetersXYZ ?? [
    spawnXz[0] - rotated[0],
    options.heightMeters - rotated[1],
    spawnXz[1] - rotated[2],
  ];
  const supportCollider = {
    entityId: options.entityId,
    logicalSubshapeId: "primary",
    colliderSubshapeId: `collider:${options.entityId}:primary`,
    colliderHash: `sha256:${"c".repeat(64)}` as const,
    transform: {
      positionMetersXYZ: translationMetersXYZ,
      rotationEulerRadiansXYZ: options.rotationEulerRadiansXYZ,
      scaleXYZ: options.scaleXYZ,
    },
    shape: {
      kind: "box" as const,
      sizeMetersXYZ: options.sizeMetersXYZ,
    },
  };
  return {
    ...plan,
    layout: {
      ...plan.layout,
      layoutAssertions: [],
      placementsByEntityId: {
        ...plan.layout.placementsByEntityId,
        "spawn-main": {
          ...placement,
          transform: {
            ...placement.transform,
            positionMetersXYZ: [
              spawnXz[0],
              options.heightMeters,
              spawnXz[1],
            ],
          },
        },
      },
    },
    staticColliders: [...plan.staticColliders, supportCollider],
    traversal: {
      ...plan.traversal,
      surfaces: [
        ...plan.traversal.surfaces,
        boundSurfaceForCollider(supportCollider, "primary"),
      ],
    },
  };
}

function withBoundCeilingAboveStart(
  fixture: ReturnType<typeof compileFixture>,
): ExecutionPlanV5 {
  const plan = structuredClone(fixture.executionPlan);
  const placement = plan.layout.placementsByEntityId["spawn-main"]!;
  const ceiling = {
    entityId: "ceiling-slab",
    logicalSubshapeId: "primary",
    colliderSubshapeId: "collider:ceiling-slab:primary",
    colliderHash: `sha256:${"d".repeat(64)}` as const,
    transform: {
      positionMetersXYZ: [
        placement.transform.positionMetersXYZ[0],
        0.6,
        placement.transform.positionMetersXYZ[2],
      ] as const,
      rotationEulerRadiansXYZ: [0, 0, 0] as const,
      scaleXYZ: [1, 1, 1] as const,
    },
    shape: {
      kind: "box" as const,
      sizeMetersXYZ: [4, 1, 4] as const,
    },
  };
  return {
    ...plan,
    staticColliders: [...plan.staticColliders, ceiling],
    traversal: {
      ...plan.traversal,
      surfaces: [
        ...plan.traversal.surfaces,
        boundSurfaceForCollider(ceiling, "primary"),
      ],
    },
  };
}

function withBoundVerticalWallAtStart(
  fixture: ReturnType<typeof compileFixture>,
): ExecutionPlanV5 {
  const plan = structuredClone(fixture.executionPlan);
  const placement = plan.layout.placementsByEntityId["spawn-main"]!;
  const wall = {
    entityId: "vertical-wall",
    logicalSubshapeId: "primary",
    colliderSubshapeId: "collider:vertical-wall:primary",
    colliderHash: `sha256:${"e".repeat(64)}` as const,
    transform: {
      positionMetersXYZ: [
        placement.transform.positionMetersXYZ[0] + 0.6,
        1,
        placement.transform.positionMetersXYZ[2],
      ] as const,
      rotationEulerRadiansXYZ: [0, 0, 0] as const,
      scaleXYZ: [1, 1, 1] as const,
    },
    shape: {
      kind: "box" as const,
      sizeMetersXYZ: [0.2, 2, 4] as const,
    },
  };
  return {
    ...plan,
    staticColliders: [...plan.staticColliders, wall],
    traversal: {
      ...plan.traversal,
      surfaces: [
        ...plan.traversal.surfaces,
        boundSurfaceForCollider(wall, "primary"),
      ],
    },
  };
}

function withCoplanarBoundPlatformsAtStart(
  fixture: ReturnType<typeof compileFixture>,
): ExecutionPlanV5 {
  const plan = structuredClone(fixture.executionPlan);
  const placement = plan.layout.placementsByEntityId["spawn-main"]!;
  const spawn = placement.transform.positionMetersXYZ;
  const makeBox = (entityId: string, offsetX: number) => ({
    entityId,
    logicalSubshapeId: "primary" as const,
    colliderSubshapeId: `collider:${entityId}:primary`,
    colliderHash: `sha256:${entityId.padEnd(64, "0").slice(0, 64)}` as const,
    transform: {
      positionMetersXYZ: [spawn[0] + offsetX, 0.5, spawn[2]] as const,
      rotationEulerRadiansXYZ: [0, 0, 0] as const,
      scaleXYZ: [1, 1, 1] as const,
    },
    shape: {
      kind: "box" as const,
      sizeMetersXYZ: [2, 1, 2] as const,
    },
  });
  const first = makeBox("coplanar-a", -0.4);
  const second = makeBox("coplanar-b", 0.4);
  return {
    ...plan,
    layout: {
      ...plan.layout,
      layoutAssertions: [],
      placementsByEntityId: {
        ...plan.layout.placementsByEntityId,
        "spawn-main": {
          ...placement,
          transform: {
            ...placement.transform,
            positionMetersXYZ: [spawn[0], 1, spawn[2]],
          },
        },
      },
    },
    staticColliders: [...plan.staticColliders, first, second],
    traversal: {
      ...plan.traversal,
      surfaces: [
        ...plan.traversal.surfaces,
        boundSurfaceForCollider(first, "primary"),
        boundSurfaceForCollider(second, "primary"),
      ],
    },
  };
}

function withStackedBoundPlatformsAtStart(
  fixture: ReturnType<typeof compileFixture>,
): ExecutionPlanV5 {
  const plan = structuredClone(fixture.executionPlan);
  const placement = plan.layout.placementsByEntityId["spawn-main"]!;
  const spawn = placement.transform.positionMetersXYZ;
  const lower = {
    entityId: "stacked-lower",
    logicalSubshapeId: "primary" as const,
    colliderSubshapeId: "collider:stacked-lower:primary",
    colliderHash: `sha256:${"1".repeat(64)}` as const,
    transform: {
      positionMetersXYZ: [spawn[0], 0.1, spawn[2]] as const,
      rotationEulerRadiansXYZ: [0, 0, 0] as const,
      scaleXYZ: [1, 1, 1] as const,
    },
    shape: { kind: "box" as const, sizeMetersXYZ: [3, 0.2, 3] as const },
  };
  const upper = {
    entityId: "stacked-upper",
    logicalSubshapeId: "primary" as const,
    colliderSubshapeId: "collider:stacked-upper:primary",
    colliderHash: `sha256:${"2".repeat(64)}` as const,
    transform: {
      positionMetersXYZ: [spawn[0], 0.5, spawn[2]] as const,
      rotationEulerRadiansXYZ: [0, 0, 0] as const,
      scaleXYZ: [1, 1, 1] as const,
    },
    shape: { kind: "box" as const, sizeMetersXYZ: [2, 1, 2] as const },
  };
  return {
    ...plan,
    layout: {
      ...plan.layout,
      layoutAssertions: [],
      placementsByEntityId: {
        ...plan.layout.placementsByEntityId,
        "spawn-main": {
          ...placement,
          transform: {
            ...placement.transform,
            positionMetersXYZ: [spawn[0], 1, spawn[2]],
          },
        },
      },
    },
    staticColliders: [...plan.staticColliders, lower, upper],
    traversal: {
      ...plan.traversal,
      surfaces: [
        ...plan.traversal.surfaces,
        boundSurfaceForCollider(lower, "primary"),
        boundSurfaceForCollider(upper, "primary"),
      ],
    },
  };
}

function withQuarterMeterSeamAtStart(
  fixture: ReturnType<typeof compileFixture>,
): ExecutionPlanV5 {
  const plan = structuredClone(fixture.executionPlan);
  const placement = plan.layout.placementsByEntityId["spawn-main"]!;
  return {
    ...plan,
    terrain: {
      ...plan.terrain,
      centerMetersXZ: [0, 30],
      sizeMetersXZ: [2, 2],
      resolutionCellsXZ: [2, 2],
      heightSamplesMeters: [0, 0, 0.25, 0.25],
      minimumHeightMeters: 0,
      maximumHeightMeters: 0.25,
    },
    layout: {
      ...plan.layout,
      placementsByEntityId: {
        ...plan.layout.placementsByEntityId,
        "spawn-main": {
          ...placement,
          transform: {
            ...placement.transform,
            positionMetersXYZ: [0, 0.125, 30],
          },
        },
      },
    },
  };
}

function withSteepRampAtStart(
  fixture: ReturnType<typeof compileFixture>,
): ExecutionPlanV5 {
  const plan = structuredClone(fixture.executionPlan);
  const placement = plan.layout.placementsByEntityId["spawn-main"]!;
  return {
    ...plan,
    layout: {
      ...plan.layout,
      layoutAssertions: [],
      placementsByEntityId: {
        ...plan.layout.placementsByEntityId,
        "spawn-main": {
          ...placement,
          transform: {
            ...placement.transform,
            positionMetersXYZ: [0.4, 3, 30],
          },
        },
      },
    },
    staticColliders: [
      ...plan.staticColliders,
      {
        entityId: "steep-ramp",
        logicalSubshapeId: "primary",
        colliderSubshapeId: "collider:steep-ramp:primary",
        colliderHash: `sha256:${"c".repeat(64)}`,
        transform: {
          positionMetersXYZ: [0, 2.4, 30],
          rotationEulerRadiansXYZ: [0, 0, -0.9],
          scaleXYZ: [1, 1, 1],
        },
        shape: {
          kind: "box",
          sizeMetersXYZ: [4, 1, 4],
        },
      },
    ],
  };
}

function withStartTransform(
  fixture: ReturnType<typeof compileFixture>,
  transform: Readonly<{
    positionMetersXYZ: readonly [number, number, number];
    rotationEulerRadiansXYZ: readonly [number, number, number];
    scaleXYZ: readonly [number, number, number];
  }>,
): ExecutionPlanV5 {
  const plan = structuredClone(fixture.executionPlan);
  const placement = plan.layout.placementsByEntityId["spawn-main"]!;
  return {
    ...plan,
    layout: {
      ...plan.layout,
      placementsByEntityId: {
        ...plan.layout.placementsByEntityId,
        "spawn-main": {
          ...placement,
          transform,
        },
      },
    },
  };
}

describe("createBabylonTraversalRuntimePortV1", () => {
  it("fails closed for a V4 Runtime before evaluating traversal lock details", async () => {
    const fixture = compileFixture();
    const runtime = await createRuntime({
      ...fixture.executionPlan,
      schemaVersion: 4,
    } as unknown as ExecutionPlanV4);
    try {
      expectRuntimeCode(
        () => createBabylonTraversalRuntimePortV1({
          runtime,
          traversalLockReceipt: fixture.traversalLockReceipt,
        }),
        "TRAVERSAL_RUNTIME_PLAN_NOT_V5",
      );
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  it("requires a port-owned reset, then publishes immutable resolved terrain evidence", async () => {
    const fixture = compileFixture();
    const runtime = await createRuntime(fixture.executionPlan);
    try {
      const port = createBabylonTraversalRuntimePortV1({
        runtime,
        traversalLockReceipt: fixture.traversalLockReceipt,
      });
      expectRuntimeCode(
        () => port.readLatestTickEvidence(),
        "TRAVERSAL_RUNTIME_EVIDENCE_UNAVAILABLE",
      );

      const controller = (runtime as unknown as {
        subjectControllersByEntityId: Map<string, {
          physicsController: { checkSupport: (...args: unknown[]) => unknown };
        }>;
      }).subjectControllersByEntityId.get("player")!;
      const supportSpy = vi.spyOn(controller.physicsController, "checkSupport");
      const resetEvidence = port.resetToStartAnchor({
        startAnchorEntityId: "spawn-main",
      });

      expect(supportSpy).toHaveBeenCalledTimes(1);
      expect(resetEvidence).toMatchObject({
        kind: "traversal-runtime-tick-evidence",
        schemaVersion: 1,
        tick: 0,
        traversingEntityId: "player",
        resolvedTraversalLockHash:
          fixture.traversalLockReceipt.resolvedTraversalLockHash,
        movementMedium: "ground",
        characterSupport: {
          kind: "character-support-evidence",
          schemaVersion: 1,
          supportState: "supported",
          isSupportSurfaceDynamic: false,
          surfaceResolution: {
            mode: "resolved",
            traversalSurfaceId:
              fixture.executionPlan.traversal.surfaces[0]!.traversalSurfaceId,
          },
        },
      });
      expect(Object.isFrozen(resetEvidence)).toBe(true);
      expect(Object.isFrozen(resetEvidence.characterSupport)).toBe(true);

      supportSpy.mockClear();
      expect(port.readLatestTickEvidence()).toEqual(resetEvidence);
      expect(supportSpy).not.toHaveBeenCalled();
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  it("rejects a Runtime Port from a different legal world before reset even when both worlds share one traversal lock", async () => {
    const worldA = compileFixture();
    const worldBSpec = structuredClone(routeWorld());
    const goal = worldBSpec.nodes.find((node) => node.id === "goal");
    if (goal?.kind !== "anchor" || goal.placement.kind !== "fixed") {
      throw new Error("Expected the route fixture to contain a fixed goal Anchor.");
    }
    goal.placement.transform.positionMetersXYZ = [7, 0, -20];
    const worldB = compileFixture(worldBSpec);
    expect(worldB.traversalLockReceipt.resolvedTraversalLockHash).toBe(
      worldA.traversalLockReceipt.resolvedTraversalLockHash,
    );
    expect(worldB.executionPlan.authoringSpecHash).not.toBe(
      worldA.executionPlan.authoringSpecHash,
    );

    const runtime = await createRuntime(worldB.executionPlan);
    try {
      const port = createBabylonTraversalRuntimePortV1({
        runtime,
        traversalLockReceipt: worldB.traversalLockReceipt,
      });
      expect(() => assertTraversalRuntimeWorldIdentityMatchesGraphV1({
        traversalGraph: {
          authoringSpecHash: worldA.executionPlan.authoringSpecHash,
          layoutSolveReportHash:
            worldA.executionPlan.layout.layoutSolveReportHash as `sha256:${string}`,
          resourceLockHash:
            worldA.executionPlan.resourceLockHash as `sha256:${string}`,
        },
        runtimeWorldIdentity: port,
      })).toThrow("TRAVERSAL_RUNTIME_WORLD_IDENTITY_MISMATCH");
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  it("keeps provider internals private and runtime provenance immutable", async () => {
    const fixture = compileFixture();
    const runtime = await createRuntime(fixture.executionPlan);
    try {
      const port = createBabylonTraversalRuntimePortV1({
        runtime,
        traversalLockReceipt: fixture.traversalLockReceipt,
      });

      expect(Object.keys(port)).not.toEqual(expect.arrayContaining([
        "host",
        "plan",
        "receipt",
        "lock",
      ]));
      expect(Object.isFrozen(port)).toBe(true);
      expect(() => {
        (port as { resolvedTraversalLockHash: string })
          .resolvedTraversalLockHash = `sha256:${"e".repeat(64)}`;
      }).toThrow(TypeError);

      const evidence = port.resetToStartAnchor({
        startAnchorEntityId: "spawn-main",
      });
      expect(evidence.resolvedTraversalLockHash).toBe(
        fixture.traversalLockReceipt.resolvedTraversalLockHash,
      );
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  it("rejects canonical world drift introduced after Runtime creation", async () => {
    const fixture = compileFixture();
    const plan = withStaticBoxAtStart(fixture, 0.1);
    const runtime = await createRuntime(plan);
    try {
      const mutablePlan = plan as unknown as {
        terrain: { heightSamplesMeters: number[] };
        staticColliders: Array<{
          transform: { positionMetersXYZ: number[] };
        }>;
        layout: {
          placementsByEntityId: Record<
            string,
            { transform: { positionMetersXYZ: number[] } }
          >;
        };
      };
      mutablePlan.terrain.heightSamplesMeters[0] =
        mutablePlan.terrain.heightSamplesMeters[0]! + 0.25;
      const staticPosition = mutablePlan.staticColliders.at(-1)!
        .transform.positionMetersXYZ;
      staticPosition[0] = staticPosition[0]! + 0.5;
      const anchorPosition = mutablePlan.layout.placementsByEntityId[
        "spawn-main"
      ]!.transform.positionMetersXYZ;
      anchorPosition[2] = anchorPosition[2]! + 1;

      expectRuntimeCode(
        () => createBabylonTraversalRuntimePortV1({
          runtime,
          traversalLockReceipt: fixture.traversalLockReceipt,
        }),
        "TRAVERSAL_RUNTIME_WORLD_IDENTITY_MISMATCH",
      );
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  it("closes non-canonical world drift introduced after Runtime creation", async () => {
    const fixture = compileFixture();
    const runtime = await createRuntime(fixture.executionPlan);
    try {
      const samples = fixture.executionPlan.terrain
        .heightSamplesMeters as unknown[];
      samples[0] = 1n;

      expectRuntimeCode(
        () => createBabylonTraversalRuntimePortV1({
          runtime,
          traversalLockReceipt: fixture.traversalLockReceipt,
        }),
        "TRAVERSAL_RUNTIME_WORLD_IDENTITY_MISMATCH",
      );
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  it("rejects in-place V5 Plan drift even when its published world hashes stay unchanged", async () => {
    const fixture = compileFixture();
    const runtime = await createRuntime(fixture.executionPlan);
    try {
      const port = createBabylonTraversalRuntimePortV1({
        runtime,
        traversalLockReceipt: fixture.traversalLockReceipt,
      });
      const originalExecutionPlanHash = port.executionPlanHash;
      const samples = fixture.executionPlan.terrain.heightSamplesMeters as number[];
      samples[0] = samples[0]! + 0.25;

      expect(port.executionPlanHash).toBe(originalExecutionPlanHash);
      expectRuntimeCode(
        () => port.resetToStartAnchor({ startAnchorEntityId: "spawn-main" }),
        "TRAVERSAL_RUNTIME_WORLD_IDENTITY_MISMATCH",
      );
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  it("closes canonical hashing failures from adversarial in-place V5 Plan drift", async () => {
    const fixture = compileFixture();
    const runtime = await createRuntime(fixture.executionPlan);
    try {
      const port = createBabylonTraversalRuntimePortV1({
        runtime,
        traversalLockReceipt: fixture.traversalLockReceipt,
      });
      const samples = fixture.executionPlan.terrain.heightSamplesMeters as unknown[];
      samples[0] = 1n;

      expectRuntimeCode(
        () => port.resetToStartAnchor({ startAnchorEntityId: "spawn-main" }),
        "TRAVERSAL_RUNTIME_WORLD_IDENTITY_MISMATCH",
      );
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  it("rejects a forged receipt hash and invalid Anchor with closed codes", async () => {
    const fixture = compileFixture();
    const runtime = await createRuntime(fixture.executionPlan);
    try {
      expectRuntimeCode(
        () => createBabylonTraversalRuntimePortV1({
          runtime,
          traversalLockReceipt: {
            ...fixture.traversalLockReceipt,
            resolvedTraversalLockHash: `sha256:${"f".repeat(64)}`,
          },
        }),
        "TRAVERSAL_RUNTIME_LOCK_MISMATCH",
      );
      const port = createBabylonTraversalRuntimePortV1({
        runtime,
        traversalLockReceipt: fixture.traversalLockReceipt,
      });
      expectRuntimeCode(
        () => port.resetToStartAnchor({ startAnchorEntityId: "not-an-anchor" }),
        "TRAVERSAL_RUNTIME_START_ANCHOR_INVALID",
      );
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  it("rejects every forged resource hash even when the receipt hash is recomputed", async () => {
    const fixture = compileFixture();
    const runtime = await createRuntime(fixture.executionPlan);
    try {
      const resourceHashFields = [
        "colliderProfileHash",
        "physicsBodyProfileHash",
        "locomotionProfileHash",
        "locomotionCapabilityHash",
        "controlFeelProfileHash",
        "controlProfileHash",
        "motionProfileHash",
        "motionKernelHash",
        "mediumProfileHash",
        "subjectDefinitionHash",
      ] as const;
      for (const field of resourceHashFields) {
        const forgedReceipt = resolveTraversalLockV1({
          ...fixture.traversalLockReceipt.lock,
          [field]: `sha256:${"e".repeat(64)}`,
        });
        expectRuntimeCode(
          () => createBabylonTraversalRuntimePortV1({
            runtime,
            traversalLockReceipt: forgedReceipt,
          }),
          "TRAVERSAL_RUNTIME_LOCK_MISMATCH",
        );
      }
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  it("rejects a self-consistent Plan Resource Lock from a different world lock", async () => {
    const fixture = compileFixture();
    const plan = structuredClone(fixture.executionPlan);
    const unrelatedEntry = plan.resourceLockEntries.find(
      (entry) => entry.resourceKind === "subject-definition",
    )!;
    (unrelatedEntry as { resolvedVersion: string }).resolvedVersion = "forged";
    (plan as { resourceLockHash: string }).resourceLockHash =
      sha256CanonicalJson(plan.resourceLockEntries);
    const runtime = await createRuntime(plan);
    try {
      expectRuntimeCode(
        () => createBabylonTraversalRuntimePortV1({
          runtime,
          traversalLockReceipt: fixture.traversalLockReceipt,
        }),
        "TRAVERSAL_RUNTIME_LOCK_MISMATCH",
      );
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  it("publishes unsupported air evidence without a surface identity", async () => {
    const fixture = compileFixture();
    const plan = withStartTransform(fixture, {
      positionMetersXYZ: [0, 2, 30],
      rotationEulerRadiansXYZ: [0, 0, 0],
      scaleXYZ: [1, 1, 1],
    });
    const runtime = await createRuntime(plan);
    try {
      const port = createBabylonTraversalRuntimePortV1({
        runtime,
        traversalLockReceipt: fixture.traversalLockReceipt,
      });
      const evidence = port.resetToStartAnchor({
        startAnchorEntityId: "spawn-main",
      });

      expect(evidence).toMatchObject({
        movementMedium: "air",
        locomotionMode: "airborne",
        characterSupport: {
          supportState: "unsupported",
          surfaceResolution: { mode: "unsupported" },
        },
      });
      expect(Object.keys(evidence.characterSupport.surfaceResolution))
        .toEqual(["mode"]);
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  it("resets Subject Origin at the Anchor, applies yaw only, and preserves collider offset", async () => {
    const fixture = compileFixture();
    const anchorPosition = [1, 0, 29] as const;
    const yawRadians = 0.7;
    const plan = withStartTransform(fixture, {
      positionMetersXYZ: anchorPosition,
      rotationEulerRadiansXYZ: [0.4, yawRadians, -0.3],
      scaleXYZ: [2, 3, 4],
    });
    const runtime = await createRuntime(plan);
    try {
      const port = createBabylonTraversalRuntimePortV1({
        runtime,
        traversalLockReceipt: fixture.traversalLockReceipt,
      });
      const evidence = port.resetToStartAnchor({
        startAnchorEntityId: "spawn-main",
      });
      const controller = (runtime as unknown as {
        subjectControllersByEntityId: Map<string, {
          controllerCenter: { x: number; y: number; z: number };
          motionSnapshot(): { forwardXYZ: readonly number[] };
        }>;
      }).subjectControllersByEntityId.get("player")!;
      const offset = fixture.traversalLockReceipt.lock
        .colliderCenterOffsetMetersXYZ;

      expect(evidence.subjectPositionMetersXYZ).toEqual(anchorPosition);
      expect([
        controller.controllerCenter.x,
        controller.controllerCenter.y,
        controller.controllerCenter.z,
      ]).toEqual([
        anchorPosition[0] + offset[0],
        anchorPosition[1] + offset[1],
        anchorPosition[2] + offset[2],
      ]);
      expect(controller.motionSnapshot().forwardXYZ).toEqual([
        -Math.sin(yawRadians),
        0,
        -Math.cos(yawRadians),
      ]);
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  it("submits one canonical world-XZ tick without consulting the camera frame", async () => {
    const fixture = compileFixture();
    const runtime = await createRuntime(fixture.executionPlan);
    try {
      const port = createBabylonTraversalRuntimePortV1({
        runtime,
        traversalLockReceipt: fixture.traversalLockReceipt,
      });
      port.resetToStartAnchor({ startAnchorEntityId: "spawn-main" });
      const cameraFrameSpy = vi.spyOn(
        (runtime as unknown as {
          cameraDirector: { controlFrame: (...args: unknown[]) => unknown };
        }).cameraDirector,
        "controlFrame",
      );

      const controller = (runtime as unknown as {
        subjectControllersByEntityId: Map<string, {
          physicsController: { checkSupport: (...args: unknown[]) => unknown };
        }>;
      }).subjectControllersByEntityId.get("player")!;
      const supportSpy = vi.spyOn(controller.physicsController, "checkSupport");
      const before = port.readLatestTickEvidence();

      const next = await port.runFixedTick({
        walkDirectionWorldXZ: [0, -1],
      });

      expect(supportSpy).toHaveBeenCalledTimes(1);
      expect(next.tick).toBe(1);
      expect(next.velocityMetersPerSecondXYZ[2]).toBeLessThan(0);
      expect(next.characterSupport.sampledFootPositionMetersXYZ[2]).toBe(
        before.subjectPositionMetersXYZ[2],
      );
      expect(next.subjectPositionMetersXYZ[2]).toBeLessThan(
        next.characterSupport.sampledFootPositionMetersXYZ[2],
      );
      expect(cameraFrameSpy).not.toHaveBeenCalled();
      expect(runtime.snapshot().tick).toBe(1);
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  it("produces identical direct traversal evidence under different camera yaw", async () => {
    const fixture = compileFixture();
    const firstRuntime = await createRuntime(fixture.executionPlan);
    const secondRuntime = await createRuntime(fixture.executionPlan);
    try {
      const firstPort = createBabylonTraversalRuntimePortV1({
        runtime: firstRuntime,
        traversalLockReceipt: fixture.traversalLockReceipt,
      });
      const secondPort = createBabylonTraversalRuntimePortV1({
        runtime: secondRuntime,
        traversalLockReceipt: fixture.traversalLockReceipt,
      });
      firstPort.resetToStartAnchor({ startAnchorEntityId: "spawn-main" });
      secondPort.resetToStartAnchor({ startAnchorEntityId: "spawn-main" });
      secondRuntime.adjustCameraView({ yawDeltaRadians: Math.PI / 2 });

      const first = await firstPort.runFixedTick({
        walkDirectionWorldXZ: [1, 0],
      });
      const second = await secondPort.runFixedTick({
        walkDirectionWorldXZ: [1, 0],
      });

      expect(second.subjectPositionMetersXYZ).toEqual(
        first.subjectPositionMetersXYZ,
      );
      expect(second.velocityMetersPerSecondXYZ).toEqual(
        first.velocityMetersPerSecondXYZ,
      );
      expect(second.characterSupport).toEqual(first.characterSupport);
    } finally {
      await firstRuntime.dispose();
      await secondRuntime.dispose();
    }
  }, 30_000);

  it("captures a distinct receipt for each back-to-back fixed tick", async () => {
    const fixture = compileFixture();
    const runtime = await createRuntime(fixture.executionPlan);
    try {
      const port = createBabylonTraversalRuntimePortV1({
        runtime,
        traversalLockReceipt: fixture.traversalLockReceipt,
      });
      port.resetToStartAnchor({ startAnchorEntityId: "spawn-main" });

      const firstPromise = port.runFixedTick({
        walkDirectionWorldXZ: [0, -1],
      });
      const secondPromise = port.runFixedTick({
        walkDirectionWorldXZ: [0, -1],
      });
      const [first, second] = await Promise.all([firstPromise, secondPromise]);

      expect(first.tick).toBe(1);
      expect(second.tick).toBe(2);
      expect(first.subjectPositionMetersXYZ[2]).toBeGreaterThan(
        second.subjectPositionMetersXYZ[2],
      );
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  it("fails closed when the single fixed-tick support query fails", async () => {
    const fixture = compileFixture();
    const runtime = await createRuntime(fixture.executionPlan);
    try {
      const port = createBabylonTraversalRuntimePortV1({
        runtime,
        traversalLockReceipt: fixture.traversalLockReceipt,
      });
      port.resetToStartAnchor({ startAnchorEntityId: "spawn-main" });
      const internal = runtime[BABYLON_TRAVERSAL_RUNTIME_INTERNAL]();
      const controller = internal.readSubjectController("player")!;
      vi.spyOn(controller.physicsController, "checkSupport")
        .mockImplementationOnce(() => {
          throw new Error("native support failure");
        });

      await expect(port.runFixedTick({
        walkDirectionWorldXZ: [0, -1],
      })).rejects.toMatchObject({
        code: "TRAVERSAL_RUNTIME_UNAVAILABLE",
        message: "TRAVERSAL_RUNTIME_UNAVAILABLE",
      });
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  it("fails closed when a Browser fixed tick activates Motion fallback before an evidence read", async () => {
    const fixture = compileFixture();
    const runtime = await createRuntime(fixture.executionPlan);
    try {
      const port = createBabylonTraversalRuntimePortV1({
        runtime,
        traversalLockReceipt: fixture.traversalLockReceipt,
      });
      port.resetToStartAnchor({ startAnchorEntityId: "spawn-main" });
      const internal = runtime[BABYLON_TRAVERSAL_RUNTIME_INTERNAL]();
      const controller = internal.readSubjectController("player")!;
      vi.spyOn(controller.physicsController, "checkSupport")
        .mockImplementationOnce(() => {
          throw new Error("native support failure");
        });

      await runtime.runFixedInput({ actions: [], ticks: 1 });

      expectRuntimeCode(
        () => port.readLatestTickEvidence(),
        "TRAVERSAL_RUNTIME_UNAVAILABLE",
      );
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  it("rejects non-canonical direction and invalidates evidence after ordinary reset", async () => {
    const fixture = compileFixture();
    const runtime = await createRuntime(fixture.executionPlan);
    try {
      const port = createBabylonTraversalRuntimePortV1({
        runtime,
        traversalLockReceipt: fixture.traversalLockReceipt,
      });
      port.resetToStartAnchor({ startAnchorEntityId: "spawn-main" });
      await expect(port.runFixedTick({
        walkDirectionWorldXZ: [0.5, 0.5],
      })).rejects.toMatchObject({
        code: "TRAVERSAL_RUNTIME_WALK_DIRECTION_INVALID",
      });

      runtime.reset();
      expectRuntimeCode(
        () => port.readLatestTickEvidence(),
        "TRAVERSAL_RUNTIME_EVIDENCE_UNAVAILABLE",
      );
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  it("fails a pending unlocked Motion selection before reset mutation or support query", async () => {
    const fixture = compileFixture();
    const runtime = await createRuntime(fixture.executionPlan);
    try {
      const port = createBabylonTraversalRuntimePortV1({
        runtime,
        traversalLockReceipt: fixture.traversalLockReceipt,
      });
      const subject = fixture.executionPlan.subjects.find(
        (candidate) => candidate.entityId === "player",
      )!;
      const fallbackMotionProfileRef =
        subject.capabilityAssembly!.fallbackMotionProfile.resourceRef;
      expect(runtime.requestMotionProfile(
        "player",
        fallbackMotionProfileRef,
      )).toBe(true);
      const controller = (runtime as unknown as {
        subjectControllersByEntityId: Map<string, {
          physicsController: { checkSupport: (...args: unknown[]) => unknown };
        }>;
      }).subjectControllersByEntityId.get("player")!;
      const supportSpy = vi.spyOn(controller.physicsController, "checkSupport");

      expectRuntimeCode(
        () => port.resetToStartAnchor({ startAnchorEntityId: "spawn-main" }),
        "TRAVERSAL_RUNTIME_LIVE_LOCK_MISMATCH",
      );
      expect(supportSpy).not.toHaveBeenCalled();
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  it("fails closed when live slope state drifts from the lock", async () => {
    const fixture = compileFixture();
    const runtime = await createRuntime(fixture.executionPlan);
    try {
      const port = createBabylonTraversalRuntimePortV1({
        runtime,
        traversalLockReceipt: fixture.traversalLockReceipt,
      });
      port.resetToStartAnchor({ startAnchorEntityId: "spawn-main" });
      const controller = (runtime as unknown as {
        subjectControllersByEntityId: Map<string, {
          physicsController: { maxSlopeCosine: number };
        }>;
      }).subjectControllersByEntityId.get("player")!;
      controller.physicsController.maxSlopeCosine -= 0.1;

      expectRuntimeCode(
        () => port.readLatestTickEvidence(),
        "TRAVERSAL_RUNTIME_LIVE_LOCK_MISMATCH",
      );
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  it("classifies low overlapping unbound support as heightfield-resolved and tall unbound support as unmatched", async () => {
    for (const [heightMeters, expectedMode] of [
      [0.1, "resolved"],
      [1, "unmatched"],
    ] as const) {
      const fixture = compileFixture();
      const runtime = await createRuntime(withStaticBoxAtStart(
        fixture,
        heightMeters,
      ));
      try {
        const port = createBabylonTraversalRuntimePortV1({
          runtime,
          traversalLockReceipt: fixture.traversalLockReceipt,
        });
        const evidence = port.resetToStartAnchor({
          startAnchorEntityId: "spawn-main",
        });

        expect(evidence.characterSupport.supportState).toBe("supported");
        expect(evidence.characterSupport.surfaceResolution.mode).toBe(
          expectedMode,
        );
      } finally {
        await runtime.dispose();
      }
    }
  }, 30_000);

  it("keeps terrain resolved when a nearby rotated curb misses the foot XZ column", async () => {
    const fixture = compileFixture();
    const runtime = await createRuntime(
      withNearbyRotatedCurbOutsideFootColumn(fixture),
    );
    try {
      const port = createBabylonTraversalRuntimePortV1({
        runtime,
        traversalLockReceipt: fixture.traversalLockReceipt,
      });
      const evidence = port.resetToStartAnchor({
        startAnchorEntityId: "spawn-main",
      });

      expect(evidence.characterSupport.supportState).toBe("supported");
      const surface = fixture.executionPlan.traversal.surfaces[0]!;
      expect(evidence.characterSupport.surfaceResolution).toEqual({
        mode: "resolved",
        traversalSurfaceId: surface.traversalSurfaceId,
        surfaceEntityId: surface.surfaceEntityId,
        colliderSubshapeId: surface.colliderSubshapeId,
        resourceRef: surface.resourceRef,
        resolvedVersion: surface.resolvedVersion,
        resourceHash: surface.resourceHash,
      });
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  it("uses the highest exact support hit across subshapes owned by one supporting entity", async () => {
    const fixture = compileFixture();
    const plan = withTieredStaticSupportAssertion(fixture);
    const lowOnlyPlan = {
      ...plan,
      staticColliders: plan.staticColliders.filter(
        (collider) => collider.logicalSubshapeId !== "high",
      ),
    };
    const lowOnlyError = await createRuntime(lowOnlyPlan).then(
      async (unexpectedRuntime) => {
        await unexpectedRuntime.dispose();
        return undefined;
      },
      (error) => error as unknown,
    );
    expect(isWorldRuntimeLayoutAssertionErrorV1(lowOnlyError)).toBe(true);

    const runtime = await createRuntime(plan);
    try {
      const port = createBabylonTraversalRuntimePortV1({
        runtime,
        traversalLockReceipt: fixture.traversalLockReceipt,
      });
      const evidence = port.resetToStartAnchor({
        startAnchorEntityId: "spawn-main",
      });

      expect(evidence.characterSupport.supportState).toBe("supported");
      expect(evidence.characterSupport.surfaceResolution.mode).toBe("resolved");
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  it("does not clamp terrain when static support is outside terrain XZ", async () => {
    const fixture = compileFixture();
    const runtime = await createRuntime(withOutsideTerrainStaticSupport(fixture));
    try {
      const port = createBabylonTraversalRuntimePortV1({
        runtime,
        traversalLockReceipt: fixture.traversalLockReceipt,
      });
      const evidence = port.resetToStartAnchor({
        startAnchorEntityId: "spawn-main",
      });

      expect(evidence.characterSupport.supportState).toBe("supported");
      expect(evidence.characterSupport.surfaceResolution).toEqual({
        mode: "unmatched",
      });
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  it("aligns V5 Havok support with the canonical asymmetric saddle diagonal", async () => {
    const fixture = compileFixture();
    const runtime = await createRuntime(withAsymmetricSaddleAtStart(fixture));
    try {
      const port = createBabylonTraversalRuntimePortV1({
        runtime,
        traversalLockReceipt: fixture.traversalLockReceipt,
      });
      const evidence = port.resetToStartAnchor({
        startAnchorEntityId: "spawn-main",
      });

      expect(evidence.characterSupport.supportState).toBe("supported");
      expect(evidence.characterSupport.sampledFootPositionMetersXYZ[1])
        .toBeCloseTo(0.3, 2);
      expect(evidence.characterSupport.surfaceResolution.mode).toBe("resolved");
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  it("invalidates evidence across rebind-away and rebind-back transitions", async () => {
    const fixture = compileFixture(routeWorld(createValidPackageSubjectWorld()));
    const runtime = await createRuntime(fixture.executionPlan);
    try {
      const port = createBabylonTraversalRuntimePortV1({
        runtime,
        traversalLockReceipt: fixture.traversalLockReceipt,
      });
      port.resetToStartAnchor({ startAnchorEntityId: "spawn-main" });
      expect(runtime.bindControl({
        controllerId: TRUSTED_DEFAULT_CONTROLLER_ID,
        expectedControlledEntityId: "player",
        controlledEntityId: "pack-animal-a",
      }).status).toBe("committed");
      expectRuntimeCode(
        () => port.readLatestTickEvidence(),
        "TRAVERSAL_RUNTIME_NOT_CONTROLLED",
      );
      expect(runtime.bindControl({
        controllerId: TRUSTED_DEFAULT_CONTROLLER_ID,
        expectedControlledEntityId: "pack-animal-a",
        controlledEntityId: "player",
      }).status).toBe("committed");
      expectRuntimeCode(
        () => port.readLatestTickEvidence(),
        "TRAVERSAL_RUNTIME_EVIDENCE_UNAVAILABLE",
      );
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  it("performs one merged reset support query for every Subject", async () => {
    const fixture = compileFixture(routeWorld(createValidPackageSubjectWorld()));
    const runtime = await createRuntime(fixture.executionPlan);
    try {
      const controllers = (runtime as unknown as {
        subjectControllersByEntityId: Map<string, {
          physicsController: { checkSupport: (...args: unknown[]) => unknown };
        }>;
      }).subjectControllersByEntityId;
      const supportSpies = [...controllers.values()].map((controller) =>
        vi.spyOn(controller.physicsController, "checkSupport")
      );
      const port = createBabylonTraversalRuntimePortV1({
        runtime,
        traversalLockReceipt: fixture.traversalLockReceipt,
      });

      port.resetToStartAnchor({ startAnchorEntityId: "spawn-main" });

      expect(supportSpies).toHaveLength(fixture.executionPlan.subjects.length);
      for (const supportSpy of supportSpies) {
        expect(supportSpy).toHaveBeenCalledTimes(1);
      }
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  it("uses V5 static collider rows as the only static-body authority", async () => {
    const fixture = compileFixture();
    const plan = withStaticBoxAtStart(fixture, 0.1);
    const runtime = await createRuntime(plan);
    try {
      expect(runtime.snapshot().resources.bodies).toBe(
        1 +
          plan.staticColliders.length +
          plan.subjects.length,
      );
      const internal = runtime[BABYLON_TRAVERSAL_RUNTIME_INTERNAL]();
      const collisionMeshes = internal.readStaticCollisionMeshes();
      expect(collisionMeshes.map(({ collider }) => collider)).toEqual(
        plan.staticColliders,
      );
      for (const { collider, mesh } of collisionMeshes) {
        const local = emitStaticColliderTriangleMeshV1(collider.shape);
        expect(mesh.getVerticesData(VertexBuffer.PositionKind)).toEqual(
          [...local.localPositionsMetersXYZ],
        );
        expect(mesh.getIndices()).toEqual([...local.triangleIndices]);
        expect([mesh.position.x, mesh.position.y, mesh.position.z]).toEqual(
          collider.transform.positionMetersXYZ,
        );
        expect([mesh.scaling.x, mesh.scaling.y, mesh.scaling.z]).toEqual(
          collider.transform.scaleXYZ,
        );
      }
    } finally {
      await runtime.dispose();
    }
  }, 30_000);


  it("resolves a bound static platform and queries support once", async () => {
    const fixture = compileFixture();
    const plan = withBoundStaticBoxAtStart(fixture, 1);
    const runtime = await createRuntime(plan);
    try {
      const port = createBabylonTraversalRuntimePortV1({
        runtime,
        traversalLockReceipt: fixture.traversalLockReceipt,
      });
      const supportSpy = spyPlayerCheckSupport(runtime);
      const evidence = port.resetToStartAnchor({
        startAnchorEntityId: "spawn-main",
      });
      const bound = plan.traversal.surfaces.find(
        (surface) => surface.kind === "static-collider",
      )!;

      expect(supportSpy).toHaveBeenCalledTimes(1);
      expect(evidence.characterSupport.supportState).toBe("supported");
      expect(evidence.characterSupport.surfaceResolution).toEqual({
        mode: "resolved",
        traversalSurfaceId: bound.traversalSurfaceId,
        surfaceEntityId: bound.surfaceEntityId,
        colliderSubshapeId: bound.colliderSubshapeId,
        resourceRef: bound.resourceRef,
        resolvedVersion: bound.resolvedVersion,
        resourceHash: bound.resourceHash,
      });
      expectNoExpectedPathSurfaceState(evidence);
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  it("keeps unbound colliders unmatched when they are the only support", async () => {
    const fixture = compileFixture();
    const runtime = await createRuntime(withStaticBoxAtStart(fixture, 1));
    try {
      const port = createBabylonTraversalRuntimePortV1({
        runtime,
        traversalLockReceipt: fixture.traversalLockReceipt,
      });
      const supportSpy = spyPlayerCheckSupport(runtime);
      const evidence = port.resetToStartAnchor({
        startAnchorEntityId: "spawn-main",
      });

      expect(supportSpy).toHaveBeenCalledTimes(1);
      expect(evidence.characterSupport.supportState).toBe("supported");
      expect(evidence.characterSupport.surfaceResolution).toEqual({
        mode: "unmatched",
      });
      expectNoExpectedPathSurfaceState(evidence);
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  it("marks dynamic retained support as unmatched without selecting a surface", async () => {
    const fixture = compileFixture();
    const runtime = await createRuntime(fixture.executionPlan);
    try {
      const controller = (runtime as unknown as {
        subjectControllersByEntityId: Map<string, {
          physicsController: { checkSupport: (...args: unknown[]) => unknown };
        }>;
      }).subjectControllersByEntityId.get("player")!;
      const original = controller.physicsController.checkSupport.bind(
        controller.physicsController,
      );
      const supportSpy = vi.spyOn(
        controller.physicsController,
        "checkSupport",
      ).mockImplementation((...args: unknown[]) => {
        const sample = (original as (...callArgs: unknown[]) => { isSurfaceDynamic: boolean })(
          ...args,
        );
        sample.isSurfaceDynamic = true;
        return sample;
      });
      const port = createBabylonTraversalRuntimePortV1({
        runtime,
        traversalLockReceipt: fixture.traversalLockReceipt,
      });
      supportSpy.mockClear();
      const evidence = port.resetToStartAnchor({
        startAnchorEntityId: "spawn-main",
      });

      expect(supportSpy).toHaveBeenCalledTimes(1);
      expect(evidence.characterSupport.isSupportSurfaceDynamic).toBe(true);
      expect(evidence.characterSupport.surfaceResolution).toEqual({
        mode: "unmatched",
      });
      expectNoExpectedPathSurfaceState(evidence);
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  it("resolves the 0.25m heightfield seam without expected Path Surface state", async () => {
    const fixture = compileFixture();
    const runtime = await createRuntime(withQuarterMeterSeamAtStart(fixture));
    try {
      const port = createBabylonTraversalRuntimePortV1({
        runtime,
        traversalLockReceipt: fixture.traversalLockReceipt,
      });
      const supportSpy = spyPlayerCheckSupport(runtime);
      const evidence = port.resetToStartAnchor({
        startAnchorEntityId: "spawn-main",
      });
      const heightfield = fixture.executionPlan.traversal.surfaces[0]!;

      expect(supportSpy).toHaveBeenCalledTimes(1);
      expect(evidence.characterSupport.supportState).toBe("supported");
      expect(evidence.characterSupport.surfaceResolution.mode).toBe("resolved");
      expect(evidence.characterSupport.surfaceResolution).toMatchObject({
        traversalSurfaceId: heightfield.traversalSurfaceId,
      });
      expectNoExpectedPathSurfaceState(evidence);
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  it("classifies coplanar bound platforms as ambiguous", async () => {
    const fixture = compileFixture();
    const runtime = await createRuntime(withCoplanarBoundPlatformsAtStart(fixture));
    try {
      const port = createBabylonTraversalRuntimePortV1({
        runtime,
        traversalLockReceipt: fixture.traversalLockReceipt,
      });
      const supportSpy = spyPlayerCheckSupport(runtime);
      const evidence = port.resetToStartAnchor({
        startAnchorEntityId: "spawn-main",
      });

      expect(supportSpy).toHaveBeenCalledTimes(1);
      expect(evidence.characterSupport.supportState).toBe("supported");
      expect(evidence.characterSupport.surfaceResolution.mode).toBe("ambiguous");
      expectNoExpectedPathSurfaceState(evidence);
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  it("resolves the stacked upper bound platform and ignores the lower layer", async () => {
    const fixture = compileFixture();
    const plan = withStackedBoundPlatformsAtStart(fixture);
    const runtime = await createRuntime(plan);
    try {
      const port = createBabylonTraversalRuntimePortV1({
        runtime,
        traversalLockReceipt: fixture.traversalLockReceipt,
      });
      const supportSpy = spyPlayerCheckSupport(runtime);
      const evidence = port.resetToStartAnchor({
        startAnchorEntityId: "spawn-main",
      });
      const upper = plan.traversal.surfaces.find(
        (surface) => surface.surfaceEntityId === "stacked-upper",
      )!;

      expect(supportSpy).toHaveBeenCalledTimes(1);
      expect(evidence.characterSupport.surfaceResolution).toEqual({
        mode: "resolved",
        traversalSurfaceId: upper.traversalSurfaceId,
        surfaceEntityId: upper.surfaceEntityId,
        colliderSubshapeId: upper.colliderSubshapeId,
        resourceRef: upper.resourceRef,
        resolvedVersion: upper.resolvedVersion,
        resourceHash: upper.resourceHash,
      });
      expectNoExpectedPathSurfaceState(evidence);
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  it("rejects a downward bound ceiling and keeps heightfield resolved", async () => {
    const fixture = compileFixture();
    const runtime = await createRuntime(withBoundCeilingAboveStart(fixture));
    try {
      const port = createBabylonTraversalRuntimePortV1({
        runtime,
        traversalLockReceipt: fixture.traversalLockReceipt,
      });
      const supportSpy = spyPlayerCheckSupport(runtime);
      const evidence = port.resetToStartAnchor({
        startAnchorEntityId: "spawn-main",
      });
      const heightfield = fixture.executionPlan.traversal.surfaces[0]!;

      expect(supportSpy).toHaveBeenCalledTimes(1);
      expect(evidence.characterSupport.surfaceResolution).toMatchObject({
        mode: "resolved",
        traversalSurfaceId: heightfield.traversalSurfaceId,
      });
      expectNoExpectedPathSurfaceState(evidence);
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  it("rejects a bound vertical wall and keeps heightfield resolved", async () => {
    const fixture = compileFixture();
    const runtime = await createRuntime(withBoundVerticalWallAtStart(fixture));
    try {
      const port = createBabylonTraversalRuntimePortV1({
        runtime,
        traversalLockReceipt: fixture.traversalLockReceipt,
      });
      const supportSpy = spyPlayerCheckSupport(runtime);
      const evidence = port.resetToStartAnchor({
        startAnchorEntityId: "spawn-main",
      });
      const heightfield = fixture.executionPlan.traversal.surfaces[0]!;

      expect(supportSpy).toHaveBeenCalledTimes(1);
      expect(evidence.characterSupport.surfaceResolution).toMatchObject({
        mode: "resolved",
        traversalSurfaceId: heightfield.traversalSurfaceId,
      });
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  it("classifies sliding steep unbound support as unmatched with one support query", async () => {
    const fixture = compileFixture();
    const runtime = await createRuntime(withSteepRampAtStart(fixture));
    try {
      const port = createBabylonTraversalRuntimePortV1({
        runtime,
        traversalLockReceipt: fixture.traversalLockReceipt,
      });
      port.resetToStartAnchor({ startAnchorEntityId: "spawn-main" });
      const supportSpy = spyPlayerCheckSupport(runtime);
      let slidingEvidence: Awaited<ReturnType<typeof port.runFixedTick>> | undefined;
      for (let tick = 0; tick < 120; tick += 1) {
        supportSpy.mockClear();
        const evidence = await port.runFixedTick({
          walkDirectionWorldXZ: [0, 0],
        });
        expect(supportSpy).toHaveBeenCalledTimes(1);
        if (evidence.characterSupport.supportState === "sliding") {
          slidingEvidence = evidence;
          break;
        }
      }
      expect(slidingEvidence?.characterSupport.surfaceResolution).toEqual({
        mode: "unmatched",
      });
      expectNoExpectedPathSurfaceState(slidingEvidence!);
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  it("keeps bound-platform resolution across reset and rebind-back", async () => {
    const fixture = compileFixture(routeWorld(createValidPackageSubjectWorld()));
    const plan = withBoundStaticBoxAtStart(fixture, 1);
    const runtime = await createRuntime(plan);
    try {
      const port = createBabylonTraversalRuntimePortV1({
        runtime,
        traversalLockReceipt: fixture.traversalLockReceipt,
      });
      const bound = plan.traversal.surfaces.find(
        (surface) => surface.kind === "static-collider",
      )!;
      const firstSpy = spyPlayerCheckSupport(runtime);
      const first = port.resetToStartAnchor({
        startAnchorEntityId: "spawn-main",
      });
      expect(firstSpy).toHaveBeenCalledTimes(1);
      expect(first.characterSupport.surfaceResolution).toMatchObject({
        mode: "resolved",
        traversalSurfaceId: bound.traversalSurfaceId,
      });

      expect(runtime.bindControl({
        controllerId: TRUSTED_DEFAULT_CONTROLLER_ID,
        expectedControlledEntityId: "player",
        controlledEntityId: "pack-animal-a",
      }).status).toBe("committed");
      expectRuntimeCode(
        () => port.readLatestTickEvidence(),
        "TRAVERSAL_RUNTIME_NOT_CONTROLLED",
      );
      expect(runtime.bindControl({
        controllerId: TRUSTED_DEFAULT_CONTROLLER_ID,
        expectedControlledEntityId: "pack-animal-a",
        controlledEntityId: "player",
      }).status).toBe("committed");
      expectRuntimeCode(
        () => port.readLatestTickEvidence(),
        "TRAVERSAL_RUNTIME_EVIDENCE_UNAVAILABLE",
      );

      firstSpy.mockClear();
      const restored = port.resetToStartAnchor({
        startAnchorEntityId: "spawn-main",
      });
      expect(firstSpy).toHaveBeenCalledTimes(1);
      expect(restored.characterSupport.surfaceResolution).toMatchObject({
        mode: "resolved",
        traversalSurfaceId: bound.traversalSurfaceId,
      });
      expectNoExpectedPathSurfaceState(restored);
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  it("isolates bound-platform identity across two Runtime instances", async () => {
    const fixture = compileFixture();
    const firstPlan = withBoundStaticBoxAtStart(fixture, 1);
    const secondPlan = withBoundOrientedPlatformAtStart(fixture, {
      entityId: "second-platform",
      heightMeters: 1,
      sizeMetersXYZ: [2, 1, 2],
      rotationEulerRadiansXYZ: [0, 0, 0],
      scaleXYZ: [1, 1, 1],
    });
    const firstRuntime = await createRuntime(firstPlan);
    const secondRuntime = await createRuntime(secondPlan);
    try {
      const firstPort = createBabylonTraversalRuntimePortV1({
        runtime: firstRuntime,
        traversalLockReceipt: fixture.traversalLockReceipt,
      });
      const secondPort = createBabylonTraversalRuntimePortV1({
        runtime: secondRuntime,
        traversalLockReceipt: fixture.traversalLockReceipt,
      });
      const firstSpy = spyPlayerCheckSupport(firstRuntime);
      const secondSpy = spyPlayerCheckSupport(secondRuntime);
      const first = firstPort.resetToStartAnchor({
        startAnchorEntityId: "spawn-main",
      });
      const second = secondPort.resetToStartAnchor({
        startAnchorEntityId: "spawn-main",
      });
      const firstBound = firstPlan.traversal.surfaces.find(
        (surface) => surface.kind === "static-collider",
      )!;
      const secondBound = secondPlan.traversal.surfaces.find(
        (surface) => surface.kind === "static-collider",
      )!;

      expect(firstSpy).toHaveBeenCalledTimes(1);
      expect(secondSpy).toHaveBeenCalledTimes(1);
      expect(first.characterSupport.surfaceResolution).toMatchObject({
        traversalSurfaceId: firstBound.traversalSurfaceId,
      });
      expect(second.characterSupport.surfaceResolution).toMatchObject({
        traversalSurfaceId: secondBound.traversalSurfaceId,
      });
      expect(firstBound.traversalSurfaceId).not.toBe(secondBound.traversalSurfaceId);
    } finally {
      await firstRuntime.dispose();
      await secondRuntime.dispose();
    }
  }, 30_000);

  it.each([
    ["ordinary", undefined],
    ["100m", 100],
    ["1km", 1_000],
    ["10km", 10_000],
  ] as const)(
    "resolves a non-orthogonal non-uniform bound platform at %s cancellation",
    async (_label, cancellationMeters) => {
      const fixture = compileFixture();
      const rotationEulerRadiansXYZ = [0.31, 0.47, 0.19] as const;
      const scaleXYZ = [1.4, 0.8, 1.25] as const;
      const spawn = fixture.executionPlan.layout
        .placementsByEntityId["spawn-main"]!.transform.positionMetersXYZ;
      const cancelMeters = cancellationMeters ?? 0;
      const sizeMetersXYZ = [
        cancelMeters === 0 ? 2 : 2 * cancelMeters + 2,
        1,
        4,
      ] as const;
      const localOnTop: readonly [number, number, number] = [
        cancelMeters === 0 ? 0 : -cancelMeters,
        sizeMetersXYZ[1] / 2,
        0,
      ];
      const rotated = rotateScaleCanonical(
        localOnTop,
        rotationEulerRadiansXYZ,
        scaleXYZ,
      );
      const supportSizeMetersXYZ = cancelMeters > 1_000
        ? ([2, 1, 2] as const)
        : sizeMetersXYZ;
      const supportLocal: readonly [number, number, number] = [
        0,
        supportSizeMetersXYZ[1] / 2,
        0,
      ];
      const supportRotated = cancelMeters > 1_000
        ? rotateScaleCanonical(
            supportLocal,
            rotationEulerRadiansXYZ,
            scaleXYZ,
          )
        : rotated;
      const plan = withBoundOrientedPlatformAtStart(fixture, {
        entityId: `oriented-${_label}`,
        heightMeters: 1,
        sizeMetersXYZ: supportSizeMetersXYZ,
        rotationEulerRadiansXYZ,
        scaleXYZ,
        translationMetersXYZ: [
          spawn[0] - supportRotated[0],
          1 - supportRotated[1],
          spawn[2] - supportRotated[2],
        ],
      });
      const cancellationTransform = cancelMeters > 1_000
        ? {
            positionMetersXYZ: [
              spawn[0] - rotated[0],
              1 - rotated[1],
              spawn[2] - rotated[2],
            ] as const,
            rotationEulerRadiansXYZ,
            scaleXYZ,
          }
        : undefined;
      const runtime = await createRuntime(plan);
      try {
        const port = createBabylonTraversalRuntimePortV1({
          runtime,
          traversalLockReceipt: fixture.traversalLockReceipt,
        });
        const supportSpy = spyPlayerCheckSupport(runtime);
        const evidence = port.resetToStartAnchor({
          startAnchorEntityId: "spawn-main",
        });
        const bound = plan.traversal.surfaces.find(
          (surface) => surface.kind === "static-collider",
        )!;
        expect(supportSpy).toHaveBeenCalledTimes(1);
        expect(evidence.characterSupport.surfaceResolution).toMatchObject({
          mode: "resolved",
          traversalSurfaceId: bound.traversalSurfaceId,
        });

        const collider = plan.staticColliders[plan.staticColliders.length - 1]!;
        const meshTransform = cancellationTransform ?? collider.transform;
        const meshShape = cancellationTransform === undefined
          ? collider.shape
          : { kind: "box" as const, sizeMetersXYZ };
        const canonical = emitTransformedStaticColliderTriangleMeshV1(
          meshShape,
          meshTransform,
        );
        const linear = linearRowsCanonical(
          meshTransform.rotationEulerRadiansXYZ,
          meshTransform.scaleXYZ,
        );
        const localMesh = cancellationTransform === undefined
          ? (() => {
              const internal = runtime[BABYLON_TRAVERSAL_RUNTIME_INTERNAL]();
              const collisionMesh = internal.readStaticCollisionMeshes().find(
                (entry) => entry.collider.entityId === collider.entityId,
              )!;
              collisionMesh.mesh.computeWorldMatrix(true);
              return {
                worldMatrix: collisionMesh.mesh.getWorldMatrix(),
                local: collisionMesh.mesh.getVerticesData(VertexBuffer.PositionKind)!,
              };
            })()
          : {
              worldMatrix: undefined,
              local: emitStaticColliderTriangleMeshV1(meshShape).localPositionsMetersXYZ,
            };
        let maxWrongDelta = 0;
        const local = localMesh.local;
        for (let offset = 0; offset < local.length; offset += 3) {
          const localVertex = [
            local[offset]!,
            local[offset + 1]!,
            local[offset + 2]!,
          ] as const;
          const magnitudes = operationMagnitudeMeters(
            meshTransform.positionMetersXYZ,
            linear,
            localVertex,
          );
          if (localMesh.worldMatrix !== undefined) {
            const world = Vector3.TransformCoordinates(
              new Vector3(localVertex[0], localVertex[1], localVertex[2]),
              localMesh.worldMatrix,
            );
            expect(Math.abs(world.x - canonical.worldPositionsMetersXYZ[offset]!))
              .toBeLessThanOrEqual(privateFloat32ToleranceMeters(magnitudes[0]));
            expect(Math.abs(world.y - canonical.worldPositionsMetersXYZ[offset + 1]!))
              .toBeLessThanOrEqual(privateFloat32ToleranceMeters(magnitudes[1]));
            expect(Math.abs(world.z - canonical.worldPositionsMetersXYZ[offset + 2]!))
              .toBeLessThanOrEqual(privateFloat32ToleranceMeters(magnitudes[2]));
          }
          const wrong = rotateScaleWrongEulerXyz(
            localVertex,
            meshTransform.rotationEulerRadiansXYZ,
            meshTransform.scaleXYZ,
          );
          const wrongWorld = [
            wrong[0] + meshTransform.positionMetersXYZ[0],
            wrong[1] + meshTransform.positionMetersXYZ[1],
            wrong[2] + meshTransform.positionMetersXYZ[2],
          ] as const;
          maxWrongDelta = Math.max(
            maxWrongDelta,
            Math.abs(wrongWorld[0] - canonical.worldPositionsMetersXYZ[offset]!),
            Math.abs(wrongWorld[1] - canonical.worldPositionsMetersXYZ[offset + 1]!),
            Math.abs(wrongWorld[2] - canonical.worldPositionsMetersXYZ[offset + 2]!),
          );
        }
        expect(maxWrongDelta).toBeGreaterThan(
          privateFloat32ToleranceMeters(1),
        );
      } finally {
        await runtime.dispose();
      }
    },
    30_000,
  );

  it("fails closed after Runtime disposal", async () => {
    const fixture = compileFixture();
    const runtime = await createRuntime(fixture.executionPlan);
    const port = createBabylonTraversalRuntimePortV1({
      runtime,
      traversalLockReceipt: fixture.traversalLockReceipt,
    });
    port.resetToStartAnchor({ startAnchorEntityId: "spawn-main" });

    await runtime.dispose();

    expectRuntimeCode(
      () => port.readLatestTickEvidence(),
      "TRAVERSAL_RUNTIME_UNAVAILABLE",
    );
  }, 30_000);
});
