import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve, sep } from "node:path";

import {
  assertS3Uri,
  downloadS3FileAtomic,
  joinS3Uri,
  uploadS3File,
} from "./lwdp-generation-client.mjs";

const contentTypes = Object.freeze({
  ".css": "text/css",
  ".html": "text/html",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript",
  ".json": "application/json",
  ".md": "text/markdown",
  ".mjs": "text/javascript",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".txt": "text/plain",
  ".webm": "video/webm",
  ".webp": "image/webp",
  ".zip": "application/zip",
});

function portablePath(value) {
  return value.split(sep).join("/");
}

async function walkFiles(root) {
  const output = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const fullPath = join(directory, entry.name);
      if (entry.isDirectory()) await visit(fullPath);
      else if (entry.isFile()) output.push(fullPath);
      else throw new Error(`Cloud artifacts may not contain links or special files: ${fullPath}`);
    }
  }
  try {
    await visit(root);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  return output.sort();
}

export async function sha256File(filePath) {
  const hash = createHash("sha256");
  await new Promise((resolvePromise, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolvePromise);
  });
  return `sha256:${hash.digest("hex")}`;
}

export async function buildCloudArtifactManifest({
  sceneId,
  executionId,
  stageId,
  stageOutputS3Prefix,
  sceneRoot,
  scenePlanRoot,
  logPath,
  workerImage = null,
  sourceRevision = null,
}) {
  const resolvedPrefix = assertS3Uri(stageOutputS3Prefix);
  const collections = [
    { root: resolve(sceneRoot), namespace: "scene" },
    { root: resolve(scenePlanRoot), namespace: "scene-plan" },
    ...(logPath ? [{ root: resolve(logPath), namespace: "logs", singleFile: true }] : []),
  ];
  const artifacts = [];
  for (const collection of collections) {
    const files = collection.singleFile
      ? [collection.root]
      : await walkFiles(collection.root);
    for (const filePath of files) {
      const metadata = await stat(filePath);
      const relativePath = collection.singleFile
        ? "pipeline.log"
        : portablePath(relative(collection.root, filePath));
      const artifactPath = `${collection.namespace}/${relativePath}`;
      artifacts.push({
        path: artifactPath,
        contentType: contentTypes[extname(filePath).toLowerCase()] ?? "application/octet-stream",
        byteSize: metadata.size,
        sha256: await sha256File(filePath),
        s3Uri: joinS3Uri(resolvedPrefix, artifactPath),
        producerStage: stageId,
        required: [
          "scene/world.mjs",
          "scene/authoring.json",
          "scene/world.build.json",
          "scene/runtime-snapshot.json",
          "scene/opening-frame.png",
          "scene/whitebox-capture-receipt.json",
          "scene-plan/entry-whitebox-target.png",
          "scene-plan/world-plan.png",
          "logs/pipeline.log",
        ].includes(artifactPath),
        localPath: filePath,
      });
    }
  }
  return {
    kind: "worldkit-cloud-artifact-manifest",
    schemaVersion: 1,
    sceneId,
    executionId,
    stageId,
    workerImage,
    sourceRevision,
    generatedAt: new Date().toISOString(),
    artifacts,
  };
}

export async function buildCloudEpisodeArtifactManifest({
  sceneId,
  episodeId,
  executionId,
  stageId,
  stageOutputS3Prefix,
  episodeRoot,
  workerImage = null,
  sourceRevision = null,
  requireComplete = true,
}) {
  const resolvedPrefix = assertS3Uri(stageOutputS3Prefix);
  const root = resolve(episodeRoot);
  const [episodeRecord, styleVariantManifest] = await Promise.all([
    readFile(join(root, "episode-record.json"), "utf8").then(JSON.parse).catch(() => null),
    readFile(
      join(root, "style-variants/style-variant-manifest.json"),
      "utf8",
    ).then(JSON.parse).catch(() => null),
  ]);
  const visualSample = episodeRecord?.productionScope === "visual-sample";
  const sharedRequiredPaths = [
    "episode/episode-record.json",
    "episode/episode-source-receipt.json",
    "episode/planning/reconnaissance/reconnaissance-report.json",
    "episode/planning/navigation-evidence.json",
    "episode/planning/playthrough-plan.json",
    "episode/whitebox/episode-180s.mp4",
    "episode/whitebox/executed-playthrough-raw-trace.json",
    "episode/whitebox/executed-playthrough-trace.json",
    "episode/whitebox/executed-playthrough-quality-report.json",
    ...Array.from({ length: 6 }, (_, index) => [
      `episode/whitebox/segment-0${index}.mp4`,
      `episode/whitebox/segment-0${index}-first-frame.png`,
    ]).flat(),
    ...(visualSample ? [] : [`episode/bundle/${episodeId}-seedance-review.zip`]),
  ];
  const styleVariantRequiredPaths = styleVariantManifest?.kind ===
      "worldkit-episode-style-variant-manifest"
    ? [
        "episode/style-variants/style-variant-plan.json",
        "episode/style-variants/style-variant-plan-report.json",
        "episode/style-variants/style-variant-manifest.json",
        ...styleVariantManifest.variants.flatMap((variant) => [
          `episode/style-variants/${variant.id}/style-variant.json`,
          `episode/style-variants/${variant.id}/visual/visual-manifest.json`,
          `episode/style-variants/${variant.id}/review/visual-quality-review.json`,
          `episode/style-variants/${variant.id}/review/visual-quality-review-report.json`,
          ...Array.from({ length: 6 }, (_, index) =>
            `episode/style-variants/${variant.id}/visual/segment-0${index}-styled-opening-frame.png`),
          ...(visualSample ? [] : [
            `episode/style-variants/${variant.id}/prompts/visual-events.json`,
            ...Array.from({ length: 6 }, (_, index) =>
              `episode/style-variants/${variant.id}/video/segment-0${index}/final-1280x720-24fps-720f.mp4`),
          ]),
        ]),
      ]
    : [
        "episode/visual/episode-visual-prompts.json",
        "episode/visual/episode-visual-manifest.json",
        "episode/prompts/visual-events.json",
        ...Array.from({ length: 6 }, (_, index) => [
          `episode/visual/segment-0${index}-styled-opening-frame.png`,
          `episode/prompts/segment-0${index}.json`,
          `episode/video/segment-0${index}/request.json`,
          `episode/video/segment-0${index}/provider-run.json`,
          `episode/video/segment-0${index}/seedance-2.5.mp4`,
          `episode/video/segment-0${index}/final-1280x720-24fps-720f.mp4`,
        ]).flat(),
      ];
  const requiredPaths = new Set([
    ...sharedRequiredPaths,
    ...styleVariantRequiredPaths,
  ]);
  const artifacts = [];
  for (const filePath of await walkFiles(root)) {
    const metadata = await stat(filePath);
    const relativePath = portablePath(relative(root, filePath));
    const artifactPath = `episode/${relativePath}`;
    artifacts.push({
      path: artifactPath,
      contentType: contentTypes[extname(filePath).toLowerCase()] ??
        "application/octet-stream",
      byteSize: metadata.size,
      sha256: await sha256File(filePath),
      s3Uri: joinS3Uri(resolvedPrefix, artifactPath),
      producerStage: stageId,
      required: requiredPaths.has(artifactPath),
      localPath: filePath,
    });
  }
  if (requireComplete) {
    for (const requiredPath of requiredPaths) {
      if (!artifacts.some((artifact) => artifact.path === requiredPath)) {
        throw new Error(`Cloud Episode artifact is missing: ${requiredPath}`);
      }
    }
  }
  return {
    kind: "worldkit-cloud-artifact-manifest",
    schemaVersion: 1,
    sceneId,
    episodeId,
    executionId,
    stageId,
    workerImage,
    sourceRevision,
    generatedAt: new Date().toISOString(),
    artifacts,
  };
}

export async function uploadCloudArtifactManifest(manifest, manifestPath, options = {}) {
  const serializable = {
    ...manifest,
    artifacts: manifest.artifacts.map(({ localPath: _localPath, ...artifact }) => artifact),
  };
  await writeFile(manifestPath, `${JSON.stringify(serializable, null, 2)}\n`, { mode: 0o600 });
  for (const artifact of manifest.artifacts) {
    await uploadS3File(artifact.localPath, artifact.s3Uri, options);
  }
  const s3Uri = joinS3Uri(options.stageOutputS3Prefix, "cloud-artifact-manifest.json");
  await uploadS3File(manifestPath, s3Uri, options);
  return {
    manifest: serializable,
    cloudExecutionArtifacts: [
      {
        role: "worldkit-cloud-artifact-manifest",
        path: "cloud-artifact-manifest.json",
        s3_uri: s3Uri,
        content_type: "application/json",
        required: true,
      },
    ],
  };
}

export async function hydrateCloudArtifactManifest({
  manifestS3Uri,
  manifestPath,
  expectedSceneId,
  expectedExecutionId,
  sceneRoot,
  scenePlanRoot,
  logPath,
  downloadImplementation = downloadS3FileAtomic,
  downloadOptions = {},
}) {
  await downloadImplementation(assertS3Uri(manifestS3Uri), manifestPath, downloadOptions);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (
    manifest?.kind !== "worldkit-cloud-artifact-manifest" ||
    manifest?.schemaVersion !== 1 ||
    manifest?.sceneId !== expectedSceneId ||
    manifest?.executionId !== expectedExecutionId ||
    !Array.isArray(manifest?.artifacts)
  ) {
    throw new Error("Resume artifact manifest identity is invalid.");
  }
  if (manifest.artifacts.length < 1 || manifest.artifacts.length > 10_000) {
    throw new Error("Resume artifact manifest count is outside the admitted range.");
  }
  const seenPaths = new Set();
  let declaredBytes = 0;
  for (const artifact of manifest.artifacts) {
    const artifactPath = String(artifact?.path ?? "");
    if (
      !artifactPath ||
      artifactPath.startsWith("/") ||
      artifactPath.split("/").includes("..") ||
      seenPaths.has(artifactPath)
    ) {
      throw new Error(`Resume artifact path is unsafe or duplicated: ${artifactPath}`);
    }
    seenPaths.add(artifactPath);
    if (!Number.isSafeInteger(artifact?.byteSize) || artifact.byteSize < 1) {
      throw new Error(`Resume artifact size is invalid: ${artifactPath}`);
    }
    declaredBytes += artifact.byteSize;
    if (declaredBytes > 2 * 1024 * 1024 * 1024) {
      throw new Error("Resume artifact manifest exceeds the 2 GiB aggregate limit.");
    }
    let localPath;
    if (artifactPath.startsWith("scene/")) {
      localPath = join(sceneRoot, artifactPath.slice("scene/".length));
    } else if (artifactPath.startsWith("scene-plan/")) {
      localPath = join(scenePlanRoot, artifactPath.slice("scene-plan/".length));
    } else if (artifactPath === "logs/pipeline.log") {
      localPath = logPath;
    } else {
      throw new Error(`Resume artifact namespace is unsupported: ${artifactPath}`);
    }
    await mkdir(dirname(localPath), { recursive: true });
    await downloadImplementation(assertS3Uri(artifact.s3Uri), localPath, downloadOptions);
    const metadata = await stat(localPath);
    if (metadata.size !== artifact.byteSize) {
      throw new Error(`Resume artifact byte size mismatch: ${artifactPath}`);
    }
    const observedHash = await sha256File(localPath);
    if (observedHash !== artifact.sha256) {
      throw new Error(`Resume artifact hash mismatch: ${artifactPath}`);
    }
  }
  return manifest;
}

export async function hydrateCloudEpisodeArtifactManifest({
  manifestS3Uri,
  manifestPath,
  expectedSceneId,
  expectedEpisodeId,
  expectedExecutionId,
  episodeRoot,
  downloadImplementation = downloadS3FileAtomic,
  downloadOptions = {},
}) {
  await downloadImplementation(assertS3Uri(manifestS3Uri), manifestPath, downloadOptions);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (
    manifest?.kind !== "worldkit-cloud-artifact-manifest" ||
    manifest?.schemaVersion !== 1 ||
    manifest?.sceneId !== expectedSceneId ||
    manifest?.episodeId !== expectedEpisodeId ||
    manifest?.executionId !== expectedExecutionId ||
    !Array.isArray(manifest?.artifacts)
  ) throw new Error("Episode resume artifact manifest identity is invalid.");
  if (manifest.artifacts.length < 1 || manifest.artifacts.length > 2_048) {
    throw new Error("Episode resume artifact manifest count is outside the admitted range.");
  }
  const seenPaths = new Set();
  let declaredBytes = 0;
  for (const artifact of manifest.artifacts) {
    const artifactPath = String(artifact?.path ?? "");
    if (
      !artifactPath.startsWith("episode/") ||
      artifactPath.split("/").includes("..") ||
      seenPaths.has(artifactPath)
    ) throw new Error(`Episode resume artifact path is unsafe or duplicated: ${artifactPath}`);
    seenPaths.add(artifactPath);
    if (!Number.isSafeInteger(artifact?.byteSize) || artifact.byteSize < 1) {
      throw new Error(`Episode resume artifact size is invalid: ${artifactPath}`);
    }
    declaredBytes += artifact.byteSize;
    if (declaredBytes > 16 * 1024 * 1024 * 1024) {
      throw new Error("Episode resume artifact manifest exceeds the 16 GiB aggregate limit.");
    }
    const localPath = join(episodeRoot, artifactPath.slice("episode/".length));
    await mkdir(dirname(localPath), { recursive: true });
    await downloadImplementation(assertS3Uri(artifact.s3Uri), localPath, downloadOptions);
    const metadata = await stat(localPath);
    if (metadata.size !== artifact.byteSize) {
      throw new Error(`Episode resume artifact byte size mismatch: ${artifactPath}`);
    }
    const observedHash = await sha256File(localPath);
    if (observedHash !== artifact.sha256) {
      throw new Error(`Episode resume artifact hash mismatch: ${artifactPath}`);
    }
  }
  return manifest;
}
