#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { launchCloudSceneWorkerJob } from "./launch-worldkit-cloud-worker-job.mjs";
import { submitCloudScene } from "./submit-worldkit-cloud-scene.mjs";
import { joinS3Uri, uploadS3File } from "../lib/lwdp-generation-client.mjs";

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") continue;
    if (!argument.startsWith("--")) throw new Error(`Unexpected argument: ${argument}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value after ${argument}.`);
    options[argument.slice(2)] = value;
    index += 1;
  }
  return options;
}

function required(value, label) {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} is required.`);
  return value;
}

function boundedInteger(value, fallback, minimum, maximum, label) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${label} must be an integer from ${minimum} to ${maximum}.`);
  }
  return parsed;
}

function sanitizedId(value) {
  return value.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
}

export function selectCloudBatchCases(record, { count = 20, offset = 0 } = {}) {
  if (!Array.isArray(record?.images)) throw new Error("Test-set record images are missing.");
  const admitted = record.images.filter((image) =>
    typeof image?.id === "string" &&
    typeof image?.fileName === "string" &&
    !image.integrityError &&
    !image.duplicateOf);
  const selected = admitted.slice(offset, offset + count);
  if (selected.length !== count) {
    throw new Error(`Test set contains only ${selected.length} admitted images for the requested range.`);
  }
  return selected;
}

async function persistBatchManifest(manifest, manifestPath, batchS3Uri, uploadOptions) {
  await mkdir(dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  await uploadS3File(manifestPath, batchS3Uri, uploadOptions);
}

export async function runCloudSceneBatch({
  testSetRecordPath,
  batchId,
  image,
  outputS3Root,
  count = 20,
  offset = 0,
  manifestPath = resolve(`.codex-tmp/cloud-batches/${batchId}.json`),
  cloudConfig,
  fetchImplementation,
  uploadOptions = {},
  spawnImplementation,
}) {
  required(testSetRecordPath, "test_set_record");
  required(batchId, "batch_id");
  required(image, "image");
  required(outputS3Root, "output_s3_root");
  const recordPath = resolve(testSetRecordPath);
  const serializedRecord = await readFile(recordPath, "utf8");
  const record = JSON.parse(serializedRecord);
  const selected = selectCloudBatchCases(record, { count, offset });
  const testSetHash = `sha256:${createHash("sha256").update(serializedRecord).digest("hex")}`;
  const batchPrefix = joinS3Uri(outputS3Root, batchId);
  const batchManifestS3Uri = joinS3Uri(batchPrefix, "batch-manifest.json");
  const batchSuffix = sanitizedId(batchId).slice(-12) || "batch";
  const manifest = {
    kind: "worldkit-cloud-scene-batch",
    schemaVersion: 1,
    batchId,
    testSetId: record.id,
    testSetName: record.name,
    testSetHash,
    prompt: record.prompt,
    count,
    offset,
    workerImage: image,
    outputS3Prefix: batchPrefix,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    cases: [],
  };
  await persistBatchManifest(manifest, manifestPath, batchManifestS3Uri, uploadOptions);
  for (const selectedImage of selected) {
    const sceneId = `cloud-${sanitizedId(selectedImage.id)}-${batchSuffix}`.slice(0, 80).replace(/-$/, "");
    const requestId = `${batchId}-${selectedImage.id}`;
    const casePrefix = joinS3Uri(batchPrefix, selectedImage.id);
    const caseRecord = {
      imageId: selectedImage.id,
      originalName: selectedImage.originalName,
      sourceContentSha256: selectedImage.contentSha256,
      sceneId,
      requestId,
      outputS3Prefix: casePrefix,
      status: "submitting",
    };
    manifest.cases.push(caseRecord);
    manifest.updatedAt = new Date().toISOString();
    await persistBatchManifest(manifest, manifestPath, batchManifestS3Uri, uploadOptions);
    try {
      const submitted = await submitCloudScene({
        sceneId,
        prompt: record.prompt,
        images: [resolve(dirname(recordPath), selectedImage.fileName)],
        requestId,
        outputS3Prefix: casePrefix,
        cloudConfig,
        fetchImplementation,
        uploadOptions,
      });
      Object.assign(caseRecord, {
        executionId: submitted.executionId,
        requestHash: submitted.requestHash,
        requestS3Uri: submitted.requestS3Uri,
        status: "submitted",
        submittedAt: new Date().toISOString(),
      });
      manifest.updatedAt = new Date().toISOString();
      await persistBatchManifest(manifest, manifestPath, batchManifestS3Uri, uploadOptions);
      const launched = await launchCloudSceneWorkerJob({
        executionId: submitted.executionId,
        requestS3Uri: submitted.requestS3Uri,
        outputS3Prefix: submitted.outputS3Prefix,
        image,
        spawnImplementation,
      });
      Object.assign(caseRecord, {
        jobName: launched.jobName,
        namespace: launched.namespace,
        status: "launched",
        launchedAt: new Date().toISOString(),
      });
    } catch (error) {
      Object.assign(caseRecord, {
        status: caseRecord.executionId ? "launch-failed" : "submit-failed",
        error: error instanceof Error ? error.message : String(error),
      });
    }
    manifest.updatedAt = new Date().toISOString();
    await persistBatchManifest(manifest, manifestPath, batchManifestS3Uri, uploadOptions);
  }
  return { manifest, manifestPath, batchManifestS3Uri };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const count = boundedInteger(options.count, 20, 1, 20, "count");
  const offset = boundedInteger(options.offset, 0, 0, 10_000, "offset");
  const result = await runCloudSceneBatch({
    testSetRecordPath: options["test-set-record"],
    batchId: options["batch-id"],
    image: options.image,
    outputS3Root: options["output-s3-root"],
    count,
    offset,
    manifestPath: options["manifest-path"],
  });
  process.stdout.write(`${JSON.stringify({
    batchId: result.manifest.batchId,
    caseCount: result.manifest.cases.length,
    manifestPath: result.manifestPath,
    batchManifestS3Uri: result.batchManifestS3Uri,
  })}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
