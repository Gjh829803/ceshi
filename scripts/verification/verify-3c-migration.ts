import { execFile } from "node:child_process";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const execFileAsync = promisify(execFile);

export const GOLDEN_3C_BASELINE_COMMIT = "6d9e0304016448231ca05aa2f20e4b6ef7e7bd88";
export const GOLDEN_3C_LEDGER_GENESIS_COMMIT = "44be0f50a3cfc2cbe2c7c4e2a377690d00955280";
export const GOLDEN_3C_LEDGER_GENESIS_PARENT = "387551a9f722d1ec2791654dac5bb4745103a01a";
export const GOLDEN_3C_COMPLETION_EVIDENCE_ROOTS_V1 = Object.freeze(["docs/reviews/", "artifacts/"] as const);
export const GOLDEN_3C_SOURCE_POLICY_V1 = Object.freeze({
  executableExtensions: Object.freeze([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"]),
  excludedPathPrefixes: Object.freeze([
    ".git/", ".diversion/", "node_modules/", "docs/", "config/", ".superpowers/", "artifacts/",
    "apps/playground/dist/",
    "scripts/verification/verify-3c-migration.ts",
  ]),
  excludedFileSuffixes: Object.freeze([
    ".test.ts", ".test.tsx", ".test.mts", ".test.cts", ".test.js", ".test.jsx",
    ".test.mjs", ".test.cjs", ".spec.ts", ".spec.tsx", ".d.ts", ".d.mts",
  ]),
});
const PRE_BUILD_OUTPUT_3C_SOURCE_POLICY_V1 = Object.freeze({
  ...GOLDEN_3C_SOURCE_POLICY_V1,
  excludedPathPrefixes: Object.freeze([
    ".git/", ".diversion/", "node_modules/", "docs/", "config/", ".superpowers/", "artifacts/",
    "scripts/verification/verify-3c-migration.ts",
  ]),
});
const LEGACY_GOLDEN_3C_SOURCE_POLICY_V1 = Object.freeze({
  ...GOLDEN_3C_SOURCE_POLICY_V1,
  excludedPathPrefixes: Object.freeze([
    ".git/", "node_modules/", "docs/", "config/", ".superpowers/", "artifacts/",
    "scripts/verify-3c-migration.ts",
  ]),
});

export const GOLDEN_3C_DIVERSION_GENESIS_PARENT = "dv.commit.1";

export const GOLDEN_3C_BASELINE_COUNTS_V1 = Object.freeze({
  MotionKernelRuntimeV1: 6,
  GroundAwarePhysicsCharacterController: 3,
  resolveGroundHumanoidAction: 5,
  resolveCharacterStateV1: 5,
  activeMotionKernelRef: 32,
  CameraContextSampleV1: 7,
  LocomotionCapabilityStateV1: 3,
  MotionKernelSnapshotV1: 4,
  RetainedCharacterSupportSampleV1: 7,
  MotionKernelLiveLockStateV1: 7,
  SubjectMotionSampleV1: 2,
} as const);

export const GOLDEN_3C_REQUIRED_LEGACY_SYMBOLS_V1 = Object.freeze(
  Object.keys(GOLDEN_3C_BASELINE_COUNTS_V1),
);

const TARGET_OWNERS = new Set([
  "@whitebox-world/gameplay-contracts", "@whitebox-world/subject-actions",
  "@whitebox-world/character-movement", "@whitebox-world/camera",
  "@whitebox-world/runtime-host", "@whitebox-world/runtime-babylon",
]);

type MigrationStateV1 = "live" | "migrating" | "completed";
interface SourcePolicyV1 {
  readonly executableExtensions: readonly string[];
  readonly excludedPathPrefixes: readonly string[];
  readonly excludedFileSuffixes: readonly string[];
}
interface MigrationEntryV1 {
  readonly id: string;
  readonly legacySymbol: string;
  readonly legacyModulePaths: readonly string[];
  readonly targetOwner: string;
  readonly dependsOn: readonly string[];
  readonly deletionCondition: string;
  readonly state: MigrationStateV1;
  readonly baselineSourceReferenceCount: number;
  readonly currentSourceReferenceCeiling: number;
  readonly evidence: readonly string[];
}
interface MigrationLedgerV1 {
  readonly schemaVersion: 2;
  readonly baselineCommit: string;
  readonly sourcePolicy: SourcePolicyV1;
  readonly entries: readonly MigrationEntryV1[];
}
export interface CompletionEvidenceV1 {
  readonly schemaVersion: 1;
  readonly command: string;
  readonly artifact: string;
}
export interface Verify3cMigrationOptionsV1 {
  readonly repositoryRoot: string;
  readonly ledger: unknown;
  readonly priorLedger?: unknown;
  readonly allowGenesis?: boolean;
  readonly requiredLegacySymbols?: readonly string[];
  readonly sourceFilePaths?: readonly string[];
}

function fail(code: string, detail: string): never {
  throw new Error(`${code}: ${detail}`);
}
function record(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const prototype = Reflect.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return undefined;
  const result = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (typeof key !== "string" || descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) return undefined;
    result[key] = descriptor.value;
  }
  return result;
}
function exact(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Reflect.ownKeys(value);
  return actual.length === keys.length && actual.every((key) => typeof key === "string" && keys.includes(key));
}
function denseArray(value: unknown): readonly unknown[] | undefined {
  if (!Array.isArray(value) || Reflect.getPrototypeOf(value) !== Array.prototype) return undefined;
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key === "symbol") || keys.length !== value.length + 1) return undefined;
  const result: unknown[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) return undefined;
    result.push(descriptor.value);
  }
  return result;
}
function strings(value: unknown): readonly string[] | undefined {
  const values = denseArray(value);
  return values !== undefined && values.every((item) => typeof item === "string" && item.length > 0)
    ? values as readonly string[]
    : undefined;
}
function sameStrings(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

export function parse3cCompletionEvidenceV1(input: string): CompletionEvidenceV1 | undefined {
  const match = /^completion:v1\|command=([^|\r\n]+)\|artifact=([^|\r\n]+)$/.exec(input);
  if (match === null) return undefined;
  const command = match[1]!;
  const artifact = match[2]!;
  if (command.trim() !== command || command.length === 0 || artifact.includes("\\") ||
    path.posix.isAbsolute(artifact) || /^[A-Za-z]:\//.test(artifact) ||
    path.posix.normalize(artifact) !== artifact || artifact.split("/").some((segment) =>
      segment === "" || segment === "." || segment === ".."
    ) || !GOLDEN_3C_COMPLETION_EVIDENCE_ROOTS_V1.some((root) => artifact.startsWith(root))) {
    return undefined;
  }
  return Object.freeze({ schemaVersion: 1, command, artifact });
}

interface ResolvedCompletionEvidenceArtifactV1 {
  readonly canonicalArtifact: string;
  readonly physicalKey: string;
}

async function resolveCompletionEvidenceArtifact(
  repositoryRoot: string,
  evidence: CompletionEvidenceV1,
  legacySymbol: string,
): Promise<ResolvedCompletionEvidenceArtifactV1> {
  try {
    const repositoryRealPath = await realpath(repositoryRoot);
    const repositoryRootPath = path.resolve(repositoryRoot);
    const repositoryRootStat = await lstat(repositoryRootPath);
    if (repositoryRootStat.isSymbolicLink() || !repositoryRootStat.isDirectory()) {
      fail("3C_MIGRATION_COMPLETION_ARTIFACT_INVALID", `${legacySymbol}: ${evidence.artifact}`);
    }
    const approvedRoot = GOLDEN_3C_COMPLETION_EVIDENCE_ROOTS_V1.find((root) =>
      evidence.artifact.startsWith(root)
    );
    if (approvedRoot === undefined) {
      fail("3C_MIGRATION_COMPLETION_ARTIFACT_INVALID", `${legacySymbol}: ${evidence.artifact}`);
    }
    let approvedRootPath = repositoryRootPath;
    for (const component of approvedRoot.slice(0, -1).split("/")) {
      approvedRootPath = path.join(approvedRootPath, component);
      const componentStat = await lstat(approvedRootPath);
      if (componentStat.isSymbolicLink() || !componentStat.isDirectory()) {
        fail("3C_MIGRATION_COMPLETION_ARTIFACT_INVALID", `${legacySymbol}: ${evidence.artifact}`);
      }
    }
    const approvedRootRealPath = await realpath(approvedRootPath);
    const rootRelative = path.relative(repositoryRealPath, approvedRootRealPath);
    if (rootRelative === "" || rootRelative.startsWith(`..${path.sep}`) || path.isAbsolute(rootRelative)) {
      fail("3C_MIGRATION_COMPLETION_ARTIFACT_INVALID", `${legacySymbol}: ${evidence.artifact}`);
    }
    const components = evidence.artifact.slice(approvedRoot.length).split("/");
    let artifactPath = approvedRootPath;
    for (const [index, component] of components.entries()) {
      artifactPath = path.join(artifactPath, component);
      const componentStat = await lstat(artifactPath);
      if (componentStat.isSymbolicLink() ||
        (index < components.length - 1 && !componentStat.isDirectory()) ||
        (index === components.length - 1 && (!componentStat.isFile() || componentStat.size === 0))) {
        fail("3C_MIGRATION_COMPLETION_ARTIFACT_INVALID", `${legacySymbol}: ${evidence.artifact}`);
      }
    }
    const artifactRealPath = await realpath(artifactPath);
    const approvedRelative = path.relative(approvedRootRealPath, artifactRealPath);
    if (approvedRelative === "" || approvedRelative.startsWith(`..${path.sep}`) || path.isAbsolute(approvedRelative)) {
      fail("3C_MIGRATION_COMPLETION_ARTIFACT_INVALID", `${legacySymbol}: ${evidence.artifact}`);
    }
    const canonicalArtifact = path.relative(repositoryRealPath, artifactRealPath).replaceAll(path.sep, "/");
    const normalizedPhysicalPath = artifactRealPath.replaceAll(path.sep, "/");
    return Object.freeze({
      canonicalArtifact,
      physicalKey: process.platform === "win32" ? normalizedPhysicalPath.toLowerCase() : normalizedPhysicalPath,
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("3C_MIGRATION_")) throw error;
    fail("3C_MIGRATION_COMPLETION_ARTIFACT_INVALID", `${legacySymbol}: ${evidence.artifact}`);
  }
}

function assertCanonicalCompletionArtifactSpelling(
  evidence: CompletionEvidenceV1,
  resolved: ResolvedCompletionEvidenceArtifactV1,
  legacySymbol: string,
): void {
  if (evidence.artifact !== resolved.canonicalArtifact) {
    fail("3C_MIGRATION_COMPLETION_ARTIFACT_INVALID", `${legacySymbol}: ${evidence.artifact}`);
  }
}
function parseLedger(input: unknown): MigrationLedgerV1 {
  const root = record(input);
  if (root === undefined || !exact(root, ["schemaVersion", "baselineCommit", "sourcePolicy", "entries"]) ||
    root.schemaVersion !== 2 || root.baselineCommit !== GOLDEN_3C_BASELINE_COMMIT) {
    fail("3C_MIGRATION_LEDGER_INVALID", "root must be the exact frozen version 2 ledger shape");
  }
  const policy = record(root.sourcePolicy);
  const executableExtensions = policy === undefined ? undefined : strings(policy.executableExtensions);
  const excludedPathPrefixes = policy === undefined ? undefined : strings(policy.excludedPathPrefixes);
  const excludedFileSuffixes = policy === undefined ? undefined : strings(policy.excludedFileSuffixes);
  const policyMatches = (
    candidate: typeof GOLDEN_3C_SOURCE_POLICY_V1,
  ): boolean =>
    executableExtensions !== undefined &&
    excludedPathPrefixes !== undefined &&
    excludedFileSuffixes !== undefined &&
    sameStrings(executableExtensions, candidate.executableExtensions) &&
    sameStrings(excludedPathPrefixes, candidate.excludedPathPrefixes) &&
    sameStrings(excludedFileSuffixes, candidate.excludedFileSuffixes);
  if (policy === undefined || !exact(policy, ["executableExtensions", "excludedPathPrefixes", "excludedFileSuffixes"]) ||
    executableExtensions === undefined || excludedPathPrefixes === undefined || excludedFileSuffixes === undefined ||
    (!policyMatches(GOLDEN_3C_SOURCE_POLICY_V1) &&
      !policyMatches(PRE_BUILD_OUTPUT_3C_SOURCE_POLICY_V1) &&
      !policyMatches(LEGACY_GOLDEN_3C_SOURCE_POLICY_V1))) {
    fail("3C_MIGRATION_LEDGER_INVALID", "source policy must equal the frozen production census policy");
  }
  const entryValues = denseArray(root.entries);
  if (entryValues === undefined) fail("3C_MIGRATION_LEDGER_INVALID", "entries must be a dense ordinary array");
  const ids = new Set<string>();
  const symbols = new Set<string>();
  const entries = entryValues.map((inputEntry, index): MigrationEntryV1 => {
    const entry = record(inputEntry);
    const dependsOn = entry === undefined ? undefined : strings(entry.dependsOn);
    const evidence = entry === undefined ? undefined : strings(entry.evidence);
    const modulePaths = entry === undefined ? undefined : strings(entry.legacyModulePaths) ??
      (denseArray(entry.legacyModulePaths)?.length === 0 ? [] : undefined);
    if (entry === undefined || !exact(entry, [
      "id", "legacySymbol", "legacyModulePaths", "targetOwner", "dependsOn", "deletionCondition",
      "state", "baselineSourceReferenceCount", "currentSourceReferenceCeiling", "evidence",
    ]) || typeof entry.id !== "string" || !/^3C-[a-z0-9-]+$/.test(entry.id) ||
      typeof entry.legacySymbol !== "string" || !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(entry.legacySymbol) ||
      typeof entry.targetOwner !== "string" || !TARGET_OWNERS.has(entry.targetOwner) ||
      dependsOn === undefined || new Set(dependsOn).size !== dependsOn.length || modulePaths === undefined ||
      typeof entry.deletionCondition !== "string" || entry.deletionCondition.length === 0 ||
      !["live", "migrating", "completed"].includes(entry.state as string) ||
      !Number.isSafeInteger(entry.baselineSourceReferenceCount) || (entry.baselineSourceReferenceCount as number) < 0 ||
      !Number.isSafeInteger(entry.currentSourceReferenceCeiling) || (entry.currentSourceReferenceCeiling as number) < 0 ||
      (entry.currentSourceReferenceCeiling as number) > (entry.baselineSourceReferenceCount as number) ||
      evidence === undefined || (entry.state === "completed" && evidence.length === 0)) {
      fail("3C_MIGRATION_LEDGER_INVALID", `entry ${index} is malformed`);
    }
    if (new Set(evidence).size !== evidence.length) {
      fail("3C_MIGRATION_EVIDENCE_DUPLICATED", `${entry.legacySymbol} evidence must be duplicate-free`);
    }
    if (ids.has(entry.id) || symbols.has(entry.legacySymbol)) fail("3C_MIGRATION_LEDGER_INVALID", `entry ${index} duplicates identity`);
    ids.add(entry.id); symbols.add(entry.legacySymbol);
    const frozenBaseline = GOLDEN_3C_BASELINE_COUNTS_V1[entry.legacySymbol as keyof typeof GOLDEN_3C_BASELINE_COUNTS_V1];
    if (frozenBaseline !== undefined && frozenBaseline !== entry.baselineSourceReferenceCount) {
      fail("3C_MIGRATION_BASELINE_MUTATED", `${entry.legacySymbol} baseline must remain ${frozenBaseline}`);
    }
    return Object.freeze({
      id: entry.id, legacySymbol: entry.legacySymbol, legacyModulePaths: Object.freeze([...modulePaths]),
      targetOwner: entry.targetOwner, dependsOn: Object.freeze([...dependsOn]), deletionCondition: entry.deletionCondition,
      state: entry.state as MigrationStateV1, baselineSourceReferenceCount: entry.baselineSourceReferenceCount as number,
      currentSourceReferenceCeiling: entry.currentSourceReferenceCeiling as number, evidence: Object.freeze([...evidence]),
    });
  });
  return Object.freeze({
    schemaVersion: 2, baselineCommit: root.baselineCommit as string,
    sourcePolicy: Object.freeze({ executableExtensions, excludedPathPrefixes, excludedFileSuffixes }),
    entries: Object.freeze(entries),
  });
}

async function allFiles(directory: string, relative = ""): Promise<readonly string[]> {
  let entries;
  try { entries = await readdir(path.join(directory, relative), { withFileTypes: true }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
  const nested = await Promise.all(entries.map(async (entry) => {
    const next = relative === "" ? entry.name : `${relative}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" ||
        (relative === "" && [".git", ".diversion", "docs", "config", ".superpowers", "artifacts"].includes(entry.name))) {
        return [];
      }
      return allFiles(directory, next);
    }
    return entry.isFile() ? [next] : [];
  }));
  return nested.flat();
}
function admittedSource(pathname: string, policy: SourcePolicyV1): boolean {
  const normalized = pathname.replaceAll("\\", "/");
  return policy.executableExtensions.some((extension) => normalized.endsWith(extension)) &&
    !policy.excludedPathPrefixes.some((prefix) => normalized.startsWith(prefix)) &&
    !policy.excludedFileSuffixes.some((suffix) => normalized.endsWith(suffix));
}
function escapeRegExp(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

const SINGLE_AUTHORITY_STRUCTURE_RULES_V1 = Object.freeze([
  Object.freeze({
    id: "runtime-host-fixed-input-transaction",
    path: "packages/runtime-host/src/gameplay-world-port.ts",
    required: Object.freeze(["prepareFixedInputTick("]),
    forbidden: Object.freeze(["runFixedInputTick"]),
  }),
  Object.freeze({
    id: "runtime-provider-fixed-input-transaction",
    path: "packages/runtime-babylon/src/gameplay-runtime-internal.ts",
    required: Object.freeze(["prepareFixedInputTick("]),
    forbidden: Object.freeze(["runFixedInputTick"]),
  }),
  Object.freeze({
    id: "runtime-host-fixed-input-call-site",
    path: "packages/runtime-host/src/world-session.ts",
    required: Object.freeze(["this.options.worldPort.prepareFixedInputTick("]),
    forbidden: Object.freeze([
      "runFixedInputTick",
      'worldPort["prepareFixedInputTick"]',
      "worldPort.prepareFixedInputTick?.(",
    ]),
  }),
  Object.freeze({
    id: "locomotion-v2-only",
    path: "packages/gameplay-contracts/src/gameplay-contracts.ts",
    required: Object.freeze([
      'readonly kind: "locomotion-capability-state-v2";',
      "export type GameplayCapabilityStateV1 = LocomotionCapabilityStateEnvelopeV2;",
    ]),
    forbidden: Object.freeze([
      "interface LocomotionCapabilityStateV1",
      '"locomotion-capability-state-v1"',
    ]),
  }),
  Object.freeze({
    id: "planar-movement-admission",
    path: "packages/runtime-babylon/src/character-movement-component.ts",
    required: Object.freeze([
      "supportsCharacterMovementSubjectV1(subject)",
      "3C_PLANAR_MOVEMENT_OWNER_DUPLICATE",
    ]),
    forbidden: Object.freeze(["sampleMotion("]),
  }),
  Object.freeze({
    id: "movement-projection-discriminator",
    path: "packages/runtime-babylon/src/runtime-projection.ts",
    required: Object.freeze([
      'movementOwner: "character-movement";',
      'movementOwner: "specialized-motion";',
      "locomotion?: never;",
    ]),
    forbidden: Object.freeze([]),
  }),
  Object.freeze({
    id: "authoring-canonical-public-entry",
    path: "packages/authoring/src/index.ts",
    required: Object.freeze([]),
    forbidden: Object.freeze(['export * from "./canonical-json"']),
  }),
  Object.freeze({
    id: "authoring-schema-public-entry",
    path: "packages/authoring/package.json",
    required: Object.freeze(['"./schema": "./src/authoring-spec-v4.schema.json"']),
    forbidden: Object.freeze(['"./schema-v4"']),
  }),
] as const);

function assertSingleFixedInputMutationMethod(
  source: string,
  sourcePath: string,
  interfaceName: string,
  expectedReturnTypeName: string,
  allowedReadOnlyMethodNames: readonly string[] = [],
): void {
  const sourceFile = ts.createSourceFile(
    sourcePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const declaration = sourceFile.statements.find(
    (statement): statement is ts.InterfaceDeclaration =>
      ts.isInterfaceDeclaration(statement) && statement.name.text === interfaceName,
  );
  if (declaration === undefined) {
    fail("SINGLE_AUTHORITY_STRUCTURE_REQUIRED_MISSING", `${interfaceName} interface`);
  }
  const fixedInputMethods = declaration.members.filter(
    (member): member is ts.MethodSignature => {
      if (!ts.isMethodSignature(member)) return false;
      return member.parameters.some((parameter) =>
        parameter.type?.getText(sourceFile).includes("FixedInputOneTickV1") === true
      );
    },
  );
  const allowedMethodNames = new Set([
    "prepareFixedInputTick",
    ...allowedReadOnlyMethodNames,
  ]);
  if (fixedInputMethods.some((member) =>
    !ts.isIdentifier(member.name) || !allowedMethodNames.has(member.name.text)
  )) {
    fail(
      "SINGLE_AUTHORITY_STRUCTURE_FORBIDDEN",
      `${interfaceName} exposes an unrecognized fixed-input path`,
    );
  }
  const fixedInputMutationMethods = fixedInputMethods.filter((member) =>
    ts.isIdentifier(member.name) &&
    !allowedReadOnlyMethodNames.includes(member.name.text)
  );
  const method = fixedInputMutationMethods[0];
  const methodName = method !== undefined && ts.isIdentifier(method.name)
    ? method.name.text
    : undefined;
  const returnType = method?.type?.getText(sourceFile) ?? "";
  if (fixedInputMutationMethods.length !== 1 ||
    methodName !== "prepareFixedInputTick" ||
    !returnType.includes(expectedReturnTypeName)) {
    fail(
      "SINGLE_AUTHORITY_STRUCTURE_FORBIDDEN",
      `${interfaceName} must expose exactly one staged fixed-input mutation method`,
    );
  }
}

export async function verifySingleAuthorityStructureV1(
  repositoryRoot: string,
): Promise<readonly string[]> {
  const verified: string[] = [];
  for (const rule of SINGLE_AUTHORITY_STRUCTURE_RULES_V1) {
    let source: string;
    try {
      source = await readFile(path.join(repositoryRoot, rule.path), "utf8");
    } catch {
      fail("SINGLE_AUTHORITY_STRUCTURE_FILE_MISSING", `${rule.id}: ${rule.path}`);
    }
    for (const required of rule.required) {
      if (!source.includes(required)) {
        fail("SINGLE_AUTHORITY_STRUCTURE_REQUIRED_MISSING", `${rule.id}: ${required}`);
      }
    }
    for (const forbidden of rule.forbidden) {
      if (source.includes(forbidden)) {
        fail("SINGLE_AUTHORITY_STRUCTURE_FORBIDDEN", `${rule.id}: ${forbidden}`);
      }
    }
    if (rule.id === "runtime-host-fixed-input-transaction") {
      assertSingleFixedInputMutationMethod(
        source,
        rule.path,
        "GameplayWorldPortV1",
        "GameplayWorldTransactionV1",
        ["estimateFixedInputTickCapacity"],
      );
    }
    if (rule.id === "runtime-provider-fixed-input-transaction") {
      assertSingleFixedInputMutationMethod(
        source,
        rule.path,
        "BabylonGameplayRuntimeInternalV1",
        "PreparedBabylonGameplayFixedInputTickV1",
      );
    }
    verified.push(rule.id);
  }
  return Object.freeze(verified);
}

export async function verify3cMigrationV1(options: Verify3cMigrationOptionsV1) {
  const ledger = parseLedger(options.ledger);
  const required = options.requiredLegacySymbols ?? [];
  const ledgerSymbols = new Set(ledger.entries.map((entry) => entry.legacySymbol));
  const omitted = required.filter((symbol) => !ledgerSymbols.has(symbol));
  if (omitted.length > 0) fail("3C_MIGRATION_LEDGER_INCOMPLETE", omitted.join(", "));
  if (options.priorLedger === undefined) {
    if (options.allowGenesis !== true) {
      fail("3C_MIGRATION_PRIOR_REQUIRED", "an accepted schema-2 prior ledger is required after genesis");
    }
  } else {
    if (options.allowGenesis === true) {
      fail("3C_MIGRATION_PRIOR_AMBIGUOUS", "genesis cannot be combined with a prior ledger");
    }
    const prior = parseLedger(options.priorLedger);
    if (prior.baselineCommit !== ledger.baselineCommit) fail("3C_MIGRATION_BASELINE_MUTATED", "baseline commit changed");
    if (prior.entries.length !== ledger.entries.length ||
      prior.entries.some((entry, index) => ledger.entries[index]?.legacySymbol !== entry.legacySymbol)) {
      fail("3C_MIGRATION_ENTRY_SET_CHANGED", "prior/current entry identities must match exactly");
    }
    const priorBySymbol = new Map(prior.entries.map((entry) => [entry.legacySymbol, entry]));
    for (const entry of ledger.entries) {
      const previous = priorBySymbol.get(entry.legacySymbol);
      if (previous === undefined) fail("3C_MIGRATION_ENTRY_SET_CHANGED", `${entry.legacySymbol} was added`);
      if (previous.baselineSourceReferenceCount !== entry.baselineSourceReferenceCount) {
        fail("3C_MIGRATION_BASELINE_MUTATED", `${entry.legacySymbol} baseline count changed`);
      }
      if (previous.id !== entry.id || !sameStrings(previous.legacyModulePaths, entry.legacyModulePaths) ||
        previous.targetOwner !== entry.targetOwner || !sameStrings(previous.dependsOn, entry.dependsOn) ||
        previous.deletionCondition !== entry.deletionCondition) {
        fail("3C_MIGRATION_METADATA_MUTATED", `${entry.legacySymbol} frozen metadata changed`);
      }
      const stateRank: Readonly<Record<MigrationStateV1, number>> = { live: 0, migrating: 1, completed: 2 };
      const previousStateRank = stateRank[previous.state];
      const currentStateRank = stateRank[entry.state];
      if (currentStateRank < previousStateRank) {
        fail("3C_MIGRATION_STATE_REGRESSED", `${entry.legacySymbol} regressed from ${previous.state} to ${entry.state}`);
      }
      if (previous.evidence.length > entry.evidence.length ||
        previous.evidence.some((evidence, index) => entry.evidence[index] !== evidence)) {
        fail("3C_MIGRATION_EVIDENCE_REPLACED", `${entry.legacySymbol} evidence must be append-only`);
      }
      if (entry.currentSourceReferenceCeiling > previous.currentSourceReferenceCeiling) {
        fail("3C_MIGRATION_REFERENCE_COUNT_INCREASED", `${entry.legacySymbol} ceiling was raised`);
      }
      const newlyAppendedEvidence = entry.evidence.slice(previous.evidence.length);
      if ((currentStateRank > previousStateRank ||
        entry.currentSourceReferenceCeiling < previous.currentSourceReferenceCeiling) &&
        newlyAppendedEvidence.length === 0) {
        fail("3C_MIGRATION_EVIDENCE_REQUIRED", `${entry.legacySymbol} state/count progress requires new evidence`);
      }
      if (currentStateRank > previousStateRank && entry.state === "completed") {
        const completionRecords: CompletionEvidenceV1[] = [];
        const priorCompletionRecords = previous.evidence.flatMap((item) => {
          const parsed = parse3cCompletionEvidenceV1(item);
          return parsed === undefined ? [] : [parsed];
        });
        for (const item of newlyAppendedEvidence) {
          const parsed = parse3cCompletionEvidenceV1(item);
          if (item.startsWith("completion:v1") && parsed === undefined) {
            fail("3C_MIGRATION_COMPLETION_EVIDENCE_INVALID", `${entry.legacySymbol}: malformed completion record`);
          }
          if (parsed !== undefined) {
            completionRecords.push(parsed);
          }
        }
        if (completionRecords.length === 0) {
          fail("3C_MIGRATION_COMPLETION_EVIDENCE_INVALID", `${entry.legacySymbol}: completion record required`);
        }
        const [priorArtifacts, currentArtifacts] = await Promise.all([
          Promise.all(priorCompletionRecords.map((completion) =>
            resolveCompletionEvidenceArtifact(options.repositoryRoot, completion, entry.legacySymbol)
          )),
          Promise.all(completionRecords.map((completion) =>
            resolveCompletionEvidenceArtifact(options.repositoryRoot, completion, entry.legacySymbol)
          )),
        ]);
        const priorPhysicalKeys = new Set(priorArtifacts.map((artifact) => artifact.physicalKey));
        const reusedIndex = currentArtifacts.findIndex((artifact) => priorPhysicalKeys.has(artifact.physicalKey));
        if (reusedIndex !== -1) {
          fail("3C_MIGRATION_COMPLETION_EVIDENCE_REUSED",
            `${entry.legacySymbol}: ${completionRecords[reusedIndex]!.artifact}`);
        }
        priorCompletionRecords.forEach((completion, index) =>
          assertCanonicalCompletionArtifactSpelling(completion, priorArtifacts[index]!, entry.legacySymbol)
        );
        completionRecords.forEach((completion, index) =>
          assertCanonicalCompletionArtifactSpelling(completion, currentArtifacts[index]!, entry.legacySymbol)
        );
      }
    }
  }
  const inventory = options.sourceFilePaths ?? await allFiles(options.repositoryRoot);
  const files = inventory.map((file) => file.replaceAll("\\", "/"))
    .filter((file) => admittedSource(file, ledger.sourcePolicy));
  const sourceRecords = (await Promise.all(files.map(async (file) => {
    try {
      return { file, content: await readFile(path.join(options.repositoryRoot, file), "utf8") };
    } catch (error) {
      if (typeof error === "object" && error !== null && Reflect.get(error, "code") === "ENOENT") return undefined;
      throw error;
    }
  }))).filter((source): source is { file: string; content: string } => source !== undefined);
  const reports = ledger.entries.map((entry) => {
    const pattern = new RegExp(`\\b${escapeRegExp(entry.legacySymbol)}\\b`, "g");
    const count = sourceRecords.reduce((sum, source) => sum + (source.content.match(pattern)?.length ?? 0), 0);
    const liveModules = sourceRecords.map((source) => source.file).filter((file) => {
      const withoutExtension = file.slice(0, file.length - path.extname(file).length);
      return entry.legacyModulePaths.includes(withoutExtension);
    });
    if (entry.state === "completed" && liveModules.length > 0) {
      fail("3C_MIGRATION_COMPLETED_MODULE_LIVE", `${entry.legacySymbol}: ${liveModules.join(", ")}`);
    }
    if (count > entry.currentSourceReferenceCeiling) {
      fail("3C_MIGRATION_REFERENCE_COUNT_INCREASED", `${entry.legacySymbol}: ${count} > ${entry.currentSourceReferenceCeiling}`);
    }
    if (count < entry.currentSourceReferenceCeiling) {
      fail("3C_MIGRATION_CURRENT_COUNT_MISMATCH", `${entry.legacySymbol}: lower ceiling to ${count}`);
    }
    if (entry.state === "completed" && count !== 0) fail("3C_MIGRATION_COMPLETED_SYMBOL_LIVE", entry.legacySymbol);
    return Object.freeze({
      id: entry.id, legacySymbol: entry.legacySymbol,
      baselineSourceReferenceCount: entry.baselineSourceReferenceCount,
      currentSourceReferenceCeiling: entry.currentSourceReferenceCeiling,
      liveSourceReferenceCount: count, state: entry.state,
    });
  });
  return Object.freeze({ baselineCommit: ledger.baselineCommit, entries: Object.freeze(reports) });
}

async function requiredGitText(
  repositoryRoot: string,
  args: readonly string[],
  failureCode: string,
): Promise<string> {
  try {
    return (await execFileAsync("git", [...args], { cwd: repositoryRoot, encoding: "utf8" })).stdout;
  } catch {
    return fail(failureCode, `git ${args.join(" ")} failed`);
  }
}

async function pathExists(pathname: string): Promise<boolean> {
  try {
    await lstat(pathname);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function diversionExecutablePath(): Promise<string> {
  const configured = process.env.DV_EXECUTABLE_PATH;
  if (configured !== undefined && configured.trim() !== "") return configured;
  if (process.platform === "win32" && process.env.USERPROFILE !== undefined) {
    const installed = path.join(
      process.env.USERPROFILE,
      ".diversion",
      "bin",
      "dv.exe",
    );
    if (await pathExists(installed)) return installed;
  }
  return "dv";
}

async function requiredDiversionText(
  repositoryRoot: string,
  args: readonly string[],
  failureCode: string,
): Promise<string> {
  try {
    const executable = await diversionExecutablePath();
    return (await execFileAsync(executable, [...args], {
      cwd: repositoryRoot,
      encoding: "utf8",
    })).stdout;
  } catch {
    return fail(failureCode, `dv ${args.join(" ")} failed`);
  }
}

export interface PriorLedgerContextV1 {
  readonly prior?: unknown;
  readonly allowGenesis: boolean;
}

async function optionalGitText(
  repositoryRoot: string,
  args: readonly string[],
): Promise<string | undefined> {
  try {
    return (await execFileAsync("git", [...args], {
      cwd: repositoryRoot,
      encoding: "utf8",
    })).stdout;
  } catch {
    return undefined;
  }
}

function parseSchema2Ledger(text: string, source: string): unknown {
  let candidate: unknown;
  try {
    candidate = JSON.parse(text);
  } catch {
    return fail(
      "3C_MIGRATION_PRIOR_UNAVAILABLE",
      `${source} ledger JSON could not be read`,
    );
  }
  if (record(candidate)?.schemaVersion !== 2) {
    return fail(
      "3C_MIGRATION_PRIOR_UNAVAILABLE",
      `${source} does not contain an accepted schema-2 ledger`,
    );
  }
  return candidate;
}

export async function readGitPriorLedgerV1(
  repositoryRoot: string,
  currentText: string,
): Promise<PriorLedgerContextV1> {
  const headCommit = (await requiredGitText(
    repositoryRoot,
    ["rev-parse", "HEAD"],
    "3C_MIGRATION_PRIOR_UNAVAILABLE",
  )).trim();
  const headText = await requiredGitText(
    repositoryRoot,
    ["show", "HEAD:config/3c-migration-ledger.json"],
    "3C_MIGRATION_PRIOR_UNAVAILABLE",
  );
  try {
    const currentDiffersFromHead = JSON.stringify(JSON.parse(headText)) !==
      JSON.stringify(JSON.parse(currentText));
    if (currentDiffersFromHead) {
      const candidate = JSON.parse(headText) as unknown;
      if (record(candidate)?.schemaVersion === 2) {
        return { prior: candidate, allowGenesis: false };
      }
      if (headCommit === GOLDEN_3C_LEDGER_GENESIS_PARENT) {
        return { allowGenesis: true };
      }
      return fail(
        "3C_MIGRATION_PRIOR_UNAVAILABLE",
        "HEAD does not contain an accepted schema-2 ledger",
      );
    }
    if (headCommit === GOLDEN_3C_LEDGER_GENESIS_COMMIT) {
      return { allowGenesis: true };
    }
    const parentsText = (await optionalGitText(
      repositoryRoot,
      ["rev-list", "--parents", "-n", "1", "HEAD"],
    ))?.trim();
    const parentCommits = parentsText?.split(/\s+/).slice(1) ?? [];
    for (const [parentIndex, parentCommit] of parentCommits.entries()) {
      const parentText = await optionalGitText(
        repositoryRoot,
        ["show", `${parentCommit}:config/3c-migration-ledger.json`],
      );
      if (parentText === undefined) continue;
      return {
        prior: parseSchema2Ledger(parentText, `HEAD^${parentIndex + 1}`),
        allowGenesis: false,
      };
    }
    return fail(
      "3C_MIGRATION_PRIOR_UNAVAILABLE",
      "no parent contains an accepted schema-2 ledger",
    );
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("3C_MIGRATION_")) {
      throw error;
    }
    return fail(
      "3C_MIGRATION_PRIOR_UNAVAILABLE",
      "prior ledger JSON could not be read",
    );
  }
}

/** Reconstructs the base text by applying one Diversion unified diff in reverse. */
export function priorTextFromDiversionDiffV1(
  currentText: string,
  unifiedDiff: string,
): string | undefined {
  if (/^new file mode /m.test(unifiedDiff) || /^--- \/dev\/null$/m.test(unifiedDiff)) {
    return undefined;
  }
  const diffLines = unifiedDiff.replaceAll("\r\n", "\n").split("\n");
  const currentLines = currentText.replaceAll("\r\n", "\n").split("\n");
  const priorLines: string[] = [];
  let currentCursor = 0;
  let sawHunk = false;
  for (let index = 0; index < diffLines.length; index += 1) {
    const header = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(diffLines[index] ?? "");
    if (header === null) continue;
    sawHunk = true;
    const newStart = Number(header[1]) - 1;
    if (!Number.isSafeInteger(newStart) || newStart < currentCursor) {
      return fail("3C_MIGRATION_PRIOR_UNAVAILABLE", "Diversion diff hunk ordering is invalid");
    }
    priorLines.push(...currentLines.slice(currentCursor, newStart));
    currentCursor = newStart;
    for (index += 1; index < diffLines.length; index += 1) {
      const line = diffLines[index] ?? "";
      if (line.startsWith("@@ ")) {
        index -= 1;
        break;
      }
      if (line.startsWith("diff --git ")) {
        index -= 1;
        break;
      }
      if (line === "\\ No newline at end of file") continue;
      const marker = line[0];
      if (marker !== " " && marker !== "+" && marker !== "-") continue;
      const content = line.slice(1);
      if (marker === "-") {
        priorLines.push(content);
        continue;
      }
      if (currentLines[currentCursor] !== content) {
        return fail(
          "3C_MIGRATION_PRIOR_UNAVAILABLE",
          "Diversion diff does not match the current ledger",
        );
      }
      if (marker === " ") priorLines.push(content);
      currentCursor += 1;
    }
  }
  if (!sawHunk) {
    return fail("3C_MIGRATION_PRIOR_UNAVAILABLE", "Diversion diff contains no ledger hunk");
  }
  priorLines.push(...currentLines.slice(currentCursor));
  return priorLines.join("\n");
}

export function diversionDiffContainsChangesV1(output: string): boolean {
  const normalized = output.trim();
  return normalized !== "" && normalized !== "No changes detected";
}

function diversionCommitIds(logText: string): readonly string[] {
  return logText.split(/\r?\n/).map((line) =>
    /^(dv\.commit\.[^\s]+)/.exec(line.trim())?.[1]
  ).filter((value): value is string => value !== undefined);
}

async function readDiversionBaseCommitV1(repositoryRoot: string): Promise<string> {
  const metadataNames = (await readdir(path.join(repositoryRoot, ".diversion")))
    .filter((name) => name.startsWith("dv.ws."));
  if (metadataNames.length !== 1) {
    return fail(
      "3C_MIGRATION_PRIOR_UNAVAILABLE",
      "Diversion workspace metadata is ambiguous",
    );
  }
  const metadata = JSON.parse(await readFile(
    path.join(repositoryRoot, ".diversion", metadataNames[0]!),
    "utf8",
  )) as unknown;
  const commitId = record(metadata)?.CommitID;
  if (typeof commitId !== "string" || commitId === "") {
    return fail(
      "3C_MIGRATION_PRIOR_UNAVAILABLE",
      "Diversion workspace base commit is unavailable",
    );
  }
  return commitId;
}

async function readDiversionPriorLedgerV1(
  repositoryRoot: string,
  currentText: string,
): Promise<PriorLedgerContextV1> {
  const ledgerRelativePath = "config/3c-migration-ledger.json";
  const workspaceDiff = await requiredDiversionText(
    repositoryRoot,
    ["diff", ledgerRelativePath, "--color", "never"],
    "3C_MIGRATION_PRIOR_UNAVAILABLE",
  );
  if (diversionDiffContainsChangesV1(workspaceDiff)) {
    const priorText = priorTextFromDiversionDiffV1(currentText, workspaceDiff);
    if (priorText === undefined) {
      const baseCommit = await readDiversionBaseCommitV1(repositoryRoot);
      if (baseCommit !== GOLDEN_3C_DIVERSION_GENESIS_PARENT) {
        return fail(
          "3C_MIGRATION_PRIOR_UNAVAILABLE",
          "a new Diversion ledger is only accepted over the frozen import commit",
        );
      }
      return { allowGenesis: true };
    }
    return { prior: JSON.parse(priorText) as unknown, allowGenesis: false };
  }

  const logText = await requiredDiversionText(
    repositoryRoot,
    ["log", ledgerRelativePath, "-n", "2", "--oneline"],
    "3C_MIGRATION_PRIOR_UNAVAILABLE",
  );
  const commits = diversionCommitIds(logText);
  if (commits.length === 0) {
    return fail("3C_MIGRATION_PRIOR_UNAVAILABLE", "Diversion ledger history is empty");
  }
  const priorRef = commits[1] ?? GOLDEN_3C_DIVERSION_GENESIS_PARENT;
  const historyDiff = await requiredDiversionText(
    repositoryRoot,
    [
      "diff",
      ledgerRelativePath,
      "--base",
      priorRef,
      "--compare",
      commits[0]!,
      "--color",
      "never",
    ],
    "3C_MIGRATION_PRIOR_UNAVAILABLE",
  );
  const priorText = priorTextFromDiversionDiffV1(currentText, historyDiff);
  if (priorText === undefined && commits.length === 1) return { allowGenesis: true };
  if (priorText === undefined) {
    return fail("3C_MIGRATION_PRIOR_UNAVAILABLE", "Diversion prior ledger was deleted");
  }
  return { prior: JSON.parse(priorText) as unknown, allowGenesis: false };
}

const invokedPath = process.argv[1] === undefined ? "" : path.resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  const repositoryRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
  );
  const ledgerPath = path.join(repositoryRoot, "config", "3c-migration-ledger.json");
  const currentText = await readFile(ledgerPath, "utf8");
  const current = JSON.parse(currentText) as unknown;
  const hasGit = await pathExists(path.join(repositoryRoot, ".git"));
  const hasDiversion = await pathExists(path.join(repositoryRoot, ".diversion"));
  if (hasGit === hasDiversion) {
    fail(
      "3C_MIGRATION_PRIOR_UNAVAILABLE",
      "repository must expose exactly one supported source-control provider",
    );
  }
  const priorContext = hasGit
    ? await readGitPriorLedgerV1(repositoryRoot, currentText)
    : await readDiversionPriorLedgerV1(repositoryRoot, currentText);
  const sourceFilePaths = hasGit
    ? (await requiredGitText(
        repositoryRoot,
        ["ls-files", "--cached", "--others", "--exclude-standard"],
        "3C_MIGRATION_SOURCE_INVENTORY_UNAVAILABLE",
      )).split(/\r?\n/).filter(Boolean)
    : await allFiles(repositoryRoot);
  const report = await verify3cMigrationV1({
    repositoryRoot,
    ledger: current,
    ...(priorContext.prior === undefined
      ? { allowGenesis: priorContext.allowGenesis }
      : { priorLedger: priorContext.prior }),
    requiredLegacySymbols: GOLDEN_3C_REQUIRED_LEGACY_SYMBOLS_V1,
    sourceFilePaths,
  });
  const structuralInvariants = await verifySingleAuthorityStructureV1(
    repositoryRoot,
  );
  process.stdout.write(`3C migration ledger passed (${report.entries.length} entries; ${report.entries.reduce((sum, entry) => sum + entry.liveSourceReferenceCount, 0)} live references; ${structuralInvariants.length} single-authority invariants).\n`);
}
