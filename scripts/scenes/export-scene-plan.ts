import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { compileOutdoorScene, deriveWorldPlanArtifacts } from "@whitebox-world/world";

import { sceneCatalog } from "@whitebox-world/playground/scenes";
import {
  normalizeTextLineEndings,
  planLockPath,
  sha256NormalizedText,
  verifyFrozenWorldPlan,
} from "../lib/plan-lock.js";
import {
  planningWorkflowStage,
  validatePersistedCompositionReport,
  type PlanningManifest,
} from "../lib/composition-gate.js";

interface Options {
  sceneId: string;
  check: boolean;
}

function parseOptions(argv: readonly string[]): Options {
  let sceneId = "";
  let check = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--scene") {
      sceneId = argv[index + 1] ?? "";
      index += 1;
    } else if (argument === "--check") {
      check = true;
    } else if (argument === "--") {
      continue;
    } else {
      throw new Error(`Unsupported option: ${argument}`);
    }
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(sceneId)) {
    throw new Error("--scene must be a lowercase catalog id containing only letters, numbers, and hyphens.");
  }
  return { sceneId, check };
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const projectRoot = path.resolve(".");
  const planLock = await verifyFrozenWorldPlan(projectRoot, options.sceneId);
  const planLockSha256 = sha256NormalizedText(
    await readFile(planLockPath(projectRoot, options.sceneId)),
  );
  const definition = sceneCatalog[options.sceneId];
  if (definition === undefined) throw new Error(`Unknown scene catalog id: ${options.sceneId}`);
  const scene = compileOutdoorScene(definition);
  if (scene.worldSpec === undefined) {
    throw new Error(`Scene ${options.sceneId} is legacy and has no WorldSpec.`);
  }
  const artifacts = deriveWorldPlanArtifacts(scene);
  if (artifacts.diagnostics.some((item) => item.severity === "error")) {
    throw new Error(
      `Scene plan validation failed: ${artifacts.diagnostics.map((item) => item.message).join(" ")}`,
    );
  }
  const imageArtifacts = scene.worldSpec.artifacts.filter(
    (artifact) => artifact.generator === "codex-imagegen",
  );
  const initialWorkflowStage = planningWorkflowStage(scene.worldSpec);
  const imageAssets: Array<{
    kind: "world-plan" | "opening-shot";
    uri: string;
    sha256: string;
  }> = [];
  for (const artifact of imageArtifacts) {
    const assetPath = path.resolve("apps/playground/public", artifact.uri.slice(1));
    try {
      const contents = await readFile(assetPath);
      imageAssets.push({
        kind: artifact.kind,
        uri: artifact.uri,
        sha256: createHash("sha256").update(contents).digest("hex"),
      });
    } catch {
      throw new Error(
        `Missing ${artifact.kind} image ${artifact.uri}. Generate it with Codex imagegen and save it inside apps/playground/public before exporting.`,
      );
    }
  }

  const outputDirectory = path.resolve("artifacts/scenes", options.sceneId);
  const files = new Map<string, string>([
    ["world-spec.json", json(scene.worldSpec)],
    ["world-prompt.json", json(scene.worldSpec.worldPrompt)],
    ["entity-catalog.json", json(scene.worldSpec.entityCatalog)],
    ["top-down-plan.json", json(artifacts.topDown)],
    ["height-slope-plan.json", json(artifacts.heightSlope)],
    [
      "opening-shot-plan.json",
      json({
        artifactVersion: 1,
        sceneId: definition.id,
        specHash: artifacts.topDown.specHash,
        entry: scene.worldSpec.entry,
        reference: imageArtifacts.find((artifact) => artifact.kind === "opening-shot")?.uri,
      }),
    ],
    [
      "manifest.json",
      json({
        artifactVersion: 1,
        workflowStage: initialWorkflowStage,
        sceneId: definition.id,
        specHash: artifacts.topDown.specHash,
        frozenPlanSpecSha256: planLock.specSha256,
        planLockSha256,
        compiler: artifacts.topDown.compiler,
        files: [
          "world-spec.json",
          "world-prompt.json",
          "entity-catalog.json",
          "top-down-plan.json",
          "height-slope-plan.json",
          "opening-shot-plan.json",
        ],
        imageAssets,
      }),
    ],
  ]);

  if (options.check) {
    for (const [name, expected] of files) {
      const actual = await readFile(path.join(outputDirectory, name), "utf8");
      if (normalizeTextLineEndings(actual) === normalizeTextLineEndings(expected)) continue;
      if (name !== "manifest.json") throw new Error(`Stale planning artifact: ${name}`);

      const actualManifest = JSON.parse(actual) as PlanningManifest;
      const expectedManifest = JSON.parse(expected) as PlanningManifest;
      if (
        expectedManifest.workflowStage !== "whitebox-built" ||
        actualManifest.workflowStage !== "verified" ||
        JSON.stringify({ ...actualManifest, workflowStage: "whitebox-built" }) !==
          JSON.stringify(expectedManifest)
      ) {
        throw new Error(`Stale planning artifact: ${name}`);
      }
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
        worldSpec: scene.worldSpec,
        frozenPlan: planLock,
        planLockSha256,
        planningManifest: actualManifest,
        report,
      });
      if (!composition.ok) {
        throw new Error(`${composition.code}: ${composition.message}`);
      }
    }
    process.stdout.write(`PASS: ${options.sceneId} planning artifacts are current.\n`);
    return;
  }

  await mkdir(outputDirectory, { recursive: true });
  for (const [name, contents] of files) {
    await writeFile(path.join(outputDirectory, name), contents, "utf8");
  }
  process.stdout.write(`Wrote ${files.size} planning artifacts to ${outputDirectory}.\n`);
}

await main();
