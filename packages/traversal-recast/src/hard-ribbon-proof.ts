import { isNil } from "lodash-es";

type Vec2 = readonly [number, number];

const STADIUM_HALF_CAP_CHORDS = 16;
const GEOMETRY_EPSILON = 1e-10;

export interface HardRibbonProofV1 {
  readonly kind: "hard-ribbon-proof";
  readonly schemaVersion: 1;
  readonly widthMeters: number;
  readonly stadiums: readonly (readonly Vec2[])[];
}

export interface CreateHardRibbonProofInputV1 {
  readonly pointsMetersXZ: readonly Vec2[];
  readonly widthMeters: number;
}

function fail(message: string): never {
  throw new Error(`HARD_RIBBON_PROOF_INVALID: ${message}`);
}

function deepFreeze<T>(value: T): T {
  if (isNil(value) || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

function normalizeZero(value: number): number {
  return Object.is(value, -0) || Math.abs(value) < Number.EPSILON ? 0 : value;
}

function requirePoint(point: Vec2, label: string): void {
  if (
    !Array.isArray(point) ||
    point.length !== 2 ||
    !Number.isFinite(point[0]) ||
    !Number.isFinite(point[1])
  ) {
    fail(`${label} must be a finite XZ tuple.`);
  }
}

function cross2(start: Vec2, end: Vec2, point: Vec2): number {
  return (end[0] - start[0]) * (point[1] - start[1]) -
    (end[1] - start[1]) * (point[0] - start[0]);
}

function stadiumPolygon(start: Vec2, end: Vec2, radius: number): Vec2[] {
  const theta = Math.atan2(end[1] - start[1], end[0] - start[0]);
  const leftAngle = theta + Math.PI / 2;
  const rightAngle = theta - Math.PI / 2;
  const result: Vec2[] = [
    [
      normalizeZero(start[0] + Math.cos(leftAngle) * radius),
      normalizeZero(start[1] + Math.sin(leftAngle) * radius),
    ],
    [
      normalizeZero(end[0] + Math.cos(leftAngle) * radius),
      normalizeZero(end[1] + Math.sin(leftAngle) * radius),
    ],
  ];
  for (let chord = 1; chord <= STADIUM_HALF_CAP_CHORDS; chord += 1) {
    const angle = leftAngle - chord * Math.PI / STADIUM_HALF_CAP_CHORDS;
    result.push([
      normalizeZero(end[0] + Math.cos(angle) * radius),
      normalizeZero(end[1] + Math.sin(angle) * radius),
    ]);
  }
  result.push([
    normalizeZero(start[0] + Math.cos(rightAngle) * radius),
    normalizeZero(start[1] + Math.sin(rightAngle) * radius),
  ]);
  for (let chord = 1; chord < STADIUM_HALF_CAP_CHORDS; chord += 1) {
    const angle = rightAngle - chord * Math.PI / STADIUM_HALF_CAP_CHORDS;
    result.push([
      normalizeZero(start[0] + Math.cos(angle) * radius),
      normalizeZero(start[1] + Math.sin(angle) * radius),
    ]);
  }

  let signedAreaTimesTwo = 0;
  for (let index = 0; index < result.length; index += 1) {
    const point = result[index]!;
    const next = result[(index + 1) % result.length]!;
    signedAreaTimesTwo += point[0] * next[1] - next[0] * point[1];
  }
  if (!(signedAreaTimesTwo < 0)) {
    fail("stadium winding must be clockwise in XZ.");
  }
  return result;
}

export function createHardRibbonProofV1(
  input: CreateHardRibbonProofInputV1,
): HardRibbonProofV1 {
  if (!Number.isFinite(input.widthMeters) || !(input.widthMeters > 0)) {
    fail("widthMeters must be positive and finite.");
  }
  for (let index = 0; index < input.pointsMetersXZ.length; index += 1) {
    requirePoint(input.pointsMetersXZ[index]!, `pointsMetersXZ[${index}]`);
  }
  const stadiums: Vec2[][] = [];
  for (let index = 0; index < input.pointsMetersXZ.length - 1; index += 1) {
    const start = input.pointsMetersXZ[index]!;
    const end = input.pointsMetersXZ[index + 1]!;
    if (start[0] === end[0] && start[1] === end[1]) continue;
    stadiums.push(stadiumPolygon(start, end, input.widthMeters / 2));
  }
  if (stadiums.length === 0) {
    fail("pointsMetersXZ must contain at least one non-degenerate segment.");
  }
  return deepFreeze({
    kind: "hard-ribbon-proof",
    schemaVersion: 1,
    widthMeters: input.widthMeters,
    stadiums,
  });
}

function clipSegmentToStadium(
  start: Vec2,
  end: Vec2,
  boundary: readonly Vec2[],
): readonly [number, number] | undefined {
  let minimumRatio = 0;
  let maximumRatio = 1;
  for (let index = 0; index < boundary.length; index += 1) {
    const edgeStart = boundary[index]!;
    const edgeEnd = boundary[(index + 1) % boundary.length]!;
    const startCross = cross2(edgeStart, edgeEnd, start);
    const endCross = cross2(edgeStart, edgeEnd, end);
    const deltaCross = endCross - startCross;
    if (Math.abs(deltaCross) <= GEOMETRY_EPSILON) {
      if (startCross > GEOMETRY_EPSILON) return undefined;
      continue;
    }
    const boundaryRatio = (GEOMETRY_EPSILON - startCross) / deltaCross;
    if (deltaCross > 0) {
      maximumRatio = Math.min(maximumRatio, boundaryRatio);
    } else {
      minimumRatio = Math.max(minimumRatio, boundaryRatio);
    }
    if (minimumRatio > maximumRatio + GEOMETRY_EPSILON) return undefined;
  }
  const clippedMinimum = Math.max(0, minimumRatio);
  const clippedMaximum = Math.min(1, maximumRatio);
  return clippedMinimum <= clippedMaximum + GEOMETRY_EPSILON
    ? [clippedMinimum, clippedMaximum]
    : undefined;
}

export function isSegmentInsideHardRibbonV1(
  proof: HardRibbonProofV1,
  startMetersXZ: Vec2,
  endMetersXZ: Vec2,
): boolean {
  requirePoint(startMetersXZ, "startMetersXZ");
  requirePoint(endMetersXZ, "endMetersXZ");
  const intervals = proof.stadiums
    .map((stadium) => clipSegmentToStadium(
      startMetersXZ,
      endMetersXZ,
      stadium,
    ))
    .filter((interval): interval is readonly [number, number] =>
      !isNil(interval))
    .sort((left, right) =>
      left[0] !== right[0] ? left[0] - right[0] : left[1] - right[1]);
  let coveredThrough = 0;
  for (const [minimumRatio, maximumRatio] of intervals) {
    if (minimumRatio > coveredThrough + GEOMETRY_EPSILON) return false;
    coveredThrough = Math.max(coveredThrough, maximumRatio);
    if (coveredThrough >= 1 - GEOMETRY_EPSILON) return true;
  }
  return false;
}

export function isPointInsideHardRibbonV1(
  proof: HardRibbonProofV1,
  pointMetersXZ: Vec2,
): boolean {
  return isSegmentInsideHardRibbonV1(proof, pointMetersXZ, pointMetersXZ);
}
