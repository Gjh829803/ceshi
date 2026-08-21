import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  validateOutdoorWorldSpec,
  type OutdoorWorldSpec,
} from "../../packages/world/src/index.js";

export interface FrozenPlanFile {
  kind: "world-spec-source" | "reference-image" | "world-plan" | "opening-shot";
  path: string;
  sha256: string;
}

export interface FrozenWorldPlanLock {
  workflowVersion: 1;
  sceneId: string;
  stage: "frozen";
  specSha256: string;
  files: readonly FrozenPlanFile[];
}

export function sha256(contents: string | Uint8Array): string {
  return createHash("sha256").update(contents).digest("hex");
}

export function normalizeTextLineEndings(contents: string): string {
  return contents.replace(/\r\n?/g, "\n");
}

export function sha256NormalizedText(contents: string | Uint8Array): string {
  const text = typeof contents === "string"
    ? contents
    : Buffer.from(contents).toString("utf8");
  return sha256(normalizeTextLineEndings(text));
}

export function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function assertSceneId(sceneId: string): void {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(sceneId)) {
    throw new Error("Scene id must contain lowercase letters, numbers, and hyphens.");
  }
}

export function planLockPath(projectRoot: string, sceneId: string): string {
  return path.join(projectRoot, "artifacts", "scenes", sceneId, "plan-lock.json");
}

async function readRegularFile(filePath: string): Promise<Buffer> {
  const metadata = await lstat(filePath);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error(`Frozen plan input must be a regular non-symlink file: ${filePath}`);
  }
  return readFile(filePath);
}

export async function loadWorldSpec(
  projectRoot: string,
  sceneId: string,
): Promise<OutdoorWorldSpec> {
  assertSceneId(sceneId);
  const sourcePath = path.join(
    projectRoot,
    "apps",
    "playground",
    "src",
    "scenes",
    "plans",
    `${sceneId}.ts`,
  );
  await readRegularFile(sourcePath);
  const moduleUrl = pathToFileURL(sourcePath);
  moduleUrl.searchParams.set("planLock", String(Date.now()));
  const planModule = await import(moduleUrl.href) as { worldSpec?: OutdoorWorldSpec };
  if (planModule.worldSpec === undefined) {
    throw new Error(`Plan module ${sceneId}.ts must export a named worldSpec.`);
  }
  const diagnostics = validateOutdoorWorldSpec(planModule.worldSpec, sceneId);
  const errors = diagnostics.filter((item) => item.severity === "error");
  if (errors.length > 0) {
    throw new Error(`WorldSpec is invalid: ${errors.map((item) => item.message).join(" ")}`);
  }
  return planModule.worldSpec;
}

export async function buildFrozenPlanLock(
  projectRoot: string,
  sceneId: string,
): Promise<FrozenWorldPlanLock> {
  const spec = await loadWorldSpec(projectRoot, sceneId);
  const sourceRelative = `apps/playground/src/scenes/plans/${sceneId}.ts`;
  const sourceContents = await readRegularFile(path.join(projectRoot, sourceRelative));
  const files: FrozenPlanFile[] = [
    {
      kind: "world-spec-source",
      path: sourceRelative,
      sha256: sha256NormalizedText(sourceContents),
    },
  ];
  for (const referenceUri of spec.source.referenceImages ?? []) {
    const relativePath = `apps/playground/public${referenceUri}`;
    const contents = await readRegularFile(path.join(projectRoot, relativePath));
    files.push({ kind: "reference-image", path: relativePath, sha256: sha256(contents) });
  }
  for (const artifact of spec.artifacts) {
    if (artifact.generator !== "codex-imagegen") continue;
    if (artifact.kind !== "world-plan" && artifact.kind !== "opening-shot") continue;
    const relativePath = `apps/playground/public${artifact.uri}`;
    const contents = await readRegularFile(path.join(projectRoot, relativePath));
    files.push({ kind: artifact.kind, path: relativePath, sha256: sha256(contents) });
  }
  files.sort((left, right) => left.path.localeCompare(right.path));
  return {
    workflowVersion: 1,
    sceneId,
    stage: "frozen",
    specSha256: sha256(JSON.stringify(spec)),
    files,
  };
}

export async function freezeWorldPlan(projectRoot: string, sceneId: string): Promise<string> {
  const lock = await buildFrozenPlanLock(projectRoot, sceneId);
  const outputPath = planLockPath(projectRoot, sceneId);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, stableJson(lock), "utf8");
  return outputPath;
}

export async function verifyFrozenWorldPlan(
  projectRoot: string,
  sceneId: string,
): Promise<FrozenWorldPlanLock> {
  const expected = await buildFrozenPlanLock(projectRoot, sceneId);
  const actualPath = planLockPath(projectRoot, sceneId);
  let actual: string;
  try {
    actual = await readFile(actualPath, "utf8");
  } catch {
    throw new Error(`Frozen plan lock is missing: ${actualPath}`);
  }
  if (normalizeTextLineEndings(actual) !== stableJson(expected)) {
    throw new Error(
      `Frozen plan ${sceneId} drifted. Run Planner and freeze a reviewed revision before Builder.`,
    );
  }
  return expected;
}
