import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PNG } from "pngjs";
import { afterEach, describe, expect, it } from "vitest";
import { sha256Bytes } from "@whitebox-world/protocol";
import { hashWorldReconstructionCaseV1 } from "@whitebox-world/validation";
import { hashFormalSemanticCaptureMapV1, hashFormalWorldCaptureReceiptV1, hashFormalWorldCaptureRequestV1 } from "@whitebox-world/runtime-contracts";
import { createEvidenceSetFixtureInputV1 } from "./evaluate-fixture.test-support.js";
import { buildSceneFeatureReviewReportV1, runSceneFeatureReviewV1, type SceneFeatureReviewV1 } from "./scene-feature-review.js";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

const template = await readFile(".codex/skills/worldkit-spatial-planner/references/scene-brief-template.md", "utf8");
const brief = template.match(/```md\r?\n([\s\S]*?)\r?\n```/)![1]!;
const sceneBriefBytes = Buffer.from(brief.replaceAll("中景谷地、远景宫殿", "中景谷地、瀑布、桥梁、庭院、树林、远景宫殿"));
const image = new PNG({ width: 1280, height: 720 });
image.data.fill(255);
const png = PNG.sync.write(image);
const base = createEvidenceSetFixtureInputV1();
const reconstructionCase = { ...base.reconstructionCase, sceneBriefRef: "scene-brief.md",
  sceneBriefHash: sha256Bytes(sceneBriefBytes),
  referenceInputs: [{ inputRef: "reference.png", contentHash: sha256Bytes(png), mediaType: "image/png" as const }],
};
const caseHash = hashWorldReconstructionCaseV1(reconstructionCase);
const semanticCaptureMap = { ...base.captureReceipt.formalRequest.semanticCaptureMap, caseHash };
const formalRequest = { ...base.captureReceipt.formalRequest, caseHash, semanticCaptureMap,
  semanticCaptureMapHash: hashFormalSemanticCaptureMapV1(semanticCaptureMap),
};
const captureReceipt = { ...base.captureReceipt, caseHash, formalRequest,
  semanticCaptureMapHash: formalRequest.semanticCaptureMapHash,
  formalRequestHash: hashFormalWorldCaptureRequestV1(formalRequest),
  views: base.captureReceipt.views.map((view) => ({ ...view, pngContentHash: sha256Bytes(png) })),
};
const captureReceiptHash = hashFormalWorldCaptureReceiptV1(captureReceipt);
const UNREVIEWED_FEATURE_IDS = ["bridge", "forest", "courtyard", "waterfall", "macro-depth"];

function fixture() {
  const features: SceneFeatureReviewV1["features"] = [
    { id: "palace", name: "宫殿", kind: "landmark", regions: ["remote"],
      basis: { kind: "brief-excerpt", section: "visibleReferenceEvidence", excerpt: "远景宫殿" },
      expectedViewIds: ["opening"], expectedInstanceCount: 1 },
    { id: "bridge", name: "桥梁", kind: "route", regions: ["entry", "middle"],
      basis: { kind: "brief-excerpt", section: "visibleReferenceEvidence", excerpt: "桥梁" },
      expectedViewIds: ["opening", "world-side", "world-top-down"], expectedInstanceCount: 1 },
    { id: "forest", name: "树林", kind: "formation", regions: ["side", "rear"],
      basis: { kind: "reference-image", inputRef: "reference.png", regionPixels: [0, 0, 300, 200] },
      expectedViewIds: ["world-side", "world-top-down"], expectedInstanceCount: 12 },
    { id: "courtyard", name: "庭院空隙", kind: "negative-space", regions: ["middle", "rear"],
      basis: { kind: "brief-excerpt", section: "visibleReferenceEvidence", excerpt: "庭院" },
      expectedViewIds: ["world-top-down"], expectedInstanceCount: null },
    { id: "waterfall", name: "瀑布地形", kind: "terrain", regions: ["side", "remote"],
      basis: { kind: "brief-excerpt", section: "visibleReferenceEvidence", excerpt: "瀑布" },
      expectedViewIds: ["world-side", "world-top-down"], expectedInstanceCount: null },
    { id: "macro-depth", name: "谷地纵深和围合", kind: "composition", regions: ["entry", "middle", "side", "rear", "remote"],
      basis: { kind: "reference-image", inputRef: "reference.png", regionPixels: [0, 0, 1280, 720] },
      expectedViewIds: ["opening", "world-side", "world-top-down"], expectedInstanceCount: null },
  ];
  const review: SceneFeatureReviewV1 = {
    kind: "scene-feature-review", schemaVersion: 1, caseHash, sceneBriefHash: reconstructionCase.sceneBriefHash,
    captureReceiptHash, reviewerId: "synthetic-reviewer-not-real-visual-evidence", features,
    observations: [{ featureId: "palace", viewId: "opening", presence: "present", completeness: "complete",
      placement: "matches", regionPixels: [200, 100, 150, 200], visibleInstanceCount: 1, note: "Synthetic declaration only." }],
  };
  return {
    reconstructionCase, sceneBriefBytes, captureReceipt,
    capturePngs: { opening: png, "world-side": png, "world-top-down": png },
    referenceImagesByRef: new Map([["reference.png", png]]), review: structuredClone(review),
  };
}

describe("scene feature review evidence", () => {
  it("never treats palace identity as complete world coverage or promotes ordinary features to targets", async () => {
    const input = fixture();
    const original = JSON.stringify(input.reconstructionCase);
    const report = await buildSceneFeatureReviewReportV1(input);
    expect(report.authority).toBe("reviewer-declared");
    expect(report.productionEffect).toBe("none");
    expect(report.inventoryCompleteness).toBe("not-machine-certified");
    expect(report.summary).toEqual({ declaredFeatureCount: 6,
      reviewerMatchedFeatureIds: ["palace"], unreviewedFeatureIds: UNREVIEWED_FEATURE_IDS, gapFeatureIds: [] });
    expect(report.regions.find(({ region }) => region === "rear")?.unreviewedFeatureIds).toEqual(["forest", "courtyard", "macro-depth"]);
    expect(JSON.stringify(input.reconstructionCase)).toBe(original);
    expect(await buildSceneFeatureReviewReportV1(input)).toEqual(report);
  });

  it("retains missing, partial and occluded views as distinct gaps without summing repeated-instance counts", async () => {
    const input = fixture();
    input.review = { ...input.review, observations: [...input.review.observations,
      { featureId: "bridge", viewId: "opening", presence: "absent", completeness: "not-assessable", placement: "not-assessable",
        regionPixels: [10, 20, 40, 50], visibleInstanceCount: 0, note: "Expected bridge is missing." },
      { featureId: "bridge", viewId: "world-side", presence: "present", completeness: "partial", placement: "drifted",
        regionPixels: [10, 20, 40, 50], visibleInstanceCount: 1, note: "Flat strip instead of ascent." },
      ...(["world-side", "world-top-down"] as const).map((viewId) => ({ featureId: "forest", viewId,
        presence: "present" as const, completeness: "not-assessable" as const, placement: "matches" as const,
        regionPixels: [0, 0, 300, 200] as const, visibleInstanceCount: 7, note: "Occluded; these views may show the same trees." })),
    ] };
    const report = await buildSceneFeatureReviewReportV1(input);
    expect(report.summary.gapFeatureIds).toEqual(["bridge"]);
    expect(report.summary.unreviewedFeatureIds).toEqual(UNREVIEWED_FEATURE_IDS);
    const forest = report.features.find(({ id }) => id === "forest")!;
    expect(forest.expectedInstanceCount).toBe(12);
    expect(forest.views.map(({ observation }) => observation?.visibleInstanceCount)).toEqual([7, 7]);
    expect(forest.views.every(({ status }) => status === "unreviewed")).toBe(true);
  });

  it.each(["caseHash", "sceneBriefHash", "captureReceiptHash"] as const)("rejects stale review %s", async (field) => {
    const input = fixture();
    input.review = { ...input.review, [field]: `sha256:${"f".repeat(64)}` };
    await expect(buildSceneFeatureReviewReportV1(input)).rejects.toThrow("STALE_IDENTITY");
  });

  it.each(["brief", "capture", "reference"])("rejects changed %s bytes", async (kind) => {
    const input = fixture();
    if (kind === "brief") input.sceneBriefBytes = Buffer.from("changed Brief");
    if (kind === "capture") input.capturePngs.opening = Buffer.from("changed PNG");
    if (kind === "reference") input.referenceImagesByRef.set("reference.png", Buffer.from("changed reference"));
    await expect(buildSceneFeatureReviewReportV1(input)).rejects.toThrow(/STALE_IDENTITY|STALE_CAPTURE_PNG|UNBOUND_REFERENCE_IMAGE/);
  });

  it.each(["duplicate-feature", "duplicate-observation", "unknown-feature", "unknown-view", "forged-excerpt", "outside-image", "contradiction", "extra-field"])(
    "rejects %s instead of silently accepting malformed review evidence", async (kind) => {
      const input = fixture();
      const review = structuredClone(input.review);
      const observation = review.observations[0]!;
      const malformed = kind === "duplicate-feature" ? { ...review, features: [...review.features, review.features[0]] }
        : kind === "duplicate-observation" ? { ...review, observations: [observation, observation] }
          : kind === "unknown-feature" ? { ...review, observations: [{ ...observation, featureId: "unknown" }] }
            : kind === "unknown-view" ? { ...review, observations: [{ ...observation, viewId: "world-side" }] }
              : kind === "forged-excerpt" ? { ...review, features: [{ ...review.features[0], basis: { kind: "brief-excerpt", section: "userFacts", excerpt: "invented palace" } }] }
                : kind === "outside-image" ? { ...review, observations: [{ ...observation, regionPixels: [1279, 0, 2, 2] }] }
                  : kind === "contradiction" ? { ...review, observations: [{ ...observation, presence: "absent" }] }
                    : { ...review, productionOutcome: "passed" };
      await expect(buildSceneFeatureReviewReportV1({ ...input, review: malformed })).rejects.toThrow("SCENE_FEATURE_REVIEW_INVALID");
    },
  );

  it("runs the local command on real files without mutating inputs or treating unreviewed features as a process failure", async () => {
    const input = fixture();
    const root = await mkdtemp(path.join(os.tmpdir(), "scene-feature-review-"));
    roots.push(root);
    const inputs = path.join(root, "inputs");
    const capture = path.join(root, "capture");
    await mkdir(inputs); await mkdir(capture);
    const files = [
      [path.join(root, "case.json"), Buffer.from(JSON.stringify(input.reconstructionCase))],
      [path.join(root, "capture-receipt.json"), Buffer.from(JSON.stringify(input.captureReceipt))],
      [path.join(root, "review.json"), Buffer.from(JSON.stringify(input.review))],
      [path.join(inputs, "scene-brief.md"), input.sceneBriefBytes],
      [path.join(inputs, "reference.png"), png],
      ...Object.entries(input.capturePngs).map(([viewId, bytes]) => [path.join(capture, `${viewId}.png`), bytes] as const),
    ] as const;
    for (const [file, bytes] of files) await writeFile(file, bytes);
    const args = [
      "--case", path.join(root, "case.json"), "--inputs", inputs,
      "--capture-receipt", path.join(root, "capture-receipt.json"), "--capture", capture,
      "--review", path.join(root, "review.json"),
    ];
    const output = JSON.parse(await runSceneFeatureReviewV1(args));
    expect(output.summary.unreviewedFeatureIds).toEqual(UNREVIEWED_FEATURE_IDS);
    // Exercise the shipped CLI branch and actual exit code, not just its helper.
    const command = ["--import", "tsx", path.resolve("scripts/reconstruction/scene-feature-review.ts"), ...args];
    const child = await promisify(execFile)(process.execPath, command, { timeout: 15_000 });
    expect(child.stderr).toBe("");
    expect(JSON.parse(child.stdout)).toEqual(output);
    for (const [file, bytes] of files) expect(await readFile(file)).toEqual(bytes);
    await writeFile(path.join(capture, "opening.png"), "corrupted");
    await expect(promisify(execFile)(process.execPath, command, { timeout: 15_000 }))
      .rejects.toMatchObject({ code: 2, stdout: "", stderr: "SCENE_FEATURE_REVIEW_INVALID:STALE_CAPTURE_PNG\n" });
    await rm(path.join(capture, "opening.png"));
    await symlink(path.join(inputs, "reference.png"), path.join(capture, "opening.png"));
    await expect(runSceneFeatureReviewV1(args)).rejects.toThrow("SYMLINK_INPUT");
  }, 35_000);

  it("explains the diagnostic-only command without requiring input files", async () => {
    const help = await runSceneFeatureReviewV1(["--help"]);
    expect(help).toContain("Exit 0: valid review report (including gaps)");
    await expect(runSceneFeatureReviewV1(["--production-veto"])).rejects.toThrow();
  });
});
