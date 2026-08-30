import {
  parseLocomotionCapabilityStateV2,
  parseLocomotionTransitionEventV1,
  type LocomotionCapabilityStateV2,
  type LocomotionTransitionEventV1,
  type VerticalPhaseV2,
} from "@whitebox-world/gameplay-contracts";

export const CHARACTER_MOVEMENT_DIAGNOSTIC_CODES_V1 = Object.freeze([
  "3C_INPUT_INVALID",
  "3C_TICK_TOKEN_STALE",
  "3C_SUPPORT_SAMPLE_DUPLICATE",
  "3C_BODY_RESOLUTION_DUPLICATE",
  "3C_LAYERED_MOVE_SOURCE_UNRESOLVED",
  "3C_ROOT_MOTION_HASH_MISMATCH",
  "3C_ROOT_MOTION_SAMPLE_INVALID",
  "3C_LOCOMOTION_TRANSITION_INVALID",
  "3C_CAMERA_CONTEXT_UNCOMMITTED",
  "3C_CAMERA_QUERY_UNAVAILABLE",
  "3C_RUNTIME_DISPOSED",
] as const);

export type CharacterMovementDiagnosticCodeV1 =
  typeof CHARACTER_MOVEMENT_DIAGNOSTIC_CODES_V1[number];

export type MovementVec3V1 = readonly [number, number, number];

export type JumpVariantPolicyV1 =
  | Readonly<{
      mode: "hold-height";
    }>
  | Readonly<{
      mode: "run-selects-variant";
      smallAnticipationSeconds: number;
      largeAnticipationSeconds: number;
    }>;

export type JumpVariantV1 = "small" | "large";

export type JumpEpisodeStateV1 =
  | Readonly<{
      schemaVersion: 1;
      variant: JumpVariantV1;
      phase: "buffered";
      startedTick: number;
      committedTick: number;
    }>
  | Readonly<{
      schemaVersion: 1;
      variant: JumpVariantV1;
      phase: "anticipating";
      startedTick: number;
      anticipationStartedTick: number;
      committedTick: number;
      anticipationTicksRemaining: number;
    }>
  | Readonly<{
      schemaVersion: 1;
      variant: JumpVariantV1;
      phase: "airborne";
      startedTick: number;
      anticipationStartedTick: number;
      takeoffTick: number;
      committedTick: number;
    }>;

export const BODY_SUPPORT_NORMAL_LENGTH_TOLERANCE_V1 = 1e-6;
export type RootMotionResourceRefV1 = `worldkit://root-motion/${string}@${number}`;
const ROOT_MOTION_RESOURCE_REF_PATTERN_V1 =
  /^worldkit:\/\/root-motion\/([a-z0-9]+(?:[.-][a-z0-9]+)*)@([1-9][0-9]*)$/;

declare const MOVEMENT_TICK_TOKEN_V1: unique symbol;
export type MovementTickTokenV1 = Readonly<{
  readonly [MOVEMENT_TICK_TOKEN_V1]: true;
}>;

const movementTickTokens = new WeakSet<object>();

/** Canonical tolerance for unit-disc input drift introduced by floating-point normalization. */
export const MOVEMENT_INPUT_UNIT_DISC_TOLERANCE_V1 = 1e-12;

const LEGAL_VERTICAL_PHASE_EDGES_V1 = new Set<string>([
  "none->takeoff",
  "takeoff->rising",
  "rising->apex",
  "apex->falling",
  "falling->landing",
  "falling->takeoff",
  "landing->none",
  "none->falling",
]);

export function createMovementTickTokenV1(): MovementTickTokenV1 {
  const token = Object.freeze(Object.create(null) as object) as MovementTickTokenV1;
  movementTickTokens.add(token);
  return token;
}

export function isMovementTickTokenV1(input: unknown): input is MovementTickTokenV1 {
  return typeof input === "object" && input !== null && movementTickTokens.has(input);
}

export function assertMovementTickTokenIdentityV1(
  expected: MovementTickTokenV1,
  received: MovementTickTokenV1,
): MovementTickTokenV1 {
  if (!isMovementTickTokenV1(expected) || !isMovementTickTokenV1(received) || expected !== received) {
    throw new Error("3C_TICK_TOKEN_STALE: movement artifact token provenance does not match.");
  }
  return expected;
}

interface LayeredMoveBaseV1 {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly priority: number;
  readonly startedTick: number;
}

export type LayeredMoveV1 =
  | (LayeredMoveBaseV1 & Readonly<{
      kind: "impulse";
      velocityDeltaMetersPerSecondXYZ: MovementVec3V1;
    }>)
  | (LayeredMoveBaseV1 & Readonly<{
      kind: "root-motion";
      rootMotionSourceRef: RootMotionResourceRefV1;
      rootMotionSourceHash: `sha256:${string}`;
      translationDeltaMetersXYZ: MovementVec3V1;
      facingYawDeltaRadians: number;
    }>);

export type BodySupportSampleV1 =
  | Readonly<{ mode: "unsupported" }>
  | Readonly<{
      mode: "supported" | "sliding";
      pointMetersXYZ: MovementVec3V1;
      normalXYZ: MovementVec3V1;
      isDynamic: boolean;
    }>;

export interface BodySampleV1 {
  readonly schemaVersion: 1;
  readonly token: MovementTickTokenV1;
  readonly tick: number;
  readonly positionMetersXYZ: MovementVec3V1;
  readonly linearVelocityMetersPerSecondXYZ: MovementVec3V1;
  readonly support: BodySupportSampleV1;
}

export interface MovementProposalV1 {
  readonly schemaVersion: 1;
  readonly token: MovementTickTokenV1;
  readonly tick: number;
  readonly translationDeltaMetersXYZ: MovementVec3V1;
  readonly proposedLinearVelocityMetersPerSecondXYZ: MovementVec3V1;
  readonly proposedFacingYawRadians: number;
  readonly layeredMoves: readonly LayeredMoveV1[];
}

export interface BodyResolutionV1 {
  readonly schemaVersion: 1;
  readonly token: MovementTickTokenV1;
  readonly tick: number;
  readonly positionMetersXYZ: MovementVec3V1;
  readonly appliedTranslationMetersXYZ: MovementVec3V1;
  readonly linearVelocityMetersPerSecondXYZ: MovementVec3V1;
  readonly support: BodySupportSampleV1;
  readonly hasCeilingContact: boolean;
  readonly isTranslationLimited: boolean;
}

export interface MovementCommitV1 {
  readonly schemaVersion: 1;
  readonly tick: number;
  readonly positionMetersXYZ: MovementVec3V1;
  readonly facingYawRadians: number;
  readonly linearVelocityMetersPerSecondXYZ: MovementVec3V1;
  readonly locomotion: LocomotionCapabilityStateV2;
  readonly transitionEvents: readonly LocomotionTransitionEventV1[];
  readonly jumpEpisode?: JumpEpisodeStateV1;
}

export interface CharacterMovementCommandV1 {
  readonly schemaVersion: 1;
  readonly tick: number;
  readonly fixedDeltaSeconds: number;
  readonly movementInputXZ: readonly [number, number];
  readonly runRequested: boolean;
  readonly jumpPressed: boolean;
  readonly jumpHeld: boolean;
  readonly viewYawRadians: number;
  readonly layeredMoves: readonly LayeredMoveV1[];
}

export interface CharacterMovementRuntimeStateV1 {
  readonly schemaVersion: 1;
  readonly coyoteTicksRemaining: number;
  readonly jumpBufferTicksRemaining: number;
  readonly variableJumpHoldTicksRemaining: number;
  readonly landingTicksRemaining: number;
  readonly apexCrossedInAirborneEpisode: boolean;
}

export interface CharacterMovementStateV1 extends MovementCommitV1 {
  readonly runtimeState: CharacterMovementRuntimeStateV1;
}

export interface CharacterMovementSnapshotV1 extends CharacterMovementStateV1 {
  readonly stateHash: `sha256:${string}`;
}

export interface BodyBeginTickRequestV1 {
  readonly token: MovementTickTokenV1;
  readonly tick: number;
}

export interface BodyResolveRequestV1 {
  readonly token: MovementTickTokenV1;
  readonly proposal: MovementProposalV1;
}

export interface CharacterBodyPortV1 {
  beginTick(request: BodyBeginTickRequestV1): BodySampleV1;
  resolve(request: BodyResolveRequestV1): BodyResolutionV1;
  reset(): void;
  dispose(): void;
}

export interface CharacterMovementRuntimeV1 {
  beginTick(command: CharacterMovementCommandV1): MovementTickTokenV1;
  proposeMovement(token: MovementTickTokenV1, sample: BodySampleV1): MovementProposalV1;
  reconcile(token: MovementTickTokenV1, result: BodyResolutionV1): MovementCommitV1;
  snapshot(): CharacterMovementSnapshotV1;
  reset(snapshot?: CharacterMovementSnapshotV1): void;
  dispose(): void;
}

function invalid(schemaName: string): never {
  throw new RangeError(`Value must match the closed ${schemaName} schema.`);
}

function record(input: unknown): Record<string, unknown> | undefined {
  if (typeof input !== "object" || input === null) return undefined;
  const prototype = Reflect.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) return undefined;
  const output = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(input)) {
    const descriptor = Reflect.getOwnPropertyDescriptor(input, key);
    if (typeof key !== "string" || descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
      return undefined;
    }
    output[key] = descriptor.value;
  }
  return output;
}

function exact(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const ownKeys = Reflect.ownKeys(value);
  return ownKeys.length === keys.length && ownKeys.every((key) =>
    typeof key === "string" && keys.includes(key)
  );
}

function exactWithOptional(
  value: Record<string, unknown>,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[],
): boolean {
  const ownKeys = Reflect.ownKeys(value);
  return ownKeys.every((key) =>
    typeof key === "string" && (requiredKeys.includes(key) || optionalKeys.includes(key))
  ) && requiredKeys.every((key) => Object.hasOwn(value, key)) &&
    ownKeys.length >= requiredKeys.length &&
    ownKeys.length <= requiredKeys.length + optionalKeys.length;
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && !Object.is(value, -0);
}

function tick(value: unknown): value is number {
  return finite(value) && Number.isSafeInteger(value) && value >= 0;
}

export function parseJumpVariantPolicyV1(input: unknown): JumpVariantPolicyV1 {
  const schemaName = "JumpVariantPolicyV1";
  const value = record(input) ?? invalid(schemaName);
  if (value.mode === "hold-height") {
    if (!exact(value, ["mode"])) invalid(schemaName);
    return Object.freeze({ mode: "hold-height" });
  }
  if (value.mode !== "run-selects-variant" || !exact(value, [
    "mode", "smallAnticipationSeconds", "largeAnticipationSeconds",
  ]) || !finite(value.smallAnticipationSeconds) ||
    !finite(value.largeAnticipationSeconds) ||
    value.smallAnticipationSeconds < 0 || value.smallAnticipationSeconds > 1.5 ||
    value.largeAnticipationSeconds < 0 || value.largeAnticipationSeconds > 1.5) {
    invalid(schemaName);
  }
  return Object.freeze({
    mode: "run-selects-variant",
    smallAnticipationSeconds: value.smallAnticipationSeconds,
    largeAnticipationSeconds: value.largeAnticipationSeconds,
  });
}

export function parseJumpEpisodeStateV1(input: unknown): JumpEpisodeStateV1 {
  const schemaName = "JumpEpisodeStateV1";
  const value = record(input) ?? invalid(schemaName);
  if (value.schemaVersion !== 1 || (value.variant !== "small" && value.variant !== "large") ||
    !tick(value.startedTick) || !tick(value.committedTick) || value.startedTick > value.committedTick) {
    invalid(schemaName);
  }
  if (value.phase === "buffered") {
    if (!exact(value, ["schemaVersion", "variant", "phase", "startedTick", "committedTick"])) {
      invalid(schemaName);
    }
    return Object.freeze({
      schemaVersion: 1,
      variant: value.variant,
      phase: "buffered",
      startedTick: value.startedTick,
      committedTick: value.committedTick,
    });
  }
  if (value.phase === "anticipating") {
    if (!exact(value, [
      "schemaVersion", "variant", "phase", "startedTick", "anticipationStartedTick",
      "committedTick", "anticipationTicksRemaining",
    ]) || !tick(value.anticipationStartedTick) || !tick(value.anticipationTicksRemaining) ||
      value.anticipationStartedTick < value.startedTick ||
      value.anticipationStartedTick > value.committedTick) invalid(schemaName);
    return Object.freeze({
      schemaVersion: 1,
      variant: value.variant,
      phase: "anticipating",
      startedTick: value.startedTick,
      anticipationStartedTick: value.anticipationStartedTick,
      committedTick: value.committedTick,
      anticipationTicksRemaining: value.anticipationTicksRemaining,
    });
  }
  if (value.phase !== "airborne" || !exact(value, [
    "schemaVersion", "variant", "phase", "startedTick", "anticipationStartedTick",
    "takeoffTick", "committedTick",
  ]) || !tick(value.anticipationStartedTick) || !tick(value.takeoffTick) ||
    value.anticipationStartedTick < value.startedTick || value.takeoffTick < value.anticipationStartedTick ||
    value.takeoffTick > value.committedTick) invalid(schemaName);
  return Object.freeze({
    schemaVersion: 1,
    variant: value.variant,
    phase: "airborne",
    startedTick: value.startedTick,
    anticipationStartedTick: value.anticipationStartedTick,
    takeoffTick: value.takeoffTick,
    committedTick: value.committedTick,
  });
}

function signedInteger(value: unknown): value is number {
  return finite(value) && Number.isSafeInteger(value);
}

function text(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

export function isWellFormedUnicodeV1(value: string): boolean {
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

function stableText(value: unknown): value is string {
  return text(value) && isWellFormedUnicodeV1(value);
}

export function parseRootMotionResourceRefV1(input: unknown): RootMotionResourceRefV1 {
  const match = typeof input === "string" && isWellFormedUnicodeV1(input)
    ? ROOT_MOTION_RESOURCE_REF_PATTERN_V1.exec(input)
    : null;
  const canonicalId = match?.[1];
  const version = match?.[2] === undefined ? Number.NaN : Number(match[2]);
  if (match === null || canonicalId === undefined || canonicalId.length > 64 ||
    !Number.isSafeInteger(version) || version <= 0) {
    throw new RangeError("3C_LAYERED_MOVE_SOURCE_UNRESOLVED: invalid Root Motion ResourceRef.");
  }
  return input as RootMotionResourceRefV1;
}

function arraySnapshot(input: unknown, schemaName: string): readonly unknown[] {
  if (!Array.isArray(input) || Reflect.getPrototypeOf(input) !== Array.prototype) invalid(schemaName);
  const ownKeys = Reflect.ownKeys(input);
  if (ownKeys.some((key) => typeof key === "symbol") || ownKeys.length !== input.length + 1) {
    invalid(schemaName);
  }
  const values: unknown[] = [];
  for (let index = 0; index < input.length; index += 1) {
    const descriptor = Reflect.getOwnPropertyDescriptor(input, String(index));
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) invalid(schemaName);
    values.push(descriptor.value);
  }
  const lengthDescriptor = Reflect.getOwnPropertyDescriptor(input, "length");
  if (lengthDescriptor === undefined || lengthDescriptor.enumerable) invalid(schemaName);
  return values;
}

function vec3(input: unknown, schemaName: string): MovementVec3V1 {
  const values = arraySnapshot(input, schemaName);
  if (values.length !== 3 || !values.every(finite)) invalid(schemaName);
  return Object.freeze([values[0], values[1], values[2]]) as MovementVec3V1;
}

function vec2(input: unknown, schemaName: string): readonly [number, number] {
  const values = arraySnapshot(input, schemaName);
  if (values.length !== 2 || !values.every(finite)) invalid(schemaName);
  return Object.freeze([values[0], values[1]]) as readonly [number, number];
}

function support(input: unknown, schemaName: string): BodySupportSampleV1 {
  const value = record(input) ?? invalid(schemaName);
  if (value.mode === "unsupported") {
    if (!exact(value, ["mode"])) invalid(schemaName);
    return Object.freeze({ mode: "unsupported" });
  }
  if ((value.mode !== "supported" && value.mode !== "sliding") ||
    !exact(value, ["mode", "pointMetersXYZ", "normalXYZ", "isDynamic"]) ||
    typeof value.isDynamic !== "boolean") invalid(schemaName);
  const normalXYZ = vec3(value.normalXYZ, schemaName);
  if (Math.abs(Math.hypot(...normalXYZ) - 1) > BODY_SUPPORT_NORMAL_LENGTH_TOLERANCE_V1) {
    invalid(schemaName);
  }
  return Object.freeze({
    mode: value.mode,
    pointMetersXYZ: vec3(value.pointMetersXYZ, schemaName),
    normalXYZ,
    isDynamic: value.isDynamic,
  });
}

export function parseLayeredMoveV1(input: unknown): LayeredMoveV1 {
  const schemaName = "LayeredMoveV1";
  const value = record(input) ?? invalid(schemaName);
  if (value.schemaVersion !== 1 || !stableText(value.id) || !signedInteger(value.priority) || !tick(value.startedTick)) {
    invalid(schemaName);
  }
  if (value.kind === "impulse") {
    if (!exact(value, [
      "schemaVersion", "kind", "id", "priority", "startedTick", "velocityDeltaMetersPerSecondXYZ",
    ])) invalid(schemaName);
    return Object.freeze({
      schemaVersion: 1,
      kind: "impulse",
      id: value.id,
      priority: value.priority,
      startedTick: value.startedTick,
      velocityDeltaMetersPerSecondXYZ: vec3(value.velocityDeltaMetersPerSecondXYZ, schemaName),
    }) as LayeredMoveV1;
  }
  if (value.kind !== "root-motion" || !exact(value, [
    "schemaVersion", "kind", "id", "priority", "startedTick", "rootMotionSourceRef",
    "rootMotionSourceHash", "translationDeltaMetersXYZ", "facingYawDeltaRadians",
  ]) || typeof value.rootMotionSourceHash !== "string" ||
    !/^sha256:[a-f0-9]{64}$/.test(value.rootMotionSourceHash) || !finite(value.facingYawDeltaRadians)) {
    invalid(schemaName);
  }
  return Object.freeze({
    schemaVersion: 1,
    kind: "root-motion",
    id: value.id,
    priority: value.priority,
    startedTick: value.startedTick,
    rootMotionSourceRef: parseRootMotionResourceRefV1(value.rootMotionSourceRef),
    rootMotionSourceHash: value.rootMotionSourceHash,
    translationDeltaMetersXYZ: vec3(value.translationDeltaMetersXYZ, schemaName),
    facingYawDeltaRadians: value.facingYawDeltaRadians,
  }) as LayeredMoveV1;
}

export function parseBodySampleV1(input: unknown): BodySampleV1 {
  const schemaName = "BodySampleV1";
  const value = record(input) ?? invalid(schemaName);
  if (!exact(value, ["schemaVersion", "token", "tick", "positionMetersXYZ", "linearVelocityMetersPerSecondXYZ", "support"]) ||
    value.schemaVersion !== 1 || !isMovementTickTokenV1(value.token) || !tick(value.tick)) invalid(schemaName);
  return Object.freeze({
    schemaVersion: 1,
    token: value.token,
    tick: value.tick,
    positionMetersXYZ: vec3(value.positionMetersXYZ, schemaName),
    linearVelocityMetersPerSecondXYZ: vec3(value.linearVelocityMetersPerSecondXYZ, schemaName),
    support: support(value.support, schemaName),
  });
}

export function parseMovementProposalV1(input: unknown): MovementProposalV1 {
  const schemaName = "MovementProposalV1";
  const value = record(input) ?? invalid(schemaName);
  if (!exact(value, [
    "schemaVersion", "token", "tick", "translationDeltaMetersXYZ", "proposedLinearVelocityMetersPerSecondXYZ",
    "proposedFacingYawRadians", "layeredMoves",
  ]) || value.schemaVersion !== 1 || !isMovementTickTokenV1(value.token) || !tick(value.tick) ||
    !finite(value.proposedFacingYawRadians)) invalid(schemaName);
  const layeredMoves = arraySnapshot(value.layeredMoves, schemaName).map(parseLayeredMoveV1);
  return Object.freeze({
    schemaVersion: 1,
    token: value.token,
    tick: value.tick,
    translationDeltaMetersXYZ: vec3(value.translationDeltaMetersXYZ, schemaName),
    proposedLinearVelocityMetersPerSecondXYZ: vec3(value.proposedLinearVelocityMetersPerSecondXYZ, schemaName),
    proposedFacingYawRadians: value.proposedFacingYawRadians,
    layeredMoves: Object.freeze(layeredMoves),
  });
}

export function parseBodyResolutionV1(input: unknown): BodyResolutionV1 {
  const schemaName = "BodyResolutionV1";
  const value = record(input) ?? invalid(schemaName);
  if (!exact(value, [
    "schemaVersion", "token", "tick", "positionMetersXYZ", "appliedTranslationMetersXYZ",
    "linearVelocityMetersPerSecondXYZ", "support", "hasCeilingContact", "isTranslationLimited",
  ]) || value.schemaVersion !== 1 || !isMovementTickTokenV1(value.token) || !tick(value.tick) || typeof value.hasCeilingContact !== "boolean" ||
    typeof value.isTranslationLimited !== "boolean") invalid(schemaName);
  return Object.freeze({
    schemaVersion: 1,
    token: value.token,
    tick: value.tick,
    positionMetersXYZ: vec3(value.positionMetersXYZ, schemaName),
    appliedTranslationMetersXYZ: vec3(value.appliedTranslationMetersXYZ, schemaName),
    linearVelocityMetersPerSecondXYZ: vec3(value.linearVelocityMetersPerSecondXYZ, schemaName),
    support: support(value.support, schemaName),
    hasCeilingContact: value.hasCeilingContact,
    isTranslationLimited: value.isTranslationLimited,
  });
}

export function parseMovementCommitV1(input: unknown): MovementCommitV1 {
  const schemaName = "MovementCommitV1";
  const value = record(input) ?? invalid(schemaName);
  if (!exactWithOptional(value, [
    "schemaVersion", "tick", "positionMetersXYZ", "facingYawRadians",
    "linearVelocityMetersPerSecondXYZ", "locomotion", "transitionEvents",
  ], ["jumpEpisode"]) || value.schemaVersion !== 1 || !tick(value.tick) ||
    !finite(value.facingYawRadians)) invalid(schemaName);
  const locomotion = parseLocomotionCapabilityStateV2(value.locomotion);
  const velocity = vec3(value.linearVelocityMetersPerSecondXYZ, schemaName);
  const transitionEvents = arraySnapshot(value.transitionEvents, schemaName)
    .map(parseLocomotionTransitionEventV1);
  if (locomotion.committedTick !== value.tick ||
    (locomotion.status === "active" && (
      locomotion.facingYawRadians !== value.facingYawRadians ||
      velocity[0] !== locomotion.linearVelocity.x ||
      velocity[1] !== locomotion.linearVelocity.y ||
      velocity[2] !== locomotion.linearVelocity.z
    ))) invalid(schemaName);
  let previousSequence = -1;
  for (const event of transitionEvents) {
    if (event.committedTick !== value.tick || event.transitionSequence <= previousSequence) invalid(schemaName);
    previousSequence = event.transitionSequence;
  }
  if (transitionEvents.length > 0 && previousSequence !== locomotion.transitionSequence) invalid(schemaName);
  if (transitionEvents.length > 0) {
    if (locomotion.status === "suspended") invalid(schemaName);
    let priorTarget: VerticalPhaseV2 | undefined;
    let terminalTarget: VerticalPhaseV2 | undefined;
    let apexCrossed = false;
    let landed = false;
    for (let index = 0; index < transitionEvents.length; index += 1) {
      const event = transitionEvents[index]!;
      const previousEvent = transitionEvents[index - 1];
      if (event.type === "phase-changed") {
        if (!LEGAL_VERTICAL_PHASE_EDGES_V1.has(`${event.fromVerticalPhase}->${event.toVerticalPhase}`) ||
          (priorTarget !== undefined && event.fromVerticalPhase !== priorTarget)) invalid(schemaName);
        priorTarget = event.toVerticalPhase;
        terminalTarget = event.toVerticalPhase;
        const nextEvent = transitionEvents[index + 1];
        if (event.toVerticalPhase === "apex" && nextEvent?.type !== "apex-crossed") invalid(schemaName);
        if (event.toVerticalPhase === "landing" && nextEvent?.type !== "landed") invalid(schemaName);
        continue;
      }
      if (event.type === "apex-crossed") {
        if (apexCrossed || previousEvent?.type !== "phase-changed" ||
          previousEvent.toVerticalPhase !== "apex") invalid(schemaName);
        apexCrossed = true;
        continue;
      }
      if (landed || previousEvent?.type !== "phase-changed" ||
        previousEvent.toVerticalPhase !== "landing" || locomotion.mobilityMode !== "grounded" ||
        locomotion.verticalPhase !== "landing") invalid(schemaName);
      landed = true;
    }
    if (terminalTarget === undefined || terminalTarget !== locomotion.verticalPhase) invalid(schemaName);
  }
  const jumpEpisode = Object.hasOwn(value, "jumpEpisode")
    ? parseJumpEpisodeStateV1(value.jumpEpisode)
    : undefined;
  if (jumpEpisode !== undefined && jumpEpisode.committedTick !== value.tick) invalid(schemaName);
  return Object.freeze({
    schemaVersion: 1,
    tick: value.tick,
    positionMetersXYZ: vec3(value.positionMetersXYZ, schemaName),
    facingYawRadians: value.facingYawRadians,
    linearVelocityMetersPerSecondXYZ: velocity,
    locomotion,
    transitionEvents: Object.freeze(transitionEvents),
    ...(jumpEpisode === undefined ? {} : { jumpEpisode }),
  });
}

export function parseCharacterMovementCommandV1(input: unknown): CharacterMovementCommandV1 {
  const schemaName = "CharacterMovementCommandV1";
  const value = record(input) ?? invalid(schemaName);
  if (!exact(value, [
    "schemaVersion", "tick", "fixedDeltaSeconds", "movementInputXZ", "runRequested",
    "jumpPressed", "jumpHeld", "viewYawRadians", "layeredMoves",
  ]) || value.schemaVersion !== 1 || !tick(value.tick) || !finite(value.fixedDeltaSeconds) ||
    value.fixedDeltaSeconds <= 0 || !finite(value.viewYawRadians) ||
    typeof value.runRequested !== "boolean" || typeof value.jumpPressed !== "boolean" ||
    typeof value.jumpHeld !== "boolean") invalid(schemaName);
  const commandTick = value.tick;
  const movementInputXZ = vec2(value.movementInputXZ, schemaName);
  if (Math.hypot(movementInputXZ[0], movementInputXZ[1]) >
    1 + MOVEMENT_INPUT_UNIT_DISC_TOLERANCE_V1) invalid(schemaName);
  const layeredMoves = arraySnapshot(value.layeredMoves, schemaName).map(parseLayeredMoveV1);
  if (layeredMoves.some((move) => move.startedTick > commandTick)) invalid(schemaName);
  return Object.freeze({
    schemaVersion: 1,
    tick: value.tick,
    fixedDeltaSeconds: value.fixedDeltaSeconds,
    movementInputXZ,
    runRequested: value.runRequested,
    jumpPressed: value.jumpPressed,
    jumpHeld: value.jumpHeld,
    viewYawRadians: value.viewYawRadians,
    layeredMoves: Object.freeze(layeredMoves),
  });
}

export function parseCharacterMovementRuntimeStateV1(
  input: unknown,
): CharacterMovementRuntimeStateV1 {
  const schemaName = "CharacterMovementRuntimeStateV1";
  const value = record(input) ?? invalid(schemaName);
  if (!exact(value, [
    "schemaVersion", "coyoteTicksRemaining", "jumpBufferTicksRemaining",
    "variableJumpHoldTicksRemaining", "landingTicksRemaining",
    "apexCrossedInAirborneEpisode",
  ]) || value.schemaVersion !== 1 || !tick(value.coyoteTicksRemaining) ||
    !tick(value.jumpBufferTicksRemaining) || !tick(value.variableJumpHoldTicksRemaining) ||
    !tick(value.landingTicksRemaining) ||
    typeof value.apexCrossedInAirborneEpisode !== "boolean") invalid(schemaName);
  return Object.freeze({
    schemaVersion: 1,
    coyoteTicksRemaining: value.coyoteTicksRemaining,
    jumpBufferTicksRemaining: value.jumpBufferTicksRemaining,
    variableJumpHoldTicksRemaining: value.variableJumpHoldTicksRemaining,
    landingTicksRemaining: value.landingTicksRemaining,
    apexCrossedInAirborneEpisode: value.apexCrossedInAirborneEpisode,
  });
}

export function parseCharacterMovementStateV1(input: unknown): CharacterMovementStateV1 {
  const schemaName = "CharacterMovementStateV1";
  const value = record(input) ?? invalid(schemaName);
  if (!exactWithOptional(value, [
    "schemaVersion", "tick", "positionMetersXYZ", "facingYawRadians",
    "linearVelocityMetersPerSecondXYZ", "locomotion", "transitionEvents", "runtimeState",
  ], ["jumpEpisode"])) invalid(schemaName);
  const commit = parseMovementCommitV1({
    schemaVersion: value.schemaVersion,
    tick: value.tick,
    positionMetersXYZ: value.positionMetersXYZ,
    facingYawRadians: value.facingYawRadians,
    linearVelocityMetersPerSecondXYZ: value.linearVelocityMetersPerSecondXYZ,
    locomotion: value.locomotion,
    transitionEvents: value.transitionEvents,
    ...(Object.hasOwn(value, "jumpEpisode") ? { jumpEpisode: value.jumpEpisode } : {}),
  });
  const state = Object.freeze({
    ...commit,
    runtimeState: parseCharacterMovementRuntimeStateV1(value.runtimeState),
  });
  assertCharacterMovementStateReachableV1(state);
  return state;
}

export function assertCharacterMovementStateReachableV1(
  state: CharacterMovementStateV1,
): void {
  const runtime = state.runtimeState;
  const locomotion = state.locomotion;
  const unreachable = (): never => {
    throw new RangeError(
      "3C_INPUT_INVALID: Character Movement runtime counters/latch are unreachable for Locomotion.",
    );
  };
  if (locomotion.status === "suspended") {
    if (runtime.coyoteTicksRemaining !== 0 || runtime.jumpBufferTicksRemaining !== 0 ||
      runtime.variableJumpHoldTicksRemaining !== 0 || runtime.landingTicksRemaining !== 0 ||
      runtime.apexCrossedInAirborneEpisode || state.jumpEpisode !== undefined) unreachable();
    return;
  }
  const phase = locomotion.verticalPhase;
  if (state.jumpEpisode?.phase === "buffered") {
    const isAlreadyJumpEligible =
      (locomotion.mobilityMode === "grounded" && locomotion.supportMode === "supported") ||
      runtime.coyoteTicksRemaining > 0;
    if (runtime.jumpBufferTicksRemaining <= 0 || isAlreadyJumpEligible) unreachable();
  }
  if (state.jumpEpisode?.phase === "airborne" &&
    (phase === "none" || phase === "landing")) unreachable();
  if ((phase === "takeoff" || phase === "rising") && locomotion.linearVelocity.y <= 0) {
    unreachable();
  }
  if (runtime.variableJumpHoldTicksRemaining > 0 && phase !== "takeoff" && phase !== "rising") {
    unreachable();
  }
  if (runtime.landingTicksRemaining > 0 && phase !== "landing") unreachable();
  if (runtime.apexCrossedInAirborneEpisode && phase !== "apex" && phase !== "falling") {
    unreachable();
  }
  if (phase === "apex" && !runtime.apexCrossedInAirborneEpisode) unreachable();
  if ((phase === "none" || phase === "takeoff" || phase === "rising" || phase === "landing") &&
    runtime.apexCrossedInAirborneEpisode) unreachable();
  if (runtime.coyoteTicksRemaining > 0) {
    const isStableSupported = locomotion.mobilityMode === "grounded" &&
      locomotion.supportMode === "supported";
    const isFallingCoyote = locomotion.mobilityMode === "airborne" && phase === "falling" &&
      !runtime.apexCrossedInAirborneEpisode;
    if (!isStableSupported && !isFallingCoyote) unreachable();
  }
}

export function parseCharacterMovementSnapshotV1(input: unknown): CharacterMovementSnapshotV1 {
  const schemaName = "CharacterMovementSnapshotV1";
  const value = record(input) ?? invalid(schemaName);
  if (!exactWithOptional(value, [
    "schemaVersion", "tick", "positionMetersXYZ", "facingYawRadians",
    "linearVelocityMetersPerSecondXYZ", "locomotion", "transitionEvents", "runtimeState",
    "stateHash",
  ], ["jumpEpisode"]) || typeof value.stateHash !== "string" ||
    !/^sha256:[a-f0-9]{64}$/.test(value.stateHash)) {
    invalid(schemaName);
  }
  const state = parseCharacterMovementStateV1({
    schemaVersion: value.schemaVersion,
    tick: value.tick,
    positionMetersXYZ: value.positionMetersXYZ,
    facingYawRadians: value.facingYawRadians,
    linearVelocityMetersPerSecondXYZ: value.linearVelocityMetersPerSecondXYZ,
    locomotion: value.locomotion,
    transitionEvents: value.transitionEvents,
    runtimeState: value.runtimeState,
    ...(Object.hasOwn(value, "jumpEpisode") ? { jumpEpisode: value.jumpEpisode } : {}),
  });
  return Object.freeze({ ...state, stateHash: value.stateHash as `sha256:${string}` });
}
