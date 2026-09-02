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
    expect(parsed.value.movement.mode).toBe("ground-walk");
    expect(parsed.value.movement.label).toBe("陆地步行");
    expect(parsed.value.visualTargets).toHaveLength(2);
    expect(parsed.value.visualTargets[0]?.kind).toBe("subject");
    expect(parsed.value.navigation).toContain("不设计道路或首选路线");
  });

  it("routes Planner creation and in-job self-repair through the dedicated skill", async () => {
    const [launcher, skill, router, cloudRunner, localRunner] = await Promise.all([
      readFile(path.resolve("scripts/agents/run-canonical-world-agent.sh"), "utf8"),
      readFile(path.resolve(".codex/skills/worldkit-spatial-planner/SKILL.md"), "utf8"),
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
    expect(plannerPrompt).toContain("terrain-height-intent-prompt.md");
    expect(plannerPrompt).toContain("terrain-height-intent.png");
    expect(plannerPrompt).toContain("built-in image generation tool");
    expect(plannerPrompt).toContain("1-5 visual targets");
    expect(plannerPrompt).toContain("standard or custom movement mode");
    expect(plannerPrompt).toContain("four separate provenance sections required by current main");
    expect(plannerPrompt).toContain("Planner does not select Subject Definitions");
    expect(plannerPrompt).toContain("do not use a fixed play-time or perimeter target");
    expect(skill).toContain("Create exactly five semantic output files");
    expect(skill).toContain("built-in image generation tool");
    expect(skill).toContain("The image contains only three information layers");
    expect(skill).toContain("initial-subject marker");
    expect(skill).toContain("traversable domain");
    expect(skill).toContain("Remove every other overlay or annotation");
    expect(skill).toContain("Do not infer quality from a fixed duration or perimeter");
    expect(skill).toContain("does not replace the formal World Planner's WorldSpec");
    expect(skill).toContain("entry slice");
    expect(skill).toContain("off-camera exploration areas");
    expect(skill).toContain("exactly horizontally centered");
    expect(skill).toContain("vertical centerline at 50% width");
    expect(skill).toContain("never diagonally behind it");
    expect(skill).toContain("three-quarter rear view");
    expect(skill).toContain("same neutral clear daytime inspection lighting");
    expect(skill).toContain("signed-diverging-blue-gray-orange@1");
    expect(skill).toContain("encoding-style-only");
    expect(skill).toContain("world-plan.png owns orientation and complete-world extent");
    expect(skill).toContain("Never copy the reference image's time of day");
    expect(plannerPrompt).toContain("same bright neutral clear daytime inspection lighting");
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
    expect(launcher).toMatch(/--output "artifacts\/scenes\/\$scene_id\/terrain-height-intent-prompt\.md/);
    expect(launcher).toMatch(/--output "apps\/playground\/public\/scene-plans\/\$scene_id\/terrain-height-intent\.png/);
    expect(launcher).not.toContain("planner_repair_prompt");
    expect(launcher).not.toContain("WORLDKIT_PLANNER_REPAIR");
    expect(launcher).toContain("scripts/agents/run-codex-task.mjs");
    expect(router).toContain('new Set(["cloud", "local"])');
    expect(cloudRunner).toContain("Host-provided built-in tools explicitly required by the caller instruction");
    expect(localRunner).toContain("Local isolated workspace protocol");
    expect(localRunner).toContain('"--sandbox", "workspace-write"');
    expect(localRunner).toContain('"--ignore-user-config"');
  });
});
