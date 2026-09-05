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
  it.each([
    "SKILL.md",
    "references/block-whitebox-images.md",
  ])("delivers legacy geographic coverage intent in %s without another gate", async (relativePath) => {
    const instruction = (await readFile(path.resolve(
      ".codex/skills/worldkit-spatial-planner", relativePath,
    ), "utf8")).replace(/\s+/g, " ");
    // Small semantic groups protect dispatch guidance, not one paragraph's wording.
    for (const semantic of [
      /(?:at least|>=) (?:four|4) times .*?(?:reference-visible|visible in the .*?reference).*?area/i,
      /(?:twice|two times).*?width.*?(?:twice|two times).*?depth/i,
      /one continuous .*?world/i,
      /side.*?rear.*?remote/i,
      /empty padding.*?(?:does not|never) count/i,
      /(?:not|never)[^.]*?(?:area|similarity)[^.]*?gate/i,
    ]) expect(semantic.test(instruction), `${relativePath}: ${semantic}`).toBe(true);
  });

  it("keeps legacy coverage in inferred continuation, not user facts or visible evidence", async () => {
    const template = await readFile(path.resolve(
      ".codex/skills/worldkit-spatial-planner/references/scene-brief-template.md",
    ), "utf8");
    const parsed = parseSceneBriefV1(templateFrom(template));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.inferredContinuation).toMatch(/(?:四|4)倍/);
    expect(parsed.value.inferredContinuation).toMatch(/宽.*?(?:两|2)倍.*?深.*?(?:两|2)倍/);
    expect(parsed.value.userFacts).not.toMatch(/四倍|4倍|两倍|2倍/);
    expect(parsed.value.visibleReferenceEvidence).not.toMatch(/四倍|4倍|两倍|2倍/);
    expect(parsed.value.space).toMatch(/侧.*?后.*?远/);
  });

  it("preserves overfull non-subject priority without promoting ordinary decoration", async () => {
    const skill = (await readFile(path.resolve(
      ".codex/skills/worldkit-spatial-planner/SKILL.md",
    ), "utf8")).replace(/\s+/g, " ");
    expect(skill).toMatch(/more .*? than .*?four non-subject slots.*?prioritize.*?(?:person|animal).*?important object.*?primary architectural or natural landmark.*?secondary or repeated formation/i);
    expect(skill).toMatch(/(?:fox|guardian|astronaut).*?标志物/);
    expect(skill).toMatch(/ordinary trees.*?not targets unless/);
    expect(skill).toMatch(/first and only .*?主体.*?counts toward five/);
  });

  it("pins task context and replays the dispatched checker instead of the live checkout", async () => {
    const launcher = await readFile(path.resolve("scripts/agents/run-canonical-world-agent.sh"), "utf8");
    expect(launcher).not.toContain('node "$project_root/.codex/skills/worldkit-spatial-planner/scripts/self-check.mjs"');
    expect(launcher).toContain('--workspace-context-root "$planner_execution_root/workspace"');
    expect(launcher).toContain('scripts/agents/planner-execution.ts replay');
    expect(launcher).toContain('--request-hash "$planner_request_hash"');
  });

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
    const [launcher, skill, blockImageContract, router, cloudRunner, localRunner] = await Promise.all([
      readFile(path.resolve("scripts/agents/run-canonical-world-agent.sh"), "utf8"),
      readFile(path.resolve(".codex/skills/worldkit-spatial-planner/SKILL.md"), "utf8"),
      readFile(path.resolve(
        ".codex/skills/worldkit-spatial-planner/references/block-whitebox-images.md",
      ), "utf8"),
      readFile(path.resolve("scripts/agents/run-codex-task.mjs"), "utf8"),
      readFile(path.resolve("scripts/agents/run-lwdp-codex-task.mjs"), "utf8"),
      readFile(path.resolve("scripts/agents/run-local-codex-task.mjs"), "utf8"),
    ]);
    const plannerPrompt = launcher.split("planner_prompt=")[1]?.split("builder_prompt=")[0] ?? "";
    expect(plannerPrompt).toContain(".codex/skills/worldkit-spatial-planner/SKILL.md");
    expect(plannerPrompt).toContain("unified WorldKit Planner");
    expect(plannerPrompt).not.toContain("packages/authoring/src/spatial-world-plan-v1.ts");
    expect(launcher).toContain("scene-brief.md");
    expect(launcher).toContain("world-plan.png");
    expect(launcher).toContain("entry-whitebox-target.png");
    expect(launcher).toContain("terrain-height-intent-prompt.md");
    expect(launcher).toContain("terrain-height-intent.png");
    expect(launcher).toContain("built-in image generation tool");
    expect(plannerPrompt).toContain("1-5 visual targets");
    expect(plannerPrompt).toContain("standard or custom movement mode");
    expect(plannerPrompt).toContain("four separate provenance sections required by current main");
    expect(plannerPrompt).toContain("Planner does not select Subject Definitions");
    expect(plannerPrompt).toContain("do not use a fixed play-time or perimeter target");
    expect(skill).toContain("one closed output profile");
    expect(skill).toContain("Canonical Source");
    expect(skill).toContain("Babylon Native Source");
    expect(skill).toContain("must not create Height Intent");
    expect(skill).toContain("built-in image generation tool");
    expect(skill).toContain("the image contains only three information layers");
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
    expect(skill).toContain("Babylon Native causal image sequence");
    expect(skill).toContain("Native deterministic palette authoring");
    expect(skill).toContain("scripts/author-palette.mjs");
    expect(skill).toContain("--image-hash sha256:");
    expect(skill).toMatch(/never Host\s+auto-repair/);
    expect(skill).toContain("Pure RGB drift does not need another image-generation call");
    expect(skill).toContain("context/native-block-production-budget.json");
    expect(skill).toContain("Plan a complete coarse Block world inside that capacity");
    expect(skill).toContain("support depth, meaningful side/rear areas and remote destinations");
    expect(skill).toContain("actually open and inspect that exact PNG");
    expect(skill).toContain("exact accepted entry PNG as an image input");
    expect(skill).toContain("the existing World Plan is stale");
    expect(skill).toMatch(/Rerunning the\s+checker alone cannot make a stale World Plan current/);
    expect(skill).toContain("references/block-whitebox-images.md");
    expect(skill).toContain("Block palette coverage is at least 2%");
    expect(skill).toContain("Non-subject scale");
    expect(skill).toContain("They never fail Planner status");
    expect(skill).toContain("opening-absent non-subject remains valid");
    expect(skill).toContain("16:9");
    expect(blockImageContract).toContain("#B7E4C7");
    expect(blockImageContract).toContain("#E85D5D");
    expect(skill).toContain("#8E6CCF");
    expect(skill).toContain("#D9A514");
    expect(skill).toContain("These profiles are not interchangeable");
    expect(blockImageContract).toContain("#D9A514");
    expect(blockImageContract).not.toContain("#8E6CCF");
    expect(blockImageContract).toContain("at least 3% of the image");
    expect(blockImageContract).toContain("0.005% of the image");
    expect(blockImageContract).toContain("advisory Builder feedback only");
    expect(blockImageContract).toContain("never create Runtime, Physics, Collider");
    expect(plannerPrompt).toContain("same bright neutral clear daytime inspection lighting");
    expect(launcher).toContain("finish the Brief first, read the Babylon Native block-whitebox image contract");
    expect(launcher).toContain("exact accepted entry PNG as an image input");
    expect(launcher).toContain("entry edit makes the existing World Plan stale");
    expect(launcher).toContain("World Plan Block palette coverage at least 3%");
    expect(launcher).toContain("each selected target at least max(32 pixels, 0.005%)");
    expect(launcher).toContain("Non-subject entry scale, coherence, and ambiguity are advisory measurements only");
    expect(launcher).toContain("may make a non-subject small, fragmented, or absent");
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
