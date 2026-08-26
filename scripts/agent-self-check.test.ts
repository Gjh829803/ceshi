import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

function run(command: string, arguments_: readonly string[]) {
  if (process.platform === "win32" && command === "pnpm") {
    const commandPath = execFileSync("where", ["corepack"], { encoding: "utf8" })
      .split(/\r?\n/)
      .find((line) => line.endsWith(".cmd"));
    if (commandPath === undefined) throw new Error("Corepack is unavailable.");
    const launcher = readFileSync(commandPath, "utf8");
    const relativeCliPath = launcher.match(/"%~dp0([^\"]*corepack\.js)"/i)?.[1];
    if (relativeCliPath === undefined) throw new Error("Corepack launcher is invalid.");
    return spawnSync(process.execPath, [
      path.resolve(
        path.dirname(commandPath),
        relativeCliPath.replace(/^[\\/]+/, ""),
      ),
      "pnpm",
      ...arguments_,
    ], {
      cwd: path.resolve("."),
      encoding: "utf8",
    });
  }
  return spawnSync(command, arguments_, { cwd: path.resolve("."), encoding: "utf8" });
}

describe("single-job Planner and Builder self-check bundles", () => {
  it("builds Planner and Builder bundles into explicit temporary output without changing tracked bytes", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "worldkit-agent-bundles-"));
    const bundles = [
      {
        id: "planner",
        relativePath: "worldkit-spatial-planner/scripts/self-check.mjs",
      },
      {
        id: "builder",
        relativePath: "worldkit-canonical-builder/scripts/self-check.mjs",
      },
    ] as const;
    const trackedBytesBefore = new Map(await Promise.all(
      bundles.map(async ({ id, relativePath }) => [
        id,
        await readFile(path.join(".codex/skills", relativePath)),
      ] as const),
    ));
    try {
      const buildBundle = run("node", [
        "scripts/build-agent-self-check.mjs",
        "--out-root",
        root,
      ]);

      expect(buildBundle.status, buildBundle.stderr || buildBundle.stdout).toBe(0);
      for (const { id, relativePath } of bundles) {
        expect(await readFile(path.join(root, relativePath))).toEqual(
          trackedBytesBefore.get(id),
        );
        expect(await readFile(path.join(".codex/skills", relativePath))).toEqual(
          trackedBytesBefore.get(id),
        );
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);

  it("runs without a repository dependency graph and produces replayable receipts", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "worldkit-agent-self-check-"));
    try {
      const template = await readFile(
        ".codex/skills/worldkit-spatial-planner/references/scene-brief-template.md",
        "utf8",
      );
      const brief = template.match(/```md\r?\n([\s\S]*?)\r?\n```/)?.[1];
      if (brief === undefined) throw new Error("Scene Brief fixture is missing.");
      const briefPath = path.join(root, "scene-brief.md");
      const worldPath = path.join(root, "authoring.json");
      const mapPath = path.join(root, "implementation-map.draft.json");
      const worldPlanPath = path.join(root, "world-plan.png");
      const entryPath = path.join(root, "entry-whitebox-target.png");
      const world = JSON.parse(
        await readFile("examples/authoring/basic-world.json", "utf8"),
      );
      world.schemaVersion = 4;
      world.spatial.traversalAreas = [];
      world.constraints.connectivity = [];
      const terrain = world.nodes.find((node: any) => node.kind === "terrain");
      if (terrain?.components?.terrain?.source?.kind !== "procedural") {
        throw new Error("Ground-spawn terrain fixture is missing.");
      }
      terrain.components.terrain.source.relief = "flat";
      terrain.components.terrain.source.baseHeightMeters = 0;
      terrain.components.terrain.source.amplitudeMeters = 0;
      await Promise.all([
        writeFile(briefPath, brief),
        writeFile(worldPath, JSON.stringify(world)),
        writeFile(mapPath, JSON.stringify({
          kind: "worldkit-scene-brief-implementation-map-draft",
          schemaVersion: 1,
          sceneId: "self-check-scene",
          authoringSpecId: "basic-world",
          visualTargetMappings: [
            { visualTargetId: "visual-target-1", runtimeEntityIds: ["player"] },
            { visualTargetId: "visual-target-2", runtimeEntityIds: ["tower"] },
          ],
        })),
      ]);
      const imageFixture = run(process.platform === "win32" ? "python" : "python3", ["-c", [
        "from PIL import Image, ImageDraw",
        "import sys",
        "world=Image.new('RGB',(100,100),'white'); world.save(sys.argv[1])",
        "entry=Image.new('RGB',(100,100),'white')",
        "ImageDraw.Draw(entry).rectangle((43,25,56,90),fill='#E85D5D')",
        "entry.save(sys.argv[2])",
      ].join("\n"), worldPlanPath, entryPath]);
      expect(imageFixture.status, imageFixture.stderr).toBe(0);

      const plannerReport = path.join(root, "planner-self-check.json");
      const planner = run("node", [
        ".codex/skills/worldkit-spatial-planner/scripts/self-check.mjs",
        "--scene-id", "self-check-scene",
        "--brief", briefPath,
        "--world-plan", worldPlanPath,
        "--entry", entryPath,
        "--report", plannerReport,
      ]);
      expect(planner.status, planner.stderr || planner.stdout).toBe(0);
      expect(JSON.parse(await readFile(plannerReport, "utf8"))).toMatchObject({ status: "passed" });

      const hostReport = path.join(root, "builder-host.json");
      const agentReport = path.join(root, "builder-agent.json");
      const common = [
        "--scene-id", "self-check-scene",
        "--brief", briefPath,
        "--world", worldPath,
        "--map-draft", mapPath,
      ];
      const host = run("pnpm", ["exec", "tsx", "scripts/agent-builder-self-check.ts", ...common, "--report", hostReport]);
      const agent = run("node", [".codex/skills/worldkit-canonical-builder/scripts/self-check.mjs", ...common, "--report", agentReport]);
      expect(host.status, host.stderr || host.stdout).toBe(0);
      expect(agent.status, agent.stderr || agent.stdout).toBe(0);
      expect(await readFile(agentReport, "utf8")).toBe(await readFile(hostReport, "utf8"));
      expect(JSON.parse(await readFile(agentReport, "utf8"))).toMatchObject({
        validatorVersion: "worldkit-builder-self-check-v6",
        requiresTrustedRouteValidation: false,
        terrainScaleEvidence: {
          terrainEntityId: "terrain-main",
          operationalProfile: "ordinary-single-heightfield-v1",
        },
        routeBuildWindowEvidence: [],
      });

      await writeFile(mapPath, JSON.stringify({
        kind: "worldkit-scene-brief-implementation-map",
        schemaVersion: 1,
        sceneId: "self-check-scene",
        authoringSpecId: "basic-world",
        mappings: [
          { visualTargetId: "visual-target-1", runtimeEntityIds: ["player"] },
          { visualTargetId: "visual-target-2", runtimeEntityIds: ["tower"] },
        ],
      }));
      const legacyReport = path.join(root, "builder-legacy-map.json");
      const legacy = run("pnpm", ["exec", "tsx", "scripts/agent-builder-self-check.ts", ...common, "--report", legacyReport]);
      expect(legacy.status).toBe(2);
      expect(JSON.parse(await readFile(legacyReport, "utf8"))).toMatchObject({
        status: "failed",
        diagnostics: expect.arrayContaining([
          expect.objectContaining({ code: "HOSTED_VISUAL_DRAFT_KIND_INVALID" }),
          expect.objectContaining({ code: "HOSTED_VISUAL_UNKNOWN_FIELD" }),
        ]),
      });
      await writeFile(mapPath, JSON.stringify({
        kind: "worldkit-scene-brief-implementation-map-draft",
        schemaVersion: 1,
        sceneId: "self-check-scene",
        authoringSpecId: "basic-world",
        visualTargetMappings: [
          { visualTargetId: "visual-target-1", runtimeEntityIds: ["player"] },
          { visualTargetId: "visual-target-2", runtimeEntityIds: ["tower"] },
        ],
      }));

      world.world.environment.preset = "night";
      await writeFile(worldPath, JSON.stringify(world));
      const nightReport = path.join(root, "builder-night.json");
      const night = run("pnpm", ["exec", "tsx", "scripts/agent-builder-self-check.ts", ...common, "--report", nightReport]);
      expect(night.status).toBe(2);
      expect(JSON.parse(await readFile(nightReport, "utf8"))).toMatchObject({
        status: "failed",
        diagnostics: expect.arrayContaining([
          expect.objectContaining({ code: "WHITEBOX_LIGHTING_PRESET_INVALID" }),
        ]),
      });

      world.world.environment.preset = "clear-day";
      const spawn = world.nodes.find((node: any) => node.kind === "anchor" && node.id === "spawn-main");
      if (spawn?.placement?.kind !== "fixed") throw new Error("Ground-spawn fixture is missing.");
      spawn.placement.transform.positionMetersXYZ[1] += 5;
      await writeFile(worldPath, JSON.stringify(world));
      const raisedReport = path.join(root, "builder-raised-spawn.json");
      const raised = run("pnpm", ["exec", "tsx", "scripts/agent-builder-self-check.ts", ...common, "--report", raisedReport]);
      expect(raised.status).toBe(2);
      expect(JSON.parse(await readFile(raisedReport, "utf8"))).toMatchObject({
        status: "failed",
        diagnostics: expect.arrayContaining([
          expect.objectContaining({
            code: "SPAWN_ABOVE_GROUND",
            details: expect.objectContaining({ requiredSubjectOriginYMeters: expect.any(Number) }),
          }),
        ]),
      });

      spawn.placement.transform.positionMetersXYZ[1] = -5;
      await writeFile(worldPath, JSON.stringify(world));
      const buriedReport = path.join(root, "builder-buried-spawn.json");
      const buried = run("pnpm", ["exec", "tsx", "scripts/agent-builder-self-check.ts", ...common, "--report", buriedReport]);
      expect(buried.status).toBe(2);
      expect(JSON.parse(await readFile(buriedReport, "utf8"))).toMatchObject({
        status: "failed",
        diagnostics: expect.arrayContaining([
          expect.objectContaining({ code: "SPAWN_BELOW_GROUND" }),
        ]),
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);
});
