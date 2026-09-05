import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  symlink,
  utimes,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

import {
  createSceneId,
  createKeyedSerialExecutor,
  createStudio,
  decodeImagePayload,
  deriveReliabilityMetrics,
  deriveWorkflowMetrics,
  deriveWorkflowTrajectory,
  injectStudioViewerBindingV1,
  isAllowedSceneAsset,
  isAuthorizedHeader,
  normalizePrompt,
  normalizeTestSetName,
  parseStageTokenUsage,
  workflowPolicyVersion,
  writeJsonAtomic,
} from "./server.mjs";

const {
  createBabylonNativeWorldPackageV1,
} = await tsImport("@whitebox-world/world-package", {
  parentURL: import.meta.url,
});
const {
  createBabylonNativeBlockWorldPackageTestInputV1,
} = await tsImport("@whitebox-world/world-package/testing", {
  parentURL: import.meta.url,
});
const {
  hashFormalColliderOverlayObservationV1,
  hashFormalOpeningObservationV1,
  hashFormalScriptedTraversalObservationV1,
  hashFormalSemanticCaptureMapV1,
  hashFormalSemanticViewObservationSetV1,
  hashFormalSpawnSupportObservationV1,
  hashFormalWorldCaptureReceiptV1,
  hashFormalWorldCaptureRequestV1,
  parseFormalColliderOverlayObservationV1,
  parseFormalOpeningObservationV1,
  parseFormalScriptedTraversalObservationV1,
  parseFormalSemanticCaptureMapV1,
  parseFormalSemanticViewObservationSetV1,
  parseFormalSpawnSupportObservationV1,
  parseFormalWorldCaptureReceiptV1,
  parseFormalWorldCaptureRequestV1,
  deriveFormalWhiteboxTriviewManifestV1,
} = await tsImport("@whitebox-world/runtime-contracts", {
  parentURL: import.meta.url,
});
const {
  writeWorldPackageDirectoryV1,
} = await tsImport("../../../scripts/lib/file-world-package.ts", {
  parentURL: import.meta.url,
});
const {
  createEvidenceSetFixtureInputV1,
} = await tsImport(
  "../../../scripts/reconstruction/evaluate-fixture.test-support.ts",
  { parentURL: import.meta.url },
);
const {
  hashEntryThirdPersonValidationResultV1,
  validateFormalOpeningEntryThirdPersonV1,
} = await tsImport("../../../scripts/visual/entry-third-person.ts", {
  parentURL: import.meta.url,
});

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const temporaryRoots = [];
const VALID_ENTRY_OPENING_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAIAAAD/gAIDAAAACXBIWXMAAAPoAAAD6AG1e1JrAAABOklEQVR4nO3cwQ0DMQhE0RThc86/KfpPGWnBl4is9CQXsBoBi2G+X+edc+5EeFHqXIcLsSJWv8gYkRWxElnt/o6kYcRKZCUNe0pjrGZFrERW0rD1YqRmRaxEVusppnWIWIms/v/o4CNWIitp2HoxekzN+sxcnvVPJVbESmQlDUfNSoHP31DrkNYhfVaa0tHB57qTu6GLdC7SmTpkRDPmWRn+ZVJqrJyxcmbwWViM7U5WYdkbWrJmyZqNdNb3w+sQY0hcNCxHsRzFnxUz23D+xSYZTykDbgy4cSvH2j188IEGQlgER4GjBEcJjhIcZeAowVGCo8BRgqMERwmOMnCU4CjBUeAowVGCowRHGThKcJTgKHCU4CjBUYKjDByl9afVHv8y23nOIVbESmQlDVsvRmpWxEpktZ5iN+cLuXVcj9nRAIsAAAAASUVORK5CYII=",
  "base64",
);
const VALID_EMPTY_OPENING_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAIAAAD/gAIDAAAACXBIWXMAAAPoAAAD6AG1e1JrAAABFElEQVR4nO3WsQ1CAQwDUYb4NfXtPyEr0CAH6UmZ4HR2/Hreuec7CC+knq91ASuw+kVimBVYMavtOxLDwIpZiWH/Mox1VmDFrMSweRnprMCKWc0jZjoEVszq/lnwgRWzEsPmZaSzAitmNY+Y6RBYMav7Z8EHVsxKDJuXkc4KrJjVPGKmQ2DFrO6fBR9YMSsxbF5GOiuwYlbziJkOgRWzun8WfGDFrMSweRnprMCKWc0jZjoEVszq/lnwgRWzEsPmZaSzAitmNY+Y6RBYMav7Z8EHVsxKDJuXkc4KrJjVPGKmQ2DFrO6fBR9YMSsxbF5GOiuwYlbziJkOgRWzun8WfGDFrMSweRnprMCKWc0jZjoEViuzPgVfvGS9VCQDAAAAAElFTkSuQmCC",
  "base64",
);

test("injects one exact Studio Viewer binding into Host-served Playground HTML", () => {
  assert.equal(
    injectStudioViewerBindingV1(
      "<!doctype html><html><head><title>Viewer</title></head><body></body></html>",
      "studio-world",
    ),
    "<!doctype html><html><head><title>Viewer</title>" +
      '<meta name="worldkit-studio-world-id" content="studio-world">' +
      "</head><body></body></html>",
  );
  assert.throws(
    () => injectStudioViewerBindingV1("<html></html>", "../escape"),
    /Studio Viewer world id is invalid/,
  );
});

async function temporaryRoot(prefix) {
  const root = await mkdtemp(path.join(repoRoot, "apps/studio", prefix));
  temporaryRoots.push(root);
  return root;
}

async function listen(studio) {
  await studio.initialize();
  await new Promise((resolve, reject) => {
    studio.server.once("error", reject);
    studio.server.listen(0, "127.0.0.1", resolve);
  });
  const address = studio.server.address();
  assert.ok(address && typeof address === "object");
  return `http://127.0.0.1:${address.port}`;
}

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

function canonicalHash(value) {
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}

async function writeNativeProductionFixture(
  fakeRepoRoot,
  sceneId,
  { strictDiagnosticOutcome = "passed", includeWhiteboxTriviews = false, withoutScriptedTraversal = false,
    withFrozenAppearanceReference = false, mutateResult = (value) => value } = {},
) {
  const artifactRoot = path.join(fakeRepoRoot, "artifacts/scenes", sceneId);
  const runId = "run-studio-native";
  const runRoot = path.join(artifactRoot, "runs", runId);
  const attemptRoot = path.join(runRoot, "attempts", "0");
  const caseRef = `artifact://world-reconstruction-case/${sceneId}/case.json`;
  const attemptArtifactRoot =
    `artifact://world-reconstruction-case/${sceneId}/runs/${runId}/attempts/0`;
  const reconstructionCase = {
    kind: "world-reconstruction-case",
    schemaVersion: 1,
    id: sceneId,
    ...(withFrozenAppearanceReference ? { referenceInputs: [{ inputRef: "reference-0.png", mediaType: "image/png",
      contentHash: `sha256:${createHash("sha256").update(VALID_ENTRY_OPENING_PNG).digest("hex")}` }] } : {}),
  };
  const caseHash = canonicalHash(reconstructionCase);
  const packageDirectory = createBabylonNativeWorldPackageV1(
    createBabylonNativeBlockWorldPackageTestInputV1({
      packageId: `${sceneId}.package`,
      worldId: sceneId,
    }),
  );
  const packageReceipt = packageDirectory.receipt;
  const worldPackageRef = packageReceipt.worldPackageRef;
  const worldPackageRootHash = packageReceipt.worldPackageRootHash;
  const worldBuildIdentityHash = packageReceipt.worldBuildIdentityHash;
  const sourceCapture = createEvidenceSetFixtureInputV1({
    allDimensionsPass: true,
    includeWhiteboxTriviews,
    withoutScriptedTraversal,
  });
  const sourceFormalRequest = sourceCapture.captureReceipt.formalRequest;
  const semanticCaptureMap = parseFormalSemanticCaptureMapV1({
    ...sourceFormalRequest.semanticCaptureMap,
    caseRef,
    caseHash,
  });
  const semanticCaptureMapHash =
    hashFormalSemanticCaptureMapV1(semanticCaptureMap);
  const nativeMaterializer = packageReceipt.manifest.sceneSource.nativeMaterializer;
  assert.equal(nativeMaterializer.kind, "babylon-native-block");
  const formalRequest = parseFormalWorldCaptureRequestV1({
    ...sourceFormalRequest,
    caseRef,
    caseHash,
    worldPackageRef,
    worldPackageRootHash,
    worldBuildIdentityHash,
    worldPackageBuildReceiptHash: canonicalHash(packageReceipt),
    semanticCaptureMap,
    semanticCaptureMapHash,
    nativeBlockMaterializerMetadataHash: nativeMaterializer.metadataHash,
  });
  const formalRequestHash = hashFormalWorldCaptureRequestV1(formalRequest);
  const observationIdentity = {
    worldPackageRef,
    worldPackageRootHash,
    worldBuildIdentityHash,
    formalRequestRef: formalRequest.formalRequestRef,
    formalRequest,
    formalRequestHash,
    semanticCaptureMapHash,
  };
  const openingObservation = parseFormalOpeningObservationV1({
    ...sourceCapture.openingObservation,
    ...observationIdentity,
  });
  const spawnSupportObservation = parseFormalSpawnSupportObservationV1({
    ...sourceCapture.spawnSupportObservation,
    ...observationIdentity,
  });
  const colliderOverlayObservation = parseFormalColliderOverlayObservationV1({
    ...sourceCapture.colliderOverlayObservation,
    ...observationIdentity,
  });
  const scriptedTraversalObservation =
    parseFormalScriptedTraversalObservationV1({
      ...sourceCapture.scriptedTraversalObservation,
      ...observationIdentity,
    });
  const openingPngHash = `sha256:${createHash("sha256")
    .update(VALID_ENTRY_OPENING_PNG)
    .digest("hex")}`;
  const supportingPngHash = `sha256:${createHash("sha256")
    .update(VALID_EMPTY_OPENING_PNG)
    .digest("hex")}`;
  const semanticViewObservationSet = parseFormalSemanticViewObservationSetV1({
    ...sourceCapture.semanticViewObservationSet,
    ...observationIdentity,
    views: sourceCapture.semanticViewObservationSet.views.map((view) => ({
      ...view,
      pngContentHash: view.viewId === "opening" ? openingPngHash : supportingPngHash,
    })),
  });
  const captureReceipt = parseFormalWorldCaptureReceiptV1({
    ...sourceCapture.captureReceipt,
    formalRequestRef: formalRequest.formalRequestRef,
    formalRequest,
    formalRequestHash,
    caseRef,
    caseHash,
    worldPackageRef,
    worldPackageRootHash,
    worldBuildIdentityHash,
    worldPackageBuildReceiptHash: canonicalHash(packageReceipt),
    semanticCaptureMapHash,
    nativeBlockMaterializerMetadataHash: nativeMaterializer.metadataHash,
    views: sourceCapture.captureReceipt.views.map((view) => ({
      ...view,
      pngContentHash: view.viewId === "opening"
        ? openingPngHash
        : supportingPngHash,
    })),
    openingObservationContentHash:
      hashFormalOpeningObservationV1(openingObservation),
    semanticViewObservationSetContentHash:
      hashFormalSemanticViewObservationSetV1(semanticViewObservationSet),
    spawnSupportObservationContentHash:
      hashFormalSpawnSupportObservationV1(spawnSupportObservation),
    colliderOverlayPngContentHash: supportingPngHash,
    colliderOverlayObservationContentHash:
      hashFormalColliderOverlayObservationV1(colliderOverlayObservation),
    scriptedTraversalContentHash:
      hashFormalScriptedTraversalObservationV1(scriptedTraversalObservation),
  });
  const captureReceiptHash = hashFormalWorldCaptureReceiptV1(captureReceipt);
  const evaluation = {
    kind: "world-reconstruction-evaluation-result",
    schemaVersion: 1,
    caseRef,
    caseHash,
    worldPackageRef,
    worldPackageRootHash,
    worldBuildIdentityHash,
    captureReceiptHash,
    outcome: strictDiagnosticOutcome === "failed" ? "failed" : "passed",
  };
  const evaluationHash = canonicalHash(evaluation);
  const groundAnalysisReport = {
    kind: "babylon-native-block-ground-analysis-report",
    schemaVersion: 1,
    identity: {
      logicalGroundModelHash: `sha256:${"4".repeat(64)}`,
      walkableTopologyHash: `sha256:${"5".repeat(64)}`,
      traversalCapabilityEnvelopeHash: `sha256:${"6".repeat(64)}`,
      caseHash,
      worldPackageRootHash,
      measurementChunkPolicyHash: `sha256:${"7".repeat(64)}`,
    },
    analysisOutcome: "passed",
    admissionOutcome: "passed",
    failureFacts: [],
    metrics: {},
    standableNodes: [],
  };
  const groundAnalysisReportHash = canonicalHash(groundAnalysisReport);
  const runReceipt = {
    kind: "world-reconstruction-run-receipt",
    schemaVersion: 1,
    id: `${sceneId}.${runId}`,
    caseRef,
    caseHash,
    outcome: evaluation.outcome,
    attempts: [{
      kind: "evaluated",
      attemptIndex: 0,
      outcome: evaluation.outcome,
      worldPackageRef,
      worldPackageRootHash,
      worldBuildIdentityHash,
      groundAnalysisReportRef: `${attemptArtifactRoot}/ground-analysis-report.json`,
      groundAnalysisReportHash,
      captureReceiptRef: `${attemptArtifactRoot}/capture/formal-world-capture-receipt.json`,
      captureReceiptHash,
      evaluationResultRef: `${attemptArtifactRoot}/evaluation.json`,
      evaluationResultHash: evaluationHash,
    }],
    finalAttemptIndex: 0,
    finalEvaluationResultRef: `${attemptArtifactRoot}/evaluation.json`,
    finalEvaluationResultHash: evaluationHash,
    cleanupOutcome: "completed",
  };
  const runReceiptHash = canonicalHash(runReceipt);
  await mkdir(path.join(attemptRoot, "capture"), { recursive: true });
  if (withFrozenAppearanceReference) {
    await mkdir(path.join(artifactRoot, "inputs"), { recursive: true });
    await writeFile(path.join(artifactRoot, "inputs/reference-0.png"), VALID_ENTRY_OPENING_PNG);
  }
  for (const mask of sourceCapture.identityMaskPngs) {
    await writeFile(path.join(attemptRoot, "capture", `${mask.viewId}-identity-mask.png`), mask.bytes);
  }
  await writeWorldPackageDirectoryV1({
    outputDirectoryPath: path.join(attemptRoot, "world-package"),
    directory: packageDirectory,
  });
  await Promise.all([
    writeFile(path.join(artifactRoot, "native-world-input.json"), "{}"),
    writeFile(path.join(artifactRoot, "scene-brief.md"), "# Native Studio fixture\n"),
    writeFile(path.join(artifactRoot, "case.json"), canonicalJson(reconstructionCase)),
    writeFile(path.join(artifactRoot, "evaluation-profile.json"), "{}"),
    writeFile(
      path.join(attemptRoot, "capture", "opening.png"),
      VALID_ENTRY_OPENING_PNG,
    ),
    writeFile(
      path.join(attemptRoot, "capture", "world-side.png"),
      VALID_EMPTY_OPENING_PNG,
    ),
    writeFile(
      path.join(attemptRoot, "capture", "world-top-down.png"),
      VALID_EMPTY_OPENING_PNG,
    ),
    writeFile(
      path.join(attemptRoot, "capture", "collider-overlay.png"),
      VALID_EMPTY_OPENING_PNG,
    ),
    writeFile(
      path.join(attemptRoot, "capture", "opening-observation.json"),
      canonicalJson(openingObservation),
    ),
    writeFile(
      path.join(attemptRoot, "capture", "semantic-view-observation-set.json"),
      canonicalJson(semanticViewObservationSet),
    ),
    writeFile(
      path.join(attemptRoot, "capture", "spawn-support-observation.json"),
      canonicalJson(spawnSupportObservation),
    ),
    writeFile(
      path.join(attemptRoot, "capture", "collider-overlay-observation.json"),
      canonicalJson(colliderOverlayObservation),
    ),
    writeFile(
      path.join(attemptRoot, "capture", "scripted-traversal.json"),
      canonicalJson(scriptedTraversalObservation),
    ),
    writeFile(
      path.join(attemptRoot, "capture", "formal-world-capture-receipt.json"),
      canonicalJson(captureReceipt),
    ),
    writeFile(path.join(attemptRoot, "evaluation.json"), canonicalJson(evaluation)),
    writeFile(
      path.join(attemptRoot, "ground-analysis-report.json"),
      canonicalJson(groundAnalysisReport),
    ),
    writeFile(path.join(runRoot, "run-receipt.json"), canonicalJson(runReceipt)),
  ]);

  const finalRoot = path.join(artifactRoot, "final");
  const finalPackageRoot = path.join(finalRoot, "world-package");
  await mkdir(path.join(finalRoot, "capture"), { recursive: true });
  await writeWorldPackageDirectoryV1({
    outputDirectoryPath: finalPackageRoot,
    directory: packageDirectory,
  });
  const strictDiagnosticCodes = strictDiagnosticOutcome === "failed"
    ? ["NBR70_BLOCKER_IDENTITY_MISMATCH"]
    : [];
  const strictDiagnostic = {
    kind: "world-reconstruction-strict-diagnostic-receipt",
    schemaVersion: 1,
    id: `${sceneId}.${runId}.strict`,
    caseRef,
    caseHash,
    runReceiptRef:
      `artifact://world-reconstruction-case/${sceneId}/runs/${runId}/run-receipt.json`,
    runReceiptHash,
    attemptIndex: 0,
    worldPackageRef,
    worldPackageRootHash,
    worldBuildIdentityHash,
    captureReceiptHash,
    evaluationResultHash: evaluationHash,
    outcome: strictDiagnosticOutcome,
    diagnosticCodes: strictDiagnosticCodes,
    cleanupOutcome: "not-started",
  };
  const strictDiagnosticHash = canonicalHash(strictDiagnostic);
  const entryValidation = await validateFormalOpeningEntryThirdPersonV1({
    openingPngBytes: VALID_ENTRY_OPENING_PNG,
    openingObservation,
  });
  assert.equal(entryValidation.status, "passed");
  const entryValidationHash =
    hashEntryThirdPersonValidationResultV1(entryValidation);
  const launch = {
    kind: "native-block-reconstruction-launch",
    schemaVersion: 1,
    caseId: sceneId,
    runReceiptRef:
      `artifact://world-reconstruction-case/${sceneId}/runs/${runId}/run-receipt.json`,
    runReceiptHash,
    worldPackageRelativePath: "final/world-package",
    worldPackageRef,
    worldPackageRootHash,
    captureReceiptRelativePath: "final/capture/formal-world-capture-receipt.json",
    captureReceiptHash,
    evaluationRelativePath: "final/evaluation.json",
    evaluationHash,
    strictDiagnosticRelativePath: "final/strict-diagnostic.json",
    strictDiagnosticHash,
    entryValidationRelativePath: "final/entry-third-person-validation.json",
    entryValidationHash,
    launchCommand: "pnpm worldkit native run final/world-package --port 5174 --json",
  };
  for (const mask of sourceCapture.identityMaskPngs) {
    await writeFile(path.join(finalRoot, "capture", `${mask.viewId}-identity-mask.png`), mask.bytes);
  }
  await Promise.all([
    writeFile(
      path.join(finalRoot, "capture", "opening.png"),
      VALID_ENTRY_OPENING_PNG,
    ),
    writeFile(
      path.join(finalRoot, "capture", "world-side.png"),
      VALID_EMPTY_OPENING_PNG,
    ),
    writeFile(
      path.join(finalRoot, "capture", "world-top-down.png"),
      VALID_EMPTY_OPENING_PNG,
    ),
    writeFile(
      path.join(finalRoot, "capture", "collider-overlay.png"),
      VALID_EMPTY_OPENING_PNG,
    ),
    writeFile(
      path.join(finalRoot, "capture", "opening-observation.json"),
      canonicalJson(openingObservation),
    ),
    writeFile(
      path.join(finalRoot, "capture", "semantic-view-observation-set.json"),
      canonicalJson(semanticViewObservationSet),
    ),
    writeFile(
      path.join(finalRoot, "capture", "spawn-support-observation.json"),
      canonicalJson(spawnSupportObservation),
    ),
    writeFile(
      path.join(finalRoot, "capture", "collider-overlay-observation.json"),
      canonicalJson(colliderOverlayObservation),
    ),
    writeFile(
      path.join(finalRoot, "capture", "scripted-traversal.json"),
      canonicalJson(scriptedTraversalObservation),
    ),
    writeFile(
      path.join(finalRoot, "capture", "formal-world-capture-receipt.json"),
      canonicalJson(captureReceipt),
    ),
    writeFile(path.join(finalRoot, "evaluation.json"), canonicalJson(evaluation)),
    writeFile(
      path.join(finalRoot, "strict-diagnostic.json"),
      canonicalJson(strictDiagnostic),
    ),
    writeFile(
      path.join(finalRoot, "entry-third-person-validation.json"),
      canonicalJson(entryValidation),
    ),
    writeFile(path.join(finalRoot, "launch.json"), canonicalJson(launch)),
  ]);
  if (includeWhiteboxTriviews) {
    const manifest = deriveFormalWhiteboxTriviewManifestV1(captureReceipt);
    for (const captureRoot of [path.join(attemptRoot, "capture"), path.join(finalRoot, "capture")]) {
      await mkdir(path.join(captureRoot, "triviews"));
      await writeFile(path.join(captureRoot, "triviews/whitebox-triview-manifest.json"), canonicalJson(manifest));
      for (const [index, row] of manifest.whiteboxTriviews.entries()) {
        const file = path.join(captureRoot, "triviews", row.imageUri);
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, sourceCapture.whiteboxTriviewPngs[index]);
      }
    }
  }
  return mutateResult({
    kind: "world-reconstruction-production-result",
    schemaVersion: 1,
    caseId: sceneId,
    caseRef,
    runId,
    productionOutcome: "passed",
    publicationOutcome: "published",
    evaluationOutcome: evaluation.outcome,
    strictDiagnosticOutcome,
    strictDiagnosticCodes,
    strictDiagnosticCleanupOutcome: "not-started",
    cleanupOutcome: "completed",
    attemptCount: 1,
    finalWorldPackagePath: finalPackageRoot,
    finalWorldPackageRef: worldPackageRef,
    finalWorldPackageRootHash: worldPackageRootHash,
    finalCaptureReceiptPath: path.join(
      finalRoot,
      "capture",
      "formal-world-capture-receipt.json",
    ),
    finalCaptureReceiptHash: captureReceiptHash,
    finalEvaluationPath: path.join(finalRoot, "evaluation.json"),
    finalEvaluationHash: evaluationHash,
    finalStrictDiagnosticPath: path.join(finalRoot, "strict-diagnostic.json"),
    finalStrictDiagnosticRef:
      `artifact://world-reconstruction-case/${sceneId}/final/strict-diagnostic.json`,
    finalStrictDiagnosticHash: strictDiagnosticHash,
    finalEntryValidationPath: path.join(
      finalRoot,
      "entry-third-person-validation.json",
    ),
    finalEntryValidationRef:
      `artifact://world-reconstruction-case/${sceneId}/final/entry-third-person-validation.json`,
    finalEntryValidationHash: entryValidationHash,
    runReceiptPath: path.join(runRoot, "run-receipt.json"),
    runReceiptRef: launch.runReceiptRef,
    runReceiptHash,
    finalDirectoryPath: finalRoot,
  });
}

async function waitForWorldTerminal(origin, id) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const detail = await fetch(`${origin}/api/worlds/${id}`).then((response) => response.json());
    if (["ready", "failed", "interrupted"].includes(detail.world.status)) return detail;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Studio world ${id} did not become terminal.`);
}

async function writeTrustedWhiteboxArtifacts(
  fakeRepoRoot,
  sceneId,
  {
    compilerVersion = "terrain-height-intent-compiler@1",
    requiresRouteValidation = false,
    routeReportMode = "exact",
  } = {},
) {
  const artifactRoot = path.join(fakeRepoRoot, "artifacts/scenes", sceneId);
  const planRoot = path.join(fakeRepoRoot, "apps/playground/public/scene-plans", sceneId);
  const triViewRoot = path.join(artifactRoot, "triviews", "player-subject");
  await Promise.all([
    mkdir(triViewRoot, { recursive: true }),
    mkdir(planRoot, { recursive: true }),
  ]);
  const png = Buffer.from("89504e470d0a1a0a00000000", "hex");
  const brief = "# WorldKit Scene Brief\n\n## 场景\n可信导入场景\n";
  const authoring = `${JSON.stringify({
    kind: "worldkit-authoring-spec",
    schemaVersion: 4,
    id: sceneId,
  })}\n`;
  const mapDraft = `${JSON.stringify({
    kind: "worldkit-scene-brief-implementation-map-draft",
    schemaVersion: 1,
    sceneId,
    authoringSpecId: sceneId,
    visualTargetMappings: [{ visualTargetId: "player-subject", runtimeEntityIds: ["player"], frontDirectionWorldXZ: [0, -1] }],
  })}\n`;
  const hash = (source) => `sha256:${createHash("sha256").update(source).digest("hex")}`;
  const terrainPrompt = "# Terrain Height Intent\n\nEncoding profile: signed-diverging-blue-gray-orange@1.\n";
  const resourceLockHash = `sha256:${"e".repeat(64)}`;
  const layoutSolveReportHash = `sha256:${"f".repeat(64)}`;
  const sceneBriefHash = `sha256:${"b".repeat(64)}`;
  const authoringSpecHash = hash(authoring);
  const normalizedWorldIr = {
    kind: "normalized-world-ir",
    schemaVersion: 4,
    resources: { resourceLockHash },
  };
  const normalizedWorldIrHash = hash(canonicalJson(normalizedWorldIr));
  const worldPackageRootHash = `sha256:${"a".repeat(64)}`;
  const worldBuildIdentityHash = `sha256:${"d".repeat(64)}`;
  const visualTarget = {
    visualTargetId: "player-subject",
    runtimeEntityIds: ["player"], frontDirectionWorldXZ: [0, -1],
    role: "primary-subject",
    semanticClassId: "subject.player",
    identityColor: "#E85D5D",
  };
  const implementationMap = {
    kind: "worldkit-scene-brief-implementation-map",
    schemaVersion: 1,
    sceneId,
    sceneBriefHash,
    authoringSpecId: sceneId,
    authoringSpecHash,
    visualTargetMappings: [{ visualTargetId: "player-subject", runtimeEntityIds: ["player"], frontDirectionWorldXZ: [0, -1] }],
    visualCaptureGroups: [visualTarget],
  };
  const requiredRoutes = requiresRouteValidation
    ? [{
        constraintId: "player-to-goal",
        routeId: "main-route",
        traversingEntityId: "player",
        startAnchorEntityId: "spawn",
        destinationAnchorEntityId: "goal",
      }]
    : [];
  const executionPlan = {
    kind: "worldkit-canonical-scene-execution-plan",
    schemaVersion: 1,
    authoringSpecHash,
    normalizedWorldIrHash,
    sceneResourceLockHash: resourceLockHash,
    sceneResourceLockEntries: [],
    layout: { layoutSolveReportHash },
    traversal: {
      connectivityRequirements: requiredRoutes.map((route) => ({
        ...route,
        kind: "connected-by-route",
      })),
    },
  };
  const executionPlanHash = hash(canonicalJson(executionPlan));
  const captureTargets = {
    kind: "worldkit-whitebox-triview-manifest",
    schemaVersion: 1,
    worldBuildIdentityHash,
    whiteboxTriviews: [{
      ...visualTarget,
      views: ["front", "right", "back"],
      imageUri: "player-subject/whitebox-triview.png",
    }],
  };
  const plannerReceipt = `${JSON.stringify({
    kind: "worldkit-planner-self-check",
    schemaVersion: 1,
    validatorVersion: "worldkit-planner-self-check-v4",
    sceneId,
    sceneSourceKind: "canonical",
    status: "passed",
    inputs: {
      sceneBriefHash: hash(brief),
      terrainHeightIntentPromptHash: hash(terrainPrompt),
      terrainHeightIntentPngHash: hash(png),
    },
  })}\n`;
  const builderReceipt = `${JSON.stringify({
    kind: "worldkit-builder-self-check",
    schemaVersion: 1,
    validatorVersion: "worldkit-builder-self-check-v6",
    sceneId,
    status: "passed",
    requiresTrustedRouteValidation: requiresRouteValidation,
    terrainScaleEvidence: {
      terrainEntityId: "terrain-main",
      operationalProfile: "ordinary-single-heightfield-v1",
    },
    routeBuildWindowEvidence: [],
    inputs: {
      sceneBriefHash: hash(brief),
      authoringSpecHash: hash(authoring),
      implementationMapDraftHash: hash(mapDraft),
    },
  })}\n`;
  const terrainReport = `${JSON.stringify({
    kind: "worldkit-terrain-height-intent-compile-report",
    schemaVersion: 1,
    status: "passed",
    sourcePngHash: hash(png),
  })}\n`;
  const finalReceipt = builderReceipt;
  const terrainManifest = `${JSON.stringify({
    kind: "worldkit-terrain-compilation-manifest",
    schemaVersion: 1,
    sceneId,
    runId: "fixture-run",
    compiler: {
      compilerVersion,
      normalizationProfileId: "signed-diverging-blue-gray-orange-median-datum@1",
    },
    inputs: {
      plannerReceiptHash: hash(plannerReceipt),
      terrainHeightIntentPromptHash: hash(terrainPrompt),
      terrainHeightIntentPngHash: hash(png),
      builderReceiptHash: hash(builderReceipt),
      builderAuthoringSpecHash: hash(authoring),
      implementationMapDraftHash: hash(mapDraft),
    },
    outputs: {
      authoringSpecHash: hash(authoring),
      terrainCompileReportHash: hash(terrainReport),
      finalAuthoringSelfCheckHash: hash(finalReceipt),
    },
  })}\n`;
  await Promise.all([
    writeFile(path.join(artifactRoot, "scene-brief.md"), brief),
    writeFile(path.join(artifactRoot, "terrain-height-intent-prompt.md"), terrainPrompt),
    writeFile(path.join(planRoot, "terrain-height-intent.png"), png),
    writeFile(path.join(artifactRoot, "planner-self-check.json"), plannerReceipt),
    writeFile(path.join(artifactRoot, "visual-identity-palette.json"), JSON.stringify({
      kind: "worldkit-visual-identity-palette",
      schemaVersion: 1,
      sceneId,
      sceneBriefHash,
      targets: [{ id: "player-subject" }],
    })),
    writeFile(path.join(artifactRoot, "authoring.builder.json"), authoring),
    writeFile(path.join(artifactRoot, "implementation-map.draft.json"), mapDraft),
    writeFile(path.join(artifactRoot, "builder-self-check.json"), builderReceipt),
    writeFile(path.join(artifactRoot, "authoring.json"), authoring),
    writeFile(path.join(artifactRoot, "terrain-height-intent-report.json"), terrainReport),
    writeFile(path.join(artifactRoot, "terrain-compilation-manifest.json"), terrainManifest),
    writeFile(path.join(artifactRoot, "final-authoring-self-check.json"), finalReceipt),
    writeFile(path.join(artifactRoot, "scene-implementation-map.json"), JSON.stringify(implementationMap)),
    writeFile(path.join(artifactRoot, "world.build.json"), JSON.stringify({
      kind: "worldkit-build-artifact",
      schemaVersion: 4,
      normalizedWorldIrHash,
      worldBuildIdentityHash,
      executionPlanHash,
      normalizedWorldIr,
      executionPlan,
    })),
    writeFile(path.join(artifactRoot, "opening-frame.png"), png),
    writeFile(path.join(artifactRoot, "runtime-snapshot.json"), JSON.stringify({
      kind: "worldkit-runtime-snapshot",
      schemaVersion: 4,
      worldBuildIdentityHash,
    })),
    writeFile(path.join(artifactRoot, "triviews/whitebox-triview-manifest.json"), JSON.stringify(captureTargets)),
    writeFile(path.join(triViewRoot, "whitebox-triview.png"), png),
  ]);
  if (requiresRouteValidation && routeReportMode !== "missing") {
    const reportFileName = "route-validation.20260825-120000-123.json";
    const requiredRouteSetHash = `sha256:${createHash("sha256").update(
      canonicalJson({
        kind: "route-validation-required-route-set",
        schemaVersion: 1,
        executionPlanHash,
        requiredRoutes,
      }),
    ).digest("hex")}`;
    const report = {
      kind: "worldkit-validation-report",
      schemaVersion: 2,
      id: `${sceneId}.route-validation`,
      status: routeReportMode === "failed" ? "failed" : "passed",
      subject: {
        kind: "world-package",
        worldPackageRootHash,
        authoringSpecHash,
        normalizedWorldIrHash,
        worldBuildIdentityHash:
          routeReportMode === "mismatched" ? resourceLockHash : worldBuildIdentityHash,
        resourceLockHash,
        layoutSolveReportHash,
      },
      routeValidationSetReceipt: {
        kind: "route-validation-set-receipt",
        schemaVersion: 1,
        authoringSpecHash,
        normalizedWorldIrHash,
        executionPlanHash,
        resourceLockHash,
        layoutSolveReportHash,
        requiredRouteCount: requiredRoutes.length,
        requiredRouteSetHash,
        requiredRoutes,
        rows: requiredRoutes.map((route) => ({
          ...route,
          resolvedTraversalLockHash: `sha256:${"9".repeat(64)}`,
          connectivityStatus: "complete",
          runtimeStatus: "complete",
          evidenceArtifactRefs: [],
        })),
      },
      gateResultsById: {
        "route-connectivity": { status: "passed" },
        "route-runtime-conformance": { status: "passed" },
      },
      evidenceArtifactsById: {},
      diagnostics: [],
    };
    const reportBytes = Buffer.from(`${canonicalJson(report)}\n`);
    await Promise.all([
      writeFile(path.join(artifactRoot, reportFileName), reportBytes),
      writeFile(path.join(artifactRoot, "route-validation-manifest.json"), JSON.stringify({
        kind: "worldkit-route-validation-manifest",
        schemaVersion: 1,
        sceneId,
        reportFileName,
        reportContentHash:
          `sha256:${createHash("sha256").update(reportBytes).digest("hex")}`,
      })),
    ]);
  }
  return { artifactRoot, captureTargets, png };
}

test.afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test("uses one current Native-default world-generation workflow contract", () => {
  assert.equal(workflowPolicyVersion, 6);
});

test("freezes Babylon Native by default and permits only explicit Canonical opt-in", async () => {
  const dataRoot = await temporaryRoot(".scene-source-binding-");
  const studio = createStudio({
    repoRoot,
    dataRoot,
    autoRunJobs: false,
    importExistingArtifacts: false,
    importBuiltinTestSets: false,
    importBuiltinResults: false,
  });
  const origin = await listen(studio);
  try {
    const nativeResponse = await fetch(`${origin}/api/worlds`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Native default",
        prompt: "Build a block world.",
      }),
    });
    assert.equal(nativeResponse.status, 202);
    assert.equal((await nativeResponse.json()).world.sceneSourceKind, "babylon-native");

    const canonicalResponse = await fetch(`${origin}/api/worlds`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Canonical opt in",
        prompt: "Build a heightfield world.",
        sceneSourceKind: "canonical",
      }),
    });
    assert.equal(canonicalResponse.status, 202);
    assert.equal((await canonicalResponse.json()).world.sceneSourceKind, "canonical");

    const invalidResponse = await fetch(`${origin}/api/worlds`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Invalid alias",
        prompt: "Do not accept an alias.",
        sceneSourceKind: "native",
      }),
    });
    assert.equal(invalidResponse.status, 400);
  } finally {
    await studio.shutdown();
  }
});

test("imports retained Canonical artifacts with an explicit Canonical source identity", async () => {
  const dataRoot = await temporaryRoot(".canonical-import-data-");
  const fakeRepoRoot = await temporaryRoot(".canonical-import-repo-");
  await writeTrustedWhiteboxArtifacts(fakeRepoRoot, "retained-canonical-world");
  const studio = createStudio({
    repoRoot: fakeRepoRoot,
    dataRoot,
    autoRunJobs: false,
    importBuiltinTestSets: false,
    importBuiltinResults: false,
  });
  const origin = await listen(studio);
  try {
    const payload = await (await fetch(`${origin}/api/worlds`)).json();
    const imported = payload.worlds.find(({ id }) =>
      id === "retained-canonical-world"
    );
    assert.equal(imported.sceneSourceKind, "canonical");
    assert.equal(imported.previewUrl, "/play/retained-canonical-world");
  } finally {
    await studio.shutdown();
  }
});

for (const strictDiagnosticOutcome of ["passed", "failed"]) {
  test(`consumes published Native production with a ${strictDiagnosticOutcome} strict diagnostic`, async () => {
    const dataRoot = await temporaryRoot(`.native-${strictDiagnosticOutcome}-data-`);
    const fakeRepoRoot = await temporaryRoot(`.native-${strictDiagnosticOutcome}-repo-`);
    let productionResult;
    const studio = createStudio({
      repoRoot: fakeRepoRoot,
      dataRoot,
      autoRunJobs: true,
      importExistingArtifacts: false,
      importBuiltinTestSets: false,
      importBuiltinResults: false,
      lwdpConfigured: true,
      beforeWorldSpawn: async (id) => {
        productionResult = await writeNativeProductionFixture(fakeRepoRoot, id, {
          strictDiagnosticOutcome,
        });
      },
      worldSpawnImplementation: (_command, _arguments, options) => spawn(
        process.execPath,
        ["-e", `process.stdout.write(${JSON.stringify(`${canonicalJson(productionResult)}\n`)})`],
        options,
      ),
    });
    const origin = await listen(studio);
    try {
      const created = (await (await fetch(`${origin}/api/worlds`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: `Native ${strictDiagnosticOutcome}`, prompt: "Build a block ridge." }),
      })).json()).world;
      const detail = await waitForWorldTerminal(origin, created.id);
      assert.equal(detail.world.status, "ready", detail.world.error);
      assert.equal(detail.world.outcome, "passed");
      assert.equal(detail.world.productionOutcome, "passed");
      assert.equal(detail.world.publicationOutcome, "published");
      assert.equal(
        detail.world.evaluationOutcome,
        strictDiagnosticOutcome === "failed" ? "failed" : "passed",
      );
      assert.equal(detail.world.whiteboxOutcome, "passed");
      assert.equal(detail.world.strictDiagnosticOutcome, strictDiagnosticOutcome);
      assert.deepEqual(
        detail.world.strictDiagnosticCodes,
        strictDiagnosticOutcome === "failed"
          ? ["NBR70_BLOCKER_IDENTITY_MISMATCH"]
          : [],
      );
      assert.equal(detail.world.coverUrl, `/api/worlds/${created.id}/deliverables/opening-frame`);
      assert.equal(detail.world.previewUrl, null);
      assert.equal(
        detail.world.nativeLaunch.command,
        "pnpm worldkit native run final/world-package --port 5174 --json",
      );
      assert.equal(
        detail.world.nativeLaunch.workingDirectoryPath,
        path.join(fakeRepoRoot, "artifacts/scenes", created.sceneId),
      );
      assert.ok(detail.media.deliverables.some(({ id, status }) =>
        id === "native-launch" && status === "available"));
      assert.ok(detail.media.deliverables.some(({ id, status }) =>
        id === "formal-world-capture-receipt" && status === "available"));
      assert.ok(detail.media.deliverables.some(({ id, status }) =>
        id === "native-strict-diagnostic" && status === "available"));
      assert.ok(detail.media.deliverables.some(({ id, status }) =>
        id === "entry-third-person-validation" && status === "available"));
      const entryValidation = await fetch(
        `${origin}/api/worlds/${created.id}/deliverables/entry-third-person-validation`,
      ).then((response) => response.json());
      assert.equal(entryValidation.status, "passed");
      const evaluationReport = await fetch(
        `${origin}/api/worlds/${created.id}/deliverables/evaluation-report`,
      ).then((response) => response.json());
      assert.equal(evaluationReport.outcome, "passed");
      assert.equal(evaluationReport.productionOutcome, "passed");
      assert.equal(evaluationReport.publicationOutcome, "published");
      assert.equal(
        evaluationReport.evaluationOutcome,
        strictDiagnosticOutcome === "failed" ? "failed" : "passed",
      );
      assert.equal(evaluationReport.whiteboxOutcome, "passed");
      assert.equal(
        evaluationReport.strictDiagnosticOutcome,
        strictDiagnosticOutcome,
      );
      const launchResponse = await fetch(`${origin}/api/worlds/${created.id}/native-launch`);
      assert.equal(launchResponse.status, 200);
      assert.deepEqual(await launchResponse.json(), detail.world.nativeLaunch);
      const canonicalBootstrapResponse = await fetch(
        `${origin}/api/worlds/${created.id}/preview-bootstrap`,
      );
      assert.equal(canonicalBootstrapResponse.status, 409);
      assert.equal(
        (await canonicalBootstrapResponse.json()).code,
        "STUDIO_PREVIEW_NATIVE_USE_BNA_LAUNCH",
      );
      await assert.rejects(
        readFile(path.join(
          fakeRepoRoot,
          "artifacts/scenes",
          created.sceneId,
          "runs",
          productionResult.runId,
          "final",
          "launch.json",
        )),
        { code: "ENOENT" },
      );
    } finally {
      await studio.shutdown();
    }
  });
}

async function mutateNativeFinalEvidence(finalRoot, mutation) {
  const captureRoot = path.join(finalRoot, "capture");
  if (mutation === "package-bytes") {
    await writeFile(
      path.join(finalRoot, "world-package", "undeclared.bin"),
      "tampered",
    );
    return;
  }
  if (mutation === "capture-directory-symlink") {
    const realCaptureRoot = path.join(finalRoot, "capture-real");
    await rename(captureRoot, realCaptureRoot);
    await symlink("capture-real", captureRoot, "dir");
    return;
  }
  if (mutation === "capture-extra-file") {
    await writeFile(path.join(captureRoot, "undeclared.bin"), "tampered");
    return;
  }
  const pngFileByMutation = {
    "opening-png": "opening.png",
    "world-side-png": "world-side.png",
    "opening-identity-mask-png": "opening-identity-mask.png",
    "world-side-identity-mask-png": "world-side-identity-mask.png",
    "world-top-down-identity-mask-png": "world-top-down-identity-mask.png",
    "collider-overlay-png": "collider-overlay.png",
  };
  const pngFile = pngFileByMutation[mutation];
  if (pngFile !== undefined) {
    await writeFile(
      path.join(captureRoot, pngFile),
      pngFile === "opening.png"
        ? VALID_EMPTY_OPENING_PNG
        : VALID_ENTRY_OPENING_PNG,
    );
    return;
  }
  const observationFileByMutation = {
    "opening-observation": "opening-observation.json",
    "semantic-view-observation-set": "semantic-view-observation-set.json",
    "spawn-observation": "spawn-support-observation.json",
    "collider-observation": "collider-overlay-observation.json",
    "traversal-observation": "scripted-traversal.json",
  };
  const observationPath = path.join(
    captureRoot,
    observationFileByMutation[mutation],
  );
  const observation = JSON.parse(await readFile(observationPath, "utf8"));
  await writeFile(observationPath, canonicalJson({
    ...observation,
    id: `${observation.id}.tampered`,
  }));
}

for (const mutation of [
  "package-bytes",
  "opening-png",
  "opening-observation",
  "semantic-view-observation-set",
  "world-side-png",
  "collider-overlay-png",
  "spawn-observation",
  "collider-observation",
  "traversal-observation",
  "capture-extra-file",
  "opening-identity-mask-png",
  "world-side-identity-mask-png",
  "world-top-down-identity-mask-png",
  "capture-directory-symlink",
]) {
  test(`rejects published Native production with tampered ${mutation}`, async () => {
    const dataRoot = await temporaryRoot(`.native-tampered-${mutation}-data-`);
    const fakeRepoRoot = await temporaryRoot(`.native-tampered-${mutation}-repo-`);
    let productionResult;
    const studio = createStudio({
      repoRoot: fakeRepoRoot,
      dataRoot,
      autoRunJobs: true,
      importExistingArtifacts: false,
      importBuiltinTestSets: false,
      importBuiltinResults: false,
      lwdpConfigured: true,
      beforeWorldSpawn: async (id) => {
        productionResult = await writeNativeProductionFixture(fakeRepoRoot, id);
        const finalRoot = path.join(
          fakeRepoRoot,
          "artifacts/scenes",
          id,
          "final",
        );
        await mutateNativeFinalEvidence(finalRoot, mutation);
      },
      worldSpawnImplementation: (_command, _arguments, options) => spawn(
        process.execPath,
        ["-e", `process.stdout.write(${JSON.stringify(`${canonicalJson(productionResult)}\n`)})`],
        options,
      ),
    });
    const origin = await listen(studio);
    try {
      const created = (await (await fetch(`${origin}/api/worlds`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: `Native tampered ${mutation}`,
          prompt: "Build a block ridge.",
        }),
      })).json()).world;
      const detail = await waitForWorldTerminal(origin, created.id);
      assert.equal(detail.world.status, "failed");
      assert.equal(detail.world.nativeLaunch, null);
    } finally {
      await studio.shutdown();
    }
  });
}

for (const mutation of [
  "package-bytes",
  "opening-png",
  "opening-observation",
  "semantic-view-observation-set",
  "world-side-png",
  "capture-directory-symlink",
]) {
  test(`revokes Native launch after ready when ${mutation} changes`, async () => {
    const dataRoot = await temporaryRoot(`.native-launch-${mutation}-data-`);
    const fakeRepoRoot = await temporaryRoot(`.native-launch-${mutation}-repo-`);
    let productionResult;
    const studio = createStudio({
      repoRoot: fakeRepoRoot,
      dataRoot,
      autoRunJobs: true,
      importExistingArtifacts: false,
      importBuiltinTestSets: false,
      importBuiltinResults: false,
      lwdpConfigured: true,
      beforeWorldSpawn: async (id) => {
        productionResult = await writeNativeProductionFixture(fakeRepoRoot, id);
      },
      worldSpawnImplementation: (_command, _arguments, options) => spawn(
        process.execPath,
        ["-e", `process.stdout.write(${JSON.stringify(`${canonicalJson(productionResult)}\n`)})`],
        options,
      ),
    });
    const origin = await listen(studio);
    try {
      const created = (await (await fetch(`${origin}/api/worlds`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: `Native launch ${mutation} tamper`,
          prompt: "Build a block ridge.",
        }),
      })).json()).world;
      const detail = await waitForWorldTerminal(origin, created.id);
      assert.equal(detail.world.status, "ready", detail.world.error);
      await mutateNativeFinalEvidence(
        path.join(
          fakeRepoRoot,
          "artifacts/scenes",
          created.sceneId,
          "final",
        ),
        mutation,
      );
      const launchResponse = await fetch(
        `${origin}/api/worlds/${created.id}/native-launch`,
      );
      assert.equal(launchResponse.status, 404);
    } finally {
      await studio.shutdown();
    }
  });
}

test("preserves the one structured Native production failure despite exit code 1", async () => {
  const dataRoot = await temporaryRoot(".native-structured-failure-data-");
  const fakeRepoRoot = await temporaryRoot(".native-structured-failure-repo-");
  let productionResult;
  const studio = createStudio({
    repoRoot: fakeRepoRoot,
    dataRoot,
    autoRunJobs: true,
    importExistingArtifacts: false,
    importBuiltinTestSets: false,
    importBuiltinResults: false,
    lwdpConfigured: true,
    beforeWorldSpawn: async (id) => {
      productionResult = {
        kind: "world-reconstruction-production-result",
        schemaVersion: 1,
        caseId: id,
        caseRef: `artifact://world-reconstruction-case/${id}/case.json`,
        runId: "run-failed",
        productionOutcome: "failed",
        publicationOutcome: "not-published",
        runOutcome: "failed",
        evaluationOutcome: "not-run",
        strictDiagnosticOutcome: "not-run",
        strictDiagnosticCodes: [],
        strictDiagnosticCleanupOutcome: "not-started",
        attemptCount: 1,
        diagnosticCodes: ["WORLD_RECONSTRUCTION_GROUND_ANALYSIS_FAILED"],
        cleanupOutcome: "completed",
      };
    },
    worldSpawnImplementation: (_command, _arguments, options) => spawn(
      process.execPath,
      [
        "-e",
        `process.stdout.write(${JSON.stringify(`${canonicalJson(productionResult)}\n`)}); process.exitCode = 1`,
      ],
      options,
    ),
  });
  const origin = await listen(studio);
  try {
    const created = (await (await fetch(`${origin}/api/worlds`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Native structured failure",
        prompt: "Build a block ridge.",
      }),
    })).json()).world;
    const detail = await waitForWorldTerminal(origin, created.id);
    assert.equal(detail.world.status, "failed");
    assert.equal(detail.world.productionOutcome, "failed");
    assert.equal(detail.world.publicationOutcome, "not-published");
    assert.equal(detail.world.evaluationOutcome, "not-run");
    assert.equal(detail.world.strictDiagnosticOutcome, "not-run");
    assert.deepEqual(detail.world.strictDiagnosticCodes, []);
    assert.match(
      detail.world.error,
      /WORLD_RECONSTRUCTION_GROUND_ANALYSIS_FAILED/,
    );
    const evaluationReport = await fetch(
      `${origin}/api/worlds/${created.id}/deliverables/evaluation-report`,
    ).then((response) => response.json());
    assert.equal(evaluationReport.productionOutcome, "failed");
    assert.equal(evaluationReport.runOutcome, "failed");
    assert.deepEqual(evaluationReport.diagnosticCodes, [
      "WORLD_RECONSTRUCTION_GROUND_ANALYSIS_FAILED",
    ]);
  } finally {
    await studio.shutdown();
  }
});

test("preserves a Native reconstruction command failure instead of reporting a missing result", async () => {
  const dataRoot = await temporaryRoot(".native-command-failure-data-");
  const fakeRepoRoot = await temporaryRoot(".native-command-failure-repo-");
  const commandFailure = {
    kind: "worldkit-command-failure",
    schemaVersion: 1,
    command: "reconstruct-run",
    ok: false,
    exitCode: 1,
    diagnostics: [{
      severity: "error",
      code: "WORLD_RECONSTRUCTION_STALE_CASE",
      instancePath: "",
      message:
        "World reconstruction failed before a production result was available.",
    }],
  };
  const studio = createStudio({
    repoRoot: fakeRepoRoot,
    dataRoot,
    autoRunJobs: true,
    importExistingArtifacts: false,
    importBuiltinTestSets: false,
    importBuiltinResults: false,
    lwdpConfigured: true,
    worldSpawnImplementation: (_command, _arguments, options) => spawn(
      process.execPath,
      [
        "-e",
        `process.stdout.write(${JSON.stringify(`${canonicalJson(commandFailure)}\n`)}); process.exitCode = 1`,
      ],
      options,
    ),
  });
  const origin = await listen(studio);
  try {
    const created = (await (await fetch(`${origin}/api/worlds`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Native command failure",
        prompt: "Build a block ridge.",
      }),
    })).json()).world;
    const detail = await waitForWorldTerminal(origin, created.id);
    assert.equal(detail.world.status, "failed");
    assert.equal(detail.world.error, "WORLD_RECONSTRUCTION_STALE_CASE");
    assert.doesNotMatch(
      detail.world.error,
      /STUDIO_NATIVE_PRODUCTION_RESULT_MISSING/,
    );
    const evaluationReport = await fetch(
      `${origin}/api/worlds/${created.id}/deliverables/evaluation-report`,
    ).then((response) => response.json());
    assert.deepEqual(evaluationReport.diagnosticCodes, [
      "WORLD_RECONSTRUCTION_STALE_CASE",
    ]);
  } finally {
    await studio.shutdown();
  }
});

async function writeNativeStyledFixture(fakeRepoRoot, id) {
  const root = path.join(fakeRepoRoot, "artifacts/scenes", id);
  const capture = JSON.parse(await readFile(path.join(root, "final/capture/triviews/whitebox-triview-manifest.json"), "utf8"));
  await writeFile(path.join(root, "visual-generation-prompts.json"), JSON.stringify({
    kind: "worldkit-visual-generation-prompts", schemaVersion: 2, sceneId: id,
    openingFrame: { referenceRoles: ["actual-whitebox-opening", "user-first-frame"], prompt: "o".repeat(200) },
    styledTriviews: capture.whiteboxTriviews.map(target => ({ visualTargetId: target.visualTargetId,
      referenceRoles: ["target-whitebox-triview", "styled-opening-frame", "user-first-frame"], prompt: "t".repeat(150) })),
  }));
  await writeFile(path.join(root, "styled-opening-frame.png"), VALID_ENTRY_OPENING_PNG);
  for (const target of capture.whiteboxTriviews) {
    const file = path.join(root, "triviews", target.visualTargetId, "styled-triview.png");
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, VALID_ENTRY_OPENING_PNG);
  }
  const { finalizeStyledOpeningFrame } = await tsImport("../../../scripts/visual/finalize-styled-opening-frame.ts", { parentURL: import.meta.url });
  const { finalizeStyledTriviews } = await tsImport("../../../scripts/visual/finalize-styled-triviews.ts", { parentURL: import.meta.url });
  await finalizeStyledOpeningFrame({ sceneId: id, sceneRoot: root, sceneSource: "babylon-native",
    userFramePath: path.join(root, "final/capture/opening.png") });
  await finalizeStyledTriviews({ sceneId: id, sceneRoot: root, sceneSource: "babylon-native" });
  return root;
}

for (const [enabled, interval, expected] of [[undefined, undefined, null], [true, undefined, 60_000], [true, 500, 60_000], [true, 1_000, 1_000]]) {
  test(`visual delivery polling lifecycle enabled=${enabled} interval=${interval}`, async () => {
    const root = await temporaryRoot(".visual-polling-");
    const calls = [];
    const handle = { unref() { calls.push("unref"); } };
    let tick;
    const studio = createStudio({ repoRoot: root, dataRoot: path.join(root, "data"), autoRunJobs: false,
      autoRecoverVisualDeliveries: enabled, visualRecoveryIntervalMs: interval,
      importExistingArtifacts: false, importBuiltinTestSets: false, importBuiltinResults: false,
      visualRecoveryTimers: {
        setInterval(callback, delay) { tick = callback; calls.push(delay); return handle; },
        clearInterval(value) { assert.equal(value, handle); calls.push("clear"); },
      },
    });
    await listen(studio);
    try {
      assert.deepEqual(calls, expected === null ? [] : [expected, "unref"]);
      tick?.();
      await studio.reconcileVisualDeliveries();
    } finally { await studio.shutdown(); }
    assert.deepEqual(calls, expected === null ? [] : [expected, "unref", "clear"]);
    tick?.();
    await studio.reconcileVisualDeliveries();
  });
}

for (const mutation of ["png", "manifest", "extra-directory"]) {
  test(`rejects Native complete-target capture ${mutation} mutation`, async () => {
    const dataRoot = await temporaryRoot(".native-target-tamper-data-");
    const fakeRepoRoot = await temporaryRoot(".native-target-tamper-repo-");
    let productionResult;
    const studio = createStudio({ repoRoot: fakeRepoRoot, dataRoot, autoRunJobs: true,
      importExistingArtifacts: false, importBuiltinTestSets: false, importBuiltinResults: false, lwdpConfigured: true,
      beforeWorldSpawn: async id => {
        productionResult = await writeNativeProductionFixture(fakeRepoRoot, id, { includeWhiteboxTriviews: true });
        const root = path.join(fakeRepoRoot, "artifacts/scenes", id, "final/capture/triviews");
        if (mutation === "png") await writeFile(path.join(root, "visual-target-1/whitebox-triview.png"), VALID_EMPTY_OPENING_PNG);
        if (mutation === "manifest") {
          const file = path.join(root, "whitebox-triview-manifest.json");
          const manifest = JSON.parse(await readFile(file, "utf8"));
          manifest.whiteboxTriviews[0].frontDirectionWorldXZ = [1, 0];
          await writeFile(file, canonicalJson(manifest));
        }
        if (mutation === "extra-directory") await mkdir(path.join(root, "unexpected"));
      },
      worldSpawnImplementation: (_command, _args, options) => spawn(process.execPath,
        ["-e", `process.stdout.write(${JSON.stringify(`${canonicalJson(productionResult)}\n`)})`], options),
    });
    const origin = await listen(studio);
    try {
      const created = (await (await fetch(`${origin}/api/worlds`, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Native complete targets", prompt: "Build the palace" }),
      })).json()).world;
      const detail = await waitForWorldTerminal(origin, created.id);
      assert.equal(detail.world.status, "failed");
      assert.equal(detail.world.nativeLaunch, null);
      assert.match(detail.world.error, /STUDIO_NATIVE_PRODUCTION_(IDENTITY|EVIDENCE)_INVALID/);
    } finally { await studio.shutdown(); }
  });
}

for (const visualMode of ["passed", "failed", "missing", "tampered"]) {
  test(`Native styled scope ${visualMode} preserves published whitebox and uses formal tri-view paths`, async () => {
    const dataRoot = await temporaryRoot(".native-styled-data-");
    const fakeRepoRoot = await temporaryRoot(".native-styled-repo-");
    let productionResult;
    const previewStarts = [];
    let previewStops = 0;
    const studio = createStudio({ repoRoot: fakeRepoRoot, dataRoot, autoRunJobs: true,
      importExistingArtifacts: false, importBuiltinTestSets: false, importBuiltinResults: false, lwdpConfigured: true,
      nativeRecordingCopyPackage: async input => ({ packageDirectoryPath: input.fixtureDirectoryPath, dispose: async () => {} }),
      nativeRecordingStartServer: async input => {
        previewStarts.push(input);
        return { url: "http://127.0.0.1:5000/?hosted=1", sceneSourceKind: "babylon-native-scene",
          worldPackageRootHash: input.recordingBinding.worldPackageRootHash,
          stop: async () => { previewStops++; }, waitForExit: () => new Promise(() => {}) };
      },
      beforeWorldSpawn: async id => {
        productionResult = await writeNativeProductionFixture(fakeRepoRoot, id, {
          strictDiagnosticOutcome: "failed", includeWhiteboxTriviews: true, withoutScriptedTraversal: true,
        });
        if (visualMode === "passed" || visualMode === "tampered") {
          const root = await writeNativeStyledFixture(fakeRepoRoot, id);
          if (visualMode === "tampered") await writeFile(path.join(root, "styled-opening-frame.png"), VALID_EMPTY_OPENING_PNG);
        }
      },
      worldSpawnImplementation: (_command, _args, options) => spawn(process.execPath, ["-e",
        `process.stdout.write(${JSON.stringify(`${canonicalJson(productionResult)}\nWORLDKIT_STAGE visual-imagegen\n`)}); process.exitCode = ${visualMode === "failed" ? 9 : 0}`,
      ], options),
    });
    const origin = await listen(studio);
    try {
      const created = (await (await fetch(`${origin}/api/worlds`, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Native visual scope", prompt: "Build the palace", image: {
          name: "reference.png", dataUrl: `data:image/png;base64,${VALID_ENTRY_OPENING_PNG.toString("base64")}`,
        } }),
      })).json()).world;
      const detail = await waitForWorldTerminal(origin, created.id);
      assert.equal(detail.world.status, visualMode === "passed" ? "ready" : "failed", detail.world.error);
      assert.equal(detail.world.whiteboxOutcome, "passed", detail.world.error);
      assert.equal(detail.world.productionOutcome, "passed");
      assert.equal(detail.world.publicationOutcome, "published");
      assert.equal(detail.world.strictDiagnosticOutcome, "failed");
      assert.ok(detail.world.nativeLaunch);
      assert.equal((await fetch(`${origin}/api/worlds/${created.id}/native-launch`)).status, 200);
      assert.equal((await fetch(`${origin}/api/recording-worlds/${created.id}/recordings`)).status, 200);
      const previews = await Promise.all([1, 2].map(() => fetch(`${origin}/api/worlds/${created.id}/recording-preview`, { method: "POST" })));
      assert.deepEqual(previews.map(response => response.status), [200, 200]);
      assert.equal(previewStarts.length, 1);
      assert.deepEqual(await previews[0].json(), { url: "http://127.0.0.1:5000/?hosted=1" });
      const headers = { "x-worldkit-native-recording-capability": previewStarts[0].recordingBinding.capability };
      assert.equal(previewStarts[0].recordingBinding.worldPackageRootHash, detail.world.nativeProductionClosure.worldPackageRootHash);
      assert.equal((await fetch(`${origin}/api/recording-worlds/${created.id}/recordings`, { headers })).status, 200);
      assert.equal((await fetch(`${origin}/api/worlds/${created.id}/retry`, { method: "POST", headers })).status, 403);
      assert.equal(detail.world.styledTriviewsRequired, true);
      assert.equal(detail.world.styledTriviewsStatus, visualMode === "passed" ? "passed" : "failed");
      assert.equal((await fetch(`${origin}/api/worlds/${created.id}/triviews/visual-target-1`)).status, 200);
      if (visualMode !== "passed") assert.equal(detail.world.failedStage, "visual-imagegen");
      const root = path.join(fakeRepoRoot, "artifacts/scenes", created.id);
      await writeFile(path.join(root, "authoring.json"), "Canonical decoy");
      await writeFile(path.join(root, "final/capture/opening.png"), VALID_EMPTY_OPENING_PNG);
      assert.equal((await fetch(`${origin}/api/recording-worlds/${created.id}/recordings`)).status, 404);
      assert.equal((await fetch(`${origin}/api/recording-worlds/${created.id}/recordings`, { headers })).status, 403);
    } finally { await studio.shutdown(); }
    assert.equal(previewStops, 1);
  });
}

for (const retryMode of ["passed", "local-passed", "interrupted", "interrupted-reused-pixels", "interrupted-undelivered", "interrupted-stale-input", "reused-pixels", "failed", "unexpected-production", "stale-capture", "stale-reference", "changed-before-spawn", "changed-during-child", "whitebox-changed-during-child", "spawn-failed"]) {
  test(`Native visual retry ${retryMode} keeps the original whitebox and only resumes visuals`, async () => {
    const dataRoot = await temporaryRoot(".native-visual-retry-data-");
    const fakeRepoRoot = await temporaryRoot(".native-visual-retry-repo-");
    const backend = retryMode === "local-passed" ? "local" : "cloud";
    let productionResult;
    const invocations = [];
    const studio = createStudio({ repoRoot: fakeRepoRoot, dataRoot, autoRunJobs: true,
      initialCodexBackend: backend, codexSpawnSync: () => ({ status: 0 }),
      importExistingArtifacts: false, importBuiltinTestSets: false, importBuiltinResults: false, lwdpConfigured: true,
      beforeWorldSpawn: async id => {
        if (invocations.length === 0) {
          productionResult = await writeNativeProductionFixture(fakeRepoRoot, id, {
            strictDiagnosticOutcome: "failed", includeWhiteboxTriviews: true, withoutScriptedTraversal: true,
            withFrozenAppearanceReference: true,
          });
          if (retryMode === "reused-pixels" || retryMode.startsWith("interrupted-")) {
            const root = await writeNativeStyledFixture(fakeRepoRoot, id);
            const manifest = JSON.parse(await readFile(path.join(root, "styled-triviews-manifest.json"), "utf8"));
            for (const file of ["styled-opening-frame.png", ...manifest.targets.map(target => target.styledTriview.path)]) {
              await utimes(path.join(root, file), new Date(0), new Date(0));
            }
          }
        } else if (retryMode === "changed-before-spawn") {
          await writeFile(path.join(fakeRepoRoot, "artifacts/scenes", id, "inputs/reference-0.png"), VALID_EMPTY_OPENING_PNG);
        } else if (retryMode === "spawn-failed") throw new Error("spawn preparation failed");
        else if (["passed", "local-passed", "interrupted", "unexpected-production"].includes(retryMode)) await writeNativeStyledFixture(fakeRepoRoot, id);
      },
      worldSpawnImplementation: (command, args, options) => {
        invocations.push({ command, args });
        const first = invocations.length === 1;
        const output = first || retryMode === "unexpected-production" ? canonicalJson(productionResult) + "\n" : "";
        const changeInput = !first && retryMode === "changed-during-child"
          ? `require("node:fs").writeFileSync(${JSON.stringify(args[args.indexOf("--user-frame") + 1])}, "changed during visual retry");`
          : !first && retryMode === "whitebox-changed-during-child"
            ? `require("node:fs").writeFileSync(${JSON.stringify(path.join(path.dirname(args[args.indexOf("--user-frame") + 1]), "../final/capture/opening.png"))}, "changed whitebox");` : "";
        return spawn(process.execPath, ["-e", `${changeInput} process.stdout.write(${JSON.stringify(output + "WORLDKIT_STAGE visual-imagegen\n")}); ${!first && retryMode.startsWith("interrupted") ? "setInterval(() => {}, 1000)" : `process.exitCode = ${first || retryMode === "failed" ? 9 : 0}`}`], options);
      },
    });
    const origin = await listen(studio);
    try {
      const created = (await (await fetch(`${origin}/api/worlds`, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Retry only visuals", prompt: "Build the palace", image: {
          name: "reference.png", dataUrl: `data:image/png;base64,${VALID_ENTRY_OPENING_PNG.toString("base64")}`,
        } }),
      })).json()).world;
      const first = await waitForWorldTerminal(origin, created.id);
      assert.equal(first.world.status, "failed");
      assert.equal(first.world.whiteboxOutcome, "passed");
      for (let index = 0; index < 300 && studio.activeJobs.length; index++) await new Promise(resolve => setTimeout(resolve, 10));
      const root = path.join(fakeRepoRoot, "artifacts/scenes", created.id);
      const capturePath = path.join(root, "final/capture/formal-world-capture-receipt.json");
      const before = await readFile(capturePath);
      // Retry must use the frozen Case bytes, not reopen the user's upload.
      await rm(path.join(dataRoot, "worlds", created.id, first.world.referenceImage.fileName));
      if (retryMode === "stale-capture") await writeFile(path.join(root, "final/capture/opening.png"), VALID_EMPTY_OPENING_PNG);
      if (retryMode === "stale-reference") await writeFile(path.join(root, "inputs/reference-0.png"), VALID_EMPTY_OPENING_PNG);
      const retry = await fetch(`${origin}/api/worlds/${created.id}/retry`, { method: "POST" });
      if (retryMode.startsWith("stale")) {
        assert.equal(retry.status, 409);
        assert.equal(invocations.length, 1);
      } else {
        assert.equal(retry.status, 202, await retry.text());
        if (retryMode.startsWith("interrupted")) {
          for (let index = 0; index < 300 && invocations.length !== 2; index++) await new Promise(resolve => setTimeout(resolve, 10));
          assert.equal(invocations.length, 2);
          assert.equal(invocations[1].args[0], "agent:world:first-frame");
          await studio.shutdown();
          for (let index = 0; index < 300 && studio.activeJobs.length; index++) await new Promise(resolve => setTimeout(resolve, 10));
          if (retryMode === "interrupted-stale-input") await writeFile(path.join(root, "inputs/reference-0.png"), VALID_EMPTY_OPENING_PNG);
          let replayCount = 0;
          const next = createStudio({ repoRoot: fakeRepoRoot, dataRoot, autoRunJobs: true,
            autoRecoverVisualDeliveries: false,
            importExistingArtifacts: false, importBuiltinTestSets: false, importBuiltinResults: false,
            nativeVisualRecoveryImplementation: async input => {
              replayCount++;
              assert.deepEqual(input, { repoRoot: fakeRepoRoot, sceneId: created.id, sceneSource: "babylon-native",
                userFramePath: path.join(root, "inputs/reference-0.png"), backend, scope: "all" });
              if (retryMode === "interrupted-undelivered") throw new Error("VISUAL_TASK_NOT_DELIVERED");
            },
            lwdpConfigured: true, worldSpawnImplementation: () => { throw new Error("restart must not spawn"); } });
          const nextOrigin = await listen(next);
          try {
            const { world } = await (await fetch(`${nextOrigin}/api/worlds/${created.id}`)).json();
            assert.equal(world.attempt, 2);
            assert.equal(world.status, ["interrupted-undelivered", "interrupted-stale-input"].includes(retryMode) ? "interrupted" : "ready", world.error);
            assert.equal(replayCount, ["interrupted-reused-pixels", "interrupted-undelivered"].includes(retryMode) ? 1 : 0);
            assert.deepEqual(world.nativeProductionClosure, first.world.nativeProductionClosure);
            assert.deepEqual(await readFile(capturePath), before);
          } finally { await next.shutdown(); }
          return;
        }
        const second = await waitForWorldTerminal(origin, created.id);
        assert.equal(second.world.attempt, 2);
        if (retryMode === "whitebox-changed-during-child") {
          assert.equal(second.world.status, "failed");
          assert.equal(second.world.captureStatus, "failed");
          assert.equal(second.world.whiteboxOutcome, "failed");
          assert.equal(second.world.nativeLaunch, null);
          assert.equal((await fetch(`${origin}/api/worlds/${created.id}/native-launch`)).status, 404);
          assert.equal(invocations.length, 2);
          assert.deepEqual(await readFile(capturePath), before);
          return;
        }
        const passed = ["passed", "local-passed", "reused-pixels"].includes(retryMode);
        const noChild = ["changed-before-spawn", "spawn-failed"].includes(retryMode);
        assert.equal(second.world.status, passed ? "ready" : "failed", second.world.error);
        assert.equal(second.world.whiteboxOutcome, "passed");
        assert.equal(second.world.captureStatus, "passed");
        assert.equal(second.world.productionOutcome, "passed");
        assert.equal(second.world.publicationOutcome, "published");
        assert.equal(second.world.strictDiagnosticOutcome, "failed");
        assert.deepEqual(second.world.nativeProductionClosure, first.world.nativeProductionClosure);
        assert.equal(invocations.length, noChild ? 1 : 2);
        if (!noChild) assert.deepEqual(invocations[1], { command: "pnpm", args: ["agent:world:first-frame", "--",
          "--scene-source", "babylon-native", "--scene-id", created.id,
          "--user-frame", path.join(root, "inputs/reference-0.png"), "--backend", backend, "--resume"] });
        assert.equal((await fetch(`${origin}/api/worlds/${created.id}/native-launch`)).status, 200);
        if (!passed) assert.equal(second.world.failedStage, "visual-imagegen");
        if (retryMode === "failed") {
          for (let index = 0; index < 300 && studio.activeJobs.length; index++) await new Promise(resolve => setTimeout(resolve, 10));
          assert.equal((await fetch(`${origin}/api/worlds/${created.id}/retry`, { method: "POST" })).status, 202);
          const third = await waitForWorldTerminal(origin, created.id);
          assert.equal(third.world.attempt, 3);
          assert.equal(third.world.status, "failed");
          assert.equal(third.world.captureStatus, "passed");
          assert.deepEqual(third.world.nativeProductionClosure, first.world.nativeProductionClosure);
          assert.equal(invocations.length, 3);
          assert.deepEqual(invocations[2], invocations[1]);
        }
      }
      assert.deepEqual(await readFile(capturePath), before);
    } finally { await studio.shutdown(); }
  });
}

for (const recoveryMode of ["complete", "old-pixels", "missing-image", "stale-run", "stale-capture", "explicit-failure", "late-exit-one", "late-host-finalization", "late-alignment", "late-poll-retry", "late-poll-shutdown", "cancelled"]) {
  test(`Native visual restart ${recoveryMode} uses retained whitebox without launching tasks`, async () => {
    const dataRoot = await temporaryRoot(".native-restart-data-");
    const fakeRepoRoot = await temporaryRoot(".native-restart-repo-");
    const config = { repoRoot: fakeRepoRoot, dataRoot, importExistingArtifacts: false, autoRecoverVisualDeliveries: false,
      importBuiltinTestSets: false, importBuiltinResults: false, lwdpConfigured: true };
    let productionResult;
    let child;
    const first = createStudio({ ...config, autoRunJobs: true,
      beforeWorldSpawn: async id => {
        productionResult = await writeNativeProductionFixture(fakeRepoRoot, id, {
          strictDiagnosticOutcome: "failed", includeWhiteboxTriviews: true, withoutScriptedTraversal: true,
          withFrozenAppearanceReference: true,
        });
        await writeNativeStyledFixture(fakeRepoRoot, id);
      },
      worldSpawnImplementation: (_command, _args, options) => {
        child = spawn(process.execPath, ["-e",
          `process.stdout.write(${JSON.stringify(`${canonicalJson(productionResult)}\nWORLDKIT_STAGE visual-imagegen\n`)}); setInterval(() => {}, 1000);`,
        ], options);
        return child;
      },
    });
    const origin = await listen(first);
    let created;
    try {
      created = (await (await fetch(`${origin}/api/worlds`, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Interrupted Native visuals", prompt: "Build the palace", image: {
          name: "reference.png", dataUrl: `data:image/png;base64,${VALID_ENTRY_OPENING_PNG.toString("base64")}`,
        } }),
      })).json()).world;
      let current;
      for (let index = 0; index < 300; index++) {
        current = JSON.parse(await readFile(path.join(dataRoot, "worlds", created.id, "record.json"), "utf8"));
        if (current.nativeProductionClosure) break;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      assert.equal(child?.exitCode, null, "the model stand-in has not exited");
      assert.equal(current.status, "running");
      assert.equal(current.whiteboxOutcome, "passed");
      assert.equal(current.nativeProductionClosure.productionOutcome, "passed");
    } finally {
      await first.shutdown();
      for (let index = 0; index < 300 && first.activeJobs.length; index++) await new Promise(resolve => setTimeout(resolve, 25));
      assert.equal(first.activeJobs.length, 0);
    }
    const root = path.join(fakeRepoRoot, "artifacts/scenes", created.id);
    const recordPath = path.join(dataRoot, "worlds", created.id, "record.json");
    const stopped = JSON.parse(await readFile(recordPath, "utf8"));
    assert.equal(stopped.failedStage, "visual-imagegen");
    assert.equal(stopped.captureStatus, "passed");
    if (recoveryMode === "old-pixels") {
      const manifest = JSON.parse(await readFile(path.join(root, "styled-triviews-manifest.json"), "utf8"));
      for (const file of ["styled-opening-frame.png", ...manifest.targets.map(target => target.styledTriview.path)])
        await utimes(path.join(root, file), new Date(0), new Date(0));
    }
    if (recoveryMode === "missing-image") await rm(path.join(root, "triviews/visual-target-1/styled-triview.png"));
    if (recoveryMode === "stale-run") {
      const file = path.join(root, "evaluation-run.json");
      const run = JSON.parse(await readFile(file, "utf8"));
      await writeFile(file, JSON.stringify({ ...run, attempt: run.attempt + 1 }));
    }
    if (recoveryMode === "stale-capture") await writeFile(path.join(root, "final/capture/opening.png"), VALID_EMPTY_OPENING_PNG);
    if (recoveryMode === "explicit-failure") await writeFile(recordPath, JSON.stringify({ ...stopped,
      status: "failed", stage: "failed", error: "visual generation failed", failedStage: "visual-imagegen" }));
    if (recoveryMode.startsWith("late-")) {
      await writeFile(recordPath, JSON.stringify({ ...stopped, status: "failed", stage: "failed",
        failedStage: "visual-imagegen", error: recoveryMode === "late-host-finalization"
          ? "STUDIO_NATIVE_VISUAL_OUTPUTS_INCOMPLETE" : "STUDIO_NATIVE_VISUAL_FAILED: child exited with code 1" }));
      if (recoveryMode === "late-host-finalization" || recoveryMode.startsWith("late-poll")) await rm(path.join(root, "styled-triviews-report.json"));
      if (recoveryMode === "late-alignment") await writeFile(path.join(dataRoot, "worlds", created.id, "agent.log"), "alignment failed\n");
    }
    if (recoveryMode === "cancelled") await writeFile(recordPath, JSON.stringify({ ...stopped, outcome: "cancelled" }));
    const receiptPath = path.join(root, "final/capture/formal-world-capture-receipt.json");
    const receiptBefore = await readFile(receiptPath);
    let dispatchCount = 0;
    let replayCount = 0;
    let allowDelivery = !recoveryMode.startsWith("late-poll");
    let entered;
    let release;
    const enteredReplay = new Promise(resolve => { entered = resolve; });
    const releaseReplay = new Promise(resolve => { release = resolve; });
    const second = createStudio({ ...config, autoRunJobs: true,
      autoRecoverVisualDeliveries: recoveryMode.startsWith("late-poll"),
      nativeVisualRecoveryImplementation: async input => {
        replayCount++;
        if (!allowDelivery) throw new Error("VISUAL_TASK_NOT_DELIVERED");
        if (recoveryMode.startsWith("late-poll")) { entered(); await releaseReplay; }
        assert.equal(input.sceneId, created.id);
        await writeNativeStyledFixture(fakeRepoRoot, created.id);
      },
      worldSpawnImplementation: () => { dispatchCount++; throw new Error("recovery must not launch a task"); } });
    const nextOrigin = await listen(second);
    try {
      if (recoveryMode.startsWith("late-poll")) {
        await second.reconcileVisualDeliveries();
        allowDelivery = true;
        const sweep = second.reconcileVisualDeliveries();
        await enteredReplay;
        assert.equal(second.reconcileVisualDeliveries(), sweep, "sweeps must not overlap");
        if (recoveryMode === "late-poll-shutdown") {
          const shutdown = second.shutdown();
          release();
          await shutdown;
          assert.equal(JSON.parse(await readFile(recordPath, "utf8")).status, "failed");
          assert.equal(dispatchCount, 0);
          assert.deepEqual(await readFile(receiptPath), receiptBefore);
          return;
        }
        const retry = fetch(`${nextOrigin}/api/worlds/${created.id}/retry`, { method: "POST" });
        release();
        await sweep;
        assert.equal((await retry).status, 409, "recovery completed before retry; do not start a second attempt");
      }
      const { world } = await (await fetch(`${nextOrigin}/api/worlds/${created.id}`)).json();
      assert.equal(world.status, ["complete", "late-exit-one", "late-host-finalization", "late-poll-retry"].includes(recoveryMode) ? "ready" :
        ["explicit-failure", "late-alignment"].includes(recoveryMode) ? "failed" : "interrupted", world.error);
      if (recoveryMode !== "late-poll-retry") assert.equal(replayCount, recoveryMode === "late-host-finalization" ? 1 : 0);
      assert.equal(world.productionOutcome, "passed");
      assert.equal(world.strictDiagnosticOutcome, "failed");
      assert.equal(dispatchCount, 0);
      assert.equal(world.attempt, 1);
      assert.deepEqual(await readFile(receiptPath), receiptBefore);
    } finally { release(); await second.shutdown(); }
  });
}

test("rejects a passed Native production result when the child exits nonzero", async () => {
  const dataRoot = await temporaryRoot(".native-passed-exit-one-data-");
  const fakeRepoRoot = await temporaryRoot(".native-passed-exit-one-repo-");
  let productionResult;
  const studio = createStudio({
    repoRoot: fakeRepoRoot,
    dataRoot,
    autoRunJobs: true,
    importExistingArtifacts: false,
    importBuiltinTestSets: false,
    importBuiltinResults: false,
    lwdpConfigured: true,
    beforeWorldSpawn: async (id) => {
      productionResult = await writeNativeProductionFixture(fakeRepoRoot, id);
    },
    worldSpawnImplementation: (_command, _arguments, options) => spawn(
      process.execPath,
      [
        "-e",
        `process.stdout.write(${JSON.stringify(`${canonicalJson(productionResult)}\n`)}); process.exitCode = 1`,
      ],
      options,
    ),
  });
  const origin = await listen(studio);
  try {
    const created = (await (await fetch(`${origin}/api/worlds`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Native passed result with failed process",
        prompt: "Build a block ridge.",
      }),
    })).json()).world;
    const detail = await waitForWorldTerminal(origin, created.id);
    assert.equal(detail.world.status, "failed");
    assert.equal(detail.world.nativeLaunch, null);
    assert.match(detail.world.error, /STUDIO_NATIVE_PRODUCTION_EXIT_NONZERO/);
  } finally {
    await studio.shutdown();
  }
});

test("rejects a Native production result whose final Package path is not identity-bound", async () => {
  const dataRoot = await temporaryRoot(".native-foreign-path-data-");
  const fakeRepoRoot = await temporaryRoot(".native-foreign-path-repo-");
  let productionResult;
  const studio = createStudio({
    repoRoot: fakeRepoRoot,
    dataRoot,
    autoRunJobs: true,
    importExistingArtifacts: false,
    importBuiltinTestSets: false,
    importBuiltinResults: false,
    lwdpConfigured: true,
    beforeWorldSpawn: async (id) => {
      productionResult = await writeNativeProductionFixture(fakeRepoRoot, id, {
        mutateResult: (value) => ({
          ...value,
          finalWorldPackagePath: path.join(
            fakeRepoRoot,
            "artifacts/scenes/foreign/final/world-package",
          ),
        }),
      });
    },
    worldSpawnImplementation: (_command, _arguments, options) => spawn(
      process.execPath,
      ["-e", `process.stdout.write(${JSON.stringify(`${canonicalJson(productionResult)}\n`)})`],
      options,
    ),
  });
  const origin = await listen(studio);
  try {
    const created = (await (await fetch(`${origin}/api/worlds`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Native foreign path", prompt: "Build a block ridge." }),
    })).json()).world;
    const detail = await waitForWorldTerminal(origin, created.id);
    assert.equal(detail.world.status, "failed");
    assert.equal(detail.world.outcome, "failed");
    assert.match(detail.world.error, /STUDIO_NATIVE_PRODUCTION_PATH_INVALID/);
    assert.equal(detail.world.nativeLaunch, null);
    assert.equal(detail.media.deliverables.find(({ id }) => id === "native-launch")?.status, "pending");
  } finally {
    await studio.shutdown();
  }
});

test("rejects extra fields in the central Native production result contract", async () => {
  const dataRoot = await temporaryRoot(".native-extra-field-data-");
  const fakeRepoRoot = await temporaryRoot(".native-extra-field-repo-");
  let productionResult;
  const studio = createStudio({
    repoRoot: fakeRepoRoot,
    dataRoot,
    autoRunJobs: true,
    importExistingArtifacts: false,
    importBuiltinTestSets: false,
    importBuiltinResults: false,
    lwdpConfigured: true,
    beforeWorldSpawn: async (id) => {
      productionResult = await writeNativeProductionFixture(fakeRepoRoot, id, {
        mutateResult: (value) => ({
          ...value,
          publicationStatus: "accepted",
        }),
      });
    },
    worldSpawnImplementation: (_command, _arguments, options) => spawn(
      process.execPath,
      ["-e", `process.stdout.write(${JSON.stringify(`${canonicalJson(productionResult)}\n`)})`],
      options,
    ),
  });
  const origin = await listen(studio);
  try {
    const created = (await (await fetch(`${origin}/api/worlds`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Native extra field",
        prompt: "Build a block ridge.",
      }),
    })).json()).world;
    const detail = await waitForWorldTerminal(origin, created.id);
    assert.equal(detail.world.status, "failed");
    assert.equal(detail.world.outcome, "failed");
    assert.match(detail.world.error, /WORLD_RECONSTRUCTION_PRODUCTION_RESULT_INVALID/);
    assert.equal(detail.world.nativeLaunch, null);
  } finally {
    await studio.shutdown();
  }
});

test("rejects a Native production result whose Package identity does not match", async () => {
  const dataRoot = await temporaryRoot(".native-foreign-identity-data-");
  const fakeRepoRoot = await temporaryRoot(".native-foreign-identity-repo-");
  let productionResult;
  const studio = createStudio({
    repoRoot: fakeRepoRoot,
    dataRoot,
    autoRunJobs: true,
    importExistingArtifacts: false,
    importBuiltinTestSets: false,
    importBuiltinResults: false,
    lwdpConfigured: true,
    beforeWorldSpawn: async (id) => {
      productionResult = await writeNativeProductionFixture(fakeRepoRoot, id, {
        mutateResult: (value) => ({
          ...value,
          finalWorldPackageRootHash: `sha256:${"4".repeat(64)}`,
        }),
      });
    },
    worldSpawnImplementation: (_command, _arguments, options) => spawn(
      process.execPath,
      ["-e", `process.stdout.write(${JSON.stringify(`${canonicalJson(productionResult)}\n`)})`],
      options,
    ),
  });
  const origin = await listen(studio);
  try {
    const created = (await (await fetch(`${origin}/api/worlds`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Native foreign identity",
        prompt: "Build a block ridge.",
      }),
    })).json()).world;
    const detail = await waitForWorldTerminal(origin, created.id);
    assert.equal(detail.world.status, "failed");
    assert.equal(detail.world.outcome, "failed");
    assert.match(detail.world.error, /WORLD_RECONSTRUCTION_PRODUCTION_RESULT_INVALID/);
    assert.equal(detail.world.nativeLaunch, null);
  } finally {
    await studio.shutdown();
  }
});

for (const strictDiagnosticMutation of ["result-hash", "launch-path", "receipt-attempt"]) {
  test(`rejects a Native production result with a stale strict diagnostic ${strictDiagnosticMutation}`, async () => {
    const dataRoot = await temporaryRoot(`.native-strict-${strictDiagnosticMutation}-data-`);
    const fakeRepoRoot = await temporaryRoot(`.native-strict-${strictDiagnosticMutation}-repo-`);
    let productionResult;
    const studio = createStudio({
      repoRoot: fakeRepoRoot,
      dataRoot,
      autoRunJobs: true,
      importExistingArtifacts: false,
      importBuiltinTestSets: false,
      importBuiltinResults: false,
      lwdpConfigured: true,
      beforeWorldSpawn: async (id) => {
        productionResult = await writeNativeProductionFixture(fakeRepoRoot, id, {
          mutateResult: (value) => strictDiagnosticMutation === "result-hash"
            ? { ...value, finalStrictDiagnosticHash: `sha256:${"4".repeat(64)}` }
            : value,
        });
        if (strictDiagnosticMutation === "launch-path") {
          const launchPath = path.join(
            fakeRepoRoot,
            "artifacts/scenes",
            id,
            "final",
            "launch.json",
          );
          const launch = JSON.parse(await readFile(launchPath, "utf8"));
          await writeFile(launchPath, canonicalJson({
            ...launch,
            strictDiagnosticRelativePath: "final/diagnostic.json",
          }));
        } else if (strictDiagnosticMutation === "receipt-attempt") {
          const finalRoot = path.join(
            fakeRepoRoot,
            "artifacts/scenes",
            id,
            "final",
          );
          const strictDiagnosticPath = path.join(finalRoot, "strict-diagnostic.json");
          const launchPath = path.join(finalRoot, "launch.json");
          const strictDiagnostic = JSON.parse(
            await readFile(strictDiagnosticPath, "utf8"),
          );
          const staleStrictDiagnostic = { ...strictDiagnostic, attemptIndex: 1 };
          const staleStrictDiagnosticHash = canonicalHash(staleStrictDiagnostic);
          const launch = JSON.parse(await readFile(launchPath, "utf8"));
          await Promise.all([
            writeFile(strictDiagnosticPath, canonicalJson(staleStrictDiagnostic)),
            writeFile(launchPath, canonicalJson({
              ...launch,
              strictDiagnosticHash: staleStrictDiagnosticHash,
            })),
          ]);
          productionResult = {
            ...productionResult,
            finalStrictDiagnosticHash: staleStrictDiagnosticHash,
          };
        }
      },
      worldSpawnImplementation: (_command, _arguments, options) => spawn(
        process.execPath,
        ["-e", `process.stdout.write(${JSON.stringify(`${canonicalJson(productionResult)}\n`)})`],
        options,
      ),
    });
    const origin = await listen(studio);
    try {
      const created = (await (await fetch(`${origin}/api/worlds`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: `Native strict ${strictDiagnosticMutation}`,
          prompt: "Build a block ridge.",
        }),
      })).json()).world;
      const detail = await waitForWorldTerminal(origin, created.id);
      assert.equal(detail.world.status, "failed");
      assert.equal(detail.world.outcome, "failed");
      assert.match(detail.world.error, /STUDIO_NATIVE_PRODUCTION_IDENTITY_INVALID/);
      assert.equal(detail.world.nativeLaunch, null);
    } finally {
      await studio.shutdown();
    }
  });
}

for (const entryValidationMutation of ["result-hash", "launch-path", "receipt-status"]) {
  test(`rejects a Native production result with a stale entry validation ${entryValidationMutation}`, async () => {
    const dataRoot = await temporaryRoot(`.native-entry-${entryValidationMutation}-data-`);
    const fakeRepoRoot = await temporaryRoot(`.native-entry-${entryValidationMutation}-repo-`);
    let productionResult;
    const studio = createStudio({
      repoRoot: fakeRepoRoot,
      dataRoot,
      autoRunJobs: true,
      importExistingArtifacts: false,
      importBuiltinTestSets: false,
      importBuiltinResults: false,
      lwdpConfigured: true,
      beforeWorldSpawn: async (id) => {
        productionResult = await writeNativeProductionFixture(fakeRepoRoot, id, {
          mutateResult: (value) => entryValidationMutation === "result-hash"
            ? { ...value, finalEntryValidationHash: `sha256:${"8".repeat(64)}` }
            : value,
        });
        const finalRoot = path.join(
          fakeRepoRoot,
          "artifacts/scenes",
          id,
          "final",
        );
        const launchPath = path.join(finalRoot, "launch.json");
        const launch = JSON.parse(await readFile(launchPath, "utf8"));
        if (entryValidationMutation === "launch-path") {
          await writeFile(launchPath, canonicalJson({
            ...launch,
            entryValidationRelativePath: "final/entry-validation.json",
          }));
        } else if (entryValidationMutation === "receipt-status") {
          const entryValidationPath = path.join(
            finalRoot,
            "entry-third-person-validation.json",
          );
          const entryValidation = JSON.parse(
            await readFile(entryValidationPath, "utf8"),
          );
          const staleEntryValidation = {
            ...entryValidation,
            status: "failed",
            diagnostics: [{
              code: "ENTRY_SUBJECT_NOT_CENTERED",
              message: "stale fixture",
            }],
          };
          const staleEntryValidationHash = canonicalHash(staleEntryValidation);
          await Promise.all([
            writeFile(entryValidationPath, canonicalJson(staleEntryValidation)),
            writeFile(launchPath, canonicalJson({
              ...launch,
              entryValidationHash: staleEntryValidationHash,
            })),
          ]);
          productionResult = {
            ...productionResult,
            finalEntryValidationHash: staleEntryValidationHash,
          };
        }
      },
      worldSpawnImplementation: (_command, _arguments, options) => spawn(
        process.execPath,
        ["-e", `process.stdout.write(${JSON.stringify(`${canonicalJson(productionResult)}\n`)})`],
        options,
      ),
    });
    const origin = await listen(studio);
    try {
      const created = (await (await fetch(`${origin}/api/worlds`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: `Native entry ${entryValidationMutation}`,
          prompt: "Build a block ridge.",
        }),
      })).json()).world;
      const detail = await waitForWorldTerminal(origin, created.id);
      assert.equal(detail.world.status, "failed");
      assert.equal(detail.world.outcome, "failed");
      assert.match(detail.world.error, /STUDIO_NATIVE_PRODUCTION_IDENTITY_INVALID/);
      assert.equal(detail.world.nativeLaunch, null);
    } finally {
      await studio.shutdown();
    }
  });
}

test("passes the frozen backend to world jobs and records local Codex markers without provider details", async () => {
  const source = await readFile(path.join(repoRoot, "apps/studio/src/server.mjs"), "utf8");
  assert.match(source, /WORLDKIT_CODEX_BACKEND: codexBackend/);
  assert.match(source, /WORLDKIT_LOCAL_CODEX_JOB \(\[a-z-\]\+\) \(\[a-zA-Z0-9\._:-\]\+\)/);
  assert.match(source, /kind: "local-job", taskId: localCodexJob\[2\]/);
  assert.doesNotMatch(source, /kind: "local-job"[^\n]+(?:credential|token|CODEX_HOME)/i);
});

test("records formal Cloud dispatch markers with router metadata without copying provider details", async () => {
  const dataRoot = await temporaryRoot(".cloud-marker-data-");
  const fakeRepoRoot = await temporaryRoot(".cloud-marker-repo-");
  const marker = "WORLDKIT_LWDP_JOB visual-reconstruction styled-world gen_visual123 dispatch=single-task-fast-path profile=formal model=gpt-5.6-sol reasoning=xhigh\n";
  const studio = createStudio({
    repoRoot: fakeRepoRoot, dataRoot, autoRunJobs: true,
    importExistingArtifacts: false, importBuiltinTestSets: false,
    importBuiltinResults: false, lwdpConfigured: true,
    worldSpawnImplementation: (_command, _arguments, options) => spawn(
      process.execPath, ["-e", `process.stdout.write(${JSON.stringify(marker)}); process.exitCode = 1;`], options,
    ),
  });
  const origin = await listen(studio);
  try {
    const created = (await (await fetch(`${origin}/api/worlds`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Cloud visual marker", prompt: "Build a block world." }),
    })).json()).world;
    const detail = await waitForWorldTerminal(origin, created.id);
    const event = detail.media.trajectory.events.find(({ kind }) => kind === "cloud-job");
    assert.ok(event, "actual router marker must be recorded");
    assert.equal(event.stage, "visual-reconstruction");
    assert.equal(event.jobId, "gen_visual123");
    assert.equal(event.taskId, "styled-world");
    assert.doesNotMatch(JSON.stringify(event), /gpt-5.6|xhigh|dispatch=|profile=/);
  } finally {
    await studio.shutdown();
  }
});

test("does not precreate the Native Case root before the atomic Host runner starts", async () => {
  const dataRoot = await temporaryRoot(".native-atomic-root-data-");
  const fakeRepoRoot = await temporaryRoot(".native-atomic-root-repo-");
  const rootWasAbsentAtSpawn = [];
  const studio = createStudio({
    repoRoot: fakeRepoRoot,
    dataRoot,
    autoRunJobs: true,
    importExistingArtifacts: false,
    importBuiltinTestSets: false,
    importBuiltinResults: false,
    lwdpConfigured: true,
    beforeWorldSpawn: async (id) => {
      rootWasAbsentAtSpawn.push(await lstat(path.join(
        fakeRepoRoot,
        "artifacts/scenes",
        id,
      )).then(() => false, (error) => {
        assert.equal(error?.code, "ENOENT");
        return true;
      }));
    },
    worldSpawnImplementation: (_command, _arguments, options) => spawn(
      process.execPath,
      ["-e", "process.exit(1)"],
      options,
    ),
  });
  const origin = await listen(studio);
  try {
    const created = (await (await fetch(`${origin}/api/worlds`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Atomic Native root",
        prompt: "Build a Native block world.",
      }),
    })).json()).world;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const current = await fetch(`${origin}/api/worlds/${created.id}`)
        .then((response) => response.json());
      if (current.world.status === "failed") break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.deepEqual(rootWasAbsentAtSpawn, [true]);
    assert.ok(await readFile(path.join(
      fakeRepoRoot,
      "artifacts/scenes",
      created.id,
      "evaluation-run.json",
    ), "utf8"));
    const retry = await fetch(`${origin}/api/worlds/${created.id}/retry`, {
      method: "POST",
    });
    assert.equal(retry.status, 202);
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const current = await fetch(`${origin}/api/worlds/${created.id}`)
        .then((response) => response.json());
      if (current.world.status === "failed" && rootWasAbsentAtSpawn.length === 2) {
        assert.equal(current.world.sceneSourceKind, "babylon-native");
        assert.equal(current.world.styledOpeningFrameRequired, false);
        assert.equal(current.world.styledTriviewsRequired, false);
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.deepEqual(rootWasAbsentAtSpawn, [true, true]);
  } finally {
    await studio.shutdown();
  }
});

test("keeps concurrent atomic writes isolated and serializes same-record mutations", async () => {
  const root = await temporaryRoot(".atomic-write-");
  const outputPath = path.join(root, "record.json");
  await Promise.all(Array.from({ length: 64 }, (_, index) =>
    writeJsonAtomic(outputPath, { index, payload: "x".repeat(256) })));
  const persisted = JSON.parse(await readFile(outputPath, "utf8"));
  assert.ok(Number.isInteger(persisted.index));
  assert.equal(persisted.payload.length, 256);
  assert.deepEqual(
    (await readdir(root)).filter((name) => name.endsWith(".tmp")),
    [],
  );

  const runSerially = createKeyedSerialExecutor();
  let activeForRecord = 0;
  let maximumActiveForRecord = 0;
  const completionOrder = [];
  await Promise.all(Array.from({ length: 32 }, (_, index) =>
    runSerially("same-record", async () => {
      activeForRecord += 1;
      maximumActiveForRecord = Math.max(maximumActiveForRecord, activeForRecord);
      await new Promise((resolve) => setImmediate(resolve));
      completionOrder.push(index);
      activeForRecord -= 1;
    })));
  assert.equal(maximumActiveForRecord, 1);
  assert.deepEqual(completionOrder, Array.from({ length: 32 }, (_, index) => index));

  let activeAcrossRecords = 0;
  let maximumActiveAcrossRecords = 0;
  await Promise.all(["record-a", "record-b"].map((key) =>
    runSerially(key, async () => {
      activeAcrossRecords += 1;
      maximumActiveAcrossRecords = Math.max(maximumActiveAcrossRecords, activeAcrossRecords);
      await new Promise((resolve) => setImmediate(resolve));
      activeAcrossRecords -= 1;
    })));
  assert.equal(maximumActiveAcrossRecords, 2);
});

test("assembles the new agent pipeline without executing prompt text", () => {
  const result = spawnSync(
    "bash",
    [path.join(repoRoot, "scripts/agents/run-canonical-world-agent.sh"), "--scene-source", "canonical", "--", "--scene-id", "prompt-smoke", "$(touch should-not-run)"],
    { cwd: repoRoot, env: { ...process.env, WORLDKIT_PROMPT_SMOKE: "1" }, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /WORLDKIT_PROMPT_SMOKE_OK planner coding-agent terrain-compilation canonical-build runtime-capture visual-prompt-synthesis visual-imagegen/);
});

test("build-only accepts an empty reference-image list before validating frozen Planner outputs", async () => {
  const sceneId = `build-only-empty-reference-${process.pid}`;
  const artifactRoot = path.join(repoRoot, "artifacts/scenes", sceneId);
  const publicPlanRoot = path.join(repoRoot, "apps/playground/public/scene-plans", sceneId);
  try {
    const result = spawnSync(
      "bash",
      [
        path.join(repoRoot, "scripts/agents/run-canonical-world-agent.sh"),
        "--scene-source",
        "canonical",
        "--build-only",
        "--",
        "--scene-id",
        sceneId,
      ],
      { cwd: repoRoot, env: process.env, encoding: "utf8" },
    );
    const output = `${result.stdout}\n${result.stderr}`;
    assert.equal(result.status, 2, output);
    assert.match(
      output,
      /ENOENT:.*planner-execution\.json/,
    );
    assert.doesNotMatch(output, /unbound variable/);
  } finally {
    await Promise.all([
      rm(artifactRoot, { recursive: true, force: true }),
      rm(publicPlanRoot, { recursive: true, force: true }),
    ]);
  }
});

test("routes Planner, Builder and post-whitebox visuals through the selected Codex backend", async () => {
  const [scripts, codexRouter] = await Promise.all([Promise.all([
    "scripts/agents/run-canonical-world-agent.sh",
    "scripts/visual/run-styled-opening-frame-agent.sh",
    "scripts/visual/run-styled-triviews-agent.sh",
    "scripts/visual/run-visual-reconstruction-agent.sh",
  ].map((relativePath) => readFile(path.join(repoRoot, relativePath), "utf8"))),
  readFile(path.join(repoRoot, "scripts/agents/run-codex-task.mjs"), "utf8")]);
  for (const source of scripts) {
    assert.doesNotMatch(source, /command -v codex|CODEX_HOME=|codex exec/);
  }
  assert.match(scripts[0], /codex_backend="\$\{WORLDKIT_CODEX_BACKEND:-cloud\}"/);
  assert.match(scripts[0], /run-codex-task\.mjs --backend "\$codex_backend"[^\n]*--execution-profile formal/);
  assert.match(codexRouter, /backend === "cloud"/);
  assert.match(codexRouter, /run-lwdp-codex-task\.mjs/);
  assert.match(codexRouter, /run-local-codex-task\.mjs/);
  assert.match(scripts[1], /run-styled-visual-agent\.ts/);
  assert.match(scripts[2], /run-styled-visual-agent\.ts/);
  assert.doesNotMatch(scripts[1], /run-lwdp-(?:codex-task|t2i-job)\.mjs/);
  assert.doesNotMatch(scripts[2], /run-lwdp-(?:codex-task|t2i-job)\.mjs/);
  assert.match(scripts[3], /run-codex-task\.mjs --backend "\$codex_backend"/);
  assert.equal((scripts[3].match(/--execution-profile formal/g) ?? []).length, 2);
});

test("keeps lightweight Planner prose and Builder implementation authority separate", async () => {
  const [launcher, plannerSkill, plannerTemplate, builderSkill, resourceCatalog, controlledSubjects, terrainStructures] = await Promise.all([
    readFile(path.join(repoRoot, "scripts/agents/run-canonical-world-agent.sh"), "utf8"),
    readFile(path.join(repoRoot, ".codex/skills/worldkit-spatial-planner/SKILL.md"), "utf8"),
    readFile(path.join(repoRoot, ".codex/skills/worldkit-spatial-planner/references/scene-brief-template.md"), "utf8"),
    readFile(path.join(repoRoot, ".codex/skills/worldkit-canonical-builder/SKILL.md"), "utf8"),
    readFile(path.join(repoRoot, ".codex/skills/worldkit-canonical-builder/references/resource-catalog.md"), "utf8"),
    readFile(path.join(repoRoot, ".codex/skills/worldkit-canonical-builder/references/controlled-subjects.md"), "utf8"),
    readFile(path.join(repoRoot, ".codex/skills/worldkit-canonical-builder/references/terrain-and-structures.md"), "utf8"),
  ]);
  assert.match(launcher, /scripts\/agents\/planner-execution\.ts replay \\/);
  assert.match(launcher, /scripts\/agents\/planner-execution\.ts replay-accepted \\/);
  assert.doesNotMatch(launcher, /worldkit brief validate/);
  assert.match(launcher, /worldkit-spatial-planner\/scripts\/self-check\.mjs/);
  assert.match(launcher, /worldkit-canonical-builder\/scripts\/self-check\.mjs/);
  assert.match(launcher, /non-authoritative composition intent/);
  assert.match(launcher, /\.codex\/skills\/worldkit-spatial-planner\/SKILL\.md/);
  assert.match(plannerSkill, /optional hosted preview-planning stage/);
  assert.match(plannerSkill, /does not replace the formal World Planner's WorldSpec/);
  assert.match(plannerSkill, /Name exactly one movement mode/);
  assert.match(plannerSkill, /not a closed list/);
  assert.match(plannerSkill, /custom movement label/);
  assert.match(plannerSkill, /Write 1-5 entries total/);
  assert.match(plannerSkill, /no landmark merely to fill the list/);
  assert.match(plannerSkill, /several complete instances intentionally share the same appearance/);
  assert.match(plannerTemplate, /## 运动模式/);
  assert.match(plannerTemplate, /重复标志物/);
  assert.doesNotMatch(launcher, /Use packages\/authoring\/src\/spatial-world-plan-v1\.ts as the contract/);
  assert.match(launcher, /Canonical AuthoringSpec V4/);
  assert.match(launcher, /worldkit verify route/);
  assert.match(launcher, /Implement the complete world rather than only the opening view/);
  assert.match(launcher, /Define 1-5 visual targets as whole targets/);
  assert.match(launcher, /absence of a same-named preset is never a reason to omit the world/);
  assert.match(launcher, /documented current ground closure as an explicitly disclosed playable approximation/);
  assert.match(launcher, /never add or modify SDK motion bases/);
  assert.match(launcher, /maxVertices, maxTriangles, and maxColliders are all blocking compiler budgets/);
  assert.doesNotMatch(launcher, /humanoid\.board\.surface-slide|humanoid\.wingsuit\.unpowered-glide/);
  assert.doesNotMatch(launcher, /triangle-count overruns do not block/);
  assert.match(launcher, /implementation-map\.draft\.json/);
  assert.match(launcher, /authoring\.builder\.json/);
  assert.match(launcher, /terrain-height-intent\.png/);
  assert.match(launcher, /finalize-scene-terrain\.ts/);
  assert.match(launcher, /finalize-spatial-build\.ts/);
  assert.match(launcher, /--triview-output/);
  assert.doesNotMatch(launcher, /WORLDKIT_PLANNER_REPAIR_LIMIT/);
  assert.doesNotMatch(launcher, /WORLDKIT_BUILDER_REPAIR_LIMIT/);
  assert.doesNotMatch(launcher, /WORLDKIT_PLANNER_REPAIR/);
  assert.doesNotMatch(launcher, /WORLDKIT_BUILDER_REPAIR/);
  assert.match(launcher, /planner-self-check\.json/);
  assert.match(launcher, /builder-self-check\.json/);
  assert.match(launcher, /\.codex\/skills\/worldkit-canonical-builder\/SKILL\.md/);
  assert.doesNotMatch(launcher, /Read packages\/authoring\/src\/authoring-spec-v3\.schema\.json/);
  assert.match(builderSkill, /sole authoring guide/);
  assert.match(resourceCatalog, /humanoid\.g-bot@2/);
  assert.match(resourceCatalog, /red static capsule proxy|red column/);
  assert.match(builderSkill, /complete described world/);
  assert.match(builderSkill, /strict centered rear view/);
  assert.match(builderSkill, /connected exploration/);
  assert.match(controlledSubjects, /one controlled Subject/);
  assert.match(controlledSubjects, /Appearance-only items never become Prototypes/);
  assert.match(terrainStructures, /minimum few major masses/);
  assert.doesNotMatch(launcher, /plan:freeze/);
});

test("routes one visual task with opening-first inspection and a frozen tri-view anchor", async () => {
  const result = spawnSync(
    "bash",
    [path.join(repoRoot, "scripts/visual/run-styled-opening-frame-agent.sh"), "--", "--scene-id", "prompt-smoke"],
    { cwd: repoRoot, env: { ...process.env, WORLDKIT_PROMPT_SMOKE: "1" }, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /WORLDKIT_FIRST_FRAME_SMOKE_OK single-codex-task opening-first inspected-anchor formal/);
  const triViewSmoke = spawnSync(
    "bash",
    [path.join(repoRoot, "scripts/visual/run-styled-triviews-agent.sh"), "--", "--scene-id", "prompt-smoke"],
    { cwd: repoRoot, env: { ...process.env, WORLDKIT_PROMPT_SMOKE: "1" }, encoding: "utf8" },
  );
  assert.equal(triViewSmoke.status, 0, triViewSmoke.stderr || triViewSmoke.stdout);
  assert.match(triViewSmoke.stdout, /WORLDKIT_STYLED_TRIVIEWS_SMOKE_OK single-codex-task opening-first inspected-anchor formal/);
  const [worldRunner, firstFrameRunner, styledTriviewRunner, visualPipeline, server] = await Promise.all([
    readFile(path.join(repoRoot, "scripts/agents/run-canonical-world-agent.sh"), "utf8"),
    readFile(path.join(repoRoot, "scripts/visual/run-styled-opening-frame-agent.sh"), "utf8"),
    readFile(path.join(repoRoot, "scripts/visual/run-styled-triviews-agent.sh"), "utf8"),
    readFile(path.join(repoRoot, "scripts/visual/run-styled-visual-agent.ts"), "utf8"),
    readFile(path.join(repoRoot, "apps/studio/src/server.mjs"), "utf8"),
  ]);
  assert.match(worldRunner, /run-styled-opening-frame-agent\.sh/);
  assert.match(firstFrameRunner, /--scope all/);
  assert.doesNotMatch(firstFrameRunner, /run-styled-triviews-agent\.sh/);
  assert.match(styledTriviewRunner, /--scope triviews/);
  assert.match(visualPipeline, /Generate and visually inspect the opening first/);
  assert.match(visualPipeline, /Never generate the opening and tri-views concurrently/);
  assert.match(visualPipeline, /Keep it and the prompt bundle byte-for-byte unchanged/);
  assert.match(visualPipeline, /left=Front \/ center=Right \/ right=Back/);
  assert.match(visualPipeline, /run-codex-task\.mjs/);
  assert.match(visualPipeline, /"--execution-profile", "formal"/);
  assert.equal((visualPipeline.match(/await dispatch\(/g) ?? []).length, 1);
  assert.match(visualPipeline, /visual-generation-prompts\.json/);
  assert.doesNotMatch(visualPipeline, /gemini|ThreadPoolExecutor/);
  assert.doesNotMatch(visualPipeline, /leap_flow/);
  assert.doesNotMatch(styledTriviewRunner, /whitebox-video|contact-sheet|video-prompt/);
  assert.doesNotMatch(firstFrameRunner, /validate-visual-alignment-report|WORLDKIT_STAGE visual-alignment/);
  assert.doesNotMatch(server, /whiteboxVideoMatch|enqueueVisual|runVisualJob/);
});

test("renders current Babylon capture state without a legacy composition path", async () => {
  const [app, server] = await Promise.all([
    readFile(path.join(repoRoot, "apps/studio/public/app.js"), "utf8"),
    readFile(path.join(repoRoot, "apps/studio/src/server.mjs"), "utf8"),
  ]);
  assert.match(app, /Babylon Runtime/);
  assert.match(app, /strictDiagnosticOutcome/);
  assert.match(app, /严格诊断单独展示，不改变普通生产结果/);
  assert.doesNotMatch(app, /hasLegacyGuide|capture-start|verify-entry/);
  assert.doesNotMatch(app, /preview-ready|not-accepted|publicationStatus|accepted/);
  assert.doesNotMatch(
    server,
    /whiteboxOutcome:\s*closure\.(?:evaluationOutcome|strictDiagnosticOutcome)/,
  );
});

test("normalizes input and validates image payloads", () => {
  const prompt = normalizePrompt("  一片围绕蓝色湖泊的多层山地  ");
  assert.equal(prompt, "一片围绕蓝色湖泊的多层山地");
  assert.equal(normalizeTestSetName("  复杂空间测试集  "), "复杂空间测试集");
  assert.match(createSceneId("Layered World", new Set()), /^layered-world-[a-f0-9]{4}$/);
  assert.throws(() => normalizePrompt(" "), /至少/);

  const png = Buffer.from("89504e470d0a1a0a00000000", "hex");
  const decoded = decodeImagePayload({ name: "reference.png", dataUrl: `data:image/png;base64,${png.toString("base64")}` });
  assert.equal(decoded.extension, "png");
  assert.match(decoded.contentSha256, /^[a-f0-9]{64}$/);
  assert.throws(() => decodeImagePayload({ dataUrl: `data:image/png;base64,${Buffer.from("bad").toString("base64")}` }), /不匹配/);
});

test("allows only declared planning assets", () => {
  assert.equal(isAllowedSceneAsset("world-plan.png"), true);
  assert.equal(isAllowedSceneAsset("entry-whitebox-target.png"), true);
  assert.equal(isAllowedSceneAsset("terrain-height-intent.png"), true);
  assert.equal(isAllowedSceneAsset("reference-0.webp"), true);
  assert.equal(isAllowedSceneAsset("prototypes/tower/whitebox-triview.png"), true);
  assert.equal(isAllowedSceneAsset("../../package.json"), false);
});

test("proxies Playground subject assets through the Studio origin", async () => {
  const requestedUrls = [];
  const upstream = createServer((request, response) => {
    requestedUrls.push(request.url);
    response.writeHead(200, { "content-type": "model/gltf-binary" });
    response.end(Buffer.from("glb-through-playground"));
  });
  await new Promise((resolve, reject) => {
    upstream.once("error", reject);
    upstream.listen(0, "127.0.0.1", resolve);
  });
  const upstreamAddress = upstream.address();
  assert.ok(upstreamAddress && typeof upstreamAddress === "object");
  const playgroundInternalOrigin = `http://127.0.0.1:${upstreamAddress.port}`;
  const dataRoot = await temporaryRoot(".test-data-");
  const studio = createStudio({
    repoRoot,
    dataRoot,
    autoRunJobs: false,
    importExistingArtifacts: false,
    playgroundOrigin: playgroundInternalOrigin,
    playgroundInternalOrigin,
  });
  const origin = await listen(studio);
  try {
    for (const assetPath of [
      "/subject-assets/humanoid/g-bot/v2/g-bot.glb?worldkit-content-hash=test",
      "/subject-assets/humanoid/golden/v2/golden-humanoid.glb",
    ]) {
      const response = await fetch(`${origin}${assetPath}`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("content-type"), "model/gltf-binary");
      assert.equal(await response.text(), "glb-through-playground");
    }
    assert.deepEqual(requestedUrls, [
      "/subject-assets/humanoid/g-bot/v2/g-bot.glb?worldkit-content-hash=test",
      "/subject-assets/humanoid/golden/v2/golden-humanoid.glb",
    ]);
  } finally {
    await studio.shutdown();
    await new Promise((resolve, reject) => upstream.close((error) => error ? reject(error) : resolve()));
  }
});

test("binds Studio Preview identity in Host-served HTML instead of the Browser query", async () => {
  const requestedUrls = [];
  const upstream = createServer((request, response) => {
    requestedUrls.push(request.url);
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end("<!doctype html><html><head></head><body>Viewer</body></html>");
  });
  await new Promise((resolve, reject) => {
    upstream.once("error", reject);
    upstream.listen(0, "127.0.0.1", resolve);
  });
  const upstreamAddress = upstream.address();
  assert.ok(upstreamAddress && typeof upstreamAddress === "object");
  const playgroundInternalOrigin = `http://127.0.0.1:${upstreamAddress.port}`;
  const dataRoot = await temporaryRoot(".test-data-");
  const studio = createStudio({
    repoRoot,
    dataRoot,
    autoRunJobs: false,
    importExistingArtifacts: false,
    playgroundOrigin: playgroundInternalOrigin,
    playgroundInternalOrigin,
  });
  const origin = await listen(studio);
  try {
    const created = (await (await fetch(`${origin}/api/worlds`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Bound Preview",
        prompt: "Create one bound preview world.",
      }),
    })).json()).world;
    const response = await fetch(
      `${origin}/play/${created.id}?world=another-existing-world`,
    );
    assert.equal(response.status, 200);
    assert.match(
      await response.text(),
      new RegExp(`<meta name="worldkit-studio-world-id" content="${created.id}">`),
    );
    assert.deepEqual(requestedUrls, ["/?world=another-existing-world"]);
    assert.equal((await fetch(`${origin}/play/not-found`)).status, 404);
  } finally {
    await Promise.all([
      studio.shutdown(),
      new Promise((resolve) => upstream.close(resolve)),
    ]);
  }
});

test("protects public Studio instances with Basic access", () => {
  const valid = `Basic ${Buffer.from("worldkit:secret").toString("base64")}`;
  assert.equal(isAuthorizedHeader(undefined, ""), true);
  assert.equal(isAuthorizedHeader(undefined, "secret"), false);
  assert.equal(isAuthorizedHeader(valid, "secret"), true);
});

test("proves private readiness only to the parent that holds the child nonce", async () => {
  const dataRoot = await temporaryRoot(".readiness-nonce-");
  const readinessNonce = "0123456789abcdef0123456789abcdef";
  const studio = createStudio({
    repoRoot,
    dataRoot,
    autoRunJobs: false,
    importExistingArtifacts: false,
    readinessNonce,
  });
  const origin = await listen(studio);
  try {
    const missing = await fetch(`${origin}/__worldkit/studio-ready`);
    assert.equal(missing.status, 404);

    const wrong = await fetch(`${origin}/__worldkit/studio-ready`, {
      headers: { "x-worldkit-readiness-nonce": "fedcba9876543210fedcba9876543210" },
    });
    assert.equal(wrong.status, 404);

    const ready = await fetch(`${origin}/__worldkit/studio-ready`, {
      headers: { "x-worldkit-readiness-nonce": readinessNonce },
    });
    assert.equal(ready.status, 200);
    assert.deepEqual(await ready.json(), {
      status: "ready",
      nonce: readinessNonce,
      pid: process.pid,
    });
  } finally {
    await studio.shutdown();
  }
});

test("publishes bounded concurrent cloud-case capacity without starting queued work", async () => {
  const dataRoot = await temporaryRoot(".test-data-");
  const studio = createStudio({
    repoRoot,
    dataRoot,
    autoRunJobs: false,
    importExistingArtifacts: false,
    maxConcurrentJobs: 6,
    lwdpConfigured: true,
  });
  const origin = await listen(studio);
  try {
    const health = await (await fetch(`${origin}/api/health`)).json();
    assert.equal(health.activeJob, null);
    assert.deepEqual(health.activeJobs, []);
    assert.equal(health.maxConcurrentJobs, 6);
    assert.deepEqual(health.maxConcurrentJobsByBackend, { cloud: 6, local: 1 });
    assert.equal(health.lwdpConfigured, true);
    assert.equal(health.codexBackend, "cloud");
    assert.equal(health.codexAvailable, true);
    assert.equal(health.codexBackends.cloud.available, true);
    assert.equal(typeof health.codexBackends.local.available, "boolean");
    assert.equal(typeof health.geminiConfigured, "boolean");
    assert.equal(health.geminiPromptModel, "gemini-3-flash-preview");
    assert.equal(health.geminiImageModel, "gemini-3.1-flash-image");
    assert.deepEqual(health.codexExecutionProfile, {
      name: "formal",
      model: "gpt-5.6-sol",
      reasoningEffort: "xhigh",
    });
    assert.equal(health.queued, 0);
  } finally {
    await studio.shutdown();
  }
});

test("defaults to cloud and atomically persists an available one-click Codex backend switch", async () => {
  const dataRoot = await temporaryRoot(".codex-backend-persistence-");
  const codexSpawnSync = (_command, args) => ({
    status: args[0] === "--version" || (args[0] === "login" && args[1] === "status") ? 0 : 1,
  });
  let studio = createStudio({
    repoRoot,
    dataRoot,
    autoRunJobs: false,
    importExistingArtifacts: false,
    importBuiltinTestSets: false,
    importBuiltinResults: false,
    lwdpConfigured: true,
    codexSpawnSync,
  });
  let origin = await listen(studio);
  try {
    const initialHealth = await fetch(`${origin}/api/health`).then((response) => response.json());
    assert.equal(initialHealth.codexBackend, "cloud");
    assert.deepEqual(initialHealth.codexBackends, {
      cloud: { available: true },
      local: { available: true },
    });

    const switched = await fetch(`${origin}/api/settings/codex-backend`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ backend: "local" }),
    });
    assert.equal(switched.status, 200);
    assert.equal((await switched.json()).codexBackend, "local");
    const persisted = JSON.parse(await readFile(path.join(dataRoot, "runtime-settings.json"), "utf8"));
    assert.deepEqual(
      { kind: persisted.kind, schemaVersion: persisted.schemaVersion, codexBackend: persisted.codexBackend },
      { kind: "worldkit-studio-runtime-settings", schemaVersion: 1, codexBackend: "local" },
    );
    assert.deepEqual(
      (await readdir(dataRoot)).filter((name) => name.endsWith(".tmp")),
      [],
    );
  } finally {
    await studio.shutdown();
  }

  studio = createStudio({
    repoRoot,
    dataRoot,
    autoRunJobs: false,
    importExistingArtifacts: false,
    importBuiltinTestSets: false,
    importBuiltinResults: false,
    initialCodexBackend: "cloud",
    lwdpConfigured: true,
    codexSpawnSync,
  });
  origin = await listen(studio);
  try {
    const health = await fetch(`${origin}/api/health`).then((response) => response.json());
    assert.equal(health.codexBackend, "local");
    assert.equal(health.codexAvailable, true);
  } finally {
    await studio.shutdown();
  }
});

test("rejects an unavailable backend without changing the selected or persisted backend", async () => {
  const dataRoot = await temporaryRoot(".codex-backend-unavailable-");
  const studio = createStudio({
    repoRoot,
    dataRoot,
    autoRunJobs: false,
    importExistingArtifacts: false,
    importBuiltinTestSets: false,
    importBuiltinResults: false,
    lwdpConfigured: true,
    codexSpawnSync: (_command, args) => ({ status: args[0] === "--version" ? 0 : 1 }),
  });
  const origin = await listen(studio);
  try {
    const response = await fetch(`${origin}/api/settings/codex-backend`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ backend: "local" }),
    });
    assert.equal(response.status, 409);
    const payload = await response.json();
    assert.equal(payload.codexBackend, "cloud");
    assert.equal(payload.codexBackends.local.available, false);
    const health = await fetch(`${origin}/api/health`).then((result) => result.json());
    assert.equal(health.codexBackend, "cloud");
    assert.equal(health.codexAvailable, true);
    const persisted = JSON.parse(await readFile(path.join(dataRoot, "runtime-settings.json"), "utf8"));
    assert.equal(persisted.codexBackend, "cloud");
  } finally {
    await studio.shutdown();
  }
});

test("freezes each backend and gives cloud and local independent execution slots", async () => {
  const dataRoot = await temporaryRoot(".codex-backend-binding-");
  const pendingById = new Map();
  const started = [];
  const studio = createStudio({
    repoRoot,
    dataRoot,
    autoRunJobs: true,
    importExistingArtifacts: false,
    importBuiltinTestSets: false,
    importBuiltinResults: false,
    maxConcurrentJobs: 1,
    lwdpConfigured: true,
    codexSpawnSync: () => ({ status: 0 }),
    jobRunner: (id) => new Promise((resolve) => {
      started.push(id);
      pendingById.set(id, resolve);
    }),
  });
  const origin = await listen(studio);
  try {
    const firstResponse = await fetch(`${origin}/api/worlds`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Cloud-bound", prompt: "Create the first backend-bound world." }),
    });
    const first = (await firstResponse.json()).world;
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(started, [first.id]);
    assert.equal(first.codexBackend, "cloud");

    const switchResponse = await fetch(`${origin}/api/settings/codex-backend`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ backend: "local" }),
    });
    assert.equal(switchResponse.status, 200);
    const firstAfterSwitch = await fetch(`${origin}/api/worlds/${first.id}`).then((response) => response.json());
    assert.equal(firstAfterSwitch.world.codexBackend, "cloud");

    const secondResponse = await fetch(`${origin}/api/worlds`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Local-bound", prompt: "Create the second backend-bound world." }),
    });
    const second = (await secondResponse.json()).world;
    assert.equal(second.codexBackend, "local");
    assert.equal((await fetch(`${origin}/api/worlds/${first.id}`).then((response) => response.json())).world.codexBackend, "cloud");
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(started, [first.id, second.id]);
    assert.equal(studio.activeJobs.length, 2);

    const thirdResponse = await fetch(`${origin}/api/worlds`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Local queued", prompt: "Create the queued local world." }),
    });
    const third = (await thirdResponse.json()).world;
    assert.equal(third.codexBackend, "local");
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(started, [first.id, second.id]);
    const health = await fetch(`${origin}/api/health`).then((response) => response.json());
    assert.deepEqual(health.maxConcurrentJobsByBackend, { cloud: 1, local: 1 });
    assert.deepEqual(health.queuedByBackend, { cloud: 0, local: 1 });

    pendingById.get(first.id)();
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(started, [first.id, second.id]);
    pendingById.get(second.id)();
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(started, [first.id, second.id, third.id]);
    pendingById.get(third.id)();
    await new Promise((resolve) => setImmediate(resolve));
  } finally {
    for (const resolve of pendingById.values()) resolve();
    await studio.shutdown();
  }
});

test("stops both queued and running worlds without counting user cancellation as failure", async () => {
  const dataRoot = await temporaryRoot(".world-stop-");
  const pendingById = new Map();
  const studio = createStudio({
    repoRoot,
    dataRoot,
    autoRunJobs: true,
    importExistingArtifacts: false,
    importBuiltinTestSets: false,
    importBuiltinResults: false,
    maxConcurrentJobs: 1,
    jobRunner: (id) => new Promise((resolve) => pendingById.set(id, resolve)),
  });
  const origin = await listen(studio);
  try {
    const create = async (title) => (await (await fetch(`${origin}/api/worlds`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title, prompt: `Build ${title}` }),
    })).json()).world;
    const running = await create("Running stop case");
    const queued = await create("Queued stop case");
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(studio.activeJobs.length, 1);

    const queuedStop = await fetch(`${origin}/api/worlds/${queued.id}/stop`, { method: "POST" });
    assert.equal(queuedStop.status, 200);
    assert.equal((await queuedStop.json()).world.status, "interrupted");
    assert.equal((await fetch(`${origin}/api/health`).then((response) => response.json())).queued, 0);

    const runningStop = await fetch(`${origin}/api/worlds/${running.id}/stop`, { method: "POST" });
    assert.equal(runningStop.status, 200);
    const stopped = (await runningStop.json()).world;
    assert.equal(stopped.status, "interrupted");
    assert.equal(stopped.outcome, "cancelled");
    assert.match(stopped.error, /用户已停止/);
    pendingById.get(running.id)?.();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(studio.activeJobs.length, 0);

    const reliability = deriveReliabilityMetrics([
      { status: "interrupted", outcome: "cancelled", error: "用户已停止任务" },
    ]);
    assert.equal(reliability.terminalCount, 0);
    assert.equal(reliability.failureCount, 0);
  } finally {
    for (const resolve of pendingById.values()) resolve();
    await studio.shutdown();
  }
});

test("stops an active world before child registration without spawning the pipeline", async () => {
  const dataRoot = await temporaryRoot(".world-stop-before-spawn-");
  let markSpawnBoundaryReached;
  let releaseSpawnBoundary;
  const spawnBoundaryReached = new Promise((resolve) => { markSpawnBoundaryReached = resolve; });
  const spawnBoundaryRelease = new Promise((resolve) => { releaseSpawnBoundary = resolve; });
  let spawnCalls = 0;
  const studio = createStudio({
    repoRoot,
    dataRoot,
    autoRunJobs: true,
    importExistingArtifacts: false,
    importBuiltinTestSets: false,
    importBuiltinResults: false,
    lwdpConfigured: true,
    beforeWorldSpawn: async () => {
      markSpawnBoundaryReached();
      await spawnBoundaryRelease;
    },
    worldSpawnImplementation: () => {
      spawnCalls += 1;
      throw new Error("world pipeline must not spawn after cancellation");
    },
  });
  const origin = await listen(studio);
  let created;
  try {
    created = (await (await fetch(`${origin}/api/worlds`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Stop before spawn", prompt: "Build a cancellable world." }),
    })).json()).world;
    await spawnBoundaryReached;
    assert.deepEqual(studio.activeJobs, [created.id]);
    assert.equal(spawnCalls, 0);

    const response = await fetch(`${origin}/api/worlds/${created.id}/stop`, { method: "POST" });
    const responseBody = await response.text();
    assert.equal(response.status, 200, responseBody);
    const stopped = JSON.parse(responseBody).world;
    assert.equal(stopped.status, "interrupted");
    assert.equal(stopped.outcome, "cancelled");

    releaseSpawnBoundary();
    for (let attempt = 0; attempt < 20 && studio.activeJobs.length > 0; attempt += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    assert.equal(spawnCalls, 0);
    assert.deepEqual(studio.activeJobs, []);
    const persisted = await fetch(`${origin}/api/worlds/${created.id}`).then((result) => result.json());
    assert.equal(persisted.world.status, "interrupted");
    assert.equal(persisted.world.outcome, "cancelled");
  } finally {
    releaseSpawnBoundary?.();
    await studio.shutdown();
    if (created?.sceneId) {
      await rm(path.join(repoRoot, "artifacts/scenes", created.sceneId), {
        recursive: true,
        force: true,
      });
    }
  }
});

test("snapshots one selected Codex backend across every world in a test-set batch", async () => {
  const dataRoot = await temporaryRoot(".codex-backend-batch-");
  const studio = createStudio({
    repoRoot,
    dataRoot,
    autoRunJobs: false,
    importExistingArtifacts: false,
    importBuiltinTestSets: false,
    importBuiltinResults: false,
    lwdpConfigured: true,
    codexSpawnSync: () => ({ status: 0 }),
  });
  const origin = await listen(studio);
  try {
    assert.equal((await fetch(`${origin}/api/settings/codex-backend`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ backend: "local" }),
    })).status, 200);
    const testSet = (await (await fetch(`${origin}/api/test-sets`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Backend batch", prompt: "Build each complete reference world." }),
    })).json()).testSet;
    for (const suffix of [1, 2]) {
      const bytes = Buffer.from(`89504e470d0a1a0a0000000${suffix}`, "hex");
      const upload = await fetch(`${origin}/api/test-sets/${testSet.id}/images`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          image: {
            name: `case-${suffix}.png`,
            dataUrl: `data:image/png;base64,${bytes.toString("base64")}`,
          },
        }),
      });
      assert.equal(upload.status, 201);
    }
    const run = await fetch(`${origin}/api/test-sets/${testSet.id}/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(run.status, 202);
    const worlds = (await run.json()).worlds;
    assert.equal(worlds.length, 2);
    assert.ok(worlds.every(({ codexBackend }) => codexBackend === "local"));
    assert.equal(new Set(worlds.map(({ batchId }) => batchId)).size, 1);
  } finally {
    await studio.shutdown();
  }
});

test("dispatches queued cloud cases up to the configured concurrency without sharing slots", async () => {
  const dataRoot = await temporaryRoot(".test-data-");
  const pendingById = new Map();
  const started = [];
  let maximumActive = 0;
  let studio;
  const jobRunner = (id) => new Promise((resolve) => {
    started.push(id);
    pendingById.set(id, resolve);
    maximumActive = Math.max(maximumActive, studio.activeJobs.length);
  });
  studio = createStudio({
    repoRoot,
    dataRoot,
    autoRunJobs: true,
    importExistingArtifacts: false,
    maxConcurrentJobs: 2,
    jobRunner,
  });
  const origin = await listen(studio);
  try {
    for (const title of ["Cloud A", "Cloud B", "Cloud C"]) {
      const response = await fetch(`${origin}/api/worlds`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, prompt: `Build ${title}` }),
      });
      assert.equal(response.status, 202);
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(started.length, 2);
    assert.equal(studio.activeJobs.length, 2);
    assert.equal(maximumActive, 2);

    pendingById.get(started[0])();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(started.length, 3);
    assert.equal(studio.activeJobs.length, 2);
    assert.equal(new Set(started).size, 3);

    for (const resolve of pendingById.values()) resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(studio.activeJobs.length, 0);
  } finally {
    for (const resolve of pendingById.values()) resolve();
    await studio.shutdown();
  }
});

test("adapts the main Registry subject catalog for the Studio UI", async () => {
  const dataRoot = await temporaryRoot(".test-data-");
  const studio = createStudio({ repoRoot, dataRoot, autoRunJobs: false });
  const origin = await listen(studio);
  try {
    const response = await fetch(`${origin}/api/subject-catalog`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.ok(payload.presets.length >= 5);
    assert.ok(payload.presets.every(({ ref }) => ref.startsWith("worldkit://subject-definition/")));
    assert.ok(payload.productionRefs.includes("worldkit://subject-definition/animal.quadruped.forward-steer@1"));
  } finally {
    await studio.shutdown();
  }
});

test("projects the routed visual stage into Studio without changing its execution identity", () => {
  for (const stage of ["visual-reconstruction", "failed", "interrupted"]) {
    const stages = deriveWorkflowTrajectory({ record: {
      stage, failedStage: "visual-reconstruction", styledTriviewsRequired: true,
      styledOpeningFrameRequired: true,
    } });
    assert.equal(stages.find(({ id }) => id === "visual-imagegen")?.status,
      stage === "visual-reconstruction" ? "active" : "failed");
    assert.equal(stages.some(({ id }) => id === "visual-reconstruction"), false);
  }
  assert.deepEqual(parseStageTokenUsage("WORLDKIT_STAGE_USAGE visual-reconstruction 123\n"),
    { "visual-imagegen": 123 });
  const record = { stage: "visual-reconstruction", status: "running", styledTriviewsRequired: true };
  const metrics = deriveWorkflowMetrics({ record, stages: deriveWorkflowTrajectory({ record }),
    rawLog: "WORLDKIT_STAGE_USAGE visual-reconstruction 123\n" });
  assert.equal(metrics.byStage["visual-imagegen"].tokenCount, 123);
  assert.equal(metrics.byStage["visual-imagegen"].tokenStatus, "recorded");
});

test("derives the single current Scene Brief workflow", () => {
  const stages = deriveWorkflowTrajectory({
    record: {
      stage: "terrain-compilation", status: "running", captureStatus: "pending",
      styledOpeningFrameRequired: true, styledTriviewsRequired: true,
    },
    availableIds: [
      "scene-brief", "planner-self-check", "visual-identity-palette", "world-plan",
      "entry-whitebox-target", "terrain-height-intent-prompt", "terrain-height-intent",
      "builder-authoring-spec", "implementation-map-draft", "builder-self-check",
    ],
  });
  assert.equal(stages.find(({ id }) => id === "planner")?.status, "complete");
  assert.equal(stages.find(({ id }) => id === "coding-agent")?.status, "complete");
  assert.equal(stages.find(({ id }) => id === "terrain-compilation")?.status, "active");
  assert.equal(stages.find(({ id }) => id === "canonical-build")?.status, "pending");
  assert.equal(stages.find(({ id }) => id === "runtime-capture")?.status, "pending");
  assert.equal(stages.find(({ id }) => id === "entry-alignment-validation")?.status, "pending");
  assert.equal(stages.some(({ id }) => ["spatial-planner", "image-planner", "styled-triviews"].includes(id)), false);
});

test("separates whitebox capture from Snapshot V4 entry-alignment validation", () => {
  const availableIds = [
    "scene-brief", "planner-self-check", "visual-identity-palette", "world-plan", "entry-whitebox-target",
    "authoring-spec", "implementation-map-draft", "builder-self-check", "implementation-map", "execution-plan",
    "opening-frame", "runtime-snapshot", "whitebox-triview-manifest",
  ];
  const failedStages = deriveWorkflowTrajectory({
    record: {
      stage: "failed",
      failedStage: "entry-alignment-validation",
      status: "failed",
      captureStatus: "passed",
      workflowPolicyVersion,
      styledOpeningFrameRequired: true,
      styledTriviewsRequired: true,
    },
    availableIds,
  });
  assert.equal(failedStages.find(({ id }) => id === "runtime-capture")?.status, "complete");
  assert.equal(failedStages.find(({ id }) => id === "entry-alignment-validation")?.status, "failed");

  const passedStages = deriveWorkflowTrajectory({
    record: {
      stage: "visual-prompt-synthesis",
      status: "running",
      captureStatus: "passed",
      workflowPolicyVersion,
      styledOpeningFrameRequired: true,
      styledTriviewsRequired: true,
    },
    availableIds: [...availableIds, "entry-third-person-validation"],
  });
  assert.equal(passedStages.find(({ id }) => id === "entry-alignment-validation")?.status, "complete");
  assert.equal(passedStages.find(({ id }) => id === "visual-prompt-synthesis")?.status, "active");
});

test("records tokens per new agent stage and elapsed time", () => {
  const rawLog = [
    "WORLDKIT_STAGE planner",
    "WORLDKIT_STAGE_USAGE planner 2000",
    "WORLDKIT_STAGE coding-agent",
    "WORLDKIT_STAGE_USAGE coding-agent 2100",
  ].join("\n");
  assert.deepEqual(parseStageTokenUsage(rawLog), {
    planner: 2_000,
    "coding-agent": 2_100,
  });
  const record = {
    stage: "ready", status: "ready", outcome: "passed",
    workflowPolicyVersion,
    styledOpeningFrameRequired: false,
    createdAt: "2026-08-21T00:00:00.000Z",
    startedAt: "2026-08-21T00:00:00.000Z",
    finishedAt: "2026-08-21T00:03:00.000Z",
  };
  const stages = deriveWorkflowTrajectory({
    record,
    availableIds: [
      "scene-brief", "visual-identity-palette", "world-plan", "entry-whitebox-target", "authoring-spec",
      "implementation-map-draft", "implementation-map", "execution-plan",
      "opening-frame", "runtime-snapshot", "whitebox-triview-manifest",
    ],
  });
  const metrics = deriveWorkflowMetrics({ record, stages, rawLog, events: [] });
  assert.equal(metrics.summary.tokenCount, 4_100);
  assert.equal(metrics.summary.durationMs, 180_000);
});

test("never counts a failed runtime capture as evaluation success", () => {
  const metrics = deriveReliabilityMetrics([
    { workflowPolicyVersion, status: "ready", outcome: "passed", attempt: 1 },
    { workflowPolicyVersion, status: "failed", outcome: "failed", failedStage: "runtime-capture", captureStatus: "failed" },
    { workflowPolicyVersion, status: "ready", outcome: null, captureStatus: "failed", captureRequired: false },
  ], { minimumSampleSize: 1 });
  assert.equal(metrics.successCount, 1);
  assert.equal(metrics.failureCount, 1);
  assert.equal(metrics.terminalCount, 2);
  assert.equal(metrics.failureRate, 0.5);
});

test("persists image test sets, rejects duplicate bytes, and queues selected cases", async () => {
  const dataRoot = await temporaryRoot(".test-data-");
  const fakeRepoRoot = await temporaryRoot(".test-repo-");
  const studio = createStudio({ repoRoot: fakeRepoRoot, dataRoot, autoRunJobs: false });
  const origin = await listen(studio);
  try {
    const createResponse = await fetch(`${origin}/api/test-sets`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "复杂山地", prompt: "依据每张图建立多层可行进白膜世界。" }),
    });
    assert.equal(createResponse.status, 201);
    const testSet = (await createResponse.json()).testSet;
    const png = Buffer.from("89504e470d0a1a0a0000000001", "hex");
    const dataUrl = `data:image/png;base64,${png.toString("base64")}`;
    const upload = await fetch(`${origin}/api/test-sets/${testSet.id}/images`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ image: { name: "mountain.png", dataUrl } }),
    });
    assert.equal(upload.status, 201);
    const duplicate = await fetch(`${origin}/api/test-sets/${testSet.id}/images`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ image: { name: "duplicate.png", dataUrl } }),
    });
    assert.equal(duplicate.status, 400);
    const listed = (await (await fetch(`${origin}/api/test-sets`)).json()).testSets[0];
    assert.equal(listed.validation.runnableCount, 1);
    const run = await fetch(`${origin}/api/test-sets/${testSet.id}/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ imageIds: [listed.images[0].id] }),
    });
    assert.equal(run.status, 202);
    const payload = await run.json();
    assert.equal(payload.worlds.length, 1);
    assert.equal(payload.worlds[0].workflowPolicyVersion, workflowPolicyVersion);
    assert.equal(payload.worlds[0].captureStatus, "pending");
    assert.equal(payload.worlds[0].sceneSourceKind, "babylon-native");
    assert.equal(payload.worlds[0].styledOpeningFrameRequired, true);
    assert.equal(payload.worlds[0].styledOpeningFrameStatus, "pending");
    assert.equal(payload.worlds[0].styledTriviewsRequired, true);
    assert.equal(payload.worlds[0].styledTriviewsStatus, "pending");
  } finally {
    await studio.shutdown();
  }
});

test("imports versioned built-in test sets with humanoid walking labels", async () => {
  const fakeRepoRoot = await temporaryRoot(".builtin-repo-");
  const dataRoot = await temporaryRoot(".builtin-data-");
  const builtinRoot = path.join(
    fakeRepoRoot,
    "apps/studio/builtin-test-sets/sample-v1",
  );
  const imageBytes = Buffer.from("builtin-test-image");
  const contentSha256 = createHash("sha256").update(imageBytes).digest("hex");
  await mkdir(path.join(builtinRoot, "images"), { recursive: true });
  await writeFile(path.join(builtinRoot, "images", "walker.png"), imageBytes);
  await writeFile(path.join(builtinRoot, "manifest.json"), JSON.stringify({
    kind: "worldkit-builtin-test-set",
    schemaVersion: 1,
    id: "test-set-sample-v1",
    name: "Sample Built-in",
    prompt: "Build the reference.",
    createdAt: "2026-08-21T00:00:00.000Z",
    updatedAt: "2026-08-21T00:00:00.000Z",
    review: { matchingCount: 1 },
    images: [{
      id: "image-001-abcd",
      sourceFile: "images/walker.png",
      extension: "png",
      mimeType: "image/png",
      contentSha256,
      originalName: "walker.png",
      size: imageBytes.length,
      labels: { humanoidWalking: true, primaryLocomotion: "walking" },
      tags: ["humanoid-walking"],
    }],
  }));
  const studio = createStudio({
    repoRoot: fakeRepoRoot,
    dataRoot,
    autoRunJobs: false,
    importExistingArtifacts: false,
    importBuiltinTestSets: true,
  });
  const origin = await listen(studio);
  try {
    const payload = await fetch(`${origin}/api/test-sets`).then((response) => response.json());
    assert.equal(payload.testSets.length, 1);
    assert.equal(payload.testSets[0].builtin, true);
    assert.equal(payload.testSets[0].validation.humanoidWalkingCount, 1);
    assert.equal(payload.testSets[0].images[0].labels.humanoidWalking, true);
    assert.deepEqual(payload.testSets[0].images[0].tags, ["humanoid-walking"]);
  } finally {
    await studio.shutdown();
  }
});

test("does not expose manual whitebox video upload in the automatic Studio workflow", async () => {
  const dataRoot = await temporaryRoot(".test-data-");
  const fakeRepoRoot = await temporaryRoot(".test-repo-");
  const studio = createStudio({ repoRoot: fakeRepoRoot, dataRoot, autoRunJobs: false });
  const origin = await listen(studio);
  try {
    const png = Buffer.from("89504e470d0a1a0a00000000", "hex");
    const createResponse = await fetch(`${origin}/api/worlds`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Manual Capture",
        prompt: "Create a world for a manually recorded whitebox take.",
        image: { name: "first-frame.png", dataUrl: `data:image/png;base64,${png.toString("base64")}` },
      }),
    });
    const created = (await createResponse.json()).world;
    const upload = await fetch(`${origin}/api/worlds/${created.id}/whitebox-video`, {
      method: "POST",
      headers: { "content-type": "application/octet-stream" },
      body: Buffer.from("manual video is outside the automatic flow"),
    });
    assert.equal(upload.status, 405);
  } finally {
    await studio.shutdown();
  }
});

test("does not recover an explicitly failed visual run from leftover output files", async () => {
  const dataRoot = await temporaryRoot(".test-data-");
  const fakeRepoRoot = await temporaryRoot(".test-repo-");
  const firstStudio = createStudio({ repoRoot: fakeRepoRoot, dataRoot, autoRunJobs: false });
  const firstOrigin = await listen(firstStudio);
  const png = Buffer.from("89504e470d0a1a0a00000000", "hex");
  const created = (await (await fetch(`${firstOrigin}/api/worlds`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      title: "Recover Styled Frame",
      prompt: "Create a playable third-person world.",
      sceneSourceKind: "canonical",
      image: { name: "reference.png", dataUrl: `data:image/png;base64,${png.toString("base64")}` },
    }),
  })).json()).world;
  await firstStudio.shutdown();

  const artifactRoot = path.join(fakeRepoRoot, "artifacts/scenes", created.sceneId);
  await mkdir(path.join(artifactRoot, "triviews", "player-subject"), { recursive: true });
  await Promise.all([
    ...[
      "scene-brief.md", "visual-identity-palette.json", "authoring.json", "scene-implementation-map.json", "world.build.json",
      "runtime-snapshot.json", "evaluation-run.json", "planner-self-check.json", "builder-self-check.json",
    ].map((fileName) => writeFile(path.join(artifactRoot, fileName), "{}")),
    writeFile(path.join(artifactRoot, "triviews/whitebox-triview-manifest.json"), JSON.stringify({
      whiteboxTriviews: [{ visualTargetId: "player-subject" }],
    })),
    writeFile(path.join(artifactRoot, "opening-frame.png"), png),
    writeFile(path.join(artifactRoot, "visual-generation-prompts.json"), "{}"),
    writeFile(path.join(artifactRoot, "styled-opening-frame.png"), png),
    writeFile(path.join(artifactRoot, "triviews/player-subject/styled-triview.png"), png),
    writeFile(path.join(artifactRoot, "styled-triviews-manifest.json"), "{}"),
    writeFile(path.join(artifactRoot, "styled-triviews-report.json"), "{}"),
  ]);
  const recordPath = path.join(dataRoot, "worlds", created.id, "record.json");
  const record = JSON.parse(await readFile(recordPath, "utf8"));
  await writeFile(recordPath, JSON.stringify({
    ...record,
    status: "failed",
    stage: "failed",
    failedStage: "visual-imagegen",
    captureStatus: "passed",
    outcome: "failed",
    error: "Legacy image alignment failed.",
  }));

  const recoveredStudio = createStudio({ repoRoot: fakeRepoRoot, dataRoot, autoRunJobs: false });
  const recoveredOrigin = await listen(recoveredStudio);
  try {
    const detail = await (await fetch(`${recoveredOrigin}/api/worlds/${created.id}`)).json();
    assert.equal(detail.world.status, "failed");
    assert.equal(detail.world.outcome, "failed");
    assert.equal(detail.world.error, "Legacy image alignment failed.");
    assert.equal(detail.world.previewUrl, `/play/${created.id}`);
    await assert.rejects(
      readFile(path.join(artifactRoot, "evaluation-report.json"), "utf8"),
      { code: "ENOENT" },
    );
  } finally {
    await recoveredStudio.shutdown();
  }
});

test("does not recover stale placeholder outputs left before the current visual attempt", async () => {
  const dataRoot = await temporaryRoot(".test-data-");
  const fakeRepoRoot = await temporaryRoot(".test-repo-");
  const firstStudio = createStudio({ repoRoot: fakeRepoRoot, dataRoot, autoRunJobs: false });
  const firstOrigin = await listen(firstStudio);
  const png = Buffer.from("89504e470d0a1a0a00000000", "hex");
  const created = (await (await fetch(`${firstOrigin}/api/worlds`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      title: "Stale Visual Outputs",
      prompt: "Create a playable third-person world.",
      image: { name: "reference.png", dataUrl: `data:image/png;base64,${png.toString("base64")}` },
    }),
  })).json()).world;
  await firstStudio.shutdown();

  const artifactRoot = path.join(fakeRepoRoot, "artifacts/scenes", created.sceneId);
  await mkdir(path.join(artifactRoot, "triviews", "player-subject"), { recursive: true });
  await Promise.all([
    ...[
      "scene-brief.md", "visual-identity-palette.json", "authoring.json", "scene-implementation-map.json", "world.build.json",
      "runtime-snapshot.json", "evaluation-run.json", "planner-self-check.json", "builder-self-check.json",
    ].map((fileName) => writeFile(path.join(artifactRoot, fileName), "{}")),
    writeFile(path.join(artifactRoot, "triviews/whitebox-triview-manifest.json"), JSON.stringify({
      whiteboxTriviews: [{ visualTargetId: "player-subject" }],
    })),
    writeFile(path.join(artifactRoot, "opening-frame.png"), png),
    writeFile(path.join(artifactRoot, "visual-generation-prompts.json"), "{}"),
    writeFile(path.join(artifactRoot, "styled-opening-frame.png"), png),
    writeFile(path.join(artifactRoot, "triviews/player-subject/styled-triview.png"), png),
    writeFile(path.join(artifactRoot, "styled-triviews-manifest.json"), "{}"),
    writeFile(path.join(artifactRoot, "styled-triviews-report.json"), "{}"),
  ]);
  const recordPath = path.join(dataRoot, "worlds", created.id, "record.json");
  const record = JSON.parse(await readFile(recordPath, "utf8"));
  await writeFile(recordPath, JSON.stringify({
    ...record,
    status: "running",
    stage: "visual-imagegen",
    failedStage: null,
    attempt: 1,
    startedAt: new Date(Date.now() + 60_000).toISOString(),
    captureStatus: "passed",
    outcome: null,
    error: null,
  }));

  const recoveredStudio = createStudio({ repoRoot: fakeRepoRoot, dataRoot, autoRunJobs: false });
  const recoveredOrigin = await listen(recoveredStudio);
  try {
    const detail = await (await fetch(`${recoveredOrigin}/api/worlds/${created.id}`)).json();
    assert.equal(detail.world.status, "interrupted");
    assert.notEqual(detail.world.outcome, "passed");
  } finally {
    await recoveredStudio.shutdown();
  }
});

test("does not import a three-file artifact fragment as a passed world", async () => {
  const dataRoot = await temporaryRoot(".test-data-");
  const fakeRepoRoot = await temporaryRoot(".test-repo-");
  const sceneId = "partial-import-world";
  const artifactRoot = path.join(fakeRepoRoot, "artifacts/scenes", sceneId);
  await mkdir(path.join(artifactRoot, "triviews"), { recursive: true });
  await Promise.all([
    writeFile(path.join(artifactRoot, "scene-brief.md"), "# WorldKit Scene Brief\n"),
    writeFile(path.join(artifactRoot, "authoring.json"), JSON.stringify({
      kind: "worldkit-authoring-spec",
      schemaVersion: 4,
      id: sceneId,
    })),
    writeFile(path.join(artifactRoot, "triviews/whitebox-triview-manifest.json"), JSON.stringify({
      kind: "worldkit-whitebox-triview-manifest",
      schemaVersion: 1,
      worldBuildIdentityHash: `sha256:${"a".repeat(64)}`,
      whiteboxTriviews: [],
    })),
  ]);

  const studio = createStudio({ repoRoot: fakeRepoRoot, dataRoot, autoRunJobs: false });
  const origin = await listen(studio);
  try {
    const payload = await (await fetch(`${origin}/api/worlds`)).json();
    assert.deepEqual(payload.worlds, []);
  } finally {
    await studio.shutdown();
  }
});

test("imports a complete current whitebox chain with passed trusted receipts", async () => {
  const dataRoot = await temporaryRoot(".test-data-");
  const fakeRepoRoot = await temporaryRoot(".test-repo-");
  const sceneId = "trusted-import-world";
  await writeTrustedWhiteboxArtifacts(fakeRepoRoot, sceneId);

  const studio = createStudio({ repoRoot: fakeRepoRoot, dataRoot, autoRunJobs: false });
  const origin = await listen(studio);
  try {
    const payload = await (await fetch(`${origin}/api/worlds`)).json();
    assert.equal(payload.worlds.length, 1);
    assert.equal(payload.worlds[0].sceneId, sceneId);
    assert.equal(payload.worlds[0].status, "ready");
    assert.equal(payload.worlds[0].outcome, "passed");
  } finally {
    await studio.shutdown();
  }
});

test("imports a trusted whitebox chain compiled with terrain compiler v2", async () => {
  const dataRoot = await temporaryRoot(".test-data-");
  const fakeRepoRoot = await temporaryRoot(".test-repo-");
  const sceneId = "trusted-compiler-v2-world";
  await writeTrustedWhiteboxArtifacts(fakeRepoRoot, sceneId, {
    compilerVersion: "terrain-height-intent-compiler@2",
  });

  const studio = createStudio({ repoRoot: fakeRepoRoot, dataRoot, autoRunJobs: false });
  const origin = await listen(studio);
  try {
    const payload = await (await fetch(`${origin}/api/worlds`)).json();
    assert.equal(payload.worlds.length, 1);
    assert.equal(payload.worlds[0].sceneId, sceneId);
    assert.equal(payload.worlds[0].status, "ready");
    assert.equal(payload.worlds[0].outcome, "passed");
  } finally {
    await studio.shutdown();
  }
});

test("requires an exact same-world passed Route report when Builder declares Required Routes", async () => {
  for (const [routeReportMode, shouldImport] of [
    ["missing", false],
    ["mismatched", false],
    ["failed", false],
    ["exact", true],
  ]) {
    const dataRoot = await temporaryRoot(`.test-data-route-${routeReportMode}-`);
    const fakeRepoRoot = await temporaryRoot(`.test-repo-route-${routeReportMode}-`);
    const sceneId = `route-${routeReportMode}-world`;
    await writeTrustedWhiteboxArtifacts(fakeRepoRoot, sceneId, {
      requiresRouteValidation: true,
      routeReportMode,
    });

    const studio = createStudio({ repoRoot: fakeRepoRoot, dataRoot, autoRunJobs: false });
    const origin = await listen(studio);
    try {
      const payload = await (await fetch(`${origin}/api/worlds`)).json();
      assert.equal(payload.worlds.some((world) => world.sceneId === sceneId), shouldImport);
    } finally {
      await studio.shutdown();
    }
  }
});

test("recovers fresh visual outputs only when current trusted receipts are passed", async () => {
  const dataRoot = await temporaryRoot(".test-data-");
  const fakeRepoRoot = await temporaryRoot(".test-repo-");
  const firstStudio = createStudio({ repoRoot: fakeRepoRoot, dataRoot, autoRunJobs: false });
  const firstOrigin = await listen(firstStudio);
  const png = Buffer.from("89504e470d0a1a0a00000000", "hex");
  const created = (await (await fetch(`${firstOrigin}/api/worlds`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      title: "Recover Fresh Visuals",
      sceneSourceKind: "canonical",
      prompt: "Create a playable third-person world.",
      image: { name: "reference.png", dataUrl: `data:image/png;base64,${png.toString("base64")}` },
    }),
  })).json()).world;
  await firstStudio.shutdown();

  const recordPath = path.join(dataRoot, "worlds", created.id, "record.json");
  const record = JSON.parse(await readFile(recordPath, "utf8"));
  const startedAt = new Date().toISOString();
  const currentRecord = {
    ...record,
    status: "running",
    stage: "visual-imagegen",
    failedStage: null,
    attempt: 1,
    startedAt,
    captureStatus: "passed",
    outcome: null,
    error: null,
  };
  await writeFile(recordPath, JSON.stringify(currentRecord));
  const { artifactRoot, captureTargets } = await writeTrustedWhiteboxArtifacts(fakeRepoRoot, created.sceneId);
  await Promise.all([
    writeFile(path.join(artifactRoot, "evaluation-run.json"), JSON.stringify({
      kind: "worldkit-evaluation-run",
      schemaVersion: 1,
      caseId: created.id,
      sceneId: created.sceneId,
      workflowPolicyVersion,
      attempt: 1,
      startedAt,
    })),
    writeFile(path.join(artifactRoot, "visual-generation-prompts.json"), "{}"),
    writeFile(path.join(artifactRoot, "styled-opening-frame.png"), png),
    writeFile(path.join(artifactRoot, "styled-opening-frame-manifest.json"), JSON.stringify({
      kind: "worldkit-styled-opening-frame-manifest",
      schemaVersion: 1,
      sceneId: created.sceneId,
      status: "passed",
    })),
    writeFile(path.join(artifactRoot, "styled-opening-frame-report.json"), JSON.stringify({
      kind: "worldkit-styled-opening-frame-report",
      schemaVersion: 1,
      sceneId: created.sceneId,
      status: "passed",
    })),
    writeFile(path.join(artifactRoot, "styled-triviews-manifest.json"), JSON.stringify({
      kind: "worldkit-styled-triview-manifest",
      schemaVersion: 1,
      sceneId: created.sceneId,
      status: "passed",
    })),
    writeFile(path.join(artifactRoot, "styled-triviews-report.json"), JSON.stringify({
      kind: "worldkit-styled-triview-report",
      schemaVersion: 1,
      sceneId: created.sceneId,
      status: "passed",
    })),
    ...captureTargets.whiteboxTriviews.map((target) =>
      writeFile(path.join(artifactRoot, "triviews", target.visualTargetId, "styled-triview.png"), png)),
  ]);

  const recoveredStudio = createStudio({ repoRoot: fakeRepoRoot, dataRoot, autoRunJobs: false });
  const recoveredOrigin = await listen(recoveredStudio);
  try {
    const detail = await (await fetch(`${recoveredOrigin}/api/worlds/${created.id}`)).json();
    assert.equal(detail.world.status, "ready");
    assert.equal(detail.world.outcome, "passed");
    assert.equal(detail.world.error, null);
  } finally {
    await recoveredStudio.shutdown();
  }
});

test("serves Scene Brief deliverables and runtime tri-views", async () => {
  const dataRoot = await temporaryRoot(".test-data-");
  const fakeRepoRoot = await temporaryRoot(".test-repo-");
  const studio = createStudio({ repoRoot: fakeRepoRoot, dataRoot, autoRunJobs: false });
  const origin = await listen(studio);
  try {
    const createResponse = await fetch(`${origin}/api/worlds`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Layered City",
        prompt: "Create bridges, towers, terrain and a continuous route.",
        sceneSourceKind: "canonical",
      }),
    });
    const created = (await createResponse.json()).world;
    const artifactRoot = path.join(fakeRepoRoot, "artifacts/scenes", created.sceneId);
    const planRoot = path.join(fakeRepoRoot, "apps/playground/public/scene-plans", created.sceneId);
    await mkdir(path.join(artifactRoot, "triviews", "player-subject"), { recursive: true });
    await mkdir(planRoot, { recursive: true });
    await Promise.all([
      writeFile(path.join(artifactRoot, "scene-brief.md"), "# WorldKit Scene Brief\n\n## 场景\n分层城市\n"),
      writeFile(path.join(artifactRoot, "visual-identity-palette.json"), "{}"),
      writeFile(path.join(artifactRoot, "authoring.json"), "{}"),
      writeFile(path.join(artifactRoot, "scene-implementation-map.json"), JSON.stringify({
        visualCaptureGroups: [{
          visualTargetId: "player-subject",
          runtimeEntityIds: ["player", "player-accessory"], frontDirectionWorldXZ: [0, -1],
          role: "primary-subject",
          semanticClassId: "subject.player",
          identityColor: "#E85D5D",
        }],
      })),
      writeFile(path.join(artifactRoot, "world.build.json"), "{}"),
      writeFile(path.join(artifactRoot, "opening-frame.png"), Buffer.from("89504e470d0a1a0a", "hex")),
      writeFile(path.join(artifactRoot, "runtime-snapshot.json"), "{}"),
      writeFile(path.join(artifactRoot, "triviews", "whitebox-triview-manifest.json"), JSON.stringify({
        whiteboxTriviews: [{
          visualTargetId: "player-subject",
          runtimeEntityIds: ["player", "player-accessory"], frontDirectionWorldXZ: [0, -1],
          role: "primary-subject",
          semanticClassId: "subject.player",
          identityColor: "#E85D5D",
        }],
      })),
      writeFile(path.join(artifactRoot, "triviews", "player-subject", "whitebox-triview.png"), Buffer.from("89504e470d0a1a0a", "hex")),
      writeFile(path.join(artifactRoot, "triviews", "player-subject", "styled-triview.png"), Buffer.from("89504e470d0a1a0a", "hex")),
      writeFile(path.join(planRoot, "world-plan.png"), Buffer.from("89504e470d0a1a0a", "hex")),
      writeFile(path.join(planRoot, "entry-whitebox-target.png"), Buffer.from("89504e470d0a1a0a", "hex")),
    ]);
    const recordPath = path.join(dataRoot, "worlds", created.id, "record.json");
    const record = JSON.parse(await readFile(recordPath, "utf8"));
    await writeFile(recordPath, JSON.stringify({
      ...record, status: "ready", stage: "ready", outcome: "passed",
      captureRequired: false, captureStatus: "passed", workflowPolicyVersion,
      styledOpeningFrameRequired: false,
      styledTriviewsRequired: false,
    }));

    const detail = await (await fetch(`${origin}/api/worlds/${created.id}`)).json();
    assert.equal(detail.world.previewUrl, `/play/${created.id}`);
    assert.equal(detail.media.prototypes[0].id, "player-subject");
    assert.equal(detail.media.prototypes[0].memberCount, 2);
    assert.equal(detail.media.prototypes[0].role, "primary-subject");
    assert.equal(detail.media.prototypes[0].styledUrl, `/api/worlds/${created.id}/styled-triviews/player-subject`);
    assert.equal(detail.media.trajectory.stages.find(({ id }) => id === "runtime-capture").status, "complete");
    assert.ok(detail.media.deliverables.some(({ id, status }) => id === "scene-brief" && status === "available"));
    const triView = await fetch(`${origin}/api/worlds/${created.id}/triviews/player-subject`);
    assert.equal(triView.status, 200);
    assert.equal(triView.headers.get("content-type"), "image/png");
    const styledTriView = await fetch(`${origin}/api/worlds/${created.id}/styled-triviews/player-subject`);
    assert.equal(styledTriView.status, 200);
    assert.equal(styledTriView.headers.get("content-type"), "image/png");
  } finally {
    await studio.shutdown();
  }
});

test("serves one atomic Preview bootstrap and removes split Preview authority routes", async () => {
  const dataRoot = await temporaryRoot(".test-data-");
  const fakeRepoRoot = await temporaryRoot(".test-repo-");
  const studio = createStudio({ repoRoot: fakeRepoRoot, dataRoot, autoRunJobs: false });
  const origin = await listen(studio);
  try {
    const created = (await (await fetch(`${origin}/api/worlds`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Atomic Preview",
        prompt: "Create one closed Preview world.",
        sceneSourceKind: "canonical",
      }),
    })).json()).world;
    const startedAt = "2026-08-25T09:00:00.000Z";
    const authoringSpec = {
      kind: "worldkit-authoring-spec",
      schemaVersion: 4,
      id: created.sceneId,
      seed: 25,
    };
    const authoringSpecHash = `sha256:${createHash("sha256")
      .update(canonicalJson(authoringSpec))
      .digest("hex")}`;
    const implementationMap = {
      kind: "worldkit-scene-brief-implementation-map",
      schemaVersion: 1,
      sceneId: created.sceneId,
      sceneBriefHash: `sha256:${"b".repeat(64)}`,
      authoringSpecId: created.sceneId,
      authoringSpecHash,
      visualTargetMappings: [{ visualTargetId: "player-subject", runtimeEntityIds: ["player"], frontDirectionWorldXZ: [0, -1] }],
      visualCaptureGroups: [{
        visualTargetId: "player-subject",
        runtimeEntityIds: ["player"], frontDirectionWorldXZ: [0, -1],
        role: "primary-subject",
        semanticClassId: "subject.player",
        identityColor: "#E85D5D",
      }],
    };
    const artifactRoot = path.join(fakeRepoRoot, "artifacts/scenes", created.sceneId);
    const recordPath = path.join(dataRoot, "worlds", created.id, "record.json");
    const record = JSON.parse(await readFile(recordPath, "utf8"));
    await mkdir(artifactRoot, { recursive: true });
    await Promise.all([
      writeFile(path.join(artifactRoot, "authoring.json"), JSON.stringify(authoringSpec)),
      writeFile(
        path.join(artifactRoot, "scene-implementation-map.json"),
        JSON.stringify(implementationMap),
      ),
      writeFile(path.join(artifactRoot, "evaluation-run.json"), JSON.stringify({
        kind: "worldkit-evaluation-run",
        schemaVersion: 1,
        caseId: created.id,
        sceneId: created.sceneId,
        workflowPolicyVersion,
        attempt: 1,
        startedAt,
      })),
      writeFile(recordPath, JSON.stringify({
        ...record,
        status: "ready",
        stage: "ready",
        outcome: "passed",
        captureStatus: "passed",
        attempt: 1,
        startedAt,
        workflowPolicyVersion,
      })),
    ]);

    const bootstrapResponse = await fetch(
      `${origin}/api/worlds/${created.id}/preview-bootstrap`,
    );
    assert.equal(
      bootstrapResponse.status,
      200,
      JSON.stringify(await bootstrapResponse.clone().json()),
    );
    assert.equal(bootstrapResponse.headers.get("cache-control"), "no-store");
    assert.deepEqual(await bootstrapResponse.json(), {
      kind: "worldkit-studio-preview-bootstrap",
      schemaVersion: 1,
      worldId: created.id,
      sceneId: created.sceneId,
      attempt: 1,
      attemptStartedAt: startedAt,
      authoringSpecHash,
      authoringSpec,
      implementationMap,
    });

    await writeFile(path.join(artifactRoot, "evaluation-run.json"), JSON.stringify({
      kind: "worldkit-evaluation-run",
      schemaVersion: 1,
      caseId: created.id,
      sceneId: created.sceneId,
      workflowPolicyVersion,
      attempt: 2,
      startedAt,
    }));
    const staleResponse = await fetch(`${origin}/api/worlds/${created.id}/preview-bootstrap`);
    assert.equal(staleResponse.status, 409);
    assert.equal((await staleResponse.json()).code, "STUDIO_PREVIEW_ATTEMPT_DRIFT");

    await rm(path.join(artifactRoot, "scene-implementation-map.json"));
    const missingResponse = await fetch(`${origin}/api/worlds/${created.id}/preview-bootstrap`);
    assert.equal(missingResponse.status, 404);
    assert.equal((await missingResponse.json()).code, "STUDIO_PREVIEW_NOT_FOUND");

    assert.equal((await fetch(`${origin}/api/worlds/${created.id}/authoring-spec`)).status, 404);
    assert.equal(
      (await fetch(`${origin}/api/worlds/${created.id}/visual-capture-targets`)).status,
      404,
    );
  } finally {
    await studio.shutdown();
  }
});
