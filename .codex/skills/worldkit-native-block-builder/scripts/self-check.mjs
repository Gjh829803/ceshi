#!/usr/bin/env node

import { createHash } from "node:crypto";
import { lstat, readdir, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DECLARED_OUTPUT_PATHS = Object.freeze([
  "scene.ts",
  "native-block-authoring.json",
  "native-resources.json",
]);
const DECLARED_OUTPUT_SET = new Set(DECLARED_OUTPUT_PATHS);
const STABLE_REF = /^[a-z][a-z0-9+.-]*:\/\/[^\s]+$/;
const STABLE_ID = /^[a-z0-9][a-z0-9-]{2,79}$/;
const SEMANTIC_CLASS_ID = /^[a-z][a-z0-9.-]{2,127}$/;
const IDENTITY_COLOR_HEX = /^#[0-9A-F]{6}$/;
const DANGEROUS_JSON_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const FORBIDDEN_JSON_FIELD_TOKENS = Object.freeze([
  "camera", "physics", "subject", "spawn", "runtime", "input", "action",
  "gameplay", "package", "receipt", "admission",
]);
const FORBIDDEN_SOURCE_PATTERNS = Object.freeze([
  /\bnew\s+(?:WebGPUEngine|Engine|NullEngine)\s*\(/,
  /\bnew\s+Scene\s*\(/,
  /\brunRenderLoop\b/,
  /\b(?:HavokPlugin|PhysicsAggregate|PhysicsBody|PhysicsShape)\b/,
  /\bnew\s+[A-Za-z]*(?:Camera)\s*\(/,
  /\b(?:DeviceSourceManager|InputManager|ActionManager)\b/,
  /\b(?:addEventListener|removeEventListener)\s*\(/,
  /\b(?:setInterval|setTimeout|requestAnimationFrame)\s*\(/,
  /\bfetch\s*\(/,
  /\bMath\.random\s*\(/,
  /\bDate\.now\s*\(/,
]);

function parseOption(arguments_, name) {
  const index = arguments_.indexOf(name);
  const value = index < 0 ? undefined : arguments_[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new TypeError(`${name} is required.`);
  }
  return value;
}

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function stableCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isPlainJsonData(value, seen = new Set()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) return false;
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable ||
          !isPlainJsonData(descriptor.value, seen)) return false;
    }
    return Object.getOwnPropertyNames(value).length === value.length + 1;
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  return Reflect.ownKeys(descriptors).every((key) =>
    typeof key === "string" && !DANGEROUS_JSON_KEYS.has(key) &&
    descriptors[key].enumerable && "value" in descriptors[key] &&
    isPlainJsonData(descriptors[key].value, seen));
}

function parseJsonData(bytes, diagnosticCodes) {
  try {
    const value = JSON.parse(bytes.toString("utf8"));
    if (!isPlainJsonData(value)) {
      diagnosticCodes.add("NATIVE_BLOCK_BUILDER_JSON_NOT_PLAIN_DATA");
      return undefined;
    }
    return value;
  } catch {
    diagnosticCodes.add("NATIVE_BLOCK_BUILDER_JSON_INVALID");
    return undefined;
  }
}

function hasForbiddenAuthorityField(value) {
  if (value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(hasForbiddenAuthorityField);
  return Object.entries(value).some(([key, child]) => {
    const normalizedKey = key.toLowerCase();
    return FORBIDDEN_JSON_FIELD_TOKENS.some((token) => normalizedKey.includes(token)) ||
      hasForbiddenAuthorityField(child);
  });
}

function hasExactKeys(value, expectedKeys) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const actualKeys = Object.keys(value).sort(stableCompare);
  const sortedExpectedKeys = [...expectedKeys].sort(stableCompare);
  return actualKeys.length === sortedExpectedKeys.length &&
    actualKeys.every((key, index) => key === sortedExpectedKeys[index]);
}

function validateResourceRefs(value, diagnosticCodes) {
  if (!hasExactKeys(value, ["kind", "schemaVersion", "resourceRefs"]) ||
      value.kind !== "native-visual-resource-list" || value.schemaVersion !== 1 ||
      !Array.isArray(value.resourceRefs) ||
      value.resourceRefs.some((resourceRef) =>
        typeof resourceRef !== "string" || !STABLE_REF.test(resourceRef))) {
    diagnosticCodes.add("NATIVE_BLOCK_BUILDER_RESOURCE_REFS_INVALID");
    return;
  }
  const sorted = [...value.resourceRefs].sort(stableCompare);
  if (value.resourceRefs.some((resourceRef, index) => resourceRef !== sorted[index])) {
    diagnosticCodes.add("NATIVE_BLOCK_BUILDER_RESOURCE_REFS_UNSORTED");
  }
  if (new Set(value.resourceRefs).size !== value.resourceRefs.length) {
    diagnosticCodes.add("NATIVE_BLOCK_BUILDER_RESOURCE_REFS_DUPLICATE");
  }
}

function validateAuthoring(value, diagnosticCodes) {
  if (!hasExactKeys(value, [
    "kind", "schemaVersion", "entryModulePath", "blockProfileRef", "visualGroups",
  ]) ||
      value.kind !== "native-block-authoring" || value.schemaVersion !== 1 ||
      value.entryModulePath !== "scene.ts" ||
      value.blockProfileRef !== "worldkit://native-block-profile/whitebox.blocks@1" ||
      !Array.isArray(value.visualGroups)) {
    diagnosticCodes.add("NATIVE_BLOCK_BUILDER_AUTHORING_INVALID");
    return;
  }
  let rowsAreValid = true;
  for (const visualGroup of value.visualGroups) {
    if (!hasExactKeys(visualGroup, [
      "visualGroupId", "acceptanceTargetRef", "semanticClassId", "identityColorHex",
    ]) || !STABLE_ID.test(visualGroup.visualGroupId) ||
        !STABLE_REF.test(visualGroup.acceptanceTargetRef) ||
        !SEMANTIC_CLASS_ID.test(visualGroup.semanticClassId) ||
        !IDENTITY_COLOR_HEX.test(visualGroup.identityColorHex)) {
      rowsAreValid = false;
    }
  }
  if (!rowsAreValid) {
    diagnosticCodes.add("NATIVE_BLOCK_BUILDER_AUTHORING_INVALID");
    return;
  }
  const groupIds = value.visualGroups.map(({ visualGroupId }) => visualGroupId);
  const sortedGroupIds = [...groupIds].sort(stableCompare);
  if (groupIds.some((groupId, index) => groupId !== sortedGroupIds[index])) {
    diagnosticCodes.add("NATIVE_BLOCK_BUILDER_VISUAL_GROUPS_UNSORTED");
  }
  const targetRefs = value.visualGroups.map(({ acceptanceTargetRef }) =>
    acceptanceTargetRef);
  if (new Set(groupIds).size !== groupIds.length ||
      new Set(targetRefs).size !== targetRefs.length) {
    diagnosticCodes.add("NATIVE_BLOCK_BUILDER_VISUAL_GROUPS_DUPLICATE");
  }
}

export async function selfCheckNativeBlockBuilderWorkspace(workspacePath) {
  const diagnosticCodes = new Set();
  const outputHashes = [];
  let entries = [];
  let canonicalWorkspace;
  try {
    canonicalWorkspace = await realpath(workspacePath);
    const workspaceStat = await lstat(canonicalWorkspace);
    if (!workspaceStat.isDirectory()) throw new TypeError("not a directory");
    entries = await readdir(canonicalWorkspace);
  } catch {
    diagnosticCodes.add("NATIVE_BLOCK_BUILDER_WORKSPACE_INVALID");
  }

  for (const entry of entries.sort(stableCompare)) {
    if (!DECLARED_OUTPUT_SET.has(entry)) {
      diagnosticCodes.add("NATIVE_BLOCK_BUILDER_OUTPUT_EXTRA");
    }
  }

  for (const outputPath of DECLARED_OUTPUT_PATHS) {
    if (canonicalWorkspace === undefined || !entries.includes(outputPath)) {
      diagnosticCodes.add("NATIVE_BLOCK_BUILDER_OUTPUT_MISSING");
      continue;
    }
    const absolutePath = path.join(canonicalWorkspace, outputPath);
    let stat;
    try {
      stat = await lstat(absolutePath);
    } catch {
      diagnosticCodes.add("NATIVE_BLOCK_BUILDER_OUTPUT_MISSING");
      continue;
    }
    if (stat.isSymbolicLink()) {
      diagnosticCodes.add("NATIVE_BLOCK_BUILDER_OUTPUT_SYMLINK");
      continue;
    }
    if (!stat.isFile()) {
      diagnosticCodes.add("NATIVE_BLOCK_BUILDER_OUTPUT_INVALID_TYPE");
      continue;
    }
    const bytes = await readFile(absolutePath);
    if (bytes.length === 0) {
      diagnosticCodes.add("NATIVE_BLOCK_BUILDER_OUTPUT_EMPTY");
      continue;
    }
    outputHashes.push(Object.freeze({ path: outputPath, hash: sha256(bytes), bytes: bytes.length }));
    if (outputPath === "scene.ts") {
      const source = bytes.toString("utf8");
      if (FORBIDDEN_SOURCE_PATTERNS.some((pattern) => pattern.test(source))) {
        diagnosticCodes.add("NATIVE_BLOCK_BUILDER_SOURCE_AUTHORITY_FORBIDDEN");
      }
    } else {
      const value = parseJsonData(bytes, diagnosticCodes);
      if (value !== undefined) {
        if (hasForbiddenAuthorityField(value)) {
          diagnosticCodes.add("NATIVE_BLOCK_BUILDER_JSON_AUTHORITY_FIELD_FORBIDDEN");
        }
        if (outputPath === "native-resources.json") {
          validateResourceRefs(value, diagnosticCodes);
        } else {
          validateAuthoring(value, diagnosticCodes);
        }
      }
    }
  }

  const codes = Object.freeze([...diagnosticCodes].sort(stableCompare));
  return Object.freeze({
    kind: "native-block-builder-self-check",
    schemaVersion: 1,
    ok: codes.length === 0,
    declaredOutputPaths: DECLARED_OUTPUT_PATHS,
    outputHashes: Object.freeze(outputHashes.sort((left, right) =>
      stableCompare(left.path, right.path))),
    diagnosticCodes: codes,
  });
}

export async function main(arguments_ = process.argv.slice(2)) {
  const report = await selfCheckNativeBlockBuilderWorkspace(
    path.resolve(parseOption(arguments_, "--workspace")),
  );
  process.stdout.write(`${JSON.stringify(report)}\n`);
  process.exitCode = report.ok ? 0 : 2;
}

const entryPath = process.argv[1] === undefined ? "" : path.resolve(process.argv[1]);
if (entryPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  });
}
