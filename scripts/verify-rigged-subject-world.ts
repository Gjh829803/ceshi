import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  access,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright";

import {
  stringifyCanonicalJson,
  type NormalizedWorldIRV3,
} from "@whitebox-world/authoring";
import type {
  ExecutionPlanV4,
  SubjectRuntimeStateV3,
  Vec3,
  WorldRuntimeSnapshotV3,
  WorldkitBrowserDiagnosticV1,
} from "@whitebox-world/runtime-contracts";

import {
  explainSubjectFile,
  type SubjectExplanationSuccessV1,
} from "./lib/subject-explain";
import { promoteArtifactDirectory } from "./lib/artifact-directory-promotion";
import {
  analyzeSubjectPoseCrop,
  compareSubjectPoseSilhouettes,
  deriveLoopQuarterCycleCaptureTick,
  readGlbAnimationClipTiming,
  type SubjectPoseAnalysisV1,
  type SubjectPoseEvidenceV1,
} from "./lib/subject-pose-evidence";
import {
  startWorldkitServer,
  type WorldkitServerHandle,
} from "./lib/worldkit-server";
import { main as worldkitMain } from "./worldkit";

const REPOSITORY_ROOT = fileURLToPath(new URL("../", import.meta.url));
const INPUT_PATH = path.join(
  REPOSITORY_ROOT,
  "examples/authoring/rigged-subject-world.json",
);
const ASSET_PATH = path.join(
  REPOSITORY_ROOT,
  "apps/playground/public/worldkit-assets/golden-humanoid.glb",
);
const TARGET_ARTIFACT_DIRECTORY = path.join(
  REPOSITORY_ROOT,
  "artifacts/examples/rigged-subject-world",
);
const PRIMARY_ENTITY_ID = "rigged-primary";
const SECONDARY_ENTITY_ID = "rigged-secondary";
const CONTROLLER_ID = "controller-primary";
const SUBJECT_ASSET_REF = "worldkit://subject-asset/humanoid.golden@1";
const ASSET_ROUTE_PATH = "/worldkit-assets/golden-humanoid.glb";
const MINIMUM_SUBJECT_POSE_DIFFERENCE_RATIO = 0.15;
const ARTIFACT_FILES = [
  "explain.json",
  "idle.png",
  "jump.png",
  "run.png",
  "snapshot.json",
  "verification.json",
  "walk.png",
  "world.build.json",
  "world.png",
] as const;

type ActionId = SubjectRuntimeStateV3["activeActionId"];

interface WorldBuildArtifactV3 {
  kind: "worldkit-build-artifact";
  schemaVersion: 3;
  normalizedWorldIrHash: string;
  executionPlanHash: string;
  normalizedWorldIr: NormalizedWorldIRV3;
  executionPlan: ExecutionPlanV4;
}

interface ArtifactPaths {
  directory: string;
  build: string;
  world: string;
  snapshot: string;
  explain: string;
  verification: string;
  action: Record<ActionId, string>;
}

interface PngInspection {
  width: number;
  height: number;
  sha256: string;
}

interface ActionCaptureEvidence extends PngInspection {
  filename: "idle.png" | "walk.png" | "run.png" | "jump.png";
  source: "browser-fixed-tick";
  tick: number;
  actionId: ActionId;
  subjectEntityId: typeof PRIMARY_ENTITY_ID;
  positionMetersXYZ: Vec3;
  movementMedium: SubjectRuntimeStateV3["movementMedium"];
  subjectSilhouette: SubjectPoseEvidenceV1;
}

interface ActionCaptureResult {
  evidence: ActionCaptureEvidence;
  poseAnalysis: SubjectPoseAnalysisV1;
}

interface PoseComparisonEvidence {
  firstActionId: ActionId;
  secondActionId: ActionId;
  differingPixelCount: number;
  unionForegroundPixelCount: number;
  differenceRatio: number;
}

interface BrowserEvidence {
  actions: Record<ActionId, ActionCaptureEvidence>;
  poseGate: {
    minimumDifferenceRatio: number;
    walkCaptureTiming: {
      actionStartTick: number;
      blendDurationSeconds: number;
      captureTick: number;
      clipDurationSeconds: number;
      framesPerSecond: number;
      fixedTicksPerSecond: number;
      playbackSpeedRatio: number;
    };
    comparisons: readonly PoseComparisonEvidence[];
  };
  isolation: {
    observedEntityId: typeof PRIMARY_ENTITY_ID;
    controlledEntityId: typeof SECONDARY_ENTITY_ID;
    beforePositionMetersXYZ: Vec3;
    afterPositionMetersXYZ: Vec3;
    beforeActiveActionId: ActionId;
    afterActiveActionId: ActionId;
    controlledBeforePositionMetersXYZ: Vec3;
    controlledBeforeActiveActionId: ActionId;
    controlledAfterPositionMetersXYZ: Vec3;
    controlledAfterActiveActionId: ActionId;
  };
  wallStop: {
    entityId: typeof SECONDARY_ENTITY_ID;
    startPositionMetersXYZ: Vec3;
    stopPositionMetersXYZ: Vec3;
    maximumAllowedXMeters: number;
  };
  tamper: {
    diagnosticCode: "SUBJECT_ASSET_HASH_MISMATCH";
    routeHits: 1;
    responseStatus: number;
    responseContentType: string;
    diskAssetSha256Before: string;
    diskAssetSha256After: string;
  };
}

class PlaywrightBrowserUnavailableError extends Error {
  readonly code = "CLI_PLAYWRIGHT_BROWSER_UNAVAILABLE";
  readonly name = "PlaywrightBrowserUnavailableError";

  constructor() {
    super("Playwright Chromium is unavailable.");
  }
}

function pathsFor(directory: string): ArtifactPaths {
  return {
    directory,
    build: path.join(directory, "world.build.json"),
    world: path.join(directory, "world.png"),
    snapshot: path.join(directory, "snapshot.json"),
    explain: path.join(directory, "explain.json"),
    verification: path.join(directory, "verification.json"),
    action: {
      idle: path.join(directory, "idle.png"),
      walk: path.join(directory, "walk.png"),
      run: path.join(directory, "run.png"),
      jump: path.join(directory, "jump.png"),
    },
  };
}

function sha256(bytes: Uint8Array | string): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function parseJson<T>(sourceText: string, label: string): T {
  try {
    return JSON.parse(sourceText) as T;
  } catch (error) {
    throw new Error(`${label} is not valid JSON.`, { cause: error });
  }
}

function inspectPng(bytes: Buffer): PngInspection {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  assert.ok(bytes.length >= 24, "PNG is too small to contain IHDR.");
  assert.ok(bytes.subarray(0, 8).equals(signature), "PNG signature is invalid.");
  assert.equal(bytes.subarray(12, 16).toString("ascii"), "IHDR");
  const inspection = {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    sha256: sha256(bytes),
  };
  assert.ok(
    inspection.width >= 800 && inspection.height >= 450,
    `PNG is only ${inspection.width}x${inspection.height}.`,
  );
  return inspection;
}

function pngBytesFromDataUrl(dataUrl: string): Buffer {
  const prefix = "data:image/png;base64,";
  assert.ok(dataUrl.startsWith(prefix), "Browser capture is not a PNG data URL.");
  return Buffer.from(dataUrl.slice(prefix.length), "base64");
}

function assertPositionUnchanged(actual: Vec3, expected: Vec3, message: string): void {
  const maximumDriftMeters = Math.max(
    ...actual.map((coordinate, index) => Math.abs(coordinate - expected[index]!)),
  );
  assert.ok(maximumDriftMeters <= 1e-9, `${message} Drift=${maximumDriftMeters}m.`);
}

async function runCliGates(paths: ArtifactPaths): Promise<WorldBuildArtifactV3> {
  assert.equal(await worldkitMain(["validate", INPUT_PATH, "--json"]), 0);
  assert.equal(
    await worldkitMain(["build", INPUT_PATH, "--output", paths.build, "--json"]),
    0,
  );
  const firstBuild = await readFile(paths.build);
  assert.equal(
    await worldkitMain(["build", INPUT_PATH, "--output", paths.build, "--json"]),
    0,
  );
  assert.ok((await readFile(paths.build)).equals(firstBuild));
  assert.equal(
    await worldkitMain([
      "capture",
      INPUT_PATH,
      "--output",
      paths.world,
      "--snapshot",
      paths.snapshot,
      "--json",
    ]),
    0,
  );
  assert.equal(
    await worldkitMain([
      "subject",
      "explain",
      INPUT_PATH,
      "--entity-id",
      PRIMARY_ENTITY_ID,
      "--json",
    ]),
    0,
  );
  const explanation = await explainSubjectFile(INPUT_PATH, PRIMARY_ENTITY_ID);
  assert.equal(explanation.ok, true);
  await writeFile(paths.explain, `${stringifyCanonicalJson(explanation)}\n`);

  const artifact = parseJson<WorldBuildArtifactV3>(
    await readFile(paths.build, "utf8"),
    "Rigged build artifact",
  );
  assert.equal(artifact.kind, "worldkit-build-artifact");
  assert.equal(artifact.schemaVersion, 3);
  assert.equal(artifact.normalizedWorldIr.schemaVersion, 3);
  assert.equal(artifact.executionPlan.schemaVersion, 4);
  assert.equal(artifact.executionPlan.runtimeBackend, "babylon-havok");
  assert.equal(artifact.executionPlan.controlledEntityId, PRIMARY_ENTITY_ID);
  assert.deepEqual(
    artifact.executionPlan.subjects.map((subject) => subject.entityId),
    [PRIMARY_ENTITY_ID, SECONDARY_ENTITY_ID],
  );
  assert.equal(artifact.executionPlan.subjectAssets.length, 1);
  assert.equal(artifact.executionPlan.subjectAssets[0]?.subjectAssetRef, SUBJECT_ASSET_REF);
  const explanationArtifact = parseJson<SubjectExplanationSuccessV1>(
    await readFile(paths.explain, "utf8"),
    "Rigged explain artifact",
  );
  assert.equal(explanationArtifact.ok, true);
  assert.equal(explanationArtifact.subject.entityId, PRIMARY_ENTITY_ID);
  assert.equal(explanationArtifact.subject.resourceLockEntries.length, 8);
  const snapshot = parseJson<WorldRuntimeSnapshotV3>(
    await readFile(paths.snapshot, "utf8"),
    "Rigged CLI snapshot",
  );
  assert.equal(snapshot.subjectStatesByEntityId[PRIMARY_ENTITY_ID]?.activeActionId, "idle");
  assert.equal(snapshot.subjectStatesByEntityId[SECONDARY_ENTITY_ID]?.activeActionId, "idle");
  inspectPng(await readFile(paths.world));
  return artifact;
}

async function closeBrowserHandles(handles: {
  tamperPage: Page | undefined;
  tamperContext: BrowserContext | undefined;
  page: Page | undefined;
  context: BrowserContext | undefined;
  browser: Browser | undefined;
  server: WorldkitServerHandle | undefined;
}): Promise<void> {
  const errors: unknown[] = [];
  for (const close of [
    () => handles.tamperPage?.close(),
    () => handles.tamperContext?.close(),
    () => handles.page?.close(),
    () => handles.context?.close(),
    () => handles.browser?.close(),
    () => handles.server?.stop(),
  ]) {
    try {
      await close();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length > 0) throw new AggregateError(errors, "Rigged verifier cleanup failed.");
}

async function captureAction(
  page: Page,
  paths: ArtifactPaths,
  actionId: ActionId,
  actions: readonly ("move-forward" | "run" | "jump")[],
  ticks: number,
): Promise<ActionCaptureResult> {
  const reset = await page.evaluate(() => window.__WORLDKIT__!.reset());
  assert.equal(reset.tick, 0);
  assert.equal(reset.controlledEntityId, PRIMARY_ENTITY_ID);
  assert.equal(reset.subjectStatesByEntityId[PRIMARY_ENTITY_ID]?.activeActionId, "idle");
  const snapshot = await page.evaluate(
    async ({ actions: fixedActions, ticks: fixedTicks }) =>
      window.__WORLDKIT__!.runFixedInput([{ actions: fixedActions, ticks: fixedTicks }]),
    { actions, ticks },
  );
  const state = snapshot.subjectStatesByEntityId[PRIMARY_ENTITY_ID];
  assert.ok(state !== undefined);
  assert.equal(state.activeActionId, actionId);
  if (actionId === "jump") {
    assert.equal(state.movementMedium, "air", "Jump capture must remain airborne.");
  }
  const capture = await page.evaluate(async () => {
    window.__WORLDKIT__!.captureScreenshot();
    const dataUrl = window.__WORLDKIT__!.captureScreenshot();
    const image = new Image();
    image.src = dataUrl;
    await image.decode();
    const boundsPixelsXYWH = [
      Math.floor(image.naturalWidth * 0.4),
      Math.floor(image.naturalHeight * 0.28),
      Math.ceil(image.naturalWidth * 0.2),
      Math.ceil(image.naturalHeight * 0.48),
    ] as const;
    const cropCanvas = document.createElement("canvas");
    cropCanvas.width = boundsPixelsXYWH[2];
    cropCanvas.height = boundsPixelsXYWH[3];
    const cropContext = cropCanvas.getContext("2d", { willReadFrequently: true });
    if (cropContext === null) throw new Error("SUBJECT_POSE_CROP_UNAVAILABLE");
    cropContext.drawImage(
      image,
      boundsPixelsXYWH[0],
      boundsPixelsXYWH[1],
      boundsPixelsXYWH[2],
      boundsPixelsXYWH[3],
      0,
      0,
      boundsPixelsXYWH[2],
      boundsPixelsXYWH[3],
    );
    const rgbaBytes = cropContext.getImageData(
      0,
      0,
      boundsPixelsXYWH[2],
      boundsPixelsXYWH[3],
    ).data;
    return {
      boundsPixelsXYWH,
      dataUrl,
      rgbaBytes: Array.from(rgbaBytes),
    };
  });
  const bytes = pngBytesFromDataUrl(capture.dataUrl);
  const actionOutputPath = paths.action[actionId];
  assert.ok(actionOutputPath !== undefined);
  await writeFile(actionOutputPath, bytes);
  const filename = `${actionId}.png` as ActionCaptureEvidence["filename"];
  const poseAnalysis = analyzeSubjectPoseCrop({
    boundsPixelsXYWH: capture.boundsPixelsXYWH,
    rgbaBytes: Uint8Array.from(capture.rgbaBytes),
  });
  return {
    evidence: {
      filename,
      source: "browser-fixed-tick",
      tick: snapshot.tick,
      actionId,
      subjectEntityId: PRIMARY_ENTITY_ID,
      positionMetersXYZ: state.positionMetersXYZ,
      movementMedium: state.movementMedium,
      subjectSilhouette: poseAnalysis.evidence,
      ...inspectPng(bytes),
    },
    poseAnalysis,
  };
}

async function verifyBrowser(
  paths: ArtifactPaths,
  artifact: WorldBuildArtifactV3,
): Promise<BrowserEvidence> {
  const walkClipTiming = readGlbAnimationClipTiming(
    await readFile(ASSET_PATH),
    "walk",
  );
  const animationSets = artifact.executionPlan.animationSets.filter(
    (animationSet) => animationSet.subjectAssetRef === SUBJECT_ASSET_REF,
  );
  assert.equal(animationSets.length, 1);
  const walkBindings = animationSets[0]!.animationBindings.filter(
    (binding) => binding.actionId === "walk",
  );
  assert.equal(walkBindings.length, 1);
  const walkBinding = walkBindings[0]!;
  assert.equal(walkBinding.loopMode, "repeat");
  let server: WorldkitServerHandle | undefined;
  let browser: Browser | undefined;
  let context: BrowserContext | undefined;
  let page: Page | undefined;
  let tamperContext: BrowserContext | undefined;
  let tamperPage: Page | undefined;
  let result: BrowserEvidence | undefined;
  let primaryError: unknown;
  try {
    server = await startWorldkitServer({ inputPath: INPUT_PATH });
    try {
      browser = await chromium.launch({ headless: true });
    } catch {
      throw new PlaywrightBrowserUnavailableError();
    }
    context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    page = await context.newPage();
    await page.goto(server.url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForFunction(() => window.__WORLDKIT__ !== undefined, undefined, {
      timeout: 30_000,
    });
    const ready = await page.evaluate(async () => window.__WORLDKIT__!.ready());
    assert.equal(ready.controlledEntityId, PRIMARY_ENTITY_ID);
    assert.deepEqual(Object.keys(ready.subjectStatesByEntityId).sort(), [
      PRIMARY_ENTITY_ID,
      SECONDARY_ENTITY_ID,
    ]);
    const fixedTicksPerSecond = 1 / ready.physics.fixedTimeStepSeconds;
    assert.ok(Number.isSafeInteger(fixedTicksPerSecond));
    const walkCaptureTiming = {
      actionStartTick: 1,
      blendDurationSeconds: walkBinding.blendDurationSeconds,
      captureTick: deriveLoopQuarterCycleCaptureTick({
        actionStartTick: 1,
        blendDurationSeconds: walkBinding.blendDurationSeconds,
        clipDurationSeconds: walkClipTiming.durationSeconds,
        fixedTicksPerSecond,
        playbackSpeedRatio: walkBinding.playbackSpeedRatio,
      }),
      clipDurationSeconds: walkClipTiming.durationSeconds,
      framesPerSecond: walkClipTiming.framesPerSecond,
      fixedTicksPerSecond,
      playbackSpeedRatio: walkBinding.playbackSpeedRatio,
    } as const;
    await page.evaluate(async () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
    );
    await page.evaluate(() => window.__WORLDKIT__!.setPaused(true));
    const fixedReset = await page.evaluate(() => window.__WORLDKIT__!.reset());
    assert.equal(fixedReset.tick, 0);
    await page.evaluate(async () => {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    });
    await page.evaluate(() => window.__WORLDKIT__!.captureScreenshot());
    const fixedResetBytes = pngBytesFromDataUrl(
      await page.evaluate(() => window.__WORLDKIT__!.captureScreenshot()),
    );
    assert.equal(
      sha256(fixedResetBytes),
      sha256(await readFile(paths.world)),
      "CLI world.png must render the same paused reset Tick as snapshot.json.",
    );

    const captures = {
      idle: await captureAction(page, paths, "idle", [], 12),
      walk: await captureAction(
        page,
        paths,
        "walk",
        ["move-forward"],
        walkCaptureTiming.captureTick,
      ),
      run: await captureAction(page, paths, "run", ["move-forward", "run"], 24),
      jump: await captureAction(page, paths, "jump", ["jump"], 12),
    } satisfies Record<ActionId, ActionCaptureResult>;
    const actions = {
      idle: captures.idle.evidence,
      walk: captures.walk.evidence,
      run: captures.run.evidence,
      jump: captures.jump.evidence,
    } satisfies Record<ActionId, ActionCaptureEvidence>;
    assert.equal(new Set(Object.values(actions).map((item) => item.sha256)).size, 4,
      "Action screenshots must have pairwise-distinct hashes.");
    const actionIds = ["idle", "walk", "run", "jump"] as const;
    const poseComparisons: PoseComparisonEvidence[] = [];
    for (let firstIndex = 0; firstIndex < actionIds.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < actionIds.length; secondIndex += 1) {
        const firstActionId = actionIds[firstIndex]!;
        const secondActionId = actionIds[secondIndex]!;
        const comparison = compareSubjectPoseSilhouettes(
          captures[firstActionId].poseAnalysis,
          captures[secondActionId].poseAnalysis,
        );
        assert.ok(
          comparison.differenceRatio >= MINIMUM_SUBJECT_POSE_DIFFERENCE_RATIO,
          `${firstActionId}/${secondActionId} Subject silhouette difference ` +
            `${comparison.differenceRatio.toFixed(6)} is below ` +
            `${MINIMUM_SUBJECT_POSE_DIFFERENCE_RATIO}.`,
        );
        poseComparisons.push({ firstActionId, secondActionId, ...comparison });
      }
    }

    const isolationBefore = await page.evaluate(() => window.__WORLDKIT__!.reset());
    const receipt = await page.evaluate(
      ({ controllerId, expectedControlledEntityId, controlledEntityId }) =>
        window.__WORLDKIT__!.bindControl({
          controllerId,
          expectedControlledEntityId,
          controlledEntityId,
        }),
      {
        controllerId: CONTROLLER_ID,
        expectedControlledEntityId: PRIMARY_ENTITY_ID,
        controlledEntityId: SECONDARY_ENTITY_ID,
      },
    );
    assert.equal(receipt.status, "committed");
    const isolationAfter = await page.evaluate(async () =>
      window.__WORLDKIT__!.runFixedInput([{ actions: ["move-right"], ticks: 60 }]),
    );
    const firstBefore = isolationBefore.subjectStatesByEntityId[PRIMARY_ENTITY_ID]!;
    const firstAfter = isolationAfter.subjectStatesByEntityId[PRIMARY_ENTITY_ID]!;
    const secondBefore = isolationBefore.subjectStatesByEntityId[SECONDARY_ENTITY_ID]!;
    const secondAfter = isolationAfter.subjectStatesByEntityId[SECONDARY_ENTITY_ID]!;
    assertPositionUnchanged(
      firstAfter.positionMetersXYZ,
      firstBefore.positionMetersXYZ,
      "Uncontrolled first instance moved while controlling the second.",
    );
    assert.equal(firstBefore.activeActionId, "idle");
    assert.equal(firstAfter.activeActionId, "idle");
    assert.ok(
      secondAfter.positionMetersXYZ[0] > secondBefore.positionMetersXYZ[0],
      "Controlled second instance did not move right.",
    );
    assert.equal(secondAfter.activeActionId, "walk");

    const wallStart = await page.evaluate(() => window.__WORLDKIT__!.reset());
    const wallReceipt = await page.evaluate(
      ({ controllerId, expectedControlledEntityId, controlledEntityId }) =>
        window.__WORLDKIT__!.bindControl({
          controllerId,
          expectedControlledEntityId,
          controlledEntityId,
        }),
      {
        controllerId: CONTROLLER_ID,
        expectedControlledEntityId: PRIMARY_ENTITY_ID,
        controlledEntityId: SECONDARY_ENTITY_ID,
      },
    );
    assert.equal(wallReceipt.status, "committed");
    const wallStop = await page.evaluate(async () =>
      window.__WORLDKIT__!.runFixedInput([{ actions: ["move-right"], ticks: 360 }]),
    );
    const wallStartState = wallStart.subjectStatesByEntityId[SECONDARY_ENTITY_ID]!;
    const wallStopState = wallStop.subjectStatesByEntityId[SECONDARY_ENTITY_ID]!;
    assert.ok(wallStopState.positionMetersXYZ[0] > wallStartState.positionMetersXYZ[0] + 2);
    assert.ok(
      wallStopState.positionMetersXYZ[0] < 6.2,
      `Rigged subject crossed the wall at x=${wallStopState.positionMetersXYZ[0]}.`,
    );

    const finalReset = await page.evaluate(() => window.__WORLDKIT__!.reset());
    assert.equal(finalReset.tick, 0);
    assert.equal(finalReset.controlledEntityId, PRIMARY_ENTITY_ID);
    assert.equal(finalReset.subjectStatesByEntityId[PRIMARY_ENTITY_ID]?.activeActionId, "idle");

    const diskAssetBytesBefore = await readFile(ASSET_PATH);
    const diskAssetSha256Before = sha256(diskAssetBytesBefore);
    tamperContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    tamperPage = await tamperContext.newPage();
    let routeHits = 0;
    let responseStatus = 0;
    let responseContentType = "";
    const compiledAsset = artifact.executionPlan.subjectAssets.find(
      (asset) => asset.subjectAssetRef === SUBJECT_ASSET_REF,
    );
    assert.ok(compiledAsset !== undefined);
    const exactAssetUrl = new URL(ASSET_ROUTE_PATH, server.url);
    exactAssetUrl.searchParams.set(
      "worldkit-content-hash",
      compiledAsset.artifactContentHash,
    );
    await tamperPage.route(exactAssetUrl.href, async (route) => {
      routeHits += 1;
      assert.equal(routeHits, 1, "Tamper fixture requested the GLB more than once.");
      const response = await route.fetch();
      responseStatus = response.status();
      const headers = response.headers();
      responseContentType = headers["content-type"] ?? "";
      const body = await response.body();
      assert.ok(body.length > 32);
      const tamperedBody = Buffer.from(body);
      tamperedBody[Math.floor(tamperedBody.length / 2)]! ^= 1;
      await route.fulfill({
        status: responseStatus,
        headers,
        body: tamperedBody,
      });
    });
    await tamperPage.goto(server.url, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await tamperPage.waitForFunction(() => window.__WORLDKIT__ !== undefined, undefined, {
      timeout: 30_000,
    });
    const tamperResult = await tamperPage.evaluate(async () => {
      const api = window.__WORLDKIT__!;
      let rejectionCode: string | undefined;
      try {
        await api.ready();
      } catch (error) {
        rejectionCode = (error as { code?: string }).code;
      }
      return {
        rejectionCode,
        diagnostics: api.getDiagnostics(),
      };
    });
    assert.equal(tamperResult.rejectionCode, "SUBJECT_ASSET_HASH_MISMATCH");
    assert.deepEqual(
      tamperResult.diagnostics.map((diagnostic: WorldkitBrowserDiagnosticV1) => diagnostic.code),
      ["SUBJECT_ASSET_HASH_MISMATCH"],
    );
    assert.equal(routeHits, 1);
    assert.equal(responseStatus, 200);
    assert.ok(responseContentType.length > 0);
    const diskAssetBytesAfter = await readFile(ASSET_PATH);
    const diskAssetSha256After = sha256(diskAssetBytesAfter);
    assert.ok(
      diskAssetBytesAfter.equals(diskAssetBytesBefore),
      "Tamper interception must not change committed GLB bytes.",
    );
    assert.equal(diskAssetSha256After, diskAssetSha256Before);

    result = {
      actions,
      poseGate: {
        minimumDifferenceRatio: MINIMUM_SUBJECT_POSE_DIFFERENCE_RATIO,
        walkCaptureTiming,
        comparisons: poseComparisons,
      },
      isolation: {
        observedEntityId: PRIMARY_ENTITY_ID,
        controlledEntityId: SECONDARY_ENTITY_ID,
        beforePositionMetersXYZ: firstBefore.positionMetersXYZ,
        afterPositionMetersXYZ: firstAfter.positionMetersXYZ,
        beforeActiveActionId: firstBefore.activeActionId,
        afterActiveActionId: firstAfter.activeActionId,
        controlledBeforePositionMetersXYZ: secondBefore.positionMetersXYZ,
        controlledBeforeActiveActionId: secondBefore.activeActionId,
        controlledAfterPositionMetersXYZ: secondAfter.positionMetersXYZ,
        controlledAfterActiveActionId: secondAfter.activeActionId,
      },
      wallStop: {
        entityId: SECONDARY_ENTITY_ID,
        startPositionMetersXYZ: wallStartState.positionMetersXYZ,
        stopPositionMetersXYZ: wallStopState.positionMetersXYZ,
        maximumAllowedXMeters: 6.2,
      },
      tamper: {
        diagnosticCode: "SUBJECT_ASSET_HASH_MISMATCH",
        routeHits: 1,
        responseStatus,
        responseContentType,
        diskAssetSha256Before,
        diskAssetSha256After,
      },
    };
  } catch (error) {
    primaryError = error;
  } finally {
    try {
      await closeBrowserHandles({
        tamperPage,
        tamperContext,
        page,
        context,
        browser,
        server,
      });
    } catch (cleanupError) {
      if (primaryError === undefined) primaryError = cleanupError;
      else primaryError = new AggregateError([primaryError, cleanupError],
        "Rigged verification and cleanup both failed.");
    }
  }
  if (primaryError !== undefined) throw primaryError;
  assert.ok(result !== undefined);
  return result;
}

async function writeVerification(
  paths: ArtifactPaths,
  artifact: WorldBuildArtifactV3,
  browser: BrowserEvidence,
): Promise<void> {
  const worldInspection = inspectPng(await readFile(paths.world));
  const cliSnapshot = parseJson<WorldRuntimeSnapshotV3>(
    await readFile(paths.snapshot, "utf8"),
    "Rigged CLI snapshot",
  );
  const asset = artifact.executionPlan.subjectAssets[0];
  assert.ok(asset !== undefined);
  assert.equal(
    sha256(await readFile(ASSET_PATH)),
    asset.artifactContentHash,
    "Committed GLB bytes must match the compiled Asset descriptor.",
  );
  const verification = {
    kind: "worldkit-rigged-subject-verification",
    schemaVersion: 2,
    inputs: {
      authoringSpecSha256: sha256(await readFile(INPUT_PATH)),
      subjectAssetRef: asset.subjectAssetRef,
      subjectAssetSha256: asset.artifactContentHash,
      normalizedWorldIrHash: artifact.normalizedWorldIrHash,
      executionPlanHash: artifact.executionPlanHash,
    },
    captures: [
      {
        filename: "world.png",
        source: "cli-capture",
        tick: cliSnapshot.tick,
        actionId: cliSnapshot.subjectStatesByEntityId[PRIMARY_ENTITY_ID]!.activeActionId,
        subjectEntityId: PRIMARY_ENTITY_ID,
        ...worldInspection,
      },
      browser.actions.idle,
      browser.actions.walk,
      browser.actions.run,
      browser.actions.jump,
    ],
    poseGate: browser.poseGate,
    isolation: browser.isolation,
    wallStop: browser.wallStop,
    tamper: browser.tamper,
  } as const;
  const actionHashes = verification.captures
    .flatMap((capture) =>
      capture !== undefined &&
      capture.source === "browser-fixed-tick" &&
      "sha256" in capture &&
      typeof capture.sha256 === "string"
        ? [capture.sha256]
        : []
    );
  assert.equal(new Set(actionHashes).size, 4);
  await writeFile(paths.verification, `${stringifyCanonicalJson(verification)}\n`);
}

async function run(): Promise<void> {
  try {
    await access(chromium.executablePath());
  } catch {
    throw new PlaywrightBrowserUnavailableError();
  }
  const temporaryDirectory = await mkdtemp(
    path.join(path.dirname(TARGET_ARTIFACT_DIRECTORY), ".rigged-subject-world.tmp-"),
  );
  const paths = pathsFor(temporaryDirectory);
  let promoted = false;
  try {
    const artifact = await runCliGates(paths);
    const browser = await verifyBrowser(paths, artifact);
    await writeVerification(paths, artifact, browser);
    const promotion = await promoteArtifactDirectory({
      temporaryDirectory,
      targetDirectory: TARGET_ARTIFACT_DIRECTORY,
      expectedFilenames: ARTIFACT_FILES,
    });
    promoted = true;
    if (promotion.backupGarbageCollection === "deferred") {
      process.stderr.write(
        `Rigged artifact backup GC deferred at '${promotion.deferredBackupDirectory}'.\n`,
      );
    }
    process.stdout.write(`${JSON.stringify({
      ok: true,
      artifacts: TARGET_ARTIFACT_DIRECTORY,
      hashes: {
        normalizedWorldIr: artifact.normalizedWorldIrHash,
        executionPlan: artifact.executionPlanHash,
        subjectAsset: artifact.executionPlan.subjectAssets[0]?.artifactContentHash,
      },
      actionScreenshots: browser.actions,
      poseGate: browser.poseGate,
      isolation: browser.isolation,
      wallStop: browser.wallStop,
      tamper: browser.tamper,
    }, null, 2)}\n`);
  } finally {
    if (!promoted) await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

try {
  await run();
} catch (error) {
  const code = error instanceof PlaywrightBrowserUnavailableError ? error.code : undefined;
  process.stderr.write(`${JSON.stringify({
    ok: false,
    ...(code === undefined ? {} : { code }),
    message: error instanceof Error ? error.message : String(error),
  })}\n`);
  process.exitCode = 1;
}
