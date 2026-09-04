import type { Sha256HashV1 } from "@whitebox-world/protocol";

import {
  access,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import {
  CONTROL_CAPTURE_PASS_IDS_V1,
  CONTROL_CAPTURE_PROFILE_V1,
  compileSimulationTakeV1,
  type CompiledSimulationTakeV1,
  type ControlCapturePassIdV1,
} from "@whitebox-world/control-capture";
import {
  sha256Bytes,
  sha256CanonicalJson,
  stringifyCanonicalJson,
} from "@whitebox-world/protocol";
import {
  parseCameraViewEventV1,
  parseWorldRuntimeSnapshotV4,
  type WorldRuntimeSnapshotV4,
  type WorldSessionEventV1,
} from "@whitebox-world/runtime-contracts";
import {
  deriveGameplayCommandHashV1,
  deriveWorldStateSnapshotRefV1,
  parseGameplayCommandReceiptV1,
  parseGameplayCommandV1,
  parseGameplayEventV1,
  parseGameplayInspectionSnapshotV1,
  parseWorldStateSnapshotV1,
  type GameplayCommandReceiptV1,
  type GameplayCommandV1,
  type GameplayEventV1,
  type GameplayInspectionSnapshotV1,
  type WorldStateSnapshotV1,
} from "@whitebox-world/gameplay-contracts";
import { isEqual, isPlainObject } from "lodash-es";

function parseWorldSessionEventV1(input: unknown): WorldSessionEventV1 {
  const type = isPlainObject(input)
    ? (input as Record<string, unknown>).type
    : undefined;
  return type === "camera.selection.changed" || type === "camera.target.unbound"
    ? parseCameraViewEventV1(input)
    : parseGameplayEventV1(input);
}

function hasExactOwnKeys(
  input: Readonly<Record<string, unknown>>,
  expectedKeys: readonly string[],
): boolean {
  const actualKeys = Object.keys(input).sort();
  return isEqual(actualKeys, [...expectedKeys].sort());
}

const PASS_FILE_NAMES: Readonly<Record<ControlCapturePassIdV1, string>> = {
  "neutral-color": "neutral-color.png",
  "linear-depth-meters": "linear-depth-meters.bin",
  "semantic-class-id": "semantic-class-id.bin",
  "instance-id": "instance-id.bin",
  "world-normal": "world-normal.bin",
};

const REQUIRED_BUNDLE_FILE_PATHS = [
  "bundle.json",
  "capture-profile-lock.json",
  "diagnostics.json",
  "encoding-profile-lock.json",
  "tables/instances.json",
  "tables/semantic-classes.json",
  "take.json",
  "tracks/actions.ndjson",
  "tracks/cameras.ndjson",
  "tracks/events.ndjson",
  "tracks/inputs.ndjson",
  "tracks/relationships.ndjson",
  "tracks/snapshots.ndjson",
  "validation-report.json",
  "world-package-ref.json",
] as const;

interface WorldPackageIdentityV1 {
  readonly worldPackageRef: string;
  readonly worldPackageRootHash: Sha256HashV1;
  readonly normalizedWorldIrHash: Sha256HashV1;
  readonly worldBuildIdentityHash: Sha256HashV1;
}

interface SemanticClassTableEntryV1 {
  readonly numericId: number;
  readonly semanticClassId: string;
}

interface InstanceTableEntryV1 {
  readonly numericId: number;
  readonly entityId: string;
  readonly semanticClassId: string;
}

interface ControlCaptureCameraV1 {
  readonly cameraEntityId: string;
  readonly cameraRigRef: string;
  readonly positionMetersXYZ: readonly [number, number, number];
  readonly forwardXYZ: readonly [number, number, number];
  readonly upXYZ: readonly [number, number, number];
  readonly verticalFovRadians: number;
  readonly nearClipMeters: number;
  readonly farClipMeters: number;
  readonly viewMatrixColumnMajor: readonly number[];
  readonly projectionMatrixColumnMajor: readonly number[];
}

interface ControlCapturePassBytesV1 {
  readonly passId: ControlCapturePassIdV1;
  readonly bytes: Uint8Array;
}

export interface ControlCaptureBundleFrameInputV1 {
  readonly runtimeSessionId: string;
  readonly captureFrameIndex: number;
  readonly simulationTick: number;
  readonly renderFrameIndex: number;
  readonly renderReadyReceiptId: string;
  readonly widthPixels: number;
  readonly heightPixels: number;
  readonly camera: ControlCaptureCameraV1;
  readonly snapshot: WorldRuntimeSnapshotV4;
  readonly worldState: WorldStateSnapshotV1;
  readonly passesById: Readonly<Record<string, ControlCapturePassBytesV1>>;
}

export interface CreateControlCaptureBundleWriterOptionsV1 {
  readonly outputDirectory: string;
  readonly bundleId: string;
  readonly compiledTake: CompiledSimulationTakeV1;
  readonly worldPackageIdentity: WorldPackageIdentityV1;
  readonly runtimeSessionId: string;
  readonly worldSessionId: string;
  readonly semanticClasses: readonly SemanticClassTableEntryV1[];
  readonly instances: readonly InstanceTableEntryV1[];
}

interface FrameManifestV1 {
  readonly captureFrameIndex: number;
  readonly simulationTick: number;
  readonly renderFrameIndex: number;
  readonly framePath: string;
  readonly frameHash: Sha256HashV1;
}

export interface FinalizedControlCaptureBundleV1 {
  readonly outputDirectory: string;
  readonly bundleRootHash: Sha256HashV1;
  readonly frameCount: number;
}

export interface ControlCaptureBundleByteEvidenceV1 {
  readonly bundleRootHash: Sha256HashV1;
  readonly bundleDirectoryHash: Sha256HashV1;
  readonly sizeBytes: number;
  readonly fileHashesByPath: Readonly<Record<string, Sha256HashV1>>;
}

export interface ControlCaptureBundleWriterV1 {
  appendFrame(frame: ControlCaptureBundleFrameInputV1): Promise<void>;
  appendRuntimeHostJournalTransition(
    transition: ControlCaptureRuntimeHostJournalTransitionInputV1,
  ): void;
  appendRuntimeHostFixedTickJournal(
    transition: ControlCaptureRuntimeHostFixedTickJournalInputV1,
  ): void;
  finalize(): Promise<FinalizedControlCaptureBundleV1>;
  abort(): Promise<void>;
}

interface VerifiedRuntimeHostGameplayTransitionInputV1 {
  readonly captureFrameIndexAfter: number;
  readonly command: GameplayCommandV1;
  readonly receipt: GameplayCommandReceiptV1;
  readonly events: readonly GameplayEventV1[];
  readonly worldStateAfter: WorldStateSnapshotV1;
  readonly gameplayInspectionAfter: GameplayInspectionSnapshotV1;
}

type GameplaySemanticFactEventV1 = Extract<
  GameplayEventV1,
  { readonly type: "semantic-fact.started" | "semantic-fact.ended" }
>;

export interface ControlCaptureRuntimeHostJournalTransitionInputV1
  extends Omit<VerifiedRuntimeHostGameplayTransitionInputV1, "events"> {
  readonly worldSessionEvents: readonly WorldSessionEventV1[];
}

export interface ControlCaptureRuntimeHostFixedTickJournalInputV1 {
  readonly captureFrameIndexAfter: number;
  readonly afterEventSequenceExclusive: number;
  readonly worldSessionEvents: readonly WorldSessionEventV1[];
  readonly worldStateAfter: WorldStateSnapshotV1;
  readonly gameplayInspectionAfter: GameplayInspectionSnapshotV1;
}

export interface ControlCaptureBundleDiagnosticV1 {
  readonly code:
    | "CAPTURE_BUNDLE_JSON_INVALID"
    | "CAPTURE_FILE_HASH_MISMATCH"
    | "CAPTURE_FILE_MISSING"
    | "CAPTURE_FILE_UNDECLARED"
    | "CAPTURE_FRAME_INDEX_INVALID"
    | "CAPTURE_FRAME_DIMENSIONS_INVALID"
    | "CAPTURE_FRAME_HASH_MISMATCH"
    | "CAPTURE_FRAME_TICK_INVALID"
    | "CAPTURE_GAMEPLAY_REFERENCE_MISMATCH"
    | "CAPTURE_GAMEPLAY_TRACK_INVALID"
    | "CAPTURE_MANIFEST_HASH_MISMATCH"
    | "CAPTURE_REQUIRED_PASS_MISSING"
    | "CAPTURE_ROOT_HASH_MISMATCH"
    | "CAPTURE_PROFILE_MISMATCH"
    | "CAPTURE_SESSION_MISMATCH"
    | "CAPTURE_TABLE_INVALID"
    | "CAPTURE_TAKE_MISMATCH"
    | "CAPTURE_WORLD_PACKAGE_MISMATCH";
  readonly path: string;
  readonly message: string;
}

export type ControlCaptureBundleValidationResultV1 =
  | {
      readonly ok: true;
      readonly bundleRootHash: Sha256HashV1;
      readonly diagnostics: readonly [];
    }
  | {
      readonly ok: false;
      readonly diagnostics: readonly ControlCaptureBundleDiagnosticV1[];
    };

export interface ControlCaptureBundleInspectionV1 {
  readonly bundleId: string;
  readonly frameCount: number;
  readonly runtimeSessionId: string;
  readonly worldPackageRootHash: Sha256HashV1;
  readonly worldBuildIdentityHash: Sha256HashV1;
  readonly takeHash: Sha256HashV1;
  readonly bundleRootHash: Sha256HashV1;
}

function canonicalJsonText(value: unknown): string {
  return `${stringifyCanonicalJson(value)}\n`;
}

async function writeCanonicalJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, canonicalJsonText(value), "utf8");
}

async function writeNdjson(filePath: string, rows: readonly unknown[]): Promise<void> {
  const text = rows.length === 0
    ? ""
    : `${rows.map((row) => stringifyCanonicalJson(row)).join("\n")}\n`;
  await writeFile(filePath, text, "utf8");
}

function passEncoding(passId: ControlCapturePassIdV1): string {
  return CONTROL_CAPTURE_PROFILE_V1.encodingProfile.passesById[passId].encoding;
}

function passMediaType(passId: ControlCapturePassIdV1): string {
  return CONTROL_CAPTURE_PROFILE_V1.encodingProfile.passesById[passId].mediaType;
}

function capturedWorldStateClosureMatches(
  snapshot: WorldRuntimeSnapshotV4,
  worldState: WorldStateSnapshotV1,
): boolean {
  return snapshot.runtimeSessionId === worldState.runtimeSessionId &&
    snapshot.worldSessionId === worldState.worldSessionId &&
    snapshot.world.simulationTick === worldState.simulationTick &&
    snapshot.world.worldStateRef === deriveWorldStateSnapshotRefV1({
      runtimeSessionId: worldState.runtimeSessionId,
      worldSessionId: worldState.worldSessionId,
      worldStateHash: worldState.worldStateHash,
    }) &&
    snapshot.world.worldStateHash === worldState.worldStateHash &&
    snapshot.world.gameplayInspection.runtimeSessionId ===
      worldState.runtimeSessionId &&
    snapshot.world.gameplayInspection.worldSessionId ===
      worldState.worldSessionId &&
    snapshot.world.gameplayInspection.simulationTick ===
      worldState.simulationTick &&
    isEqual(
      snapshot.world.gameplayInspection.relationshipStatesById,
      worldState.relationshipStatesById,
    ) &&
    isEqual(
      snapshot.world.gameplayInspection.activeActionStatesById,
      worldState.activeActionStatesById,
    ) &&
    snapshot.world.gameplayInspection.lastEventSequence ===
      worldState.lastEventSequence;
}

function assertFrameShape(
  frame: ControlCaptureBundleFrameInputV1,
  options: CreateControlCaptureBundleWriterOptionsV1,
  expectedCaptureFrameIndex: number,
  previousSimulationTick: number | undefined,
): void {
  if (frame.runtimeSessionId !== options.runtimeSessionId) {
    throw new Error("CAPTURE_SESSION_MISMATCH: Frame belongs to another Runtime Session.");
  }
  if (frame.snapshot.runtimeSessionId !== frame.runtimeSessionId) {
    throw new Error("CAPTURE_SESSION_MISMATCH: Snapshot belongs to another Runtime Session.");
  }
  if (frame.snapshot.worldSessionId !== options.worldSessionId) {
    throw new Error("CAPTURE_SESSION_MISMATCH: Snapshot belongs to another World Session.");
  }
  let snapshot: WorldRuntimeSnapshotV4;
  let worldState: WorldStateSnapshotV1;
  try {
    snapshot = parseWorldRuntimeSnapshotV4(frame.snapshot);
    worldState = parseWorldStateSnapshotV1(frame.worldState);
  } catch {
    throw new Error(
      "CAPTURE_GAMEPLAY_TRACK_INVALID: Frame Snapshot or World State is non-canonical.",
    );
  }
  const expectedScheduleEntry =
    options.compiledTake.captureSchedulePlan.entries[expectedCaptureFrameIndex];
  if (expectedScheduleEntry === undefined) {
    throw new Error("CAPTURE_FRAME_INDEX_INVALID: Frame exceeds the compiled Capture Schedule.");
  }
  if (frame.captureFrameIndex !== expectedCaptureFrameIndex) {
    throw new Error("CAPTURE_FRAME_INDEX_INVALID: Capture frame indices must be contiguous from zero.");
  }
  if (!Number.isSafeInteger(frame.simulationTick) || frame.simulationTick < 0 ||
    (previousSimulationTick !== undefined && frame.simulationTick < previousSimulationTick)) {
    throw new Error("CAPTURE_FRAME_TICK_INVALID: Simulation ticks must be non-decreasing safe integers.");
  }
  if (frame.simulationTick !== expectedScheduleEntry.simulationTick) {
    throw new Error("CAPTURE_FRAME_TICK_INVALID: Frame does not match the compiled Capture Schedule.");
  }
  if (snapshot.world.simulationTick !== frame.simulationTick) {
    throw new Error("CAPTURE_FRAME_TICK_INVALID: Snapshot tick does not match captured simulation tick.");
  }
  if (!capturedWorldStateClosureMatches(snapshot, worldState)) {
    throw new Error(
      "CAPTURE_GAMEPLAY_REFERENCE_MISMATCH: Frame Snapshot and World State identities disagree.",
    );
  }
  if (!Number.isSafeInteger(frame.widthPixels) || frame.widthPixels < 1 ||
    !Number.isSafeInteger(frame.heightPixels) || frame.heightPixels < 1) {
    throw new Error("CAPTURE_FRAME_DIMENSIONS_INVALID: Capture dimensions must be positive integers.");
  }
  const actualPassIds = Object.keys(frame.passesById).sort();
  const requiredPassIds = [...CONTROL_CAPTURE_PASS_IDS_V1].sort();
  if (actualPassIds.join("\n") !== requiredPassIds.join("\n")) {
    throw new Error("CAPTURE_REQUIRED_PASS_MISSING: A frame must contain exactly the five required passes.");
  }
  const pixelCount = frame.widthPixels * frame.heightPixels;
  for (const passId of CONTROL_CAPTURE_PASS_IDS_V1) {
    const pass = frame.passesById[passId]!;
    if (pass.passId !== passId) {
      throw new Error("CAPTURE_PASS_ID_MISMATCH: Pass map key and payload ID differ.");
    }
    const expectedByteLength = passId === "neutral-color"
      ? undefined
      : passId === "world-normal"
        ? pixelCount * 12
        : pixelCount * 4;
    if ((expectedByteLength === undefined && pass.bytes.byteLength === 0) ||
      (expectedByteLength !== undefined && pass.bytes.byteLength !== expectedByteLength)) {
      throw new Error(`CAPTURE_PASS_BYTE_LENGTH_INVALID: ${passId}`);
    }
  }
}

async function listFilesRecursively(directory: string, relative = ""): Promise<readonly string[]> {
  const current = path.join(directory, relative);
  const names = (await readdir(current)).sort();
  const rows: string[] = [];
  for (const name of names) {
    const childRelative = relative === "" ? name : `${relative}/${name}`;
    const stat = await lstat(path.join(directory, childRelative));
    if (stat.isDirectory()) rows.push(...await listFilesRecursively(directory, childRelative));
    else if (stat.isFile()) rows.push(childRelative);
  }
  return rows;
}

export async function collectControlCaptureBundleByteEvidenceV1(
  directory: string,
): Promise<ControlCaptureBundleByteEvidenceV1> {
  const resolvedDirectory = path.resolve(directory);
  const filePaths = await listFilesRecursively(resolvedDirectory);
  const fileRows = await Promise.all(filePaths.map(async (filePath) => {
    const bytes = new Uint8Array(
      await readFile(path.join(resolvedDirectory, filePath)),
    );
    return {
      filePath,
      sizeBytes: bytes.byteLength,
      contentHash: sha256Bytes(bytes) as Sha256HashV1,
    };
  }));
  const fileHashesByPath = Object.fromEntries(
    fileRows
      .filter(({ filePath }) => filePath !== "integrity.json")
      .map(({ filePath, contentHash }) => [filePath, contentHash]),
  );
  const allFileHashesByPath = Object.fromEntries(
    fileRows.map(({ filePath, contentHash }) => [filePath, contentHash]),
  );
  return {
    bundleRootHash: sha256CanonicalJson(fileHashesByPath) as Sha256HashV1,
    bundleDirectoryHash: sha256CanonicalJson(
      allFileHashesByPath,
    ) as Sha256HashV1,
    sizeBytes: fileRows.reduce(
      (totalBytes, { sizeBytes }) => totalBytes + sizeBytes,
      0,
    ),
    fileHashesByPath,
  };
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function createControlCaptureBundleWriterV1(
  options: CreateControlCaptureBundleWriterOptionsV1,
): Promise<ControlCaptureBundleWriterV1> {
  const outputDirectory = path.resolve(options.outputDirectory);
  const parentDirectory = path.dirname(outputDirectory);
  await mkdir(parentDirectory, { recursive: true });
  if (await pathExists(outputDirectory)) {
    throw new Error("CAPTURE_OUTPUT_EXISTS: Refusing to replace an existing bundle.");
  }
  const stagingDirectory = await mkdtemp(`${outputDirectory}.staging-`);
  await mkdir(path.join(stagingDirectory, "frames"), { recursive: true });
  const frameManifests: FrameManifestV1[] = [];
  const snapshotRows: unknown[] = [];
  const cameraRows: unknown[] = [];
  const actionRows: unknown[] = [];
  const eventRows: unknown[] = [];
  const relationshipRows: unknown[] = [];
  let closed = false;
  let previousSimulationTick: number | undefined;

  const abort = async (): Promise<void> => {
    if (closed) return;
    closed = true;
    await rm(stagingDirectory, { recursive: true, force: true });
  };

  const fail = async (error: unknown): Promise<never> => {
    await abort();
    throw error;
  };

  const appendVerifiedGameplayTransition = (
    input: VerifiedRuntimeHostGameplayTransitionInputV1,
  ): void => {
    if (closed) throw new Error("CAPTURE_WRITER_CLOSED");
    if (
      !Number.isSafeInteger(input.captureFrameIndexAfter) ||
      input.captureFrameIndexAfter < 0 ||
      input.captureFrameIndexAfter >=
        options.compiledTake.captureSchedulePlan.entries.length
    ) {
      throw new Error("CAPTURE_GAMEPLAY_TRACK_INVALID: Frame binding is invalid.");
    }
    let command: GameplayCommandV1;
    let receipt: GameplayCommandReceiptV1;
    let events: readonly GameplayEventV1[];
    let worldStateAfter: WorldStateSnapshotV1;
    let gameplayInspectionAfter: GameplayInspectionSnapshotV1;
    try {
      command = parseGameplayCommandV1(input.command);
      receipt = parseGameplayCommandReceiptV1(input.receipt);
      events = input.events.map(parseGameplayEventV1);
      worldStateAfter = parseWorldStateSnapshotV1(input.worldStateAfter);
      gameplayInspectionAfter = parseGameplayInspectionSnapshotV1(
        input.gameplayInspectionAfter,
      );
    } catch {
      throw new Error("CAPTURE_GAMEPLAY_TRACK_INVALID: Evidence is non-canonical.");
    }
    if (
      receipt.status !== "committed" ||
      receipt.commandId !== command.id ||
      receipt.commandHash !== deriveGameplayCommandHashV1(command) ||
      receipt.commandType !== command.type ||
      receipt.runtimeSessionId !== options.runtimeSessionId ||
      receipt.worldSessionId !== options.worldSessionId ||
      command.runtimeSessionId !== options.runtimeSessionId ||
      command.worldSessionId !== options.worldSessionId ||
      worldStateAfter.runtimeSessionId !== options.runtimeSessionId ||
      worldStateAfter.worldSessionId !== options.worldSessionId ||
      gameplayInspectionAfter.runtimeSessionId !== options.runtimeSessionId ||
      gameplayInspectionAfter.worldSessionId !== options.worldSessionId ||
      receipt.worldStateAfterRef !== deriveWorldStateSnapshotRefV1({
        runtimeSessionId: worldStateAfter.runtimeSessionId,
        worldSessionId: worldStateAfter.worldSessionId,
        worldStateHash: worldStateAfter.worldStateHash,
      }) ||
      receipt.worldStateAfterHash !== worldStateAfter.worldStateHash ||
      !isEqual(receipt.eventIds, events.map(({ id }) => id)) ||
      events.some((event) =>
        event.runtimeSessionId !== options.runtimeSessionId ||
        event.worldSessionId !== options.worldSessionId ||
        event.simulationTick !== receipt.simulationTick ||
        ("commandId" in event && event.commandId !== command.id)
      )
    ) {
      throw new Error(
        "CAPTURE_GAMEPLAY_REFERENCE_MISMATCH: Evidence identities disagree.",
      );
    }
    const baseRow = {
      captureFrameIndexAfter: input.captureFrameIndexAfter,
      simulationTick: receipt.simulationTick,
      receipt,
      worldStateAfterRef: receipt.worldStateAfterRef,
      worldStateAfterHash: receipt.worldStateAfterHash,
      worldStateAfter,
      gameplayInspectionAfter,
    };
    actionRows.push({ ...baseRow, command });
    for (const event of events) {
      eventRows.push({
        captureFrameIndexAfter: input.captureFrameIndexAfter,
        source: { kind: "command-receipt", receiptId: receipt.id },
        event,
      });
      if (
        event.type === "relationship.committed" ||
        event.type === "relationship.removed"
      ) {
        relationshipRows.push({
          captureFrameIndexAfter: input.captureFrameIndexAfter,
          source: { kind: "command-receipt", receiptId: receipt.id },
          eventId: event.id,
          operation: event.type === "relationship.committed" ? "add" : "remove",
          relationship: event.relationship,
        });
      }
    }
  };

  return {
    appendRuntimeHostJournalTransition(input): void {
      const eventsById = new Map(
        input.worldSessionEvents.map((event) => [event.id, event] as const),
      );
      const events = input.receipt.eventIds.map((eventId) => {
        const event = eventsById.get(eventId);
        if (event === undefined) {
          throw new Error(
            "CAPTURE_GAMEPLAY_TRACK_INVALID: Receipt Event is absent from the RuntimeHost journal.",
          );
        }
        try {
          return parseGameplayEventV1(event);
        } catch {
          throw new Error(
            "CAPTURE_GAMEPLAY_TRACK_INVALID: Receipt references a non-Gameplay RuntimeHost Event.",
          );
        }
      });
      appendVerifiedGameplayTransition({
        captureFrameIndexAfter: input.captureFrameIndexAfter,
        command: input.command,
        receipt: input.receipt,
        events,
        worldStateAfter: input.worldStateAfter,
        gameplayInspectionAfter: input.gameplayInspectionAfter,
      });
    },

    appendRuntimeHostFixedTickJournal(input): void {
      if (closed) throw new Error("CAPTURE_WRITER_CLOSED");
      if (
        !Number.isSafeInteger(input.captureFrameIndexAfter) ||
        input.captureFrameIndexAfter < 0 ||
        input.captureFrameIndexAfter >=
          options.compiledTake.captureSchedulePlan.entries.length ||
        !Number.isSafeInteger(input.afterEventSequenceExclusive) ||
        input.afterEventSequenceExclusive < 0
      ) {
        throw new Error(
          "CAPTURE_GAMEPLAY_TRACK_INVALID: Fixed-Tick journal binding is invalid.",
        );
      }
      let worldStateAfter: WorldStateSnapshotV1;
      let gameplayInspectionAfter: GameplayInspectionSnapshotV1;
      try {
        worldStateAfter = parseWorldStateSnapshotV1(input.worldStateAfter);
        gameplayInspectionAfter = parseGameplayInspectionSnapshotV1(
          input.gameplayInspectionAfter,
        );
      } catch {
        throw new Error(
          "CAPTURE_GAMEPLAY_TRACK_INVALID: Fixed-Tick evidence is non-canonical.",
        );
      }
      if (
        worldStateAfter.runtimeSessionId !== options.runtimeSessionId ||
        worldStateAfter.worldSessionId !== options.worldSessionId ||
        gameplayInspectionAfter.runtimeSessionId !== options.runtimeSessionId ||
        gameplayInspectionAfter.worldSessionId !== options.worldSessionId ||
        gameplayInspectionAfter.simulationTick !== worldStateAfter.simulationTick ||
        gameplayInspectionAfter.lastEventSequence !==
          worldStateAfter.lastEventSequence ||
        !isEqual(
          gameplayInspectionAfter.relationshipStatesById,
          worldStateAfter.relationshipStatesById,
        ) ||
        !isEqual(
          gameplayInspectionAfter.activeActionStatesById,
          worldStateAfter.activeActionStatesById,
        ) ||
        input.afterEventSequenceExclusive > worldStateAfter.lastEventSequence
      ) {
        throw new Error(
          "CAPTURE_GAMEPLAY_REFERENCE_MISMATCH: Fixed-Tick evidence identities disagree.",
        );
      }
      const eventsBySequence = new Map<number, WorldSessionEventV1>();
      for (const event of input.worldSessionEvents) {
        if (
          event.runtimeSessionId !== options.runtimeSessionId ||
          event.worldSessionId !== options.worldSessionId ||
          eventsBySequence.has(event.sequence)
        ) {
          throw new Error(
            "CAPTURE_GAMEPLAY_REFERENCE_MISMATCH: RuntimeHost journal identity or sequence is invalid.",
          );
        }
        eventsBySequence.set(event.sequence, event);
      }
      const journalRange: WorldSessionEventV1[] = [];
      for (
        let sequence = input.afterEventSequenceExclusive + 1;
        sequence <= worldStateAfter.lastEventSequence;
        sequence += 1
      ) {
        const event = eventsBySequence.get(sequence);
        if (event === undefined) {
          throw new Error(
            "CAPTURE_GAMEPLAY_REFERENCE_MISMATCH: RuntimeHost journal range is incomplete.",
          );
        }
        journalRange.push(event);
      }
      const capturedEvents: WorldSessionEventV1[] = [];
      for (const eventInput of journalRange) {
        let event: WorldSessionEventV1;
        try {
          event = parseWorldSessionEventV1(eventInput);
        } catch {
          throw new Error(
            "CAPTURE_GAMEPLAY_TRACK_INVALID: Fixed-Tick journal contains a non-canonical WorldSession Event.",
          );
        }
        if (
          ("commandId" in event) ||
          event.simulationTick > worldStateAfter.simulationTick
        ) {
          throw new Error(
            "CAPTURE_GAMEPLAY_REFERENCE_MISMATCH: Fixed-Tick Event ownership or Tick is invalid.",
          );
        }
        capturedEvents.push(event);
      }
      const lastFactEventById = new Map<string, GameplaySemanticFactEventV1>();
      for (const event of capturedEvents) {
        if (
          event.type === "semantic-fact.started" ||
          event.type === "semantic-fact.ended"
        ) {
          lastFactEventById.set(event.semanticFact.id, event);
        }
      }
      for (const event of lastFactEventById.values()) {
        const finalFact = worldStateAfter.semanticFactsById[event.semanticFact.id];
        if (
          (event.type === "semantic-fact.started" && finalFact === undefined) ||
          (event.type === "semantic-fact.ended" && finalFact !== undefined)
        ) {
          throw new Error(
            "CAPTURE_GAMEPLAY_REFERENCE_MISMATCH: Final semantic Fact transition disagrees with the post-Tick World State.",
          );
        }
      }
      for (const event of capturedEvents) {
        eventRows.push({
          captureFrameIndexAfter: input.captureFrameIndexAfter,
          source: { kind: "fixed-tick" },
          event,
        });
      }
    },

    async appendFrame(frame): Promise<void> {
      if (closed) throw new Error("CAPTURE_WRITER_CLOSED");
      try {
        assertFrameShape(frame, options, frameManifests.length, previousSimulationTick);
        const frameDirectoryName = String(frame.captureFrameIndex).padStart(6, "0");
        const frameDirectory = path.join(stagingDirectory, "frames", frameDirectoryName);
        await mkdir(frameDirectory, { recursive: false });
        const passesById: Record<string, unknown> = {};
        for (const passId of CONTROL_CAPTURE_PASS_IDS_V1) {
          const fileName = PASS_FILE_NAMES[passId];
          const bytes = frame.passesById[passId]!.bytes;
          await writeFile(path.join(frameDirectory, fileName), bytes);
          passesById[passId] = {
            passId,
            file: fileName,
            mediaType: passMediaType(passId),
            encoding: passEncoding(passId),
            byteLength: bytes.byteLength,
            contentHash: sha256Bytes(bytes),
          };
        }
        const frameBody = {
          kind: "worldkit-control-capture-bundle-frame" as const,
          schemaVersion: 1 as const,
          runtimeSessionId: frame.runtimeSessionId,
          worldPackageRootHash: options.worldPackageIdentity.worldPackageRootHash,
          takeHash: options.compiledTake.takeHash,
          captureFrameIndex: frame.captureFrameIndex,
          simulationTick: frame.simulationTick,
          renderFrameIndex: frame.renderFrameIndex,
          renderReadyReceiptId: frame.renderReadyReceiptId,
          widthPixels: frame.widthPixels,
          heightPixels: frame.heightPixels,
          camera: frame.camera,
          passesById,
        };
        const frameHash = sha256CanonicalJson(frameBody) as Sha256HashV1;
        await writeCanonicalJson(path.join(frameDirectory, "frame.json"), {
          ...frameBody,
          frameHash,
        });
        frameManifests.push({
          captureFrameIndex: frame.captureFrameIndex,
          simulationTick: frame.simulationTick,
          renderFrameIndex: frame.renderFrameIndex,
          framePath: `frames/${frameDirectoryName}/frame.json`,
          frameHash,
        });
        snapshotRows.push({
          captureFrameIndex: frame.captureFrameIndex,
          simulationTick: frame.simulationTick,
          snapshot: frame.snapshot,
          worldState: frame.worldState,
        });
        cameraRows.push({
          captureFrameIndex: frame.captureFrameIndex,
          simulationTick: frame.simulationTick,
          renderFrameIndex: frame.renderFrameIndex,
          renderReadyReceiptId: frame.renderReadyReceiptId,
          camera: frame.camera,
        });
        previousSimulationTick = frame.simulationTick;
      } catch (error) {
        return fail(error);
      }
    },

    async finalize(): Promise<FinalizedControlCaptureBundleV1> {
      if (closed) throw new Error("CAPTURE_WRITER_CLOSED");
      try {
        if (
          frameManifests.length !==
          options.compiledTake.captureSchedulePlan.entries.length
        ) {
          throw new Error(
            "CAPTURE_SCHEDULE_INCOMPLETE: Every compiled Capture Schedule entry is required.",
          );
        }
        await mkdir(path.join(stagingDirectory, "tables"), { recursive: false });
        await mkdir(path.join(stagingDirectory, "tracks"), { recursive: false });
        await writeCanonicalJson(path.join(stagingDirectory, "take.json"), options.compiledTake.take);
        await writeCanonicalJson(path.join(stagingDirectory, "world-package-ref.json"), options.worldPackageIdentity);
        await writeCanonicalJson(path.join(stagingDirectory, "capture-profile-lock.json"), {
          resourceRef: CONTROL_CAPTURE_PROFILE_V1.resourceRef,
          contentHash: sha256CanonicalJson({
            kind: CONTROL_CAPTURE_PROFILE_V1.kind,
            schemaVersion: CONTROL_CAPTURE_PROFILE_V1.schemaVersion,
            resourceRef: CONTROL_CAPTURE_PROFILE_V1.resourceRef,
            requiredPassIds: CONTROL_CAPTURE_PROFILE_V1.requiredPassIds,
          }),
          requiredPassIds: CONTROL_CAPTURE_PROFILE_V1.requiredPassIds,
        });
        await writeCanonicalJson(path.join(stagingDirectory, "encoding-profile-lock.json"), CONTROL_CAPTURE_PROFILE_V1.encodingProfile);
        await writeCanonicalJson(path.join(stagingDirectory, "tables/semantic-classes.json"), options.semanticClasses);
        await writeCanonicalJson(path.join(stagingDirectory, "tables/instances.json"), options.instances);
        await writeNdjson(path.join(stagingDirectory, "tracks/inputs.ndjson"), []);
        await writeNdjson(path.join(stagingDirectory, "tracks/actions.ndjson"), actionRows);
        await writeNdjson(path.join(stagingDirectory, "tracks/events.ndjson"), eventRows);
        await writeNdjson(path.join(stagingDirectory, "tracks/relationships.ndjson"), relationshipRows);
        await writeNdjson(path.join(stagingDirectory, "tracks/snapshots.ndjson"), snapshotRows);
        await writeNdjson(path.join(stagingDirectory, "tracks/cameras.ndjson"), cameraRows);
        await writeCanonicalJson(path.join(stagingDirectory, "diagnostics.json"), []);
        await writeCanonicalJson(path.join(stagingDirectory, "validation-report.json"), {
          kind: "worldkit-control-capture-validation-report",
          schemaVersion: 1,
          pass: true,
          diagnosticCount: 0,
          checkedFrameCount: frameManifests.length,
        });
        const manifestBody = {
          kind: "worldkit-control-capture-bundle",
          schemaVersion: 1,
          id: options.bundleId,
          worldPackageRef: options.worldPackageIdentity.worldPackageRef,
          worldPackageRootHash: options.worldPackageIdentity.worldPackageRootHash,
          normalizedWorldIrHash: options.worldPackageIdentity.normalizedWorldIrHash,
          worldBuildIdentityHash:
            options.worldPackageIdentity.worldBuildIdentityHash,
          takeId: options.compiledTake.take.id,
          takeHash: options.compiledTake.takeHash,
          runtimeSessionId: options.runtimeSessionId,
          captureProfileRef: options.compiledTake.take.captureProfileRef,
          captureEncodingProfileRef: options.compiledTake.take.captureEncodingProfileRef,
          frameCount: frameManifests.length,
          frames: frameManifests,
        };
        await writeCanonicalJson(path.join(stagingDirectory, "bundle.json"), {
          ...manifestBody,
          bundleManifestHash: sha256CanonicalJson(manifestBody),
        });
        const { bundleRootHash, fileHashesByPath } =
          await collectControlCaptureBundleByteEvidenceV1(stagingDirectory);
        await writeCanonicalJson(path.join(stagingDirectory, "integrity.json"), {
          kind: "worldkit-control-capture-integrity",
          schemaVersion: 1,
          bundleRootHash,
          fileHashesByPath,
        });
        await rename(stagingDirectory, outputDirectory);
        closed = true;
        return { outputDirectory, bundleRootHash, frameCount: frameManifests.length };
      } catch (error) {
        return fail(error);
      }
    },
    abort,
  };
}

function addValidationDiagnostic(
  diagnostics: ControlCaptureBundleDiagnosticV1[],
  code: ControlCaptureBundleDiagnosticV1["code"],
  filePath: string,
  message: string,
): void {
  diagnostics.push({ code, path: filePath, message });
}

async function readJsonRecord(
  directory: string,
  filePath: string,
  diagnostics: ControlCaptureBundleDiagnosticV1[],
): Promise<Record<string, unknown> | undefined> {
  try {
    const value: unknown = JSON.parse(await readFile(path.join(directory, filePath), "utf8"));
    if (!isPlainObject(value)) throw new TypeError("not an object");
    return value as Record<string, unknown>;
  } catch {
    addValidationDiagnostic(diagnostics, "CAPTURE_BUNDLE_JSON_INVALID", filePath, "Required JSON object is missing or invalid.");
    return undefined;
  }
}

async function readJsonArray(
  directory: string,
  filePath: string,
  diagnostics: ControlCaptureBundleDiagnosticV1[],
): Promise<readonly unknown[] | undefined> {
  try {
    const value: unknown = JSON.parse(await readFile(path.join(directory, filePath), "utf8"));
    if (!Array.isArray(value)) throw new TypeError("not an array");
    return value;
  } catch {
    addValidationDiagnostic(
      diagnostics,
      "CAPTURE_BUNDLE_JSON_INVALID",
      filePath,
      "Required JSON array is missing or invalid.",
    );
    return undefined;
  }
}

async function readNdjsonRows(
  directory: string,
  filePath: string,
  diagnostics: ControlCaptureBundleDiagnosticV1[],
): Promise<readonly unknown[]> {
  try {
    const text = await readFile(path.join(directory, filePath), "utf8");
    if (text === "") return [];
    if (!text.endsWith("\n")) throw new TypeError("missing newline");
    return text.slice(0, -1).split("\n").map((line) => {
      const value: unknown = JSON.parse(line);
      if (!isPlainObject(value) || stringifyCanonicalJson(value) !== line) {
        throw new TypeError("non-canonical row");
      }
      return value;
    });
  } catch {
    addValidationDiagnostic(
      diagnostics,
      "CAPTURE_GAMEPLAY_TRACK_INVALID",
      filePath,
      "Gameplay track must contain canonical NDJSON objects.",
    );
    return [];
  }
}

function validateIdTable(
  rows: readonly unknown[] | undefined,
  filePath: string,
  requiredStringFields: readonly string[],
  diagnostics: ControlCaptureBundleDiagnosticV1[],
): ReadonlySet<number> {
  const ids = new Set<number>();
  if (rows === undefined) return ids;
  rows.forEach((row, index) => {
    if (!isPlainObject(row)) {
      addValidationDiagnostic(
        diagnostics,
        "CAPTURE_TABLE_INVALID",
        `${filePath}/${index}`,
        "ID table entry must be an object.",
      );
      return;
    }
    const record = row as Record<string, unknown>;
    const numericId = record.numericId;
    if (!Number.isSafeInteger(numericId) || numericId !== index + 1 || ids.has(numericId as number)) {
      addValidationDiagnostic(
        diagnostics,
        "CAPTURE_TABLE_INVALID",
        `${filePath}/${index}/numericId`,
        "ID table values must be unique contiguous positive integers in canonical order.",
      );
    } else {
      ids.add(numericId as number);
    }
    for (const field of requiredStringFields) {
      if (typeof record[field] !== "string" || record[field] === "") {
        addValidationDiagnostic(
          diagnostics,
          "CAPTURE_TABLE_INVALID",
          `${filePath}/${index}/${field}`,
          `ID table field '${field}' must be a non-empty string.`,
        );
      }
    }
  });
  return ids;
}

function uint32ValuesFromBytes(bytes: Uint8Array): readonly number[] {
  if (bytes.byteLength % 4 !== 0) return [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return Array.from({ length: bytes.byteLength / 4 }, (_, index) =>
    view.getUint32(index * 4, true)
  );
}

export async function validateControlCaptureBundleV1(
  directory: string,
): Promise<ControlCaptureBundleValidationResultV1> {
  const resolvedDirectory = path.resolve(directory);
  const diagnostics: ControlCaptureBundleDiagnosticV1[] = [];
  const integrity = await readJsonRecord(resolvedDirectory, "integrity.json", diagnostics);
  const manifest = await readJsonRecord(resolvedDirectory, "bundle.json", diagnostics);
  const take = await readJsonRecord(resolvedDirectory, "take.json", diagnostics);
  const worldPackageIdentity = await readJsonRecord(
    resolvedDirectory,
    "world-package-ref.json",
    diagnostics,
  );
  const captureProfileLock = await readJsonRecord(
    resolvedDirectory,
    "capture-profile-lock.json",
    diagnostics,
  );
  const encodingProfileLock = await readJsonRecord(
    resolvedDirectory,
    "encoding-profile-lock.json",
    diagnostics,
  );
  const semanticClasses = await readJsonArray(
    resolvedDirectory,
    "tables/semantic-classes.json",
    diagnostics,
  );
  const instances = await readJsonArray(
    resolvedDirectory,
    "tables/instances.json",
    diagnostics,
  );
  const actionTrackRows = await readNdjsonRows(
    resolvedDirectory,
    "tracks/actions.ndjson",
    diagnostics,
  );
  const eventTrackRows = await readNdjsonRows(
    resolvedDirectory,
    "tracks/events.ndjson",
    diagnostics,
  );
  const relationshipTrackRows = await readNdjsonRows(
    resolvedDirectory,
    "tracks/relationships.ndjson",
    diagnostics,
  );
  const snapshotTrackRows = await readNdjsonRows(
    resolvedDirectory,
    "tracks/snapshots.ndjson",
    diagnostics,
  );
  if (integrity === undefined || manifest === undefined || take === undefined) {
    return { ok: false, diagnostics };
  }
  const manifestKeys = Object.keys(manifest).sort();
  const expectedManifestKeys = [
    "bundleManifestHash",
    "captureEncodingProfileRef",
    "captureProfileRef",
    "frameCount",
    "frames",
    "id",
    "kind",
    "normalizedWorldIrHash",
    "runtimeSessionId",
    "schemaVersion",
    "takeHash",
    "takeId",
    "worldBuildIdentityHash",
    "worldPackageRef",
    "worldPackageRootHash",
  ].sort();
  if (!isEqual(manifestKeys, expectedManifestKeys)) {
    addValidationDiagnostic(
      diagnostics,
      "CAPTURE_BUNDLE_JSON_INVALID",
      "bundle.json",
      "Bundle manifest must use the exact current identity fields.",
    );
  }
  if (
    worldPackageIdentity !== undefined &&
    !isEqual(Object.keys(worldPackageIdentity).sort(), [
      "normalizedWorldIrHash",
      "worldBuildIdentityHash",
      "worldPackageRef",
      "worldPackageRootHash",
    ].sort())
  ) {
    addValidationDiagnostic(
      diagnostics,
      "CAPTURE_BUNDLE_JSON_INVALID",
      "world-package-ref.json",
      "World Package identity must use the exact current identity fields.",
    );
  }
  let compiledTake: CompiledSimulationTakeV1 | undefined;
  try {
    compiledTake = compileSimulationTakeV1(take);
  } catch {
    addValidationDiagnostic(
      diagnostics,
      "CAPTURE_TAKE_MISMATCH",
      "take.json",
      "Simulation Take is invalid.",
    );
  }

  const declaredHashes = isPlainObject(integrity.fileHashesByPath)
    ? integrity.fileHashesByPath as Record<string, unknown>
    : {};
  const declaredFilePaths = Object.keys(declaredHashes).sort();
  const byteEvidence = await collectControlCaptureBundleByteEvidenceV1(
    resolvedDirectory,
  );
  const actualFilePaths = Object.keys(byteEvidence.fileHashesByPath).sort();
  for (const filePath of REQUIRED_BUNDLE_FILE_PATHS) {
    if (!actualFilePaths.includes(filePath)) {
      addValidationDiagnostic(
        diagnostics,
        "CAPTURE_FILE_MISSING",
        filePath,
        "Required Control Capture Bundle file is missing.",
      );
    }
  }
  for (const filePath of declaredFilePaths) {
    if (!actualFilePaths.includes(filePath)) {
      addValidationDiagnostic(diagnostics, "CAPTURE_FILE_MISSING", filePath, "Declared file is missing.");
      continue;
    }
    const actualHash = byteEvidence.fileHashesByPath[filePath];
    if (declaredHashes[filePath] !== actualHash) {
      addValidationDiagnostic(diagnostics, "CAPTURE_FILE_HASH_MISMATCH", filePath, "File bytes do not match the declared hash.");
    }
  }
  for (const filePath of actualFilePaths) {
    if (!declaredFilePaths.includes(filePath)) {
      addValidationDiagnostic(diagnostics, "CAPTURE_FILE_UNDECLARED", filePath, "File is not covered by bundle integrity.");
    }
  }
  const expectedRootHash = sha256CanonicalJson(declaredHashes);
  if (integrity.bundleRootHash !== expectedRootHash) {
    addValidationDiagnostic(diagnostics, "CAPTURE_ROOT_HASH_MISMATCH", "integrity.json", "Bundle root hash does not match its file hash map.");
  }

  if (compiledTake !== undefined) {
    if (
      manifest.takeId !== compiledTake.take.id ||
      manifest.takeHash !== compiledTake.takeHash
    ) {
      addValidationDiagnostic(
        diagnostics,
        "CAPTURE_TAKE_MISMATCH",
        "bundle.json",
        "Bundle identity does not match the validated Simulation Take.",
      );
    }
    if (
      manifest.worldPackageRef !== compiledTake.take.worldPackageRef ||
      manifest.worldPackageRootHash !== compiledTake.take.worldPackageRootHash
    ) {
      addValidationDiagnostic(
        diagnostics,
        "CAPTURE_WORLD_PACKAGE_MISMATCH",
        "bundle.json",
        "Bundle World Package identity does not match the Simulation Take.",
      );
    }
    if (
      manifest.captureProfileRef !== compiledTake.take.captureProfileRef ||
      manifest.captureEncodingProfileRef !== compiledTake.take.captureEncodingProfileRef
    ) {
      addValidationDiagnostic(
        diagnostics,
        "CAPTURE_PROFILE_MISMATCH",
        "bundle.json",
        "Bundle capture profiles do not match the Simulation Take.",
      );
    }
  }
  if (
    worldPackageIdentity !== undefined &&
    (
      worldPackageIdentity.worldPackageRef !== manifest.worldPackageRef ||
      worldPackageIdentity.worldPackageRootHash !== manifest.worldPackageRootHash ||
      worldPackageIdentity.normalizedWorldIrHash !== manifest.normalizedWorldIrHash ||
      worldPackageIdentity.worldBuildIdentityHash !==
        manifest.worldBuildIdentityHash
    )
  ) {
    addValidationDiagnostic(
      diagnostics,
      "CAPTURE_WORLD_PACKAGE_MISMATCH",
      "world-package-ref.json",
      "World Package identity file does not match the Bundle manifest.",
    );
  }
  if (
    captureProfileLock !== undefined &&
    (
      captureProfileLock.resourceRef !== CONTROL_CAPTURE_PROFILE_V1.resourceRef ||
      !isEqual(captureProfileLock.requiredPassIds, CONTROL_CAPTURE_PROFILE_V1.requiredPassIds)
    )
  ) {
    addValidationDiagnostic(
      diagnostics,
      "CAPTURE_PROFILE_MISMATCH",
      "capture-profile-lock.json",
      "Capture Profile lock does not match the required V1 pass set.",
    );
  }
  if (
    encodingProfileLock !== undefined &&
    !isEqual(encodingProfileLock, CONTROL_CAPTURE_PROFILE_V1.encodingProfile)
  ) {
    addValidationDiagnostic(
      diagnostics,
      "CAPTURE_PROFILE_MISMATCH",
      "encoding-profile-lock.json",
      "Capture Encoding Profile lock does not match web-v1.",
    );
  }
  const semanticNumericIds = validateIdTable(
    semanticClasses,
    "tables/semantic-classes.json",
    ["semanticClassId"],
    diagnostics,
  );
  const instanceNumericIds = validateIdTable(
    instances,
    "tables/instances.json",
    ["entityId", "semanticClassId"],
    diagnostics,
  );
  const semanticClassIds = new Set(
    (semanticClasses ?? []).flatMap((row) => {
      if (!isPlainObject(row)) return [];
      const record = row as Record<string, unknown>;
      return typeof record.semanticClassId === "string" ? [record.semanticClassId] : [];
    }),
  );
  (instances ?? []).forEach((row, index) => {
    if (!isPlainObject(row)) return;
    const record = row as Record<string, unknown>;
    if (
      typeof record.semanticClassId === "string" &&
      !semanticClassIds.has(record.semanticClassId)
    ) {
      addValidationDiagnostic(
        diagnostics,
        "CAPTURE_TABLE_INVALID",
        `tables/instances.json/${index}/semanticClassId`,
        "Instance table references an unknown Semantic Class ID.",
      );
    }
  });

  const { bundleManifestHash, ...manifestBody } = manifest;
  if (bundleManifestHash !== sha256CanonicalJson(manifestBody)) {
    addValidationDiagnostic(diagnostics, "CAPTURE_MANIFEST_HASH_MISMATCH", "bundle.json", "Bundle manifest hash is invalid.");
  }
  const frames = Array.isArray(manifest.frames) ? manifest.frames : [];
  const manifestFrameCount =
    typeof manifest.frameCount === "number" &&
      Number.isSafeInteger(manifest.frameCount) &&
      manifest.frameCount >= 0
      ? manifest.frameCount
      : undefined;
  if (
    compiledTake !== undefined &&
    frames.length !== compiledTake.captureSchedulePlan.entries.length
  ) {
    addValidationDiagnostic(
      diagnostics,
      "CAPTURE_FRAME_INDEX_INVALID",
      "bundle.json/frameCount",
      "Frame count does not match the compiled Capture Schedule.",
    );
  }
  let previousTick: number | undefined;
  for (let index = 0; index < frames.length; index += 1) {
    const frameEntry = frames[index];
    if (!isPlainObject(frameEntry)) {
      addValidationDiagnostic(diagnostics, "CAPTURE_BUNDLE_JSON_INVALID", `bundle.json/frames/${index}`, "Frame manifest entry is invalid.");
      continue;
    }
    const captureFrameIndex = (frameEntry as Record<string, unknown>).captureFrameIndex;
    const simulationTick = (frameEntry as Record<string, unknown>).simulationTick;
    if (captureFrameIndex !== index) {
      addValidationDiagnostic(diagnostics, "CAPTURE_FRAME_INDEX_INVALID", `bundle.json/frames/${index}`, "Capture frame indices are not contiguous.");
    }
    if (!Number.isSafeInteger(simulationTick) ||
      (previousTick !== undefined && (simulationTick as number) < previousTick)) {
      addValidationDiagnostic(diagnostics, "CAPTURE_FRAME_TICK_INVALID", `bundle.json/frames/${index}`, "Simulation ticks are not non-decreasing.");
    }
    if (Number.isSafeInteger(simulationTick)) previousTick = simulationTick as number;
    const expectedScheduleEntry = compiledTake?.captureSchedulePlan.entries[index];
    if (
      expectedScheduleEntry !== undefined &&
      simulationTick !== expectedScheduleEntry.simulationTick
    ) {
      addValidationDiagnostic(
        diagnostics,
        "CAPTURE_FRAME_TICK_INVALID",
        `bundle.json/frames/${index}`,
        "Frame tick does not match the compiled Capture Schedule.",
      );
    }
    const frameDirectoryName = String(index).padStart(6, "0");
    for (const passId of CONTROL_CAPTURE_PASS_IDS_V1) {
      const passPath = `frames/${frameDirectoryName}/${PASS_FILE_NAMES[passId]}`;
      if (!actualFilePaths.includes(passPath)) {
        addValidationDiagnostic(diagnostics, "CAPTURE_REQUIRED_PASS_MISSING", passPath, `Required pass '${passId}' is missing.`);
      }
    }
    const framePath = `frames/${frameDirectoryName}/frame.json`;
    const frame = actualFilePaths.includes(framePath)
      ? await readJsonRecord(resolvedDirectory, framePath, diagnostics)
      : undefined;
    if (frame !== undefined && frame.runtimeSessionId !== manifest.runtimeSessionId) {
      addValidationDiagnostic(diagnostics, "CAPTURE_SESSION_MISMATCH", framePath, "Frame belongs to another Runtime Session.");
    }
    if (frame !== undefined && frame.worldPackageRootHash !== manifest.worldPackageRootHash) {
      addValidationDiagnostic(diagnostics, "CAPTURE_WORLD_PACKAGE_MISMATCH", framePath, "Frame belongs to another World Package.");
    }
    if (frame !== undefined && frame.takeHash !== manifest.takeHash) {
      addValidationDiagnostic(diagnostics, "CAPTURE_TAKE_MISMATCH", framePath, "Frame belongs to another Simulation Take.");
    }
    if (frame !== undefined) {
      const widthPixels = frame.widthPixels;
      const heightPixels = frame.heightPixels;
      const validDimensions = Number.isSafeInteger(widthPixels) &&
        Number.isSafeInteger(heightPixels) &&
        (widthPixels as number) > 0 &&
        (heightPixels as number) > 0;
      if (!validDimensions) {
        addValidationDiagnostic(
          diagnostics,
          "CAPTURE_FRAME_DIMENSIONS_INVALID",
          framePath,
          "Frame dimensions must be positive safe integers.",
        );
      } else {
        const pixelCount = (widthPixels as number) * (heightPixels as number);
        for (const [passId, allowedIds] of [
          ["semantic-class-id", semanticNumericIds],
          ["instance-id", instanceNumericIds],
        ] as const) {
          const passPath = `frames/${frameDirectoryName}/${PASS_FILE_NAMES[passId]}`;
          if (!actualFilePaths.includes(passPath)) continue;
          const bytes = new Uint8Array(await readFile(path.join(resolvedDirectory, passPath)));
          const values = uint32ValuesFromBytes(bytes);
          if (
            values.length !== pixelCount ||
            values.some((value) => value !== 0 && !allowedIds.has(value))
          ) {
            addValidationDiagnostic(
              diagnostics,
              "CAPTURE_TABLE_INVALID",
              passPath,
              `Pass '${passId}' contains an ID outside its locked table or has the wrong pixel count.`,
            );
          }
        }
      }
      const { frameHash, ...frameBody } = frame;
      const expectedFrameHash = sha256CanonicalJson(frameBody);
      const manifestFrameHash = (frameEntry as Record<string, unknown>).frameHash;
      if (frameHash !== expectedFrameHash || manifestFrameHash !== expectedFrameHash) {
        addValidationDiagnostic(diagnostics, "CAPTURE_FRAME_HASH_MISMATCH", framePath, "Frame metadata hash is invalid.");
      }
    }
  }
  if (manifestFrameCount === undefined || manifestFrameCount !== frames.length) {
    addValidationDiagnostic(diagnostics, "CAPTURE_FRAME_INDEX_INVALID", "bundle.json/frameCount", "Frame count does not match frame manifests.");
  }
  if (
    manifestFrameCount === undefined ||
    snapshotTrackRows.length !== manifestFrameCount
  ) {
    addValidationDiagnostic(
      diagnostics,
      "CAPTURE_GAMEPLAY_REFERENCE_MISMATCH",
      "tracks/snapshots.ndjson",
      "Snapshot track must contain exactly one row for every captured frame.",
    );
  }
  const snapshotByFrameIndex = new Map<number, WorldRuntimeSnapshotV4>();
  const worldStateByFrameIndex = new Map<number, WorldStateSnapshotV1>();
  let trackWorldSessionId: string | undefined;
  for (const [index, row] of snapshotTrackRows.entries()) {
    if (!isPlainObject(row)) continue;
    const record = row as Record<string, unknown>;
    const captureFrameIndex = record.captureFrameIndex;
    let snapshot: WorldRuntimeSnapshotV4;
    let worldState: WorldStateSnapshotV1;
    try {
      snapshot = parseWorldRuntimeSnapshotV4(record.snapshot);
      worldState = parseWorldStateSnapshotV1(record.worldState);
    } catch {
      addValidationDiagnostic(
        diagnostics,
        "CAPTURE_GAMEPLAY_TRACK_INVALID",
        `tracks/snapshots.ndjson/${index}`,
        "Snapshot track row contains a non-canonical Snapshot or World State.",
      );
      continue;
    }
    if (
      !hasExactOwnKeys(record, [
        "captureFrameIndex",
        "simulationTick",
        "snapshot",
        "worldState",
      ]) ||
      !Number.isSafeInteger(captureFrameIndex) ||
      captureFrameIndex !== index ||
      snapshot.runtimeSessionId !== manifest.runtimeSessionId ||
      typeof snapshot.worldSessionId !== "string" ||
      (trackWorldSessionId !== undefined &&
        snapshot.worldSessionId !== trackWorldSessionId) ||
      record.simulationTick !== snapshot.world.simulationTick ||
      !capturedWorldStateClosureMatches(snapshot, worldState)
    ) {
      addValidationDiagnostic(
        diagnostics,
        "CAPTURE_GAMEPLAY_REFERENCE_MISMATCH",
        `tracks/snapshots.ndjson/${index}`,
        "Frame, Snapshot, and World State identities disagree.",
      );
      continue;
    }
    trackWorldSessionId ??= snapshot.worldSessionId;
    snapshotByFrameIndex.set(captureFrameIndex as number, snapshot);
    worldStateByFrameIndex.set(captureFrameIndex as number, worldState);
  }
  const eventsById = new Map<string, WorldSessionEventV1>();
  const eventIdsByReceiptId = new Map<string, string[]>();
  const worldSessionEventsByFrameIndex = new Map<number, WorldSessionEventV1[]>();
  const fixedTickEventsByFrameIndex = new Map<number, GameplayEventV1[]>();
  let previousEventTrackFrameIndex = -1;
  let previousEventTrackSequence = -1;
  for (const [index, row] of eventTrackRows.entries()) {
    if (!isPlainObject(row)) continue;
    const record = row as Record<string, unknown>;
    let event: WorldSessionEventV1;
    try {
      event = parseWorldSessionEventV1(record.event);
    } catch {
      addValidationDiagnostic(
        diagnostics,
        "CAPTURE_GAMEPLAY_TRACK_INVALID",
        `tracks/events.ndjson/${index}`,
        "Event row contains an invalid Gameplay Event.",
      );
      continue;
    }
    const source = isPlainObject(record.source)
      ? record.source as Record<string, unknown>
      : undefined;
    const frameIndex = record.captureFrameIndexAfter;
    const snapshot = Number.isSafeInteger(frameIndex)
      ? snapshotByFrameIndex.get(frameIndex as number)
      : undefined;
    const worldState = Number.isSafeInteger(frameIndex)
      ? worldStateByFrameIndex.get(frameIndex as number)
      : undefined;
    if (
      !hasExactOwnKeys(record, [
        "captureFrameIndexAfter",
        "source",
        "event",
      ]) ||
      source === undefined ||
      (source.kind !== "command-receipt" && source.kind !== "fixed-tick") ||
      (source.kind === "command-receipt" &&
        !hasExactOwnKeys(source, ["kind", "receiptId"])) ||
      (source.kind === "fixed-tick" && !hasExactOwnKeys(source, ["kind"])) ||
      event.runtimeSessionId !== manifest.runtimeSessionId ||
      event.worldSessionId !== snapshot?.worldSessionId ||
      event.simulationTick > (snapshot?.world.simulationTick ?? -1) ||
      event.sequence >
        (snapshot?.world.gameplayInspection.lastEventSequence ?? -1) ||
      eventsById.has(event.id)
    ) {
      addValidationDiagnostic(
        diagnostics,
        "CAPTURE_GAMEPLAY_REFERENCE_MISMATCH",
        `tracks/events.ndjson/${index}`,
        "Event identity, Session ownership, or uniqueness is invalid.",
      );
      continue;
    }
    eventsById.set(event.id, event);
    if (
      (frameIndex as number) < previousEventTrackFrameIndex ||
      event.sequence <= previousEventTrackSequence
    ) {
      addValidationDiagnostic(
        diagnostics,
        "CAPTURE_GAMEPLAY_REFERENCE_MISMATCH",
        `tracks/events.ndjson/${index}`,
        "WorldSession Event rows must remain in canonical frame and journal sequence order.",
      );
    }
    previousEventTrackFrameIndex = frameIndex as number;
    previousEventTrackSequence = event.sequence;
    const frameEvents = worldSessionEventsByFrameIndex.get(frameIndex as number) ?? [];
    frameEvents.push(event);
    worldSessionEventsByFrameIndex.set(frameIndex as number, frameEvents);
    if (source.kind === "command-receipt") {
      let gameplayEvent: GameplayEventV1;
      try {
        gameplayEvent = parseGameplayEventV1(event);
      } catch {
        addValidationDiagnostic(
          diagnostics,
          "CAPTURE_GAMEPLAY_REFERENCE_MISMATCH",
          `tracks/events.ndjson/${index}`,
          "Gameplay Command Receipt references a non-Gameplay Event.",
        );
        continue;
      }
      if (typeof source.receiptId !== "string") {
        addValidationDiagnostic(
          diagnostics,
          "CAPTURE_GAMEPLAY_REFERENCE_MISMATCH",
          `tracks/events.ndjson/${index}`,
          "Command Event source has no Receipt identity.",
        );
        continue;
      }
      const ids = eventIdsByReceiptId.get(source.receiptId) ?? [];
      ids.push(gameplayEvent.id);
      eventIdsByReceiptId.set(source.receiptId, ids);
      continue;
    }
    if (
      "commandId" in event ||
      worldState === undefined ||
      !Number.isSafeInteger(frameIndex)
    ) {
      addValidationDiagnostic(
        diagnostics,
        "CAPTURE_GAMEPLAY_REFERENCE_MISMATCH",
        `tracks/events.ndjson/${index}`,
        "Fixed-Tick Event disagrees with its bound post-Tick World State.",
      );
      continue;
    }
    const fixedEvents = fixedTickEventsByFrameIndex.get(frameIndex as number) ?? [];
    try {
      fixedEvents.push(parseGameplayEventV1(event));
      fixedTickEventsByFrameIndex.set(frameIndex as number, fixedEvents);
    } catch {
      // Camera Events are part of the exact WorldSession journal segment but
      // do not participate in Gameplay Fact terminal-state validation.
    }
  }
  for (const [frameIndex, events] of fixedTickEventsByFrameIndex) {
    const worldState = worldStateByFrameIndex.get(frameIndex);
    const lastFactEventById = new Map<string, GameplaySemanticFactEventV1>();
    for (const event of events) {
      if (
        event.type === "semantic-fact.started" ||
        event.type === "semantic-fact.ended"
      ) {
        lastFactEventById.set(event.semanticFact.id, event);
      }
    }
    for (const event of lastFactEventById.values()) {
      const finalFact = worldState?.semanticFactsById[event.semanticFact.id];
      if (
        worldState === undefined ||
        (event.type === "semantic-fact.started" && finalFact === undefined) ||
        (event.type === "semantic-fact.ended" && finalFact !== undefined)
      ) {
        addValidationDiagnostic(
          diagnostics,
          "CAPTURE_GAMEPLAY_REFERENCE_MISMATCH",
          `tracks/events.ndjson/fixed-tick-frame-${frameIndex}`,
          "Final semantic Fact transition disagrees with the bound post-Tick World State.",
        );
      }
    }
  }
  for (
    let frameIndex = 0;
    frameIndex < (manifestFrameCount ?? 0);
    frameIndex += 1
  ) {
    const events = [...(worldSessionEventsByFrameIndex.get(frameIndex) ?? [])];
    const worldState = worldStateByFrameIndex.get(frameIndex);
    if (frameIndex === 0) {
      if (events.length > 0) {
        addValidationDiagnostic(
          diagnostics,
          "CAPTURE_GAMEPLAY_REFERENCE_MISMATCH",
          "tracks/events.ndjson/frame-0",
          "The first captured World State is the journal baseline and cannot own Event rows.",
        );
      }
      continue;
    }
    const previousWorldState = worldStateByFrameIndex.get(frameIndex - 1);
    if (worldState === undefined || previousWorldState === undefined) continue;
    const expectedFirstSequence = previousWorldState.lastEventSequence + 1;
    const expectedEventCount =
      worldState.lastEventSequence - previousWorldState.lastEventSequence;
    if (
      expectedEventCount < 0 ||
      events.length !== expectedEventCount ||
      events.some((event, index) =>
        event.sequence !== expectedFirstSequence + index
      )
    ) {
      addValidationDiagnostic(
        diagnostics,
        "CAPTURE_GAMEPLAY_REFERENCE_MISMATCH",
        `tracks/events.ndjson/journal-segment-frame-${frameIndex}`,
        "Event rows must exactly cover the RuntimeHost journal sequence segment between adjacent captured World States.",
      );
    }

    const gameplayEvents = events.flatMap((event) => {
      try {
        return [parseGameplayEventV1(event)];
      } catch {
        return [];
      }
    });
    const previousFacts = previousWorldState.semanticFactsById;
    const currentFacts = worldState.semanticFactsById;
    const changedFactIds = new Set([
      ...Object.keys(previousFacts),
      ...Object.keys(currentFacts),
    ]);
    const factTransitionsValid = [...changedFactIds].every((factId) => {
      const before = previousFacts[factId];
      const after = currentFacts[factId];
      if (before !== undefined && after !== undefined) return true;
      const expectedType = before === undefined
        ? "semantic-fact.started"
        : "semantic-fact.ended";
      return gameplayEvents.filter((event) =>
        event.type === expectedType && event.semanticFact.id === factId
      ).length === 1;
    });
    if (!factTransitionsValid) {
      addValidationDiagnostic(
        diagnostics,
        "CAPTURE_GAMEPLAY_REFERENCE_MISMATCH",
        `tracks/events.ndjson/fact-transitions-frame-${frameIndex}`,
        "Semantic Fact episode changes must have one exact started or ended Event in the bound journal segment.",
      );
    }

    const previousRelationships = previousWorldState.relationshipStatesById;
    const currentRelationships = worldState.relationshipStatesById;
    const changedRelationshipIds = new Set([
      ...Object.keys(previousRelationships),
      ...Object.keys(currentRelationships),
    ]);
    const relationshipTransitionsValid = [...changedRelationshipIds]
      .every((relationshipId) => {
        const before = previousRelationships[relationshipId];
        const after = currentRelationships[relationshipId];
        if (isEqual(before, after)) return true;
        const removedCount = before === undefined
          ? 0
          : gameplayEvents.filter((event) =>
              event.type === "relationship.removed" &&
              event.relationship.id === relationshipId &&
              isEqual(event.relationship, before)
            ).length;
        const committedCount = after === undefined
          ? 0
          : gameplayEvents.filter((event) =>
              event.type === "relationship.committed" &&
              event.relationship.id === relationshipId &&
              isEqual(event.relationship, after)
            ).length;
        return removedCount === (before === undefined ? 0 : 1) &&
          committedCount === (after === undefined ? 0 : 1);
      });
    if (!relationshipTransitionsValid) {
      addValidationDiagnostic(
        diagnostics,
        "CAPTURE_GAMEPLAY_REFERENCE_MISMATCH",
        `tracks/events.ndjson/relationship-transitions-frame-${frameIndex}`,
        "Relationship changes must have exact committed or removed Events in the bound journal segment.",
      );
    }
  }
  const retainedReceiptRowCountById = new Map<string, number>();
  for (const [index, row] of actionTrackRows.entries()) {
    if (!isPlainObject(row)) continue;
    const record = row as Record<string, unknown>;
    let command: GameplayCommandV1;
    let receipt: GameplayCommandReceiptV1;
    let worldStateAfter: WorldStateSnapshotV1;
    let gameplayInspectionAfter: GameplayInspectionSnapshotV1;
    try {
      command = parseGameplayCommandV1(record.command);
      receipt = parseGameplayCommandReceiptV1(record.receipt);
      worldStateAfter = parseWorldStateSnapshotV1(record.worldStateAfter);
      gameplayInspectionAfter = parseGameplayInspectionSnapshotV1(
        record.gameplayInspectionAfter,
      );
    } catch {
      addValidationDiagnostic(
        diagnostics,
        "CAPTURE_GAMEPLAY_TRACK_INVALID",
        `tracks/actions.ndjson/${index}`,
        "Action row contains an invalid Command, Receipt, World State, or inspection Snapshot.",
      );
      continue;
    }
    const frameIndex = record.captureFrameIndexAfter;
    const snapshot = Number.isSafeInteger(frameIndex)
      ? snapshotByFrameIndex.get(frameIndex as number)
      : undefined;
    if (
      !hasExactOwnKeys(record, [
        "captureFrameIndexAfter",
        "simulationTick",
        "receipt",
        "worldStateAfterRef",
        "worldStateAfterHash",
        "worldStateAfter",
        "gameplayInspectionAfter",
        "command",
      ]) ||
      receipt.status !== "committed" ||
      command.id !== receipt.commandId ||
      receipt.commandHash !== deriveGameplayCommandHashV1(command) ||
      receipt.commandType !== command.type ||
      command.runtimeSessionId !== manifest.runtimeSessionId ||
      command.worldSessionId !== snapshot?.worldSessionId ||
      receipt.runtimeSessionId !== manifest.runtimeSessionId ||
      receipt.worldSessionId !== snapshot?.worldSessionId ||
      worldStateAfter.runtimeSessionId !== receipt.runtimeSessionId ||
      worldStateAfter.worldSessionId !== receipt.worldSessionId ||
      worldStateAfter.simulationTick !== receipt.simulationTick ||
      gameplayInspectionAfter.runtimeSessionId !== receipt.runtimeSessionId ||
      gameplayInspectionAfter.worldSessionId !== receipt.worldSessionId ||
      gameplayInspectionAfter.simulationTick !== receipt.simulationTick ||
      receipt.worldStateAfterRef !== deriveWorldStateSnapshotRefV1({
        runtimeSessionId: worldStateAfter.runtimeSessionId,
        worldSessionId: worldStateAfter.worldSessionId,
        worldStateHash: worldStateAfter.worldStateHash,
      }) ||
      receipt.worldStateAfterHash !== worldStateAfter.worldStateHash ||
      record.worldStateAfterRef !== receipt.worldStateAfterRef ||
      record.worldStateAfterHash !== receipt.worldStateAfterHash ||
      !isEqual(
        gameplayInspectionAfter.relationshipStatesById,
        worldStateAfter.relationshipStatesById,
      ) ||
      !isEqual(
        gameplayInspectionAfter.activeActionStatesById,
        worldStateAfter.activeActionStatesById,
      ) ||
      gameplayInspectionAfter.lastEventSequence !==
        worldStateAfter.lastEventSequence ||
      !isEqual(receipt.eventIds, eventIdsByReceiptId.get(receipt.id) ?? []) ||
      snapshot.world.simulationTick < receipt.simulationTick ||
      receipt.eventIds.some((eventId) => {
        const event = eventsById.get(eventId);
        return event === undefined ||
          event.runtimeSessionId !== receipt.runtimeSessionId ||
          event.worldSessionId !== receipt.worldSessionId ||
          event.simulationTick !== receipt.simulationTick ||
          ("commandId" in event && event.commandId !== command.id);
      })
    ) {
      addValidationDiagnostic(
        diagnostics,
        "CAPTURE_GAMEPLAY_REFERENCE_MISMATCH",
        `tracks/actions.ndjson/${index}`,
        "Action, Receipt, Event, Snapshot, or World State identities disagree.",
      );
    } else {
      retainedReceiptRowCountById.set(
        receipt.id,
        (retainedReceiptRowCountById.get(receipt.id) ?? 0) + 1,
      );
    }
  }
  for (const receiptId of eventIdsByReceiptId.keys()) {
    if (retainedReceiptRowCountById.get(receiptId) !== 1) {
      addValidationDiagnostic(
        diagnostics,
        "CAPTURE_GAMEPLAY_REFERENCE_MISMATCH",
        `tracks/events.ndjson/receipt-${receiptId}`,
        "Command Event source does not resolve to one retained Command Receipt row.",
      );
    }
  }
  const expectedRelationshipRows = eventTrackRows.flatMap((row) => {
    if (!isPlainObject(row)) return [];
    const record = row as Record<string, unknown>;
    let event: GameplayEventV1;
    try {
      event = parseGameplayEventV1(record.event);
    } catch {
      return [];
    }
    if (
      event.type !== "relationship.committed" &&
      event.type !== "relationship.removed"
    ) return [];
    return [{
      captureFrameIndexAfter: record.captureFrameIndexAfter,
      source: record.source,
      eventId: event.id,
      operation: event.type === "relationship.committed" ? "add" : "remove",
      relationship: event.relationship,
    }];
  });
  if (!isEqual(relationshipTrackRows, expectedRelationshipRows)) {
    addValidationDiagnostic(
      diagnostics,
      "CAPTURE_GAMEPLAY_REFERENCE_MISMATCH",
      "tracks/relationships.ndjson",
      "Relationship rows must exactly project Relationship Events.",
    );
  }
  for (const [index, row] of relationshipTrackRows.entries()) {
    if (!isPlainObject(row)) {
      continue;
    }
    const record = row as Record<string, unknown>;
    if (!Number.isSafeInteger(record.captureFrameIndexAfter)) continue;
    const snapshot = snapshotByFrameIndex.get(
      record.captureFrameIndexAfter as number,
    );
    const relationship = record.relationship as { id?: unknown } | undefined;
    const state = typeof relationship?.id === "string"
      ? snapshot?.world.gameplayInspection.relationshipStatesById[relationship.id]
      : undefined;
    if (
      snapshot === undefined ||
      (record.operation === "add" && !isEqual(state, relationship)) ||
      (record.operation === "remove" && state !== undefined)
    ) {
      addValidationDiagnostic(
        diagnostics,
        "CAPTURE_GAMEPLAY_REFERENCE_MISMATCH",
        `tracks/relationships.ndjson/${index}`,
        "Relationship row does not match its bound post-transition Snapshot.",
      );
    }
  }
  if (diagnostics.length > 0 || typeof integrity.bundleRootHash !== "string") {
    return { ok: false, diagnostics };
  }
  return {
    ok: true,
    diagnostics: [],
    bundleRootHash: integrity.bundleRootHash as Sha256HashV1,
  };
}

export async function inspectControlCaptureBundleV1(
  directory: string,
): Promise<ControlCaptureBundleInspectionV1> {
  const validation = await validateControlCaptureBundleV1(directory);
  if (!validation.ok) {
    throw new Error("CAPTURE_BUNDLE_INVALID: Inspect requires a valid bundle.");
  }
  const manifest = JSON.parse(await readFile(path.join(directory, "bundle.json"), "utf8")) as Record<string, unknown>;
  return {
    bundleId: manifest.id as string,
    frameCount: manifest.frameCount as number,
    runtimeSessionId: manifest.runtimeSessionId as string,
    worldPackageRootHash: manifest.worldPackageRootHash as Sha256HashV1,
    worldBuildIdentityHash: manifest.worldBuildIdentityHash as Sha256HashV1,
    takeHash: manifest.takeHash as Sha256HashV1,
    bundleRootHash: validation.bundleRootHash,
  };
}
