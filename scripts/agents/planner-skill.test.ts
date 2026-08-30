import { readFile } from "node:fs/promises";
import path from "node:path";

import { parseSceneBriefV1 } from "@whitebox-world/authoring";
import { describe, expect, it } from "vitest";

function templateFrom(markdown: string): string {
  const brief = markdown.match(/```md\r?\n([\s\S]*?)\r?\n```/)?.[1];
  if (brief === undefined) throw new Error("Scene Brief template is missing.");
  return brief;
}

describe("Unified WorldKit Planner skill", () => {
  it("ships a valid natural-language template with movement and bounded visual targets", async () => {
    const template = await readFile(path.resolve(
      ".codex/skills/worldkit-spatial-planner/references/scene-brief-template.md",
    ), "utf8");
    const parsed = parseSceneBriefV1(templateFrom(template));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.movementModes).toEqual([
      expect.objectContaining({ mode: "ground-walk", label: "陆地步行" }),
      expect.objectContaining({ mode: "flight", label: "空中飞行" }),
    ]);
    expect(parsed.value.visualTargets).toHaveLength(2);
    expect(parsed.value.visualTargets[0]?.kind).toBe("subject");
    expect(parsed.value.navigation).toContain("不要求所有浅绿色地面彼此连通");
  });

  it("routes Planner creation and in-job self-repair through the dedicated skill", async () => {
    const [launcher, skill, imageContract, router, cloudRunner, localRunner] = await Promise.all([
      readFile(path.resolve("scripts/agents/run-spatial-world-agent.sh"), "utf8"),
      readFile(path.resolve(".codex/skills/worldkit-spatial-planner/SKILL.md"), "utf8"),
      readFile(path.resolve(".codex/skills/worldkit-spatial-planner/references/block-whitebox-images.md"), "utf8"),
      readFile(path.resolve("scripts/agents/run-codex-task.mjs"), "utf8"),
      readFile(path.resolve("scripts/agents/run-lwdp-codex-task.mjs"), "utf8"),
      readFile(path.resolve("scripts/agents/run-local-codex-task.mjs"), "utf8"),
    ]);
    const plannerPrompt = launcher.split("planner_prompt=")[1]?.split("builder_prompt=")[0] ?? "";
    expect(plannerPrompt).toContain(".codex/skills/worldkit-spatial-planner/SKILL.md");
    expect(plannerPrompt).toContain("unified WorldKit Planner");
    expect(plannerPrompt).not.toContain("packages/authoring/src/spatial-world-plan-v1.ts");
    expect(plannerPrompt).toContain("scene-brief.md");
    expect(plannerPrompt).toContain("world-plan.png");
    expect(plannerPrompt).toContain("entry-whitebox-target.png");
    expect(plannerPrompt).toContain("built-in image generation tool");
    expect(plannerPrompt).toContain("1-5 visual targets");
    expect(plannerPrompt).toContain("one or more standard or custom movement modes");
    expect(plannerPrompt).toContain("four separate provenance sections required by current main");
    expect(plannerPrompt).toContain("Planner does not select Subject Definitions");
    expect(plannerPrompt).toContain("at least four times the geographic area visible");
    expect(plannerPrompt).toContain("discrete-cube block-whitebox renders");
    expect(plannerPrompt).toContain("ground-motion support, collision, interaction, water/cloud semantics");
    expect(skill).toContain("Create exactly three files");
    expect(skill).toContain("built-in image generation tool");
    expect(skill).toContain("discrete-cube rendering");
    expect(skill).toContain("small red spawn-position token");
    expect(skill).toContain("It is not a humanoid, animal");
    expect(skill).toContain("Human review\nowns top-down geography");
    expect(skill).toContain("exact functional block colors");
    expect(skill).toContain("remove every other overlay\nor annotation");
    expect(skill).toContain("generate and inspect `entry-whitebox-target.png`");
    expect(skill).toContain("only then generate\n`world-plan.png`");
    expect(skill).toContain("exact saved entry PNG");
    expect(skill).toContain("Plan exactly one continuous geographic world");
    expect(skill).toContain("at least four\ntimes the geographic area visible");
    expect(skill).not.toContain("multi-panel");
    expect(skill.indexOf("2. Generate `entry-whitebox-target.png` first"))
      .toBeLessThan(skill.indexOf("3. Generate `world-plan.png` second"));
    expect(skill).toContain("meaningful side and rear areas outside the uploaded");
    expect(skill).toContain("slice occupies at most roughly one quarter");
    expect(skill).toContain("current Agent-facing hosted planning stage");
    expect(skill).not.toContain("WorldSpec");
    expect(skill).not.toContain("plan-lock");
    expect(skill).toContain("entry slice");
    expect(skill).toContain("meaningful side and rear areas outside the uploaded");
    expect(skill).toContain("footprint,\nlongitudinal elevation profile, cross-section, thickness");
    expect(skill).toContain("Horizontal strips painted across a flat path are\nnot a staircase");
    expect(skill).toContain("Top-down does not mean heightless");
    expect(skill).toContain("camera-facing mountain slabs");
    expect(skill).toContain("exactly horizontally centered");
    expect(skill).toContain("vertical centerline at 50% width");
    expect(skill).toContain("never diagonally behind it");
    expect(skill).toContain("three-quarter rear view");
    expect(skill).toContain("same neutral clear daytime inspection lighting");
    expect(skill).toContain("Never copy the reference image's time of day");
    expect(skill).toContain("#D9A514");
    expect(skill).toContain("#4E79A7");
    expect(imageContract).toContain("#B7E4C7");
    expect(imageContract).toContain("#00B8A9");
    expect(imageContract).toContain("Air is empty space, not a block");
    expect(imageContract).toContain("The images describe buildable three-dimensional volumes");
    expect(imageContract).toContain("Do not use camera-facing\nslabs");
    expect(imageContract).toContain("Keep the same elevation hierarchy");
    expect(imageContract).toContain("Studio renders the authoritative");
    expect(plannerPrompt).toContain("same bright neutral clear daytime inspection lighting");
    expect(plannerPrompt).toContain("Plan three-dimensional form, not only screen layout");
    expect(plannerPrompt).toContain("A staircase must physically rise or fall");
    expect(plannerPrompt).toContain("stacked block relief and the same elevation hierarchy");
    expect(plannerPrompt).toContain("generate and inspect the 16:9 entry target first");
    expect(plannerPrompt).toContain("exact saved entry target all supplied as inputs");
    expect(plannerPrompt).toContain("exactly one continuous geographic world");
    expect(plannerPrompt).toContain("at least four times the geographic area visible");
    expect(plannerPrompt).not.toContain("multi-panel");
    expect(plannerPrompt).toContain("Flight, swimming, water-surface, and custom free-space domains receive no path");
    expect(launcher).toContain("scripts/visual/write-visual-identity-palette.ts");
    expect(launcher).toContain("worldkit-spatial-planner/scripts/self-check.mjs");
    expect(launcher).toContain("planner-self-check.json");
    expect(skill).toContain("at most three self-repair cycles");
    expect(skill).toContain("never starts a separate Planner Repair Agent");
    expect(launcher).not.toContain("run_cloud_t2i");
    expect(launcher).not.toContain("WORLDKIT_STAGE image-planner");
    expect(launcher).toMatch(/--output "artifacts\/scenes\/\$scene_id\/scene-brief\.md/);
    expect(launcher).toMatch(/--output "apps\/playground\/public\/scene-plans\/\$scene_id\/world-plan\.png/);
    expect(launcher).toMatch(/--output "apps\/playground\/public\/scene-plans\/\$scene_id\/entry-whitebox-target\.png/);
    expect(launcher).not.toContain("planner_repair_prompt");
    expect(launcher).not.toContain("WORLDKIT_PLANNER_REPAIR");
    expect(launcher).toContain("--resume-host-only");
    expect(launcher).toContain("WORLDKIT_HOST_RESUME reuse=planner,builder");
    expect(launcher).toContain("scripts/agents/run-codex-task.mjs");
    expect(router).toContain('new Set(["cloud", "local"])');
    expect(cloudRunner).toContain("Host-provided built-in tools explicitly required by the caller instruction");
    expect(localRunner).toContain("Local isolated workspace protocol");
    expect(localRunner).toContain('"--sandbox", "workspace-write"');
    expect(localRunner).toContain('"--ignore-user-config"');
  });
});
