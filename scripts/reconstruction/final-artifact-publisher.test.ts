import {
  lstat,
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  formalWorldCaptureIntentCanonicalBytesV1,
  deriveFormalWhiteboxTriviewManifestV1,
  hashFormalOpeningObservationV1,
  hashFormalSemanticViewObservationSetV1,
  hashFormalWorldCaptureReceiptV1,
  parseFormalOpeningObservationV1,
  parseFormalWorldCaptureReceiptV1,
  parseNativeSceneCheckResultV1,
} from "@whitebox-world/runtime-contracts";
import {
  sha256Bytes,
  sha256CanonicalJson,
  stringifyCanonicalJson,
  type Sha256HashV1,
} from "@whitebox-world/protocol";
import {
  evaluateWorldReconstructionV1,
  hashWorldReconstructionCaseV1,
  hashWorldReconstructionEvaluationProfileV1,
  hashWorldReconstructionEvaluationResultV1,
  hashWorldReconstructionStrictDiagnosticReceiptV1,
  parseWorldReconstructionEvaluationResultV1,
  parseWorldReconstructionCaseV1,
  parseWorldReconstructionRunReceiptV1,
  parseWorldReconstructionStrictDiagnosticReceiptV1,
} from "@whitebox-world/validation";
import {
  hashNativeBlockGenerationReceiptV1,
  hashNativeBlockGenerationRequestV1,
  hashSceneAuthoringAttemptResultV1,
  hashSceneAuthoringAttemptV1,
  parseNativeBlockGenerationReceiptV1,
  parseNativeBlockGenerationRequestV1,
} from "@whitebox-world/scene-authoring-contracts";
import { writeWorldPackageDirectoryV1 } from "../lib/file-world-package.js";
import { explainNativeSceneCheckResultV1 } from "../native-scene/explain.js";
import { describe, expect, it } from "vitest";
import sharp from "sharp";

import { buildWorldReconstructionEvidenceSetV1 } from
  "./evaluate-evidence-set.js";
import { createEvidenceSetFixtureInputV1, createSemanticViewObservationSetFixtureV1 } from
  "./evaluate-fixture.test-support.js";
import {
  hashEntryThirdPersonValidationResultV1,
  parseEntryThirdPersonValidationResultV1,
  validateFormalOpeningEntryThirdPersonV1,
} from "../visual/entry-third-person.js";
import {
  createNativeBlockFinalArtifactPublisherTestAdapterV1,
  NativeBlockFinalArtifactPublicationClosedErrorV1,
  publishNativeBlockReconstructionFinalV1,
  verifyNativeBlockCaseOwnerInputSnapshotV1,
} from "./final-artifact-publisher.js";

const PNG = Uint8Array.from(Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
));
const H = (character: string) =>
  `sha256:${character.repeat(64)}` as Sha256HashV1;

async function entryPng(left = 43, right = 56): Promise<Uint8Array> {
  const width = 100;
  const height = 100;
  const pixels = new Uint8Array(width * height * 3).fill(255);
  for (let y = 25; y <= 90; y += 1) {
    for (let x = left; x <= right; x += 1) {
      const offset = (y * width + x) * 3;
      pixels[offset] = 0xE8;
      pixels[offset + 1] = 0x5D;
      pixels[offset + 2] = 0x5D;
    }
  }
  return new Uint8Array(await sharp(pixels, {
    raw: { width, height, channels: 3 },
  }).png().toBuffer());
}

function entryOpeningObservation(
  openingObservation: ReturnType<typeof parseFormalOpeningObservationV1>,
) {
  const resetReadySnapshot = {
    ...openingObservation.resetReadySnapshot,
    view: {
      ...openingObservation.resetReadySnapshot.view,
      camera: {
        mode: "tracking" as const,
        id: "camera-main",
        targetEntityId: "player",
        positionMetersXYZ: [0, 3, 5] as const,
        activeCameraProfileRef:
          "worldkit://camera-profile/humanoid.third-person@1",
        activeCameraRigRef:
          "worldkit://camera-rig-profile/humanoid.third-person@1",
        activeCameraModifierRefs: [],
        safeFallbackActive: false,
        viewYawOffsetRadians: 0,
        viewPitchOffsetRadians: 0,
        viewDistanceOffsetMeters: 0,
        fixedStepDeltaSeconds: 1 / 60,
      },
    },
  };
  return parseFormalOpeningObservationV1({
    ...openingObservation,
    resetReadySnapshot,
    resetReadySnapshotHash: sha256CanonicalJson(resetReadySnapshot),
  });
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${stringifyCanonicalJson(value)}\n`);
}

async function missing(filePath: string): Promise<boolean> {
  try {
    await lstat(filePath);
    return false;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT";
  }
}

function generationRequestFixture(input: ReturnType<
  typeof createEvidenceSetFixtureInputV1
>) {
  const verified = input.verifiedWorldPackage;
  const attempt = verified.sceneAuthoringAttempt;
  if (attempt.sourceInput.kind !== "babylon-native") {
    throw new Error("fixture source must be Babylon Native");
  }
  const nativeSceneApi = verified.registryLock.find(({ resourceKind }) =>
    resourceKind === "native-scene-api")!;
  const nativeSceneProfile = verified.registryLock.find(({ resourceKind }) =>
    resourceKind === "native-scene-profile")!;
  return parseNativeBlockGenerationRequestV1({
    kind: "native-block-generation-request",
    schemaVersion: 1,
    id: "package-fixture.initial",
    routeDecisionRef: attempt.sceneAuthoringRouteDecisionRef,
    routeDecisionHash: attempt.sceneAuthoringRouteDecisionHash,
    sceneBriefRef: attempt.sceneBriefRef,
    sceneBriefHash: attempt.sceneBriefHash,
    referenceInputs: [],
    codexExecutionProfileRef: "worldkit://codex-execution-profile/formal@1",
    codexExecutionProfileHash: H("5"),
    taskInstructionRef:
      "worldkit://task-instruction/native-block-reconstruction@1",
    taskInstructionHash: H("6"),
    builderSkillRef: "worldkit://skill/worldkit-native-block-builder@1",
    builderSkillHash: H("7"),
    workspaceContextManifestRef:
      "worldkit://workspace-context/native-block-builder@1",
    workspaceContextManifestHash: H("8"),
    contextInputs: [{
      inputRef: "context/native-scene-api.json",
      contentHash: nativeSceneApi.contentHash,
    }],
    nativeSceneApiRef: nativeSceneApi.resourceRef,
    nativeSceneApiHash: nativeSceneApi.contentHash,
    nativeSceneProfileRef: nativeSceneProfile.resourceRef,
    nativeSceneProfileHash: nativeSceneProfile.contentHash,
    blockProfileRef: "worldkit://native-block-profile/whitebox.blocks@1",
    blockProfileHash: H("9"),
    bootstrapInputRef: attempt.sourceInput.bootstrapInputRef,
    bootstrapInputHash: attempt.sourceInput.bootstrapInputHash,
    seed: attempt.seed,
    budgets: {
      maximumBlockCount: 2_000,
      maximumStaticColliderCount: 500,
      maximumStaticColliderVertexCount: 200_000,
      maximumStaticColliderTriangleCount: 100_000,
      maximumOutputBytes: 4_000_000,
      timeoutSeconds: 900,
    },
    declaredOutputPaths: [
      "scene.ts",
      "native-block-authoring.json",
      "native-resources.json",
    ],
  });
}

async function createRunFixture(
  options: Readonly<{
    includeWhiteboxTriviews?: boolean;
    evaluationPasses?: boolean;
    entryPasses?: boolean;
  }> = {},
) {
  const evaluationPasses = options.evaluationPasses ?? true;
  const entryPasses = options.entryPasses ?? true;
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "nbr-final-")));
  const caseDirectoryPath = path.join(root, "artifacts/scenes/package-fixture");
  const runDirectoryPath = path.join(caseDirectoryPath, "runs/formal");
  const attemptRoot = path.join(runDirectoryPath, "attempts/0");
  const captureRoot = path.join(attemptRoot, "capture");
  await mkdir(captureRoot, { recursive: true });
  const fixture = createEvidenceSetFixtureInputV1({
    includeWhiteboxTriviews: options.includeWhiteboxTriviews ?? false,
    allDimensionsPass: evaluationPasses,
  });
  const verified = fixture.verifiedWorldPackage;
  await writeJson(path.join(caseDirectoryPath, "case.json"), fixture.reconstructionCase);
  await writeJson(
    path.join(caseDirectoryPath, "evaluation-profile.json"),
    fixture.evaluationProfile,
  );
  await mkdir(path.join(caseDirectoryPath, "inputs"), { recursive: true });
  await writeFile(
    path.join(caseDirectoryPath, "inputs/formal-world-capture-intent.json"),
    formalWorldCaptureIntentCanonicalBytesV1(fixture.formalCaptureIntent),
  );
  await writeJson(
    path.join(runDirectoryPath, "inputs/case.json"),
    fixture.reconstructionCase,
  );
  await writeJson(
    path.join(runDirectoryPath, "inputs/evaluation-profile.json"),
    fixture.evaluationProfile,
  );
  await mkdir(path.join(runDirectoryPath, "inputs"), { recursive: true });
  await writeFile(
    path.join(runDirectoryPath, "inputs/formal-world-capture-intent.json"),
    formalWorldCaptureIntentCanonicalBytesV1(fixture.formalCaptureIntent),
  );

  const generationRequest = generationRequestFixture(fixture);
  if (
    verified.sceneAuthoringAttempt.sourceInput.kind !== "babylon-native" ||
    verified.sceneAuthoringAttempt.sourceInput.generationRequestHash !==
      hashNativeBlockGenerationRequestV1(generationRequest)
  ) throw new Error("generation fixture identity drift");
  const sourceByPath = new Map([
    ["native-block-authoring.json", new TextEncoder().encode(
      `${stringifyCanonicalJson(fixture.authoringManifest)}\n`,
    )],
    ["native-resources.json", new TextEncoder().encode("[]")],
    ["scene.ts", new TextEncoder().encode("export default {};\n")],
  ] as const);
  const generationReceipt = parseNativeBlockGenerationReceiptV1({
    kind: "native-block-generation-receipt",
    schemaVersion: 1,
    id: "package-fixture.initial.receipt",
    generationRequestRef:
      verified.sceneAuthoringAttempt.sourceInput.generationRequestRef,
    generationRequestHash:
      hashNativeBlockGenerationRequestV1(generationRequest),
    routerTaskPayloadHash: H("d"),
    taskInstructionHash: generationRequest.taskInstructionHash,
    builderSkillHash: generationRequest.builderSkillHash,
    workspaceContextManifestHash:
      generationRequest.workspaceContextManifestHash,
    routerRequestId: "package-fixture-initial",
    backend: "cloud",
    executionProfile: "formal",
    resolvedModel: "gpt-5.6-sol",
    resolvedReasoningEffort: "xhigh",
    outcome: "completed",
    outputs: [...sourceByPath].map(([relativePath, bytes]) => ({
      path: relativePath,
      contentHash: sha256Bytes(bytes),
      sizeBytes: bytes.byteLength,
      mediaType: relativePath === "scene.ts"
        ? "text/typescript"
        : "application/json",
    })),
    diagnosticCodes: [],
    cleanupOutcome: "completed",
  });
  const sourceNativeCheckResult = parseNativeSceneCheckResultV1({
    ...verified.nativeSceneCheckResult,
    id: `${verified.nativeSceneCheckResult.id}.source-check`,
  });
  await writeJson(
    path.join(attemptRoot, "generation-request.json"),
    generationRequest,
  );
  await writeJson(
    path.join(attemptRoot, "generation-receipt.json"),
    generationReceipt,
  );
  await writeJson(
    path.join(attemptRoot, "scene-authoring-route-decision.json"),
    verified.sceneAuthoringRouteDecision,
  );
  await writeJson(
    path.join(attemptRoot, "attempt.json"),
    verified.sceneAuthoringAttempt,
  );
  await writeJson(
    path.join(attemptRoot, "attempt-result.json"),
    verified.sceneAuthoringAttemptResult,
  );
  await mkdir(path.join(attemptRoot, "source"), { recursive: true });
  for (const [relativePath, bytes] of sourceByPath) {
    await writeFile(path.join(attemptRoot, "source", relativePath), bytes);
  }
  await writeJson(
    path.join(attemptRoot, "native-check-result.json"),
    sourceNativeCheckResult,
  );
  await writeFile(
    path.join(attemptRoot, "native-explain.txt"),
    explainNativeSceneCheckResultV1(sourceNativeCheckResult),
  );
  await writeWorldPackageDirectoryV1({
    outputDirectoryPath: path.join(attemptRoot, "world-package"),
    directory: verified.directory,
  });
  const groundAnalysisReport = Object.freeze({
    kind: "babylon-native-block-ground-analysis-report",
    schemaVersion: 1,
    identity: Object.freeze({
      logicalGroundModelHash: H("1"),
      walkableTopologyHash: H("2"),
      traversalCapabilityEnvelopeHash: H("3"),
      caseHash: hashWorldReconstructionCaseV1(fixture.reconstructionCase),
      worldPackageRootHash: verified.receipt.worldPackageRootHash,
      measurementChunkPolicyHash: H("4"),
    }),
    analysisOutcome: "passed",
    admissionOutcome: "passed",
    failureFacts: Object.freeze([]),
    metrics: Object.freeze({}),
    standableNodes: Object.freeze([]),
  });
  await writeJson(
    path.join(attemptRoot, "ground-analysis-report.json"),
    groundAnalysisReport,
  );
  const groundAnalysisReportHash = sha256CanonicalJson(groundAnalysisReport);
  const openingPng = await entryPng(
    entryPasses ? 43 : 14,
    entryPasses ? 56 : 27,
  );
  const openingPngHash = sha256Bytes(openingPng) as Sha256HashV1;
  const pngHash = sha256Bytes(PNG) as Sha256HashV1;
  const openingObservation = entryOpeningObservation(fixture.openingObservation);
  const views = fixture.captureReceipt.views.map((view) => ({
    ...view, pngContentHash: view.viewId === "opening" ? openingPngHash : pngHash,
  }));
  const semanticViewObservationSet = createSemanticViewObservationSetFixtureV1(openingObservation, views);
  const captureReceipt = parseFormalWorldCaptureReceiptV1({
    ...fixture.captureReceipt,
    views,
    readySnapshotHash: openingObservation.resetReadySnapshotHash,
    semanticViewObservationSetContentHash: hashFormalSemanticViewObservationSetV1(semanticViewObservationSet),
    openingObservationContentHash:
      hashFormalOpeningObservationV1(openingObservation),
    colliderOverlayPngContentHash: pngHash,
  });
  await writeFile(path.join(captureRoot, "opening.png"), openingPng);
  for (const mask of fixture.identityMaskPngs) {
    await writeFile(path.join(captureRoot, `${mask.viewId}-identity-mask.png`), mask.bytes);
  }
  for (const name of ["world-top-down", "world-side", "collider-overlay"] as const) {
    await writeFile(path.join(captureRoot, `${name}.png`), PNG);
  }
  await writeJson(path.join(captureRoot, "opening-observation.json"),
    openingObservation);
  await writeJson(path.join(captureRoot, "semantic-view-observation-set.json"), semanticViewObservationSet);
  await writeJson(path.join(captureRoot, "spawn-support-observation.json"),
    fixture.spawnSupportObservation);
  await writeJson(path.join(captureRoot, "collider-overlay-observation.json"),
    fixture.colliderOverlayObservation);
  await writeJson(path.join(captureRoot, "scripted-traversal.json"),
    fixture.scriptedTraversalObservation);
  await writeJson(path.join(captureRoot, "formal-world-capture-receipt.json"),
    captureReceipt);
  const triviewManifest = deriveFormalWhiteboxTriviewManifestV1(captureReceipt);
  if (triviewManifest !== undefined) {
    for (const [index, row] of triviewManifest.whiteboxTriviews.entries()) {
      const file = path.join(captureRoot, "triviews", row.imageUri);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, fixture.whiteboxTriviewPngs[index]!);
    }
    await writeJson(path.join(captureRoot, "triviews/whitebox-triview-manifest.json"), triviewManifest);
  }
  const evidence = buildWorldReconstructionEvidenceSetV1({
    ...fixture,
    semanticViewObservationSet,
    captureReceipt,
    openingObservation,
  });
  const evaluated = evaluateWorldReconstructionV1({
    case: fixture.reconstructionCase,
    profile: fixture.evaluationProfile,
    evidence,
  });
  const evaluation = parseWorldReconstructionEvaluationResultV1(evaluated);
  if (evaluationPasses && evaluation.outcome !== "passed") {
    throw new Error("fixture evidence must earn a passed evaluation");
  }
  if (!evaluationPasses && evaluation.outcome === "passed") {
    throw new Error("fixture evidence must retain a non-passing evaluation");
  }
  await writeJson(path.join(attemptRoot, "evidence-set.json"), evidence);
  await writeJson(path.join(attemptRoot, "evaluation.json"), evaluation);
  const captureReceiptHash = hashFormalWorldCaptureReceiptV1(captureReceipt);
  const evaluationHash = hashWorldReconstructionEvaluationResultV1(evaluation);
  const runArtifactRoot =
    `${fixture.caseRef.slice(0, -"/case.json".length)}/runs/formal`;
  const runReceipt = parseWorldReconstructionRunReceiptV1({
    kind: "world-reconstruction-run-receipt",
    schemaVersion: 1,
    id: "package-fixture.run",
    caseRef: fixture.caseRef,
    caseHash: hashWorldReconstructionCaseV1(fixture.reconstructionCase),
    evaluationProfileRef: fixture.evaluationProfileRef,
    evaluationProfileHash:
      hashWorldReconstructionEvaluationProfileV1(fixture.evaluationProfile),
    outcome: evaluation.outcome,
    diagnosticCodes: evaluation.outcome === "passed"
      ? []
      : [...new Set(evaluation.diagnostics.map(({ code }) => code))].sort(),
    attempts: [{
      kind: "evaluated",
      attemptIndex: 0,
      generationRequestRef:
        `${runArtifactRoot}/attempts/0/generation-request.json`,
      generationRequestHash:
        hashNativeBlockGenerationRequestV1(generationRequest),
      generationReceiptRef: "artifact://case/package-fixture/attempts/0/generation-receipt.json",
      generationReceiptHash:
        hashNativeBlockGenerationReceiptV1(generationReceipt),
      sceneAuthoringAttemptRef: captureReceipt.sceneAuthoringAttemptRef,
      sceneAuthoringAttemptHash:
        hashSceneAuthoringAttemptV1(verified.sceneAuthoringAttempt),
      sceneAuthoringAttemptResultRef:
        `${runArtifactRoot}/attempts/0/attempt-result.json`,
      sceneAuthoringAttemptResultHash:
        hashSceneAuthoringAttemptResultV1(verified.sceneAuthoringAttemptResult),
      worldPackageRef: verified.receipt.worldPackageRef,
      worldPackageRootHash: verified.receipt.worldPackageRootHash,
      worldPackageBuildReceiptRef: captureReceipt.worldPackageBuildReceiptRef,
      worldPackageBuildReceiptHash: sha256CanonicalJson(verified.receipt),
      worldBuildIdentityRef: captureReceipt.worldBuildIdentityRef,
      worldBuildIdentityHash: verified.receipt.worldBuildIdentityHash,
      groundAnalysisReportRef:
        `${runArtifactRoot}/attempts/0/ground-analysis-report.json`,
      groundAnalysisReportHash,
      captureReceiptRef: `${runArtifactRoot}/attempts/0/capture/formal-world-capture-receipt.json`,
      captureReceiptHash,
      evaluationResultRef:
        `${runArtifactRoot}/attempts/0/evaluation.json`,
      evaluationResultHash: evaluationHash,
      outcome: evaluation.outcome,
    }],
    finalAttemptIndex: 0,
    finalEvaluationResultRef:
      `${runArtifactRoot}/attempts/0/evaluation.json`,
    finalEvaluationResultHash: evaluationHash,
    cleanupOutcome: "completed",
  });
  await writeJson(path.join(runDirectoryPath, "run-receipt.json"), runReceipt);
  const runReceiptRef =
    "artifact://world-reconstruction-case/package-fixture.case/runs/formal/run-receipt.json";
  const runReceiptHash = sha256CanonicalJson(runReceipt) as Sha256HashV1;
  const strictDiagnostic = parseWorldReconstructionStrictDiagnosticReceiptV1({
    kind: "world-reconstruction-strict-diagnostic-receipt",
    schemaVersion: 1,
    id: "package-fixture.run.strict",
    caseRef: fixture.caseRef,
    caseHash: hashWorldReconstructionCaseV1(fixture.reconstructionCase),
    runReceiptRef,
    runReceiptHash,
    attemptIndex: 0,
    worldPackageRef: verified.receipt.worldPackageRef,
    worldPackageRootHash: verified.receipt.worldPackageRootHash,
    worldBuildIdentityHash: verified.receipt.worldBuildIdentityHash,
    captureReceiptHash,
    evaluationResultHash: evaluationHash,
    outcome: "failed",
    diagnosticCodes: ["NBR70_BLOCKER_IDENTITY_MISMATCH"],
    cleanupOutcome: "not-started",
  });
  await writeJson(
    path.join(runDirectoryPath, "strict-diagnostic.json"),
    strictDiagnostic,
  );
  const strictDiagnosticHash =
    hashWorldReconstructionStrictDiagnosticReceiptV1(strictDiagnostic);
  const entryValidation = await validateFormalOpeningEntryThirdPersonV1({
    openingPngBytes: openingPng,
    openingObservation,
  });
  if (entryPasses && entryValidation.status !== "passed") {
    throw new Error(
      `fixture entry validation must pass: ${JSON.stringify(entryValidation)}`,
    );
  }
  const entryValidationHash =
    hashEntryThirdPersonValidationResultV1(entryValidation);
  const launch = {
    kind: "native-block-reconstruction-launch" as const,
    schemaVersion: 1 as const,
    caseId: fixture.reconstructionCase.id,
    runReceiptRef,
    runReceiptHash,
    worldPackageRelativePath: "final/world-package" as const,
    worldPackageRef: verified.receipt.worldPackageRef,
    worldPackageRootHash: verified.receipt.worldPackageRootHash,
    captureReceiptRelativePath:
      "final/capture/formal-world-capture-receipt.json" as const,
    captureReceiptHash,
    evaluationRelativePath: "final/evaluation.json" as const,
    evaluationHash,
    strictDiagnosticRelativePath: "final/strict-diagnostic.json" as const,
    strictDiagnosticHash,
    entryValidationRelativePath:
      "final/entry-third-person-validation.json" as const,
    entryValidationHash,
    launchCommand:
      "pnpm worldkit native run final/world-package --port 5174 --json" as const,
  };
  return {
    root,
    caseDirectoryPath,
    runDirectoryPath,
    attemptRoot,
    launch,
    strictDiagnosticHash,
  };
}

async function installLocalCaseOwnerInputs(
  fixture: Awaited<ReturnType<typeof createRunFixture>>,
  reference: Readonly<{ bytes: Uint8Array; mediaType: "image/png" | "image/webp" }> = { bytes: PNG, mediaType: "image/png" },
) {
  const inputDirectoryPath = path.join(fixture.caseDirectoryPath, "inputs");
  const sceneBriefBytes = new TextEncoder().encode("# Fixture scene brief\n");
  const plannerReceiptBytes = new TextEncoder().encode(
    `${stringifyCanonicalJson({ kind: "fixture-planner-receipt" })}\n`,
  );
  const rows = [{
    inputRef: "entry-whitebox-target.png",
    bytes: PNG,
    mediaType: "image/png" as const,
  }, {
    inputRef: "planner-self-check.json",
    bytes: plannerReceiptBytes,
    mediaType: "application/json" as const,
  }, {
    inputRef: reference.mediaType === "image/webp" ? "reference-0.webp" : "reference-0.png",
    bytes: reference.bytes,
    mediaType: reference.mediaType,
  }, {
    inputRef: "visual-identity-palette.json",
    bytes: new TextEncoder().encode('{"kind":"fixture-palette"}'),
    mediaType: "application/json" as const,
  }, {
    inputRef: "world-plan.png",
    bytes: PNG,
    mediaType: "image/png" as const,
  }];
  await Promise.all([
    writeFile(path.join(inputDirectoryPath, "scene-brief.md"), sceneBriefBytes),
    ...rows.map(({ inputRef, bytes }) => writeFile(
      path.join(inputDirectoryPath, inputRef),
      bytes,
    )),
  ]);
  const casePath = path.join(fixture.caseDirectoryPath, "case.json");
  const priorCase = JSON.parse(await readFile(casePath, "utf8")) as
    Record<string, unknown>;
  await writeJson(casePath, {
    ...priorCase,
    sceneBriefRef: "scene-brief.md",
    sceneBriefHash: sha256Bytes(sceneBriefBytes),
    referenceInputs: rows.map(({ inputRef, bytes, mediaType }) => ({
      inputRef,
      contentHash: sha256Bytes(bytes),
      mediaType,
    })),
  });
  return Object.freeze({ inputDirectoryPath });
}

describe("Native reconstruction final artifact publisher", () => {
  it.each(["image/png", "image/webp"] as const)("admits the complete local Case reference inventory including Palette and %s", async (mediaType) => {
    const fixture = await createRunFixture();
    try {
      const bytes = mediaType === "image/png" ? PNG : await sharp(PNG).webp().toBuffer();
      const { inputDirectoryPath } = await installLocalCaseOwnerInputs(fixture, { bytes, mediaType });
      const reconstructionCase = parseWorldReconstructionCaseV1(JSON.parse(await readFile(
        path.join(fixture.caseDirectoryPath, "case.json"), "utf8",
      )));
      const snapshot = await verifyNativeBlockCaseOwnerInputSnapshotV1(inputDirectoryPath, reconstructionCase);
      expect(snapshot.filesByRelativePath.has("visual-identity-palette.json")).toBe(true);
      expect(snapshot.filesByRelativePath.get(mediaType === "image/png" ? "reference-0.png" : "reference-0.webp"))
        .toBe(sha256Bytes(bytes));
    } finally { await rm(fixture.root, { recursive: true, force: true }); }
  });

  it("atomically publishes a production-success candidate with failed strict diagnostics", async () => {
    const fixture = await createRunFixture();
    try {
      const publication = await publishNativeBlockReconstructionFinalV1({
        caseDirectoryPath: fixture.caseDirectoryPath,
        runDirectoryPath: fixture.runDirectoryPath,
        launch: fixture.launch,
      });

      expect(publication).toMatchObject({
        outcome: "published",
        finalDirectoryPath: path.join(fixture.caseDirectoryPath, "final"),
        strictDiagnosticHash: fixture.strictDiagnosticHash,
      });
      expect(JSON.parse(await readFile(
        path.join(
          fixture.caseDirectoryPath,
          "final",
          "strict-diagnostic.json",
        ),
        "utf8",
      ))).toMatchObject({
        outcome: "failed",
        diagnosticCodes: ["NBR70_BLOCKER_IDENTITY_MISMATCH"],
      });
      const entryValidationBytes = new Uint8Array(await readFile(path.join(
        fixture.caseDirectoryPath,
        "final/entry-third-person-validation.json",
      )));
      expect(parseEntryThirdPersonValidationResultV1(JSON.parse(
        new TextDecoder().decode(entryValidationBytes),
      ))).toMatchObject({ status: "passed" });
      expect(sha256Bytes(entryValidationBytes))
        .toBe(publication.entryValidationHash);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it.each([false, true])("publishes a fully verified candidate regardless of Evaluation outcome (tri-views %s)", async includeWhiteboxTriviews => {
    const fixture = await createRunFixture({ evaluationPasses: false, includeWhiteboxTriviews });
    try {
      await expect(publishNativeBlockReconstructionFinalV1({
        caseDirectoryPath: fixture.caseDirectoryPath,
        runDirectoryPath: fixture.runDirectoryPath,
        launch: fixture.launch,
      })).resolves.toMatchObject({
        outcome: "published",
        evaluationHash: fixture.launch.evaluationHash,
      });
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it.each(["png", "manifest", "foreign-file"])("rejects tampered requested tri-view %s before final publication", async failure => {
    const fixture = await createRunFixture({ includeWhiteboxTriviews: true });
    try {
      const capture = path.join(fixture.attemptRoot, "capture");
      if (failure === "png") await writeFile(path.join(capture, "triviews/visual-target-2/whitebox-triview.png"), PNG);
      if (failure === "manifest") {
        const file = path.join(capture, "triviews/whitebox-triview-manifest.json");
        const value = JSON.parse(await readFile(file, "utf8"));
        value.whiteboxTriviews.reverse();
        await writeJson(file, value);
      }
      if (failure === "foreign-file") await writeFile(path.join(capture, "triviews/extra.png"), PNG);
      await expect(publishNativeBlockReconstructionFinalV1({ caseDirectoryPath: fixture.caseDirectoryPath,
        runDirectoryPath: fixture.runDirectoryPath, launch: fixture.launch,
      })).rejects.toThrow(failure === "foreign-file" ? "Capture artifact inventory" : "Capture tri-view");
      expect(await missing(path.join(fixture.caseDirectoryPath, "final"))).toBe(true);
    } finally { await rm(fixture.root, { recursive: true, force: true }); }
  });

  it("cannot bless a failed terminal #E85D5D mask through launch identity", async () => {
    const fixture = await createRunFixture({ entryPasses: false });
    try {
      await expect(publishNativeBlockReconstructionFinalV1({
        caseDirectoryPath: fixture.caseDirectoryPath,
        runDirectoryPath: fixture.runDirectoryPath,
        launch: fixture.launch,
      })).rejects.toMatchObject({
        diagnosticCodes: expect.arrayContaining(["ENTRY_SUBJECT_NOT_CENTERED"]),
      });
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it.each(["deleted", "forged"] as const)(
    "rejects a %s successful Ground report at the publication boundary",
    async (mutation) => {
      const fixture = await createRunFixture();
      const reportPath = path.join(
        fixture.attemptRoot,
        "ground-analysis-report.json",
      );
      try {
        if (mutation === "deleted") {
          await unlink(reportPath);
        } else {
          await writeFile(reportPath, "{}\n", "utf8");
        }
        await expect(publishNativeBlockReconstructionFinalV1({
          caseDirectoryPath: fixture.caseDirectoryPath,
          runDirectoryPath: fixture.runDirectoryPath,
          launch: fixture.launch,
        })).rejects.toMatchObject({
          diagnosticCodes: expect.arrayContaining([
            "NBR_FINAL_ARTIFACT_PUBLICATION_INVALID",
          ]),
        });
        expect(await missing(path.join(fixture.caseDirectoryPath, "final")))
          .toBe(true);
      } finally {
        await rm(fixture.root, { recursive: true, force: true });
      }
    },
  );

  it("rejects staging byte drift after the final fsync and before rename", async () => {
    const fixture = await createRunFixture();
    const finalDirectoryPath = path.join(fixture.caseDirectoryPath, "final");
    const publish = createNativeBlockFinalArtifactPublisherTestAdapterV1({
      async beforeFinalExistenceCheck() {
        await writeFile(
          path.join(fixture.caseDirectoryPath, ".final-staging/evaluation.json"),
          "{}\n",
        );
      },
    });
    try {
      await expect(publish({
        caseDirectoryPath: fixture.caseDirectoryPath,
        runDirectoryPath: fixture.runDirectoryPath,
        launch: fixture.launch,
      })).rejects.toThrow("NBR_FINAL_ARTIFACT_PUBLICATION_INVALID");
      expect(await missing(finalDirectoryPath)).toBe(true);
      expect(await missing(path.join(
        fixture.caseDirectoryPath,
        ".final-staging",
      ))).toBe(true);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it.each([
    ["Case", "case.json"],
    ["Evaluation Profile", "evaluation-profile.json"],
    [
      "Formal Capture Intent",
      "inputs/formal-world-capture-intent.json",
    ],
  ] as const)(
    "rejects %s owner input drift after the final fsync and before rename",
    async (_label, relativePath) => {
      const fixture = await createRunFixture();
      const finalDirectoryPath = path.join(fixture.caseDirectoryPath, "final");
      const publish = createNativeBlockFinalArtifactPublisherTestAdapterV1({
        async beforeFinalExistenceCheck() {
          await writeFile(
            path.join(fixture.caseDirectoryPath, relativePath),
            "{}\n",
          );
        },
      });
      try {
        await expect(publish({
          caseDirectoryPath: fixture.caseDirectoryPath,
          runDirectoryPath: fixture.runDirectoryPath,
          launch: fixture.launch,
        })).rejects.toThrow("NBR_FINAL_ARTIFACT_PUBLICATION_INVALID");
        expect(await missing(finalDirectoryPath)).toBe(true);
        expect(await missing(path.join(
          fixture.caseDirectoryPath,
          ".final-staging",
        ))).toBe(true);
      } finally {
        await rm(fixture.root, { recursive: true, force: true });
      }
    },
  );

  it.each([
    ["Scene Brief", "scene-brief.md", "deleted"],
    ["Scene Brief", "scene-brief.md", "replaced"],
    ["Planner receipt", "planner-self-check.json", "deleted"],
    ["Planner receipt", "planner-self-check.json", "replaced"],
    ["entry target", "entry-whitebox-target.png", "deleted"],
    ["entry target", "entry-whitebox-target.png", "replaced"],
    ["world plan", "world-plan.png", "deleted"],
    ["world plan", "world-plan.png", "replaced"],
  ] as const)(
    "rejects a %s at %s that is %s before publisher admission",
    async (_label, relativePath, mutation) => {
      const fixture = await createRunFixture();
      const { inputDirectoryPath } = await installLocalCaseOwnerInputs(fixture);
      const ownerPath = path.join(inputDirectoryPath, relativePath);
      try {
        if (mutation === "deleted") {
          await unlink(ownerPath);
        } else {
          await writeFile(ownerPath, relativePath.endsWith(".png") ? PNG : "{}\n");
          if (relativePath.endsWith(".png")) {
            const bytes = new Uint8Array(await readFile(ownerPath));
            const finalByteIndex = bytes.byteLength - 1;
            bytes[finalByteIndex] = bytes[finalByteIndex]! ^ 0xff;
            await writeFile(ownerPath, bytes);
          }
        }
        await expect(publishNativeBlockReconstructionFinalV1({
          caseDirectoryPath: fixture.caseDirectoryPath,
          runDirectoryPath: fixture.runDirectoryPath,
          launch: fixture.launch,
        })).rejects.toThrow(
          relativePath === "scene-brief.md"
            ? /required artifact 'scene-brief\.md'|Case owner input 'scene-brief\.md'/
            : new RegExp(
              `required artifact '${relativePath.replace(".", "\\.")}'|` +
                `Case owner input '${relativePath.replace(".", "\\.")}'`,
            ),
        );
        expect(await missing(path.join(fixture.caseDirectoryPath, "final")))
          .toBe(true);
      } finally {
        await rm(fixture.root, { recursive: true, force: true });
      }
    },
  );

  it("rejects an undeclared Case input path before publisher admission", async () => {
    const fixture = await createRunFixture();
    const { inputDirectoryPath } = await installLocalCaseOwnerInputs(fixture);
    try {
      await writeFile(path.join(inputDirectoryPath, "unexpected.bin"), PNG);
      await expect(publishNativeBlockReconstructionFinalV1({
        caseDirectoryPath: fixture.caseDirectoryPath,
        runDirectoryPath: fixture.runDirectoryPath,
        launch: fixture.launch,
      })).rejects.toThrow(
        "undeclared Case input path 'unexpected.bin' is forbidden",
      );
      expect(await missing(path.join(fixture.caseDirectoryPath, "final")))
        .toBe(true);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects a symlinked Case owner input before publisher admission", async () => {
    const fixture = await createRunFixture();
    const { inputDirectoryPath } = await installLocalCaseOwnerInputs(fixture);
    const plannerPath = path.join(inputDirectoryPath, "planner-self-check.json");
    const targetPath = path.join(fixture.caseDirectoryPath, "planner-target.json");
    try {
      await writeFile(targetPath, await readFile(plannerPath));
      await unlink(plannerPath);
      await symlink(targetPath, plannerPath);
      await expect(publishNativeBlockReconstructionFinalV1({
        caseDirectoryPath: fixture.caseDirectoryPath,
        runDirectoryPath: fixture.runDirectoryPath,
        launch: fixture.launch,
      })).rejects.toThrow(
        "required artifact 'planner-self-check.json' is missing or not a regular file",
      );
      expect(await missing(path.join(fixture.caseDirectoryPath, "final")))
        .toBe(true);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it.each([
    [
      "parent sync",
      "parent-sync",
      "completed",
      "NBR_TEST_PARENT_SYNC_FAILED",
      3,
    ],
    ["lock unlink", "lock-unlink", "failed", undefined, 3],
    [
      "final sync",
      "final-sync",
      "completed",
      "NBR_TEST_FINAL_SYNC_FAILED",
      4,
    ],
  ] as const)(
    "removes renamed final when the post-rename %s barrier fails",
    async (
      _label,
      barrier,
      cleanupOutcome,
      expectedDiagnosticCode,
      expectedPublicationSyncCount,
    ) => {
      const fixture = await createRunFixture();
      const finalDirectoryPath = path.join(fixture.caseDirectoryPath, "final");
      const lockFilePath = path.join(
        fixture.caseDirectoryPath,
        ".final-publish.lock",
      );
      let publicationSyncCount = 0;
      let barrierObservedAfterRename = false;
      const publish = createNativeBlockFinalArtifactPublisherTestAdapterV1({
        beforeSync: async (_absolutePath, phase) => {
          if (phase === "staging") return;
          publicationSyncCount += 1;
          const barrierSyncCount = barrier === "final-sync" ? 3 : 2;
          if (publicationSyncCount !== barrierSyncCount) return;
          if (await missing(finalDirectoryPath)) {
            throw new Error("NBR_TEST_BARRIER_RAN_BEFORE_RENAME");
          }
          barrierObservedAfterRename = true;
          if (barrier === "parent-sync") {
            throw new Error("NBR_TEST_PARENT_SYNC_FAILED");
          }
          if (barrier === "lock-unlink") {
            await unlink(lockFilePath);
            await mkdir(lockFilePath);
            return;
          }
          throw new Error("NBR_TEST_FINAL_SYNC_FAILED");
        },
      });
      try {
        const failure = await publish({
          caseDirectoryPath: fixture.caseDirectoryPath,
          runDirectoryPath: fixture.runDirectoryPath,
          launch: fixture.launch,
        }).then(() => undefined, (error: unknown) => error);

        expect(barrierObservedAfterRename).toBe(true);
        expect(failure).toBeInstanceOf(
          NativeBlockFinalArtifactPublicationClosedErrorV1,
        );
        expect(failure).toMatchObject({ cleanupOutcome });
        expect((failure as NativeBlockFinalArtifactPublicationClosedErrorV1)
          .diagnosticCodes).toContain(
          "NBR_FINAL_ARTIFACT_PUBLICATION_INVALID",
        );
        if (expectedDiagnosticCode !== undefined) {
          expect((failure as NativeBlockFinalArtifactPublicationClosedErrorV1)
            .diagnosticCodes).toContain(expectedDiagnosticCode);
        }
        expect(await missing(finalDirectoryPath)).toBe(true);
        expect(await missing(path.join(
          fixture.caseDirectoryPath,
          ".final-staging",
        ))).toBe(true);
        expect(await missing(lockFilePath)).toBe(barrier !== "lock-unlink");
        expect(publicationSyncCount).toBe(expectedPublicationSyncCount);
      } finally {
        await rm(fixture.root, { recursive: true, force: true });
      }
    },
    20_000,
  );

  it("reports not-started cleanup when input admission fails before owner allocation", async () => {
    const fixture = await createRunFixture();
    try {
      const failure = await publishNativeBlockReconstructionFinalV1({
        caseDirectoryPath: `${fixture.caseDirectoryPath}${path.sep}..`,
        runDirectoryPath: fixture.runDirectoryPath,
        launch: fixture.launch,
      }).then(() => undefined, (error: unknown) => error);

      expect(failure).toBeInstanceOf(
        NativeBlockFinalArtifactPublicationClosedErrorV1,
      );
      expect(failure).toMatchObject({
        diagnosticCodes: ["NBR_FINAL_ARTIFACT_PUBLICATION_INVALID"],
        cleanupOutcome: "not-started",
      });
      expect((failure as Error).message).toMatch(
        /^NBR_FINAL_ARTIFACT_PUBLICATION_INVALID/,
      );
      expect(await missing(path.join(
        fixture.caseDirectoryPath,
        ".final-publish.lock",
      ))).toBe(true);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("reports completed cleanup after allocated publication resources are removed", async () => {
    const fixture = await createRunFixture();
    try {
      const failure = await publishNativeBlockReconstructionFinalV1({
        caseDirectoryPath: fixture.caseDirectoryPath,
        runDirectoryPath: fixture.runDirectoryPath,
        launch: { ...fixture.launch, captureReceiptHash: H("f") },
      }).then(() => undefined, (error: unknown) => error);

      expect(failure).toBeInstanceOf(
        NativeBlockFinalArtifactPublicationClosedErrorV1,
      );
      expect(failure).toMatchObject({
        diagnosticCodes: ["NBR_FINAL_ARTIFACT_PUBLICATION_INVALID"],
        cleanupOutcome: "completed",
      });
      expect(await missing(path.join(
        fixture.caseDirectoryPath,
        ".final-publish.lock",
      ))).toBe(true);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("reports failed cleanup with source and cleanup diagnostic codes", async () => {
    const fixture = await createRunFixture();
    let publicationSyncCount = 0;
    const publish = createNativeBlockFinalArtifactPublisherTestAdapterV1({
      beforeSync: (_absolutePath, phase) => {
        if (phase === "staging") {
          throw new Error("NBR_TEST_STAGING_SYNC_FAILED");
        }
        publicationSyncCount += 1;
        if (publicationSyncCount > 1) {
          throw new Error("NBR_TEST_CLEANUP_SYNC_FAILED");
        }
      },
    });
    try {
      const failure = await publish({
        caseDirectoryPath: fixture.caseDirectoryPath,
        runDirectoryPath: fixture.runDirectoryPath,
        launch: fixture.launch,
      }).then(() => undefined, (error: unknown) => error);

      expect(failure).toBeInstanceOf(
        NativeBlockFinalArtifactPublicationClosedErrorV1,
      );
      expect(failure).toMatchObject({ cleanupOutcome: "failed" });
      expect((failure as NativeBlockFinalArtifactPublicationClosedErrorV1)
        .diagnosticCodes).toEqual([
        "NBR_FINAL_ARTIFACT_PUBLICATION_INVALID",
        "NBR_TEST_STAGING_SYNC_FAILED",
        "NBR_TEST_CLEANUP_SYNC_FAILED",
      ]);
      expect(await missing(path.join(
        fixture.caseDirectoryPath,
        ".final-publish.lock",
      ))).toBe(true);
      expect(await missing(path.join(
        fixture.caseDirectoryPath,
        ".final-staging",
      ))).toBe(true);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects stale launch identity and partial Capture before staging", async () => {
    for (const mutation of ["stale", "entry-hash", "partial"] as const) {
      const fixture = await createRunFixture();
      if (mutation === "partial") {
        await unlink(path.join(fixture.attemptRoot, "capture/opening.png"));
      }
      try {
        await expect(publishNativeBlockReconstructionFinalV1({
          caseDirectoryPath: fixture.caseDirectoryPath,
          runDirectoryPath: fixture.runDirectoryPath,
          launch: mutation === "stale"
            ? { ...fixture.launch, captureReceiptHash: H("f") }
            : mutation === "entry-hash"
              ? { ...fixture.launch, entryValidationHash: H("f") }
            : fixture.launch,
        })).rejects.toThrow("NBR_FINAL_ARTIFACT_PUBLICATION_INVALID");
        expect(await missing(path.join(fixture.caseDirectoryPath, ".final-staging")))
          .toBe(true);
        expect(await missing(path.join(fixture.caseDirectoryPath, "final"))).toBe(true);
      } finally {
        await rm(fixture.root, { recursive: true, force: true });
      }
    }
  });

  it("rejects symlinks, run-local final aliases, existing final, and residual lock", async () => {
    for (const mutation of ["symlink", "run-final", "existing", "lock"] as const) {
      const fixture = await createRunFixture();
      let runDirectoryPath = fixture.runDirectoryPath;
      if (mutation === "symlink") {
        const opening = path.join(fixture.attemptRoot, "capture/opening.png");
        await unlink(opening);
        await symlink(path.join(fixture.attemptRoot, "capture/world-side.png"), opening);
      } else if (mutation === "run-final") {
        runDirectoryPath = path.join(fixture.runDirectoryPath, "final");
        await mkdir(runDirectoryPath);
      } else if (mutation === "existing") {
        await mkdir(path.join(fixture.caseDirectoryPath, "final"));
      } else if (mutation === "lock") {
        await writeFile(path.join(fixture.caseDirectoryPath, ".final-publish.lock"), "");
      }
      try {
        await expect(publishNativeBlockReconstructionFinalV1({
          caseDirectoryPath: fixture.caseDirectoryPath,
          runDirectoryPath,
          launch: fixture.launch,
        })).rejects.toThrow("NBR_FINAL_ARTIFACT_PUBLICATION_INVALID");
        if (mutation === "lock") {
          expect(await missing(path.join(
            fixture.caseDirectoryPath,
            ".final-publish.lock",
          ))).toBe(false);
        }
      } finally {
        await rm(fixture.root, { recursive: true, force: true });
      }
    }
  }, 15_000);

});
