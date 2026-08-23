import {
  deriveGameplayCommandHashV1,
  deriveGameplayCommandReceiptIdV1,
  parseGameplayCommandReceiptV1,
  parseGameplayCommandV1,
  parseGameplayEventV1,
  type GameplayCommandReceiptV1,
  type GameplayCommandV1,
  type GameplayEventV1,
} from "@whitebox-world/gameplay-contracts";
import { describe, expect, it } from "vitest";

import { CommandJournal } from "./command-journal";

function command(id: string): GameplayCommandV1 {
  return parseGameplayCommandV1({
    schemaVersion: 1,
    id,
    type: "control.bind",
    runtimeSessionId: "runtime-1",
    worldSessionId: "world-1",
    controllerEntityId: "controller-1",
    controlledEntityId: "subject-1",
    expectedPossession: { mode: "unbound" },
  });
}

function rejectedReceipt(
  inputCommand: GameplayCommandV1,
  simulationTick: number,
): GameplayCommandReceiptV1 {
  const body = {
    kind: "worldkit-gameplay-command-receipt",
    schemaVersion: 1,
    runtimeSessionId: inputCommand.runtimeSessionId,
    worldSessionId: inputCommand.worldSessionId,
    commandId: inputCommand.id,
    commandHash: deriveGameplayCommandHashV1(inputCommand),
    commandType: inputCommand.type,
    status: "rejected",
    simulationTick,
    eventIds: [],
    diagnostic: {
      code: "GAMEPLAY_RULE_REJECTED",
      message: "The command was rejected by the test rule.",
    },
  } as const;
  return parseGameplayCommandReceiptV1({
    id: deriveGameplayCommandReceiptIdV1(body),
    ...body,
  });
}

function failedReceipt(
  inputCommand: GameplayCommandV1,
  simulationTick: number,
  event: GameplayEventV1,
): GameplayCommandReceiptV1 {
  const body = {
    kind: "worldkit-gameplay-command-receipt",
    schemaVersion: 1,
    runtimeSessionId: inputCommand.runtimeSessionId,
    worldSessionId: inputCommand.worldSessionId,
    commandId: inputCommand.id,
    commandHash: deriveGameplayCommandHashV1(inputCommand),
    commandType: inputCommand.type,
    status: "failed",
    simulationTick,
    eventIds: [event.id],
    diagnostic: {
      code: "WORLD_SESSION_FAILED",
      message: "The test world failed.",
    },
  } as const;
  return parseGameplayCommandReceiptV1({
    id: deriveGameplayCommandReceiptIdV1(body),
    ...body,
  });
}

function worldFailedEvent(sequence: number): GameplayEventV1 {
  return parseGameplayEventV1({
    kind: "worldkit-gameplay-event",
    schemaVersion: 1,
    id: `gameplay-event:world-1:${sequence}`,
    type: "world.failed",
    runtimeSessionId: "runtime-1",
    worldSessionId: "world-1",
    sequence,
    simulationTick: 8,
    diagnostic: {
      code: "WORLD_SESSION_FAILED",
      message: "The test world failed.",
    },
  });
}

describe("CommandJournal", () => {
  it("stages event-only publications invisibly and commits them exactly once", () => {
    const journal = new CommandJournal({
      maximumIdempotencyRecordCount: 1,
      maximumRetainedReceiptCount: 1,
      maximumRetainedEventCount: 2,
    });
    const firstEvent = worldFailedEvent(1);
    const secondEvent = worldFailedEvent(2);
    const result = journal.reserveEventCapacity({ eventCount: 2 });
    if (result.status !== "reserved") throw new Error("Expected Event capacity.");

    const prepared = result.reservation.prepare([firstEvent, secondEvent]);
    expect(journal.getEvent(firstEvent.id)).toBeUndefined();
    expect(journal.eventsAfter(0, 10)).toEqual([]);
    expect(prepared.events).toEqual([firstEvent, secondEvent]);
    expect(prepared.commitPrepared).not.toThrow();
    expect(prepared.commitPrepared()).toBe(prepared.events);
    expect(journal.eventsAfter(0, 10)).toEqual([firstEvent, secondEvent]);
    expect(journal.reserveEventCapacity({ eventCount: 1 })).toEqual({
      status: "event-capacity-exceeded",
    });
    expect(journal.snapshot()).toMatchObject({
      retainedIdempotencyRecordCount: 0,
      retainedReceiptCount: 0,
      retainedEventCount: 2,
      reservedIdempotencyRecordCount: 0,
      reservedReceiptCount: 0,
      reservedEventCount: 0,
    });
  });

  it("shares Event capacity between command and event-only reservations without closing command admission", () => {
    const journal = new CommandJournal({
      maximumIdempotencyRecordCount: 1,
      maximumRetainedReceiptCount: 1,
      maximumRetainedEventCount: 1,
    });
    const eventOnly = journal.reserveEventCapacity({ eventCount: 1 });
    if (eventOnly.status !== "reserved") throw new Error("Expected Event capacity.");

    expect(journal.reserveCapacity({
      simulationTick: 8,
      idempotencyRecordCount: 1,
      receiptCount: 1,
      eventCount: 1,
    })).toEqual({ status: "event-capacity-exceeded" });
    expect(journal.reserveEventCapacity({ eventCount: 1 })).toEqual({
      status: "event-capacity-exceeded",
    });
    expect(journal.snapshot().commandAdmissionClosedSimulationTick).toBeUndefined();

    expect(eventOnly.reservation.release()).toBe("released");
    expect(journal.reserveCapacity({
      simulationTick: 8,
      idempotencyRecordCount: 1,
      receiptCount: 1,
      eventCount: 1,
    }).status).toBe("reserved");
  });

  it("supports a zero-Event no-op reservation without consuming journal capacity", () => {
    const journal = new CommandJournal({
      maximumIdempotencyRecordCount: 0,
      maximumRetainedReceiptCount: 0,
      maximumRetainedEventCount: 0,
    });
    const result = journal.reserveEventCapacity({ eventCount: 0 });
    if (result.status !== "reserved") throw new Error("Expected zero-Event reservation.");

    const prepared = result.reservation.prepare([]);
    expect(prepared.events).toEqual([]);
    expect(prepared.commitPrepared).not.toThrow();
    expect(prepared.commitPrepared()).toBe(prepared.events);
    expect(journal.snapshot()).toEqual({
      commandAdmissionClosedSimulationTick: undefined,
      retainedIdempotencyRecordCount: 0,
      retainedReceiptCount: 0,
      retainedEventCount: 0,
      reservedIdempotencyRecordCount: 0,
      reservedReceiptCount: 0,
      reservedEventCount: 0,
    });
  });

  it("rejects non-exact and unsafe event-only reservation requests", () => {
    const journal = new CommandJournal({
      maximumIdempotencyRecordCount: 0,
      maximumRetainedReceiptCount: 0,
      maximumRetainedEventCount: 1,
    });

    expect(() => journal.reserveEventCapacity({
      eventCount: 0,
      unexpected: true,
    })).toThrow(/exact non-negative integer/);
    expect(() => journal.reserveEventCapacity({ eventCount: -0 })).toThrow(
      /exact non-negative integer/,
    );
    expect(() => journal.reserveEventCapacity({ eventCount: 1.5 })).toThrow(
      /exact non-negative integer/,
    );
  });

  it("rejects non-canonical event-only preparation and releases its reservation", () => {
    const journal = new CommandJournal({
      maximumIdempotencyRecordCount: 1,
      maximumRetainedReceiptCount: 1,
      maximumRetainedEventCount: 2,
    });
    const result = journal.reserveEventCapacity({ eventCount: 2 });
    if (result.status !== "reserved") throw new Error("Expected Event capacity.");

    expect(() => result.reservation.prepare([
      worldFailedEvent(2),
      worldFailedEvent(1),
    ])).toThrow(/canonical sequence order/);
    expect(journal.snapshot().reservedEventCount).toBe(0);
    expect(journal.reserveEventCapacity({ eventCount: 2 }).status).toBe("reserved");
  });

  it("releases prepared Event claims and makes the prepared publication inert", () => {
    const journal = new CommandJournal({
      maximumIdempotencyRecordCount: 1,
      maximumRetainedReceiptCount: 1,
      maximumRetainedEventCount: 1,
    });
    const first = journal.reserveEventCapacity({ eventCount: 1 });
    if (first.status !== "reserved") throw new Error("Expected Event capacity.");
    const event = worldFailedEvent(1);
    const prepared = first.reservation.prepare([event]);

    expect(first.reservation.release()).toBe("released");
    const second = journal.reserveEventCapacity({ eventCount: 1 });
    if (second.status !== "reserved") throw new Error("Expected reclaimed Event capacity.");
    expect(() => second.reservation.prepare([event])).not.toThrow();
    expect(prepared.commitPrepared).not.toThrow();
    expect(journal.getEvent(event.id)).toBeUndefined();
  });

  it("keeps event-only admission available after command admission closes", () => {
    const journal = new CommandJournal({
      maximumIdempotencyRecordCount: 0,
      maximumRetainedReceiptCount: 0,
      maximumRetainedEventCount: 1,
    });
    expect(journal.reserveCapacity({
      simulationTick: 4,
      idempotencyRecordCount: 1,
      receiptCount: 1,
      eventCount: 0,
    })).toMatchObject({ status: "command-admission-closed" });

    const eventOnly = journal.reserveEventCapacity({ eventCount: 1 });
    expect(eventOnly.status).toBe("reserved");
    expect(journal.snapshot().commandAdmissionClosedSimulationTick).toBe(4);
  });

  it("prevents staged command and event-only publications from claiming the same Event identity", () => {
    const journal = new CommandJournal({
      maximumIdempotencyRecordCount: 1,
      maximumRetainedReceiptCount: 1,
      maximumRetainedEventCount: 2,
    });
    const sharedEvent = worldFailedEvent(1);
    const eventOnly = journal.reserveEventCapacity({ eventCount: 1 });
    const commandOnly = journal.reserveCapacity({
      simulationTick: 8,
      idempotencyRecordCount: 1,
      receiptCount: 1,
      eventCount: 1,
    });
    if (eventOnly.status !== "reserved" || commandOnly.status !== "reserved") {
      throw new Error("Expected both reservations.");
    }
    eventOnly.reservation.prepare([sharedEvent]);
    const firstCommand = command("command-shared-event");

    expect(() => commandOnly.reservation.prepare({
      command: firstCommand,
      commandHash: deriveGameplayCommandHashV1(firstCommand),
      receipt: failedReceipt(firstCommand, 8, sharedEvent),
      events: [sharedEvent],
    })).toThrow(/already staged/);
    expect(journal.snapshot().reservedIdempotencyRecordCount).toBe(0);
    expect(journal.snapshot().reservedReceiptCount).toBe(0);
  });

  it("keeps staged Event sequences globally ordered across reservation kinds and commit order", () => {
    const journal = new CommandJournal({
      maximumIdempotencyRecordCount: 1,
      maximumRetainedReceiptCount: 1,
      maximumRetainedEventCount: 2,
    });
    const commandResult = journal.reserveCapacity({
      simulationTick: 8,
      idempotencyRecordCount: 1,
      receiptCount: 1,
      eventCount: 1,
    });
    const eventResult = journal.reserveEventCapacity({ eventCount: 1 });
    if (commandResult.status !== "reserved" || eventResult.status !== "reserved") {
      throw new Error("Expected both reservations.");
    }
    const firstCommand = command("command-sequence-one");
    const firstEvent = worldFailedEvent(1);
    const commandPrepared = commandResult.reservation.prepare({
      command: firstCommand,
      commandHash: deriveGameplayCommandHashV1(firstCommand),
      receipt: failedReceipt(firstCommand, 8, firstEvent),
      events: [firstEvent],
    });
    const secondEvent = worldFailedEvent(2);
    const eventPrepared = eventResult.reservation.prepare([secondEvent]);

    expect(eventPrepared.commitPrepared).not.toThrow();
    expect(commandPrepared.commitPrepared).not.toThrow();
    expect(journal.eventsAfter(0, 10)).toEqual([firstEvent, secondEvent]);
  });

  it("keeps a prepared publication invisible until its no-throw pointer swap", () => {
    const journal = new CommandJournal({
      maximumIdempotencyRecordCount: 1,
      maximumRetainedReceiptCount: 1,
      maximumRetainedEventCount: 0,
    });
    const firstCommand = command("command-staged");
    const commandHash = deriveGameplayCommandHashV1(firstCommand);
    const reservation = journal.reserveCapacity({
      simulationTick: 2,
      idempotencyRecordCount: 1,
      receiptCount: 1,
      eventCount: 0,
    });
    if (reservation.status !== "reserved") throw new Error("Expected capacity.");

    const prepared = reservation.reservation.prepare({
      command: firstCommand,
      commandHash,
      receipt: rejectedReceipt(firstCommand, 2),
      events: [],
    });
    expect(journal.lookup(firstCommand, commandHash)).toEqual({ status: "missing" });
    expect(prepared.commitPrepared).not.toThrow();
    expect(prepared.commitPrepared).not.toThrow();
    expect(journal.lookup(firstCommand, commandHash)).toMatchObject({
      status: "replay",
    });
  });

  it("prepares alternative success and failure bundles but publishes only the winner", () => {
    const journal = new CommandJournal({
      maximumIdempotencyRecordCount: 1,
      maximumRetainedReceiptCount: 1,
      maximumRetainedEventCount: 2,
    });
    const firstCommand = command("command-alternatives");
    const event = worldFailedEvent(1);
    const reservation = journal.reserveCapacity({
      simulationTick: 8,
      idempotencyRecordCount: 1,
      receiptCount: 1,
      eventCount: 2,
    });
    if (reservation.status !== "reserved") throw new Error("Expected capacity.");

    const success = reservation.reservation.prepare({
      command: firstCommand,
      commandHash: deriveGameplayCommandHashV1(firstCommand),
      receipt: rejectedReceipt(firstCommand, 8),
      events: [],
    });
    const failure = reservation.reservation.prepare({
      command: firstCommand,
      commandHash: deriveGameplayCommandHashV1(firstCommand),
      receipt: failedReceipt(firstCommand, 8, event),
      events: [event],
    });

    expect(failure.commitPrepared()).toBe(failure.receipt);
    expect(success.commitPrepared()).toBe(failure.receipt);
    expect(journal.lookup(firstCommand, deriveGameplayCommandHashV1(firstCommand)))
      .toMatchObject({ status: "replay", receipt: failure.receipt });
    expect(journal.getEvent(event.id)).toEqual(event);
  });

  it("replays the exact retained Receipt for the same canonical command", () => {
    const journal = new CommandJournal({
      maximumIdempotencyRecordCount: 2,
      maximumRetainedReceiptCount: 2,
      maximumRetainedEventCount: 2,
    });
    const firstCommand = command("command-1");
    const commandHash = deriveGameplayCommandHashV1(firstCommand);
    const receipt = rejectedReceipt(firstCommand, 7);
    const reservation = journal.reserveCapacity({
      simulationTick: 7,
      idempotencyRecordCount: 1,
      receiptCount: 1,
      eventCount: 0,
    });
    if (reservation.status !== "reserved") {
      throw new Error("Expected command journal capacity.");
    }

    const retained = reservation.reservation.prepare({
      command: firstCommand,
      commandHash,
      receipt,
      events: [],
    }).commitPrepared();

    expect(journal.lookup({ ...firstCommand }, commandHash)).toEqual({
      status: "replay",
      receipt,
    });
    expect(journal.lookup({ ...firstCommand }, commandHash)).toBe(
      journal.lookup(firstCommand, commandHash),
    );
    const replay = journal.lookup(firstCommand, commandHash);
    if (replay.status !== "replay") throw new Error("Expected replay.");
    expect(retained).toBe(replay.receipt);
  });

  it("reports changed-payload reuse as a conflict without consuming capacity", () => {
    const journal = new CommandJournal({
      maximumIdempotencyRecordCount: 2,
      maximumRetainedReceiptCount: 2,
      maximumRetainedEventCount: 2,
    });
    const firstCommand = command("command-1");
    const commandHash = deriveGameplayCommandHashV1(firstCommand);
    const reservation = journal.reserveCapacity({
      simulationTick: 1,
      idempotencyRecordCount: 1,
      receiptCount: 1,
      eventCount: 0,
    });
    if (reservation.status !== "reserved") throw new Error("Expected capacity.");
    reservation.reservation.prepare({
      command: firstCommand,
      commandHash,
      receipt: rejectedReceipt(firstCommand, 1),
      events: [],
    }).commitPrepared();
    const changed = parseGameplayCommandV1({
      ...firstCommand,
      controlledEntityId: "subject-2",
    });

    expect(journal.lookup(changed, deriveGameplayCommandHashV1(changed))).toEqual({
      status: "conflict",
    });
    expect(journal.snapshot()).toEqual({
      commandAdmissionClosedSimulationTick: undefined,
      retainedIdempotencyRecordCount: 1,
      retainedReceiptCount: 1,
      retainedEventCount: 0,
      reservedIdempotencyRecordCount: 0,
      reservedReceiptCount: 0,
      reservedEventCount: 0,
    });
  });

  it("closes new command admission irreversibly at the N plus one Tick while preserving old replay", () => {
    const journal = new CommandJournal({
      maximumIdempotencyRecordCount: 1,
      maximumRetainedReceiptCount: 1,
      maximumRetainedEventCount: 4,
    });
    const firstCommand = command("command-1");
    const firstHash = deriveGameplayCommandHashV1(firstCommand);
    const firstReservation = journal.reserveCapacity({
      simulationTick: 9,
      idempotencyRecordCount: 1,
      receiptCount: 1,
      eventCount: 0,
    });
    if (firstReservation.status !== "reserved") throw new Error("Expected capacity.");
    const firstReceipt = rejectedReceipt(firstCommand, 9);
    firstReservation.reservation.prepare({
      command: firstCommand,
      commandHash: firstHash,
      receipt: firstReceipt,
      events: [],
    }).commitPrepared();

    expect(journal.reserveCapacity({
      simulationTick: 10,
      idempotencyRecordCount: 1,
      receiptCount: 1,
      eventCount: 0,
    })).toEqual({
      status: "command-admission-closed",
      commandAdmissionClosedSimulationTick: 10,
    });
    expect(journal.reserveCapacity({
      simulationTick: 99,
      idempotencyRecordCount: 1,
      receiptCount: 1,
      eventCount: 0,
    })).toEqual({
      status: "command-admission-closed",
      commandAdmissionClosedSimulationTick: 10,
    });
    expect(journal.lookup(firstCommand, firstHash)).toEqual({
      status: "replay",
      receipt: firstReceipt,
    });
  });

  it("releases a reservation without leaking counts or closing admission", () => {
    const journal = new CommandJournal({
      maximumIdempotencyRecordCount: 1,
      maximumRetainedReceiptCount: 1,
      maximumRetainedEventCount: 1,
    });
    const first = journal.reserveCapacity({
      simulationTick: 3,
      idempotencyRecordCount: 1,
      receiptCount: 1,
      eventCount: 1,
    });
    if (first.status !== "reserved") throw new Error("Expected capacity.");

    expect(first.reservation.release()).toBe("released");
    expect(first.reservation.release()).toBe("released");
    expect(journal.reserveCapacity({
      simulationTick: 4,
      idempotencyRecordCount: 1,
      receiptCount: 1,
      eventCount: 1,
    }).status).toBe("reserved");
  });

  it("rejects event over-capacity without closing command admission", () => {
    const journal = new CommandJournal({
      maximumIdempotencyRecordCount: 1,
      maximumRetainedReceiptCount: 1,
      maximumRetainedEventCount: 0,
    });

    expect(journal.reserveCapacity({
      simulationTick: 5,
      idempotencyRecordCount: 1,
      receiptCount: 1,
      eventCount: 1,
    })).toEqual({ status: "event-capacity-exceeded" });
    expect(journal.snapshot().commandAdmissionClosedSimulationTick).toBeUndefined();
    expect(journal.reserveCapacity({
      simulationTick: 5,
      idempotencyRecordCount: 1,
      receiptCount: 1,
      eventCount: 0,
    }).status).toBe("reserved");
  });

  it("retains canonical Events and makes preparation unavailable after commit", () => {
    const journal = new CommandJournal({
      maximumIdempotencyRecordCount: 1,
      maximumRetainedReceiptCount: 1,
      maximumRetainedEventCount: 1,
    });
    const firstCommand = command("command-1");
    const event = worldFailedEvent(1);
    const reservation = journal.reserveCapacity({
      simulationTick: 8,
      idempotencyRecordCount: 1,
      receiptCount: 1,
      eventCount: 1,
    });
    if (reservation.status !== "reserved") throw new Error("Expected capacity.");
    reservation.reservation.prepare({
      command: firstCommand,
      commandHash: deriveGameplayCommandHashV1(firstCommand),
      receipt: failedReceipt(firstCommand, 8, event),
      events: [event],
    }).commitPrepared();

    const retainedEvent = journal.getEvent(event.id);
    expect(retainedEvent).toEqual(event);
    expect(journal.getEvent(event.id)).toBe(retainedEvent);
    expect(() => reservation.reservation.prepare({
      command: firstCommand,
      commandHash: deriveGameplayCommandHashV1(firstCommand),
      receipt: failedReceipt(firstCommand, 8, event),
      events: [event],
    })).toThrow(/no longer available/);
  });

  it("snapshots caller-owned command, Receipt, and Event data before retention", () => {
    const journal = new CommandJournal({
      maximumIdempotencyRecordCount: 1,
      maximumRetainedReceiptCount: 1,
      maximumRetainedEventCount: 1,
    });
    const firstCommand = command("command-1");
    const event = worldFailedEvent(1);
    const mutableReceipt = structuredClone(failedReceipt(firstCommand, 8, event));
    const mutableEvent = structuredClone(event);
    const reservation = journal.reserveCapacity({
      simulationTick: 8,
      idempotencyRecordCount: 1,
      receiptCount: 1,
      eventCount: 1,
    });
    if (reservation.status !== "reserved") throw new Error("Expected capacity.");
    reservation.reservation.prepare({
      command: structuredClone(firstCommand),
      commandHash: deriveGameplayCommandHashV1(firstCommand),
      receipt: mutableReceipt,
      events: [mutableEvent],
    }).commitPrepared();

    (mutableReceipt as unknown as { diagnostic: { message: string } })
      .diagnostic.message = "mutated";
    (mutableEvent as unknown as { diagnostic: { message: string } })
      .diagnostic.message = "mutated";
    expect(journal.lookup(firstCommand, deriveGameplayCommandHashV1(firstCommand)))
      .toMatchObject({
        status: "replay",
        receipt: { diagnostic: { message: "The test world failed." } },
      });
    expect(journal.getEvent(event.id)).toMatchObject({
      diagnostic: { message: "The test world failed." },
    });
  });

  it("rejects a canonical Receipt owned by a different Runtime Session", () => {
    const journal = new CommandJournal({
      maximumIdempotencyRecordCount: 1,
      maximumRetainedReceiptCount: 1,
      maximumRetainedEventCount: 0,
    });
    const firstCommand = command("command-1");
    const validReceipt = rejectedReceipt(firstCommand, 3);
    const body = {
      ...validReceipt,
      runtimeSessionId: "runtime-other",
    };
    const { id: _ignoredId, ...bodyWithoutId } = body;
    const foreignReceipt = parseGameplayCommandReceiptV1({
      id: deriveGameplayCommandReceiptIdV1(bodyWithoutId),
      ...bodyWithoutId,
    });
    const reservation = journal.reserveCapacity({
      simulationTick: 3,
      idempotencyRecordCount: 1,
      receiptCount: 1,
      eventCount: 0,
    });
    if (reservation.status !== "reserved") throw new Error("Expected capacity.");

    expect(() => reservation.reservation.prepare({
      command: firstCommand,
      commandHash: deriveGameplayCommandHashV1(firstCommand),
      receipt: foreignReceipt,
      events: [],
    })).toThrow(/Receipt does not match/);
  });

  it("rejects hostile Event arrays without invoking an index accessor", () => {
    const journal = new CommandJournal({
      maximumIdempotencyRecordCount: 1,
      maximumRetainedReceiptCount: 1,
      maximumRetainedEventCount: 1,
    });
    const firstCommand = command("command-1");
    const event = worldFailedEvent(1);
    let reads = 0;
    const hostileEvents = [event];
    Object.defineProperty(hostileEvents, "0", {
      enumerable: true,
      get: () => {
        reads += 1;
        return event;
      },
    });
    const reservation = journal.reserveCapacity({
      simulationTick: 8,
      idempotencyRecordCount: 1,
      receiptCount: 1,
      eventCount: 1,
    });
    if (reservation.status !== "reserved") throw new Error("Expected capacity.");

    expect(() => reservation.reservation.prepare({
      command: firstCommand,
      commandHash: deriveGameplayCommandHashV1(firstCommand),
      receipt: failedReceipt(firstCommand, 8, event),
      events: hostileEvents,
    })).toThrow(/commit bundle is invalid/);
    expect(reads).toBe(0);
  });

  it("queries retained Events in canonical sequence order after an exclusive cursor", () => {
    const journal = new CommandJournal({
      maximumIdempotencyRecordCount: 2,
      maximumRetainedReceiptCount: 2,
      maximumRetainedEventCount: 2,
    });
    const firstCommand = command("command-event-1");
    const secondCommand = command("command-event-2");
    for (const [inputCommand, event] of [
      [firstCommand, worldFailedEvent(1)],
      [secondCommand, worldFailedEvent(2)],
    ] as const) {
      const reservation = journal.reserveCapacity({
        simulationTick: 8,
        idempotencyRecordCount: 1,
        receiptCount: 1,
        eventCount: 1,
      });
      if (reservation.status !== "reserved") throw new Error("Expected capacity.");
      reservation.reservation.prepare({
        command: inputCommand,
        commandHash: deriveGameplayCommandHashV1(inputCommand),
        receipt: failedReceipt(inputCommand, 8, event),
        events: [event],
      }).commitPrepared();
    }

    expect(journal.eventsAfter(0, 1).map((event) => event.sequence)).toEqual([1]);
    expect(journal.eventsAfter(1, 10).map((event) => event.sequence)).toEqual([2]);
    expect(journal.eventsAfter(2, 10)).toEqual([]);
    expect(journal.eventsAfter(0, 0)).toEqual([]);
    expect(() => journal.eventsAfter(-1, 1)).toThrow(/safe non-negative/);
    expect(() => journal.eventsAfter(0, Number.MAX_SAFE_INTEGER + 1)).toThrow(
      /safe non-negative/,
    );
  });
});
