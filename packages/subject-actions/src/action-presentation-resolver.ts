import {
  parseLayeredMoveV1,
  parseJumpEpisodeStateV1,
  sampleLockedRootMotionSourceV1,
  type JumpEpisodeStateV1,
  type LayeredMoveV1,
} from "@whitebox-world/character-movement";
import {
  parseLocomotionCapabilityStateV2,
  type GameplayActionStateV1,
  type LocomotionCapabilityStateV2,
} from "@whitebox-world/gameplay-contracts";
import {
  AUTOMATIC_LOCOMOTION_PRESENTATION_KEYS_V1,
} from "@whitebox-world/subject-contracts";

import type {
  ActionPresentationBindingV1,
  ActionPresentationResourceRefV1,
  ActionPresentationRegistryV1,
  ActionPresentationResolveInputV1,
  LocomotionPresentationKeyV1,
  ResolvedActionPresentationV1,
} from "./types.js";

const SHA256 = /^sha256:[a-f0-9]{64}$/;
const SEMANTIC_ACTION_REF =
  /^worldkit:\/\/semantic-action\/([a-z0-9]+(?:[.-][a-z0-9]+)*)@([1-9][0-9]*)$/;
const ACTION_PRESENTATION_REF =
  /^worldkit:\/\/action-presentation\/([a-z0-9]+(?:[.-][a-z0-9]+)*)@([1-9][0-9]*)$/;
const ACTION_PRESENTATION_KEY =
  /^action\.([a-z0-9]+(?:[.-][a-z0-9]+)*)$/;
const LOCOMOTION_PRESENTATION_KEYS = new Set<LocomotionPresentationKeyV1>(
  AUTOMATIC_LOCOMOTION_PRESENTATION_KEYS_V1,
);

function invalid(detail: string): never {
  throw new RangeError(`3C_INPUT_INVALID: ${detail}`);
}

function unresolved(detail: string): never {
  throw new RangeError(`3C_LAYERED_MOVE_SOURCE_UNRESOLVED: ${detail}`);
}

function dataRecord(input: unknown): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return invalid("Action presentation input must be a plain object.");
  }
  const prototype = Reflect.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) {
    return invalid("Action presentation input must be a plain object.");
  }
  const result = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(input)) {
    const descriptor = Reflect.getOwnPropertyDescriptor(input, key);
    if (typeof key !== "string" || descriptor === undefined ||
      !descriptor.enumerable || !("value" in descriptor)) {
      return invalid("Action presentation input cannot contain symbols, accessors, or hidden fields.");
    }
    result[key] = descriptor.value;
  }
  return result;
}

function exact(record: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Reflect.ownKeys(record);
  return actual.length === keys.length && actual.every((key) =>
    typeof key === "string" && keys.includes(key)
  );
}

function strictArray(input: unknown): readonly unknown[] {
  if (!Array.isArray(input) || Reflect.getPrototypeOf(input) !== Array.prototype ||
    Reflect.ownKeys(input).some((key) => typeof key === "symbol") ||
    Object.getOwnPropertyNames(input).length !== input.length + 1) {
    return invalid("resolved LayeredMoves must be a canonical dense Array.");
  }
  const result: unknown[] = [];
  for (let index = 0; index < input.length; index += 1) {
    const descriptor = Reflect.getOwnPropertyDescriptor(input, String(index));
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
      return invalid("resolved LayeredMoves must be a canonical dense Array.");
    }
    result.push(descriptor.value);
  }
  const length = Reflect.getOwnPropertyDescriptor(input, "length");
  if (length === undefined || length.enumerable) {
    return invalid("resolved LayeredMoves must be a canonical dense Array.");
  }
  return result;
}

function safeTick(input: unknown, label: string): number {
  if (typeof input !== "number" || !Number.isSafeInteger(input) || input < 0 ||
    Object.is(input, -0)) return invalid(`${label} must be a non-negative safe integer.`);
  return input;
}

function finitePositive(input: unknown, label: string): number {
  if (typeof input !== "number" || !Number.isFinite(input) || input <= 0 ||
    Object.is(input, -0)) return invalid(`${label} must be finite and positive.`);
  return input;
}

function wellFormed(input: string): boolean {
  for (let index = 0; index < input.length; index += 1) {
    const current = input.charCodeAt(index);
    if (current >= 0xd800 && current <= 0xdbff) {
      const next = input.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (current >= 0xdc00 && current <= 0xdfff) return false;
  }
  return true;
}

function stableString(input: unknown): input is string {
  return typeof input === "string" && input.length > 0 && input.length <= 256 &&
    wellFormed(input) && input.normalize("NFC") === input;
}

function actionState(input: unknown, committedTick: number): GameplayActionStateV1 {
  const value = dataRecord(input);
  const baseKeys = [
    "id", "kind", "semanticActionRef", "semanticActionHash", "actorEntityId",
    "mode", "startedSimulationTick", "lastTransitionSimulationTick",
  ] as const;
  const requestKeys = [...baseKeys, "actionRequestRef", "actionRequestHash"];
  const hasRequest = exact(value, requestKeys);
  const refMatch = typeof value.semanticActionRef === "string"
    ? SEMANTIC_ACTION_REF.exec(value.semanticActionRef)
    : null;
  const refVersion = refMatch?.[2] === undefined ? Number.NaN : Number(refMatch[2]);
  if ((!exact(value, baseKeys) && !hasRequest) || value.kind !== "action-state" ||
    !stableString(value.id) || !stableString(value.actorEntityId) ||
    refMatch?.[1] === undefined || refMatch[1].length > 64 ||
    !Number.isSafeInteger(refVersion) || refVersion <= 0 ||
    typeof value.semanticActionHash !== "string" || !SHA256.test(value.semanticActionHash) ||
    !["starting", "active", "completing"].includes(value.mode as string)) {
    return invalid("activeActionState is not canonical committed Action data.");
  }
  const startedSimulationTick = safeTick(
    value.startedSimulationTick,
    "Action startedSimulationTick",
  );
  const lastTransitionSimulationTick = safeTick(
    value.lastTransitionSimulationTick,
    "Action lastTransitionSimulationTick",
  );
  if (startedSimulationTick > lastTransitionSimulationTick ||
    lastTransitionSimulationTick > committedTick) {
    return invalid("Action lifecycle Ticks cannot be in the future or reversed.");
  }
  if (hasRequest && (!stableString(value.actionRequestRef) ||
    typeof value.actionRequestHash !== "string" || !SHA256.test(value.actionRequestHash))) {
    return invalid("Action Request lock is not canonical.");
  }
  return Object.freeze({
    id: value.id,
    kind: "action-state",
    semanticActionRef: value.semanticActionRef as string,
    semanticActionHash: value.semanticActionHash as `sha256:${string}`,
    actorEntityId: value.actorEntityId,
    mode: value.mode as GameplayActionStateV1["mode"],
    startedSimulationTick,
    lastTransitionSimulationTick,
    ...(hasRequest
      ? {
          actionRequestRef: value.actionRequestRef as string,
          actionRequestHash: value.actionRequestHash as `sha256:${string}`,
        }
      : {}),
  });
}

function parseInput(input: unknown): ActionPresentationResolveInputV1 {
  const value = dataRecord(input);
  const base = [
    "schemaVersion", "committedTick", "fixedDeltaSeconds", "locomotion",
  ] as const;
  const hasAction = Object.hasOwn(value, "activeActionState");
  const hasJumpEpisode = Object.hasOwn(value, "jumpEpisode");
  const keys = [
    ...base,
    ...(hasJumpEpisode ? ["jumpEpisode"] : []),
    ...(hasAction ? ["activeActionState"] : []),
  ];
  if (!exact(value, keys) || value.schemaVersion !== 1) {
    return invalid("ActionPresentationResolveInputV1 has an invalid closed shape.");
  }
  const committedTick = safeTick(value.committedTick, "committedTick");
  let locomotion: LocomotionCapabilityStateV2;
  try {
    locomotion = parseLocomotionCapabilityStateV2(value.locomotion);
  } catch {
    return invalid("locomotion is not canonical LocomotionCapabilityStateV2.");
  }
  if (locomotion.committedTick !== committedTick) {
    return invalid("locomotion and presentation committed Ticks differ.");
  }
  let jumpEpisode: JumpEpisodeStateV1 | undefined;
  if (hasJumpEpisode) {
    try {
      jumpEpisode = parseJumpEpisodeStateV1(value.jumpEpisode);
    } catch {
      return invalid("jumpEpisode is not canonical committed Movement data.");
    }
    if (jumpEpisode.committedTick !== committedTick) {
      return invalid("jump Episode and presentation committed Ticks differ.");
    }
    if (jumpEpisode.phase === "airborne" &&
      (locomotion.status !== "active" || locomotion.mobilityMode !== "airborne" ||
        locomotion.verticalPhase === "none" || locomotion.verticalPhase === "landing")) {
      return invalid("airborne jump Episode contradicts committed Locomotion.");
    }
  }
  return Object.freeze({
    schemaVersion: 1,
    committedTick,
    fixedDeltaSeconds: finitePositive(value.fixedDeltaSeconds, "fixedDeltaSeconds"),
    locomotion,
    ...(jumpEpisode === undefined ? {} : { jumpEpisode }),
    ...(hasAction
      ? { activeActionState: actionState(value.activeActionState, committedTick) }
      : {}),
  });
}

function locomotionKey(
  state: LocomotionCapabilityStateV2,
  jumpEpisode?: JumpEpisodeStateV1,
): LocomotionPresentationKeyV1 {
  if (jumpEpisode?.phase === "anticipating") {
    return jumpEpisode.variant === "small"
      ? "locomotion.small-jump.takeoff"
      : "locomotion.takeoff";
  }
  if (jumpEpisode?.phase === "airborne" && jumpEpisode.variant === "small") {
    return "locomotion.small-jump.airborne";
  }
  if (state.status === "suspended") return "locomotion.suspended";
  if (state.verticalPhase !== "none") return `locomotion.${state.verticalPhase}`;
  return `locomotion.${state.gait}` as LocomotionPresentationKeyV1;
}

function rootMotionMove(
  input: ActionPresentationResolveInputV1,
  registry: ActionPresentationRegistryV1,
  binding: ActionPresentationBindingV1,
): readonly LayeredMoveV1[] {
  const action = input.activeActionState;
  if (action === undefined) return Object.freeze([]);
  if (binding.rootMotion.mode === "none") return Object.freeze([]);
  const source = registry.resolveRootMotionSource(
    binding.rootMotion.rootMotionSourceRef,
    binding.rootMotion.rootMotionSourceHash,
  ) ?? unresolved("committed Action does not resolve to its exact Root Motion source.");
  const sampleIndex = input.committedTick - action.startedSimulationTick;
  const sample = sampleLockedRootMotionSourceV1(
    source,
    binding.rootMotion.rootMotionSourceRef,
    binding.rootMotion.rootMotionSourceHash,
    sampleIndex,
    input.fixedDeltaSeconds,
  );
  return Object.freeze([parseLayeredMoveV1({
    schemaVersion: 1,
    kind: "root-motion",
    id: `action-root-motion:${action.id}`,
    priority: binding.rootMotion.priority,
    startedTick: action.startedSimulationTick,
    rootMotionSourceRef: binding.rootMotion.rootMotionSourceRef,
    rootMotionSourceHash: binding.rootMotion.rootMotionSourceHash,
    translationDeltaMetersXYZ: sample.translationDeltaMetersXYZ,
    facingYawDeltaRadians: sample.facingYawDeltaRadians,
  })]);
}

export function resolveActionPresentationV1(
  inputValue: unknown,
  registry: ActionPresentationRegistryV1,
): ResolvedActionPresentationV1 {
  const input = parseInput(inputValue);
  const action = input.activeActionState;
  if (action === undefined) {
    return Object.freeze({
      schemaVersion: 1,
      committedTick: input.committedTick,
      source: "locomotion",
      presentationKey: locomotionKey(input.locomotion, input.jumpEpisode),
      layeredMoves: Object.freeze([]),
    });
  }
  const binding = registry.resolveAction(
    action.semanticActionRef,
    action.semanticActionHash,
  ) ?? unresolved("committed Action does not resolve to an exact presentation binding.");
  return Object.freeze({
    schemaVersion: 1,
    committedTick: input.committedTick,
    source: "action",
    presentationKey: binding.presentationKey,
    actionExecutionId: action.id,
    actionBindingRef: binding.resourceRef,
    actionBindingHash: binding.contentHash,
    layeredMoves: rootMotionMove(input, registry, binding),
  });
}

export function parseResolvedActionPresentationV1(
  input: unknown,
): ResolvedActionPresentationV1 {
  const value = dataRecord(input);
  const base = [
    "schemaVersion", "committedTick", "source", "presentationKey", "layeredMoves",
  ] as const;
  const isAction = value.source === "action";
  if ((!isAction && !exact(value, base)) ||
    (isAction && !exact(value, [
      ...base, "actionExecutionId", "actionBindingRef", "actionBindingHash",
    ])) ||
    value.schemaVersion !== 1 ||
    (value.source !== "locomotion" && value.source !== "action")) {
    return invalid("ResolvedActionPresentationV1 has an invalid closed shape.");
  }
  const committedTick = safeTick(value.committedTick, "committedTick");
  const layeredMoves = strictArray(value.layeredMoves).map((move) => {
    let parsed: LayeredMoveV1;
    try {
      parsed = parseLayeredMoveV1(move);
    } catch {
      return invalid("resolved LayeredMove is not canonical.");
    }
    if (parsed.kind !== "root-motion" || parsed.startedTick > committedTick) {
      return invalid("resolved Action presentation can contain only current Root Motion moves.");
    }
    return parsed;
  });
  if (!isAction) {
    if (typeof value.presentationKey !== "string" ||
      !LOCOMOTION_PRESENTATION_KEYS.has(value.presentationKey as LocomotionPresentationKeyV1) ||
      layeredMoves.length !== 0) {
      return invalid("locomotion presentation result is inconsistent.");
    }
    return Object.freeze({
      schemaVersion: 1,
      committedTick,
      source: "locomotion",
      presentationKey: value.presentationKey as LocomotionPresentationKeyV1,
      layeredMoves: Object.freeze([]),
    });
  }
  const keyMatch = typeof value.presentationKey === "string"
    ? ACTION_PRESENTATION_KEY.exec(value.presentationKey)
    : null;
  const refMatch = typeof value.actionBindingRef === "string"
    ? ACTION_PRESENTATION_REF.exec(value.actionBindingRef)
    : null;
  const refVersion = refMatch?.[2] === undefined ? Number.NaN : Number(refMatch[2]);
  if (!stableString(value.actionExecutionId) || keyMatch?.[1] === undefined ||
    keyMatch[1].length > 64 || refMatch?.[1] === undefined || refMatch[1].length > 64 ||
    !Number.isSafeInteger(refVersion) || refVersion <= 0 ||
    typeof value.actionBindingHash !== "string" || !SHA256.test(value.actionBindingHash)) {
    return invalid("action presentation result identity is not canonical.");
  }
  if (layeredMoves.length > 1 ||
    (layeredMoves[0] !== undefined &&
      layeredMoves[0].id !== `action-root-motion:${value.actionExecutionId}`)) {
    return invalid("resolved Root Motion is not bound to the Action execution identity.");
  }
  return Object.freeze({
    schemaVersion: 1,
    committedTick,
    source: "action",
    presentationKey: value.presentationKey as `action.${string}`,
    actionExecutionId: value.actionExecutionId,
    actionBindingRef: value.actionBindingRef as ActionPresentationResourceRefV1,
    actionBindingHash: value.actionBindingHash as `sha256:${string}`,
    layeredMoves: Object.freeze(layeredMoves),
  });
}

function exactRootMotionSample(
  left: readonly [number, number, number],
  right: readonly [number, number, number],
): boolean {
  return left[0] === right[0] && left[1] === right[1] && left[2] === right[2];
}

export function verifyResolvedActionPresentationV1(
  input: unknown,
  registry: ActionPresentationRegistryV1,
  committedActionState?: GameplayActionStateV1,
): ResolvedActionPresentationV1 {
  const presentation = parseResolvedActionPresentationV1(input);
  if (presentation.source === "locomotion") {
    if (committedActionState !== undefined) {
      return invalid("locomotion presentation cannot carry committed Action authority.");
    }
    return presentation;
  }
  if (committedActionState === undefined) {
    return invalid("Action presentation requires committed Action authority.");
  }
  const action = actionState(committedActionState, presentation.committedTick);
  const binding = registry.resolveBinding(
    presentation.actionBindingRef,
    presentation.actionBindingHash,
  ) ?? unresolved("resolved Action does not resolve to its exact presentation binding.");
  const committedBinding = registry.resolveAction(
    action.semanticActionRef,
    action.semanticActionHash,
  );
  if (action.id !== presentation.actionExecutionId ||
    committedBinding === undefined ||
    committedBinding.resourceRef !== binding.resourceRef ||
    committedBinding.contentHash !== binding.contentHash ||
    binding.presentationKey !== presentation.presentationKey) {
    return invalid("resolved Action identity does not match committed Action authority.");
  }
  if (binding.rootMotion.mode === "none") {
    if (presentation.layeredMoves.length !== 0) {
      return invalid("none Root Motion binding cannot carry a LayeredMove.");
    }
    return presentation;
  }
  if (presentation.layeredMoves.length !== 1) {
    return invalid("locked Root Motion binding requires exactly one LayeredMove.");
  }
  const move = presentation.layeredMoves[0]!;
  if (move.kind !== "root-motion" ||
    move.id !== `action-root-motion:${presentation.actionExecutionId}` ||
    move.priority !== binding.rootMotion.priority ||
    move.startedTick !== action.startedSimulationTick ||
    move.rootMotionSourceRef !== binding.rootMotion.rootMotionSourceRef ||
    move.rootMotionSourceHash !== binding.rootMotion.rootMotionSourceHash) {
    return invalid("resolved Root Motion identity does not match its binding.");
  }
  const source = registry.resolveRootMotionSource(
    binding.rootMotion.rootMotionSourceRef,
    binding.rootMotion.rootMotionSourceHash,
  ) ?? unresolved("resolved Action does not resolve to its exact Root Motion source.");
  const sample = sampleLockedRootMotionSourceV1(
    source,
    binding.rootMotion.rootMotionSourceRef,
    binding.rootMotion.rootMotionSourceHash,
    presentation.committedTick - move.startedTick,
    source.fixedDeltaSeconds,
  );
  if (!exactRootMotionSample(
    move.translationDeltaMetersXYZ,
    sample.translationDeltaMetersXYZ,
  ) || move.facingYawDeltaRadians !== sample.facingYawDeltaRadians) {
    return invalid("resolved Root Motion delta does not match the locked Tick sample.");
  }
  return presentation;
}

export type {
  ActionPresentationResolveInputV1,
  ResolvedActionPresentationV1,
} from "./types.js";
