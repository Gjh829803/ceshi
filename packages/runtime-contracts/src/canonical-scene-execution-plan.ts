import {
  canonicalJsonBytes,
  sha256CanonicalJson,
  stringifyCanonicalJson,
  type Sha256HashV1,
} from "@whitebox-world/protocol";
import { isNil, sortBy } from "lodash-es";

export type CanonicalSceneVec2V1 = readonly [x: number, z: number];
export type CanonicalSceneVec3V1 = readonly [x: number, y: number, z: number];

export interface CanonicalSceneTransformV1 {
  readonly positionMetersXYZ: CanonicalSceneVec3V1;
  readonly rotationEulerRadiansXYZ: CanonicalSceneVec3V1;
  readonly scaleXYZ: CanonicalSceneVec3V1;
}

export type CanonicalSceneWaterBoundaryV1 =
  | Readonly<{
      kind: "circle";
      centerMetersXZ: CanonicalSceneVec2V1;
      radiusMeters: number;
    }>
  | Readonly<{
      kind: "ellipse";
      centerMetersXZ: CanonicalSceneVec2V1;
      radiusMetersXZ: CanonicalSceneVec2V1;
    }>
  | Readonly<{
      kind: "polygon";
      pointsMetersXZ: readonly CanonicalSceneVec2V1[];
    }>;

export interface CanonicalSceneTerrainV1 {
  readonly entityId: string;
  readonly centerMetersXZ: CanonicalSceneVec2V1;
  readonly sizeMetersXZ: CanonicalSceneVec2V1;
  readonly resolutionCellsXZ: readonly [columns: number, rows: number];
  readonly heightSamplesMeters: readonly number[];
  readonly heightSamplesHash: Sha256HashV1;
  readonly minimumHeightMeters: number;
  readonly maximumHeightMeters: number;
  readonly semanticClassId: string;
}

export interface CanonicalSceneWaterV1 {
  readonly entityId: string;
  readonly terrainEntityId: string;
  readonly boundary: CanonicalSceneWaterBoundaryV1;
  readonly depthMeters: number;
  readonly shoreWidthMeters: number;
  readonly waterLevelMeters: number;
  readonly traversalMode: "blocked" | "swimmable" | "walkable";
  readonly semanticClassId: string;
}

export type CanonicalSceneObjectPrimitiveV1 =
  | Readonly<{ kind: "box"; sizeMetersXYZ: CanonicalSceneVec3V1 }>
  | Readonly<{ kind: "sphere"; radiusMeters: number }>
  | Readonly<{
      kind: "cylinder" | "cone";
      radiusMeters: number;
      heightMeters: number;
    }>;

export interface CanonicalSceneObjectV1 {
  readonly entityId: string;
  readonly prototypeId: string;
  readonly primitive: CanonicalSceneObjectPrimitiveV1;
  readonly transform: CanonicalSceneTransformV1;
  readonly collisionEnabled: boolean;
  readonly semanticClassId: string;
}

interface CanonicalSceneLayoutAssertionBaseV1 {
  readonly constraintId: string;
  readonly evidenceEntityIds: readonly string[];
  readonly measurements: Readonly<Record<string, number | boolean | string>>;
  readonly tolerances: Readonly<Record<string, number>>;
}

export type CanonicalSceneLayoutAssertionV1 =
  CanonicalSceneLayoutAssertionBaseV1 &
  (
    | Readonly<{
        kind: "inside-region" | "outside-region";
        entityId: string;
        regionId: string;
        boundaryClearanceMeters: number;
      }>
    | Readonly<{
        kind: "distance-range";
        entityId: string;
        referenceEntityId: string;
        minimumDistanceMeters: number;
        maximumDistanceMeters: number;
      }>
    | Readonly<{
        kind: "faces-entity";
        facingEntityId: string;
        targetEntityId: string;
        maximumAngularDeviationDegrees: number;
      }>
    | Readonly<{
        kind: "supported-by";
        supportedEntityId: string;
        supportingEntityId: string;
        maximumSupportGapMeters: number;
        minimumSupportRatio: number;
      }>
    | (Readonly<{
        kind: "minimum-clearance";
        entityId: string;
        clearanceMeters: number;
      }> & (
        | Readonly<{ otherEntityIds: readonly string[]; semanticClassIds?: never }>
        | Readonly<{ semanticClassIds: readonly string[]; otherEntityIds?: never }>
      ))
    | (Readonly<{
        kind: "within-slope-limit";
        terrainEntityId: string;
        maximumSlopeDegrees: number;
      }> & (
        | Readonly<{ entityId: string; routeId?: never }>
        | Readonly<{ routeId: string; entityId?: never }>
      ))
    | Readonly<{
        kind: "visible-in-camera-region";
        visibleEntityId: string;
        cameraEntityId: string;
        screenRegionId: string;
        minimumVisibleRatio: number;
        minimumProjectedAreaRatio: number;
      }>
  );

export interface CanonicalSceneLayoutPlacementProvenanceV1 {
  readonly kind: "fixed" | "solved";
  readonly candidateId: string;
  readonly placementConstraintIds: readonly string[];
  readonly solverProfileRef: string;
  readonly layoutSolveReportHash: Sha256HashV1;
}

export interface CanonicalSceneLayoutPlacementV1 {
  readonly entityId: string;
  readonly transform: CanonicalSceneTransformV1;
  readonly placementProvenance:
    CanonicalSceneLayoutPlacementProvenanceV1;
}

export interface CanonicalSceneLayoutRegionV1 {
  readonly id: string;
  readonly kind: "polygon-xz";
  readonly pointsMetersXZ: readonly CanonicalSceneVec2V1[];
  readonly minimumHeightMeters?: number;
  readonly maximumHeightMeters?: number;
  readonly semanticClassId: string;
}

export interface CanonicalSceneLayoutRouteV1 {
  readonly id: string;
  readonly kind: "polyline-xz";
  readonly pointsMetersXZ: readonly CanonicalSceneVec2V1[];
  readonly widthMeters: number;
  readonly locomotionProfileRef: string;
}

export interface CanonicalSceneLayoutScreenRegionV1 {
  readonly id: string;
  readonly kind: "rectangle-uv";
  readonly minimumUv: readonly [u: number, v: number];
  readonly maximumUv: readonly [u: number, v: number];
}

export interface CanonicalSceneLayoutV1 {
  readonly solverProfileRef: string;
  readonly resolvedVersion: string;
  readonly solverProfileHash: Sha256HashV1;
  readonly layoutSolveReportHash: Sha256HashV1;
  readonly regions: readonly CanonicalSceneLayoutRegionV1[];
  readonly routes: readonly CanonicalSceneLayoutRouteV1[];
  readonly screenRegions: readonly CanonicalSceneLayoutScreenRegionV1[];
  readonly placementsByEntityId:
    Readonly<Record<string, CanonicalSceneLayoutPlacementV1>>;
  readonly layoutAssertions: readonly CanonicalSceneLayoutAssertionV1[];
}

interface CanonicalSceneTraversalSurfaceBaseV1 {
  readonly traversalSurfaceId: string;
  readonly surfaceEntityId: string;
  readonly colliderSubshapeId: string;
  readonly resourceRef: string;
  readonly resolvedVersion: string;
  readonly resourceHash: Sha256HashV1;
}

export interface CanonicalSceneHeightfieldTraversalSurfaceV1
  extends CanonicalSceneTraversalSurfaceBaseV1 {
  readonly kind: "heightfield";
}

export interface CanonicalSceneStaticColliderTraversalSurfaceV1
  extends CanonicalSceneTraversalSurfaceBaseV1 {
  readonly kind: "static-collider";
  readonly logicalSurfaceId: string;
  readonly logicalSubshapeId: string;
  readonly colliderHash: Sha256HashV1;
  readonly traversalSurfaceProfileRef: string;
  readonly traversalSurfaceProfileResolvedVersion: string;
  readonly traversalSurfaceProfileHash: Sha256HashV1;
}

export type CanonicalSceneTraversalSurfaceV1 =
  | CanonicalSceneHeightfieldTraversalSurfaceV1
  | CanonicalSceneStaticColliderTraversalSurfaceV1;

export interface CanonicalSceneTraversalAreaV1 {
  readonly id: string;
  readonly kind: "polygon-xz";
  readonly pointsMetersXZ: readonly CanonicalSceneVec2V1[];
  readonly surfaceEntityId: string;
  readonly mode: "blocked";
}

export interface CanonicalSceneConnectivityRequirementV1 {
  readonly constraintId: string;
  readonly kind: "connected-by-route";
  readonly traversingEntityId: string;
  readonly startAnchorEntityId: string;
  readonly destinationAnchorEntityId: string;
  readonly routeId: string;
}

export interface CanonicalSceneTraversalV1 {
  readonly surfaces: readonly CanonicalSceneTraversalSurfaceV1[];
  readonly traversalAreas: readonly CanonicalSceneTraversalAreaV1[];
  readonly connectivityRequirements:
    readonly CanonicalSceneConnectivityRequirementV1[];
  readonly anchorEntityIds: readonly string[];
}

export type CanonicalSceneStaticColliderShapeV1 =
  | Readonly<{ kind: "box"; sizeMetersXYZ: CanonicalSceneVec3V1 }>
  | Readonly<{ kind: "sphere"; radiusMeters: number }>
  | Readonly<{
      kind: "cylinder";
      radiusMeters: number;
      heightMeters: number;
    }>;

export interface CanonicalSceneStaticColliderV1 {
  readonly entityId: string;
  readonly logicalSubshapeId: string;
  readonly colliderSubshapeId: string;
  readonly transform: CanonicalSceneTransformV1;
  readonly shape: CanonicalSceneStaticColliderShapeV1;
  readonly colliderHash: Sha256HashV1;
}

export interface CanonicalSceneSubjectInstanceV1 {
  readonly entityId: string;
  readonly spawnAnchorEntityId: string;
  readonly subjectOriginPositionMetersXYZ: CanonicalSceneVec3V1;
  readonly subjectFacingRadians: number;
}

export interface CanonicalSceneResourceLockEntryV1 {
  readonly resourceRef: string;
  readonly resourceKind: "traversal-surface-profile";
  readonly resolvedVersion: string;
  readonly contentHash: Sha256HashV1;
}

export interface CanonicalSceneExecutionPlanBodyV1 {
  readonly kind: "worldkit-canonical-scene-execution-plan";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly seed: number;
  readonly authoringSpecHash: Sha256HashV1;
  readonly normalizedWorldIrHash: Sha256HashV1;
  readonly coordinateSystem: "right-handed-y-up-minus-z-forward";
  readonly atmospherePreset:
    | "clear-day"
    | "golden-hour"
    | "overcast"
    | "night";
  readonly worldRuntimeBootstrapRef: string;
  readonly worldRuntimeBootstrapHash: Sha256HashV1;
  readonly sceneResourceLockHash: Sha256HashV1;
  readonly sceneResourceLockEntries:
    readonly CanonicalSceneResourceLockEntryV1[];
  readonly terrain: CanonicalSceneTerrainV1;
  readonly waters: readonly CanonicalSceneWaterV1[];
  readonly objects: readonly CanonicalSceneObjectV1[];
  readonly subjectInstances: readonly CanonicalSceneSubjectInstanceV1[];
  readonly sceneResourceUsage: Readonly<{
    vertices: number;
    triangles: number;
    colliders: number;
  }>;
  readonly layout: CanonicalSceneLayoutV1;
  readonly traversal: CanonicalSceneTraversalV1;
  readonly staticColliders: readonly CanonicalSceneStaticColliderV1[];
}

export type CanonicalSceneExecutionPlanV1 =
  CanonicalSceneExecutionPlanBodyV1;

const PLAN_FIELDS = Object.freeze([
  "kind", "schemaVersion", "id", "seed", "authoringSpecHash",
  "normalizedWorldIrHash", "coordinateSystem", "atmospherePreset",
  "worldRuntimeBootstrapRef", "worldRuntimeBootstrapHash",
  "sceneResourceLockHash", "sceneResourceLockEntries", "terrain", "waters",
  "objects", "subjectInstances", "sceneResourceUsage", "layout", "traversal",
  "staticColliders",
] as const);
const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
const ZERO_HASH = `sha256:${"0".repeat(64)}`;

function invalid(): never {
  throw new TypeError(
    "CANONICAL_SCENE_EXECUTION_PLAN_INVALID: value must match the closed CanonicalSceneExecutionPlanV1 contract",
  );
}

function snapshotData(input: unknown): unknown {
  if (typeof input !== "object" || isNil(input)) return input;
  try {
    if (Array.isArray(input)) {
      if (Reflect.getPrototypeOf(input) !== Array.prototype) return invalid();
      const keys = Reflect.ownKeys(input);
      if (keys.length !== input.length + 1 || keys.some((key) =>
        key !== "length" &&
        (typeof key !== "string" || !/^(?:0|[1-9][0-9]*)$/.test(key)))) {
        return invalid();
      }
      const result: unknown[] = [];
      for (let index = 0; index < input.length; index += 1) {
        const descriptor = Reflect.getOwnPropertyDescriptor(input, String(index));
        if (isNil(descriptor) || !descriptor.enumerable || !("value" in descriptor)) {
          return invalid();
        }
        result.push(snapshotData(descriptor.value));
      }
      return result;
    }
    if (Reflect.getPrototypeOf(input) !== Object.prototype) return invalid();
    const result: Record<string, unknown> = {};
    for (const key of Reflect.ownKeys(input)) {
      const descriptor = Reflect.getOwnPropertyDescriptor(input, key);
      if (
        typeof key !== "string" || isNil(descriptor) ||
        !descriptor.enumerable || !("value" in descriptor)
      ) return invalid();
      result[key] = snapshotData(descriptor.value);
    }
    return result;
  } catch {
    return invalid();
  }
}

function record(input: unknown): Record<string, unknown> {
  if (typeof input !== "object" || isNil(input) || Array.isArray(input)) {
    return invalid();
  }
  return input as Record<string, unknown>;
}

function exact(
  input: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): Record<string, unknown> {
  const value = record(input);
  const allowed = [...required, ...optional];
  const keys = Object.keys(value);
  if (
    required.some((key) => !Object.hasOwn(value, key)) ||
    keys.some((key) => !allowed.includes(key))
  ) return invalid();
  return value;
}

function array(input: unknown): readonly unknown[] {
  if (!Array.isArray(input)) return invalid();
  return input;
}

function string(input: unknown): string {
  if (
    typeof input !== "string" || input.length === 0 ||
    input.trim() !== input || input.normalize("NFC") !== input
  ) return invalid();
  return input;
}

function hash(input: unknown): Sha256HashV1 {
  if (typeof input !== "string" || !HASH_PATTERN.test(input) || input === ZERO_HASH) {
    return invalid();
  }
  return input as Sha256HashV1;
}

function finite(input: unknown): number {
  if (typeof input !== "number" || !Number.isFinite(input) || Object.is(input, -0)) {
    return invalid();
  }
  return input;
}

function uint32(input: unknown): number {
  const value = finite(input);
  if (!Number.isInteger(value) || value < 0 || value > 4_294_967_295) {
    return invalid();
  }
  return value;
}

function nonNegativeInteger(input: unknown): number {
  const value = finite(input);
  if (!Number.isSafeInteger(value) || value < 0) return invalid();
  return value;
}

function boolean(input: unknown): boolean {
  if (typeof input !== "boolean") return invalid();
  return input;
}

function literal<Value extends string>(
  input: unknown,
  values: readonly Value[],
): Value {
  if (typeof input !== "string" || !values.includes(input as Value)) {
    return invalid();
  }
  return input as Value;
}

function tuple2(input: unknown): CanonicalSceneVec2V1 {
  const values = array(input);
  if (values.length !== 2) return invalid();
  return Object.freeze([finite(values[0]), finite(values[1])]);
}

function tuple3(input: unknown): CanonicalSceneVec3V1 {
  const values = array(input);
  if (values.length !== 3) return invalid();
  return Object.freeze([
    finite(values[0]), finite(values[1]), finite(values[2]),
  ]);
}

function stringSet(input: unknown): readonly string[] {
  const values = array(input).map(string);
  if (new Set(values).size !== values.length) return invalid();
  return Object.freeze(sortBy(values));
}

function canonicalRows<Value>(
  input: unknown,
  parse: (value: unknown) => Value,
  identity: (value: Value) => string,
): readonly Value[] {
  const values = array(input).map(parse);
  const ids = values.map(identity);
  if (ids.some((id) => id.length === 0) || new Set(ids).size !== ids.length) {
    return invalid();
  }
  return Object.freeze(sortBy(values, identity));
}

function parseTransform(input: unknown): CanonicalSceneTransformV1 {
  const value = exact(input, [
    "positionMetersXYZ", "rotationEulerRadiansXYZ", "scaleXYZ",
  ]);
  return Object.freeze({
    positionMetersXYZ: tuple3(value.positionMetersXYZ),
    rotationEulerRadiansXYZ: tuple3(value.rotationEulerRadiansXYZ),
    scaleXYZ: tuple3(value.scaleXYZ),
  });
}

function parsePrimitive(
  input: unknown,
  allowed: readonly ("box" | "sphere" | "cylinder" | "cone")[],
): CanonicalSceneObjectPrimitiveV1 {
  const value = record(input);
  const kind = literal(value.kind, allowed);
  if (kind === "box") {
    const row = exact(value, ["kind", "sizeMetersXYZ"]);
    return Object.freeze({ kind, sizeMetersXYZ: tuple3(row.sizeMetersXYZ) });
  }
  if (kind === "sphere") {
    const row = exact(value, ["kind", "radiusMeters"]);
    return Object.freeze({ kind, radiusMeters: finite(row.radiusMeters) });
  }
  const row = exact(value, ["kind", "radiusMeters", "heightMeters"]);
  return Object.freeze({
    kind,
    radiusMeters: finite(row.radiusMeters),
    heightMeters: finite(row.heightMeters),
  });
}

function parseTerrain(input: unknown): CanonicalSceneTerrainV1 {
  const value = exact(input, [
    "entityId", "centerMetersXZ", "sizeMetersXZ", "resolutionCellsXZ",
    "heightSamplesMeters", "heightSamplesHash", "minimumHeightMeters",
    "maximumHeightMeters", "semanticClassId",
  ]);
  const resolution = array(value.resolutionCellsXZ);
  if (resolution.length !== 2) return invalid();
  const columns = nonNegativeInteger(resolution[0]);
  const rows = nonNegativeInteger(resolution[1]);
  if (columns < 2 || rows < 2) return invalid();
  const samples = Object.freeze(array(value.heightSamplesMeters).map(finite));
  if (samples.length !== columns * rows) return invalid();
  const minimumHeightMeters = finite(value.minimumHeightMeters);
  const maximumHeightMeters = finite(value.maximumHeightMeters);
  if (
    minimumHeightMeters > maximumHeightMeters ||
    samples.some((sample) =>
      sample < minimumHeightMeters || sample > maximumHeightMeters)
  ) return invalid();
  return Object.freeze({
    entityId: string(value.entityId),
    centerMetersXZ: tuple2(value.centerMetersXZ),
    sizeMetersXZ: tuple2(value.sizeMetersXZ),
    resolutionCellsXZ: Object.freeze([columns, rows] as const),
    heightSamplesMeters: samples,
    heightSamplesHash: hash(value.heightSamplesHash),
    minimumHeightMeters,
    maximumHeightMeters,
    semanticClassId: string(value.semanticClassId),
  });
}

function parseWaterBoundary(input: unknown): CanonicalSceneWaterBoundaryV1 {
  const value = record(input);
  const kind = literal(value.kind, ["circle", "ellipse", "polygon"] as const);
  if (kind === "circle") {
    const row = exact(value, ["kind", "centerMetersXZ", "radiusMeters"]);
    return Object.freeze({ kind, centerMetersXZ: tuple2(row.centerMetersXZ), radiusMeters: finite(row.radiusMeters) });
  }
  if (kind === "ellipse") {
    const row = exact(value, ["kind", "centerMetersXZ", "radiusMetersXZ"]);
    return Object.freeze({ kind, centerMetersXZ: tuple2(row.centerMetersXZ), radiusMetersXZ: tuple2(row.radiusMetersXZ) });
  }
  const row = exact(value, ["kind", "pointsMetersXZ"]);
  return Object.freeze({ kind, pointsMetersXZ: Object.freeze(array(row.pointsMetersXZ).map(tuple2)) });
}

function parseWater(input: unknown): CanonicalSceneWaterV1 {
  const value = exact(input, [
    "entityId", "terrainEntityId", "boundary", "depthMeters",
    "shoreWidthMeters", "waterLevelMeters", "traversalMode", "semanticClassId",
  ]);
  return Object.freeze({
    entityId: string(value.entityId),
    terrainEntityId: string(value.terrainEntityId),
    boundary: parseWaterBoundary(value.boundary),
    depthMeters: finite(value.depthMeters),
    shoreWidthMeters: finite(value.shoreWidthMeters),
    waterLevelMeters: finite(value.waterLevelMeters),
    traversalMode: literal(value.traversalMode, ["blocked", "swimmable", "walkable"] as const),
    semanticClassId: string(value.semanticClassId),
  });
}

function parseObject(input: unknown): CanonicalSceneObjectV1 {
  const value = exact(input, [
    "entityId", "prototypeId", "primitive", "transform", "collisionEnabled",
    "semanticClassId",
  ]);
  return Object.freeze({
    entityId: string(value.entityId),
    prototypeId: string(value.prototypeId),
    primitive: parsePrimitive(value.primitive, ["box", "sphere", "cylinder", "cone"]),
    transform: parseTransform(value.transform),
    collisionEnabled: boolean(value.collisionEnabled),
    semanticClassId: string(value.semanticClassId),
  });
}

function parseSubjectInstance(input: unknown): CanonicalSceneSubjectInstanceV1 {
  const value = exact(input, [
    "entityId", "spawnAnchorEntityId", "subjectOriginPositionMetersXYZ",
    "subjectFacingRadians",
  ]);
  return Object.freeze({
    entityId: string(value.entityId),
    spawnAnchorEntityId: string(value.spawnAnchorEntityId),
    subjectOriginPositionMetersXYZ: tuple3(value.subjectOriginPositionMetersXYZ),
    subjectFacingRadians: finite(value.subjectFacingRadians),
  });
}

function parseLock(input: unknown): CanonicalSceneResourceLockEntryV1 {
  const value = exact(input, [
    "resourceRef", "resourceKind", "resolvedVersion", "contentHash",
  ]);
  return Object.freeze({
    resourceRef: string(value.resourceRef),
    resourceKind: literal(value.resourceKind, ["traversal-surface-profile"]),
    resolvedVersion: string(value.resolvedVersion),
    contentHash: hash(value.contentHash),
  });
}

function parseLayoutRegion(input: unknown): CanonicalSceneLayoutRegionV1 {
  const value = exact(input, ["id", "kind", "pointsMetersXZ", "semanticClassId"], ["minimumHeightMeters", "maximumHeightMeters"]);
  return Object.freeze({
    id: string(value.id),
    kind: literal(value.kind, ["polygon-xz"]),
    pointsMetersXZ: Object.freeze(array(value.pointsMetersXZ).map(tuple2)),
    ...(Object.hasOwn(value, "minimumHeightMeters") ? { minimumHeightMeters: finite(value.minimumHeightMeters) } : {}),
    ...(Object.hasOwn(value, "maximumHeightMeters") ? { maximumHeightMeters: finite(value.maximumHeightMeters) } : {}),
    semanticClassId: string(value.semanticClassId),
  });
}

function parseLayoutRoute(input: unknown): CanonicalSceneLayoutRouteV1 {
  const value = exact(input, ["id", "kind", "pointsMetersXZ", "widthMeters", "locomotionProfileRef"]);
  return Object.freeze({
    id: string(value.id),
    kind: literal(value.kind, ["polyline-xz"]),
    pointsMetersXZ: Object.freeze(array(value.pointsMetersXZ).map(tuple2)),
    widthMeters: finite(value.widthMeters),
    locomotionProfileRef: string(value.locomotionProfileRef),
  });
}

function parseScreenRegion(input: unknown): CanonicalSceneLayoutScreenRegionV1 {
  const value = exact(input, ["id", "kind", "minimumUv", "maximumUv"]);
  return Object.freeze({
    id: string(value.id),
    kind: literal(value.kind, ["rectangle-uv"]),
    minimumUv: tuple2(value.minimumUv),
    maximumUv: tuple2(value.maximumUv),
  });
}

function parsePlacement(input: unknown): CanonicalSceneLayoutPlacementV1 {
  const value = exact(input, ["entityId", "transform", "placementProvenance"]);
  const provenance = exact(value.placementProvenance, [
    "kind", "candidateId", "placementConstraintIds", "solverProfileRef",
    "layoutSolveReportHash",
  ]);
  return Object.freeze({
    entityId: string(value.entityId),
    transform: parseTransform(value.transform),
    placementProvenance: Object.freeze({
      kind: literal(provenance.kind, ["fixed", "solved"] as const),
      candidateId: string(provenance.candidateId),
      placementConstraintIds: stringSet(provenance.placementConstraintIds),
      solverProfileRef: string(provenance.solverProfileRef),
      layoutSolveReportHash: hash(provenance.layoutSolveReportHash),
    }),
  });
}

const ASSERTION_KINDS = [
  "inside-region", "outside-region", "distance-range", "faces-entity",
  "supported-by", "minimum-clearance", "within-slope-limit",
  "visible-in-camera-region",
] as const;

function parseAssertion(input: unknown): CanonicalSceneLayoutAssertionV1 {
  const source = record(input);
  const kind = literal(source.kind, ASSERTION_KINDS);
  const base = ["constraintId", "kind", "evidenceEntityIds", "measurements", "tolerances"];
  const extras = kind === "inside-region" || kind === "outside-region"
    ? ["entityId", "regionId", "boundaryClearanceMeters"]
    : kind === "distance-range"
      ? ["entityId", "referenceEntityId", "minimumDistanceMeters", "maximumDistanceMeters"]
      : kind === "faces-entity"
        ? ["facingEntityId", "targetEntityId", "maximumAngularDeviationDegrees"]
        : kind === "supported-by"
          ? ["supportedEntityId", "supportingEntityId", "maximumSupportGapMeters", "minimumSupportRatio"]
          : kind === "minimum-clearance"
            ? ["entityId", "clearanceMeters", Object.hasOwn(source, "otherEntityIds") ? "otherEntityIds" : "semanticClassIds"]
            : kind === "within-slope-limit"
              ? ["terrainEntityId", "maximumSlopeDegrees", Object.hasOwn(source, "entityId") ? "entityId" : "routeId"]
              : ["visibleEntityId", "cameraEntityId", "screenRegionId", "minimumVisibleRatio", "minimumProjectedAreaRatio"];
  const value = exact(source, [...base, ...extras]);
  const measurements = Object.fromEntries(Object.entries(record(value.measurements)).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => {
    if (typeof item === "number") return [key, finite(item)];
    if (typeof item !== "string" && typeof item !== "boolean") return invalid();
    return [key, item];
  }));
  const tolerances = Object.fromEntries(Object.entries(record(value.tolerances)).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, finite(item)]));
  const parsed: Record<string, unknown> = {
    constraintId: string(value.constraintId), kind,
    evidenceEntityIds: stringSet(value.evidenceEntityIds),
    measurements: Object.freeze(measurements), tolerances: Object.freeze(tolerances),
  };
  for (const key of extras) {
    const item = value[key];
    parsed[key] = key.endsWith("Ids") ? stringSet(item)
      : key.endsWith("Id") ? string(item) : finite(item);
  }
  return Object.freeze(parsed) as unknown as CanonicalSceneLayoutAssertionV1;
}

function parseLayout(input: unknown): CanonicalSceneLayoutV1 {
  const value = exact(input, [
    "solverProfileRef", "resolvedVersion", "solverProfileHash",
    "layoutSolveReportHash", "regions", "routes", "screenRegions",
    "placementsByEntityId", "layoutAssertions",
  ]);
  const placements = Object.fromEntries(
    Object.entries(record(value.placementsByEntityId))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([entityId, placement]) => {
        const parsed = parsePlacement(placement);
        if (parsed.entityId !== entityId) return invalid();
        return [entityId, parsed];
      }),
  );
  return Object.freeze({
    solverProfileRef: string(value.solverProfileRef),
    resolvedVersion: string(value.resolvedVersion),
    solverProfileHash: hash(value.solverProfileHash),
    layoutSolveReportHash: hash(value.layoutSolveReportHash),
    regions: canonicalRows(value.regions, parseLayoutRegion, (row) => row.id),
    routes: canonicalRows(value.routes, parseLayoutRoute, (row) => row.id),
    screenRegions: canonicalRows(value.screenRegions, parseScreenRegion, (row) => row.id),
    placementsByEntityId: Object.freeze(placements),
    layoutAssertions: canonicalRows(value.layoutAssertions, parseAssertion, (row) => row.constraintId),
  });
}

function parseSurface(input: unknown): CanonicalSceneTraversalSurfaceV1 {
  const source = record(input);
  const kind = literal(source.kind, ["heightfield", "static-collider"] as const);
  const base = ["kind", "traversalSurfaceId", "surfaceEntityId", "colliderSubshapeId", "resourceRef", "resolvedVersion", "resourceHash"];
  const value = exact(source, kind === "heightfield" ? base : [
    ...base, "logicalSurfaceId", "logicalSubshapeId", "colliderHash",
    "traversalSurfaceProfileRef", "traversalSurfaceProfileResolvedVersion",
    "traversalSurfaceProfileHash",
  ]);
  const common = {
    kind,
    traversalSurfaceId: string(value.traversalSurfaceId),
    surfaceEntityId: string(value.surfaceEntityId),
    colliderSubshapeId: string(value.colliderSubshapeId),
    resourceRef: string(value.resourceRef),
    resolvedVersion: string(value.resolvedVersion),
    resourceHash: hash(value.resourceHash),
  };
  if (kind === "heightfield") {
    return Object.freeze({ ...common, kind: "heightfield" });
  }
  return Object.freeze({
    ...common,
    kind: "static-collider",
    logicalSurfaceId: string(value.logicalSurfaceId),
    logicalSubshapeId: string(value.logicalSubshapeId),
    colliderHash: hash(value.colliderHash),
    traversalSurfaceProfileRef: string(value.traversalSurfaceProfileRef),
    traversalSurfaceProfileResolvedVersion: string(value.traversalSurfaceProfileResolvedVersion),
    traversalSurfaceProfileHash: hash(value.traversalSurfaceProfileHash),
  });
}

function parseTraversalArea(input: unknown): CanonicalSceneTraversalAreaV1 {
  const value = exact(input, ["id", "kind", "pointsMetersXZ", "surfaceEntityId", "mode"]);
  return Object.freeze({
    id: string(value.id), kind: literal(value.kind, ["polygon-xz"]),
    pointsMetersXZ: Object.freeze(array(value.pointsMetersXZ).map(tuple2)),
    surfaceEntityId: string(value.surfaceEntityId), mode: literal(value.mode, ["blocked"]),
  });
}

function parseConnectivity(input: unknown): CanonicalSceneConnectivityRequirementV1 {
  const value = exact(input, ["constraintId", "kind", "traversingEntityId", "startAnchorEntityId", "destinationAnchorEntityId", "routeId"]);
  return Object.freeze({
    constraintId: string(value.constraintId), kind: literal(value.kind, ["connected-by-route"]),
    traversingEntityId: string(value.traversingEntityId),
    startAnchorEntityId: string(value.startAnchorEntityId),
    destinationAnchorEntityId: string(value.destinationAnchorEntityId),
    routeId: string(value.routeId),
  });
}

function parseTraversal(input: unknown): CanonicalSceneTraversalV1 {
  const value = exact(input, ["surfaces", "traversalAreas", "connectivityRequirements", "anchorEntityIds"]);
  return Object.freeze({
    surfaces: canonicalRows(value.surfaces, parseSurface, (row) => row.traversalSurfaceId),
    traversalAreas: canonicalRows(value.traversalAreas, parseTraversalArea, (row) => row.id),
    connectivityRequirements: canonicalRows(value.connectivityRequirements, parseConnectivity, (row) => row.constraintId),
    anchorEntityIds: stringSet(value.anchorEntityIds),
  });
}

function parseStaticCollider(input: unknown): CanonicalSceneStaticColliderV1 {
  const value = exact(input, ["entityId", "logicalSubshapeId", "colliderSubshapeId", "transform", "shape", "colliderHash"]);
  return Object.freeze({
    entityId: string(value.entityId), logicalSubshapeId: string(value.logicalSubshapeId),
    colliderSubshapeId: string(value.colliderSubshapeId), transform: parseTransform(value.transform),
    shape: parsePrimitive(value.shape, ["box", "sphere", "cylinder"]) as CanonicalSceneStaticColliderShapeV1,
    colliderHash: hash(value.colliderHash),
  });
}

function canonicalBody(input: unknown): CanonicalSceneExecutionPlanBodyV1 {
  const value = exact(snapshotData(input), PLAN_FIELDS);
  if (
    value.kind !== "worldkit-canonical-scene-execution-plan" ||
    value.schemaVersion !== 1 ||
    value.coordinateSystem !== "right-handed-y-up-minus-z-forward"
  ) return invalid();
  const sceneResourceLockEntries = canonicalRows(
    value.sceneResourceLockEntries, parseLock, (entry) => entry.resourceRef,
  );
  if (hash(value.sceneResourceLockHash) !== sha256CanonicalJson(sceneResourceLockEntries)) {
    return invalid();
  }
  const usage = exact(value.sceneResourceUsage, ["vertices", "triangles", "colliders"]);
  return Object.freeze({
    kind: "worldkit-canonical-scene-execution-plan",
    schemaVersion: 1,
    id: string(value.id),
    seed: uint32(value.seed),
    authoringSpecHash: hash(value.authoringSpecHash),
    normalizedWorldIrHash: hash(value.normalizedWorldIrHash),
    coordinateSystem: "right-handed-y-up-minus-z-forward",
    atmospherePreset: literal(value.atmospherePreset, ["clear-day", "golden-hour", "overcast", "night"] as const),
    worldRuntimeBootstrapRef: string(value.worldRuntimeBootstrapRef),
    worldRuntimeBootstrapHash: hash(value.worldRuntimeBootstrapHash),
    sceneResourceLockHash: sha256CanonicalJson(sceneResourceLockEntries) as Sha256HashV1,
    sceneResourceLockEntries,
    terrain: parseTerrain(value.terrain),
    waters: canonicalRows(value.waters, parseWater, (water) => water.entityId),
    objects: canonicalRows(value.objects, parseObject, (object) => object.entityId),
    subjectInstances: canonicalRows(value.subjectInstances, parseSubjectInstance, (subject) => subject.entityId),
    sceneResourceUsage: Object.freeze({
      vertices: nonNegativeInteger(usage.vertices),
      triangles: nonNegativeInteger(usage.triangles),
      colliders: nonNegativeInteger(usage.colliders),
    }),
    layout: parseLayout(value.layout),
    traversal: parseTraversal(value.traversal),
    staticColliders: canonicalRows(value.staticColliders, parseStaticCollider, (collider) => collider.colliderSubshapeId),
  });
}

export function createCanonicalSceneExecutionPlanV1(
  input: CanonicalSceneExecutionPlanBodyV1,
): CanonicalSceneExecutionPlanV1 {
  return canonicalBody(input);
}

export function parseCanonicalSceneExecutionPlanV1(
  input: unknown,
): CanonicalSceneExecutionPlanV1 {
  const snapshot = snapshotData(input);
  const canonical = canonicalBody(snapshot);
  if (stringifyCanonicalJson(snapshot) !== stringifyCanonicalJson(canonical)) {
    return invalid();
  }
  return canonical;
}

export function hashCanonicalSceneExecutionPlanV1(
  input: unknown,
): Sha256HashV1 {
  return sha256CanonicalJson(
    parseCanonicalSceneExecutionPlanV1(input),
  ) as Sha256HashV1;
}

export function canonicalSceneExecutionPlanCanonicalBytesV1(
  input: unknown,
): Uint8Array {
  return canonicalJsonBytes(parseCanonicalSceneExecutionPlanV1(input));
}
