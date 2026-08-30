import { randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  BABYLON_NATIVE_DEEP_ESM_IMPORT_SPECIFIERS_V1,
  defineBabylonNativeScene,
  type BabylonNativeSceneModuleV1,
} from "@whitebox-world/native-babylon";
import {
  canonicalJsonBytes,
  sha256Bytes,
  sha256CanonicalJson,
  type Sha256HashV1,
} from "@whitebox-world/protocol";
import {
  hashBabylonNativeSceneModuleBundleManifestV1,
  nativeSceneModuleBundleRefFromHashV1,
  parseBabylonNativeSceneModuleBundleManifestV1,
  type BabylonNativeSceneModuleBundleFileV1,
  type BabylonNativeSceneModuleBundleManifestV1,
  type BabylonNativeSceneModuleBundleSourceV1,
  type BabylonNativeSceneResolvedProfileV1,
  type NativeSceneDiagnosticLocationV1,
  type NativeSceneDiagnosticV1,
} from "@whitebox-world/runtime-contracts";
import { isEqual, isNil, orderBy } from "lodash-es";
import ts from "typescript";
import { build as viteBuild } from "vite";

import { createNativeWorkspaceDiagnosticV1 } from "./authoring-workspace.js";
import {
  BABYLON_NATIVE_SOURCE_COMPILER_OPTIONS_V1,
  type AdmittedBabylonNativeSourceGraphV1,
} from "./source-admission.js";

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, "../..");
const BUNDLE_PARENT = path.join(
  REPOSITORY_ROOT,
  ".codex-tmp/native-scene-check",
);
const ENTRY_PATH = "native/scene.mjs" as const;
const EXTERNAL_IMPORTS = new Set<string>([
  "@whitebox-world/native-babylon",
  "@whitebox-world/native-babylon-block-profile",
  ...BABYLON_NATIVE_DEEP_ESM_IMPORT_SPECIFIERS_V1,
]);
const BUNDLER_PROFILE_V1 = Object.freeze({
  engine: "vite-rollup",
  target: "es2022",
  format: "es",
  minify: false,
  sourcemap: false,
  entryFileName: "scene.mjs",
  chunkFileName: "chunks/[name]-[hash].mjs",
  assetPolicy: "javascript-only",
} as const);

class ModuleBundleToolFailureV1 extends Error {}
class ModuleBundleValidationFailureV1 extends Error {}

export interface BabylonNativeSceneModuleBundleArtifactFileV1
  extends BabylonNativeSceneModuleBundleFileV1 {
  readonly bytes: readonly number[];
}

export interface BabylonNativeSceneModuleBundleArtifactV1 {
  readonly entryPath: typeof ENTRY_PATH;
  readonly sourceInventory: readonly BabylonNativeSceneModuleBundleSourceV1[];
  readonly fileInventory: readonly BabylonNativeSceneModuleBundleFileV1[];
  readonly files: readonly BabylonNativeSceneModuleBundleArtifactFileV1[];
  readonly sourceGraphHash: Sha256HashV1;
  readonly bundleSizeBytes: number;
  readonly bundleMediaType: "text/javascript";
  readonly bundleContentHash: Sha256HashV1;
  readonly externalImportSpecifiers: readonly string[];
}

export type BuildBabylonNativeSceneModuleBundleResultV1 =
  | Readonly<{
      outcome: "passed";
      bundleArtifact: BabylonNativeSceneModuleBundleArtifactV1;
    }>
  | Readonly<{
      outcome: "rejected" | "tool-error";
      diagnostics: readonly NativeSceneDiagnosticV1[];
    }>;

export type BuildAndLoadBabylonNativeSceneModuleResultV1 =
  | Readonly<{
      outcome: "passed";
      bundleArtifact: BabylonNativeSceneModuleBundleArtifactV1;
      module: BabylonNativeSceneModuleV1;
    }>
  | Readonly<{
      outcome: "rejected" | "tool-error";
      diagnostics: readonly NativeSceneDiagnosticV1[];
    }>;

export type LoadBabylonNativeSceneModuleResultV1 =
  | Readonly<{
      outcome: "passed";
      module: BabylonNativeSceneModuleV1;
    }>
  | Readonly<{
      outcome: "rejected" | "tool-error";
      diagnostics: readonly NativeSceneDiagnosticV1[];
    }>;

export interface FinalizeBabylonNativeSceneModuleBundleManifestInputV1 {
  readonly bundleArtifact: BabylonNativeSceneModuleBundleArtifactV1;
  readonly id: string;
  readonly sceneModuleRef: string;
  readonly nativeSceneApi: BabylonNativeSceneResolvedProfileV1;
  readonly nativeSceneProfile: BabylonNativeSceneResolvedProfileV1;
  readonly seed: number;
  readonly dependencyLockHash: Sha256HashV1;
  readonly assetLockHash: Sha256HashV1;
}

type ModuleBundleHostV1 = Readonly<{
  removeTemporaryRoot?: (runRoot: string) => Promise<void>;
  afterBundleOutput?: (outputRoot: string) => Promise<void>;
}>;

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

function failed(
  outcome: "rejected" | "tool-error",
  entry: NativeSceneDiagnosticV1,
): Readonly<{
  outcome: "rejected" | "tool-error";
  diagnostics: readonly NativeSceneDiagnosticV1[];
}> {
  return Object.freeze({ outcome, diagnostics: Object.freeze([entry]) });
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

function isSafeRelativePath(value: string): boolean {
  return value.length > 0 &&
    value === value.split(path.sep).join("/") &&
    !path.posix.isAbsolute(value) &&
    !value.split("/").some((segment) =>
      segment === "" || segment === "." || segment === "..");
}

function validateSourceGraphShape(
  sourceGraph: AdmittedBabylonNativeSourceGraphV1,
): void {
  const sortedPaths = [...sourceGraph.workspace.sourcePaths]
    .sort((left, right) => left.localeCompare(right, "en-US"));
  const sortedImports = [...sourceGraph.externalImportSpecifiers]
    .sort((left, right) => left.localeCompare(right, "en-US"));
  if (
    !isEqual(sortedPaths, sourceGraph.workspace.sourcePaths) ||
    new Set(sortedPaths).size !== sortedPaths.length ||
    sortedPaths.some((sourcePath) => !isSafeRelativePath(sourcePath)) ||
    !isEqual(sortedImports, sourceGraph.externalImportSpecifiers) ||
    new Set(sortedImports).size !== sortedImports.length ||
    sortedImports.some((specifier) => !EXTERNAL_IMPORTS.has(specifier))
  ) throw new ModuleBundleValidationFailureV1();
}

async function createSourceInventory(
  sourceGraph: AdmittedBabylonNativeSourceGraphV1,
): Promise<readonly BabylonNativeSceneModuleBundleSourceV1[]> {
  validateSourceGraphShape(sourceGraph);
  const rows: BabylonNativeSceneModuleBundleSourceV1[] = [];
  for (const sourcePath of sourceGraph.workspace.sourcePaths) {
    const admittedAbsolutePath = path.join(
      sourceGraph.workspace.worldDirectoryPath,
      ...sourcePath.split("/"),
    );
    const sourceFile = sourceGraph.program.getSourceFile(admittedAbsolutePath);
    if (isNil(sourceFile)) throw new ModuleBundleToolFailureV1();
    rows.push(Object.freeze({
      path: sourcePath,
      contentHash: sha256Bytes(
        new TextEncoder().encode(sourceFile.text),
      ) as Sha256HashV1,
    }));
  }
  return Object.freeze(rows);
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
    if (isNil(sourceFile)) throw new ModuleBundleToolFailureV1();
    const snapshotPath = path.join(snapshotRoot, ...sourcePath.split("/"));
    await mkdir(path.dirname(snapshotPath), { recursive: true });
    await writeFile(snapshotPath, sourceFile.text, "utf8");
  }
}

async function buildSnapshot(
  sourceGraph: AdmittedBabylonNativeSourceGraphV1,
  runRoot: string,
): Promise<Readonly<{ snapshotRoot: string; outputRoot: string }>> {
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
      target: BUNDLER_PROFILE_V1.target,
      outDir: outputRoot,
      emptyOutDir: true,
      minify: BUNDLER_PROFILE_V1.minify,
      sourcemap: BUNDLER_PROFILE_V1.sourcemap,
      lib: {
        entry: path.join(snapshotRoot, sourceGraph.workspace.entrySourcePath),
        formats: [BUNDLER_PROFILE_V1.format],
        fileName: () => BUNDLER_PROFILE_V1.entryFileName,
      },
      rollupOptions: {
        external: (specifier) => EXTERNAL_IMPORTS.has(specifier),
        output: {
          entryFileNames: BUNDLER_PROFILE_V1.entryFileName,
          chunkFileNames: BUNDLER_PROFILE_V1.chunkFileName,
        },
      },
    },
  });
  return Object.freeze({ snapshotRoot, outputRoot });
}

async function listOutputFiles(
  outputRoot: string,
  directoryPath: string = outputRoot,
): Promise<readonly string[]> {
  const rows: string[] = [];
  for (const entry of await readdir(directoryPath, { withFileTypes: true })) {
    const absolutePath = path.join(directoryPath, entry.name);
    const stats = await lstat(absolutePath);
    if (stats.isSymbolicLink()) throw new ModuleBundleValidationFailureV1();
    if (entry.isDirectory()) {
      rows.push(...await listOutputFiles(outputRoot, absolutePath));
    } else if (entry.isFile()) {
      rows.push(path.relative(outputRoot, absolutePath).split(path.sep).join("/"));
    } else {
      throw new ModuleBundleValidationFailureV1();
    }
  }
  return Object.freeze(rows.sort((left, right) => left.localeCompare(right, "en-US")));
}

function assertNoHostPathLeakage(
  sourceText: string,
  roots: readonly string[],
): void {
  if (
    sourceText.includes("sourceMappingURL") ||
    roots.some((root) => sourceText.includes(root) ||
      sourceText.includes(root.split(path.sep).join("/")))
  ) throw new ModuleBundleValidationFailureV1();
}

async function createBundleArtifact(
  sourceGraph: AdmittedBabylonNativeSourceGraphV1,
  snapshotRoot: string,
  outputRoot: string,
  sourceInventory: readonly BabylonNativeSceneModuleBundleSourceV1[],
): Promise<BabylonNativeSceneModuleBundleArtifactV1> {
  const outputPaths = await listOutputFiles(outputRoot);
  if (
    outputPaths.length === 0 ||
    !outputPaths.includes("scene.mjs") ||
    outputPaths.some((outputPath) =>
      !isSafeRelativePath(outputPath) ||
      !outputPath.endsWith(".mjs") ||
      (outputPath !== "scene.mjs" && !outputPath.startsWith("chunks/")))
  ) throw new ModuleBundleValidationFailureV1();

  const files: BabylonNativeSceneModuleBundleArtifactFileV1[] = [];
  for (const outputPath of outputPaths) {
    const bytes = new Uint8Array(await readFile(
      path.join(outputRoot, ...outputPath.split("/")),
    ));
    assertNoHostPathLeakage(new TextDecoder().decode(bytes), [
      snapshotRoot,
      outputRoot,
      sourceGraph.workspace.worldDirectoryPath,
    ]);
    files.push(Object.freeze({
      path: `native/${outputPath}`,
      mediaType: "text/javascript",
      sizeBytes: bytes.byteLength,
      contentHash: sha256Bytes(bytes) as Sha256HashV1,
      bytes: Object.freeze(Array.from(bytes)),
    }));
  }
  const frozenFiles = Object.freeze(files);
  const fileInventory = Object.freeze(frozenFiles.map(({ bytes: _bytes, ...entry }) =>
    Object.freeze(entry)));
  const entry = frozenFiles.find((file) => file.path === ENTRY_PATH);
  if (isNil(entry)) throw new ModuleBundleValidationFailureV1();
  return Object.freeze({
    entryPath: ENTRY_PATH,
    sourceInventory,
    fileInventory,
    files: frozenFiles,
    sourceGraphHash: sha256CanonicalJson(sourceInventory) as Sha256HashV1,
    bundleSizeBytes: entry.sizeBytes,
    bundleMediaType: "text/javascript",
    bundleContentHash: entry.contentHash,
    externalImportSpecifiers: Object.freeze([
      ...sourceGraph.externalImportSpecifiers,
    ]),
  });
}

function assertValidBundleArtifact(
  artifact: BabylonNativeSceneModuleBundleArtifactV1,
): void {
  if (
    artifact.entryPath !== ENTRY_PATH ||
    artifact.bundleMediaType !== "text/javascript" ||
    artifact.sourceInventory.length === 0 ||
    artifact.files.length === 0 ||
    artifact.sourceGraphHash !== sha256CanonicalJson(artifact.sourceInventory) ||
    !isEqual(
      artifact.fileInventory,
      artifact.files.map(({ bytes: _bytes, ...entry }) => entry),
    )
  ) throw new ModuleBundleValidationFailureV1();
  for (const file of artifact.files) {
    const bytes = Uint8Array.from(file.bytes);
    if (
      file.sizeBytes !== bytes.byteLength ||
      file.contentHash !== sha256Bytes(bytes) ||
      !isSafeRelativePath(file.path) ||
      !file.path.startsWith("native/")
    ) throw new ModuleBundleValidationFailureV1();
  }
  const entry = artifact.files.find((file) => file.path === ENTRY_PATH);
  if (
    isNil(entry) ||
    artifact.bundleSizeBytes !== entry.sizeBytes ||
    artifact.bundleContentHash !== entry.contentHash
  ) throw new ModuleBundleValidationFailureV1();
}

export function finalizeBabylonNativeSceneModuleBundleManifestV1(
  input: FinalizeBabylonNativeSceneModuleBundleManifestInputV1,
): Readonly<{
  manifest: BabylonNativeSceneModuleBundleManifestV1;
  manifestBytes: Uint8Array;
  manifestHash: Sha256HashV1;
}> {
  assertValidBundleArtifact(input.bundleArtifact);
  const manifest = parseBabylonNativeSceneModuleBundleManifestV1({
    kind: "babylon-native-scene-module-bundle",
    schemaVersion: 1,
    id: input.id,
    sceneModuleRef: input.sceneModuleRef,
    sceneModuleBundleRef: nativeSceneModuleBundleRefFromHashV1(
      input.bundleArtifact.bundleContentHash,
    ),
    entryPath: input.bundleArtifact.entryPath,
    sourceInventory: input.bundleArtifact.sourceInventory,
    fileInventory: input.bundleArtifact.fileInventory,
    sourceGraphHash: input.bundleArtifact.sourceGraphHash,
    bundleSizeBytes: input.bundleArtifact.bundleSizeBytes,
    bundleMediaType: input.bundleArtifact.bundleMediaType,
    bundleContentHash: input.bundleArtifact.bundleContentHash,
    nativeSceneApi: input.nativeSceneApi,
    nativeSceneProfile: input.nativeSceneProfile,
    importProfileHash: sha256CanonicalJson(
      input.bundleArtifact.externalImportSpecifiers,
    ),
    typescriptCompilerOptionsHash: sha256CanonicalJson(
      BABYLON_NATIVE_SOURCE_COMPILER_OPTIONS_V1,
    ),
    bundlerProfileHash: sha256CanonicalJson(BUNDLER_PROFILE_V1),
    seed: input.seed,
    dependencyLockHash: input.dependencyLockHash,
    assetLockHash: input.assetLockHash,
  });
  return Object.freeze({
    manifest,
    manifestBytes: canonicalJsonBytes(manifest),
    manifestHash: hashBabylonNativeSceneModuleBundleManifestV1(manifest),
  });
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

async function runBundle(
  sourceGraph: AdmittedBabylonNativeSourceGraphV1,
  loadModule: boolean,
  host: ModuleBundleHostV1,
): Promise<
  BuildBabylonNativeSceneModuleBundleResultV1 |
  BuildAndLoadBabylonNativeSceneModuleResultV1
> {
  const typeErrors = typecheckDiagnostics(sourceGraph);
  if (typeErrors.length > 0) {
    return Object.freeze({ outcome: "rejected", diagnostics: typeErrors });
  }

  let runRoot: string;
  try {
    validateSourceGraphShape(sourceGraph);
    await mkdir(BUNDLE_PARENT, { recursive: true });
    runRoot = await mkdtemp(path.join(BUNDLE_PARENT, "run-"));
  } catch (error) {
    return failed(error instanceof ModuleBundleValidationFailureV1
      ? "rejected"
      : "tool-error", diagnostic(
      error instanceof ModuleBundleValidationFailureV1
        ? "WORLDKIT_NATIVE_SCENE_BUNDLE_ARTIFACT_INVALID"
        : "WORLDKIT_NATIVE_SCENE_TOOL_INTERNAL_FAILED",
      error instanceof ModuleBundleValidationFailureV1 ? "bundle" : "tooling",
      "The Native checker could not create a valid temporary bundle workspace.",
      "Repair the admitted source graph or Host filesystem access before retrying.",
    ));
  }

  let result:
    | BuildBabylonNativeSceneModuleBundleResultV1
    | BuildAndLoadBabylonNativeSceneModuleResultV1;
  let cleanupFailed = false;
  try {
    try {
      const sourceInventory = await createSourceInventory(sourceGraph);
      const roots = await buildSnapshot(sourceGraph, runRoot);
      await host.afterBundleOutput?.(roots.outputRoot);
      const bundleArtifact = await createBundleArtifact(
        sourceGraph,
        roots.snapshotRoot,
        roots.outputRoot,
        sourceInventory,
      );
      if (loadModule) {
        const loaded = await loadExactBabylonNativeSceneModuleFileV1(
          path.join(roots.outputRoot, "scene.mjs"),
        );
        result = loaded.outcome === "passed"
          ? Object.freeze({
              outcome: "passed",
              bundleArtifact,
              module: loaded.module,
            })
          : loaded;
      } else {
        result = Object.freeze({ outcome: "passed", bundleArtifact });
      }
    } catch (error) {
      result = error instanceof ModuleBundleToolFailureV1
        ? failed("tool-error", diagnostic(
            "WORLDKIT_NATIVE_SCENE_TOOL_INTERNAL_FAILED",
            "tooling",
            "The admitted Native source snapshot was unavailable to the bundler.",
            "Repair the trusted Source Admission handoff before retrying.",
          ))
        : error instanceof ModuleBundleValidationFailureV1
        ? failed("rejected", diagnostic(
            "WORLDKIT_NATIVE_SCENE_BUNDLE_ARTIFACT_INVALID",
            "bundle",
            "The emitted Native Module Bundle violated its closed artifact profile.",
            "Remove path leakage, source maps, or unlisted output and rebuild.",
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

export async function buildBabylonNativeSceneModuleBundleV1(
  sourceGraph: AdmittedBabylonNativeSourceGraphV1,
  host: ModuleBundleHostV1 = {},
): Promise<BuildBabylonNativeSceneModuleBundleResultV1> {
  return runBundle(sourceGraph, false, host) as Promise<
    BuildBabylonNativeSceneModuleBundleResultV1
  >;
}

export async function buildAndLoadBabylonNativeSceneModuleV1(
  sourceGraph: AdmittedBabylonNativeSourceGraphV1,
  host: ModuleBundleHostV1 = {},
): Promise<BuildAndLoadBabylonNativeSceneModuleResultV1> {
  return runBundle(sourceGraph, true, host) as Promise<
    BuildAndLoadBabylonNativeSceneModuleResultV1
  >;
}
