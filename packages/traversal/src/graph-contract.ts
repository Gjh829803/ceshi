import { sha256CanonicalJson } from "@whitebox-world/protocol";
import { isEmpty, isNil, isPlainObject } from "lodash-es";

import type { RouteBuildInputReceiptV2 } from "./build-input.js";
import {
  resolveTraversalGraphBuilderProfile,
  resolveTraversalGraphBuilderProfileV2,
} from "./profile-registry.js";
import type { TraversalSurfaceIdentityV1 } from "./types.js";

export interface TraversalNodeV1 {
  readonly id: string;
  readonly traversalSurfaceId: string;
  readonly surfaceEntityId: string;
  readonly colliderSubshapeId: string;
  readonly positionMetersXYZ: readonly [number, number, number];
  readonly tileId: string;
  readonly clearanceWidthMeters: number;
  readonly clearanceHeightMeters: number;
}

export interface TraversalEdgeV1 {
  readonly id: string;
  readonly type: "walk" | "slope" | "step";
  readonly fromTraversalNodeId: string;
  readonly toTraversalNodeId: string;
  readonly distanceMeters: number;
  readonly heightDeltaMeters: number;
  readonly stepHeightMeters: number;
  readonly slopeDegrees: number;
  readonly minimumClearanceWidthMeters: number;
  readonly minimumClearanceHeightMeters: number;
  readonly routePathCost: number;
}

export interface TraversalGraphV1 {
  readonly kind: "traversal-graph";
  readonly schemaVersion: 1;
  readonly authoringSpecHash: `sha256:${string}`;
  readonly layoutSolveReportHash: `sha256:${string}`;
  readonly resourceLockHash: `sha256:${string}`;
  readonly terrainArtifactHash: `sha256:${string}`;
  readonly colliderArtifactHash: `sha256:${string}`;
  readonly surfaceArtifactHash: `sha256:${string}`;
  readonly routeBuildInputHash: `sha256:${string}`;
  readonly resolvedTraversalLockHash: `sha256:${string}`;
  readonly graphBuilderProfileRef: string;
  readonly graphBuilderResolvedVersion: string;
  readonly graphBuilderProfileHash: `sha256:${string}`;
  readonly routeId: string;
  readonly startAnchorEntityId: string;
  readonly destinationAnchorEntityId: string;
  readonly traversalNodesById: Readonly<Record<string, TraversalNodeV1>>;
  readonly traversalEdgesById: Readonly<Record<string, TraversalEdgeV1>>;
}

const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;
const EDGE_TYPES = new Set(["walk", "slope", "step"]);

const GRAPH_FIELDS = [
  "kind",
  "schemaVersion",
  "authoringSpecHash",
  "layoutSolveReportHash",
  "resourceLockHash",
  "terrainArtifactHash",
  "colliderArtifactHash",
  "surfaceArtifactHash",
  "routeBuildInputHash",
  "resolvedTraversalLockHash",
  "graphBuilderProfileRef",
  "graphBuilderResolvedVersion",
  "graphBuilderProfileHash",
  "routeId",
  "startAnchorEntityId",
  "destinationAnchorEntityId",
  "traversalNodesById",
  "traversalEdgesById",
] as const;

const NODE_FIELDS = [
  "id",
  "traversalSurfaceId",
  "surfaceEntityId",
  "colliderSubshapeId",
  "positionMetersXYZ",
  "tileId",
  "clearanceWidthMeters",
  "clearanceHeightMeters",
] as const;

const EDGE_FIELDS = [
  "id",
  "type",
  "fromTraversalNodeId",
  "toTraversalNodeId",
  "distanceMeters",
  "heightDeltaMeters",
  "stepHeightMeters",
  "slopeDegrees",
  "minimumClearanceWidthMeters",
  "minimumClearanceHeightMeters",
  "routePathCost",
] as const;

const GRAPH_HASH_FIELDS = [
  "authoringSpecHash",
  "layoutSolveReportHash",
  "resourceLockHash",
  "terrainArtifactHash",
  "colliderArtifactHash",
  "surfaceArtifactHash",
  "routeBuildInputHash",
  "resolvedTraversalLockHash",
  "graphBuilderProfileHash",
] as const;

const GRAPH_STRING_FIELDS = [
  "graphBuilderProfileRef",
  "graphBuilderResolvedVersion",
  "routeId",
  "startAnchorEntityId",
  "destinationAnchorEntityId",
] as const;

function failGraph(message: string): never {
  throw new Error(`TRAVERSAL_GRAPH_INVALID: ${message}`);
}

function failSurface(message: string): never {
  throw new Error(`TRAVERSAL_SURFACE_IDENTITY_INVALID: ${message}`);
}

function compareCanonicalId(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

const SURFACE_IDENTITY_FIELDS = [
  "traversalSurfaceId",
  "surfaceEntityId",
  "colliderSubshapeId",
  "resourceRef",
  "resolvedVersion",
  "resourceHash",
] as const;

export function assertTraversalSurfaceIdentityV1(
  value: unknown,
): TraversalSurfaceIdentityV1 {
  if (isNil(value) || !isPlainObject(value)) {
    failSurface("expected an object.");
  }
  const record = value as Record<string, unknown>;
  rejectUnknownFields(record, SURFACE_IDENTITY_FIELDS, "");
  for (const field of SURFACE_IDENTITY_FIELDS) {
    if (isNil(record[field])) {
      failSurface(`missing field '${field}'.`);
    }
  }
  const traversalSurfaceId = requireNonEmptyString(
    record.traversalSurfaceId,
    "traversalSurfaceId",
  );
  const surfaceEntityId = requireNonEmptyString(
    record.surfaceEntityId,
    "surfaceEntityId",
  );
  const colliderSubshapeId = requireNonEmptyString(
    record.colliderSubshapeId,
    "colliderSubshapeId",
  );
  if (
    traversalSurfaceId === surfaceEntityId ||
    traversalSurfaceId === colliderSubshapeId ||
    surfaceEntityId === colliderSubshapeId
  ) {
    failSurface(
      "traversalSurfaceId, surfaceEntityId, and colliderSubshapeId must be distinct.",
    );
  }
  return {
    traversalSurfaceId,
    surfaceEntityId,
    colliderSubshapeId,
    resourceRef: requireNonEmptyString(record.resourceRef, "resourceRef"),
    resolvedVersion: requireNonEmptyString(record.resolvedVersion, "resolvedVersion"),
    resourceHash: requireHash(record.resourceHash, "resourceHash"),
  };
}

function assertResolvedGraphBuilderIdentity(
  resourceRef: string,
  resolvedVersion: string,
  resourceHash: `sha256:${string}`,
): void {
  const resolved = resolveTraversalGraphBuilderProfile(resourceRef);
  if (
    resolved.resolvedVersion !== resolvedVersion ||
    resolved.contentHash !== resourceHash
  ) {
    failGraph(
      "graphBuilderProfileRef, graphBuilderResolvedVersion, and graphBuilderProfileHash must match the Registry Profile.",
    );
  }
}

function assertResolvedGraphBuilderIdentityV2(
  resourceRef: string,
  resolvedVersion: string,
  resourceHash: `sha256:${string}`,
): void {
  let resolved;
  try {
    resolved = resolveTraversalGraphBuilderProfileV2(resourceRef);
  } catch (cause) {
    failGraph(
      cause instanceof Error
        ? cause.message
        : "graphBuilderProfileRef must resolve to a Registry V2 Profile.",
    );
  }
  if (
    resolved.resolvedVersion !== resolvedVersion ||
    resolved.contentHash !== resourceHash
  ) {
    failGraph(
      "graphBuilderProfileRef, graphBuilderResolvedVersion, and graphBuilderProfileHash must match the Registry V2 Profile.",
    );
  }
}

function rejectUnknownFields(
  record: Record<string, unknown>,
  allowedFields: readonly string[],
  path: string,
): void {
  const allowed = new Set(allowedFields);
  const unknownFields = Object.keys(record).filter((field) => !allowed.has(field));
  if (!isEmpty(unknownFields)) {
    failGraph(`unknown field '${path}${unknownFields[0]}'.`);
  }
}

function requireNonEmptyString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    failGraph(`'${path}' must be a non-empty string.`);
  }
  return value;
}

function requireHash(value: unknown, path: string): `sha256:${string}` {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    failGraph(`'${path}' must be a lowercase sha256 hash.`);
  }
  return value as `sha256:${string}`;
}

function requireFiniteNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    failGraph(`'${path}' must be a finite number.`);
  }
  return Object.is(value, -0) ? 0 : value;
}

function requireNonNegativeMeters(value: unknown, path: string): number {
  const meters = requireFiniteNumber(value, path);
  if (meters < 0) {
    failGraph(`'${path}' must be >= 0.`);
  }
  return meters;
}

function requirePositiveMeters(value: unknown, path: string): number {
  const meters = requireFiniteNumber(value, path);
  if (!(meters > 0)) {
    failGraph(`'${path}' must be > 0.`);
  }
  return meters;
}

function requireSlopeDegrees(value: unknown, path: string): number {
  const degrees = requireFiniteNumber(value, path);
  if (degrees < 0 || degrees > 90) {
    failGraph(`'${path}' must be in [0, 90].`);
  }
  return degrees;
}

function requireMetersTuple(
  value: unknown,
  path: string,
): readonly [number, number, number] {
  if (!Array.isArray(value) || value.length !== 3) {
    failGraph(`'${path}' must be a 3-tuple.`);
  }
  return [
    requireFiniteNumber(value[0], `${path}/0`),
    requireFiniteNumber(value[1], `${path}/1`),
    requireFiniteNumber(value[2], `${path}/2`),
  ];
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

function validateNode(
  value: unknown,
  path: string,
  mapId: string,
): TraversalNodeV1 {
  if (!isPlainObject(value)) {
    failGraph(`'${path}' must be an object.`);
  }
  const record = value as Record<string, unknown>;
  rejectUnknownFields(record, NODE_FIELDS, `${path}/`);
  const id = requireNonEmptyString(record.id, `${path}/id`);
  if (id !== mapId) {
    failGraph(`'${path}/id' must match map key '${mapId}'.`);
  }
  const traversalSurfaceId = requireNonEmptyString(
    record.traversalSurfaceId,
    `${path}/traversalSurfaceId`,
  );
  const surfaceEntityId = requireNonEmptyString(
    record.surfaceEntityId,
    `${path}/surfaceEntityId`,
  );
  const colliderSubshapeId = requireNonEmptyString(
    record.colliderSubshapeId,
    `${path}/colliderSubshapeId`,
  );
  if (
    traversalSurfaceId === surfaceEntityId ||
    traversalSurfaceId === colliderSubshapeId ||
    surfaceEntityId === colliderSubshapeId
  ) {
    failGraph(
      `'${path}' must keep traversalSurfaceId, surfaceEntityId, and colliderSubshapeId distinct.`,
    );
  }
  return {
    id,
    traversalSurfaceId,
    surfaceEntityId,
    colliderSubshapeId,
    positionMetersXYZ: requireMetersTuple(
      record.positionMetersXYZ,
      `${path}/positionMetersXYZ`,
    ),
    tileId: requireNonEmptyString(record.tileId, `${path}/tileId`),
    clearanceWidthMeters: requirePositiveMeters(
      record.clearanceWidthMeters,
      `${path}/clearanceWidthMeters`,
    ),
    clearanceHeightMeters: requirePositiveMeters(
      record.clearanceHeightMeters,
      `${path}/clearanceHeightMeters`,
    ),
  };
}

function validateEdge(
  value: unknown,
  path: string,
  mapId: string,
  nodeIds: ReadonlySet<string>,
): TraversalEdgeV1 {
  if (!isPlainObject(value)) {
    failGraph(`'${path}' must be an object.`);
  }
  const record = value as Record<string, unknown>;
  rejectUnknownFields(record, EDGE_FIELDS, `${path}/`);
  const id = requireNonEmptyString(record.id, `${path}/id`);
  if (id !== mapId) {
    failGraph(`'${path}/id' must match map key '${mapId}'.`);
  }
  if (typeof record.type !== "string" || !EDGE_TYPES.has(record.type)) {
    failGraph(`'${path}/type' must be walk, slope, or step.`);
  }
  const fromTraversalNodeId = requireNonEmptyString(
    record.fromTraversalNodeId,
    `${path}/fromTraversalNodeId`,
  );
  const toTraversalNodeId = requireNonEmptyString(
    record.toTraversalNodeId,
    `${path}/toTraversalNodeId`,
  );
  if (!nodeIds.has(fromTraversalNodeId) || !nodeIds.has(toTraversalNodeId)) {
    failGraph(`'${path}' references an unknown Traversal Node.`);
  }
  const routePathCost = requireFiniteNumber(
    record.routePathCost,
    `${path}/routePathCost`,
  );
  if (routePathCost < 0) {
    failGraph(`'${path}/routePathCost' must be a non-negative dimensionless cost.`);
  }
  const stepHeightMeters = requireNonNegativeMeters(
    record.stepHeightMeters,
    `${path}/stepHeightMeters`,
  );
  const slopeDegrees = requireSlopeDegrees(
    record.slopeDegrees,
    `${path}/slopeDegrees`,
  );
  const expectedType: TraversalEdgeV1["type"] = stepHeightMeters > 0
    ? "step"
    : slopeDegrees > 0
    ? "slope"
    : "walk";
  if (record.type !== expectedType) {
    failGraph(
      `'${path}/type' must be '${expectedType}' for its step and slope evidence.`,
    );
  }
  return {
    id,
    type: record.type as TraversalEdgeV1["type"],
    fromTraversalNodeId,
    toTraversalNodeId,
    distanceMeters: requireNonNegativeMeters(
      record.distanceMeters,
      `${path}/distanceMeters`,
    ),
    heightDeltaMeters: requireFiniteNumber(
      record.heightDeltaMeters,
      `${path}/heightDeltaMeters`,
    ),
    stepHeightMeters,
    slopeDegrees,
    minimumClearanceWidthMeters: requirePositiveMeters(
      record.minimumClearanceWidthMeters,
      `${path}/minimumClearanceWidthMeters`,
    ),
    minimumClearanceHeightMeters: requirePositiveMeters(
      record.minimumClearanceHeightMeters,
      `${path}/minimumClearanceHeightMeters`,
    ),
    routePathCost,
  };
}

export function canonicalTraversalGraphV1(value: unknown): TraversalGraphV1 {
  if (isNil(value) || !isPlainObject(value)) {
    failGraph("expected an object.");
  }
  const record = value as Record<string, unknown>;
  rejectUnknownFields(record, GRAPH_FIELDS, "");
  for (const field of GRAPH_FIELDS) {
    if (isNil(record[field])) {
      failGraph(`missing field '${field}'.`);
    }
  }
  if (record.kind !== "traversal-graph") {
    failGraph("kind must be 'traversal-graph'.");
  }
  if (record.schemaVersion !== 1) {
    failGraph("schemaVersion must be 1.");
  }

  const hashes = Object.fromEntries(
    GRAPH_HASH_FIELDS.map((field) => [field, requireHash(record[field], field)]),
  ) as Pick<TraversalGraphV1, (typeof GRAPH_HASH_FIELDS)[number]>;
  const strings = Object.fromEntries(
    GRAPH_STRING_FIELDS.map((field) => [
      field,
      requireNonEmptyString(record[field], field),
    ]),
  ) as Pick<TraversalGraphV1, (typeof GRAPH_STRING_FIELDS)[number]>;
  assertResolvedGraphBuilderIdentity(
    strings.graphBuilderProfileRef,
    strings.graphBuilderResolvedVersion,
    hashes.graphBuilderProfileHash,
  );

  if (!isPlainObject(record.traversalNodesById)) {
    failGraph("'traversalNodesById' must be an object.");
  }
  if (!isPlainObject(record.traversalEdgesById)) {
    failGraph("'traversalEdgesById' must be an object.");
  }

  const traversalNodesById: Record<string, TraversalNodeV1> = {};
  for (const [nodeId, node] of Object.entries(
    record.traversalNodesById as Record<string, unknown>,
  ).sort(([left], [right]) => compareCanonicalId(left, right))) {
    traversalNodesById[nodeId] = validateNode(
      node,
      `traversalNodesById/${nodeId}`,
      nodeId,
    );
  }
  if (isEmpty(traversalNodesById)) {
    failGraph("a Traversal Graph must contain at least one Node.");
  }

  const nodeIds = new Set(Object.keys(traversalNodesById));
  const traversalEdgesById: Record<string, TraversalEdgeV1> = {};
  for (const [edgeId, edge] of Object.entries(
    record.traversalEdgesById as Record<string, unknown>,
  ).sort(([left], [right]) => compareCanonicalId(left, right))) {
    traversalEdgesById[edgeId] = validateEdge(
      edge,
      `traversalEdgesById/${edgeId}`,
      edgeId,
      nodeIds,
    );
  }

  return deepFreeze({
    kind: "traversal-graph",
    schemaVersion: 1,
    ...hashes,
    ...strings,
    traversalNodesById,
    traversalEdgesById,
  });
}

export function hashTraversalGraphV1(value: unknown): `sha256:${string}` {
  return sha256CanonicalJson(canonicalTraversalGraphV1(value)) as `sha256:${string}`;
}

const GRAPH_FIELDS_V2 = [
  ...GRAPH_FIELDS.filter((field) => field !== "schemaVersion"),
  "schemaVersion",
  "geometryArtifactHash",
  "traversalSurfaceIdentitiesById",
] as const;

function identitiesEqual(
  left: TraversalSurfaceIdentityV1,
  right: TraversalSurfaceIdentityV1,
): boolean {
  return sha256CanonicalJson(left) === sha256CanonicalJson(right);
}

function canonicalInventory(
  value: unknown,
): Readonly<Record<string, TraversalSurfaceIdentityV1>> {
  if (isNil(value) || !isPlainObject(value)) {
    failGraph("'traversalSurfaceIdentitiesById' must be an object.");
  }
  const record = value as Record<string, unknown>;
  const inventory: Record<string, TraversalSurfaceIdentityV1> = {};
  for (const [key, candidate] of Object.entries(record).sort(([left], [right]) =>
    compareCanonicalId(left, right)
  )) {
    let identity: TraversalSurfaceIdentityV1;
    try {
      identity = assertTraversalSurfaceIdentityV1(candidate);
    } catch (cause) {
      failGraph(
        `'traversalSurfaceIdentitiesById/${key}' must be a canonical Traversal Surface identity${
          cause instanceof Error ? `: ${cause.message}` : "."
        }`,
      );
    }
    if (identity.traversalSurfaceId !== key) {
      failGraph(
        `'traversalSurfaceIdentitiesById/${key}' key must equal value.traversalSurfaceId.`,
      );
    }
    inventory[key] = identity;
  }
  if (isEmpty(inventory)) {
    failGraph("'traversalSurfaceIdentitiesById' must contain at least one identity.");
  }
  return inventory;
}

export interface TraversalGraphV2 extends Omit<TraversalGraphV1, "schemaVersion"> {
  readonly schemaVersion: 2;
  readonly geometryArtifactHash: `sha256:${string}`;
  readonly traversalSurfaceIdentitiesById: Readonly<
    Record<string, TraversalSurfaceIdentityV1>
  >;
}

export function canonicalTraversalGraphV2(value: unknown): TraversalGraphV2 {
  if (isNil(value) || !isPlainObject(value)) {
    failGraph("expected an object.");
  }
  const record = value as Record<string, unknown>;
  rejectUnknownFields(record, GRAPH_FIELDS_V2, "");
  for (const field of GRAPH_FIELDS_V2) {
    if (isNil(record[field])) {
      failGraph(`missing field '${field}'.`);
    }
  }
  if (record.kind !== "traversal-graph") {
    failGraph("kind must be 'traversal-graph'.");
  }
  if (record.schemaVersion !== 2) {
    failGraph("schemaVersion must be 2.");
  }

  const hashes = Object.fromEntries(
    [...GRAPH_HASH_FIELDS, "geometryArtifactHash"].map((field) => [
      field,
      requireHash(record[field], field),
    ]),
  ) as Pick<TraversalGraphV2, (typeof GRAPH_HASH_FIELDS)[number] | "geometryArtifactHash">;
  const strings = Object.fromEntries(
    GRAPH_STRING_FIELDS.map((field) => [
      field,
      requireNonEmptyString(record[field], field),
    ]),
  ) as Pick<TraversalGraphV2, (typeof GRAPH_STRING_FIELDS)[number]>;
  assertResolvedGraphBuilderIdentityV2(
    strings.graphBuilderProfileRef,
    strings.graphBuilderResolvedVersion,
    hashes.graphBuilderProfileHash,
  );

  const traversalSurfaceIdentitiesById = canonicalInventory(
    record.traversalSurfaceIdentitiesById,
  );
  if (!isPlainObject(record.traversalNodesById)) {
    failGraph("'traversalNodesById' must be an object.");
  }
  if (!isPlainObject(record.traversalEdgesById)) {
    failGraph("'traversalEdgesById' must be an object.");
  }

  const traversalNodesById: Record<string, TraversalNodeV1> = {};
  for (const [nodeId, node] of Object.entries(
    record.traversalNodesById as Record<string, unknown>,
  ).sort(([left], [right]) => compareCanonicalId(left, right))) {
    const canonicalNode = validateNode(
      node,
      `traversalNodesById/${nodeId}`,
      nodeId,
    );
    const identity = traversalSurfaceIdentitiesById[canonicalNode.traversalSurfaceId];
    if (isNil(identity)) {
      failGraph(
        `'traversalNodesById/${nodeId}' Traversal Surface is absent from inventory.`,
      );
    }
    if (
      identity.surfaceEntityId !== canonicalNode.surfaceEntityId ||
      identity.colliderSubshapeId !== canonicalNode.colliderSubshapeId
    ) {
      failGraph(
        `'traversalNodesById/${nodeId}' Surface triple must match inventory.`,
      );
    }
    traversalNodesById[nodeId] = canonicalNode;
  }
  if (isEmpty(traversalNodesById)) {
    failGraph("a Traversal Graph must contain at least one Node.");
  }

  const nodeIds = new Set(Object.keys(traversalNodesById));
  const traversalEdgesById: Record<string, TraversalEdgeV1> = {};
  for (const [edgeId, edge] of Object.entries(
    record.traversalEdgesById as Record<string, unknown>,
  ).sort(([left], [right]) => compareCanonicalId(left, right))) {
    traversalEdgesById[edgeId] = validateEdge(
      edge,
      `traversalEdgesById/${edgeId}`,
      edgeId,
      nodeIds,
    );
  }

  return deepFreeze({
    kind: "traversal-graph",
    schemaVersion: 2,
    ...hashes,
    ...strings,
    traversalSurfaceIdentitiesById,
    traversalNodesById,
    traversalEdgesById,
  });
}

export function hashTraversalGraphV2(value: unknown): `sha256:${string}` {
  return sha256CanonicalJson(canonicalTraversalGraphV2(value)) as `sha256:${string}`;
}

export function assertTraversalGraphForBuildInputV2(
  value: unknown,
  buildInputReceipt: Pick<RouteBuildInputReceiptV2, "input" | "routeBuildInputHash">,
): TraversalGraphV2 {
  const graph = canonicalTraversalGraphV2(value);
  const input = buildInputReceipt.input;
  const expectedBindings = {
    authoringSpecHash: input.authoringSpecHash,
    layoutSolveReportHash: input.layoutSolveReportHash,
    resourceLockHash: input.resourceLockHash,
    terrainArtifactHash: input.terrainArtifactHash,
    colliderArtifactHash: input.colliderArtifactHash,
    geometryArtifactHash: input.geometryArtifactHash,
    surfaceArtifactHash: input.surfaceArtifactHash,
    routeBuildInputHash: buildInputReceipt.routeBuildInputHash,
    resolvedTraversalLockHash: input.capabilityEnvelope.resolvedTraversalLockHash,
    graphBuilderProfileRef: input.capabilityEnvelope.graphBuilderProfileRef,
    graphBuilderResolvedVersion:
      input.capabilityEnvelope.graphBuilderResolvedVersion,
    graphBuilderProfileHash: input.capabilityEnvelope.graphBuilderProfileHash,
    routeId: input.connectivityRequirement.routeId,
    startAnchorEntityId: input.startAnchor.entityId,
    destinationAnchorEntityId: input.destinationAnchor.entityId,
  } as const;
  for (const [field, expected] of Object.entries(expectedBindings)) {
    if (graph[field as keyof typeof expectedBindings] !== expected) {
      failGraph(`${field} must equal Build Input.`);
    }
  }
  const expectedInventory = canonicalInventory(
    Object.fromEntries(
      input.traversalSurfaces.map((surface) => [surface.traversalSurfaceId, surface]),
    ),
  );
  if (sha256CanonicalJson(graph.traversalSurfaceIdentitiesById) !==
    sha256CanonicalJson(expectedInventory)
  ) {
    failGraph("traversalSurfaceIdentitiesById must project Build Input Surfaces.");
  }
  for (const node of Object.values(graph.traversalNodesById)) {
    const identity = expectedInventory[node.traversalSurfaceId];
    if (isNil(identity)) {
      failGraph(`Node '${node.id}' Traversal Surface is absent from Build Input.`);
    }
    if (
      identity.surfaceEntityId !== node.surfaceEntityId ||
      identity.colliderSubshapeId !== node.colliderSubshapeId
    ) {
      failGraph(`Node '${node.id}' Surface triple must match Build Input inventory.`);
    }
  }
  return graph;
}
