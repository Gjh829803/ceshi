import { blockWorldChunkCoordinateV2 } from "./chunking.js";
import { resolveBlockPresetV1 } from "./preset-registry.js";
import {
  blockBoundsMetersV2,
  blockPositionAlignsToLatticeV2,
  occupiedMicroCellKeysV2,
  positionFromQuantizedMeterKeyV2,
  quantizedMeterKeyV2,
} from "./shapes.js";
import {
  blockWorldSpaceTransitionDestinationAnchorEntityIdV2,
  BLOCK_WORLD_SPACE_TRANSITION_REACH_METERS_V2,
  isBlockWorldSpaceTransitionIdV2,
} from "./space-transitions.js";
import {
  resolveBlockCameraPackV1,
  resolveBlockMotionPackV1,
  BLOCK_CAMERA_TUNING_LIMITS_V1,
} from "./packs.js";
import type {
  BlockSubjectAssemblyDefinitionV1,
  BlockComposedSubjectDefinitionV2,
  BlockInstanceV2,
  BlockPositionMetersXYZV2,
  BlockPresetDefinitionV1,
  BlockRequiredGroundTraversalBandV2,
  BlockRequiredTargetV2,
  BlockShapeKindV2,
  BlockSubjectTraversalProfileV2,
  BlockWorldCheckReportV2,
  BlockWorldDiagnosticV2,
  BlockWorldSpaceTransitionV2,
  CheckBlockWorldInputV2,
} from "./types.js";

const ID = /^[a-z0-9][a-z0-9-]{2,79}$/;
const SUBJECT_DEFINITION_REF = /^worldkit:\/\/subject-definition\/[a-z0-9][a-z0-9.-]*@[1-9][0-9]*$/;
const SUBJECT_ASSET_REF = /^worldkit:\/\/subject-asset\/[a-z0-9][a-z0-9.-]*@[1-9][0-9]*$/;
const VERSIONED_WORLDKIT_REF = /^worldkit:\/\/[a-z0-9-]+\/[a-z0-9][a-z0-9.-]*@[1-9][0-9]*$/;
const SIXTEEN_BY_NINE = 16 / 9;
const EPSILON = 1e-8;
const SHAPES = new Set<BlockShapeKindV2>(["full", "half", "quarter", "small"]);
const SUBJECT_PACK_ID = /^[a-z0-9][a-z0-9.-]{2,95}$/;
const SUBJECT_SOCKET_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const PRESENTATION_KEYS = new Set([
  "locomotion.suspended", "locomotion.idle", "locomotion.walk", "locomotion.run",
  "locomotion.takeoff", "locomotion.rising", "locomotion.apex",
  "locomotion.falling", "locomotion.landing",
]);

interface SupportSurfaceV2 {
  readonly index: number;
  readonly block: BlockInstanceV2;
  readonly topMeters: number;
  readonly minimumXMeters: number;
  readonly maximumXMeters: number;
  readonly minimumZMeters: number;
  readonly maximumZMeters: number;
  readonly standPositionMetersXYZ: BlockPositionMetersXYZV2;
}

function close(left: number, right: number): boolean {
  return Math.abs(left - right) <= EPSILON;
}

function diagnostic(
  code: BlockWorldDiagnosticV2["code"],
  instancePath: string,
  message: string,
  details?: Readonly<Record<string, unknown>>,
): BlockWorldDiagnosticV2 {
  return Object.freeze({
    severity: "error",
    code,
    instancePath,
    message,
    ...(details === undefined ? {} : { details: Object.freeze({ ...details }) }),
  });
}

function validFiniteVector(value: unknown, positive = false): value is BlockPositionMetersXYZV2 {
  return Array.isArray(value) && value.length === 3 && value.every((entry) =>
    Number.isFinite(entry) && (!positive || entry > 0));
}

function validMeterLatticePosition(value: unknown): value is BlockPositionMetersXYZV2 {
  return validFiniteVector(value) && value.every((entry) =>
    close(entry * 4, Math.round(entry * 4)));
}

function validTraversalProfile(profile: BlockSubjectTraversalProfileV2): boolean {
  return Number.isFinite(profile.clearanceHeightMeters) && profile.clearanceHeightMeters > 0 &&
    Number.isFinite(profile.footprintRadiusMetersXZ) && profile.footprintRadiusMetersXZ >= 0 &&
    Number.isFinite(profile.maximumStepUpMeters) && profile.maximumStepUpMeters >= 0 &&
    Number.isFinite(profile.maximumStepDownMeters) && profile.maximumStepDownMeters >= 0 &&
    profile.maximumAutoSmoothHeightDeltaMeters === 1 &&
    profile.maximumAdjacentWalkableHeightDeltaMeters === 2 &&
    typeof profile.canStandOnCloud === "boolean";
}

function validComposedSubject(definition: BlockComposedSubjectDefinitionV2): boolean {
  if (!ID.test(definition.id) || definition.displayName.trim().length === 0 ||
      definition.description.trim().length === 0 ||
      !/^[a-z0-9][a-z0-9.-]{2,95}$/.test(definition.semanticClassId) ||
      definition.visualParts.length < 1 || definition.visualParts.length > 48) return false;
  const partIds = new Set<string>();
  for (const part of definition.visualParts) {
    if (!ID.test(part.id) || partIds.has(part.id) ||
        !validFiniteVector(part.positionMetersXYZ) ||
        (part.rotationEulerRadiansXYZ !== undefined &&
          !validFiniteVector(part.rotationEulerRadiansXYZ)) ||
        part.semanticTags.length === 0 ||
        part.semanticTags.some((tag) => !/^[a-z0-9][a-z0-9.-]{1,63}$/.test(tag))) return false;
    partIds.add(part.id);
    if (part.kind === "asset") {
      if (!SUBJECT_ASSET_REF.test(part.subjectAssetRef) ||
          !validFiniteVector(part.scaleXYZ, true)) return false;
      continue;
    }
    const shape = part.shape;
    if (shape.kind === "box") {
      if (!validFiniteVector(shape.sizeMetersXYZ, true)) return false;
    } else if (!Number.isFinite(shape.radiusMeters) || shape.radiusMeters <= 0 ||
        (shape.kind !== "sphere" &&
          (!Number.isFinite(shape.heightMeters) || shape.heightMeters <= 0))) return false;
  }
  return definition.visualBinding.kind === "static" || (
    VERSIONED_WORLDKIT_REF.test(definition.visualBinding.rigProfileRef) &&
    VERSIONED_WORLDKIT_REF.test(definition.visualBinding.animationSetRef) &&
    VERSIONED_WORLDKIT_REF.test(definition.visualBinding.colliderProfileRef)
  );
}

function validSubjectAssembly(
  definition: BlockSubjectAssemblyDefinitionV1,
  subjectMeshParts: CheckBlockWorldInputV2["subjectMeshParts"],
): boolean {
  if (!ID.test(definition.id) ||
      resolveBlockMotionPackV1(definition.motion.motionPackId) === undefined ||
      !["automatic", "fixed-locomotion", "fixed-action"].includes(definition.presentation.kind) ||
      (definition.presentation.kind === "fixed-action" &&
        !/^[a-zA-Z0-9][a-zA-Z0-9.-]{0,79}$/.test(definition.presentation.actionId)) ||
      (definition.presentation.kind === "fixed-locomotion" &&
        !PRESENTATION_KEYS.has(definition.presentation.presentationKey))) return false;
  const base = definition.baseSubject;
  if (base.kind === "subject-pack") {
    if (!SUBJECT_PACK_ID.test(base.subjectPackId)) return false;
  } else if (!SUBJECT_PACK_ID.test(base.semanticClassId) ||
      base.displayName.trim().length === 0 || base.description.trim().length === 0 ||
      base.subjectMeshBindingIds.length < 1) return false;
  const available = new Map((subjectMeshParts ?? []).map((part) => [part.id, part]));
  if ((subjectMeshParts ?? []).length > 48 ||
      available.size !== (subjectMeshParts ?? []).length) return false;
  const referenced = [
    ...(base.kind === "custom-mesh" ? base.subjectMeshBindingIds : []),
    ...definition.attachments.map(({ subjectMeshBindingId }) => subjectMeshBindingId),
  ];
  return referenced.length === new Set(referenced).size &&
    referenced.every((id) => ID.test(id) && available.has(id)) &&
    referenced.length === available.size;
}

function isPackCamera(
  camera: CheckBlockWorldInputV2["camera"],
): camera is Extract<CheckBlockWorldInputV2["camera"], { kind: "pack" }> {
  return "kind" in camera && camera.kind === "pack";
}

function cameraFovDegrees(camera: CheckBlockWorldInputV2["camera"]): number {
  if (!isPackCamera(camera)) return camera.fovDegrees;
  const pack = resolveBlockCameraPackV1(camera.cameraPackId);
  return camera.tuning?.fovDegrees ?? pack?.defaults.fovDegrees ?? 58;
}

function validPackCamera(camera: Extract<
  CheckBlockWorldInputV2["camera"],
  { kind: "pack" }
>): boolean {
  const pack = resolveBlockCameraPackV1(camera.cameraPackId);
  if (pack === undefined) return false;
  const target = camera.target;
  if (target.kind === "base-subject-socket" &&
      !SUBJECT_SOCKET_ID.test(target.socketId)) return false;
  if ((target.kind === "base-subject-bounds" || target.kind === "assembly-bounds") &&
      (!Number.isFinite(target.heightRatio) || target.heightRatio < 0 ||
        target.heightRatio > 1)) return false;
  if (target.kind === "subject-local-point" &&
      !validFiniteVector(target.positionMetersXYZ)) return false;
  const tuning = camera.tuning ?? {};
  const distance = tuning.distanceMeters ?? pack.defaults.distanceMeters;
  const pitch = tuning.pitchRadians ?? pack.defaults.pitchRadians;
  const fov = tuning.fovDegrees ?? pack.defaults.fovDegrees;
  const within = (value: number, bounds: { minimum: number; maximum: number }) =>
    Number.isFinite(value) && value >= bounds.minimum && value <= bounds.maximum;
  const distanceValid = pack.mode === "first-person"
    ? distance === 0
    : within(distance, BLOCK_CAMERA_TUNING_LIMITS_V1.distanceMeters);
  return distanceValid &&
    within(pitch, BLOCK_CAMERA_TUNING_LIMITS_V1.pitchRadians) &&
    within(fov, BLOCK_CAMERA_TUNING_LIMITS_V1.fovDegrees);
}

function primitiveHalfHeightMeters(
  part: Extract<BlockComposedSubjectDefinitionV2["visualParts"][number], { kind: "primitive" }>,
): number {
  const rotation = part.rotationEulerRadiansXYZ ?? [0, 0, 0];
  const upright = close(rotation[0], 0) && close(rotation[2], 0);
  const shape = part.shape;
  if (shape.kind === "sphere") return shape.radiusMeters;
  if (shape.kind === "box") {
    return upright ? shape.sizeMetersXYZ[1] / 2 : Math.hypot(...shape.sizeMetersXYZ) / 2;
  }
  return upright
    ? shape.heightMeters / 2
    : Math.hypot(shape.radiusMeters, shape.heightMeters / 2);
}

function composedHumanoidVisualHeightMeters(
  definition: BlockComposedSubjectDefinitionV2,
): number | undefined {
  if (definition.category !== "human" || definition.bodyTopology !== "biped") return undefined;
  const primitiveParts = definition.visualParts.filter((part) => part.kind === "primitive");
  if (primitiveParts.length !== definition.visualParts.length || primitiveParts.length === 0) {
    return undefined;
  }
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;
  for (const part of primitiveParts) {
    const halfHeight = primitiveHalfHeightMeters(part);
    minimum = Math.min(minimum, part.positionMetersXYZ[1] - halfHeight);
    maximum = Math.max(maximum, part.positionMetersXYZ[1] + halfHeight);
  }
  return maximum - minimum;
}

function isSupportPreset(
  preset: BlockPresetDefinitionV1,
  profile: BlockSubjectTraversalProfileV2,
): boolean {
  return preset.traversal.supportSurfaceMode === "ground" ||
    (preset.traversal.supportSurfaceMode === "cloud" && profile.canStandOnCloud);
}

function isSolidPreset(preset: BlockPresetDefinitionV1 | undefined): boolean {
  return preset?.physics.collisionMode === "solid";
}

function sortDiagnostics(
  diagnostics: readonly BlockWorldDiagnosticV2[],
): readonly BlockWorldDiagnosticV2[] {
  return Object.freeze([...diagnostics].sort((left, right) =>
    left.instancePath.localeCompare(right.instancePath) ||
    left.code.localeCompare(right.code) || left.message.localeCompare(right.message)));
}

function validTarget(
  target: BlockRequiredTargetV2,
  index: number,
  diagnostics: BlockWorldDiagnosticV2[],
): boolean {
  let valid = true;
  if (!ID.test(target.id)) {
    diagnostics.push(diagnostic(
      "BLOCK_TARGET_ID_INVALID",
      `/requiredTargets/${index}/id`,
      "Required target id must be a stable lowercase WorldKit ID.",
    ));
    valid = false;
  }
  if (target.navigationRole !== "middle" && target.navigationRole !== "remote") {
    diagnostics.push(diagnostic(
      "BLOCK_TARGET_NAVIGATION_ROLE_INVALID",
      `/requiredTargets/${index}/navigationRole`,
      "Required target navigationRole must be 'middle' or 'remote'.",
    ));
    valid = false;
  }
  if (!validMeterLatticePosition(target.standPositionMetersXYZ)) {
    diagnostics.push(diagnostic(
      "BLOCK_WORLD_TARGET_NOT_STANDABLE",
      `/requiredTargets/${index}/standPositionMetersXYZ`,
      "Required target stand position must contain three finite 0.25-meter values.",
    ));
    valid = false;
  }
  return valid;
}

function validGroundTraversalBand(
  band: BlockRequiredGroundTraversalBandV2,
  index: number,
  diagnostics: BlockWorldDiagnosticV2[],
): boolean {
  let valid = true;
  const centerline = Array.isArray(band.centerlineStandPositionsMetersXYZ)
    ? band.centerlineStandPositionsMetersXYZ
    : [];
  if (!ID.test(band.id)) {
    diagnostics.push(diagnostic(
      "BLOCK_GROUND_TRAVERSAL_BAND_INVALID",
      `/requiredGroundTraversalBands/${index}/id`,
      "Ground traversal band id must be a stable lowercase WorldKit ID.",
    ));
    valid = false;
  }
  if (centerline.length < 2 || centerline.length > 256 ||
      centerline.some((position) =>
        !validMeterLatticePosition(position))) {
    diagnostics.push(diagnostic(
      "BLOCK_GROUND_TRAVERSAL_BAND_INVALID",
      `/requiredGroundTraversalBands/${index}/centerlineStandPositionsMetersXYZ`,
      "Ground traversal band centerline requires 2-256 stand positions on the 0.25-meter lattice.",
    ));
    valid = false;
  }
  if (!Number.isFinite(band.halfWidthMeters) || band.halfWidthMeters <= 0 ||
      typeof band.isBidirectional !== "boolean") {
    diagnostics.push(diagnostic(
      "BLOCK_GROUND_TRAVERSAL_BAND_INVALID",
      `/requiredGroundTraversalBands/${index}`,
      "Ground traversal band requires a positive finite halfWidthMeters and explicit isBidirectional.",
    ));
    valid = false;
  }
  if (centerline.some((position, waypointIndex, positions) =>
    waypointIndex > 0 && quantizedMeterKeyV2(position) ===
      quantizedMeterKeyV2(positions[waypointIndex - 1]!))) {
    diagnostics.push(diagnostic(
      "BLOCK_GROUND_TRAVERSAL_BAND_INVALID",
      `/requiredGroundTraversalBands/${index}/centerlineStandPositionsMetersXYZ`,
      "Consecutive ground traversal band waypoints must identify distinct stand positions.",
    ));
    valid = false;
  }
  return valid;
}

function validSpaceTransition(
  transition: BlockWorldSpaceTransitionV2,
  index: number,
  diagnostics: BlockWorldDiagnosticV2[],
): boolean {
  let valid = true;
  if (!isBlockWorldSpaceTransitionIdV2(transition.id) ||
      (transition.kind !== "door" && transition.kind !== "portal") ||
      !ID.test(transition.triggerBlockId) ||
      !validMeterLatticePosition(transition.sourceStandPositionMetersXYZ) ||
      !validMeterLatticePosition(transition.destinationStandPositionMetersXYZ) ||
      !Number.isSafeInteger(transition.destinationYawQuarterTurnsY) ||
      transition.destinationYawQuarterTurnsY < 0 ||
      transition.destinationYawQuarterTurnsY > 3) {
    diagnostics.push(diagnostic(
      "BLOCK_WORLD_SPACE_TRANSITION_INVALID",
      `/spaceTransitions/${index}`,
      "Space transition requires a stable ID, door/portal kind, trigger block ID, source/destination 0.25-meter stand positions, and destination yaw from 0 through 3.",
    ));
    valid = false;
  }
  return valid;
}

function supportSurface(
  block: BlockInstanceV2,
  index: number,
): SupportSurfaceV2 {
  const bounds = blockBoundsMetersV2(block);
  const topMeters = bounds.maximumMetersXYZ[1];
  return Object.freeze({
    index,
    block,
    topMeters,
    minimumXMeters: bounds.minimumMetersXYZ[0],
    maximumXMeters: bounds.maximumMetersXYZ[0],
    minimumZMeters: bounds.minimumMetersXYZ[2],
    maximumZMeters: bounds.maximumMetersXYZ[2],
    standPositionMetersXYZ: Object.freeze([
      block.positionMetersXYZ[0],
      topMeters,
      block.positionMetersXYZ[2],
    ]) as BlockPositionMetersXYZV2,
  });
}

function coversPoint(
  surface: SupportSurfaceV2,
  xMeters: number,
  zMeters: number,
  topMeters: number,
): boolean {
  return close(surface.topMeters, topMeters) &&
    xMeters >= surface.minimumXMeters - EPSILON &&
    xMeters <= surface.maximumXMeters + EPSILON &&
    zMeters >= surface.minimumZMeters - EPSILON &&
    zMeters <= surface.maximumZMeters + EPSILON;
}

function supportTopCellKey(
  topMeters: number,
  microX: number,
  microZ: number,
): string {
  return `${Math.round(topMeters * 2)}:${microX}:${microZ}`;
}

function microCellsTouchingCoordinate(valueMeters: number): readonly number[] {
  const scaled = valueMeters * 2;
  const rounded = Math.round(scaled);
  return close(scaled, rounded)
    ? Object.freeze([rounded - 1, rounded])
    : Object.freeze([Math.floor(scaled)]);
}

function footprintSamples(
  position: BlockPositionMetersXYZV2,
  radiusMeters: number,
): readonly (readonly [number, number])[] {
  if (radiusMeters === 0) return Object.freeze([[position[0], position[2]]]);
  const offsets = [-radiusMeters, 0, radiusMeters];
  return Object.freeze(offsets.flatMap((xOffset) => offsets.map((zOffset) =>
    Object.freeze([position[0] + xOffset, position[2] + zOffset]) as
      readonly [number, number])));
}

function strictIntervalsOverlap(
  leftMinimum: number,
  leftMaximum: number,
  rightMinimum: number,
  rightMaximum: number,
): boolean {
  return Math.min(leftMaximum, rightMaximum) - Math.max(leftMinimum, rightMinimum) > EPSILON;
}

function surfacesShareHorizontalEdge(left: SupportSurfaceV2, right: SupportSurfaceV2): boolean {
  const touchesX = close(left.maximumXMeters, right.minimumXMeters) ||
    close(right.maximumXMeters, left.minimumXMeters);
  const touchesZ = close(left.maximumZMeters, right.minimumZMeters) ||
    close(right.maximumZMeters, left.minimumZMeters);
  return (touchesX && strictIntervalsOverlap(
    left.minimumZMeters,
    left.maximumZMeters,
    right.minimumZMeters,
    right.maximumZMeters,
  )) || (touchesZ && strictIntervalsOverlap(
    left.minimumXMeters,
    left.maximumXMeters,
    right.minimumXMeters,
    right.maximumXMeters,
  ));
}

function surfaceEdgeSegmentKeys(surface: SupportSurfaceV2): readonly string[] {
  const keys: string[] = [];
  const minimumX = Math.round(surface.minimumXMeters * 2);
  const maximumX = Math.round(surface.maximumXMeters * 2);
  const minimumZ = Math.round(surface.minimumZMeters * 2);
  const maximumZ = Math.round(surface.maximumZMeters * 2);
  for (let z = minimumZ; z < maximumZ; z += 1) {
    keys.push(`x:${minimumX}:${z}:min`, `x:${maximumX}:${z}:max`);
  }
  for (let x = minimumX; x < maximumX; x += 1) {
    keys.push(`z:${minimumZ}:${x}:min`, `z:${maximumZ}:${x}:max`);
  }
  return Object.freeze(keys);
}

function oppositeEdgeKey(key: string): string {
  return key.endsWith(":min") ? `${key.slice(0, -4)}:max` : `${key.slice(0, -4)}:min`;
}

function squaredDistanceFromPositionToSegmentXZ(
  position: BlockPositionMetersXYZV2,
  start: BlockPositionMetersXYZV2,
  end: BlockPositionMetersXYZV2,
): number {
  const segmentX = end[0] - start[0];
  const segmentZ = end[2] - start[2];
  const lengthSquared = segmentX ** 2 + segmentZ ** 2;
  if (lengthSquared <= EPSILON) {
    return (position[0] - start[0]) ** 2 + (position[2] - start[2]) ** 2;
  }
  const ratio = Math.max(0, Math.min(1,
    ((position[0] - start[0]) * segmentX +
      (position[2] - start[2]) * segmentZ) / lengthSquared));
  const closestX = start[0] + segmentX * ratio;
  const closestZ = start[2] + segmentZ * ratio;
  return (position[0] - closestX) ** 2 + (position[2] - closestZ) ** 2;
}

function isReachableInsideGroundTraversalSegment(
  startKey: string,
  destinationKey: string,
  start: BlockPositionMetersXYZV2,
  destination: BlockPositionMetersXYZV2,
  halfWidthMeters: number,
  neighbors: ReadonlyMap<string, readonly string[]>,
): boolean {
  if (startKey === destinationKey) return true;
  const maximumSquaredDistance = halfWidthMeters ** 2 + EPSILON;
  const admitted = (key: string): boolean => squaredDistanceFromPositionToSegmentXZ(
    positionFromQuantizedMeterKeyV2(key),
    start,
    destination,
  ) <= maximumSquaredDistance;
  const visited = new Set([startKey]);
  const queue = [startKey];
  for (let index = 0; index < queue.length; index += 1) {
    for (const candidate of neighbors.get(queue[index]!) ?? []) {
      if (visited.has(candidate) || !admitted(candidate)) continue;
      if (candidate === destinationKey) return true;
      visited.add(candidate);
      queue.push(candidate);
    }
  }
  return false;
}

function disconnectedComponentSummaries(
  standableKeys: Iterable<string>,
  reachableKeys: ReadonlySet<string>,
  neighbors: ReadonlyMap<string, readonly string[]>,
): readonly Readonly<{
  standPositionCount: number;
  minimumMetersXYZ: BlockPositionMetersXYZV2;
  maximumMetersXYZ: BlockPositionMetersXYZV2;
  sampleStandPositionMetersXYZ: BlockPositionMetersXYZV2;
}>[] {
  const disconnectedKeys = new Set(
    [...standableKeys].filter((key) => !reachableKeys.has(key)),
  );
  const summaries = [];
  while (disconnectedKeys.size > 0) {
    const first = disconnectedKeys.values().next().value!;
    const queue = [first];
    disconnectedKeys.delete(first);
    const positions: BlockPositionMetersXYZV2[] = [];
    for (let index = 0; index < queue.length; index += 1) {
      const key = queue[index]!;
      positions.push(positionFromQuantizedMeterKeyV2(key));
      for (const candidate of neighbors.get(key) ?? []) {
        if (!disconnectedKeys.delete(candidate)) continue;
        queue.push(candidate);
      }
    }
    const minimum = [Infinity, Infinity, Infinity];
    const maximum = [-Infinity, -Infinity, -Infinity];
    for (const position of positions) {
      for (let axis = 0; axis < 3; axis += 1) {
        minimum[axis] = Math.min(minimum[axis]!, position[axis]!);
        maximum[axis] = Math.max(maximum[axis]!, position[axis]!);
      }
    }
    summaries.push(Object.freeze({
      standPositionCount: positions.length,
      minimumMetersXYZ: Object.freeze(minimum) as BlockPositionMetersXYZV2,
      maximumMetersXYZ: Object.freeze(maximum) as BlockPositionMetersXYZV2,
      sampleStandPositionMetersXYZ: positions[0]!,
    }));
  }
  return Object.freeze(summaries.sort((left, right) =>
    right.standPositionCount - left.standPositionCount ||
    left.sampleStandPositionMetersXYZ.join(",").localeCompare(
      right.sampleStandPositionMetersXYZ.join(","),
    )));
}

function reachableMetrics(
  reachableKeys: ReadonlySet<string>,
  standableByKey: ReadonlyMap<string, SupportSurfaceV2>,
  spawn: BlockPositionMetersXYZV2,
  yawQuarterTurnsY: number,
  fovDegrees: number,
): Pick<
  BlockWorldCheckReportV2["metrics"],
  | "reachableStandPositionBoundsMeters"
  | "reachableHorizontalSpanMetersXZ"
  | "reachableChunkCount"
  | "maximumReachableDistanceMeters"
  | "offCameraReachablePositionCount"
  | "offCameraReachableChunkCount"
> {
  if (reachableKeys.size === 0) return {
    reachableStandPositionBoundsMeters: null,
    reachableHorizontalSpanMetersXZ: Object.freeze([0, 0]),
    reachableChunkCount: 0,
    maximumReachableDistanceMeters: 0,
    offCameraReachablePositionCount: 0,
    offCameraReachableChunkCount: 0,
  };
  const positions = [...reachableKeys].map(positionFromQuantizedMeterKeyV2);
  const minimum = [Infinity, Infinity, Infinity];
  const maximum = [-Infinity, -Infinity, -Infinity];
  let minimumSurfaceX = Number.POSITIVE_INFINITY;
  let maximumSurfaceX = Number.NEGATIVE_INFINITY;
  let minimumSurfaceZ = Number.POSITIVE_INFINITY;
  let maximumSurfaceZ = Number.NEGATIVE_INFINITY;
  for (const position of positions) {
    for (let axis = 0; axis < 3; axis += 1) {
      minimum[axis] = Math.min(minimum[axis]!, position[axis]!);
      maximum[axis] = Math.max(maximum[axis]!, position[axis]!);
    }
    const surface = standableByKey.get(quantizedMeterKeyV2(position));
    if (surface !== undefined) {
      minimumSurfaceX = Math.min(minimumSurfaceX, surface.minimumXMeters);
      maximumSurfaceX = Math.max(maximumSurfaceX, surface.maximumXMeters);
      minimumSurfaceZ = Math.min(minimumSurfaceZ, surface.minimumZMeters);
      maximumSurfaceZ = Math.max(maximumSurfaceZ, surface.maximumZMeters);
    }
  }
  const forward = ([[0, -1], [-1, 0], [0, 1], [1, 0]] as const)[yawQuarterTurnsY] ?? [0, -1];
  const halfFovTangent = Math.tan((fovDegrees * Math.PI / 180) / 2);
  const chunks = new Set<string>();
  const offCameraChunks = new Set<string>();
  let maximumDistance = 0;
  let offCameraCount = 0;
  for (const position of positions) {
    const chunk = blockWorldChunkCoordinateV2(position);
    const chunkKey = `${chunk.chunkX},${chunk.chunkZ}`;
    chunks.add(chunkKey);
    const deltaX = position[0] - spawn[0];
    const deltaZ = position[2] - spawn[2];
    const distance = Math.hypot(deltaX, deltaZ);
    maximumDistance = Math.max(maximumDistance, distance);
    if (distance === 0) continue;
    const forwardDistance = deltaX * forward[0] + deltaZ * forward[1];
    const lateralDistance = Math.abs(deltaX * forward[1] - deltaZ * forward[0]);
    if (forwardDistance <= 0 || lateralDistance > forwardDistance * halfFovTangent) {
      offCameraCount += 1;
      offCameraChunks.add(chunkKey);
    }
  }
  return {
    reachableStandPositionBoundsMeters: Object.freeze({
      minimumMetersXYZ: Object.freeze(minimum) as BlockPositionMetersXYZV2,
      maximumMetersXYZ: Object.freeze(maximum) as BlockPositionMetersXYZV2,
    }),
    reachableHorizontalSpanMetersXZ: Object.freeze([
      maximumSurfaceX - minimumSurfaceX,
      maximumSurfaceZ - minimumSurfaceZ,
    ]),
    reachableChunkCount: chunks.size,
    maximumReachableDistanceMeters: maximumDistance,
    offCameraReachablePositionCount: offCameraCount,
    offCameraReachableChunkCount: offCameraChunks.size,
  };
}

export function checkBlockWorldV2(input: CheckBlockWorldInputV2): BlockWorldCheckReportV2 {
  const diagnostics: BlockWorldDiagnosticV2[] = [...(input.sourceDiagnostics ?? [])];
  if (!ID.test(input.world.id) || !Number.isSafeInteger(input.world.seed) || input.world.seed < 0) {
    diagnostics.push(diagnostic(
      "BLOCK_WORLD_IDENTITY_INVALID",
      "/world",
      "Block World id must be stable and seed must be a non-negative safe integer.",
    ));
  }
  const subjectDefinitionValid = input.controlledSubject.kind === "registered"
    ? SUBJECT_DEFINITION_REF.test(input.controlledSubject.subjectDefinitionRef)
    : input.controlledSubject.kind === "composed"
      ? validComposedSubject(input.controlledSubject.definition)
      : validSubjectAssembly(
          input.controlledSubject.assembly,
          input.subjectMeshParts,
        );
  if (input.controlledSubject.kind === "assembly" && !subjectDefinitionValid) {
    diagnostics.push(diagnostic(
      "BLOCK_WORLD_SUBJECT_ASSEMBLY_INVALID",
      "/controlledSubject/assembly",
      "Subject Assembly requires one valid base, unique complete Mesh bindings, a Motion Pack, and a Presentation Policy.",
    ));
  }
  if (!ID.test(input.controlledSubject.entityId) ||
      input.controlledSubject.entityId === "spawn-main" ||
      input.controlledSubject.entityId === "runtime-foundation" ||
      !ID.test(input.controlledSubject.visualTargetId) || !subjectDefinitionValid ||
      !Number.isSafeInteger(input.controlledSubject.yawQuarterTurnsY) ||
      input.controlledSubject.yawQuarterTurnsY < 0 ||
      input.controlledSubject.yawQuarterTurnsY > 3) {
    diagnostics.push(diagnostic(
      "BLOCK_WORLD_SUBJECT_INVALID",
      "/controlledSubject",
      "Controlled Subject requires stable IDs, a valid Definition, and yawQuarterTurnsY from 0 through 3.",
    ));
  }
  if (input.controlledSubject.kind === "composed") {
    const definition = input.controlledSubject.definition;
    const height = composedHumanoidVisualHeightMeters(definition);
    if (height !== undefined && (height < 1.6 - EPSILON || height > 2.1 + EPSILON)) {
      diagnostics.push(diagnostic(
        "BLOCK_WORLD_SUBJECT_SCALE_INVALID",
        "/controlledSubject/definition/visualParts",
        `An ordinary composed humanoid must be 1.6-2.1 meters tall; received ${height.toFixed(3)}m.`,
        { visualHeightMeters: height, minimumMeters: 1.6, maximumMeters: 2.1 },
      ));
    }
    if (definition.category === "human" && definition.bodyTopology === "biped" &&
        definition.visualParts.some((part) => part.kind === "asset" &&
          part.scaleXYZ.some((value) => value > 1.25 + EPSILON))) {
      diagnostics.push(diagnostic(
        "BLOCK_WORLD_SUBJECT_SCALE_INVALID",
        "/controlledSubject/definition/visualParts",
        "An ordinary composed humanoid Asset Part cannot be enlarged beyond 1.25x Registry scale.",
      ));
    }
  }
  const camera = input.camera;
  const cameraShapeValid = isPackCamera(camera)
    ? validPackCamera(camera)
    : Number.isFinite(camera.pitchRadians) && camera.pitchRadians >= -0.95 &&
      camera.pitchRadians <= 0.65 && Number.isFinite(camera.distanceMeters) &&
      camera.distanceMeters >= 1.8 && camera.distanceMeters <= 20 &&
      Number.isFinite(camera.targetHeightMeters) && camera.targetHeightMeters >= 0.5 &&
      camera.targetHeightMeters <= 8 && Number.isFinite(camera.fovDegrees) &&
      camera.fovDegrees >= 35 && camera.fovDegrees <= 90;
  if (!ID.test(camera.entityId) || camera.entityId === input.controlledSubject.entityId ||
      camera.entityId === "spawn-main" || camera.entityId === "runtime-foundation" ||
      !cameraShapeValid ||
      !Number.isFinite(camera.aspectRatio) || Math.abs(camera.aspectRatio - SIXTEEN_BY_NINE) > 1e-9) {
    diagnostics.push(diagnostic(
      "BLOCK_WORLD_CAMERA_INVALID",
      "/camera",
      "Camera must use a distinct stable ID, supported framing values, and exact 16:9.",
    ));
  }
  const profileValid = validTraversalProfile(input.subjectTraversalProfile);
  if (!profileValid) diagnostics.push(diagnostic(
    "BLOCK_TRAVERSAL_PROFILE_INVALID",
    "/subjectTraversalProfile",
    "Traversal distances must be finite meter values and smoothing limits must remain exactly 1m/2m.",
  ));
  if (!validMeterLatticePosition(input.spawnStandPositionMetersXYZ)) diagnostics.push(diagnostic(
    "BLOCK_WORLD_SPAWN_NOT_STANDABLE",
    "/spawnStandPositionMetersXYZ",
    "Spawn stand position must contain three finite 0.25-meter values.",
  ));

  const ids = new Map<string, number>();
  const occupiedByMicroCell = new Map<string, Readonly<{ block: BlockInstanceV2; index: number }>>();
  const presetsByBlockId = new Map<string, BlockPresetDefinitionV1>();
  const landmarkPresetRefsByGroupId = new Map<string, Set<string>>();
  const landmarkGroupIdsByPresetRef = new Map<string, Set<string>>();
  const visualGroupIds = new Set<string>();
  const reservedIds = new Set([
    "spawn-main", "runtime-foundation", input.controlledSubject.entityId, input.camera.entityId,
    ...(input.spaceTransitions ?? []).flatMap((transition) =>
      isBlockWorldSpaceTransitionIdV2(transition.id)
        ? [blockWorldSpaceTransitionDestinationAnchorEntityIdV2(transition.id)]
        : []),
  ]);
  const blockCountByShape: Record<BlockShapeKindV2, number> = {
    full: 0, half: 0, quarter: 0, small: 0,
  };

  input.manifest.blocks.forEach((block, index) => {
    const path = `/blocks/${index}`;
    if (!ID.test(block.id)) diagnostics.push(diagnostic(
      "BLOCK_INSTANCE_ID_INVALID", `${path}/id`, "Block id must be a stable lowercase WorldKit ID.",
    ));
    if (reservedIds.has(block.id) || ids.has(block.id)) diagnostics.push(diagnostic(
      "BLOCK_INSTANCE_ID_DUPLICATE", `${path}/id`, `Block id '${block.id}' is reserved or duplicated.`,
    ));
    else ids.set(block.id, index);
    if (!SHAPES.has(block.shape)) {
      diagnostics.push(diagnostic("BLOCK_SHAPE_INVALID", `${path}/shape`, "Unknown Block World V2 shape."));
      return;
    }
    blockCountByShape[block.shape] += 1;
    if (!validMeterLatticePosition(block.positionMetersXYZ) ||
        !blockPositionAlignsToLatticeV2(block)) {
      diagnostics.push(diagnostic(
        "BLOCK_POSITION_INVALID",
        `${path}/positionMetersXYZ`,
        "Block center must use the 0.25m lattice and every face must align to the 0.5m micro-grid.",
      ));
      return;
    }
    if (!Number.isSafeInteger(block.rotationQuarterTurnsY) ||
        block.rotationQuarterTurnsY < 0 || block.rotationQuarterTurnsY > 3) {
      diagnostics.push(diagnostic(
        "BLOCK_ROTATION_INVALID", `${path}/rotationQuarterTurnsY`,
        "rotationQuarterTurnsY must be an integer from 0 through 3.",
      ));
      return;
    }
    for (const key of occupiedMicroCellKeysV2(block)) {
      const previous = occupiedByMicroCell.get(key);
      if (previous !== undefined) diagnostics.push(diagnostic(
        "BLOCK_OCCUPANCY_OVERLAP",
        `${path}/positionMetersXYZ`,
        `Block '${block.id}' overlaps '${previous.block.id}' in micro-cell ${key}.`,
        { microCellXYZ: key.split(",").map(Number), conflictingBlockId: previous.block.id },
      ));
      else occupiedByMicroCell.set(key, { block, index });
    }
    const preset = resolveBlockPresetV1(block.presetRef);
    if (preset === undefined) {
      diagnostics.push(diagnostic(
        "BLOCK_PRESET_UNKNOWN", `${path}/presetRef`, `Unknown block preset '${block.presetRef}'.`,
      ));
      return;
    }
    presetsByBlockId.set(block.id, preset);
    if (block.visualGroupId !== undefined && ID.test(block.visualGroupId)) {
      visualGroupIds.add(block.visualGroupId);
    }
    if (preset.family !== "landmark") return;
    if (block.visualGroupId === undefined || !ID.test(block.visualGroupId)) {
      diagnostics.push(diagnostic(
        "LANDMARK_BLOCK_VISUAL_GROUP_REQUIRED", `${path}/visualGroupId`,
        "Every landmark-colored block requires one stable visualGroupId.",
      ));
      return;
    }
    const refs = landmarkPresetRefsByGroupId.get(block.visualGroupId) ?? new Set<string>();
    refs.add(preset.resourceRef);
    landmarkPresetRefsByGroupId.set(block.visualGroupId, refs);
    const groups = landmarkGroupIdsByPresetRef.get(preset.resourceRef) ?? new Set<string>();
    groups.add(block.visualGroupId);
    landmarkGroupIdsByPresetRef.set(preset.resourceRef, groups);
  });

  for (const [groupId, refs] of landmarkPresetRefsByGroupId) if (refs.size > 1) diagnostics.push(
    diagnostic("LANDMARK_GROUP_MIXED_COLORS", `/visualGroups/${groupId}`,
      `Visual group '${groupId}' uses multiple landmark colors.`, { presetRefs: [...refs].sort() }),
  );
  for (const [presetRef, groups] of landmarkGroupIdsByPresetRef) if (groups.size > 1) diagnostics.push(
    diagnostic("LANDMARK_COLOR_REUSED", `/landmarkColors/${encodeURIComponent(presetRef)}`,
      `Landmark color '${presetRef}' is reused by unrelated groups.`, { visualGroupIds: [...groups].sort() }),
  );

  const facingIds = new Set<string>();
  (input.visualTargetFacings ?? []).forEach((facing, index) => {
    const facingPath = `/visualTargetFacings/${index}`;
    const valid = ID.test(facing.visualTargetId) &&
      facing.visualTargetId !== input.controlledSubject.visualTargetId &&
      Number.isSafeInteger(facing.frontYawQuarterTurnsY) &&
      facing.frontYawQuarterTurnsY >= 0 && facing.frontYawQuarterTurnsY <= 3 &&
      !facingIds.has(facing.visualTargetId);
    if (!valid) {
      diagnostics.push(diagnostic(
        "BLOCK_VISUAL_TARGET_FACING_INVALID",
        facingPath,
        "Each non-subject visual target requires one unique frontYawQuarterTurnsY from 0 through 3.",
      ));
      return;
    }
    facingIds.add(facing.visualTargetId);
    if (!visualGroupIds.has(facing.visualTargetId)) {
      diagnostics.push(diagnostic(
        "BLOCK_VISUAL_TARGET_FACING_UNDECLARED",
        `${facingPath}/visualTargetId`,
        `Facing '${facing.visualTargetId}' does not name a Block visualGroupId.`,
      ));
    }
  });
  for (const visualGroupId of [...visualGroupIds].sort()) {
    if (visualGroupId === input.controlledSubject.visualTargetId || facingIds.has(visualGroupId)) {
      continue;
    }
    diagnostics.push(diagnostic(
      "BLOCK_VISUAL_TARGET_FACING_MISSING",
      "/visualTargetFacings",
      `Visual group '${visualGroupId}' must declare its semantic front direction exactly once.`,
    ));
  }

  const targetIds = new Map<string, number>();
  const targetPositionIndicesByKey = new Map<string, number>();
  const validTargets: Array<Readonly<{ index: number; target: BlockRequiredTargetV2 }>> = [];
  input.requiredTargets.forEach((target, index) => {
    if (!validTarget(target, index, diagnostics)) return;
    const previous = targetIds.get(target.id);
    if (previous !== undefined) diagnostics.push(diagnostic(
      "BLOCK_TARGET_ID_DUPLICATE", `/requiredTargets/${index}/id`,
      `Required target '${target.id}' duplicates /requiredTargets/${previous}/id.`,
    ));
    else {
      targetIds.set(target.id, index);
      const positionKey = quantizedMeterKeyV2(target.standPositionMetersXYZ);
      const previousPosition = targetPositionIndicesByKey.get(positionKey);
      if (previousPosition !== undefined) {
        diagnostics.push(diagnostic(
          "BLOCK_TARGET_POSITION_DUPLICATE",
          `/requiredTargets/${index}/standPositionMetersXYZ`,
          `Required target '${target.id}' duplicates the stand position of /requiredTargets/${previousPosition}.`,
        ));
      } else if (validMeterLatticePosition(input.spawnStandPositionMetersXYZ) &&
          positionKey === quantizedMeterKeyV2(input.spawnStandPositionMetersXYZ)) {
        diagnostics.push(diagnostic(
          "BLOCK_TARGET_POSITION_DUPLICATE",
          `/requiredTargets/${index}/standPositionMetersXYZ`,
          `Required target '${target.id}' must identify progress beyond the spawn stand position.`,
        ));
      } else {
        targetPositionIndicesByKey.set(positionKey, index);
        validTargets.push({ index, target });
      }
    }
  });

  const groundTraversalBandIds = new Map<string, number>();
  const validGroundTraversalBands: Array<Readonly<{
    index: number;
    band: BlockRequiredGroundTraversalBandV2;
  }>> = [];
  (input.requiredGroundTraversalBands ?? []).forEach((band, index) => {
    if (!validGroundTraversalBand(band, index, diagnostics)) return;
    const previous = groundTraversalBandIds.get(band.id);
    if (previous !== undefined) {
      diagnostics.push(diagnostic(
        "BLOCK_GROUND_TRAVERSAL_BAND_ID_DUPLICATE",
        `/requiredGroundTraversalBands/${index}/id`,
        `Ground traversal band '${band.id}' duplicates /requiredGroundTraversalBands/${previous}/id.`,
      ));
      return;
    }
    groundTraversalBandIds.set(band.id, index);
    validGroundTraversalBands.push(Object.freeze({ index, band }));
  });

  const transitionIds = new Map<string, number>();
  const transitionTriggerBlockIds = new Map<string, number>();
  const validTransitions: Array<Readonly<{
    index: number;
    transition: BlockWorldSpaceTransitionV2;
  }>> = [];
  (input.spaceTransitions ?? []).forEach((transition, index) => {
    if (!validSpaceTransition(transition, index, diagnostics)) return;
    const previousId = transitionIds.get(transition.id);
    if (previousId !== undefined) {
      diagnostics.push(diagnostic(
        "BLOCK_WORLD_SPACE_TRANSITION_ID_DUPLICATE",
        `/spaceTransitions/${index}/id`,
        `Space transition '${transition.id}' duplicates /spaceTransitions/${previousId}/id.`,
      ));
      return;
    }
    const previousTrigger = transitionTriggerBlockIds.get(transition.triggerBlockId);
    if (previousTrigger !== undefined) {
      diagnostics.push(diagnostic(
        "BLOCK_WORLD_SPACE_TRANSITION_TRIGGER_INVALID",
        `/spaceTransitions/${index}/triggerBlockId`,
        `Trigger block '${transition.triggerBlockId}' is already used by /spaceTransitions/${previousTrigger}.`,
      ));
      return;
    }
    transitionIds.set(transition.id, index);
    transitionTriggerBlockIds.set(transition.triggerBlockId, index);
    const triggerIndex = ids.get(transition.triggerBlockId);
    const triggerBlock = triggerIndex === undefined
      ? undefined
      : input.manifest.blocks[triggerIndex];
    const triggerPreset = triggerBlock === undefined
      ? undefined
      : presetsByBlockId.get(triggerBlock.id);
    if (triggerBlock === undefined ||
        triggerPreset?.resourceRef !== "worldkit://block-preset/interactive-trigger@1" ||
        triggerBlock.interactionInstanceId !== transition.id) {
      diagnostics.push(diagnostic(
        "BLOCK_WORLD_SPACE_TRANSITION_TRIGGER_INVALID",
        `/spaceTransitions/${index}/triggerBlockId`,
        `Space transition '${transition.id}' requires one interactive-trigger block whose interactionInstanceId equals the transition ID.`,
        { triggerBlockId: transition.triggerBlockId },
      ));
      return;
    }
    const triggerBounds = blockBoundsMetersV2(triggerBlock);
    const distanceSquared = transition.sourceStandPositionMetersXYZ.reduce(
      (sum, value, axis) => {
        const minimum = triggerBounds.minimumMetersXYZ[axis]!;
        const maximum = triggerBounds.maximumMetersXYZ[axis]!;
        const outside = value < minimum
          ? minimum - value
          : value > maximum
            ? value - maximum
            : 0;
        return sum + outside ** 2;
      },
      0,
    );
    if (distanceSquared > BLOCK_WORLD_SPACE_TRANSITION_REACH_METERS_V2 ** 2 + EPSILON) {
      diagnostics.push(diagnostic(
        "BLOCK_WORLD_SPACE_TRANSITION_TRIGGER_INVALID",
        `/spaceTransitions/${index}/sourceStandPositionMetersXYZ`,
        `Space transition '${transition.id}' source stand position is outside interaction reach of trigger '${triggerBlock.id}'.`,
        {
          triggerBlockId: triggerBlock.id,
          maximumReachMeters: BLOCK_WORLD_SPACE_TRANSITION_REACH_METERS_V2,
        },
      ));
      return;
    }
    validTransitions.push(Object.freeze({ index, transition }));
  });

  const supportSurfaces = profileValid ? input.manifest.blocks.flatMap((block, index) => {
    const preset = presetsByBlockId.get(block.id);
    return preset !== undefined && isSupportPreset(preset, input.subjectTraversalProfile)
      ? [supportSurface(block, index)]
      : [];
  }) : [];
  const supportTopOwnersByCell = new Map<string, SupportSurfaceV2[]>();
  for (const surface of supportSurfaces) {
    for (let microZ = Math.round(surface.minimumZMeters * 2);
      microZ < Math.round(surface.maximumZMeters * 2);
      microZ += 1) {
      for (let microX = Math.round(surface.minimumXMeters * 2);
        microX < Math.round(surface.maximumXMeters * 2);
        microX += 1) {
        const key = supportTopCellKey(surface.topMeters, microX, microZ);
        const owners = supportTopOwnersByCell.get(key) ?? [];
        owners.push(surface);
        supportTopOwnersByCell.set(key, owners);
      }
    }
  }
  const supportCovers = (xMeters: number, zMeters: number, topMeters: number): boolean => {
    for (const microX of microCellsTouchingCoordinate(xMeters)) {
      for (const microZ of microCellsTouchingCoordinate(zMeters)) {
        if ((supportTopOwnersByCell.get(supportTopCellKey(topMeters, microX, microZ)) ?? [])
          .some((surface) => coversPoint(surface, xMeters, zMeters, topMeters))) return true;
      }
    }
    return false;
  };
  const standableByKey = new Map<string, SupportSurfaceV2>();
  if (profileValid) {
    for (const surface of supportSurfaces) {
      const position = surface.standPositionMetersXYZ;
      const supported = footprintSamples(position, input.subjectTraversalProfile.footprintRadiusMetersXZ)
        .every(([x, z]) => supportCovers(x, z, position[1]));
      if (!supported) continue;
      const radius = input.subjectTraversalProfile.footprintRadiusMetersXZ;
      const minimumMicroX = Math.floor((position[0] - radius + EPSILON) * 2);
      const maximumMicroX = Math.ceil((position[0] + radius - EPSILON) * 2) - 1;
      const minimumMicroY = Math.floor((position[1] + EPSILON) * 2);
      const maximumMicroY = Math.ceil(
        (position[1] + input.subjectTraversalProfile.clearanceHeightMeters - EPSILON) * 2,
      ) - 1;
      const minimumMicroZ = Math.floor((position[2] - radius + EPSILON) * 2);
      const maximumMicroZ = Math.ceil((position[2] + radius - EPSILON) * 2) - 1;
      let blocked = false;
      clearance: for (let y = minimumMicroY; y <= maximumMicroY; y += 1) {
        for (let z = minimumMicroZ; z <= maximumMicroZ; z += 1) {
          for (let x = minimumMicroX; x <= maximumMicroX; x += 1) {
            const occupied = occupiedByMicroCell.get(`${x},${y},${z}`);
            if (occupied !== undefined && isSolidPreset(
              presetsByBlockId.get(occupied.block.id),
            )) {
              blocked = true;
              break clearance;
            }
          }
        }
      }
      if (!blocked) standableByKey.set(quantizedMeterKeyV2(position), surface);
    }
  }
  if (standableByKey.size === 0) diagnostics.push(diagnostic(
    "BLOCK_WORLD_NO_STANDABLE_POSITIONS",
    "/manifest/blocks",
    "The world does not contain a standable position for this Subject footprint and clearance.",
  ));

  const spawnKey = validMeterLatticePosition(input.spawnStandPositionMetersXYZ)
    ? quantizedMeterKeyV2(input.spawnStandPositionMetersXYZ) : "";
  if (spawnKey.length > 0 && !standableByKey.has(spawnKey)) diagnostics.push(diagnostic(
    "BLOCK_WORLD_SPAWN_NOT_STANDABLE", "/spawnStandPositionMetersXYZ",
    `Spawn ${input.spawnStandPositionMetersXYZ.join(",")} is not a standable support center.`,
  ));
  for (const { index, target } of validTargets) if (!standableByKey.has(
    quantizedMeterKeyV2(target.standPositionMetersXYZ),
  )) diagnostics.push(diagnostic(
    "BLOCK_WORLD_TARGET_NOT_STANDABLE", `/requiredTargets/${index}/standPositionMetersXYZ`,
    `Required target '${target.id}' is not on a standable support center.`,
  ));
  for (const { index, band } of validGroundTraversalBands) {
    band.centerlineStandPositionsMetersXYZ.forEach((position, waypointIndex) => {
      if (standableByKey.has(quantizedMeterKeyV2(position))) return;
      diagnostics.push(diagnostic(
        "BLOCK_GROUND_TRAVERSAL_BAND_WAYPOINT_NOT_STANDABLE",
        `/requiredGroundTraversalBands/${index}/centerlineStandPositionsMetersXYZ/${waypointIndex}`,
        `Ground traversal band '${band.id}' waypoint ${waypointIndex} is not on a standable support center.`,
      ));
    });
  }

  const edgeOwners = new Map<string, number[]>();
  for (const surface of supportSurfaces) for (const key of surfaceEdgeSegmentKeys(surface)) {
    const owners = edgeOwners.get(key) ?? [];
    owners.push(surface.index);
    edgeOwners.set(key, owners);
  }
  const surfaceByIndex = new Map(supportSurfaces.map((surface) => [surface.index, surface]));
  const adjacentPairKeys = new Set<string>();
  for (const [key, leftOwners] of edgeOwners) {
    const opposite = edgeOwners.get(oppositeEdgeKey(key));
    if (opposite === undefined) continue;
    for (const left of leftOwners) for (const right of opposite) {
      if (left === right) continue;
      adjacentPairKeys.add(left < right ? `${left},${right}` : `${right},${left}`);
    }
  }
  const neighbors = new Map<string, string[]>();
  let smoothedWalkableEdgeCount = 0;
  for (const pairKey of [...adjacentPairKeys].sort()) {
    const [leftIndex, rightIndex] = pairKey.split(",").map(Number);
    const left = surfaceByIndex.get(leftIndex!);
    const right = surfaceByIndex.get(rightIndex!);
    if (left === undefined || right === undefined || !surfacesShareHorizontalEdge(left, right)) continue;
    const delta = right.topMeters - left.topMeters;
    const absoluteDelta = Math.abs(delta);
    if (absoluteDelta > input.subjectTraversalProfile.maximumAdjacentWalkableHeightDeltaMeters + EPSILON) {
      diagnostics.push(diagnostic(
        "BLOCK_ADJACENT_WALKABLE_HEIGHT_DELTA_EXCEEDED",
        `/blocks/${right.index}/positionMetersXYZ`,
        `Adjacent walkable blocks '${left.block.id}' and '${right.block.id}' differ by ${absoluteDelta}m; maximum is 2m.`,
        { leftBlockId: left.block.id, rightBlockId: right.block.id, heightDeltaMeters: absoluteDelta },
      ));
      continue;
    }
    if (absoluteDelta > input.subjectTraversalProfile.maximumAutoSmoothHeightDeltaMeters + EPSILON) continue;
    if (absoluteDelta > EPSILON) smoothedWalkableEdgeCount += 1;
    const leftKey = quantizedMeterKeyV2(left.standPositionMetersXYZ);
    const rightKey = quantizedMeterKeyV2(right.standPositionMetersXYZ);
    // Adjacent tops inside the automatic smoothing band compile to one shared
    // continuous surface. Capsule step height remains frozen for Runtime
    // physics, but it must not disconnect a seam the compiler removes.
    if (standableByKey.has(leftKey) && standableByKey.has(rightKey)) {
      const leftRows = neighbors.get(leftKey) ?? [];
      leftRows.push(rightKey);
      neighbors.set(leftKey, leftRows);
      const rightRows = neighbors.get(rightKey) ?? [];
      rightRows.push(leftKey);
      neighbors.set(rightKey, rightRows);
    }
  }

  for (const { index, transition } of validTransitions) {
    const sourceKey = quantizedMeterKeyV2(transition.sourceStandPositionMetersXYZ);
    const destinationKey = quantizedMeterKeyV2(
      transition.destinationStandPositionMetersXYZ,
    );
    if (!standableByKey.has(sourceKey)) {
      diagnostics.push(diagnostic(
        "BLOCK_WORLD_SPACE_TRANSITION_SOURCE_NOT_STANDABLE",
        `/spaceTransitions/${index}/sourceStandPositionMetersXYZ`,
        `Space transition '${transition.id}' source is not a standable support center.`,
      ));
      continue;
    }
    if (!standableByKey.has(destinationKey)) {
      diagnostics.push(diagnostic(
        "BLOCK_WORLD_SPACE_TRANSITION_DESTINATION_NOT_STANDABLE",
        `/spaceTransitions/${index}/destinationStandPositionMetersXYZ`,
        `Space transition '${transition.id}' destination is not a standable support center.`,
      ));
      continue;
    }
    const rows = neighbors.get(sourceKey) ?? [];
    rows.push(destinationKey);
    neighbors.set(sourceKey, rows);
  }

  let reachableRequiredGroundTraversalBandCount = 0;
  for (const { index, band } of validGroundTraversalBands) {
    const positions = band.centerlineStandPositionsMetersXYZ;
    const allWaypointsStandable = positions.every((position) =>
      standableByKey.has(quantizedMeterKeyV2(position)));
    let bandReachable = allWaypointsStandable;
    if (allWaypointsStandable) {
      for (let segmentIndex = 0; segmentIndex < positions.length - 1; segmentIndex += 1) {
        const start = positions[segmentIndex]!;
        const destination = positions[segmentIndex + 1]!;
        const startKey = quantizedMeterKeyV2(start);
        const destinationKey = quantizedMeterKeyV2(destination);
        const forwardReachable = isReachableInsideGroundTraversalSegment(
          startKey,
          destinationKey,
          start,
          destination,
          band.halfWidthMeters,
          neighbors,
        );
        const reverseReachable = !band.isBidirectional ||
          isReachableInsideGroundTraversalSegment(
            destinationKey,
            startKey,
            destination,
            start,
            band.halfWidthMeters,
            neighbors,
          );
        if (forwardReachable && reverseReachable) continue;
        bandReachable = false;
        diagnostics.push(diagnostic(
          "BLOCK_GROUND_TRAVERSAL_BAND_DISCONNECTED",
          `/requiredGroundTraversalBands/${index}/centerlineStandPositionsMetersXYZ/${segmentIndex + 1}`,
          `Ground traversal band '${band.id}' cannot traverse centerline segment ${segmentIndex} inside its declared width.`,
          {
            segmentIndex,
            startStandPositionMetersXYZ: start,
            destinationStandPositionMetersXYZ: destination,
            halfWidthMeters: band.halfWidthMeters,
            forwardReachable,
            reverseReachable,
          },
        ));
      }
    }
    if (bandReachable) reachableRequiredGroundTraversalBandCount += 1;
  }

  const reachableKeys = new Set<string>();
  if (standableByKey.has(spawnKey)) {
    const queue = [spawnKey];
    reachableKeys.add(spawnKey);
    for (let index = 0; index < queue.length; index += 1) {
      for (const candidate of neighbors.get(queue[index]!) ?? []) {
        if (reachableKeys.has(candidate)) continue;
        reachableKeys.add(candidate);
        queue.push(candidate);
      }
    }
  }
  let reachableRequiredTargetCount = 0;
  const requiredTargetCountByNavigationRole = { middle: 0, remote: 0 };
  const reachableRequiredTargetCountByNavigationRole = { middle: 0, remote: 0 };
  for (const { index, target } of validTargets) {
    requiredTargetCountByNavigationRole[target.navigationRole] += 1;
    const key = quantizedMeterKeyV2(target.standPositionMetersXYZ);
    if (reachableKeys.has(key)) {
      reachableRequiredTargetCount += 1;
      reachableRequiredTargetCountByNavigationRole[target.navigationRole] += 1;
    }
    else if (input.requireSingleReachableComponent && standableByKey.has(key)) diagnostics.push(diagnostic(
      "BLOCK_WORLD_TARGET_UNREACHABLE", `/requiredTargets/${index}/standPositionMetersXYZ`,
      `Required target '${target.id}' is standable but unreachable from spawn.`,
    ));
  }
  const disconnected = standableByKey.size - reachableKeys.size;
  if (input.requireSingleReachableComponent && disconnected > 0) {
    const componentSummaries = disconnectedComponentSummaries(
      standableByKey.keys(),
      reachableKeys,
      neighbors,
    );
    diagnostics.push(diagnostic(
      "BLOCK_WORLD_WALKABLE_COMPONENT_DISCONNECTED", "/manifest/blocks",
      `${disconnected} standable positions across ${componentSummaries.length} components are disconnected from spawn.`,
      {
        disconnectedStandablePositionCount: disconnected,
        disconnectedComponentCount: componentSummaries.length,
        disconnectedComponentSummaries: componentSummaries.slice(0, 16),
      },
    ));
  }

  const sortedDiagnostics = sortDiagnostics(diagnostics);
  const reachableSpaceTransitionCount = validTransitions.filter(({ transition }) =>
    reachableKeys.has(quantizedMeterKeyV2(transition.sourceStandPositionMetersXYZ)) &&
    reachableKeys.has(quantizedMeterKeyV2(transition.destinationStandPositionMetersXYZ)),
  ).length;
  return Object.freeze({
    kind: "worldkit-block-world-check-report",
    schemaVersion: 2,
    status: sortedDiagnostics.length === 0 ? "passed" : "failed",
    diagnostics: sortedDiagnostics,
    metrics: Object.freeze({
      blockCount: input.manifest.blocks.length,
      blockCountByShape: Object.freeze({ ...blockCountByShape }),
      standablePositionCount: standableByKey.size,
      reachablePositionCount: reachableKeys.size,
      disconnectedStandablePositionCount: disconnected,
      requiredTargetCount: validTargets.length,
      reachableRequiredTargetCount,
      requiredTargetCountByNavigationRole: Object.freeze({
        ...requiredTargetCountByNavigationRole,
      }),
      reachableRequiredTargetCountByNavigationRole: Object.freeze({
        ...reachableRequiredTargetCountByNavigationRole,
      }),
      requiredGroundTraversalBandCount: validGroundTraversalBands.length,
      reachableRequiredGroundTraversalBandCount,
      ...reachableMetrics(
        reachableKeys,
        standableByKey,
        input.spawnStandPositionMetersXYZ,
        input.controlledSubject.yawQuarterTurnsY,
        cameraFovDegrees(input.camera),
      ),
      smoothedWalkableEdgeCount,
      spaceTransitionCount: validTransitions.length,
      reachableSpaceTransitionCount,
    }),
  });
}
