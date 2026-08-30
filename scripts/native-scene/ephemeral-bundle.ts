import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  BABYLON_NATIVE_DEEP_ESM_IMPORT_SPECIFIERS_V1,
  defineBabylonNativeScene,
  type BabylonNativeSceneModuleV1,
  type NativeSceneDiagnosticLocationV1,
  type NativeSceneDiagnosticV1,
} from "@whitebox-world/native-babylon";
import { isEqual, isNil, orderBy } from "lodash-es";
import ts from "typescript";
import { build as viteBuild } from "vite";

import { createNativeWorkspaceDiagnosticV1 } from "./authoring-workspace.js";
import type { AdmittedBabylonNativeSourceGraphV1 } from "./source-admission.js";

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, "../..");
const BUNDLE_PARENT = path.join(
  REPOSITORY_ROOT,
  ".codex-tmp/native-scene-check",
);
const EXTERNAL_IMPORTS = new Set<string>([
  "@whitebox-world/native-babylon",
  "@whitebox-world/native-babylon-block-profile",
  ...BABYLON_NATIVE_DEEP_ESM_IMPORT_SPECIFIERS_V1,
]);

class EphemeralBundleToolFailureV1 extends Error {}

export type LoadBabylonNativeSceneModuleResultV1 =
  | Readonly<{
      outcome: "passed";
      module: BabylonNativeSceneModuleV1;
    }>
  | Readonly<{
      outcome: "rejected" | "tool-error";
      diagnostics: readonly NativeSceneDiagnosticV1[];
    }>;

type EphemeralBundleHostV1 = Readonly<{
  removeTemporaryRoot?: (runRoot: string) => Promise<void>;
}>;

function failed(
  outcome: "rejected" | "tool-error",
  diagnostic: NativeSceneDiagnosticV1,
): LoadBabylonNativeSceneModuleResultV1 {
  return Object.freeze({
    outcome,
    diagnostics: Object.freeze([diagnostic]),
  });
}

function diagnostic(
  code: string,
  stage: "bundle" | "tooling" | "typecheck",
  message: string,
  repairHint: string,
  location: NativeSceneDiagnosticLocationV1 = { kind: "none" },
): NativeSceneDiagnosticV1 {
  return createNativeWorkspaceDiagnosticV1({
    code,
    stage,
    location,
    message,
    repairHint,
  });
}

function canonicalSourcePath(
  sourceGraph: AdmittedBabylonNativeSourceGraphV1,
  fileName: string,
): string | undefined {
  const relativePath = path.relative(
    sourceGraph.workspace.worldDirectoryPath,
    fileName,
  ).split(path.sep).join("/");
  return sourceGraph.workspace.sourcePaths.includes(relativePath)
    ? relativePath
    : undefined;
}

function typecheckDiagnostics(
  sourceGraph: AdmittedBabylonNativeSourceGraphV1,
): readonly NativeSceneDiagnosticV1[] {
  const errors = ts.getPreEmitDiagnostics(sourceGraph.program).filter(
    (entry) => entry.category === ts.DiagnosticCategory.Error,
  );
  const diagnostics = errors.map((entry, index) => {
    let location: NativeSceneDiagnosticLocationV1 = { kind: "none" };
    if (!isNil(entry.file) && !isNil(entry.start)) {
      const sourcePath = canonicalSourcePath(sourceGraph, entry.file.fileName);
      if (!isNil(sourcePath)) {
        const position = entry.file.getLineAndCharacterOfPosition(entry.start);
        location = Object.freeze({
          kind: "source",
          sourcePath,
          lineNumber: position.line + 1,
          columnNumber: position.character + 1,
        });
      }
    }
    const stable = diagnostic(
      "WORLDKIT_NATIVE_SCENE_TYPECHECK_FAILED",
      "typecheck",
      "Native source failed strict Host TypeScript checking.",
      "Repair the typed source at the reported location and rerun the check.",
      location,
    );
    return Object.freeze({
      ...stable,
      id: `${stable.id}.${String(index + 1).padStart(4, "0")}`,
    });
  });
  return Object.freeze(orderBy(diagnostics, [
    (entry) => entry.location.kind === "source" ? entry.location.sourcePath : "",
    (entry) => entry.location.kind === "source" ? entry.location.lineNumber : 0,
    (entry) => entry.location.kind === "source" ? entry.location.columnNumber : 0,
    "code",
    "id",
  ], ["asc", "asc", "asc", "asc", "asc"]));
}

async function writeAdmittedSnapshot(
  sourceGraph: AdmittedBabylonNativeSourceGraphV1,
  snapshotRoot: string,
): Promise<void> {
  for (const sourcePath of sourceGraph.workspace.sourcePaths) {
    const admittedAbsolutePath = path.join(
      sourceGraph.workspace.worldDirectoryPath,
      ...sourcePath.split("/"),
    );
    const sourceFile = sourceGraph.program.getSourceFile(admittedAbsolutePath);
    if (isNil(sourceFile)) {
      throw new EphemeralBundleToolFailureV1();
    }
    const snapshotPath = path.join(snapshotRoot, ...sourcePath.split("/"));
    await mkdir(path.dirname(snapshotPath), { recursive: true });
    await writeFile(snapshotPath, sourceFile.text, "utf8");
  }
}

async function buildSnapshot(
  sourceGraph: AdmittedBabylonNativeSourceGraphV1,
  runRoot: string,
): Promise<string> {
  const snapshotRoot = path.join(runRoot, "source");
  const outputRoot = path.join(runRoot, "output");
  await writeAdmittedSnapshot(sourceGraph, snapshotRoot);
  await viteBuild({
    configFile: false,
    logLevel: "silent",
    root: snapshotRoot,
    publicDir: false,
    cacheDir: path.join(runRoot, "vite-cache"),
    build: {
      target: "es2022",
      outDir: outputRoot,
      emptyOutDir: true,
      minify: false,
      sourcemap: false,
      lib: {
        entry: path.join(snapshotRoot, sourceGraph.workspace.entrySourcePath),
        formats: ["es"],
        fileName: () => "scene.mjs",
      },
      rollupOptions: {
        external: (specifier) => EXTERNAL_IMPORTS.has(specifier),
        output: {
          entryFileNames: "scene.mjs",
          chunkFileNames: "chunks/[name]-[hash].mjs",
          assetFileNames: "assets/[name]-[hash][extname]",
        },
      },
    },
  });
  return path.join(outputRoot, "scene.mjs");
}

export async function loadExactBabylonNativeSceneModuleFileV1(
  bundleFilePath: string,
): Promise<LoadBabylonNativeSceneModuleResultV1> {
  let namespace: Record<PropertyKey, unknown>;
  try {
    namespace = await import(
      `${pathToFileURL(bundleFilePath).href}?worldkit=${randomUUID()}`
    ) as Record<PropertyKey, unknown>;
  } catch {
    return failed("rejected", diagnostic(
      "WORLDKIT_NATIVE_SCENE_BUNDLE_FAILED",
      "bundle",
      "The Native Module bundle could not be evaluated.",
      "Remove module-load side effects and keep construction inside build().",
    ));
  }

  const runtimeExportKeys = Reflect.ownKeys(namespace).filter(
    (key): key is string => typeof key === "string",
  );
  // Module namespaces also own the standard Symbol.toStringTag brand. Only
  // string keys are Runtime exports, so the closed export set remains default.
  if (!isEqual(runtimeExportKeys, ["default"])) {
    return failed("rejected", diagnostic(
      "WORLDKIT_NATIVE_SCENE_MODULE_EXPORT_INVALID",
      "bundle",
      "The Native bundle must expose exactly one default Runtime export.",
      "Remove named Runtime exports and export one default Native Module.",
    ));
  }

  try {
    const module = defineBabylonNativeScene(namespace.default as never);
    return Object.freeze({ outcome: "passed", module });
  } catch {
    return failed("rejected", diagnostic(
      "WORLDKIT_NATIVE_SCENE_MODULE_EXPORT_INVALID",
      "bundle",
      "The default Runtime export is not an exact Native Module.",
      "Export default defineBabylonNativeScene({...}) with only kind, id, and build.",
    ));
  }
}

export async function typecheckBundleAndLoadBabylonNativeSceneModuleV1(
  sourceGraph: AdmittedBabylonNativeSourceGraphV1,
  host: EphemeralBundleHostV1 = {},
): Promise<LoadBabylonNativeSceneModuleResultV1> {
  const typeErrors = typecheckDiagnostics(sourceGraph);
  if (typeErrors.length > 0) {
    return Object.freeze({ outcome: "rejected", diagnostics: typeErrors });
  }

  let runRoot: string;
  try {
    await mkdir(BUNDLE_PARENT, { recursive: true });
    runRoot = await mkdtemp(path.join(BUNDLE_PARENT, "run-"));
  } catch {
    return failed("tool-error", diagnostic(
      "WORLDKIT_NATIVE_SCENE_TOOL_INTERNAL_FAILED",
      "tooling",
      "The Native checker could not create its temporary bundle workspace.",
      "Repair Host filesystem access before retrying the same check.",
    ));
  }
  let result: LoadBabylonNativeSceneModuleResultV1;
  let cleanupFailed = false;
  try {
    try {
      const bundleFilePath = await buildSnapshot(sourceGraph, runRoot);
      result = await loadExactBabylonNativeSceneModuleFileV1(bundleFilePath);
    } catch (error) {
      result = error instanceof EphemeralBundleToolFailureV1
        ? failed("tool-error", diagnostic(
            "WORLDKIT_NATIVE_SCENE_TOOL_INTERNAL_FAILED",
            "tooling",
            "The admitted Native source snapshot was unavailable to the bundler.",
            "Repair the trusted Source Admission handoff before retrying.",
          ))
        : failed("rejected", diagnostic(
            "WORLDKIT_NATIVE_SCENE_BUNDLE_FAILED",
            "bundle",
            "The admitted Native source graph could not be bundled.",
            "Repair the admitted static ESM source and rerun the check.",
          ));
    }
  } finally {
    try {
      if (host.removeTemporaryRoot === undefined) {
        await rm(runRoot, { force: true, recursive: true });
      } else {
        await host.removeTemporaryRoot(runRoot);
      }
    } catch {
      cleanupFailed = true;
    }
  }

  if (cleanupFailed) {
    const cleanupDiagnostic = diagnostic(
      "WORLDKIT_NATIVE_SCENE_TOOL_INTERNAL_FAILED",
      "tooling",
      "The Native checker could not remove its temporary bundle workspace.",
      "Repair Host filesystem access before retrying the same check.",
    );
    return Object.freeze({
      outcome: "tool-error",
      diagnostics: Object.freeze(result.outcome === "passed"
        ? [cleanupDiagnostic]
        : [...result.diagnostics, cleanupDiagnostic]),
    });
  }
  return result;
}
