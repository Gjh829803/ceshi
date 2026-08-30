import type { Sha256HashV1 } from "@whitebox-world/protocol";

import { randomBytes, randomUUID } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  hashAuthoringDocumentV4,
  normalizeAuthoringSpecV4,
  parseAuthoringSpecV4,
  parseCanonicalJson,
  type AuthoringSpecV4,
} from "@whitebox-world/authoring";
import canonicalAuthoringSchema from "@whitebox-world/authoring/schema";
import {
  AUTHORING_EDIT_SCOPES_V1,
  REGISTRY_RESOURCE_KINDS_V1,
  WORLD_CHANGE_OPERATION_TYPES_V1,
  applyWorldChangeSetV1,
  assembleWorldChangeDiffV1,
  canonicalizeRegistryLockEntriesV1,
  hashAuthoringEditPolicyProjectionV1,
  hashCapabilitySetV1,
  hashRegistryLockEntriesV1,
  hashWorldChangeRequestV1,
  hashWorldChangeSetV1,
  isAppliedWorldChangeSetResultV1,
  operationPrimaryTarget,
  operationsConflict,
  parseAiSchemaProjectionProfileSourceV1,
  parseAuthoringEditPolicyProjectionV1,
  parseRegistrySearchResultV1,
  parseWorldChangeCleanupReportQueryV1,
  parseWorldChangeDiagnosticV1,
  parseWorldChangeDiffV1,
  parseWorldChangeExplainV1,
  parseWorldChangeReceiptQueryV1,
  parseWorldChangeReceiptV1,
  parseWorldChangeRequestV1,
  parseWorldChangeSetV1,
  projectAiSchemaV1,
  searchRegistryV1,
  targetOverlapKey,
  type AiSchemaProjectionV1,
  type AuthoringEditPolicyProjectionV1,
  type AuthoringEditScopeV1,
  type RegistryResourceKindV1,
  type RegistrySearchReceiptV1,
  type RegistrySearchResultV1,
  type WorldChangeCleanupReportV1,
  type WorldChangeDiffV1,
  type WorldChangeExplainV1,
  type WorldChangeOperationV1,
  type WorldChangeReceiptV1,
  type WorldChangeRequestV1,
  type WorldChangeSetV1,
  type WorldChangeTargetV1,
} from "@whitebox-world/authoring-edit";
import {
  createPreparedCandidateLeaseStoreV1,
  createWorldChangeJournalV1,
  getAuthoringRevisionHeadV1,
  journalArtifactIdV1,
  queryWorldChangeCleanupReportV1,
  queryWorldChangeReceiptV1,
  seedAuthoringRevisionHeadV1,
  submitWorldChangeRequestV1,
  type AuthoringEditSessionV1,
  type PreparedCandidateLeaseStoreV1,
  type QueryWorldChangeCleanupReportResultV1,
  type QueryWorldChangeReceiptResultV1,
  type SubmitWorldChangeRequestResultV1,
  type WorldChangeJournalV1,
} from "@whitebox-world/authoring-host";
import { stringifyCanonicalJson } from "@whitebox-world/protocol";
import { builtInSubjectResourceRegistry } from "@whitebox-world/subject-registry";
import type {
  ResolvedCanonicalWorldPackageResourceArtifactV1,
  CanonicalWorldPackageBuildContextV1,
  WorldPackageStoreV1,
} from "@whitebox-world/world-package";
import { isEmpty, isNil, isPlainObject, sortBy } from "lodash-es";

import { promoteArtifactDirectory } from "./artifact-directory-promotion";
import type { CliDiagnostic } from "./worldkit-pipeline";
import { createFileWorldPackageStoreV1 } from "./file-world-package";
import {
  createTrustedCanonicalWorldPackageBuildContextV1,
  resolveTrustedWorldPackageResourceArtifactsV1,
} from "./trusted-world-package";

export const FILE_MODE_VALIDATE_WORLD_ID = "offline";
export const CONSTRAINED_JSON_PROFILE_REF =
  "worldkit://ai-schema-projection-profile/constrained-json@1";
export const AUTHORING_EDIT_CONNECTION_PROFILE_KIND =
  "worldkit-authoring-edit-connection-profile";

const CREDENTIAL_KEY_PATTERN =
  /^(token|authorization|secret|password|apikey|accesstoken|bearer)$/i;

const FILE_MODE_SCOPES_V1 = AUTHORING_EDIT_SCOPES_V1.filter(
  (scope) => scope !== "authoring.runtime.publish",
) as readonly AuthoringEditScopeV1[];

const DRY_RUN_SUCCESS_FILENAMES = [
  "candidate-authoring.json",
  "world-change-diff.json",
  "world-change-receipt.json",
] as const;

const DRY_RUN_FAILURE_FILENAMES = ["world-change-receipt.json"] as const;

export interface AuthoringEditConnectionProfileV1 {
  readonly kind: typeof AUTHORING_EDIT_CONNECTION_PROFILE_KIND;
  readonly schemaVersion: 1;
  readonly authoringEditSessionId: string;
}

export interface AuthoringEditLivePortV1 {
  submit(request: WorldChangeRequestV1): Promise<SubmitWorldChangeRequestResultV1>;
  queryReceipt(requestId: string): QueryWorldChangeReceiptResultV1;
  queryCleanup(cleanupOperationId: string): QueryWorldChangeCleanupReportResultV1;
}

export type AuthoringEditCliResultV1 = {
  readonly ok: boolean;
  readonly exitCode: 0 | 1 | 2;
  readonly kind: "worldkit-authoring-edit-command-result";
  readonly schemaVersion: 1;
  readonly diagnostics: readonly CliDiagnostic[];
  readonly requestId?: string;
  readonly outputPath?: string;
  readonly receiptPath?: string;
  readonly receipt?: WorldChangeReceiptV1;
  readonly projection?: AiSchemaProjectionV1;
  readonly searchReceipt?: RegistrySearchReceiptV1;
  readonly explain?: WorldChangeExplainV1;
  readonly diff?: WorldChangeDiffV1;
  readonly cleanupReport?: WorldChangeCleanupReportV1;
};

function createCliId(prefix: string): string {
  return `${prefix}.${randomBytes(6).toString("hex")}`;
}

function cliDiagnostic(
  code: string,
  message: string,
  extras: {
    readonly instancePath?: string;
    readonly details?: Readonly<Record<string, unknown>>;
  } = {},
): CliDiagnostic {
  return {
    severity: "error",
    code,
    instancePath: extras.instancePath ?? "",
    message,
    ...(isNil(extras.details) ? {} : { details: extras.details }),
  };
}

function failure(
  code: string,
  message: string,
  extras: {
    readonly exitCode?: 1 | 2;
    readonly instancePath?: string;
    readonly details?: Readonly<Record<string, unknown>>;
    readonly requestId?: string;
    readonly outputPath?: string;
    readonly receiptPath?: string;
    readonly receipt?: WorldChangeReceiptV1;
    readonly projection?: AiSchemaProjectionV1;
    readonly searchReceipt?: RegistrySearchReceiptV1;
    readonly explain?: WorldChangeExplainV1;
    readonly diff?: WorldChangeDiffV1;
    readonly cleanupReport?: WorldChangeCleanupReportV1;
  } = {},
): AuthoringEditCliResultV1 {
  return {
    ok: false,
    exitCode: extras.exitCode ?? 2,
    kind: "worldkit-authoring-edit-command-result",
    schemaVersion: 1,
    diagnostics: [
      cliDiagnostic(code, message, {
        ...(isNil(extras.instancePath) ? {} : { instancePath: extras.instancePath }),
        ...(isNil(extras.details) ? {} : { details: extras.details }),
      }),
    ],
    ...(isNil(extras.requestId) ? {} : { requestId: extras.requestId }),
    ...(isNil(extras.outputPath) ? {} : { outputPath: extras.outputPath }),
    ...(isNil(extras.receiptPath) ? {} : { receiptPath: extras.receiptPath }),
    ...(isNil(extras.receipt) ? {} : { receipt: extras.receipt }),
    ...(isNil(extras.projection) ? {} : { projection: extras.projection }),
    ...(isNil(extras.searchReceipt) ? {} : { searchReceipt: extras.searchReceipt }),
    ...(isNil(extras.explain) ? {} : { explain: extras.explain }),
    ...(isNil(extras.diff) ? {} : { diff: extras.diff }),
    ...(isNil(extras.cleanupReport) ? {} : { cleanupReport: extras.cleanupReport }),
  };
}

function success(
  extras: Omit<AuthoringEditCliResultV1, "ok" | "exitCode" | "kind" | "schemaVersion" | "diagnostics">,
): AuthoringEditCliResultV1 {
  return {
    ok: true,
    exitCode: 0,
    kind: "worldkit-authoring-edit-command-result",
    schemaVersion: 1,
    diagnostics: [],
    ...extras,
  };
}

function isCredentialKey(key: string): boolean {
  return CREDENTIAL_KEY_PATTERN.test(key);
}

export function redactAuthoringEditJsonV1(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => redactAuthoringEditJsonV1(entry));
  }
  if (!isPlainObject(value)) {
    return value;
  }
  const record = value as Readonly<Record<string, unknown>>;
  return Object.fromEntries(
    Object.entries(record).map(([key, child]) => [
      key,
      isCredentialKey(key) ? "[redacted]" : redactAuthoringEditJsonV1(child),
    ]),
  );
}

function collectCredentialKeys(value: unknown, found: string[]): void {
  if (Array.isArray(value)) {
    value.forEach((entry) => collectCredentialKeys(entry, found));
    return;
  }
  if (!isPlainObject(value)) {
    return;
  }
  const record = value as Readonly<Record<string, unknown>>;
  for (const [key, child] of Object.entries(record)) {
    if (isCredentialKey(key)) {
      found.push(key);
    }
    collectCredentialKeys(child, found);
  }
}

export function parseAuthoringEditConnectionProfileV1(
  value: unknown,
): AuthoringEditConnectionProfileV1 {
  const credentialKeys: string[] = [];
  collectCredentialKeys(value, credentialKeys);
  if (!isEmpty(credentialKeys)) {
    throw new RangeError(
      "Authoring/Edit connection profile must not carry credentials.",
    );
  }
  if (!isPlainObject(value)) {
    throw new RangeError(
      "Authoring/Edit connection profile must match the closed schema.",
    );
  }
  const record = value as Readonly<Record<string, unknown>>;
  const keys = [...Object.keys(record)].sort();
  if (
    record.kind !== AUTHORING_EDIT_CONNECTION_PROFILE_KIND ||
    record.schemaVersion !== 1 ||
    typeof record.authoringEditSessionId !== "string" ||
    isEmpty(record.authoringEditSessionId) ||
    keys.join(",") !== "authoringEditSessionId,kind,schemaVersion"
  ) {
    throw new RangeError(
      "Authoring/Edit connection profile must match the closed schema.",
    );
  }
  return {
    kind: AUTHORING_EDIT_CONNECTION_PROFILE_KIND,
    schemaVersion: 1,
    authoringEditSessionId: record.authoringEditSessionId,
  };
}

function generousBudget() {
  return {
    maximumChangeSetBytes: 1_048_576,
    maximumPreconditionCount: 64,
    maximumOperationCount: 64,
    maximumConcurrentNonTerminalRequestCount: 8,
    maximumPreparedCandidateCount: 8,
    maximumPreparedCandidateBytes: 2_000_000,
    maximumPreparedCandidateRetentionMilliseconds: 3_600_000,
  };
}

function requiredCapabilityRefsOf(resource: object): readonly string[] {
  if (!("requiredCapabilityRefs" in resource)) {
    return [];
  }
  const value = resource.requiredCapabilityRefs;
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function authoringAvailabilityOf(
  resource: object,
): "recommended" | "advanced" | "experimental" | undefined {
  if (!("authoringAvailability" in resource)) {
    return "recommended";
  }
  const value = resource.authoringAvailability;
  if (value === "internal") {
    return undefined;
  }
  if (value === "recommended" || value === "advanced" || value === "experimental") {
    return value;
  }
  return "recommended";
}

export function toRegistrySearchResultV1(
  resource: object,
): RegistrySearchResultV1 | undefined {
  if (
    !("kind" in resource) ||
    !("resourceRef" in resource) ||
    !("version" in resource) ||
    !("contentHash" in resource) ||
    !("aiMetadata" in resource)
  ) {
    return undefined;
  }
  if (
    typeof resource.kind !== "string" ||
    !(REGISTRY_RESOURCE_KINDS_V1 as readonly string[]).includes(resource.kind)
  ) {
    return undefined;
  }
  const authoringAvailability = authoringAvailabilityOf(resource);
  if (isNil(authoringAvailability)) {
    return undefined;
  }
  try {
    return parseRegistrySearchResultV1({
      resourceRef: resource.resourceRef,
      resourceKind: resource.kind,
      version: resource.version,
      contentHash: resource.contentHash,
      authoringAvailability,
      requiredCapabilityRefs: requiredCapabilityRefsOf(resource),
      aiMetadata: resource.aiMetadata,
    });
  } catch {
    return undefined;
  }
}

export function builtInRegistryLockEntriesV1(): readonly RegistrySearchResultV1[] {
  return builtInSubjectResourceRegistry
    .listDiscoverableResources()
    .flatMap((resource) => {
      const entry = toRegistrySearchResultV1(resource);
      return isNil(entry) ? [] : [entry];
    });
}

function createFileModePolicy(
  worldId: string,
  lockEntries: readonly RegistrySearchResultV1[],
): AuthoringEditPolicyProjectionV1 {
  const capabilityRefs = lockEntries
    .filter((entry) => entry.resourceKind === "capability")
    .map((entry) => entry.resourceRef);
  return parseAuthoringEditPolicyProjectionV1({
    allowedWorldIds: [worldId],
    registryLockHash: hashRegistryLockEntriesV1(lockEntries),
    capabilitySetHash: hashCapabilitySetV1(capabilityRefs),
    projectionProfileRef: CONSTRAINED_JSON_PROFILE_REF,
    allowedWorldChangeOperationTypes: [...WORLD_CHANGE_OPERATION_TYPES_V1],
    allowedOverridePaths: [],
    requiredGateProfileRefs: [],
    workloadBudget: generousBudget(),
  });
}

function createFileModeSession(input: {
  readonly worldId: string;
  readonly nowUnixMilliseconds: number;
  readonly lockEntries?: readonly RegistrySearchResultV1[];
}): AuthoringEditSessionV1 {
  const lockEntries = input.lockEntries ?? builtInRegistryLockEntriesV1();
  return {
    authoringEditSessionId: createCliId("session.cli"),
    authorizationEpoch: 1,
    isActive: true,
    expiresAtUnixMilliseconds: input.nowUnixMilliseconds + 86_400_000,
    scopes: FILE_MODE_SCOPES_V1,
    policy: createFileModePolicy(input.worldId, lockEntries),
    hasActiveRuntimeBinding: false,
  };
}

async function writeAtomicFile(
  outputPath: string,
  bytes: string,
): Promise<void> {
  const absoluteOutputPath = path.resolve(outputPath);
  await mkdir(path.dirname(absoluteOutputPath), { recursive: true });
  const temporaryPath = path.join(
    path.dirname(absoluteOutputPath),
    `.${path.basename(absoluteOutputPath)}.${process.pid}.${randomUUID()}.tmp`,
  );
  try {
    await writeFile(temporaryPath, bytes);
    await rename(temporaryPath, absoluteOutputPath);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

async function readJsonValue(
  inputPath: string,
): Promise<
  | { readonly ok: true; readonly absolutePath: string; readonly value: unknown }
  | AuthoringEditCliResultV1
> {
  const absolutePath = path.resolve(inputPath);
  let sourceText: string;
  try {
    sourceText = await readFile(absolutePath, "utf8");
  } catch (error) {
    return failure(
      "CLI_INPUT_UNAVAILABLE",
      `Unable to read input file '${absolutePath}'.`,
      { details: { cause: error instanceof Error ? error.message : String(error) } },
    );
  }
  const parsed = parseCanonicalJson(sourceText);
  if (!parsed.ok) {
    return {
      ok: false,
      exitCode: 2,
      kind: "worldkit-authoring-edit-command-result",
      schemaVersion: 1,
      diagnostics: parsed.diagnostics,
    };
  }
  return { ok: true, absolutePath, value: parsed.value };
}

async function readAuthoringSpec(
  inputPath: string,
): Promise<
  | { readonly ok: true; readonly absolutePath: string; readonly spec: AuthoringSpecV4 }
  | AuthoringEditCliResultV1
> {
  const absolutePath = path.resolve(inputPath);
  let sourceText: string;
  try {
    sourceText = await readFile(absolutePath, "utf8");
  } catch (error) {
    return failure(
      "CLI_INPUT_UNAVAILABLE",
      `Unable to read input file '${absolutePath}'.`,
      { details: { cause: error instanceof Error ? error.message : String(error) } },
    );
  }
  const parsed = parseAuthoringSpecV4(sourceText);
  if (!parsed.ok || isNil(parsed.value)) {
    return {
      ok: false,
      exitCode: 2,
      kind: "worldkit-authoring-edit-command-result",
      schemaVersion: 1,
      diagnostics: parsed.diagnostics,
    };
  }
  return { ok: true, absolutePath, spec: parsed.value };
}

function isWorldChangeSet(
  value: WorldChangeSetV1 | AuthoringEditCliResultV1,
): value is WorldChangeSetV1 {
  return value.kind === "worldkit-world-change-set";
}

function parseChangeSetValue(value: unknown): WorldChangeSetV1 | AuthoringEditCliResultV1 {
  try {
    return parseWorldChangeSetV1(value);
  } catch {
    return failure(
      "WORLD_CHANGE_SET_SCHEMA_INVALID",
      "ChangeSet is not a closed WorldChangeSetV1 document.",
    );
  }
}

function collectStaticConflicts(
  operations: readonly WorldChangeOperationV1[],
  worldId: string,
): {
  readonly operationIds: readonly string[];
  readonly targets: readonly WorldChangeTargetV1[];
} | undefined {
  const conflictingIds = new Set<string>();
  const targetsByKey = new Map<string, WorldChangeTargetV1>();
  operations.forEach((left, leftIndex) => {
    operations.slice(leftIndex + 1).forEach((right) => {
      if (!operationsConflict(left, right, worldId)) {
        return;
      }
      conflictingIds.add(left.id);
      conflictingIds.add(right.id);
      const leftTarget = operationPrimaryTarget(left, worldId);
      const rightTarget = operationPrimaryTarget(right, worldId);
      targetsByKey.set(targetOverlapKey(leftTarget), leftTarget);
      targetsByKey.set(targetOverlapKey(rightTarget), rightTarget);
    });
  });
  if (conflictingIds.size === 0) {
    return undefined;
  }
  return {
    operationIds: sortBy([...conflictingIds]),
    targets: [...targetsByKey.values()],
  };
}

function receiptFromSubmit(
  submitted: SubmitWorldChangeRequestResultV1,
): AuthoringEditCliResultV1 {
  if (submitted.status !== "accepted") {
    return failure(
      "CLI_AUTHORING_EDIT_JOURNAL_INCOMPLETE",
      "Durable WorldChange request did not reach a terminal Receipt.",
    );
  }
  const receipt = submitted.receipt;
  if (receipt.status === "rejected") {
    return {
      ok: false,
      exitCode: 2,
      kind: "worldkit-authoring-edit-command-result",
      schemaVersion: 1,
      diagnostics: receipt.diagnostics.map((diagnostic) => ({
        severity: diagnostic.severity,
        code: diagnostic.code,
        instancePath: diagnostic.instancePath,
        message: diagnostic.message,
        ...(isNil(diagnostic.details) ? {} : { details: diagnostic.details }),
      })),
      requestId: receipt.requestId,
      receipt,
    };
  }
  return success({ requestId: receipt.requestId, receipt });
}

async function submitFileModeRequest(input: {
  readonly spec: AuthoringSpecV4;
  readonly changeSet: WorldChangeSetV1;
  readonly mode: "dry-run" | "apply";
  readonly nowUnixMilliseconds: number;
}): Promise<
  | {
      readonly ok: true;
      readonly journal: WorldChangeJournalV1;
      readonly result: AuthoringEditCliResultV1;
    }
  | AuthoringEditCliResultV1
> {
  const lockEntries = builtInRegistryLockEntriesV1();
  const journal = createWorldChangeJournalV1();
  const leaseStore = createPreparedCandidateLeaseStoreV1();
  seedAuthoringRevisionHeadV1(journal, {
    worldId: input.spec.id,
    revisionRef: `revision://${input.spec.id}/1`,
    authoringSpec: input.spec,
    authoringSpecHash: hashAuthoringDocumentV4(input.spec) as Sha256HashV1,
  });
  const session = createFileModeSession({
    worldId: input.spec.id,
    nowUnixMilliseconds: input.nowUnixMilliseconds,
    lockEntries,
  });
  const request = parseWorldChangeRequestV1(
    input.mode === "dry-run"
      ? {
          kind: "worldkit-world-change-request",
          schemaVersion: 1,
          id: createCliId("request.dry-run"),
          authoringEditSessionId: session.authoringEditSessionId,
          worldId: input.spec.id,
          changeSet: input.changeSet,
          mode: "dry-run",
        }
      : {
          kind: "worldkit-world-change-request",
          schemaVersion: 1,
          id: createCliId("request.apply"),
          authoringEditSessionId: session.authoringEditSessionId,
          worldId: input.spec.id,
          changeSet: input.changeSet,
          mode: "apply",
          requestedOutcome: "authoring-only",
        },
  );
  const normalized = normalizeAuthoringSpecV4(input.spec);
  if (!normalized.ok || isNil(normalized.value)) {
    return failure(
      "CLI_AUTHORING_EDIT_WORLD_PACKAGE_INPUT_INVALID",
      "Unable to normalize the AuthoringSpec for WorldPackage publication.",
      { exitCode: 2 },
    );
  }
  const resourceArtifacts = await resolveTrustedWorldPackageResourceArtifactsV1(
    normalized.value,
  );
  const worldPackageBuildContext = createTrustedCanonicalWorldPackageBuildContextV1({
    title: `${input.spec.id} Authoring/Edit package`,
    resourceArtifacts,
  });
  const temporaryStoreRoot = await realpath(await mkdtemp(
    path.join(tmpdir(), "worldkit-authoring-edit-package-store-"),
  ));
  try {
    const submitted = await submitWorldChangeRequestV1({
      journal,
      leaseStore,
      worldPackageStore: createFileWorldPackageStoreV1({
        storeRootPath: temporaryStoreRoot,
        maximumTotalBytes: 512 * 1024 * 1024,
        maximumFileCount: 4_096,
      }),
      worldPackageBuildContext,
      resourceArtifacts,
      request,
      session,
      nowUnixMilliseconds: input.nowUnixMilliseconds,
    });
    return { ok: true, journal, result: receiptFromSubmit(submitted) };
  } finally {
    await rm(temporaryStoreRoot, { recursive: true, force: true });
  }
}

export function resolveAuthoringEditLivePortV1(options?: {
  readonly livePort?: AuthoringEditLivePortV1;
}): AuthoringEditLivePortV1 | AuthoringEditCliResultV1 {
  if (!isNil(options?.livePort)) {
    return options.livePort;
  }
  return failure(
    "CLI_AUTHORING_EDIT_LIVE_HOST_UNAVAILABLE",
    "Authoring/Edit live host is not available to this CLI process.",
    { exitCode: 1 },
  );
}

export function createInProcessAuthoringEditLivePortV1(input: {
  readonly journal: WorldChangeJournalV1;
  readonly leaseStore: PreparedCandidateLeaseStoreV1;
  readonly worldPackageStore: WorldPackageStoreV1;
  readonly worldPackageBuildContext: CanonicalWorldPackageBuildContextV1;
  readonly resourceArtifacts: readonly ResolvedCanonicalWorldPackageResourceArtifactV1[];
  readonly session: AuthoringEditSessionV1;
  readonly nowUnixMilliseconds: number;
}): AuthoringEditLivePortV1 {
  return {
    submit(request) {
      return submitWorldChangeRequestV1({
        journal: input.journal,
        leaseStore: input.leaseStore,
        worldPackageStore: input.worldPackageStore,
        worldPackageBuildContext: input.worldPackageBuildContext,
        resourceArtifacts: input.resourceArtifacts,
        request,
        session: input.session,
        nowUnixMilliseconds: input.nowUnixMilliseconds,
      });
    },
    queryReceipt(requestId) {
      return queryWorldChangeReceiptV1({
        journal: input.journal,
        session: input.session,
        query: parseWorldChangeReceiptQueryV1({
          kind: "worldkit-world-change-receipt-query",
          schemaVersion: 1,
          id: createCliId("q.receipt"),
          authoringEditSessionId: input.session.authoringEditSessionId,
          requestId,
        }),
        nowUnixMilliseconds: input.nowUnixMilliseconds,
      });
    },
    queryCleanup(cleanupOperationId) {
      return queryWorldChangeCleanupReportV1({
        journal: input.journal,
        session: input.session,
        query: parseWorldChangeCleanupReportQueryV1({
          kind: "worldkit-world-change-cleanup-report-query",
          schemaVersion: 1,
          id: createCliId("q.cleanup"),
          authoringEditSessionId: input.session.authoringEditSessionId,
          cleanupOperationId,
        }),
        nowUnixMilliseconds: input.nowUnixMilliseconds,
      });
    },
  };
}

export async function submitLiveWorldChangeV1(input: {
  readonly livePort: AuthoringEditLivePortV1;
  readonly request: WorldChangeRequestV1;
  readonly abortSignal?: AbortSignal;
}): Promise<AuthoringEditCliResultV1> {
  const disconnected = () =>
    failure(
      "CLI_AUTHORING_EDIT_TRANSPORT_DISCONNECTED",
      "Authoring/Edit live transport disconnected after the durable request was accepted.",
      { exitCode: 1, requestId: input.request.id },
    );
  if (input.abortSignal?.aborted === true) {
    return disconnected();
  }
  const submitPromise = input.livePort.submit(input.request).then((submitted) =>
    receiptFromSubmit(submitted),
  );
  if (isNil(input.abortSignal)) {
    return submitPromise;
  }
  let onAbort: (() => void) | undefined;
  const abortPromise = new Promise<AuthoringEditCliResultV1>((resolve) => {
    onAbort = () => {
      resolve(disconnected());
    };
    input.abortSignal?.addEventListener("abort", onAbort, { once: true });
  });
  try {
    return await Promise.race([submitPromise, abortPromise]);
  } finally {
    if (!isNil(onAbort)) {
      input.abortSignal.removeEventListener("abort", onAbort);
    }
  }
}

export async function runSchemaProjectV1(input: {
  readonly worldJsonPath: string;
  readonly profileRef: string;
  readonly outputPath: string;
}): Promise<AuthoringEditCliResultV1> {
  const world = await readAuthoringSpec(input.worldJsonPath);
  if (!("spec" in world)) {
    return world;
  }
  const resolved = builtInSubjectResourceRegistry.resolveAiSchemaProjectionProfile(
    input.profileRef,
  );
  if (isNil(resolved)) {
    return failure(
      "CLI_AI_SCHEMA_PROJECTION_PROFILE_UNKNOWN",
      `Unknown AI Schema projection profile: ${input.profileRef}.`,
    );
  }
  let projectionProfile;
  try {
    projectionProfile = parseAiSchemaProjectionProfileSourceV1(resolved);
  } catch {
    return failure(
      "CLI_AI_SCHEMA_PROJECTION_PROFILE_UNKNOWN",
      `Unknown AI Schema projection profile: ${input.profileRef}.`,
    );
  }
  const lockEntries = builtInRegistryLockEntriesV1();
  const session = createFileModeSession({
    worldId: world.spec.id,
    nowUnixMilliseconds: Date.now(),
    lockEntries,
  });
  const requestId = createCliId("request.project");
  const projected = projectAiSchemaV1({
    projectionId: createCliId("projection"),
    request: {
      kind: "worldkit-ai-schema-projection-request",
      schemaVersion: 1,
      id: requestId,
      authoringEditSessionId: session.authoringEditSessionId,
      projectionProfileRef: input.profileRef,
      authoringSchemaVersion: 4,
    },
    projectionProfile,
    canonicalAuthoringSchema,
    registryLockEntries: lockEntries,
    allowedCapabilityRefs: lockEntries
      .filter((entry) => entry.resourceKind === "capability")
      .map((entry) => entry.resourceRef),
    allowedWorldChangeOperationTypes: [...WORLD_CHANGE_OPERATION_TYPES_V1],
    includeExperimental: false,
  });
  if (projected.status !== "accepted") {
    return {
      ok: false,
      exitCode: 2,
      kind: "worldkit-authoring-edit-command-result",
      schemaVersion: 1,
      requestId,
      diagnostics: projected.diagnostics.map((diagnostic) => ({
        severity: diagnostic.severity,
        code: diagnostic.code,
        instancePath: diagnostic.instancePath,
        message: diagnostic.message,
        ...(isNil(diagnostic.details) ? {} : { details: diagnostic.details }),
      })),
    };
  }
  const outputPath = path.resolve(input.outputPath);
  try {
    await writeAtomicFile(outputPath, `${stringifyCanonicalJson(projected.projection)}\n`);
  } catch (error) {
    return failure(
      "CLI_OUTPUT_WRITE_FAILED",
      `Unable to write schema projection '${outputPath}'.`,
      {
        details: { cause: error instanceof Error ? error.message : String(error) },
        requestId,
      },
    );
  }
  return success({
    requestId,
    outputPath,
    projection: projected.projection,
  });
}

export async function runRegistrySearchV1(input: {
  readonly lockPath: string;
  readonly resourceKind: RegistryResourceKindV1;
  readonly semanticTags?: readonly string[];
  readonly afterResourceRef?: string;
  readonly limit?: number;
}): Promise<AuthoringEditCliResultV1> {
  const lockFile = await readJsonValue(input.lockPath);
  if (!("value" in lockFile)) {
    return lockFile;
  }
  if (!isPlainObject(lockFile.value)) {
    return failure(
      "REGISTRY_SEARCH_LOCK_MISMATCH",
      "Registry Lock is not a closed worldkit-registry-lock document.",
    );
  }
  const record = lockFile.value as Readonly<Record<string, unknown>>;
  if (
    record.kind !== "worldkit-registry-lock" ||
    record.schemaVersion !== 1 ||
    !Array.isArray(record.entries)
  ) {
    return failure(
      "REGISTRY_SEARCH_LOCK_MISMATCH",
      "Registry Lock is not a closed worldkit-registry-lock document.",
    );
  }
  let lockEntries: readonly RegistrySearchResultV1[];
  try {
    lockEntries = canonicalizeRegistryLockEntriesV1(record.entries);
  } catch {
    return failure(
      "REGISTRY_SEARCH_LOCK_MISMATCH",
      "Registry Lock entries are not a closed unique resource set.",
    );
  }
  const profile = builtInSubjectResourceRegistry.resolveAiSchemaProjectionProfile(
    CONSTRAINED_JSON_PROFILE_REF,
  );
  if (isNil(profile)) {
    return failure(
      "CLI_AI_SCHEMA_PROJECTION_PROFILE_UNKNOWN",
      `Unknown AI Schema projection profile: ${CONSTRAINED_JSON_PROFILE_REF}.`,
    );
  }
  const projectionProfile = parseAiSchemaProjectionProfileSourceV1(profile);
  const requestId = createCliId("request.search");
  const searched = searchRegistryV1({
    receiptId: createCliId("search.receipt"),
    request: {
      kind: "worldkit-registry-search-request",
      schemaVersion: 1,
      id: requestId,
      authoringEditSessionId: createCliId("session.cli"),
      registryLockHash: hashRegistryLockEntriesV1(lockEntries),
      resourceKind: input.resourceKind,
      maximumResultCount: input.limit ?? projectionProfile.maximumRegistrySearchResultCount,
      ...(!isNil(input.semanticTags) && !isEmpty(input.semanticTags)
        ? { semanticTagsAll: [...input.semanticTags] }
        : {}),
      ...(!isNil(input.afterResourceRef) && !isEmpty(input.afterResourceRef)
        ? { afterResourceRef: input.afterResourceRef }
        : {}),
    },
    projectionProfile,
    registryLockEntries: lockEntries,
    allowedCapabilityRefs: lockEntries
      .filter((entry) => entry.resourceKind === "capability")
      .map((entry) => entry.resourceRef),
    includeExperimental: false,
  });
  if (searched.status !== "accepted") {
    return {
      ok: false,
      exitCode: 2,
      kind: "worldkit-authoring-edit-command-result",
      schemaVersion: 1,
      requestId,
      diagnostics: searched.diagnostics.map((diagnostic) => ({
        severity: diagnostic.severity,
        code: diagnostic.code,
        instancePath: diagnostic.instancePath,
        message: diagnostic.message,
        ...(isNil(diagnostic.details) ? {} : { details: diagnostic.details }),
      })),
    };
  }
  return success({ requestId, searchReceipt: searched.receipt });
}

export async function runChangeValidateV1(input: {
  readonly changeSetPath: string;
}): Promise<AuthoringEditCliResultV1> {
  const loaded = await readJsonValue(input.changeSetPath);
  if (!("value" in loaded)) {
    return loaded;
  }
  const changeSet = parseChangeSetValue(loaded.value);
  if (!isWorldChangeSet(changeSet)) {
    return changeSet;
  }
  const nowUnixMilliseconds = Date.now();
  const session = createFileModeSession({
    worldId: FILE_MODE_VALIDATE_WORLD_ID,
    nowUnixMilliseconds,
  });
  const request = parseWorldChangeRequestV1({
    kind: "worldkit-world-change-request",
    schemaVersion: 1,
    id: createCliId("request.validate"),
    authoringEditSessionId: session.authoringEditSessionId,
    worldId: FILE_MODE_VALIDATE_WORLD_ID,
    changeSet,
    mode: "validate",
  });
  const requestHash = hashWorldChangeRequestV1(request);
  const changeSetHash = hashWorldChangeSetV1(changeSet);
  const authoringEditPolicyHash = hashAuthoringEditPolicyProjectionV1(session.policy);
  const conflict = collectStaticConflicts(changeSet.operations, FILE_MODE_VALIDATE_WORLD_ID);
  const receipt = parseWorldChangeReceiptV1(
    isNil(conflict)
      ? {
          kind: "worldkit-world-change-receipt",
          schemaVersion: 1,
          id: journalArtifactIdV1("receipt", request.id),
          requestId: request.id,
          requestHash,
          authoringEditSessionId: session.authoringEditSessionId,
          authoringEditPolicyHash,
          worldId: FILE_MODE_VALIDATE_WORLD_ID,
          changeSetId: changeSet.id,
          changeSetHash,
          baseAuthoringSpecHash: changeSet.baseAuthoringSpecHash,
          diagnostics: [],
          status: "validated",
          mode: "validate",
          publicationMode: "none",
        }
      : {
          kind: "worldkit-world-change-receipt",
          schemaVersion: 1,
          id: journalArtifactIdV1("receipt", request.id),
          requestId: request.id,
          requestHash,
          authoringEditSessionId: session.authoringEditSessionId,
          authoringEditPolicyHash,
          worldId: FILE_MODE_VALIDATE_WORLD_ID,
          changeSetId: changeSet.id,
          changeSetHash,
          baseAuthoringSpecHash: changeSet.baseAuthoringSpecHash,
          diagnostics: [
            parseWorldChangeDiagnosticV1({
              severity: "error",
              code: "WORLD_CHANGE_TARGET_CONFLICT",
              instancePath: "/operations",
              message: `Operations [${conflict.operationIds.join(", ")}] write overlapping Canonical targets.`,
              details: { kind: "target-conflict", targets: conflict.targets },
            }),
          ],
          status: "rejected",
          mode: "validate",
          publicationMode: "none",
          failurePhase: "candidate-apply",
        },
  );
  if (receipt.status === "rejected") {
    return {
      ok: false,
      exitCode: 2,
      kind: "worldkit-authoring-edit-command-result",
      schemaVersion: 1,
      diagnostics: receipt.diagnostics.map((diagnostic) => ({
        severity: diagnostic.severity,
        code: diagnostic.code,
        instancePath: diagnostic.instancePath,
        message: diagnostic.message,
        ...(isNil(diagnostic.details) ? {} : { details: diagnostic.details }),
      })),
      requestId: receipt.requestId,
      receipt,
    };
  }
  return success({ requestId: receipt.requestId, receipt });
}

async function writeDryRunDirectory(input: {
  readonly outputPath: string;
  readonly receipt: WorldChangeReceiptV1;
  readonly spec?: AuthoringSpecV4;
  readonly changeSet?: WorldChangeSetV1;
}): Promise<AuthoringEditCliResultV1> {
  const targetDirectory = path.resolve(input.outputPath);
  const temporaryDirectory = path.join(
    path.dirname(targetDirectory),
    `.${path.basename(targetDirectory)}.${process.pid}.${randomUUID()}.tmp`,
  );
  const successWrite =
    input.receipt.status === "succeeded" &&
    !isNil(input.spec) &&
    !isNil(input.changeSet);
  const expectedFilenames = successWrite
    ? DRY_RUN_SUCCESS_FILENAMES
    : DRY_RUN_FAILURE_FILENAMES;
  try {
    await mkdir(temporaryDirectory, { recursive: true });
    await writeFile(
      path.join(temporaryDirectory, "world-change-receipt.json"),
      `${stringifyCanonicalJson(input.receipt)}\n`,
    );
    if (successWrite && !isNil(input.spec) && !isNil(input.changeSet)) {
      const applied = applyWorldChangeSetV1({
        baseAuthoringSpec: input.spec,
        changeSet: input.changeSet,
        workloadBudget: generousBudget(),
      });
      if (!isAppliedWorldChangeSetResultV1(applied)) {
        await rm(temporaryDirectory, { recursive: true, force: true });
        return failure(
          "WORLD_CHANGE_CANDIDATE_INVALID",
          "Dry Run Receipt succeeded but the isolated candidate could not be reconstructed.",
          { requestId: input.receipt.requestId, receipt: input.receipt },
        );
      }
      await writeFile(
        path.join(temporaryDirectory, "candidate-authoring.json"),
        `${stringifyCanonicalJson(applied.candidateAuthoringSpec)}\n`,
      );
      await writeFile(
        path.join(temporaryDirectory, "world-change-diff.json"),
        `${stringifyCanonicalJson(assembleWorldChangeDiffV1({
          id: journalArtifactIdV1("diff", input.receipt.requestId),
          requestId: input.receipt.requestId,
          applied,
        }))}\n`,
      );
    }
    await promoteArtifactDirectory({
      temporaryDirectory,
      targetDirectory,
      expectedFilenames,
    });
  } catch (error) {
    await rm(temporaryDirectory, { recursive: true, force: true });
    return failure(
      "CLI_OUTPUT_WRITE_FAILED",
      `Unable to write Dry Run candidate directory '${targetDirectory}'.`,
      {
        details: { cause: error instanceof Error ? error.message : String(error) },
        requestId: input.receipt.requestId,
        receipt: input.receipt,
      },
    );
  }
  const resultBase = {
    requestId: input.receipt.requestId,
    outputPath: targetDirectory,
    receipt: input.receipt,
  };
  if (input.receipt.status === "rejected") {
    return {
      ok: false,
      exitCode: 2,
      kind: "worldkit-authoring-edit-command-result",
      schemaVersion: 1,
      diagnostics: input.receipt.diagnostics.map((diagnostic) => ({
        severity: diagnostic.severity,
        code: diagnostic.code,
        instancePath: diagnostic.instancePath,
        message: diagnostic.message,
        ...(isNil(diagnostic.details) ? {} : { details: diagnostic.details }),
      })),
      ...resultBase,
    };
  }
  return success(resultBase);
}

export async function runChangeDryRunV1(input: {
  readonly worldJsonPath: string;
  readonly changeSetPath: string;
  readonly outputPath: string;
}): Promise<AuthoringEditCliResultV1> {
  const world = await readAuthoringSpec(input.worldJsonPath);
  if (!("spec" in world)) {
    return world;
  }
  const loaded = await readJsonValue(input.changeSetPath);
  if (!("value" in loaded)) {
    return loaded;
  }
  const changeSet = parseChangeSetValue(loaded.value);
  if (!isWorldChangeSet(changeSet)) {
    return changeSet;
  }
  const submitted = await submitFileModeRequest({
    spec: world.spec,
    changeSet,
    mode: "dry-run",
    nowUnixMilliseconds: Date.now(),
  });
  if (!("journal" in submitted)) {
    return submitted;
  }
  if (isNil(submitted.result.receipt)) {
    return submitted.result;
  }
  return writeDryRunDirectory({
    outputPath: input.outputPath,
    receipt: submitted.result.receipt,
    spec: world.spec,
    changeSet,
  });
}

export async function runChangeApplyV1(input: {
  readonly worldJsonPath: string;
  readonly changeSetPath: string;
  readonly outputPath: string;
  readonly receiptPath: string;
}): Promise<AuthoringEditCliResultV1> {
  const world = await readAuthoringSpec(input.worldJsonPath);
  if (!("spec" in world)) {
    return world;
  }
  const outputPath = path.resolve(input.outputPath);
  const receiptPath = path.resolve(input.receiptPath);
  if (outputPath === world.absolutePath) {
    return failure(
      "CLI_OUTPUT_OVERWRITES_INPUT",
      "Change apply output must not overwrite the AuthoringSpec input.",
    );
  }
  const loaded = await readJsonValue(input.changeSetPath);
  if (!("value" in loaded)) {
    return loaded;
  }
  const changeSet = parseChangeSetValue(loaded.value);
  if (!isWorldChangeSet(changeSet)) {
    return changeSet;
  }
  const submitted = await submitFileModeRequest({
    spec: world.spec,
    changeSet,
    mode: "apply",
    nowUnixMilliseconds: Date.now(),
  });
  if (!("journal" in submitted)) {
    return submitted;
  }
  const receipt = submitted.result.receipt;
  if (isNil(receipt)) {
    return submitted.result;
  }
  if (receipt.status !== "committed" || receipt.publicationMode !== "none") {
    try {
      await writeAtomicFile(receiptPath, `${stringifyCanonicalJson(receipt)}\n`);
    } catch (error) {
      return failure(
        "CLI_OUTPUT_WRITE_FAILED",
        `Unable to write WorldChange Receipt '${receiptPath}'.`,
        {
          details: { cause: error instanceof Error ? error.message : String(error) },
          requestId: receipt.requestId,
          receipt,
        },
      );
    }
    return {
      ...submitted.result,
      receiptPath,
    };
  }
  const head = getAuthoringRevisionHeadV1(submitted.journal, world.spec.id);
  if (isNil(head)) {
    return failure(
      "WORLD_CHANGE_CANDIDATE_INVALID",
      "Authoring-only Apply committed without a revision head.",
      { requestId: receipt.requestId, receipt },
    );
  }
  try {
    await writeAtomicFile(outputPath, `${stringifyCanonicalJson(head.authoringSpec)}\n`);
    await writeAtomicFile(receiptPath, `${stringifyCanonicalJson(receipt)}\n`);
  } catch (error) {
    return failure(
      "CLI_OUTPUT_WRITE_FAILED",
      `Unable to write Apply artifacts '${outputPath}'.`,
      {
        details: { cause: error instanceof Error ? error.message : String(error) },
        requestId: receipt.requestId,
        receipt,
      },
    );
  }
  return success({
    requestId: receipt.requestId,
    outputPath,
    receiptPath,
    receipt,
  });
}

function receiptHasCandidateFields(
  receipt: WorldChangeReceiptV1,
): receipt is Extract<WorldChangeReceiptV1, { status: "succeeded" | "committed" }> {
  return receipt.status === "succeeded" || receipt.status === "committed";
}

export async function runChangeDiffV1(input: {
  readonly receiptPath: string;
}): Promise<AuthoringEditCliResultV1> {
  const loaded = await readJsonValue(input.receiptPath);
  if (!("value" in loaded)) {
    return loaded;
  }
  let receipt: WorldChangeReceiptV1;
  try {
    receipt = parseWorldChangeReceiptV1(loaded.value);
  } catch {
    return failure(
      "CLI_WORLD_CHANGE_RECEIPT_INVALID",
      "Receipt is not a closed WorldChangeReceiptV1 document.",
    );
  }
  if (!receiptHasCandidateFields(receipt)) {
    return failure(
      "CLI_WORLD_CHANGE_DIFF_UNAVAILABLE",
      "WorldChange Diff requires a succeeded Dry Run or committed Apply Receipt.",
      { requestId: receipt.requestId, receipt },
    );
  }
  const changes = receipt.operationResults.map((operation, index) => {
    const type =
      isNil(operation.previousTargetHash)
        ? "added"
        : isNil(operation.currentTargetHash)
          ? "removed"
          : "replaced";
    return {
      id: `chg.${index}`,
      type,
      target: operation.target,
      ...(isNil(operation.previousTargetHash)
        ? {}
        : { previousTargetHash: operation.previousTargetHash }),
      ...(isNil(operation.currentTargetHash)
        ? {}
        : { currentTargetHash: operation.currentTargetHash }),
    };
  });
  const diff = parseWorldChangeDiffV1({
    kind: "worldkit-world-change-diff",
    schemaVersion: 1,
    id: journalArtifactIdV1("diff", receipt.requestId),
    requestId: receipt.requestId,
    baseAuthoringSpecHash: receipt.baseAuthoringSpecHash,
    resultAuthoringSpecHash: receipt.buildIdentity.resultAuthoringSpecHash,
    changes,
  });
  return success({ requestId: receipt.requestId, receipt, diff });
}

export async function runChangeExplainV1(input: {
  readonly receiptPath: string;
  readonly operationId?: string;
  readonly diagnosticCode?: string;
}): Promise<AuthoringEditCliResultV1> {
  const loaded = await readJsonValue(input.receiptPath);
  if (!("value" in loaded)) {
    return loaded;
  }
  let receipt: WorldChangeReceiptV1;
  try {
    receipt = parseWorldChangeReceiptV1(loaded.value);
  } catch {
    return failure(
      "CLI_WORLD_CHANGE_RECEIPT_INVALID",
      "Receipt is not a closed WorldChangeReceiptV1 document.",
    );
  }
  const explanations: WorldChangeExplainV1["explanations"][number][] = [];
  if (receiptHasCandidateFields(receipt) && isNil(input.diagnosticCode)) {
    for (const operation of receipt.operationResults) {
      if (!isNil(input.operationId) && operation.operationId !== input.operationId) {
        continue;
      }
      const relatedIds = [operation.operationId];
      if (operation.target.kind === "resource") relatedIds.push(operation.target.resourceId);
      if (operation.target.kind === "node") relatedIds.push(operation.target.nodeEntityId);
      if (operation.target.kind === "spatial-feature") {
        relatedIds.push(operation.target.spatialFeatureId);
      }
      if (operation.target.kind === "relationship") {
        relatedIds.push(operation.target.relationshipId);
      }
      if (operation.target.kind === "constraint") relatedIds.push(operation.target.constraintId);
      if (operation.target.kind === "definition-override") {
        relatedIds.push(operation.target.nodeEntityId, operation.target.overrideId);
      }
      if (operation.target.kind === "startup") relatedIds.push(operation.target.worldId);
      explanations.push({
        id: journalArtifactIdV1("e", operation.operationId),
        type: "operation-effect",
        message: `Operation '${operation.operationId}' applied ${operation.operationType}.`,
        relatedIds: [...new Set(relatedIds)],
      });
    }
  }
  if (isNil(input.operationId) && (receipt.mode === "dry-run" || receipt.mode === "apply")) {
    explanations.push({
      id: "e.publication",
      type: "publication-selection",
      message:
        receipt.mode === "dry-run"
          ? "Dry Run prepared an isolated candidate without advancing the revision head."
          : receipt.mode === "apply" &&
              receipt.status === "committed" &&
              receipt.requestedOutcome === "publish-runtime"
            ? "Full Reload Runtime publication committed a new WorldSession at tick 0."
            : "Authoring-only commit; Runtime publication is owned by RuntimeHost publication V2.",
      relatedIds: [],
    });
  }
  if (isNil(input.operationId)) {
    receipt.diagnostics.forEach((diagnostic, index) => {
      if (!isNil(input.diagnosticCode) && diagnostic.code !== input.diagnosticCode) {
        return;
      }
      explanations.push({
        id: `e.diag.${String(index + 1).padStart(3, "0")}`,
        type: "conflict",
        message: diagnostic.message,
        relatedIds:
          diagnostic.details?.kind === "related-ids" ? [...diagnostic.details.ids] : [],
      });
    });
  }
  const explain = parseWorldChangeExplainV1({
    kind: "worldkit-world-change-explain",
    schemaVersion: 1,
    id: journalArtifactIdV1("explain", receipt.requestId),
    requestId: receipt.requestId,
    explanations,
  });
  return success({ requestId: receipt.requestId, receipt, explain });
}

export async function runChangeReceiptV1(input: {
  readonly requestId: string;
  readonly connectionProfilePath?: string;
  readonly livePort?: AuthoringEditLivePortV1;
}): Promise<AuthoringEditCliResultV1> {
  if (!isNil(input.connectionProfilePath)) {
    const loaded = await readJsonValue(input.connectionProfilePath);
    if (!("value" in loaded)) {
      return loaded;
    }
    try {
      parseAuthoringEditConnectionProfileV1(loaded.value);
    } catch (error) {
      return failure(
        "CLI_AUTHORING_EDIT_CONNECTION_PROFILE_INVALID",
        error instanceof Error ? error.message : String(error),
        { exitCode: 1 },
      );
    }
  }
  const livePort = resolveAuthoringEditLivePortV1(input);
  if (!("submit" in livePort)) {
    return livePort;
  }
  const queried = livePort.queryReceipt(input.requestId);
  if (queried.status === "found") {
    return success({ requestId: input.requestId, receipt: queried.receipt });
  }
  if (queried.status === "pending") {
    return failure(
      "CLI_AUTHORING_EDIT_RECEIPT_PENDING",
      "Durable WorldChange request has not reached a terminal Receipt.",
      { requestId: input.requestId },
    );
  }
  if (queried.status === "rejected") {
    return {
      ok: false,
      exitCode: 2,
      kind: "worldkit-authoring-edit-command-result",
      schemaVersion: 1,
      requestId: input.requestId,
      diagnostics: queried.diagnostics.map((diagnostic) => ({
        severity: diagnostic.severity,
        code: diagnostic.code,
        instancePath: diagnostic.instancePath,
        message: diagnostic.message,
        ...(isNil(diagnostic.details) ? {} : { details: diagnostic.details }),
      })),
    };
  }
  return failure(
    "CLI_AUTHORING_EDIT_RECEIPT_MISSING",
    "No durable WorldChange Receipt exists for this Request ID.",
    { requestId: input.requestId },
  );
}

export async function runChangeCleanupV1(input: {
  readonly cleanupOperationId: string;
  readonly connectionProfilePath?: string;
  readonly livePort?: AuthoringEditLivePortV1;
}): Promise<AuthoringEditCliResultV1> {
  if (!isNil(input.connectionProfilePath)) {
    const loaded = await readJsonValue(input.connectionProfilePath);
    if (!("value" in loaded)) {
      return loaded;
    }
    try {
      parseAuthoringEditConnectionProfileV1(loaded.value);
    } catch (error) {
      return failure(
        "CLI_AUTHORING_EDIT_CONNECTION_PROFILE_INVALID",
        error instanceof Error ? error.message : String(error),
        { exitCode: 1 },
      );
    }
  }
  const livePort = resolveAuthoringEditLivePortV1(input);
  if (!("submit" in livePort)) {
    return livePort;
  }
  const queried = livePort.queryCleanup(input.cleanupOperationId);
  if (queried.status === "found") {
    return success({ cleanupReport: queried.report });
  }
  if (queried.status === "rejected") {
    return {
      ok: false,
      exitCode: 2,
      kind: "worldkit-authoring-edit-command-result",
      schemaVersion: 1,
      diagnostics: queried.diagnostics.map((diagnostic) => ({
        severity: diagnostic.severity,
        code: diagnostic.code,
        instancePath: diagnostic.instancePath,
        message: diagnostic.message,
        ...(isNil(diagnostic.details) ? {} : { details: diagnostic.details }),
      })),
    };
  }
  return failure(
    "CLI_AUTHORING_EDIT_CLEANUP_MISSING",
    "No WorldChange Cleanup Report exists for this cleanup operation.",
  );
}
