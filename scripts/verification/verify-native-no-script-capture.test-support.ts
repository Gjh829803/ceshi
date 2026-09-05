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

// Explicit Browser lane, not part of default Vitest. No model/provider task is submitted.
// Reuse the Package-owner fixture: generation is synthetic, Host Check/Ground/Package,
// Babylon/Havok Capture, observation parsing and Evaluation are actual implementations.
const json = async (file: string): Promise<unknown> => JSON.parse(await readFile(file, "utf8"));
const arguments_ = process.argv.slice(2);
assert(arguments_.length === 0 || (arguments_.length === 1 && arguments_[0] === "--without-semantic-targets"),
  "Usage: verify:native-no-script-capture [--without-semantic-targets]");
const withoutSemanticTargets = arguments_.length === 1;
const evidenceRoot = await mkdtemp(path.join(os.tmpdir(), "worldkit-no-script-capture-evidence-"));
let fixture: Awaited<ReturnType<typeof createNativeBlockPackageAttemptFixtureV1>> | undefined;
try {
  console.log("native-no-script-capture: prepare deterministic fixture");
  fixture = await createNativeBlockPackageAttemptFixtureV1({
    withoutScriptedTraversal: true,
    withoutSemanticTargets,
    worldBoundsPolicy: { mode: "checked-block-layout" },
    groundExploration: {
      mode: "source-authored",
      requiredTargets: [
        { id: "middle", region: "middle", standPositionMetersXYZ: [0, 0, 10] },
        { id: "remote", region: "remote", standPositionMetersXYZ: [0, 0, 3] },
      ],
      requiredTraversalBands: [{ id: "entry-middle", halfWidthMeters: 1,
        centerlineStandPositionsMetersXYZ: [[0, 0, 18], [0, 0, 10]] }],
    },
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
  const request = await materializeFormalWorldCaptureRequestV1({ outputMode: "create",
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
  const traversal = parseFormalScriptedTraversalObservationV1(await json(path.join(captureRoot, "scripted-traversal.json")));
  assert.deepEqual(traversal.checks, []);
  assert.equal(traversal.resetReadySnapshotHash, receipt.readySnapshotHash);
  const evaluation = await evaluateNativeBlockAttemptV1({ attemptDirectoryPath: fixture.attemptDirectoryPath,
    evidenceInput: {
      id: `${fixture.reconstructionCase.id}.no-script-evidence`, caseRef: receipt.caseRef,
      reconstructionCase: fixture.reconstructionCase, evaluationProfileRef: receipt.evaluationProfileRef,
      evaluationProfile: fixture.profile, verifiedWorldPackage: packaged.verifiedWorldPackage,
      authoringManifest: parseNativeBlockAuthoringManifestV1(await json(path.join(fixture.attemptDirectoryPath, "source/native-block-authoring.json"))),
      captureReceiptRef: `${receipt.formalRequestRef.slice(0, -"formal-world-capture-request.json".length)}capture/formal-world-capture-receipt.json`,
      captureReceipt: receipt, scriptedTraversalObservation: traversal,
      identityMaskPngs: await Promise.all(receipt.views.map(async ({ viewId }) => ({
        viewId, bytes: new Uint8Array(await readFile(path.join(captureRoot, `${viewId}-identity-mask.png`))),
      }))),
      openingObservation: parseFormalOpeningObservationV1(await json(path.join(captureRoot, "opening-observation.json"))),
      semanticViewObservationSet: parseFormalSemanticViewObservationSetV1(await json(path.join(captureRoot, "semantic-view-observation-set.json"))),
      spawnSupportObservation: parseFormalSpawnSupportObservationV1(await json(path.join(captureRoot, "spawn-support-observation.json"))),
      colliderOverlayObservation: parseFormalColliderOverlayObservationV1(await json(path.join(captureRoot, "collider-overlay-observation.json"))),
    },
  });
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
  for (const target of receipt.formalRequest.semanticCaptureMap.bindings) {
    assert(identityProjections.some(({ targets }) => targets.some((projection) =>
      projection.acceptanceTargetRef === target.acceptanceTargetRef && projection.outcome === "visible")),
    `Fixture target ${target.acceptanceTargetRef} must have exact admitted identity pixels in at least one real view`);
  }
  await cp(captureRoot, path.join(evidenceRoot, "capture"), { recursive: true });
  await cp(evaluation.evaluationPath, path.join(evidenceRoot, "evaluation.json"));
  const result = { kind: "native-no-script-capture-browser-regression", outcome: "passed",
    scope: "stubbed-generation-real-native-package-browser-capture", worldPackageRootHash: packaged.worldPackageRootHash,
    cleanupOutcomes: capture.cleanupOutcomes, traversalChecks: 0, strictTraversalStatus: "incomplete",
    semanticTargetCount: request.request.semanticCaptureMap.bindings.length, images, identityProjections, evidenceRoot };
  await writeFile(path.join(evidenceRoot, "evidence.json"), stringifyCanonicalJson(result), { flag: "wx" });
  console.log(JSON.stringify(result));
} finally {
  if (fixture !== undefined) await rm(fixture.root, { recursive: true, force: true });
}
