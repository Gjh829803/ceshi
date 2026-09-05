import { spawn } from "node:child_process";
import {
  constants,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseSceneBriefV1 } from "@whitebox-world/authoring";
import { parseWorldReconstructionCaseV1 } from "@whitebox-world/validation";
import {
  sha256Bytes,
  stringifyCanonicalJson,
  type Sha256HashV1,
} from "@whitebox-world/protocol";
import { isEqual, isNil } from "lodash-es";

import { parseWorldAgentArgumentsV1, type WorldAgentRequestV1 } from "../agents/run-world-agent.js";
import { copyAcceptedPlannerExecutionV1, verifyAcceptedPlannerExecutionV1 } from "../agents/planner-execution.js";
import { NATIVE_BLOCK_PLANNER_BUDGET_CONTEXT_V1 } from "./native-block-production-budget.js";
import {
  nativeWorldReferenceInputRefV1,
  nativeWorldReferenceMediaTypeV1,
  validateNativeWorldReferenceImageV1,
} from "./native-world-reference-media.js";
import {
  deriveNativeWorldBaselineProposalV1,
  prepareNativeWorldCaseV1,
  type FrozenNativeWorldReferenceInputV1,
  validateNativeWorldPlannerInputClosureV1,
} from "./native-world-case-preparation.js";

function run(
  command: string,
  arguments_: readonly string[],
  cwd: string,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, arguments_, {
      cwd,
      env: process.env,
      shell: false,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("close", (exitCode, signal) => {
      if (signal !== null) {
        reject(new Error(`NATIVE_WORLD_CHILD_SIGNAL:${signal}`));
        return;
      }
      resolve(exitCode ?? 1);
    });
  });
}

async function exists(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await lstat(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

interface BigIntFileSnapshot {
  readonly dev: bigint;
  readonly ino: bigint;
  readonly mode: bigint;
  readonly size: bigint;
  readonly mtimeNs: bigint;
  readonly ctimeNs: bigint;
  isFile(): boolean;
}

function sameStableFileSnapshot(
  left: BigIntFileSnapshot,
  right: BigIntFileSnapshot,
): boolean {
  return left.dev === right.dev &&
    left.ino === right.ino &&
    left.mode === right.mode &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs;
}

async function readStableRegularFileNoFollow(
  filePath: string,
  failureCode: string,
): Promise<Uint8Array> {
  let handle;
  try {
    handle = await open(
      filePath,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
  } catch (cause) {
    throw new TypeError(failureCode, { cause });
  }
  try {
    const before = await handle.stat({ bigint: true }) as BigIntFileSnapshot;
    if (!before.isFile()) throw new TypeError(failureCode);
    const bytes = new Uint8Array(await handle.readFile());
    const after = await handle.stat({ bigint: true }) as BigIntFileSnapshot;
    if (
      !after.isFile() ||
      !sameStableFileSnapshot(before, after) ||
      bytes.byteLength !== Number(before.size)
    ) {
      throw new TypeError(failureCode);
    }
    return bytes;
  } finally {
    await handle.close();
  }
}

export interface FrozenNativeWorldPlannerReferenceV1
  extends FrozenNativeWorldReferenceInputV1 {
  readonly plannerImagePath: string;
}

export async function freezeNativeWorldReferenceInputsV1(input: Readonly<{
  sourcePaths: readonly string[];
  snapshotDirectoryPath: string;
}>): Promise<readonly FrozenNativeWorldPlannerReferenceV1[]> {
  await mkdir(input.snapshotDirectoryPath, { mode: 0o700 });
  try {
    const references: FrozenNativeWorldPlannerReferenceV1[] = [];
    for (let index = 0; index < input.sourcePaths.length; index += 1) {
      const sourcePath = input.sourcePaths[index]!;
      const mediaType = nativeWorldReferenceMediaTypeV1(sourcePath);
      const inputRef = nativeWorldReferenceInputRefV1(index, mediaType);
      const bytes = await readStableRegularFileNoFollow(
        sourcePath,
        "NATIVE_WORLD_REFERENCE_FILE_INVALID",
      );
      await validateNativeWorldReferenceImageV1(bytes, mediaType);
      const contentHash = sha256Bytes(bytes) as Sha256HashV1;
      const plannerImagePath = path.join(
        input.snapshotDirectoryPath,
        inputRef,
      );
      await writeFile(plannerImagePath, bytes, {
        flag: "wx",
        mode: 0o400,
      });
      const snapshotBytes = await readStableRegularFileNoFollow(
        plannerImagePath,
        "NATIVE_WORLD_REFERENCE_SNAPSHOT_INVALID",
      );
      if (sha256Bytes(snapshotBytes) !== contentHash) {
        throw new TypeError("NATIVE_WORLD_REFERENCE_SNAPSHOT_INVALID");
      }
      references.push(Object.freeze({
        inputRef,
        contentHash,
        mediaType,
        bytes,
        plannerImagePath,
      }));
    }
    return Object.freeze(references);
  } catch (error) {
    await rm(input.snapshotDirectoryPath, { recursive: true, force: true });
    throw error;
  }
}

async function assertFrozenPlannerReferencesUnchanged(
  references: readonly FrozenNativeWorldPlannerReferenceV1[],
): Promise<void> {
  for (const reference of references) {
    const bytes = await readStableRegularFileNoFollow(
      reference.plannerImagePath,
      "NATIVE_WORLD_REFERENCE_SNAPSHOT_INVALID",
    );
    if (sha256Bytes(bytes) !== reference.contentHash) {
      throw new TypeError("NATIVE_WORLD_REFERENCE_SNAPSHOT_INVALID");
    }
  }
}

export type NativeWorldAgentResultV1 = Readonly<{
  kind: "native-world-plan-result";
  schemaVersion: 1;
  sceneId: string;
  sceneSourceKind: "babylon-native";
  casePath: string;
  phase: "plan-ready";
  exitCode: 0;
}> | Readonly<{
  kind: "native-world-agent-result";
  schemaVersion: 1;
  sceneId: string;
  sceneSourceKind: "babylon-native";
  casePath: string;
  outputDirectoryPath: string;
  exitCode: number;
}>;

export async function runNativeWorldAgentV1(request: WorldAgentRequestV1, options: Readonly<{
  repositoryRoot: string;
  backend: "cloud" | "local";
  runProcess: typeof run;
}>): Promise<NativeWorldAgentResultV1> {
  if (request.sceneSourceKind !== "babylon-native") {
    throw new TypeError("NATIVE_WORLD_AGENT_SOURCE_INVALID");
  }
  const { backend, repositoryRoot, runProcess } = options;
  if (backend !== "cloud" && backend !== "local") {
    throw new TypeError("WORLDKIT_CODEX_BACKEND must be cloud or local.");
  }
  const artifactRoot = path.join(repositoryRoot, "artifacts/scenes", request.sceneId);
  const publicPlanRoot = path.join(
    repositoryRoot,
    "apps/playground/public/scene-plans",
    request.sceneId,
  );
  const casePath = path.join(artifactRoot, "case.json");
  const temporaryRoot = path.join(repositoryRoot, ".codex-tmp");
  await mkdir(temporaryRoot, { recursive: true });
  const taskRoot = await mkdtemp(path.join(temporaryRoot, "native-world-agent."));
  let stagedCaseRoot: string | undefined;
  try {
    const references = request.mode === "build" ? [] : await freezeNativeWorldReferenceInputsV1({
      sourcePaths: request.imagePaths,
      snapshotDirectoryPath: path.join(taskRoot, "reference-inputs"),
    });
    const inputIdentity = Object.freeze({
      kind: "native-world-generation-input",
      schemaVersion: 1,
      sceneId: request.sceneId,
      sceneSourceKind: "babylon-native",
      prompt: request.prompt,
      references: references.map(({ inputRef, contentHash }) => ({
        inputRef,
        contentHash,
      })),
    });
    const inputIdentityPath = path.join(artifactRoot, "native-world-input.json");
    if (await exists(casePath)) {
      let frozenIdentity: unknown;
      try {
        frozenIdentity = JSON.parse(await readFile(inputIdentityPath, "utf8"));
      } catch {
        throw new Error("NATIVE_WORLD_CASE_INPUT_IDENTITY_MISSING");
      }
      // Build-only consumes the existing admitted plan and its frozen references;
      // it must not compare them with a synthetic new prompt / empty image list.
      if (request.mode !== "build" && !isEqual(frozenIdentity, inputIdentity)) {
        throw new Error("NATIVE_WORLD_CASE_INPUT_IDENTITY_MISMATCH");
      }
    } else {
      if (request.mode === "build") throw new Error("NATIVE_WORLD_PLAN_REQUIRED");
      if (await pathExists(artifactRoot) || await pathExists(publicPlanRoot)) {
        throw new Error("NATIVE_WORLD_CASE_PARTIAL_EXISTS");
      }
      const artifactParent = path.dirname(artifactRoot);
      await mkdir(artifactParent, { recursive: true });
      stagedCaseRoot = await mkdtemp(path.join(
        artifactParent,
        `.${request.sceneId}.native-case-`,
      ));
      const plannerArguments = [
        "scripts/agents/run-canonical-world-agent.sh",
        "--scene-source",
        "babylon-native",
        "--plan-only",
        "--",
        "--scene-id",
        request.sceneId,
      ];
      for (const { plannerImagePath } of references) {
        plannerArguments.push("--image", plannerImagePath);
      }
      plannerArguments.push(request.prompt);
      const plannerExit = await runProcess("bash", plannerArguments, repositoryRoot);
      if (plannerExit !== 0) {
        throw new Error(`NATIVE_WORLD_UNIFIED_PLANNING_FAILED:${plannerExit}`);
      }
      await assertFrozenPlannerReferencesUnchanged(references);

      const briefPath = path.join(artifactRoot, "scene-brief.md");
      const worldPlanPath = path.join(publicPlanRoot, "world-plan.png");
      const entryTargetPath = path.join(
        publicPlanRoot,
        "entry-whitebox-target.png",
      );
      const plannerSelfCheckPath = path.join(
        artifactRoot,
        "planner-self-check.json",
      );
      const visualIdentityPalettePath = path.join(
        artifactRoot,
        "visual-identity-palette.json",
      );
      const sceneBrief = parseSceneBriefV1(
        await readFile(briefPath, "utf8"),
      );
      if (!sceneBrief.ok) {
        throw new TypeError("NATIVE_WORLD_SCENE_BRIEF_INVALID");
      }
      const proposalPath = path.join(taskRoot, "host-derived-baseline-case.json");
      await writeFile(
        proposalPath,
        stringifyCanonicalJson(await deriveNativeWorldBaselineProposalV1({
          sceneId: request.sceneId,
          sceneBriefSemanticHash:
            sceneBrief.sceneBriefHash as Sha256HashV1,
          visualIdentityPalettePath,
          entryWhiteboxTargetPath: entryTargetPath,
        })),
        { encoding: "utf8", flag: "wx", mode: 0o600 },
      );
      await prepareNativeWorldCaseV1({
        repositoryRoot,
        sceneId: request.sceneId,
        proposalPath,
        sceneBriefPath: briefPath,
        uploadedReferenceInputs: references.map(({
          inputRef,
          contentHash,
          mediaType,
          bytes,
        }) => Object.freeze({ inputRef, contentHash, mediaType, bytes })),
        planningImagePaths: {
          worldPlanPath,
          entryWhiteboxTargetPath: entryTargetPath,
        },
        visualIdentityPalettePath,
        plannerSelfCheckPath,
        outputCaseRoot: stagedCaseRoot,
      });
      await copyAcceptedPlannerExecutionV1({
        artifactRoot,
        destinationArtifactRoot: stagedCaseRoot,
        sceneId: request.sceneId,
        sceneSourceKind: "babylon-native",
        sourcePlannerSelfCheckPath: plannerSelfCheckPath,
        destinationPlannerSelfCheckPath: path.join(stagedCaseRoot, "inputs/planner-self-check.json"),
      });
      for (const fileName of [
        "scene-brief.md",
        "visual-identity-palette.json",
      ]) {
        await copyFile(
          path.join(artifactRoot, fileName),
          path.join(stagedCaseRoot, fileName),
          constants.COPYFILE_EXCL,
        );
      }
      await writeFile(
        path.join(stagedCaseRoot, "native-world-input.json"),
        stringifyCanonicalJson(inputIdentity),
        { encoding: "utf8", flag: "wx", mode: 0o600 },
      );
      await rm(artifactRoot, { recursive: true, force: true });
      await rename(stagedCaseRoot, artifactRoot);
      stagedCaseRoot = undefined;
    }

    await verifyAcceptedPlannerExecutionV1({
      artifactRoot,
      sceneId: request.sceneId,
      sceneSourceKind: "babylon-native",
      plannerSelfCheckPath: path.join(artifactRoot, "inputs/planner-self-check.json"),
      requiredNativeProductionContext: NATIVE_BLOCK_PLANNER_BUDGET_CONTEXT_V1,
    });
    const reconstructionCase = parseWorldReconstructionCaseV1(JSON.parse(await readFile(casePath, "utf8")));
    await validateNativeWorldPlannerInputClosureV1({
      reconstructionCase,
      inputDirectoryPath: path.join(artifactRoot, "inputs"),
    });

    if (request.mode === "plan") {
      return Object.freeze({
        kind: "native-world-plan-result", schemaVersion: 1,
        sceneId: request.sceneId, sceneSourceKind: "babylon-native",
        casePath, phase: "plan-ready", exitCode: 0,
      });
    }

    const runId = `run-${new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14)}-${process.pid}`;
    const outputDirectoryPath = path.join(artifactRoot, "runs", runId);
    let exitCode = await runProcess(
      "pnpm",
      [
        "worldkit",
        "reconstruct",
        "run",
        casePath,
        "--output",
        outputDirectoryPath,
        "--backend",
        backend,
        "--visual-capture-scope",
        "complete-targets",
        "--json",
      ],
      repositoryRoot,
    );
    const primaryReference = reconstructionCase.referenceInputs.find(input =>
      /^reference-0\.(png|jpg|webp)$/.test(input.inputRef));
    if (exitCode === 0 && primaryReference !== undefined) {
      // Like the old scene chain, styling follows accepted whitebox capture only
      // when a user appearance reference exists. Build-only uses frozen Case bytes.
      process.stdout.write("WORLDKIT_STAGE visual-imagegen\n");
      exitCode = await runProcess("bash", [
        path.join(repositoryRoot, "scripts/visual/run-styled-opening-frame-agent.sh"),
        "--scene-source", "babylon-native", "--scene-id", request.sceneId,
        "--user-frame", path.join(artifactRoot, "inputs", primaryReference.inputRef),
        "--backend", backend,
      ], repositoryRoot);
    }
    if (exitCode === 0) process.stdout.write("WORLDKIT_STAGE ready\n");
    return Object.freeze({
      kind: "native-world-agent-result",
      schemaVersion: 1,
      sceneId: request.sceneId,
      sceneSourceKind: "babylon-native",
      casePath,
      outputDirectoryPath,
      exitCode,
    });
  } finally {
    if (stagedCaseRoot !== undefined) {
      await rm(stagedCaseRoot, { recursive: true, force: true });
    }
    // Keep paid Planner delivery and its frozen execution record on failure.
    // A partial directory is not an admitted Case; the existing PARTIAL_EXISTS
    // guard prevents silent regeneration/overwrite until explicit stage resume.
    await rm(taskRoot, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  const request = parseWorldAgentArgumentsV1(process.argv.slice(2));
  if (process.env.WORLDKIT_PROMPT_SMOKE === "1") {
    process.stdout.write(
      "WORLDKIT_NATIVE_WORLD_SMOKE_OK unified-planning native-generation native-check package runtime capture evaluation final-publication\n",
    );
    return;
  }
  const backend = process.env.WORLDKIT_CODEX_BACKEND ?? "cloud";
  if (backend !== "cloud" && backend !== "local") throw new TypeError("WORLDKIT_CODEX_BACKEND must be cloud or local.");
  const result = await runNativeWorldAgentV1(request, {
    repositoryRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."),
    backend,
    runProcess: run,
  });
  if (result.kind === "native-world-plan-result") process.stdout.write("WORLDKIT_STAGE plan-ready\n");
  process.stdout.write(`${stringifyCanonicalJson(result)}\n`);
  if (result.exitCode !== 0) process.exitCode = result.exitCode;
}

if (!isNil(process.argv[1]) &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  });
}
