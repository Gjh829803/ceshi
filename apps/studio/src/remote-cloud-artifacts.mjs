import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";

import { assertS3Uri } from "../../../scripts/lib/lwdp-generation-client.mjs";
import {
  projectAwsEnvironment,
  readRemoteS3Artifact,
} from "../../../scripts/lib/cloud-s3-runtime.mjs";
export {
  projectAwsEnvironment,
  readRemoteS3Artifact,
} from "../../../scripts/lib/cloud-s3-runtime.mjs";

const HASH = /^sha256:[a-f0-9]{64}$/;
const MAXIMUM_MANIFEST_BYTES = 5 * 1024 * 1024;
const MAXIMUM_SCENE_ARTIFACT_COUNT = 512;
const MAXIMUM_SCENE_DECLARED_BYTES = 2 * 1024 * 1024 * 1024;
const MAXIMUM_EPISODE_ARTIFACT_COUNT = 2_048;
const MAXIMUM_EPISODE_DECLARED_BYTES = 16 * 1024 * 1024 * 1024;
const EPISODE_EXECUTION_PARTS = new Set([
  "full",
  "prepare",
  "capture",
  "render",
  "style-plan",
  "style-openings",
  "style-visuals",
  "style-diversity",
  "style-events",
  "style-prompts",
  "seedance",
  "conformance",
  "publication",
]);

function portableArtifactPath(value) {
  return String(value ?? "").replaceAll("\\", "/");
}

export function validateCloudArtifactManifest(value, {
  expectedExecutionId,
  expectedSceneId,
  expectedEpisodeId,
} = {}) {
  const episodeManifest = typeof value?.episodeId === "string";
  const maximumArtifactCount = episodeManifest
    ? MAXIMUM_EPISODE_ARTIFACT_COUNT
    : MAXIMUM_SCENE_ARTIFACT_COUNT;
  const maximumDeclaredBytes = episodeManifest
    ? MAXIMUM_EPISODE_DECLARED_BYTES
    : MAXIMUM_SCENE_DECLARED_BYTES;
  if (
    value?.kind !== "worldkit-cloud-artifact-manifest" ||
    value?.schemaVersion !== 1 ||
    typeof value.sceneId !== "string" ||
    typeof value.executionId !== "string" ||
    typeof value.stageId !== "string" ||
    !Array.isArray(value.artifacts) ||
    value.artifacts.length < 1 ||
    value.artifacts.length > maximumArtifactCount ||
    (expectedSceneId !== undefined && value.sceneId !== expectedSceneId) ||
    (expectedEpisodeId !== undefined && value.episodeId !== expectedEpisodeId) ||
    (expectedExecutionId !== undefined && value.executionId !== expectedExecutionId)
  ) throw new Error("Cloud artifact manifest identity is invalid.");
  if (episodeManifest && value.executionPart !== undefined &&
      !EPISODE_EXECUTION_PARTS.has(value.executionPart)) {
    throw new Error("Cloud Episode artifact execution part is invalid.");
  }

  let declaredBytes = 0;
  const seen = new Set();
  const artifacts = [];
  for (const rawArtifact of value.artifacts) {
    const artifactPath = portableArtifactPath(rawArtifact?.path);
    if (
      !artifactPath || artifactPath.startsWith("/") ||
      artifactPath.split("/").includes("..") || seen.has(artifactPath) ||
      !(episodeManifest
        ? ["episode"].includes(artifactPath.split("/")[0])
        : ["scene", "scene-plan", "logs"].includes(artifactPath.split("/")[0]))
    ) throw new Error(`Cloud artifact path is unsafe or duplicated: ${artifactPath}`);
    seen.add(artifactPath);
    if (!Number.isSafeInteger(rawArtifact?.byteSize) || rawArtifact.byteSize < 1) {
      throw new Error(`Cloud artifact byte size is invalid: ${artifactPath}`);
    }
    declaredBytes += rawArtifact.byteSize;
    if (declaredBytes > maximumDeclaredBytes) {
      throw new Error("Cloud artifact manifest exceeds the aggregate byte limit.");
    }
    if (!HASH.test(rawArtifact?.sha256 ?? "")) {
      throw new Error(`Cloud artifact hash is invalid: ${artifactPath}`);
    }
    const s3Uri = assertS3Uri(rawArtifact?.s3Uri);
    if (typeof rawArtifact?.contentType !== "string" || !rawArtifact.contentType) {
      throw new Error(`Cloud artifact content type is invalid: ${artifactPath}`);
    }
    artifacts.push(Object.freeze({
      path: artifactPath,
      contentType: rawArtifact.contentType,
      byteSize: rawArtifact.byteSize,
      sha256: rawArtifact.sha256,
      s3Uri,
      producerStage: rawArtifact.producerStage ?? value.stageId,
      required: rawArtifact.required === true,
    }));
  }
  return Object.freeze({
    kind: value.kind,
    schemaVersion: value.schemaVersion,
    sceneId: value.sceneId,
    episodeId: episodeManifest ? value.episodeId : null,
    executionId: value.executionId,
    stageId: value.stageId,
    executionPart: episodeManifest ? value.executionPart ?? "full" : null,
    workerImage: value.workerImage ?? null,
    sourceRevision: value.sourceRevision ?? null,
    generatedAt: value.generatedAt ?? null,
    artifacts: Object.freeze(artifacts),
  });
}

export async function readCloudArtifactManifest(manifestS3Uri, options = {}) {
  const bytes = await readRemoteS3Artifact(manifestS3Uri, {
    ...options,
    maximumBytes: MAXIMUM_MANIFEST_BYTES,
  });
  let value;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    throw new Error("Cloud artifact manifest is not valid JSON.", { cause: error });
  }
  return validateCloudArtifactManifest(value, options);
}

export function cloudArtifactByPath(record, artifactPath) {
  const normalized = portableArtifactPath(artifactPath);
  return Array.isArray(record?.remoteArtifacts)
    ? record.remoteArtifacts.find((artifact) => artifact?.path === normalized) ?? null
    : null;
}

export async function readVerifiedCloudArtifact(record, artifactPath, options = {}) {
  const artifact = cloudArtifactByPath(record, artifactPath);
  if (artifact === null) return null;
  const bytes = await readRemoteS3Artifact(artifact.s3Uri, {
    ...options,
    maximumBytes: Math.min(
      Math.max(artifact.byteSize + 1, 1),
      options.maximumBytes ?? 32 * 1024 * 1024,
    ),
  });
  if (bytes.length !== artifact.byteSize) {
    throw new Error(`Remote artifact byte size mismatch: ${artifactPath}`);
  }
  const observed = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
  if (observed !== artifact.sha256) {
    throw new Error(`Remote artifact hash mismatch: ${artifactPath}`);
  }
  return bytes;
}

export function streamCloudArtifact(response, artifact, {
  repoRoot,
  spawnImplementation = spawn,
  cacheControl = "private, no-store",
  downloadName = null,
} = {}) {
  return new Promise((resolvePromise) => {
    const child = spawnImplementation(
      "aws",
      ["s3", "cp", "--only-show-errors", assertS3Uri(artifact.s3Uri), "-"],
      {
        env: projectAwsEnvironment(repoRoot),
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", (error) => {
      if (!response.headersSent) response.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
      response.end(`Remote artifact unavailable: ${error.message}`);
      resolvePromise(false);
    });
    child.once("close", (code) => {
      if (code !== 0 && !response.headersSent) {
        response.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
        response.end(`Remote artifact unavailable: ${stderr.trim() || `aws exited ${code}`}`);
      }
      resolvePromise(code === 0);
    });
    response.writeHead(200, {
      "content-type": artifact.contentType,
      "content-length": artifact.byteSize,
      "cache-control": cacheControl,
      "x-content-type-options": "nosniff",
      ...(downloadName
        ? { "content-disposition": `attachment; filename="${String(downloadName).replaceAll('"', "")}"` }
        : {}),
    });
    child.stdout.pipe(response);
  });
}

export function redirectToPresignedCloudArtifact(response, artifact, {
  repoRoot,
  expiresSeconds = 900,
  execFileImplementation = execFile,
  downloadName = null,
} = {}) {
  return new Promise((resolvePromise) => {
    execFileImplementation(
      "aws",
      [
        "s3", "presign", assertS3Uri(artifact.s3Uri),
        "--expires-in", String(expiresSeconds),
      ],
      {
        env: projectAwsEnvironment(repoRoot),
        encoding: "utf8",
        maxBuffer: 1024 * 1024,
      },
      (error, stdout, stderr) => {
        const location = String(stdout ?? "").trim();
        if (error || !/^https:\/\//.test(location)) {
          response.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
          response.end(
            `Remote artifact URL unavailable: ${String(stderr || error?.message || "unknown error").trim()}`,
          );
          resolvePromise(false);
          return;
        }
        response.writeHead(307, {
          location,
          "cache-control": "private, no-store",
          ...(downloadName
            ? { "content-disposition": `attachment; filename="${String(downloadName).replaceAll('"', "")}"` }
            : {}),
        });
        response.end();
        resolvePromise(true);
      },
    );
  });
}
