import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { parseNativeBlockAuthoringManifestV1 } from "@whitebox-world/native-babylon-block-profile";
import { sha256Bytes, stringifyCanonicalJson } from "@whitebox-world/protocol";
import {
  parseFormalWorldCaptureIntentV1, parseFormalWorldCaptureReceiptV1,
  parseFormalOpeningObservationV1, parseFormalSemanticViewObservationSetV1,
  parseFormalSpawnSupportObservationV1, parseFormalColliderOverlayObservationV1,
  parseFormalScriptedTraversalObservationV1,
} from "@whitebox-world/runtime-contracts";
import { createNativeBlockPackageAttemptFixtureV1, REPOSITORY_ROOT } from "../reconstruction/native-package.test-support.js";
import { packageNativeBlockAttemptV1 } from "../reconstruction/native-package.js";
import { materializeFormalWorldCaptureRequestV1 } from "../reconstruction/formal-capture-request.js";
import { captureProductionHostedWorldPackageV1 } from "../reconstruction/formal-capture.js";
import { evaluateNativeBlockAttemptV1 } from "../reconstruction/evaluate.js";
import { measureFormalIdentityMaskV1 } from "../reconstruction/formal-identity-mask-measurement.js";
import { NATIVE_SEMANTIC_GEOMETRY_FIXTURES_V1 } from "../reconstruction/native-semantic-geometry.test-support.js";
import {
  assertNativeSemanticReferenceConsumptionV1, loadNativeSemanticReferenceV1,
  nativeSemanticReferenceMetricIdsV1, parseNativeNoScriptCaptureArgsV1,
} from "./native-semantic-reference.test-support.js";

// Explicit Browser lane, not part of default Vitest. No model/provider task is submitted.
// Reuse the Package-owner fixture: generation is synthetic, Host Check/Ground/Package,
// Babylon/Havok Capture, observation parsing and Evaluation are actual implementations.
const json = async (file: string): Promise<unknown> => JSON.parse(await readFile(file, "utf8"));
const args = parseNativeNoScriptCaptureArgsV1(process.argv.slice(2), Object.keys(NATIVE_SEMANTIC_GEOMETRY_FIXTURES_V1));
const withoutSemanticTargets = args.mode === "without-semantic-targets";
const geometryFixtureId = "geometryFixtureId" in args
  ? args.geometryFixtureId as keyof typeof NATIVE_SEMANTIC_GEOMETRY_FIXTURES_V1 : undefined;
const semanticReference = args.mode === "semantic-geometry-reference"
  ? await loadNativeSemanticReferenceV1(args.baselineEvidenceRoot) : undefined;
const evidenceRoot = await mkdtemp(path.join(os.tmpdir(), "worldkit-no-script-capture-evidence-"));
let fixture: Awaited<ReturnType<typeof createNativeBlockPackageAttemptFixtureV1>> | undefined;
try {
  console.log("native-no-script-capture: prepare deterministic fixture");
  fixture = await createNativeBlockPackageAttemptFixtureV1(geometryFixtureId === undefined ? {
    withoutScriptedTraversal: true,
    withoutSemanticTargets,
    worldBoundsPolicy: { mode: "checked-block-layout" },
    groundExploration: {
      mode: "source-authored",
      requiredTargets: [
        { id: "middle", region: "middle", standPositionMetersXYZ: [0, 0, 10] },
        { id: "remote", region: "remote", standPositionMetersXYZ: [0, 0, 3] },
      ],
      requiredTraversalBands: [{ id: "entry-middle", halfWidthMeters: 1, isBidirectional: true,
        centerlineStandPositionsMetersXYZ: [[0, 0, 18], [0, 0, 10]] }],
    },
  } : { ...NATIVE_SEMANTIC_GEOMETRY_FIXTURES_V1[geometryFixtureId].options,
    ...(semanticReference === undefined ? {} : { semanticReferenceProjections: semanticReference.semanticReferenceProjections }),
  });
  const caseBytes = await readFile(fixture.casePath);
  const requestBytes = await readFile(path.join(fixture.attemptDirectoryPath, "generation-request.json"));
  console.log("native-no-script-capture: real Native Check/Ground/Package");
  const packaged = await packageNativeBlockAttemptV1({ repositoryRoot: REPOSITORY_ROOT,
    casePath: fixture.casePath, attemptDirectoryPath: fixture.attemptDirectoryPath,
    outputDirectoryPath: fixture.outputDirectoryPath });
  assert.equal(packaged.groundAnalysisReport.admissionOutcome, "passed");
  if (withoutSemanticTargets) {
    assert.deepEqual(packaged.verifiedWorldPackage.nativeBlockMaterializerMetadata?.visualGroups, []);
    assert(packaged.verifiedWorldPackage.nativeBlockMaterializerMetadata!.blocks.length > 0);
  }
  const caseRoot = path.dirname(fixture.casePath);
  const request = await materializeFormalWorldCaptureRequestV1({ outputMode: "create", visualCaptureScope: "world-only",
    casePath: fixture.casePath, evaluationProfilePath: path.join(caseRoot, "evaluation-profile.json"),
    sceneAuthoringAttemptPath: path.join(fixture.attemptDirectoryPath, "attempt.json"),
    packageDirectoryPath: fixture.outputDirectoryPath,
    outputPath: path.join(fixture.attemptDirectoryPath, "formal-world-capture-request.json"),
    formalCaptureIntent: parseFormalWorldCaptureIntentV1(await json(path.join(caseRoot, fixture.reconstructionCase.formalCaptureIntentRef))),
  });
  assert.deepEqual(request.request.scriptedTraversal.checks, []);
  if (withoutSemanticTargets) assert.deepEqual(request.request.semanticCaptureMap.bindings, []);
  const captureRoot = path.join(fixture.attemptDirectoryPath, "capture");
  console.log("native-no-script-capture: actual Browser Capture");
  const capture = await captureProductionHostedWorldPackageV1({
    packageDirectoryPath: fixture.outputDirectoryPath, outputPath: path.join(captureRoot, "opening.png"),
    triviewOutputPath: captureRoot, rejectedOutputDirectoryPath: path.join(fixture.attemptDirectoryPath, "rejected-capture"),
    openingGate: { executionPurpose: "production", reconstructionCase: fixture.reconstructionCase, evaluationProfile: fixture.profile },
  });
  assert.deepEqual(capture.cleanupOutcomes, { hostedBrowserSession: "completed", viteServer: "completed" });
  const receipt = parseFormalWorldCaptureReceiptV1(await json(path.join(captureRoot, "formal-world-capture-receipt.json")));
  const spawnSupport = parseFormalSpawnSupportObservationV1(await json(path.join(captureRoot, "spawn-support-observation.json")));
  // CF-04/T1: actual production captures the reset state, not the later support
  // sampling Tick. Keep both independently hashed states in the real output.
  assert.equal(receipt.readySnapshot.world.simulationTick, 0);
  assert.equal(spawnSupport.resetReadySnapshotHash, receipt.readySnapshotHash);
  assert.equal(spawnSupport.sampledSnapshot.world.simulationTick, 1);
  assert.notEqual(spawnSupport.sampledSnapshotHash, receipt.readySnapshotHash);
  const openingCamera = receipt.readySnapshot.view.camera;
  assert.equal(openingCamera.mode, "tracking");
  if (openingCamera.mode === "tracking") assert.equal(openingCamera.subjectOcclusion?.selectionElapsedSeconds, 0);
  const traversal = parseFormalScriptedTraversalObservationV1(await json(path.join(captureRoot, "scripted-traversal.json")));
  assert.deepEqual(traversal.checks, []);
  assert.equal(traversal.resetReadySnapshotHash, receipt.readySnapshotHash);
  const identityMaskPngs = await Promise.all(receipt.views.map(async ({ viewId }) => ({
    viewId, bytes: new Uint8Array(await readFile(path.join(captureRoot, `${viewId}-identity-mask.png`))),
  })));
  const evaluation = await evaluateNativeBlockAttemptV1({ attemptDirectoryPath: fixture.attemptDirectoryPath,
    evidenceInput: {
      id: `${fixture.reconstructionCase.id}.no-script-evidence`, caseRef: receipt.caseRef,
      reconstructionCase: fixture.reconstructionCase, evaluationProfileRef: receipt.evaluationProfileRef,
      evaluationProfile: fixture.profile, verifiedWorldPackage: packaged.verifiedWorldPackage,
      authoringManifest: parseNativeBlockAuthoringManifestV1(await json(path.join(fixture.attemptDirectoryPath, "source/native-block-authoring.json"))),
      captureReceiptRef: `${receipt.formalRequestRef.slice(0, -"formal-world-capture-request.json".length)}capture/formal-world-capture-receipt.json`,
      captureReceipt: receipt, scriptedTraversalObservation: traversal,
      identityMaskPngs,
      openingObservation: parseFormalOpeningObservationV1(await json(path.join(captureRoot, "opening-observation.json"))),
      semanticViewObservationSet: parseFormalSemanticViewObservationSetV1(await json(path.join(captureRoot, "semantic-view-observation-set.json"))),
      spawnSupportObservation: spawnSupport,
      colliderOverlayObservation: parseFormalColliderOverlayObservationV1(await json(path.join(captureRoot, "collider-overlay-observation.json"))),
    },
  });
  // Retain both consumer stages and actual pixels before regression assertions.
  await cp(captureRoot, path.join(evidenceRoot, "capture"), { recursive: true });
  await cp(evaluation.evaluationPath, path.join(evidenceRoot, "evaluation.json"));
  await cp(evaluation.evidenceSetPath, path.join(evidenceRoot, "evidence-set.json"));
  console.log(`native-no-script-capture: inspectable evidence ${evidenceRoot}`);
  const semanticReferenceReport = semanticReference === undefined ? undefined : {
    mode: "semantic-geometry-reference", baseline: semanticReference.source,
    semanticMetricIdsByView: nativeSemanticReferenceMetricIdsV1(evaluation.evaluation),
  };
  if (semanticReference !== undefined) {
    await cp(fixture.casePath, path.join(evidenceRoot, "case.json"));
    await writeFile(path.join(evidenceRoot, "semantic-reference.json"), stringifyCanonicalJson(semanticReferenceReport), { flag: "wx" });
    assertNativeSemanticReferenceConsumptionV1({ reference: semanticReference, receipt,
      identityMaskPngs, evidence: evaluation.evidenceSet, evaluation: evaluation.evaluation });
  }
  assert.equal(evaluation.evaluation.dimensions.find(row => row.dimensionId === "critical-traversal")?.status, "incomplete");
  if (withoutSemanticTargets) {
    for (const dimensionId of ["semantic-silhouette", "topology"]) {
      assert.equal(evaluation.evaluation.dimensions.find(row => row.dimensionId === dimensionId)?.status, "incomplete");
    }
    const opening = parseFormalOpeningObservationV1(await json(path.join(captureRoot, "opening-observation.json")));
    assert.deepEqual(opening.visualGroups, []);
    assert(opening.controlledSubjectProjection.coverageBasisPoints > 0);
  }
  assert.deepEqual(await readFile(fixture.casePath), caseBytes);
  assert.deepEqual(await readFile(path.join(fixture.attemptDirectoryPath, "generation-request.json")), requestBytes);
  const images = [];
  for (const name of ["opening.png", "world-side.png", "world-top-down.png", "collider-overlay.png",
    "opening-identity-mask.png", "world-side-identity-mask.png", "world-top-down-identity-mask.png"]) {
    const bytes = await readFile(path.join(captureRoot, name));
    const metadata = await sharp(bytes).metadata();
    assert.equal(metadata.width, receipt.formalRequest.views[0].widthPixels);
    assert.equal(metadata.height, receipt.formalRequest.views[0].heightPixels);
    images.push({ name, widthPixels: metadata.width, heightPixels: metadata.height, contentHash: sha256Bytes(bytes) });
  }
  const identityProjections = [];
  for (const view of receipt.views) {
    const projections = measureFormalIdentityMaskV1({
      view, pngBytes: await readFile(path.join(captureRoot, `${view.viewId}-identity-mask.png`)),
      targets: receipt.formalRequest.semanticCaptureMap.bindings,
    });
    identityProjections.push({ viewId: view.viewId, targets: [...projections].map(
      ([acceptanceTargetRef, projection]) => ({ acceptanceTargetRef, ...projection })) });
  }
  const topDown = identityProjections.find(({ viewId }) => viewId === "world-top-down");
  assert(topDown !== undefined);
  const openingPixels = identityProjections.find(({ viewId }) => viewId === "opening")!;
  const semanticViews = parseFormalSemanticViewObservationSetV1(await json(path.join(captureRoot, "semantic-view-observation-set.json")));
  for (const target of receipt.formalRequest.semanticCaptureMap.bindings) {
    assert(identityProjections.some(({ targets }) => targets.some((projection) =>
      projection.acceptanceTargetRef === target.acceptanceTargetRef && projection.outcome === "visible")),
    `Fixture target ${target.acceptanceTargetRef} must have exact admitted identity pixels in at least one real view`);
    // All five targets in this deterministic fixture have exposed top surfaces.
    // This catches a black walkable overlay hiding the colored Block underneath;
    // it is not a visibility requirement on arbitrary production scenes.
    assert(topDown.targets.some((projection) =>
      projection.acceptanceTargetRef === target.acceptanceTargetRef && projection.outcome === "visible"),
    `Fixture target ${target.acceptanceTargetRef} must have visible top-down identity pixels`);
    if (geometryFixtureId === undefined &&
      (target.acceptanceTargetRef === "worldkit://acceptance-target/gate-mass@1" ||
       target.acceptanceTargetRef === "worldkit://acceptance-target/mountain-cliff-layers@1")) {
      const pixels = openingPixels.targets.find((projection) => projection.acceptanceTargetRef === target.acceptanceTargetRef)!;
      const structure = semanticViews.views.find(({ viewId }) => viewId === "opening")!
        .targets.find(({ acceptanceTargetRef }) => acceptanceTargetRef === target.acceptanceTargetRef)!.structuralProjection;
      assert(pixels.outcome === "visible" && structure.outcome === "projected");
      // These two fixture targets are individual solid Blocks without overlays.
      // MSAA must not manufacture their adjacent palette color on the ground.
      for (const axis of ["X", "Y"] as const) {
        const tolerance = Math.ceil(20000 / (axis === "X" ? images[0]!.widthPixels! : images[0]!.heightPixels!));
        assert(pixels.normalizedBounds[`min${axis}BasisPoints`] >= structure.normalizedBounds[`min${axis}BasisPoints`] - tolerance &&
          pixels.normalizedBounds[`max${axis}BasisPoints`] <= structure.normalizedBounds[`max${axis}BasisPoints`] + tolerance,
        `Fixture ${target.acceptanceTargetRef} identity pixels must not leak outside its solid projected ${axis} bounds`);
      }
    }
  }
  const result = { kind: "native-no-script-capture-browser-regression", outcome: "passed",
    ...(geometryFixtureId === undefined ? {} : { geometryFixtureId }),
    ...(semanticReferenceReport === undefined ? {} : { semanticReference: semanticReferenceReport }),
    scope: "stubbed-generation-real-native-package-browser-capture", worldPackageRootHash: packaged.worldPackageRootHash,
    cleanupOutcomes: capture.cleanupOutcomes, traversalChecks: 0, strictTraversalStatus: "incomplete",
    semanticTargetCount: request.request.semanticCaptureMap.bindings.length, images, identityProjections, evidenceRoot };
  await writeFile(path.join(evidenceRoot, "evidence.json"), stringifyCanonicalJson(result), { flag: "wx" });
  console.log(JSON.stringify(result));
} finally {
  if (fixture !== undefined) await rm(fixture.root, { recursive: true, force: true });
}
