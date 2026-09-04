import { spawn } from "node:child_process";
import {
  constants,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  sha256Bytes,
  stringifyCanonicalJson,
} from "@whitebox-world/protocol";
import { isEqual, isNil } from "lodash-es";

import { parseWorldAgentArgumentsV1 } from "../agents/run-world-agent.js";
import {
  deriveNativeWorldBaselineProposalV1,
  prepareNativeWorldCaseV1,
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

async function main(): Promise<void> {
  const request = parseWorldAgentArgumentsV1(process.argv.slice(2));
  if (request.sceneSourceKind !== "babylon-native") {
    throw new TypeError("NATIVE_WORLD_AGENT_SOURCE_INVALID");
  }
  if (process.env.WORLDKIT_PROMPT_SMOKE === "1") {
    process.stdout.write(
      "WORLDKIT_NATIVE_WORLD_SMOKE_OK unified-planning native-generation native-check package runtime capture evaluation final-publication\n",
    );
    return;
  }
  const backend = process.env.WORLDKIT_CODEX_BACKEND ?? "cloud";
  if (backend !== "cloud" && backend !== "local") {
    throw new TypeError("WORLDKIT_CODEX_BACKEND must be cloud or local.");
  }
  const repositoryRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../..",
  );
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
  let ownsPlannerOutputs = false;
  try {
    const references = await Promise.all(request.imagePaths.map(
      async (sourcePath, index) => {
        const extension = path.extname(sourcePath).toLowerCase();
        if (extension !== ".png" && extension !== ".jpg" &&
          extension !== ".jpeg") {
          throw new TypeError("NATIVE_WORLD_REFERENCE_MEDIA_TYPE_INVALID");
        }
        const bytes = await readFile(sourcePath);
        return Object.freeze({
          sourcePath,
          bytes,
          inputRef: `reference-${index}${extension === ".jpeg" ? ".jpg" : extension}`,
          contentHash: sha256Bytes(bytes),
        });
      },
    ));
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
      if (!isEqual(frozenIdentity, inputIdentity)) {
        throw new Error("NATIVE_WORLD_CASE_INPUT_IDENTITY_MISMATCH");
      }
    } else {
      if (await pathExists(artifactRoot) || await pathExists(publicPlanRoot)) {
        throw new Error("NATIVE_WORLD_CASE_PARTIAL_EXISTS");
      }
      const artifactParent = path.dirname(artifactRoot);
      await mkdir(artifactParent, { recursive: true });
      stagedCaseRoot = await mkdtemp(path.join(
        artifactParent,
        `.${request.sceneId}.native-case-`,
      ));
      ownsPlannerOutputs = true;
      const plannerArguments = [
        "scripts/agents/run-canonical-world-agent.sh",
        "--scene-source",
        "babylon-native",
        "--plan-only",
        "--",
        "--scene-id",
        request.sceneId,
      ];
      for (const sourcePath of request.imagePaths) {
        plannerArguments.push("--image", sourcePath);
      }
      plannerArguments.push(request.prompt);
      const plannerExit = await run("bash", plannerArguments, repositoryRoot);
      if (plannerExit !== 0) {
        throw new Error(`NATIVE_WORLD_UNIFIED_PLANNING_FAILED:${plannerExit}`);
      }

      const briefPath = path.join(artifactRoot, "scene-brief.md");
      const worldPlanPath = path.join(publicPlanRoot, "world-plan.png");
      const entryTargetPath = path.join(
        publicPlanRoot,
        "entry-whitebox-target.png",
      );
      const proposalPath = path.join(taskRoot, "host-derived-baseline-case.json");
      await writeFile(
        proposalPath,
        stringifyCanonicalJson(await deriveNativeWorldBaselineProposalV1({
          sceneId: request.sceneId,
          visualIdentityPalettePath: path.join(
            artifactRoot,
            "visual-identity-palette.json",
          ),
          entryWhiteboxTargetPath: entryTargetPath,
        })),
        { encoding: "utf8", flag: "wx", mode: 0o600 },
      );
      await prepareNativeWorldCaseV1({
        repositoryRoot,
        sceneId: request.sceneId,
        proposalPath,
        sceneBriefPath: briefPath,
        referenceImagePaths: references.map(({ sourcePath }) => sourcePath),
        planningImagePaths: {
          worldPlanPath,
          entryWhiteboxTargetPath: entryTargetPath,
        },
        outputCaseRoot: stagedCaseRoot,
      });
      for (const fileName of [
        "scene-brief.md",
        "planner-self-check.json",
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
      ownsPlannerOutputs = false;
    }

    const runId = `run-${new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14)}-${process.pid}`;
    const outputDirectoryPath = path.join(artifactRoot, "runs", runId);
    const exitCode = await run(
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
        "--json",
      ],
      repositoryRoot,
    );
    if (exitCode !== 0) process.exitCode = exitCode;
    process.stdout.write(`${stringifyCanonicalJson({
      kind: "native-world-agent-result",
      schemaVersion: 1,
      sceneId: request.sceneId,
      sceneSourceKind: "babylon-native",
      casePath,
      outputDirectoryPath,
      exitCode,
    })}\n`);
  } finally {
    if (stagedCaseRoot !== undefined) {
      await rm(stagedCaseRoot, { recursive: true, force: true });
    }
    if (ownsPlannerOutputs) {
      await Promise.all([
        rm(artifactRoot, { recursive: true, force: true }),
        rm(publicPlanRoot, { recursive: true, force: true }),
      ]);
    }
    await rm(taskRoot, { recursive: true, force: true });
  }
}

if (!isNil(process.argv[1]) &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  });
}
