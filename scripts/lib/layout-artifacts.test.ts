import { cp, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createValidAuthoringSpec } from "@whitebox-world/authoring/testing";
import {
  layoutExitCodeForStatus,
  layoutExplainFile,
  layoutSolveFile,
  layoutValidateFile,
} from "./layout-artifacts";

const temporaryDirectories: string[] = [];

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "worldkit-layout-"));
  temporaryDirectories.push(directory);
  return directory;
}

async function writeWorld(directory: string, mutate?: (spec: ReturnType<typeof createValidAuthoringSpec>) => void): Promise<string> {
  const source = createValidAuthoringSpec();
  mutate?.(source);
  const spec = {
    ...source,
    schemaVersion: 4,
    spatial: { ...source.spatial, traversalAreas: [] },
    constraints: { ...source.constraints, connectivity: [] },
  } as const;
  const inputPath = path.join(directory, "world.json");
  await writeFile(inputPath, JSON.stringify(spec), "utf8");
  return inputPath;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    ),
  );
});

describe("layout CLI artifacts", () => {
  it("validates references and profiles without writing or solving", async () => {
    const directory = await createTemporaryDirectory();
    const inputPath = await writeWorld(directory);

    await expect(layoutValidateFile(inputPath)).resolves.toMatchObject({
      ok: true,
      exitCode: 0,
      kind: "worldkit-layout-validation",
      schemaVersion: 1,
      solverProfileRef: "worldkit://layout-solver-profile/outdoor.s1@1",
    });
    expect(await readdir(directory)).toEqual(["world.json"]);
  });

  it("writes and transactionally replaces deterministic report, IR, and integrity bytes", async () => {
    const directory = await createTemporaryDirectory();
    const inputPath = await writeWorld(directory);
    const outputPath = path.join(directory, "layout");

    const first = await layoutSolveFile(inputPath, outputPath);
    expect(first).toMatchObject({
      ok: true,
      exitCode: 0,
      kind: "worldkit-layout-solve",
      schemaVersion: 1,
      outputPath,
      layoutSolveReportHash: expect.stringMatching(/^sha256:/),
      normalizedWorldIrHash: expect.stringMatching(/^sha256:/),
      integrityManifestHash: expect.stringMatching(/^sha256:/),
    });
    if (!first.ok) throw new Error("Layout fixture did not solve.");
    expect((await readdir(outputPath)).sort()).toEqual([
      "integrity.json",
      "layout-report.json",
      "normalized-world-ir.json",
    ]);
    const firstBytes = await Promise.all(
      ["integrity.json", "layout-report.json", "normalized-world-ir.json"].map(
        (filename) => readFile(path.join(outputPath, filename), "utf8"),
      ),
    );
    const manifest = JSON.parse(firstBytes[0]!) as Record<string, unknown>;
    expect(manifest).toMatchObject({
      kind: "worldkit-layout-artifact-integrity",
      schemaVersion: 1,
      layoutSolveReportHash: first.layoutSolveReportHash,
      normalizedWorldIrHash: first.normalizedWorldIrHash,
    });

    await expect(layoutSolveFile(inputPath, outputPath)).resolves.toMatchObject({
      ok: true,
      layoutSolveReportHash: first.layoutSolveReportHash,
      normalizedWorldIrHash: first.normalizedWorldIrHash,
    });
    const secondBytes = await Promise.all(
      ["integrity.json", "layout-report.json", "normalized-world-ir.json"].map(
        (filename) => readFile(path.join(outputPath, filename), "utf8"),
      ),
    );
    expect(secondBytes).toEqual(firstBytes);
  });

  it("keeps a complete prior directory when publication fails", async () => {
    const directory = await createTemporaryDirectory();
    const inputPath = await writeWorld(directory);
    const outputPath = path.join(directory, "layout");
    expect((await layoutSolveFile(inputPath, outputPath)).ok).toBe(true);
    const previousReport = await readFile(path.join(outputPath, "layout-report.json"), "utf8");

    const failed = await layoutSolveFile(inputPath, outputPath, {
      promotionFileSystem: {
        rename: async (source, destination) => {
          const sourcePath = typeof source === "string" ? source : source.toString();
          if (path.basename(sourcePath).startsWith(".layout.tmp-")) {
            throw Object.assign(new Error("publication failed"), { code: "EIO" });
          }
          await rename(source, destination);
        },
        rm,
        cp,
      },
    });

    expect(failed).toMatchObject({
      ok: false,
      exitCode: 5,
      diagnostics: [{ code: "LAYOUT_ARTIFACT_PUBLICATION_FAILED" }],
    });
    expect(await readFile(path.join(outputPath, "layout-report.json"), "utf8")).toBe(
      previousReport,
    );
    expect((await readdir(directory)).filter((name) => name.includes("tmp-") || name.includes("backup-"))).toEqual([]);
  });

  it("distinguishes invalid, unsatisfied, budget, and process exits without output", async () => {
    const directory = await createTemporaryDirectory();
    const invalidPath = path.join(directory, "invalid.json");
    await writeFile(invalidPath, "{}", "utf8");
    const unsatisfiedPath = await writeWorld(directory, (spec) => {
      spec.spatial.regions.push({
        id: "far-region",
        kind: "polygon-xz",
        pointsMetersXZ: [[70, 70], [79, 70], [79, 79], [70, 79]],
        semanticClassId: "region.far",
      });
      spec.constraints.placements.push({
        id: "spawn-must-be-far",
        kind: "inside-region",
        requirement: "required",
        entityId: "spawn-main",
        regionId: "far-region",
        boundaryClearanceMeters: 0,
      });
    });

    await expect(layoutSolveFile(invalidPath, path.join(directory, "invalid-out"))).resolves.toMatchObject({ ok: false, exitCode: 2 });
    await expect(layoutSolveFile(unsatisfiedPath, path.join(directory, "unsatisfied-out"))).resolves.toMatchObject({
      ok: false,
      exitCode: 3,
      status: "unsatisfied",
    });
    await expect(layoutValidateFile(path.join(directory, "missing.json"))).resolves.toMatchObject({
      ok: false,
      exitCode: 5,
      diagnostics: [{ code: "CLI_INPUT_UNAVAILABLE" }],
    });
    expect(layoutExitCodeForStatus("invalid-input")).toBe(2);
    expect(layoutExitCodeForStatus("unsatisfied")).toBe(3);
    expect(layoutExitCodeForStatus("budget-exceeded")).toBe(4);
    expect(layoutExitCodeForStatus("solved")).toBe(0);
    await expect(readdir(path.join(directory, "unsatisfied-out"))).rejects.toThrow();
  });

  it("explains one exact Entity or Constraint row from the report only", async () => {
    const directory = await createTemporaryDirectory();
    const inputPath = await writeWorld(directory);
    const outputPath = path.join(directory, "layout");
    const solved = await layoutSolveFile(inputPath, outputPath);
    expect(solved.ok).toBe(true);
    const reportPath = path.join(outputPath, "layout-report.json");

    await expect(layoutExplainFile(reportPath, { entityId: "spawn-main" })).resolves.toMatchObject({
      ok: true,
      kind: "worldkit-layout-explanation",
      selector: { kind: "entity", entityId: "spawn-main" },
      entity: { entityId: "spawn-main", candidateId: expect.any(String) },
    });
    await expect(layoutExplainFile(reportPath, { constraintId: "missing" })).resolves.toMatchObject({
      ok: false,
      exitCode: 2,
      diagnostics: [{ code: "LAYOUT_CONSTRAINT_NOT_FOUND" }],
    });
  });
});
