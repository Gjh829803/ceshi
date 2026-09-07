import { constants, open, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import Ajv2020 from "ajv/dist/2020.js";
import { PNG } from "pngjs";
import sharp from "sharp";
import { isNil } from "lodash-es";
import { parseSceneBriefV1 } from "@whitebox-world/authoring";
import { sha256Bytes, sha256CanonicalJson, stringifyCanonicalJson } from "@whitebox-world/protocol";
import { hashWorldReconstructionCaseV1, parseWorldReconstructionCaseV1 } from "@whitebox-world/validation";
import {
  FORMAL_WORLD_CAPTURE_VIEW_IDS_V1,
  hashFormalWorldCaptureReceiptV1,
  parseFormalWorldCaptureReceiptV1,
  type FormalWorldCaptureViewIdV1,
} from "@whitebox-world/runtime-contracts";
import { parseRepositoryRelativePathV1 } from "../lib/workspace-boundary-contract.js";

const REGIONS = ["entry", "middle", "side", "rear", "remote"] as const;
const BRIEF_SECTIONS = ["userFacts", "visibleReferenceEvidence", "inferredContinuation", "space", "navigation", "openingShot"] as const;
type PixelRegion = readonly [left: number, top: number, width: number, height: number];
type FeatureBasis =
  | Readonly<{ kind: "brief-excerpt"; section: typeof BRIEF_SECTIONS[number]; excerpt: string }>
  | Readonly<{ kind: "reference-image"; inputRef: string; regionPixels: PixelRegion }>;

export interface SceneFeatureReviewV1 {
  readonly kind: "scene-feature-review";
  readonly schemaVersion: 1;
  readonly caseHash: string;
  readonly sceneBriefHash: string;
  readonly captureReceiptHash: string;
  readonly reviewerId: string;
  readonly features: readonly Readonly<{
    id: string;
    name: string;
    kind: "landmark" | "terrain" | "route" | "formation" | "negative-space" | "composition";
    regions: readonly typeof REGIONS[number][];
    basis: FeatureBasis;
    expectedViewIds: readonly FormalWorldCaptureViewIdV1[];
    expectedInstanceCount: number | null;
  }>[];
  readonly observations: readonly Readonly<{
    featureId: string;
    viewId: FormalWorldCaptureViewIdV1;
    presence: "present" | "absent" | "not-assessable";
    completeness: "complete" | "partial" | "not-assessable";
    placement: "matches" | "drifted" | "not-assessable";
    regionPixels: PixelRegion;
    visibleInstanceCount: number | null;
    note: string;
  }>[];
}

const text = { type: "string", pattern: "\\S" };
const id = { type: "string", pattern: "^[a-z][a-z0-9-]{1,79}$" };
const hash = { type: "string", pattern: "^sha256:[0-9a-f]{64}$" };
const count = { anyOf: [{ type: "null" }, { type: "integer", minimum: 0 }] };
const pixelRegion = { type: "array", minItems: 4, maxItems: 4, prefixItems: [
  { type: "integer", minimum: 0 }, { type: "integer", minimum: 0 },
  { type: "integer", minimum: 1 }, { type: "integer", minimum: 1 },
], items: false };
const validate = new Ajv2020({ strict: true, allErrors: true }).compile<SceneFeatureReviewV1>({
  type: "object", additionalProperties: false,
  required: ["kind", "schemaVersion", "caseHash", "sceneBriefHash", "captureReceiptHash", "reviewerId", "features", "observations"],
  properties: {
    kind: { const: "scene-feature-review" }, schemaVersion: { const: 1 },
    caseHash: hash, sceneBriefHash: hash, captureReceiptHash: hash, reviewerId: text,
    features: { type: "array", minItems: 1, items: {
      type: "object", additionalProperties: false,
      required: ["id", "name", "kind", "regions", "basis", "expectedViewIds", "expectedInstanceCount"],
      properties: {
        id, name: text, kind: { enum: ["landmark", "terrain", "route", "formation", "negative-space", "composition"] },
        regions: { type: "array", minItems: 1, uniqueItems: true, items: { enum: REGIONS } },
        expectedViewIds: { type: "array", minItems: 1, uniqueItems: true, items: { enum: FORMAL_WORLD_CAPTURE_VIEW_IDS_V1 } },
        expectedInstanceCount: count,
        basis: { oneOf: [
          { type: "object", additionalProperties: false, required: ["kind", "section", "excerpt"], properties: {
            kind: { const: "brief-excerpt" }, section: { enum: BRIEF_SECTIONS }, excerpt: text,
          } },
          { type: "object", additionalProperties: false, required: ["kind", "inputRef", "regionPixels"], properties: {
            kind: { const: "reference-image" }, inputRef: text, regionPixels: pixelRegion,
          } },
        ] },
      },
    } },
    observations: { type: "array", items: {
      type: "object", additionalProperties: false,
      required: ["featureId", "viewId", "presence", "completeness", "placement", "regionPixels", "visibleInstanceCount", "note"],
      properties: {
        featureId: id, viewId: { enum: FORMAL_WORLD_CAPTURE_VIEW_IDS_V1 },
        presence: { enum: ["present", "absent", "not-assessable"] },
        completeness: { enum: ["complete", "partial", "not-assessable"] },
        placement: { enum: ["matches", "drifted", "not-assessable"] },
        regionPixels: pixelRegion, visibleInstanceCount: count, note: text,
      },
    } },
  },
});

function invalid(detail: string): never {
  throw new TypeError(`SCENE_FEATURE_REVIEW_INVALID:${detail}`);
}

function checkRegion(region: PixelRegion, width: number, height: number): void {
  if (region[0] + region[2] > width || region[1] + region[3] > height) invalid("PIXEL_REGION_OUTSIDE_IMAGE");
}

/** Integrity-checked reviewer evidence, never an automatic semantic or production verdict. */
export async function buildSceneFeatureReviewReportV1(input: Readonly<{
  reconstructionCase: unknown;
  sceneBriefBytes: Uint8Array;
  captureReceipt: unknown;
  capturePngs: Readonly<Record<FormalWorldCaptureViewIdV1, Uint8Array>>;
  referenceImagesByRef: ReadonlyMap<string, Uint8Array>;
  review: unknown;
}>) {
  if (!validate(input.review)) invalid("SCHEMA");
  // Detach the asynchronous operation from the caller's mutable review object.
  const review = structuredClone(input.review);
  const reconstructionCase = parseWorldReconstructionCaseV1(input.reconstructionCase);
  const receipt = parseFormalWorldCaptureReceiptV1(input.captureReceipt);
  const caseHash = hashWorldReconstructionCaseV1(reconstructionCase);
  const captureReceiptHash = hashFormalWorldCaptureReceiptV1(receipt);
  if (review.caseHash !== caseHash || receipt.caseHash !== caseHash ||
      review.sceneBriefHash !== reconstructionCase.sceneBriefHash ||
      sha256Bytes(input.sceneBriefBytes) !== reconstructionCase.sceneBriefHash ||
      review.captureReceiptHash !== captureReceiptHash) invalid("STALE_IDENTITY");
  const brief = parseSceneBriefV1(new TextDecoder().decode(input.sceneBriefBytes));
  if (!brief.ok) invalid("BRIEF");
  const dimensionsByView = new Map<FormalWorldCaptureViewIdV1, { width: number; height: number }>();
  for (const view of receipt.views) {
    const bytes = input.capturePngs[view.viewId];
    if (sha256Bytes(bytes) !== view.pngContentHash) invalid("STALE_CAPTURE_PNG");
    const png = PNG.sync.read(Buffer.from(bytes));
    if (png.width !== view.request.widthPixels || png.height !== view.request.heightPixels) invalid("CAPTURE_DIMENSIONS");
    dimensionsByView.set(view.viewId, { width: png.width, height: png.height });
  }
  const featuresById = new Map(review.features.map((feature) => [feature.id, feature]));
  if (featuresById.size !== review.features.length) invalid("DUPLICATE_FEATURE");
  for (const feature of review.features) {
    if (feature.basis.kind === "brief-excerpt") {
      if (!brief.value[feature.basis.section].includes(feature.basis.excerpt)) invalid("UNBOUND_BRIEF_EXCERPT");
    } else {
      const basis = feature.basis;
      const reference = reconstructionCase.referenceInputs.find(({ inputRef }) => inputRef === basis.inputRef);
      const bytes = input.referenceImagesByRef.get(basis.inputRef);
      if (isNil(reference) || reference.mediaType === "application/json" || isNil(bytes) ||
          sha256Bytes(bytes) !== reference.contentHash) invalid("UNBOUND_REFERENCE_IMAGE");
      const metadata = await sharp(bytes).metadata();
      if (isNil(metadata.width) || isNil(metadata.height)) invalid("REFERENCE_DIMENSIONS");
      checkRegion(basis.regionPixels, metadata.width, metadata.height);
    }
  }
  const observations = new Map<string, SceneFeatureReviewV1["observations"][number]>();
  for (const observation of review.observations) {
    const feature = featuresById.get(observation.featureId);
    if (isNil(feature) || !feature.expectedViewIds.includes(observation.viewId)) invalid("UNDECLARED_OBSERVATION");
    const key = `${observation.featureId}/${observation.viewId}`;
    if (observations.has(key)) invalid("DUPLICATE_OBSERVATION");
    if (observation.presence !== "present" &&
        (observation.completeness !== "not-assessable" || observation.placement !== "not-assessable")) invalid("CONTRADICTORY_OBSERVATION");
    if (observation.presence === "absent" && observation.visibleInstanceCount !== null &&
        observation.visibleInstanceCount !== 0) invalid("CONTRADICTORY_COUNT");
    const dimensions = dimensionsByView.get(observation.viewId);
    if (isNil(dimensions)) invalid("MISSING_CAPTURE_VIEW");
    checkRegion(observation.regionPixels, dimensions.width, dimensions.height);
    observations.set(key, observation);
  }
  const features = review.features.map((feature) => {
    const views = feature.expectedViewIds.map((viewId) => {
      const observation = observations.get(`${feature.id}/${viewId}`);
      const status = isNil(observation) ? "unreviewed"
        : observation.presence === "absent" || observation.completeness === "partial" || observation.placement === "drifted"
          ? "reviewer-gap"
          : observation.presence === "not-assessable" || observation.completeness === "not-assessable" || observation.placement === "not-assessable"
            ? "unreviewed" : "reviewer-matched";
      return { viewId, status, observation: observation ?? null };
    });
    return { ...feature, views };
  });
  const summary = (rows: typeof features) => ({
    declaredFeatureCount: rows.length,
    unreviewedFeatureIds: rows.filter(({ views }) => views.some(({ status }) => status === "unreviewed")).map(({ id: featureId }) => featureId),
    gapFeatureIds: rows.filter(({ views }) => views.some(({ status }) => status === "reviewer-gap")).map(({ id: featureId }) => featureId),
    reviewerMatchedFeatureIds: rows.filter(({ views }) => views.every(({ status }) => status === "reviewer-matched")).map(({ id: featureId }) => featureId),
  });
  return {
    kind: "scene-feature-review-report" as const, schemaVersion: 1 as const,
    authority: "reviewer-declared" as const, productionEffect: "none" as const,
    inventoryCompleteness: "not-machine-certified" as const,
    reviewerId: review.reviewerId, reviewHash: sha256CanonicalJson(review),
    caseHash, sceneBriefHash: reconstructionCase.sceneBriefHash, captureReceiptHash,
    worldPackageRootHash: receipt.worldPackageRootHash,
    captureViews: receipt.views.map(({ viewId, pngArtifactRef, pngContentHash }) => ({ viewId, pngArtifactRef, pngContentHash })),
    referenceInputs: reconstructionCase.referenceInputs,
    features, summary: summary(features),
    regions: REGIONS.map((region) => ({ region, ...summary(features.filter((feature) => feature.regions.includes(region))) })),
  };
}

async function readInside(root: string, ref: string): Promise<Buffer> {
  const relativePath = parseRepositoryRelativePathV1(ref);
  const absolutePath = path.join(await realpath(root), relativePath);
  if (await realpath(absolutePath) !== absolutePath) invalid("SYMLINK_INPUT");
  const handle = await open(absolutePath, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    if (!(await handle.stat()).isFile()) invalid("NON_FILE_INPUT");
    return await handle.readFile();
  } finally { await handle.close(); }
}

export async function runSceneFeatureReviewV1(args: readonly string[]): Promise<string> {
  const { values } = parseArgs({ args: [...args], options: {
    help: { type: "boolean" },
    case: { type: "string" }, inputs: { type: "string" },
    "capture-receipt": { type: "string" }, capture: { type: "string" }, review: { type: "string" },
  }, allowPositionals: false, strict: true });
  if (values.help === true) return [
    "Usage: pnpm review:scene-features --case <case.json> --inputs <Case-input-directory>",
    "  --capture-receipt <capture-receipt.json> --capture <capture-directory> --review <review.json>",
    "Read-only, reviewer-declared scene diagnostics. Missing/partial/misplaced features do not fail production.",
    "Exit 0: valid review report (including gaps). Exit 2: invalid arguments or evidence integrity.",
    "Input format: docs/superpowers/skills/scene-feature-review.md",
  ].join("\n");
  const required = (key: "case" | "inputs" | "capture-receipt" | "capture" | "review") => values[key] ?? invalid(`MISSING_ARGUMENT:${key}`);
  const reconstructionCase = parseWorldReconstructionCaseV1(JSON.parse(await readFile(required("case"), "utf8")));
  const captureReceipt = JSON.parse(await readFile(required("capture-receipt"), "utf8"));
  const referenceImagesByRef = new Map<string, Uint8Array>();
  for (const reference of reconstructionCase.referenceInputs) {
    if (reference.mediaType !== "application/json") referenceImagesByRef.set(reference.inputRef,
      await readInside(required("inputs"), reference.inputRef));
  }
  const report = await buildSceneFeatureReviewReportV1({
    reconstructionCase, captureReceipt,
    sceneBriefBytes: await readInside(required("inputs"), reconstructionCase.sceneBriefRef),
    referenceImagesByRef,
    capturePngs: {
      opening: await readInside(required("capture"), "opening.png"),
      "world-side": await readInside(required("capture"), "world-side.png"),
      "world-top-down": await readInside(required("capture"), "world-top-down.png"),
    },
    review: JSON.parse(await readFile(required("review"), "utf8")),
  });
  return stringifyCanonicalJson(report);
}

if (!isNil(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void runSceneFeatureReviewV1(process.argv.slice(2)).then((report) => process.stdout.write(`${report}\n`)).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : "SCENE_FEATURE_REVIEW_FAILED"}\n`);
    process.exitCode = 2;
  });
}
