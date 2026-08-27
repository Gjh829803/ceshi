import { execFile } from "node:child_process";
import {
  access,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import {
  parseAuthoringSpecV4,
  type AuthoringSpecV4,
} from "@whitebox-world/authoring";
import { stringifyCanonicalJson } from "@whitebox-world/protocol";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";

import { createValidAuthoringSpec } from "@whitebox-world/authoring/testing";

const execFileAsync = promisify(execFile);
const temporaryDirectories: string[] = [];

function cliAuthoringSpec(): AuthoringSpecV4 {
  const source = createValidAuthoringSpec();
  return {
    ...source,
    world: {
      ...source.world,
      bounds: {
        ...source.world.bounds,
        centerMetersXZ: [0, 0] as const,
        sizeMetersXZ: [4, 4] as const,
        heightRangeMeters: [-4, 8] as const,
      },
    },
    spatial: {
      ...source.spatial,
      regions: [{
        id: "spawn-region",
        kind: "polygon-xz" as const,
        pointsMetersXZ: [[-1, 1], [1, 1], [1, 2], [-1, 2]] as const,
        semanticClassId: "region.spawn",
      }],
    },
    nodes: source.nodes
      .filter((node) => node.kind !== "water")
      .map((node) => {
        if (node.kind === "terrain") {
          return {
            ...node,
            components: {
              terrain: {
                ...node.components.terrain,
                source: { ...node.components.terrain.source, baseHeightMeters: 0 },
                grid: {
                  centerMetersXZ: [0, 0] as const,
                  sizeMetersXZ: [4, 4] as const,
                  resolutionCellsXZ: [5, 5] as const,
                },
              },
            },
          };
        }
        if (node.kind === "anchor" && node.id === "spawn-main") {
          return {
            ...node,
            placement: {
              kind: "fixed" as const,
              transform: { positionMetersXYZ: [0, 0, 1.5] as const },
            },
          };
        }
        return node;
      }),
    constraints: {
      connectivity: [],
      placements: [{
        id: "spawn-inside",
        kind: "inside-region" as const,
        requirement: "required" as const,
        entityId: "spawn-main",
        regionId: "spawn-region",
        boundaryClearanceMeters: 0,
      }],
    },
  };
}

async function fixture(): Promise<{
  readonly directory: string;
  readonly imagePath: string;
  readonly authoringPath: string;
  readonly outputAuthoringPath: string;
  readonly reportPath: string;
}> {
  const directory = await mkdtemp(path.join(tmpdir(), "terrain-intent-cli-"));
  temporaryDirectories.push(directory);
  const imagePath = path.join(directory, "intent.png");
  const authoringPath = path.join(directory, "world.json");
  const outputAuthoringPath = path.join(directory, "world.compiled.json");
  const reportPath = path.join(directory, "terrain-report.json");
  const png = await sharp(new Uint8Array(5 * 5 * 3).fill(128), {
    raw: { width: 5, height: 5, channels: 3 },
  }).png().toBuffer();
  await writeFile(imagePath, png);
  await writeFile(
    authoringPath,
    `${stringifyCanonicalJson(cliAuthoringSpec())}\n`,
    "utf8",
  );
  return { directory, imagePath, authoringPath, outputAuthoringPath, reportPath };
}

async function runCli(args: readonly string[]): Promise<{
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}> {
  try {
    const result = await execFileAsync("pnpm", ["terrain:intent:compile", "--", ...args], {
      cwd: process.cwd(),
      env: { ...process.env, NO_COLOR: "1" },
      maxBuffer: 4 * 1024 * 1024,
    });
    return { exitCode: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const failure = error as Error & { code?: number; stdout?: string; stderr?: string };
    return {
      exitCode: typeof failure.code === "number" ? failure.code : 1,
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? "",
    };
  }
}

function validArgs(fixtureValue: Awaited<ReturnType<typeof fixture>>): string[] {
  return [
    "--image", fixtureValue.imagePath,
    "--authoring", fixtureValue.authoringPath,
    "--output-authoring", fixtureValue.outputAuthoringPath,
    "--report", fixtureValue.reportPath,
  ];
}

async function expectMissing(filePath: string): Promise<void> {
  await expect(access(filePath)).rejects.toThrow();
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("terrain:intent:compile CLI", { timeout: 30_000 }, () => {
  it("publishes canonical compiled Authoring first and the passing report last", async () => {
    const paths = await fixture();

    const result = await runCli(validArgs(paths));

    expect(result.exitCode, result.stderr).toBe(0);
    expect(parseAuthoringSpecV4(await readFile(paths.outputAuthoringPath, "utf8"))).toMatchObject({
      ok: true,
    });
    const report = JSON.parse(await readFile(paths.reportPath, "utf8")) as {
      status?: unknown;
      outputAuthoringSpecHash?: unknown;
    };
    expect(report).toMatchObject({
      status: "passed",
      outputAuthoringSpecHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
    });
    expect((await readFile(paths.outputAuthoringPath, "utf8")).endsWith("\n")).toBe(true);
    expect((await readFile(paths.reportPath, "utf8")).endsWith("\n")).toBe(true);
    expect((await readdir(paths.directory)).some((name) => name.includes(".worldkit-"))).toBe(false);
  });

  it("rejects missing arguments and relative paths", async () => {
    expect((await runCli([])).exitCode).toBe(1);
    const paths = await fixture();
    const args = validArgs(paths);
    args[1] = "intent.png";

    expect((await runCli(args)).exitCode).toBe(1);
    await expectMissing(paths.outputAuthoringPath);
    await expectMissing(paths.reportPath);
  });

  it("rejects symbolic-link inputs", async () => {
    const paths = await fixture();
    const aliasPath = path.join(paths.directory, "intent-alias.png");
    await symlink(paths.imagePath, aliasPath);
    const args = validArgs(paths);
    args[1] = aliasPath;

    expect((await runCli(args)).exitCode).toBe(1);
    await expectMissing(paths.outputAuthoringPath);
    await expectMissing(paths.reportPath);
  });

  it("preserves existing output without --force and replaces both outputs with --force", async () => {
    const paths = await fixture();
    await writeFile(paths.outputAuthoringPath, "old-authoring", "utf8");
    await writeFile(paths.reportPath, "old-report", "utf8");

    expect((await runCli(validArgs(paths))).exitCode).toBe(1);
    expect(await readFile(paths.outputAuthoringPath, "utf8")).toBe("old-authoring");
    expect(await readFile(paths.reportPath, "utf8")).toBe("old-report");

    expect((await runCli([...validArgs(paths), "--force"])).exitCode).toBe(0);
    expect(parseAuthoringSpecV4(await readFile(paths.outputAuthoringPath, "utf8"))).toMatchObject({
      ok: true,
    });
    expect(JSON.parse(await readFile(paths.reportPath, "utf8"))).toMatchObject({ status: "passed" });
  });

  it.each(["malformed-png", "invalid-authoring"] as const)(
    "does not partially publish %s failures",
    async (failureKind) => {
      const paths = await fixture();
      if (failureKind === "malformed-png") {
        await writeFile(paths.imagePath, "not a png", "utf8");
      } else {
        await writeFile(paths.authoringPath, "{}\n", "utf8");
      }

      expect((await runCli(validArgs(paths))).exitCode).toBe(1);
      await expectMissing(paths.outputAuthoringPath);
      await expectMissing(paths.reportPath);
    },
  );

  it("does not publish either output for blocking terrain diagnostics", async () => {
    const paths = await fixture();
    const spec = cliAuthoringSpec();
    const terrain = spec.nodes.find((node) => node.kind === "terrain");
    if (terrain?.kind !== "terrain") throw new Error("TEST_TERRAIN_MISSING");
    delete terrain.components.terrain.source.baseHeightMeters;
    await writeFile(paths.authoringPath, `${stringifyCanonicalJson(spec)}\n`, "utf8");

    const result = await runCli(validArgs(paths));

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("TERRAIN_INTENT_BASE_HEIGHT_REQUIRED");
    await expectMissing(paths.outputAuthoringPath);
    await expectMissing(paths.reportPath);
  });
});
