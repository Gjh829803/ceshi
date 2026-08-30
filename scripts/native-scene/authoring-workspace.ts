import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";

import {
  parseNativeSceneDiagnosticV1,
  type NativeSceneDiagnosticLocationV1,
  type NativeSceneDiagnosticStageV1,
  type NativeSceneDiagnosticV1,
} from "@whitebox-world/native-babylon";
import {
  parseBabylonNativeSceneBootstrapV1,
  type BabylonNativeSceneBootstrapV1,
} from "@whitebox-world/runtime-contracts";

const BOOTSTRAP_FILE_NAME = "native-scene.bootstrap.json";
const ENTRY_SOURCE_PATH = "scene.ts";

export interface BabylonNativeAuthoringWorkspaceRootV1 {
  readonly worldDirectoryPath: string;
  readonly bootstrap: BabylonNativeSceneBootstrapV1;
  readonly entrySourcePath: typeof ENTRY_SOURCE_PATH;
}

export type ReadBabylonNativeAuthoringWorkspaceRootResultV1 =
  | Readonly<{
      outcome: "passed";
      workspaceRoot: BabylonNativeAuthoringWorkspaceRootV1;
    }>
  | Readonly<{
      outcome: "rejected" | "tool-error";
      diagnostics: readonly NativeSceneDiagnosticV1[];
    }>;

interface NativeWorkspaceDiagnosticInputV1 {
  readonly code: string;
  readonly stage: NativeSceneDiagnosticStageV1;
  readonly message: string;
  readonly repairHint: string;
  readonly location?: NativeSceneDiagnosticLocationV1;
}

export function createNativeWorkspaceDiagnosticV1(
  input: NativeWorkspaceDiagnosticInputV1,
): NativeSceneDiagnosticV1 {
  return parseNativeSceneDiagnosticV1({
    kind: "native-scene-diagnostic",
    schemaVersion: 1,
    id: `native-scene-source.${input.code.toLowerCase()}`,
    severity: "error",
    stage: input.stage,
    code: input.code,
    location: input.location ?? { kind: "none" },
    measurement: { kind: "none" },
    message: input.message,
    repairHint: input.repairHint,
  });
}

function failed(
  outcome: "rejected" | "tool-error",
  diagnostic: NativeSceneDiagnosticV1,
): ReadBabylonNativeAuthoringWorkspaceRootResultV1 {
  return Object.freeze({
    outcome,
    diagnostics: Object.freeze([diagnostic]),
  });
}

function bootstrapLocation(
  instancePath = "",
): NativeSceneDiagnosticLocationV1 {
  return Object.freeze({ kind: "bootstrap", instancePath });
}

function sourceLocation(sourcePath: string): NativeSceneDiagnosticLocationV1 {
  return Object.freeze({
    kind: "source",
    sourcePath,
    lineNumber: 1,
    columnNumber: 1,
  });
}

export async function readBabylonNativeAuthoringWorkspaceRootV1(
  requestedWorldDirectoryPath: string,
): Promise<ReadBabylonNativeAuthoringWorkspaceRootResultV1> {
  const resolvedWorldDirectoryPath = path.resolve(requestedWorldDirectoryPath);
  let worldDirectoryPath: string;
  try {
    const requestedStats = await lstat(resolvedWorldDirectoryPath);
    if (requestedStats.isSymbolicLink()) {
      return failed("rejected", createNativeWorkspaceDiagnosticV1({
        code: "WORLDKIT_NATIVE_SCENE_SOURCE_SYMLINK_FORBIDDEN",
        stage: "dependency",
        location: sourceLocation("."),
        message: "Native authoring workspace roots cannot be symbolic links.",
        repairHint: "Use one real workspace directory owned by the current world.",
      }));
    }
    if (!requestedStats.isDirectory()) throw new Error("not-directory");
    worldDirectoryPath = await realpath(resolvedWorldDirectoryPath);
  } catch {
    return failed("tool-error", createNativeWorkspaceDiagnosticV1({
      code: "WORLDKIT_NATIVE_SCENE_WORKSPACE_UNAVAILABLE",
      stage: "tooling",
      message: "The Native authoring workspace is unavailable.",
      repairHint: "Provide one existing readable world directory.",
    }));
  }

  const bootstrapPath = path.join(worldDirectoryPath, BOOTSTRAP_FILE_NAME);
  let bootstrapSource: string;
  try {
    const bootstrapStats = await lstat(bootstrapPath);
    if (bootstrapStats.isSymbolicLink()) {
      return failed("rejected", createNativeWorkspaceDiagnosticV1({
        code: "WORLDKIT_NATIVE_SCENE_SOURCE_SYMLINK_FORBIDDEN",
        stage: "dependency",
        location: sourceLocation(BOOTSTRAP_FILE_NAME),
        message: "Native Bootstrap cannot be a symbolic link.",
        repairHint: "Store the Bootstrap directly inside the world directory.",
      }));
    }
    if (!bootstrapStats.isFile()) throw new Error("not-file");
    bootstrapSource = await readFile(bootstrapPath, "utf8");
  } catch (error) {
    const isMissing = error instanceof Error &&
      "code" in error && error.code === "ENOENT";
    return failed("rejected", createNativeWorkspaceDiagnosticV1({
      code: isMissing
        ? "WORLDKIT_NATIVE_SCENE_BOOTSTRAP_MISSING"
        : "WORLDKIT_NATIVE_SCENE_BOOTSTRAP_INVALID",
      stage: "bootstrap",
      location: bootstrapLocation(),
      message: isMissing
        ? "The Native Scene Bootstrap is missing."
        : "The Native Scene Bootstrap is not a readable regular file.",
      repairHint: `Write the exact ${BOOTSTRAP_FILE_NAME} contract.`,
    }));
  }

  let bootstrap: BabylonNativeSceneBootstrapV1;
  try {
    bootstrap = parseBabylonNativeSceneBootstrapV1(
      JSON.parse(bootstrapSource) as unknown,
    );
  } catch {
    return failed("rejected", createNativeWorkspaceDiagnosticV1({
      code: "WORLDKIT_NATIVE_SCENE_BOOTSTRAP_INVALID",
      stage: "bootstrap",
      location: bootstrapLocation(),
      message: "The Native Scene Bootstrap failed its exact parser.",
      repairHint: "Repair the closed Bootstrap fields before checking source.",
    }));
  }

  const entryAbsolutePath = path.join(worldDirectoryPath, ENTRY_SOURCE_PATH);
  try {
    const entryStats = await lstat(entryAbsolutePath);
    if (entryStats.isSymbolicLink()) {
      return failed("rejected", createNativeWorkspaceDiagnosticV1({
        code: "WORLDKIT_NATIVE_SCENE_SOURCE_SYMLINK_FORBIDDEN",
        stage: "dependency",
        location: sourceLocation(ENTRY_SOURCE_PATH),
        message: "Native scene.ts cannot be a symbolic link.",
        repairHint: "Store scene.ts directly inside the world directory.",
      }));
    }
    if (!entryStats.isFile()) throw new Error("not-file");
    await readFile(entryAbsolutePath, "utf8");
  } catch {
    return failed("rejected", createNativeWorkspaceDiagnosticV1({
      code: "WORLDKIT_NATIVE_SCENE_DEPENDENCY_UNRESOLVED",
      stage: "dependency",
      location: sourceLocation(ENTRY_SOURCE_PATH),
      message: "The Native scene.ts entry is missing or unreadable.",
      repairHint: "Provide one readable regular scene.ts entry file.",
    }));
  }

  return Object.freeze({
    outcome: "passed",
    workspaceRoot: Object.freeze({
      worldDirectoryPath,
      bootstrap,
      entrySourcePath: ENTRY_SOURCE_PATH,
    }),
  });
}
