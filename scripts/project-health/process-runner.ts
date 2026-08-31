import { execFile, spawn, type ChildProcess } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, lstat, mkdir, mkdtemp, readdir, readlink, realpath, rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { sha256CanonicalJson } from "@whitebox-world/protocol";
import { isEmpty, isNil, sortBy, uniq } from "lodash-es";

import { parseRepositoryRelativePathV1 } from "../lib/workspace-boundary-contract";

export type ProjectHealthExecutionScopeV1 = "in-place-checkout" | "isolated-temp-worktree";

export interface ProjectHealthExecutionDescriptorV1 {
  readonly kind: "project-health-execution-descriptor";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly executionScope: ProjectHealthExecutionScopeV1;
  readonly descendantOwnershipMode: "inherit-owner-token";
  readonly argv: readonly [string, ...string[]];
  readonly allowedEnvironmentVariableNames: readonly string[];
  readonly implementationHash: string;
  readonly workingDirectory: string;
  readonly timeoutMilliseconds: number;
  readonly maximumOutputBytes: number;
}

export interface ProjectHealthExecutionEvidenceV1 {
  readonly kind: "project-health-execution-evidence";
  readonly schemaVersion: 1;
  readonly descriptorId: string;
  readonly executionScope: ProjectHealthExecutionScopeV1;
  readonly commandHash: string;
  readonly environmentHash: string;
  readonly status: "passed" | "failed" | "timed-out" | "repository-state-mutated" | "cleanup-failed" | "infrastructure-failed";
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly stdoutTruncated: boolean;
  readonly stderrTruncated: boolean;
  readonly repositoryStateBeforeHash: string | null;
  readonly repositoryStateAfterHash: string | null;
  readonly temporaryWorktreeRemoved: boolean | null;
  readonly temporaryOutputRemoved: boolean | null;
  readonly failureCodes: readonly ProjectHealthExecutionFailureCodeV1[];
}

export type ProjectHealthExecutionFailureCodeV1 =
  | "EXECUTION_ENVELOPE_FAILED"
  | "OWNED_PROCESS_REMOVE_FAILED"
  | "WORKTREE_REMOVE_FAILED"
  | "OUTPUT_REMOVE_FAILED";

export interface ProjectHealthExecutionResultV1 {
  readonly evidence: ProjectHealthExecutionEvidenceV1;
  readonly evidenceRef: string;
}

const execFileAsync = promisify(execFile);
const DESCRIPTOR_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const ENVIRONMENT_VARIABLE_NAME = /^[A-Z][A-Z0-9_]*$/;
const ALLOWED_HOST_ENVIRONMENT_VARIABLE_NAMES = new Set([
  "CI",
  "COREPACK_HOME",
  "HOME",
  "PATH",
  "PLAYWRIGHT_BROWSERS_PATH",
  "PNPM_HOME",
  "TEMP",
  "TMP",
  "TMPDIR",
  "XDG_CACHE_HOME",
]);
const SECRET_ARGUMENT = /(?:api[_-]?key|token|secret|password)\s*[=:]|\b(?:crsr|sk)_[A-Za-z0-9]{8,}/i;
const MAXIMUM_TIMEOUT_MILLISECONDS = 24 * 60 * 60 * 1_000;
const MAXIMUM_OUTPUT_BYTES = 16 * 1024 * 1024;
const INTERNAL_GIT_TIMEOUT_MILLISECONDS = 60_000;
const INTERNAL_PROCESS_INSPECTION_TIMEOUT_MILLISECONDS = 2_000;
const REPOSITORY_STATE_FINGERPRINT_TIMEOUT_MILLISECONDS = 5_000;
const REPOSITORY_STATE_FINGERPRINT_MAXIMUM_BYTES = 8 * 1024 * 1024;
const REPOSITORY_STATE_FINGERPRINT_MAXIMUM_ENTRIES = 4_096;

function invalid(): never {
  throw new TypeError("Value must match the closed ProjectHealthExecutionDescriptorV1 schema.");
}

function exactRecord(input: unknown, fields: readonly string[]): Record<string, unknown> {
  if (
    typeof input !== "object" ||
    isNil(input) ||
    Array.isArray(input) ||
    Reflect.getPrototypeOf(input) !== Object.prototype
  ) return invalid();
  const source = input as Record<string, unknown>;
  const keys = Object.keys(source);
  if (
    keys.length !== fields.length ||
    fields.some((field) => !Object.hasOwn(source, field)) ||
    keys.some((field) => !fields.includes(field))
  ) return invalid();
  return source;
}

function positiveSafeInteger(input: unknown, maximum: number): number {
  if (
    typeof input !== "number" ||
    !Number.isSafeInteger(input) ||
    Object.is(input, -0) ||
    input <= 0 ||
    input > maximum
  ) return invalid();
  return input;
}

function argument(input: unknown): string {
  if (
    typeof input !== "string" ||
    isEmpty(input) ||
    input.includes("\0") ||
    SECRET_ARGUMENT.test(input)
  ) return invalid();
  return input;
}

export function parseProjectHealthExecutionDescriptorV1(
  input: unknown,
): ProjectHealthExecutionDescriptorV1 {
  const source = exactRecord(input, [
    "kind",
    "schemaVersion",
    "id",
    "executionScope",
    "descendantOwnershipMode",
    "argv",
    "allowedEnvironmentVariableNames",
    "implementationHash",
    "workingDirectory",
    "timeoutMilliseconds",
    "maximumOutputBytes",
  ]);
  if (
    source.kind !== "project-health-execution-descriptor" ||
    source.schemaVersion !== 1 ||
    typeof source.id !== "string" ||
    !DESCRIPTOR_ID.test(source.id) ||
    (source.executionScope !== "in-place-checkout" && source.executionScope !== "isolated-temp-worktree") ||
    source.descendantOwnershipMode !== "inherit-owner-token" ||
    !Array.isArray(source.argv) ||
    source.argv.length === 0
  ) return invalid();
  const argv = source.argv.map(argument);
  const executable = argv[0];
  if (isNil(executable) || path.isAbsolute(executable) || /^[A-Za-z]:/.test(executable) || executable.includes("\\")) {
    return invalid();
  }
  if (!Array.isArray(source.allowedEnvironmentVariableNames) || typeof source.implementationHash !== "string" ||
    !SHA256.test(source.implementationHash)) return invalid();
  const allowedEnvironmentVariableNames = source.allowedEnvironmentVariableNames.map((entry) => {
    if (
      typeof entry !== "string" ||
      !ENVIRONMENT_VARIABLE_NAME.test(entry) ||
      !ALLOWED_HOST_ENVIRONMENT_VARIABLE_NAMES.has(entry)
    ) return invalid();
    return entry;
  });
  if (uniq(allowedEnvironmentVariableNames).length !== allowedEnvironmentVariableNames.length) return invalid();
  return {
    kind: "project-health-execution-descriptor",
    schemaVersion: 1,
    id: source.id,
    executionScope: source.executionScope,
    descendantOwnershipMode: "inherit-owner-token",
    argv: argv as [string, ...string[]],
    allowedEnvironmentVariableNames: sortBy(allowedEnvironmentVariableNames),
    implementationHash: source.implementationHash,
    workingDirectory: parseRepositoryRelativePathV1(source.workingDirectory, true),
    timeoutMilliseconds: positiveSafeInteger(source.timeoutMilliseconds, MAXIMUM_TIMEOUT_MILLISECONDS),
    maximumOutputBytes: positiveSafeInteger(source.maximumOutputBytes, MAXIMUM_OUTPUT_BYTES),
  };
}

function sanitizedEnvironment(
  allowedEnvironmentVariableNames: readonly string[],
  outputRoot: string,
  processOwnerToken: string,
): NodeJS.ProcessEnv {
  return Object.fromEntries([
    ...allowedEnvironmentVariableNames.flatMap((key) => {
      const value = process.env[key];
      return isNil(value) ? [] : [[key, value] as const];
    }),
    ["FORCE_COLOR", "0"],
    ["PROJECT_HEALTH_OUTPUT_ROOT", outputRoot],
    ["PROJECT_HEALTH_PROCESS_OWNER_TOKEN", processOwnerToken],
  ]);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function redactOutput(
  input: string,
  machineRoots: readonly string[],
  redactedValues: readonly string[] = [],
): string {
  let value = input
    .replace(/(?:api[_-]?key|token|secret|password)\s*[=:]\s*\S+/gi, "[REDACTED_CREDENTIAL]")
    .replace(/\b(?:crsr|sk)_[A-Za-z0-9]*/gi, "[REDACTED_CREDENTIAL]");
  for (const redactedValue of redactedValues) {
    if (!isEmpty(redactedValue)) {
      value = value.replace(new RegExp(escapeRegExp(redactedValue), "g"), "[REDACTED_INTERNAL_VALUE]");
    }
  }
  for (const root of machineRoots) {
    if (!isEmpty(root)) value = value.replace(new RegExp(escapeRegExp(root), "g"), "[REDACTED_PATH]");
  }
  return value.replace(
    /(?:file:\/\/[^\s]+|[A-Za-z]:\\[^\s]+|\/(?:[^\s/=]+\/)*[^\s=]*)/g,
    "[REDACTED_PATH]",
  );
}

function truncateUtf8(input: string, maximumBytes: number): string {
  if (Buffer.byteLength(input) <= maximumBytes) return input;
  let value = Buffer.from(input).subarray(0, maximumBytes).toString("utf8");
  while (Buffer.byteLength(value) > maximumBytes) value = value.slice(0, -1);
  return value;
}

async function git(repositoryRoot: string, argv: readonly string[]): Promise<string> {
  const result = await execFileAsync("git", ["-C", repositoryRoot, ...argv], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    timeout: INTERNAL_GIT_TIMEOUT_MILLISECONDS,
  });
  return result.stdout;
}

interface RepositoryStateFingerprintBudget {
  remainingBytes: number;
  remainingEntries: number;
  readonly signal: AbortSignal;
}

function consumeRepositoryStateEntry(budget: RepositoryStateFingerprintBudget): void {
  budget.signal.throwIfAborted();
  if (budget.remainingEntries <= 0) throw new Error("Repository state fingerprint entry budget exceeded.");
  budget.remainingEntries -= 1;
}

async function hashFile(candidate: string, budget: RepositoryStateFingerprintBudget): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(candidate, { signal: budget.signal });
    stream.on("data", (chunk: string | Buffer) => {
      const bytes = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
      if (bytes.byteLength > budget.remainingBytes) {
        stream.destroy(new Error("Repository state fingerprint byte budget exceeded."));
        return;
      }
      budget.remainingBytes -= bytes.byteLength;
      hash.update(bytes);
    });
    stream.once("error", reject);
    stream.once("end", resolve);
  });
  return `sha256:${hash.digest("hex")}`;
}

function isPathOwned(candidate: string, excludedOwnedPaths: readonly string[]): boolean {
  return excludedOwnedPaths.some((ownedPath) => {
    const relative = path.relative(ownedPath, candidate);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  });
}

async function ignoredProjectHealthState(
  repositoryRoot: string,
  excludedOwnedPaths: readonly string[],
  budget: RepositoryStateFingerprintBudget,
): Promise<readonly Readonly<Record<string, string>>[]> {
  const healthRoot = path.join(repositoryRoot, ".project-health");
  const entries: Readonly<Record<string, string>>[] = [];
  const visit = async (candidate: string): Promise<void> => {
    budget.signal.throwIfAborted();
    if (isPathOwned(candidate, excludedOwnedPaths)) return;
    let stats;
    try {
      stats = await lstat(candidate);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT" && candidate === healthRoot) return;
      throw error;
    }
    consumeRepositoryStateEntry(budget);
    const relativePath = path.relative(repositoryRoot, candidate).split(path.sep).join("/");
    if (stats.isDirectory()) {
      entries.push({ kind: "directory", path: relativePath });
      const children = sortBy(await readdir(candidate));
      for (const child of children) await visit(path.join(candidate, child));
      return;
    }
    if (stats.isFile()) {
      entries.push({ contentHash: await hashFile(candidate, budget), kind: "file", path: relativePath });
      return;
    }
    if (stats.isSymbolicLink()) {
      entries.push({ kind: "symbolic-link", path: relativePath, targetHash: sha256CanonicalJson(await readlink(candidate)) });
      return;
    }
    entries.push({ kind: "special", path: relativePath });
  };
  await visit(healthRoot);
  return entries;
}

async function repositoryStateHash(
  repositoryRoot: string,
): Promise<string> {
  const healthRoot = path.join(repositoryRoot, ".project-health");
  const excludedOwnedPaths = [
    path.join(healthRoot, "runs"),
    path.join(healthRoot, "worktrees"),
  ];
  const excludedPathspecs = excludedOwnedPaths.flatMap((ownedPath) => {
    const relative = path.relative(repositoryRoot, ownedPath).split(path.sep).join("/");
    if (relative.startsWith("../") || relative === ".." || path.isAbsolute(relative)) {
      throw new TypeError("Owned execution path must remain inside the repository root.");
    }
    return [`:(exclude)${relative}`, `:(exclude)${relative}/**`];
  });
  const [trackedDiff, repositoryStatus] = await Promise.all([
    git(repositoryRoot, ["diff", "--binary", "--no-ext-diff", "HEAD", "--"]),
    git(repositoryRoot, [
      "status",
      "--porcelain=v1",
      "--untracked-files=all",
      "--",
      ".",
      ...excludedPathspecs,
    ]),
  ]);
  const controller = new AbortController();
  let timeout: NodeJS.Timeout | undefined;
  const fingerprint = ignoredProjectHealthState(repositoryRoot, excludedOwnedPaths, {
    remainingBytes: REPOSITORY_STATE_FINGERPRINT_MAXIMUM_BYTES,
    remainingEntries: REPOSITORY_STATE_FINGERPRINT_MAXIMUM_ENTRIES,
    signal: controller.signal,
  });
  const deadline = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new Error("Repository state fingerprint timeout exceeded."));
    }, REPOSITORY_STATE_FINGERPRINT_TIMEOUT_MILLISECONDS);
    timeout.unref();
  });
  let projectHealthState: readonly Readonly<Record<string, string>>[];
  try {
    projectHealthState = await Promise.race([fingerprint, deadline]);
  } finally {
    if (!isNil(timeout)) clearTimeout(timeout);
  }
  return sha256CanonicalJson({ projectHealthState, repositoryStatus, trackedDiff });
}

async function descendantProcessIds(parentPid: number): Promise<readonly number[]> {
  if (process.platform === "win32") return [];
  const { stdout } = await execFileAsync("ps", ["-axo", "pid=,ppid="], {
    encoding: "utf8",
    timeout: INTERNAL_PROCESS_INSPECTION_TIMEOUT_MILLISECONDS,
  });
  const childrenByParent = new Map<number, number[]>();
  for (const line of stdout.split("\n")) {
    const [pidText, parentPidText] = line.trim().split(/\s+/);
    const pid = Number(pidText);
    const observedParentPid = Number(parentPidText);
    if (!Number.isSafeInteger(pid) || !Number.isSafeInteger(observedParentPid)) continue;
    const children = childrenByParent.get(observedParentPid) ?? [];
    children.push(pid);
    childrenByParent.set(observedParentPid, children);
  }
  const descendants: number[] = [];
  const pending = [...(childrenByParent.get(parentPid) ?? [])];
  while (pending.length > 0) {
    const pid = pending.shift()!;
    descendants.push(pid);
    pending.push(...(childrenByParent.get(pid) ?? []));
  }
  return descendants.reverse();
}

async function ownedProcessIds(processOwnerToken: string, excludedPid: number | undefined): Promise<readonly number[]> {
  if (process.platform === "win32") return [];
  const { stdout } = await execFileAsync("ps", ["eww", "-axo", "pid=,command="], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    timeout: INTERNAL_PROCESS_INSPECTION_TIMEOUT_MILLISECONDS,
  });
  const marker = `PROJECT_HEALTH_PROCESS_OWNER_TOKEN=${processOwnerToken}`;
  return stdout.split("\n").flatMap((line) => {
    if (!line.includes(marker)) return [];
    const pid = Number(line.trim().split(/\s+/, 1)[0]);
    return Number.isSafeInteger(pid) && pid !== excludedPid ? [pid] : [];
  });
}

async function terminateOwnedProcesses(
  child: ChildProcess,
  signal: NodeJS.Signals,
  knownDescendantIds: readonly number[] = [],
): Promise<Readonly<{ descendantIds: readonly number[]; cleanupFailed: boolean }>> {
  if (isNil(child.pid)) return { descendantIds: [], cleanupFailed: false };
  if (process.platform === "win32") {
    try {
      await execFileAsync("taskkill", ["/PID", String(child.pid), "/T", "/F"]);
      return { descendantIds: [], cleanupFailed: false };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      return { descendantIds: [], cleanupFailed: code !== "ESRCH" };
    }
  }
  let cleanupFailed = false;
  let observedDescendantIds: readonly number[] = [];
  try {
    observedDescendantIds = await descendantProcessIds(child.pid);
  } catch {
    cleanupFailed = true;
  }
  const descendantIds = [...new Set([...knownDescendantIds, ...observedDescendantIds])];
  for (const pid of descendantIds) {
    try {
      process.kill(pid, signal);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") cleanupFailed = true;
    }
  }
  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") cleanupFailed = true;
  }
  return { descendantIds, cleanupFailed };
}

async function pathExists(candidate: string): Promise<boolean> {
  try {
    await access(candidate);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

interface CanonicalDirectoryIdentity {
  readonly absolutePath: string;
  readonly device: bigint;
  readonly inode: bigint;
}

async function canonicalDirectoryIdentity(candidate: string): Promise<CanonicalDirectoryIdentity> {
  const stats = await lstat(candidate, { bigint: true });
  if (!stats.isDirectory() || stats.isSymbolicLink() || await realpath(candidate) !== candidate) {
    throw new Error("Execution infrastructure must be a canonical non-symlink directory.");
  }
  return {
    absolutePath: candidate,
    device: stats.dev,
    inode: stats.ino,
  };
}

async function assertDirectoryIdentity(identity: CanonicalDirectoryIdentity): Promise<void> {
  const current = await canonicalDirectoryIdentity(identity.absolutePath);
  if (current.device !== identity.device || current.inode !== identity.inode) {
    throw new Error("Execution infrastructure directory identity changed.");
  }
}

async function ensureCanonicalChildDirectory(
  parentIdentity: CanonicalDirectoryIdentity,
  childPath: string,
): Promise<CanonicalDirectoryIdentity> {
  await assertDirectoryIdentity(parentIdentity);
  try {
    await mkdir(childPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  await assertDirectoryIdentity(parentIdentity);
  const childIdentity = await canonicalDirectoryIdentity(childPath);
  if (path.dirname(childIdentity.absolutePath) !== parentIdentity.absolutePath) {
    throw new Error("Execution infrastructure child escaped its canonical parent.");
  }
  return childIdentity;
}

async function ownedTemporaryDirectoryIdentity(
  parentIdentity: CanonicalDirectoryIdentity,
  childPath: string,
): Promise<CanonicalDirectoryIdentity> {
  await assertDirectoryIdentity(parentIdentity);
  const childIdentity = await canonicalDirectoryIdentity(childPath);
  await assertDirectoryIdentity(parentIdentity);
  if (path.dirname(childIdentity.absolutePath) !== parentIdentity.absolutePath) {
    throw new Error("Temporary execution directory escaped its canonical parent.");
  }
  return childIdentity;
}

interface CapturedProcessV1 {
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly stdoutTruncated: boolean;
  readonly stderrTruncated: boolean;
  readonly timedOut: boolean;
  readonly ownedProcessCleanupFailed: boolean;
  readonly environmentHash: string;
}

async function captureProcess(
  descriptor: ProjectHealthExecutionDescriptorV1,
  cwd: string,
  outputRoot: string,
  machineRoots: readonly string[],
): Promise<CapturedProcessV1> {
  const [executable, ...args] = descriptor.argv;
  const processOwnerToken = randomUUID();
  const environment = sanitizedEnvironment(
    descriptor.allowedEnvironmentVariableNames,
    outputRoot,
    processOwnerToken,
  );
  const environmentHash = sha256CanonicalJson(Object.fromEntries(
    Object.entries(environment).filter(([key]) =>
      key !== "PROJECT_HEALTH_OUTPUT_ROOT" && key !== "PROJECT_HEALTH_PROCESS_OWNER_TOKEN"),
  ));
  const child = spawn(executable, args, {
    cwd,
    env: environment,
    shell: false,
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];
  let remainingStdoutBytes = descriptor.maximumOutputBytes;
  let remainingStderrBytes = descriptor.maximumOutputBytes;
  let stdoutTruncated = false;
  let stderrTruncated = false;
  const capture = (target: Buffer[], chunk: Buffer, stream: "stdout" | "stderr") => {
    const remainingBytes = stream === "stdout" ? remainingStdoutBytes : remainingStderrBytes;
    const acceptedBytes = Math.min(remainingBytes, chunk.byteLength);
    if (acceptedBytes > 0) target.push(chunk.subarray(0, acceptedBytes));
    if (stream === "stdout") remainingStdoutBytes -= acceptedBytes;
    else remainingStderrBytes -= acceptedBytes;
    if (acceptedBytes < chunk.byteLength) {
      if (stream === "stdout") stdoutTruncated = true;
      else stderrTruncated = true;
    }
  };
  child.stdout?.on("data", (chunk: Buffer) => capture(stdoutChunks, chunk, "stdout"));
  child.stderr?.on("data", (chunk: Buffer) => capture(stderrChunks, chunk, "stderr"));

  let timedOut = false;
  let ownedProcessCleanupFailed = false;
  let terminationPromise: Promise<void> | null = null;
  const timeout = setTimeout(() => {
    timedOut = true;
    terminationPromise = (async () => {
      let ownedIds: readonly number[] = [];
      try {
        ownedIds = await ownedProcessIds(processOwnerToken, child.pid);
      } catch {
        ownedProcessCleanupFailed = true;
      }
      const graceful = await terminateOwnedProcesses(child, "SIGTERM", ownedIds);
      await new Promise((resolve) => setTimeout(resolve, 100));
      const forced = await terminateOwnedProcesses(child, "SIGKILL", graceful.descendantIds);
      ownedProcessCleanupFailed = graceful.cleanupFailed || forced.cleanupFailed;
    })();
  }, descriptor.timeoutMilliseconds);
  timeout.unref();

  const closed = await new Promise<{ exitCode: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    child.once("error", () => resolve({ exitCode: null, signal: null }));
    child.once("close", (exitCode, signal) => resolve({ exitCode, signal }));
  });
  clearTimeout(timeout);
  if (!isNil(terminationPromise)) await terminationPromise;
  let ownedIds: readonly number[] = [];
  try {
    ownedIds = await ownedProcessIds(processOwnerToken, child.pid);
  } catch {
    ownedProcessCleanupFailed = true;
  }
  const finalCleanup = await terminateOwnedProcesses(child, "SIGKILL", ownedIds);
  ownedProcessCleanupFailed ||= finalCleanup.cleanupFailed;

  const stdoutRaw = Buffer.concat(stdoutChunks).toString("utf8");
  const stderrRaw = Buffer.concat(stderrChunks).toString("utf8");
  const sanitizedStdout = redactOutput(stdoutRaw, machineRoots, [processOwnerToken]);
  const sanitizedStderr = redactOutput(stderrRaw, machineRoots, [processOwnerToken]);
  let finalRemainingBytes = descriptor.maximumOutputBytes;
  const finalize = (value: string, wasTruncated: boolean) => {
    const accepted = truncateUtf8(value, finalRemainingBytes);
    const acceptedBytes = Buffer.byteLength(accepted);
    const truncated = wasTruncated || acceptedBytes < Buffer.byteLength(value);
    finalRemainingBytes -= acceptedBytes;
    return { value: accepted, truncated };
  };
  const stdout = finalize(sanitizedStdout, stdoutTruncated);
  const stderr = finalize(sanitizedStderr, stderrTruncated);
  return {
    ...closed,
    stdout: stdout.value,
    stderr: stderr.value,
    stdoutTruncated: stdout.truncated,
    stderrTruncated: stderr.truncated,
    timedOut,
    ownedProcessCleanupFailed,
    environmentHash,
  };
}

export async function runProjectHealthProcessV1(input: Readonly<{
  repositoryRoot: string;
  descriptor: unknown;
}>): Promise<ProjectHealthExecutionResultV1> {
  const descriptor = parseProjectHealthExecutionDescriptorV1(input.descriptor);
  const repositoryRoot = path.resolve(input.repositoryRoot);
  const healthRoot = path.join(repositoryRoot, ".project-health");
  const runParent = path.join(healthRoot, "runs");
  const worktreeParent = path.join(healthRoot, "worktrees");
  let outputRoot: string | null = null;
  let runParentIdentity: CanonicalDirectoryIdentity | null = null;
  let outputRootIdentity: CanonicalDirectoryIdentity | null = null;
  let worktreeParentIdentity: CanonicalDirectoryIdentity | null = null;
  let worktreeRootIdentity: CanonicalDirectoryIdentity | null = null;

  let executionRoot = repositoryRoot;
  let worktreeRoot: string | null = null;
  let repositoryStateBeforeHash: string | null = null;
  let repositoryStateAfterHash: string | null = null;
  let temporaryWorktreeRemoved: boolean | null = null;
  let temporaryOutputRemoved: boolean | null = null;
  const failureCodes = new Set<ProjectHealthExecutionFailureCodeV1>();
  let captured: CapturedProcessV1 = {
    exitCode: null,
    signal: null,
    stdout: "",
    stderr: "",
    stdoutTruncated: false,
    stderrTruncated: false,
    timedOut: false,
    ownedProcessCleanupFailed: false,
    environmentHash: sha256CanonicalJson({}),
  };

  try {
    const repositoryIdentity = await canonicalDirectoryIdentity(repositoryRoot);
    await git(repositoryRoot, ["rev-parse", "--verify", "HEAD"]);
    const healthRootIdentity = await ensureCanonicalChildDirectory(repositoryIdentity, healthRoot);
    runParentIdentity = await ensureCanonicalChildDirectory(healthRootIdentity, runParent);
    outputRoot = await mkdtemp(path.join(runParent, "run-"));
    outputRootIdentity = await ownedTemporaryDirectoryIdentity(runParentIdentity, outputRoot);
    if (descriptor.executionScope === "isolated-temp-worktree") {
      worktreeParentIdentity = await ensureCanonicalChildDirectory(healthRootIdentity, worktreeParent);
      worktreeRoot = await mkdtemp(path.join(worktreeParent, "run-"));
      const emptyWorktreeIdentity = await ownedTemporaryDirectoryIdentity(worktreeParentIdentity, worktreeRoot);
      await assertDirectoryIdentity(worktreeParentIdentity);
      await assertDirectoryIdentity(emptyWorktreeIdentity);
      await rm(worktreeRoot, { recursive: true, force: true });
      await assertDirectoryIdentity(worktreeParentIdentity);
      await git(repositoryRoot, ["worktree", "add", "--quiet", "--detach", worktreeRoot, "HEAD"]);
      worktreeRootIdentity = await ownedTemporaryDirectoryIdentity(worktreeParentIdentity, worktreeRoot);
      executionRoot = worktreeRoot;
    } else {
      repositoryStateBeforeHash = await repositoryStateHash(repositoryRoot);
    }
    const cwd = descriptor.workingDirectory === "."
      ? executionRoot
      : path.join(executionRoot, descriptor.workingDirectory);
    captured = await captureProcess(descriptor, cwd, outputRoot, [
      repositoryRoot,
      outputRoot,
      worktreeRoot ?? "",
      process.env.HOME ?? "",
    ]);
    if (descriptor.executionScope === "in-place-checkout") {
      repositoryStateAfterHash = await repositoryStateHash(repositoryRoot);
    }
    if (captured.ownedProcessCleanupFailed) failureCodes.add("OWNED_PROCESS_REMOVE_FAILED");
  } catch {
    failureCodes.add("EXECUTION_ENVELOPE_FAILED");
  } finally {
    if (!isNil(worktreeRoot)) {
      try {
        if (isNil(worktreeParentIdentity) || isNil(worktreeRootIdentity)) {
          throw new Error("Worktree ownership was not established.");
        }
        await assertDirectoryIdentity(worktreeParentIdentity);
        await assertDirectoryIdentity(worktreeRootIdentity);
        await git(repositoryRoot, ["worktree", "remove", "--force", worktreeRoot]);
        await assertDirectoryIdentity(worktreeParentIdentity);
        temporaryWorktreeRemoved = !await pathExists(worktreeRoot);
        if (!temporaryWorktreeRemoved) failureCodes.add("WORKTREE_REMOVE_FAILED");
      } catch {
        temporaryWorktreeRemoved = false;
        failureCodes.add("WORKTREE_REMOVE_FAILED");
      }
    }
    if (!isNil(outputRoot)) try {
      if (isNil(runParentIdentity) || isNil(outputRootIdentity)) {
        throw new Error("Output ownership was not established.");
      }
      await assertDirectoryIdentity(runParentIdentity);
      await assertDirectoryIdentity(outputRootIdentity);
      await rm(outputRoot, { recursive: true, force: true });
      await assertDirectoryIdentity(runParentIdentity);
      try {
        temporaryOutputRemoved = !await pathExists(outputRoot);
      } catch {
        temporaryOutputRemoved = false;
      }
      if (!temporaryOutputRemoved) failureCodes.add("OUTPUT_REMOVE_FAILED");
    } catch {
      temporaryOutputRemoved = false;
      failureCodes.add("OUTPUT_REMOVE_FAILED");
    }
  }

  const repositoryStateMutated = !isNil(repositoryStateBeforeHash) && repositoryStateBeforeHash !== repositoryStateAfterHash;
  const cleanupFailed = [
    "OWNED_PROCESS_REMOVE_FAILED",
    "WORKTREE_REMOVE_FAILED",
    "OUTPUT_REMOVE_FAILED",
  ].some((code) => failureCodes.has(code as ProjectHealthExecutionFailureCodeV1));
  const status: ProjectHealthExecutionEvidenceV1["status"] = cleanupFailed
    ? "cleanup-failed"
    : failureCodes.has("EXECUTION_ENVELOPE_FAILED")
      ? "infrastructure-failed"
    : repositoryStateMutated
      ? "repository-state-mutated"
      : captured.timedOut
        ? "timed-out"
        : captured.exitCode === 0
          ? "passed"
          : "failed";
  const evidence: ProjectHealthExecutionEvidenceV1 = {
    kind: "project-health-execution-evidence",
    schemaVersion: 1,
    descriptorId: descriptor.id,
    executionScope: descriptor.executionScope,
    commandHash: sha256CanonicalJson(descriptor),
    environmentHash: captured.environmentHash,
    status,
    exitCode: captured.exitCode,
    signal: captured.signal,
    stdout: captured.stdout,
    stderr: captured.stderr,
    stdoutTruncated: captured.stdoutTruncated,
    stderrTruncated: captured.stderrTruncated,
    repositoryStateBeforeHash,
    repositoryStateAfterHash,
    temporaryWorktreeRemoved,
    temporaryOutputRemoved,
    failureCodes: sortBy([...failureCodes]),
  };
  return { evidence, evidenceRef: sha256CanonicalJson(evidence) };
}
