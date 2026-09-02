import { constants } from "node:fs";
import { lstat, mkdir, open } from "node:fs/promises";
import path from "node:path";

import { isEmpty, isEqual, isNil } from "lodash-es";
import { stringifyCanonicalJson, type Sha256HashV1 } from "@whitebox-world/protocol";

import type { WorldReconstructionFrozenOwnerIdentitiesV1 } from "./generation-request.js";

export const WORLD_RECONSTRUCTION_JOURNAL_STATES_V1 = Object.freeze([
  "created", "initial-generating", "initial-packaged", "initial-captured",
  "initial-evaluated", "repair-generating", "repair-packaged", "repair-captured",
  "repair-evaluated", "cleanup-joined", "completed",
] as const);

export type WorldReconstructionJournalStateV1 = (typeof WORLD_RECONSTRUCTION_JOURNAL_STATES_V1)[number];
export type WorldReconstructionCleanupOwnerOutcomeV1 = "completed" | "failed" | "pending";

export interface WorldReconstructionCleanupOutcomesV1 {
  readonly providerTask: WorldReconstructionCleanupOwnerOutcomeV1;
  readonly candidate: WorldReconstructionCleanupOwnerOutcomeV1;
  readonly hostedBrowserSession: WorldReconstructionCleanupOwnerOutcomeV1;
  readonly viteServer: WorldReconstructionCleanupOwnerOutcomeV1;
  readonly temporaryDirectories: WorldReconstructionCleanupOwnerOutcomeV1;
  readonly outputPromotion: WorldReconstructionCleanupOwnerOutcomeV1;
}

export interface WorldReconstructionJournalRowV1 {
  readonly kind: "world-reconstruction-journal-row";
  readonly schemaVersion: 1;
  readonly sequence: number;
  readonly runId: string;
  readonly caseRef: string;
  readonly evaluationProfileRef: string;
  readonly state: WorldReconstructionJournalStateV1;
  readonly boundary: "before" | "after";
  readonly operation: string;
  readonly frozenOwnerIdentities: WorldReconstructionFrozenOwnerIdentitiesV1;
  readonly diagnosticCodes: readonly string[];
  readonly requestId?: string;
  readonly requestHash?: Sha256HashV1;
  readonly cleanupOutcomes?: WorldReconstructionCleanupOutcomesV1;
}

export interface CreateWorldReconstructionRunJournalInputV1 {
  readonly runId: string;
  readonly caseRef: string;
  readonly evaluationProfileRef: string;
  readonly frozenOwnerIdentities: WorldReconstructionFrozenOwnerIdentitiesV1;
  readonly outputDirectoryPath: string;
}

export interface WorldReconstructionRecordedRequestV1 {
  readonly requestId: string;
  readonly requestHash: Sha256HashV1;
  readonly outcome: "accepted" | "completed";
}

const NEXT_STATES = Object.freeze({
  created: Object.freeze(["initial-generating", "cleanup-joined"] as const),
  "initial-generating": Object.freeze(["initial-packaged", "cleanup-joined"] as const),
  "initial-packaged": Object.freeze(["initial-captured", "cleanup-joined"] as const),
  "initial-captured": Object.freeze([
    "initial-evaluated",
    "repair-generating",
    "cleanup-joined",
  ] as const),
  "initial-evaluated": Object.freeze(["repair-generating", "cleanup-joined"] as const),
  "repair-generating": Object.freeze(["repair-packaged", "cleanup-joined"] as const),
  "repair-packaged": Object.freeze(["repair-captured", "cleanup-joined"] as const),
  "repair-captured": Object.freeze(["repair-evaluated", "cleanup-joined"] as const),
  "repair-evaluated": Object.freeze(["cleanup-joined"] as const),
  "cleanup-joined": Object.freeze(["completed"] as const),
  completed: Object.freeze([] as const),
}) satisfies Readonly<Record<WorldReconstructionJournalStateV1, readonly WorldReconstructionJournalStateV1[]>>;

const STALE_FIELD_CODES = Object.freeze({
  caseHash: "WORLD_RECONSTRUCTION_STALE_CASE",
  evaluationProfileHash: "WORLD_RECONSTRUCTION_STALE_PROFILE",
  gameplayBootstrapHash: "WORLD_RECONSTRUCTION_STALE_GAMEPLAY_BOOTSTRAP",
  worldRuntimeBootstrapHash: "WORLD_RECONSTRUCTION_STALE_WORLD_RUNTIME_BOOTSTRAP",
  worldBoundsHash: "WORLD_RECONSTRUCTION_STALE_WORLD_BOUNDS",
  bootstrapInputHash: "WORLD_RECONSTRUCTION_STALE_BOOTSTRAP",
} as const);
const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;
const CLEANUP_KEYS = ["providerTask", "candidate", "hostedBrowserSession", "viteServer", "temporaryDirectories", "outputPromotion"] as const;
const REQUIRED_ROW_KEYS = ["kind", "schemaVersion", "sequence", "runId", "caseRef", "evaluationProfileRef", "state", "boundary", "operation", "frozenOwnerIdentities", "diagnosticCodes"] as const;
const OPTIONAL_ROW_KEYS = ["requestId", "requestHash", "cleanupOutcomes"] as const;

function fail(code: string, detail = ""): never {
  throw new Error(isEmpty(detail) ? code : `${code}: ${detail}`);
}
function plainRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && !isNil(input) && !Array.isArray(input) && Reflect.getPrototypeOf(input) === Object.prototype;
}
function cleanupOwners(outcomes: WorldReconstructionCleanupOutcomesV1): readonly WorldReconstructionCleanupOwnerOutcomeV1[] {
  return CLEANUP_KEYS.map((key) => outcomes[key]);
}
function parseOwnerIdentities(input: unknown): WorldReconstructionFrozenOwnerIdentitiesV1 {
  if (!plainRecord(input)) fail("WORLD_RECONSTRUCTION_JOURNAL_CORRUPT", "owner identities");
  const keys = Object.keys(STALE_FIELD_CODES);
  if (Object.keys(input).length !== keys.length || keys.some((key) => typeof input[key] !== "string" || !SHA256_PATTERN.test(input[key] as string))) fail("WORLD_RECONSTRUCTION_JOURNAL_CORRUPT", "owner identities");
  return Object.freeze({ ...input }) as unknown as WorldReconstructionFrozenOwnerIdentitiesV1;
}
function parseCleanup(input: unknown): WorldReconstructionCleanupOutcomesV1 {
  if (!plainRecord(input) || Object.keys(input).length !== CLEANUP_KEYS.length || CLEANUP_KEYS.some((key) => !["completed", "failed", "pending"].includes(input[key] as string))) fail("WORLD_RECONSTRUCTION_JOURNAL_CORRUPT", "cleanup outcomes");
  return Object.freeze({ ...input }) as unknown as WorldReconstructionCleanupOutcomesV1;
}
function parseRow(input: unknown, sequence: number): WorldReconstructionJournalRowV1 {
  if (!plainRecord(input)) fail("WORLD_RECONSTRUCTION_JOURNAL_CORRUPT", "row");
  const keys = Object.keys(input);
  const allowed = [...REQUIRED_ROW_KEYS, ...OPTIONAL_ROW_KEYS] as readonly string[];
  if (REQUIRED_ROW_KEYS.some((key) => !keys.includes(key)) || keys.some((key) => !allowed.includes(key))) fail("WORLD_RECONSTRUCTION_JOURNAL_CORRUPT", "row fields");
  if (
    input.kind !== "world-reconstruction-journal-row" || input.schemaVersion !== 1 || input.sequence !== sequence ||
    typeof input.runId !== "string" || typeof input.caseRef !== "string" || typeof input.evaluationProfileRef !== "string" ||
    !WORLD_RECONSTRUCTION_JOURNAL_STATES_V1.includes(input.state as WorldReconstructionJournalStateV1) ||
    (input.boundary !== "before" && input.boundary !== "after") || typeof input.operation !== "string" ||
    !Array.isArray(input.diagnosticCodes) || input.diagnosticCodes.some((code) => typeof code !== "string") ||
    (input.requestId === undefined && input.requestHash !== undefined) ||
    (input.requestId !== undefined && typeof input.requestId !== "string") ||
    (input.requestHash !== undefined && (typeof input.requestHash !== "string" || !SHA256_PATTERN.test(input.requestHash)))
  ) fail("WORLD_RECONSTRUCTION_JOURNAL_CORRUPT", "row values");
  const row = {
    ...input,
    frozenOwnerIdentities: parseOwnerIdentities(input.frozenOwnerIdentities),
    diagnosticCodes: Object.freeze([...(input.diagnosticCodes as string[])]),
    ...(input.cleanupOutcomes === undefined ? {} : { cleanupOutcomes: parseCleanup(input.cleanupOutcomes) }),
  } as unknown as WorldReconstructionJournalRowV1;
  return Object.freeze(row);
}
function validateTransition(rows: readonly WorldReconstructionJournalRowV1[], row: WorldReconstructionJournalRowV1): void {
  if (row.sequence === 0) {
    if (row.state !== "created" || row.boundary !== "after" || row.operation !== "created") fail("WORLD_RECONSTRUCTION_JOURNAL_CORRUPT", "created row");
    return;
  }
  const last = rows.at(-1);
  const current = rows.filter((candidate) => candidate.boundary === "after").at(-1)?.state;
  if (isNil(last) || isNil(current)) fail("WORLD_RECONSTRUCTION_JOURNAL_CORRUPT", "missing predecessor");
  if (row.boundary === "before") {
    if (last.boundary === "before" || !NEXT_STATES[current].includes(row.state as never)) fail("WORLD_RECONSTRUCTION_JOURNAL_TRANSITION_INVALID");
  } else if (last.boundary !== "before" || last.state !== row.state || last.operation !== row.operation) fail("WORLD_RECONSTRUCTION_JOURNAL_TRANSITION_INVALID", "after without matching before");
}
async function fsyncDirectory(directoryPath: string): Promise<void> {
  const directory = await open(directoryPath, constants.O_RDONLY);
  try { await directory.sync(); } finally { await directory.close(); }
}
async function createOrReadJournal(journalPath: string, outputDirectoryPath: string): Promise<readonly WorldReconstructionJournalRowV1[]> {
  let handle;
  let created = false;
  try {
    handle = await open(journalPath, constants.O_RDWR | constants.O_APPEND | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    created = true;
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
    handle = await open(journalPath, constants.O_RDWR | constants.O_APPEND | constants.O_NOFOLLOW, 0o600);
  }
  try {
    const bytes = await handle.readFile();
    let completeLength = bytes.length;
    if (bytes.length > 0 && bytes[bytes.length - 1] !== 0x0a) {
      completeLength = bytes.lastIndexOf(0x0a) + 1;
      await handle.truncate(completeLength);
      await handle.sync();
    }
    const rows: WorldReconstructionJournalRowV1[] = [];
    for (const line of bytes.subarray(0, completeLength).toString("utf8").split("\n").filter((candidate) => candidate.length > 0)) {
      let decoded: unknown;
      try { decoded = JSON.parse(line); } catch { fail("WORLD_RECONSTRUCTION_JOURNAL_CORRUPT", "invalid JSONL"); }
      const row = parseRow(decoded, rows.length);
      if (stringifyCanonicalJson(row) !== line) fail("WORLD_RECONSTRUCTION_JOURNAL_CORRUPT", "non-canonical JSONL");
      validateTransition(rows, row);
      rows.push(row);
    }
    if (created) { await handle.sync(); await fsyncDirectory(outputDirectoryPath); }
    return Object.freeze(rows);
  } finally { await handle.close(); }
}

export interface WorldReconstructionRunJournalV1 {
  readonly id: string;
  readonly runId: string;
  readonly outputDirectoryPath: string;
  readonly frozenOwnerIdentities: WorldReconstructionFrozenOwnerIdentitiesV1;
  rows(): readonly WorldReconstructionJournalRowV1[];
  states(): readonly WorldReconstructionJournalStateV1[];
  currentState(): WorldReconstructionJournalStateV1;
  beginAttempt(attemptIndex: 0 | 1): void;
  recordBoundary(input: Readonly<{ state: WorldReconstructionJournalStateV1; boundary: "before" | "after"; operation: string; diagnosticCodes?: readonly string[]; requestId?: string; requestHash?: Sha256HashV1; cleanupOutcomes?: WorldReconstructionCleanupOutcomesV1 }>): Promise<WorldReconstructionJournalRowV1>;
  attachOrRejectRequest(requestId: string, requestHash: Sha256HashV1): "accepted" | "attached";
  recordedRequest(requestId: string): WorldReconstructionRecordedRequestV1 | undefined;
  recordCleanup(outcomes: WorldReconstructionCleanupOutcomesV1): void;
  cleanupOutcomes(): WorldReconstructionCleanupOutcomesV1 | undefined;
  cleanupOutcome(): "completed" | "failed" | "pending";
  canPublishTerminalReceipt(): boolean;
  assertOwnerIdentities(current: WorldReconstructionFrozenOwnerIdentitiesV1): void;
}

export async function createWorldReconstructionRunJournalV1(input: CreateWorldReconstructionRunJournalInputV1): Promise<WorldReconstructionRunJournalV1> {
  await mkdir(input.outputDirectoryPath, { recursive: true, mode: 0o700 });
  const metadata = await lstat(input.outputDirectoryPath);
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) fail("WORLD_RECONSTRUCTION_JOURNAL_PATH_UNSAFE");
  const journalPath = path.join(input.outputDirectoryPath, "journal.jsonl");
  const rows = [...await createOrReadJournal(journalPath, input.outputDirectoryPath)];
  const requests = new Map<string, WorldReconstructionRecordedRequestV1>();
  const begunAttempts = new Set<number>();
  let cleanup: WorldReconstructionCleanupOutcomesV1 | undefined;
  for (const row of rows) {
    if (row.runId !== input.runId || row.caseRef !== input.caseRef || row.evaluationProfileRef !== input.evaluationProfileRef || !isEqual(row.frozenOwnerIdentities, input.frozenOwnerIdentities)) fail("WORLD_RECONSTRUCTION_JOURNAL_IDENTITY_MISMATCH");
    if (row.state.startsWith("initial-")) begunAttempts.add(0);
    if (row.state.startsWith("repair-")) begunAttempts.add(1);
    if (row.requestId !== undefined && row.requestHash !== undefined) {
      const existing = requests.get(row.requestId);
      if (existing !== undefined && existing.requestHash !== row.requestHash) fail("WORLD_RECONSTRUCTION_DUPLICATE_REQUEST_MISMATCH");
      if ([...requests.values()].some((request) => request.requestId !== row.requestId && request.requestHash === row.requestHash)) fail("WORLD_RECONSTRUCTION_DUPLICATE_REQUEST_MISMATCH");
      requests.set(row.requestId, Object.freeze({ requestId: row.requestId, requestHash: row.requestHash, outcome: row.boundary === "after" ? "completed" : existing?.outcome ?? "accepted" }));
    }
    if (row.state === "cleanup-joined" && row.boundary === "after" && row.cleanupOutcomes !== undefined) cleanup = row.cleanupOutcomes;
  }
  const persist = async (row: WorldReconstructionJournalRowV1): Promise<void> => {
    const handle = await open(journalPath, constants.O_WRONLY | constants.O_APPEND | constants.O_NOFOLLOW);
    try { await handle.writeFile(`${stringifyCanonicalJson(row)}\n`, "utf8"); await handle.sync(); } finally { await handle.close(); }
  };
  const appendRow = async (rowInput: Omit<WorldReconstructionJournalRowV1, "kind" | "schemaVersion" | "sequence" | "runId" | "caseRef" | "evaluationProfileRef" | "frozenOwnerIdentities" | "diagnosticCodes"> & { readonly diagnosticCodes?: readonly string[] }): Promise<WorldReconstructionJournalRowV1> => {
    const row = Object.freeze({
      kind: "world-reconstruction-journal-row" as const, schemaVersion: 1 as const, sequence: rows.length,
      runId: input.runId, caseRef: input.caseRef, evaluationProfileRef: input.evaluationProfileRef, ...rowInput,
      frozenOwnerIdentities: Object.freeze({ ...input.frozenOwnerIdentities }), diagnosticCodes: Object.freeze([...(rowInput.diagnosticCodes ?? [])]),
    });
    validateTransition(rows, row);
    await persist(row);
    rows.push(row);
    return row;
  };
  if (rows.length === 0) await appendRow({ state: "created", boundary: "after", operation: "created" });
  const currentAfterState = () => rows.filter((row) => row.boundary === "after").at(-1)?.state ?? "created";
  const journal: WorldReconstructionRunJournalV1 = {
    id: `world-reconstruction-journal:${input.runId}`, runId: input.runId, outputDirectoryPath: input.outputDirectoryPath,
    frozenOwnerIdentities: Object.freeze({ ...input.frozenOwnerIdentities }), rows: () => Object.freeze([...rows]),
    states: () => Object.freeze(rows.filter((row) => row.boundary === "after").map((row) => row.state)), currentState: currentAfterState,
    beginAttempt: (attemptIndex: 0 | 1) => {
      if (attemptIndex !== 0 && attemptIndex !== 1) fail("WORLD_RECONSTRUCTION_MAX_REPAIR_EXCEEDED");
      if (begunAttempts.has(attemptIndex)) fail("WORLD_RECONSTRUCTION_JOURNAL_TRANSITION_INVALID", `attempt ${attemptIndex} already begun`);
      begunAttempts.add(attemptIndex);
    },
    recordBoundary: async (boundaryInput) => {
      if (boundaryInput.requestId === undefined && boundaryInput.requestHash !== undefined) fail("WORLD_RECONSTRUCTION_JOURNAL_CORRUPT", "partial request identity");
      const row = await appendRow({ state: boundaryInput.state, boundary: boundaryInput.boundary, operation: boundaryInput.operation,
        ...(boundaryInput.diagnosticCodes === undefined ? {} : { diagnosticCodes: boundaryInput.diagnosticCodes }),
        ...(boundaryInput.requestId === undefined ? {} : { requestId: boundaryInput.requestId, requestHash: boundaryInput.requestHash }),
        ...(boundaryInput.cleanupOutcomes === undefined ? {} : { cleanupOutcomes: Object.freeze({ ...boundaryInput.cleanupOutcomes }) }),
      });
      if (row.requestId !== undefined && row.requestHash !== undefined) requests.set(row.requestId, Object.freeze({ requestId: row.requestId, requestHash: row.requestHash, outcome: row.boundary === "after" ? "completed" : requests.get(row.requestId)?.outcome ?? "accepted" }));
      if (row.state === "cleanup-joined" && row.boundary === "after" && row.cleanupOutcomes !== undefined) cleanup = row.cleanupOutcomes;
      return row;
    },
    attachOrRejectRequest: (requestId, requestHash) => {
      const existing = requests.get(requestId);
      if (existing === undefined) {
        if ([...requests.values()].some((request) => request.requestHash === requestHash)) fail("WORLD_RECONSTRUCTION_DUPLICATE_REQUEST_MISMATCH");
        requests.set(requestId, Object.freeze({ requestId, requestHash, outcome: "accepted" }));
        return "accepted";
      }
      if (existing.requestHash !== requestHash) fail("WORLD_RECONSTRUCTION_DUPLICATE_REQUEST_MISMATCH");
      return "attached";
    },
    recordedRequest: (requestId) => requests.get(requestId), recordCleanup: (outcomes) => { cleanup = Object.freeze({ ...outcomes }); },
    cleanupOutcomes: () => cleanup,
    cleanupOutcome: () => cleanup === undefined ? "pending" : cleanupOwners(cleanup).some((outcome) => outcome === "failed") ? "failed" : cleanupOwners(cleanup).some((outcome) => outcome === "pending") ? "pending" : "completed",
    canPublishTerminalReceipt: () => cleanup !== undefined && cleanupOwners(cleanup).every((outcome) => outcome === "completed" || outcome === "failed"),
    assertOwnerIdentities: (current) => { for (const field of Object.keys(STALE_FIELD_CODES) as readonly (keyof WorldReconstructionFrozenOwnerIdentitiesV1)[]) if (current[field] !== input.frozenOwnerIdentities[field]) fail(STALE_FIELD_CODES[field]); },
  };
  return Object.freeze(journal);
}
