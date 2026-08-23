import {
  canonicalizeGameplayCommandV1,
  deriveGameplayCommandHashV1,
  parseGameplayCommandReceiptV1,
  parseGameplayCommandV1,
  parseGameplayEventV1,
  type GameplayCommandReceiptV1,
  type GameplayCommandV1,
  type GameplayEventV1,
  type Sha256HashV1,
} from "@whitebox-world/gameplay-contracts";
import { isNil } from "lodash-es";

interface CommandJournalCapacityV1 {
  readonly maximumIdempotencyRecordCount: number;
  readonly maximumRetainedReceiptCount: number;
  readonly maximumRetainedEventCount: number;
}

interface CommandJournalReservationRequestV1 {
  readonly simulationTick: number;
  readonly idempotencyRecordCount: number;
  readonly receiptCount: number;
  readonly eventCount: number;
}

interface EventJournalReservationRequestV1 {
  readonly eventCount: number;
}

interface CommandJournalCommitBundleV1 {
  readonly command: GameplayCommandV1;
  readonly commandHash: Sha256HashV1;
  readonly receipt: GameplayCommandReceiptV1;
  readonly events: readonly GameplayEventV1[];
}

export interface CommandJournalSnapshotV1 {
  readonly commandAdmissionClosedSimulationTick: number | undefined;
  readonly retainedIdempotencyRecordCount: number;
  readonly retainedReceiptCount: number;
  readonly retainedEventCount: number;
  readonly reservedIdempotencyRecordCount: number;
  readonly reservedReceiptCount: number;
  readonly reservedEventCount: number;
}

export type CommandJournalLookupResultV1 =
  | Readonly<{ status: "missing" }>
  | Readonly<{ status: "conflict" }>
  | Readonly<{
      status: "replay";
      receipt: GameplayCommandReceiptV1;
    }>;

export interface CommandJournalCapacityReservationV1 {
  prepare(bundle: CommandJournalCommitBundleV1): PreparedCommandJournalPublicationV1;
  release(): "released";
}

export interface PreparedCommandJournalPublicationV1 {
  readonly receipt: GameplayCommandReceiptV1;
  commitPrepared(): GameplayCommandReceiptV1;
}

export type CommandJournalReservationResultV1 =
  | Readonly<{
      status: "reserved";
      reservation: CommandJournalCapacityReservationV1;
    }>
  | Readonly<{
      status: "command-admission-closed";
      commandAdmissionClosedSimulationTick: number;
    }>
  | Readonly<{ status: "event-capacity-exceeded" }>;

interface EventJournalCapacityReservationV1 {
  prepare(events: readonly GameplayEventV1[]): PreparedEventJournalPublicationV1;
  release(): "released";
}

interface PreparedEventJournalPublicationV1 {
  readonly events: readonly GameplayEventV1[];
  commitPrepared(): readonly GameplayEventV1[];
}

type EventJournalReservationResultV1 =
  | Readonly<{
      status: "reserved";
      reservation: EventJournalCapacityReservationV1;
    }>
  | Readonly<{ status: "event-capacity-exceeded" }>;

interface RetainedCommandRecordV1 {
  readonly commandHash: Sha256HashV1;
  readonly commandCanonical: string;
  readonly receipt: GameplayCommandReceiptV1;
  readonly lookupResult: Extract<
    CommandJournalLookupResultV1,
    { status: "replay" }
  >;
}

interface MutableReservationCountsV1 {
  idempotencyRecordCount: number;
  receiptCount: number;
  eventCount: number;
}

const MISSING = Object.freeze({ status: "missing" as const });
const CONFLICT = Object.freeze({ status: "conflict" as const });
const EVENT_CAPACITY_EXCEEDED = Object.freeze({
  status: "event-capacity-exceeded" as const,
});

function snapshotPlainRecord(input: unknown): Record<string, unknown> | undefined {
  if (typeof input !== "object" || isNil(input)) return undefined;
  try {
    const prototype = Reflect.getPrototypeOf(input);
    if (!isNil(prototype) && prototype !== Object.prototype) return undefined;
    const result: Record<string, unknown> = {};
    for (const key of Reflect.ownKeys(input)) {
      const descriptor = Reflect.getOwnPropertyDescriptor(input, key);
      if (
        typeof key !== "string" ||
        isNil(descriptor) ||
        !descriptor.enumerable ||
        !("value" in descriptor)
      ) return undefined;
      result[key] = descriptor.value;
    }
    return result;
  } catch {
    return undefined;
  }
}

function hasExactKeys(
  input: Readonly<Record<string, unknown>>,
  keys: readonly string[],
): boolean {
  const actual = Reflect.ownKeys(input);
  return actual.length === keys.length && actual.every(
    (key) => typeof key === "string" && keys.includes(key),
  );
}

function snapshotPlainArray(input: unknown): readonly unknown[] | undefined {
  if (!Array.isArray(input)) return undefined;
  try {
    if (Reflect.getPrototypeOf(input) !== Array.prototype) return undefined;
    if (Reflect.ownKeys(input).some((key) => typeof key === "symbol")) {
      return undefined;
    }
    const ownNames = Object.getOwnPropertyNames(input);
    if (ownNames.length !== input.length + 1) return undefined;
    const result: unknown[] = [];
    for (let index = 0; index < input.length; index += 1) {
      const descriptor = Reflect.getOwnPropertyDescriptor(input, String(index));
      if (
        isNil(descriptor) ||
        !descriptor.enumerable ||
        !("value" in descriptor)
      ) return undefined;
      result.push(descriptor.value);
    }
    const lengthDescriptor = Reflect.getOwnPropertyDescriptor(input, "length");
    if (isNil(lengthDescriptor) || lengthDescriptor.enumerable !== false) {
      return undefined;
    }
    return result;
  } catch {
    return undefined;
  }
}

function isSafeNonNegativeInteger(input: unknown): input is number {
  return typeof input === "number" &&
    Number.isSafeInteger(input) &&
    input >= 0 &&
    !Object.is(input, -0);
}

function parseCapacity(input: unknown): CommandJournalCapacityV1 {
  const record = snapshotPlainRecord(input);
  const keys = [
    "maximumIdempotencyRecordCount",
    "maximumRetainedReceiptCount",
    "maximumRetainedEventCount",
  ] as const;
  if (
    isNil(record) ||
    !hasExactKeys(record, keys) ||
    !keys.every((key) => isSafeNonNegativeInteger(record[key]))
  ) {
    throw new RangeError("CommandJournal capacity must be an exact non-negative integer budget.");
  }
  return Object.freeze({
    maximumIdempotencyRecordCount: record.maximumIdempotencyRecordCount as number,
    maximumRetainedReceiptCount: record.maximumRetainedReceiptCount as number,
    maximumRetainedEventCount: record.maximumRetainedEventCount as number,
  });
}

function parseReservationRequest(input: unknown): CommandJournalReservationRequestV1 {
  const record = snapshotPlainRecord(input);
  const keys = [
    "simulationTick",
    "idempotencyRecordCount",
    "receiptCount",
    "eventCount",
  ] as const;
  if (
    isNil(record) ||
    !hasExactKeys(record, keys) ||
    !keys.every((key) => isSafeNonNegativeInteger(record[key])) ||
    record.idempotencyRecordCount !== 1 ||
    record.receiptCount !== 1
  ) {
    throw new RangeError(
      "CommandJournal reservation must be an exact one-command capacity request.",
    );
  }
  return Object.freeze({
    simulationTick: record.simulationTick as number,
    idempotencyRecordCount: 1,
    receiptCount: 1,
    eventCount: record.eventCount as number,
  });
}

function parseEventReservationRequest(input: unknown): EventJournalReservationRequestV1 {
  const record = snapshotPlainRecord(input);
  if (
    isNil(record) ||
    !hasExactKeys(record, ["eventCount"]) ||
    !isSafeNonNegativeInteger(record.eventCount)
  ) {
    throw new RangeError(
      "CommandJournal Event reservation must be an exact non-negative integer request.",
    );
  }
  return Object.freeze({ eventCount: record.eventCount });
}

function parseEventBundle(input: unknown): readonly GameplayEventV1[] {
  const eventInputs = snapshotPlainArray(input);
  if (isNil(eventInputs)) {
    throw new RangeError("CommandJournal Event publication is invalid.");
  }
  return Object.freeze(eventInputs.map((event) => parseGameplayEventV1(event)));
}

function parseCommitBundle(input: unknown): Readonly<{
  command: GameplayCommandV1;
  commandHash: Sha256HashV1;
  commandCanonical: string;
  receipt: GameplayCommandReceiptV1;
  events: readonly GameplayEventV1[];
}> {
  const record = snapshotPlainRecord(input);
  if (
    isNil(record) ||
    !hasExactKeys(record, ["command", "commandHash", "receipt", "events"])
  ) throw new RangeError("CommandJournal commit bundle is invalid.");
  const eventInputs = snapshotPlainArray(record.events);
  if (isNil(eventInputs)) {
    throw new RangeError("CommandJournal commit bundle is invalid.");
  }

  const command = parseGameplayCommandV1(record.command);
  const derivedCommandHash = deriveGameplayCommandHashV1(command);
  if (record.commandHash !== derivedCommandHash) {
    throw new RangeError("CommandJournal commandHash does not match the canonical command.");
  }
  const receipt = parseGameplayCommandReceiptV1(record.receipt);
  if (
    receipt.commandId !== command.id ||
    receipt.commandHash !== derivedCommandHash ||
    receipt.commandType !== command.type ||
    receipt.runtimeSessionId !== command.runtimeSessionId ||
    receipt.worldSessionId !== command.worldSessionId
  ) throw new RangeError("CommandJournal Receipt does not match the canonical command.");

  const events = Object.freeze(eventInputs.map((event) =>
    parseGameplayEventV1(event)
  ));
  if (
    receipt.eventIds.length !== events.length ||
    receipt.eventIds.some((eventId, index) => {
      const event = events[index];
      return isNil(event) || eventId !== event.id;
    }) ||
    new Set(events.map((event) => event.id)).size !== events.length ||
    events.some((event) =>
      event.runtimeSessionId !== command.runtimeSessionId ||
      event.worldSessionId !== command.worldSessionId
    )
  ) throw new RangeError("CommandJournal Receipt Event IDs do not match the retained Events.");

  return Object.freeze({
    command,
    commandHash: derivedCommandHash,
    commandCanonical: canonicalizeGameplayCommandV1(command),
    receipt,
    events,
  });
}

export class CommandJournal {
  private readonly capacity: CommandJournalCapacityV1;
  private readonly retainedCommandsById = new Map<string, RetainedCommandRecordV1>();
  private readonly retainedEventsById = new Map<string, GameplayEventV1>();
  private readonly retainedEventSequences = new Set<number>();
  private readonly stagedEventOwnerById = new Map<string, symbol>();
  private readonly stagedEventOwnerBySequence = new Map<number, symbol>();
  private readonly reserved: MutableReservationCountsV1 = {
    idempotencyRecordCount: 0,
    receiptCount: 0,
    eventCount: 0,
  };
  private retainedReceiptCount = 0;
  private lastRetainedEventSequence = -1;
  private commandAdmissionClosedSimulationTick: number | undefined;

  constructor(capacityInput: unknown) {
    this.capacity = parseCapacity(capacityInput);
  }

  lookup(commandInput: unknown, commandHash: Sha256HashV1): CommandJournalLookupResultV1 {
    const command = parseGameplayCommandV1(commandInput);
    const derivedHash = deriveGameplayCommandHashV1(command);
    if (commandHash !== derivedHash) {
      throw new RangeError("CommandJournal lookup hash does not match the canonical command.");
    }
    const retained = this.retainedCommandsById.get(command.id);
    if (isNil(retained)) return MISSING;
    if (
      retained.commandHash !== commandHash ||
      retained.commandCanonical !== canonicalizeGameplayCommandV1(command)
    ) return CONFLICT;
    return retained.lookupResult;
  }

  private releaseStagedEventClaims(owner: symbol): void {
    for (const [eventId, claimOwner] of this.stagedEventOwnerById) {
      if (claimOwner === owner) this.stagedEventOwnerById.delete(eventId);
    }
    for (const [sequence, claimOwner] of this.stagedEventOwnerBySequence) {
      if (claimOwner === owner) this.stagedEventOwnerBySequence.delete(sequence);
    }
  }

  private stageEventClaims(
    events: readonly GameplayEventV1[],
    owner: symbol,
  ): void {
    if (
      events.some((event, index) =>
        event.sequence <= (index === 0
          ? this.lastRetainedEventSequence
          : events[index - 1]!.sequence)
      )
    ) {
      throw new RangeError("CommandJournal Events are not in canonical sequence order.");
    }

    for (const event of events) {
      const idOwner = this.stagedEventOwnerById.get(event.id);
      const sequenceOwner = this.stagedEventOwnerBySequence.get(event.sequence);
      if (
        this.retainedEventsById.has(event.id) ||
        this.retainedEventSequences.has(event.sequence) ||
        (!isNil(idOwner) && idOwner !== owner) ||
        (!isNil(sequenceOwner) && sequenceOwner !== owner)
      ) {
        throw new Error(`CommandJournal Event '${event.id}' is already staged or retained.`);
      }
    }
    let lastSequenceClaimedByAnotherReservation = this.lastRetainedEventSequence;
    for (const [sequence, claimOwner] of this.stagedEventOwnerBySequence) {
      if (claimOwner !== owner) {
        lastSequenceClaimedByAnotherReservation = Math.max(
          lastSequenceClaimedByAnotherReservation,
          sequence,
        );
      }
    }
    const firstEvent = events[0];
    if (
      !isNil(firstEvent) &&
      firstEvent.sequence <= lastSequenceClaimedByAnotherReservation
    ) {
      throw new RangeError("CommandJournal Events are not in canonical sequence order.");
    }
    for (const event of events) {
      this.stagedEventOwnerById.set(event.id, owner);
      this.stagedEventOwnerBySequence.set(event.sequence, owner);
    }
  }

  private retainEvents(events: readonly GameplayEventV1[]): void {
    for (const event of events) {
      this.retainedEventsById.set(event.id, event);
      this.retainedEventSequences.add(event.sequence);
      this.lastRetainedEventSequence = Math.max(
        this.lastRetainedEventSequence,
        event.sequence,
      );
    }
  }

  reserveEventCapacity(input: unknown): EventJournalReservationResultV1 {
    const request = parseEventReservationRequest(input);
    if (
      this.retainedEventsById.size + this.reserved.eventCount + request.eventCount >
      this.capacity.maximumRetainedEventCount
    ) return EVENT_CAPACITY_EXCEEDED;

    this.reserved.eventCount += request.eventCount;
    const claimOwner = Symbol("CommandJournal Event reservation");
    let state: "reserved" | "released" | "committed" = "reserved";
    let committedEvents: readonly GameplayEventV1[] | undefined;

    const releaseReservation = (): void => {
      this.reserved.eventCount -= request.eventCount;
      this.releaseStagedEventClaims(claimOwner);
    };
    const reservation = Object.freeze({
      release: (): "released" => {
        if (state === "reserved") {
          state = "released";
          releaseReservation();
        }
        return "released";
      },
      prepare: (eventsInput: readonly GameplayEventV1[]): PreparedEventJournalPublicationV1 => {
        if (state !== "reserved") {
          throw new Error("CommandJournal Event reservation is no longer available to prepare.");
        }
        let events: readonly GameplayEventV1[];
        try {
          events = parseEventBundle(eventsInput);
          if (events.length > request.eventCount) {
            throw new RangeError("CommandJournal Event count exceeds the reservation.");
          }
          this.stageEventClaims(events, claimOwner);
        } catch (error) {
          state = "released";
          releaseReservation();
          throw error;
        }

        return Object.freeze({
          events,
          commitPrepared: (): readonly GameplayEventV1[] => {
            if (state === "committed" && !isNil(committedEvents)) {
              return committedEvents;
            }
            if (state !== "reserved") return events;
            state = "committed";
            committedEvents = events;
            releaseReservation();
            this.retainEvents(events);
            return events;
          },
        });
      },
    });
    return Object.freeze({ status: "reserved", reservation });
  }

  reserveCapacity(input: unknown): CommandJournalReservationResultV1 {
    const request = parseReservationRequest(input);
    if (!isNil(this.commandAdmissionClosedSimulationTick)) {
      return Object.freeze({
        status: "command-admission-closed",
        commandAdmissionClosedSimulationTick:
          this.commandAdmissionClosedSimulationTick,
      });
    }

    if (
      this.retainedCommandsById.size + this.reserved.idempotencyRecordCount +
          request.idempotencyRecordCount >
        this.capacity.maximumIdempotencyRecordCount ||
      this.retainedReceiptCount + this.reserved.receiptCount + request.receiptCount >
        this.capacity.maximumRetainedReceiptCount
    ) {
      this.commandAdmissionClosedSimulationTick = request.simulationTick;
      return Object.freeze({
        status: "command-admission-closed",
        commandAdmissionClosedSimulationTick: request.simulationTick,
      });
    }
    if (
      this.retainedEventsById.size + this.reserved.eventCount + request.eventCount >
      this.capacity.maximumRetainedEventCount
    ) return EVENT_CAPACITY_EXCEEDED;

    this.reserved.idempotencyRecordCount += request.idempotencyRecordCount;
    this.reserved.receiptCount += request.receiptCount;
    this.reserved.eventCount += request.eventCount;
    const claimOwner = Symbol("CommandJournal command reservation");
    let state: "reserved" | "released" | "committed" = "reserved";
    let committedReceipt: GameplayCommandReceiptV1 | undefined;

    const releaseCounts = (): void => {
      this.reserved.idempotencyRecordCount -= request.idempotencyRecordCount;
      this.reserved.receiptCount -= request.receiptCount;
      this.reserved.eventCount -= request.eventCount;
      this.releaseStagedEventClaims(claimOwner);
    };
    const reservation = Object.freeze({
      release: (): "released" => {
        if (state === "reserved") {
          state = "released";
          releaseCounts();
        }
        return "released";
      },
      prepare: (
        bundleInput: CommandJournalCommitBundleV1,
      ): PreparedCommandJournalPublicationV1 => {
        if (state !== "reserved") {
          throw new Error("CommandJournal reservation is no longer available to prepare.");
        }
        let bundle: ReturnType<typeof parseCommitBundle>;
        try {
          bundle = parseCommitBundle(bundleInput);
          if (bundle.events.length > request.eventCount) {
            throw new RangeError("CommandJournal Event count exceeds the reservation.");
          }
          if (bundle.receipt.simulationTick !== request.simulationTick) {
            throw new RangeError("CommandJournal Receipt Tick differs from the reservation.");
          }
          if (this.retainedCommandsById.has(bundle.command.id)) {
            throw new Error("CommandJournal command ID is already retained.");
          }
          this.stageEventClaims(bundle.events, claimOwner);
        } catch (error) {
          state = "released";
          releaseCounts();
          throw error;
        }

        const replay = Object.freeze({
          status: "replay" as const,
          receipt: bundle.receipt,
        });
        const retainedRecord = Object.freeze({
          commandHash: bundle.commandHash,
          commandCanonical: bundle.commandCanonical,
          receipt: bundle.receipt,
          lookupResult: replay,
        });
        return Object.freeze({
          receipt: bundle.receipt,
          commitPrepared: (): GameplayCommandReceiptV1 => {
            if (state === "committed" && !isNil(committedReceipt)) {
              return committedReceipt;
            }
            if (state !== "reserved") return bundle.receipt;
            state = "committed";
            committedReceipt = bundle.receipt;
            releaseCounts();
            this.retainedCommandsById.set(bundle.command.id, retainedRecord);
            this.retainedReceiptCount += 1;
            this.retainEvents(bundle.events);
            return bundle.receipt;
          },
        });
      },
    });
    return Object.freeze({ status: "reserved", reservation });
  }

  getEvent(eventId: string): GameplayEventV1 | undefined {
    return this.retainedEventsById.get(eventId);
  }

  eventsAfter(
    afterSequenceInput: unknown,
    maximumCountInput: unknown,
  ): readonly GameplayEventV1[] {
    if (
      !isSafeNonNegativeInteger(afterSequenceInput) ||
      !isSafeNonNegativeInteger(maximumCountInput)
    ) {
      throw new RangeError(
        "CommandJournal Event cursor and count must be safe non-negative integers.",
      );
    }
    if (maximumCountInput === 0) return Object.freeze([]);
    return Object.freeze([...this.retainedEventsById.values()]
      .filter((event) => event.sequence > afterSequenceInput)
      .sort((left, right) => left.sequence - right.sequence)
      .slice(0, maximumCountInput));
  }

  snapshot(): CommandJournalSnapshotV1 {
    return Object.freeze({
      commandAdmissionClosedSimulationTick:
        this.commandAdmissionClosedSimulationTick,
      retainedIdempotencyRecordCount: this.retainedCommandsById.size,
      retainedReceiptCount: this.retainedReceiptCount,
      retainedEventCount: this.retainedEventsById.size,
      reservedIdempotencyRecordCount: this.reserved.idempotencyRecordCount,
      reservedReceiptCount: this.reserved.receiptCount,
      reservedEventCount: this.reserved.eventCount,
    });
  }
}
