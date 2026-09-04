import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { runBlockBuilderSelfCheck } from "./agent-block-builder-self-check.js";
import { verifyBlockBuilderHostResume } from "./verify-block-builder-host-resume.js";
import { createAgentAuthoringCatalogV2 } from "../lib/agent-authoring-catalog.js";

const BRIEF = `# WorldKit Scene Brief

## 场景
明亮白天的东方山谷，远处有完整宫殿。

## 主体
普通人形旅人。

## 用户事实
用户要求一个可操作的方块白模世界。

## 可见参考证据
画面可见开阔地面、岩石和远处宫殿。

## 推断的世界延伸
画外区域延伸为连通山谷。

## 仅视觉层设想
材质和细节属于后续渲染。

## 运动模式
- 陆地步行：主体在连续地面上行走。

## 空间
入口、中段花园与远端宫殿形成完整探索空间。

## 通行
开阔地面整体连通，不额外制造路线。

## 首帧
严格居中的第三人称背后视角。

## 视觉目标
- 主体｜旅人：完整受控人形主体
- 标志物｜宫殿：完整宫殿作为一个目标
`;

function paths(root: string, suffix: string) {
  return {
    sceneId: "basic-block-world",
    briefPath: path.join(root, "scene-brief.md"),
    worldModulePath: path.resolve("examples/block-world/basic-world.mjs"),
    authoringOutputPath: path.join(root, `authoring-${suffix}.json`),
    mapDraftOutputPath: path.join(root, `map-${suffix}.json`),
    reportPath: path.join(root, `report-${suffix}.json`),
  };
}

describe("Block Builder skill", () => {
  it("uses the Host-owned Canonical build artifact producer", async () => {
    const launcher = await readFile(
      "scripts/agents/run-spatial-world-agent.sh",
      "utf8",
    );
    expect(launcher).toContain("scripts/cli/build-world-artifact.ts");
    expect(launcher).not.toMatch(/worldkit build .*world\.build\.json/s);
    expect(launcher.match(
      /env -u WORLDKIT_CAPTURE_SIGNING_PRIVATE_KEY_PATH/g,
    )).toHaveLength(2);
  });

  it("constructs the real Planner and Builder prompts without shell command substitution", async () => {
    const launcherPath = path.resolve("scripts/agents/run-spatial-world-agent.sh");
    const launcher = await readFile(launcherPath, "utf8");
    const builderPromptSource = launcher.split('builder_prompt="')[1]
      ?.split('if [[ "${WORLDKIT_PROMPT_INIT_SMOKE:-0}"')[0] ?? "";
    expect(builderPromptSource).not.toMatch(/`|\$\(/);

    const result = spawnSync("bash", [
      launcherPath,
      "--",
      "--scene-id",
      "prompt-init-smoke",
      "Construct prompts without starting an external task.",
    ], {
      cwd: path.resolve("."),
      encoding: "utf8",
      env: { ...process.env, WORLDKIT_PROMPT_INIT_SMOKE: "1" },
    });
    expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(result.stdout).toMatch(
      /WORLDKIT_PROMPT_INIT_SMOKE_OK planner_chars=[1-9][0-9]+ builder_chars=[1-9][0-9]+/,
    );
  });

  it("makes registered Subject reuse the default and limits composition to locomotion", async () => {
    const [skill, subjectGuide, launcher] = await Promise.all([
      readFile(".codex/skills/worldkit-block-builder/SKILL.md", "utf8"),
      readFile(
        ".codex/skills/worldkit-block-builder/references/subject-camera.md",
        "utf8",
      ),
      readFile("scripts/agents/run-spatial-world-agent.sh", "utf8"),
    ]);

    for (const source of [skill, subjectGuide, launcher]) {
      expect(source).toMatch(/movement(?:-| )mode/);
      expect(source).toContain("body topology");
      expect(source).toContain("registered Subject");
      expect(source).toContain("weapons");
      expect(source).toContain("backpacks");
    }
    expect(skill).toContain("A coarse registered proxy is correct");
    expect(skill).toContain("movement-changing controlled whole");
    expect(subjectGuide).toContain("Select for behavior, not likeness");
    expect(subjectGuide).toContain("Do not compose merely because");
    expect(launcher).toContain(
      "Correct movement and strict centered rear Camera framing are more important",
    );
  });

  it("gives Studio, Prompt, and Skill one compiler-admitted Agent Authoring Catalog", async () => {
    const catalogPath = ".codex/skills/worldkit-block-builder/references/agent-authoring-catalog.json";
    const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
    expect(catalog).toEqual(createAgentAuthoringCatalogV2());
    const refs = catalog.subjectPacks.map(({ subjectDefinitionRef }: {
      subjectDefinitionRef: string;
    }) => subjectDefinitionRef);
    expect(refs).toContain("worldkit://subject-definition/humanoid.g-bot@2");
    expect(refs).toContain("worldkit://subject-definition/xier120.quadruped-animal@1");
    expect(refs).not.toContain(
      "worldkit://subject-definition/humanoid.rigged-golden@2",
    );
    expect(refs).not.toContain("worldkit://subject-definition/humanoid.third-person@1");
    expect(refs).not.toContain(
      "worldkit://subject-definition/quadruped.ground-proxy@1",
    );
    expect(refs).toContain(
      "worldkit://subject-definition/animal.quadruped.forward-steer@1",
    );
    expect(catalog.unavailableSubjectPacks).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        subjectDefinitionRef: "worldkit://subject-definition/humanoid.third-person@1",
      }),
      expect.objectContaining({
        subjectDefinitionRef: "worldkit://subject-definition/humanoid.rigged-golden@2",
      }),
      expect.objectContaining({
        subjectDefinitionRef: "worldkit://subject-definition/quadruped.ground-proxy@1",
      }),
    ]));
    expect(catalog.subjectPacks.every(({ compatibleMotionPackIds }: {
      compatibleMotionPackIds: readonly string[];
    }) => compatibleMotionPackIds.length > 0)).toBe(true);
    expect(catalog.motionPacks.map(({ id }: { id: string }) => id)).toEqual([
      "flight.powered-standard",
      "ground.character-standard",
      "ground.root-standard",
    ]);
    expect(catalog.cameraPacks.map(({ id }: { id: string }) => id)).toEqual([
      "first-person.standard",
      "third-person.giant",
      "third-person.over-shoulder",
      "third-person.standard",
    ]);
    expect(catalog.surfacePacks.map(({ id, whiteboxColorHex }: {
      id: string;
      whiteboxColorHex: string;
    }) => ({ id, whiteboxColorHex }))).toEqual([
      { id: "normal", whiteboxColorHex: "#B7E4C7" },
      { id: "ice", whiteboxColorHex: "#BDEBFF" },
      { id: "mud", whiteboxColorHex: "#9C7653" },
    ]);
    expect(catalog.subjectPacks.find(({ subjectDefinitionRef }: {
      subjectDefinitionRef: string;
    }) => subjectDefinitionRef ===
      "worldkit://subject-definition/xier120.aerial-seated@1"
    )?.traversalEnvelope).toMatchObject({
      clearanceHeightMeters: 3.6,
      footprintRadiusMetersXZ: 1,
    });
  });

  it("requires volumetric terrain and real elevation-changing stairs", async () => {
    const [skill, blockApi, launcher] = await Promise.all([
      readFile(".codex/skills/worldkit-block-builder/SKILL.md", "utf8"),
      readFile(
        ".codex/skills/worldkit-block-builder/references/block-api.md",
        "utf8",
      ),
      readFile("scripts/agents/run-spatial-world-agent.sh", "utf8"),
    ]);

    expect(skill).toContain("Three-dimensional fidelity is a required outcome");
    expect(skill).toContain("plan footprint, longitudinal profile,\n  cross-section");
    expect(skill).toContain("A matching opening-frame silhouette is insufficient");
    expect(skill).toContain("A visible staircase is real connected elevation geometry");
    expect(skill).toContain("camera-facing mountain walls");
    expect(blockApi).toContain("## Volumetric reconstruction");
    expect(blockApi).toContain("footprint: occupied area");
    expect(blockApi).toContain("longitudinal profile: how height changes");
    expect(blockApi).toContain("cross-section: width");
    expect(blockApi).toContain("Do not paint bands\nonto level support to suggest steps");
    expect(launcher).toContain("Three-dimensional fidelity is a required outcome");
    expect(launcher).toContain("Every visible staircase must connect its real lower and upper levels");
  });

  it("requires Builder to inspect Skill-rendered Planner comparisons", async () => {
    const [skill, launcher, visualReviewBundle] = await Promise.all([
      readFile(".codex/skills/worldkit-block-builder/SKILL.md", "utf8"),
      readFile("scripts/agents/run-spatial-world-agent.sh", "utf8"),
      readFile(
        ".codex/skills/worldkit-block-builder/scripts/render-visual-review.mjs",
      ),
    ]);
    expect(visualReviewBundle.byteLength).toBeGreaterThan(1_000);
    expect(skill).toContain("render-visual-review.mjs");
    expect(skill).toContain("Planner intent is on the left");
    expect(skill).toContain("Actually open and inspect both PNGs");
    expect(skill).toContain("not an automatic visual-similarity Gate");
    expect(launcher).toContain("builder-top-down-comparison.png");
    expect(launcher).toContain("builder-entry-comparison.png");
    expect(launcher).toContain("agent-block-builder-visual-review.ts");
    expect(launcher).toContain("compares exact decoded RGBA pixels");
    expect(launcher).toContain("verify-png-raster-equality.ts");
  });

  it("derives connected-ground policy from the complete movement-mode set", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "block-builder-hybrid-movement-"));
    const hybridBrief = BRIEF.replace(
      "- 陆地步行：主体在连续地面上行走。",
      "- 陆地步行：主体在地面上行走。\n- 空中飞行：主体可以离开地面自由飞行。",
    );
    const worldPath = path.join(root, "world.mjs");
    const worldSource = await readFile("examples/block-world/basic-world.mjs", "utf8");
    await Promise.all([
      writeFile(path.join(root, "scene-brief.md"), hybridBrief, "utf8"),
      writeFile(worldPath, worldSource, "utf8"),
    ]);
    const mismatched = await runBlockBuilderSelfCheck({
      ...paths(root, "mismatched"),
      worldModulePath: worldPath,
    });
    expect(mismatched.diagnostics.map(({ code }) => code)).toContain(
      "BLOCK_WORLD_GROUND_CONNECTIVITY_POLICY_MISMATCH",
    );

    await writeFile(
      worldPath,
      worldSource.replace(
        "requireSingleReachableComponent: true",
        "requireSingleReachableComponent: false",
      ),
      "utf8",
    );
    const capabilityMismatch = await runBlockBuilderSelfCheck({
      ...paths(root, "matched"),
      worldModulePath: worldPath,
    });
    expect(capabilityMismatch.status).toBe("failed");
    expect(capabilityMismatch.diagnostics.map(({ code }) => code)).toContain(
      "BLOCK_WORLD_SUBJECT_MOVEMENT_UNSATISFIED",
    );
  });

  it("rejects an Agent-authored traversal envelope smaller than the Runtime Subject collider", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "block-builder-subject-envelope-"));
    const source = await readFile("examples/block-world/basic-world.mjs", "utf8");
    const worldPath = path.join(root, "world.mjs");
    await Promise.all([
      writeFile(path.join(root, "scene-brief.md"), BRIEF, "utf8"),
      writeFile(
        worldPath,
        source.replace(
          "worldkit://subject-definition/humanoid.g-bot@2",
          "worldkit://subject-definition/xier120.aerial-seated@1",
        ),
        "utf8",
      ),
    ]);
    const result = await runBlockBuilderSelfCheck({
      ...paths(root, "envelope"),
      worldModulePath: worldPath,
    });
    expect(result.status).toBe("failed");
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "BLOCK_WORLD_SUBJECT_TRAVERSAL_ENVELOPE_MISMATCH",
      details: expect.objectContaining({
        expected: expect.objectContaining({
          clearanceHeightMeters: 3.6,
          footprintRadiusMetersXZ: 1,
        }),
      }),
    }));
  });

  it("rejects the primitive humanoid proxy as an ordinary Hosted Subject", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "block-builder-primitive-human-"));
    const source = await readFile("examples/block-world/basic-world.mjs", "utf8");
    const worldPath = path.join(root, "world.mjs");
    await Promise.all([
      writeFile(path.join(root, "scene-brief.md"), BRIEF, "utf8"),
      writeFile(
        worldPath,
        source.replace(
          "worldkit://subject-definition/humanoid.g-bot@2",
          "worldkit://subject-definition/humanoid.third-person@1",
        ),
        "utf8",
      ),
    ]);
    const result = await runBlockBuilderSelfCheck({
      ...paths(root, "primitive-human"),
      worldModulePath: worldPath,
    });
    expect(result.status).toBe("failed");
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "BLOCK_WORLD_SUBJECT_NOT_HOSTED_AUTHORING_ADMITTED",
      instancePath: "/controlledSubject/subjectDefinitionRef",
      details: expect.objectContaining({
        subjectDefinitionRef: "worldkit://subject-definition/humanoid.third-person@1",
        rejectionDiagnostics: [],
      }),
    }));
  });

  it("requires semantic middle/remote anchors and an entry traversal band for ground-only worlds", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "block-builder-navigation-contract-"));
    const source = await readFile("examples/block-world/basic-world.mjs", "utf8");
    const missingMiddlePath = path.join(root, "missing-middle.mjs");
    const missingBandPath = path.join(root, "missing-band.mjs");
    await Promise.all([
      writeFile(path.join(root, "scene-brief.md"), BRIEF, "utf8"),
      writeFile(
        missingMiddlePath,
        source.replace('navigationRole: "middle"', 'navigationRole: "remote"'),
        "utf8",
      ),
      writeFile(
        missingBandPath,
        source.replace(
          "requiredGroundTraversalBands: [{",
          "ignoredGroundTraversalBands: [{",
        ),
        "utf8",
      ),
    ]);

    const missingMiddle = await runBlockBuilderSelfCheck({
      ...paths(root, "missing-middle"),
      worldModulePath: missingMiddlePath,
    });
    expect(missingMiddle.diagnostics.map(({ code }) => code)).toContain(
      "BLOCK_WORLD_NAVIGATION_TARGET_ROLE_MISSING",
    );

    const missingBand = await runBlockBuilderSelfCheck({
      ...paths(root, "missing-band"),
      worldModulePath: missingBandPath,
    });
    expect(missingBand.diagnostics.map(({ code }) => code)).toContain(
      "BLOCK_WORLD_ENTRY_TRAVERSAL_BAND_MISSING",
    );
  });

  it("ships a replayable checker for one direct Three.js module", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "block-builder-skill-"));
    await writeFile(path.join(root, "scene-brief.md"), BRIEF, "utf8");
    const host = paths(root, "host");
    const portableBundle = path.join(root, "self-check.mjs");
    const portableWorld = path.join(root, "world.mjs");
    await Promise.all([
      copyFile(
        ".codex/skills/worldkit-block-builder/scripts/self-check.mjs",
        portableBundle,
      ),
      copyFile("examples/block-world/basic-world.mjs", portableWorld),
    ]);
    const agent = { ...paths(root, "agent"), worldModulePath: portableWorld };
    expect((await runBlockBuilderSelfCheck(host)).status).toBe("passed");
    const run = spawnSync(process.execPath, [
      portableBundle,
      "--scene-id", agent.sceneId,
      "--brief", agent.briefPath,
      "--world", agent.worldModulePath,
      "--authoring-output", agent.authoringOutputPath,
      "--map-draft-output", agent.mapDraftOutputPath,
      "--report", agent.reportPath,
    ], { cwd: root, encoding: "utf8" });
    expect(run.status, run.stderr || run.stdout).toBe(0);
    expect(run.stderr).toBe("");
    const outputLines = run.stdout.trim().split("\n");
    expect(outputLines).toHaveLength(1);
    expect(JSON.parse(outputLines[0]!)).toMatchObject({ status: "passed" });
    expect(await readFile(agent.reportPath, "utf8")).toBe(
      await readFile(host.reportPath, "utf8"),
    );
    expect(await readFile(agent.authoringOutputPath, "utf8")).toBe(
      await readFile(host.authoringOutputPath, "utf8"),
    );
    expect(await readFile(agent.mapDraftOutputPath, "utf8")).toBe(
      await readFile(host.mapDraftOutputPath, "utf8"),
    );
  }, 30_000);

  it("fails when the Brief declares a complete target absent from world.mjs", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "block-builder-target-"));
    await writeFile(
      path.join(root, "scene-brief.md"),
      BRIEF.replace(
        "- 标志物｜宫殿：完整宫殿作为一个目标",
        "- 标志物｜宫殿：完整宫殿作为一个目标\n- 标志物｜高塔：完整高塔作为一个目标",
      ),
      "utf8",
    );
    const result = await runBlockBuilderSelfCheck(paths(root, "failed"));
    expect(result.status).toBe("failed");
    expect(result.diagnostics.map(({ code }) => code)).toContain(
      "BLOCK_WORLD_VISUAL_TARGET_MISSING",
    );
  });

  it("rejects a complete target whose landmark blocks drift from the Planner color", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "block-builder-color-"));
    const worldPath = path.join(root, "world.mjs");
    await Promise.all([
      writeFile(path.join(root, "scene-brief.md"), BRIEF, "utf8"),
      readFile("examples/block-world/basic-world.mjs", "utf8").then((source) =>
        writeFile(
          worldPath,
          source.replaceAll("landmarkOrange", "landmarkPink"),
          "utf8",
        )),
    ]);
    const result = await runBlockBuilderSelfCheck({
      ...paths(root, "wrong-color"),
      worldModulePath: worldPath,
    });
    expect(result.status).toBe("failed");
    expect(result.diagnostics.map(({ code }) => code)).toContain(
      "BLOCK_WORLD_VISUAL_TARGET_COLOR_MISMATCH",
    );
  });

  it("reports a compact reference-faithful world without enforcing a numeric extent", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "block-builder-small-world-"));
    const worldPath = path.join(root, "world.mjs");
    const source = (await readFile("examples/block-world/basic-world.mjs", "utf8"))
      .replace("for (let z = -96; z < 96; z += 1)", "for (let z = -4; z <= 4; z += 1)")
      .replace("for (let x = -96; x < 96; x += 1)", "for (let x = -4; x <= 4; x += 1)")
      .replaceAll("[64, 1, -64]", "[3, 1, -3]")
      .replaceAll("[64, 2, -64]", "[3, 2, -3]")
      .replaceAll("[16, 0.5, -16]", "[1, 0.5, -1]")
      .replaceAll("[32, 0.5, -32]", "[2, 0.5, -2]")
      .replace("[80, 0.5, -80]", "[4, 0.5, -4]");
    await Promise.all([
      writeFile(path.join(root, "scene-brief.md"), BRIEF, "utf8"),
      writeFile(worldPath, source, "utf8"),
    ]);
    const result = await runBlockBuilderSelfCheck({
      ...paths(root, "small"),
      worldModulePath: worldPath,
    });
    expect(result.status).toBe("passed");
    const report = JSON.parse(await readFile(path.join(root, "report-small.json"), "utf8"));
    expect(report.observations).toMatchObject({
      blockWorldMetrics: {
        maximumReachableDistanceMeters: expect.any(Number),
        reachableChunkCount: expect.any(Number),
      },
      authoredSpatialMetrics: {
        maximumHorizontalSpanMeters: expect.any(Number),
        chunkCount: expect.any(Number),
      },
    });
  });

  it("admits separately built spaces connected by real bidirectional triggers", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "block-builder-linked-spaces-"));
    await writeFile(path.join(root, "scene-brief.md"), BRIEF, "utf8");
    const result = await runBlockBuilderSelfCheck({
      ...paths(root, "linked"),
      sceneId: "linked-block-world",
      worldModulePath: path.resolve(
        "examples/block-world/linked-spaces-world.mjs",
      ),
    });
    expect(result.status, JSON.stringify(result.diagnostics)).toBe("passed");
    const report = JSON.parse(await readFile(
      path.join(root, "report-linked.json"),
      "utf8",
    ));
    expect(report.observations.blockWorldMetrics).toMatchObject({
      spaceTransitionCount: 2,
      reachableSpaceTransitionCount: 2,
      disconnectedStandablePositionCount: 0,
    });
  });

  it("admits a hash-bound legacy receipt and migrates its target map to current mixed-shape chunk entities", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "block-builder-host-resume-"));
    await writeFile(path.join(root, "scene-brief.md"), BRIEF, "utf8");
    const replay = paths(root, "replay");
    expect((await runBlockBuilderSelfCheck(replay)).status).toBe("passed");
    const originalAuthoringPath = path.join(root, "authoring-original.json");
    const originalMapPath = path.join(root, "map-original.json");
    const originalReportPath = path.join(root, "report-original.json");
    const originalAuthoring = (await readFile(replay.authoringOutputPath, "utf8"))
      .replace('"fovDegrees":56', '"fovDegrees":56.00000000000001');
    const originalMap = JSON.parse(await readFile(replay.mapDraftOutputPath, "utf8"));
    const landmarkMapping = originalMap.visualTargetMappings.find(
      ({ visualTargetId }: { visualTargetId: string }) =>
        visualTargetId === "visual-target-2",
    );
    landmarkMapping.runtimeEntityIds = ["palace-base", "palace-tower"];
    const originalMapSource = `${JSON.stringify(originalMap)}\n`;
    const originalReport = JSON.parse(await readFile(replay.reportPath, "utf8"));
    originalReport.validatorVersion = "worldkit-block-builder-self-check-v2";
    originalReport.inputs.authoringSpecHash =
      `sha256:${createHash("sha256").update(originalAuthoring).digest("hex")}`;
    originalReport.inputs.implementationMapDraftHash =
      `sha256:${createHash("sha256").update(originalMapSource).digest("hex")}`;
    await Promise.all([
      writeFile(originalAuthoringPath, originalAuthoring),
      writeFile(originalMapPath, originalMapSource),
      writeFile(originalReportPath, `${JSON.stringify(originalReport)}\n`),
    ]);
    const outputPath = path.join(root, "host-resume.json");
    const receipt = await verifyBlockBuilderHostResume({
      sceneId: replay.sceneId,
      briefPath: replay.briefPath,
      worldModulePath: replay.worldModulePath,
      originalAuthoringPath,
      originalMapPath,
      originalReportPath,
      replayAuthoringPath: replay.authoringOutputPath,
      replayMapPath: replay.mapDraftOutputPath,
      replayReportPath: replay.reportPath,
      outputPath,
    });
    expect(receipt).toMatchObject({
      status: "passed",
      originalValidatorVersion: "worldkit-block-builder-self-check-v2",
      replayValidatorVersion: "worldkit-block-builder-self-check-v10",
      implementationMapMigrated: true,
    });
    expect(receipt.inputs.originalAuthoringSpecHash).not.toBe(
      receipt.inputs.replayAuthoringSpecHash,
    );
    expect(JSON.parse(await readFile(outputPath, "utf8"))).toMatchObject({
      kind: "worldkit-block-builder-host-resume-receipt",
      status: "passed",
    });
  });
});
