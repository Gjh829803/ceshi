import {
  canonicalJsonBytes,
  sha256CanonicalJson,
  type Sha256HashV1,
} from "@whitebox-world/protocol";
import { isEmpty, isNil } from "lodash-es";

import { parseWorldRuntimeSnapshotV4 } from "./runtime-session-protocol.js";
import {
  parseFixedInputV1,
  type FixedInputV1,
  type WorldRuntimeSnapshotV4,
} from "./runtime-session.js";

export const FORMAL_WORLD_CAPTURE_VIEW_IDS_V1 = Object.freeze([
  "opening",
  "world-side",
  "world-top-down",
] as const);

export type FormalWorldCaptureViewIdV1 =
  (typeof FORMAL_WORLD_CAPTURE_VIEW_IDS_V1)[number];

export const FORMAL_WORLD_CAPTURE_SDK_OWNER_IDS_V1 = Object.freeze([
  "action",
  "camera",
  "input",
  "physics",
  "subject",
] as const);

export type FormalWorldCaptureSdkOwnerIdV1 =
  (typeof FORMAL_WORLD_CAPTURE_SDK_OWNER_IDS_V1)[number];

export const FORMAL_SEMANTIC_CAPTURE_PROJECTED_BOUNDS_SOURCE_V1 =
  "checked-layout-visual-group" as const;

export type FormalWorldCaptureLifecycleOutcomeV1 = "completed" | "failed";

export interface FormalWorldBoundsMetersV1 {
  readonly minimumMetersXYZ: readonly [number, number, number];
  readonly maximumMetersXYZ: readonly [number, number, number];
}

export type FormalTraversalCheckpointSpatialCriterionV1 =
  | Readonly<{
      kind: "reach-bounds";
      checkpointId: string;
      expectation: "reach";
      sourceVisualGroupId: string;
      sourceBoundsMeters: FormalWorldBoundsMetersV1;
      capsuleRadiusMeters: number;
      toleranceMeters: number;
    }>
  | Readonly<{
      kind: "pass-plane";
      checkpointId: string;
      expectation: "pass";
      sourceVisualGroupId: string;
      sourceBoundsMeters: FormalWorldBoundsMetersV1;
      axis: "x" | "y" | "z";
      sourceFace: "minimum" | "maximum";
      planeMeters: number;
      expectedCenterSide: "negative" | "positive";
      capsuleRadiusMeters: number;
      toleranceMeters: number;
    }>
  | Readonly<{
      kind: "block-plane";
      checkpointId: string;
      expectation: "block";
      sourceVisualGroupId: string;
      sourceBoundsMeters: FormalWorldBoundsMetersV1;
      colliderId: string;
      axis: "x" | "y" | "z";
      sourceFace: "minimum" | "maximum";
      planeMeters: number;
      expectedCenterSide: "negative" | "positive";
      capsuleRadiusMeters: number;
      toleranceMeters: number;
    }>;

export type FormalArtifactViewRequestV1 =
  | Readonly<{
      kind: "formal-artifact-view-request";
      schemaVersion: 1;
      viewId: "opening";
      projection: "perspective";
      widthPixels: number;
      heightPixels: number;
      devicePixelRatio: number;
    }>
  | Readonly<{
      kind: "formal-artifact-view-request";
      schemaVersion: 1;
      viewId: "world-side";
      projection: "orthographic";
      widthPixels: number;
      heightPixels: number;
      devicePixelRatio: number;
      worldBoundsMeters: FormalWorldBoundsMetersV1;
      cameraPositionMetersXYZ: readonly [number, number, number];
      targetMetersXYZ: readonly [number, number, number];
    }>
  | Readonly<{
      kind: "formal-artifact-view-request";
      schemaVersion: 1;
      viewId: "world-top-down";
      projection: "orthographic";
      widthPixels: number;
      heightPixels: number;
      devicePixelRatio: number;
      worldBoundsMeters: FormalWorldBoundsMetersV1;
      cameraPositionMetersXYZ: readonly [number, number, number];
      targetMetersXYZ: readonly [number, number, number];
    }>;

export interface FormalSemanticCaptureTargetBindingV1 {
  readonly acceptanceTargetRef: string;
  readonly blockVisualGroupId: string;
  readonly semanticClassId: string;
  readonly identityColor: `#${string}`;
  readonly projectedBoundsSource: typeof FORMAL_SEMANTIC_CAPTURE_PROJECTED_BOUNDS_SOURCE_V1;
  readonly requiredWorldViewIds: readonly [
    "opening",
    "world-side",
    "world-top-down",
  ];
  readonly authoringManifestHash: Sha256HashV1;
  readonly layoutInventoryHash: Sha256HashV1;
  readonly contributionHash: Sha256HashV1;
}

export interface FormalSemanticTraversalCheckBindingV1 {
  readonly traversalCheckId: string;
  readonly acceptanceTargetRef: string;
  readonly checkExpectation: "pass" | "block";
  readonly fixedInputSequenceHash: Sha256HashV1;
  readonly checkpointCriteria: readonly FormalTraversalCheckpointSpatialCriterionV1[];
}

export interface FormalSemanticCaptureMapV1 {
  readonly kind: "formal-semantic-capture-map";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly caseRef: string;
  readonly caseHash: Sha256HashV1;
  readonly authoringManifestHash: Sha256HashV1;
  readonly layoutInventoryHash: Sha256HashV1;
  readonly contributionHash: Sha256HashV1;
  readonly bindings: readonly FormalSemanticCaptureTargetBindingV1[];
  readonly traversalCheckBindings: readonly FormalSemanticTraversalCheckBindingV1[];
}

export interface FormalColliderOverlayRequestV1 {
  readonly kind: "formal-collider-overlay-request";
  readonly schemaVersion: 1;
  readonly isRequired: true;
  readonly contributionHash: Sha256HashV1;
}

export interface FormalScriptedTraversalCheckRequestV1 {
  readonly id: string;
  readonly acceptanceTargetRef: string;
  readonly checkExpectation: "pass" | "block";
  readonly fixedInputSequence: readonly FixedInputV1[];
  readonly fixedInputSequenceHash: Sha256HashV1;
  readonly checkpointCriteria: readonly FormalTraversalCheckpointSpatialCriterionV1[];
}

export interface FormalScriptedTraversalRequestV1 {
  readonly kind: "formal-scripted-traversal-request";
  readonly schemaVersion: 1;
  readonly checks: readonly FormalScriptedTraversalCheckRequestV1[];
}

export interface FormalWorldCaptureRequestV1 {
  readonly kind: "formal-world-capture-request";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly caseRef: string;
  readonly caseHash: Sha256HashV1;
  readonly evaluationProfileRef: string;
  readonly evaluationProfileHash: Sha256HashV1;
  readonly sceneAuthoringRouteDecisionRef: string;
  readonly sceneAuthoringRouteDecisionHash: Sha256HashV1;
  readonly sceneAuthoringAttemptRef: string;
  readonly sceneAuthoringAttemptHash: Sha256HashV1;
  readonly sceneAuthoringAttemptResultRef: string;
  readonly sceneAuthoringAttemptResultHash: Sha256HashV1;
  readonly worldPackageRef: string;
  readonly worldPackageRootHash: Sha256HashV1;
  readonly worldBuildIdentityRef: string;
  readonly worldBuildIdentityHash: Sha256HashV1;
  readonly worldPackageBuildReceiptRef: string;
  readonly worldPackageBuildReceiptHash: Sha256HashV1;
  readonly semanticCaptureMapRef: string;
  readonly semanticCaptureMap: FormalSemanticCaptureMapV1;
  readonly semanticCaptureMapHash: Sha256HashV1;
  readonly nativeBlockCaptureIdentityInventoryRef: string;
  readonly nativeBlockCaptureIdentityInventoryHash: Sha256HashV1;
  readonly nativeBlockMaterializerMetadataRef: string;
  readonly nativeBlockMaterializerMetadataHash: Sha256HashV1;
  readonly views: readonly [
    Extract<FormalArtifactViewRequestV1, { viewId: "opening" }>,
    Extract<FormalArtifactViewRequestV1, { viewId: "world-side" }>,
    Extract<FormalArtifactViewRequestV1, { viewId: "world-top-down" }>,
  ];
  readonly colliderOverlay: FormalColliderOverlayRequestV1;
  readonly scriptedTraversal: FormalScriptedTraversalRequestV1;
}

export interface FormalWorldCaptureSdkOwnerIdentityV1 {
  readonly ownerId: FormalWorldCaptureSdkOwnerIdV1;
  readonly implementationRef: string;
  readonly implementationHash: Sha256HashV1;
}

export interface FormalWorldCaptureViewRecordV1 {
  readonly viewId: FormalWorldCaptureViewIdV1;
  readonly request: FormalArtifactViewRequestV1;
  readonly requestHash: Sha256HashV1;
  readonly pngContentHash: Sha256HashV1;
}

export interface FormalWorldCaptureReceiptV1 {
  readonly kind: "formal-world-capture-receipt";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly formalRequestRef: string;
  readonly formalRequest: FormalWorldCaptureRequestV1;
  readonly formalRequestHash: Sha256HashV1;
  readonly caseRef: string;
  readonly caseHash: Sha256HashV1;
  readonly evaluationProfileRef: string;
  readonly evaluationProfileHash: Sha256HashV1;
  readonly sceneAuthoringRouteDecisionRef: string;
  readonly sceneAuthoringRouteDecisionHash: Sha256HashV1;
  readonly sceneAuthoringAttemptRef: string;
  readonly sceneAuthoringAttemptHash: Sha256HashV1;
  readonly sceneAuthoringAttemptResultRef: string;
  readonly sceneAuthoringAttemptResultHash: Sha256HashV1;
  readonly worldPackageRef: string;
  readonly worldPackageRootHash: Sha256HashV1;
  readonly worldBuildIdentityRef: string;
  readonly worldBuildIdentityHash: Sha256HashV1;
  readonly worldPackageBuildReceiptRef: string;
  readonly worldPackageBuildReceiptHash: Sha256HashV1;
  readonly runtimeSessionId: string;
  readonly readySnapshot: WorldRuntimeSnapshotV4;
  readonly readySnapshotHash: Sha256HashV1;
  readonly sdkOwnerIdentities: readonly FormalWorldCaptureSdkOwnerIdentityV1[];
  readonly semanticCaptureMapHash: Sha256HashV1;
  readonly nativeBlockCaptureIdentityInventoryHash: Sha256HashV1;
  readonly nativeBlockMaterializerMetadataHash: Sha256HashV1;
  readonly colliderOverlayRequestHash: Sha256HashV1;
  readonly scriptedTraversalRequestHash: Sha256HashV1;
  readonly viewportWidthPixels: number;
  readonly viewportHeightPixels: number;
  readonly devicePixelRatio: number;
  readonly rendererIdentity: string;
  readonly browserIdentity: string;
  readonly views: readonly FormalWorldCaptureViewRecordV1[];
  readonly colliderOverlayHash: Sha256HashV1;
  readonly scriptedTraversalHash: Sha256HashV1;
  readonly cameraRollbackOutcome: "completed";
  readonly resetOutcome: "completed";
  readonly cleanupOutcome: "completed";
}

const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
const WORLD_PACKAGE_REF_PATTERN =
  /^package:\/\/world-package\/sha256\/([a-f0-9]{64})$/;
const ZERO_HASH = `sha256:${"0".repeat(64)}`;
const COLOR_PATTERN = /^#[0-9a-f]{6}$/;
const MAXIMUM_CAPTURE_DIMENSION_PIXELS = 16_384;
const MINIMUM_WORLD_SPAN_XZ_METERS = 8;
const MINIMUM_WORLD_SPAN_Y_METERS = 4;
const LOOK_AXIS_EPSILON = 1e-9;

const OPENING_REQUEST_FIELDS = [
  "kind",
  "schemaVersion",
  "viewId",
  "projection",
  "widthPixels",
  "heightPixels",
  "devicePixelRatio",
] as const;
const WORLD_REQUEST_FIELDS = [
  ...OPENING_REQUEST_FIELDS,
  "worldBoundsMeters",
  "cameraPositionMetersXYZ",
  "targetMetersXYZ",
] as const;
const MAP_FIELDS = [
  "kind",
  "schemaVersion",
  "id",
  "caseRef",
  "caseHash",
  "authoringManifestHash",
  "layoutInventoryHash",
  "contributionHash",
  "bindings",
  "traversalCheckBindings",
] as const;
const BINDING_FIELDS = [
  "acceptanceTargetRef",
  "blockVisualGroupId",
  "semanticClassId",
  "identityColor",
  "projectedBoundsSource",
  "requiredWorldViewIds",
  "authoringManifestHash",
  "layoutInventoryHash",
  "contributionHash",
] as const;
const TRAVERSAL_BINDING_FIELDS = [
  "traversalCheckId",
  "acceptanceTargetRef",
  "checkExpectation",
  "fixedInputSequenceHash",
  "checkpointCriteria",
] as const;
const REACH_CRITERION_FIELDS = [
  "kind",
  "checkpointId",
  "expectation",
  "sourceVisualGroupId",
  "sourceBoundsMeters",
  "capsuleRadiusMeters",
  "toleranceMeters",
] as const;
const PASS_PLANE_CRITERION_FIELDS = [
  ...REACH_CRITERION_FIELDS,
  "axis",
  "sourceFace",
  "planeMeters",
  "expectedCenterSide",
] as const;
const BLOCK_PLANE_CRITERION_FIELDS = [
  ...PASS_PLANE_CRITERION_FIELDS,
  "colliderId",
] as const;
const FORMAL_REQUEST_FIELDS = [
  "kind",
  "schemaVersion",
  "id",
  "caseRef",
  "caseHash",
  "evaluationProfileRef",
  "evaluationProfileHash",
  "sceneAuthoringRouteDecisionRef",
  "sceneAuthoringRouteDecisionHash",
  "sceneAuthoringAttemptRef",
  "sceneAuthoringAttemptHash",
  "sceneAuthoringAttemptResultRef",
  "sceneAuthoringAttemptResultHash",
  "worldPackageRef",
  "worldPackageRootHash",
  "worldBuildIdentityRef",
  "worldBuildIdentityHash",
  "worldPackageBuildReceiptRef",
  "worldPackageBuildReceiptHash",
  "semanticCaptureMapRef",
  "semanticCaptureMap",
  "semanticCaptureMapHash",
  "nativeBlockCaptureIdentityInventoryRef",
  "nativeBlockCaptureIdentityInventoryHash",
  "nativeBlockMaterializerMetadataRef",
  "nativeBlockMaterializerMetadataHash",
  "views",
  "colliderOverlay",
  "scriptedTraversal",
] as const;
const COLLIDER_OVERLAY_REQUEST_FIELDS = [
  "kind",
  "schemaVersion",
  "isRequired",
  "contributionHash",
] as const;
const SCRIPTED_TRAVERSAL_REQUEST_FIELDS = [
  "kind",
  "schemaVersion",
  "checks",
] as const;
const SCRIPTED_TRAVERSAL_CHECK_FIELDS = [
  "id",
  "acceptanceTargetRef",
  "checkExpectation",
  "fixedInputSequence",
  "fixedInputSequenceHash",
  "checkpointCriteria",
] as const;
const RECEIPT_FIELDS = [
  "kind",
  "schemaVersion",
  "id",
  "formalRequestRef",
  "formalRequest",
  "formalRequestHash",
  "caseRef",
  "caseHash",
  "evaluationProfileRef",
  "evaluationProfileHash",
  "sceneAuthoringRouteDecisionRef",
  "sceneAuthoringRouteDecisionHash",
  "sceneAuthoringAttemptRef",
  "sceneAuthoringAttemptHash",
  "sceneAuthoringAttemptResultRef",
  "sceneAuthoringAttemptResultHash",
  "worldPackageRef",
  "worldPackageRootHash",
  "worldBuildIdentityRef",
  "worldBuildIdentityHash",
  "worldPackageBuildReceiptRef",
  "worldPackageBuildReceiptHash",
  "runtimeSessionId",
  "readySnapshot",
  "readySnapshotHash",
  "sdkOwnerIdentities",
  "semanticCaptureMapHash",
  "nativeBlockCaptureIdentityInventoryHash",
  "nativeBlockMaterializerMetadataHash",
  "colliderOverlayRequestHash",
  "scriptedTraversalRequestHash",
  "viewportWidthPixels",
  "viewportHeightPixels",
  "devicePixelRatio",
  "rendererIdentity",
  "browserIdentity",
  "views",
  "colliderOverlayHash",
  "scriptedTraversalHash",
  "cameraRollbackOutcome",
  "resetOutcome",
  "cleanupOutcome",
] as const;
const VIEW_RECORD_FIELDS = [
  "viewId",
  "request",
  "requestHash",
  "pngContentHash",
] as const;
const SDK_OWNER_FIELDS = [
  "ownerId",
  "implementationRef",
  "implementationHash",
] as const;
const BOUNDS_FIELDS = ["minimumMetersXYZ", "maximumMetersXYZ"] as const;

function fail(contract: string, path: string, message: string): never {
  throw new Error(
    `${contract}:${path.length === 0 ? "" : ` ${path}:`} ${message}`,
  );
}

function assertAccessorFree(
  value: unknown,
  contract: string,
  path = "",
  seen = new Set<object>(),
): void {
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") fail(contract, path, "symbol keys are forbidden");
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!isNil(descriptor?.get) || !isNil(descriptor?.set)) {
      fail(contract, `${path}/${key}`, "accessors are forbidden");
    }
    assertAccessorFree(descriptor?.value, contract, `${path}/${key}`, seen);
  }
}

function object(
  value: unknown,
  contract: string,
  path: string,
): Readonly<Record<string, unknown>> {
  if (
    isNil(value) ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Reflect.getPrototypeOf(value) !== Object.prototype
  ) {
    fail(contract, path, "expected an ordinary plain object");
  }
  return value as Readonly<Record<string, unknown>>;
}

function exactFields(
  value: Readonly<Record<string, unknown>>,
  fields: readonly string[],
  contract: string,
  path: string,
): void {
  const allowed = new Set(fields);
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (!isNil(unknown)) fail(contract, `${path}/${unknown}`, "unknown field");
  const missing = fields.find((key) => !Object.hasOwn(value, key));
  if (!isNil(missing)) {
    fail(contract, `${path}/${missing}`, "required field is missing");
  }
}

function text(value: unknown, contract: string, path: string): string {
  if (
    typeof value !== "string" ||
    isEmpty(value) ||
    value.trim() !== value ||
    value.normalize("NFC") !== value
  ) {
    fail(contract, path, "expected a non-empty trimmed NFC string");
  }
  return value;
}

function hash(value: unknown, contract: string, path: string): Sha256HashV1 {
  const parsed = text(value, contract, path);
  if (!HASH_PATTERN.test(parsed) || parsed === ZERO_HASH) {
    fail(contract, path, "expected a non-zero SHA-256 hash");
  }
  return parsed as Sha256HashV1;
}

function enumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
  contract: string,
  path: string,
): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    fail(contract, path, `expected one of ${allowed.join(", ")}`);
  }
  return value as T;
}

function exactInteger(
  value: unknown,
  expected: number,
  contract: string,
  path: string,
): number {
  if (value !== expected) fail(contract, path, `expected ${expected}`);
  return expected;
}

function integer(
  value: unknown,
  minimum: number,
  maximum: number,
  contract: string,
  path: string,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum ||
    Object.is(value, -0)
  ) {
    fail(contract, path, `expected an integer from ${minimum} through ${maximum}`);
  }
  return value;
}

function finiteNumber(
  value: unknown,
  minimum: number,
  maximum: number,
  contract: string,
  path: string,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum ||
    Object.is(value, -0)
  ) {
    fail(contract, path, `expected a finite number from ${minimum} through ${maximum}`);
  }
  return value;
}

function array(
  value: unknown,
  contract: string,
  path: string,
): readonly unknown[] {
  if (
    !Array.isArray(value) ||
    Reflect.getPrototypeOf(value) !== Array.prototype ||
    Object.getOwnPropertyNames(value).length !== value.length + 1
  ) {
    fail(contract, path, "expected an ordinary array");
  }
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (
      isNil(descriptor) ||
      descriptor.enumerable !== true ||
      !Object.hasOwn(descriptor, "value")
    ) {
      fail(contract, path, "sparse, accessor, or non-enumerable array items are forbidden");
    }
  }
  return value;
}

function freeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value as Record<string, unknown>)) {
    freeze(child);
  }
  return Object.freeze(value);
}

function begin(
  value: unknown,
  contract: string,
  fields: readonly string[],
): Readonly<Record<string, unknown>> {
  assertAccessorFree(value, contract);
  const source = object(value, contract, "");
  exactFields(source, fields, contract, "");
  return source;
}

function metersXYZ(
  value: unknown,
  contract: string,
  path: string,
): readonly [number, number, number] {
  const parsed = array(value, contract, path);
  if (parsed.length !== 3) fail(contract, path, "expected a 3-tuple of meters");
  return Object.freeze([
    finiteNumber(parsed[0], -1_000_000, 1_000_000, contract, `${path}/0`),
    finiteNumber(parsed[1], -1_000_000, 1_000_000, contract, `${path}/1`),
    finiteNumber(parsed[2], -1_000_000, 1_000_000, contract, `${path}/2`),
  ]);
}

function parseSpatialBounds(
  value: unknown,
  contract: string,
  path: string,
): FormalWorldBoundsMetersV1 {
  const source = object(value, contract, path);
  exactFields(source, BOUNDS_FIELDS, contract, path);
  const minimumMetersXYZ = metersXYZ(
    source.minimumMetersXYZ,
    contract,
    `${path}/minimumMetersXYZ`,
  );
  const maximumMetersXYZ = metersXYZ(
    source.maximumMetersXYZ,
    contract,
    `${path}/maximumMetersXYZ`,
  );
  const spanX = maximumMetersXYZ[0] - minimumMetersXYZ[0];
  const spanY = maximumMetersXYZ[1] - minimumMetersXYZ[1];
  const spanZ = maximumMetersXYZ[2] - minimumMetersXYZ[2];
  if (spanX <= 0 || spanY <= 0 || spanZ <= 0) {
    fail(contract, path, "world bounds must have positive volume");
  }
  return Object.freeze({ minimumMetersXYZ, maximumMetersXYZ });
}

function parseWorldBounds(
  value: unknown,
  contract: string,
  path: string,
): FormalWorldBoundsMetersV1 {
  const parsed = parseSpatialBounds(value, contract, path);
  const spanX = parsed.maximumMetersXYZ[0] - parsed.minimumMetersXYZ[0];
  const spanY = parsed.maximumMetersXYZ[1] - parsed.minimumMetersXYZ[1];
  const spanZ = parsed.maximumMetersXYZ[2] - parsed.minimumMetersXYZ[2];
  if (
    spanX < MINIMUM_WORLD_SPAN_XZ_METERS ||
    spanZ < MINIMUM_WORLD_SPAN_XZ_METERS ||
    spanY < MINIMUM_WORLD_SPAN_Y_METERS
  ) {
    fail(contract, path, "world-side and world-top-down require world-scale bounds");
  }
  return parsed;
}

function dominantLookAxis(
  cameraPositionMetersXYZ: readonly [number, number, number],
  targetMetersXYZ: readonly [number, number, number],
  contract: string,
  path: string,
): "x" | "y" | "z" {
  const delta: readonly [number, number, number] = [
    targetMetersXYZ[0] - cameraPositionMetersXYZ[0],
    targetMetersXYZ[1] - cameraPositionMetersXYZ[1],
    targetMetersXYZ[2] - cameraPositionMetersXYZ[2],
  ];
  const absX = Math.abs(delta[0]);
  const absY = Math.abs(delta[1]);
  const absZ = Math.abs(delta[2]);
  const maximum = Math.max(absX, absY, absZ);
  if (maximum <= LOOK_AXIS_EPSILON) {
    fail(contract, path, "camera position and target must differ");
  }
  const axisCount = [absX, absY, absZ].filter((value) =>
    Math.abs(value - maximum) <= LOOK_AXIS_EPSILON
  ).length;
  if (axisCount !== 1) {
    fail(contract, path, "look direction must be axis-aligned");
  }
  if (absY === maximum) return "y";
  return absX === maximum ? "x" : "z";
}

function parsePixelDimensions(
  source: Readonly<Record<string, unknown>>,
  contract: string,
): Readonly<{
  widthPixels: number;
  heightPixels: number;
  devicePixelRatio: number;
}> {
  return {
    widthPixels: integer(
      source.widthPixels,
      1,
      MAXIMUM_CAPTURE_DIMENSION_PIXELS,
      contract,
      "widthPixels",
    ),
    heightPixels: integer(
      source.heightPixels,
      1,
      MAXIMUM_CAPTURE_DIMENSION_PIXELS,
      contract,
      "heightPixels",
    ),
    devicePixelRatio: finiteNumber(
      source.devicePixelRatio,
      0.5,
      8,
      contract,
      "devicePixelRatio",
    ),
  };
}

function parseWorldPoseRequest(
  source: Readonly<Record<string, unknown>>,
  contract: string,
  viewId: "world-side" | "world-top-down",
): Extract<FormalArtifactViewRequestV1, { viewId: "world-side" | "world-top-down" }> {
  exactFields(source, WORLD_REQUEST_FIELDS, contract, "");
  if (source.projection !== "orthographic") {
    fail(contract, "projection", "world views must be orthographic");
  }
  const worldBoundsMeters = parseWorldBounds(
    source.worldBoundsMeters,
    contract,
    "worldBoundsMeters",
  );
  const cameraPositionMetersXYZ = metersXYZ(
    source.cameraPositionMetersXYZ,
    contract,
    "cameraPositionMetersXYZ",
  );
  const targetMetersXYZ = metersXYZ(
    source.targetMetersXYZ,
    contract,
    "targetMetersXYZ",
  );
  const lookAxis = dominantLookAxis(
    cameraPositionMetersXYZ,
    targetMetersXYZ,
    contract,
    "cameraPositionMetersXYZ",
  );
  if (viewId === "world-side" && lookAxis === "y") {
    fail(contract, "viewId", "world-side must be a world-bounds lateral elevation");
  }
  if (viewId === "world-top-down" && lookAxis !== "y") {
    fail(contract, "viewId", "world-top-down must look along the world Y axis");
  }
  return Object.freeze({
    kind: "formal-artifact-view-request",
    schemaVersion: 1,
    viewId,
    projection: "orthographic",
    ...parsePixelDimensions(source, contract),
    worldBoundsMeters,
    cameraPositionMetersXYZ,
    targetMetersXYZ,
  });
}

export function parseFormalArtifactViewRequestV1(
  value: unknown,
): FormalArtifactViewRequestV1 {
  const contract = "FORMAL_ARTIFACT_VIEW_REQUEST_INVALID";
  assertAccessorFree(value, contract);
  const source = object(value, contract, "");
  if (
    source.kind !== "formal-artifact-view-request" ||
    source.schemaVersion !== 1
  ) {
    fail(contract, "kind", "unexpected kind or schemaVersion");
  }
  const viewId = source.viewId;
  if (viewId === "opening") {
    exactFields(source, OPENING_REQUEST_FIELDS, contract, "");
    if (source.projection !== "perspective") {
      fail(contract, "projection", "opening must use the SDK perspective camera");
    }
    return Object.freeze({
      kind: "formal-artifact-view-request",
      schemaVersion: 1,
      viewId: "opening",
      projection: "perspective",
      ...parsePixelDimensions(source, contract),
    });
  }
  if (viewId === "world-side" || viewId === "world-top-down") {
    return parseWorldPoseRequest(source, contract, viewId);
  }
  fail(contract, "viewId", "expected opening, world-side, or world-top-down");
}

export function formalArtifactViewRequestCanonicalBytesV1(
  value: unknown,
): Uint8Array {
  return canonicalJsonBytes(parseFormalArtifactViewRequestV1(value));
}

export function hashFormalArtifactViewRequestV1(value: unknown): Sha256HashV1 {
  return sha256CanonicalJson(parseFormalArtifactViewRequestV1(value)) as Sha256HashV1;
}

function parseRequiredWorldViewIds(
  value: unknown,
  contract: string,
  path: string,
): readonly ["opening", "world-side", "world-top-down"] {
  const parsed = array(value, contract, path);
  if (
    parsed.length !== FORMAL_WORLD_CAPTURE_VIEW_IDS_V1.length ||
    parsed.some((entry, index) => entry !== FORMAL_WORLD_CAPTURE_VIEW_IDS_V1[index])
  ) {
    fail(contract, path, "must be opening, world-side, world-top-down");
  }
  return FORMAL_WORLD_CAPTURE_VIEW_IDS_V1;
}

function parseCapsuleTolerance(
  source: Readonly<Record<string, unknown>>,
  contract: string,
  path: string,
): Readonly<{ capsuleRadiusMeters: number; toleranceMeters: number }> {
  const capsuleRadiusMeters = finiteNumber(
    source.capsuleRadiusMeters,
    0.001,
    100,
    contract,
    `${path}/capsuleRadiusMeters`,
  );
  const toleranceMeters = finiteNumber(
    source.toleranceMeters,
    0,
    capsuleRadiusMeters,
    contract,
    `${path}/toleranceMeters`,
  );
  return Object.freeze({ capsuleRadiusMeters, toleranceMeters });
}

function parseTraversalCheckpointSpatialCriterion(
  value: unknown,
  contract = "FORMAL_TRAVERSAL_CHECKPOINT_SPATIAL_CRITERION_INVALID",
  path = "",
): FormalTraversalCheckpointSpatialCriterionV1 {
  assertAccessorFree(value, contract, path);
  const source = object(value, contract, path);
  const kind = source.kind;
  if (kind === "reach-bounds") {
    exactFields(source, REACH_CRITERION_FIELDS, contract, path);
    if (source.expectation !== "reach") {
      fail(contract, `${path}/expectation`, "reach-bounds must expect reach");
    }
    return freeze({
      kind,
      checkpointId: text(source.checkpointId, contract, `${path}/checkpointId`),
      expectation: "reach" as const,
      sourceVisualGroupId: text(
        source.sourceVisualGroupId,
        contract,
        `${path}/sourceVisualGroupId`,
      ),
      sourceBoundsMeters: parseSpatialBounds(
        source.sourceBoundsMeters,
        contract,
        `${path}/sourceBoundsMeters`,
      ),
      ...parseCapsuleTolerance(source, contract, path),
    });
  }
  if (kind !== "pass-plane" && kind !== "block-plane") {
    fail(contract, `${path}/kind`, "expected reach-bounds, pass-plane, or block-plane");
  }
  exactFields(
    source,
    kind === "block-plane"
      ? BLOCK_PLANE_CRITERION_FIELDS
      : PASS_PLANE_CRITERION_FIELDS,
    contract,
    path,
  );
  const expectation = kind === "pass-plane" ? "pass" : "block";
  if (source.expectation !== expectation) {
    fail(contract, `${path}/expectation`, `${kind} must expect ${expectation}`);
  }
  const sourceBoundsMeters = parseSpatialBounds(
    source.sourceBoundsMeters,
    contract,
    `${path}/sourceBoundsMeters`,
  );
  const axis = enumValue(
    source.axis,
    ["x", "y", "z"] as const,
    contract,
    `${path}/axis`,
  );
  const sourceFace = enumValue(
    source.sourceFace,
    ["minimum", "maximum"] as const,
    contract,
    `${path}/sourceFace`,
  );
  const planeMeters = finiteNumber(
    source.planeMeters,
    -1_000_000,
    1_000_000,
    contract,
    `${path}/planeMeters`,
  );
  const axisIndex = axis === "x" ? 0 : axis === "y" ? 1 : 2;
  const derivedPlaneMeters = sourceFace === "minimum"
    ? sourceBoundsMeters.minimumMetersXYZ[axisIndex]
    : sourceBoundsMeters.maximumMetersXYZ[axisIndex];
  if (planeMeters !== derivedPlaneMeters) {
    fail(contract, `${path}/planeMeters`, "must equal the selected frozen bounds face");
  }
  const shared = {
    checkpointId: text(source.checkpointId, contract, `${path}/checkpointId`),
    sourceVisualGroupId: text(
      source.sourceVisualGroupId,
      contract,
      `${path}/sourceVisualGroupId`,
    ),
    sourceBoundsMeters,
    axis,
    sourceFace,
    planeMeters,
    expectedCenterSide: enumValue(
      source.expectedCenterSide,
      ["negative", "positive"] as const,
      contract,
      `${path}/expectedCenterSide`,
    ),
    ...parseCapsuleTolerance(source, contract, path),
  };
  return kind === "pass-plane"
    ? freeze({ kind, expectation: "pass" as const, ...shared })
    : freeze({
        kind,
        expectation: "block" as const,
        colliderId: text(source.colliderId, contract, `${path}/colliderId`),
        ...shared,
      });
}

function parseCheckpointCriteria(
  value: unknown,
  contract: string,
  path: string,
): readonly FormalTraversalCheckpointSpatialCriterionV1[] {
  const criteria = array(value, contract, path).map((entry, index) =>
    parseTraversalCheckpointSpatialCriterion(
      entry,
      contract,
      `${path}/${index}`,
    ));
  if (isEmpty(criteria)) {
    fail(contract, path, "must contain one frozen spatial criterion per checkpoint");
  }
  if (
    criteria.some((criterion, index) =>
      index > 0 && criteria[index - 1]!.checkpointId >= criterion.checkpointId)
  ) {
    fail(contract, path, "checkpoint criteria must be unique and sorted by checkpointId");
  }
  return Object.freeze(criteria);
}

export function parseFormalTraversalCheckpointSpatialCriteriaV1(
  value: unknown,
): readonly FormalTraversalCheckpointSpatialCriterionV1[] {
  return parseCheckpointCriteria(
    value,
    "FORMAL_TRAVERSAL_CHECKPOINT_SPATIAL_CRITERIA_INVALID",
    "checkpointCriteria",
  );
}

function parseSemanticTraversalBinding(
  value: unknown,
  contract: string,
  path: string,
): FormalSemanticTraversalCheckBindingV1 {
  const source = object(value, contract, path);
  exactFields(source, TRAVERSAL_BINDING_FIELDS, contract, path);
  const checkExpectation = enumValue(
    source.checkExpectation,
    ["pass", "block"] as const,
    contract,
    `${path}/checkExpectation`,
  );
  const checkpointCriteria = parseCheckpointCriteria(
    source.checkpointCriteria,
    contract,
    `${path}/checkpointCriteria`,
  );
  if (
    checkExpectation === "block" &&
    !checkpointCriteria.some(({ expectation }) => expectation === "block")
  ) {
    fail(contract, `${path}/checkpointCriteria`, "a block check requires a block criterion");
  }
  if (
    checkExpectation === "pass" &&
    checkpointCriteria.some(({ expectation }) => expectation === "block")
  ) {
    fail(contract, `${path}/checkpointCriteria`, "a pass check cannot contain a block criterion");
  }
  return freeze({
    traversalCheckId: text(
      source.traversalCheckId,
      contract,
      `${path}/traversalCheckId`,
    ),
    acceptanceTargetRef: text(
      source.acceptanceTargetRef,
      contract,
      `${path}/acceptanceTargetRef`,
    ),
    checkExpectation,
    fixedInputSequenceHash: hash(
      source.fixedInputSequenceHash,
      contract,
      `${path}/fixedInputSequenceHash`,
    ),
    checkpointCriteria,
  });
}

function parseBinding(
  value: unknown,
  contract: string,
  path: string,
  mapHashes: Readonly<{
    authoringManifestHash: Sha256HashV1;
    layoutInventoryHash: Sha256HashV1;
    contributionHash: Sha256HashV1;
  }>,
): FormalSemanticCaptureTargetBindingV1 {
  const source = object(value, contract, path);
  exactFields(source, BINDING_FIELDS, contract, path);
  const authoringManifestHash = hash(
    source.authoringManifestHash,
    contract,
    `${path}/authoringManifestHash`,
  );
  const layoutInventoryHash = hash(
    source.layoutInventoryHash,
    contract,
    `${path}/layoutInventoryHash`,
  );
  const contributionHash = hash(
    source.contributionHash,
    contract,
    `${path}/contributionHash`,
  );
  if (
    authoringManifestHash !== mapHashes.authoringManifestHash ||
    layoutInventoryHash !== mapHashes.layoutInventoryHash ||
    contributionHash !== mapHashes.contributionHash
  ) {
    fail(contract, path, "binding hashes must repeat the map identity hashes");
  }
  const identityColor = text(source.identityColor, contract, `${path}/identityColor`);
  if (!COLOR_PATTERN.test(identityColor)) {
    fail(contract, `${path}/identityColor`, "expected a lowercase six-digit hex color");
  }
  return Object.freeze({
    acceptanceTargetRef: text(
      source.acceptanceTargetRef,
      contract,
      `${path}/acceptanceTargetRef`,
    ),
    blockVisualGroupId: text(
      source.blockVisualGroupId,
      contract,
      `${path}/blockVisualGroupId`,
    ),
    semanticClassId: text(
      source.semanticClassId,
      contract,
      `${path}/semanticClassId`,
    ),
    identityColor: identityColor as `#${string}`,
    projectedBoundsSource: enumValue(
      source.projectedBoundsSource,
      [FORMAL_SEMANTIC_CAPTURE_PROJECTED_BOUNDS_SOURCE_V1],
      contract,
      `${path}/projectedBoundsSource`,
    ),
    requiredWorldViewIds: parseRequiredWorldViewIds(
      source.requiredWorldViewIds,
      contract,
      `${path}/requiredWorldViewIds`,
    ),
    authoringManifestHash,
    layoutInventoryHash,
    contributionHash,
  });
}

export function parseFormalSemanticCaptureMapV1(
  value: unknown,
): FormalSemanticCaptureMapV1 {
  const contract = "FORMAL_SEMANTIC_CAPTURE_MAP_INVALID";
  const source = begin(value, contract, MAP_FIELDS);
  if (source.kind !== "formal-semantic-capture-map") {
    fail(contract, "kind", "unexpected kind");
  }
  exactInteger(source.schemaVersion, 1, contract, "schemaVersion");
  const authoringManifestHash = hash(
    source.authoringManifestHash,
    contract,
    "authoringManifestHash",
  );
  const layoutInventoryHash = hash(
    source.layoutInventoryHash,
    contract,
    "layoutInventoryHash",
  );
  const contributionHash = hash(
    source.contributionHash,
    contract,
    "contributionHash",
  );
  const bindings = array(source.bindings, contract, "bindings").map((entry, index) =>
    parseBinding(entry, contract, `bindings/${index}`, {
      authoringManifestHash,
      layoutInventoryHash,
      contributionHash,
    }),
  );
  if (isEmpty(bindings)) fail(contract, "bindings", "must not be empty");
  const targetRefs = bindings.map((row) => row.acceptanceTargetRef);
  const groupIds = bindings.map((row) => row.blockVisualGroupId);
  const colors = bindings.map((row) => row.identityColor);
  if (targetRefs.some((entry, index) => index > 0 && targetRefs[index - 1]! >= entry)) {
    fail(contract, "bindings", "must be unique and strictly sorted by acceptanceTargetRef");
  }
  if (new Set(groupIds).size !== groupIds.length) {
    fail(contract, "bindings", "each visual group may bind one semantic target");
  }
  if (new Set(colors).size !== colors.length) {
    fail(contract, "bindings", "identity colors must be unique");
  }
  const traversalCheckBindings = array(
    source.traversalCheckBindings,
    contract,
    "traversalCheckBindings",
  ).map((entry, index) => parseSemanticTraversalBinding(
    entry,
    contract,
    `traversalCheckBindings/${index}`,
  ));
  if (
    isEmpty(traversalCheckBindings) ||
    traversalCheckBindings.some((binding, index) =>
      index > 0 &&
      traversalCheckBindings[index - 1]!.traversalCheckId >= binding.traversalCheckId)
  ) {
    fail(
      contract,
      "traversalCheckBindings",
      "must be non-empty, unique, and sorted by traversalCheckId",
    );
  }
  const boundGroupIds = new Set(groupIds);
  const boundAcceptanceTargetRefs = new Set(targetRefs);
  const unknownTraversalTarget = traversalCheckBindings.find(
    ({ acceptanceTargetRef }) => !boundAcceptanceTargetRefs.has(acceptanceTargetRef),
  );
  if (!isNil(unknownTraversalTarget)) {
    fail(
      contract,
      "traversalCheckBindings",
      "traversal check must reference a bound acceptance target",
    );
  }
  const unknownCriterionGroup = traversalCheckBindings
    .flatMap(({ checkpointCriteria }) => checkpointCriteria)
    .find(({ sourceVisualGroupId }) => !boundGroupIds.has(sourceVisualGroupId));
  if (!isNil(unknownCriterionGroup)) {
    fail(
      contract,
      "traversalCheckBindings",
      "checkpoint criterion must reference a bound visual group",
    );
  }
  return freeze({
    kind: "formal-semantic-capture-map",
    schemaVersion: 1,
    id: text(source.id, contract, "id"),
    caseRef: text(source.caseRef, contract, "caseRef"),
    caseHash: hash(source.caseHash, contract, "caseHash"),
    authoringManifestHash,
    layoutInventoryHash,
    contributionHash,
    bindings: Object.freeze(bindings),
    traversalCheckBindings: Object.freeze(traversalCheckBindings),
  });
}

export function formalSemanticCaptureMapCanonicalBytesV1(
  value: unknown,
): Uint8Array {
  return canonicalJsonBytes(parseFormalSemanticCaptureMapV1(value));
}

export function hashFormalSemanticCaptureMapV1(value: unknown): Sha256HashV1 {
  return sha256CanonicalJson(parseFormalSemanticCaptureMapV1(value)) as Sha256HashV1;
}

function formalWorldPackageRef(
  value: unknown,
  worldPackageRootHash: Sha256HashV1,
  contract: string,
  path: string,
): string {
  const parsed = text(value, contract, path);
  const match = WORLD_PACKAGE_REF_PATTERN.exec(parsed);
  if (isNil(match) || `sha256:${match[1]}` !== worldPackageRootHash) {
    fail(contract, path, "must be the formal package ref for worldPackageRootHash");
  }
  return parsed;
}

export function parseFormalColliderOverlayRequestV1(
  value: unknown,
): FormalColliderOverlayRequestV1 {
  const contract = "FORMAL_COLLIDER_OVERLAY_REQUEST_INVALID";
  const source = begin(value, contract, COLLIDER_OVERLAY_REQUEST_FIELDS);
  if (
    source.kind !== "formal-collider-overlay-request" ||
    source.schemaVersion !== 1 ||
    source.isRequired !== true
  ) {
    fail(contract, "", "formal collider overlay evidence must be required");
  }
  return Object.freeze({
    kind: "formal-collider-overlay-request",
    schemaVersion: 1,
    isRequired: true,
    contributionHash: hash(source.contributionHash, contract, "contributionHash"),
  });
}

export function hashFormalColliderOverlayRequestV1(
  value: unknown,
): Sha256HashV1 {
  return sha256CanonicalJson(
    parseFormalColliderOverlayRequestV1(value),
  ) as Sha256HashV1;
}

function parseFixedInputSequence(
  value: unknown,
  contract: string,
  path: string,
): readonly FixedInputV1[] {
  let fixedInputSequence: readonly FixedInputV1[];
  try {
    fixedInputSequence = array(value, contract, path).map((entry) =>
      parseFixedInputV1(entry));
  } catch {
    fail(contract, path, "must be a non-empty sequence of valid FixedInputV1 values");
  }
  if (isEmpty(fixedInputSequence)) {
    fail(contract, path, "must be a non-empty sequence of valid FixedInputV1 values");
  }
  return Object.freeze(fixedInputSequence);
}

function parseScriptedTraversalCheck(
  value: unknown,
  contract: string,
  path: string,
): FormalScriptedTraversalCheckRequestV1 {
  const source = object(value, contract, path);
  exactFields(source, SCRIPTED_TRAVERSAL_CHECK_FIELDS, contract, path);
  const fixedInputSequence = parseFixedInputSequence(
    source.fixedInputSequence,
    contract,
    `${path}/fixedInputSequence`,
  );
  const fixedInputSequenceHash = hash(
    source.fixedInputSequenceHash,
    contract,
    `${path}/fixedInputSequenceHash`,
  );
  if (sha256CanonicalJson(fixedInputSequence) !== fixedInputSequenceHash) {
    fail(
      contract,
      `${path}/fixedInputSequenceHash`,
      "must match the parsed fixed input sequence",
    );
  }
  const checkExpectation = enumValue(
    source.checkExpectation,
    ["pass", "block"] as const,
    contract,
    `${path}/checkExpectation`,
  );
  const checkpointCriteria = parseCheckpointCriteria(
    source.checkpointCriteria,
    contract,
    `${path}/checkpointCriteria`,
  );
  if (
    checkExpectation === "block" &&
    !checkpointCriteria.some(({ expectation }) => expectation === "block")
  ) {
    fail(contract, `${path}/checkpointCriteria`, "a block check requires a block criterion");
  }
  if (
    checkExpectation === "pass" &&
    checkpointCriteria.some(({ expectation }) => expectation === "block")
  ) {
    fail(contract, `${path}/checkpointCriteria`, "a pass check cannot contain a block criterion");
  }
  return freeze({
    id: text(source.id, contract, `${path}/id`),
    acceptanceTargetRef: text(
      source.acceptanceTargetRef,
      contract,
      `${path}/acceptanceTargetRef`,
    ),
    checkExpectation,
    fixedInputSequence,
    fixedInputSequenceHash,
    checkpointCriteria,
  });
}

export function parseFormalScriptedTraversalRequestV1(
  value: unknown,
): FormalScriptedTraversalRequestV1 {
  const contract = "FORMAL_SCRIPTED_TRAVERSAL_REQUEST_INVALID";
  const source = begin(value, contract, SCRIPTED_TRAVERSAL_REQUEST_FIELDS);
  if (
    source.kind !== "formal-scripted-traversal-request" ||
    source.schemaVersion !== 1
  ) {
    fail(contract, "", "unexpected kind or schemaVersion");
  }
  const checks = array(source.checks, contract, "checks").map((entry, index) =>
    parseScriptedTraversalCheck(entry, contract, `checks/${index}`));
  if (
    isEmpty(checks) ||
    checks.some((check, index) => index > 0 && checks[index - 1]!.id >= check.id)
  ) {
    fail(contract, "checks", "must be non-empty, unique, and sorted by id");
  }
  return freeze({
    kind: "formal-scripted-traversal-request",
    schemaVersion: 1,
    checks: Object.freeze(checks),
  });
}

export function hashFormalScriptedTraversalRequestV1(
  value: unknown,
): Sha256HashV1 {
  return sha256CanonicalJson(
    parseFormalScriptedTraversalRequestV1(value),
  ) as Sha256HashV1;
}

function parseFormalRequestViews(
  value: unknown,
  contract: string,
): FormalWorldCaptureRequestV1["views"] {
  const views = array(value, contract, "views");
  if (views.length !== FORMAL_WORLD_CAPTURE_VIEW_IDS_V1.length) {
    fail(contract, "views", "must contain opening, world-side, and world-top-down");
  }
  const parsed = FORMAL_WORLD_CAPTURE_VIEW_IDS_V1.map((viewId, index) => {
    const request = parseFormalArtifactViewRequestV1(views[index]);
    if (request.viewId !== viewId) {
      fail(contract, `views/${index}/viewId`, `expected ${viewId}`);
    }
    return request;
  });
  return Object.freeze(parsed) as FormalWorldCaptureRequestV1["views"];
}

function requireSameCanonicalValue(
  left: unknown,
  right: unknown,
  contract: string,
  path: string,
): void {
  if (sha256CanonicalJson(left) !== sha256CanonicalJson(right)) {
    fail(contract, path, "must match the frozen formal Capture transaction");
  }
}

export function parseFormalWorldCaptureRequestV1(
  value: unknown,
): FormalWorldCaptureRequestV1 {
  const contract = "FORMAL_WORLD_CAPTURE_REQUEST_INVALID";
  const source = begin(value, contract, FORMAL_REQUEST_FIELDS);
  if (source.kind !== "formal-world-capture-request" || source.schemaVersion !== 1) {
    fail(contract, "", "unexpected kind or schemaVersion");
  }
  const caseRef = text(source.caseRef, contract, "caseRef");
  const caseHash = hash(source.caseHash, contract, "caseHash");
  const worldPackageRootHash = hash(
    source.worldPackageRootHash,
    contract,
    "worldPackageRootHash",
  );
  let semanticCaptureMap: FormalSemanticCaptureMapV1;
  try {
    semanticCaptureMap = parseFormalSemanticCaptureMapV1(source.semanticCaptureMap);
  } catch {
    fail(contract, "semanticCaptureMap", "must be a closed FormalSemanticCaptureMapV1");
  }
  const semanticCaptureMapHash = hash(
    source.semanticCaptureMapHash,
    contract,
    "semanticCaptureMapHash",
  );
  if (hashFormalSemanticCaptureMapV1(semanticCaptureMap) !== semanticCaptureMapHash) {
    fail(contract, "semanticCaptureMapHash", "must match the semantic Capture map bytes");
  }
  if (semanticCaptureMap.caseHash !== caseHash) {
    fail(contract, "semanticCaptureMap/caseHash", "must match the formal Case hash");
  }
  if (semanticCaptureMap.caseRef !== caseRef) {
    fail(contract, "semanticCaptureMap/caseRef", "must match the formal Case ref");
  }
  let colliderOverlay: FormalColliderOverlayRequestV1;
  try {
    colliderOverlay = parseFormalColliderOverlayRequestV1(source.colliderOverlay);
  } catch {
    fail(contract, "colliderOverlay", "must be a closed FormalColliderOverlayRequestV1");
  }
  if (colliderOverlay.contributionHash !== semanticCaptureMap.contributionHash) {
    fail(
      contract,
      "colliderOverlay/contributionHash",
      "must match the semantic map frozen Contribution",
    );
  }
  let scriptedTraversal: FormalScriptedTraversalRequestV1;
  try {
    scriptedTraversal = parseFormalScriptedTraversalRequestV1(source.scriptedTraversal);
  } catch {
    fail(contract, "scriptedTraversal", "must be a closed FormalScriptedTraversalRequestV1");
  }
  const semanticTraversalById = new Map(
    semanticCaptureMap.traversalCheckBindings.map((binding) => [
      binding.traversalCheckId,
      binding,
    ]),
  );
  if (scriptedTraversal.checks.length !== semanticTraversalById.size) {
    fail(contract, "scriptedTraversal/checks", "must match every semantic traversal binding");
  }
  for (const check of scriptedTraversal.checks) {
    const binding = semanticTraversalById.get(check.id);
    if (isNil(binding)) {
      fail(contract, "scriptedTraversal/checks", "contains an unbound traversal check");
    }
    requireSameCanonicalValue(
      {
        id: check.id,
        acceptanceTargetRef: check.acceptanceTargetRef,
        checkExpectation: check.checkExpectation,
        fixedInputSequenceHash: check.fixedInputSequenceHash,
        checkpointCriteria: check.checkpointCriteria,
      },
      {
        id: binding.traversalCheckId,
        acceptanceTargetRef: binding.acceptanceTargetRef,
        checkExpectation: binding.checkExpectation,
        fixedInputSequenceHash: binding.fixedInputSequenceHash,
        checkpointCriteria: binding.checkpointCriteria,
      },
      contract,
      `scriptedTraversal/checks/${check.id}`,
    );
  }
  return freeze({
    kind: "formal-world-capture-request",
    schemaVersion: 1,
    id: text(source.id, contract, "id"),
    caseRef,
    caseHash,
    evaluationProfileRef: text(
      source.evaluationProfileRef,
      contract,
      "evaluationProfileRef",
    ),
    evaluationProfileHash: hash(
      source.evaluationProfileHash,
      contract,
      "evaluationProfileHash",
    ),
    sceneAuthoringRouteDecisionRef: text(
      source.sceneAuthoringRouteDecisionRef,
      contract,
      "sceneAuthoringRouteDecisionRef",
    ),
    sceneAuthoringRouteDecisionHash: hash(
      source.sceneAuthoringRouteDecisionHash,
      contract,
      "sceneAuthoringRouteDecisionHash",
    ),
    sceneAuthoringAttemptRef: text(
      source.sceneAuthoringAttemptRef,
      contract,
      "sceneAuthoringAttemptRef",
    ),
    sceneAuthoringAttemptHash: hash(
      source.sceneAuthoringAttemptHash,
      contract,
      "sceneAuthoringAttemptHash",
    ),
    sceneAuthoringAttemptResultRef: text(
      source.sceneAuthoringAttemptResultRef,
      contract,
      "sceneAuthoringAttemptResultRef",
    ),
    sceneAuthoringAttemptResultHash: hash(
      source.sceneAuthoringAttemptResultHash,
      contract,
      "sceneAuthoringAttemptResultHash",
    ),
    worldPackageRef: formalWorldPackageRef(
      source.worldPackageRef,
      worldPackageRootHash,
      contract,
      "worldPackageRef",
    ),
    worldPackageRootHash,
    worldBuildIdentityRef: text(
      source.worldBuildIdentityRef,
      contract,
      "worldBuildIdentityRef",
    ),
    worldBuildIdentityHash: hash(
      source.worldBuildIdentityHash,
      contract,
      "worldBuildIdentityHash",
    ),
    worldPackageBuildReceiptRef: text(
      source.worldPackageBuildReceiptRef,
      contract,
      "worldPackageBuildReceiptRef",
    ),
    worldPackageBuildReceiptHash: hash(
      source.worldPackageBuildReceiptHash,
      contract,
      "worldPackageBuildReceiptHash",
    ),
    semanticCaptureMapRef: text(
      source.semanticCaptureMapRef,
      contract,
      "semanticCaptureMapRef",
    ),
    semanticCaptureMap,
    semanticCaptureMapHash,
    nativeBlockCaptureIdentityInventoryRef: text(
      source.nativeBlockCaptureIdentityInventoryRef,
      contract,
      "nativeBlockCaptureIdentityInventoryRef",
    ),
    nativeBlockCaptureIdentityInventoryHash: hash(
      source.nativeBlockCaptureIdentityInventoryHash,
      contract,
      "nativeBlockCaptureIdentityInventoryHash",
    ),
    nativeBlockMaterializerMetadataRef: text(
      source.nativeBlockMaterializerMetadataRef,
      contract,
      "nativeBlockMaterializerMetadataRef",
    ),
    nativeBlockMaterializerMetadataHash: hash(
      source.nativeBlockMaterializerMetadataHash,
      contract,
      "nativeBlockMaterializerMetadataHash",
    ),
    views: parseFormalRequestViews(source.views, contract),
    colliderOverlay,
    scriptedTraversal,
  });
}

export function formalWorldCaptureRequestCanonicalBytesV1(
  value: unknown,
): Uint8Array {
  return canonicalJsonBytes(parseFormalWorldCaptureRequestV1(value));
}

export function hashFormalWorldCaptureRequestV1(value: unknown): Sha256HashV1 {
  return sha256CanonicalJson(parseFormalWorldCaptureRequestV1(value)) as Sha256HashV1;
}

function parseReadySnapshot(
  value: unknown,
  runtimeSessionId: string,
  readySnapshotHash: Sha256HashV1,
  contract: string,
): WorldRuntimeSnapshotV4 {
  let snapshot: WorldRuntimeSnapshotV4;
  try {
    snapshot = parseWorldRuntimeSnapshotV4(value);
  } catch {
    fail(contract, "readySnapshot", "must be a closed WorldRuntimeSnapshotV4");
  }
  if (snapshot.runtime.phase !== "ready") {
    fail(contract, "readySnapshot", "ready Snapshot must be in the ready phase");
  }
  if (snapshot.runtimeSessionId !== runtimeSessionId) {
    fail(contract, "runtimeSessionId", "must match the ready Snapshot session");
  }
  if (sha256CanonicalJson(snapshot) !== readySnapshotHash) {
    fail(contract, "readySnapshotHash", "must match the ready Snapshot bytes");
  }
  return snapshot;
}

function parseSdkOwnerIdentities(
  value: unknown,
  contract: string,
  path: string,
): readonly FormalWorldCaptureSdkOwnerIdentityV1[] {
  const rows = array(value, contract, path).map((entry, index) => {
    const itemPath = `${path}/${index}`;
    const source = object(entry, contract, itemPath);
    exactFields(source, SDK_OWNER_FIELDS, contract, itemPath);
    return Object.freeze({
      ownerId: enumValue(
        source.ownerId,
        FORMAL_WORLD_CAPTURE_SDK_OWNER_IDS_V1,
        contract,
        `${itemPath}/ownerId`,
      ),
      implementationRef: text(
        source.implementationRef,
        contract,
        `${itemPath}/implementationRef`,
      ),
      implementationHash: hash(
        source.implementationHash,
        contract,
        `${itemPath}/implementationHash`,
      ),
    });
  });
  if (
    rows.length !== FORMAL_WORLD_CAPTURE_SDK_OWNER_IDS_V1.length ||
    rows.some((row, index) => row.ownerId !== FORMAL_WORLD_CAPTURE_SDK_OWNER_IDS_V1[index])
  ) {
    fail(contract, path, "must contain the five SDK owners in canonical order");
  }
  return Object.freeze(rows);
}

function parseViewRecord(
  value: unknown,
  contract: string,
  path: string,
  expectedViewId: FormalWorldCaptureViewIdV1,
  viewport: Readonly<{
    widthPixels: number;
    heightPixels: number;
    devicePixelRatio: number;
  }>,
): FormalWorldCaptureViewRecordV1 {
  const source = object(value, contract, path);
  exactFields(source, VIEW_RECORD_FIELDS, contract, path);
  const viewId = enumValue(
    source.viewId,
    FORMAL_WORLD_CAPTURE_VIEW_IDS_V1,
    contract,
    `${path}/viewId`,
  );
  if (viewId !== expectedViewId) {
    fail(contract, `${path}/viewId`, `expected ${expectedViewId}`);
  }
  const request = parseFormalArtifactViewRequestV1(source.request);
  if (request.viewId !== viewId) {
    fail(contract, `${path}/request`, "request viewId must match the view record");
  }
  if (
    request.widthPixels !== viewport.widthPixels ||
    request.heightPixels !== viewport.heightPixels ||
    request.devicePixelRatio !== viewport.devicePixelRatio
  ) {
    fail(contract, `${path}/request`, "request viewport must match the session viewport");
  }
  const requestHash = hash(source.requestHash, contract, `${path}/requestHash`);
  if (requestHash !== hashFormalArtifactViewRequestV1(request)) {
    fail(contract, `${path}/requestHash`, "must match the view request bytes");
  }
  return Object.freeze({
    viewId,
    request,
    requestHash,
    pngContentHash: hash(source.pngContentHash, contract, `${path}/pngContentHash`),
  });
}

export function parseFormalWorldCaptureReceiptV1(
  value: unknown,
): FormalWorldCaptureReceiptV1 {
  const contract = "FORMAL_WORLD_CAPTURE_RECEIPT_INVALID";
  const source = begin(value, contract, RECEIPT_FIELDS);
  if (source.kind !== "formal-world-capture-receipt") {
    fail(contract, "kind", "unexpected kind");
  }
  exactInteger(source.schemaVersion, 1, contract, "schemaVersion");
  let formalRequest: FormalWorldCaptureRequestV1;
  try {
    formalRequest = parseFormalWorldCaptureRequestV1(source.formalRequest);
  } catch {
    fail(contract, "formalRequest", "must be a closed FormalWorldCaptureRequestV1");
  }
  const formalRequestHash = hash(source.formalRequestHash, contract, "formalRequestHash");
  if (hashFormalWorldCaptureRequestV1(formalRequest) !== formalRequestHash) {
    fail(contract, "formalRequestHash", "must match the embedded formal Request bytes");
  }
  const formalRequestRef = text(source.formalRequestRef, contract, "formalRequestRef");
  const worldPackageRootHash = hash(
    source.worldPackageRootHash,
    contract,
    "worldPackageRootHash",
  );
  const worldPackageRef = formalWorldPackageRef(
    source.worldPackageRef,
    worldPackageRootHash,
    contract,
    "worldPackageRef",
  );
  const runtimeSessionId = text(
    source.runtimeSessionId,
    contract,
    "runtimeSessionId",
  );
  const readySnapshotHash = hash(
    source.readySnapshotHash,
    contract,
    "readySnapshotHash",
  );
  const readySnapshot = parseReadySnapshot(
    source.readySnapshot,
    runtimeSessionId,
    readySnapshotHash,
    contract,
  );
  const viewport = {
    widthPixels: integer(
      source.viewportWidthPixels,
      1,
      MAXIMUM_CAPTURE_DIMENSION_PIXELS,
      contract,
      "viewportWidthPixels",
    ),
    heightPixels: integer(
      source.viewportHeightPixels,
      1,
      MAXIMUM_CAPTURE_DIMENSION_PIXELS,
      contract,
      "viewportHeightPixels",
    ),
    devicePixelRatio: finiteNumber(
      source.devicePixelRatio,
      0.5,
      8,
      contract,
      "devicePixelRatio",
    ),
  };
  const views = array(source.views, contract, "views");
  if (views.length !== FORMAL_WORLD_CAPTURE_VIEW_IDS_V1.length) {
    fail(contract, "views", "must contain opening, world-side, and world-top-down");
  }
  const parsedViews = FORMAL_WORLD_CAPTURE_VIEW_IDS_V1.map((viewId, index) =>
    parseViewRecord(views[index], contract, `views/${index}`, viewId, viewport),
  );
  parsedViews.forEach((view, index) => {
    requireSameCanonicalValue(
      view.request,
      formalRequest.views[index],
      contract,
      `views/${index}/request`,
    );
  });
  const sdkOwnerIdentities = parseSdkOwnerIdentities(
    source.sdkOwnerIdentities,
    contract,
    "sdkOwnerIdentities",
  );
  const cameraRollbackOutcome = enumValue(
    source.cameraRollbackOutcome,
    ["completed"] as const,
    contract,
    "cameraRollbackOutcome",
  );
  const resetOutcome = enumValue(
    source.resetOutcome,
    ["completed"] as const,
    contract,
    "resetOutcome",
  );
  const cleanupOutcome = enumValue(
    source.cleanupOutcome,
    ["completed"] as const,
    contract,
    "cleanupOutcome",
  );
  const caseHash = hash(source.caseHash, contract, "caseHash");
  const evaluationProfileHash = hash(
    source.evaluationProfileHash,
    contract,
    "evaluationProfileHash",
  );
  const sceneAuthoringRouteDecisionHash = hash(
    source.sceneAuthoringRouteDecisionHash,
    contract,
    "sceneAuthoringRouteDecisionHash",
  );
  const sceneAuthoringAttemptHash = hash(
    source.sceneAuthoringAttemptHash,
    contract,
    "sceneAuthoringAttemptHash",
  );
  const sceneAuthoringAttemptResultHash = hash(
    source.sceneAuthoringAttemptResultHash,
    contract,
    "sceneAuthoringAttemptResultHash",
  );
  const worldBuildIdentityHash = hash(
    source.worldBuildIdentityHash,
    contract,
    "worldBuildIdentityHash",
  );
  const worldPackageBuildReceiptHash = hash(
    source.worldPackageBuildReceiptHash,
    contract,
    "worldPackageBuildReceiptHash",
  );
  const semanticCaptureMapHash = hash(
    source.semanticCaptureMapHash,
    contract,
    "semanticCaptureMapHash",
  );
  const colliderOverlayHash = hash(
    source.colliderOverlayHash,
    contract,
    "colliderOverlayHash",
  );
  const scriptedTraversalHash = hash(
    source.scriptedTraversalHash,
    contract,
    "scriptedTraversalHash",
  );
  const nativeBlockCaptureIdentityInventoryHash = hash(
    source.nativeBlockCaptureIdentityInventoryHash,
    contract,
    "nativeBlockCaptureIdentityInventoryHash",
  );
  const nativeBlockMaterializerMetadataHash = hash(
    source.nativeBlockMaterializerMetadataHash,
    contract,
    "nativeBlockMaterializerMetadataHash",
  );
  const colliderOverlayRequestHash = hash(
    source.colliderOverlayRequestHash,
    contract,
    "colliderOverlayRequestHash",
  );
  const scriptedTraversalRequestHash = hash(
    source.scriptedTraversalRequestHash,
    contract,
    "scriptedTraversalRequestHash",
  );
  const repeatedIdentityJoins = [
    [text(source.caseRef, contract, "caseRef"), formalRequest.caseRef, "caseRef"],
    [caseHash, formalRequest.caseHash, "caseHash"],
    [text(source.evaluationProfileRef, contract, "evaluationProfileRef"), formalRequest.evaluationProfileRef, "evaluationProfileRef"],
    [evaluationProfileHash, formalRequest.evaluationProfileHash, "evaluationProfileHash"],
    [text(source.sceneAuthoringRouteDecisionRef, contract, "sceneAuthoringRouteDecisionRef"), formalRequest.sceneAuthoringRouteDecisionRef, "sceneAuthoringRouteDecisionRef"],
    [sceneAuthoringRouteDecisionHash, formalRequest.sceneAuthoringRouteDecisionHash, "sceneAuthoringRouteDecisionHash"],
    [text(source.sceneAuthoringAttemptRef, contract, "sceneAuthoringAttemptRef"), formalRequest.sceneAuthoringAttemptRef, "sceneAuthoringAttemptRef"],
    [sceneAuthoringAttemptHash, formalRequest.sceneAuthoringAttemptHash, "sceneAuthoringAttemptHash"],
    [text(source.sceneAuthoringAttemptResultRef, contract, "sceneAuthoringAttemptResultRef"), formalRequest.sceneAuthoringAttemptResultRef, "sceneAuthoringAttemptResultRef"],
    [sceneAuthoringAttemptResultHash, formalRequest.sceneAuthoringAttemptResultHash, "sceneAuthoringAttemptResultHash"],
    [worldPackageRef, formalRequest.worldPackageRef, "worldPackageRef"],
    [worldPackageRootHash, formalRequest.worldPackageRootHash, "worldPackageRootHash"],
    [text(source.worldBuildIdentityRef, contract, "worldBuildIdentityRef"), formalRequest.worldBuildIdentityRef, "worldBuildIdentityRef"],
    [worldBuildIdentityHash, formalRequest.worldBuildIdentityHash, "worldBuildIdentityHash"],
    [text(source.worldPackageBuildReceiptRef, contract, "worldPackageBuildReceiptRef"), formalRequest.worldPackageBuildReceiptRef, "worldPackageBuildReceiptRef"],
    [worldPackageBuildReceiptHash, formalRequest.worldPackageBuildReceiptHash, "worldPackageBuildReceiptHash"],
    [semanticCaptureMapHash, formalRequest.semanticCaptureMapHash, "semanticCaptureMapHash"],
    [nativeBlockCaptureIdentityInventoryHash, formalRequest.nativeBlockCaptureIdentityInventoryHash, "nativeBlockCaptureIdentityInventoryHash"],
    [nativeBlockMaterializerMetadataHash, formalRequest.nativeBlockMaterializerMetadataHash, "nativeBlockMaterializerMetadataHash"],
    [colliderOverlayRequestHash, hashFormalColliderOverlayRequestV1(formalRequest.colliderOverlay), "colliderOverlayRequestHash"],
    [scriptedTraversalRequestHash, hashFormalScriptedTraversalRequestV1(formalRequest.scriptedTraversal), "scriptedTraversalRequestHash"],
  ] as const;
  for (const [actual, expected, path] of repeatedIdentityJoins) {
    if (actual !== expected) fail(contract, path, "must match the embedded formal Request");
  }
  return freeze({
    kind: "formal-world-capture-receipt",
    schemaVersion: 1,
    id: text(source.id, contract, "id"),
    formalRequestRef,
    formalRequest,
    formalRequestHash,
    caseRef: formalRequest.caseRef,
    caseHash,
    evaluationProfileRef: formalRequest.evaluationProfileRef,
    evaluationProfileHash,
    sceneAuthoringRouteDecisionRef: formalRequest.sceneAuthoringRouteDecisionRef,
    sceneAuthoringRouteDecisionHash,
    sceneAuthoringAttemptRef: formalRequest.sceneAuthoringAttemptRef,
    sceneAuthoringAttemptHash,
    sceneAuthoringAttemptResultRef: formalRequest.sceneAuthoringAttemptResultRef,
    sceneAuthoringAttemptResultHash,
    worldPackageRef,
    worldPackageRootHash,
    worldBuildIdentityRef: formalRequest.worldBuildIdentityRef,
    worldBuildIdentityHash,
    worldPackageBuildReceiptRef: formalRequest.worldPackageBuildReceiptRef,
    worldPackageBuildReceiptHash,
    runtimeSessionId,
    readySnapshot,
    readySnapshotHash,
    sdkOwnerIdentities,
    semanticCaptureMapHash,
    nativeBlockCaptureIdentityInventoryHash,
    nativeBlockMaterializerMetadataHash,
    colliderOverlayRequestHash,
    scriptedTraversalRequestHash,
    viewportWidthPixels: viewport.widthPixels,
    viewportHeightPixels: viewport.heightPixels,
    devicePixelRatio: viewport.devicePixelRatio,
    rendererIdentity: text(source.rendererIdentity, contract, "rendererIdentity"),
    browserIdentity: text(source.browserIdentity, contract, "browserIdentity"),
    views: Object.freeze(parsedViews),
    colliderOverlayHash,
    scriptedTraversalHash,
    cameraRollbackOutcome,
    resetOutcome,
    cleanupOutcome,
  });
}

export function formalWorldCaptureReceiptCanonicalBytesV1(
  value: unknown,
): Uint8Array {
  return canonicalJsonBytes(parseFormalWorldCaptureReceiptV1(value));
}

export function hashFormalWorldCaptureReceiptV1(value: unknown): Sha256HashV1 {
  return sha256CanonicalJson(parseFormalWorldCaptureReceiptV1(value)) as Sha256HashV1;
}
