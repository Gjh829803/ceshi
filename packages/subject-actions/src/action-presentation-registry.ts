import {
  isWellFormedUnicodeV1,
  parseLockedRootMotionSourceV1,
  parseRootMotionResourceRefV1,
  type LockedRootMotionSourceV1,
} from "@whitebox-world/character-movement";
import { sha256CanonicalJson } from "@whitebox-world/protocol";

import type {
  ActionPresentationBindingBodyV1,
  ActionPresentationBindingV1,
  ActionPresentationClipV1,
  ActionPresentationKeyV1,
  ActionPresentationRegistryV1,
  ActionPresentationResourceRefV1,
  ActionPresentationRootMotionV1,
  SemanticActionResourceRefV1,
} from "./types.js";

export type {
  ActionPresentationBindingBodyV1,
  ActionPresentationBindingV1,
} from "./types.js";

const SHA256 = /^sha256:[a-f0-9]{64}$/;
const ACTION_PRESENTATION_REF =
  /^worldkit:\/\/action-presentation\/([a-z0-9]+(?:[.-][a-z0-9]+)*)@([1-9][0-9]*)$/;
const SEMANTIC_ACTION_REF =
  /^worldkit:\/\/semantic-action\/([a-z0-9]+(?:[.-][a-z0-9]+)*)@([1-9][0-9]*)$/;
const ACTION_PRESENTATION_KEY =
  /^action\.([a-z0-9]+(?:[.-][a-z0-9]+)*)$/;

export const ACTION_PRESENTATION_BINDING_CAPACITY_V1 = 256;
export const ACTION_PRESENTATION_ROOT_SOURCE_CAPACITY_V1 = 256;
export const ACTION_PRESENTATION_ROOT_SAMPLES_PER_SOURCE_CAPACITY_V1 = 4_096;
export const ACTION_PRESENTATION_ROOT_SAMPLES_TOTAL_CAPACITY_V1 = 16_384;
export const ACTION_PRESENTATION_PLAYBACK_SPEED_RATIO_MAX_V1 = 16;
export const ACTION_PRESENTATION_BLEND_DURATION_TICKS_MAX_V1 = 600;

function invalid(detail: string): never {
  throw new RangeError(`3C_INPUT_INVALID: ${detail}`);
}

function unresolved(detail: string): never {
  throw new RangeError(`3C_LAYERED_MOVE_SOURCE_UNRESOLVED: ${detail}`);
}

function ownDescriptor(input: object, key: PropertyKey): PropertyDescriptor | undefined {
  try {
    return Reflect.getOwnPropertyDescriptor(input, key);
  } catch {
    return invalid("Action presentation reflection failed closed.");
  }
}

function prototypeOf(input: object): object | null {
  try {
    return Reflect.getPrototypeOf(input);
  } catch {
    return invalid("Action presentation reflection failed closed.");
  }
}

function ownKeys(input: object): readonly PropertyKey[] {
  try {
    return Reflect.ownKeys(input);
  } catch {
    return invalid("Action presentation reflection failed closed.");
  }
}

function dataRecord(input: unknown): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return invalid("Action presentation data must be a plain object.");
  }
  const prototype = prototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) {
    return invalid("Action presentation data must be a plain object.");
  }
  const result = Object.create(null) as Record<string, unknown>;
  for (const key of ownKeys(input)) {
    const descriptor = ownDescriptor(input, key);
    if (typeof key !== "string" || descriptor === undefined ||
      !descriptor.enumerable || !("value" in descriptor)) {
      return invalid("Action presentation data cannot contain symbols, accessors, or hidden fields.");
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

function boundedArrayLength(
  input: unknown,
  capacity?: number,
  capacityLabel?: string,
): number {
  const lengthDescriptor = typeof input === "object" && input !== null
    ? ownDescriptor(input, "length")
    : undefined;
  if (!Array.isArray(input) || prototypeOf(input) !== Array.prototype ||
    lengthDescriptor === undefined || !("value" in lengthDescriptor) ||
    lengthDescriptor.enumerable ||
    !Number.isSafeInteger(lengthDescriptor.value) || lengthDescriptor.value < 0 ||
    (capacity !== undefined && lengthDescriptor.value > capacity
      ? invalid(`${capacityLabel ?? "Collection"} capacity exceeded.`)
      : false)) {
    return invalid("Action presentation collections must be canonical dense Arrays.");
  }
  return lengthDescriptor.value as number;
}

function strictArray(
  input: unknown,
  capacity?: number,
  capacityLabel?: string,
): readonly unknown[] {
  const length = boundedArrayLength(input, capacity, capacityLabel);
  const keys = ownKeys(input as object);
  if (keys.some((key) => typeof key === "symbol") || keys.length !== length + 1) {
    return invalid("Action presentation collections must be canonical dense Arrays.");
  }
  const result: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = ownDescriptor(input as object, String(index));
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
      return invalid("Action presentation collections must be canonical dense Arrays.");
    }
    result.push(descriptor.value);
  }
  return result;
}

function snapshotRootMotionSampleInput(input: unknown): Readonly<Record<string, unknown>> {
  const value = dataRecord(input);
  const translation = strictArray(
    value.translationDeltaMetersXYZ,
    3,
    "Root Motion sample translation",
  );
  return Object.freeze({
    ...value,
    translationDeltaMetersXYZ: Object.freeze([...translation]),
  });
}

function snapshotRootMotionSourceInput(input: unknown): Readonly<Record<string, unknown>> {
  const value = dataRecord(input);
  const samples = strictArray(
    value.samples,
    ACTION_PRESENTATION_ROOT_SAMPLES_PER_SOURCE_CAPACITY_V1,
    "Root Motion samples-per-source",
  );
  return Object.freeze({
    ...value,
    samples: Object.freeze(samples.map(snapshotRootMotionSampleInput)),
  });
}

function stableString(input: unknown, maximumLength: number): input is string {
  return typeof input === "string" && input.length > 0 &&
    input.length <= maximumLength && isWellFormedUnicodeV1(input) &&
    input.normalize("NFC") === input;
}

function canonicalResourceRef(
  input: unknown,
  pattern: RegExp,
  label: string,
): string {
  const match = typeof input === "string" && isWellFormedUnicodeV1(input)
    ? pattern.exec(input)
    : null;
  const id = match?.[1];
  const versionText = match?.[2];
  const version = versionText === undefined ? Number.NaN : Number(versionText);
  if (id === undefined || id.length > 64 || !Number.isSafeInteger(version) || version <= 0) {
    return invalid(`${label} must be a canonical versioned ResourceRef.`);
  }
  return input as string;
}

function sha256(input: unknown, label: string): `sha256:${string}` {
  if (typeof input !== "string" || !SHA256.test(input)) {
    return invalid(`${label} must be a canonical SHA-256 hash.`);
  }
  return input as `sha256:${string}`;
}

function presentationKey(input: unknown): ActionPresentationKeyV1 {
  const match = typeof input === "string" && isWellFormedUnicodeV1(input)
    ? ACTION_PRESENTATION_KEY.exec(input)
    : null;
  if (match?.[1] === undefined || match[1].length > 64) {
    return invalid("presentationKey must be a canonical action.* key.");
  }
  return input as ActionPresentationKeyV1;
}

function safeNonNegativeInteger(input: unknown, label: string): number {
  if (typeof input !== "number" || !Number.isSafeInteger(input) || input < 0 ||
    Object.is(input, -0)) return invalid(`${label} must be a non-negative safe integer.`);
  return input;
}

function signedSafeInteger(input: unknown, label: string): number {
  if (typeof input !== "number" || !Number.isSafeInteger(input) || Object.is(input, -0)) {
    return invalid(`${label} must be a signed safe integer.`);
  }
  return input;
}

function clip(input: unknown): ActionPresentationClipV1 {
  const value = dataRecord(input);
  if (!exact(value, [
    "sourceClipName", "loopMode", "playbackSpeedRatio", "blendDurationTicks",
  ]) || !stableString(value.sourceClipName, 256) ||
    (value.loopMode !== "repeat" && value.loopMode !== "once") ||
    typeof value.playbackSpeedRatio !== "number" ||
    !Number.isFinite(value.playbackSpeedRatio) || value.playbackSpeedRatio <= 0 ||
    value.playbackSpeedRatio > ACTION_PRESENTATION_PLAYBACK_SPEED_RATIO_MAX_V1 ||
    Object.is(value.playbackSpeedRatio, -0)) {
    return invalid("Action presentation Clip data is not canonical.");
  }
  const blendDurationTicks = safeNonNegativeInteger(
    value.blendDurationTicks,
    "blendDurationTicks",
  );
  if (blendDurationTicks > ACTION_PRESENTATION_BLEND_DURATION_TICKS_MAX_V1) {
    return invalid("blendDurationTicks exceeds the frozen presentation budget.");
  }
  return Object.freeze({
    sourceClipName: value.sourceClipName,
    loopMode: value.loopMode,
    playbackSpeedRatio: value.playbackSpeedRatio,
    blendDurationTicks,
  });
}

function rootMotion(input: unknown): ActionPresentationRootMotionV1 {
  const value = dataRecord(input);
  if (value.mode === "none") {
    if (!exact(value, ["mode"])) return invalid("none Root Motion must have a closed shape.");
    return Object.freeze({ mode: "none" });
  }
  if (value.mode !== "locked" || !exact(value, [
    "mode", "rootMotionSourceRef", "rootMotionSourceHash", "priority",
  ])) return invalid("Root Motion binding must have a closed discriminated shape.");
  let rootMotionSourceRef;
  try {
    rootMotionSourceRef = parseRootMotionResourceRefV1(value.rootMotionSourceRef);
  } catch {
    return invalid("Root Motion binding ResourceRef is not canonical.");
  }
  return Object.freeze({
    mode: "locked",
    rootMotionSourceRef,
    rootMotionSourceHash: sha256(value.rootMotionSourceHash, "rootMotionSourceHash"),
    priority: signedSafeInteger(value.priority, "Root Motion priority"),
  });
}

function parseBody(input: unknown): ActionPresentationBindingBodyV1 {
  const value = dataRecord(input);
  if (!exact(value, [
    "kind", "schemaVersion", "resourceRef", "presentationKey",
    "semanticActionRef", "semanticActionHash", "isInterruptible", "clip",
    "rootMotion",
  ]) || value.kind !== "action-presentation-binding" || value.schemaVersion !== 1 ||
    typeof value.isInterruptible !== "boolean") {
    return invalid("ActionPresentationBindingV1 body has an invalid closed shape.");
  }
  return Object.freeze({
    kind: "action-presentation-binding",
    schemaVersion: 1,
    resourceRef: canonicalResourceRef(
      value.resourceRef,
      ACTION_PRESENTATION_REF,
      "Action presentation binding Ref",
    ) as ActionPresentationResourceRefV1,
    presentationKey: presentationKey(value.presentationKey),
    semanticActionRef: canonicalResourceRef(
      value.semanticActionRef,
      SEMANTIC_ACTION_REF,
      "Semantic Action Ref",
    ) as SemanticActionResourceRefV1,
    semanticActionHash: sha256(value.semanticActionHash, "semanticActionHash"),
    isInterruptible: value.isInterruptible,
    clip: clip(value.clip),
    rootMotion: rootMotion(value.rootMotion),
  });
}

function canonicalBody(body: ActionPresentationBindingBodyV1): unknown {
  return {
    kind: body.kind,
    schemaVersion: body.schemaVersion,
    resourceRef: body.resourceRef,
    presentationKey: body.presentationKey,
    semanticActionRef: body.semanticActionRef,
    semanticActionHash: body.semanticActionHash,
    isInterruptible: body.isInterruptible,
    clip: {
      sourceClipName: body.clip.sourceClipName,
      loopMode: body.clip.loopMode,
      playbackSpeedRatio: body.clip.playbackSpeedRatio,
      blendDurationTicks: body.clip.blendDurationTicks,
    },
    rootMotion: body.rootMotion.mode === "none"
      ? { mode: "none" }
      : {
          mode: "locked",
          rootMotionSourceRef: body.rootMotion.rootMotionSourceRef,
          rootMotionSourceHash: body.rootMotion.rootMotionSourceHash,
          priority: body.rootMotion.priority,
        },
  };
}

export function hashActionPresentationBindingV1(
  input: unknown,
): `sha256:${string}` {
  return sha256CanonicalJson(canonicalBody(parseBody(input))) as `sha256:${string}`;
}

export function parseActionPresentationBindingV1(
  input: unknown,
): ActionPresentationBindingV1 {
  const value = dataRecord(input);
  if (!exact(value, [
    "kind", "schemaVersion", "resourceRef", "contentHash", "presentationKey",
    "semanticActionRef", "semanticActionHash", "isInterruptible", "clip",
    "rootMotion",
  ])) return invalid("ActionPresentationBindingV1 has an invalid closed shape.");
  const body = parseBody({
    kind: value.kind,
    schemaVersion: value.schemaVersion,
    resourceRef: value.resourceRef,
    presentationKey: value.presentationKey,
    semanticActionRef: value.semanticActionRef,
    semanticActionHash: value.semanticActionHash,
    isInterruptible: value.isInterruptible,
    clip: value.clip,
    rootMotion: value.rootMotion,
  });
  const contentHash = sha256(value.contentHash, "contentHash");
  if (contentHash !== hashActionPresentationBindingV1(body)) {
    return invalid("Action presentation binding content hash does not match canonical bytes.");
  }
  return Object.freeze({ ...body, contentHash });
}

export function createActionPresentationRegistryV1(
  input: unknown,
): ActionPresentationRegistryV1 {
  const value = dataRecord(input);
  if (!exact(value, ["schemaVersion", "bindings", "rootMotionSources"]) ||
    value.schemaVersion !== 1) {
    return invalid("Action presentation registry has an invalid closed shape.");
  }
  const bindingInputs = strictArray(
    value.bindings,
    ACTION_PRESENTATION_BINDING_CAPACITY_V1,
    "Action presentation binding",
  );
  const rootMotionSourceInputs = strictArray(
    value.rootMotionSources,
    ACTION_PRESENTATION_ROOT_SOURCE_CAPACITY_V1,
    "Root Motion source",
  );
  const rootMotionSourceSnapshots: Readonly<Record<string, unknown>>[] = [];
  let totalRootMotionSamples = 0;
  for (const source of rootMotionSourceInputs) {
    const snapshot = snapshotRootMotionSourceInput(source);
    totalRootMotionSamples += (snapshot.samples as readonly unknown[]).length;
    if (totalRootMotionSamples >
      ACTION_PRESENTATION_ROOT_SAMPLES_TOTAL_CAPACITY_V1) {
      return invalid("aggregate Root Motion sample capacity exceeded.");
    }
    rootMotionSourceSnapshots.push(snapshot);
  }
  const bindings = bindingInputs.map(parseActionPresentationBindingV1);
  const rootMotionSources = rootMotionSourceSnapshots.map((source) =>
    parseLockedRootMotionSourceV1(source)
  );
  const byBindingRef = new Map<string, ActionPresentationBindingV1>();
  const byPresentation = new Map<string, ActionPresentationBindingV1>();
  const byActionRef = new Map<string, ActionPresentationBindingV1>();
  for (const binding of bindings) {
    if (byBindingRef.has(binding.resourceRef) ||
      byPresentation.has(binding.presentationKey) ||
      byActionRef.has(binding.semanticActionRef)) {
      return invalid("Action presentation bindings contain a duplicate or ambiguous selector.");
    }
    byBindingRef.set(binding.resourceRef, binding);
    byPresentation.set(binding.presentationKey, binding);
    byActionRef.set(binding.semanticActionRef, binding);
  }
  const sourceByRef = new Map<string, LockedRootMotionSourceV1>();
  for (const source of rootMotionSources) {
    if (sourceByRef.has(source.resourceRef)) {
      return invalid("Root Motion registry contains a duplicate ResourceRef.");
    }
    sourceByRef.set(source.resourceRef, source);
  }
  for (const binding of bindings) {
    if (binding.rootMotion.mode === "none") continue;
    const source = sourceByRef.get(binding.rootMotion.rootMotionSourceRef);
    if (source === undefined || source.contentHash !== binding.rootMotion.rootMotionSourceHash) {
      return unresolved("locked Action binding does not resolve to its exact Root Motion source.");
    }
  }
  const stableBindings = Object.freeze([...bindings].sort((left, right) =>
    left.resourceRef < right.resourceRef ? -1 : left.resourceRef > right.resourceRef ? 1 : 0
  ));
  return Object.freeze({
    bindings: stableBindings,
    resolveAction: (semanticActionRef: string, semanticActionHash: string) => {
      const candidate = byActionRef.get(semanticActionRef);
      if (!SHA256.test(semanticActionHash) ||
        candidate?.semanticActionHash !== semanticActionHash) return undefined;
      return candidate;
    },
    resolveBinding: (ref: string, hash: string) => {
      if (!SHA256.test(hash)) return undefined;
      const candidate = byBindingRef.get(ref);
      return candidate?.contentHash === hash ? candidate : undefined;
    },
    resolvePresentation: (key: string) => byPresentation.get(key),
    resolveRootMotionSource: (ref: string, hash: string) => {
      const source = sourceByRef.get(ref);
      return SHA256.test(hash) && source?.contentHash === hash ? source : undefined;
    },
  });
}
