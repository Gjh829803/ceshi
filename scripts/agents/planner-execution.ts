import { spawn } from "node:child_process";
import { constants, cp, copyFile, lstat, mkdir, mkdtemp, open, readdir, realpath, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { sha256Bytes, stringifyCanonicalJson, type Sha256HashV1 } from "@whitebox-world/protocol";
import { isEqual, isNil } from "lodash-es";
import {
  NATIVE_BLOCK_PLANNER_BUDGET_CONTEXT_REF_V1,
  NATIVE_BLOCK_PLANNER_BUDGET_CONTEXT_V1,
} from "../reconstruction/native-block-production-budget.js";

const SKILL_REF = ".codex/skills/worldkit-spatial-planner";
const CHECKER_REF = `${SKILL_REF}/scripts/self-check.mjs`;
const HASH = /^sha256:[a-f0-9]{64}$/;
type SceneSource = "canonical" | "babylon-native";
interface PlannerIdentity {
  readonly artifactRoot: string;
  readonly sceneId: string;
  readonly sceneSourceKind: SceneSource;
}
interface PlannerExecutionIdentity extends PlannerIdentity {
  readonly taskId: string;
}
interface ContextFile {
  readonly inputRef: string;
  readonly contentHash: Sha256HashV1;
}
interface PlannerExecutionRequest {
  readonly kind: "worldkit-planner-execution-request";
  readonly schemaVersion: 1;
  readonly sceneId: string;
  readonly sceneSourceKind: SceneSource;
  readonly taskId: string;
  readonly routerRequestId: string;
  readonly instructionHash: Sha256HashV1;
  readonly contextFiles: readonly ContextFile[];
}
export interface PlannerExecutionReceiptV1 {
  readonly kind: "worldkit-planner-execution-receipt";
  readonly schemaVersion: 1;
  readonly sceneId: string;
  readonly sceneSourceKind: SceneSource;
  readonly taskId: string;
  readonly requestHash: Sha256HashV1;
  readonly plannerSelfCheckHash: Sha256HashV1;
}

function assertId(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9-]{2,79}$/.test(value)) {
    throw new TypeError("PLANNER_EXECUTION_ID_INVALID");
  }
}

function executionPaths(input: PlannerExecutionIdentity) {
  assertId(input.sceneId);
  assertId(input.taskId);
  if (input.sceneSourceKind !== "canonical" && input.sceneSourceKind !== "babylon-native") {
    throw new TypeError("PLANNER_EXECUTION_SOURCE_INVALID");
  }
  const executionDirectoryPath = path.resolve(input.artifactRoot, "planner-executions", input.taskId);
  return {
    executionDirectoryPath,
    workspaceContextRoot: path.join(executionDirectoryPath, "workspace"),
    instructionPath: path.join(executionDirectoryPath, "instruction.md"),
    requestPath: path.join(executionDirectoryPath, "request.json"),
  };
}

// Planner-owned snapshots only. Read once from a stable descriptor and never
// copy by re-reading a mutable source path after calculating its hash.
async function readStableFile(filePath: string): Promise<Buffer> {
  const handle = await open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await handle.stat({ bigint: true });
    if (!before.isFile()) throw new TypeError("PLANNER_EXECUTION_FILE_INVALID");
    const bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs || BigInt(bytes.length) !== after.size) {
      throw new TypeError("PLANNER_EXECUTION_FILE_CHANGED");
    }
    return bytes;
  } finally {
    await handle.close();
  }
}

async function readContextTree(root: string, inputRef = ""): Promise<readonly (ContextFile & { bytes: Buffer })[]> {
  const absolute = path.join(root, inputRef);
  const metadata = await lstat(absolute);
  if (metadata.isSymbolicLink() || await realpath(absolute) !== absolute) {
    throw new TypeError("PLANNER_EXECUTION_CONTEXT_CHANGED");
  }
  if (metadata.isDirectory()) {
    const files: (ContextFile & { bytes: Buffer })[] = [];
    for (const entry of (await readdir(absolute)).sort()) {
      files.push(...await readContextTree(root, inputRef ? `${inputRef}/${entry}` : entry));
    }
    return files;
  }
  if (!metadata.isFile()) throw new TypeError("PLANNER_EXECUTION_CONTEXT_CHANGED");
  const bytes = await readStableFile(absolute);
  return [{ inputRef, bytes, contentHash: sha256Bytes(bytes) as Sha256HashV1 }];
}

export async function preparePlannerExecutionV1(input: PlannerExecutionIdentity & Readonly<{
  repositoryRoot: string;
  routerRequestId: string;
  instructionPath: string;
}>) {
  assertId(input.routerRequestId);
  const paths = executionPaths(input);
  const repositoryRoot = await realpath(input.repositoryRoot);
  const contextRefs = [SKILL_REF, ...(input.sceneSourceKind === "canonical" ? ["assets/terrain-height-intent"] : [])];
  const contextFiles = (await Promise.all(contextRefs.map((ref) => readContextTree(repositoryRoot, ref)))).flat();
  if (input.sceneSourceKind === "babylon-native") {
    const bytes = Buffer.from(stringifyCanonicalJson(NATIVE_BLOCK_PLANNER_BUDGET_CONTEXT_V1));
    contextFiles.push({ inputRef: NATIVE_BLOCK_PLANNER_BUDGET_CONTEXT_REF_V1,
      contentHash: sha256Bytes(bytes) as Sha256HashV1, bytes });
  }
  contextFiles.sort((left, right) => left.inputRef < right.inputRef ? -1 : left.inputRef > right.inputRef ? 1 : 0);
  for (const required of [`${SKILL_REF}/SKILL.md`, CHECKER_REF]) {
    if (!contextFiles.some(({ inputRef }) => inputRef === required)) {
      throw new TypeError("PLANNER_EXECUTION_CONTEXT_INCOMPLETE");
    }
  }
  const instruction = await readStableFile(input.instructionPath);
  const request: PlannerExecutionRequest = {
    kind: "worldkit-planner-execution-request", schemaVersion: 1,
    sceneId: input.sceneId, sceneSourceKind: input.sceneSourceKind,
    taskId: input.taskId, routerRequestId: input.routerRequestId,
    instructionHash: sha256Bytes(instruction) as Sha256HashV1,
    contextFiles: contextFiles.map(({ inputRef, contentHash }) => ({ inputRef, contentHash })),
  };
  await mkdir(path.dirname(paths.executionDirectoryPath), { recursive: true, mode: 0o700 });
  // This is exclusive: failed preparation never deletes a previous task.
  await mkdir(paths.executionDirectoryPath, { mode: 0o700 });
  try {
    for (const { inputRef, bytes } of contextFiles) {
      const destination = path.join(paths.workspaceContextRoot, inputRef);
      await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
      await writeFile(destination, bytes, { flag: "wx", mode: 0o400 });
    }
    await writeFile(paths.instructionPath, instruction, { flag: "wx", mode: 0o400 });
    const requestBytes = stringifyCanonicalJson(request);
    await writeFile(paths.requestPath, requestBytes, { flag: "wx", mode: 0o400 });
    const requestHash = sha256Bytes(new TextEncoder().encode(requestBytes)) as Sha256HashV1;
    await verifyRequest({ ...input, requestHash });
    return { ...paths, requestHash };
  } catch (error) {
    await rm(paths.executionDirectoryPath, { recursive: true, force: true });
    throw error;
  }
}

async function verifyRequest(input: PlannerExecutionIdentity & { readonly requestHash: string }) {
  const paths = executionPaths(input);
  if (await realpath(paths.executionDirectoryPath) !== path.join(
    await realpath(input.artifactRoot), "planner-executions", input.taskId,
  )) throw new TypeError("PLANNER_EXECUTION_CONTEXT_CHANGED");
  const bytes = await readStableFile(paths.requestPath);
  if (!HASH.test(input.requestHash) || sha256Bytes(bytes) !== input.requestHash) {
    throw new TypeError("PLANNER_EXECUTION_REQUEST_MISMATCH");
  }
  const value = JSON.parse(bytes.toString("utf8")) as PlannerExecutionRequest;
  assertId(value.routerRequestId);
  if (value.kind !== "worldkit-planner-execution-request" || value.schemaVersion !== 1 ||
    value.sceneId !== input.sceneId || value.sceneSourceKind !== input.sceneSourceKind || value.taskId !== input.taskId) {
    throw new TypeError("PLANNER_EXECUTION_REQUEST_MISMATCH");
  }
  let contextFiles: readonly ContextFile[];
  try {
    const root = await realpath(paths.workspaceContextRoot);
    if ((await lstat(paths.workspaceContextRoot)).isSymbolicLink()) throw new Error("symlink");
    contextFiles = (await readContextTree(root)).map(({ inputRef, contentHash }) => ({ inputRef, contentHash }));
  } catch (cause) {
    throw new TypeError("PLANNER_EXECUTION_CONTEXT_CHANGED", { cause });
  }
  const expected: PlannerExecutionRequest = {
    kind: "worldkit-planner-execution-request", schemaVersion: 1,
    sceneId: input.sceneId, sceneSourceKind: input.sceneSourceKind, taskId: input.taskId,
    routerRequestId: value.routerRequestId,
    instructionHash: sha256Bytes(await readStableFile(paths.instructionPath)) as Sha256HashV1,
    contextFiles,
  };
  if (!isEqual(value, expected)) throw new TypeError("PLANNER_EXECUTION_CONTEXT_CHANGED");
  return paths;
}

async function writeOnceOrMatch(filePath: string, bytes: Uint8Array): Promise<void> {
  try {
    await writeFile(filePath, bytes, { flag: "wx", mode: 0o400 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    if (!(await readStableFile(filePath)).equals(bytes)) {
      throw new TypeError("PLANNER_EXECUTION_REPORT_MISMATCH");
    }
  }
}

export async function replayPlannerExecutionV1(input: PlannerExecutionIdentity & Readonly<{
  requestHash: string;
  publicPlanRoot: string;
}>): Promise<PlannerExecutionReceiptV1> {
  const paths = await verifyRequest(input);
  const agentReport = await readStableFile(path.join(input.artifactRoot, "planner-self-check.json"));
  const replayRoot = await mkdtemp(path.join(paths.executionDirectoryPath, "host-replay-"));
  try {
    const reportPath = path.join(replayRoot, "planner-self-check.host.json");
    const args = [
      path.join(paths.workspaceContextRoot, CHECKER_REF),
      "--scene-source", input.sceneSourceKind, "--scene-id", input.sceneId,
      "--brief", path.join(input.artifactRoot, "scene-brief.md"),
      "--world-plan", path.join(input.publicPlanRoot, "world-plan.png"),
      "--entry", path.join(input.publicPlanRoot, "entry-whitebox-target.png"),
      "--report", reportPath,
      ...(input.sceneSourceKind === "canonical" ? [
        "--terrain-prompt", path.join(input.artifactRoot, "terrain-height-intent-prompt.md"),
        "--terrain-intent", path.join(input.publicPlanRoot, "terrain-height-intent.png"),
      ] : []),
    ];
    const result = await new Promise<boolean>((resolve) => {
      const child = spawn(process.execPath, args, { shell: false, stdio: ["ignore", "ignore", "ignore"] });
      let cancelled = false;
      const forward = (signal: NodeJS.Signals) => { cancelled = true; child.kill(signal); };
      const interrupt = () => forward("SIGINT");
      const terminate = () => forward("SIGTERM");
      process.once("SIGINT", interrupt);
      process.once("SIGTERM", terminate);
      const finish = (passed: boolean) => {
        process.removeListener("SIGINT", interrupt);
        process.removeListener("SIGTERM", terminate);
        resolve(passed && !cancelled);
      };
      child.once("error", () => finish(false));
      child.once("close", (code, signal) => finish(code === 0 && signal === null));
    });
    // Persist the exact Host verdict even when the checker rejects. Untrusted
    // subprocess output is never interpolated into a public diagnostic.
    const hostReport = await readStableFile(reportPath).catch((cause: unknown) => {
      throw new TypeError("PLANNER_EXECUTION_REPORT_MISSING", { cause });
    });
    await writeOnceOrMatch(path.join(paths.executionDirectoryPath, "planner-self-check.host.json"), hostReport);
    if (!result) throw new TypeError("PLANNER_EXECUTION_SELF_CHECK_FAILED");
    await verifyRequest(input);
    if (!agentReport.equals(hostReport) || !agentReport.equals(await readStableFile(
      path.join(input.artifactRoot, "planner-self-check.json"),
    ))) throw new TypeError("PLANNER_EXECUTION_REPORT_MISMATCH");
    const receipt: PlannerExecutionReceiptV1 = {
      kind: "worldkit-planner-execution-receipt", schemaVersion: 1,
      sceneId: input.sceneId, sceneSourceKind: input.sceneSourceKind, taskId: input.taskId,
      requestHash: input.requestHash as Sha256HashV1,
      plannerSelfCheckHash: sha256Bytes(hostReport) as Sha256HashV1,
    };
    const receiptBytes = new TextEncoder().encode(stringifyCanonicalJson(receipt));
    await writeOnceOrMatch(path.join(paths.executionDirectoryPath, "receipt.json"), receiptBytes);
    const pointer = path.join(replayRoot, "planner-execution.json");
    await writeFile(pointer, receiptBytes, { flag: "wx", mode: 0o400 });
    await rename(pointer, path.join(input.artifactRoot, "planner-execution.json"));
    return receipt;
  } finally {
    await rm(replayRoot, { recursive: true, force: true });
  }
}

export async function verifyAcceptedPlannerExecutionV1(input: PlannerIdentity & Readonly<{
  plannerSelfCheckPath: string;
  requiredNativeProductionContext?: typeof NATIVE_BLOCK_PLANNER_BUDGET_CONTEXT_V1;
}>): Promise<PlannerExecutionReceiptV1> {
  const bytes = await readStableFile(path.join(input.artifactRoot, "planner-execution.json"));
  const value = JSON.parse(bytes.toString("utf8")) as PlannerExecutionReceiptV1;
  assertId(value.taskId);
  const expected: PlannerExecutionReceiptV1 = {
    kind: "worldkit-planner-execution-receipt", schemaVersion: 1,
    sceneId: input.sceneId, sceneSourceKind: input.sceneSourceKind,
    taskId: value.taskId, requestHash: value.requestHash, plannerSelfCheckHash: value.plannerSelfCheckHash,
  };
  if (!isEqual(value, expected) || !HASH.test(value.plannerSelfCheckHash)) {
    throw new TypeError("PLANNER_EXECUTION_REQUEST_MISMATCH");
  }
  const paths = await verifyRequest({ ...input, taskId: value.taskId, requestHash: value.requestHash });
  if (input.requiredNativeProductionContext !== undefined) {
    const frozenContext = await readStableFile(path.join(paths.workspaceContextRoot,
      NATIVE_BLOCK_PLANNER_BUDGET_CONTEXT_REF_V1));
    if (input.sceneSourceKind !== "babylon-native" || !isEqual(
      JSON.parse(frozenContext.toString("utf8")), input.requiredNativeProductionContext,
    )) throw new TypeError("PLANNER_EXECUTION_PRODUCTION_BUDGET_MISMATCH");
  }
  if (!bytes.equals(await readStableFile(path.join(paths.executionDirectoryPath, "receipt.json")))) {
    throw new TypeError("PLANNER_EXECUTION_REQUEST_MISMATCH");
  }
  for (const reportPath of [input.plannerSelfCheckPath, path.join(paths.executionDirectoryPath, "planner-self-check.host.json")]) {
    if (sha256Bytes(await readStableFile(reportPath)) !== value.plannerSelfCheckHash) {
      throw new TypeError("PLANNER_EXECUTION_REPORT_MISMATCH");
    }
  }
  return value;
}

// Native Case publication replaces the transient Planner artifact directory.
// Retain this Host-owned execution record with it, not in the disposable .task
// workspace and not in the Builder's declared generation outputs.
export async function copyAcceptedPlannerExecutionV1(input: PlannerIdentity & Readonly<{
  destinationArtifactRoot: string;
  sourcePlannerSelfCheckPath: string;
  destinationPlannerSelfCheckPath: string;
}>): Promise<void> {
  const receipt = await verifyAcceptedPlannerExecutionV1({ ...input, plannerSelfCheckPath: input.sourcePlannerSelfCheckPath });
  const source = executionPaths({ ...input, taskId: receipt.taskId });
  const destination = executionPaths({ ...input, artifactRoot: input.destinationArtifactRoot, taskId: receipt.taskId });
  await mkdir(path.dirname(destination.executionDirectoryPath), { recursive: true, mode: 0o700 });
  // Reserve the destination exclusively before cp: cp alone may merge directories.
  await mkdir(destination.executionDirectoryPath, { mode: 0o700 });
  await cp(source.executionDirectoryPath, destination.executionDirectoryPath, {
    recursive: true, force: false, errorOnExist: true, dereference: false,
  });
  await copyFile(path.join(input.artifactRoot, "planner-execution.json"),
    path.join(input.destinationArtifactRoot, "planner-execution.json"), constants.COPYFILE_EXCL);
  await verifyAcceptedPlannerExecutionV1({ ...input, artifactRoot: input.destinationArtifactRoot,
    plannerSelfCheckPath: input.destinationPlannerSelfCheckPath });
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  const values: Record<string, string> = {};
  const allowed = new Set(["--repository-root", "--artifact-root", "--public-plan-root", "--scene-id", "--scene-source", "--task-id", "--request-id", "--instruction", "--request-hash"]);
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]!;
    if (!allowed.has(key) || values[key] !== undefined || args[i + 1] === undefined) throw new TypeError("PLANNER_EXECUTION_ARGUMENTS_INVALID");
    values[key] = args[i + 1]!;
  }
  const required = (key: string) => {
    const value = values[key];
    if (value === undefined) throw new TypeError(`PLANNER_EXECUTION_ARGUMENT_MISSING:${key}`);
    return value;
  };
  const identity: PlannerIdentity = {
    artifactRoot: required("--artifact-root"), sceneId: required("--scene-id"),
    sceneSourceKind: required("--scene-source") as SceneSource,
  };
  if (command === "prepare") {
    const prepared = await preparePlannerExecutionV1({
      ...identity, taskId: required("--task-id"), routerRequestId: required("--request-id"),
      repositoryRoot: required("--repository-root"), instructionPath: required("--instruction"),
    });
    process.stdout.write(`${prepared.requestHash}\n`);
  } else if (command === "replay") {
    await replayPlannerExecutionV1({ ...identity, taskId: required("--task-id"), requestHash: required("--request-hash"), publicPlanRoot: required("--public-plan-root") });
  } else if (command === "replay-accepted") {
    const accepted = await verifyAcceptedPlannerExecutionV1({ ...identity, plannerSelfCheckPath: path.join(identity.artifactRoot, "planner-self-check.json") });
    await replayPlannerExecutionV1({ ...identity, taskId: accepted.taskId, requestHash: accepted.requestHash, publicPlanRoot: required("--public-plan-root") });
  } else throw new TypeError("PLANNER_EXECUTION_COMMAND_INVALID");
}

if (!isNil(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : "PLANNER_EXECUTION_FAILED"}\n`);
    process.exitCode = 2;
  });
}
