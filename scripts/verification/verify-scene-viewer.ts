import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright";

import type { WorldRuntimeSnapshotV4 } from "@whitebox-world/runtime-contracts";

const CONTROLLER_ENTITY_ID = "controller-primary";
const FIXED_INPUT_TICKS = 90;
const MAXIMUM_STATIC_SUBJECT_DRIFT_METERS = 1e-9;
const G_BOT_SUBJECT_DEFINITION_REF =
  "worldkit://subject-definition/humanoid.g-bot@2";

export const SCENE_VIEWER_PRESET_IDS = [
  "whitebox-3c-test-course",
  "feel-flat",
  "traversal-course",
  "action-lab",
] as const;

export const ARTIFACT_SCENE_CATALOG_IDS = [
  "grassland",
  "azure-bay",
  "canyon",
  "mistbound-rider",
  "sunlit-flower-bay",
  "world-08170639-54db",
  "mounted-skateboard-s1",
] as const;

interface CuratedViewerServerHandleV1 {
  readonly url: string;
  stop(): Promise<void>;
}

async function availableLoopbackPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    server.close();
    throw new Error("Unable to allocate a loopback port.");
  }
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return address.port;
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise<void>((resolve) => child.once("exit", () => resolve())),
    new Promise<void>((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
  }
}

async function startCuratedViewerServer(): Promise<CuratedViewerServerHandleV1> {
  const repositoryRoot = path.resolve(".");
  const playgroundRoot = path.join(repositoryRoot, "apps/playground");
  const port = await availableLoopbackPort();
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => key !== "WORLDKIT_AUTHORING_SPEC_PATH",
    ),
  );
  const child = spawn(
    process.execPath,
    [
      path.join(repositoryRoot, "node_modules/vite/bin/vite.js"),
      "--config",
      "vite.config.mjs",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--strictPort",
    ],
    {
      cwd: playgroundRoot,
      env: environment,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  child.stdout?.on("data", (chunk) => {
    output += String(chunk);
    process.stdout.write(chunk);
  });
  child.stderr?.on("data", (chunk) => {
    output += String(chunk);
    process.stderr.write(chunk);
  });
  const url = `http://127.0.0.1:${port}/`;
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Curated Viewer server exited before readiness.\n${output}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) {
        return Object.freeze({
          url,
          stop: () => stopChild(child),
        });
      }
    } catch {
      // The bounded readiness loop owns retries.
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
  }
  await stopChild(child);
  throw new Error(`Curated Viewer server did not become ready.\n${output}`);
}

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

export interface CuratedPresetBrowserEvidenceV1 {
  readonly presetId: string;
  readonly adapterName: string;
  readonly selectorSceneIds: readonly string[];
  readonly browserProtocolVersion: 5;
  readonly runtimeSnapshotSchemaVersion: 4;
  readonly runtimeSessionId: string;
  readonly initialWorldSessionId: string;
  readonly resetWorldSessionId: string;
  readonly controlledEntityId: string;
  readonly controlledSubjectDefinitionRef: typeof G_BOT_SUBJECT_DEFINITION_REF;
  readonly initialPositionMetersXYZ: readonly [number, number, number];
  readonly movedPositionMetersXYZ: readonly [number, number, number];
  readonly movedMeters: number;
  readonly runtimeFeatureIds: readonly string[];
  readonly courseRunMovedMeters?: number;
  readonly jumpedMeters: number;
  readonly tuningDraftUpdated: true;
  readonly unchangedSubjectEntityIds: readonly string[];
  readonly routeQuery: RouteQueryEvidenceV1;
  readonly resetDeterministic: true;
  readonly screenshotPath: string;
}

export interface PresetSwitchEvidenceV1 {
  readonly fromPresetId: "feel-flat";
  readonly toPresetId: "action-lab";
  readonly fromRuntimeSessionId: string;
  readonly toRuntimeSessionId: string;
  readonly controlledSubjectDefinitionRef: typeof G_BOT_SUBJECT_DEFINITION_REF;
}

export interface ArtifactBrowserEvidenceV1 {
  readonly catalogId: string;
  readonly worldkitApiExposed: false;
  readonly runtimeHostGlobals: readonly string[];
  readonly forbiddenGameplayMethodNames: readonly string[];
  readonly screenshotPath: string;
}

export interface InvalidPresetEvidenceV1 {
  readonly presetId: string;
  readonly diagnosticCode: "WORLDKIT_RUNTIME_INITIALIZATION_FAILED";
  readonly sourceErrorCode: "VIEWER_BOOTSTRAP_HTTP_404";
  readonly runtimeReadyRejected: true;
  readonly featureCount: 0;
  readonly expectedConsoleErrorCount: 1;
}

export type VerificationResultV1<T> =
  | Readonly<{ status: "passed"; evidence: T }>
  | Readonly<{
      status: "failed";
      screenshotPath?: string;
      failure: BrowserFailureV1;
    }>;

export interface SceneViewerVerificationReportV1 {
  readonly kind: "scene-viewer-browser-verification";
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly curatedPresets: readonly VerificationResultV1<CuratedPresetBrowserEvidenceV1>[];
  readonly presetSwitch: VerificationResultV1<PresetSwitchEvidenceV1>;
  readonly invalidPresetRoute: VerificationResultV1<InvalidPresetEvidenceV1>;
  readonly artifacts: readonly VerificationResultV1<ArtifactBrowserEvidenceV1>[];
}

export function curatedViewerPresetUrl(
  origin: string,
  presetId: (typeof SCENE_VIEWER_PRESET_IDS)[number],
): string {
  const url = new URL(origin);
  url.searchParams.set("scene", presetId);
  return url.toString();
}

export function artifactSceneCatalogUrl(
  origin: string,
  catalogId: (typeof ARTIFACT_SCENE_CATALOG_IDS)[number],
): string {
  const url = new URL(origin);
  url.searchParams.set("scene", catalogId);
  url.searchParams.set("artifact", "1");
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

async function verifyCuratedPreset(
  options: Readonly<{
    page: Page;
    origin: string;
    outputDirectory: string;
    presetId: (typeof SCENE_VIEWER_PRESET_IDS)[number];
  }>,
): Promise<CuratedPresetBrowserEvidenceV1> {
  const { page, origin, outputDirectory, presetId } = options;
  const screenshotPath = path.join(
    outputDirectory,
    `${presetId}-curated-preset.png`,
  );
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  await page.goto(curatedViewerPresetUrl(origin, presetId), {
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
  assert.equal(
    initialControlled.entityState.entityDefinitionRef,
    G_BOT_SUBJECT_DEFINITION_REF,
    `${presetId}: controlled Subject is not G Bot.`,
  );
  const viewerIdentity = await page.evaluate(() => ({
    adapterName: document.querySelector("#adapter-name")?.textContent ?? "",
    selectedSceneId:
      document.querySelector<HTMLSelectElement>("#scene-select")?.value ?? "",
    selectorSceneIds: [
      ...(document.querySelector<HTMLSelectElement>("#scene-select")?.options ?? []),
    ].map((option) => option.value),
  }));
  assert.equal(viewerIdentity.adapterName, `babylon-havok/${presetId}`);
  assert.equal(viewerIdentity.selectedSceneId, presetId);
  assert.deepEqual(
    viewerIdentity.selectorSceneIds,
    [...SCENE_VIEWER_PRESET_IDS],
  );
  const runtimeFeatureIds = await page.locator("#feature-list [data-feature-id]")
    .evaluateAll((elements) => elements.map((element) =>
      (element as HTMLElement).dataset.featureId ?? ""
    ).filter((featureId) => featureId.length > 0).sort());
  if (presetId === "whitebox-3c-test-course") {
    for (const requiredFeatureId of [
      "gate-west",
      "gate-east",
      "stairs-1",
      "stairs-6",
      "slope-main",
      "corridor-west",
      "corridor-east",
      "ledge-main",
      "obstacle-small-1",
      "obstacle-large-1",
      "speed-turn-1",
      "speed-turn-5",
      "occlusion-pillar-1",
      "occlusion-corner-east",
      "jump-takeoff-main",
      "jump-landing-main",
    ]) {
      assert.ok(
        runtimeFeatureIds.includes(requiredFeatureId),
        `whitebox-3c-test-course: runtime feature '${requiredFeatureId}' is missing.`,
      );
    }
  }

  const routeQuery = await page.evaluate(
    ({ presetId: currentPresetId }) => {
      const api = window.__WORLDKIT__!;
      api.setPaused(true);
      const before = api.getSnapshot();
      const selector = {
        constraintId: `g19-7-read-only:${currentPresetId}`,
        routeId: `g19-7-read-only:${currentPresetId}`,
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
    { presetId },
  );
  assert.deepEqual(
    routeQuery.after,
    routeQuery.before,
    `${presetId}: read-only Route evidence queries changed the active World or Tick.`,
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
    `${presetId}: Route evidence query returned an invalid availability result.`,
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
    `${presetId}: fixed input did not move the possessed Subject.`,
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
      `${presetId}: uncontrolled Subject '${entityId}' moved ${driftMeters}m.`,
    );
  }

  let courseRunMovedMeters: number | undefined;
  if (presetId === "whitebox-3c-test-course") {
    const courseRun = await page.evaluate(async () => {
      const api = window.__WORLDKIT__!;
      const before = await api.reset();
      const after = await api.runFixedInput([
        { actions: ["move-forward", "run"], ticks: 600 },
      ]);
      return { before, after };
    });
    const beforeCourseSubject =
      courseRun.before.world.subjectStatesByEntityId[controlledEntityId];
    const afterCourseSubject =
      courseRun.after.world.subjectStatesByEntityId[controlledEntityId];
    assert.ok(beforeCourseSubject !== undefined && afterCourseSubject !== undefined);
    courseRunMovedMeters = Math.hypot(
      afterCourseSubject.entityState.positionMetersXYZ[0] -
        beforeCourseSubject.entityState.positionMetersXYZ[0],
      afterCourseSubject.entityState.positionMetersXYZ[1] -
        beforeCourseSubject.entityState.positionMetersXYZ[1],
      afterCourseSubject.entityState.positionMetersXYZ[2] -
        beforeCourseSubject.entityState.positionMetersXYZ[2],
    );
    assert.ok(
      courseRunMovedMeters > 25,
      `whitebox-3c-test-course: run input moved only ${courseRunMovedMeters}m.`,
    );
    assert.ok(
      afterCourseSubject.entityState.positionMetersXYZ[2] < 25,
      "whitebox-3c-test-course: G Bot did not pass the narrow gate and enter the stair lane.",
    );
    await page.evaluate(async () => window.__WORLDKIT__!.reset());
  }

  const jumped = await page.evaluate(async () => {
    const api = window.__WORLDKIT__!;
    const before = api.getSnapshot();
    const after = await api.runFixedInput([
      { actions: ["jump"], ticks: 1 },
      { actions: [], ticks: 5 },
    ]);
    return { before, after };
  });
  const jumpedControlled =
    jumped.after.world.subjectStatesByEntityId[controlledEntityId];
  const jumpedFrom = jumped.before.world.subjectStatesByEntityId[controlledEntityId];
  assert.ok(jumpedControlled !== undefined && jumpedFrom !== undefined);
  const jumpedMeters = jumpedControlled.entityState.positionMetersXYZ[1] -
    jumpedFrom.entityState.positionMetersXYZ[1];
  assert.ok(jumpedMeters > 0.01, `${presetId}: jump input did not lift G Bot.`);

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
    `${presetId}: consecutive resets did not restore the same canonical Gameplay state.`,
  );

  const tuningDraftUpdated = await page.evaluate(() => {
    const slider = document.querySelector<HTMLInputElement>(
      "#tuning-motion-sliders input[type=range]",
    );
    if (slider === null) return false;
    const minimum = Number(slider.min);
    const maximum = Number(slider.max);
    const current = Number(slider.value);
    slider.value = String(current === maximum ? minimum : maximum);
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    const status = document.querySelector("#tuning-save-status")?.textContent ?? "";
    return status.includes("候选值已保存") &&
      status.includes("重新编译后生效");
  });
  assert.equal(tuningDraftUpdated, true, `${presetId}: tuning draft did not update.`);

  const canvas = await page.locator("canvas.world-canvas").boundingBox();
  assert.ok(canvas !== null && canvas.width > 0 && canvas.height > 0);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  assert.deepEqual(
    consoleErrors,
    [],
    `${presetId}: browser console errors detected.`,
  );

  return {
    presetId,
    adapterName: viewerIdentity.adapterName,
    selectorSceneIds: viewerIdentity.selectorSceneIds,
    browserProtocolVersion: 5,
    runtimeSnapshotSchemaVersion: 4,
    runtimeSessionId: initial.runtimeSessionId,
    initialWorldSessionId: initial.worldSessionId,
    resetWorldSessionId: resets.second.worldSessionId,
    controlledEntityId,
    controlledSubjectDefinitionRef: G_BOT_SUBJECT_DEFINITION_REF,
    initialPositionMetersXYZ: initialControlled.entityState.positionMetersXYZ,
    movedPositionMetersXYZ: afterPosition,
    movedMeters,
    runtimeFeatureIds,
    ...(courseRunMovedMeters === undefined ? {} : { courseRunMovedMeters }),
    jumpedMeters,
    tuningDraftUpdated: true,
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
    catalogId: (typeof ARTIFACT_SCENE_CATALOG_IDS)[number];
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
  await page.goto(artifactSceneCatalogUrl(origin, catalogId), {
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

async function verifyPresetSwitch(
  page: Page,
  origin: string,
): Promise<PresetSwitchEvidenceV1> {
  await page.goto(curatedViewerPresetUrl(origin, "feel-flat"), {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  await waitForGameplayReady(page);
  const before = await page.evaluate(async () => window.__WORLDKIT__!.ready());
  await Promise.all([
    page.waitForURL(/\?scene=action-lab$/, { timeout: 30_000 }),
    page.selectOption("#scene-select", "action-lab"),
  ]);
  await waitForGameplayReady(page);
  const after = await page.evaluate(async () => window.__WORLDKIT__!.ready());
  assert.notEqual(
    after.runtimeSessionId,
    before.runtimeSessionId,
    "Scene selection did not create a fresh RuntimeHost session.",
  );
  const controlledEntityId = requireControlledEntityId(after);
  const controlled = after.world.subjectStatesByEntityId[controlledEntityId];
  assert.equal(
    controlled?.entityState.entityDefinitionRef,
    G_BOT_SUBJECT_DEFINITION_REF,
  );
  assert.equal(
    await page.locator("#adapter-name").textContent(),
    "babylon-havok/action-lab",
  );
  return {
    fromPresetId: "feel-flat",
    toPresetId: "action-lab",
    fromRuntimeSessionId: before.runtimeSessionId,
    toRuntimeSessionId: after.runtimeSessionId,
    controlledSubjectDefinitionRef: G_BOT_SUBJECT_DEFINITION_REF,
  };
}

async function verifyInvalidPresetRoute(
  page: Page,
  origin: string,
): Promise<InvalidPresetEvidenceV1> {
  const presetId = "does-not-exist";
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  const url = new URL(origin);
  url.searchParams.set("scene", presetId);
  await page.goto(url.toString(), {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  await page.waitForFunction(
    () => document.documentElement.dataset.worldkitStatus === "error",
    undefined,
    { timeout: 30_000 },
  );
  const result = await page.evaluate(async () => ({
    runtimeReadyRejected: window.__WORLDKIT__ === undefined
      ? true
      : await window.__WORLDKIT__.ready().then(() => false, () => true),
    featureCount: document.querySelectorAll("#feature-list > *").length,
    inspectionText: document.querySelector("#inspection")?.textContent ?? "",
  }));
  assert.equal(result.runtimeReadyRejected, true);
  assert.equal(result.featureCount, 0);
  assert.match(result.inspectionText, /WORLDKIT_RUNTIME_INITIALIZATION_FAILED/);
  assert.match(result.inspectionText, /VIEWER_BOOTSTRAP_HTTP_404/);
  assert.equal(consoleErrors.length, 1);
  assert.match(consoleErrors[0] ?? "", /404 \(Not Found\)/);
  return {
    presetId,
    diagnosticCode: "WORLDKIT_RUNTIME_INITIALIZATION_FAILED",
    sourceErrorCode: "VIEWER_BOOTSTRAP_HTTP_404",
    runtimeReadyRejected: true,
    featureCount: 0,
    expectedConsoleErrorCount: 1,
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
  server: CuratedViewerServerHandleV1 | undefined,
): Promise<void> {
  const pending: Promise<unknown>[] = [];
  if (context !== undefined) pending.push(context.close());
  if (browser !== undefined) pending.push(browser.close());
  if (server !== undefined) pending.push(server.stop());
  await Promise.allSettled(pending);
}

async function main(): Promise<void> {
  const outputDirectory = path.resolve(
    process.env.SCENE_VIEWER_VERIFICATION_OUTPUT ??
      `.codex/tmp/scene-viewer-${Date.now()}`,
  );
  await mkdir(outputDirectory, { recursive: true });
  let server: CuratedViewerServerHandleV1 | undefined;
  let browser: Browser | undefined;
  let context: BrowserContext | undefined;
  let report: SceneViewerVerificationReportV1 | undefined;
  try {
    server = await startCuratedViewerServer();
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

    const curatedPresets: VerificationResultV1<CuratedPresetBrowserEvidenceV1>[] = [];
    for (const presetId of SCENE_VIEWER_PRESET_IDS) {
      const result = await runWithFailureEvidence({
        context,
        screenshotPath: path.join(
          outputDirectory,
          `${presetId}-curated-preset-failed.png`,
        ),
        run: async (page) =>
          verifyCuratedPreset({
            page,
            origin,
            outputDirectory,
            presetId,
          }),
      });
      curatedPresets.push(result);
      process.stdout.write(
        `${result.status === "passed" ? "PASS" : "FAIL"}: ${presetId} curated Gameplay preset gate.\n`,
      );
    }

    const presetSwitch = await runWithFailureEvidence({
      context,
      screenshotPath: path.join(outputDirectory, "preset-switch-failed.png"),
      run: async (page) => verifyPresetSwitch(page, origin),
    });
    process.stdout.write(
      `${presetSwitch.status === "passed" ? "PASS" : "FAIL"}: Viewer preset switch creates a fresh RuntimeHost session.\n`,
    );

    const invalidPresetRoute = await runWithFailureEvidence({
      context,
      screenshotPath: path.join(outputDirectory, "unknown-preset-failed.png"),
      run: async (page) => verifyInvalidPresetRoute(page, origin),
    });
    process.stdout.write(
      `${invalidPresetRoute.status === "passed" ? "PASS" : "FAIL"}: unknown preset fails closed.\n`,
    );

    const artifacts: VerificationResultV1<ArtifactBrowserEvidenceV1>[] = [];
    for (const catalogId of ARTIFACT_SCENE_CATALOG_IDS) {
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
      kind: "scene-viewer-browser-verification",
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      curatedPresets,
      presetSwitch,
      invalidPresetRoute,
      artifacts,
    };
    const reportPath = path.join(outputDirectory, "verification.json");
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    process.stdout.write(`Evidence: ${reportPath}\n`);
  } finally {
    await closeBestEffort(context, browser, server);
  }

  assert.ok(report !== undefined);
  const failureCount = sceneViewerFailureCount(report);
  assert.equal(
    failureCount,
    0,
    `${failureCount} scene Viewer verification case(s) failed; inspect the structured evidence.`,
  );
}

export function sceneViewerFailureCount(
  report: SceneViewerVerificationReportV1,
): number {
  return [
    ...report.curatedPresets,
    report.presetSwitch,
    report.invalidPresetRoute,
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
