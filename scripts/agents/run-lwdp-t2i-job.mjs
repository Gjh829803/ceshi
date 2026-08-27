#!/usr/bin/env node
import { createHash, randomBytes } from "node:crypto";
import { extname, resolve } from "node:path";
import { readFile, stat } from "node:fs/promises";

import {
  assertSuccessfulJob,
  downloadS3FileAtomic,
  fetchGenerationItems,
  joinS3Uri,
  loadLwdpGenerationConfig,
  pollGenerationJob,
  salvageableGenerationItemIds,
  submitGenerationJob,
  submittedJobId,
  uploadS3File,
} from "../lib/lwdp-generation-client.mjs";

function parseArguments(argv) {
  const result = { downloads: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === "--download") {
      if (value === undefined) throw new Error("Missing value after --download.");
      result.downloads.push(value);
      index += 1;
    } else if (key === "--dry-run") {
      result.dryRun = true;
    } else if (key?.startsWith("--")) {
      if (value === undefined) throw new Error(`Missing value after ${key}.`);
      result[key.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
      index += 1;
    } else {
      throw new Error(`Unsupported argument: ${key}`);
    }
  }
  return result;
}

function safeItemId(value) {
  if (!/^[a-z0-9][a-z0-9-]{2,79}$/.test(value ?? "")) throw new Error(`Invalid T2I item id: ${value}`);
  return value;
}

const args = parseArguments(process.argv.slice(2));
if (!args.manifest) throw new Error("--manifest is required.");
if (!args.outputS3Prefix) throw new Error("--output-s3-prefix is required.");
const manifest = JSON.parse(await readFile(resolve(args.manifest), "utf8"));
if (!Array.isArray(manifest.items) || manifest.items.length === 0) throw new Error("T2I manifest.items is required.");
const smokeMode = process.env.WORLDKIT_LWDP_CLIENT_SMOKE === "1";

const uploadedByPath = new Map();
async function uploadReference(reference) {
  const absolutePath = resolve(reference.path);
  if (uploadedByPath.has(absolutePath)) return uploadedByPath.get(absolutePath);
  const metadata = await stat(absolutePath);
  if (!metadata.isFile() || metadata.size === 0) throw new Error(`Reference is not a non-empty file: ${absolutePath}`);
  const bytes = await readFile(absolutePath);
  const digest = createHash("sha256").update(bytes).digest("hex");
  const suffix = extname(absolutePath).toLowerCase();
  const uri = joinS3Uri(args.outputS3Prefix, "inputs", "references", `${digest}${suffix}`);
  if (!smokeMode) await uploadS3File(absolutePath, uri);
  const uploaded = {
    s3_uri: uri,
    role: reference.role || "reference",
    name: reference.name || `reference-${digest.slice(0, 12)}`,
    ...(reference.description ? { description: reference.description } : {}),
  };
  uploadedByPath.set(absolutePath, uploaded);
  return uploaded;
}

const items = [];
for (const rawItem of manifest.items) {
  const id = safeItemId(rawItem.id);
  const referenceImages = [];
  for (const reference of rawItem.referenceImages || []) {
    referenceImages.push(await uploadReference(reference));
  }
  items.push({
    id,
    prompt: String(rawItem.prompt || ""),
    short_prompt: String(rawItem.shortPrompt || rawItem.short_prompt || rawItem.prompt || "").slice(0, 500),
    orientation: rawItem.orientation || "横图",
    ...(rawItem.width ? { width: Number(rawItem.width) } : {}),
    ...(rawItem.height ? { height: Number(rawItem.height) } : {}),
    ...(referenceImages.length ? { reference_images: referenceImages } : {}),
  });
}
if (items.some((item) => !item.prompt)) throw new Error("Every T2I item requires a prompt.");

const runToken = `${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`;
const payload = {
  pipeline: "t2i",
  job_name: args.jobName || `worldkit images ${runToken}`,
  request_id: args.requestId || `worldkit-images-${runToken}`,
  output_s3_prefix: args.outputS3Prefix,
  width: Number(manifest.width || 1536),
  height: Number(manifest.height || 1024),
  items,
  dry_run: Boolean(args.dryRun),
  options: {
    account_concurrency: Number(process.env.WORLDKIT_LWDP_ACCOUNT_CONCURRENCY || 20),
    pod_concurrency: Number(process.env.WORLDKIT_LWDP_POD_CONCURRENCY || 32),
    max_pods: Number(process.env.WORLDKIT_LWDP_MAX_PODS || 50),
    codex_image_tool: "system_image_gen",
    max_reference_images_per_item: Number(manifest.maxReferenceImagesPerItem || 8),
  },
};

const submitAttempts = Number(args.submitAttempts || 1);
if (submitAttempts !== 1) {
  throw new Error("WorldKit T2I stages submit each LWDP creation request exactly once.");
}

if (smokeMode) {
  process.stdout.write(`WORLDKIT_LWDP_T2I_SMOKE items=${items.length} references=${uploadedByPath.size} submitAttempts=${submitAttempts}\n`);
  process.exit(0);
}

const config = await loadLwdpGenerationConfig();
const submitted = await submitGenerationJob(payload, { config, maxAttempts: submitAttempts });
const jobId = submittedJobId(submitted);
process.stdout.write(`WORLDKIT_LWDP_IMAGE_JOB ${args.stage || "image-generation"} ${jobId} items=${items.length}\n`);
if (args.dryRun) {
  process.stdout.write(`WORLDKIT_LWDP_IMAGE_DRY_RUN ${jobId}\n`);
  process.exit(0);
}
const job = await pollGenerationJob(jobId, {
  config,
  onProgress: (current) => process.stdout.write(
    `WORLDKIT_LWDP_IMAGE_PROGRESS ${current.status} ${JSON.stringify(current.counters || {})}\n`,
  ),
});
const jobItems = await fetchGenerationItems(jobId, { config });
const parsedDownloads = args.downloads.map((rawDownload) => {
  const separator = rawDownload.indexOf("::");
  if (separator <= 0) throw new Error("--download must be <item-id>::<local-path>.");
  return {
    id: safeItemId(rawDownload.slice(0, separator)),
    localPath: resolve(rawDownload.slice(separator + 2)),
  };
});
const salvageableItemIds = salvageableGenerationItemIds(jobItems);
const requestedDownloadIds = new Set(parsedDownloads.map(({ id }) => id));
const unverifiableSalvage = [...salvageableItemIds].filter(
  (itemId) => !requestedDownloadIds.has(itemId),
);
if (unverifiableSalvage.length > 0) {
  throw new Error(
    `LWDP salvaged outputs without a declared local download target: ${unverifiableSalvage.join(", ")}`,
  );
}
const effectiveItems = {
  ...jobItems,
  items: (jobItems?.items ?? jobItems?.data ?? []).map((item) =>
    salvageableItemIds.has(item?.item_id || item?.id)
      ? { ...item, status: "succeeded", error: "" }
      : item),
};
assertSuccessfulJob(job, effectiveItems, items.map(({ id }) => id));

for (const { id, localPath } of parsedDownloads) {
  await downloadS3FileAtomic(joinS3Uri(args.outputS3Prefix, "images", `${id}.png`), localPath);
}
if (salvageableItemIds.size > 0) {
  process.stdout.write(
    `WORLDKIT_LWDP_IMAGE_SALVAGED ${[...salvageableItemIds].sort().join(",")}\n`,
  );
}
process.stdout.write(`WORLDKIT_LWDP_IMAGE_READY items=${items.length}\n`);
