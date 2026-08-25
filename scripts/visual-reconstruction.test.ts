import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, expect, it } from "vitest";

import { finalizeStyledOpeningFrame } from "./finalize-styled-opening-frame";
import { finalizeStyledTriviews } from "./finalize-styled-triviews";
import { finalizeVideoGenerationPrompt } from "./finalize-video-generation-prompt";
import { prepareVisualReconstruction } from "./prepare-visual-reconstruction.mjs";

const roots: string[] = [];

function ffmpeg(args: string[]): void {
  const result = spawnSync("ffmpeg", ["-v", "error", "-y", ...args], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr);
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

it("lists tri-view inputs with their exact palette target identity", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "triview-targets-"));
  roots.push(root);
  await mkdir(path.join(root, "triviews", "visual-target-1"), { recursive: true });
  await writeFile(path.join(root, "triviews", "capture-targets.json"), JSON.stringify({
    targets: [{
      id: "visual-target-1",
      visualTargetId: "visual-target-1",
      imagePath: "visual-target-1/whitebox-triview.png",
    }],
  }));
  await writeFile(path.join(root, "visual-identity-palette.json"), JSON.stringify({
    targets: [{
      id: "visual-target-1",
      visualTargetId: "visual-target-1",
      targetKind: "subject",
      name: "披甲猿猴战士",
      description: "完整披甲猿猴主体",
    }],
  }));
  const result = spawnSync(process.execPath, [
    "scripts/list-visual-triview-inputs.mjs",
    "--scene-root", root,
    "--format", "tsv",
  ], { encoding: "utf8" });
  expect(result.status).toBe(0);
  expect(result.stdout.trim().split("\t")).toEqual([
    "visual-target-1",
    path.join(root, "triviews", "visual-target-1", "whitebox-triview.png"),
    "visual-target-1",
    "subject",
    "披甲猿猴战士",
    "完整披甲猿猴主体",
  ]);
});

it("binds a manual whitebox recording, reconstructs the styled frame, and renders the locked prompt template", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "visual-reconstruction-"));
  roots.push(root);
  const sceneRoot = path.join(root, "scene");
  const triviewRoot = path.join(sceneRoot, "triviews", "traveler");
  await mkdir(triviewRoot, { recursive: true });
  const videoPath = path.join(root, "manual-whitebox.mp4");
  const userFramePath = path.join(root, "user-first-frame.png");
  const openingFramePath = path.join(sceneRoot, "opening-frame.png");
  const triviewPath = path.join(triviewRoot, "whitebox-triview.png");
  ffmpeg(["-f", "lavfi", "-i", "color=c=gray:s=320x180:d=1", "-pix_fmt", "yuv420p", videoPath]);
  ffmpeg(["-f", "lavfi", "-i", "color=c=blue:s=320x180", "-frames:v", "1", userFramePath]);
  ffmpeg(["-f", "lavfi", "-i", "color=c=white:s=320x180", "-frames:v", "1", openingFramePath]);
  await copyFile(openingFramePath, triviewPath);
  const triviewManifestPath = path.join(sceneRoot, "triviews", "capture-targets.json");
  await writeFile(triviewManifestPath, JSON.stringify({
    kind: "worldkit-runtime-triview-manifest",
    schemaVersion: 1,
    executionPlanHash: `sha256:${"a".repeat(64)}`,
    targets: [{
      id: "traveler",
      visualTargetId: "traveler",
      runtimeEntityIds: ["traveler"],
      role: "primary-subject",
      semanticClassId: "subject.traveler",
      identityColor: "#E85D5D",
      views: ["front", "right", "back"],
      imagePath: "traveler/whitebox-triview.png",
    }],
  }));
  const prepared = await prepareVisualReconstruction({
    scene_id: "paper-moon-palace",
    scene_root: sceneRoot,
    video: videoPath,
    user_frame: userFramePath,
    opening_frame: openingFramePath,
    triview_manifest: triviewManifestPath,
  });
  expect(prepared.draft.motionReference.token).toBe("@视频1");
  expect(prepared.draft.supplementalTriviews[0]?.token).toBe("@图片3");

  await copyFile(userFramePath, path.join(sceneRoot, "styled-opening-frame.png"));
  await finalizeStyledOpeningFrame({
    sceneId: "paper-moon-palace",
    sceneRoot,
    userFramePath,
  });
  const firstFrameManifest = JSON.parse(
    await readFile(path.join(sceneRoot, "styled-opening-frame-manifest.json"), "utf8"),
  );
  expect(firstFrameManifest.status).toBe("passed");
  expect(firstFrameManifest.supplementalTriviews[0]?.targetId).toBe("traveler");
  expect(await readFile(path.join(sceneRoot, "styled-opening-frame-report.json"), "utf8"))
    .toContain("worldkit-styled-opening-frame-report");
  const styledTriviewPath = path.join(triviewRoot, "styled-triview.png");
  await copyFile(userFramePath, styledTriviewPath);
  await finalizeStyledTriviews({ sceneId: "paper-moon-palace", sceneRoot });
  const styledTriviewManifest = JSON.parse(
    await readFile(path.join(sceneRoot, "styled-triviews-manifest.json"), "utf8"),
  );
  expect(styledTriviewManifest.status).toBe("passed");
  expect(styledTriviewManifest.appearanceSource.path).toBe("styled-opening-frame.png");
  expect(styledTriviewManifest.targets[0]).toMatchObject({
    id: "traveler",
    whiteboxTriview: { path: "triviews/traveler/whitebox-triview.png" },
    styledTriview: { path: "triviews/traveler/styled-triview.png" },
  });
  const fieldsPath = path.join(sceneRoot, "video-prompt-fields.json");
  await writeFile(fieldsPath, JSON.stringify({
    kind: "worldkit-video-prompt-fields",
    schemaVersion: 1,
    sceneId: "paper-moon-palace",
    finalScene: {
      location: "月下山谷宫殿",
      timeOfDay: "夜晚",
      weather: "晴朗薄雾",
      groundAndWallMaterials: "白玉桥面与雕花石墙",
      keyLightDirection: "月光从画面后上方照入",
      colorTemperature: "冷白月光与暖色灯笼",
      visualStyle: "写实东方奇幻电影",
    },
    action: "主角执行白膜录像中已有的移动与停步。",
    cinematography: { lens: "35mm", movement: "跟随镜头", notes: "不改变白膜录像的焦点和速度。" },
    additionalRestrictions: ["宫殿轮廓不得变化"],
  }));
  const result = await finalizeVideoGenerationPrompt({
    sceneRoot,
    draftPath: prepared.outputPath,
    fieldsPath,
  });
  expect(result.promptArtifact.prompt).toContain("@视频1是本视频唯一且严格的运动、镜头和空间调度参考");
  expect(result.promptArtifact.prompt).toContain("@图片2是基于白膜世界首帧和用户首帧生成的最终环境与灯光参考");
  expect(result.promptArtifact.prompt).toContain("@图片3是 traveler 的白膜 Front / Right / Back 三视图");
  expect(await readFile(path.join(sceneRoot, "video-generation-prompt.txt"), "utf8")).toContain("无灰模残留");
});
