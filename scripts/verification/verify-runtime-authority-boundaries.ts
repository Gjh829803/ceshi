import { execFile } from "node:child_process";
import { lstat, readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { isEmpty, isNil } from "lodash-es";
import ts from "typescript";

import { sha256CanonicalJson } from "@whitebox-world/protocol";

import { GOLDEN_3C_SOURCE_POLICY_V1 } from "./verify-3c-migration.js";

const execFileAsync = promisify(execFile);
const JSON_EXTENSION = ".json";
const PACKAGE_NAME = /^@whitebox-world\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
const STABLE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

interface RuntimeAuthorityProtectedFactV1 {
  readonly id: string;
  readonly ownerPackage: string;
  readonly providerPackage: string;
  readonly forbiddenDeclaredIdentifiers: readonly string[];
  readonly forbiddenPublicFieldNames: readonly string[];
  readonly requiredSnapshotTypeName: string;
}

interface RuntimeAuthorityBoundaryPolicyV1 {
  readonly schemaVersion: 1;
  readonly protectedFacts: readonly RuntimeAuthorityProtectedFactV1[];
}

export interface RuntimeAuthorityBoundaryReceiptV1 {
  readonly schemaVersion: 1;
  readonly policyHash: `sha256:${string}`;
  readonly scannedFileCount: number;
  readonly protectedFactIds: readonly string[];
  readonly ok: true;
}

export interface VerifyRuntimeAuthorityBoundariesOptionsV1 {
  readonly repositoryRoot: string;
  readonly policy: unknown;
  readonly sourceFilePaths?: readonly string[];
}

function fail(code: string, detail: string): never {
  throw new Error(`${code}: ${detail}`);
}

function record(input: unknown): Record<string, unknown> | undefined {
  if (typeof input !== "object" || isNil(input) || Array.isArray(input)) return undefined;
  const prototype = Reflect.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) return undefined;
  const output = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(input)) {
    const descriptor = Reflect.getOwnPropertyDescriptor(input, key);
    if (typeof key !== "string" || isNil(descriptor) || !descriptor.enumerable ||
      !("value" in descriptor)) return undefined;
    output[key] = descriptor.value;
  }
  return output;
}

function exact(input: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Reflect.ownKeys(input);
  return actual.length === expected.length && actual.every((key) =>
    typeof key === "string" && expected.includes(key)
  );
}

function denseArray(input: unknown): readonly unknown[] | undefined {
  if (!Array.isArray(input) || Reflect.getPrototypeOf(input) !== Array.prototype) return undefined;
  const keys = Reflect.ownKeys(input);
  if (keys.some((key) => typeof key === "symbol") || keys.length !== input.length + 1) {
    return undefined;
  }
  const output: unknown[] = [];
  for (let index = 0; index < input.length; index += 1) {
    const descriptor = Reflect.getOwnPropertyDescriptor(input, String(index));
    if (isNil(descriptor) || !descriptor.enumerable || !("value" in descriptor)) return undefined;
    output.push(descriptor.value);
  }
  const lengthDescriptor = Reflect.getOwnPropertyDescriptor(input, "length");
  if (isNil(lengthDescriptor) || lengthDescriptor.enumerable) return undefined;
  return output;
}

function stableText(input: unknown): input is string {
  return typeof input === "string" && !isEmpty(input) && input.length <= 128 &&
    input.normalize("NFC") === input;
}

function stringSet(input: unknown): readonly string[] | undefined {
  const values = denseArray(input);
  if (isNil(values) || isEmpty(values) || !values.every(stableText)) return undefined;
  const strings = values as readonly string[];
  if (new Set(strings).size !== strings.length) return undefined;
  return Object.freeze([...strings]);
}

function parsePolicy(input: unknown): RuntimeAuthorityBoundaryPolicyV1 {
  const value = record(input);
  if (isNil(value) || !exact(value, ["schemaVersion", "protectedFacts"]) ||
    value.schemaVersion !== 1) {
    fail("RUNTIME_AUTHORITY_POLICY_INVALID", "policy must match the closed schemaVersion 1 shape.");
  }
  const factInputs = denseArray(value.protectedFacts);
  if (isNil(factInputs) || isEmpty(factInputs)) {
    fail("RUNTIME_AUTHORITY_POLICY_INVALID", "protectedFacts must be a non-empty dense array.");
  }
  const facts = factInputs.map((inputFact) => {
    const fact = record(inputFact);
    if (isNil(fact) || !exact(fact, [
      "id", "ownerPackage", "providerPackage", "forbiddenDeclaredIdentifiers",
      "forbiddenPublicFieldNames", "requiredSnapshotTypeName",
    ]) || !stableText(fact.id) || !STABLE_ID.test(fact.id) ||
      !stableText(fact.ownerPackage) || !PACKAGE_NAME.test(fact.ownerPackage) ||
      !stableText(fact.providerPackage) || !PACKAGE_NAME.test(fact.providerPackage) ||
      fact.ownerPackage === fact.providerPackage || !stableText(fact.requiredSnapshotTypeName)) {
      fail("RUNTIME_AUTHORITY_POLICY_INVALID", "protected fact is malformed.");
    }
    const forbiddenDeclaredIdentifiers = stringSet(fact.forbiddenDeclaredIdentifiers);
    const forbiddenPublicFieldNames = stringSet(fact.forbiddenPublicFieldNames);
    if (isNil(forbiddenDeclaredIdentifiers) || isNil(forbiddenPublicFieldNames)) {
      fail("RUNTIME_AUTHORITY_POLICY_INVALID", `${fact.id}: forbidden names are malformed.`);
    }
    return Object.freeze({
      id: fact.id,
      ownerPackage: fact.ownerPackage,
      providerPackage: fact.providerPackage,
      forbiddenDeclaredIdentifiers,
      forbiddenPublicFieldNames,
      requiredSnapshotTypeName: fact.requiredSnapshotTypeName,
    });
  });
  if (new Set(facts.map((fact) => fact.id)).size !== facts.length) {
    fail("RUNTIME_AUTHORITY_POLICY_INVALID", "protected fact ids must be unique.");
  }
  return Object.freeze({ schemaVersion: 1, protectedFacts: Object.freeze(facts) });
}

function packageRoot(packageName: string): string {
  return `packages/${packageName.slice("@whitebox-world/".length)}/`;
}

function isScannablePath(relativePath: string): boolean {
  if (relativePath.startsWith("/") || relativePath.includes("\\") ||
    relativePath.split("/").some((segment) => segment === "" || segment === "." || segment === "..")) {
    return false;
  }
  if (GOLDEN_3C_SOURCE_POLICY_V1.excludedPathPrefixes.some((prefix) =>
    relativePath.startsWith(prefix)
  ) || GOLDEN_3C_SOURCE_POLICY_V1.excludedFileSuffixes.some((suffix) =>
    relativePath.endsWith(suffix)
  )) return false;
  const extension = extname(relativePath);
  return extension === JSON_EXTENSION ||
    GOLDEN_3C_SOURCE_POLICY_V1.executableExtensions.includes(extension);
}

async function gitSourceFilePaths(repositoryRoot: string): Promise<readonly string[]> {
  const { stdout } = await execFileAsync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    { cwd: repositoryRoot, encoding: "buffer", maxBuffer: 16 * 1024 * 1024 },
  );
  return stdout.toString("utf8").split("\0").filter((value) => !isEmpty(value));
}

function declarationName(node: ts.Node): string | undefined {
  if (ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node) ||
    ts.isTypeAliasDeclaration(node) || ts.isEnumDeclaration(node) ||
    ts.isFunctionDeclaration(node)) return node.name?.text;
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) return node.name.text;
  return undefined;
}

function inspectSource(
  relativePath: string,
  source: string,
  policy: RuntimeAuthorityBoundaryPolicyV1,
  snapshotTypesByFactId: Map<string, boolean>,
): void {
  const sourceFile = ts.createSourceFile(
    relativePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    relativePath.endsWith(".tsx") || relativePath.endsWith(".jsx")
      ? ts.ScriptKind.TSX
      : ts.ScriptKind.TS,
  );
  const visit = (node: ts.Node): void => {
    const declared = declarationName(node);
    for (const fact of policy.protectedFacts) {
      if (!isNil(declared) && fact.forbiddenDeclaredIdentifiers.includes(declared)) {
        fail("RUNTIME_AUTHORITY_SHADOW_OWNER", `${fact.id}: ${relativePath} declares ${declared}.`);
      }
      if (ts.isIdentifier(node) && fact.forbiddenPublicFieldNames.includes(node.text)) {
        fail("RUNTIME_AUTHORITY_SHADOW_OWNER", `${fact.id}: ${relativePath} publishes ${node.text}.`);
      }
      if (relativePath.startsWith(packageRoot(fact.ownerPackage)) &&
        declared === fact.requiredSnapshotTypeName) {
        snapshotTypesByFactId.set(fact.id, true);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}

function inspectJson(
  relativePath: string,
  source: string,
  policy: RuntimeAuthorityBoundaryPolicyV1,
): void {
  let value: unknown;
  try {
    value = JSON.parse(source) as unknown;
  } catch {
    fail("RUNTIME_AUTHORITY_SOURCE_INVALID", `${relativePath}: invalid JSON.`);
  }
  const visit = (input: unknown): void => {
    if (Array.isArray(input)) {
      for (const item of input) visit(item);
      return;
    }
    const inputRecord = record(input);
    if (isNil(inputRecord)) return;
    for (const [key, child] of Object.entries(inputRecord)) {
      for (const fact of policy.protectedFacts) {
        if (fact.forbiddenDeclaredIdentifiers.includes(key) ||
          fact.forbiddenPublicFieldNames.includes(key)) {
          fail("RUNTIME_AUTHORITY_SHADOW_OWNER", `${fact.id}: ${relativePath} publishes ${key}.`);
        }
      }
      visit(child);
    }
  };
  visit(value);
}

export async function verifyRuntimeAuthorityBoundariesV1(
  options: VerifyRuntimeAuthorityBoundariesOptionsV1,
): Promise<RuntimeAuthorityBoundaryReceiptV1> {
  const policy = parsePolicy(options.policy);
  const rawPaths = options.sourceFilePaths ?? await gitSourceFilePaths(options.repositoryRoot);
  const sourceFilePaths = [...new Set(rawPaths)].filter(isScannablePath).sort();
  const snapshotTypesByFactId = new Map(policy.protectedFacts.map((fact) => [fact.id, false]));
  let scannedFileCount = 0;
  for (const relativePath of sourceFilePaths) {
    const absolutePath = resolve(options.repositoryRoot, ...relativePath.split("/"));
    let status;
    try {
      status = await lstat(absolutePath);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") continue;
      throw error;
    }
    if (status.isSymbolicLink() || !status.isFile()) {
      fail("RUNTIME_AUTHORITY_SOURCE_INVALID", `${relativePath}: expected a regular file.`);
    }
    const source = await readFile(absolutePath, "utf8");
    if (relativePath.endsWith(JSON_EXTENSION)) inspectJson(relativePath, source, policy);
    else inspectSource(relativePath, source, policy, snapshotTypesByFactId);
    scannedFileCount += 1;
  }
  for (const fact of policy.protectedFacts) {
    if (snapshotTypesByFactId.get(fact.id) !== true) {
      fail(
        "RUNTIME_AUTHORITY_SNAPSHOT_COVERAGE_MISSING",
        `${fact.id}: ${fact.requiredSnapshotTypeName} is absent from ${fact.ownerPackage}.`,
      );
    }
  }
  return Object.freeze({
    schemaVersion: 1,
    policyHash: sha256CanonicalJson(policy) as `sha256:${string}`,
    scannedFileCount,
    protectedFactIds: Object.freeze(policy.protectedFacts.map((fact) => fact.id).sort()),
    ok: true,
  });
}

async function runCli(): Promise<void> {
  const repositoryRoot = process.cwd();
  const policy = JSON.parse(await readFile(
    resolve(repositoryRoot, "config/runtime-authority-boundaries.json"),
    "utf8",
  )) as unknown;
  const receipt = await verifyRuntimeAuthorityBoundariesV1({ repositoryRoot, policy });
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}

const invokedPath = process.argv[1];
if (!isNil(invokedPath) && resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  runCli().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
