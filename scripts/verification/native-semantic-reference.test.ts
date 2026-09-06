import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PNG } from "pngjs";
import { afterEach, describe, expect, it } from "vitest";
import { sha256Bytes } from "@whitebox-world/protocol";
import { hashFormalSemanticCaptureMapV1, hashFormalWorldCaptureRequestV1, parseFormalWorldCaptureReceiptV1 } from "@whitebox-world/runtime-contracts";
import { hashWorldReconstructionCaseV1, parseWorldReconstructionCaseV1 } from "@whitebox-world/validation";
import { createEvidenceSetFixtureInputV1 } from "../reconstruction/evaluate-fixture.test-support.js";
import { measureFormalIdentityMaskV1 } from "../reconstruction/formal-identity-mask-measurement.js";
import { REPOSITORY_ROOT, withNativeSemanticReferenceProjectionsV1 } from "../reconstruction/native-package.test-support.js";
import { assertNativeSemanticReferenceConsumptionV1, loadNativeSemanticReferenceV1, parseNativeNoScriptCaptureArgsV1 } from "./native-semantic-reference.test-support.js";

const targetRef = "worldkit://acceptance-target/gate-mass@1";
const fixtureIds = ["solid-wall", "rear-depth-wall", "hollow-wall"];
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function baseline() {
  // Pure in-memory contract fixture, not packageNativeBlockAttempt/Browser/Havok.
  const source = createEvidenceSetFixtureInputV1({ withoutScriptedTraversal: true });
  const value = JSON.parse(JSON.stringify(source.captureReceipt));
  value.formalRequest.semanticCaptureMap.bindings[0].acceptanceTargetRef = targetRef;
  value.formalRequest.semanticCaptureMap.bindings[0].compositionTargetRef = "worldkit://composition-target/gate-mass@1";
  value.formalRequest.semanticCaptureMapHash = hashFormalSemanticCaptureMapV1(value.formalRequest.semanticCaptureMap);
  value.semanticCaptureMapHash = value.formalRequest.semanticCaptureMapHash;
  value.formalRequestHash = hashFormalWorldCaptureRequestV1(value.formalRequest);
  const receipt = parseFormalWorldCaptureReceiptV1(value);
  const root = await mkdtemp(path.join(os.tmpdir(), "native-semantic-reference-test-"));
  roots.push(root);
  await mkdir(path.join(root, "capture"));
  const evidence = { kind: "native-no-script-capture-browser-regression", outcome: "passed",
    scope: "stubbed-generation-real-native-package-browser-capture", geometryFixtureId: "solid-wall",
    worldPackageRootHash: receipt.worldPackageRootHash,
    cleanupOutcomes: { hostedBrowserSession: "completed", viteServer: "completed" } };
  await writeFile(path.join(root, "evidence.json"), JSON.stringify(evidence));
  await writeFile(path.join(root, "capture/formal-world-capture-receipt.json"), JSON.stringify(receipt));
  for (const image of source.identityMaskPngs) await writeFile(path.join(root, "capture", `${image.viewId}-identity-mask.png`), image.bytes);
  const identityMaskPngs = receipt.views.map(({ viewId }) => ({ viewId,
    bytes: source.identityMaskPngs.find((image) => image.viewId === viewId)!.bytes }));
  return { root, receipt, evidence, identityMaskPngs };
}

describe("test-only explicit semantic reference consumption", () => {
  it("keeps the old CLI modes and only permits rear-depth-wall with a separate solid reference", () => {
    expect(parseNativeNoScriptCaptureArgsV1([], fixtureIds)).toEqual({ mode: "default" });
    expect(parseNativeNoScriptCaptureArgsV1(["--without-semantic-targets"], fixtureIds)).toEqual({ mode: "without-semantic-targets" });
    expect(parseNativeNoScriptCaptureArgsV1(["--subject-occluder"], fixtureIds)).toEqual({ mode: "subject-occluder" });
    expect(parseNativeNoScriptCaptureArgsV1(["--semantic-geometry", "hollow-wall"], fixtureIds)).toEqual({ mode: "semantic-geometry", geometryFixtureId: "hollow-wall" });
    expect(parseNativeNoScriptCaptureArgsV1(["--semantic-geometry-reference", "rear-depth-wall", "/tmp/reference"], fixtureIds))
      .toEqual({ mode: "semantic-geometry-reference", geometryFixtureId: "rear-depth-wall", baselineEvidenceRoot: "/tmp/reference" });
  });

  it.each([
    ["--semantic-geometry-reference", "solid-wall", "/tmp/reference"],
    ["--semantic-geometry-reference", "rear-depth-wall"],
    ["--semantic-geometry-reference", "rear-depth-wall", ""],
    ["--semantic-geometry-reference", "rear-depth-wall", "--without-semantic-targets"],
    ["--semantic-geometry-reference", "rear-depth-wall", "/tmp/reference", "--semantic-geometry"],
    ["--semantic-geometry", "absent"],
    ["--without-semantic-targets", "--semantic-geometry", "solid-wall"],
  ])("rejects malformed/mixed arguments %j", (...args) => {
    expect(() => parseNativeNoScriptCaptureArgsV1(args, fixtureIds)).toThrow("Usage:");
  });

  it("loads three hash/dimension-bound visible PNG references and changes only that Case target", async () => {
    const source = await baseline();
    const reference = await loadNativeSemanticReferenceV1(source.root);
    expect(reference.semanticReferenceProjections[0]!.viewRequirements.map(({ viewId, mode }) => [viewId, mode])).toEqual([
      ["opening", "reference-projection-required"], ["world-side", "reference-projection-required"], ["world-top-down", "reference-projection-required"],
    ]);
    const original = parseWorldReconstructionCaseV1(JSON.parse(await readFile(path.join(REPOSITORY_ROOT,
      "artifacts/scenes/cloud-temple-t-gate-native-block/case.json"), "utf8")));
    const updated = withNativeSemanticReferenceProjectionsV1(original, reference.semanticReferenceProjections);
    const gate = updated.expected.semanticSilhouetteTargets.find(({ acceptanceTargetRef }) => acceptanceTargetRef === targetRef)!;
    expect(gate.viewRequirements).toEqual(reference.semanticReferenceProjections[0]!.viewRequirements);
    expect(updated.expected.semanticSilhouetteTargets.filter(({ acceptanceTargetRef }) => acceptanceTargetRef !== targetRef))
      .toEqual(original.expected.semanticSilhouetteTargets.filter(({ acceptanceTargetRef }) => acceptanceTargetRef !== targetRef));
    const openingReference = gate.viewRequirements[0]!;
    expect(openingReference.mode).toBe("reference-projection-required");
    if (openingReference.mode !== "reference-projection-required") throw new Error("missing opening reference");
    const compositionTargetRef = "worldkit://composition-target/gate-mass@1";
    expect(updated.expected.openingComposition.regions.find(({ targetRef }) => targetRef === compositionTargetRef)?.normalizedBounds)
      .toEqual(openingReference.normalizedBounds);
    expect(updated.expected.openingComposition.anchors.find(({ targetRef }) => targetRef === compositionTargetRef)?.normalizedCenter)
      .toEqual(openingReference.normalizedCenter);
    for (const rows of ["regions", "anchors"] as const) {
      expect(updated.expected.openingComposition[rows].filter(({ targetRef }) => targetRef !== compositionTargetRef))
        .toEqual(original.expected.openingComposition[rows].filter(({ targetRef }) => targetRef !== compositionTargetRef));
    }
    expect({ ...updated, expected: { ...updated.expected, semanticSilhouetteTargets: [],
      openingComposition: { ...updated.expected.openingComposition, regions: [], anchors: [] } } })
      .toEqual({ ...original, expected: { ...original.expected, semanticSilhouetteTargets: [],
        openingComposition: { ...original.expected.openingComposition, regions: [], anchors: [] } } });
    expect(hashWorldReconstructionCaseV1(updated)).not.toBe(hashWorldReconstructionCaseV1(original));
    expect(withNativeSemanticReferenceProjectionsV1(original, [])).toEqual(original);
    expect(() => withNativeSemanticReferenceProjectionsV1(original, [...reference.semanticReferenceProjections, ...reference.semanticReferenceProjections])).toThrow("duplicate");
    expect(() => withNativeSemanticReferenceProjectionsV1(original, [{ ...reference.semanticReferenceProjections[0]!, acceptanceTargetRef: "absent" }])).toThrow("unknown");
    expect(() => withNativeSemanticReferenceProjectionsV1(original, [{ ...reference.semanticReferenceProjections[0]!, viewRequirements: [] }])).toThrow();
    expect(() => withNativeSemanticReferenceProjectionsV1(original, [{ ...reference.semanticReferenceProjections[0]!, compositionTargetRef: "absent" }])).toThrow("unknown opening");
  });

  it.each(["wrong-fixture", "wrong-world-hash", "png-hash", "png-dimensions", "invisible", "missing-view"])("rejects invalid retained baseline %s", async (mode) => {
    const source = await baseline();
    if (mode === "wrong-fixture" || mode === "wrong-world-hash") {
      await writeFile(path.join(source.root, "evidence.json"), JSON.stringify({ ...source.evidence,
        ...(mode === "wrong-fixture" ? { geometryFixtureId: "rear-depth-wall" } : { worldPackageRootHash: `sha256:${"0".repeat(64)}` }),
      }));
    } else if (mode === "missing-view") {
      await rm(path.join(source.root, "capture/world-side-identity-mask.png"));
    } else {
      const png = new PNG({ width: mode === "png-dimensions" ? 1 : source.receipt.views[0]!.request.widthPixels,
        height: mode === "png-dimensions" ? 1 : source.receipt.views[0]!.request.heightPixels });
      const bytes = PNG.sync.write(png);
      await writeFile(path.join(source.root, "capture/opening-identity-mask.png"), bytes);
      if (mode !== "png-hash") {
        const receipt = JSON.parse(JSON.stringify(source.receipt));
        receipt.views[0].identityMaskPngContentHash = sha256Bytes(bytes);
        await writeFile(path.join(source.root, "capture/formal-world-capture-receipt.json"), JSON.stringify(receipt));
      }
    }
    await expect(loadNativeSemanticReferenceV1(source.root)).rejects.toThrow();
  });

  it("requires per-view decoder equality, comparable Cameras and side/top-specific semantic diagnostics", async () => {
    const source = await baseline();
    const reference = await loadNativeSemanticReferenceV1(source.root);
    const evidence = { observedDimensions: [{ dimensionId: "semantic-silhouette" as const,
      observed: { kind: "semantic-silhouette-observed" as const, views: source.receipt.views.map((view) => ({
        viewId: view.viewId, targets: [{ acceptanceTargetRef: targetRef, visualGroupId: "gate-mass-group",
          visiblePixelProjection: measureFormalIdentityMaskV1({ view, targets: source.receipt.formalRequest.semanticCaptureMap.bindings,
            pngBytes: source.identityMaskPngs.find(({ viewId }) => viewId === view.viewId)!.bytes }).get(targetRef)! }],
      })) },
    }] };
    const evaluation = { diagnostics: (["world-side", "world-top-down"] as const).map((viewId) => ({
      dimensionId: "semantic-silhouette" as const, code: "WORLD_RECONSTRUCTION_SEMANTIC_SILHOUETTE_DRIFT" as const,
      acceptanceTargetRef: targetRef, metricId: `${viewId}-semantic-coverage-basis-points` as const,
    })) };
    const input = { reference, receipt: source.receipt, identityMaskPngs: source.identityMaskPngs, evidence, evaluation };
    expect(assertNativeSemanticReferenceConsumptionV1(input).map(({ viewId, metricIds }) => [viewId, metricIds.length]))
      .toEqual([["opening", 0], ["world-side", 1], ["world-top-down", 1]]);
    expect(() => assertNativeSemanticReferenceConsumptionV1({ ...input, evaluation: { diagnostics: evaluation.diagnostics.slice(0, 1) } })).toThrow("world-top-down");
    expect(() => assertNativeSemanticReferenceConsumptionV1({ ...input, evaluation: { diagnostics: [...evaluation.diagnostics,
      { ...evaluation.diagnostics[0]!, metricId: "opening-semantic-coverage-basis-points" }] } })).toThrow("opening");
    const changed = structuredClone(evidence);
    changed.observedDimensions[0]!.observed.views[1]!.targets[0]!.visiblePixelProjection = { outcome: "not-visible" };
    expect(() => assertNativeSemanticReferenceConsumptionV1({ ...input, evidence: changed })).toThrow("Evidence must equal");
    const movedReceipt = JSON.parse(JSON.stringify(source.receipt));
    movedReceipt.readySnapshot.view.camera.positionMetersXYZ[0] += 1;
    expect(() => assertNativeSemanticReferenceConsumptionV1({ ...input, receipt: movedReceipt })).toThrow("opening Camera");
    expect(() => assertNativeSemanticReferenceConsumptionV1({ ...input, identityMaskPngs: source.identityMaskPngs.slice(1) })).toThrow("one identity PNG");
  });
});
