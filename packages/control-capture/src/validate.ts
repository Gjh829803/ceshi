import { sha256CanonicalJson } from "@whitebox-world/protocol";
import { isNil, isPlainObject } from "lodash-es";

import { compileCaptureScheduleV1 } from "./schedule";
import type {
  CameraRigKeyframeV1,
  CaptureScheduleV1,
  CompiledSimulationTakeV1,
  ControlIntentKeyframeV1,
  ScriptedControllerV1,
  Sha256HashV1,
  SimulationTakeDiagnosticCodeV1,
  SimulationTakeDiagnosticV1,
  SimulationTakeTrackV1,
  SimulationTakeV1,
  SimulationTakeValidationResultV1,
} from "./types";

type UnknownRecord = Record<string, unknown>;

const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;

function childPath(path: string, key: string | number): string {
  return `${path}/${String(key).replaceAll("~", "~0").replaceAll("/", "~1")}`;
}

function addDiagnostic(
  diagnostics: SimulationTakeDiagnosticV1[],
  code: SimulationTakeDiagnosticCodeV1,
  path: string,
  message: string,
): void {
  diagnostics.push({ code, path: path === "" ? "/" : path, message });
}

function readObject(
  value: unknown,
  path: string,
  allowedKeys: readonly string[],
  diagnostics: SimulationTakeDiagnosticV1[],
): UnknownRecord | undefined {
  if (!isPlainObject(value)) {
    addDiagnostic(diagnostics, "TAKE_OBJECT_INVALID", path, "Expected a plain object.");
    return undefined;
  }
  const row = value as UnknownRecord;
  for (const key of Object.keys(row)) {
    if (!allowedKeys.includes(key)) {
      addDiagnostic(diagnostics, "TAKE_FIELD_UNKNOWN", childPath(path, key), `Unknown field '${key}'.`);
    }
  }
  return row;
}

function readArray(
  value: unknown,
  path: string,
  diagnostics: SimulationTakeDiagnosticV1[],
): readonly unknown[] | undefined {
  if (!Array.isArray(value)) {
    addDiagnostic(diagnostics, "TAKE_ARRAY_INVALID", path, "Expected an array.");
    return undefined;
  }
  return value;
}

function isTrimmedString(
  value: unknown,
  path: string,
  diagnostics: SimulationTakeDiagnosticV1[],
): value is string {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim()) {
    addDiagnostic(diagnostics, "TAKE_STRING_INVALID", path, "Expected a trimmed non-empty string.");
    return false;
  }
  return true;
}

function isSafeInteger(
  value: unknown,
  path: string,
  diagnostics: SimulationTakeDiagnosticV1[],
  minimum = 0,
): value is number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    addDiagnostic(diagnostics, "TAKE_INTEGER_INVALID", path, `Expected a safe integer >= ${minimum}.`);
    return false;
  }
  return true;
}

function isFiniteNumber(
  value: unknown,
  path: string,
  diagnostics: SimulationTakeDiagnosticV1[],
): value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    addDiagnostic(diagnostics, "TAKE_NUMBER_INVALID", path, "Expected a finite number.");
    return false;
  }
  return true;
}

function isBoolean(
  value: unknown,
  path: string,
  diagnostics: SimulationTakeDiagnosticV1[],
): value is boolean {
  if (typeof value !== "boolean") {
    addDiagnostic(diagnostics, "TAKE_BOOLEAN_INVALID", path, "Expected a boolean.");
    return false;
  }
  return true;
}

function isHash(
  value: unknown,
  path: string,
  diagnostics: SimulationTakeDiagnosticV1[],
): value is Sha256HashV1 {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    addDiagnostic(diagnostics, "TAKE_HASH_INVALID", path, "Expected a lowercase SHA-256 hash.");
    return false;
  }
  return true;
}

function readController(
  value: unknown,
  path: string,
  diagnostics: SimulationTakeDiagnosticV1[],
): ScriptedControllerV1 | undefined {
  const row = readObject(value, path, [
    "id", "kind", "controlledEntityId", "controlProfileRef", "initialSequence",
  ], diagnostics);
  if (row === undefined) return undefined;
  const idOk = isTrimmedString(row.id, childPath(path, "id"), diagnostics);
  const entityOk = isTrimmedString(row.controlledEntityId, childPath(path, "controlledEntityId"), diagnostics);
  const profileOk = isTrimmedString(row.controlProfileRef, childPath(path, "controlProfileRef"), diagnostics);
  const sequenceOk = isSafeInteger(row.initialSequence, childPath(path, "initialSequence"), diagnostics);
  if (row.kind !== "scripted") {
    addDiagnostic(diagnostics, "TAKE_KIND_INVALID", childPath(path, "kind"), "V1 supports only scripted controllers.");
  }
  if (!idOk || !entityOk || !profileOk || !sequenceOk || row.kind !== "scripted") return undefined;
  return {
    id: row.id as string,
    kind: "scripted",
    controlledEntityId: row.controlledEntityId as string,
    controlProfileRef: row.controlProfileRef as string,
    initialSequence: row.initialSequence as number,
  };
}

function readControlKeyframe(
  value: unknown,
  path: string,
  diagnostics: SimulationTakeDiagnosticV1[],
): ControlIntentKeyframeV1 | undefined {
  const row = readObject(value, path, ["tick", "moveAxesXZ", "runEnabled", "jumpPressed"], diagnostics);
  if (row === undefined) return undefined;
  const tickOk = isSafeInteger(row.tick, childPath(path, "tick"), diagnostics);
  const axes = readArray(row.moveAxesXZ, childPath(path, "moveAxesXZ"), diagnostics);
  const axesOk = axes !== undefined && axes.length === 2 && axes.every(
    (axis) => typeof axis === "number" && Number.isFinite(axis) && axis >= -1 && axis <= 1,
  );
  if (!axesOk) {
    addDiagnostic(diagnostics, "TAKE_MOVE_AXES_INVALID", childPath(path, "moveAxesXZ"), "Move axes must be two finite values from -1 through 1.");
  }
  const runOk = isBoolean(row.runEnabled, childPath(path, "runEnabled"), diagnostics);
  const jumpOk = isBoolean(row.jumpPressed, childPath(path, "jumpPressed"), diagnostics);
  if (!tickOk || !axesOk || !runOk || !jumpOk) return undefined;
  return {
    tick: row.tick as number,
    moveAxesXZ: [axes![0] as number, axes![1] as number],
    runEnabled: row.runEnabled as boolean,
    jumpPressed: row.jumpPressed as boolean,
  };
}

function readCameraKeyframe(
  value: unknown,
  path: string,
  diagnostics: SimulationTakeDiagnosticV1[],
): CameraRigKeyframeV1 | undefined {
  const row = readObject(value, path, [
    "tick", "viewYawOffsetRadians", "viewPitchOffsetRadians", "viewDistanceOffsetMeters",
  ], diagnostics);
  if (row === undefined) return undefined;
  const tickOk = isSafeInteger(row.tick, childPath(path, "tick"), diagnostics);
  const yawOk = isFiniteNumber(row.viewYawOffsetRadians, childPath(path, "viewYawOffsetRadians"), diagnostics);
  const pitchOk = isFiniteNumber(row.viewPitchOffsetRadians, childPath(path, "viewPitchOffsetRadians"), diagnostics);
  const distanceOk = isFiniteNumber(row.viewDistanceOffsetMeters, childPath(path, "viewDistanceOffsetMeters"), diagnostics);
  if (!tickOk || !yawOk || !pitchOk || !distanceOk) return undefined;
  return {
    tick: row.tick as number,
    viewYawOffsetRadians: row.viewYawOffsetRadians as number,
    viewPitchOffsetRadians: row.viewPitchOffsetRadians as number,
    viewDistanceOffsetMeters: row.viewDistanceOffsetMeters as number,
  };
}

function validateKeyframeOrder(
  keyframes: readonly { readonly tick: number }[],
  path: string,
  startTick: number | undefined,
  endTickExclusive: number | undefined,
  diagnostics: SimulationTakeDiagnosticV1[],
): void {
  keyframes.forEach((keyframe, index) => {
    if (index > 0 && keyframe.tick <= keyframes[index - 1]!.tick) {
      addDiagnostic(diagnostics, "TAKE_KEYFRAMES_NOT_STRICTLY_INCREASING", childPath(path, index), "Keyframe ticks must be strictly increasing.");
    }
    if (!isNil(startTick) && !isNil(endTickExclusive) &&
      (keyframe.tick < startTick || keyframe.tick >= endTickExclusive)) {
      addDiagnostic(diagnostics, "TAKE_KEYFRAME_TICK_OUT_OF_RANGE", childPath(childPath(path, index), "tick"), "Keyframe tick must be inside the Take tick range.");
    }
  });
}

function readableKeyframeTicks(inputs: readonly unknown[]): readonly { readonly tick: number }[] {
  return inputs.flatMap((input) =>
    isPlainObject(input) && Number.isSafeInteger((input as UnknownRecord).tick)
      ? [{ tick: (input as UnknownRecord).tick as number }]
      : []
  );
}

function readTrack(
  value: unknown,
  path: string,
  startTick: number | undefined,
  endTickExclusive: number | undefined,
  diagnostics: SimulationTakeDiagnosticV1[],
): SimulationTakeTrackV1 | undefined {
  if (!isPlainObject(value)) {
    addDiagnostic(diagnostics, "TAKE_OBJECT_INVALID", path, "Expected a plain object.");
    return undefined;
  }
  const kind = (value as UnknownRecord).kind;
  if (kind === "control-intent") {
    const row = readObject(value, path, ["id", "kind", "controllerId", "interpolation", "keyframes"], diagnostics)!;
    const idOk = isTrimmedString(row.id, childPath(path, "id"), diagnostics);
    const controllerOk = isTrimmedString(row.controllerId, childPath(path, "controllerId"), diagnostics);
    if (row.interpolation !== "step") {
      addDiagnostic(diagnostics, "TAKE_KIND_INVALID", childPath(path, "interpolation"), "V1 control interpolation must be step.");
    }
    const inputs = readArray(row.keyframes, childPath(path, "keyframes"), diagnostics);
    const keyframes = inputs?.map((item, index) => readControlKeyframe(
      item,
      childPath(childPath(path, "keyframes"), index),
      diagnostics,
    )).filter((item): item is ControlIntentKeyframeV1 => item !== undefined) ?? [];
    validateKeyframeOrder(
      inputs === undefined ? [] : readableKeyframeTicks(inputs),
      childPath(path, "keyframes"),
      startTick,
      endTickExclusive,
      diagnostics,
    );
    if (!idOk || !controllerOk || row.interpolation !== "step" || inputs === undefined || keyframes.length !== inputs.length) return undefined;
    return {
      id: row.id as string,
      kind,
      controllerId: row.controllerId as string,
      interpolation: "step",
      keyframes,
    };
  }
  if (kind === "camera-rig") {
    const row = readObject(value, path, ["id", "kind", "cameraEntityId", "cameraRigRef", "interpolation", "keyframes"], diagnostics)!;
    const idOk = isTrimmedString(row.id, childPath(path, "id"), diagnostics);
    const cameraOk = isTrimmedString(row.cameraEntityId, childPath(path, "cameraEntityId"), diagnostics);
    const rigOk = isTrimmedString(row.cameraRigRef, childPath(path, "cameraRigRef"), diagnostics);
    if (row.interpolation !== "step") {
      addDiagnostic(diagnostics, "TAKE_KIND_INVALID", childPath(path, "interpolation"), "V1 camera interpolation must be step.");
    }
    const inputs = readArray(row.keyframes, childPath(path, "keyframes"), diagnostics);
    const keyframes = inputs?.map((item, index) => readCameraKeyframe(
      item,
      childPath(childPath(path, "keyframes"), index),
      diagnostics,
    )).filter((item): item is CameraRigKeyframeV1 => item !== undefined) ?? [];
    validateKeyframeOrder(
      inputs === undefined ? [] : readableKeyframeTicks(inputs),
      childPath(path, "keyframes"),
      startTick,
      endTickExclusive,
      diagnostics,
    );
    if (!idOk || !cameraOk || !rigOk || row.interpolation !== "step" || inputs === undefined || keyframes.length !== inputs.length) return undefined;
    return {
      id: row.id as string,
      kind,
      cameraEntityId: row.cameraEntityId as string,
      cameraRigRef: row.cameraRigRef as string,
      interpolation: "step",
      keyframes,
    };
  }
  readObject(value, path, ["kind"], diagnostics);
  addDiagnostic(diagnostics, "TAKE_KIND_INVALID", childPath(path, "kind"), "Unsupported Take track kind.");
  return undefined;
}

function readNoneInterpolation(
  value: unknown,
  path: string,
  diagnostics: SimulationTakeDiagnosticV1[],
): boolean {
  const row = readObject(value, path, ["kind"], diagnostics);
  if (row?.kind !== "none") {
    addDiagnostic(diagnostics, "TAKE_KIND_INVALID", childPath(path, "kind"), "V1 render interpolation must be none.");
    return false;
  }
  return true;
}

function readCaptureSchedule(
  value: unknown,
  path: string,
  startTick: number | undefined,
  endTickExclusive: number | undefined,
  diagnostics: SimulationTakeDiagnosticV1[],
): CaptureScheduleV1 | undefined {
  if (!isPlainObject(value)) {
    addDiagnostic(diagnostics, "TAKE_OBJECT_INVALID", path, "Expected a plain object.");
    return undefined;
  }
  const kind = (value as UnknownRecord).kind;
  if (kind === "explicit-ticks") {
    const row = readObject(value, path, ["kind", "captureTicks", "renderInterpolation"], diagnostics)!;
    const inputs = readArray(row.captureTicks, childPath(path, "captureTicks"), diagnostics);
    const ticks = inputs?.filter((tick, index) =>
      isSafeInteger(tick, childPath(childPath(path, "captureTicks"), index), diagnostics)
    ) as number[] | undefined;
    ticks?.forEach((tick, index) => {
      if (index > 0 && tick <= ticks[index - 1]!) {
        addDiagnostic(diagnostics, "TAKE_CAPTURE_TICKS_NOT_STRICTLY_INCREASING", childPath(childPath(path, "captureTicks"), index), "Capture ticks must be strictly increasing.");
      }
      if (!isNil(startTick) && !isNil(endTickExclusive) && (tick < startTick || tick >= endTickExclusive)) {
        addDiagnostic(diagnostics, "TAKE_KEYFRAME_TICK_OUT_OF_RANGE", childPath(childPath(path, "captureTicks"), index), "Capture tick must be inside the Take tick range.");
      }
    });
    const interpolationOk = readNoneInterpolation(row.renderInterpolation, childPath(path, "renderInterpolation"), diagnostics);
    if (inputs === undefined || ticks === undefined || ticks.length !== inputs.length || !interpolationOk) return undefined;
    return { kind, captureTicks: ticks, renderInterpolation: { kind: "none" } };
  }
  if (kind === "constant-frame-rate") {
    const row = readObject(value, path, ["kind", "captureFrameRate", "firstCaptureTick", "lastCaptureTickInclusive", "renderInterpolation"], diagnostics)!;
    const rate = readObject(row.captureFrameRate, childPath(path, "captureFrameRate"), ["numeratorFrames", "denominatorSeconds"], diagnostics);
    const numeratorOk = isSafeInteger(rate?.numeratorFrames, childPath(childPath(path, "captureFrameRate"), "numeratorFrames"), diagnostics, 1);
    const denominatorOk = isSafeInteger(rate?.denominatorSeconds, childPath(childPath(path, "captureFrameRate"), "denominatorSeconds"), diagnostics, 1);
    const firstOk = isSafeInteger(row.firstCaptureTick, childPath(path, "firstCaptureTick"), diagnostics);
    const lastOk = isSafeInteger(row.lastCaptureTickInclusive, childPath(path, "lastCaptureTickInclusive"), diagnostics);
    if (firstOk && lastOk && (row.firstCaptureTick as number) > (row.lastCaptureTickInclusive as number)) {
      addDiagnostic(diagnostics, "TAKE_TICK_RANGE_INVALID", path, "Capture tick range must be non-empty.");
    }
    if (firstOk && lastOk && !isNil(startTick) && !isNil(endTickExclusive) &&
      ((row.firstCaptureTick as number) < startTick || (row.lastCaptureTickInclusive as number) >= endTickExclusive)) {
      addDiagnostic(diagnostics, "TAKE_KEYFRAME_TICK_OUT_OF_RANGE", path, "Capture tick range must be inside the Take tick range.");
    }
    const interpolationOk = readNoneInterpolation(row.renderInterpolation, childPath(path, "renderInterpolation"), diagnostics);
    if (rate === undefined || !numeratorOk || !denominatorOk || !firstOk || !lastOk || !interpolationOk) return undefined;
    return {
      kind,
      captureFrameRate: {
        numeratorFrames: rate.numeratorFrames as number,
        denominatorSeconds: rate.denominatorSeconds as number,
      },
      firstCaptureTick: row.firstCaptureTick as number,
      lastCaptureTickInclusive: row.lastCaptureTickInclusive as number,
      renderInterpolation: { kind: "none" },
    };
  }
  readObject(value, path, ["kind"], diagnostics);
  addDiagnostic(diagnostics, "TAKE_KIND_INVALID", childPath(path, "kind"), "Unsupported capture schedule kind.");
  return undefined;
}

function checkUniqueIds(
  rows: readonly { readonly id: string }[],
  path: string,
  diagnostics: SimulationTakeDiagnosticV1[],
): void {
  const seen = new Set<string>();
  rows.forEach((row, index) => {
    if (seen.has(row.id)) {
      addDiagnostic(diagnostics, "TAKE_ID_DUPLICATE", childPath(childPath(path, index), "id"), `Duplicate id '${row.id}'.`);
    }
    seen.add(row.id);
  });
}

export function validateSimulationTakeV1(input: unknown): SimulationTakeValidationResultV1 {
  const diagnostics: SimulationTakeDiagnosticV1[] = [];
  const row = readObject(input, "", [
    "kind", "schemaVersion", "id", "worldPackageRef", "worldPackageRootHash", "seed",
    "simulationTickRate", "startTick", "endTickExclusive", "controllers", "tracks",
    "captureSchedule", "captureProfileRef", "captureEncodingProfileRef",
  ], diagnostics);
  if (row === undefined) return { ok: false, diagnostics };
  if (row.kind !== "worldkit-simulation-take") {
    addDiagnostic(diagnostics, "TAKE_KIND_INVALID", "/kind", "Expected worldkit-simulation-take.");
  }
  if (row.schemaVersion !== 1) {
    addDiagnostic(diagnostics, "TAKE_KIND_INVALID", "/schemaVersion", "Expected Simulation Take schemaVersion 1.");
  }
  const idOk = isTrimmedString(row.id, "/id", diagnostics);
  const packageRefOk = isTrimmedString(row.worldPackageRef, "/worldPackageRef", diagnostics);
  const packageHashOk = isHash(row.worldPackageRootHash, "/worldPackageRootHash", diagnostics);
  const seedOk = isSafeInteger(row.seed, "/seed", diagnostics);
  const startOk = isSafeInteger(row.startTick, "/startTick", diagnostics);
  const endOk = isSafeInteger(row.endTickExclusive, "/endTickExclusive", diagnostics, 1);
  if (startOk && endOk && (row.startTick as number) >= (row.endTickExclusive as number)) {
    addDiagnostic(diagnostics, "TAKE_TICK_RANGE_INVALID", "/", "Take tick range must be non-empty.");
  }

  const rate = readObject(row.simulationTickRate, "/simulationTickRate", ["numeratorTicks", "denominatorSeconds"], diagnostics);
  const rateNumeratorOk = isSafeInteger(rate?.numeratorTicks, "/simulationTickRate/numeratorTicks", diagnostics, 1);
  const rateDenominatorOk = isSafeInteger(rate?.denominatorSeconds, "/simulationTickRate/denominatorSeconds", diagnostics, 1);
  if (rateNumeratorOk && rateDenominatorOk &&
    (rate!.numeratorTicks !== 60 || rate!.denominatorSeconds !== 1)) {
    addDiagnostic(diagnostics, "TAKE_TICK_RATE_UNSUPPORTED", "/simulationTickRate", "V1 supports exactly 60 ticks per second.");
  }

  const controllerInputs = readArray(row.controllers, "/controllers", diagnostics);
  const controllers = controllerInputs?.map((controller, index) =>
    readController(controller, `/controllers/${index}`, diagnostics)
  ).filter((controller): controller is ScriptedControllerV1 => controller !== undefined) ?? [];
  checkUniqueIds(controllers, "/controllers", diagnostics);

  const trackInputs = readArray(row.tracks, "/tracks", diagnostics);
  const tracks = trackInputs?.map((track, index) => readTrack(
    track,
    `/tracks/${index}`,
    startOk ? row.startTick as number : undefined,
    endOk ? row.endTickExclusive as number : undefined,
    diagnostics,
  )).filter((track): track is SimulationTakeTrackV1 => track !== undefined) ?? [];
  checkUniqueIds(tracks, "/tracks", diagnostics);
  const channelsByKind = {
    "control-intent": new Set<string>(),
    "camera-rig": new Set<string>(),
  };
  tracks.forEach((track, index) => {
    const channelId = track.kind === "control-intent" ? track.controllerId : track.cameraEntityId;
    const channels = channelsByKind[track.kind];
    if (channels.has(channelId)) {
      addDiagnostic(diagnostics, "TAKE_TRACK_CHANNEL_CONFLICT", `/tracks/${index}`, `Multiple tracks write channel '${channelId}'.`);
    }
    channels.add(channelId);
  });

  const schedule = readCaptureSchedule(
    row.captureSchedule,
    "/captureSchedule",
    startOk ? row.startTick as number : undefined,
    endOk ? row.endTickExclusive as number : undefined,
    diagnostics,
  );
  if (row.captureProfileRef !== "worldkit://capture/profile/control-video@1") {
    addDiagnostic(diagnostics, "TAKE_CAPTURE_PROFILE_UNSUPPORTED", "/captureProfileRef", "Unsupported capture profile Ref.");
  }
  if (row.captureEncodingProfileRef !== "worldkit://capture/encoding/web-v1@1") {
    addDiagnostic(diagnostics, "TAKE_CAPTURE_PROFILE_UNSUPPORTED", "/captureEncodingProfileRef", "Unsupported capture encoding profile Ref.");
  }

  if (diagnostics.length > 0 || row.kind !== "worldkit-simulation-take" || row.schemaVersion !== 1 ||
    !idOk || !packageRefOk || !packageHashOk || !seedOk || !startOk || !endOk ||
    rate === undefined || !rateNumeratorOk || !rateDenominatorOk ||
    controllerInputs === undefined || controllers.length !== controllerInputs.length ||
    trackInputs === undefined || tracks.length !== trackInputs.length || schedule === undefined) {
    return { ok: false, diagnostics };
  }
  return {
    ok: true,
    diagnostics: [],
    value: {
      kind: "worldkit-simulation-take",
      schemaVersion: 1,
      id: row.id as string,
      worldPackageRef: row.worldPackageRef as string,
      worldPackageRootHash: row.worldPackageRootHash as Sha256HashV1,
      seed: row.seed as number,
      simulationTickRate: {
        numeratorTicks: rate.numeratorTicks as number,
        denominatorSeconds: rate.denominatorSeconds as number,
      },
      startTick: row.startTick as number,
      endTickExclusive: row.endTickExclusive as number,
      controllers,
      tracks,
      captureSchedule: schedule,
      captureProfileRef: "worldkit://capture/profile/control-video@1",
      captureEncodingProfileRef: "worldkit://capture/encoding/web-v1@1",
    },
  };
}

export class SimulationTakeValidationErrorV1 extends Error {
  readonly name = "SimulationTakeValidationErrorV1";
  readonly code = "TAKE_INVALID" as const;

  constructor(readonly diagnostics: readonly SimulationTakeDiagnosticV1[]) {
    super("TAKE_INVALID: Simulation Take failed strict validation.");
  }
}

function readValidatedTake(input: unknown): SimulationTakeV1 {
  const result = validateSimulationTakeV1(input);
  if (!result.ok) throw new SimulationTakeValidationErrorV1(result.diagnostics);
  return result.value;
}

export function hashSimulationTakeV1(input: unknown): Sha256HashV1 {
  return sha256CanonicalJson(readValidatedTake(input)) as Sha256HashV1;
}

export function compileSimulationTakeV1(input: unknown): CompiledSimulationTakeV1 {
  const take = readValidatedTake(input);
  return {
    kind: "worldkit-compiled-simulation-take",
    schemaVersion: 1,
    take,
    takeHash: sha256CanonicalJson(take) as Sha256HashV1,
    captureSchedulePlan: compileCaptureScheduleV1(take),
  };
}
