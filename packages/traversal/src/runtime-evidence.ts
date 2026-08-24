import { isNil, isPlainObject } from "lodash-es";

import type {
  TraversalGraphV2,
} from "./graph-contract.js";
import type {
  TraversalRuntimeImplementationIdentityV1,
  TraversalSurfaceIdentityV1,
} from "./types.js";

type Sha256Hash = `sha256:${string}`;
type Vec3 = readonly [number, number, number];
type UnknownRecord = Record<string, unknown>;

export type CharacterSupportStateV1 =
  | "supported"
  | "sliding"
  | "unsupported";

export type CharacterSupportSurfaceResolutionV1 =
  | Readonly<{
      mode: "resolved";
      traversalSurfaceId: string;
      surfaceEntityId: string;
      colliderSubshapeId: string;
      resourceRef: string;
      resolvedVersion: string;
      resourceHash: Sha256Hash;
    }>
  | Readonly<{
      mode: "unsupported" | "unmatched" | "ambiguous";
    }>;

export interface CharacterSupportEvidenceV1 {
  readonly kind: "character-support-evidence";
  readonly schemaVersion: 1;
  readonly supportState: CharacterSupportStateV1;
  readonly supportNormalWorldXYZ: Vec3;
  readonly sampledFootPositionMetersXYZ: Vec3;
  readonly isSupportSurfaceDynamic: boolean;
  readonly surfaceResolution: CharacterSupportSurfaceResolutionV1;
}

export interface TraversalRuntimeWorldIdentityV1 {
  readonly authoringSpecHash: Sha256Hash;
  readonly layoutSolveReportHash: Sha256Hash;
  readonly resourceLockHash: Sha256Hash;
  readonly executionPlanHash: Sha256Hash;
}

export interface TraversalRuntimeTickEvidenceV1
  extends TraversalRuntimeWorldIdentityV1 {
  readonly kind: "traversal-runtime-tick-evidence";
  readonly schemaVersion: 1;
  readonly tick: number;
  readonly traversingEntityId: string;
  readonly resolvedTraversalLockHash: Sha256Hash;
  readonly runtimeImplementationIdentity: TraversalRuntimeImplementationIdentityV1;
  readonly fixedTimeStepSeconds: number;
  readonly subjectPositionMetersXYZ: Vec3;
  readonly velocityMetersPerSecondXYZ: Vec3;
  readonly movementMedium: "ground" | "air";
  readonly locomotionMode: "idle" | "walk" | "run" | "airborne";
  readonly characterSupport: CharacterSupportEvidenceV1;
}

export interface TraversalRuntimePortV1 extends TraversalRuntimeWorldIdentityV1 {
  readonly kind: "traversal-runtime-port";
  readonly schemaVersion: 1;
  readonly traversingEntityId: string;
  readonly resolvedTraversalLockHash: Sha256Hash;
  readonly runtimeImplementationIdentity: TraversalRuntimeImplementationIdentityV1;
  readLatestTickEvidence(): TraversalRuntimeTickEvidenceV1;
  resetToStartAnchor(request: Readonly<{
    startAnchorEntityId: string;
  }>): TraversalRuntimeTickEvidenceV1;
  runFixedTick(request: Readonly<{
    walkDirectionWorldXZ: readonly [number, number];
  }>): Promise<TraversalRuntimeTickEvidenceV1>;
}

export type TraversalRuntimeErrorCodeV1 =
  | "TRAVERSAL_RUNTIME_EVIDENCE_INVALID"
  | "TRAVERSAL_RUNTIME_PLAN_NOT_V5"
  | "TRAVERSAL_RUNTIME_LOCK_MISMATCH"
  | "TRAVERSAL_RUNTIME_WORLD_IDENTITY_MISMATCH"
  | "TRAVERSAL_RUNTIME_LIVE_LOCK_MISMATCH"
  | "TRAVERSAL_RUNTIME_NOT_CONTROLLED"
  | "TRAVERSAL_RUNTIME_START_ANCHOR_INVALID"
  | "TRAVERSAL_RUNTIME_WALK_DIRECTION_INVALID"
  | "TRAVERSAL_RUNTIME_EVIDENCE_UNAVAILABLE"
  | "TRAVERSAL_RUNTIME_UNAVAILABLE";

export class TraversalRuntimeErrorV1 extends Error {
  public readonly code: TraversalRuntimeErrorCodeV1;

  public constructor(code: TraversalRuntimeErrorCodeV1) {
    super(code);
    this.name = "TraversalRuntimeErrorV1";
    this.code = code;
  }
}

const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;
const SUPPORT_EVIDENCE_FIELDS = [
  "kind",
  "schemaVersion",
  "supportState",
  "supportNormalWorldXYZ",
  "sampledFootPositionMetersXYZ",
  "isSupportSurfaceDynamic",
  "surfaceResolution",
] as const;
const UNRESOLVED_SURFACE_FIELDS = ["mode"] as const;
const RESOLVED_SURFACE_FIELDS = [
  "mode",
  "traversalSurfaceId",
  "surfaceEntityId",
  "colliderSubshapeId",
  "resourceRef",
  "resolvedVersion",
  "resourceHash",
] as const;
const RUNTIME_IDENTITY_FIELDS = [
  "runtimeBackendRef",
  "runtimeBackendResolvedVersion",
  "runtimeBackendHash",
  "runtimeAdapterRef",
  "runtimeAdapterResolvedVersion",
  "runtimeAdapterHash",
] as const;
const TICK_EVIDENCE_FIELDS = [
  "kind",
  "schemaVersion",
  "tick",
  "traversingEntityId",
  "authoringSpecHash",
  "layoutSolveReportHash",
  "resourceLockHash",
  "executionPlanHash",
  "resolvedTraversalLockHash",
  "runtimeImplementationIdentity",
  "fixedTimeStepSeconds",
  "subjectPositionMetersXYZ",
  "velocityMetersPerSecondXYZ",
  "movementMedium",
  "locomotionMode",
  "characterSupport",
] as const;

function fail(_path: string, _message: string): never {
  throw new TraversalRuntimeErrorV1("TRAVERSAL_RUNTIME_EVIDENCE_INVALID");
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
  const result = requireFinite(value, path);
  if (!(result > 0)) {
    fail(path, "must be > 0");
  }
  return result;
}

function requireNonNegativeInteger(value: unknown, path: string): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    fail(path, "must be a non-negative safe integer");
  }
  return value;
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

function deepFreeze<T>(value: T): T {
  if (isNil(value) || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child);
  }
  return Object.freeze(value);
}

function canonicalRuntimeImplementationIdentityV1(
  value: unknown,
): TraversalRuntimeImplementationIdentityV1 {
  const record = requireExactRecord(
    value,
    RUNTIME_IDENTITY_FIELDS,
    "runtimeImplementationIdentity",
  );
  return {
    runtimeBackendRef: requireString(
      record.runtimeBackendRef,
      "runtimeImplementationIdentity/runtimeBackendRef",
    ),
    runtimeBackendResolvedVersion: requireString(
      record.runtimeBackendResolvedVersion,
      "runtimeImplementationIdentity/runtimeBackendResolvedVersion",
    ),
    runtimeBackendHash: requireHash(
      record.runtimeBackendHash,
      "runtimeImplementationIdentity/runtimeBackendHash",
    ),
    runtimeAdapterRef: requireString(
      record.runtimeAdapterRef,
      "runtimeImplementationIdentity/runtimeAdapterRef",
    ),
    runtimeAdapterResolvedVersion: requireString(
      record.runtimeAdapterResolvedVersion,
      "runtimeImplementationIdentity/runtimeAdapterResolvedVersion",
    ),
    runtimeAdapterHash: requireHash(
      record.runtimeAdapterHash,
      "runtimeImplementationIdentity/runtimeAdapterHash",
    ),
  };
}

function canonicalSurfaceResolutionV1(
  value: unknown,
): CharacterSupportSurfaceResolutionV1 {
  const base = requireRecord(value, "surfaceResolution");
  if (base.mode === "resolved") {
    const record = requireExactRecord(
      base,
      RESOLVED_SURFACE_FIELDS,
      "surfaceResolution",
    );
    return {
      mode: "resolved",
      traversalSurfaceId: requireString(
        record.traversalSurfaceId,
        "surfaceResolution/traversalSurfaceId",
      ),
      surfaceEntityId: requireString(
        record.surfaceEntityId,
        "surfaceResolution/surfaceEntityId",
      ),
      colliderSubshapeId: requireString(
        record.colliderSubshapeId,
        "surfaceResolution/colliderSubshapeId",
      ),
      resourceRef: requireString(
        record.resourceRef,
        "surfaceResolution/resourceRef",
      ),
      resolvedVersion: requireString(
        record.resolvedVersion,
        "surfaceResolution/resolvedVersion",
      ),
      resourceHash: requireHash(
        record.resourceHash,
        "surfaceResolution/resourceHash",
      ),
    };
  }
  if (
    base.mode !== "unsupported" &&
    base.mode !== "unmatched" &&
    base.mode !== "ambiguous"
  ) {
    fail("surfaceResolution/mode", "must be a supported closed mode");
  }
  requireExactRecord(base, UNRESOLVED_SURFACE_FIELDS, "surfaceResolution");
  return { mode: base.mode };
}

export function canonicalCharacterSupportEvidenceV1(
  value: unknown,
): CharacterSupportEvidenceV1 {
  const record = requireExactRecord(value, SUPPORT_EVIDENCE_FIELDS, "");
  if (record.kind !== "character-support-evidence") {
    fail("kind", "must be 'character-support-evidence'");
  }
  if (record.schemaVersion !== 1) {
    fail("schemaVersion", "must be 1");
  }
  if (
    record.supportState !== "supported" &&
    record.supportState !== "sliding" &&
    record.supportState !== "unsupported"
  ) {
    fail("supportState", "must be a supported closed state");
  }
  if (typeof record.isSupportSurfaceDynamic !== "boolean") {
    fail("isSupportSurfaceDynamic", "must be boolean");
  }

  const surfaceResolution = canonicalSurfaceResolutionV1(
    record.surfaceResolution,
  );
  if (
    record.supportState === "unsupported" &&
    surfaceResolution.mode !== "unsupported"
  ) {
    fail("surfaceResolution/mode", "unsupported support requires unsupported resolution");
  }
  if (
    record.supportState !== "unsupported" &&
    surfaceResolution.mode === "unsupported"
  ) {
    fail("surfaceResolution/mode", "supported or sliding support cannot be unsupported");
  }
  if (record.isSupportSurfaceDynamic && surfaceResolution.mode === "resolved") {
    fail("surfaceResolution/mode", "dynamic support cannot resolve a static R1 surface");
  }

  return deepFreeze({
    kind: "character-support-evidence",
    schemaVersion: 1,
    supportState: record.supportState,
    supportNormalWorldXYZ: requireVec3(
      record.supportNormalWorldXYZ,
      "supportNormalWorldXYZ",
    ),
    sampledFootPositionMetersXYZ: requireVec3(
      record.sampledFootPositionMetersXYZ,
      "sampledFootPositionMetersXYZ",
    ),
    isSupportSurfaceDynamic: record.isSupportSurfaceDynamic,
    surfaceResolution,
  });
}

export function canonicalTraversalRuntimeTickEvidenceV1(
  value: unknown,
): TraversalRuntimeTickEvidenceV1 {
  const record = requireExactRecord(value, TICK_EVIDENCE_FIELDS, "");
  if (record.kind !== "traversal-runtime-tick-evidence") {
    fail("kind", "must be 'traversal-runtime-tick-evidence'");
  }
  if (record.schemaVersion !== 1) {
    fail("schemaVersion", "must be 1");
  }
  if (record.movementMedium !== "ground" && record.movementMedium !== "air") {
    fail("movementMedium", "must be 'ground' or 'air'");
  }
  if (
    record.locomotionMode !== "idle" &&
    record.locomotionMode !== "walk" &&
    record.locomotionMode !== "run" &&
    record.locomotionMode !== "airborne"
  ) {
    fail("locomotionMode", "must be a supported closed mode");
  }

  const characterSupport = canonicalCharacterSupportEvidenceV1(
    record.characterSupport,
  );
  if (
    characterSupport.supportState === "unsupported" &&
    (record.movementMedium !== "air" || record.locomotionMode !== "airborne")
  ) {
    fail(
      "characterSupport/supportState",
      "unsupported requires air and airborne",
    );
  }
  if (
    characterSupport.supportState !== "unsupported" &&
    (record.movementMedium !== "ground" || record.locomotionMode === "airborne")
  ) {
    fail(
      "characterSupport/supportState",
      "supported or sliding requires ground and a grounded locomotion mode",
    );
  }

  return deepFreeze({
    kind: "traversal-runtime-tick-evidence",
    schemaVersion: 1,
    tick: requireNonNegativeInteger(record.tick, "tick"),
    traversingEntityId: requireString(
      record.traversingEntityId,
      "traversingEntityId",
    ),
    authoringSpecHash: requireHash(
      record.authoringSpecHash,
      "authoringSpecHash",
    ),
    layoutSolveReportHash: requireHash(
      record.layoutSolveReportHash,
      "layoutSolveReportHash",
    ),
    resourceLockHash: requireHash(
      record.resourceLockHash,
      "resourceLockHash",
    ),
    executionPlanHash: requireHash(
      record.executionPlanHash,
      "executionPlanHash",
    ),
    resolvedTraversalLockHash: requireHash(
      record.resolvedTraversalLockHash,
      "resolvedTraversalLockHash",
    ),
    runtimeImplementationIdentity: canonicalRuntimeImplementationIdentityV1(
      record.runtimeImplementationIdentity,
    ),
    fixedTimeStepSeconds: requirePositive(
      record.fixedTimeStepSeconds,
      "fixedTimeStepSeconds",
    ),
    subjectPositionMetersXYZ: requireVec3(
      record.subjectPositionMetersXYZ,
      "subjectPositionMetersXYZ",
    ),
    velocityMetersPerSecondXYZ: requireVec3(
      record.velocityMetersPerSecondXYZ,
      "velocityMetersPerSecondXYZ",
    ),
    movementMedium: record.movementMedium,
    locomotionMode: record.locomotionMode,
    characterSupport,
  });
}

export function assertTraversalRuntimeWorldIdentityMatchesGraphV1(
  input: Readonly<{
    traversalGraph: Pick<
      TraversalGraphV2,
      "authoringSpecHash" | "layoutSolveReportHash" | "resourceLockHash"
    >;
    runtimeWorldIdentity: TraversalRuntimeWorldIdentityV1;
  }>,
): void {
  if (
    input.traversalGraph.authoringSpecHash !==
      input.runtimeWorldIdentity.authoringSpecHash ||
    input.traversalGraph.layoutSolveReportHash !==
      input.runtimeWorldIdentity.layoutSolveReportHash ||
    input.traversalGraph.resourceLockHash !==
      input.runtimeWorldIdentity.resourceLockHash
  ) {
    throw new TraversalRuntimeErrorV1(
      "TRAVERSAL_RUNTIME_WORLD_IDENTITY_MISMATCH",
    );
  }
}

export type {
  TraversalRuntimeImplementationIdentityV1,
  TraversalSurfaceIdentityV1,
};
