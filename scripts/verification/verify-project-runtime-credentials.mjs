#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const manifest = JSON.parse(await readFile(path.join(
  repoRoot,
  "config/project-runtime-credentials.json",
), "utf8"));

const expectedCredentialIds = new Set([
  "lwdp", "mg-seedance", "seedance25-api", "mediakit", "gemini-env",
  "google-service-account", "aws-credentials", "aws-config", "studio-public",
]);
if (manifest.kind !== "worldkit-project-runtime-credentials-manifest" ||
    manifest.schemaVersion !== 1 || manifest.projectLocalOnly !== true ||
    manifest.allowEnvironmentCredentialOverrides !== false ||
    !Array.isArray(manifest.files) ||
    manifest.files.length !== expectedCredentialIds.size ||
    new Set(manifest.files.map((item) => item?.id)).size !==
      expectedCredentialIds.size ||
    manifest.files.some((item) => !expectedCredentialIds.has(item?.id))) {
  throw new Error("Project runtime credential manifest is invalid.");
}

const resolvedFiles = new Map();
for (const item of manifest.files) {
  const absolute = path.resolve(repoRoot, item.path);
  if (path.relative(repoRoot, absolute).startsWith("..") || path.isAbsolute(item.path)) {
    throw new Error(`Credential escaped project root: ${item.id}`);
  }
  const metadata = await lstat(absolute);
  if (!metadata.isFile() || metadata.isSymbolicLink() ||
      metadata.size < item.minimumBytes || (metadata.mode & 0o077) !== 0) {
    throw new Error(`Credential is missing, unsafe, or too small: ${item.id}`);
  }
  execFileSync("git", ["check-ignore", "-q", item.path], { cwd: repoRoot });
  resolvedFiles.set(item.id, absolute);
}

const parseEnv = (contents) => Object.fromEntries(contents.split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#") && line.includes("="))
  .map((line) => {
    const split = line.indexOf("=");
    return [line.slice(0, split).trim(), line.slice(split + 1).trim().replace(/^['"]|['"]$/g, "")];
  }));
const requireKeys = async (id, keys) => {
  const values = parseEnv(await readFile(resolvedFiles.get(id), "utf8"));
  if (keys.some((key) => typeof values[key] !== "string" || values[key].length === 0)) {
    throw new Error(`Credential fields are incomplete: ${id}`);
  }
  return values;
};

await requireKeys("lwdp", ["LWDP_GENERATION_API_TOKEN", "LWDP_API_BASE", "LWDP_USER_ID"]);
await requireKeys("aws-credentials", ["aws_access_key_id", "aws_secret_access_key"]);
await requireKeys("studio-public", ["WORLDKIT_ACCESS_KEY"]);
const gemini = await requireKeys("gemini-env", [
  "GOOGLE_APPLICATION_CREDENTIALS",
  "WORLDKIT_GEMINI_PROMPT_MODEL",
  "WORLDKIT_GEMINI_IMAGE_MODEL",
]);
if (gemini.GOOGLE_APPLICATION_CREDENTIALS !==
    ".codex-tmp/runtime-config/google-service-account.json") {
  throw new Error("Gemini credential path must be project-relative and canonical.");
}
const serviceAccount = JSON.parse(await readFile(
  resolvedFiles.get("google-service-account"),
  "utf8",
));
if (serviceAccount.type !== "service_account" || !serviceAccount.project_id ||
    !serviceAccount.client_email || !serviceAccount.private_key) {
  throw new Error("Google service-account credential is incomplete.");
}

const videoPipeline = JSON.parse(await readFile(path.join(
  repoRoot,
  "config/episode-video-pipeline.json",
), "utf8"));
const requiredBindings = [
  [videoPipeline.seedanceProvider?.credentialFile, "seedance25-api"],
];
const fallbackVideoPipeline = JSON.parse(await readFile(path.join(
  repoRoot,
  videoPipeline.fallback?.pipelineConfigPath ?? "",
), "utf8"));
requiredBindings.push([
  fallbackVideoPipeline.seedanceProvider?.credentialFile,
  "mg-seedance",
]);
for (const [configuredPath, id] of requiredBindings) {
  const declared = manifest.files.find((item) => item.id === id)?.path;
  if (configuredPath !== declared) {
    throw new Error(`Runtime config binding drifted: ${id}`);
  }
}
if (videoPipeline.seedanceProvider?.kind !== "seedance-2.5-direct-api" ||
    videoPipeline.seedance?.model !== "seedance-2.5" ||
    videoPipeline.seedance?.resolution !== "720p" ||
    fallbackVideoPipeline.seedanceProvider?.kind !== "mg-seedance-2.5-plus-cf-upscale" ||
    fallbackVideoPipeline.seedance?.model !== "mg-seedance-2.5-480p" ||
    fallbackVideoPipeline.seedance?.resolution !== "480p" ||
    fallbackVideoPipeline.upscale?.model !== "cf-超分-720p-30s" ||
    fallbackVideoPipeline.upscale?.resolution !== "720p") {
  throw new Error("Episode video pipeline must default to direct Seedance 2.5 and fall back to MG 480p plus CF 720p.");
}

process.stdout.write(
  `WORLDKIT_PROJECT_RUNTIME_CONFIG_OK files=${manifest.files.length} project_local_only=true\n`,
);
