import type {
  ActiveLocomotionCapabilityStateV2,
  GaitV2,
} from "@whitebox-world/gameplay-contracts";
import { sha256CanonicalJson } from "@whitebox-world/protocol";

import {
  assertMovementTickTokenIdentityV1,
  createMovementTickTokenV1,
  isMovementTickTokenV1,
  parseBodyResolutionV1,
  parseBodySampleV1,
  parseBodySupportSampleV1,
  parseCharacterMovementCommandV1,
  parseCharacterMovementRuntimeStateV1,
  parseCharacterMovementSnapshotV1,
  parseCharacterMovementStateV1,
  parseJumpVariantPolicyV1,
  parseMovementCommitV1,
  parseMovementProposalV1,
  type BodyResolutionV1,
  type BodySampleV1,
  type BodySupportSampleV1,
  type CharacterMovementCommandV1,
  type CharacterMovementRuntimeStateV1,
  type CharacterMovementRuntimeV1,
  type CharacterMovementSnapshotV1,
  type CharacterMovementStateV1,
  type JumpEpisodeStateV1,
  type JumpVariantV1,
  type JumpVariantPolicyV1,
  type MovementCommitV1,
  type MovementProposalV1,
  type MovementTickTokenV1,
  type MovementVec3V1,
} from "./character-movement-contracts.js";
import {
  composeLayeredMovesV1,
  type LayeredMoveCompositionV1,
} from "./layered-move.js";
import { resolveVerticalTransitionV1 } from "./transition-resolver.js";

export interface CharacterMovementRuntimeOptionsV1 {
  readonly schemaVersion: 1;
  readonly fixedDeltaSeconds: number;
  readonly jumpVariantPolicy: JumpVariantPolicyV1;
  readonly initialState: CharacterMovementStateV1;
  readonly walkSpeedMetersPerSecond: number;
  readonly runSpeedMetersPerSecond: number;
  readonly accelerationMetersPerSecondSquared: number;
  readonly decelerationMetersPerSecondSquared: number;
  readonly turnRateRadiansPerSecond: number;
  readonly airControlRatio: number;
  readonly gravityMetersPerSecondSquared: number;
  readonly jumpSpeedMetersPerSecond: number;
  readonly coyoteTimeSeconds: number;
  readonly jumpBufferSeconds: number;
  readonly variableJumpHoldSeconds: number;
  readonly jumpHoldGravityRatio: number;
  readonly jumpReleaseGravityRatio: number;
  readonly landingDurationTicks: number;
  readonly apexEnterSpeedMetersPerSecond: number;
  readonly apexExitSpeedMetersPerSecond: number;
}

interface ConfiguredTickWindowsV1 {
  readonly coyoteTicks: number;
  readonly jumpBufferTicks: number;
  readonly variableJumpHoldTicks: number;
}

interface MovementTransactionV1 {
  readonly generation: number;
  readonly token: MovementTickTokenV1;
  readonly command: CharacterMovementCommandV1;
  readonly layeredComposition: LayeredMoveCompositionV1;
  sample?: BodySampleV1;
  proposal?: MovementProposalV1;
  takeoffProposed?: boolean;
  stagedJumpEpisode?: JumpEpisodeStateV1;
  reconciled: boolean;
}

export const BODY_RESOLUTION_COHERENCE_TOLERANCE_METERS_V1 = 1e-9;

function diagnostic(code: string, detail: string): Error {
  return new Error(`${code}: ${detail}`);
}

function inputInvalid(detail: string): never {
  throw diagnostic("3C_INPUT_INVALID", detail);
}

function dataRecord(input: unknown): Record<string, unknown> | undefined {
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
}

function exact(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const ownKeys = Reflect.ownKeys(value);
  return ownKeys.length === keys.length && ownKeys.every((key) =>
    typeof key === "string" && keys.includes(key)
  );
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && !Object.is(value, -0);
}

function inRange(value: unknown, minimum: number, maximum: number): value is number {
  return finite(value) && value >= minimum && value <= maximum;
}

function positiveSafeInteger(value: unknown, maximum: number): value is number {
  return finite(value) && Number.isSafeInteger(value) && value >= 1 && value <= maximum;
}

function ticksForSeconds(seconds: number, fixedDeltaSeconds: number): number {
  if (seconds === 0) return 0;
  return Math.ceil(seconds / fixedDeltaSeconds);
}

function configuredWindows(options: CharacterMovementRuntimeOptionsV1): ConfiguredTickWindowsV1 {
  return Object.freeze({
    coyoteTicks: ticksForSeconds(options.coyoteTimeSeconds, options.fixedDeltaSeconds),
    jumpBufferTicks: ticksForSeconds(options.jumpBufferSeconds, options.fixedDeltaSeconds),
    variableJumpHoldTicks: ticksForSeconds(
      options.variableJumpHoldSeconds,
      options.fixedDeltaSeconds,
    ),
  });
}

function splitAnticipationTicks(
  options: CharacterMovementRuntimeOptionsV1,
  variant: JumpVariantV1,
): number {
  if (options.jumpVariantPolicy.mode !== "run-selects-variant") return 0;
  return ticksForSeconds(
    variant === "small"
      ? options.jumpVariantPolicy.smallAnticipationSeconds
      : options.jumpVariantPolicy.largeAnticipationSeconds,
    options.fixedDeltaSeconds,
  );
}

function anticipatingEpisode(
  episode: Extract<JumpEpisodeStateV1, { phase: "buffered" }> | undefined,
  variant: JumpVariantV1,
  tick: number,
  anticipationTicksRemaining: number,
): Extract<JumpEpisodeStateV1, { phase: "anticipating" }> {
  return Object.freeze({
    schemaVersion: 1,
    variant,
    phase: "anticipating",
    startedTick: episode?.startedTick ?? tick,
    anticipationStartedTick: tick,
    committedTick: tick,
    anticipationTicksRemaining,
  });
}

function validateRuntimeStateCounters(
  state: CharacterMovementRuntimeStateV1,
  windows: ConfiguredTickWindowsV1,
  landingDurationTicks: number,
): void {
  if (state.coyoteTicksRemaining > windows.coyoteTicks ||
    state.jumpBufferTicksRemaining > windows.jumpBufferTicks ||
    state.variableJumpHoldTicksRemaining > windows.variableJumpHoldTicks ||
    state.landingTicksRemaining >= landingDurationTicks) {
    inputInvalid("serialized runtime counters exceed the configured fixed-Tick windows.");
  }
}

function validateStateAgainstRuntimeOptions(
  state: CharacterMovementStateV1,
  options: Pick<
    CharacterMovementRuntimeOptionsV1,
    "apexEnterSpeedMetersPerSecond" | "fixedDeltaSeconds" | "jumpVariantPolicy"
  >,
): void {
  if (options.jumpVariantPolicy.mode === "hold-height" && state.jumpEpisode !== undefined) {
    inputInvalid("hold-height policy cannot restore a split jump Episode.");
  }
  if (options.jumpVariantPolicy.mode === "run-selects-variant" &&
    state.jumpEpisode?.phase === "anticipating") {
    const durationSeconds = state.jumpEpisode.variant === "small"
      ? options.jumpVariantPolicy.smallAnticipationSeconds
      : options.jumpVariantPolicy.largeAnticipationSeconds;
    if (state.jumpEpisode.anticipationTicksRemaining >
      ticksForSeconds(durationSeconds, options.fixedDeltaSeconds)) {
      inputInvalid("jump Episode anticipation exceeds its locked fixed-Tick window.");
    }
  }
  if (options.jumpVariantPolicy.mode === "run-selects-variant") {
    const isBuffered = state.jumpEpisode?.phase === "buffered";
    if ((state.runtimeState.jumpBufferTicksRemaining > 0) !== isBuffered) {
      inputInvalid("split jump buffer state must carry exactly one buffered Episode.");
    }
    if (state.jumpEpisode?.phase === "airborne" && state.jumpEpisode.variant === "small" &&
      state.runtimeState.variableJumpHoldTicksRemaining > 0) {
      inputInvalid("small jump Episode cannot restore a held-jump gravity window.");
    }
  }
  if (state.locomotion.status !== "active") return;
  const phase = state.locomotion.verticalPhase;
  if ((phase === "takeoff" || phase === "rising") &&
    state.locomotion.linearVelocity.y <= options.apexEnterSpeedMetersPerSecond) {
    inputInvalid("serialized takeoff/rising velocity does not exceed the locked apex-enter threshold.");
  }
}

export function parseCharacterMovementRuntimeOptionsV1(
  input: unknown,
): CharacterMovementRuntimeOptionsV1 {
  const value = dataRecord(input);
  const keys = [
    "schemaVersion", "fixedDeltaSeconds", "jumpVariantPolicy", "initialState", "walkSpeedMetersPerSecond",
    "runSpeedMetersPerSecond", "accelerationMetersPerSecondSquared",
    "decelerationMetersPerSecondSquared", "turnRateRadiansPerSecond",
    "airControlRatio", "gravityMetersPerSecondSquared",
    "jumpSpeedMetersPerSecond", "coyoteTimeSeconds", "jumpBufferSeconds",
    "variableJumpHoldSeconds", "jumpHoldGravityRatio", "jumpReleaseGravityRatio",
    "landingDurationTicks", "apexEnterSpeedMetersPerSecond", "apexExitSpeedMetersPerSecond",
  ] as const;
  if (value === undefined || !exact(value, keys) || value.schemaVersion !== 1 ||
    !inRange(value.fixedDeltaSeconds, 1 / 1000, 1) ||
    !inRange(value.walkSpeedMetersPerSecond, 0, 8) ||
    !inRange(value.runSpeedMetersPerSecond, 0, 12) ||
    value.walkSpeedMetersPerSecond > value.runSpeedMetersPerSecond ||
    !inRange(value.accelerationMetersPerSecondSquared, 0, 60) ||
    !inRange(value.decelerationMetersPerSecondSquared, 0, 80) ||
    !inRange(value.turnRateRadiansPerSecond, 0, 20) ||
    !inRange(value.airControlRatio, 0, 1) ||
    !inRange(value.gravityMetersPerSecondSquared, Number.MIN_VALUE, 100) ||
    !inRange(value.jumpSpeedMetersPerSecond, Number.MIN_VALUE, 12) ||
    !inRange(value.coyoteTimeSeconds, 0, 0.4) ||
    !inRange(value.jumpBufferSeconds, 0, 0.4) ||
    !inRange(value.variableJumpHoldSeconds, 0, 0.5) ||
    !inRange(value.jumpHoldGravityRatio, 0.1, 1) ||
    !inRange(value.jumpReleaseGravityRatio, 1, 5) ||
    value.jumpHoldGravityRatio > value.jumpReleaseGravityRatio ||
    !positiveSafeInteger(value.landingDurationTicks, 120) ||
    !inRange(value.apexEnterSpeedMetersPerSecond, 0, 12) ||
    !inRange(value.apexExitSpeedMetersPerSecond, Number.MIN_VALUE, 12) ||
    value.apexEnterSpeedMetersPerSecond >= value.apexExitSpeedMetersPerSecond) {
    inputInvalid("runtime options do not match the closed Golden movement ranges.");
  }
  let jumpVariantPolicy: JumpVariantPolicyV1;
  try {
    jumpVariantPolicy = parseJumpVariantPolicyV1(value.jumpVariantPolicy);
  } catch {
    return inputInvalid("jumpVariantPolicy is invalid.");
  }
  let initialState: CharacterMovementStateV1;
  try {
    initialState = parseCharacterMovementStateV1(value.initialState);
  } catch {
    return inputInvalid("initialState is invalid.");
  }
  if (initialState.locomotion.status !== "active") {
    inputInvalid("initialState must contain active Locomotion V2.");
  }
  const parsed = Object.freeze({
    schemaVersion: 1,
    fixedDeltaSeconds: value.fixedDeltaSeconds,
    jumpVariantPolicy,
    initialState,
    walkSpeedMetersPerSecond: value.walkSpeedMetersPerSecond,
    runSpeedMetersPerSecond: value.runSpeedMetersPerSecond,
    accelerationMetersPerSecondSquared: value.accelerationMetersPerSecondSquared,
    decelerationMetersPerSecondSquared: value.decelerationMetersPerSecondSquared,
    turnRateRadiansPerSecond: value.turnRateRadiansPerSecond,
    airControlRatio: value.airControlRatio,
    gravityMetersPerSecondSquared: value.gravityMetersPerSecondSquared,
    jumpSpeedMetersPerSecond: value.jumpSpeedMetersPerSecond,
    coyoteTimeSeconds: value.coyoteTimeSeconds,
    jumpBufferSeconds: value.jumpBufferSeconds,
    variableJumpHoldSeconds: value.variableJumpHoldSeconds,
    jumpHoldGravityRatio: value.jumpHoldGravityRatio,
    jumpReleaseGravityRatio: value.jumpReleaseGravityRatio,
    landingDurationTicks: value.landingDurationTicks,
    apexEnterSpeedMetersPerSecond: value.apexEnterSpeedMetersPerSecond,
    apexExitSpeedMetersPerSecond: value.apexExitSpeedMetersPerSecond,
  });
  validateRuntimeStateCounters(
    parsed.initialState.runtimeState,
    configuredWindows(parsed),
    parsed.landingDurationTicks,
  );
  validateStateAgainstRuntimeOptions(parsed.initialState, parsed);
  return parsed;
}

export function hashCharacterMovementStateV1(
  input: CharacterMovementStateV1,
): `sha256:${string}` {
  const state = parseCharacterMovementStateV1(input);
  return sha256CanonicalJson(state) as `sha256:${string}`;
}

function snapshotFromState(state: CharacterMovementStateV1): CharacterMovementSnapshotV1 {
  return Object.freeze({ ...state, stateHash: hashCharacterMovementStateV1(state) });
}

function stateFromSnapshot(snapshot: CharacterMovementSnapshotV1): CharacterMovementStateV1 {
  return parseCharacterMovementStateV1({
    schemaVersion: snapshot.schemaVersion,
    tick: snapshot.tick,
    positionMetersXYZ: snapshot.positionMetersXYZ,
    facingYawRadians: snapshot.facingYawRadians,
    linearVelocityMetersPerSecondXYZ: snapshot.linearVelocityMetersPerSecondXYZ,
    locomotion: snapshot.locomotion,
    transitionEvents: snapshot.transitionEvents,
    runtimeState: snapshot.runtimeState,
    ...(snapshot.jumpEpisode === undefined ? {} : { jumpEpisode: snapshot.jumpEpisode }),
  });
}

function stableNumber(value: number): number {
  return value === 0 ? 0 : value;
}

function checkedFinite(value: number, detail: string): number {
  if (!Number.isFinite(value)) inputInvalid(`${detail} is non-finite.`);
  return stableNumber(value);
}

function checkedAdd(left: number, right: number, detail: string): number {
  return checkedFinite(left + right, detail);
}

function checkedMultiply(left: number, right: number, detail: string): number {
  return checkedFinite(left * right, detail);
}

function vec3(x: number, y: number, z: number): MovementVec3V1 {
  return Object.freeze([
    checkedFinite(x, "movement vector X"),
    checkedFinite(y, "movement vector Y"),
    checkedFinite(z, "movement vector Z"),
  ]);
}

function moveTowardXZ(
  currentX: number,
  currentZ: number,
  targetX: number,
  targetZ: number,
  maximumDelta: number,
): readonly [number, number] {
  const differenceX = targetX - currentX;
  const differenceZ = targetZ - currentZ;
  const distance = Math.hypot(differenceX, differenceZ);
  checkedFinite(differenceX, "horizontal response X");
  checkedFinite(differenceZ, "horizontal response Z");
  checkedFinite(distance, "horizontal response distance");
  if (distance === 0 || distance <= maximumDelta) return Object.freeze([targetX, targetZ]);
  const ratio = maximumDelta / distance;
  return Object.freeze([
    stableNumber(currentX + differenceX * ratio),
    stableNumber(currentZ + differenceZ * ratio),
  ]);
}

class DeterministicCharacterMovementRuntimeV1 implements CharacterMovementRuntimeV1 {
  readonly #options: CharacterMovementRuntimeOptionsV1;
  readonly #windows: ConfiguredTickWindowsV1;
  readonly #initialSnapshot: CharacterMovementSnapshotV1;
  readonly #transactions = new WeakMap<object, MovementTransactionV1>();
  #generation = 0;
  #activeTransaction: MovementTransactionV1 | undefined;
  #currentSnapshot: CharacterMovementSnapshotV1;
  #disposed = false;

  constructor(options: CharacterMovementRuntimeOptionsV1) {
    this.#options = options;
    this.#windows = configuredWindows(options);
    this.#initialSnapshot = snapshotFromState(options.initialState);
    this.#currentSnapshot = this.#initialSnapshot;
  }

  #assertLive(): void {
    if (this.#disposed) throw diagnostic("3C_RUNTIME_DISPOSED", "movement runtime is disposed.");
  }

  #transaction(token: MovementTickTokenV1): MovementTransactionV1 {
    this.#assertLive();
    if (!isMovementTickTokenV1(token)) {
      throw diagnostic("3C_TICK_TOKEN_STALE", "movement Tick token is not recognized.");
    }
    const transaction = this.#transactions.get(token);
    if (transaction === undefined || transaction.generation !== this.#generation) {
      throw diagnostic("3C_TICK_TOKEN_STALE", "movement Tick token is stale or belongs to another runtime.");
    }
    return transaction;
  }

  beginTick(input: CharacterMovementCommandV1): MovementTickTokenV1 {
    this.#assertLive();
    if (this.#activeTransaction !== undefined) {
      throw diagnostic("3C_TICK_TOKEN_STALE", "the previous movement Tick is still active.");
    }
    let command: CharacterMovementCommandV1;
    try {
      command = parseCharacterMovementCommandV1(input);
      const layeredComposition = composeLayeredMovesV1(command.layeredMoves);
      checkedAdd(
        this.#currentSnapshot.facingYawRadians,
        layeredComposition.facingYawDeltaRadians,
        "LayeredMove facing result",
      );
      if (command.tick !== this.#currentSnapshot.tick + 1 ||
        command.fixedDeltaSeconds !== this.#options.fixedDeltaSeconds) {
        inputInvalid("Command Tick or fixedDeltaSeconds does not match the runtime.");
      }
      const token = createMovementTickTokenV1();
      const transaction: MovementTransactionV1 = {
        generation: this.#generation,
        token,
        command,
        layeredComposition,
        reconciled: false,
      };
      this.#transactions.set(token, transaction);
      this.#activeTransaction = transaction;
      return token;
    } catch (error) {
      if (error instanceof Error && error.message.includes("3C_INPUT_INVALID")) throw error;
      return inputInvalid("movement Command is invalid.");
    }
  }

  proposeMovement(token: MovementTickTokenV1, input: BodySampleV1): MovementProposalV1 {
    const transaction = this.#transaction(token);
    if (transaction.proposal !== undefined) {
      throw diagnostic("3C_SUPPORT_SAMPLE_DUPLICATE", "support sample was already consumed for this Tick.");
    }
    if (transaction !== this.#activeTransaction || transaction.reconciled) {
      throw diagnostic("3C_TICK_TOKEN_STALE", "movement Tick token is no longer active.");
    }
    let sample: BodySampleV1;
    try {
      sample = parseBodySampleV1(input);
    } catch {
      return inputInvalid("BodySampleV1 is invalid.");
    }
    if (sample.tick !== transaction.command.tick || sample.token !== token) {
      throw diagnostic("3C_TICK_TOKEN_STALE", "BodySampleV1 provenance does not match the Tick token.");
    }
    assertMovementTickTokenIdentityV1(token, sample.token);

    const command = transaction.command;
    const priorRuntime = this.#currentSnapshot.runtimeState;
    const previousLocomotion = this.#currentSnapshot.locomotion;
    if (previousLocomotion.status !== "active") {
      throw diagnostic("3C_LOCOMOTION_TRANSITION_INVALID", "suspended Locomotion cannot propose movement.");
    }
    const isFirstUnsupportedLedgeTick = this.#windows.coyoteTicks > 0 &&
      sample.support.mode === "unsupported" &&
      previousLocomotion.mobilityMode === "grounded" &&
      previousLocomotion.supportMode === "supported";
    const isLiveFallingCoyote = sample.support.mode === "unsupported" &&
      previousLocomotion.verticalPhase === "falling" &&
      priorRuntime.coyoteTicksRemaining > 0;
    const jumpAllowed = sample.support.mode === "supported" ||
      isFirstUnsupportedLedgeTick || isLiveFallingCoyote;
    let takeoffProposed: boolean;
    let stagedJumpEpisode: JumpEpisodeStateV1 | undefined;
    if (this.#options.jumpVariantPolicy.mode === "hold-height") {
      const jumpIntentAvailable = command.jumpPressed || priorRuntime.jumpBufferTicksRemaining > 0;
      takeoffProposed = jumpIntentAvailable && jumpAllowed;
    } else {
      const previousEpisode = this.#currentSnapshot.jumpEpisode;
      if (previousEpisode?.phase === "airborne") {
        stagedJumpEpisode = Object.freeze({
          ...previousEpisode,
          committedTick: command.tick,
        });
        takeoffProposed = false;
      } else if (previousEpisode?.phase === "anticipating") {
        const anticipationTicksRemaining = Math.max(
          0,
          previousEpisode.anticipationTicksRemaining - 1,
        );
        stagedJumpEpisode = Object.freeze({
          ...previousEpisode,
          committedTick: command.tick,
          anticipationTicksRemaining,
        });
        takeoffProposed = anticipationTicksRemaining === 0;
      } else {
        const bufferedEpisode = previousEpisode?.phase === "buffered"
          ? previousEpisode
          : command.jumpPressed
            ? Object.freeze({
                schemaVersion: 1 as const,
                variant: command.runRequested ? "large" as const : "small" as const,
                phase: "buffered" as const,
                startedTick: command.tick,
                committedTick: command.tick,
              })
            : undefined;
        if (bufferedEpisode === undefined) {
          takeoffProposed = false;
        } else if (jumpAllowed) {
          const anticipationTicksRemaining = splitAnticipationTicks(
            this.#options,
            bufferedEpisode.variant,
          );
          stagedJumpEpisode = anticipatingEpisode(
            bufferedEpisode,
            bufferedEpisode.variant,
            command.tick,
            anticipationTicksRemaining,
          );
          takeoffProposed = anticipationTicksRemaining === 0;
        } else {
          stagedJumpEpisode = Object.freeze({
            ...bufferedEpisode,
            committedTick: command.tick,
          });
          takeoffProposed = false;
        }
      }
    }
    const inputMagnitude = Math.hypot(command.movementInputXZ[0], command.movementInputXZ[1]);
    const rightX = Math.cos(command.viewYawRadians);
    const rightZ = -Math.sin(command.viewYawRadians);
    const forwardX = -Math.sin(command.viewYawRadians);
    const forwardZ = -Math.cos(command.viewYawRadians);
    const directionX = inputMagnitude === 0
      ? 0
      : (rightX * command.movementInputXZ[0] + forwardX * command.movementInputXZ[1]) / inputMagnitude;
    const directionZ = inputMagnitude === 0
      ? 0
      : (rightZ * command.movementInputXZ[0] + forwardZ * command.movementInputXZ[1]) / inputMagnitude;
    const facingInputMagnitude = Math.hypot(
      command.facingInputXZ[0],
      command.facingInputXZ[1],
    );
    const facingDirectionX = facingInputMagnitude === 0
      ? 0
      : (rightX * command.facingInputXZ[0] +
          forwardX * command.facingInputXZ[1]) / facingInputMagnitude;
    const facingDirectionZ = facingInputMagnitude === 0
      ? 0
      : (rightZ * command.facingInputXZ[0] +
          forwardZ * command.facingInputXZ[1]) / facingInputMagnitude;
    const requestedSpeed = (command.runRequested
      ? this.#options.runSpeedMetersPerSecond
      : this.#options.walkSpeedMetersPerSecond) * inputMagnitude;
    const targetX = directionX * requestedSpeed;
    const targetZ = directionZ * requestedSpeed;
    const response = inputMagnitude > 0
      ? this.#options.accelerationMetersPerSecondSquared
      : this.#options.decelerationMetersPerSecondSquared;
    const airRatio = sample.support.mode === "unsupported" ? this.#options.airControlRatio : 1;
    const horizontal = moveTowardXZ(
      sample.linearVelocityMetersPerSecondXYZ[0],
      sample.linearVelocityMetersPerSecondXYZ[2],
      targetX,
      targetZ,
      checkedMultiply(
        checkedMultiply(response, airRatio, "horizontal response ratio"),
        this.#options.fixedDeltaSeconds,
        "horizontal response Tick delta",
      ),
    );

    let verticalVelocity = 0;
    if (takeoffProposed) {
      verticalVelocity = this.#options.jumpSpeedMetersPerSecond;
    } else if (sample.support.mode === "unsupported") {
      const locomotion = this.#currentSnapshot.locomotion;
      const isAscendingJump = locomotion.status === "active" &&
        (locomotion.verticalPhase === "takeoff" || locomotion.verticalPhase === "rising");
      const isSmallSplitJump = this.#options.jumpVariantPolicy.mode === "run-selects-variant" &&
        this.#currentSnapshot.jumpEpisode?.phase === "airborne" &&
        this.#currentSnapshot.jumpEpisode.variant === "small";
      const gravityRatio = isAscendingJump
        ? !isSmallSplitJump && command.jumpHeld && priorRuntime.variableJumpHoldTicksRemaining > 0
          ? this.#options.jumpHoldGravityRatio
          : this.#options.jumpReleaseGravityRatio
        : 1;
      verticalVelocity = checkedAdd(
        sample.linearVelocityMetersPerSecondXYZ[1],
        -checkedMultiply(
          checkedMultiply(
            this.#options.gravityMetersPerSecondSquared,
            gravityRatio,
            "gravity phase ratio",
          ),
          this.#options.fixedDeltaSeconds,
          "gravity Tick delta",
        ),
        "vertical velocity",
      );
    }

    const layered = transaction.layeredComposition;
    const proposedVelocity = vec3(
      checkedAdd(horizontal[0], layered.velocityDeltaMetersPerSecondXYZ[0], "proposed velocity X"),
      checkedAdd(verticalVelocity, layered.velocityDeltaMetersPerSecondXYZ[1], "proposed velocity Y"),
      checkedAdd(horizontal[1], layered.velocityDeltaMetersPerSecondXYZ[2], "proposed velocity Z"),
    );
    let facingYaw = this.#currentSnapshot.facingYawRadians;
    if (facingInputMagnitude > 0) {
      const targetFacingYaw = Math.atan2(-facingDirectionX, -facingDirectionZ);
      const shortestDelta = Math.atan2(
        Math.sin(targetFacingYaw - facingYaw),
        Math.cos(targetFacingYaw - facingYaw),
      );
      const maximumTurn = checkedMultiply(
        this.#options.turnRateRadiansPerSecond,
        this.#options.fixedDeltaSeconds,
        "maximum facing turn",
      );
      const appliedTurn = Math.max(
        -maximumTurn,
        Math.min(maximumTurn, shortestDelta),
      );
      const turnedFacingYaw = checkedAdd(
        facingYaw,
        appliedTurn,
        "facing yaw",
      );
      facingYaw = Math.atan2(
        Math.sin(turnedFacingYaw),
        Math.cos(turnedFacingYaw),
      );
    }
    facingYaw = checkedAdd(facingYaw, layered.facingYawDeltaRadians, "proposed facing yaw");
    const proposal = parseMovementProposalV1({
      schemaVersion: 1,
      token,
      tick: command.tick,
      translationDeltaMetersXYZ: vec3(
        checkedAdd(
          checkedMultiply(proposedVelocity[0], this.#options.fixedDeltaSeconds, "velocity displacement X"),
          layered.translationDeltaMetersXYZ[0],
          "proposed translation X",
        ),
        checkedAdd(
          checkedMultiply(proposedVelocity[1], this.#options.fixedDeltaSeconds, "velocity displacement Y"),
          layered.translationDeltaMetersXYZ[1],
          "proposed translation Y",
        ),
        checkedAdd(
          checkedMultiply(proposedVelocity[2], this.#options.fixedDeltaSeconds, "velocity displacement Z"),
          layered.translationDeltaMetersXYZ[2],
          "proposed translation Z",
        ),
      ),
      proposedLinearVelocityMetersPerSecondXYZ: proposedVelocity,
      proposedFacingYawRadians: facingYaw,
      layeredMoves: layered.orderedMoves,
    });
    transaction.sample = sample;
    transaction.proposal = proposal;
    transaction.takeoffProposed = takeoffProposed;
    if (stagedJumpEpisode !== undefined) {
      transaction.stagedJumpEpisode = stagedJumpEpisode;
    }
    return proposal;
  }

  reconcile(token: MovementTickTokenV1, input: BodyResolutionV1): MovementCommitV1 {
    const transaction = this.#transaction(token);
    if (transaction.reconciled) {
      throw diagnostic("3C_BODY_RESOLUTION_DUPLICATE", "BodyResolutionV1 was already reconciled.");
    }
    if (transaction !== this.#activeTransaction || transaction.proposal === undefined ||
      transaction.sample === undefined) {
      throw diagnostic("3C_TICK_TOKEN_STALE", "movement proposal is unavailable for this Tick token.");
    }
    let result: BodyResolutionV1;
    try {
      result = parseBodyResolutionV1(input);
    } catch {
      return inputInvalid("BodyResolutionV1 is invalid.");
    }
    if (result.tick !== transaction.command.tick || result.token !== token) {
      throw diagnostic("3C_TICK_TOKEN_STALE", "BodyResolutionV1 provenance does not match the Tick token.");
    }
    assertMovementTickTokenIdentityV1(token, result.token);
    this.#assertResolutionCoherent(transaction.sample, transaction.proposal, result);

    const previousLocomotion = this.#currentSnapshot.locomotion;
    if (previousLocomotion.status !== "active") {
      throw diagnostic("3C_LOCOMOTION_TRANSITION_INVALID", "suspended Locomotion cannot reconcile movement.");
    }
    const takeoffResolved = (transaction.takeoffProposed ?? false) &&
      result.support.mode === "unsupported" &&
      result.linearVelocityMetersPerSecondXYZ[1] > this.#options.apexEnterSpeedMetersPerSecond;
    const physicalTakeoff = !(transaction.takeoffProposed ?? false) &&
      result.support.mode === "unsupported" &&
      previousLocomotion.mobilityMode === "grounded" &&
      result.linearVelocityMetersPerSecondXYZ[1] > this.#options.apexEnterSpeedMetersPerSecond;
    let transition;
    try {
      transition = resolveVerticalTransitionV1({
        tick: transaction.command.tick,
        fromVerticalPhase: previousLocomotion.verticalPhase,
        phaseEnteredTick: previousLocomotion.phaseEnteredTick,
        transitionSequence: previousLocomotion.transitionSequence,
        resolvedSupportMode: result.support.mode,
        resolvedVerticalSpeedMetersPerSecond: result.linearVelocityMetersPerSecondXYZ[1],
        hasCeilingContact: result.hasCeilingContact,
        takeoffRequested: takeoffResolved || physicalTakeoff,
        landingDurationTicks: this.#options.landingDurationTicks,
        landingTicksRemaining: this.#currentSnapshot.runtimeState.landingTicksRemaining,
        apexEnterSpeedMetersPerSecond: this.#options.apexEnterSpeedMetersPerSecond,
        apexExitSpeedMetersPerSecond: this.#options.apexExitSpeedMetersPerSecond,
        apexCrossedInAirborneEpisode:
          this.#currentSnapshot.runtimeState.apexCrossedInAirborneEpisode,
      });
    } catch {
      throw diagnostic("3C_LOCOMOTION_TRANSITION_INVALID", "BodyResolutionV1 produced an illegal phase transition.");
    }

    const velocity = vec3(
      result.linearVelocityMetersPerSecondXYZ[0],
      transition.correctedVerticalSpeedMetersPerSecond,
      result.linearVelocityMetersPerSecondXYZ[2],
    );
    const horizontalSpeed = checkedFinite(
      Math.hypot(velocity[0], velocity[2]),
      "resolved horizontal speed",
    );
    const isGrounded = result.support.mode !== "unsupported";
    let gait: GaitV2 = "none";
    if (isGrounded) {
      gait = horizontalSpeed === 0
        ? "idle"
        : transaction.command.runRequested
          ? "run"
          : "walk";
    }
    const locomotion: ActiveLocomotionCapabilityStateV2 = {
      schemaVersion: 2,
      status: "active",
      mobilityMode: isGrounded ? "grounded" : "airborne",
      gait,
      verticalPhase: transition.verticalPhase,
      supportMode: result.support.mode,
      movementMedium: isGrounded ? "ground" : "air",
      facingYawRadians: transaction.proposal.proposedFacingYawRadians,
      linearVelocity: { x: velocity[0], y: velocity[1], z: velocity[2] },
      horizontalSpeedMetersPerSecond: horizontalSpeed,
      committedTick: transaction.command.tick,
      phaseEnteredTick: transition.phaseEnteredTick,
      transitionSequence: transition.transitionSequence,
    };

    const priorRuntime = this.#currentSnapshot.runtimeState;
    const takeoffCommitted = transition.events.some((event) =>
      event.type === "phase-changed" && event.toVerticalPhase === "takeoff"
    );
    let jumpEpisode = transaction.stagedJumpEpisode;
    if (this.#options.jumpVariantPolicy.mode === "run-selects-variant") {
      if (jumpEpisode?.phase === "buffered" && result.support.mode === "supported") {
        jumpEpisode = anticipatingEpisode(
          jumpEpisode,
          jumpEpisode.variant,
          transaction.command.tick,
          splitAnticipationTicks(this.#options, jumpEpisode.variant),
        );
      }
      if (takeoffCommitted && jumpEpisode?.phase === "anticipating") {
        jumpEpisode = Object.freeze({
          schemaVersion: 1,
          variant: jumpEpisode.variant,
          phase: "airborne",
          startedTick: jumpEpisode.startedTick,
          anticipationStartedTick: jumpEpisode.anticipationStartedTick,
          takeoffTick: transaction.command.tick,
          committedTick: transaction.command.tick,
        });
      }
      if (jumpEpisode?.phase === "airborne" &&
        (result.hasCeilingContact || result.support.mode !== "unsupported" ||
          transition.verticalPhase === "landing")) {
        jumpEpisode = undefined;
      }
    }
    const departedStableSupport = previousLocomotion.supportMode === "supported" &&
      result.support.mode === "unsupported" && !takeoffCommitted;
    const coyoteTicksRemaining = takeoffCommitted || result.support.mode === "sliding"
      ? 0
      : result.support.mode === "supported"
        ? this.#windows.coyoteTicks
        : departedStableSupport
          ? Math.max(0, this.#windows.coyoteTicks - 1)
          : Math.max(0, priorRuntime.coyoteTicksRemaining - 1);
    let jumpBufferTicksRemaining: number;
    if (this.#options.jumpVariantPolicy.mode === "run-selects-variant") {
      if (jumpEpisode?.phase === "buffered") {
        jumpBufferTicksRemaining = this.#currentSnapshot.jumpEpisode?.phase === "buffered"
          ? Math.max(0, priorRuntime.jumpBufferTicksRemaining - 1)
          : Math.max(0, this.#windows.jumpBufferTicks - 1);
        if (jumpBufferTicksRemaining === 0) jumpEpisode = undefined;
      } else {
        jumpBufferTicksRemaining = 0;
      }
    } else if (takeoffCommitted) jumpBufferTicksRemaining = 0;
    else if (transaction.command.jumpPressed) {
      jumpBufferTicksRemaining = Math.max(0, this.#windows.jumpBufferTicks - 1);
    } else jumpBufferTicksRemaining = Math.max(0, priorRuntime.jumpBufferTicksRemaining - 1);
    const isSmallSplitJump = this.#options.jumpVariantPolicy.mode === "run-selects-variant" &&
      jumpEpisode?.phase === "airborne" && jumpEpisode.variant === "small";
    let variableJumpHoldTicksRemaining = 0;
    if (takeoffCommitted &&
      (transition.verticalPhase === "takeoff" || transition.verticalPhase === "rising") &&
      !isSmallSplitJump) {
      variableJumpHoldTicksRemaining = this.#windows.variableJumpHoldTicks;
    }
    else if ((previousLocomotion.verticalPhase === "takeoff" || previousLocomotion.verticalPhase === "rising") &&
      (transition.verticalPhase === "takeoff" || transition.verticalPhase === "rising") &&
      transaction.command.jumpHeld && !isSmallSplitJump) {
      variableJumpHoldTicksRemaining = Math.max(0, priorRuntime.variableJumpHoldTicksRemaining - 1);
    }
    const runtimeState = parseCharacterMovementRuntimeStateV1({
      schemaVersion: 1,
      coyoteTicksRemaining,
      jumpBufferTicksRemaining,
      variableJumpHoldTicksRemaining,
      landingTicksRemaining: transition.landingTicksRemaining,
      apexCrossedInAirborneEpisode: transition.apexCrossedInAirborneEpisode,
    });
    let commit: MovementCommitV1;
    let state: CharacterMovementStateV1;
    try {
      commit = parseMovementCommitV1({
        schemaVersion: 1,
        tick: transaction.command.tick,
        positionMetersXYZ: result.positionMetersXYZ,
        facingYawRadians: transaction.proposal.proposedFacingYawRadians,
        linearVelocityMetersPerSecondXYZ: velocity,
        locomotion,
        transitionEvents: transition.events,
        ...(jumpEpisode === undefined ? {} : { jumpEpisode }),
      });
      state = parseCharacterMovementStateV1({ ...commit, runtimeState });
    } catch {
      throw diagnostic("3C_LOCOMOTION_TRANSITION_INVALID", "reconciled Locomotion commit is incoherent.");
    }
    const nextSnapshot = snapshotFromState(state);
    transaction.reconciled = true;
    this.#activeTransaction = undefined;
    this.#currentSnapshot = nextSnapshot;
    return commit;
  }

  snapshot(): CharacterMovementSnapshotV1 {
    this.#assertLive();
    return this.#currentSnapshot;
  }

  reconcileSupportAfterReset(
    input: BodySupportSampleV1,
    activeTickToken: MovementTickTokenV1 | undefined,
  ): CharacterMovementSnapshotV1 {
    this.#assertLive();
    if (this.#activeTransaction === undefined && activeTickToken !== undefined) {
      throw diagnostic(
        "3C_TICK_TOKEN_STALE",
        "reset support received a Tick token without an active Tick.",
      );
    }
    if (this.#activeTransaction !== undefined) {
      if (activeTickToken === undefined ||
        this.#transaction(activeTickToken) !== this.#activeTransaction ||
        this.#activeTransaction.proposal !== undefined ||
        this.#currentSnapshot.tick !== 0) {
        throw diagnostic(
          "3C_TICK_TOKEN_STALE",
          "only the first active Tick may reconcile reset support.",
        );
      }
    }
    let support: BodySupportSampleV1;
    try {
      support = parseBodySupportSampleV1(input);
    } catch {
      return inputInvalid("reset BodySupportSampleV1 is invalid.");
    }
    const current = this.#currentSnapshot;
    if (current.locomotion.status !== "active") {
      throw diagnostic(
        "3C_LOCOMOTION_TRANSITION_INVALID",
        "suspended Locomotion cannot reconcile reset support.",
      );
    }
    const isGrounded = support.mode !== "unsupported";
    const velocity = current.linearVelocityMetersPerSecondXYZ;
    const horizontalSpeed = checkedFinite(
      Math.hypot(velocity[0], velocity[2]),
      "reset horizontal speed",
    );
    const gait: GaitV2 = !isGrounded
      ? "none"
      : horizontalSpeed === 0
        ? "idle"
        : current.locomotion.gait === "run"
          ? "run"
          : "walk";
    const verticalPhase = isGrounded ? "none" as const : "falling" as const;
    const movementMedium = isGrounded ? "ground" as const : "air" as const;
    const semanticChanged =
      current.locomotion.mobilityMode !== (isGrounded ? "grounded" : "airborne") ||
      current.locomotion.gait !== gait ||
      current.locomotion.verticalPhase !== verticalPhase ||
      current.locomotion.supportMode !== support.mode ||
      current.locomotion.movementMedium !== movementMedium;
    if (semanticChanged &&
      current.locomotion.transitionSequence === Number.MAX_SAFE_INTEGER) {
      return inputInvalid("reset Locomotion transition sequence is exhausted.");
    }
    const state = parseCharacterMovementStateV1({
      schemaVersion: 1,
      tick: current.tick,
      positionMetersXYZ: current.positionMetersXYZ,
      facingYawRadians: current.facingYawRadians,
      linearVelocityMetersPerSecondXYZ: velocity,
      locomotion: {
        ...current.locomotion,
        mobilityMode: isGrounded ? "grounded" : "airborne",
        gait,
        verticalPhase,
        supportMode: support.mode,
        movementMedium,
        linearVelocity: { x: velocity[0], y: velocity[1], z: velocity[2] },
        horizontalSpeedMetersPerSecond: horizontalSpeed,
        phaseEnteredTick: semanticChanged
          ? current.tick
          : current.locomotion.phaseEnteredTick,
        transitionSequence: semanticChanged
          ? current.locomotion.transitionSequence + 1
          : current.locomotion.transitionSequence,
      },
      transitionEvents: [],
      runtimeState: {
        ...current.runtimeState,
        coyoteTicksRemaining:
          support.mode === "supported" ? this.#windows.coyoteTicks : 0,
        landingTicksRemaining: 0,
        apexCrossedInAirborneEpisode: false,
      },
      ...(!isGrounded || current.jumpEpisode === undefined
        ? current.jumpEpisode === undefined
          ? {}
          : { jumpEpisode: current.jumpEpisode }
        : {}),
    });
    this.#currentSnapshot = snapshotFromState(state);
    return this.#currentSnapshot;
  }

  #assertResolutionCoherent(
    sample: BodySampleV1,
    proposal: MovementProposalV1,
    result: BodyResolutionV1,
  ): void {
    const tolerance = BODY_RESOLUTION_COHERENCE_TOLERANCE_METERS_V1;
    for (let axis = 0; axis < 3; axis += 1) {
      const expectedPosition = checkedAdd(
        sample.positionMetersXYZ[axis]!,
        result.appliedTranslationMetersXYZ[axis]!,
        "resolved position",
      );
      if (Math.abs(result.positionMetersXYZ[axis]! - expectedPosition) > tolerance) {
        inputInvalid("BodyResolution position does not equal sample position plus applied translation.");
      }
    }
    const translationDifference = Math.max(
      ...result.appliedTranslationMetersXYZ.map((value, axis) =>
        Math.abs(value - proposal.translationDeltaMetersXYZ[axis]!)
      ),
    );
    checkedFinite(translationDifference, "BodyResolution translation difference");
    if ((!result.isTranslationLimited && translationDifference > tolerance) ||
      (result.isTranslationLimited && translationDifference <= tolerance)) {
      inputInvalid("BodyResolution translation-limited flag contradicts the applied translation.");
    }
  }

  reset(input?: CharacterMovementSnapshotV1): void {
    this.#assertLive();
    let snapshot = this.#initialSnapshot;
    if (input !== undefined) {
      try {
        snapshot = parseCharacterMovementSnapshotV1(input);
      } catch {
        return inputInvalid("reset Snapshot is invalid.");
      }
      if (snapshot.stateHash !== hashCharacterMovementStateV1(stateFromSnapshot(snapshot))) {
        inputInvalid("reset Snapshot stateHash does not match its serialized runtime state.");
      }
      validateRuntimeStateCounters(
        snapshot.runtimeState,
        this.#windows,
        this.#options.landingDurationTicks,
      );
      validateStateAgainstRuntimeOptions(snapshot, this.#options);
    }
    this.#generation += 1;
    this.#activeTransaction = undefined;
    this.#currentSnapshot = snapshot;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#generation += 1;
    this.#activeTransaction = undefined;
  }
}

export function createCharacterMovementRuntimeV1(
  input: CharacterMovementRuntimeOptionsV1,
): CharacterMovementRuntimeV1 {
  const options = parseCharacterMovementRuntimeOptionsV1(input);
  return new DeterministicCharacterMovementRuntimeV1(options);
}
