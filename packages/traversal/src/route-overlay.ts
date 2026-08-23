import { sha256CanonicalJson } from "@whitebox-world/protocol";
import { isEqual, isNil, isPlainObject } from "lodash-es";

import {
  assertRouteBuildInputReceiptV2,
  type RouteBuildAnchorV1,
  type RouteHardRibbonV1,
} from "./build-input.js";
import { deriveColliderSubshapeIdV1 } from "./collider-subshape-id.js";
import { assertRouteConnectivityResultForBuildInputV2 } from "./connectivity-result.js";
import { assertTraversalSurfaceIdentityV1 } from "./graph-contract.js";
import type { TraversalSurfaceIdentityV1 } from "./types.js";

type Sha256Hash = `sha256:${string}`;
type UnknownRecord = Record<string, unknown>;
type Vec2 = readonly [number, number];
type Vec3 = readonly [number, number, number];

export interface RouteOverlayColliderIdentityV1 {
  readonly entityId: string;
  readonly logicalSubshapeId: string;
  readonly colliderSubshapeId: string;
  readonly colliderHash: Sha256Hash;
}

export interface RouteOverlayV1 {
  readonly kind: "route-overlay";
  readonly schemaVersion: 1;
  readonly constraintId: string;
  readonly routeId: string;
  readonly traversingEntityId: string;
  readonly startAnchor: RouteBuildAnchorV1;
  readonly destinationAnchor: RouteBuildAnchorV1;
  readonly traversalSurfaceIdentity: TraversalSurfaceIdentityV1;
  readonly resolvedTraversalLockHash: Sha256Hash;
  readonly traversalGraphHash: Sha256Hash;
  readonly routePathReceiptHash: Sha256Hash;
  readonly orderedTraversalNodeIds: readonly string[];
  readonly orderedTraversalEdgeIds: readonly string[];
  readonly orderedPathPositionsMetersXYZ: readonly Vec3[];
  readonly hardRibbon: RouteHardRibbonV1;
  readonly blockingColliderIdentities: readonly RouteOverlayColliderIdentityV1[];
}

const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;
const OVERLAY_FIELDS = [
  "kind",
  "schemaVersion",
  "constraintId",
  "routeId",
  "traversingEntityId",
  "startAnchor",
  "destinationAnchor",
  "traversalSurfaceIdentity",
  "resolvedTraversalLockHash",
  "traversalGraphHash",
  "routePathReceiptHash",
  "orderedTraversalNodeIds",
  "orderedTraversalEdgeIds",
  "orderedPathPositionsMetersXYZ",
  "hardRibbon",
  "blockingColliderIdentities",
] as const;
const ANCHOR_FIELDS = ["entityId", "positionMetersXYZ"] as const;
const HARD_RIBBON_FIELDS = [
  "routeId",
  "pointsMetersXZ",
  "widthMeters",
  "locomotionProfileRef",
] as const;
const COLLIDER_IDENTITY_FIELDS = [
  "entityId",
  "logicalSubshapeId",
  "colliderSubshapeId",
  "colliderHash",
] as const;

function fail(path: string, message: string): never {
  throw new Error(
    `ROUTE_OVERLAY_INVALID: ${path.length === 0 ? message : `${path}: ${message}`}`,
  );
}

function requireRecord(value: unknown, path: string): UnknownRecord {
  if (isNil(value) || !isPlainObject(value)) {
    fail(path, "expected a plain object");
  }
  return value as UnknownRecord;
}

function requireExactRecord(
  value: unknown,
  fields: readonly string[],
  path: string,
): UnknownRecord {
  const record = requireRecord(value, path);
  const allowed = new Set(fields);
  const unknownField = Object.keys(record).find((field) => !allowed.has(field));
  if (!isNil(unknownField)) {
    fail(path, `unknown field '${unknownField}'`);
  }
  for (const field of fields) {
    if (isNil(record[field])) {
      fail(path, `missing field '${field}'`);
    }
  }
  return record;
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    fail(path, "must be a non-empty string");
  }
  return value;
}

function requireHash(value: unknown, path: string): Sha256Hash {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    fail(path, "must be a lowercase sha256 hash");
  }
  return value as Sha256Hash;
}

function requireFinite(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(path, "must be finite");
  }
  return value === 0 ? 0 : value;
}

function requirePositive(value: unknown, path: string): number {
  const number = requireFinite(value, path);
  if (!(number > 0)) {
    fail(path, "must be > 0");
  }
  return number;
}

function requireVec2(value: unknown, path: string): Vec2 {
  if (!Array.isArray(value) || value.length !== 2) {
    fail(path, "must be a 2-tuple");
  }
  return [
    requireFinite(value[0], `${path}/0`),
    requireFinite(value[1], `${path}/1`),
  ];
}

function requireVec3(value: unknown, path: string): Vec3 {
  if (!Array.isArray(value) || value.length !== 3) {
    fail(path, "must be a 3-tuple");
  }
  return [
    requireFinite(value[0], `${path}/0`),
    requireFinite(value[1], `${path}/1`),
    requireFinite(value[2], `${path}/2`),
  ];
}

function requireUniqueStringArray(
  value: unknown,
  path: string,
): readonly string[] {
  if (!Array.isArray(value)) {
    fail(path, "must be an array");
  }
  const strings = value.map((entry, index) =>
    requireString(entry, `${path}/${index}`)
  );
  if (new Set(strings).size !== strings.length) {
    fail(path, "must not contain duplicate ids");
  }
  return strings;
}

function requireCorridorPointsMetersXZ(
  value: unknown,
  path: string,
): readonly Vec2[] {
  if (!Array.isArray(value)) {
    fail(path, "must be an array");
  }
  const points = value.map((point, index) => requireVec2(point, `${path}/${index}`));
  const distinctSegmentCount = points.slice(1).filter((point, index) => {
    const previous = points[index]!;
    return point[0] !== previous[0] || point[1] !== previous[1];
  }).length;
  if (distinctSegmentCount === 0) {
    fail(path, "must contain at least two distinct points");
  }
  return points;
}

function requireDistinctAdjacentVec3Array(
  value: unknown,
  path: string,
): readonly Vec3[] {
  if (!Array.isArray(value)) {
    fail(path, "must be an array");
  }
  const positions = value.map((position, index) =>
    requireVec3(position, `${path}/${index}`)
  );
  if (positions.length === 0) {
    fail(path, "must contain at least one position");
  }
  for (let index = 1; index < positions.length; index += 1) {
    const previous = positions[index - 1]!;
    const current = positions[index]!;
    if (
      previous[0] === current[0] &&
      previous[1] === current[1] &&
      previous[2] === current[2]
    ) {
      fail(path, "adjacent positions must be distinct");
    }
  }
  return positions;
}

function canonicalAnchor(value: unknown, path: string): RouteBuildAnchorV1 {
  const record = requireExactRecord(value, ANCHOR_FIELDS, path);
  return {
    entityId: requireString(record.entityId, `${path}/entityId`),
    positionMetersXYZ: requireVec3(
      record.positionMetersXYZ,
      `${path}/positionMetersXYZ`,
    ),
  };
}

function canonicalHardRibbon(value: unknown): RouteHardRibbonV1 {
  const path = "hardRibbon";
  const record = requireExactRecord(value, HARD_RIBBON_FIELDS, path);
  return {
    routeId: requireString(record.routeId, `${path}/routeId`),
    pointsMetersXZ: requireCorridorPointsMetersXZ(
      record.pointsMetersXZ,
      `${path}/pointsMetersXZ`,
    ),
    widthMeters: requirePositive(record.widthMeters, `${path}/widthMeters`),
    locomotionProfileRef: requireString(
      record.locomotionProfileRef,
      `${path}/locomotionProfileRef`,
    ),
  };
}

function canonicalBlockingColliderIdentities(
  value: unknown,
  traversalSurfaceColliderSubshapeId: string,
): readonly RouteOverlayColliderIdentityV1[] {
  const path = "blockingColliderIdentities";
  if (!Array.isArray(value)) {
    fail(path, "must be an array");
  }
  let previousColliderSubshapeId: string | undefined;
  return value.map((entry, index) => {
    const entryPath = `${path}/${index}`;
    const record = requireExactRecord(
      entry,
      COLLIDER_IDENTITY_FIELDS,
      entryPath,
    );
    const entityId = requireString(record.entityId, `${entryPath}/entityId`);
    const logicalSubshapeId = requireString(
      record.logicalSubshapeId,
      `${entryPath}/logicalSubshapeId`,
    );
    const colliderSubshapeId = requireString(
      record.colliderSubshapeId,
      `${entryPath}/colliderSubshapeId`,
    );
    if (
      colliderSubshapeId !== deriveColliderSubshapeIdV1(
        entityId,
        logicalSubshapeId,
      )
    ) {
      fail(
        `${entryPath}/colliderSubshapeId`,
        "must match the canonical Entity and logical Subshape identity",
      );
    }
    if (
      !isNil(previousColliderSubshapeId) &&
      colliderSubshapeId <= previousColliderSubshapeId
    ) {
      fail(path, "must be strictly sorted by colliderSubshapeId");
    }
    previousColliderSubshapeId = colliderSubshapeId;
    if (colliderSubshapeId === traversalSurfaceColliderSubshapeId) {
      fail(
        `${entryPath}/colliderSubshapeId`,
        "must not duplicate the Traversal Surface colliderSubshapeId",
      );
    }
    return {
      entityId,
      logicalSubshapeId,
      colliderSubshapeId,
      colliderHash: requireHash(record.colliderHash, `${entryPath}/colliderHash`),
    };
  });
}

function deepFreeze<T>(value: T): T {
  if (isNil(value) || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child);
  }
  return Object.freeze(value);
}

export function canonicalRouteOverlayV1(value: unknown): RouteOverlayV1 {
  const record = requireExactRecord(value, OVERLAY_FIELDS, "");
  if (record.kind !== "route-overlay") {
    fail("kind", "must be 'route-overlay'");
  }
  if (record.schemaVersion !== 1) {
    fail("schemaVersion", "must be 1");
  }

  const routeId = requireString(record.routeId, "routeId");
  const startAnchor = canonicalAnchor(record.startAnchor, "startAnchor");
  const destinationAnchor = canonicalAnchor(
    record.destinationAnchor,
    "destinationAnchor",
  );
  if (startAnchor.entityId === destinationAnchor.entityId) {
    fail("destinationAnchor/entityId", "must differ from startAnchor/entityId");
  }

  let traversalSurfaceIdentity: TraversalSurfaceIdentityV1;
  try {
    traversalSurfaceIdentity = assertTraversalSurfaceIdentityV1(
      record.traversalSurfaceIdentity,
    );
  } catch {
    fail(
      "traversalSurfaceIdentity",
      "must be a canonical Traversal Surface identity",
    );
  }

  const orderedTraversalNodeIds = requireUniqueStringArray(
    record.orderedTraversalNodeIds,
    "orderedTraversalNodeIds",
  );
  if (orderedTraversalNodeIds.length === 0) {
    fail("orderedTraversalNodeIds", "must contain at least one Node id");
  }
  const orderedTraversalEdgeIds = requireUniqueStringArray(
    record.orderedTraversalEdgeIds,
    "orderedTraversalEdgeIds",
  );
  if (orderedTraversalEdgeIds.length !== orderedTraversalNodeIds.length - 1) {
    fail(
      "orderedTraversalEdgeIds",
      "length must equal orderedTraversalNodeIds.length - 1",
    );
  }

  const hardRibbon = canonicalHardRibbon(record.hardRibbon);
  if (hardRibbon.routeId !== routeId) {
    fail("hardRibbon/routeId", "must match routeId");
  }

  return deepFreeze({
    kind: "route-overlay",
    schemaVersion: 1,
    constraintId: requireString(record.constraintId, "constraintId"),
    routeId,
    traversingEntityId: requireString(
      record.traversingEntityId,
      "traversingEntityId",
    ),
    startAnchor,
    destinationAnchor,
    traversalSurfaceIdentity,
    resolvedTraversalLockHash: requireHash(
      record.resolvedTraversalLockHash,
      "resolvedTraversalLockHash",
    ),
    traversalGraphHash: requireHash(
      record.traversalGraphHash,
      "traversalGraphHash",
    ),
    routePathReceiptHash: requireHash(
      record.routePathReceiptHash,
      "routePathReceiptHash",
    ),
    orderedTraversalNodeIds,
    orderedTraversalEdgeIds,
    orderedPathPositionsMetersXYZ: requireDistinctAdjacentVec3Array(
      record.orderedPathPositionsMetersXYZ,
      "orderedPathPositionsMetersXYZ",
    ),
    hardRibbon,
    blockingColliderIdentities: canonicalBlockingColliderIdentities(
      record.blockingColliderIdentities,
      traversalSurfaceIdentity.colliderSubshapeId,
    ),
  });
}

export function hashRouteOverlayV1(value: unknown): Sha256Hash {
  return sha256CanonicalJson(canonicalRouteOverlayV1(value)) as Sha256Hash;
}

const OVERLAY_FIELDS_V2 = OVERLAY_FIELDS.map((field) => {
  if (field === "traversalSurfaceIdentity") return "orderedTraversalSurfaceIdentities";
  if (field === "blockingColliderIdentities") return "staticColliderIdentities";
  return field;
});

export interface RouteOverlayV2 extends Omit<
  RouteOverlayV1,
  "schemaVersion" | "traversalSurfaceIdentity" | "blockingColliderIdentities"
> {
  readonly schemaVersion: 2;
  readonly orderedTraversalSurfaceIdentities: readonly TraversalSurfaceIdentityV1[];
  readonly staticColliderIdentities: readonly RouteOverlayColliderIdentityV1[];
}

export interface AssertRouteOverlayContextInputV2 {
  readonly overlay: unknown;
  readonly routeConnectivityResult: unknown;
  readonly buildInputReceipt: unknown;
}

function canonicalOrderedOverlayIdentities(
  value: unknown,
  expectedLength: number,
): readonly TraversalSurfaceIdentityV1[] {
  if (!Array.isArray(value)) {
    fail("orderedTraversalSurfaceIdentities", "must be an array");
  }
  if (value.length !== expectedLength) {
    fail(
      "orderedTraversalSurfaceIdentities",
      "length must equal orderedTraversalNodeIds.length",
    );
  }
  return value.map((candidate, index) => {
    try {
      return assertTraversalSurfaceIdentityV1(candidate);
    } catch {
      fail(
        `orderedTraversalSurfaceIdentities/${index}`,
        "must be a canonical Traversal Surface identity",
      );
    }
  });
}

function canonicalStaticColliderIdentities(
  value: unknown,
): readonly RouteOverlayColliderIdentityV1[] {
  const path = "staticColliderIdentities";
  if (!Array.isArray(value)) {
    fail(path, "must be an array");
  }
  let previousColliderSubshapeId: string | undefined;
  return value.map((entry, index) => {
    const entryPath = `${path}/${index}`;
    const record = requireExactRecord(
      entry,
      COLLIDER_IDENTITY_FIELDS,
      entryPath,
    );
    const entityId = requireString(record.entityId, `${entryPath}/entityId`);
    const logicalSubshapeId = requireString(
      record.logicalSubshapeId,
      `${entryPath}/logicalSubshapeId`,
    );
    const colliderSubshapeId = requireString(
      record.colliderSubshapeId,
      `${entryPath}/colliderSubshapeId`,
    );
    if (
      colliderSubshapeId !== deriveColliderSubshapeIdV1(
        entityId,
        logicalSubshapeId,
      )
    ) {
      fail(
        `${entryPath}/colliderSubshapeId`,
        "must match the canonical Entity and logical Subshape identity",
      );
    }
    if (
      !isNil(previousColliderSubshapeId) &&
      colliderSubshapeId <= previousColliderSubshapeId
    ) {
      fail(path, "must be strictly sorted by colliderSubshapeId");
    }
    previousColliderSubshapeId = colliderSubshapeId;
    return {
      entityId,
      logicalSubshapeId,
      colliderSubshapeId,
      colliderHash: requireHash(record.colliderHash, `${entryPath}/colliderHash`),
    };
  });
}

export function canonicalRouteOverlayV2(value: unknown): RouteOverlayV2 {
  const record = requireExactRecord(value, OVERLAY_FIELDS_V2, "");
  if (record.kind !== "route-overlay") {
    fail("kind", "must be 'route-overlay'");
  }
  if (record.schemaVersion !== 2) {
    fail("schemaVersion", "must be 2");
  }

  const routeId = requireString(record.routeId, "routeId");
  const startAnchor = canonicalAnchor(record.startAnchor, "startAnchor");
  const destinationAnchor = canonicalAnchor(
    record.destinationAnchor,
    "destinationAnchor",
  );
  if (startAnchor.entityId === destinationAnchor.entityId) {
    fail("destinationAnchor/entityId", "must differ from startAnchor/entityId");
  }

  const orderedTraversalNodeIds = requireUniqueStringArray(
    record.orderedTraversalNodeIds,
    "orderedTraversalNodeIds",
  );
  if (orderedTraversalNodeIds.length === 0) {
    fail("orderedTraversalNodeIds", "must contain at least one Node id");
  }
  const orderedTraversalEdgeIds = requireUniqueStringArray(
    record.orderedTraversalEdgeIds,
    "orderedTraversalEdgeIds",
  );
  if (orderedTraversalEdgeIds.length !== orderedTraversalNodeIds.length - 1) {
    fail(
      "orderedTraversalEdgeIds",
      "length must equal orderedTraversalNodeIds.length - 1",
    );
  }

  const hardRibbon = canonicalHardRibbon(record.hardRibbon);
  if (hardRibbon.routeId !== routeId) {
    fail("hardRibbon/routeId", "must match routeId");
  }

  return deepFreeze({
    kind: "route-overlay",
    schemaVersion: 2,
    constraintId: requireString(record.constraintId, "constraintId"),
    routeId,
    traversingEntityId: requireString(
      record.traversingEntityId,
      "traversingEntityId",
    ),
    startAnchor,
    destinationAnchor,
    resolvedTraversalLockHash: requireHash(
      record.resolvedTraversalLockHash,
      "resolvedTraversalLockHash",
    ),
    traversalGraphHash: requireHash(
      record.traversalGraphHash,
      "traversalGraphHash",
    ),
    routePathReceiptHash: requireHash(
      record.routePathReceiptHash,
      "routePathReceiptHash",
    ),
    orderedTraversalNodeIds,
    orderedTraversalEdgeIds,
    orderedPathPositionsMetersXYZ: requireDistinctAdjacentVec3Array(
      record.orderedPathPositionsMetersXYZ,
      "orderedPathPositionsMetersXYZ",
    ),
    orderedTraversalSurfaceIdentities: canonicalOrderedOverlayIdentities(
      record.orderedTraversalSurfaceIdentities,
      orderedTraversalNodeIds.length,
    ),
    hardRibbon,
    staticColliderIdentities: canonicalStaticColliderIdentities(
      record.staticColliderIdentities,
    ),
  });
}

export function hashRouteOverlayV2(value: unknown): Sha256Hash {
  return sha256CanonicalJson(canonicalRouteOverlayV2(value)) as Sha256Hash;
}

export function assertRouteOverlayContextV2(
  input: AssertRouteOverlayContextInputV2,
): RouteOverlayV2 {
  if (isNil(input) || !isPlainObject(input)) {
    fail("", "expected a plain object");
  }
  const record = requireExactRecord(
    input,
    ["overlay", "routeConnectivityResult", "buildInputReceipt"],
    "",
  );
  const receipt = assertRouteBuildInputReceiptV2(record.buildInputReceipt);
  const result = assertRouteConnectivityResultForBuildInputV2(
    record.routeConnectivityResult,
    receipt,
  );
  if (result.status !== "complete") {
    fail("", "routeConnectivityResult must be complete");
  }
  const overlay = canonicalRouteOverlayV2(record.overlay);
  const graph = result.traversalGraph;
  const path = result.routePathReceipt;
  if (overlay.constraintId !== path.constraintId) {
    fail("constraintId", "must match the Path Receipt");
  }
  if (overlay.routeId !== path.routeId) {
    fail("routeId", "must match the Path Receipt");
  }
  if (overlay.traversingEntityId !== path.traversingEntityId) {
    fail("traversingEntityId", "must match the Path Receipt");
  }
  if (overlay.resolvedTraversalLockHash !== path.resolvedTraversalLockHash) {
    fail("resolvedTraversalLockHash", "must match the Path Receipt");
  }
  if (overlay.traversalGraphHash !== result.traversalGraphHash) {
    fail("traversalGraphHash", "must match the Connectivity Result");
  }
  if (overlay.routePathReceiptHash !== result.routePathReceiptHash) {
    fail("routePathReceiptHash", "must match the Connectivity Result");
  }
  if (!isEqual(overlay.startAnchor, receipt.input.startAnchor)) {
    fail("startAnchor", "must match Build Input");
  }
  if (!isEqual(overlay.destinationAnchor, receipt.input.destinationAnchor)) {
    fail("destinationAnchor", "must match Build Input");
  }
  if (!isEqual(overlay.hardRibbon, receipt.input.hardRibbon)) {
    fail("hardRibbon", "must match Build Input");
  }
  if (!isEqual(overlay.orderedTraversalNodeIds, path.orderedTraversalNodeIds)) {
    fail("orderedTraversalNodeIds", "must match the Path Receipt");
  }
  if (!isEqual(overlay.orderedTraversalEdgeIds, path.orderedTraversalEdgeIds)) {
    fail("orderedTraversalEdgeIds", "must match the Path Receipt");
  }
  if (
    !isEqual(
      overlay.orderedPathPositionsMetersXYZ,
      path.orderedPathPositionsMetersXYZ,
    )
  ) {
    fail("orderedPathPositionsMetersXYZ", "must match the Path Receipt");
  }
  if (
    !isEqual(
      overlay.orderedTraversalSurfaceIdentities,
      path.orderedTraversalSurfaceIdentities,
    )
  ) {
    fail("orderedTraversalSurfaceIdentities", "must match the Path Receipt");
  }
  overlay.orderedTraversalNodeIds.forEach((nodeId, index) => {
    const node = graph.traversalNodesById[nodeId];
    if (isNil(node)) {
      fail(`orderedTraversalNodeIds/${index}`, `unknown Node '${nodeId}'`);
    }
    const inventory = graph.traversalSurfaceIdentitiesById[node.traversalSurfaceId];
    const identity = overlay.orderedTraversalSurfaceIdentities[index]!;
    if (isNil(inventory) || !isEqual(identity, inventory)) {
      fail(
        `orderedTraversalSurfaceIdentities/${index}`,
        "must equal the Graph inventory row for the Node",
      );
    }
  });
  const expectedColliders = receipt.input.staticColliders.map((row) => ({
    entityId: row.entityId,
    logicalSubshapeId: row.logicalSubshapeId,
    colliderSubshapeId: row.colliderSubshapeId,
    colliderHash: row.colliderHash,
  }));
  if (!isEqual(overlay.staticColliderIdentities, expectedColliders)) {
    fail(
      "staticColliderIdentities",
      "must project every Build Input static collider",
    );
  }
  return overlay;
}
