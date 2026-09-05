import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { sha256Bytes, sha256CanonicalJson } from "@whitebox-world/protocol";
import { parseFormalWorldCaptureReceiptV1, type FormalWorldCaptureReceiptV1 } from "@whitebox-world/runtime-contracts";
import type { WorldReconstructionEvidenceSetV1, WorldReconstructionEvaluationResultV1, WorldReconstructionViewRequirementV1, WorldReconstructionVisiblePixelProjectionV1 } from "@whitebox-world/validation";
import { measureFormalIdentityMaskV1 } from "../reconstruction/formal-identity-mask-measurement.js";

const targetRef = "worldkit://acceptance-target/gate-mass@1";
const viewIds = ["opening", "world-side", "world-top-down"] as const;
type CaptureView = FormalWorldCaptureReceiptV1["views"][number];
type SemanticEvaluation = Readonly<{ diagnostics: readonly Pick<WorldReconstructionEvaluationResultV1["diagnostics"][number],
  "dimensionId" | "code" | "acceptanceTargetRef" | "metricId">[] }>;
type SemanticEvidence = Readonly<{ observedDimensions: readonly Pick<WorldReconstructionEvidenceSetV1["observedDimensions"][number],
  "dimensionId" | "observed">[] }>;

export function parseNativeNoScriptCaptureArgsV1(args: readonly string[], geometryFixtureIds: readonly string[]) {
  if (args.length === 0) return { mode: "default" as const };
  if (args.length === 1 && args[0] === "--without-semantic-targets") return { mode: "without-semantic-targets" as const };
  if (args.length === 2 && args[0] === "--semantic-geometry" && geometryFixtureIds.includes(args[1]!)) {
    return { mode: "semantic-geometry" as const, geometryFixtureId: args[1]! };
  }
  if (args.length === 3 && args[0] === "--semantic-geometry-reference" && args[1] === "rear-depth-wall" &&
    geometryFixtureIds.includes(args[1]) && args[2]!.trim().length > 0 && !args[2]!.startsWith("--")) {
    return { mode: "semantic-geometry-reference" as const, geometryFixtureId: "rear-depth-wall" as const,
      baselineEvidenceRoot: path.resolve(args[2]!) };
  }
  throw new Error("Usage: verify:native-no-script-capture [--without-semantic-targets | --semantic-geometry <fixture-id> | --semantic-geometry-reference rear-depth-wall <solid-wall-evidence-root>]");
}

function cameraSignature(receipt: FormalWorldCaptureReceiptV1, view: CaptureView) {
  return sha256CanonicalJson({ request: view.request,
    ...(view.viewId === "opening" ? { camera: receipt.readySnapshot.view.camera } : {}),
  });
}

/** Only consumes retained test evidence; never starts Package, Browser or models. */
export async function loadNativeSemanticReferenceV1(evidenceRoot: string) {
  const evidenceBytes = await readFile(path.join(evidenceRoot, "evidence.json"));
  const evidence = JSON.parse(evidenceBytes.toString("utf8"));
  assert.equal(evidence.kind, "native-no-script-capture-browser-regression");
  assert.equal(evidence.outcome, "passed");
  assert.equal(evidence.scope, "stubbed-generation-real-native-package-browser-capture");
  assert.equal(evidence.geometryFixtureId, "solid-wall");
  assert.deepEqual(evidence.cleanupOutcomes, { hostedBrowserSession: "completed", viteServer: "completed" });
  const receiptBytes = await readFile(path.join(evidenceRoot, "capture/formal-world-capture-receipt.json"));
  const receipt = parseFormalWorldCaptureReceiptV1(JSON.parse(receiptBytes.toString("utf8")));
  assert.equal(receipt.worldPackageRootHash, evidence.worldPackageRootHash);
  const targets = receipt.formalRequest.semanticCaptureMap.bindings;
  assert(targets.some(({ acceptanceTargetRef }) => acceptanceTargetRef === targetRef), "baseline gate binding missing");
  const views = await Promise.all(viewIds.map(async (viewId) => {
    const view = receipt.views.find((entry) => entry.viewId === viewId);
    assert(view, `baseline ${viewId} missing`);
    const pngBytes = await readFile(path.join(evidenceRoot, "capture", `${viewId}-identity-mask.png`));
    const projection = measureFormalIdentityMaskV1({ view, pngBytes, targets }).get(targetRef);
    assert(projection?.outcome === "visible", `baseline gate must have bound visible ${viewId} pixels`);
    const { outcome: _outcome, ...referenceProjection } = projection;
    return { viewId, cameraSignature: cameraSignature(receipt, view),
      identityMaskPngContentHash: view.identityMaskPngContentHash,
      requirement: { viewId, mode: "reference-projection-required", ...referenceProjection } satisfies WorldReconstructionViewRequirementV1 };
  }));
  return {
    semanticReferenceProjections: [{ acceptanceTargetRef: targetRef, viewRequirements: views.map(({ requirement }) => requirement) }],
    source: { fixtureId: "solid-wall", evidenceRoot: path.resolve(evidenceRoot),
      evidenceContentHash: sha256Bytes(evidenceBytes), captureReceiptContentHash: sha256Bytes(receiptBytes),
      worldPackageRootHash: receipt.worldPackageRootHash, views },
  };
}

export function nativeSemanticReferenceMetricIdsV1(evaluation: SemanticEvaluation) {
  const diagnostics = evaluation.diagnostics.filter((row) => row.dimensionId === "semantic-silhouette" &&
    row.code === "WORLD_RECONSTRUCTION_SEMANTIC_SILHOUETTE_DRIFT" && row.acceptanceTargetRef === targetRef);
  return viewIds.map((viewId) => ({ viewId,
    metricIds: diagnostics.filter(({ metricId }) => metricId.startsWith(`${viewId}-`)).map(({ metricId }) => metricId),
  }));
}

/** Test-only decoded PNG -> Evidence -> Evaluation consumption assertions. */
export function assertNativeSemanticReferenceConsumptionV1(input: Readonly<{
  reference: Awaited<ReturnType<typeof loadNativeSemanticReferenceV1>>;
  receipt: FormalWorldCaptureReceiptV1;
  identityMaskPngs: readonly Readonly<{ viewId: CaptureView["viewId"]; bytes: Uint8Array }>[];
  evidence: SemanticEvidence;
  evaluation: SemanticEvaluation;
}>) {
  const observed = input.evidence.observedDimensions.find((row) => row.dimensionId === "semantic-silhouette")?.observed;
  assert(observed?.kind === "semantic-silhouette-observed", "semantic Evidence missing");
  const metricIdsByView = nativeSemanticReferenceMetricIdsV1(input.evaluation);
  for (const { viewId } of metricIdsByView) {
    const view = input.receipt.views.find((entry) => entry.viewId === viewId);
    const baseline = input.reference.source.views.find((entry) => entry.viewId === viewId);
    assert(view && baseline, `missing ${viewId} reference pair`);
    assert.equal(cameraSignature(input.receipt, view), baseline.cameraSignature, `${viewId} Camera differs from baseline`);
    const images = input.identityMaskPngs.filter((entry) => entry.viewId === viewId);
    assert.equal(images.length, 1, `${viewId} requires one identity PNG`);
    const projection = measureFormalIdentityMaskV1({ view, pngBytes: images[0]!.bytes,
      targets: input.receipt.formalRequest.semanticCaptureMap.bindings }).get(targetRef);
    assert(projection?.outcome === "visible", `candidate gate ${viewId} must have pixels`);
    const actual: Readonly<{ visiblePixelProjection: WorldReconstructionVisiblePixelProjectionV1 }> | undefined = observed.views.find((entry) => entry.viewId === viewId)?.targets.find(
      ({ acceptanceTargetRef }) => acceptanceTargetRef === targetRef);
    assert(actual, `${viewId} gate Evidence missing`);
    assert.deepEqual(actual.visiblePixelProjection, projection, `${viewId} Evidence must equal decoded identity pixels`);
    const metricIds = metricIdsByView.find((entry) => entry.viewId === viewId)!.metricIds;
    if (viewId === "opening") assert.deepEqual(metricIds, [], "opening must have no gate semantic drift");
    else assert(metricIds.some((id) => id.startsWith(`${viewId}-semantic-`) && !id.endsWith("target-binding")),
      `${viewId} must have its own gate pixel projection drift`);
  }
  return metricIdsByView;
}
