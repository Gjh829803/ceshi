import { createHash } from "node:crypto";
import { lstat, readFile, realpath, rename, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { sha256CanonicalJson, stringifyCanonicalJson } from "@whitebox-world/authoring";
import {
  validateWhiteboxTriviewManifestV1,
  type WhiteboxTriviewManifestV1,
} from "@whitebox-world/runtime-contracts";

function option(arguments_: readonly string[], name: string): string {
  const index = arguments_.indexOf(name);
  const value = index < 0 ? undefined : arguments_[index + 1];
  if (value === undefined || value.startsWith("--")) throw new Error(`${name} is required.`);
  return value;
}

function canonicalRelativePath(root: string, target: string): string {
  return path.relative(root, target).split(path.sep).join("/");
}

async function hash(filePath: string): Promise<`sha256:${string}`> {
  return `sha256:${createHash("sha256").update(await readFile(filePath)).digest("hex")}`;
}

async function assertPng(filePath: string): Promise<void> {
  const info = await lstat(filePath);
  if (!info.isFile() || info.isSymbolicLink() || info.size <= 8 || info.size > 20 * 1024 * 1024) {
    throw new Error(`Styled tri-view is invalid: ${filePath}`);
  }
  const bytes = await readFile(filePath);
  if (bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    throw new Error(`Styled tri-view must be PNG: ${filePath}`);
  }
}

async function writeAtomic(filePath: string, content: string): Promise<void> {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, content, "utf8");
  await rename(temporaryPath, filePath);
}

export async function finalizeStyledTriviews(options: {
  sceneId: string;
  sceneRoot: string;
}): Promise<void> {
  if (!/^[a-z0-9][a-z0-9-]{2,79}$/.test(options.sceneId)) throw new Error("scene-id is invalid.");
  const sceneRoot = await realpath(path.resolve(options.sceneRoot));
  const styledOpeningFramePath = path.join(sceneRoot, "styled-opening-frame.png");
  const captureManifestPath = path.join(sceneRoot, "triviews", "whitebox-triview-manifest.json");
  await assertPng(styledOpeningFramePath);
  const captureManifest = JSON.parse(
    await readFile(captureManifestPath, "utf8"),
  ) as WhiteboxTriviewManifestV1;
  const captureErrors = validateWhiteboxTriviewManifestV1(captureManifest);
  if (captureErrors.length > 0) {
    throw new Error(captureErrors.map(({ code, instancePath, message }) =>
      `${code} ${instancePath}: ${message}`).join("\n"));
  }

  const targets = [];
  for (const target of captureManifest.whiteboxTriviews) {
    const whiteboxPath = path.join(sceneRoot, "triviews", target.imageUri);
    const styledPath = path.join(sceneRoot, "triviews", target.visualTargetId, "styled-triview.png");
    await Promise.all([assertPng(whiteboxPath), assertPng(styledPath)]);
    targets.push({
      visualTargetId: target.visualTargetId,
      runtimeEntityIds: [...target.runtimeEntityIds],
      role: target.role,
      semanticClassId: target.semanticClassId,
      frontDirectionWorldXZ: [...target.frontDirectionWorldXZ],
      views: [...target.views],
      whiteboxTriview: {
        path: canonicalRelativePath(sceneRoot, whiteboxPath),
        contentHash: await hash(whiteboxPath),
      },
      styledTriview: {
        path: canonicalRelativePath(sceneRoot, styledPath),
        contentHash: await hash(styledPath),
      },
    });
  }
  const manifest = {
    kind: "worldkit-styled-triview-manifest",
    schemaVersion: 1,
    sceneId: options.sceneId,
    status: "passed",
    appearanceSource: {
      path: "styled-opening-frame.png",
      contentHash: await hash(styledOpeningFramePath),
    },
    targets,
  };
  await Promise.all([
    writeAtomic(
      path.join(sceneRoot, "styled-triviews-manifest.json"),
      `${stringifyCanonicalJson(manifest)}\n`,
    ),
    writeAtomic(
      path.join(sceneRoot, "styled-triviews-report.json"),
      `${stringifyCanonicalJson({
        kind: "worldkit-styled-triview-report",
        schemaVersion: 1,
        sceneId: options.sceneId,
        status: "passed",
        targetCount: targets.length,
        manifestHash: sha256CanonicalJson(manifest),
      })}\n`,
    ),
  ]);
}

export async function main(arguments_: readonly string[] = process.argv.slice(2)): Promise<void> {
  await finalizeStyledTriviews({
    sceneId: option(arguments_, "--scene-id"),
    sceneRoot: option(arguments_, "--scene-root"),
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
