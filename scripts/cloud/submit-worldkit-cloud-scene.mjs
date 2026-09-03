#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, extname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import {
  cloudExecutionRecord,
  createCloudExecution,
  dispatchCloudExecution,
} from "../lib/lwdp-cloud-execution-client.mjs";
import {
  assertS3Uri,
  joinS3Uri,
  uploadS3File,
} from "../lib/lwdp-generation-client.mjs";
import { sha256File } from "../lib/worldkit-cloud-artifacts.mjs";

const imageTypes = Object.freeze({
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
});

function parseArgs(argv) {
  const options = { images: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") continue;
    if (argument === "--no-dispatch") {
      options.dispatch = false;
      continue;
    }
    if (!argument.startsWith("--")) throw new Error(`Unexpected argument: ${argument}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value after ${argument}.`);
    if (argument === "--image") options.images.push(value);
    else options[argument.slice(2)] = value;
    index += 1;
  }
  return options;
}

function required(value, label) {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} is required.`);
  return value;
}

function contentTypeForImage(filePath) {
  const contentType = imageTypes[extname(filePath).toLowerCase()];
  if (!contentType) throw new Error(`Unsupported reference image: ${filePath}`);
  return contentType;
}

export async function submitCloudScene({
  sceneId,
  prompt,
  promptFile,
  images = [],
  requestId,
  outputS3Prefix,
  autoDispatch = true,
  cloudConfig,
  fetchImplementation,
  uploadOptions = {},
  requestPath = undefined,
}) {
  if (!/^[a-z0-9][a-z0-9-]{2,79}$/.test(String(sceneId ?? ""))) {
    throw new Error("scene_id must be 3-80 lowercase letters, numbers, or hyphens.");
  }
  required(requestId, "request_id");
  const resolvedOutputPrefix = assertS3Uri(outputS3Prefix);
  const resolvedPrompt = promptFile ? await readFile(resolve(promptFile), "utf8") : prompt;
  required(resolvedPrompt, "prompt");
  const references = [];
  for (const [index, image] of images.entries()) {
    const absolutePath = resolve(image);
    const extension = extname(absolutePath).toLowerCase();
    const fileName = `reference-${index}${extension === ".jpeg" ? ".jpg" : extension}`;
    const s3Uri = joinS3Uri(resolvedOutputPrefix, "inputs", "references", fileName);
    const sha256 = await sha256File(absolutePath);
    await uploadS3File(absolutePath, s3Uri, uploadOptions);
    references.push({
      fileName,
      contentType: contentTypeForImage(absolutePath),
      byteName: basename(absolutePath),
      sha256,
      s3Uri,
    });
  }
  const request = {
    kind: "worldkit-cloud-scene-request",
    schemaVersion: 1,
    sceneId,
    prompt: resolvedPrompt.trim(),
    references,
  };
  const serializedRequest = `${JSON.stringify(request, null, 2)}\n`;
  const requestHash = `sha256:${createHash("sha256").update(serializedRequest).digest("hex")}`;
  const temporaryRoot = requestPath ? undefined : await mkdtemp(`${tmpdir()}/worldkit-cloud-request-`);
  const localRequestPath = requestPath ?? resolve(temporaryRoot, "request.json");
  await mkdir(dirname(localRequestPath), { recursive: true });
  await writeFile(localRequestPath, serializedRequest, { mode: 0o600 });
  const requestS3Uri = joinS3Uri(resolvedOutputPrefix, "inputs", "request.json");
  await uploadS3File(localRequestPath, requestS3Uri, uploadOptions);
  const inputs = [
    {
      role: "worldkit-cloud-scene-request",
      path: "inputs/request.json",
      s3_uri: requestS3Uri,
      content_type: "application/json",
    },
    ...references.map((reference) => ({
      role: "user-reference-image",
      path: `inputs/references/${reference.fileName}`,
      s3_uri: reference.s3Uri,
      content_type: reference.contentType,
    })),
  ];
  const payload = {
    kind: "scene",
    scene_id: sceneId,
    request_id: requestId,
    output_s3_prefix: resolvedOutputPrefix,
    max_concurrency: 1,
    auto_dispatch: autoDispatch,
    inputs,
    stages: [{
      stage_id: "scene-production",
      executor: "worker",
      max_attempts: 3,
      timeout_seconds: 21_600,
    }],
  };
  let execution;
  try {
    const createdPayload = await createCloudExecution(payload, {
      config: cloudConfig,
      fetchImplementation,
    });
    execution = cloudExecutionRecord(createdPayload);
    if (autoDispatch && execution.status === "queued") {
      await dispatchCloudExecution(execution.execution_id, {
        config: cloudConfig,
        fetchImplementation,
      });
    }
  } finally {
    if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true });
  }
  return {
    executionId: execution.execution_id,
    sceneId,
    requestId,
    requestHash,
    requestS3Uri,
    outputS3Prefix: resolvedOutputPrefix,
    status: execution.status,
  };
}

export async function submitCloudSceneFromExistingRequest({
  sceneId,
  sourceRequestSource,
  sourceRequestS3Uri,
  requestId,
  outputS3Prefix,
  autoDispatch = true,
  cloudConfig,
  fetchImplementation,
}) {
  if (!/^[a-z0-9][a-z0-9-]{2,79}$/.test(String(sceneId ?? ""))) {
    throw new Error("scene_id must be 3-80 lowercase letters, numbers, or hyphens.");
  }
  required(requestId, "request_id");
  required(sourceRequestSource, "source_request_source");
  const requestS3Uri = assertS3Uri(sourceRequestS3Uri);
  const resolvedOutputPrefix = assertS3Uri(outputS3Prefix);
  let sourceRequest;
  try {
    sourceRequest = JSON.parse(sourceRequestSource);
  } catch (error) {
    throw new Error("The prior Cloud Scene request is not valid JSON.", { cause: error });
  }
  if (
    sourceRequest?.kind !== "worldkit-cloud-scene-request" ||
    sourceRequest.schemaVersion !== 1 ||
    sourceRequest.sceneId !== sceneId ||
    typeof sourceRequest.prompt !== "string" ||
    !Array.isArray(sourceRequest.references)
  ) throw new Error("The prior Cloud Scene request does not match the rebuilt Scene.");
  const references = sourceRequest.references.map((reference, index) => {
    if (
      typeof reference?.fileName !== "string" ||
      typeof reference?.contentType !== "string" ||
      typeof reference?.sha256 !== "string" ||
      typeof reference?.s3Uri !== "string"
    ) throw new Error(`The prior Cloud Scene reference ${index} is incomplete.`);
    return {
      role: "user-reference-image",
      path: `inputs/references/${reference.fileName}`,
      s3_uri: assertS3Uri(reference.s3Uri),
      content_type: reference.contentType,
    };
  });
  const payload = {
    kind: "scene",
    scene_id: sceneId,
    request_id: requestId,
    output_s3_prefix: resolvedOutputPrefix,
    max_concurrency: 1,
    auto_dispatch: autoDispatch,
    inputs: [{
      role: "worldkit-cloud-scene-request",
      path: "inputs/request.json",
      s3_uri: requestS3Uri,
      content_type: "application/json",
    }, ...references],
    stages: [{
      stage_id: "scene-production",
      executor: "worker",
      max_attempts: 3,
      timeout_seconds: 21_600,
    }],
  };
  const createdPayload = await createCloudExecution(payload, {
    config: cloudConfig,
    fetchImplementation,
  });
  const execution = cloudExecutionRecord(createdPayload);
  if (autoDispatch && execution.status === "queued") {
    await dispatchCloudExecution(execution.execution_id, {
      config: cloudConfig,
      fetchImplementation,
    });
  }
  return {
    executionId: execution.execution_id,
    sceneId,
    requestId,
    requestHash: `sha256:${createHash("sha256").update(sourceRequestSource).digest("hex")}`,
    requestS3Uri,
    outputS3Prefix: resolvedOutputPrefix,
    status: execution.status,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await submitCloudScene({
    sceneId: options["scene-id"],
    prompt: options.prompt,
    promptFile: options["prompt-file"],
    images: options.images,
    requestId: options["request-id"],
    outputS3Prefix: options["output-s3-prefix"],
    autoDispatch: options.dispatch !== false,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
