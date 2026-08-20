import {
  pointInPolygonXZ,
  quantizeFinite,
  sampleHeightfieldV1,
  sampleRoutePolylineV1,
  validatePolygonXZ,
} from "./geometry.js";
import type {
  LayoutAabbV1,
  LayoutCandidateGenerationInputV1,
  LayoutCandidateSourceV1,
  LayoutCandidateV1,
  LayoutSolverProfileV1,
  LayoutTransformV1,
  LayoutVec2V1,
  LayoutVec3V1,
} from "./types.js";

function normalizedTransform(
  transform: Partial<LayoutTransformV1> & Pick<LayoutTransformV1, "positionMetersXYZ">,
  profile: LayoutSolverProfileV1,
): LayoutTransformV1 {
  const rotation = transform.rotationEulerRadiansXYZ ?? [0, 0, 0];
  const scale = transform.scaleXYZ ?? [1, 1, 1];
  return {
    positionMetersXYZ: transform.positionMetersXYZ.map((value) =>
      quantizeFinite(value, profile.quantization.positionStepMeters)
    ) as unknown as LayoutVec3V1,
    rotationEulerRadiansXYZ: rotation.map((value) =>
      quantizeFinite(value, profile.quantization.rotationStepRadians)
    ) as unknown as LayoutVec3V1,
    scaleXYZ: scale.map((value) =>
      quantizeFinite(value, profile.quantization.ratioStep)
    ) as unknown as LayoutVec3V1,
  };
}

function boundsFor(
  transform: LayoutTransformV1,
  halfExtentsMetersXYZ: LayoutVec3V1,
  profile: LayoutSolverProfileV1,
): LayoutAabbV1 {
  const scaledHalfExtents = halfExtentsMetersXYZ.map((value, axis) =>
    value * transform.scaleXYZ[axis]!
  ) as [number, number, number];
  if (scaledHalfExtents.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error("LAYOUT_ENTITY_BOUNDS_INVALID");
  }
  const [x, y, z] = transform.rotationEulerRadiansXYZ;
  const cx = Math.cos(x);
  const sx = Math.sin(x);
  const cy = Math.cos(y);
  const sy = Math.sin(y);
  const cz = Math.cos(z);
  const sz = Math.sin(z);
  // Matches Babylon Quaternion.FromEulerAngles(x, y, z): yaw(Y) * pitch(X) * roll(Z).
  const rotation = [
    [cy * cz + sy * sx * sz, -cy * sz + sy * sx * cz, sy * cx],
    [cx * sz, cx * cz, -sx],
    [-sy * cz + cy * sx * sz, sy * sz + cy * sx * cz, cy * cx],
  ] as const;
  const rotatedHalfExtents = rotation.map((row) =>
    row.reduce(
      (sum, coefficient, axis) => sum + Math.abs(coefficient) * scaledHalfExtents[axis]!,
      0,
    )
  ) as [number, number, number];
  return {
    minimumMetersXYZ: transform.positionMetersXYZ.map((value, axis) =>
      quantizeFinite(
        value - rotatedHalfExtents[axis]!,
        profile.quantization.positionStepMeters,
      )
    ) as unknown as LayoutVec3V1,
    maximumMetersXYZ: transform.positionMetersXYZ.map((value, axis) =>
      quantizeFinite(
        value + rotatedHalfExtents[axis]!,
        profile.quantization.positionStepMeters,
      )
    ) as unknown as LayoutVec3V1,
  };
}

function sortedUnique(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function regionGridPoints(
  polygon: readonly LayoutVec2V1[],
  spacingMeters: number,
): readonly LayoutVec2V1[] {
  const xs = polygon.map((point) => point[0]);
  const zs = polygon.map((point) => point[1]);
  const minimumX = Math.min(...xs);
  const maximumX = Math.max(...xs);
  const minimumZ = Math.min(...zs);
  const maximumZ = Math.max(...zs);
  const result: LayoutVec2V1[] = [];
  for (let x = minimumX; x <= maximumX + 1e-9; x += spacingMeters) {
    for (let z = minimumZ; z <= maximumZ + 1e-9; z += spacingMeters) {
      const point: LayoutVec2V1 = [x, z];
      if (pointInPolygonXZ(point, polygon)) result.push(point);
    }
  }
  return result;
}

function yawDegrees(profile: LayoutSolverProfileV1): readonly number[] {
  const step = profile.candidateGeneration.yawStepDegrees;
  if (!Number.isFinite(step) || step <= 0 || step > 360) {
    throw new Error("LAYOUT_YAW_STEP_INVALID");
  }
  const values: number[] = [];
  for (let yaw = 0; yaw < 360 - 1e-9; yaw += step) values.push(yaw);
  return values;
}

export function generateLayoutCandidatesV1(
  input: LayoutCandidateGenerationInputV1,
  profile: LayoutSolverProfileV1,
): readonly LayoutCandidateV1[] {
  const candidateNumbers = [
    profile.candidateGeneration.gridSpacingMeters,
    profile.candidateGeneration.boundarySampleSpacingMeters,
    profile.candidateGeneration.routeSampleSpacingMeters,
    profile.candidateGeneration.yawStepDegrees,
  ];
  if (
    candidateNumbers.some((value) => !Number.isFinite(value) || value <= 0) ||
    profile.candidateGeneration.yawStepDegrees > 360 ||
    !Number.isInteger(profile.budgets.maximumCandidatesPerEntity) ||
    profile.budgets.maximumCandidatesPerEntity < 1
  ) {
    throw new Error("LAYOUT_CANDIDATE_PROFILE_INVALID");
  }
  const { entity } = input;
  const candidates: Array<Omit<LayoutCandidateV1, "id">> = [];
  const transformKeys = new Set<string>();

  const push = (
    source: LayoutCandidateSourceV1,
    transformInput: Partial<LayoutTransformV1> & Pick<LayoutTransformV1, "positionMetersXYZ">,
    isInitial = false,
  ): void => {
    const transform = normalizedTransform(transformInput, profile);
    const key = JSON.stringify(transform);
    if (transformKeys.has(key)) return;
    if (candidates.length >= profile.budgets.maximumCandidatesPerEntity) {
      throw new Error(
        `LAYOUT_CANDIDATE_BUDGET_EXCEEDED: '${entity.id}' exceeds ${profile.budgets.maximumCandidatesPerEntity} candidates.`,
      );
    }
    transformKeys.add(key);
    candidates.push({
      entityId: entity.id,
      isInitial,
      source,
      transform,
      bounds: boundsFor(transform, entity.halfExtentsMetersXYZ, profile),
      localCostRatio:
        source.kind === "fixed" || source.kind === "initial"
          ? 0
          : source.kind === "region-grid"
            ? 0.1
            : source.kind === "region-boundary"
              ? 0.2
              : source.kind === "route"
                ? 0.3
                : 0.4,
    });
  };

  if (entity.placement.kind === "fixed") {
    push({ kind: "fixed" }, entity.placement.transform, true);
  } else {
    if (entity.placement.initialTransform !== undefined) {
      push({ kind: "initial" }, entity.placement.initialTransform, true);
    }

    const regionsById = new Map(input.regions.map((region) => [region.id, region]));
    const routesById = new Map(input.routes.map((route) => [route.id, route]));
    const heightfield = entity.supportingTerrainEntityId === undefined
      ? undefined
      : input.geometry.heightfieldsByTerrainEntityId[entity.supportingTerrainEntityId];
    const yFor = (point: LayoutVec2V1): number => {
      const sample = heightfield === undefined ? undefined : sampleHeightfieldV1(heightfield, point);
      return (sample?.heightMeters ?? 0) + entity.halfExtentsMetersXYZ[1];
    };
    const addPointWithYaws = (
      point: LayoutVec2V1,
      sourceForYaw: (yawDegrees: number) => LayoutCandidateSourceV1,
    ): void => {
      for (const yaw of yawDegrees(profile)) {
        push(sourceForYaw(yaw), {
          positionMetersXYZ: [point[0], yFor(point), point[1]],
          rotationEulerRadiansXYZ: [0, yaw * Math.PI / 180, 0],
          scaleXYZ: [1, 1, 1],
        });
      }
    };

    for (const regionId of sortedUnique(entity.candidateRegionIds)) {
      const region = regionsById.get(regionId);
      if (region === undefined) throw new Error(`LAYOUT_REGION_NOT_FOUND: '${regionId}'.`);
      const invalid = validatePolygonXZ(region.pointsMetersXZ);
      if (invalid !== undefined) throw new Error(`${invalid}: '${regionId}'.`);
      regionGridPoints(
        region.pointsMetersXZ,
        profile.candidateGeneration.gridSpacingMeters,
      ).forEach((point, sampleIndex) =>
        addPointWithYaws(point, (yaw) => ({
          kind: "region-grid",
          regionId,
          sampleIndex,
          yawDegrees: yaw,
        })),
      );
    }

    for (const regionId of sortedUnique(entity.candidateRegionIds)) {
      const region = regionsById.get(regionId)!;
      const closed = [...region.pointsMetersXZ, region.pointsMetersXZ[0]!];
      sampleRoutePolylineV1(
        closed,
        profile.candidateGeneration.boundarySampleSpacingMeters,
      ).forEach((point, sampleIndex) =>
        addPointWithYaws(point, (yaw) => ({
          kind: "region-boundary",
          regionId,
          sampleIndex,
          yawDegrees: yaw,
        })),
      );
    }

    for (const routeId of sortedUnique(entity.candidateRouteIds)) {
      const route = routesById.get(routeId);
      if (route === undefined) throw new Error(`LAYOUT_ROUTE_NOT_FOUND: '${routeId}'.`);
      sampleRoutePolylineV1(
        route.pointsMetersXZ,
        profile.candidateGeneration.routeSampleSpacingMeters,
      ).forEach((point, sampleIndex) =>
        addPointWithYaws(point, (yaw) => ({
          kind: "route",
          routeId,
          sampleIndex,
          yawDegrees: yaw,
        })),
      );
    }

    for (const anchorEntityId of sortedUnique(entity.explicitAnchorEntityIds)) {
      const transform = input.anchorsByEntityId[anchorEntityId];
      if (transform === undefined) {
        throw new Error(`LAYOUT_ANCHOR_NOT_FOUND: '${anchorEntityId}'.`);
      }
      push({ kind: "anchor", anchorEntityId }, transform);
    }
  }

  return candidates.map((candidate, index) => ({
    ...candidate,
    id: `${entity.id}:${candidate.source.kind}:${String(index).padStart(6, "0")}`,
  }));
}
