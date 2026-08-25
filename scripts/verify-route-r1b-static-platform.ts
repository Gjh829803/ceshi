import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseAuthoringSpecV4 } from "@whitebox-world/authoring";
import { sha256CanonicalJson } from "@whitebox-world/protocol";
import {
  canonicalRouteOverlayV2,
  canonicalRouteRuntimeProbeReceiptV2,
  canonicalTraversalGraphV2,
  hashRouteRuntimeProbeReceiptV2,
  hashTraversalGraphV2,
} from "@whitebox-world/traversal";
import {
  OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V2,
  type ValidationReportStatusV1,
} from "@whitebox-world/validation";
import { isEmpty, isEqual, isNil } from "lodash-es";

import {
  TRUSTED_ROUTE_RENDER_CADENCES_V1,
  runTrustedRouteValidationV1,
  type TrustedRouteRenderCadenceV1,
  type TrustedRouteValidationOptionsV1,
  type TrustedRouteValidationResultV1,
} from "./lib/route-validation-runner.js";

type GateOutcome =
  | Readonly<{ status: "passed" }>
  | Readonly<{ status: "failed"; diagnosticCode: string }>
  | Readonly<{ status: "incomplete"; diagnosticCode?: string }>;

export interface RouteR1bFixtureOracle {
  readonly fixtureId: string;
  readonly graph: GateOutcome;
  readonly runtime: GateOutcome;
}

export interface RouteR1bFixtureVerification extends RouteR1bFixtureOracle {
  readonly validationReportHash: `sha256:${string}`;
}

export interface LegacyRouteConsumerCensus {
  readonly roots: readonly string[];
  readonly symbolFamilyPattern: string;
  readonly deletedFields: readonly string[];
  readonly historicalExclusions: readonly string[];
  readonly matchCount: number;
  readonly matchedPaths: readonly string[];
}

export interface RouteR1bSuccessRenderCadenceResult {
  readonly renderCadence: TrustedRouteRenderCadenceV1;
  readonly validationReportHash: `sha256:${string}`;
  readonly runtimeProbeReceiptHash: `sha256:${string}`;
  readonly finalRuntimeEvidenceHash: `sha256:${string}`;
  readonly processedTickCount: number;
  readonly renderFrameCount: number;
}

export interface RouteR1bStaticPlatformVerificationResult {
  readonly ok: true;
  readonly fixtures: readonly RouteR1bFixtureVerification[];
  readonly legacyConsumerCensus: LegacyRouteConsumerCensus;
  readonly successReportHash: `sha256:${string}`;
  readonly repeatSuccessReportHash: `sha256:${string}`;
  readonly concurrentSuccessReportHashes: readonly [
    `sha256:${string}`,
    `sha256:${string}`,
  ];
  readonly successRouteGateStatuses: Readonly<{
    graph: ValidationReportStatusV1;
    runtime: ValidationReportStatusV1;
  }>;
  readonly providerIdentityLeaks: readonly string[];
  readonly scannedEvidenceKinds: readonly string[];
  readonly successRenderCadenceResults: readonly RouteR1bSuccessRenderCadenceResult[];
}

function joinToken(parts: readonly string[]): string {
  return parts.join("");
}

export function legacyRouteConsumerSymbolFamilyPattern(): string {
  const ident = "[A-Za-z0-9_]*";
  const heightfield = joinToken(["Height", "field"]);
  const alternatives = [
    `${ident}${heightfield}${joinToken(["Route", "Build", "Input"])}${ident}V1`,
    `${heightfield}${joinToken(["Route", "Terrain", "Source", "V1"])}`,
    `${heightfield}${joinToken(["Route", "Build", "Budget", "Evidence", "V1"])}`,
    joinToken(["Static", "Blocking", "Collider", "V1"]),
    `${ident}${joinToken(["Required", "Height", "field", "Route"])}${ident}V1`,
    `${ident}${heightfield}${joinToken(["Route", "Connectivity", "Result"])}${ident}V1`,
    `${ident}${heightfield}${joinToken(["Traversal", "Graph"])}${ident}V1`,
    `${ident}${joinToken(["Query", "Required", "Route"])}${ident}V1`,
    `${ident}${joinToken(["Traversal", "Graph", "V1"])}`,
    `${ident}${joinToken(["Route", "Path", "Receipt"])}${ident}V1`,
    `${ident}${joinToken(["Route", "Overlay"])}${ident}V1`,
    `${ident}${joinToken(["Route", "Connectivity"])}(?:${joinToken(["Fail", "ure"])}|${joinToken(["Unavail", "able"])}|${joinToken(["Comple", "te"])})${ident}V1`,
    joinToken(["ROUTE_", "CONNECTIVITY_", "FAILURE_", "CODES_", "V1"]),
    `${ident}${joinToken(["Route", "Runtime", "Probe"])}${ident}V1`,
    joinToken(["ROUTE_", "RUNTIME_", "PROBE_", "ERROR_", "CODES_", "V1"]),
    joinToken([
      "Route",
      "Connectivity",
      "Operation",
      "Aborted",
      "Error",
      "V1",
    ]),
    joinToken(["query", "Required", "Route", "V1"]),
    `${ident}${joinToken(["Route", "Threshold", "Rejection"])}(?:${joinToken(["Pro", "of"])}|${joinToken(["Reas", "on"])})${ident}V1`,
    `${ident}${joinToken(["Route", "Evidence"])}(?:${joinToken(["Publicat", "ion"])}|${joinToken(["Project", "ion"])})${ident}V1`,
    joinToken(["Worldkit", "Browser", "Api", "V4"]),
    joinToken(["blocking", "Collider", "Identities"]),
    joinToken(["heightfield", "-tile-", "estimate"]),
    joinToken(["not-required-", "empty-", "source"]),
  ];
  return String.raw`\b(?:${alternatives.join("|")})\b`;
}

export const LEGACY_ROUTE_CONSUMER_CENSUS_ROOTS = Object.freeze([
  "packages",
  "apps",
  "scripts",
  "examples",
  "README.md",
  "docs/17-canonical-json-quickstart.md",
] as const);

export const LEGACY_ROUTE_CONSUMER_HISTORICAL_EXCLUSIONS = Object.freeze([
  "docs/reviews",
  "docs/superpowers",
] as const);

export const LEGACY_ROUTE_DELETED_FIELDS = Object.freeze([
  joinToken(["blocking", "Collider", "Identities"]),
  joinToken(["heightfield", "-tile-", "estimate"]),
  joinToken(["not-required-", "empty-", "source"]),
] as const);

export const R1B_STATIC_PLATFORM_FIXTURE_ORACLE: readonly RouteR1bFixtureOracle[] =
  Object.freeze([
    Object.freeze({
      fixtureId: "success-steps-platform-ramp",
      graph: Object.freeze({ status: "passed" as const }),
      runtime: Object.freeze({ status: "passed" as const }),
    }),
    Object.freeze({
      fixtureId: "fail-step-height",
      graph: Object.freeze({
        status: "failed" as const,
        diagnosticCode: "ROUTE_STEP_HEIGHT_EXCEEDED",
      }),
      runtime: Object.freeze({ status: "incomplete" as const }),
    }),
    Object.freeze({
      fixtureId: "fail-surface-gap",
      graph: Object.freeze({
        status: "failed" as const,
        diagnosticCode: "ROUTE_SURFACE_GAP_EXCEEDED",
      }),
      runtime: Object.freeze({ status: "incomplete" as const }),
    }),
    Object.freeze({
      fixtureId: "fail-narrow-tread",
      graph: Object.freeze({
        status: "failed" as const,
        diagnosticCode: "ROUTE_CLEARANCE_WIDTH_INSUFFICIENT",
      }),
      runtime: Object.freeze({ status: "incomplete" as const }),
    }),
    Object.freeze({
      fixtureId: "fail-low-overhead",
      graph: Object.freeze({
        status: "failed" as const,
        diagnosticCode: "ROUTE_OVERHEAD_CLEARANCE_INSUFFICIENT",
      }),
      runtime: Object.freeze({ status: "incomplete" as const }),
    }),
    Object.freeze({
      fixtureId: "fail-missing-surface-profile",
      graph: Object.freeze({
        status: "incomplete" as const,
        diagnosticCode: "ROUTE_SURFACE_PROFILE_MISSING",
      }),
      runtime: Object.freeze({ status: "incomplete" as const }),
    }),
    Object.freeze({
      fixtureId: "fail-wrong-collider-binding",
      graph: Object.freeze({
        status: "incomplete" as const,
        diagnosticCode: "ROUTE_SURFACE_CORRELATION_MISSING",
      }),
      runtime: Object.freeze({ status: "incomplete" as const }),
    }),
    Object.freeze({
      fixtureId: "fail-wrong-runtime-surface",
      graph: Object.freeze({ status: "passed" as const }),
      runtime: Object.freeze({
        status: "failed" as const,
        diagnosticCode: "ROUTE_RUNTIME_SUPPORT_SURFACE_MISMATCH",
      }),
    }),
    Object.freeze({
      fixtureId: "fail-platform-edge-fall",
      graph: Object.freeze({ status: "passed" as const }),
      runtime: Object.freeze({
        status: "failed" as const,
        diagnosticCode: "ROUTE_RUNTIME_SUPPORT_LOST",
      }),
    }),
    Object.freeze({
      fixtureId: "fail-overlapping-surfaces",
      graph: Object.freeze({
        status: "incomplete" as const,
        diagnosticCode: "ROUTE_SURFACE_CORRELATION_AMBIGUOUS",
      }),
      runtime: Object.freeze({ status: "incomplete" as const }),
    }),
    Object.freeze({
      fixtureId: "fail-runtime-overlapping-surfaces",
      graph: Object.freeze({ status: "passed" as const }),
      runtime: Object.freeze({
        status: "failed" as const,
        diagnosticCode: "ROUTE_RUNTIME_SUPPORT_SURFACE_MISMATCH",
      }),
    }),
  ]);

const FORBIDDEN_PROVIDER_HANDLE_KEYS = new Set([
  "babylonHandle",
  "havokBodyHandle",
  "nativeHandle",
  "physicsBodyHandle",
  "providerHandle",
  "providerPolygonRef",
  "polygonRef",
  "tileRef",
  "wasmPointer",
]);

const TEXT_FILE_EXTENSIONS = new Set([
  ".cjs",
  ".cts",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".mts",
  ".ts",
  ".tsx",
]);

const SKIP_DIRECTORY_NAMES = new Set([
  ".git",
  ".turbo",
  "coverage",
  "dist",
  "node_modules",
]);

function fixturePath(repositoryRoot: string, fixtureId: string): string {
  return path.join(
    repositoryRoot,
    "examples",
    "traversal",
    "r1b-static-platform",
    `${fixtureId}.world.json`,
  );
}

function relativePosixPath(repositoryRoot: string, filePath: string): string {
  return path.relative(repositoryRoot, filePath).split(path.sep).join("/");
}

function collectCensusFiles(repositoryRoot: string, relativeRoot: string): string[] {
  const absoluteRoot = path.join(repositoryRoot, relativeRoot);
  const rootStats = statSync(absoluteRoot);
  if (rootStats.isFile()) {
    return [absoluteRoot];
  }
  const files: string[] = [];
  const stack = [absoluteRoot];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRECTORY_NAMES.has(entry.name)) {
          stack.push(path.join(current, entry.name));
        }
        continue;
      }
      if (!entry.isFile()) continue;
      const extension = path.extname(entry.name);
      if (!TEXT_FILE_EXTENSIONS.has(extension) && entry.name !== "README.md") {
        continue;
      }
      files.push(path.join(current, entry.name));
    }
  }
  return files;
}

export function censusLegacyRouteConsumers(options: {
  readonly repositoryRoot: string;
}): LegacyRouteConsumerCensus {
  const symbolFamilyPattern = legacyRouteConsumerSymbolFamilyPattern();
  const matchedPathSet = new Set<string>();
  let matchCount = 0;
  const files = LEGACY_ROUTE_CONSUMER_CENSUS_ROOTS.flatMap((root) =>
    collectCensusFiles(options.repositoryRoot, root),
  ).sort((left, right) =>
    relativePosixPath(options.repositoryRoot, left).localeCompare(
      relativePosixPath(options.repositoryRoot, right),
    ),
  );
  for (const filePath of files) {
    const text = readFileSync(filePath, "utf8");
    const hits = text.match(new RegExp(symbolFamilyPattern, "g"));
    if (isNil(hits) || hits.length === 0) continue;
    matchCount += hits.length;
    matchedPathSet.add(relativePosixPath(options.repositoryRoot, filePath));
  }
  return Object.freeze({
    roots: LEGACY_ROUTE_CONSUMER_CENSUS_ROOTS,
    symbolFamilyPattern,
    deletedFields: LEGACY_ROUTE_DELETED_FIELDS,
    historicalExclusions: LEGACY_ROUTE_CONSUMER_HISTORICAL_EXCLUSIONS,
    matchCount,
    matchedPaths: Object.freeze([...matchedPathSet]),
  });
}

function findForbiddenProviderHandleKeys(
  value: unknown,
  found = new Set<string>(),
): ReadonlySet<string> {
  if (Array.isArray(value)) {
    for (const item of value) findForbiddenProviderHandleKeys(item, found);
    return found;
  }
  if (isNil(value) || typeof value !== "object") return found;
  for (const [key, nestedValue] of Object.entries(value)) {
    if (FORBIDDEN_PROVIDER_HANDLE_KEYS.has(key)) found.add(key);
    findForbiddenProviderHandleKeys(nestedValue, found);
  }
  return found;
}

function reportDiagnosticCodes(
  result: TrustedRouteValidationResultV1,
): ReadonlySet<string> {
  return new Set(result.report.diagnostics.map((diagnostic) => diagnostic.code));
}

function assertGateOutcome(
  fixtureId: string,
  lane: "graph" | "runtime",
  actualStatus: string | undefined,
  actualCodes: ReadonlySet<string>,
  expected: GateOutcome,
): void {
  assert.ok(!isNil(actualStatus), `${fixtureId} ${lane} gate is missing.`);
  assert.equal(
    actualStatus,
    expected.status,
    `${fixtureId} ${lane} produced '${actualStatus}' instead of '${expected.status}'.`,
  );
  if ("diagnosticCode" in expected && !isNil(expected.diagnosticCode)) {
    assert.equal(
      actualCodes.has(expected.diagnosticCode),
      true,
      `${fixtureId} ${lane} did not emit ${expected.diagnosticCode}; actual codes: ${[
        ...actualCodes,
      ].join(", ")}.`,
    );
  }
}

async function parseSuccessAuthoring(repositoryRoot: string): Promise<void> {
  const parsed = parseAuthoringSpecV4(
    await readFile(
      fixturePath(repositoryRoot, "success-steps-platform-ramp"),
      "utf8",
    ),
  );
  assert.equal(parsed.ok, true, "success must parse as Canonical Authoring V4.");
  assert.ok(!isNil(parsed.value), "success Authoring V4 value is missing.");
}

async function assertRouteR0ContractGraphV2(repositoryRoot: string): Promise<void> {
  const contract = JSON.parse(
    await readFile(
      path.join(repositoryRoot, "examples", "traversal", "route-r0-contract.json"),
      "utf8",
    ),
  ) as {
    readonly graph: unknown;
    readonly traversalGraphHash: unknown;
  };
  const canonical = canonicalTraversalGraphV2(contract.graph);
  assert.equal(canonical.schemaVersion, 2);
  assert.equal(hashTraversalGraphV2(contract.graph), contract.traversalGraphHash);
}

async function runFixture(
  repositoryRoot: string,
  oracle: RouteR1bFixtureOracle,
  options: TrustedRouteValidationOptionsV1 = {},
): Promise<Readonly<{
  summary: RouteR1bFixtureVerification;
  trustedResult: TrustedRouteValidationResultV1;
}>> {
  const trustedResult = await runTrustedRouteValidationV1(
    fixturePath(repositoryRoot, oracle.fixtureId),
    options,
  );
  const diagnosticCodes = reportDiagnosticCodes(trustedResult);
  const graphGate = trustedResult.report.gateResultsById["route-connectivity"];
  const runtimeGate = trustedResult.report.gateResultsById["route-runtime-conformance"];
  assertGateOutcome(
    oracle.fixtureId,
    "graph",
    graphGate?.status,
    diagnosticCodes,
    oracle.graph,
  );
  assertGateOutcome(
    oracle.fixtureId,
    "runtime",
    runtimeGate?.status,
    diagnosticCodes,
    oracle.runtime,
  );
  return Object.freeze({
    summary: Object.freeze({
      ...oracle,
      validationReportHash: trustedResult.validationReportHash,
    }),
    trustedResult,
  });
}

function readRuntimeProbeReceipt(result: TrustedRouteValidationResultV1) {
  const evidence = result.evidenceFiles.find(
    (file) => file.kind === "route-runtime-probe-receipt",
  );
  assert.ok(
    !isNil(evidence),
    "success cadence validation must emit Runtime Probe evidence.",
  );
  return canonicalRouteRuntimeProbeReceiptV2(
    JSON.parse(new TextDecoder().decode(evidence.bytes)),
  );
}

function expectedRenderFrameCount(
  renderCadence: TrustedRouteRenderCadenceV1,
  processedTickCount: number,
): number {
  if (renderCadence === "30-like") return Math.floor(processedTickCount / 2);
  if (renderCadence === "60-like") return processedTickCount;
  if (renderCadence === "120-like") return processedTickCount * 2;
  assert.fail(`Unsupported trusted render cadence '${renderCadence}'.`);
}

async function runSuccessRenderCadenceMatrix(
  repositoryRoot: string,
): Promise<readonly RouteR1bSuccessRenderCadenceResult[]> {
  const results: RouteR1bSuccessRenderCadenceResult[] = [];
  for (const renderCadence of TRUSTED_ROUTE_RENDER_CADENCES_V1) {
    const run = await runFixture(
      repositoryRoot,
      R1B_STATIC_PLATFORM_FIXTURE_ORACLE[0]!,
      { renderCadence },
    );
    const receipt = readRuntimeProbeReceipt(run.trustedResult);
    assert.equal(receipt.status, "complete");
    const finalTick = receipt.ticks.at(-1);
    assert.ok(!isNil(finalTick), "success cadence Probe has no final tick.");
    const scheduling = run.trustedResult.hostRenderScheduleStats;
    assert.ok(
      !isNil(scheduling),
      "success cadence Host scheduling receipt is missing.",
    );
    assert.equal(scheduling.renderCadence, renderCadence);
    assert.equal(
      scheduling.fixedTickCount,
      receipt.metrics.processedTickCount,
      "Host render scheduling did not observe every fixed Probe tick.",
    );
    assert.equal(
      scheduling.renderFrameCount,
      expectedRenderFrameCount(renderCadence, receipt.metrics.processedTickCount),
      `Host render cadence '${renderCadence}' produced the wrong frame count.`,
    );
    results.push(Object.freeze({
      renderCadence,
      validationReportHash: run.summary.validationReportHash,
      runtimeProbeReceiptHash:
        hashRouteRuntimeProbeReceiptV2(receipt) as `sha256:${string}`,
      finalRuntimeEvidenceHash:
        sha256CanonicalJson(finalTick.runtimeEvidence) as `sha256:${string}`,
      processedTickCount: receipt.metrics.processedTickCount,
      renderFrameCount: scheduling.renderFrameCount,
    }));
  }
  assert.equal(
    new Set(results.map((result) => result.validationReportHash)).size,
    1,
    "success Validation Report changed across render cadences.",
  );
  assert.equal(
    new Set(results.map((result) => result.runtimeProbeReceiptHash)).size,
    1,
    "success Runtime Probe Receipt changed across render cadences.",
  );
  assert.equal(
    new Set(results.map((result) => result.finalRuntimeEvidenceHash)).size,
    1,
    "success final Runtime evidence changed across render cadences.",
  );
  return Object.freeze(results);
}

export async function runRouteR1bStaticPlatformVerification(options: {
  readonly repositoryRoot: string;
}): Promise<RouteR1bStaticPlatformVerificationResult> {
  assert.equal(
    OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V2.resourceRef,
    "worldkit://validation-profile/outdoor-world-package-dev@1",
    "The R1b gate requires the frozen built-in Validation Profile.",
  );
  await parseSuccessAuthoring(options.repositoryRoot);
  await assertRouteR0ContractGraphV2(options.repositoryRoot);
  const legacyConsumerCensus = censusLegacyRouteConsumers(options);
  assert.equal(
    legacyConsumerCensus.matchCount,
    0,
    `legacy Route consumer census still matches ${legacyConsumerCensus.matchCount} symbol(s) in ${legacyConsumerCensus.matchedPaths.join(", ")}.`,
  );
  assert.equal(isEmpty(legacyConsumerCensus.matchedPaths), true);

  const fixtureRuns: Awaited<ReturnType<typeof runFixture>>[] = [];
  for (const oracle of R1B_STATIC_PLATFORM_FIXTURE_ORACLE) {
    const run = await runFixture(
      options.repositoryRoot,
      oracle,
      oracle.fixtureId === "fail-wrong-collider-binding"
        ? {
          fixtureFaultInjection: {
            kind: "inject-surface-correlation-miss",
          },
        }
        : oracle.fixtureId === "fail-platform-edge-fall"
        ? {
          fixtureFaultInjection: {
            kind: "withdraw-static-support-after-reset",
            supportEntityId: "terrain-main",
          },
        }
        : {},
    );
    fixtureRuns.push(run);
  }
  const success = fixtureRuns[0]!;
  const repeatSuccess = await runFixture(
    options.repositoryRoot,
    R1B_STATIC_PLATFORM_FIXTURE_ORACLE[0]!,
  );
  const concurrentSuccess = await Promise.all([
    runFixture(options.repositoryRoot, R1B_STATIC_PLATFORM_FIXTURE_ORACLE[0]!),
    runFixture(options.repositoryRoot, R1B_STATIC_PLATFORM_FIXTURE_ORACLE[0]!),
  ]);
  const successRenderCadenceResults = await runSuccessRenderCadenceMatrix(
    options.repositoryRoot,
  );

  const providerIdentityLeaks = new Set<string>();
  const scannedEvidenceKinds = new Set<string>();
  for (const run of [
    ...fixtureRuns,
    repeatSuccess,
    ...concurrentSuccess,
  ]) {
    for (const key of findForbiddenProviderHandleKeys(run.trustedResult.report)) {
      providerIdentityLeaks.add(key);
    }
    for (const evidence of run.trustedResult.evidenceFiles) {
      const decoded = JSON.parse(new TextDecoder().decode(evidence.bytes)) as unknown;
      const canonicalEvidence = evidence.kind === "route-overlay"
        ? canonicalRouteOverlayV2(decoded)
        : decoded;
      scannedEvidenceKinds.add(evidence.kind);
      for (const key of findForbiddenProviderHandleKeys(canonicalEvidence)) {
        providerIdentityLeaks.add(key);
      }
    }
  }
  assert.ok(
    scannedEvidenceKinds.has("route-overlay"),
    "Provider isolation scan did not inspect canonical Route Overlay evidence.",
  );
  assert.equal(providerIdentityLeaks.size, 0);
  assert.equal(
    repeatSuccess.summary.validationReportHash,
    success.summary.validationReportHash,
    "Repeated success validation is not deterministic.",
  );
  assert.equal(
    isEqual(
      concurrentSuccess.map((run) => run.summary.validationReportHash),
      [success.summary.validationReportHash, success.summary.validationReportHash],
    ),
    true,
    "Concurrent success validation is not deterministic.",
  );

  return Object.freeze({
    ok: true,
    fixtures: Object.freeze(fixtureRuns.map((run) => run.summary)),
    legacyConsumerCensus,
    successReportHash: success.summary.validationReportHash,
    repeatSuccessReportHash: repeatSuccess.summary.validationReportHash,
    concurrentSuccessReportHashes: Object.freeze([
      concurrentSuccess[0]!.summary.validationReportHash,
      concurrentSuccess[1]!.summary.validationReportHash,
    ] as const),
    successRouteGateStatuses: Object.freeze({
      graph: "passed" as const,
      runtime: "passed" as const,
    }),
    providerIdentityLeaks: Object.freeze([...providerIdentityLeaks].sort()),
    scannedEvidenceKinds: Object.freeze([...scannedEvidenceKinds].sort()),
    successRenderCadenceResults,
  });
}

async function main(): Promise<void> {
  const repositoryRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  const result = await runRouteR1bStaticPlatformVerification({ repositoryRoot });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

const executedPath = process.argv[1];
if (
  !isNil(executedPath) &&
  path.resolve(executedPath) === fileURLToPath(import.meta.url)
) {
  void main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}
