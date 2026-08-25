import {
  canonicalizeWorldStateSnapshotV1,
  deriveWorldStateSnapshotRefV1,
  parseWorldStateSnapshotV1,
  type WorldStateSnapshotV1,
} from "@whitebox-world/gameplay-contracts";
import { isNil } from "lodash-es";

interface WorldStateArtifactStoreOptionsV1 {
  readonly maximumRetainedWorldStateSnapshotCount: number;
}

export interface WorldStateArtifactStoreSnapshotV1 {
  readonly retainedWorldStateSnapshotCount: number;
  readonly reservedWorldStateSnapshotCount: number;
  readonly isDisposed: boolean;
}

export interface WorldStateArtifactReservationV1 {
  prepare(snapshot: unknown): PreparedWorldStateArtifactPublicationV1;
  release(): "released";
}

export interface PreparedWorldStateArtifactPublicationV1 {
  readonly worldStateRef: string;
  readonly snapshot: WorldStateSnapshotV1;
  commitPrepared(): WorldStateSnapshotV1;
}

export type WorldStateArtifactReservationResultV1 =
  | Readonly<{
      status: "reserved";
      reservation: WorldStateArtifactReservationV1;
    }>
  | Readonly<{ status: "capacity-exceeded" }>;

interface RetainedWorldStateArtifactV1 {
  readonly canonical: string;
  readonly snapshot: WorldStateSnapshotV1;
}

const CAPACITY_EXCEEDED = Object.freeze({ status: "capacity-exceeded" as const });
const WORLD_STATE_REF_PATTERN = /^worldkit:\/\/world-state\/world-state:[0-9a-f]{64}$/;

function parseOptions(input: unknown): WorldStateArtifactStoreOptionsV1 {
  if (typeof input !== "object" || isNil(input)) {
    throw new RangeError("maximumRetainedWorldStateSnapshotCount must be a non-negative safe integer.");
  }
  try {
    const prototype = Reflect.getPrototypeOf(input);
    if (!isNil(prototype) && prototype !== Object.prototype) throw new Error();
    const keys = Reflect.ownKeys(input);
    if (
      keys.length !== 1 ||
      keys[0] !== "maximumRetainedWorldStateSnapshotCount"
    ) throw new Error();
    const descriptor = Reflect.getOwnPropertyDescriptor(
      input,
      "maximumRetainedWorldStateSnapshotCount",
    );
    if (
      isNil(descriptor) ||
      !descriptor.enumerable ||
      !("value" in descriptor) ||
      typeof descriptor.value !== "number" ||
      !Number.isSafeInteger(descriptor.value) ||
      descriptor.value < 0 ||
      Object.is(descriptor.value, -0)
    ) throw new Error();
    return Object.freeze({
      maximumRetainedWorldStateSnapshotCount: descriptor.value,
    });
  } catch {
    throw new RangeError("maximumRetainedWorldStateSnapshotCount must be a non-negative safe integer.");
  }
}

function assertWorldStateRef(input: unknown): asserts input is string {
  if (typeof input !== "string" || !WORLD_STATE_REF_PATTERN.test(input)) {
    throw new RangeError("World State Ref is invalid.");
  }
}

function refOf(snapshot: WorldStateSnapshotV1): string {
  return deriveWorldStateSnapshotRefV1({
    runtimeSessionId: snapshot.runtimeSessionId,
    worldSessionId: snapshot.worldSessionId,
    worldStateHash: snapshot.worldStateHash,
  });
}

export class WorldStateArtifactStore {
  private readonly maximumRetainedWorldStateSnapshotCount: number;
  private readonly artifactsByRef = new Map<string, RetainedWorldStateArtifactV1>();
  private reservedNewArtifactCount = 0;
  private isDisposed = false;

  constructor(optionsInput: unknown) {
    this.maximumRetainedWorldStateSnapshotCount =
      parseOptions(optionsInput).maximumRetainedWorldStateSnapshotCount;
  }

  reserve(worldStateRefInput: unknown): WorldStateArtifactReservationResultV1 {
    this.assertActive();
    assertWorldStateRef(worldStateRefInput);
    return this.reserveInternal(worldStateRefInput);
  }

  reserveSlot(): WorldStateArtifactReservationResultV1 {
    this.assertActive();
    return this.reserveInternal(undefined);
  }

  private reserveInternal(
    expectedWorldStateRef: string | undefined,
  ): WorldStateArtifactReservationResultV1 {
    const retainedAtReservation = isNil(expectedWorldStateRef)
      ? undefined
      : this.artifactsByRef.get(expectedWorldStateRef);
    const requiresNewSlot = isNil(expectedWorldStateRef) || isNil(retainedAtReservation);
    if (
      requiresNewSlot &&
      this.artifactsByRef.size + this.reservedNewArtifactCount >=
        this.maximumRetainedWorldStateSnapshotCount
    ) return CAPACITY_EXCEEDED;
    if (requiresNewSlot) this.reservedNewArtifactCount += 1;
    let state: "reserved" | "prepared" | "released" | "committed" = "reserved";
    let slotHeld = requiresNewSlot;

    const releaseSlot = (): void => {
      if (!slotHeld) return;
      slotHeld = false;
      if (!this.isDisposed) this.reservedNewArtifactCount -= 1;
    };
    const reservation = Object.freeze({
      release: (): "released" => {
        if (state === "reserved" || state === "prepared") {
          state = "released";
          releaseSlot();
        }
        return "released";
      },
      prepare: (snapshotInput: unknown): PreparedWorldStateArtifactPublicationV1 => {
        if (state !== "reserved") {
          throw new Error("World State artifact reservation is no longer available to prepare.");
        }
        try {
          this.assertActive();
          const snapshot = parseWorldStateSnapshotV1(snapshotInput);
          const worldStateRef = refOf(snapshot);
          if (
            !isNil(expectedWorldStateRef) &&
            worldStateRef !== expectedWorldStateRef
          ) {
            throw new RangeError("World State Snapshot does not match the reserved Ref.");
          }
          const canonical = canonicalizeWorldStateSnapshotV1(snapshot);
          const retained = this.artifactsByRef.get(worldStateRef);
          if (!isNil(retained)) {
            if (retained.canonical !== canonical) {
              throw new Error("World State artifact canonical bytes conflict for the same Ref.");
            }
            state = "prepared";
            return Object.freeze({
              worldStateRef,
              snapshot: retained.snapshot,
              commitPrepared: (): WorldStateSnapshotV1 => {
                if (this.isDisposed) {
                  state = "released";
                  releaseSlot();
                  return retained.snapshot;
                }
                if (state === "prepared") {
                  state = "committed";
                  releaseSlot();
                }
                return retained.snapshot;
              },
            });
          }
          if (!requiresNewSlot) {
            throw new Error("World State artifact reservation lost its retained Ref.");
          }
          const retainedArtifact = Object.freeze({
            canonical,
            snapshot,
          });
          state = "prepared";
          return Object.freeze({
            worldStateRef,
            snapshot,
            commitPrepared: (): WorldStateSnapshotV1 => {
              if (this.isDisposed) {
                state = "released";
                releaseSlot();
                return snapshot;
              }
              if (state !== "prepared") return snapshot;
              state = "committed";
              releaseSlot();
              this.artifactsByRef.set(worldStateRef, retainedArtifact);
              return snapshot;
            },
          });
        } catch (error) {
          state = "released";
          releaseSlot();
          throw error;
        }
      },
    });
    return Object.freeze({ status: "reserved", reservation });
  }

  get(worldStateRefInput: unknown): WorldStateSnapshotV1 | undefined {
    this.assertActive();
    assertWorldStateRef(worldStateRefInput);
    const retained = this.artifactsByRef.get(worldStateRefInput);
    return isNil(retained) ? undefined : retained.snapshot;
  }

  snapshot(): WorldStateArtifactStoreSnapshotV1 {
    return Object.freeze({
      retainedWorldStateSnapshotCount: this.artifactsByRef.size,
      reservedWorldStateSnapshotCount: this.reservedNewArtifactCount,
      isDisposed: this.isDisposed,
    });
  }

  dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    this.artifactsByRef.clear();
    this.reservedNewArtifactCount = 0;
  }

  private assertActive(): void {
    if (this.isDisposed) throw new Error("World State artifact store is disposed.");
  }
}
