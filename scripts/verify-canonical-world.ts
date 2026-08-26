import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import type { Browser, BrowserContext, Page } from "playwright";

import {
  stringifyCanonicalJson,
  type NormalizedWorldIRV4,
} from "@whitebox-world/authoring";
import type {
  ExecutionPlanV5,
  Vec3,
  WorldRuntimeSnapshotV4,
} from "@whitebox-world/runtime-contracts";

import {
  explainSubjectFile,
  type SubjectExplanationSuccessV1,
} from "./lib/subject-explain";
import {
  finalizeArtifactDirectory,
  parseArtifactPublicationMode,
  type ArtifactPublicationMode,
} from "./lib/artifact-directory-promotion";
import { launchChromiumWithSystemFallback } from "./lib/playwright-browser-launch";
import { startWorldkitServer } from "./lib/worldkit-server";
import { main as worldkitMain } from "./worldkit";

const REPOSITORY_ROOT = fileURLToPath(new URL("../", import.meta.url));
const INPUT_PATH = path.join(
  REPOSITORY_ROOT,
  "examples/authoring/package-subject-world.json",
);
const INVALID_INPUT_PATH = path.join(
  REPOSITORY_ROOT,
  "examples/authoring/invalid-world.json",
);
const TARGET_ARTIFACT_DIRECTORY = path.join(
  REPOSITORY_ROOT,
  "artifacts/examples/package-subject-world",
);
const CANONICAL_ARTIFACT_FILES = [
  "explain.json",
  "snapshot.json",
  "world.build.json",
  "world.png",
] as const;
const PLAYER_ENTITY_ID = "player";
const FIRST_PACKAGE_SUBJECT_ENTITY_ID = "pack-animal-a";
const SECOND_PACKAGE_SUBJECT_ENTITY_ID = "pack-animal-b";
const PACKAGE_SUBJECT_DEFINITION_REF =
  "package://subject-definition/coastal-pack-animal@1";
const BROWSER_PROTOCOL_V5_METHOD_NAMES = [
  "ready",
  "getSnapshot",
  "getDiagnostics",
  "executeGameplayCommand",
  "runFixedInput",
  "getGameplayEvents",
  "getGameplayInspectionSnapshot",
  "getWorldStateSnapshot",
  "acquireRuntimeActivity",
  "releaseRuntimeActivity",
  "getControlCaptureCapabilities",
  "waitForSimulationTick",
  "waitForRenderReady",
  "captureControlFrame",
  "captureScreenshot",
  "reset",
  "setPaused",
  "listSubjectDefinitions",
  "listMotionKernels",
  "listCompatibleProfiles",
  "getSubjectPresetBaseline",
  "validateSubjectPackage",
  "setIntent",
  "setCameraViewPreference",
  "resetCameraViewPreference",
  "adjustCameraView",
  "resetCameraView",
  "getCameraPreviewState",
  "applyCameraPreview",
  "applySubjectPresetTuning",
  "setMotionProfile",
  "runHarness",
  "getSubjectSnapshot",
  "getCameraSnapshot",
  "getRouteSummary",
  "getRoutePathReceipt",
  "getRouteRuntimeProbeReceipt",
  "getRouteOverlay",
] as const;
const FORBIDDEN_BROWSER_ROUTE_AUTHORITY_NAMES = [
  "buildTraversalGraph",
  "buildRouteGraph",
  "queryRoute",
  "probeRoute",
  "runRouteProbe",
  "setRouteValidationThresholds",
  "setValidationThresholds",
  "setRouteEvidence",
] as const;

interface WorldBuildArtifactV4 {
  kind: "worldkit-build-artifact";
  schemaVersion: 4;
  normalizedWorldIrHash: string;
  executionPlanHash: string;
  normalizedWorldIr: NormalizedWorldIRV4;
  executionPlan: ExecutionPlanV5;
}

interface CanonicalArtifactPaths {
  directory: string;
  build: string;
  screenshot: string;
  snapshot: string;
  explain: string;
}

function artifactPaths(directory: string): CanonicalArtifactPaths {
  return {
    directory,
    build: path.join(directory, "world.build.json"),
    screenshot: path.join(directory, "world.png"),
    snapshot: path.join(directory, "snapshot.json"),
    explain: path.join(directory, "explain.json"),
  };
}

function parseJson<T>(sourceText: string, label: string): T {
  try {
    return JSON.parse(sourceText) as T;
  } catch (error) {
    throw new Error(`${label} is not valid JSON.`, { cause: error });
  }
}

function inspectPng(bytes: Buffer): { width: number; height: number } {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  assert.ok(
    bytes.length >= 24,
    "Captured PNG is too small to contain an IHDR chunk.",
  );
  assert.ok(
    bytes.subarray(0, 8).equals(signature),
    "Captured file does not have a PNG signature.",
  );
  assert.equal(
    bytes.subarray(12, 16).toString("ascii"),
    "IHDR",
    "Captured PNG has no leading IHDR chunk.",
  );
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

async function runCliGates(paths: CanonicalArtifactPaths): Promise<void> {
  assert.equal(
    await worldkitMain(["validate", INPUT_PATH, "--json"]),
    0,
    "worldkit validate must accept the Package Subject Definition world.",
  );
  assert.equal(
    await worldkitMain(["validate", INVALID_INPUT_PATH, "--json"]),
    2,
    "worldkit validate must reject unknown fields.",
  );
  assert.equal(
    await worldkitMain(["build", INPUT_PATH, "--output", paths.build, "--json"]),
    0,
    "worldkit build must emit the canonical V4 build artifact.",
  );
  const firstBuildBytes = await readFile(paths.build, "utf8");
  assert.equal(
    await worldkitMain(["build", INPUT_PATH, "--output", paths.build, "--json"]),
    0,
    "Repeated worldkit build must succeed.",
  );
  assert.equal(
    await readFile(paths.build, "utf8"),
    firstBuildBytes,
    "Repeated builds of the same input must be byte-identical.",
  );
  assert.equal(
    await worldkitMain([
      "subject",
      "explain",
      INPUT_PATH,
      "--entity-id",
      FIRST_PACKAGE_SUBJECT_ENTITY_ID,
      "--json",
    ]),
    0,
    "worldkit subject explain must accept a Package Definition instance.",
  );
  const explanation = await explainSubjectFile(
    INPUT_PATH,
    FIRST_PACKAGE_SUBJECT_ENTITY_ID,
  );
  assert.equal(
    explanation.ok,
    true,
    "Subject Explain must return a success artifact.",
  );
  await writeFile(
    paths.explain,
    `${stringifyCanonicalJson(explanation)}\n`,
  );
  assert.equal(
    await worldkitMain([
      "capture",
      INPUT_PATH,
      "--output",
      paths.screenshot,
      "--snapshot",
      paths.snapshot,
      "--json",
    ]),
    0,
    "worldkit capture must emit a PNG and plural V4 runtime snapshot.",
  );
}

async function verifyArtifacts(paths: CanonicalArtifactPaths): Promise<{
  dimensions: { width: number; height: number };
  bodyCount: number;
  normalizedWorldIrHash: string;
  executionPlanHash: string;
  subjectDefinitionHash: string;
  resourceLockHash: string;
}> {
  const artifact = parseJson<WorldBuildArtifactV4>(
    await readFile(paths.build, "utf8"),
    "Build artifact",
  );
  assert.equal(artifact.kind, "worldkit-build-artifact");
  assert.equal(artifact.schemaVersion, 4);
  assert.match(artifact.normalizedWorldIrHash, /^sha256:[a-f0-9]{64}$/);
  assert.match(artifact.executionPlanHash, /^sha256:[a-f0-9]{64}$/);
  assert.equal(artifact.normalizedWorldIr.schemaVersion, 4);
  assert.equal(artifact.executionPlan.schemaVersion, 5);
  assert.equal(artifact.executionPlan.terrain.entityId, "terrain-main");
  assert.deepEqual(
    artifact.executionPlan.waters.map((water) => water.entityId),
    ["lake-main"],
  );
  assert.deepEqual(
    artifact.executionPlan.objects.map((object) => object.entityId),
    ["tower", "wall-east", "wall-west"],
  );
  assert.equal(artifact.executionPlan.initialControlledEntityId, PLAYER_ENTITY_ID);
  assert.deepEqual(
    artifact.executionPlan.subjects.map((subject) => subject.entityId),
    [
      FIRST_PACKAGE_SUBJECT_ENTITY_ID,
      SECOND_PACKAGE_SUBJECT_ENTITY_ID,
      PLAYER_ENTITY_ID,
    ],
  );
  assert.equal(artifact.executionPlan.camera.cameraEntityId, "camera-main");

  const packageSubjects = artifact.executionPlan.subjects.filter(
    (subject) => subject.subjectDefinitionRef === PACKAGE_SUBJECT_DEFINITION_REF,
  );
  assert.equal(packageSubjects.length, 2);
  assert.equal(
    new Set(packageSubjects.map((subject) => subject.subjectDefinitionHash)).size,
    1,
    "Both instances must share one resolved Package Definition Hash.",
  );
  assert.notDeepEqual(
    packageSubjects[0]?.spawnSubjectOriginPositionMetersXYZ,
    packageSubjects[1]?.spawnSubjectOriginPositionMetersXYZ,
    "Package Definition instances must compile to independent spawn origins.",
  );
  const subjectDefinitionHash = packageSubjects[0]?.subjectDefinitionHash;
  assert.ok(subjectDefinitionHash !== undefined);

  const packageDefinition =
    artifact.normalizedWorldIr.resources.subjectDefinitions.find(
      (definition) =>
        definition.subjectDefinitionRef === PACKAGE_SUBJECT_DEFINITION_REF,
    );
  assert.ok(packageDefinition !== undefined);
  assert.equal(packageDefinition.source, "package");
  assert.equal(packageDefinition.subjectDefinitionHash, subjectDefinitionHash);
  assert.ok(
    packageDefinition.sockets.some((socket) => socket.id === "seat.mount"),
    "Package Definition must preserve its declared mount seat Socket.",
  );

  const explanation = parseJson<SubjectExplanationSuccessV1>(
    await readFile(paths.explain, "utf8"),
    "Subject Explain artifact",
  );
  assert.equal(explanation.ok, true);
  assert.equal(explanation.subject.entityId, FIRST_PACKAGE_SUBJECT_ENTITY_ID);
  assert.equal(
    explanation.subject.subjectDefinitionRef,
    PACKAGE_SUBJECT_DEFINITION_REF,
  );
  assert.equal(
    explanation.subject.subjectDefinitionHash,
    subjectDefinitionHash,
  );
  assert.equal(
    explanation.subject.resourceLockHash,
    artifact.normalizedWorldIr.resources.resourceLockHash,
  );
  assert.ok(explanation.subject.resourceLockEntries.length >= 5);

  const snapshot = parseJson<WorldRuntimeSnapshotV4>(
    await readFile(paths.snapshot, "utf8"),
    "Runtime snapshot",
  );
  assert.equal(snapshot.schemaVersion, 4);
  assert.equal(snapshot.runtime.phase, "ready");
  assert.equal(snapshot.runtime.fixedTimeStepSeconds, 1 / 60);
  assert.equal(snapshot.resources.phase, "ready");
  assert.deepEqual(Object.keys(snapshot.world.subjectStatesByEntityId).sort(), [
    FIRST_PACKAGE_SUBJECT_ENTITY_ID,
    SECOND_PACKAGE_SUBJECT_ENTITY_ID,
    PLAYER_ENTITY_ID,
  ]);
  for (const state of Object.values(snapshot.world.subjectStatesByEntityId)) {
    assert.ok(
      Object.values(state.capabilityStatesById).every(
        (capability) => capability.mode === "idle",
      ),
      "Initial locomotion capability state was not idle.",
    );
  }
  assert.notStrictEqual(
    snapshot.world.subjectStatesByEntityId[FIRST_PACKAGE_SUBJECT_ENTITY_ID],
    snapshot.world.subjectStatesByEntityId[SECOND_PACKAGE_SUBJECT_ENTITY_ID],
  );
  assert.ok(
    Object.values(
      snapshot.world.gameplayInspection.relationshipStatesById,
    ).some(
      (relationship) =>
        relationship.type === "possessedBy" &&
        relationship.controllerEntityId === "controller-primary" &&
        relationship.controlledEntityId === PLAYER_ENTITY_ID,
    ),
    "CLI snapshot did not publish the initial possession relationship.",
  );
  assert.equal(snapshot.view.camera.mode, "tracking");
  assert.equal(
    snapshot.view.camera.mode === "tracking" ? snapshot.view.camera.id : undefined,
    "camera-main",
  );
  assert.ok(
    snapshot.resources.physicsBodyCount >= 7,
    "Terrain, three static objects, and three Subjects must own physics bodies.",
  );
  assert.equal(snapshot.resources.terrainSampleCount, 65 * 65);

  const dimensions = inspectPng(await readFile(paths.screenshot));
  assert.ok(
    dimensions.width >= 800 && dimensions.height >= 450,
    "Captured PNG dimensions are unexpectedly small.",
  );
  return {
    dimensions,
    bodyCount: snapshot.resources.physicsBodyCount,
    normalizedWorldIrHash: artifact.normalizedWorldIrHash,
    executionPlanHash: artifact.executionPlanHash,
    subjectDefinitionHash,
    resourceLockHash: artifact.normalizedWorldIr.resources.resourceLockHash,
  };
}

interface MovementEvidence {
  beforePositionMetersXYZ: Vec3;
  afterPositionMetersXYZ: Vec3;
}

function assertPositionUnchanged(
  actual: Vec3,
  expected: Vec3,
  message: string,
): void {
  const maximumDriftMeters = Math.max(
    ...actual.map((coordinate, index) =>
      Math.abs(coordinate - expected[index]!),
    ),
  );
  assert.ok(
    maximumDriftMeters <= 1e-9,
    `${message} Maximum drift was ${maximumDriftMeters}m.`,
  );
}

function requireSubjectProjection(
  snapshot: WorldRuntimeSnapshotV4,
  entityId: string,
): WorldRuntimeSnapshotV4["world"]["subjectStatesByEntityId"][string] {
  const subject = snapshot.world.subjectStatesByEntityId[entityId];
  assert.ok(subject !== undefined, `Missing Subject projection '${entityId}'.`);
  return subject;
}

function requireLocomotionCapability(
  snapshot: WorldRuntimeSnapshotV4,
  entityId: string,
) {
  const capability = Object.values(
    requireSubjectProjection(snapshot, entityId).capabilityStatesById,
  ).find((candidate) => candidate.kind === "locomotion-capability-state");
  assert.ok(
    capability !== undefined,
    `Missing locomotion capability state for '${entityId}'.`,
  );
  return capability;
}

function assertPossessedBy(
  snapshot: WorldRuntimeSnapshotV4,
  controllerEntityId: string,
  controlledEntityId: string,
): void {
  assert.ok(
    Object.values(
      snapshot.world.gameplayInspection.relationshipStatesById,
    ).some(
      (relationship) =>
        relationship.type === "possessedBy" &&
        relationship.controllerEntityId === controllerEntityId &&
        relationship.controlledEntityId === controlledEntityId,
    ),
    `Controller '${controllerEntityId}' does not possess '${controlledEntityId}'.`,
  );
}

async function verifyBrowserProtocolAndPhysics(): Promise<{
  wallStopPositionMetersXYZ: Vec3;
  lakeEntryPositionMetersXYZ: Vec3;
  firstPackageSubjectMovement: MovementEvidence;
  secondPackageSubjectMovement: MovementEvidence;
}> {
  let server: Awaited<ReturnType<typeof startWorldkitServer>> | undefined;
  let browser: Browser | undefined;
  let context: BrowserContext | undefined;
  let page: Page | undefined;
  let result:
    | {
        wallStopPositionMetersXYZ: Vec3;
        lakeEntryPositionMetersXYZ: Vec3;
        firstPackageSubjectMovement: MovementEvidence;
        secondPackageSubjectMovement: MovementEvidence;
      }
    | undefined;
  let primaryError: unknown;
  try {
    server = await startWorldkitServer({ inputPath: INPUT_PATH });
    try {
      browser = await launchChromiumWithSystemFallback();
    } catch {
      throw Object.assign(new Error("Playwright Chromium is unavailable."), {
        code: "CLI_PLAYWRIGHT_BROWSER_UNAVAILABLE",
      });
    }
    context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    page = await context.newPage();
    await page.goto(server.url, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await page.waitForFunction(
      () => window.__WORLDKIT__ !== undefined,
      undefined,
      { timeout: 30_000 },
    );
    assert.equal(await page.evaluate(() => window.__WORLDKIT__!.version), 5);
    const ready = await page.evaluate(async () => window.__WORLDKIT__!.ready());
    assert.equal(ready.schemaVersion, 4);
    assert.equal(ready.runtime.phase, "ready");
    assert.equal(ready.resources.phase, "ready");
    assertPossessedBy(ready, "controller-primary", PLAYER_ENTITY_ID);
    assert.deepEqual(Object.keys(ready.world.subjectStatesByEntityId).sort(), [
      FIRST_PACKAGE_SUBJECT_ENTITY_ID,
      SECOND_PACKAGE_SUBJECT_ENTITY_ID,
      PLAYER_ENTITY_ID,
    ]);
    const browserProtocol = await page.evaluate(
      ({ methodNames, forbiddenNames }) => {
        const api = window.__WORLDKIT__!;
        const apiRecord = api as unknown as Record<string, unknown>;
        api.setPaused(true);
        const before = api.getSnapshot();
        const selector = {
          constraintId: "canonical-world-unconfigured-route",
          routeId: "canonical-world-unconfigured-route",
        };
        const unloaded = [
          api.getRouteSummary(selector),
          api.getRoutePathReceipt(selector),
          api.getRouteRuntimeProbeReceipt(selector),
          api.getRouteOverlay(selector),
        ];
        return {
          missingMethodNames: methodNames.filter(
            (methodName) => typeof apiRecord[methodName] !== "function",
          ),
          forbiddenAuthorityNames: forbiddenNames.filter(
            (methodName) => methodName in apiRecord,
          ),
          unloaded,
          before,
          after: api.getSnapshot(),
        };
      },
      {
        methodNames: BROWSER_PROTOCOL_V5_METHOD_NAMES,
        forbiddenNames: FORBIDDEN_BROWSER_ROUTE_AUTHORITY_NAMES,
      },
    );
    assert.equal(BROWSER_PROTOCOL_V5_METHOD_NAMES.length, 38);
    assert.deepEqual(browserProtocol.missingMethodNames, []);
    assert.deepEqual(browserProtocol.forbiddenAuthorityNames, []);
    assert.deepEqual(
      browserProtocol.unloaded.map((result) => ({
        availability: result.availability,
        reason: result.availability === "unavailable" ? result.reason : undefined,
      })),
      Array.from({ length: 4 }, () => ({
        availability: "unavailable",
        reason: "route-evidence-not-loaded",
      })),
    );
    assert.deepEqual(
      browserProtocol.after,
      browserProtocol.before,
      "Read-only Route evidence getters changed the Runtime Snapshot or Tick.",
    );

    const wallStop = await page.evaluate(async () => {
      const api = window.__WORLDKIT__!;
      api.setPaused(true);
      await api.reset();
      return api.runFixedInput([{ actions: ["move-right"], ticks: 360 }]);
    });
    const wallStopPlayer = requireSubjectProjection(
      wallStop,
      PLAYER_ENTITY_ID,
    ).entityState;
    assert.ok(
      wallStopPlayer.positionMetersXYZ[0] > 2,
      "Fixed input did not move player toward the east wall.",
    );
    assert.ok(
      wallStopPlayer.positionMetersXYZ[0] < 6.2,
      `Player crossed the east wall at x=${wallStopPlayer.positionMetersXYZ[0]}.`,
    );

    const lakeEntry = await page.evaluate(async () => {
      const api = window.__WORLDKIT__!;
      await api.reset();
      return api.runFixedInput([{ actions: ["move-forward"], ticks: 720 }]);
    });
    const lakeEntryPlayer = requireSubjectProjection(
      lakeEntry,
      PLAYER_ENTITY_ID,
    ).entityState;
    const lakeEntryLocomotion = requireLocomotionCapability(
      lakeEntry,
      PLAYER_ENTITY_ID,
    );
    assert.ok(
      lakeEntryPlayer.positionMetersXYZ[2] < 5,
      "Fixed input did not move player toward the lake.",
    );
    assert.ok(
      lakeEntryLocomotion.movementMedium === "ground" ||
        lakeEntryLocomotion.movementMedium === "air",
      `P1.5 publishes only the closed ground/air medium set; received '${lakeEntryLocomotion.movementMedium}'.`,
    );
    assert.equal(lakeEntryLocomotion.mode, "walk");

    const firstStart = await page.evaluate(async () => {
      const api = window.__WORLDKIT__!;
      await api.reset();
      return api.runFixedInput([{ actions: [], ticks: 1 }]);
    });
    const firstReceipt = await page.evaluate(
      async ({ controlledEntityId, snapshot }) =>
        window.__WORLDKIT__!.executeGameplayCommand({
          schemaVersion: 1,
          id: "canonical-bind-first-package-subject",
          type: "control.bind",
          runtimeSessionId: snapshot.runtimeSessionId,
          worldSessionId: snapshot.worldSessionId,
          controllerEntityId: "controller-primary",
          controlledEntityId,
          expectedPossession: {
            mode: "possessed",
            controlledEntityId: "player",
          },
        }),
      {
        controlledEntityId: FIRST_PACKAGE_SUBJECT_ENTITY_ID,
        snapshot: firstStart,
      },
    );
    assert.equal(firstReceipt.status, "committed");
    const firstMove = await page.evaluate(() =>
      window.__WORLDKIT__!.runFixedInput([
        { actions: ["move-right"], ticks: 120 },
      ]),
    );
    assertPossessedBy(
      firstMove,
      "controller-primary",
      FIRST_PACKAGE_SUBJECT_ENTITY_ID,
    );
    assert.equal(
      requireLocomotionCapability(firstMove, FIRST_PACKAGE_SUBJECT_ENTITY_ID).mode,
      "walk",
    );
    assert.equal(firstMove.view.camera.mode, "tracking");
    assert.equal(
      firstMove.view.camera.mode === "tracking"
        ? firstMove.view.camera.targetEntityId
        : undefined,
      FIRST_PACKAGE_SUBJECT_ENTITY_ID,
    );
    assert.ok(
      requireSubjectProjection(firstMove, FIRST_PACKAGE_SUBJECT_ENTITY_ID)
        .entityState.positionMetersXYZ[0] >
        requireSubjectProjection(firstStart, FIRST_PACKAGE_SUBJECT_ENTITY_ID)
          .entityState.positionMetersXYZ[0],
      "The first Package Definition instance did not move.",
    );
    assertPositionUnchanged(
      requireSubjectProjection(firstMove, SECOND_PACKAGE_SUBJECT_ENTITY_ID)
        .entityState.positionMetersXYZ,
      requireSubjectProjection(firstStart, SECOND_PACKAGE_SUBJECT_ENTITY_ID)
        .entityState.positionMetersXYZ,
      "The second Package Definition instance moved during first-instance input.",
    );
    assertPositionUnchanged(
      requireSubjectProjection(firstMove, PLAYER_ENTITY_ID).entityState
        .positionMetersXYZ,
      requireSubjectProjection(firstStart, PLAYER_ENTITY_ID).entityState
        .positionMetersXYZ,
      "The uncontrolled player moved during first-instance input.",
    );

    const secondStart = await page.evaluate(async () => {
      const api = window.__WORLDKIT__!;
      await api.reset();
      return api.runFixedInput([{ actions: [], ticks: 1 }]);
    });
    const secondReceipt = await page.evaluate(
      async ({ controlledEntityId, snapshot }) =>
        window.__WORLDKIT__!.executeGameplayCommand({
          schemaVersion: 1,
          id: "canonical-bind-second-package-subject",
          type: "control.bind",
          runtimeSessionId: snapshot.runtimeSessionId,
          worldSessionId: snapshot.worldSessionId,
          controllerEntityId: "controller-primary",
          controlledEntityId,
          expectedPossession: {
            mode: "possessed",
            controlledEntityId: "player",
          },
        }),
      {
        controlledEntityId: SECOND_PACKAGE_SUBJECT_ENTITY_ID,
        snapshot: secondStart,
      },
    );
    assert.equal(secondReceipt.status, "committed");
    const secondMove = await page.evaluate(() =>
      window.__WORLDKIT__!.runFixedInput([
        { actions: ["move-left"], ticks: 120 },
      ]),
    );
    assertPossessedBy(
      secondMove,
      "controller-primary",
      SECOND_PACKAGE_SUBJECT_ENTITY_ID,
    );
    assert.equal(
      requireLocomotionCapability(secondMove, SECOND_PACKAGE_SUBJECT_ENTITY_ID).mode,
      "walk",
    );
    assert.equal(secondMove.view.camera.mode, "tracking");
    assert.equal(
      secondMove.view.camera.mode === "tracking"
        ? secondMove.view.camera.targetEntityId
        : undefined,
      SECOND_PACKAGE_SUBJECT_ENTITY_ID,
    );
    assert.ok(
      requireSubjectProjection(secondMove, SECOND_PACKAGE_SUBJECT_ENTITY_ID)
        .entityState.positionMetersXYZ[0] <
        requireSubjectProjection(secondStart, SECOND_PACKAGE_SUBJECT_ENTITY_ID)
          .entityState.positionMetersXYZ[0],
      "The second Package Definition instance did not move.",
    );
    assertPositionUnchanged(
      requireSubjectProjection(secondMove, FIRST_PACKAGE_SUBJECT_ENTITY_ID)
        .entityState.positionMetersXYZ,
      requireSubjectProjection(secondStart, FIRST_PACKAGE_SUBJECT_ENTITY_ID)
        .entityState.positionMetersXYZ,
      "The first Package Definition instance moved during second-instance input.",
    );
    assertPositionUnchanged(
      requireSubjectProjection(secondMove, PLAYER_ENTITY_ID).entityState
        .positionMetersXYZ,
      requireSubjectProjection(secondStart, PLAYER_ENTITY_ID).entityState
        .positionMetersXYZ,
      "The uncontrolled player moved during second-instance input.",
    );

    const reset = await page.evaluate(async () => window.__WORLDKIT__!.reset());
    assert.equal(reset.world.simulationTick, 0);
    assert.notEqual(reset.worldSessionId, secondMove.worldSessionId);
    assertPossessedBy(reset, "controller-primary", PLAYER_ENTITY_ID);
    assert.equal(reset.view.camera.mode, "tracking");
    assert.equal(
      reset.view.camera.mode === "tracking"
        ? reset.view.camera.targetEntityId
        : undefined,
      PLAYER_ENTITY_ID,
    );
    for (const entityId of [
      FIRST_PACKAGE_SUBJECT_ENTITY_ID,
      SECOND_PACKAGE_SUBJECT_ENTITY_ID,
      PLAYER_ENTITY_ID,
    ]) {
      const resetState = requireSubjectProjection(reset, entityId);
      const readyState = requireSubjectProjection(ready, entityId);
      assert.equal(
        resetState.entityState.entityDefinitionRef,
        readyState.entityState.entityDefinitionRef,
      );
      assert.equal(
        resetState.entityState.entityDefinitionHash,
        readyState.entityState.entityDefinitionHash,
      );
      assert.equal(
        requireLocomotionCapability(reset, entityId).movementMedium,
        requireLocomotionCapability(ready, entityId).movementMedium,
      );
      assert.equal(requireLocomotionCapability(reset, entityId).mode, "idle");
      assertPositionUnchanged(
        resetState.entityState.positionMetersXYZ,
        readyState.entityState.positionMetersXYZ,
        `Reset did not restore Subject Origin for '${entityId}'.`,
      );
      assert.ok(
        (resetState.entityState.linearVelocityMetersPerSecondXYZ ?? [0, 0, 0]).every(
          (velocity) => Math.abs(velocity) <= 1e-9,
        ),
        `Reset did not clear velocity for '${entityId}'.`,
      );
    }

    result = {
      wallStopPositionMetersXYZ: wallStopPlayer.positionMetersXYZ,
      lakeEntryPositionMetersXYZ: lakeEntryPlayer.positionMetersXYZ,
      firstPackageSubjectMovement: {
        beforePositionMetersXYZ:
          requireSubjectProjection(firstStart, FIRST_PACKAGE_SUBJECT_ENTITY_ID)
            .entityState.positionMetersXYZ,
        afterPositionMetersXYZ:
          requireSubjectProjection(firstMove, FIRST_PACKAGE_SUBJECT_ENTITY_ID)
            .entityState.positionMetersXYZ,
      },
      secondPackageSubjectMovement: {
        beforePositionMetersXYZ:
          requireSubjectProjection(secondStart, SECOND_PACKAGE_SUBJECT_ENTITY_ID)
            .entityState.positionMetersXYZ,
        afterPositionMetersXYZ:
          requireSubjectProjection(secondMove, SECOND_PACKAGE_SUBJECT_ENTITY_ID)
            .entityState.positionMetersXYZ,
      },
    };
  } catch (error) {
    primaryError = error;
  } finally {
    const cleanupErrors: unknown[] = [];
    for (const close of [
      () => page?.close(),
      () => context?.close(),
      () => browser?.close(),
      () => server?.stop(),
    ]) {
      try {
        await close();
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (cleanupErrors.length > 0) {
      const cleanupError = new AggregateError(
        cleanupErrors,
        "Canonical verifier cleanup failed.",
      );
      primaryError = primaryError === undefined
        ? cleanupError
        : new AggregateError(
            [primaryError, cleanupError],
            "Canonical verification and cleanup both failed.",
          );
    }
  }
  if (primaryError !== undefined) throw primaryError;
  assert.ok(result !== undefined);
  return result;
}

async function run(publicationMode: ArtifactPublicationMode): Promise<void> {
  const temporaryDirectory = await mkdtemp(
    path.join(path.dirname(TARGET_ARTIFACT_DIRECTORY), ".package-subject-world.tmp-"),
  );
  const paths = artifactPaths(temporaryDirectory);
  let artifacts: Awaited<ReturnType<typeof verifyArtifacts>>;
  let physics: Awaited<ReturnType<typeof verifyBrowserProtocolAndPhysics>>;
  let publication: Awaited<ReturnType<typeof finalizeArtifactDirectory>>;
  try {
    await runCliGates(paths);
    artifacts = await verifyArtifacts(paths);
    physics = await verifyBrowserProtocolAndPhysics();
    publication = await finalizeArtifactDirectory({
      mode: publicationMode,
      temporaryDirectory,
      targetDirectory: TARGET_ARTIFACT_DIRECTORY,
      expectedFilenames: CANONICAL_ARTIFACT_FILES,
    });
    if (
      publication.publicationMode === "update" &&
      publication.backupGarbageCollection === "deferred"
    ) {
      process.stderr.write(
        `Canonical artifact backup GC deferred at '${publication.deferredBackupDirectory}'.\n`,
      );
    }
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        protocolVersions: {
          authoring: 4,
          normalizedWorldIr: 4,
          executionPlan: 5,
          runtimeSnapshot: 4,
          browserProtocol: 5,
        },
        gates: [
          "strict-valid-input",
          "strict-invalid-input-rejection",
          "deterministic-v4-v5-build-artifact",
          "subject-explain-artifact",
          "playwright-capture",
          "browser-protocol-v5",
          "provider-neutral-runtime-health",
          "shared-package-definition",
          "independent-subject-runtime-state",
          "blocking-wall-collision",
          "lake-entry-closed-ground-air-medium",
          "atomic-control-switch-both-package-instances",
          "deterministic-reset",
        ],
        hashes: {
          normalizedWorldIr: artifacts.normalizedWorldIrHash,
          executionPlan: artifacts.executionPlanHash,
          subjectDefinition: artifacts.subjectDefinitionHash,
          resourceLock: artifacts.resourceLockHash,
        },
        publicationMode: publication.publicationMode,
        artifacts:
          publication.publicationMode === "update"
            ? {
                build: path.join(TARGET_ARTIFACT_DIRECTORY, "world.build.json"),
                screenshot: {
                  path: path.join(TARGET_ARTIFACT_DIRECTORY, "world.png"),
                  ...artifacts.dimensions,
                },
                snapshot: path.join(TARGET_ARTIFACT_DIRECTORY, "snapshot.json"),
                explain: path.join(TARGET_ARTIFACT_DIRECTORY, "explain.json"),
              }
            : { retained: false, screenshot: artifacts.dimensions },
        physicsBodyCount: artifacts.bodyCount,
        ...physics,
      },
      null,
      2,
    )}\n`,
  );
}

try {
  await run(parseArtifactPublicationMode(process.argv.slice(2)));
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
