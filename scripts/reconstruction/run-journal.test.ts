import { appendFile, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { isEmpty, isNil } from "lodash-es";
import type { Sha256HashV1 } from "@whitebox-world/protocol";

import {
  WORLD_RECONSTRUCTION_JOURNAL_STATES_V1,
  createWorldReconstructionRunJournalV1,
  type WorldReconstructionJournalStateV1,
} from "./run-journal.js";

const H = (character: string): Sha256HashV1 =>
  `sha256:${character.repeat(64)}` as Sha256HashV1;

const OWNER = Object.freeze({
  caseHash: H("1"),
  evaluationProfileHash: H("2"),
  gameplayBootstrapHash: H("3"),
  worldRuntimeBootstrapHash: H("4"),
  worldBoundsHash: H("5"),
  bootstrapInputHash: H("6"),
});

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directoryPath) =>
    rm(directoryPath, { recursive: true, force: true })));
});

async function journalRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "nbr60-journal-"));
  temporaryDirectories.push(root);
  return root;
}

async function openJournal(root: string) {
  return createWorldReconstructionRunJournalV1({
    runId: "formal-20260831",
    caseRef: "artifact://world-reconstruction-case/cloud-temple-t-gate-native-block/case.json",
    evaluationProfileRef: "artifact://case/cloud-temple/evaluation-profile.json",
    frozenOwnerIdentities: OWNER,
    outputDirectoryPath: root,
  });
}

const REPAIR_PATH: readonly WorldReconstructionJournalStateV1[] = [
  "created",
  "initial-generating",
  "initial-packaged",
  "initial-captured",
  "initial-evaluated",
  "repair-generating",
  "repair-packaged",
  "repair-captured",
  "repair-evaluated",
  "cleanup-joined",
  "completed",
];

describe("world reconstruction run journal", () => {
  it("records an initial and repair state machine around every external boundary", async () => {
    const journal = await openJournal(await journalRoot());
    expect(journal.currentState()).toBe("created");
    expect(journal.states()).toEqual(["created"]);
    expect(WORLD_RECONSTRUCTION_JOURNAL_STATES_V1).toEqual(expect.arrayContaining([
      "created",
      "initial-generating",
      "cleanup-joined",
      "completed",
    ]));

    for (const state of REPAIR_PATH.slice(1)) {
      const attemptIndex = state.startsWith("initial-")
        ? 0 as const
        : state.startsWith("repair-")
          ? 1 as const
          : undefined;
      await journal.recordBoundary({
        state,
        boundary: "before",
        operation: state,
        ...(attemptIndex === undefined ? {} : { attemptIndex }),
      });
      await journal.recordBoundary({
        state,
        boundary: "after",
        operation: state,
        ...(attemptIndex === undefined ? {} : { attemptIndex }),
        ...(state === "cleanup-joined"
          ? {
              cleanupOutcomes: {
                providerTask: "completed",
                candidate: "completed",
                hostedBrowserSession: "completed",
                viteServer: "completed",
                temporaryDirectories: "completed",
                outputPromotion: "completed",
              },
            }
          : {}),
      });
    }

    expect(journal.states()).toEqual(REPAIR_PATH);
    expect(journal.currentState()).toBe("completed");
    expect(journal.canPublishTerminalReceipt()).toBe(true);
    const persisted = await readFile(
      path.join(journal.outputDirectoryPath, "journal.jsonl"),
      "utf8",
    );
    expect(isEmpty(persisted.trim())).toBe(false);
    expect(persisted.split("\n").filter((line) => !isEmpty(line)).length)
      .toBe(journal.rows().length);
    expect(journal.rows().every((row) => Object.isFrozen(row))).toBe(true);
    const created = journal.rows()[0];
    if (isNil(created)) throw new Error("created row");
    expect(created.frozenOwnerIdentities).toEqual(OWNER);
  });

  it("never mutates prior rows and rejects illegal transitions", async () => {
    const journal = await openJournal(await journalRoot());
    const first = journal.rows()[0];
    if (isNil(first)) throw new Error("created row");
    expect(() => {
      (first as { state: string }).state = "completed";
    }).toThrow();
    await expect(journal.recordBoundary({
      state: "repair-generating",
      boundary: "before",
      operation: "repair-generating",
      attemptIndex: 1,
    })).rejects.toThrowError("WORLD_RECONSTRUCTION_JOURNAL_TRANSITION_INVALID");
    await journal.recordBoundary({
      state: "initial-generating",
      boundary: "before",
      operation: "initial-generating",
      attemptIndex: 0,
    });
    const before = journal.rows()[1];
    await journal.recordBoundary({
      state: "initial-generating",
      boundary: "after",
      operation: "initial-generating",
      attemptIndex: 0,
    });
    expect(journal.rows()[1]).toBe(before);
    expect(journal.rows()[0]).toBe(first);
  });

  it("keeps an exact one-to-one request ID and hash binding", async () => {
    const journal = await openJournal(await journalRoot());
    expect(journal.attachOrRejectRequest("req-a", H("a"))).toBe("accepted");
    expect(journal.attachOrRejectRequest("req-a", H("a"))).toBe("attached");
    expect(() => journal.attachOrRejectRequest("req-a", H("b"))).toThrowError(
      "WORLD_RECONSTRUCTION_DUPLICATE_REQUEST_MISMATCH",
    );
    expect(() => journal.attachOrRejectRequest("req-b", H("a"))).toThrowError(
      "WORLD_RECONSTRUCTION_DUPLICATE_REQUEST_MISMATCH",
    );
    const recorded = journal.recordedRequest("req-a");
    expect(isNil(recorded)).toBe(false);
    expect(recorded?.requestHash).toBe(H("a"));
  });

  it("rehydrates state, request identity, and sequence without appending a second created row", async () => {
    const root = await journalRoot();
    const journal = await openJournal(root);
    await journal.recordBoundary({
      state: "initial-generating",
      boundary: "before",
      operation: "initial-generating",
      attemptIndex: 0,
      requestId: "req-a",
    });
    journal.attachOrRejectRequest("req-a", H("a"));
    await journal.recordBoundary({
      state: "initial-generating",
      boundary: "after",
      operation: "initial-generating",
      attemptIndex: 0,
      requestId: "req-a",
      requestHash: H("a"),
    });
    const reopened = await openJournal(root);
    expect(reopened.states()).toEqual(["created", "initial-generating"]);
    expect(reopened.rows().map(({ sequence }) => sequence)).toEqual([0, 1, 2]);
    expect(reopened.recordedRequest("req-a")).toEqual({
      requestId: "req-a",
      requestHash: H("a"),
      outcome: "completed",
    });
    expect(() => reopened.beginAttempt(0)).toThrowError(
      "WORLD_RECONSTRUCTION_JOURNAL_TRANSITION_INVALID",
    );
  });

  it("truncates only a torn final JSONL tail and rejects complete non-canonical rows", async () => {
    const root = await journalRoot();
    const journal = await openJournal(root);
    const journalPath = path.join(root, "journal.jsonl");
    const complete = await readFile(journalPath);
    await appendFile(journalPath, '{"kind":"world-reconstruction');
    const reopened = await openJournal(root);
    expect(reopened.rows()).toHaveLength(1);
    expect(await readFile(journalPath)).toEqual(complete);

    const parsed = JSON.parse(complete.toString("utf8").trim());
    await writeFile(journalPath, `${JSON.stringify(parsed, null, 2)}\n`);
    await expect(openJournal(root)).rejects.toThrowError(
      "WORLD_RECONSTRUCTION_JOURNAL_CORRUPT",
    );
  });

  it("rejects symlink journals and owner or run identity drift on reopen", async () => {
    const symlinkRoot = await journalRoot();
    const target = path.join(await journalRoot(), "target.jsonl");
    await writeFile(target, "");
    await symlink(target, path.join(symlinkRoot, "journal.jsonl"));
    await expect(openJournal(symlinkRoot)).rejects.toThrow();

    const root = await journalRoot();
    await openJournal(root);
    await expect(createWorldReconstructionRunJournalV1({
      runId: "different-run",
      caseRef: "artifact://world-reconstruction-case/cloud-temple-t-gate-native-block/case.json",
      evaluationProfileRef: "artifact://case/cloud-temple/evaluation-profile.json",
      frozenOwnerIdentities: OWNER,
      outputDirectoryPath: root,
    })).rejects.toThrowError("WORLD_RECONSTRUCTION_JOURNAL_IDENTITY_MISMATCH");
    await expect(createWorldReconstructionRunJournalV1({
      runId: "formal-20260831",
      caseRef: "artifact://world-reconstruction-case/cloud-temple-t-gate-native-block/case.json",
      evaluationProfileRef: "artifact://case/cloud-temple/evaluation-profile.json",
      frozenOwnerIdentities: { ...OWNER, caseHash: H("9") },
      outputDirectoryPath: root,
    })).rejects.toThrowError("WORLD_RECONSTRUCTION_JOURNAL_IDENTITY_MISMATCH");
  });

  it("publishes a terminal receipt only after every cleanup owner is joined", async () => {
    const journal = await openJournal(await journalRoot());
    expect(journal.canPublishTerminalReceipt()).toBe(false);
    await journal.recordBoundary({
      state: "initial-generating",
      boundary: "before",
      operation: "initial-generating",
      attemptIndex: 0,
    });
    await journal.recordBoundary({
      state: "initial-generating",
      boundary: "after",
      operation: "initial-generating",
      attemptIndex: 0,
    });
    expect(journal.canPublishTerminalReceipt()).toBe(false);
    journal.recordCleanup({
      providerTask: "completed",
      candidate: "pending",
      hostedBrowserSession: "completed",
      viteServer: "completed",
      temporaryDirectories: "completed",
      outputPromotion: "completed",
    });
    expect(journal.canPublishTerminalReceipt()).toBe(false);
    journal.recordCleanup({
      providerTask: "completed",
      candidate: "completed",
      hostedBrowserSession: "completed",
      viteServer: "completed",
      temporaryDirectories: "completed",
      outputPromotion: "completed",
    });
    expect(journal.canPublishTerminalReceipt()).toBe(true);
    expect(journal.cleanupOutcome()).toBe("completed");
    journal.recordCleanup({
      providerTask: "failed",
      candidate: "completed",
      hostedBrowserSession: "completed",
      viteServer: "completed",
      temporaryDirectories: "completed",
      outputPromotion: "completed",
    });
    expect(journal.canPublishTerminalReceipt()).toBe(true);
    expect(journal.cleanupOutcome()).toBe("failed");
  });

  it("allows three repair attempts, rejects a fifth attempt, and checks stale owners", async () => {
    const journal = await openJournal(await journalRoot());
    expect(() => journal.beginAttempt(1)).toThrowError(
      "WORLD_RECONSTRUCTION_JOURNAL_TRANSITION_INVALID",
    );
    journal.beginAttempt(0);
    expect(() => journal.beginAttempt(2)).toThrowError(
      "WORLD_RECONSTRUCTION_JOURNAL_TRANSITION_INVALID",
    );
    journal.beginAttempt(1);
    journal.beginAttempt(2);
    journal.beginAttempt(3);
    expect(() => journal.beginAttempt(4 as never)).toThrowError(
      "WORLD_RECONSTRUCTION_MAX_REPAIR_EXCEEDED",
    );
    expect(() => journal.assertOwnerIdentities({
      ...OWNER,
      caseHash: H("9"),
    })).toThrowError("WORLD_RECONSTRUCTION_STALE_CASE");
    expect(() => journal.assertOwnerIdentities({
      ...OWNER,
      evaluationProfileHash: H("9"),
    })).toThrowError("WORLD_RECONSTRUCTION_STALE_PROFILE");
    expect(() => journal.assertOwnerIdentities({
      ...OWNER,
      gameplayBootstrapHash: H("9"),
    })).toThrowError("WORLD_RECONSTRUCTION_STALE_GAMEPLAY_BOOTSTRAP");
    expect(() => journal.assertOwnerIdentities({
      ...OWNER,
      worldRuntimeBootstrapHash: H("9"),
    })).toThrowError("WORLD_RECONSTRUCTION_STALE_WORLD_RUNTIME_BOOTSTRAP");
    expect(() => journal.assertOwnerIdentities({
      ...OWNER,
      worldBoundsHash: H("9"),
    })).toThrowError("WORLD_RECONSTRUCTION_STALE_WORLD_BOUNDS");
    expect(() => journal.assertOwnerIdentities({
      ...OWNER,
      bootstrapInputHash: H("9"),
    })).toThrowError("WORLD_RECONSTRUCTION_STALE_BOOTSTRAP");
    journal.assertOwnerIdentities(OWNER);
  });
});
