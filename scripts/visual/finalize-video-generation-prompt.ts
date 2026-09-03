import { createHash } from "node:crypto";
import { readFile, realpath, rename, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { sha256CanonicalJson, stringifyCanonicalJson } from "@whitebox-world/protocol";
import {
  validateVideoPromptFieldsV1,
  validateVisualReferenceManifestV1,
  type VideoGenerationPromptV1,
  type VideoPromptFieldsV1,
  type VisualReferenceManifestV1,
} from "@whitebox-world/runtime-contracts";

interface VisualReferenceManifestDraftV1 extends Omit<VisualReferenceManifestV1, "kind" | "environmentAppearanceReference"> {
  kind: "worldkit-visual-reference-manifest-draft";
  environmentAppearanceReference: {
    token: "@图片2";
    path: "styled-opening-frame.png";
    status: "pending";
  };
}

function option(arguments_: readonly string[], name: string): string {
  const index = arguments_.indexOf(name);
  const value = index < 0 ? undefined : arguments_[index + 1];
  if (value === undefined || value.startsWith("--")) throw new Error(`${name} is required.`);
  return value;
}

async function fileHash(filePath: string): Promise<`sha256:${string}`> {
  return `sha256:${createHash("sha256").update(await readFile(filePath)).digest("hex")}`;
}

async function writeAtomic(filePath: string, content: string): Promise<void> {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, content, "utf8");
  await rename(temporaryPath, filePath);
}

function renderPrompt(
  manifest: VisualReferenceManifestV1,
  fields: VideoPromptFieldsV1,
): string {
  const triViews = manifest.supplementalTriviews.length === 0
    ? "无额外三视图。"
    : manifest.supplementalTriviews.map((item) =>
        `${item.token}是 ${item.visualTargetId} 的白膜 Front / Right / Back 三视图，只用于补足主体或关键物体在不同方向的轮廓、比例和结构；不得覆盖@视频1的运动、镜头与空间，也不得覆盖@图片1和@图片2的最终外观。`)
      .join("\n");
  const restrictions = fields.additionalRestrictions.length === 0
    ? ""
    : `\n${fields.additionalRestrictions.join("；")}。`;
  return `参考素材绑定：
@视频1 = ${manifest.motionReference.path}
@图片1 = ${manifest.subjectAppearanceReference.path}
@图片2 = ${manifest.environmentAppearanceReference.path}
${manifest.supplementalTriviews.map((item) => `${item.token} = ${item.path}`).join("\n")}

参考素材职责：

@视频1是本视频唯一且严格的运动、镜头和空间调度参考。
严格复现@视频1中的相机路径、镜头速度、焦点变化、起止构图、人物站位、
移动方向、动作时序、关键姿态、遮挡关系和最终落点。

@视频1不提供最终视觉外观。
忽略其中的白膜材质、灰色占位体、简化几何、低模背景、视窗网格、
坐标轴、线框、辅助线、文字和标记。
最终视频中不得出现任何灰模、白模或3D视窗痕迹。

@图片1是主角最终外观的唯一参考。
严格保持其面部、发型、体型、服装、配色、材质和身份一致。
只替换白膜角色的外观，不改变白膜视频规定的动作、位置和时间节奏。

@图片2是基于白膜世界首帧和用户首帧生成的最终环境与灯光参考。
保持其中的建筑材质、空间气氛、色调和主光方向，
但空间布局、地形轮廓、相机路径和遮挡关系仍以@视频1为准。

补充结构参考：
${triViews}

最终画面：
地点：${fields.finalScene.location}。
时间：${fields.finalScene.timeOfDay}。天气：${fields.finalScene.weather}。
地面和墙体材质：${fields.finalScene.groundAndWallMaterials}。
主光方向：${fields.finalScene.keyLightDirection}。色温：${fields.finalScene.colorTemperature}。
画面风格：${fields.finalScene.visualStyle}。

动作：
${fields.action}
动作具有自然重量、惯性、重心转换、衣物滞后和真实接触感。
关键姿态和动作时间严格遵循@视频1，允许补充自然的细微动作和过渡帧，
但不得增加新的主要动作。

摄影：
保持@视频1的镜头轨迹和镜头节奏。
${fields.cinematography.lens}镜头，${fields.cinematography.movement}，${fields.cinematography.notes}。
自然运动模糊，稳定空间连续性。
不得自行增加切镜、反打、旋转或额外推拉。

限制：
主体身份全程一致；无角色交换；无额外人物；无肢体融合；
无穿模；无漂移；无闪烁；无材质跳变；无灰模残留；
无文字、字幕、Logo、水印、时间码或界面元素。${restrictions}`;
}

export async function finalizeVideoGenerationPrompt(options: {
  sceneRoot: string;
  draftPath: string;
  fieldsPath: string;
}): Promise<{
  manifest: VisualReferenceManifestV1;
  promptArtifact: VideoGenerationPromptV1;
}> {
  const sceneRoot = await realpath(path.resolve(options.sceneRoot));
  const [draft, fields] = await Promise.all([
    readFile(options.draftPath, "utf8").then((text) => JSON.parse(text) as VisualReferenceManifestDraftV1),
    readFile(options.fieldsPath, "utf8").then((text) => JSON.parse(text) as VideoPromptFieldsV1),
  ]);
  if (draft.kind !== "worldkit-visual-reference-manifest-draft" || draft.sceneId !== fields.sceneId) {
    throw new Error("Visual reference draft and prompt fields do not describe the same scene.");
  }
  const fieldErrors = validateVideoPromptFieldsV1(fields);
  if (fieldErrors.length > 0) throw new Error(fieldErrors.join("\n"));
  const styledOpeningPath = path.join(sceneRoot, "styled-opening-frame.png");
  const styledBytes = await readFile(styledOpeningPath);
  if (styledBytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    throw new Error("Styled opening frame must be a valid PNG.");
  }
  const manifest: VisualReferenceManifestV1 = {
    ...draft,
    kind: "worldkit-visual-reference-manifest",
    environmentAppearanceReference: {
      token: "@图片2",
      path: "styled-opening-frame.png",
      contentHash: await fileHash(styledOpeningPath),
    },
  };
  const manifestErrors = validateVisualReferenceManifestV1(manifest);
  if (manifestErrors.length > 0) throw new Error(manifestErrors.join("\n"));
  const boundFiles = [
    manifest.motionReference,
    manifest.subjectAppearanceReference,
    manifest.environmentAppearanceReference,
    manifest.whiteboxOpeningFrame,
    manifest.motionContactSheet,
    ...manifest.supplementalTriviews,
  ];
  for (const binding of boundFiles) {
    const absolutePath = path.resolve(sceneRoot, binding.path);
    const relativePath = path.relative(sceneRoot, absolutePath);
    const resolvedPath = await realpath(absolutePath);
    const resolvedRelativePath = path.relative(sceneRoot, resolvedPath);
    if (relativePath.startsWith("..") || path.isAbsolute(relativePath) ||
        resolvedRelativePath.startsWith("..") || path.isAbsolute(resolvedRelativePath) ||
        await fileHash(absolutePath) !== binding.contentHash) {
      throw new Error(`Visual reference binding is missing or changed: ${binding.path}`);
    }
  }
  const promptArtifact: VideoGenerationPromptV1 = {
    kind: "worldkit-video-generation-prompt",
    schemaVersion: 1,
    sceneId: manifest.sceneId,
    templateVersion: 1,
    visualReferenceManifestHash: sha256CanonicalJson(manifest) as `sha256:${string}`,
    fieldsHash: sha256CanonicalJson(fields) as `sha256:${string}`,
    prompt: renderPrompt(manifest, fields),
  };
  await Promise.all([
    writeAtomic(path.join(sceneRoot, "visual-reference-manifest.json"), `${stringifyCanonicalJson(manifest)}\n`),
    writeAtomic(path.join(sceneRoot, "video-generation-prompt.json"), `${stringifyCanonicalJson(promptArtifact)}\n`),
    writeAtomic(path.join(sceneRoot, "video-generation-prompt.txt"), `${promptArtifact.prompt}\n`),
    writeAtomic(path.join(sceneRoot, "visual-reconstruction-report.json"), `${stringifyCanonicalJson({
      kind: "worldkit-visual-reconstruction-report",
      schemaVersion: 1,
      sceneId: manifest.sceneId,
      status: "passed",
      visualReferenceManifestHash: promptArtifact.visualReferenceManifestHash,
      videoPromptHash: sha256CanonicalJson(promptArtifact),
    })}\n`),
  ]);
  return { manifest, promptArtifact };
}

export async function main(arguments_: readonly string[] = process.argv.slice(2)): Promise<void> {
  const result = await finalizeVideoGenerationPrompt({
    sceneRoot: option(arguments_, "--scene-root"),
    draftPath: option(arguments_, "--manifest-draft"),
    fieldsPath: option(arguments_, "--fields"),
  });
  process.stdout.write(`${result.promptArtifact.visualReferenceManifestHash}\n`);
}

const entryPath = process.argv[1] === undefined ? "" : path.resolve(process.argv[1]);
if (entryPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  });
}
