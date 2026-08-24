import {
  resolveLayoutSolverProfileV1,
  type LayoutHeightfieldV1,
  type LayoutTransformV1,
  type ResolvedLayoutEntityV1,
  type ResolvedLayoutInputV1,
  type ResolvedPlacementConstraintV1,
  type ResolvedLayoutSolverProfileV1,
} from "@whitebox-world/layout-solver";

import { isNil } from "lodash-es";

import { sha256CanonicalJson } from "./canonical-json.js";
import { canonicalAuthoringLayoutIdentityV4 } from "./canonical-authoring-identity-v4.js";
import { normalizeAuthoringBaseV4 } from "./normalize.js";
import type {
  AuthoringDiagnostic,
  AuthoringResult,
  NormalizedProceduralTerrainSourceV2,
  NormalizedWorldBase,
  PrimitivePrototypeSpecV2,
  TransformSpecV2,
} from "./types.js";
import type {
  AuthoringSpecV4,
  NormalizeAuthoringOptionsV4,
  PlacementConstraintSpecV1 as PlacementConstraintSpecV4,
} from "./types-v4.js";
import { validateAuthoringSpecV4 } from "./validate-v4.js";

type LayoutAuthoringSpec = AuthoringSpecV4;
type LayoutPlacementConstraint = PlacementConstraintSpecV4;

export interface ResolveAuthoringLayoutV4Result
  extends AuthoringResult<ResolvedLayoutInputV1> {
  readonly resolvedSolverProfile?: ResolvedLayoutSolverProfileV1;
}

function diagnostic(
  code: string,
  instancePath: string,
  message: string,
  details?: Readonly<Record<string, unknown>>,
): AuthoringDiagnostic {
  return {
    severity: "error",
    code,
    instancePath,
    message,
    ...(details === undefined ? {} : { details }),
  };
}

function normalizeTransform(
  transform: TransformSpecV2,
): LayoutTransformV1 {
  return {
    positionMetersXYZ: [...transform.positionMetersXYZ],
    rotationEulerRadiansXYZ: [...(transform.rotationEulerRadiansXYZ ?? [0, 0, 0])],
    scaleXYZ: [...(transform.scaleXYZ ?? [1, 1, 1])],
  };
}

function lattice(seed: number, x: number, z: number): number {
  let value = seed ^ Math.imul(x, 0x1f123bb5) ^ Math.imul(z, 0x5f356495);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value ^= value >>> 16;
  return (value >>> 0) / 4_294_967_295;
}

function smootherStep(value: number): number {
  return value * value * value * (value * (value * 6 - 15) + 10);
}

function lerp(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

function valueNoise(seed: number, x: number, z: number): number {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const x1 = x0 + 1;
  const z1 = z0 + 1;
  const tx = smootherStep(x - x0);
  const tz = smootherStep(z - z0);
  const top = lerp(lattice(seed, x0, z0), lattice(seed, x1, z0), tx);
  const bottom = lerp(lattice(seed, x0, z1), lattice(seed, x1, z1), tx);
  return lerp(top, bottom, tz) * 2 - 1;
}

function fractalNoise(
  seed: number,
  x: number,
  z: number,
  source: NormalizedProceduralTerrainSourceV2,
): number {
  let amplitude = 1;
  let frequency = 1;
  let total = 0;
  let normalization = 0;
  for (let octave = 0; octave < source.octaves; octave += 1) {
    total += valueNoise(seed, x * frequency, z * frequency) * amplitude;
    normalization += amplitude;
    amplitude *= source.persistenceRatio;
    frequency *= source.lacunarityRatio;
  }
  return normalization === 0 ? 0 : total / normalization;
}

function terrainHeightfield(normalized: NormalizedWorldBase): LayoutHeightfieldV1 {
  const terrain = normalized.nodes.find((node) => node.kind === "terrain");
  if (terrain === undefined) throw new Error("AUTHORING_TERRAIN_REQUIRED");
  const { grid, source } = terrain.components.terrain;
  const [columns, rows] = grid.resolutionCellsXZ;
  const [centerX, centerZ] = grid.centerMetersXZ;
  const [sizeX, sizeZ] = grid.sizeMetersXZ;
  const minimumX = centerX - sizeX / 2;
  const minimumZ = centerZ - sizeZ / 2;
  const sampledHeights = grid.heightSamplesMeters;
  const heightSamplesMeters: number[] = [];
  if (!isNil(sampledHeights)) {
    if (sampledHeights.length !== columns * rows) {
      throw new Error("AUTHORING_TERRAIN_HEIGHT_SAMPLES_LENGTH_INVALID");
    }
    for (const heightMeters of sampledHeights) {
      heightSamplesMeters.push(heightMeters);
    }
  } else {
    for (let zIndex = 0; zIndex < rows; zIndex += 1) {
      const z = minimumZ + zIndex / (rows - 1) * sizeZ;
      for (let xIndex = 0; xIndex < columns; xIndex += 1) {
        const x = minimumX + xIndex / (columns - 1) * sizeX;
        const noise = source.amplitudeMeters === 0
          ? 0
          : fractalNoise(
              normalized.seed,
              x * source.frequencyPerMeter,
              z * source.frequencyPerMeter,
              source,
            );
        heightSamplesMeters.push(source.baseHeightMeters + noise * source.amplitudeMeters);
      }
    }
  }
  return {
    terrainEntityId: terrain.id,
    centerMetersXZ: [...grid.centerMetersXZ],
    sizeMetersXZ: [...grid.sizeMetersXZ],
    resolutionVerticesXZ: [...grid.resolutionCellsXZ],
    heightSamplesMeters,
  };
}

function halfExtents(prototype: PrimitivePrototypeSpecV2): readonly [number, number, number] {
  switch (prototype.primitive) {
    case "box":
      return prototype.sizeMetersXYZ.map((value) => value / 2) as [number, number, number];
    case "sphere":
      return [prototype.radiusMeters, prototype.radiusMeters, prototype.radiusMeters];
    case "cylinder":
    case "cone":
      return [prototype.radiusMeters, prototype.heightMeters / 2, prototype.radiusMeters];
  }
}

function constraintEntityIds(constraint: LayoutPlacementConstraint): readonly string[] {
  switch (constraint.kind) {
    case "inside-region":
    case "outside-region":
      return [constraint.entityId];
    case "distance-range":
      return [constraint.entityId, constraint.referenceEntityId];
    case "faces-entity":
      return [constraint.facingEntityId, constraint.targetEntityId];
    case "supported-by":
      return [constraint.supportedEntityId, constraint.supportingEntityId];
    case "minimum-clearance":
      return [constraint.entityId, ...(constraint.otherEntityIds ?? [])];
    case "within-slope-limit":
      return constraint.entityId === undefined ? [] : [constraint.entityId];
    case "visible-in-camera-region":
      return [constraint.visibleEntityId];
  }
}

function semanticReferenceDiagnostics(spec: LayoutAuthoringSpec): readonly AuthoringDiagnostic[] {
  const diagnostics: AuthoringDiagnostic[] = [];
  const nodeById = new Map(spec.nodes.map((node) => [node.id, node]));
  const regionIds = new Set(spec.spatial.regions.map((region) => region.id));
  const routeIds = new Set(spec.spatial.routes.map((route) => route.id));
  const screenRegionIds = new Set(spec.spatial.screenRegions.map((region) => region.id));
  const constraintById = new Map(spec.constraints.placements.map((constraint) => [constraint.id, constraint]));
  const requireNode = (id: string, path: string, kinds?: readonly string[]) => {
    const node = nodeById.get(id);
    if (node === undefined || (kinds !== undefined && !kinds.includes(node.kind))) {
      diagnostics.push(diagnostic("AUTHORING_REFERENCE_NOT_FOUND", path, `Referenced Entity '${id}' is unavailable.`, { entityId: id }));
    }
  };
  spec.nodes.forEach((node, nodeIndex) => {
    if ((node.kind === "object" || node.kind === "anchor") && node.placement.kind === "solved") {
      node.placement.placementConstraintIds.forEach((constraintId, constraintIndex) => {
        const constraint = constraintById.get(constraintId);
        const path = `/nodes/${nodeIndex}/placement/placementConstraintIds/${constraintIndex}`;
        if (constraint === undefined) {
          diagnostics.push(diagnostic("AUTHORING_REFERENCE_NOT_FOUND", path, `Placement Constraint '${constraintId}' does not exist.`, { constraintId }));
        } else if (!constraintEntityIds(constraint).includes(node.id)) {
          diagnostics.push(diagnostic("AUTHORING_PLACEMENT_CONSTRAINT_ENTITY_MISMATCH", path, `Placement Constraint '${constraintId}' does not constrain '${node.id}'.`, { constraintId, entityId: node.id }));
        }
      });
    }
    if (node.kind === "camera") {
      requireNode(node.components.cameraRig.target.targetEntityId, `/nodes/${nodeIndex}/components/cameraRig/target/targetEntityId`, ["subject"]);
    }
  });
  spec.constraints.placements.forEach((constraint, index) => {
    const base = `/constraints/placements/${index}`;
    switch (constraint.kind) {
      case "inside-region":
      case "outside-region":
        requireNode(constraint.entityId, `${base}/entityId`, ["object", "anchor"]);
        if (!regionIds.has(constraint.regionId)) diagnostics.push(diagnostic("AUTHORING_REFERENCE_NOT_FOUND", `${base}/regionId`, `Region '${constraint.regionId}' does not exist.`, { regionId: constraint.regionId }));
        break;
      case "distance-range":
        requireNode(constraint.entityId, `${base}/entityId`, ["object", "anchor"]);
        requireNode(constraint.referenceEntityId, `${base}/referenceEntityId`, ["object", "anchor"]);
        break;
      case "faces-entity":
        requireNode(constraint.facingEntityId, `${base}/facingEntityId`, ["object", "anchor"]);
        requireNode(constraint.targetEntityId, `${base}/targetEntityId`, ["object", "anchor"]);
        break;
      case "supported-by":
        requireNode(constraint.supportedEntityId, `${base}/supportedEntityId`, ["object", "anchor"]);
        requireNode(constraint.supportingEntityId, `${base}/supportingEntityId`, ["terrain", "object"]);
        break;
      case "minimum-clearance":
        requireNode(constraint.entityId, `${base}/entityId`, ["object", "anchor"]);
        constraint.otherEntityIds?.forEach((id, otherIndex) => requireNode(id, `${base}/otherEntityIds/${otherIndex}`, ["object", "anchor"]));
        break;
      case "within-slope-limit":
        requireNode(constraint.terrainEntityId, `${base}/terrainEntityId`, ["terrain"]);
        if (constraint.entityId !== undefined) requireNode(constraint.entityId, `${base}/entityId`, ["object", "anchor"]);
        if (constraint.routeId !== undefined && !routeIds.has(constraint.routeId)) diagnostics.push(diagnostic("AUTHORING_REFERENCE_NOT_FOUND", `${base}/routeId`, `Route '${constraint.routeId}' does not exist.`, { routeId: constraint.routeId }));
        break;
      case "visible-in-camera-region":
        requireNode(constraint.visibleEntityId, `${base}/visibleEntityId`, ["object", "anchor"]);
        requireNode(constraint.cameraEntityId, `${base}/cameraEntityId`, ["camera"]);
        if (!screenRegionIds.has(constraint.screenRegionId)) diagnostics.push(diagnostic("AUTHORING_REFERENCE_NOT_FOUND", `${base}/screenRegionId`, `Screen Region '${constraint.screenRegionId}' does not exist.`, { screenRegionId: constraint.screenRegionId }));
        break;
    }
  });
  return diagnostics;
}

export function resolveAuthoringLayoutV4(
  value: unknown,
  options: NormalizeAuthoringOptionsV4 = {},
): ResolveAuthoringLayoutV4Result {
  const schema = validateAuthoringSpecV4(value);
  if (!schema.ok || schema.value === undefined) {
    return { ok: false, diagnostics: schema.diagnostics };
  }
  const spec = schema.value;
  let resolvedSolverProfile: ResolvedLayoutSolverProfileV1;
  try {
    resolvedSolverProfile = resolveLayoutSolverProfileV1(
      spec.layout.solverProfileRef,
    );
  } catch {
    return {
      ok: false,
      diagnostics: [diagnostic(
        "AUTHORING_LAYOUT_PROFILE_NOT_FOUND",
        "/layout/solverProfileRef",
        `Layout Solver Profile '${spec.layout.solverProfileRef}' is unavailable.`,
        { solverProfileRef: spec.layout.solverProfileRef },
      )],
    };
  }
  const referenceDiagnostics = semanticReferenceDiagnostics(spec);
  if (referenceDiagnostics.length > 0) {
    return { ok: false, diagnostics: referenceDiagnostics, resolvedSolverProfile };
  }
  const normalizedBase = normalizeAuthoringBaseV4(spec, options);
  if (!normalizedBase.ok || normalizedBase.value === undefined) {
    return {
      ok: false,
      diagnostics: normalizedBase.diagnostics,
      resolvedSolverProfile,
    };
  }
  return resolveValidatedAuthoringLayout(
    spec,
    normalizedBase.value,
    resolvedSolverProfile,
    sha256CanonicalJson(
      canonicalAuthoringLayoutIdentityV4(spec, normalizedBase.value),
    ) as `sha256:${string}`,
  );
}

function resolveValidatedAuthoringLayout(
  spec: LayoutAuthoringSpec,
  normalized: NormalizedWorldBase,
  resolvedSolverProfile: ResolvedLayoutSolverProfileV1,
  authoringSpecHash: `sha256:${string}`,
): ResolveAuthoringLayoutV4Result {
  const prototypeByRef = new Map(normalized.resources.prototypes.map((prototype) => [
    `package://prototype/${prototype.id}@${prototype.version}`,
    prototype,
  ]));
  const entities: ResolvedLayoutEntityV1[] = spec.nodes
    .filter((node): node is Extract<typeof node, { kind: "object" | "anchor" }> => node.kind === "object" || node.kind === "anchor")
    .map((node) => {
      const insideRegionIds = spec.constraints.placements
        .flatMap((constraint) =>
          constraint.kind === "inside-region" && constraint.entityId === node.id
            ? [constraint.regionId]
            : []
        )
        .sort();
      const supportingTerrainEntityId = spec.constraints.placements.find((constraint) =>
        constraint.kind === "supported-by" &&
        constraint.supportedEntityId === node.id &&
        normalized.nodes.some((candidate) => candidate.kind === "terrain" && candidate.id === constraint.supportingEntityId)
      );
      const prototype = node.kind === "object" ? prototypeByRef.get(node.prototypeRef) : undefined;
      if (node.kind === "object" && prototype === undefined) throw new Error("AUTHORING_PROTOTYPE_INVARIANT");
      const semanticClassId = node.kind === "object"
        ? prototype!.semantic?.classId
        : node.semantic.classId;
      return {
        id: node.id,
        ...(semanticClassId === undefined ? {} : { semanticClassId }),
        halfExtentsMetersXYZ: node.kind === "object" ? halfExtents(prototype!) : [0, 0, 0],
        placement: node.placement.kind === "fixed"
          ? { kind: "fixed", transform: normalizeTransform(node.placement.transform) }
          : {
              kind: "solved",
              ...(node.placement.initialTransform === undefined ? {} : { initialTransform: normalizeTransform(node.placement.initialTransform) }),
              placementConstraintIds: [...node.placement.placementConstraintIds],
            },
        candidateRegionIds: insideRegionIds,
        candidateRouteIds: [],
        explicitAnchorEntityIds: [],
        ...(supportingTerrainEntityId?.kind !== "supported-by"
          ? {}
          : { supportingTerrainEntityId: supportingTerrainEntityId.supportingEntityId }),
      } satisfies ResolvedLayoutEntityV1;
    })
    .sort((left, right) => left.id.localeCompare(right.id));
  const terrain = terrainHeightfield(normalized);
  const subjectById = new Map(spec.nodes.filter((node) => node.kind === "subject").map((node) => [node.id, node]));
  const camerasByEntityId = Object.fromEntries(spec.nodes
    .filter((node) => node.kind === "camera")
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((node) => {
      const rig = node.components.cameraRig;
      const targetSubject = subjectById.get(rig.target.targetEntityId)!;
      const targetAnchorEntityId = targetSubject.spawnAnchorEntityId ?? spec.startup.spawnAnchorEntityId;
      return [node.id, {
        kind: "third-person" as const,
        cameraEntityId: node.id,
        targetAnchorEntityId,
        targetHeightMeters: rig.target.targetHeightMeters ?? rig.thirdPerson.targetHeightMeters,
        pitchRadians: rig.thirdPerson.pitchRadians,
        distanceMeters: rig.thirdPerson.distanceMeters,
        verticalFovDegrees: rig.thirdPerson.fovDegrees,
        aspectRatio: rig.thirdPerson.aspectRatio,
        nearClipMeters: 0.1,
        farClipMeters: 1_000,
      }];
    }));
  const [centerX, centerZ] = spec.world.bounds.centerMetersXZ;
  const [sizeX, sizeZ] = spec.world.bounds.sizeMetersXZ;
  const [minimumY, maximumY] = spec.world.bounds.heightRangeMeters;
  const valueResult: ResolvedLayoutInputV1 = {
    kind: "worldkit-resolved-layout-input",
    schemaVersion: 1,
    id: spec.id,
    authoringSpecHash,
    registryLockHash: normalized.resources.resourceLockHash as `sha256:${string}`,
    solverProfile: {
      solverProfileRef: resolvedSolverProfile.resourceRef,
      resolvedVersion: resolvedSolverProfile.resolvedVersion,
      contentHash: resolvedSolverProfile.contentHash,
    },
    seed: spec.seed,
    worldBounds: {
      minimumMetersXYZ: [centerX - sizeX / 2, minimumY, centerZ - sizeZ / 2],
      maximumMetersXYZ: [centerX + sizeX / 2, maximumY, centerZ + sizeZ / 2],
    },
    entities,
    regions: structuredClone(spec.spatial.regions),
    routes: structuredClone(spec.spatial.routes),
    screenRegions: structuredClone(spec.spatial.screenRegions),
    constraints: structuredClone(spec.constraints.placements) as readonly ResolvedPlacementConstraintV1[],
    anchorsByEntityId: {},
    geometry: {
      heightfieldsByTerrainEntityId: { [terrain.terrainEntityId]: terrain },
      staticBoundsByEntityId: {},
      camerasByEntityId,
    },
  };
  return { ok: true, value: valueResult, diagnostics: [], resolvedSolverProfile };
}
