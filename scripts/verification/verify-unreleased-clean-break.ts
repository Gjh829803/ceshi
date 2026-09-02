import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isNil } from "lodash-es";

export const CLEAN_BREAK_SCAN_ROOTS = Object.freeze([
  "packages",
  "apps",
  "scripts",
  "examples",
  "artifacts",
  "assets",
  ".codex",
  "README.md",
  "docs/00-project-overview.md",
  "docs/02-sdk-architecture.md",
  "docs/05-mvp-roadmap.md",
  "docs/17-canonical-json-quickstart.md",
  "docs/20-gameplay-integration-contract.md",
] as const);

export const CLEAN_BREAK_HISTORICAL_EXCLUSIONS = Object.freeze([
  "docs/reviews",
  "docs/superpowers/plans",
  "docs/superpowers/specs",
] as const);

const REQUIRED_CLEAN_BREAK_SCAN_ROOTS = Object.freeze(["packages"] as const);

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
  readonly pathPattern?: RegExp;
  readonly excludedPathPattern?: RegExp;
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
    ...[1, 2, 3, 4, 5].map((version) => token(["Execution", "Plan", "V", String(version)])),
    token(["World", "Node", "Spec", "V3"]),
    token(["Normalized", "World", "Node", "V3"]),
  ];
  const currentTopLevel = [
    token(["Authoring", "Spec", "V4"]),
    token(["Normalized", "World", "IR", "V4"]),
    token(["Canonical", "Scene", "Execution", "Plan", "V1"]),
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
    escaped(token(["legacy", "-control"])),
    escaped(token(["legacy", "-motion"])),
    `${escaped(token(["legacy"]))}\\.(?:${alternatives(["camera", "ground"])})`,
    escaped(token(["LEGACY", "_CONTROL"])),
    escaped(token(["LEGACY", "_MOTION"])),
    escaped(token(["LEGACY", "_CAMERA"])),
    `\\b${escaped(token(["bind", "Control"]))}\\s*\\(`,
    `${escaped(token(["normalize", "Authoring", "Spec", "V4"]))}\\s+as\\s+${escaped(token(["normalize", "Authoring", "Spec"]))}`,
    `export\\s+function\\s+${escaped(token(["parse", "Authoring", "Spec", "Json"]))}\\s*\\(`,
    `export\\s+function\\s+${escaped(token(["parse", "Authoring", "Spec", "Json", "V4"]))}\\s*\\(`,
    `private\\s+${escaped(token(["update", "Legacy"]))}\\s*\\(`,
    `export\\s+function\\s+${escaped(token(["validate", "Authoring", "Spec"]))}\\s*\\(`,
    `export\\s+const\\s+${escaped(token(["compile", "World"]))}\\s*=\\s*${escaped(token(["compile", "World", "V5"]))}`,
  ];

  const legacyNativeSceneProfileRef = token([
    "worldkit://native-scene-profile/",
    "trusted-local@1",
  ]);
  const legacyNativeBlockGridSymbols = [
    token(["BABYLON_NATIVE_BLOCK_", "MICRO_GRID_METERS_V1"]),
    token(["BABYLON_NATIVE_BLOCK_", "CENTER_LATTICE_METERS_V1"]),
  ];
  const legacyNativeBlockMechanisms = [
    token(["Block", "World", "Manifest", "V2"]),
    token(["create", "Block", "World", "Manifest", "V2"]),
    token(["block", "-world", "-three"]),
    token(["block", "-world", "-compiler"]),
    token(["hidden", "Foundation"]),
  ];
  const retiredNativeBlockColliderSelection = [
    "\\bstaticColliders\\s*:\\s*",
    "(?:Object\\.freeze\\s*\\(\\s*)?\\[\\s*",
    "(?:Object\\.freeze\\s*\\(\\s*)?\\{",
    "(?:(?!colliderGeometrySource)[\\s\\S]){0,320}?",
    "\\bblockId\\s*:",
  ].join("");
  const legacyNativeBlockTransitionPrefix = token([
    "structural",
    "HalfMeterTransition",
  ]);
  const legacyM8PublicContractSymbols = [
    token(["Camera", "Relationship", "Role", "V1"]),
    token(["Camera", "Context", "Rule", "V1"]),
    token(["Runtime", "Camera", "Context", "Rule", "V1"]),
    token(["relationship", "Roles"]),
    token(["relationship", "Role"]),
    token(["required", "Motion", "Tags"]),
    token(["minimumContactToAggregateSupportNormal", "DotRatio"]),
    token(["minimumSupportNormal", "DotRatio"]),
    token(["CORE_", "SEMANTIC_FACT_PROJECTOR_PROFILE_RESOURCE_V1"]),
    token(["CAMERA_", "SEMANTIC_AUTHORITY_UNAVAILABLE"]),
    token(["semantic", "-authority-unavailable"]),
  ];
  const legacySemanticAuthorityUnavailable = [
    escaped(token(["semantic", "Authority", "Status"])),
    "[^\\n]{0,120}",
    escaped(token(["un", "available"])),
  ].join("");

  return Object.freeze([
    Object.freeze({
      familyId: "superseded-active-documentation",
      classification: "superseded-delete" as const,
      blocksCompletion: true,
      pathPattern: /^(?:README\.md|docs\/(?:00-project-overview|02-sdk-architecture|05-mvp-roadmap|17-canonical-json-quickstart|20-gameplay-integration-contract)\.md)$/,
      pattern: /\b(?:AuthoringSpec\s+V[1-3]|NormalizedWorldIR\s+V[1-3]|ExecutionPlan\s+V[1-5]|Snapshot\s+V3|Browser Protocol\s+V4)\b/g,
    }),
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
      familyId: "WORLDKIT_UNRELEASED_LEGACY_NATIVE_SCENE_PROFILE_REF",
      classification: "superseded-delete" as const,
      blocksCompletion: true,
      pattern: new RegExp(escaped(legacyNativeSceneProfileRef), "g"),
    }),
    Object.freeze({
      familyId: "WORLDKIT_UNRELEASED_LEGACY_NATIVE_BLOCK_GRID",
      classification: "superseded-delete" as const,
      blocksCompletion: true,
      pattern: new RegExp(
        `(?:${alternatives(legacyNativeBlockGridSymbols)}|${escaped(legacyNativeBlockTransitionPrefix)}(?:Keys|Count)?)`,
        "g",
      ),
    }),
    Object.freeze({
      familyId: "WORLDKIT_UNRELEASED_LEGACY_NATIVE_BLOCK_AUTHORING",
      classification: "superseded-delete" as const,
      blocksCompletion: true,
      pathPattern: /^(?:packages|apps|scripts|examples|artifacts|assets|\.codex)\//,
      excludedPathPattern: /(?:^|\/)[^/]+\.(?:test|spec)\.[cm]?[jt]sx?$/,
      pattern: new RegExp(
        `(?:${alternatives(legacyNativeBlockMechanisms)}|${retiredNativeBlockColliderSelection})`,
        "g",
      ),
    }),
    Object.freeze({
      familyId: "WORLDKIT_UNRELEASED_LEGACY_M8_S1_PUBLIC_CONTRACT",
      classification: "superseded-delete" as const,
      blocksCompletion: true,
      excludedPathPattern: /(?:^|\/)[^/]+\.(?:test|spec)\.[cm]?[jt]sx?$/,
      pattern: new RegExp(
        `(?:${alternatives(legacyM8PublicContractSymbols)}|${legacySemanticAuthorityUnavailable})`,
        "g",
      ),
    }),
    Object.freeze({
      familyId: "WORLDKIT_UNRELEASED_LEGACY_VIEWER_ROUTE",
      classification: "superseded-delete" as const,
      blocksCompletion: true,
      pathPattern: /^(?:packages|apps|scripts|examples|artifacts|assets|\.codex)\//,
      excludedPathPattern: /(?:^|\/)[^/]+\.(?:test|spec)\.[cm]?[jt]sx?$/,
      pattern: new RegExp(
        `(?:${alternatives([
          token(["?", "authoring", "=1"]),
          token(["catalog", "-gameplay"]),
        ])})`,
        "g",
      ),
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
  if (definition.pathPattern !== undefined) {
    definition.pathPattern.lastIndex = 0;
    if (!definition.pathPattern.test(relativePath)) return [];
  }
  if (definition.excludedPathPattern !== undefined) {
    definition.excludedPathPattern.lastIndex = 0;
    if (definition.excludedPathPattern.test(relativePath)) return [];
  }
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

const CURRENT_SERIALIZED_SCHEMA_VERSION_BY_KIND = Object.freeze({
  "worldkit-authoring-spec": 4,
  "worldkit-normalized-world": 4,
  "worldkit-canonical-scene-execution-plan": 1,
  "worldkit-runtime-snapshot": 4,
} as const);

const SUPERSEDED_SERIALIZED_KINDS = new Set([
  "worldkit-execution-plan",
]);

function serializedContractMatches(
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
  const matches: MutableMatch[] = [];
  let sourceCursor = 0;
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry);
      return;
    }
    if (typeof value !== "object" || isNil(value)) return;
    const candidate = value as Record<string, unknown>;
    const kind = candidate.kind;
    const schemaVersion = candidate.schemaVersion;
    if (
      typeof kind === "string"
      && SUPERSEDED_SERIALIZED_KINDS.has(kind)
      && typeof schemaVersion === "number"
    ) {
      const kindPattern = new RegExp(`"${escaped(kind)}"`, "g");
      kindPattern.lastIndex = sourceCursor;
      const kindMatch = kindPattern.exec(source);
      sourceCursor = kindPattern.lastIndex;
      matches.push({
        path: relativePath,
        line: lineAt(source, kindMatch?.index ?? 0),
        value: `${kind}@${schemaVersion}`,
      });
    } else if (
      typeof kind === "string"
      && Object.hasOwn(CURRENT_SERIALIZED_SCHEMA_VERSION_BY_KIND, kind)
      && typeof schemaVersion === "number"
    ) {
      const currentVersion = CURRENT_SERIALIZED_SCHEMA_VERSION_BY_KIND[
        kind as keyof typeof CURRENT_SERIALIZED_SCHEMA_VERSION_BY_KIND
      ];
      if (schemaVersion >= 1 && schemaVersion !== currentVersion) {
        const versionPattern = new RegExp(
          `"${token(["schema", "Version"])}"\\s*:\\s*${schemaVersion}`,
          "g",
        );
        versionPattern.lastIndex = sourceCursor;
        const versionMatch = versionPattern.exec(source);
        sourceCursor = versionPattern.lastIndex;
        matches.push({
          path: relativePath,
          line: lineAt(source, versionMatch?.index ?? 0),
          value: `${kind}@${schemaVersion}`,
        });
      }
    }
    for (const child of Object.values(candidate)) visit(child);
  };
  visit(parsed);
  return matches;
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
  for (const root of REQUIRED_CLEAN_BREAK_SCAN_ROOTS) {
    let rootStats;
    try {
      rootStats = await stat(path.join(repositoryRoot, root));
    } catch {
      throw new Error(
        `Unreleased clean-break required census root is unavailable: ${root}`,
      );
    }
    if (!rootStats.isDirectory()) {
      throw new Error(
        `Unreleased clean-break required census root is not a directory: ${root}`,
      );
    }
  }
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
  matchesByFamily.set("superseded-serialized-contracts", []);

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
    matchesByFamily.get("superseded-serialized-contracts")!.push(
      ...serializedContractMatches(source, relativePath),
    );
  }

  const allDefinitions = [
    ...definitions.slice(0, 2),
    {
      familyId: "superseded-serialized-contracts",
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
    "../..",
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
