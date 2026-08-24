import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const CLEAN_BREAK_SCAN_ROOTS = Object.freeze([
  "packages",
  "apps",
  "scripts",
  "examples",
  "README.md",
  "docs/17-canonical-json-quickstart.md",
] as const);

export const CLEAN_BREAK_HISTORICAL_EXCLUSIONS = Object.freeze([
  "docs/reviews",
  "docs/superpowers/plans",
  "docs/superpowers/specs",
] as const);

const IGNORED_DIRECTORY_NAMES = new Set([
  ".git",
  ".turbo",
  "coverage",
  "dist",
  "node_modules",
]);

type CleanBreakClassification = "superseded-delete" | "current-authority";

export interface CleanBreakPathMatches {
  readonly path: string;
  readonly matches: readonly Readonly<{
    line: number;
    value: string;
  }>[];
}

export interface CleanBreakFamilyReport {
  readonly familyId: string;
  readonly classification: CleanBreakClassification;
  readonly blocksCompletion: boolean;
  readonly matchCount: number;
  readonly matchesByPath: readonly CleanBreakPathMatches[];
}

export interface CleanBreakCensusReport {
  readonly kind: "unreleased-clean-break-census";
  readonly schemaVersion: 1;
  readonly ok: boolean;
  readonly roots: readonly string[];
  readonly historicalExclusions: readonly string[];
  readonly scannedFileCount: number;
  readonly forbiddenMatchCount: number;
  readonly currentAuthorityMatchCount: number;
  readonly families: readonly CleanBreakFamilyReport[];
}

interface TextFamilyDefinition {
  readonly familyId: string;
  readonly classification: CleanBreakClassification;
  readonly blocksCompletion: boolean;
  readonly pattern: RegExp;
}

interface MutableMatch {
  readonly path: string;
  readonly line: number;
  readonly value: string;
}

function token(parts: readonly string[]): string {
  return parts.join("");
}

function escaped(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function alternatives(values: readonly string[]): string {
  return values.map(escaped).join("|");
}

function textFamilyDefinitions(): readonly TextFamilyDefinition[] {
  const supersededTopLevel = [
    ...[1, 2, 3].map((version) => token(["Authoring", "Spec", "V", String(version)])),
    ...[1, 2, 3].map((version) => token(["Normalized", "World", "IR", "V", String(version)])),
    ...[1, 2, 3, 4].map((version) => token(["Execution", "Plan", "V", String(version)])),
  ];
  const currentTopLevel = [
    token(["Authoring", "Spec", "V4"]),
    token(["Normalized", "World", "IR", "V4"]),
    token(["Execution", "Plan", "V5"]),
  ];
  const currentVersionedComponents = [
    token(["Traversal", "Area", "Spec", "V1"]),
    token(["Execution", "Traversal", "Surface", "V1"]),
    token(["Execution", "Object", "V3"]),
    token(["Package", "Subject", "Definition", "V1"]),
  ];
  const supersededRuntimeAndSubjectContracts = [
    token(["World", "Runtime", "Snapshot", "V3"]),
    token(["Bind", "Control", "Request", "V2"]),
    token(["Registry", "Subject", "Definition", "V2"]),
    token(["Registry", "Subject", "Definition", "Input", "V2"]),
    token(["Subject", "Resource", "Registry", "V2"]),
  ];
  const supersededMechanisms = [
    escaped(token(["migrate", "Authoring", "Spec", "V2", "To", "V3"])),
    escaped(token(["project", "Placements", "To", "V3"])),
    escaped(token(["project", "Normalized", "World", "V4", "To", "V3"])),
    escaped(token(["compile", "World", "V4"])),
    escaped(token(["load", "Worldkit", "Pipeline"])),
    `${escaped(token(["Execution", "Plan", "V4"]))}\\s*\\|\\s*${escaped(token(["Execution", "Plan", "V5"]))}`,
    `${escaped(token(["schema", "Version"]))}\\s*===\\s*4`,
    `${escaped(token(["schema", "Version"]))}\\s*!==\\s*5`,
    escaped(token(["legacy", "-control"])),
    escaped(token(["legacy", "-motion"])),
    `${escaped(token(["legacy"]))}\\.(?:${alternatives(["camera", "ground"])})`,
    escaped(token(["LEGACY", "_CONTROL"])),
    escaped(token(["LEGACY", "_MOTION"])),
    escaped(token(["LEGACY", "_CAMERA"])),
    `\\b${escaped(token(["bind", "Control"]))}\\s*\\(`,
  ];

  return Object.freeze([
    Object.freeze({
      familyId: "superseded-top-level-contracts",
      classification: "superseded-delete" as const,
      blocksCompletion: true,
      pattern: new RegExp(`\\b(?:${alternatives(supersededTopLevel)})\\b`, "g"),
    }),
    Object.freeze({
      familyId: "superseded-runtime-and-subject-contracts",
      classification: "superseded-delete" as const,
      blocksCompletion: true,
      pattern: new RegExp(
        `\\b(?:${alternatives(supersededRuntimeAndSubjectContracts)})\\b`,
        "g",
      ),
    }),
    Object.freeze({
      familyId: "superseded-compatibility-mechanisms",
      classification: "superseded-delete" as const,
      blocksCompletion: true,
      pattern: new RegExp(`(?:${supersededMechanisms.join("|")})`, "g"),
    }),
    Object.freeze({
      familyId: "current-top-level-contracts",
      classification: "current-authority" as const,
      blocksCompletion: false,
      pattern: new RegExp(`\\b(?:${alternatives(currentTopLevel)})\\b`, "g"),
    }),
    Object.freeze({
      familyId: "current-versioned-components",
      classification: "current-authority" as const,
      blocksCompletion: false,
      pattern: new RegExp(`\\b(?:${alternatives(currentVersionedComponents)})\\b`, "g"),
    }),
  ]);
}

async function discoverFiles(absoluteRoot: string): Promise<readonly string[]> {
  let entries;
  try {
    entries = await readdir(absoluteRoot, { withFileTypes: true });
  } catch (error) {
    const code = error instanceof Error && "code" in error
      ? (error as NodeJS.ErrnoException).code
      : undefined;
    if (code === "ENOENT" || code === "ENOTDIR") {
      try {
        await readFile(absoluteRoot);
        return [absoluteRoot];
      } catch (readError) {
        const readCode = readError instanceof Error && "code" in readError
          ? (readError as NodeJS.ErrnoException).code
          : undefined;
        if (readCode === "ENOENT") return [];
        throw readError;
      }
    }
    throw error;
  }

  const files: string[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.isDirectory() && IGNORED_DIRECTORY_NAMES.has(entry.name)) continue;
    const absolutePath = path.join(absoluteRoot, entry.name);
    if (entry.isDirectory()) {
      files.push(...await discoverFiles(absolutePath));
    } else if (entry.isFile()) {
      files.push(absolutePath);
    }
  }
  return files;
}

function lineAt(source: string, index: number): number {
  let line = 1;
  for (let cursor = 0; cursor < index; cursor += 1) {
    if (source.charCodeAt(cursor) === 10) line += 1;
  }
  return line;
}

function collectTextMatches(
  source: string,
  relativePath: string,
  definition: TextFamilyDefinition,
): readonly MutableMatch[] {
  const matches: MutableMatch[] = [];
  definition.pattern.lastIndex = 0;
  for (const match of source.matchAll(definition.pattern)) {
    matches.push({
      path: relativePath,
      line: lineAt(source, match.index),
      value: match[0],
    });
  }
  return matches;
}

function serializedAuthoringMatches(
  source: string,
  relativePath: string,
): readonly MutableMatch[] {
  if (path.extname(relativePath) !== ".json") return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    return [];
  }
  if (
    typeof parsed !== "object"
    || parsed === null
    || !("kind" in parsed)
    || !("schemaVersion" in parsed)
  ) return [];
  const candidate = parsed as { kind?: unknown; schemaVersion?: unknown };
  if (
    candidate.kind !== "worldkit-authoring-spec"
    || typeof candidate.schemaVersion !== "number"
    || candidate.schemaVersion < 1
    || candidate.schemaVersion > 3
  ) return [];
  const versionPattern = new RegExp(
    `"${token(["schema", "Version"])}"\\s*:\\s*${candidate.schemaVersion}`,
  );
  const versionMatch = versionPattern.exec(source);
  return [{
    path: relativePath,
    line: lineAt(source, versionMatch?.index ?? 0),
    value: `${token(["schema", "Version"])}:${candidate.schemaVersion}`,
  }];
}

function groupByPath(matches: readonly MutableMatch[]): readonly CleanBreakPathMatches[] {
  const grouped = new Map<string, MutableMatch[]>();
  for (const match of matches) {
    const pathMatches = grouped.get(match.path) ?? [];
    pathMatches.push(match);
    grouped.set(match.path, pathMatches);
  }
  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([matchedPath, pathMatches]) => ({
      path: matchedPath,
      matches: pathMatches
        .sort((left, right) => left.line - right.line || left.value.localeCompare(right.value))
        .map(({ line, value }) => ({ line, value })),
    }));
}

export async function scanUnreleasedCleanBreak(
  repositoryRoot: string,
): Promise<CleanBreakCensusReport> {
  const discovered = new Set<string>();
  for (const root of CLEAN_BREAK_SCAN_ROOTS) {
    for (const file of await discoverFiles(path.join(repositoryRoot, root))) {
      discovered.add(file);
    }
  }
  const files = [...discovered].sort((left, right) => left.localeCompare(right));
  const definitions = textFamilyDefinitions();
  const matchesByFamily = new Map<string, MutableMatch[]>(
    definitions.map((definition) => [definition.familyId, []]),
  );
  matchesByFamily.set("superseded-serialized-authoring", []);

  for (const absolutePath of files) {
    const bytes = await readFile(absolutePath);
    if (bytes.includes(0)) continue;
    const source = bytes.toString("utf8");
    const relativePath = path.relative(repositoryRoot, absolutePath).split(path.sep).join("/");
    for (const definition of definitions) {
      matchesByFamily.get(definition.familyId)!.push(
        ...collectTextMatches(source, relativePath, definition),
      );
    }
    matchesByFamily.get("superseded-serialized-authoring")!.push(
      ...serializedAuthoringMatches(source, relativePath),
    );
  }

  const allDefinitions = [
    ...definitions.slice(0, 2),
    {
      familyId: "superseded-serialized-authoring",
      classification: "superseded-delete" as const,
      blocksCompletion: true,
      pattern: /(?:)/g,
    },
    ...definitions.slice(2),
  ];
  const families = allDefinitions.map((definition) => {
    const matches = matchesByFamily.get(definition.familyId) ?? [];
    return {
      familyId: definition.familyId,
      classification: definition.classification,
      blocksCompletion: definition.blocksCompletion,
      matchCount: matches.length,
      matchesByPath: groupByPath(matches),
    } satisfies CleanBreakFamilyReport;
  });
  const forbiddenMatchCount = families
    .filter((entry) => entry.blocksCompletion)
    .reduce((sum, entry) => sum + entry.matchCount, 0);
  const currentAuthorityMatchCount = families
    .filter((entry) => !entry.blocksCompletion)
    .reduce((sum, entry) => sum + entry.matchCount, 0);

  return {
    kind: "unreleased-clean-break-census",
    schemaVersion: 1,
    ok: forbiddenMatchCount === 0,
    roots: CLEAN_BREAK_SCAN_ROOTS,
    historicalExclusions: CLEAN_BREAK_HISTORICAL_EXCLUSIONS,
    scannedFileCount: files.length,
    forbiddenMatchCount,
    currentAuthorityMatchCount,
    families,
  };
}

async function main(): Promise<void> {
  const repositoryRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  const report = await scanUnreleasedCleanBreak(repositoryRoot);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.ok) process.exitCode = 1;
}

const invokedPath = process.argv[1] === undefined
  ? undefined
  : path.resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  await main();
}
