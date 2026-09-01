import {
  parseLocomotionCapabilityStateV2,
  type GaitV2,
  type LocomotionCapabilityStateV2,
  type MobilityModeV2,
  type VerticalPhaseV2,
} from "@whitebox-world/gameplay-contracts";

export type CameraViewPreferenceV1 =
  | { readonly mode: "auto" }
  | { readonly mode: "first-person" }
  | {
      readonly mode: "camera-rig-profile";
      readonly cameraRigProfileRef: string;
    };

export type CameraRelationshipContextV1 =
  | {
      readonly id: string;
      readonly type: "possessedBy";
      readonly controlledEntityId: string;
      readonly controllerEntityId: string;
    }
  | {
      readonly id: string;
      readonly type: "mountedOn";
      readonly riderEntityId: string;
      readonly mountEntityId: string;
      readonly mountSlotId: string;
    }
  | {
      readonly id: string;
      readonly type: "equippedAt";
      readonly itemEntityId: string;
      readonly wearerEntityId: string;
      readonly equipmentSlotId: string;
    };

export interface CameraContextSampleV2 {
  readonly schemaVersion: 2;
  readonly semanticAuthorityStatus: "available";
  readonly committedTick: number;
  readonly controlledEntityId: string;
  readonly targetEntityId: string;
  readonly subjectPose: Readonly<{
    positionMetersXYZ: readonly [number, number, number];
    facingYawRadians: number;
  }>;
  readonly locomotion: LocomotionCapabilityStateV2;
  readonly actionSummary:
    | Readonly<{
        status: "available";
        activeActionRefs: readonly string[];
        isInterruptible: boolean;
      }>
    | Readonly<{ status: "unavailable" }>;
  readonly environment: Readonly<{
    relationshipContexts: readonly CameraRelationshipContextV1[];
    socketPositionsMetersXYZById: Readonly<Record<string, readonly [number, number, number]>>;
    cameraContextTags: readonly string[];
  }>;
}

export type CameraCollisionQueryQualityV1 =
  | "exact-sphere-sweep"
  | "ray-fan-approximation";

export interface CameraCollisionQueryRequestV1 {
  readonly schemaVersion: 1;
  readonly committedTick: number;
  readonly fromMetersXYZ: readonly [number, number, number];
  readonly toMetersXYZ: readonly [number, number, number];
  readonly radiusMeters: number;
  readonly excludedEntityIds: readonly string[];
}

export type CameraCollisionQueryResultV1 =
  | Readonly<{
      schemaVersion: 1;
      quality: CameraCollisionQueryQualityV1;
      hit: false;
    }>
  | Readonly<{
      schemaVersion: 1;
      quality: CameraCollisionQueryQualityV1;
      hit: true;
      distanceMeters: number;
      positionMetersXYZ: readonly [number, number, number];
      /** Absent only when locked provider explicitly reports no contact normal. */
      normalXYZ?: readonly [number, number, number];
      hitEntityId: string;
    }>;

export interface CameraCollisionQueryPortV1 {
  query(request: CameraCollisionQueryRequestV1): CameraCollisionQueryResultV1;
}

export const CAMERA_CONTEXT_MAX_ACTIVE_ACTIONS_V2 = 64;
export const CAMERA_CONTEXT_MAX_RELATIONSHIPS_V2 = 64;
export const CAMERA_CONTEXT_MAX_SOCKETS_V2 = 256;
export const CAMERA_CONTEXT_MAX_TAGS_V2 = 64;
export const CAMERA_QUERY_MAX_EXCLUDED_ENTITIES_V1 = 64;
export const CAMERA_QUERY_NORMAL_LENGTH_TOLERANCE_V1 = 1e-6;
export const CAMERA_QUERY_POSITION_TOLERANCE_METERS_V1 = 1e-6;
const CAMERA_TEXT_MAX_CODE_UNITS_V1 = 512;

function cameraWellFormedUnicode(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) return false;
  }
  return true;
}

function cameraRecord(input: unknown): Record<string, unknown> | undefined {
  try {
    if (typeof input !== "object" || input === null) return undefined;
    const prototype = Reflect.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) return undefined;
    const result = Object.create(null) as Record<string, unknown>;
    for (const key of Reflect.ownKeys(input)) {
      const descriptor = Reflect.getOwnPropertyDescriptor(input, key);
      if (typeof key !== "string" || descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
        return undefined;
      }
      result[key] = descriptor.value;
    }
    return result;
  } catch {
    return undefined;
  }
}

function cameraExact(record: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Reflect.ownKeys(record);
  return actual.length === keys.length && actual.every((key) =>
    typeof key === "string" && keys.includes(key)
  );
}

function cameraExactWithOptional(
  record: Record<string, unknown>,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[],
): boolean {
  const actual = Reflect.ownKeys(record);
  const allowed = new Set([...requiredKeys, ...optionalKeys]);
  return requiredKeys.every((key) => Object.hasOwn(record, key)) &&
    actual.every((key) => typeof key === "string" && allowed.has(key));
}

function cameraFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && !Object.is(value, -0);
}

function cameraTick(value: unknown): value is number {
  return cameraFinite(value) && Number.isSafeInteger(value) && value >= 0;
}

function cameraString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 &&
    value.length <= CAMERA_TEXT_MAX_CODE_UNITS_V1 &&
    cameraWellFormedUnicode(value) && value.normalize("NFC") === value;
}

function cameraArraySnapshot(
  value: unknown,
  maximumLength = Number.MAX_SAFE_INTEGER,
): readonly unknown[] | undefined {
  try {
    if (!Array.isArray(value) || Reflect.getPrototypeOf(value) !== Array.prototype) return undefined;
    const lengthDescriptor = Reflect.getOwnPropertyDescriptor(value, "length");
    if (lengthDescriptor === undefined || lengthDescriptor.enumerable ||
      !("value" in lengthDescriptor) || !Number.isSafeInteger(lengthDescriptor.value) ||
      lengthDescriptor.value < 0 || lengthDescriptor.value > maximumLength) return undefined;
    const length = lengthDescriptor.value;
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.some((key) => typeof key === "symbol") || ownKeys.length !== length + 1) return undefined;
    const snapshot: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = Reflect.getOwnPropertyDescriptor(value, String(index));
      if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) return undefined;
      snapshot.push(descriptor.value);
    }
    return snapshot;
  } catch {
    return undefined;
  }
}

function cameraVec3(value: unknown): readonly [number, number, number] | undefined {
  const values = cameraArraySnapshot(value);
  if (values === undefined || values.length !== 3 || !values.every(cameraFinite)) return undefined;
  return Object.freeze([values[0], values[1], values[2]]) as readonly [number, number, number];
}

function cameraStringArray(
  value: unknown,
  maximumLength: number,
): readonly string[] | undefined {
  const values = cameraArraySnapshot(value, maximumLength);
  if (values === undefined || !values.every(cameraString) ||
    new Set(values).size !== values.length) return undefined;
  return Object.freeze([...values]) as readonly string[];
}

function cameraValidatedStringArray(
  value: unknown,
  maximumLength: number,
  validate: (entry: string) => boolean,
): readonly string[] | undefined {
  const values = cameraStringArray(value, maximumLength);
  return values?.every(validate) ? values : undefined;
}

const CAMERA_RESOURCE_ID_V2 = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const CAMERA_SOCKET_ID_V2 = /^[A-Za-z0-9]+(?:[._-][A-Za-z0-9]+)*$/;
const CAMERA_CONTEXT_TAG_V2 = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const CAMERA_ENTITY_ID_V2 = /^[A-Za-z0-9]+(?:[._-][A-Za-z0-9]+)*$/;
const CAMERA_RELATIONSHIP_ID_V2 = /^[A-Za-z0-9]+(?:[._:-][A-Za-z0-9]+)*$/;

function cameraVersionedResourceRefV2(value: unknown, kind: string): value is string {
  if (!cameraString(value)) return false;
  const prefix = `worldkit://${kind}/`;
  if (!value.startsWith(prefix)) return false;
  const versionSeparator = value.lastIndexOf("@");
  if (versionSeparator <= prefix.length || versionSeparator === value.length - 1) return false;
  const id = value.slice(prefix.length, versionSeparator);
  const versionText = value.slice(versionSeparator + 1);
  const version = Number(versionText);
  return id.length <= 64 && CAMERA_RESOURCE_ID_V2.test(id) &&
    /^[1-9][0-9]*$/.test(versionText) && Number.isSafeInteger(version);
}

function cameraSocketIdV2(value: unknown): value is string {
  return cameraString(value) && value.length <= 128 && CAMERA_SOCKET_ID_V2.test(value);
}

function cameraContextTagV2(value: unknown): value is string {
  return cameraString(value) && value.length <= 128 && CAMERA_CONTEXT_TAG_V2.test(value);
}

function cameraEntityIdV2(value: unknown): value is string {
  return cameraString(value) && value.length <= 128 && CAMERA_ENTITY_ID_V2.test(value);
}

function cameraRelationshipIdV2(value: unknown): value is string {
  return cameraString(value) && value.length <= 128 &&
    CAMERA_RELATIONSHIP_ID_V2.test(value);
}

/** Strict snapshot-once parser for the closed Camera View Preference union. */
export function parseCameraViewPreferenceV1(input: unknown): CameraViewPreferenceV1 {
  const schemaName = "CameraViewPreferenceV1";
  const value = cameraRecord(input) ?? cameraInvalid(schemaName);
  if (value.mode === "auto" || value.mode === "first-person") {
    if (!cameraExact(value, ["mode"])) cameraInvalid(schemaName);
    return Object.freeze({ mode: value.mode });
  }
  if (value.mode === "camera-rig-profile") {
    if (!cameraExact(value, ["mode", "cameraRigProfileRef"]) ||
      !cameraVersionedResourceRefV2(value.cameraRigProfileRef, "camera-profile")) {
      cameraInvalid(schemaName);
    }
    return Object.freeze({
      mode: "camera-rig-profile",
      cameraRigProfileRef: value.cameraRigProfileRef,
    });
  }
  return cameraInvalid(schemaName);
}

function parseCameraRelationshipContextV1(
  input: unknown,
  schemaName: string,
): CameraRelationshipContextV1 {
  const value = cameraRecord(input) ?? cameraInvalid(schemaName);
  if (value.type === "possessedBy") {
    if (!cameraExact(value, ["id", "type", "controlledEntityId", "controllerEntityId"]) ||
      !cameraRelationshipIdV2(value.id) || !cameraEntityIdV2(value.controlledEntityId) ||
      !cameraEntityIdV2(value.controllerEntityId)) cameraInvalid(schemaName);
    return Object.freeze({
      id: value.id,
      type: "possessedBy",
      controlledEntityId: value.controlledEntityId,
      controllerEntityId: value.controllerEntityId,
    });
  }
  if (value.type === "mountedOn") {
    if (!cameraExact(value, ["id", "type", "riderEntityId", "mountEntityId", "mountSlotId"]) ||
      !cameraRelationshipIdV2(value.id) || !cameraEntityIdV2(value.riderEntityId) ||
      !cameraEntityIdV2(value.mountEntityId) || !cameraSocketIdV2(value.mountSlotId)) cameraInvalid(schemaName);
    return Object.freeze({
      id: value.id,
      type: "mountedOn",
      riderEntityId: value.riderEntityId,
      mountEntityId: value.mountEntityId,
      mountSlotId: value.mountSlotId,
    });
  }
  if (value.type === "equippedAt") {
    if (!cameraExact(value, ["id", "type", "itemEntityId", "wearerEntityId", "equipmentSlotId"]) ||
      !cameraRelationshipIdV2(value.id) || !cameraEntityIdV2(value.itemEntityId) ||
      !cameraEntityIdV2(value.wearerEntityId) || !cameraSocketIdV2(value.equipmentSlotId)) cameraInvalid(schemaName);
    return Object.freeze({
      id: value.id,
      type: "equippedAt",
      itemEntityId: value.itemEntityId,
      wearerEntityId: value.wearerEntityId,
      equipmentSlotId: value.equipmentSlotId,
    });
  }
  return cameraInvalid(schemaName);
}

function compareCameraCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function cameraInvalid(schemaName: string): never {
  throw new RangeError(`Value must match the closed ${schemaName} schema.`);
}

function cameraContextUncommitted(): never {
  throw new Error(
    "3C_CAMERA_CONTEXT_UNCOMMITTED: Camera Context must contain one coherent committed Tick and facing.",
  );
}

export function parseCameraContextSampleV2(input: unknown): CameraContextSampleV2 {
  const schemaName = "CameraContextSampleV2";
  const record = cameraRecord(input) ?? cameraInvalid(schemaName);
  if (!cameraExact(record, [
    "schemaVersion", "semanticAuthorityStatus", "committedTick", "controlledEntityId", "targetEntityId",
    "subjectPose", "locomotion", "actionSummary", "environment",
  ]) || record.schemaVersion !== 2 || !cameraTick(record.committedTick) ||
    record.semanticAuthorityStatus !== "available" ||
    !cameraEntityIdV2(record.controlledEntityId) || !cameraEntityIdV2(record.targetEntityId)) {
    cameraInvalid(schemaName);
  }
  const pose = cameraRecord(record.subjectPose) ?? cameraInvalid(schemaName);
  const position = cameraVec3(pose.positionMetersXYZ) ?? cameraInvalid(schemaName);
  if (!cameraExact(pose, ["positionMetersXYZ", "facingYawRadians"]) || !cameraFinite(pose.facingYawRadians)) {
    cameraInvalid(schemaName);
  }
  let locomotion: LocomotionCapabilityStateV2;
  try {
    locomotion = parseLocomotionCapabilityStateV2(record.locomotion);
  } catch {
    return cameraInvalid(schemaName);
  }
  if (locomotion.committedTick !== record.committedTick ||
    (locomotion.status === "active" && locomotion.facingYawRadians !== pose.facingYawRadians)) {
    cameraContextUncommitted();
  }
  if (locomotion.status === "suspended" &&
    !cameraRelationshipIdV2(locomotion.suspendedByRelationshipId)) cameraInvalid(schemaName);
  const action = cameraRecord(record.actionSummary) ?? cameraInvalid(schemaName);
  let actionSummary: CameraContextSampleV2["actionSummary"];
  if (action.status === "unavailable") {
    if (!cameraExact(action, ["status"]) || locomotion.status !== "suspended") {
      cameraInvalid(schemaName);
    }
    actionSummary = Object.freeze({ status: "unavailable" });
  } else {
    const activeActionRefs = cameraValidatedStringArray(
      action.activeActionRefs,
      CAMERA_CONTEXT_MAX_ACTIVE_ACTIONS_V2,
      (entry) => cameraVersionedResourceRefV2(entry, "semantic-action"),
    ) ?? cameraInvalid(schemaName);
    if (!cameraExact(action, ["status", "activeActionRefs", "isInterruptible"]) ||
      action.status !== "available" || typeof action.isInterruptible !== "boolean") {
      cameraInvalid(schemaName);
    }
    actionSummary = Object.freeze({
      status: "available",
      activeActionRefs,
      isInterruptible: action.isInterruptible,
    });
  }
  const environment = cameraRecord(record.environment) ?? cameraInvalid(schemaName);
  const relationshipContextValues = cameraArraySnapshot(
    environment.relationshipContexts,
    CAMERA_CONTEXT_MAX_RELATIONSHIPS_V2,
  ) ?? cameraInvalid(schemaName);
  const relationshipContexts = relationshipContextValues
    .map((context) =>
        parseCameraRelationshipContextV1(context, schemaName)
      )
    .sort((left, right) =>
      compareCameraCodeUnits(left.type, right.type) ||
      compareCameraCodeUnits(left.id, right.id)
    );
  if (new Set(relationshipContexts.map((context) => context.id)).size !== relationshipContexts.length) {
    cameraInvalid(schemaName);
  }
  const sockets = cameraRecord(environment.socketPositionsMetersXYZById) ?? cameraInvalid(schemaName);
  const socketKeys = Reflect.ownKeys(sockets);
  if (socketKeys.length > CAMERA_CONTEXT_MAX_SOCKETS_V2 ||
    socketKeys.some((id) => typeof id !== "string" || !cameraSocketIdV2(id))) cameraInvalid(schemaName);
  const socketEntries = (socketKeys as string[])
    .sort()
    .map((id) => [
      id,
      cameraVec3(sockets[id]) ?? cameraInvalid(schemaName),
    ] as const);
  const tags = cameraValidatedStringArray(
    environment.cameraContextTags,
    CAMERA_CONTEXT_MAX_TAGS_V2,
    cameraContextTagV2,
  ) ?? cameraInvalid(schemaName);
  if (!cameraExact(environment, [
    "relationshipContexts", "socketPositionsMetersXYZById", "cameraContextTags",
  ])) {
    cameraInvalid(schemaName);
  }
  return Object.freeze({
    schemaVersion: 2,
    semanticAuthorityStatus: record.semanticAuthorityStatus,
    committedTick: record.committedTick,
    controlledEntityId: record.controlledEntityId,
    targetEntityId: record.targetEntityId,
    subjectPose: Object.freeze({ positionMetersXYZ: position, facingYawRadians: pose.facingYawRadians }),
    locomotion,
    actionSummary,
    environment: Object.freeze({
      relationshipContexts: Object.freeze(relationshipContexts) as readonly CameraRelationshipContextV1[],
      socketPositionsMetersXYZById: Object.freeze(Object.fromEntries(socketEntries)),
      cameraContextTags: tags,
    }) as CameraContextSampleV2["environment"],
  }) as CameraContextSampleV2;
}

export function parseCameraCollisionQueryRequestV1(
  input: unknown,
): CameraCollisionQueryRequestV1 {
  const schemaName = "CameraCollisionQueryRequestV1";
  const value = cameraRecord(input) ?? cameraInvalid(schemaName);
  if (!cameraExact(value, [
    "schemaVersion", "committedTick", "fromMetersXYZ", "toMetersXYZ", "radiusMeters", "excludedEntityIds",
  ]) || value.schemaVersion !== 1 || !cameraTick(value.committedTick) ||
    !cameraFinite(value.radiusMeters) || value.radiusMeters <= 0) {
    cameraInvalid(schemaName);
  }
  const fromMetersXYZ = cameraVec3(value.fromMetersXYZ) ?? cameraInvalid(schemaName);
  const toMetersXYZ = cameraVec3(value.toMetersXYZ) ?? cameraInvalid(schemaName);
  const excludedEntityIds = cameraStringArray(
    value.excludedEntityIds,
    CAMERA_QUERY_MAX_EXCLUDED_ENTITIES_V1,
  ) ?? cameraInvalid(schemaName);
  return Object.freeze({
    schemaVersion: 1,
    committedTick: value.committedTick,
    fromMetersXYZ,
    toMetersXYZ,
    radiusMeters: value.radiusMeters,
    excludedEntityIds,
  });
}

export function parseCameraCollisionQueryResultV1(
  input: unknown,
  requestInput?: CameraCollisionQueryRequestV1,
): CameraCollisionQueryResultV1 {
  const schemaName = "CameraCollisionQueryResultV1";
  const record = cameraRecord(input) ?? cameraInvalid(schemaName);
  if (record.schemaVersion !== 1 || !["exact-sphere-sweep", "ray-fan-approximation"].includes(record.quality as string)) {
    cameraInvalid(schemaName);
  }
  const request = requestInput === undefined
    ? undefined
    : parseCameraCollisionQueryRequestV1(requestInput);
  if (record.hit === false) {
    if (!cameraExact(record, ["schemaVersion", "quality", "hit"])) cameraInvalid(schemaName);
    return Object.freeze({ schemaVersion: 1, quality: record.quality, hit: false }) as CameraCollisionQueryResultV1;
  }
  const position = cameraVec3(record.positionMetersXYZ) ?? cameraInvalid(schemaName);
  const hasNormal = Object.hasOwn(record, "normalXYZ");
  const normal = hasNormal
    ? cameraVec3(record.normalXYZ) ?? cameraInvalid(schemaName)
    : undefined;
  const distanceMeters = record.distanceMeters;
  if (record.hit !== true || !cameraExact(record, [
    "schemaVersion", "quality", "hit", "distanceMeters", "positionMetersXYZ",
    ...(hasNormal ? ["normalXYZ"] : []), "hitEntityId",
  ]) || !cameraFinite(distanceMeters) || distanceMeters < 0 ||
    !cameraString(record.hitEntityId) ||
    normal !== undefined &&
      Math.abs(Math.hypot(...normal) - 1) > CAMERA_QUERY_NORMAL_LENGTH_TOLERANCE_V1) {
    cameraInvalid(schemaName);
  }
  if (request !== undefined) {
    const delta = request.toMetersXYZ.map(
      (coordinate, index) => coordinate - request.fromMetersXYZ[index]!,
    ) as [number, number, number];
    const armLength = Math.hypot(...delta);
    if (distanceMeters > armLength + CAMERA_QUERY_POSITION_TOLERANCE_METERS_V1 ||
      request.excludedEntityIds.includes(record.hitEntityId)) cameraInvalid(schemaName);
    const direction = armLength <= CAMERA_QUERY_POSITION_TOLERANCE_METERS_V1
      ? [0, 0, 0]
      : delta.map((coordinate) => coordinate / armLength);
    const expectedPosition = request.fromMetersXYZ.map(
      (coordinate, index) => coordinate + direction[index]! * distanceMeters,
    );
    if (expectedPosition.some((coordinate, index) =>
      Math.abs(coordinate - position[index]!) > CAMERA_QUERY_POSITION_TOLERANCE_METERS_V1
    )) cameraInvalid(schemaName);
  }
  return Object.freeze({
    schemaVersion: 1,
    quality: record.quality,
    hit: true,
    distanceMeters,
    positionMetersXYZ: position,
    ...(normal === undefined ? {} : { normalXYZ: normal }),
    hitEntityId: record.hitEntityId,
  }) as CameraCollisionQueryResultV1;
}

export type CameraRelationshipConditionV1 =
  | { type: "possessedBy"; entityRole: "controlled" | "controller" }
  | { type: "mountedOn"; entityRole: "rider" }
  | { type: "equippedAt"; entityRole: "item" | "wearer" };

export const CAMERA_RIG_PARAMETER_NAMES_V1 = [
  "distanceMeters",
  "minimumDistanceMeters",
  "maximumDistanceMeters",
  "targetHeightMeters",
  "shoulderOffsetMeters",
  "pitchRadians",
  "minimumPitchRadians",
  "maximumPitchRadians",
  "positionDampingPerSecond",
  "horizontalPositionDampingPerSecond",
  "verticalPositionDampingPerSecond",
  "maximumPositionLagMeters",
  "rotationDampingPerSecond",
  "yawDampingPerSecond",
  "pitchDampingPerSecond",
  "collisionRadiusMeters",
  "collisionRetractionMetersPerSecond",
  "collisionRecoveryMetersPerSecond",
  "baseFovDegrees",
  "speedFovDegreesPerMeterPerSecond",
  "maximumSpeedFovDegrees",
  "lookAheadSeconds",
  "accelerationLookAheadSecondsSquared",
  "transitionSeconds",
  "minimumHeadingSpeedMetersPerSecond",
  "velocityHeadingDampingPerSecond",
  "fovDampingPerSecond",
  "horizontalDeadZoneRatio",
  "verticalDeadZoneRatio",
  "recenterDelaySeconds",
  "recenterDurationSeconds",
  "recenterMinimumSpeedMetersPerSecond",
  "teleportSnapDistanceMeters",
  "lookSensitivityXRatio",
  "lookSensitivityYRatio",
] as const;

export type CameraRigParameterNameV1 =
  typeof CAMERA_RIG_PARAMETER_NAMES_V1[number];
export type CameraRigParametersV1 = Record<CameraRigParameterNameV1, number>;

export function cameraRigParametersViolateInvariantsV1(
  parameters: Readonly<Partial<CameraRigParametersV1>>,
): boolean {
  const negativeAllowed = new Set<keyof CameraRigParametersV1>([
    "shoulderOffsetMeters",
    "pitchRadians",
    "minimumPitchRadians",
    "maximumPitchRadians",
  ]);
  return Object.entries(parameters).some(([name, value]) =>
    !Number.isFinite(value) ||
    (!negativeAllowed.has(name as keyof CameraRigParametersV1) && value < 0)
  ) ||
    (parameters.minimumDistanceMeters !== undefined &&
      parameters.maximumDistanceMeters !== undefined &&
      parameters.minimumDistanceMeters > parameters.maximumDistanceMeters) ||
    (parameters.distanceMeters !== undefined &&
      parameters.minimumDistanceMeters !== undefined &&
      parameters.distanceMeters < parameters.minimumDistanceMeters) ||
    (parameters.distanceMeters !== undefined &&
      parameters.maximumDistanceMeters !== undefined &&
      parameters.distanceMeters > parameters.maximumDistanceMeters) ||
    (parameters.minimumPitchRadians !== undefined &&
      parameters.maximumPitchRadians !== undefined &&
      parameters.minimumPitchRadians > parameters.maximumPitchRadians) ||
    (parameters.pitchRadians !== undefined &&
      parameters.minimumPitchRadians !== undefined &&
      parameters.pitchRadians < parameters.minimumPitchRadians) ||
    (parameters.pitchRadians !== undefined &&
      parameters.maximumPitchRadians !== undefined &&
      parameters.pitchRadians > parameters.maximumPitchRadians) ||
    (parameters.horizontalDeadZoneRatio !== undefined &&
      parameters.horizontalDeadZoneRatio > 1) ||
    (parameters.verticalDeadZoneRatio !== undefined &&
      parameters.verticalDeadZoneRatio > 1) ||
    (parameters.baseFovDegrees !== undefined && parameters.baseFovDegrees <= 0) ||
    (parameters.baseFovDegrees !== undefined &&
      parameters.maximumSpeedFovDegrees !== undefined &&
      parameters.baseFovDegrees + parameters.maximumSpeedFovDegrees >= 180) ||
    (parameters.lookSensitivityXRatio !== undefined &&
      parameters.lookSensitivityXRatio <= 0) ||
    (parameters.lookSensitivityYRatio !== undefined &&
      parameters.lookSensitivityYRatio <= 0);
}

export interface CameraContextRuleV2 {
  readonly id: string;
  readonly priority: number;
  readonly when: {
    readonly allRelationshipConditions?: readonly CameraRelationshipConditionV1[];
    readonly locomotionStatuses?: readonly ("active" | "suspended")[];
    readonly mobilityModes?: readonly MobilityModeV2[];
    readonly gaits?: readonly GaitV2[];
    readonly verticalPhases?: readonly VerticalPhaseV2[];
    readonly movementMediums?: readonly ("ground" | "air")[];
    readonly requiredActiveActionRefs?: readonly string[];
    readonly actionInterruptibility?: "interruptible" | "non-interruptible";
    readonly minimumSpeedMetersPerSecond?: number;
    readonly maximumSpeedMetersPerSecond?: number;
    readonly requiredSocketIds?: readonly string[];
    readonly requiredCameraContextTags?: readonly string[];
  };
  readonly cameraRigProfileRef?: string;
  readonly cameraModifierRefs?: readonly string[];
}

export interface CameraRigProfileV1 {
  readonly cameraRigProfileRef: string;
  readonly algorithmRef: string;
  readonly baseMode:
    | "first-person"
    | "free-orbit"
    | "stable-follow"
    | "speed-chase"
    | "flight-horizon";
  readonly headingSource: "view" | "target-forward" | "target-velocity";
  readonly reverseHeadingPolicy: "follow-velocity" | "preserve-target-forward";
  readonly recenterMode: "off" | "forward-motion" | "always";
  readonly preferredSocketIds: readonly string[];
  readonly parameters: CameraRigParametersV1;
}

export interface CameraModifierProfileV1 {
  readonly cameraModifierProfileRef: string;
  readonly parameterOverrides: Readonly<Partial<CameraRigParametersV1>>;
  readonly headingSourceOverride?: CameraRigProfileV1["headingSource"];
  readonly reverseHeadingPolicyOverride?: CameraRigProfileV1["reverseHeadingPolicy"];
  readonly recenterModeOverride?: CameraRigProfileV1["recenterMode"];
}

export interface CameraContextProfileV1 {
  readonly cameraContextProfileRef: string;
  readonly defaultCameraRigProfileRef: string;
  readonly firstPersonCameraRigProfileRef?: string;
  readonly rules: readonly CameraContextRuleV2[];
  readonly cameraRigProfiles: readonly CameraRigProfileV1[];
  readonly cameraModifierProfiles: readonly CameraModifierProfileV1[];
}

export type CameraDiagnosticCodeV1 =
  | "CAMERA_RESOURCE_NOT_LOCKED"
  | "CAMERA_PROFILE_INVALID"
  | "CAMERA_CONTEXT_RULE_AMBIGUOUS"
  | "CAMERA_CONTEXT_RULE_INVALID"
  | "CAMERA_PREFERENCE_INVALID"
  | "CAMERA_PREFERENCE_NOT_ALLOWED"
  | "CAMERA_FIRST_PERSON_UNAVAILABLE"
  | "CAMERA_REQUIRED_SOCKET_MISSING"
  | "CAMERA_PREFERENCE_CONTEXT_INCOMPATIBLE";

export interface CameraDiagnosticV1 {
  readonly severity: "error" | "warning";
  readonly code: CameraDiagnosticCodeV1;
  readonly message: string;
  readonly cameraContextProfileRef: string;
  readonly cameraContextRuleId?: string;
  readonly resourceRef?: string;
}

export interface CameraContextRuleExplainV1 {
  readonly cameraContextRuleId: string;
  readonly priority: number;
  readonly matched: boolean;
  readonly unmatchedReasons: readonly string[];
}

export interface CameraSelectionExplainV1 {
  readonly cameraViewPreference: CameraViewPreferenceV1;
  readonly cameraContextRules: readonly CameraContextRuleExplainV1[];
  readonly selectedCameraRigProfileRef: string;
  readonly appliedCameraModifierRefs: readonly string[];
  readonly fallbackActive: boolean;
}

export interface CameraSelectionDecisionV2 {
  readonly schemaVersion: 2;
  readonly committedTick: number;
  readonly targetEntityId: string;
  readonly activeCameraRigProfileRef: string;
  readonly activeCameraModifierRefs: readonly string[];
  readonly matchedCameraContextRuleIds: readonly string[];
  readonly cameraViewPreference: CameraViewPreferenceV1;
  readonly fallbackActive: boolean;
  readonly diagnostics: readonly CameraDiagnosticV1[];
  readonly explain: CameraSelectionExplainV1;
}

export type CameraAdmissionResultV1 =
  | { ok: true }
  | { ok: false; diagnostics: readonly CameraDiagnosticV1[] };

export type CameraViewPreferenceAdmissionResultV1 =
  | { ok: true; cameraViewPreference: CameraViewPreferenceV1 }
  | { ok: false; diagnostics: readonly CameraDiagnosticV1[] };

export type CameraSelectionResultV2 =
  | { ok: true; decision: CameraSelectionDecisionV2 }
  | { ok: false; diagnostics: readonly CameraDiagnosticV1[] };

export interface CameraSelectionInputV2 {
  readonly cameraContextProfile: CameraContextProfileV1;
  readonly cameraContextSample: CameraContextSampleV2;
  readonly cameraViewPreference: CameraViewPreferenceV1;
}

export const CAMERA_PROFILE_MAX_RULES_V2 = 256;
export const CAMERA_PROFILE_MAX_RIGS_V2 = 128;
export const CAMERA_PROFILE_MAX_MODIFIERS_V2 = 128;
export const CAMERA_RULE_MAX_CONDITIONS_V2 = 64;

function parseCameraRelationshipConditionV2(
  input: unknown,
  schemaName: string,
): CameraRelationshipConditionV1 {
  const value = cameraRecord(input) ?? cameraInvalid(schemaName);
  if (!cameraExact(value, ["type", "entityRole"])) cameraInvalid(schemaName);
  if (value.type === "possessedBy" &&
    (value.entityRole === "controlled" || value.entityRole === "controller")) {
    return Object.freeze({ type: "possessedBy", entityRole: value.entityRole });
  }
  if (value.type === "mountedOn" && value.entityRole === "rider") {
    return Object.freeze({ type: "mountedOn", entityRole: "rider" });
  }
  if (value.type === "equippedAt" &&
    (value.entityRole === "item" || value.entityRole === "wearer")) {
    return Object.freeze({ type: "equippedAt", entityRole: value.entityRole });
  }
  return cameraInvalid(schemaName);
}

function cameraEnumArray<T extends string>(
  value: unknown,
  allowed: ReadonlySet<string>,
  maximumLength: number,
): readonly T[] | undefined {
  const values = cameraArraySnapshot(value, maximumLength);
  if (values === undefined || values.some((entry) =>
    typeof entry !== "string" || !allowed.has(entry)
  ) || new Set(values).size !== values.length) return undefined;
  return Object.freeze([...values]) as readonly T[];
}

function parseCameraContextRuleValueV2(
  input: unknown,
  schemaName: string,
): CameraContextRuleV2 {
  const value = cameraRecord(input) ?? cameraInvalid(schemaName);
  if (!cameraExactWithOptional(
    value,
    ["id", "priority", "when"],
    ["cameraRigProfileRef", "cameraModifierRefs"],
  ) || !cameraString(value.id) || !cameraFinite(value.priority) ||
    !Number.isSafeInteger(value.priority)) cameraInvalid(schemaName);
  const when = cameraRecord(value.when) ?? cameraInvalid(schemaName);
  if (!cameraExactWithOptional(when, [], [
    "allRelationshipConditions",
    "locomotionStatuses",
    "mobilityModes",
    "gaits",
    "verticalPhases",
    "movementMediums",
    "requiredActiveActionRefs",
    "actionInterruptibility",
    "minimumSpeedMetersPerSecond",
    "maximumSpeedMetersPerSecond",
    "requiredSocketIds",
    "requiredCameraContextTags",
  ])) cameraInvalid(schemaName);

  const relationshipConditions = when.allRelationshipConditions === undefined
    ? undefined
    : Object.freeze((
        cameraArraySnapshot(when.allRelationshipConditions, CAMERA_RULE_MAX_CONDITIONS_V2) ??
          cameraInvalid(schemaName)
      ).map((condition) => parseCameraRelationshipConditionV2(condition, schemaName)));
  if (relationshipConditions !== undefined &&
    new Set(relationshipConditions.map((condition) => JSON.stringify(condition))).size !==
      relationshipConditions.length) cameraInvalid(schemaName);

  const parsedWhen: CameraContextRuleV2["when"] = Object.freeze({
    ...(relationshipConditions === undefined ? {} : { allRelationshipConditions: relationshipConditions }),
    ...(when.locomotionStatuses === undefined ? {} : {
      locomotionStatuses: cameraEnumArray<"active" | "suspended">(
        when.locomotionStatuses,
        new Set(["active", "suspended"]),
        CAMERA_RULE_MAX_CONDITIONS_V2,
      ) ?? cameraInvalid(schemaName),
    }),
    ...(when.mobilityModes === undefined ? {} : {
      mobilityModes: cameraEnumArray<MobilityModeV2>(
        when.mobilityModes,
        new Set(["grounded", "airborne"]),
        CAMERA_RULE_MAX_CONDITIONS_V2,
      ) ?? cameraInvalid(schemaName),
    }),
    ...(when.gaits === undefined ? {} : {
      gaits: cameraEnumArray<GaitV2>(
        when.gaits,
        new Set(["none", "idle", "walk", "run"]),
        CAMERA_RULE_MAX_CONDITIONS_V2,
      ) ?? cameraInvalid(schemaName),
    }),
    ...(when.verticalPhases === undefined ? {} : {
      verticalPhases: cameraEnumArray<VerticalPhaseV2>(
        when.verticalPhases,
        new Set(["none", "takeoff", "rising", "apex", "falling", "landing"]),
        CAMERA_RULE_MAX_CONDITIONS_V2,
      ) ?? cameraInvalid(schemaName),
    }),
    ...(when.movementMediums === undefined ? {} : {
      movementMediums: cameraEnumArray<"ground" | "air">(
        when.movementMediums,
        new Set(["ground", "air"]),
        CAMERA_RULE_MAX_CONDITIONS_V2,
      ) ?? cameraInvalid(schemaName),
    }),
    ...(when.requiredActiveActionRefs === undefined ? {} : {
      requiredActiveActionRefs: cameraValidatedStringArray(
        when.requiredActiveActionRefs,
        CAMERA_RULE_MAX_CONDITIONS_V2,
        (entry) => cameraVersionedResourceRefV2(entry, "semantic-action"),
      ) ?? cameraInvalid(schemaName),
    }),
    ...(when.actionInterruptibility === undefined ? {} : {
      actionInterruptibility: when.actionInterruptibility === "interruptible" ||
          when.actionInterruptibility === "non-interruptible"
        ? when.actionInterruptibility
        : cameraInvalid(schemaName),
    }),
    ...(when.minimumSpeedMetersPerSecond === undefined ? {} : {
      minimumSpeedMetersPerSecond: cameraFinite(when.minimumSpeedMetersPerSecond) &&
          when.minimumSpeedMetersPerSecond >= 0
        ? when.minimumSpeedMetersPerSecond
        : cameraInvalid(schemaName),
    }),
    ...(when.maximumSpeedMetersPerSecond === undefined ? {} : {
      maximumSpeedMetersPerSecond: cameraFinite(when.maximumSpeedMetersPerSecond) &&
          when.maximumSpeedMetersPerSecond >= 0
        ? when.maximumSpeedMetersPerSecond
        : cameraInvalid(schemaName),
    }),
    ...(when.requiredSocketIds === undefined ? {} : {
      requiredSocketIds: cameraValidatedStringArray(
        when.requiredSocketIds,
        CAMERA_RULE_MAX_CONDITIONS_V2,
        cameraSocketIdV2,
      ) ?? cameraInvalid(schemaName),
    }),
    ...(when.requiredCameraContextTags === undefined ? {} : {
      requiredCameraContextTags: cameraValidatedStringArray(
        when.requiredCameraContextTags,
        CAMERA_RULE_MAX_CONDITIONS_V2,
        cameraContextTagV2,
      ) ?? cameraInvalid(schemaName),
    }),
  });
  if (parsedWhen.minimumSpeedMetersPerSecond !== undefined &&
    parsedWhen.maximumSpeedMetersPerSecond !== undefined &&
    parsedWhen.minimumSpeedMetersPerSecond > parsedWhen.maximumSpeedMetersPerSecond) {
    cameraInvalid(schemaName);
  }
  const cameraRigProfileRef = value.cameraRigProfileRef === undefined
    ? undefined
    : cameraVersionedResourceRefV2(value.cameraRigProfileRef, "camera-profile")
      ? value.cameraRigProfileRef
      : cameraInvalid(schemaName);
  const cameraModifierRefs = value.cameraModifierRefs === undefined
    ? undefined
    : cameraValidatedStringArray(
        value.cameraModifierRefs,
        CAMERA_RULE_MAX_CONDITIONS_V2,
        (entry) => cameraVersionedResourceRefV2(entry, "camera-modifier"),
      ) ??
      cameraInvalid(schemaName);
  return Object.freeze({
    id: value.id,
    priority: value.priority,
    when: parsedWhen,
    ...(cameraRigProfileRef === undefined ? {} : { cameraRigProfileRef }),
    ...(cameraModifierRefs === undefined ? {} : { cameraModifierRefs }),
  });
}

/** Strict, exact-key, snapshot-once admission parser for one V2 Camera Rule. */
export function parseCameraContextRuleV2(input: unknown): CameraContextRuleV2 {
  return parseCameraContextRuleValueV2(input, "CameraContextRuleV2");
}

function parseCameraRigProfileV2(
  input: unknown,
  schemaName: string,
): CameraRigProfileV1 {
  const value = cameraRecord(input) ?? cameraInvalid(schemaName);
  if (!cameraExact(value, [
    "cameraRigProfileRef", "algorithmRef", "baseMode", "headingSource",
    "reverseHeadingPolicy", "recenterMode", "preferredSocketIds", "parameters",
  ]) || !cameraVersionedResourceRefV2(value.cameraRigProfileRef, "camera-profile") ||
    !cameraVersionedResourceRefV2(value.algorithmRef, "camera-rig") ||
    !["first-person", "free-orbit", "stable-follow", "speed-chase", "flight-horizon"]
      .includes(value.baseMode as string) ||
    !["view", "target-forward", "target-velocity"].includes(value.headingSource as string) ||
    !["follow-velocity", "preserve-target-forward"].includes(value.reverseHeadingPolicy as string) ||
    !["off", "forward-motion", "always"].includes(value.recenterMode as string)) {
    cameraInvalid(schemaName);
  }
  const preferredSocketIds = cameraValidatedStringArray(
    value.preferredSocketIds,
    CAMERA_RULE_MAX_CONDITIONS_V2,
    cameraSocketIdV2,
  ) ?? cameraInvalid(schemaName);
  const parameterValues = cameraRecord(value.parameters) ?? cameraInvalid(schemaName);
  if (!cameraExact(parameterValues, CAMERA_RIG_PARAMETER_NAMES_V1) ||
    CAMERA_RIG_PARAMETER_NAMES_V1.some((name) => !cameraFinite(parameterValues[name]))) {
    cameraInvalid(schemaName);
  }
  const parameters = Object.freeze(Object.fromEntries(
    CAMERA_RIG_PARAMETER_NAMES_V1.map((name) => [name, parameterValues[name]]),
  )) as CameraRigParametersV1;
  return Object.freeze({
    cameraRigProfileRef: value.cameraRigProfileRef,
    algorithmRef: value.algorithmRef,
    baseMode: value.baseMode,
    headingSource: value.headingSource,
    reverseHeadingPolicy: value.reverseHeadingPolicy,
    recenterMode: value.recenterMode,
    preferredSocketIds,
    parameters,
  }) as CameraRigProfileV1;
}

function parseCameraModifierProfileV2(
  input: unknown,
  schemaName: string,
): CameraModifierProfileV1 {
  const value = cameraRecord(input) ?? cameraInvalid(schemaName);
  if (!cameraExactWithOptional(value, [
    "cameraModifierProfileRef", "parameterOverrides",
  ], [
    "headingSourceOverride", "reverseHeadingPolicyOverride", "recenterModeOverride",
  ]) || !cameraVersionedResourceRefV2(
    value.cameraModifierProfileRef,
    "camera-modifier",
  )) cameraInvalid(schemaName);
  const overrides = cameraRecord(value.parameterOverrides) ?? cameraInvalid(schemaName);
  if (Reflect.ownKeys(overrides).some((name) =>
    typeof name !== "string" ||
    !CAMERA_RIG_PARAMETER_NAMES_V1.includes(name as CameraRigParameterNameV1) ||
    !cameraFinite(overrides[name])
  )) cameraInvalid(schemaName);
  if (value.headingSourceOverride !== undefined &&
    !["view", "target-forward", "target-velocity"].includes(value.headingSourceOverride as string)) {
    cameraInvalid(schemaName);
  }
  if (value.reverseHeadingPolicyOverride !== undefined &&
    !["follow-velocity", "preserve-target-forward"].includes(value.reverseHeadingPolicyOverride as string)) {
    cameraInvalid(schemaName);
  }
  if (value.recenterModeOverride !== undefined &&
    !["off", "forward-motion", "always"].includes(value.recenterModeOverride as string)) {
    cameraInvalid(schemaName);
  }
  return Object.freeze({
    cameraModifierProfileRef: value.cameraModifierProfileRef,
    parameterOverrides: Object.freeze({ ...overrides }),
    ...(value.headingSourceOverride === undefined ? {} : {
      headingSourceOverride: value.headingSourceOverride,
    }),
    ...(value.reverseHeadingPolicyOverride === undefined ? {} : {
      reverseHeadingPolicyOverride: value.reverseHeadingPolicyOverride,
    }),
    ...(value.recenterModeOverride === undefined ? {} : {
      recenterModeOverride: value.recenterModeOverride,
    }),
  }) as CameraModifierProfileV1;
}

/** Strict, exact-key, snapshot-once admission parser for V2 Camera Rules. */
export function parseCameraContextProfileV2(input: unknown): CameraContextProfileV1 {
  const schemaName = "CameraContextProfileV2";
  const value = cameraRecord(input) ?? cameraInvalid(schemaName);
  if (!cameraExactWithOptional(value, [
    "cameraContextProfileRef", "defaultCameraRigProfileRef", "rules",
    "cameraRigProfiles", "cameraModifierProfiles",
  ], ["firstPersonCameraRigProfileRef"]) ||
    !cameraVersionedResourceRefV2(value.cameraContextProfileRef, "camera-context") ||
    !cameraVersionedResourceRefV2(value.defaultCameraRigProfileRef, "camera-profile") ||
    value.firstPersonCameraRigProfileRef !== undefined &&
      !cameraVersionedResourceRefV2(
        value.firstPersonCameraRigProfileRef,
        "camera-profile",
      )) cameraInvalid(schemaName);
  const rules = Object.freeze((
    cameraArraySnapshot(value.rules, CAMERA_PROFILE_MAX_RULES_V2) ?? cameraInvalid(schemaName)
  ).map((rule) => parseCameraContextRuleValueV2(rule, schemaName)));
  const cameraRigProfiles = Object.freeze((
    cameraArraySnapshot(value.cameraRigProfiles, CAMERA_PROFILE_MAX_RIGS_V2) ?? cameraInvalid(schemaName)
  ).map((profile) => parseCameraRigProfileV2(profile, schemaName)));
  const cameraModifierProfiles = Object.freeze((
    cameraArraySnapshot(value.cameraModifierProfiles, CAMERA_PROFILE_MAX_MODIFIERS_V2) ??
      cameraInvalid(schemaName)
  ).map((profile) => parseCameraModifierProfileV2(profile, schemaName)));
  return Object.freeze({
    cameraContextProfileRef: value.cameraContextProfileRef,
    defaultCameraRigProfileRef: value.defaultCameraRigProfileRef,
    ...(value.firstPersonCameraRigProfileRef === undefined ? {} : {
      firstPersonCameraRigProfileRef: value.firstPersonCameraRigProfileRef,
    }),
    rules,
    cameraRigProfiles,
    cameraModifierProfiles,
  }) as CameraContextProfileV1;
}
