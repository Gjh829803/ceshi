import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { renderBlockBuilderVisualReview } from "./agent-block-builder-visual-review.js";
import {
  createRgbaRasterV1,
  decodePngRgbaV1,
  encodePngRgbaV1,
  fillRgbaRectV1,
} from "../lib/png-raster.js";

describe("Block Builder visual review", () => {
  it("deterministically composes Planner intent beside current Builder renders", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "block-builder-visual-review-"));
    const plannerTopDown = createRgbaRasterV1(256, 256, [225, 238, 245]);
    fillRgbaRectV1(plannerTopDown, 32, 32, 224, 224, [183, 228, 199]);
    const plannerEntry = createRgbaRasterV1(320, 180, [159, 207, 238]);
    fillRgbaRectV1(plannerEntry, 0, 105, 320, 180, [183, 228, 199]);
    const worldPlanPath = path.join(root, "world-plan.png");
    const entryPath = path.join(root, "entry.png");
    await Promise.all([
      writeFile(worldPlanPath, encodePngRgbaV1(plannerTopDown)),
      writeFile(entryPath, encodePngRgbaV1(plannerEntry)),
    ]);

    const first = {
      worldModulePath: path.resolve("examples/block-world/basic-world.mjs"),
      worldPlanPath,
      entryWhiteboxTargetPath: entryPath,
      topDownComparisonOutputPath: path.join(root, "top-down-a.png"),
      entryComparisonOutputPath: path.join(root, "entry-a.png"),
    };
    const second = {
      ...first,
      topDownComparisonOutputPath: path.join(root, "top-down-b.png"),
      entryComparisonOutputPath: path.join(root, "entry-b.png"),
    };
    const firstReceipt = await renderBlockBuilderVisualReview(first);
    const secondReceipt = await renderBlockBuilderVisualReview(second);

    expect(firstReceipt).toEqual(secondReceipt);
    expect(decodePngRgbaV1(await readFile(first.topDownComparisonOutputPath)))
      .toMatchObject({ width: 1544, height: 768 });
    expect(decodePngRgbaV1(await readFile(first.entryComparisonOutputPath)))
      .toMatchObject({ width: 1928, height: 540 });
    expect(await readFile(first.topDownComparisonOutputPath)).toEqual(
      await readFile(second.topDownComparisonOutputPath),
    );
    expect(await readFile(first.entryComparisonOutputPath)).toEqual(
      await readFile(second.entryComparisonOutputPath),
    );

    const vehicleWorldPath = path.join(root, "vehicle-world.mjs");
    await writeFile(
      vehicleWorldPath,
      (await readFile(first.worldModulePath, "utf8")).replace(
        "worldkit://subject-definition/humanoid.g-bot@2",
        "worldkit://subject-definition/xier120.four-wheel@1",
      ),
      "utf8",
    );
    const vehicleEntryPath = path.join(root, "entry-vehicle.png");
    await renderBlockBuilderVisualReview({
      ...first,
      worldModulePath: vehicleWorldPath,
      topDownComparisonOutputPath: path.join(root, "top-down-vehicle.png"),
      entryComparisonOutputPath: vehicleEntryPath,
    });
    expect(await readFile(vehicleEntryPath)).not.toEqual(
      await readFile(first.entryComparisonOutputPath),
    );

    const portableTopDown = path.join(root, "top-down-portable.png");
    const portableEntry = path.join(root, "entry-portable.png");
    const portable = spawnSync(process.execPath, [
      path.resolve(
        ".codex/skills/worldkit-block-builder/scripts/render-visual-review.mjs",
      ),
      "--world", first.worldModulePath,
      "--world-plan", worldPlanPath,
      "--entry", entryPath,
      "--top-down-output", portableTopDown,
      "--entry-output", portableEntry,
    ], { cwd: root, encoding: "utf8" });
    expect(portable.status, portable.stderr || portable.stdout).toBe(0);
    expect(JSON.parse(portable.stdout)).toEqual(firstReceipt);
    expect(await readFile(portableTopDown)).toEqual(
      await readFile(first.topDownComparisonOutputPath),
    );
    expect(await readFile(portableEntry)).toEqual(
      await readFile(first.entryComparisonOutputPath),
    );
  }, 30_000);
});
