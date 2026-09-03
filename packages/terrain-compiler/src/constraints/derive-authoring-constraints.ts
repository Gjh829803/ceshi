import type {
  AuthoringSpecV4,
  PlacementConstraintSpecV1,
  PrimitivePrototypeSpecV4,
  TransformSpecV4,
  Vec2,
} from "@whitebox-world/authoring";

import type {
  DerivedTerrainConstraints,
  TerrainConstraint,
  TerrainIntentDiagnostic,
} from "./terrain-constraint-types";

const CONSTRAINT_PRIORITY: Readonly<Record<TerrainConstraint["kind"], number>> = {
  "water-basin": 0,
  "flatten-region": 1,
  "flatten-footprint": 2,
  "route-slope": 3,
};

function blocking(
  diagnostics: TerrainIntentDiagnostic[],
  code: string,
  instancePath: string,
  message: string,
  details?: Readonly<Record<string, unknown>>,
): void {
  diagnostics.push({
    severity: "blocking",
    code,
    instancePath,
    message,
    ...(details === undefined ? {} : { details }),
  });
}

function placementTransform(
  placement: Extract<AuthoringSpecV4["nodes"][number], { kind: "anchor" | "object" }>["placement"],
): TransformSpecV4 | undefined {
  return placement.kind === "fixed" ? placement.transform : placement.initialTransform;
}

function exactPrototypeRef(prototype: PrimitivePrototypeSpecV4): string {
  return `package://prototype/${prototype.id}@${prototype.version}`;
}

function primitiveFootprintMetersXZ(
  prototype: PrimitivePrototypeSpecV4,
  transform: TransformSpecV4,
): Vec2 | undefined {
  const scaleX = Math.abs(transform.scaleXYZ?.[0] ?? 1);
  const scaleZ = Math.abs(transform.scaleXYZ?.[2] ?? 1);
  const primitive = prototype.primitive;
  switch (primitive) {
    case "sphere":
    case "cylinder":
    case "cone":
      return [prototype.radiusMeters * 2 * scaleX, prototype.radiusMeters * 2 * scaleZ];
    case "box": {
      const sizeX = prototype.sizeMetersXYZ[0] * scaleX;
      const sizeZ = prototype.sizeMetersXYZ[2] * scaleZ;
      const yawRadians = transform.rotationEulerRadiansXYZ?.[1] ?? 0;
      const cosine = Math.abs(Math.cos(yawRadians));
      const sine = Math.abs(Math.sin(yawRadians));
      return [cosine * sizeX + sine * sizeZ, sine * sizeX + cosine * sizeZ];
    }
    default: {
      const exhaustive: never = primitive;
      throw new Error(`AUTHORING_PRIMITIVE_FOOTPRINT_UNHANDLED: ${String(exhaustive)}`);
    }
  }
}

function sortConstraints(constraints: TerrainConstraint[]): TerrainConstraint[] {
  return constraints.sort((left, right) => {
    const priorityDelta = CONSTRAINT_PRIORITY[left.kind] - CONSTRAINT_PRIORITY[right.kind];
    return priorityDelta === 0 ? left.id.localeCompare(right.id) : priorityDelta;
  });
}

export function deriveTerrainConstraintsFromAuthoringV4(
  spec: AuthoringSpecV4,
): DerivedTerrainConstraints {
  const diagnostics: TerrainIntentDiagnostic[] = [];
  const constraints: TerrainConstraint[] = [];
  const terrainEntries = spec.nodes
    .map((node, index) => ({ node, index }))
    .filter(
      (entry): entry is {
        node: Extract<AuthoringSpecV4["nodes"][number], { kind: "terrain" }>;
        index: number;
      } => entry.node.kind === "terrain",
    );

  if (terrainEntries.length !== 1) {
    blocking(
      diagnostics,
      "TERRAIN_INTENT_TERRAIN_COUNT_AMBIGUOUS",
      "/nodes",
      `Terrain height intent compilation requires exactly one Terrain node; received ${terrainEntries.length}.`,
      { actualTerrainCount: terrainEntries.length },
    );
    return { terrainEntityId: "", constraints, diagnostics };
  }

  const { node: terrain, index: terrainIndex } = terrainEntries[0]!;
  const terrainEntityId = terrain.id;
  const baseHeightMeters = terrain.components.terrain.source.baseHeightMeters;
  if (baseHeightMeters === undefined || !Number.isFinite(baseHeightMeters)) {
    blocking(
      diagnostics,
      "TERRAIN_INTENT_BASE_HEIGHT_REQUIRED",
      `/nodes/${terrainIndex}/components/terrain/source/baseHeightMeters`,
      "Terrain height intent compilation requires an explicit finite baseHeightMeters datum.",
    );
  }

  spec.nodes.forEach((node, nodeIndex) => {
    if (node.kind !== "water" || node.components.water.terrainEntityId !== terrainEntityId) {
      return;
    }
    const water = node.components.water;
    if (water.waterLevelMeters === undefined || !Number.isFinite(water.waterLevelMeters)) {
      blocking(
        diagnostics,
        "TERRAIN_INTENT_WATER_LEVEL_REQUIRED",
        `/nodes/${nodeIndex}/components/water/waterLevelMeters`,
        `Water '${node.id}' requires an explicit finite waterLevelMeters for terrain compilation.`,
      );
      return;
    }
    constraints.push({
      id: node.id,
      kind: "water-basin",
      boundary: structuredClone(water.boundary),
      waterLevelMeters: water.waterLevelMeters,
      depthMeters: water.depthMeters,
      shoreWidthMeters: water.shoreWidthMeters ?? 0,
    });
  });

  const spawnNodeIndex = spec.nodes.findIndex((node) => node.id === spec.startup.spawnAnchorEntityId);
  const spawnNode = spec.nodes[spawnNodeIndex];
  if (spawnNode?.kind !== "anchor") {
    blocking(
      diagnostics,
      "TERRAIN_INTENT_SPAWN_REFERENCE_NOT_FOUND",
      "/startup/spawnAnchorEntityId",
      `Spawn Anchor '${spec.startup.spawnAnchorEntityId}' was not found.`,
    );
  } else {
    const spawnTransform = placementTransform(spawnNode.placement);
    if (spawnTransform === undefined || !Number.isFinite(spawnTransform.positionMetersXYZ[1])) {
      blocking(
        diagnostics,
        "TERRAIN_INTENT_SPAWN_PLACEMENT_REQUIRED",
        `/nodes/${spawnNodeIndex}/placement`,
        `Spawn Anchor '${spawnNode.id}' requires a fixed transform or solved initialTransform.`,
      );
    }
    const spawnRegionConstraints = spec.constraints.placements.filter(
      (
        constraint,
      ): constraint is Extract<PlacementConstraintSpecV1, { kind: "inside-region" }> =>
        constraint.requirement === "required" &&
        constraint.kind === "inside-region" &&
        constraint.entityId === spawnNode.id,
    );
    if (spawnRegionConstraints.length !== 1) {
      blocking(
        diagnostics,
        "TERRAIN_INTENT_SPAWN_REGION_AMBIGUOUS",
        "/constraints/placements",
        `Spawn Anchor '${spawnNode.id}' requires exactly one required inside-region constraint; received ${spawnRegionConstraints.length}.`,
      );
    } else if (spawnTransform !== undefined) {
      const spawnRegionConstraint = spawnRegionConstraints[0]!;
      const regionIndex = spec.spatial.regions.findIndex(
        (region) => region.id === spawnRegionConstraint.regionId,
      );
      const region = spec.spatial.regions[regionIndex];
      if (region === undefined) {
        blocking(
          diagnostics,
          "TERRAIN_INTENT_REGION_REFERENCE_NOT_FOUND",
          "/constraints/placements",
          `Spawn constraint '${spawnRegionConstraint.id}' references missing Region '${spawnRegionConstraint.regionId}'.`,
        );
      } else {
        constraints.push({
          id: spawnRegionConstraint.id,
          kind: "flatten-region",
          pointsMetersXZ: structuredClone(region.pointsMetersXZ),
          targetHeightMeters: spawnTransform.positionMetersXYZ[1],
          falloffWidthMeters: spawnRegionConstraint.boundaryClearanceMeters,
          role: "spawn",
        });
      }
    }
  }

  const prototypesByRef = new Map(
    spec.resources.prototypes.map((prototype) => [exactPrototypeRef(prototype), prototype]),
  );
  spec.nodes.forEach((node, nodeIndex) => {
    if (node.kind !== "object") return;
    const prototype = prototypesByRef.get(node.prototypeRef);
    if (prototype?.semantic?.classId.startsWith("landmark.") !== true) return;
    const supportConstraints = spec.constraints.placements.filter(
      (constraint) =>
        constraint.requirement === "required" &&
        constraint.kind === "supported-by" &&
        constraint.supportedEntityId === node.id &&
        constraint.supportingEntityId === terrainEntityId,
    );
    if (supportConstraints.length === 0) return;

    const transform = placementTransform(node.placement);
    if (transform === undefined) {
      blocking(
        diagnostics,
        "TERRAIN_INTENT_LANDMARK_PLACEMENT_REQUIRED",
        `/nodes/${nodeIndex}/placement`,
        `Landmark '${node.id}' requires a fixed transform or solved initialTransform.`,
      );
      return;
    }
    const sizeMetersXZ = primitiveFootprintMetersXZ(prototype, transform);
    if (sizeMetersXZ === undefined) return;
    for (const supportConstraint of supportConstraints) {
      constraints.push({
        id: supportConstraint.id,
        kind: "flatten-footprint",
        centerMetersXZ: [
          transform.positionMetersXYZ[0],
          transform.positionMetersXYZ[2],
        ],
        sizeMetersXZ,
        falloffWidthMeters: 0,
        role: "landmark-support",
      });
    }
  });

  spec.constraints.placements.forEach((constraint) => {
    if (
      constraint.requirement !== "required" ||
      constraint.kind !== "within-slope-limit" ||
      constraint.routeId === undefined ||
      constraint.terrainEntityId !== terrainEntityId
    ) {
      return;
    }
    const route = spec.spatial.routes.find((candidate) => candidate.id === constraint.routeId);
    if (route === undefined) {
      blocking(
        diagnostics,
        "TERRAIN_INTENT_ROUTE_REFERENCE_NOT_FOUND",
        "/constraints/placements",
        `Slope constraint '${constraint.id}' references missing Route '${constraint.routeId}'.`,
      );
      return;
    }
    constraints.push({
      id: constraint.id,
      kind: "route-slope",
      pointsMetersXZ: structuredClone(route.pointsMetersXZ),
      widthMeters: route.widthMeters,
      maximumSlopeDegrees: constraint.maximumSlopeDegrees,
    });
  });

  return {
    terrainEntityId,
    constraints: sortConstraints(constraints),
    diagnostics,
  };
}
