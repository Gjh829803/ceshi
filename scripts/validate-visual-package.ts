import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertSceneId,
  loadWorldSpec,
  sha256,
  stableJson,
  verifyFrozenWorldPlan,
} from "./lib/plan-lock.js";
import {
  validatePersistedCompositionReport,
  type PlanningManifest,
} from "./lib/composition-gate.js";

type Mode = "inputs" | "complete";

function parseOptions(argv: readonly string[]): { sceneId: string; mode: Mode; check: boolean } {
  let sceneId = "";
  let mode: Mode = "inputs";
  let check = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--scene") {
      sceneId = argv[index + 1] ?? "";
      index += 1;
    } else if (argument === "--mode") {
      const value = argv[index + 1];
      if (value !== "inputs" && value !== "complete") throw new Error("--mode must be inputs or complete.");
      mode = value;
      index += 1;
    } else if (argument === "--check") {
      check = true;
    } else if (argument !== "--") {
      throw new Error(`Unsupported option: ${argument}`);
    }
  }
  assertSceneId(sceneId);
  return { sceneId, mode, check };
}

async function hashRegularFile(projectRoot: string, publicUri: string): Promise<string> {
  if (!publicUri.startsWith("/scene-plans/") || publicUri.includes("..")) {
    throw new Error(`Visual artifact URI is not project-local: ${publicUri}`);
  }
  const filePath = path.join(projectRoot, "apps", "playground", "public", publicUri.slice(1));
  const metadata = await lstat(filePath);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size === 0) {
    throw new Error(`Visual artifact must be a non-empty regular file: ${filePath}`);
  }
  return sha256(await readFile(filePath));
}

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const options = parseOptions(process.argv.slice(2));
const frozenPlan = await verifyFrozenWorldPlan(projectRoot, options.sceneId);
const planLockSha256 = sha256(stableJson(frozenPlan));
const verifiedManifestPath = path.join(projectRoot, "artifacts", "scenes", options.sceneId, "manifest.json");
const verifiedManifestContents = await readFile(verifiedManifestPath, "utf8");
const verifiedManifest = JSON.parse(verifiedManifestContents) as PlanningManifest;
const spec = await loadWorldSpec(projectRoot, options.sceneId);
if ((spec.source.referenceImages?.length ?? 0) > 0) {
  let report: unknown;
  try {
    report = JSON.parse(await readFile(path.join(
      projectRoot,
      "apps/playground/public/scene-plans",
      options.sceneId,
      "opening-composition-report.json",
    ), "utf8"));
  } catch {
    report = undefined;
  }
  const composition = validatePersistedCompositionReport({
    sceneId: options.sceneId,
    worldSpec: spec,
    frozenPlan,
    planLockSha256,
    planningManifest: verifiedManifest,
    report,
  });
  if (!composition.ok) {
    throw new Error(`${composition.code}: ${composition.message}`);
  }
}
if (
  verifiedManifest.workflowStage !== "verified" ||
  verifiedManifest.sceneId !== options.sceneId ||
  verifiedManifest.frozenPlanSpecSha256 !== frozenPlan.specSha256 ||
  verifiedManifest.planLockSha256 !== planLockSha256
) {
  throw new Error(`Scene ${options.sceneId} must have a verified implementation before Visual Bible.`);
}
const prototypes = [];
for (const prototype of spec.entityCatalog.prototypes) {
  const whiteboxSha256 = await hashRegularFile(projectRoot, prototype.views.whiteboxUri);
  const entry: {
    id: string;
    instanceColor: string;
    whitebox: { uri: string; sha256: string };
    styled?: { uri: string; sha256: string };
  } = {
    id: prototype.id,
    instanceColor: prototype.instanceColor,
    whitebox: { uri: prototype.views.whiteboxUri, sha256: whiteboxSha256 },
  };
  if (options.mode === "complete") {
    entry.styled = {
      uri: prototype.views.styledUri,
      sha256: await hashRegularFile(projectRoot, prototype.views.styledUri),
    };
  }
  prototypes.push(entry);
}

if (options.mode === "inputs") {
  process.stdout.write(`PASS: ${options.sceneId} Visual Bible inputs are ready for ${prototypes.length} prototypes.\n`);
} else {
  const finalFrameUri = `/scene-plans/${options.sceneId}/opening-frame-rendered.png`;
  const manifest = {
    workflowVersion: 1,
    sceneId: options.sceneId,
    stage: "visualized",
    frozenPlanSpecSha256: frozenPlan.specSha256,
    planLockSha256,
    verifiedSceneManifestSha256: sha256(verifiedManifestContents),
    finalFrame: { uri: finalFrameUri, sha256: await hashRegularFile(projectRoot, finalFrameUri) },
    prototypes,
  };
  const manifestPath = path.join(
    projectRoot,
    "artifacts",
    "scenes",
    options.sceneId,
    "visual-bible-manifest.json",
  );
  if (options.check) {
    const actual = await readFile(manifestPath, "utf8");
    if (actual !== stableJson(manifest)) throw new Error("Visual Bible manifest is stale.");
    process.stdout.write(`PASS: ${options.sceneId} Visual Bible manifest is current.\n`);
  } else {
    await mkdir(path.dirname(manifestPath), { recursive: true });
    await writeFile(manifestPath, stableJson(manifest), "utf8");
    process.stdout.write(`Wrote visualized package manifest to ${manifestPath}.\n`);
  }
}
