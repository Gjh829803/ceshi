import type { Sha256HashV1 } from "@whitebox-world/protocol";

import {
  closeSync,
  constants,
  existsSync,
  fchmodSync,
  fstatSync,
  fsyncSync,
  ftruncateSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";

import {
  deriveRuntimeSessionEventIdV1,
  deriveRuntimeSessionReceiptIdV1,
  hashRuntimeSessionRequestV1,
  parseRuntimeSessionEventV1,
  parseRuntimeSessionReceiptV1,
  parseRuntimeSessionRequestV1,
  type RuntimeSessionEventV1,
  type RuntimeSessionReceiptV1,
  type RuntimeSessionRequestV1,
} from "@whitebox-world/runtime-contracts";
import {
  sha256CanonicalJson,
  stringifyCanonicalJson,
} from "@whitebox-world/protocol";
import { isEmpty, isNil } from "lodash-es";

interface RuntimeSessionWalTransactionBaseV1 {
  readonly kind: "worldkit-runtime-session-wal-transaction";
  readonly schemaVersion: 1;
  readonly sequence: number;
  readonly previousTransactionHash: Sha256HashV1;
  readonly transactionHash: Sha256HashV1;
}

type RuntimeSessionReadyEventV1 = Extract<
  RuntimeSessionEventV1,
  { type: "ready" }
>;

type RuntimeSessionFinalEventV1 = Extract<
  RuntimeSessionEventV1,
  { type: "completed" | "failed" }
>;

type RuntimeSessionWalTransactionV1 =
  | (RuntimeSessionWalTransactionBaseV1 & Readonly<{
      type: "session-opened";
      readyEvent: RuntimeSessionReadyEventV1;
    }>)
  | (RuntimeSessionWalTransactionBaseV1 & Readonly<{
      type: "request-committed";
      request: RuntimeSessionRequestV1;
      requestHash: Sha256HashV1;
      receipt: RuntimeSessionReceiptV1;
    }>)
  | (RuntimeSessionWalTransactionBaseV1 & Readonly<{
      type: "session-closed";
      finalEvent: RuntimeSessionFinalEventV1;
    }>);

export interface RuntimeSessionWalCommittedRequestV1 {
  readonly request: RuntimeSessionRequestV1;
  readonly requestHash: Sha256HashV1;
  readonly receipt: RuntimeSessionReceiptV1;
}

export interface RuntimeSessionWalSnapshotV1 {
  readonly readyEvent: RuntimeSessionReadyEventV1;
  readonly committedRequests: readonly RuntimeSessionWalCommittedRequestV1[];
  readonly finalEvent?: RuntimeSessionFinalEventV1;
}

export type RuntimeSessionWalRequestLookupV1 =
  | Readonly<{ readonly status: "missing" }>
  | Readonly<{ readonly status: "conflict" }>
  | Readonly<{
      readonly status: "replay";
      readonly receipt: RuntimeSessionReceiptV1;
    }>;

export interface FileRuntimeSessionWalV1 {
  readonly brand: "FileRuntimeSessionWalV1";
  snapshot(): RuntimeSessionWalSnapshotV1;
  lookupRequest(request: unknown): RuntimeSessionWalRequestLookupV1;
  appendCommittedRequest(input: {
    readonly request: unknown;
    readonly receipt: unknown;
  }): void;
  appendClosed(finalEvent: unknown): void;
}

const GENESIS_TRANSACTION_HASH = sha256CanonicalJson(
  "worldkit-runtime-session-wal-genesis-v1",
) as Sha256HashV1;
const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;
const OWNER_DIRECTORY_MODE = 0o700;
const OWNER_FILE_MODE = 0o600;
const FILE_OPEN_NO_FOLLOW = constants.O_NOFOLLOW ?? 0;

interface RuntimeSessionWalOwnerLockV1 {
  readonly kind: "worldkit-runtime-session-wal-owner-lock";
  readonly schemaVersion: 1;
  readonly processId: number;
  readonly nonce: string;
}

function corrupt(message: string, cause?: unknown): never {
  throw new Error(`RUNTIME_SESSION_WAL_CORRUPT: ${message}`, {
    ...(isNil(cause) ? {} : { cause }),
  });
}

function isSafePositiveInteger(value: unknown): value is number {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0 &&
    !Object.is(value, -0);
}

function isSha256(value: unknown): value is Sha256HashV1 {
  return typeof value === "string" && SHA256_PATTERN.test(value) &&
    value !== `sha256:${"0".repeat(64)}`;
}

function receiptPayloadBindsRequestV1(
  request: RuntimeSessionRequestV1,
  receipt: RuntimeSessionReceiptV1,
): boolean {
  if (receipt.status === "rejected") return true;
  if (
    request.type === "session.reset" &&
    receipt.requestType === "session.reset"
  ) return receipt.snapshot.world.simulationTick === 0;
  if (
    request.type === "subject-support.get" &&
    receipt.requestType === "subject-support.get"
  ) {
    return receipt.subjectSupport.subjectEntityId === request.subjectEntityId &&
      receipt.subjectSupport.simulationTick === request.expectedSimulationTick;
  }
  return true;
}

function snapshotDataRecord(
  value: unknown,
): Record<string, unknown> | undefined {
  if (typeof value !== "object" || isNil(value)) return undefined;
  try {
    const prototype = Reflect.getPrototypeOf(value);
    if (!isNil(prototype) && prototype !== Object.prototype) return undefined;
    const snapshot = Object.create(null) as Record<string, unknown>;
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
      if (
        typeof key !== "string" ||
        isNil(descriptor) ||
        !descriptor.enumerable ||
        !("value" in descriptor)
      ) return undefined;
      snapshot[key] = descriptor.value;
    }
    return snapshot;
  } catch {
    return undefined;
  }
}

function hasExactKeys(
  record: Readonly<Record<string, unknown>>,
  expected: readonly string[],
): boolean {
  const actual = Reflect.ownKeys(record);
  return actual.length === expected.length && actual.every(
    (key) => typeof key === "string" && expected.includes(key),
  );
}

function requireAbsoluteWalFilePath(value: unknown): string {
  if (
    typeof value !== "string" ||
    isEmpty(value) ||
    !path.isAbsolute(value)
  ) {
    throw new TypeError(
      "File Runtime Session WAL requires an absolute walFilePath.",
    );
  }
  return path.normalize(value);
}

function assertPrivateDirectory(directoryPath: string): void {
  let status;
  try {
    status = lstatSync(directoryPath);
  } catch (error) {
    throw new Error("RUNTIME_SESSION_WAL_PATH_INVALID: Session directory is unavailable.", {
      cause: error,
    });
  }
  if (status.isSymbolicLink() || !status.isDirectory()) {
    throw new Error(
      "RUNTIME_SESSION_WAL_PATH_INVALID: Session directory must be a real directory.",
    );
  }
  if ((status.mode & 0o077) !== 0) {
    throw new Error(
      "RUNTIME_SESSION_WAL_PERMISSION_INVALID: Session directory must be owner-private.",
    );
  }
}

function ensurePrivateDirectoryForCreate(directoryPath: string): void {
  mkdirSync(directoryPath, { recursive: true, mode: OWNER_DIRECTORY_MODE });
  assertPrivateDirectory(directoryPath);
}

function assertPrivateRegularWalFile(walFilePath: string): void {
  let status;
  try {
    status = lstatSync(walFilePath);
  } catch (error) {
    throw new Error("RUNTIME_SESSION_WAL_PATH_INVALID: WAL file is unavailable.", {
      cause: error,
    });
  }
  if (status.isSymbolicLink() || !status.isFile()) {
    throw new Error(
      "RUNTIME_SESSION_WAL_PATH_INVALID: WAL must be a real regular file.",
    );
  }
  if ((status.mode & 0o077) !== 0 || (status.mode & 0o600) !== 0o600) {
    throw new Error(
      "RUNTIME_SESSION_WAL_PERMISSION_INVALID: WAL must be owner-readable and owner-writable only.",
    );
  }
}

function syncDirectory(directoryPath: string): void {
  const descriptor = openSync(directoryPath, constants.O_RDONLY);
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function writeAll(descriptor: number, text: string): void {
  const bytes = Buffer.from(text, "utf8");
  let offset = 0;
  while (offset < bytes.byteLength) {
    const written = writeSync(
      descriptor,
      bytes,
      offset,
      bytes.byteLength - offset,
    );
    if (written <= 0) {
      throw new Error("RUNTIME_SESSION_WAL_WRITE_FAILED: WAL write made no progress.");
    }
    offset += written;
  }
}

function ownerLockFilePath(walFilePath: string): string {
  return `${walFilePath}.lock`;
}

function parseOwnerLock(value: unknown): RuntimeSessionWalOwnerLockV1 {
  const record = snapshotDataRecord(value);
  if (
    isNil(record) ||
    !hasExactKeys(record, ["kind", "schemaVersion", "processId", "nonce"]) ||
    record.kind !== "worldkit-runtime-session-wal-owner-lock" ||
    record.schemaVersion !== 1 ||
    !isSafePositiveInteger(record.processId) ||
    typeof record.nonce !== "string" ||
    isEmpty(record.nonce)
  ) {
    throw new Error(
      "RUNTIME_SESSION_WAL_LOCK_CORRUPT: Owner lock is not one closed V1 record.",
    );
  }
  return Object.freeze({
    kind: "worldkit-runtime-session-wal-owner-lock",
    schemaVersion: 1,
    processId: record.processId,
    nonce: record.nonce,
  });
}

function readOwnerLock(lockFilePath: string): RuntimeSessionWalOwnerLockV1 {
  let status;
  try {
    status = lstatSync(lockFilePath);
  } catch (error) {
    throw new Error(
      "RUNTIME_SESSION_WAL_LOCK_CORRUPT: Owner lock is unavailable.",
      { cause: error },
    );
  }
  if (
    status.isSymbolicLink() ||
    !status.isFile() ||
    (status.mode & 0o077) !== 0 ||
    (status.mode & 0o600) !== 0o600
  ) {
    throw new Error(
      "RUNTIME_SESSION_WAL_LOCK_CORRUPT: Owner lock path or permissions are invalid.",
    );
  }
  const descriptor = openSync(
    lockFilePath,
    constants.O_RDONLY | FILE_OPEN_NO_FOLLOW,
  );
  try {
    const text = readFileSync(descriptor, "utf8");
    const row = text.endsWith("\n") ? text.slice(0, -1) : "";
    if (isEmpty(row) || row.includes("\n")) {
      throw new Error("owner lock must contain exactly one complete row");
    }
    const value = JSON.parse(row) as unknown;
    if (stringifyCanonicalJson(value) !== row) {
      throw new Error("owner lock is not Canonical JSON");
    }
    return parseOwnerLock(value);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith("RUNTIME_SESSION_WAL_LOCK_CORRUPT")
    ) throw error;
    throw new Error(
      "RUNTIME_SESSION_WAL_LOCK_CORRUPT: Owner lock bytes are invalid.",
      { cause: error },
    );
  } finally {
    closeSync(descriptor);
  }
}

function isProcessAlive(processId: number): boolean {
  try {
    process.kill(processId, 0);
    return true;
  } catch (error) {
    return !(
      typeof error === "object" &&
      !isNil(error) &&
      "code" in error &&
      error.code === "ESRCH"
    );
  }
}

function createOwnerLock(
  lockFilePath: string,
): RuntimeSessionWalOwnerLockV1 | undefined {
  const lock = Object.freeze({
    kind: "worldkit-runtime-session-wal-owner-lock" as const,
    schemaVersion: 1 as const,
    processId: process.pid,
    nonce: randomUUID(),
  });
  let descriptor: number;
  try {
    descriptor = openSync(
      lockFilePath,
      constants.O_CREAT |
        constants.O_EXCL |
        constants.O_WRONLY |
        FILE_OPEN_NO_FOLLOW,
      OWNER_FILE_MODE,
    );
  } catch (error) {
    if (
      typeof error === "object" &&
      !isNil(error) &&
      "code" in error &&
      error.code === "EEXIST"
    ) return undefined;
    throw error;
  }
  try {
    fchmodSync(descriptor, OWNER_FILE_MODE);
    writeAll(descriptor, `${stringifyCanonicalJson(lock)}\n`);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  return lock;
}

function acquireOwnerLock(walFilePath: string): RuntimeSessionWalOwnerLockV1 {
  const lockFilePath = ownerLockFilePath(walFilePath);
  const created = createOwnerLock(lockFilePath);
  if (!isNil(created)) return created;
  const existing = readOwnerLock(lockFilePath);
  if (isProcessAlive(existing.processId)) {
    throw new Error(
      "RUNTIME_SESSION_WAL_BUSY: Another live process owns this WAL.",
    );
  }
  unlinkSync(lockFilePath);
  syncDirectory(path.dirname(lockFilePath));
  const recovered = createOwnerLock(lockFilePath);
  if (isNil(recovered)) {
    throw new Error(
      "RUNTIME_SESSION_WAL_BUSY: Another process acquired the recovered WAL lock.",
    );
  }
  return recovered;
}

function releaseOwnerLock(
  walFilePath: string,
  lock: RuntimeSessionWalOwnerLockV1,
): void {
  const lockFilePath = ownerLockFilePath(walFilePath);
  const current = readOwnerLock(lockFilePath);
  if (
    current.processId !== lock.processId ||
    current.nonce !== lock.nonce
  ) {
    throw new Error(
      "RUNTIME_SESSION_WAL_OWNER_CONFLICT: Owner lock changed during the operation.",
    );
  }
  unlinkSync(lockFilePath);
}

function withOwnerLock<T>(walFilePath: string, operation: () => T): T {
  const lock = acquireOwnerLock(walFilePath);
  try {
    return operation();
  } finally {
    releaseOwnerLock(walFilePath, lock);
  }
}

function readWalBytes(walFilePath: string): Buffer {
  assertPrivateRegularWalFile(walFilePath);
  const descriptor = openSync(
    walFilePath,
    constants.O_RDONLY | FILE_OPEN_NO_FOLLOW,
  );
  try {
    const status = fstatSync(descriptor);
    if (!status.isFile()) {
      throw new Error("WAL descriptor is not a regular file.");
    }
    return readFileSync(descriptor);
  } catch (error) {
    throw new Error("RUNTIME_SESSION_WAL_PATH_INVALID: WAL could not be read safely.", {
      cause: error,
    });
  } finally {
    closeSync(descriptor);
  }
}

function truncateWalFile(walFilePath: string, byteLength: number): void {
  const descriptor = openSync(
    walFilePath,
    constants.O_WRONLY | FILE_OPEN_NO_FOLLOW,
  );
  try {
    ftruncateSync(descriptor, byteLength);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function transactionHash(
  value: Omit<RuntimeSessionWalTransactionV1, "transactionHash">,
): Sha256HashV1 {
  return sha256CanonicalJson(value) as Sha256HashV1;
}

function transactionWithoutHash(
  value: RuntimeSessionWalTransactionV1,
): Omit<RuntimeSessionWalTransactionV1, "transactionHash"> {
  const { transactionHash: _transactionHash, ...body } = value;
  return body;
}

function parseTransaction(
  value: unknown,
  expectedSequence: number,
  expectedPreviousTransactionHash: Sha256HashV1,
): RuntimeSessionWalTransactionV1 {
  const record = snapshotDataRecord(value) ??
    corrupt(`Transaction ${expectedSequence} must be one plain object.`);
  const common = [
    "kind",
    "schemaVersion",
    "sequence",
    "previousTransactionHash",
    "type",
    "transactionHash",
  ];
  if (
    record.kind !== "worldkit-runtime-session-wal-transaction" ||
    record.schemaVersion !== 1 ||
    record.sequence !== expectedSequence ||
    !isSafePositiveInteger(record.sequence) ||
    record.previousTransactionHash !== expectedPreviousTransactionHash ||
    !isSha256(record.previousTransactionHash) ||
    !isSha256(record.transactionHash)
  ) corrupt(`Transaction ${expectedSequence} envelope or hash chain is invalid.`);

  let parsed: RuntimeSessionWalTransactionV1;
  if (record.type === "session-opened") {
    if (!hasExactKeys(record, [...common, "readyEvent"])) {
      return corrupt(`Transaction ${expectedSequence} session-opened shape is invalid.`);
    }
    let readyEvent: RuntimeSessionEventV1;
    try {
      readyEvent = parseRuntimeSessionEventV1(record.readyEvent);
    } catch (error) {
      return corrupt(`Transaction ${expectedSequence} ready Event is invalid.`, error);
    }
    if (readyEvent.type !== "ready") {
      return corrupt(`Transaction ${expectedSequence} must contain a ready Event.`);
    }
    parsed = Object.freeze({
      kind: "worldkit-runtime-session-wal-transaction",
      schemaVersion: 1,
      sequence: record.sequence,
      previousTransactionHash: record.previousTransactionHash,
      type: "session-opened",
      readyEvent,
      transactionHash: record.transactionHash,
    });
  } else if (record.type === "request-committed") {
    if (!hasExactKeys(record, [
      ...common,
      "request",
      "requestHash",
      "receipt",
    ])) {
      return corrupt(`Transaction ${expectedSequence} request shape is invalid.`);
    }
    let request: RuntimeSessionRequestV1;
    let requestHash: Sha256HashV1;
    let receipt: RuntimeSessionReceiptV1;
    try {
      request = parseRuntimeSessionRequestV1(record.request);
      requestHash = hashRuntimeSessionRequestV1(request);
      receipt = parseRuntimeSessionReceiptV1(record.receipt);
    } catch (error) {
      return corrupt(
        `Transaction ${expectedSequence} Request or Receipt is invalid.`,
        error,
      );
    }
    if (
      record.requestHash !== requestHash ||
      receipt.requestId !== request.id ||
      receipt.requestHash !== requestHash ||
      receipt.runtimeSessionId !== request.runtimeSessionId ||
      receipt.requestType !== request.type
    ) corrupt(`Transaction ${expectedSequence} Request and Receipt bindings diverge.`);
    parsed = Object.freeze({
      kind: "worldkit-runtime-session-wal-transaction",
      schemaVersion: 1,
      sequence: record.sequence,
      previousTransactionHash: record.previousTransactionHash,
      type: "request-committed",
      request,
      requestHash,
      receipt,
      transactionHash: record.transactionHash,
    });
  } else if (record.type === "session-closed") {
    if (!hasExactKeys(record, [...common, "finalEvent"])) {
      return corrupt(`Transaction ${expectedSequence} session-closed shape is invalid.`);
    }
    let finalEvent: RuntimeSessionEventV1;
    try {
      finalEvent = parseRuntimeSessionEventV1(record.finalEvent);
    } catch (error) {
      return corrupt(`Transaction ${expectedSequence} final Event is invalid.`, error);
    }
    if (finalEvent.type === "ready") {
      return corrupt(`Transaction ${expectedSequence} must contain one final Event.`);
    }
    parsed = Object.freeze({
      kind: "worldkit-runtime-session-wal-transaction",
      schemaVersion: 1,
      sequence: record.sequence,
      previousTransactionHash: record.previousTransactionHash,
      type: "session-closed",
      finalEvent,
      transactionHash: record.transactionHash,
    });
  } else {
    return corrupt(`Transaction ${expectedSequence} type is unknown.`);
  }
  if (transactionHash(transactionWithoutHash(parsed)) !== parsed.transactionHash) {
    return corrupt(`Transaction ${expectedSequence} content hash is invalid.`);
  }
  return parsed;
}

function validateTransactionState(
  transactions: readonly RuntimeSessionWalTransactionV1[],
): RuntimeSessionWalSnapshotV1 {
  if (isEmpty(transactions) || transactions[0]?.type !== "session-opened") {
    return corrupt("The first transaction must open one ready Runtime Session.");
  }
  const readyEvent = transactions[0].readyEvent;
  const committedRequests: RuntimeSessionWalCommittedRequestV1[] = [];
  const requestIds = new Set<string>();
  let currentWorldSessionId = readyEvent.worldSessionId;
  let finalEvent: RuntimeSessionFinalEventV1 | undefined;
  for (const transaction of transactions.slice(1)) {
    if (!isNil(finalEvent)) {
      return corrupt("No transaction may follow session-closed.");
    }
    if (transaction.type === "session-opened") {
      return corrupt("A WAL may contain exactly one session-opened transaction.");
    }
    if (transaction.type === "request-committed") {
      if (
        transaction.request.runtimeSessionId !== readyEvent.runtimeSessionId ||
        transaction.receipt.runtimeSessionId !== readyEvent.runtimeSessionId ||
        !receiptPayloadBindsRequestV1(
          transaction.request,
          transaction.receipt,
        ) ||
        requestIds.has(transaction.request.id) ||
        (transaction.request.type === "gameplay-command.execute" &&
          transaction.request.command.worldSessionId !== currentWorldSessionId) ||
        (transaction.request.type !== "session.reset" &&
          transaction.receipt.worldSessionId !== currentWorldSessionId) ||
        (transaction.request.type === "session.reset" &&
          transaction.receipt.status === "succeeded" &&
          transaction.receipt.worldSessionId === currentWorldSessionId)
      ) return corrupt("A committed Request is not bound to the opened Session.");
      if (
        transaction.request.type === "session.reset"
      ) currentWorldSessionId = transaction.receipt.worldSessionId;
      requestIds.add(transaction.request.id);
      committedRequests.push(Object.freeze({
        request: transaction.request,
        requestHash: transaction.requestHash,
        receipt: transaction.receipt,
      }));
      continue;
    }
    if (
      transaction.finalEvent.runtimeSessionId !== readyEvent.runtimeSessionId ||
      transaction.finalEvent.worldSessionId !== currentWorldSessionId ||
      transaction.finalEvent.sequence !== readyEvent.sequence + 1
    ) return corrupt("The final Event is not bound to the opened Session.");
    finalEvent = transaction.finalEvent;
  }
  return Object.freeze({
    readyEvent,
    committedRequests: Object.freeze(committedRequests),
    ...(isNil(finalEvent) ? {} : { finalEvent }),
  });
}

function readTransactions(
  walFilePath: string,
): readonly RuntimeSessionWalTransactionV1[] {
  let bytes = readWalBytes(walFilePath);
  if (bytes.byteLength === 0) return corrupt("WAL is empty.");
  const lastNewlineIndex = bytes.lastIndexOf(0x0a);
  if (lastNewlineIndex < bytes.byteLength - 1) {
    const retainedLength = lastNewlineIndex + 1;
    truncateWalFile(walFilePath, retainedLength);
    if (retainedLength === 0) return corrupt("WAL has no complete transaction.");
    bytes = bytes.subarray(0, retainedLength);
  }
  if (lastNewlineIndex < 0) return corrupt("WAL has no complete transaction.");
  const rows = bytes.toString("utf8").split("\n").slice(0, -1);
  let previousTransactionHash = GENESIS_TRANSACTION_HASH;
  return Object.freeze(rows.map((row, index) => {
    if (isEmpty(row)) return corrupt(`Transaction row ${index + 1} is empty.`);
    let value: unknown;
    try {
      value = JSON.parse(row);
      if (stringifyCanonicalJson(value) !== row) {
        throw new Error("row is not Canonical JSON");
      }
    } catch (error) {
      return corrupt(`Transaction row ${index + 1} is not Canonical JSON.`, error);
    }
    const transaction = parseTransaction(
      value,
      index + 1,
      previousTransactionHash,
    );
    previousTransactionHash = transaction.transactionHash;
    return transaction;
  }));
}

function appendLine(walFilePath: string, line: string): void {
  assertPrivateRegularWalFile(walFilePath);
  const descriptor = openSync(
    walFilePath,
    constants.O_WRONLY | constants.O_APPEND | FILE_OPEN_NO_FOLLOW,
  );
  try {
    writeAll(descriptor, `${line}\n`);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function createWalFile(
  walFilePath: string,
  transaction: RuntimeSessionWalTransactionV1,
): void {
  const directoryPath = path.dirname(walFilePath);
  ensurePrivateDirectoryForCreate(directoryPath);
  if (existsSync(walFilePath)) {
    throw new Error("RUNTIME_SESSION_WAL_EXISTS: Refusing to replace an existing WAL.");
  }
  let descriptor: number;
  try {
    descriptor = openSync(
      walFilePath,
      constants.O_CREAT |
        constants.O_EXCL |
        constants.O_WRONLY |
        FILE_OPEN_NO_FOLLOW,
      OWNER_FILE_MODE,
    );
  } catch (error) {
    if (existsSync(walFilePath)) {
      throw new Error(
        "RUNTIME_SESSION_WAL_EXISTS: Refusing to replace an existing WAL.",
        { cause: error },
      );
    }
    throw error;
  }
  try {
    fchmodSync(descriptor, OWNER_FILE_MODE);
    writeAll(descriptor, `${stringifyCanonicalJson(transaction)}\n`);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  syncDirectory(directoryPath);
  assertPrivateRegularWalFile(walFilePath);
}

function buildTransaction(
  input:
    | Readonly<{
        type: "session-opened";
        readyEvent: RuntimeSessionReadyEventV1;
      }>
    | Readonly<{
        type: "request-committed";
        request: RuntimeSessionRequestV1;
        requestHash: Sha256HashV1;
        receipt: RuntimeSessionReceiptV1;
      }>
    | Readonly<{
        type: "session-closed";
        finalEvent: RuntimeSessionFinalEventV1;
      }>,
  sequence: number,
  previousTransactionHash: Sha256HashV1,
): RuntimeSessionWalTransactionV1 {
  const body = Object.freeze({
    kind: "worldkit-runtime-session-wal-transaction" as const,
    schemaVersion: 1 as const,
    sequence,
    previousTransactionHash,
    ...input,
  });
  return Object.freeze({
    ...body,
    transactionHash: transactionHash(
      body as Omit<RuntimeSessionWalTransactionV1, "transactionHash">,
    ),
  }) as RuntimeSessionWalTransactionV1;
}

class FileRuntimeSessionWal implements FileRuntimeSessionWalV1 {
  readonly brand = "FileRuntimeSessionWalV1" as const;
  private transactions: readonly RuntimeSessionWalTransactionV1[];
  private state: RuntimeSessionWalSnapshotV1;

  constructor(
    private readonly walFilePath: string,
    transactions: readonly RuntimeSessionWalTransactionV1[],
  ) {
    this.transactions = transactions;
    this.state = validateTransactionState(transactions);
  }

  snapshot(): RuntimeSessionWalSnapshotV1 {
    const committedRequests = this.state.committedRequests.map((entry) =>
      Object.freeze({
        request: parseRuntimeSessionRequestV1(entry.request),
        requestHash: entry.requestHash,
        receipt: parseRuntimeSessionReceiptV1(entry.receipt),
      })
    );
    return Object.freeze({
      readyEvent: parseRuntimeSessionEventV1(
        this.state.readyEvent,
      ) as RuntimeSessionReadyEventV1,
      committedRequests: Object.freeze(committedRequests),
      ...(isNil(this.state.finalEvent)
        ? {}
        : {
            finalEvent: parseRuntimeSessionEventV1(
              this.state.finalEvent,
            ) as RuntimeSessionFinalEventV1,
          }),
    });
  }

  lookupRequest(value: unknown): RuntimeSessionWalRequestLookupV1 {
    const request = parseRuntimeSessionRequestV1(value);
    if (request.runtimeSessionId !== this.state.readyEvent.runtimeSessionId) {
      throw new Error(
        "RUNTIME_SESSION_WAL_SESSION_MISMATCH: Request belongs to another Runtime Session.",
      );
    }
    const existing = this.state.committedRequests.find(
      (entry) => entry.request.id === request.id,
    );
    if (isNil(existing)) return Object.freeze({ status: "missing" as const });
    if (existing.requestHash !== hashRuntimeSessionRequestV1(request)) {
      return Object.freeze({ status: "conflict" as const });
    }
    return Object.freeze({
      status: "replay" as const,
      receipt: parseRuntimeSessionReceiptV1(existing.receipt),
    });
  }

  appendCommittedRequest(input: {
    readonly request: unknown;
    readonly receipt: unknown;
  }): void {
    this.assertActive();
    const request = parseRuntimeSessionRequestV1(input.request);
    const requestHash = hashRuntimeSessionRequestV1(request);
    const receipt = parseRuntimeSessionReceiptV1(input.receipt);
    const currentWorldSessionId = this.state.committedRequests.reduce(
      (worldSessionId, entry) =>
        entry.request.type === "session.reset" &&
          entry.receipt.worldSessionId !== worldSessionId
          ? entry.receipt.worldSessionId
          : worldSessionId,
      this.state.readyEvent.worldSessionId,
    );
    if (this.state.committedRequests.some(
      (entry) => entry.request.id === request.id
    )) {
      throw new Error(
        "RUNTIME_SESSION_WAL_REQUEST_DUPLICATE: Request ID is already committed.",
      );
    }
    if (
      request.runtimeSessionId !== this.state.readyEvent.runtimeSessionId ||
      receipt.requestId !== request.id ||
      receipt.requestHash !== requestHash ||
      receipt.runtimeSessionId !== request.runtimeSessionId ||
      !receiptPayloadBindsRequestV1(request, receipt) ||
      (request.type !== "session.reset" &&
        receipt.worldSessionId !== currentWorldSessionId) ||
      (request.type === "session.reset" &&
        receipt.status === "succeeded" &&
        receipt.worldSessionId === currentWorldSessionId) ||
      receipt.requestType !== request.type ||
      (request.type === "gameplay-command.execute" &&
        request.command.worldSessionId !== currentWorldSessionId)
    ) {
      throw new Error(
        "RUNTIME_SESSION_WAL_BINDING_INVALID: Request and Receipt do not bind to the opened Session.",
      );
    }
    this.append(buildTransaction({
      type: "request-committed",
      request,
      requestHash,
      receipt,
    }, this.transactions.length + 1, this.lastTransactionHash()));
  }

  appendClosed(value: unknown): void {
    this.assertActive();
    const event = parseRuntimeSessionEventV1(value);
    const currentWorldSessionId = this.state.committedRequests.reduce(
      (worldSessionId, entry) =>
        entry.request.type === "session.reset" &&
          entry.receipt.worldSessionId !== worldSessionId
          ? entry.receipt.worldSessionId
          : worldSessionId,
      this.state.readyEvent.worldSessionId,
    );
    if (
      event.type === "ready" ||
      event.runtimeSessionId !== this.state.readyEvent.runtimeSessionId ||
      event.worldSessionId !== currentWorldSessionId ||
      event.sequence !== this.state.readyEvent.sequence + 1
    ) {
      throw new Error(
        "RUNTIME_SESSION_WAL_BINDING_INVALID: Final Event does not bind to the opened Session.",
      );
    }
    this.append(buildTransaction({
      type: "session-closed",
      finalEvent: event,
    }, this.transactions.length + 1, this.lastTransactionHash()));
  }

  private assertActive(): void {
    if (!isNil(this.state.finalEvent)) {
      throw new Error(
        "RUNTIME_SESSION_WAL_CLOSED: Runtime Session has already closed.",
      );
    }
  }

  private lastTransactionHash(): Sha256HashV1 {
    const transaction = this.transactions.at(-1);
    if (isNil(transaction)) return corrupt("WAL lost its opening transaction.");
    return transaction.transactionHash;
  }

  private append(transaction: RuntimeSessionWalTransactionV1): void {
    withOwnerLock(this.walFilePath, () => {
      const current = readTransactions(this.walFilePath);
      const currentLast = current.at(-1);
      if (
        current.length !== this.transactions.length ||
        isNil(currentLast) ||
        currentLast.transactionHash !== this.lastTransactionHash()
      ) {
        throw new Error(
          "RUNTIME_SESSION_WAL_OWNER_CONFLICT: WAL changed outside the current owner.",
        );
      }
      appendLine(this.walFilePath, stringifyCanonicalJson(transaction));
    });
    const nextTransactions = Object.freeze([...this.transactions, transaction]);
    const nextState = validateTransactionState(nextTransactions);
    this.transactions = nextTransactions;
    this.state = nextState;
  }
}

export function createFileRuntimeSessionWalV1(input: {
  readonly walFilePath: string;
  readonly readyEvent: unknown;
}): FileRuntimeSessionWalV1 {
  const walFilePath = requireAbsoluteWalFilePath(input.walFilePath);
  const event = parseRuntimeSessionEventV1(input.readyEvent);
  if (event.type !== "ready") {
    throw new TypeError("Runtime Session WAL must open with a ready Event.");
  }
  const transaction = buildTransaction({
    type: "session-opened",
    readyEvent: event,
  }, 1, GENESIS_TRANSACTION_HASH);
  createWalFile(walFilePath, transaction);
  return new FileRuntimeSessionWal(walFilePath, Object.freeze([transaction]));
}

export function openFileRuntimeSessionWalV1(input: {
  readonly walFilePath: string;
}): FileRuntimeSessionWalV1 {
  const walFilePath = requireAbsoluteWalFilePath(input.walFilePath);
  assertPrivateDirectory(path.dirname(walFilePath));
  const transactions = withOwnerLock(
    walFilePath,
    () => readTransactions(walFilePath),
  );
  validateTransactionState(transactions);
  return new FileRuntimeSessionWal(walFilePath, transactions);
}
