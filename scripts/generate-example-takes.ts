import { readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { compileSimulationTakeV1 } from "@whitebox-world/control-capture";

import { bindSimulationTakeWorldIdentityV1 } from "./lib/example-take-world-identity";
import {
  deriveTransitionalWorldPackageIdentityV1,
} from "./lib/simulation-take-cli";
import { loadWorldkitPipeline } from "./lib/worldkit-pipeline";

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, "..");
const WORLD_PATH = path.join(
  REPOSITORY_ROOT,
  "examples/authoring/placement-coastal-world.json",
);
const TAKE_PATHS = [
  path.join(REPOSITORY_ROOT, "examples/takes/coastal-walk-opening.take.json"),
  path.join(REPOSITORY_ROOT, "examples/takes/coastal-orbit-run.take.json"),
] as const;

async function main(): Promise<void> {
  const pipeline = await loadWorldkitPipeline(WORLD_PATH);
  if (!pipeline.ok) {
    throw new Error(JSON.stringify(pipeline.diagnostics));
  }
  const reports = [];
  for (const takePath of TAKE_PATHS) {
    const source = JSON.parse(await readFile(takePath, "utf8")) as unknown;
    const compiledSource = compileSimulationTakeV1(source);
    const worldIdentity = deriveTransitionalWorldPackageIdentityV1({
      worldPackageRef: compiledSource.take.worldPackageRef,
      normalizedWorldIrHash: pipeline.normalizedWorldIrHash,
      executionPlanHash: pipeline.executionPlanHash,
    });
    const generated = bindSimulationTakeWorldIdentityV1(
      compiledSource.take,
      worldIdentity.worldPackageRootHash,
    );
    const temporaryPath = `${takePath}.tmp-${process.pid}`;
    try {
      await writeFile(
        temporaryPath,
        `${JSON.stringify(generated, null, 2)}\n`,
        "utf8",
      );
      await rename(temporaryPath, takePath);
    } finally {
      await rm(temporaryPath, { force: true });
    }
    reports.push({
      takeId: generated.id,
      takeHash: compileSimulationTakeV1(generated).takeHash,
      worldPackageRootHash: generated.worldPackageRootHash,
      outputPath: path.relative(REPOSITORY_ROOT, takePath),
    });
  }
  process.stdout.write(`${JSON.stringify({
    ok: true,
    kind: "worldkit-example-take-generation",
    schemaVersion: 1,
    reports,
  }, null, 2)}\n`);
}

await main();
