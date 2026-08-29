import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  cp,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Browser, BrowserContext, Page } from "playwright";

import {
  parseAuthoringSpecV4,
  resolveAuthoringLayoutV4,
  sha256CanonicalJson,
  stringifyCanonicalJson,
  type AuthoringSpecV4,
  type NormalizedWorldIRV4,
} from "@whitebox-world/authoring";
import type {
  CanonicalSceneExecutionPlanV1,
  WorldRuntimeBootstrapV1,
  WorldRuntimeSnapshotV4,
  WorldkitBrowserDiagnosticV1,
} from "@whitebox-world/runtime-contracts";

import {
  solveLayoutV1,
  type LayoutSolveReportV1,
  type ResolvedLayoutInputV1,
} from "../../packages/layout-solver/src/index.js";
import {
  finalizeArtifactDirectory,
  parseArtifactPublicationMode,
  type ArtifactPublicationMode,
} from "../lib/artifact-directory-promotion";
import { layoutSolveFile } from "../lib/layout-artifacts";
import { launchChromiumWithSystemFallback } from "../lib/playwright-browser-launch";
import { loadWorldkitRoutePipeline } from "../lib/worldkit-pipeline";
import { startWorldkitServer } from "../lib/worldkit-server";
import { captureVisibleWorldWithRetries } from "../cli/worldkit";

interface PlacementReportEnvelopeV1 {
  readonly status: "solved" | "unsatisfied" | "budget-exceeded" | "invalid-input";
  readonly diagnostics: readonly Readonly<{ readonly code: string }>[];
}

interface PlacementMutationIdentityV1 {
  readonly seed: number;
  readonly layout: Readonly<{ readonly solverProfileRef: string }>;
  readonly world: Readonly<{ readonly bounds: unknown }>;
}

export type PlacementVerificationFailureCodeV1 =
  | "PLACEMENT_REPORT_MISSING"
  | "PLACEMENT_REPORT_HASH_MISMATCH"
  | "PLACEMENT_REQUIRED_CONSTRAINT_UNSATISFIED"
  | "PLACEMENT_SOLVER_BUDGET_EXCEEDED"
  | "PLACEMENT_INPUT_INVALID"
  | "PLACEMENT_REPORT_SEED_MISMATCH"
  | "PLACEMENT_REPORT_PROFILE_MISMATCH"
  | "PLACEMENT_REPORT_BOUNDS_MISMATCH";

export function verifyPlacementReportEnvelope(
  report: PlacementReportEnvelopeV1 | undefined,
  expectedLayoutSolveReportHash: string,
):
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; code: PlacementVerificationFailureCodeV1 }> {
  if (report === undefined) {
    return { ok: false, code: "PLACEMENT_REPORT_MISSING" };
  }
  if (sha256CanonicalJson(report) !== expectedLayoutSolveReportHash) {
    return { ok: false, code: "PLACEMENT_REPORT_HASH_MISMATCH" };
  }
  if (report.status === "solved") return { ok: true };
  if (report.status === "budget-exceeded") {
    return { ok: false, code: "PLACEMENT_SOLVER_BUDGET_EXCEEDED" };
  }
  if (
    report.status === "unsatisfied" &&
    report.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "PLACEMENT_REQUIRED_CONSTRAINT_UNSATISFIED",
    )
  ) {
    return {
      ok: false,
      code: "PLACEMENT_REQUIRED_CONSTRAINT_UNSATISFIED",
    };
  }
  return { ok: false, code: "PLACEMENT_INPUT_INVALID" };
}

export function placementMutationCode(
  baseline: PlacementMutationIdentityV1,
  candidate: PlacementMutationIdentityV1,
): PlacementVerificationFailureCodeV1 | undefined {
  if (candidate.seed !== baseline.seed) {
    return "PLACEMENT_REPORT_SEED_MISMATCH";
  }
  if (
    candidate.layout.solverProfileRef !== baseline.layout.solverProfileRef
  ) {
    return "PLACEMENT_REPORT_PROFILE_MISMATCH";
  }
  if (
    JSON.stringify(candidate.world.bounds) !==
    JSON.stringify(baseline.world.bounds)
  ) {
    return "PLACEMENT_REPORT_BOUNDS_MISMATCH";
  }
  return undefined;
}

const REPOSITORY_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const INPUT_PATH = path.join(
  REPOSITORY_ROOT,
  "examples/authoring/placement-coastal-world.json",
);
const TARGET_ARTIFACT_DIRECTORY = path.join(
  REPOSITORY_ROOT,
  "examples/evidence/placement-coastal-world",
);
const ARTIFACT_FILENAMES = [
  "layout-report.json",
  "normalized-world-ir.json",
  "verification.json",
  "world.build.json",
  "world.png",
] as const;
const PLACED_ENTITY_IDS = [
  "composition-focus",
  "lighthouse",
  "sea-arch",
  "spawn-main",
  "watchtower",
] as const;
const LANDMARK_ENTITY_IDS = ["lighthouse", "sea-arch", "watchtower"] as const;
const REQUIRED_CONSTRAINT_KINDS = [
  "distance-range",
  "faces-entity",
  "inside-region",
  "minimum-clearance",
  "outside-region",
  "supported-by",
  "visible-in-camera-region",
  "within-slope-limit",
] as const;

interface WorldBuildArtifactV4 {
  readonly kind: "worldkit-build-artifact";
  readonly schemaVersion: 4;
  readonly normalizedWorldIrHash: string;
  readonly executionPlanHash: string;
  readonly normalizedWorldIr: NormalizedWorldIRV4;
  readonly executionPlan: CanonicalSceneExecutionPlanV1;
  readonly worldRuntimeBootstrap: WorldRuntimeBootstrapV1;
}

interface BrowserEvidenceV1 {
  readonly snapshot: WorldRuntimeSnapshotV4;
  readonly diagnostics: readonly WorldkitBrowserDiagnosticV1[];
  readonly apiKeys: readonly string[];
  readonly screenshotBytes: Buffer;
  readonly sampledRgbColorCount: number;
}

function parseJson<T>(bytes: string, label: string): T {
  try {
    return JSON.parse(bytes) as T;
  } catch (error) {
    throw new Error(`${label} is not valid JSON.`, { cause: error });
  }
}

function hashBytes(bytes: string | Buffer): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function inspectPng(bytes: Buffer): { width: number; height: number } {
  assert.ok(bytes.length >= 24, "Placement screenshot is too small.");
  assert.ok(
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    "Placement screenshot is not a PNG.",
  );
  assert.equal(bytes.subarray(12, 16).toString("ascii"), "IHDR");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await stat(targetPath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function artifactDirectoryFingerprint(
  directory: string,
): Promise<Readonly<Record<string, string>> | undefined> {
  if (!(await pathExists(directory))) return undefined;
  const entries = await readdir(directory, { withFileTypes: true });
  assert.ok(entries.every((entry) => entry.isFile()));
  return Object.fromEntries(
    await Promise.all(
      entries
        .map((entry) => entry.name)
        .sort()
        .map(async (filename) => [
          filename,
          hashBytes(await readFile(path.join(directory, filename))),
        ] as const),
    ),
  );
}

function deepEqualCanonical(actual: unknown, expected: unknown, message: string): void {
  assert.equal(stringifyCanonicalJson(actual), stringifyCanonicalJson(expected), message);
}

function parseAuthoringSpec(sourceText: string): AuthoringSpecV4 {
  const parsed = parseAuthoringSpecV4(sourceText);
  assert.equal(parsed.ok, true, JSON.stringify(parsed.diagnostics));
  assert.ok(parsed.value !== undefined);
  return parsed.value;
}

async function compileBuildArtifact(): Promise<WorldBuildArtifactV4> {
  const compiled = await loadWorldkitRoutePipeline(INPUT_PATH);
  assert.equal(compiled.ok, true, JSON.stringify(compiled.diagnostics));
  assert.ok(compiled.ok);
  return {
    kind: "worldkit-build-artifact",
    schemaVersion: 4,
    normalizedWorldIrHash: compiled.normalizedWorldIrHash,
    executionPlanHash: compiled.executionPlanHash,
    normalizedWorldIr: compiled.normalizedWorldIr,
    executionPlan: compiled.executionPlan,
    worldRuntimeBootstrap: compiled.worldRuntimeBootstrap,
  };
}

function assertCoastalFixtureShape(spec: AuthoringSpecV4): void {
  assert.equal(spec.schemaVersion, 4);
  assert.equal(spec.nodes.filter((node) => node.kind === "terrain").length, 1);
  assert.equal(spec.nodes.filter((node) => node.kind === "water").length, 1);
  assert.equal(spec.nodes.filter((node) => node.kind === "subject").length, 1);
  assert.equal(spec.spatial.routes.length, 1);
  const landmarks = spec.nodes.filter((node) => node.kind === "object");
  assert.deepEqual(
    landmarks.map((node) => node.id).sort(),
    [...LANDMARK_ENTITY_IDS].sort(),
  );
  for (const landmark of landmarks) {
    assert.equal(landmark.placement.kind, "solved");
    assert.equal("transform" in landmark, false, `${landmark.id} leaked a final transform.`);
  }
  const kinds = [...new Set(spec.constraints.placements.map((constraint) => constraint.kind))].sort();
  assert.deepEqual(kinds, [...REQUIRED_CONSTRAINT_KINDS]);
  assert.ok(spec.constraints.placements.some((constraint) => constraint.requirement === "required"));
  assert.ok(spec.constraints.placements.some((constraint) => constraint.requirement === "preferred"));
}

function assertProjectionAgreement(
  report: LayoutSolveReportV1,
  build: WorldBuildArtifactV4,
): void {
  const { normalizedWorldIr, executionPlan } = build;
  assert.equal(report.status, "solved");
  assert.equal(sha256CanonicalJson(report), executionPlan.layout.layoutSolveReportHash);
  assert.equal(normalizedWorldIr.layout.layoutSolveReportHash, executionPlan.layout.layoutSolveReportHash);
  assert.equal(build.normalizedWorldIrHash, executionPlan.normalizedWorldIrHash);
  for (const entityId of PLACED_ENTITY_IDS) {
    const reportPlacement = report.placementsByEntityId[entityId];
    const irNode = normalizedWorldIr.nodes.find((node) => node.id === entityId);
    const planPlacement = executionPlan.layout.placementsByEntityId[entityId];
    assert.ok(reportPlacement !== undefined, `Report placement missing '${entityId}'.`);
    assert.ok(irNode !== undefined && (irNode.kind === "object" || irNode.kind === "anchor"));
    assert.ok(planPlacement !== undefined, `Plan placement missing '${entityId}'.`);
    deepEqualCanonical(irNode.transform, reportPlacement.transform, `${entityId} IR transform drifted.`);
    deepEqualCanonical(planPlacement.transform, reportPlacement.transform, `${entityId} Plan transform drifted.`);
    assert.equal(planPlacement.placementProvenance.layoutSolveReportHash, executionPlan.layout.layoutSolveReportHash);
  }
  for (const entityId of LANDMARK_ENTITY_IDS) {
    const planObject = executionPlan.objects.find((object) => object.entityId === entityId);
    assert.ok(planObject !== undefined);
    deepEqualCanonical(
      planObject.transform,
      report.placementsByEntityId[entityId]!.transform,
      `${entityId} render transform drifted.`,
    );
  }
  const spawn = report.placementsByEntityId["spawn-main"]!;
  const player = executionPlan.subjectInstances.find(
    (subject) => subject.entityId === "player",
  );
  assert.ok(player !== undefined);
  assert.notEqual(
    spawn.transform.positionMetersXYZ[1],
    0,
    "Placement fixture did not exercise a non-zero solved spawn height.",
  );
  deepEqualCanonical(
    player.subjectOriginPositionMetersXYZ,
    spawn.transform.positionMetersXYZ,
    "Player spawn did not follow solved Anchor.",
  );
  assert.notEqual(
    spawn.transform.rotationEulerRadiansXYZ[1],
    0,
    "Placement fixture did not exercise a non-zero solved spawn facing.",
  );
  assert.equal(
    player.subjectFacingRadians,
    spawn.transform.rotationEulerRadiansXYZ[1],
    "Player facing did not follow solved Anchor Y rotation.",
  );
  const requiredResults = Object.values(report.constraintResultsById).filter(
    (result) => result.requirement === "required",
  );
  assert.ok(requiredResults.length > 0);
  assert.ok(requiredResults.every((result) => result.satisfied));
  assert.deepEqual(
    executionPlan.layout.layoutAssertions.map((assertion) => assertion.constraintId).sort(),
    requiredResults.map((result) => result.constraintId).sort(),
  );
  const support = report.constraintResultsById["spawn-supported"]!;
  assert.equal(support.measurements.maximumSupportGapMeters, 0);
  assert.equal(support.measurements.supportRatio, 1);
  const clearance = report.constraintResultsById["landmark-clearance"]!;
  assert.equal(clearance.measurements.hasOverlap, false);
  assert.ok(Number(clearance.measurements.minimumClearanceMeters) >= 8);
  const route = report.constraintResultsById["route-slope"]!;
  assert.ok(Number(route.measurements.maximumSlopeDegrees) <= 8);
  const visibility = report.constraintResultsById["lighthouse-visible"]!;
  assert.equal(visibility.satisfied, true);
  assert.ok(Number(visibility.measurements.visibleRatio) >= 0.45);
  assert.ok(Number(visibility.measurements.projectedAreaRatio) >= 0.02);
}

async function captureBrowserEvidence(): Promise<BrowserEvidenceV1> {
  let server: Awaited<ReturnType<typeof startWorldkitServer>> | undefined;
  let browser: Browser | undefined;
  let context: BrowserContext | undefined;
  let page: Page | undefined;
  let result: BrowserEvidenceV1 | undefined;
  let primaryError: unknown;
  try {
    server = await startWorldkitServer({ inputPath: INPUT_PATH });
    browser = await launchChromiumWithSystemFallback();
    context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    page = await context.newPage();
    await page.goto(server.url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForFunction(() => window.__WORLDKIT__ !== undefined, undefined, {
      timeout: 30_000,
    });
    const captured = await captureVisibleWorldWithRetries(() => page!.evaluate(async () => {
      const api = window.__WORLDKIT__!;
      const ready = await api.ready();
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      api.setPaused(true);
      const snapshot = await api.reset();
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      api.captureScreenshot();
      const screenshot = api.captureScreenshot();
      const image = new Image();
      image.src = screenshot;
      await image.decode();
      const inspectionCanvas = document.createElement("canvas");
      inspectionCanvas.width = image.naturalWidth;
      inspectionCanvas.height = image.naturalHeight;
      const inspectionContext = inspectionCanvas.getContext("2d", {
        willReadFrequently: true,
      });
      if (inspectionContext === null) {
        throw new Error("WORLDKIT_PLACEMENT_CAPTURE_INSPECTION_UNAVAILABLE");
      }
      inspectionContext.drawImage(image, 0, 0);
      const pixels = inspectionContext.getImageData(
        0,
        0,
        inspectionCanvas.width,
        inspectionCanvas.height,
      ).data;
      const sampledRgbColors = new Set<number>();
      for (let pixel = 0; pixel < pixels.length / 4; pixel += 16) {
        const offset = pixel * 4;
        sampledRgbColors.add(
          (pixels[offset]! << 16) |
            (pixels[offset + 1]! << 8) |
            pixels[offset + 2]!,
        );
        if (sampledRgbColors.size >= 8) break;
      }
      return {
        ready,
        snapshot,
        diagnostics: api.getDiagnostics(),
        apiKeys: Object.keys(api).sort(),
        screenshot,
        sampledRgbColorCount: sampledRgbColors.size,
      };
    }));
    assert.equal(captured.ready.schemaVersion, 4);
    assert.equal(captured.snapshot.world.simulationTick, 0);
    assert.notEqual(
      captured.snapshot.worldSessionId,
      captured.ready.worldSessionId,
      "Reset reused the previous WorldSession.",
    );
    assert.ok(
      Object.values(
        captured.snapshot.world.gameplayInspection
          .relationshipStatesById,
      ).some(
        (relationship) =>
          relationship.type === "possessedBy" &&
          relationship.controllerEntityId === "controller-primary" &&
          relationship.controlledEntityId === "player",
      ),
      "Reset did not restore the canonical player possession relationship.",
    );
    assert.deepEqual(
      captured.snapshot.world.subjectStatesByEntityId.player?.entityState
        .positionMetersXYZ,
      [-2, 2, 28],
    );
    assert.deepEqual(captured.apiKeys, [
      "acquireRuntimeActivity",
      "adjustCameraView",
      "applyCameraPreview",
      "applySubjectPresetTuning",
      "captureControlFrame",
      "captureScreenshot",
      "executeCameraViewCommand",
      "executeGameplayCommand",
      "getCameraPreviewState",
      "getCameraSnapshot",
      "getControlCaptureCapabilities",
      "getDiagnostics",
      "getGameplayInspectionSnapshot",
      "getRouteOverlay",
      "getRoutePathReceipt",
      "getRouteRuntimeProbeReceipt",
      "getRouteSummary",
      "getSnapshot",
      "getSubjectPresetBaseline",
      "getSubjectSnapshot",
      "getWorldSessionEvents",
      "getWorldStateSnapshot",
      "listCompatibleProfiles",
      "listMotionKernels",
      "listSubjectDefinitions",
      "ready",
      "releaseRuntimeActivity",
      "reset",
      "resetCameraView",
      "runFixedInput",
      "runHarness",
      "setIntent",
      "setMotionProfile",
      "setPaused",
      "validateSubjectPackage",
      "version",
      "waitForRenderReady",
      "waitForSimulationTick",
    ]);
    assert.equal(captured.apiKeys.some((key) => /solve|search|repair|mutate/i.test(key)), false);
    const screenshotBytes = Buffer.from(captured.screenshot.split(",", 2)[1] ?? "", "base64");
    assert.ok(screenshotBytes.length > 5_000, "Placement screenshot contains too little evidence.");
    result = {
      snapshot: captured.snapshot,
      diagnostics: captured.diagnostics,
      apiKeys: captured.apiKeys,
      screenshotBytes,
      sampledRgbColorCount: captured.sampledRgbColorCount,
    };
  } catch (error) {
    primaryError = error;
  } finally {
    const cleanupErrors: unknown[] = [];
    for (const cleanup of [
      () => page?.close(),
      () => context?.close(),
      () => browser?.close(),
      () => server?.stop(),
    ]) {
      try {
        await cleanup();
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (cleanupErrors.length > 0) {
      const cleanupError = new AggregateError(cleanupErrors, "Placement verifier cleanup failed.");
      primaryError = primaryError === undefined
        ? cleanupError
        : new AggregateError([primaryError, cleanupError], "Placement verification and cleanup failed.");
    }
  }
  if (primaryError !== undefined) throw primaryError;
  assert.ok(result !== undefined);
  return result;
}

function assertBrowserLayoutEvidence(
  diagnostics: readonly WorldkitBrowserDiagnosticV1[],
  plan: CanonicalSceneExecutionPlanV1,
): void {
  const layoutDiagnostics = diagnostics.filter(
    (diagnostic) => diagnostic.code === "WORLDKIT_LAYOUT_ASSERTION_SATISFIED",
  );
  assert.equal(layoutDiagnostics.length, plan.layout.layoutAssertions.length);
  assert.deepEqual(
    layoutDiagnostics.map((diagnostic) => diagnostic.details?.constraintId).sort(),
    plan.layout.layoutAssertions.map((assertion) => assertion.constraintId).sort(),
  );
  for (const diagnostic of layoutDiagnostics) {
    assert.equal(diagnostic.severity, "info");
    assert.equal(diagnostic.details?.layoutSolveReportHash, plan.layout.layoutSolveReportHash);
    assert.ok(diagnostic.details?.measurements !== undefined);
    assert.ok(diagnostic.details?.tolerances !== undefined);
  }
}

function conflictInput(resolved: ResolvedLayoutInputV1): ResolvedLayoutInputV1 {
  const fixed = resolved.entities.find((entity) => entity.placement.kind === "fixed");
  assert.ok(fixed !== undefined && fixed.placement.kind === "fixed");
  return {
    ...resolved,
    id: `${resolved.id}-required-conflict`,
    entities: [fixed],
    regions: [],
    routes: [],
    screenRegions: [],
    constraints: [
      {
        id: "negative-required-conflict",
        kind: "distance-range",
        requirement: "required",
        entityId: fixed.id,
        referenceEntityId: fixed.id,
        minimumDistanceMeters: 1,
        maximumDistanceMeters: 2,
      },
    ],
    geometry: {
      ...resolved.geometry,
      camerasByEntityId: {},
    },
  };
}

function runNegativeGates(spec: AuthoringSpecV4, solvedReport: LayoutSolveReportV1) {
  const resolved = resolveAuthoringLayoutV4(spec);
  assert.equal(resolved.ok, true, JSON.stringify(resolved.diagnostics));
  assert.ok(resolved.value !== undefined && resolved.resolvedSolverProfile !== undefined);
  const conflict = solveLayoutV1(
    conflictInput(resolved.value),
    resolved.resolvedSolverProfile.profile,
  );
  const conflictEnvelope = verifyPlacementReportEnvelope(
    conflict.report,
    conflict.layoutSolveReportHash,
  );
  assert.deepEqual(conflictEnvelope, {
    ok: false,
    code: "PLACEMENT_REQUIRED_CONSTRAINT_UNSATISFIED",
  });
  const budgetProfile = {
    ...resolved.resolvedSolverProfile.profile,
    budgets: {
      ...resolved.resolvedSolverProfile.profile.budgets,
      maximumSearchNodes: 1,
    },
  };
  const budgetInput: ResolvedLayoutInputV1 = {
    ...resolved.value,
    solverProfile: {
      ...resolved.value.solverProfile,
      contentHash: sha256CanonicalJson(budgetProfile) as `sha256:${string}`,
    },
  };
  const budget = solveLayoutV1(budgetInput, budgetProfile);
  const budgetEnvelope = verifyPlacementReportEnvelope(
    budget.report,
    budget.layoutSolveReportHash,
  );
  assert.deepEqual(budgetEnvelope, {
    ok: false,
    code: "PLACEMENT_SOLVER_BUDGET_EXCEEDED",
  });
  const solvedHash = sha256CanonicalJson(solvedReport);
  assert.deepEqual(verifyPlacementReportEnvelope(undefined, solvedHash), {
    ok: false,
    code: "PLACEMENT_REPORT_MISSING",
  });
  const staleReport = { ...solvedReport, seed: solvedReport.seed + 1 };
  assert.deepEqual(
    verifyPlacementReportEnvelope(staleReport, solvedHash),
    { ok: false, code: "PLACEMENT_REPORT_HASH_MISMATCH" },
  );
  const seedMutation = { ...spec, seed: spec.seed + 1 };
  const profileMutation = {
    ...spec,
    layout: { solverProfileRef: "worldkit://layout-solver-profile/unknown@1" },
  };
  const boundsMutation = {
    ...spec,
    world: {
      ...spec.world,
      bounds: {
        ...spec.world.bounds,
        sizeMetersXZ: spec.world.bounds.sizeMetersXZ.map((value) => value / 2) as [number, number],
      },
    },
  };
  assert.equal(placementMutationCode(spec, seedMutation), "PLACEMENT_REPORT_SEED_MISMATCH");
  assert.equal(placementMutationCode(spec, profileMutation), "PLACEMENT_REPORT_PROFILE_MISMATCH");
  assert.equal(placementMutationCode(spec, boundsMutation), "PLACEMENT_REPORT_BOUNDS_MISMATCH");
  return {
    requiredConflict: conflictEnvelope.code,
    seed: "PLACEMENT_REPORT_SEED_MISMATCH",
    profile: "PLACEMENT_REPORT_PROFILE_MISMATCH",
    bounds: "PLACEMENT_REPORT_BOUNDS_MISMATCH",
    missingReport: "PLACEMENT_REPORT_MISSING",
    staleReportHash: "PLACEMENT_REPORT_HASH_MISMATCH",
    budgetExhaustion: budgetEnvelope.code,
    outputPromoted: false,
  } as const;
}

async function solveInto(directory: string) {
  const result = await layoutSolveFile(INPUT_PATH, directory);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.ok(result.ok);
  const [reportBytes, irBytes] = await Promise.all([
    readFile(path.join(directory, "layout-report.json"), "utf8"),
    readFile(path.join(directory, "normalized-world-ir.json"), "utf8"),
  ]);
  return {
    result,
    reportBytes,
    irBytes,
    report: parseJson<LayoutSolveReportV1>(reportBytes, "Layout report"),
    normalizedWorldIr: parseJson<NormalizedWorldIRV4>(irBytes, "NormalizedWorldIR"),
  };
}

export async function runPlacementLayoutVerification(
  publicationMode: ArtifactPublicationMode = "check",
): Promise<void> {
  const sourceText = await readFile(INPUT_PATH, "utf8");
  const spec = parseAuthoringSpec(sourceText);
  assertCoastalFixtureShape(spec);

  const stagingDirectory = await mkdtemp(
    path.join(path.dirname(TARGET_ARTIFACT_DIRECTORY), ".placement-coastal-world.tmp-"),
  );
  const solveDirectories = await Promise.all(
    ["primary", "repeat", "concurrent-a", "concurrent-b"].map((name) =>
      mkdtemp(path.join(tmpdir(), `worldkit-placement-${name}-`)),
    ),
  );
  try {
    const primary = await solveInto(solveDirectories[0]!);
    const repeat = await solveInto(solveDirectories[1]!);
    const [concurrentA, concurrentB] = await Promise.all([
      solveInto(solveDirectories[2]!),
      solveInto(solveDirectories[3]!),
    ]);
    for (const other of [repeat, concurrentA, concurrentB]) {
      assert.equal(other.reportBytes, primary.reportBytes, "Layout report bytes are nondeterministic.");
      assert.equal(other.irBytes, primary.irBytes, "Normalized IR bytes are nondeterministic.");
      assert.equal(other.result.layoutSolveReportHash, primary.result.layoutSolveReportHash);
      assert.equal(other.result.normalizedWorldIrHash, primary.result.normalizedWorldIrHash);
    }
    const build = await compileBuildArtifact();
    deepEqualCanonical(
      build.normalizedWorldIr,
      primary.normalizedWorldIr,
      "Route pipeline and layout artifact normalized different V4 worlds.",
    );
    assert.equal(
      build.normalizedWorldIrHash,
      primary.result.normalizedWorldIrHash,
    );
    assertProjectionAgreement(primary.report, build);
    const repeatedBuilds = await Promise.all(
      [repeat, concurrentA, concurrentB].map(() => compileBuildArtifact()),
    );
    assert.ok(repeatedBuilds.every((entry) => entry.executionPlanHash === build.executionPlanHash));
    const targetBeforeNegativeGates = await artifactDirectoryFingerprint(
      TARGET_ARTIFACT_DIRECTORY,
    );
    const negativeGates = runNegativeGates(spec, primary.report);
    assert.deepEqual(
      await artifactDirectoryFingerprint(TARGET_ARTIFACT_DIRECTORY),
      targetBeforeNegativeGates,
      "A negative placement gate created or changed the WorldPackage output.",
    );

    const browser = await captureBrowserEvidence();
    assertBrowserLayoutEvidence(browser.diagnostics, build.executionPlan);
    deepEqualCanonical(
      browser.snapshot.world.subjectStatesByEntityId.player?.entityState
        .positionMetersXYZ,
      build.executionPlan.subjectInstances.find(
        (subject) => subject.entityId === "player",
      )?.subjectOriginPositionMetersXYZ,
      "Browser Snapshot did not preserve the solved spawn.",
    );
    const dimensions = inspectPng(browser.screenshotBytes);

    const buildBytes = `${stringifyCanonicalJson(build)}\n`;
    const verification = {
      kind: "worldkit-placement-layout-verification",
      schemaVersion: 1,
      inputPath: path.relative(REPOSITORY_ROOT, INPUT_PATH),
      protocolVersions: {
        authoring: 4,
        normalizedWorldIr: 4,
        executionPlan: 5,
        runtimeSnapshot: 4,
        browserProtocol: 5,
      },
      hashes: {
        authoringSpec: primary.report.authoringSpecHash,
        solverProfile: primary.report.solverProfileHash,
        layoutSolveReport: primary.result.layoutSolveReportHash,
        normalizedWorldIr: primary.result.normalizedWorldIrHash,
        executionPlan: build.executionPlanHash,
        screenshot: hashBytes(browser.screenshotBytes),
      },
      deterministicRuns: {
        sequentialCount: 2,
        concurrentCount: 2,
        reportBytesIdentical: true,
        normalizedWorldIrBytesIdentical: true,
        executionPlanHashesIdentical: true,
      },
      layout: {
        status: primary.report.status,
        seed: primary.report.seed,
        solverProfileRef: primary.report.solverProfileRef,
        searchNodeCount: primary.report.searchNodeCount,
        preferenceCostRatio: primary.report.totalPreferenceCostRatio,
        constraintKinds: REQUIRED_CONSTRAINT_KINDS,
        placementsByEntityId: primary.report.placementsByEntityId,
        constraintResultsById: primary.report.constraintResultsById,
      },
      browser: {
        apiKeys: browser.apiKeys,
        snapshot: browser.snapshot,
        layoutAssertionDiagnostics: browser.diagnostics,
      },
      screenshot: {
        ...dimensions,
        byteLength: browser.screenshotBytes.length,
        sampledRgbColorCount: browser.sampledRgbColorCount,
      },
      negativeGates,
    } as const;
    await Promise.all([
      cp(
        path.join(solveDirectories[0]!, "layout-report.json"),
        path.join(stagingDirectory, "layout-report.json"),
      ),
      cp(
        path.join(solveDirectories[0]!, "normalized-world-ir.json"),
        path.join(stagingDirectory, "normalized-world-ir.json"),
      ),
      writeFile(path.join(stagingDirectory, "world.build.json"), buildBytes),
      writeFile(path.join(stagingDirectory, "world.png"), browser.screenshotBytes),
      writeFile(
        path.join(stagingDirectory, "verification.json"),
        `${stringifyCanonicalJson(verification)}\n`,
      ),
    ]);
    const publication = await finalizeArtifactDirectory({
      mode: publicationMode,
      temporaryDirectory: stagingDirectory,
      targetDirectory: TARGET_ARTIFACT_DIRECTORY,
      expectedFilenames: ARTIFACT_FILENAMES,
    });
    process.stdout.write(`${JSON.stringify({
      ok: true,
      hashes: verification.hashes,
      screenshot: verification.screenshot,
      searchNodeCount: primary.report.searchNodeCount,
      constraints: Object.keys(primary.report.constraintResultsById).length,
      publicationMode: publication.publicationMode,
      artifacts: publication.publicationMode === "update"
        ? TARGET_ARTIFACT_DIRECTORY
        : null,
      ...(publication.publicationMode === "update"
        ? { backupGarbageCollection: publication.backupGarbageCollection }
        : {}),
    }, null, 2)}\n`);
  } finally {
    await rm(stagingDirectory, { recursive: true, force: true });
    await Promise.all(
      solveDirectories.map((directory) => rm(directory, { recursive: true, force: true })),
    );
  }
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await runPlacementLayoutVerification(
      parseArtifactPublicationMode(process.argv.slice(2)),
    );
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
