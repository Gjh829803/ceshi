import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { parseSceneBriefV1 } from "@whitebox-world/authoring";
import { afterEach, expect, it } from "vitest";

import {
  deriveVisualCaptureGroups,
  deriveVisualIdentityPalette,
  finalizeSceneBuild,
} from "./finalize-spatial-build";
import { writeVisualIdentityPalette } from "../visual/write-visual-identity-palette";

const directories: string[] = [];

const brief = `# WorldKit Scene Brief

## 场景
开阔草地中的完整塔楼世界。

## 主体
普通第三人称旅人。

## 用户事实
用户要求一个包含旅人与塔楼的可操作白模世界。

## 可见参考证据
可见开阔草地、人物与远景塔楼。

## 推断的世界延伸
镜头外草地延伸为连贯地形，此项为工程推断。

## 仅视觉层设想
草地纹理、塔楼材质和天空颜色只属于渲染层。

## 运动模式
陆地步行：主体自然行走和奔跑。

## 空间
前景草地向远景塔楼展开，侧后方保持完整可探索空间。

## 通行
除塔楼和实体障碍碰撞外，整片地面开放通行，不设计路线。

## 首帧
标准第三人称背后视角，主体位于下方中央并朝向塔楼。

## 视觉目标
- 主体｜旅人：完整人物主体
- 标志物｜塔楼：具有独特高耸轮廓的完整塔楼
`;

async function fixture() {
  const directory = await mkdtemp(path.join(tmpdir(), "scene-build-"));
  directories.push(directory);
  const briefPath = path.join(directory, "scene-brief.md");
  const worldPath = path.join(directory, "authoring.json");
  const mapDraftPath = path.join(directory, "map.json");
  const world = JSON.parse(
    await readFile(path.resolve("examples/authoring/basic-world.json"), "utf8"),
  );
  world.schemaVersion = 4;
  world.spatial.traversalAreas = [];
  world.constraints.connectivity = [];
  await writeFile(worldPath, JSON.stringify(world));
  await writeFile(briefPath, brief);
  return { sceneId: "basic-scene", directory, briefPath, worldPath, mapDraftPath };
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

it("finalizes a Scene Brief map and verifies visual targets against runtime entities", async () => {
  const files = await fixture();
  await writeFile(files.mapDraftPath, JSON.stringify({
    kind: "worldkit-scene-brief-implementation-map-draft",
    schemaVersion: 1,
    sceneId: files.sceneId,
    authoringSpecId: "basic-world",
    visualTargetMappings: [
      { visualTargetId: "visual-target-1", runtimeEntityIds: ["player"] },
      { visualTargetId: "visual-target-2", runtimeEntityIds: ["tower"] },
    ],
  }));
  const result = await finalizeSceneBuild(files);
  expect(result.sceneBriefHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  expect(result.authoringSpecHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  expect(result.visualCaptureGroups).toEqual([
    expect.objectContaining({
      visualTargetId: "visual-target-1",
      runtimeEntityIds: ["player"],
      role: "primary-subject",
      identityColor: "#E85D5D",
    }),
    expect.objectContaining({
      visualTargetId: "visual-target-2",
      runtimeEntityIds: ["tower"],
      role: "primary-landmark",
      identityColor: "#F28E2B",
    }),
  ]);
});

it("rejects missing visual targets, extra mappings, and invented runtime ids", async () => {
  const files = await fixture();
  await writeFile(files.mapDraftPath, JSON.stringify({
    kind: "worldkit-scene-brief-implementation-map-draft",
    schemaVersion: 1,
    sceneId: files.sceneId,
    authoringSpecId: "basic-world",
    visualTargetMappings: [
      { visualTargetId: "visual-target-1", runtimeEntityIds: ["invented-player"] },
      { visualTargetId: "visual-target-3", runtimeEntityIds: ["tower"] },
    ],
  }));
  await expect(finalizeSceneBuild(files)).rejects.toThrow(/Unknown runtime entity 'invented-player'/);
  await expect(finalizeSceneBuild(files)).rejects.toThrow(/visual-target-2/);
  await expect(finalizeSceneBuild(files)).rejects.toThrow(/Unknown Scene Brief visual target 'visual-target-3'/);
});

it("keeps identical complete instances in one repeated visual target", () => {
  const parsed = parseSceneBriefV1(brief.replace(
    "- 标志物｜塔楼：具有独特高耸轮廓的完整塔楼",
    "- 重复标志物｜双塔：两座外观相同的完整高塔共同形成独特地标",
  ));
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) return;
  const groups = deriveVisualCaptureGroups({
    brief: parsed.value,
    visualTargetMappings: [
      { visualTargetId: "visual-target-1", runtimeEntityIds: ["player"] },
      { visualTargetId: "visual-target-2", runtimeEntityIds: ["tower-east", "tower-west"] },
    ],
  });
  expect(groups).toHaveLength(2);
  expect(groups[1]).toMatchObject({
    visualTargetId: "visual-target-2",
    runtimeEntityIds: ["tower-east", "tower-west"],
  });
  expect(deriveVisualIdentityPalette(parsed.value)).toHaveLength(2);
});

it("rejects the retired final-kind draft and mappings field", async () => {
  const files = await fixture();
  await writeFile(files.mapDraftPath, JSON.stringify({
    kind: "worldkit-scene-brief-implementation-map",
    schemaVersion: 1,
    sceneId: files.sceneId,
    authoringSpecId: "basic-world",
    mappings: [
      { visualTargetId: "visual-target-1", runtimeEntityIds: ["player"] },
      { visualTargetId: "visual-target-2", runtimeEntityIds: ["tower"] },
    ],
  }));
  await expect(finalizeSceneBuild(files)).rejects.toThrow(
    /HOSTED_VISUAL_UNKNOWN_FIELD.*mappings.*HOSTED_VISUAL_DRAFT_KIND_INVALID/s,
  );
});

it("writes movement mode and complete target descriptions into the trusted palette", async () => {
  const files = await fixture();
  const outputPath = path.join(files.directory, "visual-identity-palette.json");
  await writeVisualIdentityPalette({
    sceneId: files.sceneId,
    briefPath: files.briefPath,
    outputPath,
  });
  const palette = JSON.parse(await readFile(outputPath, "utf8"));
  expect(palette).toMatchObject({
    sceneId: files.sceneId,
    movementMode: "ground-walk",
    movementModeLabel: "陆地步行",
    targets: [
      { id: "visual-target-1", targetKind: "subject", name: "旅人" },
      { id: "visual-target-2", targetKind: "landmark", name: "塔楼" },
    ],
  });
});
