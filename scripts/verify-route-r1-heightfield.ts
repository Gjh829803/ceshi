import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { parseAuthoringSpecV4 } from "@whitebox-world/authoring";
import { sha256CanonicalJson } from "@whitebox-world/protocol";
import {
  canonicalRouteOverlayV1,
  canonicalRouteRuntimeProbeReceiptV1,
  hashRouteRuntimeProbeReceiptV1,
  resolveTraversalGraphBuilderProfileV2,
} from "@whitebox-world/traversal";
import {
  OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V2,
  type ValidationReportStatusV1,
} from "@whitebox-world/validation";
import {
  projectPlannedRouteToCanonicalRouteV1,
  type PlannedRoute,
} from "@whitebox-world/world";
import { escapeRegExp, isEqual, isNil } from "lodash-es";

import {
  TRUSTED_ROUTE_RENDER_CADENCES_V1,
  runTrustedRouteValidationV1,
  type TrustedRouteRenderCadenceV1,
  type TrustedRouteValidationOptionsV1,
  type TrustedRouteValidationResultV1,
} from "./lib/route-validation-runner.js";

type RouteR1FixtureId =
  | "success"
  | "fail-wall"
  | "fail-slope"
  | "fail-width"
  | "fail-overhead"
  | "fail-water"
  | "fail-gap"
  | "fail-budget"
  | "fail-start-support"
  | "fail-start-surface"
  | "fail-outside-detour";

type RouteR1DiagnosticCode =
  | "ROUTE_REQUIRED_PATH_UNREACHABLE"
  | "ROUTE_SLOPE_EXCEEDED"
  | "ROUTE_CLEARANCE_WIDTH_INSUFFICIENT"
  | "ROUTE_OVERHEAD_CLEARANCE_INSUFFICIENT"
  | "ROUTE_SURFACE_GAP_EXCEEDED"
  | "ROUTE_GRAPH_BUDGET_EXCEEDED"
  | "ROUTE_START_SUPPORT_INVALID"
  | "ROUTE_START_SURFACE_NOT_FOUND";

interface RouteR1FixtureOracleV1 {
  readonly fixtureId: RouteR1FixtureId;
  readonly status: ValidationReportStatusV1;
  readonly primaryDiagnosticCode?: RouteR1DiagnosticCode;
}

export interface RouteR1FixtureVerificationV1
  extends RouteR1FixtureOracleV1 {
  readonly validationReportHash: `sha256:${string}`;
}

export interface RouteR1SuccessRenderCadenceResultV1 {
  readonly renderCadence: TrustedRouteRenderCadenceV1;
  readonly validationReportHash: `sha256:${string}`;
  readonly runtimeProbeReceiptHash: `sha256:${string}`;
  readonly finalRuntimeEvidenceHash: `sha256:${string}`;
  readonly processedTickCount: number;
  readonly renderFrameCount: number;
}

export interface RouteR1AdversarialCheckResultV1 {
  readonly checkId: string;
  readonly executedTestFullNames: readonly string[];
}

export interface RouteR1HeightfieldVerificationResultV1 {
  readonly ok: true;
  readonly fixtures: readonly RouteR1FixtureVerificationV1[];
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
  readonly plannerOnlyFieldsInCanonicalRoute: readonly string[];
  readonly providerIdentityLeaks: readonly string[];
  readonly scannedEvidenceKinds: readonly string[];
  readonly adversarialCheckIds: readonly string[];
  readonly adversarialCheckResults:
    readonly RouteR1AdversarialCheckResultV1[];
  readonly successRenderCadenceResults:
    readonly RouteR1SuccessRenderCadenceResultV1[];
}

const LOW_BUDGET_GRAPH_BUILDER_PROFILE_REF =
  "worldkit://traversal-graph-builder-profile/outdoor-humanoid.heightfield-r1-low-budget@1";

const FIXTURE_ORACLE = Object.freeze([
  { fixtureId: "success", status: "passed" },
  {
    fixtureId: "fail-wall",
    status: "failed",
    primaryDiagnosticCode: "ROUTE_REQUIRED_PATH_UNREACHABLE",
  },
  {
    fixtureId: "fail-slope",
    status: "failed",
    primaryDiagnosticCode: "ROUTE_SLOPE_EXCEEDED",
  },
  {
    fixtureId: "fail-width",
    status: "failed",
    primaryDiagnosticCode: "ROUTE_CLEARANCE_WIDTH_INSUFFICIENT",
  },
  {
    fixtureId: "fail-overhead",
    status: "failed",
    primaryDiagnosticCode: "ROUTE_OVERHEAD_CLEARANCE_INSUFFICIENT",
  },
  {
    fixtureId: "fail-water",
    status: "failed",
    primaryDiagnosticCode: "ROUTE_REQUIRED_PATH_UNREACHABLE",
  },
  {
    fixtureId: "fail-gap",
    status: "failed",
    primaryDiagnosticCode: "ROUTE_SURFACE_GAP_EXCEEDED",
  },
  {
    fixtureId: "fail-budget",
    status: "incomplete",
    primaryDiagnosticCode: "ROUTE_GRAPH_BUDGET_EXCEEDED",
  },
  {
    fixtureId: "fail-start-support",
    status: "failed",
    primaryDiagnosticCode: "ROUTE_START_SUPPORT_INVALID",
  },
  {
    fixtureId: "fail-start-surface",
    status: "failed",
    primaryDiagnosticCode: "ROUTE_START_SURFACE_NOT_FOUND",
  },
  {
    fixtureId: "fail-outside-detour",
    status: "failed",
    primaryDiagnosticCode: "ROUTE_REQUIRED_PATH_UNREACHABLE",
  },
] as const satisfies readonly RouteR1FixtureOracleV1[]);

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

const execFileAsync = promisify(execFile);

const ADVERSARIAL_ROUTE_CHECKS_V1 = Object.freeze([
  Object.freeze({
    checkId: "locked-capability-envelope-boundaries",
    testFile: "packages/traversal-recast/src/recast-config.test.ts",
    expectedTestFullNames: Object.freeze([
      "Recast tiled config mapping maps the locked slope limit below the unsupported vertical boundary",
      "Recast tiled config mapping keeps the locked capsule-clearance boundary coupled to the audited backend tuple",
    ]),
  }),
  Object.freeze({
    checkId: "lock-mismatch",
    testFile: "packages/validation/src/route-evaluator.test.ts",
    expectedTestFullNames: Object.freeze([
      "createRouteValidationReportV2 rejects mismatched Graph and Probe locks before evaluating either Gate",
    ]),
  }),
  Object.freeze({
    checkId: "graph-pass-runtime-stall",
    testFile: "scripts/lib/route-runtime-probe.integration.test.ts",
    expectedTestFullNames: Object.freeze([
      "Route R1 fixed-tick probe with real Recast and Babylon/Havok fails on a real wall even when the test deliberately reuses forged passing graph evidence",
    ]),
  }),
  Object.freeze({
    checkId: "support-loss",
    testFile: "scripts/lib/route-runtime-probe.integration.test.ts",
    expectedTestFullNames: Object.freeze([
      "Route R1 fixed-tick probe with real Recast and Babylon/Havok records real support loss after test-owned terrain support is withdrawn",
    ]),
  }),
  Object.freeze({
    checkId: "route-deviation",
    testFile: "packages/validation/src/route-runtime-probe.test.ts",
    expectedTestFullNames: Object.freeze([
      "runRouteRuntimeProbeV1 treats sliding as support and fails deviation only when it exceeds the threshold",
    ]),
  }),
  Object.freeze({
    checkId: "missing-probe-evidence",
    testFile: "packages/validation/src/route-evaluator.test.ts",
    expectedTestFullNames: Object.freeze([
      "createRouteValidationReportV2 keeps the Runtime gate and Report incomplete when canonical Probe evidence is absent",
    ]),
  }),
  Object.freeze({
    checkId: "render-cadence-30-60-120",
    testFile: "scripts/lib/route-runtime-probe.integration.test.ts",
    expectedTestFullNames: Object.freeze([
      "Route R1 fixed-tick probe with real Recast and Babylon/Havok keeps receipt and final world state identical across 30/60/120-like render cadences",
    ]),
  }),
] as const);

const SUCCESS_PLANNED_ROUTE: PlannedRoute = Object.freeze({
  id: "main-route",
  pointsMetersXZ: [[0, 4], [0, -4]] as const,
  widthMeters: 8,
  locomotionProfileRef:
    "worldkit://locomotion-profile/ground.standard@1",
  priority: "primary",
  maximumDesignSlopeDegrees: 35,
  evidence: "user-explicit",
});

function fixturePath(repositoryRoot: string, fixtureId: string): string {
  return path.join(
    repositoryRoot,
    "examples",
    "traversal",
    "r1-heightfield",
    `${fixtureId}.json`,
  );
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

function assertWaterEvidence(result: TrustedRouteValidationResultV1): void {
  const evidence = result.evidenceFiles.find(
    (file) => file.kind === "route-connectivity-failure",
  );
  assert.ok(!isNil(evidence), "fail-water must emit connectivity failure evidence.");
  const decoded = JSON.parse(new TextDecoder().decode(evidence.bytes)) as {
    reason?: { blockedWaterEntityIds?: unknown };
  };
  assert.deepEqual(
    decoded.reason?.blockedWaterEntityIds,
    ["water-blocker"],
    "fail-water must name the blocked Water entity in canonical evidence.",
  );
}

function assertBudgetProfileEvidence(
  result: TrustedRouteValidationResultV1,
): void {
  const profile = resolveTraversalGraphBuilderProfileV2(
    LOW_BUDGET_GRAPH_BUILDER_PROFILE_REF,
  );
  assert.equal(
    result.routeBuildInputReceipts.length,
    1,
    "fail-budget must compile exactly one locked Route BuildInput.",
  );
  const buildInputProfile =
    result.routeBuildInputReceipts[0]!.input.capabilityEnvelope;
  assert.deepEqual(
    {
      resourceRef: buildInputProfile.graphBuilderProfileRef,
      resolvedVersion: buildInputProfile.graphBuilderResolvedVersion,
      contentHash: buildInputProfile.graphBuilderProfileHash,
    },
    {
      resourceRef: profile.resourceRef,
      resolvedVersion: profile.resolvedVersion,
      contentHash: profile.contentHash,
    },
    "fail-budget BuildInput did not lock the low-budget Registry Profile.",
  );
  const evidence = result.evidenceFiles.find(
    (file) => file.kind === "route-connectivity-failure",
  );
  assert.ok(
    !isNil(evidence),
    "fail-budget must emit canonical connectivity failure evidence.",
  );
  const decoded = JSON.parse(new TextDecoder().decode(evidence.bytes)) as {
    graphBuilderProfileRef?: unknown;
    graphBuilderResolvedVersion?: unknown;
    graphBuilderProfileHash?: unknown;
    routeBuildInputHash?: unknown;
    reason?: {
      kind?: unknown;
      code?: unknown;
      maximumAllowedCount?: unknown;
      minimumRequiredCount?: unknown;
    };
  };
  assert.deepEqual(
    {
      resourceRef: decoded.graphBuilderProfileRef,
      resolvedVersion: decoded.graphBuilderResolvedVersion,
      contentHash: decoded.graphBuilderProfileHash,
    },
    {
      resourceRef: profile.resourceRef,
      resolvedVersion: profile.resolvedVersion,
      contentHash: profile.contentHash,
    },
    "fail-budget evidence did not lock the low-budget Registry Profile.",
  );
  assert.equal(
    decoded.routeBuildInputHash,
    result.routeBuildInputReceipts[0]!.routeBuildInputHash,
    "fail-budget evidence is not bound to its Route BuildInput.",
  );
  assert.deepEqual(decoded.reason, {
    kind: "node-budget-exceeded",
    code: "ROUTE_GRAPH_BUDGET_EXCEEDED",
    maximumAllowedCount: 16,
    minimumRequiredCount: 17,
  });
}

async function assertSuccessPlannerProjection(
  repositoryRoot: string,
): Promise<readonly string[]> {
  const parsed = parseAuthoringSpecV4(
    await readFile(fixturePath(repositoryRoot, "success"), "utf8"),
  );
  assert.equal(parsed.ok, true, "success must parse as Canonical Authoring V4.");
  assert.ok(!isNil(parsed.value), "success Authoring V4 value is missing.");
  const authoredRoute = parsed.value.spatial.routes.find(
    (route) => route.id === SUCCESS_PLANNED_ROUTE.id,
  );
  assert.ok(!isNil(authoredRoute), "success canonical Route is missing.");
  const projected = projectPlannedRouteToCanonicalRouteV1(
    SUCCESS_PLANNED_ROUTE,
  );
  assert.equal(
    isEqual(projected, authoredRoute),
    true,
    "success Route must equal the Planner-to-Canonical projection.",
  );
  return ["priority", "maximumDesignSlopeDegrees", "evidence"].filter(
    (field) => Object.hasOwn(projected, field),
  );
}

async function runFixture(
  repositoryRoot: string,
  oracle: RouteR1FixtureOracleV1,
  options: TrustedRouteValidationOptionsV1 = {},
): Promise<Readonly<{
  summary: RouteR1FixtureVerificationV1;
  trustedResult: TrustedRouteValidationResultV1;
}>> {
  const trustedResult = await runTrustedRouteValidationV1(
    fixturePath(repositoryRoot, oracle.fixtureId),
    options,
  );
  assert.equal(
    trustedResult.report.status,
    oracle.status,
    `${oracle.fixtureId} produced '${trustedResult.report.status}' instead of '${oracle.status}'.`,
  );
  const diagnosticCodes = reportDiagnosticCodes(trustedResult);
  if (isNil(oracle.primaryDiagnosticCode)) {
    assert.equal(
      trustedResult.report.diagnostics.some(
        (diagnostic) => diagnostic.severity === "error",
      ),
      false,
      `${oracle.fixtureId} unexpectedly emitted an error diagnostic.`,
    );
  } else {
    assert.equal(
      diagnosticCodes.has(oracle.primaryDiagnosticCode),
      true,
      `${oracle.fixtureId} did not emit ${oracle.primaryDiagnosticCode}; actual codes: ${[
        ...diagnosticCodes,
      ].join(", ")}.`,
    );
  }
  if (oracle.fixtureId === "fail-water") assertWaterEvidence(trustedResult);
  if (oracle.fixtureId === "fail-budget") {
    assertBudgetProfileEvidence(trustedResult);
  }
  return Object.freeze({
    summary: Object.freeze({
      ...oracle,
      validationReportHash: trustedResult.validationReportHash,
    }),
    trustedResult,
  });
}

function readRuntimeProbeReceipt(
  result: TrustedRouteValidationResultV1,
) {
  const evidence = result.evidenceFiles.find(
    (file) => file.kind === "route-runtime-probe-receipt",
  );
  assert.ok(
    !isNil(evidence),
    "success cadence validation must emit Runtime Probe evidence.",
  );
  return canonicalRouteRuntimeProbeReceiptV1(
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
): Promise<readonly RouteR1SuccessRenderCadenceResultV1[]> {
  const results: RouteR1SuccessRenderCadenceResultV1[] = [];
  for (const renderCadence of TRUSTED_ROUTE_RENDER_CADENCES_V1) {
    const run = await runFixture(repositoryRoot, FIXTURE_ORACLE[0], {
      renderCadence,
    });
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
        hashRouteRuntimeProbeReceiptV1(receipt) as `sha256:${string}`,
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

interface VitestJsonAssertionResultV1 {
  readonly fullName?: unknown;
  readonly status?: unknown;
}

interface VitestJsonTestResultV1 {
  readonly assertionResults?: unknown;
}

interface VitestJsonReportV1 {
  readonly success?: unknown;
  readonly numPassedTests?: unknown;
  readonly numFailedTests?: unknown;
  readonly testResults?: unknown;
}

function adversarialTestNotExecuted(
  checkId: string,
  detail: string,
): Error {
  return new Error(
    `ADVERSARIAL_CHECK_TEST_NOT_EXECUTED: '${checkId}' ${detail}`,
  );
}

export async function runExactAdversarialVitestCheckV1(options: Readonly<{
  repositoryRoot: string;
  checkId: string;
  testFile: string;
  expectedTestFullNames: readonly string[];
}>): Promise<RouteR1AdversarialCheckResultV1> {
  const expectedTestFullNames = [...options.expectedTestFullNames];
  if (
    expectedTestFullNames.length === 0 ||
    new Set(expectedTestFullNames).size !== expectedTestFullNames.length ||
    expectedTestFullNames.some((name) =>
      typeof name !== "string" || name.length === 0
    )
  ) {
    throw adversarialTestNotExecuted(
      options.checkId,
      "has an invalid exact-test contract.",
    );
  }
  const exactNamePattern = `^(?:${expectedTestFullNames
    .map((name) => escapeRegExp(name))
    .join("|")})$`;
  const { stdout } = await execFileAsync(
    "pnpm",
    [
      "vitest",
      "run",
      options.testFile,
      "-t",
      exactNamePattern,
      "--reporter=json",
    ],
    {
      cwd: options.repositoryRoot,
      env: { ...process.env, FORCE_COLOR: "0" },
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  let report: VitestJsonReportV1;
  try {
    report = JSON.parse(String(stdout)) as VitestJsonReportV1;
  } catch {
    throw adversarialTestNotExecuted(
      options.checkId,
      "did not emit a machine-readable Vitest report.",
    );
  }
  const testResults = Array.isArray(report.testResults)
    ? report.testResults as VitestJsonTestResultV1[]
    : [];
  const passedTestFullNames = testResults.flatMap((testResult) =>
    Array.isArray(testResult.assertionResults)
      ? (testResult.assertionResults as VitestJsonAssertionResultV1[])
        .filter((assertion) => assertion.status === "passed")
        .map((assertion) => assertion.fullName)
        .filter((name): name is string => typeof name === "string")
      : []
  );
  if (
    report.success !== true ||
    report.numFailedTests !== 0 ||
    report.numPassedTests !== expectedTestFullNames.length ||
    passedTestFullNames.length !== expectedTestFullNames.length ||
    !isEqual(
      [...passedTestFullNames].sort(),
      [...expectedTestFullNames].sort(),
    )
  ) {
    throw adversarialTestNotExecuted(
      options.checkId,
      `expected exactly ${expectedTestFullNames.length} passing test(s), ` +
        `observed ${String(report.numPassedTests)}.`,
    );
  }
  return Object.freeze({
    checkId: options.checkId,
    executedTestFullNames: Object.freeze([...passedTestFullNames]),
  });
}

async function runAdversarialRouteGate(
  repositoryRoot: string,
): Promise<readonly RouteR1AdversarialCheckResultV1[]> {
  const results: RouteR1AdversarialCheckResultV1[] = [];
  for (const check of ADVERSARIAL_ROUTE_CHECKS_V1) {
    results.push(await runExactAdversarialVitestCheckV1({
      repositoryRoot,
      checkId: check.checkId,
      testFile: check.testFile,
      expectedTestFullNames: check.expectedTestFullNames,
    }));
  }
  return Object.freeze(results);
}

export async function runRouteR1HeightfieldVerification(options: {
  readonly repositoryRoot: string;
}): Promise<RouteR1HeightfieldVerificationResultV1> {
  assert.equal(
    OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V2.resourceRef,
    "worldkit://validation-profile/outdoor-world-package-dev@1",
    "The R1 gate requires the frozen built-in Validation Profile.",
  );
  const plannerOnlyFieldsInCanonicalRoute =
    await assertSuccessPlannerProjection(options.repositoryRoot);

  const fixtureRuns: Awaited<ReturnType<typeof runFixture>>[] = [];
  for (const oracle of FIXTURE_ORACLE) {
    fixtureRuns.push(await runFixture(
      options.repositoryRoot,
      oracle,
      oracle.fixtureId === "fail-budget"
        ? { graphBuilderProfileRef: LOW_BUDGET_GRAPH_BUILDER_PROFILE_REF }
        : {},
    ));
  }
  const success = fixtureRuns[0]!;
  const repeatSuccess = await runFixture(
    options.repositoryRoot,
    FIXTURE_ORACLE[0],
  );
  const concurrentSuccess = await Promise.all([
    runFixture(options.repositoryRoot, FIXTURE_ORACLE[0]),
    runFixture(options.repositoryRoot, FIXTURE_ORACLE[0]),
  ]);
  const successRenderCadenceResults = await runSuccessRenderCadenceMatrix(
    options.repositoryRoot,
  );
  const adversarialCheckResults = await runAdversarialRouteGate(
    options.repositoryRoot,
  );
  const adversarialCheckIds = adversarialCheckResults.map(
    (result) => result.checkId,
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
        ? canonicalRouteOverlayV1(decoded)
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

  const graphGate = success.trustedResult.report
    .gateResultsById["route-connectivity"];
  const runtimeGate = success.trustedResult.report
    .gateResultsById["route-runtime-conformance"];
  assert.ok(!isNil(graphGate), "success Graph Route gate is missing.");
  assert.ok(!isNil(runtimeGate), "success Runtime Route gate is missing.");
  assert.equal(graphGate.status, "passed", "success Graph Route gate did not pass.");
  assert.equal(runtimeGate.status, "passed", "success Runtime Route gate did not pass.");
  assert.equal(plannerOnlyFieldsInCanonicalRoute.length, 0);
  assert.equal(providerIdentityLeaks.size, 0);
  assert.equal(
    repeatSuccess.summary.validationReportHash,
    success.summary.validationReportHash,
    "Repeated success validation is not deterministic.",
  );
  assert.deepEqual(
    concurrentSuccess.map((run) => run.summary.validationReportHash),
    [success.summary.validationReportHash, success.summary.validationReportHash],
    "Concurrent success validation is not deterministic.",
  );

  return Object.freeze({
    ok: true,
    fixtures: Object.freeze(fixtureRuns.map((run) => run.summary)),
    successReportHash: success.summary.validationReportHash,
    repeatSuccessReportHash: repeatSuccess.summary.validationReportHash,
    concurrentSuccessReportHashes: Object.freeze([
      concurrentSuccess[0]!.summary.validationReportHash,
      concurrentSuccess[1]!.summary.validationReportHash,
    ] as const),
    successRouteGateStatuses: Object.freeze({
      graph: "passed",
      runtime: "passed",
    }),
    plannerOnlyFieldsInCanonicalRoute: Object.freeze([
      ...plannerOnlyFieldsInCanonicalRoute,
    ]),
    providerIdentityLeaks: Object.freeze([...providerIdentityLeaks].sort()),
    scannedEvidenceKinds: Object.freeze([...scannedEvidenceKinds].sort()),
    adversarialCheckIds: Object.freeze(adversarialCheckIds),
    adversarialCheckResults,
    successRenderCadenceResults,
  });
}

async function main(): Promise<void> {
  const repositoryRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  const result = await runRouteR1HeightfieldVerification({ repositoryRoot });
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
