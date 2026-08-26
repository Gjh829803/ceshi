import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  truncateSync,
  writeSync,
} from "node:fs";
import path from "node:path";

import {
  createWorldChangeJournalV1,
  validateWorldChangeJournalTransactionsV1,
  type WorldChangeJournalTransactionV1,
  type WorldChangeJournalV1,
  type WorldChangeJournalWalV1,
} from "@whitebox-world/authoring-host";
import { stringifyCanonicalJson } from "@whitebox-world/protocol";
import { isEmpty, isNil } from "lodash-es";

class FileWorldChangeJournalWalV1 implements WorldChangeJournalWalV1 {
  public readonly brand = "WorldChangeJournalWalV1" as const;

  constructor(private readonly walFilePath: string) {}

  readTransactions(): readonly WorldChangeJournalTransactionV1[] {
    if (!existsSync(this.walFilePath)) return [];
    const bytes = readFileSync(this.walFilePath);
    if (bytes.byteLength === 0) return [];
    const lastNewlineIndex = bytes.lastIndexOf(0x0a);
    if (lastNewlineIndex < bytes.byteLength - 1) {
      truncateSync(this.walFilePath, lastNewlineIndex + 1);
      const descriptor = openSync(this.walFilePath, "r+");
      try {
        fsyncSync(descriptor);
      } finally {
        closeSync(descriptor);
      }
    }
    if (lastNewlineIndex < 0) return [];
    const completeText = bytes.subarray(0, lastNewlineIndex + 1).toString("utf8");
    const rows = completeText.split("\n").slice(0, -1);
    return rows.map((row, index) => {
      if (isEmpty(row)) {
        throw new Error(
          `WORLD_CHANGE_JOURNAL_WAL_CORRUPT: Empty transaction row ${index + 1}.`,
        );
      }
      try {
        const parsed = JSON.parse(row) as WorldChangeJournalTransactionV1;
        if (stringifyCanonicalJson(parsed) !== row) {
          throw new Error("Transaction row is not Canonical JSON.");
        }
        return parsed;
      } catch (error) {
        throw new Error(
          `WORLD_CHANGE_JOURNAL_WAL_CORRUPT: Transaction row ${index + 1} is not Canonical JSON.`,
          { cause: error },
        );
      }
    });
  }

  appendTransaction(transaction: WorldChangeJournalTransactionV1): void {
    const current = this.readTransactions();
    validateWorldChangeJournalTransactionsV1(current);
    const previous = current.at(-1);
    if (
      (!isNil(previous) && (
        transaction.sequence !== previous.sequence + 1 ||
        transaction.previousTransactionHash !== previous.transactionHash
      )) ||
      (isNil(previous) && transaction.sequence !== 1)
    ) {
      throw new Error(
        "WORLD_CHANGE_JOURNAL_WAL_CONFLICT: File WAL changed outside the current Host owner.",
      );
    }

    const directory = path.dirname(this.walFilePath);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const didExist = existsSync(this.walFilePath);
    const descriptor = openSync(this.walFilePath, "a", 0o600);
    try {
      writeSync(descriptor, `${stringifyCanonicalJson(transaction)}\n`, undefined, "utf8");
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    if (!didExist) {
      const directoryDescriptor = openSync(directory, "r");
      try {
        fsyncSync(directoryDescriptor);
      } finally {
        closeSync(directoryDescriptor);
      }
    }
  }
}

export function createFileBackedWorldChangeJournalV1(input: {
  readonly walFilePath: string;
}): WorldChangeJournalV1 {
  if (isEmpty(input.walFilePath) || !path.isAbsolute(input.walFilePath)) {
    throw new TypeError("File-backed WorldChange journal requires an absolute walFilePath.");
  }
  return createWorldChangeJournalV1({
    wal: new FileWorldChangeJournalWalV1(path.normalize(input.walFilePath)),
  });
}
