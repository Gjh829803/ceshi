import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  blockBoundsMetersV2,
  checkBlockWorldV2,
  resolveBlockPresetV1,
  type BlockInstanceV2,
  type BlockPositionMetersXYZV2,
  type BlockSubjectTraversalProfileV2,
} from "@whitebox-world/block-world";

import {
  blockWorldCheckInputV2,
  loadBlockWorldModuleV2,
} from "../lib/block-world-module.js";

interface Options {
  sceneId: string;
  worldModulePath: string;
  outputPath: string;
  reconnaissancePath: string | null;
  runtimeProbeFallback: boolean;
}

function parseOptions(argv: string[]): Options {
  const value = (name: string): string => {
    const index = argv.indexOf(name);
    if (index < 0 || !argv[index + 1]) throw new Error(`Missing ${name}.`);
    return argv[index + 1]!;
  };
  const sceneId = value("--scene-id");
  if (!/^[a-z0-9][a-z0-9-]{2,79}$/.test(sceneId)) {
    throw new Error("Invalid --scene-id.");
  }
  return {
    sceneId,
    worldModulePath: path.resolve(value("--world")),
    outputPath: path.resolve(value("--output")),
    reconnaissancePath: argv.includes("--reconnaissance")
      ? path.resolve(value("--reconnaissance"))
      : null,
    runtimeProbeFallback: argv.includes("--runtime-probe-fallback"),
  };
}

function distanceXZ(
  left: readonly [number, number, number],
  right: readonly [number, number, number],
): number {
  return Math.hypot(left[0] - right[0], left[2] - right[2]);
}

function samePosition(
  left: readonly [number, number, number],
  right: readonly [number, number, number],
): boolean {
  return left.every((value, axis) => value === right[axis]);
}

function centroid(
  positions: readonly (readonly [number, number, number])[],
): BlockPositionMetersXYZV2 {
  return Object.freeze([0, 1, 2].map((axis) =>
    positions.reduce((sum, position) => sum + position[axis]!, 0) /
      positions.length
  )) as BlockPositionMetersXYZV2;
}

function dedupePositions(
  positions: readonly BlockPositionMetersXYZV2[],
): readonly BlockPositionMetersXYZV2[] {
  const seen = new Set<string>();
  return Object.freeze(positions.filter((position) => {
    const key = position.join(",");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }));
}

function positionKey(position: readonly [number, number, number]): string {
  return position.map((value) => Math.round(value * 4)).join(",");
}

function horizontalCellKey(x: number, z: number): string {
  return `${Math.round(x * 4)},${Math.round(z * 4)}`;
}

function blockIsSolid(block: BlockInstanceV2): boolean {
  return resolveBlockPresetV1(block.presetRef)?.physics.collisionMode === "solid";
}

function blockIsSupport(
  block: BlockInstanceV2,
  traversal: BlockSubjectTraversalProfileV2,
): boolean {
  const support = resolveBlockPresetV1(block.presetRef)?.traversal.supportSurfaceMode;
  return support === "ground" || support === "cloud" && traversal.canStandOnCloud;
}

/**
 * Derive deterministic relocation anchors from the exact admitted block
 * manifest. These are not navigation paths: they are conservative, clear,
 * non-edge stand positions that the Episode Planner may use as independent
 * capture starts.
 */
export function deriveSafeStandPositionCatalog(
  blocks: readonly BlockInstanceV2[],
  traversal: BlockSubjectTraversalProfileV2,
  preferred: readonly BlockPositionMetersXYZV2[],
  maximum = 64,
): readonly BlockPositionMetersXYZV2[] {
  const radius = Math.max(0, traversal.footprintRadiusMetersXZ);
  const solidBounds = blocks.filter(blockIsSolid).map((block) => ({
    block,
    bounds: blockBoundsMetersV2(block),
  }));
  const solidBoundsByMeterCell = new Map<string, typeof solidBounds>();
  for (const solid of solidBounds) {
    const minimumX = Math.floor(solid.bounds.minimumMetersXYZ[0] - radius);
    const maximumX = Math.floor(solid.bounds.maximumMetersXYZ[0] + radius);
    const minimumZ = Math.floor(solid.bounds.minimumMetersXYZ[2] - radius);
    const maximumZ = Math.floor(solid.bounds.maximumMetersXYZ[2] + radius);
    for (let z = minimumZ; z <= maximumZ; z += 1) {
      for (let x = minimumX; x <= maximumX; x += 1) {
        const key = `${x},${z}`;
        const rows = solidBoundsByMeterCell.get(key) ?? [];
        rows.push(solid);
        solidBoundsByMeterCell.set(key, rows);
      }
    }
  }
  const supportByHorizontalCell = new Map<string, BlockPositionMetersXYZV2>();
  for (const block of blocks) {
    if (!blockIsSupport(block, traversal)) continue;
    const bounds = blockBoundsMetersV2(block);
    const stand = Object.freeze([
      block.positionMetersXYZ[0],
      bounds.maximumMetersXYZ[1],
      block.positionMetersXYZ[2],
    ]) as BlockPositionMetersXYZV2;
    const key = horizontalCellKey(stand[0], stand[2]);
    const prior = supportByHorizontalCell.get(key);
    if (prior === undefined || stand[1] > prior[1]) {
      supportByHorizontalCell.set(key, stand);
    }
  }

  const clearance = traversal.clearanceHeightMeters;
  const candidates = [...supportByHorizontalCell.values()].filter((stand) => {
    const nearbySolids = solidBoundsByMeterCell.get(
      `${Math.floor(stand[0])},${Math.floor(stand[2])}`,
    ) ?? [];
    const clear = nearbySolids.every(({ bounds }) => {
      const overlapsXZ =
        stand[0] + radius > bounds.minimumMetersXYZ[0] + 1e-8 &&
        stand[0] - radius < bounds.maximumMetersXYZ[0] - 1e-8 &&
        stand[2] + radius > bounds.minimumMetersXYZ[2] + 1e-8 &&
        stand[2] - radius < bounds.maximumMetersXYZ[2] - 1e-8;
      if (!overlapsXZ) return true;
      return stand[1] + clearance <= bounds.minimumMetersXYZ[1] + 1e-8 ||
        stand[1] >= bounds.maximumMetersXYZ[1] - 1e-8;
    });
    if (!clear) return false;

    // Keep independent capture starts away from exposed single-block edges.
    // One-meter cardinal support is conservative for the current <=1m blocks.
    return [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dz]) => {
      const neighbor = supportByHorizontalCell.get(horizontalCellKey(
        stand[0] + dx!,
        stand[2] + dz!,
      ));
      return neighbor !== undefined &&
        Math.abs(neighbor[1] - stand[1]) <= traversal.maximumStepUpMeters + 1e-8;
    });
  }).sort((left, right) =>
    left[0] - right[0] || left[2] - right[2] || left[1] - right[1]);

  const preferredUnique = dedupePositions(preferred).filter((position) =>
    candidates.some((candidate) => positionKey(candidate) === positionKey(position)));
  const selected = [...preferredUnique];
  const selectedKeys = new Set(selected.map(positionKey));
  while (selected.length < maximum) {
    let best: BlockPositionMetersXYZV2 | undefined;
    let bestDistance = -1;
    for (const candidate of candidates) {
      if (selectedKeys.has(positionKey(candidate))) continue;
      const spread = selected.length === 0
        ? 0
        : Math.min(...selected.map((position) => distanceXZ(position, candidate)));
      if (spread > bestDistance + 1e-8) {
        best = candidate;
        bestDistance = spread;
      }
    }
    if (best === undefined) break;
    selected.push(best);
    selectedKeys.add(positionKey(best));
  }
  return Object.freeze(selected);
}

function chooseCoreDestinationIds(
  destinations: readonly Record<string, unknown>[],
  spawn: BlockPositionMetersXYZV2,
  maximum = 4,
): readonly string[] {
  const remaining = [...destinations];
  const selected: Record<string, unknown>[] = [];
  while (remaining.length > 0 && selected.length < maximum) {
    remaining.sort((left, right) => {
      const leftPosition = left.positionMetersXYZ as BlockPositionMetersXYZV2;
      const rightPosition = right.positionMetersXYZ as BlockPositionMetersXYZV2;
      const selectedPositions = selected.length > 0
        ? selected.map((item) => item.positionMetersXYZ as BlockPositionMetersXYZV2)
        : [spawn];
      const leftSpread = Math.min(...selectedPositions.map((position) =>
        distanceXZ(leftPosition, position)));
      const rightSpread = Math.min(...selectedPositions.map((position) =>
        distanceXZ(rightPosition, position)));
      return rightSpread - leftSpread || String(left.id).localeCompare(String(right.id));
    });
    selected.push(remaining.shift()!);
  }
  return Object.freeze(selected.map(({ id }) => String(id)));
}

async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.tmp`,
  );
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, filePath);
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const loaded = await loadBlockWorldModuleV2(options.worldModulePath);
  const checkInput = blockWorldCheckInputV2(loaded);
  if (checkInput.world.id !== options.sceneId) {
    throw new Error("Navigation evidence scene identity does not match world.mjs.");
  }
  const check = checkBlockWorldV2(checkInput);
  if (check.status !== "passed") {
    throw new Error(`Navigation evidence requires a passing Block World: ${JSON.stringify(check.diagnostics)}`);
  }

  const spawn = checkInput.spawnStandPositionMetersXYZ;
  const worldModuleContentHash = `sha256:${createHash("sha256")
    .update(await readFile(options.worldModulePath))
    .digest("hex")}`;
  const reconnaissanceContentHash = options.reconnaissancePath === null
    ? null
    : `sha256:${createHash("sha256")
      .update(await readFile(options.reconnaissancePath))
      .digest("hex")}`;
  if (options.runtimeProbeFallback) {
    if (options.reconnaissancePath === null) {
      throw new Error("--runtime-probe-fallback requires --reconnaissance.");
    }
    const reconnaissanceBytes = await readFile(options.reconnaissancePath);
    const reconnaissance = JSON.parse(reconnaissanceBytes.toString("utf8")) as {
      sceneId?: string;
      controlledEntityId?: string;
      initial?: { subjects?: Record<string, { positionMetersXYZ?: BlockPositionMetersXYZV2 }> };
      probes?: Array<{
        id?: string;
        subjects?: Record<string, { positionMetersXYZ?: BlockPositionMetersXYZV2 }>;
        movementEvidence?: Record<string, { displacementMeters?: number; blockedOrStalled?: boolean }>;
      }>;
    };
    const entityId = reconnaissance.controlledEntityId;
    const start = entityId ? reconnaissance.initial?.subjects?.[entityId]?.positionMetersXYZ : undefined;
    const probe = entityId ? reconnaissance.probes?.find((candidate) => {
      const movement = candidate.movementEvidence?.[entityId];
      return candidate.subjects?.[entityId]?.positionMetersXYZ !== undefined &&
        movement?.blockedOrStalled === false &&
        Number(movement.displacementMeters) >= 1;
    }) : undefined;
    const end = entityId && probe ? probe.subjects?.[entityId]?.positionMetersXYZ : undefined;
    if (reconnaissance.sceneId !== options.sceneId || !entityId || !start || !end) {
      throw new Error("Runtime-probe fallback requires one matching non-stalled measured movement probe.");
    }
    const reachableSpan = check.metrics.reachableHorizontalSpanMetersXZ;
    const reachableSpanDiagonalMeters = Math.hypot(
      reachableSpan[0],
      reachableSpan[1],
    );
    const minimumMeasuredDistanceMeters = Math.min(
      20,
      Math.max(5, reachableSpanDiagonalMeters * 0.12),
    );
    const measuredDistanceMeters = distanceXZ(start, end);
    if (measuredDistanceMeters < minimumMeasuredDistanceMeters) {
      throw new Error(
        "Runtime-probe fallback is too short for Episode exploration: " +
        `${measuredDistanceMeters.toFixed(3)}m < ${minimumMeasuredDistanceMeters.toFixed(3)}m.`,
      );
    }
    const corridorPoints = Object.freeze([
      start,
      ...[0.25, 0.5, 0.75, 1].map((ratio) => Object.freeze([
        start[0] + (end[0] - start[0]) * ratio,
        start[1] + (end[1] - start[1]) * ratio,
        start[2] + (end[2] - start[2]) * ratio,
      ]) as BlockPositionMetersXYZV2),
    ]);
    const destinations = corridorPoints.slice(1).map((position, index) => ({
      id: `runtime-probe-${String(index + 1).padStart(2, "0")}`,
      kind: "runtime-probe-anchor",
      navigationRole: "measured-fallback",
      positionMetersXYZ: position,
      coverageTargetIds: [`runtime-probe-${String(index + 1).padStart(2, "0")}`],
      isCore: true,
    }));
    const coreDestinationIds = destinations.map(({ id }) => id);
    const fallbackSafeAnchors = deriveSafeStandPositionCatalog(
      loaded.extraction.manifest.blocks,
      checkInput.subjectTraversalProfile,
      corridorPoints,
    );
    if (fallbackSafeAnchors.length < 6) {
      throw new Error(
        `Runtime fallback requires at least six collision-clear stand positions; found ${fallbackSafeAnchors.length}.`,
      );
    }
    await writeJsonAtomic(options.outputPath, {
      kind: "worldkit-episode-navigation-evidence",
      schemaVersion: 1,
      sceneId: options.sceneId,
      source: {
        worldModule: path.basename(options.worldModulePath),
        worldModuleContentHash,
        blockWorldCheckStatus: check.status,
        reachablePositionCount: check.metrics.reachablePositionCount,
        reachableChunkCount: check.metrics.reachableChunkCount,
        reachableHorizontalSpanMetersXZ: check.metrics.reachableHorizontalSpanMetersXZ,
        reconnaissanceContentHash: `sha256:${createHash("sha256").update(reconnaissanceBytes).digest("hex")}`,
        runtimeProbeId: probe!.id ?? "measured-probe",
      },
      movementDomain: "runtime-measured-fallback-corridor",
      spawn: { id: "spawn", positionMetersXYZ: start },
      destinations,
      coreDestinationIds,
      corridors: [{
        id: "runtime-measured-fallback-course",
        kind: "runtime-measured-corridor",
        halfWidthMeters: 1,
        isBidirectional: true,
        centerlineStandPositionsMetersXYZ: corridorPoints,
      }],
      safeStandPositionCatalog: fallbackSafeAnchors,
      policy: {
        destinationDriven: true,
        requireFourSegments: true,
        avoidUnmeasuredOpenings: true,
        routeWaypointsMustUseSafeCatalog: true,
        runtimePreflightRequired: true,
        maximumAcceptedRecoveryCount: 0,
        fallbackReason: "authored-corridor-runtime-preflight-failed",
      },
    });
    process.stdout.write(
      `WORLDKIT_EPISODE_NAVIGATION_EVIDENCE_OK destinations=4 core=4 corridors=1 runtimeProbeFallback=true\n`,
    );
    return;
  }
  const authoredCorridors = checkInput.requiredGroundTraversalBands.map((band) => ({
    id: band.id,
    kind: "authored-ground-corridor",
    halfWidthMeters: band.halfWidthMeters,
    isBidirectional: band.isBidirectional,
    centerlineStandPositionsMetersXYZ: band.centerlineStandPositionsMetersXYZ,
  }));
  const fallbackCorridors = checkInput.requiredTargets.map((target, index) => ({
    id: `declared-target-corridor-${String(index).padStart(2, "0")}`,
    kind: "declared-target-direct-corridor",
    halfWidthMeters: 1,
    isBidirectional: true,
    centerlineStandPositionsMetersXYZ: Object.freeze([
      spawn,
      target.standPositionMetersXYZ,
    ]),
  }));
  if (fallbackCorridors.length === 0) {
    fallbackCorridors.push({
      id: "declared-spawn-corridor-00",
      kind: "declared-target-direct-corridor",
      halfWidthMeters: 1,
      isBidirectional: true,
      centerlineStandPositionsMetersXYZ: Object.freeze([spawn, spawn]),
    });
  }
  const corridors = authoredCorridors.length > 0 ? authoredCorridors : fallbackCorridors;
  // Episode destinations are stricter than Block World reachability targets: every
  // destination must also be usable as the exact origin of the following Segment.
  // Therefore only publish stand positions that belong to an admitted corridor.
  // A required target may be reachable in the broad Block World component while
  // still lacking the authored route evidence needed for deterministic playback.
  const declaredSafeAnchors = dedupePositions([
    spawn,
    ...corridors.flatMap((corridor) => corridor.centerlineStandPositionsMetersXYZ),
  ]);
  const safeAnchors = deriveSafeStandPositionCatalog(
    loaded.extraction.manifest.blocks,
    checkInput.subjectTraversalProfile,
    declaredSafeAnchors,
  );
  if (safeAnchors.length < 6) {
    throw new Error(
      `Episode exploration requires at least six collision-clear stand positions; found ${safeAnchors.length}.`,
    );
  }
  const safeAnchorKeys = new Set(safeAnchors.map((position) => position.join(",")));

  const destinations: Array<Record<string, unknown>> = checkInput.requiredTargets
    .filter((target) => safeAnchorKeys.has(target.standPositionMetersXYZ.join(",")))
    .map((target) => ({
      id: target.id,
      kind: "required-target",
      navigationRole: target.navigationRole,
      positionMetersXYZ: target.standPositionMetersXYZ,
      coverageTargetIds: [target.id],
      isCore: false,
    }));
  const landmarkPositionsByGroupId = new Map<string, BlockPositionMetersXYZV2[]>();
  for (const block of loaded.extraction.manifest.blocks) {
    if (block.visualGroupId === undefined ||
        block.visualGroupId === checkInput.controlledSubject.visualTargetId) continue;
    const rows = landmarkPositionsByGroupId.get(block.visualGroupId) ?? [];
    rows.push(block.positionMetersXYZ);
    landmarkPositionsByGroupId.set(block.visualGroupId, rows);
  }
  for (const [visualGroupId, positions] of [...landmarkPositionsByGroupId].sort()) {
    const center = centroid(positions);
    const viewpoint = [...safeAnchors].sort((left, right) =>
      distanceXZ(left, center) - distanceXZ(right, center) ||
      left.join(",").localeCompare(right.join(","))
    )[0];
    if (viewpoint === undefined) continue;
    const id = `viewpoint-${visualGroupId}`;
    const existing = destinations.find((destination) =>
      samePosition(
        destination.positionMetersXYZ as BlockPositionMetersXYZV2,
        viewpoint,
      ));
    if (existing !== undefined) {
      existing.coverageTargetIds = [...new Set([
        ...((existing.coverageTargetIds as string[]) ?? []),
        visualGroupId,
      ])];
      continue;
    }
    destinations.push({
      id,
      kind: "visual-target-viewpoint",
      visualTargetId: visualGroupId,
      positionMetersXYZ: viewpoint,
      landmarkCentroidMetersXYZ: center,
      approximateViewDistanceMeters: distanceXZ(viewpoint, center),
      coverageTargetIds: [visualGroupId],
      isCore: false,
    });
  }

  const existingPositionKeys = new Set(
    destinations.map((destination) =>
      (destination.positionMetersXYZ as BlockPositionMetersXYZV2).join(",")
    ),
  );
  const wanderAnchors = [...safeAnchors]
    .filter((position) => !samePosition(position, spawn) &&
      !existingPositionKeys.has(position.join(",")))
    .sort((left, right) =>
      distanceXZ(right, spawn) - distanceXZ(left, spawn) ||
      left.join(",").localeCompare(right.join(","))
    );
  for (const [index, position] of wanderAnchors.entries()) {
    if (destinations.length >= 8) break;
    destinations.push({
      id: `safe-wander-${String(index).padStart(2, "0")}`,
      kind: "safe-wander-anchor",
      positionMetersXYZ: position,
      coverageTargetIds: [],
      isCore: false,
    });
  }
  if (destinations.length === 0) {
    destinations.push({
      id: "safe-wander-spawn",
      kind: "safe-wander-anchor",
      positionMetersXYZ: spawn,
      coverageTargetIds: [],
      isCore: false,
    });
  }

  const meaningfulDestinations = destinations.filter((destination) =>
    Array.isArray(destination.coverageTargetIds) &&
    destination.coverageTargetIds.length > 0);
  const meaningfulCoreIds = chooseCoreDestinationIds(
    meaningfulDestinations,
    spawn,
  );
  const supplementalCoreIds = meaningfulCoreIds.length < 4
    ? chooseCoreDestinationIds(
        destinations.filter(({ id }) => !meaningfulCoreIds.includes(String(id))),
        spawn,
        4 - meaningfulCoreIds.length,
      )
    : [];
  const coreDestinationIds = Object.freeze([
    ...meaningfulCoreIds,
    ...supplementalCoreIds,
  ]);
  const coreDestinationIdSet = new Set(coreDestinationIds);
  const orderedDestinations = [
    ...destinations.filter(({ id }) => coreDestinationIdSet.has(String(id))),
    ...destinations.filter(({ id }) => !coreDestinationIdSet.has(String(id))),
  ].slice(0, 8).map((destination) => ({
    ...destination,
    isCore: coreDestinationIdSet.has(String(destination.id)),
  }));

  await writeJsonAtomic(options.outputPath, {
    kind: "worldkit-episode-navigation-evidence",
    schemaVersion: 1,
    sceneId: options.sceneId,
    source: {
      worldModule: path.basename(options.worldModulePath),
      worldModuleContentHash,
      ...(reconnaissanceContentHash === null
        ? {}
        : { reconnaissanceContentHash }),
      blockWorldCheckStatus: check.status,
      reachablePositionCount: check.metrics.reachablePositionCount,
      reachableChunkCount: check.metrics.reachableChunkCount,
      reachableHorizontalSpanMetersXZ: check.metrics.reachableHorizontalSpanMetersXZ,
    },
    movementDomain: authoredCorridors.length > 0
      ? "authored-ground-corridors"
      : "declared-targets",
    spawn: {
      id: "spawn",
      positionMetersXYZ: spawn,
    },
    destinations: orderedDestinations,
    coreDestinationIds,
    corridors,
    safeStandPositionCatalog: safeAnchors,
    policy: {
      destinationDriven: true,
      requireFourSegments: true,
      avoidUnmeasuredOpenings: true,
      routeWaypointsMustUseSafeCatalog: true,
      runtimePreflightRequired: true,
      maximumAcceptedRecoveryCount: 0,
    },
  });
  process.stdout.write(
    `WORLDKIT_EPISODE_NAVIGATION_EVIDENCE_OK destinations=${orderedDestinations.length} core=${coreDestinationIds.length} corridors=${corridors.length}\n`,
  );
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
