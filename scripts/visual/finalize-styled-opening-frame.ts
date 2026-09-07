import { createHash } from "node:crypto";
import { copyFile, lstat, readFile, realpath, rename, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { sha256CanonicalJson, stringifyCanonicalJson } from "@whitebox-world/protocol";
import {
  validateWhiteboxTriviewManifestV1,
  type WhiteboxTriviewManifestV1,
} from "@whitebox-world/runtime-contracts";
import { parseVisualGenerationPromptsV2 } from "./visual-generation-prompts.js";
import { visualCapturePaths } from "./visual-capture-paths.js";
import type { WorldGenerationSceneSourceKindV1 } from "@whitebox-world/scene-authoring-contracts";

function option(arguments_: readonly string[], name: string): string {
  const index = arguments_.indexOf(name);
  const value = index < 0 ? undefined : arguments_[index + 1];
  if (value === undefined || value.startsWith("--")) throw new Error(`${name} is required.`);
  return value;
}

async function hash(filePath: string): Promise<`sha256:${string}`> {
  return `sha256:${createHash("sha256").update(await readFile(filePath)).digest("hex")}`;
}

async function assertImage(filePath: string): Promise<"png" | "jpg" | "webp"> {
  const info = await lstat(filePath);
  if (!info.isFile() || info.isSymbolicLink() || info.size <= 8 || info.size > 20 * 1024 * 1024) {
    throw new Error(`Image input is invalid: ${filePath}`);
  }
  const bytes = await readFile(filePath);
  if (bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") return "png";
  if (bytes.subarray(0, 3).toString("hex") === "ffd8ff") return "jpg";
  if (bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") return "webp";
  throw new Error(`Image signature is invalid: ${filePath}`);
}

async function writeAtomic(filePath: string, content: string): Promise<void> {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, content, "utf8");
  await rename(temporaryPath, filePath);
}

export async function finalizeStyledOpeningFrame(options: {
  sceneId: string;
  sceneRoot: string;
  userFramePath: string;
  sceneSource?: WorldGenerationSceneSourceKindV1;
}): Promise<void> {
  if (!/^[a-z0-9][a-z0-9-]{2,79}$/.test(options.sceneId)) throw new Error("scene-id is invalid.");
  const sceneRoot = await realpath(path.resolve(options.sceneRoot));
  const capturePaths = visualCapturePaths(options.sceneSource);
  const openingFramePath = path.join(sceneRoot, capturePaths.opening);
  const styledFramePath = path.join(sceneRoot, "styled-opening-frame.png");
  const captureManifestPath = path.join(sceneRoot, capturePaths.manifest);
  const promptBundlePath = path.join(sceneRoot, "visual-generation-prompts.json");
  const [userFormat] = await Promise.all([
    assertImage(path.resolve(options.userFramePath)),
    assertImage(openingFramePath),
    assertImage(styledFramePath),
  ]);
  const userTarget = path.join(sceneRoot, `user-first-frame.${userFormat}`);
  try {
    const targetInfo = await lstat(userTarget);
    if (targetInfo.isSymbolicLink()) throw new Error("Refusing a linked user-first-frame target.");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await copyFile(path.resolve(options.userFramePath), userTarget);

  const captureManifest = JSON.parse(
    await readFile(captureManifestPath, "utf8"),
  ) as WhiteboxTriviewManifestV1;
  const captureErrors = validateWhiteboxTriviewManifestV1(captureManifest);
  if (captureErrors.length > 0) {
    throw new Error(captureErrors.map(({ code, instancePath, message }) =>
      `${code} ${instancePath}: ${message}`).join("\n"));
  }
  const promptBundleBytes = await readFile(promptBundlePath);
  parseVisualGenerationPromptsV2(JSON.parse(promptBundleBytes.toString("utf8")), {
    sceneId: options.sceneId,
    visualTargetIds: captureManifest.whiteboxTriviews.map(({ visualTargetId }) => visualTargetId),
  });
  const triViews = [];
  for (const target of captureManifest.whiteboxTriviews) {
    const triViewPath = path.join(sceneRoot, capturePaths.triviewRoot, target.imageUri);
    await assertImage(triViewPath);
    triViews.push({
      visualTargetId: target.visualTargetId,
      path: path.relative(sceneRoot, triViewPath),
      contentHash: await hash(triViewPath),
    });
  }
  const manifest = {
    kind: "worldkit-styled-opening-frame-manifest",
    schemaVersion: 1,
    sceneId: options.sceneId,
    status: "passed",
    whiteboxOpeningFrame: { path: capturePaths.opening, contentHash: await hash(openingFramePath) },
    userFirstFrame: { path: path.basename(userTarget), contentHash: await hash(userTarget) },
    styledOpeningFrame: { path: "styled-opening-frame.png", contentHash: await hash(styledFramePath) },
    promptBundle: {
      path: "visual-generation-prompts.json",
      contentHash: `sha256:${createHash("sha256").update(promptBundleBytes).digest("hex")}`,
    },
    supplementalTriviews: triViews,
  };
  await Promise.all([
    writeAtomic(path.join(sceneRoot, "styled-opening-frame-manifest.json"), `${stringifyCanonicalJson(manifest)}\n`),
    writeAtomic(path.join(sceneRoot, "styled-opening-frame-report.json"), `${stringifyCanonicalJson({
      kind: "worldkit-styled-opening-frame-report",
      schemaVersion: 1,
      sceneId: options.sceneId,
      status: "passed",
      manifestHash: sha256CanonicalJson(manifest),
    })}\n`),
  ]);
}

export async function main(arguments_: readonly string[] = process.argv.slice(2)): Promise<void> {
  await finalizeStyledOpeningFrame({
    sceneId: option(arguments_, "--scene-id"),
    sceneRoot: option(arguments_, "--scene-root"),
    userFramePath: option(arguments_, "--user-frame"),
    sceneSource: visualCapturePaths(arguments_.includes("--scene-source")
      ? option(arguments_, "--scene-source") : undefined).source,
  });
  process.stdout.write("ok\n");
}

const entryPath = process.argv[1] === undefined ? "" : path.resolve(process.argv[1]);
if (entryPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  });
}
