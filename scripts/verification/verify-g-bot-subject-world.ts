import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import type { Browser, BrowserContext, Page } from "playwright";
import { isNil } from "lodash-es";

import {
  type NormalizedWorldIRV4,
} from "@whitebox-world/authoring";
import { stringifyCanonicalJson } from "@whitebox-world/protocol";
import { builtInSubjectResourceRegistry } from "@whitebox-world/subject-registry";
import type {
  CanonicalSceneExecutionPlanV1,
  RuntimeVec3V1,
  WorldRuntimeBootstrapV1,
  WorldRuntimeSnapshotV4,
} from "@whitebox-world/runtime-contracts";

import {
  finalizeArtifactDirectory,
  parseArtifactPublicationMode,
  type ArtifactPublicationMode,
} from "../lib/artifact-directory-promotion";
import { buildWorldArtifactFileV1 } from "../cli/build-world-artifact";
import {
  inspectProductAssetEvidence,
  type ProductAssetEvidenceV1,
} from "../lib/product-asset-evidence";
import {
  assertProductAssetIntakeBindingsV1,
  parseProductAssetIntakeFixtureV1,
} from "../lib/product-asset-intake";
import {
  analyzeSubjectPoseCrop,
  compareSubjectPoseSilhouettes,
  deriveLoopQuarterCycleCaptureTick,
  type SubjectPoseAnalysisV1,
  type SubjectPoseEvidenceV1,
} from "../lib/subject-pose-evidence";
import {
  explainSubjectFile,
  type SubjectExplanationSuccessV1,
} from "../lib/subject-explain";
import { startWorldkitServer, type WorldkitServerHandle } from "../lib/worldkit-server";
import { launchChromiumWithSystemFallback } from "../lib/playwright-browser-launch";
import { main as worldkitMain } from "../cli/worldkit";
import { PLAYGROUND_SUBJECT_ASSET_URI_BY_REF_V1 } from "@whitebox-world/playground/asset-resolver";
import { requireActivePublishedLocomotionV1 } from "./locomotion-capability-state.js";

const REPOSITORY_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const DEFAULT_INTAKE_FIXTURE_REPOSITORY_PATH =
  "examples/product-asset-intakes/humanoid.g-bot@2.json";

function parseVerifierArguments(arguments_: readonly string[]): {
  readonly intakeFixtureRepositoryPath: string;
  readonly publicationMode: ArtifactPublicationMode;
} {
  let intakeFixtureRepositoryPath = DEFAULT_INTAKE_FIXTURE_REPOSITORY_PATH;
  const publicationArguments: string[] = [];
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument !== "--fixture") {
      publicationArguments.push(argument!);
      continue;
    }
    const fixturePath = arguments_[index + 1];
    if (fixturePath === undefined || fixturePath.startsWith("-")) {
      throw new Error("PRODUCT_ASSET_VERIFIER_FIXTURE_REQUIRED");
    }
    intakeFixtureRepositoryPath = fixturePath;
    index += 1;
  }
  const absoluteFixturePath = path.resolve(
    REPOSITORY_ROOT,
    intakeFixtureRepositoryPath,
  );
  const relativeFixturePath = path.relative(REPOSITORY_ROOT, absoluteFixturePath);
  if (
    path.isAbsolute(intakeFixtureRepositoryPath) ||
    relativeFixturePath.startsWith("..") ||
    path.isAbsolute(relativeFixturePath) ||
    !relativeFixturePath.startsWith("examples/product-asset-intakes/")
  ) {
    throw new Error("PRODUCT_ASSET_VERIFIER_FIXTURE_PATH_INVALID");
  }
  return {
    intakeFixtureRepositoryPath: relativeFixturePath,
    publicationMode: parseArtifactPublicationMode(publicationArguments),
  };
}

const VERIFIER_ARGUMENTS = parseVerifierArguments(process.argv.slice(2));
const INTAKE_FIXTURE = parseProductAssetIntakeFixtureV1(
  JSON.parse(
    readFileSync(
      path.join(REPOSITORY_ROOT, VERIFIER_ARGUMENTS.intakeFixtureRepositoryPath),
      "utf8",
    ),
  ) as unknown,
);
assertProductAssetIntakeBindingsV1(INTAKE_FIXTURE, {
  registry: builtInSubjectResourceRegistry,
  hostPublicUriBySubjectAssetRef: PLAYGROUND_SUBJECT_ASSET_URI_BY_REF_V1,
});
const INPUT_PATH = path.join(REPOSITORY_ROOT, INTAKE_FIXTURE.authoringWorldPath);
const ASSET_PATH = path.join(REPOSITORY_ROOT, INTAKE_FIXTURE.glbRepositoryPath);
const ASSET_MANIFEST_PATH = path.join(
  REPOSITORY_ROOT,
  INTAKE_FIXTURE.productAssetManifestPath,
);
const ACTION_MANIFEST_PATH = path.join(
  REPOSITORY_ROOT,
  INTAKE_FIXTURE.productActionManifestPath,
);
const TARGET_ARTIFACT_DIRECTORY = path.join(
  REPOSITORY_ROOT,
  INTAKE_FIXTURE.artifactDirectoryPath,
);
const PRIMARY_ENTITY_ID = INTAKE_FIXTURE.primaryEntityId;
const CONTROLLER_ID = INTAKE_FIXTURE.controllerId;
const SUBJECT_ASSET_REF = INTAKE_FIXTURE.subjectAssetRef;
const SUBJECT_DEFINITION_REF = INTAKE_FIXTURE.subjectDefinitionRef;
const MINIMUM_SUBJECT_POSE_DIFFERENCE_RATIO =
  INTAKE_FIXTURE.minimumSubjectPoseDifferenceRatio;
const SUBJECT_DEFINITION = (() => {
  const definition = builtInSubjectResourceRegistry.resolveSubjectDefinition(
    SUBJECT_DEFINITION_REF,
  );
  if (isNil(definition)) throw new Error("PRODUCT_ASSET_SUBJECT_DEFINITION_MISSING");
  return definition;
})();
const CONTROL_FEEL_PROFILE = (() => {
  const profile = builtInSubjectResourceRegistry.resolveControlFeelProfile(
    SUBJECT_DEFINITION.profiles.controlFeelProfileRef,
  );
  if (isNil(profile)) throw new Error("PRODUCT_ASSET_CONTROL_FEEL_PROFILE_MISSING");
  return profile;
})();
const SPLIT_JUMP_POLICY = CONTROL_FEEL_PROFILE.jumpVariantPolicy.mode ===
    "run-selects-variant"
  ? CONTROL_FEEL_PROFILE.jumpVariantPolicy
  : undefined;
const ARTIFACT_FILES = [
  "explain.json",
  "idle.png",
  "jump.png",
  ...(SPLIT_JUMP_POLICY === undefined ? [] : ["jump-large.png"] as const),
  "run.png",
  "snapshot.json",
  "verification.json",
  "walk.png",
  "world.build.json",
  "world.png",
] as const;

type ActionId = "idle" | "walk" | "run" | "jump";
type CaptureActionId = "idle" | "walk" | "run" | "jump";

interface WorldBuildArtifactV4 {
  readonly kind: "worldkit-build-artifact";
  readonly schemaVersion: 4;
  readonly normalizedWorldIrHash: string;
  readonly executionPlanHash: string;
  readonly normalizedWorldIr: NormalizedWorldIRV4;
  readonly executionPlan: CanonicalSceneExecutionPlanV1;
  readonly worldRuntimeBootstrap: WorldRuntimeBootstrapV1;
}

interface ArtifactPaths {
  readonly directory: string;
  readonly build: string;
  readonly world: string;
  readonly snapshot: string;
  readonly explain: string;
  readonly verification: string;
  readonly action: Readonly<Record<CaptureActionId, string>>;
  readonly jumpLarge: string;
}

interface PngInspection {
  readonly width: number;
  readonly height: number;
  readonly sha256: string;
}

interface ActionCaptureEvidence extends PngInspection {
  readonly filename:
    | "idle.png"
    | "walk.png"
    | "run.png"
    | "jump.png"
    | "jump-large.png";
  readonly source: "browser-fixed-tick";
  readonly tick: number;
  readonly actionId: CaptureActionId;
  readonly subjectEntityId: typeof PRIMARY_ENTITY_ID;
  readonly positionMetersXYZ: RuntimeVec3V1;
  readonly movementMedium: "ground" | "air";
  readonly subjectSilhouette: SubjectPoseEvidenceV1;
}

interface ActionCaptureResult {
  readonly evidence: ActionCaptureEvidence;
  readonly poseAnalysis: SubjectPoseAnalysisV1;
}

interface JumpCycleSampleEvidence {
  readonly tick: number;
  readonly positionMetersXYZ: RuntimeVec3V1;
  readonly movementMedium: "ground" | "air";
}

interface JumpCycleEvidence {
  readonly source: "browser-fixed-tick";
  readonly subjectEntityId: typeof PRIMARY_ENTITY_ID;
  readonly spawn: JumpCycleSampleEvidence;
  readonly takeoff: JumpCycleSampleEvidence;
  readonly apex: JumpCycleSampleEvidence;
  readonly fall: JumpCycleSampleEvidence;
  readonly land: JumpCycleSampleEvidence;
  readonly reset: JumpCycleSampleEvidence;
}

interface BrowserEvidence {
  readonly actions: Readonly<Record<ActionId, ActionCaptureEvidence>>;
  readonly jumpCycle: JumpCycleEvidence;
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
  readonly wallStop: {
    readonly entityId: typeof PRIMARY_ENTITY_ID;
    readonly startPositionMetersXYZ: RuntimeVec3V1;
    readonly stopPositionMetersXYZ: RuntimeVec3V1;
    readonly maximumAllowedXMeters: number;
  };
  readonly splitJump?: {
    readonly controlFeelProfileRef: string;
    readonly controlFeelProfileHash: string;
    readonly policy: NonNullable<typeof SPLIT_JUMP_POLICY>;
    readonly small: ActionCaptureEvidence;
    readonly large: ActionCaptureEvidence;
    readonly poseDifference: {
      readonly differingPixelCount: number;
      readonly unionForegroundPixelCount: number;
      readonly differenceRatio: number;
    };
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
    jumpLarge: path.join(directory, "jump-large.png"),
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

function requireSubjectProjection(snapshot: WorldRuntimeSnapshotV4, entityId: string) {
  const subject = snapshot.world.subjectStatesByEntityId[entityId];
  assert.ok(subject !== undefined, `Missing Subject projection '${entityId}'.`);
  return subject;
}

function requireLocomotionCapability(snapshot: WorldRuntimeSnapshotV4, entityId: string) {
  return requireActivePublishedLocomotionV1(snapshot, entityId);
}

function locomotionActionId(snapshot: WorldRuntimeSnapshotV4, entityId: string): ActionId {
  const mode = requireLocomotionCapability(snapshot, entityId).mode;
  return mode === "airborne" ? "jump" : mode;
}

function assertPossessedBy(snapshot: WorldRuntimeSnapshotV4, controlledEntityId: string): void {
  assert.ok(
    Object.values(snapshot.world.gameplayInspection.relationshipStatesById).some(
      (relationship) =>
        relationship.type === "possessedBy" &&
        relationship.controllerEntityId === CONTROLLER_ID &&
        relationship.controlledEntityId === controlledEntityId,
    ),
    `Controller '${CONTROLLER_ID}' does not possess '${controlledEntityId}'.`,
  );
}

function normalizedHorizontalXZ(
  vectorXYZ: RuntimeVec3V1,
  label: string,
): readonly [number, number] {
  const magnitude = Math.hypot(vectorXYZ[0], vectorXYZ[2]);
  assert.ok(magnitude > 0.000001, `${label} has no horizontal direction.`);
  return [vectorXYZ[0] / magnitude, vectorXYZ[2] / magnitude];
}

function assertMovementFacingSemanticAlignment(
  snapshot: WorldRuntimeSnapshotV4,
  entityId: string,
  actions: readonly ("move-forward" | "move-right" | "run" | "jump")[],
): void {
  const planarAction = actions.includes("move-forward")
    ? "move-forward"
    : actions.includes("move-right")
      ? "move-right"
      : undefined;
  if (planarAction === undefined) return;

  const camera = snapshot.view.camera;
  assert.equal(camera.mode, "tracking");
  assert.equal(camera.targetEntityId, entityId);
  assert.ok(camera.subjectForwardXYZ !== undefined, "Subject forward is unavailable.");
  assert.ok(
    camera.subjectVelocityMetersPerSecondXYZ !== undefined,
    "Subject velocity is unavailable.",
  );
  const subjectForwardXZ = normalizedHorizontalXZ(
    camera.subjectForwardXYZ,
    "Subject forward",
  );
  const velocityXZ = normalizedHorizontalXZ(
    camera.subjectVelocityMetersPerSecondXYZ,
    "Subject velocity",
  );

  const alignment =
    subjectForwardXZ[0] * velocityXZ[0] + subjectForwardXZ[1] * velocityXZ[1];
  assert.ok(
    alignment > 0.99,
    [
      `Subject '${entityId}' facing is not aligned with its movement.`,
      `alignment=${alignment}`,
      `forwardXZ=${JSON.stringify(subjectForwardXZ)}`,
      `velocityXZ=${JSON.stringify(velocityXZ)}`,
      `subjectForwardXYZ=${JSON.stringify(camera.subjectForwardXYZ)}`,
      `subjectVelocity=${JSON.stringify(camera.subjectVelocityMetersPerSecondXYZ)}`,
    ].join(" "),
  );
}

async function inspectProductAsset(): Promise<ProductAssetEvidenceV1> {
  const [glbBytes, assetManifestText, actionManifestText] = await Promise.all([
    readFile(ASSET_PATH),
    readFile(ASSET_MANIFEST_PATH, "utf8"),
    readFile(ACTION_MANIFEST_PATH, "utf8"),
  ]);
  return inspectProductAssetEvidence({
    requiredRuntimeActionIds: INTAKE_FIXTURE.requiredRuntimeActionIds,
    expectedSubjectAssetRef: INTAKE_FIXTURE.subjectAssetRef,
    glbBytes,
    assetManifest: parseJson<unknown>(assetManifestText, "Product asset manifest"),
    actionManifest: parseJson<unknown>(actionManifestText, "Product action manifest"),
  });
}

async function runCliGates(paths: ArtifactPaths): Promise<WorldBuildArtifactV4> {
  const packageDirectoryPath = path.join(paths.directory, "world.package");
  assert.equal(await worldkitMain(["validate", INPUT_PATH, "--json"]), 0);
  assert.equal(
    await worldkitMain([
      "build",
      INPUT_PATH,
      "--output",
      packageDirectoryPath,
      "--json",
    ]),
    0,
  );
  assert.equal(
    await worldkitMain(["inspect", packageDirectoryPath, "--json"]),
    0,
  );
  await rm(packageDirectoryPath, { recursive: true, force: true });
  assert.equal(
    (await buildWorldArtifactFileV1(INPUT_PATH, paths.build)).exitCode,
    0,
  );
  const firstBuild = await readFile(paths.build);
  assert.equal(
    (await buildWorldArtifactFileV1(INPUT_PATH, paths.build)).exitCode,
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

  const artifact = parseJson<WorldBuildArtifactV4>(
    await readFile(paths.build, "utf8"),
    "Product Subject build artifact",
  );
  assert.equal(artifact.kind, "worldkit-build-artifact");
  assert.equal(artifact.schemaVersion, 4);
  assert.equal(artifact.normalizedWorldIr.schemaVersion, 4);
  assert.equal(artifact.executionPlan.schemaVersion, 1);
  assert.equal(
    artifact.worldRuntimeBootstrap.initialControlledEntityId,
    PRIMARY_ENTITY_ID,
  );
  const expectedSubjectEntityIds = artifact.normalizedWorldIr.nodes
    .filter((node) => node.kind === "subject")
    .map((node) => node.id);
  assert.deepEqual(
    artifact.worldRuntimeBootstrap.subjectRuntimeDescriptors.map(
      (subject) => subject.entityId,
    ),
    expectedSubjectEntityIds,
  );
  assert.equal(artifact.worldRuntimeBootstrap.subjectAssets.length, 1);
  assert.equal(
    artifact.worldRuntimeBootstrap.subjectAssets[0]?.subjectAssetRef,
    SUBJECT_ASSET_REF,
  );
  assert.ok(
    artifact.worldRuntimeBootstrap.subjectRuntimeDescriptors.every(
      (subject) => subject.subjectDefinitionRef === SUBJECT_DEFINITION_REF,
    ),
  );
  const explanationArtifact = explanation as SubjectExplanationSuccessV1;
  assert.equal(explanationArtifact.subject.entityId, PRIMARY_ENTITY_ID);
  assert.equal(explanationArtifact.subject.subjectDefinitionRef, SUBJECT_DEFINITION_REF);
  const snapshot = parseJson<WorldRuntimeSnapshotV4>(
    await readFile(paths.snapshot, "utf8"),
    "Product Subject CLI snapshot",
  );
  assert.equal(
    locomotionActionId(snapshot, PRIMARY_ENTITY_ID),
    "idle",
    "CLI capture must start with the controlled Subject idle.",
  );
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
  if (errors.length > 0) {
    throw new AggregateError(errors, "Product Subject verifier cleanup failed.");
  }
}

async function captureAction(
  page: Page,
  actionId: CaptureActionId,
  actions: readonly ("move-forward" | "move-right" | "run" | "jump")[],
  ticks: number,
  output: {
    readonly path: string;
    readonly filename: ActionCaptureEvidence["filename"];
  },
): Promise<ActionCaptureResult> {
  const reset = await page.evaluate(async () => window.__WORLDKIT__!.reset());
  assert.equal(reset.world.simulationTick, 0);
  assertPossessedBy(reset, PRIMARY_ENTITY_ID);
  const snapshot = await page.evaluate(
    async ({ fixedActions, fixedTicks }) =>
      window.__WORLDKIT__!.runFixedInput([{ actions: fixedActions, ticks: fixedTicks }]),
    { fixedActions: actions, fixedTicks: ticks },
  );
  const state = requireSubjectProjection(snapshot, PRIMARY_ENTITY_ID).entityState;
  const locomotion = requireLocomotionCapability(snapshot, PRIMARY_ENTITY_ID);
  assert.equal(
    locomotionActionId(snapshot, PRIMARY_ENTITY_ID),
    actionId,
    [
      `Fixed-input capture '${actionId}' resolved another locomotion action.`,
      `locomotion=${JSON.stringify(locomotion)}`,
      `entityState=${JSON.stringify(state)}`,
    ].join(" "),
  );
  if (actionId === "jump") assert.equal(locomotion.movementMedium, "air");
  assertMovementFacingSemanticAlignment(snapshot, PRIMARY_ENTITY_ID, actions);

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
    if (context === null) throw new Error("PRODUCT_ASSET_POSE_CROP_UNAVAILABLE");
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
  await writeFile(output.path, bytes);
  const poseAnalysis = analyzeSubjectPoseCrop({
    boundsPixelsXYWH: capture.boundsPixelsXYWH,
    rgbaBytes: Uint8Array.from(capture.rgbaBytes),
  });
  return {
    evidence: {
      filename: output.filename,
      source: "browser-fixed-tick",
      tick: snapshot.world.simulationTick,
      actionId,
      subjectEntityId: PRIMARY_ENTITY_ID,
      positionMetersXYZ: state.positionMetersXYZ,
      movementMedium: locomotion.movementMedium,
      subjectSilhouette: poseAnalysis.evidence,
      ...inspectPng(bytes),
    },
    poseAnalysis,
  };
}

function jumpCycleSample(snapshot: WorldRuntimeSnapshotV4): JumpCycleSampleEvidence {
  const state = requireSubjectProjection(snapshot, PRIMARY_ENTITY_ID).entityState;
  const locomotion = requireLocomotionCapability(snapshot, PRIMARY_ENTITY_ID);
  return {
    tick: snapshot.world.simulationTick,
    positionMetersXYZ: state.positionMetersXYZ,
    movementMedium: locomotion.movementMedium,
  };
}

async function captureJumpCycle(page: Page): Promise<JumpCycleEvidence> {
  const spawnSnapshot = await page.evaluate(async () => window.__WORLDKIT__!.reset());
  assertPossessedBy(spawnSnapshot, PRIMARY_ENTITY_ID);
  const spawn = jumpCycleSample(spawnSnapshot);
  assert.equal(spawn.tick, 0);
  assert.equal(spawn.movementMedium, "ground");

  const samples = await page.evaluate(async ({ maximumTicks, subjectEntityId }) => {
    const output: JumpCycleSampleEvidence[] = [];
    let hasTakenOff = false;
    for (let step = 0; step < maximumTicks; step += 1) {
      const actions = step === 0 ? ["jump" as const] : [];
      const snapshot = await window.__WORLDKIT__!.runFixedInput([
        { actions, ticks: 1 },
      ]);
      const subject = snapshot.world.subjectStatesByEntityId[subjectEntityId];
      if (subject === undefined) throw new Error("PRODUCT_ASSET_SUBJECT_STATE_MISSING");
      const locomotionCapability = Object.values(subject.capabilityStatesById).find(
        (capability) => capability.kind === "locomotion-capability-state-v2",
      );
      if (locomotionCapability?.kind !== "locomotion-capability-state-v2") {
        throw new Error("PRODUCT_ASSET_LOCOMOTION_STATE_MISSING");
      }
      if (locomotionCapability.locomotion.status !== "active") {
        throw new Error("PRODUCT_ASSET_LOCOMOTION_STATE_INACTIVE");
      }
      const sample: JumpCycleSampleEvidence = {
        tick: snapshot.world.simulationTick,
        positionMetersXYZ: subject.entityState.positionMetersXYZ,
        movementMedium: locomotionCapability.locomotion.movementMedium,
      };
      output.push(sample);
      if (sample.movementMedium === "air") hasTakenOff = true;
      if (hasTakenOff && sample.movementMedium === "ground") break;
    }
    return output;
  }, { maximumTicks: 240, subjectEntityId: PRIMARY_ENTITY_ID });

  const takeoffIndex = samples.findIndex((sample) => sample.movementMedium === "air");
  assert.ok(takeoffIndex >= 0, "Browser jump cycle never reached takeoff.");
  const landIndex = samples.findIndex((sample, index) =>
    index > takeoffIndex && sample.movementMedium === "ground"
  );
  assert.ok(landIndex > takeoffIndex, "Browser jump cycle never landed.");
  const airborne = samples.slice(takeoffIndex, landIndex);
  assert.ok(airborne.length >= 3, "Browser jump cycle did not expose enough airborne samples.");
  let apexIndex = 0;
  for (let index = 1; index < airborne.length; index += 1) {
    if (airborne[index]!.positionMetersXYZ[1] >
      airborne[apexIndex]!.positionMetersXYZ[1]) apexIndex = index;
  }
  assert.ok(apexIndex > 0 && apexIndex < airborne.length - 1);
  const apex = airborne[apexIndex]!;
  const fall = airborne.slice(apexIndex + 1).find((sample) =>
    sample.positionMetersXYZ[1] < apex.positionMetersXYZ[1]
  );
  assert.ok(!isNil(fall), "Browser jump cycle never exposed a falling sample.");
  const takeoff = airborne[0]!;
  const land = samples[landIndex]!;
  assert.ok(apex.positionMetersXYZ[1] > takeoff.positionMetersXYZ[1]);
  assert.ok(fall.positionMetersXYZ[1] < apex.positionMetersXYZ[1]);
  assert.equal(land.movementMedium, "ground");

  const resetSnapshot = await page.evaluate(async () => window.__WORLDKIT__!.reset());
  assertPossessedBy(resetSnapshot, PRIMARY_ENTITY_ID);
  const reset = jumpCycleSample(resetSnapshot);
  assert.equal(reset.tick, 0);
  assert.equal(reset.movementMedium, "ground");
  assert.deepEqual(reset.positionMetersXYZ, spawn.positionMetersXYZ);

  return {
    source: "browser-fixed-tick",
    subjectEntityId: PRIMARY_ENTITY_ID,
    spawn,
    takeoff,
    apex,
    fall,
    land,
    reset,
  };
}

async function verifyBrowser(
  paths: ArtifactPaths,
  artifact: WorldBuildArtifactV4,
  productAsset: ProductAssetEvidenceV1,
): Promise<BrowserEvidence> {
  const animationSet = artifact.worldRuntimeBootstrap.animationSets.find(
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
  const runtimeSubject = artifact.worldRuntimeBootstrap.subjectRuntimeDescriptors.find(
    (candidate) => candidate.entityId === PRIMARY_ENTITY_ID,
  );
  assert.ok(runtimeSubject !== undefined);
  assert.equal(runtimeSubject.controlFeel.resourceRef, CONTROL_FEEL_PROFILE.resourceRef);
  assert.equal(runtimeSubject.controlFeel.contentHash, CONTROL_FEEL_PROFILE.contentHash);
  assert.deepEqual(runtimeSubject.controlFeel.jumpVariantPolicy, CONTROL_FEEL_PROFILE.jumpVariantPolicy);
  const expectedSubjectEntityIds = artifact.normalizedWorldIr.nodes
    .filter((node) => node.kind === "subject")
    .map((node) => node.id);

  let server: WorldkitServerHandle | undefined;
  let browser: Browser | undefined;
  let context: BrowserContext | undefined;
  let page: Page | undefined;
  let result: BrowserEvidence | undefined;
  let primaryError: unknown;
  try {
    server = await startWorldkitServer({
      source: { kind: "canonical-file", inputPath: INPUT_PATH },
    });
    try {
      browser = await launchChromiumWithSystemFallback();
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
    assertPossessedBy(ready, PRIMARY_ENTITY_ID);
    assert.deepEqual(
      Object.keys(ready.world.subjectStatesByEntityId),
      expectedSubjectEntityIds,
    );
    const fixedTicksPerSecond = 1 / ready.runtime.fixedTimeStepSeconds;
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
    const jumpCaptureTick = SPLIT_JUMP_POLICY === undefined
      ? 30
      : Math.ceil(
          SPLIT_JUMP_POLICY.smallAnticipationSeconds * fixedTicksPerSecond,
        ) + 10;
    const largeJumpCaptureTick = SPLIT_JUMP_POLICY === undefined
      ? undefined
      : Math.ceil(
          SPLIT_JUMP_POLICY.largeAnticipationSeconds * fixedTicksPerSecond,
        ) + 10;

    await page.evaluate(async () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
    );
    await page.evaluate(() => window.__WORLDKIT__!.setPaused(true));
    const fixedReset = await page.evaluate(async () => window.__WORLDKIT__!.reset());
    assert.equal(fixedReset.world.simulationTick, 0);
    assert.notEqual(fixedReset.worldSessionId, ready.worldSessionId);
    assertPossessedBy(fixedReset, PRIMARY_ENTITY_ID);
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
    const poseTarget = await page.evaluate(({ runtimeEntityId, semanticClassId }) => {
      const api = window.__WORLDKIT_AUTHORING_CAPTURE__;
      if (api === undefined) throw new Error("WORLDKIT_AUTHORING_CAPTURE_PROTOCOL_MISSING");
      return api.configureVisualCaptureGroups([{
        visualTargetId: "pose-primary-subject",
        runtimeEntityIds: [runtimeEntityId],
        role: "primary-subject",
        semanticClassId,
        identityColor: "#E85D5D",
      }])[0];
    }, {
      runtimeEntityId: PRIMARY_ENTITY_ID,
      semanticClassId: SUBJECT_DEFINITION.semanticClassId,
    });
    assert.equal(poseTarget?.runtimeEntityIds[0], PRIMARY_ENTITY_ID);

    const captures = {
      idle: await captureAction(page, "idle", [], 12, {
        path: paths.action.idle,
        filename: "idle.png",
      }),
      walk: await captureAction(
        page,
        "walk",
        ["move-right"],
        walkCaptureTiming.captureTick,
        { path: paths.action.walk, filename: "walk.png" },
      ),
      run: await captureAction(page, "run", ["move-right", "run"], 24, {
        path: paths.action.run,
        filename: "run.png",
      }),
      jump: await captureAction(page, "jump", ["jump"], jumpCaptureTick, {
        path: paths.action.jump,
        filename: "jump.png",
      }),
    } satisfies Record<CaptureActionId, ActionCaptureResult>;
    const largeJump = largeJumpCaptureTick === undefined
      ? undefined
      : await captureAction(
          page,
          "jump",
          ["jump", "run"],
          largeJumpCaptureTick,
          {
            path: paths.jumpLarge,
            filename: "jump-large.png",
          },
        );
    const actions = {
      idle: captures.idle.evidence,
      walk: captures.walk.evidence,
      run: captures.run.evidence,
      jump: captures.jump.evidence,
    } satisfies Record<CaptureActionId, ActionCaptureEvidence>;
    assert.equal(new Set(Object.values(actions).map((capture) => capture.sha256)).size, 4);
    const splitJump = SPLIT_JUMP_POLICY === undefined
      ? undefined
      : (() => {
          assert.ok(largeJump !== undefined);
          const poseDifference = compareSubjectPoseSilhouettes(
            captures.jump.poseAnalysis,
            largeJump.poseAnalysis,
          );
          assert.ok(
            poseDifference.differenceRatio >= MINIMUM_SUBJECT_POSE_DIFFERENCE_RATIO,
            `small/large jump pose difference ${poseDifference.differenceRatio}`,
          );
          return {
            controlFeelProfileRef: CONTROL_FEEL_PROFILE.resourceRef,
            controlFeelProfileHash: CONTROL_FEEL_PROFILE.contentHash,
            policy: SPLIT_JUMP_POLICY,
            small: captures.jump.evidence,
            large: largeJump.evidence,
            poseDifference,
          };
        })();
    const jumpCycle = await captureJumpCycle(page);
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

    const wallStart = await page.evaluate(async () => window.__WORLDKIT__!.reset());
    assertPossessedBy(wallStart, PRIMARY_ENTITY_ID);
    const wallEnd = await page.evaluate(async () =>
      window.__WORLDKIT__!.runFixedInput([{ actions: ["move-right"], ticks: 360 }]),
    );
    const wallStartState = requireSubjectProjection(wallStart, PRIMARY_ENTITY_ID).entityState;
    const wallEndState = requireSubjectProjection(wallEnd, PRIMARY_ENTITY_ID).entityState;
    assert.ok(wallEndState.positionMetersXYZ[0] > wallStartState.positionMetersXYZ[0] + 2);
    assert.ok(
      wallEndState.positionMetersXYZ[0] < 6.8,
      `Product Subject crossed the wall at x=${wallEndState.positionMetersXYZ[0]}.`,
    );

    result = {
      actions,
      jumpCycle,
      poseGate: {
        minimumDifferenceRatio: MINIMUM_SUBJECT_POSE_DIFFERENCE_RATIO,
        walkCaptureTiming,
        comparisons,
      },
      wallStop: {
        entityId: PRIMARY_ENTITY_ID,
        startPositionMetersXYZ: wallStartState.positionMetersXYZ,
        stopPositionMetersXYZ: wallEndState.positionMetersXYZ,
        maximumAllowedXMeters: 6.8,
      },
      ...(splitJump === undefined ? {} : { splitJump }),
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
          : new AggregateError(
              [primaryError, cleanupError],
              "Product Subject verification cleanup failed.",
            );
    }
  }
  if (primaryError !== undefined) throw primaryError;
  assert.ok(result !== undefined);
  return result;
}

async function writeVerification(
  paths: ArtifactPaths,
  artifact: WorldBuildArtifactV4,
  productAsset: ProductAssetEvidenceV1,
  browser: BrowserEvidence,
): Promise<void> {
  const cliSnapshot = parseJson<WorldRuntimeSnapshotV4>(
    await readFile(paths.snapshot, "utf8"),
    "Product Subject CLI snapshot",
  );
  const compiledAsset = artifact.worldRuntimeBootstrap.subjectAssets[0];
  assert.ok(compiledAsset !== undefined);
  assert.equal(compiledAsset.artifactContentHash, productAsset.artifactContentHash);
  const verification = {
    kind: "worldkit-product-subject-verification",
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
        tick: cliSnapshot.world.simulationTick,
        actionId: locomotionActionId(cliSnapshot, PRIMARY_ENTITY_ID),
        subjectEntityId: PRIMARY_ENTITY_ID,
        ...inspectPng(await readFile(paths.world)),
      },
      browser.actions.idle,
      browser.actions.walk,
      browser.actions.run,
      browser.actions.jump,
      ...(browser.splitJump === undefined ? [] : [browser.splitJump.large]),
    ],
    poseGate: browser.poseGate,
    jumpCycle: browser.jumpCycle,
    wallStop: browser.wallStop,
    ...(browser.splitJump === undefined ? {} : { splitJump: browser.splitJump }),
  } as const;
  await writeFile(paths.verification, `${stringifyCanonicalJson(verification)}\n`);
}

async function run(publicationMode: ArtifactPublicationMode): Promise<void> {
  await mkdir(path.dirname(TARGET_ARTIFACT_DIRECTORY), { recursive: true });
  const temporaryDirectory = await mkdtemp(
    path.join(
      path.dirname(TARGET_ARTIFACT_DIRECTORY),
      `.${INTAKE_FIXTURE.id}.tmp-`,
    ),
  );
  const paths = pathsFor(temporaryDirectory);
  try {
    const productAsset = await inspectProductAsset();
    const artifact = await runCliGates(paths);
    const browser = await verifyBrowser(paths, artifact, productAsset);
    await writeVerification(paths, artifact, productAsset, browser);
    const publication = await finalizeArtifactDirectory({
      mode: publicationMode,
      temporaryDirectory,
      targetDirectory: TARGET_ARTIFACT_DIRECTORY,
      expectedFilenames: ARTIFACT_FILES,
    });
    if (
      publication.publicationMode === "update" &&
      publication.backupGarbageCollection === "deferred"
    ) {
      process.stderr.write(
        `Product Subject artifact backup GC deferred at '${publication.deferredBackupDirectory}'.\n`,
      );
    }
    process.stdout.write(
      `${JSON.stringify(
        {
          ok: true,
          publicationMode: publication.publicationMode,
          artifacts: publication.publicationMode === "update"
            ? TARGET_ARTIFACT_DIRECTORY
            : null,
          hashes: {
            normalizedWorldIr: artifact.normalizedWorldIrHash,
            executionPlan: artifact.executionPlanHash,
            subjectAsset: productAsset.artifactContentHash,
          },
          actions: browser.actions,
          ...(browser.splitJump === undefined
            ? {}
            : { splitJump: browser.splitJump }),
          poseGate: browser.poseGate,
          wallStop: browser.wallStop,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

try {
  await run(VERIFIER_ARGUMENTS.publicationMode);
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
