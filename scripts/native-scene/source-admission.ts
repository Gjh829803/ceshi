import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  BABYLON_NATIVE_DEEP_ESM_IMPORT_SPECIFIERS_V1,
  type NativeSceneDiagnosticV1,
} from "@whitebox-world/native-babylon";
import {
  BABYLON_NATIVE_FORBIDDEN_SCENE_INPUT_CAMERA_METHOD_KEYS_V1,
} from "@whitebox-world/native-babylon/host";
import { isEmpty, isNil } from "lodash-es";
import ts from "typescript";

import {
  createNativeWorkspaceDiagnosticV1,
  readBabylonNativeAuthoringWorkspaceRootV1,
  type BabylonNativeAuthoringWorkspaceRootV1,
} from "./authoring-workspace.js";

const REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const WORLDKIT_IMPORTS = Object.freeze([
  "@whitebox-world/native-babylon",
  "@whitebox-world/native-babylon-block-profile",
] as const);
const ALLOWED_EXTERNAL_IMPORTS = new Set<string>([
  ...WORLDKIT_IMPORTS,
  ...BABYLON_NATIVE_DEEP_ESM_IMPORT_SPECIFIERS_V1,
]);
const PUBLIC_SOURCE_PATH_BY_SOURCE_FILE = new WeakMap<ts.SourceFile, string>();

const FORBIDDEN_GLOBAL_IDENTIFIERS = new Set([
  "arguments",
  "clearImmediate",
  "clearInterval",
  "clearTimeout",
  "crypto",
  "Date",
  "document",
  "eval",
  "fetch",
  "FinalizationRegistry",
  "Function",
  "globalThis",
  "localStorage",
  "navigator",
  "performance",
  "process",
  "Proxy",
  "queueMicrotask",
  "Reflect",
  "requestAnimationFrame",
  "sessionStorage",
  "setImmediate",
  "setInterval",
  "setTimeout",
  "WebSocket",
  "WeakRef",
  "window",
  "XMLHttpRequest",
  "Worker",
]);

const FORBIDDEN_BABYLON_METHODS = new Set([
  ...BABYLON_NATIVE_FORBIDDEN_SCENE_INPUT_CAMERA_METHOD_KEYS_V1,
  "addExternalData",
  "getOrAddExternalDataWithFactory",
  "addGeometry",
  "addIsReadyCheck",
  "addLight",
  "addMaterial",
  "addMesh",
  "addTransformNode",
  "dispose",
  "enablePhysics",
  "executeOnceBeforeRender",
  "executeWhenReady",
  "freezeActiveMeshes",
  "getEngine",
  "pushGeometry",
  "registerAfterRender",
  "registerBeforeRender",
  "removeExternalData",
  "removeGeometry",
  "removeLight",
  "removeMaterial",
  "removeMesh",
  "removeTransformNode",
  "runRenderLoop",
  "setRenderingAutoClearDepthStencil",
  "setRenderingOrder",
  "stopRenderLoop",
  "unregisterAfterRender",
  "unregisterBeforeRender",
  "whenReadyAsync",
]);

const FORBIDDEN_BABYLON_PROPERTIES = new Set([
  "actionManager",
  "activeCamera",
  "activeCameras",
  "afterCameraRender",
  "afterRender",
  "beforeCameraRender",
  "beforeRender",
  "customAnimationFrameRequester",
  "customMarkAsDirty",
  "customRenderFunction",
  "getRenderTargetTextures",
  "onCompiled",
  "onDispose",
  "onError",
  "onGeometryUpdated",
  "onLODLevelSelection",
  "onPointerDown",
  "onPointerMove",
  "onPointerObservable",
  "onPointerPick",
  "onPointerUp",
  "onReady",
  "physicsBody",
]);

const OBSERVABLE_MUTATION_METHODS = new Set([
  "add",
  "addOnce",
  "cleanLastNotifiedState",
  "clear",
  "clone",
  "makeObserverBottomPriority",
  "makeObserverTopPriority",
  "notifyObserver",
  "notifyObservers",
  "remove",
  "removeCallback",
]);
const MODULE_CONTAINER_MUTATION_METHODS = new Set([
  "add",
  "clear",
  "copyWithin",
  "delete",
  "fill",
  "pop",
  "push",
  "reverse",
  "set",
  "shift",
  "sort",
  "splice",
  "unshift",
]);

const MODULE_REFERENCE_CONTAINER_READ_METHODS = new Set([
  "at",
  "concat",
  "entries",
  "filter",
  "find",
  "findLast",
  "flat",
  "get",
  "keys",
  "next",
  "pop",
  "reverse",
  "shift",
  "slice",
  "sort",
  "splice",
  "Symbol.iterator",
  "toReversed",
  "toSorted",
  "toSpliced",
  "values",
  "with",
]);

const MODULE_REFERENCE_CONTAINER_CONSTRUCTORS = new Set([
  "Array",
  "Map",
  "Object",
  "Set",
  "WeakMap",
  "WeakSet",
]);

const MODULE_REFERENCE_STATIC_VALUE_METHODS = new Set([
  "Array.from",
  "Array.of",
  "Object.entries",
  "Object.fromEntries",
  "Object.values",
  "Promise.all",
  "Promise.allSettled",
  "Promise.any",
  "Promise.race",
  "Promise.reject",
  "Promise.resolve",
]);

const MODULE_REFERENCE_CONTAINER_CALLBACK_METHODS = new Set([
  "catch",
  "every",
  "filter",
  "find",
  "findLast",
  "flatMap",
  "forEach",
  "map",
  "reduce",
  "reduceRight",
  "some",
  "sort",
  "then",
]);
const MODULE_REFERENCE_CONTAINER_TRANSFORM_METHODS = new Set([
  "flatMap",
  "map",
  "reduce",
  "reduceRight",
]);
const FORBIDDEN_STANDARD_REFLECTION_METHODS = new Set([
  "assign",
  "create",
  "defineProperties",
  "defineProperty",
  "getOwnPropertyDescriptor",
  "getOwnPropertyDescriptors",
  "setPrototypeOf",
]);
const FORBIDDEN_STRUCTURAL_CAPABILITY_MEMBER_NAMES = new Set([
  "now",
  "random",
  ...FORBIDDEN_BABYLON_METHODS,
  ...FORBIDDEN_BABYLON_PROPERTIES,
]);

export const BABYLON_NATIVE_SOURCE_COMPILER_OPTIONS_V1 = Object.freeze({
  allowImportingTsExtensions: false,
  exactOptionalPropertyTypes: true,
  lib: ["lib.es2022.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  noEmit: true,
  noUncheckedIndexedAccess: true,
  skipLibCheck: true,
  strict: true,
  target: ts.ScriptTarget.ES2022,
  useDefineForClassFields: true,
} satisfies ts.CompilerOptions);

export interface AdmittedBabylonNativeAuthoringWorkspaceV1
  extends BabylonNativeAuthoringWorkspaceRootV1 {
  readonly sourcePaths: readonly string[];
}

export interface AdmittedBabylonNativeSourceGraphV1 {
  readonly workspace: AdmittedBabylonNativeAuthoringWorkspaceV1;
  readonly program: ts.Program;
}

export type AdmitBabylonNativeSourceGraphResultV1 =
  | Readonly<{
      outcome: "passed";
      sourceGraph: AdmittedBabylonNativeSourceGraphV1;
    }>
  | Readonly<{
      outcome: "rejected" | "tool-error";
      diagnostics: readonly NativeSceneDiagnosticV1[];
    }>;

interface LocalSourceV1 {
  readonly absolutePath: string;
  readonly canonicalPath: string;
  readonly sourceFile: ts.SourceFile;
}

interface NormalizedInvocationV1 {
  readonly target: ts.Expression;
  readonly receiver: ts.Expression | undefined;
  readonly arguments: readonly ts.Expression[];
}

interface StaticDependencyV1 {
  readonly node: ts.StringLiteralLike;
  readonly specifier: string;
  readonly namespaceImport: boolean;
}

class SourceAdmissionFailureV1 extends Error {
  readonly diagnostic: NativeSceneDiagnosticV1;

  constructor(diagnostic: NativeSceneDiagnosticV1) {
    super(diagnostic.code);
    this.diagnostic = diagnostic;
  }
}

function rejected(
  diagnostic: NativeSceneDiagnosticV1,
): AdmitBabylonNativeSourceGraphResultV1 {
  return Object.freeze({
    outcome: "rejected",
    diagnostics: Object.freeze([diagnostic]),
  });
}

function sourceLocation(
  sourceFile: ts.SourceFile,
  node: ts.Node,
): Readonly<{
  kind: "source";
  sourcePath: string;
  lineNumber: number;
  columnNumber: number;
}> {
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return Object.freeze({
    kind: "source",
    sourcePath: PUBLIC_SOURCE_PATH_BY_SOURCE_FILE.get(sourceFile) ??
      sourceFile.fileName,
    lineNumber: position.line + 1,
    columnNumber: position.character + 1,
  });
}

function failAt(
  sourceFile: ts.SourceFile,
  node: ts.Node,
  code: string,
  stage: "build" | "dependency" | "source-admission",
  message: string,
  repairHint: string,
): never {
  throw new SourceAdmissionFailureV1(createNativeWorkspaceDiagnosticV1({
    code,
    stage,
    location: sourceLocation(sourceFile, node),
    message,
    repairHint,
  }));
}

function canonicalRelativePath(
  worldDirectoryPath: string,
  absolutePath: string,
): string | undefined {
  const relativePath = path.relative(worldDirectoryPath, absolutePath);
  if (
    path.isAbsolute(relativePath) ||
    relativePath === ".." ||
    relativePath.startsWith(`..${path.sep}`)
  ) return undefined;
  return relativePath.split(path.sep).join("/");
}

function isAllowedUserSourcePath(canonicalPath: string): boolean {
  return canonicalPath === "scene.ts" ||
    (canonicalPath.startsWith("src/") &&
      canonicalPath.endsWith(".ts") &&
      !canonicalPath.endsWith(".d.ts"));
}

function staticDependencies(sourceFile: ts.SourceFile): readonly StaticDependencyV1[] {
  const dependencies: StaticDependencyV1[] = [];
  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement) &&
      ts.isStringLiteralLike(statement.moduleSpecifier)) {
      dependencies.push({
        node: statement.moduleSpecifier,
        specifier: statement.moduleSpecifier.text,
        namespaceImport: statement.importClause?.namedBindings !== undefined &&
          ts.isNamespaceImport(statement.importClause.namedBindings),
      });
      continue;
    }
    if (ts.isExportDeclaration(statement) &&
      statement.moduleSpecifier !== undefined &&
      ts.isStringLiteralLike(statement.moduleSpecifier)) {
      dependencies.push({
        node: statement.moduleSpecifier,
        specifier: statement.moduleSpecifier.text,
        namespaceImport: false,
      });
      continue;
    }
    if (ts.isImportEqualsDeclaration(statement)) {
      failAt(
        sourceFile,
        statement,
        "WORLDKIT_NATIVE_SCENE_DEPENDENCY_FORBIDDEN",
        "dependency",
        "Native source supports only static ESM imports and exports.",
        "Replace ImportEquals/CommonJS syntax with an allowlisted static ESM import.",
      );
    }
  }
  return dependencies;
}

async function lstatSourcePathWithoutSymlinks(
  workspace: BabylonNativeAuthoringWorkspaceRootV1,
  canonicalPath: string,
  sourceFile: ts.SourceFile,
  node: ts.Node,
): Promise<string> {
  let currentPath = workspace.worldDirectoryPath;
  for (const segment of canonicalPath.split("/")) {
    currentPath = path.join(currentPath, segment);
    try {
      const stats = await lstat(currentPath);
      if (stats.isSymbolicLink()) {
        failAt(
          sourceFile,
          node,
          "WORLDKIT_NATIVE_SCENE_SOURCE_SYMLINK_FORBIDDEN",
          "dependency",
          "Native source paths cannot contain symbolic links.",
          "Store every reached source file in a real directory under src/.",
        );
      }
    } catch (error) {
      if (error instanceof SourceAdmissionFailureV1) throw error;
      throw error;
    }
  }

  const resolvedPath = await realpath(currentPath);
  const resolvedCanonicalPath = canonicalRelativePath(
    workspace.worldDirectoryPath,
    resolvedPath,
  );
  if (resolvedCanonicalPath === undefined || resolvedCanonicalPath !== canonicalPath) {
    failAt(
      sourceFile,
      node,
      "WORLDKIT_NATIVE_SCENE_SOURCE_PATH_INVALID",
      "dependency",
      "A Native source dependency resolves outside its canonical workspace path.",
      "Keep the complete source graph under scene.ts and src/**/*.ts.",
    );
  }
  return resolvedPath;
}

function resolveRequestedLocalPath(
  importerPath: string,
  specifier: string,
  sourceFile: ts.SourceFile,
  node: ts.Node,
): Readonly<{
  canonicalPath: string;
  isAllowedSourcePath: boolean;
  requestedJavaScriptPath: string;
}> {
  if (
    !specifier.startsWith("./") &&
    !specifier.startsWith("../")
  ) {
    failAt(
      sourceFile,
      node,
      "WORLDKIT_NATIVE_SCENE_DEPENDENCY_FORBIDDEN",
      "dependency",
      "Bare Native imports must match the fixed external allowlist.",
      "Use a relative .js specifier or one documented Native import.",
    );
  }
  if (!specifier.endsWith(".js") || specifier.includes("\\")) {
    failAt(
      sourceFile,
      node,
      "WORLDKIT_NATIVE_SCENE_SOURCE_PATH_INVALID",
      "dependency",
      "Relative Native imports must use a .js specifier for a same-path .ts source.",
      "Rename the source to .ts and import it through its relative .js specifier.",
    );
  }

  const requestedJavaScriptPath = path.posix.normalize(
    path.posix.join(path.posix.dirname(importerPath), specifier),
  );
  const canonicalPath = `${requestedJavaScriptPath.slice(0, -3)}.ts`;
  if (
    path.posix.isAbsolute(requestedJavaScriptPath) ||
    requestedJavaScriptPath === ".." ||
    requestedJavaScriptPath.startsWith("../")
  ) {
    failAt(
      sourceFile,
      node,
      "WORLDKIT_NATIVE_SCENE_SOURCE_PATH_INVALID",
      "dependency",
      "Native source dependencies must remain inside scene.ts and src/**/*.ts.",
      "Move the dependency under src/ and use a relative .js specifier.",
    );
  }
  return Object.freeze({
    canonicalPath,
    isAllowedSourcePath: isAllowedUserSourcePath(canonicalPath),
    requestedJavaScriptPath,
  });
}

async function actualJavaScriptFileExists(
  worldDirectoryPath: string,
  requestedJavaScriptPath: string,
): Promise<boolean> {
  try {
    return (await lstat(path.join(worldDirectoryPath, requestedJavaScriptPath))).isFile();
  } catch {
    return false;
  }
}

async function collectSourceGraph(
  workspace: BabylonNativeAuthoringWorkspaceRootV1,
): Promise<readonly LocalSourceV1[]> {
  const sourceByPath = new Map<string, LocalSourceV1>();
  const spellingByCaseFoldedPath = new Map<string, string>();
  const pendingPaths: Array<Readonly<{
    canonicalPath: string;
    importer?: LocalSourceV1;
    importNode?: ts.Node;
    isAllowedSourcePath?: boolean;
    requestedJavaScriptPath?: string;
  }>> = [{ canonicalPath: workspace.entrySourcePath }];

  while (pendingPaths.length > 0) {
    const pending = pendingPaths.shift()!;
    const caseFoldedPath = pending.canonicalPath.toLocaleLowerCase("en-US");
    const priorSpelling = spellingByCaseFoldedPath.get(caseFoldedPath);
    if (priorSpelling !== undefined && priorSpelling !== pending.canonicalPath) {
      const owner = pending.importer?.sourceFile;
      const node = pending.importNode;
      if (owner === undefined || node === undefined) {
        throw new Error("Entry source cannot have a case-fold collision.");
      }
      failAt(
        owner,
        node,
        "WORLDKIT_NATIVE_SCENE_SOURCE_CASE_COLLISION",
        "dependency",
        "Two Native source spellings collide after case folding.",
        "Use one canonical casing for every source path and import.",
      );
    }
    spellingByCaseFoldedPath.set(caseFoldedPath, pending.canonicalPath);
    if (sourceByPath.has(pending.canonicalPath)) continue;

    let absolutePath: string;
    try {
      const diagnosticSource = pending.importer?.sourceFile ?? ts.createSourceFile(
        workspace.entrySourcePath,
        "",
        ts.ScriptTarget.ES2022,
        true,
        ts.ScriptKind.TS,
      );
      const diagnosticNode = pending.importNode ?? diagnosticSource;
      absolutePath = await lstatSourcePathWithoutSymlinks(
        workspace,
        pending.canonicalPath,
        diagnosticSource,
        diagnosticNode,
      );
      if (pending.isAllowedSourcePath === false) {
        failAt(
          diagnosticSource,
          diagnosticNode,
          "WORLDKIT_NATIVE_SCENE_SOURCE_PATH_INVALID",
          "dependency",
          "Native source dependencies must remain inside scene.ts and src/**/*.ts.",
          "Move the dependency under src/ and use a relative .js specifier.",
        );
      }
    } catch (error) {
      if (error instanceof SourceAdmissionFailureV1) throw error;
      const owner = pending.importer?.sourceFile;
      const node = pending.importNode;
      if (owner === undefined || node === undefined) throw error;
      if (
        pending.requestedJavaScriptPath !== undefined &&
        await actualJavaScriptFileExists(
          workspace.worldDirectoryPath,
          pending.requestedJavaScriptPath,
        )
      ) {
        failAt(
          owner,
          node,
          "WORLDKIT_NATIVE_SCENE_SOURCE_PATH_INVALID",
          "dependency",
          "Native authoring executes TypeScript source, not checked-in JavaScript files.",
          "Replace the reached .js file with a same-path .ts source.",
        );
      }
      if (pending.isAllowedSourcePath === false) {
        failAt(
          owner,
          node,
          "WORLDKIT_NATIVE_SCENE_SOURCE_PATH_INVALID",
          "dependency",
          "Native source dependencies must remain inside scene.ts and src/**/*.ts.",
          "Move the dependency under src/ and use a relative .js specifier.",
        );
      }
      failAt(
        owner,
        node,
        "WORLDKIT_NATIVE_SCENE_DEPENDENCY_UNRESOLVED",
        "dependency",
        "A relative Native source dependency cannot be resolved.",
        "Create the same-path .ts source under src/ or repair the import.",
      );
    }

    const sourceText = await readFile(absolutePath, "utf8");
    const sourceFile = ts.createSourceFile(
      pending.canonicalPath,
      sourceText,
      ts.ScriptTarget.ES2022,
      true,
      ts.ScriptKind.TS,
    );
    PUBLIC_SOURCE_PATH_BY_SOURCE_FILE.set(sourceFile, pending.canonicalPath);
    const localSource = Object.freeze({
      absolutePath,
      canonicalPath: pending.canonicalPath,
      sourceFile,
    });
    sourceByPath.set(pending.canonicalPath, localSource);

    for (const dependency of staticDependencies(sourceFile)) {
      if (dependency.namespaceImport) {
        failAt(
          sourceFile,
          dependency.node,
          "WORLDKIT_NATIVE_SCENE_DEPENDENCY_FORBIDDEN",
          "dependency",
          "Namespace imports are outside the Native import profile.",
          "Import only the exact named values or types that the Module uses.",
        );
      }
      if (ALLOWED_EXTERNAL_IMPORTS.has(dependency.specifier)) continue;
      if (!dependency.specifier.startsWith(".")) {
        failAt(
          sourceFile,
          dependency.node,
          "WORLDKIT_NATIVE_SCENE_DEPENDENCY_FORBIDDEN",
          "dependency",
          "The Native dependency is outside the fixed import profile.",
          "Use only the Native roots, Block Profile root, or exact Babylon Deep ESM imports.",
        );
      }
      const resolved = resolveRequestedLocalPath(
        localSource.canonicalPath,
        dependency.specifier,
        sourceFile,
        dependency.node,
      );
      pendingPaths.push({
        canonicalPath: resolved.canonicalPath,
        importer: localSource,
        importNode: dependency.node,
        isAllowedSourcePath: resolved.isAllowedSourcePath,
        requestedJavaScriptPath: resolved.requestedJavaScriptPath,
      });
    }
  }

  return Object.freeze([...sourceByPath.values()].sort((left, right) =>
    left.canonicalPath.localeCompare(right.canonicalPath, "en-US")));
}

function resolveExternalModule(
  moduleName: string,
  containingFile: string,
  compilerOptions: ts.CompilerOptions,
): ts.ResolvedModuleFull | undefined {
  if (moduleName === WORLDKIT_IMPORTS[0]) {
    return {
      extension: ts.Extension.Ts,
      isExternalLibraryImport: true,
      resolvedFileName: path.join(REPOSITORY_ROOT, "packages/native-babylon/src/index.ts"),
    };
  }
  if (moduleName === WORLDKIT_IMPORTS[1]) {
    return {
      extension: ts.Extension.Ts,
      isExternalLibraryImport: true,
      resolvedFileName: path.join(
        REPOSITORY_ROOT,
        "packages/native-babylon-block-profile/src/index.ts",
      ),
    };
  }
  const anchor = BABYLON_NATIVE_DEEP_ESM_IMPORT_SPECIFIERS_V1.includes(
    moduleName as typeof BABYLON_NATIVE_DEEP_ESM_IMPORT_SPECIFIERS_V1[number],
  )
    ? fileURLToPath(import.meta.url)
    : containingFile;
  return ts.resolveModuleName(moduleName, anchor, compilerOptions, ts.sys)
    .resolvedModule;
}

function createSourceProgram(localSources: readonly LocalSourceV1[]): ts.Program {
  const compilerOptions: ts.CompilerOptions = {
    ...BABYLON_NATIVE_SOURCE_COMPILER_OPTIONS_V1,
  };
  const sourceByAbsolutePath = new Map(
    localSources.map((source) => [path.normalize(source.absolutePath), source] as const),
  );
  const host = ts.createCompilerHost(compilerOptions, true);
  const originalGetSourceFile = host.getSourceFile.bind(host);
  const originalResolveModuleNameLiterals = host.resolveModuleNameLiterals?.bind(host);

  host.getSourceFile = (fileName, languageVersion, onError, shouldCreateNewSourceFile) => {
    const localSource = sourceByAbsolutePath.get(path.normalize(fileName));
    if (localSource !== undefined) {
      return ts.createSourceFile(
        localSource.absolutePath,
        localSource.sourceFile.text,
        languageVersion,
        true,
        ts.ScriptKind.TS,
      );
    }
    return originalGetSourceFile(
      fileName,
      languageVersion,
      onError,
      shouldCreateNewSourceFile,
    );
  };

  host.resolveModuleNameLiterals = (
    moduleLiterals,
    containingFile,
    redirectedReference,
    options,
    containingSourceFile,
  ) => moduleLiterals.map((moduleLiteral) => {
    const moduleName = moduleLiteral.text;
    if (moduleName.startsWith(".")) {
      const importer = sourceByAbsolutePath.get(path.normalize(containingFile));
      if (importer !== undefined && moduleName.endsWith(".js")) {
        const canonicalPath = `${path.posix.normalize(path.posix.join(
          path.posix.dirname(importer.canonicalPath),
          moduleName,
        )).slice(0, -3)}.ts`;
        const target = localSources.find(
          (source) => source.canonicalPath === canonicalPath,
        );
        if (target !== undefined) {
          return {
            resolvedModule: {
              extension: ts.Extension.Ts,
              isExternalLibraryImport: false,
              resolvedFileName: target.absolutePath,
            },
          };
        }
      }
    }
    const resolvedModule = resolveExternalModule(moduleName, containingFile, options);
    if (resolvedModule !== undefined) return { resolvedModule };
    return originalResolveModuleNameLiterals?.(
      [moduleLiteral],
      containingFile,
      redirectedReference,
      options,
      containingSourceFile,
      undefined,
    )[0] ?? { resolvedModule: undefined };
  });

  const createProgramOptions: ts.CreateProgramOptions = {
    rootNames: localSources.map((source) => source.absolutePath),
    options: compilerOptions,
    host,
  };
  return ts.createProgram(createProgramOptions);
}

function isTypeOnlyTopLevelStatement(statement: ts.Statement): boolean {
  return ts.isInterfaceDeclaration(statement) ||
    ts.isTypeAliasDeclaration(statement) ||
    ts.isModuleDeclaration(statement);
}

function hasExportModifier(node: ts.Node): boolean {
  return ts.canHaveModifiers(node) &&
    ts.getModifiers(node)?.some((modifier) =>
      modifier.kind === ts.SyntaxKind.ExportKeyword) === true;
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isParenthesizedExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current)
  ) current = current.expression;
  return current;
}

function bindingPatternStaticInitializer(
  checker: ts.TypeChecker,
  pattern: ts.BindingPattern,
  visitedSymbols: ReadonlySet<ts.Symbol>,
): ts.Expression | undefined {
  const owner = pattern.parent;
  if (ts.isVariableDeclaration(owner)) {
    return isNil(owner.initializer)
      ? undefined
      : resolveStaticExpressionOrigin(
        checker,
        owner.initializer,
        visitedSymbols,
      );
  }
  if (!ts.isBindingElement(owner)) return undefined;
  const initializer = bindingElementStaticInitializer(
    checker,
    owner,
    visitedSymbols,
  );
  return isNil(initializer)
    ? undefined
    : resolveStaticExpressionOrigin(checker, initializer, visitedSymbols);
}

function bindingElementStaticInitializer(
  checker: ts.TypeChecker,
  binding: ts.BindingElement,
  visitedSymbols: ReadonlySet<ts.Symbol>,
): ts.Expression | undefined {
  const pattern = binding.parent;
  const initializer = bindingPatternStaticInitializer(
    checker,
    pattern,
    visitedSymbols,
  );
  if (isNil(initializer)) return undefined;
  if (
    ts.isObjectBindingPattern(pattern) &&
    ts.isObjectLiteralExpression(initializer)
  ) {
    const keyNode = binding.propertyName ?? binding.name;
    const key = ts.isIdentifier(keyNode) ||
        ts.isStringLiteralLike(keyNode) ||
        ts.isNumericLiteral(keyNode)
      ? keyNode.text
      : undefined;
    if (isNil(key)) return undefined;
    const property = initializer.properties.find((candidate) =>
      ts.isShorthandPropertyAssignment(candidate)
        ? candidate.name.text === key
        : ts.isPropertyAssignment(candidate) &&
          staticPropertyName(candidate.name) === key);
    if (isNil(property)) return undefined;
    return ts.isShorthandPropertyAssignment(property)
      ? property.name
      : ts.isPropertyAssignment(property)
      ? property.initializer
      : undefined;
  }
  if (
    ts.isArrayBindingPattern(pattern) &&
    ts.isArrayLiteralExpression(initializer)
  ) {
    const index = pattern.elements.indexOf(binding);
    const element = initializer.elements[index];
    return element !== undefined && ts.isExpression(element)
      ? element
      : undefined;
  }
  return undefined;
}

function resolveStaticExpressionOrigin(
  checker: ts.TypeChecker,
  expression: ts.Expression,
  visitedSymbols: ReadonlySet<ts.Symbol> = new Set(),
): ts.Expression {
  const current = unwrapExpression(expression);
  if (ts.isCommaListExpression(current)) {
    const last = current.elements.at(-1);
    return last === undefined
      ? current
      : resolveStaticExpressionOrigin(checker, last, visitedSymbols);
  }
  if (
    ts.isBinaryExpression(current) &&
    current.operatorToken.kind === ts.SyntaxKind.CommaToken
  ) {
    return resolveStaticExpressionOrigin(
      checker,
      current.right,
      visitedSymbols,
    );
  }
  if (
    ts.isPropertyAccessExpression(current) ||
    ts.isElementAccessExpression(current)
  ) {
    const symbol = resolvedSymbol(checker, current);
    if (!isNil(symbol) && !visitedSymbols.has(symbol)) {
      const property = symbol.declarations?.find((candidate): candidate is
        ts.PropertyAssignment | ts.ShorthandPropertyAssignment =>
          ts.isPropertyAssignment(candidate) ||
          ts.isShorthandPropertyAssignment(candidate));
      if (!isNil(property)) {
        const initializer = ts.isPropertyAssignment(property)
          ? property.initializer
          : property.name;
        return resolveStaticExpressionOrigin(
          checker,
          initializer,
          new Set([...visitedSymbols, symbol]),
        );
      }
    }
    return current;
  }
  if (!ts.isIdentifier(current)) return current;
  const symbol = checker.getSymbolAtLocation(current);
  if (isNil(symbol) || visitedSymbols.has(symbol)) return current;
  const binding = symbol.declarations?.find((candidate): candidate is ts.BindingElement =>
    ts.isBindingElement(candidate));
  if (!isNil(binding)) {
    const nextVisitedSymbols = new Set([...visitedSymbols, symbol]);
    const initializer = bindingElementStaticInitializer(
      checker,
      binding,
      nextVisitedSymbols,
    );
    if (!isNil(initializer)) {
      return resolveStaticExpressionOrigin(
        checker,
        initializer,
        nextVisitedSymbols,
      );
    }
  }
  const declaration = symbol.declarations?.find((candidate): candidate is ts.VariableDeclaration =>
    ts.isVariableDeclaration(candidate) &&
    ts.isIdentifier(candidate.name) &&
    !isNil(candidate.initializer)
  );
  if (isNil(declaration) || isNil(declaration.initializer)) {
    return current;
  }
  return resolveStaticExpressionOrigin(
    checker,
    declaration.initializer,
    new Set([...visitedSymbols, symbol]),
  );
}

function resolveStaticRootOrigin(
  checker: ts.TypeChecker,
  expression: ts.Expression,
  visitedSymbols: ReadonlySet<ts.Symbol> = new Set(),
): ts.Expression {
  const current = unwrapExpression(expression);
  if (
    ts.isPropertyAccessExpression(current) ||
    ts.isElementAccessExpression(current)
  ) {
    return resolveStaticRootOrigin(
      checker,
      current.expression,
      visitedSymbols,
    );
  }
  if (!ts.isIdentifier(current)) return current;
  const symbol = checker.getSymbolAtLocation(current);
  if (isNil(symbol) || visitedSymbols.has(symbol)) return current;
  const declaration = symbol.declarations?.find((candidate): candidate is ts.VariableDeclaration =>
    ts.isVariableDeclaration(candidate) &&
    ts.isIdentifier(candidate.name) &&
    !isNil(candidate.initializer)
  );
  if (isNil(declaration) || isNil(declaration.initializer)) return current;
  return resolveStaticRootOrigin(
    checker,
    declaration.initializer,
    new Set([...visitedSymbols, symbol]),
  );
}

function isPrimitiveConstantExpression(expression: ts.Expression): boolean {
  const current = unwrapExpression(expression);
  if (
    ts.isStringLiteralLike(current) ||
    ts.isNumericLiteral(current) ||
    current.kind === ts.SyntaxKind.TrueKeyword ||
    current.kind === ts.SyntaxKind.FalseKeyword ||
    current.kind === ts.SyntaxKind.NullKeyword
  ) return true;
  if (ts.isPrefixUnaryExpression(current)) {
    return isPrimitiveConstantExpression(current.operand);
  }
  return ts.isNoSubstitutionTemplateLiteral(current);
}

function isDeeplyFrozenLiteral(expression: ts.Expression): boolean {
  const current = unwrapExpression(expression);
  if (isPrimitiveConstantExpression(current)) return true;
  if (
    !ts.isCallExpression(current) ||
    !ts.isPropertyAccessExpression(current.expression) ||
    !ts.isIdentifier(current.expression.expression) ||
    current.expression.expression.text !== "Object" ||
    current.expression.name.text !== "freeze" ||
    current.arguments.length !== 1 ||
    isNil(current.arguments[0])
  ) return false;
  const value = unwrapExpression(current.arguments[0]);
  if (ts.isArrayLiteralExpression(value)) {
    return value.elements.every((element) =>
      ts.isExpression(element) && isDeeplyFrozenLiteral(element));
  }
  if (ts.isObjectLiteralExpression(value)) {
    return value.properties.every((property) =>
      ts.isPropertyAssignment(property) &&
      isDeeplyFrozenLiteral(property.initializer)
    );
  }
  return false;
}

function isAllowedFrozenConstant(expression: ts.Expression): boolean {
  const current = unwrapExpression(expression);
  return !isPrimitiveConstantExpression(current) &&
    isDeeplyFrozenLiteral(current);
}

function symbolComesFromBabylon(symbol: ts.Symbol | undefined): boolean {
  if (symbol === undefined) return false;
  return symbol.declarations?.some((declaration) =>
    declaration.getSourceFile().fileName.split(path.sep).join("/")
      .includes("/@babylonjs/core/")) === true;
}

function typeComesFromBabylon(
  checker: ts.TypeChecker,
  expression: ts.Expression,
): boolean {
  const type = checker.getTypeAtLocation(
    resolveStaticExpressionOrigin(checker, expression),
  );
  const symbols = [type.aliasSymbol, type.getSymbol()];
  if (symbols.some(symbolComesFromBabylon)) return true;
  if (type.isUnionOrIntersection()) {
    return type.types.some((member) => {
      const symbol = member.aliasSymbol ?? member.getSymbol();
      return symbolComesFromBabylon(symbol);
    });
  }
  return checker.typeToString(type).includes("Observable<");
}

function isCallable(checker: ts.TypeChecker, expression: ts.Expression): boolean {
  const current = unwrapExpression(expression);
  if (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) return true;
  const type = checker.getTypeAtLocation(current);
  const hasCallableSignature = (candidate: ts.Type): boolean =>
    candidate.getCallSignatures().length > 0 ||
    candidate.getConstructSignatures().length > 0;
  return hasCallableSignature(type) ||
    type.isUnionOrIntersection() && type.types.some(hasCallableSignature);
}

function symbolHasRetainableReference(
  checker: ts.TypeChecker,
  symbol: ts.Symbol,
): boolean {
  return symbol.declarations?.some((declaration) => {
    const type = checker.getTypeOfSymbolAtLocation(symbol, declaration);
    const isReference = (candidate: ts.Type): boolean =>
      candidate.getCallSignatures().length > 0 ||
      candidate.getConstructSignatures().length > 0 ||
      (candidate.flags & ts.TypeFlags.Object) !== 0 ||
      (candidate.flags & ts.TypeFlags.NonPrimitive) !== 0;
    return isReference(type) ||
      type.isUnionOrIntersection() && type.types.some(isReference);
  }) === true;
}

function appliedArguments(
  checker: ts.TypeChecker,
  expression: ts.Expression | undefined,
): readonly ts.Expression[] {
  if (expression === undefined) return [];
  const current = resolveStaticExpressionOrigin(checker, expression);
  if (ts.isArrayLiteralExpression(current)) {
    return current.elements.filter(ts.isExpression);
  }
  if (ts.isObjectLiteralExpression(current)) {
    const lengthProperty = current.properties.find((property) =>
      ts.isPropertyAssignment(property) &&
      staticPropertyName(property.name) === "length");
    const lengthExpression = lengthProperty !== undefined &&
        ts.isPropertyAssignment(lengthProperty)
      ? unwrapExpression(lengthProperty.initializer)
      : undefined;
    if (lengthExpression !== undefined && ts.isNumericLiteral(lengthExpression)) {
      const length = Number(lengthExpression.text);
      if (Number.isSafeInteger(length) && length >= 0) {
        const values: ts.Expression[] = [];
        for (let index = 0; index < length; index += 1) {
          const property = current.properties.find((candidate) =>
            ts.isPropertyAssignment(candidate) &&
            staticPropertyName(candidate.name) === String(index));
          if (property !== undefined && ts.isPropertyAssignment(property)) {
            values.push(property.initializer);
          }
        }
        return values;
      }
    }
  }
  return [expression];
}

function expandStaticArgumentList(
  checker: ts.TypeChecker,
  argumentsList: readonly ts.Expression[],
  visitedExpressions: ReadonlySet<ts.Expression> = new Set(),
): readonly ts.Expression[] | undefined {
  const expanded: ts.Expression[] = [];
  for (const argument of argumentsList) {
    if (!ts.isSpreadElement(argument)) {
      expanded.push(argument);
      continue;
    }
    const origin = resolveStaticExpressionOrigin(checker, argument.expression);
    if (visitedExpressions.has(origin) || !ts.isArrayLiteralExpression(origin)) {
      return undefined;
    }
    const elements = origin.elements.filter(ts.isExpression);
    if (elements.length !== origin.elements.length) return undefined;
    const nested = expandStaticArgumentList(
      checker,
      elements,
      new Set([...visitedExpressions, origin]),
    );
    if (nested === undefined) return undefined;
    expanded.push(...nested);
  }
  return expanded;
}

function invocationSurface(
  checker: ts.TypeChecker,
  invocation: ts.CallExpression,
): NormalizedInvocationV1 {
  const target = unwrapExpression(invocation.expression);
  if (
    ts.isPropertyAccessExpression(target) ||
    ts.isElementAccessExpression(target)
  ) {
    const callLikeMethod = propertyName(checker, target);
    if (
      (callLikeMethod === "call" || callLikeMethod === "apply") &&
      isCallable(checker, target.expression)
    ) {
      return {
        target: unwrapExpression(target.expression),
        receiver: invocation.arguments[0],
        arguments: callLikeMethod === "apply"
          ? appliedArguments(checker, invocation.arguments[1])
          : invocation.arguments.slice(1),
      };
    }
    return {
      target,
      receiver: target.expression,
      arguments: [...invocation.arguments],
    };
  }
  return {
    target,
    receiver: undefined,
    arguments: [...invocation.arguments],
  };
}

function methodAccessIdentity(
  checker: ts.TypeChecker,
  expression: ts.Expression,
): Readonly<{ name: string; receiver: ts.Expression }> | undefined {
  const current = resolveStaticExpressionOrigin(checker, expression);
  if (
    ts.isPropertyAccessExpression(current) ||
    ts.isElementAccessExpression(current)
  ) {
    const name = propertyName(checker, current);
    return name === undefined
      ? undefined
      : { name, receiver: current.expression };
  }
  if (!ts.isIdentifier(current)) return undefined;
  const symbol = resolvedSymbol(checker, current);
  const binding = symbol?.declarations?.find((declaration): declaration is ts.BindingElement =>
    ts.isBindingElement(declaration) &&
    ts.isObjectBindingPattern(declaration.parent));
  if (binding === undefined) return undefined;
  const nameNode = binding.propertyName ?? binding.name;
  const name = ts.isIdentifier(nameNode) || ts.isStringLiteralLike(nameNode) ||
      ts.isNumericLiteral(nameNode)
    ? nameNode.text
    : undefined;
  const bindingSymbol = resolvedSymbol(checker, binding.name);
  const receiver = bindingPatternStaticInitializer(
    checker,
    binding.parent,
    bindingSymbol === undefined ? new Set() : new Set([bindingSymbol]),
  );
  return name === undefined || receiver === undefined
    ? undefined
    : { name, receiver };
}

function normalizeInvocation(
  checker: ts.TypeChecker,
  invocation: ts.CallExpression,
): NormalizedInvocationV1 {
  const surface = invocationSurface(checker, invocation);
  const normalizeBoundTarget = (
    target: ts.Expression,
    receiver: ts.Expression | undefined,
    invocationArguments: readonly ts.Expression[],
    visitedExpressions: ReadonlySet<ts.Expression>,
  ): NormalizedInvocationV1 => {
    const origin = resolveStaticExpressionOrigin(checker, target);
    if (visitedExpressions.has(origin)) {
      return { target: origin, receiver, arguments: invocationArguments };
    }
    const callLikeMethod = methodAccessIdentity(checker, origin);
    if (
      (callLikeMethod?.name === "call" || callLikeMethod?.name === "apply") &&
      isCallable(checker, callLikeMethod.receiver)
    ) {
      return normalizeBoundTarget(
        callLikeMethod.receiver,
        invocationArguments[0],
        callLikeMethod.name === "apply"
          ? appliedArguments(checker, invocationArguments[1])
          : invocationArguments.slice(1),
        new Set([...visitedExpressions, origin]),
      );
    }
    if (ts.isCallExpression(origin)) {
      const bindSurface = invocationSurface(checker, origin);
      const bindMethod = methodAccessIdentity(checker, bindSurface.target);
      const boundTarget = bindSurface.receiver ?? bindMethod?.receiver;
      if (
        bindMethod?.name === "bind" &&
        boundTarget !== undefined &&
        isCallable(checker, boundTarget)
      ) {
        return normalizeBoundTarget(
          boundTarget,
          receiver,
          [...bindSurface.arguments.slice(1), ...invocationArguments],
          new Set([...visitedExpressions, origin]),
        );
      }
    }
    return { target: origin, receiver, arguments: invocationArguments };
  };
  return normalizeBoundTarget(
    surface.target,
    surface.receiver,
    surface.arguments,
    new Set(),
  );
}

function resolveStaticCallableTarget(
  checker: ts.TypeChecker,
  expression: ts.Expression,
  visitedExpressions: ReadonlySet<ts.Expression> = new Set(),
): ts.Expression {
  const current = resolveStaticExpressionOrigin(checker, expression);
  if (visitedExpressions.has(current) || !ts.isCallExpression(current)) {
    return current;
  }
  const surface = invocationSurface(checker, current);
  const bindMethod = methodAccessIdentity(checker, surface.target);
  const boundTarget = surface.receiver ?? bindMethod?.receiver;
  if (
    bindMethod?.name !== "bind" ||
    isNil(boundTarget) ||
    !isCallable(checker, boundTarget)
  ) return current;
  return resolveStaticCallableTarget(
    checker,
    boundTarget,
    new Set([...visitedExpressions, current]),
  );
}

function staticCallableName(
  checker: ts.TypeChecker,
  expression: ts.Expression,
): string | undefined {
  const current = resolveStaticCallableTarget(checker, expression);
  const method = methodAccessIdentity(checker, current);
  if (method !== undefined) {
    const owner = resolveStaticExpressionOrigin(checker, method.receiver);
    if (ts.isIdentifier(owner)) {
      return `${resolvedSymbolName(checker, owner) ?? owner.text}.${method.name}`;
    }
  }
  if (ts.isIdentifier(current)) {
    return resolvedSymbolName(checker, current) ?? current.text;
  }
  return undefined;
}

function babylonConstructorNamesFromType(
  checker: ts.TypeChecker,
  type: ts.Type,
): ReadonlySet<string> {
  const names = new Set<string>();
  const visitedTypes = new Set<ts.Type>();
  const visit = (candidate: ts.Type): void => {
    if (visitedTypes.has(candidate)) return;
    visitedTypes.add(candidate);
    if (candidate.isUnionOrIntersection()) {
      for (const member of candidate.types) visit(member);
      return;
    }
    if (candidate.isTypeParameter()) {
      const constraint = checker.getBaseConstraintOfType(candidate) ??
        candidate.getConstraint();
      if (constraint !== undefined) visit(constraint);
    }
    for (const symbol of [candidate.aliasSymbol, candidate.getSymbol()]) {
      if (symbol !== undefined && symbolComesFromBabylon(symbol)) {
        names.add(symbol.getName());
      }
    }
    for (const signature of candidate.getConstructSignatures()) {
      visit(signature.getReturnType());
    }
  };
  visit(type);
  return names;
}

const SCENE_REGISTERED_LIGHT_CONSTRUCTOR_NAMES = new Set([
  "DirectionalLight",
  "HemisphericLight",
  "PointLight",
]);

function babylonConstructorNames(
  checker: ts.TypeChecker,
  expression: ts.Expression,
): ReadonlySet<string> {
  const names = new Set<string>();
  for (const candidate of [
    expression,
    resolveStaticCallableTarget(checker, expression),
  ]) {
    for (const name of babylonConstructorNamesFromType(
      checker,
      checker.getTypeAtLocation(candidate),
    )) names.add(name);
  }
  return names;
}

function expressionCarriesModuleReference(
  checker: ts.TypeChecker,
  expression: ts.Expression,
  carrierSymbols: ReadonlySet<ts.Symbol>,
  visitedSymbols: ReadonlySet<ts.Symbol> = new Set(),
): boolean {
  const current = unwrapExpression(expression);
  if (ts.isIdentifier(current)) {
    const symbol = resolvedSymbol(checker, current);
    if (symbol === undefined) return false;
    if (carrierSymbols.has(symbol)) return true;
    if (visitedSymbols.has(symbol)) return false;
    const declaration = symbol.declarations?.find((candidate): candidate is ts.VariableDeclaration =>
      ts.isVariableDeclaration(candidate) &&
      ts.isIdentifier(candidate.name) &&
      candidate.initializer !== undefined
    );
    return declaration?.initializer !== undefined &&
      expressionCarriesModuleReference(
        checker,
        declaration.initializer,
        carrierSymbols,
        new Set([...visitedSymbols, symbol]),
      );
  }
  if (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
    return expressionCarriesModuleReference(
      checker,
      current.expression,
      carrierSymbols,
      visitedSymbols,
    );
  }
  if (ts.isObjectLiteralExpression(current)) {
    return current.properties.some((property) => {
      if (ts.isPropertyAssignment(property)) {
        return expressionCarriesModuleReference(
          checker,
          property.initializer,
          carrierSymbols,
          visitedSymbols,
        ) || ts.isComputedPropertyName(property.name) &&
          wellKnownSymbolPropertyName(checker, property.name.expression) ===
            "Symbol.iterator" &&
          callableExpressionProducesModuleReference(
            checker,
            property.initializer,
            carrierSymbols,
            visitedSymbols,
          );
      }
      if (ts.isShorthandPropertyAssignment(property)) {
        return expressionCarriesModuleReference(
          checker,
          property.name,
          carrierSymbols,
          visitedSymbols,
        );
      }
      if (ts.isMethodDeclaration(property)) {
        return ts.isComputedPropertyName(property.name) &&
          wellKnownSymbolPropertyName(checker, property.name.expression) ===
            "Symbol.iterator" &&
          functionImplementationsProduceModuleReference(
            checker,
            [property],
            carrierSymbols,
            visitedSymbols,
          );
      }
      if (ts.isGetAccessorDeclaration(property)) {
        return getAccessorProducesModuleReference(
          checker,
          property,
          carrierSymbols,
          visitedSymbols,
        ) ||
          ts.isComputedPropertyName(property.name) &&
            wellKnownSymbolPropertyName(checker, property.name.expression) ===
              "Symbol.iterator" &&
            functionReturnsCallableProducingModuleReference(
              checker,
              property,
              carrierSymbols,
              visitedSymbols,
            );
      }
      return ts.isSpreadAssignment(property) &&
        expressionCarriesModuleReference(
          checker,
          property.expression,
          carrierSymbols,
          visitedSymbols,
        );
    });
  }
  if (ts.isArrayLiteralExpression(current)) {
    return current.elements.some((element) =>
      ts.isExpression(element) && expressionCarriesModuleReference(
        checker,
        element,
        carrierSymbols,
        visitedSymbols,
      ));
  }
  if (ts.isSpreadElement(current)) {
    return expressionCarriesModuleReference(
      checker,
      current.expression,
      carrierSymbols,
      visitedSymbols,
    );
  }
  if (ts.isCallExpression(current)) {
    const invocation = normalizeInvocation(checker, current);
    const method = methodAccessIdentity(checker, invocation.target);
    const methodName = method?.name;
    const receiver = invocation.receiver ?? method?.receiver;
    if (
      ts.isCallExpression(invocation.target) &&
      expressionCarriesModuleReference(
        checker,
        invocation.target,
        carrierSymbols,
        visitedSymbols,
      )
    ) return true;
    if (functionProducesModuleReference(
        checker,
        current,
        carrierSymbols,
        visitedSymbols,
        invocation.target,
      )) return true;
    if (
      MODULE_REFERENCE_CONTAINER_TRANSFORM_METHODS.has(methodName ?? "") &&
      invocation.arguments[0] !== undefined &&
      callableExpressionProducesModuleReference(
        checker,
        invocation.arguments[0],
        carrierSymbols,
        visitedSymbols,
      )
    ) return true;
    if (
      staticCallableName(checker, invocation.target) === "Array.from" &&
      invocation.arguments[1] !== undefined &&
      callableExpressionProducesModuleReference(
        checker,
        invocation.arguments[1],
        carrierSymbols,
        visitedSymbols,
      )
    ) return true;
    const promiseCallbacks = methodName === "then"
      ? invocation.arguments.slice(0, 2)
      : methodName === "catch"
      ? invocation.arguments.slice(0, 1)
      : [];
    if (promiseCallbacks.some((callback) =>
      !isExplicitUndefined(callback) &&
      (callableExpressionProducesModuleReference(
        checker,
        callback,
        carrierSymbols,
        visitedSymbols,
      ) || callableExpressionThrowsModuleReference(
        checker,
        callback,
        carrierSymbols,
        visitedSymbols,
      )))) return true;
    const staticCallName = staticCallableName(checker, invocation.target);
    if (
      (staticCallName === "Object" || staticCallName === "Array" ||
        MODULE_REFERENCE_STATIC_VALUE_METHODS.has(staticCallName ?? "")) &&
      invocation.arguments.some((argument) => expressionCarriesModuleReference(
        checker,
        argument,
        carrierSymbols,
        visitedSymbols,
      ))
    ) return true;
    const carriedArguments = methodName === "concat"
      ? invocation.arguments
      : methodName === "toSpliced"
      ? invocation.arguments.slice(2)
      : methodName === "with"
      ? invocation.arguments.slice(1, 2)
      : methodName === "reduce" || methodName === "reduceRight"
      ? invocation.arguments.slice(1, 2)
      : [];
    if (carriedArguments.some((argument) => expressionCarriesModuleReference(
      checker,
      argument,
      carrierSymbols,
      visitedSymbols,
    ))) return true;
    return receiver !== undefined &&
      MODULE_REFERENCE_CONTAINER_READ_METHODS.has(methodName ?? "") &&
      expressionCarriesModuleReference(
        checker,
        receiver,
        carrierSymbols,
        visitedSymbols,
      );
  }
  if (ts.isTaggedTemplateExpression(current)) {
    return functionProducesModuleReference(
      checker,
      current,
      carrierSymbols,
      visitedSymbols,
    );
  }
  if (ts.isNewExpression(current)) {
    const argumentsList = current.arguments ?? [];
    if (
      argumentsList[0] !== undefined &&
      promiseExecutorSettlesModuleReference(
        checker,
        argumentsList[0],
        carrierSymbols,
        visitedSymbols,
      )
    ) return true;
    return MODULE_REFERENCE_CONTAINER_CONSTRUCTORS.has(
      staticCallableName(checker, current.expression) ?? "",
    ) && argumentsList.some((argument) => expressionCarriesModuleReference(
      checker,
      argument,
      carrierSymbols,
      visitedSymbols,
    ));
  }
  if (ts.isBinaryExpression(current)) {
    return expressionCarriesModuleReference(
      checker,
      current.left,
      carrierSymbols,
      visitedSymbols,
    ) || expressionCarriesModuleReference(
      checker,
      current.right,
      carrierSymbols,
      visitedSymbols,
    );
  }
  if (ts.isConditionalExpression(current)) {
    return expressionCarriesModuleReference(
      checker,
      current.whenTrue,
      carrierSymbols,
      visitedSymbols,
    ) || expressionCarriesModuleReference(
      checker,
      current.whenFalse,
      carrierSymbols,
      visitedSymbols,
    );
  }
  if (ts.isAwaitExpression(current) || ts.isYieldExpression(current)) {
    return current.expression !== undefined && expressionCarriesModuleReference(
      checker,
      current.expression,
      carrierSymbols,
      visitedSymbols,
    );
  }
  return false;
}

function addBindingSymbols(
  checker: ts.TypeChecker,
  name: ts.BindingName,
  target: Set<ts.Symbol>,
): boolean {
  if (ts.isIdentifier(name)) {
    const symbol = resolvedSymbol(checker, name);
    if (symbol === undefined || target.has(symbol)) return false;
    target.add(symbol);
    return true;
  }
  let changed = false;
  for (const element of name.elements) {
    if (!ts.isOmittedExpression(element)) {
      changed = addBindingSymbols(checker, element.name, target) || changed;
    }
  }
  return changed;
}

function addAssignmentTargetSymbols(
  checker: ts.TypeChecker,
  targetNode: ts.Expression,
  target: Set<ts.Symbol>,
): boolean {
  const current = unwrapExpression(targetNode);
  if (ts.isIdentifier(current)) {
    const symbol = resolvedSymbol(checker, current);
    if (symbol === undefined || target.has(symbol)) return false;
    target.add(symbol);
    return true;
  }
  if (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
    const root = rootIdentifier(current.expression);
    const symbol = root === undefined ? undefined : resolvedSymbol(checker, root);
    if (symbol === undefined || target.has(symbol)) return false;
    target.add(symbol);
    return true;
  }
  if (ts.isObjectLiteralExpression(current)) {
    let changed = false;
    for (const property of current.properties) {
      if (ts.isShorthandPropertyAssignment(property)) {
        const valueSymbol = checker.getShorthandAssignmentValueSymbol(property);
        if (valueSymbol !== undefined && !target.has(valueSymbol)) {
          target.add(valueSymbol);
          changed = true;
        }
      } else if (ts.isPropertyAssignment(property)) {
        changed = addAssignmentTargetSymbols(
          checker,
          property.initializer,
          target,
        ) || changed;
      } else if (ts.isSpreadAssignment(property)) {
        changed = addAssignmentTargetSymbols(
          checker,
          property.expression,
          target,
        ) || changed;
      }
    }
    return changed;
  }
  if (ts.isArrayLiteralExpression(current)) {
    let changed = false;
    for (const element of current.elements) {
      if (ts.isExpression(element)) {
        changed = addAssignmentTargetSymbols(
          checker,
          element,
          target,
        ) || changed;
      }
    }
    return changed;
  }
  return false;
}

function functionLikeParameters(
  checker: ts.TypeChecker,
  symbol: ts.Symbol,
): readonly ts.ParameterDeclaration[] {
  return functionLikeImplementations(checker, symbol).flatMap(
    (implementation) => [...implementation.parameters],
  );
}

function callableExpressionParameters(
  checker: ts.TypeChecker,
  expression: ts.Expression,
): readonly ts.ParameterDeclaration[] {
  const current = unwrapExpression(expression);
  if (ts.isFunctionExpression(current) || ts.isArrowFunction(current)) {
    return [...current.parameters];
  }
  const symbol = resolvedSymbol(checker, current);
  return symbol === undefined ? [] : functionLikeParameters(checker, symbol);
}

function promiseExecutorSettlesModuleReference(
  checker: ts.TypeChecker,
  executor: ts.Expression,
  carrierSymbols: ReadonlySet<ts.Symbol>,
  visitedSymbols: ReadonlySet<ts.Symbol>,
): boolean {
  const current = unwrapExpression(executor);
  const implementations = ts.isFunctionExpression(current) ||
      ts.isArrowFunction(current)
    ? [current]
    : (() => {
      const symbol = resolvedSymbol(checker, current);
      return symbol === undefined
        ? []
        : functionLikeImplementations(checker, symbol);
    })();
  return implementations.some((implementation) => {
    const settlementSymbols = new Set(
      implementation.parameters.slice(0, 2).flatMap((parameter) => {
        const symbol = ts.isIdentifier(parameter.name)
          ? resolvedSymbol(checker, parameter.name)
          : undefined;
        return symbol === undefined ? [] : [symbol];
      }),
    );
    if (isEmpty(settlementSymbols) || implementation.body === undefined) {
      return false;
    }
    let settlesReference = false;
    const visit = (node: ts.Node): void => {
      if (settlesReference) return;
      if (node !== implementation && ts.isFunctionLike(node)) return;
      if (ts.isCallExpression(node)) {
        const invocation = normalizeInvocation(checker, node);
        const targetSymbol = resolvedSymbol(checker, invocation.target);
        if (
          targetSymbol !== undefined &&
          settlementSymbols.has(targetSymbol) &&
          invocation.arguments.some((argument) =>
            expressionCarriesModuleReference(
              checker,
              argument,
              carrierSymbols,
              visitedSymbols,
            ))
        ) {
          settlesReference = true;
          return;
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(implementation.body);
    return settlesReference;
  });
}

function functionLikeImplementations(
  checker: ts.TypeChecker,
  symbol: ts.Symbol,
  visitedSymbols: ReadonlySet<ts.Symbol> = new Set(),
): readonly (
  ts.FunctionDeclaration |
  ts.FunctionExpression |
  ts.ArrowFunction |
  ts.MethodDeclaration
)[] {
  if (visitedSymbols.has(symbol)) return [];
  const nextVisited = new Set([...visitedSymbols, symbol]);
  const implementationsFromExpression = (
    expression: ts.Expression,
  ): readonly (
    ts.FunctionDeclaration |
    ts.FunctionExpression |
    ts.ArrowFunction |
    ts.MethodDeclaration
  )[] => {
    const current = unwrapExpression(expression);
    if (ts.isFunctionExpression(current) || ts.isArrowFunction(current)) {
      return [current];
    }
    if (
      ts.isCallExpression(current) &&
      (ts.isPropertyAccessExpression(current.expression) ||
        ts.isElementAccessExpression(current.expression)) &&
      propertyName(checker, current.expression) === "bind"
    ) {
      return implementationsFromExpression(current.expression.expression);
    }
    const referencedSymbol = resolvedSymbol(checker, current);
    return referencedSymbol === undefined
      ? []
      : functionLikeImplementations(checker, referencedSymbol, nextVisited);
  };
  const implementationsFromBindingElement = (
    declaration: ts.BindingElement,
  ): readonly (
    ts.FunctionDeclaration |
    ts.FunctionExpression |
    ts.ArrowFunction |
    ts.MethodDeclaration
  )[] => {
    const pattern = declaration.parent;
    const variableDeclaration = pattern.parent;
    if (
      !ts.isVariableDeclaration(variableDeclaration) ||
      variableDeclaration.initializer === undefined
    ) return [];
    const initializer = unwrapExpression(variableDeclaration.initializer);
    if (
      ts.isObjectBindingPattern(pattern) &&
      ts.isObjectLiteralExpression(initializer)
    ) {
      const keyNode = declaration.propertyName ?? declaration.name;
      const key = ts.isIdentifier(keyNode) || ts.isStringLiteralLike(keyNode) ||
          ts.isNumericLiteral(keyNode)
        ? keyNode.text
        : undefined;
      if (key === undefined) return [];
      const property = initializer.properties.find((candidate) => {
        if (ts.isShorthandPropertyAssignment(candidate)) {
          return candidate.name.text === key;
        }
        if (!ts.isPropertyAssignment(candidate)) return false;
        return (ts.isIdentifier(candidate.name) ||
            ts.isStringLiteralLike(candidate.name) ||
            ts.isNumericLiteral(candidate.name)) && candidate.name.text === key;
      });
      if (property === undefined) return [];
      return ts.isShorthandPropertyAssignment(property)
        ? implementationsFromExpression(property.name)
        : ts.isPropertyAssignment(property)
        ? implementationsFromExpression(property.initializer)
        : [];
    }
    if (
      ts.isArrayBindingPattern(pattern) &&
      ts.isArrayLiteralExpression(initializer)
    ) {
      const index = pattern.elements.findIndex((element) =>
        !ts.isOmittedExpression(element) &&
        resolvedSymbol(checker, element.name) === symbol);
      const element = initializer.elements[index];
      return element !== undefined && ts.isExpression(element)
        ? implementationsFromExpression(element)
        : [];
    }
    return [];
  };
  const declarationImplementations = symbol.declarations?.flatMap((declaration) => {
    if (
      ts.isFunctionDeclaration(declaration) ||
      ts.isFunctionExpression(declaration) ||
      ts.isArrowFunction(declaration) ||
      ts.isMethodDeclaration(declaration)
    ) return [declaration];
    if (
      ts.isVariableDeclaration(declaration) &&
      declaration.initializer !== undefined
    ) {
      return implementationsFromExpression(declaration.initializer);
    }
    if (ts.isPropertyAssignment(declaration)) {
      return implementationsFromExpression(declaration.initializer);
    }
    if (ts.isShorthandPropertyAssignment(declaration)) {
      const valueSymbol = checker.getShorthandAssignmentValueSymbol(declaration);
      return valueSymbol === undefined
        ? []
        : functionLikeImplementations(checker, valueSymbol, nextVisited);
    }
    if (ts.isBindingElement(declaration)) {
      return implementationsFromBindingElement(declaration);
    }
    return [];
  }) ?? [];
  const assignmentImplementations: (
    ts.FunctionDeclaration |
    ts.FunctionExpression |
    ts.ArrowFunction |
    ts.MethodDeclaration
  )[] = [];
  const sourceFiles = new Set(
    symbol.declarations?.map((declaration) => declaration.getSourceFile()) ?? [],
  );
  const visitAssignment = (node: ts.Node): void => {
    if (
      ts.isBinaryExpression(node) &&
      isWriteOperator(node.operatorToken.kind) &&
      resolvedSymbol(checker, unwrapExpression(node.left)) === symbol
    ) {
      assignmentImplementations.push(...implementationsFromExpression(node.right));
    }
    ts.forEachChild(node, visitAssignment);
  };
  for (const sourceFile of sourceFiles) visitAssignment(sourceFile);
  return [...declarationImplementations, ...assignmentImplementations];
}

function functionProducesModuleReference(
  checker: ts.TypeChecker,
  invocation: ts.CallExpression | ts.TaggedTemplateExpression,
  carrierSymbols: ReadonlySet<ts.Symbol>,
  visitedSymbols: ReadonlySet<ts.Symbol>,
  invokedExpression?: ts.Expression,
): boolean {
  const symbol = resolvedSymbol(
    checker,
    invokedExpression ?? (ts.isCallExpression(invocation)
      ? invocation.expression
      : invocation.tag),
  );
  if (symbol === undefined || visitedSymbols.has(symbol)) return false;
  const nextVisited = new Set([...visitedSymbols, symbol]);
  const signatureDeclaration = checker.getResolvedSignature(invocation)?.declaration;
  const signatureImplementation = signatureDeclaration !== undefined &&
      (ts.isFunctionDeclaration(signatureDeclaration) ||
        ts.isFunctionExpression(signatureDeclaration) ||
        ts.isArrowFunction(signatureDeclaration) ||
        ts.isMethodDeclaration(signatureDeclaration)) &&
      signatureDeclaration.body !== undefined
    ? [signatureDeclaration]
    : [];
  return functionImplementationsProduceModuleReference(
    checker,
    [
      ...signatureImplementation,
      ...functionLikeImplementations(checker, symbol),
    ],
    carrierSymbols,
    nextVisited,
  );
}

function callableExpressionProducesModuleReference(
  checker: ts.TypeChecker,
  expression: ts.Expression,
  carrierSymbols: ReadonlySet<ts.Symbol>,
  visitedSymbols: ReadonlySet<ts.Symbol>,
): boolean {
  const current = unwrapExpression(expression);
  const implementations = ts.isFunctionExpression(current) ||
      ts.isArrowFunction(current)
    ? [current]
    : (() => {
      const symbol = resolvedSymbol(checker, current);
      return symbol === undefined
        ? []
        : functionLikeImplementations(checker, symbol);
    })();
  return functionImplementationsProduceModuleReference(
    checker,
    implementations,
    carrierSymbols,
    visitedSymbols,
  );
}

function callableExpressionThrowsModuleReference(
  checker: ts.TypeChecker,
  expression: ts.Expression,
  carrierSymbols: ReadonlySet<ts.Symbol>,
  visitedSymbols: ReadonlySet<ts.Symbol>,
): boolean {
  const current = unwrapExpression(expression);
  const implementations = ts.isFunctionExpression(current) ||
      ts.isArrowFunction(current)
    ? [current]
    : (() => {
      const symbol = resolvedSymbol(checker, current);
      return symbol === undefined
        ? []
        : functionLikeImplementations(checker, symbol);
    })();
  return implementations.some((implementation) => {
    const body = implementation.body;
    if (body === undefined || !ts.isBlock(body)) return false;
    let throwsReference = false;
    const visit = (node: ts.Node): void => {
      if (throwsReference) return;
      if (node !== implementation && ts.isFunctionLike(node)) return;
      if (
        ts.isThrowStatement(node) &&
        expressionCarriesModuleReference(
          checker,
          node.expression,
          carrierSymbols,
          visitedSymbols,
        )
      ) {
        throwsReference = true;
        return;
      }
      ts.forEachChild(node, visit);
    };
    visit(body);
    return throwsReference;
  });
}

function functionReturnsCallableProducingModuleReference(
  checker: ts.TypeChecker,
  implementation: ts.GetAccessorDeclaration,
  carrierSymbols: ReadonlySet<ts.Symbol>,
  visitedSymbols: ReadonlySet<ts.Symbol>,
): boolean {
  const body = implementation.body;
  if (body === undefined) return false;
  let returnsCarrier = false;
  const visit = (node: ts.Node): void => {
    if (returnsCarrier) return;
    if (node !== implementation && ts.isFunctionLike(node)) return;
    if (
      ts.isReturnStatement(node) &&
      node.expression !== undefined &&
      callableExpressionProducesModuleReference(
        checker,
        node.expression,
        carrierSymbols,
        visitedSymbols,
      )
    ) {
      returnsCarrier = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(body);
  return returnsCarrier;
}

function getAccessorProducesModuleReference(
  checker: ts.TypeChecker,
  implementation: ts.GetAccessorDeclaration,
  carrierSymbols: ReadonlySet<ts.Symbol>,
  visitedSymbols: ReadonlySet<ts.Symbol>,
): boolean {
  const body = implementation.body;
  if (body === undefined) return false;
  let returnsCarrier = false;
  const visit = (node: ts.Node): void => {
    if (returnsCarrier) return;
    if (node !== implementation && ts.isFunctionLike(node)) return;
    if (
      ts.isReturnStatement(node) &&
      node.expression !== undefined &&
      expressionCarriesModuleReference(
        checker,
        node.expression,
        carrierSymbols,
        visitedSymbols,
      )
    ) {
      returnsCarrier = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(body);
  return returnsCarrier;
}

function functionImplementationsProduceModuleReference(
  checker: ts.TypeChecker,
  implementations: readonly (
    ts.FunctionDeclaration |
    ts.FunctionExpression |
    ts.ArrowFunction |
    ts.MethodDeclaration
  )[],
  carrierSymbols: ReadonlySet<ts.Symbol>,
  visitedSymbols: ReadonlySet<ts.Symbol>,
): boolean {
  return implementations.some((implementation) => {
    const body = implementation.body;
    if (body === undefined) return false;
    if (!ts.isBlock(body)) {
      return expressionCarriesModuleReference(
        checker,
        body,
        carrierSymbols,
        visitedSymbols,
      );
    }
    let carriesReference = false;
    const visit = (node: ts.Node): void => {
      if (carriesReference) return;
      if (node !== implementation && ts.isFunctionLike(node)) return;
      if (
        (ts.isReturnStatement(node) || ts.isYieldExpression(node)) &&
        node.expression !== undefined &&
        (
          expressionCarriesModuleReference(
            checker,
            node.expression,
            carrierSymbols,
            visitedSymbols,
          ) ||
          callableExpressionProducesModuleReference(
            checker,
            node.expression,
            carrierSymbols,
            visitedSymbols,
          )
        )
      ) {
        carriesReference = true;
        return;
      }
      ts.forEachChild(node, visit);
    };
    visit(body);
    return carriesReference;
  });
}

function collectReferenceCarrierSymbols(
  checker: ts.TypeChecker,
  sourceFiles: readonly ts.SourceFile[],
  initialCarrierSymbols: ReadonlySet<ts.Symbol>,
): ReadonlySet<ts.Symbol> {
  const carrierSymbols = new Set(initialCarrierSymbols);
  const carryInvocationArguments = (
    target: ts.Expression,
    invocationArguments: readonly ts.Expression[],
  ): boolean => {
    const targetSymbol = resolvedSymbol(checker, target);
    if (targetSymbol === undefined) return false;
    const parameters = functionLikeParameters(checker, targetSymbol);
    let didChange = false;
    for (const [index, argument] of invocationArguments.entries()) {
      if (!expressionCarriesModuleReference(
        checker,
        argument,
        carrierSymbols,
      )) continue;
      const parameter = parameters[index] ?? parameters.at(-1);
      if (parameter !== undefined) {
        didChange = addBindingSymbols(
          checker,
          parameter.name,
          carrierSymbols,
        ) || didChange;
      }
    }
    return didChange;
  };
  const carryConstructorArguments = (
    target: ts.Expression,
    invocationArguments: readonly ts.Expression[],
    visitedExpressions: ReadonlySet<ts.Expression> = new Set(),
  ): boolean => {
    const origin = resolveStaticExpressionOrigin(checker, target);
    if (visitedExpressions.has(origin)) return false;
    if (ts.isCallExpression(origin)) {
      const bindSurface = invocationSurface(checker, origin);
      const bindMethod = methodAccessIdentity(checker, bindSurface.target);
      const boundTarget = bindSurface.receiver ?? bindMethod?.receiver;
      if (
        bindMethod?.name === "bind" &&
        boundTarget !== undefined &&
        isCallable(checker, boundTarget)
      ) {
        return carryConstructorArguments(
          boundTarget,
          [...bindSurface.arguments.slice(1), ...invocationArguments],
          new Set([...visitedExpressions, origin]),
        );
      }
    }
    return carryInvocationArguments(target, invocationArguments);
  };
  let changed = true;
  while (changed) {
    changed = false;
    const visit = (node: ts.Node): void => {
      if (
        ts.isVariableDeclaration(node) &&
        node.initializer !== undefined &&
        expressionCarriesModuleReference(checker, node.initializer, carrierSymbols)
      ) {
        changed = addBindingSymbols(checker, node.name, carrierSymbols) || changed;
      }
      if (
        ts.isParameter(node) &&
        node.initializer !== undefined &&
        expressionCarriesModuleReference(checker, node.initializer, carrierSymbols)
      ) {
        changed = addBindingSymbols(checker, node.name, carrierSymbols) || changed;
      }
      if (
        ts.isBindingElement(node) &&
        node.initializer !== undefined &&
        expressionCarriesModuleReference(checker, node.initializer, carrierSymbols)
      ) {
        changed = addBindingSymbols(checker, node.name, carrierSymbols) || changed;
      }
      if (
        ts.isShorthandPropertyAssignment(node) &&
        node.objectAssignmentInitializer !== undefined &&
        expressionCarriesModuleReference(
          checker,
          node.objectAssignmentInitializer,
          carrierSymbols,
        )
      ) {
        const valueSymbol = checker.getShorthandAssignmentValueSymbol(node) ??
          resolvedSymbol(checker, node.name);
        if (valueSymbol !== undefined && !carrierSymbols.has(valueSymbol)) {
          carrierSymbols.add(valueSymbol);
          changed = true;
        }
      }
      if (
        ts.isForOfStatement(node) &&
        expressionCarriesModuleReference(checker, node.expression, carrierSymbols)
      ) {
        if (ts.isVariableDeclarationList(node.initializer)) {
          for (const declaration of node.initializer.declarations) {
            changed = addBindingSymbols(
              checker,
              declaration.name,
              carrierSymbols,
            ) || changed;
          }
        } else {
          changed = addAssignmentTargetSymbols(
            checker,
            node.initializer,
            carrierSymbols,
          ) || changed;
        }
      }
      if (
        ts.isBinaryExpression(node) &&
        isWriteOperator(node.operatorToken.kind) &&
        expressionCarriesModuleReference(checker, node.right, carrierSymbols)
      ) {
        changed = addAssignmentTargetSymbols(
          checker,
          node.left,
          carrierSymbols,
        ) || changed;
      }
      if (
        ts.isCatchClause(node) &&
        node.variableDeclaration !== undefined
      ) {
        let catchesCarrier = false;
        const visitThrownValue = (candidate: ts.Node): void => {
          if (catchesCarrier) return;
          if (candidate !== node.parent.tryBlock && ts.isFunctionLike(candidate)) {
            return;
          }
          if (
            ts.isThrowStatement(candidate) &&
            expressionCarriesModuleReference(
              checker,
              candidate.expression,
              carrierSymbols,
            )
          ) {
            catchesCarrier = true;
            return;
          }
          ts.forEachChild(candidate, visitThrownValue);
        };
        visitThrownValue(node.parent.tryBlock);
        if (catchesCarrier) {
          changed = addBindingSymbols(
            checker,
            node.variableDeclaration.name,
            carrierSymbols,
          ) || changed;
        }
      }
      if (ts.isCallExpression(node)) {
        const bindSurface = invocationSurface(checker, node);
        const bindMethod = methodAccessIdentity(checker, bindSurface.target);
        const boundTarget = bindSurface.receiver ?? bindMethod?.receiver;
        if (
          bindMethod?.name === "bind" &&
          boundTarget !== undefined &&
          isCallable(checker, boundTarget)
        ) {
          changed = carryInvocationArguments(
            boundTarget,
            bindSurface.arguments.slice(1),
          ) || changed;
        }
        const invocation = normalizeInvocation(checker, node);
        const method = methodAccessIdentity(checker, invocation.target);
        const methodName = method?.name;
        const receiver = invocation.receiver ?? method?.receiver;
        const carryCallbackParameters = (
          callbacks: readonly ts.Expression[],
          carriedParameterCount: number,
        ): void => {
          for (const callback of callbacks) {
            if (isExplicitUndefined(callback)) continue;
            for (const parameter of callableExpressionParameters(
              checker,
              callback,
            ).slice(0, carriedParameterCount)) {
              changed = addBindingSymbols(
                checker,
                parameter.name,
                carrierSymbols,
              ) || changed;
            }
          }
        };
        const carriesArgument = invocation.arguments.some((argument) =>
          expressionCarriesModuleReference(checker, argument, carrierSymbols));
        if (carriesArgument && receiver !== undefined) {
          changed = addAssignmentTargetSymbols(
            checker,
            receiver,
            carrierSymbols,
          ) || changed;
        }
        if (
          MODULE_REFERENCE_CONTAINER_CALLBACK_METHODS.has(methodName ?? "") &&
          receiver !== undefined &&
          expressionCarriesModuleReference(
            checker,
            receiver,
            carrierSymbols,
          )
        ) {
          const callbacks = methodName === "then"
            ? invocation.arguments.slice(0, 2)
            : invocation.arguments.slice(0, 1);
          carryCallbackParameters(
            callbacks,
            methodName === "sort" || methodName === "reduce" ||
                methodName === "reduceRight" || methodName === "forEach"
              ? 2
              : 1,
          );
        }
        changed = carryInvocationArguments(
          invocation.target,
          invocation.arguments,
        ) || changed;
      }
      if (ts.isNewExpression(node)) {
        changed = carryConstructorArguments(
          node.expression,
          node.arguments ?? [],
        ) || changed;
      }
      if (ts.isTaggedTemplateExpression(node)) {
        const calleeSymbol = resolvedSymbol(checker, node.tag);
        if (calleeSymbol !== undefined) {
          const parameters = functionLikeParameters(checker, calleeSymbol);
          const substitutions = ts.isTemplateExpression(node.template)
            ? node.template.templateSpans.map((span) => span.expression)
            : [];
          for (const [index, substitution] of substitutions.entries()) {
            if (!expressionCarriesModuleReference(
              checker,
              substitution,
              carrierSymbols,
            )) continue;
            const parameter = parameters[index + 1] ?? parameters.at(-1);
            if (parameter !== undefined) {
              changed = addBindingSymbols(
                checker,
                parameter.name,
                carrierSymbols,
              ) || changed;
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    for (const sourceFile of sourceFiles) visit(sourceFile);
  }
  return carrierSymbols;
}

function resolvedSymbol(
  checker: ts.TypeChecker,
  node: ts.Node,
): ts.Symbol | undefined {
  const current = ts.isExpression(node) ? unwrapExpression(node) : node;
  const symbol = checker.getSymbolAtLocation(current);
  if (symbol === undefined) return undefined;
  return (symbol.flags & ts.SymbolFlags.Alias) !== 0
    ? checker.getAliasedSymbol(symbol)
    : symbol;
}

function resolvedSymbolName(
  checker: ts.TypeChecker,
  node: ts.Node,
): string | undefined {
  return resolvedSymbol(checker, node)?.getName();
}

function isForbiddenStandardRandomOrTimeProperty(
  checker: ts.TypeChecker,
  owner: ts.Expression,
  key: string | undefined,
): boolean {
  if (key === undefined) return false;
  const expectedInterfaceName = key === "random"
    ? "Math"
    : key === "now"
    ? "DateConstructor"
    : undefined;
  if (expectedInterfaceName === undefined) return false;
  const origin = resolveStaticExpressionOrigin(checker, owner);
  const symbol = checker.getPropertyOfType(
    checker.getTypeAtLocation(origin),
    key,
  );
  return symbol?.declarations?.some((declaration) => {
    let current: ts.Node | undefined = declaration.parent;
    while (current !== undefined) {
      if (
        ts.isInterfaceDeclaration(current) &&
        current.name.text === expectedInterfaceName
      ) return true;
      current = current.parent;
    }
    return false;
  }) === true;
}

function isForbiddenStandardReflectionProperty(
  checker: ts.TypeChecker,
  owner: ts.Expression,
  key: string | undefined,
): boolean {
  if (
    key === undefined ||
    !FORBIDDEN_STANDARD_REFLECTION_METHODS.has(key)
  ) return false;
  const origin = resolveStaticExpressionOrigin(checker, owner);
  const symbol = checker.getPropertyOfType(
    checker.getTypeAtLocation(origin),
    key,
  );
  return symbol?.declarations?.some((declaration) => {
    let current: ts.Node | undefined = declaration.parent;
    while (current !== undefined) {
      if (
        ts.isInterfaceDeclaration(current) &&
        current.name.text === "ObjectConstructor"
      ) return true;
      current = current.parent;
    }
    return false;
  }) === true;
}

function isBooleanLiteral(expression: ts.Expression, value: boolean): boolean {
  const current = unwrapExpression(expression);
  return current.kind === (value
    ? ts.SyntaxKind.TrueKeyword
    : ts.SyntaxKind.FalseKeyword);
}

function isExplicitUndefined(expression: ts.Expression): boolean {
  const current = unwrapExpression(expression);
  return ts.isIdentifier(current) && current.text === "undefined" ||
    ts.isVoidExpression(current);
}

function propertyName(
  checker: ts.TypeChecker,
  node: ts.PropertyAccessExpression | ts.ElementAccessExpression,
): string | undefined {
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  if (node.argumentExpression === undefined) return undefined;
  if (ts.isStringLiteralLike(node.argumentExpression)) {
    return node.argumentExpression.text;
  }
  const argument = unwrapExpression(node.argumentExpression);
  const symbolPropertyName = wellKnownSymbolPropertyName(checker, argument);
  if (symbolPropertyName !== undefined) return symbolPropertyName;
  const argumentType = checker.getTypeAtLocation(node.argumentExpression);
  return argumentType.isStringLiteral() ? argumentType.value : undefined;
}

function wellKnownSymbolPropertyName(
  checker: ts.TypeChecker,
  expression: ts.Expression,
): "Symbol.iterator" | undefined {
  const current = resolveStaticExpressionOrigin(checker, expression);
  return ts.isPropertyAccessExpression(current) &&
      ts.isIdentifier(current.expression) &&
      current.expression.text === "Symbol" &&
      current.name.text === "iterator"
    ? "Symbol.iterator"
    : undefined;
}

function isObservableExpression(checker: ts.TypeChecker, node: ts.Node): boolean {
  return checker.typeToString(checker.getTypeAtLocation(node)).includes("Observable<");
}

function isWriteOperator(kind: ts.SyntaxKind): boolean {
  return kind >= ts.SyntaxKind.FirstAssignment && kind <= ts.SyntaxKind.LastAssignment;
}

function rootIdentifier(expression: ts.Expression): ts.Identifier | undefined {
  const current = unwrapExpression(expression);
  if (ts.isIdentifier(current)) return current;
  if (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
    return rootIdentifier(current.expression);
  }
  return undefined;
}

function rootIsThis(expression: ts.Expression): boolean {
  const current = unwrapExpression(expression);
  if (current.kind === ts.SyntaxKind.ThisKeyword) return true;
  if (
    ts.isPropertyAccessExpression(current) ||
    ts.isElementAccessExpression(current)
  ) {
    return rootIsThis(current.expression);
  }
  return false;
}

function staticPropertyName(name: ts.PropertyName): string | undefined {
  if (
    ts.isIdentifier(name) ||
    ts.isStringLiteralLike(name) ||
    ts.isNumericLiteral(name)
  ) return name.text;
  if (!ts.isComputedPropertyName(name)) return undefined;
  const expression = unwrapExpression(name.expression);
  return ts.isStringLiteralLike(expression) ? expression.text : undefined;
}

function destructuredMemberNames(node: ts.Node): readonly string[] {
  if (ts.isObjectBindingPattern(node)) {
    return node.elements.flatMap((element) => {
      const ownName = element.propertyName === undefined &&
          ts.isIdentifier(element.name)
        ? element.name.text
        : element.propertyName === undefined
          ? undefined
          : staticPropertyName(element.propertyName);
      return [
        ...(ownName === undefined ? [] : [ownName]),
        ...destructuredMemberNames(element.name),
      ];
    });
  }
  if (ts.isArrayBindingPattern(node)) {
    return node.elements.flatMap((element) =>
      ts.isBindingElement(element) ? destructuredMemberNames(element.name) : []
    );
  }
  if (ts.isObjectLiteralExpression(node)) {
    return node.properties.flatMap((property) => {
      if (ts.isShorthandPropertyAssignment(property)) return [property.name.text];
      if (ts.isPropertyAssignment(property)) {
        const ownName = staticPropertyName(property.name);
        return [
          ...(ownName === undefined ? [] : [ownName]),
          ...destructuredMemberNames(property.initializer),
        ];
      }
      return [];
    });
  }
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.flatMap((element) =>
      ts.isExpression(element) ? destructuredMemberNames(element) : []
    );
  }
  return [];
}

function validateEntryExports(sourceFile: ts.SourceFile): void {
  if (sourceFile.fileName !== "scene.ts") return;
  let defaultExport: ts.ExportAssignment | undefined;
  for (const statement of sourceFile.statements) {
    if (ts.isExportAssignment(statement) && !statement.isExportEquals) {
      if (defaultExport !== undefined) {
        failAt(
          sourceFile,
          statement,
          "WORLDKIT_NATIVE_SCENE_RUNTIME_EXPORT_INVALID",
          "source-admission",
          "scene.ts must expose exactly one default Native Module.",
          "Remove every export except the one default defineBabylonNativeScene expression.",
        );
      }
      defaultExport = statement;
      continue;
    }
    if (ts.isExportDeclaration(statement)) {
      const isTypeOnly = statement.isTypeOnly ||
        statement.exportClause !== undefined &&
        ts.isNamedExports(statement.exportClause) &&
        statement.exportClause.elements.every((element) => element.isTypeOnly);
      if (isTypeOnly) continue;
      failAt(
        sourceFile,
        statement,
        "WORLDKIT_NATIVE_SCENE_RUNTIME_EXPORT_INVALID",
        "source-admission",
        "scene.ts cannot expose additional Runtime exports.",
        "Keep only the default Native Module export and optional type-only exports.",
      );
    }
    if (hasExportModifier(statement) && !isTypeOnlyTopLevelStatement(statement)) {
      failAt(
        sourceFile,
        statement,
        "WORLDKIT_NATIVE_SCENE_RUNTIME_EXPORT_INVALID",
        "source-admission",
        "scene.ts cannot expose additional Runtime exports.",
        "Keep only the default Native Module export and optional type-only exports.",
      );
    }
  }
  if (defaultExport === undefined) {
    failAt(
      sourceFile,
      sourceFile,
      "WORLDKIT_NATIVE_SCENE_RUNTIME_EXPORT_INVALID",
      "source-admission",
      "scene.ts must expose one default Native Module.",
      "Export default the result of defineBabylonNativeScene(...).",
    );
  }
  const expression = unwrapExpression(defaultExport.expression);
  if (
    !ts.isCallExpression(expression) ||
    !ts.isIdentifier(expression.expression) ||
    expression.expression.text !== "defineBabylonNativeScene"
  ) {
    failAt(
      sourceFile,
      defaultExport,
      "WORLDKIT_NATIVE_SCENE_RUNTIME_EXPORT_INVALID",
      "source-admission",
      "The default export must directly define one Native Module.",
      "Use export default defineBabylonNativeScene({...}).",
    );
  }
}

function validateModuleScope(sourceFile: ts.SourceFile): void {
  for (const statement of sourceFile.statements) {
    if (ts.isExpressionStatement(statement)) {
      const expression = unwrapExpression(statement.expression);
      const isHarmlessVoidReference = ts.isVoidExpression(expression) &&
        (ts.isIdentifier(unwrapExpression(expression.expression)) ||
          ts.isPropertyAccessExpression(unwrapExpression(expression.expression)));
      if (!isHarmlessVoidReference) {
        failAt(
          sourceFile,
          statement,
          "WORLDKIT_NATIVE_SCENE_SOURCE_MODULE_STATE_FORBIDDEN",
          "source-admission",
          "Native source cannot execute work while the Module is loading.",
          "Move all visual construction and changing state inside build().",
        );
      }
      continue;
    }
    if (ts.isVariableStatement(statement)) {
      const isConst = (statement.declarationList.flags & ts.NodeFlags.Const) !== 0;
      for (const declaration of statement.declarationList.declarations) {
        const initializer = declaration.initializer;
        if (
          isConst && initializer !== undefined &&
          (isPrimitiveConstantExpression(initializer) ||
            isAllowedFrozenConstant(initializer))
        ) continue;
        failAt(
          sourceFile,
          declaration,
          "WORLDKIT_NATIVE_SCENE_SOURCE_MODULE_STATE_FORBIDDEN",
          "source-admission",
          "Native source cannot retain mutable module-scope state.",
          "Keep changing values inside build() and use only frozen literal tables at module scope.",
        );
      }
      continue;
    }
    if (ts.isClassDeclaration(statement) || ts.isEnumDeclaration(statement)) {
      failAt(
        sourceFile,
        statement,
        "WORLDKIT_NATIVE_SCENE_SOURCE_LIFECYCLE_FORBIDDEN",
        "source-admission",
        "Native source cannot declare module-load runtime containers.",
        "Use pure functions, type declarations, and frozen literal constants only.",
      );
    }
  }
}

function collectDeclaredNames(sourceFile: ts.SourceFile): ReadonlySet<string> {
  const names = new Set<string>();
  const addBindingName = (name: ts.BindingName): void => {
    if (ts.isIdentifier(name)) {
      names.add(name.text);
      return;
    }
    for (const element of name.elements) {
      if (!ts.isOmittedExpression(element)) addBindingName(element.name);
    }
  };
  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) ||
      ts.isParameter(node) ||
      ts.isBindingElement(node)
    ) addBindingName(node.name);
    if (
      (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) ||
        ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) ||
        ts.isEnumDeclaration(node)) &&
      node.name !== undefined
    ) names.add(node.name.text);
    if (ts.isImportClause(node) && node.name !== undefined) names.add(node.name.text);
    if (ts.isImportSpecifier(node)) names.add(node.name.text);
    if (ts.isNamespaceImport(node)) names.add(node.name.text);
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return names;
}

function isIdentifierDeclarationOrPropertyName(node: ts.Identifier): boolean {
  const parent = node.parent;
  if (
    (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
    (ts.isPropertyAssignment(parent) && parent.name === node) ||
    (ts.isPropertyDeclaration(parent) && parent.name === node) ||
    (ts.isMethodDeclaration(parent) && parent.name === node) ||
    (ts.isPropertySignature(parent) && parent.name === node) ||
    (ts.isMethodSignature(parent) && parent.name === node) ||
    (ts.isLabeledStatement(parent) && parent.label === node)
  ) return true;
  if (
    (ts.isVariableDeclaration(parent) || ts.isParameter(parent) ||
      ts.isBindingElement(parent) || ts.isFunctionDeclaration(parent) ||
      ts.isClassDeclaration(parent) || ts.isInterfaceDeclaration(parent) ||
      ts.isTypeAliasDeclaration(parent) || ts.isEnumDeclaration(parent) ||
      ts.isImportClause(parent) || ts.isImportSpecifier(parent) ||
      ts.isNamespaceImport(parent)) &&
    parent.name === node
  ) return true;
  return false;
}

function structuralCapabilityMemberName(
  node: ts.Node,
): string | undefined {
  if (ts.isPropertySignature(node) || ts.isMethodSignature(node)) {
    return staticPropertyName(node.name);
  }
  if (ts.isLiteralTypeNode(node) && ts.isStringLiteralLike(node.literal)) {
    return node.literal.text;
  }
  return undefined;
}

function validateSourceSyntaxPolicy(localSources: readonly LocalSourceV1[]): void {
  for (const localSource of localSources) {
    const sourceFile = localSource.sourceFile;
    validateEntryExports(sourceFile);
    validateModuleScope(sourceFile);
    const declaredNames = collectDeclaredNames(sourceFile);

    const visit = (node: ts.Node): void => {
      if (node.kind === ts.SyntaxKind.ThisKeyword) {
        failAt(
          sourceFile,
          node,
          "WORLDKIT_NATIVE_SCENE_SOURCE_MODULE_STATE_FORBIDDEN",
          "source-admission",
          "Native source cannot access the Module instance during build().",
          "Use only the explicit BuildContext and local values inside build().",
        );
      }
      if (
        FORBIDDEN_STRUCTURAL_CAPABILITY_MEMBER_NAMES.has(
          structuralCapabilityMemberName(node) ?? "",
        )
      ) {
        failAt(
          sourceFile,
          node,
          "WORLDKIT_NATIVE_SCENE_SOURCE_CAPABILITY_FORBIDDEN",
          "source-admission",
          "Native source cannot erase a reserved capability behind a structural member type.",
          "Keep exact Math, Babylon, and BuildContext types so Source Admission can verify capability ownership.",
        );
      }
      const destructuredNames = ts.isObjectBindingPattern(node)
        ? destructuredMemberNames(node)
        : ts.isBinaryExpression(node) &&
            isWriteOperator(node.operatorToken.kind) &&
            (ts.isObjectLiteralExpression(node.left) ||
              ts.isArrayLiteralExpression(node.left))
          ? destructuredMemberNames(node.left)
          : [];
      const forbiddenDestructuredName = destructuredNames.find((name) =>
        FORBIDDEN_STRUCTURAL_CAPABILITY_MEMBER_NAMES.has(name)
      );
      if (forbiddenDestructuredName !== undefined) {
        const isStandardCapability = forbiddenDestructuredName === "random" ||
          forbiddenDestructuredName === "now";
        failAt(
          sourceFile,
          node,
          isStandardCapability
            ? "WORLDKIT_NATIVE_SCENE_SOURCE_CAPABILITY_FORBIDDEN"
            : "WORLDKIT_NATIVE_SCENE_SOURCE_LIFECYCLE_FORBIDDEN",
          "source-admission",
          "Native source cannot erase a reserved capability through destructuring.",
          "Keep exact Math, Babylon, and BuildContext types and access admitted visual properties directly.",
        );
      }
      if (ts.isWithStatement(node)) {
        failAt(
          sourceFile,
          node,
          "WORLDKIT_NATIVE_SCENE_SOURCE_CAPABILITY_FORBIDDEN",
          "source-admission",
          "Native source cannot use with statements to hide capability ownership.",
          "Use explicit property access so Source Admission can verify every capability owner.",
        );
      }
      if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
        failAt(
          sourceFile,
          node,
          "WORLDKIT_NATIVE_SCENE_SOURCE_LIFECYCLE_FORBIDDEN",
          "source-admission",
          "User-defined classes can retain lifecycle authority outside build().",
          "Use pure functions and local build variables instead of controllers or classes.",
        );
      }
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        failAt(
          sourceFile,
          node,
          "WORLDKIT_NATIVE_SCENE_DYNAMIC_IMPORT_FORBIDDEN",
          "source-admission",
          "Dynamic import is not part of the fixed Native source graph.",
          "Use a static ESM import so the Host can freeze the complete dependency graph.",
        );
      }
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) &&
        node.expression.text === "require" && !declaredNames.has("require")) {
        failAt(
          sourceFile,
          node,
          "WORLDKIT_NATIVE_SCENE_SOURCE_CAPABILITY_FORBIDDEN",
          "source-admission",
          "CommonJS loading is outside the Native capability profile.",
          "Use only allowlisted static ESM imports.",
        );
      }
      if (
        ts.isIdentifier(node) &&
        FORBIDDEN_GLOBAL_IDENTIFIERS.has(node.text) &&
        !declaredNames.has(node.text) &&
        !isIdentifierDeclarationOrPropertyName(node)
      ) {
        failAt(
          sourceFile,
          node,
          "WORLDKIT_NATIVE_SCENE_SOURCE_CAPABILITY_FORBIDDEN",
          "source-admission",
          "Native source uses a nondeterministic or Host-owned global capability.",
          "Use only build context capabilities and deterministic local computation.",
        );
      }
      if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) &&
        !declaredNames.has(node.expression.text) &&
        ((node.expression.text === "Math" && node.name.text === "random") ||
          (node.expression.text === "Date" && node.name.text === "now"))) {
        failAt(
          sourceFile,
          node,
          "WORLDKIT_NATIVE_SCENE_SOURCE_CAPABILITY_FORBIDDEN",
          "source-admission",
          "Native source uses an unfrozen random or time source.",
          "Use context.random and Bootstrap-owned deterministic inputs.",
        );
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
}

function validateSourcePolicy(
  localSources: readonly LocalSourceV1[],
  program: ts.Program,
): void {
  const checker = program.getTypeChecker();
  const programSourceFiles = localSources.flatMap((source) => {
    const sourceFile = program.getSourceFile(source.absolutePath);
    return sourceFile === undefined ? [] : [sourceFile];
  });
  const canonicalPathByAbsolutePath = new Map(localSources.map((source) => [
    path.normalize(source.absolutePath),
    source.canonicalPath,
  ] as const));
  const moduleScopeSymbols = new Set<ts.Symbol>();

  for (const localSource of localSources) {
    const programSourceFile = program.getSourceFile(localSource.absolutePath);
    if (programSourceFile === undefined) {
      failAt(
        localSource.sourceFile,
        localSource.sourceFile,
        "WORLDKIT_NATIVE_SCENE_DEPENDENCY_UNRESOLVED",
        "dependency",
        "The admitted source was not present in the TypeScript Program.",
        "Repair the source graph before running Native admission.",
      );
    }
    PUBLIC_SOURCE_PATH_BY_SOURCE_FILE.set(
      programSourceFile,
      localSource.canonicalPath,
    );
    for (const statement of programSourceFile.statements) {
      if (ts.isImportDeclaration(statement) && statement.importClause !== undefined) {
        const importBindings: ts.Identifier[] = [];
        if (statement.importClause.name !== undefined) {
          importBindings.push(statement.importClause.name);
        }
        const namedBindings = statement.importClause.namedBindings;
        if (namedBindings !== undefined) {
          if (ts.isNamespaceImport(namedBindings)) {
            importBindings.push(namedBindings.name);
          } else {
            importBindings.push(...namedBindings.elements.map((element) => element.name));
          }
        }
        for (const binding of importBindings) {
          const symbol = resolvedSymbol(checker, binding);
          if (symbol !== undefined) moduleScopeSymbols.add(symbol);
        }
      }
      if (ts.isFunctionDeclaration(statement) && statement.name !== undefined) {
        const symbol = checker.getSymbolAtLocation(statement.name);
        if (symbol !== undefined) moduleScopeSymbols.add(symbol);
      }
      if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          if (!ts.isIdentifier(declaration.name)) continue;
          const symbol = checker.getSymbolAtLocation(declaration.name);
          if (symbol !== undefined) moduleScopeSymbols.add(symbol);
        }
      }
    }
  }

  const moduleReferenceCarrierSymbols = collectReferenceCarrierSymbols(
    checker,
    programSourceFiles,
    new Set([...moduleScopeSymbols].filter((symbol) =>
      symbolHasRetainableReference(checker, symbol))),
  );
  const transformNodeCarrierSymbols = collectReferenceCarrierSymbols(
    checker,
    programSourceFiles,
    new Set([...moduleScopeSymbols].filter((symbol) =>
      symbol.getName() === "TransformNode" && symbolComesFromBabylon(symbol))),
  );
  const lightCarrierSymbols = collectReferenceCarrierSymbols(
    checker,
    programSourceFiles,
    new Set([...moduleScopeSymbols].filter((symbol) =>
      SCENE_REGISTERED_LIGHT_CONSTRUCTOR_NAMES.has(symbol.getName()) &&
        symbolComesFromBabylon(symbol))),
  );

  for (const localSource of localSources) {
    const programSourceFile = program.getSourceFile(localSource.absolutePath)!;
    validateEntryExports(programSourceFile);
    validateModuleScope(programSourceFile);

    const visit = (node: ts.Node, buildFunction?: ts.FunctionLikeDeclaration): void => {
      if (node.kind === ts.SyntaxKind.AnyKeyword) {
        failAt(
          programSourceFile,
          node,
          "WORLDKIT_NATIVE_SCENE_SOURCE_CAPABILITY_FORBIDDEN",
          "source-admission",
          "Native source cannot erase capability types with explicit any.",
          "Keep exact Babylon and BuildContext types so Source Admission can verify authority boundaries.",
        );
      }

      if (ts.isTypeQueryNode(node)) {
        const type = checker.getTypeAtLocation(node);
        const typeQueryName = type.isStringLiteral() ? type.value : undefined;
        if (
          typeQueryName !== undefined &&
          FORBIDDEN_STRUCTURAL_CAPABILITY_MEMBER_NAMES.has(typeQueryName)
        ) {
          failAt(
            programSourceFile,
            node,
            "WORLDKIT_NATIVE_SCENE_SOURCE_CAPABILITY_FORBIDDEN",
            "source-admission",
            "Native source cannot erase a reserved capability through a static type query.",
            "Keep exact Math, Babylon, and BuildContext types so Source Admission can verify capability ownership.",
          );
        }
      }

      if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
        failAt(
          programSourceFile,
          node,
          "WORLDKIT_NATIVE_SCENE_SOURCE_LIFECYCLE_FORBIDDEN",
          "source-admission",
          "User-defined classes can retain lifecycle authority outside build().",
          "Use pure functions and local build variables instead of controllers or classes.",
        );
      }

      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        failAt(
          programSourceFile,
          node,
          "WORLDKIT_NATIVE_SCENE_DYNAMIC_IMPORT_FORBIDDEN",
          "source-admission",
          "Dynamic import is not part of the fixed Native source graph.",
          "Use a static ESM import so the Host can freeze the complete dependency graph.",
        );
      }

      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) &&
        node.expression.text === "require") {
        failAt(
          programSourceFile,
          node,
          "WORLDKIT_NATIVE_SCENE_SOURCE_CAPABILITY_FORBIDDEN",
          "source-admission",
          "CommonJS loading is outside the Native capability profile.",
          "Use only allowlisted static ESM imports.",
        );
      }

      if (ts.isIdentifier(node) && FORBIDDEN_GLOBAL_IDENTIFIERS.has(node.text)) {
        const symbol = checker.getSymbolAtLocation(node);
        const hasLocalDeclaration = symbol?.declarations?.some((declaration) =>
          canonicalPathByAbsolutePath.has(path.normalize(
            declaration.getSourceFile().fileName,
          ))) === true;
        if (!hasLocalDeclaration) {
          failAt(
            programSourceFile,
            node,
            "WORLDKIT_NATIVE_SCENE_SOURCE_CAPABILITY_FORBIDDEN",
            "source-admission",
            "Native source uses a nondeterministic or Host-owned global capability.",
            "Use only build context capabilities and deterministic local computation.",
          );
        }
      }

      if (
        (ts.isPropertyAccessExpression(node) ||
          ts.isElementAccessExpression(node)) &&
        (isForbiddenStandardRandomOrTimeProperty(
            checker,
            node.expression,
            propertyName(checker, node),
          ) ||
          isForbiddenStandardReflectionProperty(
            checker,
            node.expression,
            propertyName(checker, node),
          ))
      ) {
        failAt(
          programSourceFile,
          node,
          "WORLDKIT_NATIVE_SCENE_SOURCE_CAPABILITY_FORBIDDEN",
          "source-admission",
          "Native source uses an unfrozen random, time, or reflection capability.",
          "Use context.random, exact Babylon types, and Bootstrap-owned deterministic inputs.",
        );
      }

      if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
        const key = propertyName(checker, node);
        const owner = node.expression;
        const ownerIsBabylon = typeComesFromBabylon(checker, owner);
        const ownerIsObservable = isObservableExpression(checker, owner);
        if (
          (ownerIsBabylon && ts.isElementAccessExpression(node) &&
            key === undefined) ||
          (key !== undefined &&
          ((ownerIsBabylon &&
            (FORBIDDEN_BABYLON_METHODS.has(key) ||
              FORBIDDEN_BABYLON_PROPERTIES.has(key))) ||
            (ownerIsObservable &&
              (OBSERVABLE_MUTATION_METHODS.has(key) || key === "constructor")) ||
            (ownerIsObservable && key === "observers")))
        ) {
          failAt(
            programSourceFile,
            node,
            "WORLDKIT_NATIVE_SCENE_SOURCE_LIFECYCLE_FORBIDDEN",
            "source-admission",
            "Native source attempts to retain or mutate Babylon lifecycle authority.",
            "Create visual objects only; leave callbacks, Scene collections, Engine, and disposal to the Host.",
          );
        }
      }

      if (
        ts.isVariableDeclaration(node) &&
        ts.isObjectBindingPattern(node.name) &&
        node.initializer !== undefined &&
        typeComesFromBabylon(checker, node.initializer)
      ) {
        failAt(
          programSourceFile,
          node.name,
          "WORLDKIT_NATIVE_SCENE_SOURCE_LIFECYCLE_FORBIDDEN",
          "source-admission",
          "Native source cannot destructure authority-bearing Babylon objects.",
          "Access admitted visual properties directly and leave lifecycle members with the Host.",
        );
      }

      if (ts.isBinaryExpression(node) && isWriteOperator(node.operatorToken.kind) &&
        (ts.isPropertyAccessExpression(node.left) ||
          ts.isElementAccessExpression(node.left))) {
        const owner = node.left.expression;
        const syntacticRoot = rootIdentifier(owner);
        const syntacticRootSymbol = syntacticRoot === undefined
          ? undefined
          : resolvedSymbol(checker, syntacticRoot);
        const ownerRootOrigin = resolveStaticRootOrigin(checker, owner);
        const key = propertyName(checker, node.left);
        const root = rootIdentifier(ownerRootOrigin);
        const rootSymbol = root === undefined
          ? undefined
          : resolvedSymbol(checker, root);
        if (
          rootIsThis(ownerRootOrigin) ||
          (syntacticRootSymbol !== undefined &&
            moduleScopeSymbols.has(syntacticRootSymbol)) ||
          (rootSymbol !== undefined && moduleScopeSymbols.has(rootSymbol)) ||
          isCallable(checker, owner) ||
          expressionCarriesModuleReference(
            checker,
            owner,
            moduleReferenceCarrierSymbols,
          )
        ) {
          failAt(
            programSourceFile,
            node,
            "WORLDKIT_NATIVE_SCENE_SOURCE_MODULE_STATE_FORBIDDEN",
            "source-admission",
            "Native source mutates a module-scope binding during build().",
            "Keep retained state and Context-derived values inside build() local scope.",
          );
        }
        if (
          isObservableExpression(checker, node.left) ||
          (key !== undefined &&
            (key.endsWith("Observable") ||
              key === "notifyIfTriggered" ||
              FORBIDDEN_BABYLON_PROPERTIES.has(key))) ||
          (typeComesFromBabylon(checker, owner) && isCallable(checker, node.right))
        ) {
          failAt(
            programSourceFile,
            node,
            "WORLDKIT_NATIVE_SCENE_SOURCE_LIFECYCLE_FORBIDDEN",
            "source-admission",
            "Native source assigns Babylon callback or Observable authority.",
            "Keep Babylon-owned callbacks and scheduling unchanged.",
          );
        }
      }

      if (ts.isCallExpression(node) &&
        (ts.isPropertyAccessExpression(node.expression) ||
          ts.isElementAccessExpression(node.expression))) {
        const key = propertyName(checker, node.expression);
        const root = rootIdentifier(node.expression.expression);
        const rootSymbol = root === undefined
          ? undefined
          : resolvedSymbol(checker, root);
        if (
          key !== undefined &&
          MODULE_CONTAINER_MUTATION_METHODS.has(key) &&
          rootSymbol !== undefined &&
          moduleScopeSymbols.has(rootSymbol)
        ) {
          failAt(
            programSourceFile,
            node,
            "WORLDKIT_NATIVE_SCENE_SOURCE_MODULE_STATE_FORBIDDEN",
            "source-admission",
            "Native source mutates a module-scope container during build().",
            "Keep mutable containers local to build() and expose only frozen literal tables globally.",
          );
        }
      }

      if (ts.isCallExpression(node) &&
        (ts.isPropertyAccessExpression(node.expression) ||
          ts.isElementAccessExpression(node.expression)) &&
        typeComesFromBabylon(checker, node.expression.expression) &&
        node.arguments.some((argument) => isCallable(checker, argument))) {
        failAt(
          programSourceFile,
          node,
          "WORLDKIT_NATIVE_SCENE_SOURCE_LIFECYCLE_FORBIDDEN",
          "source-admission",
          "Native source passes a callback into a Babylon-owned API.",
          "Keep Module work synchronous and free of retained Babylon callbacks.",
        );
      }

      if (ts.isNewExpression(node)) {
        const constructorNames = new Set(babylonConstructorNames(
          checker,
          node.expression,
        ));
        const staticName = staticCallableName(checker, node.expression);
        if (staticName !== undefined) constructorNames.add(staticName);
        const sourceArguments = node.arguments ?? ts.factory.createNodeArray();
        const expandedArguments = expandStaticArgumentList(
          checker,
          sourceArguments,
        );
        const argumentsList = expandedArguments ?? sourceArguments;
        const hasUnresolvedSpread = expandedArguments === undefined;
        const transformNodeFlag = argumentsList[2];
        const lightFlag = argumentsList[3];
        const transformNodeSkipsRegistration =
          (constructorNames.has("TransformNode") ||
            expressionCarriesModuleReference(
              checker,
              node.expression,
              transformNodeCarrierSymbols,
            )) &&
          (hasUnresolvedSpread ||
            transformNodeFlag !== undefined &&
              !isBooleanLiteral(transformNodeFlag, true) &&
              !isExplicitUndefined(transformNodeFlag));
        const lightSkipsRegistration =
          ([...constructorNames].some((name) =>
            SCENE_REGISTERED_LIGHT_CONSTRUCTOR_NAMES.has(name)) ||
            expressionCarriesModuleReference(
              checker,
              node.expression,
              lightCarrierSymbols,
            )) &&
          (hasUnresolvedSpread ||
            lightFlag !== undefined &&
              !isBooleanLiteral(lightFlag, false) &&
              !isExplicitUndefined(lightFlag));
        if (transformNodeSkipsRegistration || lightSkipsRegistration) {
          failAt(
            programSourceFile,
            node,
            "WORLDKIT_NATIVE_SCENE_SOURCE_LIFECYCLE_FORBIDDEN",
            "source-admission",
            "A Babylon constructor flag can skip Candidate Scene registration.",
            "Omit the registration-control flag and let Babylon add the object to the Candidate Scene.",
          );
        }
      }

      let nextBuildFunction = buildFunction;
      if (
        (ts.isMethodDeclaration(node) || ts.isPropertyAssignment(node)) &&
        ((ts.isIdentifier(node.name) && node.name.text === "build") ||
          (ts.isStringLiteralLike(node.name) && node.name.text === "build"))
      ) {
        if (ts.isMethodDeclaration(node)) nextBuildFunction = node;
        if (ts.isPropertyAssignment(node) &&
          (ts.isArrowFunction(node.initializer) ||
            ts.isFunctionExpression(node.initializer))) {
          nextBuildFunction = node.initializer;
        }
      }
      if (ts.isReturnStatement(node) && node.expression !== undefined &&
        buildFunction !== undefined) {
        let parent: ts.Node | undefined = node.parent;
        while (parent !== undefined && !ts.isFunctionLike(parent)) parent = parent.parent;
        if (parent === buildFunction) {
          failAt(
            programSourceFile,
            node,
            "WORLDKIT_NATIVE_SCENE_BUILD_RETURN_INVALID",
            "build",
            "Native build() cannot return a Runtime value or provider handle.",
            "Register Spawn and Collider intent, then return without an expression.",
          );
        }
      }

      ts.forEachChild(node, (child) => visit(child, nextBuildFunction));
    };
    visit(programSourceFile);
  }
}

export async function admitBabylonNativeSourceGraphV1(
  requestedWorldDirectoryPath: string,
): Promise<AdmitBabylonNativeSourceGraphResultV1> {
  const workspaceResult = await readBabylonNativeAuthoringWorkspaceRootV1(
    requestedWorldDirectoryPath,
  );
  if (workspaceResult.outcome !== "passed") return workspaceResult;

  try {
    const localSources = await collectSourceGraph(workspaceResult.workspaceRoot);
    validateSourceSyntaxPolicy(localSources);
    const program = createSourceProgram(localSources);
    validateSourcePolicy(localSources, program);
    return Object.freeze({
      outcome: "passed",
      sourceGraph: Object.freeze({
        workspace: Object.freeze({
          ...workspaceResult.workspaceRoot,
          sourcePaths: Object.freeze(localSources.map((source) =>
            source.canonicalPath)),
        }),
        program,
      }),
    });
  } catch (error) {
    if (error instanceof SourceAdmissionFailureV1) {
      return rejected(error.diagnostic);
    }
    return Object.freeze({
      outcome: "tool-error",
      diagnostics: Object.freeze([createNativeWorkspaceDiagnosticV1({
        code: "WORLDKIT_NATIVE_SCENE_TOOL_INTERNAL_FAILED",
        stage: "tooling",
        message: "The Native source admission tool could not complete.",
        repairHint: "Inspect the trusted Host tooling and retry the same workspace.",
      })]),
    });
  }
}
