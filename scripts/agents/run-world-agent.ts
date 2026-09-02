import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  parseWorldGenerationSceneSourceKindV1,
  type WorldGenerationSceneSourceKindV1,
} from "@whitebox-world/scene-authoring-contracts";

const SCENE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{2,79}$/;

export interface WorldAgentRequestV1 {
  readonly sceneId: string;
  readonly sceneSourceKind: WorldGenerationSceneSourceKindV1;
  readonly imagePaths: readonly string[];
  readonly prompt: string;
  readonly mode: "full" | "plan" | "build";
}

export interface WorldAgentInvocationV1 {
  readonly command: "pnpm" | "bash";
  readonly arguments: readonly string[];
}

function failArguments(): never {
  throw new TypeError("WORLD_AGENT_ARGUMENTS_INVALID");
}

function takeValue(tokens: readonly string[], index: number): string {
  const value = tokens[index + 1];
  if (value === undefined || value.startsWith("--")) failArguments();
  return value;
}

export function parseWorldAgentArgumentsV1(
  inputTokens: readonly string[],
): WorldAgentRequestV1 {
  const tokens = inputTokens[0] === "--" ? inputTokens.slice(1) : [...inputTokens];
  let sceneId: string | undefined;
  let sourceInput: unknown = undefined;
  let sourceWasSet = false;
  let mode: WorldAgentRequestV1["mode"] = "full";
  let modeWasSet = false;
  const imagePaths: string[] = [];
  const promptParts: string[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]!;
    if (token === "--") continue;
    if (token === "--scene-id") {
      if (sceneId !== undefined) failArguments();
      sceneId = takeValue(tokens, index);
      index += 1;
      continue;
    }
    if (token === "--scene-source") {
      if (sourceWasSet) failArguments();
      sourceWasSet = true;
      sourceInput = takeValue(tokens, index);
      index += 1;
      continue;
    }
    if (token === "--image" || token === "-i") {
      imagePaths.push(takeValue(tokens, index));
      index += 1;
      continue;
    }
    if (token === "--plan-only" || token === "--build-only") {
      if (modeWasSet) failArguments();
      modeWasSet = true;
      mode = token === "--plan-only" ? "plan" : "build";
      continue;
    }
    if (token.startsWith("-")) failArguments();
    promptParts.push(token);
  }

  if (sceneId === undefined || !SCENE_ID_PATTERN.test(sceneId)) failArguments();
  let sceneSourceKind: WorldGenerationSceneSourceKindV1;
  try {
    sceneSourceKind = parseWorldGenerationSceneSourceKindV1(sourceInput);
  } catch {
    failArguments();
  }
  if (sceneSourceKind === "babylon-native" && mode !== "full") failArguments();
  if (mode === "build" && imagePaths.length > 0) failArguments();
  if (mode !== "build" && promptParts.length === 0) failArguments();

  return Object.freeze({
    sceneId,
    sceneSourceKind,
    imagePaths: Object.freeze([...imagePaths]),
    prompt: promptParts.length > 0
      ? promptParts.join(" ")
      : "Implement the existing Scene Brief.",
    mode,
  });
}

export function resolveWorldAgentInvocationV1(
  request: WorldAgentRequestV1,
): WorldAgentInvocationV1 {
  const commonArguments = ["--scene-id", request.sceneId];
  for (const imagePath of request.imagePaths) {
    commonArguments.push("--image", imagePath);
  }
  if (request.prompt.length > 0) commonArguments.push(request.prompt);

  if (request.sceneSourceKind === "babylon-native") {
    return Object.freeze({
      command: "pnpm",
      arguments: Object.freeze([
        "exec",
        "tsx",
        "scripts/reconstruction/run-native-world-agent.ts",
        ...commonArguments,
      ]),
    });
  }

  const canonicalArguments = [
    "scripts/agents/run-canonical-world-agent.sh",
    "--scene-source",
    "canonical",
  ];
  if (request.mode === "plan") canonicalArguments.push("--plan-only");
  if (request.mode === "build") canonicalArguments.push("--build-only");
  canonicalArguments.push("--", ...commonArguments);
  return Object.freeze({
    command: "bash",
    arguments: Object.freeze(canonicalArguments),
  });
}

async function main(): Promise<void> {
  const request = parseWorldAgentArgumentsV1(process.argv.slice(2));
  const invocation = resolveWorldAgentInvocationV1(request);
  const repositoryRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../..",
  );
  await new Promise<void>((resolve, reject) => {
    const child = spawn(invocation.command, invocation.arguments, {
      cwd: repositoryRoot,
      env: process.env,
      shell: false,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("close", (exitCode, signal) => {
      if (signal !== null) {
        reject(new Error(`WORLD_AGENT_CHILD_SIGNAL:${signal}`));
        return;
      }
      process.exitCode = exitCode ?? 1;
      resolve();
    });
  });
}

if (process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 2;
  });
}
