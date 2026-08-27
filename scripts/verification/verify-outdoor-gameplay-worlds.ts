import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright";

import {
  startWorldkitServer,
  type WorldkitServerHandle,
} from "../lib/worldkit-server";
import type { WorldRuntimeSnapshotV4 } from "@whitebox-world/runtime-contracts";

const SERVER_INPUT_PATH = "examples/authoring/package-subject-world.json";
const CONTROLLER_ENTITY_ID = "controller-primary";
const FIXED_INPUT_TICKS = 90;
const MAXIMUM_STATIC_SUBJECT_DRIFT_METERS = 1e-9;

export const OUTDOOR_GAMEPLAY_SCENE_CATALOG_IDS = [
  "grassland",
  "azure-bay",
  "canyon",
  "mistbound-rider",
  "sunlit-flower-bay",
  "world-08170639-54db",
] as const;

interface BrowserFailureV1 {
  readonly name: string;
  readonly message: string;
}

interface RouteQueryEvidenceV1 {
  readonly selector: {
    readonly constraintId: string;
    readonly routeId: string;
  };
  readonly worldSessionId: string;
  readonly simulationTick: number;
  readonly results: readonly {
    readonly queryKind: "summary" | "path" | "runtime-probe" | "overlay";
    readonly availability: "available" | "unavailable";
    readonly unavailableReason?: string;
  }[];
}

export interface SceneBrowserEvidenceV1 {
  readonly catalogId: string;
  readonly browserProtocolVersion: 5;
  readonly runtimeSnapshotSchemaVersion: 4;
  readonly runtimeSessionId: string;
  readonly initialWorldSessionId: string;
  readonly resetWorldSessionId: string;
  readonly controlledEntityId: string;
  readonly initialPositionMetersXYZ: readonly [number, number, number];
  readonly movedPositionMetersXYZ: readonly [number, number, number];
  readonly movedMeters: number;
  readonly unchangedSubjectEntityIds: readonly string[];
  readonly routeQuery: RouteQueryEvidenceV1;
  readonly resetDeterministic: true;
  readonly screenshotPath: string;
}

export interface ArtifactBrowserEvidenceV1 {
  readonly catalogId: string;
  readonly worldkitApiExposed: false;
  readonly runtimeHostGlobals: readonly string[];
  readonly forbiddenGameplayMethodNames: readonly string[];
  readonly screenshotPath: string;
}

export interface InvalidSceneEvidenceV1 {
  readonly sceneCatalogId: string;
  readonly diagnosticCode: "PLAYGROUND_SCENE_NOT_FOUND";
  readonly worldkitApiExposed: false;
  readonly playgroundApiExposed: false;
}

export type VerificationResultV1<T> =
  | Readonly<{ status: "passed"; evidence: T }>
  | Readonly<{
      status: "failed";
      screenshotPath?: string;
      failure: BrowserFailureV1;
    }>;

export interface OutdoorGameplayVerificationReportV1 {
  readonly kind: "outdoor-gameplay-browser-verification";
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly scenes: readonly VerificationResultV1<SceneBrowserEvidenceV1>[];
  readonly invalidSceneRoute: VerificationResultV1<InvalidSceneEvidenceV1>;
  readonly artifacts: readonly VerificationResultV1<ArtifactBrowserEvidenceV1>[];
}

export function outdoorGameplaySceneUrl(
  origin: string,
  catalogId: string,
  artifact = false,
): string {
  const url = new URL(origin);
  url.searchParams.set("scene", catalogId);
  if (artifact) url.searchParams.set("artifact", "1");
  return url.toString();
}

function browserFailure(error: unknown): BrowserFailureV1 {
  return error instanceof Error
    ? { name: error.name, message: error.message }
    : { name: "NonErrorThrown", message: String(error) };
}

function maximumPositionDriftMeters(
  left: readonly number[],
  right: readonly number[],
): number {
  assert.equal(left.length, 3);
  assert.equal(right.length, 3);
  return Math.max(
    Math.abs(left[0]! - right[0]!),
    Math.abs(left[1]! - right[1]!),
    Math.abs(left[2]! - right[2]!),
  );
}

async function waitForGameplayReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      window.__WORLDKIT__ !== undefined ||
      document.documentElement.dataset.worldkitStatus === "error",
    undefined,
    { timeout: 90_000 },
  );
  await page.waitForFunction(
    () => {
      const status = document.documentElement.dataset.worldkitStatus;
      return status === "ready" || status === "error";
    },
    undefined,
    { timeout: 90_000 },
  );
  const startup = await page.evaluate(() => ({
    status: document.documentElement.dataset.worldkitStatus,
    diagnostics: window.__WORLDKIT__?.getDiagnostics() ?? [],
    protocolVersion: window.__WORLDKIT__?.version,
  }));
  assert.equal(
    startup.status,
    "ready",
    `Gameplay startup failed: ${JSON.stringify(startup.diagnostics)}`,
  );
  assert.equal(startup.protocolVersion, 5);
}

function requireControlledEntityId(
  snapshot: WorldRuntimeSnapshotV4,
): string {
  const possessions = Object.values(
    snapshot.world.gameplayInspection.relationshipStatesById,
  ).filter(
    (relationship) =>
      relationship.type === "possessedBy" &&
      relationship.controllerEntityId === CONTROLLER_ENTITY_ID,
  );
  assert.equal(
    possessions.length,
    1,
    `Expected exactly one authoritative possession for '${CONTROLLER_ENTITY_ID}'.`,
  );
  const possession = possessions[0];
  assert.equal(possession?.type, "possessedBy");
  return possession.controlledEntityId;
}

function deterministicResetProjection(
  snapshot: WorldRuntimeSnapshotV4,
): unknown {
  return {
    subjects: Object.fromEntries(
      Object.entries(snapshot.world.subjectStatesByEntityId)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([entityId, subject]) => [
          entityId,
          {
            entityState: subject.entityState,
            capabilityStatesById: subject.capabilityStatesById,
          },
        ]),
    ),
    possession: Object.values(
      snapshot.world.gameplayInspection.relationshipStatesById,
    ).filter((relationship) => relationship.type === "possessedBy").map((relationship) => ({
      controllerEntityId: relationship.controllerEntityId,
      controlledEntityId: relationship.controlledEntityId,
    })),
    camera: snapshot.view.camera,
    runtime: {
      phase: snapshot.runtime.phase,
      isPaused: snapshot.runtime.isPaused,
      fixedTimeStepSeconds: snapshot.runtime.fixedTimeStepSeconds,
    },
    resources: snapshot.resources,
  };
}

async function verifyScene(
  options: Readonly<{
    page: Page;
    origin: string;
    outputDirectory: string;
    catalogId: string;
  }>,
): Promise<SceneBrowserEvidenceV1> {
  const { page, origin, outputDirectory, catalogId } = options;
  const screenshotPath = path.join(
    outputDirectory,
    `${catalogId}-gameplay.png`,
  );
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  await page.goto(outdoorGameplaySceneUrl(origin, catalogId), {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  await waitForGameplayReady(page);

  const initial = await page.evaluate(async () => window.__WORLDKIT__!.ready());
  assert.equal(initial.schemaVersion, 4);
  assert.equal(initial.runtime.phase, "ready");
  assert.notEqual(initial.resources.phase, "failed");
  assert.equal(initial.world.simulationTick, 0);
  const controlledEntityId = requireControlledEntityId(initial);
  const initialControlled =
    initial.world.subjectStatesByEntityId[controlledEntityId];
  assert.ok(
    initialControlled !== undefined,
    `Possessed Subject '${controlledEntityId}' is missing from Snapshot V4.`,
  );

  const routeQuery = await page.evaluate(
    ({ catalogId: sceneCatalogId }) => {
      const api = window.__WORLDKIT__!;
      api.setPaused(true);
      const before = api.getSnapshot();
      const selector = {
        constraintId: `g19-7-read-only:${sceneCatalogId}`,
        routeId: `g19-7-read-only:${sceneCatalogId}`,
      };
      const queried = [
        {
          queryKind: "summary" as const,
          result: api.getRouteSummary(selector),
        },
        {
          queryKind: "path" as const,
          result: api.getRoutePathReceipt(selector),
        },
        {
          queryKind: "runtime-probe" as const,
          result: api.getRouteRuntimeProbeReceipt(selector),
        },
        {
          queryKind: "overlay" as const,
          result: api.getRouteOverlay(selector),
        },
      ];
      const after = api.getSnapshot();
      return {
        selector,
        before,
        after,
        results: queried.map(({ queryKind, result }) => ({
          queryKind,
          availability: result.availability,
          ...(result.availability === "unavailable"
            ? { unavailableReason: result.reason }
            : {}),
        })),
      };
    },
    { catalogId },
  );
  assert.deepEqual(
    routeQuery.after,
    routeQuery.before,
    `${catalogId}: read-only Route evidence queries changed the active World or Tick.`,
  );
  assert.equal(routeQuery.results.length, 4);
  assert.ok(
    routeQuery.results.every(
      (result) =>
        result.availability === "available" ||
        result.unavailableReason === "route-evidence-not-loaded" ||
        result.unavailableReason === "route-not-found" ||
        result.unavailableReason === "evidence-not-published",
    ),
    `${catalogId}: Route evidence query returned an invalid availability result.`,
  );

  const movement = await page.evaluate(async (fixedInputTicks) => {
    const api = window.__WORLDKIT__!;
    const before = api.getSnapshot();
    const after = await api.runFixedInput([
      { actions: ["move-forward"], ticks: fixedInputTicks },
    ]);
    return { before, after };
  }, FIXED_INPUT_TICKS);
  const movementControlledEntityId = requireControlledEntityId(movement.after);
  assert.equal(movementControlledEntityId, controlledEntityId);
  const beforeControlled =
    movement.before.world.subjectStatesByEntityId[controlledEntityId];
  const afterControlled =
    movement.after.world.subjectStatesByEntityId[controlledEntityId];
  assert.ok(beforeControlled !== undefined && afterControlled !== undefined);
  const beforePosition = beforeControlled.entityState.positionMetersXYZ;
  const afterPosition = afterControlled.entityState.positionMetersXYZ;
  const movedMeters = Math.hypot(
    afterPosition[0] - beforePosition[0],
    afterPosition[1] - beforePosition[1],
    afterPosition[2] - beforePosition[2],
  );
  assert.ok(
    movedMeters > 0.05,
    `${catalogId}: fixed input did not move the possessed Subject.`,
  );
  const unchangedSubjectEntityIds = Object.keys(
    movement.before.world.subjectStatesByEntityId,
  )
    .filter((entityId) => entityId !== controlledEntityId)
    .sort();
  for (const entityId of unchangedSubjectEntityIds) {
    const beforeSubject =
      movement.before.world.subjectStatesByEntityId[entityId];
    const afterSubject = movement.after.world.subjectStatesByEntityId[entityId];
    assert.ok(beforeSubject !== undefined && afterSubject !== undefined);
    const driftMeters = maximumPositionDriftMeters(
      beforeSubject.entityState.positionMetersXYZ,
      afterSubject.entityState.positionMetersXYZ,
    );
    assert.ok(
      driftMeters <= MAXIMUM_STATIC_SUBJECT_DRIFT_METERS,
      `${catalogId}: uncontrolled Subject '${entityId}' moved ${driftMeters}m.`,
    );
  }

  const resets = await page.evaluate(async () => {
    const api = window.__WORLDKIT__!;
    const first = await api.reset();
    const second = await api.reset();
    return { first, second };
  });
  assert.notEqual(resets.first.worldSessionId, movement.after.worldSessionId);
  assert.notEqual(resets.second.worldSessionId, resets.first.worldSessionId);
  assert.equal(resets.first.runtimeSessionId, initial.runtimeSessionId);
  assert.equal(resets.second.runtimeSessionId, initial.runtimeSessionId);
  assert.equal(resets.first.world.simulationTick, 0);
  assert.equal(resets.second.world.simulationTick, 0);
  assert.equal(requireControlledEntityId(resets.first), controlledEntityId);
  assert.equal(requireControlledEntityId(resets.second), controlledEntityId);
  assert.deepEqual(
    deterministicResetProjection(resets.second),
    deterministicResetProjection(resets.first),
    `${catalogId}: consecutive resets did not restore the same canonical Gameplay state.`,
  );

  const canvas = await page.locator("canvas.world-canvas").boundingBox();
  assert.ok(canvas !== null && canvas.width > 0 && canvas.height > 0);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  assert.deepEqual(
    consoleErrors,
    [],
    `${catalogId}: browser console errors detected.`,
  );

  return {
    catalogId,
    browserProtocolVersion: 5,
    runtimeSnapshotSchemaVersion: 4,
    runtimeSessionId: initial.runtimeSessionId,
    initialWorldSessionId: initial.worldSessionId,
    resetWorldSessionId: resets.second.worldSessionId,
    controlledEntityId,
    initialPositionMetersXYZ: initialControlled.entityState.positionMetersXYZ,
    movedPositionMetersXYZ: afterPosition,
    movedMeters,
    unchangedSubjectEntityIds,
    routeQuery: {
      selector: routeQuery.selector,
      worldSessionId: routeQuery.before.worldSessionId,
      simulationTick: routeQuery.before.world.simulationTick,
      results: routeQuery.results,
    },
    resetDeterministic: true,
    screenshotPath,
  };
}

async function verifyArtifactRoute(
  options: Readonly<{
    page: Page;
    origin: string;
    outputDirectory: string;
    catalogId: string;
  }>,
): Promise<ArtifactBrowserEvidenceV1> {
  const { page, origin, outputDirectory, catalogId } = options;
  const screenshotPath = path.join(
    outputDirectory,
    `${catalogId}-artifact.png`,
  );
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  await page.goto(outdoorGameplaySceneUrl(origin, catalogId, true), {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  await page.waitForFunction(
    () =>
      Object.prototype.hasOwnProperty.call(window, "__WHITEBOX_PLAYGROUND__"),
    undefined,
    { timeout: 90_000 },
  );
  const result = await page.evaluate(() => {
    const globalRecord = window as unknown as Record<string, unknown>;
    const playgroundApi = globalRecord.__WHITEBOX_PLAYGROUND__ as
      | Readonly<Record<string, unknown>>
      | undefined;
    const forbiddenGameplayMethodNames = [
      "executeGameplayCommand",
      "executeCameraViewCommand",
      "getWorldSessionEvents",
      "getGameplayInspectionSnapshot",
      "getSnapshot",
      "reset",
      "runFixedInput",
      "setIntent",
      "setPaused",
    ].filter((methodName) => typeof playgroundApi?.[methodName] === "function");
    return {
      worldkitApiExposed: Object.prototype.hasOwnProperty.call(
        window,
        "__WORLDKIT__",
      ),
      runtimeHostGlobals: Object.getOwnPropertyNames(window)
        .filter((name) => /runtime.?host/i.test(name))
        .sort(),
      forbiddenGameplayMethodNames,
    };
  });
  assert.equal(result.worldkitApiExposed, false);
  assert.deepEqual(result.runtimeHostGlobals, []);
  assert.deepEqual(result.forbiddenGameplayMethodNames, []);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  assert.deepEqual(
    consoleErrors,
    [],
    `${catalogId}: artifact-only route emitted browser errors.`,
  );
  return {
    catalogId,
    worldkitApiExposed: false,
    runtimeHostGlobals: result.runtimeHostGlobals,
    forbiddenGameplayMethodNames: result.forbiddenGameplayMethodNames,
    screenshotPath,
  };
}

async function verifyInvalidSceneRoute(
  page: Page,
  origin: string,
): Promise<InvalidSceneEvidenceV1> {
  const sceneCatalogId = "does-not-exist";
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  await page.goto(outdoorGameplaySceneUrl(origin, sceneCatalogId), {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  await page.waitForFunction(
    () => document.documentElement.dataset.worldkitStatus === "error",
    undefined,
    { timeout: 30_000 },
  );
  const result = await page.evaluate(() => ({
    adapterName: document.querySelector("#adapter-name")?.textContent ?? "",
    worldkitApiExposed: Object.prototype.hasOwnProperty.call(
      window,
      "__WORLDKIT__",
    ),
    playgroundApiExposed: Object.prototype.hasOwnProperty.call(
      window,
      "__WHITEBOX_PLAYGROUND__",
    ),
    inspectionText: document.querySelector("#inspection")?.textContent ?? "",
  }));
  assert.equal(result.adapterName, "route-error");
  assert.equal(result.worldkitApiExposed, false);
  assert.equal(result.playgroundApiExposed, false);
  assert.match(result.inspectionText, /PLAYGROUND_SCENE_NOT_FOUND/);
  assert.deepEqual(consoleErrors, []);
  return {
    sceneCatalogId,
    diagnosticCode: "PLAYGROUND_SCENE_NOT_FOUND",
    worldkitApiExposed: false,
    playgroundApiExposed: false,
  };
}

async function captureFailureScreenshot(
  page: Page,
  screenshotPath: string,
): Promise<string | undefined> {
  try {
    await page.screenshot({ path: screenshotPath, fullPage: true });
    return screenshotPath;
  } catch {
    return undefined;
  }
}

async function runWithFailureEvidence<T>(
  options: Readonly<{
    context: BrowserContext;
    screenshotPath: string;
    run(page: Page): Promise<T>;
  }>,
): Promise<VerificationResultV1<T>> {
  const page = await options.context.newPage();
  try {
    return { status: "passed", evidence: await options.run(page) };
  } catch (error) {
    return {
      status: "failed",
      ...((await captureFailureScreenshot(page, options.screenshotPath)) ===
      undefined
        ? {}
        : { screenshotPath: options.screenshotPath }),
      failure: browserFailure(error),
    };
  } finally {
    await page.close();
  }
}

async function closeBestEffort(
  context: BrowserContext | undefined,
  browser: Browser | undefined,
  server: WorldkitServerHandle | undefined,
): Promise<void> {
  const pending: Promise<unknown>[] = [];
  if (context !== undefined) pending.push(context.close());
  if (browser !== undefined) pending.push(browser.close());
  if (server !== undefined) pending.push(server.stop());
  await Promise.allSettled(pending);
}

async function main(): Promise<void> {
  const outputDirectory = path.resolve(
    process.env.OUTDOOR_GAMEPLAY_VERIFICATION_OUTPUT ??
      `.codex/tmp/outdoor-gameplay-${Date.now()}`,
  );
  await mkdir(outputDirectory, { recursive: true });
  let server: WorldkitServerHandle | undefined;
  let browser: Browser | undefined;
  let context: BrowserContext | undefined;
  let report: OutdoorGameplayVerificationReportV1 | undefined;
  try {
    server = await startWorldkitServer({
      inputPath: SERVER_INPUT_PATH,
      forwardOutput: true,
      startupTimeoutMilliseconds: 60_000,
    });
    try {
      browser = await chromium.launch({ headless: true });
    } catch {
      throw Object.assign(new Error("Playwright Chromium is unavailable."), {
        code: "CLI_PLAYWRIGHT_BROWSER_UNAVAILABLE",
      });
    }
    context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });
    const origin = new URL(server.url).origin;

    const scenes: VerificationResultV1<SceneBrowserEvidenceV1>[] = [];
    for (const catalogId of OUTDOOR_GAMEPLAY_SCENE_CATALOG_IDS) {
      const result = await runWithFailureEvidence({
        context,
        screenshotPath: path.join(
          outputDirectory,
          `${catalogId}-gameplay-failed.png`,
        ),
        run: async (page) =>
          verifyScene({
            page,
            origin,
            outputDirectory,
            catalogId,
          }),
      });
      scenes.push(result);
      process.stdout.write(
        `${result.status === "passed" ? "PASS" : "FAIL"}: ${catalogId} Gameplay browser gate.\n`,
      );
    }

    const invalidSceneRoute = await runWithFailureEvidence({
      context,
      screenshotPath: path.join(outputDirectory, "unknown-scene-failed.png"),
      run: async (page) => verifyInvalidSceneRoute(page, origin),
    });
    process.stdout.write(
      `${invalidSceneRoute.status === "passed" ? "PASS" : "FAIL"}: unknown scene fails closed.\n`,
    );

    const artifacts: VerificationResultV1<ArtifactBrowserEvidenceV1>[] = [];
    for (const catalogId of OUTDOOR_GAMEPLAY_SCENE_CATALOG_IDS) {
      const result = await runWithFailureEvidence({
        context,
        screenshotPath: path.join(
          outputDirectory,
          `${catalogId}-artifact-failed.png`,
        ),
        run: async (page) =>
          verifyArtifactRoute({
            page,
            origin,
            outputDirectory,
            catalogId,
          }),
      });
      artifacts.push(result);
      process.stdout.write(
        `${result.status === "passed" ? "PASS" : "FAIL"}: ${catalogId} artifact-only gate.\n`,
      );
    }

    report = {
      kind: "outdoor-gameplay-browser-verification",
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      scenes,
      invalidSceneRoute,
      artifacts,
    };
    const reportPath = path.join(outputDirectory, "verification.json");
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    process.stdout.write(`Evidence: ${reportPath}\n`);
  } finally {
    await closeBestEffort(context, browser, server);
  }

  assert.ok(report !== undefined);
  const failureCount = outdoorGameplayFailureCount(report);
  assert.equal(
    failureCount,
    0,
    `${failureCount} outdoor Gameplay verification case(s) failed; inspect the structured evidence.`,
  );
}

export function outdoorGameplayFailureCount(
  report: OutdoorGameplayVerificationReportV1,
): number {
  return [
    ...report.scenes,
    report.invalidSceneRoute,
    ...report.artifacts,
  ].filter((result) => result.status === "failed").length;
}

const entryPath = process.argv[1];
if (
  entryPath !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(entryPath)).href
) {
  await main();
}
