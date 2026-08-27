import {
  chmodSync,
  closeSync,
  constants,
  existsSync,
  fsyncSync,
  lstatSync,
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

const JOURNAL_DIRECTORY_MODE = 0o700;
const JOURNAL_FILE_MODE = 0o600;

function journalPathFail(message: string): never {
  throw new Error(`WORLD_CHANGE_JOURNAL_PATH_UNSAFE: ${message}`);
}

function assertOwnerOnlyDirectory(directoryPath: string): void {
  if (!existsSync(directoryPath)) {
    mkdirSync(directoryPath, {
      recursive: true,
      mode: JOURNAL_DIRECTORY_MODE,
    });
    chmodSync(directoryPath, JOURNAL_DIRECTORY_MODE);
  }
  const snapshot = lstatSync(directoryPath);
  if (
    snapshot.isSymbolicLink() ||
    !snapshot.isDirectory() ||
    (snapshot.mode & 0o777) !== JOURNAL_DIRECTORY_MODE
  ) {
    journalPathFail("WAL parent must be a canonical owner-only 0700 directory.");
  }
}

function assertSafeWalFile(walFilePath: string): void {
  if (!existsSync(walFilePath)) return;
  const snapshot = lstatSync(walFilePath);
  if (
    snapshot.isSymbolicLink() ||
    !snapshot.isFile() ||
    (snapshot.mode & 0o777) !== JOURNAL_FILE_MODE
  ) {
    journalPathFail("WAL must be one canonical owner-only 0600 regular file.");
  }
}

class FileWorldChangeJournalWalV1 implements WorldChangeJournalWalV1 {
  public readonly brand = "WorldChangeJournalWalV1" as const;

  constructor(private readonly walFilePath: string) {}

  readTransactions(): readonly WorldChangeJournalTransactionV1[] {
    assertOwnerOnlyDirectory(path.dirname(this.walFilePath));
    assertSafeWalFile(this.walFilePath);
    if (!existsSync(this.walFilePath)) return [];
    const bytes = readFileSync(this.walFilePath);
    if (bytes.byteLength === 0) return [];
    const lastNewlineIndex = bytes.lastIndexOf(0x0a);
    if (lastNewlineIndex < bytes.byteLength - 1) {
      truncateSync(this.walFilePath, lastNewlineIndex + 1);
      const descriptor = openSync(
        this.walFilePath,
        constants.O_RDWR | constants.O_NOFOLLOW,
      );
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
    assertOwnerOnlyDirectory(directory);
    assertSafeWalFile(this.walFilePath);
    const didExist = existsSync(this.walFilePath);
    const descriptor = openSync(
      this.walFilePath,
      constants.O_APPEND |
        constants.O_CREAT |
        constants.O_WRONLY |
        constants.O_NOFOLLOW,
      JOURNAL_FILE_MODE,
    );
    try {
      chmodSync(this.walFilePath, JOURNAL_FILE_MODE);
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
  if (
    isEmpty(input.walFilePath) ||
    !path.isAbsolute(input.walFilePath) ||
    path.normalize(input.walFilePath) !== input.walFilePath
  ) {
    throw new TypeError("File-backed WorldChange journal requires an absolute walFilePath.");
  }
  assertOwnerOnlyDirectory(path.dirname(input.walFilePath));
  assertSafeWalFile(input.walFilePath);
  return createWorldChangeJournalV1({
    wal: new FileWorldChangeJournalWalV1(path.normalize(input.walFilePath)),
  });
}
