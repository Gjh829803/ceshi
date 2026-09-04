#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { deflateSync, inflateSync } from "node:zlib";

import ts from "typescript";
import {
  sha256CanonicalJson,
  stringifyCanonicalJson,
} from "@whitebox-world/protocol";

import {
  parseNativeBlockSubjectVisualReviewProxyV1,
  type NativeBlockSubjectVisualReviewProxyV1,
} from "../../../../scripts/reconstruction/native-block-subject-visual-review-proxy.js";

const WIDTH_TOP = 768;
const WIDTH_ENTRY = 960;
const HEIGHT_ENTRY = 540;
const COMPARISON_SEPARATOR = 8;
const MAXIMUM_CAPTURED_BLOCK_COUNT = 100_000;
const BUILD_TIMEOUT_MILLISECONDS = 10_000;
const DEFAULT_DISPLAY_GAP_METERS = 0.04;
const MAXIMUM_PLANNING_PNG_ENCODED_BYTES = 16 * 1024 * 1024;
const MAXIMUM_PLANNING_PNG_DIMENSION_PIXELS = 8_192;
const MAXIMUM_PLANNING_PNG_PIXEL_COUNT = 16_777_216;

const SHAPE_SIZE_BY_KIND = Object.freeze({
  full: Object.freeze([1, 1, 1]),
  half: Object.freeze([1, 0.5, 1]),
  quarter: Object.freeze([0.5, 0.5, 1]),
  small: Object.freeze([0.5, 0.5, 0.5]),
  step: Object.freeze([1, 0.25, 1]),
});

const COLOR_BY_PALETTE_ROLE = Object.freeze({
  ground: "#7F956E",
  route: "#C9A96B",
  structure: "#AEB8C4",
  hazard: "#C74F45",
  "water-like-visual": "#4E91B5",
  "background-mass": "#626B78",
});

const ALLOWED_IMPORTS = Object.freeze(new Map([
  ["@whitebox-world/native-babylon", Object.freeze(new Set([
    "defineBabylonNativeScene",
  ]))],
  ["@whitebox-world/native-babylon-block-profile", Object.freeze(new Set([
    "createBabylonNativeBlockProfileSessionV1",
  ]))],
]));

const FORBIDDEN_IDENTIFIERS = Object.freeze(new Set([
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
  "global",
  "globalThis",
  "localStorage",
  "navigator",
  "performance",
  "process",
  "Proxy",
  "queueMicrotask",
  "require",
  "setImmediate",
  "setInterval",
  "setTimeout",
  "WebAssembly",
  "WebSocket",
  "WeakRef",
  "window",
  "XMLHttpRequest",
  "Worker",
]));

const FORBIDDEN_PROPERTY_NAMES = Object.freeze(new Set([
  "__defineGetter__",
  "__defineSetter__",
  "__lookupGetter__",
  "__lookupSetter__",
  "__proto__",
  "constructor",
  "prototype",
]));

type Vec3 = readonly [number, number, number];
type Rgb = readonly [number, number, number];

interface CapturedBlock {
  readonly id: string;
  readonly shape: keyof typeof SHAPE_SIZE_BY_KIND;
  readonly paletteRole: keyof typeof COLOR_BY_PALETTE_ROLE;
  readonly visualGroupId?: string;
  readonly colliderGroupId?: string;
  readonly centerMetersXYZ: Vec3;
  readonly rotationQuarterTurnsY: 0 | 1 | 2 | 3;
}

interface CapturedLayoutIdentity {
  readonly kind: "native-block-builder-captured-layout-identity";
  readonly schemaVersion: 1;
  readonly blocks: readonly CapturedBlock[];
  readonly displayGapMeters: number;
  readonly spawn: Readonly<{
    readonly id: string;
    readonly positionMetersXYZ: Vec3;
    readonly facingRadians: number;
  }>;
}

interface Cuboid {
  readonly id: string;
  readonly minimum: Vec3;
  readonly maximum: Vec3;
  readonly color: Rgb;
}

interface Raster {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;
}

function fail(code: string, message: string): never {
  throw new TypeError(`${code}: ${message}`);
}

function hash(bytes: Uint8Array | string): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function stableCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function option(arguments_: readonly string[], name: string): string | undefined {
  const index = arguments_.indexOf(name);
  if (index < 0) return undefined;
  const value = arguments_[index + 1];
  if (value === undefined || value.startsWith("--")) {
    return fail("NATIVE_BLOCK_VISUAL_REVIEW_ARGUMENT_INVALID", `${name} requires a value`);
  }
  return value;
}

function assertPlainJson(value: unknown, path_: string, seen = new Set<object>()): void {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail("NATIVE_BLOCK_VISUAL_REVIEW_INPUT_INVALID", `${path_} must be finite`);
    return;
  }
  if (typeof value !== "object" || seen.has(value)) {
    return fail("NATIVE_BLOCK_VISUAL_REVIEW_INPUT_INVALID", `${path_} must be acyclic plain JSON`);
  }
  seen.add(value);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      assertPlainJson(value[index], `${path_}/${index}`, seen);
    }
    return;
  }
  if (Reflect.getPrototypeOf(value) !== Object.prototype) {
    return fail("NATIVE_BLOCK_VISUAL_REVIEW_INPUT_INVALID", `${path_} must be plain JSON`);
  }
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_PROPERTY_NAMES.has(key)) {
      return fail("NATIVE_BLOCK_VISUAL_REVIEW_INPUT_INVALID", `${path_}/${key} is forbidden`);
    }
    assertPlainJson(child, `${path_}/${key}`, seen);
  }
}

async function readJson(filePath: string): Promise<Record<string, unknown>> {
  const parsed: unknown = JSON.parse(await readFile(filePath, "utf8"));
  assertPlainJson(parsed, path.basename(filePath));
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return fail("NATIVE_BLOCK_VISUAL_REVIEW_INPUT_INVALID", `${filePath} must contain an object`);
  }
  return parsed as Record<string, unknown>;
}

function validateSourceForAdvisoryCapture(sourceText: string, sourcePath: string): void {
  const source = ts.createSourceFile(
    sourcePath,
    sourceText,
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.TS,
  );
  const parseDiagnostics = (source as ts.SourceFile & {
    readonly parseDiagnostics?: readonly ts.Diagnostic[];
  }).parseDiagnostics ?? [];
  if (parseDiagnostics.length > 0) {
    return fail(
      "NATIVE_BLOCK_VISUAL_REVIEW_SOURCE_REJECTED",
      ts.flattenDiagnosticMessageText(parseDiagnostics[0]!.messageText, " "),
    );
  }

  const seenImports = new Map<string, Set<string>>();
  let importDeclarationCount = 0;
  let defaultExportCount = 0;
  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement)) {
      importDeclarationCount += 1;
      if (!ts.isStringLiteral(statement.moduleSpecifier)) {
        return fail("NATIVE_BLOCK_VISUAL_REVIEW_SOURCE_REJECTED", "import specifiers must be static strings");
      }
      const specifier = statement.moduleSpecifier.text;
      const allowedNames = ALLOWED_IMPORTS.get(specifier);
      const bindings = statement.importClause?.namedBindings;
      if (
        allowedNames === undefined ||
        statement.importClause?.isTypeOnly ||
        statement.importClause?.name !== undefined ||
        bindings === undefined ||
        !ts.isNamedImports(bindings)
      ) {
        return fail(
          "NATIVE_BLOCK_VISUAL_REVIEW_SOURCE_REJECTED",
          `import '${specifier}' is outside the Native Block advisory allowlist`,
        );
      }
      const names = seenImports.get(specifier) ?? new Set<string>();
      for (const element of bindings.elements) {
        const importedName = element.propertyName?.text ?? element.name.text;
        if (!allowedNames.has(importedName) || element.name.text !== importedName) {
          return fail(
            "NATIVE_BLOCK_VISUAL_REVIEW_SOURCE_REJECTED",
            `import '${importedName}' is outside the Native Block advisory allowlist`,
          );
        }
        names.add(importedName);
      }
      seenImports.set(specifier, names);
    }
    if (ts.isExportAssignment(statement) && !statement.isExportEquals) defaultExportCount += 1;
  }
  if (importDeclarationCount !== ALLOWED_IMPORTS.size) {
    return fail(
      "NATIVE_BLOCK_VISUAL_REVIEW_SOURCE_REJECTED",
      "source must contain exactly the two current Native Block imports",
    );
  }
  for (const [specifier, allowedNames] of ALLOWED_IMPORTS) {
    const imported = seenImports.get(specifier);
    if (
      imported === undefined ||
      imported.size !== allowedNames.size ||
      [...allowedNames].some((name) => !imported.has(name))
    ) {
      return fail(
        "NATIVE_BLOCK_VISUAL_REVIEW_SOURCE_REJECTED",
        `source must import the exact advisory API from '${specifier}'`,
      );
    }
  }
  if (defaultExportCount !== 1) {
    return fail("NATIVE_BLOCK_VISUAL_REVIEW_SOURCE_REJECTED", "source must have one default Module export");
  }

  const visit = (node: ts.Node): void => {
    if (
      ts.isNewExpression(node) ||
      ts.isAwaitExpression(node) ||
      ts.isYieldExpression(node) ||
      ts.isTaggedTemplateExpression(node) ||
      ts.isWithStatement(node)
    ) {
      return fail(
        "NATIVE_BLOCK_VISUAL_REVIEW_SOURCE_REJECTED",
        `syntax '${ts.SyntaxKind[node.kind]}' is forbidden in advisory capture`,
      );
    }
    if (
      ts.canHaveModifiers(node) &&
      ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword)
    ) {
      return fail("NATIVE_BLOCK_VISUAL_REVIEW_SOURCE_REJECTED", "async source is forbidden in advisory capture");
    }
    if (ts.isIdentifier(node) && FORBIDDEN_IDENTIFIERS.has(node.text)) {
      return fail(
        "NATIVE_BLOCK_VISUAL_REVIEW_SOURCE_REJECTED",
        `identifier '${node.text}' is forbidden in advisory capture`,
      );
    }
    if (
      (ts.isPropertyAccessExpression(node) && FORBIDDEN_PROPERTY_NAMES.has(node.name.text)) ||
      (ts.isElementAccessExpression(node) &&
        ts.isStringLiteralLike(node.argumentExpression) &&
        FORBIDDEN_PROPERTY_NAMES.has(node.argumentExpression.text))
    ) {
      return fail(
        "NATIVE_BLOCK_VISUAL_REVIEW_SOURCE_REJECTED",
        "prototype and constructor access is forbidden in advisory capture",
      );
    }
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "context" &&
      new Set(["scene", "assets"]).has(node.name.text)
    ) {
      return fail(
        "NATIVE_BLOCK_VISUAL_REVIEW_SOURCE_REJECTED",
        `context.${node.name.text} is outside the source-only Block advisory boundary`,
      );
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      return fail("NATIVE_BLOCK_VISUAL_REVIEW_SOURCE_REJECTED", "dynamic import is forbidden");
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

function vec3(value: unknown, fieldName: string): Vec3 {
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    value.some((entry) => typeof entry !== "number" || !Number.isFinite(entry))
  ) {
    return fail("NATIVE_BLOCK_VISUAL_REVIEW_CAPTURE_INVALID", `${fieldName} must be a finite XYZ tuple`);
  }
  return Object.freeze([value[0], value[1], value[2]]) as Vec3;
}

function positiveSafeInteger(value: unknown, fieldName: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    return fail("NATIVE_BLOCK_VISUAL_REVIEW_CAPTURE_INVALID", `${fieldName} must be a positive safe integer`);
  }
  return value as number;
}

function text(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.length === 0) {
    return fail("NATIVE_BLOCK_VISUAL_REVIEW_CAPTURE_INVALID", `${fieldName} must be a non-empty string`);
  }
  return value;
}

function effectiveSize(
  shape: keyof typeof SHAPE_SIZE_BY_KIND,
  rotationQuarterTurnsY: number,
): Vec3 {
  const size = SHAPE_SIZE_BY_KIND[shape];
  return rotationQuarterTurnsY % 2 === 0
    ? size as Vec3
    : Object.freeze([size[2], size[1], size[0]]) as Vec3;
}

function createRandom(seedInput: unknown): Readonly<{
  nextRatio(): number;
  range(minimum: number, maximum: number): number;
  pick<Value>(values: readonly Value[]): Value;
}> {
  if (!Number.isSafeInteger(seedInput) || (seedInput as number) < 0 || (seedInput as number) > 0xffff_ffff) {
    return fail("NATIVE_BLOCK_VISUAL_REVIEW_INPUT_INVALID", "bootstrap.seed must be an unsigned 32-bit integer");
  }
  let state = seedInput as number;
  const nextRatio = (): number => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
  return Object.freeze({
    nextRatio,
    range(minimum, maximum) {
      if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || maximum <= minimum) {
        return fail("NATIVE_BLOCK_VISUAL_REVIEW_CAPTURE_INVALID", "random.range bounds are invalid");
      }
      return minimum + nextRatio() * (maximum - minimum);
    },
    pick<Value>(values: readonly Value[]): Value {
      if (!Array.isArray(values) || values.length === 0) {
        return fail("NATIVE_BLOCK_VISUAL_REVIEW_CAPTURE_INVALID", "random.pick requires values");
      }
      return values[Math.floor(nextRatio() * values.length)]!;
    },
  });
}

function captureSource(
  sourceText: string,
  sourcePath: string,
  bootstrap: Record<string, unknown>,
): Readonly<{
  blocks: readonly CapturedBlock[];
  displayGapMeters: number;
  spawn: Readonly<{ id: string; positionMetersXYZ: Vec3; facingRadians: number }>;
}> {
  validateSourceForAdvisoryCapture(sourceText, sourcePath);
  const transpiled = ts.transpileModule(sourceText, {
    fileName: sourcePath,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: false,
      isolatedModules: true,
    },
    reportDiagnostics: true,
  });
  const diagnostic = transpiled.diagnostics?.find((entry) =>
    entry.category === ts.DiagnosticCategory.Error);
  if (diagnostic !== undefined) {
    return fail(
      "NATIVE_BLOCK_VISUAL_REVIEW_SOURCE_REJECTED",
      ts.flattenDiagnosticMessageText(diagnostic.messageText, " "),
    );
  }

  const blocks: CapturedBlock[] = [];
  const blockIds = new Set<string>();
  let maximumBlockCount: number | undefined;
  let displayGapMeters = DEFAULT_DISPLAY_GAP_METERS;
  let finalized = false;
  let sessionCreated = false;
  let spawn: Readonly<{
    id: string;
    positionMetersXYZ: Vec3;
    facingRadians: number;
  }> | undefined;

  const addBlock = (input: unknown): Readonly<Record<string, never>> => {
    if (finalized || input === null || typeof input !== "object" || Array.isArray(input)) {
      return fail("NATIVE_BLOCK_VISUAL_REVIEW_CAPTURE_INVALID", "createBlock input is invalid");
    }
    const row = input as Record<string, unknown>;
    const id = text(row.id, "block.id");
    if (blockIds.has(id)) {
      return fail("NATIVE_BLOCK_VISUAL_REVIEW_CAPTURE_INVALID", `duplicate Block id '${id}'`);
    }
    const shape = text(row.shape, "block.shape") as keyof typeof SHAPE_SIZE_BY_KIND;
    const paletteRole = text(row.paletteRole, "block.paletteRole") as keyof typeof COLOR_BY_PALETTE_ROLE;
    if (!Object.hasOwn(SHAPE_SIZE_BY_KIND, shape) || !Object.hasOwn(COLOR_BY_PALETTE_ROLE, paletteRole)) {
      return fail("NATIVE_BLOCK_VISUAL_REVIEW_CAPTURE_INVALID", `Block '${id}' uses an unknown shape or palette role`);
    }
    const rotation = row.rotationQuarterTurnsY ?? 0;
    if (![0, 1, 2, 3].includes(rotation as number)) {
      return fail("NATIVE_BLOCK_VISUAL_REVIEW_CAPTURE_INVALID", `Block '${id}' rotation is invalid`);
    }
    if (
      maximumBlockCount === undefined ||
      blocks.length >= maximumBlockCount ||
      blocks.length >= MAXIMUM_CAPTURED_BLOCK_COUNT
    ) {
      return fail("NATIVE_BLOCK_VISUAL_REVIEW_CAPTURE_INVALID", "captured Block count exceeds its hard cap");
    }
    const visualGroupId = row.visualGroupId === undefined
      ? undefined
      : text(row.visualGroupId, "block.visualGroupId");
    const colliderGroupId = row.colliderGroupId === undefined
      ? undefined
      : text(row.colliderGroupId, "block.colliderGroupId");
    blockIds.add(id);
    blocks.push(Object.freeze({
      id,
      shape,
      paletteRole,
      ...(visualGroupId === undefined ? {} : { visualGroupId }),
      ...(colliderGroupId === undefined ? {} : { colliderGroupId }),
      centerMetersXYZ: vec3(row.centerMetersXYZ, "block.centerMetersXYZ"),
      rotationQuarterTurnsY: rotation as 0 | 1 | 2 | 3,
    }));
    return Object.freeze({});
  };

  const createSession = (_context: unknown, budgetInput: unknown) => {
    if (sessionCreated || budgetInput === null || typeof budgetInput !== "object") {
      return fail("NATIVE_BLOCK_VISUAL_REVIEW_CAPTURE_INVALID", "exactly one Block Profile session is required");
    }
    sessionCreated = true;
    maximumBlockCount = positiveSafeInteger(
      (budgetInput as Record<string, unknown>).maximumBlockCount,
      "maximumBlockCount",
    );
    if (maximumBlockCount > MAXIMUM_CAPTURED_BLOCK_COUNT) {
      return fail("NATIVE_BLOCK_VISUAL_REVIEW_CAPTURE_INVALID", "maximumBlockCount exceeds advisory capture limit");
    }
    return Object.freeze({
      createBlock: addBlock,
      createBlockGrid(input: unknown) {
        if (input === null || typeof input !== "object" || Array.isArray(input)) {
          return fail("NATIVE_BLOCK_VISUAL_REVIEW_CAPTURE_INVALID", "createBlockGrid input is invalid");
        }
        const row = input as Record<string, unknown>;
        const idPrefix = text(row.idPrefix, "grid.idPrefix");
        const shape = text(row.shape, "grid.shape") as keyof typeof SHAPE_SIZE_BY_KIND;
        if (!Object.hasOwn(SHAPE_SIZE_BY_KIND, shape)) {
          return fail("NATIVE_BLOCK_VISUAL_REVIEW_CAPTURE_INVALID", `Grid '${idPrefix}' shape is invalid`);
        }
        const rotation = row.rotationQuarterTurnsY ?? 0;
        if (![0, 1, 2, 3].includes(rotation as number)) {
          return fail("NATIVE_BLOCK_VISUAL_REVIEW_CAPTURE_INVALID", `Grid '${idPrefix}' rotation is invalid`);
        }
        const minimum = vec3(row.minimumCenterMetersXYZ, "grid.minimumCenterMetersXYZ");
        const counts = vec3(row.repeatCountXYZ, "grid.repeatCountXYZ");
        const countX = positiveSafeInteger(counts[0], "grid.repeatCountXYZ[0]");
        const countY = positiveSafeInteger(counts[1], "grid.repeatCountXYZ[1]");
        const countZ = positiveSafeInteger(counts[2], "grid.repeatCountXYZ[2]");
        const spacing = effectiveSize(shape, rotation as number);
        const created: Readonly<Record<string, never>>[] = [];
        for (let y = 0; y < countY; y += 1) {
          for (let z = 0; z < countZ; z += 1) {
            for (let x = 0; x < countX; x += 1) {
              created.push(addBlock({
                id: `${idPrefix}-x${x}-y${y}-z${z}`,
                shape,
                paletteRole: row.paletteRole,
                centerMetersXYZ: [
                  minimum[0] + x * spacing[0],
                  minimum[1] + y * spacing[1],
                  minimum[2] + z * spacing[2],
                ],
                rotationQuarterTurnsY: rotation,
                ...(row.visualGroupId === undefined ? {} : { visualGroupId: row.visualGroupId }),
                ...(row.colliderGroupId === undefined ? {} : { colliderGroupId: row.colliderGroupId }),
              }));
            }
          }
        }
        return Object.freeze(created);
      },
      finalize(input: unknown) {
        if (finalized || input === null || typeof input !== "object" || Array.isArray(input)) {
          return fail("NATIVE_BLOCK_VISUAL_REVIEW_CAPTURE_INVALID", "session.finalize input is invalid");
        }
        finalized = true;
        const gap = (input as Record<string, unknown>).displayGapMeters ??
          DEFAULT_DISPLAY_GAP_METERS;
        if (typeof gap !== "number" || !Number.isFinite(gap) || gap < 0 || gap >= 0.25) {
          return fail("NATIVE_BLOCK_VISUAL_REVIEW_CAPTURE_INVALID", "displayGapMeters is invalid");
        }
        displayGapMeters = gap;
        return Object.freeze({});
      },
      dispose() {
        return fail("NATIVE_BLOCK_VISUAL_REVIEW_CAPTURE_INVALID", "Builder may not dispose the advisory session");
      },
    });
  };

  const nativeBabylon = Object.freeze({
    defineBabylonNativeScene(input: unknown) {
      if (input === null || typeof input !== "object" || Array.isArray(input)) {
        return fail("NATIVE_BLOCK_VISUAL_REVIEW_CAPTURE_INVALID", "Module definition is invalid");
      }
      return Object.freeze(input);
    },
  });
  const blockProfile = Object.freeze({
    createBabylonNativeBlockProfileSessionV1: createSession,
  });
  const sandbox = Object.create(null) as Record<string, unknown>;
  sandbox.module = { exports: {} };
  sandbox.exports = (sandbox.module as { exports: unknown }).exports;
  sandbox.require = (specifier: string): unknown => {
    if (specifier === "@whitebox-world/native-babylon") return nativeBabylon;
    if (specifier === "@whitebox-world/native-babylon-block-profile") return blockProfile;
    return fail("NATIVE_BLOCK_VISUAL_REVIEW_SOURCE_REJECTED", `runtime import '${specifier}' is forbidden`);
  };
  // `vm` supplies deterministic globals and a synchronous timeout, not a
  // security boundary. The Builder runs in its isolated task workspace; any
  // trusted Host replay must happen only after Native Check admits the source.
  const context = vm.createContext(sandbox, {
    codeGeneration: { strings: false, wasm: false },
    name: "worldkit-native-block-advisory-capture",
  });
  const script = new vm.Script(`"use strict";\n${transpiled.outputText}`, {
    filename: sourcePath,
  });
  script.runInContext(context, { timeout: BUILD_TIMEOUT_MILLISECONDS });
  const exported = (sandbox.module as { exports: { default?: unknown } }).exports.default;
  if (
    exported === null ||
    typeof exported !== "object" ||
    typeof (exported as { build?: unknown }).build !== "function"
  ) {
    return fail("NATIVE_BLOCK_VISUAL_REVIEW_CAPTURE_INVALID", "default export is not a Native Module");
  }
  const assets = Object.freeze({
    load() {
      return fail("NATIVE_BLOCK_VISUAL_REVIEW_CAPTURE_INVALID", "assets are outside the Block advisory boundary");
    },
  });
  sandbox.__worldkitBuildContext = Object.freeze({
    scene: undefined,
    bootstrap: Object.freeze(bootstrap),
    random: createRandom(bootstrap.seed),
    assets,
    registration: Object.freeze({
      registerSpawnMarker(markerInput: unknown) {
        if (spawn !== undefined || markerInput === null || typeof markerInput !== "object") {
          return fail("NATIVE_BLOCK_VISUAL_REVIEW_CAPTURE_INVALID", "exactly one Spawn Marker is required");
        }
        const marker = markerInput as Record<string, unknown>;
        if (marker.id !== bootstrap.spawnMarkerId) {
          return fail("NATIVE_BLOCK_VISUAL_REVIEW_CAPTURE_INVALID", "Spawn Marker id differs from Bootstrap");
        }
        if (typeof marker.facingRadians !== "number" || !Number.isFinite(marker.facingRadians)) {
          return fail("NATIVE_BLOCK_VISUAL_REVIEW_CAPTURE_INVALID", "Spawn facingRadians is invalid");
        }
        spawn = Object.freeze({
          id: marker.id as string,
          positionMetersXYZ: vec3(marker.positionMetersXYZ, "spawn.positionMetersXYZ"),
          facingRadians: marker.facingRadians,
        });
      },
      registerStaticCollider() {
        return fail(
          "NATIVE_BLOCK_VISUAL_REVIEW_CAPTURE_INVALID",
          "direct Collider registration is outside the Block advisory boundary",
        );
      },
    }),
  });
  const buildScript = new vm.Script(
    "module.exports.default.build(__worldkitBuildContext)",
    { filename: `${sourcePath}#build` },
  );
  const buildResult = buildScript.runInContext(context, {
    timeout: BUILD_TIMEOUT_MILLISECONDS,
  });
  if (buildResult !== undefined) {
    return fail("NATIVE_BLOCK_VISUAL_REVIEW_CAPTURE_INVALID", "Native build must complete synchronously without a return value");
  }
  if (!sessionCreated || !finalized || blocks.length === 0 || spawn === undefined) {
    return fail(
      "NATIVE_BLOCK_VISUAL_REVIEW_CAPTURE_INVALID",
      "source must create and finalize one non-empty Block session and register one Spawn Marker",
    );
  }
  return Object.freeze({
    blocks: Object.freeze([...blocks].sort((left, right) => stableCompare(left.id, right.id))),
    displayGapMeters,
    spawn,
  });
}

function validateAuthoringGroups(
  authoring: Record<string, unknown>,
  blocks: readonly CapturedBlock[],
): ReadonlyMap<string, Rgb> {
  if (
    authoring.kind !== "native-block-authoring" ||
    authoring.schemaVersion !== 1 ||
    authoring.entryModulePath !== "scene.ts" ||
    !Array.isArray(authoring.visualGroups)
  ) {
    return fail("NATIVE_BLOCK_VISUAL_REVIEW_INPUT_INVALID", "native-block-authoring.json shape is invalid");
  }
  const colorsByVisualGroupId = new Map<string, Rgb>();
  for (const input of authoring.visualGroups) {
    if (input === null || typeof input !== "object" || Array.isArray(input)) {
      return fail("NATIVE_BLOCK_VISUAL_REVIEW_INPUT_INVALID", "visualGroups contains an invalid row");
    }
    const row = input as Record<string, unknown>;
    const id = text(row.visualGroupId, "visualGroupId");
    if (colorsByVisualGroupId.has(id)) {
      return fail("NATIVE_BLOCK_VISUAL_REVIEW_INPUT_INVALID", `duplicate visualGroupId '${id}'`);
    }
    const identityColorHex = text(row.identityColorHex, "identityColorHex");
    if (!/^#[0-9A-F]{6}$/.test(identityColorHex)) {
      return fail(
        "NATIVE_BLOCK_VISUAL_REVIEW_INPUT_INVALID",
        `visualGroupId '${id}' has an invalid identityColorHex`,
      );
    }
    colorsByVisualGroupId.set(id, rgb(identityColorHex));
  }
  for (const block of blocks) {
    if (
      block.visualGroupId !== undefined &&
      !colorsByVisualGroupId.has(block.visualGroupId)
    ) {
      return fail(
        "NATIVE_BLOCK_VISUAL_REVIEW_CAPTURE_INVALID",
        `Block '${block.id}' references undeclared visualGroupId '${block.visualGroupId}'`,
      );
    }
  }
  for (const visualGroupId of colorsByVisualGroupId.keys()) {
    if (!blocks.some((block) => block.visualGroupId === visualGroupId)) {
      return fail(
        "NATIVE_BLOCK_VISUAL_REVIEW_CAPTURE_INVALID",
        `declared visualGroupId '${visualGroupId}' has no captured Blocks`,
      );
    }
  }
  return colorsByVisualGroupId;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffff_ffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb8_8320 : 0);
    }
  }
  return (crc ^ 0xffff_ffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Buffer {
  const typeBytes = Buffer.from(type, "ascii");
  const output = Buffer.alloc(12 + data.length);
  output.writeUInt32BE(data.length, 0);
  typeBytes.copy(output, 4);
  Buffer.from(data).copy(output, 8);
  output.writeUInt32BE(crc32(Buffer.concat([typeBytes, Buffer.from(data)])), 8 + data.length);
  return output;
}

function encodePng(raster: Raster): Buffer {
  const scanlines = Buffer.alloc((raster.width * 4 + 1) * raster.height);
  for (let y = 0; y < raster.height; y += 1) {
    const rowOffset = y * (raster.width * 4 + 1);
    scanlines[rowOffset] = 0;
    Buffer.from(raster.pixels).copy(
      scanlines,
      rowOffset + 1,
      y * raster.width * 4,
      (y + 1) * raster.width * 4,
    );
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(raster.width, 0);
  header.writeUInt32BE(raster.height, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(scanlines, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function paeth(left: number, above: number, upperLeft: number): number {
  const prediction = left + above - upperLeft;
  const leftDistance = Math.abs(prediction - left);
  const aboveDistance = Math.abs(prediction - above);
  const diagonalDistance = Math.abs(prediction - upperLeft);
  return leftDistance <= aboveDistance && leftDistance <= diagonalDistance
    ? left
    : aboveDistance <= diagonalDistance ? above : upperLeft;
}

function decodePng(bytes: Uint8Array): Raster {
  if (bytes.byteLength > MAXIMUM_PLANNING_PNG_ENCODED_BYTES) {
    return fail(
      "NATIVE_BLOCK_VISUAL_REVIEW_PNG_INVALID",
      "planning PNG exceeds the encoded byte cap",
    );
  }
  const buffer = Buffer.from(bytes);
  if (!buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return fail("NATIVE_BLOCK_VISUAL_REVIEW_PNG_INVALID", "input is not a PNG");
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const compressed: Buffer[] = [];
  let palette: Buffer | undefined;
  let transparency: Buffer | undefined;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (data.length !== length) return fail("NATIVE_BLOCK_VISUAL_REVIEW_PNG_INVALID", "truncated PNG chunk");
    if (type === "IHDR") {
      if (data.length !== 13 || width !== 0 || height !== 0) {
        return fail("NATIVE_BLOCK_VISUAL_REVIEW_PNG_INVALID", "PNG must contain one valid IHDR");
      }
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8]!;
      colorType = data[9]!;
      interlace = data[12]!;
    } else if (type === "IDAT") compressed.push(Buffer.from(data));
    else if (type === "PLTE") palette = Buffer.from(data);
    else if (type === "tRNS") transparency = Buffer.from(data);
    offset += length + 12;
    if (type === "IEND") break;
  }
  const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[colorType];
  if (
    width <= 0 ||
    height <= 0 ||
    width > MAXIMUM_PLANNING_PNG_DIMENSION_PIXELS ||
    height > MAXIMUM_PLANNING_PNG_DIMENSION_PIXELS ||
    width * height > MAXIMUM_PLANNING_PNG_PIXEL_COUNT ||
    bitDepth !== 8 ||
    channels === undefined ||
    interlace !== 0 ||
    compressed.length === 0 ||
    (colorType === 3 && palette === undefined)
  ) {
    return fail(
      "NATIVE_BLOCK_VISUAL_REVIEW_PNG_INVALID",
      "PNG must be non-interlaced 8-bit grayscale, RGB, palette, grayscale-alpha, or RGBA",
    );
  }
  const rowBytes = width * channels;
  const expectedRawLength = (rowBytes + 1) * height;
  let raw: Buffer;
  try {
    raw = inflateSync(Buffer.concat(compressed), {
      maxOutputLength: expectedRawLength,
    });
  } catch {
    return fail(
      "NATIVE_BLOCK_VISUAL_REVIEW_PNG_INVALID",
      "PNG compressed payload exceeds its admitted scanline budget",
    );
  }
  if (raw.length !== expectedRawLength) {
    return fail("NATIVE_BLOCK_VISUAL_REVIEW_PNG_INVALID", "PNG scanline length is invalid");
  }
  const decoded = Buffer.alloc(rowBytes * height);
  for (let y = 0; y < height; y += 1) {
    const sourceOffset = y * (rowBytes + 1);
    const targetOffset = y * rowBytes;
    const filter = raw[sourceOffset]!;
    if (filter > 4) return fail("NATIVE_BLOCK_VISUAL_REVIEW_PNG_INVALID", "PNG filter is invalid");
    for (let x = 0; x < rowBytes; x += 1) {
      const value = raw[sourceOffset + 1 + x]!;
      const left = x >= channels ? decoded[targetOffset + x - channels]! : 0;
      const above = y > 0 ? decoded[targetOffset + x - rowBytes]! : 0;
      const upperLeft = y > 0 && x >= channels
        ? decoded[targetOffset + x - rowBytes - channels]!
        : 0;
      decoded[targetOffset + x] = (
        filter === 0 ? value :
        filter === 1 ? value + left :
        filter === 2 ? value + above :
        filter === 3 ? value + Math.floor((left + above) / 2) :
        value + paeth(left, above, upperLeft)
      ) & 0xff;
    }
  }
  const pixels = new Uint8Array(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    const sourceOffset = index * channels;
    const targetOffset = index * 4;
    if (colorType === 0 || colorType === 4) {
      pixels[targetOffset] = decoded[sourceOffset]!;
      pixels[targetOffset + 1] = decoded[sourceOffset]!;
      pixels[targetOffset + 2] = decoded[sourceOffset]!;
      pixels[targetOffset + 3] = colorType === 4 ? decoded[sourceOffset + 1]! : 255;
    } else if (colorType === 2 || colorType === 6) {
      pixels[targetOffset] = decoded[sourceOffset]!;
      pixels[targetOffset + 1] = decoded[sourceOffset + 1]!;
      pixels[targetOffset + 2] = decoded[sourceOffset + 2]!;
      pixels[targetOffset + 3] = colorType === 6 ? decoded[sourceOffset + 3]! : 255;
    } else {
      const paletteIndex = decoded[sourceOffset]!;
      const paletteOffset = paletteIndex * 3;
      if (paletteOffset + 2 >= palette!.length) {
        return fail("NATIVE_BLOCK_VISUAL_REVIEW_PNG_INVALID", "PNG palette index is invalid");
      }
      pixels[targetOffset] = palette![paletteOffset]!;
      pixels[targetOffset + 1] = palette![paletteOffset + 1]!;
      pixels[targetOffset + 2] = palette![paletteOffset + 2]!;
      pixels[targetOffset + 3] = transparency?.[paletteIndex] ?? 255;
    }
  }
  return Object.freeze({ width, height, pixels });
}

function createRaster(width: number, height: number, color: Rgb): Raster {
  const pixels = new Uint8Array(width * height * 4);
  for (let offset = 0; offset < pixels.length; offset += 4) {
    pixels[offset] = color[0];
    pixels[offset + 1] = color[1];
    pixels[offset + 2] = color[2];
    pixels[offset + 3] = 255;
  }
  return { width, height, pixels };
}

function setPixel(raster: Raster, x: number, y: number, color: Rgb): void {
  const roundedX = Math.floor(x);
  const roundedY = Math.floor(y);
  if (roundedX < 0 || roundedY < 0 || roundedX >= raster.width || roundedY >= raster.height) return;
  const offset = (roundedY * raster.width + roundedX) * 4;
  raster.pixels[offset] = color[0];
  raster.pixels[offset + 1] = color[1];
  raster.pixels[offset + 2] = color[2];
  raster.pixels[offset + 3] = 255;
}

function fillRect(
  raster: Raster,
  minimumX: number,
  minimumY: number,
  maximumX: number,
  maximumY: number,
  color: Rgb,
): void {
  const left = Math.max(0, Math.floor(minimumX));
  const top = Math.max(0, Math.floor(minimumY));
  const right = Math.min(raster.width, Math.ceil(maximumX));
  const bottom = Math.min(raster.height, Math.ceil(maximumY));
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) setPixel(raster, x, y, color);
  }
}

function drawLine(raster: Raster, from: readonly [number, number], to: readonly [number, number], color: Rgb): void {
  let x = Math.round(from[0]);
  let y = Math.round(from[1]);
  const targetX = Math.round(to[0]);
  const targetY = Math.round(to[1]);
  const deltaX = Math.abs(targetX - x);
  const stepX = x < targetX ? 1 : -1;
  const deltaY = -Math.abs(targetY - y);
  const stepY = y < targetY ? 1 : -1;
  let error = deltaX + deltaY;
  while (true) {
    setPixel(raster, x, y, color);
    if (x === targetX && y === targetY) break;
    const doubled = error * 2;
    if (doubled >= deltaY) { error += deltaY; x += stepX; }
    if (doubled <= deltaX) { error += deltaX; y += stepY; }
  }
}

function fillPolygon(raster: Raster, points: readonly (readonly [number, number])[], color: Rgb): void {
  if (points.length < 3) return;
  const minimumY = Math.max(0, Math.floor(Math.min(...points.map((point) => point[1]))));
  const maximumY = Math.min(raster.height - 1, Math.ceil(Math.max(...points.map((point) => point[1]))));
  for (let y = minimumY; y <= maximumY; y += 1) {
    const scanY = y + 0.5;
    const intersections: number[] = [];
    for (let index = 0; index < points.length; index += 1) {
      const first = points[index]!;
      const second = points[(index + 1) % points.length]!;
      if ((first[1] <= scanY && second[1] > scanY) || (second[1] <= scanY && first[1] > scanY)) {
        intersections.push(first[0] + (scanY - first[1]) * (second[0] - first[0]) / (second[1] - first[1]));
      }
    }
    intersections.sort((left, right) => left - right);
    for (let index = 0; index + 1 < intersections.length; index += 2) {
      fillRect(raster, intersections[index]!, y, intersections[index + 1]!, y + 1, color);
    }
  }
}

function drawCircle(raster: Raster, centerX: number, centerY: number, radius: number, color: Rgb): void {
  for (let y = Math.floor(centerY - radius); y <= Math.ceil(centerY + radius); y += 1) {
    for (let x = Math.floor(centerX - radius); x <= Math.ceil(centerX + radius); x += 1) {
      if ((x - centerX) ** 2 + (y - centerY) ** 2 <= radius ** 2) setPixel(raster, x, y, color);
    }
  }
}

function rgb(hex: string): Rgb {
  return Object.freeze([
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ]);
}

function shade(color: Rgb, ratio: number): Rgb {
  return Object.freeze(color.map((channel) =>
    Math.max(0, Math.min(255, Math.round(channel * ratio)))) as [number, number, number]);
}

function cuboids(
  blocks: readonly CapturedBlock[],
  displayGapMeters: number,
  colorsByVisualGroupId: ReadonlyMap<string, Rgb>,
): readonly Cuboid[] {
  return blocks.map((block) => {
    const size = effectiveSize(block.shape, block.rotationQuarterTurnsY).map((value) =>
      Math.max(0.01, value - displayGapMeters)) as [number, number, number];
    const half = size.map((value) => value / 2);
    return Object.freeze({
      id: block.id,
      minimum: Object.freeze(block.centerMetersXYZ.map((value, axis) =>
        value - half[axis]!) as [number, number, number]),
      maximum: Object.freeze(block.centerMetersXYZ.map((value, axis) =>
        value + half[axis]!) as [number, number, number]),
      color: block.visualGroupId === undefined
        ? rgb(COLOR_BY_PALETTE_ROLE[block.paletteRole])
        : colorsByVisualGroupId.get(block.visualGroupId)!,
    });
  });
}

function drawTopDown(cuboidRows: readonly Cuboid[], spawn: Vec3): Raster {
  const raster = createRaster(WIDTH_TOP, WIDTH_TOP, [225, 238, 245]);
  const minimumX = Math.min(...cuboidRows.map((row) => row.minimum[0]), spawn[0] - 1);
  const maximumX = Math.max(...cuboidRows.map((row) => row.maximum[0]), spawn[0] + 1);
  const minimumZ = Math.min(...cuboidRows.map((row) => row.minimum[2]), spawn[2] - 1);
  const maximumZ = Math.max(...cuboidRows.map((row) => row.maximum[2]), spawn[2] + 1);
  const padding = 40;
  const scale = Math.min(
    (raster.width - padding * 2) / Math.max(1, maximumX - minimumX),
    (raster.height - padding * 2) / Math.max(1, maximumZ - minimumZ),
  );
  const offsetX = (raster.width - (maximumX - minimumX) * scale) / 2;
  const offsetY = (raster.height - (maximumZ - minimumZ) * scale) / 2;
  const project = (x: number, z: number): readonly [number, number] => [
    offsetX + (x - minimumX) * scale,
    offsetY + (z - minimumZ) * scale,
  ];
  for (const cuboid of [...cuboidRows].sort((left, right) =>
    left.maximum[1] - right.maximum[1] || stableCompare(left.id, right.id))) {
    const [left, top] = project(cuboid.minimum[0], cuboid.minimum[2]);
    const [right, bottom] = project(cuboid.maximum[0], cuboid.maximum[2]);
    fillRect(raster, left, top, right, bottom, cuboid.color);
    const edge = shade(cuboid.color, 0.7);
    drawLine(raster, [left, top], [right, top], edge);
    drawLine(raster, [right, top], [right, bottom], edge);
    drawLine(raster, [right, bottom], [left, bottom], edge);
    drawLine(raster, [left, bottom], [left, top], edge);
  }
  const [spawnX, spawnY] = project(spawn[0], spawn[2]);
  drawCircle(raster, spawnX, spawnY, 7, [232, 93, 93]);
  return raster;
}

function add(left: Vec3, right: Vec3): Vec3 {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}

function subtract(left: Vec3, right: Vec3): Vec3 {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function multiply(vector: Vec3, scalar: number): Vec3 {
  return [vector[0] * scalar, vector[1] * scalar, vector[2] * scalar];
}

function dot(left: Vec3, right: Vec3): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function cross(left: Vec3, right: Vec3): Vec3 {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function normalize(vector: Vec3): Vec3 {
  const length = Math.hypot(...vector);
  if (length <= Number.EPSILON) return fail("NATIVE_BLOCK_VISUAL_REVIEW_RENDER_INVALID", "zero camera vector");
  return multiply(vector, 1 / length);
}

function subjectProxyCuboids(
  proxy: NativeBlockSubjectVisualReviewProxyV1,
  spawn: Readonly<{ positionMetersXYZ: Vec3; facingRadians: number }>,
): readonly Cuboid[] {
  const cosine = Math.cos(spawn.facingRadians);
  const sine = Math.sin(spawn.facingRadians);
  return proxy.cuboids.map((cuboid) => {
    const localCenter: Vec3 = [
      (cuboid.minimumMetersXYZ[0] + cuboid.maximumMetersXYZ[0]) / 2,
      (cuboid.minimumMetersXYZ[1] + cuboid.maximumMetersXYZ[1]) / 2,
      (cuboid.minimumMetersXYZ[2] + cuboid.maximumMetersXYZ[2]) / 2,
    ];
    const localHalfSize: Vec3 = [
      (cuboid.maximumMetersXYZ[0] - cuboid.minimumMetersXYZ[0]) / 2,
      (cuboid.maximumMetersXYZ[1] - cuboid.minimumMetersXYZ[1]) / 2,
      (cuboid.maximumMetersXYZ[2] - cuboid.minimumMetersXYZ[2]) / 2,
    ];
    const rotatedCenter: Vec3 = [
      localCenter[0] * cosine + localCenter[2] * sine,
      localCenter[1],
      -localCenter[0] * sine + localCenter[2] * cosine,
    ];
    const center = add(spawn.positionMetersXYZ, rotatedCenter);
    const halfSize: Vec3 = [
      Math.abs(cosine) * localHalfSize[0] + Math.abs(sine) * localHalfSize[2],
      localHalfSize[1],
      Math.abs(sine) * localHalfSize[0] + Math.abs(cosine) * localHalfSize[2],
    ];
    return Object.freeze({
      id: `host-subject-${cuboid.id}`,
      minimum: Object.freeze(center.map((value, axis) =>
        value - halfSize[axis]!) as [number, number, number]),
      maximum: Object.freeze(center.map((value, axis) =>
        value + halfSize[axis]!) as [number, number, number]),
      color: Object.freeze([232, 93, 93]) as Rgb,
    });
  });
}

function drawEntry(
  worldCuboids: readonly Cuboid[],
  subjectCuboids: readonly Cuboid[],
  spawn: Readonly<{ positionMetersXYZ: Vec3; facingRadians: number }>,
  cameraInput: unknown,
): Raster {
  if (cameraInput === null || typeof cameraInput !== "object") {
    return fail("NATIVE_BLOCK_VISUAL_REVIEW_INPUT_INVALID", "Bootstrap initialCamera is missing");
  }
  const camera = cameraInput as Record<string, unknown>;
  if (camera.mode !== "third-person") {
    return fail("NATIVE_BLOCK_VISUAL_REVIEW_INPUT_INVALID", "initialCamera.mode must be third-person");
  }
  for (const field of ["distanceMeters", "fovDegrees", "pitchRadians", "targetHeightMeters"] as const) {
    if (typeof camera[field] !== "number" || !Number.isFinite(camera[field])) {
      return fail("NATIVE_BLOCK_VISUAL_REVIEW_INPUT_INVALID", `initialCamera.${field} is invalid`);
    }
  }
  if (
    (camera.distanceMeters as number) <= 0 ||
    (camera.fovDegrees as number) <= 0 ||
    (camera.fovDegrees as number) >= 180
  ) {
    return fail("NATIVE_BLOCK_VISUAL_REVIEW_INPUT_INVALID", "initialCamera range is invalid");
  }
  const raster = createRaster(WIDTH_ENTRY, HEIGHT_ENTRY, [159, 207, 238]);
  const forward: Vec3 = [
    -Math.sin(spawn.facingRadians),
    0,
    -Math.cos(spawn.facingRadians),
  ];
  const target: Vec3 = [
    spawn.positionMetersXYZ[0],
    spawn.positionMetersXYZ[1] + (camera.targetHeightMeters as number),
    spawn.positionMetersXYZ[2],
  ];
  const horizontalDistance = (camera.distanceMeters as number) * Math.cos(camera.pitchRadians as number);
  const cameraPosition = add(
    add(target, multiply(forward, -horizontalDistance)),
    [0, (camera.distanceMeters as number) * Math.sin(camera.pitchRadians as number), 0],
  );
  const cameraForward = normalize(subtract(target, cameraPosition));
  const right = normalize(cross(cameraForward, [0, 1, 0]));
  const up = normalize(cross(right, cameraForward));
  const tangent = Math.tan((camera.fovDegrees as number) * Math.PI / 360);
  const project = (point: Vec3): Readonly<{ point: readonly [number, number]; depth: number }> | undefined => {
    const relative = subtract(point, cameraPosition);
    const depth = dot(relative, cameraForward);
    if (depth <= 0.05) return undefined;
    const normalizedX = dot(relative, right) / (depth * tangent * (WIDTH_ENTRY / HEIGHT_ENTRY));
    const normalizedY = dot(relative, up) / (depth * tangent);
    return Object.freeze({
      point: [
        (normalizedX * 0.5 + 0.5) * raster.width,
        (0.5 - normalizedY * 0.5) * raster.height,
      ] as const,
      depth,
    });
  };
  const faceDefinitions = Object.freeze([
    { indexes: [0, 1, 2, 3], normal: [0, 0, -1], shade: 0.92 },
    { indexes: [5, 4, 7, 6], normal: [0, 0, 1], shade: 0.98 },
    { indexes: [4, 0, 3, 7], normal: [-1, 0, 0], shade: 0.8 },
    { indexes: [1, 5, 6, 2], normal: [1, 0, 0], shade: 0.86 },
    { indexes: [4, 5, 1, 0], normal: [0, -1, 0], shade: 0.72 },
    { indexes: [3, 2, 6, 7], normal: [0, 1, 0], shade: 1.08 },
  ] as const);
  const faces: {
    readonly id: string;
    readonly points: readonly (readonly [number, number])[];
    readonly depth: number;
    readonly color: Rgb;
  }[] = [];
  for (const cuboid of [...worldCuboids, ...subjectCuboids]) {
    const min = cuboid.minimum;
    const max = cuboid.maximum;
    const corners: readonly Vec3[] = [
      [min[0], min[1], min[2]], [max[0], min[1], min[2]],
      [max[0], max[1], min[2]], [min[0], max[1], min[2]],
      [min[0], min[1], max[2]], [max[0], min[1], max[2]],
      [max[0], max[1], max[2]], [min[0], max[1], max[2]],
    ];
    for (const definition of faceDefinitions) {
      const worldPoints = definition.indexes.map((index) => corners[index]!);
      const center = multiply(worldPoints.reduce((sum, point) => add(sum, point), [0, 0, 0]), 0.25);
      if (dot(definition.normal, subtract(cameraPosition, center)) <= 0) continue;
      const projected = worldPoints.map(project);
      if (projected.some((row) => row === undefined)) continue;
      const complete = projected as readonly Readonly<{
        point: readonly [number, number];
        depth: number;
      }>[];
      faces.push(Object.freeze({
        id: `${cuboid.id}-${definition.indexes.join("")}`,
        points: complete.map((row) => row.point),
        depth: complete.reduce((sum, row) => sum + row.depth, 0) / complete.length,
        color: shade(cuboid.color, definition.shade),
      }));
    }
  }
  faces.sort((left, rightFace) =>
    rightFace.depth - left.depth || stableCompare(left.id, rightFace.id));
  for (const face of faces) {
    fillPolygon(raster, face.points, face.color);
    const edge = shade(face.color, 0.7);
    for (let index = 0; index < face.points.length; index += 1) {
      drawLine(raster, face.points[index]!, face.points[(index + 1) % face.points.length]!, edge);
    }
  }
  return raster;
}

function blitContain(
  target: Raster,
  source: Raster,
  left: number,
  top: number,
  width: number,
  height: number,
): void {
  const scale = Math.min(width / source.width, height / source.height);
  const renderedWidth = Math.max(1, Math.round(source.width * scale));
  const renderedHeight = Math.max(1, Math.round(source.height * scale));
  const offsetX = Math.round(left + (width - renderedWidth) / 2);
  const offsetY = Math.round(top + (height - renderedHeight) / 2);
  for (let y = 0; y < renderedHeight; y += 1) {
    const sourceY = Math.min(source.height - 1, Math.floor(y / scale));
    for (let x = 0; x < renderedWidth; x += 1) {
      const sourceX = Math.min(source.width - 1, Math.floor(x / scale));
      const sourceOffset = (sourceY * source.width + sourceX) * 4;
      const targetOffset = ((offsetY + y) * target.width + offsetX + x) * 4;
      const alpha = source.pixels[sourceOffset + 3]! / 255;
      for (let channel = 0; channel < 3; channel += 1) {
        target.pixels[targetOffset + channel] = Math.round(
          source.pixels[sourceOffset + channel]! * alpha +
          target.pixels[targetOffset + channel]! * (1 - alpha),
        );
      }
      target.pixels[targetOffset + 3] = 255;
    }
  }
}

function comparison(left: Raster, right: Raster, width: number, height: number): Buffer {
  const output = createRaster(width * 2 + COMPARISON_SEPARATOR, height, [238, 242, 244]);
  fillRect(output, width, 0, width + COMPARISON_SEPARATOR, height, [43, 56, 58]);
  blitContain(output, left, 0, 0, width, height);
  blitContain(output, right, width + COMPARISON_SEPARATOR, 0, width, height);
  return encodePng(output);
}

async function writeAtomic(filePath: string, bytes: Uint8Array): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, bytes);
  await rename(temporaryPath, filePath);
}

export async function renderNativeBlockVisualReview(options: Readonly<{
  sourcePath: string;
  authoringPath: string;
  bootstrapPath: string;
  subjectVisualReviewProxyPath: string;
  worldPlanPath: string;
  entryTargetPath: string;
  topDownOutputPath: string;
  entryOutputPath: string;
  capturedLayoutOutputPath?: string;
}>): Promise<Readonly<Record<string, unknown>>> {
  const [
    sourceText,
    authoring,
    bootstrap,
    subjectVisualReviewProxyInput,
    worldPlanBytes,
    entryTargetBytes,
  ] = await Promise.all([
    readFile(options.sourcePath, "utf8"),
    readJson(options.authoringPath),
    readJson(options.bootstrapPath),
    readJson(options.subjectVisualReviewProxyPath),
    readFile(options.worldPlanPath),
    readFile(options.entryTargetPath),
  ]);
  const captured = captureSource(sourceText, options.sourcePath, bootstrap);
  const capturedLayoutIdentity: CapturedLayoutIdentity = Object.freeze({
    kind: "native-block-builder-captured-layout-identity",
    schemaVersion: 1,
    blocks: captured.blocks,
    displayGapMeters: captured.displayGapMeters,
    spawn: captured.spawn,
  });
  const capturedLayoutIdentityHash = sha256CanonicalJson(
    capturedLayoutIdentity,
  );
  const colorsByVisualGroupId = validateAuthoringGroups(authoring, captured.blocks);
  const geometry = cuboids(
    captured.blocks,
    captured.displayGapMeters,
    colorsByVisualGroupId,
  );
  const topDown = drawTopDown(geometry, captured.spawn.positionMetersXYZ);
  const subjectVisualReviewProxy = parseNativeBlockSubjectVisualReviewProxyV1(
    subjectVisualReviewProxyInput,
  );
  if (
    subjectVisualReviewProxy.initialControlledEntityId !==
      bootstrap.initialControlledEntityId
  ) {
    return fail(
      "NATIVE_BLOCK_VISUAL_REVIEW_INPUT_INVALID",
      "Subject visual-review proxy does not match initialControlledEntityId",
    );
  }
  const subjectCuboids = subjectProxyCuboids(
    subjectVisualReviewProxy,
    captured.spawn,
  );
  const entry = drawEntry(
    geometry,
    subjectCuboids,
    captured.spawn,
    bootstrap.initialCamera,
  );
  const topDownComparison = comparison(
    decodePng(worldPlanBytes),
    topDown,
    WIDTH_TOP,
    WIDTH_TOP,
  );
  const entryComparison = comparison(
    decodePng(entryTargetBytes),
    entry,
    WIDTH_ENTRY,
    HEIGHT_ENTRY,
  );
  await Promise.all([
    writeAtomic(options.topDownOutputPath, topDownComparison),
    writeAtomic(options.entryOutputPath, entryComparison),
    ...(options.capturedLayoutOutputPath === undefined
      ? []
      : [writeAtomic(
          options.capturedLayoutOutputPath,
          Buffer.from(`${stringifyCanonicalJson({
            kind: "native-block-builder-captured-layout-report",
            schemaVersion: 1,
            identity: capturedLayoutIdentity,
            identityHash: capturedLayoutIdentityHash,
          })}\n`),
        )]),
  ]);
  return Object.freeze({
    kind: "native-block-builder-visual-review",
    schemaVersion: 1,
    status: "passed",
    blockCount: captured.blocks.length,
    capturedLayoutIdentityHash,
    sourceHash: hash(sourceText),
    authoringHash: hash(await readFile(options.authoringPath)),
    bootstrapHash: hash(await readFile(options.bootstrapPath)),
    subjectVisualReviewProxyHash: hash(
      await readFile(options.subjectVisualReviewProxyPath),
    ),
    worldPlanHash: hash(worldPlanBytes),
    entryTargetHash: hash(entryTargetBytes),
    topDownComparisonHash: hash(topDownComparison),
    entryComparisonHash: hash(entryComparison),
  });
}

export async function main(arguments_ = process.argv.slice(2)): Promise<void> {
  const workspace = path.resolve(option(arguments_, "--workspace") ?? ".");
  const resolveFromWorkspace = (name: string, fallback: string): string =>
    path.resolve(workspace, option(arguments_, name) ?? fallback);
  const result = await renderNativeBlockVisualReview({
    sourcePath: resolveFromWorkspace("--source", "scene.ts"),
    authoringPath: resolveFromWorkspace("--authoring", "native-block-authoring.json"),
    bootstrapPath: resolveFromWorkspace("--bootstrap", "inputs/native-scene.bootstrap.json"),
    subjectVisualReviewProxyPath: resolveFromWorkspace(
      "--subject-visual-review-proxy",
      "inputs/subject-visual-review-proxy.json",
    ),
    worldPlanPath: resolveFromWorkspace("--world-plan", "inputs/world-plan.png"),
    entryTargetPath: resolveFromWorkspace("--entry-target", "inputs/entry-whitebox-target.png"),
    topDownOutputPath: resolveFromWorkspace(
      "--top-down-output",
      "attempts/advisory/builder-top-down-comparison.png",
    ),
    entryOutputPath: resolveFromWorkspace(
      "--entry-output",
      "attempts/advisory/builder-entry-comparison.png",
    ),
    ...(option(arguments_, "--captured-layout-output") === undefined
      ? {}
      : {
          capturedLayoutOutputPath: resolveFromWorkspace(
            "--captured-layout-output",
            "captured-layout-report.json",
          ),
        }),
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

const entryPath = process.argv[1] === undefined ? "" : path.resolve(process.argv[1]);
if (entryPath === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  });
}
