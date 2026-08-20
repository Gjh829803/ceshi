import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

import {
  stringifyCanonicalJson,
  type NormalizedWorldIRV3,
} from "@whitebox-world/authoring";
import type {
  ExecutionPlanV4,
  SubjectRuntimeStateV3,
  Vec3,
  WorldRuntimeSnapshotV3,
} from "@whitebox-world/runtime-contracts";

import { promoteArtifactDirectory } from "./lib/artifact-directory-promotion";
import {
  inspectGBotProductAssetEvidence,
  type GBotProductAssetEvidenceV1,
} from "./lib/g-bot-evidence";
import {
  analyzeSubjectPoseCrop,
  compareSubjectPoseSilhouettes,
  deriveLoopQuarterCycleCaptureTick,
  type SubjectPoseAnalysisV1,
  type SubjectPoseEvidenceV1,
} from "./lib/subject-pose-evidence";
import {
  explainSubjectFile,
  type SubjectExplanationSuccessV1,
} from "./lib/subject-explain";
import { startWorldkitServer, type WorldkitServerHandle } from "./lib/worldkit-server";
import { main as worldkitMain } from "./worldkit";

const REPOSITORY_ROOT = fileURLToPath(new URL("../", import.meta.url));
const INPUT_PATH = path.join(
  REPOSITORY_ROOT,
  "examples/authoring/g-bot-subject-world.json",
);
const ASSET_PATH = path.join(
  REPOSITORY_ROOT,
  "apps/playground/public/subject-assets/humanoid/g-bot/v1/g-bot.glb",
);
const ASSET_MANIFEST_PATH = path.join(
  REPOSITORY_ROOT,
  "assets/subjects/humanoid/g-bot/asset.manifest.json",
);
const ACTION_MANIFEST_PATH = path.join(
  REPOSITORY_ROOT,
  "assets/subjects/humanoid/g-bot/action-manifest.json",
);
const TARGET_ARTIFACT_DIRECTORY = path.join(
  REPOSITORY_ROOT,
  "artifacts/examples/g-bot-subject-world",
);
const PRIMARY_ENTITY_ID = "g-bot-primary";
const SECONDARY_ENTITY_ID = "g-bot-secondary";
const CONTROLLER_ID = "controller-primary";
const SUBJECT_ASSET_REF = "worldkit://subject-asset/actor.humanoid.g-bot@1";
const SUBJECT_DEFINITION_REF = "worldkit://subject-definition/humanoid.g-bot@1";
const MINIMUM_SUBJECT_POSE_DIFFERENCE_RATIO = 0.12;
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
  readonly kind: "worldkit-build-artifact";
  readonly schemaVersion: 3;
  readonly normalizedWorldIrHash: string;
  readonly executionPlanHash: string;
  readonly normalizedWorldIr: NormalizedWorldIRV3;
  readonly executionPlan: ExecutionPlanV4;
}

interface ArtifactPaths {
  readonly directory: string;
  readonly build: string;
  readonly world: string;
  readonly snapshot: string;
  readonly explain: string;
  readonly verification: string;
  readonly action: Readonly<Record<ActionId, string>>;
}

interface PngInspection {
  readonly width: number;
  readonly height: number;
  readonly sha256: string;
}

interface ActionCaptureEvidence extends PngInspection {
  readonly filename: "idle.png" | "walk.png" | "run.png" | "jump.png";
  readonly source: "browser-fixed-tick";
  readonly tick: number;
  readonly actionId: ActionId;
  readonly subjectEntityId: typeof PRIMARY_ENTITY_ID;
  readonly positionMetersXYZ: Vec3;
  readonly movementMedium: SubjectRuntimeStateV3["movementMedium"];
  readonly subjectSilhouette: SubjectPoseEvidenceV1;
}

interface ActionCaptureResult {
  readonly evidence: ActionCaptureEvidence;
  readonly poseAnalysis: SubjectPoseAnalysisV1;
}

interface BrowserEvidence {
  readonly actions: Readonly<Record<ActionId, ActionCaptureEvidence>>;
  readonly poseGate: {
    readonly minimumDifferenceRatio: number;
    readonly walkCaptureTiming: {
      readonly actionStartTick: number;
      readonly blendDurationSeconds: number;
      readonly captureTick: number;
      readonly clipDurationSeconds: number;
      readonly fixedTicksPerSecond: number;
      readonly playbackSpeedRatio: number;
    };
    readonly comparisons: readonly {
      readonly firstActionId: ActionId;
      readonly secondActionId: ActionId;
      readonly differingPixelCount: number;
      readonly unionForegroundPixelCount: number;
      readonly differenceRatio: number;
    }[];
  };
  readonly isolation: {
    readonly observedEntityId: typeof PRIMARY_ENTITY_ID;
    readonly controlledEntityId: typeof SECONDARY_ENTITY_ID;
    readonly beforePositionMetersXYZ: Vec3;
    readonly afterPositionMetersXYZ: Vec3;
    readonly controlledBeforePositionMetersXYZ: Vec3;
    readonly controlledAfterPositionMetersXYZ: Vec3;
  };
  readonly wallStop: {
    readonly entityId: typeof SECONDARY_ENTITY_ID;
    readonly startPositionMetersXYZ: Vec3;
    readonly stopPositionMetersXYZ: Vec3;
    readonly maximumAllowedXMeters: number;
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
  const result = {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    sha256: sha256(bytes),
  };
  assert.ok(result.width >= 800 && result.height >= 450);
  return result;
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

async function inspectProductAsset(): Promise<GBotProductAssetEvidenceV1> {
  const [glbBytes, assetManifestText, actionManifestText] = await Promise.all([
    readFile(ASSET_PATH),
    readFile(ASSET_MANIFEST_PATH, "utf8"),
    readFile(ACTION_MANIFEST_PATH, "utf8"),
  ]);
  return inspectGBotProductAssetEvidence({
    glbBytes,
    assetManifest: parseJson<unknown>(assetManifestText, "G Bot asset manifest"),
    actionManifest: parseJson<unknown>(actionManifestText, "G Bot action manifest"),
  });
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
  const explanation = await explainSubjectFile(INPUT_PATH, PRIMARY_ENTITY_ID);
  assert.equal(explanation.ok, true);
  await writeFile(paths.explain, `${stringifyCanonicalJson(explanation)}\n`);

  const artifact = parseJson<WorldBuildArtifactV3>(
    await readFile(paths.build, "utf8"),
    "G Bot build artifact",
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
  assert.ok(
    artifact.executionPlan.subjects.every(
      (subject) => subject.subjectDefinitionRef === SUBJECT_DEFINITION_REF,
    ),
  );
  const explanationArtifact = explanation as SubjectExplanationSuccessV1;
  assert.equal(explanationArtifact.subject.entityId, PRIMARY_ENTITY_ID);
  assert.equal(explanationArtifact.subject.subjectDefinitionRef, SUBJECT_DEFINITION_REF);
  const snapshot = parseJson<WorldRuntimeSnapshotV3>(
    await readFile(paths.snapshot, "utf8"),
    "G Bot CLI snapshot",
  );
  assert.equal(snapshot.subjectStatesByEntityId[PRIMARY_ENTITY_ID]?.activeActionId, "idle");
  assert.equal(snapshot.subjectStatesByEntityId[SECONDARY_ENTITY_ID]?.activeActionId, "idle");
  inspectPng(await readFile(paths.world));
  return artifact;
}

async function closeBrowserHandles(handles: {
  readonly page: Page | undefined;
  readonly context: BrowserContext | undefined;
  readonly browser: Browser | undefined;
  readonly server: WorldkitServerHandle | undefined;
}): Promise<void> {
  const errors: unknown[] = [];
  for (const close of [
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
  if (errors.length > 0) throw new AggregateError(errors, "G Bot verifier cleanup failed.");
}

async function captureAction(
  page: Page,
  paths: ArtifactPaths,
  actionId: ActionId,
  actions: readonly ("move-forward" | "move-right" | "run" | "jump")[],
  ticks: number,
): Promise<ActionCaptureResult> {
  const reset = await page.evaluate(() => window.__WORLDKIT__!.reset());
  assert.equal(reset.tick, 0);
  assert.equal(reset.controlledEntityId, PRIMARY_ENTITY_ID);
  const snapshot = await page.evaluate(
    async ({ fixedActions, fixedTicks }) =>
      window.__WORLDKIT__!.runFixedInput([{ actions: fixedActions, ticks: fixedTicks }]),
    { fixedActions: actions, fixedTicks: ticks },
  );
  const state = snapshot.subjectStatesByEntityId[PRIMARY_ENTITY_ID];
  assert.ok(state !== undefined);
  assert.equal(state.activeActionId, actionId);
  if (actionId === "jump") assert.equal(state.movementMedium, "air");

  const capture = await page.evaluate(async () => {
    window.__WORLDKIT__!.captureScreenshot();
    const dataUrl = window.__WORLDKIT__!.captureScreenshot();
    const image = new Image();
    image.src = dataUrl;
    await image.decode();
    const boundsPixelsXYWH = [
      Math.floor(image.naturalWidth * 0.37),
      Math.floor(image.naturalHeight * 0.22),
      Math.ceil(image.naturalWidth * 0.26),
      Math.ceil(image.naturalHeight * 0.58),
    ] as const;
    const canvas = document.createElement("canvas");
    canvas.width = boundsPixelsXYWH[2];
    canvas.height = boundsPixelsXYWH[3];
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (context === null) throw new Error("G_BOT_POSE_CROP_UNAVAILABLE");
    context.drawImage(
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
    return {
      boundsPixelsXYWH,
      dataUrl,
      rgbaBytes: Array.from(
        context.getImageData(0, 0, boundsPixelsXYWH[2], boundsPixelsXYWH[3]).data,
      ),
    };
  });
  const bytes = pngBytesFromDataUrl(capture.dataUrl);
  await writeFile(paths.action[actionId], bytes);
  const poseAnalysis = analyzeSubjectPoseCrop({
    boundsPixelsXYWH: capture.boundsPixelsXYWH,
    rgbaBytes: Uint8Array.from(capture.rgbaBytes),
  });
  return {
    evidence: {
      filename: `${actionId}.png` as ActionCaptureEvidence["filename"],
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
  productAsset: GBotProductAssetEvidenceV1,
): Promise<BrowserEvidence> {
  const animationSet = artifact.executionPlan.animationSets.find(
    (candidate) => candidate.subjectAssetRef === SUBJECT_ASSET_REF,
  );
  assert.ok(animationSet !== undefined);
  const walkBinding = animationSet.animationBindings.find(
    (binding) => binding.actionId === "walk",
  );
  assert.ok(walkBinding !== undefined);
  const walkClipTiming = productAsset.sourceClipTimings.find(
    (timing) => timing.sourceClip === walkBinding.sourceClipName,
  );
  assert.ok(walkClipTiming !== undefined);

  let server: WorldkitServerHandle | undefined;
  let browser: Browser | undefined;
  let context: BrowserContext | undefined;
  let page: Page | undefined;
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
      fixedTicksPerSecond,
      playbackSpeedRatio: walkBinding.playbackSpeedRatio,
    };

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
      "CLI and Browser must capture the same paused reset world.",
    );

    const captures = {
      idle: await captureAction(page, paths, "idle", [], 12),
      walk: await captureAction(
        page,
        paths,
        "walk",
        ["move-right"],
        walkCaptureTiming.captureTick,
      ),
      run: await captureAction(page, paths, "run", ["move-right", "run"], 24),
      jump: await captureAction(page, paths, "jump", ["jump"], 30),
    } satisfies Record<ActionId, ActionCaptureResult>;
    const actions = {
      idle: captures.idle.evidence,
      walk: captures.walk.evidence,
      run: captures.run.evidence,
      jump: captures.jump.evidence,
    } satisfies Record<ActionId, ActionCaptureEvidence>;
    assert.equal(new Set(Object.values(actions).map((capture) => capture.sha256)).size, 4);
    const actionIds = ["idle", "walk", "run", "jump"] as const;
    const comparisons: BrowserEvidence["poseGate"]["comparisons"][number][] = [];
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
          `${firstActionId}/${secondActionId} pose difference ${comparison.differenceRatio}`,
        );
        comparisons.push({ firstActionId, secondActionId, ...comparison });
      }
    }

    const isolationBefore = await page.evaluate(() => window.__WORLDKIT__!.reset());
    const receipt = await page.evaluate(
      (request) => window.__WORLDKIT__!.bindControl(request),
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
    const primaryBefore = isolationBefore.subjectStatesByEntityId[PRIMARY_ENTITY_ID]!;
    const primaryAfter = isolationAfter.subjectStatesByEntityId[PRIMARY_ENTITY_ID]!;
    const secondaryBefore = isolationBefore.subjectStatesByEntityId[SECONDARY_ENTITY_ID]!;
    const secondaryAfter = isolationAfter.subjectStatesByEntityId[SECONDARY_ENTITY_ID]!;
    assertPositionUnchanged(
      primaryAfter.positionMetersXYZ,
      primaryBefore.positionMetersXYZ,
      "Uncontrolled G Bot moved during second-instance control.",
    );
    assert.equal(primaryAfter.activeActionId, "idle");
    assert.ok(secondaryAfter.positionMetersXYZ[0] > secondaryBefore.positionMetersXYZ[0]);
    assert.equal(secondaryAfter.activeActionId, "walk");

    const wallStart = await page.evaluate(() => window.__WORLDKIT__!.reset());
    const wallReceipt = await page.evaluate(
      (request) => window.__WORLDKIT__!.bindControl(request),
      {
        controllerId: CONTROLLER_ID,
        expectedControlledEntityId: PRIMARY_ENTITY_ID,
        controlledEntityId: SECONDARY_ENTITY_ID,
      },
    );
    assert.equal(wallReceipt.status, "committed");
    const wallEnd = await page.evaluate(async () =>
      window.__WORLDKIT__!.runFixedInput([{ actions: ["move-right"], ticks: 360 }]),
    );
    const wallStartState = wallStart.subjectStatesByEntityId[SECONDARY_ENTITY_ID]!;
    const wallEndState = wallEnd.subjectStatesByEntityId[SECONDARY_ENTITY_ID]!;
    assert.ok(wallEndState.positionMetersXYZ[0] > wallStartState.positionMetersXYZ[0] + 2);
    assert.ok(
      wallEndState.positionMetersXYZ[0] < 6.8,
      `G Bot crossed the wall at x=${wallEndState.positionMetersXYZ[0]}.`,
    );

    result = {
      actions,
      poseGate: {
        minimumDifferenceRatio: MINIMUM_SUBJECT_POSE_DIFFERENCE_RATIO,
        walkCaptureTiming,
        comparisons,
      },
      isolation: {
        observedEntityId: PRIMARY_ENTITY_ID,
        controlledEntityId: SECONDARY_ENTITY_ID,
        beforePositionMetersXYZ: primaryBefore.positionMetersXYZ,
        afterPositionMetersXYZ: primaryAfter.positionMetersXYZ,
        controlledBeforePositionMetersXYZ: secondaryBefore.positionMetersXYZ,
        controlledAfterPositionMetersXYZ: secondaryAfter.positionMetersXYZ,
      },
      wallStop: {
        entityId: SECONDARY_ENTITY_ID,
        startPositionMetersXYZ: wallStartState.positionMetersXYZ,
        stopPositionMetersXYZ: wallEndState.positionMetersXYZ,
        maximumAllowedXMeters: 6.8,
      },
    };
  } catch (error) {
    primaryError = error;
  } finally {
    try {
      await closeBrowserHandles({ page, context, browser, server });
    } catch (cleanupError) {
      primaryError =
        primaryError === undefined
          ? cleanupError
          : new AggregateError([primaryError, cleanupError], "G Bot verification cleanup failed.");
    }
  }
  if (primaryError !== undefined) throw primaryError;
  assert.ok(result !== undefined);
  return result;
}

async function writeVerification(
  paths: ArtifactPaths,
  artifact: WorldBuildArtifactV3,
  productAsset: GBotProductAssetEvidenceV1,
  browser: BrowserEvidence,
): Promise<void> {
  const cliSnapshot = parseJson<WorldRuntimeSnapshotV3>(
    await readFile(paths.snapshot, "utf8"),
    "G Bot CLI snapshot",
  );
  const compiledAsset = artifact.executionPlan.subjectAssets[0];
  assert.ok(compiledAsset !== undefined);
  assert.equal(compiledAsset.artifactContentHash, productAsset.artifactContentHash);
  const verification = {
    kind: "worldkit-g-bot-subject-verification",
    schemaVersion: 1,
    inputs: {
      authoringSpecSha256: sha256(await readFile(INPUT_PATH)),
      subjectAssetRef: compiledAsset.subjectAssetRef,
      subjectAssetSha256: productAsset.artifactContentHash,
      assetManifestSha256: sha256(await readFile(ASSET_MANIFEST_PATH)),
      actionManifestSha256: sha256(await readFile(ACTION_MANIFEST_PATH)),
      normalizedWorldIrHash: artifact.normalizedWorldIrHash,
      executionPlanHash: artifact.executionPlanHash,
    },
    productAsset,
    captures: [
      {
        filename: "world.png",
        source: "cli-capture",
        tick: cliSnapshot.tick,
        actionId: cliSnapshot.subjectStatesByEntityId[PRIMARY_ENTITY_ID]!.activeActionId,
        subjectEntityId: PRIMARY_ENTITY_ID,
        ...inspectPng(await readFile(paths.world)),
      },
      browser.actions.idle,
      browser.actions.walk,
      browser.actions.run,
      browser.actions.jump,
    ],
    poseGate: browser.poseGate,
    isolation: browser.isolation,
    wallStop: browser.wallStop,
  } as const;
  await writeFile(paths.verification, `${stringifyCanonicalJson(verification)}\n`);
}

async function run(): Promise<void> {
  try {
    await access(chromium.executablePath());
  } catch {
    throw new PlaywrightBrowserUnavailableError();
  }
  const temporaryDirectory = await mkdtemp(
    path.join(path.dirname(TARGET_ARTIFACT_DIRECTORY), ".g-bot-subject-world.tmp-"),
  );
  const paths = pathsFor(temporaryDirectory);
  let promoted = false;
  try {
    const productAsset = await inspectProductAsset();
    const artifact = await runCliGates(paths);
    const browser = await verifyBrowser(paths, artifact, productAsset);
    await writeVerification(paths, artifact, productAsset, browser);
    const promotion = await promoteArtifactDirectory({
      temporaryDirectory,
      targetDirectory: TARGET_ARTIFACT_DIRECTORY,
      expectedFilenames: ARTIFACT_FILES,
    });
    promoted = true;
    if (promotion.backupGarbageCollection === "deferred") {
      process.stderr.write(
        `G Bot artifact backup GC deferred at '${promotion.deferredBackupDirectory}'.\n`,
      );
    }
    process.stdout.write(
      `${JSON.stringify(
        {
          ok: true,
          artifacts: TARGET_ARTIFACT_DIRECTORY,
          hashes: {
            normalizedWorldIr: artifact.normalizedWorldIrHash,
            executionPlan: artifact.executionPlanHash,
            subjectAsset: productAsset.artifactContentHash,
          },
          actions: browser.actions,
          poseGate: browser.poseGate,
          isolation: browser.isolation,
          wallStop: browser.wallStop,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    if (!promoted) await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

try {
  await run();
} catch (error) {
  const code = error instanceof PlaywrightBrowserUnavailableError ? error.code : undefined;
  process.stderr.write(
    `${JSON.stringify({
      ok: false,
      ...(code === undefined ? {} : { code }),
      message: error instanceof Error ? error.message : String(error),
    })}\n`,
  );
  process.exitCode = 1;
}
