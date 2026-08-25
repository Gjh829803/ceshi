import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

function run(command: string, arguments_: readonly string[]) {
  return spawnSync(command, arguments_, { cwd: path.resolve("."), encoding: "utf8" });
}

describe("single-job Planner and Builder self-check bundles", () => {
  it("runs without a repository dependency graph and produces replayable receipts", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "worldkit-agent-self-check-"));
    try {
      const template = await readFile(
        ".codex/skills/worldkit-spatial-planner/references/scene-brief-template.md",
        "utf8",
      );
      const brief = template.match(/```md\n([\s\S]*?)\n```/)?.[1];
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
          kind: "worldkit-scene-brief-implementation-map",
          schemaVersion: 1,
          sceneId: "self-check-scene",
          authoringSpecId: "basic-world",
          mappings: [
            { visualTargetId: "visual-target-1", runtimeEntityIds: ["player"] },
            { visualTargetId: "visual-target-2", runtimeEntityIds: ["tower"] },
          ],
        })),
      ]);
      const imageFixture = run("python3", ["-c", [
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

      const buildBundle = run("node", ["scripts/build-agent-self-check.mjs"]);
      expect(buildBundle.status, buildBundle.stderr || buildBundle.stdout).toBe(0);
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
        validatorVersion: "worldkit-builder-self-check-v4",
        requiresTrustedRouteValidation: false,
      });

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
